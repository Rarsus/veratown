import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
    API_Connector,
    type API_Message,
    type AppearancePacketDiagnostic,
    type TellType,
} from "bc-bot";
import {
    BUNNY_POSITIONS,
    PARK,
} from "../../bin/games/veratown/veratownConfig.ts";
import { createLogger } from "../../bin/logging/index.ts";

const logger = createLogger("RealRoomTestBot");

export const DEFAULT_SAFE_COMMAND = "!help";
export const SAFE_COMMAND_NAMES = new Set(["help"]);
export const MIN_TIMEOUT_MS = 100;
export const MAX_TIMEOUT_MS = 120_000;
export const DRY_RUN_ENVIRONMENT_VARIABLE = "BC_TEST_DRY_RUN";
export const DEFAULT_SCENARIO = "help";
export const BUNNY_STEP_SCENARIO = "bunny-step";
export const BUNNY_RELEASE_MAX_WAIT_MS = MAX_TIMEOUT_MS;
const BUNNY_RESTRAINT_KEYS = [
    "ItemArms/HeavyYoke",
    "ItemFeet/HeavySpreaderMetal",
] as const;

export interface MapPosition {
    X: number;
    Y: number;
}

export interface BunnyStepScenarioConfig {
    stagingPosition: MapPosition;
    bunnyPosition: MapPosition;
    expectedReleaseMs: number;
}

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
    scenario: typeof DEFAULT_SCENARIO | typeof BUNNY_STEP_SCENARIO;
    bunnyStep?: BunnyStepScenarioConfig;
}

export type ParsedRealRoomTestConfig =
    DisabledRealRoomTestConfig | RealRoomTestConfig;

export interface QualificationConnector {
    on(event: "Message", listener: (message: API_Message) => void): this;
    on(event: "Disconnected", listener: (reason: string) => void): this;
    on(
        event: "MapPosition",
        listener: (memberNumber: number, position: MapPosition) => void,
    ): this;
    on(
        event: "AppearanceSyncReceived",
        listener: (diagnostic: AppearancePacketDiagnostic) => void,
    ): this;
    off(event: "Message", listener: (message: API_Message) => void): this;
    off(event: "Disconnected", listener: (reason: string) => void): this;
    off(
        event: "MapPosition",
        listener: (memberNumber: number, position: MapPosition) => void,
    ): this;
    off(
        event: "AppearanceSyncReceived",
        listener: (diagnostic: AppearancePacketDiagnostic) => void,
    ): this;
    login(): Promise<void>;
    ChatRoomJoin(name: string): Promise<boolean>;
    SendMessage(type: TellType, message: string, target?: number): void;
    moveOnMapAndWait(x: number, y: number, timeoutMs?: number): Promise<void>;
    disconnect(): void;
    readonly Player: {
        readonly MemberNumber: number;
        readonly MapPos: MapPosition;
        readonly Appearance: {
            getAppearanceData(): readonly {
                Group: string;
                Name: string;
            }[];
        };
    };
    readonly chatRoom?: {
        readonly Name: string;
        readonly map?: {
            getObject(position: MapPosition): string | null;
        };
    };
}

export interface HelpQualificationEvidence {
    scenario: typeof DEFAULT_SCENARIO;
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

export interface BunnyStepQualificationEvidence {
    scenario: typeof BUNNY_STEP_SCENARIO;
    runId: string;
    startedAt: string;
    finishedAt: string;
    environment: "live" | "test";
    room: string;
    accountRole: "dedicated-test-account";
    memberNumber: number;
    stagingPosition: MapPosition;
    parkEntryPosition: MapPosition;
    bunnyPosition: MapPosition;
    parkEntryObservedAt: string;
    bunnyWarningObservedAt: string;
    punishmentObservedAt: string;
    releaseObservedAt: string;
    punishmentAppearanceKeys: string[];
    disconnected: true;
}

export type QualificationEvidence =
    HelpQualificationEvidence | BunnyStepQualificationEvidence;

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

function parseCoordinatePair(value: string, key: string): MapPosition {
    const parts = value.split(",").map((part) => part.trim());
    if (parts.length !== 2 || !parts.every((part) => /^\d+$/.test(part))) {
        throw new QualificationError(
            `${key} must use the format X,Y with non-negative integers`,
        );
    }
    const [x, y] = parts.map(Number);
    if (
        !Number.isSafeInteger(x) ||
        !Number.isSafeInteger(y) ||
        x > 39 ||
        y > 39
    ) {
        throw new QualificationError(
            `${key} must contain map coordinates between 0 and 39`,
        );
    }
    return { X: x, Y: y };
}

function isWithinRegion(position: MapPosition, region: typeof PARK): boolean {
    return (
        position.X >= region.TopLeft.X &&
        position.X <= region.BottomRight.X &&
        position.Y >= region.TopLeft.Y &&
        position.Y <= region.BottomRight.Y
    );
}

function samePosition(first: MapPosition, second: MapPosition): boolean {
    return first.X === second.X && first.Y === second.Y;
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
    const scenario =
        requiredValue(environment, "BC_TEST_SCENARIO") ?? DEFAULT_SCENARIO;
    if (scenario !== DEFAULT_SCENARIO && scenario !== BUNNY_STEP_SCENARIO) {
        throw new QualificationError(
            `BC_TEST_SCENARIO must be ${DEFAULT_SCENARIO} or ${BUNNY_STEP_SCENARIO}`,
        );
    }
    if (scenario === BUNNY_STEP_SCENARIO) {
        requiredKeys.push(
            "BC_TEST_BUNNY_STAGING_POSITION",
            "BC_TEST_BUNNY_POSITION",
            "BC_TEST_EXPECTED_RELEASE_MS",
            "BC_TEST_ALLOW_BUNNY_PUNISHMENT",
        );
    }
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

    const baseConfig = {
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
        scenario,
    };

    if (scenario === DEFAULT_SCENARIO) return baseConfig;

    if (environment.BC_TEST_ALLOW_BUNNY_PUNISHMENT !== "true") {
        throw new QualificationError(
            "BC_TEST_ALLOW_BUNNY_PUNISHMENT must equal true for bunny-step",
        );
    }

    const stagingPosition = parseCoordinatePair(
        requiredValue(environment, "BC_TEST_BUNNY_STAGING_POSITION")!,
        "BC_TEST_BUNNY_STAGING_POSITION",
    );
    const bunnyPosition = parseCoordinatePair(
        requiredValue(environment, "BC_TEST_BUNNY_POSITION")!,
        "BC_TEST_BUNNY_POSITION",
    );
    if (isWithinRegion(stagingPosition, PARK)) {
        throw new QualificationError(
            "BC_TEST_BUNNY_STAGING_POSITION must be outside the park",
        );
    }
    if (!isWithinRegion(bunnyPosition, PARK)) {
        throw new QualificationError(
            "BC_TEST_BUNNY_POSITION must be inside the park",
        );
    }
    if (
        !BUNNY_POSITIONS.some((position) =>
            samePosition(position, bunnyPosition),
        )
    ) {
        throw new QualificationError(
            "BC_TEST_BUNNY_POSITION must be one of the configured bunny positions",
        );
    }
    if (samePosition(stagingPosition, bunnyPosition)) {
        throw new QualificationError(
            "BC_TEST_BUNNY_STAGING_POSITION and BC_TEST_BUNNY_POSITION must differ",
        );
    }

    const expectedReleaseMs = parsePositiveInteger(
        requiredValue(environment, "BC_TEST_EXPECTED_RELEASE_MS")!,
        "BC_TEST_EXPECTED_RELEASE_MS",
    );
    if (expectedReleaseMs > BUNNY_RELEASE_MAX_WAIT_MS) {
        throw new QualificationError(
            `BC_TEST_EXPECTED_RELEASE_MS must be at most ${BUNNY_RELEASE_MAX_WAIT_MS}`,
        );
    }

    return {
        ...baseConfig,
        bunnyStep: {
            stagingPosition,
            bunnyPosition,
            expectedReleaseMs,
        },
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
    return waitForMessage(
        connector,
        (event) => event.sender.MemberNumber === targetMemberNumber,
        timeoutMs,
        "response",
    );
}

function waitForMessage(
    connector: QualificationConnector,
    predicate: (message: API_Message) => boolean,
    timeoutMs: number,
    description: string,
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
        if (!predicate(event)) return;
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
        rejectResponse(new QualificationError(`${description} timed out`));
    }, timeoutMs);

    return {
        promise,
        dispose: cleanup,
    };
}

function waitForAppearance(
    connector: QualificationConnector,
    predicate: (diagnostic: AppearancePacketDiagnostic) => boolean,
    timeoutMs: number,
    description: string,
): { promise: Promise<AppearancePacketDiagnostic>; dispose(): void } {
    let timer: NodeJS.Timeout | undefined;
    let settled = false;
    let resolveAppearance!: (diagnostic: AppearancePacketDiagnostic) => void;
    let rejectAppearance!: (error: Error) => void;
    const promise = new Promise<AppearancePacketDiagnostic>(
        (resolve, reject) => {
            resolveAppearance = resolve;
            rejectAppearance = reject;
        },
    );

    const onAppearance = (diagnostic: AppearancePacketDiagnostic) => {
        if (!predicate(diagnostic)) return;
        if (settled) return;
        settled = true;
        cleanup();
        resolveAppearance(diagnostic);
    };
    const onDisconnected = (reason: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectAppearance(
            new QualificationError(
                `disconnected while waiting for ${description}: ${reason}`,
            ),
        );
    };
    const cleanup = () => {
        connector.off("AppearanceSyncReceived", onAppearance);
        connector.off("Disconnected", onDisconnected);
        if (timer) clearTimeout(timer);
    };

    connector.on("AppearanceSyncReceived", onAppearance);
    connector.on("Disconnected", onDisconnected);
    timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectAppearance(new QualificationError(`${description} timed out`));
    }, timeoutMs);

    return { promise, dispose: cleanup };
}

function appearanceHasKeys(
    diagnostic: AppearancePacketDiagnostic,
    memberNumber: number,
    keys: readonly string[],
): boolean {
    return (
        diagnostic.memberNumber === memberNumber &&
        keys.every((key) =>
            diagnostic.appearance.some(
                (item) => `${item.Group}/${item.Name}` === key,
            ),
        )
    );
}

function appearanceHasNoKeys(
    diagnostic: AppearancePacketDiagnostic,
    memberNumber: number,
    keys: readonly string[],
): boolean {
    return (
        diagnostic.memberNumber === memberNumber &&
        keys.every(
            (key) =>
                !diagnostic.appearance.some(
                    (item) => `${item.Group}/${item.Name}` === key,
                ),
        )
    );
}

async function runHelpScenario(
    config: RealRoomTestConfig,
    connector: QualificationConnector,
    startedAt: Date,
): Promise<HelpQualificationEvidence> {
    const command = validateSafeCommand(DEFAULT_SAFE_COMMAND);
    const responseWaiter = waitForResponse(
        connector,
        config.targetMemberNumber,
        config.timeoutMs,
    );
    try {
        connector.SendMessage("Whisper", command, config.targetMemberNumber);
        const response = await responseWaiter.promise;
        return {
            scenario: DEFAULT_SCENARIO,
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
}

async function runBunnyStepScenario(
    config: RealRoomTestConfig,
    connector: QualificationConnector,
    startedAt: Date,
): Promise<BunnyStepQualificationEvidence> {
    const bunnyStep = config.bunnyStep;
    if (!bunnyStep) {
        throw new QualificationError("bunny-step configuration is missing");
    }

    const memberNumber = connector.Player.MemberNumber;
    const currentAppearance = connector.Player.Appearance.getAppearanceData();
    if (
        BUNNY_RESTRAINT_KEYS.some((key) =>
            currentAppearance.some(
                (item) => `${item.Group}/${item.Name}` === key,
            ),
        )
    ) {
        throw new QualificationError(
            "dedicated test account already has a bunny restraint equipped",
        );
    }

    const bunnyObject = connector.chatRoom?.map?.getObject(
        bunnyStep.bunnyPosition,
    );
    if (bunnyObject !== "RabbitBrownStand") {
        throw new QualificationError(
            `configured bunny position is not RabbitBrownStand: ${bunnyObject ?? "empty"}`,
        );
    }

    await withTimeout(
        connector.moveOnMapAndWait(
            bunnyStep.stagingPosition.X,
            bunnyStep.stagingPosition.Y,
            config.timeoutMs,
        ),
        config.timeoutMs,
        "staging movement",
    );
    await withTimeout(
        connector.moveOnMapAndWait(
            PARK.TopLeft.X,
            PARK.TopLeft.Y,
            config.timeoutMs,
        ),
        config.timeoutMs,
        "park entry movement",
    );
    const parkEntryObservedAt = new Date().toISOString();

    const warningWaiter = waitForMessage(
        connector,
        (message) =>
            message.message.Content.toLowerCase().includes(
                "step on the park's bunnies",
            ),
        config.timeoutMs,
        "bunny warning",
    );
    const punishmentWaiter = waitForAppearance(
        connector,
        (diagnostic) =>
            appearanceHasKeys(diagnostic, memberNumber, BUNNY_RESTRAINT_KEYS),
        config.timeoutMs,
        "bunny punishment appearance",
    );
    try {
        await withTimeout(
            connector.moveOnMapAndWait(
                bunnyStep.bunnyPosition.X,
                bunnyStep.bunnyPosition.Y,
                config.timeoutMs,
            ),
            config.timeoutMs,
            "bunny movement",
        );
        const [warning, punishment] = await Promise.all([
            warningWaiter.promise,
            punishmentWaiter.promise,
        ]);
        const releaseWaiter = waitForAppearance(
            connector,
            (diagnostic) =>
                appearanceHasNoKeys(
                    diagnostic,
                    memberNumber,
                    BUNNY_RESTRAINT_KEYS,
                ),
            Math.min(
                BUNNY_RELEASE_MAX_WAIT_MS,
                bunnyStep.expectedReleaseMs + config.timeoutMs,
            ),
            "bunny punishment release",
        );
        try {
            await releaseWaiter.promise;
        } finally {
            releaseWaiter.dispose();
        }
        return {
            scenario: BUNNY_STEP_SCENARIO,
            runId: crypto.randomUUID(),
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            environment: config.environment,
            room: config.room,
            accountRole: "dedicated-test-account",
            memberNumber,
            stagingPosition: bunnyStep.stagingPosition,
            parkEntryPosition: PARK.TopLeft,
            bunnyPosition: bunnyStep.bunnyPosition,
            parkEntryObservedAt,
            bunnyWarningObservedAt: new Date().toISOString(),
            punishmentObservedAt: new Date().toISOString(),
            releaseObservedAt: new Date().toISOString(),
            punishmentAppearanceKeys: punishment.itemKeys,
            disconnected: true,
        };
    } finally {
        warningWaiter.dispose();
        punishmentWaiter.dispose();
    }
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

        if (config.scenario === BUNNY_STEP_SCENARIO) {
            return await runBunnyStepScenario(config, connector, startedAt);
        }
        return await runHelpScenario(config, connector, startedAt);
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
            scenario: evidence.scenario,
            environment: evidence.environment,
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
