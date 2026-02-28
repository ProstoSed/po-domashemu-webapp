"""Конфигурация webapp-bot backend."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Загружаем .env из папки backend/
BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / '.env')

BOT_TOKEN: str = os.environ['BOT_TOKEN']
MAMA_CHAT_ID: int = int(os.environ['MAMA_CHAT_ID'])
WEBAPP_URL: str = os.environ['WEBAPP_URL']

# Список ID всех администраторов (мама + дополнительные).
# В .env задаётся через ADMIN_IDS=111,222,333 (через запятую).
# Если не задано — только мама.
_admin_ids_raw = os.getenv('ADMIN_IDS', '')
ADMIN_IDS: set[int] = {MAMA_CHAT_ID}
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
