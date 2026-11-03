---
paths:
  - "backend/migrations/*/pg_main/*.go"
  - "backend/migrations/clickhouse/ch_main/*.go"
---

# Migrations conventions

Правила написания миграций БД. PostgreSQL-миграции — Go-файлы поверх k50 migrator
(`a.yandex-team.ru/k50/tools/migrator/pkg/migrator/postgres`) в
`backend/migrations/<service>/pg_main/`. Регистрация PostgreSQL-миграций генерируется;
ClickHouse остаётся отдельным исключением с ручной регистрацией.

## Когда нужна миграция

Миграция обязательна для любых изменений схемы: таблиц, колонок, индексов,
constraints, views, функций и триггеров. Для чистой бизнес-логики, API без изменения
схемы и конфигурации миграция не нужна.

Выбирай каталог БД, которой принадлежит изменяемая таблица. Например:

- `backend/apps/portal/` (core DB) → `backend/migrations/core/`;
- `backend/apps/adminka/` → `backend/migrations/adminka/`;
- `backend/apps/alty/` → `backend/migrations/alty/`;
- `backend/apps/checkout/` → `backend/migrations/checkout/`;
- `backend/apps/order/` → `backend/migrations/order/`.

## Генерация PostgreSQL-миграции

Из корня `yastore` используй подходящий Make target, не создавай шаблон вручную:

```bash
make migrate-gen MIGRATION_NAME=<descriptive_snake_case>       # core
make migrate-gen-<service> MIGRATION_NAME=<descriptive_snake_case>
```

Доступные service-targets: `adminka`, `alty`, `checkout`, `order`, `ycp-mock`,
`tickender`, `grot`, `exporter`, `loyalty`, `store-migration`. Для core также есть
алиас `migrate-gen-core`.

Генератор:

1. нормализует имя в snake_case;
2. создаёт `backend/migrations/<service>/pg_main/<UTC timestamp>_<name>.go`;
3. запускает `ya make` для сервиса и обновляет сгенерированную регистрацию.

Формат timestamp — `YYYYMMDDHHMMSS`. Файл не переименовывай: его полное имя без
`.go` является version миграции и определяет порядок регистрации.

После `migrate-gen*` не нужен отдельный `make yo-fix` для подключения файла:
`ALL_GO_SRCS()` подхватывает его автоматически. Ручное создание — только запасной
вариант, когда подходящий target нельзя использовать: копируй актуальный шаблон и
последовательность действий из `scripts/generate_postgres_migration.sh`, а затем
выполни `make gen-migrations`.

## Структура PostgreSQL-миграции

Генератор создаёт каркас сам. Редактируй только тела `Up` и `Down`:

```go
package pgmain

import (
    "database/sql"

    "a.yandex-team.ru/k50/tools/migrator/pkg/migrator/postgres"
)

var _migration<identifier> = &migration<identifier>{
    version: "<timestamp>_<descriptive_name>",
}

var _ postgres.Migration = (*migration<identifier>)(nil)

type migration<identifier> struct {
    version string
}

func (m *migration<identifier>) Up(db *sql.Tx) error {
    query := `...`

    _, err := db.Exec(query)

    return err
}

func (m *migration<identifier>) Down(db *sql.Tx) error {
    query := `...`

    _, err := db.Exec(query)

    return err
}

func (m *migration<identifier>) GetVersion() string {
    return m.version
}
```

`<identifier>` строится из полного нормализованного имени файла и обрезается до
46 символов, чтобы объявления укладывались в ограничение длины строки. Version
остаётся полным и должна совпадать с именем файла без `.go`.

Миграция уже выполняется внутри переданного `*sql.Tx`: не открывай дополнительную
транзакцию и выполняй запросы через `db`. Для нескольких независимых SQL-операций
используй отдельные `db.Exec`, чтобы корректно обработать ошибку каждой операции.

## Регистрация

Для PostgreSQL-сервисов `adminka`, `alty`, `checkout`, `core`, `exporter`, `grot`,
`loyalty`, `order`, `store_migration`, `tickender` и `ycp-mock` регистрация полностью
генерируется через `backend/migrations/cmd/codegen`.

- Не редактируй и не коммить `setup.gen.go` и `datasources.gen.go`: это build-cache
  symlinks.
- Не добавляй миграцию вручную в `Migrations`.
- Не редактируй `ya.make`: файлы подключаются через `ALL_GO_SRCS()`.
- Для явной регенерации всех регистраций используй `make gen-migrations`.

Миграции сортируются лексикографически по полному имени файла.

## Idempotency и безопасность

- **Атомарность и исключительность миграций** Схема данных меняется в рамках атомарных
  транзакционных миграций, и только ими. Конструкции `IF NOT EXISTS` нежелательны,
  так как потенциально маскируют schema drift. Не используй их в DDL без явной на то причины
- Для обычных seed-данных и backfill используй `INSERT ... ON CONFLICT DO NOTHING`
  или `DO UPDATE`, чтобы повторный запуск сходился в то же состояние. Миграции
  `settings` и feature flags — исключение, описанное ниже.
- Каждый `Up` должен иметь симметричный `Down`, полностью отменяющий изменение.
- Разделяй изменение схемы и большой data-backfill на разные миграции: сначала
  schema, затем data.
- Сохраняй обратную совместимость с уже развёрнутым приложением. Удаляй старые
  таблицы и колонки отдельной миграцией только после выкладки кода, который их
  больше не читает.
- Новые обязательные колонки задавай как `NOT NULL` с осмысленным `DEFAULT`, если
  nullable-семантика не нужна.
- Для foreign key явно выбирай подходящие домену `ON DELETE` и `ON UPDATE`.
- Новым таблицам обычно нужны `created_at` и `updated_at` типа `timestamptz` с
  `DEFAULT now()`. `deleted_at timestamptz` добавляй только для сущностей с
  soft-delete семантикой.
- Идентификаторы генерируй через UUIDv7 или другой time-ordered генератор. Для
  `settings` и feature flags используй стабильный UUIDv7-литерал по правилам ниже.
- `CREATE INDEX CONCURRENTLY` нельзя выполнять внутри `*sql.Tx`. Если такой индекс
  необходим, согласуй отдельную операцию вне стандартной миграции.

SQL держи в backtick-строках и форматируй по соседним свежим миграциям. Не используй
`fmt.Print*` или `log.*` внутри `Up`/`Down`.

## Settings и feature flags в Core

Для миграций `settings` и feature flags обязательно используй skill
[`yastore-setting-migration`](../../../skills/teams/kit/backend-go/yastore-setting-migration/SKILL.md).

Это исключение из общих правил выше: новая настройка использует заранее
сгенерированный стабильный UUIDv7-литерал и обычный `INSERT` без `WHERE NOT EXISTS`
и `ON CONFLICT`; тот же UUID используется для удаления записи в `Down`.

## ClickHouse — исключение

Shared PostgreSQL codegen не обслуживает `backend/migrations/clickhouse/`. Для
ClickHouse используй локальный legacy-flow: собери migrator, запусти его команду
`generate`, затем проверь ручную регистрацию в `ch_main/setup.go` и
`datasources.go`. После этого запусти `ya tool yo fix backend/migrations/clickhouse`
и собери migrator.

Не переноси ручной ClickHouse-паттерн в PostgreSQL-сервисы.

## Проверка

Команды сборки, локальный накат/откат и проверки на тестовых данных из этого
раздела запускай **только если пользователь явно попросил проверить миграцию
локально**. Без такого запроса не запускай их; в финальном ответе кратко укажи,
что локальная проверка не выполнялась.

- Собери и протестируй миграционный сервис:
  `ya make -t backend/migrations/<service>`.
- Примени миграцию через соответствующий `make migrate-up[-<service>]`, если такой
  target определён в `Makefile`, и проверь получившуюся схему/данные в PostgreSQL.
- Проверь `Down` через `make migrate-down[-<service>]`, если target доступен, затем
  снова накати `Up`.
- Тестируй на пустой БД, на актуальной fixture и на данных из предыдущей схемы.
- При изменении схемы обнови зависимые fixtures, schema snapshots, модели и другие
  сгенерированные артефакты в том же изменении.

`CGO_ENABLED=0` с `ya make` не используй.

## Где искать примеры

```bash
ls -lt backend/migrations/core/pg_main/    | head
ls -lt backend/migrations/adminka/pg_main/ | head
```

Возьми свежую миграцию нужного сервиса как пример SQL, но каркас всегда создавай
через соответствующий `make migrate-gen*`.
