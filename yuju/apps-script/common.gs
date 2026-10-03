// 파일은 나뉘어 있어도 Apps Script 에서는 전역이 하나다.
// import 같은 건 없고, 여기 상수와 함수를 다른 파일에서 그대로 쓴다.

// 시트 탭 이름
const NOTE_SHEET = "note";
const VOCA_SHEET = "spain-voca";
const TODO_SHEET = "to-do-list";
const CAL_SHEET = "calendar";

// 앱이 읽을 수 있는 탭. 아무 탭이나 내주면 시트를 비공개로 둔 의미가 없다
const READABLE_SHEETS = [CAL_SHEET, NOTE_SHEET, TODO_SHEET, VOCA_SHEET];

// 글쓴이로 받을 수 있는 이름. 화면에 없는 이름이 오면 위조된 요청이다
const WHOS = ["희찬", "유주", "우리"];

function sheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ok_(extra) {
  return json_(Object.assign({ ok: true }, extra || {}));
}

function fail_(error) {
  return json_({ ok: false, error: error });
}

function stamp_() {
  return Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm");
}

// ── 기기 인증 ──
// 숫자 비밀번호(스크립트 속성 YUJU_PIN)는 기기를 처음 등록할 때만 쓴다. 맞으면 그 기기에
// 추측할 수 없는 토큰을 내주고, 이후 모든 요청은 그 토큰으로 들어온다.
// 6자리 숫자는 경우의 수가 백만 개뿐이라 요청마다 비밀번호를 받으면 하나씩 대입해 뚫을 수 있다.
// 토큰은 대입이 불가능하고, 비밀번호 대입은 pair_ 의 실패 제한이 막는다.
// 토큰 목록은 스크립트 속성 YUJU_TOKENS 에 둔다. 지우면 모든 기기가 다시 비밀번호를 누른다.
const TOKEN_PROP = "YUJU_TOKENS";
const MAX_TOKENS = 20;        // 기기를 바꿀 때마다 쌓이므로 오래된 것부터 밀어낸다
const PIN_FAIL_LIMIT = 10;    // 이만큼 틀리면
const PIN_LOCK_SECONDS = 3600; // 이 시간 동안 새 기기 등록을 막는다. 등록된 기기는 계속 쓴다

function tokens_() {
  try {
    const list = JSON.parse(PropertiesService.getScriptProperties().getProperty(TOKEN_PROP) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function authorized_(token) {
  return typeof token === "string" && token.length >= 32 && tokens_().indexOf(token) >= 0;
}

// {action:"pair", pin:"123456"} → {ok, token} | {ok:false, error:"wrong"|"locked"|"no-pin"}
// 속성이 비어 있으면 아무도 등록 못 한다 — 설정을 빠뜨렸을 때 열리는 것보다 닫히는 게 낫다
function pair_(data) {
  // 키패드는 숫자 6자리만 보낸다. 속성이 그 꼴이 아니면 어떤 기기도 맞출 수 없으니
  // 실패 횟수를 올리지 않고 설정이 잘못됐다고 바로 알려준다 — 안 그러면 열 번 누르고 한 시간 잠긴다
  const pin = String(PropertiesService.getScriptProperties().getProperty("YUJU_PIN") || "").trim();
  if (!/^\d{6}$/.test(pin)) return fail_("no-pin");

  // 잠긴 뒤 쏟아지는 요청이 탭 쓰기(withTab_)와 같은 잠금을 두고 다투지 않게, 잠금 없이 먼저 한 번 본다
  const cache = CacheService.getScriptCache();
  if (Number(cache.get("pinFails") || 0) >= PIN_FAIL_LIMIT) return fail_("locked");

  // 실패 횟수 읽기 → 비교 → 쓰기는 한 잠금 안에서 한다. 따로 하면 동시에 보낸 요청들이
  // 모두 같은 횟수를 읽고 +1 만 남겨서, 한 번에 수십 개를 찍어도 한 번 틀린 걸로 친다
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const fails = Number(cache.get("pinFails") || 0);
    if (fails >= PIN_FAIL_LIMIT) return fail_("locked");
    if (String(data.pin || "") !== pin) {
      cache.put("pinFails", String(fails + 1), PIN_LOCK_SECONDS);
      return fail_("wrong");
    }

    // 본인이 몇 번 잘못 누른 뒤 맞췄으면 그 실패를 남겨둘 이유가 없다. 남겨두면 다음 기기 등록이 막힌다
    cache.remove("pinFails");
    const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    const list = tokens_();
    list.push(token);
    PropertiesService.getScriptProperties().setProperty(TOKEN_PROP, JSON.stringify(list.slice(-MAX_TOKENS)));
    return ok_({ token: token });
  } finally {
    lock.releaseLock();
  }
}

// 사용자가 쓴 글을 시트에 넣을 때는 항상 이걸 거친다.
// 시트는 = + - @ 로 시작하는 값을 수식으로 실행한다. 그러면 남이 넣은 글이
// 비공개 탭을 끌어오거나(=other!A1) 바깥 주소로 내용을 실어 보낼 수 있다(=IMAGE("..."&A1)).
// 앞에 ' 를 붙이면 시트는 그 값을 글자로만 두고, 읽을 때는 ' 없이 돌려준다.
// 수식 문자가 아니어도 붙인다 — "3/4" 가 날짜로, "1e5" 가 숫자로 바뀌는 것까지 막는다.
function text_(v, max) {
  const s = String(v === null || v === undefined ? "" : v).slice(0, max);
  return s ? "'" + s : "";
}

// 앱이 만드는 id 는 "시각36진수-랜덤" 이다. 그 꼴이 아니면 받지 않는다 — 시트에 그대로 들어가는 값이다
function id_(v) {
  const s = String(v || "");
  return /^[a-z0-9-]{1,40}$/i.test(s) ? s : "";
}

// "2026-09-19" 꼴이면서 달력에 실제로 있는 날인지. 2026-13-45 같은 값은 시트가 엉뚱한 날짜로 바꿔 넣는다
function isDay_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function who_(v) {
  const w = String(v || "").trim();
  return WHOS.indexOf(w) >= 0 ? w : "";
}

// 날짜 열은 텍스트 서식이라 보통 문자열로 오지만, 서식이 풀리면 Date 로 온다
function cellText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, "Asia/Seoul", "yyyy-MM-dd HH:mm");
  return String(v === null || v === undefined ? "" : v);
}

// 탭 전체를 문자열 2차원 배열로. 1행(헤더)도 그대로 둔다 — 앱이 열 순서로 읽고 헤더는 거른다
function tabRows_(name) {
  const sheet = sheet_(name);
  if (!sheet) return [];
  const rows = sheet.getLastRow();
  const cols = sheet.getLastColumn();
  if (rows < 1 || cols < 1) return [];
  return sheet.getRange(1, 1, rows, cols).getValues().map(function (row) {
    return row.map(cellText_);
  });
}

// 시트(달력·할 일)에서 그 id 의 행 번호. A열이 id 인 탭이면 어디든 쓴다. 없으면 0.
// 행 번호는 다른 기기에서 추가/삭제하면 밀리므로 반드시 id로 찾는다
function rowOfId_(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return 0;
}

// 쓰기는 한 번에 하나씩. 행 번호로 지우는 곳이 있어서, 두 요청이 겹치면
// 앞 요청이 지운 만큼 밀린 번호로 엉뚱한 줄을 지운다.
// 쓰고 나면 그 탭을 다시 읽어 같이 돌려준다 — 앱이 확인하러 다시 읽을 필요가 없다.
// at 은 읽은 시각이다. 앱은 이것으로 늦게 도착한 옛 응답을 버린다.
function withTab_(name, write) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const result = write() || {};
    SpreadsheetApp.flush();
    const at = Date.now();
    return Object.assign({ tab: tabRows_(name), at: at }, result);
  } finally {
    lock.releaseLock();
  }
}
