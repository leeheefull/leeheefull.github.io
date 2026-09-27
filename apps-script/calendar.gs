// 배포된 코드가 최신인지 눈으로 확인하기 위한 표식. 코드를 고칠 때 같이 올린다
const CAL_CODE_VERSION = "2026-09-27d";

// calendar 컬럼: 1 id | 2 date | 3 kind | 4 title | 5 who | 6 photo_id | 7 created_at
//   kind 가 event/anniv 이면 일정 행, photo 면 그 날의 사진 행이다.
//   사진은 하루 한 장이라 date 가 곧 키다. 일정과 사진을 한 탭에 두는 건
//   달력 화면이 둘을 항상 같이 읽기 때문이다. 탭이 나뉘면 요청이 두 번 나간다.

// 헤더만 먼저 붙여넣고 쓰기 시작하는 경우가 있어 1행 이하일 때도 서식을 다시 잡는다
function calendarSheet_() {
  const sheet = sheet_(CAL_SHEET);
  if (sheet.getLastRow() <= 1) {
    sheet.getRange("A:B").setNumberFormat("@");
    sheet.getRange("F:G").setNumberFormat("@");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["id", "date", "kind", "title", "who", "photo_id", "created_at"]);
    }
  }
  return sheet;
}

// B열 서식이 텍스트가 아니면 시트가 날짜 셀로 바꿔버린다. 그래도 날짜끼리 맞춰볼 수 있게 한다
function calDateKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, "Asia/Seoul", "yyyy-MM-dd");
  return String(v).trim().slice(0, 10);
}

// 이름이 같은 폴더가 드라이브 여기저기 있을 수 있으므로 루트부터 한 단계씩 내려간다.
// getFoldersByName 을 DriveApp 에 바로 걸면 아무 데나 있는 같은 이름 폴더가 잡힌다.
function folderUnder_(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

// 사진은 내 드라이브 > db > yuju 에 원본으로 쌓는다. 없으면 처음 올릴 때 만든다.
// 폴더 이름을 전역 상수로 빼지 않는 건, 다른 파일이 같은 이름을 선언하면
// 중복 선언으로 프로젝트 전체가 SyntaxError 로 죽기 때문이다. 실제로 한 번 겪었다.
function photoFolder_() {
  const db = folderUnder_(DriveApp.getRootFolder(), "db");
  return folderUnder_(db, "yuju");
}

// 앱에서 <img> 로 바로 부르려면 링크 공개여야 한다.
// 주소가 아니라 파일 id만 시트에 넣는다 — 같은 id로 썸네일도 원본도 만들 수 있어서
// 나중에 부르는 크기를 바꿔도 시트를 안 건드린다.
function savePhoto_(b64, mime, name) {
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime || "image/jpeg", name);
  const file = photoFolder_().createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // 회사 계정처럼 링크 공개가 막힌 곳이 있다. 그래도 파일과 기록은 남기고,
    // 달력에서 안 보이는 건 나중에 공유 설정으로 풀 수 있게 둔다.
  }
  return file.getId();
}

// 이미 지워졌거나 권한이 없으면 그냥 넘어간다. 사진 하나 때문에 저장이 실패하면 안 된다
function trashPhoto_(id) {
  try {
    DriveApp.getFileById(String(id)).setTrashed(true);
  } catch (err) {
    // 무시
  }
}

function calendarAction_(action, data) {
  // 배포가 실제로 반영됐는지 확인용. 시트도 드라이브도 건드리지 않는다
  // {action:"cal-ping"}
  if (action === "cal-ping") return ok_({ version: CAL_CODE_VERSION });

  const sheet = calendarSheet_();

  // 일정·기념일 추가
  // {action:"cal-add", id, date:"2026-09-19", kind:"event"|"anniv", title, who:"희찬"|"유주"|"우리"}
  if (action === "cal-add") {
    const date = calDateKey_(data.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail_("bad date");

    sheet.appendRow([
      String(data.id).slice(0, 40),
      date,
      data.kind === "anniv" ? "anniv" : "event",
      String(data.title || "").slice(0, 100),
      String(data.who || "").slice(0, 10),
      "",
      stamp_(),
    ]);
    return ok_();
  }

  // 일정 삭제 {action:"cal-delete", id}
  if (action === "cal-delete") {
    const last = sheet.getLastRow();
    if (last < 2) return fail_("empty");

    const rows = sheet.getRange(2, 1, last - 1, 6).getValues();
    for (let i = 0; i < rows.length; i++) {
      // 행 번호는 다른 기기에서 추가/삭제하면 밀리므로 반드시 id로 찾는다
      if (String(rows[i][0]) === String(data.id)) {
        if (rows[i][2] === "photo" && rows[i][5]) trashPhoto_(rows[i][5]);
        sheet.deleteRow(i + 2);
        return ok_();
      }
    }
    return fail_("not found");
  }

  // 그 날 사진 넣기·바꾸기
  // {action:"cal-photo", id, date:"2026-09-19", who, mime:"image/jpeg", image:"<base64>"}
  // 원본을 그대로 받아 드라이브에 둔다. 달력은 드라이브가 만들어주는 썸네일을 부르므로
  // 원본을 보관해도 화면에서 쓰는 데이터는 늘지 않는다.
  if (action === "cal-photo") {
    const date = calDateKey_(data.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail_("bad date");
    if (!data.image) return fail_("no image");

    const ext = String(data.mime || "").indexOf("png") >= 0 ? ".png" : ".jpg";
    const fileId = savePhoto_(data.image, data.mime, "yuju-" + date + ext);
    const when = stamp_();
    const last = sheet.getLastRow();
    const rows = last >= 2 ? sheet.getRange(2, 1, last - 1, 6).getValues() : [];

    for (let i = 0; i < rows.length; i++) {
      // 하루 한 장이라 날짜로 찾는다. 이미 있으면 옛 사진은 휴지통으로 보내고 같은 줄을 갱신한다
      if (rows[i][2] === "photo" && calDateKey_(rows[i][1]) === date) {
        if (rows[i][5]) trashPhoto_(rows[i][5]);
        sheet.getRange(i + 2, 4, 1, 4).setValues([
          ["", String(data.who || "").slice(0, 10), fileId, when],
        ]);
        return ok_({ updated: true });
      }
    }

    sheet.appendRow([
      String(data.id || "p" + date).slice(0, 40),
      date,
      "photo",
      "",
      String(data.who || "").slice(0, 10),
      fileId,
      when,
    ]);
    return ok_({ created: true });
  }

  // 그 날 사진 빼기 {action:"cal-photo-delete", date:"2026-09-19"}
  if (action === "cal-photo-delete") {
    const date = calDateKey_(data.date);
    const last = sheet.getLastRow();
    if (last < 2) return fail_("empty");

    const rows = sheet.getRange(2, 1, last - 1, 6).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][2] === "photo" && calDateKey_(rows[i][1]) === date) {
        if (rows[i][5]) trashPhoto_(rows[i][5]);
        sheet.deleteRow(i + 2);
        return ok_();
      }
    }
    return fail_("not found");
  }

  return fail_("unknown action");
}
