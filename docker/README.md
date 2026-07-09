# Docker для VilnoEDO

## Продакшн

Єдина продакшн-конфігурація живе у [`deploy/compose.yml`](../deploy/compose.yml)
(секрети — у `deploy/.env`, який не комітиться).

Збірка образу та розгортання на сервері:

```bash
docker build -f docker/Dockerfile -t vilnoedo:latest .
docker compose -f deploy/compose.yml --env-file deploy/.env up -d
```

VilnoEDO працює в UA-only режимі: підпис — український КЕП/УЕП/електронна печатка
на стороні клієнта через IIT. Documenso `.p12` server seal не використовується,
жоден signing-сертифікат монтувати не потрібно.

## Розробка

`docker/development/compose.yml` — локальні сервіси для розробки
(Postgres, Inbucket, MinIO, Redis, Gotenberg). Піднімається через `npm run dx:up`
з кореня репозиторію; використовується також e2e-тестами в CI.

## Файли

- `Dockerfile` — багатостадійна збірка продакшн-образу застосунку
- `start.sh` — entrypoint контейнера (міграції + запуск сервера)
