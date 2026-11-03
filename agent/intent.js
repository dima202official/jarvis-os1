(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SiloIntent = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function mentions(value, pattern) {
    return new RegExp("(?:^|[^\\p{L}\\p{N}_])(?:" + pattern + ")(?![\\p{L}\\p{N}_])", "iu").test(value);
  }

  function isLocal(raw, folded) {
    if (/^\/(remember|memory)\b/i.test(raw)) return true;
    if (/^\/(запомни|память)\b/i.test(folded)) return true;
    if (/^(?:запомни|remember)\s+\S/i.test(folded)) return true;
    return mentions(
      folded,
      "привет|здравству\\p{L}*|добр\\p{L}*|hello|hi|алфавит|буквы|alphabet|кто ты|как тебя зовут|представься|время|который час|помощь|команды|help|позвонил|звонил|called|память|что знаешь|профиль"
    );
  }

  function classify(text) {
    const raw = String(text || "").trim();
    const folded = raw.toLowerCase().replace(/ё/g, "е");
    if (!folded) return { kind: "local" };

    let match = raw.match(/^(?:выполни|запусти|команда|в терминале|терминал)\s+([\s\S]+)$/i);
    if (match) return { kind: "shell", command: match[1].trim() };

    match = raw.match(/^(?:список файлов|покажи файлы|какие файлы)(?:\s+(?:в|из)\s+(.+))?$/i);
    if (match) return { kind: "list", path: (match[1] || ".").trim() };

    match = raw.match(/^сколько файлов(?:\s+(?:в|из)\s+(.+))?$/i);
    if (match) return { kind: "count", path: (match[1] || ".").trim() };

    if (/^(?:какая папка|где я|текущая папка)$/i.test(folded)) return { kind: "pwd" };

    match = raw.match(/^(?:удали|сотри)\s+файл\s+(.+)$/i);
    if (match) return { kind: "delete", path: match[1].trim() };

    match = raw.match(/^(?:открой|загрузи|покажи)\s+(https?:\/\/\S+)$/i);
    if (match) return { kind: "fetch", url: match[1] };

    match = raw.match(/^(?:прочитай|покажи|открой)\s+файл\s+(.+)$/i);
    if (match) return { kind: "read", path: match[1].trim() };

    match = raw.match(/^(?:создай|запиши)(?:\s+в)?\s+файл\s+(\S+)\s*(?:с текстом|текст|:|—|-)?\s*([\s\S]*)$/i);
    if (match) return { kind: "write", path: match[1], content: (match[2] || "").trim() };

    match = raw.match(/^(?:найди|поищи|загугли|что такое|кто такой|кто такая)\s+([\s\S]+)$/i);
    if (match) return { kind: "search", query: match[1].trim() };

    match = raw.match(/^(?:посчитай|сколько будет|вычисли)\s+([0-9+\-*/().,\s]+)$/i);
    if (match) return { kind: "math", expression: match[1].trim() };

    if (isLocal(raw, folded)) return { kind: "local" };

    if (/^(?:что|как|где|когда|почему|зачем|сколько|какой|какая|какие|кто)\b/iu.test(folded)) {
      return { kind: "search", query: raw };
    }
    return { kind: "unknown" };
  }

  function solveMath(expression) {
    const expr = String(expression || "").trim().replace(/,/g, ".");
    if (!expr || !/^[0-9+\-*/().\s]+$/.test(expr)) return null;
    try {
      const value = Function('"use strict"; return (' + expr + ")")();
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      return value;
    } catch {
      return null;
    }
  }

  const REPLY_LENGTH = "long";

  return { classify, solveMath, REPLY_LENGTH };
});
