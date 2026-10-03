// yuju 달력에 넣은 일정을 구글 캘린더에도 띄운다. 방향은 yuju → 구글 하나뿐이다.
// 구글 캘린더에서 고치거나 지운 건 yuju 로 돌아오지 않는다.
//
// 기본 캘린더가 아니라 전용 캘린더에 넣는다. 색을 따로 주고, 숨기고, 유주에게 공유하기 쉽다.
// 스크립트는 배포한 계정 권한으로 돌므로 그 계정의 캘린더에 생긴다.
//
// 구글 일정 id 는 calendar 탭 8열(gcal_id)에 둔다. 지울 때 이걸로 찾는다.
// 캘린더 쪽이 실패해도 시트 저장은 성공해야 하므로 여기 함수들은 예외를 밖으로 내지 않는다.

const GCAL_NAME = "희찬❤유주";
const GCAL_ID_COL = 8;
const GCAL_ID_PROP = "gcalId";

// 이름으로 찾으면 매번 캘린더 목록을 훑어야 해서 한 번 찾은 id 를 스크립트 속성에 둔다.
// 사용자가 캘린더를 지웠으면 속성의 id 가 죽으므로 이름으로 다시 찾고, 없으면 만든다.
function gcal_() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty(GCAL_ID_PROP);
  if (saved) {
    const cal = CalendarApp.getCalendarById(saved);
    if (cal) return cal;
  }
  const found = CalendarApp.getCalendarsByName(GCAL_NAME);
  const cal = found.length ? found[0] : CalendarApp.createCalendar(GCAL_NAME, { timeZone: "Asia/Seoul" });
  props.setProperty(GCAL_ID_PROP, cal.getId());
  return cal;
}

// (희찬) 프로젝트 회식 / (유주) 영은이 만나기 / (유주희찬) 집 구조 바꾸기
function gcalTitle_(who, title) {
  const w = String(who || "").trim();
  const tag = w === "희찬" || w === "유주" ? w : "유주희찬";
  return "(" + tag + ") " + String(title || "").trim();
}

// "2026-09-19" → 스크립트 시간대의 그날 0시. 하루 종일 일정은 날짜만 보므로 이걸로 충분하다
function gcalDate_(key) {
  const p = String(key).split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

// 일정은 그날 하루 종일, 기념일은 매년 반복. 만든 구글 id 를 돌려주고 실패하면 ""
function gcalCreate_(kind, date, title, who) {
  try {
    const cal = gcal_();
    const name = gcalTitle_(who, title);
    if (kind === "anniv") {
      const yearly = CalendarApp.newRecurrence().addYearlyRule();
      return cal.createAllDayEventSeries(name, gcalDate_(date), yearly).getId();
    }
    return cal.createAllDayEvent(name, gcalDate_(date)).getId();
  } catch (err) {
    // 앱은 no-cors 라 응답을 못 읽으니 원인은 실행 로그에만 남는다
    console.warn("gcalCreate_ 실패: " + ((err && err.message) || err));
    return "";
  }
}

// 반복 일정은 하나만 지우면 그 회차만 빠지므로 시리즈째 지운다
function gcalDelete_(kind, gcalId) {
  if (!gcalId) return;
  try {
    const cal = gcal_();
    if (kind === "anniv") {
      const series = cal.getEventSeriesById(String(gcalId));
      if (series) series.deleteEventSeries();
    } else {
      const event = cal.getEventById(String(gcalId));
      if (event) event.deleteEvent();
    }
  } catch (err) {
    // 이미 지워졌거나 권한이 없으면 넘어간다. 원인은 실행 로그에 남긴다
    console.warn("gcalDelete_ 실패: " + ((err && err.message) || err));
  }
}

// 편집기에서 한 번 직접 실행한다. 이름에 _ 가 없어야 실행 목록에 뜬다.
//  - CalendarApp 은 새 OAuth 범위라 이걸 돌려야 동의 창이 뜬다. 배포만으로는 안 뜬다
//  - 8열 헤더를 붙이고, 아직 구글에 없는 기존 일정·기념일을 옮긴다
// 이미 gcal_id 가 있는 줄은 건너뛰므로 여러 번 돌려도 중복되지 않는다.
function syncCalendarToGoogle() {
  // 동의 창에서 캘린더만 빼고 허용해도 실행은 된다. 그러면 일정마다 권한 오류로 조용히 실패하므로
  // 여기서 먼저 캘린더 권한을 요구해 동의 창을 다시 띄운다
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, ["https://www.googleapis.com/auth/calendar"]);

  const sheet = calendarSheet_();
  sheet.getRange(1, GCAL_ID_COL).setValue("gcal_id");

  const last = sheet.getLastRow();
  if (last < 2) return "empty";

  const rows = sheet.getRange(2, 1, last - 1, GCAL_ID_COL).getValues();
  let created = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const kind = String(rows[i][2]).trim();
    if (kind !== "event" && kind !== "anniv") continue;
    if (String(rows[i][GCAL_ID_COL - 1]).trim()) continue;

    const id = gcalCreate_(kind, calDateKey_(rows[i][1]), rows[i][3], rows[i][4]);
    if (!id) { failed++; continue; }
    sheet.getRange(i + 2, GCAL_ID_COL).setValue(id);
    created++;
  }
  const result = "created " + created + ", failed " + failed;
  Logger.log(result);
  return result;
}
