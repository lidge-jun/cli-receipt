import fs from "node:fs/promises";
import path from "node:path";
import { readJsonLines, walkFiles } from "../core/fs.js";
import { expandHome, slugToPathHint } from "../core/paths.js";
import { displayClaudeModel, estimateClaudePricing } from "../core/pricing.js";

export async function collectClaudeSessions(options = {}) {
  const root = expandHome(options.root || "~/.claude");
  const projectsRoot = path.join(root, "projects");
  const sessions = [];

  for await (const filePath of walkFiles(projectsRoot, {
    filter: (candidate) => candidate.endsWith(".jsonl")
  })) {
    const session = await parseClaudeSession(filePath);
    if (session) {
      sessions.push(session);
    }
  }

  return sessions;
}

async function parseClaudeSession(filePath) {
  const sessionId = path.basename(filePath, ".jsonl");
  const projectSlug = path.basename(path.dirname(filePath));
  const stats = {
    provider: "claude",
    sessionId,
    project: slugToPathHint(projectSlug),
    cwd: null,
    startedAt: null,
    updatedAt: null,
    messages: 0,
    activity: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    webSearchRequests: 0,
    modelBreakdowns: []
  };
  const modelMap = new Map();
  const seenUsageKeys = new Set();

  await readJsonLines(filePath, (entry) => {
    const timestamp = entry.timestamp ?? entry.message?.timestamp ?? null;
    if (timestamp) {
      if (!stats.startedAt || timestamp < stats.startedAt) stats.startedAt = timestamp;
      if (!stats.updatedAt || timestamp > stats.updatedAt) stats.updatedAt = timestamp;
    }

    if (entry.cwd && !stats.cwd) {
      stats.cwd = entry.cwd;
    }

    if (entry.type === "user" || entry.type === "assistant") {
      stats.messages += 1;
      stats.activity += 1;
    }

    if (entry.type !== "assistant") return;

    const usage = entry.message?.usage;
    const model = entry.message?.model;
    if (!usage || !model || model === "<synthetic>") return;

    const messageId = entry.message?.id;
    const requestId = entry.requestId;
    if (messageId && requestId) {
      const usageKey = `${messageId}:${requestId}`;
      if (seenUsageKeys.has(usageKey)) {
        return;
      }
      seenUsageKeys.add(usageKey);
    }

    const inputTokens = Number(usage.input_tokens ?? 0);
    const outputTokens = Number(usage.output_tokens ?? 0);
    const cacheReadTokens = Number(usage.cache_read_input_tokens ?? 0);
    const cacheCreationTokens = Number(usage.cache_creation_input_tokens ?? 0);
    const webSearchRequests = Number(usage.server_tool_use?.web_search_requests ?? 0);

    stats.inputTokens += inputTokens;
    stats.cachedInputTokens += cacheReadTokens + cacheCreationTokens;
    stats.outputTokens += outputTokens;
    stats.totalTokens += inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
    stats.webSearchRequests += webSearchRequests;

    const current = modelMap.get(model) ?? {
      modelName: model,
      displayName: displayClaudeModel(model),
      activity: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      webSearchRequests: 0,
      pricing: null,
      totalCost: 0,
      knownPrice: false
    };
    current.activity += 1;
    current.inputTokens += inputTokens;
    current.outputTokens += outputTokens;
    current.cacheCreationTokens += cacheCreationTokens;
    current.cacheReadTokens += cacheReadTokens;
    current.webSearchRequests += webSearchRequests;
    modelMap.set(model, current);
  });

  if (!stats.updatedAt) {
    const fileStat = await fs.stat(filePath);
    stats.startedAt = fileStat.mtime.toISOString();
    stats.updatedAt = stats.startedAt;
  }

  stats.modelBreakdowns = Array.from(modelMap.values())
    .map((breakdown) => {
      const pricing = estimateClaudePricing(breakdown.modelName, breakdown);
      return {
        ...breakdown,
        pricing,
        totalCost: pricing.totalCost,
        knownPrice: pricing.knownPrice
      };
    })
    .sort((left, right) => {
      if ((right.totalCost ?? 0) !== (left.totalCost ?? 0)) {
        return (right.totalCost ?? 0) - (left.totalCost ?? 0);
      }
      return (right.inputTokens + right.outputTokens) - (left.inputTokens + left.outputTokens);
    });
  stats.totalCost = stats.modelBreakdowns.reduce(
    (sum, item) => sum + (item.totalCost ?? 0),
    0
  );

  return stats;
}
