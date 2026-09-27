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
                textLength: request.text.length,
                observedAt: 2,
            },
        };
    }
}

function connectorWithTrigger(
    onSend: (type: string, text: string, target?: number) => void,
): {
    connector: object;
    trigger: (character: unknown) => Promise<void>;
} {
    let trigger: ((character: unknown) => Promise<void>) | undefined;
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

test("window notifications use communication actions when enabled", async () => {
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    const sent: string[] = [];
    const { connector, trigger } = connectorWithTrigger((_type, text) => {
        sent.push(text);
    });
    const system = new WindowSystem(
        connector as any,
        false,
        0,
        service,
        rollout,
    );

    await system.reloadLocations([windowLocation()]);
    await trigger({
        MemberNumber: 7,
        MapPos: { X: 10, Y: 20 },
        toString: () => "Alice",
    });

    assert.deepEqual(sent, []);
    assert.deepEqual(adapter.requests, [
        {
            channel: "emote",
            text: "*Peeping Tom detected: Alice",
            deduplicationKey: "window-peep:10:20:7",
        },
    ]);
    service.close();
});

test("window notifications retain the legacy path when rollout is disabled", async () => {
    const sent: Array<{ type: string; text: string }> = [];
    const { connector, trigger } = connectorWithTrigger((type, text) => {
        sent.push({ type, text });
    });
    const system = new WindowSystem(connector as any, false, 0);

    await system.reloadLocations([windowLocation()]);
    await trigger({
        MemberNumber: 8,
        MapPos: { X: 10, Y: 20 },
        toString: () => "Bea",
    });

    assert.deepEqual(sent, [
        { type: "Emote", text: "*Peeping Tom detected: Bea" },
    ]);
});
