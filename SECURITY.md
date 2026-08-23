# Безопасность

Об уязвимостях сообщайте через [приватный advisory](https://github.com/yaon1/vite-plugin-size-budget/security/advisories/new).

Плагин читает только выходные файлы сборки и, если задан URL в `baseline`, делает один GET-запрос к нему. Не указывайте в `baseline` недоверенные адреса: содержимое отчёта попадает в markdown для PR.
