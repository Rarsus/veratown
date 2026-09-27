import type { API_Map } from "bc-bot";
import { createLogger } from "../../logging";
import {
    createActionMetadata,
    createActionResult,
    type ActionContext,
    type ActionResult,
    type MapObjectActionAdapter,
    type MapObjectObservation,
    type MapPosition,
} from "../domain";

export interface BCMapObjectActionAdapterOptions {
    readonly now?: () => number;
}

type BCMapObjectApi = Pick<API_Map, "setObject">;

/** Translates local map-object dispatches to the Bondage Club map API. */
export class BCMapObjectActionAdapter implements MapObjectActionAdapter {
    private readonly now: () => number;
    private readonly logger = createLogger("BCMapObjectActionAdapter");

    public constructor(
        private readonly map: BCMapObjectApi,
        options: BCMapObjectActionAdapterOptions = {},
    ) {
        this.now = options.now ?? Date.now;
    }

    public async setObject(
        position: MapPosition,
        objectName: string,
        context: ActionContext,
    ): Promise<ActionResult<MapObjectObservation>> {
        const startedAt = this.now();
        const actionId = "map.setObject";
        const attempt = context.attempt ?? 1;

        if (!isValidPosition(position)) {
            return createActionResult(
                "rejected",
                createActionMetadata(
                    context,
                    actionId,
                    startedAt,
                    attempt,
                    this.now(),
                ),
                {
                    reason: "Map object position must contain safe integer coordinates",
                    failureKind: "permanent",
                    retryable: false,
                },
            );
        }

        if (typeof objectName !== "string" || objectName.trim() === "") {
            return createActionResult(
                "rejected",
                createActionMetadata(
                    context,
                    actionId,
                    startedAt,
                    attempt,
                    this.now(),
                ),
                {
                    reason: "Map object name must not be blank",
                    failureKind: "permanent",
                    retryable: false,
                },
            );
        }

        try {
            this.map.setObject({ X: position.x, Y: position.y }, objectName);
            const completedAt = this.now();
            return createActionResult(
                "completed",
                createActionMetadata(
                    context,
                    actionId,
                    startedAt,
                    attempt,
                    completedAt,
                ),
                {
                    value: {
                        position: { x: position.x, y: position.y },
                        objectName,
                        dispatchStatus: "local_dispatch",
                        observedAt: completedAt,
                    },
                },
            );
        } catch (error) {
            const completedAt = this.now();
            this.logger.error(
                "Map object dispatch failed",
                error instanceof Error ? error : new Error(String(error)),
                {
                    operationId: context.operationId,
                    actionId,
                    memberNumber: context.memberNumber,
                    position,
                    objectName,
                    attempt,
                },
            );
            return createActionResult(
                "failed",
                createActionMetadata(
                    context,
                    actionId,
                    startedAt,
                    attempt,
                    completedAt,
                ),
                {
                    reason: "Map object dispatch failed before local completion",
                    failureKind: "transient",
                    retryable: true,
                },
            );
        }
    }
}

function isValidPosition(
    position: MapPosition,
): position is MapPosition & { readonly x: number; readonly y: number } {
    return (
        Number.isSafeInteger(position?.x) && Number.isSafeInteger(position?.y)
    );
}
