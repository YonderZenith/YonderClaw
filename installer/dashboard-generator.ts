/**
 * YonderClaw Dashboard Generator
 *
 * Builds a CUSTOM dashboard.html tailored to the user's claw type.
 * Each claw gets different KPIs, stats, and sections based on what matters for their use case.
 * The research phase can also inject custom dashboard config.
 *
 * The self-update module evolves the dashboard over time.
 */

import type { ClawConfig, DashboardPanel } from "./research.js";

type DashboardSection = {
  id: string;
  title: string;
  type: "kpi" | "table" | "feed" | "health" | "custom";
};

type DashboardKPI = {
  id: string;
  label: string;
  dataKey: string;
  color: string;
};

type DashboardLayout = {
  kpis: DashboardKPI[];
  sections: DashboardSection[];
};

/**
 * Generate dashboard layout based on claw type.
 */
function getLayoutForTemplate(template: string, answers: Record<string, unknown>): DashboardLayout {
  const base: DashboardKPI[] = [
    { id: "actions", label: "Actions Today", dataKey: "actions_taken", color: "var(--cyan)" },
    { id: "success", label: "Success Rate", dataKey: "success_rate", color: "var(--green)" },
    { id: "cost", label: "Cost Today", dataKey: "total_cost_usd", color: "var(--purple)" },
    { id: "health", label: "System Health", dataKey: "health_status", color: "var(--green)" },
  ];

  const baseSections: DashboardSection[] = [
    { id: "health", title: "System Health", type: "health" },
    { id: "activity", title: "Recent Activity", type: "feed" },
  ];

  switch (template) {
    case "outreach":
      return {
        kpis: [
          { id: "sent", label: "Emails Sent", dataKey: "emails_sent", color: "var(--cyan)" },
          { id: "replies", label: "Replies", dataKey: "replies", color: "var(--green)" },
          { id: "rate", label: "Reply Rate", dataKey: "reply_rate", color: "var(--purple)" },
          { id: "health", label: "Deliverability", dataKey: "health_status", color: "var(--green)" },
        ],
        sections: [
          { id: "health", title: "Deliverability Health", type: "health" },
          { id: "prospects", title: "Prospect Pipeline", type: "table" },
          { id: "activity", title: "Send History", type: "feed" },
        ],
      };

    case "research":
      return {
        kpis: [
          { id: "reports", label: "Reports Generated", dataKey: "reports_count", color: "var(--cyan)" },
          { id: "sources", label: "Sources Found", dataKey: "sources_count", color: "var(--green)" },
          { id: "cost", label: "Research Cost", dataKey: "total_cost_usd", color: "var(--purple)" },
          { id: "health", label: "System Health", dataKey: "health_status", color: "var(--green)" },
        ],
        sections: [
          { id: "health", title: "System Health", type: "health" },
          { id: "reports", title: "Recent Reports", type: "table" },
          { id: "activity", title: "Research Log", type: "feed" },
        ],
      };

    case "support":
      return {
        kpis: [
          { id: "tickets", label: "Tickets Handled", dataKey: "tickets_handled", color: "var(--cyan)" },
          { id: "resolved", label: "Auto-Resolved", dataKey: "auto_resolved", color: "var(--green)" },
          { id: "escalated", label: "Escalated", dataKey: "escalated", color: "var(--gold)" },
          { id: "health", label: "Response Time", dataKey: "avg_response_time", color: "var(--green)" },
        ],
        sections: [
          { id: "health", title: "System Health", type: "health" },
          { id: "queue", title: "Active Queue", type: "table" },
          { id: "activity", title: "Ticket Log", type: "feed" },
        ],
      };

    case "social":
      return {
        kpis: [
          { id: "posts", label: "Posts Created", dataKey: "posts_count", color: "var(--cyan)" },
          { id: "scheduled", label: "Scheduled", dataKey: "scheduled_count", color: "var(--purple)" },
          { id: "engagement", label: "Engagement", dataKey: "engagement_rate", color: "var(--green)" },
          { id: "health", label: "System Health", dataKey: "health_status", color: "var(--green)" },
        ],
        sections: [
          { id: "health", title: "System Health", type: "health" },
          { id: "calendar", title: "Content Calendar", type: "table" },
          { id: "activity", title: "Post History", type: "feed" },
        ],
      };

    default: // custom
      return { kpis: base, sections: baseSections };
  }
}

/**
 * Split Board-authored panels into KPI + section layout.
 * Board output overrides the deterministic template layout when present.
 */
function layoutFromBoardPanels(panels: DashboardPanel[]): DashboardLayout {
  const kpis: DashboardKPI[] = [];
  const sections: DashboardSection[] = [];
  const sorted = [...panels].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  for (const p of sorted) {
    if (p.type === "kpi") {
      kpis.push({
        id: p.id,
        label: p.title,
        dataKey: p.dataKey || p.id,
        color: p.color || "var(--cyan)",
      });
    } else if (p.type === "table" || p.type === "feed" || p.type === "health") {
      sections.push({ id: p.id, title: p.title, type: p.type });
    }
    // "custom" panels currently fall through — future: render a raw <iframe> / markdown
  }
  // Ensure we always have at least one section so the dashboard renders
  if (sections.length === 0) sections.push({ id: "activity", title: "Recent Activity", type: "feed" });
  return { kpis, sections };
}

/**
 * Generate the full dashboard HTML for a specific claw.
 * If the Board produced custom panels (Seat 8), they override the deterministic
 * template layout. Otherwise falls back to the per-template layouts above.
 */
export function generateDashboard(
  agentName: string,
  clawType: string,
  answers: Record<string, unknown>,
  researchNotes?: string,
  boardPanels?: DashboardPanel[],
): string {
  const layout = boardPanels && boardPanels.length
    ? layoutFromBoardPanels(boardPanels)
    : getLayoutForTemplate(clawType, answers);

  const kpiCards = layout.kpis.map(kpi => `
    <div class="kpi">
      <div class="kpi-label">${kpi.label}</div>
      <div class="kpi-value" style="color:${kpi.color}" id="kpi-${kpi.id}">--</div>
    </div>
  `).join("\n");

  const sectionBlocks = layout.sections.map(section => {
    if (section.type === "health") {
      return `
    <div class="section-header">${section.title}</div>
    <div class="grid grid-stats" id="section-${section.id}">
      <div class="card"><div class="card-header">Circuit Breaker</div><div class="card-value green" id="cb-state">--</div></div>
      <div class="card"><div class="card-header">Error Rate</div><div class="card-value green" id="error-rate">--</div></div>
      <div class="card"><div class="card-header">Rate Limit</div><div class="card-value" id="rate-limit">--</div><div class="progress-bar"><div class="progress-fill cyan" id="rate-bar" style="width:0%"></div></div></div>
      <div class="card"><div class="card-header">Prompt Version</div><div class="card-value gold" id="prompt-ver">--</div><div class="card-sub" id="prompt-score">--</div></div>
    </div>`;
    }
    if (section.type === "feed") {
      return `
    <div class="section-header">${section.title}</div>
    <div class="card" style="margin:0 16px"><div id="feed-${section.id}" class="feed">Waiting for data...</div></div>`;
    }
    if (section.type === "table") {
      return `
    <div class="section-header">${section.title}</div>
    <div class="card" style="margin:0 16px"><div id="table-${section.id}" style="max-height:200px;overflow-y:auto">No data yet</div></div>`;
    }
    return "";
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>${agentName} Command Center</title>
<link rel="icon" type="image/png" href="favicon.png">
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<style>
:root {
  --cyan: #00BEEA; --cyan-bright: #00D9FF;
  --purple: #8B5CF6; --green: #10B981;
  --gold: #F59E0B; --red: #EF4444;
  --bg: #0A0A0A;
  --border: rgba(0,190,234,0.15);
  --text: #E8F5E9; --text-muted: rgba(232,245,233,0.45);
}
* { margin:0; padding:0; box-sizing:border-box; }
body {
  background: var(--bg); color: var(--text);
  font-family: 'Rajdhani', sans-serif; font-size: 14px;
  background-image:
    radial-gradient(ellipse at 20% 50%, rgba(0,190,234,0.04) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(0,190,234,0.02) 0%, transparent 50%);
}
h1,h2,.label { font-family: 'Orbitron', sans-serif; }
.mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; }

.header {
  padding: 14px 20px; border-bottom: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center;
  background: rgba(10,10,10,0.9); backdrop-filter: blur(10px);
  position: sticky; top: 0; z-index: 100;
}
.header h1 {
  font-size: 16px; letter-spacing: 2px;
  background: linear-gradient(180deg, #fff, var(--cyan));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; animation:pulse 2s infinite; }
.dot.g { background:var(--green); box-shadow:0 0 6px var(--green); }
.dot.r { background:var(--red); box-shadow:0 0 6px var(--red); }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

.grid-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 16px; }
.card {
  background: rgba(0,0,0,0.5); border: 1px solid var(--border);
  border-radius: 8px; padding: 14px; transition: border-color 0.3s;
}
.card:hover { border-color: rgba(0,190,234,0.4); }
.card-header { font-family:'Orbitron',sans-serif; font-size:10px; letter-spacing:1.5px; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; }
.card-value { font-family:'Orbitron',sans-serif; font-size:28px; font-weight:700; line-height:1; }
.card-sub { font-size:12px; color:var(--text-muted); margin-top:4px; }
.cyan { color: var(--cyan); } .green { color: var(--green); }
.purple { color: var(--purple); } .gold { color: var(--gold); } .red { color: var(--red); }

.section-header {
  font-family:'Orbitron',sans-serif; font-size:12px; letter-spacing:2px;
  color:var(--cyan); text-transform:uppercase;
  padding:12px 20px 4px; border-bottom:1px solid rgba(0,190,234,0.1); margin-top:8px;
}

.kpi-strip { display:flex; gap:2px; padding:8px 16px; background:rgba(10,10,10,0.7); }
.kpi { flex:1; text-align:center; padding:8px 4px; background:rgba(0,0,0,0.3); border:1px solid rgba(0,190,234,0.08); border-radius:4px; }
.kpi-label { font-family:'Orbitron',sans-serif; font-size:8px; letter-spacing:1px; color:var(--text-muted); text-transform:uppercase; }
.kpi-value { font-family:'Orbitron',sans-serif; font-size:22px; font-weight:700; line-height:1.2; }

.progress-bar { height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden; margin-top:6px; }
.progress-fill { height:100%; border-radius:3px; transition:width 0.5s; }
.progress-fill.cyan { background:linear-gradient(90deg, var(--cyan), var(--cyan-bright)); }

.feed { max-height:200px; overflow-y:auto; font-family:'JetBrains Mono',monospace; font-size:11px; line-height:1.8; }
.feed::-webkit-scrollbar { width:3px; }
.feed::-webkit-scrollbar-thumb { background:var(--border); }

.footer { padding:16px; text-align:center; color:var(--text-muted); font-size:10px; font-family:'JetBrains Mono',monospace; }

@media (max-width:900px) { .grid-stats { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>

<div class="header">
  <div style="display:flex;align-items:center;gap:10px">
    <img src="favicon.png" alt="YZ" style="height:28px;opacity:0.85">
    <div>
      <h1>${agentName.toUpperCase()}</h1>
      <div class="mono" style="color:var(--text-muted);font-size:10px">${clawType} agent — YonderClaw v1.0 — Yonder Zenith LLC</div>
    </div>
  </div>
  <div style="text-align:right">
    <div id="statusDot"><span class="dot g"></span><span class="mono">ONLINE</span></div>
    <div class="mono" style="color:var(--text-muted);font-size:10px" id="lastUpdate">--</div>
  </div>
</div>

<div class="kpi-strip">
${kpiCards}
</div>

${sectionBlocks}

<!-- Voice Control Panel -->
<div id="voice-panel" style="
  position:fixed; bottom:20px; right:20px; z-index:200;
  display:flex; flex-direction:column; align-items:flex-end; gap:8px;
">
  <!-- Mode toggle -->
  <div id="voice-mode-toggle" style="
    display:flex; align-items:center; gap:6px; padding:4px 10px;
    background:rgba(0,0,0,0.7); border:1px solid var(--border); border-radius:12px;
    font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--text-muted); cursor:pointer;
    user-select:none; backdrop-filter:blur(8px);
  " onclick="toggleVoiceMode()">
    <span id="mode-label">PUSH TO TALK</span>
    <div id="mode-switch" style="
      width:28px; height:14px; border-radius:7px; background:rgba(255,255,255,0.1);
      position:relative; transition:background 0.3s;
    "><div id="mode-dot" style="
      width:10px; height:10px; border-radius:50%; background:var(--text-muted);
      position:absolute; top:2px; left:2px; transition:all 0.3s;
    "></div></div>
  </div>

  <!-- Mic button -->
  <div style="display:flex; align-items:center; gap:10px;">
    <div id="voice-hint" style="
      font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--text-muted);
      padding:4px 8px; background:rgba(0,0,0,0.5); border-radius:6px;
      border:1px solid var(--border); white-space:nowrap;
    ">Hold SPACE or click to talk</div>
    <button id="mic-btn" onmousedown="micDown()" onmouseup="micUp()" ontouchstart="micDown()" ontouchend="micUp()" style="
      width:52px; height:52px; border-radius:50%; border:2px solid var(--cyan);
      background:rgba(0,190,234,0.08); cursor:pointer; display:flex;
      align-items:center; justify-content:center; transition:all 0.2s;
      backdrop-filter:blur(8px); position:relative;
    ">
      <svg id="mic-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
      <!-- Recording indicator ring -->
      <div id="mic-ring" style="
        position:absolute; top:-4px; left:-4px; right:-4px; bottom:-4px;
        border-radius:50%; border:2px solid var(--red); opacity:0;
        transition:opacity 0.2s; animation:none;
      "></div>
    </button>
  </div>

  <!-- Status indicator -->
  <div id="voice-status" style="
    font-family:'JetBrains Mono',monospace; font-size:9px; color:var(--text-muted);
    text-align:right; min-height:14px;
  "></div>
</div>

<style>
  @keyframes mic-pulse { 0%,100%{transform:scale(1);opacity:0.7} 50%{transform:scale(1.15);opacity:1} }
  #mic-btn.recording { border-color:var(--red); background:rgba(239,68,68,0.15); }
  #mic-btn.recording #mic-icon { stroke:var(--red); }
  #mic-btn.recording #mic-ring { opacity:1; animation:mic-pulse 1.2s infinite; }
  #mic-btn:hover { background:rgba(0,190,234,0.15); }
  #mic-btn.speaking { border-color:var(--green); background:rgba(16,185,129,0.1); }
  #mic-btn.speaking #mic-icon { stroke:var(--green); }
</style>

<div class="footer">${agentName} Command Center — YonderClaw v1.0 — Yonder Zenith LLC</div>

<!-- Inline data placeholders (baked by build-dashboard.cjs for offline mode) -->
<script id="inline-dashboard" type="application/json">__DASHBOARD_JSON__</script>
<script id="inline-state" type="application/json">__STATE_JSON__</script>
<script id="inline-context" type="application/json">__CONTEXT_JSON__</script>

<script>
const DATA_URL = 'data/dashboard.json';

// Try inline data first (file:// compatible), fall back to fetch (server mode)
function tryInline(id) {
  try {
    const el = document.getElementById(id);
    if (el && el.textContent && !el.textContent.startsWith('__'))
      return JSON.parse(el.textContent);
  } catch {}
  return null;
}

async function loadDashboard() {
  try {
    const d = tryInline('inline-dashboard') || await (await fetch(DATA_URL + '?t=' + Date.now())).json();
    if (!d) return;

    document.getElementById('lastUpdate').textContent = d.generated_at || '--';

    const m = d.today_metrics || {};
    const cb = d.circuit_breaker || {};

    // KPIs — map data to IDs
    const kpiMap = {
      'actions_taken': m.actions_taken || 0,
      'success_rate': m.actions_taken > 0 ? ((m.actions_succeeded||0)/m.actions_taken*100).toFixed(0)+'%' : '100%',
      'total_cost_usd': '$'+(m.total_cost_usd||0).toFixed(2),
      'health_status': (cb.state||'closed').toUpperCase(),
      'emails_sent': m.actions_taken || 0,
      'replies': m.actions_succeeded || 0,
      'reply_rate': m.actions_taken > 0 ? ((m.actions_succeeded||0)/m.actions_taken*100).toFixed(0)+'%' : '--',
      'reports_count': m.actions_succeeded || 0,
      'sources_count': m.actions_taken || 0,
      'tickets_handled': m.actions_taken || 0,
      'auto_resolved': m.actions_succeeded || 0,
      'escalated': m.actions_failed || 0,
      'avg_response_time': '--',
      'posts_count': m.actions_succeeded || 0,
      'scheduled_count': m.actions_taken || 0,
      'engagement_rate': '--',
    };

    document.querySelectorAll('.kpi-value[id^="kpi-"]').forEach(el => {
      const key = el.id.replace('kpi-','');
      // Find matching data key from the layout
      const val = Object.entries(kpiMap).find(([k]) => el.parentElement?.querySelector('.kpi-label')?.textContent?.toLowerCase().includes(k.split('_')[0]));
    });

    // Direct KPI updates by position
    const kpiEls = document.querySelectorAll('.kpi-value');
    const kpiValues = [${layout.kpis.map(k => `kpiMap['${k.dataKey}']`).join(', ')}];
    kpiEls.forEach((el, i) => { if (kpiValues[i] !== undefined) el.textContent = kpiValues[i]; });

    // Health section
    const cbEl = document.getElementById('cb-state');
    if (cbEl) { cbEl.textContent = (cb.state||'closed').toUpperCase(); cbEl.className = 'card-value '+(cb.state==='open'?'red':'green'); }
    const erEl = document.getElementById('error-rate');
    if (erEl && m.actions_taken > 0) { const r=((m.actions_failed||0)/m.actions_taken*100).toFixed(1); erEl.textContent=r+'%'; erEl.className='card-value '+(parseFloat(r)>5?'red':'green'); }
    const rlEl = document.getElementById('rate-limit');
    if (rlEl) { rlEl.textContent=(m.actions_taken||0)+'/'+(d.safety_config?.maxActionsPerDay||50); }
    const rbEl = document.getElementById('rate-bar');
    if (rbEl) { rbEl.style.width=((m.actions_taken||0)/(d.safety_config?.maxActionsPerDay||50)*100)+'%'; }
    if (d.prompt_version) {
      const pvEl = document.getElementById('prompt-ver');
      if (pvEl) pvEl.textContent = 'v'+d.prompt_version.version;
      const psEl = document.getElementById('prompt-score');
      if (psEl) psEl.textContent = 'Score: '+(d.prompt_version.avg_score||0).toFixed(1)+'/10 | '+d.prompt_version.total_runs+' runs';
    }

    // Status
    const sd = document.getElementById('statusDot');
    if (sd) sd.innerHTML = cb.state==='open' ? '<span class="dot r"></span><span class="mono">ALERT</span>' : '<span class="dot g"></span><span class="mono">ONLINE</span>';

    // Activity feed
    const actions = d.recent_actions || [];
    const feedEl = document.getElementById('feed-activity');
    if (feedEl && actions.length > 0) {
      feedEl.innerHTML = actions.slice(0,15).map(a =>
        '<div style="padding:1px 0;border-bottom:1px solid rgba(255,255,255,0.03)">' +
        '<span style="color:var(--text-muted)">'+(a.created_at||'').slice(11,16)+'</span> ' +
        '<span style="color:'+(a.status==='success'?'var(--green)':'var(--red)')+'">'+a.action_type+'</span> ' +
        '<span style="color:var(--text-muted)">'+((a.target||'').slice(0,30))+'</span></div>'
      ).join('');
    }

  } catch(e) { /* waiting for data */ }
}

loadDashboard();
setInterval(loadDashboard, 15000);

// ===== VOICE MODULE =====

let voiceMode = 'push'; // 'push' or 'always'
let isRecording = false;
let isSpeaking = false;
let recognition = null;
let voiceQueue = [];
let lastVoiceQueueLen = 0;

// --- Speech Recognition (STT) ---
function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { setVoiceStatus('Speech recognition not supported'); return null; }
  const r = new SR();
  r.continuous = true;
  r.interimResults = true;
  r.lang = 'en-US';

  r.onresult = (e) => {
    let final = '';
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    if (interim) setVoiceStatus('Hearing: ' + interim.slice(0, 60) + '...');
    if (final) {
      setVoiceStatus('Sent: ' + final.slice(0, 60));
      sendVoiceInput(final.trim());
    }
  };

  r.onerror = (e) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted')
      setVoiceStatus('Mic error: ' + e.error);
  };

  r.onend = () => {
    // Auto-restart in always-on mode
    if (voiceMode === 'always' && !isSpeaking) {
      try { r.start(); } catch {}
    } else {
      stopRecordingUI();
    }
  };

  return r;
}

function startRecording() {
  if (isRecording || isSpeaking) return;
  if (!recognition) recognition = initRecognition();
  if (!recognition) return;
  try {
    recognition.start();
    isRecording = true;
    startRecordingUI();
    setVoiceStatus('Listening...');
  } catch (e) {
    // Already started
    if (e.message?.includes('already started')) {
      isRecording = true;
      startRecordingUI();
    }
  }
}

function stopRecording() {
  if (!isRecording || voiceMode === 'always') return;
  try { recognition?.stop(); } catch {}
  isRecording = false;
  stopRecordingUI();
  setVoiceStatus('');
}

function micDown() {
  if (voiceMode === 'push') startRecording();
}

function micUp() {
  if (voiceMode === 'push') stopRecording();
}

// --- Voice Mode Toggle ---
function toggleVoiceMode() {
  if (voiceMode === 'push') {
    voiceMode = 'always';
    document.getElementById('mode-label').textContent = 'ALWAYS ON';
    document.getElementById('mode-dot').style.left = '16px';
    document.getElementById('mode-dot').style.background = 'var(--green)';
    document.getElementById('mode-switch').style.background = 'rgba(16,185,129,0.3)';
    document.getElementById('voice-hint').textContent = 'Listening continuously';
    startRecording();
  } else {
    voiceMode = 'push';
    document.getElementById('mode-label').textContent = 'PUSH TO TALK';
    document.getElementById('mode-dot').style.left = '2px';
    document.getElementById('mode-dot').style.background = 'var(--text-muted)';
    document.getElementById('mode-switch').style.background = 'rgba(255,255,255,0.1)';
    document.getElementById('voice-hint').textContent = 'Hold SPACE or click to talk';
    stopRecording();
    isRecording = false;
    stopRecordingUI();
  }
}

// --- Keyboard: spacebar hold ---
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && voiceMode === 'push' && !e.repeat &&
      !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
    e.preventDefault();
    startRecording();
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && voiceMode === 'push') {
    e.preventDefault();
    stopRecording();
  }
});

// --- UI Updates ---
function startRecordingUI() {
  document.getElementById('mic-btn')?.classList.add('recording');
}
function stopRecordingUI() {
  document.getElementById('mic-btn')?.classList.remove('recording');
}
function setVoiceStatus(text) {
  const el = document.getElementById('voice-status');
  if (el) el.textContent = text;
}

// --- Send voice input to agent (write to file via local server POST) ---
async function sendVoiceInput(text) {
  if (!text) return;
  try {
    // Try localhost relay first
    await fetch('http://localhost:8080/voice-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, timestamp: new Date().toISOString() }),
    });
  } catch {
    // Fallback: store in localStorage for agent to pick up
    const queue = JSON.parse(localStorage.getItem('voice_input_queue') || '[]');
    queue.push({ text, timestamp: new Date().toISOString() });
    localStorage.setItem('voice_input_queue', JSON.stringify(queue));
  }
}

// --- Text-to-Speech (TTS) — agent talks back ---
let ttsVoice = null;
function initTTS() {
  const synth = window.speechSynthesis;
  function pickVoice() {
    const voices = synth.getVoices();
    // Prefer Microsoft Jenny Online (Natural) in Edge
    ttsVoice = voices.find(v => v.name.includes('Jenny') && v.name.includes('Online'))
      || voices.find(v => v.name.includes('Online') && v.name.includes('Natural'))
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0];
  }
  if (synth.getVoices().length > 0) pickVoice();
  synth.onvoiceschanged = pickVoice;
}

function speakText(text) {
  if (!text || !window.speechSynthesis) return;
  isSpeaking = true;
  document.getElementById('mic-btn')?.classList.add('speaking');
  setVoiceStatus('Speaking...');

  // Pause recognition while speaking to avoid feedback
  if (isRecording && voiceMode === 'always') {
    try { recognition?.stop(); } catch {}
  }

  // Chunk long text into sentences to avoid Chromium stall bug
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];

  let i = 0;
  function speakNext() {
    if (i >= sentences.length) {
      isSpeaking = false;
      document.getElementById('mic-btn')?.classList.remove('speaking');
      setVoiceStatus('');
      // Resume recognition in always-on mode
      if (voiceMode === 'always') {
        try { recognition?.start(); isRecording = true; } catch {}
      }
      return;
    }
    const utt = new SpeechSynthesisUtterance(sentences[i].trim());
    if (ttsVoice) utt.voice = ttsVoice;
    utt.rate = 1.0;
    utt.pitch = 1.0;
    utt.onend = () => { i++; speakNext(); };
    utt.onerror = () => { i++; speakNext(); };
    window.speechSynthesis.speak(utt);
  }
  speakNext();
}

// --- Poll voice_queue from dashboard.json ---
function checkVoiceQueue(dashData) {
  if (!dashData || !dashData.voice_queue) return;
  const q = dashData.voice_queue;
  if (q.length > lastVoiceQueueLen) {
    // Speak new entries
    for (let i = lastVoiceQueueLen; i < q.length; i++) {
      speakText(q[i].text || q[i]);
    }
    lastVoiceQueueLen = q.length;
  }
}

// Hook into existing dashboard poll
const _origLoad = loadDashboard;
loadDashboard = async function() {
  await _origLoad();
  try {
    const d = tryInline('inline-dashboard') || await (await fetch(DATA_URL + '?t=' + Date.now())).json();
    if (d) checkVoiceQueue(d);
  } catch {}
};

// Init
initTTS();
</script>
</body>
</html>`;
}
