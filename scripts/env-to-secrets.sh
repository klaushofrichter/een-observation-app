#!/bin/bash

# Script to copy .env variables to GitHub repository secrets
# Usage: ./scripts/env-to-secrets.sh [.env file path]

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: File '$ENV_FILE' not found"
    exit 1
fi

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: Not authenticated with GitHub CLI. Run 'gh auth login' first"
    exit 1
fi

echo "Reading from: $ENV_FILE"
echo "Repository: $(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo ""

count=0
while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

    # Parse variable name and value
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        name="${BASH_REMATCH[1]}"
        value="${BASH_REMATCH[2]}"

        # Remove surrounding quotes if present
        value="${value#\"}"
        value="${value%\"}"
        value="${value#\'}"
        value="${value%\'}"

        echo "Setting secret: $name"
        echo "$value" | gh secret set "$name"

        if [ $? -eq 0 ]; then
            ((count++))
        else
            echo "  Failed to set $name"
        fi
    fi
done < "$ENV_FILE"

echo ""
echo "Done. Set $count secret(s)."
