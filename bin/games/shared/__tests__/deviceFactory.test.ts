import { test } from "node:test";
import assert from "node:assert/strict";
import { DeviceFactory } from "../deviceFactory";

test("DeviceFactory creates a locked device with defaults", () => {
    const device = new DeviceFactory().createLockedDevice({
        assetGroup: "ItemDevices",
        assetName: "Cage",
    });

    assert.equal(device.Group, "ItemDevices");
    assert.equal(device.Name, "Cage");
    const lock = (device.Property as Record<string, any>).Lock;
    assert.equal(lock.AssetName, "CrateLock");
    assert.deepEqual(lock.MemberNumberWhitelist, []);
    assert.equal(device.Craft?.Name, "Locked Cage");
});

test("DeviceFactory applies color, craft, and owner settings", () => {
    const device = new DeviceFactory().createRestraint({
        assetGroup: "ItemNeck",
        assetName: "LeatherCollar",
        color: ["Red"],
        owner: 42,
        lockDifficulty: 3,
        lockType: "Padlock",
        craftName: "Owned collar",
    });

    assert.deepEqual(device.Color, ["Red"]);
    assert.equal(device.Craft?.Name, "Owned collar");
    const lock = (device.Property as Record<string, any>).Lock;
    assert.equal(lock.Difficulty, 3);
    assert.deepEqual(lock.MemberNumberWhitelist, [42]);
});

test("DeviceFactory rejects invalid lock difficulty", () => {
    assert.throws(() =>
        new DeviceFactory().createLockedDevice({
            assetGroup: "ItemDevices",
            assetName: "Cage",
            lockDifficulty: -1,
        }),
    );
});

test("DeviceFactory creates a keypad locked device", () => {
    const factory = new DeviceFactory();
    const device = factory.createKeypadLockedDevice({
        assetGroup: "ItemDevices",
        assetName: "KeypadCage",
        doorKey: "cell_101",
        keypadGroup: "guards",
    });

    assert.equal(device.Group, "ItemDevices");
    assert.equal(device.Name, "KeypadCage");
    const lock = (device.Property as Record<string, any>).Lock;
    assert.equal(lock.AssetName, "KeypadLock");
    assert.equal(lock.KeypadDoorKey, "cell_101");
    assert.equal(lock.KeypadGroup, "guards");
});

test("DeviceFactory throws if doorKey is missing in createKeypadLockedDevice", () => {
    const factory = new DeviceFactory();
    assert.throws(() =>
        factory.createKeypadLockedDevice({
            assetGroup: "ItemDevices",
            assetName: "KeypadCage",
            doorKey: "",
        }),
    );
});
