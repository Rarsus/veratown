# Dependency Injection Container

## Overview

The `DIContainer` is a lightweight, type-safe service locator that replaces the previous global state pattern for managing application services. It provides a clean, testable way to manage dependencies with support for multiple service lifetimes, lazy initialization, circular dependency detection, and enhanced error handling.

## Features

- **Type-safe service registration and retrieval** - Full TypeScript generic support
- **Service lifetime management** - Singleton, Transient, and Lazy initialization modes
- **Lazy initialization** - Services created only when first requested
- **Circular dependency detection** - Prevents infinite loops during service resolution
- **Enhanced error handling** - Custom error types with detailed diagnostics
- **Service introspection** - Query registered services and their lifetimes
- **Testability** - Easy to create mock containers for testing

## Service Keys

The `DIServiceKeys` object provides type-safe constants for all managed services:

```typescript
- UNIFIED_CHARACTER_STORE: "unifiedCharacterStore"
- CROSS_SYSTEM_SUBSCRIBERS: "crossSystemSubscribers"
- CASINO_VENUE_SYSTEM: "casinoVenueSystem"
- CASINO_ENGINE: "casinoEngine"
- VERATOWN: "veratown"
```

## Service Lifetimes

### SINGLETON (Default)

A single instance is created and shared across all retrievals. Best for stateful services that should be shared application-wide.

```typescript
import { DIContainer, ServiceLifetime } from "./di/container";

const container = new DIContainer();

// Register with explicit SINGLETON lifetime
const store = new UnifiedCharacterStore(db);
container.register(
    DIServiceKeys.UNIFIED_CHARACTER_STORE,
    store,
    ServiceLifetime.SINGLETON,
);

// Get the same instance every time
const store1 = container.get<UnifiedCharacterStore>(
    DIServiceKeys.UNIFIED_CHARACTER_STORE,
);
const store2 = container.get<UnifiedCharacterStore>(
    DIServiceKeys.UNIFIED_CHARACTER_STORE,
);
assert.strictEqual(store1, store2); // true
```

### TRANSIENT

A new instance is created for each retrieval. Use for stateless services or when you need independent instances.
Transient services must be registered with `registerLazy`, because the factory is
called for each retrieval.

```typescript
container.registerLazy(
    "loggerFactory",
    () => new Logger(),
    ServiceLifetime.TRANSIENT,
);

const logger1 = container.get("loggerFactory");
const logger2 = container.get("loggerFactory");
assert.notStrictEqual(logger1, logger2); // true - different instances
```

### LAZY

Service is created only when first requested, then behaves as SINGLETON. Use for expensive initialization.

```typescript
container.registerLazy(
    "expensiveService",
    () => new ExpensiveService(),
    ServiceLifetime.LAZY, // Or omit - LAZY is default for registerLazy
);

// Factory not called yet
// Factory called on first get()
const service = container.get("expensiveService");
// Factory not called again
const service2 = container.get("expensiveService");
assert.strictEqual(service, service2); // true
```

## Creating a Container

```typescript
import { DIContainer } from "./di/container";

const container = new DIContainer();
```

## Registering Services

### Immediate Registration (Instance Already Created)

```typescript
import { DIContainer, DIServiceKeys } from "./di/container";
import { UnifiedCharacterStore } from "./games/shared/unifiedCharacterStore";

const container = new DIContainer();

// Register an already-created instance (SINGLETON by default)
const store = new UnifiedCharacterStore(db);
container.register(DIServiceKeys.UNIFIED_CHARACTER_STORE, store);

// Or with explicit lifetime
container.register(
    DIServiceKeys.UNIFIED_CHARACTER_STORE,
    store,
    ServiceLifetime.SINGLETON,
);

// Or using custom names
container.register("myService", serviceInstance);
```

### Lazy Registration (Factory Function)

```typescript
// Service is created only when first requested
container.registerLazy(
    "databaseConnection",
    () => new DatabaseConnection(config),
    ServiceLifetime.SINGLETON,
);

// Or with shorter syntax (SINGLETON is default)
container.registerLazy("cache", () => new Cache());
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

// Get the lifetime of a service
const lifetime = container.getLifetime(DIServiceKeys.UNIFIED_CHARACTER_STORE);
```

## Error Handling

The container uses custom `DIContainerError` for better diagnostics:

```typescript
try {
    const service = container.get("nonExistent");
} catch (error) {
    if (error instanceof DIContainerError) {
        console.error(error.code); // "SERVICE_NOT_FOUND"
        console.error(error.context); // { requestedService: "nonExistent" }
        console.error(error.getDetailedMessage()); // Full diagnostic info
    }
}

// Circular dependency detection
try {
    container.registerLazy("circular", () => container.get("circular"));
    container.get("circular"); // Throws CIRCULAR_DEPENDENCY error
} catch (error) {
    if (error instanceof DIContainerError) {
        console.error(error.code); // "CIRCULAR_DEPENDENCY"
    }
}
```

## Error Codes

- `SERVICE_NOT_FOUND` - Service not registered in container
- `CIRCULAR_DEPENDENCY` - Circular dependency detected during resolution

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
this.unifiedStore = container
    ? container.has(DIServiceKeys.UNIFIED_CHARACTER_STORE)
        ? container.get<UnifiedCharacterStore>(
              DIServiceKeys.UNIFIED_CHARACTER_STORE,
          )
        : new UnifiedCharacterStore(db)
    : global.unifiedCharacterStore || new UnifiedCharacterStore(db);
```

## Testing with Mock Services

One of the key benefits of using a DI container is easy testing with mocks:

```typescript
import { DIContainer, DIServiceKeys, ServiceLifetime } from "../di/container";
import { UnifiedCharacterStore } from "../games/shared/unifiedCharacterStore";

test("my feature test", () => {
    const mockContainer = new DIContainer();

    // Create a mock service
    const mockStore: Partial<UnifiedCharacterStore> = {
        getCasinoView: () => ({/* mock data */}),
        updateChips: async () => {
            /* mock */
        },
        // ... other methods
    };

    // Register the mock
    mockContainer.register(
        DIServiceKeys.UNIFIED_CHARACTER_STORE,
        mockStore as UnifiedCharacterStore,
    );

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

## Service Introspection

```typescript
// Get list of all registered services
const services = container.getRegisteredServices();
console.log(services); // ["service1", "service2", "service3", ...]

// Get a service's lifetime
const lifetime = container.getLifetime("myService");
console.log(lifetime); // ServiceLifetime.SINGLETON
```

## Best Practices

1. **Use Type-Safe Keys**: Always use `DIServiceKeys` constants instead of magic strings
2. **Check Before Get**: Use `has()` before `get()` if unsure if a service is registered
3. **Default Fallbacks**: Services can have sensible defaults if the container doesn't have them registered
4. **One Container Per App**: Typically create one container during initialization and pass it to systems that need it
5. **Mock in Tests**: Use the same container pattern in tests for consistency
6. **Use Lazy for Expensive Services**: Register heavy initialization services with lazy initialization
7. **Use Transient for Stateless Services**: Use TRANSIENT for stateless utility functions

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

Ideal way (with lazy initialization):

```typescript
container.registerLazy(
    DIServiceKeys.UNIFIED_CHARACTER_STORE,
    () => new UnifiedCharacterStore(db),
    ServiceLifetime.SINGLETON,
);

const store = container.get<UnifiedCharacterStore>(
    DIServiceKeys.UNIFIED_CHARACTER_STORE,
);
```

## Architecture

The DIContainer maintains a Map of service registrations, each with:

- **value**: The service instance (for immediate registration)
- **factory**: A factory function (for lazy registration)
- **lifetime**: The service lifetime (SINGLETON, TRANSIENT, or LAZY)
- **initialized**: Whether lazy initialization has occurred
- **resolving**: Flag to detect circular dependencies

When a service is requested:

1. Validate the service is registered (throw SERVICE_NOT_FOUND if not)
2. Detect circular dependencies (throw CIRCULAR_DEPENDENCY if detected)
3. Initialize if lazy and not yet initialized
4. Return cached singleton or new transient instance

This provides:

- **Type Safety**: Full TypeScript generic support
- **Clarity**: Dependencies are explicit at the API level
- **Testability**: Mock services can be injected via the container
- **Flexibility**: Services can be swapped at runtime
- **Reliability**: Circular dependencies detected, clear error messages
