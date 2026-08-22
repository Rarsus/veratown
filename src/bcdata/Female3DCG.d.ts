/**
 * Type definitions for Female3DCG.js
 * Synced from Bondage-College repository
 */

/** Effect/property constants */
export declare const E: Readonly<Record<string, string>>;

/** Asset group definitions */
export declare var AssetFemale3DCG: AssetGroupDefinition[];

/** Pose definitions */
export declare var PoseFemale3DCG: Pose[];

/** Array of pose names */
export declare var PoseFemale3DCGNames: AssetPoseName[];

/** Set of fetish names */
export declare const FetishFemale3DCGNames: Set<string>;

/** Pose type constants */
export declare const PoseType: Record<string, string>;

/** Pose arrays for different positions */
export declare const PoseAllKneeling: readonly string[];
export declare const PoseAllStanding: readonly string[];

/** Asset pose mappings */
export declare const AssetPoseMapping: Partial<
    Record<AssetGroupName, Partial<Record<AssetPoseName, AssetPoseName | string>>>
>;

/** Male-specific asset lists */
export declare const AssetMalePantiesList: string[];
export declare const AssetMaleChasityCagesList: string[];
