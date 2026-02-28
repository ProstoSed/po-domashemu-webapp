"""
webapp-bot/backend/api.py

FastAPI сервер.

Публичные эндпоинты:
  GET /health
  GET /api/prices

Админ-эндпоинты (требуют заголовок X-Init-Data с Telegram initData):
  GET  /api/admin/orders               — все заказы
  POST /api/admin/orders/{id}/close    — закрыть заказ
  DELETE /api/admin/orders/{id}        — удалить заказ
"""
import hashlib
import hmac
import json
import logging
from urllib.parse import parse_qsl

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware

from config import PRICES_FILE, ORDERS_FILE, BOT_TOKEN, ADMIN_IDS

log = logging.getLogger(__name__)
app = FastAPI(title='По-домашнему API', version='1.1')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['GET', 'POST', 'DELETE'],
    allow_headers=['*'],
)


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
    # Поддерживаем оба формата: список или словарь {"orders": [...]}
    if isinstance(data, list):
        return data
    return data.get('orders', [])


def save_orders(orders: list) -> None:
    ORDERS_FILE.write_text(
        json.dumps(orders, ensure_ascii=False, indent=2),
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


# ──────────────────────────────────────────────
# Админ-эндпоинты
# ──────────────────────────────────────────────

@app.get('/api/admin/orders')
async def admin_get_orders(x_init_data: str | None = Header(default=None)) -> dict:
    """Возвращает все заказы из orders_backup.json."""
    require_admin(x_init_data)
    orders = load_orders()
    # Сортируем: новые сначала
    orders_sorted = sorted(orders, key=lambda o: o.get('created_at', ''), reverse=True)
    return {'orders': orders_sorted, 'total': len(orders_sorted)}


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
