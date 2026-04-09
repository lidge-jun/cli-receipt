// Claude pricing references:
// - https://claude.com/pricing
// - https://platform.claude.com/docs/en/about-claude/models/overview
//
// OpenAI pricing references:
// - https://developers.openai.com/api/docs/models/gpt-5.4
// - https://developers.openai.com/api/docs/models/compare
//
// Rates are USD per million tokens unless otherwise noted.

const BASE_RATES = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheCreation: 1.25, cacheRead: 0.1 },
  "claude-opus-4-5": { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 },
  "claude-opus-4-6": { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5, fastMultiplier: 6 },
  "claude-sonnet-4-5": {
    input: 3,
    output: 15,
    cacheCreation: 3.75,
    cacheRead: 0.3,
    thresholdTokens: 200_000,
    inputAboveThreshold: 6,
    outputAboveThreshold: 22.5,
    cacheCreationAboveThreshold: 7.5,
    cacheReadAboveThreshold: 0.6
  },
  "claude-opus-4-1": { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 },
  "claude-opus-4": { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 },
  "claude-sonnet-4": {
    input: 3,
    output: 15,
    cacheCreation: 3.75,
    cacheRead: 0.3,
    thresholdTokens: 200_000,
    inputAboveThreshold: 6,
    outputAboveThreshold: 22.5,
    cacheCreationAboveThreshold: 7.5,
    cacheReadAboveThreshold: 0.6
  },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  "claude-sonnet-3-7": { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  "claude-sonnet-3-5": { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  "claude-opus-3": { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 },
  "claude-haiku-3-5": { input: 0.8, output: 4, cacheCreation: 1, cacheRead: 0.08 },
  "claude-haiku-3": { input: 0.25, output: 1.25, cacheCreation: 0.3, cacheRead: 0.03 }
};

const ALIASES = new Map([
  ["opus", "claude-opus-4-6"],
  ["sonnet", "claude-sonnet-4-6"],
  ["haiku", "claude-haiku-4-5"],
  ["claude-opus-4-6-20260205", "claude-opus-4-6"],
  ["claude-sonnet-4-6-20260115", "claude-sonnet-4-6"],
  ["claude-haiku-4-5-20251001", "claude-haiku-4-5"],
  ["claude-opus-4-5-20251101", "claude-opus-4-5"]
]);

const DISPLAY_NAMES = {
  "claude-opus-4-6": "Claude Opus 4.6",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "claude-opus-4-5": "Claude Opus 4.5",
  "claude-sonnet-4-5": "Claude Sonnet 4.5",
  "claude-opus-4-1": "Claude Opus 4.1",
  "claude-opus-4": "Claude Opus 4",
  "claude-sonnet-4": "Claude Sonnet 4",
  "claude-sonnet-3-7": "Claude Sonnet 3.7",
  "claude-sonnet-3-5": "Claude 3.5 Sonnet",
  "claude-opus-3": "Claude 3 Opus",
  "claude-haiku-3-5": "Claude 3.5 Haiku",
  "claude-haiku-3": "Claude 3 Haiku"
};

export const WEB_SEARCH_COST_PER_REQUEST = 10 / 1000;

const OPENAI_BASE_RATES = {
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15, longContextThreshold: 272_000, longContextInputMultiplier: 2, longContextOutputMultiplier: 1.5, priorityMultiplier: 2 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5, priorityMultiplier: 2 },
  "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25, priorityMultiplier: 2 },
  "gpt-5.4-pro": { input: 30, cachedInput: null, output: 180, longContextThreshold: 272_000, longContextInputMultiplier: 2, longContextOutputMultiplier: 1.5, priorityMultiplier: 2 },
  "gpt-5.2": { input: 1.75, cachedInput: 0.175, output: 14, priorityMultiplier: 2 },
  "gpt-5.2-pro": { input: 21, cachedInput: null, output: 168, priorityMultiplier: 2 },
  "gpt-5.1": { input: 1.25, cachedInput: 0.125, output: 10, priorityMultiplier: 2 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10, priorityMultiplier: 2 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2, priorityMultiplier: 2 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4, priorityMultiplier: 2 },
  "gpt-5-pro": { input: 15, cachedInput: null, output: 120, priorityMultiplier: 2 },
  "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8, priorityMultiplier: 2 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6, priorityMultiplier: 2 },
  "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4, priorityMultiplier: 2 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10, priorityMultiplier: 1.7 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6, priorityMultiplier: 1.67 }
};

const OPENAI_ALIASES = new Map([
  ["gpt-5-codex", "gpt-5"],
  ["gpt-5.1-codex", "gpt-5.1"],
  ["gpt-5.1-codex-max", "gpt-5.1"],
  ["gpt-5.1-codex-mini", "gpt-5-mini"],
  ["gpt-5.2-codex", "gpt-5.2"],
  ["gpt-5.3-codex", "gpt-5.2"],
  ["gpt-5.3-codex-spark", "gpt-5.2"],
  ["goldeneye", "gpt-5.1-codex"],
  ["raptor-mini", "gpt-5-mini"],
  ["raptor mini", "gpt-5-mini"]
]);

const OPENAI_DISPLAY_NAMES = {
  "gpt-5.4": "GPT-5.4",
  "gpt-5.4-mini": "GPT-5.4 mini",
  "gpt-5.4-nano": "GPT-5.4 nano",
  "gpt-5.4-pro": "GPT-5.4 pro",
  "gpt-5.2": "GPT-5.2",
  "gpt-5.2-pro": "GPT-5.2 pro",
  "gpt-5.1": "GPT-5.1",
  "gpt-5": "GPT-5",
  "gpt-5-mini": "GPT-5 mini",
  "gpt-5-nano": "GPT-5 nano",
  "gpt-5-pro": "GPT-5 pro",
  "gpt-4.1": "GPT-4.1",
  "gpt-4.1-mini": "GPT-4.1 mini",
  "gpt-4.1-nano": "GPT-4.1 nano",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o mini",
  "gpt-5-codex": "GPT-5 Codex",
  "gpt-5.1-codex": "GPT-5.1 Codex",
  "gpt-5.1-codex-mini": "GPT-5.1 Codex Mini",
  "gpt-5.1-codex-max": "GPT-5.1 Codex Max",
  "gpt-5.2-codex": "GPT-5.2 Codex",
  "gpt-5.3-codex": "GPT-5.3 Codex",
  "gpt-5.3-codex-spark": "GPT-5.3 Codex Spark",
  "goldeneye": "Goldeneye",
  "raptor-mini": "Raptor mini"
};

const COPILOT_MODEL_METADATA = {
  "claude-haiku-4.5": { displayName: "Claude Haiku 4.5", multiplier: 0.33 },
  "claude-opus-4.5": { displayName: "Claude Opus 4.5", multiplier: 3 },
  "claude-opus-4.6": { displayName: "Claude Opus 4.6", multiplier: 3 },
  "claude-opus-4.6-fast": { displayName: "Claude Opus 4.6 (fast mode)", multiplier: 30 },
  "claude-sonnet-4": { displayName: "Claude Sonnet 4", multiplier: 1 },
  "claude-sonnet-4.5": { displayName: "Claude Sonnet 4.5", multiplier: 1 },
  "claude-sonnet-4.6": { displayName: "Claude Sonnet 4.6", multiplier: 1 },
  "gemini-2.5-pro": { displayName: "Gemini 2.5 Pro", multiplier: 1 },
  "gemini-3-flash": { displayName: "Gemini 3 Flash", multiplier: 0.33 },
  "gemini-3-flash-preview": { displayName: "Gemini 3 Flash (preview)", multiplier: 0.33 },
  "gemini-3-pro": { displayName: "Gemini 3 Pro", multiplier: 1 },
  "gemini-3-pro-preview": { displayName: "Gemini 3 Pro (preview)", multiplier: 1 },
  "gemini-3.1-pro": { displayName: "Gemini 3.1 Pro", multiplier: 1 },
  "gemini-3.1-pro-preview": { displayName: "Gemini 3.1 Pro (preview)", multiplier: 1 },
  "gpt-4.1": { displayName: "GPT-4.1", multiplier: 0 },
  "gpt-4o": { displayName: "GPT-4o", multiplier: 0 },
  "gpt-5-mini": { displayName: "GPT-5 mini", multiplier: 0 },
  "gpt-5.1": { displayName: "GPT-5.1", multiplier: 1 },
  "gpt-5.1-codex": { displayName: "GPT-5.1-Codex", multiplier: 1 },
  "gpt-5.1-codex-mini": { displayName: "GPT-5.1-Codex-Mini", multiplier: 0.33 },
  "gpt-5.1-codex-max": { displayName: "GPT-5.1-Codex-Max", multiplier: 1 },
  "gpt-5.2": { displayName: "GPT-5.2", multiplier: 1 },
  "gpt-5.2-codex": { displayName: "GPT-5.2-Codex", multiplier: 1 },
  "gpt-5.3-codex": { displayName: "GPT-5.3-Codex", multiplier: 1 },
  "gpt-5.4": { displayName: "GPT-5.4", multiplier: 1 },
  "gpt-5.4-mini": { displayName: "GPT-5.4 mini", multiplier: 0.33 },
  "grok-code-fast-1": { displayName: "Grok Code Fast 1", multiplier: 0.25 },
  "grok code fast 1": { displayName: "Grok Code Fast 1", multiplier: 0.25 },
  "raptor mini": { displayName: "Raptor mini", multiplier: 0 },
  "goldeneye": { displayName: "Goldeneye", multiplier: null }
};

const GEMINI_WASTE_RATES = {
  "gemini-3.1-pro-preview": { input: 2, inputAboveThreshold: 4, thresholdTokens: 200_000 },
  "gemini-3-pro-preview": { input: 2, inputAboveThreshold: 4, thresholdTokens: 200_000 },
  "gemini-3-flash-preview": { input: 0.5 },
  "gemini-3.1-flash-lite-preview": { input: 0.25 },
  "gemini-2.5-pro": { input: 1.25, inputAboveThreshold: 2.5, thresholdTokens: 200_000 },
  "gemini-2.5-flash": { input: 0.3 },
  "gemini-2.5-flash-lite": { input: 0.1 }
};

const GEMINI_ALIASES = new Map([
  ["gemini-3-flash", "gemini-3-flash-preview"],
  ["gemini-3-pro", "gemini-3-pro-preview"],
  ["gemini-3.1-pro", "gemini-3.1-pro-preview"]
]);

export function canonicalizeClaudeModel(model) {
  if (!model) return "unknown";
  const trimmed = String(model).trim().replace(/^anthropic\./, "");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized = trimmed;
  if (lastDot !== -1) {
    const tail = trimmed.slice(lastDot + 1);
    if (tail.startsWith("claude-")) {
      normalized = tail;
    }
  }
  normalized = normalized
    .replace(/-fast$/, "")
    .replace(/(claude-[a-z0-9-]+-\d)\.(\d+)/, "$1-$2");
  const unversioned = normalized.replace(/-v\d+:\d+$/, "");
  if (ALIASES.has(unversioned)) return ALIASES.get(unversioned);
  const stripped = unversioned.replace(/-\d{8}$/, "");
  if (ALIASES.has(stripped)) return ALIASES.get(stripped);
  return stripped;
}

export function displayClaudeModel(model) {
  const canonical = canonicalizeClaudeModel(model);
  return DISPLAY_NAMES[canonical] || model;
}

export function estimateClaudePricing(model, usage) {
  const canonicalModel = canonicalizeClaudeModel(model);
  const base = BASE_RATES[canonicalModel];
  if (!base) {
    return {
      canonicalModel,
      knownPrice: false,
      components: {
        inputCost: 0,
        outputCost: 0,
        cacheCreationCost: 0,
        cacheReadCost: 0,
        webSearchCost: 0
      },
      totalCost: 0
    };
  }

  const cacheCreationTokens = Number(
    usage.cacheCreationTokens ??
      Number(usage.cacheWrite5mTokens ?? 0) + Number(usage.cacheWrite1hTokens ?? 0)
  );

  const isFastMode = String(model).endsWith("-fast") || usage.fastMode === true;
  const fastMultiplier = isFastMode ? (base.fastMultiplier ?? 6) : 1;

  const inputCost = mtokTieredCost(
    usage.inputTokens ?? 0,
    base.input * fastMultiplier,
    base.inputAboveThreshold ? base.inputAboveThreshold * fastMultiplier : undefined,
    base.thresholdTokens
  );
  const outputCost = mtokTieredCost(
    usage.outputTokens ?? 0,
    base.output * fastMultiplier,
    base.outputAboveThreshold ? base.outputAboveThreshold * fastMultiplier : undefined,
    base.thresholdTokens
  );
  const cacheCreationCost = mtokTieredCost(
    cacheCreationTokens,
    base.cacheCreation * fastMultiplier,
    base.cacheCreationAboveThreshold ? base.cacheCreationAboveThreshold * fastMultiplier : undefined,
    base.thresholdTokens
  );
  const cacheReadCost = mtokTieredCost(
    usage.cacheReadTokens ?? 0,
    base.cacheRead * fastMultiplier,
    base.cacheReadAboveThreshold ? base.cacheReadAboveThreshold * fastMultiplier : undefined,
    base.thresholdTokens
  );
  const webSearchCost = Number(usage.webSearchRequests ?? 0) * WEB_SEARCH_COST_PER_REQUEST;

  return {
    canonicalModel,
    knownPrice: true,
    components: {
      inputCost,
      outputCost,
      cacheCreationCost,
      cacheReadCost,
      webSearchCost
    },
    modifiers: {
      fastModeApplied: isFastMode,
      fastMultiplier: fastMultiplier
    },
    totalCost: inputCost + outputCost + cacheCreationCost + cacheReadCost + webSearchCost
  };
}

export function canonicalizeOpenAIModel(model) {
  if (!model) return "unknown";
  const trimmed = String(model).trim().replace(/^openai\//, "");
  const fastStripped = trimmed.replace(/-fast$/, "");
  if (OPENAI_BASE_RATES[fastStripped]) return fastStripped;
  if (OPENAI_ALIASES.has(fastStripped)) return OPENAI_ALIASES.get(fastStripped);
  const datedSuffix = fastStripped.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (OPENAI_BASE_RATES[datedSuffix]) return datedSuffix;
  if (OPENAI_ALIASES.has(datedSuffix)) return OPENAI_ALIASES.get(datedSuffix);
  if (fastStripped.startsWith("gpt-5.4-pro")) return "gpt-5.4-pro";
  if (fastStripped.startsWith("gpt-5.4-mini")) return "gpt-5.4-mini";
  if (fastStripped.startsWith("gpt-5.4-nano")) return "gpt-5.4-nano";
  if (fastStripped.startsWith("gpt-5.4")) return "gpt-5.4";
  if (fastStripped.startsWith("gpt-5.2-pro")) return "gpt-5.2-pro";
  if (fastStripped.startsWith("gpt-5.2-codex")) return "gpt-5.2";
  if (fastStripped.startsWith("gpt-5.2")) return "gpt-5.2";
  if (fastStripped.startsWith("gpt-5.1-codex-max")) return "gpt-5.1";
  if (fastStripped.startsWith("gpt-5.1-codex-mini")) return "gpt-5-mini";
  if (fastStripped.startsWith("gpt-5.1-codex")) return "gpt-5.1";
  if (fastStripped.startsWith("gpt-5.1")) return "gpt-5.1";
  if (fastStripped.startsWith("gpt-5-codex")) return "gpt-5";
  if (fastStripped.startsWith("gpt-5-pro")) return "gpt-5-pro";
  if (fastStripped.startsWith("gpt-5-mini")) return "gpt-5-mini";
  if (fastStripped.startsWith("gpt-5-nano")) return "gpt-5-nano";
  if (fastStripped.startsWith("gpt-5")) return "gpt-5";
  if (fastStripped.startsWith("gpt-4.1-mini")) return "gpt-4.1-mini";
  if (fastStripped.startsWith("gpt-4.1-nano")) return "gpt-4.1-nano";
  if (fastStripped.startsWith("gpt-4.1")) return "gpt-4.1";
  if (fastStripped.startsWith("gpt-4o-mini")) return "gpt-4o-mini";
  if (fastStripped.startsWith("gpt-4o")) return "gpt-4o";
  return fastStripped;
}

export function displayOpenAIModel(model) {
  const canonical = canonicalizeOpenAIModel(model);
  return OPENAI_DISPLAY_NAMES[canonical] || model;
}

export function estimateOpenAIPricing(model, usage) {
  const canonicalModel = canonicalizeOpenAIModel(model);
  const base = OPENAI_BASE_RATES[canonicalModel];
  if (!base) {
    return {
      canonicalModel,
      knownPrice: false,
      components: {
        inputCost: 0,
        cachedInputCost: 0,
        outputCost: 0
      },
      totalCost: 0
    };
  }

  const totalInputTokens = Number(usage.inputTokens ?? 0);
  const cachedInputTokens = Math.min(
    Math.max(0, Number(usage.cachedInputTokens ?? 0)),
    Math.max(0, totalInputTokens)
  );
  const nonCachedInputTokens = Math.max(0, totalInputTokens - cachedInputTokens);
  const longContext = Boolean(usage.longContext);
  const priority = usage.serviceTier === "priority" || String(model).endsWith("-fast") || usage.fastMode === true;
  const supportsLongContext = Boolean(base.longContextThreshold);
  const applyLongContext = supportsLongContext && longContext;
  const applyPriority = priority;
  const inputRate = base.input * (applyPriority ? base.priorityMultiplier ?? 1 : 1) * (applyLongContext ? base.longContextInputMultiplier ?? 1 : 1);
  const outputRate = base.output * (applyPriority ? base.priorityMultiplier ?? 1 : 1) * (applyLongContext ? base.longContextOutputMultiplier ?? 1 : 1);
  const cachedRateBase = base.cachedInput ?? base.input;
  const cachedInputRate = cachedRateBase * (applyPriority ? base.priorityMultiplier ?? 1 : 1);
  const inputCost = mtokCost(nonCachedInputTokens, inputRate);
  const cachedInputCost = mtokCost(cachedInputTokens, cachedInputRate);
  const outputCost = mtokCost(usage.outputTokens ?? 0, outputRate);

  return {
    canonicalModel,
    knownPrice: true,
    components: {
      inputCost,
      cachedInputCost,
      outputCost
    },
    modifiers: {
      serviceTier: usage.serviceTier || "default",
      priorityMultiplier: applyPriority ? base.priorityMultiplier ?? 1 : 1,
      longContextApplied: applyLongContext,
      longContextThreshold: base.longContextThreshold ?? null,
      longContextInputMultiplier: applyLongContext ? base.longContextInputMultiplier ?? 1 : 1,
      longContextOutputMultiplier: applyLongContext ? base.longContextOutputMultiplier ?? 1 : 1
    },
    totalCost: inputCost + cachedInputCost + outputCost
  };
}

export function canonicalizeCopilotModel(model) {
  if (!model) return "unknown";
  const normalized = String(model).trim().toLowerCase().replace(/_/g, "-");
  if (COPILOT_MODEL_METADATA[normalized]) return normalized;
  if (normalized === "claude-opus-4.6-fast") return normalized;
  if (normalized === "grok-code-fast-1") return normalized;
  return normalized;
}

export function getCopilotModelMetadata(model) {
  const canonicalModel = canonicalizeCopilotModel(model);
  const metadata = COPILOT_MODEL_METADATA[canonicalModel] ?? {
    displayName: model,
    multiplier: null
  };
  return {
    canonicalModel,
    displayName: metadata.displayName,
    multiplier: metadata.multiplier
  };
}

export function estimateWasteCostFromTotalTokens(model, totalTokens) {
  const normalizedTokens = Math.max(0, Number(totalTokens ?? 0));
  const rawModel = String(model ?? "").trim();
  const claudeModel = canonicalizeClaudeModel(rawModel);
  if (BASE_RATES[claudeModel]) {
    const base = BASE_RATES[claudeModel];
    const fastMultiplier = base.fastMultiplier && rawModel.endsWith("-fast") ? base.fastMultiplier : 1;

    // Split totalTokens using Claude native agentic coding ratios.
    // Copilot inclusive: totalTokens ≈ inputTokens(inclusive) + outputTokens
    // Ratios derived from Claude native Opus 4.6 data:
    //   output ~3%, inputInclusive ~97%
    //   within inputInclusive: cacheRead ~90%, nonCached ~10%
    //   within nonCached: cacheWrite ~98.6%, pureInput ~1.4%
    const OUTPUT_RATIO = 0.03;
    const CACHE_READ_RATIO = 0.87;  // 0.97 * 0.90
    const CACHE_WRITE_RATIO = 0.0959; // 0.97 * 0.10 * 0.986
    const PURE_INPUT_RATIO = 0.0041;  // remainder

    const estOutput = Math.round(normalizedTokens * OUTPUT_RATIO);
    const estCacheRead = Math.round(normalizedTokens * CACHE_READ_RATIO);
    const estCacheWrite = Math.round(normalizedTokens * CACHE_WRITE_RATIO);
    const estPureInput = Math.max(0, normalizedTokens - estOutput - estCacheRead - estCacheWrite);

    const inputCost = mtokTieredCost(estPureInput, base.input * fastMultiplier, base.inputAboveThreshold ? base.inputAboveThreshold * fastMultiplier : undefined, base.thresholdTokens);
    const outputCost = mtokCost(estOutput, base.output * fastMultiplier);
    const cacheReadCost = mtokCost(estCacheRead, base.cacheRead * fastMultiplier);
    const cacheWriteCost = mtokCost(estCacheWrite, base.cacheCreation * fastMultiplier);

    return {
      providerFamily: "claude",
      canonicalModel: claudeModel,
      knownPrice: true,
      cost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
      basis: "ratio-based waste estimate",
      estimatedBreakdown: {
        inputTokens: estPureInput,
        outputTokens: estOutput,
        cacheReadTokens: estCacheRead,
        cacheWriteTokens: estCacheWrite
      },
      components: {
        inputCost,
        outputCost,
        cacheReadCost,
        cacheCreationCost: cacheWriteCost
      }
    };
  }

  const openAIModel = canonicalizeOpenAIModel(rawModel);
  if (OPENAI_BASE_RATES[openAIModel]) {
    const pricing = estimateOpenAIPricing(rawModel, {
      inputTokens: normalizedTokens,
      cachedInputTokens: 0,
      outputTokens: 0,
      longContext: normalizedTokens > Number(OPENAI_BASE_RATES[openAIModel].longContextThreshold ?? Number.MAX_SAFE_INTEGER)
    });
    return {
      providerFamily: "openai",
      canonicalModel: openAIModel,
      knownPrice: true,
      cost: pricing.totalCost,
      basis: "input-equivalent waste estimate"
    };
  }

  const geminiModel = canonicalizeGeminiModel(rawModel);
  if (GEMINI_WASTE_RATES[geminiModel]) {
    const base = GEMINI_WASTE_RATES[geminiModel];
    return {
      providerFamily: "gemini",
      canonicalModel: geminiModel,
      knownPrice: true,
      cost: mtokTieredCost(normalizedTokens, base.input, base.inputAboveThreshold, base.thresholdTokens),
      basis: "input-equivalent waste estimate"
    };
  }

  return {
    providerFamily: "unknown",
    canonicalModel: rawModel || "unknown",
    knownPrice: false,
    cost: 0,
    basis: "no official token price mapped"
  };
}

function canonicalizeGeminiModel(model) {
  const trimmed = String(model ?? "").trim().toLowerCase();
  if (GEMINI_WASTE_RATES[trimmed]) return trimmed;
  if (GEMINI_ALIASES.has(trimmed)) return GEMINI_ALIASES.get(trimmed);
  return trimmed;
}

export function estimateObservedUsageCost(model, usage = {}) {
  const rawModel = String(model ?? "").trim();
  const claudeModel = canonicalizeClaudeModel(rawModel);
  if (BASE_RATES[claudeModel]) {
    // Copilot telemetry reports inputTokens as the INCLUSIVE total prompt size
    // (i.e. inputTokens already contains cacheReadTokens + cacheWriteTokens).
    // Anthropic's native API reports input_tokens as the NON-cached portion only.
    // We must subtract cached tokens to avoid double-billing at the base input rate.
    const totalInput = Number(usage.inputTokens ?? 0);
    const cachedRead = Number(usage.cacheReadTokens ?? 0);
    const cachedWrite = Number(usage.cacheWriteTokens ?? 0);
    const nonCachedInput = Math.max(0, totalInput - cachedRead - cachedWrite);

    // When Copilot telemetry reports cacheWriteTokens as 0 (common), estimate
    // the cache write portion from nonCachedInput using Claude native patterns.
    // In agentic coding workflows, ~98.6% of non-cached input is cache writes
    // (Claude native Opus 4.6: 75.3m write vs 1.1m pure input).
    const CACHE_WRITE_FRACTION = 0.986;
    let effectiveInput = nonCachedInput;
    let effectiveCacheWrite = cachedWrite;
    let cacheWriteEstimated = false;

    if (cachedWrite === 0 && nonCachedInput > 0 && cachedRead > 0) {
      effectiveCacheWrite = Math.round(nonCachedInput * CACHE_WRITE_FRACTION);
      effectiveInput = Math.max(0, nonCachedInput - effectiveCacheWrite);
      cacheWriteEstimated = true;
    }

    const pricing = estimateClaudePricing(rawModel, {
      inputTokens: effectiveInput,
      outputTokens: usage.outputTokens ?? 0,
      cacheReadTokens: cachedRead,
      cacheCreationTokens: effectiveCacheWrite,
      webSearchRequests: 0
    });
    return {
      providerFamily: "claude",
      canonicalModel: pricing.canonicalModel,
      knownPrice: pricing.knownPrice,
      totalCost: pricing.totalCost,
      pricing,
      cacheWriteEstimated,
      estimatedCacheWriteTokens: cacheWriteEstimated ? effectiveCacheWrite : 0,
      estimatedPureInputTokens: cacheWriteEstimated ? effectiveInput : nonCachedInput
    };
  }

  const openAIModel = canonicalizeOpenAIModel(rawModel);
  if (OPENAI_BASE_RATES[openAIModel]) {
    const requestsCount = Math.max(1, Number(usage.requestsCount ?? 0));
    const pricing = estimateOpenAIPricing(rawModel, {
      inputTokens: usage.inputTokens ?? 0,
      cachedInputTokens: usage.cacheReadTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      fastMode: rawModel.endsWith("-fast"),
      longContext: Number(usage.inputTokens ?? 0) / requestsCount > Number(OPENAI_BASE_RATES[openAIModel].longContextThreshold ?? Number.MAX_SAFE_INTEGER)
    });
    return {
      providerFamily: "openai",
      canonicalModel: pricing.canonicalModel,
      knownPrice: pricing.knownPrice,
      totalCost: pricing.totalCost,
      pricing
    };
  }

  const geminiModel = canonicalizeGeminiModel(rawModel);
  if (GEMINI_WASTE_RATES[geminiModel]) {
    const waste = estimateWasteCostFromTotalTokens(rawModel, usage.inputTokens ?? 0);
    return {
      providerFamily: "gemini",
      canonicalModel: waste.canonicalModel,
      knownPrice: waste.knownPrice,
      totalCost: waste.cost,
      pricing: {
        canonicalModel: waste.canonicalModel,
        knownPrice: waste.knownPrice,
        components: {
          inputCost: waste.cost,
          outputCost: 0,
          cacheReadCost: 0
        },
        basis: "input-side Gemini estimate"
      }
    };
  }

  return {
    providerFamily: "unknown",
    canonicalModel: rawModel || "unknown",
    knownPrice: false,
    totalCost: 0,
    pricing: {
      canonicalModel: rawModel || "unknown",
      knownPrice: false,
      components: {}
    }
  };
}

function mtokCost(tokens, rate) {
  return (Number(tokens ?? 0) / 1_000_000) * rate;
}

function mtokTieredCost(tokens, baseRate, aboveRate, thresholdTokens) {
  const normalizedTokens = Math.max(0, Number(tokens ?? 0));
  if (!thresholdTokens || aboveRate === undefined || aboveRate === null) {
    return mtokCost(normalizedTokens, baseRate);
  }
  const belowThreshold = Math.min(normalizedTokens, thresholdTokens);
  const aboveThresholdTokens = Math.max(0, normalizedTokens - thresholdTokens);
  return mtokCost(belowThreshold, baseRate) + mtokCost(aboveThresholdTokens, aboveRate);
}
