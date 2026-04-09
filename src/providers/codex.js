import fs from "node:fs/promises";
import path from "node:path";
import { readJsonLines, walkFiles } from "../core/fs.js";
import { expandHome } from "../core/paths.js";
import { displayOpenAIModel, estimateOpenAIPricing } from "../core/pricing.js";

export async function collectCodexSessions(options = {}) {
  const root = expandHome(options.root || "~/.codex");
  const sessionsRoot = path.join(root, "sessions");
  const names = await loadThreadNames(path.join(root, "session_index.jsonl"));
  const sessions = [];

  for await (const filePath of walkFiles(sessionsRoot, {
    filter: (candidate) => candidate.endsWith(".jsonl")
  })) {
    const records = await parseCodexSession(filePath, names);
    if (records.length > 0) {
      sessions.push(...records);
    }
  }

  return sessions;
}

async function loadThreadNames(indexPath) {
  const names = new Map();
  try {
    await readJsonLines(indexPath, (entry) => {
      if (entry.id && entry.thread_name) {
        names.set(entry.id, entry.thread_name);
      }
    });
  } catch {
    return names;
  }
  return names;
}

async function parseCodexSession(filePath, threadNames) {
  const sessionIdMatch = filePath.match(/([0-9a-f]{8,}-[0-9a-f-]+)\.jsonl$/i);
  const sessionId = sessionIdMatch ? sessionIdMatch[1] : path.basename(filePath, ".jsonl");
  const stats = {
    provider: "codex",
    sessionId,
    project: threadNames.get(sessionId) || null,
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
    modelName: null
  };
  const daySummaries = new Map();
  const dayModelBuckets = new Map();
  let previousTotals = null;

  await readJsonLines(filePath, (entry) => {
    const timestamp = entry.timestamp ?? entry.payload?.timestamp ?? null;
    if (timestamp) {
      if (!stats.startedAt || timestamp < stats.startedAt) stats.startedAt = timestamp;
      if (!stats.updatedAt || timestamp > stats.updatedAt) stats.updatedAt = timestamp;
    }

    if (entry.type === "session_meta") {
      stats.cwd = entry.payload?.cwd ?? stats.cwd;
      stats.startedAt = entry.payload?.timestamp ?? stats.startedAt;
      stats.project = threadNames.get(entry.payload?.id) || stats.project;
      return;
    }

    if (entry.type === "turn_context") {
      stats.modelName = entry.payload?.model ?? stats.modelName;
      return;
    }

    if (entry.type === "response_item" && entry.payload?.type === "message") {
      const role = entry.payload.role;
      if (role === "user" || role === "assistant") {
        stats.messages += 1;
        stats.activity += 1;
        const daySummary = getDaySummary(daySummaries, timestamp);
        daySummary.messages += 1;
        daySummary.activity += 1;
      }
      return;
    }

    if (entry.type === "event_msg" && entry.payload?.type === "user_message") {
      stats.messages += 1;
      stats.activity += 1;
      const daySummary = getDaySummary(daySummaries, timestamp);
      daySummary.messages += 1;
      daySummary.activity += 1;
      return;
    }

    if (entry.type === "event_msg" && entry.payload?.type === "token_count") {
      const daySummary = getDaySummary(daySummaries, timestamp);
      const info = entry.payload.info ?? {};
      const totalUsage = info.total_token_usage ?? null;
      const lastUsage = info.last_token_usage ?? null;
      const modelName =
        info.model ??
        info.model_name ??
        entry.payload.model ??
        entry.model ??
        stats.modelName ??
        "gpt-5.4";

      let deltaInput = 0;
      let deltaCachedInput = 0;
      let deltaOutput = 0;

      if (totalUsage) {
        const inputTokens = Number(totalUsage.input_tokens ?? 0);
        const cachedInputTokens = Number(totalUsage.cached_input_tokens ?? totalUsage.cache_read_input_tokens ?? 0);
        const outputTokens = Number(totalUsage.output_tokens ?? 0);

        deltaInput = Math.max(0, inputTokens - Number(previousTotals?.inputTokens ?? 0));
        deltaCachedInput = Math.max(0, cachedInputTokens - Number(previousTotals?.cachedInputTokens ?? 0));
        deltaOutput = Math.max(0, outputTokens - Number(previousTotals?.outputTokens ?? 0));

        previousTotals = {
          inputTokens,
          cachedInputTokens,
          outputTokens
        };
      } else if (lastUsage) {
        deltaInput = Math.max(0, Number(lastUsage.input_tokens ?? 0));
        deltaCachedInput = Math.max(0, Number(lastUsage.cached_input_tokens ?? lastUsage.cache_read_input_tokens ?? 0));
        deltaOutput = Math.max(0, Number(lastUsage.output_tokens ?? 0));
      } else {
        return;
      }

      if (deltaInput === 0 && deltaCachedInput === 0 && deltaOutput === 0) {
        return;
      }

      const clampedCachedInput = Math.min(deltaCachedInput, deltaInput);
      const pricing = estimateOpenAIPricing(modelName, {
        inputTokens: deltaInput,
        cachedInputTokens: clampedCachedInput,
        outputTokens: deltaOutput,
        longContext: deltaInput > 272_000
      });
      const bucket = getDayModelBucket(dayModelBuckets, timestamp, modelName);
      bucket.inputTokens += deltaInput;
      bucket.cachedInputTokens += clampedCachedInput;
      bucket.outputTokens += deltaOutput;
      bucket.totalTokens += deltaInput + deltaOutput;
      bucket.totalCost += pricing.totalCost;
      bucket.knownPrice = bucket.knownPrice || pricing.knownPrice;
      bucket.pricing.canonicalModel = pricing.canonicalModel;
      bucket.pricing.knownPrice = bucket.knownPrice;
      for (const [key, value] of Object.entries(pricing.components ?? {})) {
        bucket.pricing.components[key] = (bucket.pricing.components[key] ?? 0) + (value ?? 0);
      }
      daySummary.tokenEvents += 1;
    }
  });

  if (!stats.updatedAt) {
    const fileStat = await fs.stat(filePath);
    stats.startedAt = fileStat.mtime.toISOString();
    stats.updatedAt = stats.startedAt;
  }

  if (!stats.project && stats.cwd) {
    stats.project = stats.cwd;
  }

  const records = [];
  const orderedDays = Array.from(daySummaries.keys()).sort();

  orderedDays.forEach((day, index) => {
    const summary = daySummaries.get(day);
    records.push({
      provider: "codex",
      sessionId: `${sessionId}:summary:${day}`,
      project: stats.project,
      cwd: stats.cwd,
      startedAt: index === 0 ? stats.startedAt : isoDayEnd(day),
      updatedAt: isoDayEnd(day),
      messages: summary.messages,
      activity: summary.activity,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      sessionWeight: index === 0 ? 1 : 0,
      modelBreakdowns: []
    });
  });

  for (const bucket of Array.from(dayModelBuckets.values())) {
    records.push({
      provider: "codex",
      sessionId: `${sessionId}:model:${bucket.day}:${bucket.modelName}`,
      project: stats.project,
      cwd: stats.cwd,
      startedAt: isoDayEnd(bucket.day),
      updatedAt: isoDayEnd(bucket.day),
      messages: 0,
      activity: 0,
      inputTokens: bucket.inputTokens,
      cachedInputTokens: bucket.cachedInputTokens,
      outputTokens: bucket.outputTokens,
      totalTokens: bucket.totalTokens,
      totalCost: bucket.totalCost,
      sessionWeight: 0,
      modelBreakdowns: [
        {
          modelName: bucket.modelName,
          displayName: displayOpenAIModel(bucket.modelName),
          activity: bucket.activity,
          inputTokens: bucket.inputTokens,
          cachedInputTokens: bucket.cachedInputTokens,
          outputTokens: bucket.outputTokens,
          totalTokens: bucket.totalTokens,
          totalCost: bucket.totalCost,
          knownPrice: bucket.knownPrice,
          pricing: bucket.pricing
        }
      ]
    });
  }

  return records;
}

function getDaySummary(daySummaries, timestamp) {
  const day = String(timestamp || "").slice(0, 10);
  const summary = daySummaries.get(day) ?? {
    day,
    messages: 0,
    activity: 0,
    tokenEvents: 0
  };
  daySummaries.set(day, summary);
  return summary;
}

function getDayModelBucket(dayModelBuckets, timestamp, modelName) {
  const day = String(timestamp || "").slice(0, 10);
  const key = `${day}:${modelName}`;
  const bucket = dayModelBuckets.get(key) ?? {
    day,
    modelName,
    activity: 1,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    knownPrice: false,
    pricing: {
      canonicalModel: modelName,
      knownPrice: false,
      components: {}
    }
  };
  if (dayModelBuckets.has(key)) {
    bucket.activity += 1;
  }
  dayModelBuckets.set(key, bucket);
  return bucket;
}

function isoDayEnd(day) {
  return `${day}T23:59:59.999Z`;
}
