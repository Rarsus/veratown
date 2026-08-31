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

import { MapRegion } from "bc-bot";
import { KeypadAccessRecord } from "../shared/unifiedCharacterTypes";

/**
 * Layer 3: Door Definition - Physical door configuration
 * Stored in keypadDoorDefinitions collection
 * Read-heavy, write-light (only on design changes)
 */
export interface KeypadDoorDefinitionDoc {
    _id: string;
    doorKey: string; // Unique identifier: "prison_cell_1_door"

    // Door tile position on map
    doorX: number;
    doorY: number;

    // Tile appearance when locked/unlocked
    lockedTile: string; // "MetalDown"
    unlockedTile: string; // "SteelDoorOpen"
    unlockDurationMs: number; // 10000 ms default

    // Optional: Protection when someone is inside (directional exit lock)
    insideRegion?: MapRegion;

    // Optional: Auto-open tile (only if insideRegion not set)
    autoOpenTile?: {
        X: number;
        Y: number;
    };

    // Metadata
    enabled: boolean;
    description?: string; // "Main prison cell door"
    createdAt: number;
    updatedAt: number;
}

/**
 * Layer 3: Group Definition - Access group configuration
 * Stored in keypadGroupDefinitions collection
 * Read-heavy, write-medium (code changes, group creation)
 */
export interface KeypadGroupDefinitionDoc {
    _id: string;

    // Identity
    doorKey: string; // Which door this group controls access to
    groupName: string; // "admin", "whitelist", "maintenance", "custom_xyz"

    // Group type: builtin (admin/whitelist/guest) or custom (admin-created)
    groupType: "builtin" | "custom";

    // Access code for this group
    code: string; // Empty string for admin group, specific code for others

    // Metadata
    description?: string; // "Daily maintenance access"
    permissions?: string[]; // ["unlock", "lock", "override"] for future expansion
    createdAt: number;
    createdBy?: number; // memberNumber if admin-created
    updatedAt: number;
}

/**
 * Layer 1: Group Membership Index (Optional, for admin queries)
 * Stored in keypadGroupMemberships collection
 * Indexed for fast "who has access?" queries
 * Synced from character profiles, used for admin UI performance
 */
export interface KeypadGroupMembershipDoc {
    _id: string;

    // Identity
    doorKey: string;
    groupName: string;
    memberNumber: number;

    // Tracking
    grantedAt: number;
    grantedBy: number; // Which admin granted this
    grantedReason?: string; // "Role assignment", "Custom grant"
    expiresAt?: number; // Optional expiration

    // Sync marker (used during migration and maintenance)
    syncedFromProfile: boolean;
}

/**
 * Runtime representation: Keypad location + door definition
 * Created when system loads locations and door definitions
 */
export interface KeypadDoor {
    location: {
        key: string;
        x: number;
        y: number;
        enabled: boolean;
    };
    doorDefinition: KeypadDoorDefinitionDoc;
}

/**
 * Access levels for keypad interactions
 */
export type KeypadAccessLevel = "admin" | "whitelist" | "guest" | "denied";

/**
 * Command handler permission levels
 */
export type CommandPermissionLevel = "guest" | "whitelist" | "admin";
