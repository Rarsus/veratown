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
import {
    GameStateMutationService,
    GameStateMutationServiceImpl,
} from "./gameStateMutationService";

import { createLogger } from "../../logging";

/**
 * External system interfaces for event subscribers.
 * These are placeholder signatures - actual systems have richer interfaces.
 */
export interface ExternalCasinoSystem {
    lockWinnings?(memberNumber: number): Promise<void>;
    unlockWinnings?(memberNumber: number): Promise<void>;
    onLocationChanged?(event: GameEvent): Promise<void>;
}

export interface ExternalDareSystem {
    removeParticipant?(memberNumber: number): Promise<void>;
    blockRedressing?(memberNumber: number, until: number): Promise<void>;
    onLocationChanged?(event: GameEvent): Promise<void>;
}

export interface ExternalVeratownSystem {
    recordRelationship?(
        player1: number,
        player2: number,
        type: string,
    ): Promise<void>;
    onLocationChanged?(event: GameEvent): Promise<void>;
}

/**
 * CrossSystemSubscribers sets up event listeners for cross-system coordination.
 *
 * Each subscription represents a feature that depends on visibility across systems.
 * Subscriptions are idempotent and can handle duplicate events.
 */
export class CrossSystemSubscribers {
    private readonly logger = createLogger("CrossSystemSubscribers");
    private eventBus: EventBus;
    private readonly handledLocationEvents = new Set<string>();

    constructor(
        private unifiedStore: UnifiedCharacterStore,
        private casino?: ExternalCasinoSystem,
        private dare?: ExternalDareSystem,
        private veratown?: ExternalVeratownSystem,
        private mutationService?: GameStateMutationService,
    ) {
        this.eventBus = unifiedStore.getEventBus();
        this.mutationService ??= new GameStateMutationServiceImpl(
            unifiedStore,
            this.eventBus,
        );
    }

    /**
     * Initialize all event subscriptions.
     * Must be called after systems are initialized.
     */
    public async initialize(): Promise<void> {
        this.setupBondageSubscribers();
        this.setupCageSubscribers();
        this.setupChipTransferSubscribers();
        this.setupLocationSubscribers();
        this.setupAuditSubscribers();
    }

    /**
     * Feature: Bondage affects Casino winnings
     *
     * When Dare applies bondage:
     * - Casino should lock winnings (prevent withdrawal/spending)
     * - Player must spend chips to escape or wait for bondage to expire
     *
     * When bondage is removed:
     * - Casino should unlock winnings
     * - Player can spend chips normally again
     */
    private setupBondageSubscribers(): void {
        // Bondage applied → Lock casino chips
        this.eventBus.subscribe("bondage_applied", async (event: GameEvent) => {
            try {
                const profile = await this.unifiedStore.getProfile(
                    event.target,
                );

                // Lock recent winnings or a default amount
                // Use recentWinnings if tracked, otherwise lock 50% of current chips
                const amountToLock =
                    profile.casino.recentWinnings > 0
                        ? profile.casino.recentWinnings
                        : Math.ceil(profile.casino.chips * 0.5);

                if (amountToLock > 0) {
                    await this.mutationService!.lockChips(
                        event.target,
                        amountToLock,
                        "bondage",
                        event.data.lockedUntil as number | undefined,
                    );
                }
            } catch (error) {
                const logger = createLogger("CrossSystemSubscribers");
                logger.error("Failed to lock chips on bondage", error, {
                    memberNumber: event.target,
                    operation: "bondage_applied",
                });
            }
        });

        // Bondage removed → Unlock casino chips
        this.eventBus.subscribe("bondage_removed", async (event: GameEvent) => {
            try {
                // Unlock all chips
                await this.mutationService!.unlockChips(event.target, 0);
            } catch (error) {
                const logger = createLogger("CrossSystemSubscribers");
                logger.error(
                    "Failed to unlock chips on bondage removal",
                    error,
                    {
                        memberNumber: event.target,
                        operation: "bondage_removed",
                    },
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
            try {
                // Phase 3.3: Suspend all active games when player caged
                const suspendedCount = await this.mutationService!.suspendGame(
                    event.target,
                    "cage_entry",
                    "cage_entry",
                );

                if (suspendedCount > 0) {
                    // Also try to remove from dare if available
                    if (this.dare?.removeParticipant) {
                        await this.dare.removeParticipant(event.target);
                    }
                }
            } catch (error) {
                const logger = createLogger("CrossSystemSubscribers");
                logger.error("Failed to suspend games on cage entry", error, {
                    memberNumber: event.target,
                    operation: "cage_entry",
                });
            }
        });

        // Phase 3.3: Cage exit → Resume suspended games
        this.eventBus.subscribe("cage_exit", async (event: GameEvent) => {
            try {
                // Resume all suspended games when player uncaged
                await this.mutationService!.resumeGame(
                    event.target,
                    "cage_entry",
                );
            } catch (error) {
                const logger = createLogger("CrossSystemSubscribers");
                logger.error("Failed to resume games on cage exit", error, {
                    memberNumber: event.target,
                    operation: "cage_exit",
                });
            }
        });
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
                this.logger?.error(
                    "CrossSystemSubscribers: Failed to record relationship:",
                    error as any,
                );
            }
        });
    }

    private setupLocationSubscribers(): void {
        const handle = async (event: GameEvent): Promise<void> => {
            const transitionId =
                typeof event.data.transitionId === "string"
                    ? event.data.transitionId
                    : `${event.target}:${event.timestamp}`;
            const key = `${event.type}:${transitionId}`;
            if (this.handledLocationEvents.has(key)) return;
            this.handledLocationEvents.add(key);

            await Promise.allSettled(
                [
                    this.casino?.onLocationChanged?.(event),
                    this.dare?.onLocationChanged?.(event),
                    this.veratown?.onLocationChanged?.(event),
                ].filter((result): result is Promise<void> => Boolean(result)),
            );
        };

        this.eventBus.subscribe("location_entered", handle);
        this.eventBus.subscribe("location_exited", handle);
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
            if ((event.type as any) === "audit_logged") return;

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
                    "location_entered",
                    "location_exited",
                ];

                if (majorEventTypes.includes(event.type)) {
                    await this.mutationService!.recordAuditEntry(
                        event.target,
                        `cross_system_${event.type}`,
                        {
                            source: event.source,
                            originalEvent: event.type,
                        },
                        event.actor,
                    );
                }
            } catch (error) {
                // Don't fail if audit logging fails
                this.logger?.warn(
                    "CrossSystemSubscribers: Audit logging failed:",
                    error as any,
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
