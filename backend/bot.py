"""
webapp-bot/backend/bot.py

Telegram-бот для приёма заказов из Web App «По-домашнему».
Отдельный бот (отдельный токен от @BotFather).

Команды:
  /start — приветствие + кнопка открыть WebApp
  web_app_data — получить заказ из Mini App, отправить маме
"""
import asyncio
import json
import logging

from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import (
    Message,
    WebAppInfo,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from aiogram.types.web_app_data import WebAppData

from config import BOT_TOKEN, MAMA_CHAT_ID, WEBAPP_URL

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


# ──────────────────────────────────────────────
# /start — показать кнопку открыть WebApp
# ──────────────────────────────────────────────

@dp.message(CommandStart())
async def cmd_start(message: Message) -> None:
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
