// note 컬럼: 1 created_at | 2 name | 3 message
// 글쓴이는 희찬·유주 둘 중 하나다. "우리" 는 일정에만 있는 이름이라 글에서는 받지 않는다.
// 쓰고 난 note 탭을 같이 돌려준다 — 앱은 그걸로 바로 그리고, 다시 읽으러 오지 않는다
function noteAdd_(data) {
  const name = who_(data.name);
  if (name !== "희찬" && name !== "유주") return fail_("bad who");
  // 앞뒤 공백만 있는 글은 빈 글이다. 줄바꿈은 그대로 둔다 — 화면이 pre-wrap 으로 보여준다
  const message = String(data.message === null || data.message === undefined ? "" : data.message).trim();
  if (!message) return fail_("bad message");
  return ok_(withTab_(NOTE_SHEET, function () {
    sheet_(NOTE_SHEET).appendRow([stamp_(), name, text_(message, 500)]);
  }));
}
