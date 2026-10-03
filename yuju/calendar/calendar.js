// calendar 탭 컬럼: 1 id | 2 date | 3 kind | 4 title | 5 who | 6 photo_id | 7 created_at | 8 gcal_id
// kind 가 event/anniv 이면 일정, photo 면 사진(하루 여러 장, 행마다 id 가 키).
// 일정과 사진을 한 탭에 두는 건 이 화면이 둘을 항상 같이 쓰기 때문이다.
// 앱은 시트를 직접 읽지 않는다. 읽기도 쓰기도 Apps Script 를 거치므로
// 시트 주소가 여기 없고, 시트를 비공개로 둘 수 있다.
// 배포 주소, 기기 토큰, 캐시는 store.js 가 갖고 있다.
const SHEET = "calendar";

// 드라이브는 크기를 지정한 썸네일을 그냥 내준다. 칸은 50px이라 w120이면 충분하고,
// 한 달에 31장을 부르므로 원본을 쓰면 데이터가 수십 배로 뛴다.
// id 는 시트에서 온 값이라 주소에 넣기 전에 한 번 감싼다
const thumbUrl = (id, w) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;

const WHOS = ["희찬", "유주", "우리"];
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

const calGrid = document.getElementById("calGrid");
const calMonth = document.getElementById("calMonth");
const calStatus = document.getElementById("calStatus");
const calFlash = document.getElementById("calFlash");
const todayBtn = document.getElementById("todayBtn");
const refreshBtn = document.getElementById("refreshBtn");
const whoBar = document.getElementById("whoBar");
const calSheet = document.getElementById("calSheet");
const calBackdrop = document.getElementById("calBackdrop");
const sheetTitle = document.getElementById("sheetTitle");
const sheetPhoto = document.getElementById("sheetPhoto");
const sheetEvents = document.getElementById("sheetEvents");
const sheetStatus = document.getElementById("sheetStatus");
const calForm = document.getElementById("calForm");
const calText = document.getElementById("calText");
const calAnniv = document.getElementById("calAnniv");
const photoInput = document.getElementById("photoInput");

let offset = 0;              // 0 = 이번 달
let selected = null;         // "2026-09-19"
const whoOn = new Set(WHOS);
// 시트에서 지금 몇 번째 장을 보고 있는지. "이 사진 빼기" 가 이걸 본다
let photoIndex = 0;

/* ── 화면에 보이는 것 = 서버 내용 + 아직 답을 못 받은 내 쓰기 ──
   서버가 준 줄(calServer)은 받을 때마다 통째로 갈아끼운다. 그 위에 아직 답이 안 온 쓰기
   (calPending)를 얹어서 그린다. 답이 오면 그 쓰기를 빼고 서버가 같이 준 탭으로 갈아끼우고,
   실패하면 빼기만 한다 — 그러면 화면이 저절로 쓰기 전으로 돌아간다.
   응답 순서가 엇갈려도 store.js 가 옛 탭을 버려주므로 여기서는 신경 쓸 게 없다. */
let calServer = [];
// id → { op: "add" | "photo" | "delete", item }
const calPending = new Map();
// 이 기기에서 올린 사진의 미리보기. id → blob:/data: 주소.
// 올라간 뒤에도 드라이브가 썸네일을 만들기까지 몇 초 걸려서, 그동안 빈 칸이 되지 않게 계속 쓴다
const calPreview = new Map();
// 날짜 → { events, photos }. 그릴 때마다 칸 42개가 전체 줄을 매번 훑지 않도록 데이터가 바뀔 때 한 번만 만든다
let calIndex = new Map();
const NO_DAY = Object.freeze({ events: [], photos: [] });

// 드라이브에는 원본을 그대로 둔다. 달력이 부르는 건 드라이브가 원본에서 만들어주는
// 썸네일이라, 원본을 보관해도 화면에서 쓰는 데이터는 늘지 않는다.
// 다만 너무 크면 전송도 Apps Script 도 버거우므로 이 선을 넘을 때만 줄인다.
// (서버는 9MB 넘는 건 받지 않는다)
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const FALLBACK_EDGE = 2400;
const JPEG_QUALITY = 0.9;

// 다른 화면에 있다 돌아왔을 때 이보다 오래됐으면 다시 받는다
const REFETCH_AFTER_MS = 60 * 1000;
let calLastFetch = 0;
let calLoading = null; // 진행 중인 읽기. 겹쳐 부르면 이걸 같이 기다린다

// main.js가 D-day용으로 kstFmt를 전역에 선언한다. 같은 이름을 쓰면 스크립트 전체가 죽는다.
const calKstFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
const todayKey = calKstFmt.format(new Date());

// 서식이 텍스트가 아니면 시트가 날짜 셀로 바꿔 "2026-09-03 00:00" 이나 "2026. 9. 3." 처럼 온다. 그것도 맞춰본다
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

// 서버가 준 행(1행 헤더 포함) → 항목
function parseRows(rows) {
  return rows
    .filter((r) => Array.isArray(r) && r[0] && r[0] !== "id")
    .map((r) => ({
      id: String(r[0]),
      date: dateKey(r[1] || ""),
      kind: String(r[2] || "").trim(),
      title: String(r[3] || ""),
      who: String(r[4] || "").trim(),
      photoId: String(r[5] || "").trim(),
    }));
}

function setServer(rows) {
  calServer = parseRows(rows);
  calLastFetch = Date.now();
}

// 서버 내용에 대기 중인 쓰기를 얹어 날짜별로 묶는다.
// 시트에 먼저 나오는 사진이 첫 장이고, 올리는 중인 사진은 아직 시트에 없으므로 뒤에 붙는다
function reindex() {
  const index = new Map();
  const put = (it, pending) => {
    let day = index.get(it.date);
    if (!day) {
      day = { events: [], photos: [] };
      index.set(it.date, day);
    }
    if (it.kind !== "photo") {
      day.events.push(pending ? { ...it, pending } : it);
      return;
    }
    const local = calPreview.get(it.id);
    if (!local && !it.photoId) return;
    const photoId = it.photoId;
    // 크기는 쓰는 쪽에서 정한다. 격자는 작게, 시트는 크게 부른다
    day.photos.push({ id: it.id, pending, src: local ? () => local : (w) => thumbUrl(photoId, w) });
  };

  const onServer = new Set();
  for (const it of calServer) {
    onServer.add(it.id);
    const p = calPending.get(it.id);
    if (p && p.op === "delete") continue;
    put(it, false);
  }
  // 답을 기다리는 사이 다시 읽은 내용에 이미 들어와 있으면 두 번 그리지 않는다
  for (const [id, p] of calPending) {
    if (p.op !== "delete" && !onServer.has(id)) put(p.item, true);
  }
  calIndex = index;
}

const dayOf = (key) => calIndex.get(key) || NO_DAY;

function monthDate() {
  const [y, m] = todayKey.split("-").map(Number);
  return new Date(y, m - 1 + offset, 1);
}

const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d, day) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(day)}`;
// "2026-09-19" 은 UTC 자정으로 읽힌다. 요일도 UTC 로 봐야 어느 시간대에서든 같은 날이다
const dowOf = (key) => new Date(key).getUTCDay();

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("이미지를 읽지 못했어요"));
    reader.readAsDataURL(file);
  });
}

// 상한을 넘는 사진만 캔버스로 줄인다.
// <img> 로 한 번 거치면 요즘 브라우저가 EXIF 회전을 알아서 반영해준다.
function shrinkToJpeg(file, edge) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, edge / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      // 투명 PNG를 JPEG로 바꾸면 검게 깔리므로 흰 바탕을 먼저 칠한다
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽지 못했어요")); };
    img.src = url;
  });
}

function dropPreview(id) {
  const src = calPreview.get(id);
  if (src && src.startsWith("blob:")) URL.revokeObjectURL(src);
  calPreview.delete(id);
}

function whoClass(who) {
  if (who === "희찬") return "me";
  if (who === "유주") return "you";
  return "us";
}

// 이름 버튼으로 걸러진 것만 칸에 보여준다. 시트가 아니라 보기 설정이다
const visible = (ev) => !ev.who || whoOn.has(ev.who);

function cell(day, key, dow, outside) {
  const li = document.createElement(outside ? "span" : "button");
  li.className = "cal-cell" + (outside ? " out" : "");
  if (!outside) {
    li.type = "button";
    li.dataset.key = key;
    if (dow === 0) li.classList.add("sun");
    if (dow === 6) li.classList.add("sat");
  }
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
    const { events, photos } = dayOf(key);
    let shown = 0;
    for (const ev of events) {
      if (!visible(ev)) continue;
      const tag = document.createElement("span");
      tag.className = `cal-tag ${ev.kind === "anniv" ? "anniv" : whoClass(ev.who)}`;
      tag.textContent = ev.title;
      li.append(tag);
      if (++shown === 2) break;
    }
    const first = photos[0];
    if (first) {
      const wrap = document.createElement("span");
      wrap.className = "cal-photo";
      const img = document.createElement("img");
      img.src = first.src(120);
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
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
  todayBtn.disabled = offset === 0;

  const first = d.getDay();
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const prevDays = new Date(d.getFullYear(), d.getMonth(), 0).getDate();

  const frag = document.createDocumentFragment();
  // 지난달·다음달 날짜를 회색으로 채워야 주가 끊겨 보이지 않는다
  for (let i = first - 1; i >= 0; i--) frag.append(cell(prevDays - i, "", 0, true));
  for (let day = 1; day <= days; day++) {
    frag.append(cell(day, keyOf(d, day), (first + day - 1) % 7, false));
  }
  const tail = (7 - ((first + days) % 7)) % 7;
  for (let i = 1; i <= tail; i++) frag.append(cell(i, "", 0, true));

  calGrid.replaceChildren(frag);
}

// 데이터가 바뀌었을 때. 묶음을 다시 만들고 격자와 열려 있는 시트를 같이 그린다
function update() {
  reindex();
  render();
  if (selected) renderSheet();
}

/* ── 그 날 시트 ── */
function prettyKey(key) {
  const [, m, dd] = key.split("-").map(Number);
  return `${m}월 ${dd}일 ${DOW[dowOf(key)]}요일`;
}

function renderPhotos() {
  const list = dayOf(selected).photos;
  sheetPhoto.replaceChildren();

  if (!list.length) {
    const empty = document.createElement("button");
    empty.type = "button";
    empty.className = "cal-sheet-photo empty";
    empty.textContent = "사진 넣기 +";
    empty.addEventListener("click", () => photoInput.click());
    sheetPhoto.append(empty);
    return;
  }

  if (photoIndex >= list.length) photoIndex = list.length - 1;

  // 가로 스크롤에 스냅을 걸어 캐러셀로 쓴다. 직접 드래그를 구현하는 것보다
  // 관성과 터치 처리가 브라우저 몫이라 훨씬 안정적이다.
  const track = document.createElement("div");
  track.className = "cal-carousel";
  for (const p of list) {
    const slide = document.createElement("div");
    slide.className = "cal-slide";
    const img = document.createElement("img");
    img.src = p.src(1000);
    img.alt = "";
    img.decoding = "async";
    slide.append(img);
    track.append(slide);
  }
  sheetPhoto.append(track);

  if (list.length > 1) {
    const dots = document.createElement("div");
    dots.className = "cal-dots";
    list.forEach((_, i) => {
      const d = document.createElement("i");
      if (i === photoIndex) d.classList.add("on");
      dots.append(d);
    });
    sheetPhoto.append(dots);

    track.addEventListener("scroll", () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      if (i === photoIndex) return;
      photoIndex = i;
      [...dots.children].forEach((d, k) => d.classList.toggle("on", k === i));
    }, { passive: true });
  }

  const bar = document.createElement("div");
  bar.className = "cal-photo-bar";
  const more = document.createElement("button");
  more.type = "button";
  more.textContent = "사진 더 넣기";
  more.addEventListener("click", () => photoInput.click());
  const drop = document.createElement("button");
  drop.type = "button";
  drop.className = "danger";
  drop.textContent = list.length > 1 ? "이 사진 빼기" : "사진 빼기";
  drop.addEventListener("click", () => removePhotoAt(photoIndex));
  bar.append(more, drop);
  sheetPhoto.append(bar);

  // 다시 그린 뒤에도 보던 장을 유지한다
  if (photoIndex > 0) {
    requestAnimationFrame(() => { track.scrollLeft = photoIndex * track.clientWidth; });
  }
}

function renderSheet() {
  if (!selected) return;
  sheetTitle.textContent = prettyKey(selected) + (selected === todayKey ? " · 오늘" : "");

  renderPhotos();

  const evs = dayOf(selected).events;
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
      const del = document.createElement("button");
      del.type = "button";
      del.className = "cal-ev-del";
      del.setAttribute("aria-label", `${ev.title} 삭제`);
      del.textContent = "✕";
      // 아직 서버에 없는 줄은 지울 수도 없다. 답이 오면 다시 그려지며 풀린다
      del.disabled = Boolean(ev.pending);
      del.addEventListener("click", () => removeEvent(ev));
      li.append(t, w, del);
      if (ev.pending) li.classList.add("pending");
      sheetEvents.append(li);
    }
  }
}

/* iOS 사파리는 하단 도구막대가, 입력할 때는 키보드가 fixed 요소를 덮는다.
   bottom:0 은 레이아웃 뷰포트 기준이라 시트 아래쪽(입력칸과 + 버튼)이 그 뒤로 들어간다.
   visualViewport 로 실제 보이는 영역을 재서 그 안에 맞춘다. */
function fitSheetToViewport() {
  const vv = window.visualViewport;
  if (!vv || calSheet.hidden) return;
  const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  calSheet.style.bottom = covered + "px";
  calSheet.style.maxHeight = Math.round(vv.height * 0.88) + "px";
}

function clearSheetFit() {
  calSheet.style.bottom = "";
  calSheet.style.maxHeight = "";
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", fitSheetToViewport);
  window.visualViewport.addEventListener("scroll", fitSheetToViewport);
}

function openSheet(key) {
  selected = key;
  photoIndex = 0;
  sheetStatus.textContent = "";
  calText.value = "";
  calAnniv.checked = false;
  renderSheet();
  calSheet.hidden = false;
  calBackdrop.hidden = false;
  fitSheetToViewport();
  requestAnimationFrame(() => calSheet.classList.add("open"));
}

function closeSheet() {
  calSheet.classList.remove("open");
  calBackdrop.hidden = true;
  selected = null;
  setTimeout(() => {
    if (selected) return;
    calSheet.hidden = true;
    clearSheetFit();
  }, 280);
}

/* ── 잠깐 떴다 사라지는 알림 ── */
let flashTimer = 0;
function flash(text) {
  calFlash.textContent = text;
  calFlash.classList.add("show");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => calFlash.classList.remove("show"), 2200);
}

// 쓰기 결과는 그 날 시트가 열려 있으면 시트에, 닫혔거나 다른 날을 보고 있으면 달력 위에 띄운다
function tell(date, text) {
  if (selected === date) sheetStatus.textContent = text;
  else flash(text);
}

/* ── 읽기 ── */
function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// 새로고침 버튼은 읽는 동안 돌고 막힌다. 첫 진입·복귀 때의 조용한 읽기도 같이 보여준다 —
// 캐시로 먼저 그린 화면이 지금 새 걸 받는 중인지 눈으로 알 수 있다
function setBusy(busy) {
  refreshBtn.disabled = busy;
  refreshBtn.setAttribute("aria-busy", String(busy));
}

// "ok" | "auth" | "fail". 이미 읽는 중이면 그 읽기를 같이 기다린다
function load(quiet) {
  if (calLoading) return calLoading;
  setBusy(true);
  calLoading = (async () => {
    try {
      const rows = await fetchTab(SHEET);
      calLastFetch = Date.now();
      // null 이면 이 페이지가 이미 더 새 걸 갖고 있다 — 지금 화면 그대로 둔다
      if (rows) {
        setServer(rows);
        update();
      }
      calStatus.hidden = true;
      return "ok";
    } catch (err) {
      if (err instanceof YujuAuthError) return "auth"; // 잠금 화면이 떴다. 여기서는 말하지 않는다
      if (!quiet) {
        calStatus.hidden = false;
        calStatus.textContent = "달력을 불러오지 못했어요. 잠시 후 다시 열어주세요.";
      }
      return "fail";
    } finally {
      calLoading = null;
      setBusy(false);
    }
  })();
  return calLoading;
}

/* ── 쓰기 ── */
// 화면에 먼저 얹고 보낸다. 서버는 쓰고 난 탭을 같이 돌려주므로 다시 읽으러 가지 않는다.
// 성공이든 실패든 대기 목록에서 빼고 다시 그린다 — 실패면 그것만으로 쓰기 전 화면이 된다.
// failText 는 오류 문구를 받아 알림 문구를 돌려주는 함수여도 된다
async function commit(id, payload, date, okText, failText) {
  try {
    const { rows } = await sendAction(payload, SHEET);
    calPending.delete(id);
    if (rows) setServer(rows);
    update();
    if (okText) tell(date, okText);
    return true;
  } catch (err) {
    calPending.delete(id);
    update();
    if (!(err instanceof YujuAuthError)) {
      tell(date, typeof failText === "function" ? failText(err.message) : failText);
    }
    return false;
  }
}

/* ── 사진 ── */
photoInput.addEventListener("change", async () => {
  const file = photoInput.files && photoInput.files[0];
  photoInput.value = ""; // 같은 사진을 다시 고를 수 있게 비운다
  if (!file || !selected) return;

  const date = selected;
  const who = calForm.elements.who.value;
  sheetStatus.textContent = "사진 읽는 중...";
  let dataUrl;
  let shrunk = false;
  try {
    if (file.size <= MAX_UPLOAD_BYTES) {
      dataUrl = await fileToDataUrl(file); // 원본 그대로
    } else {
      sheetStatus.textContent = "사진이 커서 조금 줄이는 중...";
      dataUrl = await shrinkToJpeg(file, FALLBACK_EDGE);
      shrunk = true;
    }
  } catch {
    if (selected === date) sheetStatus.textContent = "이 사진은 읽지 못했어요. 다른 걸로 해볼까요?";
    return;
  }

  // 여러 장이 쌓이므로 줄마다 고유 id 를 붙인다. 뺄 때도 이 id 를 쓴다
  const id = newId();
  // 미리보기는 파일을 가리키는 blob 주소로 둔다. 수 MB 짜리 base64 문자열을 붙들고 있지 않아도 된다.
  // 줄인 사진은 원본보다 가벼우니 줄인 걸 그대로 보여준다
  calPreview.set(id, shrunk ? dataUrl : URL.createObjectURL(file));
  calPending.set(id, { op: "photo", item: { id, date, kind: "photo", title: "", who, photoId: "" } });
  reindex();
  if (selected === date) photoIndex = dayOf(date).photos.length - 1; // 방금 넣은 장을 보여준다
  render();
  if (selected) renderSheet();
  if (selected === date) sheetStatus.textContent = "올리는 중...";

  // 서버는 mime 을 믿지 않고 내용을 직접 본다. 보내는 건 id·날짜·사람·바이트뿐이다
  const ok = await commit(
    id,
    { action: "cal-photo", id, date, who, image: dataUrl.slice(dataUrl.indexOf(",") + 1) },
    date,
    "사진 올렸어요!",
    (msg) => msg === "bad image"
      ? "이 사진은 올릴 수 없어요. 다른 걸로 해볼까요?"
      : "사진을 올리지 못했어요. 잠시 후 다시 해 주세요.",
  );
  if (!ok) {
    dropPreview(id);
    update();
  }
});

// 사진 줄도 id 로 찾으므로 일정과 같은 액션으로 지운다. 드라이브 파일도 서버가 같이 정리한다
function removePhotoAt(i) {
  if (!selected) return;
  const date = selected;
  const target = dayOf(date).photos[i];
  if (!target) return;
  if (target.pending) {
    sheetStatus.textContent = "아직 올리는 중이에요. 다 올라가면 뺄 수 있어요.";
    return;
  }
  if (calPending.has(target.id)) return; // 이미 빼는 중

  calPending.set(target.id, { op: "delete" });
  photoIndex = Math.max(0, i - 1);
  update();
  sheetStatus.textContent = "사진을 뺐어요.";
  commit(target.id, { action: "cal-delete", id: target.id }, date, null,
    "사진을 빼지 못했어요. 잠시 후 다시 해 주세요.")
    .then((ok) => { if (ok) dropPreview(target.id); });
}

function removeEvent(ev) {
  if (ev.pending || calPending.has(ev.id)) return;
  const date = ev.date;
  calPending.set(ev.id, { op: "delete" });
  update();
  sheetStatus.textContent = "일정을 지웠어요.";
  commit(ev.id, { action: "cal-delete", id: ev.id }, date, null,
    "지우지 못했어요. 잠시 후 다시 해 주세요.");
}

/* ── 이벤트 ── */
// offset 은 이번 달에서 몇 달 떨어졌는지다. 1년은 12달이라 겹화살표는 12씩 움직인다
function go(by) {
  offset += by;
  render();
}
document.getElementById("prevYearBtn").addEventListener("click", () => go(-12));
document.getElementById("prevBtn").addEventListener("click", () => go(-1));
document.getElementById("nextBtn").addEventListener("click", () => go(1));
document.getElementById("nextYearBtn").addEventListener("click", () => go(12));
todayBtn.addEventListener("click", () => { offset = 0; render(); });

// 캐시로 먼저 그리는 탓에 방금 다른 기기에서 넣은 게 바로 안 보일 수 있다. 눌러서 지금 것을 받는다
refreshBtn.addEventListener("click", async () => {
  if (calLoading) return;
  const result = await load(true);
  if (result === "ok") {
    // 받은 게 같아도 다시 그린다 — 드라이브가 늦게 만든 썸네일도 이때 다시 불러온다
    update();
    flash("방금 새로 받았어요");
  } else if (result === "fail") {
    flash("새로 받지 못했어요. 잠시 후 다시 해 주세요.");
    // 아직 한 번도 못 그렸으면 "불러오는 중..." 이 그대로 남아 있다. 거짓말이 되지 않게 바꾼다
    if (!calStatus.hidden) calStatus.textContent = "달력을 불러오지 못했어요. 잠시 후 다시 열어주세요.";
  }
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

calForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = calText.value.trim();
  if (!title || !selected) return;

  const id = newId();
  const item = {
    id,
    date: selected,
    kind: calAnniv.checked ? "anniv" : "event",
    title,
    who: calForm.elements.who.value,
    photoId: "",
  };

  // 화면에는 먼저 얹는다. 구글 캘린더까지 만드느라 답이 몇 초 걸린다
  calPending.set(id, { op: "add", item });
  calText.value = "";
  calAnniv.checked = false;
  update();
  sheetStatus.textContent = "추가했어요!";

  const ok = await commit(
    id,
    { action: "cal-add", id, date: item.date, kind: item.kind, title: item.title, who: item.who },
    item.date,
    null,
    "저장하지 못했어요. 잠시 후 다시 해 주세요.",
  );
  // 못 넣었으면 쓴 글을 돌려준다. 그 사이 다른 걸 적고 있었으면 덮지 않는다
  if (!ok && selected === item.date && !calText.value) {
    calText.value = item.title;
    calAnniv.checked = item.kind === "anniv";
  }
});

// 다른 앱에 갔다 돌아오면 그 사이 상대가 넣은 게 있을 수 있다
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - calLastFetch >= REFETCH_AFTER_MS) {
    load(true);
  }
});

// 키를 기기에 못 남겨 새로 고치지 않고 잠금만 걷힌 경우. 여기서 다시 읽는다
window.addEventListener("yuju:unlocked", () => load());

// 홈에서 미리 받아뒀거나 지난번에 읽어둔 게 있으면 기다리지 않고 바로 그린다.
// 이어지는 load 가 서버 내용으로 덮는다. 캐시가 없어도 격자는 먼저 그려둔다 —
// 빈 카드보다 날짜라도 보이는 게 낫다.
const cached = cachedTab(SHEET);
if (cached) {
  calServer = parseRows(cached);
  calStatus.hidden = true;
}
update();
load(Boolean(cached));
