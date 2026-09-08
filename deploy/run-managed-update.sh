#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${1:?repository directory is required}"
STATE_DIR="${2:?state directory is required}"
REQUEST_FILE="$STATE_DIR/request.json"
STATUS_FILE="$STATE_DIR/status.json"
HELPER="$REPO_DIR/deploy/update_status.py"
RUNTIME_HELPER="$STATE_DIR/update-status-runtime.py"
COMMITS_FILE="$STATE_DIR/commits.txt"
CHANGED_FILES_FILE="$STATE_DIR/changed-files.txt"

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/update.lock"
flock -n 9 || exit 0
[[ -f "$REQUEST_FILE" ]] || exit 0

cp "$HELPER" "$RUNTIME_HELPER"
JOB_ID="$(python3 "$RUNTIME_HELPER" read-job "$REQUEST_FILE")"
REQUESTED_AT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("requested_at", ""))' "$REQUEST_FILE")"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
CURRENT_STAGE="pulling"
OLD_REVISION=""
NEW_REVISION=""

write_status() {
  local state="$1"
  local stage="$2"
  local message="$3"
  local finished_at="${4:-}"
  local args=(write "$STATUS_FILE" --job-id "$JOB_ID" --state "$state" --stage "$stage" --message "$message" --started-at "$STARTED_AT")
  [[ -n "$REQUESTED_AT" ]] && args+=(--requested-at "$REQUESTED_AT")
  [[ -n "$finished_at" ]] && args+=(--finished-at "$finished_at")
  [[ -n "$OLD_REVISION" ]] && args+=(--old-revision "$OLD_REVISION")
  [[ -n "$NEW_REVISION" ]] && args+=(--new-revision "$NEW_REVISION")
  [[ -f "$COMMITS_FILE" ]] && args+=(--commits-file "$COMMITS_FILE")
  [[ -f "$CHANGED_FILES_FILE" ]] && args+=(--changed-files-file "$CHANGED_FILES_FILE")
  python3 "$RUNTIME_HELPER" "${args[@]}"
}

on_exit() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    write_status failed "$CURRENT_STAGE" "Update failed during $CURRENT_STAGE. Check the host service log." "$(date -u +%Y-%m-%dT%H:%M:%SZ)" || true
  fi
  rm -f "$REQUEST_FILE"
  exit "$exit_code"
}
trap on_exit EXIT

cd "$REPO_DIR"
OLD_REVISION="$(git rev-parse HEAD)"
BRANCH="$(git branch --show-current)"
[[ -n "$BRANCH" ]] || { echo "Managed updates require a checked-out branch." >&2; exit 1; }

write_status running pulling "Pulling the latest Git changes"
git pull --ff-only origin "$BRANCH"
NEW_REVISION="$(git rev-parse HEAD)"
: > "$COMMITS_FILE"
: > "$CHANGED_FILES_FILE"
if [[ "$OLD_REVISION" != "$NEW_REVISION" ]]; then
  git log --format='%h%x09%s' "$OLD_REVISION..$NEW_REVISION" > "$COMMITS_FILE"
  git diff --name-only "$OLD_REVISION..$NEW_REVISION" > "$CHANGED_FILES_FILE"
fi

CURRENT_STAGE="rebuilding"
write_status running rebuilding "Rebuilding and restarting Docker services"
docker compose up -d --build

CURRENT_STAGE="verifying"
write_status running verifying "Verifying Docker services"
[[ "$(docker inspect -f '{{.State.Running}}' mrm_backend)" == "true" ]]
[[ "$(docker inspect -f '{{.State.Running}}' mrm_frontend)" == "true" ]]

write_status success complete "Git update and Docker rebuild completed" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
trap - EXIT
rm -f "$REQUEST_FILE"
