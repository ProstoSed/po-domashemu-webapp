"""
sheets_sync.py — синхронизация цен с Google Sheets через CSV-экспорт.
Не требует OAuth / API-ключей. Работает с любой публично доступной таблицей.

Портировано из src/sheets_sync.py + добавлено кеширование фото на VPS.
"""

import csv
import hashlib
import io
import json
import logging
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

# URL для экспорта первого листа в CSV
SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&id={sheet_id}"

# Маппинг русских заголовков → внутренние ключи
HEADER_MAP = {
    # Русские заголовки
    "категория (ключ)": "category_key",
    "категория": "category_name",
    "id товара": "item_id",
    "название": "item_name",
    "ед.изм.": "unit",
    "цена": "price",
    "примечание": "note",
    "фото url": "photo_url",
    "фото": "photo_url",
    "описание": "description",
    "описание категории": "category_description",
    # Английские заголовки (обратная совместимость)
    "category_key": "category_key",
    "category_name": "category_name",
    "item_id": "item_id",
    "item_name": "item_name",
    "unit": "unit",
    "price": "price",
    "note": "note",
    "photo_url": "photo_url",
    "photo url": "photo_url",
    "description": "description",
    "category_description": "category_description",
}


def _parse_price(price_str: str, unit: str) -> dict:
    """
    Разбирает строку цены из таблицы в поля prices.json.
    Форматы:
      '1200'          → price_kg=1200 или price_item=1200
      '1100-1400'     → price_kg_min=1100, price_kg_max=1400 (или item)
      'индивидуально' → price_note='индивидуально'
      ''              → price_note='договорная'
    """
    price_str = price_str.strip()
    is_kg = unit.strip().lower() == 'кг'

    if not price_str or price_str.lower() in ('нет', '-', 'тбд', 'tbd'):
        return {"price_note": "договорная"}

    if '-' in price_str:
        parts = price_str.split('-')
        try:
            lo = int(parts[0].strip())
            hi = int(parts[1].strip())
            if is_kg:
                return {"price_kg_min": lo, "price_kg_max": hi}
            else:
                return {"price_item_min": lo, "price_item_max": hi}
        except (ValueError, IndexError):
            pass

    try:
        val = int(price_str)
        if is_kg:
            return {"price_kg": val}
        else:
            return {"price_item": val}
    except ValueError:
        return {"price_note": price_str}


def _normalize_headers(fieldnames: list[str]) -> dict[str, str]:
    """Маппинг: оригинальное имя столбца → внутренний ключ."""
    mapping = {}
    for original in fieldnames:
        cleaned = original.strip().lower()
        if cleaned in HEADER_MAP:
            mapping[original] = HEADER_MAP[cleaned]
        else:
            mapping[original] = cleaned
    return mapping


def _get_extension(url: str) -> str:
    """Расширение файла из URL, по умолчанию .jpg."""
    path = urlparse(url).path.lower()
    for ext in ('.png', '.webp', '.gif', '.jpeg', '.jpg'):
        if path.endswith(ext):
            return ext
    return '.jpg'


def _normalize_photo_url(url: str) -> str:
    """
    Конвертирует share-ссылки облачных хранилищ в прямые URL для скачивания.
    Поддерживает Google Drive, Яндекс.Диск и обычные прямые ссылки.
    """
    url = url.strip()
    if not url:
        return ''

    # Google Drive: https://drive.google.com/file/d/FILE_ID/view → прямая ссылка
    if 'drive.google.com' in url:
        # Формат: /file/d/ID/... или /open?id=ID
        if '/file/d/' in url:
            file_id = url.split('/file/d/')[1].split('/')[0].split('?')[0]
            return f'https://drive.google.com/uc?export=view&id={file_id}'
        if 'id=' in url:
            file_id = url.split('id=')[1].split('&')[0]
            return f'https://drive.google.com/uc?export=view&id={file_id}'

    return url


def _csv_to_prices_json(csv_text: str) -> dict:
    """Конвертирует CSV из Google Sheets в структуру prices.json."""
    reader = csv.DictReader(io.StringIO(csv_text))

    if reader.fieldnames is None:
        raise ValueError("CSV пустой или нет заголовков")

    header_mapping = _normalize_headers(reader.fieldnames)
    mapped_keys = set(header_mapping.values())

    for required in ["category_key", "item_id", "item_name"]:
        if required not in mapped_keys:
            raise ValueError(f"В таблице нет обязательного столбца: '{required}'. "
                             f"Найдены: {reader.fieldnames}")

    categories: dict[str, dict] = {}

    for row in reader:
        normalized = {}
        for orig_key, value in row.items():
            if orig_key and orig_key in header_mapping:
                normalized[header_mapping[orig_key]] = (value or "").strip()

        cat_key = normalized.get("category_key", "").strip()
        item_id = normalized.get("item_id", "").strip()

        if not cat_key or not item_id or cat_key.startswith('#'):
            continue

        if cat_key not in categories:
            cat_desc = normalized.get("category_description", "").strip()
            categories[cat_key] = {
                "key": cat_key,
                "name": normalized.get("category_name", cat_key),
                "description": cat_desc if cat_desc else "",
                "items": []
            }

        unit_val = normalized.get("unit", "шт").strip()
        price_fields = _parse_price(normalized.get("price", ""), unit_val)

        # Фото URL (нормализуем ссылки Google Drive и т.д.)
        raw_photo = normalized.get("photo_url", "").strip()
        photo_url = _normalize_photo_url(raw_photo)

        item_desc = normalized.get("description", "").strip()
        item = {
            "id": item_id,
            "name": normalized.get("item_name", item_id),
            "unit": unit_val,
            **price_fields,
            "min_order": None,
            "note": normalized.get("note", ""),
            "description": item_desc if item_desc else "",
        }
        if photo_url:
            item["photo_url"] = photo_url

        categories[cat_key]["items"].append(item)

    return {
        "_comment": "Синхронизировано из Google Sheets",
        "_last_updated": __import__('datetime').datetime.now().strftime("%Y-%m-%d %H:%M"),
        "categories": list(categories.values())
    }


async def fetch_prices_from_sheet(sheet_id: str) -> Optional[dict]:
    """Скачивает данные из Google Sheets (CSV) и возвращает структуру prices.json."""
    url = SHEETS_CSV_URL.format(sheet_id=sheet_id)
    logger.info("Синхронизация с Google Sheets: %s", url)

    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            resp = await client.get(url, timeout=30.0)
            if resp.status_code != 200:
                logger.error("Google Sheets вернул статус %s", resp.status_code)
                return None
            csv_text = resp.content.decode('utf-8-sig')

        prices = _csv_to_prices_json(csv_text)
        count = sum(len(c['items']) for c in prices['categories'])
        logger.info("Получено %d категорий, %d товаров из Google Sheets",
                     len(prices['categories']), count)
        return prices

    except httpx.ConnectError:
        logger.error("Нет соединения с интернетом, Google Sheets недоступен")
        return None
    except Exception as e:
        logger.error("Ошибка синхронизации Google Sheets: %s", e, exc_info=True)
        return None


async def cache_photos(prices: dict, photos_dir: Path) -> int:
    """Скачивает фото по URL и кеширует на диске. Возвращает кол-во новых скачиваний."""
    photos_dir.mkdir(parents=True, exist_ok=True)
    downloaded = 0

    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        for cat in prices.get('categories', []):
            for item in cat.get('items', []):
                url = item.get('photo_url', '').strip()
                if not url:
                    continue

                ext = _get_extension(url)
                filename = hashlib.md5(url.encode()).hexdigest() + ext
                filepath = photos_dir / filename

                # Записываем имя файла в item (для фронтенда)
                item['photo_filename'] = filename

                if filepath.exists():
                    continue  # Уже скачано

                try:
                    resp = await client.get(url)
                    if resp.status_code == 200 and len(resp.content) > 100:
                        filepath.write_bytes(resp.content)
                        downloaded += 1
                        logger.info("Cached photo: %s (%d bytes)", filename, len(resp.content))
                    else:
                        logger.warning("Photo download failed (%s): %s", resp.status_code, url)
                except Exception as e:
                    logger.warning("Photo download error: %s - %s", url, e)

    return downloaded


async def sync_prices(sheet_id: str, prices_file: Path, photos_dir: Path) -> tuple[bool, str]:
    """
    Скачивает данные из Google Sheets, кеширует фото и перезаписывает prices.json.
    Возвращает (успех, сообщение).
    """
    prices = await fetch_prices_from_sheet(sheet_id)

    if prices is None:
        return False, "❌ Не удалось получить данные из Google Sheets"

    items_count = sum(len(c['items']) for c in prices['categories'])

    if items_count == 0:
        return False, ("⚠️ Таблица пуста или неправильная структура. "
                       "Убедитесь что первая строка — заголовки: "
                       "Категория (ключ), Категория, ID товара, Название, Ед.изм., Цена, Примечание")

    # Кешируем фото на VPS
    photo_count = await cache_photos(prices, photos_dir)

    # Backup старого файла
    if prices_file.exists():
        backup = prices_file.with_suffix('.json.bak')
        backup.write_text(prices_file.read_text(encoding='utf-8'), encoding='utf-8')

    # Записываем новый
    prices_file.write_text(
        json.dumps(prices, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )

    cats = len(prices['categories'])
    return True, f"✅ Синхронизировано: {cats} категорий, {items_count} товаров, {photo_count} новых фото"
