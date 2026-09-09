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

export interface Cocktail {
    name: string;
    description: string;
    colour: HexColor;
}

export interface CocktailDocument extends Cocktail {
    readonly _id: string;
    readonly key: string;
    readonly enabled: boolean;
    readonly createdAt: number;
    readonly updatedAt: number;
}

export const DEFAULT_COCKTAILS: Record<string, Cocktail> = {
    oldFashioned: {
        name: "Old Fashioned",
        colour: "#B86B35",
        description:
            "Bourbon stirred with demerara sugar and aromatic bitters, finished with an orange twist and a slow, amber glow; no sedative, just warmth.",
    },
    margarita: {
        name: "Margarita",
        colour: "#D9E85A",
        description:
            "Tequila, triple sec, and bright lime shaken cold over a salt rim: crisp, tart, and impossible to ignore, with an aphrodisiac-inspired blush.",
    },
    mojito: {
        name: "Mojito",
        colour: "#B8E0A5",
        description:
            "White rum, muddled mint, lime, sugar, and sparkling soda: a cool garden breeze with a tranquilizer-free Cuban pulse.",
    },
    negroni: {
        name: "Negroni",
        colour: "#C94735",
        description:
            "Equal parts gin, bitter Campari, and sweet vermouth stirred into a burnished red aperitif with a hypnotizing bitter-sweet finish.",
    },
    martini: {
        name: "Dry Martini",
        colour: "#D9E5C3",
        description:
            "Gin and dry vermouth, chilled until silver-bright and crowned with an olive: elegant, bracing, and quietly hypnotizing.",
    },
    manhattan: {
        name: "Manhattan",
        colour: "#A64C3C",
        description:
            "Rye whiskey, sweet vermouth, and bitters stirred smooth, carrying a cherry-red warmth from the first sip to the last.",
    },
    daiquiri: {
        name: "Classic Daiquiri",
        colour: "#F4D7A1",
        description:
            "White rum, fresh lime, and sugar shaken into a clean, frosty coupe: simple, sharp, and beautifully balanced with a horny summer spark.",
    },
    tomCollins: {
        name: "Tom Collins",
        colour: "#E8F2D0",
        description:
            "Gin, lemon, sugar, and sparkling soda served tall over ice, bright enough to turn a quiet evening into a celebration.",
    },
    whiskeySour: {
        name: "Whiskey Sour",
        colour: "#F0C45B",
        description:
            "Bourbon, lemon, sugar, and a soft crown of foam, balancing golden sweetness against a vivid citrus bite.",
    },
    cosmopolitan: {
        name: "Cosmopolitan",
        colour: "#E97A9A",
        description:
            "Vodka, cranberry, orange liqueur, and lime in a luminous pink glass: polished, tart, and ready for the spotlight.",
    },
    paloma: {
        name: "Paloma",
        colour: "#F2A7A1",
        description:
            "Tequila, ruby grapefruit, lime, and soda with a pinch of salt: bittersweet, fizzy, and sunlit as a desert sunset.",
    },
    maiTai: {
        name: "Mai Tai",
        colour: "#D88343",
        description:
            "A layered Tiki classic of aged rum, orange curaçao, orgeat, and lime, fragrant with almond and tropical fruit.",
    },
    pinaColada: {
        name: "Piña Colada",
        colour: "#F5E2B8",
        description:
            "White rum, coconut cream, and pineapple blended into a velvet escape with a creamy island finish.",
    },
    southside: {
        name: "Southside",
        colour: "#B8D6D1",
        description:
            "Gin, mint, lime, and sugar shaken bright: a tranquilizer-themed name for a refreshing classic, with no medication added.",
    },
    tequilaSunrise: {
        name: "Tequila Sunrise",
        colour: "#F07A63",
        description:
            "Tequila, orange juice, and grenadine rising in layers; a playful, horny nickname for a classic sunset without added drugs.",
    },
    blueLagoon: {
        name: "Blue Lagoon",
        colour: "#6EA9E8",
        description:
            "Vodka, blue curaçao, and lemonade in a luminous cooler with a hypnotizing color and bright citrus snap.",
    },
    french75: {
        name: "French 75",
        colour: "#E8D9A8",
        description:
            "Gin, lemon, sugar, and champagne in a flute: sparkling, precise, and bright enough to make any toast feel ceremonial.",
    },
    singaporeSling: {
        name: "Singapore Sling",
        colour: "#E88968",
        description:
            "Gin, cherry liqueur, citrus, pineapple, and bitters layered into a ruby sunset with a lush tropical finish.",
    },
    aviation: {
        name: "Aviation",
        colour: "#A8B7E8",
        description:
            "Gin, maraschino, lemon, and violet liqueur poured in a pale sky-blue coupe: floral, crisp, and dreamlike.",
    },
    sidecar: {
        name: "Sidecar",
        colour: "#E0A15E",
        description:
            "Cognac, orange liqueur, and lemon shaken bright over a sugar rim: golden, citrusy, and elegantly bold.",
    },
    bloodyMary: {
        name: "Bloody Mary",
        colour: "#B83F32",
        description:
            "Vodka, tomato, lemon, celery, and savory spice with a garden-fresh garnish and a bracing morning kick.",
    },
    espressoMartini: {
        name: "Espresso Martini",
        colour: "#5B3528",
        description:
            "Vodka, coffee liqueur, and fresh espresso shaken into a dark, velvety coupe with a polished crema crown.",
    },
    lastWord: {
        name: "The Last Word",
        colour: "#A9D7B5",
        description:
            "Gin, green Chartreuse, maraschino, and lime in equal measure: herbal, electric, and beautifully balanced.",
    },
    cloverClub: {
        name: "Clover Club",
        colour: "#E99AAB",
        description:
            "Gin, raspberry, lemon, and a cloud of egg-white foam: a blushing classic with a silky, refined finish.",
    },
    corpseReviver: {
        name: "Corpse Reviver No. 2",
        colour: "#D6E3C8",
        description:
            "Gin, orange liqueur, Lillet, lemon, and absinthe rinsed into a pale, sharply refreshing morning reset.",
    },
    darkAndStormy: {
        name: "Dark 'n' Stormy",
        colour: "#9B5D46",
        description:
            "Dark rum and ginger beer over lime: storm-cloud spice, bright fizz, and a deep Caribbean finish.",
    },
    caipirinha: {
        name: "Caipirinha",
        colour: "#D9E77D",
        description:
            "Cachaça, muddled lime, and sugar over crushed ice: rustic, fragrant, and bursting with Brazilian brightness.",
    },
    boulevardier: {
        name: "Boulevardier",
        colour: "#9B493B",
        description:
            "Bourbon, Campari, and sweet vermouth stirred into a velvet-red Manhattan cousin with a warm bitter edge.",
    },
    penicillin: {
        name: "Penicillin",
        colour: "#D69B55",
        description:
            "Blended Scotch, lemon, honey, and ginger crowned with smoky Islay whisky: medicinal in name, vivid in flavor, and entirely free of sedatives.",
    },
    sazerac: {
        name: "Sazerac",
        colour: "#C8874B",
        description:
            "Rye whiskey, absinthe, sugar, and Peychaud's bitters stirred into a New Orleans classic with a fragrant anise edge.",
    },
};

export const COCKTAIL_COLLECTION = "casinoCocktails" as const;

function normalizeCocktailKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export class CocktailCatalogService {
    private readonly collection: Collection<CocktailDocument>;
    private initialized?: Promise<void>;

    public constructor(private readonly db: Db) {
        this.collection = db.collection<CocktailDocument>(COCKTAIL_COLLECTION);
    }

    public async init(): Promise<void> {
        if (!this.initialized) {
            this.initialized = this.initialize();
        }
        return this.initialized;
    }

    private async initialize(): Promise<void> {
        await this.collection.createIndex({ key: 1 }, { unique: true });
        await this.collection.createIndex({ enabled: 1 });
        const now = Date.now();
        for (const [key, cocktail] of Object.entries(DEFAULT_COCKTAILS)) {
            await this.collection.updateOne(
                { key },
                {
                    $setOnInsert: {
                        _id: key,
                        key,
                        ...cocktail,
                        enabled: true,
                        createdAt: now,
                        updatedAt: now,
                    },
                },
                { upsert: true },
            );
        }
    }

    public async list(): Promise<CocktailDocument[]> {
        await this.init();
        return this.collection
            .find({ enabled: true })
            .sort({ name: 1 })
            .toArray();
    }

    public async get(value: string): Promise<CocktailDocument | null> {
        await this.init();
        const normalized = normalizeCocktailKey(value);
        const cocktails = await this.list();
        return (
            cocktails.find(
                (cocktail) =>
                    normalizeCocktailKey(cocktail.key) === normalized ||
                    normalizeCocktailKey(cocktail.name) === normalized,
            ) ?? null
        );
    }

    public async random(): Promise<CocktailDocument | null> {
        const cocktails = await this.list();
        return cocktails.length > 0
            ? cocktails[Math.floor(Math.random() * cocktails.length)]
            : null;
    }
}
