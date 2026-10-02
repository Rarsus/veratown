import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
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
import {
    clearTestAppearanceConfirmation,
    registerTestAppearanceConfirmation,
} from "./appearanceConfirmationFixture";

beforeEach(registerTestAppearanceConfirmation);
afterEach(clearTestAppearanceConfirmation);

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

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 2000; attempt++) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    assert.fail("Timed out waiting for shower trigger");
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

test("registered shower trigger can run twice for the same character", async () => {
    const sent: string[] = [];
    const mutations: string[] = [];
    const appearance = [
        {
            Group: "Cloth",
            Name: "CottonShirt",
            Property: {},
        },
    ];
    let trigger: ((character: any) => void) | undefined;
    const map = {
        addTileTrigger: (
            _position: unknown,
            handler: (character: any) => void,
        ) => {
            trigger = handler;
        },
        removeTileTrigger: () => undefined,
    };
    const conn = {
        Player: { MemberNumber: 42 },
        chatRoom: { map },
        SendMessage: (_type: string, text: string) => sent.push(text),
        moveOnMap: async () => undefined,
    } as any;
    const character = {
        MemberNumber: 42,
        Name: "Alice",
        MapPos: { X: 1, Y: 1 },
        connection: conn,
        Appearance: {
            MakeAppearanceBundle: () => structuredClone(appearance),
            getAppearanceData: () => [],
            RemoveItem: (group: string) => {
                mutations.push(`remove:${group}`);
                appearance.splice(
                    appearance.findIndex((item) => item.Group === group),
                    1,
                );
            },
            AddItem: (item: (typeof appearance)[number]) => {
                mutations.push(`add:${item.Group}`);
                appearance.push(structuredClone(item));
                return item;
            },
        },
    };
    const system = new ShowerSystem(
        conn,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        { stepDelayMs: 0, singDelayMs: 0 },
    );

    await system.reloadLocations([
        { type: "shower", enabled: true, x: 1, y: 1 },
    ] as any);
    assert.ok(trigger);

    trigger!(character);
    await waitFor(
        () =>
            sent.filter((text) => text.startsWith("(You finish")).length ===
                1 && !(system as any).monitor.isActive(42),
    );
    assert.deepEqual(mutations, ["remove:Cloth", "add:Cloth"]);

    trigger!(character);
    await waitFor(
        () =>
            sent.filter((text) => text.startsWith("(You finish")).length ===
                2 && !(system as any).monitor.isActive(42),
    );
    assert.deepEqual(mutations, [
        "remove:Cloth",
        "add:Cloth",
        "remove:Cloth",
        "add:Cloth",
    ]);
});
