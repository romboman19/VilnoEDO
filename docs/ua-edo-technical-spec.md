# Технічне завдання: VilnoEDO — вільна українська система ЕДО

**Статус:** Draft v0.1
**Дата:** 2026-07-03
**Репозиторій:** `romboman19/VilnoEDO`
**Пов'язаний сервіс:** `romboman19/VilnoCheck-SignService`
**Базова платформа:** fork Documenso
**Ціль:** self-hosted open-source аналог українського ЕДО з підтримкою КЕП/УЕП, без штучних paywall-обмежень платних функцій.

> Документ є технічним ТЗ для розробки. Він не є юридичним висновком. Перед production-використанням потрібна окрема юридична перевірка відповідності Закону України «Про електронні документи та електронний документообіг», Закону України «Про електронну ідентифікацію та електронні довірчі послуги», профілям КЕП/УЕП, правилам КНЕДП, CAdES/PAdES/XAdES та вимогам архівного зберігання.

---

## 1. Мета проєкту

Розробити повністю вільну self-hosted систему електронного документообігу для України, яка дозволяє бізнесу, ФОП, ТОВ, громадським організаціям та внутрішнім командам:

- створювати, завантажувати, маршрутизувати та підписувати документи;
- працювати українською мовою як основною мовою інтерфейсу;
- підписувати документи українськими КЕП/УЕП через локальні ключі, апаратні токени та хмарні провайдери;
- зберігати юридично значущі артефакти підпису, валідації та аудиту;
- розгортати систему на власній інфраструктурі без залежності від SaaS-провайдера ЕДО;
- використовувати усі core-функції без платних license gates.

---

## 2. Продуктова концепція

VilnoEDO не має бути просто «перекладеним Documenso». Ціль — окремий український ЕДО-продукт, де Documenso використовується як сильне ядро для envelopes, recipients, templates, teams, audit logs, API та self-hosting.

Ключова продуктова формула:

```text
VilnoEDO Core = документообіг, маршрути, ролі, аудит, зберігання, інтерфейс
VilnoCheck-SignService = signing gateway / crypto bridge для українських КЕП/УЕП
КНЕДП / CZO / OCSP / TSP / cloud signing provider = довірча інфраструктура
```

Система не повинна позиціонувати себе як КНЕДП або сервіс кваліфікованої електронної доставки, якщо такі статуси не отримані окремо. На першому етапі VilnoEDO має забезпечити доказовий документообіг із КЕП/УЕП, audit trail та exportable evidence package.

---

## 3. Scope першого релізу

### 3.1. Входить у MVP

1. Український інтерфейс як first-class locale.
2. Self-hosted розгортання через Docker Compose.
3. Організації, команди, користувачі, запрошення.
4. Завантаження документа або створення документа з шаблону.
5. Маршрут підписання: один або кілька підписувачів.
6. Sequential та parallel signing flow.
7. Український signature level `UA_KEP`.
8. CAdES detached як перший production-oriented формат.
9. Підпис локальним КЕП через:
   - апаратний токен / IIT browser stack;
   - файловий ключ `.jks`, `.p12`, `.pfx` у браузері;
   - підготовлений extension point для SmartID / хмарних провайдерів.
10. Backend verification підпису у fail-closed режимі.
11. Збереження:
    - оригінального документа;
    - detached signature;
    - validation report;
    - audit log;
    - manifest;
    - protocol PDF або HTML/PDF-звіт.
12. Export ZIP/evidence package.
13. Webhooks для інтеграцій.
14. Видалення/відключення Documenso paywall/license gates для core-функцій.

### 3.2. Не входить у перший реліз

1. Отримання статусу КНЕДП.
2. Кваліфікована електронна доставка як довірча послуга.
3. Повноцінна Дія.Підпис інтеграція, якщо потрібні закриті/партнерські API.
4. Гарантований PAdES-LTA для всіх сценаріїв.
5. Mobile native app.
6. Enterprise SSO як обов'язкова функція MVP.
7. Повноцінний бухгалтерський/ERP-модуль.

---

## 4. Основні ролі користувачів

### 4.1. System Admin

Адмініструє інстанс VilnoEDO:

- налаштовує домен, SMTP, storage, SignService URL;
- керує trust material update jobs;
- переглядає health-checks;
- налаштовує retention policies;
- керує глобальними security settings.

### 4.2. Organisation Owner

Власник організації:

- створює організацію;
- додає учасників;
- керує ролями;
- налаштовує підписні політики;
- переглядає журнал організації.

### 4.3. Manager

Керує документами команди:

- створює envelopes;
- додає recipients;
- запускає маршрути підписання;
- переглядає статуси;
- експортує evidence package.

### 4.4. Signer / Recipient

Підписувач документа:

- відкриває запрошення;
- переглядає документ;
- обирає спосіб КЕП/УЕП;
- підписує документ;
- отримує підтвердження та, за потреби, копію пакета.

### 4.5. Viewer / Auditor

Має доступ тільки для перегляду:

- перевіряє статус документа;
- завантажує пакет доказів;
- переглядає audit log.

---

## 5. Архітектура

### 5.1. Цільова структура

```text
VilnoEDO
├── apps/remix                         # основний web app
├── packages/prisma                    # DB schema
├── packages/lib                       # бізнес-логіка, типи, policies
├── packages/signing                   # instance seal / PDF signing, не UA KEP core
├── packages/ua-kep                    # новий модуль українського підпису
│   ├── server                         # orchestration, callbacks, validation persistence
│   ├── client                         # UI contracts / hooks
│   ├── types                          # API schemas
│   └── evidence                       # manifest/protocol/evidence package
└── docs
    └── ua-edo-technical-spec.md

VilnoCheck-SignService
├── src/server                         # signing API, verification, PKI proxy
├── src/client                         # isolated signing UI
├── public/data                        # CAs.json, CACertificates.p7b
└── docs/research                      # дослідження КЕП/КНЕДП/SmartID/IIT
```

### 5.2. Принципи архітектури

1. VilnoEDO є власником документа, workflow, статусу та audit trail.
2. SignService є signing gateway, а не окремою системою документообігу.
3. Приватний ключ не має потрапляти на сервер для локального ключа або токена.
4. Підпис приймається лише після backend verification.
5. У production verification має працювати fail-closed.
6. Документ після старту підписання має бути immutable.
7. Усі юридично значущі артефакти мають бути exportable.
8. Будь-який зовнішній callback має бути idempotent.
9. Дані підпису, validation report і trust material version мають зберігатися довгостроково.
10. Український `UA_KEP` flow не можна змішувати з Documenso SES instance-signature flow.

---

## 6. Fork hygiene та open-source режим

### 6.1. Завдання

1. Провести аудит Documenso license/paywall checks.
2. Вимкнути runtime license gates для core-функцій.
3. Видалити або ізолювати billing/Stripe залежності, якщо вони не потрібні у self-hosted free edition.
4. Залишити AGPL notices та історію походження fork.
5. Замінити branding:
   - назва продукту;
   - favicon/logo;
   - email templates;
   - legal pages;
   - default titles;
   - internal links.
6. Поступово замінити package namespace `@documenso/*` на `@vilnoedo/*` або зафіксувати compatibility alias strategy.
7. Прибрати або зробити opt-in будь-яку telemetry/posthog/analytics logic.

### 6.2. Acceptance criteria

- Система запускається без license key.
- Усі core-функції MVP доступні без paid flags.
- У UI немає Documenso branding, крім legal attribution у відповідному місці.
- CI проходить після cleanup.
- README чітко пояснює, що VilnoEDO — окремий AGPL fork.

---

## 7. Українська локалізація

### 7.1. Вимоги

1. Українська мова — default locale для нових інстансів.
2. Англійська може залишитися як fallback.
3. Терміни мають бути українськими ЕДО-термінами, а не буквальним перекладом:
   - Envelope → Пакет / Документ на підпис;
   - Recipient → Отримувач / Підписувач;
   - Signature level → Рівень підпису;
   - Audit log → Журнал подій;
   - Completed → Завершено;
   - Rejected → Відхилено;
   - Sequential signing → Послідовне підписання;
   - Evidence package → Пакет доказів.
4. Email templates мають бути українськими.
5. Date/time defaults мають відповідати Україні:
   - timezone default: `Europe/Kyiv`;
   - date format: `dd.MM.yyyy HH:mm`;
   - language: `uk`.
6. Системні повідомлення SignService також мають бути українською.

### 7.2. Acceptance criteria

- 90%+ основного user flow українською.
- Відсутні критичні mixed-language екрани в signing flow.
- Email invitation, reminder, completed, rejected templates перекладені.

---

## 8. Ukrainian signing flow `UA_KEP`

### 8.1. Signature level

Додати та використовувати signature level:

```ts
export const ZSignatureLevelSchema = z.enum(['SES', 'AES', 'QES', 'UA_KEP']);

export const isUaKepEnvelope = (envelope: { signatureLevel: string }) =>
  envelope.signatureLevel === SignatureLevel.UA_KEP;

export const isRecipientBoundCryptoEnvelope = (envelope: { signatureLevel: string }) =>
  isTspEnvelope(envelope) || isUaKepEnvelope(envelope);
```

### 8.2. Flow

```text
1. Sender створює envelope у VilnoEDO.
2. Sender обирає signatureLevel = UA_KEP.
3. Sender додає signer recipients.
4. Sender надсилає envelope.
5. VilnoEDO фіксує immutable document bytes/hash.
6. Recipient відкриває signing URL.
7. Recipient обирає спосіб підпису.
8. VilnoEDO створює UaKepSession.
9. SignService отримує scoped session token та payload/hash.
10. Browser signer підписує локально.
11. SignService перевіряє підпис.
12. SignService повертає validation result у VilnoEDO.
13. VilnoEDO зберігає signature artifact та validation report.
14. Recipient стає SIGNED.
15. Коли всі required recipients signed, envelope стає COMPLETED.
16. VilnoEDO генерує evidence package.
```

### 8.3. Підтримувані методи підпису

#### MVP methods

1. `iit-token`
   - апаратний токен;
   - local agent/browser integration;
   - приватний ключ не покидає носій.

2. `file-key`
   - `.jks`, `.p12`, `.pfx`;
   - читання ключа у браузері;
   - пароль не відправляється на backend;
   - private key material не зберігається.

#### Experimental methods

3. `privatbank-smartid`
   - хмарний підпис через провайдера;
   - потребує реальної provider-конфігурації;
   - не вважати production-ready до end-to-end тестів.

4. `diia-signature`
   - extension point;
   - реалізація можлива лише після підтвердження доступних API та правових умов.

Сумісність реалізації:

- canonical MVP IDs: `file-key`, `iit-token`, `privatbank-smartid`, `diia-signature`;
- старі prototype IDs на кшталт `privatbank-jks` і `smartid` мають бути або замінені в коді до використання цього контракту, або прийматися лише як тимчасові aliases з нормалізацією до canonical IDs вище.

---

## 9. Дані та Prisma-моделі

### 9.1. Розширення існуючої моделі

Існуючий `UaKepSession` слід розвинути або замінити на стабільну production-модель.

### 9.2. Пропоновані моделі

```prisma
model UaKepSession {
  id              String   @id @default(cuid())
  envelopeId      String
  recipientId     Int      @unique
  signingMethod   String
  preparedAt       DateTime @default(now())
  signedAt         DateTime?
  status          String   @default("prepared")
  itemsJson       Json
  signerInfo      Json?
  callbackNonce   String?
  expiresAt       DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

```prisma
model UaKepSignatureArtifact {
  id              String   @id @default(cuid())
  envelopeId      String
  envelopeItemId  String
  recipientId     Int
  sessionId       String

  format          String   // CADES_DETACHED, CADES_ENVELOPED, PADES, XADES
  mimeType        String
  storageKey      String
  fileName        String
  sha256          String
  size            Int

  createdAt       DateTime @default(now())

  @@index([envelopeId])
  @@index([recipientId])
  @@index([sessionId])
}
```

```prisma
model UaKepValidationReport {
  id                  String   @id @default(cuid())
  artifactId           String   @unique

  valid               Boolean
  legalClass           String   // KEP, UEP_QC, ADES, INVALID, UNKNOWN
  failureReason        String?

  signerCn             String?
  signerDrfo           String?
  signerEdrpou         String?
  signerOrg            String?

  certSerial           String?
  certIssuerCn         String?
  certNotBefore        DateTime?
  certNotAfter         DateTime?
  policyOids           Json?
  qcStatements         Json?
  qscd                 Boolean?

  signingTime          DateTime?
  validationTime       DateTime
  trustListVersion     String?
  caBundleSha256       String?

  ocspEvidence         Json?
  crlEvidence          Json?
  tspEvidence          Json?
  rawReport            Json?

  createdAt            DateTime @default(now())
}
```

```prisma
model UaTrustMaterialSnapshot {
  id                  String   @id @default(cuid())
  source              String   // CZO, bundled, manual
  cAsJsonSha256       String?
  caCertificatesSha256 String?
  trustListVersion    String?
  downloadedAt        DateTime?
  activatedAt         DateTime
  rawMetadata         Json?

  createdAt           DateTime @default(now())
}
```

```prisma
model UaEvidencePackage {
  id              String   @id @default(cuid())
  envelopeId      String
  storageKey      String
  sha256          String
  generatedAt     DateTime @default(now())
  manifestJson    Json

  @@index([envelopeId])
}
```

### 9.3. Вимоги до storage

1. Оригінальний документ має зберігатися immutable після старту підписання.
2. Для кожного артефакту обов'язковий SHA-256.
3. Storage має підтримувати:
   - local filesystem для dev;
   - S3/MinIO для production;
   - backup/export.
4. Заборонено перезаписувати підписані документи без створення нової версії.
5. Evidence package має бути відтворюваним з бази та storage.

---

## 10. API-контракт VilnoEDO ↔ SignService

### 10.1. Загальні принципи

1. Browser API key заборонений.
2. Browser отримує лише scoped, short-lived session token.
3. Server-to-server API використовує окремий shared secret або mTLS.
4. Усі callbacks idempotent.
5. Усі payloads мають мати `requestId`, `sessionId`, `nonce`, `createdAt`.
6. Усі критичні запити логуються в audit log.

### 10.2. VilnoEDO: підготовка signing session

Поточний MVP route:

`POST /api/ua-kep/prepare`

Майбутній compatibility alias:

`POST /api/ua-kep/sessions`

Клієнти не повинні залежати від `/sessions`, доки цей alias реально не змонтовано в app.

Request:

```json
{
  "envelopeId": "env_123",
  "recipientId": 123,
  "recipientToken": "...",
  "signingMethod": "iit-token"
}
```

Response:

```json
{
  "ok": true,
  "sessionId": "uakep_session_123",
  "preparedAt": "2026-07-03T11:45:00.000Z",
  "expiresAt": "2026-07-03T12:00:00.000Z",
  "items": [
    {
      "envelopeItemId": "item_1",
      "documentDataId": "docdata_1",
      "hashB64": "...",
      "ordinal": 0
    }
  ]
}
```

### 10.3. SignService: capabilities

`GET /api/capabilities`

Response:

```json
{
  "ok": true,
  "service": "vilnocheck-sign-service",
  "version": "0.3.0",
  "methods": [
    { "id": "iit-token", "status": "ready" },
    { "id": "file-key", "status": "ready" },
    { "id": "privatbank-smartid", "status": "experimental" }
  ],
  "formats": ["CADES_DETACHED", "CADES_ENVELOPED", "PADES"],
  "verification": {
    "failClosed": true,
    "trustMaterialVersion": "..."
  }
}
```

### 10.4. SignService: прийом підпису

`POST /api/signing-sessions/:sessionId/signature`

Request:

```json
{
  "sessionToken": "...",
  "format": "CADES_DETACHED",
  "signatures": [
    {
      "envelopeItemId": "item_1",
      "signatureBase64": "..."
    }
  ],
  "client": {
    "userAgent": "...",
    "platform": "...",
    "language": "uk-UA"
  },
  "methodState": {
    "method": "iit-token"
  }
}
```

Response:

```json
{
  "ok": true,
  "verification": {
    "valid": true,
    "legalClass": "KEP",
    "signer": {
      "commonName": "...",
      "drfo": "...",
      "edrpou": "..."
    },
    "certificate": {
      "serial": "...",
      "issuer": "...",
      "notBefore": "...",
      "notAfter": "..."
    },
    "signingTime": "...",
    "validationTime": "...",
    "trustMaterialVersion": "..."
  },
  "artifacts": [
    {
      "envelopeItemId": "item_1",
      "format": "CADES_DETACHED",
      "fileName": "contract.p7s",
      "sha256": "...",
      "size": 12345
    }
  ]
}
```

### 10.5. Callback у VilnoEDO

Поточний MVP route:

`POST /api/ua-kep/complete`

Майбутній compatibility alias:

`POST /api/ua-kep/sessions/:sessionId/complete`

Клієнти не повинні залежати від `/sessions/:sessionId/complete`, доки не змонтовано session-token auth і nonce validation.

Request:

```json
{
  "requestId": "...",
  "sessionId": "...",
  "recipientId": 123,
  "recipientToken": "...",
  "envelopeId": "...",
  "signerInfo": {
    "subjCN": "...",
    "issuerCN": "...",
    "edrpou": "...",
    "serial": "..."
  },
  "signatures": [
    {
      "envelopeItemId": "item_1",
      "signatureB64": "...",
      "format": "CADES_DETACHED"
    }
  ],
  "validation": {...},
  "nonce": "..."
}
```

VilnoEDO має:

1. перевірити server-to-server підпис або secret;
2. перевірити nonce/session/expiresAt;
3. перевірити, що envelope/document hash збігається;
4. зберегти artifacts і validation report;
5. виставити recipient `SIGNED` тільки якщо `validation.valid === true`;
6. створити audit log event `UA_KEP_SIGNATURE_ACCEPTED`;
7. якщо всі required signers завершили, завершити envelope.

---

## 11. Валідація підпису

### 11.1. Обов'язкові перевірки

1. Signature cryptographic validity.
2. Detached signature відповідає exact document bytes/hash.
3. Сертифікат підписувача присутній.
4. Chain validation до trusted CA.
5. Перевірка чинності сертифіката на signing time або validation time.
6. OCSP/CRL status.
7. TSP/time-stamp, якщо присутній або обов'язковий для профілю.
8. Визначення legal class:
   - `KEP`;
   - `UEP_QC`;
   - `AdES`;
   - `INVALID`;
   - `UNKNOWN`.
9. Фіксація trust material version.
10. Збереження raw SDK report для повторного аудиту.

### 11.2. Fail-closed правило

Підпис не приймається, якщо:

- verification SDK не ініціалізувався;
- CAs/trust material недоступні;
- підпис не відповідає документу;
- certificate chain невалідний;
- OCSP/CRL підтверджує revoke або неможливо отримати статус у production-профілі;
- payload/session/hash не збігаються;
- session expired;
- callback nonce неправильний.

У dev/test можна мати `ALLOW_SKIP_VERIFY=true`, але production build має падати при старті, якщо цей прапор увімкнено.

---

## 12. Evidence package

### 12.1. Склад пакета

ZIP package має містити:

```text
evidence-package.zip
├── original/
│   └── <original-file>
├── signatures/
│   ├── cades-detached/
│   │   └── <file>.p7s
│   ├── cades-enveloped/
│   │   └── <file>.cades.p7s
│   └── pades/
│       └── <file>.signed.pdf
├── validation/
│   ├── report.json
│   └── report.pdf
├── audit/
│   └── audit-log.json
├── trust/
│   ├── trust-material.json
│   └── ca-bundle-hashes.json
└── manifest.json
```

### 12.2. Manifest

`manifest.json` має включати:

- envelope id;
- document ids;
- original file names;
- SHA-256 кожного файлу;
- signer list;
- signature artifacts;
- validation result;
- trust material version;
- generatedAt;
- system version;
- instance URL;
- audit event hashes.

### 12.3. Acceptance criteria

- Пакет можна завантажити після completed envelope.
- Hashes у manifest збігаються з файлами.
- Якщо підпис invalid — envelope не completed, але доступний diagnostic package для адміністратора.
- Пакет не містить private keys, PIN, password або raw sensitive fields.

---

## 13. Audit log

### 13.1. Події

Додати або нормалізувати події:

- `ENVELOPE_CREATED`
- `DOCUMENT_UPLOADED`
- `DOCUMENT_HASH_LOCKED`
- `RECIPIENT_ADDED`
- `ENVELOPE_SENT`
- `RECIPIENT_OPENED`
- `UA_KEP_SESSION_CREATED`
- `UA_KEP_METHOD_SELECTED`
- `UA_KEP_SIGNATURE_SUBMITTED`
- `UA_KEP_SIGNATURE_VERIFIED`
- `UA_KEP_SIGNATURE_REJECTED`
- `UA_KEP_SIGNATURE_ACCEPTED`
- `RECIPIENT_SIGNED`
- `ENVELOPE_COMPLETED`
- `EVIDENCE_PACKAGE_GENERATED`
- `DOCUMENT_REJECTED`
- `ENVELOPE_CANCELLED`

### 13.2. Вимоги

1. Audit log append-only на рівні application logic.
2. Кожна подія має містити:
   - timestamp;
   - actor;
   - recipientId/userId/email;
   - IP;
   - user-agent;
   - requestId;
   - envelopeId;
   - document hash, якщо релевантно;
   - sanitized metadata.
3. Для production бажано додати hash chain audit log:

```text
eventHash = sha256(previousEventHash + canonicalJson(event))
```

---

## 14. Security requirements

### 14.1. Обов'язково

1. Не передавати private key material на backend.
2. Не передавати PIN/password/secret у logs або DB.
3. Не віддавати server API key у browser.
4. Використовувати short-lived scoped session token.
5. Підписаний callback SignService → VilnoEDO.
6. Rate limit для upload, signing, PKI proxy, verification.
7. CSP для основного app.
8. Ізоляція signing UI на окремому origin або route з мінімальними дозволами.
9. SSRF protection для PKI proxy:
   - host allow-list;
   - scheme allow-list;
   - DNS resolve private IP deny-list;
   - redirect host re-validation;
   - response size limit;
   - timeout;
   - audit log.
10. Production startup checks.
11. Structured error handling без leakage sensitive data.
12. Malware/file type scanning hook як optional extension.

### 14.2. Production startup checks

Система не повинна запускатися в production, якщо:

- не задано DB URL;
- не задано app secret;
- не задано storage config;
- не задано server-to-server secret для SignService;
- `ALLOW_SKIP_VERIFY=true`;
- trust material missing;
- SignService недоступний, якщо `UA_KEP` увімкнено як required feature.

---

## 15. Deployment

### 15.1. Docker Compose для MVP

```text
services:
  vilnoedo-web
  vilnoedo-worker
  postgres
  redis
  minio
  sign-service
  mailpit/dev-smtp або production SMTP
```

### 15.2. Мінімальні env-змінні

```env
NEXT_PRIVATE_DATABASE_URL=
NEXT_PRIVATE_DIRECT_DATABASE_URL=
NEXT_PUBLIC_WEBAPP_URL=
NEXTAUTH_SECRET=
NEXT_PRIVATE_ENCRYPTION_KEY=
NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY=
NEXT_PUBLIC_UPLOAD_TRANSPORT=s3
NEXT_PRIVATE_UPLOAD_ENDPOINT=
NEXT_PRIVATE_UPLOAD_FORCE_PATH_STYLE=true
NEXT_PRIVATE_UPLOAD_REGION=
NEXT_PRIVATE_UPLOAD_BUCKET=
NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID=
NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY=
NEXT_PRIVATE_SIGN_SERVICE_URL=
NEXT_PRIVATE_SIGN_SERVICE_SECRET=
NEXT_PRIVATE_UA_KEP_ENABLED=true
NEXT_PRIVATE_DEFAULT_LOCALE=uk
NEXT_PRIVATE_DEFAULT_TIMEZONE=Europe/Kyiv
```

### 15.3. Observability

1. JSON logs у production.
2. Request IDs.
3. Health endpoints:
   - web app;
   - worker;
   - DB;
   - storage;
   - SignService;
   - trust material freshness.
4. Metrics:
   - documents created;
   - signatures accepted/rejected;
   - verification failures;
   - PKI proxy failures;
   - queue latency;
   - evidence generation time.

---

## 16. Тестування

### 16.1. Unit tests

- signature-level helpers;
- token/session validation;
- manifest generation;
- audit event hashing;
- validation report mapper;
- storage key generator;
- redaction utilities.

### 16.2. Integration tests

- create envelope → create UA_KEP session;
- submit valid detached signature;
- reject invalid detached signature;
- expired session;
- wrong recipient;
- wrong document hash;
- duplicate callback idempotency;
- evidence package generation.

### 16.3. E2E tests

- sender creates document;
- recipient opens link;
- recipient signs with mocked SignService;
- envelope completed;
- evidence package downloaded;
- audit log contains required events.

### 16.4. Real crypto fixtures

Потрібно підготувати тестовий набір:

1. Валідний CAdES detached для тестового документа.
2. Підпис для іншого документа — має бути rejected.
3. Пошкоджений `.p7s` — rejected.
4. Сертифікат expired — expected result згідно профілю.
5. Сертифікат revoked — rejected.
6. Підпис із timestamp.
7. Підпис без timestamp.
8. SmartID fixture після появи реального provider flow.

---

## 17. Roadmap

### Phase 0 — Stabilization and fork cleanup

- [ ] Видалити/відключити license gates.
- [ ] Прибрати billing із MVP-шляху.
- [ ] Перевірити AGPL/trademark attribution.
- [ ] Налаштувати branding VilnoEDO.
- [ ] Вимкнути telemetry або зробити opt-in.
- [ ] Описати self-hosting quickstart.

### Phase 1 — UA_KEP core model

- [ ] Додати/уточнити Prisma-моделі.
- [ ] Додати migrations.
- [ ] Додати `isRecipientBoundCryptoEnvelope`.
- [ ] Провести `UA_KEP` через send/sign/complete/download flows.
- [ ] Заборонити mutation документа після hash lock.

### Phase 2 — SignService hardening

- [ ] Виправити fail-closed verification bug.
- [ ] Заборонити `ALLOW_SKIP_VERIFY` у production.
- [ ] Замінити browser API key на scoped session token.
- [ ] Додати Redis/Postgres session store.
- [ ] Захардити PKI proxy.
- [ ] Додати structured validation report.
- [ ] Додати trust material versioning.

### Phase 3 — UI integration

- [ ] Додати кнопку «Підписати КЕП» у recipient flow.
- [ ] Додати вибір методу підпису.
- [ ] Додати iframe/popup або redirect на isolated signing UI.
- [ ] Показувати validation result після підпису.
- [ ] Українські тексти та помилки.

### Phase 4 — Evidence package

- [x] Manifest generator.
- [ ] Validation report PDF.
- [x] Audit log export.
- [x] ZIP builder.
- [x] Download endpoint.
- [ ] Hash verification tests.

### Phase 5 — Production deployment

- [ ] Docker Compose production profile.
- [ ] MinIO/S3 storage.
- [ ] Redis queues/sessions.
- [ ] Health checks.
- [ ] Backup/restore docs.
- [ ] Admin settings page.

### Phase 6 — Advanced signatures

- [ ] PAdES support.
- [ ] PAdES-LTV/LTA research.
- [ ] SmartID real end-to-end.
- [ ] Дія.Підпис feasibility.
- [ ] Multiple signatures per document.
- [ ] Long-term validation renewal job.

---

## 18. Definition of Done для MVP

MVP вважається готовим, якщо:

1. Інстанс запускається локально через Docker Compose.
2. Новий користувач може створити організацію.
3. Користувач може створити документ на підпис.
4. Можна додати підписувача.
5. Підписувач отримує посилання.
6. Підписувач відкриває документ українською мовою.
7. Підписувач підписує CAdES detached локальним КЕП.
8. Backend перевіряє підпис fail-closed.
9. Невалідний підпис не приймається.
10. Валідний підпис змінює recipient status на `SIGNED`.
11. Envelope стає `COMPLETED`, коли всі required signers підписали.
12. Evidence package завантажується й містить original, signature, manifest, validation report, audit log.
13. Усі core-функції MVP працюють без license key.
14. Немає витоку PIN/password/private key у logs, DB, audit або package.
15. CI проходить.
16. README описує запуск, обмеження MVP та security model.

---

## 19. Основні ризики

### 19.1. Legal/compliance risk

КЕП/УЕП має юридичний контекст. Потрібна перевірка профілів підпису, сертифікатів, OCSP/TSP та правил зберігання. Не можна заявляти більше, ніж реально реалізовано.

### 19.2. Crypto SDK dependency risk

`@it-enterprise/digital-signature` та IIT/browser stack можуть мати обмеження, CORS, browser compatibility, licensing або нестабільність API. Потрібні integration tests і fallback strategy.

### 19.3. SmartID/cloud provider risk

Cloud signing залежить від провайдера, client prefix, API-доступу й умов використання. До реального end-to-end тесту SmartID має бути experimental.

### 19.4. Evidence durability risk

Якщо не зберігати validation evidence, через роки може бути складно довести чинність підпису на момент підписання.

### 19.5. Upstream divergence risk

Глибокий fork Documenso ускладнить upstream merge. Потрібно відокремити українські модулі та мінімізувати invasive changes.

---

## 20. Рекомендований перший набір GitHub issues

1. `fork-cleanup: remove paid license gates from MVP paths`
2. `ua-kep: add production Prisma models and migrations`
3. `ua-kep: implement signing session API`
4. `sign-service: fail closed on invalid verification result`
5. `sign-service: replace browser API key with scoped session token`
6. `sign-service: harden PKI proxy against SSRF`
7. `ua-kep: integrate SignService callback into recipient signing flow`
8. `ua-kep: persist signature artifacts and validation reports`
9. `evidence: generate manifest and ZIP evidence package`
10. `i18n: make Ukrainian default locale and translate signing flow`
11. `audit: add UA_KEP audit events`
12. `deployment: add production Docker Compose profile`
13. `tests: add mocked SignService E2E flow`
14. `tests: add real CAdES detached fixtures`

---

## 21. Порядок реалізації у коді

Рекомендована черга pull requests:

1. `docs: add technical spec and roadmap`
2. `chore: fork cleanup and branding baseline`
3. `chore: disable MVP license gates`
4. `feat: add UA_KEP signature level helpers`
5. `feat: add UA_KEP Prisma models`
6. `feat: add UA_KEP signing session API`
7. `feat: add SignService client package`
8. `fix(sign-service): fail closed on verification failure`
9. `feat(sign-service): scoped session token auth`
10. `feat: recipient UA_KEP signing UI`
11. `feat: persist validation reports and artifacts`
12. `feat: generate evidence package`
13. `test: add UA_KEP integration and E2E tests`
14. `docs: add deployment and operator guide`

---

## 22. Ключові технічні рішення

1. Перший юридично орієнтований формат: `CAdES detached`.
2. `PAdES` — друга черга після стабілізації CAdES.
3. `UA_KEP` — окремий signature level, не SES.
4. VilnoEDO є source of truth для статусів.
5. SignService є stateless/short-lived signing gateway, наскільки це можливо.
6. Private key ніколи не зберігається на backend.
7. Verification fail-closed.
8. Evidence package є обов'язковим результатом completed envelope.
9. Українська мова та українська термінологія — default.
10. Усі MVP-функції доступні без paid/license gates.

---

## 23. Відкриті питання

1. Який точний профіль КЕП/УЕП вважати мінімально прийнятним для MVP?
2. Чи потрібен обов'язковий TSP для всіх підписів MVP?
3. Чи підтримувати XML/XAdES у першій версії, чи тільки CAdES detached?
4. Як саме зберігати OCSP/TSP evidence для довгострокової перевірки?
5. Які КНЕДП/типи ключів включити у test matrix першими?
6. Чи потрібна інтеграція з ЄДР/ДРФО/контрагентами у MVP?
7. Чи робити signing UI embedded iframe або redirect на окремий origin?
8. Який мінімальний рівень append-only гарантій audit log потрібен для першого production deployment?

---

## 24. Підсумок

VilnoEDO має розвиватися як повноцінний open-source ЕДО для України, а не як окрема сторінка підпису. Найближча практична ціль — стабільний MVP з CAdES detached, українським UI, immutable document hash, recipient-bound КЕП/УЕП flow, validation report, audit log та evidence package.

Після цього можна переходити до PAdES-LTV, SmartID, Дія.Підпис, advanced workflows, API для інтеграцій і production-grade compliance hardening.
