import assert from "node:assert/strict";
import { test } from "node:test";
import type {
    ActionContext,
    ActionResult,
    CommunicationActionAdapter,
    CommunicationObservation,
    MessageRequest,
} from "../domain";
import {
    CommunicationActionService,
    normalizeMessageRequest,
} from "../communication-service";

function context(operationId: string, memberNumber = 1): ActionContext {
    return {
        operationId,
        memberNumber,
        source: "feature",
        reason: "communication service test",
        deadlineAt: Date.now() + 1000,
    };
}

class RecordingCommunicationAdapter implements CommunicationActionAdapter {
    public readonly requests: MessageRequest[] = [];

    public async send(
        request: MessageRequest,
        actionContext: ActionContext,
    ): Promise<ActionResult<CommunicationObservation>> {
        this.requests.push(request);
        return {
            status: "completed",
            metadata: {
                operationId: actionContext.operationId,
                actionId: "communication.test",
                memberNumber: actionContext.memberNumber,
                attempt: 1,
                startedAt: Date.now(),
                completedAt: Date.now(),
            },
            value: {
                channel: request.channel,
                deliveryStatus: "queued",
                targetMemberNumber: request.targetMemberNumber,
                textLength: request.text.length,
                observedAt: Date.now(),
            },
        };
    }
}

test("normalizes message text and deduplication keys", () => {
    assert.deepEqual(
        normalizeMessageRequest({
            channel: "whisper",
            text: "  hello  ",
            targetMemberNumber: 7,
            deduplicationKey: "  notice-7  ",
        }),
        {
            channel: "whisper",
            text: "hello",
            targetMemberNumber: 7,
            deduplicationKey: "notice-7",
        },
    );
});

test("rejects invalid message shape before adapter dispatch", () => {
    assert.throws(
        () =>
            normalizeMessageRequest({
                channel: "whisper",
                text: "hello",
            }),
        /require a targetMemberNumber/,
    );
    assert.throws(
        () =>
            normalizeMessageRequest({
                channel: "chat",
                text: "hello",
                targetMemberNumber: 7,
            }),
        /cannot have a targetMemberNumber/,
    );
    assert.throws(
        () => normalizeMessageRequest({ channel: "chat", text: "   " }),
        /message text is required/,
    );
    assert.throws(
        () => normalizeMessageRequest({ channel: "chat", text: "too long" }, 3),
        /exceeds 3 characters/,
    );
});

test("routes normalized requests through the adapter", async () => {
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);

    const result = await service.send(
        {
            channel: "chat",
            text: "  hello  ",
            deduplicationKey: "display-1",
        },
        context("operation-1"),
    );

    assert.equal(result.value?.deliveryStatus, "queued");
    assert.deepEqual(adapter.requests, [
        {
            channel: "chat",
            text: "hello",
            deduplicationKey: "display-1",
        },
    ]);
});

test("coalesces duplicate deduplication keys", async () => {
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const request = {
        channel: "chat" as const,
        text: "once",
        deduplicationKey: "same-notice",
    };

    const first = service.send(request, context("first"));
    const duplicate = service.send(request, context("second"));

    assert.strictEqual(first, duplicate);
    await first;
    assert.equal(adapter.requests.length, 1);
});

test("keeps different character queues independent", async () => {
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);

    await Promise.all([
        service.send(
            { channel: "whisper", text: "one", targetMemberNumber: 1 },
            context("one", 1),
        ),
        service.send(
            { channel: "whisper", text: "two", targetMemberNumber: 2 },
            context("two", 2),
        ),
    ]);

    assert.equal(adapter.requests.length, 2);
});
