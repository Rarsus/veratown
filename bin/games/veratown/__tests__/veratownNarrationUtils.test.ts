import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { NarratorBot } from "../veratownNarrationUtils";

function createConnection(initialPosition = { X: 1, Y: 1 }) {
    const connection = new EventEmitter() as EventEmitter & {
        moveOnMap?: (x: number, y: number) => void;
    };
    const player = {
        MemberNumber: 145,
        MapPos: { ...initialPosition },
        connection,
    };
    const messages: Array<{ type: string; message: string }> = [];
    const connector = {
        Player: player,
        SendMessage(type: string, message: string) {
            messages.push({ type, message });
        },
    } as any;
    connection.moveOnMap = (x, y) => {
        player.MapPos.X = x;
        player.MapPos.Y = y;
        queueMicrotask(() =>
            connection.emit("MapPosition", player.MemberNumber, { X: x, Y: y }),
        );
    };
    return { connector, connection, messages };
}

test("NarratorBot sends only after authoritative movement and returns home", async () => {
    const created = createConnection();
    const narrator = new NarratorBot(created.connector as any, undefined, {
        X: 1,
        Y: 1,
    });

    await narrator.sayAt({ X: 4, Y: 5 }, "Emote", "*arrives*");

    assert.deepEqual(created.messages, [
        { type: "Emote", message: "*arrives*" },
    ]);
    assert.deepEqual(created.connector.Player.MapPos, { X: 1, Y: 1 });
});

test("NarratorBot does not claim a new local position after movement failure", async () => {
    const created = createConnection();
    created.connection.moveOnMap = () => {
        throw new Error("movement unavailable");
    };
    const narrator = new NarratorBot(created.connector as any, undefined, {
        X: 1,
        Y: 1,
    });

    await narrator.sayAt({ X: 4, Y: 5 }, "Chat", "not sent");

    assert.deepEqual(created.connector.Player.MapPos, { X: 1, Y: 1 });
    assert.deepEqual(created.messages, []);
});
