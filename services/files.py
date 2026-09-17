# services/files.py
"""
Сервис работы с файлами: сохранение, поиск, удаление.
Проверка magic bytes — содержимое важнее расширения.
"""
import os
import uuid
from werkzeug.utils import secure_filename

from logger import get_logger

log = get_logger(__name__)

# Опциональный python-magic
try:
    import magic
    HAS_MAGIC = True
except ImportError:
    HAS_MAGIC = False
    log.warning(
        'python-magic не установлен — проверка содержимого файлов отключена. '
        'Установите: pip install python-magic (Linux/Mac) '
        'или python-magic-bin (Windows)'
    )


# ============================================================
# Соответствие расширений ожидаемым MIME
# ============================================================
_EXPECTED_MIMES = {
    'pdf':  {'application/pdf'},
    'doc':  {'application/msword'},
    'docx': {'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
    'xls':  {'application/vnd.ms-excel'},
    'xlsx': {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
    'ppt':  {'application/vnd.ms-powerpoint'},
    'pptx': {'application/vnd.openxmlformats-officedocument.presentationml.presentation'},
    'txt':  {'text/plain'},
    'csv':  {'text/csv', 'text/plain'},
    'log':  {'text/plain'},
    'md':   {'text/plain', 'text/markdown'},
    'json': {'application/json', 'text/plain'},
    'xml':  {'application/xml', 'text/xml', 'text/plain'},
    'rtf':  {'application/rtf', 'text/rtf'},

    'png':  {'image/png'},
    'jpg':  {'image/jpeg'},
    'jpeg': {'image/jpeg'},
    'gif':  {'image/gif'},
    'webp': {'image/webp'},
    'bmp':  {'image/bmp', 'image/x-ms-bmp'},
    'svg':  {'image/svg+xml', 'text/plain'},

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
    """Проверяет расширение. Возвращает (ok, ext | None)."""
    if not filename or '.' not in filename:
        return False, None
    ext = filename.rsplit('.', 1)[1].lower()
    return (ext in allowed_ext), ext


def _verify_magic_bytes(file, ext):
    """
    Читает первые 2 КБ файла и определяет реальный MIME.
    Возвращает (ok: bool, real_mime: str | None, error: str | None).
    Не изменяет позицию указателя в конце — файл сбрасывается в начало.
    """
    if not HAS_MAGIC:
        return True, None, None  # проверка недоступна

    try:
        file.seek(0)
        head = file.read(2048)
        file.seek(0)
    except Exception as e:
        return False, None, f'Не удалось прочитать файл: {e}'

    if not head:
        return False, None, 'Файл пуст'

    try:
        real_mime = magic.from_buffer(head, mime=True)
    except Exception as e:
        log.warning(f'magic.from_buffer error: {e}')
        return True, None, None  # не блокируем, если magic сломался

    expected = _EXPECTED_MIMES.get(ext)
    if not expected:
        # Не знаем ожидаемый MIME — пропускаем
        return True, real_mime, None

    # Разрешаем text/plain как fallback для текстовых форматов
    if real_mime in expected:
        return True, real_mime, None

    # Иначе — несоответствие
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
    Возвращает dict с полями:
      ok, error, original_name, unique_name, rel_path, abs_path, size, mime
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

    if not file or not file.filename:
        result['error'] = 'Файл не выбран'
        return result

    ok, ext = validate_extension(file.filename, allowed_ext)
    if not ok:
        result['error'] = (
            f'Недопустимый формат. Разрешены: '
            f'{", ".join(sorted(allowed_ext))}'
        )
        return result

    # Размер
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)

    if size > max_size_bytes:
        mb = max_size_bytes // 1024 // 1024
        result['error'] = f'Файл слишком большой (макс. {mb} МБ)'
        return result

    # Проверка содержимого
    ok, real_mime, err = _verify_magic_bytes(file, ext)
    if not ok:
        log.warning(
            f'Magic bytes mismatch: {file.filename} '
            f'(ext={ext}, real={real_mime})'
        )
        result['error'] = err
        return result

    result['real_mime'] = real_mime

    # Сохранение
    original_name = file.filename
    unique_name = secure_filename(f'{uuid.uuid4().hex}.{ext}')
    if not unique_name:
        unique_name = f'{uuid.uuid4().hex}.{ext}'

    abs_path = os.path.join(target_folder, unique_name)
    os.makedirs(target_folder, exist_ok=True)
    file.save(abs_path)

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
    """Ищет реальный путь к файлу."""
    if not stored_path:
        return None

    stored_path = stored_path.strip()
    basename = os.path.basename(stored_path)

    candidates = []
    for folder in search_folders:
        candidates.append(os.path.join(folder, stored_path))
        candidates.append(os.path.join(folder, basename))

    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def delete_file_safe(path):
    """Удаляет файл, если он существует."""
    if not path:
        return False
    if not os.path.exists(path):
        return True
    try:
        os.remove(path)
        return True
    except Exception as e:
        log.warning(f'Не удалось удалить файл {path}: {e}')
        return False