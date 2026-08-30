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

/**
 * Callback function type for event listeners.
 * Listeners are async functions that process game events.
 */
export type GameEventListener = (event: GameEvent) => Promise<void>;

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
        const listeners: GameEventListener[] = [];

        // Add type-specific listeners
        if (this.listeners.has(event.type)) {
            listeners.push(...this.listeners.get(event.type)!);
        }

        // Add wildcard listeners
        listeners.push(...this.wildcardListeners);

        // Execute all listeners in parallel
        await Promise.all(listeners.map((listener) => listener(event)));
    }

    /**
     * Clear all subscriptions (useful for testing).
     */
    public clear(): void {
        this.listeners.clear();
        this.wildcardListeners = [];
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
