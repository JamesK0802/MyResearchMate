#!/bin/bash

# Configuration
REPO_DIR="/path/to/your/MyResearchMate" # Update this to your server path
BRANCH="main"
VERSION_FILE="VERSION"

cd "$REPO_DIR" || exit

# 1. Fetch latest changes from remote without merging
git fetch origin "$BRANCH"

# 2. Get local and remote versions
LOCAL_VERSION=$(cat "$VERSION_FILE")
REMOTE_VERSION=$(git show "origin/$BRANCH:$VERSION_FILE")

echo "[$(date)] Local: $LOCAL_VERSION | Remote: $REMOTE_VERSION"

# 3. Compare versions
if [ "$LOCAL_VERSION" != "$REMOTE_VERSION" ]; then
    echo "[$(date)] Version increase detected! Starting update..."
    
    # 4. Pull latest code
    git pull origin "$BRANCH"
    
    # 5. Rebuild and restart containers
    # Use --build to ensure code changes are picked up
    docker-compose up -d --build
    
    # 6. Cleanup unused images to save disk space
    docker image prune -f
    
    echo "[$(date)] Update complete. New version: $REMOTE_VERSION"
else
    echo "[$(date)] No version change. Skipping update."
fi
