/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { ForfeitService } from "../forfeitService";

/**
 * Mock API_Character for testing
 */
class MockCharacter {
    public MemberNumber = 12345;
    public Appearance = {
        Appearance: [] as any[],
        InventoryGet: () => ({
            GetColor: () => ["#000000"],
        }),
        AddItem: () => ({
            SetColor: () => {},
            SetDifficulty: () => {},
            SetCraft: () => {},
            lock: () => {},
            Name: "Test Item",
        }),
        slowlyApplyBundle: () => {},
    };

    public Tell(type: string, message: string) {
        // Mock tell
    }

    public toString() {
        return "MockCharacter";
    }
}

// ============================================================================
// ForfeitService: Forfeit Validation
// ============================================================================

test("ForfeitService: validateForfeit returns valid for known forfeits", () => {
    const service = new ForfeitService();
    const mockChar = new MockCharacter();

    const result = service.validateForfeit(mockChar as any, "boots");
    assert.strictEqual(result.valid, true);
});

test("ForfeitService: validateForfeit returns invalid for unknown forfeits", () => {
    const service = new ForfeitService();
    const mockChar = new MockCharacter();

    const result = service.validateForfeit(mockChar as any, "unknown-forfeit");
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason);
});

test("ForfeitService: validateForfeit includes reason in failure", () => {
    const service = new ForfeitService();
    const mockChar = new MockCharacter();

    const result = service.validateForfeit(mockChar as any, "nonexistent");
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason);
});

// ============================================================================
// ForfeitService: Cheat Tracking
// ============================================================================

test("ForfeitService: trackCheatAttempt increments strikes", () => {
    const service = new ForfeitService();
    const memberId = 12345;

    const strike1 = service.trackCheatAttempt(memberId);
    assert.strictEqual(strike1, 1);

    const strike2 = service.trackCheatAttempt(memberId);
    assert.strictEqual(strike2, 2);

    const strike3 = service.trackCheatAttempt(memberId);
    assert.strictEqual(strike3, 3);
});

test("ForfeitService: Cheat strikes tracked independently per member", () => {
    const service = new ForfeitService();

    const strike1_member1 = service.trackCheatAttempt(111);
    const strike1_member2 = service.trackCheatAttempt(222);
    const strike2_member1 = service.trackCheatAttempt(111);

    assert.strictEqual(strike1_member1, 1);
    assert.strictEqual(strike1_member2, 1);
    assert.strictEqual(strike2_member1, 2);
});

test("ForfeitService: getCheatStrikes returns current strike count", () => {
    const service = new ForfeitService();
    service.trackCheatAttempt(999);
    service.trackCheatAttempt(999);

    const strikes = service.getCheatStrikes(999);
    assert.strictEqual(strikes, 2);
});

test("ForfeitService: getCheatStrikes returns 0 for members with no strikes", () => {
    const service = new ForfeitService();
    const strikes = service.getCheatStrikes(999);
    assert.strictEqual(strikes, 0);
});

test("ForfeitService: resetCheatStrikes clears strikes for member", () => {
    const service = new ForfeitService();
    service.trackCheatAttempt(888);
    service.trackCheatAttempt(888);
    service.trackCheatAttempt(888);

    service.resetCheatStrikes(888);

    const strikes = service.getCheatStrikes(888);
    assert.strictEqual(strikes, 0);
});

// ============================================================================
// ForfeitService: Item Locking
// ============================================================================

test("ForfeitService: isItemLocked returns true for locked items", () => {
    const service = new ForfeitService();
    const memberId = 12345;
    const lockTime = 20 * 60 * 1000; // 20 minutes

    // Manually set a lock (normally done by applyForfeit)
    const lockMap = new Map();
    lockMap.set("ItemBoots", Date.now() + lockTime);
    service["lockedItems"] = new Map([[memberId, lockMap]]);

    const isLocked = service.isItemLocked(memberId, "ItemBoots");
    assert.strictEqual(isLocked, true);
});

test("ForfeitService: isItemLocked returns false for unlocked items", () => {
    const service = new ForfeitService();
    const isLocked = service.isItemLocked(12345, "ItemBoots");
    assert.strictEqual(isLocked, false);
});

test("ForfeitService: getItemLockRemainingMs returns remaining time", () => {
    const service = new ForfeitService();
    const memberId = 12345;
    const lockTime = 5000; // 5 seconds

    const lockMap = new Map();
    const targetTime = Date.now() + lockTime;
    lockMap.set("ItemBoots", targetTime);
    service["lockedItems"] = new Map([[memberId, lockMap]]);

    const remaining = service.getItemLockRemainingMs(memberId, "ItemBoots");
    assert.ok(remaining > 0 && remaining <= lockTime);
});

test("ForfeitService: getItemLockRemainingMs returns 0 for unlocked items", () => {
    const service = new ForfeitService();
    const remaining = service.getItemLockRemainingMs(12345, "ItemBoots");
    assert.strictEqual(remaining, 0);
});

test("ForfeitService: clearExpiredLocks removes expired locks only", () => {
    const service = new ForfeitService();
    const memberId = 12345;
    const now = Date.now();

    const lockMap = new Map();
    lockMap.set("ItemBoots", now - 1000); // Expired 1 second ago
    lockMap.set("ItemGag", now + 10000); // Expires in 10 seconds
    service["lockedItems"] = new Map([[memberId, lockMap]]);

    service.clearExpiredLocks();

    const expiredLocked = service.isItemLocked(memberId, "ItemBoots");
    assert.strictEqual(expiredLocked, false);

    const stillLocked = service.isItemLocked(memberId, "ItemGag");
    assert.strictEqual(stillLocked, true);
});

test("ForfeitService: getLockedItems returns all locked items", () => {
    const service = new ForfeitService();
    const memberId = 12345;
    const lockMap = new Map([
        ["ItemBoots", Date.now() + 5000],
        ["ItemGag", Date.now() + 10000],
    ]);
    service["lockedItems"] = new Map([[memberId, lockMap]]);

    const locked = service.getLockedItems(memberId);
    assert.strictEqual(locked.size, 2);
    assert.ok(locked.has("ItemBoots"));
    assert.ok(locked.has("ItemGag"));
});

test("ForfeitService: getLockedItems returns empty map for member with no locks", () => {
    const service = new ForfeitService();
    const locked = service.getLockedItems(99999);
    assert.strictEqual(locked.size, 0);
});

// ============================================================================
// ForfeitService: Blocking Items
// ============================================================================

test("ForfeitService: getBlockingItems identifies items in forfeit slots", () => {
    const service = new ForfeitService();
    const mockChar = new MockCharacter();

    const mockItems = [
        { Group: "ItemBoots", Name: "Boots" },
        { Group: "ItemGag", Name: "Gag" },
    ] as any;

    const currentAppearance = [
        { Group: "ItemBoots", Name: "Current Boots" },
        { Group: "ItemArms", Name: "Arm Cuffs" },
    ] as any;

    mockChar.Appearance.Appearance = currentAppearance;

    const blocking = service.getBlockingItems(mockChar as any, mockItems);

    // Only "Current Boots" should be blocking (ItemBoots slot)
    assert.strictEqual(blocking.length, 1);
    assert.strictEqual(blocking[0].Group, "ItemBoots");
});

test("ForfeitService: getBlockingItems returns empty list if no items blocking", () => {
    const service = new ForfeitService();
    const mockChar = new MockCharacter();

    const mockItems = [{ Group: "ItemGag", Name: "Gag" }] as any;

    const currentAppearance = [{ Group: "ItemBoots", Name: "Boots" }] as any;

    mockChar.Appearance.Appearance = currentAppearance;

    const blocking = service.getBlockingItems(mockChar as any, mockItems);
    assert.strictEqual(blocking.length, 0);
});

// ============================================================================
// ForfeitService: Cheat Punishment
// ============================================================================

test("ForfeitService: applyCheatPunishment whispers on first strike", () => {
    const service = new ForfeitService();
    const mockChar = new MockCharacter();

    let message = "";
    mockChar.Tell = (_type: string, msg: string) => {
        message = msg;
    };

    service.applyCheatPunishment(mockChar as any, 1);
    assert.ok(message.includes("Cheating in the casino"));
});

test("ForfeitService: applyCheatPunishment whispers on second strike", () => {
    const service = new ForfeitService();
    const mockChar = new MockCharacter();

    let message = "";
    mockChar.Tell = (_type: string, msg: string) => {
        message = msg;
    };

    service.applyCheatPunishment(mockChar as any, 2);
    assert.ok(message.includes("Still trying to cheat"));
});

test("ForfeitService: applyCheatPunishment adds dunce hat on third strike", () => {
    const service = new ForfeitService();
    const mockChar = new MockCharacter();

    let addItemCallCount = 0;
    mockChar.Appearance.AddItem = () => {
        addItemCallCount++;
        return {
            SetColor: () => {},
            SetDifficulty: () => {},
            SetCraft: () => {},
            lock: () => {},
            Name: "Dunce Hat",
            setProperty: () => {},
        };
    };

    service.applyCheatPunishment(mockChar as any, 3);
    // Should be called for dunce hat and cheater sign
    assert.ok(addItemCallCount >= 2);
});

// ============================================================================
// ForfeitService: Apply Forfeit
// ============================================================================

test("ForfeitService: applyForfeit throws error for invalid forfeit", () => {
    const service = new ForfeitService();
    const mockChar = new MockCharacter();

    assert.throws(() => {
        service.applyForfeit(mockChar as any, "invalid-forfeit", 1111);
    });
});

test("ForfeitService: applyForfeit successfully applies valid forfeit", () => {
    const service = new ForfeitService();
    const mockChar = new MockCharacter();

    let applied = false;
    mockChar.Appearance.AddItem = () => {
        applied = true;
        return {
            SetColor: () => {},
            SetDifficulty: () => {},
            SetCraft: () => {},
            lock: () => {},
            Name: "Test Item",
        };
    };

    service.applyForfeit(mockChar as any, "boots", 1111);
    assert.ok(applied);
});

test("ForfeitService: applyForfeit applies item locking", () => {
    const service = new ForfeitService();
    const mockChar = new MockCharacter();

    let lockCalled = false;
    mockChar.Appearance.AddItem = () => ({
        SetColor: () => {},
        SetDifficulty: () => {},
        SetCraft: () => {},
        lock: () => {
            lockCalled = true;
        },
        Name: "Boots",
    });

    service.applyForfeit(mockChar as any, "boots", 1111);
    assert.ok(lockCalled);
});

// ============================================================================
// ForfeitService: Integration Scenarios
// ============================================================================

test("ForfeitService: Integration - Cheat tracking and punishment", () => {
    const service = new ForfeitService();
    const mockChar = new MockCharacter();
    const memberId = 12345;

    // First cheat
    const strike1 = service.trackCheatAttempt(memberId);
    assert.strictEqual(strike1, 1);

    // Second cheat
    const strike2 = service.trackCheatAttempt(memberId);
    assert.strictEqual(strike2, 2);

    // Apply punishment
    let message = "";
    mockChar.Tell = (_type: string, msg: string) => {
        message = msg;
    };

    service.applyCheatPunishment(mockChar as any, strike2);
    assert.ok(message.includes("Still trying to cheat"));
});

test("ForfeitService: Integration - Multiple members independent", () => {
    const service = new ForfeitService();
    const mockChar = new MockCharacter();

    // Member 1: 2 cheats
    service.trackCheatAttempt(111);
    service.trackCheatAttempt(111);

    // Member 2: 1 cheat
    service.trackCheatAttempt(222);

    // Verify independent tracking
    assert.strictEqual(service.getCheatStrikes(111), 2);
    assert.strictEqual(service.getCheatStrikes(222), 1);

    // Validate different forfeits for each
    const validation1 = service.validateForfeit(mockChar as any, "boots");
    const validation2 = service.validateForfeit(mockChar as any, "legbinder");

    assert.strictEqual(validation1.valid, true);
    assert.strictEqual(validation2.valid, true);
});
