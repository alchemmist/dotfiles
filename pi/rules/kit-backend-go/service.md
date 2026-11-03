---
paths:
  - "backend/apps/core/domain/services/**/*.go"
---

# Domain services conventions

Правила написания domain-сервисов Core в
`backend/apps/core/domain/services/`. Сервис — центр бизнес-логики и слой,
оркестрирующий репозитории и ports. У adminka, portal, checkout и order свои
структура и локальные `AGENTS.md`; не переноси туда Core service-provider.
Стандарты Go — см. `go-style.md`.

## Структура файла

- `package services` (или вложенный — `package checkout`, `package searchofferdelivery` для крупных сервисов с несколькими файлами).
- Один файл `<entity>.go` на сервис. Файл начинается с **публичного интерфейса**, далее приватная реализация и конструктор:

```go
type Addon interface {
    GetDetailsByID(ctx context.Context, id addon.ID) (addon.Details, error)
    GetList(ctx context.Context, req dto.GetRequest) ([]dto.ListItem, error)
    Create(ctx context.Context, cmd dto.CreateCommand) (addon.Details, error)
    Update(ctx context.Context, cmd dto.UpdateCommand) (addon.Details, error)
    Delete(ctx context.Context, id addon.ID) error
}

type addonSvc struct {
    repo                repositories.Addon
    addonAttachmentRepo repositories.AddonAttachment
    limitSvc            Limit
    fileSvc             File
    regionsStorage      ports.RegionsStorage
    tracer              trace.Tracer
}

func NewAddon(
    repo repositories.Addon,
    addonAttachmentRepo repositories.AddonAttachment,
    limitSvc Limit,
    fileSvc File,
    regionsStorage ports.RegionsStorage,
) Addon {
    return &addonSvc{
        repo:                repo,
        addonAttachmentRepo: addonAttachmentRepo,
        limitSvc:            limitSvc,
        fileSvc:             fileSvc,
        regionsStorage:      regionsStorage,
        tracer:              otel.Tracer("AddonService"),
    }
}
```

- Имя приватного типа — `<entity>Svc` (нижний регистр). Конструктор — `New<Entity>` (без `Service` в имени, оно уже в типе).
- Конструктор возвращает **интерфейс**, не структуру (`Addon`, не `*addonSvc`).
- `tracer` инициализируй именем сервиса в PascalCase + `Service`: `otel.Tracer("AddonService")`.

## Регистрация в Services-provider

- В Core есть service-provider `backend/apps/core/domain/services.go`, тип
  `domain.Services`. Новый сервис добавляй туда строкой `Addon() services.Addon`.
- Wiring выполняется в Core builder. Сам сервис о wiring ничего не знает.
- В handlers и других сервисах бери зависимость через `core.Services().<Name>()`.

## Зависимости (что можно брать в конструктор)

| Тип | Где определены | Назначение |
|-----|----------------|-----------|
| `repositories.<X>` | `domain/repositories/` (интерфейс), `infra/repositories/` (реализация) | БД-доступ |
| `ports.<X>` | `domain/ports/` (интерфейс), `infra/adapters/` (реализация) | Внешние системы (HTTP-клиенты, файлы, очереди) |
| Другой сервис: `Limit`, `File`, ... | Тот же пакет `services` | Композиция бизнес-логики |
| `pgxwrapper.Wrapper` | `pkg/pgx` | Транзакции (если сервис оркеструет многоэтапную запись) |

- Нельзя инжектить `*sql.DB`, `*http.Client`, конфиги напрямую — они оборачиваются в порты/wrapper'ы.
- Нельзя брать в зависимости top-level apps (`core`, `domain`) — это ломает направление зависимостей.

## Методы

- **Naming**: `Get*` в сервисе ↔ `Find*` в репозитории (см.
  [repository.md](repository.md)). `Get` возвращает доменно-смысловые ошибки
  (`Err<X>NotFound`).
- Сигнатура: первым аргументом всегда `ctx context.Context`. DTO команды берут из `domain/dto/<entity>/` (не плоские struct'ы в args).
- Возвращай domain entity (`addon.Details`, `addon.Base`), не DTO API. Маппинг в API — задача handler/mapper.
- Empty-input короткое замыкание: при `len(req) == 0` возвращай `make(map[...], 0)` или `nil` без обращения к БД.
- Ошибки: оборачивай через `fmt.Errorf("<action>: %w", err)` (см. `go-style.md`). Sentinel — `addon.ErrAddonNotFound` и аналоги из `domain/entities/<X>/errors.go`.

## Трейсинг

- Открывай span на входе **в нетривиальный публичный метод** (с подзапросами / mapping / транзакциями):
  ```go
  ctx, span := s.tracer.Start(ctx, "GetWithAttachmentsByVariantID")
  defer span.End()
  ```
- При ошибке: `span.RecordError(err)` перед `return`.
- Для тонких pass-through методов (`s.repo.FindListItemsByRequest(...)`) span можно опустить — он уже создаётся в репозитории.

## Транзакции

- Если меняешь несколько таблиц/сущностей атомарно — открывай транзакцию в сервисе через `pgxWrapper.Tx(ctx)`:
  ```go
  ctx, callbacks, err := s.pgxWrapper.Tx(ctx)
  if err != nil {
      return fmt.Errorf("start transaction: %w", err)
  }

  defer callbacks.Rollback(ctx)

  // ...

  err = callbacks.Commit(ctx)
  if err != nil {
      return fmt.Errorf("commit transaction: %w", err)
  }
  ```
- В репозиторий передавай уже обогащённый `ctx` — он подцепит транзакцию автоматически.

## Метрики

- Если сервис — точка для health/business-метрик
  (started/finished/active/duration), используй существующие интерфейсы из
  `backend/apps/pkg/metrics`. Не тяни Solomon registry в сервис напрямую.

## Тестирование

- Unit-тесты — рядом с кодом: `addon_test.go` в том же пакете.
- Зависимости (repos, ports, другие сервисы) мокаются через `GO_MOCKGEN` и
  генерируются через `make gen`.
- Для end-to-end через HTTP — functional-тест в `test/functional/` по правилам
  [functional-test.md](functional-test.md).
- Новый handwritten `.go`-файл добавляй в `SRCS(...)` соответствующего `ya.make`.

## Не делать

- Не вызывай SQL/queries напрямую — это работа репозитория.
- Не пиши маппинг в API DTO — это работа handler/mapper (`internal/http/mappers/`).

## Где искать примеры

```bash
ls -lt backend/apps/core/domain/services/    | head     # core (40+ файлов)
cat    backend/apps/core/domain/services.go             # mega-interface, регистрация сервисов
```
Возьми ближайший по тематике файл (`addon.go`, `product.go`, `oauth.go`) как живой шаблон.
