const test = require("node:test");
const assert = require("node:assert/strict");
const { classify, solveMath } = require("./intent.js");

test("local phrases stay on the page", () => {
  for (const phrase of ["привет", "алфавит", "который час", "кто ты", "помощь", "/memory", "запомни день рождения"]) {
    assert.equal(classify(phrase).kind, "local", phrase);
  }
});

test("shell, files, web and math", () => {
  assert.deepEqual(classify("выполни pwd"), { kind: "shell", command: "pwd" });
  assert.deepEqual(classify("запусти ls -la"), { kind: "shell", command: "ls -la" });
  assert.deepEqual(classify("список файлов"), { kind: "list", path: "." });
  assert.deepEqual(classify("покажи файлы в assets"), { kind: "list", path: "assets" });
  assert.deepEqual(classify("прочитай файл README.md"), { kind: "read", path: "README.md" });
  assert.deepEqual(classify("создай файл notes.txt текст привет"), {
    kind: "write",
    path: "notes.txt",
    content: "привет",
  });
  assert.deepEqual(classify("запиши в файл a.txt привет дима"), {
    kind: "write",
    path: "a.txt",
    content: "привет дима",
  });
  assert.deepEqual(classify("удали файл notes.txt"), { kind: "delete", path: "notes.txt" });
  assert.deepEqual(classify("найди погода в берлине"), { kind: "search", query: "погода в берлине" });
  assert.deepEqual(classify("что такое сатурн"), { kind: "search", query: "сатурн" });
  assert.deepEqual(classify("открой https://example.com/a"), { kind: "fetch", url: "https://example.com/a" });
  assert.deepEqual(classify("посчитай (2+2)*3"), { kind: "math", expression: "(2+2)*3" });
  assert.deepEqual(classify("сколько файлов"), { kind: "count", path: "." });
  assert.deepEqual(classify("где я"), { kind: "pwd" });
  assert.equal(classify("сделай что-нибудь странное").kind, "unknown");
});

test("math accepts only arithmetic", () => {
  assert.equal(solveMath("(2+2)*3"), 12);
  assert.equal(solveMath("2,5+1"), 3.5);
  assert.equal(solveMath("process.exit()"), null);
});
