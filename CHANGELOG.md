## [3.0.0] — 2026-09-24

### Изменено (Breaking)

#### Backend — разбиение модулей
- `tasks.py` → `tasks_list.py`, `tasks_crud.py`, `tasks_bulk.py`, `tasks_helpers.py`
- `users.py` → `users_crud.py`, `users_credentials.py`, `users_import.py`
- `database_admin.py` → `dev_db_info.py`, `dev_db_data.py`, `dev_db_query.py`,
  `dev_logs.py`, `dev_system.py`, `dev_impersonate.py`, `dev_helpers.py`
- `app.py` → `app_extensions.py`, `app_routes.py`, `app_security.py`

#### Frontend — разбиение модулей
- `dev_console.js` → `static/js/dev/dev_console_{core,db,data,query,logs,system}.js`
- `cartridges.js` → `static/js/cartridges/cartridges_{list,chart,form}.js`

### Исправлено
- **Критично:** downgrade Redis в `extensions.py` не сохранялся в `app.config` —
  теперь вынесен в `app_extensions.init_sessions()`, вызывается ДО `Session(app)`
- **Критично:** `SESSION_REDIS` теперь принимает `redis.Redis` instance, а не URL
- Дублирование `window.openCabinetDetails` (оставлен только в `cabinet_core.js`)
- Дублирование CSRF-логики в `api.js` и `csrf.js` (оставлен только `csrf.js`)

### Удалено
- `static/js/database.js` — мёртвый код, опасен перекрытием глобальных переменных
- `static/css/style.css` — мёртвый CSS (дублирует `variables.css` + `components.css`)

### Добавлено
- `TransactionWrapper.execute_rowcount()` в `database.py`