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

import { BC_AppearanceItem, ChatRoomMapPos } from "bc-bot";
import { ObjectId } from "mongodb";

// ===== CASINO STATE
export interface CasinoState {
    chips: number;
    score: number;
    winStreak: number;
    lossStreak: number;
    cheatStrikes: number;
    totalWins: number;
    totalLosses: number;
    lastDailyClaimAt?: number;
    lastGamePlayedAt?: number;
    // Phase 3: Chip Locking (when player is bonded or caged)
    lockedChips: number; // Chips that cannot be spent while bonded
    chipLockReason?: "bondage" | "parole" | "cage"; // Why chips are locked
    chipLockUntil?: number; // When lock expires (timestamp), undefined = until bondage removed
    recentWinnings: number; // Track recent wins that get locked
    version: number;
    updatedAt: number;
}

// ===== DARE STATE
export interface DareBondageItem {
    forfeitKey: string;
    appliedAt: number;
    lockedUntil: number;
    appliedBy?: number; // memberNumber
}

export interface DareGameParticipation {
    gameId: number;
    joinedAt: number;
    leftAt?: number;
    strippedCount: number;
    passCounts: number;
    bondageItems: DareBondageItem[];
}

export interface DareState {
    gameIds: number[]; // Currently active games
    participationHistory: DareGameParticipation[];
    activeBondage: DareBondageItem[];
    dressingBlocked?: number; // Until timestamp
    dressingBlockedUntil?: number;
    totalGamesPlayed: number;
    totalDaresCompleted: number;
    version: number;
    updatedAt: number;
}

// ===== VERATOWN STATE
export interface CageSession {
    enteredAt: number;
    releasedAt?: number;
    duration: number;
    cageName: string;
    detailedBy?: number; // memberNumber
}

export interface KennelSession {
    enteredAt: number;
    releasedAt?: number;
    totalTime: number;
}

export interface CurrentRestraint {
    itemName: string;
    group: string;
    equippedAt: number;
    lockedUntil?: number;
}

export interface RoleplayFlags {
    isEscaped?: boolean;
    isRestrained?: boolean;
    isFrozen?: boolean;
    lastFlagChange: number;
}

export interface RemovedBondageItem {
    group: string;
    name: string;
    lockType?: string;
    lockedBy?: string;
    color?: string;
    difficulty?: number;
}

export interface ReleaseParoleState {
    isOnParole: boolean;
    paroleStartedAt?: number;
    paroleExpiresAt?: number;
    removedBondageItems?: RemovedBondageItem[];
    releasedFromLocation?: ChatRoomMapPos;
}

export interface AuditLogEntry {
    action: string;
    performedBy?: number;
    performedAt: number;
    details?: Record<string, unknown>;
}

export interface VeratownState {
    lastPosition?: ChatRoomMapPos;
    lastPositionAt: number;
    currentAppearance?: BC_AppearanceItem[];
    lastAppearanceAt: number;
    cageIncarcerations: CageSession[];
    totalTimeInCages: number;
    kennelSessions: KennelSession[];
    totalTimeInKennels: number;
    currentRestraints: CurrentRestraint[];
    releaseParoleState?: ReleaseParoleState;
    roleplayFlags: RoleplayFlags;
    auditLog: AuditLogEntry[];
    roles: string[];
    version: number;
    updatedAt: number;
}

// ===== CROSS-SYSTEM STATE
export interface CrossSystemState {
    recentEvents: GameEvent[];
    features: {
        canBetChipsToEscape?: boolean;
        autoLockWinnings?: boolean;
        cageBlocksGames?: boolean;
    };
    relationships: {
        bondedWith?: number[]; // memberNumbers of people bonded with this character
        cageFriends?: number[];
    };
    updatedAt: number;
}

// ===== UNIFIED CHARACTER PROFILE (Main MongoDB document)
export interface UnifiedCharacterProfile {
    _id: number; // memberNumber (primary key)
    name: string;
    createdAt: number;

    // System-specific state
    casino: CasinoState;
    dare: DareState;
    veratown: VeratownState;

    // Cross-system state
    crossSystem: CrossSystemState;

    // Metadata
    lastAccessedAt: number;
    lastAccessedBy?: "casino" | "dare" | "veratown" | "admin";
    updatedAt: number;
    version: number;
}

// ===== GAME EVENTS (Cross-system communication)
export interface GameEvent {
    _id?: ObjectId;
    timestamp: number;
    type:
        | "chip_transfer"
        | "chips_earned"
        | "chips_lost"
        | "chips_locked" // Phase 3: Chips locked (e.g., when bonded)
        | "chips_unlocked" // Phase 3: Chips unlocked
        | "escape_payment" // Phase 3: Player paid chips to escape bondage
        | "bondage_applied"
        | "bondage_removed"
        | "cage_entry"
        | "cage_exit"
        | "kennel_entry"
        | "kennel_exit"
        | "game_joined"
        | "game_left"
        | "dare_drawn"
        | "dare_completed"
        | "parole_violated"
        | "position_changed"
        | "character_frozen"
        | "character_unfrozen";
    source: "casino" | "dare" | "veratown" | "admin";
    actor: number; // memberNumber of who caused this
    target: number; // memberNumber affected
    data: Record<string, unknown>;
    processed: boolean;
    processedBy?: ("casino" | "dare" | "veratown")[];
}

// ===== CASINO VIEW (What Casino system sees)
export interface CasinoView {
    memberNumber: number;
    name: string;
    chips: number;
    score: number;
    winStreak: number;
    lossStreak: number;
    cheatStrikes: number;
    lastDailyClaimAt?: number;
}

// ===== DARE VIEW (What Dare system sees)
export interface DareView {
    memberNumber: number;
    name: string;
    gameIds: number[];
    activeBondage: DareBondageItem[];
    dressingBlockedUntil?: number;
    totalGamesPlayed: number;
}

// ===== VERATOWN VIEW (What Veratown system sees)
export interface VeratownView {
    memberNumber: number;
    name: string;
    lastPosition?: ChatRoomMapPos;
    currentAppearance?: BC_AppearanceItem[];
    currentRestraints: CurrentRestraint[];
    releaseParoleState?: ReleaseParoleState;
    roles: string[];
    auditLog: AuditLogEntry[];
}
