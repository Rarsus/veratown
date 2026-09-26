import {
    isWorkflowTerminal,
    type WorkflowState,
} from "../../action-layer/workflow";

export interface WorkflowJournalRecord<TStage extends string, TData> {
    readonly state: WorkflowState<TStage, TData>;
    readonly persistedAt: number;
}

export interface WorkflowJournalStorage {
    read<TStage extends string, TData>(
        operationId: string,
    ): Promise<WorkflowJournalRecord<TStage, TData> | undefined>;
    write<TStage extends string, TData>(
        record: WorkflowJournalRecord<TStage, TData>,
    ): Promise<void>;
    list<TStage extends string, TData>(): Promise<
        readonly WorkflowJournalRecord<TStage, TData>[]
    >;
}

export interface WorkflowJournalOptions {
    readonly now?: () => number;
}

export class WorkflowJournalConflictError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "WorkflowJournalConflictError";
    }
}

export class WorkflowJournal {
    private readonly now: () => number;

    public constructor(
        private readonly storage: WorkflowJournalStorage,
        options: WorkflowJournalOptions = {},
    ) {
        this.now = options.now ?? Date.now;
    }

    public async restore<TStage extends string, TData>(
        operationId: string,
    ): Promise<WorkflowState<TStage, TData> | undefined> {
        return (await this.storage.read<TStage, TData>(operationId))?.state;
    }

    public async restoreNonTerminal<TStage extends string, TData>(): Promise<
        readonly WorkflowState<TStage, TData>[]
    > {
        const records = await this.storage.list<TStage, TData>();
        return records
            .map((record) => record.state)
            .filter((state) => !isWorkflowTerminal(state.status));
    }

    public async persist<TStage extends string, TData>(
        state: WorkflowState<TStage, TData>,
        expectedVersion?: number,
    ): Promise<WorkflowState<TStage, TData>> {
        const existing = await this.storage.read<TStage, TData>(
            state.operationId,
        );
        if (!existing) {
            if (expectedVersion !== undefined) {
                throw new WorkflowJournalConflictError(
                    `Workflow does not exist: ${state.operationId}`,
                );
            }
            await this.storage.write({ state, persistedAt: this.now() });
            return state;
        }

        if (sameState(existing.state, state)) return existing.state;
        if (
            expectedVersion !== undefined &&
            existing.state.version !== expectedVersion
        ) {
            throw new WorkflowJournalConflictError(
                `Stale workflow version for ${state.operationId}: expected ${expectedVersion}, found ${existing.state.version}`,
            );
        }
        if (state.version !== existing.state.version + 1) {
            throw new WorkflowJournalConflictError(
                `Workflow version must advance by one for ${state.operationId}`,
            );
        }
        if (
            isWorkflowTerminal(existing.state.status) &&
            existing.state.status !== state.status
        ) {
            throw new WorkflowJournalConflictError(
                `Terminal workflow cannot change: ${state.operationId}`,
            );
        }
        await this.storage.write({ state, persistedAt: this.now() });
        return state;
    }

    public async persistTransition<TStage extends string, TData>(
        state: WorkflowState<TStage, TData>,
        nextState: WorkflowState<TStage, TData>,
    ): Promise<WorkflowState<TStage, TData>> {
        if (nextState.operationId !== state.operationId) {
            throw new WorkflowJournalConflictError(
                "Workflow transition operationId does not match",
            );
        }
        return this.persist(nextState, state.version);
    }
}

function sameState<TStage extends string, TData>(
    left: WorkflowState<TStage, TData>,
    right: WorkflowState<TStage, TData>,
): boolean {
    return (
        left.operationId === right.operationId &&
        left.memberNumber === right.memberNumber &&
        left.stage === right.stage &&
        left.status === right.status &&
        left.version === right.version &&
        left.updatedAt === right.updatedAt &&
        JSON.stringify(left.data) === JSON.stringify(right.data)
    );
}

export class InMemoryWorkflowJournalStorage implements WorkflowJournalStorage {
    private readonly records = new Map<
        string,
        WorkflowJournalRecord<string, unknown>
    >();
    private failNextWrite = false;

    public failNextPersistence(): void {
        this.failNextWrite = true;
    }

    public async read<TStage extends string, TData>(
        operationId: string,
    ): Promise<WorkflowJournalRecord<TStage, TData> | undefined> {
        return this.records.get(operationId) as
            WorkflowJournalRecord<TStage, TData> | undefined;
    }

    public async write<TStage extends string, TData>(
        record: WorkflowJournalRecord<TStage, TData>,
    ): Promise<void> {
        if (this.failNextWrite) {
            this.failNextWrite = false;
            throw new Error("workflow persistence failed");
        }
        this.records.set(
            record.state.operationId,
            record as WorkflowJournalRecord<string, unknown>,
        );
    }

    public async list<TStage extends string, TData>(): Promise<
        readonly WorkflowJournalRecord<TStage, TData>[]
    > {
        return [...this.records.values()] as WorkflowJournalRecord<
            TStage,
            TData
        >[];
    }
}
