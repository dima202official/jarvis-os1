const RU_LETTERS = [
  "А","Б","В","Г","Д","Е","Ё","Ж","З","И","Й","К","Л","М","Н","О","П",
  "Р","С","Т","У","Ф","Х","Ц","Ч","Ш","Щ","Ъ","Ы","Ь","Э","Ю","Я",
];
const RU_ALPHABET = RU_LETTERS.join(" ");
const WHO = "САЙЛО";
const MEM_KEY = "silo_memory_v1";
const FACT_CAP = 200;

const log = document.getElementById("log");
const form = document.getElementById("form");
const input = document.getElementById("input");
const core = document.getElementById("core");
const label = document.getElementById("label");
const badge = document.getElementById("badge");
const alphabetEl = document.getElementById("alphabet");
const splash = document.getElementById("splash");

function loadMemory() {
  try {
    const raw = JSON.parse(localStorage.getItem(MEM_KEY) || "{}");
    if (!Array.isArray(raw.entries)) raw.entries = [];
    return raw;
  } catch {
    return { entries: [] };
  }
}

function saveMemory(data) {
  if (data.entries.length > FACT_CAP) data.entries = data.entries.slice(-FACT_CAP);
  localStorage.setItem(MEM_KEY, JSON.stringify(data));
}

function seedProfile() {
  const data = loadMemory();
  const seeds = [
    "Имя пользователя: Дима",
    "Дима говорит по-русски и по-немецки; чаще голосом; просит коротко и медленно",
    "Имя ассистента: Сайло (Silo), не Джарвис",
    "Интерфейс: Jarvis OS1 — бирюзовая сфера, Stark Industries, алфавит 33 буквы с Ё",
  ];
  let changed = false;
  for (const text of seeds) {
    if (!data.entries.some((e) => e.text === text)) {
      data.entries.push({ id: Math.random().toString(36).slice(2, 10), text, at: Date.now() });
      changed = true;
    }
  }
  if (changed) saveMemory(data);
}

function remember(text) {
  const data = loadMemory();
  data.entries.push({ id: Math.random().toString(36).slice(2, 10), text: text.trim(), at: Date.now() });
  saveMemory(data);
  return `Записал в память: ${text.trim()}`;
}

function memoryList() {
  const data = loadMemory();
  if (!data.entries.length) return "Память пуста. /remember факт";
  return "Память:\n" + data.entries.slice(-12).map((e) => `· ${e.text}`).join("\n");
}

function brain(userText) {
  const t = (userText || "").trim();
  const low = t.toLowerCase().replace(/ё/g, "е");
  if (!t) return "Я слушаю. Нажми сферу ещё раз.";
  if (t.startsWith("/remember ") || t.startsWith("/запомни ")) {
    return remember(t.split(/\s+/).slice(1).join(" "));
  }
  if (t === "/memory" || t === "/память" || /\b(память|что знаешь|профиль)\b/.test(low)) {
    return memoryList();
  }
  if (/\b(привет|здравств|добрый|hello|hi)\b/.test(low)) {
    const h = new Date().getHours();
    const g = h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
    return `${g}, Дима. Сайло на связи — жми сферу.`;
  }
  if (/\b(алфавит|буквы|alphabet)\b/.test(low)) {
    return `Полный русский алфавит (33 буквы, включая Ё): ${RU_ALPHABET}.`;
  }
  if (/\b(кто ты|как тебя зовут|представься)\b/.test(low)) {
    return "Я Сайло — твой голосовой ассистент. Не Джарвис. Сфера → голос → ответ.";
  }
  if (/\b(время|который час)\b/.test(low)) {
    return `Сейчас ${new Date().toLocaleString("ru-RU")}.`;
  }
  if (/\b(помощь|команды|help)\b/.test(low)) {
    return "Сфера = СЛУШАТЬ. Команды: алфавит, время, /remember …, /memory. Память в этом Safari (localStorage).";
  }
  if (/\b(позвонил|звонил|called)\b/.test(low)) {
    remember(`Дима сказал: ${t}`);
    return `Запомнил: «${t}». Это останется после перезапуска Safari на этом iPhone.`;
  }
  return `Принял: «${t.slice(0, 140)}». Для вечной записи: /remember …`;
}

function bubble(who, text) {
  const el = document.createElement("div");
  el.className = "bubble";
  const w = document.createElement("span");
  w.className = "who";
  w.textContent = who;
  el.appendChild(w);
  el.appendChild(document.createTextNode(text));
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function setHot(on) {
  core.classList.toggle("hot", on);
  label.textContent = on ? "СЛУШАЮ…" : "СЛУШАТЬ";
}

function speak(text) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ru-RU";
  u.rate = 0.92;
  const voices = window.speechSynthesis.getVoices();
  const ru = voices.find((v) => (v.lang || "").toLowerCase().startsWith("ru"));
  if (ru) u.voice = ru;
  window.speechSynthesis.speak(u);
}

function send(text) {
  const cleaned = (text || "").trim();
  if (!cleaned) return;
  bubble("ВЫ", cleaned);
  input.value = "";
  const reply = brain(cleaned);
  bubble(WHO, reply);
  speak(reply);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  send(input.value);
});

let recognizing = false;
let currentRec = null;
core.addEventListener("click", () => {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) {
    bubble(WHO, "Нет SpeechRecognition — пиши в поле. На iPhone нужен Safari.");
    input.focus();
    return;
  }
  if (recognizing) {
    // Повторное нажатие на сферу останавливает прослушивание.
    try { currentRec && currentRec.stop(); } catch {}
    return;
  }
  if (!window.isSecureContext) {
    bubble(WHO, "Нужен HTTPS (GitHub Pages) для микрофона.");
  }
  const r = new Rec();
  currentRec = r;
  r.lang = "ru-RU";
  r.interimResults = false;
  r.onstart = () => { recognizing = true; setHot(true); };
  r.onend = () => { recognizing = false; setHot(false); };
  r.onerror = (ev) => {
    recognizing = false;
    setHot(false);
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
      bubble(WHO, "Разреши микрофон в Safari (аА → Настройки сайта).");
    } else if (ev.error === "no-speech") {
      bubble(WHO, "Я ничего не услышал. Нажми сферу и скажи ещё раз.");
    } else if (ev.error === "network") {
      bubble(WHO, "Нет связи для распознавания речи. Проверь интернет или напиши в поле.");
    } else if (ev.error !== "aborted") {
      bubble(WHO, "Не получилось распознать речь. Попробуй ещё раз или напиши в поле.");
    }
  };
  r.onresult = (ev) => {
    const t = ev.results[0][0].transcript;
    if (t) send(t);
  };
  try { r.start(); } catch { recognizing = false; setHot(false); }
});

function renderAlphabet() {
  alphabetEl.replaceChildren();
  RU_LETTERS.forEach((ch, i) => {
    const span = document.createElement("span");
    span.className = "ch" + (ch === "Ё" ? " yo" : "");
    span.textContent = ch;
    span.style.animationDelay = `${(i % 11) * 0.03}s`;
    alphabetEl.appendChild(span);
  });
}

seedProfile();
renderAlphabet();
setTimeout(() => splash.classList.add("gone"), 1500);

if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
  badge.textContent = "APP";
}

bubble(WHO, `Готово, Дима. Я Сайло. Сфера = СЛУШАТЬ. Алфавит: ${RU_ALPHABET}.`);
speak("Сайло готов. Нажми сферу и говори.");
label.textContent = "СЛУШАТЬ";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
}
