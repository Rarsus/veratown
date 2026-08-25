#!/bin/bash

# Apply Female3DCG.js export fixes
# Adds ES module exports to constants/variables needed by TypeScript codebase
# These fixes must be re-applied after syncing from BC repository

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROPEYBOT_ROOT="$(dirname "$SCRIPT_DIR")"
FEMALE3DCG_FILE="$ROPEYBOT_ROOT/src/bcdata/Female3DCG.js"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [[ ! -f "$FEMALE3DCG_FILE" ]]; then
    echo -e "${RED}❌ Error: Female3DCG.js not found at $FEMALE3DCG_FILE${NC}"
    exit 1
fi

echo -e "${BLUE}🔧 Applying Female3DCG.js export fixes...${NC}"
echo ""

# Create backup
BACKUP_FILE="${FEMALE3DCG_FILE}.pre-fixes-$(date +%s).bak"
cp "$FEMALE3DCG_FILE" "$BACKUP_FILE"
echo -e "${YELLOW}✓ Backup created: ${BACKUP_FILE##*/}${NC}"

# Track changes
CHANGES=0

# Fix 1: AssetUpperOverflowAlpha
if grep -q "^const AssetUpperOverflowAlpha" "$FEMALE3DCG_FILE"; then
    sed -i.tmp 's/^const AssetUpperOverflowAlpha/export const AssetUpperOverflowAlpha/' "$FEMALE3DCG_FILE"
    echo -e "${GREEN}✓ Export added: AssetUpperOverflowAlpha${NC}"
    ((CHANGES++))
elif grep -q "^export const AssetUpperOverflowAlpha" "$FEMALE3DCG_FILE"; then
    echo -e "${YELLOW}  Already exported: AssetUpperOverflowAlpha${NC}"
fi

# Fix 2: AssetLowerOverflowAlpha
if grep -q "^const AssetLowerOverflowAlpha" "$FEMALE3DCG_FILE"; then
    sed -i.tmp 's/^const AssetLowerOverflowAlpha/export const AssetLowerOverflowAlpha/' "$FEMALE3DCG_FILE"
    echo -e "${GREEN}✓ Export added: AssetLowerOverflowAlpha${NC}"
    ((CHANGES++))
elif grep -q "^export const AssetLowerOverflowAlpha" "$FEMALE3DCG_FILE"; then
    echo -e "${YELLOW}  Already exported: AssetLowerOverflowAlpha${NC}"
fi

# Fix 3: PoseType constant (check if it exists at all)
if ! grep -q "export const PoseType" "$FEMALE3DCG_FILE"; then
    if ! grep -q "const PoseType" "$FEMALE3DCG_FILE"; then
        # Need to add PoseType and related constants before E namespace
        # Find the line number of "const E = "
        E_LINE=$(grep -n "^const E = " "$FEMALE3DCG_FILE" | cut -d: -f1)
        if [[ -n "$E_LINE" ]]; then
            # Insert PoseType constants before E
            sed -i.tmp "${E_LINE}i\\
\\
/**\\
 * Pose type constants for PoseMapping\\
 * @type {Record<string, string>}\\
 */\\
export const PoseType = {\\
	HIDE: \"Hide\",\\
	DEFAULT: \"\",\\
};\\
\\
/** @type readonly (\"Kneel\" | \"KneelingSpread\")[] */\\
export const PoseAllKneeling = Object.freeze([\"Kneel\", \"KneelingSpread\"]);\\
\\
/** @type readonly (\"BaseLower\" | \"LegsClosed\" | \"Spread\")[] */\\
export const PoseAllStanding = Object.freeze([\"BaseLower\", \"LegsClosed\", \"Spread\"]);\\
" "$FEMALE3DCG_FILE"
            echo -e "${GREEN}✓ Added: PoseType, PoseAllKneeling, PoseAllStanding constants${NC}"
            ((CHANGES++))
        fi
    fi
fi

# Fix 4: Effects namespace (E)
if grep -q "^const E = " "$FEMALE3DCG_FILE"; then
    sed -i.tmp 's/^const E = /export const E = /' "$FEMALE3DCG_FILE"
    echo -e "${GREEN}✓ Export added: E (effects namespace)${NC}"
    ((CHANGES++))
elif grep -q "^export const E = " "$FEMALE3DCG_FILE"; then
    echo -e "${YELLOW}  Already exported: E${NC}"
fi

# Fix 5: AssetPoseMapping
if grep -q "^const AssetPoseMapping = " "$FEMALE3DCG_FILE"; then
    sed -i.tmp 's/^const AssetPoseMapping = /export const AssetPoseMapping = /' "$FEMALE3DCG_FILE"
    echo -e "${GREEN}✓ Export added: AssetPoseMapping${NC}"
    ((CHANGES++))
elif grep -q "^export const AssetPoseMapping = " "$FEMALE3DCG_FILE"; then
    echo -e "${YELLOW}  Already exported: AssetPoseMapping${NC}"
fi

# Fix 6: AssetFemale3DCG
if grep -q "^var AssetFemale3DCG = " "$FEMALE3DCG_FILE"; then
    sed -i.tmp 's/^var AssetFemale3DCG = /export var AssetFemale3DCG = /' "$FEMALE3DCG_FILE"
    echo -e "${GREEN}✓ Export added: AssetFemale3DCG${NC}"
    ((CHANGES++))
elif grep -q "^export var AssetFemale3DCG = " "$FEMALE3DCG_FILE"; then
    echo -e "${YELLOW}  Already exported: AssetFemale3DCG${NC}"
fi

# Fix 7: PoseFemale3DCG
if grep -q "^var PoseFemale3DCG = " "$FEMALE3DCG_FILE"; then
    sed -i.tmp 's/^var PoseFemale3DCG = /export var PoseFemale3DCG = /' "$FEMALE3DCG_FILE"
    echo -e "${GREEN}✓ Export added: PoseFemale3DCG${NC}"
    ((CHANGES++))
elif grep -q "^export var PoseFemale3DCG = " "$FEMALE3DCG_FILE"; then
    echo -e "${YELLOW}  Already exported: PoseFemale3DCG${NC}"
fi

# Fix 8: PoseFemale3DCGNames
if grep -q "^var PoseFemale3DCGNames = " "$FEMALE3DCG_FILE"; then
    sed -i.tmp 's/^var PoseFemale3DCGNames = /export var PoseFemale3DCGNames = /' "$FEMALE3DCG_FILE"
    echo -e "${GREEN}✓ Export added: PoseFemale3DCGNames${NC}"
    ((CHANGES++))
elif grep -q "^export var PoseFemale3DCGNames = " "$FEMALE3DCG_FILE"; then
    echo -e "${YELLOW}  Already exported: PoseFemale3DCGNames${NC}"
fi

# Fix 9: ActivityFemale3DCG
if grep -q "^var ActivityFemale3DCG = " "$FEMALE3DCG_FILE"; then
    sed -i.tmp 's/^var ActivityFemale3DCG = /export var ActivityFemale3DCG = /' "$FEMALE3DCG_FILE"
    echo -e "${GREEN}✓ Export added: ActivityFemale3DCG${NC}"
    ((CHANGES++))
elif grep -q "^export var ActivityFemale3DCG = " "$FEMALE3DCG_FILE"; then
    echo -e "${YELLOW}  Already exported: ActivityFemale3DCG${NC}"
fi

# Fix 10: ActivityFemale3DCGOrdering
if grep -q "^let ActivityFemale3DCGOrdering = " "$FEMALE3DCG_FILE"; then
    sed -i.tmp 's/^let ActivityFemale3DCGOrdering = /export let ActivityFemale3DCGOrdering = /' "$FEMALE3DCG_FILE"
    echo -e "${GREEN}✓ Export added: ActivityFemale3DCGOrdering${NC}"
    ((CHANGES++))
elif grep -q "^export let ActivityFemale3DCGOrdering = " "$FEMALE3DCG_FILE"; then
    echo -e "${YELLOW}  Already exported: ActivityFemale3DCGOrdering${NC}"
fi

# Fix 11: FetishFemale3DCG
if grep -q "^var FetishFemale3DCG = " "$FEMALE3DCG_FILE"; then
    sed -i.tmp 's/^var FetishFemale3DCG = /export var FetishFemale3DCG = /' "$FEMALE3DCG_FILE"
    echo -e "${GREEN}✓ Export added: FetishFemale3DCG${NC}"
    ((CHANGES++))
elif grep -q "^export var FetishFemale3DCG = " "$FEMALE3DCG_FILE"; then
    echo -e "${YELLOW}  Already exported: FetishFemale3DCG${NC}"
fi

# Fix 12: FetishFemale3DCGNames
if grep -q "^const FetishFemale3DCGNames = " "$FEMALE3DCG_FILE"; then
    sed -i.tmp 's/^const FetishFemale3DCGNames = /export const FetishFemale3DCGNames = /' "$FEMALE3DCG_FILE"
    echo -e "${GREEN}✓ Export added: FetishFemale3DCGNames${NC}"
    ((CHANGES++))
elif grep -q "^export const FetishFemale3DCGNames = " "$FEMALE3DCG_FILE"; then
    echo -e "${YELLOW}  Already exported: FetishFemale3DCGNames${NC}"
fi

# Clean up sed temporary files
rm -f "${FEMALE3DCG_FILE}.tmp"

echo ""
if [[ $CHANGES -gt 0 ]]; then
    echo -e "${GREEN}✅ Applied $CHANGES export fixes${NC}"
    echo ""
    echo "Verifying exports are present..."
    
    MISSING=0
    for export in "AssetUpperOverflowAlpha" "AssetLowerOverflowAlpha" "PoseType" "E" "AssetPoseMapping" "AssetFemale3DCG" "PoseFemale3DCG" "PoseFemale3DCGNames" "ActivityFemale3DCG" "ActivityFemale3DCGOrdering" "FetishFemale3DCG" "FetishFemale3DCGNames"; do
        if grep -q "^export.*$export" "$FEMALE3DCG_FILE"; then
            echo -e "${GREEN}  ✓ $export${NC}"
        else
            echo -e "${RED}  ✗ $export (MISSING)${NC}"
            ((MISSING++))
        fi
    done
    
    if [[ $MISSING -eq 0 ]]; then
        echo ""
        echo -e "${GREEN}✅ All exports verified!${NC}"
        echo ""
        echo "Next: Run 'pnpm build' to verify TypeScript compilation"
    else
        echo ""
        echo -e "${RED}❌ $MISSING exports are still missing!${NC}"
        echo "Restoring from backup..."
        cp "$BACKUP_FILE" "$FEMALE3DCG_FILE"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  No changes needed - all exports already present${NC}"
fi
