# tests/test_validators.py
"""Тесты валидаторов."""
import pytest

from validators import (
    validate_login,
    validate_password,
    validate_email,
    validate_phone,
    validate_ip,
    validate_required,
    validate_length,
    validate_choice,
    validate_file_extension,
)


# ============================================================
# LOGIN
# ============================================================

class TestValidateLogin:
    def test_valid(self):
        assert validate_login('admin') == (True, None)
        assert validate_login('user_123') == (True, None)
        assert validate_login('a.b-c') == (True, None)

    def test_too_short(self):
        ok, err = validate_login('ab')
        assert not ok
        assert 'минимум 3' in err

    def test_too_long(self):
        ok, err = validate_login('a' * 51)
        assert not ok
        assert '50' in err

    def test_empty(self):
        ok, err = validate_login('')
        assert not ok
        assert 'обязателен' in err

    def test_none(self):
        ok, err = validate_login(None)
        assert not ok

    def test_cyrillic_forbidden(self):
        ok, err = validate_login('админ')
        assert not ok

    def test_spaces_forbidden(self):
        ok, err = validate_login('user name')
        assert not ok

    def test_stripped(self):
        """Пробелы по краям обрезаются и не ломают валидацию."""
        assert validate_login('  admin  ') == (True, None)


# ============================================================
# PASSWORD
# ============================================================

class TestValidatePassword:
    def test_valid(self):
        assert validate_password('secret123') == (True, None)
        assert validate_password('a' * 6) == (True, None)

    def test_too_short(self):
        ok, err = validate_password('12345')
        assert not ok
        assert 'минимум 6' in err

    def test_custom_min(self):
        ok, err = validate_password('123', min_length=3)
        assert ok

    def test_empty(self):
        ok, err = validate_password('')
        assert not ok

    def test_none(self):
        ok, err = validate_password(None)
        assert not ok

    def test_too_long(self):
        ok, err = validate_password('a' * 201)
        assert not ok


# ============================================================
# EMAIL
# ============================================================

class TestValidateEmail:
    def test_valid(self):
        assert validate_email('user@example.com') == (True, None)
        assert validate_email('a.b+c@sub.domain.ru') == (True, None)

    def test_empty_is_ok(self):
        """Пустой email — валидно (необязательное поле)."""
        assert validate_email('') == (True, None)
        assert validate_email(None) == (True, None)

    def test_invalid(self):
        ok, err = validate_email('not-an-email')
        assert not ok

    def test_missing_domain(self):
        ok, err = validate_email('user@')
        assert not ok


# ============================================================
# PHONE
# ============================================================

class TestValidatePhone:
    def test_valid(self):
        assert validate_phone('+7-999-123-45-67') == (True, None)
        assert validate_phone('89991234567') == (True, None)
        assert validate_phone('(495) 123-45-67') == (True, None)

    def test_empty_is_ok(self):
        assert validate_phone('') == (True, None)
        assert validate_phone(None) == (True, None)

    def test_invalid(self):
        ok, err = validate_phone('phone')
        assert not ok


# ============================================================
# IP
# ============================================================

class TestValidateIp:
    def test_valid(self):
        assert validate_ip('192.168.1.1') == (True, None)
        assert validate_ip('10.0.0.1') == (True, None)
        assert validate_ip('255.255.255.255') == (True, None)

    def test_empty_is_ok(self):
        assert validate_ip('') == (True, None)
        assert validate_ip(None) == (True, None)

    def test_invalid_format(self):
        ok, err = validate_ip('192.168.1')
        assert not ok

    def test_out_of_range(self):
        ok, err = validate_ip('192.168.1.256')
        assert not ok


# ============================================================
# REQUIRED
# ============================================================

class TestValidateRequired:
    def test_valid(self):
        assert validate_required('text') == (True, None)
        assert validate_required('  text  ') == (True, None)

    def test_empty(self):
        ok, err = validate_required('')
        assert not ok

    def test_none(self):
        ok, err = validate_required(None)
        assert not ok

    def test_whitespace(self):
        ok, err = validate_required('   ')
        assert not ok

    def test_custom_field_name(self):
        ok, err = validate_required(None, 'Email')
        assert not ok
        assert 'Email' in err


# ============================================================
# LENGTH
# ============================================================

class TestValidateLength:
    def test_valid(self):
        assert validate_length('abc', 'Поле', min_len=1, max_len=10) == (True, None)

    def test_too_short(self):
        ok, err = validate_length('ab', 'Поле', min_len=5)
        assert not ok
        assert 'минимум 5' in err

    def test_too_long(self):
        ok, err = validate_length('a' * 11, 'Поле', max_len=10)
        assert not ok
        assert '10' in err


# ============================================================
# CHOICE
# ============================================================

class TestValidateChoice:
    def test_valid(self):
        assert validate_choice('A', ['A', 'B', 'C']) == (True, None)

    def test_invalid(self):
        ok, err = validate_choice('X', ['A', 'B'], 'Статус')
        assert not ok
        assert 'Статус' in err


# ============================================================
# FILE EXTENSION
# ============================================================

class TestValidateFileExtension:
    def test_valid(self):
        assert validate_file_extension('doc.pdf', {'pdf', 'docx'}) == (True, None)
        assert validate_file_extension('doc.PDF', {'pdf'}) == (True, None)

    def test_invalid_ext(self):
        ok, err = validate_file_extension('script.exe', {'pdf', 'docx'})
        assert not ok

    def test_no_ext(self):
        ok, err = validate_file_extension('noext', {'pdf'})
        assert not ok