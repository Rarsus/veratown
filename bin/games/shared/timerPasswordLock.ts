import { generatePassword } from "../../utils";

export interface TimerPasswordLockOptions {
    memberNumber: number;
    removeTimer: number;
    hint?: string;
    password?: string;
    showTimer?: boolean;
    now?: () => number;
}

export function applyTimerPasswordLock(
    item: any,
    options: TimerPasswordLockOptions,
): void {
    const now = options.now ?? Date.now;
    if (!Number.isFinite(options.removeTimer) || options.removeTimer <= now()) {
        throw new Error("TimerPasswordPadlock requires a future removeTimer");
    }

    const lockProperty = {
        Password: options.password ?? generatePassword(),
        ...(options.hint === undefined ? {} : { Hint: options.hint }),
        RemoveItem: true,
        RemoveTimer: options.removeTimer,
        ShowTimer: options.showTimer ?? true,
        LockSet: true,
    };
    const runtimeItem = item as any;

    runtimeItem.lock(
        "TimerPasswordPadlock",
        options.memberNumber,
        lockProperty,
    );

    const persistedItem = runtimeItem.getData?.() ?? runtimeItem;
    if (persistedItem.Property && typeof persistedItem.Property === "object") {
        delete persistedItem.Property.Lock;
    }
}
