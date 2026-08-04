# Changelog

## [0.2.0] — 2026-10-19

### Добавлено
- Группы `@initial`, `@lazy`, `@entry:<name>`, `@js`, `@css`, `@images`, `@fonts`.
- `maxFile`, `maxIncrease`, `warnAt`, `label`, `exclude`, `minChange`, `reportUrl`.
- Крупнейшие модули и поиск дублей пакетов.
- HTML-отчёт, markdown для PR, аннотации GitHub Actions, сравнение с прошлой локальной сборкой.
- CLI `size-budget`: `compare`, `check [--strict]`, `html`, `lighthouse`.
- Импорт Lighthouse `budget.json`, бюджеты из `package.json`, baseline по URL.
- Сжатие zstd (Node 22.15+), программный API.

### Исправлено
- Многоформатные библиотечные сборки: проверяются все выходы, а не последний.

### Производительность
- Считаются только нужные алгоритмы сжатия; измерения кэшируются между пересборками.

## [0.1.0]

- Бюджеты по glob, gzip/brotli, JSON-отчёт, сравнение с baseline, саммари GitHub Actions.
