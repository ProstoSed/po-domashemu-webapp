"""
webapp-bot/backend/bot.py

Telegram-бот для приёма заказов из Web App «По-домашнему».
Отдельный бот (отдельный токен от @BotFather).

Команды:
  /start [ref_ID] — приветствие + кнопка открыть WebApp (с поддержкой рефералов)
  web_app_data — получить заказ из Mini App, отправить маме
"""
import asyncio
import json
import logging
from datetime import datetime

from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import (
    Message,
    WebAppInfo,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from aiogram.types.web_app_data import WebAppData

from config import BOT_TOKEN, MAMA_CHAT_ID, WEBAPP_URL, USERS_FILE

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


# ──────────────────────────────────────────────
# Вспомогательные функции для users.json
# ──────────────────────────────────────────────

def _load_users() -> dict:
    if not USERS_FILE.exists():
        return {}
    data = json.loads(USERS_FILE.read_text(encoding='utf-8'))
    return data.get('users', {})


def _save_users(users: dict) -> None:
    if USERS_FILE.exists():
        data = json.loads(USERS_FILE.read_text(encoding='utf-8'))
    else:
        data = {'users': {}}
    data['users'] = users
    USERS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def _register_user(user) -> bool:
    """Регистрирует пользователя, возвращает True если новый."""
    users = _load_users()
    uid = str(user.id)
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    if uid in users:
        users[uid]['last_seen'] = now
        _save_users(users)
        return False

    users[uid] = {
        'user_id': user.id,
        'first_name': user.first_name or '',
        'username': user.username or '',
        'registered_at': now,
        'last_seen': now,
        'orders_count': 0,
        'referrals_count': 0,
    }
    _save_users(users)
    return True


def _add_referral(new_user_id: int, referrer_id: int) -> bool:
    """Регистрирует реферала. Вызывается только если пользователь новый."""
    if new_user_id == referrer_id:
        return False

    users = _load_users()
    new_uid = str(new_user_id)
    ref_uid = str(referrer_id)

    if ref_uid not in users:
        return False

    if new_uid in users and not users[new_uid].get('invited_by'):
        users[new_uid]['invited_by'] = referrer_id
        users[ref_uid]['referrals_count'] = users[ref_uid].get('referrals_count', 0) + 1
        _save_users(users)
        return True

    return False


# ──────────────────────────────────────────────
# /start — показать кнопку открыть WebApp
# ──────────────────────────────────────────────

@dp.message(CommandStart())
async def cmd_start(message: Message) -> None:
    # Извлечение deep-link аргумента (например, /start ref_12345)
    args = message.text.split()
    ref_id = None
    if len(args) > 1 and args[1].startswith('ref_'):
        try:
            ref_id = int(args[1].split('_')[1])
        except ValueError:
            pass

    # Регистрируем пользователя
    is_new = _register_user(message.from_user)

    if is_new and ref_id:
        success = _add_referral(message.from_user.id, ref_id)
        if success:
            try:
                await bot.send_message(
                    ref_id,
                    f'🎉 <b>Отличные новости!</b>\n\n'
                    f'По вашей ссылке пришёл друг ({message.from_user.first_name})!\n'
                    f'Спасибо за рекомендацию!\n\n'
                    f'🎁 Дарим вам скидку 5% на следующий заказ!',
                    parse_mode='HTML'
                )
            except Exception as e:
                log.warning('Не удалось уведомить реферера %s: %s', ref_id, e)

    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text='🥧 Открыть меню',
            web_app=WebAppInfo(url=WEBAPP_URL)
        )
    ]])
    await message.answer(
        '👋 Привет! Это магазин домашней выпечки <b>«По-домашнему»</b>.\n\n'
        '🥧 Пироги, торты, блины, пицца и многое другое.\n'
        'Нажмите кнопку ниже, чтобы открыть меню и оформить заказ:',
        parse_mode='HTML',
        reply_markup=kb
    )


# ──────────────────────────────────────────────
# web_app_data — получить заказ из Mini App
# ──────────────────────────────────────────────

@dp.message(F.web_app_data)
async def handle_web_app_order(message: Message) -> None:
    """Получаем JSON заказа от Telegram WebApp и пересылаем маме."""
    raw: WebAppData = message.web_app_data

    try:
        order = json.loads(raw.data)
    except json.JSONDecodeError:
        log.error('Невалидный JSON из WebApp: %s', raw.data)
        await message.answer('❌ Ошибка обработки заказа. Попробуйте ещё раз.')
        return

    # ── Подтверждение клиенту ────────────────
    await message.answer(
        '✅ <b>Заказ принят!</b>\n\n'
        'Надежда свяжется с вами в ближайшее время для уточнения деталей.',
        parse_mode='HTML'
    )

    # ── Формируем сообщение для мамы ─────────
    mama_text = _format_order_for_mama(order, message)

    try:
        await bot.send_message(MAMA_CHAT_ID, mama_text, parse_mode='HTML')
        log.info('Заказ отправлен маме: user_id=%s', message.from_user.id)
    except Exception as exc:
        log.error('Не удалось отправить заказ маме: %s', exc)


def _format_order_for_mama(order: dict, message: Message) -> str:
    """Форматирует заказ в читаемый текст для мамы."""
    user = message.from_user
    tg_user = order.get('user') or {}

    lines = ['🛒 <b>НОВЫЙ ЗАКАЗ (Web App)</b>\n']

    # Клиент
    name = user.first_name or tg_user.get('first_name', '—')
    username = f'@{user.username}' if user.username else '—'
    phone = order.get('phone', '—')
    lines.append(f'👤 <b>Клиент:</b> {name} ({username})')
    lines.append(f'📞 <b>Телефон:</b> {phone}\n')

    # Товары
    lines.append('📦 <b>Состав заказа:</b>')
    items = order.get('items', [])
    total = 0
    for item in items:
        item_name = item.get('name', '?')
        qty = item.get('quantity', 1)
        weight = item.get('weight')
        unit = item.get('unit', 'шт')

        # Подсчёт суммы позиции
        if weight:
            price = (item.get('price_kg') or item.get('price_kg_min') or 0)
            subtotal = price * weight * qty
            amount_str = f'{weight} кг × {qty} шт'
        else:
            price = (item.get('price_item') or item.get('price_item_min') or 0)
            subtotal = price * qty
            amount_str = f'{qty} {unit}'

        total += subtotal
        price_str = f'{subtotal:,.0f} ₽'.replace(',', ' ') if subtotal else '—'
        lines.append(f'  • {item_name} — {amount_str} = {price_str}')

    # Итог
    total_str = f'{order.get("total", total):,.0f} ₽'.replace(',', ' ')
    lines.append(f'\n💰 <b>Итого:</b> {total_str}')

    # Доставка
    delivery_type = order.get('delivery_type', 'pickup')
    address = order.get('address', '—')
    delivery_label = '🚗 Доставка' if delivery_type == 'delivery' else '🏡 Самовывоз'
    lines.append(f'\n{delivery_label}: {address}')

    # Дата
    date = order.get('date', '—')
    lines.append(f'📅 <b>Дата:</b> {date}')

    # Комментарий
    comment = order.get('comment', '').strip()
    if comment:
        lines.append(f'💬 <b>Комментарий:</b> {comment}')

    return '\n'.join(lines)


# ──────────────────────────────────────────────
# Точка входа (используется из run.py)
# ──────────────────────────────────────────────

async def main() -> None:
    log.info('WebApp-бот запущен. WEBAPP_URL=%s', WEBAPP_URL)
    await dp.start_polling(bot)


if __name__ == '__main__':
    asyncio.run(main())
