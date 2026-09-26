import type { GameStateMutationService } from "../shared/gameStateMutationService";
import type { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";
import type { BunnyPunishmentArtifact } from "../shared/unifiedCharacterTypes";

export interface BunnyPunishmentAuditDetails {
    operationId: string;
    configuration: string;
    restraintPieces: string[];
    appliedPieces: string[];
}

export interface BunnyPunishmentRepository {
    getState?(memberNumber: number): Promise<{
        punishmentCount: number;
        artifact?: BunnyPunishmentArtifact;
    }>;
    recordArtifact(
        artifact: BunnyPunishmentArtifact,
        expectedArtifactVersion?: number,
    ): Promise<void>;
    updateArtifact?(
        artifact: BunnyPunishmentArtifact,
        expectedArtifactVersion?: number,
    ): Promise<void>;
    incrementCount(memberNumber: number): Promise<void>;
    recordAudit(
        memberNumber: number,
        details: BunnyPunishmentAuditDetails,
    ): Promise<void>;
}

export class UnifiedBunnyPunishmentRepository implements BunnyPunishmentRepository {
    public constructor(
        private readonly store: Pick<
            UnifiedCharacterStore,
            | "recordBunnyPunishmentArtifact"
            | "incrementBunnyPunishmentCount"
            | "getVeratownView"
        >,
        private readonly mutationService?: Pick<
            GameStateMutationService,
            "recordAuditEntry"
        >,
    ) {}

    public async recordArtifact(
        artifact: BunnyPunishmentArtifact,
        expectedArtifactVersion?: number,
    ): Promise<void> {
        await this.store.recordBunnyPunishmentArtifact(
            artifact,
            expectedArtifactVersion,
        );
    }

    public async updateArtifact(
        artifact: BunnyPunishmentArtifact,
        expectedArtifactVersion?: number,
    ): Promise<void> {
        await this.store.recordBunnyPunishmentArtifact(
            artifact,
            expectedArtifactVersion,
        );
    }

    public async getState(memberNumber: number): Promise<{
        punishmentCount: number;
        artifact?: BunnyPunishmentArtifact;
    }> {
        const view = await this.store.getVeratownView(memberNumber);
        return {
            punishmentCount: view.bunnyPunishmentCount ?? 0,
            artifact: view.bunnyPunishmentArtifact,
        };
    }

    public async incrementCount(memberNumber: number): Promise<void> {
        await this.store.incrementBunnyPunishmentCount(memberNumber);
    }

    public async recordAudit(
        memberNumber: number,
        details: BunnyPunishmentAuditDetails,
    ): Promise<void> {
        await this.mutationService?.recordAuditEntry(
            memberNumber,
            "bunny_punishment_applied",
            details as unknown as Record<string, unknown>,
            memberNumber,
        );
    }
}
