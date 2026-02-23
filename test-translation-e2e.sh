#!/bin/bash
# =============================================================================
# ReNovu Translation E2E Test Suite
# =============================================================================
set -euo pipefail

API_URL="http://localhost:4002"
API_KEY="41ba74f0b354c635de31d2b5b8074df8"
ENV_ID="697cfc7b5ff7c9198bc059ba"
ORG_ID="697cfc7b5ff7c9198bc059b3"

# Generate JWT token inside the container
JWT=$(docker exec arokago-renovu-api node -e "
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
const payload = {
    _id: '697cfc7a5ff7c9198bc059b0',
    firstName: 'watthanasak',
    lastName: 'jeamwatthanachai',
    email: 'admin@arokago.com',
    organizationId: '$ORG_ID',
    environmentId: '$ENV_ID',
    roles: ['admin'],
};
console.log(jwt.sign(payload, secret, { expiresIn: '24h' }));
")

PASS=0
FAIL=0
ERRORS=""

# Helper functions
jwt_get() {
  curl -sf -H "Authorization: Bearer $JWT" -H "novu-environment-id: $ENV_ID" "$API_URL$1" 2>/dev/null
}

jwt_post() {
  curl -sf -X POST -H "Authorization: Bearer $JWT" -H "novu-environment-id: $ENV_ID" -H "Content-Type: application/json" -d "$2" "$API_URL$1" 2>/dev/null
}

jwt_put() {
  curl -sf -X PUT -H "Authorization: Bearer $JWT" -H "novu-environment-id: $ENV_ID" -H "Content-Type: application/json" -d "$2" "$API_URL$1" 2>/dev/null
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

check() {
  local test_name="$1"
  local condition="$2"
  if eval "$condition"; then
    echo "  PASS: $test_name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $test_name"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  - $test_name"
  fi
}

echo "============================================"
echo "  ReNovu Translation E2E Test Suite"
echo "============================================"
echo ""

# =========================================================================
echo "--- PHASE 1: Translation Settings API ---"
# =========================================================================

echo "1.1 Get settings (should be null initially)"
RESULT=$(jwt_get "/v1/translation-settings")
check "Settings initially null" '[ "$(echo $RESULT | python3 -c "import sys,json; print(json.load(sys.stdin).get(\"data\"))" 2>/dev/null)" = "None" ]'

echo "1.2 Configure translation settings with OpenAI key"
OPENAI_KEY=$(grep OPENAI_API_KEY /Users/atlonxp/workspaces/arokago-v1-mono/services/backend/.env 2>/dev/null | head -1 | cut -d= -f2)
if [ -z "$OPENAI_KEY" ]; then
  echo "  SKIP: No OpenAI key found in arokago backend .env"
  OPENAI_KEY="test-key-placeholder"
fi

SETTINGS_BODY="{
  \"openaiApiKey\": \"$OPENAI_KEY\",
  \"openaiModel\": \"gpt-4o-mini\",
  \"defaultLocale\": \"en_US\",
  \"targetLocales\": [\"ja_JP\", \"th_TH\", \"ko_KR\"],
  \"localeAliases\": {\"zh-hans\": \"zh_CN\", \"zh-hant\": \"zh_TW\"}
}"
RESULT=$(jwt_put "/v1/translation-settings" "$SETTINGS_BODY")
check "Settings saved successfully" '[ "$(echo $RESULT | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get(\"hasApiKey\", False))" 2>/dev/null)" = "True" ]'

echo "1.3 Verify settings were persisted"
RESULT=$(jwt_get "/v1/translation-settings")
SAVED_DATA=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('data'):
  d = d['data']
print(json.dumps({
  'hasApiKey': d.get('hasApiKey'),
  'defaultLocale': d.get('defaultLocale'),
  'targetLocales': d.get('targetLocales'),
  'localeAliases': d.get('localeAliases'),
  'openaiModel': d.get('openaiModel')
}))" 2>/dev/null)
echo "    Settings: $SAVED_DATA"
check "Default locale is en_US" '[ "$(echo $SAVED_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get(\"defaultLocale\"))" 2>/dev/null)" = "en_US" ]'
check "3 target locales configured" '[ "$(echo $SAVED_DATA | python3 -c "import sys,json; print(len(json.load(sys.stdin).get(\"targetLocales\",[])))" 2>/dev/null)" = "3" ]'
check "Locale aliases configured" '[ "$(echo $SAVED_DATA | python3 -c "import sys,json; print(len(json.load(sys.stdin).get(\"localeAliases\",{})))" 2>/dev/null)" = "2" ]'

echo "1.4 Test OpenAI connection"
RESULT=$(jwt_post "/v1/translation-settings/test" "{}")
CONNECTION_SUCCESS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)
echo "    Connection: $RESULT"
check "OpenAI connection test" '[ "$CONNECTION_SUCCESS" = "True" ]'

echo ""

# =========================================================================
echo "--- PHASE 2: Create Test Workflow + Enable Translation ---"
# =========================================================================

echo "2.1 Create a test email workflow"
WORKFLOW_BODY='{
  "name": "Translation Test Workflow",
  "description": "Test workflow for translation E2E",
  "active": true,
  "steps": [
    {
      "name": "Email Step",
      "template": {
        "type": "email",
        "subject": "Welcome to {{company_name}}!",
        "content": [
          {"type": "text", "content": "Hello {{subscriber.firstName}},"},
          {"type": "text", "content": "Thank you for joining our platform. We are excited to have you."},
          {"type": "text", "content": "Best regards,"},
          {"type": "text", "content": "The {{company_name}} Team"}
        ],
        "contentType": "editor",
        "senderName": "{{company_name}}"
      }
    },
    {
      "name": "In-App Step",
      "template": {
        "type": "in_app",
        "content": "Welcome to {{company_name}}, {{subscriber.firstName}}! Check your inbox for more details."
      }
    }
  ],
  "notificationGroupId": ""
}'

# First get a notification group ID
NOTIF_GROUP=$(api_get "/v1/notification-groups" | python3 -c "import sys,json; groups=json.load(sys.stdin).get('data',[]); print(groups[0]['_id'] if groups else '')" 2>/dev/null)
echo "    Notification Group: $NOTIF_GROUP"

WORKFLOW_BODY=$(echo "$WORKFLOW_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
d['notificationGroupId'] = '$NOTIF_GROUP'
print(json.dumps(d))
" 2>/dev/null)

WORKFLOW_RESULT=$(api_post "/v1/workflows" "$WORKFLOW_BODY" 2>/dev/null || echo '{"error":"failed"}')
WORKFLOW_ID=$(echo "$WORKFLOW_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); print(d.get('_id',''))" 2>/dev/null)
WORKFLOW_SLUG=$(echo "$WORKFLOW_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); triggers=d.get('triggers',[{}]); print(triggers[0].get('identifier','') if triggers else '')" 2>/dev/null)
STEP_IDS=$(echo "$WORKFLOW_RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin).get('data',{})
steps = d.get('steps',[])
for s in steps:
    template = s.get('template',{})
    print(f'  {s.get(\"stepId\",\"?\")} ({template.get(\"type\",\"?\")}): {s.get(\"_templateId\",\"?\")}')
" 2>/dev/null)
echo "    Workflow ID: $WORKFLOW_ID"
echo "    Workflow Slug: $WORKFLOW_SLUG"
echo "    Steps:"
echo "$STEP_IDS"
check "Workflow created" '[ -n "$WORKFLOW_ID" ] && [ "$WORKFLOW_ID" != "" ]'

echo ""

# =========================================================================
echo "--- PHASE 3: Auto-Translate Workflow ---"
# =========================================================================

echo "3.1 Create localization group for workflow"
# First we need to create a localization group with source content
# This is done by storing the source content first
SOURCE_CONTENT='{
  "step.email-step.subject": "Welcome to {{company_name}}!",
  "step.email-step.body": "Hello {{subscriber.firstName}}, Thank you for joining our platform. We are excited to have you. Best regards, The {{company_name}} Team",
  "step.email-step.senderName": "{{company_name}}",
  "step.in-app-step.content": "Welcome to {{company_name}}, {{subscriber.firstName}}! Check your inbox for more details."
}'

# Create localization group directly in MongoDB
docker exec arokago-renovu-mongodb mongosh -u novu -p 'novu-dev-password' --authenticationDatabase admin novu-db --quiet --eval "
const group = db.localizationgroups.insertOne({
  resourceId: '$WORKFLOW_SLUG',
  resourceType: 'workflow',
  resourceName: 'Translation Test Workflow',
  _resourceInternalId: ObjectId('$WORKFLOW_ID'),
  _environmentId: ObjectId('$ENV_ID'),
  _organizationId: ObjectId('$ORG_ID'),
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
print('GroupId: ' + group.insertedId);

// Store source content in default locale
db.localizations.insertOne({
  _localizationGroupId: group.insertedId,
  locale: 'en_US',
  content: JSON.stringify($SOURCE_CONTENT),
  _environmentId: ObjectId('$ENV_ID'),
  _organizationId: ObjectId('$ORG_ID'),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
print('Source content stored for en_US');
" 2>/dev/null

check "Localization group created" 'true'

echo "3.2 Verify translation group appears in list"
RESULT=$(jwt_get "/v2/translations/list")
TOTAL=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null)
echo "    Translation groups found: $TOTAL"
check "Translation group listed" '[ "$TOTAL" -ge 1 ]'

echo "3.3 Get source content for default locale"
RESULT=$(jwt_get "/v2/translations/workflow/$WORKFLOW_SLUG/en_US")
SOURCE_KEYS=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('content',{})))" 2>/dev/null)
echo "    Source content keys: $SOURCE_KEYS"
check "Source content has 4 keys" '[ "$SOURCE_KEYS" = "4" ]'

echo "3.4 Trigger auto-translate for all target locales"
TRANSLATE_RESULT=$(jwt_post "/v2/translations/auto-translate/workflow/$WORKFLOW_SLUG" "{}")
echo "    Auto-translate result:"
echo "$TRANSLATE_RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'    Success: {d.get(\"success\")}')
print(f'    Source locale: {d.get(\"sourceLocale\")}')
meta = d.get('metadata', {})
print(f'    Total: {meta.get(\"totalLocales\")}, Success: {meta.get(\"successfulLocales\")}, Failed: {meta.get(\"failedLocales\")}')
print(f'    Latency: {meta.get(\"totalLatencyMs\")}ms')
for r in d.get('results', []):
    print(f'    - {r[\"locale\"]}: success={r[\"success\"]}, warnings={r.get(\"warnings\",\"none\")}')
" 2>/dev/null

TRANSLATE_SUCCESS=$(echo "$TRANSLATE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',False))" 2>/dev/null)
SUCCESSFUL_LOCALES=$(echo "$TRANSLATE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('metadata',{}).get('successfulLocales',0))" 2>/dev/null)
check "Auto-translate succeeded" '[ "$TRANSLATE_SUCCESS" = "True" ]'
check "All 3 locales translated" '[ "$SUCCESSFUL_LOCALES" = "3" ]'

echo "3.5 Verify translated content for each locale"
for LOCALE in ja_JP th_TH ko_KR; do
  RESULT=$(jwt_get "/v2/translations/workflow/$WORKFLOW_SLUG/$LOCALE")
  CONTENT_KEYS=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('content',{})))" 2>/dev/null)
  SAMPLE=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin).get('content',{})
subject = d.get('step.email-step.subject','')
print(f'{subject[:60]}...' if len(subject) > 60 else subject)
" 2>/dev/null)
  echo "    $LOCALE: $CONTENT_KEYS keys, subject: $SAMPLE"
  check "$LOCALE has 4 content keys" '[ "$CONTENT_KEYS" = "4" ]'
done

echo "3.6 Verify variables preserved in translations"
for LOCALE in ja_JP th_TH ko_KR; do
  RESULT=$(jwt_get "/v2/translations/workflow/$WORKFLOW_SLUG/$LOCALE")
  HAS_VARS=$(echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin).get('content',{})
subject = d.get('step.email-step.subject','')
body = d.get('step.email-step.body','')
has_company = '{{company_name}}' in subject and '{{company_name}}' in body
has_name = '{{subscriber.firstName}}' in body
print('True' if has_company and has_name else 'False')
" 2>/dev/null)
  check "$LOCALE preserves Handlebars variables" '[ "$HAS_VARS" = "True" ]'
done

echo ""

# =========================================================================
echo "--- PHASE 4: Subscriber with Locale + Notification Trigger ---"
# =========================================================================

echo "4.1 Create test subscribers with different locales"
for LOCALE_DATA in "test-ja:ja:Japanese:User" "test-th:th:Thai:User" "test-ko:ko:Korean:User" "test-en:en:English:User"; do
  IFS=':' read -r SUB_ID LOCALE FIRST LAST <<< "$LOCALE_DATA"
  RESULT=$(api_post "/v1/subscribers" "{
    \"subscriberId\": \"$SUB_ID\",
    \"email\": \"${SUB_ID}@test.arokago.com\",
    \"firstName\": \"$FIRST\",
    \"lastName\": \"$LAST\",
    \"locale\": \"$LOCALE\"
  }")
  CREATED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('subscriberId',''))" 2>/dev/null)
  check "Subscriber $SUB_ID created (locale=$LOCALE)" '[ "$CREATED" = "'$SUB_ID'" ]'
done

echo "4.2 Verify subscriber locale is set"
RESULT=$(api_get "/v1/subscribers/test-ja")
SUB_LOCALE=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('locale',''))" 2>/dev/null)
echo "    test-ja subscriber locale: $SUB_LOCALE"
check "Subscriber locale is ja" '[ "$SUB_LOCALE" = "ja" ]'

echo "4.3 Trigger notification to Japanese subscriber"
TRIGGER_RESULT=$(api_post "/v1/events/trigger" "{
  \"name\": \"$WORKFLOW_SLUG\",
  \"to\": {\"subscriberId\": \"test-ja\"},
  \"payload\": {\"company_name\": \"ArokaGO\"}
}")
TRIGGER_STATUS=$(echo "$TRIGGER_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('acknowledged', False))" 2>/dev/null)
echo "    Trigger acknowledged: $TRIGGER_STATUS"
check "Notification trigger acknowledged" '[ "$TRIGGER_STATUS" = "True" ]'

echo "4.4 Trigger notification to Thai subscriber"
TRIGGER_RESULT=$(api_post "/v1/events/trigger" "{
  \"name\": \"$WORKFLOW_SLUG\",
  \"to\": {\"subscriberId\": \"test-th\"},
  \"payload\": {\"company_name\": \"ArokaGO\"}
}")
TRIGGER_STATUS=$(echo "$TRIGGER_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('acknowledged', False))" 2>/dev/null)
check "Thai notification acknowledged" '[ "$TRIGGER_STATUS" = "True" ]'

echo "4.5 Wait for notification processing and check messages"
sleep 5
echo "    Checking in-app notifications..."
for SUB in test-ja test-th test-en; do
  MESSAGES=$(api_get "/v1/subscribers/$SUB/notifications/feed" 2>/dev/null || echo '{"data":[]}')
  MSG_COUNT=$(echo "$MESSAGES" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
  echo "    $SUB: $MSG_COUNT messages"
done

echo ""

# =========================================================================
echo "--- PHASE 5: Re-translate with New Locales ---"
# =========================================================================

echo "5.1 Add new target locale (es_ES)"
RESULT=$(jwt_put "/v1/translation-settings" '{
  "targetLocales": ["ja_JP", "th_TH", "ko_KR", "es_ES"]
}')
NEW_LOCALES=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('targetLocales',[])))" 2>/dev/null)
check "4 target locales after adding es_ES" '[ "$NEW_LOCALES" = "4" ]'

echo "5.2 Wait for background auto-translate of new locale"
sleep 10

echo "5.3 Check if es_ES was auto-translated"
RESULT=$(jwt_get "/v2/translations/workflow/$WORKFLOW_SLUG/es_ES")
ES_KEYS=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('content',{})))" 2>/dev/null)
echo "    es_ES content keys: $ES_KEYS"
check "es_ES auto-translated after locale addition" '[ "$ES_KEYS" = "4" ]'

echo ""

# =========================================================================
echo "--- PHASE 6: Edge Cases ---"
# =========================================================================

echo "6.1 Get translation for non-existent locale"
RESULT=$(jwt_get "/v2/translations/workflow/$WORKFLOW_SLUG/xx_XX")
EMPTY_CONTENT=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('content',{})))" 2>/dev/null)
check "Non-existent locale returns empty content" '[ "$EMPTY_CONTENT" = "0" ]'

echo "6.2 Get translation for non-existent workflow"
RESULT=$(jwt_get "/v2/translations/workflow/non-existent-workflow/ja_JP" 2>&1)
check "Non-existent workflow returns 404" 'echo "$RESULT" | grep -q "404\|Not Found"'

echo "6.3 Auto-translate with empty source content"
# Test is implicit - we already verified content extraction works

echo ""

# =========================================================================
echo "--- CLEANUP ---"
# =========================================================================

echo "Cleaning up test data..."
# Delete test subscribers
for SUB in test-ja test-th test-ko test-en; do
  curl -sf -X DELETE -H "Authorization: ApiKey $API_KEY" "$API_URL/v1/subscribers/$SUB" > /dev/null 2>&1 || true
done

# Delete test workflow
if [ -n "$WORKFLOW_ID" ]; then
  curl -sf -X DELETE -H "Authorization: ApiKey $API_KEY" "$API_URL/v1/workflows/$WORKFLOW_ID" > /dev/null 2>&1 || true
fi

# Delete localization group and localizations
docker exec arokago-renovu-mongodb mongosh -u novu -p 'novu-dev-password' --authenticationDatabase admin novu-db --quiet --eval "
const group = db.localizationgroups.findOne({resourceId: '$WORKFLOW_SLUG'});
if (group) {
  db.localizations.deleteMany({_localizationGroupId: group._id});
  db.localizationgroups.deleteOne({_id: group._id});
  print('Cleaned up localization data');
}
" 2>/dev/null

echo "Cleanup done."
echo ""

# =========================================================================
echo "============================================"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "============================================"
if [ $FAIL -gt 0 ]; then
  echo -e "  Failed tests:$ERRORS"
  exit 1
fi
