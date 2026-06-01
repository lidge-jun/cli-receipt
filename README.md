<p align="center">
  <strong>cli-receipt</strong><br>
  Local-first monthly usage receipts for Claude Code, OpenAI Codex, and GitHub Copilot.
</p>

<p align="center">
  <a href="https://github.com/lidge-jun/cli-receipt/actions/workflows/ci.yml"><img src="https://github.com/lidge-jun/cli-receipt/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/lidge-jun/cli-receipt/actions/workflows/pages.yml"><img src="https://github.com/lidge-jun/cli-receipt/actions/workflows/pages.yml/badge.svg" alt="Pages"></a>
  <img src="https://img.shields.io/badge/runtime-zero_dependencies-111827" alt="zero runtime dependencies">
  <img src="https://img.shields.io/badge/license-MIT-2563eb" alt="MIT license">
</p>

---

# cli-receipt

`cli-receipt` reads local activity artifacts from Claude Code, OpenAI Codex, and
GitHub Copilot, estimates token usage and cost, and renders monthly receipts as
terminal output, HTML heatmaps, and JSON reports.

No external service is required for the main report. Node.js `>=20` is enough.

## Public Surface

| Surface | Status |
|---------|--------|
| CLI binary | `cli-receipt` via `bin/agent-usage.js` |
| Package | `cli-receipt@0.1.0`, ESM, Node `>=20` |
| Runtime dependencies | None |
| Providers | Claude Code, OpenAI Codex, GitHub Copilot |
| Outputs | terminal, HTML, JSON |
| Sample asset | `assets/monthly-summary-sample.png` and `.svg` |
| CI | `node --test`, `npm pack --dry-run`, docs/Pages checks |
| GitHub Pages | `/docs/index.html` static landing page, ready for Pages deployment |
| License | MIT |

Remote Pages state: GitHub Pages is not enabled for this repository yet
(`GET /repos/lidge-jun/cli-receipt/pages` returns 404). The added Pages workflow
deploys `/docs` after an authorized push.

## Sample Output

![Sample monthly summary receipt](https://raw.githubusercontent.com/lidge-jun/cli-receipt/main/assets/monthly-summary-sample.png)

## Fastest Start

One-off report with `npx`:

```bash
npx cli-receipt report
```

Generate HTML and JSON files:

```bash
npx cli-receipt report --output html,json
```

Last 30 days, Claude only:

```bash
npx cli-receipt report --provider claude --window last30
```

By default output files are written to `./output` relative to the directory
where you run the command.

## Install Modes

### One-off runs

```bash
npx cli-receipt report
```

### Global install for a persistent command or hooks

```bash
npm install -g cli-receipt
cli-receipt report
```

### Local clone for development

```bash
git clone https://github.com/lidge-jun/cli-receipt.git
cd cli-receipt
node bin/agent-usage.js report
```

## CLI Reference

Main command:

```bash
cli-receipt report [options]
```

Options:

| Option | Default | Description |
|--------|---------|-------------|
| `--provider <list>` | `auto` | Comma-separated: `claude`, `codex`, `copilot`, or `auto` |
| `--window <type>` | `month` | `month` or `last30` |
| `--month <YYYY-MM>` | `current` | Target month, for example `2026-03` |
| `--output <list>` | `terminal` | Comma-separated: `terminal`, `html`, `json` |
| `--outdir <path>` | `./output` | Output directory for HTML and JSON files |
| `--copilot-token-file <path>` | none | Explicit token file for Copilot quota snapshots |
| `--claude-root <path>` | `~/.claude` | Override Claude data root |
| `--codex-root <path>` | `~/.codex` | Override Codex data root |
| `--copilot-root <path>` | `~/.copilot/session-state` | Override Copilot data root |
| `--settings <path>` | `~/.claude/settings.json` | Settings path used by Claude hook install |

Global flags:

```bash
cli-receipt --help
cli-receipt --version
```

## How It Works

```text
~/.claude/projects/**/*.jsonl   -> Claude provider  -+
~/.codex/sessions/**/*.jsonl    -> Codex provider   -+-> aggregate -> render
~/.copilot/session-state/*      -> Copilot provider -+
```

Each provider extracts model metadata and token counts from local files,
estimates pricing with a built-in pricing table, and feeds a single reporting
pipeline.

## Claude Hook Setup

Use a global install for hooks. Do not use `npx` for hook installation, because
hooks should point to a stable local binary path.

```bash
npm install -g cli-receipt
cli-receipt install-claude-hook
```

Install the hook for only Claude and Codex:

```bash
cli-receipt install-claude-hook --provider claude,codex
```

Remove the hook:

```bash
cli-receipt uninstall-claude-hook
```

What it does:

- updates `~/.claude/settings.json` by default
- adds a `SessionEnd` hook
- runs `node "<repo>/bin/agent-usage.js" refresh --provider ... --output html,json`

## Pricing Notes

Pricing is estimated from public API pricing and local token artifacts.

- It is not an authoritative billing source.
- Claude, Codex, and Copilot totals stay separated by provider.
- Codex daily totals are based on `token_count` event deltas.
- Claude `-fast` aliases are normalized for pricing.
- Copilot quota snapshots need `--copilot-token-file` when you want quota data.
- Small rounding differences are normal.

## Privacy and Safety

- The main report reads local files and does not call provider billing APIs.
- Generated reports can include model names, usage patterns, timestamps, and
  estimated cost. Treat exported HTML/JSON as private unless redacted.
- Hook installation edits Claude settings; review the diff before keeping it.
- Pricing tables can drift from provider pricing pages, so use the output as an
  estimate, not an invoice.

## Development

Run tests:

```bash
npm test
```

Run the pre-publish check:

```bash
npm run release:check
```

Show help:

```bash
npx cli-receipt --help
```

## Verification Policy

Before claiming a release or docs change:

```bash
npm test
npm run release:check
git diff --check
```

The added CI workflow runs those gates plus static docs/Pages metadata checks.
`npm audit` is not meaningful here because the package has no runtime
dependencies and no lockfile.

## License

[MIT](./LICENSE)
