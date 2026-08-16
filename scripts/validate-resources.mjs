import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const errors = [];
const html = await readFile(path.join(repositoryRoot, "404.html"), "utf8");
const robots = await readFile(path.join(repositoryRoot, "robots.txt"), "utf8");
const cname = (
  await readFile(path.join(repositoryRoot, "CNAME"), "utf8")
).trim();
const headers = await readFile(path.join(repositoryRoot, "_headers"), "utf8");

for (const match of html.matchAll(/(?:href|src)="([^"]+)"/gu)) {
  const resource = match[1].split(/[?#]/u, 1)[0];
  if (!resource.startsWith("/") || resource === "/.well-known/mta-sts.txt") {
    continue;
  }

  const localPath = path.join(repositoryRoot, resource.slice(1));
  try {
    await access(localPath);
  } catch {
    errors.push(`Missing local resource referenced by 404.html: ${resource}`);
  }
}

if (/<(?:script|style)\b/iu.test(html)) {
  errors.push("404.html must not contain inline script or style elements.");
}

if (/\son[a-z]+\s*=/iu.test(html)) {
  errors.push("404.html must not contain inline event handlers.");
}

if (!html.includes('href="/.well-known/mta-sts.txt"')) {
  errors.push("404.html must link to the published MTA-STS policy.");
}

const robotsDirectives = robots
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

if (
  !robotsDirectives.some((line) => /^User-agent:\s*\*$/iu.test(line)) ||
  !robotsDirectives.some((line) => /^Disallow:\s*\/$/iu.test(line))
) {
  errors.push(
    "robots.txt must contain the standard User-agent and Disallow rules.",
  );
}

const contentSignalLines = robotsDirectives.filter((line) =>
  /^Content-Signal:/iu.test(line),
);

if (contentSignalLines.length !== 1) {
  errors.push("robots.txt must contain exactly one Content-Signal directive.");
} else {
  const signalEntries = contentSignalLines[0]
    .replace(/^Content-Signal:\s*/iu, "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase());
  const expectedSignals = new Set(["search=no", "ai-input=no", "ai-train=no"]);

  if (
    signalEntries.length !== expectedSignals.size ||
    signalEntries.some((entry) => !expectedSignals.has(entry))
  ) {
    errors.push(
      "Content-Signal must set search=no, ai-input=no, and ai-train=no exactly once.",
    );
  }
}

if (cname !== "mta-sts.guitard.ca") {
  errors.push("CNAME must contain exactly mta-sts.guitard.ca.");
}

if (/Access-Control-Allow-Origin:/iu.test(headers)) {
  errors.push("_headers must not enable cross-origin access.");
}

for (const requiredPath of [
  "/.well-known/mta-sts.txt",
  "/404.html",
  "/css/*.css",
  "/robots.txt",
]) {
  if (!headers.includes(requiredPath)) {
    errors.push(`_headers is missing the ${requiredPath} section.`);
  }
}

if (errors.length > 0) {
  console.error("Site resource validation failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    "Local resources, robots rules, CNAME, and documented headers are valid.",
  );
}
