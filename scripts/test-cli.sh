#!/usr/bin/env bash
set -e

echo "Building CLI..."
npm run build

echo ""
echo "Testing CLI entry point..."
node dist/cli/index.js --help

echo ""
echo "CLI is working correctly."
