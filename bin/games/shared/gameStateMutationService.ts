/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { BC_AppearanceItem } from "bc-bot";
import { createLogger, Logger } from "../../logging";
import { EventBus } from "./eventBus";
import { UnifiedCharacterStore } from "./unifiedCharacterStore";
import { DareState, VeratownState } from "./unifiedCharacterTypes";

export type GameType = "casino" | "dare" | "veratown" | string;

export interface GameStateMutationService {
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
    ): Promise<void>;
    resumeGame(memberNumber: number, gameId: string): Promise<void>;
}

type MutationStore = Pick<
    UnifiedCharacterStore,
    | "updateChips"
    | "lockChips"
    | "unlockChips"
    | "applyBondage"
    | "removeBondage"
    | "getProfile"
    | "updateDareStats"
    | "updateVeratownStats"
    | "suspendAllGames"
    | "resumeSuspendedGames"
    | "recordAuditEntry"
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
        await this.withRetry(async () => {
            await this.unifiedStore.updateChips(from, -amount, reason, from);
            await this.unifiedStore.updateChips(to, amount, reason, from);
            await this.audit(from, "transferChips", {
                from,
                to,
                amount,
                reason,
            });
            await this.audit(to, "transferChips", { from, to, amount, reason });
        }, "transferChips");
    }

    public async lockChips(
        memberNumber: number,
        amount: number,
        reason: "bondage" | "parole" | "cage",
    ): Promise<void> {
        this.validateMember(memberNumber);
        this.validateAmount(amount);
        await this.withRetry(async () => {
            await this.unifiedStore.lockChips(memberNumber, amount, reason);
            await this.audit(memberNumber, "lockChips", { amount, reason });
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
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (!gameId || !reason)
            throw new Error("gameId and reason are required");
        await this.withRetry(async () => {
            await this.unifiedStore.suspendAllGames(memberNumber);
            await this.audit(memberNumber, "suspendGame", { gameId, reason });
        }, "suspendGame");
    }

    public async resumeGame(
        memberNumber: number,
        gameId: string,
    ): Promise<void> {
        this.validateMember(memberNumber);
        if (!gameId) throw new Error("gameId is required");
        await this.withRetry(async () => {
            await this.unifiedStore.resumeSuspendedGames(memberNumber);
            await this.audit(memberNumber, "resumeGame", { gameId });
        }, "resumeGame");
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

    private async withRetry(
        operation: () => Promise<void>,
        name: string,
    ): Promise<void> {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await operation();
                return;
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
}
