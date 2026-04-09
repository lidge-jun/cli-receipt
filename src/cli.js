import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateSessions } from "./core/aggregate.js";
import { resolvePeriod } from "./core/date.js";
import { renderHtml, renderJson, renderTerminal } from "./core/render.js";
import { writeTextFile } from "./core/fs.js";
import { collectClaudeSessions } from "./providers/claude.js";
import { collectCodexSessions } from "./providers/codex.js";
import { collectCopilotSessions, fetchCopilotSnapshot } from "./providers/copilot.js";
import { ensureAbsolute, expandHome } from "./core/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const defaultOutputDir = path.join(process.cwd(), "output");

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export async function main(argv) {
  const [command = "report", ...rest] = argv;
  const options = parseArgs(rest);

  if (options.version || command === "--version") {
    const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
    process.stdout.write(`${pkg.name} v${pkg.version}\n`);
    return;
  }

  if (options.help || command === "--help" || command === "help") {
    printHelp();
    return;
  }

  if (command === "install-claude-hook") {
    await installClaudeHook(options);
    return;
  }

  if (command === "uninstall-claude-hook") {
    await uninstallClaudeHook(options);
    return;
  }

  if (command !== "report" && command !== "refresh") {
    throw new Error(`Unknown command "${command}". Use report, refresh, install-claude-hook, or uninstall-claude-hook.`);
  }

  const report = await buildReport(options);
  const outputs = normalizeOutputs(options.output || (command === "refresh" ? "html,json" : "terminal"));
  const rawOutdir = options.outdir || defaultOutputDir;
  if (rawOutdir.split(path.sep).includes("..") || rawOutdir.includes("/..") || rawOutdir.includes("\\..")) {
    throw new Error("--outdir must not contain '..' path segments.");
  }
  const outdir = ensureAbsolute(expandHome(rawOutdir));

  if (outputs.includes("terminal")) {
    process.stdout.write(renderTerminal(report));
  }
  if (outputs.includes("json")) {
    await writeTextFile(path.join(outdir, `${report.fileLabel}.json`), renderJson(report));
  }
  if (outputs.includes("html")) {
    await writeTextFile(path.join(outdir, `${report.fileLabel}.html`), renderHtml(report));
  }
}

async function buildReport(options) {
  const period = resolvePeriod({
    window: options.window,
    month: options.month
  });
  const providers = normalizeProviders(options.provider || "auto");
  const sessions = [];
  const providerSnapshots = [];

  if (providers.includes("claude")) {
    sessions.push(...(await collectClaudeSessions({ root: options.claudeRoot })));
  }
  if (providers.includes("codex")) {
    sessions.push(...(await collectCodexSessions({ root: options.codexRoot })));
  }
  if (providers.includes("copilot")) {
    sessions.push(...(await collectCopilotSessions({ root: options.copilotRoot })));
    const copilot = await fetchCopilotSnapshot({
      tokenFile: options.copilotTokenFile
    });
    if (copilot && (copilot.receiptType === "quota" || sessions.filter((item) => item.provider === "copilot").length === 0)) {
      providerSnapshots.push(copilot);
    }
  }

  return {
    ...aggregateSessions(sessions, period),
    providerSnapshots
  };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (DANGEROUS_KEYS.has(key)) continue;
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = "true";
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

function normalizeOutputs(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProviders(value) {
  if (value === "auto") {
    return ["claude", "codex", "copilot"];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function installClaudeHook(options) {
  const settingsPath = ensureAbsolute(expandHome(options.settings || "~/.claude/settings.json"));
  const command = `node "${path.join(packageRoot, "bin", "agent-usage.js")}" refresh --provider ${options.provider || "claude,codex"} --output html,json`;
  const fs = await import("node:fs/promises");
  const { pathExists } = await import("./core/fs.js");

  let settings = {};
  if (await pathExists(settingsPath)) {
    settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
  }

  settings.hooks ??= {};
  settings.hooks.SessionEnd ??= [];
  settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(
    (entry) => !entry.hooks?.some((hook) => String(hook.command || "").includes("agent-usage.js"))
  );
  settings.hooks.SessionEnd.push({
    hooks: [
      {
        type: "command",
        command
      }
    ]
  });

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  process.stdout.write(`Installed Claude SessionEnd hook in ${settingsPath}\n`);
}

async function uninstallClaudeHook(options) {
  const settingsPath = ensureAbsolute(expandHome(options.settings || "~/.claude/settings.json"));
  const fs = await import("node:fs/promises");
  const { pathExists } = await import("./core/fs.js");
  if (!(await pathExists(settingsPath))) {
    process.stdout.write(`No settings file at ${settingsPath}\n`);
    return;
  }

  const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
  if (settings.hooks?.SessionEnd) {
    settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(
      (entry) => !entry.hooks?.some((hook) => String(hook.command || "").includes("agent-usage.js"))
    );
    if (settings.hooks.SessionEnd.length === 0) {
      delete settings.hooks.SessionEnd;
    }
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  }
  process.stdout.write(`Removed Claude SessionEnd hook from ${settingsPath}\n`);
}

function printHelp() {
  process.stdout.write(`
cli-receipt — Monthly CLI activity heatmaps and cost receipts

USAGE
  npx cli-receipt report [options]
  npx cli-receipt install-claude-hook
  npx cli-receipt uninstall-claude-hook

OPTIONS
  --provider <list>       Comma-separated: claude,codex,copilot or "auto" (default: auto)
  --window <type>         "month" or "last30" (default: month)
  --month <YYYY-MM>       Target month or "current" (default: current)
  --output <list>         Comma-separated: terminal,html,json (default: terminal)
  --outdir <path>         Output directory for html/json files (default: ./output)
  --copilot-token-file    Explicit path to GitHub Copilot token file
  --help                  Show this help message
  --version               Show version number

EXAMPLES
  npx cli-receipt report
  npx cli-receipt report --provider claude --window last30 --output html,json
  npx cli-receipt report --month 2026-03 --output terminal
  npx cli-receipt install-claude-hook

`);
}
