import type {
    KidnappersPlayerRole,
    KidnappersPlayerState,
} from "./kidnappersGameTypes";

export interface KidnappersRoleCounts {
    readonly kidnapper: 1 | 2;
    readonly maid: 0 | 1;
    readonly switch: 0 | 1;
    readonly stalker: 0 | 1;
    readonly fan: 0 | 1;
    readonly masochist: 0 | 1;
    readonly mistress: 0 | 1;
}

export interface KidnappersGameConfiguration extends KidnappersRoleCounts {
    readonly name:
        "fiveOrSixPlayers" | "sevenPlayers" | "eightPlayers" | "ninePlayers";
    readonly firstDayDurationMs: number;
    readonly firstNightDurationMs: number;
    readonly dayDurationMs: number;
    readonly nightDurationMs: number;
    readonly defenseDurationMs: number;
    readonly votingDurationMs: number;
    readonly victoryDurationMs: number;
    readonly openSuspicions: boolean;
    readonly firstNightKidnapping: boolean;
    readonly discloseRolesAtStart: boolean;
    readonly mistressCanProtectHerself: boolean;
    readonly mistressCanPickSameTargetTwice: boolean;
}

export const KIDNAPPERS_CONFIGURATIONS: readonly KidnappersGameConfiguration[] =
    [
        {
            name: "fiveOrSixPlayers",
            kidnapper: 1,
            maid: 1,
            switch: 1,
            stalker: 1,
            fan: 0,
            masochist: 0,
            mistress: 0,
            mistressCanProtectHerself: true,
            mistressCanPickSameTargetTwice: true,
            firstDayDurationMs: 120_000,
            firstNightDurationMs: 70_000,
            dayDurationMs: 1_200_000,
            nightDurationMs: 70_000,
            defenseDurationMs: 50_000,
            votingDurationMs: 100_000,
            victoryDurationMs: 60_000,
            openSuspicions: true,
            firstNightKidnapping: false,
            discloseRolesAtStart: true,
        },
        {
            name: "sevenPlayers",
            kidnapper: 1,
            maid: 1,
            switch: 1,
            stalker: 1,
            fan: 1,
            masochist: 0,
            mistress: 0,
            mistressCanProtectHerself: true,
            mistressCanPickSameTargetTwice: true,
            firstDayDurationMs: 120_000,
            firstNightDurationMs: 70_000,
            dayDurationMs: 1_100_000,
            nightDurationMs: 70_000,
            defenseDurationMs: 50_000,
            votingDurationMs: 100_000,
            victoryDurationMs: 60_000,
            openSuspicions: true,
            firstNightKidnapping: false,
            discloseRolesAtStart: true,
        },
        {
            name: "eightPlayers",
            kidnapper: 2,
            maid: 1,
            switch: 0,
            stalker: 0,
            fan: 0,
            masochist: 1,
            mistress: 1,
            mistressCanProtectHerself: true,
            mistressCanPickSameTargetTwice: true,
            firstDayDurationMs: 180_000,
            firstNightDurationMs: 90_000,
            dayDurationMs: 1_000_000,
            nightDurationMs: 90_000,
            defenseDurationMs: 40_000,
            votingDurationMs: 120_000,
            victoryDurationMs: 60_000,
            openSuspicions: true,
            firstNightKidnapping: true,
            discloseRolesAtStart: true,
        },
        {
            name: "ninePlayers",
            kidnapper: 2,
            maid: 1,
            switch: 0,
            stalker: 0,
            fan: 1,
            masochist: 0,
            mistress: 1,
            mistressCanProtectHerself: false,
            mistressCanPickSameTargetTwice: true,
            firstDayDurationMs: 120_000,
            firstNightDurationMs: 70_000,
            dayDurationMs: 1_000_000,
            nightDurationMs: 90_000,
            defenseDurationMs: 40_000,
            votingDurationMs: 120_000,
            victoryDurationMs: 60_000,
            openSuspicions: true,
            firstNightKidnapping: false,
            discloseRolesAtStart: true,
        },
    ];

export function getKidnappersConfiguration(
    playerCount: number,
): KidnappersGameConfiguration {
    if (playerCount < 5 || playerCount > 9) {
        throw new RangeError(
            `Kidnappers configurations support 5 through 9 players, received ${playerCount}`,
        );
    }
    const name =
        playerCount <= 6
            ? "fiveOrSixPlayers"
            : playerCount === 7
              ? "sevenPlayers"
              : playerCount === 8
                ? "eightPlayers"
                : "ninePlayers";
    return KIDNAPPERS_CONFIGURATIONS.find(
        (configuration) => configuration.name === name,
    )!;
}

const ROLE_ORDER: readonly (keyof KidnappersRoleCounts)[] = [
    "maid",
    "mistress",
    "switch",
    "stalker",
    "fan",
    "masochist",
    "kidnapper",
];

export function assignConfiguredRoles(
    players: readonly KidnappersPlayerState[],
    configuration: KidnappersGameConfiguration,
    random: () => number = Math.random,
): Map<number, KidnappersPlayerRole> {
    const available = [...players].sort(
        (left, right) => left.memberNumber - right.memberNumber,
    );
    const assigned = new Map<number, KidnappersPlayerRole>();

    for (const role of ROLE_ORDER) {
        for (let count = 0; count < configuration[role]; count += 1) {
            if (available.length === 0) {
                throw new RangeError(
                    `Configuration '${configuration.name}' has more roles than players`,
                );
            }
            const index = Math.min(
                available.length - 1,
                Math.max(0, Math.floor(random() * available.length)),
            );
            const [player] = available.splice(index, 1);
            assigned.set(player.memberNumber, role);
        }
    }

    for (const player of available) {
        assigned.set(player.memberNumber, "bystander");
    }
    return assigned;
}

export const KIDNAPPERS_ROLE_DESCRIPTIONS: Readonly<
    Record<KidnappersPlayerRole, string>
> = {
    kidnapper:
        "Work with the kidnapper team to capture the club members without being identified.",
    maid: "Investigate one participant during the night to learn whether they are a kidnapper.",
    switch: "Support the club members and win the special endgame confrontation against a remaining kidnapper.",
    stalker: "Find the maid during the night and win with the kidnapper team.",
    fan: "Secretly support the kidnappers and win with them without knowing their identities.",
    masochist:
        "Pursue the independent objective of ending the game restrained.",
    mistress:
        "Protect yourself or another club member during the night from a kidnapping.",
    bystander:
        "Observe the other participants and help identify kidnappers during the day.",
};
