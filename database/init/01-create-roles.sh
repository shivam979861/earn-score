#!/bin/sh
set -eu
: "${EARNSCORE_APP_PASSWORD:?Set EARNSCORE_APP_PASSWORD}"
: "${EARNSCORE_PROCESSOR_PASSWORD:?Set EARNSCORE_PROCESSOR_PASSWORD}"
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 \
  -v app_password="$EARNSCORE_APP_PASSWORD" \
  -v processor_password="$EARNSCORE_PROCESSOR_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE earnscore_app LOGIN PASSWORD %L NOBYPASSRLS', :'app_password') \gexec
SELECT format('CREATE ROLE earnscore_processor LOGIN PASSWORD %L NOBYPASSRLS', :'processor_password') \gexec
SQL
