# Containment capability readiness

Veratown evaluates containment capabilities independently. A failure in an
auxiliary bot must not disable an unrelated capability.

| Capability       | Required dependencies                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Cage             | Main bot room/map position, cage triggers, authoritative mutation persistence, and cage recovery     |
| Kennel           | Main bot room/map position, kennel triggers, authoritative mutation persistence, and kennel recovery |
| Release          | Main bot room/map position and authoritative mutation persistence                                    |
| Shower narration | Main bot room/map position; the shower narrator bot is optional and only affects shower narration    |
| Casino           | Casino bot room/map position when the casino bot is configured                                       |

`Veratown.getContainmentReadiness()` and
`Veratown.getContainmentDiagnostics()` expose a diagnostic for every capability.
Each diagnostic contains its state, dependency states, reason, recovery action,
and check timestamp. A room recreation or reconnect may temporarily mark a
capability unavailable; the next successful room/map binding and reconciliation
restores only the affected capability.

When Cage or Kennel is unavailable, their tile handlers send a clear
feature-unavailable response instead of silently ignoring the interaction.
