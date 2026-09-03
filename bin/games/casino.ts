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

import { Db } from "mongodb";
import {
    API_Connector,
    CommandParser,
    API_Character,
    ItemPermissionLevel,
    MapRegion,
    BC_Server_ChatRoomMessage,
    API_AppearanceItem,
    AssetGet,
    BC_AppearanceItem,
    importBundle,
} from "bc-bot";
import { RouletteGame } from "./casino/roulette";
import { generatePassword, remainingTimeString } from "../utils";
import {
    FORFEITS,
    forfeitsString,
    restraintsRemoveString,
    SERVICES,
    servicesString,
} from "./casino/forfeits";
import { Cocktail, COCKTAILS } from "./casino/cocktails";
import { Bet, Game } from "./casino/game";
import { BlackjackGame } from "./casino/blackjack";
import { ForfeitService } from "./casino/forfeitService";
import { BioManager } from "./casino/bioManager";
import {
    VeratownLocationStore,
    VeratownLocationDoc,
} from "./veratown/veratownLocationStore";
import { loadRegionFromDatabase } from "./shared/locationUtils";
import { VeratownFeatureSystem, guardHandler } from "./veratown/featureSystem";
import { UnifiedCharacterStore } from "./shared/unifiedCharacterStore";
import type { GamePlugin, GamePluginCommandRouter } from "./shared/gamePlugin";
import { createLogger } from "../logging";
import { DIContainer, DIServiceKeys } from "../di/container";

const logger = createLogger("Casino");

const FREE_CHIPS = 20;

export function getItemsBlockingForfeit(
    char: API_Character,
    items: BC_AppearanceItem[],
): API_AppearanceItem[] {
    const slots = new Set(items.map((i) => i.Group));

    return char.Appearance.Appearance.filter((i) => slots.has(i.Group));
}

export const makeBio = (
    leaderBoard: string,
    exampleString: string,
    helpString: string,
) => {
    // Delegate to BioManager for bio building
    const bioManager = new BioManager();
    return bioManager.buildBio(leaderBoard, exampleString, helpString);
};

export interface CasinoConfig {
    cocktail?: string;
    game?: "roulette" | "blackjack";

    // If set, commands are only processed while the sender is standing
    // within this map region, and entering characters are told that
    // gambling is available here and given a quick rules explanation.
    region?: MapRegion;

    // Location store and fallback config for database-backed region loading
    locationStore?: VeratownLocationStore;
    fallbackLocations?: VeratownLocationDoc[];
}

export class Casino implements GamePlugin {
    public readonly key = "casino";
    public readonly label = "Casino";
    public readonly critical = false;
    public enabled = true;

    private game: Game;
    private commandParser?: CommandParser;
    public unifiedStore: UnifiedCharacterStore;
    private cocktailOfTheDay: Cocktail | undefined;
    public multiplier = 1;
    public lockedItems: Map<number, Map<AssetGroupName, number>> = new Map();
    private gameRegion?: MapRegion;
    private forfeitService: ForfeitService;

    /**
     * Phase 5: Direct UnifiedCharacterStore access (no adapters)
     * Returns the unified store for direct access to character state
     */
    public getUnifiedStore(): UnifiedCharacterStore {
        return this.unifiedStore;
    }

    public constructor(
        private conn: API_Connector,
        db: Db,
        config?: CasinoConfig,
        commandParser?: CommandParser,
        container?: DIContainer,
    ) {
        this.unifiedStore = container
            ? (container.has(DIServiceKeys.UNIFIED_CHARACTER_STORE)
                  ? container.get<UnifiedCharacterStore>(DIServiceKeys.UNIFIED_CHARACTER_STORE)
                  : new UnifiedCharacterStore(db))
            : global.unifiedCharacterStore || new UnifiedCharacterStore(db);

        // If no CommandParser provided, create one for this casino instance
        // Bound to the connector passed in (typically conn3 for casino)
        if (!commandParser) {
            // Create CommandParser scoped to the casino region
            // region parameter: only handle commands from senders IN this region
            this.commandParser = new CommandParser(
                this.conn,
                config?.region,
                undefined,
            );
        } else {
            this.commandParser = commandParser;
        }

        this.game =
            config?.game === "blackjack"
                ? new BlackjackGame(conn, this)
                : new RouletteGame(conn, this);

        // Register game-specific commands (separate from constructor to follow plugin architecture)
        this.game.registerCommands(this.commandParser!);

        this.forfeitService = new ForfeitService();

        if (config?.cocktail) {
            this.cocktailOfTheDay = COCKTAILS[config.cocktail];
            if (this.cocktailOfTheDay === undefined) {
                throw new Error(`Unknown cocktail: ${config.cocktail}`);
            }
        }

        this.conn.setItemPermission(ItemPermissionLevel.OwnerOnly);

        // Store config for later use in registerTriggers
        this.gameConfig = config;
    }

    /**
     * Get the unified store (Phase 5+: direct unified access)
     * Returns a wrapper object with the methods Casino needs
     */
    private getStore() {
        return {
            getTopPlayers: this.getTopPlayers.bind(this),
            getUnredeemedPurchases: this.getUnredeemedPurchases.bind(this),
            setPlayerName: this.setPlayerName.bind(this),
            getPlayer: this.getPlayer.bind(this),
            savePlayer: this.savePlayer.bind(this),
            addCredits: this.addCredits.bind(this),
            saveOutfit: this.saveOutfit.bind(this),
            addPurchase: this.addPurchase.bind(this),
            claimDailyFreeChips: this.claimDailyFreeChips.bind(this),
            transferCredits: this.transferCredits.bind(this),
        };
    }

    /**
     * Wrapper methods for Casino operations using UnifiedCharacterStore
     */
    private async getTopPlayers(limit: number = 50): Promise<any[]> {
        const profiles = await this.unifiedStore.getLeaderboard(limit);
        return profiles.map((p) => ({
            name: p.name,
            memberNumber: p._id,
            score: p.casino?.score || 0,
            credits: p.casino?.chips || 0,
        }));
    }

    private async getUnredeemedPurchases(): Promise<any[]> {
        // Query game events for unredeemed purchases
        const events = await this.unifiedStore.getUnprocessedEvents("casino");
        return events
            .filter((e) => e.data?.redeemed === false)
            .map((e) => ({
                memberNumber: e.target,
                purchaseId: e.data?.purchaseId,
                items: e.data?.items || [],
            }));
    }

    private async setPlayerName(
        memberNumber: number,
        name: string,
    ): Promise<void> {
        await this.unifiedStore.updateCharacterName(memberNumber, name);
    }

    private async getPlayer(memberNumber: number): Promise<any> {
        const profile = await this.unifiedStore.getProfile(memberNumber);
        return {
            memberNumber: profile._id,
            name: profile.name,
            credits: profile.casino?.chips || 0,
            score: profile.casino?.score || 0,
        };
    }

    private async savePlayer(player: any): Promise<void> {
        // Update chip balance if changed
        if (player.credits !== undefined) {
            const current = await this.unifiedStore.getCasinoView(
                player.memberNumber,
            );
            const delta = player.credits - (current?.chips || 0);
            if (delta !== 0) {
                await this.unifiedStore.updateChips(
                    player.memberNumber,
                    delta,
                    "save_player_update",
                    0,
                );
            }
        }
        // Update casino stats if provided
        if (player.score !== undefined) {
            await this.unifiedStore.updateCasinoStats(player.memberNumber, {
                score: player.score,
                totalWins: player.totalWins || 0,
                totalLosses: player.totalLosses || 0,
            });
        }
    }

    private async addCredits(
        memberNumber: number,
        amount: number,
    ): Promise<void> {
        await this.unifiedStore.updateChips(
            memberNumber,
            amount,
            "casino_credit",
            0,
        );
    }

    private async saveOutfit(_outfit: any): Promise<void> {
        // Outfits are managed by appearance system, not casino store
        // This is a no-op in the unified architecture
    }

    private async addPurchase(purchase: any): Promise<void> {
        // Record purchase as an event
        await this.unifiedStore.recordEvent({
            memberNumber: purchase.memberNumber,
            type: "casino_purchase",
            timestamp: Date.now(),
            data: purchase,
        } as any);
    }

    private async claimDailyFreeChips(memberNumber: number): Promise<boolean> {
        const profile = await this.unifiedStore.getProfile(memberNumber);
        const lastClaimTime = profile.casino?.lastDailyClaimAt || 0;
        const now = Date.now();
        const dayInMs = 24 * 60 * 60 * 1000;

        if (now - lastClaimTime < dayInMs) {
            return false;
        }

        // Award free chips
        await this.unifiedStore.updateChips(
            memberNumber,
            FREE_CHIPS,
            "daily_free_chips",
            0,
        );
        return true;
    }

    private async transferCredits(
        fromMemberNumber: number,
        toMemberNumber: number,
        amount: number,
    ): Promise<boolean> {
        const fromProfile =
            await this.unifiedStore.getCasinoView(fromMemberNumber);
        if (!fromProfile || fromProfile.chips < amount) {
            return false;
        }

        // Deduct from sender
        await this.unifiedStore.updateChips(
            fromMemberNumber,
            -amount,
            "transfer_out",
            0,
        );
        // Add to receiver
        await this.unifiedStore.updateChips(
            toMemberNumber,
            amount,
            "transfer_in",
            0,
        );
        return true;
    }

    /**
     * Initialize the Casino plugin. Called once during bot startup.
     */
    public async init(): Promise<void> {
        // Casino doesn't need special async initialization
        // Stores are initialized in constructor
    }

    /**
     * Register Casino commands via the GamePluginCommandRouter.
     * Called during Veratown plugin initialization.
     */
    public registerCommands(router: GamePluginCommandRouter): void {
        router.registerGroup("casino", {
            help: this.onCommandHelp,
            forfeits: this.onCommandForfeits,
            commands: this.onCommandCommands,
            chips: this.onCommandChips,
            addfriend: this.onCommandAddFriend,
            remove: this.onCommandRemove,
            buy: this.onCommandBuy,
            vouchers: this.onCommandVouchers,
            give: this.onCommandGive,
            grant: this.onCommandGrant,
            close: this.onCommandClose,
            open: this.onCommandOpen,
            bonus: this.onCommandBonusRound,
            game: this.onCommandGame,
            escape: this.onCommandEscape,
        });
    }

    /**
     * Get current Casino status.
     * Used for diagnostics and monitoring.
     */
    public getStatus(): string {
        return `Casino: ${this.enabled ? "enabled" : "disabled"} | Multiplier: ${this.multiplier}x`;
    }

    /**
     * Cleanup when the plugin is being stopped.
     */
    public async cleanup?(): Promise<void> {
        // Additional cleanup as needed
    }

    // Store config for registerTriggers method
    private gameConfig?: CasinoConfig;

    /**
     * Registers casino event listeners and triggers.
     * Called once during Veratown startup after registerCommands().
     * Note: Command registration happens in registerCommands() via GamePluginCommandRouter.
     */
    public registerTriggers(): void {
        if (this.gameConfig?.region && this.conn) {
            this.conn!.chatRoom!.map.addEnterRegionTrigger(
                this.gameConfig.region,
                guardHandler(
                    "casino:enterRegion",
                    this.onCharacterEnterCasinoRegion,
                ),
            );
        }

        // Load game region from database if location store is available
        if (
            this.gameConfig?.locationStore &&
            this.gameConfig?.fallbackLocations &&
            !this.gameConfig?.region
        ) {
            this.loadGameRegion(
                this.gameConfig.locationStore,
                this.gameConfig.fallbackLocations,
            );
        }

        this.conn?.on(
            "CharacterEntered",
            guardHandler("casino:characterEntered", this.onCharacterEntered),
        );
        this.conn?.on("Beep", (msg) =>
            guardHandler("casino:beep", this.onBeep)(msg),
        );
    }

    private onCharacterEntered = async (character: API_Character) => {
        if (!this.enabled) return;

        await this.getStore().setPlayerName(
            character.MemberNumber,
            character.toString(),
        );

        const granted = await this.getStore().claimDailyFreeChips(
            character.MemberNumber,
        );

        if (granted) {
            character.Tell(
                "Whisper",
                `Welcome to the Casino, ${character}! Here are your ${FREE_CHIPS} free chips for today. See my bio for how to play. Good luck!`,
            );
        } else {
            const player = await this.getStore().getPlayer(
                character.MemberNumber,
            );
            const dayInMs = 24 * 60 * 60 * 1000;
            const lastClaimTime = player.lastFreeCredits || 0;
            const nextFreeCreditsAt = lastClaimTime + dayInMs;
            character.Tell(
                "Whisper",
                `Welcome back, ${character}. ${remainingTimeString(nextFreeCreditsAt)} until your next free chips. See my bio for how to play.`,
            );
        }
    };

    private async loadGameRegion(
        locationStore: VeratownLocationStore,
        fallbackLocations: VeratownLocationDoc[],
    ): Promise<void> {
        this.gameRegion = await loadRegionFromDatabase(
            locationStore,
            "game_region",
            fallbackLocations,
        );

        if (this.gameRegion && this.conn) {
            // Register enter trigger with loaded region
            this.conn!.chatRoom!.map.addEnterRegionTrigger(
                this.gameRegion,
                this.onCharacterEnterCasinoRegion,
            );
        }

        logger.info(
            `Loaded game region: ${this.gameRegion ? "from database" : "using config or none"}`,
        );
    }

    private onCharacterEnterCasinoRegion = async (character: API_Character) => {
        if (!this.enabled) return;

        // this.game.HELPMESSAGE already includes the commands list (see
        // ROULETTEHELP/FULLBLACKJACKHELP), so don't also append
        // COMMANDSMESSAGE here or the commands get printed twice.
        character.Tell(
            "Whisper",
            `(Gambling is allowed in this part of town! ${this.game.HELPMESSAGE}`,
        );
    };

    private onBeep = (beep: ServerAccountBeepResponse) => {
        if (!this.enabled) return;

        if (
            beep.Message.includes("TypingStatus") ||
            beep.Message.includes("ReqRoom")
        ) {
            return;
        }
        try {
            if (beep.Message?.startsWith("outfit add")) {
                const parts = beep.Message.split(" ");
                if (parts.length < 4) {
                    this.conn.AccountBeep(
                        beep.MemberNumber,
                        "",
                        "Usage: outfit add <name> <code>",
                    );
                    return;
                }
                const code = parts[parts.length - 1];
                const name = parts.slice(2, parts.length - 1).join(" ");

                try {
                    const outfit = importBundle(code);
                    this.getStore().saveOutfit({
                        name,
                        addedBy: beep.MemberNumber,
                        addedByName: beep.MemberName,
                        items: outfit,
                    });
                    this.conn.AccountBeep(
                        beep.MemberNumber,
                        "",
                        `Outfit ${name} added, thank you!`,
                    );
                } catch (e) {
                    this.conn.AccountBeep(
                        beep.MemberNumber,
                        "",
                        "Invalid outfit code",
                    );
                    return;
                }
            } else if (beep.Message?.startsWith("end game")) {
                if (!this.game) {
                    this.conn.AccountBeep(
                        beep.MemberNumber,
                        "",
                        "No game is currently running.",
                    );
                    return;
                }
                this.conn.AccountBeep(beep.MemberNumber, "", "Ending game...");
                this.conn.SendMessage(
                    "Chat",
                    `This is the last round, the game ends after.`,
                );
                this.game.endGame().then(() => {
                    if (!this.conn || !this.commandParser) return;
                    this.conn.AccountBeep(beep.MemberNumber, "", "Game ended.");
                    this.conn.SendMessage(
                        "Chat",
                        `The game has ended, thank you for playing!`,
                    );
                    this.commandParser.unregisterAll();
                });
            } else {
                logger.debug(
                    `Received beep: ${beep.Message} from ${beep.MemberName} (${beep.MemberNumber})`,
                    {
                        memberNumber: beep.MemberNumber,
                        memberName: beep.MemberName,
                    },
                );
                this.conn.AccountBeep(beep.MemberNumber, "", "Unknown command");
            }
        } catch (e) {
            logger.error("Failed to process beep", e);
        }
    };

    private onCommandHelp = (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.enabled || !this.conn) return;
        this.conn.reply(msg, this.game?.HELPCOMMANDMESSAGE || "");
    };

    private onCommandForfeits = (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.enabled) return;
        let text = `Forfeit Table
Restraints are for 20 minutes, unless otherwise stated.

${forfeitsString()}
`;
        this.conn.reply(msg, text);
    };

    private onCommandCommands = (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.enabled) return;
        this.conn.reply(msg, this.game.COMMANDSMESSAGE);
    };

    private onCommandChips = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.enabled || !this.conn) return;

        if (args.length > 0) {
            if (!sender.IsRoomAdmin()) {
                this.conn.reply(
                    msg,
                    "Only admins can see other people's balances.",
                );
                return;
            }

            const target = this.conn?.chatRoom?.findCharacter(args[0]);
            if (!target) {
                this.conn.reply(msg, "I can't find that person.");
                return;
            }
            const player = await this.getStore().getPlayer(target.MemberNumber);
            this.conn.reply(msg, `${target} has ${player.credits} chips.`);
        } else {
            const player = await this.getStore().getPlayer(sender.MemberNumber);
            this.conn.reply(
                msg,
                `${sender}, you have ${player.credits} chips.`,
            );
        }
    };

    public async setBio(): Promise<void> {
        const topPlayers = await this.getStore().getTopPlayers(50);
        const unredeemed = await this.getStore().getUnredeemedPurchases();

        this.conn.setBotDescription(
            makeBio(
                topPlayers
                    .map((player, idx) => {
                        return `${idx + 1}. ${player.name} (${player.memberNumber}): ${player.score} chips won`;
                    })
                    .join("\n"),
                this.game.EXAMPLES,
                this.game.HELPMESSAGE,
            ),
        );
    }

    private onCommandAddFriend = (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.conn) return;
        if (!sender.IsRoomAdmin()) {
            this.conn.reply(msg, "Sorry, you need to be an admin");
            return;
        }

        if (args.length < 1) {
            this.conn.reply(msg, "Please specify a member number.");
            return;
        }

        const toAdd = this.conn?.chatRoom?.findCharacter(args[0]);
        if (!toAdd) {
            this.conn.reply(msg, "I can't find that person");
            return;
        }

        toAdd.friend();

        this.conn.reply(msg, `I am now friends with ${toAdd}! I like friends!`);
    };

    private onCommandRemove = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (args.length < 1) {
            this.conn.reply(msg, "Usage: /bot remove <restraint>");
            return;
        }

        const restraintName = args[0].toLowerCase();
        const restraint = FORFEITS[restraintName];
        if (!restraint) {
            this.conn.reply(msg, "Unknown restraint.");
            return;
        }

        const player = await this.getStore().getPlayer(sender.MemberNumber);
        if (player.credits < restraint.value * 4) {
            this.conn.reply(msg, "You don't have enough chips.");
            return;
        }

        if (!sender.Appearance.InventoryGet(restraint.items(sender)[0].Group)) {
            this.conn.reply(
                msg,
                `It doesn't look like you're wearing ${restraint.name}.`,
            );
            return;
        }

        const restraintItem = sender.Appearance.InventoryGet(
            restraint.items(sender)[0].Group,
        );
        if (!restraintItem) {
            this.conn!.reply(
                msg,
                `You can only buy yourself out of my restraints, not others.`,
            );
            return;
        }
        if (
            restraintItem.getData().Property?.LockMemberNumber !==
            this.conn!.Player.MemberNumber
        ) {
            this.conn!.reply(
                msg,
                `You can only buy yourself out of my restraints, not others.`,
            );
            return;
        }

        player.credits -= restraint.value * 4;
        await this.getStore().savePlayer(player);

        sender.Appearance.RemoveItem(restraint.items(sender)[0].Group);

        this.lockedItems
            .get(sender.MemberNumber)
            ?.delete(restraint.items(sender)[0].Group);

        this.conn.SendMessage(
            "Chat",
            `${sender} paid to remove their ${restraint.name}. Enjoy your freedom, while it lasts.`,
        );
    };

    private onCommandBuy = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.conn) return;
        if (args.length < 1) {
            this.conn.reply(msg, "Usage: buy <service>");
            return;
        }

        const serviceName = args[0].toLowerCase();
        const service = SERVICES[serviceName];
        if (service === undefined) {
            this.conn.reply(msg, "Unknown service.");
            return;
        }

        let target: API_Character | undefined;
        if (serviceName === "player") {
            if (args.length < 2) {
                this.conn.reply(
                    msg,
                    "Usage: buy player <name or member number>",
                );
                return;
            }
            target = this.conn?.chatRoom?.findCharacter(args[1]);
            if (!target) {
                this.conn.reply(msg, "I can't find that person.");
                return;
            }

            if (target.MemberNumber === sender.MemberNumber) {
                this.conn.reply(msg, "You can't buy yourself.");
                return;
            }

            if (
                target.Appearance.InventoryGet("ItemDevices")?.Name !== "Kennel"
            ) {
                this.conn.reply(
                    msg,
                    "Sorry, that player is not for sale (yet...)",
                );
                return;
            }
        }

        const player = await this.getStore().getPlayer(sender.MemberNumber);
        if (player.credits < service.value) {
            this.conn.reply(msg, "You don't have enough chips.");
            return;
        }

        player.credits -= service.value;
        await this.getStore().savePlayer(player);

        if (serviceName === "player") {
            target!.Appearance.RemoveItem("ItemDevices");
            if (!target!.Appearance.InventoryGet("ItemNeck")) {
                target!.Appearance.AddItem(
                    AssetGet("ItemNeck", "LeatherCollar"),
                );
            }
            target!.Appearance.AddItem(
                AssetGet("ItemNeckRestraints", "CollarLeash"),
            );
            const sign = target!.Appearance.AddItem(
                AssetGet("ItemMisc", "WoodenSign"),
            );
            sign.setProperty("Text", "Property of");
            sign.setProperty("Text2", sender.toString());

            this.lockedItems.get(target!.MemberNumber)?.delete("ItemDevices");

            this.conn.SendMessage(
                "Chat",
                `${sender} has bought ${target} and is now the proud owner of an unfortunate gambler.`,
            );
        } else if (serviceName === "cocktail") {
            const keys = Object.keys(COCKTAILS);
            const randomKey = keys[Math.floor(Math.random() * keys.length)];
            const cocktail = this.cocktailOfTheDay ?? COCKTAILS[randomKey];

            const cocktailItem = sender.Appearance.AddItem(
                AssetGet("ItemHandheld", "GlassFilled"),
            );
            cocktailItem.SetColor(cocktail.colour);
            cocktailItem.SetCraft({
                Name: cocktail.name,
                Description: cocktail.description,
                MemberName: this.conn.Player.toString(),
                MemberNumber: this.conn.Player.MemberNumber,
            });

            this.conn.SendMessage(
                "Chat",
                `Please enjoy your cocktail, ${sender}.`,
            );
        } else {
            await this.getStore().addPurchase({
                memberNumber: sender.MemberNumber,
                memberName: sender.toString(),
                time: Date.now(),
                service: serviceName,
                redeemed: false,
            });

            this.conn.SendMessage(
                "Chat",
                `${sender} has bought a voucher for ${service.name}! Please contact Ellie to redeem your service.`,
            );
        }
    };

    private onCommandVouchers = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!sender.IsRoomAdmin()) {
            this.conn.reply(msg, "Sorry, you need to be an admin");
            return;
        }

        const purchases = await this.getStore().getUnredeemedPurchases();
        if (purchases.length === 0) {
            this.conn.reply(msg, "No vouchers outstanding");
            return;
        }

        this.conn.reply(
            msg,
            purchases
                .map((p) => {
                    if (SERVICES[p.service] === undefined) {
                        return `${p.memberName} (${p.memberNumber}): Unknown service ${p.service}`;
                    }
                    return `${p.memberName} (${p.memberNumber}): ${SERVICES[p.service].name}`;
                })
                .join("\n"),
        );
    };

    private onCommandGive = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (args.length < 2) {
            this.conn.reply(
                msg,
                "Usage: give <name or member number> <amount>",
            );
            return;
        }

        const amount = parseInt(args[1], 10);
        if (isNaN(amount) || amount < 1) {
            this.conn.reply(msg, "Invalid amount.");
            return;
        }

        const target = this.conn?.chatRoom?.findCharacter(args[0]);
        if (!target) {
            this.conn?.reply(msg, "I can't find that person.");
            return;
        }
        if (target.MemberNumber === sender.MemberNumber) {
            this.conn?.reply(msg, "You can't give yourself chips.");
            return;
        }

        const transferred = await this.getStore().transferCredits(
            sender.MemberNumber,
            target.MemberNumber,
            amount,
        );
        if (!transferred) {
            this.conn.reply(msg, "You don't have enough chips.");
            return;
        }

        this.conn.SendMessage(
            "Chat",
            `${sender} gave ${amount} chips to ${target}`,
        );
    };

    private onCommandGrant = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.conn) return;
        if (!sender.IsRoomAdmin()) {
            this.conn.reply(msg, "Sorry, you need to be an admin");
            return;
        }

        if (args.length < 2) {
            this.conn.reply(
                msg,
                "Usage: grant <name or member number> <amount>",
            );
            return;
        }

        const amount = parseInt(args[1], 10);
        if (isNaN(amount) || amount < 1) {
            this.conn.reply(msg, "Invalid amount.");
            return;
        }

        const target = this.conn?.chatRoom?.findCharacter(args[0]);
        if (!target) {
            this.conn?.reply(msg, "I can't find that person.");
            return;
        }

        await this.getStore().addCredits(target.MemberNumber, amount);

        this.conn?.reply(msg, `Granted ${amount} chips to ${target}.`);
    };

    private closingInProgress = false;

    private onCommandClose = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!sender.IsRoomAdmin()) {
            this.conn.reply(msg, "Sorry, you need to be an admin");
            return;
        }

        if (this.closingInProgress) {
            this.conn.reply(msg, "The casino is already closing.");
            return;
        }

        if (!this.game.isBettingOpen()) {
            this.conn.reply(msg, "The casino is already closed.");
            return;
        }

        this.closingInProgress = true;
        this.conn.reply(
            msg,
            "Closing the casino after this round. Chips already in play will still be paid out.",
        );
        this.conn.SendMessage(
            "Chat",
            "🚨 Last round! The casino is closing after this round, place your final bets now!",
        );

        try {
            await this.game.closeBetting();
            this.conn.SendMessage(
                "Chat",
                "🎰 The casino is now closed. Thanks for playing! An admin can reopen it with /bot open.",
            );
        } finally {
            this.closingInProgress = false;
        }
    };

    private onCommandOpen = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!sender.IsRoomAdmin()) {
            this.conn.reply(msg, "Sorry, you need to be an admin");
            return;
        }

        if (this.game.isBettingOpen()) {
            this.conn.reply(msg, "The casino is already open.");
            return;
        }

        this.game.reopenBetting();
        this.conn.SendMessage(
            "Chat",
            "🎰 The casino is open again! Place your bets.",
        );
    };

    private onCommandBonusRound = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!sender.IsRoomAdmin()) {
            this.conn.reply(msg, "Sorry, you need to be an admin");
            return;
        }

        if (this.game.getBets().length > 0) {
            this.conn.reply(msg, "There are already bets placed.");
            return;
        }

        if (args.length > 0) {
            const multiplier = parseInt(args[0], 10);
            if (isNaN(multiplier) || multiplier < 1) {
                this.conn.reply(msg, "Invalid multiplier.");
                return;
            }
            this.multiplier = multiplier;
        } else {
            this.multiplier = 2;
        }

        this.conn.SendMessage(
            "Chat",
            `⭐️⭐️⭐️ Bonus round! ⭐️⭐️⭐️ All forfeit bets are worth ${this.multiplier}x their normal value!`,
        );
    };

    public getSign(): API_AppearanceItem {
        let sign = this.conn.Player.Appearance.InventoryGet("ItemMisc");
        if (!sign) {
            sign = this.conn.Player.Appearance.AddItem(
                AssetGet("ItemMisc", "WoodenSign"),
            );
            sign.setProperty("Text", "");
            sign.setProperty("Text2", "");
        }
        return sign;
    }

    public setSignColor(colors: [BCColor, BCColor, BCColor]): void {
        this.getSign().SetColor(colors);
    }

    public setTextColor(color: BCColor): void {
        this.setSignColor(["Default", "Default", color]);
    }

    public applyForfeit(bet: Bet): void {
        if (!this.conn) return;
        const char = this.conn?.chatRoom?.findMember(bet.memberNumber);
        if (!char) return;

        // Use ForfeitService to apply the forfeit
        this.forfeitService.applyForfeit(
            char,
            bet.stakeForfeit,
            this.conn.Player.MemberNumber,
        );

        // Track locked items for later reference
        const lockTime = FORFEITS[bet.stakeForfeit].lockTimeMs;
        if (lockTime) {
            const items = FORFEITS[bet.stakeForfeit].items(char);
            if (items.length === 1) {
                this.lockedItems.set(
                    bet.memberNumber,
                    this.lockedItems.get(bet.memberNumber) ?? new Map(),
                );
                this.lockedItems
                    .get(bet.memberNumber)
                    ?.set(items[0].Group, Date.now() + lockTime);
            }
        }
    }

    public cheatPunishment(char: API_Character, player: any): void {
        // Use ForfeitService to apply cheat punishment
        this.forfeitService.applyCheatPunishment(char, player.cheatStrikes);
    }

    private onCommandGame = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!sender.IsRoomAdmin()) {
            this.conn.reply(msg, "Sorry, you need to be an admin");
            return;
        }
        if (args.length < 1) {
            this.conn.reply(msg, "Usage: /bot game <game>");
            return;
        }
        const game = args[0].toLowerCase();
        if (game === "roulette" && !(this.game instanceof RouletteGame)) {
            this.conn.SendMessage(
                "Chat",
                "After this round the game will switch to roulette.",
            );
            await this.game.endGame();
            this.game = new RouletteGame(this.conn, this);
            this.conn.reply(msg, "Switched to roulette.");
            this.conn.SendMessage(
                "Chat",
                `The game has switched to roulette, please place your bets!`,
            );
        } else if (
            game === "blackjack" &&
            !(this.game instanceof BlackjackGame)
        ) {
            this.conn.SendMessage(
                "Chat",
                "After this round the game will switch to blackjack.",
            );
            await this.game.endGame();
            this.game = new BlackjackGame(this.conn, this);
            this.conn.reply(msg, "Switched to blackjack.");
            this.conn.SendMessage(
                "Chat",
                `The game has switched to blackjack, please place your bets!`,
            );
        } else {
            this.conn.reply(msg, `Unknown game: ${game}`);
            return;
        }
        this.setBio();
    };

    private onCommandEscape = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        // Get unified store for access to bondage and chip management
        // For now, use the regular store - will integrate with unified store in full implementation
        if (!args.length || isNaN(parseInt(args[0]))) {
            this.conn.reply(msg, "Usage: /bot escape <cost>");
            this.conn.reply(
                msg,
                "Spend chips to escape all active bondage items.",
            );
            return;
        }

        const escapeCost = parseInt(args[0]);

        if (escapeCost <= 0) {
            this.conn.reply(msg, "Escape cost must be positive.");
            return;
        }

        // Note: Full implementation would use global.unifiedStore.spendChipsToEscape()
        // For now, send placeholder message
        this.conn.reply(
            msg,
            `Escape feature requires unified store integration (${escapeCost} chips). Coming in Phase 3.2 full release.`,
        );
    };
}
