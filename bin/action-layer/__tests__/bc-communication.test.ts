import assert from "node:assert/strict";
import { test } from "node:test";
import { BCCommunicationActionAdapter } from "../adapters/bc-communication";

class FakeConnector {
    public readonly calls: Array<{
        type: string;
        text: string;
        target?: number;
    }> = [];
    public error: Error | undefined;

    public SendMessage(type: string, text: string, target?: number): void {
        this.calls.push({
            type,
            text,
            ...(target === undefined ? {} : { target }),
        });
        if (this.error) throw this.error;
    }
}

function context(operationId: string) {
    return {
        operationId,
        memberNumber: 11,
        source: "feature" as const,
        reason: "communication adapter test",
        deadlineAt: 1000,
        attempt: 2,
    };
}

test("maps whisper, chat, and emote channels to BC transport", async () => {
    const connector = new FakeConnector();
    const adapter = new BCCommunicationActionAdapter(connector, {
        now: () => 100,
    });

    const whisper = await adapter.send(
        { channel: "whisper", text: "secret", targetMemberNumber: 7 },
        context("whisper"),
    );
    const chat = await adapter.send(
        { channel: "chat", text: "hello" },
        context("chat"),
    );
    const emote = await adapter.send(
        { channel: "emote", text: "waves", targetMemberNumber: 7 },
        context("emote"),
    );

    assert.deepEqual(connector.calls, [
        { type: "Whisper", text: "secret", target: 7 },
        { type: "Chat", text: "hello" },
        { type: "Emote", text: "waves", target: 7 },
    ]);
    assert.equal(whisper.value?.deliveryStatus, "queued");
    assert.equal(chat.value?.deliveryStatus, "queued");
    assert.equal(emote.value?.deliveryStatus, "queued");
    assert.equal(whisper.metadata.attempt, 2);
});

test("does not claim delivery when the BC call throws", async () => {
    const connector = new FakeConnector();
    connector.error = new Error("disconnected");
    const adapter = new BCCommunicationActionAdapter(connector, {
        now: () => 200,
    });

    const result = await adapter.send(
        { channel: "chat", text: "hello" },
        context("failed-send"),
    );

    assert.equal(result.status, "failed");
    assert.equal(result.value?.deliveryStatus, "unknown");
    assert.equal(result.failureKind, "transient");
    assert.equal(result.retryable, true);
    assert.match(result.reason ?? "", /could not be established/);
});
