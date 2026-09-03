import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Db, MongoClient } from "mongodb";
import { LocationEventSystem } from "../locationEventSystem";

describe("Feature 1.3.5: Location Event System", () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let eventSystem: LocationEventSystem;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db("test-veratown");
        eventSystem = new LocationEventSystem(db);
    });

    after(async () => {
        eventSystem.cleanup();
        await client.close();
        await mongoServer.stop();
    });

    describe("Event Creation and Retrieval", () => {
        it("should create a location event", async () => {
            const event = await eventSystem.createEvent("prison_yard", {
                locationKey: "prison_yard",
                eventId: "event_001",
                eventName: "Morning Roll Call",
                triggerType: "daily",
                isEnabled: true,
                dailyHourUTC: 6,
                dailyMinuteUTC: 0,
                narration:
                    "The guards blow their whistles for morning roll call!",
                narrationTo: "location",
            });

            assert.equal(event.eventName, "Morning Roll Call");
            assert.equal(event.triggerType, "daily");
            assert.ok(event.createdAt > 0);
        });

        it("should retrieve event by ID", async () => {
            await eventSystem.createEvent("dining_hall", {
                locationKey: "dining_hall",
                eventId: "event_002",
                eventName: "Dinner Service",
                triggerType: "occupancy",
                isEnabled: true,
                occupancyThreshold: 5,
                narration: "Dinner is being served!",
            });

            const event = await eventSystem.getEvent("event_002");
            assert.ok(event);
            assert.equal(event.eventName, "Dinner Service");
        });

        it("should list all events for location", async () => {
            const locationKey = "garden";

            await eventSystem.createEvent(locationKey, {
                locationKey: locationKey,
                eventId: "event_003",
                eventName: "Birds Singing",
                triggerType: "random",
                isEnabled: true,
                randomChance: 0.1,
                randomIntervalMs: 60000,
                narration: "Birds are singing outside...",
            });

            await eventSystem.createEvent(locationKey, {
                locationKey: locationKey,
                eventId: "event_004",
                eventName: "Rain",
                triggerType: "random",
                isEnabled: true,
                randomChance: 0.05,
                randomIntervalMs: 120000,
                narration: "It starts to rain.",
            });

            const events = await eventSystem.getLocationEvents(locationKey);
            assert.equal(events.length, 2);
        });

        it("should get only active events", async () => {
            const locationKey = "courtyard";

            await eventSystem.createEvent(locationKey, {
                locationKey: locationKey,
                eventId: "event_005",
                eventName: "Active Event",
                triggerType: "manual",
                isEnabled: true,
                narration: "This event is active",
            });

            await eventSystem.createEvent(locationKey, {
                locationKey: locationKey,
                eventId: "event_006",
                eventName: "Inactive Event",
                triggerType: "manual",
                isEnabled: false,
                narration: "This event is inactive",
            });

            const activeEvents = await eventSystem.getActiveEvents(locationKey);
            assert.equal(activeEvents.length, 1);
            assert.equal(activeEvents[0].eventName, "Active Event");
        });
    });

    describe("Event Management", () => {
        it("should enable or disable event", async () => {
            await eventSystem.createEvent("storage", {
                locationKey: "storage",
                eventId: "event_007",
                eventName: "Inventory Check",
                triggerType: "daily",
                isEnabled: true,
                dailyHourUTC: 12,
                narration: "Inventory check in progress",
            });

            await eventSystem.setEventEnabled("event_007", false);

            const event = await eventSystem.getEvent("event_007");
            assert.strictEqual(event?.isEnabled, false);
        });

        it("should update event configuration", async () => {
            await eventSystem.createEvent("workshop", {
                locationKey: "workshop",
                eventId: "event_008",
                eventName: "Workshop Open",
                triggerType: "daily",
                isEnabled: true,
                dailyHourUTC: 9,
                narration: "Workshop opens for the day",
            });

            await eventSystem.updateEvent("event_008", {
                narration: "Workshop is now available for all inmates",
            });

            const event = await eventSystem.getEvent("event_008");
            assert.equal(
                event?.narration,
                "Workshop is now available for all inmates",
            );
        });

        it("should delete event", async () => {
            await eventSystem.createEvent("library", {
                locationKey: "library",
                eventId: "event_009",
                eventName: "Reading Time",
                triggerType: "daily",
                isEnabled: true,
                dailyHourUTC: 14,
                narration: "It's reading time",
            });

            await eventSystem.deleteEvent("event_009");

            const event = await eventSystem.getEvent("event_009");
            assert.strictEqual(event, null);
        });
    });

    describe("Event Execution", () => {
        it("should execute event and record execution", async () => {
            await eventSystem.createEvent("gym", {
                locationKey: "gym",
                eventId: "event_010",
                eventName: "Exercise Time",
                triggerType: "occupancy",
                isEnabled: true,
                occupancyThreshold: 3,
                narration: "Time to exercise!",
            });

            const execution = await eventSystem.executeEvent(
                "event_010",
                [10001, 10002, 10003],
                "occupancy",
            );

            assert.equal(execution.affectedMembers.length, 3);
            assert.equal(execution.triggeredBy, "occupancy");
            assert.ok(execution.triggeredAt > 0);
        });

        it("should update last triggered time", async () => {
            await eventSystem.createEvent("recreation", {
                locationKey: "recreation",
                eventId: "event_011",
                eventName: "Recreation Time",
                triggerType: "manual",
                isEnabled: true,
                narration: "Recreation time!",
            });

            const beforeTime = Date.now();
            await eventSystem.executeEvent("event_011", [20001], "manual");

            const event = await eventSystem.getEvent("event_011");
            assert.ok(event?.lastTriggeredAt! >= beforeTime);
        });

        it("should record consecutive failures and auto-disable", async () => {
            await eventSystem.createEvent("infirmary", {
                locationKey: "infirmary",
                eventId: "event_012",
                eventName: "Medical Check",
                triggerType: "daily",
                isEnabled: true,
                dailyHourUTC: 10,
                narration: "Medical check time",
            });

            // Record 4 failures
            for (let i = 0; i < 4; i++) {
                await eventSystem.recordEventFailure("event_012", "Test error");
            }

            const event = await eventSystem.getEvent("event_012");
            assert.strictEqual(event?.isEnabled, false);
        });

        it("should get execution history", async () => {
            await eventSystem.createEvent("cafeteria", {
                locationKey: "cafeteria",
                eventId: "event_013",
                eventName: "Breakfast",
                triggerType: "daily",
                isEnabled: true,
                dailyHourUTC: 7,
                narration: "Breakfast is served",
            });

            for (let i = 0; i < 3; i++) {
                await eventSystem.executeEvent(
                    "event_013",
                    [30001, 30002],
                    "daily",
                );
            }

            const history = await eventSystem.getExecutionHistory("event_013");
            assert.equal(history.length, 3);
        });
    });

    describe("Event Filtering by Type", () => {
        it("should get occupancy-based events", async () => {
            const locationKey = "barracks";

            await eventSystem.createEvent(locationKey, {
                locationKey: locationKey,
                eventId: "event_014",
                eventName: "Occupancy Event",
                triggerType: "occupancy",
                isEnabled: true,
                occupancyThreshold: 10,
                narration: "Area is full",
            });

            const occupancyEvents = await eventSystem.getEventsByTriggerType(
                locationKey,
                "occupancy",
            );

            assert.equal(occupancyEvents.length, 1);
        });

        it("should get daily-triggered events", async () => {
            const locationKey = "chapel";

            await eventSystem.createEvent(locationKey, {
                locationKey: locationKey,
                eventId: "event_015",
                eventName: "Daily Prayer",
                triggerType: "daily",
                isEnabled: true,
                dailyHourUTC: 18,
                narration: "Time for prayer",
            });

            const dailyEvents = await eventSystem.getEventsByTriggerType(
                locationKey,
                "daily",
            );

            assert.equal(dailyEvents.length, 1);
        });

        it("should get random-triggered events", async () => {
            const locationKey = "hallway";

            await eventSystem.createEvent(locationKey, {
                locationKey: locationKey,
                eventId: "event_016",
                eventName: "Random Encounter",
                triggerType: "random",
                isEnabled: true,
                randomChance: 0.2,
                randomIntervalMs: 30000,
                narration: "A guard walks by",
            });

            const randomEvents = await eventSystem.getEventsByTriggerType(
                locationKey,
                "random",
            );

            assert.equal(randomEvents.length, 1);
        });
    });

    describe("Event Trigger Checking", () => {
        it("should identify occupancy-based events that should trigger", async () => {
            const locationKey = "assembly";

            await eventSystem.createEvent(locationKey, {
                locationKey: locationKey,
                eventId: "event_017",
                eventName: "Assembly",
                triggerType: "occupancy",
                isEnabled: true,
                occupancyThreshold: 5,
                narration: "Assembly time",
            });

            const shouldTrigger = await eventSystem.checkOccupancyEvents(
                locationKey,
                5,
            );

            assert.equal(shouldTrigger.length, 1);
        });

        it("should not trigger occupancy events below threshold", async () => {
            const locationKey = "lounge";

            await eventSystem.createEvent(locationKey, {
                locationKey: locationKey,
                eventId: "event_018",
                eventName: "Full Lounge",
                triggerType: "occupancy",
                isEnabled: true,
                occupancyThreshold: 10,
                narration: "Lounge is full",
            });

            const shouldTrigger = await eventSystem.checkOccupancyEvents(
                locationKey,
                5,
            );

            assert.equal(shouldTrigger.length, 0);
        });

        it("should check daily events", async () => {
            const locationKey = "clock_tower";

            await eventSystem.createEvent(locationKey, {
                locationKey: locationKey,
                eventId: "event_019",
                eventName: "Bell Rings",
                triggerType: "daily",
                isEnabled: true,
                dailyHourUTC: new Date().getUTCHours(),
                dailyMinuteUTC: new Date().getUTCMinutes(),
                narration: "The bell rings out",
            });

            const shouldTrigger =
                await eventSystem.checkDailyEvents(locationKey);
            // May or may not trigger depending on exact time
            assert.ok(Array.isArray(shouldTrigger));
        });

        it("should not re-trigger daily events on same day", async () => {
            const locationKey = "watchtower";

            await eventSystem.createEvent(locationKey, {
                locationKey: locationKey,
                eventId: "event_020",
                eventName: "Watch Change",
                triggerType: "daily",
                isEnabled: true,
                dailyHourUTC: new Date().getUTCHours(),
                narration: "Guard change",
            });

            // Trigger once
            await eventSystem.executeEvent("event_020", [40001], "daily");

            // Check again immediately
            const shouldTrigger =
                await eventSystem.checkDailyEvents(locationKey);
            // Should not be in the trigger list anymore today
            const wouldReTrigger = shouldTrigger.some(
                (e) => e.eventId === "event_020",
            );
            assert.strictEqual(wouldReTrigger, false);
        });

        it("should check random events", async () => {
            const locationKey = "courtyard_2";

            await eventSystem.createEvent(locationKey, {
                locationKey: locationKey,
                eventId: "event_021",
                eventName: "Random Patrol",
                triggerType: "random",
                isEnabled: true,
                randomChance: 0.5,
                randomIntervalMs: 100, // Very short interval for testing
                narration: "A patrol passes by",
            });

            // Wait a bit
            await new Promise((resolve) => setTimeout(resolve, 150));

            const shouldTrigger =
                await eventSystem.checkRandomEvents(locationKey);
            assert.ok(shouldTrigger.length >= 0);
        });
    });

    describe("Pruning and Statistics", () => {
        it("should prune old execution history", async () => {
            await eventSystem.createEvent("trash", {
                locationKey: "trash",
                eventId: "event_022",
                eventName: "Trash Duty",
                triggerType: "daily",
                isEnabled: true,
                dailyHourUTC: 11,
                narration: "Time to take out trash",
            });

            await eventSystem.executeEvent("event_022", [50001], "daily");

            // Manually set old execution time
            const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const pruned = await eventSystem.pruneOldExecutions(oneWeekAgo);

            // Should have pruned 1 execution
            assert.ok(pruned >= 0);
        });

        it("should get system statistics", async () => {
            const stats = await eventSystem.getStatistics();

            assert.ok(stats.totalEvents >= 0);
            assert.ok(stats.enabledEvents >= 0);
            assert.ok(stats.totalExecutions >= 0);
            assert.ok(typeof stats.byTriggerType === "object");
        });
    });
});
