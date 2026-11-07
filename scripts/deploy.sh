#!/usr/bin/env bash
#
# The deploy runbook, executed rather than described (after gaba_excites'
# scripts/deploy.sh). The only way to deploy: do not hand-roll `wrangler deploy`.
#
#   npm run deploy               # preflight -> test -> build -> gates -> deploy -> verify -> record
#   npm run deploy -- --dry-run  # everything except the upload
#   npm run deploy:dev           # the dev site: this branch, for review before a release
#   npm run deploy:dev -- --dry-run
#
# The dev site (--dev) is a second worker, hhhero-dev (wrangler.dev.jsonc), at
# hhhero-dev.tonydefazio.workers.dev: any branch, no version bump, no Release
# commit, no earlier versions, no DEPLOYED.md; a "Dev preview" banner and
# noindex everywhere. It cannot touch the live worker or hhhero.tonydefazio.com.
#
# On Windows run it from Git Bash: `bash scripts/deploy.sh`.
set -euo pipefail

DRY_RUN=0
DEV=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    --dev) DEV=1 ;;
    *) echo "unknown option: $a" >&2; exit 1 ;;
  esac
done

CUSTOM_URL="https://hhhero.tonydefazio.com"
WORKERS_URL="https://hhhero.tonydefazio.workers.dev"
DEV_URL="https://hhhero-dev.tonydefazio.workers.dev"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mABORT: %s\033[0m\n' "$1" >&2; exit 1; }

step "Preflight"
# WSL on the owner's workstation has no node; a run there bumped the version and died (2026-10-30).
command -v node >/dev/null && command -v npm >/dev/null || fail "node/npm not found here. On Windows run from Git Bash, not WSL: bash scripts/deploy.sh"
[[ "$(git rev-parse --is-shallow-repository)" == "true" ]] && fail "shallow clone: the Born stamp would be wrong. git fetch --unshallow"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ $DEV == 0 && "$BRANCH" != "main" ]] && fail "on '$BRANCH', not main (for a branch, npm run deploy:dev)"
[[ -n "$(git status --porcelain)" ]] && fail "working tree dirty: commit first, so the deploy names a real commit"
# Each deploy is a new version, committed before the build so the bundle's
# version and DEPLOYED.md's commit agree. A dry run commits nothing; nor does the dev site.
if [[ $DRY_RUN == 0 && $DEV == 0 ]]; then
  npm version patch --no-git-tag-version >/dev/null
  APP_VERSION="$(node -p 'require("./package.json").version')"
  git add package.json package-lock.json
  git commit -q -m "Release v$APP_VERSION"
fi
APP_VERSION="$(node -p 'require("./package.json").version')"
COMMIT="$(git rev-parse --short HEAD)"
echo "  $BRANCH @ $COMMIT, v$APP_VERSION"
if [[ $DEV == 1 ]]; then
  export HHHERO_DEV_SITE="$BRANCH @ $COMMIT"
  echo "  the DEV SITE: $DEV_URL (the live site is not touched)"
fi

step "Tests"
npx vitest run 2>&1 | tail -4

step "Clean build"
rm -rf dist
npm run --silent build 2>&1 | tail -4

step "Earlier versions -> dist/v/ (so a user can go back)"
# Each is built from its own release commit, checked out under .versions/
# (gitignored) so it finds this checkout's node_modules by walking up.
# Built with its own vite.config, so its CSP and Born stamp are its own.
EARLIER=""
[[ $DEV == 0 ]] && EARLIER="$(node scripts/earlier-versions.ts)"
cleanup_versions() { for d in "$ROOT"/.versions/*/; do [[ -d "$d" ]] && git worktree remove --force "$d" 2>/dev/null; done; git worktree prune; rm -rf "$ROOT/.versions"; }
trap cleanup_versions EXIT
while read -r ver commit date; do
  [[ -z "${ver:-}" ]] && continue
  wt="$ROOT/.versions/$ver"
  git worktree add -q --detach "$wt" "$commit"
  # Relative paths, and MSYS_NO_PATHCONV: Git Bash would otherwise turn /v/... into the drive v:
  (cd "$wt" && MSYS_NO_PATHCONV=1 node ../../node_modules/vite/bin/vite.js build --base "/v/$ver/" --outDir "../../dist/v/$ver" --emptyOutDir --logLevel error)
  rm -f "dist/v/$ver/_headers" "dist/v/$ver/robots.txt"
  grep -Eq "connect-src ('|&#39;)none('|&#39;)" "dist/v/$ver/index.html" || fail "CSP missing from v$ver"
  grep -q "/v/$ver/assets/" "dist/v/$ver/index.html" || fail "v$ver not built for /v/$ver/"
  echo "  v$ver from $commit ($date)"
done <<< "$EARLIER"
cleanup_versions

if [[ $DEV == 1 ]]; then
  step "Dev site: noindex, no sitemap"
  printf '# HHhero dev site: a preview for review, not for search.\nUser-agent: *\nDisallow: /\n' > dist/robots.txt
  rm -f dist/sitemap.xml
  printf '\n# the dev site: nothing here is for search\n/*\n  X-Robots-Tag: noindex, nofollow\n' >> dist/_headers
fi

step "Gates"
grep -Eq "connect-src ('|&#39;)none('|&#39;)" dist/index.html || fail "CSP missing from dist/index.html"
echo "  CSP present"
BORN="$(git log --max-parents=0 --format=%cI | tail -1)"
grep -rqF "$BORN" dist/assets/ || fail "root-commit time $BORN not baked into the bundle"
echo "  Born stamp baked: $BORN"
grep -qF "$APP_VERSION" dist/assets/*.js || fail "version $APP_VERSION not baked into the bundle"
[[ -f dist/_headers && -f dist/robots.txt ]] || fail "_headers or robots.txt missing from dist/"
if [[ $DEV == 1 ]]; then
  grep -q 'name="robots" content="noindex' dist/index.html || fail "dev site: no noindex meta in dist/index.html"
  grep -q 'Disallow: /' dist/robots.txt || fail "dev site: robots.txt does not disallow"
  grep -q 'X-Robots-Tag: noindex' dist/_headers || fail "dev site: no X-Robots-Tag in _headers"
  grep -qF "$HHHERO_DEV_SITE" dist/assets/*.js || fail "dev site: the banner's branch and commit are not baked in"
  [[ ! -e dist/v ]] || fail "dev site: earlier versions built into it"
  echo "  noindex (meta, header, robots.txt) and the banner for $HHHERO_DEV_SITE"
else
  if grep -q 'name="robots"' dist/index.html; then fail "the live build carries the dev site's noindex"; fi
fi
LOCAL_HASH="$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html | head -1)"
echo "  bundle: $LOCAL_HASH"

if [[ $DRY_RUN == 1 ]]; then step "Dry run: stopping before upload"; exit 0; fi

step "Deploy"
if [[ $DEV == 1 ]]; then OUT="$(npx wrangler deploy --config wrangler.dev.jsonc 2>&1)"; else OUT="$(npx wrangler deploy 2>&1)"; fi
echo "$OUT" | tail -6
VERSION_ID="$(echo "$OUT" | grep -o 'Current Version ID: .*' | cut -d' ' -f4 || true)"

step "Verify live (polling past the edge cache)"
if [[ $DEV == 1 ]]; then
  URLS=("$DEV_URL")
else
  URLS=("$WORKERS_URL")
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$CUSTOM_URL/" | grep -q 200 && URLS+=("$CUSTOM_URL")
fi
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
  if [[ $DEV == 1 ]]; then
    curl -sI --max-time 15 "$u/" | grep -qi '^x-robots-tag: noindex' || fail "$u/ does not send X-Robots-Tag: noindex"
    echo "  $u/ sends X-Robots-Tag: noindex"
  fi
  while read -r ver commit date; do
    [[ -z "${ver:-}" ]] && continue
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$u/v/$ver/")"
    [[ "$code" == 200 ]] || fail "$u/v/$ver/ answered $code"
    echo "  $u/v/$ver/ serving the earlier version"
  done <<< "$EARLIER"
done

if [[ $DEV == 1 ]]; then
  step "Dev site up"
  echo "  $DEV_URL serving $HHHERO_DEV_SITE (worker version ${VERSION_ID:-unknown}). Not recorded in DEPLOYED.md: the live site is unchanged."
  exit 0
fi

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
| **Earlier versions** | $(echo "$EARLIER" | awk 'NF {printf "%sv%s at /v/%s/", (n++ ? ", " : ""), $1, $1}') |

Verified at deploy time: tests pass, CSP in the shipped HTML, Born stamp baked
from the true root commit, every URL above serving this bundle, and no
third-party beacon when asked as a phone browser.
MD
echo "  commit DEPLOYED.md to record it"
