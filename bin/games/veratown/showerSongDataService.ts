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
import { createLogger } from "../../logging";
import { executeDbMutation } from "./shared/executeWithRetry";

export interface ShowerSongDoc {
    _id: string;
    text: string;
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
}

/**
 * Shared reference data for shower narration. This is deliberately independent
 * of character state and action-layer adapters: selecting a song is data
 * access, while NarratorBot and CommunicationActionService own side effects.
 */
export const DEFAULT_SHOWER_SONGS: readonly string[] = [
    '"Row, row, row your boat, gently down the stream, merrily, merrily, merrily, merrily, life is but a dream!"',
    '"Rubber ducky, you\'re the one, you make bathtime lots of fun!"',
    '"Twinkle, twinkle, little star, how I wonder what you are!"',
    "\"I'm singing in the shower, just singing in the shower, what a glorious feeling, I'm happy again!\"",
    '"Splish splash, I was taking a bath, long about a Saturday night!"',
    '"Head, shoulders, knees and toes, knees and toes, head, shoulders, knees and toes, knees and toes!"',
    '"Oh Susanna, oh don\'t you cry for me, for I come from Alabama with a banjo on my knee!"',
    '"La la la, la-la la la, washing all my cares away, la la la, la-la la la!"',
    '"You are my sunshine, my only sunshine, you make me happy when skies are grey!"',
    '"Bibbidi-bobbidi-boo, it\'ll do magic believe it or not, bibbidi-bobbidi-boo!"',
    '"Yo ho, yo ho, a shower life for me, scrubbing away all the grime of the day!"',
    '"Happy birthday to me, happy birthday to me, happy shower time to me!"',
    '"Doe, a deer, a female deer, ray, a drop of golden sun!"',
    '"Warm water falling, bright tiles gleaming, clean little clouds of steam!"',
    '"Bubble by bubble, trouble by trouble, down the drain they go!"',
    '"Sock song, soap song, sing along, the shower keeps the rhythm strong!"',
    '"Rain on the ceiling, sparkle on the floor, I leave my worries by the door!"',
    '"Scrub-a-dub, turn the knob, let the happy water flow!"',
    '"A little rinse, a little shine, this steamy moment feels divine!"',
    '"The towel is waiting, the mirror is bright, everything is going right!"',
    '"Waterfall music, porcelain drums, every drop says here it comes!"',
    '"Clean as a whistle, fresh as the breeze, singing with the soap bubbles up to my knees!"',
    '"Steam in the air and shampoo in my hair, I am the monarch of the bathroom chair!"',
    '"Drip drop dancing, tap tap prancing, welcome to my sparkling show!"',
    '"Wash away the weekday, rinse away the rain, send the sleepy blues right down the drain!"',
    '"Shampoo crown, water gown, I am ready for a royal rinse!"',
    '"Every little droplet has a silver song, and the shower hums along!"',
    '"Turn the water higher, lift the morning higher, let the bathroom choir begin!"',
    '"Soap suds shining, good thoughts finding, a fresh start is on its way!"',
    '"The pipes are humming, the good mood is coming, nothing can spoil today!"',
    '"Rinse and repeat, tap out the beat, clean feet and a happy heart!"',
    '"From the first warm splash to the final towel, I am feeling like a superstar!"',
    '"Little silver rivers run from head to toe, carrying every yesterday below!"',
    '"Foam on my fingers, steam on the glass, let every gloomy minute pass!"',
    '"Shower shoes may wait outside, but my singing has no place to hide!"',
    '"A bright new day is in the spray, and I am dancing in its light!"',
    '"The faucet keeps time, the bubbles keep rhyme, and the bathroom becomes a stage!"',
    '"Towel at the ready, spirits are steady, this is my clean routine!"',
    '"Water and wonder, no need to ponder, I am refreshed and feeling keen!"',
    '"Steam curls upward, worries drift downward, peace is the chorus I know!"',
    '"A splash for the moon, a rinse for the sun, the shower says the day has begun!"',
    '"Soap on the shoulder, the world feels bolder, every little sparkle is mine!"',
    '"The drain sings low while the warm rivers flow, and my happy refrain takes flight!"',
    '"Clean hands, clear head, no more sleepy dread, I am ready to go!"',
    '"Bubbles rise, the bathroom skies, and the mirror applauds my song!"',
    '"A gentle spray, a brighter day, a tune that carries me along!"',
    '"Scrub the doubt, rinse it out, let the good feeling stay!"',
    '"Fresh from the foam, I am heading home, with a song for the rest of the day!"',
];

export class ShowerSongDataService {
    private readonly songs: Collection<ShowerSongDoc>;
    private readonly logger = createLogger("ShowerSongDataService");
    private initialization?: Promise<void>;

    public constructor(private readonly db: Db) {
        this.songs = db.collection<ShowerSongDoc>("showerSongs");
    }

    private initialize(): Promise<void> {
        if (!this.initialization) {
            this.initialization = this.initializeCollection().catch((error) => {
                this.initialization = undefined;
                throw error;
            });
        }
        return this.initialization;
    }

    private async initializeCollection(): Promise<void> {
        await this.songs.createIndex({ enabled: 1 });
        const now = Date.now();
        await executeDbMutation(
            () =>
                this.songs.bulkWrite(
                    DEFAULT_SHOWER_SONGS.map((text, index) => ({
                        updateOne: {
                            filter: {
                                _id: `shower-song-${String(index + 1).padStart(3, "0")}`,
                            },
                            update: {
                                $setOnInsert: {
                                    _id: `shower-song-${String(index + 1).padStart(3, "0")}`,
                                    text,
                                    enabled: true,
                                    createdAt: now,
                                    updatedAt: now,
                                },
                            },
                            upsert: true,
                        },
                    })),
                ),
            "seed_shower_songs",
        );
        this.logger.info("Shower song reference data initialized", {
            seedCount: DEFAULT_SHOWER_SONGS.length,
        });
    }

    public async ensureSeeded(): Promise<void> {
        await this.initialize();
    }

    public async drawSong(): Promise<string | null> {
        try {
            await this.initialize();
            const result = await this.songs
                .aggregate<ShowerSongDoc>([
                    { $match: { enabled: true } },
                    { $sample: { size: 1 } },
                ])
                .toArray();
            return result[0]?.text ?? null;
        } catch (error) {
            this.logger.warn("Unable to draw shower song from database", {
                error,
            });
            return null;
        }
    }

    public async listSongs(includeDisabled = false): Promise<ShowerSongDoc[]> {
        await this.initialize();
        return this.songs
            .find(includeDisabled ? {} : { enabled: true })
            .sort({ _id: 1 })
            .toArray();
    }
}
