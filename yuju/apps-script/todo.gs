// to-do-list 컬럼: 1 id | 2 created_at | 3 who | 4 text | 5 done_at
// 쓰고 난 to-do-list 탭을 같이 돌려준다 — 앱은 그걸로 바로 그리고, 다시 읽으러 오지 않는다

// 헤더가 없으면 만든다. 날짜 문자열이 날짜 셀로 자동 변환되면 웹에서 읽을 때 형식이
// 달라지므로 id/날짜 열은 서식을 텍스트로 못 박는다.
// 잠금 안에서 부른다 — 빈 탭에 두 요청이 겹치면 헤더가 두 줄 생긴다
function todoSheet_() {
  const sheet = sheet_(TODO_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.getRange("A:B").setNumberFormat("@");
    sheet.getRange("E:E").setNumberFormat("@");
    sheet.appendRow(["id", "created_at", "who", "text", "done_at"]);
  }
  return sheet;
}

function todoAction_(action, data) {
  // 항목 추가 {action:"todo-add", id, createdAt, who, text}
  if (action === "todo-add") {
    const id = id_(data.id);
    if (!id) return fail_("bad id");
    // 글쓴이는 화면의 라디오(희찬·유주) 둘 중 하나다. "우리" 는 일정에만 있는 이름이다
    const who = who_(data.who);
    if (who !== "희찬" && who !== "유주") return fail_("bad who");
    const text = String(data.text === null || data.text === undefined ? "" : data.text).trim();
    if (!text) return fail_("bad text");
    // 만든 시각은 앱이 정한 걸 쓴다(목록 정렬 기준). 꼴이 다르면 서버 시각으로 대신한다 —
    // 이 열은 그대로 시트에 들어가므로 아무 문자열이나 받지 않는다
    const createdAt = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(data.createdAt || ""))
      ? String(data.createdAt)
      : stamp_();
    return ok_(withTab_(TODO_SHEET, function () {
      const sheet = todoSheet_();
      // 응답을 못 받은 앱이 같은 항목을 다시 보내도 두 줄이 되지 않게 한다
      if (rowOfId_(sheet, id)) return;
      sheet.appendRow([id, createdAt, who, text_(text, 200), ""]);
    }));
  }

  // 완료/취소 {action:"todo-toggle", id, doneAt:"2026-08-17" 또는 ""}
  if (action === "todo-toggle") {
    const id = id_(data.id);
    if (!id) return fail_("bad id");
    const doneAt = String(data.doneAt === null || data.doneAt === undefined ? "" : data.doneAt);
    if (doneAt && !isDay_(doneAt)) return fail_("bad date");
    return ok_(withTab_(TODO_SHEET, function () {
      const sheet = todoSheet_();
      const row = rowOfId_(sheet, id);
      // 잠금 안이라 fail_ 로 돌아갈 수 없다. 던지면 잠금은 풀리고 main.gs 가 {ok:false} 로 감싼다
      if (!row) throw new Error("not found");
      sheet.getRange(row, 5).setValue(doneAt);
    }));
  }

  return fail_("unknown action");
}
