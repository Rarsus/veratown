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
import { CatDogSystem } from "../catDogSystem";

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

function character(memberNumber: number) {
    const vibrator = {
        Name: "DeviceVibrator",
        Group: "ItemVulva",
        Extended: {
            Type: 1,
            SetType(value: number) {
                this.Type = value;
            },
        },
    };
    return {
        MemberNumber: memberNumber,
        Name: "Player",
        Appearance: { Appearance: [vibrator] },
    } as any;
}

const vibratorAction = {
    type: "vibrator",
    message: "The intensity rises.",
    intensityIncrease: 1,
};

test("CatDog vibrator notifications use communication actions when enabled", async () => {
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    const sent: string[] = [];
    const system = new CatDogSystem(
        connector((_type, text) => sent.push(text)),
        undefined,
        service,
        rollout,
    );

    await (system as any).performVibratorAction(
        character(41),
        vibratorAction,
        "cat",
    );

    assert.deepEqual(sent, []);
    assert.deepEqual(adapter.requests, [
        {
            channel: "whisper",
            text: "*The cat cuddles you and by mistake triggers your device... The intensity rises.*",
            targetMemberNumber: 41,
            deduplicationKey: "catdog-notification:41:1",
        },
    ]);
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
    service.close();
});

test("CatDog vibrator notifications retain the legacy path when rollout is disabled", async () => {
    const sent: string[] = [];
    const system = new CatDogSystem(
        connector((type, text) => sent.push(`${type}:${text}`)),
    );

    await (system as any).performVibratorAction(
        character(42),
        vibratorAction,
        "dog",
    );

    assert.deepEqual(sent, [
        "Whisper:*The dog cuddles you and by mistake triggers your device... The intensity rises.*",
    ]);
});
