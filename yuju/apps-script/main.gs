// 웹 앱의 단 하나뿐인 입구.
// 액션 이름의 앞머리로 각 파일의 처리기에 넘긴다. 새 액션이 늘어도 여기는 안 건드린다.
function doPost(e) {
  // 예외를 그냥 두면 웹앱이 HTML 오류 페이지를 돌려준다.
  // 앱은 no-cors 라 응답을 못 읽으니, 최소한 curl 로는 원인이 보이게 JSON 으로 감싼다.
  try {
    const data = JSON.parse(e.postData.contents);
    const action = String(data.action || "");

    if (action.indexOf("cal-") === 0) return calendarAction_(action, data);
    if (action.indexOf("todo-") === 0) return todoAction_(action, data);
    if (action === "add" || action === "fail" || action === "cleanup") {
      return vocaAction_(action, data);
    }

    // 액션이 없으면 방명록 쓰기. 글 남기기 페이지가 action 없이 보내므로 기본값으로 둔다
    return noteAdd_(data);
  } catch (err) {
    return fail_(String((err && err.message) || err));
  }
}
