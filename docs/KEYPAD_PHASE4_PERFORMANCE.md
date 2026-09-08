# Keypad Phase 4 Performance Report

**Measured:** 2026-09-08  
**Command:** `node --import tsx scripts/benchmark-keypad-system.ts`  
**Iterations:** 100 per operation  
**Environment:** `MongoMemoryReplSet`, refactored keypad services and door system

## Results

| Operation              |      p50 |      p95 | Phase 4 target |
| ---------------------- | -------: | -------: | -------------: |
| Door definition lookup |  0.82 ms |  1.67 ms |       < 200 ms |
| List door definitions  |  0.82 ms |  1.54 ms |       < 300 ms |
| Grant access           | 12.13 ms | 16.28 ms |       < 800 ms |
| Check access           |  0.99 ms |  1.52 ms |       < 100 ms |
| Unlock orchestration   |  7.21 ms | 10.85 ms |       < 200 ms |

All measured operations are below the Phase 4 absolute latency targets.

## Interpretation

The old monolithic implementation was removed before this benchmark, so a direct old-versus-new measurement is not available. The benchmark therefore records absolute performance of the active refactored implementation and does not claim a fabricated multiplier improvement.

The benchmark uses an in-memory MongoDB replica set. Production MongoDB latency, network conditions, and concurrent room load require a separate staging measurement before deployment decisions.

## Reproduction

```bash
node --import tsx scripts/benchmark-keypad-system.ts
```
