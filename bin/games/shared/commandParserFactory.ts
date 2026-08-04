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

import { API_Connector, CommandParser, MapRegion } from "bc-bot";

/**
 * Creates a CommandParser with optional region filtering.
 *
 * Used by Veratown and its sub-games (Dare, Casino) to initialize their
 * command processors. Centralizing this ensures consistent error handling
 * and configuration across all game modules.
 *
 * @param conn The bot connection to attach the parser to
 * @param region Optional map region to restrict command processing to
 *               (e.g., CommandParser will ignore commands outside this region)
 * @param excludeRegions Optional array of regions to explicitly exclude
 *
 * @returns A CommandParser instance ready to register commands
 *
 * @example
 * // Create parser with no region restriction
 * const parser = createCommandParser(conn);
 *
 * @example
 * // Create parser that only responds in the dare area
 * const parser = createCommandParser(conn, DARE_LOCATION);
 *
 * @example
 * // Create parser that responds everywhere except the casino
 * const parser = createCommandParser(conn, undefined, [GAME_LOCATION]);
 */
export function createCommandParser(
    conn: API_Connector,
    region?: MapRegion,
    excludeRegions?: MapRegion[],
): CommandParser {
    return new CommandParser(conn, region, excludeRegions);
}
