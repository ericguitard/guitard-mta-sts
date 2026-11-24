import assert from "node:assert/strict";
import test from "node:test";

import { fetchWithRetry } from "./fetch-with-retry.mjs";

const reset = () =>
  new TypeError("fetch failed", {
    cause: Object.assign(new Error("connection reset"), { code: "ECONNRESET" }),
  });

test("recovers from a transient failure with a fresh timeout and same request", async () => {
  const calls = [];
  const waits = [];
  const response = new Response("policy", { status: 200 });
  const actual = await fetchWithRetry(
    "https://example.test/policy",
    { redirect: "manual", headers: { "user-agent": "validator" } },
    {
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (calls.length === 1) throw reset();
        return response;
      },
      sleep: async (ms) => waits.push(ms),
    },
  );
  assert.equal(actual, response);
  assert.equal(calls.length, 2);
  assert.deepEqual(waits, [500]);
  assert.notEqual(calls[0].options.signal, calls[1].options.signal);
  assert.equal(calls[1].options.redirect, "manual");
  assert.equal(calls[1].options.headers["user-agent"], "validator");
});

test("persistent transport failures stop after three attempts with diagnostics", async () => {
  let calls = 0;
  const waits = [];
  await assert.rejects(
    fetchWithRetry(
      "https://example.test/",
      {},
      {
        fetchImpl: async () => {
          calls++;
          throw reset();
        },
        sleep: async (ms) => waits.push(ms),
      },
    ),
    /after 3 attempt\(s\).*ECONNRESET/,
  );
  assert.equal(calls, 3);
  assert.deepEqual(waits, [500, 1000]);
});

test("HTTP failures and unexpected redirects are returned without retry or masking", async () => {
  for (const status of [301, 403, 404, 500, 503]) {
    let calls = 0;
    const response = new Response("unexpected", { status });
    assert.equal(
      await fetchWithRetry(
        "https://example.test/",
        {},
        {
          fetchImpl: async () => {
            calls++;
            return response;
          },
          sleep: async () => assert.fail("HTTP responses must not retry"),
        },
      ),
      response,
    );
    assert.equal(calls, 1);
  }
});

test("certificate and programming failures are not retried", async () => {
  for (const error of [
    new TypeError("fetch failed", {
      cause: Object.assign(new Error("expired"), { code: "CERT_HAS_EXPIRED" }),
    }),
    new TypeError("invalid URL"),
  ]) {
    let calls = 0;
    await assert.rejects(
      fetchWithRetry(
        "https://example.test/",
        {},
        {
          fetchImpl: async () => {
            calls++;
            throw error;
          },
          sleep: async () => assert.fail("must not retry"),
        },
      ),
    );
    assert.equal(calls, 1);
  }
});

test("recognizes aggregate connection errors and request timeouts", async () => {
  for (const error of [
    new TypeError("fetch failed", {
      cause: new AggregateError([reset(), reset()]),
    }),
    new DOMException("timed out", "TimeoutError"),
  ]) {
    let calls = 0;
    const response = new Response("ok");
    assert.equal(
      await fetchWithRetry(
        "https://example.test/",
        {},
        {
          fetchImpl: async () => {
            if (++calls === 1) throw error;
            return response;
          },
          sleep: async () => {},
        },
      ),
      response,
    );
    assert.equal(calls, 2);
  }
});
