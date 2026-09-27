import {
    type MapTriggerActionAdapter,
    type MapTriggerCallback,
    type MapTriggerRegistrationHandle,
    type MapTriggerRegistrationRequest,
    type MapTriggerScope,
} from "./domain";

interface ActiveRegistration {
    readonly request: MapTriggerRegistrationRequest;
    readonly adapterRegistration: ReturnType<
        MapTriggerActionAdapter["register"]
    >;
    readonly handle: MapTriggerRegistrationHandle;
    disposed: boolean;
}

export interface MapTriggerRegistryOptions {
    readonly onCleanupError?: (error: unknown) => void;
}

/** Owns runtime trigger registrations for one active room/map scope. */
export class MapTriggerRegistry {
    private readonly registrations = new Map<string, ActiveRegistration>();
    private readonly onCleanupError: (error: unknown) => void;
    private activeScope?: MapTriggerScope;
    private nextRegistrationId = 1;
    private closed = false;

    public constructor(
        private readonly adapter: MapTriggerActionAdapter,
        options: MapTriggerRegistryOptions = {},
    ) {
        this.onCleanupError = options.onCleanupError ?? (() => {});
    }

    public bind(scope: MapTriggerScope): void {
        if (this.closed) {
            throw new Error("Map trigger registry is closed");
        }
        if (this.isSameScope(scope)) return;

        this.disposeAll();
        this.activeScope = scope;
    }

    public register(
        request: Omit<MapTriggerRegistrationRequest, "scope">,
    ): MapTriggerRegistrationHandle {
        const scope = this.activeScope;
        if (!scope) throw new Error("Map trigger registry is not bound");
        if (this.closed) throw new Error("Map trigger registry is closed");

        const existing = this.registrations.get(request.key);
        if (existing) this.disposeRegistration(existing);

        const registrationId = `map-trigger-${this.nextRegistrationId++}`;
        let activeRegistration: ActiveRegistration | undefined;
        const guardedCallback: MapTriggerCallback = (...args: never[]) => {
            if (
                activeRegistration?.disposed !== false ||
                !this.isSameScope(scope)
            ) {
                return;
            }
            request.callback(...args);
        };
        const scopedRequest: MapTriggerRegistrationRequest = {
            ...request,
            scope,
            callback: guardedCallback,
        };
        const adapterRegistration = this.adapter.register(scopedRequest);
        const handle: MapTriggerRegistrationHandle = {
            registrationId,
            scopeId: scope.scopeId,
            key: request.key,
            get disposed() {
                return activeRegistration?.disposed ?? true;
            },
            dispose: () => {
                if (activeRegistration) {
                    this.disposeRegistration(activeRegistration);
                }
            },
        };
        activeRegistration = {
            request: scopedRequest,
            adapterRegistration,
            handle,
            disposed: false,
        };
        this.registrations.set(request.key, activeRegistration);
        return handle;
    }

    public disposeScope(scopeId: string): void {
        if (this.activeScope?.scopeId !== scopeId) return;
        this.disposeAll();
        this.activeScope = undefined;
    }

    public close(): void {
        if (this.closed) return;
        this.disposeAll();
        this.activeScope = undefined;
        this.closed = true;
    }

    public get size(): number {
        return this.registrations.size;
    }

    public get scopeId(): string | undefined {
        return this.activeScope?.scopeId;
    }

    private disposeAll(): void {
        for (const registration of [...this.registrations.values()]) {
            this.disposeRegistration(registration);
        }
        this.registrations.clear();
    }

    private disposeRegistration(registration: ActiveRegistration): void {
        if (registration.disposed) return;
        registration.disposed = true;
        this.registrations.delete(registration.request.key);
        try {
            this.adapter.unregister(registration.adapterRegistration);
        } catch (error) {
            this.onCleanupError(error);
        }
    }

    private isSameScope(scope: MapTriggerScope): boolean {
        return (
            this.activeScope?.scopeId === scope.scopeId &&
            this.activeScope?.room === scope.room &&
            this.activeScope?.map === scope.map
        );
    }
}
