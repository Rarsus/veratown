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

import { API_Character, API_Character_Data } from "./apiCharacter.ts";
import { isBind, isBody, isClothing, isCosplay } from "./assetHelpers.ts";
import { wait } from "./util/wait.ts";
import { API_AppearanceItem, BC_AppearanceItem } from "./item.ts";
import lzString from "lz-string";

/*
const CLOTHING_SLOTS = [
	'Bra',
	'Bracelet',
	'Cloth',
	'ClothAccessory',
	'ClothLower',
	'Corset',
	'Garters',
	'Glasses' ,
	'Gloves',
	//'HairAccessory1' | 'HairAccessory2' | 'HairAccessory3'
	'Hat',
	'Jewelry',
	'LeftAnklet',
	'LeftHand',
	'Mask',
    'Necklace',
	'Panties',
	'RightAnklet',
	'RightHand',
	'Shoes',
	'Socks',
	'SocksLeft',
	'SocksRight',
	'Suit',
	'SuitLower',
];


const ITEM_SLOTS = [
	'ItemAddon',
	'ItemArms',
	'ItemBoots',
	'ItemBreast',
	'ItemButt',
	'ItemDevices',
	'ItemEars',
	'ItemFeet',
	'ItemHands',
	'ItemHead',
	'ItemHood',
	'ItemLegs',
	'ItemMisc',
	'ItemMouth',
	'ItemMouth2',
	'ItemMouth3',
	//'ItemNeck' | 'ItemNeckAccessories'
	'ItemNeckRestraints',
	'ItemNipples',
	'ItemNipplesPiercings',
	'ItemNose',
	'ItemPelvis',
	'ItemTorso',
	'ItemTorso2',
	'ItemVulva',
	'ItemVulvaPiercings',
	'ItemHandheld',
];*/

export interface BundleApplyConfig {
    appearance?: boolean;
    bodyCosplay?: boolean;
    clothing?: boolean;
    item?: boolean;
}

// Priority order used by stripBulk() when a maxItems cap limits how many
// clothing items get removed (e.g. Dare's strip-category dares). Earlier
// entries are stripped first; only slots that are actually occupied count
// towards/consume the cap. Any equipped clothing group that isn't listed
// here is only eligible for removal after every listed slot has already
// been considered.
export const CLOTHING_STRIP_PRIORITY: AssetGroupName[] = [
    "ClothOuter",
    "Gloves",
    "Shoes",
    "Socks",
    "Cloth",
    "ClothLower",
    "Corset",
    "Bra",
    "Garters",
    "Panties",
    "Suit",
    "SuitLower",
    "Hat",
];

const DEFAULT_APPLY_CFG: BundleApplyConfig = {
    appearance: true,
    bodyCosplay: true,
    clothing: true,
    item: true,
};

export function importBundle(bundle: string): BC_AppearanceItem[] {
    return JSON.parse(
        lzString.decompressFromBase64(bundle),
    ) as BC_AppearanceItem[];
}

export function exportBundle(items: BC_AppearanceItem[]): string {
    return lzString.compressToBase64(JSON.stringify(items));
}

export class AssetType {
    public constructor(private def: Asset) {}

    public get AllowExpression(): readonly ExpressionName[] | undefined {
        return this.def.AllowExpression;
    }
    /*public set AllowExpression(ex: ExpressionName[]) {
		this.def.AllowExpression = ex;
	}*/

    public countColorableLayers(): number {
        return this.def.Layer ? this.def.Layer.length : 1;
    }
}

export class AppearanceType {
    private _items: API_AppearanceItem[];

    constructor(
        private readonly character: API_Character,
        private readonly charData: API_Character_Data,
    ) {
        this._items = this.data.map(
            (i) => new API_AppearanceItem(character, i),
        );
    }

    private get data(): BC_AppearanceItem[] {
        return this.charData.Appearance;
    }
    private set data(d: BC_AppearanceItem[]) {
        this.charData.Appearance = d;
    }

    public get Appearance(): API_AppearanceItem[] {
        return this._items;
    }

    public getAppearanceData(): BC_AppearanceItem[] {
        return this.data;
    }

    public AddItem(desc: BC_AppearanceItem): API_AppearanceItem {
        const newItem = this.bulkAddItem(desc);

        newItem.queueUpdate();
        return newItem;
    }

    public RemoveItem(slot: AssetGroupName): void {
        //const idx = this._items.findIndex((i) => i.Group === slot);
        const idx = this.data.findIndex((i) => i.Group === slot);
        if (idx === -1) return;

        const removed = this._items[idx];

        //this._items.splice(idx, 1);
        this.data.splice(idx, 1);
        this._items = this.data.map(
            (i) => new API_AppearanceItem(this.character, i),
        );

        removed.setRemoved();
        removed.queueUpdate();
    }

    public InventoryGet(
        groupName: AssetGroupName | ExpressionGroupName,
    ): API_AppearanceItem | null {
        const item = this.data.find((i) => i.Group === groupName);
        if (!item) return null;

        return new API_AppearanceItem(this.character, item);
    }

    /**
     * Lightweight alternative to InventoryGet() for callers that only need
     * to read raw item data (e.g. Name/Property) and don't need an
     * API_AppearanceItem wrapper. Avoids allocating a wrapper object, which
     * matters for code that polls this repeatedly (e.g. a timed loop
     * checking someone's current expression or equipped device every few
     * seconds).
     */
    public getItemData(
        groupName: AssetGroupName | ExpressionGroupName,
    ): BC_AppearanceItem | undefined {
        return this.data.find((i) => i.Group === groupName);
    }

    public stripBulk(
        cfg: BundleApplyConfig,
        stripLocked = false,
        maxItems: number | undefined = undefined,
    ): boolean {
        let numItemsStripped = 0;
        let capped = false;

        // When capping how many clothing items to remove, decide *which*
        // slots to strip up front (in CLOTHING_STRIP_PRIORITY order,
        // skipping any slot that isn't actually occupied) instead of
        // whatever order items happen to be stored in. Without this, a
        // maxItems cap on clothing had no effect at all (see below).
        let clothingGroupsToStrip: Set<AssetGroupName> | undefined;
        if (cfg.clothing && maxItems !== undefined) {
            clothingGroupsToStrip = new Set();
            const equippedGroups = new Set(
                this.data.filter((i) => isClothing(i)).map((i) => i.Group),
            );
            for (const group of CLOTHING_STRIP_PRIORITY) {
                if (clothingGroupsToStrip.size >= maxItems) break;
                if (equippedGroups.has(group)) clothingGroupsToStrip.add(group);
            }
            // Any equipped clothing group not covered by the priority list
            // is only eligible once every listed slot has been considered.
            if (clothingGroupsToStrip.size < maxItems) {
                for (const group of equippedGroups) {
                    if (clothingGroupsToStrip.size >= maxItems) break;
                    if (!clothingGroupsToStrip.has(group))
                        clothingGroupsToStrip.add(group);
                }
            }
            if (equippedGroups.size > clothingGroupsToStrip.size) capped = true;
        }

        this.data = this.data.filter((i) => {
            if (i.Group === "ItemNeck" || i.Group == "ItemNeckAccessories")
                return true;
            if (stripLocked && i.Property?.LockedBy) return false;

            if (cfg.appearance && isBody(i)) return false;
            if (cfg.bodyCosplay && isCosplay(i)) return false;
            if (cfg.clothing && isClothing(i)) {
                // Capped clothing removal: only strip slots chosen above,
                // in priority order - everything else stays on for now.
                if (
                    clothingGroupsToStrip &&
                    !clothingGroupsToStrip.has(i.Group)
                ) {
                    return true;
                }
                return false;
            }
            if (maxItems !== undefined && numItemsStripped >= maxItems) {
                capped = true;
                return true;
            }
            if (cfg.item && isBind(i)) {
                ++numItemsStripped;
                return false;
            }
            return true;
        });

        this.character.sendAppearanceUpdate();

        return capped;
    }

    /**
     * strip clothing / cosplay etc in bulk but items one-by-one to avoid WCE's anti-cheat
     */
    public async slowlyStripBulk(
        cfg: BundleApplyConfig,
        stripLocked = false,
    ): Promise<void> {
        if (cfg.item) {
            for (const item of this.data.filter((i) => isBind(i))) {
                if (
                    item.Group === "ItemNeck" ||
                    item.Group == "ItemNeckAccessories"
                )
                    continue;
                if (!stripLocked && item.Property?.LockedBy) continue;

                this.RemoveItem(item.Group);
                await wait(300);
            }
        }

        this.stripBulk(Object.assign({}, cfg, { item: false }), stripLocked);
    }

    public applyBundle(
        items: BC_AppearanceItem[],
        cfg: BundleApplyConfig = DEFAULT_APPLY_CFG,
        skipGroups: AssetGroupName[] = [],
    ): boolean {
        const filteredItems = this.filterItems(items, cfg, skipGroups);

        for (const item of filteredItems) {
            this.bulkAddItem(item);
        }

        this.character.sendAppearanceUpdate();

        return true;
    }

    public async slowlyApplyBundle(
        items: BC_AppearanceItem[],
        cfg: BundleApplyConfig = DEFAULT_APPLY_CFG,
        skipGroups: AssetGroupName[] = [],
    ): Promise<void> {
        let haveAdded = false;

        const filteredItems = this.filterItems(items, cfg, skipGroups);

        // clothing etc we can add in bulk
        const nonItems = filteredItems.filter((i) => !isBind(i));
        for (const item of nonItems) {
            this.bulkAddItem(item);
        }

        if (nonItems.length > 0) {
            haveAdded = true;
            this.character.sendAppearanceUpdate();
        }

        // items we need to do one to avoid tripping WCE's anti-cheat
        for (const item of filteredItems.filter((i) => isBind(i))) {
            if (haveAdded) {
                await wait(300);
            }
            this.AddItem(item).SetDifficulty(20);
            haveAdded = true;
        }
    }

    public MakeAppearanceBundle(): BC_AppearanceItem[] {
        return JSON.parse(JSON.stringify(this.data));
    }

    public SetExpression(group: AssetGroupName, expr: ExpressionName): void {
        const item = this._items.find((i) => i.Group === group);
        if (!item) return;

        item.SetExpression(expr);
    }

    public updateItemData(item: BC_AppearanceItem): void {
        const idx = this.data.findIndex((i) => i.Group === item.Group);
        if (idx === -1) {
            console.error("Couldn't find item to update in slot", item.Group);
            return;
        }

        this.data[idx] = item;
    }

    public allItems(): API_AppearanceItem[] {
        return this._items;
    }

    private bulkAddItem(item: BC_AppearanceItem): API_AppearanceItem {
        this.data = this.data.filter((i) => i.Group !== item.Group);
        this._items = this._items.filter((i) => i.Group !== item.Group);

        /*console.log(
            `Adding item ${item.Group} (${item.Name}) to character ${this.character.Name}`,
        );*/

        const newItem = new API_AppearanceItem(this.character, item);
        this._items.push(newItem);
        this.data.push(newItem.getData());

        return newItem;
    }

    private filterItems(
        items: BC_AppearanceItem[],
        cfg: BundleApplyConfig = DEFAULT_APPLY_CFG,
        skipGroups: AssetGroupName[] = [],
    ): BC_AppearanceItem[] {
        return items.filter((i) => {
            if (skipGroups.includes(i.Group)) return false;
            if (!cfg.appearance && isBody(i)) return false;
            if (!cfg.bodyCosplay && isCosplay(i)) return false;
            if (!cfg.clothing && isClothing(i)) return false;
            if (!cfg.item && isBind(i)) return false;
            return true;
        });
    }
}
