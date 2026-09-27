// 파일은 나뉘어 있어도 Apps Script 에서는 전역이 하나다.
// import 같은 건 없고, 여기 상수와 함수를 다른 파일에서 그대로 쓴다.

// 시트 탭 이름
const NOTE_SHEET = "note";
const VOCA_SHEET = "spain-voca";
const TODO_SHEET = "to-do-list";
const CAL_SHEET = "calendar";

function sheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj));
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
