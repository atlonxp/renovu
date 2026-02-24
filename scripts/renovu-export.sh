#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────
# renovu-export.sh
# Export workflows and their dependencies as a JSON package.
#
# Usage:
#   ADMIN_API_KEY=xxx ./scripts/renovu-export.sh --all --env-id=ENV_ID [-o output.json]
#   ADMIN_API_KEY=xxx ./scripts/renovu-export.sh --workflow-ids=id1,id2 --env-id=ENV_ID [-o output.json]
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
EXPORT_ALL=false
WORKFLOW_IDS=""
ENVIRONMENT_ID=""
OUTPUT_FILE=""

# ── Functions ────────────────────────────────────────────────────

error() { echo -e "${RED}ERROR: $1${NC}" >&2; exit 1; }
success() { echo -e "${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }
info() { echo -e "${CYAN}$1${NC}"; }

usage() {
  cat <<EOF
${BOLD}renovu-export.sh${NC} - Export workflows and dependencies as JSON

${BOLD}USAGE:${NC}
  ADMIN_API_KEY=xxx ./scripts/renovu-export.sh --all --env-id=ENV_ID [OPTIONS]
  ADMIN_API_KEY=xxx ./scripts/renovu-export.sh --workflow-ids=id1,id2 --env-id=ENV_ID [OPTIONS]

${BOLD}OPTIONS:${NC}
  --all                   Export all workflows in the environment
  --workflow-ids=ID,...    Export specific workflow IDs (comma-separated)
  --env-id=ID             Environment ObjectId (24 hex chars, required)
  -o, --output=FILE       Output file path (default: workflows-{timestamp}.json)
  -h, --help              Show this help message

${BOLD}ENVIRONMENT VARIABLES:${NC}
  ADMIN_API_KEY       (required) API key for admin-tools authentication
  ADMIN_TOOLS_URL     (optional) Base URL (default: http://localhost:3005)

${BOLD}EXAMPLES:${NC}
  # Export all workflows
  ADMIN_API_KEY=my-secret ./scripts/renovu-export.sh --all --env-id=507f1f77bcf86cd799439011

  # Export specific workflows
  ADMIN_API_KEY=my-secret ./scripts/renovu-export.sh \\
    --workflow-ids=507f1f77bcf86cd799439011,507f1f77bcf86cd799439012 \\
    --env-id=507f1f77bcf86cd799439013

  # Export to specific file
  ADMIN_API_KEY=my-secret ./scripts/renovu-export.sh --all --env-id=507f1f77bcf86cd799439011 -o my-export.json
EOF
  exit 0
}

# ── Parse arguments ──────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      ;;
    --all)
      EXPORT_ALL=true
      shift
      ;;
    --workflow-ids=*)
      WORKFLOW_IDS="${1#*=}"
      shift
      ;;
    --env-id=*)
      ENVIRONMENT_ID="${1#*=}"
      shift
      ;;
    -o|--output)
      if [[ $# -lt 2 ]]; then
        error "Missing value for $1"
      fi
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --output=*)
      OUTPUT_FILE="${1#*=}"
      shift
      ;;
    *)
      error "Unknown argument: $1 (use --help for usage)"
      ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────────

[[ -z "$ADMIN_API_KEY" ]] && error "ADMIN_API_KEY environment variable is required"
[[ -z "$ENVIRONMENT_ID" ]] && error "--env-id is required (use --help for usage)"

# Validate environmentId format (24 hex chars)
if ! echo "$ENVIRONMENT_ID" | grep -qE '^[0-9a-fA-F]{24}$'; then
  error "environmentId must be a valid ObjectId (24 hex chars): $ENVIRONMENT_ID"
fi

if [[ "$EXPORT_ALL" == false && -z "$WORKFLOW_IDS" ]]; then
  error "Either --all or --workflow-ids is required (use --help for usage)"
fi

if [[ "$EXPORT_ALL" == true && -n "$WORKFLOW_IDS" ]]; then
  warn "--all takes precedence over --workflow-ids"
fi

# Default output filename
if [[ -z "$OUTPUT_FILE" ]]; then
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  OUTPUT_FILE="workflows-${TIMESTAMP}.json"
fi

# ── Build JSON body ──────────────────────────────────────────────

if [[ "$EXPORT_ALL" == true ]]; then
  JSON_BODY="{\"workflowIds\":[\"all\"],\"environmentId\":\"${ENVIRONMENT_ID}\"}"
else
  # Convert comma-separated IDs to JSON array
  IFS=',' read -ra ID_ARRAY <<< "$WORKFLOW_IDS"
  IDS_JSON=""
  for id in "${ID_ARRAY[@]}"; do
    id=$(echo "$id" | xargs) # trim whitespace
    if [[ -n "$IDS_JSON" ]]; then
      IDS_JSON="${IDS_JSON},"
    fi
    IDS_JSON="${IDS_JSON}\"${id}\""
  done
  JSON_BODY="{\"workflowIds\":[${IDS_JSON}],\"environmentId\":\"${ENVIRONMENT_ID}\"}"
fi

# ── Export workflows ─────────────────────────────────────────────

if [[ "$EXPORT_ALL" == true ]]; then
  info "Exporting ALL workflows from environment ${ENVIRONMENT_ID} ..."
else
  info "Exporting workflows [${WORKFLOW_IDS}] from environment ${ENVIRONMENT_ID} ..."
fi

HTTP_RESPONSE=$(mktemp)
HTTP_CODE=$(curl -s -w "%{http_code}" -o "$HTTP_RESPONSE" \
  -X POST \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_BODY" \
  "${ADMIN_TOOLS_URL}/api/export") || {
    rm -f "$HTTP_RESPONSE"
    error "curl failed. Is admin-tools running at ${ADMIN_TOOLS_URL}?"
  }

RESPONSE_BODY=$(cat "$HTTP_RESPONSE")
rm -f "$HTTP_RESPONSE"

if [[ "$HTTP_CODE" -lt 200 || "$HTTP_CODE" -ge 300 ]]; then
  error "Export failed (HTTP $HTTP_CODE): $RESPONSE_BODY"
fi

# ── Save output ──────────────────────────────────────────────────

# Pretty-print if jq is available, otherwise save raw
if command -v jq &>/dev/null; then
  echo "$RESPONSE_BODY" | jq . > "$OUTPUT_FILE"
else
  echo "$RESPONSE_BODY" > "$OUTPUT_FILE"
fi

FILE_SIZE=$(wc -c < "$OUTPUT_FILE" | tr -d ' ')

# ── Summary ──────────────────────────────────────────────────────

echo ""
success "Export completed successfully!"
echo -e "  ${BOLD}File:${NC}    $OUTPUT_FILE"
echo -e "  ${BOLD}Size:${NC}    $FILE_SIZE bytes"

# Extract counts if jq is available
if command -v jq &>/dev/null; then
  WF_COUNT=$(echo "$RESPONSE_BODY" | jq '.workflows | length // 0' 2>/dev/null || echo "?")
  MT_COUNT=$(echo "$RESPONSE_BODY" | jq '.messageTemplates | length // 0' 2>/dev/null || echo "?")
  NG_COUNT=$(echo "$RESPONSE_BODY" | jq '.notificationGroups | length // 0' 2>/dev/null || echo "?")
  LY_COUNT=$(echo "$RESPONSE_BODY" | jq '.layouts | length // 0' 2>/dev/null || echo "?")
  CV_COUNT=$(echo "$RESPONSE_BODY" | jq '.controlValues | length // 0' 2>/dev/null || echo "?")
  FD_COUNT=$(echo "$RESPONSE_BODY" | jq '.feeds | length // 0' 2>/dev/null || echo "?")

  echo -e "  ${BOLD}Contents:${NC}"
  echo "    Workflows:           $WF_COUNT"
  echo "    Message Templates:   $MT_COUNT"
  echo "    Notification Groups: $NG_COUNT"
  echo "    Layouts:             $LY_COUNT"
  echo "    Control Values:      $CV_COUNT"
  echo "    Feeds:               $FD_COUNT"
fi
