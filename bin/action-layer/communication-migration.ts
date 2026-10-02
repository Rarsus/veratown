import type { CommunicationActionService } from "./communication-service";
import type { ActionLayerRolloutController } from "./rollout";

export type LegacyWhisperResult =
    void | boolean | { readonly success: boolean; readonly message?: string };

export interface FeatureWhisperOptions {
    readonly communicationService?: CommunicationActionService;
    readonly rollout?: ActionLayerRolloutController;
    readonly operationId: string;
    readonly memberNumber: number;
    readonly reason: string;
    readonly text: string;
    readonly sendLegacy: () =>
        LegacyWhisperResult | Promise<LegacyWhisperResult>;
    readonly warn?: (
        message: string,
        details: Readonly<Record<string, unknown>>,
    ) => void;
}

function legacySucceeded(result: LegacyWhisperResult): boolean {
    if (result === false) return false;
    if (typeof result === "object" && result !== null) {
        return result.success;
    }
    return true;
}

export async function sendFeatureWhisper(
    options: FeatureWhisperOptions,
): Promise<boolean> {
    const lease = options.rollout?.begin(
        "communication-notifications",
        options.operationId,
    );
    try {
        if (
            lease?.path === "action" &&
            options.communicationService !== undefined
        ) {
            const result = await options.communicationService.send(
                {
                    channel: "whisper",
                    text: options.text,
                    targetMemberNumber: options.memberNumber,
                    deduplicationKey: options.operationId,
                },
                {
                    operationId: options.operationId,
                    memberNumber: options.memberNumber,
                    source: "feature",
                    reason: options.reason,
                    deadlineAt: Date.now() + 5_000,
                },
            );
            const dispatched =
                result.status === "completed" ||
                result.status === "already_satisfied";
            if (!dispatched) {
                options.warn?.("Communication action did not complete", {
                    operationId: options.operationId,
                    memberNumber: options.memberNumber,
                    deliveryStatus: result.value?.deliveryStatus ?? "unknown",
                    reason: result.reason,
                });
            }
            return dispatched;
        }

        const result = await options.sendLegacy();
        const dispatched = legacySucceeded(result);
        if (!dispatched) {
            options.warn?.("Legacy whisper did not complete", {
                operationId: options.operationId,
                memberNumber: options.memberNumber,
                reason:
                    typeof result === "object" && result !== null
                        ? result.message
                        : undefined,
            });
        }
        return dispatched;
    } finally {
        lease?.release();
    }
}
