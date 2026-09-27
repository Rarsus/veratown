import type {
    ActionContext,
    ActionResult,
    CommunicationActionAdapter,
    CommunicationObservation,
    MessageRequest,
} from "./domain";
import { ActionScheduler } from "./scheduler";

export interface CommunicationActionServiceOptions {
    readonly scheduler?: ActionScheduler;
    readonly maxTextLength?: number;
}

const DEFAULT_MAX_TEXT_LENGTH = 1000;

function validateContext(context: ActionContext): void {
    if (!Number.isInteger(context.memberNumber) || context.memberNumber < 0) {
        throw new Error("memberNumber must be a non-negative integer");
    }
    if (!context.operationId.trim()) {
        throw new Error("operationId is required");
    }
    if (!Number.isFinite(context.deadlineAt)) {
        throw new Error("deadlineAt must be finite");
    }
}

function validateTarget(targetMemberNumber: number | undefined): void {
    if (
        targetMemberNumber !== undefined &&
        (!Number.isInteger(targetMemberNumber) || targetMemberNumber < 0)
    ) {
        throw new Error(
            "targetMemberNumber must be a non-negative integer when provided",
        );
    }
}

export function normalizeMessageRequest(
    request: MessageRequest,
    maxTextLength = DEFAULT_MAX_TEXT_LENGTH,
): MessageRequest {
    if (!Number.isInteger(maxTextLength) || maxTextLength < 1) {
        throw new Error("maxTextLength must be a positive integer");
    }

    const text = request.text.trim();
    if (!text) throw new Error("message text is required");
    if (text.length > maxTextLength) {
        throw new Error(`message text exceeds ${maxTextLength} characters`);
    }

    validateTarget(request.targetMemberNumber);
    if (
        request.channel === "whisper" &&
        request.targetMemberNumber === undefined
    ) {
        throw new Error("whisper messages require a targetMemberNumber");
    }
    if (
        request.channel === "chat" &&
        request.targetMemberNumber !== undefined
    ) {
        throw new Error("chat messages cannot have a targetMemberNumber");
    }

    const deduplicationKey = request.deduplicationKey?.trim();
    if (request.deduplicationKey !== undefined && !deduplicationKey) {
        throw new Error("deduplicationKey cannot be empty");
    }

    return {
        channel: request.channel,
        text,
        ...(request.targetMemberNumber === undefined
            ? {}
            : { targetMemberNumber: request.targetMemberNumber }),
        ...(deduplicationKey === undefined ? {} : { deduplicationKey }),
    };
}

/**
 * Workflow-facing communication action layer.
 *
 * The service owns request validation, normalization, admission, and
 * operation-keyed duplicate suppression. The adapter owns BC transport and
 * the delivery observation it can prove.
 */
export class CommunicationActionService {
    private readonly scheduler: ActionScheduler;
    private readonly maxTextLength: number;

    public constructor(
        private readonly adapter: CommunicationActionAdapter,
        options: CommunicationActionServiceOptions = {},
    ) {
        this.scheduler = options.scheduler ?? new ActionScheduler();
        this.maxTextLength = options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
        if (!Number.isInteger(this.maxTextLength) || this.maxTextLength < 1) {
            throw new Error("maxTextLength must be a positive integer");
        }
    }

    public send(
        request: MessageRequest,
        context: ActionContext,
    ): Promise<ActionResult<CommunicationObservation>> {
        validateContext(context);
        const normalizedRequest = normalizeMessageRequest(
            request,
            this.maxTextLength,
        );
        const operationKey =
            normalizedRequest.deduplicationKey ?? context.operationId;
        return this.scheduler.schedule(context.memberNumber, operationKey, () =>
            this.adapter.send(normalizedRequest, context),
        );
    }

    public snapshot(): ReturnType<ActionScheduler["snapshot"]> {
        return this.scheduler.snapshot();
    }

    public close(): void {
        this.scheduler.close();
    }
}
