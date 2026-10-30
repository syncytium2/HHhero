#!/usr/bin/env bash
#
# The deploy runbook, executed rather than described (after gaba_excites'
# scripts/deploy.sh). The only way to deploy: do not hand-roll `wrangler deploy`.
#
#   npm run deploy               # preflight -> test -> build -> gates -> deploy -> verify -> record
#   npm run deploy -- --dry-run  # everything except the upload
#
# On Windows run it from Git Bash: `bash scripts/deploy.sh`.
set -euo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

CUSTOM_URL="https://hhhero.tonydefazio.com"
WORKERS_URL="https://hhhero.tonydefazio.workers.dev"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mABORT: %s\033[0m\n' "$1" >&2; exit 1; }

step "Preflight"
[[ "$(git rev-parse --is-shallow-repository)" == "true" ]] && fail "shallow clone: the Born stamp would be wrong. git fetch --unshallow"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" != "main" ]] && fail "on '$BRANCH', not main"
[[ -n "$(git status --porcelain)" ]] && fail "working tree dirty: commit first, so DEPLOYED.md names a real commit"
# Each deploy is a new version, committed before the build so the bundle's
# version and DEPLOYED.md's commit agree. A dry run commits nothing.
if [[ $DRY_RUN == 0 ]]; then
  npm version patch --no-git-tag-version >/dev/null
  APP_VERSION="$(node -p 'require("./package.json").version')"
  git add package.json package-lock.json
  git commit -q -m "Release v$APP_VERSION"
fi
APP_VERSION="$(node -p 'require("./package.json").version')"
COMMIT="$(git rev-parse --short HEAD)"
echo "  $BRANCH @ $COMMIT, v$APP_VERSION"

step "Tests"
npx vitest run 2>&1 | tail -4

step "Clean build"
rm -rf dist
npm run --silent build 2>&1 | tail -4

step "Gates"
grep -Eq "connect-src ('|&#39;)none('|&#39;)" dist/index.html || fail "CSP missing from dist/index.html"
echo "  CSP present"
BORN="$(git log --max-parents=0 --format=%cI | tail -1)"
grep -rqF "$BORN" dist/assets/ || fail "root-commit time $BORN not baked into the bundle"
echo "  Born stamp baked: $BORN"
grep -qF "$APP_VERSION" dist/assets/*.js || fail "version $APP_VERSION not baked into the bundle"
[[ -f dist/_headers && -f dist/robots.txt ]] || fail "_headers or robots.txt missing from dist/"
LOCAL_HASH="$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html | head -1)"
echo "  bundle: $LOCAL_HASH"

if [[ $DRY_RUN == 1 ]]; then step "Dry run: stopping before upload"; exit 0; fi

step "Deploy"
OUT="$(npx wrangler deploy 2>&1)"; echo "$OUT" | tail -6
VERSION_ID="$(echo "$OUT" | grep -o 'Current Version ID: .*' | cut -d' ' -f4 || true)"

step "Verify live (polling past the edge cache)"
URLS=("$WORKERS_URL")
curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$CUSTOM_URL/" | grep -q 200 && URLS+=("$CUSTOM_URL")
UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
for u in "${URLS[@]}"; do
  ok=0
  for i in $(seq 1 12); do
    live="$(curl -s --max-time 15 "$u/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1 || true)"
    [[ "$live" == "$LOCAL_HASH" ]] && { ok=1; echo "  $u serving $LOCAL_HASH"; break; }
    echo "  try $i: $u serving ${live:-nothing}, retrying"; sleep 15
  done
  [[ $ok == 1 ]] || fail "$u never served $LOCAL_HASH"
  n="$(curl -sL --max-time 15 -H "User-Agent: $UA" "$u/" | grep -c cloudflareinsights || true)"
  [[ "$n" == 0 ]] || fail "third-party beacon injected into $u/"
  echo "  no third-party beacon on $u/ (asked as a phone browser)"
done

step "Recording -> DEPLOYED.md"
cat > DEPLOYED.md <<MD
# Deployed state

Written by \`npm run deploy\`. Do not edit by hand.

| | |
|---|---|
| **Deployed at** | $(date -u '+%Y-%m-%d %H:%M UTC') |
| **Version** | v$APP_VERSION |
| **Commit** | \`$COMMIT\` — $(git log -1 --format=%s | cut -c1-72) |
| **Bundle** | \`$LOCAL_HASH\` |
| **Worker version** | \`${VERSION_ID:-unknown}\` |
| **Live** | ${URLS[*]} |

Verified at deploy time: tests pass, CSP in the shipped HTML, Born stamp baked
from the true root commit, every URL above serving this bundle, and no
third-party beacon when asked as a phone browser.
MD
echo "  commit DEPLOYED.md to record it"
