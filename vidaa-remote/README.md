# Kady · Lokale VIDAA-Fernbedienung

Steuert einen Hisense/VIDAA-TV **nur im Heimnetz** über MQTT/TLS (Port **36669**) — ohne Hisense-Cloud. Das Backend nutzt [`vidaa-control`](https://github.com/tombabolewski/vidaa-control) (Client-Zertifikat inkl.), speichert Pairing-Tokens lokal und liefert eine Browser-Remote.

Wohnzimmer-TV-Beispiel-IP: `192.168.0.216`

## Voraussetzungen

- PC/Raspberry Pi und TV im **gleichen WLAN**
- Am TV: **Content Sharing** / Multimedia-Freigabe aktiv (Einstellungen → Verbindung / Multimedia)
- Privacy/Disclaimer am TV akzeptiert
- TV an oder im Netzwerk-Standby
- **Kein Zugriff von außerhalb** des Heimnetzes ohne eigene Bridge/VPN

Firmware kann sich unterscheiden (Auth/Protokoll). Bei Verbindungsproblemen TV neu starten und erneut pairen.

## Setup

```bash
cd vidaa-remote
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

Browser öffnen: **http://\<IP-dieses-PCs\>:8787**  
(am PC selbst: http://127.0.0.1:8787)

Optional per Umgebungsvariable:

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `TV_HOST` | `192.168.0.216` | TV-IP |
| `TV_MAC` | leer | MAC für Wake-on-LAN / dynamische Auth |
| `LISTEN_HOST` | `0.0.0.0` | Bind-Adresse |
| `LISTEN_PORT` | `8787` | Web-Port |

## Bedienung

1. **Suchen** — SSDP/UDP-Discovery im LAN (oder IP manuell lassen)
2. **Verbinden** — MQTT/TLS zu Port 36669
3. **PIN anfordern** — 4-stellige PIN erscheint auf dem TV
4. PIN eingeben → **Pairing** (Tokens unter `data/tokens.json`)
5. Remote nutzen: D-Pad, Volume, Power, Apps

## Was passiert technisch?

```
Browser-UI  →  Flask (:8787)  →  vidaa-control  →  TV MQTT/TLS (:36669)
```

- Discovery: SSDP + UDP-Broadcast  
- Auth: Client-Zertifikat (mTLS) + einmalige PIN → Access/Refresh-Token  
- Befehle: `sendkey`, Volume, Power, Source, App-Launch  

## Sicherheit

- Nur im LAN betreiben; Port 8787 nicht ins Internet freigeben
- `data/tokens.json` nicht committen (steht in `.gitignore`)
- Keine Exploits: bestimmungsgemäße Fernbedienung als Gerätebesitzer

## Hinweise

- DHCP kann die TV-IP ändern → Router-Reservation für `192.168.0.216` empfohlen
- Cloud-Agenten außerhalb des Heimnetzes erreichen den TV **nicht**
- Offizielle VIDAA-App und dieses Tool nutzen denselben lokalen MQTT-Kanal
