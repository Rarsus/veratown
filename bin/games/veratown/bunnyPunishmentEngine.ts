import { AssetGet, getExtendedAssetDef } from "bc-bot";
import type {
    BunnyRestraintConfig,
    BunnyRestraintPiece,
} from "./veratownConfig";

export const BUNNY_SIGN = {
    group: "ItemMisc",
    asset: "WoodenSign",
} as const;
export const BUNNY_SIGN_TEXT = "I step on";
export const BUNNY_SIGN_TEXT2 = "Bunnies";

export type BunnyPunishmentPiece = BunnyRestraintPiece | typeof BUNNY_SIGN;

export interface BunnyAppearanceItem {
    Group: string;
    Name: string;
    Property?: unknown;
}

export interface BunnyPunishmentPlan {
    requestedPieces: BunnyPunishmentPiece[];
    currentPieces: string[];
    exactPieces: BunnyPunishmentPiece[];
    missingPieces: BunnyPunishmentPiece[];
    blockedPieces: BunnyPunishmentPiece[];
}

export interface BunnySignVerification {
    present: boolean;
    visible: boolean;
    reason?: string;
}

export function bunnyPieceKey(piece: { group: string; asset: string }): string {
    return `${piece.group}/${piece.asset}`;
}

/**
 * Decide which groups can be filled without replacing anything already worn.
 * This function has no character or mutation dependency so the decision can
 * be tested independently from Bondage Club's eventually-consistent API.
 */
export function planBunnyPunishment(
    currentAppearance: readonly BunnyAppearanceItem[],
    config: BunnyRestraintConfig,
): BunnyPunishmentPlan {
    const requestedPieces = [...config.pieces, BUNNY_SIGN];
    const currentByGroup = new Map(
        currentAppearance.map((item) => [item.Group, item]),
    );
    const exactPieces: BunnyPunishmentPiece[] = [];
    const missingPieces: BunnyPunishmentPiece[] = [];
    const blockedPieces: BunnyPunishmentPiece[] = [];

    for (const piece of requestedPieces) {
        const current = currentByGroup.get(piece.group);
        if (!current) {
            missingPieces.push(piece);
        } else if (current.Name === piece.asset) {
            exactPieces.push(piece);
        } else {
            blockedPieces.push(piece);
        }
    }

    return {
        requestedPieces,
        currentPieces: currentAppearance.map(
            (item) => `${item.Group}/${item.Name}`,
        ),
        exactPieces,
        missingPieces,
        blockedPieces,
    };
}

export function hasBunnyPiece(
    appearance: readonly BunnyAppearanceItem[],
    piece: BunnyPunishmentPiece,
): boolean {
    return appearance.some(
        (item) => item.Group === piece.group && item.Name === piece.asset,
    );
}

export function verifyBunnySign(
    appearance: readonly BunnyAppearanceItem[],
): BunnySignVerification {
    const sign = appearance.find(
        (item) =>
            item.Group === BUNNY_SIGN.group && item.Name === BUNNY_SIGN.asset,
    );
    if (!sign) {
        return {
            present: false,
            visible: false,
            reason: "WoodenSign is missing from the appearance bundle",
        };
    }

    const extended = getExtendedAssetDef(
        AssetGet(BUNNY_SIGN.group, BUNNY_SIGN.asset),
    );
    const property = (sign.Property ?? {}) as {
        Text?: unknown;
        Text2?: unknown;
    };
    const textConfig =
        extended?.Archetype === "text" ? extended.MaxLength : undefined;
    const textFits =
        typeof property.Text === "string" &&
        typeof property.Text2 === "string" &&
        (!textConfig?.Text || property.Text.length <= textConfig.Text) &&
        (!textConfig?.Text2 || property.Text2.length <= textConfig.Text2);
    const visible =
        textFits &&
        property.Text === BUNNY_SIGN_TEXT &&
        property.Text2 === BUNNY_SIGN_TEXT2;

    return {
        present: true,
        visible,
        ...(visible
            ? {}
            : {
                  reason: "WoodenSign is present but its render text properties are incomplete or invalid",
              }),
    };
}
