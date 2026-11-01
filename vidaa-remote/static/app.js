const $ = (sel) => document.querySelector(sel);
const statusEl = $("#status");
const devicesEl = $("#devices");

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const msg = data.error || data.last_error || `Fehler ${res.status}`;
    setStatus(msg, "err");
    throw new Error(msg);
  }
  return data;
}

async function refreshStatus() {
  try {
    const res = await fetch("/api/status");
    const s = await res.json();
    const bits = [
      s.connected ? "verbunden" : "getrennt",
      s.paired ? "gepaart" : "nicht gepaart",
      s.host || "?",
    ];
    setStatus(bits.join(" · "), s.connected && s.paired ? "ok" : "");
    if (s.host) $("#host").value = s.host;
    if (s.mac) $("#mac").value = s.mac;
  } catch {
    setStatus("Backend nicht erreichbar", "err");
  }
}

function tvBody() {
  return {
    host: $("#host").value.trim(),
    mac: $("#mac").value.trim() || undefined,
  };
}

$("#btnDiscover").addEventListener("click", async () => {
  setStatus("Suche im LAN…");
  devicesEl.hidden = true;
  devicesEl.innerHTML = "";
  try {
    const data = await api("/api/discover", { timeout: 5 });
    const list = data.devices || [];
    if (!list.length) {
      setStatus("Kein TV gefunden — IP manuell prüfen", "err");
      return;
    }
    devicesEl.hidden = false;
    for (const d of list) {
      const li = document.createElement("li");
      li.textContent = `${d.name || "TV"} · ${d.ip}${d.mac ? ` · ${d.mac}` : ""}`;
      li.addEventListener("click", () => {
        $("#host").value = d.ip;
        if (d.mac) $("#mac").value = d.mac;
        setStatus(`Gewählt: ${d.ip}`, "ok");
      });
      devicesEl.appendChild(li);
    }
    setStatus(`${list.length} Gerät(e) gefunden`, "ok");
  } catch {
    /* status already set */
  }
});

$("#btnConnect").addEventListener("click", async () => {
  setStatus("Verbinde MQTT/TLS :36669 …");
  try {
    const s = await api("/api/connect", tvBody());
    setStatus(
      s.paired ? `Verbunden mit ${s.host}` : `Verbunden — Pairing nötig (${s.host})`,
      s.paired ? "ok" : "err"
    );
  } catch {
    /* */
  }
});

$("#btnPairStart").addEventListener("click", async () => {
  setStatus("PIN auf dem TV anfordern…");
  try {
    await api("/api/pair/start", tvBody());
    setStatus("PIN sollte auf dem TV stehen — hier eingeben", "ok");
    $("#pin").focus();
  } catch {
    /* */
  }
});

$("#btnPairConfirm").addEventListener("click", async () => {
  const pin = $("#pin").value.trim();
  if (!pin) {
    setStatus("PIN eingeben", "err");
    return;
  }
  setStatus("Pairing…");
  try {
    await api("/api/pair/confirm", { pin });
    setStatus("Pairing erfolgreich — Tokens gespeichert", "ok");
    $("#pin").value = "";
  } catch {
    /* */
  }
});

$("#btnPower").addEventListener("click", async () => {
  try {
    await api("/api/power", { action: "toggle" });
    flash($("#btnPower"));
  } catch {
    /* */
  }
});

function flash(el) {
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 120);
}

document.querySelectorAll("[data-key]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await api("/api/key", { key: btn.dataset.key });
      flash(btn);
    } catch {
      /* */
    }
  });
});

document.querySelectorAll("[data-vol]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await api("/api/volume", { action: btn.dataset.vol });
      flash(btn);
    } catch {
      /* */
    }
  });
});

document.querySelectorAll("[data-app]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await api("/api/app", { name: btn.dataset.app });
      flash(btn);
    } catch {
      /* */
    }
  });
});

document.querySelectorAll("[data-source]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await api("/api/source", { source: btn.dataset.source });
      flash(btn);
    } catch {
      /* */
    }
  });
});

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input")) return;
  const map = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Enter: "ok",
    Backspace: "back",
    Escape: "back",
    Home: "home",
  };
  if (map[e.key]) {
    e.preventDefault();
    api("/api/key", { key: map[e.key] }).catch(() => {});
  } else if (e.key === "+" || e.key === "=") {
    api("/api/volume", { action: "up" }).catch(() => {});
  } else if (e.key === "-") {
    api("/api/volume", { action: "down" }).catch(() => {});
  } else if (e.key.toLowerCase() === "m") {
    api("/api/volume", { action: "mute" }).catch(() => {});
  }
});

refreshStatus();
setInterval(refreshStatus, 8000);
