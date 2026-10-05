import assert from "node:assert/strict";
import { test } from "node:test";
import {
    ActionLayerRolloutController,
    CommunicationActionService,
} from "../../../action-layer";
import type {
    ActionContext,
    ActionResult,
    AppearanceItemIdentity,
    CommunicationActionAdapter,
    CommunicationObservation,
    MessageRequest,
} from "../../../action-layer/domain";
import { CatDogSystem } from "../catDogSystem";

class RecordingCommunicationAdapter implements CommunicationActionAdapter {
    public readonly requests: MessageRequest[] = [];

    public async send(
        request: MessageRequest,
        context: ActionContext,
    ): Promise<ActionResult<CommunicationObservation>> {
        this.requests.push(request);
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
    }
}

function connector(sendMessage: (type: string, text: string) => void) {
    return {
        chatRoom: { map: {} },
        on: () => {},
        SendMessage: sendMessage,
    } as any;
}

function character(
    memberNumber: number,
    group = "ItemVulva",
    asset = "VibratingEgg",
    property: Record<string, unknown> = {
        TypeRecord: { vibrating: 0 },
        Mode: "Off",
        Intensity: -1,
        Effect: ["Egged"],
    },
) {
    const vibrator = {
        Name: asset,
        Group: group,
        getData: () => ({ Group: group, Name: asset, Property: property }),
    };
    return {
        MemberNumber: memberNumber,
        Name: "Player",
        Appearance: {
            Appearance: [vibrator],
            MakeAppearanceBundle: () => [vibrator.getData()],
        },
    } as any;
}

function actionContext(memberNumber: number): ActionContext {
    return {
        operationId: `catdog-test:${memberNumber}`,
        memberNumber,
        source: "feature",
        reason: "CatDog test action",
        deadlineAt: Date.now() + 5_000,
    };
}

function recordingAppearanceService(
    status: ActionResult<unknown>["status"] = "completed",
) {
    const updates: Array<{
        item: AppearanceItemIdentity;
        properties: Record<string, unknown>;
        expectedProperties?: Record<string, unknown>;
        policy: Record<string, unknown>;
    }> = [];
    return {
        updates,
        service: {
            updateExtendedProperties: async (
                _character: unknown,
                item: AppearanceItemIdentity,
                properties: Record<string, unknown>,
                expectedProperties: Record<string, unknown> | undefined,
                policy: Record<string, unknown>,
            ): Promise<ActionResult<unknown>> => {
                updates.push({ item, properties, expectedProperties, policy });
                return {
                    status,
                    metadata: {
                        operationId: String(policy.operationId),
                        actionId: "appearance.updateExtendedProperties",
                        memberNumber: Number(policy.memberNumber),
                        attempt: 1,
                        startedAt: 1,
                        completedAt: 2,
                    },
                    reason:
                        status === "rejected"
                            ? "The update was rejected"
                            : undefined,
                };
            },
        },
    };
}

const vibratorAction = {
    type: "vibrator",
    message: "The intensity rises.",
    intensityIncrease: 1,
};

test("CatDog standard vibrator updates use the appearance contract and notify on confirmation", async () => {
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
        featureAppearanceEnabled: true,
    });
    const appearance = recordingAppearanceService();
    const sent: string[] = [];
    const system = new CatDogSystem(
        connector((_type, text) => sent.push(text)),
        undefined,
        service,
        rollout,
        appearance.service as any,
    );

    const result = await (system as any).performVibratorAction(
        character(41),
        vibratorAction,
        "cat",
        actionContext(41),
    );

    assert.equal(result.status, "completed");
    assert.deepEqual(sent, []);
    assert.equal(appearance.updates.length, 1);
    assert.ok((appearance.updates[0].policy.timeoutMs as number) <= 5_000);
    const standardUpdate = appearance.updates[0];
    assert.deepEqual(
        {
            item: standardUpdate.item,
            properties: standardUpdate.properties,
            expectedProperties: standardUpdate.expectedProperties,
            policy: {
                ...standardUpdate.policy,
                timeoutMs: 5_000,
            },
        },
        {
            item: { group: "ItemVulva", asset: "VibratingEgg" },
            properties: {
                TypeRecord: { vibrating: 1 },
                Mode: "Low",
                Intensity: 0,
                Effect: ["Egged", "Vibrating"],
            },
            expectedProperties: {
                TypeRecord: { vibrating: 0 },
                Mode: "Off",
                Intensity: -1,
                Effect: ["Egged"],
            },
            policy: {
                timeoutMs: 5_000,
                maxAttempts: 1,
                retryDelayMs: 0,
                requireServerConfirmation: true,
                operationId:
                    "catdog-test:41:vibrator:ItemVulva:VibratingEgg:vibrator-mode",
                memberNumber: 41,
                source: "feature",
                reason: "CatDog vibration update for ItemVulva/VibratingEgg/vibrator-mode",
            },
        },
    );
    assert.deepEqual(adapter.requests, [
        {
            channel: "whisper",
            text: "*The cat cuddles you and by mistake triggers your device... The intensity rises.*",
            targetMemberNumber: 41,
            deduplicationKey: "catdog-notification:41:1",
        },
    ]);
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
    service.close();
});

test("CatDog notifies when the vibrator update times out without claiming success", async () => {
    const adapter = new RecordingCommunicationAdapter();
    const service = new CommunicationActionService(adapter);
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
        featureAppearanceEnabled: true,
    });
    const appearance = recordingAppearanceService("timed_out");
    const system = new CatDogSystem(
        connector(() => {}),
        undefined,
        service,
        rollout,
        appearance.service as any,
    );

    const result = await (system as any).performVibratorAction(
        character(43),
        vibratorAction,
        "cat",
        actionContext(43),
    );

    assert.equal(result.status, "timed_out");
    assert.equal(adapter.requests.length, 1);
    assert.match(
        adapter.requests[0].text,
        /couldn't confirm that it responded/,
    );
    assert.doesNotMatch(adapter.requests[0].text, /triggers your device/);
    service.close();
});

test("CatDog does not bypass the action layer when appearance rollout is disabled", async () => {
    const sent: string[] = [];
    const system = new CatDogSystem(
        connector((type, text) => sent.push(`${type}:${text}`)),
    );

    const target = character(42);
    const result = await (system as any).performVibratorAction(
        target,
        vibratorAction,
        "dog",
        actionContext(42),
    );

    assert.equal(result.status, "rejected");
    assert.deepEqual(sent, []);
});

test("CatDog narrator teleport delegates to the movement action service", async () => {
    const requests: Array<{
        character: unknown;
        destination: { x: number; y: number };
        policy: Record<string, unknown>;
    }> = [];
    const movementService = {
        teleport: async (
            target: unknown,
            destination: { x: number; y: number },
            policy: Record<string, unknown>,
        ) => {
            requests.push({ character: target, destination, policy });
            return {
                status: "completed",
                metadata: {
                    operationId: String(policy.operationId),
                    actionId: "movement.teleport",
                    memberNumber: Number(policy.memberNumber),
                    attempt: 1,
                    startedAt: Date.now(),
                    completedAt: Date.now(),
                },
                value: destination,
            };
        },
    };
    const botCharacter = {
        MemberNumber: 99,
        MapPos: { X: 2, Y: 4 },
    };
    const system = new CatDogSystem(
        connector(() => undefined),
        { Player: botCharacter } as any,
        undefined,
        undefined,
        undefined,
        movementService as any,
    );

    await (system as any).teleportBot(botCharacter, 10, 12);

    assert.equal(requests.length, 1);
    assert.equal(requests[0].character, botCharacter);
    assert.deepEqual(requests[0].destination, { x: 10, y: 12 });
    assert.equal(requests[0].policy.reason, "CatDog narrator positioning");
    assert.deepEqual(botCharacter.MapPos, { X: 2, Y: 4 });
});

test("CatDog discovers devices from current appearance data rather than stale wrappers", async () => {
    const appearance = recordingAppearanceService();
    const rollout = new ActionLayerRolloutController({
        featureAppearanceEnabled: true,
    });
    const system = new CatDogSystem(
        connector(() => undefined),
        undefined,
        undefined,
        rollout,
        appearance.service as any,
    );
    const target = character(43);
    target.Appearance.Appearance = [];

    const result = await (system as any).performVibratorAction(
        target,
        vibratorAction,
        "cat",
        actionContext(43),
    );

    assert.equal(result.status, "completed");
    assert.equal(appearance.updates.length, 1);
    assert.deepEqual(appearance.updates[0].item, {
        group: "ItemVulva",
        asset: "VibratingEgg",
    });
});

test("CatDog stays silent when no vibration control is present", async () => {
    const adapter = new RecordingCommunicationAdapter();
    const communication = new CommunicationActionService(adapter);
    const appearance = recordingAppearanceService();
    const rollout = new ActionLayerRolloutController({
        communicationNotificationsEnabled: true,
        featureAppearanceEnabled: true,
    });
    const system = new CatDogSystem(
        connector(() => undefined),
        undefined,
        communication,
        rollout,
        appearance.service as any,
    );
    const target = character(48);
    target.Appearance.MakeAppearanceBundle = () => [];

    const result = await (system as any).performVibratorAction(
        target,
        vibratorAction,
        "cat",
        actionContext(48),
    );

    assert.equal(result.status, "already_satisfied");
    assert.equal(appearance.updates.length, 0);
    assert.deepEqual(adapter.requests, []);
    communication.close();
});

test("CatDog increases intensity without replacing an Advanced vibrator mode", async () => {
    const appearance = recordingAppearanceService();
    const rollout = new ActionLayerRolloutController({
        featureAppearanceEnabled: true,
    });
    const system = new CatDogSystem(
        connector(() => undefined),
        undefined,
        undefined,
        rollout,
        appearance.service as any,
    );

    const result = await (system as any).performVibratorAction(
        character(46, "ItemVulva", "VibratingEgg", {
            TypeRecord: { vibrating: 6 },
            Mode: "Escalate",
            Intensity: 2,
            Effect: ["Egged", "Vibrating"],
        }),
        vibratorAction,
        "cat",
        actionContext(46),
    );

    assert.equal(result.status, "completed");
    assert.deepEqual(appearance.updates[0].properties, {
        Intensity: 3,
        Effect: ["Egged", "Vibrating"],
    });
});

test("CatDog skips non-asset and empty appearance entries before extended lookup", async () => {
    const appearance = recordingAppearanceService();
    const rollout = new ActionLayerRolloutController({
        featureAppearanceEnabled: true,
    });
    const system = new CatDogSystem(
        connector(() => undefined),
        undefined,
        undefined,
        rollout,
        appearance.service as any,
    );
    const target = character(47);
    target.Appearance.MakeAppearanceBundle = () => [
        { Group: "Pussy", Name: "Pussy2" },
        { Group: "ArmsLeft", Name: "" },
        {
            Group: "ItemVulva",
            Name: "VibratingEgg",
            Property: {
                TypeRecord: { vibrating: 0 },
                Mode: "Off",
                Intensity: -1,
                Effect: ["Egged"],
            },
        },
    ];
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);

    try {
        const result = await (system as any).performVibratorAction(
            target,
            vibratorAction,
            "cat",
            actionContext(47),
        );

        assert.equal(result.status, "completed");
        assert.equal(appearance.updates.length, 1);
        assert.deepEqual(warnings, []);
    } finally {
        console.warn = originalWarn;
    }
});

test("CatDog updates all vibration modules in one guarded appearance action", async () => {
    const appearance = recordingAppearanceService();
    const rollout = new ActionLayerRolloutController({
        featureAppearanceEnabled: true,
    });
    const system = new CatDogSystem(
        connector(() => undefined),
        undefined,
        undefined,
        rollout,
        appearance.service as any,
    );

    const result = await (system as any).performVibratorAction(
        character(44, "ItemVulva", "InflatableVibratingPanties", {
            TypeRecord: { f: 0, i: 0 },
            Intensity: -1,
            Effect: ["Egged"],
        }),
        vibratorAction,
        "cat",
        actionContext(44),
    );

    assert.equal(result.status, "completed");
    assert.equal(appearance.updates.length, 1);
    const modularUpdate = appearance.updates[0];
    assert.deepEqual(
        {
            ...modularUpdate,
            policy: { ...modularUpdate.policy, timeoutMs: 5_000 },
        },
        {
            item: { group: "ItemVulva", asset: "InflatableVibratingPanties" },
            properties: {
                TypeRecord: { f: 0, i: 1 },
                Effect: ["Egged", "Vibrating"],
                InflateLevel: 0,
                Intensity: 0,
            },
            expectedProperties: {
                TypeRecord: { f: 0, i: 0 },
                Intensity: -1,
                Effect: ["Egged"],
            },
            policy: {
                timeoutMs: 5_000,
                maxAttempts: 1,
                retryDelayMs: 0,
                requireServerConfirmation: true,
                operationId:
                    "catdog-test:44:vibrator:ItemVulva:InflatableVibratingPanties:modules-i",
                memberNumber: 44,
                source: "feature",
                reason: "CatDog vibration update for ItemVulva/InflatableVibratingPanties/modules-i",
            },
        },
    );
});

test("CatDog propagates an appearance action rejection instead of reporting success", async () => {
    const appearance = recordingAppearanceService("rejected");
    const rollout = new ActionLayerRolloutController({
        featureAppearanceEnabled: true,
    });
    const system = new CatDogSystem(
        connector(() => undefined),
        undefined,
        undefined,
        rollout,
        appearance.service as any,
    );

    const result = await (system as any).performVibratorAction(
        character(45),
        vibratorAction,
        "dog",
        actionContext(45),
    );

    assert.equal(result.status, "rejected");
});

test("CatDog bondage uses the shared appearance action when rollout is enabled", async () => {
    const additions: Array<{ item: unknown; policy: Record<string, unknown> }> =
        [];
    const appearanceService = {
        add: async (
            _character: unknown,
            item: unknown,
            policy: Record<string, unknown>,
        ) => {
            additions.push({ item, policy });
            return {
                status: "completed",
                metadata: {
                    operationId: String(policy.operationId),
                    actionId: "appearance.add",
                    memberNumber: Number(policy.memberNumber),
                    attempt: 1,
                    startedAt: 1,
                    completedAt: 2,
                },
                value: { items: [], hiddenLayers: [], observedAt: 2 },
            };
        },
    };
    const rollout = new ActionLayerRolloutController({
        featureAppearanceEnabled: true,
    });
    const system = new CatDogSystem(
        connector(() => undefined),
        undefined,
        undefined,
        rollout,
        appearanceService as any,
    );

    await (system as any).performBondageAction(character(43), {
        type: "bondage",
        pieces: [
            {
                group: "ItemArms",
                asset: "LeatherCuffs",
                extendedType: "Straps",
                color: "Blue",
            },
        ],
        difficulty: 18,
        color: "Red",
        craftDescription: "Pet cuffs",
    });

    assert.deepEqual(additions, [
        {
            item: {
                group: "ItemArms",
                asset: "LeatherCuffs",
                extendedType: "Straps",
            },
            policy: {
                timeoutMs: 5_000,
                maxAttempts: 1,
                retryDelayMs: 0,
                preserveLockedItems: true,
                requireServerConfirmation: true,
                itemOptions: {
                    difficulty: 18,
                    color: "Blue",
                    craft: {
                        name: "LeatherCuffs",
                        description: "Pet cuffs",
                    },
                },
                operationId: "catdog-bondage:43:1:0",
                memberNumber: 43,
                source: "feature",
                reason: "catdog bondage action",
            },
        },
    ]);
    assert.deepEqual(rollout.snapshot().activeOperationIds, []);
});
