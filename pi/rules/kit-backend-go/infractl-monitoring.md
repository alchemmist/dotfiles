---
paths:
  - "infractl/monitoring/**/*.yaml"
  - "infractl/monitoring/a.yaml"
---

# Алерты и дашборды через infractl

Конвенции KIT для спек Мониторинга в `yastore/infractl/monitoring/`. Общая механика infractl — в скилле `infra/infractl` (`ai/artifacts/skills/infra/infractl`); здесь только то, что специфично для нас.

Terraform алертами и дашбордами больше не управляет: в `yastore/monitoring/` остались только дашборды `mdb_clusters` и `yt_stores_export`. Заводить новый алерт через Terraform нельзя — infractl и Terraform не знают друг о друге и будут перетирать один и тот же объект по кругу.

## Раскладка

```
yastore/infractl/monitoring/
├── a.yaml                            # чек на PR и релиз, оба по списку manifests
├── i.yaml                            # namespace: yastore, metrics.project_id: shopify
├── i.alert.<family>-base.yaml        # базовые слои семейств
├── alerts/
│   ├── i.yaml                        # make.mode: enabled
│   ├── i.alert.<name>.yaml           # одиночные алерты
│   └── i.alertgroup.<name>.yaml      # семейства однотипных
└── dashboards/
    ├── i.yaml                        # make.mode: enabled
    └── i.themonitoringdashboard.<name>.yaml
```

Новый алерт — это один файл в `alerts/`; `a.yaml` трогать не нужно, чек и релиз идут по каталогу целиком. Новый каталог манифестов — только тогда правится якорь `manifests` в `a.yaml`.

- `make.mode: enabled` в листовом каталоге обязателен. Без него `make` работает, а `deploy` падает: «recognized as an abstract (parent) manifest».
- Базовые спеки лежат **уровнем выше** листового каталога: `from:` требует родителя в предковом каталоге, а на соседний каталог `make` отвечает `"alerts" not subdir of "alerts/base"`. Побочный плюс — вне листового каталога база не рендерится в отдельный алерт.
- Имя базовой спеки — `*-base.yaml` через дефис. Суффикс `.base.yaml` **ломает `${file-ref:}`**: алерт-группа не находит файл, `make` падает с `referenced alert "<точный путь>" was not found`, хотя путь верный. Через `from:` тот же файл читается нормально, поэтому ошибка всплывает не сразу.

## Импорт существующего

Единственный разумный способ завести спеку по алерту, который уже есть в Мониторинге, — импортировать, а не писать руками.

```bash
# все алерты проекта; --alert-id можно повторять, регексы поддерживаются
ya tool infractl import monitoring alert shopify --alert-id '.*' -o <dir> --save-id

# один дашборд; id смотреть в terraform state show или в имени файла при «Экспорт в Terraform» в UI
ya tool infractl import monitoring TheMonitoringDashboard shopify <id> -o <dir>
```

- **`--save-id` обязателен.** Без него импорт не проставит `id`, и выкладка создаст *новый* алерт рядом со старым: история и мьюты останутся на старом, уведомления пойдут с нового.
- Импорт работает под личным OAuth, делегирование робота для него не нужно.
- Импорт забирает только свои алерты (`EXPRESSION`, `THRESHOLD_2`, `ANOMALY`). Алерты из шаблонов сервис-провайдеров (`FROM_TEMPLATE` — CPU/RAM по deploy-юнитам, MDB, Avatars) он не видит, и управлять ими через infractl нельзя: у `sp_alert` есть proto, но нет ни CRD, ни контроллера. В проекте `shopify` таких ~1900 из ~2100 — не пугаться разницы в числах.
- После импорта **вычистить `project_id`** из спеки: проект держим только в `i.yaml`. `make` ругается «can't specify project_id both in i.yaml manifest and in the object spec» только когда значения *разные*, поэтому мусор всплывёт не сразу, а при первой смене проекта.
- Общую часть выносить в базу через `ya tool infractl specs generalize` (команда интерактивная — спеки перечислять флагами `-s`) или руками.
- У дашборда после импорта добавить в `metadata.annotations`: `mon.k.yandex-team.ru/object.id` с идентификатором и `mon.k.yandex-team.ru/imported: 'yes'`. Первая отвязывает id от имени файла, вторая разрешает контроллеру перезаписать уже существующий дашборд.

## Алерт-группы

Семейство однотипных алертов (по ручкам, по контурам) — это `i.alertgroup.*.yaml` плюс базовая спека с `${parameters.*}`, а не N файлов. Группа заодно следит за удалением: убрал запись — алерт уедет из Мониторинга.

```yaml
defaults:
  from: ${file-ref:yastore/infractl/monitoring/i.alert.<family>-base.yaml}
spec:
  alerts:
    <ключ>:
      parameters:
        group: <ключ>
```

- `${file-ref:}` принимает **только абсолютный путь от корня Аркадии**.
- `id` параметризуется в базе (`id: shopify_<family>_${parameters.group}`), чтобы идентификаторы совпадали с уже существующими в Мониторинге.
- **Валидации параметров нет.** Опечатка в имени алерта, группы или параметра не даёт ошибки — значение молча не применится. Пороги и подстановки сверять по отрендеренному `make`, а не по исходным спекам.
- Не увлекаться вложенностью групп: `from_group` поверх `from_group` быстро становится нечитаемым.

## Чего easy-mode не умеет

- **`batching_policy` без `group_by_labels`** — вебхук отбивает `put`: «batching policy is set but alert is not multialert». В Terraform поле стояло у всех алертов подряд; при переносе одиночных его нужно убирать.
- **`text_mode` у threshold-запросов** — конвертер всегда шлёт `false` («we dont support disabled and text mode»). Запрос сохраняется как есть, меняется только вид редактора в UI. В `diff` это выглядит как удаление `text_mode: true` — так и должно быть.
- **Смена `id` или `project_id`** существующего объекта = пересоздание алерта в Мониторинге с потерей истории и мьютов. Не переименовываем.

## Перед PR

Команды запускаются **из листового каталога** (`alerts/` или `dashboards/`).

- `ya tool infractl make` — рендер в stdout, без сети. Оракул для рефакторинга: рендер до и после правки обязан совпасть, кроме служебной аннотации `k.yandex-team.ru/specDescription`. При переносе существующего алерта рендер должен совпасть с импортом байт в байт — отличаться будет только `status: {}`.
- `ya tool infractl deploy --dry-run --non-interactive --auto-approve` — валидация и admission-вебхуки. Ровно это делает PR-чек.
- `ya tool infractl diff` — что реально поедет в Мониторинг. Пустой диф при переносе означает, что объект просто встанет под управление, ничего не изменив.
- `ya tool ci validate` из каталога с `a.yaml` — при правках CI. Требует, чтобы файл был закоммичен.

`put` не принимает `i.alert.*.yaml` напрямую — падает с «Kind is not set»: объекты получаются через `make`. `diag access` работает только изнутри Аркадии.

## Выкладка и права

- Выкладка (`deploy`, запуск релиза) — задача человека, не агента.
- Робот `robot-i-thomas` имеет роль `/project/PROJECT_ADMIN(fields:(project:shopify))` в системе `solomon`, monitoring-токен делегирован. Проверка — `ya tool infractl diag access`; `--fix` закажет роль, если её не хватает.
- Релиз `release-alerts` запускается вручную, `auto` намеренно не включён. В нём стоит `fail_on_non_infractl_changes: true` — если алерт правили руками в UI, релиз упадёт вместо тихого затирания правки (для `Alert` и `AlertGroup` это работает по-настоящему).

## Если объект ещё в Terraform

Порядок для оставшихся дашбордов (`mdb_clusters`, `yt_stores_export`):

1. Спека в транке → выложить релизом.
2. `./terraform.sh init && ./terraform.sh state rm <адрес>` — из транка, не с ветки PR. Ресурсы с `for_each` снимаются одним адресом без индексов.
3. Мёрж PR с удалением `.tf`.

Между шагами 2 и 3 не запускать `apply`. Если ресурс исчезнет из кода, оставшись в state, `apply` удалит объект в Мониторинге; если наоборот — попытается создать его поверх существующего.
