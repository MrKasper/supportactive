# Changelog

Все значимые изменения проекта. Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версионирование — [SemVer](https://semver.org/lang/ru/).

---

## [2.7.0] — 2026-09-17

### Добавлено

#### Инфраструктура
- **Redis** для сессий и rate limit — горизонтальное масштабирование.
- **Magic bytes** проверка при загрузке файлов (защита от подмены расширения).
- **Отдельный ping worker** (`ping_worker.py`) — для продакшн-развёртывания с несколькими воркерами.
- **Docker** — `Dockerfile`, `docker-compose.yml`, `.dockerignore`.
- **Health-check** `/health` для мониторинга.

#### Функциональность
- **Real-time уведомления (SSE)** — вместо polling.
- **Массовые операции** над заявками: закрыть, назначить, приоритет, удалить.
- **Экспорт заявок в PDF** (A4, альбомная).
- **Дашборд руководителя** — KPI, динамика по месяцам, топ исполнителей.
- **QR-коды** для ПК и принтеров — распечатать и наклеить на корпус.

#### Документация
- `README.md` — обзор проекта.
- `DEPLOY.md` — развёртывание на Linux + systemd + Nginx, Docker, Windows.
- `USER_GUIDE.md` — руководство для конечных пользователей.
- `CHANGELOG.md` — этот файл.

#### Разработка
- `pytest` — ~40 тестов.
- `requirements-dev.txt`.
- `pytest.ini`, `conftest.py`.

### Изменено

- **Refactoring backend**:
  - `equipment.py` (700 строк) → 5 blueprint'ов (`equipment_core`, `equipment_network`, `equipment_computers`, `equipment_printers`, `equipment_documents`).
  - `notifications.py` → `services/notifications.py` + тонкий API.
  - Вынесены общие константы в `constants.py`, валидаторы в `validators.py`, конфиг в `config.py`.
- **Frontend**:
  - `cabinet_details.js` (1200 строк) → 3 модуля (`cabinet_core`, `cabinet_devices`, `cabinet_documents`).
  - Единая обёртка над `fetch` — `App.api.*` (авто-обработка 401/429/500).
- **Миграции** — обёрнуты в транзакции.
- **CSP** — полная политика с `frame-ancestors`, `base-uri`, `object-src`.

### Исправлено

- **`Flask-Session 0.5` + `Werkzeug 2.3`** — несовместимость, вызывавшая `TypeError: cannot use a string pattern on a bytes-like object`.
- **`sw.js`** — возвращал `null` при offline, теперь корректный 504.
- **`manifest.json`** — `orientation: any`, отдельные иконки 192/512.
- **Печать карточки кабинета** — кнопка работала не всегда (CSP блокировал inline `onclick`), добавлен авто-`print()`.
- **Модалка ПК** — кривая вёрстка секций ОЗУ/диски/ПО.
- **`cabinet_details.js`** — `TypeError: Cannot read properties of null` в `preConfirm`.

### Удалено

- `equipment.py` (заменён на 5 модулей).
- `static/js/cabinet_details.js` (заменён на 3 модуля).

---

## [2.6.0] — 2026-08-15

### Добавлено
- Первый публичный релиз.
- Заявки, картриджи, лицензии, контакты, справочник.
- Управление кабинетами с оборудованием.
- Комментарии с @mentions.
- Аудит действий.
- Web Push (VAPID).
- PWA.
- Тёмная тема, горячие клавиши, командная палитра.

---

## Формат версий

- **MAJOR** — несовместимые изменения.
- **MINOR** — новая функциональность обратно совместимая.
- **PATCH** — исправления без новой функциональности.

## Как обновиться

См. `DEPLOY.md` → раздел «Обновление версии».