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
        omitOn?: string;
        initialAppearance?: any[];
        accessible?: boolean;
        dropSignOnBundleCall?: number;
    } = {},
) {
    let appearance = structuredClone(options.initialAppearance ?? []);
    let bundleCalls = 0;
    const added: string[] = [];
    const messages: string[] = [];
    const appearanceUpdates: any[][] = [];
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
            MakeAppearanceBundle: () => {
                bundleCalls += 1;
                if (bundleCalls === options.dropSignOnBundleCall) {
                    appearance = appearance.filter(
                        (item) =>
                            !(
                                item.Group === "ItemMisc" &&
                                item.Name === "WoodenSign"
                            ),
                    );
                }
                return structuredClone(appearance);
            },
            slowlyApplyBundle: async (items: any[]) => {
                for (const item of items) {
                    if (options.omitOn === `${item.Group}/${item.Name}`) {
                        added.push(`${item.Group}/${item.Name}`);
                        continue;
                    }
                    character.Appearance.AddItem(item);
                }
            },
            InventoryGet: (group: string) => {
                const data = appearance.find((item) => item.Group === group);
                if (!data) return null;
                return {
                    Group: data.Group,
                    Name: data.Name,
                    Extended: {
                        SetType: (type: string) => {
                            data.Property.Type = type;
                        },
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
            },
        },
        sendAppearanceUpdate: () =>
            appearanceUpdates.push(structuredClone(appearance)),
        Tell: (_type: string, message: string) => messages.push(message),
    };
    return {
        character,
        added,
        messages,
        appearanceUpdates,
        appearance: () => structuredClone(appearance),
    };
}

function createConnector(
    callbacks: Array<(character: any) => void | Promise<void>>,
) {
    return {
        SendMessage: () => {},
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

function createMessageConnection(character: any) {
    return {
        SendMessage: (_type: string, message: string, target?: number) => {
            if (target === character.MemberNumber) {
                character.Tell("Whisper", message);
            }
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
            createMessageConnection(created.character) as any,
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
        const sign = created
            .appearance()
            .find(
                (item: any) =>
                    item.Group === "ItemMisc" && item.Name === "WoodenSign",
            );
        assert.equal(sign?.Property?.Text, "I step on", config.name);
        assert.equal(sign?.Property?.Text2, "Bunnies", config.name);
    }
});

test("bunny punishment sends the complete bundle for remote-character persistence", async () => {
    const created = createCharacter(19);
    const system = new BunnyParkSystem(
        createMessageConnection(created.character) as any,
        async () => {},
        deterministicRandom(0),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, true);
    const update = created.appearanceUpdates.at(-1);
    assert.ok(update);
    for (const piece of [
        ...BUNNY_RESTRAINT_CONFIGS[0].pieces,
        { group: "ItemMisc", asset: "WoodenSign" },
    ]) {
        assert.ok(
            update.some(
                (item: any) =>
                    item.Group === piece.group && item.Name === piece.asset,
            ),
            `${piece.group}/${piece.asset}`,
        );
    }
});

test("bunny punishment records a durable sign artifact", async () => {
    const created = createCharacter(18);
    let artifact: any;
    const system = new BunnyParkSystem(
        createMessageConnection(created.character) as any,
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
        createMessageConnection(created.character) as any,
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
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemMisc" && item.Name === "WoodenSign",
            ),
        true,
    );
});

test("bunny punishment fails when the required sign is lost", async () => {
    const created = createCharacter(17, { dropSignOnBundleCall: 4 });
    const persisted: any[] = [];
    const system = new BunnyParkSystem(
        createMessageConnection(created.character) as any,
        async (character) => {
            persisted.push(character.Appearance.MakeAppearanceBundle());
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
});

test("bunny punishment fails when required sign synchronization removes the sign", async () => {
    const created = createCharacter(16);
    let syncCount = 0;
    const system = new BunnyParkSystem(
        createMessageConnection(created.character) as any,
        async (character) => {
            syncCount += 1;
            character.Appearance.RemoveItem("ItemMisc");
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
});

test("bunny punishment keeps successful pieces when one restraint fails", async () => {
    const original = [{ Group: "ItemArms", Name: "OldCuffs", Property: {} }];
    const created = createCharacter(9, {
        failOn: "ItemLegs/HempRope",
        initialAppearance: original,
    });
    const system = new BunnyParkSystem(
        createMessageConnection(created.character) as any,
        async () => {},
        deterministicRandom(0),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failedPieces, [
        "ItemArms/HempRope",
        "ItemLegs/HempRope",
    ]);
    assert.match(result.failureReason, /failed to add/);
    assert.ok(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemArms" && item.Name === "OldCuffs",
            ),
    );
    assert.ok(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemMisc" && item.Name === "WoodenSign",
            ),
    );
    assert.equal(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemLegs" && item.Name === "HempRope",
            ),
        false,
    );
});

test("bunny punishment continues when a restraint is silently omitted", async () => {
    const created = createCharacter(20, {
        omitOn: "ItemLegs/HempRope",
    });
    const system = new BunnyParkSystem(
        createMessageConnection(created.character) as any,
        async () => {},
        deterministicRandom(0),
        0,
    );

    const result = await (system as any).applyPunishment(
        created.character,
        BUNNY_RESTRAINT_CONFIGS[0],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.appliedPieces, [
        "ItemArms/HempRope",
        "ItemMisc/WoodenSign",
    ]);
    assert.deepEqual(result.failedPieces, ["ItemLegs/HempRope"]);
    assert.ok(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemArms" && item.Name === "HempRope",
            ),
    );
    assert.ok(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemMisc" && item.Name === "WoodenSign",
            ),
    );
});

test("bunny punishment keeps restraints when persistence fails transiently", async () => {
    const created = createCharacter(10);
    let syncAttempts = 0;
    const system = new BunnyParkSystem(
        createMessageConnection(created.character) as any,
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

    assert.equal(result.success, true);
    assert.equal(syncAttempts, 1);
    assert.notEqual(created.appearance().length, 0);
    assert.ok(
        created
            .appearance()
            .some(
                (item: any) =>
                    item.Group === "ItemArms" && item.Name === "HempRope",
            ),
    );
});

test("bunny punishment retries after transient persistence failure", async () => {
    const created = createCharacter(14);
    let syncAttempts = 0;
    const system = new BunnyParkSystem(
        createMessageConnection(created.character) as any,
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

    assert.equal(syncAttempts, 1);
    assert.equal(created.messages.length, 2);
    assert.match(created.messages[0], /Please do not step/);
    assert.match(created.messages[1], /Please do not step/);
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
        createMessageConnection(created.character) as any,
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
        createMessageConnection(created.character) as any,
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

test("duplicate bunny tile events do not reapply punishment", async () => {
    const created = createCharacter(12);
    const messages: string[] = [];
    let syncCount = 0;
    const system = new BunnyParkSystem(
        createMessageConnection(created.character) as any,
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
    assert.equal(created.messages.length, 2);
    messages.push(...created.messages);
    assert.match(messages[0], /Please do not step/);
    assert.match(messages[1], /Please do not step/);
});

test("configured bunny locations trigger appearance and persistence updates", async () => {
    const callbacks: Array<(character: any) => void | Promise<void>> = [];
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
        await callback(created.character);
        for (
            let attempts = 0;
            attempts < 20 && persisted.length <= index;
            attempts += 1
        ) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }
    assert.deepEqual(persisted, [100, 101, 102, 103]);
});
