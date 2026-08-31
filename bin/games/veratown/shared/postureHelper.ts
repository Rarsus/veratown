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

import { API_Character } from "bc-bot";

/**
 * Preserves character's current posture during appearance mutations
 * that might reset the pose (e.g., stripBulk, RemoveItem).
 *
 * Usage:
 * ```ts
 * const savedPose = new PosturePreserver(character);
 * character.Appearance.stripBulk(...);
 * await savedPose.restore(character);
 * ```
 *
 * Golden Rules Applied:
 * - #12: Appearance mutations wrapped with post-mutation sync
 * - Ensures character's physical state (pose) persists through appearance changes
 */
export class PosturePreserver {
    private readonly savedPose: readonly string[];

    /**
     * Captures character's current posture for later restoration
     * @param character - The character whose posture to preserve
     */
    public constructor(character: API_Character) {
        // Access ActivePose through the character's internal data
        // ActivePose is a readonly array of pose names like "Kneel", "BaseLower", etc.
        const pose = (character as any).data?.ActivePose ?? [];
        this.savedPose = [...pose];
    }

    /**
     * Restores the previously saved posture to the character
     * Called after appearance mutations that might have reset the pose
     *
     * @param character - The character to restore posture for
     * @example
     * ```ts
     * const preserver = new PosturePreserver(character);
     * character.Appearance.stripBulk({ clothing: true });
     * preserver.restore(character);
     * ```
     */
    public restore(character: API_Character): void {
        if (this.savedPose.length > 0) {
            character.SetActivePose([...this.savedPose] as any);
        }
    }

    /**
     * Get the saved posture without restoring it
     * Useful for inspection or conditional logic
     *
     * @returns The saved pose array
     */
    public getSavedPose(): readonly string[] {
        return this.savedPose;
    }

    /**
     * Check if posture was saved (i.e., character was in a pose)
     * @returns True if character had any active poses when created
     */
    public hasSavedPose(): boolean {
        return this.savedPose.length > 0;
    }
}
