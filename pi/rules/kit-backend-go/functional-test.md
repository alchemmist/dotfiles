---
paths:
  - "backend/apps/*/test/functional/**/*.go"
---

# Functional tests conventions

Правила написания функциональных тестов. Применимо к `backend/apps/core/test/functional/`, `backend/apps/adminka/test/functional/` и аналогам в других apps. Живые примеры — соседние `*_test.go` в той же директории.

## Структура файла

- `package functional`.
- Imports: stdlib → внешние модули → `a.yandex-team.ru/...` (см. `go-style.md`).
- Одна тестовая сущность на файл — `<feature>_test.go`. Если фича большая (например, `businessapi_*`), разбивай по сценариям.

## Suite

- Тип: `type Xxx<App>Suite struct { <App>WithPGSuite }` — embed базового suite своего app:
  - core → `CoreWithPGSuite` (см. `backend/apps/core/test/functional/core_with_pg_suite_test.go`)
  - adminka → `AdminkaWithPGSuite` и т.п.
- Entry-point: `func TestXxxSuite(t *testing.T) { suite.Run(t, &XxxSuite{...}) }`. Имя функции совпадает с типом suite (важно для `-run`).
- При инициализации передавай флаги базового suite в литерале (`adminRequest: true`, `orderAuthV2Enabled: true` и т.п.), а не через сеттеры в `SetupSuite`.
- Test-методы: `func (s *XxxSuite) TestXxx_<scenario>()`. По одному сценарию на метод — суммируй ассерты, не плоди мелкие.
- Для изоляции состояния между sub-тестами: `func (s *XxxSuite) SetupSubTest() { s.<App>WithPGSuite.SetupTest() }`.

## HTTP-вызовы

- Используй методы базового suite: `s.Post(path, body)`, `s.Get(path)`, `s.Patch(path, body)`, `s.Delete(path, body)`. Они возвращают `[]byte` (тело ответа).
- Для проверки HTTP-кода: `s.GetMatchHttpStatus(path, http.StatusXxx)` и аналоги.
- Body генерируй через типы из `api/<spec>` (`businessapi.CreateXxxJSONRequestBody`) и `json.Marshal`. Не пиши JSON-строки руками.
- Распаковка ответа: `util.Unmarshal[T](s.T(), resp)` — generics-хелпер из `test/functional/util/`.

## Snapshot-сравнение (comparer)

Стандартный паттерн — приватный метод `s.comparer()`, возвращающий настроенный `*comparer.Comparer`:

```go
func (s *XxxSuite) comparer() *comparer.Comparer {
    return util.ComparerJSON().WithOptions(
        comparer.WithTestDirectoryFunc(comparer.AllButLastLevelDirectory),
        comparer.WithTestFilenameAncCountFunc(comparer.TestName),
        comparer.WithPrepareData(func(t *testing.T, from []byte) []byte {
            return util.JsonReplaceValuesByKeys(t, from, map[string]any{
                "id":         "{{UUID}}",
                "created_at": "{{TIMESTAMP}}",
            })
        }),
    ).Build(s.T())
}
```

- В тесте: `cmp.CompareString(resp)` — сверка с дампом в `gotest/canondata/`.
- Динамические значения (UUID, timestamps, токены) нормализуй через `JsonReplaceValuesByKeys` — иначе дампы будут флипать.
- Первый запуск с **`DUMP_FIXTURES=1`** перезаписывает дампы; обычный прогон сравнивает с ними.

## Helper-функции

Готовые сценарии (создание корзины, промокода, продукта) — в `test/functional/util/helper/`:
- `helper.CreateBusinessAPIPromocode(...)`, `helper.CreateProductList(...)`, `helper.CreateShoppingCart(...)` и т.п.
- Сначала ищи готовый helper, прежде чем писать свой. Новый helper добавляй сюда же при повторном использовании в 2+ местах.

## Моки внешних систем

**Все моки ручные** — `go generate` / `mockery` в проекте нет.

- Базовые моки app — `test/functional/base_suite/mock/` (подмена portов и клиентов внутри `*WithPGSuite`).
- Per-feature моки внешних систем — `test/functional/util/*_mock.go` (bitrix, wildberries, ozon, retailcrm, video platform, ya metric cabinet и т.п.) и `test/functional/mock/<system>/`.
- При добавлении мока новой системы: положи файл в `test/functional/util/<name>_mock.go`, экспортируй конструктор `New<Name>Mock(...)`, в suite сохраняй мок в поле + сеттер на базовом suite (по паттерну существующих).

## Fixture-flow

- `DUMP_FIXTURES=1` — режим дампа: новые snapshot-файлы пишутся в `gotest/canondata/<test_name>/`.
- Без env-переменной — режим сравнения: тест падает на расхождении.
- При изменении контракта endpoint'а: 1) меняешь spec → `make gen`, 2) запускаешь с `DUMP_FIXTURES=1`, 3) ревьюишь diff дампов, 4) коммитишь.

## Запуск

- Functional-тесты подымают БД (testcontainers) и Temporal — **всё разом не запускай**.
- Команда:
  ```bash
  CGO_ENABLED=0 go test -v -run TestXxxSuite ./backend/apps/<app>/test/functional
  ```
  `-run <SuiteName>` обязательно.
- С фикстурами:
  ```bash
  DUMP_FIXTURES=1 CGO_ENABLED=0 go test -v -run TestXxxSuite ./backend/apps/<app>/test/functional
  ```
- **`CGO_ENABLED=0`** обязательна для `go test`. Для `ya make` — **запрещена** (типовая ошибка, ломает unit/style-чеки).
- Линтеры для локальных изменений — отдельной командой: `make lint-changed` (без env).

## Прочее

- Не клади unit-тесты бизнес-логики сюда — для них используй `*_test.go` рядом с кодом в `domain/services/`, `infra/repositories/`. Сюда — только end-to-end сценарии через HTTP/gRPC.
- 5xx-баги: при фиксе из bug-triage flow (epic SS-12786) обязательно добавь functional-тест на воспроизведение, без него PR не принимается.
- Перед коммитом — `make prepare` (yo-fix + format), иначе `ya.make` рассыплется.

## Где искать примеры

```bash
ls -lt backend/apps/core/test/functional/      | head           # core
ls -lt backend/apps/adminka/test/functional/   | head           # adminka
ls backend/apps/core/test/functional/util/helper/               # готовые сценарии
ls backend/apps/core/test/functional/base_suite/mock/           # базовые моки
```
Возьми ближайший по тематике `*_test.go` как живой шаблон.
