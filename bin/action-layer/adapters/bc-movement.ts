import type { API_Character } from "bc-bot";
import {
    createActionMetadata,
    createActionResult,
    type ActionContext,
    type ActionResult,
    type CharacterPosition,
    type MovementActionAdapter,
    type MovementActionPolicy,
} from "../domain";

interface MovementConnector {
    on(
        event: "MapPosition" | "Disconnected",
        listener: (...args: any[]) => void,
    ): void;
    off(
        event: "MapPosition" | "Disconnected",
        listener: (...args: any[]) => void,
    ): void;
}

export class BCMovementActionAdapter implements MovementActionAdapter<API_Character> {
    public readonly capabilities = {
        observesPosition: true,
        movesCharacters: true,
        confirmsAuthoritatively: true,
    } as const;

    public observePosition(
        character: API_Character,
        context: ActionContext,
    ): Promise<ActionResult<CharacterPosition>> {
        const observedAt = Date.now();
        return Promise.resolve(
            createActionResult(
                "completed",
                createActionMetadata(context, "movement.observe", observedAt),
                {
                    value: {
                        x: character.MapPos.X,
                        y: character.MapPos.Y,
                    },
                    retryable: false,
                },
            ),
        );
    }

    public move(
        character: API_Character,
        destination: CharacterPosition,
        policy: MovementActionPolicy,
    ): Promise<ActionResult<CharacterPosition>> {
        const startedAt = Date.now();
        const connector = character.connection as unknown as MovementConnector;
        if (!connector || typeof connector.on !== "function") {
            return Promise.resolve(
                createActionResult(
                    "failed",
                    createActionMetadata(
                        policyContext(policy),
                        "movement.move",
                        startedAt,
                    ),
                    {
                        reason: "Map movement events are unavailable",
                        failureKind: "permanent",
                        retryable: false,
                    },
                ),
            );
        }

        if (
            character.MapPos.X === destination.x &&
            character.MapPos.Y === destination.y
        ) {
            return Promise.resolve(
                createActionResult(
                    "already_satisfied",
                    createActionMetadata(
                        policyContext(policy),
                        "movement.move",
                        startedAt,
                    ),
                    {
                        value: destination,
                        retryable: false,
                    },
                ),
            );
        }

        return new Promise((resolve) => {
            let settled = false;
            const finish = (result: ActionResult<CharacterPosition>): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                connector.off("MapPosition", onMapPosition);
                connector.off("Disconnected", onDisconnected);
                resolve(result);
            };
            const onMapPosition = (
                memberNumber: number,
                position: { X: number; Y: number },
            ): void => {
                if (
                    memberNumber !== character.MemberNumber ||
                    position.X !== destination.x ||
                    position.Y !== destination.y
                ) {
                    return;
                }
                finish(
                    createActionResult(
                        "completed",
                        createActionMetadata(
                            policyContext(policy),
                            "movement.move",
                            startedAt,
                        ),
                        {
                            value: destination,
                            retryable: false,
                        },
                    ),
                );
            };
            const onDisconnected = (): void => {
                finish(
                    createActionResult(
                        "failed",
                        createActionMetadata(
                            policyContext(policy),
                            "movement.move",
                            startedAt,
                        ),
                        {
                            reason: "Connector disconnected before movement confirmation",
                            failureKind: "transient",
                            retryable: true,
                        },
                    ),
                );
            };
            const timeout = setTimeout(() => {
                finish(
                    createActionResult(
                        "timed_out",
                        createActionMetadata(
                            policyContext(policy),
                            "movement.move",
                            startedAt,
                        ),
                        {
                            reason: `Movement confirmation exceeded ${policy.timeoutMs}ms`,
                            failureKind: "timeout",
                            retryable: true,
                        },
                    ),
                );
            }, policy.timeoutMs);

            connector.on("MapPosition", onMapPosition);
            connector.on("Disconnected", onDisconnected);
            character.mapTeleport({ X: destination.x, Y: destination.y });
        });
    }
}

function policyContext(policy: MovementActionPolicy): ActionContext {
    return {
        operationId: policy.operationId,
        memberNumber: policy.memberNumber,
        source: "release",
        reason: "release_room_containment",
        deadlineAt: Date.now() + policy.timeoutMs,
    };
}
