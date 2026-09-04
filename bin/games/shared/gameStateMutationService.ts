/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { BC_AppearanceItem } from "bc-bot";
import { ClientSession } from "mongodb";
import { createLogger, Logger } from "../../logging";
import { EventBus } from "./eventBus";
import { UnifiedCharacterStore } from "./unifiedCharacterStore";
import {
    AppliedEffect,
    CasinoState,
    CrossSystemState,
    DareState,
    GameEvent,
    KeypadAccessRecord,
    MutationInventoryItem,
    VeratownState,
} from "./unifiedCharacterTypes";

export type GameType = "casino" | "dare" | "veratown" | string;

export interface GameStateMutationService {
    updateCharacterProperty(
        memberNumber: number,
        property: string,
        value: unknown,
        actor?: number,
    ): Promise<void>;
    updateCharacterName(
        memberNumber: number,
        name: string,
        actor?: number,
    ): Promise<void>;
    updateCasinoStats(
        memberNumber: number,
        updates: Partial<CasinoState>,
        actor?: number,
    ): Promise<void>;
    updateDareStats(
        memberNumber: number,
        updates: Partial<DareState>,
        actor?: number,
    ): Promise<void>;
    updateVeratownStats(
        memberNumber: number,
        updates: Partial<VeratownState>,
        actor?: number,
    ): Promise<void>;
    updateCrossSystemStats(
        memberNumber: number,
        updates: Partial<CrossSystemState>,
        actor?: number,
    ): Promise<void>;
    addToInventory(
        memberNumber: number,
        item: MutationInventoryItem,
        actor?: number,
    ): Promise<void>;
    removeFromInventory(
        memberNumber: number,
        itemKey: string,
        actor?: number,
    ): Promise<void>;
    applyEffect(
        memberNumber: number,
        effect: AppliedEffect,
        actor?: number,
    ): Promise<void>;
    recordEvent(event: GameEvent): Promise<void>;
    awardChips(
        memberNumber: number,
        amount: number,
        reason: string,
        actor?: number,
    ): Promise<void>;
    claimDailyFreeChips(memberNumber: number, amount: number): Promise<boolean>;
    deductChips(
        memberNumber: number,
        amount: number,
        reason: string,
        actor?: number,
    ): Promise<void>;
    updateLocation(
        memberNumber: number,
        position: { X: number; Y: number },
        actor?: number,
    ): Promise<void>;
    updateBondageLevel(
        memberNumber: number,
        level: number,
        actor?: number,
    ): Promise<void>;
    withTransaction<T>(
        operation: (session: ClientSession) => Promise<T>,
    ): Promise<T>;
    transferChips(
        from: number,
        to: number,
        amount: number,
        reason: string,
    ): Promise<void>;
    lockChips(
        memberNumber: number,
        amount: number,
        reason: "bondage" | "parole" | "cage",
        lockUntil?: number,
    ): Promise<void>;
    unlockChips(memberNumber: number, amount?: number): Promise<void>;
    applyBondage(
        memberNumber: number,
        items: BC_AppearanceItem[],
        appliedBy?: number,
        reason?: string,
    ): Promise<void>;
    removeBondage(memberNumber: number, reason?: string): Promise<void>;
    enterCage(
        memberNumber: number,
        cageName: string,
        durationMs?: number,
    ): Promise<void>;
    exitCage(memberNumber: number): Promise<void>;
    updateGameProgress(
        memberNumber: number,
        gameType: GameType,
        updates: Record<string, unknown>,
    ): Promise<void>;
    suspendGame(
        memberNumber: number,
        gameId: string,
        reason: string,
    ): Promise<number>;
    resumeGame(memberNumber: number, gameId: string): Promise<number>;
    addKeypadAccess(
        memberNumber: number,
        access: KeypadAccessRecord,
        actor?: number,
    ): Promise<void>;
    removeKeypadAccess(
        memberNumber: number,
        doorKey: string,
        groupName?: string,
        actor?: number,
    ): Promise<void>;
    recordAuditEntry(
        memberNumber: number,
        operation: string,
        context: Record<string, unknown>,
        actor?: number,
    ): Promise<void>;
}

type MutationStore = Pick<
    UnifiedCharacterStore,
    | "updateChips"
    | "claimDailyFreeChips"
    | "updateCharacterName"
    | "updateCasinoStats"
    | "lockChips"
    | "unlockChips"
    | "applyBondage"
    | "removeBondage"
    | "getProfile"
    | "updateDareStats"
    | "updateVeratownStats"
    | "updateCrossSystemStats"
    | "addKeypadAccess"
    | "removeKeypadAccess"
    | "suspendAllGames"
    | "resumeSuspendedGames"
    | "recordAuditEntry"
    | "recordEvent"
    | "withTransaction"
    | "transferChipsAtomically"
>;

export class GameStateMutationServiceImpl implements GameStateMutationService {
    private readonly logger: Logger;

    constructor(
        private readonly unifiedStore: MutationStore,
        private readonly eventBus: EventBus,
        logger?: Logger,
    ) {
        this.logger = logger ?? createLogger("GameStateMutationService");
    }

    public async updateCharacterProperty(
        memberNumber: number,
        property: string,
        value: unknown,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (!property || property.includes("$"))
            throw new Error("property is invalid");
        await this.withRetry(async () => {
            await this.unifiedStore.updateVeratownStats(memberNumber, {
                [property]: value,
            } as Partial<VeratownState>);
            await this.audit(
                memberNumber,
                "updateCharacterProperty",
                { property, value },
                actor,
            );
        }, "updateCharacterProperty");
    }

    public async updateCharacterName(
        memberNumber: number,
        name: string,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (!name) throw new Error("name is required");
        await this.withRetry(async () => {
            await this.unifiedStore.updateCharacterName(memberNumber, name);
            await this.audit(
                memberNumber,
                "updateCharacterName",
                { name },
                actor,
            );
        }, "updateCharacterName");
    }

    public async updateCasinoStats(
        memberNumber: number,
        updates: Partial<CasinoState>,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        await this.withRetry(async () => {
            await this.unifiedStore.updateCasinoStats(memberNumber, updates);
            await this.audit(
                memberNumber,
                "updateCasinoStats",
                { updates },
                actor,
            );
        }, "updateCasinoStats");
    }

    public async updateDareStats(
        memberNumber: number,
        updates: Partial<DareState>,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        await this.withRetry(async () => {
            await this.unifiedStore.updateDareStats(memberNumber, updates);
            await this.audit(
                memberNumber,
                "updateDareStats",
                { updates },
                actor,
            );
        }, "updateDareStats");
    }

    public async updateVeratownStats(
        memberNumber: number,
        updates: Partial<VeratownState>,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        await this.withRetry(async () => {
            await this.unifiedStore.updateVeratownStats(memberNumber, updates);
            await this.audit(
                memberNumber,
                "updateVeratownStats",
                { updates },
                actor,
            );
        }, "updateVeratownStats");
    }

    public async updateCrossSystemStats(
        memberNumber: number,
        updates: Partial<CrossSystemState>,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        await this.withRetry(async () => {
            await this.unifiedStore.updateCrossSystemStats(
                memberNumber,
                updates,
            );
            await this.audit(
                memberNumber,
                "updateCrossSystemStats",
                { updates },
                actor,
            );
        }, "updateCrossSystemStats");
    }

    public async addToInventory(
        memberNumber: number,
        item: MutationInventoryItem,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (
            !item?.itemKey ||
            !Number.isInteger(item.quantity) ||
            item.quantity <= 0
        )
            throw new Error("valid inventory item is required");
        await this.withRetry(async () => {
            const profile = await this.unifiedStore.getProfile(memberNumber);
            const inventory = [...(profile.crossSystem.inventory ?? []), item];
            await this.unifiedStore.updateCrossSystemStats(memberNumber, {
                inventory,
            });
            await this.audit(memberNumber, "addToInventory", { item }, actor);
        }, "addToInventory");
    }

    public async removeFromInventory(
        memberNumber: number,
        itemKey: string,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (!itemKey) throw new Error("itemKey is required");
        await this.withRetry(async () => {
            const profile = await this.unifiedStore.getProfile(memberNumber);
            const inventory = (profile.crossSystem.inventory ?? []).filter(
                (item) => item.itemKey !== itemKey,
            );
            await this.unifiedStore.updateCrossSystemStats(memberNumber, {
                inventory,
            });
            await this.audit(
                memberNumber,
                "removeFromInventory",
                { itemKey },
                actor,
            );
        }, "removeFromInventory");
    }

    public async applyEffect(
        memberNumber: number,
        effect: AppliedEffect,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (!effect?.effectKey) throw new Error("effect is required");
        await this.withRetry(async () => {
            const profile = await this.unifiedStore.getProfile(memberNumber);
            await this.unifiedStore.updateCrossSystemStats(memberNumber, {
                effects: [...(profile.crossSystem.effects ?? []), effect],
            });
            await this.audit(memberNumber, "applyEffect", { effect }, actor);
        }, "applyEffect");
    }

    public recordEvent(event: GameEvent): Promise<void> {
        return this.unifiedStore
            .recordEvent(event)
            .then(() => this.eventBus.publish(event));
    }

    public withTransaction<T>(
        operation: (session: ClientSession) => Promise<T>,
    ): Promise<T> {
        return this.unifiedStore.withTransaction(operation);
    }

    public awardChips(
        memberNumber: number,
        amount: number,
        reason: string,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        this.validatePositiveIntegerAmount(amount);
        return this.withRetry(async () => {
            await this.unifiedStore.updateChips(
                memberNumber,
                amount,
                reason,
                actor,
            );
            await this.audit(
                memberNumber,
                "awardChips",
                { amount, reason },
                actor,
            );
        }, "awardChips");
    }

    public deductChips(
        memberNumber: number,
        amount: number,
        reason: string,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        this.validatePositiveIntegerAmount(amount);
        return this.withRetry(async () => {
            await this.unifiedStore.updateChips(
                memberNumber,
                -amount,
                reason,
                actor,
            );
            await this.audit(
                memberNumber,
                "deductChips",
                { amount, reason },
                actor,
            );
        }, "deductChips");
    }

    public async claimDailyFreeChips(
        memberNumber: number,
        amount: number,
    ): Promise<boolean> {
        this.validateMember(memberNumber);
        this.validatePositiveIntegerAmount(amount);
        const claimed = await this.unifiedStore.claimDailyFreeChips(
            memberNumber,
            amount,
            0,
        );
        if (claimed) {
            await this.audit(
                memberNumber,
                "claimDailyFreeChips",
                { amount },
                0,
            );
        }
        return claimed;
    }

    public async updateLocation(
        memberNumber: number,
        position: { X: number; Y: number },
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        await this.withRetry(async () => {
            await this.unifiedStore.updateVeratownStats(memberNumber, {
                lastPosition: position,
                lastPositionAt: Date.now(),
            });
            await this.audit(
                memberNumber,
                "updateLocation",
                { position },
                actor,
            );
        }, "updateLocation");
    }

    public async updateBondageLevel(
        memberNumber: number,
        level: number,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (!Number.isInteger(level) || level < 0)
            throw new Error("bondage level must be a non-negative integer");
        await this.withRetry(async () => {
            await this.unifiedStore.updateCrossSystemStats(memberNumber, {
                bondageLevel: level,
            });
            await this.audit(
                memberNumber,
                "updateBondageLevel",
                { level },
                actor,
            );
        }, "updateBondageLevel");
    }

    public async transferChips(
        from: number,
        to: number,
        amount: number,
        reason: string,
    ): Promise<void> {
        this.validateMember(from);
        this.validateMember(to);
        this.validateAmount(amount);
        if (!reason) throw new Error("reason is required");
        if (from === to) throw new Error("source and destination must differ");
        await this.unifiedStore.transferChipsAtomically(
            from,
            to,
            amount,
            reason,
            from,
        );
        await this.audit(from, "transferChips", {
            from,
            to,
            amount,
            reason,
        });
        await this.audit(to, "transferChips", { from, to, amount, reason });
    }

    public async lockChips(
        memberNumber: number,
        amount: number,
        reason: "bondage" | "parole" | "cage",
        lockUntil?: number,
    ): Promise<void> {
        this.validateMember(memberNumber);
        this.validateAmount(amount);
        await this.withRetry(async () => {
            await this.unifiedStore.lockChips(
                memberNumber,
                amount,
                reason,
                lockUntil,
            );
            await this.audit(memberNumber, "lockChips", {
                amount,
                reason,
                lockUntil,
            });
        }, "lockChips");
    }

    public async unlockChips(memberNumber: number, amount = 0): Promise<void> {
        this.validateMember(memberNumber);
        this.validateAmount(amount);
        await this.withRetry(async () => {
            await this.unifiedStore.unlockChips(memberNumber, amount);
            await this.audit(memberNumber, "unlockChips", { amount });
        }, "unlockChips");
    }

    public async applyBondage(
        memberNumber: number,
        items: BC_AppearanceItem[],
        appliedBy?: number,
        reason = "gameplay",
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error("at least one bondage item is required");
        }
        await this.withRetry(async () => {
            for (const item of items) {
                const key = `${item.Group}:${item.Name}`;
                await this.unifiedStore.applyBondage(
                    memberNumber,
                    key,
                    0,
                    appliedBy,
                );
            }
            await this.audit(
                memberNumber,
                "applyBondage",
                {
                    itemCount: items.length,
                    reason,
                },
                appliedBy,
            );
        }, "applyBondage");
    }

    public async removeBondage(
        memberNumber: number,
        reason = "gameplay",
    ): Promise<void> {
        this.validateMember(memberNumber);
        await this.withRetry(async () => {
            const profile = await this.unifiedStore.getProfile(memberNumber);
            for (const item of profile.dare.activeBondage) {
                await this.unifiedStore.removeBondage(
                    memberNumber,
                    item.forfeitKey,
                );
            }
            await this.audit(memberNumber, "removeBondage", { reason });
        }, "removeBondage");
    }

    public async enterCage(
        memberNumber: number,
        cageName: string,
        durationMs?: number,
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (!cageName) throw new Error("cageName is required");
        if (durationMs !== undefined) this.validateAmount(durationMs);
        await this.withRetry(async () => {
            const now = Date.now();
            const profile = await this.unifiedStore.getProfile(memberNumber);
            const sessions = [
                ...profile.veratown.cageIncarcerations,
                { enteredAt: now, duration: durationMs ?? 0, cageName },
            ];
            await this.unifiedStore.updateVeratownStats(memberNumber, {
                cageIncarcerations: sessions,
            });
            await this.audit(memberNumber, "enterCage", {
                cageName,
                durationMs,
            });
            await this.publish("cage_entry", memberNumber, {
                cageName,
                durationMs,
            });
        }, "enterCage");
    }

    public async exitCage(memberNumber: number): Promise<void> {
        this.validateMember(memberNumber);
        await this.withRetry(async () => {
            const profile = await this.unifiedStore.getProfile(memberNumber);
            const sessions = [...profile.veratown.cageIncarcerations];
            const current = sessions[sessions.length - 1];
            if (current && !current.releasedAt) {
                current.releasedAt = Date.now();
                current.duration = current.releasedAt - current.enteredAt;
            }
            await this.unifiedStore.updateVeratownStats(memberNumber, {
                cageIncarcerations: sessions,
            });
            await this.audit(memberNumber, "exitCage", {});
            await this.publish("cage_exit", memberNumber, {});
        }, "exitCage");
    }

    public async updateGameProgress(
        memberNumber: number,
        gameType: GameType,
        updates: Record<string, unknown>,
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (!gameType || !updates || typeof updates !== "object") {
            throw new Error("gameType and updates are required");
        }
        await this.withRetry(async () => {
            if (gameType === "dare") {
                await this.unifiedStore.updateDareStats(
                    memberNumber,
                    updates as Partial<DareState>,
                );
            } else if (gameType === "veratown") {
                await this.unifiedStore.updateVeratownStats(
                    memberNumber,
                    updates as Partial<VeratownState>,
                );
            }
            await this.audit(memberNumber, "updateGameProgress", {
                gameType,
                updates,
            });
        }, "updateGameProgress");
    }

    public async suspendGame(
        memberNumber: number,
        gameId: string,
        reason: string,
    ): Promise<number> {
        this.validateMember(memberNumber);
        if (!gameId || !reason)
            throw new Error("gameId and reason are required");
        return this.withRetry(async () => {
            const suspendedCount =
                await this.unifiedStore.suspendAllGames(memberNumber);
            await this.audit(memberNumber, "suspendGame", { gameId, reason });
            return suspendedCount;
        }, "suspendGame");
    }

    public async resumeGame(
        memberNumber: number,
        gameId: string,
    ): Promise<number> {
        this.validateMember(memberNumber);
        if (!gameId) throw new Error("gameId is required");
        return this.withRetry(async () => {
            const resumedCount =
                await this.unifiedStore.resumeSuspendedGames(memberNumber);
            await this.audit(memberNumber, "resumeGame", { gameId });
            return resumedCount;
        }, "resumeGame");
    }

    public async addKeypadAccess(
        memberNumber: number,
        access: KeypadAccessRecord,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        await this.withRetry(async () => {
            await this.unifiedStore.addKeypadAccess(memberNumber, access);
            await this.audit(
                memberNumber,
                "addKeypadAccess",
                { access },
                actor,
            );
        }, "addKeypadAccess");
    }

    public async removeKeypadAccess(
        memberNumber: number,
        doorKey: string,
        groupName?: string,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (!doorKey) throw new Error("doorKey is required");
        await this.withRetry(async () => {
            await this.unifiedStore.removeKeypadAccess(
                memberNumber,
                doorKey,
                groupName,
            );
            await this.audit(
                memberNumber,
                "removeKeypadAccess",
                { doorKey, groupName },
                actor,
            );
        }, "removeKeypadAccess");
    }

    public recordAuditEntry(
        memberNumber: number,
        operation: string,
        context: Record<string, unknown>,
        actor?: number,
    ): Promise<void> {
        return this.audit(memberNumber, operation, context, actor);
    }

    private async publish(
        type: "cage_entry" | "cage_exit",
        memberNumber: number,
        data: Record<string, unknown>,
    ): Promise<void> {
        await this.eventBus.publish({
            timestamp: Date.now(),
            type,
            source: "veratown",
            actor: memberNumber,
            target: memberNumber,
            data,
            processed: false,
        });
    }

    private async audit(
        memberNumber: number,
        operation: string,
        context: Record<string, unknown>,
        actor?: number,
    ): Promise<void> {
        await this.unifiedStore.recordAuditEntry(
            memberNumber,
            operation,
            context,
            actor,
        );
    }

    private async withRetry<T>(
        operation: () => Promise<T>,
        name: string,
    ): Promise<T> {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                if (attempt === 2) break;
                await new Promise((resolve) =>
                    setTimeout(resolve, 100 * 2 ** attempt),
                );
            }
        }
        this.logger.error(`Mutation failed: ${name}`, lastError);
        throw lastError;
    }

    private validateMember(memberNumber: number): void {
        if (!Number.isInteger(memberNumber) || memberNumber < 0) {
            throw new Error("memberNumber must be a non-negative integer");
        }
    }

    private validateAmount(amount: number): void {
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error("amount must be a non-negative number");
        }
    }

    private validatePositiveIntegerAmount(amount: number): void {
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            throw new Error("amount must be a positive integer");
        }
    }
}
