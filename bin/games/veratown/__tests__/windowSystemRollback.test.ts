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
import { WindowSystem } from "../windowSystem";
import type { VeratownLocationDoc } from "../veratownLocationStore";

function windowLocation(): VeratownLocationDoc {
    return {
        _id: "window-1",
        key: "window-1",
        name: "Window",
        type: "window",
        x: 10,
        y: 20,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

function connectorWithTrigger(
    onSend: (type: string, text: string, target?: number) => void,
): {
    connector: object;
    trigger: (character: unknown) => Promise<void>;
} {
    let trigger: ((character: unknown) => void) | undefined;
    const connector = {
        chatRoom: {
            map: {
                addTileTrigger: (_position: unknown, callback: any) => {
                    trigger = callback;
                },
                removeTileTrigger: () => {},
            },
        },
        SendMessage: onSend,
    };
    return {
        connector,
        trigger: async (character) => {
            assert.ok(trigger);
            trigger(character);
            await new Promise((resolve) => setTimeout(resolve, 10));
        },
    };
}

test("rollback preserves an active action operation and routes new peeps to legacy", async () => {
    let releaseAction!: () => void;
    let markStarted!: () => void;
    const actionStarted = new Promise<void>((resolve) => {
        markStarted = resolve;
    });
    const actionReleased = new Promise<void>((resolve) => {
        releaseAction = resolve;
    });
    const adapter: CommunicationActionAdapter = {
        async send(
            request: MessageRequest,
            context: ActionContext,
        ): Promise<ActionResult<CommunicationObservation>> {
            markStarted();
            await actionReleased;
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
                    textLength: request.text.length,
                    observedAt: 2,
                },
            };
        },
    };
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    const sent: Array<{ type: string; text: string }> = [];
    const { connector, trigger } = connectorWithTrigger((type, text) => {
        sent.push({ type, text });
    });
    const system = new WindowSystem(
        connector as any,
        false,
        0,
        service,
        rollout,
    );

    await system.reloadLocations([windowLocation()]);
    const firstTrigger = trigger({
        MemberNumber: 21,
        MapPos: { X: 10, Y: 20 },
        toString: () => "Action Alice",
    });
    await actionStarted;

    rollout.rollback();
    await trigger({
        MemberNumber: 22,
        MapPos: { X: 10, Y: 20 },
        toString: () => "Legacy Bea",
    });

    assert.deepEqual(sent, [
        { type: "Emote", text: "*Peeping Tom detected: Legacy Bea" },
    ]);
    assert.deepEqual(rollout.snapshot().activeOperationIds, [
        "window-peep:10:20:21",
    ]);

    releaseAction();
    await firstTrigger;
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
    service.close();
});
