import assert from "node:assert/strict";
import test from "node:test";

import {
    ChatRoomMapViewObjectList,
    ChatRoomMapViewTileList,
} from "../../../../src/bcdata/ChatRoomMap.ts";

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
