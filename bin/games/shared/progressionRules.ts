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

import { GameEvent } from "./unifiedCharacterTypes";

/**
 * Phase 2A.7: Character Progression Rules
 *
 * This module is the single, authoritative source of progression metrics,
 * thresholds and reward values. It is intentionally free of any database or
 * side-effecting code so that the rules are pure, deterministic and easy to
 * unit test: the same `totalXp` always maps to the same `level`, and the
 * same reward `source` always grants the same amount of XP.
 *
 * Bumping `PROGRESSION_RULES_VERSION` documents that the reward table or
 * level curve changed, which downstream tooling (e.g. migrations/backfills)
 * can use to detect profiles computed under an older rule set.
 */
export const PROGRESSION_RULES_VERSION = 1;

/** XP required to go from level 0 to level 1. */
const BASE_XP_PER_LEVEL = 100;

/** Progression is capped; XP earned beyond this level is still recorded but stops raising the level. */
export const MAX_PROGRESSION_LEVEL = 100;

/**
 * Deterministic triangular XP curve: the total XP required to reach a given
 * level grows linearly with the level number, so each additional level
 * requires more XP than the last.
 */
export function xpRequiredForLevel(level: number): number {
    const clamped = Math.max(0, Math.min(level, MAX_PROGRESSION_LEVEL));
    return (clamped * (clamped + 1) * BASE_XP_PER_LEVEL) / 2;
}

/**
 * Computes the deterministic level for a given total XP value. Negative or
 * non-finite values are treated as zero XP.
 */
export function computeLevelForXp(totalXp: number): number {
    const xp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
    let level = 0;
    while (
        level < MAX_PROGRESSION_LEVEL &&
        xpRequiredForLevel(level + 1) <= xp
    ) {
        level++;
    }
    return level;
}

export interface ProgressionSummary {
    level: number;
    xpIntoLevel: number;
    xpForNextLevel: number;
}

/**
 * Computes level, progress into the current level, and the XP needed for the
 * next level for presentation (e.g. bio display, progress bars).
 */
export function computeProgressionSummary(totalXp: number): ProgressionSummary {
    const level = computeLevelForXp(totalXp);
    const xp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
    const xpAtLevel = xpRequiredForLevel(level);
    const xpAtNextLevel =
        level >= MAX_PROGRESSION_LEVEL
            ? xpAtLevel
            : xpRequiredForLevel(level + 1);
    return {
        level,
        xpIntoLevel: xp - xpAtLevel,
        xpForNextLevel: xpAtNextLevel - xpAtLevel,
    };
}

/**
 * Documented, deterministic XP rewards keyed by reward source. Casino,
 * Dare and Veratown systems all route through this shared table so reward
 * values stay consistent across games and cannot drift independently.
 */
export const PROGRESSION_XP_REWARDS: Readonly<Record<string, number>> = {
    casino_blackjack_win: 10,
    casino_roulette_win: 8,
    casino_daily_claim: 2,
    dare_completed: 15,
    veratown_location_event: 5,
};

/** Looks up the documented XP reward for a source, defaulting to 0 for unknown sources. */
export function getXpRewardForSource(source: string): number {
    return PROGRESSION_XP_REWARDS[source] ?? 0;
}

/**
 * Derives the cross-system event source ("casino" | "dare" | "veratown" |
 * "admin") from a reward source key so progression events are attributed to
 * the system that generated the underlying outcome.
 */
export function deriveEventSourceFromRewardSource(
    rewardSource: string,
): GameEvent["source"] {
    if (rewardSource.startsWith("casino")) return "casino";
    if (rewardSource.startsWith("dare")) return "dare";
    if (rewardSource.startsWith("veratown")) return "veratown";
    return "admin";
}
