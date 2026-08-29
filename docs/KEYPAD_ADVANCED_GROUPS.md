# Advanced Keypad Group Management

## Overview

The `!door` command has been extended with advanced custom group management capabilities, enabling room admins to create flexible access control beyond the three hardcoded groups (admin, whitelist, guest).

**Commit**: 8e05764  
**Feature**: KeypadAccessGroupManager integration with KeypadDoorSystem  
**Status**: ✅ Implemented and integrated

## Hardcoded Groups (Always Available)

Every door has three built-in groups:

- **admin**: Room admin access (admin code)
- **whitelist**: Whitelisted members (whitelist code)
- **guest**: General public access (guest code)

These groups cannot be deleted but can have their codes changed.

## Custom Groups (Advanced)

Admins can create unlimited custom access groups with their own codes and member lists.

### Usage

All commands must be run by whispering to the bot while standing on a keypad tile.

#### List All Groups

```
/w bot !door group-list
```

Shows both hardcoded and custom groups configured for the door.

**Output Example**:

```
Hardcoded groups: admin, whitelist, guest. Custom groups: security, medical, maintenance.
```

#### Create Custom Group

```
/w bot !door group-create <name> <code>
```

- `<name>`: Group name (lowercase, max 50 chars, must be unique per door)
- `<code>`: Access code (max 100 chars)
- **Requires**: Admin status
- **Example**: `/w bot !door group-create security alpha-7-charlie`

#### Delete Custom Group

```
/w bot !door group-delete <name>
```

- `<name>`: Custom group name to delete
- **Requires**: Admin status
- **Note**: Cannot delete hardcoded groups (admin, whitelist, guest)

#### Add Member to Custom Group

```
/w bot !door group-add <name> <member_number>
```

- `<name>`: Custom group name
- `<member_number>`: Member's numeric ID
- **Requires**: Admin status
- **Example**: `/w bot !door group-add security 12345`

#### Remove Member from Custom Group

```
/w bot !door group-remove <name> <member_number>
```

- `<name>`: Custom group name
- `<member_number>`: Member's numeric ID
- **Requires**: Admin status

#### Change Group Code

```
/w bot !door group-code <name> <new_code>
```

- `<name>`: Custom group name
- `<new_code>`: New access code
- **Requires**: Admin status
- **Note**: Works for both custom and hardcoded groups

## Access Control

### Who Can Use Which Commands?

| Command                   | Admin | Whitelist | Regular |
| ------------------------- | ----- | --------- | ------- |
| `group-list`              | ✅    | ✅        | ❌      |
| `group-create`            | ✅    | ❌        | ❌      |
| `group-delete`            | ✅    | ❌        | ❌      |
| `group-add`               | ✅    | ❌        | ❌      |
| `group-remove`            | ✅    | ❌        | ❌      |
| `group-code`              | ✅    | ❌        | ❌      |
| `change-code` (hardcoded) | ✅    | ✅        | ❌      |

## Use Cases

### Security Personnel Access

```
/w bot !door group-create security 2024-secure
/w bot !door group-add security 12345
/w bot !door group-add security 67890
```

### Medical Staff

```
/w bot !door group-create medical doctor-approved
/w bot !door group-add medical 11111
```

### Temporary Visitor Access

```
/w bot !door group-create visitors temp-code-2024
/w bot !door group-add visitors 99999
```

## Database Integration

- Custom groups stored in MongoDB collection: `keypadAccessGroups`
- Per-door isolation: Each door maintains separate group namespace
- Unique constraint: Group names must be unique per door
- Metadata: Creation/update timestamps, member lists automatically maintained

## Error Handling

### Common Errors

**"Custom groups are not available (database not configured)"**

- The MongoDB database is not connected
- Features will not work until database connection is established

**"Group 'X' already exists for this door"**

- Cannot create a group with a name that already exists on this door
- Use `group-delete` first if you want to recreate

**"Group 'X' does not exist"**

- Attempting to modify/delete a group that isn't configured
- Use `group-list` to see available groups

**"Member number must be a positive integer"**

- Member IDs must be numeric (e.g., `12345`, not `PlayerName`)
- Verify the member number is correct

## Integration with Existing Door Commands

Custom groups work alongside existing door commands:

- `/w bot !door change-code <admin|whitelist|guest> <code>` - Change hardcoded group codes
- `/w bot !door add-user <member>` - Add to whitelist (hardcoded group)
- `/w bot !door remove-user <member>` - Remove from whitelist (hardcoded group)
- `/w bot !door list` - Show door configuration including hardcoded groups
- `/w bot !door list-whitelist` - Show whitelist members

## API Details

### KeypadAccessGroupManager Methods Used

```typescript
// Create custom group
createGroup(doorKey: string, groupName: string, code: string): Promise<KeypadAccessGroupConfig>

// Delete custom group
deleteGroup(doorKey: string, groupName: string): Promise<void>

// Add member to group
addMember(doorKey: string, groupName: string, memberNumber: number): Promise<void>

// Remove member from group
removeMember(doorKey: string, groupName: string, memberNumber: number): Promise<void>

// Update group code
updateCode(doorKey: string, groupName: string, newCode: string): Promise<void>

// List all groups for door
listGroups(doorKey: string): Promise<KeypadAccessGroupConfig[]>
```

### KeypadDoorSystem Integration

Door command extensions are implemented in [keypadDoorSystem.ts](../bin/games/veratown/keypadDoorSystem.ts) with the following case handlers:

- `case "group-list"`
- `case "group-create"`
- `case "group-delete"`
- `case "group-add"`
- `case "group-remove"`
- `case "group-code"`

## Future Enhancements

Potential improvements for future iterations:

1. Role-based group templates (e.g., "security", "medical" auto-created with presets)
2. Expiring group memberships (automatic removal after N days)
3. Scheduled group codes (codes that change based on time)
4. Group-based narration overrides (custom messages based on access group)
5. Audit trail for custom group changes
6. Web UI for group management (alternative to command interface)
