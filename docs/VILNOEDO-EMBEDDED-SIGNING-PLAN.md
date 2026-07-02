# VilnoEDO — embedded signing plan

Цей документ фіксує план, за яким український signing stack вбудовується **всередину архітектури VilnoEDO**, а не живе як сусідній зовнішній сервіс.

## 1. Принцип

VilnoEDO вже успадковує від Documenso готовий signing layer, recipient flow і sealing flow.

Тому правильний напрям:
- **не ламати document workflow**
- **не будувати паралельний сторонній документообіг**
- **не обривати multi-signer логіку**
- **вмонтувати український signing transport у наявний signing subsystem**

## Ключова ідея
Не переписувати весь механізм підпису з нуля.
Потрібно додати новий український signing provider / transport, який стане штатною частиною VilnoEDO.

---

## 2. Що не чіпаємо на старті

На першому етапі не потрібно:
- робити ребрендинг усього продукту
- переписувати всі тексти
- змінювати core document model без потреби
- викидати існуючі upstream signing mode до перевірки нового шляху
- ламати наявний multi-signer pipeline

---

## 3. Що саме використовуємо з Documenso

### Existing architecture, яку варто зберегти
- `packages/signing` — transport layer
- recipient signing flow
- tRPC recipient completion flow
- enterprise signing entry points
- sealing/finalization jobs
- envelope/document lifecycle
- multi-recipient orchestration

Це дає вже готовий каркас для:
- кількох підписантів
- послідовного/паралельного підписання
- фіналізації документа після всіх підписів

---

## 4. Який шов використовуємо

Найбільш логічний технічний шов:

### Existing signing/TSP layer
Орієнтуємось на поточний transport/provider підхід у Documenso.

Це означає:
- додаємо **новий український signing transport/provider**
- підключаємо його до наявної логіки recipient signing
- зберігаємо документний workflow без великого переписування

## Практично
Потрібно дослідити і використати такі зони:
- `packages/signing`
- `packages/trpc/server/recipient-router/router.ts`
- `apps/remix/app/routes/_recipient+/sign.$token+/_index.tsx`
- `apps/remix/server/router.ts`
- `packages/lib/jobs/definitions/internal/seal-document.handler.ts`

---

## 5. Роль VilnoCheck-SignService у новій моделі

`VilnoCheck-SignService` більше не мислиться як окремий сусідній продукт.

Він стає:
## джерелом логіки, модулів і інтеграційних рішень
які будуть перенесені або адаптовані всередині VilnoEDO.

### Що звідти потенційно переносимо
- опис signing methods
- key media handling
- token / JKS / SmartID flows
- signer metadata extraction
- provider configuration patterns
- session-like state model
- PKI / CA / proxy-related напрацювання

### Що не треба переносити 1-в-1 бездумно
- окремий standalone UI сервіс
- повністю окремий document storage lifecycle
- повністю окрему зовнішню orchestration-модель

Тобто переносимо не «ще один продукт», а:
## українське signing core як доменну логіку

---

## 6. Цільова архітектура

### VilnoEDO App
Відповідає за:
- документ
- підписантів
- порядок підписання
- поля підпису
- статуси
- історію подій
- фіналізацію документа

### Embedded Ukrainian Signing Layer
Відповідає за:
- вибір методу підпису
- криптографічну підготовку
- взаємодію з токеном / файловим ключем / cloud flow
- повернення signed result у document workflow

### Optional extracted internal module
Логічно це оформити як окремий пакет/підмодуль всередині монорепи, а не розмазувати по всіх шарах.

Наприклад:
- `packages/signing-ua`
або
- `packages/ee/server-only/signing/ua-kep`

---

## 7. Рекомендований перший технічний напрям

Не видаляти старий upstream signing transport одразу.

### Правильна стратегія
#### Phase 1 — additive
- додаємо український transport/provider
- запускаємо його паралельно існуючому підписному шару
- перевіряємо повний flow

#### Phase 2 — make it primary
- коли новий шлях стабільний, робимо його основним для VilnoEDO
- upstream-варіанти можна приховати, вимкнути або залишити лише як fallback/dev mode

#### Phase 3 — cleanup
- тільки після стабільності прибираємо непотрібні шари

---

## 8. Перший мінімальний технічний зріз

Хоча цільова система підтримує багатьох підписантів, перший етап реалізації треба різати тонко.

### Thin slice для вбудування
1. один тип документа
2. один метод підпису
3. один маршрут підписання
4. але всередині штатної архітектури VilnoEDO

### Важливо
POC має вбудовуватися так, щоб:
- не ламати multi-signer model
- не обходити recipient flow окремим шляхом
- не створювати тимчасовий паралельний світ поза платформою

---

## 9. Який метод брати першим

Для першого технічного вбудування я б усе ще рекомендував:
## `privatbank-jks`

### Чому
- немає фізичного токена як обов'язкової умови
- простіше відтворити на кількох робочих місцях
- зручніше для контрольованого end-to-end запуску
- менше зовнішньої нестабільності, ніж у SmartID

Після цього другим етапом:
- `iit-token`

І вже пізніше:
- `smartid`

---

## 10. Що означає “не зламати архітектуру”

Є 4 критичні місця, які не можна обійти костилями:

### 1. Recipient completion flow
Підписант повинен завершувати підпис через штатний механізм, а не через зовнішній обхідний сценарій.

### 2. Multi-signer orchestration
Документ із кількома підписантами має залишитися в тій самій моделі переходів станів.

### 3. Seal/finalization chain
Після завершення всіх підписів документ має проходити фіналізацію штатно.

### 4. Audit / metadata
Тип підпису, метод, сертифікатні дані і технічний результат мають бути включені в модель документа, а не жити окремо і випадково.

---

## 11. Практичний план реалізації

### Етап A — architecture fit
- визначити exact interface для нового signing provider
- вирішити, чи це буде новий transport, чи розширення наявного TSP/CSC seam
- описати, які частини `VilnoCheck-SignService` переносяться всередину монорепи

### Етап B — internal module bootstrap
- створити новий модуль/пакет для українського signing layer
- додати конфіг для першого методу підпису
- підготувати contract до recipient flow

### Етап C — recipient flow integration
- інтегрувати новий method/provider в signing page та server route layer
- переконатися, що процес завершується через штатний completion pipeline

### Етап D — end-to-end thin slice
- підпис одного документа одним підписантом
- перевірка, що signed result потрапляє в нормальний lifecycle документа

### Етап E — multi-signer validation
- документ з 2+ підписантами
- перевірка, що новий signing transport не ламає чергу/етапність/фіналізацію

### Етап F — provider expansion
- додати наступні методи підпису
- стабілізувати модель metadata
- прибрати/приховати зайві upstream signing modes за потреби

---

## 12. Що робити далі відразу після цього документа

Наступний логічний документ:
## `VILNOEDO-POC-IMPLEMENTATION-PLAN.md`

У ньому вже має бути:
- точний список файлів для першого коміту
- які моделі/типи розширюємо
- де вставляємо новий provider
- який перший API/route/UI path реалізовуємо
- що вважаємо критерієм “POC працює”

---

## 13. Підсумок

VilnoEDO має йти не шляхом зовнішнього допоміжного sign-сервісу поруч, а шляхом:

## **вбудованого українського signing layer всередині існуючої архітектури Documenso**

Це найбільш логічний шлях, бо він:
- поважає існуючий multi-signer workflow
- не ламає document lifecycle
- дозволяє зробити підпис штатною частиною продукту
- дає можливість поступово витіснити невідповідні upstream signing mode без ризикового одномоментного переписування
