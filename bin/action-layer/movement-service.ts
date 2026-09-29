import type {
    ActionContext,
    ActionResult,
    CharacterPosition,
    MovementActionAdapter,
    MovementActionPolicy,
} from "./domain";
import { ActionScheduler } from "./scheduler";

export class MovementActionService<TRuntimeCharacter = unknown> {
    private readonly scheduler: ActionScheduler;

    public constructor(
        private readonly adapter: MovementActionAdapter<TRuntimeCharacter>,
        scheduler?: ActionScheduler,
    ) {
        this.scheduler = scheduler ?? new ActionScheduler();
    }

    public observePosition(
        character: TRuntimeCharacter,
        context: ActionContext,
    ): Promise<ActionResult<CharacterPosition>> {
        return this.scheduler.schedule(
            context.memberNumber,
            context.operationId,
            () => this.adapter.observePosition(character, context),
        );
    }

    public move(
        character: TRuntimeCharacter,
        destination: CharacterPosition,
        policy: MovementActionPolicy,
    ): Promise<ActionResult<CharacterPosition>> {
        return this.scheduler.schedule(
            policy.memberNumber,
            policy.operationId,
            () => this.adapter.move(character, destination, policy),
        );
    }

    public close(): void {
        this.scheduler.close();
    }
}
