import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { expandHome } from "../core/paths.js";
import { readJsonLines, walkFiles } from "../core/fs.js";
import { estimateObservedUsageCost, estimateWasteCostFromTotalTokens, getCopilotModelMetadata } from "../core/pricing.js";

// Token file must be explicitly provided via --copilot-token-file.
// No default paths are searched to avoid leaking internal infrastructure info.
const DEFAULT_TOKEN_FILES = [];

const DEFAULT_SESSION_ROOT = "~/.copilot/session-state";

export async function collectCopilotSessions(options = {}) {
  const root = expandHome(options.root || DEFAULT_SESSION_ROOT);
  const sessions = [];

  for await (const filePath of walkFiles(root, {
    maxDepth: 3,
    filter: (candidate) =>
      candidate.endsWith("workspace.yaml") || candidate.endsWith("events.jsonl")
  })) {
    if (!filePath.endsWith("workspace.yaml")) continue;
    const sessionDir = path.dirname(filePath);
    const session = await parseCopilotSessionDir(sessionDir);
    if (session) sessions.push(session);
  }

  return sessions;
}

export async function fetchCopilotSnapshot(options = {}) {
  const token = options.token || (await readTokenFromDefaultLocations(options.tokenFile));
  if (!token) {
    return {
      provider: "copilot",
      receiptType: "unavailable",
      updatedAt: new Date().toISOString(),
      reason: "No Copilot token file found"
    };
  }

  let response;
  try {
    response = await requestCopilotUsage(token);
  } catch (error) {
    return {
      provider: "copilot",
      receiptType: "unavailable",
      updatedAt: new Date().toISOString(),
      reason: error instanceof Error ? error.message : String(error)
    };
  }
  const premium = normalizeQuotaSnapshot(
    response.quota_snapshots?.premium_interactions ??
      response.quotaSnapshots?.premiumInteractions ??
      quotaFromCounts(response.monthly_quotas?.completions, response.limited_user_quotas?.completions, "completions")
  );
  const chat = normalizeQuotaSnapshot(
    response.quota_snapshots?.chat ??
      response.quotaSnapshots?.chat ??
      quotaFromCounts(response.monthly_quotas?.chat, response.limited_user_quotas?.chat, "chat")
  );

  if (!premium && !chat) {
    return {
      provider: "copilot",
      receiptType: "unavailable",
      updatedAt: new Date().toISOString(),
      reason: "Copilot quota fields not present in API response"
    };
  }

  return {
    provider: "copilot",
    receiptType: "quota",
    updatedAt: new Date().toISOString(),
    plan: response.copilot_plan || response.copilotPlan || "unknown",
    premium,
    chat
  };
}

async function parseCopilotSessionDir(sessionDir) {
  const yamlPath = path.join(sessionDir, "workspace.yaml");
  const eventsPath = path.join(sessionDir, "events.jsonl");

  let yaml = "";
  try {
    yaml = await fs.readFile(yamlPath, "utf8");
  } catch {
    return null;
  }

  const stats = {
    provider: "copilot",
    sessionId: matchYamlField(yaml, "id") || path.basename(sessionDir),
    project: matchYamlField(yaml, "name") || matchYamlField(yaml, "cwd") || sessionDir,
    cwd: matchYamlField(yaml, "cwd") || null,
    startedAt: matchYamlField(yaml, "created_at") || null,
    updatedAt: matchYamlField(yaml, "updated_at") || null,
    messages: 0,
    activity: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    modelBreakdowns: []
  };
  const modelMap = new Map();
  const shutdownSummaries = [];

  try {
    await readJsonLines(eventsPath, (entry) => {
      const timestamp = entry.timestamp ?? entry.data?.startTime ?? null;
      if (timestamp) {
        if (!stats.startedAt || timestamp < stats.startedAt) stats.startedAt = timestamp;
        if (!stats.updatedAt || timestamp > stats.updatedAt) stats.updatedAt = timestamp;
      }

      if (entry.type === "session.start") {
        stats.activity += 1;
      }
      if (entry.type === "user.message" || entry.type === "assistant.message") {
        stats.messages += 1;
        stats.activity += 1;
      }
      if (entry.type === "tool.execution_complete") {
        stats.activity += 1;
      }
      if (entry.type === "session.error") {
        stats.activity += 1;
      }

      if (entry.type === "session.shutdown") {
        const modelMetrics = entry.data?.modelMetrics ?? {};
        const modelMetricCount = Object.keys(modelMetrics).length;
        if (modelMetricCount > 0) {
          shutdownSummaries.push({
            timestamp: entry.timestamp ?? stats.updatedAt ?? stats.startedAt,
            modelMetrics
          });
        }
        return;
      }

      const modelName = entry.data?.model;
      if (!modelName) return;
      const metadata = getCopilotModelMetadata(modelName);

      const current = modelMap.get(modelName) ?? {
        modelName: metadata.canonicalModel,
        displayName: metadata.displayName,
        activity: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        multiplier: metadata.multiplier,
        knownPrice: false,
        pricing: {
          canonicalModel: metadata.canonicalModel,
          knownPrice: false,
          components: {}
        }
      };

      if (entry.type === "subagent.completed" || entry.type === "subagent.failed") {
        current.activity += 1;
        current.totalTokens += Number(entry.data?.totalTokens ?? 0);
        stats.totalTokens += Number(entry.data?.totalTokens ?? 0);
      } else if (entry.type === "tool.execution_complete") {
        current.activity += 1;
      }
      modelMap.set(metadata.canonicalModel, current);
    });
  } catch {
    // Best-effort session fallback.
  }

  if (shutdownSummaries.length > 0) {
    shutdownSummaries.sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)));
    const shutdownModelMap = new Map();

    for (const summary of shutdownSummaries) {
      if (summary.timestamp && (!stats.updatedAt || summary.timestamp > stats.updatedAt)) {
        stats.updatedAt = summary.timestamp;
      }

      for (const [modelName, entry] of Object.entries(summary.modelMetrics ?? {})) {
        const breakdown = buildShutdownBreakdown(modelName, entry);
        mergeBreakdown(shutdownModelMap, breakdown);
      }
    }

    stats.modelBreakdowns = Array.from(shutdownModelMap.values()).sort((left, right) => {
      if ((right.totalCost ?? 0) !== (left.totalCost ?? 0)) {
        return (right.totalCost ?? 0) - (left.totalCost ?? 0);
      }
      return (right.totalTokens ?? 0) - (left.totalTokens ?? 0);
    });
    stats.totalTokens = stats.modelBreakdowns.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0);
    stats.totalCost = stats.modelBreakdowns.reduce((sum, item) => sum + (item.totalCost ?? 0), 0);
    return stats;
  }

  stats.modelBreakdowns = Array.from(modelMap.values())
    .map((item) => {
      const wasteCost = estimateWasteCostFromTotalTokens(item.modelName, item.totalTokens);
      // Use ratio-based estimated breakdown when available (Claude models)
      const eb = wasteCost.estimatedBreakdown;
      return {
        ...item,
        inputTokens: eb ? eb.inputTokens : item.inputTokens,
        outputTokens: eb ? eb.outputTokens : item.outputTokens,
        cachedInputTokens: eb ? eb.cacheReadTokens : item.cachedInputTokens,
        cacheReadTokens: eb ? eb.cacheReadTokens : item.cacheReadTokens,
        cacheWriteTokens: eb ? eb.cacheWriteTokens : item.cacheWriteTokens,
        totalCost: wasteCost.cost,
        knownPrice: wasteCost.knownPrice,
        pricing: {
          canonicalModel: wasteCost.canonicalModel,
          knownPrice: wasteCost.knownPrice,
          components: wasteCost.components ?? { wasteCost: wasteCost.cost },
          basis: wasteCost.basis
        }
      };
    })
    .sort((left, right) => {
      if ((right.totalTokens ?? 0) !== (left.totalTokens ?? 0)) {
        return (right.totalTokens ?? 0) - (left.totalTokens ?? 0);
      }
      return (right.activity ?? 0) - (left.activity ?? 0);
    });
  stats.totalCost = stats.modelBreakdowns.reduce((sum, item) => sum + (item.totalCost ?? 0), 0);

  return stats;
}

async function readTokenFromDefaultLocations(explicitFile) {
  const candidates = explicitFile ? [explicitFile] : DEFAULT_TOKEN_FILES;
  for (const candidate of candidates) {
    const filePath = expandHome(candidate);
    try {
      const content = await fs.readFile(filePath, "utf8");
      const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const tokenLine = lines.find((line) => line.startsWith("gho_") || line.startsWith("github_pat_"));
      if (tokenLine) return tokenLine;
    } catch {
      // Ignore missing or unreadable token files.
    }
  }
  return null;
}

async function requestCopilotUsage(token) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      "https://api.github.com/copilot_internal/user",
      {
        method: "GET",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/json",
          "Editor-Version": "vscode/1.96.2",
          "Editor-Plugin-Version": "copilot-chat/0.26.7",
          "User-Agent": "GitHubCopilotChat/0.26.7",
          "X-Github-Api-Version": "2025-04-01"
        }
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
            reject(new Error(`Copilot API request failed with status ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    request.end();
  });
}

function normalizeQuotaSnapshot(snapshot) {
  if (!snapshot) return null;
  const entitlement = numberOrNull(snapshot.entitlement);
  const remaining = numberOrNull(snapshot.remaining);
  const percentRemaining = snapshot.percent_remaining !== undefined
    ? numberOrNull(snapshot.percent_remaining)
    : snapshot.percentRemaining !== undefined
      ? numberOrNull(snapshot.percentRemaining)
      : entitlement && remaining !== null && entitlement > 0
        ? (remaining / entitlement) * 100
        : null;

  if (percentRemaining === null) return null;

  return {
    quotaId: snapshot.quota_id || snapshot.quotaId || "",
    entitlement,
    remaining,
    percentRemaining: clamp(percentRemaining, 0, 100),
    percentUsed: clamp(100 - percentRemaining, 0, 100)
  };
}

function matchYamlField(content, field) {
  const match = content.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
}

function quotaFromCounts(monthly, limited, quotaId) {
  const entitlement = numberOrNull(monthly);
  const remaining = numberOrNull(limited);
  if (entitlement === null || remaining === null || entitlement <= 0) return null;
  return {
    entitlement,
    remaining,
    percent_remaining: (remaining / entitlement) * 100,
    quota_id: quotaId
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildShutdownBreakdown(modelName, entry) {
  const metadata = getCopilotModelMetadata(modelName);
  // Copilot telemetry: inputTokens is INCLUSIVE (total prompt = non-cached + cached)
  // for Claude models. We pass it as-is to estimateObservedUsageCost which handles
  // the subtraction and cache write estimation internally for Claude models.
  const rawInputTokens = Number(entry?.usage?.inputTokens ?? 0);
  const cacheReadTokens = Number(entry?.usage?.cacheReadTokens ?? 0);
  const cacheWriteTokens = Number(entry?.usage?.cacheWriteTokens ?? 0);
  const outputTokens = Number(entry?.usage?.outputTokens ?? 0);

  const observed = estimateObservedUsageCost(modelName, {
    inputTokens: rawInputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    requestsCount: Number(entry?.requests?.count ?? 0)
  });

  // For Claude models, inputTokens is inclusive of cache — show non-cached for display.
  // estimateObservedUsageCost may also split non-cached into pure input + estimated cache write.
  const isClaudeModel = String(modelName).toLowerCase().includes("claude");
  const nonCachedInput = isClaudeModel
    ? Math.max(0, rawInputTokens - cacheReadTokens - cacheWriteTokens)
    : rawInputTokens;

  // Use estimated values from pricing if cache write estimation was applied
  const displayInputTokens = observed.cacheWriteEstimated === true
    ? (observed.estimatedPureInputTokens ?? nonCachedInput)
    : nonCachedInput;
  const displayCacheWriteTokens = observed.cacheWriteEstimated === true
    ? (observed.estimatedCacheWriteTokens ?? 0)
    : cacheWriteTokens;

  return {
    modelName: metadata.canonicalModel,
    displayName: metadata.displayName,
    activity: Number(entry?.requests?.count ?? 0),
    premiumRequestEstimate: Number(entry?.requests?.cost ?? 0),
    inputTokens: displayInputTokens,
    cachedInputTokens: cacheReadTokens,
    cacheReadTokens,
    cacheWriteTokens: displayCacheWriteTokens,
    outputTokens,
    // totalTokens: for Claude, rawInputTokens is inclusive so just + output.
    // for others, add cache tokens back to keep parity.
    totalTokens: isClaudeModel
      ? rawInputTokens + outputTokens
      : rawInputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    totalCost: observed.totalCost,
    multiplier: metadata.multiplier,
    knownPrice: observed.knownPrice,
    pricing: observed.pricing
  };
}

function mergeBreakdown(modelMap, breakdown) {
  const current = modelMap.get(breakdown.modelName) ?? {
    modelName: breakdown.modelName,
    displayName: breakdown.displayName,
    activity: 0,
    premiumRequestEstimate: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    multiplier: breakdown.multiplier ?? null,
    knownPrice: false,
    pricing: {
      canonicalModel: breakdown.pricing?.canonicalModel ?? breakdown.modelName,
      knownPrice: false,
      components: {}
    }
  };

  current.activity += breakdown.activity ?? 0;
  current.premiumRequestEstimate += breakdown.premiumRequestEstimate ?? 0;
  current.inputTokens += breakdown.inputTokens ?? 0;
  current.cachedInputTokens += breakdown.cachedInputTokens ?? 0;
  current.cacheReadTokens += breakdown.cacheReadTokens ?? 0;
  current.cacheWriteTokens += breakdown.cacheWriteTokens ?? 0;
  current.outputTokens += breakdown.outputTokens ?? 0;
  current.totalTokens += breakdown.totalTokens ?? 0;
  current.totalCost += breakdown.totalCost ?? 0;
  current.knownPrice = current.knownPrice || breakdown.knownPrice;
  current.multiplier = current.multiplier ?? breakdown.multiplier ?? null;

  if (breakdown.pricing?.components) {
    const components = { ...(current.pricing?.components ?? {}) };
    for (const [key, value] of Object.entries(breakdown.pricing.components)) {
      components[key] = (components[key] ?? 0) + (value ?? 0);
    }
    current.pricing = {
      canonicalModel: breakdown.pricing.canonicalModel ?? current.modelName,
      knownPrice: current.knownPrice,
      components
    };
  }

  modelMap.set(breakdown.modelName, current);
}
