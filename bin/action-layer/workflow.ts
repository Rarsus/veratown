export type WorkflowStatus =
    "pending" | "running" | "waiting" | "completed" | "failed" | "cancelled";

export interface WorkflowState<
    TStage extends string = string,
    TData = unknown,
> {
    readonly operationId: string;
    readonly memberNumber: number;
    readonly stage: TStage;
    readonly status: WorkflowStatus;
    readonly version: number;
    readonly data: TData;
    readonly updatedAt: number;
}

export interface WorkflowTransitionOptions<TStage extends string, TData> {
    readonly stage?: TStage;
    readonly data?: TData;
    readonly updatedAt?: number;
}

const allowedTransitions: Readonly<
    Record<WorkflowStatus, readonly WorkflowStatus[]>
> = {
    pending: ["running", "failed", "cancelled"],
    running: ["waiting", "completed", "failed", "cancelled"],
    waiting: ["running", "completed", "failed", "cancelled"],
    completed: [],
    failed: ["running", "cancelled"],
    cancelled: [],
};

export function createWorkflowState<TStage extends string, TData>(
    operationId: string,
    memberNumber: number,
    stage: TStage,
    data: TData,
    updatedAt = Date.now(),
): WorkflowState<TStage, TData> {
    if (!operationId.trim()) throw new Error("operationId is required");
    if (!Number.isInteger(memberNumber) || memberNumber < 0) {
        throw new Error("memberNumber must be a non-negative integer");
    }
    if (!stage.trim()) throw new Error("workflow stage is required");
    if (!Number.isFinite(updatedAt))
        throw new Error("updatedAt must be finite");

    return {
        operationId,
        memberNumber,
        stage,
        status: "pending",
        version: 1,
        data,
        updatedAt,
    };
}

export function transitionWorkflow<TStage extends string, TData>(
    state: WorkflowState<TStage, TData>,
    status: WorkflowStatus,
    options: WorkflowTransitionOptions<TStage, TData> = {},
): WorkflowState<TStage, TData> {
    if (!allowedTransitions[state.status].includes(status)) {
        throw new Error(
            `Invalid workflow transition: ${state.status} -> ${status}`,
        );
    }
    const updatedAt = options.updatedAt ?? Date.now();
    if (!Number.isFinite(updatedAt))
        throw new Error("updatedAt must be finite");

    return {
        ...state,
        status,
        stage: options.stage ?? state.stage,
        data: options.data ?? state.data,
        version: state.version + 1,
        updatedAt,
    };
}

export function isWorkflowTerminal(status: WorkflowStatus): boolean {
    return status === "completed" || status === "cancelled";
}
