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
import {
    GameStateMutationService,
    GameStateMutationServiceImpl,
} from "../../shared/gameStateMutationService";

/**
 * KeypadAccessService (Layer 2)
 *
 * Purpose: Manage character access to doors
 * - Grant/revoke authoritative group membership
 * - Check group membership and dynamic principals
 * - Manage access expiration
 * - Admin override capabilities
 *
 * Characteristics:
 * - Writes a compatibility projection to character profiles
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
        private mutationService: GameStateMutationService = new GameStateMutationServiceImpl(
            unifiedStore,
            unifiedStore.getEventBus(),
        ),
        private readonly roomWhitelistResolver: (
            memberNumber: number,
        ) => Promise<boolean> = async () => false,
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
        await this.memberships.createIndex({ groupKey: 1, memberNumber: 1 });
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
        expiresAt?: number,
    ): Promise<void> {
        const group = await this.definitionService.getGroupDefinition(
            doorKey,
            groupName,
        );
        const groupKey = group?.groupKey ?? `${doorKey}:${groupName}`;
        const access: KeypadAccessRecord = {
            doorKey,
            groupName,
            grantedAt: Date.now(),
            grantedBy,
            grantedReason: reason,
            expiresAt,
        };

        // Add to character profile (Layer 1)
        await this.mutationService.addKeypadAccess(
            memberNumber,
            access,
            grantedBy,
        );

        // Authoritative group membership. The profile write above remains a
        // compatibility projection until legacy access data is retired.
        await this.memberships.updateOne(
            { groupKey, memberNumber },
            {
                $set: {
                    doorKey,
                    groupName,
                    groupKey,
                    memberNumber,
                    grantedAt: access.grantedAt,
                    grantedBy,
                    grantedReason: reason,
                    expiresAt: access.expiresAt,
                    syncedFromProfile: false,
                    updatedAt: Date.now(),
                },
                $setOnInsert: {
                    _id: `${groupKey}:${memberNumber}`,
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
        await this.mutationService.removeKeypadAccess(
            memberNumber,
            doorKey,
            groupName,
        );

        // Remove from authoritative group membership.
        const group = groupName
            ? await this.definitionService.getGroupDefinition(
                  doorKey,
                  groupName,
              )
            : undefined;
        if (groupName) {
            await this.memberships.deleteMany({
                memberNumber,
                doorKey,
                groupName,
            });
            await this.memberships.deleteMany({
                memberNumber,
                groupKey: group?.groupKey ?? `${doorKey}:${groupName}`,
            });
        } else {
            await this.memberships.deleteMany({ doorKey, memberNumber });
        }
    }

    async grantGroupMembership(
        groupKey: string,
        memberNumber: number,
        grantedBy: number,
        reason?: string,
        expiresAt?: number,
    ): Promise<void> {
        const definitions =
            await this.definitionService.getGroupsByKey(groupKey);
        const definition = definitions[0];
        if (!definition) throw new Error(`Group not found: ${groupKey}`);
        await this.memberships.updateOne(
            { groupKey, memberNumber },
            {
                $set: {
                    doorKey: definition.doorKey,
                    groupName: definition.groupName,
                    groupKey,
                    memberNumber,
                    grantedAt: Date.now(),
                    grantedBy,
                    grantedReason: reason,
                    expiresAt,
                    syncedFromProfile: false,
                    updatedAt: Date.now(),
                },
                $setOnInsert: { _id: `${groupKey}:${memberNumber}` },
            },
            { upsert: true },
        );
    }

    async revokeGroupMembership(
        groupKey: string,
        memberNumber: number,
    ): Promise<void> {
        await this.memberships.deleteMany({ groupKey, memberNumber });
    }

    async getMembersInGroupKey(
        groupKey: string,
    ): Promise<KeypadGroupMembershipDoc[]> {
        return this.memberships.find({ groupKey }).toArray();
    }

    async getAuthoritativeMembershipsForMember(
        memberNumber: number,
    ): Promise<KeypadGroupMembershipDoc[]> {
        return this.memberships.find({ memberNumber }).toArray();
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
     * Check if character is restricted from using keypads (e.g. caged or restricted role)
     */
    private async isAccessRestricted(memberNumber: number): Promise<boolean> {
        const profile = await this.unifiedStore.getProfile(memberNumber);
        if (!profile?.veratown) return false;

        const activeIncarceration = profile.veratown.cageIncarcerations?.some(
            (c) => !c.releasedAt,
        );
        if (activeIncarceration) return true;

        if (profile.veratown.roles?.includes("restricted")) return true;

        return false;
    }

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

        if (await this.isAccessRestricted(memberNumber)) return false;

        return (
            (await this.getAccessLevel(memberNumber, doorKey, false)) !==
            "denied"
        );
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

        if (await this.isAccessRestricted(memberNumber)) return "denied";

        const groups = await this.definitionService.getGroupsForDoor(doorKey);
        const now = Date.now();
        const memberships = await this.memberships
            .find({ memberNumber })
            .toArray();
        const sharedGroupKeys = new Set(
            groups
                .filter((group) => group.principalType !== "room_whitelist")
                .map((group) => group.groupKey),
        );
        const validMemberships = memberships.filter(
            (membership) =>
                (!membership.expiresAt || membership.expiresAt > now) &&
                (membership.doorKey === doorKey ||
                    (membership.groupKey !== undefined &&
                        sharedGroupKeys.has(membership.groupKey))),
        );
        const validGroups = groups.filter((group) => {
            if (group.principalType === "room_whitelist") {
                return false;
            }
            const key = group.groupKey ?? `${doorKey}:${group.groupName}`;
            return validMemberships.some(
                (membership) =>
                    membership.groupKey === key ||
                    (membership.doorKey === doorKey &&
                        membership.groupName === group.groupName),
            );
        });
        const roomWhitelistGroup = groups.some(
            (group) => group.principalType === "room_whitelist",
        );
        const roomWhitelisted = roomWhitelistGroup
            ? await this.roomWhitelistResolver(memberNumber)
            : false;

        if (
            validGroups.some((group) => group.groupName === "admin") ||
            validMemberships.some(
                (membership) => membership.groupName === "admin",
            )
        ) {
            return "admin";
        }
        if (
            roomWhitelisted ||
            validGroups.some((group) => group.groupName === "whitelist") ||
            validMemberships.some(
                (membership) => membership.groupName === "whitelist",
            )
        ) {
            return "whitelist";
        }
        return validGroups.length > 0 || validMemberships.length > 0
            ? "guest"
            : "denied";
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

        if (await this.isAccessRestricted(memberNumber)) return false;

        // Verify the code is valid for this door
        const codeGroup = (
            await this.definitionService.getGroupsForDoor(doorKey)
        ).find((group) => group.code === code || group.codes?.includes(code));
        if (!codeGroup) {
            return false;
        }
        const groupName = codeGroup.groupName;

        const now = Date.now();
        const group = await this.definitionService.getGroupDefinition(
            doorKey,
            groupName,
        );
        const membership = (
            await this.memberships.find({ memberNumber }).toArray()
        ).find(
            (candidate) =>
                candidate.memberNumber === memberNumber &&
                candidate.groupName === groupName &&
                (candidate.doorKey === doorKey ||
                    candidate.groupKey ===
                        (group?.groupKey ?? `${doorKey}:${groupName}`)),
        );
        const legacyAccess = (
            await this.getCharacterAccessToDoor(memberNumber, doorKey)
        ).find(
            (access) =>
                access.groupName === groupName &&
                (!access.expiresAt || access.expiresAt > now),
        );
        return Boolean(
            (membership &&
                (!membership.expiresAt || membership.expiresAt > now)) ||
            legacyAccess,
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
