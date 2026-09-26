import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionLayerRolloutController } from "../rollout";

test("selects the action path and owns the operation until release", () => {
    const rollout = new ActionLayerRolloutController({
        bunnyRestraintsEnabled: true,
    });

    const lease = rollout.begin("bunny-restraints", "bunny-1");
    assert.equal(lease.path, "action");
    assert.deepEqual(rollout.snapshot().activeOperationIds, ["bunny-1"]);
    assert.throws(
        () => rollout.begin("bunny-restraints", "bunny-1"),
        /Operation already owned/,
    );

    lease.release();
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
});

test("rollback sends new operations to legacy while preserving the active lease", () => {
    const rollout = new ActionLayerRolloutController({
        releaseRemovalEnabled: true,
    });
    const active = rollout.begin("release-removal", "release-1");

    rollout.rollback();
    const afterRollback = rollout.begin("release-removal", "release-2");
    assert.equal(active.path, "action");
    assert.equal(afterRollback.path, "legacy");
    assert.equal(rollout.snapshot().acceptingNewOperations, false);

    active.release();
    afterRollback.release();
});

test("disabled operations default to legacy and can be enabled explicitly", () => {
    const rollout = new ActionLayerRolloutController();
    assert.equal(
        rollout.begin("bunny-restraints", "bunny-legacy").path,
        "legacy",
    );

    rollout.setEnabled("bunny-restraints", true);
    assert.equal(
        rollout.begin("bunny-restraints", "bunny-action").path,
        "action",
    );
});
