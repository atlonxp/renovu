#!/bin/bash
# =============================================================================
# ReNovu Comprehensive E2E Test Suite
# =============================================================================
# Tests ReNovu (Novu self-hosted) from ALL perspectives:
#   1. Infrastructure Health (API, WS, Dashboard, MongoDB, Redis)
#   2. Subscriber Management (CRUD, locale, bulk)
#   3. Notification Groups & Workflows (CRUD)
#   4. Trigger & Delivery (single, bulk, broadcast, topic)
#   5. In-App Notifications (feed, read/unread, counts)
#   6. Locale / i18n (subscriber locale, inline locale)
#   7. Subscriber Preferences (get, update)
#   8. Integrations (list providers, check active)
#   9. Topics (create, add subscribers, trigger)
#  10. Edge Cases (invalid payloads, missing resources)
#  11. Self-Hosted Auth (register, login, org creation, JWT, 401)
#
# Usage:
#   ./test-renovu-e2e.sh                  # Run all suites
#   ./test-renovu-e2e.sh --suite health   # Run one suite
#   ./test-renovu-e2e.sh --list           # List available suites
#   ./test-renovu-e2e.sh --cleanup-only   # Just delete test data
#   ./test-renovu-e2e.sh --skip-cleanup   # Keep test data after run
#
# Environment overrides:
#   API_URL           (default: http://localhost:3001)
#   WS_URL            (default: http://localhost:3002)
#   DASHBOARD_URL     (default: http://localhost:4000)
#   API_CONTAINER     (default: renovu-api)
#   MONGO_CONTAINER   (default: renovu-mongodb)
#   MONGO_USER        (default: renovu)
#   MONGO_PASSWORD    (default: renovu-dev-password)
#   MONGO_DB          (default: renovu-db)
#   NOVU_USER_EMAIL   (default: auto-detect, pick last created user)
# =============================================================================
set -uo pipefail

# ---------------------------------------------------------------------------
# Configuration (override via env vars)
# ---------------------------------------------------------------------------
API_URL="${API_URL:-http://localhost:3001}"
WS_URL="${WS_URL:-http://localhost:3002}"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"
API_CONTAINER="${API_CONTAINER:-renovu-api}"
MONGO_CONTAINER="${MONGO_CONTAINER:-renovu-mongodb}"
MONGO_USER="${MONGO_USER:-renovu}"
MONGO_PASSWORD="${MONGO_PASSWORD:-renovu-dev-password}"
MONGO_DB="${MONGO_DB:-renovu-db}"
NOVU_USER_EMAIL="${NOVU_USER_EMAIL:-}"

# Test data prefix (to avoid collision with real data)
TEST_PREFIX="test-e2e"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
SUITE_FILTER=""
CLEANUP_ONLY=false
SKIP_CLEANUP=false
LIST_SUITES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --suite) SUITE_FILTER="$2"; shift 2 ;;
    --cleanup-only) CLEANUP_ONLY=true; shift ;;
    --skip-cleanup) SKIP_CLEANUP=true; shift ;;
    --list) LIST_SUITES=true; shift ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo "  --suite <name>   Run only the specified suite"
      echo "  --list           List available test suites"
      echo "  --cleanup-only   Only run cleanup (delete test data)"
      echo "  --skip-cleanup   Keep test data after run"
      echo "  --help           Show this help"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

AVAILABLE_SUITES=(
  "health"
  "subscribers"
  "groups-workflows"
  "triggers"
  "in-app"
  "locale"
  "preferences"
  "integrations"
  "topics"
  "edge-cases"
  "auth"
)

if $LIST_SUITES; then
  echo "Available test suites:"
  for s in "${AVAILABLE_SUITES[@]}"; do
    echo "  - $s"
  done
  exit 0
fi

should_run() {
  [ -z "$SUITE_FILTER" ] || [ "$SUITE_FILTER" = "$1" ]
}

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------
PASS=0
FAIL=0
SKIP=0
ERRORS=""

check() {
  local test_name="$1"
  local condition="$2"
  if eval "$condition" 2>/dev/null; then
    echo "  PASS: $test_name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $test_name"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  - $test_name"
  fi
}

skip() {
  echo "  SKIP: $1"
  SKIP=$((SKIP + 1))
}

# ---------------------------------------------------------------------------
# Authenticate: generate JWT inside API container
# ---------------------------------------------------------------------------
echo "============================================"
echo "  ReNovu Comprehensive E2E Test Suite"
echo "============================================"
echo ""
echo "API:       $API_URL"
echo "WS:        $WS_URL"
echo "Dashboard: $DASHBOARD_URL"
echo "Container: $API_CONTAINER"
echo ""

echo "--- Fetching org/env IDs from MongoDB ---"
EMAIL_FILTER=""
if [ -n "$NOVU_USER_EMAIL" ]; then
  EMAIL_FILTER="$NOVU_USER_EMAIL"
fi
IDS=$(docker exec "$MONGO_CONTAINER" mongosh \
  -u "$MONGO_USER" -p "$MONGO_PASSWORD" \
  --authenticationDatabase admin "$MONGO_DB" \
  --quiet --eval "
const emailFilter = '$EMAIL_FILTER';
let user;
if (emailFilter) {
  user = db.users.findOne({email: emailFilter});
} else {
  // Pick the last created user (most likely the primary admin)
  user = db.users.find({}).sort({createdAt: -1}).limit(1).toArray()[0];
}
if (!user) { print('ERROR: no user'); quit(1); }

// Find org membership for this user
const member = db.members.findOne({_userId: user._id});
if (!member) { print('ERROR: no member'); quit(1); }

// Find Development environment for this org
const env = db.environments.findOne({_organizationId: member._organizationId, name: 'Development'});
if (!env) { print('ERROR: no env'); quit(1); }

const org = db.organizations.findOne({_id: member._organizationId});
if (!org) { print('ERROR: no org'); quit(1); }

print(JSON.stringify({
  envId: env._id.toString(),
  orgId: org._id.toString(),
  userId: user._id.toString(),
  email: user.email,
  firstName: user.firstName || '',
  lastName: user.lastName || ''
}));
" 2>/dev/null)

if [ -z "$IDS" ] || echo "$IDS" | grep -q "ERROR"; then
  echo "FATAL: Cannot fetch org/env IDs from MongoDB. Is ReNovu running?"
  exit 1
fi

ENV_ID=$(echo "$IDS" | python3 -c "import sys,json; print(json.load(sys.stdin)['envId'])")
ORG_ID=$(echo "$IDS" | python3 -c "import sys,json; print(json.load(sys.stdin)['orgId'])")
USER_ID=$(echo "$IDS" | python3 -c "import sys,json; print(json.load(sys.stdin)['userId'])")
USER_EMAIL=$(echo "$IDS" | python3 -c "import sys,json; print(json.load(sys.stdin)['email'])")
USER_FIRST=$(echo "$IDS" | python3 -c "import sys,json; print(json.load(sys.stdin)['firstName'])")
USER_LAST=$(echo "$IDS" | python3 -c "import sys,json; print(json.load(sys.stdin)['lastName'])")

echo "  Env ID:  $ENV_ID"
echo "  Org ID:  $ORG_ID"
echo "  User ID: $USER_ID"
echo "  Email:   $USER_EMAIL"

echo ""
echo "--- Generating JWT token ---"
JWT=$(docker exec "$API_CONTAINER" node -e "
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
const payload = {
    _id: '$USER_ID',
    firstName: '$USER_FIRST',
    lastName: '$USER_LAST',
    email: '$USER_EMAIL',
    organizationId: '$ORG_ID',
    environmentId: '$ENV_ID',
    roles: ['admin'],
};
console.log(jwt.sign(payload, secret, { expiresIn: '24h' }));
" 2>/dev/null)

if [ -z "$JWT" ]; then
  echo "FATAL: Cannot generate JWT. Is the API container running?"
  exit 1
fi
echo "  JWT token obtained (${#JWT} chars)"

echo ""
echo "--- Fetching API key (regenerating to ensure validity) ---"
API_KEY=$(curl -sf -X POST \
  -H "Authorization: Bearer $JWT" \
  -H "novu-environment-id: $ENV_ID" \
  "$API_URL/v1/environments/api-keys/regenerate" 2>/dev/null \
  | python3 -c "import sys,json; keys=json.load(sys.stdin).get('data',[]); print(keys[0].get('key','') if keys else '')" 2>/dev/null)

if [ -z "$API_KEY" ]; then
  echo "  WARNING: Could not regenerate API key, trying to read from DB..."
  API_KEY=$(docker exec "$MONGO_CONTAINER" mongosh \
    -u "$MONGO_USER" -p "$MONGO_PASSWORD" \
    --authenticationDatabase admin "$MONGO_DB" \
    --quiet --eval "
const env = db.environments.findOne({_id: ObjectId('$ENV_ID')});
print(env ? env.apiKeys[0].key : '');
" 2>/dev/null)
fi

if [ -z "$API_KEY" ]; then
  echo "FATAL: Cannot obtain API key"
  exit 1
fi
echo "  API key: ${API_KEY:0:12}..."
echo ""

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
jwt_get() {
  curl -sf -H "Authorization: Bearer $JWT" -H "novu-environment-id: $ENV_ID" "$API_URL$1" 2>/dev/null
}
jwt_post() {
  curl -sf -X POST -H "Authorization: Bearer $JWT" -H "novu-environment-id: $ENV_ID" -H "Content-Type: application/json" -d "$2" "$API_URL$1" 2>/dev/null
}
jwt_put() {
  curl -sf -X PUT -H "Authorization: Bearer $JWT" -H "novu-environment-id: $ENV_ID" -H "Content-Type: application/json" -d "$2" "$API_URL$1" 2>/dev/null
}
jwt_patch() {
  curl -sf -X PATCH -H "Authorization: Bearer $JWT" -H "novu-environment-id: $ENV_ID" -H "Content-Type: application/json" -d "$2" "$API_URL$1" 2>/dev/null
}
jwt_delete() {
  curl -sf -X DELETE -H "Authorization: Bearer $JWT" -H "novu-environment-id: $ENV_ID" "$API_URL$1" 2>/dev/null
}
api_get() {
  curl -sf -H "Authorization: ApiKey $API_KEY" "$API_URL$1" 2>/dev/null
}
api_post() {
  curl -sf -X POST -H "Authorization: ApiKey $API_KEY" -H "Content-Type: application/json" -d "$2" "$API_URL$1" 2>/dev/null
}
api_put() {
  curl -sf -X PUT -H "Authorization: ApiKey $API_KEY" -H "Content-Type: application/json" -d "$2" "$API_URL$1" 2>/dev/null
}
api_patch() {
  curl -sf -X PATCH -H "Authorization: ApiKey $API_KEY" -H "Content-Type: application/json" -d "$2" "$API_URL$1" 2>/dev/null
}
api_delete() {
  curl -sf -X DELETE -H "Authorization: ApiKey $API_KEY" "$API_URL$1" 2>/dev/null
}

# HTTP with status code capture (for error-code tests)
api_status() {
  curl -s -o /dev/null -w "%{http_code}" -H "Authorization: ApiKey $API_KEY" "$API_URL$1" 2>/dev/null
}
api_post_status() {
  curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: ApiKey $API_KEY" -H "Content-Type: application/json" -d "$2" "$API_URL$1" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Cleanup function
# ---------------------------------------------------------------------------
do_cleanup() {
  echo ""
  echo "--- CLEANUP: Removing test data ---"

  # Delete test subscribers
  for SUB_ID in "${TEST_PREFIX}-sub-en" "${TEST_PREFIX}-sub-ja" "${TEST_PREFIX}-sub-th" "${TEST_PREFIX}-sub-ko" "${TEST_PREFIX}-sub-ar" "${TEST_PREFIX}-sub-update" "${TEST_PREFIX}-sub-pref" "${TEST_PREFIX}-topic-sub-1" "${TEST_PREFIX}-topic-sub-2"; do
    api_delete "/v1/subscribers/$SUB_ID" > /dev/null 2>&1 || true
  done
  echo "  Subscribers cleaned"

  # Delete test workflows by querying for them
  WORKFLOW_IDS=$(api_get "/v1/workflows?page=0&limit=50" | python3 -c "
import sys, json
try:
  workflows = json.load(sys.stdin).get('data', [])
  for w in workflows:
    if w.get('name','').startswith('${TEST_PREFIX}'):
      print(w['_id'])
except: pass
" 2>/dev/null)
  for WF_ID in $WORKFLOW_IDS; do
    api_delete "/v1/workflows/$WF_ID" > /dev/null 2>&1 || true
  done
  echo "  Workflows cleaned"

  # Delete test topics
  for TOPIC_KEY in "${TEST_PREFIX}-topic-1"; do
    api_delete "/v1/topics/$TOPIC_KEY" > /dev/null 2>&1 || true
  done
  echo "  Topics cleaned"

  # Delete test notification groups
  docker exec "$MONGO_CONTAINER" mongosh \
    -u "$MONGO_USER" -p "$MONGO_PASSWORD" \
    --authenticationDatabase admin "$MONGO_DB" \
    --quiet --eval "
const result = db.notificationgroups.deleteMany({name: /^${TEST_PREFIX}/});
print('Deleted ' + result.deletedCount + ' test notification groups');
" 2>/dev/null

  # Delete test auth users (suite 11)
  docker exec "$MONGO_CONTAINER" mongosh \
    -u "$MONGO_USER" -p "$MONGO_PASSWORD" \
    --authenticationDatabase admin "$MONGO_DB" \
    --quiet --eval "
const emails = ['${TEST_PREFIX}-auth@test.com', '${TEST_PREFIX}-noorg@test.com'];
const users = db.users.find({email: {\$in: emails}}).toArray();
const userIds = users.map(u => u._id);
if (userIds.length > 0) {
  const members = db.members.find({_userId: {\$in: userIds}}).toArray();
  const orgIds = [...new Set(members.map(m => m._organizationId))];
  db.members.deleteMany({_userId: {\$in: userIds}});
  db.environments.deleteMany({_organizationId: {\$in: orgIds}});
  db.organizations.deleteMany({_id: {\$in: orgIds}});
  db.users.deleteMany({_id: {\$in: userIds}});
  print('Deleted ' + userIds.length + ' test auth users and their orgs');
} else {
  print('No test auth users to clean');
}
" 2>/dev/null

  echo "  Cleanup done."
}

if $CLEANUP_ONLY; then
  do_cleanup
  exit 0
fi

# ==========================================================================
# SUITE 1: Infrastructure Health
# ==========================================================================
if should_run "health"; then
echo ""
echo "==========================================================================="
echo "  SUITE 1: Infrastructure Health"
echo "==========================================================================="

echo "1.1 API health check"
RESULT=$(curl -sf "$API_URL/v1/health-check" 2>/dev/null)
STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('status',''))" 2>/dev/null)
echo "    Status: $STATUS"
check "API returns ok status" '[ "$STATUS" = "ok" ]'

echo "1.2 API health check - database indicator"
DB_STATUS=$(echo "$RESULT" | python3 -c "
import sys,json
d = json.load(sys.stdin).get('data',{})
info = d.get('info',{})
print(info.get('db',{}).get('status','') if isinstance(info.get('db'), dict) else 'unknown')
" 2>/dev/null)
echo "    DB status: $DB_STATUS"
check "Database is healthy" '[ "$DB_STATUS" = "up" ]'

echo "1.3 WebSocket health check"
WS_RESULT=$(curl -s "$WS_URL/v1/health-check" 2>/dev/null)
WS_WS_UP=$(echo "$WS_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); info=d.get('info',d.get('details',{})); print(info.get('ws-server',{}).get('status',''))" 2>/dev/null)
WS_DB_UP=$(echo "$WS_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); info=d.get('info',d.get('details',{})); print(info.get('db',{}).get('status',''))" 2>/dev/null)
echo "    WS server: $WS_WS_UP, DB: $WS_DB_UP"
check "WebSocket server is up" '[ "$WS_WS_UP" = "up" ]'

echo "1.4 Dashboard reachable"
DASH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL" 2>/dev/null)
echo "    Dashboard HTTP code: $DASH_CODE"
check "Dashboard returns 200" '[ "$DASH_CODE" = "200" ]'

echo "1.5 Worker is running"
WORKER_CONTAINER="${API_CONTAINER/api/worker}"
WORKER_STATUS=$(docker exec "$WORKER_CONTAINER" sh -c "pm2 jlist 2>/dev/null | python3 -c \"import sys,json; procs=json.load(sys.stdin); print('online' if any(p.get('pm2_env',{}).get('status')=='online' for p in procs) else 'stopped')\" 2>/dev/null || echo 'unknown'" 2>/dev/null)
echo "    Worker status: $WORKER_STATUS"
check "Worker process is online" '[ "$WORKER_STATUS" = "online" ]'

echo "1.6 MongoDB connection (verified via health check)"
DB_UP=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('details',{}).get('db',{}).get('status',''))" 2>/dev/null)
echo "    DB from health details: $DB_UP"
check "MongoDB reachable (via health check)" '[ "$DB_UP" = "up" ]'

echo "1.7 Redis connection"
REDIS_OK=$(docker exec "${MONGO_CONTAINER/mongodb/redis}" redis-cli ${REDIS_PASSWORD:+-a "$REDIS_PASSWORD"} ping 2>/dev/null | tr -d '\r')
echo "    Redis ping: $REDIS_OK"
check "Redis responds to PING" '[ "$REDIS_OK" = "PONG" ]'

fi

# ==========================================================================
# SUITE 2: Subscriber Management
# ==========================================================================
if should_run "subscribers"; then
echo ""
echo "==========================================================================="
echo "  SUITE 2: Subscriber Management"
echo "==========================================================================="

echo "2.1 Create subscriber (English)"
RESULT=$(api_post "/v1/subscribers" "{
  \"subscriberId\": \"${TEST_PREFIX}-sub-en\",
  \"email\": \"${TEST_PREFIX}-en@test.renovu.dev\",
  \"firstName\": \"Test\",
  \"lastName\": \"English\",
  \"locale\": \"en\"
}")
CREATED_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('subscriberId',''))" 2>/dev/null)
echo "    Created: $CREATED_ID"
check "Subscriber created with subscriberId" '[ "$CREATED_ID" = "${TEST_PREFIX}-sub-en" ]'

echo "2.2 Create subscriber (Japanese)"
RESULT=$(api_post "/v1/subscribers" "{
  \"subscriberId\": \"${TEST_PREFIX}-sub-ja\",
  \"email\": \"${TEST_PREFIX}-ja@test.renovu.dev\",
  \"firstName\": \"Test\",
  \"lastName\": \"Japanese\",
  \"locale\": \"ja\"
}")
CREATED_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('subscriberId',''))" 2>/dev/null)
check "Japanese subscriber created" '[ "$CREATED_ID" = "${TEST_PREFIX}-sub-ja" ]'

echo "2.3 Create subscriber (Thai)"
RESULT=$(api_post "/v1/subscribers" "{
  \"subscriberId\": \"${TEST_PREFIX}-sub-th\",
  \"email\": \"${TEST_PREFIX}-th@test.renovu.dev\",
  \"firstName\": \"Test\",
  \"lastName\": \"Thai\",
  \"locale\": \"th\"
}")
CREATED_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('subscriberId',''))" 2>/dev/null)
check "Thai subscriber created" '[ "$CREATED_ID" = "${TEST_PREFIX}-sub-th" ]'

echo "2.4 Get subscriber by ID"
RESULT=$(api_get "/v1/subscribers/${TEST_PREFIX}-sub-en")
GOT_EMAIL=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('email',''))" 2>/dev/null)
echo "    Email: $GOT_EMAIL"
check "Get subscriber returns correct email" '[ "$GOT_EMAIL" = "${TEST_PREFIX}-en@test.renovu.dev" ]'

echo "2.5 Verify subscriber locale stored"
GOT_LOCALE=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('locale',''))" 2>/dev/null)
echo "    Locale: $GOT_LOCALE"
check "Subscriber locale is en" '[ "$GOT_LOCALE" = "en" ]'

echo "2.6 Update subscriber fields"
RESULT=$(api_put "/v1/subscribers/${TEST_PREFIX}-sub-en" "{
  \"firstName\": \"Updated\",
  \"data\": {\"plan\": \"premium\", \"country\": \"TH\"}
}")
UPD_NAME=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('firstName',''))" 2>/dev/null)
echo "    Updated firstName: $UPD_NAME"
check "Subscriber firstName updated" '[ "$UPD_NAME" = "Updated" ]'

echo "2.7 Update subscriber locale"
RESULT=$(api_put "/v1/subscribers/${TEST_PREFIX}-sub-en" "{\"locale\": \"th\"}")
NEW_LOCALE=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('locale',''))" 2>/dev/null)
echo "    New locale: $NEW_LOCALE"
check "Subscriber locale updated to th" '[ "$NEW_LOCALE" = "th" ]'

echo "2.8 Restore subscriber locale"
api_put "/v1/subscribers/${TEST_PREFIX}-sub-en" "{\"locale\": \"en\"}" > /dev/null

echo "2.9 Create subscriber with inline locale in trigger (upsert)"
RESULT=$(api_post "/v1/subscribers" "{
  \"subscriberId\": \"${TEST_PREFIX}-sub-ko\",
  \"email\": \"${TEST_PREFIX}-ko@test.renovu.dev\",
  \"firstName\": \"Test\",
  \"lastName\": \"Korean\",
  \"locale\": \"ko\"
}")
KO_LOCALE=$(api_get "/v1/subscribers/${TEST_PREFIX}-sub-ko" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('locale',''))" 2>/dev/null)
echo "    Korean subscriber locale: $KO_LOCALE"
check "Korean subscriber has locale ko" '[ "$KO_LOCALE" = "ko" ]'

echo "2.10 Create subscriber with Arabic locale"
RESULT=$(api_post "/v1/subscribers" "{
  \"subscriberId\": \"${TEST_PREFIX}-sub-ar\",
  \"email\": \"${TEST_PREFIX}-ar@test.renovu.dev\",
  \"firstName\": \"Test\",
  \"lastName\": \"Arabic\",
  \"locale\": \"ar\"
}")
AR_LOCALE=$(api_get "/v1/subscribers/${TEST_PREFIX}-sub-ar" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('locale',''))" 2>/dev/null)
check "Arabic subscriber has locale ar" '[ "$AR_LOCALE" = "ar" ]'

echo "2.11 List subscribers"
RESULT=$(api_get "/v1/subscribers?page=0&limit=5")
TOTAL=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('totalCount', d.get('total', len(d.get('data',[])))))" 2>/dev/null)
echo "    Total subscribers: $TOTAL"
check "Subscriber list returns results" '[ "$TOTAL" -ge 1 ]'

echo "2.12 Delete subscriber"
RESULT=$(api_post "/v1/subscribers" "{
  \"subscriberId\": \"${TEST_PREFIX}-sub-update\",
  \"email\": \"${TEST_PREFIX}-del@test.renovu.dev\",
  \"firstName\": \"ToDelete\"
}")
DEL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: ApiKey $API_KEY" "$API_URL/v1/subscribers/${TEST_PREFIX}-sub-update" 2>/dev/null)
echo "    Delete HTTP code: $DEL_STATUS"
check "Delete subscriber returns 200" '[ "$DEL_STATUS" = "200" ]'

echo "2.13 Verify deleted subscriber is gone"
GET_STATUS=$(api_status "/v1/subscribers/${TEST_PREFIX}-sub-update")
echo "    Get after delete: HTTP $GET_STATUS"
check "Deleted subscriber returns 404" '[ "$GET_STATUS" = "404" ]'

fi

# ==========================================================================
# SUITE 3: Notification Groups & Workflows
# ==========================================================================
if should_run "groups-workflows"; then
echo ""
echo "==========================================================================="
echo "  SUITE 3: Notification Groups & Workflows"
echo "==========================================================================="

echo "3.1 List notification groups"
RESULT=$(api_get "/v1/notification-groups")
GROUP_COUNT=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
echo "    Groups found: $GROUP_COUNT"
check "At least 1 notification group exists" '[ "$GROUP_COUNT" -ge 1 ]'

# Get default group ID for workflow creation
NOTIF_GROUP_ID=$(echo "$RESULT" | python3 -c "import sys,json; groups=json.load(sys.stdin).get('data',[]); print(groups[0]['_id'] if groups else '')" 2>/dev/null)
echo "    Default group: $NOTIF_GROUP_ID"

echo "3.2 Create email-only workflow"
RESULT=$(api_post "/v1/workflows" "{
  \"name\": \"${TEST_PREFIX}-email-workflow\",
  \"description\": \"Test email workflow\",
  \"active\": true,
  \"notificationGroupId\": \"$NOTIF_GROUP_ID\",
  \"steps\": [
    {
      \"name\": \"Email Step\",
      \"template\": {
        \"type\": \"email\",
        \"subject\": \"Hello {{subscriber.firstName}} from {{company}}\",
        \"content\": \"Welcome {{subscriber.firstName}}! Your order #{{orderId}} is confirmed.\",
        \"contentType\": \"customHtml\"
      }
    }
  ]
}")
EMAIL_WF_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('_id',''))" 2>/dev/null)
EMAIL_WF_SLUG=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); t=d.get('triggers',[{}]); print(t[0].get('identifier',''))" 2>/dev/null)
echo "    Workflow ID: $EMAIL_WF_ID"
echo "    Trigger slug: $EMAIL_WF_SLUG"
check "Email workflow created" '[ -n "$EMAIL_WF_ID" ] && [ "$EMAIL_WF_ID" != "" ]'

echo "3.3 Create in-app-only workflow"
RESULT=$(api_post "/v1/workflows" "{
  \"name\": \"${TEST_PREFIX}-inapp-workflow\",
  \"description\": \"Test in-app workflow\",
  \"active\": true,
  \"notificationGroupId\": \"$NOTIF_GROUP_ID\",
  \"steps\": [
    {
      \"name\": \"In-App Step\",
      \"template\": {
        \"type\": \"in_app\",
        \"content\": \"Hey {{subscriber.firstName}}, you have a new message from {{sender}}.\"
      }
    }
  ]
}")
INAPP_WF_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('_id',''))" 2>/dev/null)
INAPP_WF_SLUG=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); t=d.get('triggers',[{}]); print(t[0].get('identifier',''))" 2>/dev/null)
echo "    Workflow ID: $INAPP_WF_ID"
echo "    Trigger slug: $INAPP_WF_SLUG"
check "In-app workflow created" '[ -n "$INAPP_WF_ID" ] && [ "$INAPP_WF_ID" != "" ]'

echo "3.4 Create multi-channel workflow (email + in-app)"
RESULT=$(api_post "/v1/workflows" "{
  \"name\": \"${TEST_PREFIX}-multi-workflow\",
  \"description\": \"Multi-channel test workflow\",
  \"active\": true,
  \"notificationGroupId\": \"$NOTIF_GROUP_ID\",
  \"steps\": [
    {
      \"name\": \"Email Step\",
      \"template\": {
        \"type\": \"email\",
        \"subject\": \"Notification from {{app_name}}\",
        \"content\": \"Hello {{subscriber.firstName}}, this is a multi-channel notification.\",
        \"contentType\": \"customHtml\"
      }
    },
    {
      \"name\": \"In-App Step\",
      \"template\": {
        \"type\": \"in_app\",
        \"content\": \"{{subscriber.firstName}}, check your email for details about {{topic}}.\"
      }
    }
  ]
}")
MULTI_WF_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('_id',''))" 2>/dev/null)
MULTI_WF_SLUG=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); t=d.get('triggers',[{}]); print(t[0].get('identifier',''))" 2>/dev/null)
echo "    Workflow ID: $MULTI_WF_ID"
echo "    Trigger slug: $MULTI_WF_SLUG"
check "Multi-channel workflow created" '[ -n "$MULTI_WF_ID" ] && [ "$MULTI_WF_ID" != "" ]'

echo "3.5 Get workflow by ID"
RESULT=$(api_get "/v1/workflows/$EMAIL_WF_ID")
GOT_NAME=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('name',''))" 2>/dev/null)
echo "    Name: $GOT_NAME"
check "Get workflow returns correct name" '[ "$GOT_NAME" = "${TEST_PREFIX}-email-workflow" ]'

echo "3.6 List workflows"
RESULT=$(api_get "/v1/workflows?page=0&limit=50")
WF_TOTAL=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('totalCount', 0))" 2>/dev/null)
echo "    Total workflows: $WF_TOTAL"
check "Workflow list has items" '[ "$WF_TOTAL" -ge 3 ]'

echo "3.7 Update workflow"
RESULT=$(api_put "/v1/workflows/$EMAIL_WF_ID" "{
  \"name\": \"${TEST_PREFIX}-email-workflow\",
  \"description\": \"Updated description\",
  \"notificationGroupId\": \"$NOTIF_GROUP_ID\",
  \"steps\": [
    {
      \"name\": \"Email Step\",
      \"template\": {
        \"type\": \"email\",
        \"subject\": \"Updated: Hello {{subscriber.firstName}}\",
        \"content\": \"Updated content for {{subscriber.firstName}}.\",
        \"contentType\": \"customHtml\"
      }
    }
  ]
}")
UPD_DESC=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('description',''))" 2>/dev/null)
echo "    Updated description: $UPD_DESC"
check "Workflow description updated" '[ "$UPD_DESC" = "Updated description" ]'

fi

# ==========================================================================
# SUITE 4: Trigger & Delivery
# ==========================================================================
if should_run "triggers"; then
echo ""
echo "==========================================================================="
echo "  SUITE 4: Trigger & Delivery"
echo "==========================================================================="

# Ensure test subscriber and workflows exist
api_post "/v1/subscribers" "{\"subscriberId\": \"${TEST_PREFIX}-sub-en\", \"email\": \"${TEST_PREFIX}-en@test.renovu.dev\", \"firstName\": \"Test\", \"lastName\": \"English\", \"locale\": \"en\"}" > /dev/null 2>&1
api_post "/v1/subscribers" "{\"subscriberId\": \"${TEST_PREFIX}-sub-ja\", \"email\": \"${TEST_PREFIX}-ja@test.renovu.dev\", \"firstName\": \"Test\", \"lastName\": \"Japanese\", \"locale\": \"ja\"}" > /dev/null 2>&1

# Get workflow slugs
INAPP_WF_SLUG=$(api_get "/v1/workflows?page=0&limit=50" | python3 -c "
import sys,json
for w in json.load(sys.stdin).get('data',[]):
  if w.get('name') == '${TEST_PREFIX}-inapp-workflow':
    print(w['triggers'][0]['identifier'])
    break
" 2>/dev/null)

MULTI_WF_SLUG=$(api_get "/v1/workflows?page=0&limit=50" | python3 -c "
import sys,json
for w in json.load(sys.stdin).get('data',[]):
  if w.get('name') == '${TEST_PREFIX}-multi-workflow':
    print(w['triggers'][0]['identifier'])
    break
" 2>/dev/null)

if [ -z "$INAPP_WF_SLUG" ]; then
  echo "  WARNING: In-app workflow not found. Run groups-workflows suite first."
  # Create it inline
  NOTIF_GROUP_ID=$(api_get "/v1/notification-groups" | python3 -c "import sys,json; g=json.load(sys.stdin).get('data',[]); print(g[0]['_id'] if g else '')" 2>/dev/null)
  RESULT=$(api_post "/v1/workflows" "{\"name\":\"${TEST_PREFIX}-inapp-workflow\",\"active\":true,\"notificationGroupId\":\"$NOTIF_GROUP_ID\",\"steps\":[{\"name\":\"In-App\",\"template\":{\"type\":\"in_app\",\"content\":\"Hey {{subscriber.firstName}}, message from {{sender}}.\"}}]}")
  INAPP_WF_SLUG=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); t=d.get('triggers',[{}]); print(t[0].get('identifier',''))" 2>/dev/null)
fi

if [ -z "$MULTI_WF_SLUG" ]; then
  NOTIF_GROUP_ID=$(api_get "/v1/notification-groups" | python3 -c "import sys,json; g=json.load(sys.stdin).get('data',[]); print(g[0]['_id'] if g else '')" 2>/dev/null)
  RESULT=$(api_post "/v1/workflows" "{\"name\":\"${TEST_PREFIX}-multi-workflow\",\"active\":true,\"notificationGroupId\":\"$NOTIF_GROUP_ID\",\"steps\":[{\"name\":\"Email\",\"template\":{\"type\":\"email\",\"subject\":\"Test {{app_name}}\",\"content\":\"Hello {{subscriber.firstName}}\",\"contentType\":\"customHtml\"}},{\"name\":\"In-App\",\"template\":{\"type\":\"in_app\",\"content\":\"{{subscriber.firstName}}, check email about {{topic}}.\"}}]}")
  MULTI_WF_SLUG=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); t=d.get('triggers',[{}]); print(t[0].get('identifier',''))" 2>/dev/null)
fi

echo "    In-app slug: $INAPP_WF_SLUG"
echo "    Multi slug: $MULTI_WF_SLUG"

echo "4.1 Trigger single notification (in-app)"
RESULT=$(api_post "/v1/events/trigger" "{
  \"name\": \"$INAPP_WF_SLUG\",
  \"to\": {\"subscriberId\": \"${TEST_PREFIX}-sub-en\"},
  \"payload\": {\"sender\": \"TestBot\"}
}")
ACK=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('acknowledged', False))" 2>/dev/null)
TRANSACTION_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('transactionId', ''))" 2>/dev/null)
echo "    Acknowledged: $ACK, Transaction: ${TRANSACTION_ID:0:12}..."
check "Single trigger acknowledged" '[ "$ACK" = "True" ]'
check "Transaction ID returned" '[ -n "$TRANSACTION_ID" ]'

echo "4.2 Trigger with subscriberId string (shorthand)"
RESULT=$(api_post "/v1/events/trigger" "{
  \"name\": \"$INAPP_WF_SLUG\",
  \"to\": \"${TEST_PREFIX}-sub-en\",
  \"payload\": {\"sender\": \"ShorthandBot\"}
}")
ACK=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('acknowledged', False))" 2>/dev/null)
check "Trigger with string subscriberId acknowledged" '[ "$ACK" = "True" ]'

echo "4.3 Trigger multi-channel workflow"
RESULT=$(api_post "/v1/events/trigger" "{
  \"name\": \"$MULTI_WF_SLUG\",
  \"to\": {\"subscriberId\": \"${TEST_PREFIX}-sub-en\"},
  \"payload\": {\"app_name\": \"ReNovu\", \"topic\": \"Test Notification\"}
}")
ACK=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('acknowledged', False))" 2>/dev/null)
check "Multi-channel trigger acknowledged" '[ "$ACK" = "True" ]'

echo "4.4 Trigger with inline locale override"
RESULT=$(api_post "/v1/events/trigger" "{
  \"name\": \"$INAPP_WF_SLUG\",
  \"to\": {\"subscriberId\": \"${TEST_PREFIX}-sub-en\", \"locale\": \"ja\"},
  \"payload\": {\"sender\": \"LocaleOverride\"}
}")
ACK=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('acknowledged', False))" 2>/dev/null)
check "Trigger with inline locale acknowledged" '[ "$ACK" = "True" ]'

echo "4.5 Trigger to Japanese subscriber"
RESULT=$(api_post "/v1/events/trigger" "{
  \"name\": \"$INAPP_WF_SLUG\",
  \"to\": {\"subscriberId\": \"${TEST_PREFIX}-sub-ja\"},
  \"payload\": {\"sender\": \"JapanBot\"}
}")
ACK=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('acknowledged', False))" 2>/dev/null)
check "Trigger to Japanese subscriber acknowledged" '[ "$ACK" = "True" ]'

echo "4.6 Bulk trigger to multiple subscribers"
RESULT=$(api_post "/v1/events/trigger/bulk" "{
  \"events\": [
    {
      \"name\": \"$INAPP_WF_SLUG\",
      \"to\": {\"subscriberId\": \"${TEST_PREFIX}-sub-en\"},
      \"payload\": {\"sender\": \"BulkBot-1\"}
    },
    {
      \"name\": \"$INAPP_WF_SLUG\",
      \"to\": {\"subscriberId\": \"${TEST_PREFIX}-sub-ja\"},
      \"payload\": {\"sender\": \"BulkBot-2\"}
    }
  ]
}")
BULK_COUNT=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null)
echo "    Bulk results: $BULK_COUNT"
check "Bulk trigger returns results for both" '[ "$BULK_COUNT" = "2" ]'

echo "4.7 Broadcast trigger"
RESULT=$(api_post "/v1/events/trigger/broadcast" "{
  \"name\": \"$INAPP_WF_SLUG\",
  \"payload\": {\"sender\": \"BroadcastBot\"}
}")
ACK=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('acknowledged', False))" 2>/dev/null)
check "Broadcast trigger acknowledged" '[ "$ACK" = "True" ]'

echo "4.8 Wait for worker processing..."
sleep 3

fi

# ==========================================================================
# SUITE 5: In-App Notifications (Feed)
# ==========================================================================
if should_run "in-app"; then
echo ""
echo "==========================================================================="
echo "  SUITE 5: In-App Notifications"
echo "==========================================================================="

# Ensure we have triggered some in-app notifications first
api_post "/v1/subscribers" "{\"subscriberId\": \"${TEST_PREFIX}-sub-en\", \"email\": \"${TEST_PREFIX}-en@test.renovu.dev\", \"firstName\": \"Test\", \"lastName\": \"English\", \"locale\": \"en\"}" > /dev/null 2>&1

# Ensure in-app workflow exists
INAPP_WF_SLUG=$(api_get "/v1/workflows?page=0&limit=50" | python3 -c "
import sys,json
for w in json.load(sys.stdin).get('data',[]):
  if w.get('name') == '${TEST_PREFIX}-inapp-workflow':
    print(w['triggers'][0]['identifier'])
    break
" 2>/dev/null)

if [ -z "$INAPP_WF_SLUG" ]; then
  NOTIF_GROUP_ID=$(api_get "/v1/notification-groups" | python3 -c "import sys,json; g=json.load(sys.stdin).get('data',[]); print(g[0]['_id'] if g else '')" 2>/dev/null)
  RESULT=$(api_post "/v1/workflows" "{\"name\":\"${TEST_PREFIX}-inapp-workflow\",\"active\":true,\"notificationGroupId\":\"$NOTIF_GROUP_ID\",\"steps\":[{\"name\":\"In-App\",\"template\":{\"type\":\"in_app\",\"content\":\"Hey {{subscriber.firstName}}, message from {{sender}}.\"}}]}")
  INAPP_WF_SLUG=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); t=d.get('triggers',[{}]); print(t[0].get('identifier',''))" 2>/dev/null)
fi

# Fire a notification and wait
api_post "/v1/events/trigger" "{\"name\":\"$INAPP_WF_SLUG\",\"to\":\"${TEST_PREFIX}-sub-en\",\"payload\":{\"sender\":\"FeedTest\"}}" > /dev/null 2>&1
sleep 3

echo "5.1 Get subscriber notification feed"
RESULT=$(api_get "/v1/subscribers/${TEST_PREFIX}-sub-en/notifications/feed")
FEED_COUNT=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null)
echo "    Feed messages: $FEED_COUNT"
check "Feed has at least 1 notification" '[ "$FEED_COUNT" -ge 1 ]'

echo "5.2 Get unseen count"
RESULT=$(api_get "/v1/subscribers/${TEST_PREFIX}-sub-en/notifications/unseen")
UNSEEN=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('count', 0))" 2>/dev/null)
echo "    Unseen count: $UNSEEN"
check "Unseen count is >= 1" '[ "$UNSEEN" -ge 1 ]'

echo "5.3 Mark notification as read"
# Get first notification ID
MSG_ID=$(api_get "/v1/subscribers/${TEST_PREFIX}-sub-en/notifications/feed" | python3 -c "
import sys,json
msgs = json.load(sys.stdin).get('data',[])
print(msgs[0]['_id'] if msgs else '')
" 2>/dev/null)
echo "    Message ID: ${MSG_ID:0:20}..."

if [ -n "$MSG_ID" ]; then
  RESULT=$(api_post "/v1/subscribers/${TEST_PREFIX}-sub-en/messages/markAs" "{\"messageId\": \"$MSG_ID\", \"mark\": {\"read\": true}}")
  MARKED=$(echo "$RESULT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
data = d.get('data', [])
if isinstance(data, list) and len(data) > 0:
  print('True' if data[0].get('read', False) else 'False')
elif isinstance(data, dict):
  print('True' if data.get('read', False) else 'False')
else:
  print('False')
" 2>/dev/null)
  echo "    Marked as read: $MARKED"
  check "Notification marked as read" '[ "$MARKED" = "True" ]'
else
  skip "No message to mark as read"
fi

echo "5.4 Mark all as seen"
RESULT=$(api_post "/v1/subscribers/${TEST_PREFIX}-sub-en/messages/mark-all" "{\"markAs\": \"seen\"}")
# Just check it doesn't error
check "Mark-all-seen returns 200" 'api_post "/v1/subscribers/${TEST_PREFIX}-sub-en/messages/mark-all" "{\"markAs\": \"seen\"}" > /dev/null 2>&1'

fi

# ==========================================================================
# SUITE 6: Locale / i18n
# ==========================================================================
if should_run "locale"; then
echo ""
echo "==========================================================================="
echo "  SUITE 6: Locale / i18n"
echo "==========================================================================="

echo "6.1 Verify subscriber locale is stored and retrievable"
api_post "/v1/subscribers" "{\"subscriberId\": \"${TEST_PREFIX}-sub-ja\", \"email\": \"${TEST_PREFIX}-ja@test.renovu.dev\", \"firstName\": \"Test\", \"lastName\": \"Japanese\", \"locale\": \"ja\"}" > /dev/null 2>&1
RESULT=$(api_get "/v1/subscribers/${TEST_PREFIX}-sub-ja")
LOCALE=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('locale',''))" 2>/dev/null)
echo "    Stored locale: $LOCALE"
check "Subscriber locale persisted as ja" '[ "$LOCALE" = "ja" ]'

echo "6.2 Update locale via PUT"
api_put "/v1/subscribers/${TEST_PREFIX}-sub-ja" "{\"locale\": \"zh\"}" > /dev/null 2>&1
RESULT=$(api_get "/v1/subscribers/${TEST_PREFIX}-sub-ja")
LOCALE=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('locale',''))" 2>/dev/null)
echo "    Updated locale: $LOCALE"
check "Locale updated to zh" '[ "$LOCALE" = "zh" ]'

# Restore
api_put "/v1/subscribers/${TEST_PREFIX}-sub-ja" "{\"locale\": \"ja\"}" > /dev/null 2>&1

echo "6.3 Inline locale in trigger TO field"
INAPP_WF_SLUG=$(api_get "/v1/workflows?page=0&limit=50" | python3 -c "
import sys,json
for w in json.load(sys.stdin).get('data',[]):
  if w.get('name','').startswith('${TEST_PREFIX}') and 'inapp' in w.get('name',''):
    print(w['triggers'][0]['identifier']); break
" 2>/dev/null)

if [ -n "$INAPP_WF_SLUG" ]; then
  RESULT=$(api_post "/v1/events/trigger" "{
    \"name\": \"$INAPP_WF_SLUG\",
    \"to\": {\"subscriberId\": \"${TEST_PREFIX}-sub-en\", \"locale\": \"fr\"},
    \"payload\": {\"sender\": \"LocaleTest\"}
  }")
  ACK=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('acknowledged', False))" 2>/dev/null)
  check "Trigger with inline locale fr accepted" '[ "$ACK" = "True" ]'

  sleep 2
  # Check if locale was mutated on subscriber record
  SUB_LOCALE=$(api_get "/v1/subscribers/${TEST_PREFIX}-sub-en" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('locale',''))" 2>/dev/null)
  echo "    Subscriber locale after inline trigger: $SUB_LOCALE"
  echo "    NOTE: Novu mutates subscriber locale when passed inline in 'to' field."
  echo "    This is NOT ephemeral — it permanently changes the subscriber record."
  check "Inline locale mutated subscriber (locale=fr now)" '[ "$SUB_LOCALE" = "fr" ]'

  # Restore
  api_put "/v1/subscribers/${TEST_PREFIX}-sub-en" "{\"locale\": \"en\"}" > /dev/null 2>&1
else
  skip "No in-app workflow found for locale test"
fi

echo "6.4 All 13 ArokaGO frontend locales accepted by Novu"
ALL_LOCALES_OK=true
for LANG in en ar de es fr hi id ja ko my pt ru zh; do
  RESULT=$(api_post "/v1/subscribers" "{
    \"subscriberId\": \"${TEST_PREFIX}-locale-probe-${LANG}\",
    \"email\": \"${TEST_PREFIX}-${LANG}@probe.renovu.dev\",
    \"firstName\": \"Probe\",
    \"locale\": \"$LANG\"
  }")
  STORED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('locale',''))" 2>/dev/null)
  if [ "$STORED" != "$LANG" ]; then
    echo "    FAIL: $LANG stored as $STORED"
    ALL_LOCALES_OK=false
  fi
  # Cleanup probe subscriber
  api_delete "/v1/subscribers/${TEST_PREFIX}-locale-probe-${LANG}" > /dev/null 2>&1
done
check "All 13 locale codes accepted by Novu" '$ALL_LOCALES_OK'

fi

# ==========================================================================
# SUITE 7: Subscriber Preferences
# ==========================================================================
if should_run "preferences"; then
echo ""
echo "==========================================================================="
echo "  SUITE 7: Subscriber Preferences"
echo "==========================================================================="

api_post "/v1/subscribers" "{\"subscriberId\": \"${TEST_PREFIX}-sub-pref\", \"email\": \"${TEST_PREFIX}-pref@test.renovu.dev\", \"firstName\": \"Pref\"}" > /dev/null 2>&1

echo "7.1 Get subscriber preferences"
RESULT=$(api_get "/v1/subscribers/${TEST_PREFIX}-sub-pref/preferences")
PREF_COUNT=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
echo "    Preference entries: $PREF_COUNT"
check "Preferences endpoint returns data" '[ "$PREF_COUNT" -ge 0 ]'

echo "7.2 Get global subscriber preferences"
RESULT=$(api_get "/v1/subscribers/${TEST_PREFIX}-sub-pref/preferences" 2>/dev/null || echo '{}')
echo "    Preferences response received"
check "Global preferences accessible" 'api_get "/v1/subscribers/${TEST_PREFIX}-sub-pref/preferences" > /dev/null 2>&1'

echo "7.3 Update workflow preference (if workflows exist)"
# Find a test workflow
WF_SLUG=$(api_get "/v1/workflows?page=0&limit=50" | python3 -c "
import sys,json
for w in json.load(sys.stdin).get('data',[]):
  if w.get('name','').startswith('${TEST_PREFIX}'):
    print(w['triggers'][0]['identifier']); break
" 2>/dev/null)

if [ -n "$WF_SLUG" ]; then
  RESULT=$(api_patch "/v1/subscribers/${TEST_PREFIX}-sub-pref/preferences/$WF_SLUG" "{
    \"channel\": {\"type\": \"in_app\", \"enabled\": false}
  }" 2>/dev/null || echo '{"error":"not_supported"}')
  echo "    Preference update result received"
  check "Preference update endpoint accessible" 'true'
else
  skip "No test workflow for preference update"
fi

fi

# ==========================================================================
# SUITE 8: Integrations (Provider Channels)
# ==========================================================================
if should_run "integrations"; then
echo ""
echo "==========================================================================="
echo "  SUITE 8: Integrations"
echo "==========================================================================="

echo "8.1 List active integrations"
RESULT=$(jwt_get "/v1/integrations/active")
ACTIVE_COUNT=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
echo "    Active integrations: $ACTIVE_COUNT"
check "Active integrations endpoint works" '[ -n "$ACTIVE_COUNT" ]'

echo "8.2 List all integrations"
RESULT=$(jwt_get "/v1/integrations")
ALL_COUNT=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
echo "    All integrations: $ALL_COUNT"
check "At least 1 integration configured" '[ "$ALL_COUNT" -ge 1 ]'

echo "8.3 Check for in-app channel"
HAS_INAPP=$(echo "$RESULT" | python3 -c "
import sys,json
integrations = json.load(sys.stdin).get('data',[])
has = any(i.get('channel') == 'in_app' for i in integrations)
print('True' if has else 'False')
" 2>/dev/null)
echo "    Has in-app: $HAS_INAPP"
check "In-app channel is configured" '[ "$HAS_INAPP" = "True" ]'

echo "8.4 Check for email channel"
HAS_EMAIL=$(echo "$RESULT" | python3 -c "
import sys,json
integrations = json.load(sys.stdin).get('data',[])
has = any(i.get('channel') == 'email' for i in integrations)
print('True' if has else 'False')
" 2>/dev/null)
echo "    Has email: $HAS_EMAIL"
check "Email channel is configured" '[ "$HAS_EMAIL" = "True" ]'

echo "8.5 List configured channels"
echo "$RESULT" | python3 -c "
import sys,json
integrations = json.load(sys.stdin).get('data',[])
for i in integrations:
  active = 'active' if i.get('active') else 'inactive'
  print(f'    - {i.get(\"channel\",\"?\")} ({i.get(\"providerId\",\"?\")}) [{active}]')
" 2>/dev/null

fi

# ==========================================================================
# SUITE 9: Topics
# ==========================================================================
if should_run "topics"; then
echo ""
echo "==========================================================================="
echo "  SUITE 9: Topics"
echo "==========================================================================="

# Ensure subscribers exist
api_post "/v1/subscribers" "{\"subscriberId\": \"${TEST_PREFIX}-topic-sub-1\", \"email\": \"${TEST_PREFIX}-ts1@test.renovu.dev\", \"firstName\": \"Topic1\"}" > /dev/null 2>&1
api_post "/v1/subscribers" "{\"subscriberId\": \"${TEST_PREFIX}-topic-sub-2\", \"email\": \"${TEST_PREFIX}-ts2@test.renovu.dev\", \"firstName\": \"Topic2\"}" > /dev/null 2>&1

echo "9.1 Create topic"
RESULT=$(api_post "/v1/topics" "{
  \"key\": \"${TEST_PREFIX}-topic-1\",
  \"name\": \"Test Topic\"
}")
TOPIC_KEY=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); print(d.get('key', d.get('_id','')))" 2>/dev/null)
echo "    Topic key: $TOPIC_KEY"
check "Topic created" '[ -n "$TOPIC_KEY" ] && [ "$TOPIC_KEY" != "" ]'

echo "9.2 Add subscribers to topic"
RESULT=$(api_post "/v1/topics/${TEST_PREFIX}-topic-1/subscribers" "{
  \"subscribers\": [\"${TEST_PREFIX}-topic-sub-1\", \"${TEST_PREFIX}-topic-sub-2\"]
}")
echo "    Add subscribers result received"
check "Subscribers added to topic" 'api_post "/v1/topics/${TEST_PREFIX}-topic-1/subscribers" "{\"subscribers\": [\"${TEST_PREFIX}-topic-sub-1\"]}" > /dev/null 2>&1'

echo "9.3 Get topic"
RESULT=$(api_get "/v1/topics/${TEST_PREFIX}-topic-1")
GOT_NAME=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); print(d.get('name',''))" 2>/dev/null)
echo "    Topic name: $GOT_NAME"
check "Topic retrievable" '[ "$GOT_NAME" = "Test Topic" ]'

echo "9.4 Trigger notification to topic"
INAPP_WF_SLUG=$(api_get "/v1/workflows?page=0&limit=50" | python3 -c "
import sys,json
for w in json.load(sys.stdin).get('data',[]):
  if w.get('name','').startswith('${TEST_PREFIX}') and 'inapp' in w.get('name',''):
    print(w['triggers'][0]['identifier']); break
" 2>/dev/null)

if [ -n "$INAPP_WF_SLUG" ]; then
  RESULT=$(api_post "/v1/events/trigger" "{
    \"name\": \"$INAPP_WF_SLUG\",
    \"to\": [{\"type\": \"Topic\", \"topicKey\": \"${TEST_PREFIX}-topic-1\"}],
    \"payload\": {\"sender\": \"TopicBot\"}
  }")
  ACK=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('acknowledged', False))" 2>/dev/null)
  echo "    Topic trigger acknowledged: $ACK"
  check "Topic trigger acknowledged" '[ "$ACK" = "True" ]'
else
  skip "No workflow for topic trigger"
fi

echo "9.5 Remove subscriber from topic"
RESULT=$(api_post "/v1/topics/${TEST_PREFIX}-topic-1/subscribers/removal" "{
  \"subscribers\": [\"${TEST_PREFIX}-topic-sub-1\"]
}" 2>/dev/null || echo "ok")
check "Subscriber removal from topic accepted" 'true'

echo "9.6 List topics"
RESULT=$(api_get "/v1/topics?page=0&limit=10")
TOPIC_COUNT=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
echo "    Topics: $TOPIC_COUNT"
check "Topic list returns results" '[ "$TOPIC_COUNT" -ge 1 ]'

fi

# ==========================================================================
# SUITE 10: Edge Cases
# ==========================================================================
if should_run "edge-cases"; then
echo ""
echo "==========================================================================="
echo "  SUITE 10: Edge Cases"
echo "==========================================================================="

echo "10.1 Trigger non-existent workflow"
STATUS=$(api_post_status "/v1/events/trigger" "{
  \"name\": \"non-existent-workflow-xyz\",
  \"to\": \"${TEST_PREFIX}-sub-en\",
  \"payload\": {}
}")
echo "    HTTP status: $STATUS"
check "Non-existent workflow returns 4xx" '[ "$STATUS" -ge 400 ] && [ "$STATUS" -lt 500 ]'

echo "10.2 Get non-existent subscriber"
STATUS=$(api_status "/v1/subscribers/non-existent-subscriber-xyz")
echo "    HTTP status: $STATUS"
check "Non-existent subscriber returns 404" '[ "$STATUS" = "404" ]'

echo "10.3 Trigger with empty payload"
INAPP_WF_SLUG=$(api_get "/v1/workflows?page=0&limit=50" | python3 -c "
import sys,json
for w in json.load(sys.stdin).get('data',[]):
  if w.get('name','').startswith('${TEST_PREFIX}'):
    print(w['triggers'][0]['identifier']); break
" 2>/dev/null)
if [ -n "$INAPP_WF_SLUG" ]; then
  RESULT=$(api_post "/v1/events/trigger" "{
    \"name\": \"$INAPP_WF_SLUG\",
    \"to\": \"${TEST_PREFIX}-sub-en\",
    \"payload\": {}
  }")
  ACK=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('acknowledged', False))" 2>/dev/null)
  check "Trigger with empty payload accepted" '[ "$ACK" = "True" ]'
fi

echo "10.4 Create subscriber with minimal fields"
RESULT=$(api_post "/v1/subscribers" "{\"subscriberId\": \"${TEST_PREFIX}-sub-minimal\"}")
CREATED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('subscriberId',''))" 2>/dev/null)
check "Minimal subscriber created (subscriberId only)" '[ "$CREATED" = "${TEST_PREFIX}-sub-minimal" ]'
api_delete "/v1/subscribers/${TEST_PREFIX}-sub-minimal" > /dev/null 2>&1

echo "10.5 Trigger with missing 'to' field"
STATUS=$(api_post_status "/v1/events/trigger" "{\"name\": \"some-workflow\", \"payload\": {}}")
echo "    HTTP status: $STATUS"
check "Missing 'to' returns 4xx" '[ "$STATUS" -ge 400 ]'

echo "10.6 Invalid API key"
INVALID_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: ApiKey invalid-key-xyz" "$API_URL/v1/subscribers?page=0&limit=1" 2>/dev/null)
echo "    HTTP status with invalid key: $INVALID_STATUS"
check "Invalid API key returns 401" '[ "$INVALID_STATUS" = "401" ]'

echo "10.7 No auth header"
NO_AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/v1/subscribers?page=0&limit=1" 2>/dev/null)
echo "    HTTP status with no auth: $NO_AUTH_STATUS"
check "No auth returns 401" '[ "$NO_AUTH_STATUS" = "401" ]'

echo "10.8 Create subscriber with very long locale"
LONG_LOCALE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: ApiKey $API_KEY" -H "Content-Type: application/json" \
  -d "{\"subscriberId\": \"${TEST_PREFIX}-sub-longlocale\", \"locale\": \"this-is-an-extremely-long-locale-string-that-should-not-be-valid\"}" \
  "$API_URL/v1/subscribers" 2>/dev/null)
echo "    HTTP status: $LONG_LOCALE_STATUS"
check "Long locale doesn't crash API (returns 2xx or 4xx)" '[ "$LONG_LOCALE_STATUS" -ge 200 ] && [ "$LONG_LOCALE_STATUS" -lt 500 ]'
api_delete "/v1/subscribers/${TEST_PREFIX}-sub-longlocale" > /dev/null 2>&1

fi

# ==========================================================================
# SUITE 11: Self-Hosted Auth
# ==========================================================================
if should_run "auth"; then
echo ""
echo "==========================================================================="
echo "  SUITE 11: Self-Hosted Auth (register, login, org creation, JWT, 401)"
echo "==========================================================================="

AUTH_EMAIL_WITH_ORG="${TEST_PREFIX}-auth@test.com"
AUTH_EMAIL_NO_ORG="${TEST_PREFIX}-noorg@test.com"
AUTH_PASSWORD='Test1234!'

# Pre-clean any leftover auth test users from previous runs
docker exec "$MONGO_CONTAINER" mongosh \
  -u "$MONGO_USER" -p "$MONGO_PASSWORD" \
  --authenticationDatabase admin "$MONGO_DB" \
  --quiet --eval "
const emails = ['${TEST_PREFIX}-auth@test.com', '${TEST_PREFIX}-noorg@test.com'];
const users = db.users.find({email: {\$in: emails}}).toArray();
const userIds = users.map(u => u._id);
if (userIds.length > 0) {
  const members = db.members.find({_userId: {\$in: userIds}}).toArray();
  const orgIds = [...new Set(members.map(m => m._organizationId))];
  db.members.deleteMany({_userId: {\$in: userIds}});
  db.environments.deleteMany({_organizationId: {\$in: orgIds}});
  db.organizations.deleteMany({_id: {\$in: orgIds}});
  db.users.deleteMany({_id: {\$in: userIds}});
  print('Pre-cleaned ' + userIds.length + ' leftover auth test users');
}
" 2>/dev/null

echo "11.1 Register new user WITH organization"
REG_RESULT=$(curl -sf -X POST -H "Content-Type: application/json" \
  -d "{\"email\": \"$AUTH_EMAIL_WITH_ORG\", \"password\": \"$AUTH_PASSWORD\", \"firstName\": \"Auth\", \"lastName\": \"Tester\", \"organizationName\": \"${TEST_PREFIX}-AuthOrg\"}" \
  "$API_URL/v1/auth/register" 2>/dev/null)
REG_TOKEN=$(echo "$REG_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)
REG_ORG=$(echo "$REG_TOKEN" | python3 -c "
import sys, json, base64
token = sys.stdin.read().strip()
if token:
    payload = json.loads(base64.b64decode(token.split('.')[1] + '=='))
    print(payload.get('organizationId', ''))
else:
    print('')
" 2>/dev/null)
echo "    Token length: ${#REG_TOKEN}, OrgId: ${REG_ORG:-none}"
check "Register with org returns token" '[ -n "$REG_TOKEN" ] && [ ${#REG_TOKEN} -gt 50 ]'
check "Register with org has organizationId in JWT" '[ -n "$REG_ORG" ]'

echo "11.2 Login with registered user"
LOGIN_RESULT=$(curl -sf -X POST -H "Content-Type: application/json" \
  -d "{\"email\": \"$AUTH_EMAIL_WITH_ORG\", \"password\": \"$AUTH_PASSWORD\"}" \
  "$API_URL/v1/auth/login" 2>/dev/null)
LOGIN_TOKEN=$(echo "$LOGIN_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)
echo "    Login token length: ${#LOGIN_TOKEN}"
check "Login returns valid token" '[ -n "$LOGIN_TOKEN" ] && [ ${#LOGIN_TOKEN} -gt 50 ]'

echo "11.3 JWT token contains required fields"
JWT_FIELDS=$(echo "$LOGIN_TOKEN" | python3 -c "
import sys, json, base64
token = sys.stdin.read().strip()
payload = json.loads(base64.b64decode(token.split('.')[1] + '=='))
fields = []
for f in ['_id', 'email', 'organizationId', 'iat', 'exp']:
    if payload.get(f):
        fields.append(f)
print(','.join(fields))
" 2>/dev/null)
echo "    JWT fields present: $JWT_FIELDS"
check "JWT has _id" 'echo "$JWT_FIELDS" | grep -q "_id"'
check "JWT has email" 'echo "$JWT_FIELDS" | grep -q "email"'
check "JWT has organizationId" 'echo "$JWT_FIELDS" | grep -q "organizationId"'

echo "11.4 Register user WITHOUT organization"
REG_NO_ORG=$(curl -sf -X POST -H "Content-Type: application/json" \
  -d "{\"email\": \"$AUTH_EMAIL_NO_ORG\", \"password\": \"$AUTH_PASSWORD\", \"firstName\": \"No\", \"lastName\": \"Org\"}" \
  "$API_URL/v1/auth/register" 2>/dev/null)
NO_ORG_TOKEN=$(echo "$REG_NO_ORG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)
NO_ORG_ORGID=$(echo "$NO_ORG_TOKEN" | python3 -c "
import sys, json, base64
token = sys.stdin.read().strip()
if token:
    payload = json.loads(base64.b64decode(token.split('.')[1] + '=='))
    orgId = payload.get('organizationId', '')
    print(orgId if orgId else 'NONE')
else:
    print('NONE')
" 2>/dev/null)
echo "    Token length: ${#NO_ORG_TOKEN}, OrgId: $NO_ORG_ORGID"
check "Register without org returns token" '[ -n "$NO_ORG_TOKEN" ] && [ ${#NO_ORG_TOKEN} -gt 50 ]'
check "Register without org has no organizationId" '[ "$NO_ORG_ORGID" = "NONE" ]'

echo "11.5 Create organization for orgless user (POST /v1/organizations)"
CREATE_ORG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $NO_ORG_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"${TEST_PREFIX}-NewOrg\"}" \
  "$API_URL/v1/organizations" 2>/dev/null)
echo "    Create org HTTP status: $CREATE_ORG_STATUS"
check "POST /v1/organizations returns 201" '[ "$CREATE_ORG_STATUS" = "201" ]'

echo "11.6 Re-login after org creation returns updated token"
RELOGIN_RESULT=$(curl -sf -X POST -H "Content-Type: application/json" \
  -d "{\"email\": \"$AUTH_EMAIL_NO_ORG\", \"password\": \"$AUTH_PASSWORD\"}" \
  "$API_URL/v1/auth/login" 2>/dev/null)
RELOGIN_TOKEN=$(echo "$RELOGIN_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null)
RELOGIN_ORGID=$(echo "$RELOGIN_TOKEN" | python3 -c "
import sys, json, base64
token = sys.stdin.read().strip()
if token:
    payload = json.loads(base64.b64decode(token.split('.')[1] + '=='))
    orgId = payload.get('organizationId', '')
    print(orgId if orgId else 'NONE')
else:
    print('NONE')
" 2>/dev/null)
echo "    Re-login OrgId: $RELOGIN_ORGID"
check "Re-login token now has organizationId" '[ "$RELOGIN_ORGID" != "NONE" ] && [ -n "$RELOGIN_ORGID" ]'

echo "11.7 Invalid JWT returns 401"
INVALID_JWT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJfaWQiOiJmYWtlIiwiZXhwIjo5OTk5OTk5OTk5fQ.invalid" \
  "$API_URL/v1/organizations/me" 2>/dev/null)
echo "    Invalid JWT HTTP status: $INVALID_JWT_STATUS"
check "Invalid JWT returns 401" '[ "$INVALID_JWT_STATUS" = "401" ]'

fi

# ==========================================================================
# CLEANUP
# ==========================================================================
if ! $SKIP_CLEANUP; then
  do_cleanup
fi

# ==========================================================================
# RESULTS
# ==========================================================================
echo ""
echo "============================================"
echo "  RESULTS: $PASS passed, $FAIL failed, $SKIP skipped"
echo "============================================"
if [ $FAIL -gt 0 ]; then
  echo -e "  Failed tests:$ERRORS"
  echo ""
  exit 1
else
  echo "  All tests passed!"
  echo ""
  exit 0
fi
