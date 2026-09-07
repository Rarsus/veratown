import type {
    API_Character,
    API_Connector,
    BC_Server_ChatRoomMessage,
} from "bc-bot";
import { createLogger, type Logger } from "../../logging";
import {
    EventBus,
    type EventDeliveryFailure,
    type ReliablePublishReport,
} from "../shared/eventBus";
import type { GameEvent } from "../shared/unifiedCharacterTypes";
import type { KidnappersGameEvent } from "./kidnappersGameTypes";
import { GamePluginMessageFeatureSystem } from "../shared/gamePluginMessageFeatureSystem";
import type { GamePluginCommandRouter } from "../shared/gamePlugin";
import type { GameStateMutationService } from "../shared/gameStateMutationService";

export const KIDNAPPERS_GAME_EVENT = "kidnappers_game_event" as const;
export const KIDNAPPERS_PLAYER_MESSAGE = "kidnappers_player_message" as const;

export interface KidnappersInternalEventPayload {
    readonly sessionId: string;
    readonly event: KidnappersGameEvent;
    readonly correlationId: string;
    readonly deliveryId: string;
    readonly sequence: number;
}

export function createKidnappersAuditSubscriber(
    mutationService: Pick<GameStateMutationService, "recordAuditEntry">,
): KidnappersSubscriberHandlers["audit"] {
    return async ({ sessionId, event, correlationId, deliveryId }) => {
        const memberNumber = memberNumberForEvent(event);
        if (memberNumber === 0) return;
        await mutationService.recordAuditEntry(
            memberNumber,
            `kidnappers_${event.type.toLowerCase()}`,
            {
                sessionId,
                correlationId,
                deliveryId,
                event,
            },
            memberNumber,
        );
    };
}

export interface KidnappersPlayerMessagePayload {
    readonly sessionId: string;
    readonly memberNumber: number;
    readonly text: string;
    readonly eventType: KidnappersGameEvent["type"];
    readonly correlationId: string;
    readonly deliveryId: string;
    readonly sequence: number;
}

export interface KidnappersSubscriberHandlers {
    readonly character?: (
        payload: KidnappersInternalEventPayload,
    ) => Promise<void>;
    readonly inventory?: (
        payload: KidnappersInternalEventPayload,
    ) => Promise<void>;
    readonly audit?: (payload: KidnappersInternalEventPayload) => Promise<void>;
    readonly lifecycle?: (
        payload: KidnappersInternalEventPayload,
    ) => Promise<void>;
}

export function memberNumberForEvent(event: KidnappersGameEvent): number {
    const memberNumber = (event as { memberNumber?: unknown }).memberNumber;
    if (typeof memberNumber === "number") return memberNumber;
    const targetMemberNumber = (event as { targetMemberNumber?: unknown })
        .targetMemberNumber;
    if (typeof targetMemberNumber === "number") return targetMemberNumber;
    const attackerMemberNumber = (event as { attackerMemberNumber?: unknown })
        .attackerMemberNumber;
    if (typeof attackerMemberNumber === "number") return attackerMemberNumber;
    return 0;
}

function toInternalGameEvent(
    payload: KidnappersInternalEventPayload,
): GameEvent {
    const { event } = payload;
    const memberNumber = memberNumberForEvent(event);
    return {
        timestamp: event.emittedAt,
        type: KIDNAPPERS_GAME_EVENT,
        source: "kidnappers",
        actor:
            typeof (event as { attackerMemberNumber?: unknown })
                .attackerMemberNumber === "number"
                ? (event as { attackerMemberNumber: number })
                      .attackerMemberNumber
                : memberNumber,
        target:
            typeof (event as { targetMemberNumber?: unknown })
                .targetMemberNumber === "number"
                ? (event as { targetMemberNumber: number }).targetMemberNumber
                : memberNumber,
        data: payload as unknown as Record<string, unknown>,
        processed: false,
        correlationId: payload.correlationId,
        deliveryId: payload.deliveryId,
        sequence: payload.sequence,
    };
}

function toPlayerMessageEvent(
    payload: KidnappersPlayerMessagePayload,
): GameEvent {
    return {
        timestamp: Date.now(),
        type: KIDNAPPERS_PLAYER_MESSAGE,
        source: "kidnappers",
        actor: payload.memberNumber,
        target: payload.memberNumber,
        data: payload as unknown as Record<string, unknown>,
        processed: false,
        correlationId: payload.correlationId,
        deliveryId: payload.deliveryId,
        sequence: payload.sequence,
    };
}

/**
 * Publishes authoritative KidnappersGame transitions and player-facing
 * messages through the shared event bus. Delivery identities are deterministic
 * so a reconnect can replay a failed delivery without duplicating successful
 * subscribers.
 */
export class KidnappersGameEventRouter {
    private readonly logger: Logger;
    private sequence = 0;

    constructor(
        private readonly eventBus: EventBus,
        logger: Logger = createLogger("KidnappersGameEventRouter"),
    ) {
        this.logger = logger;
    }

    public publishGameEvent(
        sessionId: string,
        event: KidnappersGameEvent,
        options?: Parameters<EventBus["publishReliable"]>[1],
    ): Promise<ReliablePublishReport> {
        const correlationId = event.correlationId;
        const deliveryId =
            event.deliveryId ??
            `kidnappers:${sessionId}:${correlationId}:${event.type}`;
        const payload: KidnappersInternalEventPayload = {
            sessionId,
            event: { ...event, deliveryId },
            correlationId,
            deliveryId,
            sequence: ++this.sequence,
        };
        return this.publish(toInternalGameEvent(payload), options);
    }

    public publishPlayerMessage(
        payload: Omit<
            KidnappersPlayerMessagePayload,
            "deliveryId" | "sequence"
        > & { readonly deliveryId?: string },
        options?: Parameters<EventBus["publishReliable"]>[1],
    ): Promise<ReliablePublishReport> {
        const deliveryId =
            payload.deliveryId ??
            `kidnappers:${payload.sessionId}:${payload.correlationId}:message:${payload.memberNumber}`;
        return this.publish(
            toPlayerMessageEvent({
                ...payload,
                deliveryId,
                sequence: ++this.sequence,
            }),
            options,
        );
    }

    private async publish(
        event: GameEvent,
        options?: Parameters<EventBus["publishReliable"]>[1],
    ): Promise<ReliablePublishReport> {
        const report = await this.eventBus.publishReliable(event, options);
        if (report.failures.length > 0) {
            this.logger.warn("KidnappersGame event delivery failed", {
                deliveryId: report.deliveryId,
                failures: report.failures.length,
            });
        }
        return report;
    }
}

/**
 * Shared subscribers for character, inventory, audit, and lifecycle effects.
 * Each effect is isolated in its own listener, allowing a failed dependency to
 * be retried without replaying successful durable effects.
 */
export class KidnappersGameSubscribers {
    private readonly logger: Logger;
    private readonly failures: EventDeliveryFailure[] = [];
    private initialized = false;
    private readonly listeners: Array<{
        readonly listener: (event: GameEvent) => Promise<void>;
    }> = [];

    constructor(
        private readonly eventBus: EventBus,
        private readonly handlers: KidnappersSubscriberHandlers,
        logger?: Logger,
    ) {
        this.logger = logger ?? createLogger("KidnappersGameSubscribers");
    }

    public initialize(): void {
        if (this.initialized) return;
        this.initialized = true;
        for (const [name, handler] of Object.entries(this.handlers)) {
            if (!handler) continue;
            const listener = async (event: GameEvent): Promise<void> => {
                try {
                    await handler(this.payloadFromEvent(event));
                } catch (error) {
                    const failure: EventDeliveryFailure = {
                        deliveryId: event.deliveryId,
                        eventType: event.type,
                        attempt: 1,
                        error:
                            error instanceof Error
                                ? error
                                : new Error(String(error)),
                    };
                    this.failures.push(failure);
                    this.logger.error(
                        `KidnappersGame ${name} subscriber failed`,
                        error,
                        { deliveryId: event.deliveryId },
                    );
                    throw error;
                }
            };
            this.listeners.push({ listener });
            this.eventBus.subscribe(KIDNAPPERS_GAME_EVENT, listener);
        }
    }

    public dispose(): void {
        for (const { listener } of this.listeners) {
            this.eventBus.unsubscribe(KIDNAPPERS_GAME_EVENT, listener);
        }
        this.listeners.length = 0;
        this.initialized = false;
    }

    public getFailures(): readonly EventDeliveryFailure[] {
        return [...this.failures];
    }

    private payloadFromEvent(event: GameEvent): KidnappersInternalEventPayload {
        return event.data as unknown as KidnappersInternalEventPayload;
    }
}

export type KidnappersGameCommandHandler = (
    sender: API_Character,
    msg: BC_Server_ChatRoomMessage,
    command: string,
    args: string[],
) => Promise<void>;

/**
 * Message adapter for the supported plugin command router. It intentionally
 * does not register directly with CommandParser.
 */
export class KidnappersGameMessageFeatureSystem extends GamePluginMessageFeatureSystem {
    constructor(
        conn: API_Connector,
        enabledGetter: () => boolean,
        commandHandler: KidnappersGameCommandHandler,
        disabledHandler?: (
            sender: API_Character,
            msg: BC_Server_ChatRoomMessage,
        ) => Promise<void>,
    ) {
        super(
            conn,
            "kidnappers",
            "Kidnappers Game",
            enabledGetter,
            commandHandler,
            disabledHandler,
        );
    }

    public registerCommands(router: GamePluginCommandRouter): void {
        router.registerRoot(async (sender, msg, args) => {
            const [command = "", ...commandArgs] = args;
            await this.processCommand(sender, msg, command, commandArgs);
        });
    }
}
