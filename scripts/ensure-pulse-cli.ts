import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const venvPython = join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const required = process.argv.includes("--require");

if (process.env.PULSE_SKIP_CLI === "1") {
  console.log("Skipping Pulse CLI setup (PULSE_SKIP_CLI=1).");
  process.exit(0);
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")}`);
  }
}

function canImportNative(python: string) {
  return (
    spawnSync(python, ["-c", "import pulse_native; assert hasattr(pulse_native, 'send_once_json')"], {
      cwd: root,
    }).status === 0
  );
}

function python3(): string | null {
  const result = spawnSync("python3", ["--version"]);
  return result.status === 0 ? "python3" : null;
}

function failOrSkip(message: string): never {
  if (required) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
  process.exit(0);
}

if (existsSync(venvPython) && canImportNative(venvPython)) {
  process.exit(0);
}

const systemPython = python3();
if (!systemPython) {
  failOrSkip("python3 not found — Pulse desktop will start without the CLI satellite.");
}

console.log("Setting up Pulse Python CLI (.venv + pulse_native)…");

try {
  if (!existsSync(venvPython)) {
    run(systemPython, ["-m", "venv", ".venv"]);
  }
  run(venvPython, ["-m", "pip", "install", "-q", "maturin"]);
  run(venvPython, [
    "-m",
    "maturin",
    "develop",
    "--manifest-path",
    "crates/pulse-native/Cargo.toml",
  ]);
} catch (error) {
  failOrSkip(`Pulse CLI setup failed (${error instanceof Error ? error.message : error}). Desktop will still start.`);
}

if (!canImportNative(venvPython)) {
  failOrSkip("pulse_native installed but import failed — desktop will still start.");
}

console.log("Pulse CLI ready: bun run pulse:cli --help");
