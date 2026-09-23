import { createLogger, type LogContext, type Logger } from "./logging";

export interface StartupPhaseOptions {
    warnAfterMs?: number;
    context?: LogContext;
}

/** Emits consistent timing records for phases that can delay bot readiness. */
export class StartupProgress {
    private readonly startedAt = Date.now();
    private readonly logger: Logger;

    public constructor(systemName = "Startup") {
        this.logger = createLogger(systemName);
    }

    public async phase<T>(
        name: string,
        operation: () => Promise<T>,
        options: StartupPhaseOptions = {},
    ): Promise<T> {
        const phaseStartedAt = Date.now();
        const context = {
            phase: name,
            elapsedSinceStartupMs: phaseStartedAt - this.startedAt,
            ...options.context,
        };
        let warningTimer: ReturnType<typeof setTimeout> | undefined;

        this.logger.info("Startup phase started", context);
        if (options.warnAfterMs !== undefined) {
            warningTimer = setTimeout(() => {
                this.logger.warn(
                    "Startup phase is taking longer than expected",
                    {
                        ...context,
                        warnAfterMs: options.warnAfterMs,
                        durationMs: Date.now() - phaseStartedAt,
                    },
                );
            }, options.warnAfterMs);
            warningTimer.unref?.();
        }

        try {
            const result = await operation();
            this.logger.info("Startup phase completed", {
                ...context,
                durationMs: Date.now() - phaseStartedAt,
                elapsedSinceStartupMs: Date.now() - this.startedAt,
            });
            return result;
        } catch (error) {
            this.logger.error("Startup phase failed", error, {
                ...context,
                durationMs: Date.now() - phaseStartedAt,
                elapsedSinceStartupMs: Date.now() - this.startedAt,
            });
            throw error;
        } finally {
            if (warningTimer) clearTimeout(warningTimer);
        }
    }
}
