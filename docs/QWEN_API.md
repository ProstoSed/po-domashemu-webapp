# FreeQwenApi — Анализ и правила работы

> Источник: https://github.com/y13sint/FreeQwenApi
> Дата анализа: 2026-03-11

---

## Что это такое

FreeQwenApi — это **Node.js прокси-сервер**, который эмулирует браузер (Puppeteer + Stealth) для доступа к бесплатному веб-интерфейсу [chat.qwen.ai](https://chat.qwen.ai). Он предоставляет **OpenAI-совместимый API** — можно использовать как drop-in замену OpenAI.

**Ключевой момент:** это НЕ Python-библиотека. Это отдельный Express-сервер на Node.js, который нужно запускать как отдельный сервис (или в Docker-контейнере).

---

## Архитектура

```
[Наш backend (Python)]  →  HTTP POST  →  [FreeQwenApi (Node.js, порт 3264)]
                                               ↓
                                    [Puppeteer + Stealth Browser]
                                               ↓
                                    [chat.qwen.ai API v2]
```

### Компоненты прокси:
- **Express HTTP сервер** (порт 3264) — принимает запросы
- **Puppeteer + Stealth** — headless Chrome для обхода защиты
- **Token Manager** — ротация нескольких аккаунтов
- **Page Pool** — пул браузерных страниц для параллельных запросов

---

## Как работает авторизация

1. При первом запуске (`node index.js`) открывается интерактивное меню
2. Выбираешь "Добавить аккаунт" → открывается браузер → логинишься в Qwen
3. Токен сохраняется в `accounts/` (JWT токен из localStorage браузера)
4. При запросах прокси подставляет токен в заголовок `Authorization: Bearer <token>`
5. Поддерживается несколько аккаунтов с автоматической ротацией при rate-limit

---

## API эндпоинты (прокси)

### POST /api/chat (простой)
```json
{
    "message": "текст сообщения",
    "model": "qwen-max-latest"
}
```

### POST /api/chat/completions (OpenAI-совместимый) — РЕКОМЕНДУЕТСЯ
```json
{
    "model": "qwen-max-latest",
    "messages": [
        { "role": "system", "content": "Ты помощник..." },
        { "role": "user", "content": "Привет!" }
    ],
    "stream": false
}
```

**Ответ:**
```json
{
    "id": "chatcmpl-...",
    "model": "qwen-max-latest",
    "choices": [{
        "index": 0,
        "message": { "role": "assistant", "content": "Ответ..." },
        "finish_reason": "stop"
    }],
    "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 },
    "chatId": "...",
    "parentId": "..."
}
```

### GET /api/models
Список доступных моделей.

### GET /api/status
Статус авторизации и аккаунтов.

---

## Доступные модели (25+)

| Категория | Модели |
|-----------|--------|
| Стандартные | `qwen-max-latest`, `qwen-plus-latest`, `qwen-turbo-latest` |
| Qwen 3 | `qwen3`, `qwen3-max`, `qwen3-plus` |
| **Qwen 3.5** | `qwen3.5-plus`, `qwen3.5-flash`, `qwen3.5-397b-a17b` |
| Coder | `qwen3-coder-plus`, `qwen2.5-coder-*b-instruct` |
| Визуальные | `qwen-vl-max`, `qwen-vl-plus` |

**Рекомендация для нашего проекта:** `qwen3.5-plus` или `qwen-max-latest` — лучшее качество для рекомендаций.

---

## Зависимости

```json
{
    "puppeteer": "^24.31.0",        // Headless Chrome
    "puppeteer-extra": "^3.3.6",    // Расширения для обхода защиты
    "puppeteer-extra-plugin-stealth": "^2.11.2",
    "express": "^4.18.2",           // HTTP сервер
    "axios": "^1.9.0",
    "ali-oss": "^6.23.0",           // Для загрузки файлов в Aliyun OSS
    "multer": "^2.0.0",             // File upload middleware
    "winston": "^3.17.0",           // Логирование
    "openai": "^4.104.0"            // Для примеров (не нужен серверу)
}
```

**ВАЖНО:** Puppeteer скачивает Chromium (~200MB). Для Docker используется отдельный `Dockerfile` с `puppeteer/puppeteer` base image.

---

## Как интегрировать в наш проект

### Вариант 1: Docker-контейнер (РЕКОМЕНДУЕТСЯ для VPS)
```yaml
# docker-compose.yml на VPS
services:
  qwen-proxy:
    build: ./temp_qwen_api
    ports:
      - "127.0.0.1:3264:3264"
    environment:
      - SKIP_ACCOUNT_MENU=true
      - NON_INTERACTIVE=true
    volumes:
      - ./qwen_accounts:/app/accounts
    restart: unless-stopped
```

### Вариант 2: Прямой HTTP-запрос из Python (наш backend)
```python
import httpx

QWEN_PROXY_URL = "http://localhost:3264"

async def ask_qwen(message: str, system_prompt: str = None) -> str:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": message})

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{QWEN_PROXY_URL}/api/chat/completions",
            json={
                "model": "qwen-max-latest",
                "messages": messages,
                "stream": False
            }
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]
```

---

## Ограничения и риски

### Rate Limits
- Qwen ограничивает запросы на аккаунт (~лимит запросов в сутки, точное число неизвестно)
- При rate-limit прокси помечает аккаунт на 24ч и переключается на следующий
- **Рекомендация:** 2-3 аккаунта для стабильной работы

### Стабильность
- **Может сломаться** если Qwen изменит API или добавит защиту
- Puppeteer browser может "зависнуть" — нужен мониторинг / автоперезапуск
- JWT токен аккаунта истекает — нужна переавторизация

### Безопасность
- Прокси не имеет встроенной авторизации (файл `Authorization.txt` пустой по умолчанию)
- Слушать ТОЛЬКО на `127.0.0.1`, НЕ на `0.0.0.0` в продакшне
- Не хранить чувствительные данные в промптах

---

## Правила работы для нашего проекта

1. **Таймаут:** ставить 60 секунд на запрос (Qwen может долго думать)
2. **Retry:** максимум 2 попытки, при ошибке → показать пользователю "Помощник временно недоступен"
3. **Не отправлять** персональные данные пользователей (телефон, адрес) в промпте
4. **Кешировать** системный промпт с меню — обновлять только при синхронизации цен
5. **Модель:** `qwen-max-latest` по умолчанию (хорошее качество на русском)
6. **stream: false** — мы не используем стриминг, ждём полный ответ
7. **Авторизация аккаунтов** — настраивается один раз на VPS, потом `SKIP_ACCOUNT_MENU=true`

---

## Настройка на VPS

```bash
# 1. Клонировать FreeQwenApi на VPS
cd /opt/bots
git clone https://github.com/y13sint/FreeQwenApi qwen-proxy

# 2. Первый запуск — авторизация аккаунта (нужен GUI или VNC)
cd qwen-proxy && npm install && node index.js
# → Выбрать "1 - Добавить аккаунт" → залогиниться в Qwen

# 3. Запустить как Docker-контейнер
docker build -t qwen-proxy .
docker run -d --name qwen-proxy \
    --restart unless-stopped \
    -p 127.0.0.1:3264:3264 \
    -v /opt/bots/qwen-proxy/accounts:/app/accounts \
    -e SKIP_ACCOUNT_MENU=true \
    -e NON_INTERACTIVE=true \
    qwen-proxy
```

---

## Моё мнение

**Плюсы:**
- Бесплатный доступ к мощным моделям Qwen 3.5
- OpenAI-совместимый API — легко интегрировать
- Поддержка нескольких аккаунтов
- Docker-ready

**Минусы:**
- Зависимость от Puppeteer (тяжёлый, ~200MB Chromium)
- Может сломаться при обновлении Qwen
- Rate limits непредсказуемы
- Нужна первичная ручная авторизация (через браузер)

**Вывод:** для нашего use-case (рекомендации из меню, ~10-50 запросов в день) — **вполне достаточно**. Если сломается — заменим на другой API.
