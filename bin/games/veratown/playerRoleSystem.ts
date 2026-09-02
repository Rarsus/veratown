/**
 * Feature 1.3.6: Player Role System
 *
 * Manages character roles and role-based access control for locations,
 * items, and activities. Enables role-specific narration and content.
 *
 * Example roles:
 * - "Guard" - access to security rooms, disciplinary powers
 * - "Nurse" - access to medical areas, healing abilities
 * - "Prisoner" - standard limited access
 * - "Visitor" - restricted visitor access
 * - "Staff" - administrative access
 */

import { Collection, Db } from "mongodb";
import { createLogger } from "../../logging";

export type PlayerRole =
    | "guard"
    | "nurse"
    | "prisoner"
    | "visitor"
    | "staff"
    | string; // Allow custom roles

export interface RolePermission {
    resourceType: "location" | "item" | "action" | "custom";
    resourceId: string;
    canAccess: boolean;
    canUse?: boolean;
    canModify?: boolean;
    canTransfer?: boolean;
    conditions?: Record<string, unknown>; // Time-based, location-based, etc.
}

export interface CharacterRole {
    memberNumber: number;
    characterName?: string;
    role: PlayerRole;
    assignedAt: number;
    assignedBy?: number; // Admin who assigned
    expiresAt?: number; // Optional expiration
    reason?: string; // Why they have this role
    customNarration?: Record<string, string>; // Role-specific messages
    permissions?: RolePermission[];
    active: boolean;
}

export interface RoleDefinition {
    roleId: PlayerRole;
    displayName: string;
    description: string;
    permissions: RolePermission[];
    narrationOverrides?: Record<string, string>; // Default narration for this role
    maxSimultaneous?: number; // Max characters with this role at once
    requiresApproval?: boolean; // Admin approval needed
    createdAt: number;
    updatedAt: number;
}

const PREDEFINED_ROLES: Record<
    PlayerRole,
    Omit<RoleDefinition, "createdAt" | "updatedAt">
> = {
    guard: {
        roleId: "guard",
        displayName: "Guard",
        description: "Prison guard with security access",
        permissions: [
            {
                resourceType: "location",
                resourceId: "security_room",
                canAccess: true,
                canModify: true,
            },
            {
                resourceType: "action",
                resourceId: "lock_down",
                canAccess: true,
            },
        ],
    },
    nurse: {
        roleId: "nurse",
        displayName: "Nurse",
        description: "Medical staff with infirmary access",
        permissions: [
            {
                resourceType: "location",
                resourceId: "infirmary",
                canAccess: true,
                canModify: true,
            },
            {
                resourceType: "action",
                resourceId: "heal",
                canAccess: true,
            },
        ],
    },
    prisoner: {
        roleId: "prisoner",
        displayName: "Prisoner",
        description: "Standard prisoner role",
        permissions: [
            {
                resourceType: "location",
                resourceId: "cell",
                canAccess: true,
            },
            {
                resourceType: "location",
                resourceId: "common_areas",
                canAccess: true,
            },
        ],
    },
    visitor: {
        roleId: "visitor",
        displayName: "Visitor",
        description: "Guest with limited access",
        permissions: [
            {
                resourceType: "location",
                resourceId: "visiting_room",
                canAccess: true,
            },
        ],
    },
    staff: {
        roleId: "staff",
        displayName: "Staff",
        description: "Administrative staff with elevated access",
        permissions: [
            {
                resourceType: "location",
                resourceId: "all",
                canAccess: true,
                canModify: true,
            },
            {
                resourceType: "action",
                resourceId: "admin",
                canAccess: true,
            },
        ],
    },
};

export class PlayerRoleSystem {
    private roleCollection: Collection<CharacterRole>;
    private definitionCollection: Collection<RoleDefinition>;
    private inited = false;
    private readonly logger = createLogger("PlayerRoleSystem");

    public constructor(private db: Db) {
        this.roleCollection = this.db.collection<CharacterRole>("playerRoles");
        this.definitionCollection =
            this.db.collection<RoleDefinition>("roleDefinitions");
    }

    private async init(): Promise<void> {
        if (this.inited) return;

        await this.roleCollection.createIndex({ memberNumber: 1 });
        await this.roleCollection.createIndex({ role: 1 });
        await this.roleCollection.createIndex({ active: 1 });
        await this.roleCollection.createIndex(
            { expiresAt: 1 },
            { sparse: true },
        );

        await this.definitionCollection.createIndex(
            { roleId: 1 },
            { unique: true },
        );

        // Initialize predefined roles
        for (const [roleId, roleDef] of Object.entries(PREDEFINED_ROLES)) {
            const existing = await this.definitionCollection.findOne({
                roleId: roleId as PlayerRole,
            });

            if (!existing) {
                await this.definitionCollection.insertOne({
                    ...roleDef,
                    roleId: roleId as PlayerRole,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
            }
        }

        this.inited = true;
    }

    /**
     * Get role definition
     */
    public async getRoleDefinition(
        roleId: PlayerRole,
    ): Promise<RoleDefinition | null> {
        await this.init();
        return this.definitionCollection.findOne({ roleId });
    }

    /**
     * Create custom role definition
     */
    public async defineRole(
        roleId: PlayerRole,
        definition: Omit<RoleDefinition, "createdAt" | "updatedAt">,
    ): Promise<RoleDefinition> {
        await this.init();

        const existing = await this.getRoleDefinition(roleId);
        if (existing) {
            throw new Error(`Role '${roleId}' already exists`);
        }

        const newDef: RoleDefinition = {
            ...definition,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        await this.definitionCollection.insertOne(newDef);

        this.logger.info(`Defined new role '${roleId}'`, { roleId });

        return newDef;
    }

    /**
     * Assign role to character
     */
    public async assignRole(
        memberNumber: number,
        roleId: PlayerRole,
        options?: {
            characterName?: string;
            assignedBy?: number;
            expiresAt?: number;
            reason?: string;
        },
    ): Promise<CharacterRole> {
        await this.init();

        // Check if role exists
        const roleDef = await this.getRoleDefinition(roleId);
        if (!roleDef) {
            throw new Error(`Role '${roleId}' does not exist`);
        }

        // Remove any existing active role for this character
        await this.roleCollection.updateMany(
            { memberNumber, active: true },
            { $set: { active: false } },
        );

        const characterRole: CharacterRole = {
            memberNumber,
            characterName: options?.characterName,
            role: roleId,
            assignedAt: Date.now(),
            assignedBy: options?.assignedBy,
            expiresAt: options?.expiresAt,
            reason: options?.reason,
            permissions: roleDef.permissions,
            active: true,
        };

        const result = await this.roleCollection.insertOne(characterRole);

        this.logger.info(
            `Assigned role '${roleId}' to character ${memberNumber}`,
            {
                memberNumber,
                roleId,
                expiresAt: options?.expiresAt,
            },
        );

        return characterRole;
    }

    /**
     * Get character's current role
     */
    public async getCharacterRole(
        memberNumber: number,
    ): Promise<CharacterRole | null> {
        await this.init();

        const role = await this.roleCollection.findOne({
            memberNumber,
            active: true,
        });

        // Check for expiration
        if (role && role.expiresAt && role.expiresAt < Date.now()) {
            await this.roleCollection.updateOne(
                { _id: role._id },
                { $set: { active: false } },
            );
            return null;
        }

        return role ?? null;
    }

    /**
     * Remove role from character
     */
    public async removeRole(memberNumber: number): Promise<void> {
        await this.init();

        await this.roleCollection.updateMany(
            { memberNumber, active: true },
            { $set: { active: false } },
        );

        this.logger.info(`Removed role from character ${memberNumber}`, {
            memberNumber,
        });
    }

    /**
     * Check if character can access resource
     */
    public async canAccessResource(
        memberNumber: number,
        resourceType: "location" | "item" | "action" | "custom",
        resourceId: string,
    ): Promise<boolean> {
        const role = await this.getCharacterRole(memberNumber);
        if (!role) {
            return false;
        }

        const permissions = role.permissions || [];

        for (const permission of permissions) {
            if (
                permission.resourceType === resourceType &&
                (permission.resourceId === resourceId ||
                    permission.resourceId === "all")
            ) {
                return permission.canAccess;
            }
        }

        return false;
    }

    /**
     * Check if character can use resource
     */
    public async canUseResource(
        memberNumber: number,
        resourceType: "location" | "item" | "action" | "custom",
        resourceId: string,
    ): Promise<boolean> {
        const role = await this.getCharacterRole(memberNumber);
        if (!role) {
            return false;
        }

        const permissions = role.permissions || [];

        for (const permission of permissions) {
            if (
                permission.resourceType === resourceType &&
                (permission.resourceId === resourceId ||
                    permission.resourceId === "all")
            ) {
                return permission.canUse !== false;
            }
        }

        return false;
    }

    /**
     * Get all permissions for character
     */
    public async getCharacterPermissions(
        memberNumber: number,
    ): Promise<RolePermission[]> {
        const role = await this.getCharacterRole(memberNumber);
        return role?.permissions ?? [];
    }

    /**
     * List all characters with specific role
     */
    public async getCharactersWithRole(
        roleId: PlayerRole,
    ): Promise<CharacterRole[]> {
        await this.init();

        return this.roleCollection
            .find({ role: roleId, active: true })
            .toArray();
    }

    /**
     * Get all active role assignments
     */
    public async getAllActiveRoles(): Promise<CharacterRole[]> {
        await this.init();

        return this.roleCollection.find({ active: true }).toArray();
    }

    /**
     * Update character's role permissions
     */
    public async updateRolePermissions(
        memberNumber: number,
        permissions: RolePermission[],
    ): Promise<void> {
        await this.init();

        await this.roleCollection.updateOne(
            { memberNumber, active: true },
            { $set: { permissions } },
        );

        this.logger.info(`Updated permissions for character ${memberNumber}`, {
            memberNumber,
            permissionCount: permissions.length,
        });
    }

    /**
     * Get role-specific narration
     */
    public async getRoleNarration(
        memberNumber: number,
        narrationKey: string,
    ): Promise<string | undefined> {
        const role = await this.getCharacterRole(memberNumber);
        if (!role) {
            return undefined;
        }

        // Check custom narration first
        if (role.customNarration?.[narrationKey]) {
            return role.customNarration[narrationKey];
        }

        // Check role definition
        const roleDef = await this.getRoleDefinition(role.role);
        return roleDef?.narrationOverrides?.[narrationKey];
    }

    /**
     * Get statistics about role distribution
     */
    public async getStatistics(): Promise<{
        totalCharactersWithRoles: number;
        roleDistribution: Record<PlayerRole, number>;
        totalRoleDefinitions: number;
    }> {
        await this.init();

        const result = await this.roleCollection
            .aggregate([
                { $match: { active: true } },
                {
                    $group: {
                        _id: "$role",
                        count: { $sum: 1 },
                    },
                },
            ])
            .toArray();

        const distribution: Record<PlayerRole, number> = {
            guard: 0,
            nurse: 0,
            prisoner: 0,
            visitor: 0,
            staff: 0,
        };

        let total = 0;
        for (const item of result) {
            distribution[item._id as PlayerRole] = item.count;
            total += item.count;
        }

        const totalDefs = await this.definitionCollection.countDocuments();

        return {
            totalCharactersWithRoles: total,
            roleDistribution: distribution,
            totalRoleDefinitions: totalDefs,
        };
    }

    /**
     * Clean up expired roles
     */
    public async cleanupExpiredRoles(): Promise<number> {
        await this.init();

        const now = Date.now();
        const result = await this.roleCollection.updateMany(
            { expiresAt: { $lt: now }, active: true },
            { $set: { active: false } },
        );

        const count = result.modifiedCount ?? 0;

        if (count > 0) {
            this.logger.info(`Cleaned up ${count} expired roles`, {
                expiredCount: count,
            });
        }

        return count;
    }
}
