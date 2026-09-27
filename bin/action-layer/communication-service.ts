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
    readonly deduplicationTtlMs?: number;
    readonly maxRecentDeduplications?: number;
}

const DEFAULT_MAX_TEXT_LENGTH = 1000;
const DEFAULT_DEDUPLICATION_TTL_MS = 30_000;
const DEFAULT_MAX_RECENT_DEDUPLICATIONS = 256;

interface RecentCommunicationOperation {
    readonly promise: Promise<ActionResult<CommunicationObservation>>;
    readonly expiresAt: number;
}

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
    private readonly deduplicationTtlMs: number;
    private readonly maxRecentDeduplications: number;
    private readonly recentOperations = new Map<
        string,
        RecentCommunicationOperation
    >();

    public constructor(
        private readonly adapter: CommunicationActionAdapter,
        options: CommunicationActionServiceOptions = {},
    ) {
        this.scheduler = options.scheduler ?? new ActionScheduler();
        this.maxTextLength = options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
        if (!Number.isInteger(this.maxTextLength) || this.maxTextLength < 1) {
            throw new Error("maxTextLength must be a positive integer");
        }
        this.deduplicationTtlMs =
            options.deduplicationTtlMs ?? DEFAULT_DEDUPLICATION_TTL_MS;
        if (
            !Number.isInteger(this.deduplicationTtlMs) ||
            this.deduplicationTtlMs < 1
        ) {
            throw new Error("deduplicationTtlMs must be a positive integer");
        }
        this.maxRecentDeduplications =
            options.maxRecentDeduplications ??
            DEFAULT_MAX_RECENT_DEDUPLICATIONS;
        if (
            !Number.isInteger(this.maxRecentDeduplications) ||
            this.maxRecentDeduplications < 1
        ) {
            throw new Error(
                "maxRecentDeduplications must be a positive integer",
            );
        }
    }

    private pruneRecentOperations(now: number): void {
        for (const [key, operation] of this.recentOperations) {
            if (operation.expiresAt <= now) this.recentOperations.delete(key);
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
        const now = Date.now();
        this.pruneRecentOperations(now);
        const deduplicationKey = `${context.memberNumber}:${operationKey}`;
        const existing = this.recentOperations.get(deduplicationKey);
        if (existing) return existing.promise;

        const promise = this.scheduler.schedule(
            context.memberNumber,
            operationKey,
            () => this.adapter.send(normalizedRequest, context),
        );
        this.recentOperations.set(deduplicationKey, {
            promise,
            expiresAt: now + this.deduplicationTtlMs,
        });
        while (this.recentOperations.size > this.maxRecentDeduplications) {
            const oldest = this.recentOperations.keys().next().value;
            if (oldest === undefined) break;
            this.recentOperations.delete(oldest);
        }
        void promise.then(
            (result) => {
                if (
                    result.status !== "completed" &&
                    result.status !== "already_satisfied" &&
                    this.recentOperations.get(deduplicationKey)?.promise ===
                        promise
                ) {
                    this.recentOperations.delete(deduplicationKey);
                }
            },
            () => {
                if (
                    this.recentOperations.get(deduplicationKey)?.promise ===
                    promise
                ) {
                    this.recentOperations.delete(deduplicationKey);
                }
            },
        );
        return promise;
    }

    public snapshot(): ReturnType<ActionScheduler["snapshot"]> & {
        readonly recentDeduplicationCount: number;
    } {
        this.pruneRecentOperations(Date.now());
        return {
            ...this.scheduler.snapshot(),
            recentDeduplicationCount: this.recentOperations.size,
        };
    }

    public close(): void {
        this.scheduler.close();
        this.recentOperations.clear();
    }
}
