# Pluggable Architecture Pattern - Multi-Layered Data Service Design

**Version:** 1.0  
**Date:** 2026-08-31  
**Status:** Active Standard

---

## Overview

This document defines the standard architectural pattern for game systems in RopeyBot. It ensures:

- ✅ **No circular dependencies** between systems
- ✅ **Clear separation of concerns** (character state vs system state vs reference data)
- ✅ **Pluggable components** that can be developed independently
- ✅ **Explicit cross-system dependencies** that are documented and enforced

---

## Core Principle: Three-Layer Data Architecture

Every game system must clearly separate its data into three layers:

### Layer 1: Character-Specific State (UnifiedCharacterStore)

**What:** State that belongs to individual characters (player data, appearance, bonds, stats)

**Where:** `unifiedCharacterProfiles` collection

**Who manages:** `UnifiedCharacterStore` (shared across all systems)

**Access pattern:** `const profile = await unifiedStore.getProfile(memberNumber)`

**Examples:**

- Casino: chips, score, outfit
- Dare: bonds applied, statistics, forfeits
- Veratown: role, cage status, location

**Cross-system dependency?** YES - All systems depend on this for character consistency.

---

### Layer 2: System-Specific State (System State Service)

**What:** State that is local to a specific system but NOT tied to characters (game instances, lobbies, config)

**Where:** System-specific collections (e.g., `dareState`, `casinoState`)

**Who manages:** System-specific service (e.g., `DareStateService`, `CasinoStateService`)

**Access pattern:** `const gameState = await stateService.loadState(gameId)`

**Examples:**

- Dare: game instances, lobby state, turn order
- Casino: active games, table state
- Veratown: location states, event tracking

**Cross-system dependency?** NO - Only used internally by the system.

---

### Layer 3: Generic Reference Data (Data Service)

**What:** Read-mostly data that is generic/universal, not tied to characters (card decks, role definitions, map definitions)

**Where:** Generic collections (e.g., `dares`, `playerRoles`, `veratownLocations`)

**Who manages:** System-specific data service (e.g., `DareDataService`, `VeratownDataService`)

**Access pattern:** `const dare = await dareDataService.drawDare()`

**Examples:**

- Dare: dare definitions deck
- Veratown: map definitions, locations, role definitions
- Casino: (none - uses character state and game state only)

**Cross-system dependency?** ONLY if other systems need reference data from it.

---

## Service Architecture Pattern

### Standard Three-Service Pattern

Every complex system should implement three services:

```typescript
// Layer 1: Character state access
// (already handled by UnifiedCharacterStore - no per-system implementation needed)

// Layer 2: System-specific state
export class XyzStateService {
    // Manages system instance state: games, lobbies, queues, config
}

// Layer 3: Reference/generic data
export class XyzDataService {
    // Manages read-mostly reference data: definitions, decks, settings
}
```

### Example: Dare System

```
UnifiedCharacterStore (Layer 1)
├─ Character state: bonds, stats, participation
├─ No dare-specific logic
└─ Cross-system dependency ✅

DareStateService (Layer 2)
├─ Game instances and state
├─ Lobby state
├─ Dare-specific configuration
└─ No cross-system dependency ✅

DareDataService (Layer 3)
├─ Dare definitions (dares collection)
├─ Original outfit tracking
└─ No cross-system dependency ✅
```

---

## Dependency Rules

### Rule 1: No Circular Dependencies

```
✅ ALLOWED:
DareSystem → DareStateService → MongoDB
DareSystem → DareDataService → MongoDB
DareSystem → UnifiedCharacterStore → MongoDB

❌ FORBIDDEN:
DareSystem → CasinoSystem
CasinoSystem → DareSystem
(Systems cannot depend on each other directly)
```

### Rule 2: Cross-System Data Access

If a system needs data from another system's reference data:

```typescript
// GOOD: One-way dependency through service interface
export class AchievementSystem {
    constructor(
        private dareDataService: DareDataService, // READ reference data
        private unifiedStore: UnifiedCharacterStore, // READ character state
    ) {}

    async checkAchievement(memberNumber: number) {
        const profile = await this.unifiedStore.getProfile(memberNumber);
        const dares = await this.dareDataService.getActiveDares();
        // Use both without circular dependency
    }
}

// BAD: Circular or tight coupling
export class AchievementSystem {
    constructor(private dareSystem: Dare) {} // Don't do this!
}
```

### Rule 3: Document Cross-System Dependencies

```typescript
/**
 * CROSS-SYSTEM DEPENDENCY: Reads dare definitions
 * Required for: Checking dare statistics in achievements
 * Impact if removed: Achievement system cannot verify dare-related achievements
 */
public async getRandomDare(): Promise<DareDoc> {
    return this.dareDataService.drawDare();
}
```

---

## Implementation Checklist

When creating a new system:

### Phase 1: Define Data Layers

- [ ] Identify character-specific state (goes in UnifiedCharacterStore)
- [ ] Identify system-specific state (goes in XyzStateService)
- [ ] Identify reference/generic data (goes in XyzDataService)
- [ ] Document each layer's purpose and access patterns

### Phase 2: Implement Services

- [ ] Implement XyzStateService for system-specific state
- [ ] Implement XyzDataService for reference data
- [ ] Add TypeScript interfaces for data structures
- [ ] Add comprehensive JSDoc comments with dependency notes

### Phase 3: Update Character Store (if needed)

- [ ] Add character-specific state type to UnifiedCharacterTypes
- [ ] Add view method to UnifiedCharacterStore (e.g., `getXyzView()`)
- [ ] Add update methods to UnifiedCharacterStore (e.g., `updateXyzStats()`)

### Phase 4: Integrate System

- [ ] Update main.ts to instantiate services
- [ ] Inject services into system constructor
- [ ] Ensure no circular dependencies exist
- [ ] Document all cross-system dependencies clearly

### Phase 5: Document Dependencies

- [ ] Create dependency graph in system documentation
- [ ] List which systems can depend on this system
- [ ] Document data contracts (which methods are part of public API)

---

## Data Locality Reference Table

This table shows where each type of data should live:

| Data Type             | Location                 | Service               | Access                               |
| --------------------- | ------------------------ | --------------------- | ------------------------------------ |
| Character state       | unifiedCharacterProfiles | UnifiedCharacterStore | `getProfile()`, `updateXyz*()`       |
| Character game events | gameEvents               | UnifiedCharacterStore | `recordEvent()`                      |
| **Dare-specific**     |
| Dare definitions      | dares                    | DareDataService       | `drawDare()`, `getActiveDares()`     |
| Dare game state       | dareState                | DareStateService      | `loadState()`, `saveState()`         |
| Character dare bonds  | unifiedCharacterProfiles | UnifiedCharacterStore | `getDareView()`, `updateDareStats()` |
| **Veratown-specific** |
| Location definitions  | veratownLocations        | VeratownLocationStore | `getLocation()`                      |
| Map data              | veratownMap              | VeratownMapStore      | `getMap()`                           |
| Role definitions      | playerRoles              | PlayerRoleSystem      | `getRole()`                          |
| Character roles       | unifiedCharacterProfiles | UnifiedCharacterStore | `getVeratownView()`                  |
| **Casino-specific**   |
| Game state            | (system memory)          | CasinoEngine          | `getGame()`                          |
| Character chips       | unifiedCharacterProfiles | UnifiedCharacterStore | `getCasinoView()`, `updateChips()`   |

---

## Example: Dare System Implementation

### DareDataService

```typescript
/**
 * ============================================================================
 * DARE DATA SERVICE - GENERIC (NON-CHARACTER-TIED) DATA ACCESS
 * ============================================================================
 *
 * Layer 3: Reference data for dare definitions
 * PLUGGABILITY: No dependencies outside Dare system
 * CROSS-SYSTEM: None (read-only reference data)
 */
export class DareDataService {
    constructor(private db: Db) {}

    // Public API:
    async getActiveDares(category?: string): Promise<DareDoc[]>;
    async drawDare(category?: string): Promise<DareDoc | null>;
    async addDare(dare: DareDoc): Promise<string>;
    async listDares(): Promise<DareDoc[]>;
    async validateDares(): Promise<DareValidationResult>;
}
```

### DareStateService

```typescript
/**
 * ============================================================================
 * DARE STATE SERVICE - DARE SYSTEM-SPECIFIC STATE
 * ============================================================================
 *
 * Layer 2: System state (games, lobbies, config)
 * PLUGGABILITY: No dependencies outside Dare system
 * CROSS-SYSTEM: None (dare-system-only state)
 */
export class DareStateService {
    constructor(private db: Db) {}

    // Public API:
    async loadState(stateId?: string): Promise<DareGameState>;
    async saveState(state: DareGameState): Promise<void>;
    async getGame(gameId: string): Promise<any>;
    async saveGame(gameId: string, gameData: any): Promise<void>;
    async getLobby(): Promise<LobbyState>;
    async updateLobby(players: number[]): Promise<void>;
}
```

### Dare System Integration

```typescript
/**
 * DARE PLUGIN - Main game system
 *
 * Uses three data layers:
 * 1. UnifiedCharacterStore (Layer 1) - Character bonds, stats
 * 2. DareStateService (Layer 2) - Game instances, lobbies
 * 3. DareDataService (Layer 3) - Dare definitions
 *
 * NO cross-system dependencies (pluggable/standalone)
 */
export class Dare implements GamePlugin {
    public constructor(
        private conn: API_Connector,
        private commandParser: CommandParser,
        private unifiedStore: UnifiedCharacterStore, // Layer 1
        private dareStateService: DareStateService, // Layer 2
        private dareDataService: DareDataService, // Layer 3
        config?: DareConfig,
    ) {
        this.logger.info(
            "Dare system initialized with three-layer architecture",
        );
    }

    private async handleDareDraw(character: API_Character): Promise<void> {
        // Access character state through Layer 1
        const profile = await this.unifiedStore.getProfile(
            character.MemberNumber,
        );

        // Get dare through Layer 3
        const dare = await this.dareDataService.drawDare();

        // Update game state through Layer 2
        const gameState = await this.dareStateService.loadState();
        gameState.lastDare = dare;
        await this.dareStateService.saveState(gameState);

        // Update character bonds through Layer 1
        await this.unifiedStore.applyBondage(
            character.MemberNumber,
            dare.asset,
        );
    }
}
```

---

## Dependency Injection Pattern

Services must be injected at construction time to avoid global state and circular dependencies:

```typescript
// ✅ GOOD: Explicit dependencies
export class Dare implements GamePlugin {
    public constructor(
        private conn: API_Connector,
        private commandParser: CommandParser,
        private unifiedStore: UnifiedCharacterStore,
        private dareStateService: DareStateService,
        private dareDataService: DareDataService,
    ) {}
}

// ❌ BAD: Hidden/global dependencies
export class Dare implements GamePlugin {
    public constructor(
        private conn: API_Connector,
        private commandParser: CommandParser,
    ) {
        this.unifiedStore = global.unifiedCharacterStore; // BAD!
        this.dareService = require("./dare/dareService"); // BAD!
    }
}
```

---

## Enforcing Architecture at Compile Time

### TypeScript Tips

1. **Use strict interfaces** - Don't export implementation, only interfaces
2. **Make methods private** - Only expose public API
3. **Use `readonly` properties** - Prevent external modification

```typescript
export class DareDataService {
    // Private: don't expose direct collection access
    private readonly dares: Collection<DareDoc>;

    // Public interface: controlled access
    public async drawDare(): Promise<DareDoc | null> {}

    // BAD: Exposes implementation
    public getCollection(): Collection<DareDoc> {
        return this.dares; // Don't do this!
    }
}
```

### Documentation Enforcement

Every service should have clear documentation:

- What data it manages
- What layer it operates on
- What cross-system dependencies exist
- What the public API is

---

## Versioning and Backward Compatibility

Services should maintain semantic versioning:

```typescript
export class DareDataService {
    // Current version (bump on breaking changes)
    private readonly VERSION = 1;

    // Support reading old versions
    private async migrateV0ToV1(doc: any): Promise<DareDoc> {}

    // New methods get version info
    /** @since 1.0 */
    public async drawDare(): Promise<DareDoc | null> {}

    /** @deprecated Use drawDare() instead. @since 1.0 */
    public async getDare(): Promise<DareDoc | null> {}
}
```

---

## Testing with Pluggable Architecture

Each layer can be tested independently:

```typescript
// Layer 1: Mock UnifiedCharacterStore
const mockUnifiedStore = {
    getProfile: jest.fn(),
    updateDareStats: jest.fn(),
};

// Layer 2: Mock DareStateService
const mockStateService = {
    loadState: jest.fn(),
    saveState: jest.fn(),
};

// Layer 3: Mock DareDataService
const mockDataService = {
    drawDare: jest.fn(),
};

// Test Dare system in isolation
const dare = new Dare(
    mockConn,
    mockParser,
    mockUnifiedStore,
    mockStateService,
    mockDataService,
);
await dare.handleDareDraw(mockCharacter);

expect(mockUnifiedStore.getProfile).toHaveBeenCalled();
expect(mockDataService.drawDare).toHaveBeenCalled();
expect(mockStateService.saveState).toHaveBeenCalled();
```

---

## Checklist: Is Your Service Pluggable?

- [ ] Can I create an instance without touching other systems?
- [ ] Are all dependencies explicitly injected?
- [ ] Are there no `require()` or `import` statements pulling in other game systems?
- [ ] Can I mock all dependencies for testing?
- [ ] Is data locality clear (which collection is accessed)?
- [ ] Are cross-system dependencies documented?
- [ ] Can someone add/remove this system without breaking others?

---

## Migration Guide: Converting Legacy Code

### Before (Adapter Pattern - Old)

```typescript
export class CasinoStoreAdapter {
    constructor(private unifiedStore: UnifiedCharacterStore) {}
    async getTopPlayers() {
        /* adapter logic */
    }
}
```

### After (Three-Layer Pattern - New)

```typescript
// Layer 1: Use UnifiedCharacterStore directly
const profiles = await unifiedStore.getLeaderboard(50);

// Layer 2: Create service for system state (if needed)
export class CasinoStateService {
    async loadGameState(): Promise<CasinoGameState>;
}

// Layer 3: Create service for reference data (if needed)
export class CasinoDataService {
    // (Casino doesn't have reference data, just state + character state)
}
```

---

## Summary

**The Pluggable Architecture Pattern ensures:**

1. ✅ **Clear data separation** - Each layer has a specific purpose
2. ✅ **No circular dependencies** - Systems can't depend on each other
3. ✅ **Explicit cross-system access** - Clearly documented when needed
4. ✅ **Testability** - Services can be mocked and tested in isolation
5. ✅ **Extensibility** - New systems can be added following the pattern
6. ✅ **Maintainability** - Clear ownership of data and responsibility

Follow this pattern when:

- Adding new systems
- Refactoring existing systems
- Creating shared data services
- Defining system boundaries
