import {
    API_Character,
    API_Connector,
    API_Map,
    BC_Server_ChatRoomMessage,
    MapRegion,
} from "bc-bot";
import { createLogger } from "../../logging";
import {
    ActionLayerRolloutController,
    AppearanceActionService,
    CharacterActionExecutor,
    CommunicationActionService,
    createActionMetadata,
    createActionResult,
    sendFeatureWhisper,
    type ActionContext,
    type ActionResult,
    MapRegion as ActionMapRegion,
    MapTriggerCallback,
    MapTriggerScope,
} from "../../action-layer";
import {
    executeConfiguredActionSequence,
    parseConfiguredActionList,
    type ConfiguredAction,
} from "./shared/configuredActions";
import {
    BCMapTriggerActionAdapter,
    MapTriggerRegistry,
} from "../../action-layer";
import {
    AbstractMessageFeatureSystem,
    ParsedCommand,
} from "../shared/abstractMessageFeatureSystem";
import {
    VeratownFeatureSystem,
    getLifecycleObjectId,
    guardHandler,
} from "./featureSystem";
import { isClothing } from "./shared/featureHelpers";
import { VeratownLocationDoc } from "./veratownLocationStore";

export interface LocationMonitorProviderContext {
    character: API_Character;
    location: VeratownLocationDoc;
}

export interface LocationMonitorProvider {
    readonly key: string;
    getDisplay(
        context: LocationMonitorProviderContext,
    ): string | Promise<string>;
}

export interface LocationMonitorAction extends ConfiguredAction {
    readonly type: "remove_random_clothing";
}

export class CageOccupancyMonitorProvider implements LocationMonitorProvider {
    public readonly key = "cage_occupancy";

    public constructor(private readonly getDisplayText: () => string) {}

    public getDisplay(): string {
        return this.getDisplayText();
    }
}

export class BotHelpMonitorProvider implements LocationMonitorProvider {
    public readonly key = "bot_help";

    public constructor(private readonly getDisplayText: () => string) {}

    public getDisplay(): string {
        return this.getDisplayText();
    }
}

export class CallbackMonitorProvider implements LocationMonitorProvider {
    public constructor(
        public readonly key: string,
        private readonly getDisplayText: () => string,
    ) {}

    public getDisplay(): string {
        return this.getDisplayText();
    }
}

const UTC_DAY_MS = 24 * 60 * 60 * 1_000;

export class LocktoberCountdownMonitorProvider implements LocationMonitorProvider {
    public readonly key = "locktober_countdown";

    public constructor(private readonly now: () => Date = () => new Date()) {}

    public getDisplay(): string {
        const now = this.now();
        const year = now.getUTCFullYear();
        const locktoberEnd = Date.UTC(year, 10, 1);
        const remainingMs = locktoberEnd - now.getTime();

        if (remainingMs <= 0) return `Locktober ${year} has ended (UTC).`;

        const days = Math.floor(remainingMs / UTC_DAY_MS);
        if (days === 0) {
            return `Locktober ${year} ends in less than 1 day (UTC).`;
        }
        const unit = days === 1 ? "day" : "days";
        const verb = days === 1 ? "is" : "are";
        return `There ${verb} ${days} ${unit} left until Locktober ${year} ends (UTC).`;
    }
}

const DEFAULT_MONITOR_COOLDOWN_MS = 3000;

export class LocationMonitorSystem
    extends AbstractMessageFeatureSystem
    implements VeratownFeatureSystem
{
    public readonly key = "locationMonitor";
    public readonly label = "Location monitors";
    private enabledState = true;

    private readonly providers = new Map<string, LocationMonitorProvider>();
    private readonly triggerRegistry = new MapTriggerRegistry(
        new BCMapTriggerActionAdapter(),
    );
    private readonly lastDisplayedAt = new Map<string, number>();
    private readonly activeDisplays = new Set<string>();
    private readonly characterActions: CharacterActionExecutor<API_Character>;
    private operationSequence = 0;
    private monitorLocations: VeratownLocationDoc[] = [];
    private boundMap?: API_Map;
    private boundRoom?: API_Connector["chatRoom"];
    private boundScope?: MapTriggerScope;

    public get enabled(): boolean {
        return this.enabledState;
    }

    public set enabled(value: boolean) {
        if (this.enabledState === value) return;
        this.enabledState = value;
        if (value) this.attachToRoom();
        else this.detachFromRoom();
    }

    public constructor(
        conn: API_Connector,
        providers: readonly LocationMonitorProvider[],
        private readonly defaultCooldownMs = DEFAULT_MONITOR_COOLDOWN_MS,
        private readonly communicationService?: CommunicationActionService,
        private readonly rollout?: ActionLayerRolloutController,
        private readonly appearanceService?: AppearanceActionService<API_Character>,
    ) {
        super(conn, "locationMonitor", "Location monitors");
        this.characterActions = new CharacterActionExecutor({
            appearance: this.appearanceService,
        });
        for (const provider of providers) {
            this.providers.set(provider.key, provider);
        }
    }

    protected isEnabled(): boolean {
        return this.enabled;
    }

    protected async handleCommand(
        _sender: API_Character,
        _parsed: ParsedCommand,
        _message: BC_Server_ChatRoomMessage,
    ): Promise<void> {}

    public registerTriggers(): void {
        if (!this.enabled) return;
        this.attachToRoom();
    }

    public attachToRoom(): void {
        const room = this.conn.chatRoom;
        if (!room) {
            this.detachFromRoom();
            return;
        }

        if (this.boundRoom !== room || this.boundMap !== room.map) {
            this.detachFromRoom();
            this.boundRoom = room;
            this.boundMap = room.map;
            this.boundScope = {
                scopeId: `location-monitor:${this.getObjectId(room)}:${this.getObjectId(room.map)}`,
                room,
                map: room.map,
            };
            this.triggerRegistry.bind(this.boundScope);
        }
        this.registerMapTriggers();
    }

    public detachFromRoom(): void {
        if (this.boundScope) {
            this.triggerRegistry.disposeScope(this.boundScope.scopeId);
        }
        this.boundRoom = undefined;
        this.boundMap = undefined;
        this.boundScope = undefined;
        this.lastDisplayedAt.clear();
        this.activeDisplays.clear();
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        this.monitorLocations = locations.filter(
            (location) =>
                location.enabled &&
                (location.type === "help_monitor" ||
                    location.type === "cage_info_region"),
        );
        if (this.enabled) this.attachToRoom();
    }

    public isReady(): boolean {
        return this.boundMap !== undefined;
    }

    public shutdown(): void {
        this.detachFromRoom();
        this.triggerRegistry.close();
    }

    public getDiagnostics(): Record<string, unknown> {
        return {
            monitorCount: this.monitorLocations.length,
            registeredTriggerCount: this.triggerRegistry.size,
            providerKeys: [...this.providers.keys()],
        };
    }

    private registerMapTriggers(): void {
        if (!this.boundMap || !this.boundScope || !this.enabled) return;

        this.triggerRegistry.disposeScope(this.boundScope.scopeId);
        this.triggerRegistry.bind(this.boundScope);

        for (const location of this.monitorLocations) {
            const providerKey = this.getProviderKey(location);
            if (!providerKey || !this.providers.has(providerKey)) {
                this.logger.warn("Skipping monitor with unknown provider", {
                    locationKey: location.key,
                    providerKey,
                });
                continue;
            }

            const region = this.getRegion(location);
            if (!region) {
                this.logger.warn("Skipping monitor without a valid region", {
                    locationKey: location.key,
                });
                continue;
            }

            const callback = guardHandler(
                `${this.key}:${location.key}`,
                (character: API_Character) =>
                    this.displayMonitor(character, location, providerKey),
            );
            this.triggerRegistry.register({
                key: `${this.key}:${location.key}`,
                kind: "enter_region",
                region: this.toActionRegion(region),
                callback: callback as MapTriggerCallback,
            });
        }
    }

    private getObjectId(value: object): number {
        return getLifecycleObjectId(value) ?? 0;
    }

    private toActionRegion(region: MapRegion): ActionMapRegion {
        return {
            topLeft: { x: region.TopLeft.X, y: region.TopLeft.Y },
            bottomRight: {
                x: region.BottomRight.X,
                y: region.BottomRight.Y,
            },
        };
    }

    private async displayMonitor(
        character: API_Character,
        location: VeratownLocationDoc,
        providerKey: string,
    ): Promise<void> {
        if (!this.isEnabled()) return;

        const cooldownMs = this.getCooldownMs(location);
        const cooldownKey = `${location.key}:${character.MemberNumber}`;
        const lastDisplayedAt = this.lastDisplayedAt.get(cooldownKey) ?? 0;
        if (Date.now() - lastDisplayedAt < cooldownMs) return;
        if (this.activeDisplays.has(cooldownKey)) return;

        const provider = this.providers.get(providerKey);
        if (!provider) return;

        this.activeDisplays.add(cooldownKey);
        try {
            const message = await provider.getDisplay({ character, location });
            const actions = this.getActions(location);
            if (!message.trim() && actions.length === 0) return;

            const operationId = `location-monitor:${location.key}:${character.MemberNumber}:${++this.operationSequence}`;
            let dispatched = false;
            if (message.trim()) {
                dispatched = await sendFeatureWhisper({
                    communicationService: this.communicationService,
                    rollout: this.rollout,
                    operationId,
                    memberNumber: character.MemberNumber,
                    reason: `location monitor ${location.key}`,
                    text: message,
                    sendLegacy: async () => {
                        await this.sendMessage(character.MemberNumber, message);
                    },
                    warn: (warning, details) =>
                        this.logger.warn(warning, {
                            ...details,
                            locationKey: location.key,
                        }),
                });
            }

            const actionResult = await executeConfiguredActionSequence(
                actions,
                {
                    operationId,
                    memberNumber: character.MemberNumber,
                    source: "feature",
                    reason: `location monitor ${location.key}`,
                    deadlineAt: Date.now() + 30_000,
                },
                (action, context) =>
                    this.runAction(character, location, action, context),
                { continueOnFailure: true },
            );
            const actionCompleted = actionResult.results.some(
                (result) =>
                    result.status === "completed" ||
                    result.status === "already_satisfied" ||
                    result.status === "in_progress",
            );
            if (dispatched || actionCompleted) {
                this.lastDisplayedAt.set(cooldownKey, Date.now());
            }
        } finally {
            this.activeDisplays.delete(cooldownKey);
        }
    }

    private getActions(location: VeratownLocationDoc): LocationMonitorAction[] {
        const configured = location.data?.actions;
        const parsed = parseConfiguredActionList(
            configured,
            (candidate): LocationMonitorAction | null => {
                if (
                    typeof candidate === "object" &&
                    candidate !== null &&
                    "type" in candidate &&
                    candidate.type === "remove_random_clothing"
                ) {
                    return { type: "remove_random_clothing" };
                }
                return null;
            },
        );
        for (const action of parsed.rejected) {
            this.logger.warn("Ignoring unknown location monitor action", {
                locationKey: location.key,
                action,
            });
        }
        return [...parsed.actions];
    }

    private async runAction(
        character: API_Character,
        location: VeratownLocationDoc,
        action: LocationMonitorAction,
        context: ActionContext,
    ): Promise<ActionResult<unknown>> {
        if (action.type === "remove_random_clothing") {
            return this.removeRandomClothing(character, location, context);
        }
        return createActionResult(
            "rejected",
            createActionMetadata(context, action.type, Date.now()),
            { reason: `Unsupported action type: ${action.type}` },
        );
    }

    private async removeRandomClothing(
        character: API_Character,
        location: VeratownLocationDoc,
        context: ActionContext,
    ): Promise<ActionResult<unknown>> {
        if (!this.appearanceService) {
            this.logger.warn(
                "Cannot run clothing action without appearance service",
                { locationKey: location.key, operationId: context.operationId },
            );
            return createActionResult(
                "failed",
                createActionMetadata(
                    context,
                    "appearance.remove_random_clothing",
                    Date.now(),
                ),
                { reason: "Appearance action service is unavailable" },
            );
        }

        character.Appearance.MakeAppearanceBundle();
        const remaining = character.Appearance.Appearance.filter((item) =>
            isClothing(item),
        );
        if (remaining.length === 0) {
            return createActionResult(
                "already_satisfied",
                createActionMetadata(
                    context,
                    "appearance.remove_random_clothing",
                    Date.now(),
                ),
                { reason: "No clothing items are available to remove" },
            );
        }

        for (let attempt = 0; remaining.length > 0; attempt += 1) {
            const index = Math.floor(Math.random() * remaining.length);
            const [item] = remaining.splice(index, 1);
            const result = await this.characterActions.execute(
                character,
                {
                    type: "appearance.remove",
                    item: { group: item.Group, asset: item.Name },
                    options: {
                        timeoutMs: 5_000,
                        maxAttempts: 1,
                        retryDelayMs: 0,
                        preserveLockedItems: true,
                        requireServerConfirmation: true,
                    },
                },
                {
                    operationId: `${context.operationId}:candidate:${attempt}`,
                    memberNumber: character.MemberNumber,
                    source: "feature",
                    reason: `location monitor ${location.key}: remove random clothing`,
                    deadlineAt: Date.now() + 5_000,
                },
            );

            if (
                result.status === "completed" ||
                result.status === "in_progress"
            ) {
                return result;
            }
            if (
                result.status === "blocked" ||
                result.status === "already_satisfied"
            ) {
                continue;
            }

            this.logger.warn("Random clothing removal did not complete", {
                locationKey: location.key,
                operationId: context.operationId,
                group: item.Group,
                asset: item.Name,
                status: result.status,
                reason: result.reason,
            });
            return result;
        }

        return createActionResult(
            "blocked",
            createActionMetadata(
                context,
                "appearance.remove_random_clothing",
                Date.now(),
            ),
            { reason: "All available clothing items were protected" },
        );
    }

    private getProviderKey(location: VeratownLocationDoc): string | undefined {
        const configured = location.data?.displayKey;
        if (typeof configured === "string" && configured.trim()) {
            return configured;
        }
        return location.type === "cage_info_region"
            ? "cage_occupancy"
            : undefined;
    }

    private getRegion(location: VeratownLocationDoc): MapRegion | undefined {
        if (location.region) return location.region;
        if (typeof location.x !== "number" || typeof location.y !== "number") {
            return undefined;
        }

        const bottomRightX = location.data?.bottomRightX;
        const bottomRightY = location.data?.bottomRightY;
        return {
            TopLeft: { X: location.x, Y: location.y },
            BottomRight: {
                X: typeof bottomRightX === "number" ? bottomRightX : location.x,
                Y: typeof bottomRightY === "number" ? bottomRightY : location.y,
            },
        };
    }

    private getCooldownMs(location: VeratownLocationDoc): number {
        const cooldownMs = location.data?.cooldownMs;
        return typeof cooldownMs === "number" && cooldownMs >= 0
            ? cooldownMs
            : this.defaultCooldownMs;
    }
}
