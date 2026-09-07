import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { API_Character, BC_Server_ChatRoomMessage } from "bc-bot";
import { EventBus } from "../../shared/eventBus";
import {
    KidnappersGameEventRouter,
    KidnappersGameMessageFeatureSystem,
    KidnappersGameSubscribers,
} from "../kidnappersGameMessaging";
import { KidnappersGameSession } from "../kidnappersGameSession";

const event = {
    type: "PLAYER_JOINED" as const,
    memberNumber: 10,
    correlationId: "join-1",
    emittedAt: 100,
    deliveryId: "kidnappers:session-1:join-1:PLAYER_JOINED",
};

describe("KidnappersGame messaging", () => {
    test("publishes ordered, retryable deliveries without duplicating successes", async () => {
        const bus = new EventBus();
        const calls: string[] = [];
        let characterAttempts = 0;
        bus.subscribe("kidnappers_game_event", async () => {
            characterAttempts += 1;
            calls.push("character");
            if (characterAttempts === 1) throw new Error("temporary");
        });
        bus.subscribe("kidnappers_game_event", async () => {
            calls.push("audit");
        });
        const router = new KidnappersGameEventRouter(bus);

        const first = await router.publishGameEvent("session-1", event);
        assert.equal(first.failures.length, 1);
        assert.deepEqual(calls, ["character", "audit"]);

        const retry = await router.publishGameEvent("session-1", event);
        assert.equal(retry.failures.length, 0);
        assert.equal(retry.skipped, 1);
        assert.deepEqual(calls, ["character", "audit", "character"]);
        assert.equal(bus.getDeliveryFailures().length, 1);
    });

    test("serializes concurrent retries for one delivery key", async () => {
        const bus = new EventBus();
        let calls = 0;
        bus.subscribe("kidnappers_game_event", async () => {
            calls += 1;
            await new Promise((resolve) => setTimeout(resolve, 2));
        });
        const router = new KidnappersGameEventRouter(bus);

        await Promise.all([
            router.publishGameEvent("session-1", event),
            router.publishGameEvent("session-1", event),
        ]);

        assert.equal(calls, 1);
    });

    test("isolates subscriber failure and retries only the failed effect", async () => {
        const bus = new EventBus();
        let characterAttempts = 0;
        const calls: string[] = [];
        const subscribers = new KidnappersGameSubscribers(bus, {
            character: async () => {
                characterAttempts += 1;
                calls.push("character");
                if (characterAttempts === 1) throw new Error("offline");
            },
            inventory: async () => {
                calls.push("inventory");
            },
            audit: async () => {
                calls.push("audit");
            },
            lifecycle: async () => {
                calls.push("lifecycle");
            },
        });
        subscribers.initialize();
        const router = new KidnappersGameEventRouter(bus);

        const first = await router.publishGameEvent("session-1", event);
        assert.equal(first.failures.length, 1);
        assert.deepEqual(calls, [
            "character",
            "inventory",
            "audit",
            "lifecycle",
        ]);
        assert.equal(subscribers.getFailures().length, 1);

        await router.publishGameEvent("session-1", event);
        assert.deepEqual(calls, [
            "character",
            "inventory",
            "audit",
            "lifecycle",
            "character",
        ]);
    });

    test("publishes player-facing messages with stable delivery identity", async () => {
        const bus = new EventBus();
        const messages: unknown[] = [];
        bus.subscribe("kidnappers_player_message", async (message) => {
            messages.push(message.data);
        });
        const router = new KidnappersGameEventRouter(bus);

        await router.publishPlayerMessage({
            sessionId: "session-1",
            memberNumber: 10,
            text: "You joined.",
            eventType: "PLAYER_JOINED",
            correlationId: "join-1",
        });
        await router.publishPlayerMessage({
            sessionId: "session-1",
            memberNumber: 10,
            text: "You joined.",
            eventType: "PLAYER_JOINED",
            correlationId: "join-1",
        });

        assert.equal(messages.length, 1);
        assert.equal(
            (messages[0] as { deliveryId: string }).deliveryId,
            "kidnappers:session-1:join-1:message:10",
        );
    });

    test("routes commands through GamePluginCommandRouter", async () => {
        const calls: unknown[] = [];
        const system = new KidnappersGameMessageFeatureSystem(
            {} as never,
            () => true,
            async (_sender, _msg, command, args) => {
                calls.push([command, args]);
            },
        );
        let root:
            | ((
                  sender: API_Character,
                  msg: BC_Server_ChatRoomMessage,
                  args: string[],
              ) => Promise<void>)
            | undefined;
        system.registerCommands({
            registerRoot: (
                handler: (
                    sender: API_Character,
                    msg: BC_Server_ChatRoomMessage,
                    args: string[],
                ) => Promise<void>,
            ) => {
                root = handler as typeof root;
            },
        } as never);

        await root?.({} as never, {} as never, ["join", "now"]);
        assert.deepEqual(calls, [["join", ["now"]]]);
    });

    test("publishes a session transition after the authoritative mutation", async () => {
        const session = new KidnappersGameSession("session-1");
        const published: string[] = [];
        const result = await session.dispatchAndPublish(
            {
                type: "JOIN_SESSION",
                memberNumber: 10,
                memberName: "Alice",
                correlationId: "join-1",
                issuedAt: 100,
            },
            async (_sessionId, transition) => {
                published.push(transition.deliveryId ?? "");
            },
        );

        assert.equal(result.ok, true);
        assert.equal(session.getSnapshot().players.length, 1);
        assert.deepEqual(published, [
            "kidnappers:session-1:join-1:PLAYER_JOINED",
        ]);
    });
});
