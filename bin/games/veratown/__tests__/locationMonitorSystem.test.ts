import assert from "node:assert/strict";
import { test } from "node:test";
import {
    BotHelpMonitorProvider,
    CageOccupancyMonitorProvider,
    LocationMonitorSystem,
} from "../locationMonitorSystem";
import type { VeratownLocationDoc } from "../veratownLocationStore";

function location(
    key: string,
    displayKey: string,
    x = 16,
    y = 16,
): VeratownLocationDoc {
    return {
        _id: key,
        key,
        name: key,
        type: "help_monitor",
        x,
        y,
        data: {
            displayKey,
            cooldownMs: 1000,
        },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

test("location monitors register regions and dispatch provider content", async () => {
    const triggers: Array<{
        region: unknown;
        callback: (character: unknown) => void;
    }> = [];
    const sent: string[] = [];
    const map = {
        addEnterRegionTrigger: (region: unknown, callback: any) =>
            triggers.push({ region, callback }),
        removeEnterRegionTrigger: () => {},
    };
    const system = new LocationMonitorSystem(
        {
            chatRoom: { map },
            SendMessage: (_type: string, message: string) => sent.push(message),
        } as any,
        [new BotHelpMonitorProvider(() => "Bot help")],
    );

    system.registerTriggers();
    await system.reloadLocations([location("help", "bot_help")]);
    triggers[0].callback({
        MemberNumber: 1,
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(sent, ["Bot help"]);
    assert.deepEqual(triggers[0].region, {
        TopLeft: { X: 16, Y: 16 },
        BottomRight: { X: 16, Y: 16 },
    });
});

test("location monitors throttle repeated display triggers per character", async () => {
    let callback: ((character: unknown) => void) | undefined;
    const map = {
        addEnterRegionTrigger: (_region: unknown, next: any) => {
            callback = next;
        },
        removeEnterRegionTrigger: () => {},
    };
    let displays = 0;
    const system = new LocationMonitorSystem(
        { chatRoom: { map }, SendMessage: () => {} } as any,
        [
            new CageOccupancyMonitorProvider(() => {
                displays += 1;
                return "Cage status";
            }),
        ],
    );
    const character = {
        MemberNumber: 2,
        Tell: () => {},
    };

    system.registerTriggers();
    await system.reloadLocations([location("cage", "cage_occupancy")]);
    callback!(character);
    callback!(character);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(displays, 1);
});

test("legacy cage information locations resolve to cage occupancy", async () => {
    let callback: ((character: unknown) => void) | undefined;
    const map = {
        addEnterRegionTrigger: (_region: unknown, next: any) => {
            callback = next;
        },
        removeEnterRegionTrigger: () => {},
    };
    const sent: string[] = [];
    const system = new LocationMonitorSystem(
        {
            chatRoom: { map },
            SendMessage: (_type: string, message: string) => sent.push(message),
        } as any,
        [new CageOccupancyMonitorProvider(() => "Cages: 1")],
    );
    const legacyLocation: VeratownLocationDoc = {
        _id: "cage_info_screen",
        key: "cage_info_screen",
        name: "Cage Information Screen",
        type: "cage_info_region",
        x: 15,
        y: 36,
        data: { bottomRightX: 16, bottomRightY: 36 },
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    system.registerTriggers();
    await system.reloadLocations([legacyLocation]);
    callback!({
        MemberNumber: 3,
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(sent, ["Cages: 1"]);
});
