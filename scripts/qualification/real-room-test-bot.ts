import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
    API_Connector,
    type API_Message,
    type AppearanceItemUpdateDiagnostic,
    type AppearancePacketDiagnostic,
    type TellType,
} from "bc-bot";
import {
    BUNNY_POSITIONS,
    PARK,
} from "../../bin/games/veratown/veratownConfig.ts";
import { createLogger } from "../../bin/logging/index.ts";
import { writeQualificationEvidence } from "./qualificationEvidence.ts";
import {
    findMovementRoute,
    type QualificationMapData,
} from "./movementPathfinder.ts";

const logger = createLogger("RealRoomTestBot");

export const DEFAULT_SAFE_COMMAND = "!help";
export const SAFE_COMMAND_NAMES = new Set(["help"]);
export const MIN_TIMEOUT_MS = 100;
export const MAX_TIMEOUT_MS = 120_000;
export const DRY_RUN_ENVIRONMENT_VARIABLE = "BC_TEST_DRY_RUN";
export const DEFAULT_SCENARIO = "help";
export const BUNNY_STEP_SCENARIO = "bunny-step";
export const TRANSPORT_MATRIX_SCENARIO = "transport-matrix";
export const RECONNECT_SCENARIO = "reconnect";
export const RELEASE_OBSERVE_SCENARIO = "release-observe";
export const RELEASE_MONITOR_SCENARIO = "release-monitor";
export const RELEASE_TEST_SCENARIO = "release-test";
export const MOVEMENT_PATH_SCENARIO = "movement-path";
export const BUNNY_RELEASE_MAX_WAIT_MS = MAX_TIMEOUT_MS;
const MOVEMENT_STEP_DELAY_MS = 1_000;
const RELEASE_TEST_FIXTURES = new Set([
    "ItemArms/HeavyYoke",
    "ItemFeet/HeavySpreaderMetal",
]);
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

export interface ReleaseTestScenarioConfig {
    allowMutation: true;
    fixtureGroup: string;
    fixtureName: string;
}

export interface MovementPathScenarioConfig {
    allowMovement: true;
    confirmationRoom: string;
    startPosition: MapPosition;
    minSteps: number;
    maxSteps: number;
    targetPosition?: MapPosition;
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
    scenario:
        | typeof DEFAULT_SCENARIO
        | typeof BUNNY_STEP_SCENARIO
        | typeof TRANSPORT_MATRIX_SCENARIO
        | typeof RECONNECT_SCENARIO
        | typeof RELEASE_OBSERVE_SCENARIO
        | typeof RELEASE_TEST_SCENARIO
        | typeof MOVEMENT_PATH_SCENARIO;
    bunnyStep?: BunnyStepScenarioConfig;
    releaseTest?: ReleaseTestScenarioConfig;
    movementPath?: MovementPathScenarioConfig;
}

export type ParsedRealRoomTestConfig =
    DisabledRealRoomTestConfig | RealRoomTestConfig;

export interface QualificationConnector {
    on(event: "Connected", listener: () => void): this;
    on(event: "Message", listener: (message: API_Message) => void): this;
    on(event: "Disconnected", listener: (reason: string) => void): this;
    on(
        event: "MapPosition",
        listener: (memberNumber: number, position: MapPosition) => void,
    ): this;
    on(
        event: "MapPositionObserved",
        listener: (
            memberNumber: number,
            position: MapPosition,
            connectionEpoch: number,
        ) => void,
    ): this;
    on(
        event: "AppearanceSyncReceived",
        listener: (diagnostic: AppearancePacketDiagnostic) => void,
    ): this;
    on(
        event: "AppearanceItemUpdateReceived",
        listener: (diagnostic: AppearanceItemUpdateDiagnostic) => void,
    ): this;
    on(
        event: "CharacterSync",
        listener: (character: {
            MemberNumber: number;
            MapPos: MapPosition;
            Appearance: {
                getAppearanceData(): readonly { Group: string; Name: string }[];
            };
        }) => void,
    ): this;
    off(event: "Message", listener: (message: API_Message) => void): this;
    off(event: "Disconnected", listener: (reason: string) => void): this;
    off(event: "Connected", listener: () => void): this;
    off(
        event: "MapPosition",
        listener: (memberNumber: number, position: MapPosition) => void,
    ): this;
    off(
        event: "MapPositionObserved",
        listener: (
            memberNumber: number,
            position: MapPosition,
            connectionEpoch: number,
        ) => void,
    ): this;
    off(
        event: "AppearanceSyncReceived",
        listener: (diagnostic: AppearancePacketDiagnostic) => void,
    ): this;
    off(
        event: "AppearanceItemUpdateReceived",
        listener: (diagnostic: AppearanceItemUpdateDiagnostic) => void,
    ): this;
    off(
        event: "CharacterSync",
        listener: (character: {
            MemberNumber: number;
            MapPos: MapPosition;
            Appearance: {
                getAppearanceData(): readonly { Group: string; Name: string }[];
            };
        }) => void,
    ): this;
    login(): Promise<void>;
    ChatRoomJoin(name: string): Promise<boolean>;
    SendMessage(type: TellType, message: string, target?: number): void;
    reconnect?(): Promise<void>;
    moveOnMap(x: number, y: number): void;
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
            AddItem(item: { Group: string; Name: string }): void;
            RemoveItem(group: string): void;
        };
        sendAppearanceUpdate(): void;
    };
    readonly chatRoom?: {
        readonly Name: string;
        readonly characters?: readonly {
            MemberNumber: number;
            MapPos: MapPosition;
            Appearance: {
                getAppearanceData(): readonly {
                    Group: string;
                    Name: string;
                }[];
            };
        }[];
        readonly map?: {
            getObject(position: MapPosition): string | null;
            readonly mapData?: QualificationMapData;
        };
    };
}

export interface HelpQualificationEvidence {
    scenario: typeof DEFAULT_SCENARIO;
    runId: string;
    operationId: string;
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
    operationId: string;
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

export interface TransportMatrixQualificationEvidence {
    scenario: typeof TRANSPORT_MATRIX_SCENARIO;
    runId: string;
    operationId: string;
    startedAt: string;
    finishedAt: string;
    environment: "live" | "test";
    room: string;
    accountRole: "dedicated-test-account";
    joined: true;
    transports: Array<{
        type: "Whisper" | "Chat" | "Emote";
        marker: string;
        observed: boolean;
    }>;
    disconnected: true;
}

export interface ReconnectQualificationEvidence {
    scenario: typeof RECONNECT_SCENARIO;
    runId: string;
    operationId: string;
    startedAt: string;
    finishedAt: string;
    environment: "live" | "test";
    room: string;
    accountRole: "dedicated-test-account";
    joined: true;
    reconnectObserved: true;
    roomAfterReconnect: string;
    disconnected: true;
}

export interface ReleaseObserveQualificationEvidence {
    scenario: typeof RELEASE_OBSERVE_SCENARIO;
    runId: string;
    operationId: string;
    startedAt: string;
    finishedAt: string;
    environment: "live" | "test";
    room: string;
    accountRole: "dedicated-test-account";
    memberNumber: number;
    command: string;
    targetMemberNumber: number;
    appearanceBefore: string[];
    appearanceAfter: string[];
    mutationAttempted: false;
    unchanged: true;
    disconnected: true;
}

export interface ReleaseMonitorQualificationEvidence {
    scenario: typeof RELEASE_MONITOR_SCENARIO;
    runId: string;
    operationId: string;
    startedAt: string;
    finishedAt: string;
    environment: "live" | "test";
    room: string;
    accountRole: "dedicated-test-account";
    memberNumber: number;
    targetMemberNumber: number;
    appearanceBefore: string[];
    appearanceAfter: string[];
    mapPositionBefore: MapPosition;
    mapPositionAfter: MapPosition;
    authoritativeSyncObserved: true;
    mutationAttempted: false;
    disconnected: true;
}

export interface ReleaseTestQualificationEvidence {
    scenario: typeof RELEASE_TEST_SCENARIO;
    runId: string;
    operationId: string;
    startedAt: string;
    finishedAt: string;
    environment: "live";
    room: string;
    accountRole: "dedicated-test-account";
    memberNumber: number;
    command: "!release";
    confirmationCommand: "!release yes";
    targetMemberNumber: number;
    fixture: string;
    appearanceBefore: string[];
    appearanceAfter: string[];
    mutationAttempted: true;
    fixtureAdded: true;
    fixtureRemoved: true;
    confirmationObserved: true;
    punishmentRoomProgressed: true;
    postReleasePosition: MapPosition;
    disconnected: true;
}

export interface MovementPathQualificationEvidence {
    scenario: typeof MOVEMENT_PATH_SCENARIO;
    runId: string;
    operationId: string;
    operationIds: string[];
    startedAt: string;
    finishedAt: string;
    environment: "live" | "test";
    room: string;
    accountRole: "dedicated-test-account";
    memberNumber: number;
    map: {
        source: "live-room-map";
        width: 40;
        height: 40;
        mapHash: string;
        walkableTileCount: number;
    };
    startPosition: MapPosition;
    startPositionSource: "configured-visual-confirmation";
    targetPosition: MapPosition;
    route: MapPosition[];
    movements: Array<{
        operationId: string;
        requestedPosition: MapPosition;
        observedPosition: MapPosition;
        observedAt: string;
        connectionEpoch: number;
    }>;
    finalPosition: MapPosition;
    authoritativeObservations: true;
    disconnected: true;
}
export type QualificationEvidence =
    | HelpQualificationEvidence
    | BunnyStepQualificationEvidence
    | TransportMatrixQualificationEvidence
    | ReconnectQualificationEvidence
    | ReleaseObserveQualificationEvidence
    | ReleaseMonitorQualificationEvidence
    | ReleaseTestQualificationEvidence
    | MovementPathQualificationEvidence;

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
    if (
        scenario !== DEFAULT_SCENARIO &&
        scenario !== BUNNY_STEP_SCENARIO &&
        scenario !== TRANSPORT_MATRIX_SCENARIO &&
        scenario !== RECONNECT_SCENARIO &&
        scenario !== RELEASE_OBSERVE_SCENARIO &&
        scenario !== RELEASE_MONITOR_SCENARIO &&
        scenario !== RELEASE_TEST_SCENARIO &&
        scenario !== MOVEMENT_PATH_SCENARIO
    ) {
        throw new QualificationError(
            `BC_TEST_SCENARIO must be ${DEFAULT_SCENARIO}, ${BUNNY_STEP_SCENARIO}, ${TRANSPORT_MATRIX_SCENARIO}, ${RECONNECT_SCENARIO}, ${RELEASE_OBSERVE_SCENARIO}, ${RELEASE_MONITOR_SCENARIO}, ${RELEASE_TEST_SCENARIO}, or ${MOVEMENT_PATH_SCENARIO}`,
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
    if (scenario === RELEASE_TEST_SCENARIO) {
        requiredKeys.push(
            "BC_TEST_ALLOW_RELEASE_MUTATION",
            "BC_TEST_RELEASE_CONFIRM_ROOM",
            "BC_TEST_RELEASE_FIXTURE",
        );
    }
    if (scenario === MOVEMENT_PATH_SCENARIO) {
        requiredKeys.push(
            "BC_TEST_ALLOW_MOVEMENT",
            "BC_TEST_MOVEMENT_CONFIRM_ROOM",
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
    if (scenario === MOVEMENT_PATH_SCENARIO) {
        if (environment.BC_TEST_ALLOW_MOVEMENT !== "true") {
            throw new QualificationError(
                "BC_TEST_ALLOW_MOVEMENT must equal true for movement-path",
            );
        }
        if (
            requiredValue(environment, "BC_TEST_MOVEMENT_CONFIRM_ROOM") !==
            baseConfig.room
        ) {
            throw new QualificationError(
                "BC_TEST_MOVEMENT_CONFIRM_ROOM must exactly match BC_TEST_ROOM",
            );
        }
        const minSteps = parsePositiveInteger(
            requiredValue(environment, "BC_TEST_MOVEMENT_MIN_STEPS") ?? "2",
            "BC_TEST_MOVEMENT_MIN_STEPS",
        );
        const maxSteps = parsePositiveInteger(
            requiredValue(environment, "BC_TEST_MOVEMENT_MAX_STEPS") ?? "12",
            "BC_TEST_MOVEMENT_MAX_STEPS",
        );
        if (maxSteps < minSteps || maxSteps > 1600) {
            throw new QualificationError(
                "BC_TEST_MOVEMENT_MAX_STEPS must be between the minimum and 1600",
            );
        }
        const startValue =
            requiredValue(environment, "BC_TEST_MOVEMENT_START_POSITION") ??
            "19,17";
        const targetValue = requiredValue(
            environment,
            "BC_TEST_MOVEMENT_TARGET_POSITION",
        );
        return {
            ...baseConfig,
            movementPath: {
                allowMovement: true,
                confirmationRoom: baseConfig.room,
                startPosition: parseCoordinatePair(
                    startValue,
                    "BC_TEST_MOVEMENT_START_POSITION",
                ),
                minSteps,
                maxSteps,
                targetPosition: targetValue
                    ? parseCoordinatePair(
                          targetValue,
                          "BC_TEST_MOVEMENT_TARGET_POSITION",
                      )
                    : undefined,
            },
        };
    }
    if (scenario === RELEASE_TEST_SCENARIO) {
        if (environmentName !== "live") {
            throw new QualificationError(
                "release-test requires BC_TEST_ENV=live",
            );
        }
        if (environment.BC_TEST_ALLOW_RELEASE_MUTATION !== "true") {
            throw new QualificationError(
                "BC_TEST_ALLOW_RELEASE_MUTATION must equal true for release-test",
            );
        }
        if (
            requiredValue(environment, "BC_TEST_RELEASE_CONFIRM_ROOM") !==
            baseConfig.room
        ) {
            throw new QualificationError(
                "BC_TEST_RELEASE_CONFIRM_ROOM must exactly match BC_TEST_ROOM",
            );
        }
        const fixture = requiredValue(environment, "BC_TEST_RELEASE_FIXTURE")!;
        if (!RELEASE_TEST_FIXTURES.has(fixture)) {
            throw new QualificationError(
                "BC_TEST_RELEASE_FIXTURE must be ItemArms/HeavyYoke or ItemFeet/HeavySpreaderMetal",
            );
        }
        const separator = fixture.indexOf("/");
        return {
            ...baseConfig,
            releaseTest: {
                allowMutation: true,
                fixtureGroup: fixture.slice(0, separator),
                fixtureName: fixture.slice(separator + 1),
            },
        };
    }
    if (scenario !== BUNNY_STEP_SCENARIO) return baseConfig;

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

function waitForAuthoritativeMovement(
    connector: QualificationConnector,
    memberNumber: number,
    target: MapPosition,
    timeoutMs: number,
): {
    promise: Promise<{
        position: MapPosition;
        observedAt: string;
        connectionEpoch: number;
    }>;
    dispose(): void;
} {
    let timer: NodeJS.Timeout | undefined;
    let settled = false;
    let resolveMovement!: (observation: {
        position: MapPosition;
        observedAt: string;
        connectionEpoch: number;
    }) => void;
    let rejectMovement!: (error: Error) => void;
    const promise = new Promise<{
        position: MapPosition;
        observedAt: string;
        connectionEpoch: number;
    }>((resolve, reject) => {
        resolveMovement = resolve;
        rejectMovement = reject;
    });
    const onObserved = (
        observedMemberNumber: number,
        position: MapPosition,
        connectionEpoch: number,
    ) => {
        if (
            observedMemberNumber !== memberNumber ||
            !samePosition(position, target) ||
            settled
        ) {
            return;
        }
        settled = true;
        cleanup();
        resolveMovement({
            position: { ...position },
            observedAt: new Date().toISOString(),
            connectionEpoch,
        });
    };
    const onDisconnected = (reason: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectMovement(
            new QualificationError(
                `disconnected while waiting for authoritative movement: ${reason}`,
            ),
        );
    };
    const cleanup = () => {
        connector.off("MapPositionObserved", onObserved);
        connector.off("Disconnected", onDisconnected);
        if (timer) clearTimeout(timer);
    };

    connector.on("MapPositionObserved", onObserved);
    connector.on("Disconnected", onDisconnected);
    timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectMovement(
            new QualificationError(
                `authoritative movement to (${target.X},${target.Y}) timed out`,
            ),
        );
    }, timeoutMs);

    try {
        connector.moveOnMap(target.X, target.Y);
    } catch (error) {
        settled = true;
        cleanup();
        rejectMovement(
            error instanceof Error ? error : new Error(String(error)),
        );
    }

    return { promise, dispose: cleanup };
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

async function waitForReleaseReady(
    connector: QualificationConnector,
    targetMemberNumber: number,
    timeoutMs: number,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const remainingMs = deadline - Date.now();
        const responseWaiter = waitForMessage(
            connector,
            (message) =>
                message.sender.MemberNumber === targetMemberNumber &&
                (message.message.Content.includes(
                    "Release requires confirmation",
                ) ||
                    message.message.Content.includes(
                        "PAROLE CONFIRMATION REQUIRED",
                    ) ||
                    message.message.Content.includes("currently unavailable")),
            remainingMs,
            "release readiness response",
        );
        try {
            connector.SendMessage("Whisper", "!release", targetMemberNumber);
            const response = await responseWaiter.promise;
            if (response.message.Content.includes("currently unavailable")) {
                await new Promise((resolve) => setTimeout(resolve, 250));
                continue;
            }

            const cancellationWaiter = waitForMessage(
                connector,
                (message) =>
                    message.sender.MemberNumber === targetMemberNumber &&
                    message.message.Content.includes("Release cancelled"),
                Math.max(1, deadline - Date.now()),
                "release readiness cancellation",
            );
            try {
                connector.SendMessage(
                    "Whisper",
                    "!release no",
                    targetMemberNumber,
                );
                await cancellationWaiter.promise;
            } finally {
                cancellationWaiter.dispose();
            }
            return;
        } finally {
            responseWaiter.dispose();
        }
    }
    throw new QualificationError("release readiness timed out");
}

function waitForAppearance(
    connector: QualificationConnector,
    predicate: (diagnostic: AppearancePacketDiagnostic) => boolean,
    timeoutMs: number,
    description: string,
    baselineAppearance?: readonly {
        Group: string;
        Name: string;
    }[],
    trackedGroups?: readonly string[],
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

    type ObservedItem = AppearancePacketDiagnostic["appearance"][number];
    const knownAppearance = new Map<string, ObservedItem>();
    for (const item of baselineAppearance ??
        connector.Player.Appearance.getAppearanceData()) {
        knownAppearance.set(item.Group, item as ObservedItem);
    }
    const onAppearance = (diagnostic: AppearancePacketDiagnostic) => {
        if (diagnostic.appearance.length === 0) {
            knownAppearance.clear();
        } else {
            const receivedGroups = new Set(
                diagnostic.appearance.map((item) => item.Group),
            );
            for (const item of diagnostic.appearance) {
                if (item.Name) knownAppearance.set(item.Group, item);
                else knownAppearance.delete(item.Group);
            }
            for (const group of trackedGroups ?? []) {
                if (!receivedGroups.has(group)) knownAppearance.delete(group);
            }
        }
        const mergedAppearance = Array.from(knownAppearance.values());
        const mergedDiagnostic = {
            ...diagnostic,
            itemKeys: mergedAppearance.map(
                (item) => `${item.Group}/${item.Name}`,
            ),
            appearance: mergedAppearance,
        };
        if (!predicate(mergedDiagnostic)) return;
        if (settled) return;
        settled = true;
        cleanup();
        resolveAppearance(mergedDiagnostic);
    };
    const onItemAppearance = (diagnostic: AppearanceItemUpdateDiagnostic) => {
        if (diagnostic.targetMemberNumber !== connector.Player.MemberNumber)
            return;
        queueMicrotask(() => {
            onAppearance({
                connectionId: diagnostic.connectionId,
                direction: "inbound",
                memberNumber: diagnostic.targetMemberNumber,
                timestamp: diagnostic.timestamp,
                itemKeys: connector.Player.Appearance.getAppearanceData().map(
                    (item) => `${item.Group}/${item.Name}`,
                ),
                lockShapes: [],
                appearance: connector.Player.Appearance.getAppearanceData(),
            });
        });
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
        connector.off("AppearanceItemUpdateReceived", onItemAppearance);
        connector.off("Disconnected", onDisconnected);
        if (timer) clearTimeout(timer);
    };

    connector.on("AppearanceSyncReceived", onAppearance);
    connector.on("AppearanceItemUpdateReceived", onItemAppearance);
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

async function runTransportMatrixScenario(
    config: RealRoomTestConfig,
    connector: QualificationConnector,
    startedAt: Date,
    runId: string,
): Promise<TransportMatrixQualificationEvidence> {
    const transports: Array<{
        type: "Whisper" | "Chat" | "Emote";
        marker: string;
        observed: boolean;
    }> = [];
    const ownMemberNumber = connector.Player.MemberNumber;
    const chatMarker = `qualification-${runId}-chat`;
    const emoteMarker = `qualification-${runId}-emote`;
    const cases: Array<{
        type: "Whisper" | "Chat" | "Emote";
        marker: string;
        target?: number;
        predicate: (message: API_Message) => boolean;
    }> = [
        {
            type: "Whisper",
            marker: DEFAULT_SAFE_COMMAND,
            target: config.targetMemberNumber,
            predicate: (message) =>
                message.sender.MemberNumber === config.targetMemberNumber &&
                message.message.Type === "Whisper",
        },
        {
            type: "Chat",
            marker: chatMarker,
            predicate: (message) =>
                message.sender.MemberNumber === ownMemberNumber &&
                message.message.Type === "Chat" &&
                message.message.Content.includes(chatMarker),
        },
        {
            type: "Emote",
            marker: emoteMarker,
            predicate: (message) =>
                message.sender.MemberNumber === ownMemberNumber &&
                message.message.Type === "Emote" &&
                message.message.Content.includes(emoteMarker),
        },
    ];

    for (const currentCase of cases) {
        const waiter = waitForMessage(
            connector,
            currentCase.predicate,
            config.timeoutMs,
            `${currentCase.type.toLowerCase()} transport observation`,
        );
        try {
            connector.SendMessage(
                currentCase.type,
                currentCase.marker,
                currentCase.target,
            );
            await waiter.promise;
            transports.push({ ...currentCase, observed: true });
        } finally {
            waiter.dispose();
        }
    }

    return {
        scenario: TRANSPORT_MATRIX_SCENARIO,
        runId,
        operationId: `qualification:${runId}`,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        environment: config.environment,
        room: config.room,
        accountRole: "dedicated-test-account",
        joined: true,
        transports,
        disconnected: true,
    };
}

async function runReconnectScenario(
    config: RealRoomTestConfig,
    connector: QualificationConnector,
    startedAt: Date,
    runId: string,
): Promise<ReconnectQualificationEvidence> {
    if (!connector.reconnect) {
        throw new QualificationError(
            "reconnect qualification is unavailable for this connector",
        );
    }
    await withTimeout(connector.reconnect(), config.timeoutMs, "reconnect");
    if (connector.chatRoom?.Name !== config.room) {
        throw new QualificationError(
            "room identity did not survive reconnect qualification",
        );
    }
    return {
        scenario: RECONNECT_SCENARIO,
        runId,
        operationId: `qualification:${runId}`,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        environment: config.environment,
        room: config.room,
        accountRole: "dedicated-test-account",
        joined: true,
        reconnectObserved: true,
        roomAfterReconnect: connector.chatRoom.Name,
        disconnected: true,
    };
}

async function runHelpScenario(
    config: RealRoomTestConfig,
    connector: QualificationConnector,
    startedAt: Date,
    runId: string,
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
            runId,
            operationId: `qualification:${runId}`,
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

async function runReleaseObserveScenario(
    config: RealRoomTestConfig,
    connector: QualificationConnector,
    startedAt: Date,
    runId: string,
): Promise<ReleaseObserveQualificationEvidence> {
    const command = validateSafeCommand(DEFAULT_SAFE_COMMAND);
    const appearanceBefore = connector.Player.Appearance.getAppearanceData()
        .map((item) => `${item.Group}/${item.Name}`)
        .sort();
    const responseWaiter = waitForResponse(
        connector,
        config.targetMemberNumber,
        config.timeoutMs,
    );
    try {
        connector.SendMessage("Whisper", command, config.targetMemberNumber);
        await responseWaiter.promise;
        const appearanceAfter = connector.Player.Appearance.getAppearanceData()
            .map((item) => `${item.Group}/${item.Name}`)
            .sort();
        if (
            appearanceBefore.length !== appearanceAfter.length ||
            appearanceBefore.some(
                (item, index) => item !== appearanceAfter[index],
            )
        ) {
            throw new QualificationError(
                "release-observe detected an unexpected appearance mutation",
            );
        }
        return {
            scenario: RELEASE_OBSERVE_SCENARIO,
            runId,
            operationId: `qualification:${runId}`,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            environment: config.environment,
            room: config.room,
            accountRole: "dedicated-test-account",
            memberNumber: connector.Player.MemberNumber,
            command,
            targetMemberNumber: config.targetMemberNumber,
            appearanceBefore,
            appearanceAfter,
            mutationAttempted: false,
            unchanged: true,
            disconnected: true,
        };
    } finally {
        responseWaiter.dispose();
    }
}

async function runReleaseMonitorScenario(
    config: RealRoomTestConfig,
    connector: QualificationConnector,
    startedAt: Date,
    runId: string,
): Promise<ReleaseMonitorQualificationEvidence> {
    const target = await new Promise<{
        appearance: string[];
        mapPosition: MapPosition;
    }>((resolve, reject) => {
        let settled = false;
        let interval: NodeJS.Timeout | undefined;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(
                new QualificationError(
                    `target ${config.targetMemberNumber} was not found`,
                ),
            );
        }, config.timeoutMs);
        const cleanup = () => {
            clearTimeout(timer);
            if (interval) clearInterval(interval);
            connector.off("CharacterSync", onCharacterSync);
            connector.off("Disconnected", onDisconnected);
        };
        const check = () => {
            const character = connector.chatRoom?.characters?.find(
                (candidate) =>
                    candidate.MemberNumber === config.targetMemberNumber,
            );
            if (!character || settled) return;
            settled = true;
            cleanup();
            resolve({
                appearance: character.Appearance.getAppearanceData()
                    .map((item) => `${item.Group}/${item.Name}`)
                    .sort(),
                mapPosition: { ...character.MapPos },
            });
        };
        const onCharacterSync = (character: { MemberNumber: number }) => {
            if (character.MemberNumber === config.targetMemberNumber) check();
        };
        const onDisconnected = (reason: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(
                new QualificationError(
                    `disconnected while locating target: ${reason}`,
                ),
            );
        };
        connector.on("CharacterSync", onCharacterSync);
        connector.on("Disconnected", onDisconnected);
        interval = setInterval(check, 100);
        check();
    });

    return await new Promise<ReleaseMonitorQualificationEvidence>(
        (resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(
                    new QualificationError(
                        `authoritative release appearance sync for ${config.targetMemberNumber} timed out`,
                    ),
                );
            }, config.timeoutMs);
            const cleanup = () => {
                clearTimeout(timer);
                connector.off("CharacterSync", onCharacterSync);
                connector.off("MapPosition", onMapPosition);
                connector.off("Disconnected", onDisconnected);
            };
            const mapPositionAfter = { ...target.mapPosition };
            const onMapPosition = (
                memberNumber: number,
                position: MapPosition,
            ) => {
                if (memberNumber === config.targetMemberNumber) {
                    mapPositionAfter.X = position.X;
                    mapPositionAfter.Y = position.Y;
                }
            };
            const onCharacterSync = (character: {
                MemberNumber: number;
                MapPos: MapPosition;
                Appearance: {
                    getAppearanceData(): readonly {
                        Group: string;
                        Name: string;
                    }[];
                };
            }) => {
                if (character.MemberNumber !== config.targetMemberNumber)
                    return;
                const appearanceAfter = character.Appearance.getAppearanceData()
                    .map((item) => `${item.Group}/${item.Name}`)
                    .sort();
                if (
                    appearanceAfter.length === target.appearance.length &&
                    appearanceAfter.every(
                        (item, index) => item === target.appearance[index],
                    )
                ) {
                    return;
                }
                if (settled) return;
                settled = true;
                mapPositionAfter.X = character.MapPos.X;
                mapPositionAfter.Y = character.MapPos.Y;
                cleanup();
                resolve({
                    scenario: RELEASE_MONITOR_SCENARIO,
                    runId,
                    operationId: `qualification:${runId}`,
                    startedAt: startedAt.toISOString(),
                    finishedAt: new Date().toISOString(),
                    environment: config.environment,
                    room: config.room,
                    accountRole: "dedicated-test-account",
                    memberNumber: connector.Player.MemberNumber,
                    targetMemberNumber: config.targetMemberNumber,
                    appearanceBefore: target.appearance,
                    appearanceAfter,
                    mapPositionBefore: target.mapPosition,
                    mapPositionAfter,
                    authoritativeSyncObserved: true,
                    mutationAttempted: false,
                    disconnected: true,
                });
            };
            const onDisconnected = (reason: string) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(
                    new QualificationError(
                        `disconnected while monitoring release: ${reason}`,
                    ),
                );
            };
            connector.on("CharacterSync", onCharacterSync);
            connector.on("MapPosition", onMapPosition);
            connector.on("Disconnected", onDisconnected);
        },
    );
}

function appearanceKeys(connector: QualificationConnector): string[] {
    return connector.Player.Appearance.getAppearanceData()
        .map((item) => `${item.Group}/${item.Name}`)
        .sort();
}

function waitForAppearanceState(
    connector: QualificationConnector,
    predicate: (appearance: readonly string[]) => boolean,
    timeoutMs: number,
    description: string,
): { promise: Promise<void>; dispose(): void } {
    let timer: NodeJS.Timeout | undefined;
    let settled = false;
    let resolveState!: () => void;
    let rejectState!: (error: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
        resolveState = resolve;
        rejectState = reject;
    });
    const cleanup = () => {
        connector.off("Disconnected", onDisconnected);
        if (timer) clearInterval(timer);
        if (timeout) clearTimeout(timeout);
    };
    const settle = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolveState();
    };
    const check = () => {
        if (predicate(appearanceKeys(connector))) settle();
    };
    const onDisconnected = (reason: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectState(
            new QualificationError(
                `disconnected while waiting for ${description}: ${reason}`,
            ),
        );
    };
    connector.on("Disconnected", onDisconnected);
    timer = setInterval(check, 100);
    const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectState(new QualificationError(`${description} timed out`));
    }, timeoutMs);
    check();
    return { promise, dispose: cleanup };
}

async function runReleaseTestScenario(
    config: RealRoomTestConfig,
    connector: QualificationConnector,
    startedAt: Date,
    runId: string,
): Promise<ReleaseTestQualificationEvidence> {
    const releaseTest = config.releaseTest;
    if (!releaseTest) {
        throw new QualificationError("release-test configuration is missing");
    }

    await waitForReleaseReady(
        connector,
        config.targetMemberNumber,
        config.timeoutMs,
    );

    const fixture = `${releaseTest.fixtureGroup}/${releaseTest.fixtureName}`;
    const initialAppearance = appearanceKeys(connector);
    if (
        initialAppearance.some((item) =>
            item.startsWith(`${releaseTest.fixtureGroup}/`),
        )
    ) {
        throw new QualificationError(
            `release-test fixture group is already occupied: ${releaseTest.fixtureGroup}`,
        );
    }

    let fixtureAdded = false;
    try {
        const fixtureWaiter = waitForAppearanceState(
            connector,
            (appearance) => appearance.includes(fixture),
            config.timeoutMs,
            "release fixture appearance",
        );
        try {
            connector.Player.Appearance.AddItem({
                Group: releaseTest.fixtureGroup,
                Name: releaseTest.fixtureName,
            });
            connector.Player.sendAppearanceUpdate();
            await fixtureWaiter.promise;
            fixtureAdded = true;
        } finally {
            fixtureWaiter.dispose();
        }

        const appearanceBefore = appearanceKeys(connector);
        const confirmationPromptWaiter = waitForMessage(
            connector,
            (message) =>
                message.sender.MemberNumber === config.targetMemberNumber &&
                (message.message.Content.includes(
                    "Release requires confirmation",
                ) ||
                    message.message.Content.includes(
                        "PAROLE CONFIRMATION REQUIRED",
                    )),
            config.timeoutMs,
            "release confirmation prompt",
        );
        try {
            connector.SendMessage(
                "Whisper",
                "!release",
                config.targetMemberNumber,
            );
            await confirmationPromptWaiter.promise;
        } finally {
            confirmationPromptWaiter.dispose();
        }

        const removalWaiter = waitForAppearanceState(
            connector,
            (appearance) => !appearance.includes(fixture),
            config.timeoutMs,
            "release fixture removal",
        );
        const progressWaiter = waitForMessage(
            connector,
            (message) =>
                message.sender.MemberNumber === config.targetMemberNumber &&
                (message.message.Content.includes("The release room is open") ||
                    message.message.Content.includes("barrier dissolves")),
            config.timeoutMs,
            "release punishment-room progression",
        );
        try {
            connector.SendMessage(
                "Whisper",
                "!release yes",
                config.targetMemberNumber,
            );
            await Promise.all([removalWaiter.promise, progressWaiter.promise]);
        } finally {
            removalWaiter.dispose();
            progressWaiter.dispose();
        }

        const appearanceAfter = appearanceKeys(connector);
        if (appearanceAfter.includes(fixture)) {
            throw new QualificationError(
                "release-test fixture remained after release confirmation",
            );
        }

        const releasePosition = { ...connector.Player.MapPos };
        if (releasePosition.Y <= 0) {
            throw new QualificationError(
                "cannot move north from the northern map boundary after release",
            );
        }
        await withTimeout(
            connector.moveOnMapAndWait(
                releasePosition.X,
                releasePosition.Y - 1,
                config.timeoutMs,
            ),
            config.timeoutMs,
            "post-release north movement",
        );

        return {
            scenario: RELEASE_TEST_SCENARIO,
            runId,
            operationId: `qualification:${runId}`,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            environment: "live",
            room: config.room,
            accountRole: "dedicated-test-account",
            memberNumber: connector.Player.MemberNumber,
            command: "!release",
            confirmationCommand: "!release yes",
            targetMemberNumber: config.targetMemberNumber,
            fixture,
            appearanceBefore,
            appearanceAfter,
            mutationAttempted: true,
            fixtureAdded: true,
            fixtureRemoved: true,
            confirmationObserved: true,
            punishmentRoomProgressed: true,
            postReleasePosition: { ...connector.Player.MapPos },
            disconnected: true,
        };
    } finally {
        if (fixtureAdded && appearanceKeys(connector).includes(fixture)) {
            connector.Player.Appearance.RemoveItem(releaseTest.fixtureGroup);
            connector.Player.sendAppearanceUpdate();
        }
    }
}

async function runBunnyStepScenario(
    config: RealRoomTestConfig,
    connector: QualificationConnector,
    startedAt: Date,
    runId: string,
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
            punishment.appearance,
            BUNNY_RESTRAINT_KEYS.map((key) => key.split("/")[0]),
        );
        try {
            await releaseWaiter.promise;
        } finally {
            releaseWaiter.dispose();
        }
        return {
            scenario: BUNNY_STEP_SCENARIO,
            runId,
            operationId: `qualification:${runId}`,
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

async function runMovementPathScenario(
    config: RealRoomTestConfig,
    connector: QualificationConnector,
    startedAt: Date,
    runId: string,
): Promise<MovementPathQualificationEvidence> {
    const movementPath = config.movementPath;
    if (!movementPath) {
        throw new QualificationError("movement-path configuration is missing");
    }
    if (connector.chatRoom?.Name !== movementPath.confirmationRoom) {
        throw new QualificationError(
            "movement-path room confirmation did not match the joined room",
        );
    }

    const mapData = connector.chatRoom?.map?.mapData;
    if (!mapData) {
        throw new QualificationError(
            "live room map data was unavailable after room join",
        );
    }

    const ownMemberNumber = connector.Player.MemberNumber;
    const blockedPositions = (connector.chatRoom?.characters ?? [])
        .filter((character) => character.MemberNumber !== ownMemberNumber)
        .map((character) => character.MapPos);
    const startPosition = { ...movementPath.startPosition };
    logger.info("Movement start accepted from configured visual confirmation", {
        position: `${startPosition.X},${startPosition.Y}`,
    });
    const route = findMovementRoute(mapData, startPosition, {
        minSteps: movementPath.minSteps,
        maxSteps: movementPath.maxSteps,
        target: movementPath.targetPosition,
        blockedPositions,
    });
    const operationId = `qualification:${runId}:movement`;
    const movements: MovementPathQualificationEvidence["movements"] = [];
    const operationIds = [operationId];

    for (let index = 1; index < route.route.length; index += 1) {
        const target = route.route[index]!;
        const stepOperationId = `${operationId}:step:${index}`;
        operationIds.push(stepOperationId);
        const waiter = waitForAuthoritativeMovement(
            connector,
            ownMemberNumber,
            target,
            config.timeoutMs,
        );
        try {
            const observation = await waiter.promise;
            movements.push({
                operationId: stepOperationId,
                requestedPosition: { ...target },
                observedPosition: observation.position,
                observedAt: observation.observedAt,
                connectionEpoch: observation.connectionEpoch,
            });
        } finally {
            waiter.dispose();
        }
        if (index < route.route.length - 1) {
            await new Promise<void>((resolve) =>
                setTimeout(resolve, MOVEMENT_STEP_DELAY_MS),
            );
        }
    }

    const finalPosition = movements.at(-1)?.observedPosition ?? startPosition;
    if (!samePosition(finalPosition, route.target)) {
        throw new QualificationError(
            "movement-path finished without authoritative arrival at its target",
        );
    }

    return {
        scenario: MOVEMENT_PATH_SCENARIO,
        runId,
        operationId,
        operationIds,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        environment: config.environment,
        room: config.room,
        accountRole: "dedicated-test-account",
        memberNumber: ownMemberNumber,
        startPositionSource: "configured-visual-confirmation",
        map: {
            source: "live-room-map",
            width: 40,
            height: 40,
            mapHash: route.mapHash,
            walkableTileCount: route.walkableTileCount,
        },
        startPosition,
        targetPosition: route.target,
        route: route.route,
        movements,
        finalPosition,
        authoritativeObservations: true,
        disconnected: true,
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
    const connector = createConnector(config);
    const startedAt = new Date();
    const runId = crypto.randomUUID();

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
            return await runBunnyStepScenario(
                config,
                connector,
                startedAt,
                runId,
            );
        }
        if (config.scenario === TRANSPORT_MATRIX_SCENARIO) {
            return await runTransportMatrixScenario(
                config,
                connector,
                startedAt,
                runId,
            );
        }
        if (config.scenario === RECONNECT_SCENARIO) {
            return await runReconnectScenario(
                config,
                connector,
                startedAt,
                runId,
            );
        }
        if (config.scenario === RELEASE_OBSERVE_SCENARIO) {
            return await runReleaseObserveScenario(
                config,
                connector,
                startedAt,
                runId,
            );
        }
        if (config.scenario === RELEASE_MONITOR_SCENARIO) {
            return await runReleaseMonitorScenario(
                config,
                connector,
                startedAt,
                runId,
            );
        }
        if (config.scenario === RELEASE_TEST_SCENARIO) {
            return await runReleaseTestScenario(
                config,
                connector,
                startedAt,
                runId,
            );
        }
        if (config.scenario === MOVEMENT_PATH_SCENARIO) {
            return await runMovementPathScenario(
                config,
                connector,
                startedAt,
                runId,
            );
        }
        return await runHelpScenario(config, connector, startedAt, runId);
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

    const evidenceDirectory = requiredValue(
        environment,
        "QUALIFICATION_EVIDENCE_DIR",
    );
    if (!evidenceDirectory) {
        logger.error(
            "Real-room qualification refused; evidence destination is required before connecting",
        );
        return 1;
    }

    try {
        const evidence = await runRealRoomTestBot(config);
        const evidencePath = await writeQualificationEvidence(
            evidence,
            evidenceDirectory,
            [config.password, config.username, config.serverUrl],
        );
        logger.info("Real-room qualification completed", {
            runId: evidence.runId,
            scenario: evidence.scenario,
            environment: evidence.environment,
            disconnected: evidence.disconnected,
            evidencePath,
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
