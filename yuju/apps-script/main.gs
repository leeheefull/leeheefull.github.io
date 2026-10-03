// 웹 앱의 입구는 doPost 하나다. 읽기도 쓰기도 POST 몸통에 기기 토큰(key)을 실어 보낸다.
// 토큰을 주소(GET)에 실으면 기록과 로그에 남는다.

// 예전 앱이 GET 으로 읽던 입구. 이제는 아무것도 내주지 않는다
function doGet() {
  return fail_("unauthorized");
}

// 액션 이름의 앞머리로 각 파일의 처리기에 넘긴다. 새 액션이 늘어도 여기는 안 건드린다
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return fail_("bad request");
  }
  if (!data || typeof data !== "object") return fail_("bad request");
  const action = String(data.action || "");

  // 배포가 실제로 반영됐는지 curl 로 보는 용도. 버전 문자열 말고는 아무것도 내주지 않는다
  if (action === "cal-ping") return ok_({ version: CAL_CODE_VERSION });

  // 새 기기 등록. 숫자 비밀번호를 받고 토큰을 내준다 (common.gs)
  if (action === "pair") return pair_(data);

  if (!authorized_(data.key)) return fail_("unauthorized");

  // 예외를 그냥 두면 웹앱이 HTML 오류 페이지를 돌려준다. 앱이 읽을 수 있게 JSON 으로 감싼다.
  // 등록된 기기만 여기까지 오므로 원인을 그대로 알려줘도 된다
  try {
    if (action === "read") return readAction_(data);
    if (action.indexOf("cal-") === 0) return calendarAction_(action, data);
    if (action.indexOf("todo-") === 0) return todoAction_(action, data);
    if (action === "note-add") return noteAdd_(data);
    if (action === "add" || action === "fail" || action === "cleanup") {
      return vocaAction_(action, data);
    }
    return fail_("unknown action");
  } catch (err) {
    return fail_(String((err && err.message) || err));
  }
}
