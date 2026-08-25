import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { findPlaywrightChrome } from "../src/audit.mjs";

test("finds the newest Chrome for Testing in the Playwright cache", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "optiweb-browser-cache-"));
  try {
    const older = path.join(root, "chromium-999", "chrome-linux", "chrome");
    const newer = path.join(
      root,
      "chromium-1234",
      "chrome-linux64",
      "chrome",
    );
    await mkdir(path.dirname(older), { recursive: true });
    await mkdir(path.dirname(newer), { recursive: true });
    await writeFile(older, "");
    await writeFile(newer, "");

    assert.equal(findPlaywrightChrome(root), newer);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns undefined when the Playwright cache is absent", () => {
  assert.equal(findPlaywrightChrome("/path/that/does/not/exist"), undefined);
});
