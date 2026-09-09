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

import type {
    KidnappersGameEndReason,
    KidnappersGameEvent,
    KidnappersGameOutcome,
    KidnappersPlayerRole,
    KidnappersSessionSnapshot,
    KidnappersWinner,
} from "./kidnappersGameTypes";

const CAPTOR_ROLES: ReadonlySet<KidnappersPlayerRole> = new Set([
    "kidnapper",
    "stalker",
    "fan",
]);

export function determineKidnappersWinner(
    snapshot: KidnappersSessionSnapshot,
): KidnappersWinner | null {
    const active = snapshot.players.filter(
        (player) => player.status === "active",
    );
    const kidnappers = active.filter((player) => player.role === "kidnapper");
    const clubMembers = active.filter((player) => player.role !== "kidnapper");
    if (kidnappers.length === 0) return "victims";
    if (active.length <= 2 || clubMembers.length < 3) {
        return active.some((player) => player.role === "switch")
            ? "victims"
            : "captors";
    }
    return null;
}

function sideForRole(role: KidnappersPlayerRole | null): "captors" | "victims" {
    return role && CAPTOR_ROLES.has(role) ? "captors" : "victims";
}

/**
 * Calculates an outcome using only immutable session data and the audit
 * events that led to it. All inputs are sorted before aggregation.
 */
export function calculateKidnappersGameOutcome(
    snapshot: KidnappersSessionSnapshot,
    reason: KidnappersGameEndReason,
    completedAt: number,
    winner: KidnappersWinner | null = snapshot.winner,
    events: readonly KidnappersGameEvent[] = [],
): KidnappersGameOutcome {
    const eventList = [...events].sort(
        (left, right) => left.emittedAt - right.emittedAt,
    );
    const scores = snapshot.players
        .map((player) => {
            const side = sideForRole(player.role);
            let score = 10;
            if (player.status === "captured") score -= 20;
            if (player.status === "disconnected") score -= 10;

            for (const event of eventList) {
                if (
                    event.type === "CAPTURE_RESOLVED" &&
                    event.outcome === "captured"
                ) {
                    if (event.attackerMemberNumber === player.memberNumber)
                        score += 20;
                    if (event.targetMemberNumber === player.memberNumber)
                        score -= 20;
                } else if (
                    event.type === "PLAYER_RELEASED" &&
                    event.memberNumber === player.memberNumber &&
                    event.reason === "escape"
                ) {
                    score += 30;
                } else if (
                    event.type === "ESCAPE_FAILED" &&
                    event.memberNumber === player.memberNumber
                ) {
                    score -= 5;
                }
            }

            if (reason === "normal" && winner && winner !== "tie") {
                if (side === winner) score += 100;
            } else if (reason !== "normal") {
                score -= 5;
            }

            return {
                memberNumber: player.memberNumber,
                side,
                score,
                reward: Math.max(0, score),
                penalty: Math.max(0, -score),
            };
        })
        .sort((left, right) => left.memberNumber - right.memberNumber);

    const captorScore = scores
        .filter((score) => score.side === "captors")
        .reduce((total, score) => total + score.score, 0);
    const victimScore = scores
        .filter((score) => score.side === "victims")
        .reduce((total, score) => total + score.score, 0);
    const result: KidnappersGameOutcome["result"] =
        reason === "normal"
            ? (winner ??
              (captorScore === victimScore
                  ? "tie"
                  : captorScore > victimScore
                    ? "captors"
                    : "victims"))
            : "partial";
    const resolvedWinner =
        result === "captors" || result === "victims" || result === "tie"
            ? result
            : null;
    const specialWinners = snapshot.players
        .filter(
            (player) =>
                player.role === "masochist" &&
                (player.status === "captured" ||
                    player.status === "eliminated"),
        )
        .map((player) => player.memberNumber);
    const durationMs =
        snapshot.startedAt === null
            ? 0
            : Math.max(0, completedAt - snapshot.startedAt);
    const summary =
        `Kidnappers session ${snapshot.sessionId} ended (${reason}); ` +
        `result=${result}; captors=${captorScore}; victims=${victimScore}; ` +
        `round=${snapshot.round}; durationMs=${durationMs}.` +
        (specialWinners.length > 0
            ? ` specialWinners=${specialWinners.join(",")}.`
            : "");

    return {
        reason,
        result,
        winner: resolvedWinner,
        completedAt,
        durationMs,
        round: snapshot.round,
        captorScore,
        victimScore,
        scores,
        specialWinners,
        summary,
    };
}

export function formatKidnappersGameOutcome(
    outcome: KidnappersGameOutcome,
): string {
    return outcome.summary;
}
