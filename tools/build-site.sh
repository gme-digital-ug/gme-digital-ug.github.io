#!/usr/bin/env bash
# Build the site locally exactly as GitHub Pages does, then check it.
#
#   tools/build-site.sh [OUT_DIR] [TREE_ISH]
#
# OUT_DIR   where the built site goes (default: a new temp dir; printed at the end).
#           Jekyll deletes anything else in it, so never point it at the repo.
# TREE_ISH  a commit to build (default: the working tree, uncommitted changes included)
#
# The source is exported through git, so it has the committed (LF) line endings
# that GitHub builds from, not the CRLF of a Windows working copy. The build runs
# in GitHub's own Pages build image (the one actions/jekyll-build-pages uses).
# Needs git, Docker and Node. Extra arguments after TREE_ISH go to check-site.mjs
# (for example --baseline DIR).
set -euo pipefail

IMAGE=ghcr.io/actions/jekyll-build-pages:v1.0.13
REPO_NWO=gme-digital-ug/gme-digital-ug.github.io

repo=$(git rev-parse --show-toplevel)
out=${1:-$(mktemp -d)}
treeish=${2:-}
shift $(( $# > 2 ? 2 : $# ))

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/src" "$out"
if [ "$(cd "$out" && pwd)" = "$repo" ]; then echo "OUT_DIR must not be the repo" >&2; exit 2; fi

if [ -z "$treeish" ]; then
  # Snapshot the working tree (tracked + untracked, minus .gitignore) via a throwaway index.
  export GIT_INDEX_FILE="$work/index"
  git -C "$repo" read-tree HEAD
  git -C "$repo" -c core.safecrlf=false add -A
  treeish=$(git -C "$repo" write-tree)
  unset GIT_INDEX_FILE
fi
git -C "$repo" -c core.autocrlf=false archive "$treeish" | tar -x -C "$work/src"

# Docker on Windows (Git Bash) needs Windows paths for bind mounts.
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(hostpath "$work/src"):/github/workspace/src:ro" \
  -v "$(hostpath "$out"):/github/workspace/_site" \
  -e GITHUB_WORKSPACE=/github/workspace \
  -e INPUT_SOURCE=src \
  -e INPUT_DESTINATION=_site \
  -e INPUT_VERBOSE=false \
  -e INPUT_FUTURE=false \
  -e GITHUB_REPOSITORY="$REPO_NWO" \
  "$IMAGE"

# Check with the check script of the version being built.
node "$work/src/tools/check-site.mjs" --source "$work/src" --site "$out" "$@"
echo "Built site: $out"
