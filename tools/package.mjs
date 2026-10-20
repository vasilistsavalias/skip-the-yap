import { createWriteStream } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZipArchive } from "archiver";
import { buildExtension } from "./build.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distributionRoot = path.join(projectRoot, "dist");
const buildDirectory = path.join(distributionRoot, "skip-the-yap");
const manifest = JSON.parse(await readFile(path.join(projectRoot, "src", "manifest.json"), "utf8"));
const archivePath = path.join(distributionRoot, `skip-the-yap-${manifest.version}.zip`);
const archiveDate = new Date("2026-01-01T00:00:00.000Z");

if (path.dirname(archivePath) !== distributionRoot) throw new Error("Unsafe archive output path.");

async function listReleaseFiles(directory, relativeDirectory = "") {
  const entries = await readdir(path.join(directory, relativeDirectory), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...await listReleaseFiles(directory, relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

await buildExtension();
await rm(archivePath, { force: true });
const releaseFiles = await listReleaseFiles(buildDirectory);
const releaseEntries = await Promise.all(releaseFiles.map(async (relativePath) => ({
  relativePath,
  contents: await readFile(path.join(buildDirectory, relativePath))
})));

await new Promise((resolve, reject) => {
  const output = createWriteStream(archivePath, { flags: "wx" });
  const archive = new ZipArchive({ forceLocalTime: false, zlib: { level: 9 } });
  output.on("close", resolve);
  output.on("error", reject);
  archive.on("error", reject);
  archive.pipe(output);
  for (const entry of releaseEntries) {
    archive.append(entry.contents, {
      name: entry.relativePath.replaceAll(path.sep, "/"),
      date: archiveDate,
      mode: 0o644
    });
  }
  archive.finalize();
});
