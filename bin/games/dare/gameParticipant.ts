/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Player state within a dare game.
 *
 * Before refactoring, these were 8 separate maps in Dare.ts:
 * 1. playersInGame - Set of member IDs
 * 2. playerStripped - Map<MemberNumber, strippedCount>
 * 3. playerBondage - Map<MemberNumber, bondageList>
 * 4. playerForfeit - Map<MemberNumber, count>
 * 5. playerTurnsSkipped - Map<MemberNumber, count>
 * 6. playerScore - Map<MemberNumber, score>
 * 7. playerMissedTurns - Map<MemberNumber, count>
 * 8. playerCurrentDare - Map<MemberNumber, dareId>
 *
 * Now consolidated into single GameParticipant object for:
 * - Type safety: All fields strongly typed
 * - Atomicity: State updates affect all fields consistently
 * - Testability: Single object easier to mock and validate
 * - Clarity: Relationship between fields is explicit
 * - Refactoring: Changes to player state are localized
 */
export interface GameParticipant {
    // Basic identification
    memberId: number;
    memberName: string;

    // Game participation status
    isActive: boolean;
    joinedAt: number; // Unix timestamp when joined

    // Stripping state
    strippedCount: number; // Number of items removed
    maxStripCount: number; // Max items that can be stripped

    // Bondage state
    bondageItems: Array<{
        itemId: string;
        itemName: string;
        appliedAt: number; // When bondage was applied
        expiresAt: number | null; // When it expires (null = permanent)
        canRedress: boolean; // Whether player can remove it
    }>;

    // Dare-specific metrics
    forfeitsCount: number; // Times player forfeited dare
    passCounts: number; // Times player passed on a dare (used for pillory escalation)
    turnsSkipped: number; // Times turn was skipped
    missedTurns: number; // Times player missed turn while disconnected
    score: number; // Game score
    bindCounts: number; // Bondage items applied to this player

    // Dressing block state
    dressingBlocked: boolean; // True if player can't get dressed
    dressingBlockedCap: number | undefined; // Cap level (undefined = all items blocked)

    // Current state
    currentDareId: string | null; // If null, no active dare
    currentDareDrawnAt: number | null; // When dare was drawn
    isDisconnected: boolean; // True if player disconnected
    disconnectedAt: number | null; // When disconnection was detected
}

/**
 * Factory function to create a new game participant.
 *
 * @param memberId - The player's member ID
 * @param memberName - The player's display name
 */
export function createGameParticipant(
    memberId: number,
    memberName: string,
): GameParticipant {
    return {
        memberId,
        memberName,
        isActive: true,
        joinedAt: Date.now(),

        strippedCount: 0,
        maxStripCount: 10, // Default max items

        bondageItems: [],

        forfeitsCount: 0,
        passCounts: 0,
        turnsSkipped: 0,
        missedTurns: 0,
        score: 0,
        bindCounts: 0,

        dressingBlocked: false,
        dressingBlockedCap: undefined,

        currentDareId: null,
        currentDareDrawnAt: null,
        isDisconnected: false,
        disconnectedAt: null,
    };
}

/**
 * Manages all participants in a dare game.
 *
 * Replaces:
 * - 8 separate maps scattered throughout Dare.ts
 * - Complex lookups across multiple maps
 * - Risk of data inconsistency when updating player state
 *
 * With:
 * - Single participants Map<MemberNumber, GameParticipant>
 * - Atomic updates via getParticipant()
 * - Validation methods for state changes
 */
export class GameParticipantManager {
    private participants = new Map<number, GameParticipant>();

    /**
     * Add a participant to the game.
     * Returns false if participant already exists.
     */
    public addParticipant(
        memberId: number,
        memberName: string,
    ): GameParticipant | null {
        if (this.participants.has(memberId)) {
            return null;
        }

        const participant = createGameParticipant(memberId, memberName);
        this.participants.set(memberId, participant);
        return participant;
    }

    /**
     * Get a participant by member ID.
     * Returns undefined if not found.
     */
    public getParticipant(memberId: number): GameParticipant | undefined {
        return this.participants.get(memberId);
    }

    /**
     * Remove a participant from the game.
     * Returns true if removed, false if not found.
     */
    public removeParticipant(memberId: number): boolean {
        return this.participants.delete(memberId);
    }

    /**
     * Get all active participants.
     */
    public getActive(): GameParticipant[] {
        return Array.from(this.participants.values()).filter((p) => p.isActive);
    }

    /**
     * Get all disconnected participants.
     */
    public getDisconnected(): GameParticipant[] {
        return Array.from(this.participants.values()).filter(
            (p) => p.isDisconnected,
        );
    }

    /**
     * Get all participants (active and inactive).
     */
    public getAll(): GameParticipant[] {
        return Array.from(this.participants.values());
    }

    /**
     * Check if a participant exists.
     */
    public has(memberId: number): boolean {
        return this.participants.has(memberId);
    }

    /**
     * Get participant count (active only).
     */
    public getActiveCount(): number {
        return this.getActive().length;
    }

    /**
     * Get participant count (all).
     */
    public getTotalCount(): number {
        return this.participants.size;
    }

    /**
     * Strip an item from participant.
     * Increments strippedCount, returns true if under maxStripCount.
     */
    public stripParticipant(memberId: number): boolean {
        const participant = this.getParticipant(memberId);
        if (
            !participant ||
            participant.strippedCount >= participant.maxStripCount
        ) {
            return false;
        }

        participant.strippedCount++;
        return true;
    }

    /**
     * Add bondage item to participant.
     */
    public addBondage(
        memberId: number,
        itemId: string,
        itemName: string,
        expiresAt: number | null = null,
        canRedress: boolean = false,
    ): boolean {
        const participant = this.getParticipant(memberId);
        if (!participant) {
            return false;
        }

        participant.bondageItems.push({
            itemId,
            itemName,
            appliedAt: Date.now(),
            expiresAt,
            canRedress,
        });

        return true;
    }

    /**
     * Remove bondage item from participant.
     * Returns true if removed, false if not found.
     */
    public removeBondage(memberId: number, itemId: string): boolean {
        const participant = this.getParticipant(memberId);
        if (!participant) {
            return false;
        }

        const beforeLen = participant.bondageItems.length;
        participant.bondageItems = participant.bondageItems.filter(
            (b) => b.itemId !== itemId,
        );

        return participant.bondageItems.length < beforeLen;
    }

    /**
     * Get bondage items for participant.
     */
    public getBondageItems(
        memberId: number,
    ): GameParticipant["bondageItems"] | undefined {
        return this.getParticipant(memberId)?.bondageItems;
    }

    /**
     * Record that participant forfeited.
     */
    public recordForfeit(memberId: number): boolean {
        const participant = this.getParticipant(memberId);
        if (!participant) {
            return false;
        }

        participant.forfeitsCount++;
        return true;
    }

    /**
     * Record that participant's turn was skipped.
     */
    public recordSkippedTurn(memberId: number): boolean {
        const participant = this.getParticipant(memberId);
        if (!participant) {
            return false;
        }

        participant.turnsSkipped++;
        return true;
    }

    /**
     * Record missed turn while disconnected.
     */
    public recordMissedTurn(memberId: number): boolean {
        const participant = this.getParticipant(memberId);
        if (!participant) {
            return false;
        }

        participant.missedTurns++;
        return true;
    }

    /**
     * Update score for participant.
     */
    public updateScore(memberId: number, delta: number): boolean {
        const participant = this.getParticipant(memberId);
        if (!participant) {
            return false;
        }

        participant.score += delta;
        return true;
    }

    /**
     * Set current dare for participant.
     */
    public setCurrentDare(memberId: number, dareId: string | null): boolean {
        const participant = this.getParticipant(memberId);
        if (!participant) {
            return false;
        }

        participant.currentDareId = dareId;
        if (dareId) {
            participant.currentDareDrawnAt = Date.now();
        } else {
            participant.currentDareDrawnAt = null;
        }

        return true;
    }

    /**
     * Mark participant as disconnected.
     */
    public markDisconnected(memberId: number): boolean {
        const participant = this.getParticipant(memberId);
        if (!participant) {
            return false;
        }

        participant.isDisconnected = true;
        participant.disconnectedAt = Date.now();
        return true;
    }

    /**
     * Mark participant as reconnected.
     */
    public markReconnected(memberId: number): boolean {
        const participant = this.getParticipant(memberId);
        if (!participant) {
            return false;
        }

        participant.isDisconnected = false;
        participant.disconnectedAt = null;
        return true;
    }

    /**
     * Deactivate participant (without removing).
     */
    public deactivate(memberId: number): boolean {
        const participant = this.getParticipant(memberId);
        if (!participant) {
            return false;
        }

        participant.isActive = false;
        return true;
    }

    /**
     * Clear all participants.
     */
    public clear(): void {
        this.participants.clear();
    }

    /**
     * Get state snapshot for persistence.
     */
    public getState(): GameParticipant[] {
        return JSON.parse(JSON.stringify(this.getAll()));
    }

    /**
     * Restore state from snapshot.
     */
    public restoreState(state: GameParticipant[]): void {
        this.clear();
        for (const participant of state) {
            this.participants.set(participant.memberId, { ...participant });
        }
    }
}
