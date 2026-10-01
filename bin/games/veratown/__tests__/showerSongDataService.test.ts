import assert from "node:assert/strict";
import { test } from "node:test";
import {
    DEFAULT_SHOWER_SONGS,
    ShowerSongDataService,
} from "../showerSongDataService";

class FakeSongCollection {
    public createIndexCalls = 0;
    public bulkWriteCalls = 0;
    public seedOperations: unknown[] = [];

    public async createIndex(): Promise<void> {
        this.createIndexCalls += 1;
    }

    public async bulkWrite(operations: unknown[]): Promise<void> {
        this.bulkWriteCalls += 1;
        this.seedOperations = operations;
    }

    public aggregate(): { toArray: () => Promise<unknown[]> } {
        return {
            toArray: async () => [
                {
                    _id: "shower-song-001",
                    text: DEFAULT_SHOWER_SONGS[0],
                    enabled: true,
                    createdAt: 1,
                    updatedAt: 1,
                },
            ],
        };
    }

    public find(): {
        sort: () => { toArray: () => Promise<never[]> };
    } {
        return {
            sort: () => ({ toArray: async () => [] }),
        };
    }
}

test("shower song service seeds the complete catalog once", async () => {
    const collection = new FakeSongCollection();
    const db = {
        collection: () => collection,
    } as any;
    const service = new ShowerSongDataService(db);

    await Promise.all([service.ensureSeeded(), service.ensureSeeded()]);

    assert.equal(DEFAULT_SHOWER_SONGS.length, 48);
    assert.equal(collection.createIndexCalls, 1);
    assert.equal(collection.bulkWriteCalls, 1);
    assert.equal(collection.seedOperations.length, 48);

    const ids = collection.seedOperations.map(
        (operation: any) => operation.updateOne.filter._id,
    );
    assert.equal(new Set(ids).size, 48);
    assert.equal(ids[0], "shower-song-001");
    assert.equal(ids[47], "shower-song-048");
});

test("shower song service draws active database content", async () => {
    const collection = new FakeSongCollection();
    const db = {
        collection: () => collection,
    } as any;
    const service = new ShowerSongDataService(db);

    assert.equal(await service.drawSong(), DEFAULT_SHOWER_SONGS[0]);
});
