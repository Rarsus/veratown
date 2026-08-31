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

import { wait, waitForCondition } from "../../hub/utils";
import { Casino, getItemsBlockingForfeit } from "../casino";
import {
    API_Character,
    API_Connector,
    BC_Server_ChatRoomMessage,
    API_AppearanceItem,
    AssetGet,
} from "bc-bot";
import { FORFEITS } from "./forfeits";
import { Bet, Game } from "./game";
import { ROULETTE_WHEEL } from "./rouletteWheelBundle";
import { BetValidator } from "./betValidator";
import { GameTimer } from "./gameTimer";
import { CommandValidator } from "../shared/commandValidator";

const ROULETTECOMMANDMESSAGE = `
Available commands:
/bot bet red <amount> - Bet on red. Odds: 1:1.
/bot bet black <amount> - Bet on black. Odds: 1:1.
/bot bet even <amount> - Bet on even. Odds: 1:1.
/bot bet odd <amount> - Bet on odd. Odds: 1:1.
/bot bet 1-18 <amount> - Bet on 1 - 18. Odds: 1:1.
/bot bet 19-36 <amount> - Bet on 19 - 36. Odds: 1:1.
/bot bet 1-12 <amount> - Bet on 1 - 12. Odds: 2:1.
/bot bet 13-24 <amount> - Bet on 13 - 24. Odds: 2:1.
/bot bet 25-36 <amount> - Bet on 25 - 36. Odds: 2:1.
/bot bet <number> <amount> - Bet on a single number. Odds: 35:1.
/bot cancel - Cancel your bet.
/bot chips - Show your current chip balance.
/bot give <name or member number> <amount> - Give chips to another player.
/bot help - Show this help
/bot commands - Show available commands.
/bot forfeits - Show available forfeits.
`;

const ROULETTEHELP = `
There are 37 numbers on the roulette wheel, 0 - 36. 0 is green.

${ROULETTECOMMANDMESSAGE}
`;

const ROULETTEEXAMPLES = `
/bot bet red 10
    bets 10 chips on red
/bot bet 15 legbinder
    bets the 'leg binder' forfeit (worth 7 chips) on number 15
`;

const TIME_UNTIL_SPIN_MS = 40000;
// const TIME_UNTIL_SPIN_MS = 6000;
const BET_CANCEL_THRESHOLD_MS = 3000;
// How long before the spin the table calls "Rien ne va plus!" and stops
// accepting new bets (cancellations are already blocked earlier, at
// BET_CANCEL_THRESHOLD_MS).
const LAST_CALL_THRESHOLD_MS = 10000;

type RouletteBetKind =
    | "single"
    | "red"
    | "black"
    | "even"
    | "odd"
    | "1-18"
    | "19-36"
    | "1-12"
    | "13-24"
    | "25-36";

export interface RouletteBet extends Bet {
    memberNumber: number;
    memberName: string;
    stake: number;
    stakeForfeit: string;
    kind: RouletteBetKind;
    number?: number;
}

export type Color = "Red" | "Black" | "Green";

export const rouletteColors: Color[] = [
    "Green", // 0
    "Red",
    "Black",
    "Red",
    "Black",
    "Red",
    "Black",
    "Red",
    "Black",
    "Red",
    "Black",
    "Black",
    "Red",
    "Black",
    "Red",
    "Black",
    "Red",
    "Black",
    "Red",
    "Red",
    "Black",
    "Red",
    "Black",
    "Red",
    "Black",
    "Red",
    "Black",
    "Red",
    "Black",
    "Black",
    "Red",
    "Black",
    "Red",
    "Black",
    "Red",
    "Black",
    "Red",
];

export class RouletteGame implements Game {
    private bets: RouletteBet[] = [];

    private willSpinAt: number | undefined;
    private spinTimer = new GameTimer();
    private resetTimer = new GameTimer();
    private lastCallAnnounced = false;
    private bettingOpen = true;
    private betValidator = new BetValidator();
    private commandValidator = new CommandValidator();

    public HELPMESSAGE = ROULETTEHELP;
    public EXAMPLES = ROULETTEEXAMPLES;
    public HELPCOMMANDMESSAGE = ROULETTEHELP;
    public COMMANDSMESSAGE = ROULETTECOMMANDMESSAGE;

    private casino: Casino;

    /**
     * Register Roulette-specific commands with the CommandParser.
     * Called by Casino after instantiation (follows plugin architecture principles).
     */
    public registerCommands(commandParser: CommandParser): void {
        commandParser.register("cancel", this.onCommandCancel);
        commandParser.register("bet", this.onCommandBet);
        commandParser.register("sign", (sender, msg, args) => {
            const sign = this.casino.getSign();

            sign.setProperty("OverridePriority", { Text: 63 });
            sign.setProperty("Text", "Place bets!");
            sign.setProperty("Text2", " ");
            this.casino.setTextColor("#ffffff");
        });
        commandParser.register("wheel", (sender, msg, args) => {
            this.getWheel();
        });
    }

    public constructor(
        private conn: API_Connector,
        casino: Casino,
    ) {
        this.casino = casino;

        // hack because otherwise an account update goes through after this item update and clears the text out
        setTimeout(() => {
            const wheel = this.getWheel();
            wheel.setProperty("Texts", [
                " ",
                " ",
                " ",
                " ",
                " ",
                " ",
                " ",
                " ",
            ]);

            const sign = this.casino.getSign();
            sign.setProperty("OverridePriority", { Text: 63 });
            sign.setProperty("Text", "Place bets!");
            sign.setProperty("Text2", " ");
            this.casino.setTextColor("#ffffff");

            this.casino.setBio().catch((e) => {
                console.error("Failed to set bio.", e);
            });

            this.conn.Player.setScriptPermissions(true, false);

            const scriptItem = this.conn.Player.Appearance.AddItem(
                AssetGet("ItemScript", "Script"),
            );
            scriptItem.setProperty("Hide", [
                "Height",
                "BodyUpper",
                "ArmsLeft",
                "ArmsRight",
                "HandsLeft",
                "HandsRight",
                "BodyLower",
                "HairFront",
                "HairBack",
                "Eyebrows",
                "Eyes",
                "Eyes2",
                "Mouth",
                "Nipples",
                "Pussy",
                "Pronouns",
                "Head",
                "Blush",
                "Fluids",
                "Emoticon",
                "ItemNeck",
                "ItemHead",
                "Cloth",
                "Bra",
                "Socks",
                "Shoes",
                "ClothAccessory",
                "Necklace",
                "ClothLower",
                "Panties",
                "Suit",
                "Gloves",
            ]);
        }, 500);
    }

    public parseBetCommand(
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ): RouletteBet | undefined {
        // Validate argument count (2 for Roulette: bet kind + stake)
        // Use CommandValidator for generic argument validation (Phase 2B consolidation)
        const argCountResult = this.commandValidator.validateArgumentCount(
            args,
            2,
            "!bet <color|range> <amount>",
        );
        if (!argCountResult.valid) {
            this.conn.reply(
                msg,
                argCountResult.message ||
                    "I couldn't understand that bet. Try, eg. /bot bet red 10 or /bot bet 1-12 boots",
            );
            return;
        }

        // Check for duplicate bets
        const notBetResult = this.betValidator.validateNotAlreadyBet(
            senderCharacter.MemberNumber,
            this.bets,
        );
        if (!notBetResult.valid) {
            this.conn.reply(
                msg,
                notBetResult.message ||
                    "You already placed a bet. Use !cancel to cancel it.",
            );
            return;
        }

        const betKind = args[0].toLowerCase();

        // Validate and parse stake
        const stakeResult = this.betValidator.validateStake(args[1]);
        if (!stakeResult.valid) {
            this.conn.reply(msg, stakeResult.message || "Invalid stake.");
            return;
        }

        // If it's a forfeit, validate that it exists
        if (stakeResult.stakeForfeit) {
            const forfeitExistsResult = this.betValidator.validateForfeitExists(
                stakeResult.stakeForfeit,
            );
            if (!forfeitExistsResult.valid) {
                this.conn.reply(
                    msg,
                    forfeitExistsResult.message ||
                        "That forfeit doesn't exist.",
                );
                return;
            }
        }

        const stakeValue = stakeResult.stake!;
        const stakeForfeit = stakeResult.stakeForfeit || undefined;

        switch (betKind) {
            case "red":
            case "black":
            case "even":
            case "odd":
            case "1-18":
            case "19-36":
            case "1-12":
            case "13-24":
            case "25-36":
                return {
                    memberNumber: senderCharacter.MemberNumber,
                    memberName: senderCharacter.toString(),
                    stake: stakeValue,
                    stakeForfeit,
                    kind: betKind,
                };
            default:
                // single number: ensure it's actually a number
                if (!/^\d+$/.test(betKind)) {
                    this.conn.reply(msg, "Invalid bet.");
                    return;
                }
                const betNumber = parseInt(betKind, 10);
                if (isNaN(betNumber) || betNumber < 0 || betNumber > 36) {
                    this.conn.reply(msg, "Invalid bet.");
                    return;
                }
                return {
                    memberNumber: senderCharacter.MemberNumber,
                    memberName: senderCharacter.toString(),
                    stake: stakeValue,
                    stakeForfeit,
                    kind: "single",
                    number: betNumber,
                };
        }
    }

    public placeBet(bet: RouletteBet): void {
        this.bets.push(bet);
        if (bet.stakeForfeit) {
            if (bet.kind === "single") {
                this.conn.SendMessage(
                    "Chat",
                    `${bet.memberName} bets ${FORFEITS[bet.stakeForfeit].name} for ${bet.stake} chips on ${bet.number}`,
                );
            } else {
                this.conn.SendMessage(
                    "Chat",
                    `${bet.memberName} bets ${FORFEITS[bet.stakeForfeit].name} for ${bet.stake} chips on ${bet.kind}`,
                );
            }
        } else {
            if (bet.kind === "single") {
                this.conn.SendMessage(
                    "Chat",
                    `${bet.memberName} bets ${bet.stake} chips on ${bet.number}`,
                );
            } else {
                this.conn.SendMessage(
                    "Chat",
                    `${bet.memberName} bets ${bet.stake} chips on ${bet.kind}`,
                );
            }
        }
    }

    onCommandBet = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.bettingOpen) {
            this.conn.reply(
                msg,
                "The casino is currently closed. Please check back later!",
            );
            return;
        }

        if (
            this.willSpinAt !== undefined &&
            this.willSpinAt - Date.now() <= LAST_CALL_THRESHOLD_MS
        ) {
            this.conn.reply(
                msg,
                "Rien ne va plus! No more bets for this round.",
            );
            return;
        }

        const bet = this.parseBetCommand(sender, msg, args);
        if (bet === undefined) {
            return;
        }

        const casinoView = await this.casino
            .getUnifiedStore()
            .getCasinoView(sender.MemberNumber);

        if (bet.stakeForfeit === undefined) {
            if ((casinoView?.chips || 0) - bet.stake < 0) {
                this.conn.reply(msg, `You don't have enough chips.`);
                return;
            }

            await this.casino
                .getUnifiedStore()
                .updateChips(sender.MemberNumber, -bet.stake, "roulette_bet", 0);
        } else {
            const blockers = getItemsBlockingForfeit(
                sender,
                FORFEITS[bet.stakeForfeit].items(sender),
            );
            if (blockers.length > 0) {
                console.log(
                    `Blocked forfeit bet of ${bet.stakeForfeit} with blockers `,
                    blockers,
                );
                this.conn.reply(
                    msg,
                    `You can't bet that while you have: ${blockers.map((i) => i.Name).join(", ")}`,
                );
                return;
            }

            const canInteract = await sender.GetAllowItem();
            if (!canInteract) {
                this.conn.reply(
                    msg,
                    "You'll need to open up your permissions or whitelist the bot to bet restraints.",
                );
                return;
            }

            const needItems = [...FORFEITS[bet.stakeForfeit].items(sender)];
            if (FORFEITS[bet.stakeForfeit].lock)
                needItems.push(FORFEITS[bet.stakeForfeit].lock);
            const blocked = needItems.filter(
                (i) => !sender.IsItemPermissionAccessible(i),
            );
            if (blocked.length > 0) {
                this.conn.reply(
                    msg,
                    `You can't bet that forfeit because you've blocked: ${blocked.map((i) => i.Name).join(", ")}.`,
                );
                return;
            }

            bet.stake *= this.casino.multiplier;
        }

        if (FORFEITS[bet.stakeForfeit]?.items(sender).length === 1) {
            const forfeitItem = FORFEITS[bet.stakeForfeit].items(sender)[0];
            if (
                Date.now() <
                this.casino.lockedItems
                    .get(sender.MemberNumber)
                    ?.get(forfeitItem.Group)
            ) {
                console.log(
                    `CHEATER DETECTED: ${sender} tried to bet ${bet.stakeForfeit} which should be locked`,
                );
                
                // Fetch current casino view to get cheat strikes
                const casinoView = await this.casino
                    .getUnifiedStore()
                    .getCasinoView(sender.MemberNumber);
                
                // Increment cheat strikes via the casino punishment system
                this.casino.cheatPunishment(sender, {
                    cheatStrikes: (casinoView?.cheatStrikes || 0) + 1,
                } as any);

                return;
            }
        }

        this.placeBet(bet);

        if (this.willSpinAt === undefined) {
            if (this.resetTimer.isActive()) {
                this.resetTimer.clear();
            }

            this.lastCallAnnounced = false;
            this.willSpinAt = Date.now() + TIME_UNTIL_SPIN_MS;
            this.spinTimer.start(
                1000,
                () => {
                    this.onSpinTimeout();
                },
                true,
            );
        }
    };

    onCommandCancel = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (this.getBetsForPlayer(sender.MemberNumber).length === 0) {
            this.conn.reply(msg, "You don't have a bet in play.");
            return;
        }

        const timeLeft = this.willSpinAt - Date.now();
        if (timeLeft <= BET_CANCEL_THRESHOLD_MS) {
            this.conn.reply(msg, "You can't cancel your bet now.");
            return;
        }
        if (this.getBetsForPlayer(sender.MemberNumber)[0].stakeForfeit) {
            // Refund forfeit bets using UnifiedCharacterStore
            const refundAmount = this.getBetsForPlayer(sender.MemberNumber).reduce(
                (sum, b) => sum + b.stake,
                0,
            );
            await this.casino
                .getUnifiedStore()
                .updateChips(
                    sender.MemberNumber,
                    refundAmount,
                    "roulette_bet_cancel",
                    0,
                );
        }

        this.clearBetsForPlayer(sender.MemberNumber);
        this.conn.reply(msg, "Bet cancelled.");
    };

    public textForBet(bet: RouletteBet): string {
        if (bet.kind === "single") {
            return "" + bet.number;
        } else {
            return bet.kind;
        }
    }

    public generateWinningNumber(): number {
        return Math.floor(Math.random() * 37);
    }

    public getWinningNumberText(winningNumber: number, emoji = false): string {
        let text = `${winningNumber}`;
        if (winningNumber === 0) {
            if (emoji) text += " 🟩";
        } else {
            const color = rouletteColors[winningNumber];
            if (color === "Red") {
                text += " red";
                if (emoji) text += " 🟥";
            } else if (color === "Black") {
                text += " black";
                if (emoji) text += " ⬛";
            }
        }

        return text;
    }

    public getBets(): RouletteBet[] {
        return this.bets;
    }

    public getBetsForPlayer(memberNumber: number): RouletteBet[] {
        return this.bets.filter((b) => b.memberNumber === memberNumber);
    }

    public clearBetsForPlayer(memberNumber: number): undefined {
        this.bets = this.bets.filter((b) => b.memberNumber !== memberNumber);
    }

    private getWinnings(winningNumber: number, bet: RouletteBet): number {
        if (bet.kind === "single" && bet.number === winningNumber) {
            return bet.stake * 36;
        } else if (
            (bet.kind === "red" && rouletteColors[winningNumber] == "Red") ||
            (bet.kind === "black" &&
                rouletteColors[winningNumber] == "Black") ||
            (bet.kind === "even" &&
                winningNumber !== 0 &&
                winningNumber % 2 === 0) ||
            (bet.kind === "odd" && winningNumber % 2 === 1) ||
            (bet.kind === "1-18" &&
                winningNumber >= 1 &&
                winningNumber <= 18) ||
            (bet.kind === "19-36" && winningNumber >= 19 && winningNumber <= 36)
        ) {
            return bet.stake * 2;
        } else if (
            (bet.kind === "1-12" &&
                winningNumber >= 1 &&
                winningNumber <= 12) ||
            (bet.kind === "13-24" &&
                winningNumber >= 13 &&
                winningNumber <= 24) ||
            (bet.kind === "25-36" && winningNumber >= 25 && winningNumber <= 36)
        ) {
            return bet.stake * 3;
        }
    }

    public clear(): void {
        this.bets = [];
    }

    private onSpinTimeout(): void {
        if (!this.willSpinAt) return;

        const sign = this.casino.getSign();

        const timeLeft = this.willSpinAt - Date.now();
        if (timeLeft <= 0) {
            sign.Extended.SetText("");
            sign.setProperty("Text2", "");

            this.spinTimer.clear();
            this.spinWheel().catch((e) => {
                console.error("Failed to spin wheel.", e);
            });
        } else {
            if (timeLeft <= LAST_CALL_THRESHOLD_MS && !this.lastCallAnnounced) {
                this.lastCallAnnounced = true;
                this.conn.SendMessage("Chat", "Rien ne va plus! No more bets.");
            }

            this.casino.setTextColor("#ffffff");
            sign.setProperty("Text2", `${Math.ceil(timeLeft / 1000)}`);
        }
    }

    private async spinWheel(): Promise<void> {
        const wheel = this.getWheel();
        const prevAngle = wheel.getData().Property.TargetAngle;

        const winningNumber = this.generateWinningNumber();

        const prevSection = Math.ceil(prevAngle / (360 / 8));
        let targetSection;
        if ([0, 2, 4, 6].includes(prevSection)) {
            // If it is on red
            targetSection =
                prevSection + (rouletteColors[winningNumber] === "Red" ? 2 : 1);
        } else {
            // if it is on black
            targetSection =
                prevSection +
                (rouletteColors[winningNumber] === "Black" ? 2 : 1);
        }
        if (winningNumber === 0) {
            if (prevSection === 0) {
                targetSection = 7.5;
            } else {
                targetSection = 0.5;
            }
        }
        const targetAngle = (targetSection * 45 - 22.5) % 360;

        console.log(`Winning number: ${winningNumber}`);
        console.log(`Prev angle: ${prevAngle}`);
        console.log(`Prev section: ${prevSection}`);
        console.log(`Target section: ${targetSection}`);
        console.log(`Target angle: ${targetAngle}`);
        console.log(`Spinning wheel from ${prevAngle} to ${targetAngle}`);

        wheel.setProperty("TargetAngle", targetAngle);

        await wait(10000);

        this.resetTimer.start(12000, () => {
            sign.setProperty("Text", "Place bets!");
            sign.setProperty("Text2", " ");
            this.willSpinAt = undefined;
        });

        let message = `${this.getWinningNumberText(winningNumber, true)} wins.`;

        const sign = this.casino.getSign();
        sign.setProperty("Text", this.getWinningNumberText(winningNumber));
        sign.setProperty("Text2", "");

        await wait(2000);

        for (const bet of this.getBets()) {
            let winnings = this.getWinnings(winningNumber, bet);
            if (winnings > 0) {
                // Update chips using unified store (Phase 5 direct access)
                await this.casino
                    .getUnifiedStore()
                    .updateChips(bet.memberNumber, winnings, "roulette_win", 0);

                message += `\n${bet.memberName} wins ${winnings} chips!`;
            } else if (bet.stakeForfeit) {
                this.casino.applyForfeit(bet);
                message += `\n${bet.memberName} lost and gets: ${FORFEITS[bet.stakeForfeit].name}!`;
            }
        }

        this.casino.multiplier = 1;

        this.conn.SendMessage("Chat", message);

        this.clear();
        await this.casino.setBio();
    }

    public getWheel(): API_AppearanceItem {
        const wheel = this.conn.Player.Appearance.InventoryGet("ItemDevices");
        this.conn.Player.Appearance.applyBundle(ROULETTE_WHEEL);
        return this.conn.Player.Appearance.InventoryGet("ItemDevices");
    }

    public isBettingOpen(): boolean {
        return this.bettingOpen;
    }

    public reopenBetting(): void {
        this.bettingOpen = true;
    }

    public async closeBetting(): Promise<void> {
        // If a round just finished, wait for its post-round cooldown to
        // clear before deciding whether we need to force one final round.
        await waitForCondition(() => !this.resetTimer.isActive());

        if (this.willSpinAt === undefined) {
            // No round in progress: run one final round so there's a genuine
            // last round to bet on rather than closing immediately.
            this.lastCallAnnounced = false;
            this.willSpinAt = Date.now() + TIME_UNTIL_SPIN_MS;
            this.spinTimer.start(
                1000,
                () => {
                    this.onSpinTimeout();
                },
                true,
            );
        }

        await waitForCondition(() => this.willSpinAt === undefined);
        await waitForCondition(() => !this.resetTimer.isActive());

        this.bettingOpen = false;
    }

    async endGame(): Promise<void> {
        await waitForCondition(() => this.willSpinAt === undefined);
        await wait(2000);
        this.casino.commandParser.unregister("cancel");
        this.casino.commandParser.unregister("bet");
        this.casino.commandParser.unregister("sign");
        this.casino.commandParser.unregister("wheel");
        this.clear();
    }
}
