import { registerAppearanceConfirmationService } from "../shared/appearanceSync";

export function registerTestAppearanceConfirmation(): void {
    registerAppearanceConfirmationService({
        confirmAppearance: async (
            character: any,
            context: any,
            _timeoutMs: number,
            predicate: (appearance: readonly unknown[]) => boolean,
        ) => {
            const appearance = character.Appearance.MakeAppearanceBundle();
            const matches = predicate(appearance);
            const observedAt = Date.now();
            return {
                status: matches ? "completed" : "unconfirmed",
                metadata: {
                    operationId: context.operationId,
                    actionId: "appearance.confirm",
                    memberNumber: context.memberNumber,
                    attempt: 1,
                    startedAt: observedAt,
                    completedAt: observedAt,
                },
                reason: matches
                    ? undefined
                    : "Simulated peer snapshot mismatch",
                observed: appearance,
                value: {
                    items: appearance.map((item: any) => ({
                        group: item.Group,
                        asset: item.Name,
                    })),
                    hiddenLayers: [],
                    observedAt,
                },
            };
        },
    } as any);
}

export function clearTestAppearanceConfirmation(): void {
    registerAppearanceConfirmationService(undefined);
}
