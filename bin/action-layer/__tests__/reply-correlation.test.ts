import assert from "node:assert/strict";
import test from "node:test";
import {
    ReplyCorrelationRegistry,
    type ReplyCorrelationRequest,
} from "../reply-correlation";

const request: ReplyCorrelationRequest = {
    requestId: "request-1",
    expectedSenderMemberNumber: 42,
    issuedAt: 100,
    timeoutAt: 200,
};

test("matches a reply from the expected sender once", () => {
    const registry = new ReplyCorrelationRegistry();
    registry.expect(request);

    assert.deepEqual(
        registry.observe({
            requestId: "request-1",
            responseId: "response-1",
            senderMemberNumber: 42,
            observedAt: 150,
        }),
        {
            requestId: "request-1",
            responseId: "response-1",
            senderMemberNumber: 42,
            observedAt: 150,
            outcome: "matched",
        },
    );
    assert.equal(registry.hasPending("request-1"), false);
});

test("rejects a sender mismatch without completing the request", () => {
    const registry = new ReplyCorrelationRegistry();
    registry.expect(request);

    assert.equal(
        registry.observe({
            requestId: "request-1",
            responseId: "response-wrong-sender",
            senderMemberNumber: 99,
            observedAt: 150,
        }).outcome,
        "sender_mismatch",
    );
    assert.equal(registry.hasPending("request-1"), true);
});

test("classifies duplicate responses and late responses explicitly", () => {
    const registry = new ReplyCorrelationRegistry();
    registry.expect(request);

    assert.equal(
        registry.observe({
            requestId: "request-1",
            responseId: "response-duplicate",
            senderMemberNumber: 42,
            observedAt: 150,
        }).outcome,
        "matched",
    );
    assert.equal(
        registry.observe({
            requestId: "request-1",
            responseId: "response-duplicate",
            senderMemberNumber: 42,
            observedAt: 151,
        }).outcome,
        "duplicate",
    );

    registry.expect({ ...request, requestId: "request-2" });
    assert.equal(
        registry.observe({
            requestId: "request-2",
            responseId: "response-late",
            senderMemberNumber: 42,
            observedAt: 201,
        }).outcome,
        "late",
    );
    assert.equal(registry.hasPending("request-2"), false);
});

test("expires pending requests and fails closed after a process restart", () => {
    const registry = new ReplyCorrelationRegistry();
    registry.expect(request);
    assert.deepEqual(registry.expire(200), ["request-1"]);

    const restartedRegistry = new ReplyCorrelationRegistry();
    assert.equal(
        restartedRegistry.observe({
            requestId: "request-1",
            responseId: "response-after-restart",
            senderMemberNumber: 42,
            observedAt: 201,
        }).outcome,
        "unknown_request",
    );
});
