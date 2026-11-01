#!/usr/bin/env python3
"""Lokales VIDAA-TV-Backend: Discovery, MQTT/TLS-Pairing, Web-Remote."""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import Any, Optional

from flask import Flask, jsonify, request, send_from_directory

from vidaa import VidaaTV, discover_all, probe_ip
from vidaa.config import TokenStorage
from vidaa.keys import get_key

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("vidaa-remote")

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

DEFAULT_HOST = os.environ.get("TV_HOST", "192.168.0.216")
DEFAULT_MAC = os.environ.get("TV_MAC", "")
LISTEN_HOST = os.environ.get("LISTEN_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("LISTEN_PORT", "8787"))

app = Flask(__name__, static_folder=str(STATIC), static_url_path="/static")

_lock = threading.RLock()
_tv: Optional[VidaaTV] = None
_state: dict[str, Any] = {
    "host": DEFAULT_HOST,
    "mac": DEFAULT_MAC or None,
    "port": 36669,
    "connected": False,
    "paired": False,
    "pairing": False,
    "last_error": None,
    "name": None,
}


def _storage() -> TokenStorage:
    return TokenStorage(DATA / "tokens.json")


def _has_token(host: str, port: int = 36669) -> bool:
    status = _storage().get_token_status(host, port)
    return bool(status and status.get("has_token"))


def _ensure_client(host: Optional[str] = None, mac: Optional[str] = None) -> VidaaTV:
    global _tv
    host = (host or _state["host"] or DEFAULT_HOST).strip()
    mac = (mac if mac is not None else _state.get("mac") or DEFAULT_MAC or "").strip() or None
    with _lock:
        if _tv is not None:
            same_host = getattr(_tv, "host", None) == host
            if same_host and _tv.is_connected:
                return _tv
            try:
                _tv.disconnect()
            except Exception:
                pass
            _tv = None

        _state["host"] = host
        _state["mac"] = mac
        _tv = VidaaTV(
            host=host,
            port=36669,
            mac_address=mac,
            use_dynamic_auth=True,
            auto_detect_protocol=True,
            enable_persistence=True,
            storage=_storage(),
            verify_ssl=False,
        )
        return _tv


def _public_state() -> dict[str, Any]:
    with _lock:
        connected = bool(_tv and _tv.is_connected)
        host = _state["host"]
        paired = _has_token(host) if host else False
        return {
            "host": host,
            "mac": _state.get("mac"),
            "port": _state["port"],
            "connected": connected,
            "paired": paired,
            "pairing": _state.get("pairing", False),
            "last_error": _state.get("last_error"),
            "name": _state.get("name"),
        }


@app.get("/")
def index():
    return send_from_directory(STATIC, "index.html")


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "vidaa-remote"})


@app.get("/api/status")
def status():
    return jsonify(_public_state())


@app.post("/api/discover")
def discover():
    timeout = float((request.json or {}).get("timeout", 5.0))
    try:
        devices = discover_all(timeout=timeout)
        result = []
        for ip, d in devices.items():
            result.append(
                {
                    "ip": ip,
                    "port": getattr(d, "port", 36669),
                    "name": getattr(d, "name", None),
                    "model": getattr(d, "model", None),
                    "mac": getattr(d, "mac", None),
                    "source": getattr(d, "source", None),
                }
            )
        # Fallback: probe configured IP if LAN discovery is empty
        if not result and _state.get("host"):
            probed = probe_ip(_state["host"])
            if probed:
                result.append(
                    {
                        "ip": probed.ip,
                        "port": probed.port,
                        "name": probed.name,
                        "model": probed.model,
                        "mac": probed.mac,
                        "source": "probe",
                    }
                )
        return jsonify({"devices": result})
    except Exception as e:
        log.exception("discover failed")
        return jsonify({"devices": [], "error": str(e)}), 500


@app.post("/api/connect")
def connect():
    body = request.json or {}
    host = (body.get("host") or _state["host"] or DEFAULT_HOST).strip()
    mac = (body.get("mac") or _state.get("mac") or DEFAULT_MAC or "").strip() or None
    try:
        tv = _ensure_client(host, mac)
        with _lock:
            ok = tv.connect(timeout=10.0)
            _state["connected"] = ok
            _state["paired"] = _has_token(host)
            _state["last_error"] = None if ok else "Verbindung fehlgeschlagen"
            if body.get("name"):
                _state["name"] = body["name"]
        return jsonify({"ok": ok, **_public_state()})
    except Exception as e:
        log.exception("connect failed")
        _state["last_error"] = str(e)
        return jsonify({"ok": False, "error": str(e), **_public_state()}), 500


@app.post("/api/pair/start")
def pair_start():
    """PIN-Dialog auf dem TV auslösen (einmalig)."""
    body = request.json or {}
    host = (body.get("host") or _state["host"] or DEFAULT_HOST).strip()
    mac = (body.get("mac") or _state.get("mac") or DEFAULT_MAC or "").strip() or None
    try:
        tv = _ensure_client(host, mac)
        with _lock:
            if not tv.is_connected:
                if not tv.connect(timeout=10.0):
                    _state["last_error"] = "Keine MQTT-Verbindung (Port 36669)"
                    return jsonify({"ok": False, "error": _state["last_error"], **_public_state()}), 502
            ok = tv.start_pairing()
            _state["pairing"] = True
            _state["last_error"] = None if ok else "PIN-Dialog konnte nicht gestartet werden"
        return jsonify({"ok": ok, "message": "PIN sollte auf dem TV erscheinen", **_public_state()})
    except Exception as e:
        log.exception("pair start failed")
        _state["last_error"] = str(e)
        return jsonify({"ok": False, "error": str(e), **_public_state()}), 500


@app.post("/api/pair/confirm")
def pair_confirm():
    body = request.json or {}
    pin = str(body.get("pin", "")).strip()
    if not pin or not pin.isdigit():
        return jsonify({"ok": False, "error": "Bitte 4-stellige PIN eingeben"}), 400
    try:
        tv = _ensure_client()
        with _lock:
            if not tv.is_connected and not tv.connect(timeout=10.0):
                return jsonify({"ok": False, "error": "Nicht verbunden", **_public_state()}), 502
            ok = tv.authenticate(pin)
            _state["pairing"] = False
            _state["paired"] = ok or _has_token(_state["host"])
            _state["last_error"] = None if ok else "PIN ungültig oder abgelaufen"
        return jsonify({"ok": ok, **_public_state()})
    except Exception as e:
        log.exception("pair confirm failed")
        _state["last_error"] = str(e)
        return jsonify({"ok": False, "error": str(e), **_public_state()}), 500


@app.post("/api/key")
def send_key():
    body = request.json or {}
    key = str(body.get("key", "")).strip()
    if not key:
        return jsonify({"ok": False, "error": "key fehlt"}), 400
    resolved = get_key(key)
    try:
        tv = _ensure_client()
        with _lock:
            if not tv.is_connected and not tv.connect(timeout=10.0):
                return jsonify({"ok": False, "error": "Nicht verbunden — zuerst Connect/Pairing", **_public_state()}), 502
            ok = tv.send_key(resolved)
        return jsonify({"ok": ok, "key": resolved, **_public_state()})
    except Exception as e:
        log.exception("send_key failed")
        _state["last_error"] = str(e)
        return jsonify({"ok": False, "error": str(e), **_public_state()}), 500


@app.post("/api/volume")
def volume():
    body = request.json or {}
    action = str(body.get("action", "up")).lower()
    try:
        tv = _ensure_client()
        with _lock:
            if not tv.is_connected and not tv.connect(timeout=10.0):
                return jsonify({"ok": False, "error": "Nicht verbunden", **_public_state()}), 502
            if action == "up":
                ok = tv.volume_up()
            elif action == "down":
                ok = tv.volume_down()
            elif action == "mute":
                ok = tv.mute()
            elif action == "set":
                level = int(body.get("level", 20))
                ok = tv.set_volume(level)
            else:
                return jsonify({"ok": False, "error": "action: up|down|mute|set"}), 400
        return jsonify({"ok": ok, "action": action, **_public_state()})
    except Exception as e:
        log.exception("volume failed")
        _state["last_error"] = str(e)
        return jsonify({"ok": False, "error": str(e), **_public_state()}), 500


@app.post("/api/power")
def power():
    body = request.json or {}
    action = str(body.get("action", "toggle")).lower()
    try:
        tv = _ensure_client()
        with _lock:
            if not tv.is_connected and not tv.connect(timeout=10.0):
                return jsonify({"ok": False, "error": "Nicht verbunden", **_public_state()}), 502
            if action == "on":
                ok = tv.power_on()
            elif action == "off":
                ok = tv.power_off()
            else:
                ok = tv.power()
        return jsonify({"ok": ok, "action": action, **_public_state()})
    except Exception as e:
        log.exception("power failed")
        _state["last_error"] = str(e)
        return jsonify({"ok": False, "error": str(e), **_public_state()}), 500


@app.post("/api/source")
def set_source():
    body = request.json or {}
    source = str(body.get("source", "")).strip().lower()
    if not source:
        return jsonify({"ok": False, "error": "source fehlt (hdmi1, tv, …)"}), 400
    try:
        tv = _ensure_client()
        with _lock:
            if not tv.is_connected and not tv.connect(timeout=10.0):
                return jsonify({"ok": False, "error": "Nicht verbunden", **_public_state()}), 502
            ok = tv.set_source(source)
        return jsonify({"ok": ok, "source": source, **_public_state()})
    except Exception as e:
        log.exception("set_source failed")
        _state["last_error"] = str(e)
        return jsonify({"ok": False, "error": str(e), **_public_state()}), 500


@app.post("/api/app")
def launch_app():
    body = request.json or {}
    name = str(body.get("name", "")).strip().lower()
    if not name:
        return jsonify({"ok": False, "error": "name fehlt"}), 400
    try:
        tv = _ensure_client()
        with _lock:
            if not tv.is_connected and not tv.connect(timeout=10.0):
                return jsonify({"ok": False, "error": "Nicht verbunden", **_public_state()}), 502
            ok = tv.launch_app(name)
        return jsonify({"ok": ok, "app": name, **_public_state()})
    except Exception as e:
        log.exception("launch_app failed")
        _state["last_error"] = str(e)
        return jsonify({"ok": False, "error": str(e), **_public_state()}), 500


@app.post("/api/disconnect")
def disconnect():
    global _tv
    with _lock:
        if _tv is not None:
            try:
                _tv.disconnect()
            except Exception:
                pass
            _tv = None
        _state["connected"] = False
        _state["pairing"] = False
    return jsonify({"ok": True, **_public_state()})


def main():
    log.info(
        "VIDAA Remote auf http://%s:%s  (TV-Default %s)",
        LISTEN_HOST,
        LISTEN_PORT,
        DEFAULT_HOST,
    )
    log.info("Nur Heimnetz — MQTT/TLS Port 36669. Kein Cloud-Zugriff.")
    app.run(host=LISTEN_HOST, port=LISTEN_PORT, debug=False, threaded=True)


if __name__ == "__main__":
    main()
