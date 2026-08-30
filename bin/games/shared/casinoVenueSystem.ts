/**
 * Casino Venue System (EPIC 2 Phase 2.5)
 *
 * Implements location-based chip bonuses and venue multipliers
 * for the unified casino experience across different regions.
 *
 * Features:
 * - Regional chip multipliers (1.0x - 2.0x)
 * - Venue-specific bonuses
 * - Cross-region economy tracking
 * - Real-time multiplier application
 *
 * Integration:
 * - Used by CasinoEngine for bet calculations
 * - Updated by UnifiedCharacterStore for position changes
 * - Logged to gameEvents for audit trail
 */

import { MapRegion } from "bc-bot";

export interface VenueBonus {
    region: MapRegion;
    chipMultiplier: number;
    description: string;
    requiresAddonMissing?: boolean; // Some venues require specific addons
}

/**
 * CasinoVenueSystem manages regional chip economy multipliers
 */
export class CasinoVenueSystem {
    private venues: Map<MapRegion, VenueBonus> = new Map();

    /**
     * Initialize with default venues
     */
    public constructor() {
        this.initializeDefaultVenues();
    }

    /**
     * Initialize default venue multipliers
     */
    private initializeDefaultVenues(): void {
        // Main casino floor
        this.venues.set("MainHall", {
            region: "MainHall",
            chipMultiplier: 1.0,
            description: "Main Casino Floor (Standard Payout)",
        });

        // High roller area
        this.venues.set("MainHallThrone", {
            region: "MainHallThrone",
            chipMultiplier: 1.25,
            description: "Royal Suite (25% Bonus)",
        });

        // VIP area
        this.venues.set("MainHallPrivateRoom", {
            region: "MainHallPrivateRoom",
            chipMultiplier: 1.5,
            description: "Private Room (50% Bonus)",
        });

        // Lounge
        this.venues.set("MainHallLounge", {
            region: "MainHallLounge",
            chipMultiplier: 1.1,
            description: "Lounge Area (10% Bonus)",
        });

        // Restaurant
        this.venues.set("MainHallRestaurant", {
            region: "MainHallRestaurant",
            chipMultiplier: 0.9,
            description: "Restaurant (10% Penalty)",
        });

        // Security area (no gambling)
        this.venues.set("MainHallShop", {
            region: "MainHallShop",
            chipMultiplier: 0.0,
            description: "Shop (No Gambling)",
        });
    }

    /**
     * Register a new venue with custom multiplier
     */
    public registerVenue(venue: VenueBonus): void {
        this.venues.set(venue.region, venue);
        console.log(
            `[CasinoVenue] Registered venue: ${venue.region} (${venue.chipMultiplier}x)`,
        );
    }

    /**
     * Get venue multiplier for a region
     */
    public getVenueMultiplier(region?: MapRegion): number {
        if (!region) {
            return 1.0; // Default multiplier if no region
        }

        const venue = this.venues.get(region);
        if (!venue) {
            console.warn(
                `[CasinoVenue] Unknown region ${region}, using default multiplier`,
            );
            return 1.0;
        }

        return venue.chipMultiplier;
    }

    /**
     * Get venue description
     */
    public getVenueDescription(region?: MapRegion): string {
        if (!region) {
            return "Unknown Location";
        }

        const venue = this.venues.get(region);
        return venue?.description || "Unknown Location";
    }

    /**
     * Check if gambling is allowed in region (multiplier > 0)
     */
    public isGamblingAllowed(region?: MapRegion): boolean {
        const multiplier = this.getVenueMultiplier(region);
        return multiplier > 0;
    }

    /**
     * Apply venue bonus to chips (used during bet calculation)
     */
    public applyVenueBonus(chips: number, region?: MapRegion): number {
        const multiplier = this.getVenueMultiplier(region);
        if (multiplier === 0) {
            return 0; // No gambling allowed here
        }

        return Math.floor(chips * multiplier);
    }

    /**
     * Get bonus amount (what was added)
     */
    public getBonusAmount(chips: number, region?: MapRegion): number {
        const withBonus = this.applyVenueBonus(chips, region);
        return withBonus - chips;
    }

    /**
     * Get all registered venues
     */
    public getAllVenues(): VenueBonus[] {
        return Array.from(this.venues.values());
    }

    /**
     * Get venues sorted by multiplier (descending)
     */
    public getVenuesByMultiplier(): VenueBonus[] {
        return this.getAllVenues().sort(
            (a, b) => b.chipMultiplier - a.chipMultiplier,
        );
    }

    /**
     * Get high roller venues (multiplier >= 1.5)
     */
    public getHighRollerVenues(): VenueBonus[] {
        return this.getAllVenues().filter((v) => v.chipMultiplier >= 1.5);
    }

    /**
     * Calculate effective buy-in with venue bonus
     */
    public calculateEffectiveBuyIn(
        baseBuyIn: number,
        region?: MapRegion,
    ): number {
        return this.applyVenueBonus(baseBuyIn, region);
    }

    /**
     * Calculate effective payout with venue bonus
     */
    public calculateEffectivePayout(
        basePayout: number,
        region?: MapRegion,
    ): number {
        return this.applyVenueBonus(basePayout, region);
    }

    /**
     * Log all venue multipliers (for debugging)
     */
    public logVenues(): void {
        console.log("\n=== CASINO VENUES (EPIC 2) ===");
        const venues = this.getVenuesByMultiplier();
        for (const venue of venues) {
            const status =
                venue.chipMultiplier === 0
                    ? "❌ No Gambling"
                    : venue.chipMultiplier > 1
                      ? "⬆️  Bonus"
                      : venue.chipMultiplier < 1
                        ? "⬇️  Penalty"
                        : "➡️  Standard";
            console.log(
                `${status} ${venue.region}: ${venue.chipMultiplier}x - ${venue.description}`,
            );
        }
    }
}
