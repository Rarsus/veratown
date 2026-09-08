# Phase 4 Go-Live Checklist

**Status:** Active gate checklist  
**Updated:** September 8, 2026  
**Prerequisite:** Phase 3 issue #31 must be approved before this checklist can
be marked complete.

This is the production gate for the combined Veratown runtime. A checked box
must link to CI or staging evidence; local results are not sufficient for
MongoDB-backed checks.

## 1. Phase 3 release gate

- [ ] Phase 3 child issues #165, #166, #167, #168, #169, #170, #171, #172,
      and #173 are closed with evidence.
- [ ] `pnpm run types` passes on Node 22 and pnpm 11.
- [ ] `pnpm run prettier` passes.
- [ ] Unit, integration, coverage, and performance artifacts are attached to
      the release record.
- [ ] MongoDB-backed tests ran with the required replica-set support.
- [ ] DI/bootstrap, event delivery, persistence, recovery, and duplicate
      delivery checks pass.
- [ ] Phase 3 rollback rehearsal completed without deleting game, audit, or
      event records.

## 2. Configuration and secrets

- [ ] `validateConfig` accepts the staged configuration and rejects an
      intentionally malformed copy.
- [ ] Production secrets are supplied through the deployment secret store,
      never committed to `config.json`, `.env`, or this repository.
- [ ] MongoDB TLS, database name, bot accounts, Discord settings, and map
      configuration match the staged environment.
- [ ] Startup logs contain no passwords, tokens, or connection-string
      credentials.

## 3. Database and migration safety

- [ ] A timestamped `mongodump` backup completed and was restored in staging.
- [ ] Existing migration scripts were reviewed and run in staging first.
- [ ] Collection indexes and schema versions match the Phase 3 baseline.
- [ ] The backup location, operator, and restore test are recorded in the
      release record.
- [ ] No migration drops game, audit, or event collections.

## 4. Deployment sequence

1. Announce the maintenance window and freeze game-state changes.
2. Run the readiness command from the repository root:
   `pnpm run phase4:readiness`.
3. Create and verify the database backup.
4. Deploy the immutable application image or release commit.
5. Run migrations before accepting commands.
6. Start the bot and wait for connection, map, DI, and containment readiness.
7. Run the smoke tests below and record their results.
8. Remove the maintenance notice only after all critical checks pass.

## 5. Smoke tests

- [ ] Bot connects and reconnects successfully.
- [ ] Veratown map and containment readiness report healthy.
- [ ] `/bot` command routing works for Veratown, Casino, Dare, and
      Kidnappers.
- [ ] A read-only character/profile lookup succeeds.
- [ ] A test event is delivered once and duplicate delivery has no duplicate
      durable effect.
- [ ] Release/cage/kennel safety checks pass.
- [ ] Graceful shutdown completes without leaving active timers or
      subscriptions behind.

## 6. Go/no-go decision

**Go** only when every critical item above has evidence and no unresolved
high-severity issue remains. **No-go** on a failed backup restore, failed
containment readiness, failed MongoDB gate, duplicate durable effects,
credential exposure, or an untested rollback path.

Record the decision, release identifier, operator, timestamp, evidence links,
and residual risks in the deployment record.

## 7. Rollback trigger

Use the [platform rollback procedure](PLATFORM_ROLLBACK_PROCEDURE.md) when a
critical smoke test fails, authoritative state diverges, containment safety is
uncertain, or error rates do not recover during the observation window.
