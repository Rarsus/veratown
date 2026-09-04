import assert from "node:assert/strict";

export function expect(actual: any) {
    return {
        toBe(expected: any): void {
            assert.strictEqual(actual, expected);
        },
        toBeDefined(): void {
            assert.notStrictEqual(actual, undefined);
        },
        toBeGreaterThan(expected: number): void {
            assert.ok(actual > expected);
        },
        toContain(expected: any): void {
            assert.ok(actual.includes(expected));
        },
        toEqual(expected: any): void {
            assert.deepStrictEqual(actual, expected);
        },
        toMatchObject(expected: Record<string, unknown>): void {
            for (const [key, value] of Object.entries(expected)) {
                assert.deepStrictEqual(actual[key], value);
            }
        },
        toBeNull(): void {
            assert.strictEqual(actual, null);
        },
    };
}
