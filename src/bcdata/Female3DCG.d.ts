/**
 * Type definitions for Female3DCG.js
 * Synced from Bondage-College repository
 */

declare namespace E {
    // Movement/Interaction effects
    let Freeze: "Freeze";
    let BlockWardrobe: "BlockWardrobe";
    let Block: "Block";
    let Mounted: "Mounted";
    let OnBed: "OnBed";
    let Lifted: "Lifted";
    let Suspended: "Suspended";
    let Slow: "Slow";
    let MapImmobile: "MapImmobile";
    let MapSwim: "MapSwim";
    let Enclose: "Enclose";
    let OneWayEnclose: "OneWayEnclose";

    // Cuff/Restraint effects
    let CuffedFeet: "CuffedFeet";
    let CuffedLegs: "CuffedLegs";
    let CuffedArms: "CuffedArms";
    let IsChained: "IsChained";
    let Shackled: "Shackled";
    let Tethered: "Tethered";
    let FixedHead: "FixedHead";
    let MergedFingers: "MergedFingers";

    // Vulva effects
    let FillVulva: "FillVulva";
    let VulvaShaft: "VulvaShaft";
    let IsPlugged: "IsPlugged";
    let ForcedErection: "ForcedErection";

    // Vibrator effects
    let Vibrating: "Vibrating";
    let Egged: "Egged";
    let Edged: "Edged";
    let DenialMode: "DenialMode";
    let RuinOrgasms: "RuinOrgasms";
    let CanEdge: "CanEdge";

    // Remote effects
    let Remote: "Remote";
    let UseRemote: "UseRemote";
    let BlockRemotes: "BlockRemotes";

    // Chastity effects
    let Chaste: "Chaste";
    let BreastChaste: "BreastChaste";
    let ButtChaste: "ButtChaste";

    // Leash effects
    let Leash: "Leash";
    let IsLeashed: "IsLeashed";

    // Stimulation effects
    let CrotchRope: "CrotchRope";
    let Wiggling: "Wiggling";

    // Shock effects
    let ReceiveShock: "ReceiveShock";
    let TriggerShock: "TriggerShock";

    // Perception effects
    let BlindLight: "BlindLight";
    let BlindNormal: "BlindNormal";
    let BlindHeavy: "BlindHeavy";
    let BlindTotal: "BlindTotal";
    let BlurLight: "BlurLight";
    let BlurNormal: "BlurNormal";
    let BlurHeavy: "BlurHeavy";
    let BlurTotal: "BlurTotal";
    let DeafLight: "DeafLight";
    let DeafNormal: "DeafNormal";
    let DeafHeavy: "DeafHeavy";
    let DeafTotal: "DeafTotal";

    // Gag effects
    let GagLight: "GagLight";
    let GagNormal: "GagNormal";
    let GagMedium: "GagMedium";
    let GagHeavy: "GagHeavy";
    let GagVeryLight: "GagVeryLight";
    let GagVeryHeavy: "GagVeryHeavy";
    let GagTotal: "GagTotal";
    let GagTotal2: "GagTotal2";
    let GagTotal3: "GagTotal3";
    let GagTotal4: "GagTotal4";
    let GagEasy: "GagEasy";
    let OpenMouth: "OpenMouth";
    let ProtrudingMouth: "ProtrudingMouth";
    let BlockMouth: "BlockMouth";

    // Misc effects
    let NotSelfPickable: "NotSelfPickable";
    let Lock: "Lock";
    let HideRestraints: "HideRestraints";
    let OpenPermission: "OpenPermission";
    let OpenPermissionArm: "OpenPermissionArm";
    let OpenPermissionLeg: "OpenPermissionLeg";
    let OpenPermissionChastity: "OpenPermissionChastity";
    let RegressedTalk: "RegressedTalk";
    let KinkyDungeonParty: "KinkyDungeonParty";
    let VR: "VR";
    let VRAvatars: "VRAvatars";

    // Unlock effects
    let UnlockOwnerPadlock: "UnlockOwnerPadlock";
    let UnlockOwnerTimerPadlock: "UnlockOwnerTimerPadlock";
    let UnlockLoversTimerPadlock: "UnlockLoversTimerPadlock";
    let UnlockLoversPadlock: "UnlockLoversPadlock";
    let UnlockMistressPadlock: "UnlockMistressPadlock";
    let UnlockMistressTimerPadlock: "UnlockMistressTimerPadlock";
    let UnlockPandoraPadlock: "UnlockPandoraPadlock";
    let UnlockEscortAnkleCuffs: "UnlockEscortAnkleCuffs";
    let UnlockFamilyPadlock: "UnlockFamilyPadlock";
    let UnlockMetalCuffs: "UnlockMetalCuffs";
    let UnlockMetalPadlock: "UnlockMetalPadlock";
    let UnlockPortalPanties: "UnlockPortalPanties";
}

export declare const E: typeof E;

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
