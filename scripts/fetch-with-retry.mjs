import { setTimeout as delay } from "node:timers/promises";

const transientCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
]);

function isTransient(error) {
  if (error.name === "TimeoutError") return true;
  const cause = error.cause ?? error;
  if (cause.errors?.length) return cause.errors.every(isTransient);
  return transientCodes.has(cause.code);
}

// Retry only transport failures. HTTP responses (including errors), certificate
// failures and content validation remain the caller's strict responsibility.
export async function fetchWithRetry(
  url,
  options = {},
  { fetchImpl = fetch, sleep = delay } = {},
) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (attempt === 3 || !isTransient(error)) {
        const cause = error.cause ?? error;
        throw new Error(
          `HTTPS request failed after ${attempt} attempt(s): ${error.message}${cause.code ? ` (${cause.code}: ${cause.message})` : ""}`,
          { cause: error },
        );
      }
      await sleep(attempt * 500);
    }
  }
}
