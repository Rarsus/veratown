import assert from "node:assert/strict";
import { test } from "node:test";
import {
    ActionLayerRolloutController,
    CommunicationActionService,
} from "../../../action-layer";
import type {
    ActionContext,
    ActionResult,
    CommunicationActionAdapter,
    CommunicationObservation,
    MessageRequest,
} from "../../../action-layer/domain";
import { FurnitureBondageSystem } from "../furnitureBondageSystem";

class RecordingCommunicationAdapter implements CommunicationActionAdapter {
    public readonly requests: MessageRequest[] = [];

    public async send(
        request: MessageRequest,
        context: ActionContext,
    ): Promise<ActionResult<CommunicationObservation>> {
        this.requests.push(request);
        return {
            status: "completed",
            metadata: {
                operationId: context.operationId,
                actionId: "communication.test",
                memberNumber: context.memberNumber,
                attempt: 1,
                startedAt: 1,
                completedAt: 2,
            },
            value: {
                channel: request.channel,
                deliveryStatus: "queued",
                targetMemberNumber: request.targetMemberNumber,
                textLength: request.text.length,
                observedAt: 2,
            },
        };
    }
}

function connector(sendMessage: (type: string, text: string) => void) {
    return {
        chatRoom: { map: {} },
        on: () => {},
        SendMessage: sendMessage,
    } as any;
}

test("furniture notifications use communication actions when enabled", async () => {
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    const sent: string[] = [];
    const system = new FurnitureBondageSystem(
        connector((_type, text) => sent.push(text)),
        undefined,
        service,
        rollout,
    );

    await (system as any).sendFurnitureNotification(
        { MemberNumber: 31 },
        "(Activating the restraint chair...)",
    );

    assert.deepEqual(sent, []);
    assert.deepEqual(adapter.requests, [
        {
            channel: "whisper",
            text: "(Activating the restraint chair...)",
            targetMemberNumber: 31,
            deduplicationKey: "furniture-notification:31:1",
        },
    ]);
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
    service.close();
});

test("furniture notifications retain the legacy path when rollout is disabled", async () => {
    const sent: string[] = [];
    const system = new FurnitureBondageSystem(
        connector((type, text) => sent.push(`${type}:${text}`)),
    );

    await (system as any).sendFurnitureNotification(
        { MemberNumber: 32 },
        "(Your restraints have been removed.)",
    );

    assert.deepEqual(sent, ["Whisper:(Your restraints have been removed.)"]);
});
