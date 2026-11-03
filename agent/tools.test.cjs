const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execute } = require("./tools.cjs");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "silo-agent-"));
}

test("writes, reads, lists and deletes inside the workspace", async () => {
  const root = tempRoot();
  const written = await execute({ kind: "write", path: "notes/a.txt", content: "привет" }, { root });
  assert.match(written.say, /записал/i);
  assert.equal(fs.readFileSync(path.join(root, "notes/a.txt"), "utf8"), "привет");

  const read = await execute({ kind: "read", path: "notes/a.txt" }, { root });
  assert.match(read.text, /привет/);
  assert.match(read.say, /прочитал/i);

  const listed = await execute({ kind: "list", path: "." }, { root });
  assert.match(listed.text, /notes/);

  const removed = await execute({ kind: "delete", path: "notes/a.txt" }, { root });
  assert.match(removed.say, /удалил/i);
  assert.equal(fs.existsSync(path.join(root, "notes/a.txt")), false);
});

test("file tools stay inside the workspace", async () => {
  const root = tempRoot();
  const outside = await execute({ kind: "read", path: "../secret.txt" }, { root });
  assert.match(outside.say, /рабочей папки/);
  const abs = await execute({ kind: "read", path: "/etc/passwd" }, { root });
  assert.match(abs.say, /рабочей папки/);
});

test("shell runs in the workspace and refuses a wipe", async () => {
  const root = tempRoot();
  fs.writeFileSync(path.join(root, "keep.txt"), "ok");
  const ran = await execute({ kind: "shell", command: "pwd" }, { root });
  assert.match(ran.text, /Команда выполнена/);
  assert.match(ran.say, /Команда выполнена/);
  assert.equal(ran.say, ran.text);
  const blocked = await execute({ kind: "shell", command: "rm -rf /" }, { root });
  assert.match(blocked.say, /не буду/);
  assert.equal(fs.existsSync(path.join(root, "keep.txt")), true);
});

test("search speaks the full answer", async () => {
  const result = await execute({ kind: "search", query: "сатурн" }, {
    root: tempRoot(),
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ AbstractText: "Сатурн — шестая планета.", Heading: "Сатурн" }),
    }),
  });
  assert.match(result.text, /Сатурн/);
  assert.match(result.say, /По запросу/);
  assert.equal(result.say, result.text);
});
