#!/bin/bash

# Pre-commit hook for Prettier formatting check
# Install: cp scripts/prettier-precommit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
# Remove: rm .git/hooks/pre-commit

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get staged files
STAGED_FILES=$(git diff --cached --name-only)

if [ -z "$STAGED_FILES" ]; then
    exit 0
fi

# Check if prettier is available
if ! command -v npx &> /dev/null; then
    echo -e "${YELLOW}⚠️  npx not found, skipping prettier check${NC}"
    exit 0
fi

# Files to check (exclude node_modules, .git, bcdata)
FILES_TO_CHECK=$(echo "$STAGED_FILES" | grep -E '\.(ts|tsx|js|jsx|json|md|yml|yaml)$' | grep -v -E '(node_modules|\.git|bcdata|pnpm-lock)' || true)

if [ -z "$FILES_TO_CHECK" ]; then
    exit 0
fi

# Run prettier check on staged files
PRETTIER_OUTPUT=$(npx prettier --check $FILES_TO_CHECK 2>&1 || true)

if echo "$PRETTIER_OUTPUT" | grep -q "Code style issues found"; then
    echo -e "${RED}❌ Prettier formatting check failed!${NC}"
    echo ""
    echo "The following files have formatting issues:"
    echo "$FILES_TO_CHECK" | while read file; do
        if ! npx prettier --check "$file" 2>&1 > /dev/null; then
            echo -e "${RED}  ✗ $file${NC}"
        fi
    done
    echo ""
    echo -e "${YELLOW}To fix automatically:${NC}"
    echo "  npx prettier --write $FILES_TO_CHECK"
    echo ""
    echo -e "${YELLOW}To skip this check:${NC}"
    echo "  git commit --no-verify"
    exit 1
else
    echo -e "${GREEN}✅ Prettier check passed${NC}"
    exit 0
fi
