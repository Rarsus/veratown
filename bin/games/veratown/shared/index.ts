/**
 * Veratown Shared Helpers - Central Export
 *
 * Provides commonly-used patterns and utilities across all feature systems
 * Implements Golden Rules from .instructions.md
 *
 * Import examples:
 *   import { createIdempotentMonitor } from "./shared";
 *   import { syncAppearanceMutation, getAppearanceItem } from "./shared";
 *   import { executeDbMutation } from "./shared";
 *   import { createLogger } from "../../logging";
 */

// Idempotency guards
export {
    IdempotentMonitor,
    createIdempotentMonitor,
} from "./idempotentMonitor";

// Appearance synchronization
export {
    syncAppearanceMutation,
    removeItems,
    addItems,
    refreshAppearance,
    hasAppearanceSlot,
    getAppearanceItem,
    getAppearanceBundle,
    isWearing,
    isOwnerLocked,
    filterUnlocked,
    filterOwnerLocked,
} from "./appearanceSync";

// Database retry patterns
export {
    executeWithRetry,
    executeDbMutation,
    executeApiCall,
    withRetry,
} from "./executeWithRetry";

// Timer management
export { TimerManager, createTimerManager } from "./timerManager";

// Feature utilities
export {
    createFeatureGuard,
    waitWithLog,
    isCosplay,
    isClothing,
    getAssetSafely,
    assetExists,
    waitFor,
    formatMemberNumber,
    isAtLocation,
    isInRoom,
    getCharacterName,
    truncate,
} from "./featureHelpers";

// Posture preservation (prevents pose reset during appearance mutations)
export { PosturePreserver } from "./postureHelper";
