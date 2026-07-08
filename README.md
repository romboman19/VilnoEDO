# VilnoEDO (ВільноЕДО)

**VilnoEDO** - вільна українська self-hosted система електронного документообігу на базі Documenso. Мета проєкту - дати українським командам, ФОП, ТОВ, громадським організаціям і сервісному бізнесу відкриту альтернативу закритим SaaS ЕДО-рішенням із підтримкою українських сценаріїв підпису, КЕП/УЕП та контрольованого зберігання доказів підписання.

Проєкт розвивається як окремий український продукт, а не лише локалізація upstream Documenso.

## Навіщо

Більшість відкритих систем підпису документів орієнтовані на глобальний або західний ринок. Для України потрібен продукт, який з коробки враховує:

- українську мову і локальну термінологію документообігу;
- КЕП/УЕП, файлові ключі, токени та майбутні хмарні сценарії підпису;
- маршрути підписання для реального українського бізнесу;
- self-hosted розгортання без залежності від стороннього SaaS;
- прозоре зберігання підписів, validation reports і evidence packages;
- можливість аудиту та розвитку власної signing-інфраструктури.

## Поточний Стан

VilnoEDO вже має перший технічний шар для українського `UA_KEP` signing flow:

- додано signing method `UA_KEP` і українські method IDs: `file-key`, `iit-token`, `privatbank-smartid`, `diia-signature`;
- посилено PKI proxy: allow-list, DNS pinning, private/reserved IP deny-list, timeout, redirect deny і streaming hard cap;
- додано короткоживучі UA KEP sessions із browser-held token, nonce, TTL і atomic consume;
- complete flow перевіряє recipient/envelope binding, token/nonce, item completeness і duplicate signatures;
- detached CAdES artifacts зберігаються в БД як `UaKepSignatureArtifact`;
- створюються pending `UaKepValidationReport` і `UaKepTrustMaterialSnapshot`;
- створюється `UaKepEvidencePackage` із canonical JSON manifest і SHA-256 digest;
- доступний JSON export endpoint для evidence manifest;
- доступний ZIP export evidence package: original bytes, detached `.p7s`, validation reports, audit log, trust material і canonical manifest;
- document hashes рахуються від реальних байтів документа незалежно від типу сховища (bytes, base64, S3);
- structural validation у fail-closed режимі при complete: парсинг CMS SignedData, відповідність `messageDigest` хешу документа, чинність сертифіката на час підпису, звірка видавця з реєстром КНЕДП; невалідний підпис відхиляється до збереження;
- token-bound status endpoint і UI результату підписання: статус перевірки кожного підпису, дані підписувача, попередження валідації та завантаження evidence package (ZIP/manifest) прямо з recipient flow;
- зняті штучні paywall-обмеження default (free) плану для self-hosted: необмежені документи, команди й учасники, брендинг, embed signing і signing reminders працюють без license key; telemetry і PostHog вимкнені, доки не задані відповідні ключі;
- інтегровано VilnoCheck-SignService: якщо задано `NEXT_PRIVATE_SIGN_SERVICE_URL`, кожен підпис після структурної перевірки проходить повну криптографічну верифікацію (ДСТУ-4145, ланцюг довіри, trust material) через server-to-server `POST /api/verify`; невалідний або неверифікований підпис відхиляється (fail-closed), а validation report фіксує legal class (KEP/UEP_QC/AdES).

Повне технічне завдання і roadmap: [docs/ua-edo-technical-spec.md](docs/ua-edo-technical-spec.md).

## Архітектурна Ідея

VilnoEDO розділяє основний документообіг і криптографічно чутливу signing-частину.

### VilnoEDO App

Відповідає за:

- документи, шаблони і вкладення;
- маршрути підписання;
- ролі отримувачів;
- кабінет користувача;
- статуси і audit trail;
- API для підписання, artifacts, validation reports і evidence packages.

### VilnoCheck-SignService

Запланований окремий signing service для українських методів підпису. Він має відповідати за:

- роботу з КЕП/УЕП;
- файлові ключі, токени і хмарні підписи;
- сертифікати і trust material;
- криптографічну валідацію;
- повернення результатів підпису в VilnoEDO.

Такий поділ дозволяє окремо розвивати юридично і криптографічно чутливу частину, не змішуючи її з основним продуктом документообігу.

## UA KEP Flow

Поточний MVP flow:

1. Отримувач відкриває документ для підпису.
2. VilnoEDO створює `UaKepSession` через `/api/ua-kep/prepare`.
3. Browser-side signing code підписує підготовлені document hashes.
4. `/api/ua-kep/complete` перевіряє session token, callback nonce, recipient binding і список signed items.
5. Система зберігає detached CAdES artifacts.
6. Система створює pending validation reports і trust material snapshot.
7. Система створює evidence package з canonical manifest і digest.
8. Документ завершується через стандартний Documenso completion flow.

## Evidence Package

Evidence package - це стабільний доказовий індекс для однієї завершеної UA KEP signing session.

У v1 він містить:

- session metadata;
- envelope і recipient binding;
- список signed envelope items;
- document hashes;
- detached CAdES signature hashes;
- signer info;
- pending validation reports;
- trust material snapshot;
- SHA-256 digest canonical JSON manifest.

JSON manifest і повний ZIP-архів можна отримати через token-bound endpoints:

```text
GET /api/ua-kep/evidence/:evidencePackageId/manifest.json?recipientId=...&recipientToken=...&envelopeId=...
GET /api/ua-kep/evidence/:evidencePackageId/archive.zip?recipientId=...&recipientToken=...&envelopeId=...
```

Обидва endpoints повертають `404`, якщо `recipientId`, `recipientToken`, `envelopeId` і `evidencePackageId` не належать одному підписанню.

Структура ZIP-архіву:

```text
ua-kep-evidence-<id>.zip
├── original/                       # точні байти документів, покриті підписом
├── signatures/cades-detached/      # detached CAdES підписи (.p7s)
├── validation/report.json          # структуровані validation reports
├── audit/audit-log.json            # журнал подій envelope
├── trust/trust-material.json       # trust material snapshot
├── package-info.json               # метадані пакета і опис структури
└── manifest.json                   # canonical manifest (SHA-256 = packageSha256)
```

## Локальне Розгортання

Поки що проєкт використовує базовий dev flow Documenso.

### Вимоги

- Node.js 22+
- npm 11+
- PostgreSQL
- Docker / Docker Compose

### Швидкий старт

```bash
git clone https://github.com/romboman19/VilnoEDO.git
cd VilnoEDO
cp .env.example .env
npm install
npm run dx
npm run dev
```

Після запуску:

- застосунок: `http://localhost:3000`
- локальна пошта для dev: `http://localhost:9000`

## Найближчий Roadmap

- end-to-end тестування зв'язки VilnoEDO ↔ VilnoCheck-SignService з реальними ключами КНЕДП;
- подальший cleanup upstream billing/Stripe коду і branding;
- подальша українська локалізація і адаптація бізнес-сценаріїв.

## Важливе Зауваження

VilnoEDO не є юридичним висновком і не гарантує відповідність конкретному production-сценарію без окремої юридичної та криптографічної перевірки. Перед бойовим використанням потрібна перевірка відповідності Закону України "Про електронні документи та електронний документообіг", Закону України "Про електронну ідентифікацію та електронні довірчі послуги", правилам КНЕДП, профілям КЕП/УЕП, CAdES/PAdES/XAdES та вимогам архівного зберігання.

## Походження та Ліцензія

VilnoEDO стартував як fork [Documenso](https://github.com/documenso/documenso). Ми зберігаємо сильні сторони базового ядра документообігу, але розвиваємо окремий український продукт із власною логікою, термінологією, signing flow і evidence pipeline.

- Проєкт Documenso та його команда **не пов'язані** з VilnoEDO, не розробляють і не підтримують його. Питання, баги та звернення щодо VilnoEDO — тільки в цей репозиторій.
- Код поширюється під ліцензією [AGPL-3.0](LICENSE), успадкованою від upstream; усі подальші зміни VilnoEDO також ліцензуються під AGPL-3.0.
- Назва і бренд Documenso належать Documenso, Inc. і використовуються тут лише для зазначення походження коду.
