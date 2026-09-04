# AbstractTileFeatureSystem Usage Guide

## Overview

`AbstractTileFeatureSystem` is a base class for all tile-based feature systems in Veratown. It provides:

- **Tile Data Management**: Store and retrieve tile state via `getTile()` and `setTile()`
- **Event Publishing**: Emit feature events to subscribers via `emitFeatureEvent()`
- **Event Subscription**: Subscribe to tile events via `subscribeToEvents()`
- **Error Protection**: Automatic error handling with `guardTileHandler()`
- **Type Safety**: Full TypeScript support with interfaces for tile data and events

## Benefits

- Eliminates ~200 lines of duplicated code
- Provides consistent API across all tile-based systems
- Built-in error handling prevents single-feature crashes
- Standardized event emission for cross-system communication
- EventEmitter-based architecture allows reactive patterns

## Migration Guide

### Before: Using VeratownFeatureSystem directly

```typescript
import { API_Connector } from "bc-bot";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import { VeratownLocationDoc } from "./veratownLocationStore";

export class MyTileFeature implements VeratownFeatureSystem {
    public readonly key = "myFeature";
    public readonly label = "My Feature";
    public enabled = true;

    private tileCache = new Map<string, TileData>();

    constructor(private conn: API_Connector) {}

    public registerTriggers(): void {
        this.conn.chatRoom?.map.addTileTrigger(
            { X: 10, Y: 20 },
            guardHandler(this.key, this.onTileTrigger),
        );
    }

    private onTileTrigger = (character: API_Character) => {
        // Handle tile interaction
    };
}
```

### After: Extending AbstractTileFeatureSystem

```typescript
import { API_Connector } from "bc-bot";
import { AbstractTileFeatureSystem } from "../shared/abstractTileFeatureSystem";
import { guardHandler } from "./featureSystem";

export class MyTileFeature extends AbstractTileFeatureSystem {
    constructor(conn: API_Connector) {
        super(conn, "myFeature", "My Feature");
    }

    public registerTriggers(): void {
        this.conn.chatRoom?.map.addTileTrigger(
            { X: 10, Y: 20 },
            this.guardTileHandler(this.onTileTrigger),
        );
    }

    private onTileTrigger = (character: API_Character) => {
        // Get tile data
        const tile = this.getTile(10, 20);

        // Update tile appearance
        this.setTile(10, 20, "open_door", { locked: false });

        // Emit event for other systems to listen
        this.emitFeatureEvent("door_opened", { x: 10, y: 20 });
    };
}
```

## API Reference

### getTile(x: number, y: number): TileData | undefined

Retrieve tile data for a specific position.

```typescript
const tile = this.getTile(10, 20);
if (tile) {
    console.log(`Tile at (10,20): ${tile.asset}`);
}
```

### setTile(x: number, y: number, asset: string, metadata?: Record<string, unknown>): void

Update tile data and visual appearance on the map.

```typescript
this.setTile(10, 20, "metal_door", { locked: true, duration: 5000 });
```

### emitFeatureEvent(eventType: string, tileData: TileData, details?: Record<string, unknown>): void

Publish an event that other systems can subscribe to.

```typescript
this.emitFeatureEvent("door_unlocked", { x: 10, y: 20 }, {
    reason: "code_entered",
    duration: 10000,
});
```

### subscribeToEvents(eventType: string, listener: TileEventListener): () => void

Subscribe to feature events. Returns an unsubscribe function.

```typescript
const unsubscribe = this.subscribeToEvents("door_opened", (event) => {
    console.log(`Door opened at (${event.tileData.x}, ${event.tileData.y})`);
});

// Later, to unsubscribe:
unsubscribe();
```

### guardTileHandler(handler: (...args: any[]) => void | Promise<void>): (...args: any[]) => void

Wrap a tile trigger handler to automatically catch and log errors, preventing crashes.

```typescript
this.conn.chatRoom?.map.addTileTrigger(
    { X: 10, Y: 20 },
    this.guardTileHandler((character) => {
        // Any errors thrown here will be caught and logged
        this.handleTileInteraction(character);
    }),
);
```

### clearTile(x: number, y: number): void

Remove tile data from cache.

```typescript
this.clearTile(10, 20);
```

### getCachedTiles(): TileData[]

Get all cached tiles.

```typescript
const allTiles = this.getCachedTiles();
console.log(`${allTiles.length} tiles loaded`);
```

### clearAllTiles(): void

Clear all cached tiles.

```typescript
this.clearAllTiles();
```

## Interfaces

### TileData

```typescript
interface TileData {
    x: number;
    y: number;
    asset?: string;
    metadata?: Record<string, unknown>;
}
```

### TileFeatureEvent

```typescript
interface TileFeatureEvent {
    type: string;
    tileData: TileData;
    details?: Record<string, unknown>;
    timestamp: number;
}
```

## Examples

### Example 1: Door Lock System

```typescript
export class DoorSystem extends AbstractTileFeatureSystem {
    private doorUnlockTimers = new Map<string, NodeJS.Timer>();

    constructor(conn: API_Connector) {
        super(conn, "doorSystem", "Door Lock System");
    }

    public registerTriggers(): void {
        // Register tile triggers for door positions
        const doorPositions = [
            { x: 10, y: 20 },
            { x: 15, y: 25 },
        ];

        doorPositions.forEach(({ x, y }) => {
            this.conn.chatRoom?.map.addTileTrigger(
                { X: x, Y: y },
                this.guardTileHandler((character) => {
                    this.onCharacterAtDoor(character, x, y);
                }),
            );
        });
    }

    private onCharacterAtDoor(
        character: API_Character,
        x: number,
        y: number,
    ): void {
        const doorKey = `${x},${y}`;

        // Get door state
        let doorTile = this.getTile(x, y);
        if (!doorTile) {
            // Initialize door as locked
            this.setTile(x, y, "locked_door", { locked: true });
            doorTile = this.getTile(x, y)!;
        }

        const isLocked = doorTile.metadata?.locked ?? false;

        if (isLocked) {
            character.Tell(`The door is locked.`);
        } else {
            character.Tell(`The door is open!`);
        }
    }

    public unlockDoor(x: number, y: number, durationMs: number): void {
        const doorKey = `${x},${y}`;

        // Update tile
        this.setTile(x, y, "open_door", { locked: false });

        // Emit event
        this.emitFeatureEvent("door_unlocked", { x, y }, {
            duration: durationMs,
        });

        // Auto-lock after duration
        if (this.doorUnlockTimers.has(doorKey)) {
            clearTimeout(this.doorUnlockTimers.get(doorKey));
        }

        const timer = setTimeout(() => {
            this.lockDoor(x, y);
        }, durationMs);

        this.doorUnlockTimers.set(doorKey, timer);
    }

    private lockDoor(x: number, y: number): void {
        const doorKey = `${x},${y}`;

        // Update tile
        this.setTile(x, y, "locked_door", { locked: true });

        // Emit event
        this.emitFeatureEvent("door_locked", { x, y });

        // Clean up timer
        this.doorUnlockTimers.delete(doorKey);
    }
}
```

### Example 2: Cross-System Communication

```typescript
// Door System emits events
const doorSystem = new DoorSystem(connector);

// Alarm System listens to door events
export class AlarmSystem extends AbstractTileFeatureSystem {
    constructor(
        conn: API_Connector,
        private doorSystem: DoorSystem,
    ) {
        super(conn, "alarmSystem", "Alarm System");
    }

    public registerTriggers(): void {
        // Subscribe to door events
        this.doorSystem.subscribeToEvents("door_locked", (event) => {
            this.logger.info("Door locked, triggering alarm", event);
            this.triggerAlarm(event.tileData.x, event.tileData.y);
        });
    }

    private triggerAlarm(x: number, y: number): void {
        // Alarm logic
    }
}
```

## Testing

All AbstractTileFeatureSystem subclasses should:

1. **Extend AbstractTileFeatureSystem** instead of implementing VeratownFeatureSystem directly
2. **Use protected methods** for tile management (getTile, setTile, etc.)
3. **Leverage guardTileHandler** for all tile trigger handlers
4. **Emit events** for cross-system communication
5. **Test event subscription/emission** in unit tests

Example test:

```typescript
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { MyTileFeature } from "./myTileFeature";

describe("MyTileFeature", () => {
    let system: MyTileFeature;
    let mockConnector: Partial<API_Connector>;

    beforeEach(() => {
        mockConnector = {
            chatRoom: {
                map: {
                    setObject: () => {},
                    addTileTrigger: () => {},
                },
            },
        } as any;

        system = new MyTileFeature(mockConnector as API_Connector);
    });

    it("should emit events when tile is updated", (_, done) => {
        system.subscribeToEvents("tile_changed", (event) => {
            assert.equal(event.tileData.x, 10);
            assert.equal(event.tileData.y, 20);
            done();
        });

        system["setTile"](10, 20, "new_asset");
        system["emitFeatureEvent"]("tile_changed", {
            x: 10,
            y: 20,
            asset: "new_asset",
        });
    });
});
```

## Migration Checklist

When migrating a system to AbstractTileFeatureSystem:

- [ ] Change class declaration to extend AbstractTileFeatureSystem
- [ ] Remove manual tile cache management (tileCache Map)
- [ ] Replace guardHandler calls with this.guardTileHandler
- [ ] Replace direct map.setObject calls with this.setTile
- [ ] Add getTile calls where tile state is needed
- [ ] Add emitFeatureEvent calls for important state changes
- [ ] Update constructor to call super(conn, key, label)
- [ ] Remove VeratownFeatureSystem implementation (now inherited)
- [ ] Update unit tests to verify event emission
- [ ] Run full test suite to verify no regressions

## Performance Considerations

- **Tile caching is in-memory only**: Tiles are cached during the session but not persisted
- **Event listeners are synchronous**: Event emission is non-blocking
- **guardTileHandler adds minimal overhead**: Error wrapping is negligible
- **No GC pressure**: Tile cache uses simple Map data structure

## Future Enhancements

- Persistent tile state storage
- Tile state validation/schemas
- Event filtering and priority levels
- Tile animation support
- Cross-room tile synchronization
