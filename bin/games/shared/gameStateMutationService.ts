/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { BC_AppearanceItem } from "bc-bot";
import { ClientSession } from "mongodb";
import { createLogger, Logger } from "../../logging";
import { DatabaseError, ValidationError, isRetryableError } from "../../errors";
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
    InventoryMutationResult,
    VeratownState,
    CharacterBioUpdate,
    ProgressionAwardResult,
    ProgressionRollbackResult,
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
    updateBio(
        memberNumber: number,
        updates: CharacterBioUpdate,
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
        mutationKey: string,
        actor?: number,
    ): Promise<InventoryMutationResult>;
    removeFromInventory(
        memberNumber: number,
        itemKey: string,
        quantity: number,
        mutationKey: string,
        actor?: number,
    ): Promise<InventoryMutationResult>;
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
    awardProgressionXp(
        memberNumber: number,
        amount: number,
        source: string,
        rewardKey: string,
        actor?: number,
    ): Promise<ProgressionAwardResult>;
    rollbackProgressionXp(
        memberNumber: number,
        rewardKey: string,
        actor?: number,
    ): Promise<ProgressionRollbackResult>;
}

type MutationStore = Pick<
    UnifiedCharacterStore,
    | "updateChips"
    | "claimDailyFreeChips"
    | "updateCharacterName"
    | "updateBio"
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
    | "awardProgressionXp"
    | "rollbackProgressionXp"
    | "mutateInventory"
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
            throw new ValidationError("property is invalid", {
                field: "property",
            });
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
        if (!name)
            throw new ValidationError("name is required", { field: "name" });
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

    public async updateBio(
        memberNumber: number,
        updates: CharacterBioUpdate,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        const allowed = ["title", "description", "status", "pronouns"] as const;
        const normalized: CharacterBioUpdate = {};
        for (const key of Object.keys(updates)) {
            if (!allowed.includes(key as (typeof allowed)[number])) {
                throw new ValidationError("bio field is invalid", {
                    field: key,
                });
            }
            const value = updates[key as keyof CharacterBioUpdate];
            if (
                value !== undefined &&
                (typeof value !== "string" || value.length > 500)
            ) {
                throw new ValidationError(
                    "bio fields must be strings of 500 characters or fewer",
                    {
                        field: key,
                    },
                );
            }
            if (value !== undefined) {
                normalized[key as keyof CharacterBioUpdate] = value;
            }
        }
        if (Object.keys(normalized).length === 0) {
            throw new ValidationError("bio updates are required", {
                field: "updates",
            });
        }
        await this.withRetry(async () => {
            await this.unifiedStore.updateBio(memberNumber, normalized);
            await this.audit(
                memberNumber,
                "updateBio",
                { updates: normalized },
                actor,
            );
        }, "updateBio");
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
        mutationKey: string,
        actor = memberNumber,
    ): Promise<InventoryMutationResult> {
        this.validateMember(memberNumber);
        if (
            !item?.itemKey ||
            !Number.isInteger(item.quantity) ||
            item.quantity <= 0 ||
            item.ownerMemberNumber !== memberNumber ||
            !mutationKey
        )
            throw new ValidationError("valid inventory item is required", {
                field: "item",
            });
        return this.withRetry(async () => {
            const result = await this.unifiedStore.mutateInventory(
                memberNumber,
                { operation: "add", item, mutationKey },
                actor,
            );
            if (result.applied) {
                await this.audit(
                    memberNumber,
                    "addToInventory",
                    { item, mutationKey, ...result },
                    actor,
                );
            }
            return result;
        }, "addToInventory");
    }

    public async removeFromInventory(
        memberNumber: number,
        itemKey: string,
        quantity: number,
        mutationKey: string,
        actor = memberNumber,
    ): Promise<InventoryMutationResult> {
        this.validateMember(memberNumber);
        if (
            !itemKey ||
            !Number.isInteger(quantity) ||
            quantity <= 0 ||
            !mutationKey
        )
            throw new ValidationError("itemKey is required", {
                field: "itemKey",
            });
        return this.withRetry(async () => {
            const result = await this.unifiedStore.mutateInventory(
                memberNumber,
                {
                    operation: "remove",
                    itemKey,
                    quantity,
                    mutationKey,
                },
                actor,
            );
            if (result.applied) {
                await this.audit(
                    memberNumber,
                    "removeFromInventory",
                    { itemKey, quantity, mutationKey, ...result },
                    actor,
                );
            }
            return result;
        }, "removeFromInventory");
    }

    public async applyEffect(
        memberNumber: number,
        effect: AppliedEffect,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (!effect?.effectKey)
            throw new ValidationError("effect is required", {
                field: "effect",
            });
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
        return this.unifiedStore
            .updateChips(memberNumber, amount, reason, actor)
            .then(() =>
                this.auditAfterMutation(
                    memberNumber,
                    "awardChips",
                    { amount, reason },
                    actor,
                ),
            );
    }

    public deductChips(
        memberNumber: number,
        amount: number,
        reason: string,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        this.validatePositiveIntegerAmount(amount);
        return this.unifiedStore
            .updateChips(memberNumber, -amount, reason, actor)
            .then(() =>
                this.auditAfterMutation(
                    memberNumber,
                    "deductChips",
                    { amount, reason },
                    actor,
                ),
            );
    }

    public async awardProgressionXp(
        memberNumber: number,
        amount: number,
        source: string,
        rewardKey: string,
        actor = memberNumber,
    ): Promise<ProgressionAwardResult> {
        this.validateMember(memberNumber);
        this.validatePositiveIntegerAmount(amount);
        if (!source)
            throw new ValidationError("source is required", {
                field: "source",
            });
        if (!rewardKey)
            throw new ValidationError("rewardKey is required", {
                field: "rewardKey",
            });
        return this.withRetry(async () => {
            const result = await this.unifiedStore.awardProgressionXp(
                memberNumber,
                amount,
                source,
                rewardKey,
                actor,
            );
            await this.auditAfterMutation(
                memberNumber,
                "awardProgressionXp",
                { amount, source, rewardKey, ...result },
                actor,
            );
            return result;
        }, "awardProgressionXp");
    }

    public async rollbackProgressionXp(
        memberNumber: number,
        rewardKey: string,
        actor = memberNumber,
    ): Promise<ProgressionRollbackResult> {
        this.validateMember(memberNumber);
        if (!rewardKey)
            throw new ValidationError("rewardKey is required", {
                field: "rewardKey",
            });
        return this.withRetry(async () => {
            const result = await this.unifiedStore.rollbackProgressionXp(
                memberNumber,
                rewardKey,
                actor,
            );
            await this.auditAfterMutation(
                memberNumber,
                "rollbackProgressionXp",
                { rewardKey, ...result },
                actor,
            );
            return result;
        }, "rollbackProgressionXp");
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
            await this.recordEvent({
                timestamp: Date.now(),
                type: "position_changed",
                source: "veratown",
                actor,
                target: memberNumber,
                data: { position },
                processed: false,
            });
        }, "updateLocation");
    }

    public async updateBondageLevel(
        memberNumber: number,
        level: number,
        actor = memberNumber,
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (!Number.isInteger(level) || level < 0)
            throw new ValidationError(
                "bondage level must be a non-negative integer",
                { field: "level" },
            );
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
        if (!reason)
            throw new ValidationError("reason is required", {
                field: "reason",
            });
        if (from === to)
            throw new ValidationError("source and destination must differ", {
                fields: ["from", "to"],
            });
        await this.unifiedStore.transferChipsAtomically(
            from,
            to,
            amount,
            reason,
            from,
        );
        await this.auditAfterMutation(from, "transferChips", {
            from,
            to,
            amount,
            reason,
        });
        await this.auditAfterMutation(to, "transferChips", {
            from,
            to,
            amount,
            reason,
        });
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
            throw new ValidationError("at least one bondage item is required", {
                field: "items",
            });
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
        if (!cageName)
            throw new ValidationError("cageName is required", {
                field: "cageName",
            });
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
            throw new ValidationError("gameType and updates are required", {
                fields: ["gameType", "updates"],
            });
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
            throw new ValidationError("gameId and reason are required", {
                fields: ["gameId", "reason"],
            });
        const suspendedCount =
            await this.unifiedStore.suspendAllGames(memberNumber);
        await this.auditAfterMutation(memberNumber, "suspendGame", {
            gameId,
            reason,
        });
        return suspendedCount;
    }

    public async resumeGame(
        memberNumber: number,
        gameId: string,
    ): Promise<number> {
        this.validateMember(memberNumber);
        if (!gameId)
            throw new ValidationError("gameId is required", {
                field: "gameId",
            });
        const resumedCount =
            await this.unifiedStore.resumeSuspendedGames(memberNumber);
        await this.auditAfterMutation(memberNumber, "resumeGame", { gameId });
        return resumedCount;
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
        if (!doorKey)
            throw new ValidationError("doorKey is required", {
                field: "doorKey",
            });
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

    private async auditAfterMutation(
        memberNumber: number,
        operation: string,
        context: Record<string, unknown>,
        actor?: number,
    ): Promise<void> {
        try {
            await this.audit(memberNumber, operation, context, actor);
        } catch (error) {
            this.logger.error(`Audit failed: ${operation}`, error, {
                memberNumber,
                operation,
            });
        }
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
        if (isRetryableError(lastError)) throw lastError;
        throw new DatabaseError(
            `Mutation failed: ${name}`,
            { operation: name },
            { cause: lastError },
        );
    }

    private validateMember(memberNumber: number): void {
        if (!Number.isInteger(memberNumber) || memberNumber < 0) {
            throw new ValidationError(
                "memberNumber must be a non-negative integer",
                { field: "memberNumber" },
            );
        }
    }

    private validateAmount(amount: number): void {
        if (!Number.isFinite(amount) || amount < 0) {
            throw new ValidationError("amount must be a non-negative number", {
                field: "amount",
            });
        }
    }

    private validatePositiveIntegerAmount(amount: number): void {
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            throw new ValidationError("amount must be a positive integer", {
                field: "amount",
            });
        }
    }
}
