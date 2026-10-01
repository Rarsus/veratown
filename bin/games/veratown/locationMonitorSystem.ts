import {
    API_Character,
    API_Connector,
    API_Map,
    BC_Server_ChatRoomMessage,
    MapRegion,
} from "bc-bot";
import { createLogger } from "../../logging";
import type {
    ActionLayerRolloutController,
    CommunicationActionService,
    MapRegion as ActionMapRegion,
    MapTriggerCallback,
    MapTriggerScope,
} from "../../action-layer";
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
    ) {
        super(conn, "locationMonitor", "Location monitors");
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
            if (!message.trim()) return;

            const operationId = `location-monitor:${location.key}:${character.MemberNumber}`;
            const lease = this.rollout?.begin(
                "communication-notifications",
                operationId,
            );
            let dispatched = false;
            try {
                if (
                    lease?.path === "action" &&
                    this.communicationService !== undefined
                ) {
                    const result = await this.communicationService.send(
                        {
                            channel: "whisper",
                            text: message,
                            targetMemberNumber: character.MemberNumber,
                            deduplicationKey: operationId,
                        },
                        {
                            operationId,
                            memberNumber: character.MemberNumber,
                            source: "feature",
                            reason: `location monitor ${location.key}`,
                            deadlineAt: Date.now() + 5000,
                        },
                    );
                    if (result.status !== "completed") {
                        this.logger.warn(
                            "Communication action did not complete",
                            {
                                operationId,
                                locationKey: location.key,
                                deliveryStatus:
                                    result.value?.deliveryStatus ?? "unknown",
                                reason: result.reason,
                            },
                        );
                    }
                    dispatched =
                        result.status === "completed" ||
                        result.status === "already_satisfied";
                } else {
                    await this.sendMessage(character.MemberNumber, message);
                    dispatched = true;
                }
            } finally {
                lease?.release();
            }
            if (dispatched) this.lastDisplayedAt.set(cooldownKey, Date.now());
        } finally {
            this.activeDisplays.delete(cooldownKey);
        }
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
