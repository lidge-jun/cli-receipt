const CLAUDE_LOGO = `     ▐▛███▜▌
    ▝▜█████▛▘
      ▘▘ ▝▝   `;

const SEPARATOR = "━".repeat(35);
const LIGHT_SEPARATOR = "─".repeat(35);
const HEAT = [" ", ".", ":", "=", "#"];

export function renderTerminal(report) {
  const receipts = report.providers.map((provider) => renderProviderReceipt(report, provider));
  const snapshotReceipts = (report.providerSnapshots ?? []).map((snapshot) => renderSnapshotReceipt(snapshot));
  const summaryReceipt = renderSummaryReceipt(report);
  return `${[...receipts, ...snapshotReceipts, summaryReceipt].join("\n\n")}\n`;
}

export function renderHtml(report) {
  const cells = report.daily
    .map((day) => {
      const intensity = heatIndex(day.activity, report.daily);
      return `<div class="cell intensity-${intensity}" title="${day.date}: ${day.activity} activity, ${day.sessions} sessions">${day.date.slice(8, 10)}</div>`;
    })
    .join("");

  const providerRows = report.providers
    .map(
      (provider) =>
        `<tr><td>${escapeHtml(provider.name)}</td><td>${provider.sessions}</td><td>${provider.activity}</td><td>${formatNumber(provider.totalTokens)}</td><td>${provider.totalCost > 0 ? formatCurrency(provider.totalCost) : "--"}</td></tr>`
    )
    .join("");

  const projectRows = report.projects
    .map(
      (project) =>
        `<tr><td>${escapeHtml(project.name)}</td><td>${escapeHtml(project.provider || "--")}</td><td>${project.sessions}</td><td>${project.activity}</td><td>${formatNumber(project.totalTokens)}</td></tr>`
    )
    .join("");

  const receiptPanels = report.providers
    .map((provider) => renderProviderReceiptHtml(report, provider))
    .concat((report.providerSnapshots ?? []).map((snapshot) => renderSnapshotReceiptHtml(snapshot)))
    .concat(renderSummaryReceiptHtml(report))
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Usage ${escapeHtml(report.month)}</title>
  <style>
    :root {
      --bg: #403b36;
      --paper: #f8f8f4;
      --ink: #2d2a26;
      --muted: #6b665f;
      --line: rgba(45,42,38,0.15);
      --heat-0: #efeadf;
      --heat-1: #dde6c8;
      --heat-2: #b7cb90;
      --heat-3: #75995f;
      --heat-4: #335e4f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Courier New", monospace;
      background: radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 30%), var(--bg);
      color: var(--ink);
      padding: 24px;
    }
    main {
      max-width: 1280px;
      margin: 0 auto;
    }
    .hero {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px;
      padding: 24px;
      color: white;
      margin-bottom: 24px;
    }
    .hero h1 {
      margin: 0 0 12px;
      font-family: "IBM Plex Serif", serif;
    }
    .hero-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 20px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .stat {
      background: rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 14px;
    }
    .stat strong {
      display: block;
      font-size: 28px;
      margin-top: 6px;
    }
    .heatmap {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 8px;
    }
    .cell {
      aspect-ratio: 1;
      border-radius: 12px;
      display: grid;
      place-items: center;
      font-size: 12px;
      color: white;
    }
    .intensity-0 { background: var(--heat-0); color: var(--ink); }
    .intensity-1 { background: var(--heat-1); color: var(--ink); }
    .intensity-2 { background: var(--heat-2); }
    .intensity-3 { background: var(--heat-3); }
    .intensity-4 { background: var(--heat-4); }
    .receipts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 24px;
      margin-bottom: 24px;
    }
    .receipt {
      background: var(--paper);
      border-radius: 18px;
      padding: 22px 18px;
      box-shadow: 0 22px 50px rgba(0,0,0,0.18);
      position: relative;
    }
    .receipt::before, .receipt::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      height: 12px;
      background: repeating-linear-gradient(90deg, transparent, transparent 10px, var(--paper) 10px, var(--paper) 20px);
    }
    .receipt::before { top: -12px; }
    .receipt::after { bottom: -12px; }
    .receipt pre {
      margin: 0;
      white-space: pre-wrap;
      font-family: inherit;
      line-height: 1.5;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 18px;
      overflow: hidden;
    }
    th, td {
      text-align: left;
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
    }
    @media (max-width: 860px) {
      .hero-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="hero-grid">
        <div>
          <h1>${escapeHtml(report.periodTitle || report.periodLabel)}</h1>
          <p>Reference-style receipts for each provider. Claude and Codex have separate pricing estimates, and billing is intentionally not merged across providers.</p>
          <div class="stats">
            <div class="stat"><span>Sessions</span><strong>${report.total.sessions}</strong></div>
            <div class="stat"><span>Activity</span><strong>${report.total.activity}</strong></div>
            <div class="stat"><span>Messages</span><strong>${report.total.messages}</strong></div>
            <div class="stat"><span>Billing</span><strong>Provider-separated</strong></div>
          </div>
        </div>
        <div class="heatmap">${cells}</div>
      </div>
    </section>
    <section class="receipts">${receiptPanels}</section>
    <table>
      <thead>
        <tr><th>Provider</th><th>Sessions</th><th>Activity</th><th>Tokens</th><th>Est. cost</th></tr>
      </thead>
      <tbody>${providerRows}</tbody>
    </table>
    <div style="height:16px"></div>
    <table>
      <thead>
        <tr><th>Project</th><th>Provider</th><th>Sessions</th><th>Activity</th><th>Tokens</th></tr>
      </thead>
      <tbody>${projectRows}</tbody>
    </table>
  </main>
</body>
</html>`;
}

export function renderJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function renderProviderReceipt(report, provider) {
  const lines = [];
  lines.push(SEPARATOR);
  lines.push(...providerLogo(provider.name).split("\n"));
  lines.push(SEPARATOR);
  lines.push("");
  lines.push(centerText(providerReceiptTitle(provider.name, report.window), 35));
  lines.push(centerText(report.periodLabel, 35));
  lines.push("");
  lines.push(SEPARATOR);

  if (provider.name === "copilot" && provider.totalCost > 0 && provider.modelPricing.length > 0) {
    lines.push(padLine("ITEM", "QTY", "PRICE"));
    lines.push(LIGHT_SEPARATOR);
    for (const model of provider.modelPricing) {
      lines.push(model.name);
      if ((model.inputTokens ?? 0) > 0) {
        lines.push(padLine("  Input tokens", formatReceiptQuantity(model.inputTokens ?? 0), formatCurrency(model.pricing?.components?.inputCost ?? 0)));
      }
      const isClaudeModel = String(model.modelName ?? "").toLowerCase().includes("claude");
      if ((model.cacheWriteTokens ?? 0) > 0) {
        lines.push(padLine("  Cache write", formatReceiptQuantity(model.cacheWriteTokens ?? 0), formatCurrency(model.pricing?.components?.cacheCreationCost ?? 0)));
      }
      if ((model.cachedInputTokens ?? 0) > 0) {
        const cacheCost =
          model.pricing?.components?.cachedInputCost ??
          model.pricing?.components?.cacheReadCost ??
          0;
        const cacheLabel = isClaudeModel ? "  Cache read" : "  Cached input";
        lines.push(padLine(cacheLabel, formatReceiptQuantity(model.cachedInputTokens ?? 0), formatCurrency(cacheCost)));
      }
      if ((model.outputTokens ?? 0) > 0) {
        lines.push(padLine("  Output tokens", formatReceiptQuantity(model.outputTokens ?? 0), formatCurrency(model.pricing?.components?.outputCost ?? 0)));
      }
      if ((model.premiumRequestEstimate ?? 0) > 0) {
        lines.push(padLine("  Premium req est", formatNumber(model.premiumRequestEstimate ?? 0), "--"));
      }
      if ((model.inputTokens ?? 0) === 0 && (model.outputTokens ?? 0) === 0 && (model.cachedInputTokens ?? 0) === 0) {
        lines.push(padLine("  Waste tokens", formatReceiptQuantity(model.totalTokens ?? 0), formatCurrency(model.totalCost ?? 0)));
      }
      if (model.multiplier !== undefined && model.multiplier !== null) {
        lines.push(padLine("  Premium multiplier", "", `${formatMultiplier(model.multiplier)}x`));
      }
      lines.push("");
    }
    lines.push(SEPARATOR);
    lines.push(padLine("SUBTOTAL", "", formatCurrency(provider.totalCost)));
    lines.push(LIGHT_SEPARATOR);
    lines.push(padLine("TOTAL", "", formatCurrency(provider.totalCost)));
  } else if (provider.totalCost > 0 && provider.modelPricing.length > 0) {
    lines.push(padLine("ITEM", "QTY", "PRICE"));
    lines.push(LIGHT_SEPARATOR);
    for (const model of provider.modelPricing) {
      lines.push(model.name);
      lines.push(padLine("  Input tokens", formatReceiptQuantity(model.inputTokens), formatCurrency(model.pricing?.components?.inputCost ?? 0)));
      if ((model.cachedInputTokens ?? 0) > 0) {
        lines.push(padLine("  Cached input", formatReceiptQuantity(model.cachedInputTokens), formatCurrency(model.pricing?.components?.cachedInputCost ?? 0)));
      }
      if (model.cacheCreationTokens > 0) {
        lines.push(padLine("  Cache write", formatReceiptQuantity(model.cacheCreationTokens), formatCurrency(model.pricing?.components?.cacheCreationCost ?? 0)));
      }
      lines.push(padLine("  Output tokens", formatReceiptQuantity(model.outputTokens), formatCurrency(model.pricing?.components?.outputCost ?? 0)));
      if (model.cacheWrite5mTokens > 0) {
        lines.push(padLine("  Cache write 5m", formatReceiptQuantity(model.cacheWrite5mTokens), formatCurrency(model.pricing?.components?.cacheWrite5mCost ?? 0)));
      }
      if (model.cacheWrite1hTokens > 0) {
        lines.push(padLine("  Cache write 1h", formatReceiptQuantity(model.cacheWrite1hTokens), formatCurrency(model.pricing?.components?.cacheWrite1hCost ?? 0)));
      }
      if (model.cacheReadTokens > 0) {
        lines.push(padLine("  Cache read", formatReceiptQuantity(model.cacheReadTokens), formatCurrency(model.pricing?.components?.cacheReadCost ?? 0)));
      }
      if (model.webSearchRequests > 0) {
        lines.push(padLine("  Web search", formatNumber(model.webSearchRequests), formatCurrency(model.pricing?.components?.webSearchCost ?? 0)));
      }
      lines.push("");
    }
    lines.push(SEPARATOR);
    lines.push(padLine("SUBTOTAL", "", formatCurrency(provider.totalCost)));
    lines.push(LIGHT_SEPARATOR);
    lines.push(padLine("TOTAL", "", formatCurrency(provider.totalCost)));
  } else if (provider.modelPricing.length > 0) {
    lines.push(padLine("MODEL", "ACTIVITY", "TOKENS"));
    lines.push(LIGHT_SEPARATOR);
    for (const model of provider.modelPricing) {
      lines.push(model.name);
      lines.push(
        padLine(
          "  Session activity",
          formatNumber(model.activity ?? 0),
          model.totalTokens > 0 ? formatReceiptQuantity(model.totalTokens) : "--"
        )
      );
      if (model.multiplier !== undefined && model.multiplier !== null) {
        lines.push(padLine("  Premium multiplier", "", `${formatMultiplier(model.multiplier)}x`));
      }
      lines.push("");
    }
    lines.push(SEPARATOR);
    lines.push(padLine("TOTAL", "", "--"));
  } else {
    lines.push(padLine("METRIC", "QTY", "VALUE"));
    lines.push(LIGHT_SEPARATOR);
    lines.push(padLine("Sessions", formatNumber(provider.sessions), "--"));
    lines.push(padLine("Activity", formatNumber(provider.activity), "--"));
    lines.push(padLine("Messages", formatNumber(provider.messages), "--"));
    lines.push(padLine("Local tokens", formatNumber(provider.totalTokens), "--"));
    lines.push(SEPARATOR);
    lines.push(padLine("TOTAL", "", "--"));
  }

  lines.push(SEPARATOR);
  lines.push("");
  lines.push(`SESSIONS: ${formatNumber(provider.sessions)}`);
  lines.push(`ACTIVITY: ${formatNumber(provider.activity)}`);
  lines.push(`MESSAGES: ${formatNumber(provider.messages)}`);
  lines.push(`LOCAL TOKENS: ${formatNumber(provider.totalTokens)}`);
  lines.push("");
  lines.push(centerText("HEATMAP", 35));
  lines.push(...renderHeatmap(provider.daily).split("\n"));
  lines.push("");
  lines.push(centerText(receiptFooter(provider.name), 35));
  lines.push("");
  lines.push(SEPARATOR);

  return box(lines);
}

function renderProviderReceiptHtml(report, provider) {
  return `<article class="receipt"><pre>${escapeHtml(stripAnsi(renderProviderReceipt(report, provider)))}</pre></article>`;
}

function renderSummaryReceipt(report) {
  const lines = [];
  const totalEstimate = report.providers.reduce((sum, provider) => sum + (provider.totalCost ?? 0), 0);
  const totalTokens = report.providers.reduce((sum, provider) => sum + (provider.totalTokens ?? 0), 0);

  lines.push(SEPARATOR);
  lines.push(centerText("Monthly Summary", 35));
  lines.push(SEPARATOR);
  lines.push("");
  lines.push(centerText("Final Usage Receipt", 35));
  lines.push(centerText(report.periodLabel, 35));
  lines.push("");
  lines.push(SEPARATOR);
  lines.push(padLine("ITEM", "QTY", "PRICE"));
  lines.push(LIGHT_SEPARATOR);

  for (const provider of report.providers) {
    lines.push(providerLabel(provider.name));
    lines.push(
      padLine(
        "  Month tokens",
        formatReceiptQuantity(provider.totalTokens ?? 0),
        provider.totalCost > 0 ? formatCurrency(provider.totalCost) : "--"
      )
    );
    lines.push("");
  }

  lines.push(SEPARATOR);
  lines.push(padLine("TOTAL EST.", "", formatCurrency(totalEstimate)));
  lines.push(LIGHT_SEPARATOR);
  lines.push(padLine("TOTAL TOKENS", "", formatReceiptQuantity(totalTokens)));
  lines.push(SEPARATOR);
  lines.push("");
  lines.push(centerText("Cross-provider month snapshot", 35));
  lines.push("");
  lines.push(SEPARATOR);

  return box(lines);
}

function renderSummaryReceiptHtml(report) {
  return `<article class="receipt"><pre>${escapeHtml(stripAnsi(renderSummaryReceipt(report)))}</pre></article>`;
}

function renderSnapshotReceipt(snapshot) {
  const lines = [];
  lines.push(SEPARATOR);
  lines.push(centerText(providerLabel(snapshot.provider), 35));
  lines.push(SEPARATOR);
  lines.push("");
  lines.push(centerText(`${providerLabel(snapshot.provider)} Receipt`, 35));
  if (snapshot.receiptType === "quota") {
    lines.push(centerText(`Plan: ${String(snapshot.plan || "unknown")}`, 35));
  } else {
    lines.push(centerText("Usage unavailable", 35));
  }
  lines.push("");
  lines.push(SEPARATOR);
  if (snapshot.receiptType === "quota") {
    lines.push(padLine("WINDOW", "USED", "REMAIN"));
    lines.push(LIGHT_SEPARATOR);
    if (snapshot.premium) {
      lines.push(
        padLine(
          "Premium",
          formatPercent(snapshot.premium.percentUsed),
          formatPercent(snapshot.premium.percentRemaining)
        )
      );
    }
    if (snapshot.chat) {
      lines.push(
        padLine(
          "Chat",
          formatPercent(snapshot.chat.percentUsed),
          formatPercent(snapshot.chat.percentRemaining)
        )
      );
    }
  } else {
    lines.push(centerText(truncateText(snapshot.reason || "Unknown Copilot error", 35), 35));
  }
  lines.push(SEPARATOR);
  lines.push(centerText("GitHub Copilot internal usage API", 35));
  lines.push(centerText("billing kept separate", 35));
  lines.push("");
  lines.push(SEPARATOR);
  return box(lines);
}

function renderSnapshotReceiptHtml(snapshot) {
  return `<article class="receipt"><pre>${escapeHtml(stripAnsi(renderSnapshotReceipt(snapshot)))}</pre></article>`;
}

function renderHeatmap(days) {
  const rows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => `${label} `);
  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00Z`);
    const weekday = (date.getUTCDay() + 6) % 7;
    rows[weekday] += `${HEAT[heatIndex(day.activity, days)]} `;
  }
  return rows.join("\n");
}

function heatIndex(activity, days) {
  const max = Math.max(...days.map((day) => day.activity), 1);
  if (activity <= 0) return 0;
  const normalized = activity / max;
  if (normalized < 0.25) return 1;
  if (normalized < 0.5) return 2;
  if (normalized < 0.75) return 3;
  return 4;
}

function box(lines) {
  const width = Math.max(...lines.map((line) => line.length), 35);
  const top = `╭${"─".repeat(width + 2)}╮`;
  const bottom = `╰${"─".repeat(width + 2)}╯`;
  const body = lines.map((line) => `│ ${line.padEnd(width)} │`);
  return [top, ...body, bottom].join("\n");
}

function padLine(left, middle, right, width = 35) {
  const contentWidth = left.length + middle.length + right.length;
  if (contentWidth >= width) {
    return `${left} ${middle} ${right}`.trim();
  }
  const middleSpace = Math.max(1, Math.floor((width - contentWidth) / 2));
  const rightSpace = Math.max(1, width - contentWidth - middleSpace);
  return left + " ".repeat(middleSpace) + middle + " ".repeat(rightSpace) + right;
}

function centerText(text, width) {
  if (text.length >= width) return text;
  const padding = Math.floor((width - text.length) / 2);
  return " ".repeat(padding) + text;
}

function providerLabel(name) {
  return {
    claude: "Claude",
    codex: "Codex",
    copilot: "Copilot"
  }[name] || name;
}

function providerLogo(name) {
  if (name === "claude") return CLAUDE_LOGO;
  return centerText(providerLabel(name), 35);
}

function providerReceiptTitle(name, window) {
  if (window === "last30") {
    return `${providerLabel(name)} 30-Day Receipt`;
  }
  return `${providerLabel(name)} Monthly Receipt`;
}

function receiptFooter(name) {
  if (name === "claude") return "Cache + web search included";
  if (name === "codex") return "Official pricing + modifiers";
  return "Official waste estimate";
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function formatReceiptQuantity(value) {
  const numeric = Number(value ?? 0);
  if (Math.abs(numeric) >= 1_000_000) {
    return `${formatCompactWithOneDecimal(numeric / 1_000_000)}m`;
  }
  if (Math.abs(numeric) >= 1_000) {
    return `${formatCompactWithOneDecimal(numeric / 1_000)}k`;
  }
  return formatNumber(numeric);
}

function formatCurrency(value) {
  return `$${(value ?? 0).toFixed(2)}`;
}

function formatPercent(value) {
  return `${(value ?? 0).toFixed(0)}%`;
}

function formatMultiplier(value) {
  const numeric = Number(value ?? 0);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatCompactWithOneDecimal(value) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(numeric);
}

function truncateText(value, width) {
  if (value.length <= width) return value;
  return `${value.slice(0, width - 3)}...`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stripAnsi(value) {
  return String(value).replace(/\u001B\[[0-9;]*m/g, "");
}
