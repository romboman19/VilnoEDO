# VilnoEDO — technical cut map

Цей документ фіксує, **де саме різати форк Documenso**, щоб перетворити його на VilnoEDO без хаотичного переписування всього монорепозиторію.

## 1. Загальна карта системи

### Підтверджено
VilnoEDO успадковує monorepo-структуру Documenso:
- `apps/remix` — основний застосунок
- `packages/lib` — базова бізнес-логіка
- `packages/trpc` — API v2
- `packages/api` — API v1
- `packages/prisma` — база даних і міграції
- `packages/signing` — поточне ядро підпису PDF
- `packages/auth` — авторизація
- `packages/email` — листи
- `packages/ui` — UI-компоненти

Це видно з:
- `package.json`
- `ARCHITECTURE.md`
- структури `apps/` і `packages/`

## 2. Найважливіші точки майбутньої української переробки

### A. Локалізація — low/medium risk, high priority
**Де дивитися:**
- `packages/lib/constants/locales.ts`
- `lingui.config.ts`
- `apps/remix/app/routes/api+/locale.tsx`
- форми та route-компоненти в `apps/remix/app/...`

**Що робити:**
- додати українську локаль як first-class
- перевірити, чи можна зробити `uk` default locale
- пройтись по ключових auth/document/signing екранах
- замінити термінологію під український EDO-контекст

**Чому це перший крок:**
локалізація не ламає core model, але одразу переводить форк у власну ідентичність.

---

### B. Брендинг — low risk, high priority
**Де дивитися:**
- `apps/remix/app/components/...`
- `packages/assets`
- auth/signin/signup routes
- layout/header/footer/shared UI components

**Що робити:**
- замінити назву Documenso на VilnoEDO
- прибрати зовнішні посилання на documenso.com / discord / roadmap upstream
- оновити README, метадані, title, brand assets

**Статус:**
README і fork strategy вже стартово оновлені, але UI ще ні.

---

### C. Підпис — high risk, core direction
**Де дивитися:**
- `packages/signing`
- `apps/remix/app/utils/field-signing/*`
- embed/signing routes в `apps/remix/app/components/embed/*`
- tRPC/document/envelope/recipient-related flows

**Що є зараз:**
- у Documenso вже є власний signing subsystem
- він орієнтований на їхню поточну модель PDF signing
- у `packages/signing/transports/` видно transport-патерн (`local`, `google-cloud`)

**Що це означає для VilnoEDO:**
це дуже важлива точка входу.

Є 2 технічні варіанти:

#### Варіант 1 — adapter transport усередині `packages/signing`
Додати новий transport на кшталт:
- `vilnocheck`

який буде не підписувати сам усередині Documenso, а звертатись до:
- `VilnoCheck-SignService`

**Плюси:**
- мінімальніший розріз
- використання вже існуючої transport-моделі

**Мінуси:**
- ризик натягнути українську логіку на неукраїнську domain model
- може виявитися затісно, якщо потрібні signing sessions, token flows, cloud challenges, підтвердження і сертифікатні метадані

#### Варіант 2 — зовнішній signing orchestration layer
VilnoEDO зберігає свій document workflow, а вся логіка підпису йде через окремий signing session flow до `VilnoCheck-SignService`.

**Плюси:**
- чистіше архітектурно
- sign-service лишається окремим bounded context
- простіше розвивати КЕП / УЕП / токени / SmartID

**Мінуси:**
- потрібно більше інтеграційної роботи на старті

**Рекомендація:**
для VilnoEDO краще орієнтуватися на варіант 2, але почати з аудиту, чи можна тимчасово використати варіант 1 як POC-шов.

---

### D. Модель документів і сценаріїв — medium/high risk
**Де дивитися:**
- document/envelope routers
- таблиці документів
- recipient flows
- шаблони і поле підпису

**Що потрібно для українського напряму:**
- адаптація термінології
- можлива поява типів документів або preset-сценаріїв
- окреме відображення типу підпису, підписанта, КНЕДП, сертифіката, часу та статусу перевірки

**Висновок:**
на старті не чіпати модель надто глибоко, поки не буде спроєктовано інтеграційний контракт із sign-service.

---

### E. Auth / team / permissions — medium priority
**Де дивитися:**
- `packages/auth`
- team/org settings routes
- member tables and dialogs

**Чому це важливо:**
для українського ЕДО продукту часто важливі:
- власник компанії
- менеджер/оператор
- юрист/бухгалтер
- ролі погодження / підписання

Але це краще вводити пізніше, після першого робочого signing flow.

## 3. Безпечна послідовність робіт

### Етап 1 — Identity layer
1. Брендинг VilnoEDO в UI
2. Прибирання upstream marketing trails
3. Українська локаль як first-class напрям

### Етап 2 — Signing integration design
4. Описати API-контракт з `VilnoCheck-SignService`
5. Визначити, чи перший POC буде через transport adapter або external orchestration
6. Обрати 1 реальний сценарій підпису для першої інтеграції

### Етап 3 — First Ukrainian signing flow
7. Зібрати end-to-end flow документа
8. Запустити підпис через `VilnoCheck-SignService`
9. Повернути результат назад у VilnoEDO
10. Зберегти статус, метадані і артефакт підпису

### Етап 4 — Product adaptation
11. Українська термінологія документів
12. Сценарії для актів/договорів/рахунків
13. Ролі команди та бізнес-процеси

## 4. Найкраща точка входу прямо зараз

### Практична рекомендація
Не починати з глибокої криптографічної переробки.

Почати з трьох паралельних, але контрольованих напрямів:

#### 1. Брендинг
Швидко переводить форк у власний продукт.

#### 2. Українська локалізація
Дає відчутний продуктовый результат майже без ламання ядра.

#### 3. Signing contract draft
Дає архітектурну основу, щоб не робити хаотичні зміни в `packages/signing`.

## 5. Висновок

VilnoEDO вже має хорошу основу у вигляді Documenso monorepo, але реальна українська адаптація майже напевно буде різати такі зони:
- локалізація
- брендинг
- signing architecture
- document terminology
- role/permission model

Найнебезпечніша зона — це signing core.

Тому головне правило:
**не починати з лому всередині всього monorepo, поки не зафіксовано інтеграційний шов з VilnoCheck-SignService.**
