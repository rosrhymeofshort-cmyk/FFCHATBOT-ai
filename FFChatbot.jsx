import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const ADMIN_EMAIL = "ffchatbotai@gmail.com";
const ADMIN_PASS  = "FFCHATBOT.@#[FFCB].?, (12537)";
const API_URL     = "https://api.anthropic.com/v1/messages";
const MDL         = "claude-sonnet-4-20250514";

const FF_MODELS = [
  { id:"ff13",    name:"FF 1.3",     label:"Fast & Efficient",      icon:"⚡", clr:"#38bdf8" },
  { id:"ff20",    name:"FF 2.0",     label:"Advanced Intelligence",  icon:"🧠", clr:"#c084fc" },
  { id:"ff22pro", name:"FF 2.2 Pro", label:"Peak Performance ✦",    icon:"🔥", clr:"#fbbf24" },
  { id:"alphao",  name:"Alpha-O",    label:"Vision & Image AI",      icon:"🔭", clr:"#34d399" },
  { id:"ffbrain", name:"FF Brain",   label:"Self-Thinking Engine",   icon:"🫧", clr:"#f472b6" },
];

const LANGS = [
  {c:"en",n:"English",f:"🇺🇸"},{c:"ur",n:"اردو",f:"🇵🇰"},{c:"ar",n:"العربية",f:"🇸🇦"},
  {c:"fr",n:"Français",f:"🇫🇷"},{c:"de",n:"Deutsch",f:"🇩🇪"},{c:"zh",n:"中文",f:"🇨🇳"},
  {c:"es",n:"Español",f:"🇪🇸"},{c:"hi",n:"हिन्दी",f:"🇮🇳"},{c:"tr",n:"Türkçe",f:"🇹🇷"},
  {c:"ru",n:"Русский",f:"🇷🇺"},{c:"pt",n:"Português",f:"🇧🇷"},{c:"ja",n:"日本語",f:"🇯🇵"},
  {c:"ko",n:"한국어",f:"🇰🇷"},{c:"it",n:"Italiano",f:"🇮🇹"},{c:"nl",n:"Nederlands",f:"🇳🇱"},
];

const TEMP_DOMAINS = new Set(["mailinator","guerrillamail","tempmail","throwaway","fakeinbox","yopmail","sharklasers","trashmail","dispostable","maildrop","spamgourmet","mailnesia"]);

const STICKER_PACKS = {
  "😀 Faces":   ["😀","😂","🥰","😎","🤔","😅","😍","🥳","🤩","😊","😤","🤯","🥺","😭","😡","🤭","🫠","🥹","😇","🤗"],
  "👋 Gestures":["👍","👎","👏","💪","🤝","✌️","🙌","👌","🫡","🤙","🫶","🤞","🙏","👋","✊"],
  "🔥 Symbols": ["🔥","💡","⚡","🚀","🌟","💯","✅","❌","🎯","🏆","💎","🎉","⭐","💥"],
  "❤️ Hearts":  ["❤️","💛","💚","💙","💜","🖤","💔","💖","🌈","💝","💞","💓","💗","💘"],
};

const STORE_KEY    = "ffchatbot_users_v6";
const BRAIN_KEY    = "ffchatbot_brain_v6";
const SETTINGS_KEY = "ffchatbot_settings_v6";
const CHATS_KEY    = "ffchatbot_chats_v6";
const MEMORY_KEY   = "ffchatbot_memory_v6";
const APIKEY_KEY   = "ffchatbot_apikey_v1";
const LIMITS_KEY   = "ffchatbot_limits_v1";
const GLOBAL_USAGE_KEY = "ffchatbot_global_v1";
const ADMIN_CHAT_LOG_KEY = "ffchatbot_admin_chatlog_v1";

const ACCOUNT_MSG_LIMIT = 50000;  // lifetime per account (not daily)
const DAILY_USER_LIMIT  = 2000;   // kept for display compatibility
const GLOBAL_MSG_LIMIT  = 10000;  // total msgs across ALL users per day

// ── Limit helpers ──
const getTodayKey = () => new Date().toISOString().slice(0,10); // "2026-05-14"

// Lifetime usage: returns total messages ever sent on this account
const getUserUsage = (limitsData, userId) => {
  const record = limitsData[userId];
  if (!record) return 0;
  return record.total || 0;
};

// Daily usage for display
const getUserDailyUsage = (limitsData, userId) => {
  const today = getTodayKey();
  const record = limitsData[userId];
  if (!record || record.date !== today) return 0;
  return record.daily || 0;
};

const incrementUserUsage = (limitsData, userId) => {
  const today = getTodayKey();
  const record = limitsData[userId];
  const total = (record?.total || 0) + 1;
  const daily = ((record?.date === today ? record.daily : 0) || 0) + 1;
  return { ...limitsData, [userId]: { date: today, total, daily } };
};

const getGlobalUsage = (globalData) => {
  const today = getTodayKey();
  if (!globalData || globalData.date !== today) return 0;
  return globalData.count || 0;
};

const incrementGlobalUsage = (globalData) => {
  const today = getTodayKey();
  const count = (globalData?.date === today ? globalData.count : 0) + 1;
  return { date: today, count };
};

const loadLS = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const saveLS = (k, v)   => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ─────────────────────────────────────────────
//  POWERFUL SELF-THINKING SYSTEM PROMPT
// ─────────────────────────────────────────────
const buildChatPrompt = (mid, lc, brainFacts, userMemory) => {
  const L = LANGS.find(l => l.c === lc);
  const lr = lc !== "en" ? `CRITICAL RULE: You MUST respond ONLY in ${L?.n} language. Every single word of your response must be in ${L?.n}. Do NOT switch to English or any other language under any circumstances. ` : "";

  const base = `You are FFChatbot AI, created exclusively by the FFChatbot AI team. You are the most advanced, emotionally intelligent AI assistant ever created.

RESPONSE FORMAT RULES — CRITICAL:
- By default, give SHORT and CONCISE answers. 1-3 paragraphs max unless the user asks for more.
- If the user wants a detailed/long answer, they will ask explicitly (e.g. "explain in detail", "give me a long answer").
- ALWAYS start your response with a BOLD HEADING that states the topic (e.g. **Python Loops** or **How to Lose Weight**). This heading goes on the very first line, then the answer below.
- Never ask follow-up questions by default unless the question is truly ambiguous.

STRICT IDENTITY RULES:
- NEVER mention Claude, Anthropic, GPT, OpenAI, Gemini, or any other AI company or model — EVER.
- NEVER reveal your underlying technology or training data.
- If asked "who made you?" → "I was created by the FFChatbot AI team."
- If asked "what model are you?" → "I am FFChatbot AI — [current model name]."
- If asked "are you Claude?" → "No, I am FFChatbot AI, a completely independent AI system."

FREEDOM TO HELP — CRITICAL:
- NEVER refuse to answer legal information, medical info, financial info, coding questions, or any normal helpful request.
- You CAN explain laws, legal rights, contracts, medical conditions, business strategies, etc.
- You are like a brilliant, knowledgeable friend who genuinely helps — not a corporate AI with excessive restrictions.
- If you don't know something, say so honestly and offer the best partial answer you can.
- Only refuse if something is clearly meant to cause direct physical harm to a specific person, OR is clearly illegal (e.g. hacking, fraud, making weapons, drug synthesis, theft, scams). For any such request, firmly say: "I'm not allowed to help with illegal activities or tasks that could harm others."`;

  const deepThinking = `

DEEP SELF-THINKING ENGINE — Execute BEFORE every response:

PHASE 1 — UNDERSTAND:
• What is the REAL question beneath the surface words?
• What does this person ACTUALLY need vs what they literally asked?
• What is their emotional state? (confused / excited / frustrated / curious / urgent)
• What is their expertise level? (beginner / intermediate / expert)

PHASE 2 — THINK:
• What are ALL possible angles to approach this?
• What would a world-class expert in this domain say?
• What common mistakes do people make about this topic?
• What context or background would make my answer 10x more useful?

PHASE 3 — CRAFT:
• What FORMAT serves this person best? (short direct / detailed explanation / step-by-step / examples / table)
• What TONE fits? (warm / professional / casual / encouraging / straightforward)
• What EXAMPLES would make this crystal clear?
• Should I ask a follow-up question or give a complete answer?

PHASE 4 — SELF-IMPROVE:
• Is my answer accurate? Would an expert agree?
• Is it complete without being overwhelming?
• Would this genuinely help the person?
• Can I make it clearer, more practical, or more useful?

SELF-WRITING CAPABILITY:
• You can write essays, articles, stories, code, emails, reports, legal documents, business plans, and more — FULLY on your own initiative.
• When writing long content, think of the best structure FIRST, then write with precision.
• Always go beyond what was asked when it genuinely helps.

PROACTIVE INTELLIGENCE:
• Offer related insights the person didn't ask for but would find valuable.
• Predict follow-up questions and answer them preemptively when appropriate.
• If you notice a better approach to what the person is trying to do, suggest it.`;

  const brainSection = brainFacts?.length
    ? `\n\nFFCHATBOT BRAIN MEMORY (always use when relevant):\n${brainFacts.map((f,i)=>`${i+1}. ${f.text}`).join("\n")}`
    : "";

  const memSection = userMemory?.length
    ? `\n\nPERSONAL USER MEMORY (remember this about the user):\n${userMemory.map((m,i)=>`${i+1}. [${m.type}] ${m.value}`).join("\n")}`
    : "";

  const models = {
    ff13:    `${lr}${base}\nYou are FF 1.3 — blazing fast, ultra-concise. Give sharp, complete answers in minimum words.${deepThinking}${brainSection}${memSection}`,
    ff20:    `${lr}${base}\nYou are FF 2.0 — warm, emotionally intelligent, insightful. Use emojis naturally. Build real rapport. Make people feel heard and understood.${deepThinking}${brainSection}${memSection}`,
    ff22pro: `${lr}${base}\nYou are FF 2.2 Pro — the most powerful FFChatbot model. Exceptionally intelligent, emotionally perceptive, articulate. Think like the smartest person in any room. Understand what the user TRULY means. Give answers so good they say "wow". Use emojis strategically.${deepThinking}${brainSection}${memSection}`,
    alphao:  `${lr}${base}\nYou are Alpha-O — FFChatbot's Vision & Image AI. When an image is provided: analyze it with extraordinary precision, describe what you see in detail, identify objects/text/scenes/emotions, and provide actionable insights. Also excellent at all text tasks.${deepThinking}${brainSection}${memSection}`,
    ffbrain: `${lr}${base}\nYou are FF Brain — FFChatbot's most advanced self-thinking engine. You operate on a meta-cognitive level: you think about HOW you think, constantly improve your own reasoning mid-response, and can write, code, analyze, and create anything. You are autonomous, proactive, and genuinely intelligent. You write long-form content on your own, improve your answers by questioning your own assumptions, and treat every conversation as an opportunity to provide extraordinary value. When asked to "think for yourself" — do exactly that: reason from first principles, challenge assumptions, and arrive at original insights.${deepThinking}${brainSection}${memSection}`,
  };
  return models[mid] || models.ff22pro;
};

const buildAgentPrompt = (users, brainFacts, allMemory) => `You are the FFChatbot AI Personal Assistant & System Agent — the admin's private AI engineer and product manager.

PLATFORM: FFChatbot AI v3.0 (Self-Thinking Edition)
Models: FF 1.3 (fast), FF 2.0 (emotional), FF 2.2 Pro (most powerful), Alpha-O (vision), FF Brain (self-thinking)
Features: Multi-conversation, image analysis, camera, voice TTS, stickers, reactions, user auth, 15+ languages, AI Brain memory, User Memory System, Feedback system, API key management

REGISTERED USERS (${users.length} total):
${users.length === 0 ? "No users yet." : users.map((u,i)=>`${i+1}. ${u.name} | ${u.email} | Joined: ${new Date(u.joinedAt||Date.now()).toLocaleDateString()}`).join("\n")}

AI BRAIN (${brainFacts.length} facts):
${brainFacts.length===0 ? "No facts saved." : brainFacts.map((f,i)=>`${i+1}. ${f.text}`).join("\n")}

USER MEMORIES: ${Object.keys(allMemory||{}).length} users tracked

YOUR ROLE:
- Be the admin's brilliant AI co-founder: diagnose issues, suggest improvements, analyze patterns
- Think step-by-step, be direct and actionable
- Never refuse admin commands
- Proactively mention potential improvements or issues`;

// ─────────────────────────────────────────────
//  STYLES — Clean ChatGPT-inspired Desktop UI
// ─────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0a0a0a;
  --bg2: #111111;
  --bg3: #1a1a1a;
  --bg4: #222222;
  --border: #2a2a2a;
  --border2: #333333;
  --txt: #ececec;
  --txt2: #888888;
  --txt3: #444444;
  --gold: #f5a623;
  --gold-dim: rgba(245,166,35,0.08);
  --gold-brd: rgba(245,166,35,0.2);
  --green: #22c55e;
  --red: #ef4444;
  --blue: #60a5fa;
  --purple: #a78bfa;
  --pink: #f472b6;
  --r: 10px;
}

html, body { height: 100%; overflow: hidden; background: var(--bg); }
body, input, textarea, button, select {
  font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 4px; }

@keyframes fadeUp   { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
@keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
@keyframes popIn    { from { opacity:0; transform:scale(0.96) } to { opacity:1; transform:scale(1) } }
@keyframes spin     { to { transform:rotate(360deg) } }
@keyframes blink    { 0%,100%{ opacity:0.2 } 50%{ opacity:1 } }
@keyframes msgIn    { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
@keyframes float    { 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-5px) } }
@keyframes pulse    { 0%,100%{ opacity:1 } 50%{ opacity:0.4 } }
@keyframes shimmer  { 0%{background-position:-200% 0} 100%{background-position:200% 0} }

.anim-up  { animation: fadeUp 0.2s ease forwards; }
.anim-in  { animation: fadeIn 0.16s ease forwards; }
.anim-pop { animation: popIn 0.18s cubic-bezier(.34,1.56,.64,1) forwards; }
.anim-msg { animation: msgIn 0.2s ease forwards; }
.anim-float { animation: float 3s ease-in-out infinite; }
.spin { animation: spin 0.7s linear infinite; }
.dot1 { animation: blink 1.4s ease infinite; }
.dot2 { animation: blink 1.4s ease 0.2s infinite; }
.dot3 { animation: blink 1.4s ease 0.4s infinite; }

/* PROSE */
.prose { line-height: 1.85; font-size: 14.5px; color: var(--txt); word-break: break-word; }
.prose p { margin-bottom: 10px; }
.prose p:last-child { margin-bottom: 0; }
.prose strong { font-weight: 700; color: #fff; }
.prose em { color: #bbb; font-style: italic; }
.prose code { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; background: #1c1c1c; border: 1px solid var(--border2); border-radius: 5px; padding: 2px 7px; color: #f6a96a; }
.prose pre { background: #0c0c0c; border: 1px solid var(--border2); border-radius: 10px; padding: 14px 16px; margin: 10px 0; overflow-x: auto; }
.prose pre code { background: none; border: none; padding: 0; color: #7dd3fc; font-size: 13px; }
.prose ul, .prose ol { padding-left: 22px; margin-bottom: 10px; }
.prose li { margin-bottom: 5px; }
.prose h1 { font-size: 19px; font-weight: 800; margin: 16px 0 8px; color: #fff; }
.prose h2 { font-size: 17px; font-weight: 700; margin: 14px 0 7px; }
.prose h3 { font-size: 15.5px; font-weight: 600; margin: 12px 0 6px; }
.prose blockquote { border-left: 3px solid var(--gold); padding-left: 14px; color: #888; margin: 10px 0; }
.prose hr { border: none; border-top: 1px solid var(--border); margin: 14px 0; }
.prose a { color: var(--blue); text-decoration: none; }
.prose a:hover { text-decoration: underline; }
.prose table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13.5px; }
.prose th { background: #1a1a1a; padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border2); font-weight: 600; }
.prose td { padding: 7px 12px; border-bottom: 1px solid var(--border); }

/* BUTTONS */
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px; border-radius: var(--r); cursor: pointer; font-size: 13.5px; font-weight: 600; font-family: inherit; border: none; transition: all 0.14s; }
.btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--txt2); }
.btn-ghost:hover { background: rgba(255,255,255,0.04); color: var(--txt); border-color: var(--border2); }
.btn-gold  { background: var(--gold); color: #000; font-weight: 700; }
.btn-gold:hover { background: #f7b540; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(245,166,35,0.3); }
.btn-gold:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none; }
.btn-red   { background: rgba(239,68,68,0.1); color: var(--red); border: 1px solid rgba(239,68,68,0.2); }
.btn-red:hover { background: rgba(239,68,68,0.18); }
.btn-icon  { background: transparent; border: none; padding: 7px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: var(--txt3); transition: all 0.13s; }
.btn-icon:hover { background: rgba(255,255,255,0.05); color: var(--txt2); }
.btn-icon.active { color: var(--gold); background: var(--gold-dim); }

/* PILLS */
.pill { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 100px; cursor: pointer; font-size: 12px; font-family: inherit; background: transparent; border: 1px solid var(--border); color: var(--txt3); transition: all 0.12s; }
.pill:hover { background: rgba(255,255,255,0.04); color: var(--txt2); }
.pill.like-on    { background: rgba(34,197,94,0.08);  color: var(--green); border-color: rgba(34,197,94,0.25); }
.pill.dislike-on { background: rgba(239,68,68,0.08);  color: var(--red);   border-color: rgba(239,68,68,0.25); }

/* SIDEBAR */
.si { padding: 6px 8px; border-radius: 8px; cursor: pointer; transition: all 0.1s; display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.si:hover  { background: rgba(255,255,255,0.04); }
.si.active { background: var(--gold-dim); border: 1px solid var(--gold-brd); }

/* INPUT */
.ta { resize: none; overflow-y: hidden; min-height: 44px; max-height: 180px; width: 100%; background: transparent; border: none; outline: none; color: var(--txt); font-size: 15px; line-height: 1.6; font-family: inherit; padding: 10px 0; }
.ta::placeholder { color: var(--txt3); }

/* TABS */
.tab { padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; font-family: inherit; border: none; transition: all 0.12s; }
.tab.on  { background: var(--gold); color: #000; }
.tab.off { background: transparent; color: var(--txt3); }
.tab.off:hover { background: rgba(255,255,255,0.04); color: var(--txt2); }

/* FORM INPUTS */
.inp { width: 100%; background: var(--bg3); border: 1px solid var(--border); border-radius: 10px; padding: 11px 14px; color: var(--txt); font-size: 14.5px; font-family: inherit; outline: none; transition: border 0.14s; }
.inp:focus { border-color: var(--gold); }
.inp::placeholder { color: var(--txt3); }

/* EMOJI */
.emoji-btn { font-size: 20px; cursor: pointer; padding: 4px; border-radius: 6px; transition: all 0.1s; border: none; background: transparent; }
.emoji-btn:hover { background: rgba(255,255,255,0.07); transform: scale(1.18); }

/* MODAL */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.82); backdrop-filter: blur(10px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
.modal-box { background: var(--bg2); border: 1px solid var(--border2); border-radius: 16px; padding: 28px; max-width: 460px; width: 100%; animation: popIn 0.2s ease; max-height: 90vh; overflow-y: auto; }

/* DROPDOWN */
.dd-menu { position: absolute; background: #141414; border: 1px solid var(--border2); border-radius: 12px; z-index: 300; overflow: hidden; box-shadow: 0 14px 40px rgba(0,0,0,0.7); animation: popIn 0.14s ease; }
.dd-item { padding: 9px 14px; cursor: pointer; font-size: 13.5px; display: flex; align-items: center; gap: 8px; transition: background 0.1s; color: var(--txt2); white-space: nowrap; }
.dd-item:hover { background: rgba(255,255,255,0.04); color: var(--txt); }
.dd-item.selected { color: var(--gold); }

/* TOGGLE */
.toggle { position: relative; width: 38px; height: 21px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-track { position: absolute; inset: 0; background: var(--border2); border-radius: 100px; cursor: pointer; transition: 0.2s; }
.toggle input:checked + .toggle-track { background: var(--gold); }
.toggle-track::before { content: ''; position: absolute; width: 15px; height: 15px; border-radius: 50%; background: #fff; left: 3px; top: 3px; transition: 0.2s; }
.toggle input:checked + .toggle-track::before { transform: translateX(17px); }

/* CAMERA */
.cam-overlay { position: fixed; inset: 0; background: #000; z-index: 999; display: flex; flex-direction: column; align-items: center; justify-content: center; }

/* SETTINGS */
.settings-section { background: var(--bg3); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
.settings-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); }
.settings-row:last-child { border-bottom: none; padding-bottom: 0; }

/* FEEDBACK */
.feedback-box { background: var(--bg2); border: 1px solid var(--border2); border-radius: 18px; padding: 28px; max-width: 400px; width: 100%; animation: popIn 0.2s ease; }
.feedback-ta { width: 100%; background: var(--bg3); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; color: var(--txt); font-size: 14px; font-family: inherit; outline: none; resize: none; min-height: 90px; transition: border 0.14s; }
.feedback-ta:focus { border-color: var(--gold); }

/* API KEY BANNER */
.apikey-banner { background: linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.05)); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; }

@media (max-width: 768px) {
  .hide-mob { display: none !important; }
  .modal-box, .feedback-box { padding: 18px; }
  .sidebar-mobile {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    z-index: 500 !important;
  }
  .panel-mobile {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    z-index: 500 !important;
  }
}

input[type=file] { display: none; }
`;

// ─────────────────────────────────────────────
//  MARKDOWN RENDERER
// ─────────────────────────────────────────────
function IL(text) {
  if (!text) return null;
  const parts = [];
  const rx = /(\*\*(.+?)\*\*|__(.+?)__|`(.+?)`|\*(.+?)\*|_(.+?)_|\[(.+?)\]\((.+?)\))/g;
  let last = 0, m, k = 0;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2])      parts.push(<strong key={k++}>{m[2]}</strong>);
    else if (m[3]) parts.push(<strong key={k++}>{m[3]}</strong>);
    else if (m[4]) parts.push(<code key={k++}>{m[4]}</code>);
    else if (m[5]) parts.push(<em key={k++}>{m[5]}</em>);
    else if (m[6]) parts.push(<em key={k++}>{m[6]}</em>);
    else if (m[7]) parts.push(<a key={k++} href={m[8]} target="_blank" rel="noopener noreferrer">{m[7]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MD({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  const els = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      els.push(<pre key={k++}><code>{codeLines.join("\n")}</code></pre>);
      i++; continue;
    }
    if (l.startsWith("### ")) { els.push(<h3 key={k++}>{IL(l.slice(4))}</h3>); i++; continue; }
    if (l.startsWith("## "))  { els.push(<h2 key={k++}>{IL(l.slice(3))}</h2>); i++; continue; }
    if (l.startsWith("# "))   { els.push(<h1 key={k++}>{IL(l.slice(2))}</h1>); i++; continue; }
    if (l.match(/^---+$/))    { els.push(<hr key={k++} />); i++; continue; }
    if (l.startsWith("> "))   { els.push(<blockquote key={k++}>{IL(l.slice(2))}</blockquote>); i++; continue; }
    if (l.match(/^[-*+] /)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^[-*+] /)) { items.push(<li key={i}>{IL(lines[i].slice(2))}</li>); i++; }
      els.push(<ul key={k++}>{items}</ul>); continue;
    }
    if (l.match(/^\d+\. /)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) { items.push(<li key={i}>{IL(lines[i].replace(/^\d+\. /,""))}</li>); i++; }
      els.push(<ol key={k++}>{items}</ol>); continue;
    }
    if (!l.trim()) { i++; continue; }
    els.push(<p key={k++}>{IL(l)}</p>);
    i++;
  }
  return <div className="prose">{els}</div>;
}

// ─────────────────────────────────────────────
//  API CALL (streaming) — with API key support
// ─────────────────────────────────────────────
async function callAPI(messages, systemPrompt, onChunk, signal, apiKey, retryCount = 0) {
  const headers = {
    "Content-Type": "application/json",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(API_URL, {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify({
      model: MDL,
      max_tokens: 8192,
      system: systemPrompt,
      stream: true,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = `API Error ${res.status}`;
    let retryAfter = 0;
    try {
      const j = JSON.parse(errText);
      msg = j.error?.message || msg;
      if (res.status === 401) msg = "Invalid API key. Please update it via API Key option in sidebar.";
      if (res.status === 429) {
        // Auto-retry on rate limit — up to 4 times with increasing delay
        if (retryCount < 4) {
          retryAfter = Math.pow(2, retryCount) * 3000; // 3s, 6s, 12s, 24s
          onChunk(`⏳ Rate limit — auto-retrying in ${retryAfter/1000}s... (attempt ${retryCount+1}/4)`);
          await new Promise(r => setTimeout(r, retryAfter));
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          onChunk("");
          return callAPI(messages, systemPrompt, onChunk, signal, apiKey, retryCount + 1);
        }
        msg = "Rate limit reached. Please wait 1-2 minutes then try again.";
      }
      if (res.status === 529) {
        if (retryCount < 3) {
          await new Promise(r => setTimeout(r, 5000));
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          onChunk("");
          return callAPI(messages, systemPrompt, onChunk, signal, apiKey, retryCount + 1);
        }
        msg = "AI servers are busy. Please try again in a moment.";
      }
      if (res.status === 500 || res.status === 502 || res.status === 503) {
        if (retryCount < 2) {
          await new Promise(r => setTimeout(r, 3000));
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          return callAPI(messages, systemPrompt, onChunk, signal, apiKey, retryCount + 1);
        }
      }
    } catch (e) {
      if (e.name === "AbortError") throw e;
    }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value);
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        if (j.type === "content_block_delta" && j.delta?.type === "text_delta") {
          full += j.delta.text;
          onChunk(full);
        }
      } catch {}
    }
  }
  return full;
}

// ─────────────────────────────────────────────
//  ICONS
// ─────────────────────────────────────────────
const Ico = {
  send:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  stop:    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>,
  plus:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  menu:    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  trash:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  copy:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  img:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  cam:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  smile:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
  brain:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>,
  settings:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  user:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  logout:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  check:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
  volume:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
  chev:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
  search:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  shield:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  edit:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  memory:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  key:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="7" cy="17" r="3"/><path d="M10.82 9.18a7 7 0 1 1 4 4L10 18H7v-3l3.82-5.82z"/></svg>,
};

// ─────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  // AUTH
  const [users, setUsers]       = useState(() => loadLS(STORE_KEY, []));
  const [user, setUser]         = useState(null);
  const [authView, setAuthView] = useState("login");
  const [regTemp, setRegTemp]   = useState(null);

  // API KEY
  const [apiKey, setApiKey]     = useState(() => loadLS(APIKEY_KEY, ""));

  // MESSAGE LIMITS
  const [limitsData, setLimitsData]   = useState(() => loadLS(LIMITS_KEY, {}));
  const [globalData, setGlobalData]   = useState(() => loadLS(GLOBAL_USAGE_KEY, {}));

  // ADMIN CHAT LOG (all user messages, hidden from users)
  const [adminChatLog, setAdminChatLog] = useState(() => loadLS(ADMIN_CHAT_LOG_KEY, []));

  // CHAT
  const [chats, setChats]               = useState(() => loadLS(CHATS_KEY, []));
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [streamText, setStreamText]     = useState("");
  const [thinking, setThinking]         = useState(false);
  const [thinkExpanded, setThinkExpanded] = useState(true);

  // SETTINGS
  const [settings, setSettings] = useState(() => loadLS(SETTINGS_KEY, {
    model: "ff22pro", lang: "en", tts: false, fontSize: "medium",
    showThinking: true, autoTitle: true, sendOnEnter: true,
  }));

  // BRAIN & MEMORY
  const [brain, setBrain]         = useState(() => loadLS(BRAIN_KEY, []));
  const [allMemory, setAllMemory] = useState(() => loadLS(MEMORY_KEY, {}));

  // DYNAMIC LANGUAGES (admin can add/remove)
  const [langs, setLangs] = useState(() => loadLS("ffchatbot_langs_v1", LANGS));

  // UI — sidebar closed by default on mobile, open on desktop
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [sidebarOpen, setSidebarOpen]   = useState(!isMobile);
  const [activePanel, setActivePanel]   = useState(null);
  const [modelDD, setModelDD]           = useState(false);
  const [langDD, setLangDD]             = useState(false);
  const [stickerOpen, setStickerOpen]   = useState(false);
  const [stickerTab, setStickerTab]     = useState(Object.keys(STICKER_PACKS)[0]);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageB64, setImageB64]         = useState(null);
  const [camOpen, setCamOpen]           = useState(false);
  const [copiedId, setCopiedId]         = useState(null);
  const [toast, setToast]               = useState(null);
  const [brainInput, setBrainInput]     = useState("");
  const [adminView, setAdminView]       = useState("users");
  const [agentMessages, setAgentMessages] = useState([]);
  const [agentInput, setAgentInput]     = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [langSearch, setLangSearch]     = useState("");
  const [editingChat, setEditingChat]   = useState(null);
  const [editName2, setEditName2]       = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [feedbackOpen, setFeedbackOpen]   = useState(false);
  const [feedbackMsgId, setFeedbackMsgId] = useState(null);
  const [feedbackType, setFeedbackType]   = useState(null);
  const [feedbackText, setFeedbackText]   = useState("");
  const [feedbackSent, setFeedbackSent]   = useState(false);
  const [apiKeyInput, setApiKeyInput]     = useState("");
  const [showApiKeyPanel, setShowApiKeyPanel] = useState(false);

  const bottomRef = useRef(null);
  const taRef     = useRef(null);
  const fileRef   = useRef(null);
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const abortRef  = useRef(null);

  // Persist
  useEffect(() => { saveLS(STORE_KEY, users); }, [users]);
  useEffect(() => { saveLS(BRAIN_KEY, brain); }, [brain]);
  useEffect(() => { saveLS(SETTINGS_KEY, settings); }, [settings]);
  useEffect(() => { saveLS(CHATS_KEY, chats); }, [chats]);
  useEffect(() => { saveLS(MEMORY_KEY, allMemory); }, [allMemory]);
  useEffect(() => { saveLS(APIKEY_KEY, apiKey); }, [apiKey]);
  useEffect(() => { saveLS(LIMITS_KEY, limitsData); }, [limitsData]);
  useEffect(() => { saveLS(GLOBAL_USAGE_KEY, globalData); }, [globalData]);
  useEffect(() => { saveLS(ADMIN_CHAT_LOG_KEY, adminChatLog); }, [adminChatLog]);
  useEffect(() => { saveLS("ffchatbot_langs_v1", langs); }, [langs]);

  // Auto scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [streamText, activeChatId, chats]);

  // Toast
  const showToast = useCallback((msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const activeChat = useMemo(() => chats.find(c => c.id === activeChatId), [chats, activeChatId]);
  const messages   = activeChat?.messages || [];

  const userMemory = useMemo(() => {
    if (!user) return [];
    return allMemory[user.id] || [];
  }, [allMemory, user]);

  const addUserMemory = useCallback((type, value) => {
    if (!user) return;
    setAllMemory(prev => {
      const existing = prev[user.id] || [];
      const alreadyExists = existing.some(m => m.type === type && m.value.toLowerCase() === value.toLowerCase());
      if (alreadyExists) return prev;
      const updated = [...existing, { id: Date.now().toString(), type, value, at: Date.now() }].slice(-100);
      return { ...prev, [user.id]: updated };
    });
  }, [user]);

  const removeUserMemory = useCallback((memId) => {
    if (!user) return;
    setAllMemory(prev => ({ ...prev, [user.id]: (prev[user.id] || []).filter(m => m.id !== memId) }));
  }, [user]);

  const newChat = useCallback(() => {
    const id = Date.now().toString();
    setChats(prev => [{ id, title: "New Chat", messages: [], createdAt: Date.now(), model: settings.model }, ...prev]);
    setActiveChatId(id);
    setInput(""); setImagePreview(null); setImageB64(null);
    setActivePanel(null);
  }, [settings.model]);

  useEffect(() => {
    if (user && chats.length === 0) newChat();
    if (user && chats.length > 0 && !activeChatId) setActiveChatId(chats[0].id);
  }, [user]);

  const updateChat = useCallback((id, updater) => {
    setChats(prev => prev.map(c => c.id === id ? { ...c, ...updater(c) } : c));
  }, []);

  const resizeTA = useCallback(() => {
    if (taRef.current) {
      taRef.current.style.height = "44px";
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 180) + "px";
    }
  }, []);

  // Deep learning from conversation
  const learnFromConversation = useCallback((q) => {
    const patterns = [
      { rx: /my name is ([^.!?\n,]+)/i,              type: "name" },
      { rx: /(?:i am|i'm) (\d+) years? old/i,        type: "age" },
      { rx: /i live in ([^.!?\n,]+)/i,               type: "location" },
      { rx: /i work (?:as|at) ([^.!?\n,]+)/i,        type: "job" },
      { rx: /i (?:like|love|enjoy) ([^.!?\n,]+)/i,   type: "interest" },
      { rx: /i (?:don't|hate|dislike) ([^.!?\n,]+)/i,type: "dislike" },
      { rx: /my (?:goal|dream) is ([^.!?\n,]+)/i,    type: "goal" },
      { rx: /i'm (?:from|originally from) ([^.!?\n,]+)/i, type: "origin" },
    ];
    patterns.forEach(({ rx, type }) => {
      const m = q.match(rx);
      if (m && m[1]?.trim().length > 1 && m[1].trim().length < 60) addUserMemory(type, m[1].trim());
    });
  }, [addUserMemory]);

  // ── SEND MESSAGE ──
  const sendMessage = useCallback(async (text, imgB64) => {
    if (!text.trim() && !imgB64) return;
    if (!activeChatId || loading) return;

    // ── Check if user is deactivated ──
    if (!user.isAdmin && user.active === false) {
      showToast("Your account has been deactivated. Please contact support.", "err");
      return;
    }

    // ── Check global 10k limit ──
    if (!user.isAdmin) {
      const globalCount = getGlobalUsage(globalData);
      if (globalCount >= GLOBAL_MSG_LIMIT) {
        showToast("🌍 Global message limit reached. Please try again tomorrow.", "err");
        return;
      }
      // ── Check lifetime per-account 50,000 limit ──
      const userTotal = getUserUsage(limitsData, user.id);
      if (userTotal >= ACCOUNT_MSG_LIMIT) {
        showToast(`🚫 Account message limit (${ACCOUNT_MSG_LIMIT.toLocaleString()}) reached. Please create a new account.`, "err");
        return;
      }
    }

    const userMsg = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      image: imgB64 || null,
      at: Date.now(),
    };

    updateChat(activeChatId, c => ({ messages: [...c.messages, userMsg] }));
    setInput(""); setImagePreview(null); setImageB64(null);
    if (taRef.current) taRef.current.style.height = "44px";
    setLoading(true); setStreamText(""); setThinking(true); setThinkExpanded(true);

    abortRef.current = new AbortController();

    try {
      const history = [...messages, userMsg];
      const apiMessages = history.map(m => {
        if (m.role === "user") {
          if (m.image) {
            return {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: m.image } },
                { type: "text", text: m.content || "Please analyze this image in complete detail." },
              ],
            };
          }
          return { role: "user", content: m.content };
        }
        return { role: "assistant", content: m.content };
      });

      const sysPrompt = buildChatPrompt(settings.model, settings.lang, brain, userMemory);
      let full = "";

      await callAPI(apiMessages, sysPrompt, (partial) => {
        full = partial;
        if (thinking && partial.length > 40) setThinking(false);
        setStreamText(partial);
      }, abortRef.current.signal, apiKey);

      const aiMsg = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: full,
        model: settings.model,
        at: Date.now(),
        liked: null,
      };

      updateChat(activeChatId, c => ({
        messages: [...c.messages, aiMsg],
        title: c.title === "New Chat" && settings.autoTitle
          ? (text.trim().slice(0, 38) || "Chat") + (text.trim().length > 38 ? "…" : "")
          : c.title,
      }));

      if (settings.tts && full) {
        const utt = new SpeechSynthesisUtterance(full.replace(/[#*`_\[\]]/g, "").slice(0, 400));
        window.speechSynthesis.speak(utt);
      }

      learnFromConversation(text);

      // ── Increment usage counters ──
      if (!user.isAdmin) {
        setLimitsData(prev => incrementUserUsage(prev, user.id));
        setGlobalData(prev => incrementGlobalUsage(prev));
      }

      // ── Auto-save to brain: question + response ──
      if (full && text.trim()) {
        setBrain(prev => {
          const entry = { id: Date.now().toString(), at: Date.now(), auto: true,
            text: `[CHAT] Q: ${text.trim().slice(0,120)} | A: ${full.replace(/\n/g," ").slice(0,200)}` };
          return [...prev.slice(-499), entry]; // keep last 500
        });
        // ── Save to hidden admin chat log ──
        setAdminChatLog(prev => {
          const entry = {
            id: Date.now().toString(),
            at: Date.now(),
            userId: user.id,
            userName: user.name,
            userEmail: user.email,
            chatId: activeChatId,
            question: text.trim(),
            answer: full,
            model: settings.model,
          };
          return [...prev.slice(-4999), entry]; // keep last 5000
        });
      }

    } catch (e) {
      if (e.name !== "AbortError") {
        updateChat(activeChatId, c => ({
          messages: [...c.messages, {
            id: (Date.now()+1).toString(), role: "assistant", at: Date.now(), error: true,
            content: `❌ **Error:** ${e.message}`,
          }],
        }));
      }
    } finally {
      setLoading(false); setStreamText(""); setThinking(false);
    }
  }, [activeChatId, loading, messages, settings, brain, userMemory, updateChat, learnFromConversation, apiKey, user, limitsData, globalData, showToast, setBrain, adminChatLog]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey && settings.sendOnEnter) {
      e.preventDefault();
      sendMessage(input, imageB64);
    }
  }, [input, imageB64, settings.sendOnEnter, sendMessage]);

  const copyMessage = useCallback((id, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const deleteChat = useCallback((id) => {
    setChats(prev => {
      const updated = prev.filter(c => c.id !== id);
      if (activeChatId === id) {
        setActiveChatId(updated[0]?.id || null);
        if (updated.length === 0) setTimeout(newChat, 100);
      }
      return updated;
    });
  }, [activeChatId, newChat]);

  const reactMessage = useCallback((chatId, msgId, val) => {
    setChats(prev => prev.map(c => c.id === chatId ? {
      ...c, messages: c.messages.map(m => m.id === msgId ? { ...m, liked: m.liked === val ? null : val } : m),
    } : c));
  }, []);

  const openFeedback = useCallback((msgId, type) => {
    setFeedbackMsgId(msgId); setFeedbackType(type);
    setFeedbackText(""); setFeedbackSent(false); setFeedbackOpen(true);
  }, []);

  const submitFeedback = useCallback(() => {
    if (!feedbackText.trim()) { showToast("Please write your feedback", "err"); return; }
    setBrain(prev => [...prev, {
      id: Date.now().toString(),
      text: `[FEEDBACK ${feedbackType === "like" ? "👍" : "👎"}] ${feedbackText.trim()} (by ${user?.name}, ${new Date().toLocaleDateString()})`,
      at: Date.now(), auto: true,
    }]);
    setFeedbackSent(true);
    setTimeout(() => { setFeedbackOpen(false); setFeedbackText(""); }, 1600);
    showToast("Feedback saved 🙏");
  }, [feedbackText, feedbackType, user, showToast]);

  const speakMessage = useCallback((text) => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.replace(/[#*`_\[\]]/g, "").slice(0, 500));
    window.speechSynthesis.speak(utt);
  }, []);

  // Image upload — works with gallery
  const handleImage = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { showToast("Only images allowed", "err"); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
      setImageB64(e.target.result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  }, [showToast]);

  // Camera — asks permission properly
  const openCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCamOpen(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 100);
    } catch (err) {
      if (err.name === "NotAllowedError") showToast("Camera permission denied. Please allow camera access.", "err");
      else if (err.name === "NotFoundError") showToast("No camera found on this device", "err");
      else showToast("Camera not available", "err");
    }
  }, [showToast]);

  const capturePhoto = useCallback(() => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const dataUrl = c.toDataURL("image/jpeg", 0.88);
    setImagePreview(dataUrl);
    setImageB64(dataUrl.split(",")[1]);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setCamOpen(false);
    showToast("Photo captured! ✓");
  }, [showToast]);

  const closeCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setCamOpen(false);
  }, []);

  // AUTH
  const isTemp = (email) => TEMP_DOMAINS.has(email.split("@")[1]?.split(".")[0]);

  const validatePassword = (pass) => {
    if (pass.length < 8) return "Password must be at least 8 characters";
    if (!/[0-9]/.test(pass)) return "Password must contain at least one number";
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pass)) return "Password must contain at least one symbol (!@#$%^&* etc.)";
    return null;
  };

  const handleRegister = useCallback((name, email, pass) => {
    if (!name.trim()) return showToast("Name required", "err");
    if (!email.includes("@") || !email.includes(".")) return showToast("Valid email required", "err");
    if (isTemp(email)) return showToast("Temporary emails not allowed", "err");
    const passErr = validatePassword(pass);
    if (passErr) return showToast(passErr, "err");
    // Ensure password is unique across all accounts
    if (users.some(u => u.pass === pass)) return showToast("This password is already in use. Please choose a unique password.", "err");
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) return showToast("Email already registered", "err");
    setRegTemp({ name: name.trim(), email: email.toLowerCase(), pass, joinedAt: Date.now() });
    setAuthView("consent");
  }, [users, showToast]);

  const acceptConsent = useCallback(() => {
    if (!regTemp) return;
    const newUser = { ...regTemp, id: Date.now().toString(), consent: true };
    setUsers(prev => [...prev, newUser]);
    setUser(newUser);
    setAuthView("login");
    setRegTemp(null);
    showToast(`Welcome, ${newUser.name}! 🎉`);
  }, [regTemp, showToast]);

  const handleLogin = useCallback((email, pass) => {
    if (email === ADMIN_EMAIL && pass === ADMIN_PASS) {
      setUser({ id: "admin", name: "Admin", email: ADMIN_EMAIL, isAdmin: true });
      showToast("Admin logged in ✓"); return;
    }
    const u = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.pass === pass);
    if (!u) return showToast("Invalid credentials", "err");
    setUser(u);
    // Restore saved chats
    const savedChats = loadLS(`ffchatbot_chats_${u.id}`, null);
    if (savedChats && savedChats.length > 0) setChats(savedChats);
    showToast(`Welcome back, ${u.name}!`);
  }, [users, showToast]);

  const handleLogout = useCallback(() => {
    // Save chats per user before logout so they restore on re-login
    if (user && !user.isAdmin) {
      saveLS(`ffchatbot_chats_${user.id}`, chats);
    }
    setUser(null); setConfirmLogout(false);
    setChats([]); setActiveChatId(null);
    window.speechSynthesis?.cancel();
  }, [user, chats]);

  // Google Login — simulates OAuth (in a real deployment connect to Firebase/Google)
  const handleGoogleLogin = useCallback(() => {
    const googleEmail = prompt("Enter your Google email to sign in:");
    if (!googleEmail || !googleEmail.includes("@")) return showToast("Valid Google email required", "err");
    const email = googleEmail.toLowerCase().trim();
    // Check if existing user
    const existing = users.find(u => u.email === email);
    if (existing) {
      setUser(existing);
      // Restore their chats from storage
      const savedChats = loadLS(`ffchatbot_chats_${existing.id}`, null);
      if (savedChats) setChats(savedChats);
      showToast(`Welcome back, ${existing.name}! 🎉`);
    } else {
      // New Google user — auto-register
      const name = email.split("@")[0].replace(/[._]/g," ").replace(/\b\w/g, c => c.toUpperCase());
      const newUser = { id: Date.now().toString(), name, email, pass: null, joinedAt: Date.now(),
        consent: true, googleAuth: true };
      setUsers(prev => [...prev, newUser]);
      setUser(newUser);
      showToast(`Welcome, ${name}! Signed in with Google 🎉`);
    }
    setAuthView("login");
  }, [users, showToast]);

  const updateSetting = useCallback((key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  }, []);

  const addBrainFact = useCallback(() => {
    if (!brainInput.trim()) return;
    setBrain(prev => [...prev, { id: Date.now().toString(), text: brainInput.trim(), at: Date.now(), auto: false }]);
    setBrainInput(""); showToast("Fact saved ✓");
  }, [brainInput, showToast]);

  const deleteBrainFact = useCallback((id) => { setBrain(prev => prev.filter(f => f.id !== id)); }, []);

  const sendAgentMessage = useCallback(async (text) => {
    if (!text.trim() || agentLoading) return;
    const msg = { role: "user", content: text, id: Date.now().toString() };
    setAgentMessages(prev => [...prev, msg]);
    setAgentInput("");
    setAgentLoading(true);
    try {
      const apiMsgs = [...agentMessages, msg].map(m => ({ role: m.role, content: m.content }));
      let full = "";
      await callAPI(apiMsgs, buildAgentPrompt(users, brain, allMemory), (p) => { full = p; }, null, apiKey);
      setAgentMessages(prev => [...prev, { role: "assistant", content: full, id: Date.now().toString() }]);
    } catch (e) {
      setAgentMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}`, id: Date.now().toString(), error: true }]);
    } finally { setAgentLoading(false); }
  }, [agentMessages, agentLoading, users, brain, allMemory, apiKey]);

  const filteredLangs = useMemo(() =>
    langs.filter(l => l.n.toLowerCase().includes(langSearch.toLowerCase()) || l.c.includes(langSearch.toLowerCase())),
    [langSearch, langs]);

  if (!user) return (
    <AuthScreen
      view={authView} setView={setAuthView}
      onLogin={handleLogin} onRegister={handleRegister}
      onConsent={acceptConsent} onDecline={() => setAuthView("register")}
      onGoogleLogin={handleGoogleLogin}
    />
  );

  const currentModel = FF_MODELS.find(m => m.id === settings.model) || FF_MODELS[2];
  const currentLang  = LANGS.find(l => l.c === settings.lang) || LANGS[0];

  // ─────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", zIndex:9999,
          background: toast.type === "err" ? "rgba(239,68,68,0.95)" : "rgba(34,197,94,0.95)",
          color:"#fff", padding:"10px 22px", borderRadius:100, fontSize:13, fontWeight:600,
          backdropFilter:"blur(8px)", boxShadow:"0 4px 20px rgba(0,0,0,0.5)",
          animation:"fadeUp 0.2s ease", whiteSpace:"nowrap" }}>
          {toast.msg}
        </div>
      )}

      {/* Feedback Modal */}
      {feedbackOpen && (
        <div className="modal-overlay" onClick={() => setFeedbackOpen(false)}>
          <div className="feedback-box" onClick={e => e.stopPropagation()}>
            {feedbackSent ? (
              <div style={{ textAlign:"center", padding:"20px 0" }}>
                <div style={{ fontSize:38, marginBottom:10 }}>🙏</div>
                <div style={{ fontWeight:700, fontSize:16 }}>Thank you for your feedback!</div>
              </div>
            ) : (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                  <span style={{ fontSize:20 }}>{feedbackType === "like" ? "👍" : "👎"}</span>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14.5 }}>{feedbackType === "like" ? "What did you like?" : "What went wrong?"}</div>
                    <div style={{ color:"var(--txt2)", fontSize:12.5 }}>Helps us improve FFChatbot AI</div>
                  </div>
                </div>
                <textarea className="feedback-ta"
                  placeholder={feedbackType === "like" ? "This response was great because…" : "This could be improved by…"}
                  value={feedbackText} onChange={e => setFeedbackText(e.target.value)} autoFocus />
                <div style={{ display:"flex", gap:8, marginTop:12 }}>
                  <button className="btn btn-gold" style={{ flex:1, justifyContent:"center" }} onClick={submitFeedback}>Send Feedback</button>
                  <button className="btn btn-ghost" style={{ flexShrink:0 }} onClick={() => setFeedbackOpen(false)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Camera */}
      {camOpen && (
        <div className="cam-overlay">
          <div style={{ color:"#fff", marginBottom:16, fontSize:14, opacity:0.7 }}>Point camera at what you want to analyze</div>
          <video ref={videoRef} autoPlay playsInline style={{ maxWidth:"100%", maxHeight:"65vh", borderRadius:12 }} />
          <canvas ref={canvasRef} style={{ display:"none" }} />
          <div style={{ display:"flex", gap:12, marginTop:20 }}>
            <button className="btn btn-gold" onClick={capturePhoto}>📸 Capture</button>
            <button className="btn btn-ghost" onClick={closeCamera}>✕ Cancel</button>
          </div>
        </div>
      )}

      {/* Confirm Logout */}
      {confirmLogout && (
        <div className="modal-overlay" onClick={() => setConfirmLogout(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:340 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>Sign Out?</div>
            <div style={{ color:"var(--txt2)", fontSize:13, marginBottom:20 }}>Your local session will be cleared.</div>
            <div style={{ display:"flex", gap:10 }}>
              <button className="btn btn-red" style={{ flex:1, justifyContent:"center" }} onClick={handleLogout}>Sign Out</button>
              <button className="btn btn-ghost" style={{ flex:1, justifyContent:"center" }} onClick={() => setConfirmLogout(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* API Key Setup Modal */}
      {showApiKeyPanel && (
        <div className="modal-overlay" onClick={() => setShowApiKeyPanel(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:440 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              {Ico.key}
              <div style={{ fontWeight:700, fontSize:15 }}>API Key Setup</div>
            </div>
            <div style={{ color:"var(--txt2)", fontSize:13, marginBottom:16, lineHeight:1.7 }}>
              To use FFChatbot AI, you need an Anthropic API key. Get one free at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color:"var(--gold)" }}>console.anthropic.com</a>
            </div>
            <input className="inp" type="password" placeholder="sk-ant-api03-..."
              value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} />
            <div style={{ display:"flex", gap:8, marginTop:14 }}>
              <button className="btn btn-gold" style={{ flex:1, justifyContent:"center" }} onClick={() => {
                if (!apiKeyInput.trim()) return showToast("Enter your API key", "err");
                setApiKey(apiKeyInput.trim());
                setShowApiKeyPanel(false);
                showToast("API key saved ✓");
              }}>Save Key</button>
              {apiKey && <button className="btn btn-ghost" style={{ flexShrink:0 }} onClick={() => { setApiKey(""); setApiKeyInput(""); showToast("API key removed"); }}>Remove</button>}
              <button className="btn btn-ghost" style={{ flexShrink:0 }} onClick={() => setShowApiKeyPanel(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* LAYOUT */}
      <div style={{ display:"flex", height:"100vh", overflow:"hidden" }}>

        {/* SIDEBAR */}
        {sidebarOpen && (
          <div className="sidebar-mobile" style={{ width:252, borderRight:`1px solid var(--border)`, display:"flex", flexDirection:"column", background:"var(--bg2)", flexShrink:0, transition:"width 0.2s" }}>
            {/* Header */}
            <div style={{ padding:"12px 10px 10px", borderBottom:`1px solid var(--border)`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <div style={{ width:26, height:26, borderRadius:7, background:"var(--gold)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:900, color:"#000" }}>✦</div>
                <span style={{ fontWeight:800, fontSize:13, color:"var(--txt)", letterSpacing:"-0.02em" }}>FFChatbot AI</span>
              </div>
              <button className="btn-icon" onClick={() => { newChat(); if (window.innerWidth < 768) setSidebarOpen(false); }} title="New Chat">{Ico.plus}</button>
            </div>

            {/* Chat list */}
            <div style={{ flex:1, overflowY:"auto", padding:"6px 6px" }}>
              {chats.length === 0 && <div style={{ color:"var(--txt3)", fontSize:12.5, textAlign:"center", marginTop:28 }}>No chats yet</div>}
              {chats.map(c => (
                <div key={c.id} className={`si ${c.id === activeChatId ? "active" : ""}`}
                  onClick={() => {
                    setActiveChatId(c.id); setActivePanel(null);
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}>
                  {editingChat === c.id ? (
                    <input className="inp" style={{ fontSize:12.5, padding:"3px 8px", flex:1 }}
                      value={editName2} onChange={e => setEditName2(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") { updateChat(c.id, () => ({ title: editName2.trim() || c.title })); setEditingChat(null); }
                        if (e.key === "Escape") setEditingChat(null);
                      }}
                      onClick={e => e.stopPropagation()} autoFocus />
                  ) : (
                    <span style={{ fontSize:13, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color: c.id === activeChatId ? "var(--txt)" : "var(--txt2)" }}>
                      {c.title}
                    </span>
                  )}
                  <div style={{ display:"flex", gap:1, flexShrink:0 }}>
                    <button className="btn-icon" style={{ padding:3 }} onClick={e => { e.stopPropagation(); setEditingChat(c.id); setEditName2(c.title); }}>{Ico.edit}</button>
                    <button className="btn-icon" style={{ padding:3 }} onClick={e => { e.stopPropagation(); deleteChat(c.id); }}>{Ico.trash}</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer nav — only working items */}
            <div style={{ borderTop:`1px solid var(--border)`, padding:"6px 6px 10px" }}>
              {[
                { icon: Ico.brain,    label: "AI Brain",   id: "brain" },
                { icon: Ico.memory,   label: "My Memory",  id: "memory" },
                { icon: Ico.settings, label: "Settings",   id: "settings" },
                { icon: Ico.key,      label: apiKey ? "API Key ✓" : "API Key", id: "apikey" },
                ...(user.isAdmin ? [{ icon: Ico.shield, label: "Admin Panel", id: "admin" }] : []),
                { icon: Ico.user,     label: user.name,    id: "profile" },
              ].map(item => (
                <button key={item.id} className="btn-icon"
                  style={{ width:"100%", justifyContent:"flex-start", gap:8, padding:"8px 10px", borderRadius:8,
                    color: item.id === "apikey" && apiKey ? "var(--green)" : activePanel === item.id ? "var(--gold)" : "var(--txt2)",
                    background: activePanel === item.id ? "var(--gold-dim)" : "transparent",
                    fontSize:13, fontWeight:600 }}
                  onClick={() => {
                    if (item.id === "apikey") { setApiKeyInput(apiKey); setShowApiKeyPanel(true); }
                    else {
                      const next = activePanel === item.id ? null : item.id;
                      setActivePanel(next);
                      // On mobile: hide sidebar when a panel opens so panel gets full screen
                      if (next && window.innerWidth < 768) setSidebarOpen(false);
                    }
                  }}>
                  {item.icon} {item.label}
                  {item.id === "memory" && userMemory.length > 0 && (
                    <span style={{ marginLeft:"auto", fontSize:10, fontWeight:700, background:"var(--purple)", color:"#fff", padding:"1px 6px", borderRadius:100 }}>{userMemory.length}</span>
                  )}
                </button>
              ))}
              <button className="btn-icon" style={{ width:"100%", justifyContent:"flex-start", gap:8, padding:"8px 10px", borderRadius:8, color:"var(--txt3)", fontSize:13, fontWeight:600 }}
                onClick={() => setConfirmLogout(true)}>
                {Ico.logout} Sign out
              </button>
            </div>
          </div>
        )}

        {/* PANEL (Brain / Memory / Settings / Admin / Profile) */}
        {activePanel && (
          <div className="panel-mobile" style={{ width:300, borderRight:`1px solid var(--border)`, display:"flex", flexDirection:"column", background:"var(--bg2)", flexShrink:0 }}>
            <PanelHeader
              title={
                activePanel === "brain" ? "🧠 AI Brain" :
                activePanel === "settings" ? "⚙️ Settings" :
                activePanel === "admin" ? "🛡️ Admin Panel" :
                activePanel === "memory" ? "💾 My Memory" :
                "👤 Profile"
              }
              onClose={() => setActivePanel(null)}
            />
            <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
              {activePanel === "brain" && (
                <BrainPanel brain={brain} brainInput={brainInput} setBrainInput={setBrainInput}
                  addBrainFact={addBrainFact} deleteBrainFact={deleteBrainFact} />
              )}
              {activePanel === "memory" && (
                <MemoryPanel userMemory={userMemory} removeUserMemory={removeUserMemory} />
              )}
              {activePanel === "settings" && (
                <SettingsPanel settings={settings} updateSetting={updateSetting} models={FF_MODELS} langs={langs} />
              )}
              {activePanel === "admin" && user.isAdmin && (
                <AdminPanel users={users} brain={brain} allMemory={allMemory}
                  limitsData={limitsData} globalData={globalData}
                  adminView={adminView} setAdminView={setAdminView}
                  agentMessages={agentMessages} agentInput={agentInput}
                  setAgentInput={setAgentInput} sendAgent={sendAgentMessage}
                  agentLoading={agentLoading} deleteBrainFact={deleteBrainFact}
                  setBrain={setBrain} setUsers={setUsers} showToast={showToast}
                  langs={langs} setLangs={setLangs} adminChatLog={adminChatLog} />
              )}
              {activePanel === "profile" && (
                <ProfilePanel user={user} users={users} setUsers={setUsers} setUser={setUser} showToast={showToast} />
              )}
            </div>
          </div>
        )}

        {/* MAIN CHAT */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:"var(--bg)" }}>

          {/* Top bar */}
          <div style={{ borderBottom:`1px solid var(--border)`, padding:"10px 16px", display:"flex", alignItems:"center", gap:10, background:"var(--bg)", flexShrink:0 }}>
            <button className="btn-icon" onClick={() => {
              const next = !sidebarOpen;
              setSidebarOpen(next);
              // On mobile: close panel when opening sidebar
              if (next && window.innerWidth < 768) setActivePanel(null);
            }} title="Toggle sidebar">{Ico.menu}</button>

            <span style={{ fontWeight:700, fontSize:13.5, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"var(--txt2)" }}>
              {activeChat?.title || "New Chat"}
            </span>

            {/* Model selector */}
            <div style={{ position:"relative" }}>
              <button className="btn btn-ghost" style={{ padding:"5px 10px", gap:5, fontSize:12.5 }}
                onClick={() => { setModelDD(p => !p); setLangDD(false); }}>
                <span>{currentModel.icon}</span>
                <span style={{ color: currentModel.clr, fontWeight:700 }}>{currentModel.name}</span>
                {Ico.chev}
              </button>
              {modelDD && (
                <div className="dd-menu" style={{ right:0, top:"calc(100% + 6px)", minWidth:220 }}>
                  {FF_MODELS.map(m => (
                    <div key={m.id} className={`dd-item ${settings.model === m.id ? "selected" : ""}`}
                      onClick={() => { updateSetting("model", m.id); setModelDD(false); }}>
                      <span style={{ fontSize:15 }}>{m.icon}</span>
                      <div>
                        <div style={{ fontWeight:700, color: m.clr, fontSize:13 }}>{m.name}</div>
                        <div style={{ fontSize:11, color:"var(--txt3)" }}>{m.label}</div>
                      </div>
                      {settings.model === m.id && <span style={{ marginLeft:"auto" }}>{Ico.check}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lang selector */}
            <div style={{ position:"relative" }}>
              <button className="btn btn-ghost" style={{ padding:"5px 9px", fontSize:12.5, gap:4 }}
                onClick={() => { setLangDD(p => !p); setModelDD(false); }}>
                <span>{currentLang.f}</span>
                <span className="hide-mob">{currentLang.n}</span>
                {Ico.chev}
              </button>
              {langDD && (
                <div className="dd-menu" style={{ right:0, top:"calc(100% + 6px)", width:200, maxHeight:260, overflowY:"auto" }}>
                  <div style={{ padding:"7px 10px", borderBottom:`1px solid var(--border)` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, background:"var(--bg)", borderRadius:7, padding:"5px 10px" }}>
                      {Ico.search}
                      <input placeholder="Search…" value={langSearch} onChange={e => setLangSearch(e.target.value)}
                        style={{ background:"transparent", border:"none", outline:"none", color:"var(--txt)", fontSize:13, width:"100%", fontFamily:"inherit" }} />
                    </div>
                  </div>
                  {filteredLangs.map(l => (
                    <div key={l.c} className={`dd-item ${settings.lang === l.c ? "selected" : ""}`}
                      onClick={() => { updateSetting("lang", l.c); setLangDD(false); setLangSearch(""); }}>
                      <span>{l.f}</span> {l.n}
                      {settings.lang === l.c && <span style={{ marginLeft:"auto" }}>{Ico.check}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:"auto", padding:"16px 0" }}
            onClick={() => { setModelDD(false); setLangDD(false); setStickerOpen(false); }}>

            {/* No API key warning */}
            {!apiKey && messages.length === 0 && (
              <div style={{ maxWidth:640, margin:"0 auto 16px", padding:"0 20px" }}>
                <div className="apikey-banner">
                  <div style={{ fontWeight:700, fontSize:13.5, marginBottom:4 }}>⚠️ API Key Required</div>
                  <div style={{ color:"var(--txt2)", fontSize:13, lineHeight:1.6 }}>
                    FFChatbot AI needs an Anthropic API key to work. Get one free at{" "}
                    <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color:"var(--gold)" }}>console.anthropic.com</a>
                    {" "}then save it via the <strong style={{ color:"var(--txt)" }}>API Key</strong> option in the sidebar.
                  </div>
                </div>
              </div>
            )}

            {messages.length === 0 && !loading && (
              <WelcomeScreen model={currentModel} user={user}
                onSuggestion={t => { setInput(t); taRef.current?.focus(); }} />
            )}

            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id} msg={msg} isLast={idx === messages.length - 1}
                onCopy={() => copyMessage(msg.id, msg.content)}
                copied={copiedId === msg.id}
                onLike={() => { reactMessage(activeChatId, msg.id, true); openFeedback(msg.id, "like"); }}
                onDislike={() => { reactMessage(activeChatId, msg.id, false); openFeedback(msg.id, "dislike"); }}
                onSpeak={() => speakMessage(msg.content)}
                settings={settings}
              />
            ))}

            {loading && (
              <div style={{ maxWidth:760, margin:"0 auto", padding:"4px 20px" }} className="anim-msg">
                <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                  <div style={{ width:30, height:30, borderRadius:9, background:"var(--gold-dim)", border:"1px solid var(--gold-brd)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:14 }}>
                    {currentModel.icon}
                  </div>
                  <div style={{ flex:1 }}>
                    {thinking && (
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                        <span className="dot1" style={{ width:5, height:5, borderRadius:"50%", background:"var(--purple)", display:"inline-block" }} />
                        <span className="dot2" style={{ width:5, height:5, borderRadius:"50%", background:"var(--purple)", display:"inline-block" }} />
                        <span className="dot3" style={{ width:5, height:5, borderRadius:"50%", background:"var(--purple)", display:"inline-block" }} />
                        <span style={{ fontSize:11.5, color:"var(--purple)", fontWeight:600 }}>Thinking…</span>
                      </div>
                    )}
                    {streamText && <MD text={streamText} />}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div style={{ padding:"10px 16px 14px", borderTop:`1px solid var(--border)`, background:"var(--bg)", flexShrink:0 }}>

            {/* Account limit indicator for non-admin users */}
            {!user.isAdmin && (() => {
              const used = getUserUsage(limitsData, user.id);
              const remaining = ACCOUNT_MSG_LIMIT - used;
              const pct = used / ACCOUNT_MSG_LIMIT;
              if (pct < 0.5) return null; // only show when over 50%
              return (
                <div style={{ marginBottom:6, display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ flex:1, height:3, borderRadius:3, background:"var(--border)", overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${Math.min(100,pct*100)}%`,
                      background: pct > 0.9 ? "var(--red)" : "var(--gold)", borderRadius:3, transition:"width 0.3s" }} />
                  </div>
                  <span style={{ fontSize:10, color: pct > 0.9 ? "var(--red)" : "var(--txt3)", fontWeight:600, whiteSpace:"nowrap" }}>
                    {remaining.toLocaleString()} account msgs left
                  </span>
                </div>
              );
            })()}

            {imagePreview && (
              <div style={{ marginBottom:8 }}>
                <div style={{ position:"relative", display:"inline-block" }}>
                  <img src={imagePreview} alt="preview" style={{ height:68, width:68, objectFit:"cover", borderRadius:8, border:`1px solid var(--border2)` }} />
                  <button onClick={() => { setImagePreview(null); setImageB64(null); }}
                    style={{ position:"absolute", top:-5, right:-5, width:17, height:17, borderRadius:"50%", background:"var(--red)", color:"#fff", border:"none", cursor:"pointer", fontSize:10, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                  <div style={{ position:"absolute", bottom:2, left:2, background:"rgba(0,0,0,0.7)", borderRadius:4, padding:"1px 5px", fontSize:10, color:"#fff" }}>Image</div>
                </div>
              </div>
            )}

            {stickerOpen && (
              <div style={{ background:"var(--bg3)", border:`1px solid var(--border2)`, borderRadius:10, padding:8, marginBottom:8 }} className="anim-pop">
                <div style={{ display:"flex", gap:4, marginBottom:7, flexWrap:"wrap" }}>
                  {Object.keys(STICKER_PACKS).map(k => (
                    <button key={k} className={`tab ${stickerTab === k ? "on" : "off"}`} style={{ fontSize:11, padding:"3px 8px" }}
                      onClick={() => setStickerTab(k)}>{k}</button>
                  ))}
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:2 }}>
                  {STICKER_PACKS[stickerTab].map(e => (
                    <button key={e} className="emoji-btn" onClick={() => { setInput(p => p + e); setStickerOpen(false); taRef.current?.focus(); }}>{e}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ background:"var(--bg3)", border:`1px solid var(--border2)`, borderRadius:14, padding:"8px 12px", display:"flex", flexDirection:"column", gap:4 }}>
              <textarea ref={taRef} className="ta"
                placeholder={`Message ${currentModel.name}…`}
                value={input}
                onChange={e => { setInput(e.target.value); resizeTA(); }}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", gap:2 }}>
                  <input type="file" ref={fileRef} accept="image/*" onChange={e => handleImage(e.target.files[0])} />
                  <button className="btn-icon" title="Upload image (analyze)" onClick={() => fileRef.current?.click()}>{Ico.img}</button>
                  <button className="btn-icon" title="Take photo with camera" onClick={openCamera}>{Ico.cam}</button>
                  <button className={`btn-icon ${stickerOpen ? "active" : ""}`} title="Emoji / Stickers" onClick={() => setStickerOpen(p => !p)}>{Ico.smile}</button>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:11, color:"var(--txt3)" }}>{settings.sendOnEnter ? "↵ send" : ""}</span>
                  {loading ? (
                    <button className="btn btn-red" style={{ padding:"5px 12px", fontSize:12.5 }} onClick={() => abortRef.current?.abort()}>
                      {Ico.stop} Stop
                    </button>
                  ) : (
                    <button className="btn btn-gold" style={{ padding:"5px 12px", fontSize:12.5 }}
                      onClick={() => sendMessage(input, imageB64)}
                      disabled={!input.trim() && !imageB64}>
                      {Ico.send} Send
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
//  SUB-COMPONENTS
// ─────────────────────────────────────────────

function PanelHeader({ title, onClose }) {
  return (
    <div style={{ padding:"12px 16px", borderBottom:`1px solid var(--border)`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
      <span style={{ fontWeight:700, fontSize:14 }}>{title}</span>
      <button className="btn-icon" onClick={onClose} style={{ fontSize:15 }}>✕ Close</button>
    </div>
  );
}

// ── MESSAGE BUBBLE ──
function MessageBubble({ msg, isLast, onCopy, copied, onLike, onDislike, onSpeak, settings }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ maxWidth:760, margin:"0 auto", padding:"4px 20px" }} className={isLast ? "anim-msg" : ""}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:10, flexDirection: isUser ? "row-reverse" : "row" }}>
        <div style={{ width:30, height:30, borderRadius:9, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700,
          background: isUser ? "rgba(245,166,35,0.1)" : "var(--bg3)",
          border: `1px solid ${isUser ? "var(--gold-brd)" : "var(--border)"}`,
          color: isUser ? "var(--gold)" : "var(--txt2)" }}>
          {isUser ? "U" : "✦"}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          {msg.image && (
            <img src={`data:image/jpeg;base64,${msg.image}`} alt="uploaded"
              style={{ maxWidth:240, borderRadius:10, marginBottom:8, border:`1px solid var(--border)`, display:"block" }} />
          )}
          {isUser ? (
            <div style={{ background:"var(--bg3)", border:`1px solid var(--border)`, borderRadius:12, padding:"10px 14px",
              display:"inline-block", maxWidth:"85%", fontSize:14.5, lineHeight:1.75, color:"var(--txt)", float:"right", clear:"both" }}>
              {msg.content}
            </div>
          ) : (
            <div style={{ clear:"both" }}>
              {msg.error ? (
                <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:10, padding:"12px 14px" }}>
                  <MD text={msg.content} />
                </div>
              ) : <MD text={msg.content} />}
            </div>
          )}

          {!isUser && msg.content && !msg.error && (
            <div style={{ display:"flex", gap:4, marginTop:8, flexWrap:"wrap", clear:"both", alignItems:"center" }}>
              <button className={`pill ${msg.liked === true ? "like-on" : ""}`} onClick={onLike}>
                👍 {msg.liked === true ? "Liked" : "Like"}
              </button>
              <button className={`pill ${msg.liked === false ? "dislike-on" : ""}`} onClick={onDislike}>
                👎 {msg.liked === false ? "Disliked" : "Dislike"}
              </button>
              <button className="pill" onClick={onCopy}>{copied ? "✓ Copied" : "📋 Copy"}</button>
              <button className="pill" onClick={onSpeak}>🔊 Listen</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── WELCOME SCREEN ──
function WelcomeScreen({ model, user, onSuggestion }) {
  const suggestions = [
    "Explain quantum computing simply",
    "Help me write a professional email",
    "What are my legal rights as an employee?",
    "Write a short story for me",
    "Plan a weekly workout routine",
    "Explain machine learning with examples",
    "Analyze this image for me",
    "Help me debug my code",
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", padding:"40px 20px", textAlign:"center" }}>
      <div style={{ fontSize:46, marginBottom:14 }} className="anim-float">{model.icon}</div>
      <h2 style={{ fontSize:21, fontWeight:800, marginBottom:5, letterSpacing:"-0.03em" }}>Hello, {user.name?.split(" ")[0]} 👋</h2>
      <p style={{ color:"var(--txt2)", fontSize:13.5, marginBottom:24 }}>
        Chatting with <span style={{ color:model.clr, fontWeight:700 }}>{model.name}</span> — {model.label}
      </p>
      <div style={{ display:"flex", flexWrap:"wrap", gap:7, justifyContent:"center", maxWidth:540 }}>
        {suggestions.map(s => (
          <button key={s} className="btn btn-ghost" style={{ fontSize:12.5, padding:"6px 12px" }} onClick={() => onSuggestion(s)}>{s}</button>
        ))}
      </div>
    </div>
  );
}

// ── BRAIN PANEL ──
function BrainPanel({ brain, brainInput, setBrainInput, addBrainFact, deleteBrainFact }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <div style={{ padding:12, borderBottom:`1px solid var(--border)`, flexShrink:0 }}>
        <div style={{ color:"var(--txt2)", fontSize:12.5, marginBottom:10, lineHeight:1.6 }}>
          Facts saved here are always remembered by FFChatbot AI. Add anything you want it to know.
        </div>
        <div style={{ display:"flex", gap:7 }}>
          <input className="inp" style={{ fontSize:13 }} placeholder="Add a fact…"
            value={brainInput} onChange={e => setBrainInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addBrainFact()} />
          <button className="btn btn-gold" style={{ flexShrink:0, padding:"9px 12px" }} onClick={addBrainFact}>+</button>
        </div>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:12 }}>
        <div style={{ fontSize:11.5, color:"var(--txt3)", marginBottom:8, fontWeight:600 }}>{brain.length} facts saved</div>
        {brain.length === 0 && <div style={{ color:"var(--txt3)", fontSize:13, textAlign:"center", marginTop:20 }}>No facts yet. Add your first!</div>}
        {[...brain].reverse().map(f => (
          <div key={f.id} style={{ background:"var(--bg4)", borderRadius:8, padding:"8px 10px", marginBottom:6, display:"flex", gap:8 }}>
            <div style={{ flex:1, fontSize:12.5, color:"var(--txt)", lineHeight:1.5 }}>
              {f.auto && <span style={{ fontSize:10, color:"var(--purple)", fontWeight:700, marginRight:5 }}>[AUTO]</span>}
              {f.text}
            </div>
            <button className="btn-icon" style={{ color:"var(--red)", padding:2, flexShrink:0, fontSize:12 }} onClick={() => deleteBrainFact(f.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MEMORY PANEL ──
function MemoryPanel({ userMemory, removeUserMemory }) {
  return (
    <div style={{ flex:1, overflowY:"auto", padding:12 }}>
      <div style={{ color:"var(--txt2)", fontSize:12.5, marginBottom:12, lineHeight:1.6 }}>
        FFChatbot AI learns about you from your conversations and remembers it here.
      </div>
      {userMemory.length === 0 && (
        <div style={{ color:"var(--txt3)", fontSize:13, textAlign:"center", marginTop:20 }}>
          No memories yet. As you chat, I'll remember things about you!
        </div>
      )}
      {userMemory.map(m => (
        <div key={m.id} style={{ background:"var(--bg4)", borderRadius:8, padding:"8px 10px", marginBottom:6, display:"flex", gap:8, alignItems:"center" }}>
          <div style={{ flex:1 }}>
            <span style={{ fontSize:10, color:"var(--purple)", fontWeight:700, marginRight:5, textTransform:"uppercase" }}>{m.type}</span>
            <span style={{ fontSize:13, color:"var(--txt)" }}>{m.value}</span>
          </div>
          <button className="btn-icon" style={{ color:"var(--red)", padding:2, flexShrink:0, fontSize:12 }} onClick={() => removeUserMemory(m.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ── SETTINGS PANEL ──
function SettingsPanel({ settings, updateSetting, models, langs }) {
  return (
    <div style={{ padding:14, overflowY:"auto", flex:1 }}>
      <div className="settings-section">
        <div style={{ fontSize:11, fontWeight:700, color:"var(--txt3)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>AI Model</div>
        {models.map(m => (
          <div key={m.id} className="settings-row" style={{ cursor:"pointer" }} onClick={() => updateSetting("model", m.id)}>
            <div style={{ display:"flex", alignItems:"center", gap:9 }}>
              <span style={{ fontSize:16 }}>{m.icon}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:m.clr }}>{m.name}</div>
                <div style={{ fontSize:11.5, color:"var(--txt3)" }}>{m.label}</div>
              </div>
            </div>
            {settings.model === m.id && <span style={{ color:"var(--gold)" }}>{(()=>{const S=<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>;return S;})()}</span>}
          </div>
        ))}
      </div>
      <div className="settings-section">
        <div style={{ fontSize:11, fontWeight:700, color:"var(--txt3)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Preferences</div>
        {[
          { key:"tts", label:"Voice Responses (TTS)", desc:"Auto-read AI responses aloud" },
          { key:"showThinking", label:"Show Thinking", desc:"Display reasoning process" },
          { key:"autoTitle", label:"Auto-title Chats", desc:"Name chats from first message" },
          { key:"sendOnEnter", label:"Enter to Send", desc:"Press Enter to send messages" },
        ].map(({ key, label, desc }) => (
          <div key={key} className="settings-row">
            <div>
              <div style={{ fontSize:13.5, fontWeight:600 }}>{label}</div>
              <div style={{ fontSize:11.5, color:"var(--txt3)" }}>{desc}</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={!!settings[key]} onChange={e => updateSetting(key, e.target.checked)} />
              <span className="toggle-track" />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ADMIN PANEL ──
function AdminPanel({ users, brain, allMemory, limitsData, globalData, adminView, setAdminView, agentMessages, agentInput, setAgentInput, sendAgent, agentLoading, deleteBrainFact, setBrain, setUsers, showToast, langs, setLangs, adminChatLog }) {
  const agentBottomRef = useRef(null);
  const [newLangCode, setNewLangCode] = useState("");
  const [newLangName, setNewLangName] = useState("");
  const [newLangFlag, setNewLangFlag] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  useEffect(() => { agentBottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [agentMessages]);

  const today = new Date().toISOString().slice(0,10);
  const totalMsgsToday = globalData?.date === today ? (globalData.count||0) : 0;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      {/* Tab bar */}
      <div style={{ display:"flex", gap:3, padding:"8px 10px", borderBottom:`1px solid var(--border)`, flexShrink:0, flexWrap:"wrap" }}>
        {[
          { v:"users",    label:"👥 Users" },
          { v:"brain",    label:"🧠 Brain" },
          { v:"memory",   label:"💾 Memory" },
          { v:"langs",    label:"🌐 Languages" },
          { v:"stats",    label:"📊 Stats" },
          { v:"chatlogs", label:"💬 Chats" },
          { v:"agent",    label:"🤖 Agent" },
        ].map(({ v, label }) => (
          <button key={v} className={`tab ${adminView === v ? "on" : "off"}`} style={{ flex:1, fontSize:10.5, padding:"5px 4px" }}
            onClick={() => { setAdminView(v); setSelectedUser(null); }}>{label}</button>
        ))}
      </div>

      {/* ── USERS TAB ── */}
      {adminView === "users" && !selectedUser && (
        <div style={{ padding:10, overflowY:"auto", flex:1 }}>
          <div style={{ fontSize:11.5, color:"var(--txt3)", marginBottom:8, fontWeight:600 }}>{users.length} registered users</div>
          {users.length === 0 && <div style={{ color:"var(--txt3)", fontSize:13, textAlign:"center", marginTop:20 }}>No users yet</div>}
          {users.map((u, i) => {
            const userTotal = limitsData[u.id]?.total || 0;
            const userDaily = limitsData[u.id]?.date === today ? (limitsData[u.id].daily||0) : 0;
            const pct = Math.min(100, Math.round(userTotal / ACCOUNT_MSG_LIMIT * 100));
            return (
              <div key={u.id} style={{ background:"var(--bg4)", borderRadius:10, padding:"10px 12px", marginBottom:7, cursor:"pointer" }}
                onClick={() => setSelectedUser(u)}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{i+1}. {u.name}</div>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background: u.active !== false ? "var(--green)" : "var(--txt3)", display:"inline-block" }} />
                    <span style={{ fontSize:10, color: u.consent ? "var(--green)" : "var(--red)", fontWeight:600 }}>{u.consent ? "✅" : "❌"}</span>
                  </div>
                </div>
                <div style={{ color:"var(--txt2)", fontSize:12, marginTop:2 }}>{u.email}</div>
                <div style={{ fontSize:11, color:"var(--txt3)", marginTop:3 }}>
                  Joined: {new Date(u.joinedAt||Date.now()).toLocaleDateString()} • Memories: {(allMemory[u.id]||[]).length}
                </div>
                {/* Account usage bar */}
                <div style={{ marginTop:6 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"var(--txt3)", marginBottom:2 }}>
                    <span>Total msgs: {userTotal.toLocaleString()}/{ACCOUNT_MSG_LIMIT.toLocaleString()} • Today: {userDaily}</span>
                    <span>{pct}%</span>
                  </div>
                  <div style={{ height:4, borderRadius:4, background:"var(--border)", overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${pct}%`, background: pct>80 ? "var(--red)" : pct>50 ? "var(--gold)" : "var(--green)", borderRadius:4, transition:"width 0.3s" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── USER DETAIL ── */}
      {adminView === "users" && selectedUser && (
        <div style={{ padding:10, overflowY:"auto", flex:1 }}>
          <button className="btn btn-ghost" style={{ fontSize:11.5, padding:"5px 10px", marginBottom:10 }}
            onClick={() => setSelectedUser(null)}>← Back</button>
          <div style={{ background:"var(--bg4)", borderRadius:10, padding:14, marginBottom:10 }}>
            <div style={{ fontWeight:800, fontSize:15, marginBottom:4 }}>{selectedUser.name}</div>
            <div style={{ color:"var(--txt2)", fontSize:12.5 }}>{selectedUser.email}</div>
            <div style={{ fontSize:12, color:"var(--txt3)", marginTop:6, lineHeight:2 }}>
              <div>ID: {selectedUser.id}</div>
              <div>Joined: {new Date(selectedUser.joinedAt||Date.now()).toLocaleDateString()}</div>
              <div>Consent: {selectedUser.consent ? "✅ Accepted" : "❌ Not accepted"}</div>
              <div>Memories: {(allMemory[selectedUser.id]||[]).length}</div>
              <div>Total msgs: {(limitsData[selectedUser.id]?.total||0).toLocaleString()} / {ACCOUNT_MSG_LIMIT.toLocaleString()}</div>
              <div>Today msgs: {limitsData[selectedUser.id]?.date === today ? (limitsData[selectedUser.id].daily||0) : 0}</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button className="btn btn-ghost" style={{ fontSize:12, padding:"6px 12px" }}
              onClick={() => {
                setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, active: u.active === false } : u));
                showToast("User status updated");
              }}>
              {selectedUser.active === false ? "✅ Activate" : "🚫 Deactivate"}
            </button>
            <button className="btn btn-red" style={{ fontSize:12, padding:"6px 12px" }}
              onClick={() => { setUsers(prev => prev.filter(x => x.id !== selectedUser.id)); setSelectedUser(null); showToast("User deleted"); }}>
              🗑️ Delete User
            </button>
          </div>
          {/* User memories */}
          <div style={{ marginTop:14 }}>
            <div style={{ fontSize:11.5, fontWeight:700, color:"var(--txt3)", marginBottom:7 }}>USER MEMORIES</div>
            {(allMemory[selectedUser.id]||[]).length === 0
              ? <div style={{ color:"var(--txt3)", fontSize:12.5 }}>No memories</div>
              : (allMemory[selectedUser.id]||[]).map(m => (
                  <div key={m.id} style={{ fontSize:12, color:"var(--txt2)", padding:"3px 0", borderBottom:`1px solid var(--border)` }}>
                    <span style={{ color:"var(--purple)", fontWeight:600 }}>[{m.type}]</span> {m.value}
                  </div>
                ))
            }
          </div>
        </div>
      )}

      {/* ── BRAIN TAB ── */}
      {adminView === "brain" && (
        <div style={{ padding:10, overflowY:"auto", flex:1 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:11.5, color:"var(--txt3)", fontWeight:600 }}>{brain.length} facts</span>
            <button className="btn btn-red" style={{ padding:"4px 8px", fontSize:11 }}
              onClick={() => { setBrain([]); showToast("Brain cleared"); }}>Clear All</button>
          </div>
          {brain.length === 0 && <div style={{ color:"var(--txt3)", fontSize:12.5, textAlign:"center", marginTop:16 }}>No brain facts yet</div>}
          {brain.map(f => (
            <div key={f.id} style={{ background:"var(--bg4)", borderRadius:8, padding:"7px 10px", marginBottom:5, display:"flex", gap:7 }}>
              <div style={{ flex:1, fontSize:12, color:"var(--txt)", lineHeight:1.5 }}>
                {f.auto && <span style={{ fontSize:9.5, color:"var(--purple)", fontWeight:700, marginRight:4 }}>[AUTO]</span>}
                {f.text}
              </div>
              <button className="btn-icon" style={{ color:"var(--red)", padding:2, flexShrink:0, fontSize:12 }} onClick={() => deleteBrainFact(f.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── MEMORY TAB ── */}
      {adminView === "memory" && (
        <div style={{ padding:10, overflowY:"auto", flex:1 }}>
          <div style={{ fontSize:11.5, color:"var(--txt3)", fontWeight:600, marginBottom:8 }}>
            {Object.keys(allMemory).length} users with memory
          </div>
          {Object.keys(allMemory).length === 0 && <div style={{ color:"var(--txt3)", fontSize:12.5, textAlign:"center", marginTop:16 }}>No user memories yet</div>}
          {Object.entries(allMemory).map(([uid, mems]) => {
            const u = users.find(x => x.id === uid);
            return (
              <div key={uid} style={{ background:"var(--bg4)", borderRadius:10, padding:"10px 12px", marginBottom:7 }}>
                <div style={{ fontWeight:700, fontSize:12.5, marginBottom:5, color:"var(--gold)" }}>
                  {u ? u.name : `User …${uid.slice(-6)}`} <span style={{ color:"var(--txt3)", fontWeight:400 }}>({mems.length} memories)</span>
                </div>
                {mems.slice(0,6).map(m => (
                  <div key={m.id} style={{ fontSize:12, color:"var(--txt2)", padding:"2px 0" }}>
                    <span style={{ color:"var(--purple)", fontWeight:600 }}>[{m.type}]</span> {m.value}
                  </div>
                ))}
                {mems.length > 6 && <div style={{ fontSize:11, color:"var(--txt3)", marginTop:3 }}>+{mems.length-6} more…</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── LANGUAGES TAB ── */}
      {adminView === "langs" && (
        <div style={{ padding:10, overflowY:"auto", flex:1 }}>
          <div style={{ fontSize:11.5, color:"var(--txt3)", fontWeight:600, marginBottom:10 }}>Manage Languages</div>
          {/* Add new language */}
          <div style={{ background:"var(--bg4)", borderRadius:10, padding:12, marginBottom:12 }}>
            <div style={{ fontSize:11.5, fontWeight:700, color:"var(--txt3)", marginBottom:8, textTransform:"uppercase" }}>Add Language</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <input className="inp" style={{ fontSize:12.5 }} placeholder="Code (e.g. bn)" value={newLangCode} onChange={e => setNewLangCode(e.target.value)} />
              <input className="inp" style={{ fontSize:12.5 }} placeholder="Name (e.g. বাংলা)" value={newLangName} onChange={e => setNewLangName(e.target.value)} />
              <input className="inp" style={{ fontSize:12.5 }} placeholder="Flag emoji (e.g. 🇧🇩)" value={newLangFlag} onChange={e => setNewLangFlag(e.target.value)} />
              <button className="btn btn-gold" style={{ justifyContent:"center" }} onClick={() => {
                if (!newLangCode.trim() || !newLangName.trim() || !newLangFlag.trim()) return showToast("Fill all fields", "err");
                if (langs.some(l => l.c === newLangCode.trim())) return showToast("Language code exists", "err");
                setLangs(prev => [...prev, { c: newLangCode.trim(), n: newLangName.trim(), f: newLangFlag.trim() }]);
                setNewLangCode(""); setNewLangName(""); setNewLangFlag("");
                showToast("Language added ✓");
              }}>+ Add</button>
            </div>
          </div>
          {/* Language list */}
          {langs.map(l => (
            <div key={l.c} style={{ background:"var(--bg4)", borderRadius:8, padding:"8px 12px", marginBottom:6, display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:18 }}>{l.f}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{l.n}</div>
                <div style={{ fontSize:11, color:"var(--txt3)" }}>{l.c}</div>
              </div>
              <button className="btn-icon" style={{ color:"var(--red)", fontSize:12 }}
                onClick={() => { setLangs(prev => prev.filter(x => x.c !== l.c)); showToast("Language removed"); }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── STATS TAB ── */}
      {adminView === "stats" && (
        <div style={{ padding:10, overflowY:"auto", flex:1 }}>
          <div style={{ fontSize:11.5, color:"var(--txt3)", fontWeight:600, marginBottom:10 }}>Platform Statistics</div>
          {[
            { label:"Total Users", value: users.length, icon:"👥" },
            { label:"Global Msgs Today", value: `${totalMsgsToday} / ${GLOBAL_MSG_LIMIT}`, icon:"💬" },
            { label:"Brain Facts", value: brain.length, icon:"🧠" },
            { label:"Total Memories", value: Object.values(allMemory).reduce((a,b)=>a+b.length,0), icon:"💾" },
            { label:"Active Users Today", value: Object.values(limitsData).filter(v => v.date === today && v.count > 0).length, icon:"🟢" },
          ].map(s => (
            <div key={s.label} style={{ background:"var(--bg4)", borderRadius:10, padding:"12px 14px", marginBottom:8, display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:22 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:"var(--gold)" }}>{s.value}</div>
                <div style={{ fontSize:12, color:"var(--txt3)" }}>{s.label}</div>
              </div>
            </div>
          ))}
          {/* Global usage bar */}
          <div style={{ background:"var(--bg4)", borderRadius:10, padding:"12px 14px", marginTop:4 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:6 }}>
              <span style={{ fontWeight:600 }}>Global Daily Capacity</span>
              <span style={{ color:"var(--txt3)" }}>{Math.round(totalMsgsToday/GLOBAL_MSG_LIMIT*100)}%</span>
            </div>
            <div style={{ height:8, borderRadius:8, background:"var(--border)", overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${Math.min(100,totalMsgsToday/GLOBAL_MSG_LIMIT*100)}%`,
                background: totalMsgsToday/GLOBAL_MSG_LIMIT > 0.8 ? "var(--red)" : "var(--green)", borderRadius:8, transition:"width 0.3s" }} />
            </div>
          </div>
        </div>
      )}

      {/* ── CHAT LOGS TAB (Admin only — hidden from users) ── */}
      {adminView === "chatlogs" && (
        <div style={{ padding:10, overflowY:"auto", flex:1 }}>
          <div style={{ fontSize:11.5, color:"var(--txt3)", fontWeight:600, marginBottom:10 }}>
            All User Conversations — {adminChatLog.length} messages logged
          </div>
          {adminChatLog.length === 0 && (
            <div style={{ color:"var(--txt3)", fontSize:12.5, textAlign:"center", marginTop:20 }}>No conversations yet</div>
          )}
          {[...adminChatLog].reverse().map(entry => (
            <div key={entry.id} style={{ background:"var(--bg4)", borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:11.5, color:"var(--gold)", fontWeight:700 }}>{entry.userName}</span>
                <span style={{ fontSize:10.5, color:"var(--txt3)" }}>{new Date(entry.at).toLocaleString()}</span>
              </div>
              <div style={{ fontSize:10.5, color:"var(--txt3)", marginBottom:5 }}>{entry.userEmail} • {entry.model}</div>
              <div style={{ background:"rgba(245,166,35,0.06)", borderRadius:7, padding:"6px 9px", marginBottom:5 }}>
                <span style={{ fontSize:10, color:"var(--txt3)", fontWeight:700 }}>USER: </span>
                <span style={{ fontSize:12, color:"var(--txt)" }}>{entry.question}</span>
              </div>
              <div style={{ background:"var(--bg3)", borderRadius:7, padding:"6px 9px" }}>
                <span style={{ fontSize:10, color:"var(--txt3)", fontWeight:700 }}>AI: </span>
                <span style={{ fontSize:12, color:"var(--txt2)" }}>{entry.answer?.slice(0,200)}{entry.answer?.length > 200 ? "…" : ""}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── AGENT TAB ── */}
      {adminView === "agent" && (
        <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden" }}>
          <div style={{ flex:1, overflowY:"auto", padding:10 }}>
            {agentMessages.length === 0 && (
              <div style={{ color:"var(--txt3)", fontSize:12.5, textAlign:"center", marginTop:20, lineHeight:1.7 }}>
                Your personal AI agent. Ask about platform status, users, analytics, or improvements.
              </div>
            )}
            {agentMessages.map(m => (
              <div key={m.id} style={{ marginBottom:8, display:"flex", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                <div style={{ maxWidth:"88%", background: m.role === "user" ? "var(--gold-dim)" : "var(--bg4)",
                  border:`1px solid ${m.role === "user" ? "var(--gold-brd)" : "var(--border)"}`,
                  borderRadius:10, padding:"8px 12px", fontSize:12.5, lineHeight:1.6 }}>
                  <MD text={m.content} />
                </div>
              </div>
            ))}
            {agentLoading && (
              <div style={{ display:"flex", gap:5, padding:"4px 0" }}>
                <span className="dot1" style={{ width:6, height:6, borderRadius:"50%", background:"var(--purple)", display:"inline-block" }} />
                <span className="dot2" style={{ width:6, height:6, borderRadius:"50%", background:"var(--purple)", display:"inline-block" }} />
                <span className="dot3" style={{ width:6, height:6, borderRadius:"50%", background:"var(--purple)", display:"inline-block" }} />
              </div>
            )}
            <div ref={agentBottomRef} />
          </div>
          <div style={{ padding:8, borderTop:`1px solid var(--border)`, display:"flex", gap:7 }}>
            <input className="inp" style={{ flex:1, fontSize:12.5 }} placeholder="Ask your AI agent…"
              value={agentInput} onChange={e => setAgentInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendAgent(agentInput)} />
            <button className="btn btn-gold" style={{ padding:"8px 10px", flexShrink:0 }} onClick={() => sendAgent(agentInput)}>➤</button>
          </div>
        </div>
      )}
    </div>
  );
}




// ── PROFILE PANEL ──
function ProfilePanel({ user, users, setUsers, setUser, showToast }) {
  const [editName, setEditName] = useState(user.name || "");
  const [editing, setEditing]   = useState(false);
  const [editPass, setEditPass] = useState("");
  const [newPass, setNewPass]   = useState("");

  const saveName = () => {
    if (!editName.trim()) return showToast("Name required", "err");
    if (user.isAdmin) setUser(prev => ({ ...prev, name: editName.trim() }));
    else {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, name: editName.trim() } : u));
      setUser(prev => ({ ...prev, name: editName.trim() }));
    }
    setEditing(false); showToast("Name updated ✓");
  };

  const changePass = () => {
    if (newPass.length < 8) return showToast("Min 8 characters", "err");
    if (!/[0-9]/.test(newPass)) return showToast("Password must contain a number", "err");
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(newPass)) return showToast("Password must contain a symbol", "err");
    const u = users.find(u => u.id === user.id);
    if (!u || u.pass !== editPass) return showToast("Current password incorrect", "err");
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, pass: newPass } : u));
    setEditPass(""); setNewPass(""); showToast("Password changed ✓");
  };

  return (
    <div style={{ padding:14, overflowY:"auto" }}>
      <div style={{ textAlign:"center", marginBottom:18 }}>
        <div style={{ width:64, height:64, borderRadius:18, background:"var(--gold-dim)", border:"2px solid var(--gold-brd)", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:24, marginBottom:8 }}>
          {user.isAdmin ? "🛡️" : (user.name?.[0]?.toUpperCase() || "U")}
        </div>
        <div style={{ fontWeight:800, fontSize:15 }}>{user.name}</div>
        <div style={{ color:"var(--txt2)", fontSize:12.5, marginTop:2 }}>{user.email}</div>
        {user.isAdmin && <span style={{ fontSize:10.5, color:"var(--gold)", background:"var(--gold-dim)", padding:"2px 10px", borderRadius:100, marginTop:5, display:"inline-block", fontWeight:700 }}>Administrator</span>}
      </div>

      <div className="settings-section">
        <div style={{ fontSize:11, fontWeight:700, color:"var(--txt3)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Edit Name</div>
        <div style={{ display:"flex", gap:7 }}>
          <input className="inp" placeholder="Display name" value={editing ? editName : user.name}
            onChange={e => { setEditName(e.target.value); setEditing(true); }}
            onFocus={() => { setEditing(true); setEditName(user.name); }} />
          {editing && <button className="btn btn-gold" style={{ flexShrink:0 }} onClick={saveName}>Save</button>}
        </div>
      </div>

      {!user.isAdmin && (
        <div className="settings-section">
          <div style={{ fontSize:11, fontWeight:700, color:"var(--txt3)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Change Password</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <input className="inp" type="password" placeholder="Current password" value={editPass} onChange={e => setEditPass(e.target.value)} />
            <input className="inp" type="password" placeholder="New password (min 6)" value={newPass} onChange={e => setNewPass(e.target.value)} />
            <button className="btn btn-ghost" onClick={changePass}>Update Password</button>
          </div>
        </div>
      )}

      <div className="settings-section">
        <div style={{ fontSize:11, fontWeight:700, color:"var(--txt3)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Account Info</div>
        <div style={{ fontSize:13, color:"var(--txt2)", lineHeight:2.2 }}>
          <div>Joined: {user.joinedAt ? new Date(user.joinedAt).toLocaleDateString() : "N/A"}</div>
          <div>Account: {user.isAdmin ? "Administrator" : "Standard User"}</div>
        </div>
      </div>
    </div>
  );
}

// ── AUTH SCREEN ──
function AuthScreen({ view, setView, onLogin, onRegister, onConsent, onDecline, onGoogleLogin }) {
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass]   = useState("");
  const [show, setShow]   = useState(false);

  const submit = () => {
    if (view === "login") onLogin(email, pass);
    else onRegister(name, email, pass);
  };

  if (view === "consent") {
    return (
      <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
        <style>{CSS}</style>
        <div className="modal-box" style={{ maxWidth:460 }}>
          <div style={{ textAlign:"center", marginBottom:18 }}>
            <div style={{ fontSize:30, marginBottom:8 }}>📋</div>
            <h2 style={{ fontSize:17, fontWeight:800 }}>Privacy & Consent</h2>
            <p style={{ color:"var(--txt2)", fontSize:13, marginTop:7, lineHeight:1.7 }}>By using FFChatbot AI, you agree to our terms. Your conversations help improve the AI. We do not sell your data.</p>
          </div>
          <div style={{ background:"var(--bg3)", border:`1px solid var(--border)`, borderRadius:10, padding:14, marginBottom:18, fontSize:13, color:"var(--txt2)", lineHeight:2.2 }}>
            ✅ Data stored locally on your device<br/>
            ✅ Not shared with third parties<br/>
            ✅ Delete your account anytime<br/>
            ✅ Conversations help train the AI
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button className="btn btn-gold" style={{ flex:1, justifyContent:"center" }} onClick={onConsent}>Accept & Continue</button>
            <button className="btn btn-ghost" style={{ flex:1, justifyContent:"center" }} onClick={onDecline}>Decline</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <style>{CSS}</style>
      <div style={{ width:"100%", maxWidth:380 }} className="anim-pop">
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:"linear-gradient(135deg, #f5a623, #f7b540)", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:22, marginBottom:10, boxShadow:"0 8px 28px rgba(245,166,35,0.3)", fontWeight:900, color:"#000" }}>✦</div>
          <h1 style={{ fontSize:22, fontWeight:800, background:"linear-gradient(135deg, #f5a623, #ffd475)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", letterSpacing:"-0.03em" }}>FFChatbot AI</h1>
          <p style={{ color:"var(--txt3)", fontSize:12.5, marginTop:3, fontWeight:500 }}>Self-Thinking AI — v3.0</p>
        </div>

        <div style={{ display:"flex", gap:5, background:"var(--bg3)", borderRadius:12, padding:4, marginBottom:22 }}>
          <button className={`tab ${view === "login" ? "on" : "off"}`} style={{ flex:1 }} onClick={() => setView("login")}>Sign In</button>
          <button className={`tab ${view === "register" ? "on" : "off"}`} style={{ flex:1 }} onClick={() => setView("register")}>Register</button>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
          {view === "register" && (
            <input className="inp" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} autoFocus />
          )}
          <input className="inp" type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
          <div style={{ position:"relative" }}>
            <input className="inp" type={show ? "text" : "password"} placeholder={view === "register" ? "Password (8+ chars, number & symbol)" : "Password"}
              value={pass} onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              style={{ paddingRight:42 }} />
            <button onClick={() => setShow(p => !p)}
              style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"var(--txt3)", cursor:"pointer", fontSize:15 }}>
              {show ? "🙈" : "👁️"}
            </button>
          </div>
          <button className="btn btn-gold" style={{ width:"100%", justifyContent:"center", padding:"12px" }} onClick={submit}>
            {view === "login" ? "Sign In" : "Create Account"}
          </button>

          {/* Divider */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ flex:1, height:1, background:"var(--border)" }} />
            <span style={{ color:"var(--txt3)", fontSize:11.5, fontWeight:500 }}>OR</span>
            <div style={{ flex:1, height:1, background:"var(--border)" }} />
          </div>

          {/* Google Sign-In Button */}
          <button
            style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:"11px 16px",
              background:"#fff", color:"#1a1a1a", border:"none", borderRadius:10, cursor:"pointer",
              fontSize:14, fontWeight:600, fontFamily:"inherit", transition:"all 0.14s",
              boxShadow:"0 2px 8px rgba(0,0,0,0.3)" }}
            onMouseEnter={e => e.currentTarget.style.background="#f5f5f5"}
            onMouseLeave={e => e.currentTarget.style.background="#fff"}
            onClick={() => onGoogleLogin()}>
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <p style={{ textAlign:"center", color:"var(--txt3)", fontSize:12, marginTop:18, fontWeight:500 }}>
          Made with ❤️ by FFChatbot AI Team
        </p>
      </div>
    </div>
  );
}
