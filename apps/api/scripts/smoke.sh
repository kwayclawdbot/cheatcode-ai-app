#!/usr/bin/env bash
# Cheat Code AI — api-app smoke test.
#
# Creates a throwaway user against the LOCAL Supabase stack via the admin API,
# signs in, then exercises every v1 endpoint including the Kai SSE stream.
# Asserts 2xx on each call and prints the SSE frames verbatim.
#
#   cd apps/api && ./scripts/smoke.sh            # expects `next dev` on :3000
#   API_BASE=http://localhost:3000 ./scripts/smoke.sh
#
# Reads SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY from
# apps/api/.env.local unless already exported.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_BASE="${API_BASE:-http://localhost:3000}"
ENV_FILE="${ENV_FILE:-$HERE/../.env.local}"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi

: "${SUPABASE_URL:?SUPABASE_URL not set (put it in apps/api/.env.local)}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY not set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY not set}"

PASS=0; FAIL=0
green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
hr()    { printf '%s\n' "------------------------------------------------------------"; }

# check <name> <method> <path> [json-body]
check() {
  local name="$1" method="$2" path="$3" body="${4:-}"
  local out status
  if [ -n "$body" ]; then
    out=$(curl -sS -X "$method" "$API_BASE$path" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H 'Content-Type: application/json' \
      -d "$body" -w '\n%{http_code}')
  else
    out=$(curl -sS -X "$method" "$API_BASE$path" \
      -H "Authorization: Bearer $ACCESS_TOKEN" -w '\n%{http_code}')
  fi
  status="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
  if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
    green "PASS  $status  $method $path  — $name"
    PASS=$((PASS+1))
  else
    red   "FAIL  $status  $method $path  — $name"
    echo "$BODY" | head -c 600; echo
    FAIL=$((FAIL+1))
  fi
}

hr; echo "API base:      $API_BASE"; echo "Supabase:      $SUPABASE_URL"; hr

# --- 0. health (unauthenticated) --------------------------------------------
HEALTH=$(curl -sS "$API_BASE/api/v1/health" -w '\n%{http_code}')
HSTATUS="${HEALTH##*$'\n'}"
if [ "$HSTATUS" = "200" ]; then green "PASS  200  GET /api/v1/health"; PASS=$((PASS+1));
else red "FAIL  $HSTATUS  GET /api/v1/health"; FAIL=$((FAIL+1)); fi
echo "${HEALTH%$'\n'*}"

# --- 1. create + sign in a throwaway user ------------------------------------
EMAIL="smoke+$(date +%s)@cheatcode.test"
PASSWORD="Smoke-Test-$(date +%s)!"

CREATE=$(curl -sS -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true,\"user_metadata\":{\"display_name\":\"Smoke\"}}")
USER_ID=$(printf '%s' "$CREATE" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))' 2>/dev/null)
if [ -z "$USER_ID" ]; then red "FAIL  could not create test user"; echo "$CREATE" | head -c 400; exit 1; fi
green "PASS  created test user $EMAIL"; PASS=$((PASS+1))

TOKENS=$(curl -sS -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
ACCESS_TOKEN=$(printf '%s' "$TOKENS" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null)
if [ -z "$ACCESS_TOKEN" ]; then red "FAIL  could not sign in"; echo "$TOKENS" | head -c 400; exit 1; fi
green "PASS  signed in"; PASS=$((PASS+1))

# --- 2. 401 envelope ----------------------------------------------------------
UNAUTH=$(curl -sS "$API_BASE/api/v1/home" -w '\n%{http_code}')
if [ "${UNAUTH##*$'\n'}" = "401" ]; then
  green "PASS  401  GET /api/v1/home without a token"; PASS=$((PASS+1))
  echo "${UNAUTH%$'\n'*}"
else red "FAIL  expected 401 without a token, got ${UNAUTH##*$'\n'}"; FAIL=$((FAIL+1)); fi

# --- 3. validation envelope ---------------------------------------------------
BADREQ=$(curl -sS -X POST "$API_BASE/api/v1/onboarding/complete" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"goal_mode":"day_trade","starting_balance":10,"risk_answer":"balanced","involvement":"guided","experience":"beginner"}' \
  -w '\n%{http_code}')
if [ "${BADREQ##*$'\n'}" = "400" ]; then
  green "PASS  400  POST /api/v1/onboarding/complete with an out-of-range balance"; PASS=$((PASS+1))
  echo "${BADREQ%$'\n'*}"
else red "FAIL  expected 400 on bad balance, got ${BADREQ##*$'\n'}"; FAIL=$((FAIL+1)); fi

hr
# --- 4. the endpoints ---------------------------------------------------------
check "onboarding" POST /api/v1/onboarding/complete \
  '{"goal_mode":"day_trade","starting_balance":2000,"risk_answer":"balanced","involvement":"guided","experience":"beginner","practice_choice":"paper"}'
echo "$BODY" | head -c 700; echo

check "onboarding idempotent replay" POST /api/v1/onboarding/complete \
  '{"goal_mode":"day_trade","starting_balance":2000,"risk_answer":"balanced","involvement":"guided","experience":"beginner"}'
printf 'idempotent_replay: '; printf '%s' "$BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["idempotent_replay"])'

check "mode switch" PUT /api/v1/mode '{"mode":"swing"}'
check "mode back"   PUT /api/v1/mode '{"mode":"day_trade"}'

check "setups" GET "/api/v1/setups?mode=day_trade"
printf '%s' "$BODY" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  cap",d["cap"],"count",len(d["setups"]),"market",d["market"]["status"])
for s in d["setups"]:
    print("   ",s["symbol"],s["grade_display"],s["state"],"| entry",s["entry"],"stop",s["stop"],"| freshness",s["quote"]["freshness"],"|",s["next_action"]["label"])'

check "setups filtered by state" GET "/api/v1/setups?mode=day_trade&state=forming"

check "home" GET "/api/v1/home?mode=day_trade"
printf '%s' "$BODY" | python3 -c '
import json,sys
d=json.load(sys.stdin)
b=d.get("briefing")
print("  market",d["market"]["status"],"| degraded",d["degraded"],d.get("degraded_reason"))
print("  briefing:", "null" if not b else b["payload"]["headline"])
if b:
    for l in b["payload"]["lines"]: print("    -",l["emphasis"],"|",l["text"])
ls=d.get("lead_setup")
print("  lead_setup:", "null" if not ls else "%s %s %s next=%s"%(ls["payload"]["symbol"],ls["payload"]["grade_display"],ls["payload"]["state"],ls["payload"]["next_action"]))
if ls: print("    beginner:", ls["payload"]["explain"]["beginner"][:160])
print("  watching:", [w["symbol"] for w in d["watching"]])
print("  daily_risk:", d["daily_risk"])'

check "alerts draft (O1 'Watch 504 for me')" POST /api/v1/alerts/draft \
  '{"natural_language":"Watch 504 for me","refs":{"symbol":"META","level":504,"setup_id":"11111111-1111-4111-8111-000000000001"}}'
printf '%s' "$BODY" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  alert",d["alert"]["status"],"|",d["alert"]["next_action"]["label"],"| degraded",d["degraded"])
print("  preview:",json.dumps(d["preview"]["payload"]["condition"]))
print("  summary:",d["preview"]["payload"]["summary_plain"])'

check "alerts list" GET /api/v1/alerts
printf '%s' "$BODY" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  needs_attention",len(d["needs_attention"]),"watching",len(d["watching"]),"resolved",len(d["resolved"]))
for a in d["watching"]: print("   ",a["status"],"—",a["next_action"]["label"],"|",a["summary_plain"][:80])'

check "create conversation" POST /api/v1/kai/conversations \
  '{"mode":"day_trade","pinned":{"setup_ids":["11111111-1111-4111-8111-000000000001"],"symbols":["META"]}}'
CONV_ID=$(printf '%s' "$BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
echo "  conversation_id: $CONV_ID"

hr
echo "SSE — POST /api/v1/kai/conversations/$CONV_ID/messages"
hr
SSE_OUT=$(mktemp)
SSE_CODE=$(curl -sS -N -X POST "$API_BASE/api/v1/kai/conversations/$CONV_ID/messages" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"content":"What is going on with META right now, and what would I risk?"}' \
  -o "$SSE_OUT" -w '%{http_code}')
if [ "$SSE_CODE" -ge 200 ] && [ "$SSE_CODE" -lt 300 ]; then
  green "PASS  $SSE_CODE  SSE stream"; PASS=$((PASS+1))
else red "FAIL  $SSE_CODE  SSE stream"; FAIL=$((FAIL+1)); fi
python3 - "$SSE_OUT" <<'PY'
import json,sys
raw=open(sys.argv[1]).read()
frames=[]
for block in raw.split("\n\n"):
    ev=data=None
    for line in block.splitlines():
        if line.startswith("event: "): ev=line[7:]
        elif line.startswith("data: "): data=line[6:]
    if ev: frames.append((ev,data))
print("frames: %d  (%s)" % (len(frames), ", ".join(sorted({e for e,_ in frames}))))
shown=0
for ev,data in frames:
    if ev=="text_delta":
        if shown<6:
            print("event: text_delta\ndata: %s" % data); shown+=1
        elif shown==6:
            print("  … (%d more text_delta frames)" % (sum(1 for e,_ in frames if e=="text_delta")-6)); shown+=1
    else:
        d=json.loads(data) if data else {}
        if ev=="object":
            o=d["object"]; p=o["payload"]
            print("event: object\ndata: %s" % json.dumps({
                "type":o["type"],"id":o["id"],"model":o["model"],"prompt_version":o["prompt_version"],
                "disclosures":o["disclosures"],
                "payload":{k:p.get(k) for k in ("symbol","intent","state","grade_display","entry","stop","targets","next_action","risk_plain")}}))
        else:
            print("event: %s\ndata: %s" % (ev,data))
text="".join(json.loads(d)["text"] for e,d in frames if e=="text_delta")
print("\n--- assembled narrative ---\n%s" % text.strip())
PY
rm -f "$SSE_OUT"

hr
echo "passed: $PASS   failed: $FAIL"
hr
[ "$FAIL" -eq 0 ] || exit 1
