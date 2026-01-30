#!/bin/bash

# Sync secrets from .env file to GitHub Actions repository secrets
# Usage: ./scripts/sync-secrets.sh [.env file path]

set -e

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE not found"
    exit 1
fi

# Check if gh CLI is installed and authenticated
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed"
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    echo "Error: GitHub CLI is not authenticated"
    echo "Run: gh auth login"
    exit 1
fi

echo "Syncing secrets from $ENV_FILE to GitHub repository..."
echo ""

# Read .env file and set each secret
while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    if [ -z "$line" ] || [[ "$line" =~ ^# ]]; then
        continue
    fi

    # Extract key and value
    key=$(echo "$line" | cut -d '=' -f 1)
    value=$(echo "$line" | cut -d '=' -f 2-)

    # Remove surrounding quotes from value if present
    value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")

    if [ -n "$key" ] && [ -n "$value" ]; then
        echo "Setting secret: $key"
        echo "$value" | gh secret set "$key"
    fi
done < "$ENV_FILE"

echo ""
echo "Done! Secrets synced to GitHub repository."
echo ""
echo "To verify, run: gh secret list"
