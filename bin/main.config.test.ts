import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig } from "./main";

test("loads the Bunny rollout switch from the deployment environment", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ropeybot-config-"));
    const configPath = join(directory, "config.json");
    const previous = process.env.ACTION_LAYER_BUNNY_RESTRAINTS_ENABLED;

    try {
        await writeFile(
            configPath,
            JSON.stringify({
                user: "main",
                password: "secret",
                game: "roleplay",
            }),
        );
        process.env.ACTION_LAYER_BUNNY_RESTRAINTS_ENABLED = "true";

        const config = await loadConfig(configPath);

        assert.equal(config.action_layer_bunny_restraints_enabled, true);
    } finally {
        if (previous === undefined) {
            delete process.env.ACTION_LAYER_BUNNY_RESTRAINTS_ENABLED;
        } else {
            process.env.ACTION_LAYER_BUNNY_RESTRAINTS_ENABLED = previous;
        }
        await rm(directory, { recursive: true, force: true });
    }
});
