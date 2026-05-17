import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import './src/app.css';
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Flame,
  ImagePlus,
  KeyRound,
  ListFilter,
  MessageSquareText,
  Monitor,
  Pencil,
  RotateCcw,
  Search,
  Smartphone,
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
const AI_SETTINGS_STORAGE_KEY = "aiSettings";
const AI_API_KEY_SESSION_KEY = "aiApiKey";

const AI_MODELS = [
  { key: "gemini-2.5-pro",        label: "Gemini 2.5 Pro" },
  { key: "gemini-2.5-flash",      label: "Gemini 2.5 Flash 추천" },
  { key: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { key: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
];

const AI_CORRECTION_MODES = [
  {
    key:   "typo",
    label: "오타·띄어쓰기",
    group: "typo",
    modal: false,
    prompt: (text) =>
      `You proofread Korean 인텔리메모 notes. Return only the fully corrected Korean text. Fix typos and spacing errors only. Preserve every idea, detail, line break, meaning, intent, and tone. Do not summarize, shorten, omit, add explanations, labels, quotation marks, markdown, or alternatives. If already correct, return it unchanged.\n\n오타와 띄어쓰기만 교정해줘. 절대 내용을 바꾸거나 줄이지 마.\n\n${text}`,
  },
  {
    key:   "grammar",
    label: "문법",
    group: "sentence",
    modal: true,
    prompt: (text) =>
      `You are a Korean grammar corrector. Fix grammatical errors only: incorrect particles (조사), verb and adjective conjugation errors, tense errors, and awkward sentence structures. Do NOT change vocabulary, style, tone, or content. Return ONLY the corrected Korean text, no explanations.\n\n문법 오류만 교정해줘: 조사, 어미 활용, 시제, 문장 구조. 어휘·문체·내용은 그대로 유지해.\n\n${text}`,
  },
  {
    key:   "style",
    label: "문체",
    group: "sentence",
    modal: true,
    prompt: (text) =>
      `You are a Korean writing style editor. Improve the writing to make it clearer, more natural, and more polished. Refine word choice, improve sentence flow, and restructure for readability. Preserve all original ideas, facts, and intent. Return ONLY the improved Korean text, no explanations.\n\n문체를 자연스럽고 읽기 좋게 다듬어줘. 원래 내용과 의도는 모두 유지해.\n\n${text}`,
  },
  {
    key:   "semantic",
    label: "의미·맥락",
    group: "sentence",
    modal: true,
    prompt: (text) =>
      `You are a Korean semantic editor. Analyze the meaning, intent, and logical flow of the text. Fix ambiguous expressions, logical gaps, unclear references, and contradictions. Preserve the original ideas but clarify meaning so the text communicates the intended message precisely. Return ONLY the improved Korean text, no explanations.\n\n의미와 맥락을 분석해서 모호한 표현, 논리적 빈틈, 불명확한 지시어를 교정해줘. 원래 의도는 유지하되 전달력을 높여줘.\n\n${text}`,
  },
  {
    key:   "translate",
    label: "번역",
    group: "translate",
    modal: true,
    prompt: (text) =>
      `Detect the language of the following text and translate it into natural, fluent Korean. Return ONLY the translated Korean text. No explanations, no source language label, no alternatives.\n\n다음 텍스트의 언어를 자동으로 감지하고 자연스러운 한국어로 번역해줘. 번역문만 반환해.\n\n${text}`,
  },
];

const AI_CORRECTION_GROUPS = [
  { key: "typo",      label: "오타·띄어쓰기" },
  { key: "sentence",  label: "문장 교정" },
  { key: "translate", label: "번역" },
];

const DEFAULT_AI_CORRECTION_MODE = "typo";

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

const loadSessionValue = (key) => {
  try { return window.localStorage?.getItem(key) ?? ""; }
  catch { return ""; }
};

const saveSessionValue = (key, value) => {
  try {
    if (!window.localStorage) return;
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
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
  const date       = new Date(iso);
  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dateStart  = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffMs     = todayStart - dateStart;
  if (diffMs <= 0)          return "오늘";
  if (diffMs < 172_800_000) return "어제";
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

const parseRetryAfter = (header) => {
  if (!header) return null;
  if (/^\d+$/.test(header.trim())) {
    const sec = parseInt(header, 10);
    if (sec > 0) return sec;
  }
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    const diff = Math.ceil((date - Date.now()) / 1000);
    return diff > 0 ? diff : null;
  }
  return null;
};

const detectRateLimitType = (rawMsg, retryAfter) => {
  const n = rawMsg.toLowerCase();
  if (n.includes("per day") || n.includes("per_day") || n.includes("daily")) return "rpd";
  if (n.includes("per minute") || n.includes("per_minute") || n.includes("tokens per minute")) return "rpm";
  return retryAfter ? "rpm" : "unknown";
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

const callGeminiApi = async ({ apiKey, model, body }) => {
  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    throw new Error(e instanceof TypeError ? "네트워크 연결을 확인하세요." : "API 호출 실패");
  }

  if (!res.ok) {
    const rawBody = await res.text();
    let rawMsg = rawBody;
    try { const p = JSON.parse(rawBody); rawMsg = p?.error?.message || rawBody; } catch {}
    const ra  = res.headers.get("Retry-After");
    const err = new Error(apiError(res.status, rawBody));
    err.status = res.status;
    const retryAfterSec = parseRetryAfter(ra);
    if (retryAfterSec) err.retryAfter = retryAfterSec;
    if (res.status === 429) err.limitType = detectRateLimitType(rawMsg, ra);
    throw err;
  }

  return res.json();
};

const correctKorean = async ({ apiKey, model, text, mode = DEFAULT_AI_CORRECTION_MODE }) => {
  const modeConfig = AI_CORRECTION_MODES.find((m) => m.key === mode) ?? AI_CORRECTION_MODES[0];
  const data = await callGeminiApi({
    apiKey, model,
    body: {
      contents: [{ role: "user", parts: [{ text: modeConfig.prompt(text) }] }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
    },
  });
  if ((data.candidates ?? []).some((c) => c.finishReason === "MAX_TOKENS"))
    throw new Error("결과가 너무 길어 중단됐습니다. 텍스트를 나눠서 교정하세요.");
  const corrected = extractText(data);
  if (!corrected) throw new Error("교정 결과가 비어 있습니다.");
  return corrected;
};

const extractTextFromImage = async ({ apiKey, model, base64, mimeType = "image/jpeg" }) => {
  const data = await callGeminiApi({
    apiKey, model,
    body: {
      contents: [{
        parts: [
          { text: "이미지에서 텍스트를 모두 추출해줘. 레이아웃과 줄바꿈을 최대한 보존하고 텍스트만 반환해. 텍스트가 없으면 빈 문자열을 반환해." },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.1 },
    },
  });
  return extractText(data) ?? "";
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useFocusTrap(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prevFocused = document.activeElement;
    const focusable = Array.from(el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ));
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    first?.focus();
    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first?.focus(); }
      }
    };
    el.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("keydown", onKeyDown);
      prevFocused?.focus();
    };
  }, [ref]);
}

function useAiCorrection({ memoText, actionText, setMemoText, setActionText, hasHydrated }) {
  const [aiSettings,        setAiSettings]       = useState({ apiKey: "", model: DEFAULT_AI_MODEL });
  const [aiStatus,          setAiStatus]         = useState({ state: "idle", message: `Gemini · ${DEFAULT_AI_MODEL}` });
  const [aiError,           setAiError]          = useState(null);
  const [pendingCorrection, setPendingCorrection] = useState(null);
  const [rateLimitInfo,     setRateLimitInfo]    = useState(null);
  const [rateLimitSec,      setRateLimitSec]     = useState(0);

  useEffect(() => {
    if (rateLimitInfo?.type !== "rpm") { setRateLimitSec(0); return; }
    const update = () => {
      const sec = Math.ceil((rateLimitInfo.until - Date.now()) / 1000);
      if (sec <= 0) { setRateLimitSec(0); setRateLimitInfo(null); }
      else setRateLimitSec(sec);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [rateLimitInfo]);

  useEffect(() => {
    if (!hasHydrated.current) return;
    saveJson(AI_SETTINGS_STORAGE_KEY, { model: normalizeModel(aiSettings.model) });
    saveSessionValue(AI_API_KEY_SESSION_KEY, aiSettings.apiKey);
  }, [aiSettings]);

  const correctDraft = useCallback(async (type, openSettings, mode = DEFAULT_AI_CORRECTION_MODE) => {
    const text = type === "memos" ? memoText.trim() : actionText.trim();
    if (!text) return;

    if (!aiSettings.apiKey) {
      setAiStatus({ state: "error", message: "API 키 필요" });
      openSettings();
      return;
    }

    const modeConfig = AI_CORRECTION_MODES.find((m) => m.key === mode) ?? AI_CORRECTION_MODES[0];

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
        message: i === 0 ? `${modeConfig.label} 중…` : `${model} 재시도 중…`,
      });

      try {
        const corrected = await correctKorean({ apiKey: aiSettings.apiKey, model, text, mode });
        if (modeConfig.modal && type === "memos") {
          setPendingCorrection({ original: text, corrected, mode: modeConfig.key });
          setAiStatus({ state: "success", message: `${modeConfig.label} 제안 준비됨 ✓` });
        } else {
          if (type === "memos") setMemoText(corrected);
          else setActionText(corrected);
          setAiStatus({ state: "success", message: "교정 완료 ✓" });
        }
        setTimeout(() => setAiStatus({ state: "idle", message: `Gemini · ${model}` }), 2500);
        return;
      } catch (err) {
        if (err.status === 429 && (err.limitType ?? "unknown") === "rpd") {
          setRateLimitInfo({ type: "rpd" });
          setAiStatus({ state: "rate-limited", message: "요청 한도 초과" });
          return;
        }
        lastError = err;
      }
    }

    if (lastError?.status === 429) {
      const limitType = lastError.limitType ?? "unknown";
      if (limitType === "rpm") {
        setRateLimitInfo({ type: "rpm", until: Date.now() + (lastError.retryAfter ?? 60) * 1000 });
      } else {
        setRateLimitInfo({ type: limitType });
      }
      setAiStatus({ state: "rate-limited", message: "요청 한도 초과" });
      return;
    }

    openSettings();
    const message = lastError instanceof Error ? lastError.message : "교정 실패";
    setAiStatus({ state: "error", message });
    setAiError({ model: lastModel, message, type: "correction" });
  }, [memoText, actionText, aiSettings, setMemoText, setActionText]);

  return {
    aiSettings, setAiSettings,
    aiStatus, setAiStatus,
    aiError, setAiError,
    pendingCorrection, setPendingCorrection,
    rateLimitInfo, setRateLimitInfo,
    rateLimitSec,
    correctDraft,
  };
}

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

function Header({ activeView, setActiveView, actionFilter, setActionFilter, compact, layoutMode, onToggleLayout, searchOpen, onToggleSearch, searchQuery, setSearchQuery }) {
  const isLandscape = layoutMode === "landscape";
  const searchRef = useRef(null);
  return (
    <header className={`hdr${compact ? " compact" : ""}`}>
      <div className="hdr-body">
        <div className="hdr-top">
          <div className="brand">
            <h1>Intelligent Memo</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              className={`layout-toggle-btn${searchOpen ? " search-active" : ""}`}
              onClick={onToggleSearch}
              aria-label="검색"
              title="검색"
            >
              <Search size={15} />
            </button>
            <button
              type="button"
              className={`layout-toggle-btn${isLandscape ? " landscape-active" : ""}`}
              onClick={onToggleLayout}
              aria-label={isLandscape ? "세로 모드로 전환" : "가로 모드로 전환"}
              title={isLandscape ? "세로 모드" : "가로 모드"}
            >
              {isLandscape ? <Smartphone size={15} /> : <Monitor size={15} />}
            </button>
            <button
              type="button"
              className="layout-toggle-btn reload-btn"
              onClick={() => window.location.reload()}
              aria-label="새로고침"
              title="새로고침"
            >
              <RotateCcw size={13} />
            </button>
            <span className="gemini-badge">
              <Sparkles size={11} />
              Gemini AI
            </span>
          </div>
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
                  data-filter={f.key}
                  onClick={() => setActionFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {searchOpen && (
            <motion.div
              className="search-bar-wrap"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onAnimationComplete={() => searchRef.current?.focus()}
            >
              <div className="search-bar">
                <Search size={13} />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && !e.nativeEvent.isComposing && onToggleSearch()}
                />
                {searchQuery && (
                  <button type="button" className="search-clear-btn" onClick={() => setSearchQuery("")}>
                    <X size={13} />
                  </button>
                )}
              </div>
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
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState(memo.text);
  const [draftTag, setDraftTag] = useState(memo.tag);
  const [copied,   setCopied]   = useState(false);
  const [expanded, setExpanded] = useState(false);
  const editorRef   = useRef(null);

  const isLong = memo.text.split("\n").length > 4 || memo.text.length > 200;

  useEffect(() => {
    if (editing) {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) { setDraft(memo.text); setDraftTag(memo.tag); }
  }, [editing, memo.text, memo.tag]);

  useAutoResize(editorRef, draft);

  const commit = () => {
    const t = draft.trim();
    if (t) onEdit(memo.id, t, draftTag);
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(memo.text);
    setDraftTag(memo.tag);
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

  const stopProp = (e) => e.stopPropagation();

  return (
    // swipe-wrap: 단일 overflow:hidden 레이어
    <div className="swipe-wrap">
      {/* 삭제 배경: 편집 중에는 숨김 (스와이프 불가 + 핑크 노출 방지) */}
      {!editing && (
        <div className="swipe-bg">
          <div className="delete-icon-circle">
            <Trash2 size={17} />
          </div>
        </div>
      )}

      {/* 카드: drag로 왼쪽 밀기 → 삭제 */}
      <motion.article
        drag={editing ? false : "x"}          /* 편집 중 드래그 비활성 */
        dragConstraints={{ left: -80, right: 0 }}
        dragElastic={{ left: 0.1, right: 0 }}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.x < -60 || info.velocity.x < -400) onDelete(memo.id);
        }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -60 }}
        transition={{ duration: 0.22, delay: index * 0.018, ease: [0.2, 0, 0, 1] }}
        className={`memo-card${editing ? " is-editing" : ""}`}
      >
        {/* 상단 행: 태그 / 시간 / 액션버튼들 */}
        <div className="memo-top">
          <div className="memo-meta">
            <TagBadge tag={editing ? draftTag : memo.tag} />
            <time className="memo-time">{relativeTime(memo.createdAt, tick)}</time>
          </div>
          <div className="memo-actions">
            {editing ? (
              <>
                <button
                  type="button"
                  className="card-btn save-btn"
                  onClick={commit}
                  aria-label="저장"
                >
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  className="card-btn"
                  onClick={cancelEdit}
                  aria-label="취소"
                >
                  <X size={13} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="card-btn edit-btn"
                onClick={(e) => { stopProp(e); setEditing(true); }}
                aria-label="메모 편집"
              >
                <Pencil size={13} />
              </button>
            )}
            <button
              type="button"
              className="card-btn del-btn"
              onClick={(e) => { stopProp(e); onDelete(memo.id); }}
              aria-label="메모 삭제"
            >
              <Trash2 size={13} />
            </button>
            <button
              type="button"
              className={`card-btn copy-btn${copied ? " copied" : ""}`}
              onClick={handleCopy}
              aria-label={copied ? "복사됨" : "메모 복사"}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </div>

        {/* 본문 영역 */}
        {editing ? (
          <>
            <textarea
              ref={editorRef}
              className="memo-editor"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
                if (e.key === "Escape") cancelEdit();
              }}
            />
            <div className="tag-row" style={{ marginTop: 8, marginBottom: 0 }}>
              {TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  data-tag={tag}
                  className={`tag-btn sm${draftTag === tag ? " on" : ""}`}
                  onClick={(e) => { e.stopPropagation(); setDraftTag(tag); }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className={`memo-body${isLong && !expanded ? " truncated" : ""}`}>
              {memo.text}
            </p>
            {isLong && (
              <button
                type="button"
                className="expand-btn"
                onClick={(e) => { stopProp(e); setExpanded((v) => !v); }}
              >
                {expanded ? "접기 ↑" : "더 보기 ↓"}
              </button>
            )}
          </>
        )}
      </motion.article>
    </div>
  );
}

function ActionCard({ action, index, onToggle, onDelete }) {
  const overdue = isPastDue(action.dueDate, action.done);
  const isHigh  = action.priority === "high";

  return (
    <div className="swipe-wrap">
      {/* 삭제 배경 */}
      <div className="swipe-bg">
        <div className="delete-icon-circle">
          <Trash2 size={17} />
        </div>
      </div>

      <motion.article
        drag="x"
        dragConstraints={{ left: -80, right: 0 }}
        dragElastic={{ left: 0.1, right: 0 }}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.x < -60 || info.velocity.x < -400) onDelete(action.id);
        }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -60 }}
        transition={{ duration: 0.22, delay: index * 0.018, ease: [0.2, 0, 0, 1] }}
        className={`action-card${action.done ? " done" : ""}${isHigh ? " hi" : ""}`}
      >
        {/* 체크박스: 클릭 시 토글, 드래그와 분리 */}
        <button
          type="button"
          className={`chk${action.done ? " checked" : ""}`}
          onClick={() => onToggle(action.id)}
          aria-label={action.done ? "완료 취소" : "완료 처리"}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ display: "block" }}>
            <motion.path
              d="M2 7l3.5 3.5L12 3"
              stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"
              animate={{ pathLength: action.done ? 1 : 0, opacity: action.done ? 1 : 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            />
          </svg>
        </button>

        <div className="action-body">
          <p className="action-text">{action.text}</p>
          <div className="action-meta">
            <span className={`m-chip${overdue ? " overdue" : ""}`}>
              <CalendarDays size={10} />
              {formatDue(action.dueDate)}
            </span>
            <span className={`m-chip${isHigh ? " hi-pill" : ""}`}>
              <Flame size={10} />
              {isHigh ? "높음" : "보통"}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="card-btn del-btn"
          onClick={(e) => { e.stopPropagation(); onDelete(action.id); }}
          aria-label="액션 삭제"
        >
          <Trash2 size={13} />
        </button>
      </motion.article>
    </div>
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
    el.style.height = "0";
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
  onOcrError,
  rateLimitInfo,
  rateLimitSec,
  onRateLimit,
  onDismissRateLimit,
}) {
  const memoRef   = useRef(null);
  const actionRef = useRef(null);
  const cameraRef  = useRef(null);
  const galleryRef = useRef(null);
  const [aiOpen,   setAiOpen]   = useState(false);
  const [aiMode,   setAiMode]   = useState(DEFAULT_AI_CORRECTION_MODE);
  const [ocrState, setOcrState] = useState("idle"); // "idle" | "scanning" | "error"
  const [cropData, setCropData] = useState(null);   // { dataUrl, mimeType } | null

  const correcting = aiStatus.state === "loading";

  const handleCameraClick = () => {
    if (!aiSettings.apiKey) { setAiOpen(true); return; }
    cameraRef.current?.click();
  };

  const handleGalleryClick = () => {
    if (!aiSettings.apiKey) { setAiOpen(true); return; }
    galleryRef.current?.click();
  };

  const handleImageFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCropData({ dataUrl: reader.result, mimeType: file.type || "image/jpeg" });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    handleImageFile(file);
  };

  const handleMemoPaste = (e) => {
    const imageItem = [...(e.clipboardData?.items ?? [])]
      .find((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    if (!aiSettings.apiKey) { setAiOpen(true); return; }
    handleImageFile(imageItem.getAsFile());
  };

  const handleCropConfirm = async (base64, mimeType) => {
    setCropData(null);
    setOcrState("scanning");

    const fallbacks = getModelFallbacks(normalizeModel(aiSettings.model));
    let lastError = null;
    let lastModel = fallbacks.at(-1) ?? DEFAULT_AI_MODEL;

    for (let i = 0; i < fallbacks.length; i++) {
      const model = fallbacks[i];
      lastModel = model;
      setAiSettings((s) => ({ ...s, model }));
      try {
        const extracted = await extractTextFromImage({ apiKey: aiSettings.apiKey, model, base64, mimeType });
        if (!extracted.trim()) {
          setOcrState("error");
          setTimeout(() => setOcrState("idle"), 2000);
          onOcrError({ model, message: "텍스트를 찾을 수 없습니다", type: "ocr" });
          return;
        }
        setMemoText((prev) => prev ? `${prev}\n${extracted}` : extracted);
        setOcrState("idle");
        return;
      } catch (err) {
        if (err.status === 429 && (err.limitType ?? "unknown") === "rpd") {
          setOcrState("idle");
          onRateLimit("rpd", 0);
          return;
        }
        lastError = err;
      }
    }

    if (lastError?.status === 429) {
      setOcrState("idle");
      onRateLimit(lastError.limitType ?? "unknown", lastError.retryAfter ?? 60);
      return;
    }

    const message = lastError instanceof Error ? lastError.message : "OCR 실패";
    setOcrState("error");
    setTimeout(() => setOcrState("idle"), 2000);
    onOcrError({ model: lastModel, message, type: "ocr" });
  };
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
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
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
                onPaste={handleMemoPaste}
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
                  {ocrState === "scanning" ? "이미지 텍스트 추출 중…"
                    : ocrState === "error"  ? "텍스트를 찾을 수 없음"
                    : memoText.length > 0  ? `${memoText.length}자 · ⌘↵ 저장`
                    : "⌘↵ 저장"}
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
                    className={`icon-btn btn-camera${ocrState === "scanning" ? " scanning" : ""}`}
                    disabled={ocrState === "scanning" || correcting}
                    onClick={handleCameraClick}
                    aria-label="카메라 OCR"
                    title="카메라로 텍스트 추출"
                  >
                    <Camera size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn btn-gallery"
                    disabled={ocrState === "scanning" || correcting}
                    onClick={handleGalleryClick}
                    aria-label="갤러리에서 텍스트 추출"
                    title="갤러리에서 텍스트 추출"
                  >
                    <ImagePlus size={16} />
                  </button>
                  <button
                    type="button"
                    className={`icon-btn btn-ai${correcting ? " spinning" : ""}`}
                    disabled={!hasText || correcting}
                    onClick={() => onCorrectDraft(activeView, () => setAiOpen(true), aiMode)}
                    aria-label="AI 교정"
                    title={(AI_CORRECTION_MODES.find((m) => m.key === aiMode) ?? AI_CORRECTION_MODES[0]).label}
                  >
                    <Sparkles size={16} />
                  </button>
                  <button
                    type="submit"
                    className="icon-btn btn-submit"
                    disabled={!hasText}
                    aria-label="메모 추가"
                  >
                    <ArrowUp size={16} strokeWidth={2.5} />
                  </button>
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={handleImageSelect}
                  />
                  <input
                    ref={galleryRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleImageSelect}
                  />
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
                    <ArrowUp size={16} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {activeView === "memos" && (
        <>
          <div className="ai-mode-row">
            {AI_CORRECTION_GROUPS.map((g) => {
              const active = g.key === "typo" ? aiMode === "typo"
                           : g.key === "translate" ? aiMode === "translate"
                           : !["typo", "translate"].includes(aiMode);
              return (
                <button
                  key={g.key}
                  type="button"
                  className={`ai-mode-chip ${g.key}-chip${active ? " on" : ""}`}
                  onClick={() => {
                    if (g.key === "typo") setAiMode("typo");
                    else if (g.key === "translate") setAiMode("translate");
                    else if (["typo", "translate"].includes(aiMode)) setAiMode("grammar");
                  }}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
          {!["typo", "translate"].includes(aiMode) && (
            <div className="ai-mode-row ai-submode-row">
              {AI_CORRECTION_MODES.filter((m) => m.group === "sentence").map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`ai-mode-chip ${m.key}-chip${aiMode === m.key ? " on" : ""}`}
                  onClick={() => setAiMode(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {rateLimitInfo && (
        <div className="rate-limit-bar">
          <span>
            {rateLimitInfo.type === "rpm"
              ? `⏱ ${rateLimitSec}초 후 재시도 가능`
              : rateLimitInfo.type === "rpd"
                ? "일일 요청 한도 초과 · 내일 오후 4~5시 이후 이용 가능"
                : "요청 한도 초과 · 한도 유형을 알 수 없습니다"}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            {rateLimitInfo.type === "rpm" && (
              <button type="button" className="rate-limit-dismiss" onClick={onDismissRateLimit}>
                무시하고 재시도
              </button>
            )}
            <button type="button" className="rate-limit-dismiss" onClick={onDismissRateLimit}>
              중단
            </button>
          </div>
        </div>
      )}

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

      {createPortal(
        <AnimatePresence>
          {cropData && (
            <CropModal
              key="crop-modal"
              dataUrl={cropData.dataUrl}
              mimeType={cropData.mimeType}
              onCrop={handleCropConfirm}
              onCancel={() => setCropData(null)}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}

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
function UndoToast({ msg, onUndo }) {
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

function ErrorModal({ error, onClose }) {
  const modalRef = useRef(null);
  useFocusTrap(modalRef);
  return (
    <motion.div
      className="err-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.div
        ref={modalRef}
        className="err-modal"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="err-modal-icon">
          <Sparkles size={20} />
        </div>
        <h2 className="err-modal-title">
          {error.type === "ocr" ? "이미지 텍스트 추출 실패" : "AI 교정 실패"}
        </h2>
        <p className="err-modal-msg">{error.message}</p>
        <p className="err-modal-model">모델: {error.model}</p>
        <button type="button" className="err-modal-close" onClick={onClose}>
          확인
        </button>
      </motion.div>
    </motion.div>
  );
}

// 문장 교정 결과 모달
function CorrectionModal({ original, corrected, onApply, onCancel, title = "문장 교정 제안", correctedLabel = "교정 제안" }) {
  const modalRef = useRef(null);
  useFocusTrap(modalRef);
  return (
    <motion.div
      className="correction-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onCancel}
    >
      <motion.div
        ref={modalRef}
        className="correction-modal"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="correction-modal-hdr">
          <h2>{title} <span>AI가 제안한 내용입니다</span></h2>
          <button type="button" className="correction-close-btn" onClick={onCancel}>
            <X size={14} />
          </button>
        </div>
        <div className="correction-body">
          <div className="correction-box original">
            <p className="correction-label">원본</p>
            <p className="correction-text">{original}</p>
          </div>
          <div className="correction-arrow">↓</div>
          <div className="correction-box suggested">
            <p className="correction-label">{correctedLabel}</p>
            <p className="correction-text">{corrected}</p>
          </div>
        </div>
        <div className="correction-footer">
          <button type="button" className="correction-cancel-btn" onClick={onCancel}>취소</button>
          <button type="button" className="correction-apply-btn" onClick={onApply}>적용하기</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── CropModal ───────────────────────────────────────────────────────────────

function CropModal({ dataUrl, mimeType, onCrop, onCancel }) {
  const modalRef  = useRef(null);
  useFocusTrap(modalRef);
  const canvasRef = useRef(null);
  const imgRef    = useRef(null);
  const cropRef   = useRef(null); // { x1, y1, x2, y2 } in canvas px
  const dragRef   = useRef(null); // { type, startX, startY, startCrop }

  // ── 캔버스 그리기 ──
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const c = cropRef.current;
    if (!c) return;
    const { x1, y1, x2, y2 } = c;
    const w = x2 - x1, h = y2 - y1;

    // 외부 어둡게
    ctx.fillStyle = "rgba(0,0,0,0.52)";
    ctx.fillRect(0, 0, canvas.width, y1);
    ctx.fillRect(0, y2, canvas.width, canvas.height - y2);
    ctx.fillRect(0, y1, x1, h);
    ctx.fillRect(x2, y1, canvas.width - x2, h);

    // 테두리
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x1 + 1, y1 + 1, w - 2, h - 2);

    // 3분할 보조선
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1 + w / 3, y1); ctx.lineTo(x1 + w / 3, y2);
    ctx.moveTo(x1 + 2 * w / 3, y1); ctx.lineTo(x1 + 2 * w / 3, y2);
    ctx.moveTo(x1, y1 + h / 3); ctx.lineTo(x2, y1 + h / 3);
    ctx.moveTo(x1, y1 + 2 * h / 3); ctx.lineTo(x2, y1 + 2 * h / 3);
    ctx.stroke();

    // 꼭지점 L자 핸들
    const ARM  = Math.min(w, h, 120) * 0.32;
    const TICK = Math.max(2, ARM * 0.11);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur  = 8;
    [
      [x1, y1,  1,  1],
      [x2, y1, -1,  1],
      [x1, y2,  1, -1],
      [x2, y2, -1, -1],
    ].forEach(([cx, cy, sx, sy]) => {
      ctx.fillRect(cx,           cy,           sx * ARM,  sy * TICK);
      ctx.fillRect(cx,           cy,           sx * TICK, sy * ARM);
    });

    // 꼭지점 원형 닷 (터치 타깃 시각화)
    ctx.shadowBlur = 0;
    ctx.fillStyle  = "#fff";
    [[x1, y1], [x2, y1], [x1, y2], [x2, y2]].forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }, []);

  // ── 기본 크롭 박스 (이미지 95% 영역) ──
  const initCrop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = Math.min(canvas.width, canvas.height) * 0.04;
    cropRef.current = { x1: pad, y1: pad, x2: canvas.width - pad, y2: canvas.height - pad };
    redraw();
  }, [redraw]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = Math.min(1, 1400 / img.naturalWidth, 1400 / img.naturalHeight);
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      initCrop();
    };
    img.src = dataUrl;
  }, [dataUrl, initCrop]);

  // ── 좌표 변환 ──
  const toCanvas = (e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const src    = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * (canvas.width  / rect.width),
      y: (src.clientY - rect.top)  * (canvas.height / rect.height),
    };
  };

  // ── 히트 테스트: 꼭지점 우선, 그 다음 내부 이동 ──
  const hitTest = (p) => {
    const c = cropRef.current;
    if (!c) return null;
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    // 28 CSS px 터치 타깃 → 캔버스 좌표계 변환
    const R = 28 * (canvas.width / rect.width);
    const { x1, y1, x2, y2 } = c;
    for (const [name, cx, cy] of [
      ["tl", x1, y1], ["tr", x2, y1], ["bl", x1, y2], ["br", x2, y2],
    ]) {
      if ((p.x - cx) ** 2 + (p.y - cy) ** 2 <= R ** 2) return name;
    }
    if (p.x > x1 && p.x < x2 && p.y > y1 && p.y < y2) return "move";
    return null;
  };

  const onDown = (e) => {
    e.preventDefault();
    const p   = toCanvas(e);
    const hit = hitTest(p);
    if (hit) {
      dragRef.current = { type: hit, startX: p.x, startY: p.y, startCrop: { ...cropRef.current } };
    }
  };

  const onMove = (e) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const p  = toCanvas(e);
    const { type, startX, startY, startCrop: sc } = dragRef.current;
    const canvas = canvasRef.current;
    const MIN    = 30;
    const dx = p.x - startX, dy = p.y - startY;
    let { x1, y1, x2, y2 } = sc;

    if (type === "move") {
      const w = x2 - x1, h = y2 - y1;
      x1 = Math.max(0, Math.min(canvas.width  - w, sc.x1 + dx));
      y1 = Math.max(0, Math.min(canvas.height - h, sc.y1 + dy));
      x2 = x1 + w; y2 = y1 + h;
    } else {
      if (type === "tl" || type === "bl") x1 = Math.max(0,             Math.min(sc.x2 - MIN, sc.x1 + dx));
      if (type === "tr" || type === "br") x2 = Math.min(canvas.width,  Math.max(sc.x1 + MIN, sc.x2 + dx));
      if (type === "tl" || type === "tr") y1 = Math.max(0,             Math.min(sc.y2 - MIN, sc.y1 + dy));
      if (type === "bl" || type === "br") y2 = Math.min(canvas.height, Math.max(sc.y1 + MIN, sc.y2 + dy));
    }

    cropRef.current = { x1, y1, x2, y2 };
    redraw();
  };

  const onUp = (e) => {
    e.preventDefault();
    dragRef.current = null;
  };

  // ── 크롭 영역을 Canvas로 렌더링해 반환 ──
  const getCroppedCanvas = () => {
    const c      = cropRef.current;
    const img    = imgRef.current;
    const canvas = canvasRef.current;
    if (!img) return null;

    const out    = document.createElement("canvas");
    const ctx    = out.getContext("2d");
    const MAX_PX = 1400;

    if (!c) {
      const scale = Math.min(1, MAX_PX / img.naturalWidth, MAX_PX / img.naturalHeight);
      out.width  = Math.round(img.naturalWidth  * scale);
      out.height = Math.round(img.naturalHeight * scale);
      ctx.drawImage(img, 0, 0, out.width, out.height);
    } else {
      const sx = img.naturalWidth  / canvas.width;
      const sy = img.naturalHeight / canvas.height;
      const { x1, y1, x2, y2 } = c;
      const cropW = (x2 - x1) * sx;
      const cropH = (y2 - y1) * sy;
      const scale = Math.min(1, MAX_PX / cropW, MAX_PX / cropH);
      out.width  = Math.round(cropW * scale);
      out.height = Math.round(cropH * scale);
      ctx.drawImage(img, x1 * sx, y1 * sy, cropW, cropH, 0, 0, out.width, out.height);
    }

    const outMime = mimeType === "image/png" ? "image/png" : "image/jpeg";
    return { out, outMime };
  };

  // ── 크롭 적용 → OCR ──
  const handleApply = () => {
    const result = getCroppedCanvas();
    if (!result) return;
    const { out, outMime } = result;
    const dataUrl = out.toDataURL(outMime, outMime === "image/jpeg" ? 0.92 : undefined);
    onCrop(dataUrl.split(",")[1], outMime);
  };

  return (
    <motion.div
      className="crop-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onCancel}
    >
      <motion.div
        ref={modalRef}
        className="crop-modal"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="crop-modal-hdr">
          <h2>텍스트 영역 선택 <span>꼭지점·내부 드래그로 조정</span></h2>
          <button type="button" className="crop-close-btn" onClick={onCancel}>
            <X size={14} />
          </button>
        </div>
        <div className="crop-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="crop-canvas"
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          />
        </div>
        <div className="crop-modal-footer">
          <button type="button" className="crop-cancel-btn" onClick={onCancel}>취소</button>
          <button type="button" className="crop-reset-btn" onClick={initCrop}>초기화</button>
          <button type="button" className="crop-save-btn" onClick={async () => {
            const result = getCroppedCanvas();
            if (!result) return;
            const { out, outMime } = result;
            const ext     = outMime === "image/png" ? "png" : "jpg";
            const dataUrl = out.toDataURL(outMime, outMime === "image/jpeg" ? 0.92 : undefined);
            try {
              const blob = await fetch(dataUrl).then(r => r.blob());
              const file = new File([blob], `memo-${Date.now()}.${ext}`, { type: outMime });
              if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: "메모 이미지" });
              } else {
                const a = document.createElement("a");
                a.href = dataUrl;
                a.download = `memo-${Date.now()}.${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }
            } catch (e) { console.error(e); }
          }}>이미지 저장</button>
          <button type="button" className="crop-apply-btn" onClick={handleApply}>텍스트 추출</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function IntelliMemoApp() {
  const [activeView,     setActiveView]     = useState("memos");
  const [layoutMode,     setLayoutMode]     = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? "portrait" : "landscape"
  );
  const [memos,          setMemos]          = useState([]);
  const [actions,        setActions]        = useState([]);
  const [memoText,       setMemoText]       = useState("");
  const [selectedTag,    setSelectedTag]    = useState(DEFAULT_TAG);
  const [actionText,     setActionText]     = useState("");
  const [actionDueDate,  setActionDueDate]  = useState("");
  const [actionPriority, setActionPriority] = useState("normal");
  const [actionFilter,   setActionFilter]   = useState("all");
  const [tagFilter,      setTagFilter]      = useState("all");
  const [searchQuery,    setSearchQuery]    = useState("");
  const [searchOpen,     setSearchOpen]     = useState(false);
  const [toast,          setToast]          = useState(null);
  const [isLoaded,       setIsLoaded]       = useState(false);
  const [scrollTop,      setScrollTop]      = useState(0);
  const [tick,           setTick]           = useState(Date.now());

  const hasHydrated  = useRef(false);
  const toastTimer   = useRef(null);
  const scrollRafRef = useRef(null);

  const {
    aiSettings, setAiSettings,
    aiStatus, setAiStatus,
    aiError, setAiError,
    pendingCorrection, setPendingCorrection,
    rateLimitInfo, setRateLimitInfo,
    rateLimitSec,
    correctDraft,
  } = useAiCorrection({ memoText, actionText, setMemoText, setActionText, hasHydrated });

  // ── Hydrate ──
  useEffect(() => {
    let alive = true;
    const hydrate = async () => {
      const [sm, sa, sai] = await Promise.all([
        loadJson("memos",      []),
        loadJson("actions",    []),
        loadJson(AI_SETTINGS_STORAGE_KEY, { model: DEFAULT_AI_MODEL }),
      ]);
      if (!alive) return;

      setMemos(Array.isArray(sm) ? sm : []);
      setActions(Array.isArray(sa) ? sa : []);

      if (sai && typeof sai === "object") {
        const model = normalizeModel(sai.model);
        setAiSettings({ apiKey: loadSessionValue(AI_API_KEY_SESSION_KEY), model });
        setAiStatus({ state: "idle", message: `Gemini · ${model}` });
      }

      hasHydrated.current = true;
      setTimeout(() => alive && setIsLoaded(true), 220);
    };
    hydrate();
    return () => { alive = false; };
  }, []);

  // ── 반응형 레이아웃 (뷰포트 너비 640px 기준) ──
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e) => setLayoutMode(e.matches ? "portrait" : "landscape");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ── Tick ──
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Persist ──
  useEffect(() => { if (hasHydrated.current) saveJson("memos",   memos);   }, [memos]);
  useEffect(() => { if (hasHydrated.current) saveJson("actions", actions); }, [actions]);

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
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((a) => a.text.toLowerCase().includes(q));
    }
    return list;
  }, [actions, actionFilter, searchQuery]);

  const filteredMemos = useMemo(() => {
    let list = tagFilter === "all" ? memos : memos.filter((m) => m.tag === tagFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((m) => m.text.toLowerCase().includes(q));
    }
    return list;
  }, [memos, tagFilter, searchQuery]);

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
    const index = memos.findIndex((m) => m.id === id);
    const target = memos[index];
    if (!target) return;
    setMemos((cur) => cur.filter((m) => m.id !== id));
    showToast(`메모 삭제됨`, () => {
      setMemos((cur) => {
        const exists = cur.some((m) => m.id === id);
        if (exists) return cur;
        const next = [...cur];
        next.splice(Math.min(index, next.length), 0, target);
        return next;
      });
    });
  }, [memos, showToast]);

  const editMemo = useCallback((id, text, tag) => {
    setMemos((cur) => cur.map((m) => m.id === id ? { ...m, text, tag } : m));
  }, []);

  const deleteAction = useCallback((id) => {
    const index = actions.findIndex((a) => a.id === id);
    const target = actions[index];
    if (!target) return;
    setActions((cur) => cur.filter((a) => a.id !== id));
    showToast(`액션 삭제됨`, () => {
      setActions((cur) => {
        const exists = cur.some((a) => a.id === id);
        if (exists) return cur;
        const next = [...cur];
        next.splice(Math.min(index, next.length), 0, target);
        return next;
      });
    });
  }, [actions, showToast]);

  const toggleAction = useCallback((id) => {
    setActions((cur) => cur.map((a) => a.id === id ? { ...a, done: !a.done } : a));
  }, []);

  const handleScroll = useCallback((e) => {
    const top = e.currentTarget.scrollTop;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      setScrollTop(top);
      scrollRafRef.current = null;
    });
  }, []);

  const frameClass = `frame force-${layoutMode}`;

  return (
    <main className="app">
      <div className={frameClass}>
        <Header
          activeView={activeView}
          setActiveView={setActiveView}
          actionFilter={actionFilter}
          setActionFilter={setActionFilter}
          compact={scrollTop > 20}
          layoutMode={layoutMode}
          onToggleLayout={() => setLayoutMode((m) => (m === "landscape" ? "portrait" : "landscape"))}
          searchOpen={searchOpen}
          onToggleSearch={() => { if (searchOpen) { setSearchQuery(""); } setSearchOpen((o) => !o); }}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />

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
          onOcrError={(err) => setAiError(err)}
          rateLimitInfo={rateLimitInfo}
          rateLimitSec={rateLimitSec}
          onRateLimit={(limitType, sec) => {
            if (limitType === "rpm") setRateLimitInfo({ type: "rpm", until: Date.now() + sec * 1000 });
            else setRateLimitInfo({ type: limitType });
          }}
          onDismissRateLimit={() => setRateLimitInfo(null)}
        />

        <section
          className="stage"
          onScroll={handleScroll}
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
                      memos.length > 0
                        ? <p style={{ textAlign: "center", color: "var(--t3)", fontSize: 13, padding: "32px 0" }}>
                            {searchQuery.trim() ? "검색 결과가 없습니다" : "필터 조건에 맞는 메모가 없습니다"}
                          </p>
                        : <EmptyState type="memos" />
                    ) : (
                      memoGroups.map(([label, group]) => (
                        <div key={label} className="date-group">
                          <p className="date-group-label">{label}</p>
                          <div className="memo-list">
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
                          </div>
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
                      actions.length > 0
                        ? <p style={{ textAlign: "center", color: "var(--t3)", fontSize: 13, padding: "32px 0" }}>
                            {searchQuery.trim() ? "검색 결과가 없습니다" : "필터 조건에 맞는 액션이 없습니다"}
                          </p>
                        : <EmptyState type="actions" />
                    ) : (
                      <div className="action-list">
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
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <footer className="app-footer">Made by Brian Park</footer>
        </section>
      </div>

      {/* Undo toast */}
      <AnimatePresence>
        {toast && (
          <UndoToast
            key="undo-toast"
            msg={toast.msg}
            onUndo={() => { toast.undo(); setToast(null); }}
          />
        )}
      </AnimatePresence>

      {/* AI error modal */}
      <AnimatePresence>
        {aiError && (
          <ErrorModal
            key="err-modal"
            error={aiError}
            onClose={() => setAiError(null)}
          />
        )}
      </AnimatePresence>

      {/* 교정/번역 모달 */}
      <AnimatePresence>
        {pendingCorrection && (
          <CorrectionModal
            key="correction-modal"
            original={pendingCorrection.original}
            corrected={pendingCorrection.corrected}
            title={pendingCorrection.mode === "translate" ? "번역 제안" : "문장 교정 제안"}
            correctedLabel={pendingCorrection.mode === "translate" ? "번역" : "교정 제안"}
            onApply={() => {
              setMemoText(pendingCorrection.corrected);
              setPendingCorrection(null);
            }}
            onCancel={() => setPendingCorrection(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
