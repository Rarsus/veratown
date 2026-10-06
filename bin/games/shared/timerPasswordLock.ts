import { generatePassword } from "../../utils";
import { MAX_TIMER_PASSWORD_LOCK_DURATION_MS } from "../../action-layer/domain";

export interface TimerPasswordLockOptions {
    memberNumber: number;
    removeTimer: number;
    hint?: string;
    password?: string;
    showTimer?: boolean;
    now?: () => number;
}

export function boundedTimerPasswordRemoveTime(
    expectedRemoveTimer: number | undefined,
    now = Date.now(),
): number {
    const requested =
        expectedRemoveTimer ?? now + MAX_TIMER_PASSWORD_LOCK_DURATION_MS;
    if (!Number.isFinite(requested) || requested <= now) {
        throw new Error("TimerPasswordPadlock requires a future removeTimer");
    }
    return Math.min(requested, now + MAX_TIMER_PASSWORD_LOCK_DURATION_MS);
}

export function applyTimerPasswordLock(
    item: any,
    options: TimerPasswordLockOptions,
): void {
    const now = options.now ?? Date.now;
    const removeTimer = boundedTimerPasswordRemoveTime(
        options.removeTimer,
        now(),
    );

    const lockProperty = {
        Password: options.password ?? generatePassword(),
        ...(options.hint === undefined ? {} : { Hint: options.hint }),
        RemoveItem: true,
        RemoveTimer: removeTimer,
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
        delete persistedItem.Property.RemoveOnUnlock;
    }
}
