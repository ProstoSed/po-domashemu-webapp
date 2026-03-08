"""
webapp-bot/backend/api.py

FastAPI сервер.

Публичные эндпоинты:
  GET  /health
  GET  /api/prices
  POST /api/geocode             — геокодирование адреса + цена доставки

Авторизованные (X-Init-Data):
  GET  /api/orders/my                         — мои заказы
  GET  /api/photo-requests/my                 — мои запросы на фото
  POST /api/photo-requests                    — создать запрос на фото

Админ (X-Init-Data от мамы):
  GET  /api/admin/orders
  PATCH /api/admin/orders/{id}/status
  POST /api/admin/orders/{id}/close
  DELETE /api/admin/orders/{id}
  GET  /api/admin/stats
  GET  /api/admin/users
  GET  /api/admin/photo-requests
  POST /api/admin/photo-requests/{id}/fulfill — выполнить (загрузить фото)
  POST /api/admin/photo-requests/{id}/reject  — отклонить
  GET  /api/admin/reminders                   — праздники + «спящие» клиенты
  POST /api/admin/remind-sleeping             — напомнить спящим
  POST /api/admin/broadcast
"""
import hashlib
import hmac
import json
import logging
import math
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl

import httpx
from fastapi import FastAPI, HTTPException, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from fastapi.responses import FileResponse

from config import PRICES_FILE, ORDERS_FILE, BOT_TOKEN, ADMIN_IDS, USERS_FILE, PHOTO_REQUESTS_FILE, HOLIDAYS_FILE, PHOTOS_DIR, GOOGLE_SHEET_ID, DEV_MODE, DEV_USER_ID, MAMA_CHAT_ID, ADMINS_FILE

log = logging.getLogger(__name__)
app = FastAPI(title='По-домашнему API', version='1.3')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['*'],
)

# ── Координаты д. Зимёнки ──────────────────────────────────────────────────
ZIMENKI_LAT = 56.1569
ZIMENKI_LON = 44.2646

# ── Допустимые статусы заказов ─────────────────────────────────────────────
VALID_STATUSES = {'new', 'accepted', 'cooking', 'delivery', 'ready', 'closed'}


# ──────────────────────────────────────────────
# Pydantic модели
# ──────────────────────────────────────────────

class StatusUpdate(BaseModel):
    status: str


class BroadcastBody(BaseModel):
    text: str


class GeocodeBody(BaseModel):
    address: str


class PhotoRequestBody(BaseModel):
    item_key: str
    item_id: str
    item_name: str


class RemindBody(BaseModel):
    text: str


class AddAdminBody(BaseModel):
    user_id: int | None = None
    username: str | None = None
    first_name: str | None = None


# ──────────────────────────────────────────────
# Вспомогательные функции
# ──────────────────────────────────────────────

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Расстояние по прямой между двумя точками (км)."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(max(0.0, a)))


def calc_delivery_price(distance_km: float) -> int:
    """20 ₽/км, минимум 200 ₽, округление до 50 ₽."""
    raw = max(200, round(distance_km * 20))
    return int(round(raw / 50) * 50)


def normalize_address(address: str) -> str:
    """
    Нормализует адрес: исправляет типичные ошибки пользователей.
    Портировано из src/geo_utils.py.
    """
    import re

    s = address.strip()

    # 1. Замена «нижний новгород» и сокращений
    nn = 'Нижний Новгород'
    s = re.sub(r'\bн\.?\s*н(?:овгород)?\b', nn, s, flags=re.IGNORECASE)
    s = re.sub(r'\bниж(?:ний)?\s+новгород\b', nn, s, flags=re.IGNORECASE)
    s = re.sub(r'\bнижний\b(?!\s+Новгород)', nn, s, flags=re.IGNORECASE)
    s = re.sub(r'Нижний\s+Новгород\s+Новгород', nn, s)

    # 2. Капитализация известных городов
    for city in ['кстово', 'зимёнки', 'зименки', 'богородск', 'дзержинск',
                 'балахна', 'бор', 'семёнов', 'арзамас']:
        s = re.sub(r'\b' + city + r'\b', city.capitalize(), s, flags=re.IGNORECASE)

    # 3. Сокращаем полные слова: «квартира» → «кв», «корпус» → «кор» и т.д.
    s = re.sub(r'\bквартира\s*', 'кв ', s, flags=re.IGNORECASE)
    s = re.sub(r'\bкорпус\s*', 'кор ', s, flags=re.IGNORECASE)
    s = re.sub(r'\bстроение\s*', 'стр ', s, flags=re.IGNORECASE)
    s = re.sub(r'\bофис\s*', 'оф ', s, flags=re.IGNORECASE)
    s = re.sub(r'\bулица\s*', 'ул ', s, flags=re.IGNORECASE)
    s = re.sub(r'\bпроспект\s*', 'пр ', s, flags=re.IGNORECASE)
    s = re.sub(r'\bпереулок\s*', 'пер ', s, flags=re.IGNORECASE)

    # 3a. Вставить пробел между сокращением и числом: «д15» → «д 15»
    s = re.sub(
        r'\b(ул|пр|пр-т|пл|д|кв|кор|корп|стр|оф|мкр|б-р|пер|ш|наб|туп|г|с|пос|р-н)(\d)',
        r'\1 \2',
        s, flags=re.IGNORECASE
    )

    # 3b. Точки после сокращений: «д 39» → «д. 39»
    s = re.sub(
        r'\b(ул|пр|пр-т|пл|д|кв|кор|корп|стр|оф|мкр|б-р|пер|ш|наб|туп|г|с|пос|р-н)\s+',
        lambda m: m.group(1) + '. ',
        s, flags=re.IGNORECASE
    )

    # 4. Уборка множественных точек и пробелов
    s = re.sub(r'\.{2,}', '.', s)
    s = re.sub(r'\s{2,}', ' ', s)
    s = re.sub(r',\s*,', ',', s)

    # 5. Добавляем запятые между частями
    parts = re.split(r'\s*,\s*', s)
    parts = [p.strip() for p in parts if p.strip()]
    result = []
    for part in parts:
        part = re.sub(
            r'(ул\.|пр\.|пр-т\.|пл\.)\s+([А-Яа-яёЁA-Za-z0-9\-]+)\s+(\d+)',
            r'\1 \2, д. \3', part
        )
        result.append(part)
    s = ', '.join(result)

    # 6. Капитализация первого символа каждой части
    parts = s.split(', ')
    parts = [p[0].upper() + p[1:] if p else p for p in parts]
    s = ', '.join(parts)

    return s.strip(' ,')


def _strip_apartment_info(address: str) -> tuple[str, str]:
    """
    Извлекает из адреса информацию о квартире/корпусе/строении/офисе.
    Возвращает (чистый_адрес, суффикс_для_отображения).
    Формат «10/5» (дом/корпус) НЕ трогаем — Nominatim понимает.
    """
    import re

    suffixes = []
    clean = address

    # Паттерны: кв. 5, кор. 2, стр. 3, оф. 10
    patterns = [
        (r'\b(?:кв|квартира)\.?\s*(\d+)', 'кв. '),
        (r'\b(?:кор|корп|корпус)\.?\s*(\d+)', 'кор. '),
        (r'\b(?:стр|строение)\.?\s*(\d+)', 'стр. '),
        (r'\b(?:оф|офис)\.?\s*(\d+)', 'оф. '),
    ]

    for pattern, prefix in patterns:
        m = re.search(pattern, clean, re.IGNORECASE)
        if m:
            suffixes.append(f'{prefix}{m.group(1)}')
            # Убираем из адреса (вместе с возможной запятой перед/после)
            clean = re.sub(r',?\s*' + pattern + r'\s*,?', '', clean, flags=re.IGNORECASE)

    # Чистим возможные двойные запятые и пробелы
    clean = re.sub(r',\s*,', ',', clean)
    clean = re.sub(r'\s{2,}', ' ', clean)
    clean = clean.strip(' ,')

    suffix = ', '.join(suffixes)
    return clean, suffix


async def get_road_distance_osrm(
    lat1: float, lon1: float,
    lat2: float, lon2: float,
    timeout: float = 5.0
) -> float | None:
    """
    Расстояние по дороге через OSRM (бесплатно, без ключа).
    Портировано из src/geo_utils.py.
    """
    url = (
        f"http://router.project-osrm.org/route/v1/driving/"
        f"{lon1},{lat1};{lon2},{lat2}"
    )
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url, params={"overview": "false", "steps": "false"})
            data = r.json()
            if data.get("code") != "Ok":
                return None
            routes = data.get("routes", [])
            if not routes:
                return None
            return round(routes[0].get("distance", 0) / 1000, 1)
    except Exception as exc:
        log.debug('OSRM недоступен: %s', exc)
        return None


def verify_initdata(init_data: str) -> dict | None:
    """
    Проверяет Telegram initData (HMAC-SHA256).
    Возвращает dict пользователя или None если подпись неверна.
    В DEV_MODE при пустом init_data возвращает мок-пользователя.
    """
    if DEV_MODE and not init_data:
        log.debug('DEV_MODE: пропуск проверки initData, user_id=%s', DEV_USER_ID)
        return {'id': DEV_USER_ID, 'first_name': 'Dev', 'username': 'dev'}
    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = parsed.pop('hash', None)
        if not received_hash:
            return None

        data_check_string = '\n'.join(
            f'{k}={v}' for k, v in sorted(parsed.items())
        )
        secret_key = hmac.new(
            b'WebAppData',
            BOT_TOKEN.encode(),
            hashlib.sha256
        ).digest()
        calculated = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(calculated, received_hash):
            return None

        return json.loads(parsed.get('user', '{}'))
    except Exception as exc:
        log.warning('verify_initdata error: %s', exc)
        return None


def _is_admin(user_id: int) -> bool:
    """Проверить, является ли user_id администратором (статические + динамические)."""
    if user_id in ADMIN_IDS:
        return True
    return any(a['user_id'] == user_id for a in _load_admins())


def require_admin(x_init_data: str | None) -> None:
    """Кидает 403 если запрос не от админа."""
    if DEV_MODE and not x_init_data:
        if not _is_admin(DEV_USER_ID):
            raise HTTPException(status_code=403, detail='Доступ запрещён')
        return
    if not x_init_data:
        raise HTTPException(status_code=403, detail='Нет initData')
    user = verify_initdata(x_init_data)
    if not user:
        raise HTTPException(status_code=403, detail='Неверная подпись')
    if not _is_admin(user.get('id', 0)):
        raise HTTPException(status_code=403, detail='Доступ запрещён')


def require_user(x_init_data: str | None) -> dict:
    """Возвращает dict пользователя или кидает 403."""
    if DEV_MODE and not x_init_data:
        return {'id': DEV_USER_ID, 'first_name': 'Dev', 'username': 'dev'}
    if not x_init_data:
        raise HTTPException(status_code=403, detail='Нет initData')
    user = verify_initdata(x_init_data)
    if not user:
        raise HTTPException(status_code=403, detail='Неверная подпись')
    return user


def load_orders() -> list:
    if not ORDERS_FILE.exists():
        return []
    data = json.loads(ORDERS_FILE.read_text(encoding='utf-8'))
    if isinstance(data, list):
        return data
    return data.get('orders', [])


def save_orders(orders: list) -> None:
    ORDERS_FILE.write_text(
        json.dumps(orders, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )


def load_users() -> dict:
    if not USERS_FILE.exists():
        return {}
    return json.loads(USERS_FILE.read_text(encoding='utf-8')).get('users', {})


def load_holidays() -> dict:
    if not HOLIDAYS_FILE.exists():
        return {}
    return json.loads(HOLIDAYS_FILE.read_text(encoding='utf-8')).get('holidays', {})


def get_upcoming_holidays(days_ahead: int = 14) -> list:
    """Возвращает праздники из holidays.json, попадающие в ближайшие days_ahead дней."""
    holidays = load_holidays()
    today = datetime.now()
    result = []
    for offset in range(days_ahead + 1):
        day = today + timedelta(days=offset)
        key = day.strftime('%m-%d')
        if key in holidays:
            h = holidays[key]
            result.append({
                'key': key,
                'date': day.strftime('%Y-%m-%d'),
                'days_left': offset,
                'theme': h.get('theme', ''),
                'text': h.get('text', ''),
            })
    return result


def get_sleeping_users(days: int = 30) -> list:
    """Пользователи, у которых есть заказы, но нет активности более `days` дней."""
    users = load_users()
    cutoff = datetime.now() - timedelta(days=days)
    sleeping = []
    for uid, u in users.items():
        if not u.get('orders_count', 0):
            continue
        last_seen_str = u.get('last_seen', '')
        if not last_seen_str:
            continue
        try:
            # Поддерживаем форматы: '2025-01-15 10:30:00' и '2025-01-15'
            fmt = '%Y-%m-%d %H:%M:%S' if ' ' in last_seen_str else '%Y-%m-%d'
            last_seen = datetime.strptime(last_seen_str[:19], fmt)
        except ValueError:
            continue
        if last_seen < cutoff:
            sleeping.append({
                'user_id': int(uid),
                'first_name': u.get('first_name', ''),
                'username': u.get('username', ''),
                'orders_count': u.get('orders_count', 0),
                'last_seen': last_seen_str[:10],
            })
    return sleeping


def load_photo_requests() -> dict:
    if not PHOTO_REQUESTS_FILE.exists():
        return {}
    return json.loads(PHOTO_REQUESTS_FILE.read_text(encoding='utf-8')).get('requests', {})


def save_photo_requests(requests: dict) -> None:
    if PHOTO_REQUESTS_FILE.exists():
        data = json.loads(PHOTO_REQUESTS_FILE.read_text(encoding='utf-8'))
    else:
        data = {'requests': {}}
    data['requests'] = requests
    PHOTO_REQUESTS_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )


# ──────────────────────────────────────────────
# Публичные эндпоинты
# ──────────────────────────────────────────────

@app.get('/')
@app.get('/health')
async def health() -> dict:
    return {'status': 'ok'}


@app.get('/api/prices')
async def get_prices() -> dict:
    if not PRICES_FILE.exists():
        raise HTTPException(status_code=503, detail='Каталог недоступен')
    try:
        return json.loads(PRICES_FILE.read_text(encoding='utf-8'))
    except Exception as exc:
        log.error('Ошибка чтения prices.json: %s', exc)
        raise HTTPException(status_code=500, detail='Ошибка сервера')


@app.post('/api/geocode')
async def geocode_address(body: GeocodeBody) -> dict:
    """
    Геокодирует адрес через Nominatim + расстояние по дорогам через OSRM.
    Нормализует ввод. Использует structured query для точности.
    """
    import re as _re

    addr = body.address.strip()
    if not addr:
        raise HTTPException(status_code=400, detail='Адрес пустой')

    normalized = normalize_address(addr)

    # Извлекаем кв/кор/стр/оф — они мешают Nominatim
    normalized, apartment_suffix = _strip_apartment_info(normalized)

    nominatim_headers = {'User-Agent': 'po-domashemu-webapp/2.0 (sn17518@gmail.com)'}
    nominatim_url = 'https://nominatim.openstreetmap.org/search'
    base_params = {'format': 'json', 'limit': 5, 'addressdetails': 1, 'accept-language': 'ru'}

    # Разбираем адрес на части: город, улицу, дом
    parts = [p.strip() for p in normalized.split(',') if p.strip()]

    city = ''
    street_parts = []
    house = ''
    for part in parts:
        # "д. 16А" или "д16А"
        house_match = _re.match(r'^(?:д\.?\s*)(\d+\s*[а-яА-ЯёЁa-zA-Z]?\s*(?:/\s*\d+)?)$', part, _re.IGNORECASE)
        if house_match:
            house = house_match.group(1).strip()
        # Просто "16А" или "16" или "7/2"
        elif _re.match(r'^\d+\s*[а-яА-ЯёЁa-zA-Z]?\s*(?:/\s*\d+)?$', part):
            house = part.strip()
        elif not city and _re.match(r'^[А-ЯЁA-Z]', part) and not _re.search(r'\b(?:ул|пр|пер|ш|наб|б-р|пл|мкр|туп|пр-т)\.', part, _re.IGNORECASE):
            city = part
        else:
            street_parts.append(part)

    street_name = ' '.join(street_parts)
    # Убираем сокращения для Nominatim: "ул." → ""
    street_clean = _re.sub(r'\b(?:ул|пр|пер|ш|наб|б-р|пл|мкр|туп|пр-т)\.\s*', '', street_name, flags=_re.IGNORECASE).strip()
    # Nominatim structured: street = "16А Мончегорская улица" (дом перед названием)
    if house and street_clean:
        street_for_nominatim = f'{house} {street_clean}'
    elif street_clean:
        street_for_nominatim = street_clean
    else:
        street_for_nominatim = ''

    # Специальная обработка для Зимёнок
    is_zimenki = 'зимёнки' in normalized.lower() or 'зименки' in normalized.lower()

    results = []

    async with httpx.AsyncClient(timeout=8.0) as client:
        # Попытка 1: structured query (город + улица + дом отдельно)
        if city and street_for_nominatim and not is_zimenki:
            try:
                r = await client.get(
                    nominatim_url,
                    params={**base_params, 'city': city, 'street': street_for_nominatim,
                            'state': 'Нижегородская область', 'country': 'Россия'},
                    headers=nominatim_headers,
                )
                results = r.json()
            except Exception as exc:
                log.warning('Geocode structured error: %s', exc)

        # Попытка 2: free-form query
        if not results:
            if is_zimenki:
                search_query = 'Зимёнки, Кстовский район, Нижегородская область, Россия'
            else:
                search_query = f'{normalized}, Нижегородская область, Россия'
            try:
                r = await client.get(
                    nominatim_url,
                    params={**base_params, 'q': search_query},
                    headers=nominatim_headers,
                )
                results = r.json()
            except Exception as exc:
                log.warning('Geocode error: %s', exc)
                return {'found': False, 'error': 'Сервис геокодирования недоступен'}

        # Попытка 3: без номера дома
        if not results:
            simplified = _re.sub(r',?\s*(?:д\.?\s*)?\d+\w?\s*$', '', normalized).strip(', ')
            if simplified != normalized:
                try:
                    r = await client.get(
                        nominatim_url,
                        params={**base_params, 'q': f'{simplified}, Нижегородская область, Россия'},
                        headers=nominatim_headers,
                    )
                    results = r.json()
                except Exception:
                    pass

        # Попытка 4: только город
        if not results and city:
            try:
                r = await client.get(
                    nominatim_url,
                    params={**base_params, 'limit': 1, 'q': f'{city}, Нижегородская область, Россия'},
                    headers=nominatim_headers,
                )
                results = r.json()
            except Exception:
                pass

    if not results:
        return {'found': False}

    item = results[0]
    lat = float(item['lat'])
    lon = float(item['lon'])

    # Расстояние по прямой (fallback)
    straight_dist = haversine(ZIMENKI_LAT, ZIMENKI_LON, lat, lon)

    # Расстояние по дорогам через OSRM
    road_dist = await get_road_distance_osrm(ZIMENKI_LAT, ZIMENKI_LON, lat, lon)

    # Используем дорожное расстояние если доступно, иначе по прямой
    dist = road_dist if road_dist is not None else straight_dist
    price = calc_delivery_price(dist)

    # Короткий адрес: убираем почтовый индекс, страну, область, округ
    display = item.get('display_name', addr)
    addr_details = item.get('address', {})
    skip_patterns = {'Россия', 'Нижегородская область', 'Приволжский федеральный округ',
                     'городской округ Нижний Новгород', 'городской округ Кстово'}
    parts_clean = []
    for p in display.split(','):
        p = p.strip()
        if not p or p in skip_patterns or _re.fullmatch(r'\d{5,6}', p):
            continue
        parts_clean.append(p)
    short_address = ', '.join(parts_clean[:4])

    # Если пользователь ввёл номер дома, а Nominatim его не вернул — добавляем
    if house and not addr_details.get('house_number'):
        short_address = f'{short_address}, уч. {house}'

    # Дописываем квартиру/корпус/строение/офис в отображаемый адрес
    if apartment_suffix:
        short_address = f'{short_address}, {apartment_suffix}'

    return {
        'found': True,
        'lat': lat,
        'lon': lon,
        'address': short_address,
        'distance_km': round(dist, 1),
        'road_distance': road_dist is not None,
        'delivery_price': price,
    }


# ──────────────────────────────────────────────
# Отправка заказа через HTTP (вместо tg.sendData)
# ──────────────────────────────────────────────

class OrderBody(BaseModel):
    items: list
    total: float = 0
    items_total: float = 0
    delivery_type: str = 'pickup'
    delivery_price: float = 0
    address: str = ''
    geo: dict | None = None
    phone: str = ''
    date: str = ''
    comment: str = ''
    payment_method: str = 'cash'
    user: dict | None = None


def _save_order_api(order_data: dict, user_info: dict) -> str:
    """Сохраняет заказ в orders_backup.json, возвращает order_id."""
    orders = load_orders()

    # Генерируем order_id
    year = datetime.now().year
    prefix = f'ORD-{year}-'
    max_num = 0
    for o in orders:
        oid = o.get('order_id', '')
        if oid.startswith(prefix):
            try:
                max_num = max(max_num, int(oid[len(prefix):]))
            except ValueError:
                pass
    order_id = f'{prefix}{max_num + 1:04d}'

    # Нормализуем товары
    normalized_items = []
    for item in order_data.get('items', []):
        weight = item.get('weight')
        qty = item.get('quantity', 1)
        if weight:
            price_per = item.get('price_kg') or item.get('price_kg_min') or 0
            subtotal = price_per * weight * qty
        else:
            price_per = item.get('price_item') or item.get('price_item_min') or 0
            subtotal = price_per * qty
        normalized_items.append({
            'name': item.get('name', ''),
            'quantity': qty,
            'unit': item.get('unit', 'шт'),
            'weight': weight,
            'price_per_unit': price_per,
            'total': subtotal,
        })

    normalized = {
        'order_id': order_id,
        'status': 'new',
        'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'customer': {
            'user_id': user_info.get('id'),
            'username': user_info.get('username', ''),
            'first_name': user_info.get('first_name', ''),
            'phone': order_data.get('phone', ''),
        },
        'items': normalized_items,
        'delivery': {
            'type': order_data.get('delivery_type', 'pickup'),
            'address': order_data.get('address', ''),
            'price': order_data.get('delivery_price', 0),
        },
        'payment': {
            'method': order_data.get('payment_method', 'cash'),
        },
        'schedule': {
            'date': order_data.get('date', ''),
        },
        'comment': order_data.get('comment', ''),
        'totals': {
            'items_total': order_data.get('items_total', 0),
            'delivery_total': order_data.get('delivery_price', 0),
            'grand_total': order_data.get('total', 0),
        },
    }

    orders.append(normalized)
    save_orders(orders)

    # Увеличиваем orders_count в users.json
    users = load_users()
    uid = str(user_info.get('id'))
    if uid in users:
        users[uid]['orders_count'] = users[uid].get('orders_count', 0) + 1
        users[uid]['last_seen'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        USERS_FILE.write_text(
            json.dumps({'users': users}, ensure_ascii=False, indent=2),
            encoding='utf-8'
        )

    log.info('Заказ %s сохранён (API): user_id=%s, items=%d', order_id, uid, len(normalized_items))
    return order_id


def _format_order_for_mama_api(order_data: dict, user_info: dict, order_id: str) -> str:
    """Форматирует заказ для отправки маме."""
    name = user_info.get('first_name', '—')
    username = f'@{user_info["username"]}' if user_info.get('username') else '—'
    phone = order_data.get('phone', '—')

    lines = [f'🛒 <b>НОВЫЙ ЗАКАЗ (Web App)</b> — {order_id}\n']
    lines.append(f'👤 <b>Клиент:</b> {name} ({username})')
    lines.append(f'📞 <b>Телефон:</b> {phone}\n')

    lines.append('📦 <b>Состав заказа:</b>')
    total = 0
    for item in order_data.get('items', []):
        item_name = item.get('name', '?')
        qty = item.get('quantity', 1)
        weight = item.get('weight')
        if weight:
            price = item.get('price_kg') or item.get('price_kg_min') or 0
            subtotal = price * weight * qty
            amount_str = f'{weight} кг × {qty} шт'
        else:
            price = item.get('price_item') or item.get('price_item_min') or 0
            subtotal = price * qty
            amount_str = f'{qty} {item.get("unit", "шт")}'
        total += subtotal
        price_str = f'{subtotal:,.0f} ₽'.replace(',', ' ') if subtotal else '—'
        lines.append(f'  • {item_name} — {amount_str} = {price_str}')

    total_str = f'{order_data.get("total", total):,.0f} ₽'.replace(',', ' ')
    lines.append(f'\n💰 <b>Итого:</b> {total_str}')

    delivery_type = order_data.get('delivery_type', 'pickup')
    address = order_data.get('address', '—')
    delivery_label = '🚗 Доставка' if delivery_type == 'delivery' else '🏡 Самовывоз'
    lines.append(f'\n{delivery_label}: {address}')
    lines.append(f'📅 <b>Дата:</b> {order_data.get("date", "—")}')

    comment = order_data.get('comment', '').strip()
    if comment:
        lines.append(f'💬 <b>Комментарий:</b> {comment}')

    return '\n'.join(lines)


@app.post('/api/orders')
async def submit_order(
    body: OrderBody,
    x_init_data: str | None = Header(default=None),
) -> dict:
    """Принять заказ через HTTP API — сохранить + уведомить маму."""
    user_info = {}
    # Пытаемся извлечь пользователя из initData
    if x_init_data:
        verified = verify_initdata(x_init_data)
        if verified:
            user_info = verified
    # Если нет initData — берём из тела заказа
    if not user_info and body.user:
        user_info = body.user
    # DEV fallback
    if not user_info and DEV_MODE:
        user_info = {'id': DEV_USER_ID, 'first_name': 'Dev', 'username': 'dev'}

    if not user_info.get('id'):
        raise HTTPException(status_code=400, detail='Не удалось определить пользователя')

    order_data = body.model_dump()

    # Сохраняем заказ
    order_id = _save_order_api(order_data, user_info)

    # Уведомляем маму через Telegram Bot API
    mama_text = _format_order_for_mama_api(order_data, user_info, order_id)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage',
                json={
                    'chat_id': MAMA_CHAT_ID,
                    'text': mama_text,
                    'parse_mode': 'HTML',
                },
            )
            if r.status_code != 200:
                log.error('Не удалось отправить заказ маме: %s', r.text)
    except Exception as exc:
        log.error('Ошибка отправки маме: %s', exc)

    # Подтверждение клиенту (если в Telegram)
    if user_info.get('id') and user_info['id'] != DEV_USER_ID:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage',
                    json={
                        'chat_id': user_info['id'],
                        'text': f'✅ <b>Заказ принят!</b> ({order_id})\n\nНадежда свяжется с вами в ближайшее время для уточнения деталей.',
                        'parse_mode': 'HTML',
                    },
                )
        except Exception:
            pass  # не критично

    return {'ok': True, 'order_id': order_id}


# ──────────────────────────────────────────────
# Пользователь: Мои заказы
# ──────────────────────────────────────────────

@app.get('/api/orders/my')
async def get_my_orders(x_init_data: str | None = Header(default=None)) -> dict:
    """Заказы текущего пользователя (по user_id из initData)."""
    user = require_user(x_init_data)
    user_id = user.get('id')

    orders = load_orders()
    my = [
        o for o in orders
        if (o.get('customer', {}).get('user_id') == user_id
            or o.get('user', {}).get('id') == user_id)
    ]
    my.sort(key=lambda o: o.get('created_at', ''), reverse=True)
    return {'orders': my, 'total': len(my)}


# ──────────────────────────────────────────────
# Пользователь: Реферальная информация
# ──────────────────────────────────────────────

@app.get('/api/referral/my')
async def get_my_referral(x_init_data: str | None = Header(default=None)) -> dict:
    """Реферальная ссылка и кол-во приглашённых друзей."""
    user = require_user(x_init_data)
    user_id = user.get('id')
    users = load_users()
    u = users.get(str(user_id), {})
    return {
        'referrals_count': u.get('referrals_count', 0),
        'bot_username': 'VypechkaNadezhda_App_bot',
    }


# ──────────────────────────────────────────────
# Пользователь: Запросы на фото
# ──────────────────────────────────────────────

@app.get('/api/photo-requests/my')
async def get_my_photo_requests(x_init_data: str | None = Header(default=None)) -> dict:
    """Запросы на фото текущего пользователя."""
    user = require_user(x_init_data)
    user_id = user.get('id')

    requests = load_photo_requests()
    mine = [r for r in requests.values() if r.get('user_id') == user_id]
    mine.sort(key=lambda r: r.get('created_at', ''), reverse=True)
    return {'requests': mine, 'total': len(mine)}


@app.post('/api/photo-requests')
async def create_photo_request(
    body: PhotoRequestBody,
    x_init_data: str | None = Header(default=None)
) -> dict:
    """Создать запрос на фото товара."""
    user = require_user(x_init_data)
    user_id = user.get('id')

    requests = load_photo_requests()

    # Не создавать дубликаты для одного и того же товара
    for req in requests.values():
        if (req.get('user_id') == user_id
                and req.get('item_id') == body.item_id
                and req.get('status') == 'open'):
            return {'ok': True, 'req_id': req['req_id'], 'already_exists': True}

    now = datetime.now()
    date_str = now.strftime('%y%m%d')

    # Уникальный ID с учётом существующих
    counter = sum(1 for rid in requests if date_str in rid) + 1
    req_id = f'REQ-{date_str}-{counter:03d}'
    while req_id in requests:
        counter += 1
        req_id = f'REQ-{date_str}-{counter:03d}'

    new_req = {
        'req_id': req_id,
        'user_id': user_id,
        'username': user.get('username', ''),
        'first_name': user.get('first_name', ''),
        'item_key': body.item_key,
        'item_id': body.item_id,
        'item_name': body.item_name,
        'status': 'open',
        'created_at': now.strftime('%Y-%m-%d %H:%M:%S'),
    }
    requests[req_id] = new_req
    save_photo_requests(requests)

    return {'ok': True, 'req_id': req_id}


# ──────────────────────────────────────────────
# Админ: Заказы
# ──────────────────────────────────────────────

@app.get('/api/admin/orders')
async def admin_get_orders(x_init_data: str | None = Header(default=None)) -> dict:
    require_admin(x_init_data)
    orders = load_orders()
    orders_sorted = sorted(orders, key=lambda o: o.get('created_at', ''), reverse=True)
    return {'orders': orders_sorted, 'total': len(orders_sorted)}


@app.patch('/api/admin/orders/{order_id}/status')
async def admin_update_order_status(
    order_id: str,
    body: StatusUpdate,
    x_init_data: str | None = Header(default=None)
) -> dict:
    require_admin(x_init_data)
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f'Неверный статус: {body.status}')
    orders = load_orders()
    found = False
    for order in orders:
        if order.get('order_id') == order_id:
            order['status'] = body.status
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail='Заказ не найден')
    save_orders(orders)
    return {'ok': True, 'order_id': order_id, 'status': body.status}


@app.post('/api/admin/orders/{order_id}/close')
async def admin_close_order(
    order_id: str,
    x_init_data: str | None = Header(default=None)
) -> dict:
    require_admin(x_init_data)
    orders = load_orders()
    found = False
    for order in orders:
        if order.get('order_id') == order_id:
            order['status'] = 'closed'
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail='Заказ не найден')
    save_orders(orders)
    return {'ok': True, 'order_id': order_id, 'status': 'closed'}


@app.delete('/api/admin/orders/{order_id}')
async def admin_delete_order(
    order_id: str,
    x_init_data: str | None = Header(default=None)
) -> dict:
    require_admin(x_init_data)
    orders = load_orders()
    new_orders = [o for o in orders if o.get('order_id') != order_id]
    if len(new_orders) == len(orders):
        raise HTTPException(status_code=404, detail='Заказ не найден')
    save_orders(new_orders)
    return {'ok': True, 'order_id': order_id}


# ──────────────────────────────────────────────
# Админ: Статистика
# ──────────────────────────────────────────────

@app.get('/api/admin/stats')
async def admin_get_stats(x_init_data: str | None = Header(default=None)) -> dict:
    require_admin(x_init_data)
    orders = load_orders()
    users = load_users()

    closed = [o for o in orders if o.get('status') == 'closed']
    total_revenue = sum(
        o.get('totals', {}).get('grand_total') or o.get('total') or 0
        for o in closed
    )
    avg_check = round(total_revenue / len(closed)) if closed else 0

    status_counts: dict = {}
    for o in orders:
        s = o.get('status', 'unknown')
        status_counts[s] = status_counts.get(s, 0) + 1

    item_counts: dict = {}
    for o in orders:
        for item in o.get('items', []):
            name = item.get('name', '?')
            qty = item.get('quantity', 1)
            item_counts[name] = item_counts.get(name, 0) + (qty if isinstance(qty, (int, float)) else 1)
    top_items = sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        'total_orders': len(orders),
        'total_revenue': total_revenue,
        'avg_check': avg_check,
        'users_count': len(users),
        'status_counts': status_counts,
        'top_items': [{'name': n, 'count': round(c, 1)} for n, c in top_items],
    }


# ──────────────────────────────────────────────
# Админ: Клиенты
# ──────────────────────────────────────────────

@app.get('/api/admin/users')
async def admin_get_users(x_init_data: str | None = Header(default=None)) -> dict:
    require_admin(x_init_data)
    users = load_users()
    users_list = list(users.values())
    users_list.sort(key=lambda u: u.get('last_seen', ''), reverse=True)
    return {'users': users_list, 'total': len(users_list)}


# ──────────────────────────────────────────────
# Админ: Запросы на фото
# ──────────────────────────────────────────────

@app.get('/api/admin/photo-requests')
async def admin_get_photo_requests(x_init_data: str | None = Header(default=None)) -> dict:
    require_admin(x_init_data)
    requests = load_photo_requests()
    requests_list = list(requests.values())
    requests_list.sort(key=lambda r: r.get('created_at', ''), reverse=True)
    return {'requests': requests_list, 'total': len(requests_list)}


# ──────────────────────────────────────────────
# Админ: Запросы на фото — выполнить / отклонить
# ──────────────────────────────────────────────

@app.post('/api/admin/photo-requests/{req_id}/fulfill')
async def admin_fulfill_photo(
    req_id: str,
    file: UploadFile = File(...),
    x_init_data: str | None = Header(default=None),
) -> dict:
    """Выполнить запрос на фото: загрузить файл и отправить пользователю через Telegram."""
    require_admin(x_init_data)

    requests = load_photo_requests()
    if req_id not in requests:
        raise HTTPException(status_code=404, detail='Запрос не найден')

    req = requests[req_id]
    if req.get('status') != 'open':
        raise HTTPException(status_code=400, detail='Запрос уже закрыт')

    user_id = req.get('user_id')
    item_name = req.get('item_name', '')

    photo_bytes = await file.read()

    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            f'https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto',
            data={
                'chat_id': user_id,
                'caption': f'📷 Фото товара «{item_name}»\n\nЕсли хотите заказать — нажмите кнопку меню в боте!',
            },
            files={'photo': (file.filename or 'photo.jpg', photo_bytes, file.content_type or 'image/jpeg')},
        )

    if r.status_code != 200:
        log.error('sendPhoto failed: %s', r.text)
        raise HTTPException(status_code=502, detail='Ошибка отправки фото в Telegram')

    req['status'] = 'fulfilled'
    req['fulfilled_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    requests[req_id] = req
    save_photo_requests(requests)

    return {'ok': True, 'req_id': req_id}


@app.post('/api/admin/photo-requests/{req_id}/reject')
async def admin_reject_photo(
    req_id: str,
    x_init_data: str | None = Header(default=None),
) -> dict:
    """Отклонить запрос на фото и уведомить пользователя."""
    require_admin(x_init_data)

    requests = load_photo_requests()
    if req_id not in requests:
        raise HTTPException(status_code=404, detail='Запрос не найден')

    req = requests[req_id]
    if req.get('status') != 'open':
        raise HTTPException(status_code=400, detail='Запрос уже закрыт')

    user_id = req.get('user_id')
    item_name = req.get('item_name', '')

    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(
            f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage',
            json={
                'chat_id': user_id,
                'text': f'К сожалению, фото товара «{item_name}» сейчас недоступно. Если хотите узнать подробнее — напишите нам напрямую! 🙏',
            },
        )

    req['status'] = 'rejected'
    req['rejected_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    requests[req_id] = req
    save_photo_requests(requests)

    return {'ok': True, 'req_id': req_id}


# ──────────────────────────────────────────────
# Админ: Напоминалки (праздники + спящие клиенты)
# ──────────────────────────────────────────────

@app.get('/api/admin/reminders')
async def admin_get_reminders(x_init_data: str | None = Header(default=None)) -> dict:
    """Ближайшие праздники + «спящие» клиенты (нет активности 7+ дней)."""
    require_admin(x_init_data)
    holidays = get_upcoming_holidays(days_ahead=14)
    sleeping = get_sleeping_users(days=30)
    return {
        'holidays': holidays,
        'sleeping': sleeping,
        'sleeping_count': len(sleeping),
    }


@app.post('/api/admin/remind-sleeping')
async def admin_remind_sleeping(
    body: RemindBody,
    x_init_data: str | None = Header(default=None),
) -> dict:
    """Отправить напоминание только «спящим» клиентам."""
    require_admin(x_init_data)
    if not body.text.strip():
        raise HTTPException(status_code=400, detail='Текст не может быть пустым')

    sleeping = get_sleeping_users(days=30)
    if not sleeping:
        return {'ok': True, 'sent': 0, 'failed': 0}

    sent = 0
    failed = 0
    async with httpx.AsyncClient(timeout=10.0) as client:
        for u in sleeping:
            try:
                r = await client.post(
                    f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage',
                    json={
                        'chat_id': u['user_id'],
                        'text': body.text,
                        'parse_mode': 'HTML',
                    },
                )
                if r.status_code == 200:
                    sent += 1
                else:
                    failed += 1
                    log.warning('remind-sleeping failed for %s: %s', u['user_id'], r.text)
            except Exception as exc:
                failed += 1
                log.warning('remind-sleeping exception for %s: %s', u['user_id'], exc)

    return {'ok': True, 'sent': sent, 'failed': failed}


# ──────────────────────────────────────────────
# Админ: Рассылка
# ──────────────────────────────────────────────

@app.post('/api/admin/broadcast')
async def admin_broadcast(
    body: BroadcastBody,
    x_init_data: str | None = Header(default=None)
) -> dict:
    require_admin(x_init_data)
    if not body.text.strip():
        raise HTTPException(status_code=400, detail='Текст не может быть пустым')

    users = load_users()
    if not users:
        return {'ok': True, 'sent': 0, 'failed': 0}

    sent = 0
    failed = 0
    async with httpx.AsyncClient(timeout=10.0) as client:
        for user_id_str in users:
            try:
                r = await client.post(
                    f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage',
                    json={
                        'chat_id': int(user_id_str),
                        'text': body.text,
                        'parse_mode': 'HTML',
                    },
                )
                if r.status_code == 200:
                    sent += 1
                else:
                    failed += 1
                    log.warning('Broadcast failed for %s: %s', user_id_str, r.text)
            except Exception as exc:
                failed += 1
                log.warning('Broadcast exception for %s: %s', user_id_str, exc)

    return {'ok': True, 'sent': sent, 'failed': failed}


# ── Импорт данных (админ) ───────────────────────────────────────────────────

class ImportDataBody(BaseModel):
    file_key: str       # "orders" | "users" | "photo_requests"
    data: dict | list   # содержимое JSON-файла


@app.post('/api/admin/import-data')
async def admin_import_data(
    body: ImportDataBody,
    x_init_data: str | None = Header(default=None),
    x_import_secret: str | None = Header(default=None),
) -> dict:
    """Импорт JSON-данных (заказы, пользователи, фото-запросы) на сервер."""
    # Авторизация: либо initData админа, либо секретный ключ (BOT_TOKEN)
    if x_import_secret == BOT_TOKEN:
        pass  # OK — авторизован по секрету
    else:
        require_admin(x_init_data)

    file_map = {
        'orders': ORDERS_FILE,
        'users': USERS_FILE,
        'photo_requests': PHOTO_REQUESTS_FILE,
        'holidays': HOLIDAYS_FILE,
    }
    target = file_map.get(body.file_key)
    if not target:
        raise HTTPException(status_code=400, detail=f'Неизвестный file_key: {body.file_key}')

    target.write_text(json.dumps(body.data, ensure_ascii=False, indent=2), encoding='utf-8')
    log.info('Imported %s → %s', body.file_key, target)
    return {'ok': True, 'file': body.file_key}


# ── Синхронизация цен из Google Sheets ────────────────────────────────────────

@app.post('/api/admin/sync-prices')
async def admin_sync_prices(x_init_data: str | None = Header(default=None)) -> dict:
    """Синхронизация цен из Google Sheets + кеширование фото."""
    require_admin(x_init_data)
    from sheets_sync import sync_prices as do_sync
    success, message = await do_sync(GOOGLE_SHEET_ID, PRICES_FILE, PHOTOS_DIR)
    return {'ok': success, 'message': message}


# ── Раздача кешированных фото товаров ─────────────────────────────────────────

@app.get('/api/photos/{filename}')
async def get_photo(filename: str):
    """Отдать кешированное фото товара."""
    # Защита от path traversal
    if '/' in filename or '\\' in filename or '..' in filename:
        raise HTTPException(status_code=400, detail='Invalid filename')
    filepath = PHOTOS_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail='Photo not found')
    return FileResponse(filepath)


# ── Заказы конкретного пользователя (для админки) ─────────────────────────────

@app.get('/api/admin/users/{user_id}/orders')
async def admin_get_user_orders(
    user_id: int,
    x_init_data: str | None = Header(default=None),
) -> dict:
    """Все заказы конкретного пользователя."""
    require_admin(x_init_data)
    orders = load_orders()
    user_orders = [
        o for o in orders
        if (o.get('customer', {}).get('user_id') == user_id
            or o.get('user', {}).get('id') == user_id)
    ]
    user_orders.sort(key=lambda o: o.get('created_at', ''), reverse=True)
    return {'orders': user_orders, 'total': len(user_orders)}


# ── Управление администраторами ──────────────────────────────────────────────

def _load_admins() -> list[dict]:
    """Загрузить список динамических админов из admins.json."""
    try:
        data = json.loads(ADMINS_FILE.read_text(encoding='utf-8'))
        return data.get('admins', [])
    except Exception:
        return []


def _save_admins(admins: list[dict]):
    """Сохранить список динамических админов."""
    ADMINS_FILE.write_text(
        json.dumps({'admins': admins}, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )


def _get_all_admin_ids() -> set[int]:
    """Все ID админов: из .env + динамические из admins.json."""
    ids = set(ADMIN_IDS)
    for a in _load_admins():
        ids.add(a['user_id'])
    return ids


@app.get('/api/admin/admins')
async def admin_list_admins(x_init_data: str | None = Header(default=None)) -> dict:
    """Список всех администраторов."""
    require_admin(x_init_data)

    # Статические админы из .env
    static_ids = set(ADMIN_IDS)
    dynamic_admins = _load_admins()
    dynamic_ids = {a['user_id'] for a in dynamic_admins}

    # Подтянем инфо о пользователях из users.json
    users_data = {}
    try:
        raw = json.loads(USERS_FILE.read_text(encoding='utf-8'))
        users_dict = raw if isinstance(raw, dict) and 'users' in raw else {}
        users_data = users_dict.get('users', {})
    except Exception:
        pass

    result = []
    for uid in static_ids | dynamic_ids:
        user_info = users_data.get(str(uid), {})
        result.append({
            'user_id': uid,
            'username': user_info.get('username', ''),
            'first_name': user_info.get('first_name', ''),
            'is_static': uid in static_ids,
            'is_mama': uid == MAMA_CHAT_ID,
        })

    # Мама первой, потом по имени
    result.sort(key=lambda a: (0 if a['is_mama'] else 1, a.get('first_name', '')))
    return {'admins': result}


@app.post('/api/admin/admins')
async def admin_add_admin(
    body: AddAdminBody,
    x_init_data: str | None = Header(default=None),
) -> dict:
    """Добавить нового администратора по user_id или @username."""
    require_admin(x_init_data)

    user_id = body.user_id
    username = (body.username or '').strip().lstrip('@')
    first_name = body.first_name or ''

    # Если user_id не указан, ищем по username в users.json
    if not user_id and username:
        try:
            raw = json.loads(USERS_FILE.read_text(encoding='utf-8'))
            users_dict = raw.get('users', {}) if isinstance(raw, dict) else {}
            for uid_str, u in users_dict.items():
                if (u.get('username', '') or '').lower() == username.lower():
                    user_id = int(uid_str) if uid_str.isdigit() else None
                    first_name = first_name or u.get('first_name', '')
                    break
        except Exception:
            pass

    if not user_id:
        raise HTTPException(status_code=400, detail=f'Пользователь @{username} не найден среди клиентов бота. Попросите его сначала открыть бота, или добавьте по числовому ID.')

    admins = _load_admins()
    all_ids = _get_all_admin_ids()
    if user_id in all_ids:
        raise HTTPException(status_code=400, detail='Этот пользователь уже администратор')

    admins.append({
        'user_id': user_id,
        'username': username,
        'first_name': first_name,
        'added_at': datetime.now(timezone.utc).isoformat(),
    })
    _save_admins(admins)
    log.info('Admin added: %s (@%s)', user_id, username)
    return {'ok': True}


@app.delete('/api/admin/admins/{user_id}')
async def admin_remove_admin(
    user_id: int,
    x_init_data: str | None = Header(default=None),
) -> dict:
    """Убрать администратора (только динамических, не из .env)."""
    require_admin(x_init_data)

    if user_id == MAMA_CHAT_ID:
        raise HTTPException(status_code=400, detail='Нельзя убрать маму из админов')
    if user_id in ADMIN_IDS:
        raise HTTPException(status_code=400, detail='Этот админ задан в настройках сервера (.env), нельзя убрать через UI')

    admins = _load_admins()
    new_admins = [a for a in admins if a['user_id'] != user_id]
    if len(new_admins) == len(admins):
        raise HTTPException(status_code=404, detail='Админ не найден')

    _save_admins(new_admins)
    log.info('Admin removed: %s', user_id)
    return {'ok': True}


@app.get('/api/admin/users-search')
async def admin_search_users(
    q: str = '',
    x_init_data: str | None = Header(default=None),
) -> dict:
    """Поиск пользователей по имени/username для выдачи админки."""
    require_admin(x_init_data)

    try:
        raw = json.loads(USERS_FILE.read_text(encoding='utf-8'))
        users_dict = raw.get('users', {}) if isinstance(raw, dict) else {}
    except Exception:
        users_dict = {}

    query = q.lower().strip().lstrip('@')
    results = []
    for uid_str, u in users_dict.items():
        name = (u.get('first_name', '') + ' ' + u.get('last_name', '')).strip().lower()
        username = (u.get('username', '') or '').lower()
        if query and query not in name and query not in username and query != uid_str:
            continue
        results.append({
            'user_id': int(uid_str) if uid_str.isdigit() else 0,
            'username': u.get('username', ''),
            'first_name': u.get('first_name', ''),
            'last_name': u.get('last_name', ''),
        })
        if len(results) >= 20:
            break

    return {'users': results}
