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

## Не дать бандлу расти незаметно

```ts
{ path: '@initial', max: '200 kB', maxIncrease: '3%' }  // или '5 kB'
```

При заданном `baseline` сборка упадёт, если бюджет вырос сильнее разрешённого, даже если до лимита ещё далеко. Бюджеты, использованные больше чем на 90% (`warnAt`), помечаются ⚠️ в консоли и в отчёте.

## Что тянет вес

В отчёт попадают десять крупнейших пакетов и файлов (по минифицированному размеру) и пакеты, попавшие в бандл несколько раз:

```
  ⚠ date-fns is bundled 2 times: node_modules/date-fns, node_modules/chart/node_modules/date-fns
```

## Отчёты

| Опция | Файл |
|---|---|
| `reportFile` | JSON для сравнения и CLI (по умолчанию `size-report.json`) |
| `markdownFile` | Markdown для комментария к PR, например через `marocchino/sticky-pull-request-comment` |
| `htmlFile` | Самодостаточная HTML-страница с полосками заполнения |
| `$GITHUB_STEP_SUMMARY` | Таблица в саммари job-а, пишется автоматически |

В GitHub Actions превышения также выводятся аннотациями `::error` / `::warning`. Локально плагин помнит прошлую сборку и показывает изменения: `(+1.20 kB since last build)`.

## CLI

```bash
npx size-budget compare base.json size-report.json > comment.md
npx size-budget check size-report.json      # код выхода 1, если есть превышения
npx size-budget html size-report.json > size.html
```

## Один budget.json для Lighthouse и сборки

```ts
import budgets from './budget.json' with { type: 'json' }
import sizeBudget, { fromLighthouse } from 'vite-plugin-size-budget'

export default defineConfig({ plugins: [sizeBudget({ budgets: fromLighthouse(budgets) })] })
```

`script` → `@js`, `stylesheet` → `@css`, `image` → `@images`, `font` → `@fonts`, `total` → все файлы (значения в KiB, как в Lighthouse).

## Бюджеты в package.json

```json
{
  "sizeBudgets": [{ "path": "@initial", "max": "170 kB" }]
}
```

Если `budgets` не переданы в плагин, они берутся отсюда. Удобно в монорепозитории: у каждого пакета свои лимиты.

## Установка

```bash
npm i -D vite-plugin-size-budget
```

## Опции

| Опция | По умолчанию | |
|---|---|---|
| `budgets` | из `package.json` | `{ path, max, compression?, maxFile?, maxIncrease? }[]`; `path` — glob или группа |
| `compression` | `'gzip'` | `'none' \| 'gzip' \| 'brotli' \| 'zstd'` (zstd на Node 22.15+) |
| `failOnExceed` | `true` в CI | Иначе только предупреждение |
| `warnAt` | `0.9` | Доля лимита, после которой бюджет помечается предупреждением |
| `baseline` | — | Предыдущий JSON-отчёт для сравнения и `maxIncrease` |
| `exclude` | — | Glob-шаблоны файлов, которые не учитываются |
| `reportFile` | `size-report.json` | JSON-отчёт, `false` отключает |
| `markdownFile` | — | Markdown-отчёт для PR |
| `htmlFile` | — | HTML-отчёт |
| `name` | — | Подпись сборки в отчётах |
| `githubSummary` | `true` | Писать таблицу в `$GITHUB_STEP_SUMMARY` |
| `compareWithLast` | `true` вне CI | Показывать изменения относительно прошлой локальной сборки |

Размеры понимают единицы `B`, `kB`, `KiB`, `MB`, `MiB`. Для срочного деплоя проверки можно пропустить: `SIZE_BUDGET_SKIP=1 vite build`.

## Программный API

Те же блоки доступны для своих инструментов, например для проверки не-Vite сборки:

```ts
import { measure, evaluate, toMarkdown } from 'vite-plugin-size-budget'

const sizes = files.map((f) => measure(f.name, f.contents))
const budgets = evaluate(sizes, [{ path: '**/*.js', max: '200 kB' }], 'brotli')
```

## Лицензия

MIT
