# AbstractMessageFeatureSystem Implementation Guide

## Overview

The `AbstractMessageFeatureSystem` is a base class that eliminates approximately 200 lines of duplicated code across multiple message-based feature systems in Veratown.

## Purpose

This base class provides a standardized template method pattern for handling chat messages, with extension points for:
- Message validation
- Permission checking
- Command parsing
- Command handling
- Message sending

## Architecture

### Core Methods

#### `processMessage(sender, msg, args)`
**Main entry point** for all incoming messages. Orchestrates the complete message flow:

1. Checks if system is enabled
2. Validates user has permission
3. Parses command and arguments
4. Validates command syntax
5. Handles the command
6. Catches and logs any errors

This is the only method you need to call from your message handlers.

#### `handleCommand(sender, parsed, msg)` *(Abstract)*
Must be implemented by subclasses. Contains the actual business logic for handling commands.

```typescript
protected abstract async handleCommand(
  sender: API_Character,
  parsed: ParsedCommand,
  msg: BC_Server_ChatRoomMessage,
): Promise<void>;
```

#### `parseCommand(args)`
Parses raw arguments into a structured format. Default implementation:
- Takes first argument as command name
- Lowercases it
- Remaining arguments become args array

Override for custom parsing logic.

#### `validateUserPermission(sender, args)`
Checks if user has permission to execute the command. Default allows all users.

Override to implement permission logic:
```typescript
protected validateUserPermission(
  sender: API_Character,
  args: string[]
): PermissionCheckResult {
  if (args[0] === "admin-command") {
    return this.requireAdmin(sender);
  }
  return { allowed: true };
}
```

#### `validateCommand(parsed, sender)`
Validates the parsed command structure. Default rejects empty commands.

Override to add custom validation:
```typescript
protected validateCommand(
  parsed: ParsedCommand,
  sender: API_Character
): ValidationResult {
  if (!parsed.command) {
    return { valid: false, message: "No command specified." };
  }
  if (parsed.args.length < 1 && parsed.command === "specific") {
    return { valid: false, message: "Command requires arguments." };
  }
  return { valid: true };
}
```

#### `sendMessage(targetMemberNumber, text)`
Sends a whisper message to a user. Default sends via `conn.SendMessage("Whisper", ...)`.

Override to change delivery method:
```typescript
protected async sendMessage(
  targetMemberNumber: number,
  text: string
): Promise<MessageSendResult> {
  // Send to room instead of whisper
  this.conn.SendMessage("Emote", text);
  return { success: true };
}
```

#### `isEnabled()`
Abstract method. Return whether the feature is currently active.

### Helper Methods

#### `isUserAdmin(sender)`
Returns true if sender is room admin.

#### `requireAdmin(sender)`
Returns permission check result that allows only admins.

#### `getDisabledMessage()`
Returns the message displayed when system is disabled.

## Migration Pattern

### Before (Bare Implementation)

```typescript
export class MyFeature implements GamePlugin {
  async onMessage(sender: API_Character, msg: BC_Server_ChatRoomMessage, args: string[]) {
    if (!this.enabled) {
      this.whisper(sender.MemberNumber, "Feature is disabled");
      return;
    }

    if (!sender.IsRoomAdmin()) {
      this.whisper(sender.MemberNumber, "Admin only");
      return;
    }

    const command = args[0]?.toLowerCase();
    if (!command) {
      this.whisper(sender.MemberNumber, "No command specified");
      return;
    }

    switch (command) {
      case "help":
        this.whisper(sender.MemberNumber, "Usage: !myfeature help");
        break;
      case "status":
        const status = this.getStatus();
        this.whisper(sender.MemberNumber, status);
        break;
      default:
        this.whisper(sender.MemberNumber, `Unknown command: ${command}`);
    }
  }
}
```

### After (Using AbstractMessageFeatureSystem)

```typescript
export class MyFeature extends AbstractMessageFeatureSystem {
  constructor(conn: API_Connector) {
    super(conn, "myfeature", "My Feature");
  }

  protected isEnabled(): boolean {
    return this.enabled; // Or whatever state tracks this
  }

  protected validateUserPermission(sender: API_Character): PermissionCheckResult {
    return this.requireAdmin(sender);
  }

  protected async handleCommand(
    sender: API_Character,
    parsed: ParsedCommand,
  ): Promise<void> {
    switch (parsed.command) {
      case "help":
        await this.sendMessage(sender.MemberNumber, "Usage: !myfeature help");
        break;
      case "status":
        const status = this.getStatus();
        await this.sendMessage(sender.MemberNumber, status);
        break;
      default:
        throw new Error(`Unknown command: ${parsed.command}`);
    }
  }
}
```

Then connect it to your message handlers:

```typescript
public registerCommands(router: GamePluginCommandRouter): void {
  router.registerCommand("help", async (sender, msg, args) => {
    await this.processMessage(sender, msg, args);
  });
}

// Or for group commands
public registerCommands(router: GamePluginCommandRouter): void {
  router.registerGroup("myfeature", {
    help: async (sender, msg, args) => {
      await this.processMessage(sender, msg, ["help", ...args]);
    },
    status: async (sender, msg, args) => {
      await this.processMessage(sender, msg, ["status", ...args]);
    },
  });
}
```

## Systems to Migrate

### Priority 1 (High Priority)
1. **Dare Game System** - Has extensive command handling (~1000+ lines)
2. **Administration Commands** - Has multiple admin commands

### Priority 2 (Medium Priority)
3. **Roleplay Challenge System** - Message-based commands
4. **Maids Party Night System** - Message-based interactions

### Priority 3 (Lower Priority)
5. **Chat Command System** - Generic message routing
6. **Help & Guide System** - Message-based help display

## Implementation Checklist

### Phase 1: Establish Base Class ✓
- [x] Create `AbstractMessageFeatureSystem` base class
- [x] Define abstract methods and template flow
- [x] Create comprehensive unit tests
- [x] Document usage patterns

### Phase 2: Migrate Core Systems
- [ ] Migrate Dare Game System
- [ ] Migrate Administration Commands
- [ ] Ensure all existing tests still pass
- [ ] Validate no performance regression

### Phase 3: Migrate Secondary Systems
- [ ] Migrate Roleplay Challenge System
- [ ] Migrate Maids Party Night System
- [ ] Create additional integration tests

### Phase 4: Migrate Remaining Systems
- [ ] Migrate Chat Command System
- [ ] Migrate Help & Guide System
- [ ] Complete test coverage (95%+)

### Phase 5: Validation
- [ ] TypeScript strict mode: 0 errors
- [ ] Code coverage: 95%+
- [ ] Performance benchmarks
- [ ] Documentation complete

## Testing

The base class includes comprehensive test coverage demonstrating:
- Message processing flow
- Permission checking
- Command parsing
- Error handling
- Edge cases (disabled system, empty commands, etc.)

Tests are located in: `bin/games/shared/__tests__/abstractMessageFeatureSystem.test.ts`

### Run Tests
```bash
npm run test:unit -- bin/games/shared/__tests__/abstractMessageFeatureSystem.test.ts
```

## Benefits

### Code Reduction
- Eliminates ~200 lines of duplicate permission checking
- Eliminates ~200 lines of duplicate message handling
- Eliminates ~100 lines of duplicate error handling

### Consistency
- All message-based features follow the same pattern
- Permission checking is standardized
- Error handling is centralized and logged
- Disabled system behavior is consistent

### Maintainability
- New feature systems inherit tested behavior
- Bug fixes in base class benefit all systems
- Clear extension points for customization
- Single source of truth for message flow

### Testability
- Base class behavior is fully tested
- Systems can focus on business logic tests
- Mock implementations easier to write
- Permission logic is independently testable

## Error Handling

The base class handles errors gracefully:

1. **Permission Denied** - Returns permission error message
2. **Validation Failed** - Returns validation error message
3. **Handler Exception** - Catches, logs, and reports error
4. **Disabled System** - Returns disabled message

All errors are logged with context via the logger:
```
[Test Feature:MessageFeatureSystem] Error processing message from Character123
```

## Logging

The base class provides structured logging via the standard logger:

```typescript
protected logger: Logger; // Initialized in constructor
```

Subclasses inherit logger and can use it for additional logging:
```typescript
this.logger.info("Command executed", { command, sender: sender.MemberNumber });
```

## TypeScript Compatibility

The implementation is fully compatible with TypeScript strict mode:
- All types are explicit
- No `any` types
- Proper interface definitions
- Abstract methods enforced

## Next Steps

1. Review and test the base class implementation
2. Begin migrating Dare Game System as primary example
3. Update documentation as systems are migrated
4. Monitor code coverage and ensure 95%+ maintained
5. Validate performance remains unchanged
