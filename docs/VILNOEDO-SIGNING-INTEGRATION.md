# VilnoEDO — signing integration contract

Цей документ описує базовий контракт інтеграції між:
- **VilnoEDO** — документний застосунок і workflow
- **VilnoCheck-SignService** — окремий signing core для українських сценаріїв підпису

## 1. Мета інтеграції

VilnoEDO не повинен самостійно реалізовувати всю криптографічну логіку.

Його задача:
- керувати документами
- керувати маршрутом підписання
- показувати підписанту правильний сценарій
- зберігати статуси, артефакти і журнал дій

Задача `VilnoCheck-SignService`:
- проводити сесію підписання
- працювати з ключами, токенами, cloud signing
- формувати результат підпису
- віддавати VilnoEDO підсумковий артефакт і метадані підпису

---

## 2. Базова модель взаємодії

### Крок 1
VilnoEDO створює signing session для конкретного документа і конкретного підписанта.

### Крок 2
VilnoCheck-SignService повертає:
- `sessionId`
- доступні методи підпису
- metadata для UI
- статус сесії

### Крок 3
Користувач проходить сценарій підпису через SignService.

### Крок 4
SignService повертає результат у VilnoEDO:
- signed artifact
- metadata сертифіката
- тип підпису
- timestamp / technical proof data
- підсумковий статус

### Крок 5
VilnoEDO оновлює свій workflow:
- відзначає підписанта як завершеного
- зберігає артефакти
- логує подію
- запускає наступний крок маршруту

---

## 3. Мінімальні сутності

### SigningSession
Сесія підписання, створена VilnoEDO.

Пропоновані поля:
- `id`
- `documentId`
- `recipientId`
- `externalSessionId`
- `status`
- `allowedMethods[]`
- `selectedMethod`
- `createdAt`
- `expiresAt`
- `completedAt`

### SignatureResult
Результат завершеного підпису.

Пропоновані поля:
- `documentId`
- `recipientId`
- `method`
- `signatureType` (`KEP`, `UEP`, `OTHER`)
- `provider`
- `certificateSubject`
- `certificateIssuer`
- `certificateSerial`
- `signedAt`
- `verificationStatus`
- `artifactType`
- `artifactUrl` або internal storage reference
- `rawMetadata`

### VerificationSnapshot
Технічний зріз перевірки підпису.

Пропоновані поля:
- `isValid`
- `signerName`
- `issuer`
- `serial`
- `timeInfo`
- `certificateStatus`
- `validationErrors[]`
- `sourceProvider`

---

## 4. Мінімальний API-контракт

## 4.1 Bootstrap / methods
### `GET /api/bootstrap`
Повертає список доступних методів підпису і конфіг для клієнта.

**VilnoEDO використовує для:**
- показу доступних методів
- перевірки, які сценарії взагалі доступні в інсталяції

---

## 4.2 Створення сесії підписання
### `POST /api/signing/sessions`

**VilnoEDO -> SignService**

```json
{
  "documentId": "doc_123",
  "recipientId": "rec_456",
  "fileName": "dogovir.pdf",
  "mimeType": "application/pdf",
  "documentUrl": "https://vilnoedo.local/internal/documents/doc_123/download",
  "allowedMethods": ["iit-token", "privatbank-jks", "smartid"],
  "callbackUrl": "https://vilnoedo.local/api/internal/signing/callback",
  "context": {
    "tenantId": "team_1",
    "documentTitle": "Договір поставки",
    "signerDisplayName": "ТОВ Х",
    "locale": "uk"
  }
}
```

**Відповідь:**
```json
{
  "sessionId": "sigsess_123",
  "status": "created",
  "availableMethods": [
    { "id": "iit-token", "label": "Токен КЕП" },
    { "id": "privatbank-jks", "label": "Файловий ключ" },
    { "id": "smartid", "label": "Хмарний підпис" }
  ],
  "expiresAt": "2026-07-02T18:00:00Z"
}
```

---

## 4.3 Статус сесії
### `GET /api/signing/sessions/:sessionId`

Повертає:
- поточний статус
- обраний метод
- чи завершено підпис
- чи є помилка
- чи готовий результат

Можливі статуси:
- `created`
- `awaiting_method`
- `awaiting_user_action`
- `processing`
- `signed`
- `failed`
- `expired`

---

## 4.4 Запуск підпису певним методом
### `POST /api/signing/sessions/:sessionId/start`

```json
{
  "method": "iit-token"
}
```

Потрібно, якщо метод обирається не під час створення сесії, а окремим кроком у UI.

---

## 4.5 Отримати результат підпису
### `GET /api/signing/sessions/:sessionId/result`

Відповідь:
```json
{
  "status": "signed",
  "documentId": "doc_123",
  "recipientId": "rec_456",
  "method": "iit-token",
  "signatureType": "KEP",
  "provider": "iit-local",
  "signedAt": "2026-07-02T17:10:00Z",
  "artifact": {
    "type": "signed-pdf",
    "downloadUrl": "https://signservice.local/storage/abc"
  },
  "certificate": {
    "subject": "...",
    "issuer": "...",
    "serial": "..."
  },
  "verification": {
    "isValid": true,
    "certificateStatus": "valid",
    "validationErrors": []
  }
}
```

---

## 4.6 Callback у VilnoEDO
### `POST /api/internal/signing/callback`

**SignService -> VilnoEDO**

```json
{
  "sessionId": "sigsess_123",
  "status": "signed",
  "result": {
    "method": "iit-token",
    "signatureType": "KEP",
    "provider": "iit-local",
    "signedAt": "2026-07-02T17:10:00Z",
    "artifact": {
      "type": "signed-pdf",
      "downloadUrl": "https://signservice.local/storage/abc"
    },
    "certificate": {
      "subject": "...",
      "issuer": "...",
      "serial": "..."
    },
    "verification": {
      "isValid": true,
      "certificateStatus": "valid",
      "validationErrors": []
    }
  }
}
```

---

## 5. Мінімальні вимоги до UI VilnoEDO

VilnoEDO має вміти:
- показати доступні методи підпису
- пояснити різницю між КЕП / УЕП простими словами
- показати статус сесії підписання
- показати технічний результат після підпису
- зберегти в документі, яким саме методом і яким типом підпису його підписано

## На старті важливо не перевантажити UI.
Перший варіант може бути простим:
- екран вибору методу
- екран виконання підпису
- екран успіху / помилки

---

## 6. Що не треба робити в першій версії

- не намагатися одразу підтримати всі методи підпису
- не змішувати certificate validation logic всередині всіх route-компонентів VilnoEDO
- не лізти в глибокі зміни моделі документів до появи першого робочого flow
- не робити складну матрицю ролей раніше, ніж з'явиться реальна потреба

---

## 7. Рекомендований перший proof-of-concept

### POC #1
**Один документ -> один підписант -> один метод підпису**

Рекомендований стартовий сценарій:
- завантаження PDF у VilnoEDO
- створення signing session
- підпис через один реальний метод із `VilnoCheck-SignService`
- повернення signed PDF
- збереження статусу і metadata в VilnoEDO

### Можливі стартові методи
1. `privatbank-jks`
2. `iit-token`

SmartID краще залишити другим етапом після стабілізації першого end-to-end flow.

---

## 8. Висновок

VilnoEDO має інтегруватися з `VilnoCheck-SignService` не як з випадковим helper'ом, а як з окремим signing core.

Тому контракт потрібно мислити через:
- signing sessions
- explicit signing methods
- structured signature metadata
- artifact return
- callback або polling status flow

Саме це дасть стабільну основу для українського EDO-продукту.
