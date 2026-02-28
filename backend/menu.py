"""
menu.py — Управление WebApp-ботом «По-домашнему»
Запуск: python menu.py  или  webapp-bot/меню.bat
"""
import os
import sys
import subprocess
import time
import webbrowser

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
WEBAPP_DIR  = os.path.dirname(BACKEND_DIR)           # webapp-bot/
FRONTEND_DIR = os.path.join(WEBAPP_DIR, 'frontend')
FRONTEND_URL = 'http://localhost:5173'


def clear():
    os.system('cls' if os.name == 'nt' else 'clear')


# ──────────────────────────────────────────────
# Определение запущенных процессов
# ──────────────────────────────────────────────

def _find_pids(keyword: str) -> list[int]:
    """Находит PID python.exe процессов, в командной строке которых есть keyword."""
    try:
        result = subprocess.run(
            ['wmic', 'process', 'where', "name='python.exe'",
             'get', 'ProcessId,CommandLine'],
            capture_output=True, text=True, encoding='utf-8', errors='replace'
        )
        pids = []
        for line in result.stdout.splitlines():
            if keyword in line.lower() and 'menu.py' not in line.lower():
                parts = line.strip().split()
                if parts:
                    try:
                        pids.append(int(parts[-1]))
                    except ValueError:
                        pass
        return pids
    except Exception:
        return []


def find_backend_pids() -> list[int]:
    return _find_pids('run.py')


def find_npm_pids() -> list[int]:
    """Ищет npm/node процессы с vite."""
    try:
        result = subprocess.run(
            ['wmic', 'process', 'where', "name='node.exe'",
             'get', 'ProcessId,CommandLine'],
            capture_output=True, text=True, encoding='utf-8', errors='replace'
        )
        pids = []
        for line in result.stdout.splitlines():
            if 'vite' in line.lower():
                parts = line.strip().split()
                if parts:
                    try:
                        pids.append(int(parts[-1]))
                    except ValueError:
                        pass
        return pids
    except Exception:
        return []


def kill_pids(pids: list[int]) -> bool:
    if not pids:
        return False
    for pid in pids:
        try:
            subprocess.run(['taskkill', '/F', '/PID', str(pid)], capture_output=True)
        except Exception:
            pass
    return True


# ──────────────────────────────────────────────
# Меню
# ──────────────────────────────────────────────

def show_menu():
    clear()
    backend_on = len(find_backend_pids()) > 0
    frontend_on = len(find_npm_pids()) > 0
    b_status = '[ВКЛ]  ' if backend_on  else '[ВЫКЛ] '
    f_status = '[ВКЛ]  ' if frontend_on else '[ВЫКЛ] '

    print()
    print('  ========================================================')
    print('      ПО-ДОМАШНЕМУ --- WebApp Бот + API')
    print('  ========================================================')
    print()
    print(f'  Backend (бот + API):  {b_status}')
    print(f'  Frontend (dev):       {f_status}  {FRONTEND_URL}')
    print()
    print('  --------------------------------------------------------')
    print()
    print('     1.  Запустить backend (бот + API)')
    print('     2.  Остановить backend')
    print('     3.  Перезапустить backend')
    print()
    print('     4.  Запустить frontend (dev сервер)')
    print('     5.  Остановить frontend')
    print()
    print('     6.  Открыть приложение в браузере')
    print('     7.  Показать статус (подробно)')
    print('     8.  Открыть папку проекта')
    print()
    print('     9.  Выход')
    print()
    print('  --------------------------------------------------------')
    print()


# ──────────────────────────────────────────────
# Действия
# ──────────────────────────────────────────────

def start_backend():
    clear()
    print('\n  Запуск backend (бот + API)...\n')
    if find_backend_pids():
        print('  Backend уже запущен!')
    else:
        env_path = os.path.join(BACKEND_DIR, '.env')
        if not os.path.exists(env_path):
            print('  ОШИБКА: .env не найден!')
            print(f'  Скопируйте .env.example → .env в папке:')
            print(f'  {BACKEND_DIR}')
            print()
            input('  Нажмите Enter...')
            return
        subprocess.Popen(
            f'start "WebApp Backend" cmd /k "chcp 65001 >nul && cd /d {BACKEND_DIR} && echo Запуск backend... && python run.py"',
            shell=True
        )
        print('  Backend запускается в новом окне.')
        print('  Бот: polling | API: http://0.0.0.0:8000')
    print()
    input('  Нажмите Enter...')


def stop_backend():
    clear()
    print('\n  Остановка backend...\n')
    pids = find_backend_pids()
    if not pids:
        print('  Backend не запущен.')
    else:
        kill_pids(pids)
        print('  Backend остановлен.')
    print()
    input('  Нажмите Enter...')


def restart_backend():
    clear()
    print('\n  Перезапуск backend...\n')
    kill_pids(find_backend_pids())
    print('  Останавливаем...')
    time.sleep(2)
    subprocess.Popen(
        f'start "WebApp Backend" cmd /k "chcp 65001 >nul && cd /d {BACKEND_DIR} && echo Запуск backend... && python run.py"',
        shell=True
    )
    print('  Backend перезапущен.')
    print()
    input('  Нажмите Enter...')


def start_frontend():
    clear()
    print('\n  Запуск frontend dev сервера...\n')
    if find_npm_pids():
        print('  Frontend уже запущен!')
        print(f'  Откройте: {FRONTEND_URL}')
    else:
        subprocess.Popen(
            f'start "WebApp Frontend" cmd /k "chcp 65001 >nul && cd /d {FRONTEND_DIR} && echo Запуск frontend... && npm run dev"',
            shell=True
        )
        print('  Frontend запускается в новом окне.')
        print(f'  Через несколько секунд откроется: {FRONTEND_URL}')
    print()
    input('  Нажмите Enter...')


def stop_frontend():
    clear()
    print('\n  Остановка frontend...\n')
    pids = find_npm_pids()
    if not pids:
        print('  Frontend не запущен.')
    else:
        kill_pids(pids)
        print('  Frontend остановлен.')
    print()
    input('  Нажмите Enter...')


def open_browser():
    webbrowser.open(FRONTEND_URL)
    print(f'\n  Открываем {FRONTEND_URL}...')
    time.sleep(1)


def show_status():
    clear()
    print('\n  Статус WebApp-бота\n')

    b_pids = find_backend_pids()
    f_pids = find_npm_pids()

    if b_pids:
        print(f'  Backend:  ЗАПУЩЕН  (PID: {", ".join(str(p) for p in b_pids)})')
        print( '  API:      http://localhost:8000')
        print( '  Docs:     http://localhost:8000/docs')
    else:
        print('  Backend:  НЕ ЗАПУЩЕН')

    print()
    if f_pids:
        print(f'  Frontend: ЗАПУЩЕН  (PID: {", ".join(str(p) for p in f_pids)})')
        print(f'  URL:      {FRONTEND_URL}')
    else:
        print('  Frontend: НЕ ЗАПУЩЕН')

    print()
    print(f'  Backend папка:  {BACKEND_DIR}')
    print(f'  Frontend папка: {FRONTEND_DIR}')

    env_ok  = '✓ Найден' if os.path.exists(os.path.join(BACKEND_DIR, '.env')) else '✗ НЕТ — скопируйте из .env.example!'
    req_ok  = '✓ Найден' if os.path.exists(os.path.join(BACKEND_DIR, 'requirements.txt')) else '✗ Не найден'
    node_ok = '✓ Найден' if os.path.exists(os.path.join(FRONTEND_DIR, 'node_modules')) else '✗ Нужен npm install'
    print()
    print(f'  .env:          {env_ok}')
    print(f'  requirements:  {req_ok}')
    print(f'  node_modules:  {node_ok}')
    print()
    input('  Нажмите Enter...')


def open_folder():
    os.startfile(WEBAPP_DIR)


# ──────────────────────────────────────────────
# Точка входа
# ──────────────────────────────────────────────

def main():
    actions = {
        '1': start_backend,
        '2': stop_backend,
        '3': restart_backend,
        '4': start_frontend,
        '5': stop_frontend,
        '6': open_browser,
        '7': show_status,
        '8': open_folder,
        '9': lambda: sys.exit(0),
    }

    while True:
        show_menu()
        choice = input('  Введите номер (1-9): ').strip()
        action = actions.get(choice)
        if action:
            action()
        else:
            print('\n  Неверный выбор!')
            time.sleep(1)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n\n  До свидания!\n')
