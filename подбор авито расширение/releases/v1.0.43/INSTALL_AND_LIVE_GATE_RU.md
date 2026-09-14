# v1.0.43 — установка и live gate

Это diagnostic corrective build. Она **не меняет IP-block recovery algorithm**.

## Установка

1. Не удалять существующее unpacked extension.
2. Не очищать `chrome.storage`, proxy profiles или сохранённый WORK baseline `150/150`.
3. Заменить файлы распакованного расширения exact содержимым v1.0.43.
4. В `chrome://extensions` выполнить Reload.
5. Обновить текущий ChatGPT tab и Avito tab.
6. Подтвердить в следующем Finder report: `Версия: 1.0.43`.

## Один live run

Повторить только Mini ITX `8156773014`.

Если recovery снова исчерпает 4 attempts, новый terminal report должен вернуть:

- `IP probe: before → after`;
- доказана ли смена IP;
- `Транспорт: PROBES_*` и probe errors;
- `Endpoint/create: state / attempt / reason`;
- `Provider rotation: state / attempt / proof`.

После этого **не делать blind retry**. Эти строки являются evidence для доказательства конкретного recovery substep и следующего Rule-20/RED цикла.

## Acceptance

v1.0.43 считается выполнившей свою diagnostic цель, если exact installed build возвращает эти данные в тот же pinned ChatGPT chat без утечки credentials. Это не означает, что IP-block recovery исправлен.
