export interface ReplyCorrelationRequest {
    readonly requestId: string;
    readonly expectedSenderMemberNumber: number;
    readonly issuedAt: number;
    readonly timeoutAt: number;
}

export interface ReplyObservation {
    readonly requestId: string;
    readonly responseId: string;
    readonly senderMemberNumber: number;
    readonly observedAt: number;
}

export type ReplyCorrelationOutcome =
    "matched" | "duplicate" | "late" | "sender_mismatch" | "unknown_request";

export interface ReplyCorrelationResult {
    readonly outcome: ReplyCorrelationOutcome;
    readonly requestId: string;
    readonly responseId: string;
}

function requireNonEmpty(value: string, field: string): void {
    if (!value.trim()) throw new Error(`${field} is required`);
}

function requireMemberNumber(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${field} must be a non-negative integer`);
    }
}

function validateRequest(request: ReplyCorrelationRequest): void {
    requireNonEmpty(request.requestId, "requestId");
    requireMemberNumber(
        request.expectedSenderMemberNumber,
        "expectedSenderMemberNumber",
    );
    if (!Number.isFinite(request.issuedAt)) {
        throw new Error("issuedAt must be finite");
    }
    if (!Number.isFinite(request.timeoutAt)) {
        throw new Error("timeoutAt must be finite");
    }
    if (request.timeoutAt < request.issuedAt) {
        throw new Error("timeoutAt must not precede issuedAt");
    }
}

function validateObservation(observation: ReplyObservation): void {
    requireNonEmpty(observation.requestId, "requestId");
    requireNonEmpty(observation.responseId, "responseId");
    requireMemberNumber(observation.senderMemberNumber, "senderMemberNumber");
    if (!Number.isFinite(observation.observedAt)) {
        throw new Error("observedAt must be finite");
    }
}

/**
 * Correlates command replies without treating a matching message as delivery
 * confirmation. The registry is intentionally process-local; callers that
 * need restart-safe correlation must persist the request and response IDs in
 * their workflow boundary before adopting this contract.
 */
export class ReplyCorrelationRegistry {
    private readonly pending = new Map<string, ReplyCorrelationRequest>();
    private readonly seenResponses = new Set<string>();

    public expect(request: ReplyCorrelationRequest): void {
        validateRequest(request);
        if (this.pending.has(request.requestId)) {
            throw new Error(
                `requestId is already pending: ${request.requestId}`,
            );
        }
        this.pending.set(request.requestId, request);
    }

    public observe(observation: ReplyObservation): ReplyCorrelationResult {
        validateObservation(observation);
        if (this.seenResponses.has(observation.responseId)) {
            return { ...observation, outcome: "duplicate" };
        }
        this.seenResponses.add(observation.responseId);

        const request = this.pending.get(observation.requestId);
        if (!request) return { ...observation, outcome: "unknown_request" };
        if (observation.observedAt > request.timeoutAt) {
            this.pending.delete(observation.requestId);
            return { ...observation, outcome: "late" };
        }
        if (
            observation.senderMemberNumber !==
            request.expectedSenderMemberNumber
        ) {
            return { ...observation, outcome: "sender_mismatch" };
        }

        this.pending.delete(observation.requestId);
        return { ...observation, outcome: "matched" };
    }

    public expire(now: number): string[] {
        if (!Number.isFinite(now)) throw new Error("now must be finite");
        const expired: string[] = [];
        for (const [requestId, request] of this.pending) {
            if (request.timeoutAt <= now) {
                this.pending.delete(requestId);
                expired.push(requestId);
            }
        }
        return expired;
    }

    public hasPending(requestId: string): boolean {
        return this.pending.has(requestId);
    }

    public close(): void {
        this.pending.clear();
        this.seenResponses.clear();
    }
}
