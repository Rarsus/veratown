#!/bin/bash

# Sync Bondage Club asset files from local Bondage-College repository
# This script copies the latest Female3DCG files from your local BC repo
# to avoid re-downloading the entire repository

set -e

# Configuration
BC_REPO="${BC_REPO:-/home/olav/repo/Bondage-College}"
BC_ASSETS_DIR="$BC_REPO/BondageClub/Assets/Female3DCG"
ROPEYBOT_BCDATA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/bcdata"

# Verify source directory exists
if [[ ! -d "$BC_ASSETS_DIR" ]]; then
    echo "❌ Error: BC Assets directory not found at $BC_ASSETS_DIR"
    echo "   Please set BC_REPO to the correct path:"
    echo "   export BC_REPO=/path/to/Bondage-College"
    exit 1
fi

if [[ ! -d "$ROPEYBOT_BCDATA" ]]; then
    echo "❌ Error: ropeybot bcdata directory not found at $ROPEYBOT_BCDATA"
    exit 1
fi

echo "🔄 Syncing BC assets..."
echo "   Source: $BC_ASSETS_DIR"
echo "   Target: $ROPEYBOT_BCDATA"

# Files to sync
FILES=(
    "Female3DCG.js"
    "Female3DCG_Types.d.ts"
    "Female3DCGExtended.js"
)

# Copy files with backup
for file in "${FILES[@]}"; do
    src="$BC_ASSETS_DIR/$file"
    dst="$ROPEYBOT_BCDATA/$file"
    
    if [[ ! -f "$src" ]]; then
        echo "⚠️  Skipping (not found): $file"
        continue
    fi
    
    if [[ -f "$dst" ]]; then
        # Create backup
        dst_backup="${dst}.backup"
        cp "$dst" "$dst_backup"
        echo "✓ Backed up: $file → ${file}.backup"
    fi
    
    # Copy file
    cp "$src" "$dst"
    echo "✓ Synced: $file ($(stat -f%z "$src" 2>/dev/null || stat -c%s "$src") bytes)"
done

# Handle Female3DCGExtended TypeScript vs JavaScript
if [[ -f "$BC_ASSETS_DIR/Female3DCGExtended.js" ]]; then
    src_js="$BC_ASSETS_DIR/Female3DCGExtended.js"
    dst_ts="$ROPEYBOT_BCDATA/Female3DCGExtended.ts"
    
    # Check if .ts version exists (it might be a wrapper)
    if [[ -f "$dst_ts" ]]; then
        echo "ℹ️  Female3DCGExtended: Using existing .ts version (not replacing with .js)"
        echo "   To use .js version directly, rename Female3DCGExtended.ts to Female3DCGExtended.js.bak"
    else
        cp "$src_js" "$ROPEYBOT_BCDATA/Female3DCGExtended.ts"
        echo "✓ Synced: Female3DCGExtended.ts (from .js)"
    fi
fi

echo ""
echo "✅ Asset sync complete!"
echo ""
echo "Next steps:"
echo "1. Run: pnpm install (to update package files if needed)"
echo "2. Run: npx tsc --noEmit (to verify TypeScript compilation)"
echo "3. Check git diff to review changes:"
echo "   cd $(dirname "$ROPEYBOT_BCDATA")"
echo "   git diff src/bcdata/"
