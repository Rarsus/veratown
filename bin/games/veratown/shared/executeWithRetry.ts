/**
 * Database Retry Helper
 * Executes operations with exponential backoff retry logic
 *
 * Golden Rule: #4 (Database Mutations via executeWithRetry)
 *
 * Usage:
 *   await executeWithRetry(
 *       () => this.store.updateState(id, data),
 *       "update_state"
 *   );
 */

import { wait } from "../../../utils"; // Adjust path as needed

/**
 * Configuration for retry behavior
 */
export interface RetryOptions {
    maxRetries?: number;
    initialDelayMs?: number;
    backoffMultiplier?: number;
    onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Defaults: 2 retries, 100ms initial delay, 2x backoff = max 400ms total
 */
const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxRetries: 2,
    initialDelayMs: 100,
    backoffMultiplier: 2,
    onRetry: () => {}, // No-op by default
};

/**
 * Execute an async operation with exponential backoff retry
 *
 * @param operation - Async function to execute
 * @param operationName - Name for logging (e.g., "update_dare_state")
 * @param options - Retry configuration
 * @returns Result from successful operation
 * @throws Error if all attempts fail
 */
export async function executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: RetryOptions = {},
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;

            if (attempt < opts.maxRetries + 1) {
                // Not the last attempt, so retry
                const backoffMs =
                    opts.initialDelayMs *
                    Math.pow(opts.backoffMultiplier, attempt - 1);

                console.warn(
                    `[RetryExecutor] ${operationName} failed (attempt ${attempt}/${opts.maxRetries + 1}), retrying in ${backoffMs}ms:`,
                    lastError.message,
                );

                opts.onRetry(attempt, lastError);
                await wait(backoffMs);
            }
        }
    }

    // All attempts exhausted
    console.error(
        `[RetryExecutor] ${operationName} failed after ${opts.maxRetries + 1} attempts:`,
        lastError?.message,
    );

    throw lastError;
}

/**
 * Specialized retry for database mutations
 * Defaults: 3 retries, 150ms initial delay (DB operations are slower)
 */
export async function executeDbMutation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3,
): Promise<T> {
    return executeWithRetry(operation, `DB:${operationName}`, {
        maxRetries,
        initialDelayMs: 150,
        backoffMultiplier: 2,
    });
}

/**
 * Specialized retry for API calls (less aggressive than DB)
 * Defaults: 2 retries, 100ms initial delay
 */
export async function executeApiCall<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 2,
): Promise<T> {
    return executeWithRetry(operation, `API:${operationName}`, {
        maxRetries,
        initialDelayMs: 100,
        backoffMultiplier: 2,
    });
}

/**
 * Create a retry-aware wrapper for a function
 * Useful for wrapping store methods
 */
export function withRetry<TArgs extends any[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
    operationName: string,
    options?: RetryOptions,
): (...args: TArgs) => Promise<TReturn> {
    return async (...args: TArgs): Promise<TReturn> => {
        return executeWithRetry(() => fn(...args), operationName, options);
    };
}
