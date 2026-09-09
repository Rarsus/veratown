import assert from "node:assert/strict";
import { test } from "node:test";
import { COCKTAIL_COLLECTION, CocktailCatalogService } from "../cocktails";

test("CocktailCatalogService seeds and reads the dedicated collection", async () => {
    const documents: any[] = [];
    let collectionName = "";
    const collection = {
        createIndex: async () => "index",
        updateOne: async (filter: { key: string }, update: any) => {
            if (!documents.some((document) => document.key === filter.key)) {
                documents.push({ ...update.$setOnInsert });
            }
            return { upsertedCount: 1 };
        },
        find: () => ({
            sort: () => ({
                toArray: async () =>
                    documents.filter((document) => document.enabled),
            }),
        }),
    };
    const db = {
        collection: (name: string) => {
            collectionName = name;
            return collection;
        },
    };

    const catalog = new CocktailCatalogService(db as any);
    await catalog.init();
    const cocktails = await catalog.list();

    assert.equal(collectionName, COCKTAIL_COLLECTION);
    assert.equal(cocktails.length, 30);
    assert.equal((await catalog.get("old-fashioned"))?.name, "Old Fashioned");
});
