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

if (
  !/^User-agent: \*\r?\nDisallow: \/\s*$/imu.test(
    robots.replace(/^#.*\r?\n/gmu, "").trim(),
  )
) {
  errors.push(
    "robots.txt must contain the standard User-agent and Disallow rules.",
  );
}

if (/^Content-Signal:/imu.test(robots)) {
  errors.push("robots.txt contains the non-standard Content-Signal directive.");
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
