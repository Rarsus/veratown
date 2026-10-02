import type { API_Connector } from "bc-bot";
import type { VeratownFeatureSystem } from "./featureSystem";

export const LOCKTOBER_REGION = {
    topLeft: { X: 15, Y: 1 },
    bottomRight: { X: 24, Y: 2 },
} as const;

const MAP_WIDTH = 40;
const DAY_MS = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const MINUTE_MS = 60 * 1_000;
const MAX_TIMEOUT_MS = 2_147_000_000;

export interface FloorTileWriter {
    setTile(
        position: { X: number; Y: number },
        tileName: string,
        tileType?: string,
    ): void;
}

export function locktoberCountdownLine(now: Date): string | undefined {
    const seasonStart = new Date(now.getFullYear(), 9, 1);
    const seasonEnd = new Date(now.getFullYear(), 10, 1);
    if (now < seasonStart) return undefined;
    if (now >= seasonEnd) return "00I00 LEFT";

    const remainingMs = seasonEnd.getTime() - now.getTime();
    const days = Math.floor(remainingMs / DAY_MS);
    const minutes = Math.floor((remainingMs % HOUR_MS) / MINUTE_MS);
    return `${String(days).padStart(2, "0")}I${String(minutes).padStart(2, "0")} LEFT`;
}

export function millisecondsUntilNextLocktoberUpdate(
    now: Date,
): number | undefined {
    const seasonStart = new Date(now.getFullYear(), 9, 1);
    const seasonEnd = new Date(now.getFullYear(), 10, 1);
    if (now >= seasonEnd) return undefined;
    if (now < seasonStart) {
        return Math.min(seasonStart.getTime() - now.getTime(), MAX_TIMEOUT_MS);
    }
    return MINUTE_MS - (now.getTime() % MINUTE_MS);
}

export function updateLocktoberFloorTiles(
    map: FloorTileWriter,
    now: Date,
): boolean {
    const countdownLine = locktoberCountdownLine(now);
    if (!countdownLine) return false;

    const lines = ["LOCKTOBER ", countdownLine];
    for (let row = 0; row < lines.length; row += 1) {
        const line = lines[row]!;
        for (let column = 0; column < line.length; column += 1) {
            const character = line[column]!;
            const position = {
                X: LOCKTOBER_REGION.topLeft.X + column,
                Y: LOCKTOBER_REGION.topLeft.Y + row,
            };
            if (/^[0-9]$/.test(character)) {
                map.setTile(position, `Number${character}`, "FloorNumber");
            } else {
                map.setTile(
                    position,
                    character === " " ? "Blank" : `Letter${character}`,
                    "FloorLetter",
                );
            }
        }
    }
    return true;
}

export class LocktoberCountdownSystem implements VeratownFeatureSystem {
    public readonly key = "locktober";
    public readonly label = "Locktober countdown";
    private enabledState = true;
    private timer?: NodeJS.Timeout;

    public constructor(
        private readonly conn: API_Connector,
        private readonly now: () => Date = () => new Date(),
    ) {}

    public get enabled(): boolean {
        return this.enabledState;
    }

    public set enabled(value: boolean) {
        if (this.enabledState === value) return;
        this.enabledState = value;
        if (value) this.attachToRoom();
        else this.detachFromRoom();
    }

    public registerTriggers(): void {
        this.attachToRoom();
    }

    public attachToRoom(): void {
        this.stopTimer();
        if (!this.enabled) return;
        this.refresh();
        this.scheduleNextUpdate();
    }

    public detachFromRoom(): void {
        this.stopTimer();
    }

    public shutdown(): void {
        this.detachFromRoom();
    }

    public isReady(): boolean {
        return this.conn.chatRoom?.map.mapData !== undefined;
    }

    public getDiagnostics(): Record<string, unknown> {
        return {
            active: this.enabled,
            timerScheduled: this.timer !== undefined,
            region: LOCKTOBER_REGION,
            countdown: locktoberCountdownLine(this.now()),
        };
    }

    private refresh(): void {
        const map = this.conn.chatRoom?.map;
        if (map) updateLocktoberFloorTiles(map, this.now());
    }

    private scheduleNextUpdate(): void {
        if (!this.enabled) return;
        const delay = millisecondsUntilNextLocktoberUpdate(this.now());
        if (delay === undefined) return;

        this.timer = setTimeout(() => {
            this.timer = undefined;
            if (!this.enabled) return;
            this.refresh();
            this.scheduleNextUpdate();
        }, delay);
        this.timer.unref?.();
    }

    private stopTimer(): void {
        if (!this.timer) return;
        clearTimeout(this.timer);
        this.timer = undefined;
    }
}
