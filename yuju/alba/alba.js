const SHEET_ID = "104A_zVF_ECnkXugsAEqP5sTFCUII9UTMuSU2ditiLjo";
// alba 탭에는 표 네 개가 나란히 있다. D·I·M열은 표를 가르는 빈 열이다.
//   A~C 근무 시간표 : day | start | end
//   E~H 체크 항목   : id | order | text | active
//   J~L 날짜별 기록 : date | done | updated_at
//   N~P 휴게 시간   : day | break_start | break_end (한 줄이 휴게 하나. 같은 요일을 여러 줄 적으면 여러 번 쉰다)
const READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=alba`;
// alba-check 액션이 들어간 배포. 스크립트를 새 배포로 올리면 주소가 바뀌므로 여기도 같이 갈아야 한다.
const WRITE_URL =
  "https://script.google.com/macros/s/AKfycbxGbX_-OKzZ_b3hh22hzEfjMIJ9DpT1uQyXnEVJuuwvqVmM6L-hJp3OGtASjeTyeuT-/exec";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const TICK = 20 * 1000;
const WARN_AFTER = 2; // 이만큼 다시 읽어도 안 보이면 저장 실패로 표시
const GIVE_UP_AFTER = 4;
const CACHE_TRUST_MS = 2 * 60 * 1000;

const statusEl = document.getElementById("albaStatus");
const cardEl = document.getElementById("albaCard");
const labelEl = document.getElementById("albaLabel");
const bigEl = document.getElementById("albaBig");
const spanEl = document.getElementById("albaSpan");
const progEl = document.getElementById("albaProg");
const countEl = document.getElementById("albaCount");
const fillEl = document.getElementById("albaBarFill");
const listEl = document.getElementById("albaList");
const noteEl = document.getElementById("albaNote");

const schedule = new Map(); // "월" -> { start: 540, end: 1080 } (분 단위)
const breaks = new Map(); // "월" -> [{ start, end }, ...] 시작 시각 순
let tasks = [];
let checked = new Set();
let today = "";
let loaded = false;
// 시트에서 아직 확인하지 못한 내 변경. { done, tries }
let pending = null;
let resyncTimer = null;

// gviz CSV는 모든 셀을 따옴표로 감싸므로 내용의 쉼표/따옴표까지 처리한다
function parseCsvRow(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

// main.js가 D-day용으로 이미 kstFmt를 전역에 선언한다. 같은 이름을 쓰면 이 파일 전체가 죽는다.
const albaKstFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
const albaTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
});

function todayKst() {
  return albaKstFmt.format(new Date());
}

function nowMinutes() {
  const [h, m] = albaTimeFmt.format(new Date()).split(":").map(Number);
  return (h % 24) * 60 + m; // 자정을 24:00으로 주는 환경이 있다
}

function dowOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function toMinutes(text) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(text).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function hhmm(min) {
  const t = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function humanLeft(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

function doneIds() {
  // 항목 순서대로 이어붙여야 시트에 쓴 값과 다시 읽은 값을 그대로 비교할 수 있다
  return tasks.filter((t) => checked.has(t.id)).map((t) => t.id).join(",");
}

function toSet(csv) {
  return new Set(csv ? csv.split(",").map((s) => s.trim()).filter(Boolean) : []);
}

// ── 폰에 남기는 사본: 체크하자마자 앱을 껐다 켜면 시트가 아직 못 따라온다 ──
function cacheKey() {
  return `alba:${today}`;
}

function cacheWrite() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({ done: doneIds(), at: Date.now() }));
  } catch {}
}

function cacheRead() {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v.done !== "string") return null;
    // 방금 저장한 값일 때만 믿는다. 오래된 값은 시트가 진실이다
    if (Date.now() - (v.at || 0) > CACHE_TRUST_MS) return null;
    return v.done;
  } catch {
    return null;
  }
}

function parseSheet(csv) {
  const rows = csv.trim().split(/\r?\n/).map(parseCsvRow);
  const log = new Map();

  schedule.clear();
  breaks.clear();
  tasks = [];

  for (const r of rows) {
    const day = (r[0] || "").trim();
    const start = toMinutes(r[1]);
    const end = toMinutes(r[2]);
    // 시각이 둘 다 있어야 근무일. 하나라도 비면 그 요일은 쉬는 날이다
    if (DOW.includes(day) && start !== null && end !== null) {
      schedule.set(day, { start, end });
    }

    const id = (r[4] || "").trim();
    const text = (r[6] || "").trim();
    // active 를 비우면 목록에서 빠진다. 행을 지우면 지난 기록이 항목 이름을 잃는다
    if (id && id !== "id" && text && (r[7] || "").trim()) {
      tasks.push({ id, order: Number(r[5]) || 0, text });
    }

    const date = (r[9] || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) log.set(date, (r[10] || "").trim());

    const restDay = (r[13] || "").trim();
    const restStart = toMinutes(r[14]);
    const restEnd = toMinutes(r[15]);
    if (DOW.includes(restDay) && restStart !== null && restEnd !== null) {
      if (!breaks.has(restDay)) breaks.set(restDay, []);
      breaks.get(restDay).push({ start: restStart, end: restEnd });
    }
  }

  tasks.sort((a, b) => a.order - b.order);
  for (const list of breaks.values()) list.sort((a, b) => a.start - b.start);
  return log;
}

function applyLog(log) {
  const onSheet = log.get(today) || "";

  if (pending) {
    if (onSheet === pending.done) {
      pending = null;
    } else {
      pending.tries++;
      return; // 시트 반영이 늦어도 내 변경을 덮어쓰지 않는다
    }
  }

  const fresh = cacheRead();
  if (fresh !== null && fresh !== onSheet) {
    checked = toSet(fresh);
    pending = { done: fresh, tries: 0 };
    return;
  }

  checked = toSet(onSheet);
}

function shiftState() {
  const day = dowOf(today);
  const plan = schedule.get(day);
  if (!plan) return { mode: "rest" };

  const now = nowMinutes();
  // 자정을 넘겨 끝나는 근무는 종료를 다음날로 본다
  const end = plan.end <= plan.start ? plan.end + 1440 : plan.end;

  if (now < plan.start) return { mode: "before", left: plan.start - now, plan };
  if (now < end) {
    const rest = (breaks.get(day) || []).find((b) => now >= b.start && now < b.end);
    if (rest) return { mode: "break", left: rest.end - now, plan, rest };
    return { mode: "during", left: end - now, plan };
  }
  return { mode: "after", plan };
}

function nextWorkDay() {
  const [y, m, d] = today.split("-").map(Number);
  for (let i = 1; i <= 7; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const day = DOW[dt.getUTCDay()];
    if (schedule.has(day)) {
      return `${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일 (${day})`;
    }
  }
  return "";
}

function renderCard() {
  const st = shiftState();

  cardEl.hidden = false;
  cardEl.className = "alba-card";

  if (st.mode === "rest") {
    cardEl.classList.add("rest");
    labelEl.textContent = "오늘은";
    bigEl.textContent = "쉬는 날";
    const next = nextWorkDay();
    spanEl.textContent = next ? `다음 근무 · ${next}` : "";
  } else if (st.mode === "break") {
    cardEl.classList.add("break");
    labelEl.textContent = "휴게 중";
    bigEl.textContent = `${humanLeft(st.left)} 남음`;
    spanEl.textContent = `${hhmm(st.rest.start)} – ${hhmm(st.rest.end)}`;
  } else {
    spanEl.textContent = `${hhmm(st.plan.start)} – ${hhmm(st.plan.end)}`;
    if (st.mode === "before") {
      labelEl.textContent = "출근까지";
      bigEl.textContent = humanLeft(st.left);
    } else if (st.mode === "during") {
      labelEl.textContent = "퇴근까지";
      bigEl.textContent = humanLeft(st.left);
    } else {
      cardEl.classList.add("done");
      labelEl.textContent = "오늘 근무";
      bigEl.textContent = "끝났어요";
    }
  }

  const showList = st.mode !== "rest" && tasks.length > 0;
  noteEl.hidden = !(showList && st.mode === "after");
  noteEl.textContent = "자정이 지나면 새로 시작해요";
  return showList;
}

function renderList(showList) {
  progEl.hidden = !showList;
  listEl.hidden = !showList;

  if (!showList) {
    listEl.innerHTML = "";
    statusEl.textContent = "";
    statusEl.classList.remove("warn");
    return;
  }

  const done = tasks.filter((t) => checked.has(t.id)).length;
  countEl.textContent = `${done} / ${tasks.length}`;
  fillEl.style.width = `${(done / tasks.length) * 100}%`;
  fillEl.classList.toggle("full", done === tasks.length);

  listEl.innerHTML = "";
  for (const t of tasks) {
    const isDone = checked.has(t.id);
    const li = document.createElement("li");
    li.className = isDone ? "alba-row done" : "alba-row";

    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "alba-tick";
    tick.setAttribute("aria-label", isDone ? "안 한 걸로 되돌리기" : "했어요");
    tick.addEventListener("click", () => toggle(t.id));

    const p = document.createElement("p");
    p.className = "alba-text";
    p.textContent = t.text;

    li.append(tick, p);
    listEl.append(li);
  }

  const stuck = pending && pending.tries >= WARN_AFTER;
  statusEl.textContent = stuck ? "저장이 확인되지 않았어요" : "";
  statusEl.classList.toggle("warn", Boolean(stuck));
}

function render() {
  if (!loaded) return;
  renderList(renderCard());
}

function post(payload) {
  // Apps Script는 CORS 응답을 안 주므로 no-cors로 보내고 결과는 읽을 수 없다.
  // 그래서 성공 여부는 잠시 뒤 시트를 다시 읽어서 확인한다.
  fetch(WRITE_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function scheduleResync(delay = 3000) {
  clearTimeout(resyncTimer);
  resyncTimer = setTimeout(load, delay); // 시트 반영까지 시간이 걸린다
}

function toggle(id) {
  if (checked.has(id)) checked.delete(id);
  else checked.add(id);

  pending = { done: doneIds(), tries: 0 };
  cacheWrite();
  render(); // 시트 저장은 느리므로 화면부터 바꾼다
  post({ action: "alba-check", date: today, done: pending.done });
  scheduleResync();
}

async function load() {
  try {
    const res = await fetch(READ_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    applyLog(parseSheet(await res.text()));
  } catch {
    if (!loaded) statusEl.textContent = "불러오지 못했어요. 잠시 후 다시 열어주세요.";
    return;
  }

  loaded = true;
  render();

  if (pending && pending.tries < GIVE_UP_AFTER) scheduleResync(5000);
}

setInterval(() => {
  const d = todayKst();
  if (d !== today) {
    // 화면을 켜둔 채 날이 바뀌었다. 새 날은 기록이 없으니 빈 체크리스트가 된다
    today = d;
    pending = null;
    checked = new Set();
    load();
    return;
  }
  if (loaded) renderCard();
}, TICK);

today = todayKst();
load();
