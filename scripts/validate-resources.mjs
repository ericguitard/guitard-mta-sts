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
const siteManifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "site.manifest.json"), "utf8"),
);

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

const contentSecurityPolicy =
  "default-src 'none'; script-src 'none'; script-src-attr 'none'; connect-src 'none'; style-src 'self'; img-src https://assets.guitard.ca; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const defaultsSection = "/*";

const expectedDefaults = {
  "content-security-policy": contentSecurityPolicy,
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};

const expectedHeaderBlocks = new Map([
  [
    "/404.html",
    {
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    },
  ],
  [
    "/css/*.css",
    {
      "content-type": "text/css; charset=utf-8",
    },
  ],
  [
    "/.well-known/mta-sts.txt",
    {
      "content-type": "text/plain; charset=utf-8",
    },
  ],
  [
    "/robots.txt",
    {
      "content-type": "text/plain; charset=utf-8",
    },
  ],
]);

function parseHeaderBlocks(document) {
  const blocks = new Map();
  let currentPath;

  for (const [index, line] of document.split(/\r?\n/u).entries()) {
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) continue;

    if (!/^\s/u.test(line)) {
      currentPath = trimmed;
      if (blocks.has(currentPath)) {
        errors.push(`_headers contains a duplicate ${currentPath} section.`);
      } else {
        blocks.set(currentPath, new Map());
      }
      continue;
    }

    if (!currentPath) {
      errors.push(`_headers line ${index + 1} has no path section.`);
      continue;
    }

    const match = /^([A-Za-z0-9-]+):\s*(.+)$/u.exec(trimmed);
    if (!match) {
      errors.push(`_headers line ${index + 1} is not a valid header.`);
      continue;
    }

    const name = match[1].toLowerCase();
    const value = match[2];
    const block = blocks.get(currentPath);

    if (block.has(name)) {
      errors.push(
        `_headers ${currentPath} contains duplicate ${match[1]} headers.`,
      );
    } else {
      block.set(name, value);
    }
  }

  return blocks;
}

const parsedHeaderBlocks = parseHeaderBlocks(headers);

for (const pathName of parsedHeaderBlocks.keys()) {
  if (pathName === defaultsSection) continue;
  if (!expectedHeaderBlocks.has(pathName)) {
    errors.push(`_headers contains an unexpected ${pathName} section.`);
  }
}

const defaultsBlock = parsedHeaderBlocks.get(defaultsSection);
if (!defaultsBlock) {
  errors.push(`_headers is missing the ${defaultsSection} defaults section.`);
} else {
  for (const [name, expectedValue] of Object.entries(expectedDefaults)) {
    const actualValue = defaultsBlock.get(name);
    if (actualValue !== expectedValue) {
      errors.push(
        `_headers ${defaultsSection} must set ${name} to ${expectedValue}; found ${actualValue ?? "nothing"}.`,
      );
    }
  }

  for (const name of defaultsBlock.keys()) {
    if (!(name in expectedDefaults)) {
      errors.push(
        `_headers ${defaultsSection} contains unexpected header ${name}.`,
      );
    }
  }
}

for (const [pathName, expectedHeaders] of expectedHeaderBlocks) {
  const actualHeaders = parsedHeaderBlocks.get(pathName);

  if (!actualHeaders) {
    errors.push(`_headers is missing the ${pathName} section.`);
    continue;
  }

  for (const [name, expectedValue] of Object.entries(expectedHeaders)) {
    const actualValue = actualHeaders.get(name);
    if (actualValue !== expectedValue) {
      errors.push(
        `_headers ${pathName} must set ${name} to ${expectedValue}; found ${actualValue ?? "nothing"}.`,
      );
    }
  }

  for (const name of actualHeaders.keys()) {
    if (name in expectedDefaults) {
      errors.push(
        `_headers ${pathName} redeclares default header ${name}; remove it so ${defaultsSection} provides the single source.`,
      );
    } else if (!(name in expectedHeaders)) {
      errors.push(`_headers ${pathName} contains unexpected header ${name}.`);
    }
  }
}

if (/Access-Control-Allow-Origin:/iu.test(headers)) {
  errors.push("_headers must not enable cross-origin access.");
}

const expectedPublishedFiles = [
  ".nojekyll",
  ".well-known/mta-sts.txt",
  "404.html",
  "CNAME",
  "css/style.css",
  "robots.txt",
];
if (
  siteManifest.version !== 1 ||
  JSON.stringify([...(siteManifest.files ?? [])].sort()) !==
    JSON.stringify([...expectedPublishedFiles].sort())
) {
  errors.push(
    "site.manifest.json must publish exactly the six required protocol-site files.",
  );
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
