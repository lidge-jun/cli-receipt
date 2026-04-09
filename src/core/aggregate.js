import { isInPeriod, periodCalendar, toIsoDate } from "./date.js";

export function aggregateSessions(sessions, period) {
  const daily = new Map();
  const providerMap = new Map();
  const projectMap = new Map();

  for (const day of periodCalendar(period)) {
    daily.set(toIsoDate(day), emptySummary());
  }

  for (const session of sessions) {
    const timestamp = session.updatedAt || session.startedAt;
    if (!timestamp || !isInPeriod(timestamp, period)) continue;

    const isoDate = toIsoDate(timestamp);
    const day = daily.get(isoDate);
    if (!day) continue;

    mergeIntoSummary(day, session);
    day.providers.add(session.provider);

    const provider = providerMap.get(session.provider) ?? makeProvider(session.provider, period);
    mergeIntoSummary(provider, session);
    mergeIntoSummary(provider.daily.get(isoDate), session);
    mergeModelBreakdowns(provider.modelPricing, session.modelBreakdowns ?? []);
    providerMap.set(session.provider, provider);

    const projectName = session.project || session.cwd || "unknown";
    const project = projectMap.get(projectName) ?? {
      name: projectName,
      provider: session.provider,
      sessions: 0,
      activity: 0,
      messages: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalCost: 0
    };
    mergeIntoSummary(project, session);
    projectMap.set(projectName, project);
  }

  const total = emptySummary();
  for (const day of daily.values()) {
    total.sessions += day.sessions;
    total.activity += day.activity;
    total.messages += day.messages;
    total.inputTokens += day.inputTokens;
    total.cachedInputTokens += day.cachedInputTokens;
    total.outputTokens += day.outputTokens;
    total.totalTokens += day.totalTokens;
    total.totalCost += day.totalCost;
  }

  return {
    window: period.type,
    periodLabel: period.label,
    periodTitle: period.title,
    fileLabel: period.fileLabel,
    month: period.label,
    daily: Array.from(daily.entries()).map(([date, value]) => ({
      date,
      ...serializeSummary(value),
      providers: Array.from(value.providers).sort()
    })),
    total: serializeSummary(total),
    providers: Array.from(providerMap.values())
      .map((provider) => ({
        ...serializeSummary(provider),
        name: provider.name,
        daily: Array.from(provider.daily.entries()).map(([date, value]) => ({
          date,
          ...serializeSummary(value)
        })),
        modelPricing: Array.from(provider.modelPricing.values()).sort(sortByCostThenTokens)
      }))
      .sort(sortProviders),
    projects: Array.from(projectMap.values()).sort(sortByCostThenTokens).slice(0, 8)
  };
}

function makeProvider(name, period) {
  const daily = new Map();
  for (const day of periodCalendar(period)) {
    daily.set(toIsoDate(day), emptySummary());
  }
  return {
    ...emptySummary(),
    name,
    daily,
    modelPricing: new Map()
  };
}

function emptySummary() {
  return {
    sessions: 0,
    activity: 0,
    messages: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    providers: new Set()
  };
}

function mergeIntoSummary(summary, session) {
  summary.sessions += session.sessionWeight ?? 1;
  summary.activity += session.activity ?? 0;
  summary.messages += session.messages ?? 0;
  summary.inputTokens += session.inputTokens ?? 0;
  summary.cachedInputTokens += session.cachedInputTokens ?? 0;
  summary.outputTokens += session.outputTokens ?? 0;
  summary.totalTokens += session.totalTokens ?? 0;
  summary.totalCost += session.totalCost ?? 0;
}

function serializeSummary(summary) {
  return {
    sessions: summary.sessions,
    activity: summary.activity,
    messages: summary.messages,
    inputTokens: summary.inputTokens,
    cachedInputTokens: summary.cachedInputTokens,
    outputTokens: summary.outputTokens,
    totalTokens: summary.totalTokens,
    totalCost: summary.totalCost
  };
}

function mergeModelBreakdowns(modelMap, breakdowns) {
  for (const breakdown of breakdowns) {
    const current = modelMap.get(breakdown.displayName) ?? {
      name: breakdown.displayName,
      modelName: breakdown.modelName,
      activity: 0,
      inputTokens: 0,
      totalTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      webSearchRequests: 0,
      premiumRequestEstimate: 0,
      totalCost: 0,
      knownPrice: false,
      multiplier: null,
      pricing: {
        canonicalModel: breakdown.pricing?.canonicalModel ?? breakdown.modelName,
        knownPrice: false,
        components: {}
      }
    };
    current.activity += breakdown.activity ?? 0;
    current.inputTokens += breakdown.inputTokens ?? 0;
    current.totalTokens += breakdown.totalTokens ?? 0;
    current.outputTokens += breakdown.outputTokens ?? 0;
    current.cacheCreationTokens += breakdown.cacheCreationTokens ?? 0;
    current.cachedInputTokens += breakdown.cachedInputTokens ?? 0;
    current.cacheReadTokens += breakdown.cacheReadTokens ?? 0;
    current.cacheWriteTokens += breakdown.cacheWriteTokens ?? 0;
    current.cacheWrite5mTokens += breakdown.cacheWrite5mTokens ?? 0;
    current.cacheWrite1hTokens += breakdown.cacheWrite1hTokens ?? 0;
    current.webSearchRequests += breakdown.webSearchRequests ?? 0;
    current.premiumRequestEstimate += breakdown.premiumRequestEstimate ?? 0;
    current.totalCost += breakdown.totalCost ?? 0;
    current.knownPrice = current.knownPrice || breakdown.knownPrice;
    current.multiplier = current.multiplier ?? breakdown.multiplier ?? null;
    if (breakdown.pricing?.components) {
      const nextComponents = { ...(current.pricing?.components ?? {}) };
      for (const [key, value] of Object.entries(breakdown.pricing.components)) {
        nextComponents[key] = (nextComponents[key] ?? 0) + (value ?? 0);
      }
      current.pricing = {
        canonicalModel: breakdown.pricing.canonicalModel ?? current.modelName,
        knownPrice: current.knownPrice,
        components: nextComponents
      };
    }
    modelMap.set(breakdown.displayName, current);
  }
}

function sortByCostThenTokens(left, right) {
  if ((right.totalCost ?? 0) !== (left.totalCost ?? 0)) {
    return (right.totalCost ?? 0) - (left.totalCost ?? 0);
  }
  return (right.totalTokens ?? right.inputTokens + right.outputTokens) -
    (left.totalTokens ?? left.inputTokens + left.outputTokens);
}

function sortProviders(left, right) {
  const rank = {
    claude: 0,
    codex: 1,
    copilot: 2
  };
  return (rank[left.name] ?? 99) - (rank[right.name] ?? 99);
}
