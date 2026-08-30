/**
 * Cross-System Event Subscribers
 *
 * This module sets up event subscriptions that enable cross-system coordination
 * between Casino, Dare, and Veratown systems via the unified event bus.
 *
 * Phase 2.2: Initial cross-system features:
 * 1. Bondage blocks casino winnings (Dare → Casino)
 * 2. Cage entry removes from games (Veratown → Dare)
 * 3. Chip transfers update relationships (Casino → Veratown)
 *
 * Usage:
 *   const subscribers = new CrossSystemSubscribers(
 *       unifiedStore,
 *       casino,
 *       dare,
 *       veratown,
 *   );
 *   await subscribers.initialize();
 */

import { EventBus } from "./eventBus";
import { UnifiedCharacterStore } from "./unifiedCharacterStore";
import { GameEvent } from "./unifiedCharacterTypes";

/**
 * External system interfaces for event subscribers.
 * These are placeholder signatures - actual systems have richer interfaces.
 */
export interface ExternalCasinoSystem {
    lockWinnings?(memberNumber: number): Promise<void>;
    unlockWinnings?(memberNumber: number): Promise<void>;
}

export interface ExternalDareSystem {
    removeParticipant?(memberNumber: number): Promise<void>;
    blockRedressing?(memberNumber: number, until: number): Promise<void>;
}

export interface ExternalVeratownSystem {
    recordRelationship?(
        player1: number,
        player2: number,
        type: string,
    ): Promise<void>;
}

/**
 * CrossSystemSubscribers sets up event listeners for cross-system coordination.
 *
 * Each subscription represents a feature that depends on visibility across systems.
 * Subscriptions are idempotent and can handle duplicate events.
 */
export class CrossSystemSubscribers {
    private eventBus: EventBus;

    constructor(
        private unifiedStore: UnifiedCharacterStore,
        private casino?: ExternalCasinoSystem,
        private dare?: ExternalDareSystem,
        private veratown?: ExternalVeratownSystem,
    ) {
        this.eventBus = unifiedStore.getEventBus();
    }

    /**
     * Initialize all event subscriptions.
     * Must be called after systems are initialized.
     */
    public async initialize(): Promise<void> {
        this.setupBondageSubscribers();
        this.setupCageSubscribers();
        this.setupChipTransferSubscribers();
        this.setupAuditSubscribers();
    }

    /**
     * Feature: Bondage affects Casino winnings
     *
     * When Dare applies bondage:
     * - Casino should lock winnings (prevent withdrawal)
     * - Casino shows "bonded" indicator on winnings
     *
     * When bondage is removed:
     * - Casino should unlock winnings
     * - Player can withdraw normally
     */
    private setupBondageSubscribers(): void {
        // Bondage applied → Lock casino winnings
        this.eventBus.subscribe("bondage_applied", async (event: GameEvent) => {
            if (!this.casino?.lockWinnings) return;

            try {
                await this.casino.lockWinnings(event.target);
            } catch (error) {
                console.error(
                    "CrossSystemSubscribers: Failed to lock winnings for",
                    event.target,
                    error,
                );
            }
        });

        // Bondage removed → Unlock casino winnings
        this.eventBus.subscribe("bondage_removed", async (event: GameEvent) => {
            if (!this.casino?.unlockWinnings) return;

            try {
                await this.casino.unlockWinnings(event.target);
            } catch (error) {
                console.error(
                    "CrossSystemSubscribers: Failed to unlock winnings for",
                    event.target,
                    error,
                );
            }
        });
    }

    /**
     * Feature: Caged players can't play dares
     *
     * When player enters cage:
     * - Dare should remove them from all games
     * - Dare should prevent them from joining new games
     *
     * When player exits cage:
     * - Dare allows them to rejoin
     */
    private setupCageSubscribers(): void {
        // Cage entry → Remove from dare games
        this.eventBus.subscribe("cage_entry", async (event: GameEvent) => {
            if (!this.dare?.removeParticipant) return;

            try {
                await this.dare.removeParticipant(event.target);
            } catch (error) {
                console.error(
                    "CrossSystemSubscribers: Failed to remove from dare games:",
                    event.target,
                    error,
                );
            }
        });

        // Cage exit → (Future) allow rejoin to dare games
        // (This will be implemented in Phase 3)
    }

    /**
     * Feature: Chip transfers build relationships
     *
     * When chips are transferred between players:
     * - Veratown records an economic relationship
     * - Can be used for partnership/rivalry features
     * - Enables social leaderboards
     */
    private setupChipTransferSubscribers(): void {
        this.eventBus.subscribe("chip_transfer", async (event: GameEvent) => {
            if (!this.veratown?.recordRelationship) return;

            const data = event.data as { amount?: number };
            const amount = data?.amount ?? 0;

            // Only record significant transfers (> 100 chips)
            if (amount < 100) return;

            try {
                // Record bidirectional relationship
                await this.veratown.recordRelationship(
                    event.actor,
                    event.target,
                    "chip_transfer",
                );

                await this.veratown.recordRelationship(
                    event.target,
                    event.actor,
                    "chip_received",
                );
            } catch (error) {
                console.error(
                    "CrossSystemSubscribers: Failed to record relationship:",
                    event.actor,
                    event.target,
                    error,
                );
            }
        });
    }

    /**
     * Audit feature: Log all cross-system events
     *
     * Records every cross-system event in the audit trail for investigation.
     * Useful for debugging and compliance tracking.
     */
    private setupAuditSubscribers(): void {
        this.eventBus.subscribe("*", async (event: GameEvent) => {
            // Skip logging of audit events themselves (prevent infinite recursion)
            if (event.type === "audit_logged") return;

            try {
                // Record major events in audit trail
                const majorEventTypes = [
                    "bondage_applied",
                    "bondage_removed",
                    "cage_entry",
                    "cage_exit",
                    "chip_transfer",
                    "chips_earned",
                    "character_frozen",
                ];

                if (majorEventTypes.includes(event.type)) {
                    await this.unifiedStore.recordAuditEntry(
                        event.target,
                        `cross_system_${event.type}`,
                        event.actor,
                        {
                            source: event.source,
                            originalEvent: event.type,
                        },
                    );
                }
            } catch (error) {
                // Don't fail if audit logging fails
                console.warn(
                    "CrossSystemSubscribers: Audit logging failed:",
                    error,
                );
            }
        });
    }

    /**
     * Set casino system for event subscriptions.
     * Call this after casino system is initialized.
     */
    public setCasinoSystem(system: ExternalCasinoSystem | undefined): void {
        this.casino = system;
    }

    /**
     * Set dare system for event subscriptions.
     * Call this after dare system is initialized.
     */
    public setDareSystem(system: ExternalDareSystem | undefined): void {
        this.dare = system;
    }

    /**
     * Set veratown system for event subscriptions.
     * Call this after veratown system is initialized.
     */
    public setVeratownSystem(system: ExternalVeratownSystem | undefined): void {
        this.veratown = system;
    }

    /**
     * Get event bus for manual subscription (testing, custom logic).
     */
    public getEventBus(): EventBus {
        return this.eventBus;
    }
}
