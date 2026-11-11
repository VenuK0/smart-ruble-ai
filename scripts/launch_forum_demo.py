"""Start an isolated SmartRubleAI demo server, seed it, open the local UI.

Use the virtualenv Python: .venv\\Scripts\\python.exe scripts\\launch_forum_demo.py
Ctrl+C stops the server. This script binds only to 127.0.0.1, uses a random
available port, and never accesses external services.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

if __package__:
    from .prepare_forum_demo import prepare
else:
    from prepare_forum_demo import prepare

PROJECT = Path(__file__).resolve().parents[1]
HOST = "127.0.0.1"


def find_local_port():
    # Prefer a stable address, but use a separate socket for fallback so a
    # failed bind on Windows cannot leave the socket in an unusable state.
    for port in (8000, 0):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((HOST, port))
            except OSError:
                if port == 8000:
                    continue
                raise
            return sock.getsockname()[1]
    raise OSError("Не удалось подобрать локальный порт")


def wait_for_server(base, process, timeout=30):
    """Wait for our child process to expose a local simulation health endpoint."""
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if process.poll() is not None:
            raise RuntimeError("Локальный сервер завершился до запуска. Проверьте зависимости.")
        try:
            with urllib.request.urlopen(base + "/health", timeout=1) as response:
                data = json.load(response)
            if data.get("mode") == "simulation":
                return
        except (OSError, ValueError, urllib.error.URLError):
            pass
        time.sleep(0.3)
    raise RuntimeError("Сервер не ответил за 30 секунд; проверьте установку Python.")


def main():
    port = find_local_port()
    base = f"http://{HOST}:{port}"
    command = [
        sys.executable, "-m", "uvicorn", "smartruble.api:app",
        "--app-dir", "src", "--host", HOST, "--port", str(port),
        "--log-level", "warning",
    ]
    kwargs = {"cwd": str(PROJECT), "stdin": subprocess.DEVNULL}
    if sys.platform == "win32":
        # Keep both child server and launcher attached to this console.
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    child = subprocess.Popen(command, **kwargs)
    try:
        wait_for_server(base, child)
        demo = prepare(base)
        address = base + "/app/history"
        print("\nSmartRubleAI v0.5 — демонстрационный режим (без реальных платежей)")
        print("Ссылка:", address)
        print("Используйте вкладку именно с ЭТИМ адресом. После перезапуска")
        print("закройте старую вкладку: прежний порт может больше не работать.")
        print("Активная смета:", demo["grant_id"])
        print("В очереди:", demo["pending"], "спорных позиции: 175 ₽ и 200 ₽")
        print("Проверка: одобрить 175 ₽, попытаться одобрить 200 ₽, отклонить 200 ₽.")
        print("Данные в оперативной памяти. Для остановки нажмите Ctrl+C.\n")
        webbrowser.open(address)
        while child.poll() is None:
            time.sleep(0.5)
        raise RuntimeError("Сервер неожиданно завершился. Запустите демо снова.")
    except KeyboardInterrupt:
        print("\nДемонстрационный сервер остановлен.")
    finally:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)


if __name__ == "__main__":
    main()
