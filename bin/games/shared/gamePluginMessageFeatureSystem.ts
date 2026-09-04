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

import { API_Connector } from "bc-bot";
import {
    AbstractMessageFeatureSystem,
    type ParsedCommand,
} from "./abstractMessageFeatureSystem";
import type { GamePlugin } from "./gamePlugin";
import type { API_Character, BC_Server_ChatRoomMessage } from "bc-bot";

/**
 * Adapter that bridges GamePlugin and AbstractMessageFeatureSystem.
 *
 * Allows GamePlugin implementations to benefit from AbstractMessageFeatureSystem's
 * message handling, permission checking, and error handling while maintaining
 * GamePlugin compatibility.
 *
 * Usage in a GamePlugin:
 * ```typescript
 * export class MyGame implements GamePlugin {
 *   private messageHandler: GamePluginMessageFeatureSystem;
 *
 *   constructor(conn: API_Connector) {
 *     this.messageHandler = new GamePluginMessageFeatureSystem(
 *       conn,
 *       "mygame",
 *       "My Game",
 *       () => this.enabled,
 *     );
 *   }
 *
 *   private onMyGameCommand = async (
 *     sender: API_Character,
 *     msg: BC_Server_ChatRoomMessage,
 *     args: string[],
 *   ) => {
 *     // Delegate to message handler which manages permissions, parsing, etc.
 *     await this.messageHandler.processMessage(sender, msg, args);
 *   };
 *
 *   protected async handleCommand(sender, parsed, msg) {
 *     // Implement your command logic here
 *     switch (parsed.command) {
 *       case "help":
 *         // ...
 *         break;
 *     }
 *   }
 * }
 * ```
 */
export class GamePluginMessageFeatureSystem extends AbstractMessageFeatureSystem {
    private enabledGetter: () => boolean;

    constructor(
        conn: API_Connector,
        systemKey: string,
        systemLabel: string,
        enabledGetter: () => boolean,
    ) {
        super(conn, systemKey, systemLabel);
        this.enabledGetter = enabledGetter;
    }

    protected isEnabled(): boolean {
        return this.enabledGetter();
    }

    /**
     * Must be implemented by subclass or set via composition
     */
    protected async handleCommand(
        _sender: API_Character,
        _parsed: ParsedCommand,
        _msg: BC_Server_ChatRoomMessage,
    ): Promise<void> {
        throw new Error("handleCommand not implemented");
    }
}
