const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { solveMath } = require("./intent.js");

function answer(say, text) {
  return { say, text: text || say };
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
      return answer(content ? "Записал." : "Создал пустой файл.", "Записал " + path.basename(file) + ".");
    }
    if (order.kind === "read") {
      const file = resolveInside(root, order.path);
      const body = await fs.readFile(file, "utf8");
      const lines = body.split(/\n/).length;
      return answer("Прочитал. " + lines + " строк.", body.slice(0, 4000));
    }
    if (order.kind === "list") {
      const dir = resolveInside(root, order.path);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const names = entries.map((entry) => entry.name + (entry.isDirectory() ? "/" : "")).sort();
      return answer(
        "В папке " + names.length + " имён.",
        names.join("\n") || "Папка пуста."
      );
    }
    if (order.kind === "delete") {
      const file = resolveInside(root, order.path);
      const info = await fs.stat(file);
      if (info.isDirectory()) return answer("Удаляю только файлы.", "Удаляю только файлы.");
      await fs.unlink(file);
      return answer("Удалил.", "Удалил " + path.basename(file) + ".");
    }
    if (order.kind === "count") {
      const dir = resolveInside(root, order.path);
      const count = await walkCount(dir);
      return answer("Файлов: " + count + ".", "Файлов: " + count + ".");
    }
    if (order.kind === "pwd") {
      return answer("Текущая папка.", path.resolve(root));
    }
    if (order.kind === "math") {
      const value = solveMath(order.expression);
      if (value == null) return answer("Не смог посчитать.", "Не смог посчитать.");
      return answer("Получается " + value + ".", "Получается " + value + ".");
    }
    if (order.kind === "shell") {
      if (blockedShell(order.command)) return answer("Эту команду я не буду выполнять.", "Эту команду я не буду выполнять.");
      const result = await runShell(order.command, root);
      const output = (result.out || result.err || "").trim();
      if (result.code !== 0) {
        return answer("Команда не выполнилась.", output || "Команда не выполнилась.");
      }
      return answer("Готово.", output || "Готово. Вывода нет.");
    }
    if (order.kind === "search") {
      const url = "https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=" + encodeURIComponent(order.query);
      const response = await fetchImpl(url);
      if (!response.ok) return answer("Не удалось найти.", "Поиск не ответил.");
      const data = await response.json();
      const brief = data.AbstractText || data.Answer || "";
      if (!brief) return answer("Ничего короткого не нашёл.", "По запросу нет краткого ответа.");
      return answer("Нашёл краткий ответ.", brief.slice(0, 700));
    }
    if (order.kind === "fetch") {
      let parsed;
      try { parsed = new URL(order.url); } catch { return answer("Не понял адрес.", "Не понял адрес."); }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return answer("Открываю только http и https.", "Открываю только http и https.");
      }
      if (parsed.hostname === "169.254.169.254" || parsed.hostname === "metadata.google.internal") {
        return answer("Этот адрес я не открою.", "Этот адрес я не открою.");
      }
      const response = await fetchImpl(order.url);
      const body = typeof response.text === "function" ? await response.text() : "";
      const plain = String(body)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return answer("Открыл страницу.", plain.slice(0, 700) || "Страница пустая.");
    }
    return answer(
      "Не понял поручение.",
      "Можно сказать: выполни …, прочитай файл …, создай файл …, найди …"
    );
  } catch (error) {
    if (error && error.code === "OUTSIDE") return answer("Это вне рабочей папки.", "Это вне рабочей папки.");
    return answer("Не получилось.", "Не получилось.");
  }
}

module.exports = { execute, blockedShell };
