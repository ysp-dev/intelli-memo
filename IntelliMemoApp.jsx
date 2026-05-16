import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Flame,
  KeyRound,
  ListFilter,
  MessageSquareText,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const TAGS = ["#업무", "#아이디어", "#개인"];

const TAG_STYLES = {
  "#업무":    { bg: "#ede9fe", color: "#5b21b6", dot: "#7c3aed" },
  "#아이디어": { bg: "#ecfeff", color: "#0e7490", dot: "#06b6d4" },
  "#개인":    { bg: "#fce7f3", color: "#9d174d", dot: "#ec4899" },
};

const DEFAULT_TAG = TAGS[0];

const ACTION_FILTERS = [
  { key: "all",    label: "전체" },
  { key: "active", label: "진행 중" },
  { key: "done",   label: "완료" },
];

const DEFAULT_AI_MODEL = "gemini-2.5-flash";

const AI_MODELS = [
  { key: "gemini-2.5-pro",        label: "Gemini 2.5 Pro" },
  { key: "gemini-2.5-flash",      label: "Gemini 2.5 Flash 추천" },
  { key: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { key: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite" },
];

const UNDO_DELAY_MS = 3500;

// ─── Utilities ───────────────────────────────────────────────────────────────

const nowIso = () => new Date().toISOString();

const createId = () =>
  window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const unwrapStorage = (v) =>
  typeof v === "string" ? v : (v?.value ?? null);

const loadJson = async (key, fallback) => {
  try {
    if (!window.storage?.get) return fallback;
    const raw = unwrapStorage(await window.storage.get(key));
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};

const saveJson = async (key, value) => {
  try {
    if (!window.storage?.set) return;
    await window.storage.set(key, JSON.stringify(value));
  } catch {}
};

const relativeTime = (iso, tick) => {
  const diff = Math.max(0, tick - new Date(iso).getTime());
  const min  = Math.floor(diff / 60_000);
  const hr   = Math.floor(diff / 3_600_000);
  if (min < 1)  return "방금";
  if (min < 60) return `${min}분 전`;
  if (hr  < 24) return `${hr}시간 전`;
  if (hr  < 48) return "어제";
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};

const dateGroupLabel = (iso) => {
  const now    = new Date();
  const date   = new Date(iso);
  const diffMs = now.setHours(0,0,0,0) - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (diffMs < 0)          return "오늘";
  if (diffMs < 86_400_000) return "오늘";
  if (diffMs < 172_800_000)return "어제";
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

const isPastDue = (date, done) => {
  if (!date || done) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(`${date}T00:00:00`) < today;
};

const formatDue = (date) => {
  if (!date) return "마감 없음";
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const copyToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const el = Object.assign(document.createElement("textarea"), {
    value: text, style: "position:fixed;top:-9999px",
  });
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  el.remove();
};

const getModelFallbacks = (model) => {
  const keys = AI_MODELS.map((m) => m.key);
  return keys.slice(Math.max(0, keys.indexOf(model)));
};

const normalizeModel = (model) =>
  AI_MODELS.some((m) => m.key === model) ? model : DEFAULT_AI_MODEL;

const extractText = (res) => {
  for (const c of res.candidates ?? []) {
    const t = (c.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (t) return t;
  }
  return "";
};

const apiError = (status, errorText) => {
  let msg = errorText;
  try { const p = JSON.parse(errorText); msg = p?.error?.message || p?.message || errorText; } catch {}
  const n = msg.toLowerCase();
  if (n.includes("api key not valid") || n.includes("invalid api key")) return "API 키가 유효하지 않습니다.";
  if (n.includes("quota") || n.includes("rate limit") || n.includes("resource_exhausted")) return "API 사용량 한도 초과";
  if (n.includes("billing")) return "Google Cloud 결제 설정을 확인하세요.";
  if (n.includes("permission") || n.includes("forbidden")) return "API 키 권한을 확인하세요.";
  if (status === 400) return "API 키 또는 요청 형식 오류";
  if (status === 401) return "API 키 인증 실패";
  if (status === 403) return "API 키 권한 없음";
  if (status === 404 && n.includes("model")) return "선택한 모델 없음";
  if (status === 429) return "요청 한도 초과, 잠시 후 재시도";
  if (status >= 500) return "Gemini 서버 오류";
  return msg || `오류 ${status}`;
};

const correctKorean = async ({ apiKey, model, text, type }) => {
  const instruction =
    "You proofread Korean quick-capture notes. Return only the fully corrected Korean text. Preserve every idea, detail, line break, meaning, intent, and tone. Do not summarize, shorten, omit, add explanations, labels, quotation marks, markdown, or alternatives. If the text is already natural, return it unchanged.";
  const prompt = `${instruction}\n\n${type === "actions" ? "액션 아이템" : "메모"} 전체 내용을 자연스러운 한국어로 교정해줘. 절대 줄이거나 누락하지 마.\n\n${text}`;

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
        }),
      },
    );
  } catch (e) {
    throw new Error(e instanceof TypeError ? "네트워크 연결을 확인하세요." : "API 호출 실패");
  }

  if (!res.ok) throw new Error(apiError(res.status, await res.text()));

  const data = await res.json();
  if ((data.candidates ?? []).some((c) => c.finishReason === "MAX_TOKENS"))
    throw new Error("결과가 너무 길어 중단됐습니다. 텍스트를 나눠서 교정하세요.");
  const corrected = extractText(data);
  if (!corrected) throw new Error("교정 결과가 비어 있습니다.");
  return corrected;
};

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
  *, *::before, *::after { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body, #root { margin: 0; padding: 0; min-height: 100%; }

  body {
    background: #f0eeea;
    font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo',
                 'Pretendard', 'Noto Sans KR', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    color: #111;
  }

  button, input, textarea, select {
    font: inherit; border: none; outline: none;
    background: none; padding: 0; margin: 0; cursor: pointer;
  }

  textarea { resize: none; }

  :root {
    --bg:       #f0eeea;
    --surface:  #ffffff;
    --raised:   #f7f6f3;

    --t1: #111111;
    --t2: #555555;
    --t3: #999999;

    --border:   rgba(0,0,0,0.07);
    --border-2: rgba(0,0,0,0.13);

    --accent:      #5b21b6;
    --accent-bg:   #ede9fe;
    --accent-mid:  #7c3aed;

    --red:    #dc2626;
    --red-bg: #fee2e2;

    --amber:    #d97706;
    --amber-bg: #fffbeb;

    --green:    #16a34a;
    --green-bg: #f0fdf4;

    --sh1: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    --sh2: 0 4px 16px rgba(0,0,0,0.07), 0 2px 6px rgba(0,0,0,0.04);
    --sh3: 0 12px 40px rgba(0,0,0,0.09), 0 4px 12px rgba(0,0,0,0.05);

    --r-s: 8px;
    --r-m: 14px;
    --r-l: 20px;
    --r-xl: 26px;
  }

  /* ── App ── */
  .app { min-height: 100vh; min-height: 100dvh; background: var(--bg); display: flex; justify-content: center; }

  .frame {
    position: relative;
    width: min(100vw, 430px);
    min-height: 100vh;
    min-height: 100dvh;
  }

  /* ── Header ── */
  .hdr {
    position: fixed; z-index: 40;
    top: 0; left: 50%; transform: translateX(-50%);
    width: min(100vw, 430px);
    padding-top: env(safe-area-inset-top);
    background: rgba(240,238,234,0.94);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-bottom: 1px solid var(--border);
    transition: background 180ms ease;
  }

  .hdr.compact { background: rgba(240,238,234,0.98); }

  .hdr-body {
    padding: 14px 16px 12px;
    display: flex; flex-direction: column; gap: 11px;
  }

  .hdr-top { display: flex; align-items: flex-start; justify-content: space-between; }

  .brand h1 {
    margin: 0;
    font-size: 26px; font-weight: 800;
    letter-spacing: -0.04em; line-height: 1.1;
    color: var(--t1);
  }
  .brand p {
    margin: 3px 0 0;
    font-size: 10px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--t3);
  }

  .hdr.compact .brand h1 { font-size: 20px; }

  .gemini-badge {
    display: inline-flex; align-items: center; gap: 5px;
    height: 30px; padding: 0 11px;
    border-radius: 999px;
    background: var(--accent-bg); color: var(--accent);
    font-size: 11px; font-weight: 700;
  }

  /* ── Segment control ── */
  .seg {
    position: relative; display: grid; grid-template-columns: 1fr 1fr;
    height: 44px; padding: 3px;
    border-radius: var(--r-m);
    background: rgba(0,0,0,0.055);
    overflow: hidden;
  }

  .seg-thumb {
    position: absolute; top: 3px; left: 3px;
    width: calc(50% - 3px); height: calc(100% - 6px);
    border-radius: 11px;
    background: var(--surface);
    box-shadow: var(--sh1);
  }

  .seg button {
    position: relative; z-index: 1;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    border-radius: 11px;
    font-size: 13px; font-weight: 600;
    color: var(--t3);
    min-height: 0; min-width: 0;
    transition: color 160ms ease;
  }
  .seg button.on { color: var(--t1); }

  /* ── Filter bar ── */
  .filter-bar { display: flex; align-items: center; gap: 6px; }

  .filter-bar svg { color: var(--t3); flex-shrink: 0; }

  .f-chip {
    height: 28px; padding: 0 12px; border-radius: 999px;
    font-size: 12px; font-weight: 600; color: var(--t2);
    background: rgba(0,0,0,0.045); border: 1px solid transparent;
    min-height: 0; min-width: 0;
    transition: background 130ms ease, color 130ms ease;
  }
  .f-chip.on { background: var(--accent-bg); color: var(--accent); border-color: rgba(91,33,182,0.15); }

  /* ── Tag filter strip (memo view) ── */
  .tag-filter-strip {
    display: flex; align-items: center; gap: 6px; margin-bottom: 12px;
    overflow-x: auto; scrollbar-width: none;
  }
  .tag-filter-strip::-webkit-scrollbar { display: none; }

  .tf-chip {
    display: inline-flex; align-items: center; gap: 5px;
    height: 28px; padding: 0 10px; border-radius: 999px;
    font-size: 11px; font-weight: 700;
    white-space: nowrap; flex-shrink: 0;
    border: 1.5px solid var(--border); color: var(--t2);
    background: var(--surface);
    min-height: 0; min-width: 0;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  }

  .tf-chip-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }

  .tf-chip.on[data-tag="all"]    { background: var(--t1); color: #fff; border-color: var(--t1); }
  .tf-chip.on[data-tag="#업무"]   { background: #ede9fe; color: #5b21b6; border-color: rgba(124,58,237,0.3); }
  .tf-chip.on[data-tag="#아이디어"]{ background: #ecfeff; color: #0e7490; border-color: rgba(6,182,212,0.3); }
  .tf-chip.on[data-tag="#개인"]   { background: #fce7f3; color: #9d174d; border-color: rgba(236,72,153,0.25); }

  /* ── Scroll stage ── */
  .stage {
    width: min(100vw, 430px);
    height: 100vh; height: 100dvh;
    overflow-y: auto; scrollbar-width: none;
    padding: 180px 14px 230px;
  }
  .stage::-webkit-scrollbar { display: none; }

  /* ── Section label ── */
  .sec-label {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 10px;
  }
  .sec-label-text {
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase; color: var(--t3);
  }
  .count-badge {
    display: flex; align-items: center;
    height: 20px; padding: 0 8px; border-radius: 999px;
    background: rgba(0,0,0,0.06);
    font-size: 11px; font-weight: 700; color: var(--t2);
  }

  /* ── Date group ── */
  .date-group { margin-bottom: 16px; }

  .date-group-label {
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--t3); margin-bottom: 6px;
    padding: 0 2px;
  }

  /* ── Memo group card ── */
  .memo-group {
    background: var(--surface);
    border-radius: var(--r-l);
    border: 1px solid var(--border);
    box-shadow: var(--sh1);
    overflow: hidden;
  }

  .swipe-wrap { position: relative; overflow: hidden; }
  .memo-group .swipe-wrap + .swipe-wrap { border-top: 1px solid var(--border); }

  .swipe-bg {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: flex-end;
    padding-right: 22px;
    background: linear-gradient(to right, transparent 30%, var(--red-bg));
    color: var(--red);
  }

  /* ── Memo card ── */
  .memo-card {
    position: relative; width: 100%;
    padding: 13px 16px 14px;
    background: var(--surface);
    touch-action: pan-y; text-align: left;
    transition: background 110ms ease;
  }
  .memo-card:active { background: var(--raised); }

  .memo-top {
    display: flex; align-items: center;
    justify-content: space-between; gap: 8px;
    margin-bottom: 7px;
  }

  .memo-meta { display: flex; align-items: center; gap: 8px; min-width: 0; }

  .tag-badge {
    display: inline-flex; align-items: center; gap: 5px;
    height: 22px; padding: 0 9px; border-radius: 999px;
    font-size: 11px; font-weight: 700; flex-shrink: 0;
  }
  .tag-badge-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }

  .memo-time {
    font-size: 11px; color: var(--t3);
    white-space: nowrap; min-width: 0;
    font-variant-numeric: tabular-nums;
  }

  .copy-btn {
    display: grid; place-items: center;
    width: 28px; height: 28px;
    border-radius: var(--r-s);
    color: var(--t3); background: var(--raised);
    flex-shrink: 0; min-height: 0; min-width: 0;
    transition: background 110ms ease, color 110ms ease;
  }
  .copy-btn.copied { background: var(--accent-bg); color: var(--accent); }

  .memo-body {
    margin: 0;
    font-size: 14px; font-weight: 400; line-height: 1.65;
    color: var(--t1); overflow-wrap: anywhere;
  }

  .memo-body.truncated {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .expand-btn {
    display: inline-flex; align-items: center; gap: 3px;
    margin-top: 5px;
    font-size: 12px; font-weight: 600; color: var(--accent);
    background: none; min-height: 0; min-width: 0;
  }

  .memo-editor {
    width: 100%; margin-top: 8px;
    padding: 10px 12px; border: 1.5px solid rgba(91,33,182,0.3);
    border-radius: var(--r-s); background: var(--accent-bg);
    color: var(--t1); font-size: 14px; line-height: 1.65;
    caret-color: var(--accent); min-height: 72px;
  }

  .save-hint {
    margin-top: 6px;
    font-size: 11px; color: var(--t3); text-align: right;
  }

  /* ── Action list ── */
  .action-list { display: flex; flex-direction: column; gap: 8px; }

  /* ── Progress bar ── */
  .progress-bar-wrap { margin-bottom: 12px; }
  .progress-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 6px;
  }
  .progress-label { font-size: 12px; font-weight: 600; color: var(--t2); }
  .progress-pct { font-size: 12px; font-weight: 700; color: var(--accent); }

  .progress-track {
    height: 6px; border-radius: 999px;
    background: rgba(0,0,0,0.07); overflow: hidden;
  }
  .progress-fill {
    height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, var(--accent-mid), var(--accent));
    transition: width 400ms ease;
  }

  /* ── Action card ── */
  .action-card {
    position: relative; display: flex; align-items: flex-start; gap: 12px;
    padding: 14px 16px;
    background: var(--surface);
    border-radius: var(--r-l);
    border: 1px solid var(--border);
    box-shadow: var(--sh1);
    touch-action: pan-y;
    transition: opacity 200ms ease;
  }
  .action-card.hi { border-left: 3px solid #f59e0b; }
  .action-card.done { opacity: 0.38; }

  /* ── Checkbox ── */
  .chk {
    flex-shrink: 0; width: 24px; height: 24px; margin-top: 1px;
    border-radius: 6px; border: 2px solid var(--border-2);
    background: var(--surface); display: grid; place-items: center;
    color: transparent; min-height: 0; min-width: 0;
    transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
  }
  .chk.checked { background: var(--accent); border-color: var(--accent); color: #fff; }

  .action-body { flex: 1; min-width: 0; }

  .action-text {
    margin: 0 0 6px;
    font-size: 14px; font-weight: 500; line-height: 1.55;
    color: var(--t1); overflow-wrap: anywhere;
  }
  .action-card.done .action-text { text-decoration: line-through; color: var(--t3); }

  .action-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

  .m-chip {
    display: inline-flex; align-items: center; gap: 4px;
    height: 22px; padding: 0 8px; border-radius: 999px;
    font-size: 11px; font-weight: 600;
    color: var(--t3); background: var(--raised); border: 1px solid var(--border);
  }
  .m-chip.overdue { color: var(--amber); background: var(--amber-bg); border-color: rgba(217,119,6,0.2); }
  .m-chip.hi-pill { color: var(--amber); background: var(--amber-bg); border-color: rgba(217,119,6,0.2); }

  /* ── Empty state ── */
  .empty {
    min-height: 260px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 14px; text-align: center;
  }
  .empty-icon {
    width: 54px; height: 54px;
    border-radius: var(--r-l);
    background: var(--accent-bg); color: var(--accent);
    display: grid; place-items: center;
  }
  .empty p {
    margin: 0; font-size: 14px; font-weight: 500;
    color: var(--t3); line-height: 1.6; max-width: 220px;
  }

  /* ── Skeleton ── */
  .skel-wrap { display: flex; flex-direction: column; gap: 8px; }
  .skel {
    border-radius: var(--r-l);
    background: linear-gradient(90deg, rgba(0,0,0,0.04) 25%, rgba(0,0,0,0.07) 50%, rgba(0,0,0,0.04) 75%);
    background-size: 300% 100%;
    animation: skel 1.3s ease-in-out infinite;
  }
  @keyframes skel { 0% { background-position: 120% 0; } 100% { background-position: -120% 0; } }

  /* ── Composer (bottom sheet) ── */
  .composer {
    position: fixed; z-index: 40;
    bottom: 0; left: 50%; transform: translateX(-50%);
    width: min(100vw, 430px);
    padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
    background: rgba(255,255,255,0.97);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-top: 1px solid var(--border);
    box-shadow: 0 -6px 24px rgba(0,0,0,0.06);
  }

  .handle {
    width: 32px; height: 4px; border-radius: 999px;
    background: rgba(0,0,0,0.12); margin: 0 auto 14px;
  }

  /* Tag selector */
  .tag-row { display: flex; gap: 6px; margin-bottom: 10px; }

  .tag-btn {
    flex: 1; height: 38px; border-radius: var(--r-s);
    font-size: 12px; font-weight: 700;
    color: var(--t2); background: var(--raised);
    border: 1.5px solid var(--border);
    min-height: 0; min-width: 0;
    transition: background 130ms ease, color 130ms ease, border-color 130ms ease;
  }
  .tag-btn.on[data-tag="#업무"]    { background: #ede9fe; color: #5b21b6; border-color: rgba(124,58,237,0.28); }
  .tag-btn.on[data-tag="#아이디어"] { background: #ecfeff; color: #0e7490; border-color: rgba(6,182,212,0.28); }
  .tag-btn.on[data-tag="#개인"]    { background: #fce7f3; color: #9d174d; border-color: rgba(236,72,153,0.25); }

  /* Textarea composer */
  .textarea-wrap {
    position: relative;
    border-radius: var(--r-m); border: 1.5px solid var(--border);
    background: var(--raised);
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  .textarea-wrap:focus-within {
    border-color: rgba(91,33,182,0.35);
    box-shadow: 0 0 0 3px rgba(91,33,182,0.06);
    background: #fff;
  }

  .composer-textarea {
    width: 100%; min-height: 52px; max-height: 160px;
    padding: 14px 16px 10px;
    font-size: 15px; font-weight: 400; line-height: 1.5;
    color: var(--t1); overflow-y: auto;
    caret-color: var(--accent);
    display: block;
  }
  .composer-textarea::placeholder { color: var(--t3); }

  .textarea-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 10px 8px;
  }

  .char-hint {
    font-size: 11px; color: var(--t3);
    font-variant-numeric: tabular-nums;
  }

  .btn-row { display: flex; align-items: center; gap: 6px; }

  .icon-btn {
    display: grid; place-items: center;
    width: 36px; height: 36px;
    border-radius: var(--r-s);
    flex-shrink: 0; min-height: 0; min-width: 0;
  }

  .btn-ai {
    color: var(--accent); background: var(--accent-bg);
    transition: background 120ms ease, opacity 120ms ease;
  }
  .btn-ai:disabled { opacity: 0.3; cursor: default; }
  .btn-ai.spinning svg { animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .btn-clear {
    color: var(--t3); background: var(--raised);
  }

  .btn-submit {
    width: 44px; height: 44px; border-radius: var(--r-m);
    background: var(--t1); color: #fff;
    box-shadow: var(--sh1);
    transition: transform 120ms ease, background 120ms ease;
  }
  .btn-submit:active { transform: scale(0.93); background: #333; }
  .btn-submit:disabled { opacity: 0.25; cursor: default; }

  /* Action controls */
  .action-ctrl { display: flex; gap: 8px; margin-bottom: 10px; }

  .ctrl {
    flex: 1; height: 38px;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    border-radius: var(--r-s);
    font-size: 12px; font-weight: 600;
    color: var(--t2); background: var(--raised); border: 1.5px solid var(--border);
    min-height: 0; min-width: 0;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .ctrl.hi-on { background: var(--amber-bg); color: var(--amber); border-color: rgba(217,119,6,0.25); }
  .ctrl input[type="date"] {
    font-size: 12px; font-weight: 600; color: var(--t1);
    color-scheme: light; cursor: pointer; flex: 1; text-align: center;
  }

  /* AI row */
  .ai-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin-top: 10px;
  }

  .ai-key-btn {
    display: flex; align-items: center; gap: 5px;
    height: 26px; padding: 0 10px; border-radius: 999px;
    font-size: 11px; font-weight: 700;
    color: var(--t2); background: var(--raised); border: 1px solid var(--border);
    min-height: 0; min-width: 0; white-space: nowrap;
  }

  .ai-msg {
    font-size: 11px; font-weight: 600; color: var(--t3);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    min-width: 0; background: none; min-height: 0; cursor: pointer;
  }
  .ai-msg.loading, .ai-msg.success { color: var(--accent); }
  .ai-msg.error { color: var(--red); }

  /* AI panel */
  .ai-panel {
    display: grid; grid-template-columns: 1fr 148px; gap: 8px;
    overflow: hidden; margin-top: 10px;
  }
  .ai-panel input,
  .ai-panel select {
    height: 40px; padding: 0 12px;
    border-radius: var(--r-s); border: 1.5px solid var(--border);
    background: var(--raised); font-size: 12px; font-weight: 500;
    color: var(--t1); min-width: 0;
    transition: border-color 140ms ease;
  }
  .ai-panel input:focus, .ai-panel select:focus { border-color: rgba(91,33,182,0.3); }

  /* ── Toast ── */
  .toast {
    position: fixed; z-index: 60;
    bottom: calc(env(safe-area-inset-bottom) + 16px);
    left: 50%; transform: translateX(-50%);
    width: min(calc(100vw - 32px), 380px);
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 0 16px;
    height: 52px;
    border-radius: var(--r-l);
    background: #1a1a1a; color: #fff;
    box-shadow: var(--sh3);
    pointer-events: all;
  }

  .toast-msg { font-size: 13px; font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .toast-undo {
    display: flex; align-items: center; gap: 5px;
    height: 32px; padding: 0 12px; border-radius: 999px;
    background: rgba(255,255,255,0.15); color: #fff;
    font-size: 12px; font-weight: 700;
    flex-shrink: 0; min-height: 0; min-width: 0;
    transition: background 120ms ease;
  }
  .toast-undo:hover { background: rgba(255,255,255,0.22); }

  /* ── Error toast ── */
  .err-toast {
    position: fixed; z-index: 70;
    top: calc(env(safe-area-inset-top) + 16px);
    left: 50%; transform: translateX(-50%);
    width: min(calc(100vw - 32px), 380px);
    display: flex; align-items: flex-start; gap: 10px;
    padding: 14px 16px;
    border-radius: var(--r-l);
    background: var(--surface); color: var(--t1);
    border: 1px solid rgba(220,38,38,0.18);
    box-shadow: var(--sh3);
  }

  .err-toast-icon { color: var(--red); flex-shrink: 0; margin-top: 1px; }
  .err-toast-body { flex: 1; min-width: 0; }
  .err-toast-title { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
  .err-toast-msg { font-size: 12px; color: var(--t2); line-height: 1.5; overflow-wrap: anywhere; }
  .err-toast-model { font-size: 11px; color: var(--t3); margin-top: 4px; font-family: ui-monospace, monospace; }
  .err-toast-close { color: var(--t3); width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--r-s); min-height: 0; min-width: 0; flex-shrink: 0; transition: background 100ms ease; }
  .err-toast-close:hover { background: var(--raised); }

  /* ── Hover states ── */
  @media (hover: hover) {
    .copy-btn:hover { background: var(--accent-bg); color: var(--accent); }
    .memo-card:hover { background: var(--raised); }
    .action-card:hover { border-color: rgba(91,33,182,0.14); }
    .tag-btn:hover:not(.on) { background: rgba(0,0,0,0.07); }
    .ctrl:hover:not(.hi-on) { background: rgba(0,0,0,0.06); }
  }

  /* ── Landscape narrow ── */
  @media (min-width: 640px) and (max-height: 540px) and (orientation: landscape) {
    .frame {
      width: 100vw;
      display: grid;
      grid-template-columns: 240px 1fr;
      grid-template-areas: "hdr stage" "composer stage";
    }
    .hdr {
      grid-area: hdr;
      position: relative; top: auto; left: auto; transform: none; width: auto;
      border-right: 1px solid var(--border); border-bottom: none;
    }
    .stage { grid-area: stage; width: 100%; height: 100dvh; padding: 12px; }
    .composer {
      grid-area: composer;
      position: relative; bottom: auto; left: auto; transform: none;
      width: auto; border-top: 1px solid var(--border);
      border-right: 1px solid var(--border); box-shadow: none;
      background: #fff;
    }
    .handle { display: none; }
    .tag-row { flex-wrap: wrap; }
    .tag-btn { flex: 1 1 calc(50% - 3px); }
    .ai-panel { grid-template-columns: 1fr; }
  }

  /* ── Landscape desktop ── */
  @media (min-width: 900px) and (orientation: landscape) {
    .app { align-items: center; padding: 28px; }
    .frame {
      width: min(calc(100vw - 56px), 1180px);
      height: min(840px, calc(100dvh - 56px));
      min-height: 0;
      border-radius: 24px; border: 1px solid var(--border-2);
      box-shadow: var(--sh3); background: var(--bg); overflow: hidden;
      display: grid;
      grid-template-columns: 256px 1fr 316px;
      grid-template-areas: "hdr stage composer";
    }
    .hdr {
      grid-area: hdr;
      position: relative; top: auto; left: auto; transform: none;
      width: auto; height: 100%;
      border-right: 1px solid var(--border); border-bottom: none;
      border-radius: 24px 0 0 24px;
      background: var(--bg);
    }
    .hdr-body { height: 100%; padding: 22px 18px; }
    .stage {
      grid-area: stage;
      width: 100%; height: 100%; padding: 22px 20px;
    }
    .memo-group, .action-list, .skel-wrap { max-width: 540px; margin-left: auto; margin-right: auto; }
    .composer {
      grid-area: composer;
      position: relative; bottom: auto; left: auto; transform: none;
      width: auto; height: 100%;
      border-top: none; border-left: 1px solid var(--border);
      border-radius: 0 24px 24px 0; box-shadow: none;
      background: #fff; padding: 22px 18px;
    }
    .handle { display: none; }
    .action-ctrl { flex-direction: column; }
    .ai-panel { grid-template-columns: 1fr; }
  }

  @media (min-width: 1180px) and (orientation: landscape) {
    .frame { grid-template-columns: 276px 1fr 340px; }
  }
`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function TagBadge({ tag }) {
  const s = TAG_STYLES[tag] ?? { bg: "#f3f4f6", color: "#6b7280", dot: "#9ca3af" };
  return (
    <span className="tag-badge" style={{ background: s.bg, color: s.color }}>
      <span className="tag-badge-dot" style={{ background: s.dot }} />
      {tag}
    </span>
  );
}

function Header({ activeView, setActiveView, actionFilter, setActionFilter, compact }) {
  return (
    <header className={`hdr${compact ? " compact" : ""}`}>
      <div className="hdr-body">
        <div className="hdr-top">
          <div className="brand">
            <h1>인텔리메모</h1>
            <p>IntelliMemo</p>
          </div>
          <span className="gemini-badge">
            <Sparkles size={11} />
            Gemini AI
          </span>
        </div>

        <div className="seg" role="tablist">
          <motion.div
            className="seg-thumb"
            animate={{ x: activeView === "memos" ? 0 : "100%" }}
            transition={{ type: "spring", stiffness: 440, damping: 38 }}
          />
          <button
            type="button"
            className={activeView === "memos" ? "on" : ""}
            onClick={() => setActiveView("memos")}
            role="tab"
            aria-selected={activeView === "memos"}
          >
            <MessageSquareText size={14} />
            메모
          </button>
          <button
            type="button"
            className={activeView === "actions" ? "on" : ""}
            onClick={() => setActiveView("actions")}
            role="tab"
            aria-selected={activeView === "actions"}
          >
            <CheckCircle2 size={14} />
            액션
          </button>
        </div>

        <AnimatePresence initial={false}>
          {activeView === "actions" && (
            <motion.div
              className="filter-bar"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <ListFilter size={13} />
              {ACTION_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`f-chip${actionFilter === f.key ? " on" : ""}`}
                  onClick={() => setActionFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

function SkeletonList() {
  return (
    <div className="skel-wrap">
      {[82, 104, 68, 94, 76].map((h, i) => (
        <div key={i} className="skel" style={{ height: h }} />
      ))}
    </div>
  );
}

function EmptyState({ type }) {
  return (
    <motion.div
      className="empty"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
    >
      <div className="empty-icon">
        <Sparkles size={22} />
      </div>
      <p>{type === "memos" ? "생각이 떠오르면 바로 기록하세요" : "할 일을 추가해 보세요"}</p>
    </motion.div>
  );
}

function MemoCard({ memo, index, tick, onDelete, onEdit }) {
  const [editing,   setEditing]   = useState(false);
  const [draft,     setDraft]     = useState(memo.text);
  const [copied,    setCopied]    = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const editorRef = useRef(null);

  const isLong = memo.text.split("\n").length > 4 || memo.text.length > 200;

  useEffect(() => { if (editing) editorRef.current?.focus(); }, [editing]);
  useEffect(() => { if (!editing) setDraft(memo.text); }, [editing, memo.text]);

  const commit = () => {
    const t = draft.trim();
    if (t) onEdit(memo.id, t);
    setEditing(false);
  };

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await copyToClipboard(memo.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  return (
    <motion.div className="swipe-wrap">
      <div className="swipe-bg"><Trash2 size={15} /></div>
      <motion.article
        layout="position"
        drag="x"
        dragConstraints={{ left: -108, right: 0 }}
        dragElastic={0.055}
        onDragEnd={(_, info) => {
          if (info.offset.x < -80 || info.velocity.x < -480) onDelete(memo.id);
        }}
        onTap={() => !editing && setEditing(true)}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -80 }}
        whileTap={{ scale: 0.992 }}
        transition={{ type: "spring", stiffness: 300, damping: 28, delay: index * 0.018 }}
        className="memo-card"
        style={{ display: "block" }}
      >
        <div className="memo-top">
          <div className="memo-meta">
            <TagBadge tag={memo.tag} />
            <time className="memo-time">{relativeTime(memo.createdAt, tick)}</time>
          </div>
          <button
            type="button"
            className={`copy-btn${copied ? " copied" : ""}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleCopy}
            aria-label={copied ? "복사됨" : "메모 복사"}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>

        {editing ? (
          <>
            <textarea
              ref={editorRef}
              className="memo-editor"
              value={draft}
              rows={Math.min(8, Math.max(3, draft.split("\n").length + 1))}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <p className="save-hint">⌘ Enter로 저장</p>
          </>
        ) : (
          <>
            <p className={`memo-body${isLong && !expanded ? " truncated" : ""}`}>
              {memo.text}
            </p>
            {isLong && !editing && (
              <button
                type="button"
                className="expand-btn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              >
                {expanded ? "접기" : "더 보기"}
              </button>
            )}
          </>
        )}
      </motion.article>
    </motion.div>
  );
}

function Checkbox({ checked }) {
  return (
    <motion.span
      className={`chk${checked ? " checked" : ""}`}
      animate={checked ? { scale: [1, 1.18, 1] } : { scale: 1 }}
      transition={{ duration: 0.26 }}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <motion.path
            d="M2 7l3.5 3.5L12 3"
            stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          />
        </svg>
      )}
    </motion.span>
  );
}

function ActionCard({ action, index, onToggle, onDelete }) {
  const overdue = isPastDue(action.dueDate, action.done);
  const isHigh  = action.priority === "high";

  return (
    <motion.div className="swipe-wrap" style={{ borderRadius: 20 }}>
      <div className="swipe-bg" style={{ borderRadius: 20 }}>
        <Trash2 size={15} />
      </div>
      <motion.article
        layout="position"
        drag="x"
        dragConstraints={{ left: -108, right: 0 }}
        dragElastic={0.055}
        onDragEnd={(_, info) => {
          if (info.offset.x < -80 || info.velocity.x < -480) onDelete(action.id);
        }}
        onTap={() => onToggle(action.id)}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -80 }}
        whileTap={{ scale: 0.992 }}
        transition={{ type: "spring", stiffness: 300, damping: 28, delay: index * 0.018 }}
        className={`action-card${action.done ? " done" : ""}${isHigh ? " hi" : ""}`}
      >
        <Checkbox checked={action.done} />
        <div className="action-body">
          <p className="action-text">{action.text}</p>
          <div className="action-meta">
            <span className={`m-chip${overdue ? " overdue" : ""}`}>
              <CalendarDays size={11} />
              {formatDue(action.dueDate)}
            </span>
            {isHigh && (
              <span className="m-chip hi-pill">
                <Flame size={11} />
                높음
              </span>
            )}
          </div>
        </div>
      </motion.article>
    </motion.div>
  );
}

function ActionProgress({ actions }) {
  if (actions.length === 0) return null;
  const done = actions.filter((a) => a.done).length;
  const pct  = Math.round((done / actions.length) * 100);

  return (
    <div className="progress-bar-wrap">
      <div className="progress-header">
        <span className="progress-label">{done}/{actions.length} 완료</span>
        <span className="progress-pct">{pct}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TagFilterStrip({ selected, onChange, tags }) {
  return (
    <div className="tag-filter-strip">
      <button
        type="button"
        data-tag="all"
        className={`tf-chip${selected === "all" ? " on" : ""}`}
        onClick={() => onChange("all")}
      >
        전체
      </button>
      {tags.map((tag) => {
        const s = TAG_STYLES[tag];
        return (
          <button
            key={tag}
            type="button"
            data-tag={tag}
            className={`tf-chip${selected === tag ? " on" : ""}`}
            onClick={() => onChange(tag)}
          >
            {selected !== tag && s && (
              <span className="tf-chip-dot" style={{ background: s.dot }} />
            )}
            {tag}
          </button>
        );
      })}
    </div>
  );
}

// Auto-resizing textarea helper
function useAutoResize(ref, value) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

function Composer({
  activeView,
  memoText, setMemoText,
  selectedTag, setSelectedTag,
  onAddMemo,
  actionText, setActionText,
  actionDueDate, setActionDueDate,
  actionPriority, setActionPriority,
  onAddAction,
  aiSettings, setAiSettings,
  aiStatus,
  onCorrectDraft,
}) {
  const memoRef   = useRef(null);
  const actionRef = useRef(null);
  const [aiOpen, setAiOpen] = useState(false);

  const correcting = aiStatus.state === "loading";
  const draftText  = activeView === "memos" ? memoText : actionText;
  const hasText    = draftText.trim().length > 0;

  useAutoResize(memoRef,   memoText);
  useAutoResize(actionRef, actionText);

  useEffect(() => {
    if (aiStatus.state === "error") setAiOpen(true);
  }, [aiStatus.state]);

  // Focus input on view switch
  useEffect(() => {
    const ref = activeView === "memos" ? memoRef : actionRef;
    ref.current?.focus({ preventScroll: true });
  }, [activeView]);

  const clearDraft = () => {
    if (activeView === "memos") setMemoText("");
    else setActionText("");
  };

  return (
    <motion.form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        activeView === "memos" ? onAddMemo() : onAddAction();
      }}
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
    >
      <div className="handle" />

      <AnimatePresence mode="wait" initial={false}>
        {activeView === "memos" ? (
          <motion.div
            key="memo"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.13 }}
          >
            <div className="tag-row">
              {TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  data-tag={tag}
                  className={`tag-btn${selectedTag === tag ? " on" : ""}`}
                  onClick={() => setSelectedTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="textarea-wrap">
              <textarea
                ref={memoRef}
                className="composer-textarea"
                value={memoText}
                rows={1}
                onChange={(e) => setMemoText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    onAddMemo();
                  }
                }}
                placeholder="생각을 빠르게 메모하세요…"
              />
              <div className="textarea-footer">
                <span className="char-hint">
                  {memoText.length > 0 ? `${memoText.length}자 · ⌘↵ 저장` : "⌘↵ 저장"}
                </span>
                <div className="btn-row">
                  {hasText && (
                    <button
                      type="button"
                      className="icon-btn btn-clear"
                      onClick={clearDraft}
                      aria-label="지우기"
                    >
                      <X size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className={`icon-btn btn-ai${correcting ? " spinning" : ""}`}
                    disabled={!hasText || correcting}
                    onClick={() => onCorrectDraft(activeView, () => setAiOpen(true))}
                    aria-label="AI 교정"
                    title="AI 한국어 교정"
                  >
                    <Sparkles size={16} />
                  </button>
                  <button
                    type="submit"
                    className="icon-btn btn-submit"
                    disabled={!hasText}
                    aria-label="메모 추가"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="action"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.13 }}
          >
            <div className="action-ctrl">
              <label className="ctrl" style={{ cursor: "pointer" }}>
                <CalendarDays size={14} />
                <input
                  type="date"
                  value={actionDueDate}
                  onChange={(e) => setActionDueDate(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={`ctrl${actionPriority === "high" ? " hi-on" : ""}`}
                onClick={() => setActionPriority((v) => (v === "high" ? "normal" : "high"))}
              >
                <Flame size={14} />
                {actionPriority === "high" ? "높음" : "보통"}
              </button>
            </div>
            <div className="textarea-wrap">
              <textarea
                ref={actionRef}
                className="composer-textarea"
                value={actionText}
                rows={1}
                onChange={(e) => setActionText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    onAddAction();
                  }
                }}
                placeholder="다음 할 일을 입력하세요…"
              />
              <div className="textarea-footer">
                <span className="char-hint">
                  {actionText.length > 0 ? `${actionText.length}자 · ⌘↵ 추가` : "⌘↵ 추가"}
                </span>
                <div className="btn-row">
                  {hasText && (
                    <button
                      type="button"
                      className="icon-btn btn-clear"
                      onClick={clearDraft}
                      aria-label="지우기"
                    >
                      <X size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className={`icon-btn btn-ai${correcting ? " spinning" : ""}`}
                    disabled={!hasText || correcting}
                    onClick={() => onCorrectDraft(activeView, () => setAiOpen(true))}
                    aria-label="AI 교정"
                    title="AI 한국어 교정"
                  >
                    <Sparkles size={16} />
                  </button>
                  <button
                    type="submit"
                    className="icon-btn btn-submit"
                    disabled={!hasText}
                    aria-label="액션 추가"
                  >
                    <Plus size={17} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ai-row">
        <button
          type="button"
          className="ai-key-btn"
          onClick={() => setAiOpen((v) => !v)}
        >
          <KeyRound size={12} />
          {aiSettings.apiKey ? "AI 설정됨" : "AI 설정"}
        </button>
        <button
          type="button"
          className={`ai-msg ${aiStatus.state}`}
          onClick={() => setAiOpen(true)}
          title={aiStatus.message}
        >
          {aiStatus.message}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {aiOpen && (
          <motion.div
            className="ai-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <input
              type="password"
              value={aiSettings.apiKey}
              onChange={(e) => setAiSettings((s) => ({ ...s, apiKey: e.target.value.trim() }))}
              placeholder="Gemini API key"
              aria-label="Gemini API key"
            />
            <select
              value={aiSettings.model}
              onChange={(e) => setAiSettings((s) => ({ ...s, model: e.target.value }))}
              aria-label="AI 모델"
            >
              {AI_MODELS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.form>
  );
}

// Undo toast
function UndoToast({ msg, onUndo, onDismiss }) {
  return (
    <motion.div
      className="toast"
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
    >
      <span className="toast-msg">{msg}</span>
      <button type="button" className="toast-undo" onClick={onUndo}>
        <RotateCcw size={12} />
        되돌리기
      </button>
    </motion.div>
  );
}

// Error toast (replaces modal)
function ErrorToast({ error, onClose }) {
  return (
    <motion.div
      className="err-toast"
      initial={{ opacity: 0, y: -16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
    >
      <Sparkles size={16} className="err-toast-icon" />
      <div className="err-toast-body">
        <p className="err-toast-title">AI 교정 실패</p>
        <p className="err-toast-msg">{error.message}</p>
        <p className="err-toast-model">{error.model}</p>
      </div>
      <button type="button" className="err-toast-close" onClick={onClose} aria-label="닫기">
        <X size={14} />
      </button>
    </motion.div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function IntelliMemoApp() {
  const [activeView,     setActiveView]     = useState("memos");
  const [memos,          setMemos]          = useState([]);
  const [actions,        setActions]        = useState([]);
  const [memoText,       setMemoText]       = useState("");
  const [selectedTag,    setSelectedTag]    = useState(DEFAULT_TAG);
  const [actionText,     setActionText]     = useState("");
  const [actionDueDate,  setActionDueDate]  = useState("");
  const [actionPriority, setActionPriority] = useState("normal");
  const [actionFilter,   setActionFilter]   = useState("all");
  const [tagFilter,      setTagFilter]      = useState("all");
  const [aiSettings,     setAiSettings]     = useState({ apiKey: "", model: DEFAULT_AI_MODEL });
  const [aiStatus,       setAiStatus]       = useState({ state: "idle", message: `Gemini · ${DEFAULT_AI_MODEL}` });
  const [aiError,        setAiError]        = useState(null);
  const [toast,          setToast]          = useState(null); // { msg, undo }
  const [isLoaded,       setIsLoaded]       = useState(false);
  const [scrollTop,      setScrollTop]      = useState(0);
  const [tick,           setTick]           = useState(Date.now());

  const hasHydrated = useRef(false);
  const toastTimer  = useRef(null);

  // ── Hydrate ──
  useEffect(() => {
    let alive = true;
    const hydrate = async () => {
      const [sm, sa, sai] = await Promise.all([
        loadJson("memos",      []),
        loadJson("actions",    []),
        loadJson("aiSettings", { apiKey: "", model: DEFAULT_AI_MODEL }),
      ]);
      if (!alive) return;

      setMemos(Array.isArray(sm) ? sm : []);
      setActions(Array.isArray(sa) ? sa : []);

      if (sai && typeof sai === "object") {
        const model = normalizeModel(sai.model);
        setAiSettings({ apiKey: typeof sai.apiKey === "string" ? sai.apiKey : "", model });
        setAiStatus({ state: "idle", message: `Gemini · ${model}` });
      }

      hasHydrated.current = true;
      setTimeout(() => alive && setIsLoaded(true), 220);
    };
    hydrate();
    return () => { alive = false; };
  }, []);

  // ── Tick ──
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Persist ──
  useEffect(() => { if (hasHydrated.current) saveJson("memos",      memos);      }, [memos]);
  useEffect(() => { if (hasHydrated.current) saveJson("actions",    actions);    }, [actions]);
  useEffect(() => { if (hasHydrated.current) saveJson("aiSettings", aiSettings); }, [aiSettings]);

  // ── Toast helper ──
  const showToast = useCallback((msg, undoFn) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, undo: undoFn });
    toastTimer.current = setTimeout(() => setToast(null), UNDO_DELAY_MS);
  }, []);

  // ── Derived ──
  const filteredActions = useMemo(() => {
    let list = actions;
    if (actionFilter === "active") list = list.filter((a) => !a.done);
    if (actionFilter === "done")   list = list.filter((a) => a.done);
    return list;
  }, [actions, actionFilter]);

  const filteredMemos = useMemo(() =>
    tagFilter === "all" ? memos : memos.filter((m) => m.tag === tagFilter),
  [memos, tagFilter]);

  // Group memos by date
  const memoGroups = useMemo(() => {
    const map = new Map();
    for (const memo of filteredMemos) {
      const label = dateGroupLabel(memo.createdAt);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(memo);
    }
    return [...map.entries()];
  }, [filteredMemos]);

  // ── CRUD ──
  const addMemo = useCallback(() => {
    const text = memoText.trim();
    if (!text) return;
    setMemos((cur) => [{ id: createId(), text, tag: selectedTag, createdAt: nowIso() }, ...cur]);
    setMemoText("");
  }, [memoText, selectedTag]);

  const addAction = useCallback(() => {
    const text = actionText.trim();
    if (!text) return;
    setActions((cur) => [
      { id: createId(), text, dueDate: actionDueDate, priority: actionPriority, done: false, createdAt: nowIso() },
      ...cur,
    ]);
    setActionText("");
  }, [actionText, actionDueDate, actionPriority]);

  const deleteMemo = useCallback((id) => {
    const target = memos.find((m) => m.id === id);
    if (!target) return;
    setMemos((cur) => cur.filter((m) => m.id !== id));
    showToast(`메모 삭제됨`, () => {
      setMemos((cur) => {
        const exists = cur.some((m) => m.id === id);
        return exists ? cur : [target, ...cur];
      });
    });
  }, [memos, showToast]);

  const editMemo = useCallback((id, text) => {
    setMemos((cur) => cur.map((m) => m.id === id ? { ...m, text } : m));
  }, []);

  const deleteAction = useCallback((id) => {
    const target = actions.find((a) => a.id === id);
    if (!target) return;
    setActions((cur) => cur.filter((a) => a.id !== id));
    showToast(`액션 삭제됨`, () => {
      setActions((cur) => {
        const exists = cur.some((a) => a.id === id);
        return exists ? cur : [target, ...cur];
      });
    });
  }, [actions, showToast]);

  const toggleAction = useCallback((id) => {
    setActions((cur) => cur.map((a) => a.id === id ? { ...a, done: !a.done } : a));
  }, []);

  // ── AI correction ──
  const correctDraft = useCallback(async (type, openSettings) => {
    const text = type === "memos" ? memoText.trim() : actionText.trim();
    if (!text) return;

    if (!aiSettings.apiKey) {
      setAiStatus({ state: "error", message: "API 키 필요" });
      openSettings();
      return;
    }

    setAiError(null);
    const fallbacks = getModelFallbacks(normalizeModel(aiSettings.model));
    let lastError = null;
    let lastModel = fallbacks.at(-1) ?? DEFAULT_AI_MODEL;

    for (let i = 0; i < fallbacks.length; i++) {
      const model = fallbacks[i];
      lastModel = model;
      setAiSettings((s) => ({ ...s, model }));
      setAiStatus({
        state: "loading",
        message: i === 0 ? `${model} 교정 중…` : `${model} 재시도 중…`,
      });

      try {
        const corrected = await correctKorean({ apiKey: aiSettings.apiKey, model, text, type });
        if (type === "memos") setMemoText(corrected);
        else setActionText(corrected);
        setAiStatus({ state: "success", message: "교정 완료 ✓" });
        setTimeout(() => setAiStatus({ state: "idle", message: `Gemini · ${model}` }), 2500);
        return;
      } catch (err) {
        lastError = err;
      }
    }

    openSettings();
    const message = lastError instanceof Error ? lastError.message : "교정 실패";
    setAiStatus({ state: "error", message });
    setAiError({ model: lastModel, message });
    setTimeout(() => setAiError(null), 8000);
  }, [memoText, actionText, aiSettings]);

  return (
    <main className="app">
      <style>{CSS}</style>

      <div className="frame">
        <Header
          activeView={activeView}
          setActiveView={setActiveView}
          actionFilter={actionFilter}
          setActionFilter={setActionFilter}
          compact={scrollTop > 20}
        />

        <section
          className="stage"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <AnimatePresence mode="wait" initial={false}>
            {activeView === "memos" ? (
              <motion.div
                key="memos"
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 14 }}
                transition={{ duration: 0.15 }}
              >
                {!isLoaded ? (
                  <SkeletonList />
                ) : (
                  <>
                    <div className="sec-label">
                      <span className="sec-label-text">메모</span>
                      <span className="count-badge">{memos.length}</span>
                    </div>

                    {memos.length > 0 && (
                      <TagFilterStrip
                        selected={tagFilter}
                        onChange={setTagFilter}
                        tags={TAGS}
                      />
                    )}

                    {filteredMemos.length === 0 ? (
                      <EmptyState type="memos" />
                    ) : (
                      memoGroups.map(([label, group]) => (
                        <div key={label} className="date-group">
                          <p className="date-group-label">{label}</p>
                          <motion.div className="memo-group" layout>
                            <AnimatePresence initial={false}>
                              {group.map((memo, i) => (
                                <MemoCard
                                  key={memo.id}
                                  memo={memo}
                                  index={i}
                                  tick={tick}
                                  onDelete={deleteMemo}
                                  onEdit={editMemo}
                                />
                              ))}
                            </AnimatePresence>
                          </motion.div>
                        </div>
                      ))
                    )}
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="actions"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.15 }}
              >
                {!isLoaded ? (
                  <SkeletonList />
                ) : (
                  <>
                    <div className="sec-label">
                      <span className="sec-label-text">액션</span>
                      <span className="count-badge">{filteredActions.length}</span>
                    </div>

                    {actions.length > 0 && (
                      <ActionProgress actions={actions} />
                    )}

                    {filteredActions.length === 0 ? (
                      <EmptyState type="actions" />
                    ) : (
                      <motion.div className="action-list" layout>
                        <AnimatePresence initial={false}>
                          {filteredActions.map((action, i) => (
                            <ActionCard
                              key={action.id}
                              action={action}
                              index={i}
                              onToggle={toggleAction}
                              onDelete={deleteAction}
                            />
                          ))}
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <Composer
          activeView={activeView}
          memoText={memoText}           setMemoText={setMemoText}
          selectedTag={selectedTag}     setSelectedTag={setSelectedTag}
          onAddMemo={addMemo}
          actionText={actionText}       setActionText={setActionText}
          actionDueDate={actionDueDate} setActionDueDate={setActionDueDate}
          actionPriority={actionPriority} setActionPriority={setActionPriority}
          onAddAction={addAction}
          aiSettings={aiSettings}       setAiSettings={setAiSettings}
          aiStatus={aiStatus}
          onCorrectDraft={correctDraft}
        />
      </div>

      {/* Undo toast */}
      <AnimatePresence>
        {toast && (
          <UndoToast
            key="undo-toast"
            msg={toast.msg}
            onUndo={() => { toast.undo(); setToast(null); }}
            onDismiss={() => setToast(null)}
          />
        )}
      </AnimatePresence>

      {/* AI error toast */}
      <AnimatePresence>
        {aiError && (
          <ErrorToast
            key="err-toast"
            error={aiError}
            onClose={() => setAiError(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
