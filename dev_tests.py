# dev_tests.py
"""
Dev-консоль: запуск тестов через UI.
Запускает pytest в subprocess и парсит результат.
"""
import os
import re
import subprocess
import sys
from datetime import datetime

from flask import Blueprint, jsonify, request, session

from utils import role_required
from logger import get_logger
from constants import ROLE_ADMIN, ROLE_DEVELOPER

log = get_logger(__name__)

dev_tests_bp = Blueprint('dev_tests', __name__)

DEV_ROLES = (ROLE_ADMIN, ROLE_DEVELOPER)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TESTS_DIR = os.path.join(BASE_DIR, 'tests')

TEST_TIMEOUT = 180


# ============================================================
# СПИСОК ТЕСТОВ
# ============================================================

@dev_tests_bp.route('/api/dev/tests/list')
@role_required(*DEV_ROLES)
def list_tests():
    """Список тестовых файлов и функций в них."""
    try:
        if not os.path.isdir(TESTS_DIR):
            return jsonify({
                'tests_dir': TESTS_DIR,
                'exists': False,
                'files': [],
                'total_tests': 0,
            })

        files = []
        total = 0

        for fname in sorted(os.listdir(TESTS_DIR)):
            if not fname.startswith('test_') or not fname.endswith('.py'):
                continue

            full = os.path.join(TESTS_DIR, fname)
            try:
                with open(full, 'r', encoding='utf-8') as f:
                    content = f.read()
            except Exception:
                content = ''

            test_funcs = re.findall(
                r'^\s*def\s+(test_\w+)\s*\(', content, re.MULTILINE
            )

            files.append({
                'name': fname,
                'path': full,
                'test_count': len(test_funcs),
                'tests': test_funcs,
                'size': os.path.getsize(full),
            })
            total += len(test_funcs)

        return jsonify({
            'tests_dir': TESTS_DIR,
            'exists': True,
            'files': files,
            'total_tests': total,
        })
    except Exception as e:
        log.exception('dev_tests list error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# ЗАПУСК
# ============================================================

def _run_pytest(target):
    """Запускает pytest в subprocess, парсит результат."""
    args = [
        sys.executable, '-m', 'pytest',
        '-v', '--tb=short', '--color=no',
        '-p', 'no:cacheprovider',
    ]
    if target:
        args.append(target)

    started = datetime.now()
    try:
        proc = subprocess.run(
            args,
            cwd=BASE_DIR,
            capture_output=True,
            text=True,
            timeout=TEST_TIMEOUT,
            env={**os.environ, 'PYTHONIOENCODING': 'utf-8'},
        )
        stdout = proc.stdout or ''
        stderr = proc.stderr or ''
        returncode = proc.returncode
        timed_out = False
    except subprocess.TimeoutExpired as e:
        stdout = e.stdout or ''
        stderr = e.stderr or ''
        if isinstance(stdout, bytes):
            stdout = stdout.decode('utf-8', errors='replace')
        if isinstance(stderr, bytes):
            stderr = stderr.decode('utf-8', errors='replace')
        returncode = -1
        timed_out = True

    elapsed = (datetime.now() - started).total_seconds()

    return {
        'success': returncode == 0,
        'returncode': returncode,
        'timed_out': timed_out,
        'duration_sec': round(elapsed, 2),
        'stdout': stdout,
        'stderr': stderr,
        'summary': _parse_summary(stdout),
    }


def _parse_summary(output):
    result = {
        'passed': 0, 'failed': 0, 'errors': 0,
        'skipped': 0, 'total': 0, 'duration': None,
    }
    lines = output.strip().split('\n')
    for line in reversed(lines):
        if (' passed' in line or ' failed' in line or
                ' error' in line or ' skipped' in line):
            for kw, key in (('passed', 'passed'), ('failed', 'failed'),
                            ('error', 'errors'), ('skipped', 'skipped')):
                m = re.search(rf'(\d+)\s+{kw}', line)
                if m:
                    result[key] = int(m.group(1))
            m = re.search(r'in\s+([\d.]+)s', line)
            if m:
                result['duration'] = float(m.group(1))
            break

    result['total'] = (
        result['passed'] + result['failed'] +
        result['errors'] + result['skipped']
    )
    return result


@dev_tests_bp.route('/api/dev/tests/run', methods=['POST'])
@role_required(*DEV_ROLES)
def run_tests():
    """
    Запускает тесты.
    Body:
      { scope: 'all' }
      { scope: 'file', file: 'test_users_api.py' }
      { scope: 'test', file_for_test: '...', test: 'test_create_user' }
    """
    try:
        data = request.get_json(silent=True) or {}
        scope = (data.get('scope') or 'all').strip()

        target = None

        if scope == 'all':
            target = TESTS_DIR
        elif scope == 'file':
            fname = (data.get('file') or '').strip()
            if not fname:
                return jsonify({
                    'success': False, 'error': 'Не указан file',
                }), 400
            if any(c in fname for c in ('/', '\\', '..')):
                return jsonify({
                    'success': False, 'error': 'Недопустимое имя файла',
                }), 400
            target = os.path.join(TESTS_DIR, fname)
            if not os.path.isfile(target):
                return jsonify({
                    'success': False, 'error': 'Файл не найден',
                }), 404
        elif scope == 'test':
            fname = (data.get('file_for_test') or '').strip()
            test_name = (data.get('test') or '').strip()
            if not fname or not test_name:
                return jsonify({
                    'success': False, 'error': 'Нужны file_for_test и test',
                }), 400
            if (any(c in fname for c in ('/', '\\', '..'))
                    or not re.match(r'^test_\w+$', test_name)):
                return jsonify({
                    'success': False, 'error': 'Недопустимое имя',
                }), 400
            target = f'{os.path.join(TESTS_DIR, fname)}::{test_name}'
        else:
            return jsonify({
                'success': False, 'error': 'Неверный scope',
            }), 400

        log.info(
            f'[DEV] [{session.get("user_login")}] Запуск тестов: {target}'
        )

        result = _run_pytest(target)

        s = result['summary']
        log.info(
            f'[DEV] Тесты завершены за {result["duration_sec"]}s: '
            f'{s["passed"]} passed, {s["failed"]} failed, '
            f'{s["errors"]} errors'
        )

        return jsonify(result)
    except Exception as e:
        log.exception('dev_tests run error')
        return jsonify({'success': False, 'error': str(e)}), 500