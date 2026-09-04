# AbstractMessageFeatureSystem Migration Examples

## Quick Reference: Three Migration Patterns

### Pattern 1: Simple Message-Based System (Recommended for new systems)

For systems that just need to handle messages with permission checking and command routing.

**File:** `HelpAndGuideSystem.ts` (Reference implementation)

```typescript
import {
    AbstractMessageFeatureSystem,
    type ParsedCommand,
} from "../shared/abstractMessageFeatureSystem";

export class MySimpleSystem extends AbstractMessageFeatureSystem {
    private _enabled = true;

    constructor(conn: API_Connector) {
        super(conn, "mysystem", "My System");
    }

    protected isEnabled(): boolean {
        return this._enabled;
    }

    protected async handleCommand(
        sender: API_Character,
        parsed: ParsedCommand,
        msg: BC_Server_ChatRoomMessage,
    ): Promise<void> {
        switch (parsed.command) {
            case "help":
                await this.sendMessage(sender.MemberNumber, "Help text here");
                break;
            default:
                throw new Error(`Unknown command: ${parsed.command}`);
        }
    }
}
```

**Connection to Message Handlers:**

```typescript
// In your main game setup
const helpSystem = new MySimpleSystem(conn);

// In registerCommands (GamePlugin) or registerCommand (CommandParser)
router.registerCommand("help", async (sender, msg, args) => {
    await helpSystem.processMessage(sender, msg, args);
});
```

---

### Pattern 2: GamePlugin System (for existing GamePlugins)

For systems that already implement `GamePlugin` and need to add message handling features.

**File:** `MyGamePlugin.ts`

```typescript
export class MyGame implements GamePlugin {
    readonly key = "mygame";
    readonly label = "My Game";
    enabled = true;

    private messageHandler: GamePluginMessageFeatureSystem;

    constructor(conn: API_Connector) {
        // Initialize message handler
        this.messageHandler = new GamePluginMessageFeatureSystem(
            conn,
            this.key,
            this.label,
            () => this.enabled,
        );
    }

    registerCommands(router: GamePluginCommandRouter): void {
        router.registerCommand("help", this.onHelpCommand);
        router.registerGroup("play", {
            start: this.onPlayStart,
            stop: this.onPlayStop,
        });
    }

    private onHelpCommand = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        // Delegate to message handler
        await this.messageHandler.processMessage(sender, msg, [
            "help",
            ...args,
        ]);
    };

    // ... other methods
}
```

---

### Pattern 3: CommandParser-Based System (for admin/utility systems)

For systems that register commands directly with `CommandParser`.

**File:** `MyCommandSystem.ts`

```typescript
export class MyCommandSystem extends CommandSystemMessageFeatureSystem {
    constructor(conn: API_Connector, commandParser: CommandParser) {
        super(
            conn,
            commandParser,
            "mysys",
            "My Command System",
            () => true, // enabled getter
        );
    }

    public registerCommands(): void {
        this.registerCommand("help", this.handleHelpCommand);
        this.registerCommand("status", this.handleStatusCommand);
    }

    private handleHelpCommand = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        // Handle help-specific logic
    };

    // ...
}
```

---

## Migration Path: Step by Step

### Step 1: Identify Message Flow

Analyze your current system:

1. Where do messages enter? (`onMessage`, `onCommand`, etc.)
2. What permission checks are done?
3. How is the command parsed?
4. What validation happens?
5. How are responses sent back?

### Step 2: Extract Permission Logic

If you have permission checks scattered throughout, consolidate in `validateUserPermission()`:

**Before:**

```typescript
private onCommandAdmin = async (sender: API_Character, msg) => {
    if (!sender.IsRoomAdmin()) {
        this.conn.reply(msg, "Admin only");
        return;
    }
    // ... handle command
};

private onCommandUser = async (sender: API_Character, msg) => {
    // No permission check needed
    // ... handle command
};
```

**After:**

```typescript
protected validateUserPermission(sender: API_Character, args: string[]): PermissionCheckResult {
    // Route-based permission checks
    if (args[0] === "admin-only") {
        return this.requireAdmin(sender);
    }
    return { allowed: true };
}
```

### Step 3: Consolidate Command Handlers

Move individual command handlers into a single switch statement in `handleCommand()`:

**Before:**

```typescript
private onJoin = async (sender, msg, args) => { ... };
private onLeave = async (sender, msg, args) => { ... };
private onStart = async (sender, msg, args) => { ... };
```

**After:**

```typescript
protected async handleCommand(sender, parsed, msg): Promise<void> {
    switch (parsed.command) {
        case "join":
            // ... join logic
            break;
        case "leave":
            // ... leave logic
            break;
        case "start":
            // ... start logic
            break;
    }
}
```

### Step 4: Replace Message Sending

Replace direct `sendMessage` calls with the inherited method:

**Before:**

```typescript
this.conn.SendMessage("Whisper", "Response text", memberNumber);
```

**After:**

```typescript
await this.sendMessage(memberNumber, "Response text");
```

### Step 5: Update Entry Points

Point all message handlers to `processMessage()`:

**Before:**

```typescript
router.registerCommand("help", this.onHelp);
```

**After:**

```typescript
router.registerCommand("help", async (sender, msg, args) => {
    await this.messageHandler.processMessage(sender, msg, args);
});
```

### Step 6: Test & Validate

1. Run all existing tests to ensure behavior unchanged
2. Add new tests if needed for edge cases
3. Check TypeScript: `npm run types`
4. Profile performance to ensure no regression

---

## Code Reduction Examples

### Example 1: Permission Checking

**Before (duplicated in 5 different handlers):** ~50 lines

```typescript
private requireAdmin(sender: API_Character, msg): boolean {
    if (!sender.IsRoomAdmin()) {
        this.conn.reply(msg, "Only room admins can use this command.");
        return false;
    }
    return true;
}
```

**After:** Uses inherited method from `AbstractMessageFeatureSystem`

```typescript
protected validateUserPermission(sender, args) {
    if (this.isAdminCommand(args[0])) {
        return this.requireAdmin(sender);
    }
    return { allowed: true };
}
```

**Savings:** ~40 lines per system

### Example 2: Error Handling

**Before (repeated in every handler):** ~30 lines per handler × 5 handlers = ~150 lines

```typescript
private onCommand = async (sender, msg, args) => {
    try {
        if (!this.enabled) { /* ... */ }
        if (!sender.IsRoomAdmin()) { /* ... */ }
        const cmd = args[0];
        if (!cmd) { /* ... */ }
        // ... actual logic
    } catch (error) {
        this.logger.error("Handler failed", error);
        this.conn.reply(msg, `Error: ${error.message}`);
    }
};
```

**After:** Handled by `AbstractMessageFeatureSystem.processMessage()`

```typescript
protected async handleCommand(sender, parsed, msg) {
    // Business logic only, error handling inherited
}
```

**Savings:** ~120 lines per system

---

## Testing Strategies

### Unit Testing Example

```typescript
describe("MySystemMessageFeatureSystem", () => {
    let system: MySystem;
    let connector: MockConnector;

    beforeEach(() => {
        connector = createMockConnector();
        system = new MySystem(connector);
    });

    it("should process help command", async () => {
        const sender = createMockCharacter();
        const msg = createMockMessage();

        await system.processMessage(sender, msg, ["help"]);

        const messages = connector.getMessages();
        assert(messages.some((m) => m.text.includes("help")));
    });

    it("should deny admins when permission check fails", async () => {
        system.setPermissionChecker(() => ({
            allowed: false,
            reason: "Permission denied",
        }));

        const sender = createMockCharacter();
        const msg = createMockMessage();

        await system.processMessage(sender, msg, ["command"]);

        const messages = connector.getMessages();
        assert(messages.some((m) => m.text.includes("Permission denied")));
    });
});
```

---

## Common Pitfalls & Solutions

### Pitfall 1: Forgetting to Call `await`

❌ **Wrong:**

```typescript
protected async handleCommand(sender, parsed, msg) {
    this.sendMessage(sender.MemberNumber, "Hello"); // Missing await
}
```

✅ **Right:**

```typescript
protected async handleCommand(sender, parsed, msg) {
    await this.sendMessage(sender.MemberNumber, "Hello");
}
```

### Pitfall 2: Not Throwing on Errors

❌ **Wrong:**

```typescript
protected async handleCommand(sender, parsed, msg) {
    if (!parsed.command) {
        await this.sendMessage(sender.MemberNumber, "Error");
        return; // Silently fails
    }
}
```

✅ **Right:**

```typescript
protected validateCommand(parsed, sender): ValidationResult {
    if (!parsed.command) {
        return { valid: false, message: "No command" };
    }
    return { valid: true };
}
```

### Pitfall 3: Overriding `processMessage` Instead of Extending

❌ **Wrong:**

```typescript
export class MySystem extends AbstractMessageFeatureSystem {
    // Don't override processMessage - override template methods instead
    async processMessage(sender, msg, args) {
        // Duplicates all the logic
    }
}
```

✅ **Right:**

```typescript
export class MySystem extends AbstractMessageFeatureSystem {
    // Override specific methods only
    protected async handleCommand(sender, parsed, msg) {
        // Your business logic here
    }
}
```

---

## Benefits Summary

| Aspect              | Before                     | After                            |
| ------------------- | -------------------------- | -------------------------------- |
| Permission Checking | Duplicated in each handler | Centralized in one method        |
| Error Handling      | Try-catch in every handler | Handled by base class            |
| Message Sending     | Direct API calls           | Inherited method                 |
| Lines of Code       | ~300-400 per system        | ~150-200 per system              |
| Testability         | Handlers hard to test      | Template methods easily testable |
| Consistency         | Different patterns         | Uniform approach                 |
| New Features        | Must be added everywhere   | Added once in base class         |

---

## Next Steps

1. Review the `HelpAndGuideSystem` reference implementation
2. Choose one small system to migrate first
3. Run tests after each change
4. Document any system-specific overrides needed
5. Share migration pattern with team
6. Plan migration schedule for remaining systems
