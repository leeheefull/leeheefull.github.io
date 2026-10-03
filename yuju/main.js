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
// note 탭에서 가장 최근 글의 시각(created_at) 하나만 뽑아 마지막으로 본 값과 비교한다.
// 시각은 서버가 "yyyy-MM-dd HH:mm" 로 찍으므로 글자 순서가 곧 시간 순서다 — 최댓값이 최신 글이고,
// 예전에 저장해 둔 SEEN 값도 같은 형식이라 그대로 비교된다.
// 따로 묻지 않는다. 탭 내용은 store.js 가 받아올 때마다 "yuju:tab" 으로 알려주니 거기서 뽑는다.
// readStore/writeStore, cachedTab 은 store.js 것을 쓴다
const SEEN_KEY = "yuju:noteSeen";
const LATEST_KEY = "yuju:noteLatest";

const notesDot = document.getElementById("notesDot");
const onNotesPage = !!document.getElementById("noteList");

function paintDot() {
  if (!notesDot) return;
  const latest = readStore(LATEST_KEY);
  notesDot.hidden = !latest || latest === readStore(SEEN_KEY);
}

// 헤더(1행)와 빈 줄은 뺀다. 글이 하나도 없으면 ""
function latestNoteStamp(rows) {
  let latest = "";
  for (const r of rows) {
    if (!Array.isArray(r)) continue;
    const at = String(r[0] || "").trim();
    if (!at || at === "created_at") continue;
    if (at > latest) latest = at;
  }
  return latest;
}

function syncNoteDot(rows) {
  const stamp = latestNoteStamp(rows);
  if (!stamp) return; // 비었으면 지난 값을 그대로 둔다
  writeStore(LATEST_KEY, stamp);
  if (onNotesPage) writeStore(SEEN_KEY, stamp); // 글 화면에 들어왔으면 읽은 것으로 친다
  paintDot();
}

paintDot(); // 저장해 둔 값으로 먼저 그려서 점이 늦게 튀어나오지 않게 한다
// 글 화면은 캐시로도 바로 읽은 처리를 한다. 이미 더 새 걸 가졌으면 다시 받아도 알림이 안 오기 때문이다
if (onNotesPage) {
  const cachedNotes = cachedTab("note");
  if (cachedNotes) syncNoteDot(cachedNotes);
}

// ── 홈: 가장 가까운 기념일 칩 ──
// calendar 탭에서 kind 가 anniv 인 줄만 본다. 매년 반복이라 올해 날짜가 지났으면 내년으로 넘긴다.
// calendar 컬럼: 0 id | 1 date | 2 kind | 3 title ...
// 칩 문구를 따로 저장하지 않는다. 캐시된 탭에서 매번 계산해도 몇십 줄이라 바로 끝난다.
const annivChip = document.getElementById("annivChip");
const ANNIV_MAX_DAYS = 90; // 이보다 멀면 안 띄운다. 계속 떠 있으면 배경이 된다

// 날짜 칸이 날짜 셀로 바뀌어 다른 꼴로 올 때가 있어 두 형식을 모두 받는다
function annivMonthDay(raw) {
  const s = String(raw).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) m = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/.exec(s);
  return m ? [Number(m[2]), Number(m[3])] : null;
}

function paintChip(rows) {
  if (!annivChip) return;
  const [ty, tm, td] = kstFmt.format(new Date()).split("-").map(Number);
  const todayUTC = Date.UTC(ty, tm - 1, td);

  let best = null;
  for (const r of rows) {
    if (!Array.isArray(r) || String(r[2] || "").trim() !== "anniv") continue;
    const md = annivMonthDay(r[1] || "");
    const title = String(r[3] || "").trim();
    if (!md || !title) continue;

    // 올해 것이 지났으면 내년 같은 날이 다음 기념일이다
    let next = Date.UTC(ty, md[0] - 1, md[1]);
    if (next < todayUTC) next = Date.UTC(ty + 1, md[0] - 1, md[1]);
    const days = Math.round((next - todayUTC) / 86400000);
    if (days > ANNIV_MAX_DAYS) continue;
    if (!best || days < best.days) best = { days, title };
  }

  annivChip.hidden = !best;
  annivChip.textContent = best
    ? (best.days === 0 ? `오늘은 ${best.title} 🎉` : `${best.title} · ${best.days}일 남음`)
    : "";
}

if (annivChip) {
  const cachedCal = cachedTab("calendar");
  if (cachedCal) paintChip(cachedCal); // 캐시로 먼저 그려서 칩이 늦게 튀어나오지 않게 한다
}

// 새 탭 내용이 받아들여질 때마다(홈 미리 받기, 각 탭의 읽기·쓰기) 점과 칩을 다시 계산한다
window.addEventListener("yuju:tab", (e) => {
  const { name, rows } = (e && e.detail) || {};
  if (!Array.isArray(rows)) return;
  if (name === "note") syncNoteDot(rows);
  else if (name === "calendar") paintChip(rows);
});

// ── 홈: 네 탭을 미리 받아둔다 ──
// 앱스크립트는 한 번 부르는 데 1~2초가 고정으로 붙는다. 네 탭을 한 요청으로 묶어 받으면
// 그 비용을 한 번만 낸다. 받은 탭은 위의 "yuju:tab" 으로 점과 칩도 갱신한다.
// 홈에서만 한다 — 탭에서 탭으로 옮길 때까지 미리 받으면 데이터만 축낸다.
if (ddayEl) {
  prefetchTabs();
  // 키를 기기에 못 남겨 새로 고치지 않고 잠금만 걷힌 경우, 막혔던 미리 받기를 다시 한다
  window.addEventListener("yuju:unlocked", () => prefetchTabs());
}
