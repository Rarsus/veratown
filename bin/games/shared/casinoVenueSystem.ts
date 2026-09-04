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
import { createLogger } from "../../logging";
import type { GameStateMutationService } from "./gameStateMutationService";

export interface VenueBonus {
    region: MapRegion | string;
    chipMultiplier: number;
    description: string;
    requiresAddonMissing?: boolean; // Some venues require specific addons
}

export interface CasinoVenueConfig {
    venues?: VenueBonus[];
    fallbackMultiplier?: number;
}

/**
 * CasinoVenueSystem manages regional chip economy multipliers
 */
export class CasinoVenueSystem {
    private readonly logger = createLogger("CasinoVenueSystem");
    private venues: Map<MapRegion | string, VenueBonus> = new Map();
    private readonly fallbackMultiplier: number;
    private readonly mutationService?: GameStateMutationService;

    /**
     * Initialize with default venues
     */
    public constructor(
        config: CasinoVenueConfig = {},
        mutationService?: GameStateMutationService,
    ) {
        this.fallbackMultiplier = Number.isFinite(config.fallbackMultiplier)
            ? config.fallbackMultiplier!
            : 1;
        this.mutationService = mutationService;
        this.initializeDefaultVenues();
        for (const venue of config.venues ?? []) {
            this.registerVenue(venue);
        }
    }

    /**
     * Initialize default venue multipliers
     */
    private initializeDefaultVenues(): void {
        // Main casino floor
        this.venues.set("MainHall" as any, {
            region: "MainHall" as any,
            chipMultiplier: 1.0,
            description: "Main Casino Floor (Standard Payout)",
        });

        // High roller area
        this.venues.set("MainHallThrone" as any, {
            region: "MainHallThrone" as any,
            chipMultiplier: 1.25,
            description: "Royal Suite (25% Bonus)",
        });

        // VIP area
        this.venues.set("MainHallPrivateRoom" as any, {
            region: "MainHallPrivateRoom" as any,
            chipMultiplier: 1.5,
            description: "Private Room (50% Bonus)",
        });

        // Lounge
        this.venues.set("MainHallLounge" as any, {
            region: "MainHallLounge" as any,
            chipMultiplier: 1.1,
            description: "Lounge Area (10% Bonus)",
        });

        // Restaurant
        this.venues.set("MainHallRestaurant" as any, {
            region: "MainHallRestaurant" as any,
            chipMultiplier: 0.9,
            description: "Restaurant (10% Penalty)",
        });

        // Security area (no gambling)
        this.venues.set("MainHallShop" as any, {
            region: "MainHallShop" as any,
            chipMultiplier: 0.0,
            description: "Shop (No Gambling)",
        });
    }

    /**
     * Register a new venue with custom multiplier
     */
    public registerVenue(venue: VenueBonus): void {
        if (
            !venue ||
            venue.region === undefined ||
            !Number.isFinite(venue.chipMultiplier) ||
            venue.chipMultiplier < 0 ||
            !venue.description
        ) {
            throw new Error("Invalid casino venue configuration");
        }
        this.venues.set(venue.region, venue);
        this.logger.info("Venue registered", {
            region: venue.region,
            multiplier: venue.chipMultiplier,
            description: venue.description,
        });
    }

    /**
     * Get venue multiplier for a region
     */
    public getVenueMultiplier(region?: MapRegion | string): number {
        if (!region) {
            return this.fallbackMultiplier;
        }

        const venue = this.getVenue(region);
        if (!venue) {
            this.logger.warn("Venue not found", {
                region,
                usingDefault: `${this.fallbackMultiplier}x`,
                operation: "getVenueMultiplier",
            });
            return this.fallbackMultiplier;
        }

        return venue.chipMultiplier;
    }

    /**
     * Get venue description
     */
    public getVenueDescription(region?: MapRegion | string): string {
        if (!region) {
            return "Unknown Location";
        }

        const venue = this.getVenue(region);
        return venue?.description || "Unknown Location";
    }

    /**
     * Return the configured venue for a location without applying fallback
     * behavior. This is useful when callers need to distinguish an invalid
     * location from the neutral default multiplier.
     */
    public getVenue(region?: MapRegion | string): VenueBonus | undefined {
        if (!region) return undefined;

        const exact = this.venues.get(region);
        if (exact) return exact;

        if (
            typeof region === "object" &&
            region.TopLeft &&
            region.BottomRight
        ) {
            return Array.from(this.venues.values()).find((venue) => {
                const bounds = venue.region;
                return (
                    typeof bounds === "object" &&
                    region.TopLeft.X >= bounds.TopLeft.X &&
                    region.TopLeft.Y >= bounds.TopLeft.Y &&
                    region.TopLeft.X <= bounds.BottomRight.X &&
                    region.TopLeft.Y <= bounds.BottomRight.Y
                );
            });
        }

        return undefined;
    }

    /**
     * Persist a player's location through the approved mutation boundary and
     * emit an auditable event for cross-system consumers.
     */
    public async persistLocation(
        memberNumber: number,
        position: { X: number; Y: number },
        actor = memberNumber,
    ): Promise<VenueBonus | undefined> {
        if (
            !Number.isInteger(memberNumber) ||
            memberNumber < 0 ||
            !Number.isFinite(position?.X) ||
            !Number.isFinite(position?.Y)
        ) {
            throw new Error("Invalid casino location");
        }
        if (!this.mutationService) {
            throw new Error("Casino venue mutation service is not configured");
        }

        await this.mutationService.updateLocation(
            memberNumber,
            position,
            actor,
        );
        const venue = this.getVenue(position as unknown as MapRegion);
        await this.mutationService.recordEvent({
            timestamp: Date.now(),
            type: "audit_trail",
            source: "casino",
            actor,
            target: memberNumber,
            data: {
                operation: "casino_venue_location_changed",
                position,
                venue: venue?.description ?? "Unknown Location",
            },
            processed: false,
        });
        return venue;
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
        const venues = this.getVenuesByMultiplier();
        const venueDetails = venues.map((v) => ({
            region: v.region,
            multiplier: v.chipMultiplier,
            description: v.description,
        }));
        this.logger.info("All venues", {
            operation: "logVenues",
            count: venues.length,
            venues: venueDetails,
        });
    }
}
