import {
    API_Connector,
    API_Character,
    BC_Server_ChatRoomMessage,
    TellType,
} from "bc-bot";
import { createLogger } from "../../logging";

export interface MessageSendResult {
    success: boolean;
    message?: string;
    error?: Error;
}

/** Shared transport boundary for targeted and public game messages. */
export class MessageSender {
    private readonly logger = createLogger("MessageSender");

    public constructor(private readonly conn: API_Connector) {}

    public whisper(memberNumber: number, text: string): MessageSendResult {
        return this.send("Whisper", text, memberNumber);
    }

    public emoteTo(memberNumber: number, text: string): MessageSendResult {
        return this.send("Emote", text, memberNumber);
    }

    public chat(text: string): MessageSendResult {
        return this.send("Chat", text);
    }

    public emote(text: string): MessageSendResult {
        return this.send("Emote", text);
    }

    public reply(
        message: BC_Server_ChatRoomMessage,
        text: string,
    ): MessageSendResult {
        try {
            this.conn.reply(message, text);
            return { success: true };
        } catch (error) {
            return this.failure("reply", error);
        }
    }

    public whisperToCharacter(
        character: API_Character,
        text: string,
    ): MessageSendResult {
        return this.whisper(character.MemberNumber, text);
    }

    public emoteToCharacter(
        character: API_Character,
        text: string,
    ): MessageSendResult {
        return this.emoteTo(character.MemberNumber, text);
    }

    private send(
        type: TellType,
        text: string,
        target?: number,
    ): MessageSendResult {
        try {
            this.conn.SendMessage(type, text, target);
            return { success: true };
        } catch (error) {
            return this.failure(type, error);
        }
    }

    private failure(operation: string, error: unknown): MessageSendResult {
        const normalized =
            error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Failed to send ${operation}`, normalized);
        return {
            success: false,
            message: "Failed to send message",
            error: normalized,
        };
    }
}
