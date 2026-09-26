export type ActionLayerOperation = "bunny-appearance" | "release-removal";

export type ActionLayerPath = "legacy" | "action";

export interface ActionLayerRolloutOptions {
    readonly bunnyAppearanceEnabled?: boolean;
    readonly releaseRemovalEnabled?: boolean;
}

export interface ActionLayerRolloutSnapshot {
    readonly acceptingNewOperations: boolean;
    readonly enabled: Readonly<Record<ActionLayerOperation, boolean>>;
    readonly activeOperationIds: readonly string[];
}

export interface ActionLayerOperationLease {
    readonly operationId: string;
    readonly operation: ActionLayerOperation;
    readonly path: ActionLayerPath;
    release(): void;
}

const OPERATIONS: readonly ActionLayerOperation[] = [
    "bunny-appearance",
    "release-removal",
];

/**
 * Selects one implementation path per operation and prevents a rollback from
 * starting a second owner for an operation already in flight.
 */
export class ActionLayerRolloutController {
    private acceptingNewOperations = true;
    private readonly enabled: Record<ActionLayerOperation, boolean>;
    private readonly active = new Map<string, ActionLayerOperationLease>();

    public constructor(options: ActionLayerRolloutOptions = {}) {
        this.enabled = {
            "bunny-appearance": options.bunnyAppearanceEnabled === true,
            "release-removal": options.releaseRemovalEnabled === true,
        };
    }

    public begin(
        operation: ActionLayerOperation,
        operationId: string,
    ): ActionLayerOperationLease {
        if (!OPERATIONS.includes(operation)) {
            throw new Error(`Unsupported action-layer operation: ${operation}`);
        }
        if (!operationId.trim()) throw new Error("operationId is required");

        const active = this.active.get(operationId);
        if (active) {
            throw new Error(`Operation already owned: ${operationId}`);
        }

        const path: ActionLayerPath =
            this.acceptingNewOperations && this.enabled[operation]
                ? "action"
                : "legacy";
        let released = false;
        const lease: ActionLayerOperationLease = {
            operationId,
            operation,
            path,
            release: () => {
                if (released) return;
                released = true;
                if (this.active.get(operationId) === lease) {
                    this.active.delete(operationId);
                }
            },
        };
        this.active.set(operationId, lease);
        return lease;
    }

    public setEnabled(operation: ActionLayerOperation, enabled: boolean): void {
        if (!OPERATIONS.includes(operation)) {
            throw new Error(`Unsupported action-layer operation: ${operation}`);
        }
        this.enabled[operation] = enabled;
    }

    public rollback(): void {
        this.acceptingNewOperations = false;
        for (const operation of OPERATIONS) this.enabled[operation] = false;
    }

    public resume(): void {
        this.acceptingNewOperations = true;
    }

    public snapshot(): ActionLayerRolloutSnapshot {
        return {
            acceptingNewOperations: this.acceptingNewOperations,
            enabled: { ...this.enabled },
            activeOperationIds: [...this.active.keys()],
        };
    }
}
