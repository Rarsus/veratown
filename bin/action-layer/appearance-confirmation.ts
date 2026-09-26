export interface AppearanceConfirmationKey {
    readonly operationId: string;
    readonly memberNumber: number;
    readonly connectionEpoch: number;
}

export interface AppearanceConfirmationEvent extends AppearanceConfirmationKey {
    readonly observedAt: number;
}

export type ConfirmationOutcome = "accepted" | "stale" | "unknown";

export interface AppearanceConnectorContract {
    readonly currentEpoch: (memberNumber: number) => number;
    readonly subscribeAppearanceConfirmation: (
        listener: (event: AppearanceConfirmationEvent) => void,
    ) => () => void;
    readonly subscribeConnectionEpoch: (
        listener: (memberNumber: number, epoch: number) => void,
    ) => () => void;
}

export interface AppearanceAdapterCapabilities {
    readonly observesAppearance: boolean;
    readonly addsItems: boolean;
    readonly removesItems: boolean;
    readonly confirmsAuthoritatively: boolean;
    readonly tracksConnectionEpoch: boolean;
}

function validateKey(key: AppearanceConfirmationKey): void {
    if (!key.operationId.trim()) throw new Error("operationId is required");
    if (!Number.isInteger(key.memberNumber) || key.memberNumber < 0) {
        throw new Error("memberNumber must be a non-negative integer");
    }
    if (!Number.isInteger(key.connectionEpoch) || key.connectionEpoch < 0) {
        throw new Error("connectionEpoch must be a non-negative integer");
    }
}

function keyOf(key: AppearanceConfirmationKey): string {
    return `${key.memberNumber}:${key.operationId}`;
}

/**
 * Transport-free confirmation bookkeeping for adapter contract tests.
 * A confirmation is accepted only for the exact pending operation and epoch.
 */
export class AppearanceConfirmationRegistry {
    private readonly pending = new Map<string, AppearanceConfirmationKey>();

    public register(key: AppearanceConfirmationKey): void {
        validateKey(key);
        const operationKey = keyOf(key);
        if (this.pending.has(operationKey)) {
            throw new Error(`Confirmation already registered: ${operationKey}`);
        }
        this.pending.set(operationKey, { ...key });
    }

    public confirm(event: AppearanceConfirmationEvent): ConfirmationOutcome {
        validateKey(event);
        if (!Number.isFinite(event.observedAt)) {
            throw new Error("observedAt must be finite");
        }

        const operationKey = keyOf(event);
        const pending = this.pending.get(operationKey);
        if (!pending) return "unknown";
        if (pending.connectionEpoch !== event.connectionEpoch) {
            return "stale";
        }

        this.pending.delete(operationKey);
        return "accepted";
    }

    public cancel(key: AppearanceConfirmationKey): boolean {
        validateKey(key);
        return this.pending.delete(keyOf(key));
    }

    public invalidateMember(
        memberNumber: number,
        connectionEpoch: number,
    ): number {
        if (!Number.isInteger(memberNumber) || memberNumber < 0) {
            throw new Error("memberNumber must be a non-negative integer");
        }
        if (!Number.isInteger(connectionEpoch) || connectionEpoch < 0) {
            throw new Error("connectionEpoch must be a non-negative integer");
        }

        let removed = 0;
        for (const [operationKey, pending] of this.pending) {
            if (
                pending.memberNumber === memberNumber &&
                pending.connectionEpoch < connectionEpoch
            ) {
                this.pending.delete(operationKey);
                removed += 1;
            }
        }
        return removed;
    }

    public pendingCount(memberNumber?: number): number {
        if (memberNumber === undefined) return this.pending.size;
        if (!Number.isInteger(memberNumber) || memberNumber < 0) {
            throw new Error("memberNumber must be a non-negative integer");
        }
        let count = 0;
        for (const pending of this.pending.values()) {
            if (pending.memberNumber === memberNumber) count += 1;
        }
        return count;
    }
}
