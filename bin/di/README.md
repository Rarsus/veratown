# Dependency Injection Container

## Overview

The `DIContainer` is a lightweight, type-safe service locator that replaces the previous global state pattern for managing application services. It provides a clean, testable way to manage dependencies.

## Service Keys

The `DIServiceKeys` object provides type-safe constants for all managed services:

```typescript
- UNIFIED_CHARACTER_STORE: "unifiedCharacterStore"
- CROSS_SYSTEM_SUBSCRIBERS: "crossSystemSubscribers"
- CASINO_VENUE_SYSTEM: "casinoVenueSystem"
- CASINO_ENGINE: "casinoEngine"
```

## Creating a Container

```typescript
import { DIContainer } from "./di/container";

const container = new DIContainer();
```

## Registering Services

```typescript
import { DIContainer, DIServiceKeys } from "./di/container";
import { UnifiedCharacterStore } from "./games/shared/unifiedCharacterStore";

const container = new DIContainer();

// Register a service
const store = new UnifiedCharacterStore(db);
container.register(DIServiceKeys.UNIFIED_CHARACTER_STORE, store);

// Or using custom names
container.register("myService", serviceInstance);
```

## Retrieving Services

```typescript
// Get a service with type safety
const store = container.get<UnifiedCharacterStore>(
    DIServiceKeys.UNIFIED_CHARACTER_STORE,
);

// Check if a service is registered
if (container.has(DIServiceKeys.UNIFIED_CHARACTER_STORE)) {
    const store = container.get<UnifiedCharacterStore>(
        DIServiceKeys.UNIFIED_CHARACTER_STORE,
    );
}
```

## Error Handling

The `get()` method throws an error if a service is not registered:

```typescript
try {
    const store = container.get("nonExistent");
} catch (error) {
    console.error(error); // Error: Service 'nonExistent' not found in container
}
```

## Using in Game Systems

### In Veratown

```typescript
// Veratown automatically accepts a container in constructor
const game = new Veratown(connections, db, dareConfig, casinoConfig, container);

// Internally, it uses the container to access services
const store = this.container.get<UnifiedCharacterStore>(
    DIServiceKeys.UNIFIED_CHARACTER_STORE,
);
```

### In Casino

```typescript
// Pass the container to Casino
const casino = new Casino(conn, db, config, commandParser, container);

// Casino uses it to retrieve the unified store
this.unifiedStore = container.has(DIServiceKeys.UNIFIED_CHARACTER_STORE)
    ? container.get<UnifiedCharacterStore>(
          DIServiceKeys.UNIFIED_CHARACTER_STORE,
      )
    : new UnifiedCharacterStore(db);
```

## Testing with Mock Services

One of the key benefits of using a DI container is easy testing with mocks:

```typescript
import { DIContainer, DIServiceKeys } from "../di/container";
import { UnifiedCharacterStore } from "../games/shared/unifiedCharacterStore";

test("my feature test", () => {
    const mockContainer = new DIContainer();

    // Create a mock service
    const mockStore: UnifiedCharacterStore = {
        getCasinoView: () => ({/* mock data */}),
        updateChips: async () => {
            /* mock */
        },
        // ... other methods
    };

    // Register the mock
    mockContainer.register(DIServiceKeys.UNIFIED_CHARACTER_STORE, mockStore);

    // Pass mock container to your code
    const game = new Veratown(
        connections,
        db,
        config,
        undefined,
        mockContainer,
    );

    // Test your code
    // ...
});
```

## Cleaning Up

Use `clear()` to remove all services (useful in test cleanup):

```typescript
container.clear();
console.log(container.has("anyService")); // false
```

## Best Practices

1. **Use Type-Safe Keys**: Always use `DIServiceKeys` constants instead of magic strings
2. **Check Before Get**: Use `has()` before `get()` if unsure if a service is registered
3. **Default Fallbacks**: Services can have sensible defaults if the container doesn't have them registered
4. **One Container Per App**: Typically create one container during initialization and pass it to systems that need it
5. **Mock in Tests**: Use the same container pattern in tests for consistency

## Migration from Global State

Old way (global state):

```typescript
const store = global.unifiedCharacterStore || new UnifiedCharacterStore(db);
```

New way (DI container):

```typescript
const store = container.has(DIServiceKeys.UNIFIED_CHARACTER_STORE)
    ? container.get<UnifiedCharacterStore>(
          DIServiceKeys.UNIFIED_CHARACTER_STORE,
      )
    : new UnifiedCharacterStore(db);
```

## Architecture

The DIContainer maintains a Map of services indexed by string keys. When a service is requested:

1. Check if the key exists in the map
2. If yes, return the value (cast as the requested type)
3. If no, throw an error

This provides:

- **Type Safety**: Full TypeScript generic support
- **Clarity**: Dependencies are explicit at the API level
- **Testability**: Mock services can be injected via the container
- **Flexibility**: Services can be swapped at runtime
