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

import type {
    API_Connector,
    API_Character,
    BC_Server_ChatRoomMessage,
    CommandParser,
} from "bc-bot";
import { CommandSystemMessageFeatureSystem } from "../shared/commandSystemMessageFeatureSystem";
import type { GameStateMutationService } from "../shared/gameStateMutationService";
import type { UnifiedCharacterStore } from "../shared/unifiedCharacterStore";
import { syncAppearanceMutation } from "./shared/appearanceSync";
import type { KennelSystem } from "./kennelSystem";
import {
    KENNEL_DOOR_CLOSE_DELAY_MS,
    KENNEL_LOCK_MAX_DURATION_MS,
} from "./veratownConfig";

/**
 * Command controller for the Kennel feature system.
 *
 * Provides player-accessible commands:
 * - `/bot kennel lock <character> <minutes>` - Lock a higher-level character in the kennel
 * - `/bot kennel escape` - Unlock the kennel device and leave
 *
 * Follows the architectural principle of command handlers delegating state
 * mutations through GameStateMutationService and appearance changes through
 * syncAppearanceMutation.
 */
export class KennelCommandController extends CommandSystemMessageFeatureSystem {
    public constructor(
        conn: API_Connector,
        commandParser: CommandParser,
        private kennelSystem: KennelSystem,
        private mutationService?: GameStateMutationService,
        private characterStore?: UnifiedCharacterStore,
    ) {
        super(
            conn,
            commandParser,
            "kennel-commands",
            "Kennel Commands",
            () => kennelSystem.enabled,
        );
    }

    public registerCommands(): void {
        this.registerCommand("kennel", this.onCommandKennel);
    }

    protected isEnabled(): boolean {
        return this.kennelSystem.enabled;
    }

    private onCommandKennel = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (args.length === 0) {
            this.conn.reply(
                msg,
                "Usage: /bot kennel <lock|escape>\n" +
                    "- lock <character> <minutes> - Lock a character in the kennel (max 4 hours)\n" +
                    "- escape - Remove the kennel device and leave",
            );
            return;
        }

        const subcommand = args[0].toLowerCase();

        switch (subcommand) {
            case "lock":
                await this.onKennelLock(sender, msg, args.slice(1));
                break;
            case "escape":
                await this.onKennelEscape(sender, msg);
                break;
            default:
                this.conn.reply(
                    msg,
                    `Unknown kennel subcommand: ${subcommand}. Use 'lock' or 'escape'.`,
                );
        }
    };

    /**
     * Lock a character in the kennel for a specified duration.
     *
     * Requirements:
     * - Sender must have a higher level than the target
     * - Target must be currently wearing the kennel device
     * - Duration must be between 1 minute and 4 hours
     */
    private onKennelLock = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        // Validation: arguments
        if (args.length < 2) {
            this.conn.reply(
                msg,
                "Usage: /bot kennel lock <character> <minutes>\n" +
                    "Minutes must be between 1 and 240 (max 4 hours)",
            );
            return;
        }

        const targetName = args[0];
        const minutesStr = args[1];

        // Validation: duration
        const minutes = parseInt(minutesStr, 10);
        if (isNaN(minutes) || minutes < 1 || minutes > 240) {
            this.conn.reply(
                msg,
                `Invalid duration: ${minutesStr}. Must be 1-240 minutes (1 minute to 4 hours).`,
            );
            return;
        }

        // Find target character
        const target = this.conn.chatRoom?.findCharacter(targetName);
        if (!target) {
            this.conn.reply(msg, `I can't find ${targetName} in the room.`);
            return;
        }

        // Validation: sender has higher level than target
        try {
            const senderLevel =
                (
                    await this.characterStore?.getProgressionView(
                        sender.MemberNumber,
                    )
                )?.level ?? 1;
            const targetLevel =
                (
                    await this.characterStore?.getProgressionView(
                        target.MemberNumber,
                    )
                )?.level ?? 1;

            if (senderLevel <= targetLevel) {
                this.conn.reply(
                    msg,
                    `You must have a higher level than ${target.Name} to lock them in. ` +
                        `Your level: ${senderLevel}, their level: ${targetLevel}.`,
                );
                return;
            }
        } catch (error) {
            this.logger.error("Failed to check character levels", error, {
                senderMemberNumber: sender.MemberNumber,
                targetMemberNumber: target.MemberNumber,
            });
            this.conn.reply(
                msg,
                "Failed to verify your levels. Please try again.",
            );
            return;
        }

        // Validation: target is wearing kennel
        const kennelDevice = target.Appearance.getItemData("ItemDevices");
        if (kennelDevice?.Name !== "Kennel") {
            this.conn.reply(
                msg,
                `${target.Name} is not currently wearing the kennel device.`,
            );
            return;
        }

        // Apply the lock
        const durationMs = minutes * 60 * 1000;
        try {
            await syncAppearanceMutation(
                target,
                () => {
                    const kennel =
                        target.Appearance.InventoryGet("ItemDevices");
                    if (!kennel || kennel.Name !== "Kennel") {
                        throw new Error(
                            "Kennel device unavailable during lock",
                        );
                    }

                    // Set timerpasswordlock property on the kennel
                    // Format: seconds until unlock (from now)
                    const durationSeconds = Math.ceil(durationMs / 1000);
                    const setRuntimeProperty =
                        kennel.setProperty as unknown as (
                            property: string,
                            value: number,
                        ) => void;
                    setRuntimeProperty("timerPasswordLock", durationSeconds);
                },
                50,
                undefined,
                { throwOnSyncFailure: true },
            );

            this.logger.info("Kennel locked via command", {
                senderMemberNumber: sender.MemberNumber,
                senderName: sender.Name,
                targetMemberNumber: target.MemberNumber,
                targetName: target.Name,
                durationMinutes: minutes,
                durationSeconds: Math.ceil(durationMs / 1000),
            });

            this.conn.reply(
                msg,
                `${target.Name} has been locked in the kennel for ${minutes} minute${minutes !== 1 ? "s" : ""}.`,
            );
        } catch (error) {
            this.logger.error("Failed to apply kennel lock", error, {
                senderMemberNumber: sender.MemberNumber,
                targetMemberNumber: target.MemberNumber,
                durationMinutes: minutes,
            });
            this.conn.reply(
                msg,
                `Failed to lock ${target.Name} in the kennel. Please try again.`,
            );
        }
    };

    /**
     * Unlock and remove the kennel device.
     *
     * Only the character wearing the kennel can use this command.
     */
    private onKennelEscape = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
    ) => {
        // Validation: sender is wearing kennel
        const kennelDevice = sender.Appearance.getItemData("ItemDevices");
        if (kennelDevice?.Name !== "Kennel") {
            this.conn.reply(
                msg,
                "You are not currently wearing the kennel device.",
            );
            return;
        }

        try {
            this.kennelSystem.markEscaped(sender.MemberNumber);

            // Remove the kennel device
            await syncAppearanceMutation(
                sender,
                () => {
                    const kennel =
                        sender.Appearance.InventoryGet("ItemDevices");
                    if (kennel?.Name === "Kennel") {
                        sender.Appearance.RemoveItem("ItemDevices" as any);
                    }
                },
                50,
                undefined,
                { throwOnSyncFailure: true },
            );

            // Close the kennel session if one exists
            if (this.mutationService) {
                const activeSession =
                    await this.mutationService.getActiveKennelSession?.(
                        sender.MemberNumber,
                    );
                if (activeSession) {
                    await this.mutationService.exitKennel?.(
                        sender.MemberNumber,
                    );
                }
            }

            this.logger.info("Character escaped kennel via command", {
                memberNumber: sender.MemberNumber,
                characterName: sender.Name,
            });

            this.conn.reply(
                msg,
                "You have removed the kennel device and are now free to leave.",
            );
        } catch (error) {
            if (
                sender.Appearance.getItemData("ItemDevices")?.Name === "Kennel"
            ) {
                this.kennelSystem.clearEscape(sender.MemberNumber);
            }
            this.logger.error("Failed to escape kennel", error, {
                memberNumber: sender.MemberNumber,
            });
            this.conn.reply(
                msg,
                "Failed to remove the kennel device. Please try again or contact staff.",
            );
        }
    };
}
