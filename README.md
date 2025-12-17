# vite-plugin-size-budget

**Не даёт бандлу незаметно разрастись.** Плагин проверяет gzip/brotli-размер файлов после сборки и роняет билд в CI, если превышен бюджет. В PR, в саммари GitHub Actions, появляется таблица: какой бюджет, сколько весит, на сколько выросло по сравнению с `main` и какие файлы изменились сильнее всего. Лишние 200 кБ из-за случайного `import _ from 'lodash'` будут видны сразу на ревью, а не после релиза.

```
vite v6 building for production...
  ✓ assets/*.js (gzip): 48.12 kB / 120.00 kB
  ✗ assets/*.css (gzip): 21.40 kB / 20.00 kB — over by 1.40 kB
error during build: Size budget exceeded: assets/*.css
```

## Пример использования

```ts
// vite.config.ts
import sizeBudget from 'vite-plugin-size-budget'

export default defineConfig({
  plugins: [
    sizeBudget({
      budgets: [
        { path: 'assets/index-*.js', max: '80 kB' }, // входной чанк
        { path: 'assets/*.js', max: '250 kB' }, // весь JS
        { path: 'assets/*.css', max: '20 kB', compression: 'brotli' },
      ],
      baseline: 'baseline/size-report.json',
    }),
  ],
})
```

Сравнение с `main` в GitHub Actions:

```yaml
- uses: actions/download-artifact@v4
  with: { name: size-report, path: baseline }
  continue-on-error: true # при первом запуске baseline ещё нет
- run: npm run build
- uses: actions/upload-artifact@v4
  if: github.ref == 'refs/heads/main'
  with: { name: size-report, path: size-report.json }
```

Хеши в именах файлов отбрасываются, поэтому `index-B3Np.js` сравнивается с `index-Xy9z.js`.

## Группы файлов

Вместо glob можно указать группу:

| Группа | Что входит |
|---|---|
| `@initial` | Всё, что браузер скачивает до старта приложения: entry-чанки, их статические импорты и CSS |
| `@lazy` | Чанки, которые грузятся только через `import()` |
| `@entry:<name>` | Начальная загрузка конкретной точки входа (для многостраничных приложений) |
| `@js`, `@css`, `@images`, `@fonts` | Файлы по типу |

```ts
sizeBudget({
  budgets: [
    { path: '@initial', max: '170 kB' },        // то, чего пользователь ждёт на первом экране
    { path: '@lazy', max: '400 kB', maxFile: '80 kB' },
    { path: '@entry:admin', max: '300 kB' },
  ],
})
```

## Установка

```bash
npm i -D vite-plugin-size-budget
```

## Опции

| Опция           | По умолчанию       |                                                                                               |
| --------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| `budgets`       | —                  | `{ path: glob, max: '150 kB' \| байты, compression? }[]`; проверяется сумма подходящих файлов |
| `compression`   | `'gzip'`           | `'none' \| 'gzip' \| 'brotli'`                                                                |
| `failOnExceed`  | `true` в CI        | Иначе только предупреждение                                                                   |
| `reportFile`    | `size-report.json` | Путь JSON-отчёта, `false` отключает его                                                       |
| `baseline`      | —                  | Предыдущий отчёт для сравнения                                                                |
| `githubSummary` | `true`             | Писать таблицу в `$GITHUB_STEP_SUMMARY`                                                       |

Размеры понимают единицы `B`, `kB`, `KiB`, `MB`, `MiB`.

## Лицензия

MIT
