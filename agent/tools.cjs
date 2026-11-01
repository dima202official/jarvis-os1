const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { solveMath, REPLY_LENGTH } = require("./intent.js");

function answer(say, text) {
  const full = text || say;
  if (REPLY_LENGTH === "long") return { say: full, text: full };
  return { say: say || full, text: full };
}

function resolveInside(root, userPath) {
  const base = path.resolve(root);
  const target = path.resolve(base, userPath && String(userPath).trim() ? userPath : ".");
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    const error = new Error("outside");
    error.code = "OUTSIDE";
    throw error;
  }
  return target;
}

function blockedShell(command) {
  const compact = String(command || "").toLowerCase().replace(/\s+/g, " ").trim();
  return [
    /\brm\s+-[a-z]*r[a-z]*\s+(\/|~|\.|\*)(?:\s|$)/,
    /\bmkfs\b/,
    /\bdd\s+if=/,
    /:\(\)\s*\{/,
    /\b(shutdown|reboot|poweroff|halt)\b/,
    /\bsudo\b/,
    /\|\s*(ba)?sh\b/,
    />\s*\/dev\//,
  ].some((rule) => rule.test(compact));
}

function runShell(command, root) {
  const shell = process.platform === "win32" ? "bash" : "bash";
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    const child = spawn(shell, ["-lc", command], { cwd: root, timeout: 12000 });
    const take = (buf, chunk) => (buf.length >= 20000 ? buf : buf + chunk.toString("utf8")).slice(0, 20000);
    child.stdout.on("data", (chunk) => { out = take(out, chunk); });
    child.stderr.on("data", (chunk) => { err = take(err, chunk); });
    child.on("error", () => resolve({ code: 127, out: "", err: "Не удалось запустить терминал." }));
    child.on("close", (code) => resolve({ code: code ?? 1, out, err }));
  });
}

async function walkCount(dir) {
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += await walkCount(full);
    else count += 1;
  }
  return count;
}

async function execute(order, options) {
  const root = options.root;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  try {
    if (order.kind === "write") {
      const file = resolveInside(root, order.path);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const content = order.content || "";
      await fs.writeFile(file, content, "utf8");
      const name = path.basename(file);
      const full = content
        ? "Я записал файл " + name + " в рабочей папке. Текст, который в нём теперь лежит: " + content
        : "Я создал пустой файл " + name + " в рабочей папке. Текста в нём пока нет.";
      return answer(content ? "Записал." : "Создал пустой файл.", full);
    }
    if (order.kind === "read") {
      const file = resolveInside(root, order.path);
      const body = await fs.readFile(file, "utf8");
      const lines = body.split(/\n/).length;
      const shown = body.slice(0, 4000);
      const tail = body.length > 4000 ? " Файл длиннее, дальше идёт первая часть." : "";
      return answer(
        "Прочитал. " + lines + " строк.",
        "Я открыл файл " + path.basename(file) + " и прочитал его. Строк в нём " + lines + "." + tail + " Содержимое такое. " + shown
      );
    }
    if (order.kind === "list") {
      const dir = resolveInside(root, order.path);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const names = entries.map((entry) => entry.name + (entry.isDirectory() ? "/" : "")).sort();
      const listing = names.join("\n");
      return answer(
        "В папке " + names.length + " имён.",
        names.length
          ? "В этой папке " + names.length + " имён. Перечисляю каждое. " + listing
          : "Эта папка пуста, имён в ней нет."
      );
    }
    if (order.kind === "delete") {
      const file = resolveInside(root, order.path);
      const info = await fs.stat(file);
      if (info.isDirectory()) return answer("Удаляю только файлы.", "Удаляю только отдельные файлы. Папку целиком я так не стираю.");
      await fs.unlink(file);
      return answer("Удалил.", "Я удалил файл " + path.basename(file) + " из рабочей папки. Сама папка осталась на месте.");
    }
    if (order.kind === "count") {
      const dir = resolveInside(root, order.path);
      const count = await walkCount(dir);
      return answer("Файлов: " + count + ".", "Я посчитал файлы в этой папке, без служебных каталогов. Получилось " + count + ".");
    }
    if (order.kind === "pwd") {
      return answer("Текущая папка.", "Сейчас рабочая папка такая: " + path.resolve(root) + ". Файлы и команды остаются внутри неё.");
    }
    if (order.kind === "math") {
      const value = solveMath(order.expression);
      if (value == null) return answer("Не смог посчитать.", "Я не смог посчитать это выражение. Нужны только числа и знаки плюс, минус, умножение и деление.");
      return answer("Получается " + value + ".", "Я посчитал выражение по порядку действий. Получается " + value + ".");
    }
    if (order.kind === "shell") {
      if (blockedShell(order.command)) {
        return answer(
          "Эту команду я не буду выполнять.",
          "Эту команду я не буду выполнять. Она может стереть систему, запросить права администратора или выключить компьютер."
        );
      }
      const result = await runShell(order.command, root);
      const output = (result.out || result.err || "").trim();
      if (result.code !== 0) {
        return answer(
          "Команда не выполнилась.",
          output
            ? "Команда завершилась с ошибкой. Зачитываю вывод целиком. " + output
            : "Команда завершилась с ошибкой и не оставила текста."
        );
      }
      return answer(
        "Готово.",
        output
          ? "Команда выполнена в рабочей папке. Зачитываю весь вывод. " + output
          : "Команда выполнена в рабочей папке. Вывода на экран она не дала."
      );
    }
    if (order.kind === "search") {
      const url = "https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=" + encodeURIComponent(order.query);
      const response = await fetchImpl(url);
      if (!response.ok) return answer("Не удалось найти.", "Поиск не ответил.");
      const data = await response.json();
      const brief = data.AbstractText || data.Answer || "";
      if (!brief) {
        return answer(
          "Ничего короткого не нашёл.",
          "Я поискал «" + order.query + "». Краткой справки в ответе не было, поэтому пересказывать пока нечего."
        );
      }
      return answer(
        "Нашёл краткий ответ.",
        "По запросу «" + order.query + "» нашлось следующее, зачитываю целиком. " + brief.slice(0, 2000)
      );
    }
    if (order.kind === "fetch") {
      let parsed;
      try { parsed = new URL(order.url); } catch { return answer("Не понял адрес.", "Я не разобрал адрес страницы. Нужна полная ссылка, начиная с http или https."); }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return answer("Открываю только http и https.", "Я открываю только обычные страницы http и https. Другие адреса не загружаю.");
      }
      if (parsed.hostname === "169.254.169.254" || parsed.hostname === "metadata.google.internal") {
        return answer("Этот адрес я не открою.", "Этот адрес я не открою: он относится к служебным данным машины, а не к обычной странице.");
      }
      const response = await fetchImpl(order.url);
      const body = typeof response.text === "function" ? await response.text() : "";
      const plain = String(body)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return answer(
        "Открыл страницу.",
        plain
          ? "Я открыл страницу и зачитываю её текст. " + plain.slice(0, 2000)
          : "Я открыл страницу, но видимого текста на ней не оказалось."
      );
    }
    return answer(
      "Не понял поручение.",
      "Я не разобрал это как поручение. Могу подробно ответить про время, алфавит и память. Через локальный мост выполняю команду после слова «выполни», читаю и записываю файлы и ищу в сети после слова «найди»."
    );
  } catch (error) {
    if (error && error.code === "OUTSIDE") {
      return answer("Это вне рабочей папки.", "Я не выхожу за пределы рабочей папки проекта. Этот путь лежит снаружи, поэтому файл не открываю.");
    }
    return answer("Не получилось.", "Поручение до конца не выполнилось. Повторите его, пожалуйста, чуть точнее.");
  }
}

module.exports = { execute, blockedShell };
