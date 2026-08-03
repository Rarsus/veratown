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

import { type RoomDefinition } from "bc-bot";
import { type CasinoConfig } from "./games/casino";
import { type DareConfig } from "./games/dare";

export interface ConfigFile {
    user: string;
    password: string;
    env: "live" | "test";
    url?: string;
    game: string;
    superusers: number[];
    room: RoomDefinition;
    mongo_uri?: string;
    mongo_db?: string;
    // Defaults to true; set to false for a local mongo container without TLS.
    mongo_tls?: boolean;
    members: number[];

    user2: string;
    password2: string;

    // Dedicated account for a roulette table hosted outside the casino room
    // (eg. the Veratown pool area), so its sign/wheel appearance doesn't clash
    // with the main bot's appearance.
    user3?: string;
    password3?: string;

    casino?: CasinoConfig;
    dare?: DareConfig;
}
