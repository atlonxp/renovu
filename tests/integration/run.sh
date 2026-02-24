#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=== ReNovu Integration Tests ==="
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install

# Install Chromium browser
echo "Installing Chromium..."
npx playwright install chromium

echo ""
echo "Running tests..."
npx playwright test "$@"
