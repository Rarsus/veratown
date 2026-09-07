/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { API_Connector, API_Character, AssetGet } from "bc-bot";
import { wait } from "../../hub/utils";
import { durationString, remainingTimeString } from "../../utils";
import { NarratorBot } from "./veratownNarrationUtils";
import { guardHandler } from "./featureSystem";
import {
    CAGES,
    CAGE_INFORMATION_SCREEN,
    CRATE_LOCK_PASSWORD,
} from "./veratownConfig";
import { VeratownLocationDoc } from "./veratownLocationStore";
import { createIdempotentMonitor } from "./shared";
import { AbstractTileFeatureSystem } from "../shared/abstractTileFeatureSystem";
import { GameStateMutationService } from "../shared/gameStateMutationService";
import { syncAppearanceMutation } from "./shared/appearanceSync";
import type { CageSession } from "../shared/unifiedCharacterTypes";

export interface CageTimer {
    now(): number;
    wait(milliseconds: number): Promise<void>;
}

export type ContainmentRecoveryClassification =
    | "not-contained"
    | "contained-persisted-expiry"
    | "contained-live-expiry"
    | "contained-missing-expiry"
    | "conflicting-state"
    | "reconciliation-failed";

export interface ContainmentRecoveryAssessment {
    classification: ContainmentRecoveryClassification;
    persistenceState: "active-session" | "no-session";
    liveAppearanceState:
        | "futuristic-crate-with-expiry"
        | "futuristic-crate-missing-expiry"
        | "no-futuristic-crate";
    candidateExpiries: {
        persisted?: number;
        live?: number;
    };
    selectedExpiry?: number;
    selectedAction: string;
    operatorAction?: string;
}

export interface ContainmentRecoveryStatus extends ContainmentRecoveryAssessment {
    memberNumber: number;
    observedAtMs: number;
}

const containmentRecoveryStatuses = new Map<
    number,
    ContainmentRecoveryStatus
>();

function validExpiry(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Classifies persistence and live appearance independently. A missing expiry
 * is only unsafe when either source proves that a containment device/session
 * exists; it is never evidence of containment by itself.
 */
export function classifyContainmentRecovery(input: {
    activeSession?: Pick<CageSession, "expiresAt"> | null;
    liveCrateExpiry?: unknown;
    liveCratePresent?: boolean;
}): ContainmentRecoveryAssessment {
    const persistedExpiry = input.activeSession?.expiresAt;
    const hasPersistedSession =
        input.activeSession !== undefined && input.activeSession !== null;
    const hasLiveCrate =
        input.liveCratePresent ??
        (input.liveCrateExpiry !== null && input.liveCrateExpiry !== undefined);
    const liveExpiry = validExpiry(input.liveCrateExpiry)
        ? input.liveCrateExpiry
        : undefined;
    const persistedExpiryValue = validExpiry(persistedExpiry)
        ? persistedExpiry
        : undefined;

    if (!hasPersistedSession && !hasLiveCrate) {
        return {
            classification: "not-contained",
            persistenceState: "no-session",
            liveAppearanceState: "no-futuristic-crate",
            candidateExpiries: {},
            selectedAction: "ignore",
        };
    }

    if (hasPersistedSession && persistedExpiryValue !== undefined) {
        if (hasLiveCrate && liveExpiry !== undefined) {
            if (persistedExpiryValue !== liveExpiry) {
                return {
                    classification: "conflicting-state",
                    persistenceState: "active-session",
                    liveAppearanceState: "futuristic-crate-with-expiry",
                    candidateExpiries: {
                        persisted: persistedExpiryValue,
                        live: liveExpiry,
                    },
                    selectedExpiry: Math.max(persistedExpiryValue, liveExpiry),
                    selectedAction:
                        "retain the crate and use the later candidate expiry",
                    operatorAction:
                        "Reconcile the persisted session and live crate expiry",
                };
            }
            return {
                classification: "contained-persisted-expiry",
                persistenceState: "active-session",
                liveAppearanceState: "futuristic-crate-with-expiry",
                candidateExpiries: {
                    persisted: persistedExpiryValue,
                    live: liveExpiry,
                },
                selectedExpiry: persistedExpiryValue,
                selectedAction: "restore or retain the crate and arm release",
            };
        }
        return {
            classification: "contained-persisted-expiry",
            persistenceState: "active-session",
            liveAppearanceState: hasLiveCrate
                ? "futuristic-crate-missing-expiry"
                : "no-futuristic-crate",
            candidateExpiries: { persisted: persistedExpiryValue },
            selectedExpiry: persistedExpiryValue,
            selectedAction: "restore or retain the crate and arm release",
        };
    }

    if (!hasPersistedSession && liveExpiry !== undefined) {
        return {
            classification: "contained-live-expiry",
            persistenceState: "no-session",
            liveAppearanceState: "futuristic-crate-with-expiry",
            candidateExpiries: { live: liveExpiry },
            selectedExpiry: liveExpiry,
            selectedAction:
                "retain the crate and create durable containment state",
        };
    }

    return {
        classification: "contained-missing-expiry",
        persistenceState: hasPersistedSession ? "active-session" : "no-session",
        liveAppearanceState: hasLiveCrate
            ? "futuristic-crate-missing-expiry"
            : "no-futuristic-crate",
        candidateExpiries: {},
        selectedAction: "keep containment in place and defer recovery",
        operatorAction:
            "Inspect and repair the persisted cage expiry or remove the crate manually",
    };
}

export function getContainmentRecoveryDiagnostics(): ContainmentRecoveryStatus[] {
    return [...containmentRecoveryStatuses.values()];
}

const systemTimer: CageTimer = {
    now: () => Date.now(),
    wait,
};

// Owns the containment cages (the entry-warning tiles, the cages
// themselves, and the Futuristic Crate lock lifecycle), and the cage
// information screen showing current occupancy.
//
// To add location-based narration, use NarratorBot:
//   const narrator = new NarratorBot(this.conn, undefined, this.conn.Player.MapPos);
//   narrator.sayAt(cagePos, "Emote", `*Cage door slams shut with a click*`);
export class CageSystem extends AbstractTileFeatureSystem {
    private triggersReady = false;
    private cagedCharacters = new Map<
        number,
        {
            character: API_Character;
            cageName: string;
            authoritativeExpiry: number;
        }
    >();

    // Monitor for preventing duplicate cage entry handlers
    private monitor = createIdempotentMonitor<API_Character>("CageSystem");

    // Maps loaded from the database. Indexed by position for fast lookup.
    // Format: key is "X,Y" string, value is location doc + related metadata.
    private cagesByPos = new Map<
        string,
        {
            doc: VeratownLocationDoc;
            durationMs: number;
            durationDescription: string;
        }
    >();
    private cageEntriesByPos = new Map<
        string,
        {
            doc: VeratownLocationDoc;
            durationMs: number;
            durationDescription: string;
        }
    >();
    private readonly cageTrigger: ReturnType<typeof guardHandler>;
    private readonly cageEntryTrigger: ReturnType<typeof guardHandler>;
    private readonly cageInformationTrigger: ReturnType<typeof guardHandler>;

    public constructor(
        conn: API_Connector,
        private readonly mutationService?: GameStateMutationService,
        private readonly stateSync?: (
            character: API_Character,
        ) => Promise<void>,
        private readonly timer: CageTimer = systemTimer,
    ) {
        super(conn, "cage", "Containment cages");
        this.cageTrigger = this.guardTileHandler(this.onCharacterEnterCage);
        this.cageEntryTrigger = this.guardTileHandler(
            this.onCharacterEnterCageEntry,
        );
        this.cageInformationTrigger = guardHandler(
            this.key,
            this.onCharacterViewCageInformation as any,
        );
    }

    public registerTriggers(): void {
        // Register region trigger for cage information screen (doesn't depend on locations)
        this.conn.chatRoom!.map.addEnterRegionTrigger(
            CAGE_INFORMATION_SCREEN,
            this.cageInformationTrigger,
        );
    }

    /**
     * Load cage locations from the database and register tile triggers.
     * Called asynchronously so it doesn't block system initialization.
     */
    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        this.triggersReady = false;
        try {
            for (const posKey of this.cagesByPos.keys()) {
                const [x, y] = posKey.split(",").map(Number);
                this.conn.chatRoom!.map.removeTileTrigger(
                    x,
                    y,
                    this.cageTrigger,
                );
            }
            for (const posKey of this.cageEntriesByPos.keys()) {
                const [x, y] = posKey.split(",").map(Number);
                this.conn.chatRoom!.map.removeTileTrigger(
                    x,
                    y,
                    this.cageEntryTrigger,
                );
            }
            this.cagesByPos.clear();
            this.cageEntriesByPos.clear();

            const cages = locations.filter(
                (loc) => loc.type === "cage" && loc.enabled,
            );
            for (const cage of cages) {
                const posKey = this.getTileKey(cage.x!, cage.y!);
                const entryPosKey = this.getTileKey(
                    (cage.data?.entryX as number) ?? cage.x!,
                    (cage.data?.entryY as number) ?? cage.y!,
                );
                const durationMs =
                    (cage.data?.durationMs as number) ?? 5 * 60 * 1000;
                const durationDescription =
                    (cage.data?.durationDescription as string) ??
                    "an undetermined length of time";

                this.cagesByPos.set(posKey, {
                    doc: cage,
                    durationMs,
                    durationDescription,
                });
                this.cageEntriesByPos.set(entryPosKey, {
                    doc: cage,
                    durationMs,
                    durationDescription,
                });
            }

            // If no database locations loaded, fall back to hardcoded CAGES
            if (locations.length === 0) {
                for (const cage of CAGES) {
                    const posKey = this.getTileKey(cage.pos.X, cage.pos.Y);
                    const entryPosKey = this.getTileKey(
                        cage.entryPos.X,
                        cage.entryPos.Y,
                    );
                    this.cagesByPos.set(posKey, {
                        doc: {
                            key: cage.name.toLowerCase().replace(/\s+/g, "_"),
                            name: cage.name,
                            type: "cage",
                            x: cage.pos.X,
                            y: cage.pos.Y,
                            data: {
                                entryX: cage.entryPos.X,
                                entryY: cage.entryPos.Y,
                                durationMs: cage.lockDurationMs(),
                                durationDescription: cage.durationDescription,
                            },
                            enabled: true,
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                        },
                        durationMs: cage.lockDurationMs(),
                        durationDescription: cage.durationDescription,
                    });
                    this.cageEntriesByPos.set(entryPosKey, {
                        doc: {
                            key: cage.name.toLowerCase().replace(/\s+/g, "_"),
                            name: cage.name,
                            type: "cage",
                            x: cage.pos.X,
                            y: cage.pos.Y,
                            data: {
                                entryX: cage.entryPos.X,
                                entryY: cage.entryPos.Y,
                                durationMs: cage.lockDurationMs(),
                                durationDescription: cage.durationDescription,
                            },
                            enabled: true,
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                        },
                        durationMs: cage.lockDurationMs(),
                        durationDescription: cage.durationDescription,
                    });
                }
            }

            // Register tile triggers for cage positions
            for (const posKey of this.cagesByPos.keys()) {
                const [x, y] = posKey.split(",").map(Number);
                this.conn.chatRoom!.map.addTileTrigger(
                    { X: x, Y: y },
                    this.cageTrigger,
                );
            }

            // Register tile triggers for cage entry positions
            for (const posKey of this.cageEntriesByPos.keys()) {
                const [x, y] = posKey.split(",").map(Number);
                this.conn.chatRoom!.map.addTileTrigger(
                    { X: x, Y: y },
                    this.cageEntryTrigger,
                );
            }
            this.triggersReady = true;
            for (const character of this.conn.chatRoom?.characters ?? []) {
                void this.recoverCagedCharacter(character).catch((error) => {
                    this.logger.error("Cage recovery failed", {
                        memberNumber: character.MemberNumber,
                        observedAtMs: this.timer.now(),
                        error,
                    });
                });
            }

            this.logger?.info(
                `[CageSystem] Registered ${this.cagesByPos.size} cage location(s)`,
            );
        } catch (e) {
            this.logger?.error(
                "[CageSystem] Unexpected error during initialization",
                e,
            );
        }
    }

    public isReady(): boolean {
        return this.triggersReady;
    }

    // Removes a caged character's crate immediately, regardless of the
    // lock's remaining time. No-op if the character isn't currently caged.
    // Used by Veratown's "freeandleave"/admin release flows.
    public async freeCharacterIfCaged(character: API_Character): Promise<void> {
        if (
            character.Appearance.getItemData("ItemDevices")?.Name ===
            "FuturisticCrate"
        ) {
            await syncAppearanceMutation(
                character,
                () => {
                    character.Appearance.RemoveItem("ItemDevices");
                },
                50,
                this.stateSync,
            );
            if (
                character.Appearance.getItemData("ItemDevices")?.Name ===
                "FuturisticCrate"
            ) {
                this.logger.error(
                    "Manual cage release is pending crate removal",
                    {
                        memberNumber: character.MemberNumber,
                        observedAtMs: this.timer.now(),
                    },
                );
                return;
            }
            await this.mutationService?.exitCage(character.MemberNumber);
            this.cagedCharacters.delete(character.MemberNumber);
        }
    }

    private onCharacterEnterCageEntry = async (character: API_Character) => {
        if (!this.enabled) return;

        const posKey = this.getTileKey(character.X, character.Y);
        const cage = this.cageEntriesByPos.get(posKey);
        const cageName = cage?.doc.name ?? "the containment cage";
        const durationDescription =
            cage?.durationDescription ?? "an undetermined length of time";

        character.Tell(
            "Whisper",
            `(NOTICE: You are approaching the entrance to ${cageName}. ` +
                `Veratown Facility Containment Protocol 7-Alpha requires that all visitors be informed of ` +
                `the following before proceeding beyond this point: ` +
                `\n1: The floor beyond this threshold is fitted with motion-dampening sensors linked directly ` +
                `to the facility's Futuristic Crate containment units; standing still for any length of time ` +
                `while inside the cage area will be interpreted as consent to containment. ` +
                `\n2:  Once containment is initiated, a Futuristic Crate will be fitted and secured with a ` +
                `TimerPasswordPadlock; the lock will not release before its timer elapses regardless of ` +
                `struggling, safewords directed at facility staff, or appeals to management. ` +
                `\n3: The crate's internal systems, including restraints, vibration module, and comfort padding, are ` +
                `regularly inspected and are not expected to cause harm, but prolonged stillness, ` +
                `overheating, or discomfort should be reported to reception immediately upon release. ` +
                `\n4: Estimated containment duration for ${cageName} is ${durationDescription}; this ` +
                `estimate is provided for planning purposes only and is not a guarantee. ` +
                `\n5: Facility staff are not obligated to release occupants early, and the crate's lock ` +
                `password is known only to Veratown management. ` +
                `By proceeding past this point and remaining stationary, you acknowledge that you have read, ` +
                `understood, and voluntarily accept these terms. Proceed with caution, or step back now if ` +
                `you do not consent.`,
        );
    };

    private onCharacterEnterCage = async (character: API_Character) => {
        if (!this.enabled) return;

        await this.monitor.run(character, async () => {
            const cagePos = { ...character.MapPos };
            const stillInCage = () =>
                character.MapPos.X === cagePos.X &&
                character.MapPos.Y === cagePos.Y;

            await this.timer.wait(100);
            if (!stillInCage()) return;

            const posKey = this.getTileKey(cagePos.X, cagePos.Y);
            const cage = this.cagesByPos.get(posKey);
            const cageName = cage?.doc.name ?? "Unknown cage";
            const enteredAt = this.timer.now();
            const durationMs = cage?.durationMs ?? 30 * 60 * 1000;
            const lockExpiry = enteredAt + durationMs;
            const persisted = await this.mutationService?.enterCage(
                character.MemberNumber,
                cageName,
                durationMs,
                character.MemberNumber,
                enteredAt,
            );
            if (
                persisted === false &&
                character.Appearance.getItemData("ItemDevices")?.Name !==
                    "FuturisticCrate"
            ) {
                return;
            }

            let authoritativeExpiry = lockExpiry;
            if (persisted === false) {
                const session =
                    await this.mutationService?.getActiveCageSession(
                        character.MemberNumber,
                    );
                if (!session?.expiresAt) {
                    this.logger.warn(
                        "Cage recovery deferred because no persisted expiry is available",
                        {
                            memberNumber: character.MemberNumber,
                            cageName,
                            observedAtMs: this.timer.now(),
                        },
                    );
                    return;
                }
                authoritativeExpiry = session.expiresAt;
            } else {
                await syncAppearanceMutation(
                    character,
                    () => {
                        const crate = character.Appearance.AddItem(
                            AssetGet("ItemDevices", "FuturisticCrate"),
                        );
                        crate.SetCraft({
                            Name: `Veratown Futuristic Crate`,
                            Description: `A very interesting Crate, specially made for ${character} to ensure the wearer's safety.`,
                        });
                        crate.setProperty("TypeRecord", {
                            w: 2, // Big window
                            l: 3,
                            a: 3,
                            d: 1,
                            t: 1,
                            h: 4,
                        });
                        crate.setProperty("Mode", "Deny");

                        crate.lock(
                            "TimerPasswordPadlock",
                            character.MemberNumber,
                            {
                                Password: CRATE_LOCK_PASSWORD,
                                RemoveItem: true,
                                RemoveTimer: lockExpiry,
                                ShowTimer: true,
                                LockSet: true,
                            },
                        );
                    },
                    50,
                    this.stateSync,
                );
            }
            this.cagedCharacters.set(character.MemberNumber, {
                character,
                cageName,
                authoritativeExpiry,
            });

            this.logger.info("Cage entry persisted", {
                memberNumber: character.MemberNumber,
                cageName,
                enteredAtMs: enteredAt,
                durationMs,
                lockExpiryMs: authoritativeExpiry,
            });

            if (persisted !== false) {
                character.Tell(
                    "Whisper",
                    `(You are locked in the Futuristic Crate for ${durationString(durationMs)}.`,
                );
                this.logger.info("Cage entry notified", {
                    memberNumber: character.MemberNumber,
                    cageName,
                    notifiedAtMs: this.timer.now(),
                    durationMs,
                    lockExpiryMs: authoritativeExpiry,
                });
            }

            await this.releaseWhenExpired(character, cageName);
        });
    };

    private async releaseWhenExpired(
        character: API_Character,
        cageName: string,
    ): Promise<void> {
        const memberNumber = character.MemberNumber;
        let lastObservedLiveExpiry: number | undefined;
        while (this.cagedCharacters.has(memberNumber)) {
            const cage = this.cagedCharacters.get(memberNumber)!;
            const liveExpiry = this.getCageLockExpiry(character);
            if (
                liveExpiry !== undefined &&
                liveExpiry > cage.authoritativeExpiry
            ) {
                cage.authoritativeExpiry = liveExpiry;
                this.logger.info("Cage expiry extended", {
                    memberNumber,
                    cageName,
                    authoritativeExpiryMs: cage.authoritativeExpiry,
                    observedAtMs: this.timer.now(),
                });
            } else if (
                liveExpiry !== undefined &&
                liveExpiry < cage.authoritativeExpiry &&
                liveExpiry !== lastObservedLiveExpiry
            ) {
                this.logger.warn("Ignoring shortened or stale cage timer", {
                    memberNumber,
                    cageName,
                    authoritativeExpiryMs: cage.authoritativeExpiry,
                    liveExpiryMs: liveExpiry,
                    observedAtMs: this.timer.now(),
                });
            } else if (
                liveExpiry === undefined &&
                lastObservedLiveExpiry !== undefined
            ) {
                this.logger.warn(
                    "Cage timer is missing; retaining persisted expiry",
                    {
                        memberNumber,
                        cageName,
                        authoritativeExpiryMs: cage.authoritativeExpiry,
                        observedAtMs: this.timer.now(),
                    },
                );
            }
            lastObservedLiveExpiry = liveExpiry;

            const now = this.timer.now();
            if (now < cage.authoritativeExpiry) {
                await this.timer.wait(
                    Math.min(cage.authoritativeExpiry - now, 10 * 1000),
                );
                continue;
            }

            this.logger.info("Cage expiry detected", {
                memberNumber,
                cageName,
                authoritativeExpiryMs: cage.authoritativeExpiry,
                detectedExpiryAtMs: now,
            });
            if (
                character.Appearance.getItemData("ItemDevices")?.Name ===
                "FuturisticCrate"
            ) {
                await syncAppearanceMutation(
                    character,
                    () => {
                        character.Appearance.RemoveItem("ItemDevices");
                    },
                    50,
                    this.stateSync,
                );
            }
            if (
                character.Appearance.getItemData("ItemDevices")?.Name ===
                "FuturisticCrate"
            ) {
                this.logger.error("Cage release is pending crate removal", {
                    memberNumber,
                    cageName,
                    authoritativeExpiryMs: cage.authoritativeExpiry,
                    observedAtMs: this.timer.now(),
                });
                await this.timer.wait(10 * 1000);
                continue;
            }

            const removedAtMs = this.timer.now();
            this.logger.info("Cage crate removed", {
                memberNumber,
                cageName,
                removedAtMs,
                authoritativeExpiryMs: cage.authoritativeExpiry,
            });
            const persisted =
                await this.mutationService?.exitCage(memberNumber);
            this.cagedCharacters.delete(memberNumber);
            if (persisted !== false) {
                const persistedAtMs = this.timer.now();
                this.logger.info("Cage release persisted", {
                    memberNumber,
                    cageName,
                    removedAtMs,
                    persistedAtMs,
                    authoritativeExpiryMs: cage.authoritativeExpiry,
                });
                character.Tell(
                    "Whisper",
                    "(The Futuristic Crate unlocks and releases you.",
                );
                this.logger.info("Cage release notified", {
                    memberNumber,
                    cageName,
                    notifiedAtMs: this.timer.now(),
                    authoritativeExpiryMs: cage.authoritativeExpiry,
                });
            }
        }
    }

    private async recoverCagedCharacter(
        character: API_Character,
    ): Promise<void> {
        await this.monitor.run(character, async () => {
            let session = await this.mutationService?.getActiveCageSession(
                character.MemberNumber,
            );
            let assessment = classifyContainmentRecovery({
                activeSession: session,
                liveCrateExpiry: this.getLiveCageExpiry(character),
                liveCratePresent: this.isWearingCage(character),
            });
            this.recordRecoveryStatus(character.MemberNumber, assessment);

            if (assessment.classification === "not-contained") {
                return;
            }

            if (assessment.classification === "contained-live-expiry") {
                const enteredAt = this.timer.now();
                let persisted: boolean | undefined;
                try {
                    persisted = await this.mutationService?.enterCage(
                        character.MemberNumber,
                        "Recovered cage",
                        Math.max(0, assessment.selectedExpiry! - enteredAt),
                        character.MemberNumber,
                        enteredAt,
                    );
                } catch {
                    assessment = {
                        ...assessment,
                        classification: "reconciliation-failed",
                        selectedAction:
                            "retain the live crate and retry durable reconciliation",
                        operatorAction:
                            "Inspect the persistence failure before changing the device",
                    };
                    this.recordRecoveryStatus(
                        character.MemberNumber,
                        assessment,
                    );
                    this.logger.error(
                        "Cage recovery reconciliation failed",
                        undefined,
                        this.recoveryContext(
                            character.MemberNumber,
                            assessment,
                        ),
                    );
                    return;
                }
                if (persisted === false) {
                    session = await this.mutationService?.getActiveCageSession(
                        character.MemberNumber,
                    );
                    assessment = classifyContainmentRecovery({
                        activeSession: session,
                        liveCrateExpiry: this.getLiveCageExpiry(character),
                        liveCratePresent: this.isWearingCage(character),
                    });
                    this.recordRecoveryStatus(
                        character.MemberNumber,
                        assessment,
                    );
                    if (!session) {
                        assessment = {
                            ...assessment,
                            classification: "reconciliation-failed",
                            selectedAction:
                                "retain the live crate and retry durable reconciliation",
                            operatorAction:
                                "Inspect the concurrent cage mutation before changing the device",
                        };
                        this.recordRecoveryStatus(
                            character.MemberNumber,
                            assessment,
                        );
                    }
                } else if (persisted === true) {
                    session = await this.mutationService?.getActiveCageSession(
                        character.MemberNumber,
                    );
                    assessment = classifyContainmentRecovery({
                        activeSession: session,
                        liveCrateExpiry: this.getLiveCageExpiry(character),
                        liveCratePresent: this.isWearingCage(character),
                    });
                    this.recordRecoveryStatus(
                        character.MemberNumber,
                        assessment,
                    );
                } else if (persisted === undefined) {
                    assessment = {
                        ...assessment,
                        classification: "reconciliation-failed",
                        selectedAction:
                            "retain the live crate and retry durable reconciliation",
                        operatorAction:
                            "Restore the mutation service and reconcile the live crate session",
                    };
                    this.recordRecoveryStatus(
                        character.MemberNumber,
                        assessment,
                    );
                }
                if (
                    assessment.classification === "contained-live-expiry" ||
                    assessment.classification === "reconciliation-failed"
                ) {
                    if (assessment.classification === "reconciliation-failed") {
                        this.logger.error(
                            "Cage recovery reconciliation failed",
                            undefined,
                            this.recoveryContext(
                                character.MemberNumber,
                                assessment,
                            ),
                        );
                    } else {
                        this.logger.warn(
                            "Cage recovery reconciled live containment",
                            this.recoveryContext(
                                character.MemberNumber,
                                assessment,
                            ),
                        );
                    }
                }
            }

            if (assessment.classification === "contained-missing-expiry") {
                this.logger.warn(
                    "Cage recovery deferred because no authoritative expiry is available",
                    this.recoveryContext(character.MemberNumber, assessment),
                );
                this.logger.error("Cage recovery is fail-closed", undefined, {
                    ...this.recoveryContext(character.MemberNumber, assessment),
                });
                return;
            }

            if (
                assessment.classification === "reconciliation-failed" ||
                assessment.selectedExpiry === undefined
            ) {
                return;
            }

            const authoritativeExpiry = assessment.selectedExpiry;
            const liveCrate = this.isWearingCage(character);
            if (!liveCrate) {
                await syncAppearanceMutation(
                    character,
                    () => {
                        const crate = character.Appearance.AddItem(
                            AssetGet("ItemDevices", "FuturisticCrate"),
                        );
                        crate.SetCraft({
                            Name: `Veratown Futuristic Crate`,
                            Description: `A very interesting Crate, specially made for ${character} to ensure the wearer's safety.`,
                        });
                        crate.setProperty("TypeRecord", {
                            w: 2,
                            l: 3,
                            a: 3,
                            d: 1,
                            t: 1,
                            h: 4,
                        });
                        crate.setProperty("Mode", "Deny");
                        crate.lock(
                            "TimerPasswordPadlock",
                            character.MemberNumber,
                            {
                                Password: CRATE_LOCK_PASSWORD,
                                RemoveItem: true,
                                RemoveTimer: authoritativeExpiry,
                                ShowTimer: true,
                                LockSet: true,
                            },
                        );
                    },
                    50,
                    this.stateSync,
                );
                this.logger.info("Cage appearance reconciled", {
                    memberNumber: character.MemberNumber,
                    authoritativeExpiryMs: authoritativeExpiry,
                    recoveredAtMs: this.timer.now(),
                });
            }
            this.cagedCharacters.set(character.MemberNumber, {
                character,
                cageName: session?.cageName ?? "Unknown cage",
                authoritativeExpiry,
            });
            this.logger.info("Cage recovery armed", {
                memberNumber: character.MemberNumber,
                cageName: session?.cageName,
                authoritativeExpiryMs: authoritativeExpiry,
                classification: assessment.classification,
                recoveredAtMs: this.timer.now(),
            });
            await this.releaseWhenExpired(
                character,
                session?.cageName ?? "Unknown cage",
            );
        });
    }

    private recordRecoveryStatus(
        memberNumber: number,
        assessment: ContainmentRecoveryAssessment,
    ): void {
        containmentRecoveryStatuses.set(memberNumber, {
            ...assessment,
            memberNumber,
            observedAtMs: this.timer.now(),
        });
    }

    private recoveryContext(
        memberNumber: number,
        assessment: ContainmentRecoveryAssessment,
    ): Record<string, unknown> {
        return {
            memberNumber,
            persistenceState: assessment.persistenceState,
            liveAppearanceState: assessment.liveAppearanceState,
            candidateExpiries: assessment.candidateExpiries,
            selectedExpiryMs: assessment.selectedExpiry,
            selectedAction: assessment.selectedAction,
            operatorAction: assessment.operatorAction,
            classification: assessment.classification,
            observedAtMs: this.timer.now(),
        };
    }

    /**
     * Reads the actual RemoveTimer from the character's currently worn
     * ItemDevices item (the Futuristic Crate), so that any extensions or
     * reductions applied to the lock after it was first set are reflected.
     * Returns undefined if the character is no longer wearing a locked crate.
     */
    private getCageLockExpiry(character: API_Character): number | undefined {
        const expiry = this.getLiveCageExpiry(character);
        return typeof expiry === "number" && Number.isFinite(expiry)
            ? expiry
            : undefined;
    }

    private getLiveCageExpiry(character: API_Character): number | undefined {
        if (!this.isWearingCage(character)) return undefined;
        return character.Appearance.getItemData("ItemDevices")?.Property
            ?.RemoveTimer;
    }

    private isWearingCage(character: API_Character): boolean {
        return (
            character.Appearance.getItemData("ItemDevices")?.Name ===
            "FuturisticCrate"
        );
    }

    private onCharacterViewCageInformation = async (
        character: API_Character,
    ) => {
        if (this.cagedCharacters.size === 0) {
            character.Tell("Whisper", "All cages are currently empty.");
            return;
        }

        const info = Array.from(this.cagedCharacters.values())
            .map((c) => {
                return `${c.cageName}: ${c.character} - ${remainingTimeString(c.authoritativeExpiry)} remaining`;
            })
            .join("\n");

        character.Tell("Whisper", `Cage occupancy:\n${info}`);
    };
}
