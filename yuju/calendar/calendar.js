// calendar 탭 컬럼: 1 id | 2 date | 3 kind | 4 title | 5 who | 6 photo_id | 7 created_at
// kind 가 event/anniv 이면 일정, photo 면 사진(하루 여러 장, 행마다 id 가 키).
// 일정과 사진을 한 탭에 두는 건 이 화면이 둘을 항상 같이 쓰기 때문이다.
// 앱은 시트를 직접 읽지 않는다. 읽기도 쓰기도 Apps Script 를 거치므로
// 시트 주소가 여기 없고, 시트를 비공개로 둘 수 있다. 새 배포를 올리면 이 주소만 갈면 된다.
const API_URL =
  "https://script.google.com/macros/s/AKfycbz1wxRhqnlcgD6wFhNTZX82AQFo_OxNx-lSQmczyBEzdhe-WOrDoNoHibpjCk05m6I/exec";
const READ_URL = `${API_URL}?mode=tab&sheet=calendar`;

// 드라이브는 크기를 지정한 썸네일을 그냥 내준다. 칸은 50px이라 w120이면 충분하고,
// 한 달에 31장을 부르므로 원본을 쓰면 데이터가 수십 배로 뛴다.
const thumbUrl = (id, w) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;

const WHOS = ["희찬", "유주", "우리"];
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

const calGrid = document.getElementById("calGrid");
const calMonth = document.getElementById("calMonth");
const calStatus = document.getElementById("calStatus");
const todayBtn = document.getElementById("todayBtn");
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
const photoInput = document.getElementById("photoInput");

let rows = [];               // 시트에서 읽은 전체
let offset = 0;              // 0 = 이번 달
let selected = null;         // "2026-09-19"
const whoOn = new Set(WHOS);
// 시트에 아직 반영 안 된 내 추가. 시트 반영이 몇 초 걸려서 바로 다시 읽으면 없는 것처럼 보인다.
const pendingAdds = new Map();
// 올렸지만 아직 시트에 안 보이는 사진. id -> { date, dataUrl, tries }.
// 드라이브 저장과 시트 반영에 몇 초 걸려서, 그 사이엔 방금 고른 사진을 대신 보여준다.
const pendingPhotos = new Map();
// 시트에서 지금 몇 번째 장을 보고 있는지. "이 사진 빼기" 가 이걸 본다
let photoIndex = 0;
const GIVE_UP_AFTER = 4;

// 드라이브에는 원본을 그대로 둔다. 달력이 부르는 건 드라이브가 원본에서 만들어주는
// 썸네일이라, 원본을 보관해도 화면에서 쓰는 데이터는 늘지 않는다.
// 다만 너무 크면 전송도 Apps Script 도 버거우므로 이 선을 넘을 때만 줄인다.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const FALLBACK_EDGE = 2400;
const JPEG_QUALITY = 0.9;

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

// 한 날짜에 여러 장이 쌓인다. 시트에 먼저 나오는 줄이 첫 장이고, 달력 격자에는 그것만 보인다.
// 올리는 중인 사진은 아직 시트에 없으므로 뒤에 붙여서 같이 보여준다.
function photosOn(key) {
  const saved = rows
    .filter((r) => r.date === key && r.kind === "photo" && r.photoId)
    .map((r) => ({ id: r.id, src: thumbSrc(r.photoId) }));
  const uploading = [];
  for (const [id, p] of pendingPhotos) {
    if (p.date === key) uploading.push({ id, src: () => p.dataUrl });
  }
  return saved.concat(uploading);
}

// 크기는 쓰는 쪽에서 정한다. 격자는 작게, 시트는 크게 부른다
function thumbSrc(photoId) {
  return (w) => thumbUrl(photoId, w);
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
    const first = photosOn(key)[0];
    if (first) {
      const wrap = document.createElement("span");
      wrap.className = "cal-photo";
      const img = document.createElement("img");
      img.src = first.src(120);
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
  todayBtn.disabled = offset === 0;

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

function renderPhotos() {
  const list = photosOn(selected);
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
    });
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
      const del = document.createElement("button");
      del.type = "button";
      del.className = "cal-ev-del";
      del.setAttribute("aria-label", `${ev.title} 삭제`);
      del.textContent = "✕";
      del.addEventListener("click", () => removeEvent(ev));
      li.append(t, w, del);
      if (pendingAdds.has(ev.id)) li.classList.add("pending");
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

/* ── 읽기 ── */
// Apps Script 는 잠들었다 깨느라 3초 남짓 걸린다. 그 사이 빈 달력만 보는 게 제일 답답해서
// 마지막으로 읽은 걸 기기에 두고, 열면 그걸 먼저 그린 뒤 뒤에서 조용히 갱신한다.
// 시트가 진실이고 이건 어디까지나 먼저 보여주는 그림이다.
const CACHE_KEY = "yuju-cal-rows";

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

function writeCache(list) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    // 저장 공간이 없거나 사파리 비공개 모드면 그냥 캐시 없이 산다
  }
}

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
  for (const [id, item] of pendingPhotos) {
    // 시트에 그 id 가 보이면 올라간 것이다
    if (ids.has(id)) { pendingPhotos.delete(id); continue; }
    item.tries++;
    if (item.tries > GIVE_UP_AFTER) pendingPhotos.delete(id);
  }
  rows = fromSheet.concat(extra);
}

async function load(quiet) {
  try {
    const res = await fetch(READ_URL, { cache: "no-store" });
    const fromSheet = parseSheet(await res.text());
    writeCache(fromSheet);
    merge(fromSheet);
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
  fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

/* ── 사진 ── */
photoInput.addEventListener("change", async () => {
  const file = photoInput.files && photoInput.files[0];
  photoInput.value = ""; // 같은 사진을 다시 고를 수 있게 비운다
  if (!file || !selected) return;

  const date = selected;
  sheetStatus.textContent = "사진 읽는 중...";
  let dataUrl;
  let mime = file.type || "image/jpeg";
  try {
    if (file.size <= MAX_UPLOAD_BYTES) {
      dataUrl = await fileToDataUrl(file); // 원본 그대로
    } else {
      sheetStatus.textContent = "사진이 커서 조금 줄이는 중...";
      dataUrl = await shrinkToJpeg(file, FALLBACK_EDGE);
      mime = "image/jpeg";
    }
  } catch {
    sheetStatus.textContent = "이 사진은 읽지 못했어요. 다른 걸로 해볼까요?";
    return;
  }

  // 여러 장이 쌓이므로 줄마다 고유 id 를 붙인다. 이 id 로 올라갔는지 확인하고, 뺄 때도 쓴다
  const id = newId();
  // 화면에는 먼저 얹는다. 드라이브 저장과 시트 반영까지 몇 초 걸린다
  pendingPhotos.set(id, { date, dataUrl, tries: 0 });
  if (selected === date) photoIndex = photosOn(date).length - 1; // 방금 넣은 장을 보여준다
  renderSheet();
  render();
  sheetStatus.textContent = "올리는 중...";

  post({
    action: "cal-photo",
    id,
    date,
    who: calForm.elements.who.value,
    mime,
    image: dataUrl.slice(dataUrl.indexOf(",") + 1),
  });

  // 드라이브에 저장되고 시트에 적히기까지 시간이 걸려 몇 번 나눠 확인한다
  for (const wait of [3000, 6000, 10000]) {
    setTimeout(async () => {
      if (!pendingPhotos.has(id)) return;
      await load(true);
      if (!pendingPhotos.has(id)) {
        if (selected === date) sheetStatus.textContent = "사진 올렸어요!";
        renderSheet();
        render();
      }
    }, wait);
  }
  setTimeout(() => {
    if (!pendingPhotos.has(id)) return;
    pendingPhotos.delete(id);
    if (selected === date) sheetStatus.textContent = "아직 반영이 안 됐어요. 잠시 뒤 다시 열어보세요.";
    renderSheet();
    render();
  }, 14000);
});

// 사진 줄도 id 로 찾으므로 일정과 같은 액션으로 지운다. 드라이브 파일도 같이 정리된다
function removePhotoAt(i) {
  if (!selected) return;
  const target = photosOn(selected)[i];
  if (!target) return;

  post({ action: "cal-delete", id: target.id });
  pendingPhotos.delete(target.id);
  // 시트가 진실이지만 반영 전까지는 화면에서 먼저 치운다
  rows = rows.filter((r) => r.id !== target.id);
  photoIndex = Math.max(0, i - 1);
  sheetStatus.textContent = "사진을 뺐어요.";
  renderSheet();
  render();
  setTimeout(() => load(true), 2500);
}

function removeEvent(ev) {
  post({ action: "cal-delete", id: ev.id });
  pendingAdds.delete(ev.id);
  rows = rows.filter((r) => r.id !== ev.id);
  sheetStatus.textContent = "일정을 지웠어요.";
  renderSheet();
  render();
  setTimeout(() => load(true), 2500);
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

// 캐시가 있으면 기다리지 않고 바로 그린다. 이어지는 load 가 시트 내용으로 덮는다.
// 캐시가 없어도 격자는 먼저 그려둔다 — 빈 카드보다 날짜라도 보이는 게 낫다
const cached = readCache();
if (cached) {
  rows = cached;
  calStatus.hidden = true;
}
render();
load(Boolean(cached));
