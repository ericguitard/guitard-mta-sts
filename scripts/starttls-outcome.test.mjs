import assert from "node:assert/strict";
import test from "node:test";

import { socketTimeoutOutcome } from "./starttls-outcome.mjs";

test("a connect timeout is skipped when the runner blocks outbound SMTP", () => {
  assert.deepEqual(socketTimeoutOutcome("connect"), {
    kind: "skip",
    reason: "timed out while connecting to port 25",
  });
});

test("a timeout after SMTP connects remains a service failure", () => {
  assert.deepEqual(socketTimeoutOutcome("tls-handshake"), {
    kind: "error",
    reason: "timed out during tls-handshake",
  });
});
