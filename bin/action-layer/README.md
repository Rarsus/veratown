# Headless Action Layer

This directory is the isolated implementation boundary for the proposed
headless action layer.

## Dependency rule

New action-layer code may depend on:

- standard library APIs;
- domain contracts in this directory;
- dedicated adapters added under this directory.

It must not import from:

- `bin/games/**`;
- legacy appearance, movement, messaging, or map helpers;
- `GameStateMutationService` or `UnifiedCharacterStore`;
- Bondage Club browser globals.

Adapters may eventually depend on `bc-bot`, but that dependency must remain
inside an adapter module. Workflows may depend on action contracts, but actions
must not decide workflow state or write durable game state.

## Migration rule

Existing feature systems remain on their current implementation until a full
vertical slice has contract tests, failure-injection coverage, and an explicit
migration task. Do not add compatibility imports here to make an old caller
fit. Create a dedicated adapter or migrate the caller in a separate change.

The package is currently opt-in and has no runtime registration.
