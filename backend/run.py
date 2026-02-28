"""
webapp-bot/backend/run.py

Запуск бота и FastAPI сервера в одном процессе.

Использование:
    python run.py

Бот работает через long-polling.
FastAPI слушает на порту 8000 (нужен только если хотите живой /api/prices).
"""
import asyncio
import logging
import threading

import uvicorn

from api import app as fastapi_app
from bot import main as bot_main

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)


def run_api() -> None:
    """Запустить FastAPI в отдельном потоке."""
    uvicorn.run(fastapi_app, host='0.0.0.0', port=8000, log_level='info')


async def run_all() -> None:
    log.info('Запуск WebApp-бота + API...')

    # FastAPI в фоновом потоке
    api_thread = threading.Thread(target=run_api, daemon=True)
    api_thread.start()
    log.info('FastAPI запущен на http://0.0.0.0:8000')

    # Бот в основном event loop
    await bot_main()


if __name__ == '__main__':
    asyncio.run(run_all())
