/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { GameEvent } from "./unifiedCharacterTypes";
import { asAppError } from "../../errors";

/**
 * Callback function type for event listeners.
 * Listeners are async functions that process game events.
 */
export type GameEventListener = (event: GameEvent) => Promise<void>;

export interface EventDeliveryFailure {
    readonly deliveryId?: string;
    readonly eventType: GameEvent["type"];
    readonly attempt: number;
    readonly error: Error;
}

export interface ReliablePublishOptions {
    /** Number of retries after the first delivery attempt. */
    readonly retries?: number;
    readonly retryDelayMs?: number;
    readonly onFailure?: (failure: EventDeliveryFailure) => void;
}

export interface ReliablePublishReport {
    readonly deliveryId?: string;
    readonly delivered: number;
    readonly skipped: number;
    readonly failures: readonly EventDeliveryFailure[];
}

/**
 * Central event bus for cross-system communication via pub/sub.
 *
 * Systems subscribe to events they care about:
 * - Casino subscribes to: bondage_applied, bondage_removed
 * - Dare subscribes to: cage_entry, cage_exit
 * - Veratown subscribes to: chips_earned, chips_lost, bondage_applied
 *
 * Events are published immediately and stored in MongoDB for recovery.
 */
export class EventBus {
    // Map of event type -> array of listeners
    private listeners: Map<string, GameEventListener[]> = new Map();
    // Wildcard listeners that receive all events
    private wildcardListeners: GameEventListener[] = [];
    private readonly deliveredByKey = new Map<string, Set<GameEventListener>>();
    private readonly deliveryFailures: EventDeliveryFailure[] = [];
    private readonly reliableQueues = new Map<string, Promise<void>>();

    /**
     * Subscribe to a specific event type.
     * Multiple listeners can subscribe to the same event.
     *
     * @param eventType Event type to subscribe to (or "*" for all events)
     * @param listener Async callback function
     */
    public subscribe(eventType: string, listener: GameEventListener): void {
        if (eventType === "*") {
            this.wildcardListeners.push(listener);
        } else {
            if (!this.listeners.has(eventType)) {
                this.listeners.set(eventType, []);
            }
            this.listeners.get(eventType)!.push(listener);
        }
    }

    /**
     * Unsubscribe from an event type.
     *
     * @param eventType Event type to unsubscribe from
     * @param listener The listener function to remove
     */
    public unsubscribe(eventType: string, listener: GameEventListener): void {
        if (eventType === "*") {
            const idx = this.wildcardListeners.indexOf(listener);
            if (idx >= 0) {
                this.wildcardListeners.splice(idx, 1);
            }
        } else {
            const typeListeners = this.listeners.get(eventType);
            if (typeListeners) {
                const idx = typeListeners.indexOf(listener);
                if (idx >= 0) {
                    typeListeners.splice(idx, 1);
                }
            }
        }
    }

    /**
     * Publish an event to all interested listeners.
     * Executes all matching listeners in parallel.
     *
     * @param event GameEvent to publish
     */
    public async publish(event: GameEvent): Promise<void> {
        const listeners = this.getListeners(event);

        // Execute all listeners in parallel
        await Promise.all(
            listeners.map(async (listener) => {
                try {
                    await listener(event);
                } catch (error) {
                    throw asAppError(error, "BUSINESS_LOGIC", {
                        eventType: event.type,
                        source: event.source,
                    });
                }
            }),
        );
    }

    /**
     * Deliver an event in subscription order while retaining successful
     * deliveries for retries. A failed subscriber does not prevent the other
     * subscribers from receiving the event, and a later call retries only the
     * failed subscribers.
     */
    public async publishReliable(
        event: GameEvent,
        options: ReliablePublishOptions = {},
    ): Promise<ReliablePublishReport> {
        if (!event.deliveryId) {
            return this.publishReliableOnce(event, options);
        }

        const previous =
            this.reliableQueues.get(event.deliveryId) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        const queued = previous.then(() => current);
        this.reliableQueues.set(event.deliveryId, queued);
        await previous;
        try {
            return await this.publishReliableOnce(event, options);
        } finally {
            release();
            if (this.reliableQueues.get(event.deliveryId) === queued) {
                this.reliableQueues.delete(event.deliveryId);
            }
        }
    }

    private async publishReliableOnce(
        event: GameEvent,
        options: ReliablePublishOptions,
    ): Promise<ReliablePublishReport> {
        const listeners = Array.from(new Set(this.getListeners(event)));
        const deliveryId = event.deliveryId;
        const delivered = deliveryId
            ? (this.deliveredByKey.get(deliveryId) ?? new Set())
            : undefined;
        if (deliveryId && !this.deliveredByKey.has(deliveryId)) {
            this.deliveredByKey.set(deliveryId, delivered!);
        }

        let deliveredCount = 0;
        let skipped = 0;
        const failures: EventDeliveryFailure[] = [];
        const attempts = Math.max(0, options.retries ?? 0) + 1;

        for (const listener of listeners) {
            if (delivered?.has(listener)) {
                skipped += 1;
                continue;
            }

            for (let attempt = 1; attempt <= attempts; attempt += 1) {
                try {
                    await listener(event);
                    delivered?.add(listener);
                    deliveredCount += 1;
                    break;
                } catch (error) {
                    const failure: EventDeliveryFailure = {
                        deliveryId,
                        eventType: event.type,
                        attempt,
                        error:
                            error instanceof Error
                                ? error
                                : new Error(String(error)),
                    };
                    failures.push(failure);
                    this.deliveryFailures.push(failure);
                    try {
                        options.onFailure?.(failure);
                    } catch {
                        // Observability hooks must not affect delivery.
                    }
                    if (attempt < attempts && options.retryDelayMs) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, options.retryDelayMs),
                        );
                    }
                }
            }
        }

        return {
            deliveryId,
            delivered: deliveredCount,
            skipped,
            failures,
        };
    }

    public getDeliveryFailures(): readonly EventDeliveryFailure[] {
        return [...this.deliveryFailures];
    }

    private getListeners(event: GameEvent): GameEventListener[] {
        const listeners: GameEventListener[] = [];

        // Add type-specific listeners
        if (this.listeners.has(event.type)) {
            listeners.push(...this.listeners.get(event.type)!);
        }

        // Add wildcard listeners
        listeners.push(...this.wildcardListeners);
        return listeners;
    }

    /**
     * Clear all subscriptions (useful for testing).
     */
    public clear(): void {
        this.listeners.clear();
        this.wildcardListeners = [];
        this.deliveredByKey.clear();
        this.deliveryFailures.length = 0;
        this.reliableQueues.clear();
    }

    /**
     * Get count of listeners for a specific event type.
     * Useful for debugging and testing.
     *
     * @param eventType Event type to check
     * @returns Number of listeners
     */
    public getListenerCount(eventType: string): number {
        const typeCount = this.listeners.get(eventType)?.length ?? 0;
        const wildcardCount =
            eventType === "*" ? this.wildcardListeners.length : 0;
        return typeCount + wildcardCount;
    }

    /**
     * Get all subscribed event types.
     * Useful for debugging.
     *
     * @returns Array of event types with subscribers
     */
    public getSubscribedTypes(): string[] {
        return Array.from(this.listeners.keys()).filter(
            (type) => this.listeners.get(type)!.length > 0,
        );
    }
}
