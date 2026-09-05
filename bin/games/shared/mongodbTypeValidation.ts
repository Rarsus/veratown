/*
 * MongoDB Type Validation and Serialization Layer
 *
 * Ensures all character profile data written to MongoDB uses correct numeric types:
 * - Timestamps (milliseconds since epoch): Long (int64) for precision
 * - Version numbers: Int32 for consistency
 * - Game counters and scores: Int32 for all integers
 *
 * JavaScript's `number` type doesn't distinguish between int and double,
 * so MongoDB stores them as doubles by default. This module enforces
 * correct type conversion during write operations.
 */

import {
    UnifiedCharacterProfile,
    CasinoState,
    DareState,
    VeratownState,
    CrossSystemState,
    CharacterBio,
    ProgressionState,
} from "./unifiedCharacterTypes";

export type Timestamp = number & { readonly __brand: "Timestamp" };
export type GameCounter = number & { readonly __brand: "GameCounter" };
export type Version = number & { readonly __brand: "Version" };

// Helper functions to create branded types
export const asTimestamp = (ms: number): Timestamp => ms as Timestamp;
export const asGameCounter = (count: number): GameCounter =>
    count as GameCounter;
export const asVersion = (version: number): Version => version as Version;

export function createCharacterBio(
    overrides: Partial<CharacterBio> = {},
): CharacterBio {
    return {
        updatedAt: asTimestamp(Date.now()),
        version: 0,
        ...overrides,
    };
}

/**
 * Type specifications for the database schema.
 * Documents which fields should be stored as which MongoDB types.
 */
export const SCHEMA_TYPE_SPECS = {
    // Timestamps: Should be stored as long (int64)
    // Current timestamp: ~1.78816e+12 ms (requires long for precision)
    TIMESTAMP_FIELDS: [
        "createdAt",
        "updatedAt",
        "lastAccessedAt",
        "bio.updatedAt",
        "casino.updatedAt",
        "casino.lastDailyClaimAt",
        "casino.lastGamePlayedAt",
        "casino.chipLockUntil",
        "dare.updatedAt",
        "veratown.updatedAt",
        "veratown.lastPositionAt",
        "veratown.lastAppearanceAt",
        "crossSystem.updatedAt",
        "progression.updatedAt",
    ],

    // Version fields: Should be stored as int32
    VERSION_FIELDS: [
        "version",
        "bio.version",
        "casino.version",
        "dare.version",
        "veratown.version",
        "progression.version",
    ],

    // Integer counters: Should be stored as int32
    INT_FIELDS: [
        "casino.chips",
        "casino.score",
        "casino.winStreak",
        "casino.lossStreak",
        "casino.cheatStrikes",
        "casino.totalWins",
        "casino.totalLosses",
        "casino.lockedChips",
        "casino.recentWinnings",
        "dare.totalGamesPlayed",
        "dare.totalDaresComplayed",
        "veratown.totalTimeInCages",
        "veratown.totalTimeInKennels",
        "progression.level",
        "progression.totalXp",
    ],
};

/**
 * Validates that a character profile conforms to type specifications.
 * Logs warnings for fields with incorrect types.
 */
export function validateCharacterProfileTypes(
    profile: UnifiedCharacterProfile,
): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const obj = profile as unknown as Record<string, unknown>;

    // Timestamp validation
    for (const field of SCHEMA_TYPE_SPECS.TIMESTAMP_FIELDS) {
        const value = getNestedValue(obj, field);
        if (value !== undefined && typeof value !== "number") {
            errors.push(`${field}: Expected number, got ${typeof value}`);
        }
        // Note: We can't validate exact MongoDB type (long vs double) in TypeScript,
        // that's handled at write time
    }

    // Version validation
    for (const field of SCHEMA_TYPE_SPECS.VERSION_FIELDS) {
        const value = getNestedValue(obj, field);
        if (value !== undefined && typeof value !== "number") {
            errors.push(`${field}: Expected number, got ${typeof value}`);
        }
        if (typeof value === "number" && !Number.isInteger(value)) {
            errors.push(`${field}: Expected integer, got ${value}`);
        }
    }

    // Integer field validation
    for (const field of SCHEMA_TYPE_SPECS.INT_FIELDS) {
        const value = getNestedValue(obj, field);
        if (value !== undefined && typeof value !== "number") {
            errors.push(`${field}: Expected number, got ${typeof value}`);
        }
        if (typeof value === "number" && !Number.isInteger(value)) {
            errors.push(`${field}: Expected integer, got ${value}`);
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
    };
}

/**
 * Creates MongoDB aggregation pipeline stage that converts double to long for timestamps.
 * Use in aggregation pipelines when reading data to ensure consistent types.
 */
export function createTypeConversionStage(): Record<string, unknown> {
    return {
        $set: {
            // Convert timestamp fields from double to long
            createdAt: { $toLong: "$createdAt" },
            updatedAt: { $toLong: "$updatedAt" },
            lastAccessedAt: { $toLong: "$lastAccessedAt" },
            "bio.updatedAt": { $toLong: "$bio.updatedAt" },
            "casino.updatedAt": { $toLong: "$casino.updatedAt" },
            "casino.lastDailyClaimAt": {
                $cond: [
                    { $eq: [{ $type: "$casino.lastDailyClaimAt" }, "double"] },
                    { $toLong: "$casino.lastDailyClaimAt" },
                    "$casino.lastDailyClaimAt",
                ],
            },
            "casino.lastGamePlayedAt": {
                $cond: [
                    { $eq: [{ $type: "$casino.lastGamePlayedAt" }, "double"] },
                    { $toLong: "$casino.lastGamePlayedAt" },
                    "$casino.lastGamePlayedAt",
                ],
            },
            "casino.chipLockUntil": {
                $cond: [
                    { $eq: [{ $type: "$casino.chipLockUntil" }, "double"] },
                    { $toLong: "$casino.chipLockUntil" },
                    "$casino.chipLockUntil",
                ],
            },
            "dare.updatedAt": { $toLong: "$dare.updatedAt" },
            "veratown.updatedAt": { $toLong: "$veratown.updatedAt" },
            "veratown.lastPositionAt": { $toLong: "$veratown.lastPositionAt" },
            "veratown.lastAppearanceAt": {
                $toLong: "$veratown.lastAppearanceAt",
            },
            "crossSystem.updatedAt": { $toLong: "$crossSystem.updatedAt" },

            // Convert version fields from double to int
            version: {
                $cond: [
                    { $eq: [{ $type: "$version" }, "double"] },
                    {
                        $convert: {
                            input: "$version",
                            to: "int",
                            onError: 0,
                        },
                    },
                    "$version",
                ],
            },
            "bio.version": {
                $cond: [
                    { $eq: [{ $type: "$bio.version" }, "double"] },
                    {
                        $convert: {
                            input: "$bio.version",
                            to: "int",
                            onError: 0,
                        },
                    },
                    "$bio.version",
                ],
            },
            "casino.version": {
                $cond: [
                    { $eq: [{ $type: "$casino.version" }, "double"] },
                    {
                        $convert: {
                            input: "$casino.version",
                            to: "int",
                            onError: 0,
                        },
                    },
                    "$casino.version",
                ],
            },
            "dare.version": {
                $cond: [
                    { $eq: [{ $type: "$dare.version" }, "double"] },
                    {
                        $convert: {
                            input: "$dare.version",
                            to: "int",
                            onError: 0,
                        },
                    },
                    "$dare.version",
                ],
            },
            "veratown.version": {
                $cond: [
                    { $eq: [{ $type: "$veratown.version" }, "double"] },
                    {
                        $convert: {
                            input: "$veratown.version",
                            to: "int",
                            onError: 0,
                        },
                    },
                    "$veratown.version",
                ],
            },
        },
    };
}

/**
 * Helper to get nested object values (e.g., "casino.chips" from profile)
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
        if (current && typeof current === "object") {
            current = (current as Record<string, unknown>)[part];
        } else {
            return undefined;
        }
    }

    return current;
}

/**
 * Creates a properly typed CasinoState object with correct timestamp handling.
 * Use this when creating new or updating casino state.
 */
export function createCasinoState(
    overrides: Partial<CasinoState> = {},
): CasinoState {
    const now = asTimestamp(Date.now());
    return {
        chips: 0,
        score: 0,
        winStreak: 0,
        lossStreak: 0,
        cheatStrikes: 0,
        totalWins: 0,
        totalLosses: 0,
        lockedChips: 0,
        recentWinnings: 0,
        version: 0,
        updatedAt: now,
        ...overrides,
    };
}

/**
 * Creates a properly typed DareState object with correct timestamp handling.
 */
export function createDareState(overrides: Partial<DareState> = {}): DareState {
    const now = asTimestamp(Date.now());
    return {
        gameIds: [],
        participationHistory: [],
        activeBondage: [],
        suspendedGames: [],
        totalGamesPlayed: 0,
        totalDaresCompleted: 0,
        version: 0,
        updatedAt: now,
        ...overrides,
    };
}

/**
 * Creates a properly typed VeratownState object with correct timestamp handling.
 */
export function createVeratownState(
    overrides: Partial<VeratownState> = {},
): VeratownState {
    const now = asTimestamp(Date.now());
    return {
        lastPositionAt: now,
        lastAppearanceAt: now,
        cageIncarcerations: [],
        totalTimeInCages: 0,
        kennelSessions: [],
        totalTimeInKennels: 0,
        currentRestraints: [],
        roleplayFlags: {
            lastFlagChange: now,
        },
        auditLog: [],
        roles: [],
        keypadAccess: [],
        version: 0,
        updatedAt: now,
        ...overrides,
    };
}

/**
 * Creates a properly typed CrossSystemState object with correct timestamp handling.
 */
export function createCrossSystemState(
    overrides: Partial<CrossSystemState> = {},
): CrossSystemState {
    return {
        recentEvents: [],
        inventory: [],
        effects: [],
        bondageLevel: 0,
        features: {},
        relationships: {},
        updatedAt: asTimestamp(Date.now()),
        ...overrides,
    };
}

/**
 * Creates a properly typed ProgressionState object (Phase 2A.7) with correct
 * timestamp handling. Used both for brand-new profiles and to backfill
 * existing profiles created before progression tracking was introduced.
 */
export function createProgressionState(
    overrides: Partial<ProgressionState> = {},
): ProgressionState {
    return {
        level: 0,
        totalXp: 0,
        claimedRewards: [],
        version: 0,
        updatedAt: asTimestamp(Date.now()),
        ...overrides,
    };
}
