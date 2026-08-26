# Release System: Implementation vs Design Analysis

## Critical Issues Found

### Issue 1: ❌ Stage Order is Wrong

**Design Says:**

- Stage 0: Capture location
- Stage 1: Announce
- **Stage 4: Teleport to punishment room FIRST**
- Wait 250ms
- **Stage 2: Free from confinement** (now in isolated room)
- Stage 3: Strip
- Stage 5: Nudity check
- Stage 6: Access code
- Stage 7: Parole enforcement

**Implementation Actually Does:**

- Stage 0: Capture location
- Stage 1: Announce
- Stage 2: Free from confinement (at current location!)
- Stage 3: Strip (at current location!)
- **Stage 4: Teleport to punishment room** (happens last)
- Stage 5: Nudity check
- Stage 6: Access code
- Stage 7: Clear parole immediately

**Impact:** Character is freed and stripped at their current location BEFORE teleport. This defeats the purpose of isolating them in the punishment room from the start.

**Code Location:** [bin/games/veratown/veratownReleaseSystem.ts](bin/games/veratown/veratownReleaseSystem.ts#L207-L400)

---

### Issue 2: ❌ Parole is Cleared Immediately (Should Last 10 Minutes)

**Design Says:**

- Stage 5: Nudity confirmed, parole timer STARTS (10 minutes from now)
- Stage 6: Give access code (parole still active)
- Stage 7: ONGOING ENFORCEMENT - Monitor for 10 minutes
    - Watch for clothing additions
    - Final check at 10-minute expiration
    - Only clear parole if character remained fully naked entire time

**Implementation Actually Does:**

```typescript
// Stage 6 in code
const granted = await this.grantDoorAccess(character);
if (!granted) {
    this.whisper(character, "Door access could not be granted...");
}

// Clear parole on successful escape (IMMEDIATELY!)
if (this.characterProfileStore) {
    await this.characterProfileStore.clearReleaseParole(character.MemberNumber);
    this.paroleMetadata.delete(character.MemberNumber);
    this.paroleAppearanceTracking.delete(character.MemberNumber);
}
```

The parole is cleared right after giving the door code (Stage 6), not after 10 minutes.

**Impact:** Parole enforcement is completely disabled. Character can immediately re-clothe after leaving the punishment room without penalty.

**Code Location:** [bin/games/veratown/veratownReleaseSystem.ts](bin/games/veratown/veratownReleaseSystem.ts#L360-L375)

---

### Issue 3: ❌ Nudity Detection Instability

**Production Log Evidence:**

```
2026-08-26T11:57:30.381 - Stage 5: Checking for nudity STARTS
2026-08-26T11:57:32.896 - Check #1: "NOT NAKED: Found clothing MaidOutfit1 in group Cloth"
2026-08-26T11:57:35.395 - Check #2: "NOT NAKED: Found clothing MaidOutfit1 in group Cloth"
2026-08-26T11:57:37.897 - Check #3: "NOT NAKED: Found clothing MaidOutfit1 in group Cloth"
2026-08-26T11:57:40.398 - Check #4: "NOT NAKED: Found clothing MaidOutfit1 in group Cloth"
```

The character has MaidOutfit1 equipped in ALL checks 2.5 seconds apart.

**Problem:** User reports "Lara stripped at the 20 second mark but that was not processed"

- At 11:57:40 (10 seconds into checks), MaidOutfit1 was still present
- At 11:57:50 (20 seconds into stage start), next check would be running
- If character stripped at 20s mark, the NEXT check should detect it
- But we don't see that detection in logs

**Possible Causes:**

1. **Appearance cache not truly refreshing** - `MakeAppearanceBundle()` + `getAppearanceData()` may still be stale
2. **API latency** - When character strips, the change takes time to sync to bot's view
3. **Polling interval too long** - 2.5 second checks miss mid-interval clothing changes
4. **Character data fetch is behind** - The bot isn't getting real-time updates

**Code Location:** [bin/games/veratown/veratownReleaseSystem.ts](bin/games/veratown/veratownReleaseSystem.ts#L673-L760)

---

## Implementation Checklist vs Design

| Feature                               | Designed | Implemented               | Status        |
| ------------------------------------- | -------- | ------------------------- | ------------- |
| **Stage 4 Before Stage 2**            | ✅ Yes   | ❌ No                     | **NOT DONE**  |
| **250ms Wait After Teleport**         | ✅ Yes   | ❌ No                     | **NOT DONE**  |
| **Stage 6b: Parole Notification**     | ✅ Yes   | ❌ No                     | **NOT DONE**  |
| **10-Min Parole Duration**            | ✅ Yes   | ❌ Cleared immediately    | **NOT DONE**  |
| **Event-Driven Monitoring**           | ✅ Yes   | ❌ Using interval polling | **PARTIALLY** |
| **Restart from Stage 2 on Violation** | ✅ Yes   | ❌ No restart logic       | **NOT DONE**  |
| **Final Check at Expiration**         | ✅ Yes   | ❌ No expiration check    | **NOT DONE**  |

---

## Why Nudity Detection is Failing

Given the logs, there are two probable scenarios:

### Scenario A: Character Never Actually Stripped

- Parole metadata was updated AFTER Stage 5 started (at line 339-350)
- The update used `character.Appearance.getAppearanceData()` which may have already cached the clothed state
- Character doesn't actually see the update to strip or sees it too late
- Each subsequent check still shows the outfit because it was never removed

### Scenario B: Appearance Update is Delayed

- Character's client strips the clothing
- But the bot's view of the character hasn't updated yet
- BC library's appearance API is returning cached/stale data
- Even with `MakeAppearanceBundle()`, the underlying data hasn't refreshed from server

---

## Recommended Fixes (Priority Order)

### 1. **CRITICAL: Reorder Stages**

Move Stage 4 (Teleport) to execute BEFORE Stage 2 (Free Confinement)

- Character isolated in punishment room immediately
- Cannot escape/hide while stripping
- All subsequent stages happen in isolated environment

### 2. **CRITICAL: Implement 10-Minute Parole Duration**

- Don't clear parole in Stage 6
- Start parole timer when Stage 5 succeeds (nudity confirmed)
- Set expiration timeout for 10 minutes
- Monitor continuously until expiration
- Only clear when timer expires AND character still naked

### 3. **CRITICAL: Fix Nudity Detection**

- Increase check frequency from every 2.5s to every 1s (faster detection)
- Add additional validation: ask character to confirm they're naked
- Consider polling BC's API with explicit cache bypass flags
- Log character's appearance state changes, not just clothing items

### 4. **Implement Event-Driven Parole Violations**

- Hook character update/movement events
- Check clothing state on EVERY event, not just timed intervals
- Immediate violation detection (subsecond vs 2.5 second delay)

### 5. **Add Parole Notification (Stage 6b)**

- When character leaves room after Stage 6
- Send: "You are now on parole! You are NOT allowed to wear ANY clothing. Parole expires in 10 minutes."
- Clear messaging of restrictions

---

## Code Changes Needed

### Change 1: Reorder Stages in performRelease()

Move lines 277-300 (Stage 4 teleport) to execute between lines 239-241 (after Stage 1, before Stage 2)

### Change 2: Remove Immediate Parole Clear

Delete lines 360-368 (the clearReleaseParole call in Stage 6)

### Change 3: Implement Parole Monitoring

Create new function `monitorParoleExpiration()` that:

- Waits for 10-minute duration
- Checks clothing state periodically
- Clears parole only at end if character still naked
- Handles violations by restarting from Stage 2

### Change 4: Hook Character Updates

Add listener for character position/appearance changes during parole

- Trigger immediate violation check
- Don't wait for 2.5s polling interval

---

## Testing Recommendations

1. **Test Stage 4 Reordering:**
    - Verify character teleports before being freed from confinement
    - Verify they can't escape or move during strip phase

2. **Test Nudity Detection:**
    - Have character strip immediately in punishment room
    - Verify detection within 1-2 seconds (not 2.5s delay)
    - Log each appearance state change

3. **Test Parole Duration:**
    - Complete release successfully
    - Immediately try to re-clothe → should violate parole
    - Verify restart from Stage 2
    - Verify re-equipping of bondage
    - Verify 10-minute timer resets

4. **Test Parole Completion:**
    - Complete release successfully
    - Stay naked for 10 minutes
    - Verify parole state clears after 10 minutes
    - Verify character can re-clothe without violation

5. **Test Cross-Room Parole:**
    - Complete release successfully
    - Leave room and re-enter during parole
    - Verify violations still enforced across room boundaries
