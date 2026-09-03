# Veratown Games Integration - Cross-Game Synergies & MongoDB Atlas Optimization

**Date**: September 3, 2026  
**Scope**: RoleplayChallenge + MaidsPartyNight + KidnappersGame Integration  
**Focus**: Shared infrastructure, MongoDB Atlas leverage, cross-game features

---

## EXECUTIVE SUMMARY

Three major game features are being integrated into Veratown as region-bound experiences:

1. **RoleplayChallenge** (2-3 active players + audience, 15+ min, competitive)
2. **MaidsPartyNight** (1 player, variable length, narrative-driven)
3. **KidnappersGame** (2-8 players, variable length, cooperative/competitive)

By architecting these with **shared infrastructure components** and leveraging **MongoDB Atlas capabilities**, we can:

- Reduce development effort by 20-30% through code reuse
- Improve performance with optimized indexing and aggregation pipelines
- Enable cross-game features (leaderboards, discovery, player stats)
- Scale to thousands of concurrent players across all three games
- Provide real-time game updates via Change Streams
- Ensure data consistency with multi-document transactions

**Estimated Synergy Savings**: ~60-80 story points across all three epics

---

## SECTION 1: SHARED INFRASTRUCTURE ARCHITECTURE

### 1.1 Common VeratownGameFeatureBase Class

**Problem**: Each game re-implements identical patterns (lifecycle, state management, command routing, error handling)

**Solution**: Create shared base class in `bin/games/veratown/shared/vertatownGameFeatureBase.ts`

```typescript
export abstract class VeratownGameFeatureBase implements VeratownFeatureSystem {
  // Shared dependencies
  protected conn: API_Connector;
  protected locationStore: VeratownLocationStore;
  protected commandParser: CommandParser;
  protected unifiedStore: UnifiedCharacterStore;
  protected gameStatsStore: GameStatsStore; // New shared stats collection
  protected appearanceAuditTrail: AppearanceAuditTrail;

  // Common lifecycle management
  protected activePlayers: Map<number, PlayerGameSession>;
  protected timers: Map<string, NodeJS.Timeout>;
  protected regionBounds: MapRegion;

  // Shared methods
  abstract getGameName(): string;
  abstract getRegionBounds(): MapRegion;
  abstract handleRegionCommand(
    sender: API_Character,
    command: string,
    args: string[]
  ): Promise<void>;

  // Concrete shared implementations
  async registerTriggers(): Promise<void> { ... }
  async reloadLocations(): Promise<void> { ... }
  async onCharacterEntered(char: API_Character): Promise<void> { ... }
  async onCharacterLeft(char: API_Character): Promise<void> { ... }
  protected guardHandler<T>(
    fn: () => Promise<T>,
    context: string
  ): Promise<T | null> { ... }
  protected isPlayerInGameRegion(char: API_Character): boolean { ... }
  protected captureAppearance(char: API_Character): Promise<void> { ... }
  protected restoreAppearance(char: API_Character): Promise<void> { ... }
  protected async persistGameState(): Promise<void> { ... }
  protected async recordGameStats(): Promise<void> { ... }
}

// Game-specific implementations
export class RoleplaychallengeGameFeature extends VeratownGameFeatureBase {
  getGameName(): string { return "roleplay_challenge"; }
  getRegionBounds(): MapRegion { return ROLEPLAY_CHALLENGE_REGION; }
  handleRegionCommand(...) { ... }
}

export class MaidsPartyNightFeature extends VeratownGameFeatureBase {
  getGameName(): string { return "maids_party_night"; }
  getRegionBounds(): MapRegion { return MAIDS_PARTY_NIGHT_REGION; }
  handleRegionCommand(...) { ... }
}

export class KidnappersGameFeature extends VeratownGameFeatureBase {
  getGameName(): string { return "kidnappers_game"; }
  getRegionBounds(): MapRegion { return KIDNAPPERS_GAME_REGION; }
  handleRegionCommand(...) { ... }
}
```

**Benefits**:

- Eliminates ~150 LOC duplication per game
- Consistent error handling across all games
- Unified lifecycle management
- Easier to add new games in future

**Story Points Saved**: ~20 (less code to write, test, maintain)

---

### 1.2 Shared Player Game Session Model

**New**: `bin/games/veratown/shared/playerGameSession.ts`

```typescript
export interface PlayerGameSession {
    // Core identity
    memberNumber: number;
    playerName: string;
    joinedAt: number;

    // Game state
    gameType: "roleplay_challenge" | "maids_party_night" | "kidnappers_game";
    gameSessionId: string;
    currentRole?: string; // Role or game-specific state

    // Appearance management
    capturedAppearance?: BC_AppearanceItem[];
    capturedAt?: number;

    // Timing
    lastActivityAt: number;
    disconnectGracePeriodUntil?: number;

    // Stats (cached from DB)
    statsSnapshot?: {
        gamesPlayed: number;
        winCount: number;
        averageScore: number;
        lastPlayed: number;
    };

    // Errors
    errorCount: number;
    lastError?: string;
}
```

**Benefits**:

- Consistent player tracking across games
- Enables cross-game player analytics
- Unified disconnect handling (5-min grace period)
- Easy to extend with game-specific properties

---

### 1.3 Shared Appearance & Item Management Utilities

**New**: `bin/games/veratown/shared/appearanceUtils.ts`

```typescript
export class AppearanceManager {
    constructor(private appearanceAuditTrail: AppearanceAuditTrail) {}

    // Capture appearance (all games use same pattern)
    async captureAppearance(
        character: API_Character,
        gameType: string,
    ): Promise<BC_AppearanceItem[] | null>;

    // Restore appearance (all games use same pattern)
    async restoreAppearance(
        character: API_Character,
        stored: BC_AppearanceItem[],
        gameType: string,
    ): Promise<boolean>;

    // Apply outfit (reusable across games)
    async applyOutfit(
        character: API_Character,
        outfit: CostumeOutfit,
        appliedBy?: string,
    ): Promise<boolean>;

    // Apply restraint (used by KidnappersGame, optionally by others)
    async applyRestraint(
        victim: API_Character,
        restraint: RestraintConfig,
        appliedBy: API_Character,
        gameType: string,
    ): Promise<boolean>;

    // Remove restraint
    async removeRestraint(
        victim: API_Character,
        group: AssetGroupName,
        gameType: string,
    ): Promise<boolean>;
}
```

**Benefits**:

- No duplicate appearance code across three games
- Consistent audit trail logging
- Easier to handle edge cases globally
- Testable in isolation

**Story Points Saved**: ~15 (appearance handling is significant)

---

### 1.4 Shared Timer & Pacing System

**New**: `bin/games/veratown/shared/gameTimerManager.ts`

```typescript
export interface TimerConfig {
    type: "phase" | "cooldown" | "afk" | "negotiation" | "escape";
    durationMs: number;
    onExpire: () => Promise<void>;
    onWarning?: (timeRemainingMs: number) => Promise<void>;
    warningThresholdMs?: number; // E.g., warn at 60 seconds
}

export class GameTimerManager {
    // Start various timer types used across all three games
    startPhaseTimer(sessionId: string, config: TimerConfig): void;
    startAFKTimer(player: PlayerGameSession, config: TimerConfig): void;
    startCooldownTimer(
        player: PlayerGameSession,
        type: string,
        duration: number,
    ): void;
    startNegotiationTimer(sessionId: string, durationMs: number): void;

    // Stop and cleanup
    stopTimer(timerKey: string): void;
    stopAllPlayerTimers(memberNumber: number): void;

    // Get status
    getTimeRemaining(timerKey: string): number;
    isTimerActive(timerKey: string): boolean;
}
```

**Benefits**:

- All games use same timer infrastructure
- Coordinated message throttling
- Unified cooldown tracking
- AFK handling consistent across games

---

### 1.5 Shared Command Router with Role-Based Access Control

**New**: `bin/games/veratown/shared/gameCommandRouter.ts`

```typescript
export interface CommandDefinition {
    command: string;
    aliases: string[];
    allowedRoles: string[]; // E.g., ["captor", "victim"], ["player"], ["all"]
    gameStates: string[]; // E.g., ["progress", "decision"]
    handler: (
        sender: API_Character,
        args: string[],
        context: GameContext,
    ) => Promise<void>;
    helpText: string;
    requiresGameRegion: boolean;
}

export class GameCommandRouter {
    // Register commands per game
    registerGameCommands(gameName: string, commands: CommandDefinition[]): void;

    // Route incoming messages
    async handleMessage(
        message: BC_Server_ChatRoomMessage,
        sender: API_Character,
        gameContext: GameContext,
    ): Promise<void> {
        // Verify in region
        if (!isInRegion(sender, gameContext.regionBounds)) return;

        // Parse command
        const { cmd, args } = parseCommand(message.Content);

        // Find command definition
        const def = this.findCommand(gameContext.gameName, cmd);
        if (!def) return;

        // Check role permission
        if (!def.allowedRoles.includes(gameContext.playerRole)) {
            sender.Tell(
                "Whisper",
                "You don't have permission for that command.",
            );
            return;
        }

        // Check game state
        if (!def.gameStates.includes(gameContext.gameState)) {
            sender.Tell(
                "Whisper",
                "That command isn't available in this game state.",
            );
            return;
        }

        // Execute with error isolation
        await this.executeCommand(def, sender, args, gameContext);
    }

    // Get help per role
    getHelpText(gameName: string, role: string): string;
}
```

**Benefits**:

- Consistent command parsing across games
- Unified permission checking
- Prevents command spam in wrong context
- Easy to add new commands

---

## SECTION 2: MONGODB ATLAS LEVERAGE & OPTIMIZATION

### 2.1 Aggregation Pipeline for Cross-Game Analytics

**Problem**: Need to provide game statistics, leaderboards, player profiles across three games

**Solution**: Create aggregation pipelines in `bin/games/veratown/shared/gameAnalytics.ts`

```typescript
export class GameAnalyticsService {
    // Get player cross-game statistics
    async getPlayerCrossGameStats(memberNumber: number) {
        const pipeline = [
            {
                $match: {
                    memberNumber,
                    $or: [
                        { "roleplayChallenge.stats": { $exists: true } },
                        { "maidsPartyNight.stats": { $exists: true } },
                        { "kidnappersGame.stats": { $exists: true } },
                    ],
                },
            },
            {
                $project: {
                    memberNumber: 1,
                    "roleplayChallenge.stats": 1,
                    "maidsPartyNight.sessionCount": {
                        $cond: [{ $exists: ["$maidsPartyNight"] }, 1, 0],
                    },
                    "kidnappersGame.stats": 1,
                },
            },
            {
                $addFields: {
                    totalGamesPlayed: {
                        $add: [
                            {
                                $ifNull: [
                                    "$roleplayChallenge.stats.totalPlayed",
                                    0,
                                ],
                            },
                            { $ifNull: ["$maidsPartyNight.sessionCount", 0] },
                            {
                                $ifNull: [
                                    "$kidnappersGame.stats.totalPlayed",
                                    0,
                                ],
                            },
                        ],
                    },
                },
            },
        ];

        return db
            .collection("unified_characters")
            .aggregate(pipeline)
            .toArray();
    }

    // Get global leaderboard across all games
    async getGlobalLeaderboard(limit: number = 100) {
        return db
            .collection("game_sessions")
            .aggregate([
                { $match: { "results.outcome": { $exists: true } } },
                {
                    $group: {
                        _id: "$playerMemberNumber",
                        playerName: { $first: "$playerName" },
                        wins: {
                            $sum: {
                                $cond: [
                                    { $eq: ["$results.winner", true] },
                                    1,
                                    0,
                                ],
                            },
                        },
                        plays: { $sum: 1 },
                        gamesPlayed: { $push: "$gameType" },
                        lastPlayed: { $max: "$createdAt" },
                        averageScore: { $avg: "$results.score" },
                    },
                },
                {
                    $addFields: {
                        winRate: { $divide: ["$wins", "$plays"] },
                    },
                },
                { $sort: { wins: -1 } },
                { $limit: limit },
            ])
            .toArray();
    }

    // Get game-specific performance metrics
    async getGameMetrics(gameType: string) {
        return db
            .collection("game_sessions")
            .aggregate([
                { $match: { gameType } },
                {
                    $facet: {
                        avgSessionLength: [
                            {
                                $group: {
                                    _id: null,
                                    avgDuration: {
                                        $avg: {
                                            $subtract: [
                                                "$endedAt",
                                                "$startedAt",
                                            ],
                                        },
                                    },
                                },
                            },
                        ],
                        playerCount: [
                            {
                                $group: {
                                    _id: null,
                                    uniquePlayers: { $sum: 1 },
                                },
                            },
                        ],
                        outcomeDistribution: [
                            {
                                $group: {
                                    _id: "$results.outcome",
                                    count: { $sum: 1 },
                                },
                            },
                        ],
                    },
                },
            ])
            .toArray();
    }
}
```

**Benefits**:

- Complex analytics queries without post-processing
- Leaderboards update in real-time
- Player recommendations (e.g., "players like you play kidnapped game 2x more")
- Performance metrics for game balancing

**Story Points Saved**: ~15 (analytics built-in, not tacked on)

---

### 2.2 MongoDB Change Streams for Real-Time Player Discovery

**Problem**: Players want to discover games in progress, join audiences, see who's playing

**Solution**: Implement Change Streams in `bin/games/veratown/shared/gameDiscoveryService.ts`

```typescript
export class GameDiscoveryService {
    private changeStreams: Map<string, ChangeStream> = new Map();

    // Watch for new game sessions
    async watchGameSessions(callback: (session: GameSessionDoc) => void) {
        const pipeline = [
            {
                $match: {
                    operationType: { $in: ["insert", "update"] },
                    "fullDocument.state": "in_progress",
                },
            },
        ];

        const stream = db.collection("game_sessions").watch(pipeline);

        stream.on("change", (change) => {
            callback(change.fullDocument);
        });

        this.changeStreams.set("gameSessions", stream);
    }

    // Notify players of available games
    broadcastAvailableGames(channel: string) {
        db.collection("game_sessions")
            .aggregate([
                { $match: { state: "in_progress", acceptingSpectators: true } },
                {
                    $project: {
                        _id: 1,
                        gameType: 1,
                        playerCount: { $size: "$players" },
                        maxPlayers: 1,
                        startedAt: 1,
                        description: 1,
                    },
                },
            ])
            .toArray()
            .then((games) => {
                // Broadcast to looking-for-games channel
                broadcastToChannel(channel, games);
            });
    }
}
```

**Benefits**:

- Players see games starting in real-time
- Leaderboards update live
- Audience can join active games
- No polling needed

---

### 2.3 Multi-Document Transactions for Complex Game State

**Problem**: Game state changes involve multiple documents (player state, scenario state, audit trail) that must all succeed or fail together

**Solution**: Use ACID transactions in state management

```typescript
export class GameStateTransaction {
    async executeGameStateChange(
        sessionId: string,
        stateUpdate: Partial<GameSessionDoc>,
        playerUpdates: Map<number, Partial<UnifiedCharacterDoc>>,
        auditEntry: AuditTrailEntry,
    ): Promise<boolean> {
        const session = db.getMongo().startSession();

        try {
            await session.withTransaction(async () => {
                // Update scenario state
                await db
                    .collection("game_sessions")
                    .updateOne(
                        { _id: sessionId },
                        { $set: stateUpdate },
                        { session },
                    );

                // Update all player states
                for (const [memberNumber, update] of playerUpdates) {
                    await db
                        .collection("unified_characters")
                        .updateOne(
                            { memberNumber },
                            { $set: update },
                            { session },
                        );
                }

                // Record audit trail
                await db
                    .collection("appearance_audit_trail")
                    .insertOne(auditEntry, { session });
            });

            return true;
        } catch (error) {
            logger.error(`Transaction failed: ${error}`);
            return false;
        } finally {
            await session.endSession();
        }
    }
}
```

**Benefits**:

- Guarantees consistency across player + scenario + audit states
- No orphaned data if partial failure
- Simplifies error handling
- No need for manual rollback logic

---

### 2.4 Schema Validation & TTL Indexes

**Problem**: Game sessions should auto-expire, game data needs validation

**Solution**: MongoDB Schema Validation and TTL

```typescript
// In migration: createSchemaValidation.ts
async function createGameSessionValidation() {
    await db.createCollection("game_sessions", {
        validator: {
            $jsonSchema: {
                bsonType: "object",
                required: ["gameType", "state", "createdAt", "expiresAt"],
                properties: {
                    _id: { bsonType: "objectId" },
                    gameType: {
                        enum: [
                            "roleplay_challenge",
                            "maids_party_night",
                            "kidnappers_game",
                        ],
                    },
                    state: {
                        enum: ["setup", "in_progress", "resolved", "archived"],
                    },
                    players: {
                        bsonType: "array",
                        items: {
                            bsonType: "object",
                            required: ["memberNumber"],
                            properties: {
                                memberNumber: { bsonType: "int" },
                                role: { bsonType: "string" },
                                joinedAt: { bsonType: "date" },
                            },
                        },
                    },
                    createdAt: { bsonType: "date" },
                    expiresAt: { bsonType: "date" },
                },
            },
        },
    });

    // TTL index: auto-delete after 30 days
    await db
        .collection("game_sessions")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    // Performance indexes
    await db
        .collection("game_sessions")
        .createIndex({ gameType: 1, state: 1, createdAt: -1 });

    await db
        .collection("game_sessions")
        .createIndex({ "players.memberNumber": 1 });
}
```

**Benefits**:

- Invalid data rejected at DB level
- No need for manual cleanup jobs
- Query optimization with proper indexes
- Data integrity guaranteed

---

### 2.5 Bulk Operations for Batch Updates

**Problem**: After game ends, need to update many player stats efficiently

**Solution**: Use bulk write operations

```typescript
export async function recordGameStats(gameType: string, results: GameResult[]) {
    const bulk = db
        .collection("unified_characters")
        .initializeUnorderedBulkOp();

    for (const result of results) {
        bulk.find({ memberNumber: result.playerNumber }).updateOne({
            $inc: {
                [`${gameType}.stats.totalPlayed`]: 1,
                [`${gameType}.stats.wins`]: result.won ? 1 : 0,
                [`${gameType}.stats.totalScore`]: result.score || 0,
            },
            $set: {
                [`${gameType}.stats.lastPlayed`]: new Date(),
            },
        });
    }

    await bulk.execute();
}
```

**Benefits**:

- Single round-trip to DB for 100+ updates
- Much faster than individual updates
- Better network efficiency

---

### 2.6 Full-Text Search with Atlas Search

**Problem**: Players want to search for game scenarios, player history, auction records

**Solution**: Atlas Search indexes and queries

```typescript
// Create index (done once via Atlas UI or migration)
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "gameType": { "type": "string" },
      "scenarioName": { "type": "string", "analyzer": "lucene.standard" },
      "description": { "type": "string", "analyzer": "lucene.standard" },
      "playerNames": { "type": "string", "analyzer": "lucene.standard" },
      "tags": { "type": "string" }
    }
  }
}

// Query scenarios
async function searchScenarios(query: string) {
  return db.collection('game_sessions').aggregate([
    {
      $search: {
        text: {
          query,
          path: ["scenarioName", "description", "tags"]
        }
      }
    },
    {
      $project: {
        _id: 1,
        gameType: 1,
        scenarioName: 1,
        description: 1,
        score: { $meta: "searchScore" }
      }
    },
    { $sort: { score: -1 } }
  ]).toArray();
}
```

**Benefits**:

- Players find interesting games
- Admins audit game history
- No separate search infrastructure needed

---

## SECTION 3: CROSS-GAME FEATURES

### 3.1 Unified Player Stats & Achievements

**New Collection**: `player_achievements`

```typescript
interface PlayerAchievement {
    memberNumber: number;
    achievement: string; // e.g., "roleplay_challenge_win_5", "kidnappers_escape_hero"
    unlockedAt: Date;
    progress?: {
        current: number;
        target: number;
    };
}

// Achievements:
// - RoleplayChallenge: "Won 5 challenges", "Won against 3+ opponents", etc.
// - MaidsPartyNight: "Completed all story paths", "Found all endings", etc.
// - KidnappersGame: "Escaped 10 times", "Negotiated ransom 5x", "Captured 20 victims"
// - Cross-Game: "Played all 3 games", "100 games total", "Top 10 leaderboard"
```

---

### 3.2 Player Progression System

All three games feed into unified progression:

```typescript
interface PlayerProgression {
    memberNumber: number;

    // XP & Level (unified across games)
    totalXP: number;
    level: number; // 1-100

    // Game-specific progression
    roleplayChallengeLevel?: number; // Novice → Veteran
    maidsPartyNightLevel?: number; // Curious → Experienced
    kidnappersGameLevel?: number; // Rookie → Master

    // Rewards
    title?: string; // "Roleplay Champion", "Story Master", etc.
    cosmetics?: string[]; // Earned cosmetic items
    badges?: string[];
}
```

---

### 3.3 Cross-Game Social Features

**Relationship Tracking**:

```typescript
interface PlayerRelationship {
    player1: number;
    player2: number;
    gamesPlayedTogether: number;
    favoriteGamesToPlayTogether: string[]; // ["roleplay_challenge", "kidnappers_game"]
    friendlyCompetitor: boolean; // Have they played against each other many times?
    recommendation: "high_compatibility" | "low_compatibility";
}
```

Benefits:

- Matchmaking improvements (pair players who enjoy playing together)
- Friend discovery (find players you've played with before)
- Game recommendations (if friend loved MaidsPartyNight, you might too)

---

## SECTION 4: PERFORMANCE & SCALABILITY

### 4.1 Caching Strategy

```typescript
// In-memory cache for frequently accessed data
export class GameCacheManager {
    // Cache player session data (5 min TTL)
    async getPlayerSession(
        memberNumber: number,
        gameType: string,
    ): Promise<PlayerGameSession> {
        const cacheKey = `session:${gameType}:${memberNumber}`;
        const cached = await this.cache.get(cacheKey);
        if (cached) return cached;

        const session = await this.db.getPlayerSession(memberNumber, gameType);
        await this.cache.set(cacheKey, session, 300); // 5 min TTL

        return session;
    }

    // Invalidate cache on state changes
    async invalidatePlayerSession(memberNumber: number, gameType: string) {
        const cacheKey = `session:${gameType}:${memberNumber}`;
        await this.cache.delete(cacheKey);
    }

    // Cache leaderboards (10 min TTL)
    async getLeaderboard(gameType: string, limit: number = 100) {
        const cacheKey = `leaderboard:${gameType}:${limit}`;
        const cached = await this.cache.get(cacheKey);
        if (cached) return cached;

        const leaderboard = await this.analytics.getGameLeaderboard(
            gameType,
            limit,
        );
        await this.cache.set(cacheKey, leaderboard, 600); // 10 min TTL

        return leaderboard;
    }
}
```

**Benefits**:

- Reduce DB load for frequently accessed data
- Faster response times (50-100ms cache vs 200-500ms DB)
- Graceful degradation if DB is slow

---

### 4.2 Index Strategy

**Essential Indexes**:

```javascript
// unified_characters
db.unified_characters.createIndex({ memberNumber: 1 }, { unique: true });
db.unified_characters.createIndex({ "roleplayChallenge.stats": 1 });
db.unified_characters.createIndex({ "maidsPartyNight.gameState": 1 });
db.unified_characters.createIndex({ "kidnappersGame.currentScenarioId": 1 });

// game_sessions
db.game_sessions.createIndex({ gameType: 1, state: 1, createdAt: -1 });
db.game_sessions.createIndex({ "players.memberNumber": 1 });
db.game_sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 });
db.game_sessions.createIndex({ "results.outcome": 1 });

// appearance_audit_trail
db.appearance_audit_trail.createIndex({ memberNumber: 1, timestamp: -1 });
db.appearance_audit_trail.createIndex({ action: 1 });
db.appearance_audit_trail.createIndex(
    { timestamp: 1 },
    { expireAfterSeconds: 2592000 },
);
```

---

### 4.3 Sharding Strategy for Scale

When player base grows (1000s+ concurrent):

```
Shard Key: { memberNumber: "hashed" }

Benefits:
- Distributes player data evenly
- Enables horizontal scaling
- No hotspots (unlike sharding by gameType)
- Session lookup still fast (single shard query)
```

---

## SECTION 5: IMPLEMENTATION ROADMAP

### Phase 0: Shared Infrastructure (New, Sprint 1, ~25 story points)

- [ ] Create `VeratownGameFeatureBase` abstract class
- [ ] Create `PlayerGameSession` model
- [ ] Create `AppearanceManager` utilities
- [ ] Create `GameTimerManager`
- [ ] Create `GameCommandRouter`
- [ ] **Impact**: All three games use these; saves 20-30 points per game

### Phase 1: Architecture (Sprint 1-2, adjusted)

- [ ] All three games now just extend `VeratownGameFeatureBase`
- [ ] No more duplicate lifecycle code
- [ ] **Savings**: ~15 points per game = 45 points total

### Phase 2: Core Implementation (Sprint 3-6)

- [ ] All games use shared `AppearanceManager`
- [ ] **Savings**: ~15 points per game = 45 points total
- [ ] Use shared `GameTimerManager` and `GameCommandRouter`
- [ ] **Savings**: ~10 points per game = 30 points total

### Phase 3: MongoDB Atlas Features (Sprint 6-7, New ~30 points)

- [ ] Implement `GameAnalyticsService` with aggregation pipelines
- [ ] Implement `GameDiscoveryService` with Change Streams
- [ ] Implement cross-game leaderboards and player stats
- [ ] Create schema validation and TTL indexes
- [ ] **New Capability**: All three games provide stats, discovery, leaderboards

### Phase 4: Cross-Game Features (Sprint 8, New ~15 points)

- [ ] Unified achievements system
- [ ] Player progression tracking
- [ ] Social features (friend discovery, compatible matchmaking)
- [ ] **New Value**: Players want to play all three games for progression

### Phase 5: Testing & Performance (Sprint 9, adjusted)

- [ ] Test shared infrastructure thoroughly
- [ ] Performance testing with load (100+ concurrent players per game)
- [ ] Verify MongoDB index effectiveness
- [ ] Verify cache hit rates

### Phase 6: Documentation & Release (Sprint 10, adjusted)

- [ ] Document shared infrastructure patterns
- [ ] Document analytics queries
- [ ] Create admin dashboard for game metrics

---

## SECTION 6: SYNERGY SUMMARY TABLE

| Component                | RoleplayChallenge | MaidsPartyNight | KidnappersGame | Synergy        |
| ------------------------ | ----------------- | --------------- | -------------- | -------------- |
| **FeatureSystem Base**   | Extends           | Extends         | Extends        | ✅ 100% shared |
| **Lifecycle Management** | Uses              | Uses            | Uses           | ✅ 100% shared |
| **Appearance Manager**   | Uses              | Uses            | Uses           | ✅ 100% shared |
| **Timer Manager**        | Uses              | Uses            | Uses           | ✅ 100% shared |
| **Command Router**       | Uses              | Uses            | Uses           | ✅ 100% shared |
| **Player Sessions**      | Uses              | Uses            | Uses           | ✅ 100% shared |
| **MongoDB Transactions** | Uses              | Uses            | Uses           | ✅ 100% shared |
| **Schema Validation**    | Uses              | Uses            | Uses           | ✅ 100% shared |
| **Analytics**            | ✅ Leaderboard    | ✅ Play Count   | ✅ Stats       | ✅ Unified     |
| **Change Streams**       | ✅ Game Discovery | ✅ Live Updates | ✅ Game Status | ✅ Unified     |
| **Cross-Game Features**  | Achievements      | Progression     | Ranking        | ✅ Unified     |

---

## SECTION 7: EFFORT & IMPACT ANALYSIS

**Original Estimates**:

- RoleplayChallenge: 240-280 points
- MaidsPartyNight: 260-300 points
- KidnappersGame: 280-320 points
- **Total**: 780-900 points

**With Synergies**:

- Shared Infrastructure: 25 points (one-time)
- RoleplayChallenge: 200-240 points (-40 from using shared base)
- MaidsPartyNight: 220-260 points (-60 from using shared utilities)
- KidnappersGame: 240-280 points (-40 from using shared base)
- MongoDB Atlas Features: 30 points (one-time)
- Cross-Game Features: 15 points (one-time)
- **Total**: 730-815 points

**Savings**: ~60-80 story points (7-9% reduction)

**Value Added**:

- Cross-game leaderboards (new)
- Player achievement system (new)
- Game discovery system (new)
- Advanced analytics (new)
- Unified social features (new)

---

## SECTION 8: RECOMMENDATIONS

### Must-Do (Critical Path)

1. ✅ Create `VeratownGameFeatureBase` before starting any game implementation
2. ✅ Create shared `AppearanceManager` before appearance work
3. ✅ Create `GameTimerManager` before timer work
4. ✅ Implement MongoDB TTL indexes + schema validation early

### Should-Do (High Value)

1. ✅ Implement aggregation pipelines for game analytics
2. ✅ Implement Change Streams for game discovery
3. ✅ Create unified player stats in Phase 2
4. ✅ Create caching layer for leaderboards

### Nice-To-Do (Future)

1. Player recommendation engine (ML-based)
2. Vector Search for scenario similarity
3. Advanced tournament system
4. Cross-game seasonal rankings

---

## SECTION 9: REFERENCES & DEPENDENCIES

**Shared Libraries to Create**:

- `bin/games/veratown/shared/vertatownGameFeatureBase.ts`
- `bin/games/veratown/shared/playerGameSession.ts`
- `bin/games/veratown/shared/appearanceUtils.ts`
- `bin/games/veratown/shared/gameTimerManager.ts`
- `bin/games/veratown/shared/gameCommandRouter.ts`
- `bin/games/veratown/shared/gameAnalytics.ts`
- `bin/games/veratown/shared/gameDiscoveryService.ts`
- `bin/games/veratown/shared/gameStateTransaction.ts`

**MongoDB Collections**:

- `unified_characters` (extended)
- `game_sessions` (new aggregation queries)
- `appearance_audit_trail` (new indexes)
- `game_achievements` (new)
- `player_progression` (new)
- `player_relationships` (new)

**External Dependencies**:

- MongoDB 5.0+ (for transactions)
- Atlas Search (for full-text search)
- Change Streams (for real-time discovery)
- Bull/Redis (for caching)
