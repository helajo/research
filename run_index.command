#!/bin/bash
# run_index.command
# Double-click this file on your Mac to rebuild index.html automatically.
# No Terminal knowledge needed.

# Move into the same folder as this script
cd "$(dirname "$0")"

echo ""
echo "══════════════════════════════════════"
echo "  Market Monitor — Rebuilding Index"
echo "══════════════════════════════════════"
echo ""

# Run the Python script
python3 build_index.py

echo ""
echo "══════════════════════════════════════"
echo "  Done! Now open GitHub Desktop"
echo "  and click Commit → Push."
echo "══════════════════════════════════════"
echo ""

# Keep the window open so you can read the output
read -p "Press Enter to close this window..."
