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
  const fact = (text || "").trim();
  if (!fact) return "";
  const data = loadMemory();
  data.entries.push({ id: Math.random().toString(36).slice(2, 10), text: fact, at: Date.now() });
  saveMemory(data);
  return fact;
}

function memoryList() {
  const data = loadMemory();
  if (!data.entries.length) return "";
  return data.entries.slice(-12).map((e) => `· ${e.text}`).join("\n");
}

function reply(text, say) {
  return { text, say: say || text };
}

function mentions(low, pattern) {
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, "iu").test(low);
}

function brain(userText) {
  const t = (userText || "").trim();
  const low = t.toLowerCase().replace(/ё/g, "е");
  if (!t) return reply("Слушаю.", "Слушаю.");
  if (t.startsWith("/remember ") || t.startsWith("/запомни ")) {
    const fact = remember(t.split(/\s+/).slice(1).join(" "));
    if (!fact) return reply("Нечего записывать.", "Нечего записывать.");
    return reply(`Записал: ${fact}`, "Записал.");
  }
  if (t === "/memory" || t === "/память" || mentions(low, "память|что знаешь|профиль")) {
    const list = memoryList();
    if (!list) return reply("Память пуста.", "Память пока пуста.");
    return reply(`Память:\n${list}`, "Показываю, что помню.");
  }
  if (mentions(low, "привет|здравству\\p{L}*|добр\\p{L}*|hello|hi")) {
    const h = new Date().getHours();
    const g = h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
    return reply(`${g}, Дима.`, `${g}, сэр.`);
  }
  if (mentions(low, "алфавит|буквы|alphabet")) {
    return reply(
      `Русский алфавит, 33 буквы, включая Ё: ${RU_ALPHABET}.`,
      "Русский алфавит. Тридцать три буквы, включая ё."
    );
  }
  if (mentions(low, "кто ты|как тебя зовут|представься")) {
    return reply("Я Сайло, ваш ассистент.", "Я Сайло, сэр. Ваш ассистент.");
  }
  if (mentions(low, "время|который час")) {
    const now = new Date().toLocaleString("ru-RU");
    return reply(`Сейчас ${now}.`, `Сейчас ${now}.`);
  }
  if (mentions(low, "помощь|команды|help")) {
    return reply(
      "Сфера — слушать. Повторное нажатие останавливает. Здесь: время, алфавит, /remember, /memory. Через локальный мост: выполни …, прочитай файл …, создай файл …, найди …",
      "Нажмите сферу, чтобы говорить. Могу назвать время и открыть память. Файлы, команды и поиск — через локальный мост."
    );
  }
  if (mentions(low, "позвонил|звонил|called")) {
    remember(`Дима сказал: ${t}`);
    return reply(`Запомнил: «${t}».`, "Запомнил.");
  }
  return reply(`Принято: «${t.slice(0, 140)}».`, "Принято.");
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
  label.textContent = on ? "Слушаю" : "Слушать";
}

function russianVoice() {
  const voices = window.speechSynthesis.getVoices();
  const ru = voices.filter((v) => /^ru([-_]|$)/i.test(v.lang || ""));
  const male = ru.find((v) => /yuri|pavel|dmitri|filipp|male|муж/i.test(v.name));
  return male || ru[0] || null;
}

function speak(text) {
  if (!window.speechSynthesis || !text) return;
  let spoken = false;
  const utter = () => {
    if (spoken) return;
    spoken = true;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ru-RU";
    u.rate = 0.86;
    u.pitch = 0.9;
    const voice = russianVoice();
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  };
  if (window.speechSynthesis.getVoices().length) {
    utter();
    return;
  }
  window.speechSynthesis.addEventListener("voiceschanged", utter, { once: true });
  window.speechSynthesis.getVoices();
  setTimeout(utter, 400);
}

function say(text, spoken) {
  bubble(WHO, text);
  speak(spoken || text);
}

async function askAgent(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(new URL("agent", document.baseURI), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok || !data || !data.say) throw new Error("agent");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function send(text) {
  const cleaned = (text || "").trim();
  if (!cleaned) return;
  bubble("ВЫ", cleaned);
  input.value = "";
  const order = window.SiloIntent ? window.SiloIntent.classify(cleaned) : { kind: "local" };
  if (order.kind === "local") {
    const answer = brain(cleaned);
    say(answer.text, answer.say);
    return;
  }
  if (order.kind === "math") {
    const value = window.SiloIntent.solveMath(order.expression);
    if (value == null) say("Не смог посчитать.", "Не смог посчитать.");
    else say("Получается " + value + ".", "Получается " + value + ".");
    return;
  }
  try {
    const data = await askAgent(cleaned);
    say(data.text || data.say, data.say);
  } catch {
    say("Агент не запущен. Нужен локальный мост.", "Агент не запущен.");
  }
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
    say("Распознавание речи недоступно. Можно написать.", "Распознавание речи недоступно. Можно написать.");
    input.focus();
    return;
  }
  if (recognizing) {
    try { currentRec && currentRec.stop(); } catch { /* уже остановлено */ }
    return;
  }
  if (!window.isSecureContext) {
    say("Для микрофона нужна защищённая страница.", "Для микрофона нужна защищённая страница.");
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
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
      say("Разрешите микрофон. Либо напишите.", "Разрешите микрофон, сэр. Либо напишите.");
    } else if (ev.error === "no-speech") {
      say("Я не расслышал. Повторите, пожалуйста.", "Я не расслышал. Повторите, пожалуйста.");
    } else if (ev.error === "network") {
      say("Нет связи для распознавания. Можно написать.", "Нет связи для распознавания. Можно написать.");
    } else if (ev.error !== "aborted") {
      say("Не удалось распознать. Повторите или напишите.", "Не удалось распознать. Повторите или напишите.");
    }
  };
  r.onresult = (ev) => {
    const t = ev.results[0][0].transcript;
    if (t) send(t);
  };
  try { r.start(); } catch { recognizing = false; setHot(false); }
});

seedProfile();
say("Сайло на связи.", "Сайло на связи, сэр.");
label.textContent = "Слушать";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
}
