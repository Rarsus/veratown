import { generatePassword } from "../../utils";

export interface TimerPasswordLockOptions {
    memberNumber: number;
    removeTimer: number;
    hint?: string;
    password?: string;
    showTimer?: boolean;
}

export function applyTimerPasswordLock(
    item: any,
    options: TimerPasswordLockOptions,
): void {
    const lockProperty = {
        AssetName: "TimerPasswordPadlock",
        MemberNumber: options.memberNumber,
        Password: options.password ?? generatePassword(),
        ...(options.hint === undefined ? {} : { Hint: options.hint }),
        RemoveItem: true,
        RemoveTimer: options.removeTimer,
        ShowTimer: options.showTimer ?? true,
        LockSet: true,
    };
    const runtimeItem = item as any;

    runtimeItem.lock("TimerPasswordPadlock", options.memberNumber, {});
    for (const [property, value] of Object.entries(lockProperty)) {
        if (property === "AssetName" || property === "MemberNumber") continue;
        if (typeof runtimeItem.setProperty === "function") {
            runtimeItem.setProperty(property, value);
        } else {
            runtimeItem.Property ??= {};
            runtimeItem.Property[property] = value;
        }
    }

    const persistedItem =
        typeof runtimeItem.getData === "function"
            ? runtimeItem.getData()
            : runtimeItem;
    persistedItem.Property ??= {};
    persistedItem.Property.Lock = {
        ...(persistedItem.Property.Lock ?? {}),
        ...lockProperty,
    };
}
