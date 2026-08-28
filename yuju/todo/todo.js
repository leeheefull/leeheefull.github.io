const SHEET_ID = "104A_zVF_ECnkXugsAEqP5sTFCUII9UTMuSU2ditiLjo";
// to-do-list 탭 컬럼: 1 id | 2 created_at | 3 who | 4 text | 5 done_at
// 완료 여부는 done_at 하나로 판단한다(비어 있으면 아직 안 한 것). 별도 플래그를 두면 둘이 어긋난다.
const READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=to-do-list`;
// to-do 액션이 들어간 배포. 스크립트를 새 배포로 올리면 주소가 바뀌므로 여기도 같이 갈아야 한다.
const WRITE_URL =
  "https://script.google.com/macros/s/AKfycbxlFGU5oVFOqzA4EGONjctzIpdLt42SNMqBL6B2pRxO2NbHd4VD5NQ85rUlkMSsG5Vp/exec";

const todoStatus = document.getElementById("todoStatus");
const todoList = document.getElementById("todoList");
const todoForm = document.getElementById("todoForm");
const todoText = document.getElementById("todoText");
const memoryBtn = document.getElementById("memoryBtn");
const memoryPeek = document.getElementById("memoryPeek");
const doneCount = document.getElementById("doneCount");
const todoMain = document.getElementById("todoMain");
const doneScreen = document.getElementById("doneScreen");
const doneList = document.getElementById("doneList");
const doneBackBtn = document.getElementById("doneBackBtn");

let items = [];
// 시트에 아직 반영되지 않은 내 변경. id -> { doneAt, tries }
// tries는 다시 읽어본 횟수. 시트 반영이 원래 몇 초 걸리므로 한 번 어긋났다고 실패로 보면 안 된다.
const pending = new Map();
const WARN_AFTER = 2; // 이만큼 확인해도 안 보이면 저장 실패로 표시
const GIVE_UP_AFTER = 4;
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

// main.js가 D-day용으로 이미 kstFmt를 전역에 선언한다. 같은 이름을 쓰면 스크립트 전체가 죽는다.
const todoKstFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

function todayKst() {
  return todoKstFmt.format(new Date());
}

function nowKst() {
  const d = new Date();
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit",
  }).format(d);
  return `${todoKstFmt.format(d)} ${time}`;
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function prettyDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[2])}월 ${Number(m[3])}일` : iso;
}

function parseSheet(csv) {
  return csv
    .trim()
    .split(/\r?\n/)
    .map(parseCsvRow)
    .filter((r) => r[0] && r[0] !== "id")
    .map((r) => ({
      id: r[0],
      createdAt: r[1] || "",
      who: r[2] || "",
      text: r[3] || "",
      doneAt: (r[4] || "").trim(),
    }));
}

// 시트가 진실이지만, 아직 반영 안 된 내 변경은 덮어쓰지 않는다.
function merge(fromSheet) {
  const byId = new Map(fromSheet.map((it) => [it.id, it]));

  for (const [id, want] of pending) {
    const onSheet = byId.get(id);
    if (onSheet && onSheet.doneAt === want.doneAt) {
      pending.delete(id);
      continue;
    }
    want.tries++;
    const local = items.find((it) => it.id === id);
    if (onSheet) byId.set(id, { ...onSheet, doneAt: want.doneAt });
    else if (local) byId.set(id, local);
  }

  items = [...byId.values()];
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

function row(item, done) {
  const li = document.createElement("li");
  li.className = done ? "todo-row done" : "todo-row";

  const tick = document.createElement("button");
  tick.type = "button";
  tick.className = "todo-tick";
  tick.setAttribute("aria-label", done ? "안 한 걸로 되돌리기" : "했어요");
  tick.addEventListener("click", () => toggle(item.id));

  const body = document.createElement("div");
  const t = document.createElement("p");
  t.className = "todo-text";
  t.textContent = item.text;
  const meta = document.createElement("p");
  meta.className = "todo-meta";

  const unsaved = pending.get(item.id);
  if (unsaved && unsaved.tries >= WARN_AFTER) {
    meta.textContent = "저장이 확인되지 않았어요";
    meta.classList.add("warn");
  } else {
    meta.textContent = done ? `${prettyDate(item.doneAt)}에 했어` : item.who;
  }

  body.append(t, meta);
  li.append(tick, body);
  return li;
}

function render() {
  const todo = items
    .filter((it) => !it.doneAt)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const done = items
    .filter((it) => it.doneAt)
    .sort((a, b) => (a.doneAt < b.doneAt ? 1 : -1));

  todoList.innerHTML = "";
  for (const it of todo) todoList.append(row(it, false));

  todoStatus.textContent = todo.length ? "" : "아직 없어요. 하고 싶은 걸 적어보세요!";

  memoryBtn.hidden = done.length === 0;
  doneCount.textContent = `${done.length}개`;
  memoryPeek.innerHTML = "";
  for (const it of done.slice(0, 3)) {
    const li = document.createElement("li");
    const what = document.createElement("span");
    what.textContent = it.text;
    const when = document.createElement("span");
    when.textContent = prettyDate(it.doneAt);
    li.append(what, when);
    memoryPeek.append(li);
  }

  doneList.innerHTML = "";
  for (const it of done) doneList.append(row(it, true));
}

function toggle(id) {
  const item = items.find((it) => it.id === id);
  if (!item) return;

  const doneAt = item.doneAt ? "" : todayKst();
  item.doneAt = doneAt;
  pending.set(id, { doneAt, tries: 0 });

  render(); // 시트 저장은 느리므로 화면부터 바꾼다
  post({ action: "todo-toggle", id, doneAt });
  scheduleResync();
}

todoForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const text = todoText.value.trim();
  if (!text) return;

  const item = {
    id: newId(),
    createdAt: nowKst(),
    who: todoForm.elements.who.value,
    text,
    doneAt: "",
  };
  items.push(item);
  pending.set(item.id, { doneAt: "", tries: 0 });
  todoText.value = "";

  render();
  post({ action: "todo-add", ...item, createdAt: item.createdAt });
  scheduleResync();
});

memoryBtn.addEventListener("click", () => {
  todoMain.hidden = true;
  doneScreen.hidden = false;
  window.scrollTo(0, 0);
});

doneBackBtn.addEventListener("click", () => {
  doneScreen.hidden = true;
  todoMain.hidden = false;
  window.scrollTo(0, 0);
});

async function load() {
  try {
    const res = await fetch(READ_URL, { cache: "no-store" });
    merge(parseSheet(await res.text()));
  } catch {
    todoStatus.textContent = "불러오지 못했어요. 잠시 후 다시 열어주세요.";
    return;
  }
  render();

  // 아직 시트에서 확인 못 한 변경이 남아 있으면 조금 더 기다렸다 다시 본다
  const retrying = [...pending.values()].some((p) => p.tries < GIVE_UP_AFTER);
  if (retrying) scheduleResync(5000);
}

load();
