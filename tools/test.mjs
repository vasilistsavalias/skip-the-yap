import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDirectory = path.join(root, "tests");
const files = (await readdir(testDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js"))
  .map((entry) => path.join(testDirectory, entry.name))
  .sort((left, right) => left.localeCompare(right));

if (!files.length) throw new Error("No extension test files found.");

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["--test", ...files], { cwd: root, stdio: "inherit" });
  child.on("error", reject);
  child.on("exit", (code, signal) => signal ? reject(new Error(`Test runner stopped by ${signal}.`)) : resolve(code));
});

process.exitCode = exitCode ?? 1;
