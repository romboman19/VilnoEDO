# VilnoEDO — POC implementation plan

Цей документ описує перший практичний план вбудування українського signing provider у наявну архітектуру VilnoEDO.

## 1. Вихідна точка

### Що вже є в Documenso / VilnoEDO
У системі вже існує кількарівневий signing stack:
- `local` — локальний інстансний сертифікат
- `gcloud-hsm` — хмарний KMS/HSM
- `csc` — per-recipient TSP/CSC flow

Ключове спостереження:
## український КЕП — це архітектурно ближче до per-recipient signing flow, ніж до instance-wide local signing.

Тобто нам не треба пхати це в `local` transport. Правильніше мислити новий шар як окремий recipient-level signing mode.

---

## 2. Основне технічне рішення

### Новий рівень підпису
Додаємо новий `SignatureLevel`:
- `UA_KEP`

Це дає окрему гілку для українського підпису без ламання існуючих `SES / AES / QES` сценаріїв.

### Чому так краще
- не перевантажуємо старі meaning existing levels
- легше branch-ити UI/route/signing flow
- можна акуратно інтегрувати multi-signer логіку
- простіше поступово виводити український transport на головну роль

---

## 3. Який метод беремо першим

### Перший POC метод:
- `privatbank-jks`

### Чому
- найменше залежностей від заліза
- простіше для контрольованого E2E
- можна повторювати на кількох машинах
- менше нестабільності, ніж у `smartid`
- не вимагає фізичного токена як обов'язкової умови

### Наступні етапи
- `iit-token`
- `smartid`

---

## 4. Який integration shape беремо

### Створюємо новий внутрішній пакет
Рекомендований пакет:
- `packages/ua-kep`

### Його роль
Це буде внутрішній український signing module всередині монорепи VilnoEDO.

Він повинен включати:
- server-side orchestration
- session handling
- PKI proxy / CA registry
- browser-side IIT signing bootstrap
- підготовку hash-to-sign
- прийом CAdES/p7s результату
- embed/sign completion

---

## 5. Рекомендована структура нового пакета

```text
packages/ua-kep/
├── package.json
├── tsconfig.json
├── index.ts
├── types/
│   ├── signing-methods.ts
│   └── session.ts
├── server/
│   ├── ca-registry.ts
│   ├── pki-proxy.ts
│   ├── prepare-signing.ts
│   ├── embed-signature.ts
│   └── session.ts
├── client/
│   ├── iit-signer-factory.ts
│   ├── jks-reader.ts
│   └── hooks/
│       ├── use-signing-method.ts
│       └── use-ua-kep-signing.ts
└── hono/
    ├── index.ts
    ├── bootstrap.ts
    ├── prepare.ts
    ├── complete.ts
    └── pki-proxy.ts
```

---

## 6. Що переносимо з VilnoCheck-SignService

Не переносимо весь standalone app.

Переносимо:
- логіку PKI proxy
- завантаження / allowlist для CAs
- IIT signer bootstrap
- JKS key reading flow
- підхід до signer metadata
- підхід до method definitions
- browser-side signing flow через `@it-enterprise/digital-signature`

### Джерело для переносу
- `src/server/server.js`
- `src/client/main.js`
- `public/data/CAs.json`
- `public/data/CACertificates.p7b`
- `public/euscp.worker.js`

---

## 7. Які exact файли чіпаємо першими

## Phase 0 — статичні активи
1. `apps/remix/public/ua-kep/vendor/euscp.worker.js`
2. `apps/remix/public/ua-kep/data/CAs.json`
3. `apps/remix/public/ua-kep/data/CACertificates.p7b`

## Phase 1 — типи та модель
4. `packages/lib/types/signature-level.ts`
5. `packages/prisma/schema.prisma`
6. prisma migration

## Phase 2 — новий пакет
7. `packages/ua-kep/package.json`
8. `packages/ua-kep/tsconfig.json`
9. `packages/ua-kep/types/signing-methods.ts`
10. `packages/ua-kep/types/session.ts`
11. `packages/ua-kep/server/ca-registry.ts`
12. `packages/ua-kep/server/pki-proxy.ts`
13. `packages/ua-kep/server/prepare-signing.ts`
14. `packages/ua-kep/server/embed-signature.ts`
15. `packages/ua-kep/server/session.ts`
16. `packages/ua-kep/hono/bootstrap.ts`
17. `packages/ua-kep/hono/prepare.ts`
18. `packages/ua-kep/hono/complete.ts`
19. `packages/ua-kep/hono/pki-proxy.ts`
20. `packages/ua-kep/hono/index.ts`

## Phase 3 — mount routes
21. `apps/remix/server/router.ts`

## Phase 4 — frontend signing panel
22. `packages/ua-kep/client/iit-signer-factory.ts`
23. `packages/ua-kep/client/jks-reader.ts`
24. `packages/ua-kep/client/hooks/use-signing-method.ts`
25. `packages/ua-kep/client/hooks/use-ua-kep-signing.ts`
26. `apps/remix/app/components/general/document-signing/ua-kep-signing-panel.tsx`
27. `apps/remix/app/components/general/document-signing/ua-kep-signing-provider.tsx`

## Phase 5 — existing signing page integration
28. `apps/remix/app/routes/_recipient+/sign.$token+/_index.tsx`
29. `apps/remix/app/components/general/document-signing/document-signing-complete-dialog.tsx`

## Phase 6 — seal-time awareness / lifecycle
30. `packages/lib/jobs/definitions/internal/seal-document.handler.ts`
31. recipient completion / enterprise signing flow files after exact branch validation

---

## 8. Prisma зміни

### Додаємо нову модель
`UaKepSession`

Призначення:
- зберігати transient state для recipient signing
- hash-to-sign
- signing method
- signer metadata
- status
- signing time

### Також
до `Recipient` додається relation на `UaKepSession`.

### Чому окрема модель
Бо це дозволяє:
- не псувати вже існуючі сутності тимчасовим українським станом
- мати контрольований lifecycle signing session
- легше дебажити і очищати state

---

## 9. Перший thin-slice flow

### Цільовий сценарій POC
1. sender створює документ
2. для документа обирається `signatureLevel = UA_KEP`
3. recipient відкриває стандартну сторінку підпису
4. система бачить `UA_KEP` і показує український signing panel
5. recipient обирає `privatbank-jks`
6. завантажує `.jks`
7. у браузері читається ключ через IIT SDK
8. frontend викликає `POST /api/ua-kep/prepare`
9. сервер повертає `hashB64`
10. браузер підписує hash і формує detached signature
11. frontend викликає `POST /api/ua-kep/complete`
12. сервер вбудовує результат у document flow
13. recipient отримує статус signed
14. якщо всі підписанти завершили — запускається штатний finalize/seal flow

---

## 10. Ключовий архітектурний принцип

### Криптографія в браузері, workflow на сервері
Це критично.

Бо в українському сценарії:
- ключ живе у користувача
- підпис формується локально
- але lifecycle документа має контролювати VilnoEDO

Тому POC має чітко розділяти:
- **browser signing**
- **server workflow orchestration**

---

## 11. Що вважаємо успішним POC

POC готовий, якщо одночасно виконуються всі умови:

### Мінімальні критерії
- [ ] документ із `UA_KEP` реально відкриває окремий український signing flow
- [ ] `privatbank-jks` працює в браузері
- [ ] система коректно готує hash-to-sign
- [ ] браузер повертає detached signature
- [ ] VilnoEDO приймає її і вбудовує в документний lifecycle
- [ ] recipient стає signed через штатний flow
- [ ] seal/finalization не ламається
- [ ] документ із 2 підписантами не валиться по state machine

### Ідеальний бонусний критерій
- [ ] у metadata видно method / signer info / status перевірки

---

## 12. Що не робимо у першому проході

- не переносимо одразу `smartid`
- не замінюємо всі upstream signing mode
- не робимо глобальний branding pass
- не локалізуємо весь продукт до інтеграції signing flow
- не переписуємо всі document/envelope моделі

---

## 13. Найкраща наступна practical дія

Після цього документа логічно йти в:

## **implementation spike / first code slice**

Тобто наступний крок — уже не ще один стратегічний текст, а:
- створення `packages/ua-kep`
- додавання `UA_KEP`
- додавання `UaKepSession`
- mount `api/ua-kep`
- тонкий signing panel для `privatbank-jks`

Саме це буде перший реальний рух до робочого VilnoEDO signing core.
