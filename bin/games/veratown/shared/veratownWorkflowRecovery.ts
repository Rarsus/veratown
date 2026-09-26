import {
    createWorkflowState,
    isWorkflowTerminal,
    transitionWorkflow,
    type WorkflowState,
} from "../../../action-layer/workflow";
import { WorkflowJournal } from "../../shared/durableWorkflowJournal";

export type VeratownWorkflowSource = "bunny" | "release";

export interface VeratownWorkflowData {
    readonly source: VeratownWorkflowSource;
    readonly target: string;
    readonly [key: string]: unknown;
}

export class VeratownWorkflowRecovery {
    public constructor(private readonly journal: WorkflowJournal) {}

    public async start(
        operationId: string,
        memberNumber: number,
        source: VeratownWorkflowSource,
        data: {
            readonly target: string;
            readonly [key: string]: unknown;
        },
    ): Promise<WorkflowState<string, VeratownWorkflowData>> {
        const restored = await this.journal.restore<
            string,
            VeratownWorkflowData
        >(operationId);
        if (restored) return restored;
        return this.journal.persist(
            createWorkflowState<string, VeratownWorkflowData>(
                operationId,
                memberNumber,
                source,
                {
                    source,
                    ...data,
                },
            ),
        );
    }

    public async resume(
        state: WorkflowState<string, VeratownWorkflowData>,
    ): Promise<WorkflowState<string, VeratownWorkflowData>> {
        if (isWorkflowTerminal(state.status)) return state;
        if (state.status === "running" || state.status === "waiting") {
            return state;
        }
        return this.journal.persistTransition(
            state,
            transitionWorkflow(state, "running"),
        );
    }

    public async complete(
        state: WorkflowState<string, VeratownWorkflowData>,
    ): Promise<WorkflowState<string, VeratownWorkflowData>> {
        if (isWorkflowTerminal(state.status)) return state;
        return this.journal.persistTransition(
            state,
            transitionWorkflow(state, "completed"),
        );
    }

    public async fail(
        state: WorkflowState<string, VeratownWorkflowData>,
    ): Promise<WorkflowState<string, VeratownWorkflowData>> {
        if (isWorkflowTerminal(state.status)) return state;
        return this.journal.persistTransition(
            state,
            transitionWorkflow(state, "failed"),
        );
    }

    public restoreActive(): Promise<
        readonly WorkflowState<string, VeratownWorkflowData>[]
    > {
        return this.journal.restoreNonTerminal();
    }
}
