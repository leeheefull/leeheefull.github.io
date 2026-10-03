// 모든 페이지가 같이 쓰는 것: Apps Script 주소, 기기 토큰, 시트 캐시.
//
// 읽기도 쓰기도 전부 POST 한 군데로 보낸다. 몸통에 기기 토큰을 실어야 해서다 —
// 주소에 실으면 기록과 로그에 남는다. Apps Script 는 POST 응답도 CORS 를 열어주므로
// text/plain 으로만 보내면(사전 요청 없이) 응답을 읽을 수 있다.
//
// 배포 주소는 여기 하나만 둔다. 앱스크립트를 새로 배포하면 고칠 곳은 이 한 줄이다.
const YUJU_API =
  "https://script.google.com/macros/s/AKfycby4KjGUSfec7XZQexFCDNgG-K7gHBKtnmgarLK_r1tpghhPLsEVBLL1V_ugbs-Tnfag/exec";

// 홈에서 한 번에 미리 받아두는 탭들
const YUJU_TABS = ["calendar", "note", "to-do-list", "spain-voca"];

// 등록 안 된 기기이거나 토큰이 끊겼을 때. 부르는 쪽은 이걸 보고 조용히 넘어가면 된다 — 잠금 화면은 여기서 띄운다
class YujuAuthError extends Error {}

// 사파리 프라이빗 모드에서는 localStorage 를 건드리기만 해도 예외가 난다.
// 캐시가 없어도 앱은 그대로 돌아야 하므로 조용히 넘긴다.
function readStore(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 저장 못 해도 동작은 한다 */ }
}
function removeStore(key) {
  try { localStorage.removeItem(key); } catch { /* 없으면 그만 */ }
}

/* ── 기기 토큰 ── */
// 기기마다 처음 한 번 숫자 비밀번호를 누르면 서버가 그 기기 전용 토큰을 준다. 그걸 남겨두고
// 모든 요청에 싣는다. 비밀번호는 코드에도 저장소에도 기기에도 남지 않는다.
const KEY_STORE = "yuju:key";
let memoryKey = null; // localStorage 를 못 쓰는 브라우저용

function yujuKey() {
  return memoryKey || readStore(KEY_STORE);
}

// 토큰이 안 통한다는 답을 받으면 토큰과 함께 이 기기에 남은 데이터도 지운다.
// 기기를 끊었는데 예전 데이터가 남아 보이면 끊은 의미가 없다.
function forgetKey() {
  memoryKey = null;
  removeStore(KEY_STORE);
  purgeTabs();
}

/* ── 서버 호출 ── */
// 성공하면 서버 JSON 을 돌려준다. 실패는 던진다 — 캐시로 버틸지는 부르는 쪽이 정한다
async function yujuCall(payload) {
  const key = yujuKey();
  if (!key) {
    showGate();
    throw new YujuAuthError("no key");
  }
  const res = await fetch(YUJU_API, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, key }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json && json.ok) return json;
  if (json && json.error === "unauthorized") {
    // 보낼 때 실은 토큰이 지금도 그대로일 때만 지운다. 느린 요청(사진 올리기 등)이 옛 토큰으로
    // 늦게 돌아오는 사이 이미 다시 등록했으면, 새로 받은 토큰을 지우고 잠금 화면을 또 띄우게 된다
    if (yujuKey() === key) {
      forgetKey();
      showGate("다시 한 번 눌러주세요.");
    }
    throw new YujuAuthError("unauthorized");
  }
  throw new Error((json && json.error) || "failed");
}

/* ── 시트 캐시 ── */
// 탭마다 페이지가 따로라, 한 페이지가 읽어온 걸 다음 페이지가 쓰려면 기기에 남기는 수밖에 없다.
// 담는 건 서버가 준 행(문자열 2차원 배열) 그대로다 — 해석은 탭마다 달라서 원본이 공통분모다.
//
// at 은 서버가 그 내용을 읽은 시각이다. 응답은 늦게 도착할 수 있어서, 이미 더 새 걸
// 받아둔 뒤에 도착한 옛 내용은 버린다. 쓰기 응답과 읽기 응답이 엇갈려도 뒤로 가지 않는다.
const TAB_PREFIX = "yuju:v2:tab:";
const tabKey = (name) => TAB_PREFIX + name;
// at 만 따로 둔다. 단어장 캐시는 200KB 가까이 돼서, at 하나 보자고 통째로 풀면 홈 하트가 끊긴다
const tabAtKey = (name) => tabKey(name) + ":at";
const tabAt = new Map(); // 이 페이지가 받아둔 탭별 최신 at

// 예전 형식(CSV) 캐시와 예전 홈 칩 캐시. 남겨두면 공간만 차지하고 잠금 전 데이터가 남는다
for (const name of YUJU_TABS) removeStore(`yuju:sheet:${name}`);
removeStore("yuju:annivChip");

function purgeTabs() {
  for (const name of YUJU_TABS) {
    removeStore(tabKey(name));
    removeStore(tabAtKey(name));
  }
  tabAt.clear();
}

// 지난번에 받아둔 행. 없거나 깨졌으면 null
function cachedTab(name) {
  const raw = readStore(tabKey(name));
  if (!raw) return null;
  try {
    const { at, rows } = JSON.parse(raw);
    if (!Array.isArray(rows)) return null;
    if (!tabAt.has(name)) tabAt.set(name, Number(at) || 0);
    return rows;
  } catch {
    return null;
  }
}

// 서버가 준 탭 내용을 받아들인다. 이미 가진 것보다 옛것이면 버리고 false.
// 받아들이면 캐시에 남기고, 다른 스크립트(홈 칩, 글 점)가 알 수 있게 알린다.
function acceptTab(name, rows, at) {
  if (!Array.isArray(rows)) return false;
  if (!tabAt.has(name)) {
    // 캐시의 at 을 먼저 읽어둔다. at 키가 없는 예전 캐시만 통째로 풀어서 본다
    const savedAt = readStore(tabAtKey(name));
    if (savedAt !== null) tabAt.set(name, Number(savedAt) || 0);
    else cachedTab(name);
  }
  const stamp = Number(at) || 0;
  if (stamp < (tabAt.get(name) || 0)) return false;
  tabAt.set(name, stamp);
  writeStore(tabKey(name), JSON.stringify({ at: stamp, rows }));
  writeStore(tabAtKey(name), String(stamp));
  window.dispatchEvent(new CustomEvent("yuju:tab", { detail: { name, rows } }));
  return true;
}

// 여러 탭을 한 번에 읽는다. Apps Script 는 한 번 부르는 데 1~2초가 고정으로 붙어서
// 탭마다 따로 부르는 것보다 묶어 부르는 게 훨씬 빠르다.
// 돌려주는 건 받아들인 탭만이다 — 더 새 걸 이미 가진 탭은 빠진다.
async function fetchTabs(names) {
  const json = await yujuCall({ action: "read", tabs: names });
  const fresh = {};
  for (const name of names) {
    const rows = json.tabs && json.tabs[name];
    if (acceptTab(name, rows, json.at)) fresh[name] = rows;
  }
  return fresh;
}

// 한 탭만. 새 내용이면 행을, 이미 더 새 걸 가졌으면 null
async function fetchTab(name) {
  const fresh = await fetchTabs([name]);
  return fresh[name] || null;
}

// 쓰기. 서버는 쓰고 난 탭 내용을 같이 돌려준다 — 다시 읽으러 갈 필요가 없다.
// 돌려주는 rows 는 받아들였을 때만 있다. 엇갈려 도착한 옛 응답이면 null
async function sendAction(payload, tabName) {
  const json = await yujuCall(payload);
  const rows = tabName && acceptTab(tabName, json.tab, json.at) ? json.tab : null;
  return { json, rows };
}

// 홈에서만 부른다. 홈의 하트를 보는 동안 네 탭을 한 번에 받아두면 탭을 눌렀을 때 기다릴 게 없다.
// 탭을 곧바로 누르면 이 요청은 페이지와 함께 끊긴다. 그래도 탭이 제 몫을 다시 읽으니 손해는 없다.
function prefetchTabs() {
  fetchTabs(YUJU_TABS).catch(() => {});
}

/* ── 잠금 화면 ── */
// 등록 안 된 기기면 페이지 위를 숫자 키패드로 덮는다. 6자리를 다 누르면 바로 서버에 물어보고,
// 맞으면 서버가 준 기기 토큰을 남기고 새로 고친다 — 페이지들이 처음부터 토큰으로 읽는다.
// 기기에 토큰을 못 남기는 경우만 새로 고치지 않고 "yuju:unlocked" 를 알린다 — 페이지들은 그걸 듣고 다시 읽는다.
const PIN_LENGTH = 6;
let gateEl = null;

function showGate(message) {
  if (gateEl) {
    if (message) gateEl.querySelector(".gate-msg").textContent = message;
    return;
  }
  // 입력칸에 포커스가 남아 있으면 iOS 키보드가 키패드를 가리고, 컴퓨터에서는 누른 숫자가 그 칸에도 써진다
  const focused = document.activeElement;
  if (focused && focused !== document.body && typeof focused.blur === "function") focused.blur();

  gateEl = document.createElement("div");
  const myGate = gateEl;
  gateEl.className = "gate";
  gateEl.setAttribute("role", "dialog");
  gateEl.setAttribute("aria-modal", "true");
  gateEl.setAttribute("aria-labelledby", "gateTitle");

  const card = document.createElement("div");
  card.className = "gate-card";

  const heart = document.createElement("p");
  heart.className = "gate-heart";
  heart.textContent = "❤";
  heart.setAttribute("aria-hidden", "true");

  const title = document.createElement("h2");
  title.id = "gateTitle";
  title.textContent = "비밀번호를 눌러주세요";

  const dots = document.createElement("div");
  dots.className = "gate-dots";
  dots.setAttribute("aria-hidden", "true");
  for (let i = 0; i < PIN_LENGTH; i++) dots.append(document.createElement("i"));

  const msg = document.createElement("p");
  msg.className = "gate-msg";
  msg.setAttribute("role", "status");
  msg.textContent = message || "이 기기에서 처음 열었어요. 한 번만 누르면 돼요.";

  const pad = document.createElement("div");
  pad.className = "gate-pad";
  for (const k of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"]) {
    const b = document.createElement("button");
    b.type = "button";
    if (!k) {
      b.disabled = true;
      b.className = "blank";
      b.setAttribute("aria-hidden", "true");
    } else {
      b.textContent = k;
      b.dataset.k = k;
      if (k === "⌫") b.setAttribute("aria-label", "지우기");
    }
    pad.append(b);
  }

  card.append(heart, title, dots, msg, pad);
  gateEl.append(card);
  document.body.append(gateEl);

  let pin = "";
  let busy = false;

  const paint = () => {
    [...dots.children].forEach((d, i) => d.classList.toggle("on", i < pin.length));
  };

  const shake = () => {
    dots.classList.remove("shake");
    void dots.offsetWidth; // 같은 애니메이션을 다시 걸려면 한 번 끊어야 한다
    dots.classList.add("shake");
  };

  async function submit() {
    busy = true;
    msg.textContent = "확인하는 중...";
    try {
      const res = await fetch(YUJU_API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "pair", pin }),
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.ok || !json.token) {
        msg.textContent = json.error === "locked"
          ? "너무 많이 틀렸어요. 한 시간 뒤에 다시 해 주세요."
          : json.error === "no-pin"
            ? "비밀번호가 아직 설정되지 않았어요 (스크립트 속성 YUJU_PIN, 숫자 6자리)"
            : "맞지 않아요. 다시 눌러주세요.";
        shake();
        return;
      }
      memoryKey = json.token;
      writeStore(KEY_STORE, json.token);
      if (readStore(KEY_STORE) === json.token) {
        location.reload();
        return;
      }
      // 기기에 못 남기는 브라우저(일부 프라이빗 모드)면 새로 고치는 순간 토큰을 잃는다.
      // 이 페이지에서만 쓰도록 잠금을 걷고, 페이지들이 다시 읽게 알린다
      document.removeEventListener("keydown", onKey);
      myGate.remove();
      if (gateEl === myGate) gateEl = null;
      window.dispatchEvent(new Event("yuju:unlocked"));
    } catch {
      msg.textContent = "연결이 안 돼요. 잠시 후 다시 해 주세요.";
    } finally {
      pin = "";
      busy = false;
      if (gateEl === myGate) paint();
    }
  }

  function press(k) {
    if (busy) return;
    if (k === "⌫") pin = pin.slice(0, -1);
    else if (pin.length < PIN_LENGTH) pin += k;
    paint();
    if (pin.length === PIN_LENGTH) submit();
  }

  pad.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-k]");
    if (b) press(b.dataset.k);
  });
  // 컴퓨터에서는 키보드 숫자도 받는다
  // 잠금이 걷히면 떼어낸다 — 남겨두면 다음 잠금 화면에서 한 번 누른 게 두 번 들어가 시도 횟수를 두 배로 쓴다
  // 숫자·지우기는 기본 동작을 막아 아래 페이지에 안 써지게 하고, ⌘/Ctrl/Alt 조합은 브라우저 단축키로 둔다
  const onKey = (e) => {
    if (gateEl !== myGate || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      press(e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      press("⌫");
    }
  };
  document.addEventListener("keydown", onKey);
}

// 등록 안 된 기기면 데이터도 없어야 한다. 남은 캐시를 지우고 잠금 화면부터 띄운다
if (!yujuKey()) {
  purgeTabs();
  showGate();
}
