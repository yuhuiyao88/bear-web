#!/usr/bin/env bash
# Deploys BEAR to Cloudflare. Run by .github/workflows/deploy.yml.
set -euo pipefail

missing=""
for v in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID GEMINI_API_KEY; do
  [ -z "${!v:-}" ] && missing="$missing $v"
done
if [ -n "$missing" ]; then
  echo "ERROR: these GitHub repository secrets are not set:$missing"
  exit 1
fi

# The router skips a model that's missing, but warn so it gets fixed in worker/src/models.js.
for M in $(grep -oE 'model: "gemini-[^"]+"' worker/src/models.js | sed -E 's/.*"(.*)"/\1/'); do
  echo "== Checking Gemini model $M"
  code=$(curl -s -o /tmp/model.json -w "%{http_code}" -H "x-goog-api-key: $GEMINI_API_KEY" \
    "https://generativelanguage.googleapis.com/v1beta/models/$M")
  python3 -c 'import json; d=json.load(open("/tmp/model.json")); print({k: d.get(k) for k in ("name", "displayName", "version", "error")})'
  if [ "$code" != "200" ]; then echo "WARNING: Gemini model $M is not available to this API key (HTTP $code)"; fi
done

W="npx --yes wrangler@4"
echo "== Wrangler $($W --version)"

echo "== Making sure the course index exists"
$W vectorize get bear-index >/dev/null 2>&1 \
  || $W vectorize create bear-index --dimensions=768 --metric=cosine \
  || echo "(index may already exist; continuing)"

echo "== Deploying the Worker and page"
$W deploy

echo "== Setting the API keys"
printf '%s' "$GEMINI_API_KEY" | $W secret put GEMINI_API_KEY
# Optional providers for the model router. Unset ones are simply left out of the pool.
for v in GROQ_API_KEY MISTRAL_API_KEY; do
  if [ -n "${!v:-}" ]; then printf '%s' "${!v}" | $W secret put "$v"; else echo "($v not set; skipping)"; fi
done

sub=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["subdomain"])')
echo "== BEAR is live at https://bear.$sub.workers.dev"
echo "### BEAR is live at https://bear.$sub.workers.dev" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
