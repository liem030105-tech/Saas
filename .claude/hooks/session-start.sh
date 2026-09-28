#!/bin/bash
# SessionStart hook for Claude Code on the web (cloud sessions only).
# Cloud containers have no Docker daemon, so instead of docker compose this starts the
# preinstalled PostgreSQL 16 with the same ports, users, and databases as
# docs/deployment/local.md: dev on 5432 (trello), test on 5433 (trello_test).
# Idempotent: safe on startup, resume, clear, and compact.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# 1. Dependencies (only once the workspace exists, FOUNDATION-001+).
if [ -f package.json ]; then
  corepack enable >/dev/null 2>&1 || true
  pnpm install --prefer-offline >&2 || echo "session-start: pnpm install failed; continuing so the database still starts" >&2
  if [ -f Trello-Clone-BE/prisma/schema.prisma ]; then
    pnpm --filter @trello-clone/api db:generate >&2 || echo "session-start: prisma generate failed" >&2
  fi
fi

# 2. PostgreSQL (mirrors the postgres and postgres-test compose services).
if command -v pg_ctlcluster >/dev/null 2>&1; then
  if ! pg_lsclusters -h | awk '{print $2}' | grep -qx test; then
    pg_createcluster 16 test -p 5433 --encoding UTF8 --locale C.UTF-8 >&2
  fi
  for cluster in main test; do
    pg_ctlcluster 16 "$cluster" start >/dev/null 2>&1 || true
  done

  psql_as_postgres() { runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qtA -p "$1" -c "$2"; }
  for port in 5432 5433; do
    for _ in $(seq 1 20); do
      pg_isready -q -h localhost -p "$port" && break
      sleep 0.5
    done
    if [ "$(psql_as_postgres "$port" "SELECT 1 FROM pg_roles WHERE rolname = 'trello'")" != "1" ]; then
      # Local-only credentials, identical to docker-compose.yml. CREATEDB lets `prisma migrate dev` create its shadow database.
      psql_as_postgres "$port" "CREATE ROLE trello LOGIN PASSWORD 'trello' CREATEDB"
    fi
  done
  [ "$(psql_as_postgres 5432 "SELECT 1 FROM pg_database WHERE datname = 'trello'")" = "1" ] ||
    psql_as_postgres 5432 "CREATE DATABASE trello OWNER trello"
  [ "$(psql_as_postgres 5433 "SELECT 1 FROM pg_database WHERE datname = 'trello_test'")" = "1" ] ||
    psql_as_postgres 5433 "CREATE DATABASE trello_test OWNER trello"
  # Same local-only, non-secret URLs as the compose setup; real secrets never come from this hook.
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    {
      echo 'export DATABASE_URL="${DATABASE_URL:-postgresql://trello:trello@localhost:5432/trello}"'
      echo 'export DATABASE_URL_TEST="${DATABASE_URL_TEST:-postgresql://trello:trello@localhost:5433/trello_test}"'
    } >> "$CLAUDE_ENV_FILE"
  fi
  echo "session-start: PostgreSQL ready on 5432 (trello) and 5433 (trello_test)" >&2
fi
