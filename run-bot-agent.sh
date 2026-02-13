#!/usr/bin/env bash
# BucketofThoughts Backend Engineering Agent launcher
# Activates Python virtual environment and runs the agent

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Activate virtual environment
source "${SCRIPT_DIR}/BucketofThoughts/.venv/bin/activate"

# Run the agent
python "${SCRIPT_DIR}/BucketofThoughts/main.py"

# Command to run the agent
source BucketofThoughts/.venv/bin/activate
python BucketofThoughts/main.py
    