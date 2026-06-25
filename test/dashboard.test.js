import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("dashboard summary request follows the mounted ops path", async () => {
  const html = await fs.readFile(new URL("../public/dashboard.html", import.meta.url), "utf8");

  assert.match(html, /fetch\(`api\/summary\?days=\$\{days\}`\)/);
  assert.doesNotMatch(html, /fetch\(`\/api\/summary\?days=\$\{days\}`\)/);
  assert.equal(
    new URL("api/summary?days=30", "https://group.dakangjt.com/ops/dashboard").pathname,
    "/ops/api/summary",
  );
});
