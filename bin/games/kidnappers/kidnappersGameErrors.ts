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

import { BusinessLogicError } from "../../errors";
import type {
    KidnappersGameCommandType,
    KidnappersGameErrorReason,
    KidnappersGamePhase,
} from "./kidnappersGameTypes";

/**
 * Typed, observable error for a rejected KidnappersGame command.
 *
 * Extends the shared `BusinessLogicError` so it carries the standard
 * `AppError` contract (stable code/category, sanitized context, JSON/audit
 * serialization) while adding a narrow, domain-specific `reason` that
 * callers can switch on without string-matching the message.
 *
 * Never thrown for expected invalid transitions: `KidnappersGameStateMachine`
 * returns these as data (`{ ok: false, error }`) rather than throwing, so
 * callers are forced to handle rejection explicitly and no partial mutation
 * can occur via unwound exception state.
 */
export class KidnappersGameError extends BusinessLogicError {
    public readonly reason: KidnappersGameErrorReason;
    public readonly phase: KidnappersGamePhase;
    public readonly command: KidnappersGameCommandType;
    public readonly correlationId: string;

    constructor(
        message: string,
        details: {
            reason: KidnappersGameErrorReason;
            phase: KidnappersGamePhase;
            command: KidnappersGameCommandType;
            correlationId: string;
            context?: Record<string, unknown>;
        },
    ) {
        super(message, {
            ...details.context,
            reason: details.reason,
            phase: details.phase,
            command: details.command,
            correlationId: details.correlationId,
        });
        this.name = "KidnappersGameError";
        this.reason = details.reason;
        this.phase = details.phase;
        this.command = details.command;
        this.correlationId = details.correlationId;
    }
}
