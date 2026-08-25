import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicUrl,
  isPrivateAddress,
  isSafeReadOnlyUrl,
  isSameHostFamily,
} from "../src/safety.mjs";

test("blocks state-changing paths and allows harmless substrings", () => {
  assert.equal(isSafeReadOnlyUrl("https://example.com/logout"), false);
  assert.equal(isSafeReadOnlyUrl("https://example.com/a?action=delete"), false);
  assert.equal(
    isSafeReadOnlyUrl("https://example.com/administrator-guide"),
    true,
  );
});

test("detects private IPv4 and IPv6 ranges", () => {
  for (const address of [
    "127.0.0.1",
    "10.2.3.4",
    "192.168.1.2",
    "::1",
    "fd00::1",
  ])
    assert.equal(isPrivateAddress(address), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

test("rejects DNS answers containing a private address", async () => {
  await assert.rejects(
    assertPublicUrl("https://example.com", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
    /private_or_unresolved_host/,
  );
});

test("navigation host family only allows parent and subdomains", () => {
  assert.equal(isSameHostFamily("www.example.com", "example.com"), true);
  assert.equal(isSameHostFamily("example.com", "www.example.com"), true);
  assert.equal(isSameHostFamily("evil-example.com", "example.com"), false);
});
