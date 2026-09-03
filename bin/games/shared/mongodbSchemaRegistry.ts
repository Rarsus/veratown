/*
 * MongoDB Schema Registry
 *
 * Central definition of all collection schemas in the ropeybot database.
 * Specifies expected types for all numeric fields to prevent type inconsistencies.
 *
 * This registry is the source of truth for:
 * - What fields are timestamps (must be long/int64)
 * - What fields are versions (must be int32)
 * - What fields are counters/scores (must be int32)
 * - What fields should never be double
 *
 * When adding new collections, add their schema here to enable:
 * - Automatic validation
 * - Type mismatch detection
 * - Bulk type conversions
 * - TypeScript interface generation
 */

export type FieldType =
    | "timestamp"
    | "version"
    | "int"
    | "double"
    | "string"
    | "boolean"
    | "array"
    | "object";

export interface FieldSchema {
    type: FieldType;
    description?: string;
    required?: boolean;
}

export interface CollectionSchema {
    [fieldPath: string]: FieldSchema;
}

/**
 * Schema definitions for all collections in the ropeybot database.
 * Field paths use dot notation (e.g., "casino.chips").
 *
 * Types:
 * - timestamp: Milliseconds since epoch, stored as long (int64)
 * - version: Document version number, stored as int32
 * - int: Integer counter/score, stored as int32
 * - double: Floating point number (rare)
 * - string, boolean, array, object: Other types
 */
export const DATABASE_SCHEMA_REGISTRY: Record<string, CollectionSchema> = {
    // ===== UNIFIED CHARACTER PROFILES
    unifiedCharacterProfiles: {
        _id: {
            type: "int",
            description: "Member number (primary key)",
            required: true,
        },
        name: { type: "string", description: "Character name", required: true },

        // Metadata
        createdAt: {
            type: "timestamp",
            description: "Profile creation time",
            required: true,
        },
        updatedAt: {
            type: "timestamp",
            description: "Last update time",
            required: true,
        },
        lastAccessedAt: {
            type: "timestamp",
            description: "Last system access",
            required: true,
        },
        lastAccessedBy: {
            type: "string",
            description:
                "Which system accessed last (casino|dare|veratown|admin)",
        },
        version: {
            type: "version",
            description: "Document version number",
            required: true,
        },

        // Casino system
        "casino.chips": {
            type: "int",
            description: "Player's chip balance",
            required: true,
        },
        "casino.score": {
            type: "int",
            description: "Casino score/rating",
            required: true,
        },
        "casino.winStreak": {
            type: "int",
            description: "Consecutive wins",
            required: true,
        },
        "casino.lossStreak": {
            type: "int",
            description: "Consecutive losses",
            required: true,
        },
        "casino.cheatStrikes": {
            type: "int",
            description: "Cheat violation count",
            required: true,
        },
        "casino.totalWins": {
            type: "int",
            description: "Total wins lifetime",
            required: true,
        },
        "casino.totalLosses": {
            type: "int",
            description: "Total losses lifetime",
            required: true,
        },
        "casino.lockedChips": {
            type: "int",
            description: "Chips unable to spend",
            required: true,
        },
        "casino.recentWinnings": {
            type: "int",
            description: "Recent winnings track",
            required: true,
        },
        "casino.lastDailyClaimAt": {
            type: "timestamp",
            description: "Last daily bonus claim",
        },
        "casino.lastGamePlayedAt": {
            type: "timestamp",
            description: "Last game played",
        },
        "casino.chipLockUntil": {
            type: "timestamp",
            description: "When chips unlock",
        },
        "casino.chipLockReason": {
            type: "string",
            description: "Why chips are locked (bondage|parole|cage)",
        },
        "casino.version": {
            type: "version",
            description: "Casino state version",
            required: true,
        },
        "casino.updatedAt": {
            type: "timestamp",
            description: "Casino last update",
            required: true,
        },

        // Dare system
        "dare.gameIds": {
            type: "array",
            description: "Active game IDs",
            required: true,
        },
        "dare.participationHistory": {
            type: "array",
            description: "Game participation records",
            required: true,
        },
        "dare.activeBondage": {
            type: "array",
            description: "Active bondage items",
            required: true,
        },
        "dare.suspendedGames": {
            type: "array",
            description: "Games suspended while caged",
            required: true,
        },
        "dare.totalGamesPlayed": {
            type: "int",
            description: "Total games played",
            required: true,
        },
        "dare.totalDaresCompleted": {
            type: "int",
            description: "Total dares completed",
            required: true,
        },
        "dare.version": {
            type: "version",
            description: "Dare state version",
            required: true,
        },
        "dare.updatedAt": {
            type: "timestamp",
            description: "Dare last update",
            required: true,
        },

        // Veratown system
        "veratown.lastPositionAt": {
            type: "timestamp",
            description: "Last position update",
            required: true,
        },
        "veratown.lastAppearanceAt": {
            type: "timestamp",
            description: "Last appearance update",
            required: true,
        },
        "veratown.cageIncarcerations": {
            type: "array",
            description: "Cage session records",
            required: true,
        },
        "veratown.totalTimeInCages": {
            type: "int",
            description: "Total caged time (ms)",
            required: true,
        },
        "veratown.kennelSessions": {
            type: "array",
            description: "Kennel session records",
            required: true,
        },
        "veratown.totalTimeInKennels": {
            type: "int",
            description: "Total kenneled time (ms)",
            required: true,
        },
        "veratown.currentRestraints": {
            type: "array",
            description: "Active restraints",
            required: true,
        },
        "veratown.roleplayFlags": {
            type: "object",
            description: "Roleplay state flags",
            required: true,
        },
        "veratown.auditLog": {
            type: "array",
            description: "Action audit trail",
            required: true,
        },
        "veratown.roles": {
            type: "array",
            description: "Character roles",
            required: true,
        },
        "veratown.keypadAccess": {
            type: "array",
            description: "Keypad access records",
        },
        "veratown.version": {
            type: "version",
            description: "Veratown state version",
            required: true,
        },
        "veratown.updatedAt": {
            type: "timestamp",
            description: "Veratown last update",
            required: true,
        },

        // Cross-system
        "crossSystem.recentEvents": {
            type: "array",
            description: "Recent system events",
            required: true,
        },
        "crossSystem.features": {
            type: "object",
            description: "Feature flags",
            required: true,
        },
        "crossSystem.relationships": {
            type: "object",
            description: "Cross-character relationships",
            required: true,
        },
        "crossSystem.updatedAt": {
            type: "timestamp",
            description: "Cross-system last update",
            required: true,
        },
    },

    // ===== GAME EVENTS
    gameEvents: {
        _id: { type: "object", description: "MongoDB ObjectId" },
        timestamp: {
            type: "timestamp",
            description: "Event timestamp",
            required: true,
        },
        type: { type: "string", description: "Event type", required: true },
        source: {
            type: "string",
            description: "Event source system",
            required: true,
        },
        actor: {
            type: "int",
            description: "Member number who caused event",
            required: true,
        },
        target: {
            type: "int",
            description: "Member number affected",
            required: true,
        },
        data: {
            type: "object",
            description: "Event-specific data",
            required: true,
        },
        processed: {
            type: "boolean",
            description: "Whether event was processed",
            required: true,
        },
        processedBy: {
            type: "array",
            description: "Systems that processed event",
        },
    },

    // ===== DARE GAMES (if separate collection)
    dareGames: {
        _id: { type: "int", description: "Game ID", required: true },
        createdAt: {
            type: "timestamp",
            description: "Game creation time",
            required: true,
        },
        updatedAt: {
            type: "timestamp",
            description: "Last update time",
            required: true,
        },
        participantCount: {
            type: "int",
            description: "Number of players",
            required: true,
        },
        uses: {
            type: "int",
            description: "Times this dare was used",
            required: true,
        },
        version: {
            type: "version",
            description: "Game version",
            required: true,
        },
    },

    // ===== VERATOWN LOCATIONS (if separate collection)
    veratownLocations: {
        _id: { type: "string", description: "Location key", required: true },
        createdAt: {
            type: "timestamp",
            description: "Location creation time",
            required: true,
        },
        updatedAt: {
            type: "timestamp",
            description: "Last update time",
            required: true,
        },
        version: {
            type: "version",
            description: "Location version",
            required: true,
        },
    },

    // ===== AUDIT LOGS
    auditLogs: {
        _id: { type: "object", description: "MongoDB ObjectId" },
        timestamp: {
            type: "timestamp",
            description: "Action timestamp",
            required: true,
        },
        action: {
            type: "string",
            description: "Action performed",
            required: true,
        },
        performedBy: {
            type: "int",
            description: "Member number who performed action",
        },
        details: { type: "object", description: "Action details" },
    },

    // ===== KEYPAD DOOR DEFINITIONS
    keypadDoorDefinitions: {
        _id: { type: "string", description: "Door ID", required: true },
        doorKey: {
            type: "string",
            description: "Door key identifier",
            required: true,
        },
        doorX: {
            type: "int",
            description: "Door X coordinate",
            required: true,
        },
        doorY: {
            type: "int",
            description: "Door Y coordinate",
            required: true,
        },
        lockedTile: {
            type: "string",
            description: "Locked tile name",
            required: true,
        },
        unlockedTile: {
            type: "string",
            description: "Unlocked tile name",
            required: true,
        },
        unlockDurationMs: {
            type: "int",
            description: "Unlock duration in milliseconds",
            required: true,
        },
        autoOpenTile: {
            type: "object",
            description: "Auto-open tile coordinates",
            required: true,
        },
        enabled: {
            type: "boolean",
            description: "Is door enabled",
            required: true,
        },
        description: { type: "string", description: "Door description" },
        createdAt: {
            type: "timestamp",
            description: "Creation time",
            required: true,
        },
        updatedAt: {
            type: "timestamp",
            description: "Last update time",
            required: true,
        },
    },

    // ===== OUTFITS (empty collection in current database)
    outfits: {
        _id: { type: "object", description: "MongoDB ObjectId" },
        memberId: { type: "int", description: "Member number", required: true },
        name: { type: "string", description: "Outfit name", required: true },
        appearance: {
            type: "array",
            description: "Appearance items",
            required: true,
        },
        createdAt: {
            type: "timestamp",
            description: "Creation time",
            required: true,
        },
        updatedAt: {
            type: "timestamp",
            description: "Last update time",
            required: true,
        },
    },

    // ===== DARE OUTFITS
    dareOutfits: {
        _id: { type: "int", description: "Member number", required: true },
        appearance: {
            type: "array",
            description: "Appearance items",
            required: true,
        },
        createdAt: {
            type: "timestamp",
            description: "Creation time",
            required: true,
        },
        updatedAt: {
            type: "timestamp",
            description: "Last update time",
            required: true,
        },
    },

    // ===== PLAYERS DEPRECATED
    players_DEPRECATED: {
        _id: { type: "string", description: "Old player ID", required: true },
        memberNumber: {
            type: "int",
            description: "Member number",
            required: true,
        },
        name: { type: "string", description: "Player name", required: true },
        credits: { type: "int", description: "Credit balance", required: true },
        score: { type: "int", description: "Player score", required: true },
        cheatStrikes: {
            type: "int",
            description: "Cheat strike count",
            required: true,
        },
        lastFreeCredits: {
            type: "timestamp",
            description: "Last free credits claim",
            required: true,
        },
    },

    // ===== VERATOWN MAP BACKUPS
    veratownMapBackups: {
        _id: { type: "string", description: "Backup ID", required: true },
        mapData: {
            type: "object",
            description: "Full map data backup",
            required: true,
        },
        backedUpAt: {
            type: "timestamp",
            description: "Backup timestamp",
            required: true,
        },
        backedUpBy: {
            type: "int",
            description: "Member who created backup",
            required: true,
        },
        backedUpFrom: {
            type: "timestamp",
            description: "Original map timestamp",
            required: true,
        },
        version: {
            type: "version",
            description: "Backup version",
            required: true,
        },
    },

    // ===== KEYPAD GROUP DEFINITIONS
    keypadGroupDefinitions: {
        _id: { type: "string", description: "Group ID", required: true },
        groupName: {
            type: "string",
            description: "Group name",
            required: true,
        },
        description: { type: "string", description: "Group description" },
        createdAt: {
            type: "timestamp",
            description: "Creation time",
            required: true,
        },
        updatedAt: {
            type: "timestamp",
            description: "Last update time",
            required: true,
        },
        version: {
            type: "version",
            description: "Group version",
            required: true,
        },
    },

    // ===== DARES
    dares: {
        _id: { type: "string", description: "Dare ID", required: true },
        text: { type: "string", description: "Dare text", required: true },
        category: {
            type: "string",
            description: "Dare category",
            required: true,
        },
        stripCount: { type: "int", description: "Clothing count to remove" },
        noRedress: {
            type: "boolean",
            description: "Cannot put clothes back on",
        },
        addedBy: { type: "int", description: "Member number who added" },
        addedByName: { type: "string", description: "Name of who added dare" },
        used: { type: "boolean", description: "Has been used in game" },
        createdAt: {
            type: "timestamp",
            description: "Creation time",
            required: true,
        },
    },

    // ===== KEYPAD GROUP MEMBERSHIPS
    keypadGroupMemberships: {
        _id: { type: "string", description: "Membership ID", required: true },
        doorKey: { type: "string", description: "Door key", required: true },
        groupName: {
            type: "string",
            description: "Group name",
            required: true,
        },
        memberNumber: {
            type: "int",
            description: "Member number",
            required: true,
        },
        grantedAt: {
            type: "timestamp",
            description: "Access granted time",
            required: true,
        },
        grantedBy: {
            type: "int",
            description: "Member who granted access",
            required: true,
        },
        grantedReason: {
            type: "string",
            description: "Reason for grant",
            required: true,
        },
        syncedFromProfile: {
            type: "boolean",
            description: "Synced from character profile",
        },
    },

    // ===== VERATOWN MAP (Current)
    veratownMap: {
        _id: { type: "string", description: "Map ID", required: true },
        mapData: {
            type: "object",
            description: "Full map data",
            required: true,
        },
        updatedAt: {
            type: "timestamp",
            description: "Last update time",
            required: true,
        },
        updatedBy: { type: "int", description: "Member who updated" },
        version: {
            type: "version",
            description: "Map version",
            required: true,
        },
    },

    // ===== DARE STATE (Game state)
    dareState: {
        _id: { type: "string", description: "Dare state ID", required: true },
        gameId: { type: "string", description: "Active game ID" },
        status: {
            type: "string",
            description: "Game status (active|completed|abandoned)",
        },
        participants: {
            type: "array",
            description: "Participant member numbers",
        },
        activeDares: { type: "array", description: "Active dares in game" },
        completedAt: { type: "timestamp", description: "Game completion time" },
        createdAt: {
            type: "timestamp",
            description: "Creation time",
            required: true,
        },
        updatedAt: {
            type: "timestamp",
            description: "Last update time",
            required: true,
        },
        version: {
            type: "version",
            description: "State version",
            required: true,
        },
    },

    // ===== KEYPAD ACCESS GROUPS DEPRECATED
    keypadAccessGroups_DEPRICATED: {
        _id: { type: "string", description: "Group ID", required: true },
        name: { type: "string", description: "Group name", required: true },
        members: { type: "array", description: "Member numbers in group" },
        createdAt: {
            type: "timestamp",
            description: "Creation time",
            required: true,
        },
        updatedAt: {
            type: "timestamp",
            description: "Last update time",
            required: true,
        },
    },
};

/**
 * Get schema for a specific collection
 */
export function getCollectionSchema(collectionName: string): CollectionSchema {
    return DATABASE_SCHEMA_REGISTRY[collectionName] ?? {};
}

/**
 * Get all collections defined in registry
 */
export function getAllDefinedCollections(): string[] {
    return Object.keys(DATABASE_SCHEMA_REGISTRY);
}

/**
 * Get all fields that should be timestamps in a collection
 */
export function getTimestampFields(collectionName: string): string[] {
    const schema = getCollectionSchema(collectionName);
    return Object.entries(schema)
        .filter(([_, fieldSchema]) => fieldSchema.type === "timestamp")
        .map(([fieldPath, _]) => fieldPath);
}

/**
 * Get all fields that should be versions in a collection
 */
export function getVersionFields(collectionName: string): string[] {
    const schema = getCollectionSchema(collectionName);
    return Object.entries(schema)
        .filter(([_, fieldSchema]) => fieldSchema.type === "version")
        .map(([fieldPath, _]) => fieldPath);
}

/**
 * Get all fields that should be integers in a collection
 */
export function getIntegerFields(collectionName: string): string[] {
    const schema = getCollectionSchema(collectionName);
    return Object.entries(schema)
        .filter(
            ([_, fieldSchema]) =>
                fieldSchema.type === "int" || fieldSchema.type === "version",
        )
        .map(([fieldPath, _]) => fieldPath);
}

/**
 * Get all numeric fields (int, version, timestamp) that should never be double
 */
export function getNumericFields(collectionName: string): string[] {
    const schema = getCollectionSchema(collectionName);
    return Object.entries(schema)
        .filter(
            ([_, fieldSchema]) =>
                fieldSchema.type === "int" ||
                fieldSchema.type === "version" ||
                fieldSchema.type === "timestamp",
        )
        .map(([fieldPath, _]) => fieldPath);
}

/**
 * Validate if a field type matches the expected schema
 */
export function validateFieldType(
    collectionName: string,
    fieldPath: string,
    actualType: string,
): { isValid: boolean; expected: string; actual: string } {
    const schema = getCollectionSchema(collectionName);
    const fieldSchema = schema[fieldPath];

    if (!fieldSchema) {
        // Field not in schema - could be new or optional
        return {
            isValid: true, // Not in schema, so we can't validate
            expected: "unknown",
            actual: actualType,
        };
    }

    // Map MongoDB types to our schema types
    const mongoTypeMap: Record<string, string> = {
        long: "timestamp|version|int",
        int: "version|int",
        double: "double",
        string: "string",
        bool: "boolean",
        array: "array",
        object: "object",
    };

    const expectedTypes = fieldSchema.type;
    const actualTypeCategory = mongoTypeMap[actualType] || actualType;

    // Check if actual type matches expected
    const isValid = actualTypeCategory.includes(expectedTypes);

    return {
        isValid,
        expected: expectedTypes,
        actual: actualType,
    };
}
