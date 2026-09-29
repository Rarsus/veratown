import assert from "node:assert/strict";
import test from "node:test";
import lzString from "lz-string";

import {
    BONDAGE_COLLEGE_MAP_SOURCE_REVISION,
    ChatRoomMapViewObjectList,
    ChatRoomMapViewTileList,
} from "../../../../src/bcdata/ChatRoomMap.ts";
import { API_Map } from "../../../../src/apiMap.ts";
import type { API_Chatroom_Data } from "../../../../src/apiChatroom.ts";
import type { API_Character } from "../../../../src/apiCharacter.ts";
import type { API_Connector } from "../../../../src/apiConnector.ts";

function assertUniqueMapIds(elements: readonly { ID: number }[]): void {
    const ids = elements.map((element) => element.ID);
    assert.equal(new Set(ids).size, ids.length);
}

test("R132 map tile IDs are unique and include the released material variants", () => {
    assertUniqueMapIds(ChatRoomMapViewTileList);

    for (const [id, style] of [
        [101, "WoodWhite"],
        [108, "Tatami"],
        [500, "PaddedBlack"],
        [520, "LatexFloorGray"],
        [540, "TileGray"],
    ] as const) {
        assert.deepEqual(
            ChatRoomMapViewTileList.find((tile) => tile.ID === id)?.Style,
            style,
        );
    }
});

test("R132 map object IDs are unique", () => {
    assertUniqueMapIds(ChatRoomMapViewObjectList);
});

test("canonical map data retains the post-R132 objects and categories", () => {
    assert.match(BONDAGE_COLLEGE_MAP_SOURCE_REVISION, /^[0-9a-f]{40}$/);

    for (const [id, type, style] of [
        [211, "School", "Blank"],
        [400, "Bedroom", "Blank"],
        [401, "Bedroom", "TeddyBear"],
        [402, "Bedroom", "PinkTeddyBear"],
        [403, "Bedroom", "Nightstand"],
        [404, "Bedroom", "PinkNightstand"],
        [595, "FloorDecorationParty", "Pumpkin"],
        [3281, "Bathroom", "Blank"],
    ] as const) {
        const object = ChatRoomMapViewObjectList.find(
            (candidate) => candidate.ID === id,
        );
        assert.deepEqual(
            { ID: object?.ID, Type: object?.Type, Style: object?.Style },
            { ID: id, Type: type, Style: style },
        );
    }
});

test("API map round-trip preserves map edits and movement triggers", () => {
    const roomData = {
        MapData: {
            Type: "Always",
            Tiles: "\0".repeat(1600),
            Objects: "\0".repeat(1600),
        },
    } as API_Chatroom_Data;
    const updates: API_Chatroom_Data[] = [];
    const conn = {
        ChatRoomUpdate(data: API_Chatroom_Data) {
            updates.push(data);
        },
    } as unknown as API_Connector;
    const map = new API_Map(conn, roomData);

    map.setTile({ X: 1, Y: 2 }, "WoodWhite");
    map.setObject({ X: 3, Y: 4 }, "Pumpkin");
    assert.equal(roomData.MapData?.Tiles?.charCodeAt(81), 101);
    assert.equal(map.getObject({ X: 3, Y: 4 }), "Pumpkin");

    const compressed = lzString.compressToBase64(
        JSON.stringify({
            Type: "Always",
            Tiles: roomData.MapData?.Tiles,
            Objects: roomData.MapData?.Objects,
        }),
    );
    map.setMapFromString(compressed);
    assert.equal(map.mapData?.Objects, roomData.MapData?.Objects);

    const character = { X: 2, Y: 2, MapPos: { X: 2, Y: 2 } } as API_Character;
    const previous = { X: 1, Y: 2 };
    const events: string[] = [];
    const tileTrigger = () => events.push("tile");
    const enterTrigger = () => events.push("enter");
    const leaveTrigger = () => events.push("leave");
    map.addTileTrigger({ X: 2, Y: 2 }, tileTrigger, previous);
    map.addEnterRegionTrigger(
        { TopLeft: { X: 2, Y: 2 }, BottomRight: { X: 2, Y: 2 } },
        enterTrigger,
    );
    map.addLeaveRegionTrigger(
        { TopLeft: { X: 1, Y: 2 }, BottomRight: { X: 1, Y: 2 } },
        leaveTrigger,
    );
    map.onCharacterMove(character, previous);
    assert.deepEqual(events, ["tile", "enter", "leave"]);
    assert.equal(updates.length, 0);
});
