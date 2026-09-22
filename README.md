<div align="center">

# 🎧 Support Active System

**Система управления IT-заявками, оборудованием кабинетов, картриджами и лицензиями**

[![Version](https://img.shields.io/badge/version-2.9-blue.svg)](CHANGELOG.md)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/flask-3.0-green.svg)](https://flask.palletsprojects.com/)
[![SQLite](https://img.shields.io/badge/sqlite-3-lightgrey.svg)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](#лицензия)

[Возможности](#-возможности) •
[Быстрый старт](#-быстрый-старт) •
[Архитектура](#-архитектура) •
[Развёртывание](#-развёртывание) •
[Документация](#-документация)

</div>

---

## 📖 О проекте

**Support Active System** — self-hosted веб-приложение для отдела технической поддержки.
Закрывает полный цикл: от создания заявки сотрудником до её выполнения техником,
с учётом оборудования кабинетов, картриджей, лицензий и внешних контрагентов.

Разработано для корпоративного использования: одна организация, свой сервер,
простое развёртывание, работа в браузере и в режиме PWA (как приложение на телефоне).

---

## ✨ Возможности

### 📝 Заявки
- Полный цикл: создание → взятие в работу → выполнение → закрытие
- Каскадные фильтры, поиск, пагинация
- Уведомления (админам, исполнителю, создателю)
- Комментарии с **@mentions** и автокомплитом
- Вложения (drag-n-drop, до 10 МБ)
- История изменений каждой заявки
- Проверка занятости исполнителя
- Массовые операции: закрыть / назначить / приоритет / удалить

### 🏢 Оборудование кабинетов
- **Сетевое оборудование** (свитчи, роутеры, точки доступа)
- **Компьютеры** — полная спецификация:
  - Материнская плата (с сокетом), CPU, IP
  - **ОЗУ**, **хранилища**, **мониторы** — с историей замен
  - **Периферия** — колонки, веб-камера, наушники, микрофон
  - Установленное ПО из лицензий кабинета
- **Принтеры** — сетевые и USB, с привязкой к ПК
  - Замена принтера / картриджа с автосинхронизацией с модулем «Картриджи»
  - Драйверы: просмотр, загрузка, удаление
- **Автопинг ПК** каждые 5 минут + ручной запуск
- **Drag-n-drop** для сортировки устройств
- **QR-коды** для ПК и принтеров (публичные карточки)
- **Печать карточки кабинета**

### 🖨️ Учёт
- **Картриджи** — список замен с поиском и графиком по месяцам
- **Лицензии ПО** — по кабинетам + документы (PDF, сканы)
- **Внешние контакты** — поставщики, сервис, партнёры
- **Справочник** кабинетов и типов проблем

### 📊 Аналитика
- **Дашборд руководителя** — KPI, динамика, топ исполнителей
- **Журнал аудита** действий пользователей
- **Экспорт заявок**: XLSX, PDF, печать

### 🔐 Безопасность
- PBKDF2-хеши паролей
- Rate limiting + блокировка после N неудачных попыток
- CSRF, CSP, X-Frame-Options, X-Content-Type-Options
- Magic bytes при загрузке файлов
- Path traversal защита
- Мягкое удаление (soft delete)
- Журнал аудита

### 🎨 Интерфейс
- Тёмная / светлая / авто-тема
- Горячие клавиши, командная палитра (`Ctrl+K`)
- Мобильный UX: FAB, свайпы, pull-to-refresh
- PWA с push-уведомлениями (VAPID)
- **Impersonation** для роли «Разработчик»

---

## 🚀 Быстрый старт

### Требования

- Python **3.10+**
- pip
- (опционально) Redis — для продакшена
- (опционально) `ping` в системе — для проверки доступности ПК

### Установка

```bash
# 1. Клонирование
git clone <repo-url> supportactive
cd supportactive

# 2. Виртуальное окружение
python -m venv venv

# Linux / macOS
source venv/bin/activate

# Windows
venv\Scripts\activate

# 3. Зависимости
pip install -r requirements.txt

# 4. Переменные окружения
cp .env.example .env

# Сгенерировать SECRET_KEY:
python -c "import secrets; print(secrets.token_hex(32))"
# → вставить в .env

# (опционально) VAPID-ключи для push:
python generate_vapid.py

# 5. Запуск
python run.py
```

Откройте **http://localhost:5000**

При первом запуске автоматически:
- создастся `database.db`
- применятся миграции (v1 … v23)
- добавятся тестовые данные

### Тестовые пользователи

| Логин | Пароль | Роль |
|---|---|---|
| `admin` | `admin123` | Администратор |
| `petrov` | `petrov123` | Техник |
| `kozlova` | `kozlova123` | Пользователь |

---

## 🏗 Архитектура

```
run.py                       Точка входа
  ↓
app.py:create_app()          Фабрика приложения
  ↓
migrations.run_migrations()  23 миграции (идемпотентные)
  ↓
register_blueprints(app)     20+ blueprints
  ↓
services/*                   Бизнес-логика
database.Database()          SQLite-обёртка + transaction()
```

### Backend (Python)

| Файл | Назначение |
|---|---|
| `app.py` | Фабрика, blueprints, CSP, hooks |
| `run.py` | Точка входа для dev / WSGI |
| `config.py` | Конфигурация из ENV |
| `constants.py` | Роли, статусы, лимиты |
| `database.py` | SQLite + `transaction()` contextmanager |
| `migrations.py` | 23 миграции схемы |
| `passwords.py` | PBKDF2-хеширование |
| `audit.py` | Журнал аудита + история заявок |
| `extensions.py` | CSRF / Limiter / Cache |
| `equipment_*.py` | 5 blueprints для оборудования кабинета |
| `services/files.py` | Save / resolve / magic bytes |
| `services/notifications.py` | Создание и группировка уведомлений |
| `services/ping.py` | ICMP-пинг, планировщик |
| `ping_worker.py` | Отдельный воркер для продакшена |

### Frontend (JS / CSS)

- **Шаблоны:** Jinja2, наследование через `base.html`
- **JS:** 38 модулей, единый `App` namespace, `App.api.*` обёртка
- **CSS:** 13 файлов, CSS-переменные, поддержка тёмной темы
- **PWA:** `sw.js` + `manifest.json`

---

## 🖥 Развёртывание

### Gunicorn

```bash
# Основное приложение (gevent нужен для SSE)
gunicorn -k gevent --workers 2 --bind 0.0.0.0:5000 'run:app'

# Отдельный воркер пинга
DISABLE_PING_SCHEDULER=true python ping_worker.py
```

### Nginx

```nginx
server {
    listen 80;
    server_name support.example.com;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE — без буферизации
    location /api/notifications/stream {
        proxy_pass http://127.0.0.1:5000;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
    }
}
```

### Обязательно в продакшене

- [ ] `SECRET_KEY` — задать явно (иначе сессии сбросятся при рестарте)
- [ ] `SESSION_COOKIE_SECURE=true` + HTTPS
- [ ] `DISABLE_PING_SCHEDULER=true`
- [ ] `SESSION_TYPE=redis`, `CACHE_TYPE=RedisCache` (при нескольких воркерах)
- [ ] Проверить, что `ping` установлен (`iputils-ping` в Debian/Ubuntu)

---

## 📚 Документация

| Файл | Описание |
|---|---|
| [`USER_GUIDE.md`](USER_GUIDE.md) | Руководство для конечных пользователей |
| [`DEPLOY.md`](DEPLOY.md) | Подробное развёртывание (systemd, Docker, Windows) |
| [`CHANGELOG.md`](CHANGELOG.md) | История изменений |

---

## ⌨️ Горячие клавиши

| Клавиша | Действие |
|---|---|
| `N` | Создать заявку |
| `F` | Поиск |
| `R` | Обновить |
| `B` | Уведомления |
| `T` | Сменить тему |
| `Ctrl+K` | Командная палитра |
| `?` | Справка по клавишам |
| `Esc` | Закрыть / отмена |
| `G` `T` | Перейти к заявкам |
| `G` `U` | Пользователи |
| `G` `C` | Картриджи |
| `G` `L` | Лицензии |

---

## 🧪 Тесты

```bash
pip install -r requirements-dev.txt
pytest
pytest --cov=. --cov-report=html
```

---

## 📁 Структура проекта

```
supportactive/
├── app.py                     # Фабрика приложения
├── run.py                     # Точка входа
├── ping_worker.py             # Отдельный воркер пинга
├── config.py                  # Конфигурация
├── constants.py               # Константы
├── database.py                # Обёртка SQLite
├── migrations.py              # 23 миграции
├── passwords.py               # Хеширование
├── validators.py              # Валидация
├── logger.py                  # Логирование
├── utils.py                   # Утилиты
├── audit.py                   # Аудит
├── extensions.py              # CSRF / Cache / Limiter
├── generate_vapid.py          # Генератор VAPID
│
├── login.py / tasks.py / users.py
├── cartridges.py / licenses.py / contacts.py
├── directory.py / dashboard.py / excel.py
├── notifications.py / webpush.py / comments.py
├── attachments.py / public_qr.py / database_admin.py
│
├── equipment_core.py
├── equipment_network.py
├── equipment_computers.py
├── equipment_printers.py
├── equipment_documents.py
├── equipment_helpers.py
│
├── services/
│   ├── files.py
│   ├── notifications.py
│   └── ping.py
│
├── templates/                 # Jinja2
│   ├── base.html
│   ├── index.html
│   ├── login.html
│   ├── dashboard.html
│   ├── dev_console.html
│   ├── audit.html
│   └── qr/
│
├── static/
│   ├── css/                   # 13 файлов
│   ├── js/                    # 38 модулей
│   ├── sw.js
│   ├── manifest.json
│   └── logo.png / logo.ico / logo-192.png / logo-512.png
│
├── private_uploads/           # Файлы (вне /static)
│   ├── attachments/
│   ├── documents/
│   └── drivers/
│
├── logs/                      # Ротация по дням
├── backups/                   # Снапшоты БД
├── flask_session/             # Файловые сессии
├── database.db
│
├── requirements.txt
├── requirements-dev.txt
├── .env
├── .env.example
├── .gitignore
├── pytest.ini
└── README.md / USER_GUIDE.md / DEPLOY.md / CHANGELOG.md
```

---

## 🤝 Вклад

Проект внутренний. Если вы из команды — правила работы:

1. Fork / feature-branch
2. Осмысленные коммиты: `feat:`, `fix:`, `refactor:`, `docs:`
3. Правки в `CHANGELOG.md`
4. Pull Request с описанием

---

## 📄 Лицензия

Внутренний проект. Все права защищены. © 2026