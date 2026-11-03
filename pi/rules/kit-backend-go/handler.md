---
paths:
  - "backend/apps/core/internal/http/**/*.go"
---

# HTTP handlers conventions

Правила написания HTTP-обработчиков Core в
`backend/apps/core/internal/http/`. У adminka, portal и других приложений свои
архитектура и локальные `AGENTS.md`; не переноси в них Core wrappers и `core.Core`.
Стандарты Go — см. `go-style.md`.

## Двухслойная архитектура

1. **Top-level** (`internal/http/api_<api>_handlers.go`): реализация автогенерируемого интерфейса `<api>.ServerInterface` (один файл на каждую sub-API: business / customer / checkout / public / external / mystore / landing / scrapper / services / 1c). Только wiring: обёртки + делегирование.
2. **Sub-handler** (`internal/http/{business,customer,checkout,external,...}handlers/<entity>.go`): бизнес-вызов и маппинг DTO ↔ domain.

Не смешивай слои. Логика — в sub-handler. Авторизация и unwrap — на top-level.

## Top-level handler

```go
var _ <api>.ServerInterface = (*<api>Handlers)(nil)

type <api>Handlers struct {
    coreBuilder      core.Builder
    businessHandlers *businesshandlers.Handlers // или соответствующая группа
}

func (h *<api>Handlers) <OperationID>(
    w http.ResponseWriter,
    r *http.Request,
    params <api>.<OperationID>Params, // если есть path/query params
) {
    wrappers.WrapBusinessAPIHandler(
        w, r, h.coreBuilder,
        manager.<Role>Name,
        func(w http.ResponseWriter, r *http.Request, c core.Core) {
            wrappers.WrapResponse(w, r, c, func(c core.Core) (any, error) {
                return h.businessHandlers.<Group>.<OperationID>(w, r, c, params)
            })
        },
    )
}
```

- Имя метода и сигнатура должны совпадать с `<api>.ServerInterface` — иначе compile error от check на 1-й строке.
- Не пиши бизнес-логику здесь, только обёртки.
- Все top-level методы — Wrap-обёртку выбирай под тип API:

| Wrapper | Когда |
|---------|-------|
| `wrappers.WrapBusinessAPIHandler` | B2B endpoints с проверкой роли (`manager.RoleName`) |
| `wrappers.WrapBusinessAPIHandlerWithPermissions` | B2B с гранулярными permissions |
| `wrappers.WrapCustomerAPIHandler` / `WrapCustomerAPISimpleHandler` | B2C, с проверкой региона |
| `wrappers.WrapCheckoutAPIHandler` | Checkout flow (нужен `storeSlug`) |
| `wrappers.WrapPublicAPIHandler` | Публичные/1C endpoints |
| `wrappers.WrapExpressCheckoutAPIHandler` | Express-checkout (по хосту) |
| `wrappers.WrapHandler` | Прочее, без auth (редко) |

- Тело — обычно `WrapResponse` для JSON. Альтернативы: `WrapBinaryResponse` (файлы), `WrapResponseWithProblem` (RFC 7807), `WrapMystoreResponse` (custom status code).

## Sub-handler

```go
func (h *addonHandler) Get(
    _ http.ResponseWriter,
    r *http.Request,
    core core.Core,
    id string,
) (businessapi.AddonDetails, error) {
    parsedID, err := uuid.Parse(id)
    if err != nil {
        return businessapi.AddonDetails{}, fmt.Errorf("parse UUID: %w", err)
    }

    entityVal, err := core.Services().Addon().GetDetailsByID(r.Context(), serviceentity.ID(parsedID))
    if err != nil {
        return businessapi.AddonDetails{}, fmt.Errorf("get addon by id: %w", err)
    }

    return h.apiMapper.AddonDetailsToAPI(entityVal), nil
}
```

- Возвращает `(<api>.<DTO>, error)`. Wrap-обёртка делает encode + status code.
- Берёт зависимости только из `core core.Core` (через `core.Services().<Name>()`). Никаких глобальных синглтонов.
- Парсинг тела: `json.NewDecoder(r.Body).Decode(&apiRequest)`. На ошибке оборачивай через `domainerrors.ErrBadRequest`:
  ```go
  fmt.Errorf("%w: invalid JSON: %w", domainerrors.ErrBadRequest, err)
  ```
- Не вызывай репозитории напрямую — только через сервис из `domain/services/`.

## Mapping DTO ↔ domain

- Mappers — в `internal/http/mappers/<file>.go`. Тип `<API>Mapper` с методами `EntityToAPI(...)`, `APIToCommand(...)`.
- Для чистого преобразования массивов используй `yslices.Map`, а не ручной
  `for + append`. Если преобразование может завершиться ошибкой, используй
  подходящий error-aware helper по соседним mapper-ам.
- Из API → domain команда возвращай `(command, error)` — DTO может содержать невалидные данные.
- Из domain → API возвращай только значение (entity уже валиден).

## Обработка ошибок

- В sub-handler — оборачивай через `fmt.Errorf("<action>: %w", err)`. См. `go-style.md` про conventions.
- Для bad-request — оборачивай `domainerrors.ErrBadRequest`. Для not found — возвращай `entity.Err<X>NotFound` (или специфичные ошибки из `domain/errors/`).
- Wrap-обёртка (`responseWithError` в `wrappers/response_error.go`) маппит:
  - `domainerrors.ErrBadRequest` / ошибки валидации → 400
  - `*apierrors.Error` → кастомный HTTP code из самого error
  - `entity.Err<X>NotFound` → 404
  - PostgreSQL errors → 500 + метрики
  - Прочее → 500
- Не пиши `w.WriteHeader(...)` или `http.Error(...)` в sub-handler — это работа обёртки.

## OpenAPI флоу

- Spec конкретной sub-API лежит в
  `backend/apps/core/api/<api>/openapi.yaml`; общий spec Core — в
  `backend/apps/core/api/openapi.yaml`.
- После правки spec: **`make gen`** — перегенерирует `api/<api>/*.gen.go` (`ServerInterface`, типы запросов/ответов).
- НЕ правь `*.gen.go` руками — затрутся при следующей генерации.
- При добавлении handwritten `.go`-файла добавь его в `SRCS(...)` соответствующего
  `ya.make`. Сгенерированные `*.gen.go` вручную не добавляй и не редактируй.
- Добавляешь endpoint → сначала меняешь spec → `make gen` → реализуешь метод на top-level (с обёрткой) + sub-handler.

## Прочее

- HTTP-метрики и ошибочные метрики поднимает `WrapResponseWithMetrics` /
  `responseWithError`. Для дополнительной бизнес-метрики используй существующие
  интерфейсы из `backend/apps/pkg/metrics`, не подключай Solomon registry напрямую.
- 5xx-баги (epic SS-12786) обязательно покрывай functional-тестом по правилам
  [functional-test.md](functional-test.md).
- Не пиши «своих» wrappers — расширяй `internal/http/wrappers/`, если действительно нужен новый паттерн.

## Где искать примеры

```bash
ls backend/apps/core/internal/http/                              # top-level handlers
ls backend/apps/core/internal/http/businesshandlers/  | head     # sub-handlers B2B
ls backend/apps/core/internal/http/wrappers/                     # все обёртки
ls backend/apps/core/internal/http/mappers/           | head     # mapping DTO ↔ domain
```
Возьми ближайший по тематике файл — `addon.go` или `bundle.go` обычно полностью оформлены.
