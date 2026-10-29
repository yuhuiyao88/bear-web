#!/usr/bin/env bash
# Times each part of BEAR and records the Worker's own logs. Run by .github/workflows/diagnose.yml.
set -uo pipefail
M=$(grep -oE 'model: "gemini-[^"]+"' worker/src/models.js | head -1 | sed -E 's/.*"(.*)"/\1/')
G="https://generativelanguage.googleapis.com/v1beta"
H=(-H "x-goog-api-key: $GEMINI_API_KEY" -H "content-type: application/json")

echo "== 1. Model info for $M"
curl -s -m 30 "${H[@]}" "$G/models/$M" | python3 -c 'import json,sys; d=json.load(sys.stdin); print({k:d.get(k) for k in ("name","displayName","version","error","thinking")})'

echo "== 2. Plain request (no tools)"
curl -s -m 150 -o /tmp/r2.json -w "HTTP %{http_code} in %{time_total}s\n" "${H[@]}" "$G/models/$M:generateContent" \
  -d '{"contents":[{"role":"user","parts":[{"text":"In one sentence, what is a p-value?"}]}]}'
python3 -c 'import json; d=json.load(open("/tmp/r2.json")); print(json.dumps(d.get("usageMetadata") or d.get("error"))[:600])'

echo "== 3. Request with code execution (plot)"
curl -s -m 200 -o /tmp/r3.json -w "HTTP %{http_code} in %{time_total}s\n" "${H[@]}" "$G/models/$M:generateContent" \
  -d '{"tools":[{"codeExecution":{}}],"contents":[{"role":"user","parts":[{"text":"Plot a histogram of 200 right-skewed values with matplotlib."}]}]}'
python3 -c '
import json; d=json.load(open("/tmp/r3.json"))
c=(d.get("candidates") or [{}])[0]; parts=c.get("content",{}).get("parts",[])
print("finish:",c.get("finishReason"),"parts:",[list(p.keys())[0] for p in parts]); print(json.dumps(d.get("usageMetadata") or d.get("error"))[:600])'

sub=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["subdomain"])')
URL="https://bear.$sub.workers.dev"

echo "== 4. Worker logs + a request through the site ($URL)"
npx --yes wrangler@4 tail bear --format json > /tmp/tail.json 2>/tmp/tail.err &
TP=$!
sleep 15
curl -s -m 200 -o /tmp/r4.json -w "HTTP %{http_code} in %{time_total}s\n" -H "content-type: application/json" "$URL/api/chat" \
  -d '{"messages":[{"role":"user","text":"What is the difference between a t-test and an ANOVA?"}]}'
head -c 800 /tmp/r4.json; echo
echo "-- model router status:"
curl -s -m 30 "$URL/api/router-status"; echo
sleep 10
kill $TP 2>/dev/null
echo "-- worker log entries:"
python3 - <<'PY'
import json
raw=open("/tmp/tail.json").read()
dec=json.JSONDecoder(); i=0; n=0
while i < len(raw):
    raw_i = raw[i:].lstrip()
    if not raw_i: break
    try:
        obj, end = dec.raw_decode(raw_i)
    except Exception:
        break
    i = len(raw) - len(raw_i) + end
    n += 1
    print("outcome:", obj.get("outcome"), "| cpu/wall:", obj.get("cpuTime"), obj.get("wallTime"))
    for l in obj.get("logs", []): print("  log:", str(l.get("message"))[:400])
    for e in obj.get("exceptions", []): print("  EXCEPTION:", e)
print("entries:", n)
PY
tail -5 /tmp/tail.err
