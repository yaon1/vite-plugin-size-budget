# Как внести вклад

```bash
npm i
npm test           # включает сборки настоящим Vite во временных папках
npm run lint && npm run typecheck
npm run coverage
```

- Логика без Vite (графы, отчёты, размеры) живёт в отдельных модулях и тестируется без сборки.
- Поведение плагина проверяется в `test/plugin.test.ts` через `vite.build()`.
- Формат JSON-отчёта — публичный контракт: новые поля только опциональные, ломающие изменения — через `version`.
- Коммиты в формате [Conventional Commits](https://www.conventionalcommits.org/ru/).
