#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────
# renovu-restore.sh
# Restore a full environment from a tar.gz backup file.
#
# Usage:
#   ADMIN_API_KEY=xxx ./scripts/renovu-restore.sh <backup-file.tar.gz> [--dry-run]
#
# Environment variables:
#   ADMIN_API_KEY     (required) API key for admin-tools authentication
#   ADMIN_TOOLS_URL   (optional) Base URL, default http://localhost:3005
# ──────────────────────────────────────────────────────────────────

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
ADMIN_TOOLS_URL="${ADMIN_TOOLS_URL:-http://localhost:3005}"
ADMIN_API_KEY="${ADMIN_API_KEY:-}"

# Defaults
BACKUP_FILE=""
DRY_RUN=false
INCLUDE_ACTIVITY=false

# ── Functions ────────────────────────────────────────────────────

error() { echo -e "${RED}ERROR: $1${NC}" >&2; exit 1; }
success() { echo -e "${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }
info() { echo -e "${CYAN}$1${NC}"; }

usage() {
  cat <<EOF
${BOLD}renovu-restore.sh${NC} - Restore environment from a backup archive

${BOLD}USAGE:${NC}
  ADMIN_API_KEY=xxx ./scripts/renovu-restore.sh <backup-file.tar.gz> [OPTIONS]

${BOLD}ARGUMENTS:${NC}
  backup-file.tar.gz  Path to the backup tar.gz file to restore

${BOLD}OPTIONS:${NC}
  --dry-run           Preview the restore without making changes
  -h, --help          Show this help message

${BOLD}ENVIRONMENT VARIABLES:${NC}
  ADMIN_API_KEY       (required) API key for admin-tools authentication
  ADMIN_TOOLS_URL     (optional) Base URL (default: http://localhost:3005)

${BOLD}EXAMPLES:${NC}
  ADMIN_API_KEY=my-secret ./scripts/renovu-restore.sh backup-20240101-120000.tar.gz
  ADMIN_API_KEY=my-secret ./scripts/renovu-restore.sh backup-20240101-120000.tar.gz --dry-run
EOF
  exit 0
}

# ── Parse arguments ──────────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    --include-activity)
      INCLUDE_ACTIVITY=true
      ;;
    -*)
      error "Unknown option: $arg (use --help for usage)"
      ;;
    *)
      if [[ -z "$BACKUP_FILE" ]]; then
        BACKUP_FILE="$arg"
      else
        error "Unexpected argument: $arg (backup file already set to '$BACKUP_FILE')"
      fi
      ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────────

[[ -z "$ADMIN_API_KEY" ]] && error "ADMIN_API_KEY environment variable is required"
[[ -z "$BACKUP_FILE" ]] && error "Backup file path is required (use --help for usage)"
[[ ! -f "$BACKUP_FILE" ]] && error "Backup file not found: $BACKUP_FILE"

# Validate file extension
case "$BACKUP_FILE" in
  *.tar.gz|*.tgz) ;;
  *) error "Backup file must be a .tar.gz or .tgz archive" ;;
esac

# ── Build URL ────────────────────────────────────────────────────

RESTORE_URL="${ADMIN_TOOLS_URL}/api/restore"
QUERY=""
if [[ "$DRY_RUN" == true ]]; then
  QUERY="${QUERY}&dryRun=true"
  warn "DRY-RUN mode: no changes will be made"
fi
if [[ "$INCLUDE_ACTIVITY" == true ]]; then
  QUERY="${QUERY}&includeActivity=true"
  warn "INCLUDE-ACTIVITY mode: jobs/notifications/messages/executiondetails will be restored (audit data)"
fi
if [[ -n "$QUERY" ]]; then
  RESTORE_URL="${RESTORE_URL}?${QUERY:1}"
fi

# ── Upload and restore ──────────────────────────────────────────

FILE_SIZE=$(wc -c < "$BACKUP_FILE" | tr -d ' ')
info "Uploading $(basename "$BACKUP_FILE") ($FILE_SIZE bytes) to ${ADMIN_TOOLS_URL}/api/restore ..."

HTTP_RESPONSE=$(mktemp)
HTTP_CODE=$(curl -s -w "%{http_code}" -o "$HTTP_RESPONSE" \
  -X POST \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  -F "file=@${BACKUP_FILE}" \
  "$RESTORE_URL") || {
    rm -f "$HTTP_RESPONSE"
    error "curl failed. Is admin-tools running at ${ADMIN_TOOLS_URL}?"
  }

RESPONSE_BODY=$(cat "$HTTP_RESPONSE")
rm -f "$HTTP_RESPONSE"

if [[ "$HTTP_CODE" -lt 200 || "$HTTP_CODE" -ge 300 ]]; then
  error "Restore failed (HTTP $HTTP_CODE): $RESPONSE_BODY"
fi

# ── Display results ──────────────────────────────────────────────

echo ""
if [[ "$DRY_RUN" == true ]]; then
  success "Dry-run restore preview:"
else
  success "Restore completed successfully!"
fi

# Pretty-print JSON if jq is available, otherwise print raw
if command -v jq &>/dev/null; then
  echo "$RESPONSE_BODY" | jq .
else
  echo "$RESPONSE_BODY"
fi
