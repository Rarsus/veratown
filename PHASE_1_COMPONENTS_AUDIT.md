# Phase 1 Components Audit Report

**Date**: 2026-09-04  
**Repository**: Rarsus/veratown (ropeybot workspace)  
**Scope**: Complete audit of Phase 1 foundation components

---

## Summary

| Component                            | Status      | Lines | File Location                                                                                        | Notes                                             |
| ------------------------------------ | ----------- | ----- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Dependency Injection Container       | ✅ COMPLETE | 227   | [bin/di/container.ts](bin/di/container.ts)                                                           | Full implementation with error handling           |
| AbstractTileFeatureSystem            | ✅ COMPLETE | 310   | [bin/games/shared/abstractTileFeatureSystem.ts](bin/games/shared/abstractTileFeatureSystem.ts)       | Template pattern, tile cache, event emission      |
| AbstractMessageFeatureSystem         | ✅ COMPLETE | 341   | [bin/games/shared/abstractMessageFeatureSystem.ts](bin/games/shared/abstractMessageFeatureSystem.ts) | Template pattern, permission checking, validation |
| UnifiedCharacterStore                | ✅ COMPLETE | 1482  | [bin/games/shared/unifiedCharacterStore.ts](bin/games/shared/unifiedCharacterStore.ts)               | Complete unified state management                 |
| CrossSystemSubscribers               | ✅ COMPLETE | 305   | [bin/games/shared/crossSystemSubscribers.ts](bin/games/shared/crossSystemSubscribers.ts)             | Event-based coordination                          |
| GameStateMutationService             | ❌ MISSING  | —     | N/A                                                                                                  | Planned but not yet implemented                   |
| DeviceFactory                        | ❌ MISSING  | —     | N/A                                                                                                  | Planned but not yet implemented                   |
| Supporting: EventBus                 | ✅ COMPLETE | —     | [bin/games/shared/eventBus.ts](bin/games/shared/eventBus.ts)                                         | Event bus for cross-system events                 |
| Supporting: Feature System Interface | ✅ COMPLETE | —     | [bin/games/veratown/featureSystem.ts](bin/games/veratown/featureSystem.ts)                           | VeratownFeatureSystem interface                   |
| Supporting: Unified Character Types  | ✅ COMPLETE | —     | [bin/games/shared/unifiedCharacterTypes.ts](bin/games/shared/unifiedCharacterTypes.ts)               | MongoDB type definitions                          |

---

## 1. ✅ Dependency Injection Container

**Status**: FULLY IMPLEMENTED  
**File**: [bin/di/container.ts](bin/di/container.ts) (227 lines)  
**Tests**: [bin/di/**tests**/container.test.ts](bin/di/__tests__/container.test.ts) + [bin/di/**tests**/integration.test.ts](bin/di/__tests__/integration.test.ts)

### Implementation Details

```typescript
export class DIContainer {
    // Service registration and retrieval with type safety
    register<T>(name: string, value: T, lifetime?: ServiceLifetime): void;
    registerLazy<T>(
        name: string,
        factory: ServiceFactory<T>,
        lifetime?: ServiceLifetime,
    ): void;
    get<T>(name: string): T;
    has(name: string): boolean;
    getLifetime(name: string): ServiceLifetime | undefined;
    clear(): void;
    getRegisteredServices(): string[];
}

export enum ServiceLifetime {
    SINGLETON = "singleton", // Shared instance across app
    TRANSIENT = "transient", // New instance per request
    LAZY = "lazy", // Lazy transient (factory called each time)
}

export class DIContainerError extends Error {
    code: string; // SERVICE_NOT_FOUND | CIRCULAR_DEPENDENCY
    context?: Record<string, unknown>;
    getDetailedMessage(): string;
}

export const DIServiceKeys = {
    UNIFIED_CHARACTER_STORE: "unifiedCharacterStore",
    CROSS_SYSTEM_SUBSCRIBERS: "crossSystemSubscribers",
    CASINO_VENUE_SYSTEM: "casinoVenueSystem",
    CASINO_ENGINE: "casinoEngine",
    VERATOWN: "veratown",
};
```

### Features

- ✅ Type-safe service registration and retrieval
- ✅ Multiple service lifetimes (SINGLETON, TRANSIENT, LAZY)
- ✅ Lazy initialization support
- ✅ Circular dependency detection
- ✅ Enhanced error handling with DIContainerError
- ✅ Service introspection (list, query lifetimes)
- ✅ Comprehensive test coverage (44+ test cases)
- ✅ Documentation and README guide
- ✅ Integration with main.ts and game systems

### Usage Pattern

```typescript
const container = new DIContainer();
container.register(DIServiceKeys.UNIFIED_CHARACTER_STORE, store);
const store = container.get<UnifiedCharacterStore>(
    DIServiceKeys.UNIFIED_CHARACTER_STORE,
);
```

---

## 2. ✅ AbstractTileFeatureSystem

**Status**: FULLY IMPLEMENTED  
**File**: [bin/games/shared/abstractTileFeatureSystem.ts](bin/games/shared/abstractTileFeatureSystem.ts) (310 lines)  
**Tests**: [bin/games/shared/**tests**/abstractTileFeatureSystem.test.ts](bin/games/shared/__tests__/abstractTileFeatureSystem.test.ts)

### Implementation Details

```typescript
export abstract class AbstractTileFeatureSystem
    extends EventEmitter
    implements VeratownFeatureSystem
{
    // Template methods (to be implemented by subclasses)
    abstract registerTriggers(): void | Promise<void>;
    async reloadLocations(locations: VeratownLocationDoc[]): Promise<void>;

    // Protected utility methods
    protected getTile(x: number, y: number): TileData | undefined;
    protected setTile(
        x: number,
        y: number,
        asset?: string,
        metadata?: any,
    ): void;
    protected clearTile(x: number, y: number): void;
    protected emitFeatureEvent(
        type: string,
        tileData: TileData,
        details?: any,
    ): void;
    protected getCachedTiles(): TileData[];
    protected guardTileHandler(handler: Handler): Handler;
}

export interface TileData {
    x: number;
    y: number;
    asset?: string;
    metadata?: Record<string, unknown>;
}

export interface TileFeatureEvent {
    type: string;
    tileData: TileData;
    details?: Record<string, unknown>;
    timestamp: number;
}
```

### Features

- ✅ Implements template method pattern
- ✅ Tile data caching with Map<string, TileData>
- ✅ Event emission for tile-triggered features
- ✅ Event subscription support (EventEmitter-based)
- ✅ Location reloading from database
- ✅ Guard tile handler pattern
- ✅ Comprehensive test coverage

### Subclasses Using This

- KennelSystem
- KeypadDoorSystem
- CageSystem
- Other tile-triggered features in Veratown

### Usage Pattern

```typescript
class MyTileFeature extends AbstractTileFeatureSystem {
    registerTriggers(): void {
        this.conn.chatRoom?.map.addTileTrigger(
            { X: 10, Y: 20 },
            this.guardTileHandler((char) => {
                this.emitFeatureEvent("tile_triggered", { x: 10, y: 20 });
            }),
        );
    }
}
```

---

## 3. ✅ AbstractMessageFeatureSystem

**Status**: FULLY IMPLEMENTED  
**File**: [bin/games/shared/abstractMessageFeatureSystem.ts](bin/games/shared/abstractMessageFeatureSystem.ts) (341 lines)  
**Tests**: [bin/games/shared/**tests**/abstractMessageFeatureSystem.test.ts](bin/games/shared/__tests__/abstractMessageFeatureSystem.test.ts)

### Implementation Details

```typescript
export abstract class AbstractMessageFeatureSystem {
    // Template methods (to be implemented by subclasses)
    abstract handleCommand(
        sender: API_Character,
        parsed: ParsedCommand,
        msg: BC_Server_ChatRoomMessage,
    ): Promise<void>;

    // Protected utility methods
    protected isEnabled(): boolean;
    protected getDisabledMessage(): string;
    protected validateUserPermission(
        sender: API_Character,
        args: string[],
    ): PermissionCheckResult;
    protected parseCommand(args: string[]): ParsedCommand;
    protected validateCommand(parsed: ParsedCommand): ValidationResult;
    protected async sendMessage(
        memberNumber: number,
        msg: string,
    ): Promise<void>;

    // Main entry point
    async processMessage(
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ): Promise<void>;
}

export interface ValidationResult {
    valid: boolean;
    message?: string;
    errorCode?: string;
}

export interface ParsedCommand {
    command: string;
    subcommand?: string;
    args: string[];
}

export interface PermissionCheckResult {
    allowed: boolean;
    reason?: string;
}
```

### Features

- ✅ Implements template method pattern
- ✅ Command parsing and validation
- ✅ Permission checking framework
- ✅ Disabled state support
- ✅ Error handling and logging
- ✅ Message sending wrapper
- ✅ Comprehensive test coverage

### Subclasses Using This

- Dare Game System message handlers
- Administration Commands
- Roleplay Challenge System
- Other message-triggered features

### Usage Pattern

```typescript
class MyFeature extends AbstractMessageFeatureSystem {
    async handleCommand(
        sender: API_Character,
        parsed: ParsedCommand,
    ): Promise<void> {
        switch (parsed.command) {
            case "help":
                await this.sendMessage(sender.MemberNumber, "Usage: ...");
                break;
        }
    }
}
```

---

## 4. ✅ UnifiedCharacterStore

**Status**: FULLY IMPLEMENTED  
**File**: [bin/games/shared/unifiedCharacterStore.ts](bin/games/shared/unifiedCharacterStore.ts) (1482 lines)  
**Tests**: [bin/games/**tests**/unifiedCharacterStore.test.ts](bin/games/__tests__/unifiedCharacterStore.test.ts)

### Implementation Details

```typescript
export class UnifiedCharacterStore {
    // Profile management
    getProfile(memberNumber: number): Promise<UnifiedCharacterProfile>;

    // Casino system view
    getCasinoView(memberNumber: number): Promise<CasinoView>;
    updateChips(
        memberNumber: number,
        amount: number,
        reason: string,
    ): Promise<void>;
    updateCasinoStats(
        memberNumber: number,
        stats: Partial<CasinoState>,
    ): Promise<void>;
    lockChips(memberNumber: number): Promise<void>;
    unlockChips(memberNumber: number): Promise<void>;

    // Dare system view
    getDareView(memberNumber: number): Promise<DareView>;
    applyBondage(memberNumber: number, bondageData: BondageInfo): Promise<void>;
    removeBondage(memberNumber: number): Promise<void>;
    spendChipsToEscape(memberNumber: number, amount: number): Promise<void>;
    suspendAllGames(memberNumber: number): Promise<number>;
    resumeSuspendedGames(memberNumber: number): Promise<number>;

    // Veratown system view
    getVeratownView(memberNumber: number): Promise<VeratownView>;
    updatePosition(memberNumber: number, location: string): Promise<void>;
    recordCageEntry(memberNumber: number, cageType: string): Promise<void>;
    recordCageExit(memberNumber: number): Promise<void>;

    // Event management
    recordEvent(event: GameEvent): Promise<void>;
    isDuplicateEvent(event: GameEvent): Promise<boolean>;
    getUnprocessedEvents(limit?: number): Promise<GameEvent[]>;
    markEventProcessed(eventId: ObjectId): Promise<void>;

    // Query and reporting
    findProfiles(
        query: Record<string, unknown>,
        limit?: number,
    ): Promise<UnifiedCharacterProfile[]>;
    getLeaderboard(field: string, limit?: number): Promise<LeaderboardEntry[]>;
    getActivePlayers(): Promise<UnifiedCharacterProfile[]>;
    getEventStats(memberNumber: number): Promise<EventStats>;
    getAuditTrail(memberNumber: number): Promise<AuditEntry[]>;

    // Keypad access
    addKeypadAccess(memberNumber: number, device: string): Promise<void>;
    removeKeypadAccess(memberNumber: number, device: string): Promise<void>;
    getKeypadAccess(memberNumber: number): Promise<KeypadAccessRecord>;
    hasKeypadAccess(memberNumber: number, device: string): Promise<boolean>;

    // Utilities
    getEventBus(): EventBus;
}
```

### Data Model

- **UnifiedCharacterProfile**: Single MongoDB document per character containing:
    - Basic profile (name, member number)
    - Casino state (chips, stats, locked state)
    - Dare state (bondage, suspended games)
    - Veratown state (location, cages)
    - Cross-system state (relationships, events)
    - Keypad access records
    - Audit trail

### Features

- ✅ Single source of truth for all player data
- ✅ System-specific view projections (getCasinoView, getDareView, getVeratownView)
- ✅ Type-safe operations with MongoDB type validation
- ✅ Event-based cross-system coordination
- ✅ Atomic transactions for multi-system operations
- ✅ Audit trail for compliance
- ✅ Leaderboard and reporting queries
- ✅ Keypad access management
- ✅ Comprehensive test coverage

### Integration Status

- ✅ Casino system: Using UnifiedCharacterStore directly
- ✅ Dare system: Using UnifiedCharacterStore directly
- ✅ Veratown system: Using UnifiedCharacterStore for location/cage management
- ✅ Global initialization in main.ts

---

## 5. ✅ CrossSystemSubscribers

**Status**: FULLY IMPLEMENTED  
**File**: [bin/games/shared/crossSystemSubscribers.ts](bin/games/shared/crossSystemSubscribers.ts) (305 lines)  
**Tests**: [bin/games/**tests**/integration/crossSystemIntegration.test.ts](bin/games/__tests__/integration/crossSystemIntegration.test.ts)

### Implementation Details

```typescript
export class CrossSystemSubscribers {

    constructor(
        private unifiedStore: UnifiedCharacterStore,
        private casino?: ExternalCasinoSystem,
        private dare?: ExternalDareSystem,
        private veratown?: ExternalVeratownSystem
    )

    async initialize(): Promise<void>

    private setupBondageSubscribers(): void
    private setupCageSubscribers(): void
    private setupChipTransferSubscribers(): void
    private setupAuditSubscribers(): void
}

// External system interfaces for loose coupling
export interface ExternalCasinoSystem {
    lockWinnings?(memberNumber: number): Promise<void>
    unlockWinnings?(memberNumber: number): Promise<void>
}

export interface ExternalDareSystem {
    removeParticipant?(memberNumber: number): Promise<void>
    blockRedressing?(memberNumber: number, until: number): Promise<void>
}

export interface ExternalVeratownSystem {
    recordRelationship?(player1: number, player2: number, type: string): Promise<void>
}
```

### Event Subscriptions

#### 1. Bondage ↔ Casino (Dare → Casino)

- **Trigger**: `bondage_applied` event
- **Action**: Locks casino winnings to prevent withdrawal
- **Reverse**: `bondage_removed` unlocks winnings

#### 2. Cage ↔ Dare (Veratown → Dare)

- **Trigger**: `cage_entry` event
- **Action**: Removes player from active dare games
- **Side Effect**: Blocks redressing until cage exit

#### 3. Chip Transfers (Casino → Veratown)

- **Trigger**: `chip_transfer` event
- **Action**: Records relationships/transactions in Veratown

#### 4. Event Auditing

- **Trigger**: All events
- **Action**: Records audit entries for compliance

### Features

- ✅ Event-driven architecture via EventBus
- ✅ Loose coupling (interface-based dependencies)
- ✅ Idempotent event handling (handles duplicates)
- ✅ Multiple coordination patterns
- ✅ Comprehensive test coverage
- ✅ Graceful handling of missing external systems

### Usage Pattern

```typescript
const subscribers = new CrossSystemSubscribers(
    unifiedStore,
    casinoSystem,
    dareSystem,
    veratownSystem,
);
await subscribers.initialize();
```

---

## 6. ❌ GameStateMutationService (MISSING)

**Status**: NOT IMPLEMENTED  
**Planned File**: `bin/games/shared/gameStateMutationService.ts`  
**Issue**: [#33](https://github.com/Rarsus/veratown/issues/33)

### Specification (from VERATOWN_UNIFIED_PLATFORM_GITHUB_ISSUES.md)

```typescript
// Planned interface
export interface GameStateMutationService {
    updateCasinoState(
        memberNumber: number,
        updates: Partial<CasinoState>,
    ): Promise<void>;
    updateDareState(
        memberNumber: number,
        updates: Partial<DareState>,
    ): Promise<void>;
    updateVeratownState(
        memberNumber: number,
        updates: Partial<VeratownState>,
    ): Promise<void>;
    recordEvent(event: GameEvent): Promise<void>;
    // ... transaction wrapper methods
}

export class GameStateMutationServiceImpl implements GameStateMutationService {
    constructor(
        private store: UnifiedCharacterStore,
        private eventBus: EventBus,
    ) {}
    // Implementation would wrap store mutations with:
    // - Transaction support
    // - Event emission
    // - Type validation
    // - Audit logging
}
```

### Purpose

- Centralized state mutation gateway (currently systems call UnifiedCharacterStore directly)
- Transaction support for atomic multi-system updates
- Event emission enforcement (ensures all mutations emit events)
- Audit trail capture
- Type-safe mutation patterns

### Estimated Effort

- 150-200 lines of interface + implementation
- ~9 story points (per GitHub issues estimation)
- Blocked on: Issue #36 (DI Container) - ✅ NOW UNBLOCKED

### Impact

- Systems should call `stateMutationService.updateXXX()` instead of `store.updateXXX()`
- Improves auditability and consistency
- Enables transaction support for future multi-system operations

---

## 7. ❌ DeviceFactory (MISSING)

**Status**: NOT IMPLEMENTED  
**Planned File**: `bin/games/shared/deviceFactory.ts`  
**Issue**: [#37](https://github.com/Rarsus/veratown/issues/37)

### Specification (from VERATOWN_UNIFIED_PLATFORM_GITHUB_ISSUES.md)

```typescript
// Planned class
export class DeviceFactory {
    static createLockedDevice(config: {
        type: string;
        restraintType?: string;
        owner?: number;
        reason?: string;
    }): LockedDevice;

    static createRandomDevice(): LockedDevice;
    static createDeviceWithModifier(
        base: LockedDevice,
        modifier: string,
    ): LockedDevice;
}

// Usage
const collar = DeviceFactory.createLockedDevice({
    type: "collar",
    restraintType: "bondage",
    owner: 123,
    reason: "Dare game escape",
});
```

### Purpose

- Centralized device creation (currently scattered across game systems)
- Consistent device initialization
- Enables device modifiers (tighter/looser restraints)
- Supports random device generation for games
- Type-safe device construction

### Estimated Effort

- 100-150 lines
- ~3 story points
- No blockers - ready to start

### Current Workaround

- Systems directly manipulate device objects
- No unified device creation pattern
- Potential for inconsistencies

---

## 8. ✅ Supporting Components

### EventBus

**File**: [bin/games/shared/eventBus.ts](bin/games/shared/eventBus.ts)  
**Status**: ✅ COMPLETE

Event pub/sub pattern for cross-system communication:

```typescript
class EventBus {
    subscribe(
        eventType: string,
        listener: (event: GameEvent) => Promise<void>,
    ): void;
    publish(event: GameEvent): Promise<void>;
    getEventCount(): number;
}
```

### VeratownFeatureSystem Interface

**File**: [bin/games/veratown/featureSystem.ts](bin/games/veratown/featureSystem.ts)  
**Status**: ✅ COMPLETE

Interface implemented by both AbstractTileFeatureSystem and AbstractMessageFeatureSystem:

```typescript
interface VeratownFeatureSystem {
    readonly key: string;
    readonly label: string;
    enabled: boolean;
    registerTriggers(): void | Promise<void>;
}
```

### Unified Character Types

**File**: [bin/games/shared/unifiedCharacterTypes.ts](bin/games/shared/unifiedCharacterTypes.ts)  
**Status**: ✅ COMPLETE

MongoDB type definitions with full TypeScript validation:

- UnifiedCharacterProfile
- CasinoState, CasinoView
- DareState, DareView
- VeratownState, VeratownView
- GameEvent, AuditEntry
- KeypadAccessRecord, SuspendedGame
- Type validators and creators

---

## Test Coverage Summary

### Unit Tests (Passing ✅)

- [bin/di/**tests**/container.test.ts](bin/di/__tests__/container.test.ts) - 44+ test cases
- [bin/di/**tests**/integration.test.ts](bin/di/__tests__/integration.test.ts) - Integration tests
- [bin/games/shared/**tests**/abstractTileFeatureSystem.test.ts](bin/games/shared/__tests__/abstractTileFeatureSystem.test.ts)
- [bin/games/shared/**tests**/abstractMessageFeatureSystem.test.ts](bin/games/shared/__tests__/abstractMessageFeatureSystem.test.ts)

### Integration Tests (Passing ✅)

- [bin/games/**tests**/integration/crossSystemIntegration.test.ts](bin/games/__tests__/integration/crossSystemIntegration.test.ts)
- [bin/games/**tests**/integration/casinoMigration.test.ts](bin/games/__tests__/integration/casinoMigration.test.ts)
- [bin/games/**tests**/integration/epicTwoIntegration.test.ts](bin/games/__tests__/integration/epicTwoIntegration.test.ts)

### Test Command

```bash
npm run test:unit
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│  (Casino, Dare, Veratown Game Systems)                      │
└──────────────────┬──────────────────────────────────────────┘
                   │
          ┌────────▼────────┐
          │  DIContainer    │  (DI Pattern)
          │  ✅ COMPLETE    │
          │  227 lines      │
          └────────┬────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
    ▼              ▼              ▼
┌─────────┐  ┌──────────┐  ┌──────────────┐
│ Abstract│  │ Abstract │  │   Unified    │
│  Tile   │  │ Message  │  │ Character    │
│ Feature │  │ Feature  │  │  Store       │
│ System  │  │ System   │  │              │
│✅ 310   │  │✅ 341    │  │✅ 1482 lines │
└────┬────┘  └────┬─────┘  └──────┬───────┘
     │            │               │
     │    ┌───────▼───────┐       │
     │    │  Event Bus    │       │
     │    │   ✅ Complete │       │
     │    └───────┬───────┘       │
     │            │               │
     └────────────┼───────────────┘
                  │
          ┌───────▼────────┐
          │ CrossSystem    │
          │ Subscribers    │
          │ ✅ 305 lines   │
          └────────────────┘
```

---

## Deployment & Integration Status

### ✅ Production Ready

- Dependency Injection Container
- AbstractTileFeatureSystem
- AbstractMessageFeatureSystem
- UnifiedCharacterStore
- CrossSystemSubscribers
- EventBus
- Type system

### ⏳ Ready to Implement (No Blockers)

- DeviceFactory (3 story points, ~1-2 days)
- GameStateMutationService (9 story points, ~3-4 days)

### Next Steps

1. **Implement DeviceFactory** (~1 day)
    - Create unified device creation pattern
    - Add device modifier support

2. **Implement GameStateMutationService** (~3 days)
    - Create interface and implementation
    - Integrate with DIContainer
    - Update systems to use mutation service

3. **Full System Refactor** (Optional, Phase 2)
    - Replace all direct `store.updateXXX()` calls with `stateMutationService.updateXXX()`
    - Add transaction support where needed

---

## Verification Commands

```bash
# Verify all Phase 1 components compile
npm run build

# Run all tests
npm run test:unit

# Check line counts
wc -l bin/games/shared/abstract*.ts bin/games/shared/unifiedCharacterStore.ts \
  bin/games/shared/crossSystemSubscribers.ts bin/di/container.ts

# Check imports work
npx tsx -e "
  import { DIContainer } from './bin/di/container.js';
  import { AbstractTileFeatureSystem } from './bin/games/shared/abstractTileFeatureSystem.js';
  import { AbstractMessageFeatureSystem } from './bin/games/shared/abstractMessageFeatureSystem.js';
  import { UnifiedCharacterStore } from './bin/games/shared/unifiedCharacterStore.js';
  import { CrossSystemSubscribers } from './bin/games/shared/crossSystemSubscribers.js';
  console.log('✅ All Phase 1 components verified');
"
```

---

## Documentation References

- [bin/di/README.md](bin/di/README.md) - DI Container comprehensive guide
- [VERATOWN_DEVELOPER_QUICK_REFERENCE.md](VERATOWN_DEVELOPER_QUICK_REFERENCE.md) - Quick API reference
- [VERATOWN_UNIFIED_PLATFORM_ARCHITECTURE.md](VERATOWN_UNIFIED_PLATFORM_ARCHITECTURE.md) - Architecture details
- [VERATOWN_UNIFIED_PLATFORM_GITHUB_ISSUES.md](VERATOWN_UNIFIED_PLATFORM_GITHUB_ISSUES.md) - Phase 1 specifications
- [ABSTRACT_TILE_FEATURE_SYSTEM_GUIDE.md](ABSTRACT_TILE_FEATURE_SYSTEM_GUIDE.md) - Tile system usage
- [ABSTRACT_MESSAGE_FEATURE_SYSTEM_GUIDE.md](ABSTRACT_MESSAGE_FEATURE_SYSTEM_GUIDE.md) - Message system usage
- [MIGRATION_EXAMPLES.md](MIGRATION_EXAMPLES.md) - Migration patterns
