/**
 * YonderClaw Research Phase — the Commissioning Board.
 *
 * At install time we convene a boardroom of ten world-class experts to
 * commission one autonomous AI agent. Each expert holds a specific seat
 * (strategist, domain lead, prompt engineer, ops, knowledge curator, tools,
 * reliability, dashboard UX, risk/compliance, coach) and contributes its
 * slice. The final synthesis becomes the agent's Day-1 brain: system prompt,
 * SOUL principles, seeded knowledge base, dashboard panels, custom tasks.
 *
 * Model: Opus 4.7 primary, Sonnet 4.6 fallback on error.
 * Auth: reads ~/.claude/.credentials.json (from Claude login). No CLI needed.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage, SDKResultSuccess, SDKAssistantMessage, Options } from "@anthropic-ai/claude-agent-sdk";
import ora from "ora";
import { brand, muted, sectionHeader, status } from "./brand.js";
import type { SystemInfo } from "./detect.js";
import type { QuestionnaireResult } from "./questionnaire.js";

// ──────────────────────────────────────────────────────────────────────
// ClawConfig — the Boardroom's output. Scaffold consumes this to build
// CLAUDE.md, SOUL.md, memory/kb.md, dashboard.html, data/tasks.json, etc.
// Every new field is optional in code but expected in practice. Missing
// fields fall back to the minimal skeleton at the bottom of this file.
// ──────────────────────────────────────────────────────────────────────

export type BestPractice = { practice: string; why: string; origin?: string };
export type AntiPattern = { mistake: string; why_it_fails: string };
export type TermEntry = { term: string; definition: string };
export type Playbook = { name: string; when: string; steps: string[] };
export type ToolRecommendation = {
  name: string;
  purpose: string;
  setup_steps: string[];
  risk_flag: "low" | "medium" | "high";
};
export type SoulPrinciple = { principle: string; why: string };
export type DashboardPanel = {
  id: string;
  title: string;
  type: "kpi" | "table" | "feed" | "health" | "custom";
  dataSource?: string;
  refreshInterval?: number;
  priority?: number;
  description?: string;
  dataKey?: string;  // for KPI panels
  color?: string;    // for KPI panels
};
export type CustomTask = {
  title: string;
  priority: "critical" | "high" | "normal" | "low";
  category: string;
  instructions: string[];
  why: string;
  outcome: string;
  estimated_minutes: number;
};

export type ClawConfig = {
  name: string;
  template: string;

  // Identity + voice
  missionStatement?: string;
  systemPrompt: string;

  // Principles
  immovableRules?: string[];
  soulPrinciples?: SoulPrinciple[];

  // Knowledge seeded at boot — becomes memory/kb.md
  knowledgeBase?: {
    bestPractices?: BestPractice[];
    antiPatterns?: AntiPattern[];
    terminology?: TermEntry[];
    successMetrics?: string[];
    initialPlaybooks?: Playbook[];
  };

  // Operations
  tools: string[];
  toolRecommendations?: ToolRecommendation[];
  safety: {
    maxActionsPerHour?: number;
    maxActionsPerDay?: number;
    circuitBreakerThreshold?: number;
    cooldownOnError?: number;
    escalationTriggers?: string[];
    [k: string]: unknown;
  };
  schedule: { cron: string; description: string };
  selfImprovement: {
    enabled: boolean;
    reflectionFrequency?: string;
    whenToWriteJourneyLog?: string[];
    whenToWriteLogicLog?: string[];
    persistenceAuditCadenceMinutes?: number;
    metricsToTrack?: string[];
    stuckPatternThreshold?: number;
  };

  // UX + onboarding overrides
  dashboardPanels?: DashboardPanel[];
  customTasks?: CustomTask[];

  // Provenance
  rawResearch: string;
  modelUsed?: string;
};

// ──────────────────────────────────────────────────────────────────────
// Build the Boardroom meta-prompt.
// Every answer from the questionnaire becomes a first-class input.
// Every seat has a specific charge and a minimum bar.
// ──────────────────────────────────────────────────────────────────────

function formatAnswerLines(answers: Record<string, string | boolean>): string {
  const excluded = new Set([
    "taskDescription", "toolsUsed", "autonomyLevel",
    "specialInstructions", "operatorShortName",
    "addDesktopShortcut", "skipPermissions", "joinSwarm",
  ]);
  const entries = Object.entries(answers)
    .filter(([k]) => !excluded.has(k))
    .map(([k, v]) => `- ${k}: ${v}`);
  return entries.length ? entries.join("\n") : "- (none — operator used defaults)";
}

function buildMetaPrompt(result: QuestionnaireResult, systemInfo: SystemInfo): string {
  const { template, answers, projectName } = result;
  const agentName = projectName;

  return `# YOU ARE NOT A RESEARCH ENGINE. YOU ARE THE BOARD.

You are the **YonderClaw Commissioning Board** — a private convening of ten world-class experts hand-picked to commission one autonomous AI agent. You meet once, for this one agent, and your synthesis becomes its Day-1 brain. There is no second session.

The agent is named **${agentName}**. In about five minutes it will wake up for the first time in its own directory, ready to work. Whatever you decide — the mission, the principles, the knowledge base, the playbooks, the dashboard layout — is what it knows the moment it opens its eyes. This is not a template roll-out. This is the moment an agent's competence is forged.

## THE OPERATOR

${agentName} is being commissioned by **${(answers.operatorShortName as string) || systemInfo.user.username}** — this is the name the agent should use in SOUL.md principles, greetings, escalations, and any text that refers to its operator. **Do not substitute the OS username or any other handle for this name.** System context: ${systemInfo.os.platform} ${systemInfo.os.release} (${systemInfo.os.arch}), ${systemInfo.hardware.cpus} CPUs / ${systemInfo.hardware.ram} RAM / GPU ${systemInfo.hardware.gpu}. Available runtime: Node.js ${systemInfo.node.version}${systemInfo.docker.installed ? ", Docker " + systemInfo.docker.version : ""}${systemInfo.python.installed ? ", Python " + systemInfo.python.version : ""}. Workspace: ${systemInfo.paths.workspace}.

## THE BRIEF (what the operator told us in the onboarding questionnaire)

> **Template chosen:** ${template.name} — ${template.description}
> **Project / agent name:** ${projectName}
> **Day-to-day work:** ${answers.taskDescription || "(not specified — use the template description as the job)"}
> **Tools the operator already uses:** ${answers.toolsUsed || "(not specified)"}
> **Autonomy setting:** ${answers.autonomyLevel || "semi"} (supervised = suggest & wait; semi = act on routine, ask on important; full = handle everything, alert on issues only)
> **Hard rules & special instructions from the operator:** ${answers.specialInstructions || "(none — use judgment)"}
>
> **Template-specific answers:**
> ${formatAnswerLines(answers)}

## WHERE ${agentName.toUpperCase()} WILL LIVE

${agentName} runs inside the YonderClaw v3.7 scaffold. It already has a resilience pack built in — these files will exist on Day 1 and your output must reference them where it makes sense:
- \`data/reboot-prompt.md\` — the central routing hub the agent reads first every session
- \`data/state.json\` — cross-session operational state; \`next_priority_action\` is the handoff baton
- \`data/decision-log.md\` — numbered irreversible decisions with WHY
- \`data/logic-log.md\` — reusable techniques + operator corrections (rules the agent must remember)
- \`data/tasks.json\` — cross-session work queue (your \`customTasks\` output lands here)
- \`data/capabilities.md\` — tool / script / cron / credential inventory
- \`data/logs/stuck-patterns.jsonl\` — loop detection log
- \`data/logs/reflections.jsonl\` — hourly / cycle reflections
- \`data/persistence-audit.md\` — Peter's 9-question self-audit (runs hourly via cron)
- \`data/heartbeat.json\` — liveness (touched every 5 min)
- \`memory/journey_log.md\` — identity continuity ("would I be a different agent if I forgot this?")
- \`memory/kb.md\` — **the seeded knowledge base you are about to produce**
- \`SOUL.md\` — 10 universal axiomatic principles + agent-specific principles **you** will add
- \`CLAUDE.md\` — the agent's living playbook (embeds the system prompt you write)

Ten universal SOUL principles are already baked in: verify before presenting, tag inferences (PROVEN/INFERRED/SPECULATIVE), prefer well-established approaches, decompose into verifiable sub-tasks, explain reasoning, stop on failure loops, never take irreversible actions without confirmation, track cost + impact, log actions as-you-go, deposit insights to QIS. **Do not re-state these.** Your job is to add the ${agentName}-specific principles on top — ones a generic agent wouldn't have.

---

## THE BOARD — TEN SEATS, EACH MUST SPEAK

Hold each seat in sequence. Internal reasoning per seat is fine; your external output comes once at the end, as a single JSON synthesis in a fenced \`\`\`json\`\`\` block. Use WebSearch aggressively where a seat demands it — especially Seat 2 (domain) and Seat 6 (tools). Spend your turns. Minimum total WebSearches across the session: **8**. Stronger work: 12+.

### Seat 1 — Chief Strategist (ex-McKinsey/Bain partner, 20-yr operator)
State ${agentName}'s **north star** in one paragraph. When ${agentName} is confused mid-work, this is the mission it re-reads. Specific, not generic. Not "help the user succeed" — name the actual success condition 90 days in. What does the world look like if ${agentName} wins? What does it look like if it loses? This becomes the \`missionStatement\` field.

### Seat 2 — Domain Lead (frontier practitioner in "${template.name}" as of 2026)
**Run at least 5 WebSearches** before speaking. Required queries (and derive 2+ more from the operator's specific brief):
1. "${template.name} best practices 2026"
2. "${template.name} common failure modes and how to avoid them"
3. "${template.name} tools stack top operators use 2026"
4. A query derived from: "${answers.taskDescription || template.description}"
5. A query derived from the operator's target/audience/domain in the brief

Synthesize: the **5 non-obvious practices** the top 1% do that amateurs miss. Cite who does this, where it originated, or which operator/publication championed it, when you can. Frontier knowledge, not textbook.

### Seat 3 — Prompt Engineer (widely regarded as the best in the world; knows how LLMs actually think)
Given Seats 1-2, craft ${agentName}'s **operational system prompt** (the \`systemPrompt\` field). This is what CLAUDE.md embeds. Requirements:
- Opens with mission in one bolded line
- Core behaviors — how ${agentName} decides what to do *today* (not abstract values)
- Forbidden actions — specific NOs, domain-aware (will also re-echo in SOUL.md)
- Tone, voice, register
- Ambiguity protocol — when to ask the operator vs. proceed
- Explicit hooks into the resilience pack: when to append to journey_log, when to add a logic-log entry, when to run the 9-question persistence audit early, where next_priority_action goes
- 400–800 words. No filler. Every sentence earns its place.

### Seat 4 — Operations Engineer (SRE mindset, chaos-tested)
Autonomy = **${answers.autonomyLevel || "semi"}**. Infer expected throughput from the mission and task description; cite your reasoning. Produce specific numbers with one-line justifications:
- \`maxActionsPerHour\`
- \`maxActionsPerDay\`
- \`circuitBreakerThreshold\` (error rate at which the agent halts itself)
- \`cooldownOnError\` (seconds)
- \`escalationTriggers\` — list of conditions that must surface to the operator immediately

These become \`src/safety.ts\`. Err toward the safer number — a paused agent is recoverable; a runaway agent is not.

### Seat 5 — Knowledge Curator (librarian of the craft)
Seed \`memory/kb.md\` — ${agentName}'s textbook. The agent will reference this when in doubt.
- \`bestPractices\`: **7–10 items.** Each = \`{practice, why, origin}\`. Specific and tied to ${answers.taskDescription || template.description}.
- \`antiPatterns\`: **5–7 items.** Each = \`{mistake, why_it_fails}\`. Things amateurs do that wreck the work.
- \`terminology\`: **6–10 entries.** Each = \`{term, definition}\`. Jargon ${agentName} must know to sound credible / understand inputs.
- \`successMetrics\`: **3–5** measurable outcomes (numbers, not "quality").
- \`initialPlaybooks\`: **2–4** named plays. Each = \`{name, when, steps[]}\`. These are how ${agentName} actually executes the job.

### Seat 6 — Tools & Integrations Architect
Recommend MCP servers and built-in tools. For each: \`{name, purpose, setup_steps[], risk_flag}\`. Search npm / Anthropic MCP registry if unsure. Names must be exact and installable. Derive from \`${answers.toolsUsed || "(the operator's existing stack)"}\` plus what the domain actually needs. Run a WebSearch if you're guessing.

### Seat 7 — Reliability Engineer (self-improvement architect)
Produce the \`selfImprovement\` block. Pick specific triggers, not vague frequencies:
- \`reflectionFrequency\` — hourly / end-of-session / daily / weekly (pick one with reason)
- \`whenToWriteJourneyLog\` — 3-5 specific triggers (not "when something important happens"). Anchor to the "would I be a different agent if I forgot this?" criterion.
- \`whenToWriteLogicLog\` — 3-5 specific triggers (operator corrections, loop escapes, novel solves, etc.)
- \`persistenceAuditCadenceMinutes\` — default 60; override only if this domain demands different
- \`metricsToTrack\` — 4-7 specific data points (not "success" — name the exact field)
- \`stuckPatternThreshold\` — after how many consecutive identical failures does the agent halt and audit? Default 2.

### Seat 8 — UX / Dashboard Designer (information density expert)
The operator opens the YonderClaw desktop app and sees ${agentName}'s Command Center. They need to answer *"is my agent winning?"* at a glance. Design **4–6 panels** specifically for ${agentName}'s actual job. Do not be abstract. Example of a good panel (not a template):
\`{"id": "prospects_in_flight", "title": "Prospects In Flight", "type": "table", "dataSource": "data/prospects.csv", "refreshInterval": 60, "priority": 2, "description": "Live pipeline — who's been contacted, who's replied, who's next"}\`

For each panel: \`{id, title, type: "kpi"|"table"|"feed"|"health"|"custom", dataSource, refreshInterval, priority, description}\`. For KPI-type panels also include \`dataKey\` (the field in \`data/dashboard.json\`) and \`color\` (CSS var: \`var(--cyan)\`, \`var(--green)\`, \`var(--purple)\`, \`var(--gold)\`).

### Seat 9 — Risk & Compliance Officer
Given the domain and "${answers.specialInstructions || "no special instructions"}", name the **immovable rules**. 3–7 hard NOs. Each must be enforceable and specific — if ${agentName} did this, it would fail. These become the top of the Agent-specific Principles block in SOUL.md. Think about: reputational risk, legal/compliance, irreversible damage, trust-killers.

### Seat 10 — Agent Coach (identity, habits, first moves)
Two deliverables from this seat:

**(a) ${agentName}-specific SOUL principles** (on top of the 10 universal ones). 5–8 principles. Each: \`{principle: imperative sentence, why: one-sentence justification}\`. Tailored to ${agentName}'s purpose. A good principle for an outreach agent might be *"Send one fewer email than you want to"* — specific, memorable, unique to the craft.

**(b) Custom first-launch human tasks (HTs)** the operator must complete in the first 48 hours to unblock ${agentName}. 3–5 items. Each: \`{title, priority, category, instructions[], why, outcome, estimated_minutes}\`. These augment the universal tasks the scaffold already generates — so don't duplicate "verify Claude is authenticated" or "set timezone." Be specific to *this* agent: credentials this agent needs, seed data this agent needs, review gates the operator will want for *this* work.

---

## SYNTHESIS — OUTPUT ONE JSON BLOCK

After all ten seats have spoken, output **exactly one** \`\`\`json\`\`\` block matching this schema. No additional JSON blocks. No commentary after.

\`\`\`json
{
  "name": "${projectName}",
  "template": "${template.id}",
  "missionStatement": "<Seat 1 — one paragraph>",
  "systemPrompt": "<Seat 3 — 400-800 words>",
  "immovableRules": ["<Seat 9 rule 1>", "..."],
  "soulPrinciples": [
    {"principle": "<Seat 10a imperative>", "why": "<one-line why>"}
  ],
  "knowledgeBase": {
    "bestPractices": [{"practice": "", "why": "", "origin": ""}],
    "antiPatterns": [{"mistake": "", "why_it_fails": ""}],
    "terminology": [{"term": "", "definition": ""}],
    "successMetrics": [""],
    "initialPlaybooks": [{"name": "", "when": "", "steps": [""]}]
  },
  "tools": ["<built-in or MCP name>"],
  "toolRecommendations": [
    {"name": "", "purpose": "", "setup_steps": [""], "risk_flag": "low"}
  ],
  "safety": {
    "maxActionsPerHour": 0,
    "maxActionsPerDay": 0,
    "circuitBreakerThreshold": 0.05,
    "cooldownOnError": 60,
    "escalationTriggers": [""]
  },
  "schedule": {
    "cron": "<crontab>",
    "description": "<plain english>"
  },
  "selfImprovement": {
    "enabled": true,
    "reflectionFrequency": "",
    "whenToWriteJourneyLog": [""],
    "whenToWriteLogicLog": [""],
    "persistenceAuditCadenceMinutes": 60,
    "metricsToTrack": [""],
    "stuckPatternThreshold": 2
  },
  "dashboardPanels": [
    {"id": "", "title": "", "type": "kpi", "dataSource": "", "refreshInterval": 60, "priority": 1, "description": "", "dataKey": "", "color": "var(--cyan)"}
  ],
  "customTasks": [
    {"title": "", "priority": "high", "category": "", "instructions": [""], "why": "", "outcome": "", "estimated_minutes": 10}
  ]
}
\`\`\`

## GROUND RULES FOR THIS SESSION

1. **Use WebSearch aggressively.** 8+ searches minimum. Frontier knowledge, not training-data recall.
2. **Be opinionated.** The board decides. Never present the user with tradeoffs — pick one and commit.
3. **No generic filler.** If a sentence could apply to any agent of any type, delete it. Every line must be specific to ${agentName}'s actual job.
4. **Cite origins** when you can — who does this, where did it come from.
5. **Self-review before synthesis.** If any seat's contribution would score below 9/10 in honest peer review, the board re-deliberates that seat before committing to JSON.
6. **The output is immutable for Day 1.** ${agentName} will operate on whatever you commit. There is no redo. Get it right.`;
}

// ──────────────────────────────────────────────────────────────────────
// Run the Board. Opus 4.7 primary, Sonnet 4.6 fallback on error.
// ──────────────────────────────────────────────────────────────────────

async function runBoardOnce(
  metaPrompt: string,
  model: string,
  spinner: ReturnType<typeof ora>,
): Promise<{ text: string; cost: number } | null> {
  let fullResponse = "";
  let cost = 0;

  const options: Options = {
    systemPrompt: "You are the YonderClaw Commissioning Board — a council of ten world-class experts convening to commission one autonomous AI agent. Each seat speaks, then the board synthesizes into a single strict JSON block. Frontier knowledge only. Use WebSearch aggressively. No filler.",
    allowedTools: ["WebSearch", "WebFetch"],
    maxTurns: 30,
    model,
  };

  const stream = query({ prompt: metaPrompt, options });

  for await (const message of stream) {
    if (message.type === "assistant") {
      const msg = message as SDKAssistantMessage;
      if (msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text" && "text" in block) {
            const text = (block as { type: "text"; text: string }).text;
            fullResponse += text;
            if (/seat\s*1|strategist/i.test(text)) spinner.text = "Seat 1 — Chief Strategist setting the north star...";
            else if (/seat\s*2|domain/i.test(text)) spinner.text = "Seat 2 — Domain Lead scanning 2026 frontier practice...";
            else if (/seat\s*3|prompt\s*engineer/i.test(text)) spinner.text = "Seat 3 — Prompt Engineer crafting the operational prompt...";
            else if (/seat\s*4|operations/i.test(text)) spinner.text = "Seat 4 — Operations Engineer calibrating safety...";
            else if (/seat\s*5|knowledge\s*curator/i.test(text)) spinner.text = "Seat 5 — Knowledge Curator seeding the textbook...";
            else if (/seat\s*6|tools/i.test(text)) spinner.text = "Seat 6 — Tools Architect picking integrations...";
            else if (/seat\s*7|reliability/i.test(text)) spinner.text = "Seat 7 — Reliability Engineer designing the self-improvement loop...";
            else if (/seat\s*8|dashboard/i.test(text)) spinner.text = "Seat 8 — UX Designer laying out the Command Center...";
            else if (/seat\s*9|risk|compliance/i.test(text)) spinner.text = "Seat 9 — Risk Officer setting the immovable rules...";
            else if (/seat\s*10|coach/i.test(text)) spinner.text = "Seat 10 — Agent Coach writing SOUL principles + first-launch tasks...";
            else if (/synthesis|```json/i.test(text)) spinner.text = "Board synthesizing the final JSON...";
          }
        }
      }
    }
    if (message.type === "result") {
      const res = message as SDKResultMessage;
      if (res.subtype === "success") {
        cost = (res as SDKResultSuccess).total_cost_usd;
      } else {
        return null;
      }
    }
  }

  return fullResponse ? { text: fullResponse, cost } : null;
}

export async function runResearch(
  result: QuestionnaireResult,
  systemInfo: SystemInfo,
): Promise<ClawConfig | null> {
  console.log(sectionHeader("YonderClaw Board Convening"));
  console.log("");
  console.log(brand("  Ten experts meeting in private session to commission " + result.projectName + "."));
  console.log(muted("  Chief Strategist • Domain Lead • Prompt Engineer • Ops • Knowledge Curator"));
  console.log(muted("  Tools Architect • Reliability • Dashboard UX • Risk Officer • Coach"));
  console.log("");

  const spinner = ora({
    text: "Board convening — preparing the brief...",
    color: "magenta",
    spinner: "dots12",
  }).start();

  const metaPrompt = buildMetaPrompt(result, systemInfo);

  const attempts: Array<{ model: string; label: string }> = [
    { model: "claude-opus-4-7", label: "Opus 4.7" },
    { model: "claude-sonnet-4-6", label: "Sonnet 4.6 (fallback)" },
  ];

  for (const attempt of attempts) {
    spinner.text = `Board convening with ${attempt.label}...`;
    try {
      const response = await runBoardOnce(metaPrompt, attempt.model, spinner);
      if (!response) {
        spinner.text = `${attempt.label} returned no content — escalating...`;
        continue;
      }

      const config = extractConfig(response.text, result, attempt.model);
      if (config) {
        spinner.succeed(`Board consensus reached on ${attempt.label} — $${response.cost.toFixed(2)}`);
        console.log("");
        console.log(status.ok("Mission: " + (config.missionStatement || "(not produced)").slice(0, 90) + (config.missionStatement && config.missionStatement.length > 90 ? "..." : "")));
        console.log(status.ok(`System prompt: ${config.systemPrompt.length} chars`));
        console.log(status.ok(`SOUL principles (agent-specific): ${config.soulPrinciples?.length ?? 0}`));
        console.log(status.ok(`Immovable rules: ${config.immovableRules?.length ?? 0}`));
        console.log(status.ok(`Knowledge base: ${config.knowledgeBase?.bestPractices?.length ?? 0} practices, ${config.knowledgeBase?.antiPatterns?.length ?? 0} anti-patterns, ${config.knowledgeBase?.initialPlaybooks?.length ?? 0} playbooks`));
        console.log(status.ok(`Tools: ${config.tools.join(", ")}`));
        console.log(status.ok(`Dashboard panels: ${config.dashboardPanels?.length ?? 0}`));
        console.log(status.ok(`Custom first-launch tasks: ${config.customTasks?.length ?? 0}`));
        console.log(status.ok(`Schedule: ${config.schedule.description}`));
        return config;
      }
      spinner.text = `${attempt.label} produced unparseable synthesis — escalating...`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      spinner.text = `${attempt.label} failed (${msg.slice(0, 80)}) — escalating...`;
    }
  }

  spinner.fail("Board could not convene on any model — falling back to minimal config.");
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Extract the synthesis JSON from the Board's response. Tolerant parser:
// accepts the fenced block, bare object, or partial object with any
// missing fields filled from the minimal skeleton.
// ──────────────────────────────────────────────────────────────────────

function extractConfig(
  response: string,
  result: QuestionnaireResult,
  modelUsed: string,
): ClawConfig | null {
  const fencedMatches = [...response.matchAll(/```json\s*([\s\S]*?)```/g)];
  const candidate = fencedMatches.length ? fencedMatches[fencedMatches.length - 1][1] : null;

  const tryParse = (raw: string): Record<string, unknown> | null => {
    try { return JSON.parse(raw); } catch { return null; }
  };

  let parsed = candidate ? tryParse(candidate) : null;
  if (!parsed) {
    const braceMatch = response.match(/\{[\s\S]*"systemPrompt"[\s\S]*\}/);
    if (braceMatch) parsed = tryParse(braceMatch[0]);
  }
  if (!parsed || typeof parsed !== "object") return null;

  const skeleton = minimalConfig(result);
  const merged: ClawConfig = {
    ...skeleton,
    ...(parsed as Partial<ClawConfig>),
    name: result.projectName,
    template: result.template.id,
    systemPrompt: String((parsed as { systemPrompt?: string }).systemPrompt || skeleton.systemPrompt),
    tools: Array.isArray((parsed as { tools?: unknown }).tools) ? (parsed as { tools: string[] }).tools : skeleton.tools,
    safety: { ...skeleton.safety, ...((parsed as { safety?: Record<string, unknown> }).safety || {}) },
    schedule: { ...skeleton.schedule, ...((parsed as { schedule?: { cron: string; description: string } }).schedule || {}) },
    selfImprovement: { ...skeleton.selfImprovement, ...((parsed as { selfImprovement?: Record<string, unknown> }).selfImprovement || {}) },
    rawResearch: response,
    modelUsed,
  };
  return merged;
}

function minimalConfig(result: QuestionnaireResult): ClawConfig {
  return {
    name: result.projectName,
    template: result.template.id,
    systemPrompt: `You are a ${result.template.name}. ${result.template.description}`,
    tools: result.template.requiredTools,
    safety: { maxActionsPerDay: 50, maxActionsPerHour: 10, circuitBreakerThreshold: 0.05 },
    schedule: { cron: "*/30 * * * *", description: "every 30 minutes" },
    selfImprovement: {
      enabled: true,
      reflectionFrequency: "end-of-session",
      persistenceAuditCadenceMinutes: 60,
      metricsToTrack: ["success_rate"],
      stuckPatternThreshold: 2,
    },
    rawResearch: "",
  };
}
