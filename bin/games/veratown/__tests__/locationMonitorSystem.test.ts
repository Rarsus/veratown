import assert from "node:assert/strict";
import { test } from "node:test";
import {
    ActionLayerRolloutController,
    CommunicationActionService,
} from "../../../action-layer";
import { AppearanceActionService } from "../../../action-layer/appearance-service";
import { InMemoryAppearanceActionAdapter } from "../../../action-layer/adapters/in-memory-appearance";
import type {
    ActionContext,
    ActionResult,
    CommunicationActionAdapter,
    CommunicationObservation,
    MessageRequest,
} from "../../../action-layer/domain";
import {
    BotHelpMonitorProvider,
    CallbackMonitorProvider,
    CageOccupancyMonitorProvider,
    LocationMonitorSystem,
    LocktoberCountdownMonitorProvider,
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

test("Locktober countdown provider uses UTC calendar days", () => {
    const provider = new LocktoberCountdownMonitorProvider(
        () => new Date("2026-10-02T00:00:00.000Z"),
    );
    assert.equal(
        provider.getDisplay(),
        "There are 30 days left until Locktober 2026 ends (UTC).",
    );

    const partialDayProvider = new LocktoberCountdownMonitorProvider(
        () => new Date("2026-10-02T12:00:00.000Z"),
    );
    assert.equal(
        partialDayProvider.getDisplay(),
        "There are 29 days left until Locktober 2026 ends (UTC).",
    );

    const finalDayProvider = new LocktoberCountdownMonitorProvider(
        () => new Date("2026-10-31T23:59:59.000Z"),
    );
    assert.equal(
        finalDayProvider.getDisplay(),
        "Locktober 2026 ends in less than 1 day (UTC).",
    );

    const afterEndProvider = new LocktoberCountdownMonitorProvider(
        () => new Date("2026-11-01T00:00:00.000Z"),
    );
    assert.equal(
        afterEndProvider.getDisplay(),
        "Locktober 2026 has ended (UTC).",
    );
});

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

test("location monitor can whisper and remove one random clothing item", async () => {
    let callback: ((character: unknown) => void) | undefined;
    const map = {
        addEnterRegionTrigger: (_region: unknown, next: any) => {
            callback = next;
        },
        removeEnterRegionTrigger: () => {},
    };
    const sent: string[] = [];
    const adapter = new InMemoryAppearanceActionAdapter({
        memberNumber: 6,
        initialItems: [
            { group: "Cloth", asset: "Top", lockState: "unlocked" },
            { group: "ClothLower", asset: "Skirt", lockState: "unlocked" },
        ],
    });
    const system = new LocationMonitorSystem(
        {
            chatRoom: { map },
            SendMessage: (_type: string, message: string) => sent.push(message),
        } as any,
        [new BotHelpMonitorProvider(() => "The air conditioner hums.")],
        undefined,
        undefined,
        undefined,
        new AppearanceActionService(adapter),
    );
    const monitorLocation = location("aircon", "bot_help");
    monitorLocation.data!.actions = [{ type: "remove_random_clothing" }];

    system.registerTriggers();
    await system.reloadLocations([monitorLocation]);
    callback!({
        MemberNumber: 6,
        Appearance: {
            MakeAppearanceBundle: () => [],
            Appearance: [
                {
                    Group: "Cloth",
                    Name: "Top",
                    Asset: { IsClothing: true },
                },
                {
                    Group: "ClothLower",
                    Name: "Skirt",
                    Asset: { IsClothing: true },
                },
            ],
        },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(sent, ["The air conditioner hums."]);
    assert.equal(adapter.snapshot().length, 1);
});

test("random clothing action skips protected items and removes an unlocked item", async () => {
    let callback: ((character: unknown) => void) | undefined;
    const map = {
        addEnterRegionTrigger: (_region: unknown, next: any) => {
            callback = next;
        },
        removeEnterRegionTrigger: () => {},
    };
    const adapter = new InMemoryAppearanceActionAdapter({
        memberNumber: 7,
        initialItems: [
            { group: "Cloth", asset: "LockedTop", lockState: "locked" },
            {
                group: "ClothLower",
                asset: "UnlockedSkirt",
                lockState: "unlocked",
            },
        ],
    });
    const system = new LocationMonitorSystem(
        { chatRoom: { map }, SendMessage: () => {} } as any,
        [new BotHelpMonitorProvider(() => "")],
        undefined,
        undefined,
        undefined,
        new AppearanceActionService(adapter),
    );
    const monitorLocation = location("aircon", "bot_help");
    monitorLocation.data!.actions = [{ type: "remove_random_clothing" }];

    system.registerTriggers();
    await system.reloadLocations([monitorLocation]);
    callback!({
        MemberNumber: 7,
        Appearance: {
            MakeAppearanceBundle: () => [],
            Appearance: [
                {
                    Group: "Cloth",
                    Name: "LockedTop",
                    Asset: { IsClothing: true },
                },
                {
                    Group: "ClothLower",
                    Name: "UnlockedSkirt",
                    Asset: { IsClothing: true },
                },
            ],
        },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(adapter.snapshot(), [
        { group: "Cloth", asset: "LockedTop", lockState: "locked" },
    ]);
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

test("enabled communication rollout routes monitor notifications through actions", async () => {
    let callback: ((character: unknown) => void) | undefined;
    const map = {
        addEnterRegionTrigger: (_region: unknown, next: any) => {
            callback = next;
        },
        removeEnterRegionTrigger: () => {},
    };
    const legacyMessages: string[] = [];
    const requests: MessageRequest[] = [];
    const adapter: CommunicationActionAdapter = {
        async send(
            request: MessageRequest,
            context: ActionContext,
        ): Promise<ActionResult<CommunicationObservation>> {
            requests.push(request);
            return {
                status: "completed",
                metadata: {
                    operationId: context.operationId,
                    actionId: "communication.test",
                    memberNumber: context.memberNumber,
                    attempt: 1,
                    startedAt: 1,
                    completedAt: 2,
                },
                value: {
                    channel: request.channel,
                    deliveryStatus: "queued",
                    targetMemberNumber: request.targetMemberNumber,
                    textLength: request.text.length,
                    observedAt: 2,
                },
            };
        },
    };
    const communicationService = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
    });
    const system = new LocationMonitorSystem(
        {
            chatRoom: { map },
            SendMessage: (_type: string, message: string) =>
                legacyMessages.push(message),
        } as any,
        [new BotHelpMonitorProvider(() => "Bot help")],
        undefined,
        communicationService,
        rollout,
    );
    const monitorLocation = location("help", "bot_help");
    monitorLocation.data!.cooldownMs = 0;

    system.registerTriggers();
    await system.reloadLocations([monitorLocation]);
    callback!({ MemberNumber: 4 });
    await new Promise((resolve) => setImmediate(resolve));
    callback!({ MemberNumber: 4 });
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(legacyMessages, []);
    assert.deepEqual(requests, [
        {
            channel: "whisper",
            text: "Bot help",
            targetMemberNumber: 4,
            deduplicationKey: "location-monitor:help:4:1",
        },
        {
            channel: "whisper",
            text: "Bot help",
            targetMemberNumber: 4,
            deduplicationKey: "location-monitor:help:4:2",
        },
    ]);
});

test("location monitor leaves cooldown open after a transient action failure", async () => {
    let callback: ((character: unknown) => void) | undefined;
    const map = {
        addEnterRegionTrigger: (_region: unknown, next: any) => {
            callback = next;
        },
        removeEnterRegionTrigger: () => {},
    };
    let actionCalls = 0;
    let legacyMessages = 0;
    const adapter: CommunicationActionAdapter = {
        async send(
            request: MessageRequest,
            context: ActionContext,
        ): Promise<ActionResult<CommunicationObservation>> {
            actionCalls += 1;
            if (actionCalls === 1) {
                return {
                    status: "failed",
                    retryable: true,
                    reason: "connector disconnected",
                    metadata: {
                        operationId: context.operationId,
                        actionId: "communication.test",
                        memberNumber: context.memberNumber,
                        attempt: 1,
                        startedAt: 1,
                        completedAt: 2,
                    },
                    value: {
                        channel: request.channel,
                        deliveryStatus: "unknown",
                        targetMemberNumber: request.targetMemberNumber,
                        textLength: request.text.length,
                        observedAt: 2,
                    },
                };
            }
            return {
                status: "completed",
                metadata: {
                    operationId: context.operationId,
                    actionId: "communication.test",
                    memberNumber: context.memberNumber,
                    attempt: 1,
                    startedAt: 1,
                    completedAt: 2,
                },
                value: {
                    channel: request.channel,
                    deliveryStatus: "queued",
                    targetMemberNumber: request.targetMemberNumber,
                    textLength: request.text.length,
                    observedAt: 2,
                },
            };
        },
    };
    const system = new LocationMonitorSystem(
        {
            chatRoom: { map },
            SendMessage: () => {
                legacyMessages += 1;
            },
        } as any,
        [new BotHelpMonitorProvider(() => "Bot help")],
        undefined,
        new CommunicationActionService(adapter),
        new ActionLayerRolloutController({
            communicationNotificationsEnabled: true,
        }),
    );

    system.registerTriggers();
    await system.reloadLocations([location("help", "bot_help")]);
    callback!({ MemberNumber: 5 });
    await new Promise((resolve) => setImmediate(resolve));
    callback!({ MemberNumber: 5 });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(actionCalls, 2);
    assert.equal(legacyMessages, 0);
});

test("location monitor lifecycle replaces and cleans up scoped registrations", async () => {
    function mapWithTracking() {
        const active = new Set<(...args: any[]) => void>();
        const callbacks: Array<(...args: any[]) => void> = [];
        const map = {
            addEnterRegionTrigger: (_region: unknown, callback: any) => {
                active.add(callback);
                callbacks.push(callback);
            },
            removeEnterRegionTrigger: (callback: any) => {
                active.delete(callback);
            },
        };
        return { active, callbacks, map };
    }

    const first = mapWithTracking();
    const second = mapWithTracking();
    const room = { map: first.map };
    const connector = {
        chatRoom: room,
        SendMessage: () => {},
    } as any;
    let displays = 0;
    const system = new LocationMonitorSystem(
        connector,
        [
            new CallbackMonitorProvider("test", () => {
                displays += 1;
                return `Display ${displays}`;
            }),
        ],
        0,
    );

    await system.reloadLocations([location("first", "test")]);
    system.attachToRoom();
    assert.equal(first.active.size, 1);
    assert.equal(system.getDiagnostics().registeredTriggerCount, 1);

    await system.reloadLocations([location("second", "test")]);
    assert.equal(first.active.size, 1);
    first.callbacks[0]({ MemberNumber: 10 });
    first.callbacks.at(-1)!({ MemberNumber: 11 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(displays, 1);

    connector.chatRoom = { map: second.map };
    system.attachToRoom();
    assert.equal(first.active.size, 0);
    assert.equal(second.active.size, 1);
    second.callbacks[0]({ MemberNumber: 12 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(displays, 2);

    system.enabled = false;
    assert.equal(second.active.size, 0);
    second.callbacks[0]({ MemberNumber: 13 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(displays, 2);

    system.enabled = true;
    assert.equal(second.active.size, 1);
    system.shutdown();
    system.shutdown();
    assert.equal(second.active.size, 0);
    assert.equal(system.getDiagnostics().registeredTriggerCount, 0);
});
