// ── 하트 캔버스 ──
// 캔버스는 홈에만 둔다. 다른 화면에서는 글을 읽어야 하므로 배경 그라디언트만 남긴다.
const heartsCanvas = document.getElementById("hearts");
if (heartsCanvas) initHearts(heartsCanvas);

function initHearts(canvas) {
  const ctx = canvas.getContext("2d");

  const MAX_PARTICLES = 300;
  const AMBIENT_INTERVAL = 420; // ms
  const BURST_COUNT = 18;
  const COLORS = ["#ff5a86", "#ff85a8", "#ff9ec1", "#f7628f", "#ffc0d4", "#e94f7c"];

  const particles = [];
  let width = 0;
  let height = 0;
  let lastAmbient = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function spawn(p) {
    if (particles.length >= MAX_PARTICLES) return;
    particles.push(p);
  }

  function spawnAmbient() {
    spawn({
      x: Math.random() * width,
      y: height + 30,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -(0.5 + Math.random() * 0.9),
      gravity: 0,
      size: 12 + Math.random() * 20,
      color: pick(COLORS),
      rotation: (Math.random() - 0.5) * 0.6,
      spin: (Math.random() - 0.5) * 0.02,
      life: 1,
      decay: 0.003 + Math.random() * 0.003,
      // 좌우로 흔들리며 떠오르게 하는 위상값
      swayPhase: Math.random() * Math.PI * 2,
      swayAmount: 0.3 + Math.random() * 0.5,
    });
  }

  function spawnBurst(x, y) {
    for (let i = 0; i < BURST_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / BURST_COUNT + Math.random() * 0.3;
      const speed = 2 + Math.random() * 4;
      spawn({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0.06,
        size: 10 + Math.random() * 18,
        color: pick(COLORS),
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.15,
        life: 1,
        decay: 0.012 + Math.random() * 0.01,
        swayPhase: 0,
        swayAmount: 0,
      });
    }
  }

  function drawHeart(p) {
    const s = p.size;
    const top = s * 0.3;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.translate(0, -s * 0.5);
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillStyle = p.color;

    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.bezierCurveTo(0, 0, -s / 2, 0, -s / 2, top);
    ctx.bezierCurveTo(-s / 2, (s + top) / 2, 0, (s + top) / 2, 0, s);
    ctx.bezierCurveTo(0, (s + top) / 2, s / 2, (s + top) / 2, s / 2, top);
    ctx.bezierCurveTo(s / 2, 0, 0, 0, 0, top);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function tick(now) {
    ctx.clearRect(0, 0, width, height);

    if (now - lastAmbient > AMBIENT_INTERVAL) {
      spawnAmbient();
      lastAmbient = now;
    }

    // 뒤에서부터 지워야 인덱스가 밀리지 않는다
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      p.swayPhase += 0.03;
      p.x += p.vx + Math.sin(p.swayPhase) * p.swayAmount;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.spin;
      p.life -= p.decay;

      if (p.life <= 0 || p.y < -60 || p.y > height + 60) {
        particles.splice(i, 1);
        continue;
      }

      drawHeart(p);
    }

    requestAnimationFrame(tick);
  }

  window.addEventListener("resize", resize);
  // 탭바를 누를 때까지 하트가 터지면 이동이 방해된다
  window.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".tabbar")) return;
    spawnBurst(e.clientX, e.clientY);
  });

  resize();
  requestAnimationFrame(tick);
}

// ── D-day: 만난 날(2025-11-22)을 1일째로 센다 ──
const DDAY_START = { y: 2025, m: 11, d: 22 };
const ddayEl = document.getElementById("dday");
// en-CA 로케일은 YYYY-MM-DD 형식을 보장한다
const kstFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

function updateDday() {
  const [y, m, d] = kstFmt.format(new Date()).split("-").map(Number);
  const days =
    (Date.UTC(y, m - 1, d) - Date.UTC(DDAY_START.y, DDAY_START.m - 1, DDAY_START.d)) / 86400000 + 1;
  const anniversary = m === DDAY_START.m && d === DDAY_START.d && days > 1;
  const special = days % 100 === 0 || anniversary;
  ddayEl.textContent = `함께한 지 ${days}일째${special ? " 🎉" : ""}`;
}

// 홈이 아닌 페이지에는 D-day 요소가 없다
if (ddayEl) {
  updateDday();
  setInterval(updateDday, 60 * 1000); // 자정 넘어가면 1분 안에 갱신
}

// ── 글 탭의 안 읽음 점 ──
// note 시트에서 가장 최근 글의 시각 하나만 받아 마지막으로 본 값과 비교한다.
// 값의 형식은 신경쓰지 않는다. 같은 쿼리의 결과끼리만 비교하므로 달라지기만 하면 새 글이다.
// 전체 CSV를 받아 파싱하지 않는 덕에 글 안의 줄바꿈도 문제가 되지 않는다.
// 페이지 스크립트들이 API_URL 을 쓰므로 여기서는 다른 이름을 쓴다. 전역이 하나라 겹치면 둘 다 죽는다
const YUJU_API =
  "https://script.google.com/macros/s/AKfycbz1wxRhqnlcgD6wFhNTZX82AQFo_OxNx-lSQmczyBEzdhe-WOrDoNoHibpjCk05m6I/exec";
const NOTE_STAMP_URL = `${YUJU_API}?mode=note-stamp`;

const SEEN_KEY = "yuju:noteSeen";
const LATEST_KEY = "yuju:noteLatest";

const notesDot = document.getElementById("notesDot");
const onNotesPage = !!document.getElementById("noteList");

// 사파리 프라이빗 모드에서는 localStorage 쓰기가 예외를 던진다
function readStore(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 저장 못 해도 동작은 한다 */ }
}

function paintDot() {
  if (!notesDot) return;
  const latest = readStore(LATEST_KEY);
  notesDot.hidden = !latest || latest === readStore(SEEN_KEY);
}

async function syncNoteDot() {
  let stamp;
  try {
    const res = await fetch(NOTE_STAMP_URL, { cache: "no-store" });
    // 헤더 한 줄 + 값 한 줄짜리 CSV
    const line = (await res.text()).trim().split(/\r?\n/).pop() || "";
    stamp = line.replace(/^"|"$/g, "").trim();
  } catch {
    return; // 못 받으면 캐시로 그린 상태를 그대로 둔다
  }
  if (!stamp) return;

  writeStore(LATEST_KEY, stamp);
  if (onNotesPage) writeStore(SEEN_KEY, stamp); // 글 화면에 들어왔으면 읽은 것으로 친다
  paintDot();
}

paintDot(); // 캐시로 먼저 그려서 점이 늦게 튀어나오지 않게 한다
// 홈과 글 화면에서만 갱신한다. 위시·단어장까지 매번 요청할 이유가 없다.
if (ddayEl || onNotesPage) syncNoteDot();

// ── 홈: 가장 가까운 기념일 칩 ──
// calendar 탭에서 kind 가 anniv 인 줄만 본다. 매년 반복이라 올해 날짜가 지났으면 내년으로 넘긴다.
const annivChip = document.getElementById("annivChip");
const ANNIV_KEY = "yuju:annivChip";
const ANNIV_MAX_DAYS = 90; // 이보다 멀면 안 띄운다. 계속 떠 있으면 배경이 된다

const ANNIV_URL = `${YUJU_API}?mode=anniv`;

function paintChip() {
  if (!annivChip) return;
  const cached = readStore(ANNIV_KEY);
  annivChip.hidden = !cached;
  if (cached) annivChip.textContent = cached;
}

// gviz 가 텍스트 열을 날짜 셀로 바꿔 보낼 때가 있어 두 형식을 모두 받는다
function annivMonthDay(raw) {
  const s = String(raw).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) m = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/.exec(s);
  return m ? [Number(m[2]), Number(m[3])] : null;
}

async function syncAnnivChip() {
  let text;
  try {
    const res = await fetch(ANNIV_URL, { cache: "no-store" });
    text = await res.text();
  } catch {
    return; // 못 받으면 캐시로 그린 상태를 그대로 둔다
  }

  const [ty, tm, td] = kstFmt.format(new Date()).split("-").map(Number);
  const todayUTC = Date.UTC(ty, tm - 1, td);

  let best = null;
  for (const line of text.trim().split(/\r?\n/)) {
    const cells = line.split('","').map((c) => c.replace(/^"|"$/g, ""));
    if (cells.length < 2) continue;
    const md = annivMonthDay(cells[0]);
    const title = (cells[1] || "").trim();
    if (!md || !title) continue;

    // 올해 것이 지났으면 내년 같은 날이 다음 기념일이다
    let next = Date.UTC(ty, md[0] - 1, md[1]);
    if (next < todayUTC) next = Date.UTC(ty + 1, md[0] - 1, md[1]);
    const days = Math.round((next - todayUTC) / 86400000);
    if (days > ANNIV_MAX_DAYS) continue;
    if (!best || days < best.days) best = { days, title };
  }

  const label = best
    ? (best.days === 0 ? `오늘은 ${best.title} 🎉` : `${best.title} · ${best.days}일 남음`)
    : "";
  writeStore(ANNIV_KEY, label);
  paintChip();
}

if (annivChip) {
  paintChip();     // 캐시로 먼저 그려서 칩이 늦게 튀어나오지 않게 한다
  syncAnnivChip(); // 그다음 네트워크로 갱신
}
