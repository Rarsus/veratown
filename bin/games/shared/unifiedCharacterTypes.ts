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

import { BC_AppearanceItem } from "bc-bot";
import { ObjectId } from "mongodb";

// ===== SHARED TYPES
export type ChatRoomMapPos = { X: number; Y: number };

export interface CharacterBio {
    title?: string;
    description?: string;
    status?: string;
    pronouns?: string;
    updatedAt: number;
    version: number;
}

export type CharacterBioUpdate = Pick<
    CharacterBio,
    "title" | "description" | "status" | "pronouns"
>;

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

// Phase 3.3: Game Suspension (when player is caged)
export interface SuspendedGame {
    gameId: number;
    suspendedAt: number;
    suspendReason: "cage_entry" | "manual";
    playerSnapshot: DareGameParticipation;
    gameStateSnapshot?: Record<string, unknown>; // Store relevant game state
}

export interface DareState {
    gameIds: number[]; // Currently active games
    participationHistory: DareGameParticipation[];
    activeBondage: DareBondageItem[];
    suspendedGames: SuspendedGame[]; // Games suspended while caged (Phase 3.3)
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

export interface KeypadAccessRecord {
    doorKey: string; // "prison_cell_1_door", unique identifier for a door
    groupName: string; // "admin", "whitelist", "maintenance", etc.
    grantedAt: number; // Timestamp when access was granted
    grantedBy: number; // memberNumber of admin who granted access
    grantedReason?: string; // "Role assignment", "Custom grant", etc.
    expiresAt?: number; // Optional expiration timestamp
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
    // Keypad access records (Layer 1: Character-specific)
    keypadAccess: KeypadAccessRecord[];
    version: number;
    updatedAt: number;
}

// ===== PROGRESSION STATE (Phase 2A.7)
export interface ProgressionRewardRecord {
    rewardKey: string;
    source: string;
    amount: number;
    awardedAt: number;
}

export interface ProgressionState {
    level: number;
    totalXp: number;
    // Reward keys already applied. Used to guarantee rewards cannot be
    // duplicated when a mutation is retried after a transient failure.
    claimedRewards: ProgressionRewardRecord[];
    updatedAt: number;
    version: number;
}

export interface ProgressionAwardResult {
    applied: boolean;
    duplicate: boolean;
    totalXp: number;
    level: number;
    leveledUp: boolean;
}

export interface ProgressionRollbackResult {
    applied: boolean;
    totalXp: number;
    level: number;
}

// ===== CROSS-SYSTEM STATE
export interface CrossSystemState {
    recentEvents: GameEvent[];
    inventory: MutationInventoryItem[];
    effects: AppliedEffect[];
    bondageLevel: number;
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

export interface MutationInventoryItem {
    itemKey: string;
    quantity: number;
    metadata?: Record<string, unknown>;
}

export interface AppliedEffect {
    effectKey: string;
    appliedAt: number;
    expiresAt?: number;
    metadata?: Record<string, unknown>;
}

// ===== UNIFIED CHARACTER PROFILE (Main MongoDB document)
export interface UnifiedCharacterProfile {
    _id: number; // memberNumber (primary key)
    name: string;
    createdAt: number;
    bio: CharacterBio;

    // System-specific state
    casino: CasinoState;
    dare: DareState;
    veratown: VeratownState;

    // Authoritative character progression (Phase 2A.7), shared across systems
    progression: ProgressionState;

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
        | "game_suspended" // Phase 3.3: Game suspended (player caged)
        | "game_resumed" // Phase 3.3: Game resumed (player uncaged)
        | "kennel_entry"
        | "kennel_exit"
        | "game_joined"
        | "game_left"
        | "dare_drawn"
        | "dare_completed"
        | "casino_blackjack_disconnect"
        | "casino_blackjack_hit"
        | "casino_blackjack_double"
        | "casino_blackjack_split"
        | "casino_blackjack_settlement"
        | "casino_blackjack_stand"
        | "casino_blackjack_bet"
        | "casino_blackjack_cancel"
        | "casino_blackjack_deal"
        | "parole_violated"
        | "position_changed"
        | "location_entered"
        | "location_exited"
        | "character_frozen"
        | "character_unfrozen"
        | "audit_trail" // Phase 3.4: Generic audit trail event
        | "progression_xp_awarded" // Phase 2A.7: XP granted toward character progression
        | "progression_level_up" // Phase 2A.7: Character crossed a level threshold
        | "progression_xp_rollback"; // Phase 2A.7: A previously granted reward was reversed
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
    // Phase 3: Chip locking
    lockedChips?: number;
    chipLockReason?: string;
    chipLockUntil?: number;
}

// ===== DARE VIEW (What Dare system sees)
export interface DareView {
    memberNumber: number;
    name: string;
    gameIds: number[];
    activeBondage: DareBondageItem[];
    dressingBlockedUntil?: number;
    totalGamesPlayed: number;
    // Phase 3: Game suspension
    suspendedGames?: number[];
}

// ===== PROGRESSION VIEW (What Bio/access-control systems see)
export interface ProgressionView {
    memberNumber: number;
    name: string;
    level: number;
    totalXp: number;
    xpIntoLevel: number;
    xpForNextLevel: number;
    updatedAt: number;
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
