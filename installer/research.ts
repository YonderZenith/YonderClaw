/**
 * MetaClaw Research Phase — Claude-powered best practices research
 *
 * Uses the Agent SDK to:
 * 1. Research best practices for the user's specific agent type
 * 2. Generate optimal configuration
 * 3. Validate the configuration
 *
 * Auth: reads ~/.claude/.credentials.json (from Claude login)
 * No CLI needs to be open — the SDK uses the stored OAuth token.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage, SDKResultSuccess, SDKAssistantMessage, Options } from "@anthropic-ai/claude-agent-sdk";
import ora from "ora";
import { brand, muted, success, sectionHeader, status } from "./brand.js";
import type { SystemInfo } from "./detect.js";
import type { QuestionnaireResult } from "./questionnaire.js";

export type ClawConfig = {
  name: string;
  template: string;
  systemPrompt: string;
  tools: string[];
  safety: Record<string, unknown>;
  schedule: { cron: string; description: string };
  selfImprovement: {
    enabled: boolean;
    reflectionFrequency: string;
    metricsToTrack: string[];
  };
  rawResearch: string;
};

/**
 * Build the meta-prompt that instructs Claude to research and configure.
 */
function buildMetaPrompt(result: QuestionnaireResult, systemInfo: SystemInfo): string {
  const { template, answers } = result;

  return `You are MetaClaw, an autonomous AI agent configuration engine by Yonder Zenith LLC.

## YOUR MISSION
Research and generate the OPTIMAL agent configuration for this user's needs. Be opinionated — choose the best approach, don't offer multiple options.

## SYSTEM CONTEXT
- OS: ${systemInfo.os.platform} ${systemInfo.os.release} (${systemInfo.os.arch})
- Hardware: ${systemInfo.hardware.cpus} CPUs, ${systemInfo.hardware.ram} RAM, GPU: ${systemInfo.hardware.gpu}
- User: ${systemInfo.user.username}
- Workspace: ${systemInfo.paths.workspace}
- Available: Node.js ${systemInfo.node.version}${systemInfo.docker.installed ? ", Docker " + systemInfo.docker.version : ""}${systemInfo.python.installed ? ", Python " + systemInfo.python.version : ""}

## AGENT REQUEST
- Template: ${template.name} (${template.id})
- Description: ${template.description}
- Project: ${result.projectName}

## USER'S DETAILED REQUIREMENTS
- Day-to-day tasks: ${answers.taskDescription || "Not specified"}
- Tools/platforms they use: ${answers.toolsUsed || "Not specified"}
- Autonomy level: ${answers.autonomyLevel || "semi"}
- Expected daily volume: ${answers.volume || "Not specified"}
- Special instructions: ${answers.specialInstructions || "None"}

## TEMPLATE-SPECIFIC CONFIG
${Object.entries(answers).filter(([k]) => !["taskDescription", "toolsUsed", "autonomyLevel", "volume", "specialInstructions", "selfUpdateIntervalHours"].includes(k)).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## PROTOCOL (follow this exactly)

### STEP 1: RESEARCH (use WebSearch)
Search for and synthesize:
- What are the absolute best practices for a ${template.name} in 2026?
- What tools/MCP servers are proven for this use case?
- What are common failure modes and how to prevent them?
- What compliance/safety requirements exist?
- What makes world-class agents of this type vs mediocre ones?
Do at least 3 web searches. Be thorough.

### STEP 2: DESIGN
Based on research, design the agent:
- System prompt (comprehensive, with anti-AI-detection rules if sending emails)
- Tool list (specific MCP servers and built-in tools)
- Safety rules (rate limits, circuit breakers, compliance)
- Self-improvement strategy
- Schedule

### STEP 3: OUTPUT
Output a JSON block with this exact structure:
\`\`\`json
{
  "name": "${result.projectName}",
  "template": "${template.id}",
  "systemPrompt": "the full system prompt",
  "tools": ["tool1", "tool2"],
  "safety": {
    "maxActionsPerDay": 50,
    "maxActionsPerHour": 10,
    "circuitBreakerThreshold": 0.05
  },
  "schedule": {
    "cron": "*/30 * * * *",
    "description": "every 30 minutes"
  },
  "selfImprovement": {
    "enabled": true,
    "reflectionFrequency": "daily",
    "metricsToTrack": ["success_rate", "response_quality"]
  }
}
\`\`\`

### STEP 4: VALIDATE
Before outputting, check:
- Is every field populated? (no empty strings or missing keys)
- Is the system prompt specific to this use case? (not generic)
- Are safety limits reasonable? (not too loose, not too restrictive)
- Will this actually work on ${systemInfo.os.platform} with the available tools?
If anything scores below 8/10, revise it.`;
}

/**
 * Run the AI research phase — calls Claude Agent SDK to research and configure.
 */
export async function runResearch(
  result: QuestionnaireResult,
  systemInfo: SystemInfo
): Promise<ClawConfig | null> {
  console.log(sectionHeader("MetaClaw Board Convening"));
  console.log("");
  console.log(brand("  Board members are researching for your ultimate custom setup."));
  console.log(muted("  Analyzing your requirements, researching best practices,"));
  console.log(muted("  and designing the optimal configuration for " + result.template.name + "..."));
  console.log("");

  const spinner = ora({
    text: "Board convening — analyzing requirements...",
    color: "magenta",
    spinner: "dots12",
  }).start();

  const metaPrompt = buildMetaPrompt(result, systemInfo);

  try {
    let fullResponse = "";
    let currentPhase = "Researching...";

    const options: Options = {
      systemPrompt: "You are MetaClaw, an expert AI agent configuration engine. You research best practices using web search, then generate optimal agent configurations. Always output valid JSON in your final response.",
      allowedTools: ["WebSearch", "WebFetch"],
      maxTurns: 20,
      model: "claude-sonnet-4-6",
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

              // Update spinner with board-style messaging
              if (text.includes("search") || text.includes("Search")) {
                spinner.text = "Board researching industry best practices...";
              } else if (text.includes("design") || text.includes("Design")) {
                spinner.text = "Board designing your agent architecture...";
              } else if (text.includes("json") || text.includes("JSON")) {
                spinner.text = "Board generating your custom configuration...";
              } else if (text.includes("validat") || text.includes("Validat")) {
                spinner.text = "Board reviewing and stress-testing...";
              }
            }
          }
        }
      }

      if (message.type === "result") {
        const res = message as SDKResultMessage;
        if (res.subtype === "success") {
          const s = res as SDKResultSuccess;
          spinner.succeed(`Board consensus reached — configuration finalized ($${s.total_cost_usd.toFixed(2)})`);
        } else {
          spinner.fail("Research failed: " + res.subtype);
          return null;
        }
      }
    }

    // Extract JSON from response
    const config = extractConfig(fullResponse, result);
    if (config) {
      console.log("");
      console.log(status.ok("Agent configuration generated"));
      console.log(status.ok(`System prompt: ${config.systemPrompt.length} characters`));
      console.log(status.ok(`Tools: ${config.tools.join(", ")}`));
      console.log(status.ok(`Schedule: ${config.schedule.description}`));
      console.log(status.ok(`Self-improvement: ${config.selfImprovement.enabled ? "enabled" : "disabled"}`));
    }

    return config;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    spinner.fail(`Research failed: ${msg}`);
    return null;
  }
}

/**
 * Extract JSON config from Claude's response.
 */
function extractConfig(response: string, result: QuestionnaireResult): ClawConfig | null {
  // Try to find JSON block in response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        ...parsed,
        rawResearch: response,
      };
    } catch {
      // JSON parse failed
    }
  }

  // Try to find raw JSON object
  const braceMatch = response.match(/\{[\s\S]*"name"[\s\S]*"systemPrompt"[\s\S]*\}/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0]);
      return {
        ...parsed,
        rawResearch: response,
      };
    } catch {
      // JSON parse failed
    }
  }

  // Fallback — return minimal config
  return {
    name: result.projectName,
    template: result.template.id,
    systemPrompt: `You are a ${result.template.name}. ${result.template.description}`,
    tools: result.template.requiredTools,
    safety: { maxActionsPerDay: 50, maxActionsPerHour: 10 },
    schedule: { cron: "*/30 * * * *", description: "every 30 minutes" },
    selfImprovement: {
      enabled: true,
      reflectionFrequency: "daily",
      metricsToTrack: ["success_rate"],
    },
    rawResearch: response,
  };
}
