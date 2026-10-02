import {
    createActionMetadata,
    createActionResult,
    type ActionContext,
    type ActionResult,
    type ActionSource,
    type AppearanceMutationPolicy,
    type CharacterAction,
    type MovementActionPolicy,
} from "./domain";
import type { AppearanceActionService } from "./appearance-service";
import type { CommunicationActionService } from "./communication-service";
import type { MovementActionService } from "./movement-service";

export interface CharacterActionServices<TRuntimeCharacter = unknown> {
    readonly appearance?: AppearanceActionService<TRuntimeCharacter>;
    readonly communication?: CommunicationActionService;
    readonly movement?: MovementActionService<TRuntimeCharacter>;
}

function appearanceSource(
    source: ActionSource,
): AppearanceMutationPolicy["source"] | undefined {
    return source === "system" ? undefined : source;
}

function unavailable(
    context: ActionContext,
    actionId: string,
    reason: string,
): ActionResult<unknown> {
    const now = Date.now();
    return createActionResult(
        "rejected",
        createActionMetadata(context, actionId, now, context.attempt, now),
        { reason, failureKind: "permanent", retryable: false },
    );
}

function validateContext(context: ActionContext): string | undefined {
    if (!context.operationId.trim()) return "operationId is required";
    if (!Number.isInteger(context.memberNumber) || context.memberNumber < 0) {
        return "memberNumber must be a non-negative integer";
    }
    if (!Number.isFinite(context.deadlineAt)) {
        return "deadlineAt must be finite";
    }
    return undefined;
}

/** Routes one domain action to the service that owns that action contract. */
export class CharacterActionExecutor<TRuntimeCharacter = unknown> {
    public constructor(
        private readonly services: CharacterActionServices<TRuntimeCharacter>,
    ) {}

    public execute(
        character: TRuntimeCharacter,
        action: CharacterAction,
        context: ActionContext,
    ): Promise<ActionResult<unknown>> {
        const invalidContext = validateContext(context);
        if (invalidContext)
            return Promise.resolve(
                unavailable(context, action.type, invalidContext),
            );

        switch (action.type) {
            case "appearance.add":
            case "appearance.remove": {
                const service = this.services.appearance;
                const source = appearanceSource(context.source);
                if (!source) {
                    return Promise.resolve(
                        unavailable(
                            context,
                            action.type,
                            "System actions cannot mutate appearance",
                        ),
                    );
                }
                if (!service) {
                    return Promise.resolve(
                        unavailable(
                            context,
                            action.type,
                            "Appearance action service is unavailable",
                        ),
                    );
                }
                const policy = {
                    ...action.options,
                    operationId: context.operationId,
                    memberNumber: context.memberNumber,
                    source,
                    reason: context.reason,
                };
                return action.type === "appearance.add"
                    ? service.add(character, action.item, policy)
                    : service.remove(character, action.item, policy);
            }
            case "appearance.set_hidden_layers": {
                const service = this.services.appearance;
                const source = appearanceSource(context.source);
                if (!source) {
                    return Promise.resolve(
                        unavailable(
                            context,
                            action.type,
                            "System actions cannot mutate appearance",
                        ),
                    );
                }
                if (!service) {
                    return Promise.resolve(
                        unavailable(
                            context,
                            action.type,
                            "Appearance action service is unavailable",
                        ),
                    );
                }
                return service.setHiddenLayers(
                    character,
                    action.layers,
                    action.hidden,
                    {
                        ...action.options,
                        operationId: context.operationId,
                        memberNumber: context.memberNumber,
                        source,
                        reason: context.reason,
                    },
                );
            }
            case "communication.send": {
                const service = this.services.communication;
                if (!service) {
                    return Promise.resolve(
                        unavailable(
                            context,
                            action.type,
                            "Communication action service is unavailable",
                        ),
                    );
                }
                return service.send(action.request, context);
            }
            case "movement.move": {
                const service = this.services.movement;
                if (!service) {
                    return Promise.resolve(
                        unavailable(
                            context,
                            action.type,
                            "Movement action service is unavailable",
                        ),
                    );
                }
                const policy: MovementActionPolicy = {
                    ...action.options,
                    operationId: context.operationId,
                    memberNumber: context.memberNumber,
                    source: context.source,
                    reason: context.reason,
                };
                return service.move(character, action.destination, policy);
            }
        }
    }
}
