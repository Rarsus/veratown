import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { API_Connector, type API_Message, type TellType } from "bc-bot";
import { createLogger } from "../../bin/logging/index.ts";

const logger = createLogger("RealRoomTestBot");

export const DEFAULT_SAFE_COMMAND = "!help";
export const SAFE_COMMAND_NAMES = new Set(["help"]);
export const MIN_TIMEOUT_MS = 100;
export const MAX_TIMEOUT_MS = 120_000;
export const DRY_RUN_ENVIRONMENT_VARIABLE = "BC_TEST_DRY_RUN";

export interface DisabledRealRoomTestConfig {
    enabled: false;
}

export interface RealRoomTestConfig {
    enabled: true;
    serverUrl: string;
    environment: "live" | "test";
    username: string;
    password: string;
    room: string;
    targetMemberNumber: number;
    timeoutMs: number;
}

export type ParsedRealRoomTestConfig =
    DisabledRealRoomTestConfig | RealRoomTestConfig;

export interface QualificationConnector {
    on(event: "Message", listener: (message: API_Message) => void): this;
    on(event: "Disconnected", listener: (reason: string) => void): this;
    off(event: "Message", listener: (message: API_Message) => void): this;
    off(event: "Disconnected", listener: (reason: string) => void): this;
    login(): Promise<void>;
    ChatRoomJoin(name: string): Promise<boolean>;
    SendMessage(type: TellType, message: string, target?: number): void;
    disconnect(): void;
    readonly chatRoom?: { readonly Name: string };
}

export interface QualificationEvidence {
    runId: string;
    startedAt: string;
    finishedAt: string;
    environment: "live" | "test";
    room: string;
    accountRole: "dedicated-test-account";
    command: string;
    targetMemberNumber: number;
    joined: true;
    response: {
        senderMemberNumber: number;
        type: string;
        content: string;
    };
    disconnected: true;
}

export type QualificationConnectorFactory = (
    config: RealRoomTestConfig,
) => QualificationConnector;

class QualificationError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "QualificationError";
    }
}

function requiredValue(
    environment: NodeJS.ProcessEnv,
    key: string,
): string | undefined {
    const value = environment[key]?.trim();
    return value ? value : undefined;
}

function parsePositiveInteger(value: string, key: string): number {
    if (!/^\d+$/.test(value)) {
        throw new QualificationError(`${key} must be a positive integer`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new QualificationError(`${key} must be a positive integer`);
    }
    return parsed;
}

export function parseRealRoomTestConfig(
    environment: NodeJS.ProcessEnv,
): ParsedRealRoomTestConfig {
    if (environment.BC_REAL_ROOM_TEST_ENABLED !== "true") {
        return { enabled: false };
    }

    const requiredKeys = [
        "BC_TEST_SERVER_URL",
        "BC_TEST_ENV",
        "BC_TEST_USERNAME",
        "BC_TEST_PASSWORD",
        "BC_TEST_ROOM",
        "BC_TEST_TARGET_MEMBER_NUMBER",
        "BC_TEST_TIMEOUT_MS",
    ] as const;
    const missingKeys = requiredKeys.filter(
        (key) => !requiredValue(environment, key),
    );
    if (missingKeys.length > 0) {
        throw new QualificationError(
            `missing required qualification configuration: ${missingKeys.join(", ")}`,
        );
    }

    const serverUrl = requiredValue(environment, "BC_TEST_SERVER_URL")!;
    try {
        new URL(serverUrl);
    } catch {
        throw new QualificationError("BC_TEST_SERVER_URL must be a valid URL");
    }

    const environmentName = requiredValue(environment, "BC_TEST_ENV");
    if (environmentName !== "live" && environmentName !== "test") {
        throw new QualificationError("BC_TEST_ENV must be live or test");
    }

    const timeoutMs = parsePositiveInteger(
        requiredValue(environment, "BC_TEST_TIMEOUT_MS")!,
        "BC_TEST_TIMEOUT_MS",
    );
    if (timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
        throw new QualificationError(
            `BC_TEST_TIMEOUT_MS must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`,
        );
    }

    return {
        enabled: true,
        serverUrl,
        environment: environmentName,
        username: requiredValue(environment, "BC_TEST_USERNAME")!,
        password: requiredValue(environment, "BC_TEST_PASSWORD")!,
        room: requiredValue(environment, "BC_TEST_ROOM")!,
        targetMemberNumber: parsePositiveInteger(
            requiredValue(environment, "BC_TEST_TARGET_MEMBER_NUMBER")!,
            "BC_TEST_TARGET_MEMBER_NUMBER",
        ),
        timeoutMs,
    };
}

export function validateSafeCommand(command: string): string {
    const normalized = command.trim();
    if (/[^\x20-\x7e]/.test(normalized) || !normalized.startsWith("!")) {
        throw new QualificationError(
            "qualification command must be ASCII and start with !",
        );
    }

    const commandName = normalized.slice(1).split(/\s+/, 1)[0]?.toLowerCase();
    if (!commandName || !SAFE_COMMAND_NAMES.has(commandName)) {
        throw new QualificationError(
            `qualification command is not allowlisted: ${command}`,
        );
    }
    return normalized;
}

function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string,
): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new QualificationError(`${operation} timed out`)),
            timeoutMs,
        );
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

interface MessageWaiter {
    promise: Promise<API_Message>;
    dispose(): void;
}

function waitForResponse(
    connector: QualificationConnector,
    targetMemberNumber: number,
    timeoutMs: number,
): MessageWaiter {
    let timer: NodeJS.Timeout | undefined;
    let settled = false;
    let resolveResponse!: (message: API_Message) => void;
    let rejectResponse!: (error: Error) => void;
    const promise = new Promise<API_Message>((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
    });

    const onMessage = (event: API_Message) => {
        if (event.sender.MemberNumber !== targetMemberNumber) return;
        if (settled) return;
        settled = true;
        cleanup();
        resolveResponse(event);
    };
    const onDisconnected = (reason: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectResponse(
            new QualificationError(
                `disconnected while waiting for response: ${reason}`,
            ),
        );
    };
    const cleanup = () => {
        connector.off("Message", onMessage);
        connector.off("Disconnected", onDisconnected);
        if (timer) clearTimeout(timer);
    };

    connector.on("Message", onMessage);
    connector.on("Disconnected", onDisconnected);
    timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectResponse(new QualificationError("response timed out"));
    }, timeoutMs);

    return {
        promise,
        dispose: cleanup,
    };
}

function redact(value: string, config?: RealRoomTestConfig): string {
    let redacted = value;
    for (const secret of [
        config?.password,
        config?.username,
        config?.room,
        config?.serverUrl,
    ]) {
        if (secret) redacted = redacted.replaceAll(secret, "[redacted]");
    }
    return redacted;
}

export async function runRealRoomTestBot(
    config: RealRoomTestConfig,
    createConnector: QualificationConnectorFactory = (currentConfig) =>
        new API_Connector(
            currentConfig.serverUrl,
            currentConfig.username,
            currentConfig.password,
            currentConfig.environment,
            false,
        ),
): Promise<QualificationEvidence> {
    const command = validateSafeCommand(DEFAULT_SAFE_COMMAND);
    const connector = createConnector(config);
    const startedAt = new Date();

    try {
        await withTimeout(connector.login(), config.timeoutMs, "login");
        const joined = await withTimeout(
            connector.ChatRoomJoin(config.room),
            config.timeoutMs,
            "room join",
        );
        if (!joined) {
            throw new QualificationError("room join was rejected");
        }

        if (connector.chatRoom?.Name !== config.room) {
            throw new QualificationError(
                "joined room identity did not match configuration",
            );
        }

        const responseWaiter = waitForResponse(
            connector,
            config.targetMemberNumber,
            config.timeoutMs,
        );
        try {
            connector.SendMessage(
                "Whisper",
                command,
                config.targetMemberNumber,
            );
            const response = await responseWaiter.promise;
            return {
                runId: crypto.randomUUID(),
                startedAt: startedAt.toISOString(),
                finishedAt: new Date().toISOString(),
                environment: config.environment,
                room: config.room,
                accountRole: "dedicated-test-account",
                command,
                targetMemberNumber: config.targetMemberNumber,
                joined: true,
                response: {
                    senderMemberNumber: response.sender.MemberNumber,
                    type: response.message.Type,
                    content: response.message.Content,
                },
                disconnected: true,
            };
        } finally {
            responseWaiter.dispose();
        }
    } finally {
        connector.disconnect();
    }
}

export async function main(
    environment: NodeJS.ProcessEnv = process.env,
): Promise<number> {
    let config: ParsedRealRoomTestConfig;
    try {
        config = parseRealRoomTestConfig(environment);
    } catch (error) {
        logger.error(
            "Real-room qualification configuration rejected",
            undefined,
            {
                errorMessage: redact(
                    error instanceof Error ? error.message : String(error),
                ),
            },
        );
        return 1;
    }

    if (!config.enabled) {
        logger.info(
            "Real-room qualification is disabled; no connector was created",
        );
        return 0;
    }

    if (environment[DRY_RUN_ENVIRONMENT_VARIABLE] === "true") {
        logger.info(
            "Real-room qualification configuration validated in dry-run mode; no connector was created",
            {
                environment: config.environment,
                targetMemberNumber: config.targetMemberNumber,
            },
        );
        return 0;
    }

    try {
        const evidence = await runRealRoomTestBot(config);
        logger.info("Real-room qualification completed", {
            runId: evidence.runId,
            environment: evidence.environment,
            targetMemberNumber: evidence.targetMemberNumber,
            responseType: evidence.response.type,
            disconnected: evidence.disconnected,
        });
        return 0;
    } catch (error) {
        logger.error("Real-room qualification failed", undefined, {
            errorMessage: redact(
                error instanceof Error ? error.message : String(error),
                config,
            ),
            disconnected: true,
        });
        return 1;
    }
}

if (
    process.argv[1] &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
    void main().then((exitCode) => {
        process.exitCode = exitCode;
    });
}
