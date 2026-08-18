import { resolveMx, resolveTxt } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const origin = "https://mta-sts.guitard.ca";
const policyPath = "/.well-known/mta-sts.txt";
const contentSecurityPolicy =
  "default-src 'none'; script-src https://static.cloudflareinsights.com; script-src-attr 'none'; connect-src 'self'; style-src 'self'; img-src https://assets.guitard.ca; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const expectedMtaStsRecord = "v=STSv1; id=20260812050000Z;";
const expectedTlsReportRecord = "v=TLSRPTv1; rua=mailto:security@guitard.ca";
const errors = [];

const [localPolicy, localRobots, localCss, localHtml] = await Promise.all([
  readFile(path.join(repositoryRoot, ".well-known", "mta-sts.txt")),
  readFile(path.join(repositoryRoot, "robots.txt")),
  readFile(path.join(repositoryRoot, "css", "style.css")),
  readFile(path.join(repositoryRoot, "404.html"), "utf8"),
]);

function recordError(message) {
  errors.push(message);
}

async function fetchLive(
  pathName,
  userAgent = "guitard-mta-sts-live-validator/1.0",
) {
  const url = new URL(pathName, origin);

  try {
    return await fetch(url, {
      redirect: "manual",
      headers: {
        accept: "*/*",
        "user-agent": userAgent,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    recordError(`${url} could not be fetched: ${error.message}`);
    return undefined;
  }
}

function validateHeaders(response, pathName, expectedHeaders) {
  for (const [name, expectedValue] of Object.entries(expectedHeaders)) {
    const actualValue = response.headers.get(name);
    if (actualValue !== expectedValue) {
      recordError(
        `${pathName} must return ${name}: ${expectedValue}; found ${actualValue ?? "nothing"}.`,
      );
    }
  }

  for (const forbiddenHeader of [
    "access-control-allow-origin",
    "speculation-rules",
  ]) {
    if (response.headers.has(forbiddenHeader)) {
      recordError(`${pathName} must not return ${forbiddenHeader}.`);
    }
  }
}

function validateStatus(response, pathName, expectedStatus) {
  if (response.status !== expectedStatus) {
    recordError(
      `${pathName} must return ${expectedStatus}; found ${response.status}.`,
    );
  }
}

async function validateExactBody(response, pathName, expectedBody) {
  const actualBody = Buffer.from(await response.arrayBuffer());
  if (!actualBody.equals(expectedBody)) {
    recordError(`${pathName} does not match the committed file byte-for-byte.`);
  }
}

const rootResponse = await fetchLive("/");
if (rootResponse) {
  validateStatus(rootResponse, "/", 301);
  if (rootResponse.headers.get("location") !== `${origin}${policyPath}`) {
    recordError(
      `/ must redirect exactly to ${origin}${policyPath}; found ${rootResponse.headers.get("location") ?? "no Location header"}.`,
    );
  }
  if (rootResponse.headers.has("speculation-rules")) {
    recordError("/ must not return speculation-rules.");
  }
}

const policyResponse = await fetchLive(policyPath);
if (policyResponse) {
  validateStatus(policyResponse, policyPath, 200);
  validateHeaders(policyResponse, policyPath, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": contentSecurityPolicy,
    "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  });
  if (policyResponse.headers.has("location")) {
    recordError(`${policyPath} must not redirect.`);
  }
  await validateExactBody(policyResponse, policyPath, localPolicy);
}

for (const [label, userAgent] of [
  ["empty user agent", ""],
  ["Postfix user agent", "Postfix"],
]) {
  const automatedClientResponse = await fetchLive(policyPath, userAgent);
  if (automatedClientResponse) {
    validateStatus(automatedClientResponse, label, 200);
    await validateExactBody(automatedClientResponse, label, localPolicy);
  }
}

const robotsResponse = await fetchLive("/robots.txt");
if (robotsResponse) {
  validateStatus(robotsResponse, "/robots.txt", 200);
  validateHeaders(robotsResponse, "/robots.txt", {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "max-age=14400",
    "content-security-policy": contentSecurityPolicy,
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  });
  await validateExactBody(robotsResponse, "/robots.txt", localRobots);
}

const stylesheetMatch =
  /<link rel="stylesheet" href="(\/css\/style\.css\?v=[^"]+)">/u.exec(
    localHtml,
  );

if (!stylesheetMatch) {
  recordError("404.html must reference the versioned /css/style.css file.");
} else {
  const stylesheetPath = stylesheetMatch[1];
  const stylesheetResponse = await fetchLive(stylesheetPath);
  if (stylesheetResponse) {
    validateStatus(stylesheetResponse, stylesheetPath, 200);
    validateHeaders(stylesheetResponse, stylesheetPath, {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "max-age=14400",
      "content-security-policy": contentSecurityPolicy,
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    });
    await validateExactBody(stylesheetResponse, stylesheetPath, localCss);
  }
}

const errorDocumentResponse = await fetchLive("/404.html");
if (errorDocumentResponse) {
  validateStatus(errorDocumentResponse, "/404.html", 200);
  validateHeaders(errorDocumentResponse, "/404.html", {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "max-age=600",
    "content-security-policy": contentSecurityPolicy,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-robots-tag": "noindex, nofollow",
  });
}

const missingResponse = await fetchLive(
  "/live-validation-probe-that-must-not-exist",
);
if (missingResponse) {
  validateStatus(
    missingResponse,
    "/live-validation-probe-that-must-not-exist",
    404,
  );
  validateHeaders(
    missingResponse,
    "/live-validation-probe-that-must-not-exist",
    {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": contentSecurityPolicy,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "x-robots-tag": "noindex, nofollow",
    },
  );
  const missingBody = await missingResponse.text();
  if (
    !missingBody.includes(
      'id="error-title">Strict transport. Wrong address.',
    ) ||
    !missingBody.includes(`href="${policyPath}"`)
  ) {
    recordError("Unknown paths must return the custom MTA-STS 404 document.");
  }
}

for (const asset of [
  ["https://assets.guitard.ca/favicon.svg", "image/svg+xml"],
  ["https://assets.guitard.ca/og-image.png", "image/png"],
]) {
  try {
    const response = await fetch(asset[0], {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 200) {
      recordError(`${asset[0]} must return 200; found ${response.status}.`);
    }
    if (!(response.headers.get("content-type") ?? "").startsWith(asset[1])) {
      recordError(`${asset[0]} must return ${asset[1]}.`);
    }
  } catch (error) {
    recordError(`${asset[0]} could not be fetched: ${error.message}`);
  }
}

async function validateTxtRecord(name, expectedValue) {
  try {
    const records = (await resolveTxt(name)).map((parts) => parts.join(""));
    if (records.length !== 1 || records[0] !== expectedValue) {
      recordError(
        `${name} must contain exactly ${expectedValue}; found ${records.join(" | ") || "nothing"}.`,
      );
    }
  } catch (error) {
    recordError(`${name} could not be resolved: ${error.message}`);
  }
}

await Promise.all([
  validateTxtRecord("_mta-sts.guitard.ca", expectedMtaStsRecord),
  validateTxtRecord("_smtp._tls.guitard.ca", expectedTlsReportRecord),
]);

try {
  const liveMxRecords = (await resolveMx("guitard.ca"))
    .map(({ exchange, priority }) => ({
      exchange: exchange.toLowerCase().replace(/\.$/u, ""),
      priority,
    }))
    .sort((first, second) => first.priority - second.priority);
  const policyMxHosts = localPolicy
    .toString("utf8")
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("mx:"))
    .map((line) => line.slice(3).trim().toLowerCase())
    .sort();
  const liveMxHosts = liveMxRecords.map(({ exchange }) => exchange).sort();

  if (JSON.stringify(liveMxHosts) !== JSON.stringify(policyMxHosts)) {
    recordError(
      `Live MX hosts (${liveMxHosts.join(", ")}) do not match the policy (${policyMxHosts.join(", ")}).`,
    );
  }

  const expectedPriorities = new Map([
    ["mx01.mail.icloud.com", 10],
    ["mx02.mail.icloud.com", 20],
  ]);
  for (const { exchange, priority } of liveMxRecords) {
    if (!expectedPriorities.has(exchange)) {
      recordError(`Unexpected live MX host: ${exchange}.`);
    } else if (expectedPriorities.get(exchange) !== priority) {
      recordError(
        `${exchange} must have MX priority ${expectedPriorities.get(exchange)}; found ${priority}.`,
      );
    }
  }
} catch (error) {
  recordError(`guitard.ca MX records could not be resolved: ${error.message}`);
}

if (errors.length > 0) {
  console.error("Live MTA-STS validation failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    "Live MTA-STS validation passed: policy, DNS, TLS reporting, redirects, headers, assets, and custom 404 are correct.",
  );
}
