import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

import { getAssetDef, getExtendedAssetDef } from "../../../src/item.ts";

const manifest = JSON.parse(
    readFileSync(
        resolve("src/bcdata/BondageCollegeAssetManifest.json"),
        "utf8",
    ),
) as {
    schemaVersion: number;
    sourceRevision: string;
    sourceFiles: Record<string, string>;
};

test("post-R132 runtime asset manifest identifies the upstream source", () => {
    assert.equal(manifest.schemaVersion, 1);
    assert.match(manifest.sourceRevision, /^[0-9a-f]{40}$/);
    assert.match(manifest.sourceFiles["Female3DCG.js"], /^[0-9a-f]{64}$/);
    assert.match(
        manifest.sourceFiles["Female3DCGExtended.js"],
        /^[0-9a-f]{64}$/,
    );
});

test("post-R132 behavior-bearing assets resolve through the central lookup", () => {
    for (const [group, name] of [
        ["ItemHandheld", "Rattle"],
        ["ItemDevices", "BirdCage"],
        ["ItemNipples", "NippleClamps1"],
        ["ItemNipplesPiercings", "ShortStraightPiercings"],
        ["ItemNipplesPiercings", "ThroughPiercings"],
        ["ItemNose", "ExpandingNoseHook"],
        ["ItemHood", "LatexHood"],
    ] as const) {
        const definition = getAssetDef({ Group: group, Name: name });
        assert.equal(definition?.Name, name);
        assert.equal(definition?.InventoryID !== undefined, true);
    }
});

test("post-R132 typed and modular definitions preserve semantic options", () => {
    const nose = getExtendedAssetDef({
        Group: "ItemNose",
        Name: "ExpandingNoseHook",
    });
    const hood = getExtendedAssetDef({
        Group: "ItemHood",
        Name: "LatexHood",
    });

    assert.deepEqual(
        (nose as { Options?: { Name: string }[] } | null)?.Options?.map(
            (option) => option.Name,
        ),
        ["A", "B", "C", "D", "E", "F"],
    );
    assert.deepEqual(
        (hood as { Modules?: { Key: string }[] } | null)?.Modules?.map(
            (module) => module.Key,
        ),
        ["l", "F", "B", "P"],
    );
});
