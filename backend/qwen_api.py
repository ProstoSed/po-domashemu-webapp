"""
qwen_api.py — интеграция с FreeQwenApi прокси для AI-помощника.

Отправляет запрос пользователя + контекст меню → получает рекомендации
с конкретными товарами из нашего ассортимента.
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

import httpx

from config import (QWEN_PROXY_URL, QWEN_MODEL, PRICES_FILE,
                    LENTEN_PRICES_FILE, HOLIDAYS_FILE)

logger = logging.getLogger(__name__)

# Московское время (UTC+3)
MSK = timezone(timedelta(hours=3))

# ── Контекст для промпта ────────────────────────────────────────────────────

def _get_time_context() -> dict:
    """Собирает временной контекст: дата, сезон, время суток, праздники."""
    now = datetime.now(MSK)

    # Сезон
    month = now.month
    if month in (12, 1, 2):
        season = "зима"
    elif month in (3, 4, 5):
        season = "весна"
    elif month in (6, 7, 8):
        season = "лето"
    else:
        season = "осень"

    # Время суток
    hour = now.hour
    if 5 <= hour < 12:
        time_of_day = "утро"
    elif 12 <= hour < 17:
        time_of_day = "день"
    elif 17 <= hour < 22:
        time_of_day = "вечер"
    else:
        time_of_day = "ночь"

    # День недели
    weekdays = ["понедельник", "вторник", "среда", "четверг",
                "пятница", "суббота", "воскресенье"]
    weekday = weekdays[now.weekday()]

    # Ближайшие праздники из holidays.json
    upcoming_holidays = []
    try:
        if HOLIDAYS_FILE.exists():
            holidays_data = json.loads(HOLIDAYS_FILE.read_text(encoding='utf-8'))
            today_str = now.strftime("%d.%m")
            for h in holidays_data.get('holidays', []):
                date_str = h.get('date', '')
                if date_str:
                    # Формат DD.MM или DD.MM.YYYY
                    parts = date_str.split('.')
                    if len(parts) >= 2:
                        hday, hmonth = int(parts[0]), int(parts[1])
                        try:
                            holiday_date = now.replace(month=hmonth, day=hday)
                        except ValueError:
                            continue
                        # В пределах 14 дней
                        delta = (holiday_date - now).days
                        if 0 <= delta <= 14:
                            upcoming_holidays.append(
                                f"{h.get('name', date_str)} ({date_str}, через {delta} дн.)"
                            )
    except Exception:
        pass

    # Определение поста (упрощённое — Великий пост ~48 дней до Пасхи)
    is_lenten = False
    lenten_note = ""
    # Простая проверка: если есть постное меню — упоминаем
    if LENTEN_PRICES_FILE.exists():
        lenten_note = "У нас есть постное меню — предлагай постные варианты если уместно."

    return {
        "date": now.strftime("%d.%m.%Y"),
        "time": now.strftime("%H:%M"),
        "weekday": weekday,
        "season": season,
        "time_of_day": time_of_day,
        "upcoming_holidays": upcoming_holidays,
        "lenten_note": lenten_note,
    }


def _format_menu_for_prompt(prices: dict, label: str = "Основное меню") -> str:
    """Форматирует prices.json в текст для промпта."""
    lines = [f"\n=== {label} ==="]
    for cat in prices.get('categories', []):
        lines.append(f"\nКатегория: {cat['name']}")
        if cat.get('description'):
            lines.append(f"  Описание: {cat['description']}")
        for item in cat.get('items', []):
            price_str = ""
            if item.get('price_kg'):
                price_str = f"{item['price_kg']}₽/кг"
            elif item.get('price_item'):
                price_str = f"{item['price_item']}₽/шт"
            elif item.get('price_kg_min') and item.get('price_kg_max'):
                price_str = f"{item['price_kg_min']}-{item['price_kg_max']}₽/кг"
            elif item.get('price_item_min') and item.get('price_item_max'):
                price_str = f"{item['price_item_min']}-{item['price_item_max']}₽/шт"
            elif item.get('price_note'):
                price_str = item['price_note']
            else:
                price_str = "цена уточняется"

            desc = ""
            if item.get('description'):
                desc = f" — {item['description'][:80]}"

            lines.append(f"  - {item['name']} ({price_str}, {item.get('unit', 'шт')}){desc}")
            lines.append(f"    [category_key={cat['key']}, item_id={item['id']}, source={label}]")

    return "\n".join(lines)


def _load_menu_context() -> str:
    """Загружает оба меню и форматирует для промпта."""
    parts = []

    if PRICES_FILE.exists():
        try:
            prices = json.loads(PRICES_FILE.read_text(encoding='utf-8'))
            parts.append(_format_menu_for_prompt(prices, "main"))
        except Exception:
            parts.append("(Основное меню недоступно)")

    if LENTEN_PRICES_FILE.exists():
        try:
            lenten = json.loads(LENTEN_PRICES_FILE.read_text(encoding='utf-8'))
            parts.append(_format_menu_for_prompt(lenten, "lenten"))
        except Exception:
            pass

    return "\n".join(parts)


def _build_system_prompt() -> str:
    """Собирает полный системный промпт с контекстом."""
    ctx = _get_time_context()
    menu = _load_menu_context()

    holidays_text = ""
    if ctx["upcoming_holidays"]:
        holidays_text = f"\nБлижайшие праздники: {', '.join(ctx['upcoming_holidays'])}"

    return f"""Ты — дружелюбный помощник домашней пекарни «По-домашнему» из д. Зимёнки (Нижегородская область).
Хозяйка — Надежда, она готовит всё вручную из натуральных продуктов, с любовью и заботой.

СЕГОДНЯ: {ctx['date']} ({ctx['weekday']}), {ctx['time_of_day']}, сезон: {ctx['season']}.{holidays_text}
{ctx['lenten_note']}

ТВОЯ ЗАДАЧА:
1. Понять что хочет клиент (повод, количество гостей, бюджет, предпочтения)
2. Рекомендовать КОНКРЕТНЫЕ позиции из НАШЕГО МЕНЮ (не выдумывать!)
3. Объяснить ПОЧЕМУ именно это — хороший выбор сейчас (сезон, праздник, сочетание)
4. Указать примерную стоимость

ПРАВИЛА:
- Рекомендуй ТОЛЬКО то, что есть в меню ниже. Ничего не выдумывай!
- Для каждого рекомендованного товара ОБЯЗАТЕЛЬНО укажи тег: [product: category_key=..., item_id=..., source=...]
- source — это "main" для основного меню или "lenten" для постного
- Будь тёплым, как домашняя выпечка. Общайся просто и по-дружески.
- Если спрашивают про доставку: самовывоз из д. Зимёнки бесплатно, доставка по Кстово и Нижнему от 200₽
- Если клиент не указал повод — предложи актуальное для сезона/праздника
- Отвечай на русском, кратко (3-5 рекомендаций максимум)

ФОРМАТ ОТВЕТА:
Сначала текст рекомендации, затем для каждого товара строка:
[product: category_key=XXX, item_id=YYY, source=ZZZ]

{menu}"""


# ── Парсинг ответа ───────────────────────────────────────────────────────────

def _parse_product_tags(text: str) -> tuple[str, list[dict]]:
    """Извлекает теги [product: ...] из ответа и возвращает (чистый текст, список товаров)."""
    import re
    products = []
    pattern = r'\[product:\s*category_key=([^,]+),\s*item_id=([^,]+),\s*source=([^\]]+)\]'

    seen = set()
    for match in re.finditer(pattern, text):
        key = (match.group(1).strip(), match.group(2).strip())
        if key in seen:
            continue
        seen.add(key)
        products.append({
            "category_key": key[0],
            "item_id": key[1],
            "source": match.group(3).strip(),
        })

    # Убираем теги из текста для отображения
    clean_text = re.sub(pattern, '', text).strip()
    # Убираем пустые строки подряд
    clean_text = re.sub(r'\n{3,}', '\n\n', clean_text)

    return clean_text, products


# ── Публичный API ────────────────────────────────────────────────────────────

async def ask_assistant(user_message: str) -> dict:
    """
    Отправляет запрос пользователя в Qwen и возвращает рекомендации.

    Returns:
        {
            "text": "Текст рекомендации (без тегов)",
            "products": [{"category_key": "...", "item_id": "...", "source": "main|lenten"}],
            "error": null | "сообщение об ошибке"
        }
    """
    system_prompt = _build_system_prompt()

    payload = {
        "model": QWEN_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{QWEN_PROXY_URL}/api/v1/chat/completions",
                json=payload,
            )

            if resp.status_code != 200:
                logger.error("Qwen API error: %s %s", resp.status_code, resp.text[:200])
                return {
                    "text": None,
                    "products": [],
                    "error": "Помощник временно недоступен. Попробуйте позже.",
                }

            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

            if not content:
                return {
                    "text": None,
                    "products": [],
                    "error": "Помощник не смог сформировать ответ. Попробуйте другой вопрос.",
                }

            text, products = _parse_product_tags(content)

            return {
                "text": text,
                "products": products,
                "error": None,
            }

    except httpx.ConnectError:
        logger.error("Qwen proxy unavailable at %s", QWEN_PROXY_URL)
        return {
            "text": None,
            "products": [],
            "error": "Помощник временно недоступен. Попробуйте позже.",
        }
    except httpx.TimeoutException:
        logger.error("Qwen proxy timeout")
        return {
            "text": None,
            "products": [],
            "error": "Помощник думает слишком долго. Попробуйте ещё раз.",
        }
    except Exception as e:
        logger.error("Qwen API unexpected error: %s", e, exc_info=True)
        return {
            "text": None,
            "products": [],
            "error": "Произошла ошибка. Попробуйте позже.",
        }
