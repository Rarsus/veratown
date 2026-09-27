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
import { ShowerSystem } from "../showerSystem";

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
        SendMessage: sendMessage,
    } as any;
}

test("shower notifications use communication actions when enabled", async () => {
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    const sent: string[] = [];
    const system = new ShowerSystem(
        connector((_type, text) => sent.push(text)),
        undefined,
        undefined,
        false,
        service,
        rollout,
    );

    await (system as any).sendShowerNotification(
        { MemberNumber: 7, Name: "Alice" },
        "(Enjoy your shower.)",
    );

    assert.deepEqual(sent, []);
    assert.deepEqual(adapter.requests, [
        {
            channel: "whisper",
            text: "(Enjoy your shower.)",
            targetMemberNumber: 7,
            deduplicationKey: "shower-notification:7:1",
        },
    ]);
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
    service.close();
});

test("shower notifications retain the legacy path when rollout is disabled", async () => {
    const sent: string[] = [];
    const system = new ShowerSystem(
        connector((type, text) => sent.push(`${type}:${text}`)),
        undefined,
        undefined,
        false,
    );

    await (system as any).sendShowerNotification(
        { MemberNumber: 8, Name: "Bea" },
        "(Enjoy your shower.)",
    );

    assert.deepEqual(sent, ["Whisper:(Enjoy your shower.)"]);
});
