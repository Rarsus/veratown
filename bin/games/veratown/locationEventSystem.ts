/**
 * Feature 1.3.5: Location Event System
 *
 * Creates dynamic location-based events that trigger based on player
 * occupancy, time of day, or manual triggers. Supports narration,
 * consequences, and multi-player experiences.
 *
 * Example usage:
 * - "Dinner call" when 5+ players in dining hall
 * - Random ambient events (birds chirping, etc.)
 * - Daily recurring events (clock strikes noon)
 * - Triggered events (alarms when intruder detected)
 */

import { Collection, Db } from "mongodb";
import { createLogger } from "../../logging";
import type { EventBus } from "../shared/eventBus";
import type { GameEvent } from "../shared/unifiedCharacterTypes";
import type { GameStateMutationService } from "../shared/gameStateMutationService";

export type EventTriggerType =
    "occupancy" | "daily" | "random" | "manual" | "entry" | "exit";

export interface LocationEventCondition {
    locationKey?: string;
    minOccupancy?: number;
    requiredProgression?: string;
}

export interface LocationEventOutcome {
    type: "bondage" | "emotion" | "location_effect" | "progression" | "custom";
    value: unknown;
}

export interface LocationTransition {
    transitionId: string;
    memberNumber: number;
    fromLocationKey?: string;
    toLocationKey?: string;
    timestamp?: number;
    actor?: number;
}

export interface LocationEvent {
    eventId: string;
    locationKey: string; // e.g., "prison_yard"
    eventName: string;
    triggerType: EventTriggerType;
    isEnabled: boolean;

    // Occupancy-based triggers
    occupancyThreshold?: number; // Trigger when N+ players present
    occupancyMaxDelay?: number; // Max wait before triggering (ms)

    // Daily triggers
    dailyHourUTC?: number; // Hour (0-23) when daily event runs
    dailyMinuteUTC?: number; // Minute (0-59)

    // Random triggers
    randomIntervalMs?: number; // Check interval for random chance
    randomChance?: number; // 0-1 probability of triggering

    // Event content
    narration: string; // What gets sent to players
    narrationTo?: "all" | "location" | "individual"; // Who receives narration
    conditions?: LocationEventCondition;
    cooldownMs?: number;
    consequences?: LocationEventOutcome[];
    outcomes?: LocationEventOutcome[];
    durationMs?: number; // How long event effects last

    // State
    lastTriggeredAt?: number;
    nextScheduledTrigger?: number;
    consecutiveFailures?: number;

    createdAt: number;
    updatedAt: number;
}

export interface LocationEventExecution {
    eventId: string;
    locationKey: string;
    triggeredAt: number;
    triggeredBy: "occupancy" | "daily" | "random" | "manual";
    affectedMembers: number[]; // Who was affected
    narrationSent: boolean;
    consequences: Array<{
        type: string;
        success: boolean;
        error?: string;
    }>;
    durationMs?: number;
    completedAt?: number;
    notes?: string;
    deliveryId?: string;
}

const MAX_EVENTS_PER_LOCATION = 50;
const MAX_EXECUTION_HISTORY = 1000;

export interface LocationEventSystemOptions {
    eventBus?: EventBus;
    mutationService?: GameStateMutationService;
    locationResolver?: (position: {
        X: number;
        Y: number;
    }) => string | undefined;
}

export class LocationEventSystem {
    private eventCollection: Collection<LocationEvent>;
    private executionCollection: Collection<LocationEventExecution>;
    private transitionCollection: Collection<{
        transitionId: string;
        createdAt: number;
    }>;
    private inited = false;
    private readonly logger = createLogger("LocationEventSystem");
    private timers = new Map<string, NodeJS.Timeout>();
    private readonly options: LocationEventSystemOptions;

    public constructor(
        private db: Db,
        options: LocationEventSystemOptions = {},
    ) {
        this.options = options;
        this.eventCollection =
            this.db.collection<LocationEvent>("locationEvents");
        this.executionCollection = this.db.collection<LocationEventExecution>(
            "locationEventExecutions",
        );
        this.transitionCollection = this.db.collection(
            "locationEventTransitions",
        );
    }

    private async init(): Promise<void> {
        if (this.inited) return;

        await this.eventCollection.createIndex({ locationKey: 1 });
        await this.eventCollection.createIndex(
            { eventId: 1 },
            { unique: true },
        );
        await this.eventCollection.createIndex({ isEnabled: 1 });
        await this.eventCollection.createIndex({ updatedAt: -1 });

        await this.executionCollection.createIndex({ eventId: 1 });
        await this.executionCollection.createIndex({ locationKey: 1 });
        await this.executionCollection.createIndex({ triggeredAt: -1 });
        await this.executionCollection.createIndex(
            { deliveryId: 1 },
            { unique: true, sparse: true },
        );
        await this.transitionCollection.createIndex(
            { transitionId: 1 },
            { unique: true },
        );
        this.inited = true;
    }

    /**
     * Create a new location event
     */
    public async createEvent(
        locationKey: string,
        event: Omit<LocationEvent, "createdAt" | "updatedAt">,
    ): Promise<LocationEvent> {
        await this.init();
        if (!locationKey || event.locationKey !== locationKey) {
            throw new Error("Location event location does not match its key");
        }

        const newEvent: LocationEvent = {
            ...event,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        await this.eventCollection.insertOne(newEvent);

        this.logger.info(
            `Created event '${event.eventName}' for location ${locationKey}`,
            {
                locationKey,
                eventName: event.eventName,
                triggerType: event.triggerType,
            },
        );

        return newEvent;
    }

    /**
     * Get event by ID
     */
    public async getEvent(eventId: string): Promise<LocationEvent | null> {
        await this.init();
        return this.eventCollection.findOne({ eventId });
    }

    /**
     * List all events for a location
     */
    public async getLocationEvents(
        locationKey: string,
    ): Promise<LocationEvent[]> {
        await this.init();
        return this.eventCollection.find({ locationKey }).toArray();
    }

    /**
     * Get active events for a location
     */
    public async getActiveEvents(
        locationKey: string,
    ): Promise<LocationEvent[]> {
        const events = await this.getLocationEvents(locationKey);
        return events.filter((e) => e.isEnabled);
    }

    /**
     * Enable or disable an event
     */
    public async setEventEnabled(
        eventId: string,
        enabled: boolean,
    ): Promise<void> {
        await this.init();

        await this.eventCollection.updateOne(
            { eventId },
            {
                $set: {
                    isEnabled: enabled,
                    updatedAt: Date.now(),
                },
            },
        );

        this.logger.info(
            `Event ${eventId} ${enabled ? "enabled" : "disabled"}`,
            {
                eventId,
                enabled,
            },
        );
    }

    /**
     * Update event configuration
     */
    public async updateEvent(
        eventId: string,
        updates: Partial<LocationEvent>,
    ): Promise<void> {
        await this.init();

        const { createdAt, ...safeUpdates } = updates;
        await this.eventCollection.updateOne(
            { eventId },
            {
                $set: {
                    ...safeUpdates,
                    updatedAt: Date.now(),
                },
            },
        );

        this.logger.info(`Updated event ${eventId}`, { eventId });
    }

    /**
     * Delete an event
     */
    public async deleteEvent(eventId: string): Promise<void> {
        await this.init();

        // Clear any pending timers
        if (this.timers.has(eventId)) {
            clearTimeout(this.timers.get(eventId)!);
            this.timers.delete(eventId);
        }

        await this.eventCollection.deleteOne({ eventId });

        this.logger.info(`Deleted event ${eventId}`, { eventId });
    }

    /**
     * Execute an event
     */
    public async executeEvent(
        eventId: string,
        affectedMembers: number[],
        triggeredBy: LocationEventExecution["triggeredBy"],
        deliveryId?: string,
    ): Promise<LocationEventExecution> {
        await this.init();
        const event = await this.getEvent(eventId);
        if (!event) {
            throw new Error(`Event ${eventId} not found`);
        }

        if (deliveryId) {
            const existing = await this.executionCollection.findOne({
                deliveryId,
            });
            if (existing) return existing;
        }

        const execution: LocationEventExecution = {
            eventId,
            locationKey: event.locationKey,
            triggeredAt: Date.now(),
            triggeredBy,
            affectedMembers,
            narrationSent: true,
            consequences: [],
            durationMs: event.durationMs,
            deliveryId,
        };
        if (deliveryId) {
            try {
                await this.executionCollection.insertOne(execution);
            } catch (error) {
                if ((error as { code?: number }).code === 11000) {
                    return (
                        (await this.executionCollection.findOne({
                            deliveryId,
                        })) ?? execution
                    );
                }
                throw error;
            }
        }

        const outcomes = event.outcomes ?? event.consequences ?? [];
        const consequences: LocationEventExecution["consequences"] = [];
        for (const outcome of outcomes) {
            for (const memberNumber of affectedMembers) {
                try {
                    if (outcome.type === "location_effect") {
                        if (!this.options.mutationService) {
                            throw new Error(
                                "Location event mutation service is not configured",
                            );
                        }
                        await this.options.mutationService?.applyEffect(
                            memberNumber,
                            {
                                effectKey: String(outcome.value),
                                appliedAt: Date.now(),
                                ...(event.durationMs
                                    ? {
                                          expiresAt:
                                              Date.now() + event.durationMs,
                                      }
                                    : {}),
                            },
                        );
                    }
                    consequences.push({ type: outcome.type, success: true });
                } catch (error) {
                    consequences.push({
                        type: outcome.type,
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                }
            }
        }

        execution.consequences = consequences;
        if (deliveryId) {
            await this.executionCollection.updateOne(
                { deliveryId },
                { $set: { consequences, completedAt: Date.now() } },
            );
        } else {
            await this.executionCollection.insertOne(execution);
        }

        // Update event's last triggered time
        await this.updateEvent(eventId, {
            lastTriggeredAt: Date.now(),
            consecutiveFailures: 0,
        });

        this.logger.info(
            `Executed event '${event.eventName}' for ${affectedMembers.length} members`,
            {
                eventId,
                affectedMemberCount: affectedMembers.length,
                triggeredBy,
            },
        );

        return execution;
    }

    /**
     * Publish a deterministic entry/exit transition and execute matching events.
     * The transition id is the idempotency key for retries and redelivery.
     */
    public async handleLocationTransition(
        transition: LocationTransition,
    ): Promise<LocationEventExecution[]> {
        await this.init();
        if (
            !transition.transitionId ||
            !Number.isInteger(transition.memberNumber) ||
            transition.memberNumber < 0 ||
            (!transition.fromLocationKey && !transition.toLocationKey)
        ) {
            throw new Error("Invalid location transition");
        }
        try {
            await this.transitionCollection.insertOne({
                transitionId: transition.transitionId,
                createdAt: Date.now(),
            });
        } catch (error) {
            if ((error as { code?: number }).code === 11000) return [];
            throw error;
        }

        const timestamp = transition.timestamp ?? Date.now();
        const actor = transition.actor ?? transition.memberNumber;
        const publish = async (
            type: "location_entered" | "location_exited",
            locationKey: string | undefined,
        ) => {
            if (!locationKey) return;
            const event: GameEvent = {
                timestamp,
                type,
                source: "veratown",
                actor,
                target: transition.memberNumber,
                data: {
                    transitionId: transition.transitionId,
                    locationKey,
                    fromLocationKey: transition.fromLocationKey,
                    toLocationKey: transition.toLocationKey,
                },
                processed: false,
            };
            if (this.options.mutationService) {
                await this.options.mutationService.recordEvent(event);
            } else {
                await this.options.eventBus?.publish(event);
            }
        };

        await publish("location_exited", transition.fromLocationKey);
        await publish("location_entered", transition.toLocationKey);

        const executions: LocationEventExecution[] = [];
        const locationKey = transition.toLocationKey;
        if (locationKey) {
            const events = await this.getEventsByTriggerType(
                locationKey,
                "entry",
            );
            for (const event of events) {
                if (
                    !event.isEnabled ||
                    (event.cooldownMs &&
                        event.lastTriggeredAt &&
                        timestamp - event.lastTriggeredAt < event.cooldownMs)
                )
                    continue;
                executions.push(
                    await this.executeEvent(
                        event.eventId,
                        [transition.memberNumber],
                        "manual",
                        `${transition.transitionId}:entry:${event.eventId}`,
                    ),
                );
            }
        }
        if (transition.fromLocationKey) {
            const events = await this.getEventsByTriggerType(
                transition.fromLocationKey,
                "exit",
            );
            for (const event of events) {
                if (
                    !event.isEnabled ||
                    (event.cooldownMs &&
                        event.lastTriggeredAt &&
                        timestamp - event.lastTriggeredAt < event.cooldownMs)
                )
                    continue;
                executions.push(
                    await this.executeEvent(
                        event.eventId,
                        [transition.memberNumber],
                        "manual",
                        `${transition.transitionId}:exit:${event.eventId}`,
                    ),
                );
            }
        }
        return executions;
    }

    /**
     * Record event failure
     */
    public async recordEventFailure(
        eventId: string,
        error: string,
    ): Promise<void> {
        const event = await this.getEvent(eventId);
        if (!event) return;

        const failures = (event.consecutiveFailures ?? 0) + 1;

        await this.updateEvent(eventId, {
            consecutiveFailures: failures,
        });

        if (failures > 3) {
            await this.setEventEnabled(eventId, false);
            this.logger.warn(
                `Event ${eventId} auto-disabled after ${failures} consecutive failures`,
                { eventId, failures, error },
            );
        }
    }

    /**
     * Get execution history for event
     */
    public async getExecutionHistory(
        eventId: string,
        limit: number = 50,
    ): Promise<LocationEventExecution[]> {
        await this.init();

        return this.executionCollection
            .find({ eventId })
            .sort({ triggeredAt: -1 })
            .limit(limit)
            .toArray();
    }

    /**
     * Get events by trigger type
     */
    public async getEventsByTriggerType(
        locationKey: string,
        triggerType: EventTriggerType,
    ): Promise<LocationEvent[]> {
        const events = await this.getLocationEvents(locationKey);
        return events.filter((e) => e.triggerType === triggerType);
    }

    /**
     * Check occupancy-based events
     */
    public async checkOccupancyEvents(
        locationKey: string,
        currentOccupancy: number,
    ): Promise<LocationEvent[]> {
        const occupancyEvents = await this.getEventsByTriggerType(
            locationKey,
            "occupancy",
        );

        return occupancyEvents.filter((event) => {
            if (!event.isEnabled || event.occupancyThreshold === undefined) {
                return false;
            }
            return currentOccupancy >= event.occupancyThreshold;
        });
    }

    /**
     * Get events due for daily trigger
     */
    public async checkDailyEvents(
        locationKey: string,
    ): Promise<LocationEvent[]> {
        const dailyEvents = await this.getEventsByTriggerType(
            locationKey,
            "daily",
        );
        const now = new Date();

        return dailyEvents.filter((event) => {
            if (!event.isEnabled || event.dailyHourUTC === undefined) {
                return false;
            }

            const lastTriggeredDate = event.lastTriggeredAt
                ? new Date(event.lastTriggeredAt)
                : null;
            const currentDate = new Date(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
                event.dailyHourUTC,
                event.dailyMinuteUTC ?? 0,
                0,
            );

            // Check if we've already triggered today
            if (lastTriggeredDate) {
                const lastDate = new Date(
                    lastTriggeredDate.getUTCFullYear(),
                    lastTriggeredDate.getUTCMonth(),
                    lastTriggeredDate.getUTCDate(),
                );
                const todayDate = new Date(
                    currentDate.getUTCFullYear(),
                    currentDate.getUTCMonth(),
                    currentDate.getUTCDate(),
                );

                if (lastDate.getTime() === todayDate.getTime()) {
                    return false;
                }
            }

            return now >= currentDate;
        });
    }

    /**
     * Get events due for random trigger check
     */
    public async checkRandomEvents(
        locationKey: string,
    ): Promise<LocationEvent[]> {
        const randomEvents = await this.getEventsByTriggerType(
            locationKey,
            "random",
        );

        return randomEvents.filter((event) => {
            if (
                !event.isEnabled ||
                event.randomChance === undefined ||
                event.randomIntervalMs === undefined
            ) {
                return false;
            }

            const timeSinceLastTrigger = event.lastTriggeredAt
                ? Date.now() - event.lastTriggeredAt
                : event.randomIntervalMs;

            return timeSinceLastTrigger >= event.randomIntervalMs;
        });
    }

    /**
     * Prune old execution history
     */
    public async pruneOldExecutions(beforeTime: number): Promise<number> {
        await this.init();

        const result = await this.executionCollection.deleteMany({
            triggeredAt: { $lt: beforeTime },
        });

        this.logger.info(`Pruned old event executions`, {
            deletedCount: result.deletedCount,
        });

        return result.deletedCount ?? 0;
    }

    /**
     * Get event statistics
     */
    public async getStatistics(): Promise<{
        totalEvents: number;
        enabledEvents: number;
        byTriggerType: Record<EventTriggerType, number>;
        totalExecutions: number;
        lastExecutionTime?: number;
    }> {
        await this.init();

        const eventStats = await this.eventCollection
            .aggregate([
                {
                    $group: {
                        _id: "$triggerType",
                        count: { $sum: 1 },
                    },
                },
            ])
            .toArray();

        const byTriggerType: Record<EventTriggerType, number> = {
            occupancy: 0,
            daily: 0,
            random: 0,
            manual: 0,
            entry: 0,
            exit: 0,
        };

        eventStats.forEach((stat) => {
            byTriggerType[stat._id as EventTriggerType] = stat.count;
        });

        const totalEvents = await this.eventCollection.countDocuments();
        const enabledEvents = await this.eventCollection.countDocuments({
            isEnabled: true,
        });
        const totalExecutions = await this.executionCollection.countDocuments();

        const lastExecution = await this.executionCollection.findOne(
            {},
            { sort: { triggeredAt: -1 } },
        );

        return {
            totalEvents,
            enabledEvents,
            byTriggerType,
            totalExecutions,
            lastExecutionTime: lastExecution?.triggeredAt,
        };
    }

    /**
     * Cleanup resources
     */
    public cleanup(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
    }
}
