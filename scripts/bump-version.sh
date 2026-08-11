#!/usr/bin/env bash
#
# Bump the app version in index.html and sw.js together.
#
# The version appears in exactly two places: the header label in index.html and
# CACHE_VERSION in sw.js. They must match -- if CACHE_VERSION doesn't change, an
# already-pinned home-screen install keeps serving the previously cached build.
#
# Usage:
#   scripts/bump-version.sh            # patch bump (1.0.0 -> 1.0.1)
#   scripts/bump-version.sh minor      # 1.0.0 -> 1.1.0
#   scripts/bump-version.sh major      # 1.0.0 -> 2.0.0
#   scripts/bump-version.sh 2.3.4      # explicit version
#   scripts/bump-version.sh --check    # verify the two files agree, change nothing
#
# sed is used in -E (extended regex) mode throughout: BSD sed on macOS does not
# support GNU's \+ quantifier, but both accept -E.

set -euo pipefail

cd "$(dirname "$0")/.."

HTML=index.html
SW=sw.js
SEMVER='[0-9]+\.[0-9]+\.[0-9]+'

read_html_version() {
  sed -nE "s/.*id=\"appVersion\"[^>]*>v(${SEMVER})<.*/\1/p" "$HTML" | head -1
}

read_sw_version() {
  sed -nE "s/^const CACHE_VERSION = 'told-v(${SEMVER})';.*/\1/p" "$SW" | head -1
}

current=$(read_html_version)
sw_current=$(read_sw_version)

if [ -z "$current" ]; then
  echo "error: could not find a version label in $HTML" >&2
  exit 1
fi
if [ -z "$sw_current" ]; then
  echo "error: could not find CACHE_VERSION in $SW" >&2
  exit 1
fi

if [ "${1:-}" = "--check" ]; then
  if [ "$current" != "$sw_current" ]; then
    echo "MISMATCH: $HTML is v$current but $SW is told-v$sw_current" >&2
    exit 1
  fi
  echo "ok: both files at v$current"
  exit 0
fi

if [ "$current" != "$sw_current" ]; then
  echo "warning: $HTML (v$current) and $SW (told-v$sw_current) disagree; bumping from v$current" >&2
fi

IFS=. read -r major minor patch <<<"$current"

case "${1:-patch}" in
  major) new="$((major + 1)).0.0" ;;
  minor) new="${major}.$((minor + 1)).0" ;;
  patch) new="${major}.${minor}.$((patch + 1))" ;;
  [0-9]*.[0-9]*.[0-9]*) new="$1" ;;
  *)
    echo "usage: $0 [major|minor|patch|X.Y.Z|--check]" >&2
    exit 1
    ;;
esac

# GNU sed takes a bare -i; BSD/macOS sed needs an empty backup suffix argument.
if sed --version >/dev/null 2>&1; then
  inplace=(-i)
else
  inplace=(-i '')
fi

sed -E "${inplace[@]}" "s|(id=\"appVersion\"[^>]*>)v${SEMVER}<|\1v${new}<|" "$HTML"
sed -E "${inplace[@]}" "s|^const CACHE_VERSION = 'told-v${SEMVER}';|const CACHE_VERSION = 'told-v${new}';|" "$SW"

# Re-read rather than trusting the substitutions landed.
after_html=$(read_html_version)
after_sw=$(read_sw_version)
if [ "$after_html" != "$new" ] || [ "$after_sw" != "$new" ]; then
  echo "error: bump failed ($HTML=v$after_html, $SW=told-v$after_sw, wanted v$new)" >&2
  exit 1
fi

echo "v$current -> v$new  ($HTML, $SW)"
