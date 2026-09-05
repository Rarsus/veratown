/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { BC_AppearanceItem } from "bc-bot";

export interface LockedDeviceConfig {
    assetGroup: AssetGroupName;
    assetName: string;
    lockDifficulty?: number;
    lockType?: string;
    color?: string[];
    craftName?: string;
    craftDescription?: string;
    owner?: number;
}

export interface KeypadLockedDeviceConfig extends LockedDeviceConfig {
    doorKey: string;
    keypadGroup?: string;
}

export type RestraintConfig = LockedDeviceConfig;

/**
 * Creates consistently configured appearance items for game systems.
 */
export class DeviceFactory {
    public createLockedDevice(config: LockedDeviceConfig): BC_AppearanceItem {
        if (!config.assetGroup || !config.assetName) {
            throw new Error("assetGroup and assetName are required");
        }
        if (
            config.lockDifficulty !== undefined &&
            (!Number.isFinite(config.lockDifficulty) ||
                config.lockDifficulty < 0)
        ) {
            throw new Error("lockDifficulty must be a non-negative number");
        }

        const device = {
            Group: config.assetGroup,
            Name: config.assetName,
        } as BC_AppearanceItem;
        if (config.color) device.Color = config.color as typeof device.Color;
        device.Craft = {
            Item: config.assetName,
            Name: config.craftName ?? `Locked ${config.assetName}`,
            Description:
                config.craftDescription ??
                `A locked ${config.assetName.toLowerCase()}`,
            Lock: "",
            MemberNumber: config.owner,
        } as typeof device.Craft;
        device.Property = {
            ...(device.Property ?? {}),
            Lock: {
                Difficulty: config.lockDifficulty ?? 0,
                AssetName: config.lockType ?? "CrateLock",
                EnabledOwnLockSelfSelfBondage: false,
                MemberNumberWhitelist:
                    config.owner === undefined ? [] : [config.owner],
                LockSet: true,
            },
        } as typeof device.Property;
        return device;
    }

    public createRestraint(config: RestraintConfig): BC_AppearanceItem {
        return this.createLockedDevice(config);
    }

    public createKeypadLockedDevice(
        config: KeypadLockedDeviceConfig,
    ): BC_AppearanceItem {
        if (!config.doorKey) {
            throw new Error("doorKey is required for keypad locked devices");
        }
        const device = this.createLockedDevice({
            ...config,
            lockType: config.lockType ?? "KeypadLock",
        });
        const prop = device.Property as Record<string, any> | undefined;
        if (prop?.Lock) {
            prop.Lock.KeypadDoorKey = config.doorKey;
            if (config.keypadGroup) {
                prop.Lock.KeypadGroup = config.keypadGroup;
            }
        }
        return device;
    }
}
