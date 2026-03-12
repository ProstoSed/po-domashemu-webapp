# По-домашнему

Telegram Mini App для приёма заказов на домашнюю выпечку. Полноценный интернет-магазин внутри Telegram: каталог с фото, корзина, оформление с расчётом доставки, админ-панель, AI-помощник.

## Что умеет

**Для клиентов:**
- Каталог товаров с фото, ценами и описаниями
- Постное меню (отдельная вкладка)
- Корзина с выбором веса/количества
- Оформление заказа: самовывоз или доставка с геокодированием и расчётом стоимости по дорогам (OSRM)
- История заказов
- Запрос фото готовых изделий
- AI-помощник — подскажет что выбрать на праздник, к чаю и т.д.
- Реферальная программа

**Для админа (Telegram Mini App):**
- Управление заказами (статусы, состав, удаление)
- Статистика: выручка по месяцам, графики, топ товаров
- Список клиентов с историей заказов
- Управление администраторами
- Напоминалки: праздники + спящие клиенты
- Рассылка всем пользователям
- Синхронизация цен из Google Sheets с кешированием фото

## Технологии

| Слой | Стек |
|------|------|
| Frontend | React 18, Vite, React Router (HashRouter), Framer Motion |
| Backend | FastAPI, aiogram 3.x, Python 3.11+ |
| Данные | JSON-файлы (persistent volume) |
| Цены | Google Sheets → автосинхронизация |
| Геокодирование | Nominatim + OSRM (расстояние по дорогам) |
| AI-помощник | Qwen (через FreeQwenApi прокси) |
| Авторизация | Telegram initData HMAC-SHA256 |
| Деплой | GitHub Pages (frontend) + Docker на VPS (backend) |

## Структура

```
webapp-bot/
├── frontend/              React приложение
│   ├── src/
│   │   ├── pages/         Страницы (каталог, корзина, оформление, админка...)
│   │   ├── components/    Компоненты (карточки, хедер, модалки...)
│   │   ├── hooks/         useCart, useTelegram, usePrices
│   │   └── utils/         API-клиент, форматирование
│   └── vite.config.js
├── backend/               FastAPI + aiogram бот
│   ├── api.py             ~25 эндпоинтов
│   ├── bot.py             Telegram-бот (приём заказов)
│   ├── sheets_sync.py     Синхронизация из Google Sheets
│   ├── qwen_api.py        AI-помощник
│   ├── config.py          Конфигурация из .env
│   └── run.py             Точка входа
├── data/                  JSON-данные (prices, orders, users...)
└── docs/                  Документация
```

## Быстрый старт

### Требования
- Node.js 18+
- Python 3.11+
- Telegram Bot Token (от [@BotFather](https://t.me/BotFather))

### 1. Клонировать

```bash
git clone https://github.com/ProstoSed/po-domashemu-webapp.git
cd po-domashemu-webapp
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Создать .env
cat > .env << EOF
BOT_TOKEN=ваш_токен_бота
MAIN_CHAT_ID=id_чата_владельца
DEV_MODE=true
DEV_USER_ID=ваш_telegram_id
EOF

python run.py
```

### 3. Frontend

```bash
cd frontend
npm install

# Создать .env.local для разработки
echo "VITE_DEV_USER_ID=ваш_telegram_id" > .env.local

npm run dev
```

Открыть http://localhost:5173

### 4. Google Sheets (опционально)

Для синхронизации цен создайте публичную Google Таблицу с колонками:

| Категория (ключ) | Категория | ID товара | Название | Ед.изм. | Цена | Описание | Фото URL |
|---|---|---|---|---|---|---|---|

Добавьте `GOOGLE_SHEET_ID` в `.env` бэкенда.

## Деплой

### Frontend — GitHub Pages

Автоматически через GitHub Actions при пуше в `main`.

Переменные в Settings → Secrets:
- `VITE_API_URL` — URL бэкенда
- `VITE_ADMIN_IDS` — ID администраторов через запятую

### Backend — Docker

```bash
docker build -t po-domashemu-backend .
docker run -d \
    --name po-domashemu \
    --restart unless-stopped \
    -p 127.0.0.1:8000:8000 \
    -v ./data:/app/data \
    --env-file .env \
    po-domashemu-backend
```

Или используйте готовый образ: `ghcr.io/prostosed/po-domashemu-backend:latest`

### Переменные окружения (.env)

| Переменная | Обязательная | Описание |
|------------|:---:|----------|
| `BOT_TOKEN` | да | Токен Telegram-бота |
| `MAIN_CHAT_ID` | да | ID чата владельца для уведомлений о заказах |
| `ADMIN_IDS` | нет | Доп. админы (через запятую) |
| `WEBAPP_URL` | нет | URL фронтенда (для кнопки в боте) |
| `GOOGLE_SHEET_ID` | нет | ID таблицы для синхронизации цен |
| `QWEN_PROXY_URL` | нет | URL FreeQwenApi для AI-помощника |
| `DEV_MODE` | нет | `true` — пропускает проверку Telegram initData |
| `DEV_USER_ID` | нет | Мок user_id в режиме разработки |

## Как адаптировать под себя

Проект создан для конкретной пекарни, но легко адаптируется:

1. **Товары** — заполните Google Sheets или отредактируйте `data/prices.json`
2. **Зоны доставки** — измените координаты и расчёт в `api.py` (`calc_delivery_price`, `haversine`)
3. **Оформление** — CSS-переменные в `frontend/src/index.css` для цветов и шрифтов
4. **Админы** — укажите Telegram ID в `ADMIN_IDS`
5. **AI-помощник** — опционален, работает через [FreeQwenApi](https://github.com/y13sint/FreeQwenApi)

## Лицензия

MIT
