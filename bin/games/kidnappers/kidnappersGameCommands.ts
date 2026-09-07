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

import { randomUUID } from "node:crypto";
import type {
    API_Character,
    API_Connector,
    BC_Server_ChatRoomMessage,
} from "bc-bot";
import { ValidationError } from "../../errors";
import type { GamePluginCommandRouter } from "../shared/gamePlugin";
import {
    KidnappersGameMessageFeatureSystem,
    KidnappersGameEventRouter,
} from "./kidnappersGameMessaging";
import { KidnappersGameLifecycleService } from "./kidnappersGameLifecycleService";
import type { KidnappersGamePersistence } from "./kidnappersGamePersistence";
import { KidnappersGameCaptureService } from "./kidnappersGameCaptureService";
import type { GameStateMutationService } from "../shared/gameStateMutationService";
import type {
    KidnappersGameCommand,
    KidnappersGameEvent,
    KidnappersPlayerRole,
    KidnappersSessionSnapshot,
} from "./kidnappersGameTypes";
import { isTerminalPhase } from "./kidnappersGameTypes";
import type { KidnappersSessionCommandResult } from "./kidnappersGameSession";

type KidnappersGameCommandInput = KidnappersGameCommand extends infer T
    ? T extends { correlationId: string; issuedAt: number }
        ? Omit<T, "correlationId" | "issuedAt">
        : never
    : never;

export type KidnappersCommandErrorReason =
    | "UNKNOWN_COMMAND"
    | "MALFORMED_COMMAND"
    | "PERMISSION_DENIED"
    | "NOT_IN_ROOM"
    | "SESSION_NOT_FOUND"
    | "SESSION_REQUIRED"
    | "SESSION_CONFLICT"
    | "PERSISTENCE_UNAVAILABLE";

export class KidnappersCommandError extends ValidationError {
    public readonly reason: KidnappersCommandErrorReason;
    public readonly command: string;

    constructor(
        message: string,
        details: {
            reason: KidnappersCommandErrorReason;
            command: string;
            context?: Record<string, unknown>;
        },
    ) {
        super(message, {
            ...details.context,
            reason: details.reason,
            command: details.command,
        });
        this.name = "KidnappersCommandError";
        this.reason = details.reason;
        this.command = details.command;
    }
}

export type KidnappersCommandResult =
    | {
          readonly ok: true;
          readonly message: string;
          readonly sessionId?: string;
          readonly event?: KidnappersGameEvent;
      }
    | {
          readonly ok: false;
          readonly message: string;
          readonly error: KidnappersCommandError | Error;
          readonly sessionId?: string;
      };

export interface KidnappersGameCommandOptions {
    readonly isInGameRoom?: (
        sender: API_Character,
        message: BC_Server_ChatRoomMessage,
    ) => boolean;
    readonly now?: () => number;
    readonly eventRouter?: KidnappersGameEventRouter;
    readonly mutationService?: GameStateMutationService;
}

const COMMAND_ALIASES: Readonly<Record<string, string>> = {
    begin: "start",
    commands: "help",
    enter: "join",
    exit: "leave",
    quit: "leave",
    state: "status",
    watch: "status",
    observe: "status",
    kidnap: "capture",
    defend: "resist",
    surrender: "accept",
    flee: "escape",
    vote: "accuse",
    advance: "phase",
    stop: "end",
    abort: "end",
    games: "sessions",
    resume: "recover",
};

const ADMIN_COMMANDS = new Set([
    "assign",
    "complete",
    "end",
    "timeout",
    "abandon",
    "phase",
    "recover",
    "release",
    "sessions",
]);

const PLAYER_COMMANDS = new Set([
    "accept",
    "accuse",
    "capture",
    "escape",
    "join",
    "leave",
    "resist",
    "start",
    "status",
    "switch",
]);

const PLAYER_ROLES: ReadonlySet<KidnappersPlayerRole> = new Set([
    "kidnapper",
    "maid",
    "switch",
    "stalker",
    "fan",
    "masochist",
    "mistress",
    "bystander",
]);

const HELP = [
    "Kidnappers commands:",
    "!kidnappers join [session] - Join or create a lobby.",
    "!kidnappers switch <session> - Join another session and leave your current one.",
    "!kidnappers leave [session] - Leave your current session.",
    "!kidnappers start [session] - Start once the lobby has enough players.",
    "!kidnappers status [session] - Observe phase and public roster.",
    "!kidnappers capture <member> - Capture a target on your turn.",
    "!kidnappers accept|resist [session] - Respond to a capture.",
    "!kidnappers escape [session] - Attempt to escape after capture.",
    "!kidnappers help - Show this help.",
    "",
    "Room admins:",
    "!kidnappers sessions|recover <session>",
    "!kidnappers assign <member> <role> [session]",
    "!kidnappers phase|end|timeout|abandon|release|complete [args] [session]",
].join("\n");

/**
 * Command boundary for the Kidnappers session service.
 *
 * It is deliberately independent from the room bootstrap so it can be
 * registered by any active game/plugin router, while all state changes still
 * pass through the authoritative session and its typed domain errors.
 */
export class KidnappersGameCommandController {
    public readonly key = "kidnappers";
    public readonly label = "Kidnappers Game";

    private readonly messageFeatureSystem: KidnappersGameMessageFeatureSystem;
    private readonly inFlight = new Map<
        string,
        Promise<KidnappersCommandResult>
    >();
    private activeSessionId?: string;
    private registered = false;

    public constructor(
        private readonly conn: API_Connector,
        private readonly lifecycle: KidnappersGameLifecycleService,
        private readonly persistence?: KidnappersGamePersistence,
        private readonly options: KidnappersGameCommandOptions = {},
    ) {
        this.messageFeatureSystem = new KidnappersGameMessageFeatureSystem(
            conn,
            () => !this.lifecycleIsShutDown(),
            async (sender, message, command, args) => {
                const result = await this.dispatch(
                    sender,
                    [command, ...args],
                    message,
                );
                this.reply(message, result.message);
            },
        );
    }

    public registerCommands(router: GamePluginCommandRouter): void {
        if (this.registered) return;
        this.messageFeatureSystem.registerCommands(router);
        this.registered = true;
    }

    public unregisterCommands(router: GamePluginCommandRouter): void {
        router.unregisterRoot?.();
        this.registered = false;
    }

    public async dispatch(
        sender: API_Character,
        args: string[],
        message = {} as BC_Server_ChatRoomMessage,
    ): Promise<KidnappersCommandResult> {
        const normalized = args.map((arg) => arg.trim()).filter(Boolean);
        const command = this.normalizeCommand(normalized[0] ?? "");
        const fingerprint = `${sender.MemberNumber}:${command}:${normalized.slice(1).join(" ")}`;
        const inFlight = this.inFlight.get(fingerprint);
        if (inFlight) return inFlight;

        const operation = this.dispatchOnce(
            sender,
            message,
            command,
            normalized.slice(1),
        );
        this.inFlight.set(fingerprint, operation);
        try {
            return await operation;
        } finally {
            this.inFlight.delete(fingerprint);
        }
    }

    public getStatus(): string {
        const sessions = this.lifecycle.listSessionIds().map((sessionId) => {
            const session = this.lifecycle.getSession(sessionId)!;
            const snapshot = session.getSnapshot();
            return `${sessionId}: ${snapshot.phase} (${snapshot.players.length} players)`;
        });
        return sessions.length > 0
            ? `Kidnappers sessions:\n${sessions.join("\n")}`
            : "No Kidnappers sessions are active.";
    }

    private async dispatchOnce(
        sender: API_Character,
        message: BC_Server_ChatRoomMessage,
        command: string,
        args: string[],
    ): Promise<KidnappersCommandResult> {
        try {
            if (
                this.options.isInGameRoom &&
                !this.options.isInGameRoom(sender, message)
            ) {
                throw this.commandError(
                    "You must be in the Kidnappers game room to use this command.",
                    "NOT_IN_ROOM",
                    command,
                );
            }
            if (!command) {
                throw this.commandError(
                    "Use !kidnappers help to list available commands.",
                    "MALFORMED_COMMAND",
                    command,
                );
            }
            if (command === "help") return { ok: true, message: HELP };
            if (!PLAYER_COMMANDS.has(command) && !ADMIN_COMMANDS.has(command)) {
                throw this.commandError(
                    `Unknown Kidnappers command '${command}'. Use !kidnappers help.`,
                    "UNKNOWN_COMMAND",
                    command,
                );
            }
            if (ADMIN_COMMANDS.has(command) && !this.isAdmin(sender)) {
                throw this.commandError(
                    "Only room admins can use this Kidnappers command.",
                    "PERMISSION_DENIED",
                    command,
                );
            }

            return await this.executeCommand(sender, command, args);
        } catch (error) {
            const typedError =
                error instanceof KidnappersCommandError
                    ? error
                    : error instanceof Error
                      ? error
                      : new Error(String(error));
            return {
                ok: false,
                message: this.formatError(typedError),
                error: typedError,
            };
        }
    }

    private async executeCommand(
        sender: API_Character,
        command: string,
        args: string[],
    ): Promise<KidnappersCommandResult> {
        switch (command) {
            case "join": {
                this.assertArgumentCount(command, args, 0, 1);
                const session = await this.findOrCreateLobby(args[0]);
                if (
                    this.memberSession(sender.MemberNumber, session.sessionId)
                ) {
                    throw this.commandError(
                        "You already joined this session.",
                        "SESSION_CONFLICT",
                        command,
                        { sessionId: session.sessionId },
                    );
                }
                const result = await this.dispatchSessionCommand(
                    session.sessionId,
                    {
                        type: "JOIN_SESSION",
                        memberNumber: sender.MemberNumber,
                        memberName: sender.toString(),
                    },
                );
                return this.resultFromTransition(
                    result,
                    session.sessionId,
                    `Joined Kidnappers session '${session.sessionId}'.`,
                );
            }
            case "switch": {
                this.assertArgumentCount(command, args, 1, 1);
                const target = this.requireSession(args[0], command);
                const current = this.findMemberSession(sender.MemberNumber);
                if (current?.sessionId === target.sessionId) {
                    throw this.commandError(
                        "You are already in that session.",
                        "SESSION_CONFLICT",
                        command,
                        { sessionId: target.sessionId },
                    );
                }
                if (this.memberSession(sender.MemberNumber, target.sessionId)) {
                    throw this.commandError(
                        "You already joined that session.",
                        "SESSION_CONFLICT",
                        command,
                        { sessionId: target.sessionId },
                    );
                }
                const joined = await this.dispatchSessionCommand(
                    target.sessionId,
                    {
                        type: "JOIN_SESSION",
                        memberNumber: sender.MemberNumber,
                        memberName: sender.toString(),
                    },
                );
                if (!joined.ok) {
                    return this.resultFromTransition(
                        joined,
                        target.sessionId,
                        "",
                    );
                }
                if (current) {
                    const left = await this.dispatchSessionCommand(
                        current.sessionId,
                        {
                            type: "LEAVE_SESSION",
                            memberNumber: sender.MemberNumber,
                        },
                    );
                    if (!left.ok) {
                        await this.dispatchSessionCommand(target.sessionId, {
                            type: "LEAVE_SESSION",
                            memberNumber: sender.MemberNumber,
                        });
                        return this.resultFromTransition(
                            left,
                            current.sessionId,
                            "",
                        );
                    }
                }
                this.activeSessionId = target.sessionId;
                return {
                    ok: true,
                    sessionId: target.sessionId,
                    event: joined.event,
                    message: `Switched to Kidnappers session '${target.sessionId}'.`,
                };
            }
            case "leave": {
                this.assertArgumentCount(command, args, 0, 1);
                const session = this.requireMemberSession(
                    sender.MemberNumber,
                    args[0],
                    command,
                );
                const result = await this.dispatchSessionCommand(
                    session.sessionId,
                    {
                        type: "LEAVE_SESSION",
                        memberNumber: sender.MemberNumber,
                    },
                );
                return this.resultFromTransition(
                    result,
                    session.sessionId,
                    `Left Kidnappers session '${session.sessionId}'.`,
                );
            }
            case "start": {
                this.assertArgumentCount(command, args, 0, 1);
                const session = this.requireMemberSession(
                    sender.MemberNumber,
                    args[0],
                    command,
                );
                const result = await this.dispatchSessionCommand(
                    session.sessionId,
                    {
                        type: "START_GAME",
                    },
                );
                return this.resultFromTransition(
                    result,
                    session.sessionId,
                    `Kidnappers session '${session.sessionId}' started.`,
                );
            }
            case "status": {
                this.assertArgumentCount(command, args, 0, 1);
                const session = this.requireSession(args[0], command);
                return {
                    ok: true,
                    sessionId: session.sessionId,
                    message: this.formatSnapshot(
                        session.getSnapshot(),
                        sender.MemberNumber,
                        this.isAdmin(sender),
                    ),
                };
            }
            case "capture": {
                this.assertArgumentCount(command, args, 1, 2);
                const session = this.requireMemberSession(
                    sender.MemberNumber,
                    this.sessionArgument(args),
                    command,
                );
                const targetMemberNumber = this.memberNumberArgument(
                    args[0],
                    command,
                );
                const result = await this.dispatchSessionCommand(
                    session.sessionId,
                    {
                        type: "ATTEMPT_CAPTURE",
                        actorMemberNumber: sender.MemberNumber,
                        targetMemberNumber,
                    },
                );
                return this.resultFromTransition(
                    result,
                    session.sessionId,
                    `Capture attempt against member ${targetMemberNumber} submitted.`,
                );
            }
            case "accept":
            case "resist": {
                this.assertArgumentCount(command, args, 0, 1);
                const session = this.requireMemberSession(
                    sender.MemberNumber,
                    args[0],
                    command,
                );
                const result = await this.dispatchSessionCommand(
                    session.sessionId,
                    {
                        type:
                            command === "accept"
                                ? "ACCEPT_CAPTURE"
                                : "RESIST_CAPTURE",
                        memberNumber: sender.MemberNumber,
                    },
                );
                return this.resultFromTransition(
                    result,
                    session.sessionId,
                    `Capture response '${command}' submitted.`,
                );
            }
            case "escape": {
                this.assertArgumentCount(command, args, 0, 1);
                const session = this.requireMemberSession(
                    sender.MemberNumber,
                    args[0],
                    command,
                );
                const result = await this.dispatchSessionCommand(
                    session.sessionId,
                    {
                        type: "ATTEMPT_ESCAPE",
                        memberNumber: sender.MemberNumber,
                    },
                );
                return this.resultFromTransition(
                    result,
                    session.sessionId,
                    "Escape attempt submitted.",
                );
            }
            case "accuse": {
                this.assertArgumentCount(command, args, 1, 2);
                const session = this.requireMemberSession(
                    sender.MemberNumber,
                    this.sessionArgument(args),
                    command,
                );
                const result = await this.dispatchSessionCommand(
                    session.sessionId,
                    {
                        type: "RAISE_ACCUSATION",
                        memberNumber: this.memberNumberArgument(
                            args[0],
                            command,
                        ),
                    },
                );
                return this.resultFromTransition(
                    result,
                    session.sessionId,
                    "Accusation submitted.",
                );
            }
            case "assign": {
                this.assertArgumentCount(command, args, 2, 3);
                const role = args[1] as KidnappersPlayerRole;
                if (!PLAYER_ROLES.has(role)) {
                    throw this.commandError(
                        `Unknown role '${args[1]}'.`,
                        "MALFORMED_COMMAND",
                        command,
                    );
                }
                const session = this.requireSession(
                    this.sessionArgument(args),
                    command,
                );
                const result = await this.dispatchSessionCommand(
                    session.sessionId,
                    {
                        type: "ASSIGN_ROLE",
                        memberNumber: this.memberNumberArgument(
                            args[0],
                            command,
                        ),
                        role,
                    },
                );
                return this.resultFromTransition(
                    result,
                    session.sessionId,
                    `Assigned role '${role}'.`,
                );
            }
            case "phase": {
                this.assertArgumentCount(command, args, 0, 1);
                const session = this.requireSession(args[0], command);
                const result = await this.dispatchSessionCommand(
                    session.sessionId,
                    {
                        type: "ADVANCE_PHASE",
                    },
                );
                return this.resultFromTransition(
                    result,
                    session.sessionId,
                    "Advanced the game phase.",
                );
            }
            case "release": {
                this.assertArgumentCount(command, args, 1, 2);
                const session = this.requireSession(
                    this.sessionArgument(args),
                    command,
                );
                const result = await this.dispatchSessionCommand(
                    session.sessionId,
                    {
                        type: "RELEASE_CAPTURE",
                        memberNumber: this.memberNumberArgument(
                            args[0],
                            command,
                        ),
                        reason: "admin",
                    },
                );
                return this.resultFromTransition(
                    result,
                    session.sessionId,
                    "Player released.",
                );
            }
            case "complete": {
                this.assertArgumentCount(command, args, 1, 2);
                const winner = args[0];
                if (
                    winner !== "captors" &&
                    winner !== "victims" &&
                    winner !== "tie"
                ) {
                    throw this.commandError(
                        "Winner must be 'captors', 'victims', or 'tie'.",
                        "MALFORMED_COMMAND",
                        command,
                    );
                }
                const session = this.requireSession(
                    this.sessionArgument(args),
                    command,
                );
                const result = await this.dispatchSessionCommand(
                    session.sessionId,
                    {
                        type: "COMPLETE_GAME",
                        winner,
                    },
                );
                return this.resultFromTransition(
                    result,
                    session.sessionId,
                    `Game completed for the ${winner}.`,
                );
            }
            case "end": {
                this.assertArgumentCount(command, args, 0, 1);
                const session = this.requireSession(args[0], command);
                const result = await this.dispatchSessionCommand(
                    session.sessionId,
                    {
                        type: "ABORT_SESSION",
                        reason: "Ended by room admin",
                    },
                );
                return this.resultFromTransition(
                    result,
                    session.sessionId,
                    `Kidnappers session '${session.sessionId}' ended.`,
                );
            }
            case "timeout":
            case "abandon": {
                this.assertArgumentCount(command, args, 0, 1);
                const session = this.requireSession(args[0], command);
                const reason =
                    command === "timeout" ? "timeout" : "abandonment";
                const result = await this.dispatchSessionCommand(
                    session.sessionId,
                    {
                        type: "END_GAME",
                        reason,
                    },
                );
                return this.resultFromTransition(
                    result,
                    session.sessionId,
                    `Kidnappers session '${session.sessionId}' ended (${reason}).`,
                );
            }
            case "sessions":
                this.assertArgumentCount(command, args, 0, 0);
                return { ok: true, message: this.getStatus() };
            case "recover": {
                this.assertArgumentCount(command, args, 1, 1);
                if (!this.persistence) {
                    throw this.commandError(
                        "Kidnappers persistence is not configured; recovery is unavailable.",
                        "PERSISTENCE_UNAVAILABLE",
                        command,
                    );
                }
                const session = await this.lifecycle.recoverSession(args[0]);
                if (!session) {
                    throw this.commandError(
                        `No recoverable Kidnappers session '${args[0]}' exists.`,
                        "SESSION_NOT_FOUND",
                        command,
                    );
                }
                this.activeSessionId = session.sessionId;
                return {
                    ok: true,
                    sessionId: session.sessionId,
                    message: `Recovered Kidnappers session '${session.sessionId}' (${session.getSnapshot().phase}).`,
                };
            }
            default:
                throw this.commandError(
                    `Unknown Kidnappers command '${command}'.`,
                    "UNKNOWN_COMMAND",
                    command,
                );
        }
    }

    private async dispatchSessionCommand(
        sessionId: string,
        command: KidnappersGameCommandInput,
    ): Promise<KidnappersSessionCommandResult> {
        const session = this.lifecycle.getSession(sessionId);
        if (!session) {
            throw this.commandError(
                `Kidnappers session '${sessionId}' was not found.`,
                "SESSION_NOT_FOUND",
                String(command.type),
                { sessionId },
            );
        }
        const fullCommand = {
            ...command,
            correlationId: randomUUID(),
            issuedAt: this.options.now?.() ?? Date.now(),
        } as KidnappersGameCommand;
        let result: KidnappersSessionCommandResult;
        if (this.persistence && this.options.mutationService) {
            result = await new KidnappersGameCaptureService(
                session,
                this.persistence,
                this.options.mutationService,
            ).dispatch(fullCommand);
        } else if (this.persistence && this.options.eventRouter) {
            result = await session.dispatchPersistedAndPublish(
                fullCommand,
                this.persistence,
                (id, event) =>
                    this.options.eventRouter!.publishGameEvent(id, event),
            );
            return result;
        } else if (this.persistence) {
            result = await session.dispatchPersisted(
                fullCommand,
                this.persistence,
            );
        } else {
            result = session.dispatch(fullCommand);
        }
        if (this.options.eventRouter) {
            await this.options.eventRouter.publishGameEvent(
                sessionId,
                result.event,
            );
        }
        return result;
    }

    private resultFromTransition(
        result: KidnappersSessionCommandResult,
        sessionId: string,
        successMessage: string,
    ): KidnappersCommandResult {
        if (!result.ok) {
            return {
                ok: false,
                sessionId,
                error: result.error,
                message: this.formatError(result.error),
            };
        }
        this.activeSessionId = sessionId;
        return {
            ok: true,
            sessionId,
            event: result.event,
            message: successMessage,
        };
    }

    private async findOrCreateLobby(requestedSessionId?: string) {
        if (requestedSessionId) {
            return this.requireSession(requestedSessionId, "join");
        }
        const existing = this.findActiveSession();
        if (existing) return existing;
        const session = this.persistence
            ? await this.lifecycle.createPersistedSession()
            : this.lifecycle.createSession();
        this.activeSessionId = session.sessionId;
        return session;
    }

    private requireSession(sessionId: string | undefined, command: string) {
        const session = sessionId
            ? this.lifecycle.getSession(sessionId)
            : this.activeSessionId
              ? this.lifecycle.getSession(this.activeSessionId)
              : this.findActiveSession();
        if (!session) {
            throw this.commandError(
                sessionId
                    ? `Kidnappers session '${sessionId}' was not found.`
                    : "No Kidnappers session is active. Join a session first.",
                sessionId ? "SESSION_NOT_FOUND" : "SESSION_REQUIRED",
                command,
            );
        }
        return session;
    }

    private requireMemberSession(
        memberNumber: number,
        requestedSessionId: string | undefined,
        command: string,
    ) {
        const session = this.requireSession(requestedSessionId, command);
        if (
            !session
                .getSnapshot()
                .players.some((player) => player.memberNumber === memberNumber)
        ) {
            throw this.commandError(
                `You are not a participant in session '${session.sessionId}'.`,
                "PERMISSION_DENIED",
                command,
                { sessionId: session.sessionId, memberNumber },
            );
        }
        return session;
    }

    private memberSession(memberNumber: number, sessionId: string): boolean {
        return Boolean(
            this.lifecycle
                .getSession(sessionId)
                ?.getSnapshot()
                .players.some((player) => player.memberNumber === memberNumber),
        );
    }

    private findMemberSession(memberNumber: number) {
        return this.lifecycle
            .listSessionIds()
            .map((sessionId) => this.lifecycle.getSession(sessionId)!)
            .find((session) =>
                session
                    .getSnapshot()
                    .players.some(
                        (player) => player.memberNumber === memberNumber,
                    ),
            );
    }

    private findActiveSession() {
        const active = this.activeSessionId
            ? this.lifecycle.getSession(this.activeSessionId)
            : undefined;
        if (active && !isTerminalPhase(active.getSnapshot().phase))
            return active;
        return this.lifecycle
            .listSessionIds()
            .map((sessionId) => this.lifecycle.getSession(sessionId)!)
            .find((session) => !isTerminalPhase(session.getSnapshot().phase));
    }

    private normalizeCommand(command: string): string {
        const normalized = command.toLowerCase();
        return COMMAND_ALIASES[normalized] ?? normalized;
    }

    private sessionArgument(args: string[]): string | undefined {
        return args.length > 1 ? args[args.length - 1] : undefined;
    }

    private memberNumberArgument(
        value: string | undefined,
        command: string,
    ): number {
        const memberNumber = Number(value);
        if (
            !value ||
            !Number.isSafeInteger(memberNumber) ||
            memberNumber <= 0
        ) {
            throw this.commandError(
                `Usage: !kidnappers ${command} <member number>`,
                "MALFORMED_COMMAND",
                command,
            );
        }
        return memberNumber;
    }

    private assertArgumentCount(
        command: string,
        args: string[],
        min: number,
        max: number,
    ): void {
        if (args.length < min || args.length > max) {
            throw this.commandError(
                `Invalid arguments for '${command}'. Use !kidnappers help for usage.`,
                "MALFORMED_COMMAND",
                command,
            );
        }
    }

    private isAdmin(sender: API_Character): boolean {
        return typeof sender.IsRoomAdmin === "function" && sender.IsRoomAdmin();
    }

    private commandError(
        message: string,
        reason: KidnappersCommandErrorReason,
        command: string,
        context?: Record<string, unknown>,
    ): KidnappersCommandError {
        return new KidnappersCommandError(message, {
            reason,
            command,
            context,
        });
    }

    private formatError(error: Error): string {
        if (error instanceof KidnappersCommandError) {
            return `[${error.reason}] ${error.message}`;
        }
        return error.message;
    }

    private formatSnapshot(
        snapshot: KidnappersSessionSnapshot,
        viewerMemberNumber: number,
        admin: boolean,
    ): string {
        const players = snapshot.players
            .map((player) => {
                const role =
                    admin || player.memberNumber === viewerMemberNumber
                        ? `, role=${player.role ?? "unassigned"}`
                        : "";
                return `- ${player.memberName} (#${player.memberNumber}, ${player.status}${role})`;
            })
            .join("\n");
        return [
            `Session ${snapshot.sessionId}: ${snapshot.phase}, round ${snapshot.round}`,
            `Players (${snapshot.players.length}):`,
            players || "- none",
            snapshot.turn
                ? `Current turn: #${snapshot.turn.ownerMemberNumber} until ${new Date(snapshot.turn.deadlineAt).toISOString()}`
                : "Current turn: none",
            snapshot.outcome?.summary ?? "",
        ].join("\n");
    }

    private reply(message: BC_Server_ChatRoomMessage, text: string): void {
        this.conn.reply(message, text);
    }

    private lifecycleIsShutDown(): boolean {
        return this.lifecycle.isShutDown();
    }
}
