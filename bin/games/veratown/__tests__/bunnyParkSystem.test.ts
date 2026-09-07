import assert from "node:assert/strict";
import { test } from "node:test";
import {
    BunnyParkSystem,
    validateBunnyRestraintConfig,
} from "../bunnyParkSystem";
import { BUNNY_POSITIONS, BUNNY_RESTRAINT_CONFIGS } from "../veratownConfig";

function createCharacter(
    memberNumber = 42,
    options: {
        failOn?: string;
        initialAppearance?: any[];
        accessible?: boolean;
    } = {},
) {
    let appearance = structuredClone(options.initialAppearance ?? []);
    const added: string[] = [];
    const messages: string[] = [];
    const character: any = {
        MemberNumber: memberNumber,
        MapPos: { X: 29, Y: 6 },
        IsItemPermissionAccessible: () => options.accessible !== false,
        Appearance: {
            AddItem: (descriptor: any) => {
                const key = `${descriptor.Group}/${descriptor.Name}`;
                added.push(key);
                appearance = appearance.filter(
                    (item) => item.Group !== descriptor.Group,
                );
                if (options.failOn === key) {
                    throw new Error(`failed to add ${key}`);
                }
                const data = {
                    Group: descriptor.Group,
                    Name: descriptor.Name,
                    Property: {} as Record<string, any>,
                };
                appearance.push(data);
                const item: any = {
                    Group: data.Group,
                    Name: data.Name,
                    Extended:
                        descriptor.Name === "HempRope"
                            ? {
                                  SetType: (type: string) => {
                                      data.Property.Type = type;
                                  },
                              }
                            : undefined,
                    SetDifficulty: (value: number) => {
                        data.Property.Difficulty = value;
                    },
                    SetColor: (value: string) => {
                        data.Property.Color = value;
                    },
                    SetCraft: (value: unknown) => {
                        data.Property.Craft = value;
                    },
                    setProperty: (key: string, value: unknown) => {
                        data.Property[key] = value;
                    },
                };
                return item;
            },
            RemoveItem: (group: string) => {
                appearance = appearance.filter((item) => item.Group !== group);
            },
            MakeAppearanceBundle: () => structuredClone(appearance),
        },
        Tell: (_type: string, message: string) => messages.push(message),
    };
    return {
        character,
        added,
        messages,
        appearance: () => structuredClone(appearance),
    };
}

function createConnector(callbacks: Array<(character: any) => void>) {
    return {
        chatRoom: {
            map: {
                addTileTrigger: (_position: unknown, callback: any) =>
                    callbacks.push(callback),
                removeTileTrigger: () => {},
                addEnterRegionTrigger: () => {},
                removeEnterRegionTrigger: () => {},
            },
        },
    };
}

function deterministicRandom(index: number): () => number {
    return () => (index + 0.01) / BUNNY_RESTRAINT_CONFIGS.length;
}

test("every bunny restraint configuration validates every asset and group", () => {
    for (const config of BUNNY_RESTRAINT_CONFIGS) {
        assert.deepEqual(validateBunnyRestraintConfig(config), [], config.name);
    }
});

test("bunny punishment applies and persists each configured restraint set", async () => {
    for (const [index, config] of BUNNY_RESTRAINT_CONFIGS.entries()) {
        const created = createCharacter(index + 1);
        const persisted: any[] = [];
        const system = new BunnyParkSystem(
            {} as any,
            async (character) => {
                persisted.push(character.Appearance.MakeAppearanceBundle());
            },
            deterministicRandom(index),
            0,
        );

        const result = await (system as any).applyPunishment(
            created.character,
            config,
        );

        assert.equal(result.success, true, config.name);
        assert.equal(result.finalVerification, true, config.name);
        assert.equal(result.signPresent, true, config.name);
        assert.equal(result.signVisible, true, config.name);
        assert.equal(persisted.length, 1, config.name);
        for (const piece of config.pieces) {
            assert.ok(
                persisted[0].some(
                    (item: any) =>
                        item.Group === piece.group && item.Name === piece.asset,
                ),
                `${config.name}: ${piece.group}/${piece.asset}`,
            );
        }
        const sign = persisted[0].find(
            (item: any) =>
                item.Group === "ItemMisc" && item.Name === "WoodenSign",
        );
        assert.equal(sign?.Property?.Text, "I step on", config.name);
        assert.equal(sign?.Property?.Text2, "Bunnies", config.name);
    }
});

test("bunny punishment records a durable sign artifact", async () => {
    const created = createCharacter(18);
    let artifact: any;
    const system = new BunnyParkSystem(
        {} as any,
        async () => {},
        deterministicRandom(0),
        0,
        async (value) => {
            artifact = value;
        },
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, true);
    assert.equal(artifact.memberNumber, 18);
    assert.equal(artifact.operationId, result.operationId);
    assert.deepEqual(artifact.sign, {
        group: "ItemMisc",
        asset: "WoodenSign",
        text: "I step on",
        text2: "Bunnies",
    });
    assert.equal(artifact.cleanupPolicy, "explicit_cleanup_only");
    assert.equal(artifact.status, "active");
});

test("bunny punishment restores a sign omitted after ropes were retained", async () => {
    const config = BUNNY_RESTRAINT_CONFIGS[1];
    const created = createCharacter(15, {
        initialAppearance: config.pieces.map((piece) => ({
            Group: piece.group,
            Name: piece.asset,
            Property: {},
        })),
    });
    const persisted: any[] = [];
    const system = new BunnyParkSystem(
        {} as any,
        async (character) => {
            persisted.push(character.Appearance.MakeAppearanceBundle());
        },
        deterministicRandom(1),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        config,
    );

    assert.equal(result.success, true);
    assert.equal(result.finalVerification, true);
    assert.equal(result.signPresent, true);
    assert.equal(result.signVisible, true);
    assert.equal(
        persisted
            .at(-1)
            .some(
                (item: any) =>
                    item.Group === "ItemMisc" && item.Name === "WoodenSign",
            ),
        true,
    );
});

test("bunny punishment fails when synchronization removes or hides the sign", async () => {
    const created = createCharacter(16);
    let syncCount = 0;
    const system = new BunnyParkSystem(
        {} as any,
        async (character) => {
            syncCount += 1;
            if (syncCount === 1) character.Appearance.RemoveItem("ItemMisc");
        },
        deterministicRandom(0),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, false);
    assert.equal(result.finalVerification, false);
    assert.equal(result.signPresent, false);
    assert.equal(result.signVisible, false);
    assert.match(result.failureReason, /WoodenSign/);
});

test("bunny punishment reports failures and rolls back partial appearance changes", async () => {
    const original = [{ Group: "ItemArms", Name: "OldCuffs", Property: {} }];
    const created = createCharacter(9, {
        failOn: "ItemLegs/HempRope",
        initialAppearance: original,
    });
    const system = new BunnyParkSystem(
        {} as any,
        async () => {},
        deterministicRandom(0),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failedPieces, ["ItemLegs/HempRope"]);
    assert.match(result.failureReason, /failed to add ItemLegs\/HempRope/);
    assert.deepEqual(created.appearance(), original);
});

test("bunny punishment rolls back when persistence fails transiently", async () => {
    const original = [{ Group: "ItemArms", Name: "OldCuffs", Property: {} }];
    const created = createCharacter(10, { initialAppearance: original });
    let syncAttempts = 0;
    const system = new BunnyParkSystem(
        {} as any,
        async () => {
            syncAttempts += 1;
            if (syncAttempts === 1)
                throw new Error("temporary database failure");
        },
        deterministicRandom(0),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, false);
    assert.equal(syncAttempts, 2);
    assert.deepEqual(created.appearance(), original);
});

test("bunny punishment retries after transient persistence failure", async () => {
    const created = createCharacter(14);
    let syncAttempts = 0;
    const system = new BunnyParkSystem(
        {} as any,
        async () => {
            syncAttempts += 1;
            if (syncAttempts === 1)
                throw new Error("temporary database failure");
        },
        deterministicRandom(0),
        0,
    );

    await (system as any).onCharacterStepOnBunny(created.character);
    await (system as any).onCharacterStepOnBunny(created.character);

    assert.equal(syncAttempts, 3);
    assert.equal(created.messages.length, 2);
    assert.match(created.messages[0], /could not be applied safely/);
    assert.match(created.messages[1], /binding you as punishment/);
    assert.ok(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemArms" && item.Name === "HempRope",
            ),
    );
});

test("bunny punishment reports permission failures separately", async () => {
    const created = createCharacter(11, { accessible: false });
    const system = new BunnyParkSystem(
        {} as any,
        async () => {},
        deterministicRandom(0),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, false);
    assert.match(result.failureReason, /permission denied/);
    assert.deepEqual(created.added, []);
});

test("invalid bunny configuration fails before announcing punishment", async () => {
    const created = createCharacter(13);
    const system = new BunnyParkSystem(
        {} as any,
        async () => {},
        deterministicRandom(0),
        0,
    );
    const invalidConfig = {
        name: "Invalid",
        pieces: [{ group: "ItemArms", asset: "MissingAsset" }],
    } as any;

    const result = await (system as any).applyPunishment(
        created.character,
        invalidConfig,
    );

    assert.equal(result.success, false);
    assert.match(result.failureReason, /asset unavailable/);
    assert.deepEqual(created.added, []);
    assert.deepEqual(created.messages, []);
});

test("duplicate bunny tile events do not reapply or reannounce punishment", async () => {
    const created = createCharacter(12);
    const messages: string[] = [];
    let syncCount = 0;
    const system = new BunnyParkSystem(
        {} as any,
        async () => {
            syncCount += 1;
        },
        deterministicRandom(0),
        0,
    );

    await (system as any).onCharacterStepOnBunny(created.character);
    await (system as any).onCharacterStepOnBunny(created.character);

    assert.equal(syncCount, 1);
    assert.equal(
        created.added.filter((key) => key === "ItemArms/HempRope").length,
        1,
    );
    assert.equal(created.messages.length, 1);
    messages.push(...created.messages);
    assert.match(messages[0], /binding you as punishment/);
});

test("configured bunny locations trigger appearance and persistence updates", async () => {
    const callbacks: Array<(character: any) => void> = [];
    const connector = createConnector(callbacks);
    const persisted: number[] = [];
    const configuredPositions = [...BUNNY_POSITIONS, { X: 32, Y: 25 }];
    const system = new BunnyParkSystem(
        connector as any,
        async (character) => {
            persisted.push(character.MemberNumber);
        },
        deterministicRandom(0),
        0,
    );

    await system.reloadLocations(
        configuredPositions.map((position, index) => ({
            key: `bunny_${index}`,
            name: `Bunny ${index}`,
            type: "bunny" as const,
            x: position.X,
            y: position.Y,
            enabled: true,
            createdAt: 0,
            updatedAt: 0,
        })),
    );

    assert.equal(callbacks.length, configuredPositions.length);
    for (const [index, callback] of callbacks.entries()) {
        const created = createCharacter(index + 100);
        created.character.MapPos = configuredPositions[index];
        callback(created.character);
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(persisted, [100, 101, 102, 103]);
});
