import assert from "node:assert/strict";
import { test } from "node:test";
import {
    ActionLayerRolloutController,
    CommunicationActionService,
} from "../index";
import type {
    ActionContext,
    ActionResult,
    CommunicationActionAdapter,
    CommunicationObservation,
    MessageRequest,
} from "../domain";
import { sendFeatureWhisper } from "../communication-migration";

class RecordingAdapter implements CommunicationActionAdapter {
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

test("uses the action service and releases the rollout lease", async () => {
    const adapter = new RecordingAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    let legacyCalls = 0;

    const dispatched = await sendFeatureWhisper({
        communicationService: service,
        rollout,
        operationId: "feature-whisper:1",
        memberNumber: 23,
        reason: "test notification",
        text: "Hello",
        sendLegacy: () => {
            legacyCalls += 1;
        },
    });

    assert.equal(dispatched, true);
    assert.equal(legacyCalls, 0);
    assert.equal(adapter.requests[0].targetMemberNumber, 23);
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
    service.close();
});

test("uses the legacy sender when rollout is disabled", async () => {
    const service = new CommunicationActionService(new RecordingAdapter());
    const rollout = new ActionLayerRolloutController();
    let legacyCalls = 0;

    const dispatched = await sendFeatureWhisper({
        communicationService: service,
        rollout,
        operationId: "feature-whisper:2",
        memberNumber: 24,
        reason: "test notification",
        text: "Hello",
        sendLegacy: () => {
            legacyCalls += 1;
            return { success: true };
        },
    });

    assert.equal(dispatched, true);
    assert.equal(legacyCalls, 1);
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
    service.close();
});

test("does not invoke the legacy sender after an action delivery is rejected", async () => {
    const adapter: CommunicationActionAdapter = {
        send: async (_request, context) => ({
            status: "rejected",
            metadata: {
                operationId: context.operationId,
                actionId: "communication.test",
                memberNumber: context.memberNumber,
                attempt: 1,
                startedAt: 1,
                completedAt: 2,
            },
            reason: "rejected",
        }),
    };
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    let legacyCalls = 0;
    const warnings: string[] = [];

    const dispatched = await sendFeatureWhisper({
        communicationService: service,
        rollout,
        operationId: "feature-whisper:3",
        memberNumber: 25,
        reason: "test notification",
        text: "Hello",
        sendLegacy: () => {
            legacyCalls += 1;
        },
        warn: (message) => warnings.push(message),
    });

    assert.equal(dispatched, false);
    assert.equal(legacyCalls, 0);
    assert.deepEqual(warnings, ["Communication action did not complete"]);
    service.close();
});
