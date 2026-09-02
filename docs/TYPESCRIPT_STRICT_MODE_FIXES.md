# TypeScript Strict Mode: Common Fixes Guide

This guide provides patterns and solutions for the most common TypeScript strict mode errors found in the Ropeybot codebase.

## Error Classification & Fix Patterns

### 1. TS2345: Argument not assignable to parameter (112 errors)

**Error Message**:

```
error TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'
```

**Common Causes**:

- Passing `null | undefined` where type doesn't allow
- Array element types don't match
- Object structure mismatch
- Function callback signature mismatch

**Fix Pattern A: Add Type Assertion**

```typescript
// ❌ Error
function process(item: Item) {}
const nullable: Item | null = getItem();
process(nullable); // TS2345

// ✅ Fix (if you know it's not null)
if (nullable) {
    process(nullable);
}
```

**Fix Pattern B: Type the function parameter**

```typescript
// ❌ Error
function handler(sender, msg, args) {
    // implicit any
}

// ✅ Fix
function handler(sender: API_Connector, msg: string, args: string[]) {
    // properly typed
}
```

**Fix Pattern C: Use Optional Type**

```typescript
// ❌ Error
function process(items: Item[]) {}
const maybeItems: Item[] | undefined = getItems();
process(maybeItems); // TS2345

// ✅ Fix
function process(items?: Item[]) {}
process(maybeItems); // Now OK
```

---

### 2. TS18048: Variable possibly undefined (107 errors)

**Error Message**:

```
error TS18048: 'x' is possibly 'undefined'
```

**Common Causes**:

- Using result of optional function
- Array element without bounds check
- Object property that might not exist

**Fix Pattern A: Null Check**

```typescript
// ❌ Error
const hand = getHand();
const card = hand[0]; // TS18048 - hand might be undefined

// ✅ Fix
const hand = getHand();
if (hand && hand.length > 0) {
    const card = hand[0];
}
```

**Fix Pattern B: Optional Chaining**

```typescript
// ❌ Error
const value = data.nested.property.value;

// ✅ Fix
const value = data?.nested?.property?.value;
```

**Fix Pattern C: Non-null Assertion (use with caution)**

```typescript
// ❌ Error (risky)
const hand = getHand()!; // Forces non-null
const card = hand[0]; // Could still error at runtime

// ✅ Better: Validate before using
const hand = getHand();
if (!hand) throw new Error("Hand not found");
const card = hand[0]; // Now safe
```

**Fix Pattern D: Provide Default Value**

```typescript
// ❌ Error
const name: string = getData().name; // might be undefined

// ✅ Fix
const name: string = getData()?.name ?? "Unknown";
```

---

### 3. TS2532: Object possibly undefined (87 errors)

**Error Message**:

```
error TS2532: Object is possibly 'undefined'
```

**Common Causes**:

- Method call on possibly undefined object
- Property access on optional return value
- Array method on potentially undefined array

**Fix Pattern A: Add Type Guard**

```typescript
// ❌ Error
function process(obj: Item | undefined) {
    const value = obj.property; // TS2532
}

// ✅ Fix
function process(obj: Item | undefined) {
    if (!obj) return;
    const value = obj.property; // Now safe
}
```

**Fix Pattern B: Use Optional Chaining**

```typescript
// ❌ Error
const result = this.commandParser.parse(msg); // commandParser might be undefined

// ✅ Fix
const result = this.commandParser?.parse(msg);
```

**Fix Pattern C: Create Helper Method**

```typescript
// ❌ Error - repeated checks
if (player) player.level++;
if (player) player.exp += 10;
if (player) player.update();

// ✅ Fix - extract into method
function updatePlayer(player: Player | undefined) {
    if (!player) return;
    player.level++;
    player.exp += 10;
    player.update();
}
updatePlayer(maybePlayer);
```

---

### 4. TS2304: Cannot find name (57 errors)

**Error Message**:

```
error TS2304: Cannot find name 'SomeName'
```

**Common Causes**:

- Missing import statement
- Typo in class/interface name
- Type not exported from module
- BC stubs not properly referenced

**Fix Pattern A: Add Missing Import**

```typescript
// ❌ Error
const parser = new CommandParser(); // TS2304

// ✅ Fix - import first
import { CommandParser } from "@bc/common";
const parser = new CommandParser();
```

**Fix Pattern B: Create Missing Type**

```typescript
// ❌ Error
interface SomeType {
    value: UnknownType; // TS2304
}

// ✅ Fix - define the type
type UnknownType = string | number;
interface SomeType {
    value: UnknownType;
}
```

**Fix Pattern C: Use Namespace for BC Stubs**

```typescript
// ❌ Error (if type not found)
const appearance: API_AppearanceItem = { ... };

// ✅ Fix - check BC stubs are in tsconfig includes
// In tsconfig.json:
{
    "include": [
        "node_modules/bc-stubs/bc/**/*.d.ts",
        "bin/**/*"
    ]
}
```

---

### 5. TS2339: Property doesn't exist (56 errors)

**Error Message**:

```
error TS2339: Property 'propName' does not exist on type 'Type'
```

**Common Causes**:

- Typo in property name
- Accessing private property
- Property not defined in interface
- Object structure changed

**Fix Pattern A: Fix Property Name**

```typescript
// ❌ Error
const player = { name: "Alice", experience: 100 };
const exp = player.exp; // TS2339

// ✅ Fix
const exp = player.experience;
```

**Fix Pattern B: Extend Interface**

```typescript
// ❌ Error
interface Player {
    name: string;
}
function updateExp(p: Player) {
    p.exp = 100; // TS2339
}

// ✅ Fix
interface Player {
    name: string;
    exp: number; // Add missing property
}
function updateExp(p: Player) {
    p.exp = 100;
}
```

**Fix Pattern C: Use Type Assertion for Dynamic Properties**

```typescript
// ❌ Error
const config: any = JSON.parse(str);
const timeout = config.connectionTimeout; // Should be more typed

// ✅ Fix
interface Config {
    connectionTimeout?: number;
}
const config: Config = JSON.parse(str);
const timeout = config.connectionTimeout ?? 5000;
```

---

### 6. TS7006: Parameter implicitly has 'any' type (18 errors)

**Error Message**:

```
error TS7006: Parameter 'paramName' implicitly has an 'any' type
```

**Common Causes**:

- Function parameter without type annotation
- Callback function parameter not typed
- Destructured parameter without type

**Fix Pattern A: Add Type Annotation**

```typescript
// ❌ Error
function handler(sender, msg, args) {
    // All implicit any
}

// ✅ Fix
function handler(sender: API_Connector, msg: string, args: string[]) {
    // All properly typed
}
```

**Fix Pattern B: Type Array Elements**

```typescript
// ❌ Error
items.forEach((item) => {
    console.log(item.name); // TS7006 - item is implicitly any
});

// ✅ Fix
items.forEach((item: Item) => {
    console.log(item.name);
});

// Or use type inference
const items: Item[] = [...];
items.forEach((item) => {
    // item is inferred as Item
    console.log(item.name);
});
```

**Fix Pattern C: Callback Types**

```typescript
// ❌ Error
function doSomething(callback) {
    // callback is any
    callback(result);
}

// ✅ Fix
function doSomething(callback: (result: Result) => void) {
    callback(result);
}
```

---

### 7. TS2322: Type not assignable (44 errors)

**Error Message**:

```
error TS2322: Type 'X' is not assignable to type 'Y'
```

**Common Causes**:

- Assigning wrong type to variable
- Return type mismatch
- Object structure incompatibility

**Fix Pattern A: Fix Type Annotation**

```typescript
// ❌ Error
const count: string = 42; // TS2322

// ✅ Fix
const count: number = 42;
```

**Fix Pattern B: Handle Optional Values**

```typescript
// ❌ Error
function getName(person: Person): string {
    return person.name; // person.name might be undefined
}

// ✅ Fix
function getName(person: Person): string | undefined {
    return person.name;
}

// Or with default
function getName(person: Person): string {
    return person.name ?? "Unknown";
}
```

**Fix Pattern C: Use Union Types**

```typescript
// ❌ Error
let value: string = getConfig().timeout; // might be number

// ✅ Fix
let value: string | number = getConfig().timeout;
// Or narrow it
const timeout = getConfig().timeout;
const timeoutStr = typeof timeout === "number" ? String(timeout) : timeout;
```

---

## Systematic Fix Approach

### Step 1: Prioritize by Impact

1. Fix TS5097 (Configuration) ✅ DONE - Eliminated 40 errors
2. Fix high-frequency errors (TS2345, TS18048, TS2532)
3. Fix module/import issues (TS2304, TS2307)
4. Fix type definition issues (TS7006, TS2322, TS2339)

### Step 2: Fix by Category

- **Tests**: May need `// @ts-expect-error` or type stubs
- **API Layer**: Focus on BC stubs type definitions
- **Game Logic**: Add type annotations systematically
- **Utilities**: Ensure all functions are properly typed

### Step 3: Automate Where Possible

Use this script to find and fix common patterns:

```bash
# Find all implicit any parameters
grep -r "function.*(\w\+," bin --include="*.ts" | grep -v ": "

# Find all unsafe object access
grep -r "\.\w\+\." bin --include="*.ts" | head -20

# Check migration progress
bash scripts/typescript-migration.sh report
```

### Step 4: Validate Fixes

```bash
# Check specific file is clean
bash scripts/typescript-migration.sh check bin/games/casino/blackjack.ts

# See before/after
bash scripts/typescript-migration.sh trend
```

---

## Real-World Examples

### Example 1: Casino Blackjack Error (TS2345)

**Original Code** (line 215):

```typescript
let appearance: API_AppearanceItem = getAppearance(); // might return null
```

**Error**:

```
Type 'API_AppearanceItem | null' is not assignable to type 'API_AppearanceItem'
```

**Fix**:

```typescript
let appearance: API_AppearanceItem | null = getAppearance();
if (!appearance) {
    throw new Error("Appearance not found");
}
```

---

### Example 2: Admin Logic Error (TS2532)

**Original Code**:

```typescript
function addCommand(name: string) {
    this.commandParser.add(name); // commandParser might be undefined
}
```

**Error**:

```
Object is possibly 'undefined'
```

**Fix**:

```typescript
function addCommand(name: string) {
    if (!this.commandParser) {
        throw new Error("Command parser not initialized");
    }
    this.commandParser.add(name);
}

// Or use guard in calling code
function addCommand(name: string) {
    if (this.commandParser) {
        this.commandParser.add(name);
    }
}
```

---

## Testing Your Fixes

After making changes, verify with:

```bash
# Full type check
npx tsc --noEmit

# Check specific file
npx tsc --noEmit bin/games/casino/blackjack.ts

# Run test suite to ensure no runtime issues
pnpm test

# Migration progress
bash scripts/typescript-migration.sh report
```

---

## Resources

- [TypeScript Handbook: Type Checking](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [TypeScript Handbook: Union Types](https://www.typescriptlang.org/docs/handbook/unions-and-intersections.html)
- [TypeScript Strict Mode Guide](https://www.typescriptlang.org/tsconfig#strict)

---

**Last Updated**: 2026-09-02
**Phase**: 1A Core, 1B High-Priority Files
