import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_COCKTAILS } from "../cocktails";

describe("Casino cocktail catalog", () => {
    test("contains 30 seeded cocktails", () => {
        assert.equal(Object.keys(DEFAULT_COCKTAILS).length, 30);
        for (const [key, cocktail] of Object.entries(DEFAULT_COCKTAILS)) {
            assert.ok(key.length > 0);
            assert.ok(cocktail.name.length > 0);
            assert.ok(cocktail.description.length > 40);
            assert.match(cocktail.colour, /^#[0-9A-F]{6}$/i);
        }
    });

    test("uses the requested keyword vocabulary in roughly one third of entries", () => {
        const keywords = [
            "horny",
            "sedative",
            "tranquilizer",
            "hypnotizing",
            "aphrodisiac",
        ];
        const keywordEntries = Object.values(DEFAULT_COCKTAILS).filter(
            (cocktail) =>
                keywords.some((keyword) =>
                    cocktail.description.toLowerCase().includes(keyword),
                ),
        );
        assert.equal(keywordEntries.length, 10);
    });
});
