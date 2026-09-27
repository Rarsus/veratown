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
import { TrashcanSystem } from "../trashcanSystem";

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

function connectorWithMessageHandler(
    onSend: (type: string, text: string) => void,
): {
    connector: object;
    emitMessage: (message: unknown) => Promise<void>;
} {
    let messageHandler:
        ((message: unknown) => void | Promise<void>) | undefined;
    const connector = {
        on: (
            event: string,
            handler: (message: unknown) => void | Promise<void>,
        ) => {
            if (event === "Message") messageHandler = handler;
        },
        SendMessage: onSend,
    };
    return {
        connector,
        emitMessage: async (message) => {
            if (!messageHandler)
                throw new Error("Message handler not registered");
            await messageHandler(message);
        },
    };
}

function searchMessage() {
    return {
        message: { Type: "Emote", Content: "*Alice searches the trash*" },
        sender: {
            MemberNumber: 7,
            MapPos: { X: 4, Y: 5 },
            toString: () => "Alice",
        },
    } as any;
}

test("trashcan notifications use communication actions when enabled", async () => {
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    const sent: string[] = [];
    const { connector, emitMessage } = connectorWithMessageHandler(
        (_type, text) => {
            sent.push(text);
        },
    );
    const system = new TrashcanSystem(
        connector as any,
        false,
        service,
        rollout,
        0,
    );

    await system.reloadLocations([
        {
            _id: "trashcan-1",
            key: "trashcan-1",
            name: "Trashcan",
            type: "trashcan",
            x: 4,
            y: 5,
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        },
    ]);
    system.registerTriggers();
    await emitMessage(searchMessage());
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.deepEqual(sent, []);
    assert.equal(adapter.requests.length, 1);
    assert.equal(adapter.requests[0].channel, "emote");
    assert.match(
        adapter.requests[0].text,
        /^\*Alice found .+ while digging through the trash!\*$/,
    );
    assert.match(
        adapter.requests[0].deduplicationKey ?? "",
        /^trashcan-search:7:1$/,
    );
    system.shutdown();
    service.close();
});

test("trashcan notifications retain the legacy path when rollout is disabled", async () => {
    const sent: Array<{ type: string; text: string }> = [];
    const { connector } = connectorWithMessageHandler((type, text) => {
        sent.push({ type, text });
    });
    const system = new TrashcanSystem(
        connector as any,
        false,
        undefined,
        undefined,
        0,
    );

    await system.reloadLocations([
        {
            _id: "trashcan-1",
            key: "trashcan-1",
            name: "Trashcan",
            type: "trashcan",
            x: 4,
            y: 5,
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        },
    ]);
    system.registerTriggers();
    await system.handleMessage(searchMessage());

    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, "Emote");
    assert.match(
        sent[0].text,
        /^\*Alice found .+ while digging through the trash!\*$/,
    );
    system.shutdown();
});
