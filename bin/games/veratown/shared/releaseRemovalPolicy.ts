import { BC_AppearanceItem } from "bc-bot";
import { isBind } from "../../../../src/assetHelpers";
import type { RemovedBondageItem } from "../../shared/unifiedCharacterTypes";

const UNLOCKED_VALUES = new Set(["", "none", "unlock", "unlocked"]);
const TIMER_KEYS = new Set([
    "Timer",
    "TimerEnd",
    "LockTimer",
    "LockedUntil",
    "TimerExpiresAt",
    "LockExpiresAt",
]);
const LOCK_METADATA_KEY = /lock|timer|password|exclusive/i;

function hasLockEvidence(value: unknown, key?: string): boolean {
    if (
        value === undefined ||
        value === null ||
        value === "" ||
        value === false
    )
        return false;
    if (typeof value === "number" && value <= 0) return false;
    if (key && TIMER_KEYS.has(key) && typeof value === "number") {
        return value > Date.now();
    }
    return true;
}

function getProperty(item: unknown): Record<string, unknown> | undefined {
    if (!item || typeof item !== "object") return undefined;
    const property = (item as { Property?: unknown }).Property;
    if (property === undefined) return {};
    if (!property || typeof property !== "object" || Array.isArray(property)) {
        return undefined;
    }
    return property as Record<string, unknown>;
}

export function normalizeReleaseAppearanceItem(
    item: unknown,
): BC_AppearanceItem | undefined {
    if (!item || typeof item !== "object") return undefined;
    const candidate = item as { Group?: unknown; Name?: unknown };
    if (
        typeof candidate.Group !== "string" ||
        candidate.Group.trim().length === 0 ||
        typeof candidate.Name !== "string" ||
        candidate.Name.trim().length === 0
    ) {
        return undefined;
    }
    return {
        ...(item as BC_AppearanceItem),
        Group: candidate.Group.trim() as BC_AppearanceItem["Group"],
        Name: candidate.Name.trim(),
    };
}

export function isEffectivelyUnlockedBondageItem(item: unknown): boolean {
    const normalized = normalizeReleaseAppearanceItem(item);
    if (!normalized || !isBind(normalized)) return false;
    if (
        normalized.Group === "ItemNeck" ||
        normalized.Group === "ItemNeckAccessories"
    ) {
        return false;
    }

    const property = getProperty(normalized);
    if (!property) return false;

    const lock = property.Lock;
    if (lock !== undefined && lock !== null) {
        if (typeof lock !== "string") return false;
        if (!UNLOCKED_VALUES.has(lock.trim().toLowerCase())) return false;
    }

    for (const [key, value] of Object.entries(property)) {
        if (
            (key === "LockedBy" ||
                TIMER_KEYS.has(key) ||
                (key !== "Lock" && LOCK_METADATA_KEY.test(key))) &&
            hasLockEvidence(value, key)
        ) {
            return false;
        }
    }

    const topLevel = normalized as unknown as Record<string, unknown>;
    for (const key of [
        "LockedBy",
        ...TIMER_KEYS,
        ...Object.keys(topLevel).filter((key) => LOCK_METADATA_KEY.test(key)),
    ]) {
        if (hasLockEvidence(topLevel[key], key)) return false;
    }

    return true;
}

export function releaseLockFingerprint(item: unknown): string {
    const normalized = normalizeReleaseAppearanceItem(item);
    if (!normalized) return "invalid";
    const property = getProperty(normalized);
    const propertyLockMetadata = property
        ? Object.fromEntries(
              Object.entries(property)
                  .filter(
                      ([key]) =>
                          key === "Lock" ||
                          key === "LockedBy" ||
                          TIMER_KEYS.has(key) ||
                          LOCK_METADATA_KEY.test(key),
                  )
                  .sort(([left], [right]) => left.localeCompare(right)),
          )
        : null;
    const source = {
        property: propertyLockMetadata,
        topLevel: Object.fromEntries(
            Object.entries(normalized as any)
                .filter(([key]) => LOCK_METADATA_KEY.test(key))
                .sort(([left], [right]) => left.localeCompare(right)),
        ),
    };
    return JSON.stringify(source);
}

export function releaseItemIdentity(item: {
    group: string;
    name: string;
    lockFingerprint?: string;
}): string {
    return `${item.group}/${item.name}/${item.lockFingerprint ?? "invalid"}`;
}

export function toRemovedBondageItem(
    item: BC_AppearanceItem,
): RemovedBondageItem {
    const source = item as any;
    return {
        group: item.Group,
        name: item.Name,
        lockType:
            typeof source.Property?.Lock === "string"
                ? source.Property.Lock
                : undefined,
        lockedBy:
            (source.Property?.LockedBy ?? source.LockedBy)
                ? String(source.Property?.LockedBy ?? source.LockedBy)
                : undefined,
        color: source.Color ? String(source.Color) : undefined,
        difficulty:
            typeof source.Difficulty === "number"
                ? source.Difficulty
                : undefined,
        lockFingerprint: releaseLockFingerprint(item),
    };
}
