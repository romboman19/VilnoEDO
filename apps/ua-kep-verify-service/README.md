# ua-kep-verify-service

Adapter service for **authoritative UA KEP signature verification**. It exposes a
single stable contract (`POST /api/verify`) in front of pluggable engines so
VilnoEDO integrates against one shape regardless of how verification is actually
performed.

VilnoEDO points `NEXT_PRIVATE_UA_KEP_VERIFY_SERVICE_URL` at this service. The
structural fail-closed check inside VilnoEDO remains the acceptance floor; this
service provides the full cryptographic verdict.

## Engines

Selected by `UA_KEP_VERIFY_ENGINE`:

- **`iit-native`** (default) — server-side verification via the IIT
  "Користувач ЦСК" signature library (EU Sign): the Linux native `.so` (C
  interface) or the Java library. This is the correct server-side crypto engine
  for UA DSTU-4145 — **not** the browser `@it-enterprise/digital-signature` SDK.
  Skeleton until the licensed library is provisioned (see below); reports
  `unavailable` and, with fail-closed, never marks a signature valid without
  real verification.
- **`qtsp-provider`** — future authoritative mode: a qualified trust service
  provider (КНЕДП) validation API that returns a sealed/signed result. Stub
  until a provider is contracted (`UA_KEP_QTSP_PROVIDER_URL`).

## Provisioning the IIT library (Phase 2)

The IIT signature library is downloaded from IIT (https://iit.com.ua/downloads,
"Користувач ЦСК — Бібліотека підпису"). Mount it into the image/volume and set
`IIT_LIB_PATH`:

- Native (`IIT_LIB_MODE=ffi`): the Linux `.so` set (`EUSignNIXes*`) bound via
  koffi FFI.
- Java (`IIT_LIB_MODE=java`): the `EUSignJava*` JARs run in a JVM sidecar.

The binding lives in `src/engines/iit-native.ts` and is isolated so wiring the
library does not touch the HTTP contract or dispatcher.

## Trust material

Trust anchors come from the CZO Trusted List (not a hardcoded CA bundle):
`TL-UA-DSTU` (DSTU 4145-2002) or `TL-UA` (ETSI), selected by
`UA_KEP_TRUST_LIST_PROFILE`. The list XML is fetched, hash-verified against the
published `.sha2`, cached, and surfaced as `trust.trustedListProfile` /
`trust.trustedListSha256` plus an issuer allow-list.

## Config

| Env | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3017` | Listen port |
| `UA_KEP_API_KEY` | — | Required `x-api-key`; mandatory in production |
| `UA_KEP_VERIFY_ENGINE` | `iit-native` | `iit-native` \| `qtsp-provider` |
| `UA_KEP_VERIFY_FAIL_CLOSED` | `true` | Any non-valid verdict stays invalid |
| `UA_KEP_TRUST_LIST_PROFILE` | `TL-UA-DSTU` | `TL-UA-DSTU` \| `TL-UA` |
| `IIT_LIB_PATH` | — | Path to the provisioned IIT library |
| `IIT_LIB_MODE` | `ffi` | `ffi` (native `.so`) \| `java` |
| `UA_KEP_QTSP_PROVIDER_URL` | — | Qualified-provider validation API base URL |
| `UA_KEP_TRUST_CACHE_DIR` | `/data/trust-list` | Trusted List cache dir |

## Contract

`POST /api/verify`

```json
{ "documentBase64": "…", "signatureBase64": "…", "signatureFormat": "CADES_DETACHED",
  "policy": "UA_KEP_STRICT", "expectedDocumentSha256": "…", "evidenceRequestId": "…" }
```

Returns the normalized verdict (`valid`, `unavailable`, `legalClass`, `signer`,
`certificate`, `signature`, `trust`, `revocation`, `timestamp`, `verifier`,
`rawReport`). `GET /api/health` reports engine readiness.

## Run

```bash
npm install
npm run dev        # tsx watch
npm test           # vitest
npm run typecheck  # tsc --noEmit
```
