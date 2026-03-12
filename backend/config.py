"""Конфигурация webapp-bot backend."""
import json
import os
from pathlib import Path
from dotenv import load_dotenv

# Загружаем .env из папки backend/
BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / '.env')

BOT_TOKEN: str = os.environ['BOT_TOKEN']
MAIN_CHAT_ID: int = int(os.getenv('MAIN_CHAT_ID') or os.getenv('MAIN_CHAT_ID', '0'))
WEBAPP_URL: str = os.environ['WEBAPP_URL']

# Список ID всех администраторов (мама + дополнительные).
# В .env задаётся через ADMIN_IDS=111,222,333 (через запятую).
# Если не задано — только мама.
_admin_ids_raw = os.getenv('ADMIN_IDS', '')
ADMIN_IDS: set[int] = {MAIN_CHAT_ID}
if _admin_ids_raw.strip():
    for _id in _admin_ids_raw.split(','):
        _id = _id.strip()
        if _id.lstrip('-').isdigit():
            ADMIN_IDS.add(int(_id))

# Пути к файлам данных (относительно webapp-bot/backend/)
_prices_path = os.getenv('PRICES_FILE', '../../data/prices.json')
PRICES_FILE: Path = (BASE_DIR / _prices_path).resolve()

_orders_path = os.getenv('ORDERS_FILE', '../../data/orders_backup.json')
ORDERS_FILE: Path = (BASE_DIR / _orders_path).resolve()

_users_path = os.getenv('USERS_FILE', '../../data/users.json')
USERS_FILE: Path = (BASE_DIR / _users_path).resolve()

_photo_requests_path = os.getenv('PHOTO_REQUESTS_FILE', '../../data/photo_requests.json')
PHOTO_REQUESTS_FILE: Path = (BASE_DIR / _photo_requests_path).resolve()

_holidays_path = os.getenv('HOLIDAYS_FILE', '../../data/holidays.json')
HOLIDAYS_FILE: Path = (BASE_DIR / _holidays_path).resolve()

_photos_dir = os.getenv('PHOTOS_DIR', '../../data/photos')
PHOTOS_DIR: Path = (BASE_DIR / _photos_dir).resolve()
PHOTOS_DIR.mkdir(parents=True, exist_ok=True)

_admins_path = os.getenv('ADMINS_FILE', '../../data/admins.json')
ADMINS_FILE: Path = (BASE_DIR / _admins_path).resolve()

GOOGLE_SHEET_ID: str = os.getenv('GOOGLE_SHEET_ID', '13N8s8Bl3J_LFt_j96nZX-kUgXJ4nKq5gWj8u4U2PgfQ')
LENTEN_SHEET_GID: str = os.getenv('LENTEN_SHEET_GID', '1656336604')

# Постное меню — отдельный JSON
_lenten_path = os.getenv('LENTEN_PRICES_FILE', '../../data/lenten_prices.json')
LENTEN_PRICES_FILE: Path = (BASE_DIR / _lenten_path).resolve()

# Автосоздание папки data/ и пустых JSON-файлов (для Render и свежих серверов)
_DATA_FILES = {
    ORDERS_FILE: [],
    USERS_FILE: {'users': {}},
    PHOTO_REQUESTS_FILE: {'requests': {}},
    HOLIDAYS_FILE: {'holidays': {}},
    ADMINS_FILE: {'admins': []},
}
for _path, _default in _DATA_FILES.items():
    _path.parent.mkdir(parents=True, exist_ok=True)
    if not _path.exists():
        _path.write_text(json.dumps(_default, ensure_ascii=False, indent=2), encoding='utf-8')

# AI-помощник (FreeQwenApi прокси)
QWEN_PROXY_URL: str = os.getenv('QWEN_PROXY_URL', 'http://localhost:3264')
QWEN_MODEL: str = os.getenv('QWEN_MODEL', 'qwen-max-latest')

# Режим локальной разработки: пропускает HMAC-проверку initData.
# Включить: добавить DEV_MODE=true в .env
# В продакшне (Telegram) НЕ включать!
DEV_MODE: bool = os.getenv('DEV_MODE', '').lower() in ('1', 'true', 'yes')
# Какой user_id подставлять в DEV_MODE (свой или мамин для теста админки)
DEV_USER_ID: int = int(os.getenv('DEV_USER_ID', '5541118089'))
