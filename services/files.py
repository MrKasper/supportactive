# services/files.py
"""
Сервис работы с файлами: сохранение, поиск, удаление, проверка magic bytes.
Проверка содержимого реализована через puremagic (pure-Python, без libmagic),
поэтому работает одинаково на Windows, Linux и macOS.

Возможности:
  • Валидация расширения по белому списку
  • Проверка magic bytes — содержимое должно соответствовать расширению
  • Ограничение по размеру
  • Безопасное сохранение с UUID-именем
  • Поиск файла среди нескольких папок (включая legacy-пути)
  • Безопасное удаление
  • Человекочитаемый размер (реэкспорт из utils)
"""
import os
import uuid

from werkzeug.utils import secure_filename

from logger import get_logger
from utils import human_size  # noqa: F401  (реэкспорт для обратной совместимости)

log = get_logger(__name__)


# ============================================================
# ОПЦИОНАЛЬНАЯ ПРОВЕРКА СОДЕРЖИМОГО
# ============================================================
try:
    import puremagic
    HAS_PUREMAGIC = True
except ImportError:
    HAS_PUREMAGIC = False
    log.warning(
        'puremagic не установлен — проверка содержимого файлов отключена. '
        'Установите: pip install puremagic==1.28'
    )


# ============================================================
# Соответствие расширений ожидаемым MIME-типам
# ============================================================
_EXPECTED_MIMES = {
    # Документы
    'pdf':  {'application/pdf'},
    'doc':  {'application/msword'},
    'docx': {
        'application/vnd.openxmlformats-officedocument'
        '.wordprocessingml.document',
    },
    'xls':  {'application/vnd.ms-excel'},
    'xlsx': {
        'application/vnd.openxmlformats-officedocument'
        '.spreadsheetml.sheet',
    },
    'ppt':  {'application/vnd.ms-powerpoint'},
    'pptx': {
        'application/vnd.openxmlformats-officedocument'
        '.presentationml.presentation',
    },
    'txt':  {'text/plain'},
    'csv':  {'text/csv', 'text/plain'},
    'log':  {'text/plain'},
    'md':   {'text/plain', 'text/markdown'},
    'json': {'application/json', 'text/plain'},
    'xml':  {'application/xml', 'text/xml', 'text/plain'},
    'rtf':  {'application/rtf', 'text/rtf'},

    # Изображения
    'png':  {'image/png'},
    'jpg':  {'image/jpeg'},
    'jpeg': {'image/jpeg'},
    'gif':  {'image/gif'},
    'webp': {'image/webp'},
    'bmp':  {'image/bmp', 'image/x-ms-bmp'},
    'svg':  {'image/svg+xml', 'text/plain'},

    # Архивы
    'zip':  {'application/zip', 'application/x-zip-compressed'},
    'rar':  {'application/x-rar-compressed', 'application/vnd.rar'},
    '7z':   {'application/x-7z-compressed'},
    'tar':  {'application/x-tar'},
    'gz':   {'application/gzip', 'application/x-gzip'},
}


# ============================================================
# ВАЛИДАЦИЯ
# ============================================================

def validate_extension(filename, allowed_ext):
    """
    Проверяет расширение файла по белому списку.

    Возвращает:
        (ok: bool, ext: str | None)
    """
    if not filename or '.' not in filename:
        return False, None

    ext = filename.rsplit('.', 1)[1].lower()
    return (ext in allowed_ext), ext


def _verify_magic_bytes(file, ext):
    """
    Читает первые 2 КБ файла и определяет реальный MIME-тип через puremagic.
    Сравнивает с ожидаемым для указанного расширения.

    Возвращает:
        (ok: bool, real_mime: str | None, error: str | None)

    Позиция файлового указателя восстанавливается в начало.
    При отсутствии puremagic — возвращает (True, None, None).
    """
    if not HAS_PUREMAGIC:
        return True, None, None

    # Читаем шапку файла
    try:
        file.seek(0)
        head = file.read(2048)
        file.seek(0)
    except Exception as e:
        return False, None, f'Не удалось прочитать файл: {e}'

    if not head:
        return False, None, 'Файл пуст'

    # Определяем MIME через puremagic
    try:
        matches = puremagic.magic_string(head)
    except Exception as e:
        log.warning(f'puremagic.magic_string error: {e}')
        # Не блокируем загрузку при сбое определения
        return True, None, None

    if not matches:
        # puremagic не распознал формат — пропускаем
        return True, None, None

    # Берём первое совпадение с непустым MIME
    real_mime = None
    for m in matches:
        mime = getattr(m, 'mime_type', None)
        if mime:
            real_mime = mime
            break

    if not real_mime:
        return True, None, None

    # Проверяем соответствие
    expected = _EXPECTED_MIMES.get(ext)
    if not expected:
        # Не знаем ожидаемый MIME — пропускаем
        return True, real_mime, None

    # Нормализуем: убираем параметры (например, "; charset=utf-8")
    real_mime_norm = real_mime.split(';')[0].strip().lower()

    if real_mime_norm in expected:
        return True, real_mime, None

    # Разрешаем любые text/* для .txt, .csv, .md, .log, .json, .xml
    # (кодировки бывают разными: text/x-python, text/x-c и т.п.)
    if 'text/plain' in expected and real_mime_norm.startswith('text/'):
        return True, real_mime, None

    # Несоответствие
    return False, real_mime, (
        f'Содержимое файла не соответствует расширению .{ext} '
        f'(определено: {real_mime})'
    )


# ============================================================
# СОХРАНЕНИЕ
# ============================================================

def save_upload(file, target_folder, allowed_ext, max_size_bytes):
    """
    Сохраняет загруженный файл с проверкой magic bytes.

    Параметры:
        file            — объект из request.files[...]
        target_folder   — абсолютный путь к папке назначения
        allowed_ext     — set разрешённых расширений (без точки)
        max_size_bytes  — максимальный размер в байтах

    Возвращает dict:
        {
          ok:            bool,
          error:         str | None,
          original_name: str,
          unique_name:   str,
          rel_path:      str,        # имя внутри target_folder
          abs_path:      str,
          size:          int,
          mime:          str,
          real_mime:     str | None, # определённый puremagic
        }
    """
    result = {
        'ok': False,
        'error': None,
        'original_name': '',
        'unique_name': '',
        'rel_path': '',
        'abs_path': '',
        'size': 0,
        'mime': 'application/octet-stream',
        'real_mime': None,
    }

    # ---------- Проверка наличия файла ----------
    if not file or not file.filename:
        result['error'] = 'Файл не выбран'
        return result

    # ---------- Проверка расширения ----------
    ok, ext = validate_extension(file.filename, allowed_ext)
    if not ok:
        result['error'] = (
            f'Недопустимый формат. Разрешены: '
            f'{", ".join(sorted(allowed_ext))}'
        )
        return result

    # ---------- Проверка размера ----------
    try:
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
    except Exception as e:
        result['error'] = f'Не удалось определить размер файла: {e}'
        return result

    if size == 0:
        result['error'] = 'Файл пуст'
        return result

    if size > max_size_bytes:
        mb = max_size_bytes // 1024 // 1024
        result['error'] = f'Файл слишком большой (макс. {mb} МБ)'
        return result

    # ---------- Проверка содержимого (magic bytes) ----------
    ok, real_mime, err = _verify_magic_bytes(file, ext)
    if not ok:
        log.warning(
            f'Magic bytes mismatch: {file.filename} '
            f'(ext={ext}, real={real_mime})'
        )
        result['error'] = err
        return result

    result['real_mime'] = real_mime

    # ---------- Сохранение ----------
    original_name = file.filename
    unique_name = secure_filename(f'{uuid.uuid4().hex}.{ext}')
    if not unique_name:
        # Если secure_filename вернул пусто (крайне редко)
        unique_name = f'{uuid.uuid4().hex}.{ext}'

    try:
        os.makedirs(target_folder, exist_ok=True)
    except OSError as e:
        result['error'] = f'Не удалось создать папку: {e}'
        return result

    abs_path = os.path.join(target_folder, unique_name)

    try:
        file.save(abs_path)
    except Exception as e:
        log.exception(f'Ошибка сохранения файла {abs_path}')
        result['error'] = f'Не удалось сохранить файл: {e}'
        return result

    result.update({
        'ok': True,
        'original_name': original_name,
        'unique_name': unique_name,
        'rel_path': unique_name,
        'abs_path': abs_path,
        'size': size,
        'mime': real_mime or file.mimetype or 'application/octet-stream',
    })
    return result


# ============================================================
# ПОИСК И УДАЛЕНИЕ
# ============================================================

def resolve_file_path(stored_path, search_folders):
    """
    Ищет реальный путь к файлу среди возможных папок.

    Нужен из-за legacy-записей в БД: раньше файлы лежали в других местах
    (например, static/uploads/attachments), теперь — в private_uploads/.

    Параметры:
        stored_path     — то, что хранится в БД (относительный путь или basename)
        search_folders  — список папок для поиска

    Возвращает:
        abs_path: str | None
    """
    if not stored_path:
        return None

    stored_path = str(stored_path).strip()
    basename = os.path.basename(stored_path)

    candidates = []
    for folder in search_folders:
        if not folder:
            continue
        # Полный относительный путь
        candidates.append(os.path.join(folder, stored_path))
        # Только имя файла (на случай вложенных путей)
        candidates.append(os.path.join(folder, basename))

    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def delete_file_safe(path):
    """
    Удаляет файл, если он существует.
    Никогда не бросает исключение — только возвращает True/False.
    """
    if not path:
        return False

    if not os.path.exists(path):
        return True  # уже нет — считаем успехом

    try:
        os.remove(path)
        return True
    except Exception as e:
        log.warning(f'Не удалось удалить файл {path}: {e}')
        return False