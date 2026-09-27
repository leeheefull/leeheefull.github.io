// note 컬럼: 1 created_at | 2 name | 3 message
// 글 남기기 페이지는 응답을 읽지 않으므로 예전처럼 평문 "ok" 를 돌려준다
function noteAdd_(data) {
  sheet_(NOTE_SHEET).appendRow([
    stamp_(),
    String(data.name).slice(0, 20),
    String(data.message).slice(0, 500),
  ]);
  return ContentService.createTextOutput("ok");
}
