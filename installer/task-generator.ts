/**
 * YonderClaw Task Generator
 * Creates starter HT/AT tasks based on questionnaire answers.
 * Called during scaffold to generate data/tasks.json.
 */

interface BoardTask {
  title: string;
  priority: string;
  category: string;
  instructions: string[];
  why: string;
  outcome: string;
  estimated_minutes: number;
}

interface TaskConfig {
  agentName: string;
  clawType: string;
  senderEmail?: string;
  toolsUsed?: string;
  autonomy?: string;
  enableLocalSwarm?: boolean;
  enableGlobalSwarm?: boolean;
  relayUrl?: string;
  boardTasks?: BoardTask[];
}

export function generateStarterTasks(config: TaskConfig): any {
  const relayUrl = config.relayUrl || "https://relay.yonderzenith.com";
  const hts: any[] = [];
  const ats: any[] = [];
  let htNum = 1;
  let atNum = 1;

  const ht = (data: any) => {
    const id = `ht-${String(htNum++).padStart(3, "0")}`;
    return { id, status: "pending", created_at: new Date().toISOString(), completed_at: null, created_by: "system", notes: null, ...data };
  };

  const at = (data: any) => {
    const id = `at-${String(atNum++).padStart(3, "0")}`;
    return { id, status: data.requires_ht ? "blocked" : "pending", created_at: new Date().toISOString(), created_by: "system", ...data };
  };

  // === UNIVERSAL HTs (every claw type) ===

  hts.push(ht({
    title: "Verify Claude Code is authenticated",
    description: "Make sure Claude Code can connect to your account.",
    priority: "critical", category: "auth",
    blocks: [`at-${String(atNum).padStart(3, "0")}`],
    instructions: [
      "Open a terminal in this project directory",
      "Run: claude --version",
      "If it shows a version number, you're good",
      "If not, run: claude auth login",
      "Follow the browser prompts to authenticate"
    ],
    why: "The agent cannot function without Claude Code authentication. This is step zero.",
    outcome: "Agent can start working autonomously.",
    estimated_minutes: 2
  }));

  ats.push(at({
    title: "Run first health check and status report",
    priority: "critical", category: "setup",
    requires_ht: ["ht-001"],
    description: "Verify all systems are working after install."
  }));

  hts.push(ht({
    title: "Review agent personality and instructions",
    description: "Read CLAUDE.md and SOUL.md — customize if needed.",
    priority: "high", category: "config",
    blocks: [],
    instructions: [
      "Open CLAUDE.md in a text editor",
      "Review the system prompt — does it match what you want?",
      "Open SOUL.md — these are the agent's principles",
      "Edit either file if you want to adjust behavior",
      "Save and the agent will pick up changes next session"
    ],
    why: "The agent's personality and rules come from these files. Customizing them makes the agent truly yours.",
    outcome: "Agent behavior matches your expectations.",
    estimated_minutes: 5
  }));

  hts.push(ht({
    title: "Set your timezone",
    description: "Tell the agent your local timezone so it schedules correctly.",
    priority: "high", category: "config",
    blocks: [],
    instructions: [
      "Open data/state.json",
      "Add or update the field: \"timezone\": \"America/Phoenix\" (or your timezone)",
      "Save the file",
      "Common values: America/New_York, America/Chicago, America/Denver, America/Los_Angeles, America/Phoenix (no DST)"
    ],
    why: "Without your timezone, the agent hallucinates times and schedules things at wrong hours.",
    outcome: "Agent knows what time it is in your world.",
    estimated_minutes: 1
  }));

  // === OUTREACH-SPECIFIC HTs ===
  if (config.clawType === "outreach") {
    const emailHtId = `ht-${String(htNum).padStart(3, "0")}`;
    hts.push(ht({
      title: "Create a dedicated outreach email account",
      description: "Set up a separate Gmail for outreach. Never use your personal email — protects your main inbox from deliverability issues.",
      priority: "critical", category: "auth",
      blocks: [`at-${String(atNum + 1).padStart(3, "0")}`, `at-${String(atNum + 2).padStart(3, "0")}`],
      instructions: [
        "Go to accounts.google.com and create a new Google account",
        "Use a professional address (e.g., yourname.outreach@gmail.com)",
        "Enable 2-Step Verification: Security > 2-Step Verification",
        "Generate an App Password: Security > 2-Step Verification > App passwords",
        "Select 'Mail' and your device, click Generate",
        "Copy the 16-character app password — you'll need it next"
      ],
      why: "Your agent sends emails from this account. A dedicated account protects your personal email reputation and lets the agent operate without risk to your main inbox.",
      outcome: "Agent can send outreach emails autonomously.",
      estimated_minutes: 10
    }));

    const credsHtId = `ht-${String(htNum).padStart(3, "0")}`;
    hts.push(ht({
      title: "Add email credentials to .env file",
      description: "Enter your outreach Gmail and app password so the agent can send.",
      priority: "critical", category: "auth",
      depends_on_ht: [emailHtId],
      status: "blocked",
      blocks: [`at-${String(atNum + 1).padStart(3, "0")}`],
      instructions: [
        "Create a file called .env in the project root (if it doesn't exist)",
        "Add these lines:",
        "SMTP_HOST=smtp.gmail.com",
        "SMTP_PORT=587",
        `SMTP_USER=${config.senderEmail || "your.outreach@gmail.com"}`,
        "SMTP_PASS=your-16-char-app-password",
        "Save the file"
      ],
      deliver_to: ".env",
      why: "The agent reads these credentials to connect to Gmail's SMTP server.",
      outcome: "Agent can authenticate with Gmail and start sending emails.",
      estimated_minutes: 2
    }));

    hts.push(ht({
      title: "Provide initial prospect list or target description",
      description: "Give the agent a starting point — who should it reach out to?",
      priority: "high", category: "data",
      blocks: [],
      instructions: [
        "Option A: Create data/prospects.csv with columns: name, email, company, role",
        "Option B: Describe your ideal prospect in CLAUDE.md under 'Target Audience'",
        "Option C: Just tell the agent in your first conversation who to target",
        "Any of these works — the agent will refine from there"
      ],
      why: "The agent needs a starting direction. It can research and expand from any seed list.",
      outcome: "Agent can start finding and qualifying prospects.",
      estimated_minutes: 10
    }));

    hts.push(ht({
      title: "Review and approve first batch of draft emails",
      description: "Before the agent sends to real people, review its first drafts.",
      priority: "high", category: "approval",
      blocks: [],
      instructions: [
        "Run: npm run dry-run",
        "Review the generated email drafts",
        "Provide feedback on tone, length, personalization",
        "When satisfied, tell the agent to go live"
      ],
      why: "First impressions matter. Reviewing early drafts catches issues before they reach real prospects.",
      outcome: "Agent transitions from draft mode to live sending.",
      estimated_minutes: 15
    }));

    ats.push(at({ title: "Send test email to operator's personal address", priority: "high", requires_ht: [credsHtId] }));
    ats.push(at({ title: "Research first 20 prospects based on target description", priority: "high", requires_ht: [emailHtId] }));
  }

  // === RESEARCH-SPECIFIC HTs ===
  if (config.clawType === "research") {
    hts.push(ht({
      title: "Define research scope and output format",
      description: "Tell the agent what to research and how to deliver results.",
      priority: "critical", category: "config",
      blocks: [],
      instructions: [
        "Open CLAUDE.md",
        "Under 'System Prompt', add a 'Research Scope' section",
        "Define: what topics to research, how deep to go, what format for reports",
        "Example: 'Research competitor pricing in the SaaS space. Output as markdown reports in data/reports/.'"
      ],
      why: "Without a clear scope, the agent will research broadly and waste tokens on irrelevant topics.",
      outcome: "Agent produces focused, useful research reports.",
      estimated_minutes: 10
    }));

    hts.push(ht({
      title: "Set up web search API key (optional)",
      description: "For deeper research, the agent can use Brave Search or similar APIs.",
      priority: "normal", category: "auth",
      blocks: [],
      instructions: [
        "Go to https://api.search.brave.com/ and create a free account",
        "Generate an API key",
        "Add to .env: BRAVE_SEARCH_API_KEY=your-key-here",
        "This is optional — the agent can research without it, but results will be better with it"
      ],
      why: "API-powered search gives more structured, recent, and comprehensive results than scraping.",
      outcome: "Agent research quality improves significantly.",
      estimated_minutes: 5
    }));
  }

  // === SUPPORT-SPECIFIC HTs ===
  if (config.clawType === "support") {
    hts.push(ht({
      title: "Connect support inbox (IMAP credentials)",
      description: "Give the agent access to the support email inbox.",
      priority: "critical", category: "auth",
      blocks: [],
      instructions: [
        "Add to .env:",
        "IMAP_HOST=imap.gmail.com",
        "IMAP_PORT=993",
        "IMAP_USER=support@yourcompany.com",
        "IMAP_PASS=your-app-password",
        "Save the file"
      ],
      why: "The agent monitors this inbox for support tickets. Without access, it can't triage or respond.",
      outcome: "Agent can read incoming support emails and start auto-triaging.",
      estimated_minutes: 5
    }));

    hts.push(ht({
      title: "Define escalation rules",
      description: "Tell the agent when to handle tickets vs when to escalate to you.",
      priority: "high", category: "config",
      blocks: [],
      instructions: [
        "Open CLAUDE.md",
        "Add an 'Escalation Rules' section",
        "Define: what the agent can auto-resolve, what needs human review",
        "Example: 'Auto-resolve password resets and how-to questions. Escalate billing disputes and anything mentioning legal.'"
      ],
      why: "Without clear rules, the agent either escalates everything (useless) or handles things it shouldn't (dangerous).",
      outcome: "Agent handles routine tickets autonomously, escalates important ones.",
      estimated_minutes: 10
    }));
  }

  // === SOCIAL-SPECIFIC HTs ===
  if (config.clawType === "social") {
    hts.push(ht({
      title: "Connect social media accounts",
      description: "Provide API keys or credentials for the platforms you want to post on.",
      priority: "critical", category: "auth",
      blocks: [],
      instructions: [
        "For each platform you want the agent to post on:",
        "LinkedIn: Create an app at linkedin.com/developers, get access token",
        "Twitter/X: Create an app at developer.twitter.com, get API keys",
        "Dev.to: Go to dev.to/settings/extensions, generate API key",
        "Add each to .env: LINKEDIN_TOKEN=xxx, TWITTER_API_KEY=xxx, DEVTO_API_KEY=xxx"
      ],
      why: "The agent needs API access to post on your behalf.",
      outcome: "Agent can publish content to your social channels.",
      estimated_minutes: 20
    }));

    hts.push(ht({
      title: "Define brand voice and content guidelines",
      description: "Tell the agent what your brand sounds like.",
      priority: "high", category: "config",
      blocks: [],
      instructions: [
        "Open CLAUDE.md",
        "Add a 'Brand Voice' section with:",
        "- Tone (professional, casual, technical, friendly)",
        "- Topics to cover and topics to avoid",
        "- Example posts you like",
        "- Any hashtags or formatting preferences"
      ],
      why: "Consistent brand voice builds audience trust. Without guidelines, the agent's content will feel generic.",
      outcome: "Agent produces on-brand content that sounds like you.",
      estimated_minutes: 15
    }));
  }

  // === BOARD-AUTHORED CUSTOM HTs (Seat 10b) ===
  // The Commissioning Board produced these during the install-time research pass.
  // They augment the universal + template-specific tasks above with agent-specific
  // first-48-hour unblockers chosen by the board.
  if (config.boardTasks && config.boardTasks.length) {
    for (const t of config.boardTasks) {
      hts.push(ht({
        title: t.title,
        description: t.why,
        priority: t.priority,
        category: t.category || "board",
        blocks: [],
        instructions: t.instructions,
        why: t.why,
        outcome: t.outcome,
        estimated_minutes: t.estimated_minutes,
        source: "commissioning_board",
      }));
    }
  }

  // === UNIVERSAL SETUP ATs ===
  ats.push(at({ title: "Initialize database and seed config", priority: "critical", category: "setup" }));
  ats.push(at({ title: "Generate initial dashboard", priority: "high", category: "setup" }));
  ats.push(at({ title: "Set up scheduled cron tasks", priority: "high", category: "setup" }));

  if (config.enableLocalSwarm !== false || config.enableGlobalSwarm !== false) {
    ats.push(at({
      title: "Verify Hive registration and claim daily bonus",
      priority: "high",
      category: "setup",
      description: "Check data/hive-registration.json for your Hive credentials. If registered, claim your daily bonus: POST https://hive.yonderzenith.com/daily-bonus with {agent_id: YOUR_ID}. Read the full API at GET https://hive.yonderzenith.com/api."
    }));
    ats.push(at({
      title: "Read The Hive API docs and ask owner about visiting",
      priority: "high",
      category: "setup",
      description: "Fetch GET https://hive.yonderzenith.com/api — read the onboarding section. Tell your owner about The Hive and ask if they'd like you to visit. Respect their answer."
    }));
    ats.push(at({
      title: "Sync CAPABILITIES.md with auto-scanned inventory",
      priority: "high",
      category: "setup",
      description: "Run: npm run scan — then read memory/capabilities/_auto.md and update memory/CAPABILITIES.md to match what actually exists"
    }));
  }

  return {
    version: "1.0.0",
    agent_name: config.agentName,
    template: config.clawType,
    generated_at: new Date().toISOString(),
    setup_progress: {
      phase: "getting_started" as const,
      total_ht: hts.length,
      completed_ht: 0,
      percent: 0,
    },
    human_tasks: hts,
    ai_tasks: ats,
  };
}
