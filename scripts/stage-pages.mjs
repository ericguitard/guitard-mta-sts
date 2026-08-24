import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export async function resolveSafeRegularFile(root, relativePath) {
  const rootRealPath = await realpath(root);
  const source = path.resolve(rootRealPath, relativePath);
  if (!isInside(rootRealPath, source)) {
    throw new Error(`Refusing to stage unsafe path: ${relativePath}`);
  }

  const sourceDetails = await lstat(source);
  if (sourceDetails.isSymbolicLink()) {
    throw new Error(`Refusing to stage symbolic link: ${relativePath}`);
  }
  if (!sourceDetails.isFile()) {
    throw new Error(`Refusing to stage non-file path: ${relativePath}`);
  }

  const sourceRealPath = await realpath(source);
  if (!isInside(rootRealPath, sourceRealPath)) {
    throw new Error(
      `Refusing to stage path outside the repository: ${relativePath}`,
    );
  }
  return sourceRealPath;
}

async function stagePages() {
  const root = await realpath(process.cwd());
  const stageDirectory = path.resolve(root, ".pages");
  if (
    path.dirname(stageDirectory) !== root ||
    path.basename(stageDirectory) !== ".pages"
  ) {
    throw new Error(
      `Refusing to stage outside the repository: ${stageDirectory}`,
    );
  }

  const manifest = JSON.parse(
    await readFile(path.join(root, "site.manifest.json"), "utf8"),
  );
  const files = [...new Set(manifest.files)];
  if (manifest.version !== 1 || files.length !== manifest.files.length) {
    throw new Error(
      "site.manifest.json must use version 1 and contain unique files",
    );
  }

  await rm(stageDirectory, { recursive: true, force: true });
  await mkdir(stageDirectory, { recursive: true });

  for (const relativePath of files) {
    const source = await resolveSafeRegularFile(root, relativePath);
    const destination = path.resolve(stageDirectory, relativePath);
    if (!isInside(stageDirectory, destination)) {
      throw new Error(`Refusing to stage unsafe path: ${relativePath}`);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }

  console.log(
    `Staged ${files.length} declared public files in ${stageDirectory}.`,
  );
}

if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await stagePages();
}
