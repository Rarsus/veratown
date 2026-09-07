import { BC_AppearanceItem } from "bc-bot";

export type AppearanceMutationSource =
    | "bunny"
    | "release"
    | "dare"
    | "casino"
    | "veratown"
    | "unknown_external_mutation";

export interface AppearanceMutationContext {
    operationId: string;
    timestamp: number;
    source: AppearanceMutationSource;
    reason: string;
    cleanupAllowed?: boolean;
}

export interface AppearanceDiff {
    added: BC_AppearanceItem[];
    removed: BC_AppearanceItem[];
    replaced: Array<{
        before: BC_AppearanceItem;
        after: BC_AppearanceItem;
    }>;
    visibilityChanged: Array<{
        before: BC_AppearanceItem;
        after: BC_AppearanceItem;
    }>;
}

export interface BunnySignState {
    present: boolean;
    visible: boolean;
    text?: string;
    text2?: string;
}

const BUNNY_SIGN = { Group: "ItemMisc", Name: "WoodenSign" } as const;
const BUNNY_SIGN_TEXT = "I step on";
const BUNNY_SIGN_TEXT2 = "Bunnies";

function itemKey(item: BC_AppearanceItem): string {
    return `${item.Group}/${item.Name}`;
}

function groupKey(item: BC_AppearanceItem): string {
    return item.Group;
}

function propertyValue(item: BC_AppearanceItem, key: string): unknown {
    return (item.Property as Record<string, unknown> | undefined)?.[key];
}

function isVisible(item: BC_AppearanceItem): boolean {
    const alpha = propertyValue(item, "Alpha");
    const hidden = propertyValue(item, "Hidden") ?? propertyValue(item, "Hide");
    const visible = propertyValue(item, "Visible");
    return (
        alpha !== 0 &&
        alpha !== "0" &&
        hidden !== true &&
        hidden !== "true" &&
        visible !== false &&
        visible !== "false"
    );
}

export function getBunnySignState(
    appearance: readonly BC_AppearanceItem[],
): BunnySignState {
    const sign = appearance.find(
        (item) =>
            item.Group === BUNNY_SIGN.Group && item.Name === BUNNY_SIGN.Name,
    );
    if (!sign) return { present: false, visible: false };

    const text = propertyValue(sign, "Text");
    const text2 = propertyValue(sign, "Text2");
    return {
        present: true,
        visible:
            isVisible(sign) &&
            text === BUNNY_SIGN_TEXT &&
            text2 === BUNNY_SIGN_TEXT2,
        ...(typeof text === "string" ? { text } : {}),
        ...(typeof text2 === "string" ? { text2 } : {}),
    };
}

export function diffAppearance(
    before: readonly BC_AppearanceItem[],
    after: readonly BC_AppearanceItem[],
): AppearanceDiff {
    const beforeByKey = new Map(before.map((item) => [itemKey(item), item]));
    const afterByKey = new Map(after.map((item) => [itemKey(item), item]));
    const beforeByGroup = new Map(before.map((item) => [groupKey(item), item]));
    const afterByGroup = new Map(after.map((item) => [groupKey(item), item]));

    const added = after.filter((item) => !beforeByKey.has(itemKey(item)));
    const removed = before.filter((item) => !afterByKey.has(itemKey(item)));
    const replaced: AppearanceDiff["replaced"] = [];
    for (const [group, previous] of beforeByGroup) {
        const current = afterByGroup.get(group);
        if (current && previous.Name !== current.Name) {
            replaced.push({ before: previous, after: current });
        }
    }

    const visibilityChanged: AppearanceDiff["visibilityChanged"] = [];
    for (const [key, previous] of beforeByKey) {
        const current = afterByKey.get(key);
        if (current && isVisible(previous) !== isVisible(current)) {
            visibilityChanged.push({ before: previous, after: current });
        }
    }

    return { added, removed, replaced, visibilityChanged };
}

export { BUNNY_SIGN_TEXT, BUNNY_SIGN_TEXT2 };
