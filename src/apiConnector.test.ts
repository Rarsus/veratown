import assert from "node:assert/strict";
import { test } from "node:test";
import { appearanceRoomSyncDiagnostics } from "./apiConnector.ts";

test("maps full room sync appearance snapshots by MemberNumber and source", () => {
    const diagnostics = appearanceRoomSyncDiagnostics("observer-connection", {
        Character: [
            {
                MemberNumber: 261575,
                Appearance: [{ Group: "ItemFeet", Name: "HeavySpreaderMetal" }],
            },
            {
                MemberNumber: 261576,
                Appearance: [{ Group: "ItemArms", Name: "HeavyYoke" }],
            },
        ] as never,
        SourceMemberNumber: 261577,
    });

    assert.deepEqual(
        diagnostics.map(({ memberNumber, sourceMemberNumber }) => ({
            memberNumber,
            sourceMemberNumber,
        })),
        [
            { memberNumber: 261575, sourceMemberNumber: 261577 },
            { memberNumber: 261576, sourceMemberNumber: 261577 },
        ],
    );
    assert.deepEqual(diagnostics[0]?.itemKeys, ["ItemFeet/HeavySpreaderMetal"]);
});
