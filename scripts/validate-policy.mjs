import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const policyPath = path.join(repositoryRoot, ".well-known", "mta-sts.txt");
const policyBuffer = await readFile(policyPath);
const policy = policyBuffer.toString("utf8");
const errors = [];

if (policyBuffer.length > 64 * 1024) {
  errors.push("Policy exceeds the RFC 8461 maximum size of 64 KiB.");
}

if (policy.charCodeAt(0) === 0xfeff) {
  errors.push("Policy must not contain a UTF-8 byte-order mark.");
}

if (!policy.endsWith("\n")) {
  errors.push("Policy must end with a newline.");
}

if (/\r(?!\n)/u.test(policy)) {
  errors.push("Policy contains a bare carriage return.");
}

const lines = policy
  .split(/\r?\n/u)
  .filter(
    (line, index, allLines) => line !== "" || index < allLines.length - 1,
  );
const fields = new Map();

for (const [index, line] of lines.entries()) {
  if (line.length === 0) {
    errors.push(`Line ${index + 1} is unexpectedly blank.`);
    continue;
  }

  const match = /^([a-z][a-z0-9_-]*):[ \t]*(\S(?:.*\S)?)$/u.exec(line);
  if (!match) {
    errors.push(`Line ${index + 1} is not a valid policy field.`);
    continue;
  }

  const [, name, value] = match;
  const values = fields.get(name) ?? [];
  values.push(value);
  fields.set(name, values);
}

function requireSingleField(name) {
  const values = fields.get(name) ?? [];
  if (values.length !== 1) {
    errors.push(`Policy must contain exactly one ${name} field.`);
  }
  return values[0];
}

const version = requireSingleField("version");
const mode = requireSingleField("mode");
const maxAgeValue = requireSingleField("max_age");
const mxPatterns = fields.get("mx") ?? [];

if (lines[0] !== "version: STSv1" || version !== "STSv1") {
  errors.push("The first field must be exactly version: STSv1.");
}

if (!new Set(["enforce", "testing", "none"]).has(mode)) {
  errors.push("Mode must be enforce, testing, or none.");
}

if (mode !== "none" && mxPatterns.length === 0) {
  errors.push("At least one mx field is required unless mode is none.");
}

for (const mxPattern of mxPatterns) {
  if (
    !/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/iu.test(
      mxPattern,
    )
  ) {
    errors.push(`Invalid MX pattern: ${mxPattern}`);
  }
}

if (!/^\d+$/u.test(maxAgeValue ?? "")) {
  errors.push("max_age must be a non-negative integer.");
} else if (Number(maxAgeValue) > 31_557_600) {
  errors.push("max_age exceeds the RFC 8461 maximum of 31557600 seconds.");
}

for (const name of fields.keys()) {
  if (!new Set(["version", "mode", "mx", "max_age"]).has(name)) {
    errors.push(`Unexpected policy extension field: ${name}`);
  }
}

if (errors.length > 0) {
  console.error("MTA-STS policy validation failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `MTA-STS policy is valid: ${mode} mode, ${mxPatterns.length} MX hosts, max_age ${maxAgeValue}.`,
  );
}
