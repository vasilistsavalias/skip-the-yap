const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extension = path.join(root, "src");

test("public release metadata uses the Skip the Yap brand and one version", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"), "utf8"));
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));

  assert.equal(manifest.name, "Skip the Yap!");
  assert.equal(manifest.action.default_title, manifest.name);
  assert.equal(manifest.description.length <= 132, true);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[""].version, packageJson.version);
});

test("manifest uses minimum permissions and only the scoped main-world media bridge", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.permissions.sort(), ["clipboardWrite", "storage", "webRequest"]);
  assert.equal(manifest.host_permissions.some((origin) => origin.includes("googleapis.com")), false);
  for (const origins of Object.values(require("../src/shared/core.js").PROVIDER_ORIGINS)) {
    for (const origin of origins) assert.equal(manifest.optional_host_permissions.includes(origin), true);
  }
  const mainWorldScripts = manifest.content_scripts.filter((script) => script.world === "MAIN");
  assert.equal(mainWorldScripts.length, 1);
  assert.deepEqual(mainWorldScripts[0].js, ["content/page-bridge.js"]);
  assert.equal(mainWorldScripts[0].run_at, "document_start");
  assert.equal(fs.existsSync(path.join(extension, "content", "page-spy.js")), false);
  assert.equal(fs.existsSync(path.join(extension, "options.js")), false);
});

test("provider keys are inaccessible to content scripts", () => {
  const serviceWorker = fs.readFileSync(path.join(extension, "background", "service-worker.js"), "utf8");
  const contentScript = fs.readFileSync(path.join(extension, "content", "content-script.js"), "utf8");

  assert.match(serviceWorker, /setAccessLevel\(\{ accessLevel: ["']TRUSTED_CONTEXTS["'] \}\)/);
  assert.doesNotMatch(contentScript, /chrome\.storage/);
});

test("publishable source contains no embedded provider API key or secret file", () => {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const files = trackedFiles
    .filter((file) => /\.(?:js|json|html|css|txt)$/i.test(file));
  const source = files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.equal(/AIza[0-9A-Za-z_-]{20,}/.test(source), false);
  assert.equal(/gsk_[0-9A-Za-z_-]{20,}/.test(source), false);
  assert.equal(/sk-[0-9A-Za-z_-]{20,}/.test(source), false);
  assert.equal(/sk_[0-9A-Za-z_-]{20,}/.test(source), false);
  assert.equal(/hf_[0-9A-Za-z_-]{20,}/.test(source), false);
  assert.equal(/xai-[0-9A-Za-z_-]{20,}/.test(source), false);
  assert.equal(trackedFiles.includes("key.txt"), false);
});

test("extension source does not log transcript or media content", () => {
  const files = fs.readdirSync(extension, { recursive: true })
    .filter((file) => file.endsWith(".js"));
  const source = files.map((file) => fs.readFileSync(path.join(extension, file), "utf8")).join("\n");
  assert.equal(/console\.(?:log|info|debug|warn|error)/.test(source), false);
});
