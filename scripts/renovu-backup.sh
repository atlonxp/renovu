#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────
# renovu-backup.sh
# Create a full environment backup and download the tar.gz archive.
#
# Usage:
#   ADMIN_API_KEY=xxx ./scripts/renovu-backup.sh [--output-dir=/tmp]
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
OUTPUT_DIR="."

# ── Functions ────────────────────────────────────────────────────

error() { echo -e "${RED}ERROR: $1${NC}" >&2; exit 1; }
success() { echo -e "${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }
info() { echo -e "${CYAN}$1${NC}"; }

usage() {
  cat <<EOF
${BOLD}renovu-backup.sh${NC} - Create a full environment backup

${BOLD}USAGE:${NC}
  ADMIN_API_KEY=xxx ./scripts/renovu-backup.sh [OPTIONS]

${BOLD}OPTIONS:${NC}
  --output-dir=DIR    Directory to save the backup file (default: current directory)
  -h, --help          Show this help message

${BOLD}ENVIRONMENT VARIABLES:${NC}
  ADMIN_API_KEY       (required) API key for admin-tools authentication
  ADMIN_TOOLS_URL     (optional) Base URL (default: http://localhost:3005)

${BOLD}EXAMPLES:${NC}
  ADMIN_API_KEY=my-secret ./scripts/renovu-backup.sh
  ADMIN_API_KEY=my-secret ./scripts/renovu-backup.sh --output-dir=/tmp/backups
  ADMIN_API_KEY=my-secret ADMIN_TOOLS_URL=https://admin.example.com ./scripts/renovu-backup.sh
EOF
  exit 0
}

# ── Parse arguments ──────────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      ;;
    --output-dir=*)
      OUTPUT_DIR="${arg#*=}"
      ;;
    *)
      error "Unknown argument: $arg (use --help for usage)"
      ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────────

[[ -z "$ADMIN_API_KEY" ]] && error "ADMIN_API_KEY environment variable is required"

if [[ ! -d "$OUTPUT_DIR" ]]; then
  warn "Output directory '$OUTPUT_DIR' does not exist. Creating it..."
  mkdir -p "$OUTPUT_DIR" || error "Failed to create output directory: $OUTPUT_DIR"
fi

# ── Step 1: Create backup ───────────────────────────────────────

info "Creating backup via ${ADMIN_TOOLS_URL}/api/backup ..."

HTTP_RESPONSE=$(mktemp)
HTTP_CODE=$(curl -s -w "%{http_code}" -o "$HTTP_RESPONSE" \
  -X POST \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  "${ADMIN_TOOLS_URL}/api/backup") || {
    rm -f "$HTTP_RESPONSE"
    error "curl failed. Is admin-tools running at ${ADMIN_TOOLS_URL}?"
  }

if [[ "$HTTP_CODE" -lt 200 || "$HTTP_CODE" -ge 300 ]]; then
  BODY=$(cat "$HTTP_RESPONSE")
  rm -f "$HTTP_RESPONSE"
  error "Backup creation failed (HTTP $HTTP_CODE): $BODY"
fi

# Parse response to get filename
RESPONSE_BODY=$(cat "$HTTP_RESPONSE")
rm -f "$HTTP_RESPONSE"

FILENAME=$(echo "$RESPONSE_BODY" | grep -o '"filename"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"filename"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

if [[ -z "$FILENAME" ]]; then
  error "Could not parse filename from backup response: $RESPONSE_BODY"
fi

success "Backup created: $FILENAME"
info "Response: $RESPONSE_BODY"

# ── Step 2: Download the backup file ────────────────────────────

OUTPUT_PATH="${OUTPUT_DIR}/${FILENAME}"
info "Downloading backup to ${OUTPUT_PATH} ..."

DOWNLOAD_CODE=$(curl -s -w "%{http_code}" -o "$OUTPUT_PATH" \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  "${ADMIN_TOOLS_URL}/api/backups/${FILENAME}/download") || {
    rm -f "$OUTPUT_PATH"
    error "curl failed during download."
  }

if [[ "$DOWNLOAD_CODE" -lt 200 || "$DOWNLOAD_CODE" -ge 300 ]]; then
  rm -f "$OUTPUT_PATH"
  error "Download failed (HTTP $DOWNLOAD_CODE)"
fi

FILE_SIZE=$(wc -c < "$OUTPUT_PATH" | tr -d ' ')

# ── Done ─────────────────────────────────────────────────────────

echo ""
success "Backup downloaded successfully!"
echo -e "  ${BOLD}File:${NC}  $OUTPUT_PATH"
echo -e "  ${BOLD}Size:${NC}  $FILE_SIZE bytes"
