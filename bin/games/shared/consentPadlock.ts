import { generatePassword } from "../../utils";

export type ConsentTrigger =
    "safeword" | "explicit-consent" | "admin" | "unknown";

export type ConsentPadlockType =
    "SafewordPadlock" | "ExclusivePadlock" | "PasswordPadlock";

export interface ConsentPadlockOptions {
    memberNumber: number;
    consentTrigger?: ConsentTrigger;
    lockType?: ConsentPadlockType;
    password?: string;
    hint?: string;
    showTimer?: boolean;
}

const CONSENT_PADLOCK_TYPES = new Set<ConsentPadlockType>([
    "SafewordPadlock",
    "ExclusivePadlock",
    "PasswordPadlock",
]);

/**
 * Resolves the lock policy at one boundary so future consent states can choose
 * a different Bondage Club lock without changing every feature system.
 */
export function resolveConsentPadlockType(
    options: Pick<ConsentPadlockOptions, "consentTrigger" | "lockType"> = {},
): ConsentPadlockType {
    if (options.lockType) return options.lockType;
    return "SafewordPadlock";
}

export function applyConsentPadlock(
    item: any,
    options: ConsentPadlockOptions,
): ConsentPadlockType {
    const lockType = resolveConsentPadlockType(options);
    if (!CONSENT_PADLOCK_TYPES.has(lockType)) {
        throw new Error(
            `Unsupported consent padlock type: ${String(lockType)}`,
        );
    }
    const lockProperty = {
        ...(lockType === "SafewordPadlock"
            ? {}
            : { Password: options.password ?? generatePassword() }),
        ...(options.hint === undefined ? {} : { Hint: options.hint }),
        RemoveItem: true,
        LockSet: true,
        ...(lockType === "SafewordPadlock"
            ? {}
            : { ShowTimer: options.showTimer ?? false }),
    };
    const runtimeItem = item as any;

    runtimeItem.lock(lockType, options.memberNumber, lockProperty);

    const persistedItem = runtimeItem.getData?.() ?? runtimeItem;
    if (persistedItem.Property && typeof persistedItem.Property === "object") {
        delete persistedItem.Property.Lock;
        delete persistedItem.Property.RemoveTimer;
    }

    return lockType;
}
