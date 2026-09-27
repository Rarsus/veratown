import {
    createActionMetadata,
    createActionResult,
    type ActionContext,
    type ActionResult,
    type CommunicationActionAdapter,
    type CommunicationObservation,
    type MessageRequest,
} from "../domain";
import type { API_Connector } from "bc-bot";
import { createLogger } from "../../logging";

export interface BCCommunicationAdapterOptions {
    readonly now?: () => number;
}

type CommunicationConnector = Pick<API_Connector, "SendMessage">;

function tellTypeFor(
    channel: MessageRequest["channel"],
): "Whisper" | "Chat" | "Emote" {
    switch (channel) {
        case "whisper":
            return "Whisper";
        case "chat":
            return "Chat";
        case "emote":
            return "Emote";
    }
}

function observation(
    request: MessageRequest,
    deliveryStatus: CommunicationObservation["deliveryStatus"],
    observedAt: number,
): CommunicationObservation {
    return {
        channel: request.channel,
        deliveryStatus,
        ...(request.targetMemberNumber === undefined
            ? {}
            : { targetMemberNumber: request.targetMemberNumber }),
        textLength: request.text.length,
        observedAt,
    };
}

/**
 * Translates communication actions to the BC connector.
 *
 * BC's synchronous SendMessage API proves only that local dispatch returned;
 * it does not provide a delivery receipt. The adapter therefore reports
 * queued on return and unknown when the call throws.
 */
export class BCCommunicationActionAdapter implements CommunicationActionAdapter {
    private readonly now: () => number;
    private readonly logger = createLogger("BCCommunicationActionAdapter");

    public constructor(
        private readonly connector: CommunicationConnector,
        options: BCCommunicationAdapterOptions = {},
    ) {
        this.now = options.now ?? Date.now;
    }

    public async send(
        request: MessageRequest,
        context: ActionContext,
    ): Promise<ActionResult<CommunicationObservation>> {
        const startedAt = this.now();
        const actionId = "communication.send";
        try {
            this.connector.SendMessage(
                tellTypeFor(request.channel),
                request.text,
                request.targetMemberNumber,
            );
            const completedAt = this.now();
            return createActionResult(
                "completed",
                createActionMetadata(
                    context,
                    actionId,
                    startedAt,
                    context.attempt ?? 1,
                    completedAt,
                ),
                {
                    value: observation(request, "queued", completedAt),
                },
            );
        } catch (error) {
            const completedAt = this.now();
            this.logger.error(
                "Communication transport outcome is unknown",
                error,
                {
                    operationId: context.operationId,
                    actionId,
                    memberNumber: context.memberNumber,
                    channel: request.channel,
                    targetMemberNumber: request.targetMemberNumber,
                    attempt: context.attempt ?? 1,
                },
            );
            return createActionResult(
                "failed",
                createActionMetadata(
                    context,
                    actionId,
                    startedAt,
                    context.attempt ?? 1,
                    completedAt,
                ),
                {
                    value: observation(request, "unknown", completedAt),
                    reason: "BC connector outcome could not be established",
                    failureKind: "transient",
                    retryable: true,
                },
            );
        }
    }
}
