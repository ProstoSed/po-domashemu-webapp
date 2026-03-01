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

from config import PRICES_FILE, ORDERS_FILE, BOT_TOKEN, ADMIN_IDS, USERS_FILE, PHOTO_REQUESTS_FILE, HOLIDAYS_FILE, DEV_MODE, DEV_USER_ID

log = logging.getLogger(__name__)
app = FastAPI(title='По-домашнему API', version='1.3')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['GET', 'POST', 'DELETE', 'PATCH'],
    allow_headers=['*'],
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
    """20 ₽/км, минимум 100 ₽, округление до 50 ₽."""
    raw = max(100, round(distance_km * 20))
    return int(round(raw / 50) * 50)


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


def require_admin(x_init_data: str | None) -> None:
    """Кидает 403 если запрос не от мамы."""
    if DEV_MODE and not x_init_data:
        if DEV_USER_ID not in ADMIN_IDS:
            raise HTTPException(status_code=403, detail='Доступ запрещён')
        return
    if not x_init_data:
        raise HTTPException(status_code=403, detail='Нет initData')
    user = verify_initdata(x_init_data)
    if not user:
        raise HTTPException(status_code=403, detail='Неверная подпись')
    if user.get('id') not in ADMIN_IDS:
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
    Геокодирует адрес через Nominatim.
    Возвращает координаты, расстояние от Зимёнок и цену доставки.
    """
    addr = body.address.strip()
    if not addr:
        raise HTTPException(status_code=400, detail='Адрес пустой')

    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            r = await client.get(
                'https://nominatim.openstreetmap.org/search',
                params={'q': addr, 'format': 'json', 'limit': 1, 'addressdetails': 0},
                headers={'User-Agent': 'po-domashemu-webapp/1.0 contact@example.com'},
            )
            results = r.json()
        except Exception as exc:
            log.warning('Geocode error: %s', exc)
            return {'found': False, 'error': 'Сервис геокодирования недоступен'}

    if not results:
        return {'found': False}

    item = results[0]
    lat = float(item['lat'])
    lon = float(item['lon'])
    dist = haversine(ZIMENKI_LAT, ZIMENKI_LON, lat, lon)
    price = calc_delivery_price(dist)

    # Короткий адрес (первые 3 части через запятую)
    display = item.get('display_name', addr)
    short_address = ', '.join(p.strip() for p in display.split(',')[:3])

    return {
        'found': True,
        'lat': lat,
        'lon': lon,
        'address': short_address,
        'distance_km': round(dist, 1),
        'delivery_price': price,
    }


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
) -> dict:
    """Импорт JSON-данных (заказы, пользователи, фото-запросы) на сервер."""
    require_admin(x_init_data)

    file_map = {
        'orders': ORDERS_FILE,
        'users': USERS_FILE,
        'photo_requests': PHOTO_REQUESTS_FILE,
    }
    target = file_map.get(body.file_key)
    if not target:
        raise HTTPException(status_code=400, detail=f'Неизвестный file_key: {body.file_key}')

    target.write_text(json.dumps(body.data, ensure_ascii=False, indent=2), encoding='utf-8')
    log.info('Imported %s → %s', body.file_key, target)
    return {'ok': True, 'file': body.file_key}
