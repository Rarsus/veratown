import {
    API_Character,
    API_Connector,
    API_Map,
    BC_Server_ChatRoomMessage,
    MapRegion,
} from "bc-bot";
import { createLogger } from "../../logging";
import {
    AbstractMessageFeatureSystem,
    ParsedCommand,
} from "../shared/abstractMessageFeatureSystem";
import { VeratownFeatureSystem, guardHandler } from "./featureSystem";
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

interface MonitorBinding {
    map: API_Map;
    callback: (...args: any[]) => void;
}

const DEFAULT_MONITOR_COOLDOWN_MS = 3000;

export class LocationMonitorSystem
    extends AbstractMessageFeatureSystem
    implements VeratownFeatureSystem
{
    public readonly key = "locationMonitor";
    public readonly label = "Location monitors";
    public enabled = true;

    private readonly logger = createLogger("LocationMonitorSystem");
    private readonly providers = new Map<string, LocationMonitorProvider>();
    private readonly bindings: MonitorBinding[] = [];
    private readonly lastDisplayedAt = new Map<string, number>();
    private readonly activeDisplays = new Set<string>();
    private monitorLocations: VeratownLocationDoc[] = [];
    private boundMap?: API_Map;
    private boundRoom?: API_Connector["chatRoom"];

    public constructor(
        conn: API_Connector,
        providers: readonly LocationMonitorProvider[],
        private readonly defaultCooldownMs = DEFAULT_MONITOR_COOLDOWN_MS,
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
        }
        this.registerMapTriggers();
    }

    public detachFromRoom(): void {
        for (const binding of this.bindings) {
            binding.map.removeEnterRegionTrigger(binding.callback as any);
        }
        this.bindings.length = 0;
        this.boundRoom = undefined;
        this.boundMap = undefined;
        this.lastDisplayedAt.clear();
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
        this.attachToRoom();
    }

    public isReady(): boolean {
        return this.boundMap !== undefined;
    }

    public getDiagnostics(): Record<string, unknown> {
        return {
            monitorCount: this.monitorLocations.length,
            registeredTriggerCount: this.bindings.length,
            providerKeys: [...this.providers.keys()],
        };
    }

    private registerMapTriggers(): void {
        const map = this.boundMap;
        if (!map) return;

        for (const binding of this.bindings) {
            binding.map.removeEnterRegionTrigger(binding.callback as any);
        }
        this.bindings.length = 0;

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
            map.addEnterRegionTrigger(region, callback as any);
            this.bindings.push({ map, callback });
        }
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

            this.lastDisplayedAt.set(cooldownKey, Date.now());
            await this.sendMessage(character.MemberNumber, message);
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
