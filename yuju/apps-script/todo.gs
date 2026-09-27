// to-do-list 컬럼: 1 id | 2 created_at | 3 who | 4 text | 5 done_at

// 헤더가 없으면 만든다. 날짜 문자열이 날짜 셀로 자동 변환되면 웹에서 읽을 때 형식이
// 달라지므로 id/날짜 열은 서식을 텍스트로 못 박는다.
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
  const sheet = todoSheet_();

  // 항목 추가 {action:"todo-add", id, createdAt, who, text}
  if (action === "todo-add") {
    sheet.appendRow([
      String(data.id).slice(0, 40),
      String(data.createdAt || "").slice(0, 20),
      String(data.who).slice(0, 20),
      String(data.text).slice(0, 200),
      "",
    ]);
    return ok_();
  }

  // 완료/취소 {action:"todo-toggle", id, doneAt:"2026-08-17" 또는 ""}
  if (action === "todo-toggle") {
    const last = sheet.getLastRow();
    if (last < 2) return fail_("empty");

    const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      // 행 번호는 다른 기기에서 추가/삭제하면 밀리므로 반드시 id로 찾는다
      if (String(ids[i][0]) === String(data.id)) {
        sheet.getRange(i + 2, 5).setValue(String(data.doneAt || ""));
        return ok_();
      }
    }
    return fail_("not found");
  }

  return fail_("unknown action");
}
