#!/bin/bash

# Sync BC Assets + Re-apply Export Fixes
# 
# This is the main sync workflow:
# 1. Backs up current Female3DCG files
# 2. Syncs latest from BC repository
# 3. Automatically re-applies export fixes
# 4. Verifies TypeScript compilation
#
# This ensures that custom exports and patches survive the sync operation.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROPEYBOT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  BC Assets Sync + Fix Re-application Workflow${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Step 1: Sync BC assets
echo -e "${CYAN}[1/3] Syncing BC repository assets...${NC}"
"$SCRIPT_DIR/sync-bc-assets.sh"

echo ""
echo -e "${CYAN}[2/3] Re-applying export fixes...${NC}"
"$SCRIPT_DIR/apply-female3dcg-fixes.sh"

echo ""
echo -e "${CYAN}[3/3] Verifying TypeScript compilation...${NC}"
cd "$ROPEYBOT_ROOT"

if npx tsc --noEmit 2>&1 | tee /tmp/tsc-check.log; then
    ERRORS=$(grep -c "error TS" /tmp/tsc-check.log || true)
    if [[ $ERRORS -eq 0 ]]; then
        echo -e "${GREEN}✅ TypeScript compilation: 0 errors${NC}"
    fi
else
    ERRORS=$(grep -c "error TS" /tmp/tsc-check.log || true)
    if [[ $ERRORS -gt 0 ]]; then
        echo -e "${RED}❌ TypeScript compilation failed with $ERRORS errors${NC}"
        echo ""
        echo "This may indicate:"
        echo "  1. Export fixes weren't properly applied"
        echo "  2. BC repository has breaking changes"
        echo "  3. Type definitions need updating"
        echo ""
        echo "Review:"
        echo "  - docs/FEMALE3DCG_FIXES.md"
        echo "  - git diff src/bcdata/"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Sync Complete with Fixes Applied${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Workflow complete! You can now:"
echo ""
echo "1. Review changes:"
echo "   cd $ROPEYBOT_ROOT"
echo "   git diff src/bcdata/"
echo ""
echo "2. Build the project:"
echo "   pnpm build"
echo ""
echo "3. Test the bot:"
echo "   docker-compose up"
echo ""
echo "For more details on what was fixed, see:"
echo "   docs/FEMALE3DCG_FIXES.md"
echo ""
