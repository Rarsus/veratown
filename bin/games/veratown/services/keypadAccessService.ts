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

import { Collection, Db } from "mongodb";
import { KeypadAccessRecord } from "../../shared/unifiedCharacterTypes";
import { KeypadAccessLevel, KeypadGroupMembershipDoc } from "../keypadTypes";
import { KeypadDefinitionService } from "./keypadDefinitionService";
import { UnifiedCharacterStore } from "../../shared/unifiedCharacterStore";

/**
 * KeypadAccessService (Layer 2)
 *
 * Purpose: Manage character access to doors
 * - Grant/revoke access (modifies character profiles)
 * - Check character access (reads character profiles)
 * - Manage access expiration
 * - Admin override capabilities
 *
 * Characteristics:
 * - Reads/writes character-specific data (Layer 1)
 * - Uses door definitions (Layer 3)
 * - Coordinates between layers
 *
 * @CROSS-SYSTEM Used by KeypadDoorSystem, Commands, LocationIntegration
 */
export class KeypadAccessService {
    private memberships: Collection<KeypadGroupMembershipDoc>;

    constructor(
        private db: Db,
        private definitionService: KeypadDefinitionService,
        private unifiedStore: UnifiedCharacterStore,
    ) {
        this.memberships = this.db.collection("keypadGroupMemberships");
    }

    /**
     * Initialize membership collection indexes
     */
    async init(): Promise<void> {
        await this.memberships.createIndex({ doorKey: 1 });
        await this.memberships.createIndex({
            doorKey: 1,
            groupName: 1,
        });
        await this.memberships.createIndex({ memberNumber: 1 });
        await this.memberships.createIndex({
            doorKey: 1,
            memberNumber: 1,
        });
        await this.memberships.createIndex({ expiresAt: 1 });
    }

    // ===== CHARACTER ACCESS MANAGEMENT =====

    /**
     * Grant access to a door for a character
     */
    async grantAccess(
        memberNumber: number,
        doorKey: string,
        groupName: string,
        grantedBy: number,
        reason?: string,
    ): Promise<void> {
        const access: KeypadAccessRecord = {
            doorKey,
            groupName,
            grantedAt: Date.now(),
            grantedBy,
            grantedReason: reason,
        };

        // Add to character profile (Layer 1)
        await this.unifiedStore.addKeypadAccess(memberNumber, access);

        // Add to membership index (for admin UI queries)
        await this.memberships.updateOne(
            { doorKey, groupName, memberNumber },
            {
                $set: {
                    doorKey,
                    groupName,
                    memberNumber,
                    grantedAt: access.grantedAt,
                    grantedBy,
                    grantedReason: reason,
                    syncedFromProfile: true,
                    updatedAt: Date.now(),
                },
            },
            { upsert: true },
        );
    }

    /**
     * Revoke access from a character
     * @param groupName - If undefined, revokes from ALL groups at this door
     */
    async revokeAccess(
        memberNumber: number,
        doorKey: string,
        groupName?: string,
    ): Promise<void> {
        // Remove from character profile (Layer 1)
        await this.unifiedStore.removeKeypadAccess(
            memberNumber,
            doorKey,
            groupName,
        );

        // Remove from membership index
        const query: Record<string, unknown> = { doorKey, memberNumber };
        if (groupName) {
            query.groupName = groupName;
        }
        await this.memberships.deleteMany(query as any);
    }

    /**
     * Get all access records for a character
     */
    async getCharacterAccess(
        memberNumber: number,
    ): Promise<KeypadAccessRecord[]> {
        const profile = await this.unifiedStore.getProfile(memberNumber);
        return profile?.veratown?.keypadAccess ?? [];
    }

    /**
     * Get character's access to a specific door
     */
    async getCharacterAccessToDoor(
        memberNumber: number,
        doorKey: string,
    ): Promise<KeypadAccessRecord[]> {
        const access = await this.getCharacterAccess(memberNumber);
        return access.filter((a) => a.doorKey === doorKey);
    }

    // ===== DOOR ACCESS CHECKING =====

    /**
     * Check if a character can access a door (comprehensive check)
     * Returns the highest access level the character has
     */
    async canAccessDoor(
        memberNumber: number,
        doorKey: string,
        isAdmin: boolean,
    ): Promise<boolean> {
        // Admins always have access
        if (isAdmin) return true;

        // Check character's keypad access
        const access = await this.getCharacterAccessToDoor(
            memberNumber,
            doorKey,
        );
        if (access.length > 0) {
            // Check if any access is still valid (not expired)
            const now = Date.now();
            return access.some((a) => !a.expiresAt || a.expiresAt > now);
        }

        return false;
    }

    /**
     * Get the highest access level for a character at a door
     * Returns: admin > whitelist > guest > denied
     */
    async getAccessLevel(
        memberNumber: number,
        doorKey: string,
        isAdmin: boolean,
    ): Promise<KeypadAccessLevel> {
        if (isAdmin) return "admin";

        const access = await this.getCharacterAccessToDoor(
            memberNumber,
            doorKey,
        );
        const now = Date.now();

        // Filter expired access
        const validAccess = access.filter(
            (a) => !a.expiresAt || a.expiresAt > now,
        );

        if (validAccess.length === 0) {
            return "denied";
        }

        // Check access levels (admin > whitelist > guest)
        if (validAccess.some((a) => a.groupName === "admin")) {
            return "admin";
        }
        if (validAccess.some((a) => a.groupName === "whitelist")) {
            return "whitelist";
        }

        return "guest";
    }

    /**
     * Check if a code grants access to a door for a character
     */
    async canAccessWithCode(
        memberNumber: number,
        doorKey: string,
        code: string,
        isAdmin: boolean,
    ): Promise<boolean> {
        if (isAdmin) return true;

        // Verify the code is valid for this door
        const groupName = await this.definitionService.verifyCode(
            doorKey,
            code,
        );
        if (!groupName) {
            return false;
        }

        // Check if character has access to this group
        const access = await this.getCharacterAccess(memberNumber);
        const now = Date.now();

        return access.some(
            (a) =>
                a.doorKey === doorKey &&
                a.groupName === groupName &&
                (!a.expiresAt || a.expiresAt > now),
        );
    }

    // ===== ADMIN QUERIES =====

    /**
     * Get all members with access to a door (uses membership index)
     */
    async getMembersWithAccessToDoor(
        doorKey: string,
    ): Promise<KeypadGroupMembershipDoc[]> {
        return this.memberships.find({ doorKey }).toArray();
    }

    /**
     * Get all members in a specific group at a door
     */
    async getMembersInGroup(
        doorKey: string,
        groupName: string,
    ): Promise<KeypadGroupMembershipDoc[]> {
        return this.memberships.find({ doorKey, groupName }).toArray();
    }

    /**
     * Check if admin override is allowed (always true, but can be extended)
     */
    isAdminOverride(_memberNumber: number): boolean {
        // Admins can always unlock doors
        return true;
    }
}
