const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("localhost bridge runs a file order and serves the page", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "silo-bridge-"));
  process.env.SILO_ROOT = root;
  const { start } = await import("./server.mjs?case=bridge");
  const server = await start(0);
  const port = server.address().port;
  try {
    const page = await fetch("http://127.0.0.1:" + port + "/jarvis-os1/");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Сайло/);

    const created = await fetch("http://127.0.0.1:" + port + "/jarvis-os1/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "создай файл note.txt текст проверка" }),
    });
    const body = await created.json();
    assert.match(body.say, /записал/i);
    assert.match(body.say, /проверка/);
    assert.equal(body.say, body.text);
    assert.equal(fs.readFileSync(path.join(root, "note.txt"), "utf8"), "проверка");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.SILO_ROOT;
  }
});
