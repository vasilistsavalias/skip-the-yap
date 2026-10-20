import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(projectRoot, "src");
const distributionRoot = path.join(projectRoot, "dist");
const outputDirectory = path.join(distributionRoot, "skip-the-yap");

function assertInside(parent, child) {
  const relative = path.relative(parent, child);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to operate outside ${parent}`);
  }
}

async function assertFile(relativePath) {
  const target = path.join(outputDirectory, relativePath);
  const metadata = await stat(target);
  if (!metadata.isFile()) throw new Error(`Expected release file: ${relativePath}`);
}

export async function buildExtension() {
  assertInside(projectRoot, distributionRoot);
  assertInside(distributionRoot, outputDirectory);
  await rm(distributionRoot, { recursive: true, force: true });
  await mkdir(distributionRoot, { recursive: true });
  await cp(sourceDirectory, outputDirectory, { recursive: true });

  const manifest = JSON.parse(await readFile(path.join(outputDirectory, "manifest.json"), "utf8"));
  await assertFile(manifest.background.service_worker);
  await assertFile(manifest.action.default_popup);
  for (const script of manifest.content_scripts) {
    for (const file of script.js || []) await assertFile(file);
    for (const file of script.css || []) await assertFile(file);
  }
  for (const file of Object.values(manifest.icons || {})) await assertFile(file);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildExtension();
}
