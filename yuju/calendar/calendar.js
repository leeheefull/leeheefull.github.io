const SHEET_ID = "104A_zVF_ECnkXugsAEqP5sTFCUII9UTMuSU2ditiLjo";
// calendar 탭 컬럼: 1 id | 2 date | 3 kind | 4 title | 5 who | 6 photo_id | 7 created_at
// kind 가 event/anniv 이면 일정, photo 면 그 날의 사진(하루 한 장, date 가 키).
// 일정과 사진을 한 탭에 두는 건 이 화면이 둘을 항상 같이 쓰기 때문이다.
const READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=calendar`;
// 캘린더 액션이 들어간 배포. 스크립트를 새 배포로 올리면 여기도 같이 갈아야 한다.
const WRITE_URL =
  "https://script.google.com/macros/s/AKfycby39E0HemmFkLNCULIiobvTWNKWH-C-qD_nRYvWzYcL2ijpO7UGxQifoyR3Vy-R6obO/exec";

// 드라이브는 크기를 지정한 썸네일을 그냥 내준다. 칸은 50px이라 w120이면 충분하고,
// 한 달에 31장을 부르므로 원본을 쓰면 데이터가 수십 배로 뛴다.
const thumbUrl = (id, w) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;

const WHOS = ["희찬", "유주", "우리"];
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

const calGrid = document.getElementById("calGrid");
const calMonth = document.getElementById("calMonth");
const calStatus = document.getElementById("calStatus");
const photoToggle = document.getElementById("photoToggle");
const whoBar = document.getElementById("whoBar");
const calSheet = document.getElementById("calSheet");
const calBackdrop = document.getElementById("calBackdrop");
const sheetTitle = document.getElementById("sheetTitle");
const sheetPhoto = document.getElementById("sheetPhoto");
const sheetEvents = document.getElementById("sheetEvents");
const sheetStatus = document.getElementById("sheetStatus");
const calForm = document.getElementById("calForm");
const calText = document.getElementById("calText");
const calSubmit = document.getElementById("calSubmit");
const calAnniv = document.getElementById("calAnniv");

let rows = [];               // 시트에서 읽은 전체
let offset = 0;              // 0 = 이번 달
let selected = null;         // "2026-09-19"
let showPhotos = true;
const whoOn = new Set(WHOS);
// 시트에 아직 반영 안 된 내 추가. 시트 반영이 몇 초 걸려서 바로 다시 읽으면 없는 것처럼 보인다.
const pendingAdds = new Map();
const GIVE_UP_AFTER = 4;

// main.js가 D-day용으로 kstFmt를 전역에 선언한다. 같은 이름을 쓰면 스크립트 전체가 죽는다.
const calKstFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
const todayKey = calKstFmt.format(new Date());

// gviz CSV는 모든 셀을 따옴표로 감싸고, 글 안의 줄바꿈도 그대로 담는다
function parseCsv(text) {
  const out = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur); cur = "";
    } else if (ch === "\n") {
      row.push(cur); out.push(row); row = []; cur = "";
    } else if (ch !== "\r") {
      cur += ch;
    }
  }
  row.push(cur);
  if (row.length > 1 || row[0]) out.push(row);
  return out;
}

// 서식이 텍스트가 아니면 시트가 날짜 셀로 바꿔 "2026. 9. 3." 처럼 온다. 그것도 맞춰본다
function dateKey(v) {
  const s = String(v).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dotted = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/.exec(s);
  if (dotted) {
    return `${dotted[1]}-${String(dotted[2]).padStart(2, "0")}-${String(dotted[3]).padStart(2, "0")}`;
  }
  return s.slice(0, 10);
}

function parseSheet(csv) {
  return parseCsv(csv)
    .filter((r) => r[0] && r[0] !== "id")
    .map((r) => ({
      id: r[0],
      date: dateKey(r[1] || ""),
      kind: (r[2] || "").trim(),
      title: r[3] || "",
      who: (r[4] || "").trim(),
      photoId: (r[5] || "").trim(),
    }));
}

function monthDate() {
  const [y, m] = todayKey.split("-").map(Number);
  return new Date(y, m - 1 + offset, 1);
}

const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d, day) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(day)}`;

function eventsOn(key) {
  return rows.filter((r) => r.date === key && r.kind !== "photo");
}
function photoOn(key) {
  const hit = rows.find((r) => r.date === key && r.kind === "photo" && r.photoId);
  return hit ? hit.photoId : null;
}
function visibleEventsOn(key) {
  // 이름 버튼으로 걸러진 것만 칸에 보여준다. 시트가 아니라 보기 설정이다
  return eventsOn(key).filter((e) => !e.who || whoOn.has(e.who));
}

function whoClass(who) {
  if (who === "희찬") return "me";
  if (who === "유주") return "you";
  return "us";
}

function cell(day, key, outside) {
  const li = document.createElement(outside ? "span" : "button");
  li.className = "cal-cell" + (outside ? " out" : "");
  if (!outside) {
    li.type = "button";
    li.dataset.key = key;
  }

  const dowIdx = new Date(key).getDay();
  if (dowIdx === 0) li.classList.add("sun");
  if (dowIdx === 6) li.classList.add("sat");
  if (key === todayKey) li.classList.add("today");

  const d = document.createElement("span");
  d.className = "cal-d";
  if (key === todayKey) {
    const dot = document.createElement("span");
    dot.textContent = day;
    d.append(dot);
  } else {
    d.textContent = day;
  }
  li.append(d);

  if (!outside) {
    for (const ev of visibleEventsOn(key).slice(0, 2)) {
      const tag = document.createElement("span");
      tag.className = `cal-tag ${ev.kind === "anniv" ? "anniv" : whoClass(ev.who)}`;
      tag.textContent = ev.title;
      li.append(tag);
    }
    const pid = showPhotos ? photoOn(key) : null;
    if (pid) {
      const wrap = document.createElement("span");
      wrap.className = "cal-photo";
      const img = document.createElement("img");
      img.src = thumbUrl(pid, 120);
      img.alt = "";
      img.loading = "lazy";
      // 드라이브가 가끔 썸네일을 안 주면 빈 네모만 남으므로 자리째 접는다
      img.addEventListener("error", () => wrap.remove());
      wrap.append(img);
      li.append(wrap);
    }
  }
  return li;
}

function render() {
  const d = monthDate();
  calMonth.textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;

  const first = d.getDay();
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const prevDays = new Date(d.getFullYear(), d.getMonth(), 0).getDate();

  const frag = document.createDocumentFragment();
  // 지난달·다음달 날짜를 회색으로 채워야 주가 끊겨 보이지 않는다
  for (let i = first - 1; i >= 0; i--) frag.append(cell(prevDays - i, "", true));
  for (let day = 1; day <= days; day++) frag.append(cell(day, keyOf(d, day), false));
  const tail = (7 - ((first + days) % 7)) % 7;
  for (let i = 1; i <= tail; i++) frag.append(cell(i, "", true));

  calGrid.replaceChildren(frag);
}

/* ── 그 날 시트 ── */
function prettyKey(key) {
  const [, m, dd] = key.split("-").map(Number);
  return `${m}월 ${dd}일 ${DOW[new Date(key).getDay()]}요일`;
}

function renderSheet() {
  if (!selected) return;
  sheetTitle.textContent = prettyKey(selected) + (selected === todayKey ? " · 오늘" : "");

  const pid = photoOn(selected);
  sheetPhoto.replaceChildren();
  if (pid) {
    const box = document.createElement("div");
    box.className = "cal-sheet-photo";
    const img = document.createElement("img");
    img.src = thumbUrl(pid, 1000);
    img.alt = "";
    box.append(img);
    sheetPhoto.append(box);
  } else {
    const empty = document.createElement("div");
    empty.className = "cal-sheet-photo empty";
    empty.textContent = "아직 사진이 없어요";
    sheetPhoto.append(empty);
  }

  const evs = eventsOn(selected);
  sheetEvents.replaceChildren();
  if (!evs.length) {
    const li = document.createElement("li");
    li.className = "cal-ev-empty";
    li.textContent = "일정이 없어요.";
    sheetEvents.append(li);
  } else {
    for (const ev of evs) {
      const li = document.createElement("li");
      li.className = ev.kind === "anniv" ? "anniv" : "";
      const t = document.createElement("span");
      t.textContent = (ev.kind === "anniv" ? "❤ " : "") + ev.title;
      const w = document.createElement("span");
      w.className = "who-tag";
      w.textContent = ev.who;
      li.append(t, w);
      if (pendingAdds.has(ev.id)) li.classList.add("pending");
      sheetEvents.append(li);
    }
  }
}

function openSheet(key) {
  selected = key;
  sheetStatus.textContent = "";
  calText.value = "";
  calAnniv.checked = false;
  renderSheet();
  calSheet.hidden = false;
  calBackdrop.hidden = false;
  requestAnimationFrame(() => calSheet.classList.add("open"));
}

function closeSheet() {
  calSheet.classList.remove("open");
  calBackdrop.hidden = true;
  selected = null;
  setTimeout(() => { if (!selected) calSheet.hidden = true; }, 280);
}

/* ── 읽기 ── */
function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function merge(fromSheet) {
  const ids = new Set(fromSheet.map((r) => r.id));
  const extra = [];
  for (const [id, item] of pendingAdds) {
    if (ids.has(id)) { pendingAdds.delete(id); continue; }
    item.tries++;
    if (item.tries > GIVE_UP_AFTER) { pendingAdds.delete(id); continue; }
    extra.push(item.row);
  }
  rows = fromSheet.concat(extra);
}

async function load(quiet) {
  try {
    const res = await fetch(READ_URL, { cache: "no-store" });
    merge(parseSheet(await res.text()));
    calStatus.textContent = "";
    calStatus.hidden = true;
  } catch {
    if (!quiet) {
      calStatus.hidden = false;
      calStatus.textContent = "달력을 불러오지 못했어요. 잠시 후 다시 열어주세요.";
    }
    return;
  }
  render();
  if (selected) renderSheet();
}

function post(payload) {
  // Apps Script는 CORS 응답을 안 주므로 no-cors로 보내고 결과를 읽을 수 없다.
  // 성공 여부는 잠시 뒤 시트를 다시 읽어서 확인한다.
  fetch(WRITE_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

/* ── 이벤트 ── */
document.getElementById("prevBtn").addEventListener("click", () => { offset--; render(); });
document.getElementById("nextBtn").addEventListener("click", () => { offset++; render(); });

photoToggle.addEventListener("change", () => {
  showPhotos = photoToggle.checked;
  render();
});

whoBar.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-w]");
  if (!b) return;
  const who = b.dataset.w;
  if (whoOn.has(who)) whoOn.delete(who); else whoOn.add(who);
  b.setAttribute("aria-pressed", String(whoOn.has(who)));
  render();
});

calGrid.addEventListener("click", (e) => {
  const c = e.target.closest(".cal-cell[data-key]");
  if (c) openSheet(c.dataset.key);
});

document.getElementById("sheetClose").addEventListener("click", closeSheet);
calBackdrop.addEventListener("click", closeSheet);

calForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = calText.value.trim();
  if (!title || !selected) return;

  const id = newId();
  const row = {
    id,
    date: selected,
    kind: calAnniv.checked ? "anniv" : "event",
    title,
    who: calForm.elements.who.value,
    photoId: "",
  };

  post({
    action: "cal-add",
    id,
    date: row.date,
    kind: row.kind,
    title: row.title,
    who: row.who,
  });

  // 시트가 진실이지만 반영까지 몇 초 걸리므로 화면에는 먼저 얹는다
  pendingAdds.set(id, { row, tries: 0 });
  rows = rows.concat(row);
  calText.value = "";
  calAnniv.checked = false;
  sheetStatus.textContent = "추가했어요!";
  renderSheet();
  render();
  setTimeout(() => load(true), 1500);
});

load();
