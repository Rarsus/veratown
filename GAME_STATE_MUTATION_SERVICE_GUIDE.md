# Phase 1 State Mutation Foundation

`GameStateMutationServiceImpl` centralizes cross-system character mutations in
`bin/games/shared/gameStateMutationService.ts`. It uses
`UnifiedCharacterStore` for persistence, records an audit entry for each
operation, publishes cage lifecycle events, and retries transient failures
three times with 100ms, 200ms, and 400ms backoff.

Register the singleton through the DI container:

```ts
const service = new GameStateMutationServiceImpl(
    unifiedStore,
    unifiedStore.getEventBus(),
);
container.register(DIServiceKeys.GAME_STATE_MUTATION_SERVICE, service);
```

`DeviceFactory` in `bin/games/shared/deviceFactory.ts` provides the matching
creation pattern for locked appearance items:

```ts
const device = new DeviceFactory().createLockedDevice({
    assetGroup: "ItemDevices",
    assetName: "Cage",
    lockDifficulty: 3,
    owner: memberNumber,
});
```

Both services validate caller input before mutating state and are registered
by `initializeVeratownGame`.
