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

Services may be registered at runtime, but each migration remains separately
gated. The inventory canary is disabled by default and only owns the Roulette
wheel addition when explicitly enabled.

## Shared Character Actions

`CharacterActionExecutor` routes one typed appearance, communication, or
movement action to the service that owns that contract. It does not sequence
actions or own feature state. Veratown's configured-action helper owns ordered
action lists and failure continuation; longer workflows such as Shower and
Cage retain their own timing, recovery, and persistence rules.

CatDog bondage additions and Cage crate add/remove operations can use the
appearance action service behind `action_layer_feature_appearance_enabled`,
which defaults to `true`; setting it to `false` opts out. Monitor clothing removal uses the appearance
contract directly as an opt-in location action. Appearance actions preserve
server confirmation and synchronization requirements; Cage session persistence
continues through `GameStateMutationService`.
