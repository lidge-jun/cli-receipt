import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectClaudeSessions } from "../src/providers/claude.js";
import { collectCodexSessions } from "../src/providers/codex.js";
import { collectCopilotSessions } from "../src/providers/copilot.js";
import { aggregateSessions } from "../src/core/aggregate.js";
import { estimateClaudePricing, estimateOpenAIPricing, estimateWasteCostFromTotalTokens, getCopilotModelMetadata } from "../src/core/pricing.js";

test("collectClaudeSessions parses assistant usage from transcript files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claude-usage-"));
  const projectDir = path.join(root, "projects", "-tmp-demo");
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDir, "session-1.jsonl"),
    [
      JSON.stringify({ type: "user", timestamp: "2026-03-27T01:00:00.000Z", cwd: "/tmp/demo" }),
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-03-27T01:01:00.000Z",
        message: {
          model: "claude-sonnet-4-6",
          usage: {
            input_tokens: 100,
            cache_read_input_tokens: 25,
            cache_creation_input_tokens: 12,
            output_tokens: 50,
            cache_creation: {
              ephemeral_5m_input_tokens: 7,
              ephemeral_1h_input_tokens: 5
            },
            server_tool_use: {
              web_search_requests: 2
            }
          }
        }
      })
    ].join("\n"),
    "utf8"
  );

  const sessions = await collectClaudeSessions({ root });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].messages, 2);
  assert.equal(sessions[0].totalTokens, 187);
  assert.equal(sessions[0].webSearchRequests, 2);
  assert.equal(sessions[0].modelBreakdowns[0].cacheCreationTokens, 12);
  assert.ok(sessions[0].totalCost > 0);
});

test("collectCodexSessions groups token_count totals by day and model", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-usage-"));
  await fs.mkdir(path.join(root, "sessions", "2026", "03", "27"), { recursive: true });
  await fs.writeFile(
    path.join(root, "session_index.jsonl"),
    `${JSON.stringify({ id: "thread-1", thread_name: "Heatmap thread" })}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "sessions", "2026", "03", "27", "rollout-thread-1.jsonl"),
    [
      JSON.stringify({
        timestamp: "2026-03-27T02:00:00.000Z",
        type: "session_meta",
        payload: { id: "thread-1", timestamp: "2026-03-27T02:00:00.000Z", cwd: "/tmp/codex" }
      }),
      JSON.stringify({
        timestamp: "2026-03-27T02:01:00.000Z",
        type: "turn_context",
        payload: { model: "gpt-5.4" }
      }),
      JSON.stringify({
        timestamp: "2026-03-27T02:01:10.000Z",
        type: "response_item",
        payload: { type: "message", role: "user" }
      }),
      JSON.stringify({
        timestamp: "2026-03-27T02:02:00.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 120,
              cached_input_tokens: 30,
              output_tokens: 80,
              total_tokens: 230
            }
          }
        }
      }),
      JSON.stringify({
        timestamp: "2026-03-27T02:03:00.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 200,
              cached_input_tokens: 40,
              output_tokens: 120,
              total_tokens: 360
            }
          }
        }
      })
    ].join("\n"),
    "utf8"
  );

  const sessions = await collectCodexSessions({ root });
  assert.equal(sessions.length, 2);
  const costRecord = sessions.find((item) => item.totalTokens > 0);
  assert.equal(costRecord.project, "Heatmap thread");
  assert.equal(costRecord.inputTokens, 200);
  assert.equal(costRecord.cachedInputTokens, 40);
  assert.equal(costRecord.outputTokens, 120);
  assert.equal(costRecord.totalTokens, 320);
  assert.equal(costRecord.modelBreakdowns[0].displayName, "GPT-5.4");
  assert.ok(costRecord.totalCost > 0);
});

test("collectCopilotSessions prefers session.shutdown model metrics when present", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-usage-"));
  const sessionDir = path.join(root, "session-state", "session-1");
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionDir, "workspace.yaml"),
    [
      "id: session-1",
      "cwd: /tmp/copilot",
      "created_at: 2026-03-27T00:00:00.000Z",
      "updated_at: 2026-03-27T01:00:00.000Z"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(sessionDir, "events.jsonl"),
    [
      JSON.stringify({
        type: "session.shutdown",
        timestamp: "2026-03-27T01:00:00.000Z",
        data: {
          totalPremiumRequests: 8,
          totalApiDurationMs: 1000,
          sessionStartTime: 1774526472343,
          codeChanges: { linesAdded: 1, linesRemoved: 0, filesModified: [] },
          modelMetrics: {
            "gpt-5.4": {
              requests: { count: 2, cost: 2 },
              usage: {
                inputTokens: 300000,
                outputTokens: 1000,
                cacheReadTokens: 200000,
                cacheWriteTokens: 0
              }
            }
          }
        }
      })
    ].join("\n"),
    "utf8"
  );

  const sessions = await collectCopilotSessions({ root: path.join(root, "session-state") });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].modelBreakdowns[0].premiumRequestEstimate, 2);
  assert.equal(sessions[0].modelBreakdowns[0].inputTokens, 300000);
  assert.equal(sessions[0].modelBreakdowns[0].cachedInputTokens, 200000);
  assert.equal(sessions[0].modelBreakdowns[0].outputTokens, 1000);
});

test("collectCopilotSessions sums multiple non-empty shutdown summaries and ignores empty shutdowns", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-usage-"));
  const sessionDir = path.join(root, "session-state", "session-2");
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionDir, "workspace.yaml"),
    [
      "id: session-2",
      "cwd: /tmp/copilot",
      "created_at: 2026-03-27T00:00:00.000Z",
      "updated_at: 2026-03-27T03:00:00.000Z"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(sessionDir, "events.jsonl"),
    [
      JSON.stringify({
        type: "session.shutdown",
        timestamp: "2026-03-27T01:00:00.000Z",
        data: {
          totalPremiumRequests: 2,
          totalApiDurationMs: 1000,
          modelMetrics: {
            "gpt-5.4": {
              requests: { count: 2, cost: 2 },
              usage: {
                inputTokens: 300000,
                outputTokens: 1000,
                cacheReadTokens: 200000,
                cacheWriteTokens: 0
              }
            }
          }
        }
      }),
      JSON.stringify({
        type: "session.shutdown",
        timestamp: "2026-03-27T02:00:00.000Z",
        data: {
          totalPremiumRequests: 0,
          totalApiDurationMs: 0,
          modelMetrics: {}
        }
      }),
      JSON.stringify({
        type: "session.shutdown",
        timestamp: "2026-03-27T03:00:00.000Z",
        data: {
          totalPremiumRequests: 1,
          totalApiDurationMs: 1000,
          modelMetrics: {
            "gpt-5.4": {
              requests: { count: 1, cost: 1 },
              usage: {
                inputTokens: 120000,
                outputTokens: 500,
                cacheReadTokens: 80000,
                cacheWriteTokens: 0
              }
            }
          }
        }
      })
    ].join("\n"),
    "utf8"
  );

  const sessions = await collectCopilotSessions({ root: path.join(root, "session-state") });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].updatedAt, "2026-03-27T03:00:00.000Z");
  assert.equal(sessions[0].modelBreakdowns[0].premiumRequestEstimate, 3);
  assert.equal(sessions[0].modelBreakdowns[0].activity, 3);
  assert.equal(sessions[0].modelBreakdowns[0].inputTokens, 420000);
  assert.equal(sessions[0].modelBreakdowns[0].cachedInputTokens, 280000);
  assert.equal(sessions[0].modelBreakdowns[0].outputTokens, 1500);
  assert.equal(sessions[0].totalTokens, 701500);
});

test("aggregateSessions groups sessions into the requested month", () => {
  const report = aggregateSessions(
    [
      {
        provider: "claude",
        project: "demo",
        startedAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:05:00.000Z",
        messages: 4,
        activity: 4,
        totalTokens: 100,
        totalCost: 1.25,
        modelBreakdowns: []
      },
      {
        provider: "codex",
        project: "demo-2",
        startedAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:05:00.000Z",
        messages: 3,
        activity: 3,
        totalTokens: 200,
        totalCost: 0,
        modelBreakdowns: []
      }
    ],
    {
      type: "month",
      year: 2026,
      monthIndex: 2,
      label: "2026-03",
      fileLabel: "2026-03",
      title: "2026-03 monthly usage",
      start: new Date("2026-03-01T00:00:00.000Z"),
      end: new Date("2026-03-31T23:59:59.999Z")
    }
  );

  assert.equal(report.total.sessions, 2);
  assert.equal(report.total.activity, 7);
  assert.equal(report.total.totalTokens, 300);
  assert.equal(report.total.totalCost, 1.25);
});

test("estimateClaudePricing includes cache pricing and threshold tiers", () => {
  const pricing = estimateClaudePricing("claude-sonnet-4-5", {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheCreationTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
    webSearchRequests: 2
  });

  assert.equal(pricing.knownPrice, true);
  assert.equal(pricing.components.inputCost, 5.4);
  assert.equal(pricing.components.outputCost, 21);
  assert.equal(pricing.components.cacheCreationCost, 6.75);
  assert.ok(Math.abs(pricing.components.cacheReadCost - 0.54) < 1e-9);
  assert.equal(pricing.components.webSearchCost, 0.02);
});

test("estimateOpenAIPricing includes cached input pricing", () => {
  const pricing = estimateOpenAIPricing("gpt-5.4-mini", {
    inputTokens: 1_000_000,
    cachedInputTokens: 1_000_000,
    outputTokens: 1_000_000
  });

  assert.equal(pricing.knownPrice, true);
  assert.equal(pricing.components.inputCost, 0);
  assert.equal(pricing.components.cachedInputCost, 0.075);
  assert.equal(pricing.components.outputCost, 4.5);
});

test("estimateOpenAIPricing supports priority and long-context modifiers", () => {
  const priorityPricing = estimateOpenAIPricing("gpt-5.2", {
    inputTokens: 1_000_000,
    cachedInputTokens: 0,
    outputTokens: 1_000_000,
    serviceTier: "priority"
  });
  assert.equal(priorityPricing.components.inputCost, 3.5);
  assert.equal(priorityPricing.components.outputCost, 28);
  assert.equal(priorityPricing.modifiers.priorityMultiplier, 2);

  const longContextPricing = estimateOpenAIPricing("gpt-5.4", {
    inputTokens: 1_000_000,
    cachedInputTokens: 0,
    outputTokens: 1_000_000,
    longContext: true,
    serviceTier: "priority"
  });
  assert.equal(longContextPricing.components.inputCost, 10);
  assert.equal(longContextPricing.components.outputCost, 45);
  assert.equal(longContextPricing.modifiers.priorityMultiplier, 2);
  assert.equal(longContextPricing.modifiers.longContextApplied, true);

  const fastAliasPricing = estimateOpenAIPricing("gpt-5.2-fast", {
    inputTokens: 1_000_000,
    cachedInputTokens: 0,
    outputTokens: 0
  });
  assert.equal(fastAliasPricing.components.inputCost, 3.5);
});

test("getCopilotModelMetadata returns official multiplier metadata", () => {
  const metadata = getCopilotModelMetadata("claude-opus-4.6-fast");
  assert.equal(metadata.displayName, "Claude Opus 4.6 (fast mode)");
  assert.equal(metadata.multiplier, 30);
});

test("estimateWasteCostFromTotalTokens uses official input-side rates", () => {
  const claudeWaste = estimateWasteCostFromTotalTokens("claude-opus-4.6-fast", 1_000_000);
  // Ratio-based: output(3%)*$150 + cacheRead(87%)*$3 + cacheWrite(9.59%)*$37.5 + input(0.41%)*$30
  assert.ok(claudeWaste.cost > 10 && claudeWaste.cost < 12, `Expected ~$10.83, got $${claudeWaste.cost}`);
  assert.ok(claudeWaste.estimatedBreakdown, "Should have estimated breakdown");
  assert.equal(claudeWaste.basis, "ratio-based waste estimate");

  const openaiWaste = estimateWasteCostFromTotalTokens("gpt-5.4-fast", 300_000);
  assert.equal(openaiWaste.cost, 3);

  const geminiWaste = estimateWasteCostFromTotalTokens("gemini-3-flash-preview", 1_000_000);
  assert.equal(geminiWaste.cost, 0.5);
});
