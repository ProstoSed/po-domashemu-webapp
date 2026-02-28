"""
webapp-bot/backend/api.py

FastAPI сервер.

Публичные эндпоинты:
  GET /health
  GET /api/prices

Админ-эндпоинты (требуют заголовок X-Init-Data с Telegram initData):
  GET  /api/admin/orders                       — все заказы
  PATCH /api/admin/orders/{id}/status          — изменить статус заказа
  POST /api/admin/orders/{id}/close            — закрыть заказ (status → closed)
  DELETE /api/admin/orders/{id}                — удалить заказ
  GET  /api/admin/stats                        — статистика
  GET  /api/admin/users                        — список клиентов
  GET  /api/admin/photo-requests               — запросы на фото
  POST /api/admin/broadcast                    — рассылка всем клиентам
"""
import hashlib
import hmac
import json
import logging
from urllib.parse import parse_qsl

import httpx
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import PRICES_FILE, ORDERS_FILE, BOT_TOKEN, ADMIN_IDS, USERS_FILE, PHOTO_REQUESTS_FILE

log = logging.getLogger(__name__)
app = FastAPI(title='По-домашнему API', version='1.2')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['GET', 'POST', 'DELETE', 'PATCH'],
    allow_headers=['*'],
)


# ──────────────────────────────────────────────
# Pydantic модели
# ──────────────────────────────────────────────

class StatusUpdate(BaseModel):
    status: str


class BroadcastBody(BaseModel):
    text: str


# ──────────────────────────────────────────────
# Константы
# ──────────────────────────────────────────────

VALID_STATUSES = {'new', 'accepted', 'cooking', 'delivery', 'ready', 'closed'}


# ──────────────────────────────────────────────
# Вспомогательные функции
# ──────────────────────────────────────────────

def verify_initdata(init_data: str) -> dict | None:
    """
    Проверяет Telegram initData (HMAC-SHA256).
    Возвращает dict пользователя или None если подпись неверна.
    Docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
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
    """Проверяет что запрос от мамы. Кидает 403 если нет."""
    if not x_init_data:
        raise HTTPException(status_code=403, detail='Нет initData')
    user = verify_initdata(x_init_data)
    if not user:
        raise HTTPException(status_code=403, detail='Неверная подпись')
    if user.get('id') not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail='Доступ запрещён')


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


def load_photo_requests() -> dict:
    if not PHOTO_REQUESTS_FILE.exists():
        return {}
    return json.loads(PHOTO_REQUESTS_FILE.read_text(encoding='utf-8')).get('requests', {})


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


# ──────────────────────────────────────────────
# Админ: Заказы
# ──────────────────────────────────────────────

@app.get('/api/admin/orders')
async def admin_get_orders(x_init_data: str | None = Header(default=None)) -> dict:
    """Возвращает все заказы из orders_backup.json."""
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
    """Изменяет статус заказа."""
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
    """Закрывает заказ (status → closed)."""
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
    """Удаляет заказ из orders_backup.json."""
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
    """Сводная статистика."""
    require_admin(x_init_data)
    orders = load_orders()
    users = load_users()

    closed_orders = [o for o in orders if o.get('status') == 'closed']
    total_revenue = sum(
        o.get('totals', {}).get('grand_total') or o.get('total') or 0
        for o in closed_orders
    )
    avg_check = round(total_revenue / len(closed_orders)) if closed_orders else 0

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
    """Список всех зарегистрированных клиентов."""
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
    """Список запросов на фото товаров."""
    require_admin(x_init_data)
    requests = load_photo_requests()
    requests_list = list(requests.values())
    requests_list.sort(key=lambda r: r.get('created_at', ''), reverse=True)
    return {'requests': requests_list, 'total': len(requests_list)}


# ──────────────────────────────────────────────
# Админ: Рассылка
# ──────────────────────────────────────────────

@app.post('/api/admin/broadcast')
async def admin_broadcast(
    body: BroadcastBody,
    x_init_data: str | None = Header(default=None)
) -> dict:
    """Отправляет сообщение всем клиентам через Telegram Bot API."""
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
