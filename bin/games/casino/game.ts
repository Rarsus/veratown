import {
    API_Character,
    BC_Server_ChatRoomMessage,
    CommandParser,
} from "bc-bot";
import { RouletteBet } from "./roulette";

export interface Game {
    HELPMESSAGE: string;
    HELPCOMMANDMESSAGE: string;
    COMMANDSMESSAGE: string;
    EXAMPLES: string;

    /**
     * Register game-specific commands with the CommandParser.
     * Called after game instantiation to separate command registration
     * from constructor logic (follows plugin architecture principles).
     */
    registerCommands(commandParser: CommandParser): void;

    parseBetCommand(
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ): Bet | undefined;

    placeBet(bet: Bet): void;

    getBets(): Bet[];

    getBetsForPlayer(memberNumber: number): Bet[];

    clearBetsForPlayer(memberNumber: number): undefined;

    endGame(): Promise<void>;

    clear(): void;

    // Whether the table is currently accepting new bets. Used by the admin
    // "/bot close"/"/bot open" commands so a room admin can shut down the
    // casino (after letting the current/a final round finish and pay out)
    // without tearing down the bot or losing its position/appearance.
    isBettingOpen(): boolean;

    // Resolves once betting has been shut off: waits for any in-progress
    // round (or, if none is in progress, runs one final round so players
    // get a genuine last chance to bet) to finish and pay out, then stops
    // accepting new bets.
    closeBetting(): Promise<void>;

    // Resumes accepting new bets after closeBetting().
    reopenBetting(): void;
}

export interface Bet {
    memberNumber: number;
    memberName: string;
    stake: number;
    stakeForfeit: string;
}
