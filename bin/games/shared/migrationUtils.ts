/**
 * Phase 5: Full Migration Utilities
 *
 * Utilities for migrating from adapter layers to direct UnifiedCharacterStore usage.
 * These utilities help track migration progress and validate full cutover.
 *
 * @file bin/games/shared/migrationUtils.ts
 */

import type { UnifiedCharacterStore } from "./unifiedCharacterStore.js";
import type { CasinoStoreAdapter } from "./casinoStoreAdapter.js";
import type { DareStoreAdapter } from "./dareStoreAdapter.js";
import type { VeratownStoreAdapter } from "./veratownStoreAdapter.js";

import { createLogger } from "../../logging";

export enum MigrationPhase {
    ADAPTERS_ACTIVE = "adapters_active", // Phase 4: Adapters in use
    DIRECT_UNIFIED = "direct_unified", // Phase 5: Direct UnifiedCharacterStore usage
    FULL_MIGRATION = "full_migration", // Phase 5: All adapters removed
}

export interface MigrationStatus {
    phase: MigrationPhase;
    systemsMigrated: string[];
    systemsPending: string[];
    testsPassing: number;
    testsTotal: number;
    lastMigrationTime?: number;
    migratedSystems: {
        casino: boolean;
        dare: boolean;
        veratown: boolean;
        effects: boolean;
    };
    adapterStatus: {
        casinoAdapter: boolean; // true = removed
        dareAdapter: boolean;
        veratownAdapter: boolean;
        migrationWrapper: boolean;
    };
}

/**
 * Tracks migration progress and validates cutover
 */
export class MigrationTracker {
    private readonly logger = createLogger("MigrationTracker");
    private status: MigrationStatus = {
        phase: MigrationPhase.ADAPTERS_ACTIVE,
        systemsMigrated: [],
        systemsPending: [
            "casino",
            "dare",
            "veratown",
            "forfeitService",
            "dareEffectApplier",
        ],
        testsPassing: 462,
        testsTotal: 500, // Target for Phase 5
        migratedSystems: {
            casino: false,
            dare: false,
            veratown: false,
            effects: false,
        },
        adapterStatus: {
            casinoAdapter: false,
            dareAdapter: false,
            veratownAdapter: false,
            migrationWrapper: false,
        },
    };

    /**
     * Mark a system as migrated to direct UnifiedCharacterStore usage
     */
    public markSystemMigrated(systemName: string): void {
        if (!this.status.systemsMigrated.includes(systemName)) {
            this.status.systemsMigrated.push(systemName);
        }

        const index = this.status.systemsPending.indexOf(systemName);
        if (index >= 0) {
            this.status.systemsPending.splice(index, 1);
        }

        if (systemName === "casino") {
            this.status.migratedSystems.casino = true;
        } else if (systemName === "dare") {
            this.status.migratedSystems.dare = true;
        } else if (systemName === "veratown") {
            this.status.migratedSystems.veratown = true;
        } else if (systemName === "effects") {
            this.status.migratedSystems.effects = true;
        }
    }

    /**
     * Mark an adapter as removed
     */
    public markAdapterRemoved(adapterName: string): void {
        if (adapterName === "casino") {
            this.status.adapterStatus.casinoAdapter = true;
        } else if (adapterName === "dare") {
            this.status.adapterStatus.dareAdapter = true;
        } else if (adapterName === "veratown") {
            this.status.adapterStatus.veratownAdapter = true;
        } else if (adapterName === "migration_wrapper") {
            this.status.adapterStatus.migrationWrapper = true;
        }
    }

    /**
     * Update test count
     */
    public updateTestMetrics(passing: number, total: number): void {
        this.status.testsPassing = passing;
        this.status.testsTotal = total;
    }

    /**
     * Check if all systems migrated
     */
    public isFullyMigrated(): boolean {
        return (
            this.status.systemsPending.length === 0 &&
            Object.values(this.status.migratedSystems).every(
                (v) => v === true,
            ) &&
            Object.values(this.status.adapterStatus).every((v) => v === true)
        );
    }

    /**
     * Update migration phase
     */
    public setPhase(phase: MigrationPhase): void {
        this.status.phase = phase;
        this.status.lastMigrationTime = Date.now();
    }

    /**
     * Get current migration status
     */
    public getStatus(): MigrationStatus {
        return this.status;
    }

    /**
     * Get human-readable migration report
     */
    public getReport(): string {
        const percentComplete =
            (this.status.systemsMigrated.length /
                (this.status.systemsMigrated.length +
                    this.status.systemsPending.length)) *
            100;
        const testPassRate = (
            (this.status.testsPassing / this.status.testsTotal) *
            100
        ).toFixed(1);

        return `
PHASE 5 MIGRATION STATUS REPORT
================================

Current Phase: ${this.status.phase}
Progress: ${percentComplete.toFixed(1)}% complete

Migrated Systems (${this.status.systemsMigrated.length}):
  ${this.status.systemsMigrated.map((s) => `✅ ${s}`).join("\n  ") || "None yet"}

Pending Systems (${this.status.systemsPending.length}):
  ${this.status.systemsPending.map((s) => `⏳ ${s}`).join("\n  ") || "All migrated!"}

Test Coverage:
  Passing: ${this.status.testsPassing}/${this.status.testsTotal}
  Pass Rate: ${testPassRate}%

Adapter Removal Status:
  CasinoAdapter: ${this.status.adapterStatus.casinoAdapter ? "✅ Removed" : "❌ Active"}
  DareAdapter: ${this.status.adapterStatus.dareAdapter ? "✅ Removed" : "❌ Active"}
  VeratownAdapter: ${this.status.adapterStatus.veratownAdapter ? "✅ Removed" : "❌ Active"}
  MigrationWrapper: ${this.status.adapterStatus.migrationWrapper ? "✅ Removed" : "❌ Active"}

Overall Status: ${this.isFullyMigrated() ? "🎉 FULLY MIGRATED" : "🚀 IN PROGRESS"}
${this.status.lastMigrationTime ? `Last Update: ${new Date(this.status.lastMigrationTime).toISOString()}` : ""}
    `;
    }
}

/**
 * Validation utilities for migration safety
 */
export class MigrationValidator {
    /**
     * Verify that UnifiedCharacterStore has all required methods
     */
    public static validateUnifiedStoreInterface(store: any): boolean {
        const requiredMethods = [
            "getProfile",
            "updateChips",
            "lockChips",
            "unlockChips",
            "applyBondage",
            "removeBondage",
            "suspendAllGames",
            "resumeSuspendedGames",
            "recordEvent",
            "getCasinoView",
            "getDareView",
            "getVeratownView",
        ];

        for (const method of requiredMethods) {
            if (typeof store[method] !== "function") {
                this.logger?.error(`Missing method: ${method}`);
                return false;
            }
        }

        return true;
    }

    /**
     * Verify that migrated system uses UnifiedCharacterStore directly
     */
    public static validateSystemMigration(
        system: any,
        storeName: string,
    ): boolean {
        // Check that system has reference to unified store
        if (
            !system._unifiedStore &&
            !system.unifiedStore &&
            !system.store?.unifiedStore
        ) {
            this.logger?.error(
                `${storeName} does not reference UnifiedCharacterStore`,
            );
            return false;
        }

        return true;
    }

    /**
     * Compare old and new system behavior (smoke test)
     */
    public static async validateBehaviorParity(
        oldOperation: () => Promise<any>,
        newOperation: () => Promise<any>,
    ): Promise<boolean> {
        try {
            const oldResult = await oldOperation();
            const newResult = await newOperation();

            // Basic comparison - results should match
            if (JSON.stringify(oldResult) !== JSON.stringify(newResult)) {
                this.logger?.warn(
                    "Behavior mismatch between old and new implementation",
                );
                return false;
            }

            return true;
        } catch (error) {
            this.logger?.error("Validation error:", error);
            return false;
        }
    }
}

/**
 * Adapter deprecation warning system
 */
export class AdapterDeprecationWarning {
    private static issuedWarnings = new Set<string>();

    /**
     * Issue deprecation warning for adapter usage
     */
    public static warn(adapterName: string, replacementCode: string): void {
        if (!this.issuedWarnings.has(adapterName)) {
            this.logger?.warn(
                `⚠️  DEPRECATION WARNING: ${adapterName} is deprecated.
Use UnifiedCharacterStore directly instead.
Example: ${replacementCode}
This will be removed in Phase 5.`,
            );
            this.issuedWarnings.add(adapterName);
        }
    }

    /**
     * Get count of warnings issued
     */
    public static getWarningCount(): number {
        return this.issuedWarnings.size;
    }

    /**
     * Clear warning cache (for testing)
     */
    public static clear(): void {
        this.issuedWarnings.clear();
    }
}

/**
 * Global migration tracker instance
 */
let globalMigrationTracker: MigrationTracker | null = null;

export function getMigrationTracker(): MigrationTracker {
    if (!globalMigrationTracker) {
        globalMigrationTracker = new MigrationTracker();
    }
    return globalMigrationTracker;
}

export function resetMigrationTracker(): void {
    globalMigrationTracker = null;
}
