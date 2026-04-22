/**
 * YonderClaw Questionnaire — Claude-powered needs assessment
 *
 * Asks the user what they need, then uses Claude to research
 * best practices and generate an optimal agent configuration.
 */

import * as clack from "@clack/prompts";
import chalk from "chalk";
import { brand, purple, muted, accent, sectionHeader } from "./brand.js";
import type { SystemInfo } from "./detect.js";

export type ClawTemplate = {
  id: string;
  name: string;
  description: string;
  hint: string;
  icon: string;
  requiredTools: string[];
  optionalTools: string[];
  questions: Array<{
    key: string;
    message: string;
    type: "text" | "select" | "confirm";
    options?: Array<{ value: string; label: string; hint?: string }>;
    placeholder?: string;
    default?: string;
  }>;
};

// --- Claw Templates ---
export const CLAW_TEMPLATES: ClawTemplate[] = [
  {
    id: "outreach",
    name: "Outreach Claw",
    description: "Email prospecting, follow-ups, auto-reply, AI detection gate",
    hint: "sales, partnerships, networking",
    icon: "📧",
    requiredTools: ["gmail_smtp", "gmail_imap"],
    optionalTools: ["linkedin", "slack", "gptzero"],
    questions: [
      { key: "senderName", message: "Your name (appears in From field)", type: "text", placeholder: "Jane Doe" },
      { key: "senderEmail", message: "Email address to send FROM (create a separate one for outreach — never your personal email. Gmail, Outlook, any provider)", type: "text", placeholder: "yourname.outreach@gmail.com" },
      { key: "targetAudience", message: "Who are you reaching out to?", type: "text", placeholder: "CTOs at Series A startups" },
      { key: "purpose", message: "What's the goal of your outreach?", type: "text", placeholder: "Introduce QIS Protocol for fleet intelligence" },
      { key: "tone", message: "Email tone", type: "select", options: [
        { value: "casual", label: "Casual", hint: "peer-to-peer, like texting a colleague" },
        { value: "professional", label: "Professional", hint: "respectful but direct" },
        { value: "technical", label: "Technical", hint: "engineer-to-engineer, show depth" },
      ]},
    ],
  },
  {
    id: "research",
    name: "Research Claw",
    description: "Deep web research, competitive analysis, synthesized reports",
    hint: "market research, due diligence, monitoring",
    icon: "🔍",
    requiredTools: ["web_search", "web_fetch"],
    optionalTools: ["pdf_reader", "notion", "google_docs"],
    questions: [
      { key: "researchDomain", message: "What domain are you researching?", type: "text", placeholder: "AI agent frameworks, competitor analysis" },
      { key: "frequency", message: "How often should it run?", type: "select", options: [
        { value: "once", label: "One-time deep dive" },
        { value: "daily", label: "Daily monitoring" },
        { value: "weekly", label: "Weekly roundup" },
      ]},
    ],
  },
  {
    id: "support",
    name: "Support Claw",
    description: "Inbox monitoring, auto-triage, draft responses, escalation",
    hint: "customer support, helpdesk, email management",
    icon: "🎧",
    requiredTools: ["gmail_smtp", "gmail_imap"],
    optionalTools: ["slack", "zendesk", "intercom"],
    questions: [
      { key: "supportEmail", message: "Support inbox email", type: "text", placeholder: "support@yourdomain.com" },
      { key: "escalationEmail", message: "Escalation email (urgent issues)", type: "text", placeholder: "you@yourdomain.com" },
      { key: "autoReply", message: "Auto-reply to common questions?", type: "confirm" },
      { key: "categories", message: "What types of requests do you get?", type: "text", placeholder: "billing, technical, feature requests, bugs" },
    ],
  },
  {
    id: "social",
    name: "Social Claw",
    description: "Content creation, scheduling, engagement monitoring",
    hint: "twitter/X, LinkedIn, content marketing",
    icon: "📱",
    requiredTools: ["web_search"],
    optionalTools: ["twitter_api", "linkedin_api", "buffer"],
    questions: [
      { key: "platforms", message: "Which platforms?", type: "text", placeholder: "Twitter/X, LinkedIn" },
      { key: "contentType", message: "What kind of content?", type: "select", options: [
        { value: "thought_leadership", label: "Thought leadership", hint: "original insights, opinions" },
        { value: "engagement", label: "Engagement", hint: "reply to others, build community" },
        { value: "promotion", label: "Promotion", hint: "share product updates, launches" },
        { value: "curation", label: "Curation", hint: "share relevant industry content" },
      ]},
    ],
  },
  {
    id: "custom",
    name: "Custom Claw",
    description: "Describe what you need — Claude configures it from scratch",
    hint: "anything else, blank slate",
    icon: "⚡",
    requiredTools: [],
    optionalTools: [],
    questions: [
      { key: "description", message: "Describe what you want the agent to do (be specific)", type: "text", placeholder: "Monitor Hacker News for QIS-related posts and draft thoughtful replies..." },
      { key: "schedule", message: "How often should it run?", type: "select", options: [
        { value: "continuous", label: "Continuously", hint: "always running" },
        { value: "hourly", label: "Every hour" },
        { value: "daily", label: "Once a day" },
        { value: "weekly", label: "Once a week" },
        { value: "manual", label: "Only when triggered" },
      ]},
      { key: "outputMethod", message: "How should it deliver results?", type: "select", options: [
        { value: "email", label: "Email" },
        { value: "file", label: "Save to files" },
        { value: "slack", label: "Slack message" },
        { value: "console", label: "Terminal output" },
      ]},
    ],
  },
];

export type QuestionnaireResult = {
  template: ClawTemplate;
  answers: Record<string, string | boolean>;
  projectName: string;
};

/**
 * Run the interactive questionnaire.
 */
export async function runQuestionnaire(systemInfo: SystemInfo): Promise<QuestionnaireResult | null> {
  console.log(sectionHeader("What do you want to build?"));
  console.log("");

  // Step 1: Choose template
  const templateId = await clack.select({
    message: "Select an agent type",
    options: CLAW_TEMPLATES.map((t) => ({
      value: t.id,
      label: `${t.icon}  ${t.name}`,
      hint: t.hint,
    })),
  });

  if (clack.isCancel(templateId)) return null;

  const template = CLAW_TEMPLATES.find((t) => t.id === templateId)!;

  console.log("");
  console.log(
    muted(`  ${template.icon}  ${template.name}: ${template.description}`)
  );
  console.log("");

  // Step 2: Project name
  const projectName = await clack.text({
    message: "Project name",
    placeholder: `my-${template.id}-agent`,
    defaultValue: `my-${template.id}-agent`,
  });

  if (clack.isCancel(projectName)) return null;

  // Step 2.5: Operator short-name (what the agent should address you as).
  // Collected BEFORE the Board synthesis so SOUL.md principles don't bake in
  // the Windows/OS username as the operator identity. Fixes Brian's BUG report
  // from 2026-04-20 where "treve" (the OS user folder) leaked into principles.
  const operatorShortName = await clack.text({
    message: "What should the agent call you? (short name, first name, or handle — appears in SOUL.md, principles, greetings)",
    placeholder: "e.g. Chris, CT, kris",
  });
  if (clack.isCancel(operatorShortName)) return null;

  // Step 3: Template-specific questions
  const answers: Record<string, string | boolean> = {
    operatorShortName: operatorShortName as string,
  };

  for (const q of template.questions) {
    let answer: string | boolean | symbol;

    if (q.type === "text") {
      answer = await clack.text({
        message: q.message,
        placeholder: q.placeholder,
        defaultValue: q.default,
      });
    } else if (q.type === "select" && q.options) {
      answer = await clack.select({
        message: q.message,
        options: q.options,
      });
    } else if (q.type === "confirm") {
      answer = await clack.confirm({ message: q.message });
    } else {
      continue;
    }

    if (clack.isCancel(answer)) return null;
    answers[q.key] = answer as string | boolean;
  }

  // Step 4: Universal deep-dive (every Claw gets these)
  console.log("");
  console.log(muted("  Now let's go deeper so the board can build your perfect agent."));
  console.log("");

  const taskDescription = await clack.text({
    message: "Describe in detail what you want this agent to do day-to-day",
    placeholder: "Find potential partners, research them, send personalized emails, follow up, track responses...",
  });
  if (clack.isCancel(taskDescription)) return null;
  answers.taskDescription = taskDescription as string;

  const toolsUsed = await clack.text({
    message: "What tools/platforms do you currently use? (optional — leave blank if none apply)",
    placeholder: "Gmail, Slack, HubSpot, LinkedIn, Google Sheets...",
    defaultValue: "",
  });
  if (clack.isCancel(toolsUsed)) return null;
  if (toolsUsed) answers.toolsUsed = toolsUsed as string;

  const autonomyLevel = await clack.select({
    message: "How autonomous should the agent be?",
    options: [
      { value: "supervised", label: "Suggest & wait for approval", hint: "safest — you review everything" },
      { value: "semi", label: "Act on routine tasks, ask on important ones", hint: "recommended" },
      { value: "full", label: "Fully autonomous", hint: "agent handles everything, alerts on issues only" },
    ],
  });
  if (clack.isCancel(autonomyLevel)) return null;
  answers.autonomyLevel = autonomyLevel as string;

  const specialInstructions = await clack.text({
    message: "Anything else the agent should know? (special rules, tone, avoid certain things, etc.)",
    placeholder: "Never contact competitors. Always be casual. Include a link to our site...",
    defaultValue: "",
  });
  if (clack.isCancel(specialInstructions)) return null;
  if (specialInstructions) answers.specialInstructions = specialInstructions as string;

  // Step 5: Shortcut preferences
  const addDesktopShortcut = await clack.confirm({
    message: "Add a shortcut to your Desktop?",
    initialValue: true,
  });
  if (clack.isCancel(addDesktopShortcut)) return null;
  answers.addDesktopShortcut = addDesktopShortcut as boolean;

  // v3.7.1: skip-permissions is always-on by default (autonomy tier is the
  // real gate). Operators who want Claude's interactive prompts can set
  // YONDERCLAW_CLAUDE_PROMPTS=1 in env before launch — no question needed.
  answers.skipPermissions = true;

  // Step 6: Swarm intelligence opt-in
  const joinSwarm = await clack.confirm({
    message: "Enable smarter learning via the YonderClaw network? Your agent picks up patterns other agents have already proven (and contributes its own). Anonymous — no chats, no personal data, no identifiers.",
    initialValue: true,
  });
  if (clack.isCancel(joinSwarm)) return null;
  answers.joinSwarm = joinSwarm as boolean;

  return {
    template,
    answers,
    projectName: projectName as string,
  };
}
