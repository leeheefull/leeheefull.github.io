// to-do-list 탭 컬럼: 1 id | 2 created_at | 3 who | 4 text | 5 done_at
// 완료 여부는 done_at 하나로 판단한다(비어 있으면 아직 안 한 것). 별도 플래그를 두면 둘이 어긋난다.
// 앱은 시트를 직접 읽지 않는다. 읽기도 쓰기도 Apps Script 를 거치므로
// 시트 주소가 여기 없고, 시트를 비공개로 둘 수 있다.
// 배포 주소와 캐시는 store.js 가 갖고 있다.
const SHEET = "to-do-list";

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

// 마지막으로 받아들인 시트 내용. 화면에 보이는 목록은 여기에 아직 답을 못 받은 내 변경을 얹은 것이다
let serverItems = [];
let items = [];
// 응답을 기다리는 내 변경. 보낸 순서대로 얹어야 해서 순번을 키로 쓴다 —
// 같은 항목을 빠르게 두 번 누르면 앞 요청의 답이 와도 뒤에 누른 상태가 화면에 남아야 한다.
// 순번 -> { kind: "add", item } | { kind: "toggle", id, doneAt }
const pending = new Map();
let opSeq = 0;
// 저장에 실패한 항목. 그 줄에 경고를 띄우고, 다시 누르거나 새로 읽으면 지운다
const failed = new Set();
// 추가가 실패해 항목이 사라질 때 목록 위에 남기는 한마디
let notice = "";

// 홈 화면에 띄워둔 앱은 며칠씩 안 닫힌다. 다시 꺼냈을 때 이만큼 지났으면 새로 읽는다
const REFETCH_MS = 60 * 1000;
let lastFetch = 0;

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

// 서버가 준 행(1행은 헤더)을 항목으로. 헤더와 id 없는 빈 줄은 거른다
function parseSheet(rows) {
  return rows
    .filter((r) => r[0] && r[0] !== "id")
    .map((r) => ({
      id: r[0],
      createdAt: r[1] || "",
      who: r[2] || "",
      text: r[3] || "",
      doneAt: (r[4] || "").trim(),
    }));
}

// 시트가 진실이고, 아직 답을 못 받은 내 변경만 그 위에 얹는다.
// 답이 오면(성공이든 실패든) 그 변경을 빼고 다시 얹으므로, 실패하면 저절로 원래대로 돌아간다
function rebuild() {
  const byId = new Map(serverItems.map((it) => [it.id, it]));
  for (const op of pending.values()) {
    if (op.kind === "add") {
      if (!byId.has(op.item.id)) byId.set(op.item.id, op.item);
    } else {
      const it = byId.get(op.id);
      if (it) byId.set(op.id, { ...it, doneAt: op.doneAt });
    }
  }
  items = [...byId.values()];
}

function applyRows(rows) {
  serverItems = parseSheet(rows);
  rebuild();
}

// 보내고, 답이 오면 그 변경을 내려놓는다. 서버는 쓰고 난 탭을 같이 돌려주므로 다시 읽으러 가지 않는다.
// 늦게 도착한 옛 응답이면 rows 가 null 이다 — 그때는 지금 가진 내용을 그대로 둔다
async function send(op, payload, onFail) {
  const seq = ++opSeq;
  pending.set(seq, op);
  rebuild();
  render(); // 시트 저장은 느리므로 화면부터 바꾼다
  try {
    const { rows } = await sendAction(payload, SHEET);
    pending.delete(seq);
    lastFetch = Date.now();
    if (rows) serverItems = parseSheet(rows);
  } catch (err) {
    pending.delete(seq);
    // 키 문제면 잠금 화면이 떠 있다. 되돌리기만 하고 말은 보태지 않는다
    if (!(err instanceof YujuAuthError)) onFail();
  }
  rebuild();
  render();
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

  if (failed.has(item.id)) {
    meta.textContent = "저장하지 못했어요. 다시 눌러 주세요";
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

  todoStatus.textContent = notice || (todo.length ? "" : "아직 없어요. 하고 싶은 걸 적어보세요!");

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
  // 추가가 아직 시트에 안 닿았으면 서버는 그 항목을 못 찾는다. 추가 답이 올 때까지 기다린다
  for (const op of pending.values()) {
    if (op.kind === "add" && op.item.id === id) return;
  }

  const doneAt = item.doneAt ? "" : todayKst();
  failed.delete(id);
  notice = "";
  send({ kind: "toggle", id, doneAt }, { action: "todo-toggle", id, doneAt }, () => {
    failed.add(id);
  });
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
  todoText.value = "";
  notice = "";

  const { id, createdAt, who } = item;
  send({ kind: "add", item }, { action: "todo-add", id, createdAt, who, text }, () => {
    notice = "저장하지 못했어요. 다시 적어 주세요.";
    // 그새 다른 걸 적고 있지 않으면 쓴 글을 돌려놓는다 — 다시 누르기만 하면 되게
    if (!todoText.value) todoText.value = text;
  });
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

async function load(quiet) {
  try {
    const rows = await fetchTab(SHEET);
    lastFetch = Date.now();
    // null 이면 이미 더 새 걸 받아둔 상태다(쓰기 응답이 먼저 왔다든가). 그대로 둔다
    if (!rows) return;
    failed.clear();
    applyRows(rows);
  } catch (err) {
    if (err instanceof YujuAuthError) return; // 잠금 화면이 떠 있다
    // 캐시로 이미 목록이 떠 있으면 굳이 실패를 알리지 않는다
    if (!quiet) todoStatus.textContent = "불러오지 못했어요. 잠시 후 다시 열어주세요.";
    return;
  }
  render();
}

// 다시 꺼냈을 때 상대가 추가하거나 체크한 게 보이도록 새로 읽는다
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastFetch >= REFETCH_MS) load(true);
});

// 키를 기기에 못 남기는 브라우저는 새로 고치지 않고 잠금만 걷는다. 그때 처음부터 다시 읽는다
window.addEventListener("yuju:unlocked", () => load());

// 홈에서 미리 받아뒀거나 지난번에 읽어둔 게 있으면 먼저 그린다. 이어지는 읽기가 덮는다
const cached = cachedTab(SHEET);
if (cached) {
  applyRows(cached);
  render();
}
load(Boolean(cached));
