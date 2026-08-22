# BC-Stubs R131 Migration Plan

## Executive Summary

Migrating ropeybot from bc-stubs R130 to R131 requires updating package.json, tsconfig.json, and potentially handling some type definition reorganizations. R131 moved core type files into subdirectories but maintained backward compatibility for the most part.

## Key Changes in R131

### 1. Type File Reorganization

**R130 Structure:**

```
node_modules/bc-stubs/bc/NativeDeclarations/
├── Typedef.d.ts (root level)
├── Messages.d.ts (root level)
├── Female3DCG_Types.d.ts
└── [other .d.ts files]
```

**R131 Structure:**

```
node_modules/bc-stubs/bc/NativeDeclarations/
├── Scripts/
│   ├── Typedef.d.ts (MOVED HERE)
│   ├── Messages.d.ts (MOVED HERE)
│   └── [other script types]
├── Screens/
│   └── [screen-specific types]
├── Assets/
│   └── [asset-specific types]
├── Female3DCG_Types.d.ts (still at root)
└── [other root-level .d.ts files]
```

### 2. Breaking Changes

- **Typedef.d.ts path changed**: `bc/NativeDeclarations/Typedef.d.ts` → `bc/NativeDeclarations/Scripts/Typedef.d.ts`
- **Messages.d.ts path changed**: `bc/NativeDeclarations/Messages.d.ts` → `bc/NativeDeclarations/Scripts/Messages.d.ts`
- **Female3DCG_Types.d.ts remains**: Still at `bc/NativeDeclarations/Female3DCG_Types.d.ts`

### 3. Current ropeybot Issues (R130)

**tsconfig.json includes these paths:**

```json
{
    "include": [
        "node_modules/bc-stubs/bc/NativeDeclarations/Typedef.d.ts",
        "node_modules/bc-stubs/bc/NativeDeclarations/Messages.d.ts",
        "node_modules/bc-stubs/bc/NativeDeclarations/Female3DCG_Types.d.ts",
        "bin/**/*"
    ]
}
```

These paths will FAIL in R131 because Typedef.d.ts and Messages.d.ts have moved.

## Migration Steps

### Phase 1: Preparation (No Risk)

**1.1 Identify all bc-stubs references**

```bash
grep -r "bc-stubs" . --include="*.json" --include="*.ts"
grep -r "node_modules/bc-stubs" . --include="*.json"
grep -r "Typedef\|Messages\|Female3DCG_Types" tsconfig.json
```

Current findings:

- `/home/olav/repo/ropeybot/package.json`: `"bc-stubs": "130.0.0"`
- `/home/olav/repo/ropeybot/src/package.json`: `"bc-stubs": "130.0.0"`
- `/home/olav/repo/ropeybot/tsconfig.json`: Includes specific .d.ts files from NativeDeclarations

**1.2 Check for direct imports from bc-stubs**

```bash
grep -r "from.*bc-stubs\|from.*bc-bot" bin/ src/ --include="*.ts"
```

Key imports to check:

- `import { API_Connector } from "bc-bot"` (likely still works)
- Custom type imports from bc-stubs types

### Phase 2: Update Configuration Files

**2.1 Update package.json files**

**File: `/home/olav/repo/ropeybot/package.json`**

```diff
- "bc-stubs": "130.0.0",
+ "bc-stubs": "131.0.0",
```

**File: `/home/olav/repo/ropeybot/src/package.json`**

```diff
- "bc-stubs": "130.0.0",
+ "bc-stubs": "131.0.0",
```

**2.2 Update tsconfig.json**

**File: `/home/olav/repo/ropeybot/tsconfig.json`**

```diff
  {
    "compilerOptions": {...},
    "include": [
-     "node_modules/bc-stubs/bc/NativeDeclarations/Typedef.d.ts",
-     "node_modules/bc-stubs/bc/NativeDeclarations/Messages.d.ts",
+     "node_modules/bc-stubs/bc/NativeDeclarations/Scripts/Typedef.d.ts",
+     "node_modules/bc-stubs/bc/NativeDeclarations/Scripts/Messages.d.ts",
      "node_modules/bc-stubs/bc/NativeDeclarations/Female3DCG_Types.d.ts",
      "bin/**/*"
    ]
  }
```

### Phase 3: Dependency Installation

**3.1 Update dependencies**

```bash
cd /home/olav/repo/ropeybot
pnpm install
# or
pnpm update bc-stubs
```

**3.2 Verify installation**

```bash
pnpm list bc-stubs
# Should show: bc-stubs@131.0.0
```

### Phase 4: Type Checking & Compilation

**4.1 Run TypeScript compiler**

```bash
cd /home/olav/repo/ropeybot
pnpm run types
```

**Expected issues to handle:**

- File not found errors if tsconfig paths are wrong
- Type definition incompatibilities
- New type definitions may have changed interfaces

**4.2 Address compilation errors**

If errors occur, categorize them:

1. **Path errors**: Update tsconfig.json paths
2. **Missing types**: Check if imports need adjustment
3. **Interface changes**: Update code to match new type definitions
4. **New dependencies**: Install missing type packages

### Phase 5: Runtime Testing

**5.1 Test bot functionality**

```bash
# Run bot with R131
pnpm run start
```

**5.2 Test key systems**

- [ ] Bot connection/authentication
- [ ] Chat message handling
- [ ] Map operations (tile triggers, character position)
- [ ] Appearance/item management
- [ ] Veratown systems (CatDogSystem, etc.)
- [ ] Game systems (Dare, Casino, etc.)

**5.3 Check for runtime issues**

- TypeScript type mismatches that compile but fail at runtime
- API changes in bc-stubs interface definitions
- Breaking changes in exported types

## Risk Assessment

### Low Risk

- ✅ File path changes (Typedef.d.ts, Messages.d.ts) - straightforward to fix in tsconfig.json
- ✅ Type reorganization - TypeScript handles transparently

### Medium Risk

- ⚠️ New type definitions may have interface changes
- ⚠️ New types may be stricter (e.g., nullable vs non-nullable)
- ⚠️ Removed/deprecated types that ropeybot depends on

### High Risk

- ❌ API changes in bc-bot package (socket.io communication changes)
- ❌ Breaking changes in ChatRoom/Character interfaces
- ❌ Changes to game message format or structure

## Rollback Plan

If R131 breaks the bot:

```bash
# Revert to R130
cd /home/olav/repo/ropeybot
pnpm install bc-stubs@130.0.0

# Revert tsconfig.json paths
# (see Git history)

pnpm run types
pnpm run start
```

## Timeline Estimate

- **Phase 1 (Preparation)**: 5-10 minutes
- **Phase 2 (Configuration)**: 5 minutes
- **Phase 3 (Installation)**: 5-10 minutes
- **Phase 4 (Compilation)**: 10-30 minutes (depends on errors)
- **Phase 5 (Testing)**: 15-30 minutes

**Total: 40-95 minutes** (majority dependent on finding/fixing compatibility issues)

## Success Criteria

✅ Migration complete when:

- [ ] TypeScript compiles with `pnpm run types` (no errors)
- [ ] Bot starts without connection errors
- [ ] All core systems function (chat, map, appearance, games)
- [ ] No runtime type errors in console
- [ ] Existing tests pass (if applicable)

## Additional Resources

- BC-Stubs Repository: https://github.com/bananarama92/BC-stubs
- R131 Release: https://github.com/bananarama92/BC-stubs/releases/tag/v131.0.0
- BC Source (GitLab): https://gitgud.io/BondageProjects/Bondage-College/-/tree/master/BondageClub
- BC Server: https://github.com/Ben987/Bondage-Club-Server

## Known Issues & Solutions

### Issue: "Cannot find module" for Typedef or Messages

**Cause**: tsconfig.json still points to old R130 paths
**Solution**: Update tsconfig.json to use `/Scripts/` subdirectory paths

### Issue: Type definition errors during compilation

**Cause**: R131 type definitions changed or stricter
**Solution**:

1. Check error message carefully
2. Look up the type in bc-stubs R131 definitions
3. Update code to match new interface
4. May need to cast to `any` temporarily (not recommended for production)

### Issue: Bot connection fails at runtime

**Cause**: API changes in bc-stubs socket.io handling
**Solution**:

1. Check bc-stubs R131 release notes
2. Compare API_Connector usage in ropeybot vs bc-stubs examples
3. May need to update connection initialization code

## Post-Migration Tasks

- [ ] Update CHANGELOG.md with R131 upgrade note
- [ ] Test on staging environment first
- [ ] Document any code changes made for R131 compatibility
- [ ] Consider updating docker container base image if bc-stubs has dependencies
- [ ] Plan future maintenance for R132 when released

## References

**Key Files to Modify:**

- `/home/olav/repo/ropeybot/package.json` - Update bc-stubs version
- `/home/olav/repo/ropeybot/src/package.json` - Update bc-stubs version
- `/home/olav/repo/ropeybot/tsconfig.json` - Update type file paths

**Related Documentation:**

- [CODEBASE_ANALYSIS.md](CODEBASE_ANALYSIS.md)
- [BUILD_SETUP.md](BUILD_SETUP.md)
