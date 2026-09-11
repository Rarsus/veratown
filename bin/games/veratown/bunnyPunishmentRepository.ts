import type { GameStateMutationService } from "../shared/gameStateMutationService";
import type { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";
import type { BunnyPunishmentArtifact } from "../shared/unifiedCharacterTypes";

export interface BunnyPunishmentAuditDetails {
    operationId: string;
    configuration: string;
    restraintPieces: string[];
    sign: BunnyPunishmentArtifact["sign"];
    appliedPieces: string[];
}

export interface BunnyPunishmentRepository {
    recordArtifact(artifact: BunnyPunishmentArtifact): Promise<void>;
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
            "recordBunnyPunishmentArtifact" | "incrementBunnyPunishmentCount"
        >,
        private readonly mutationService?: Pick<
            GameStateMutationService,
            "recordAuditEntry"
        >,
    ) {}

    public async recordArtifact(
        artifact: BunnyPunishmentArtifact,
    ): Promise<void> {
        await this.store.recordBunnyPunishmentArtifact(artifact);
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
