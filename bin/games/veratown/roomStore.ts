import { Collection, Db } from "mongodb";
import { RoomDefinition } from "bc-bot";

export interface VeratownRoomDoc {
    _id: string;
    room: RoomDefinition;
    mapData?: ServerChatRoomMapData;
    updatedAt: number;
    updatedBy?: number;
}

export class VeratownRoomStore {
    private readonly rooms: Collection<VeratownRoomDoc>;

    public constructor(private readonly db: Db) {
        this.rooms = db.collection<VeratownRoomDoc>("veratownRooms");
    }

    public async init(): Promise<void> {
        await this.rooms.createIndex({ updatedAt: -1 });
    }

    public async load(
        roomKey: string,
        fallbackRoom?: RoomDefinition,
    ): Promise<VeratownRoomDoc | undefined> {
        await this.init();
        const stored = await this.rooms.findOne({ _id: roomKey });
        if (stored) return stored;
        if (!fallbackRoom) return undefined;

        const now = Date.now();
        const seeded: VeratownRoomDoc = {
            _id: roomKey,
            room: fallbackRoom,
            updatedAt: now,
        };
        await this.rooms.insertOne(seeded);
        return seeded;
    }

    public async save(
        roomKey: string,
        room: RoomDefinition,
        mapData?: ServerChatRoomMapData,
        updatedBy?: number,
    ): Promise<void> {
        await this.init();
        await this.rooms.updateOne(
            { _id: roomKey },
            {
                $set: {
                    room,
                    ...(mapData ? { mapData } : {}),
                    updatedAt: Date.now(),
                    updatedBy,
                },
            },
            { upsert: true },
        );
    }

    public async saveMap(
        roomKey: string,
        mapData: ServerChatRoomMapData,
        updatedBy?: number,
    ): Promise<void> {
        await this.init();
        await this.rooms.updateOne(
            { _id: roomKey },
            { $set: { mapData, updatedAt: Date.now(), updatedBy } },
            { upsert: true },
        );
    }

    public async list(): Promise<VeratownRoomDoc[]> {
        await this.init();
        return this.rooms.find({}).sort({ _id: 1 }).toArray();
    }
}
