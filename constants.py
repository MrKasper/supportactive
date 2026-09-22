# constants.py
"""
Общие константы проекта: роли, статусы, лимиты, пути.
Используются везде, где раньше были магические строки.
"""

# ============================================================
# РОЛИ
# ============================================================
ROLE_ADMIN = 'Администратор'
ROLE_TECH = 'Техник'
ROLE_USER = 'Пользователь'
ROLE_DEVELOPER = 'Разработчик'  # 🆕

ALL_ROLES = (ROLE_ADMIN, ROLE_TECH, ROLE_USER, ROLE_DEVELOPER)

# Кто может редактировать контент (заявки, оборудование, картриджи)
EDITOR_ROLES = (ROLE_ADMIN, ROLE_TECH)

# Кто имеет доступ к инструментам разработчика
DEV_ROLES = (ROLE_ADMIN, ROLE_DEVELOPER)


# ============================================================
# СТАТУСЫ ЗАЯВОК
# ============================================================
STATUS_NEW = 'Новое'
STATUS_IN_PROGRESS = 'В работе'
STATUS_COMPLETED = 'Выполнено'
STATUS_CANCELLED = 'Отменено'

ALL_STATUSES = (STATUS_NEW, STATUS_IN_PROGRESS, STATUS_COMPLETED, STATUS_CANCELLED)
ACTIVE_STATUSES = (STATUS_NEW, STATUS_IN_PROGRESS)


# ============================================================
# ПРИОРИТЕТЫ
# ============================================================
PRIORITY_HIGH = 'Высокий'
PRIORITY_MEDIUM = 'Средний'
PRIORITY_LOW = 'Низкий'

ALL_PRIORITIES = (PRIORITY_HIGH, PRIORITY_MEDIUM, PRIORITY_LOW)


# ============================================================
# ТИПЫ ПОДКЛЮЧЕНИЯ ПРИНТЕРОВ
# ============================================================
CONN_NETWORK = 'network'
CONN_USB = 'usb'

ALL_CONN_TYPES = (CONN_NETWORK, CONN_USB)


# ============================================================
# ТИПЫ УВЕДОМЛЕНИЙ
# ============================================================
NOTIFY_NEW_TASK = 'new_task'
NOTIFY_TASK_TAKEN = 'task_taken'
NOTIFY_TASK_COMPLETED = 'task_completed'
NOTIFY_NEW_COMMENT = 'new_comment'
NOTIFY_MENTION = 'mention'


# ============================================================
# ЛИМИТЫ
# ============================================================
MAX_LOGIN_ATTEMPTS = 3
MAX_LOGIN_ATTEMPTS_ADMIN = 10
BLOCK_MINUTES = 15

MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

MAX_COMMENT_LENGTH = 5000
MAX_ATTACHMENT_SIZE_MB = 10
MAX_ATTACHMENT_SIZE = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


# ============================================================
# РАСШИРЕНИЯ ФАЙЛОВ
# ============================================================
ALLOWED_AVATAR_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

ALLOWED_DOCUMENT_EXT = {
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'rtf',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp',
    'zip', 'rar', '7z', 'tar', 'gz',
}

ALLOWED_ATTACHMENT_EXT = {
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'txt', 'csv', 'zip', 'rar', '7z', 'tar', 'gz',
    'log', 'json', 'xml', 'md',
}


# ============================================================
# ТИПЫ СЕТЕВОГО ОБОРУДОВАНИЯ
# ============================================================
NETWORK_DEVICE_TYPES = (
    'Свитч', 'Маршрутизатор', 'Коммутатор',
    'Точка доступа', 'Модем', 'Прочее',
)


# ============================================================
# СОКЕТЫ / RAM / STORAGE (для datalist)
# ============================================================
MOTHERBOARD_SOCKETS = ('LGA1151', 'LGA1200', 'LGA1700', 'AM4', 'AM5')
RAM_TYPES = ('DDR3', 'DDR4', 'DDR5', 'LPDDR4', 'LPDDR5')
STORAGE_TYPES = ('SSD', 'HDD', 'NVMe', 'SSD M.2', 'eMMC')


# ============================================================
# КАТЕГОРИИ ВНЕШНИХ КОНТАКТОВ
# ============================================================
CONTACT_CATEGORIES = (
    'Поставщики', 'Сервис', 'Клиенты',
    'Партнеры', 'Госорганы', 'Другое',
)


# ============================================================
# СТАТУСЫ-БЕЙДЖИ (для UI)
# ============================================================
STATUS_COLORS = {
    STATUS_NEW: 'primary',
    STATUS_IN_PROGRESS: 'warning',
    STATUS_COMPLETED: 'success',
    STATUS_CANCELLED: 'secondary',
}