import { Collection, Db } from "mongodb";
import { asTimestamp } from "./mongodbTypeValidation";
import {
    WorkflowJournalConflictError,
    type WorkflowJournalRecord,
    type WorkflowJournalStorage,
} from "./durableWorkflowJournal";
import type { WorkflowState } from "../../action-layer/workflow";
import { executeDbMutation } from "../veratown/shared/executeWithRetry";

interface WorkflowJournalDocument {
    readonly _id: string;
    readonly operationId: string;
    readonly state: WorkflowState<string, unknown>;
    readonly persistedAt: number;
}

export class MongoWorkflowJournalStorage implements WorkflowJournalStorage {
    private readonly collection: Collection<WorkflowJournalDocument>;
    private initialization?: Promise<void>;

    public constructor(db: Db, collectionName = "veratownWorkflowJournal") {
        this.collection =
            db.collection<WorkflowJournalDocument>(collectionName);
    }

    public async initialize(): Promise<void> {
        this.initialization ??= executeDbMutation(async () => {
            await this.collection.createIndex(
                { operationId: 1 },
                { unique: true, name: "workflow_operation_id" },
            );
            await this.collection.createIndex(
                { "state.memberNumber": 1, "state.status": 1 },
                { name: "workflow_member_status" },
            );
            await this.collection.createIndex(
                { "state.status": 1, "state.updatedAt": 1 },
                { name: "workflow_status_updated" },
            );
        }, "workflow_journal_indexes");
        await this.initialization;
    }

    public async read<TStage extends string, TData>(
        operationId: string,
    ): Promise<WorkflowJournalRecord<TStage, TData> | undefined> {
        await this.initialize();
        const document = await this.collection.findOne({ _id: operationId });
        if (!document) return undefined;
        return {
            state: document.state as WorkflowState<TStage, TData>,
            persistedAt: document.persistedAt,
        };
    }

    public async write<TStage extends string, TData>(
        record: WorkflowJournalRecord<TStage, TData>,
        expectedVersion?: number,
    ): Promise<void> {
        await this.initialize();
        const document: WorkflowJournalDocument = {
            _id: record.state.operationId,
            operationId: record.state.operationId,
            state: record.state as WorkflowState<string, unknown>,
            persistedAt: asTimestamp(record.persistedAt),
        };

        if (expectedVersion === undefined) {
            try {
                await executeDbMutation(
                    () => this.collection.insertOne(document),
                    "workflow_journal_insert",
                );
                return;
            } catch (error) {
                const existing = await this.collection.findOne({
                    _id: record.state.operationId,
                });
                if (existing) {
                    throw new WorkflowJournalConflictError(
                        `Workflow already exists: ${record.state.operationId}`,
                    );
                }
                throw error;
            }
        }

        const result = await executeDbMutation(
            () =>
                this.collection.updateOne(
                    {
                        _id: record.state.operationId,
                        "state.version": expectedVersion,
                        "state.status": {
                            $nin: ["completed", "cancelled"],
                        },
                    },
                    {
                        $set: {
                            operationId: document.operationId,
                            state: document.state,
                            persistedAt: document.persistedAt,
                        },
                    },
                ),
            "workflow_journal_compare_and_set",
        );
        if (result.matchedCount > 0) return;

        const existing = await this.collection.findOne({
            _id: record.state.operationId,
        });
        if (!existing) {
            throw new WorkflowJournalConflictError(
                `Workflow does not exist: ${record.state.operationId}`,
            );
        }
        if (
            existing.state.status === "completed" ||
            existing.state.status === "cancelled"
        ) {
            throw new WorkflowJournalConflictError(
                `Terminal workflow cannot change: ${record.state.operationId}`,
            );
        }
        throw new WorkflowJournalConflictError(
            `Stale workflow version for ${record.state.operationId}: expected ${expectedVersion}, found ${existing.state.version}`,
        );
    }

    public async list<TStage extends string, TData>(): Promise<
        readonly WorkflowJournalRecord<TStage, TData>[]
    > {
        await this.initialize();
        const documents = await this.collection.find({}).toArray();
        return documents.map((document) => ({
            state: document.state as WorkflowState<TStage, TData>,
            persistedAt: document.persistedAt,
        }));
    }
}
