#!/bin/bash

# TypeScript Strict Mode Migration Helper
# This script helps track progress and categorize TypeScript errors

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Command dispatch
case "${1:-report}" in
    report)
        echo -e "${BLUE}=== TypeScript Strict Mode Migration Report ===${NC}"
        echo ""
        
        # Total error count
        TOTAL_ERRORS=$(npx tsc --noEmit 2>&1 | grep -c "error TS" || true)
        echo -e "${YELLOW}Total Type Errors: ${RED}${TOTAL_ERRORS}${NC}"
        echo ""
        
        # Error distribution by code
        echo -e "${YELLOW}Error Distribution by Code:${NC}"
        npx tsc --noEmit 2>&1 | grep "error TS" | sed 's/.*error TS//' | cut -d: -f1 | sort | uniq -c | sort -rn | head -15 | awk '{
            code=$2
            count=$1
            if (count > 100) color="\033[0;31m"      # Red for >100
            else if (count > 50) color="\033[1;33m"  # Yellow for >50
            else if (count > 20) color="\033[0;34m"  # Blue for >20
            else color="\033[0;32m"                   # Green for <20
            printf "  %s%4d%s errors TS%s\n", color, count, "\033[0m", code
        }'
        echo ""
        
        # Top files by error count
        echo -e "${YELLOW}Top 15 Files by Error Count:${NC}"
        npx tsc --noEmit 2>&1 | grep "error TS" | cut -d'(' -f1 | sort | uniq -c | sort -rn | head -15 | awk '{
            count=$1
            file=$2
            if (count > 50) color="\033[0;31m"      # Red for >50
            else if (count > 20) color="\033[1;33m" # Yellow for >20
            else color="\033[0;34m"                  # Blue
            printf "  %s%3d%s %s\n", color, count, "\033[0m", file
        }'
        echo ""
        ;;
        
    file)
        if [ -z "$2" ]; then
            echo "Usage: $0 file <file-path>"
            echo "Example: $0 file bin/games/casino/blackjack.ts"
            exit 1
        fi
        
        FILE_ERRORS=$(npx tsc --noEmit 2>&1 | grep "error TS" | grep "^${2}" | wc -l || true)
        echo -e "${BLUE}=== Errors in ${2} ===${NC}"
        echo -e "${YELLOW}Total Errors: ${RED}${FILE_ERRORS}${NC}"
        echo ""
        echo "Errors by type:"
        npx tsc --noEmit 2>&1 | grep "^${2}.*error TS" | sed 's/.*error TS/TS/' | cut -d: -f1 | sort | uniq -c | sort -rn
        echo ""
        echo "First 10 errors:"
        npx tsc --noEmit 2>&1 | grep "^${2}.*error TS" | head -10
        ;;
        
    check)
        if [ -z "$2" ]; then
            echo "Usage: $0 check <file-path>"
            echo "Example: $0 check bin/games/casino/blackjack.ts"
            exit 1
        fi
        
        ERRORS=$(npx tsc --noEmit 2>&1 | grep "^${2}.*error TS" | wc -l || true)
        if [ "$ERRORS" -eq 0 ]; then
            echo -e "${GREEN}✅ ${2} is error-free!${NC}"
            exit 0
        else
            echo -e "${RED}❌ ${2} has ${ERRORS} errors${NC}"
            exit 1
        fi
        ;;
        
    category)
        if [ -z "$2" ]; then
            echo "Usage: $0 category <category-folder>"
            echo "Example: $0 category bin/games/casino"
            exit 1
        fi
        
        echo -e "${BLUE}=== Errors in Category: ${2} ===${NC}"
        ERRORS=$(npx tsc --noEmit 2>&1 | grep "error TS" | grep "^${2}" | wc -l || true)
        echo -e "${YELLOW}Total Errors: ${RED}${ERRORS}${NC}"
        echo ""
        
        # Files in category
        echo -e "${YELLOW}Files in this category:${NC}"
        npx tsc --noEmit 2>&1 | grep "^${2}.*error TS" | cut -d'(' -f1 | sort -u | while read file; do
            count=$(npx tsc --noEmit 2>&1 | grep "^${file}" | wc -l || true)
            printf "  %3d errors  %s\n" "$count" "$file"
        done | sort -rn
        ;;
        
    trend)
        echo -e "${BLUE}=== Tracking Progress ===${NC}"
        
        # Get current count
        CURRENT=$(npx tsc --noEmit 2>&1 | grep -c "error TS" || true)
        
        # Try to find baseline file
        BASELINE_FILE="docs/TYPESCRIPT_MIGRATION_PROGRESS.md"
        if [ -f "$BASELINE_FILE" ]; then
            # Extract baseline from markdown
            BASELINE=$(grep "Starting baseline.*: " "$BASELINE_FILE" | grep -o "[0-9]*" | head -1)
            if [ ! -z "$BASELINE" ]; then
                FIXED=$((BASELINE - CURRENT))
                REMAINING=$((CURRENT))
                PROGRESS=$(awk "BEGIN {printf \"%.1f\", ($FIXED / ($BASELINE + 304)) * 100}")
                
                echo -e "${YELLOW}Starting baseline: ${BASELINE}${NC}"
                echo -e "${YELLOW}Current total: ${CURRENT}${NC}"
                echo -e "${GREEN}Errors fixed: ${FIXED}${NC}"
                echo -e "${RED}Errors remaining: ${REMAINING}${NC}"
                echo -e "${BLUE}Progress: ${PROGRESS}%${NC}"
                echo ""
            fi
        fi
        
        echo "Track your progress with: git commit -m \"docs: TypeScript migration progress - X errors fixed\""
        ;;
        
    help|--help|-h)
        echo -e "${BLUE}TypeScript Strict Mode Migration Helper${NC}"
        echo ""
        echo "Usage: $0 <command> [args]"
        echo ""
        echo "Commands:"
        echo "  report                      Show overall migration report"
        echo "  file <path>                 Check errors in specific file"
        echo "  check <path>                Verify file is error-free"
        echo "  category <folder>           Show all errors in a folder"
        echo "  trend                       Track progress vs baseline"
        echo "  help                        Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 report"
        echo "  $0 file bin/games/casino/blackjack.ts"
        echo "  $0 category bin/games/casino"
        echo "  $0 trend"
        ;;
        
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac
