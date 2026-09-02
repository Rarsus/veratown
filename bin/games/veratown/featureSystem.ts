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

// Shared contract implemented by every individually-toggleable Veratown
// room feature (CageSystem, KennelSystem, ShowerSystem, BedSystem,
// BunnyParkSystem, WindowSystem, TrashcanSystem). Letting the orchestrator
// (Veratown) talk to all of them uniformly is what makes the
// "/bot feature list|enable|disable" admin command possible without it
// needing to know about each system's internals.
import type { VeratownLocationDoc } from "./veratownLocationStore";

import { createLogger } from "../../logging";

const logger = createLogger("featureSystem");

export interface VeratownFeatureSystem {
    // Stable, lowercase identifier used in admin commands, eg. "cage".
    readonly key: string;
    // Human-readable name shown in "/bot feature list" output.
    readonly label: string;
    // Registers this system's map/message triggers. Called once during
    // Veratown startup and awaited before the room is considered ready.
    registerTriggers(): void | Promise<void>;
    // Refreshes database-backed positions and replaces any dynamic triggers.
    // Features without location-backed triggers may omit this method.
    reloadLocations?(locations: readonly VeratownLocationDoc[]): Promise<void>;
    // Whether this feature is currently active. Handlers should check this
    // and no-op (optionally telling the character it's disabled) when
    // false, rather than the orchestrator trying to physically add/remove
    // map triggers at runtime.
    enabled: boolean;
}

// Wraps a tile/region/message trigger callback so a runtime error inside it
// - thrown synchronously, or an async rejection - is logged and swallowed
// instead of propagating. Neither API_Map's trigger dispatch
// (onCharacterMove) nor EventEmitter's listener dispatch catch errors from
// the callbacks/listeners they invoke, so without this wrapper a bug in a
// single feature (eg. ShowerSystem) could crash the entire bot process via
// an unhandled promise rejection, taking every other feature and game down
// with it.
export function guardHandler<Args extends unknown[]>(
    key: string,
    handler: (...args: Args) => void | Promise<void>,
): (...args: Args) => void {
    return (...args: Args) => {
        try {
            const result = handler(...args);
            if (result instanceof Promise) {
                result.catch((e) => {
                    logger.error(`[Veratown:${key}] handler failed`, e);
                });
            }
        } catch (e) {
            logger.error(`[Veratown:${key}] handler failed`, e);
        }
    };
}
