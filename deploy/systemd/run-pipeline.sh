#!/usr/bin/env bash
# run-pipeline.sh - shared wrapper the systemd .service units below call.
# Mirrors what the equivalent .github/workflows/*.yml step does: pull, run one
# scripts/*.mjs pipeline, commit+push the files it touched (only if changed).
#
# Required env (set in the matching .service's [Service] Environment=/EnvironmentFile=):
#   REPO_DIR     - path to a local clone of this repo (checked out to the branch you deploy from)
#   GIT_REMOTE   - remote to pull/push (default "origin")
#   GIT_BRANCH   - branch to pull/push (default "main")
#   PIPELINE_CMD - the node command to run, e.g. "node scripts/fetch_news.mjs"
#   COMMIT_PATHS - space-separated list of files/globs to git add + check for changes
#   COMMIT_MSG   - commit message
set -euo pipefail
: "${REPO_DIR:?set REPO_DIR}"
: "${PIPELINE_CMD:?set PIPELINE_CMD}"
: "${COMMIT_PATHS:?set COMMIT_PATHS}"
: "${COMMIT_MSG:?set COMMIT_MSG}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-main}"

cd "$REPO_DIR"
git fetch "$GIT_REMOTE" "$GIT_BRANCH"
git checkout "$GIT_BRANCH"
git reset --hard "$GIT_REMOTE/$GIT_BRANCH"

eval "$PIPELINE_CMD"

# shellcheck disable=SC2086
git add $COMMIT_PATHS
if git diff --staged --quiet; then
  echo "run-pipeline: no changes in ($COMMIT_PATHS), nothing to commit."
  exit 0
fi
git -c user.name="locaclimb-vps-bot" -c user.email="locaclimb-vps-bot@localhost" commit -m "$COMMIT_MSG"
git push "$GIT_REMOTE" "$GIT_BRANCH"
