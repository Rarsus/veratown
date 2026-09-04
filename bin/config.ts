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
import { z } from "zod";

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

    // Discord Bot Configuration (optional)
    discord_enabled?: boolean;
    discord_token?: string;
    discord_guild_id?: string;
    discord_admin_roles?: string[];
    discord_audit_channel_id?: string;

    casino?: CasinoConfig;
    dare?: DareConfig;
}

const nonEmptyString = z.string().trim().min(1);

/**
 * The startup configuration contract. Secrets are intentionally represented
 * only by their paths in validation errors.
 */
export const configSchema = z
    .object({
        user: nonEmptyString,
        password: nonEmptyString,
        env: z.enum(["live", "test"]).default("live"),
        url: z.string().url().optional(),
        game: z
            .enum(["veratown", "kidnappers", "roleplay", "maidspartynight"])
            .default("veratown"),
        superusers: z.array(z.number().int().nonnegative()).default([]),
        room: z
            .custom<RoomDefinition>(
                (value) => typeof value === "object" && value !== null,
                "must be an object",
            )
            .default({} as RoomDefinition),
        mongo_uri: nonEmptyString.optional(),
        mongo_db: nonEmptyString.optional(),
        mongo_tls: z.boolean().default(true),
        members: z.array(z.number().int().nonnegative()).default([]),
        user2: z.string().trim().default(""),
        password2: z.string().default(""),
        user3: nonEmptyString.optional(),
        password3: z.string().optional(),
        discord_enabled: z.boolean().default(false),
        discord_token: nonEmptyString.optional(),
        discord_guild_id: nonEmptyString.optional(),
        discord_admin_roles: z.array(nonEmptyString).default([]),
        discord_audit_channel_id: nonEmptyString.optional(),
        casino: z.custom<CasinoConfig>().optional(),
        dare: z.custom<DareConfig>().optional(),
    })
    .passthrough()
    .superRefine((config, context) => {
        const requirePair = (
            first: string,
            second: string,
            firstName: string,
            secondName: string,
        ) => {
            if (
                !!config[first as keyof typeof config] !==
                !!config[second as keyof typeof config]
            ) {
                context.addIssue({
                    code: "custom",
                    path: [firstName],
                    message: `${firstName} and ${secondName} must be configured together`,
                });
            }
        };

        requirePair("user2", "password2", "user2", "password2");
        requirePair("user3", "password3", "user3", "password3");
        requirePair("mongo_uri", "mongo_db", "mongo_uri", "mongo_db");

        if (
            config.discord_enabled &&
            (!config.discord_token || !config.discord_guild_id)
        ) {
            context.addIssue({
                code: "custom",
                path: ["discord"],
                message:
                    "discord_token and discord_guild_id are required when discord_enabled is true",
            });
        }

        if (
            config.game === "veratown" &&
            (!config.mongo_uri || !config.mongo_db)
        ) {
            context.addIssue({
                code: "custom",
                path: ["mongo"],
                message:
                    "mongo_uri and mongo_db are required for the veratown game",
            });
        }

        if (
            config.game === "maidspartynight" &&
            (!config.user2 || !config.password2)
        ) {
            context.addIssue({
                code: "custom",
                path: ["user2"],
                message:
                    "user2 and password2 are required for the maidspartynight game",
            });
        }
    });

export class ConfigValidationError extends Error {
    constructor(public readonly issues: z.ZodIssue[]) {
        super(
            `Invalid startup configuration: ${issues
                .map(
                    (issue) =>
                        `${issue.path.join(".") || "configuration"} ${issue.message}`,
                )
                .join("; ")}`,
        );
        this.name = "ConfigValidationError";
    }
}

export function validateConfig(config: unknown): ConfigFile {
    const result = configSchema.safeParse(config);
    if (!result.success) throw new ConfigValidationError(result.error.issues);
    return result.data as ConfigFile;
}
