import type { API_Character, API_Map, MapRegion } from "bc-bot";
import type {
    MapTriggerActionAdapter,
    MapTriggerAdapterRegistration,
    MapTriggerRegistrationRequest,
} from "../domain";

type BCMapCallback = (
    character: API_Character,
    previousPosition: { X: number; Y: number },
) => void;

interface BCMapTriggerRegistration extends MapTriggerAdapterRegistration {
    readonly map: API_Map;
    readonly request: MapTriggerRegistrationRequest;
    readonly callback: BCMapCallback;
    disposed: boolean;
}

/** Translates transport-neutral trigger registrations to API_Map. */
export class BCMapTriggerActionAdapter implements MapTriggerActionAdapter {
    private nextRegistrationId = 1;

    public register(
        request: MapTriggerRegistrationRequest,
    ): MapTriggerAdapterRegistration {
        const map = request.scope.map as API_Map;
        const callback = request.callback as BCMapCallback;
        const registration: BCMapTriggerRegistration = {
            registrationId: `bc-map-trigger-${this.nextRegistrationId++}`,
            map,
            request,
            callback,
            disposed: false,
        };

        switch (request.kind) {
            case "tile": {
                const position = requirePosition(request);
                map.addTileTrigger({ X: position.x, Y: position.y }, callback);
                break;
            }
            case "enter_region":
                map.addEnterRegionTrigger(
                    toBCRegion(requireRegion(request)),
                    callback,
                );
                break;
            case "leave_region":
                map.addLeaveRegionTrigger(
                    toBCRegion(requireRegion(request)),
                    callback,
                );
                break;
        }

        return registration;
    }

    public unregister(registration: MapTriggerAdapterRegistration): void {
        const binding = registration as BCMapTriggerRegistration;
        if (binding.disposed) return;
        binding.disposed = true;

        switch (binding.request.kind) {
            case "tile": {
                const position = requirePosition(binding.request);
                binding.map.removeTileTrigger(
                    position.x,
                    position.y,
                    binding.callback,
                );
                break;
            }
            case "enter_region":
                binding.map.removeEnterRegionTrigger(binding.callback);
                break;
            case "leave_region":
                binding.map.removeLeaveRegionTrigger(binding.callback);
                break;
        }
    }
}

function requirePosition(request: MapTriggerRegistrationRequest): {
    x: number;
    y: number;
} {
    if (!request.position) {
        throw new Error(`Map trigger ${request.key} requires a position`);
    }
    return request.position;
}

function requireRegion(
    request: MapTriggerRegistrationRequest,
): MapTriggerRegistrationRequest["region"] & object {
    if (!request.region) {
        throw new Error(`Map trigger ${request.key} requires a region`);
    }
    return request.region;
}

function toBCRegion(
    region: NonNullable<MapTriggerRegistrationRequest["region"]>,
): MapRegion {
    return {
        TopLeft: { X: region.topLeft.x, Y: region.topLeft.y },
        BottomRight: { X: region.bottomRight.x, Y: region.bottomRight.y },
    };
}
