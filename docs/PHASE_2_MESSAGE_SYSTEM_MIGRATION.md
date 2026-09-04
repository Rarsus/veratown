# Phase 2 Message-System Migration Status

## Delivered

| System                  | Migration                           | Compatibility                                                                              |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| Help and Guide          | `AbstractMessageFeatureSystem`      | Existing reference implementation                                                          |
| Administration Commands | `CommandSystemMessageFeatureSystem` | Authorization and case-preserving map import remain unchanged                              |
| Dare Game               | `GamePluginMessageFeatureSystem`    | Existing subcommands, region checks, mutation service, and disabled reply remain unchanged |
| Casino                  | `GamePluginMessageFeatureSystem`    | Existing command handlers and mutation-service workflows remain unchanged                  |

The game-plugin adapter validates and handles errors before delegating to each
existing command handler. It forwards the registered command and parser
arguments without adding or removing user arguments.

## Remaining delivery schedule

The six-system target is not complete with this pull request. The remaining
legacy message-driven systems require independent integration work because they
are hub `LogicBase` applications rather than Veratown `GamePlugin`s:

| Work item          | Target            | Dependency                       | Deliverable                                                 |
| ------------------ | ----------------- | -------------------------------- | ----------------------------------------------------------- |
| Roleplay Challenge | Phase 2 follow-up | Plugin lifecycle adapter         | Adapter, command parity tests, mutation-boundary audit      |
| Maids Party Night  | Phase 2 follow-up | Narrative message routing design | Adapter, scenario regression tests, mutation-boundary audit |
| Kidnappers Game    | Phase 2 follow-up | Plugin lifecycle adapter         | Adapter, command parity tests, mutation-boundary audit      |

Track this work under #42 and report its integration results, including any
approved waiver, to #59. Create one child issue per row before implementation;
each child must record its owner, target milestone, command-parity test plan,
and rollback verification. This preserves the Phase 3 handoff requirement
without representing the six-system target as complete.

## Delivery impact

Phase 3 handoff remains blocked until at least two remaining systems are
migrated (bringing the total to six), or #59 records an explicit approved
waiver. The four delivered systems can be released independently: the adapters
do not alter persisted schemas or bypass existing `GameStateMutationService`
workflows.

## Rollback

Revert the commit that migrates the affected system. No data migration is
required: the adapters delegate to the existing handlers and state services.
After reverting, run that system's command-parity tests and verify the
unchanged command registration with a room-admin and a non-admin account.
