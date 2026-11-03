---
paths:
  - "infractl/balancers/**/*.yaml"
  - "infractl/balancers/a.yaml"
---

# Балансеры через infractl

Конвенции KIT для awacs-спек в `infractl/balancers/`. Общая механика infractl — поля спек, CLI, маппинг в Y.Deploy — в скилле `infra/infractl` (`ai/artifacts/skills/infra/infractl`); здесь только то, что специфично для нас.

## Раскладка

```
infractl/balancers/
├── a.yaml                          # PR-чеки и релизы, по одному на проект
├── i.yaml                          # namespace: yastore
└── <project>/                      # adminka | api | b2b | core | grot | portal
    ├── i.<kind>.base.yaml          # общий слой проекта
    ├── i.<kind>.<name>.yaml        # промежуточные слои
    ├── i/                          # фрагменты для mixins:
    └── <env>/                      # dev | test | sandbox | prod
        ├── i.yaml                  # awacs.namespace, environment, make.mode
        ├── i.values.yaml           # значения контура
        └── i.<kind>.<fqdn>.yaml    # файл контура: from + минимум переопределений
```

Один объект awacs — один файл: балансер `AwacsEasyBalancer`, домены `AwacsEasyDomain`, апстримы `AwacsEasyUpstream`.

**Новое окружение:** каталог `<project>/<env>/` с `i.yaml` (свой awacs-неймспейс) и `i.values.yaml`, по файлу на каждый объект контура, плюс путь в `a.yaml` — в якорь `shared.<project>` (PR-чек) и в `flow-vars` нужной стадии релиза. Без записи в `a.yaml` окружение не проверяется и не выкладывается.

Пояснительные комментарии в спеках не пишем — спека читается как данные, механику объясняем в описании PR.

## Наследование

- `from:` — абсолютный путь от корня Аркадии (`yastore/infractl/balancers/...`).
- Цепочки любой глубины: `base → промежуточный слой → файл контура`. Пример: `b2b/i.easyupstream.base.yaml` → `i.easyupstream.core-heavy-common.yaml` → `i.easyupstream.core-heavy.yaml` → `b2b/prod/i.easyupstream.b2b.yastore.yandex.ru-core-heavy.yaml`. Родитель обязан лежать в том же каталоге или выше по дереву.
- `mixins:` — список фрагментов поверх `from`. Общие сквозные куски (rps-лимитер) держим в `<project>/i/`, а не копируем по контурам.
- **Списки при мёрже ведут себя по-разному.** У `AwacsEasyUpstream` `destinations`, `endpoint_sets`, `manual_backends`, `clusters` **дописываются** — наследник может только добавить, переопределить нельзя. Остальные списки (`match`, `AwacsEasyDomain.upstreams`) наследник **заменяет целиком**. Следствия: промежуточный слой не задаёт `destinations`, если от него наследуются варианты с разными бэкендами; общую часть `match` в родителя вынести нельзя — наследник переписывает список полностью.
- Файл контура в идеале — это `from:` плюс `upstream_id` и одно-два переопределения. Если в нём больше, кусок просится в промежуточный слой.

## Значения (`i.values.yaml`)

- Все отличия контуров — только через `i.values.yaml` и `${val.…}`: `net_macro`, `env_prefix`, `contour`, `stage`, адреса бэкендов. В base-файлах контур не хардкодим.
- Плоские пары «строка → строка». Наследуются вверх по дереву каталогов и мёржатся по ключам, ближайший каталог переопределяет родителя. Values держим внутри проекта, не на общем уровне `balancers/`.
- Подстановка работает **только в строковых полях `spec`** и **не работает в `metadata`**. Нестроковое (`replicas.sas: 1`, `preset.type: NANO`) через values не задать.
- Внутри значений подстановок нет (`substitutions are not allowed inside values`) — составное значение пишем литералом в каждом контуре.
- Незаполненный маркер роняет `make`. Это фича: ловится PR-чеком.

## Имена объектов

Имя объекта в awacs берётся из **имени файла**, а в `metadata` подстановка не работает — отсюда полные имена в контурах вида `i.easyupstream.sandbox.portal.kit.yandex-team.ru-api.yaml`. Переименование файла = удаление и пересоздание объекта в awacs. Отвязать имя от файла можно аннотацией `awacs.k.yandex-team.ru/<kind>.id` — живой пример `b2b/test/i.easydomain.b2b-kit.yaml`.

## awacs UI не трогаем

Единственный источник правды — спека. Ручная правка через UI всплывёт дифом в PR-чеке, уронит выкладку (`fail_on_non_infractl_changes: true` в релизных джобах) или будет затёрта.

Обратное тоже верно: изменение мимо infractl (трансфер домена, правка в UI) реконсиляцию не запускает — «спека не менялась» не значит «ничего не менялось». Нужен прогон релиза с `zero_diff`.

## Перед PR

Обе команды запускаются **из каталога окружения** (`infractl/balancers/<project>/<env>/`), не из корня репозитория — иначе `root i.yaml not found`.

- `ya tool infractl make -a <arcadia-root>` — рендерит объекты в stdout, без сети и без записи файлов. Оракул для рефакторинга спек: рендер до и после правки обязан совпасть байт в байт, кроме служебной аннотации `k.yandex-team.ru/specDescription` (в ней список исходных файлов).
- `ya tool infractl make --dry-run` — то же плюс admission-вебхуки awacs. Ровно это делает PR-чек `check-<project>`, так что гоняем до `diff`: вебхук ловит запреты, которых в дифе не видно.
- `ya tool infractl diff` — что реально поедет в awacs. Обязателен при правке блока сертификата: `cert` против `cert_ref` вебхук не различает.
- Выкладка (`deploy`, ручной запуск релиза) — задача человека, не агента.

## Грабли контура

- `https_redirect: ABSENT` под ABC `shopify` запрещён вебхуком (`is not allowed to switch off permanent https redirect`). Остаётся `PERMANENT` (незаданное поле = permanent). При миграции живого балансера, где в awacs стоял `ABSENT`, предупреждаем: plain-HTTP начнёт отдавать 301.
- `cert:` **заказывает** сертификат, `cert_ref: {id}` ссылается на существующий. На живом внешнем домене менять параметры `cert` опасно — видно только в `diff`, dry-run это пропускает.
- `logs.custom_topic` требует включённого TVM, иначе awacs отбивает `put` целиком. `antirobot` и `rps_limiter` TVM не требуют.
- Гринфилд: awacs-неймспейс заводит `AwacsEasyBalancer`, поэтому первую выкладку контура делаем в два шага — балансер, дождаться неймспейса, потом домены и апстримы. До первой выкладки `check-<project>` на новом контуре красный (`namespace "X" not found`).
- `components_policy.mode: STABLE` не трогаем. Помним, что apply тянет обновление компонент балансера вместе с конфигом.

## CI (`infractl/balancers/a.yaml`)

- **PR:** `check-<project>` — `apply_specs_v2` в `mode: DRY_RUN, update: SPECS_ONLY` по всем окружениям проекта плюс `diff_specs_v2` против awacs. Триггер — `sub-paths: [<project>/**, i.*yaml]`.
- **Trunk:** релиз на каждый проект, `auto: true`, фильтр `abs-paths: [yastore/infractl/balancers/<project>/**]`. Стадии: `dev` → ручной аппрув → `test` + `sandbox` → ручной аппрув → `prod`.
- Релизы раздельные намеренно: у b2b prod (внешний трафик магазинов) и portal (внутренняя админка) разный риск, общий аппрув заставлял бы аппрувить b2b ради правки портала.
- Конвергенция, когда спека не менялась, а уехали версии компонент: запустить релиз руками с флагом `zero_diff` в форме.
- Файлы в корне `balancers/` под фильтры релизов не попадают — их правка гоняет PR-чеки, но не выкладывается ни одним релизом.
