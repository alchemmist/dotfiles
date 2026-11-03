---
paths:
    - "backend/apps/*/infra/repositories/**/*.go"
---

# Repository conventions

Правила написания реализаций репозиториев в `infra/repositories/` для Core, adminka и portal. Интерфейсы из
`domain/repositories/` следуют локальному
`AGENTS.md` соответствующего app. Живые примеры — соседние реализации того же app.

## Структура и конструктор

- Приватный тип: `{entity}Repo`. Публичный конструктор возвращает интерфейс из
  `domain/repositories/`; имя зависит от app:

  | App | Новый конструктор |
    |-----|-------------------|
  | Core | `New{Entity}Repository(...)` |
  | adminka | `New{Entity}Repo(...)` |
  | portal | `New{Entity}Repo(...)` |

  Если расширяешь существующий пакет с другим устоявшимся именованием, следуй соседнему коду и локальному `AGENTS.md`,
  не переименовывай API попутно.
- Поля: `pgxWrapper pgxwrapper.Wrapper`, `builder squirrel.StatementBuilderType` (с `squirrel.Dollar`),
  `tracer trace.Tracer` (из `otel.Tracer("{Entity}Repo")`).
- Проверка соответствия интерфейсу: `var _ domainrepos.{Entity} = (*{entity}Repo)(nil)`.

## Методы

- **Save (batch):** принимает slice, возвращает обновлённые entity (если меняются автоинкременты/generated) или только
  error. Первой строкой — `if len(entities) == 0 { return ...empty }`. Транзакция:
  `_, callbacks, err := r.pgxWrapper.Tx(ctx)`, потом `defer callbacks.Rollback(ctx)` (безопасно после `Commit`).
- **FindByRequest:** `baseQuery()` + `Where(buildCondition(req))` +
  `pgxutils.QuerySquirrelAndCollectRows(ctx, r.pgxWrapper, query, r.scan{Entity})` + `buildEntities(rows)`.
- **CountByRequest:** `builder.Select("COUNT(*)").From(...).Where(buildCondition(req))` +
  `pgxutils.QueryAndCollectOneValue[int](...)` — переиспользуй `buildCondition` для консистентности.
- **Delete:** если сущность поддерживает soft-delete и таблица содержит
  `deleted_at`, используй
  `Set("deleted_at", time.Now()).Where("deleted_at IS NULL")`. Выполняй через
  `pgxutils.ExecQueryWithAffected`; если число изменённых строк равно нулю, возвращай `entity.Err{Entity}NotFound`. Не
  делай предварительный `SELECT` для проверки. Для сущностей без soft-delete следуй их доменной семантике удаления.

## Вспомогательные методы

- **`baseQuery()`:** возвращает `squirrel.SelectBuilder` с фиксированным списком колонок + `FROM table_name t`. Порядок
  колонок должен совпадать со `scan{Entity}`.
- **`buildCondition(req)`:** возвращает `squirrel.And`. `ANY(?)` для фильтрации по массивам (вместо `squirrel.Eq` с
  кастами). Для таблиц с soft-delete по умолчанию добавляй `deleted_at IS NULL`, если в req не указано
  `IncludeDeleted=true`. Для текстового поиска: `squirrel.Like{"search_text": "%" + strings.ToLower(q) + "%"}`.
- **`scan{Entity}(row pgx.CollectableRow) (entityRow, error)`:** сканирует в приватный промежуточный тип `entityRow` (не
  в domain entity). Для одного простого поля используй `pgx.RowTo[T]` (работает для примитивов, type aliases вроде
  `type ID uuid.UUID`, и типов со `Scan(src any) error`).
- Если scanner только вызывает `row.Scan`, используй именованные возвращаемые значения и возвращай результат
  сканирования напрямую. Разворачивай тело функции только для дополнительной валидации, преобразования или осмысленного
  оборачивания ошибки.

```go
func(row pgx.CollectableRow) (target syncTarget, err error) {
    return target, row.Scan(
        &target.JobID,
        &target.StoreID,
    )
}
```

- **`buildEntities(rows []entityRow) ([]entity.Entity, error)`:** конвертирует через `yslices.MapE` в domain entities,
  вызывая `entity.New(...)`.

## Паттерны работы с БД

- **Upsert:**
  `Insert(...).Columns(...).Suffix("ON CONFLICT (id) DO UPDATE SET col = EXCLUDED.col RETURNING id, number")`. Перебирай
  entities через `query.Values(...)` в цикле.
- **RETURNING для автоинкрементов:** через `pgxutils.QueryOnMasterSquirrelAndCollectToMap` с `collectFunc` возвращающим
  `(id, number, error)`.
- **FK-связанные сущности:** при `Save` дочерней не проверяй существование parent — полагайся на FK constraint.
- **Many-to-many ReplaceAll:** один `Delete` по списку parent IDs, затем один `Insert` всех новых связей. Не делай по
  одному запросу на запись.

## pgxutils

Общие помощники находятся в `backend/apps/pkg/pgx/utils.go` и импортируются как:

```go
pgxutils "a.yandex-team.ru/yastore/backend/apps/pkg/pgx"
```

Перед реализацией любой операции с БД сначала проверь полный набор функций в этом файле. Считай, что подходящий помощник
уже существует. Не пиши вручную последовательность из `query.ToSql()`, `Conn().Query` / `QueryRow` / `Exec` и
`pgx.Collect*`, пока не убедишься, что `pgxutils` не покрывает операцию.

### Запросы, построенные через squirrel

| Задача                                                | Функция                                      |
|-------------------------------------------------------|----------------------------------------------|
| Выполнить `INSERT` / `UPDATE` / `DELETE`              | `ExecQuery`                                  |
| Выполнить изменение и получить `RowsAffected`         | `ExecQueryWithAffected`                      |
| Получить несколько строк                              | `QuerySquirrelAndCollectRows[T]`             |
| Получить несколько строк с master                     | `QueryOnMasterSquirrelAndCollectRows[T]`     |
| Получить одну строку                                  | `QuerySquirrelAndCollectOneRow[T]`           |
| Получить одну строку с master                         | `QueryOnMasterSquirrelAndCollectOneRow[T]`   |
| Получить одно scalar-значение (`COUNT`, `MAX` и т.п.) | `QueryAndCollectOneValue[T]`                 |
| Проверить существование строки                        | `QueryExists`                                |
| Собрать результат в `map[K]V`                         | `QuerySquirrelAndCollectToMap[K, V]`         |
| Собрать результат в `map[K][]V`                       | `QuerySquirrelAndCollectToMapOfSlices[K, V]` |
| Собрать результат с master в `map[K]V`                | `QueryOnMasterSquirrelAndCollectToMap[K, V]` |
| Выполнить несколько запросов batch-ом                 | `ExecSquirrelBatch`                          |

### Остальные помощники

- Для запроса, заданного SQL-строкой, используй `QueryAndCollectRows`, `QueryAndCollectOneRow`, `QueryOnAndCollectRows`
  или `QueryAndCollectToMap`.
- Если `pgx.Rows` получены способом, которого нет среди функций выполнения запросов, используй `CollectRows`,
  `CollectRowsToMap` или `CollectRowsToMapOfSlices`, а не ручной цикл по строкам.
- Для готового `pgx.Batch` используй `ExecBatch`.
- Ошибки PostgreSQL распознавай через `IsPgErrWithCode`, `IsPgForeignKeyViolation` и `IsPgUniqueViolation`, а не через
  собственный разбор `pgconn.PgError`.
- Не проверяй `RowsAffected` вручную, если операция покрывается `ExecQueryWithAffected`.

## Построение и форматирование запросов

- Запрос с постоянной структурой можно записать SQL-строкой. Это относится как к простым запросам, так и к сложным
  запросам, если набор `SELECT`-полей, `JOIN`, условий `WHERE` и остальных частей не меняется во время выполнения.
  Значения передавай через параметры.
- Если запрос возвращает обычный объект репозитория и в репозитории уже есть `baseQuery` или общий список колонок, строй
  запрос через squirrel и переиспользуй их. Это правило действует и для изменяющих запросов с `RETURNING`.
- Используй squirrel, когда запрос собирается динамически: в зависимости от входных данных добавляются поля, `JOIN`,
  условия `WHERE`, сортировка или другие части запроса.
- Не собирай SQL конкатенацией строк. Переиспользуемый список колонок объявляй как `[]string`, а не строковой
  константой.
- SQL-запрос длиннее одной строки выноси в именованную константу или переменную `query`. Начинай текст запроса с новой
  строки; располагай части запроса на отдельных строках, а длинные списки полей и присваиваний разбивай по строкам.

```go
const query = `
    UPDATE items
    SET
        state = $2,
        updated_at = now()
    WHERE id = $1
`
```

## Трейсинг и ошибки

- В начале каждого метода: `ctx, span := r.tracer.Start(ctx, "MethodName"); defer span.End()`.
- Все ошибки оборачиваются с контекстом действия (`"acquiring connection"`, `"save base"`, `"scan row"`, `"exec query"`
  и т.п.).

## Прочее

- **NULL значения:** в `entityRow` через pointer типы (`*time.Time`, `*string`); в domain entity — domain-специфичные
  представления.
- **Группировка крупных Save:** разбивай на приватные `saveBase`, `saveRelations` и т.п.; вызывай из публичного `Save`
  внутри одной транзакции.
- **Сортировка:** через `SortFieldMapping` (map[domain field]db column).
- **Пагинация:** `query.Limit(req.Pagination.Limit()).Offset(req.Pagination.Offset())`.
- **Имена:** `Find*` в репозитории, `Get*` в сервисе.
- Новый handwritten `.go`-файл добавляй в `SRCS(...)` соответствующего `ya.make`.

## Где искать примеры

```bash
ls -lt backend/apps/core/infra/repositories/ | head      # core
ls -lt backend/apps/adminka/infra/repositories/ | head   # adminka
ls -lt backend/apps/portal/infra/repositories/ | head    # portal
```

Возьми любой полностью оформленный репозиторий из нужного app и используй как живой шаблон.
