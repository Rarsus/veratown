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

import { API_Character, AssetGet, BC_AppearanceItem } from "bc-bot";
import { generatePassword } from "../../utils";
import { wait } from "../../hub/utils";
import { PET_EARS } from "../veratown";
import { createLogger } from "../../logging";

const logger = createLogger("forfeits");

interface Forfeit {
    name: string;
    value: number;
    items: (player: API_Character) => BC_AppearanceItem[];
    lock?: BC_AppearanceItem;
    lockTimeMs?: number;
    colourLayers?: number[];
    applyItems?: (char: API_Character, lockMemberNumber: number) => void;
}

export const FORFEITS: Record<string, Forfeit> = {
    boots: {
        name: "Boots",
        value: 5,
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        items: () => [AssetGet("ItemBoots", "BalletHeels")],
    },
    legbinder: {
        name: "Leg binder",
        value: 7,
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        colourLayers: [0],
        items: () => [AssetGet("ItemLegs", "ShinyLegBinder")],
    },
    frogtie: {
        name: "Frogtie straps",
        value: 8,
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        items: () => [AssetGet("ItemLegs", "FrogtieStraps")],
    },
    gag: {
        name: "Gag",
        value: 7,
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        colourLayers: [0],
        items: () => {
            const gag = AssetGet("ItemMouth", "HarnessBallGag");
            gag.Property = { TypeRecord: { typed: 2 } };
            return [gag];
        },
    },
    blindfold: {
        name: "Blindfold",
        value: 7,
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        items: () => [AssetGet("ItemHead", "LatexBlindfold")],
    },
    mittens: {
        name: "Mittens",
        value: 9,
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        colourLayers: [0],
        items: () => {
            const mittens = AssetGet("ItemHands", "LatexBondageMitts");
            mittens.Property = { TypeRecord: { t: 1, w: 1, r: 0, l: 0 } };
            return [mittens];
        },
    },
    paws: {
        name: "Paws",
        value: 9,
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        colourLayers: [0],
        items: () => {
            const mittens = AssetGet("ItemHands", "ElbowLengthMittens");
            mittens.Property = { TypeRecord: { typed: 0 } };
            return [mittens];
        },
    },
    armbinder: {
        name: "Armbinder",
        colourLayers: [0],
        value: 10,
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        items: () => [AssetGet("ItemArms", "ShinyArmbinder")],
    },
    yoke: {
        name: "Yoke",
        value: 10,
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        items: () => [AssetGet("ItemArms", "Yoke")],
    },
    straitjacket: {
        name: "Straitjacket",
        value: 14,
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        items: () => [AssetGet("ItemArms", "StraitJacket")],
    },
    hood: {
        name: "Hood",
        value: 12,
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        items: () => [AssetGet("ItemHood", "LeatherHoodSealed")],
    },
    spreader: {
        name: "Spreader bar",
        value: 8,
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        items: () => [AssetGet("ItemFeet", "SpreaderMetal")],
    },
    cage: {
        name: "Cage",
        value: 30,
        items: () => {
            const cage = AssetGet("ItemDevices", "Kennel");
            cage.Property = { TypeRecord: { d: 1, p: 1 } };
            return [cage];
        },
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        applyItems: (character: API_Character, lockMemberNumber: number) => {
            const cage = character.Appearance.AddItem(
                AssetGet("ItemDevices", "Kennel"),
            );
            cage.setProperty("TypeRecord", { d: 1, p: 1 });
            cage.SetDifficulty(20);
            cage.lock("TimerPasswordPadlock", lockMemberNumber, {
                Password: generatePassword(),
                Hint: "Better luck next time!",
                RemoveItem: true,
                RemoveTimer: Date.now() + (FORFEITS.cage.lockTimeMs ?? 0),
                ShowTimer: true,
                LockSet: true,
            });
        },
    },
    pet: {
        name: "Pet",
        value: 12,
        items: () => [AssetGet("ItemArms", "ShinyPetSuit")],
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        applyItems: makePet.bind(null, 0),
    },
    pet1hour: {
        name: "Pet: 1 hour",
        value: 15,
        items: () => [AssetGet("ItemArms", "ShinyPetSuit")],
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 1 * 60 * 60 * 1000,
        applyItems: makePet.bind(null, 1),
    },
    pet2hours: {
        name: "Pet: 2 hours",
        value: 20,
        items: () => [AssetGet("ItemArms", "ShinyPetSuit")],
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 2 * 60 * 60 * 1000,
        applyItems: makePet.bind(null, 2),
    },
    pet3hours: {
        name: "Pet: 3 hours",
        value: 25,
        items: () => [AssetGet("ItemArms", "ShinyPetSuit")],
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 3 * 60 * 60 * 1000,
        applyItems: makePet.bind(null, 3),
    },
    pet4hours: {
        name: "Pet: 4 hours",
        value: 30,
        items: () => [AssetGet("ItemArms", "ShinyPetSuit")],
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 4 * 60 * 60 * 1000,
        applyItems: makePet.bind(null, 4),
    },
    chastity: {
        name: "Chastity",
        value: 15,
        items: (sender) => {
            // InventoryGet("Pussy") returns null for characters that don't
            // have anything equipped in that group at all (e.g. some body
            // types/outfits never populate it) - fall back to the belt
            // instead of crashing on `item.Name` below, which used to abort
            // the whole bondage dare (and every other forfeitKey after this
            // one) for those characters.
            const item = sender?.Appearance?.InventoryGet("Pussy");
            if (item?.Name == "Penis") {
                return [AssetGet("ItemVulva", "PlasticChastityCage2")];
            } else {
                return [AssetGet("ItemPelvis", "ModularChastityBelt")];
            }
        },
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
        applyItems: makeChaste.bind(null),
    } /*
    hypnovisor: {
        name: "Hypnotic Visor",
        colourLayers: [2],
        value: 6,
        items: () => [AssetGet("ItemHead", "HypnoticVisor")],
        lock: AssetGet("ItemMisc", "TimerPasswordPadlock"),
        lockTimeMs: 20 * 60 * 1000,
    }*/,
};

interface Service {
    name: string;
    description: string;
    value: number;
}

export const SERVICES: Record<string, Service> = {
    cocktail: {
        name: "House Special Cocktail",
        description:
            "Hand crafted by our expert mixologist. Please drink responsibly.",
        value: 10,
    },
    player: {
        name: "Buy a caged player",
        description: "Why waste their misfortune?",
        value: 100,
    },
    lap: {
        name: "Sit in Lilly's lap",
        description: "Enjoy sitting in Lilly's lap for an hour.",
        value: 20000,
    },
    /*"massage": {
        name: "Pixie Massage",
        description: "Let Miss Ellie melt away those tensions with a soothing massage.",
        value: 800,
    },
    "session": {
        name: "Session with Miss Ellie",
        description: "Something you'd like to try? Need to give up control? Name your kink and let Miss Ellie take you to the depths of your subby desires.",
        value: 1000,
    },
    "rent-a-pixie": {
        name: "Rent-a-pixie™️",
        description: "Ellie is at your service for up to 60 mins. Skills include bar work, pet walking and casino management.",
        value: 2000,
    },
    "modelling": {
        name: "Modelling",
        description: "Ellie will wear an outfit of your choice (clothes only) for a full 24 hours. No nudity!",
        value: 5000,
    },
    "pixiepet": {
        name: "Pixie Pet",
        description: "Your very own personal pet for 2 hours.",
        value: 10000,
    },*/
};

function makeChaste(character: API_Character, lockMemberNumber: number): void {
    // Same InventoryGet("Pussy") null-guard as the "chastity" forfeit's
    // items() above - some bodies/outfits never populate that group, and
    // this used to crash with `.Name` on null, aborting the whole bondage
    // application for the character.
    const pussyItem = character.Appearance.InventoryGet("Pussy");
    if (pussyItem?.Name == "Penis") {
        const chastityCage = character.Appearance.AddItem(
            AssetGet("ItemVulva", "PlasticChastityCage2"),
        );
        chastityCage.SetCraft({
            Name: `Pixie Casino Chastity Cage`,
            Description:
                `After betting and losing at the Pixie Casino, ${character} has lost the privilege to orgasm. ` +
                `This chastity cage will ensure that the rule is followed.`,
        });
        const hairColor = character.Appearance.InventoryGet(
            "HairFront",
        )?.GetColor() ?? ["#000000"];
        const targetColor: BCColor =
            Array.isArray(hairColor) && hairColor.length > 1
                ? (hairColor[0] as HexColor)
                : Array.isArray(hairColor)
                  ? (hairColor[0] as HexColor)
                  : (hairColor as HexColor);
        chastityCage.SetColor(["Default", targetColor, targetColor, "#FFBC00"]);
        chastityCage.lock("TimerPasswordPadlock", lockMemberNumber, {
            Password: generatePassword(),
            Hint: "Better luck next time!",
            RemoveItem: true,
            RemoveTimer: Date.now() + (FORFEITS.chastity.lockTimeMs ?? 0),
            ShowTimer: true,
            LockSet: true,
        });
    } else {
        const chastityBelt = character.Appearance.AddItem(
            AssetGet("ItemPelvis", "ModularChastityBelt"),
        );
        chastityBelt.SetCraft({
            Name: `Pixie Casino Chastity Belt`,
            Description:
                `After betting and losing at the Pixie Casino, ${character} has lost her privileges to orgasm. ` +
                `This chastity belt will ensure that she is kept chaste until her time is up.`,
        });
        chastityBelt.SetColor(
            character.Appearance.InventoryGet("HairFront")?.GetColor() ?? [
                "#000000",
            ],
        );
        chastityBelt.setProperty("TypeRecord", {
            a: 1,
            c: 1,
            i: 0,
            o: 0,
            p: 0,
            s: 0,
            v: 0,
        });
        chastityBelt.lock("TimerPasswordPadlock", lockMemberNumber, {
            Password: generatePassword(),
            Hint: "Better luck next time!",
            RemoveItem: true,
            RemoveTimer: Date.now() + (FORFEITS.chastity.lockTimeMs ?? 0),
            ShowTimer: true,
            LockSet: true,
        });
    }
}

/**
 * Human body part flavor text used to describe what wearing a given
 * forfeit's asset group feels/looks like, for descriptive dare emotes.
 */
function bodyPartFlavor(group: AssetGroupName): string {
    switch (group) {
        case "ItemMouth":
            return "gagged, muffling every word";
        case "ItemHead":
            return "blindfolded, plunged into darkness";
        case "ItemHood":
            return "hooded, the world reduced to muffled darkness";
        case "ItemHands":
            return "mittened, fingers made useless";
        case "ItemArms":
            return "bound at the arms, elbows drawn in tight";
        case "ItemLegs":
            return "strapped up at the legs, steps shortened to a shuffle";
        case "ItemBoots":
            return "locked into towering heels";
        case "ItemFeet":
            return "spread wide at the ankles, barely able to shuffle";
        case "ItemDevices":
            return "sealed inside a heavy device";
        case "ItemPelvis":
        case "ItemVulva":
            return "locked into chastity, with no relief in sight";
        default:
            return "bound up snugly";
    }
}

export interface ForfeitApplyResult {
    forfeit: Forfeit;
    forfeitKey: string;
    group: AssetGroupName;
    outcome: "applied" | "extended";
    durationMs: number;
}

/**
 * Builds a descriptive emote line for the outcome of applyForfeitForDare(),
 * instead of just flatly stating that an item was equipped.
 */
export function describeForfeitOutcome(
    target: API_Character,
    result: ForfeitApplyResult,
): string {
    const itemName = result.forfeit.name.toLowerCase();
    if (result.outcome === "extended") {
        const extraMinutes = Math.max(1, Math.round(result.durationMs / 60000));
        return (
            `*${target} is already ${bodyPartFlavor(result.group)} - instead of piling on more gear, ` +
            `the bot simply winds their ${itemName}'s timer forward by another ${extraMinutes} minute(s)!`
        );
    }

    return (
        `*${target} is ${bodyPartFlavor(result.group)} as the ${itemName} ` +
        `is fastened into place and locks shut with a firm click.`
    );
}

/**
 * Equips a single forfeit item (by FORFEITS key) on a character, optionally
 * overriding its default lock duration. Used by the dare game so dare cards
 * can vary how long a piece of bondage stays locked on.
 *
 * If the character already has something equipped in the forfeit's asset
 * group, no new item is added - instead the existing item's lock timer is
 * extended by the requested duration, so a dare never stacks two items onto
 * the same body part (e.g. two gags).
 *
 * Forfeits with a custom `applyItems` (cage/pet/chastity) always use their
 * own baked-in duration when newly applied, since overriding those isn't
 * supported - but an already-equipped one can still have its timer extended.
 */
export async function applyForfeitForDare(
    character: API_Character,
    lockMemberNumber: number,
    forfeitKey: string,
    durationMsOverride?: number,
): Promise<ForfeitApplyResult | undefined> {
    const forfeit = FORFEITS[forfeitKey];
    if (!forfeit) return undefined;

    const probeItems = forfeit.items(character);
    if (probeItems.length !== 1) return undefined;
    const group = probeItems[0].Group;

    logger.info(
        `[Casino] Applying forfeit ${forfeitKey} to ${character.MemberNumber}`,
    );

    const existing = character.Appearance.InventoryGet(group);
    if (existing) {
        logger.info(
            `[Casino] Extending existing item in group ${group} for forfeit ${forfeitKey}`,
        );
        const extendMs =
            durationMsOverride ?? forfeit.lockTimeMs ?? 20 * 60 * 1000;
        const currentExpiry =
            existing.getData().Property?.RemoveTimer ?? Date.now();
        const newExpiry = Math.max(currentExpiry, Date.now()) + extendMs;
        existing.setProperty("RemoveTimer", newExpiry);
        existing.setProperty("ShowTimer", true);
        existing.setProperty("RemoveItem", true);

        // Refresh appearance after modifying item properties
        character.Appearance.MakeAppearanceBundle();
        await wait(50);

        if (!existing.getData().Property?.LockedBy) {
            existing.lock("TimerPasswordPadlock", lockMemberNumber, {
                Password: generatePassword(),
                Hint: "Dare in progress!",
                LockSet: true,
            });

            // Refresh appearance after locking
            character.Appearance.MakeAppearanceBundle();
            await wait(50);
        }

        logger.info(
            `[Casino] Extended forfeit ${forfeitKey} for ${extendMs}ms`,
        );

        return {
            forfeit,
            forfeitKey,
            group,
            outcome: "extended",
            durationMs: extendMs,
        };
    }

    if (forfeit.applyItems) {
        logger.info(
            `[Casino] Using custom applyItems for forfeit ${forfeitKey}`,
        );
        forfeit.applyItems(character, lockMemberNumber);

        // Refresh appearance after custom item application
        character.Appearance.MakeAppearanceBundle();
        await wait(50);

        return {
            forfeit,
            forfeitKey,
            group,
            outcome: "applied",
            durationMs: forfeit.lockTimeMs ?? 0,
        };
    }

    const items = probeItems;
    if (items.length !== 1) return undefined;

    logger.info(
        `[Casino] Adding item ${items[0].Name} for forfeit ${forfeitKey}`,
    );

    const hairColor = character.Appearance.InventoryGet(
        "HairFront",
    )?.GetColor() ?? ["#000000"];
    const added = character.Appearance.AddItem(items[0]);

    // Refresh appearance after adding item
    character.Appearance.MakeAppearanceBundle();
    await wait(50);

    try {
        const base = (
            Array.isArray(hairColor) ? hairColor[0] : hairColor
        ) as BCColor;
        if (forfeit.colourLayers) {
            const colors: BCColor[] = [];
            for (let i = 0; i <= Math.max(...forfeit.colourLayers); i++) {
                colors.push(
                    forfeit.colourLayers.includes(i) ? base : "Default",
                );
            }
            added.SetColor(colors);
        } else {
            added.SetColor(base);
        }

        logger.info(`[Casino] Set color for forfeit ${forfeitKey}`);
    } catch (e) {
        logger.error(`Failed to set color for dare item ${items[0].Name}`, e);
        added.SetColor("Default");
    }

    added.SetDifficulty(20);
    added.SetCraft({
        Name: `Dare: ${forfeit.name}`,
        Description: "Equipped as part of a dare. Better luck next time!",
    });

    // Refresh appearance after setting cosmetics
    character.Appearance.MakeAppearanceBundle();
    await wait(50);

    const lockTime = durationMsOverride ?? forfeit.lockTimeMs;
    if (lockTime) {
        logger.info(`[Casino] Locking forfeit ${forfeitKey} for ${lockTime}ms`);
        added.lock("TimerPasswordPadlock", lockMemberNumber, {
            Password: generatePassword(),
            Hint: "Dare in progress!",
            RemoveItem: true,
            RemoveTimer: Date.now() + lockTime,
            ShowTimer: true,
            LockSet: true,
        });

        // Refresh appearance after locking
        character.Appearance.MakeAppearanceBundle();
        await wait(50);
    }

    logger.info(
        `[Casino] Successfully applied forfeit ${forfeitKey} to ${character.MemberNumber}`,
    );

    return {
        forfeit,
        forfeitKey,
        group,
        outcome: "applied",
        durationMs: lockTime ?? 0,
    };
}

/**
 * Locks a character into a custom heavy kennel with an exclusive padlock
 * (no timer - only the bot, as the locker, can free them). Used as the
 * "forfeit" option a player can choose instead of having a bondage dare's
 * effect applied to them.
 */
export function lockInForfeitKennel(
    character: API_Character,
    lockMemberNumber: number,
): void {
    const kennel = character.Appearance.AddItem(
        AssetGet("ItemDevices", "Kennel"),
    );
    kennel.setProperty("TypeRecord", { d: 1, p: 1 });
    kennel.SetDifficulty(30);
    kennel.SetCraft({
        Name: "Dare: Forfeit Kennel",
        Description:
            `${character} couldn't face their bondage dare and was scooped up and sealed into a heavy kennel instead. ` +
            "There's no timer on this one - someone will have to let them out!",
    });
    kennel.lock("ExclusivePadlock", lockMemberNumber, {});
}

function makePet(
    hours: number,
    character: API_Character,
    lockMemberNumber: number,
): void {
    const characterHairColor = character.Appearance.InventoryGet(
        "HairFront",
    )?.GetColor() ?? ["#000000"];

    const petSuitItem = character.Appearance.AddItem(
        AssetGet("ItemArms", "ShinyPetSuit"),
    );
    petSuitItem.SetCraft({
        Name: `Pixie Casino Pet Suit`,
        Description:
            `A bold but unfortunate bet from ${character} means that they are now an official Pixie Casino Pet, ` +
            `here to be adorable for all our patrons. Please enjoy their helplessness!`,
    });
    petSuitItem.SetColor(characterHairColor);
    petSuitItem.Extended?.SetType("Classic");
    petSuitItem.lock("TimerPasswordPadlock", lockMemberNumber, {
        Password: generatePassword(),
        Hint: "Better luck next time!",
        RemoveItem: true,
        RemoveTimer:
            Date.now() + (hours > 0 ? hours * 60 * 60 * 1000 : 20 * 60 * 1000),
        ShowTimer: true,
        LockSet: true,
    });

    if (!character.Appearance.InventoryGet("HairAccessory2")) {
        const ears = character.Appearance.AddItem(PET_EARS);
        ears.SetDifficulty(20);
        ears.SetColor(
            character.Appearance.InventoryGet("HairFront")?.GetColor() ?? [
                "#000000",
            ],
        );
    }

    if (!character.Appearance.InventoryGet("TailStraps")) {
        const tail = character.Appearance.AddItem(
            AssetGet("TailStraps", "PuppyTailStrap"),
        );
        tail.SetColor(
            character.Appearance.InventoryGet("HairFront")?.GetColor() ?? [
                "#000000",
            ],
        );
    }

    if (!character.Appearance.InventoryGet("ItemNeck")) {
        const collar = character.Appearance.AddItem(
            AssetGet("ItemNeck", "PetCollar"),
        );
        /*collar.lock("TimerPasswordPadlock", lockMemberNumber, {
            Password: generatePassword(),
            Hint: "Better luck next time!",
            RemoveItem: true,
            RemoveTimer: Date.now() + hours * 60 * 60 * 1000,
            ShowTimer: true,
            LockSet: true,
        });*/
        collar.SetCraft({
            Name: `Pixie Casino Pet Collar`,
            Description:
                `A bold but unfortunate bet from ${character} means that they are now an official Pixie Casino Pet. ` +
                `This collar will remind them of their place until their time is up.`,
        });
    }
}

export function forfeitsString(): string {
    return Object.entries(FORFEITS)
        .map(([name, f]) => `${name}: ${f.value} chips`)
        .join("\n");
}

export function restraintsRemoveString(): string {
    return Object.entries(FORFEITS)
        .map(([name, forfeit]) => `${forfeit.name}: ${forfeit.value * 4} chips`)
        .join("\n");
}

function commandForService(name: string): string {
    return (
        `/bot buy ${name}` +
        (name === "player" ? " <name or member number>" : "")
    );
}

export function servicesString(): string {
    return Object.entries(SERVICES)
        .map(
            ([name, s]) =>
                `${s.name}: ${s.value} chips\n${s.description}\n${commandForService(name)}\n`,
        )
        .join("\n");
}
