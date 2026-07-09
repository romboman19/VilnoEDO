#!/bin/sh
# Regression guard: VilnoEDO is UA-only and must not reintroduce a dependency on
# the Documenso .p12 server seal / certificate-status. Fails CI if any forbidden
# pattern reappears in a runtime or deploy-config path. Documentation (README,
# SIGNING.md, .env.example) may mention .p12 as legacy context and is not scanned.
set -e

fail=0

forbid() {
  pattern="$1"
  shift
  for path in "$@"; do
    [ -e "$path" ] || continue
    if grep -RInq -- "$pattern" "$path" 2>/dev/null; then
      echo "❌ forbidden pattern '$pattern' found in: $path"
      grep -RIn -- "$pattern" "$path" 2>/dev/null | sed 's/^/     /'
      fail=1
    fi
  done
}

# The .p12 seal must not gate startup, health, or be mounted/required in deploy.
forbid 'cert\.p12' docker/start.sh apps/remix/app/routes/api+/health.ts deploy/compose.yml
forbid 'NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH' docker/start.sh deploy/compose.yml
forbid 'certificate-status' docker/start.sh apps/remix/app/routes
forbid 'getCertificateStatus' apps/remix/app packages/lib/server-only packages/ui

# The removed route/helper must not come back.
if [ -f apps/remix/app/routes/api+/certificate-status.ts ]; then
  echo "❌ /api/certificate-status route was reintroduced"
  fail=1
fi
if [ -f packages/lib/server-only/cert/cert-status.ts ]; then
  echo "❌ getCertificateStatus helper (cert-status.ts) was reintroduced"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "✅ UA-only guard passed: no Documenso .p12 seal dependency reintroduced."
fi

exit "$fail"
