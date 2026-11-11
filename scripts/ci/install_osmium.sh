#!/usr/bin/env bash
# Installs osmium-tool on a GitHub runner, surviving short Ubuntu mirror outages.
# 11/11/2026: two "Refresh OSM passes" runs died with exit code 100 because the runner could not
# resolve security.ubuntu.com for a few minutes ("Temporary failure resolving"). apt gives up on the
# first failed download, so: per-download retries, then up to 4 attempts one minute apart.
set -u
for i in 1 2 3 4; do
  if sudo apt-get update -qq -o Acquire::Retries=5 && sudo apt-get install -y -qq -o Acquire::Retries=5 --fix-missing osmium-tool; then
    break
  fi
  echo "apt-get failed (attempt $i of 4): Ubuntu mirrors unreachable? Retrying in 60 s"
  sleep 60
done
if ! command -v osmium >/dev/null; then
  echo "::error::osmium-tool could not be installed: the Ubuntu mirrors were unreachable from the runner for ~5 minutes. Nothing was changed; run the workflow again later."
  exit 1
fi
osmium --version | head -1
