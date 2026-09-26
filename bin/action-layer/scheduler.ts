export interface ActionSchedulerOptions {
    readonly maxPendingPerCharacter?: number;
}

export interface ActionSchedulerSnapshot {
    readonly closed: boolean;
    readonly characterCount: number;
    readonly pendingByCharacter: Readonly<Record<number, number>>;
}

interface CharacterQueue {
    tail: Promise<void>;
    pending: number;
}

/**
 * Schedules work independently per character.
 *
 * A failed action settles its character queue so later actions can continue.
 * Different characters never share a serialization chain. Duplicate operation
 * IDs return the existing promise instead of replaying the operation.
 */
export class ActionScheduler {
    private readonly queues = new Map<number, CharacterQueue>();
    private readonly operations = new Map<string, Promise<unknown>>();
    private readonly maxPendingPerCharacter: number;
    private closed = false;

    public constructor(options: ActionSchedulerOptions = {}) {
        this.maxPendingPerCharacter = options.maxPendingPerCharacter ?? 32;
        if (
            !Number.isInteger(this.maxPendingPerCharacter) ||
            this.maxPendingPerCharacter < 1
        ) {
            throw new Error(
                "maxPendingPerCharacter must be a positive integer",
            );
        }
    }

    public schedule<T>(
        memberNumber: number,
        operationId: string,
        operation: () => Promise<T> | T,
    ): Promise<T> {
        if (this.closed) throw new Error("Action scheduler is closed");
        if (!Number.isInteger(memberNumber) || memberNumber < 0) {
            throw new Error("memberNumber must be a non-negative integer");
        }
        if (!operationId.trim()) throw new Error("operationId is required");

        const operationKey = `${memberNumber}:${operationId}`;
        const existing = this.operations.get(operationKey);
        if (existing) return existing as Promise<T>;

        const queue = this.queues.get(memberNumber) ?? {
            tail: Promise.resolve(),
            pending: 0,
        };
        if (queue.pending >= this.maxPendingPerCharacter) {
            throw new Error(
                `Action queue limit reached for character ${memberNumber}`,
            );
        }

        queue.pending += 1;
        this.queues.set(memberNumber, queue);
        const result = queue.tail.catch(() => undefined).then(operation);
        const settled = result.then(
            () => undefined,
            () => undefined,
        );
        queue.tail = settled;
        this.operations.set(operationKey, result);

        const release = () => {
            queue.pending -= 1;
            if (
                queue.pending === 0 &&
                this.queues.get(memberNumber) === queue
            ) {
                this.queues.delete(memberNumber);
            }
            if (this.operations.get(operationKey) === result) {
                this.operations.delete(operationKey);
            }
        };
        result.then(release, release);
        return result;
    }

    public close(): void {
        this.closed = true;
    }

    public snapshot(): ActionSchedulerSnapshot {
        const pendingByCharacter: Record<number, number> = {};
        for (const [memberNumber, queue] of this.queues) {
            pendingByCharacter[memberNumber] = queue.pending;
        }
        return {
            closed: this.closed,
            characterCount: this.queues.size,
            pendingByCharacter,
        };
    }
}
