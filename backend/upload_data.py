"""
Скрипт для загрузки локальных JSON-данных на удалённый сервер.
Использует эндпоинт POST /api/admin/import-data.

Запуск:
    python upload_data.py
"""
import json
import os
import httpx
from pathlib import Path
from dotenv import load_dotenv

# Загружаем BOT_TOKEN из .env
load_dotenv(Path(__file__).parent / '.env')
BOT_TOKEN = os.environ['BOT_TOKEN']

# URL сервера на Claw Cloud
SERVER = 'https://fcfizckprrgh.eu-central-1.clawcloudrun.com'

# Локальные файлы данных
DATA_DIR = Path(__file__).parent.parent.parent / 'data'

FILES = {
    'orders': DATA_DIR / 'orders_backup.json',
    'users': DATA_DIR / 'users.json',
    'photo_requests': DATA_DIR / 'photo_requests.json',
    'holidays': DATA_DIR / 'holidays.json',
}


def upload():
    for key, path in FILES.items():
        if not path.exists():
            print(f'  SKIP {key}: файл {path} не найден')
            continue

        raw = path.read_text(encoding='utf-8')
        data = json.loads(raw)
        print(f'  Загружаю {key} ({path.name}, {len(raw)} байт)...')

        r = httpx.post(
            f'{SERVER}/api/admin/import-data',
            json={'file_key': key, 'data': data},
            headers={'X-Import-Secret': BOT_TOKEN},
            timeout=30.0,
        )
        if r.status_code == 200:
            print(f'  OK: {r.json()}')
        else:
            print(f'  ОШИБКА {r.status_code}: {r.text}')


if __name__ == '__main__':
    print(f'Сервер: {SERVER}')
    print(f'Данные: {DATA_DIR}\n')
    upload()
    print('\nГотово!')
