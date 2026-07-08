# Provisioning the IIT engine (Phase 2)

The `iit-native` engine is a skeleton until the licensed IIT signature library
is provisioned. This is the correct server-side crypto for UA DSTU-4145 — **not**
the browser `@it-enterprise/digital-signature` SDK run headless (the mistake the
old VilnoCheck-SignService made).

> Licensing: the IIT library is distributed by ІІТ (iit.com.ua). Confirm the
> redistribution/usage terms before baking the binaries into an image or
> committing them. This repo intentionally does **not** vendor them.

## Files to obtain (iit.com.ua/downloads → "Користувач ЦСК — Бібліотека підпису")

| File | URL (relative to https://iit.com.ua) | Purpose |
| --- | --- | --- |
| `euswi.64.tar` (25 MB) | `/download/productfiles/euswi.64.tar` | Linux 64-bit EU Sign library (native crypto module + JS); also `.deb`/`.rpm` |
| `CACertificates.p7b` | `/download/productfiles/CACertificates.p7b` | Compatible CA bundle (already mirrored at `apps/remix/public/ua-kep/data/`) |
| `EUSignNIXesCPPAppendixB.doc` | (docs) | Native C/C++ API reference (for the FFI binding) |
| `EUSignJavaAppendixD.doc` | (docs) | Java API reference (alternative JVM binding) |

## Install into the image / volume

1. Extract `euswi.64.tar` and place the library directory somewhere stable,
   e.g. mount `/opt/iit-lib` (see the commented volume in `deploy/compose.yml`).
2. Set on the `ua-kep-verifier` service:
   - `IIT_LIB_PATH=/opt/iit-lib` (path the engine checks / loads from)
   - `IIT_LIB_MODE=ffi` (native `.so`) or `java` (JVM)
3. Ensure OCSP/CMP/TSP egress to КНЕДП endpoints is allowed (needed for chain +
   revocation), reusing the same allow-list posture as the app PKI proxy.

## Binding (what to implement in `src/engines/iit-native.ts`)

The engine's `verify()` must, using the EU Sign library:

1. Initialise once per process (singleton) with the CA bundle + OCSP/TSP settings.
2. `VerifyData(documentBytes, signatureBytes)` for the detached CAdES
   (documented as external-signature verification; **not** `VerifyDataInternal`).
3. Map the returned signer/certificate info onto `TVerifyResponse`:
   `signer.commonName/drfo/edrpou`, `certificate.serial/issuerCn/notBefore/
   notAfter/qualified/qscd/policyOids`, `signature.signingTime`, and classify
   `legalClass` (KEP / UEP_QC / ADES) from qualified + QSCD.
4. Populate `revocation` (OCSP/CRL result) and `timestamp` when present.
5. Fail-closed: any init/verify error → `buildUnavailableResponse` (unavailable)
   or `valid:false` with a reason — never `valid:true` without real verification.

Binding options:
- **FFI (`IIT_LIB_MODE=ffi`)**: load the native `.so` via `koffi`, declaring the
  EU Sign C functions per `EUSignNIXesCPPAppendixB`.
- **JVM (`IIT_LIB_MODE=java`)**: run the `EUSignJava` library in a small JVM
  sidecar the Node service calls over localhost.
- **euscp JS (native module)**: the `euswi` package's JS library + native module
  (`euscpm`) loaded in Node in *JS-library* mode — the server-capable variant,
  distinct from the browser worker.

## After provisioning

1. Wire the binding, then verify on **real** signatures: a valid UA KEP detached
   CAdES → `valid:true` with correct signer/legalClass; a tampered document or
   signature → `valid:false` (not `unavailable`).
2. Confirm `/api/health` reports `engineReady: true`.
3. Flip the app to strict mode: `NEXT_PRIVATE_UA_KEP_VERIFY_MODE=required` in
   `deploy/.env`, so any unverifiable signature hard-rejects completion.
