import {
    createActionMetadata,
    createActionResult,
    type ActionContext,
    type ActionResult,
    type CharacterPosition,
    type MovementActionAdapter,
    type MovementActionPolicy,
} from "../domain";

interface BCMovementCharacter {
    readonly MemberNumber: number;
    readonly MapPos: { X: number; Y: number };
    readonly connection: MovementConnector;
}

interface MovementConnector {
    readonly Player?: {
        readonly MemberNumber: number;
    };
    on(
        event: "MapPositionObserved" | "Disconnected",
        listener: (...args: any[]) => void,
    ): void;
    off(
        event: "MapPositionObserved" | "Disconnected",
        listener: (...args: any[]) => void,
    ): void;
    moveOnMap(x: number, y: number): void;
    teleportOnMap(x: number, y: number, memberNumber?: number): void;
}

export class BCMovementActionAdapter implements MovementActionAdapter<BCMovementCharacter> {
    public readonly capabilities = {
        observesPosition: true,
        movesCharacters: true,
        confirmsAuthoritatively: true,
    } as const;

    public observePosition(
        character: BCMovementCharacter,
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
        character: BCMovementCharacter,
        destination: CharacterPosition,
        policy: MovementActionPolicy,
    ): Promise<ActionResult<CharacterPosition>> {
        const startedAt = Date.now();
        const connector = character.connection;
        if (
            !connector ||
            typeof connector.on !== "function" ||
            typeof connector.off !== "function" ||
            typeof connector.moveOnMap !== "function"
        ) {
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
        const connectorOwnsCharacter =
            connector.Player?.MemberNumber === character.MemberNumber;
        if (
            !connectorOwnsCharacter &&
            typeof connector.teleportOnMap !== "function"
        ) {
            return Promise.resolve(
                createActionResult(
                    "rejected",
                    createActionMetadata(
                        policyContext(policy),
                        "movement.move",
                        startedAt,
                    ),
                    {
                        reason: "Movement connector does not expose target-member teleport",
                        failureKind: "rejected",
                        retryable: false,
                    },
                ),
            );
        }

        const acceptsPosition = (position: CharacterPosition): boolean =>
            policy.acceptPosition?.(position) ??
            (position.x === destination.x && position.y === destination.y);

        if (
            acceptsPosition({
                x: character.MapPos.X,
                y: character.MapPos.Y,
            })
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
                connector.off("MapPositionObserved", onMapPosition);
                connector.off("Disconnected", onDisconnected);
                policy.signal?.removeEventListener("abort", onAbort);
                resolve(result);
            };
            const onMapPosition = (
                memberNumber: number,
                position: { X: number; Y: number },
            ): void => {
                if (
                    memberNumber !== character.MemberNumber ||
                    !acceptsPosition({ x: position.X, y: position.Y })
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
                            value: { x: position.X, y: position.Y },
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
            const onAbort = (): void => {
                finish(
                    createActionResult(
                        "cancelled",
                        createActionMetadata(
                            policyContext(policy),
                            "movement.move",
                            startedAt,
                        ),
                        {
                            reason: "Movement was cancelled before confirmation",
                            failureKind: "cancelled",
                            retryable: false,
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

            connector.on("MapPositionObserved", onMapPosition);
            connector.on("Disconnected", onDisconnected);
            policy.signal?.addEventListener("abort", onAbort, { once: true });
            if (policy.signal?.aborted) {
                onAbort();
                return;
            }
            try {
                if (connectorOwnsCharacter) {
                    connector.moveOnMap(destination.x, destination.y);
                } else {
                    connector.teleportOnMap(
                        destination.x,
                        destination.y,
                        character.MemberNumber,
                    );
                }
            } catch (error) {
                finish(
                    createActionResult(
                        "failed",
                        createActionMetadata(
                            policyContext(policy),
                            "movement.move",
                            startedAt,
                        ),
                        {
                            reason:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                            failureKind: "transient",
                            retryable: true,
                        },
                    ),
                );
            }
        });
    }
}

function policyContext(policy: MovementActionPolicy): ActionContext {
    return {
        operationId: policy.operationId,
        memberNumber: policy.memberNumber,
        source: policy.source,
        reason: policy.reason,
        deadlineAt: Date.now() + policy.timeoutMs,
    };
}
