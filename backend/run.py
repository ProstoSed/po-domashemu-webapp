"""
webapp-bot/backend/run.py

Запуск бота и FastAPI сервера в одном процессе.

Использование:
    python run.py

Бот работает через long-polling.
FastAPI слушает на порту (по умолчанию 8000, или $PORT от Render).
"""
import asyncio
import logging
import os
import threading

import httpx
import uvicorn

from api import app as fastapi_app
from bot import main as bot_main

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

PORT = int(os.getenv('PORT', '8000'))


def run_api() -> None:
    """Запустить FastAPI в отдельном потоке."""
    uvicorn.run(fastapi_app, host='0.0.0.0', port=PORT, log_level='info')


async def keep_alive() -> None:
    """Пинг самого себя каждые 10 мин, чтобы Render не усыпил сервис."""
    render_url = os.getenv('RENDER_EXTERNAL_URL')
    if not render_url:
        return  # Локально — пинг не нужен
    url = f'{render_url}/health'
    log.info('Keep-alive включён: %s каждые 10 мин', url)
    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            await asyncio.sleep(600)  # 10 минут
            try:
                r = await client.get(url)
                log.debug('Keep-alive ping: %s', r.status_code)
            except Exception as exc:
                log.warning('Keep-alive error: %s', exc)


async def warmup_qwen() -> None:
    """Фоновый прогрев qwen-proxy — запускает Chromium заранее."""
    from config import QWEN_PROXY_URL
    if not QWEN_PROXY_URL:
        return
    url = f'{QWEN_PROXY_URL}/api/v1/chat/completions'
    log.info('Прогрев qwen-proxy: %s', url)
    await asyncio.sleep(5)  # подождать запуск FastAPI
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, json={
                'model': 'qwen-max-latest',
                'messages': [{'role': 'user', 'content': 'ping'}],
            })
            log.info('Qwen-proxy warmup: %s', r.status_code)
    except Exception as exc:
        log.warning('Qwen-proxy warmup failed (не критично): %s', exc)


async def run_all() -> None:
    log.info('Запуск WebApp-бота + API...')

    # FastAPI в фоновом потоке
    api_thread = threading.Thread(target=run_api, daemon=True)
    api_thread.start()
    log.info('FastAPI запущен на http://0.0.0.0:%s', PORT)

    # Keep-alive пинг (только на Render)
    asyncio.create_task(keep_alive())

    # Прогрев qwen-proxy (фоново, не блокирует старт)
    asyncio.create_task(warmup_qwen())

    # Бот в основном event loop
    await bot_main()


if __name__ == '__main__':
    asyncio.run(run_all())
