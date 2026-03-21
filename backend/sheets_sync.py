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

# URL для экспорта листа в CSV (gid=0 — первый лист, gid=N — другой)
SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&id={sheet_id}"
SHEETS_CSV_URL_GID = "https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&id={sheet_id}&gid={gid}"

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
    "ингредиенты": "ingredients",
    "состав": "ingredients",
    "себестоимость": "cost_ingredients",
    "стоимость ингредиентов": "cost_ingredients",
    "ингредиенты (стоимость)": "cost_ingredients",
    "цена ингредиентов": "cost_ingredients",
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
    "ingredients": "ingredients",
    "cost_ingredients": "cost_ingredients",
}


def _parse_min_order(note: str, unit: str) -> int | float | None:
    """
    Извлекает минимальный заказ из примечания.
    Форматы: 'от 4шт', 'от 5 штук', 'от 1.5кг', 'от 10 шт', 'от 1.5 кг'
    """
    import re
    if not note:
        return None
    # Ищем паттерн "от X шт/штук/кг"
    m = re.search(r'от\s+(\d+(?:[.,]\d+)?)\s*(?:шт|штук|кг|kg)', note, re.IGNORECASE)
    if m:
        val = m.group(1).replace(',', '.')
        num = float(val)
        # Для штук — всегда целое
        if unit.strip().lower() != 'кг' and num == int(num):
            return int(num)
        return num
    return None


def _clean_note(note: str) -> str:
    """
    Убирает служебные пометки из примечания, чтобы они не показывались в карточке товара.
    Убирает: 'от Xшт', 'от Xкг', 'товар дня', 'сезон: весна' и т.п.
    """
    import re
    if not note:
        return ''
    cleaned = note
    # Убираем "от X шт/кг/штук"
    cleaned = re.sub(r'от\s+\d+(?:[.,]\d+)?\s*(?:шт|штук|кг|kg)\s*', '', cleaned, flags=re.IGNORECASE)
    # Убираем "товар дня"
    cleaned = re.sub(r'товар\s+дня\s*', '', cleaned, flags=re.IGNORECASE)
    # Убираем "сезон: весна/лето/осень/зима" (с возможными запятыми между сезонами)
    cleaned = re.sub(r'сезон\s*:\s*[\w\s,]+', '', cleaned, flags=re.IGNORECASE)
    # Убираем лишние разделители
    cleaned = re.sub(r'[,;]\s*[,;]', ',', cleaned)
    cleaned = re.sub(r'^[,;\s]+|[,;\s]+$', '', cleaned)
    return cleaned.strip()



def _parse_ingredients(raw: str) -> list[dict] | None:
    """
    Парсит строку ингредиентов: 'мука 500г, яйца 3шт, сахар 200г, молоко 300мл'
    Возвращает список: [{'name': 'мука', 'amount': 500, 'unit': 'г'}, ...]
    Количество — на 1 кг (для весовых) или на 1 шт (для штучных).

    Гибкий парсер — принимает разные форматы:
      мука 500г | мука 500 г | Мука 0.5кг | мука 0,5 кг
      яйца 3шт | яйца 3 шт | Яйца 3 штуки | яйца 3 штук
      молоко 300мл | молоко 0.3л | масло 50 гр | масло 50 грамм
    Разделитель: запятая или точка с запятой.
    """
    import re
    if not raw or not raw.strip():
        return None

    # Нормализация единиц
    unit_map = {
        'г': 'г', 'гр': 'г', 'грамм': 'г', 'граммов': 'г',
        'кг': 'кг', 'килограмм': 'кг', 'килограммов': 'кг',
        'шт': 'шт', 'штук': 'шт', 'штуки': 'шт', 'штука': 'шт',
        'мл': 'мл', 'миллилитров': 'мл', 'миллилитр': 'мл',
        'л': 'л', 'литр': 'л', 'литров': 'л', 'литра': 'л',
        'ст': 'ст', 'стакан': 'ст', 'стаканов': 'ст', 'стакана': 'ст',
        'ст.л': 'ст.л', 'ст. л': 'ст.л', 'ст.л.': 'ст.л',
        'ч.л': 'ч.л', 'ч. л': 'ч.л', 'ч.л.': 'ч.л',
    }

    items = []
    # Разделяем по запятой или точке с запятой
    for part in re.split(r'[,;]', raw):
        part = part.strip()
        if not part:
            continue
        # Паттерн: "название число единица" (гибкий)
        m = re.match(
            r'(.+?)\s+(\d+(?:[.,]\d+)?)\s*'
            r'(г|гр|грамм|граммов|кг|килограмм|килограммов|'
            r'шт|штук|штуки|штука|мл|миллилитров|миллилитр|'
            r'л|литр|литров|литра|ст\.?\s*л\.?|ч\.?\s*л\.?|ст|стакан|стаканов|стакана)\b\.?',
            part, re.IGNORECASE
        )
        if m:
            name = m.group(1).strip().capitalize()
            amount = float(m.group(2).replace(',', '.'))
            raw_unit = m.group(3).strip().lower().replace(' ', '').rstrip('.')
            unit = unit_map.get(raw_unit, raw_unit)
            items.append({'name': name, 'amount': amount, 'unit': unit})
        else:
            # Если формат не распознан — сохраняем как есть
            items.append({'name': part.strip().capitalize(), 'amount': 0, 'unit': ''})
    return items if items else None


def _parse_cost_price(raw: str) -> dict | None:
    """
    Парсит строку себестоимости ингредиентов.
    Формат: 'мука 500г - 150 р., яйца 3шт - 100, сахар 200г - 50'
    Разделитель позиций: запятая или точка с запятой.
    Разделитель цены: тире (-).
    Цена может быть: '150', '150р', '150 р.', '150 руб', '150 рублей', просто число.
    Возвращает: { 'items': [...], 'total': сумма }
    """
    import re
    if not raw or not raw.strip():
        return None

    items = []
    total = 0

    for part in re.split(r'[,;]', raw):
        part = part.strip()
        if not part:
            continue

        # Разделяем по последнему тире (- или —)
        pieces = re.split(r'\s*[-—]\s*', part)
        if len(pieces) >= 2:
            name_part = ' - '.join(pieces[:-1]).strip()  # всё до последнего тире
            price_part = pieces[-1].strip()
            # Извлекаем число из цены: "150 р.", "150руб", "150"
            m = re.search(r'(\d+(?:[.,]\d+)?)', price_part)
            if m:
                price = float(m.group(1).replace(',', '.'))
                items.append({'name': name_part, 'price': price})
                total += price
            else:
                items.append({'name': name_part, 'price': 0})
        else:
            # Нет тире — попробовать найти число в конце
            m = re.search(r'(\d+(?:[.,]\d+)?)\s*(?:р\.?|руб\.?|рублей)?\s*$', part)
            if m:
                price = float(m.group(1).replace(',', '.'))
                name_part = part[:m.start()].strip()
                items.append({'name': name_part or part, 'price': price})
                total += price
            else:
                items.append({'name': part, 'price': 0})

    if not items:
        return None
    return {'items': items, 'total': round(total, 2)}


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
        note_val = normalized.get("note", "")
        min_order = _parse_min_order(note_val, unit_val)
        display_note = _clean_note(note_val)
        item = {
            "id": item_id,
            "name": normalized.get("item_name", item_id),
            "unit": unit_val,
            **price_fields,
            "min_order": min_order,
            "note": display_note,
            "description": item_desc if item_desc else "",
        }
        ingredients = _parse_ingredients(normalized.get("ingredients", ""))
        if ingredients:
            item['ingredients'] = ingredients
        cost_data = _parse_cost_price(normalized.get("cost_ingredients", ""))
        if cost_data:
            item['cost_price'] = cost_data['total']
            item['cost_ingredients'] = cost_data['items']
        if photo_url:
            item["photo_url"] = photo_url

        categories[cat_key]["items"].append(item)

    return {
        "_comment": "Синхронизировано из Google Sheets",
        "_last_updated": __import__('datetime').datetime.now().strftime("%Y-%m-%d %H:%M"),
        "categories": list(categories.values())
    }


async def fetch_prices_from_sheet(sheet_id: str, gid: str | None = None) -> Optional[dict]:
    """Скачивает данные из Google Sheets (CSV) и возвращает структуру prices.json.
    gid — ID вкладки (None = первая вкладка)."""
    if gid:
        url = SHEETS_CSV_URL_GID.format(sheet_id=sheet_id, gid=gid)
    else:
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


async def _sync_one(sheet_id: str, prices_file: Path, photos_dir: Path,
                    gid: str | None = None, label: str = "основное") -> tuple[bool, str]:
    """Синхронизирует один лист из Google Sheets."""
    prices = await fetch_prices_from_sheet(sheet_id, gid=gid)

    if prices is None:
        return False, f"❌ Не удалось получить данные ({label})"

    items_count = sum(len(c['items']) for c in prices['categories'])

    if items_count == 0:
        return False, (f"⚠️ Таблица ({label}) пуста или неправильная структура. "
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
    return True, f"✅ {label.capitalize()}: {cats} кат., {items_count} товаров, {photo_count} новых фото"


async def sync_prices(sheet_id: str, prices_file: Path, photos_dir: Path,
                      extra_menus: list | None = None) -> tuple[bool, str]:
    """
    Скачивает данные из Google Sheets, кеширует фото и перезаписывает prices.json.
    extra_menus — список кортежей (key, file, gid, label) для доп. меню (постное, фуршетное и т.д.).
    Возвращает (успех, сообщение).
    """
    ok_main, msg_main = await _sync_one(sheet_id, prices_file, photos_dir, label="основное меню")

    messages = [msg_main]
    all_ok = ok_main

    for _key, extra_file, extra_gid, extra_label in (extra_menus or []):
        ok_extra, msg_extra = await _sync_one(sheet_id, extra_file, photos_dir,
                                              gid=extra_gid, label=extra_label)
        messages.append(msg_extra)
        if not ok_extra:
            all_ok = False

    return all_ok, "\n".join(messages)
