#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────
# renovu-import.sh
# Import workflows from a JSON export file into a target environment.
#
# Usage:
#   ADMIN_API_KEY=xxx ./scripts/renovu-import.sh <workflows.json> \
#     --env-id=ENV --org-id=ORG [--strategy=skip]
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
IMPORT_FILE=""
ENVIRONMENT_ID=""
ORGANIZATION_ID=""
STRATEGY="skip"

# ── Functions ────────────────────────────────────────────────────

error() { echo -e "${RED}ERROR: $1${NC}" >&2; exit 1; }
success() { echo -e "${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }
info() { echo -e "${CYAN}$1${NC}"; }

usage() {
  cat <<EOF
${BOLD}renovu-import.sh${NC} - Import workflows from a JSON export file

${BOLD}USAGE:${NC}
  ADMIN_API_KEY=xxx ./scripts/renovu-import.sh <workflows.json> [OPTIONS]

${BOLD}ARGUMENTS:${NC}
  workflows.json      Path to the JSON export file to import

${BOLD}OPTIONS:${NC}
  --env-id=ID         Target environment ObjectId (24 hex chars, required)
  --org-id=ID         Target organization ObjectId (24 hex chars, required)
  --strategy=STRATEGY Import strategy: "skip" (default) or "overwrite"
  -h, --help          Show this help message

${BOLD}STRATEGIES:${NC}
  skip       Skip workflows that already exist in the target (default)
  overwrite  Overwrite existing workflows with imported data

${BOLD}ENVIRONMENT VARIABLES:${NC}
  ADMIN_API_KEY       (required) API key for admin-tools authentication
  ADMIN_TOOLS_URL     (optional) Base URL (default: http://localhost:3005)

${BOLD}EXAMPLES:${NC}
  # Import with default skip strategy
  ADMIN_API_KEY=my-secret ./scripts/renovu-import.sh workflows.json \\
    --env-id=507f1f77bcf86cd799439011 \\
    --org-id=507f1f77bcf86cd799439012

  # Import with overwrite strategy
  ADMIN_API_KEY=my-secret ./scripts/renovu-import.sh workflows.json \\
    --env-id=507f1f77bcf86cd799439011 \\
    --org-id=507f1f77bcf86cd799439012 \\
    --strategy=overwrite
EOF
  exit 0
}

# ── Parse arguments ──────────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      ;;
    --env-id=*)
      ENVIRONMENT_ID="${arg#*=}"
      ;;
    --org-id=*)
      ORGANIZATION_ID="${arg#*=}"
      ;;
    --strategy=*)
      STRATEGY="${arg#*=}"
      ;;
    -*)
      error "Unknown option: $arg (use --help for usage)"
      ;;
    *)
      if [[ -z "$IMPORT_FILE" ]]; then
        IMPORT_FILE="$arg"
      else
        error "Unexpected argument: $arg (import file already set to '$IMPORT_FILE')"
      fi
      ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────────

[[ -z "$ADMIN_API_KEY" ]] && error "ADMIN_API_KEY environment variable is required"
[[ -z "$IMPORT_FILE" ]] && error "Import file path is required (use --help for usage)"
[[ ! -f "$IMPORT_FILE" ]] && error "Import file not found: $IMPORT_FILE"
[[ -z "$ENVIRONMENT_ID" ]] && error "--env-id is required (use --help for usage)"
[[ -z "$ORGANIZATION_ID" ]] && error "--org-id is required (use --help for usage)"

# Validate file extension
case "$IMPORT_FILE" in
  *.json) ;;
  *) warn "File does not have .json extension, proceeding anyway..." ;;
esac

# Validate ObjectId formats
if ! echo "$ENVIRONMENT_ID" | grep -qE '^[0-9a-fA-F]{24}$'; then
  error "environmentId must be a valid ObjectId (24 hex chars): $ENVIRONMENT_ID"
fi

if ! echo "$ORGANIZATION_ID" | grep -qE '^[0-9a-fA-F]{24}$'; then
  error "organizationId must be a valid ObjectId (24 hex chars): $ORGANIZATION_ID"
fi

# Validate strategy
case "$STRATEGY" in
  skip|overwrite) ;;
  *) error "Invalid strategy '$STRATEGY'. Must be 'skip' or 'overwrite'" ;;
esac

# ── Upload and import ────────────────────────────────────────────

FILE_SIZE=$(wc -c < "$IMPORT_FILE" | tr -d ' ')
info "Importing $(basename "$IMPORT_FILE") ($FILE_SIZE bytes) ..."
info "  Environment: $ENVIRONMENT_ID"
info "  Organization: $ORGANIZATION_ID"
info "  Strategy: $STRATEGY"
echo ""

HTTP_RESPONSE=$(mktemp)
HTTP_CODE=$(curl -s -w "%{http_code}" -o "$HTTP_RESPONSE" \
  -X POST \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  -F "file=@${IMPORT_FILE}" \
  -F "environmentId=${ENVIRONMENT_ID}" \
  -F "organizationId=${ORGANIZATION_ID}" \
  -F "strategy=${STRATEGY}" \
  "${ADMIN_TOOLS_URL}/api/import") || {
    rm -f "$HTTP_RESPONSE"
    error "curl failed. Is admin-tools running at ${ADMIN_TOOLS_URL}?"
  }

RESPONSE_BODY=$(cat "$HTTP_RESPONSE")
rm -f "$HTTP_RESPONSE"

if [[ "$HTTP_CODE" -lt 200 || "$HTTP_CODE" -ge 300 ]]; then
  error "Import failed (HTTP $HTTP_CODE): $RESPONSE_BODY"
fi

# ── Display results ──────────────────────────────────────────────

success "Import completed successfully!"
echo ""

# Pretty-print JSON if jq is available, otherwise print raw
if command -v jq &>/dev/null; then
  # Show summary
  IMPORTED_WF=$(echo "$RESPONSE_BODY" | jq '.imported.workflows // 0' 2>/dev/null || echo "?")
  SKIPPED_WF=$(echo "$RESPONSE_BODY" | jq '.skipped.workflows // 0' 2>/dev/null || echo "?")
  ERROR_COUNT=$(echo "$RESPONSE_BODY" | jq '.errors | length // 0' 2>/dev/null || echo "?")
  DURATION=$(echo "$RESPONSE_BODY" | jq '.duration // 0' 2>/dev/null || echo "?")

  echo -e "  ${BOLD}Summary:${NC}"
  echo "    Imported workflows: $IMPORTED_WF"
  echo "    Skipped workflows:  $SKIPPED_WF"
  echo "    Errors:             $ERROR_COUNT"
  echo "    Duration:           ${DURATION}ms"

  if [[ "$ERROR_COUNT" != "0" && "$ERROR_COUNT" != "?" ]]; then
    echo ""
    warn "Errors:"
    echo "$RESPONSE_BODY" | jq '.errors[]' 2>/dev/null
  fi

  echo ""
  echo -e "${BOLD}Full response:${NC}"
  echo "$RESPONSE_BODY" | jq .
else
  echo "$RESPONSE_BODY"
fi
