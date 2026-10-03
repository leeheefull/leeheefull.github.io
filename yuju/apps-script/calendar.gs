// 배포된 코드가 최신인지 눈으로 확인하기 위한 표식. 코드를 고칠 때 같이 올린다
const CAL_CODE_VERSION = "2026-10-03b";

// calendar 컬럼: 1 id | 2 date | 3 kind | 4 title | 5 who | 6 photo_id | 7 created_at | 8 gcal_id
//   kind 가 event/anniv 이면 일정 행, photo 면 사진 행이다.
//   사진은 하루에 여러 장이라 date 로는 한 줄을 특정할 수 없다. 행마다 id 가 키다.
//   달력 격자에 보이는 건 그 날의 첫 사진, 즉 시트에서 먼저 나오는 줄이다.
//   일정과 사진을 한 탭에 두는 건 달력 화면이 둘을 항상 같이 읽기 때문이다.
//   gcal_id 는 구글 캘린더에 띄운 일정의 id 다. 구글 쪽 처리는 gcal.gs 가 한다.
//
// 쓰기는 모두 withTab_ 잠금 안에서 시트만 만지고, 쓰고 난 탭을 같이 돌려준다.
// 드라이브 저장·구글 캘린더처럼 몇 초씩 걸리는 일은 잠금 밖에서 한다 —
// 잠금을 오래 쥐면 다른 기기의 쓰기가 줄줄이 기다리다 시간 초과로 실패한다.

// 헤더만 먼저 붙여넣고 쓰기 시작하는 경우가 있어 1행 이하일 때도 서식을 다시 잡는다.
// 잠금 안에서 부른다 — 빈 탭에 두 요청이 겹치면 헤더가 두 줄 생긴다
function calendarSheet_() {
  const sheet = sheet_(CAL_SHEET);
  if (sheet.getLastRow() <= 1) {
    sheet.getRange("A:B").setNumberFormat("@");
    sheet.getRange("F:H").setNumberFormat("@");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["id", "date", "kind", "title", "who", "photo_id", "created_at", "gcal_id"]);
    }
  }
  return sheet;
}

// B열 서식이 텍스트가 아니면 시트가 날짜 셀로 바꿔버린다. 그래도 날짜끼리 맞춰볼 수 있게 한다
function calDateKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, "Asia/Seoul", "yyyy-MM-dd");
  return String(v === null || v === undefined ? "" : v).trim().slice(0, 10);
}

// 앱이 보낸 날짜. 꼴이 아니면 "" — 이 값은 시트에 그대로 들어간다
function calDate_(v) {
  // 앱은 언제나 "2026-09-19" 문자열을 보낸다. 앞 10자만 잘라 맞춰보면 "2026-09-19junk" 도 통과하므로 통째로 본다
  const date = String(v === null || v === undefined ? "" : v).trim();
  return isDay_(date) ? date : "";
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

// 앱은 8MB 넘는 원본을 JPEG 로 줄여 보낸다. 여유를 조금 두고 그 위는 받지 않는다.
// 같은 이유로 base64 글자 수도 디코드하기 전에 먼저 본다 — 거대한 문자열을 풀어보는 것부터가 부담이다
const CAL_PHOTO_MAX_BYTES = 9 * 1024 * 1024;

// 앞 바이트를 보고 어떤 이미지인지 정한다. 앱이 보낸 mime 은 믿지 않는다 —
// 이름표만 image/jpeg 이고 속은 HTML·스크립트인 파일이 링크 공개 드라이브에 쌓이면 안 된다.
// 모르는 형식이면 null
function photoType_(bytes) {
  const b = function (i) { return i < bytes.length ? bytes[i] & 0xff : -1; };
  const ascii = function (from, to) {
    let s = "";
    for (let i = from; i < to; i++) s += String.fromCharCode(b(i));
    return s;
  };
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { mime: "image/jpeg", ext: ".jpg" };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every(function (v, i) { return b(i) === v; })) return { mime: "image/png", ext: ".png" };
  if (ascii(0, 4) === "GIF8") return { mime: "image/gif", ext: ".gif" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mime: "image/webp", ext: ".webp" };
  // 아이폰 사진(HEIC). ISO-BMFF 라 4바이트 뒤에 ftyp, 그 다음 4바이트가 브랜드다
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "hevc"].indexOf(brand) >= 0) return { mime: "image/heic", ext: ".heic" };
    if (["heif", "mif1", "msf1"].indexOf(brand) >= 0) return { mime: "image/heif", ext: ".heif" };
  }
  return null;
}

// base64 → 이름 붙은 이미지 blob. 이미지가 아니거나 너무 크면 null
function photoBlob_(b64, date) {
  const s = typeof b64 === "string" ? b64 : "";
  if (!s || s.length > Math.ceil(CAL_PHOTO_MAX_BYTES / 3) * 4 + 16) return null;
  let bytes;
  try {
    bytes = Utilities.base64Decode(s);
  } catch (err) {
    return null;
  }
  if (!bytes.length || bytes.length > CAL_PHOTO_MAX_BYTES) return null;
  const type = photoType_(bytes);
  if (!type) return null;
  return Utilities.newBlob(bytes, type.mime, "yuju-" + date + type.ext);
}

// 앱에서 <img> 로 바로 부르려면 링크 공개여야 한다. 썸네일을 Apps Script 를 거쳐 내주면
// 사진마다 1~2초가 붙으므로, 드라이브에서 바로 받는 쪽을 일부러 골랐다.
// 대신 파일 id 는 시트에만 있고, 시트 내용은 PIN 으로 등록된 기기(토큰)만 받을 수 있다 — id 를 모르면 열 수 없다.
// 주소가 아니라 파일 id만 시트에 넣는다 — 같은 id로 썸네일도 원본도 만들 수 있어서
// 나중에 부르는 크기를 바꿔도 시트를 안 건드린다.
function savePhoto_(blob) {
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
  if (!id) return;
  try {
    DriveApp.getFileById(String(id)).setTrashed(true);
  } catch (err) {
    // 무시
  }
}

function calendarAction_(action, data) {
  // 일정·기념일 추가
  // {action:"cal-add", id, date:"2026-09-19", kind:"event"|"anniv", title, who:"희찬"|"유주"|"우리"}
  if (action === "cal-add") {
    const id = id_(data.id);
    if (!id) return fail_("bad id");
    const date = calDate_(data.date);
    if (!date) return fail_("bad date");
    const kind = data.kind;
    if (kind !== "event" && kind !== "anniv") return fail_("bad kind");
    const who = who_(data.who);
    if (!who) return fail_("bad who");
    // 구글 캘린더 제목에는 손대지 않은 글을, 시트에는 text_ 를 거친 글을 넣는다
    const title = String(data.title === null || data.title === undefined ? "" : data.title).trim().slice(0, 100);
    if (!title) return fail_("bad title");

    // 구글에 못 띄워도 yuju 저장은 한다. 빈 gcal_id 는 syncCalendarToGoogle 이 나중에 채운다.
    // 몇 초 걸리는 일이라 잠금 밖에서 먼저 한다
    const gcalId = gcalCreate_(kind, date, title, who);
    let dup = false;
    let result;
    try {
      result = withTab_(CAL_SHEET, function () {
        const sheet = calendarSheet_();
        // 응답을 못 받은 앱이 같은 일정을 다시 보내도 두 줄이 되지 않게 한다
        if (rowOfId_(sheet, id)) { dup = true; return; }
        sheet.appendRow([id, date, kind, text_(title, 100), who, "", stamp_(), gcalId]);
      });
    } catch (err) {
      // 시트에 못 적었으면 구글에만 남은 일정은 고아가 된다. 지우고 실패를 그대로 알린다
      gcalDelete_(kind, gcalId);
      throw err;
    }
    if (dup) gcalDelete_(kind, gcalId);
    result.gcal = !dup && !!gcalId;
    return ok_(result);
  }

  // 일정·사진 한 줄 삭제 {action:"cal-delete", id}
  // 이미 없는 id 도 성공으로 본다 — 다른 기기에서 먼저 지웠어도 앱이 바라는 상태는 같다
  if (action === "cal-delete") {
    const id = id_(data.id);
    if (!id) return fail_("bad id");

    let hit = null;
    const result = withTab_(CAL_SHEET, function () {
      const sheet = calendarSheet_();
      const row = rowOfId_(sheet, id);
      if (!row) return;
      const v = sheet.getRange(row, 1, 1, GCAL_ID_COL).getValues()[0];
      hit = { kind: String(v[2]).trim(), photoId: String(v[5]).trim(), gcalId: String(v[GCAL_ID_COL - 1]).trim() };
      sheet.deleteRow(row);
    });
    // 드라이브·구글 정리는 잠금을 놓은 뒤에. 실패해도 시트에서는 이미 빠졌다
    if (hit) {
      if (hit.kind === "photo") trashPhoto_(hit.photoId);
      gcalDelete_(hit.kind, hit.gcalId);
    }
    result.removed = hit ? 1 : 0;
    return ok_(result);
  }

  // 그 날 사진 한 장 더하기
  // {action:"cal-photo", id, date:"2026-09-19", who, image:"<base64>"}
  // 원본을 그대로 받아 드라이브에 둔다. 달력은 드라이브가 만들어주는 썸네일을 부르므로
  // 원본을 보관해도 화면에서 쓰는 데이터는 늘지 않는다.
  if (action === "cal-photo") {
    const id = id_(data.id);
    if (!id) return fail_("bad id");
    const date = calDate_(data.date);
    if (!date) return fail_("bad date");
    const who = who_(data.who);
    if (!who) return fail_("bad who");
    const blob = photoBlob_(data.image, date);
    if (!blob) return fail_("bad image");

    // 드라이브 저장은 몇 초 걸린다. 잠금 밖에서 먼저 하고, 시트에는 id 만 적는다
    const fileId = savePhoto_(blob);
    let dup = false;
    let result;
    try {
      result = withTab_(CAL_SHEET, function () {
        const sheet = calendarSheet_();
        if (rowOfId_(sheet, id)) { dup = true; return; }
        // 같은 날에 여러 장을 쌓으므로 언제나 새 줄로 붙인다.
        // 한 장을 빼는 건 cal-delete 가 id 로 처리한다.
        sheet.appendRow([id, date, "photo", "", who, fileId, stamp_()]);
      });
    } catch (err) {
      trashPhoto_(fileId); // 시트에 없는 사진은 아무도 못 찾는다
      throw err;
    }
    if (dup) trashPhoto_(fileId);
    return ok_(result);
  }

  // 그 날 사진을 전부 빼기 {action:"cal-photo-delete", date:"2026-09-19"}
  // 한 장만 뺄 때는 cal-delete 에 그 사진의 id 를 준다
  if (action === "cal-photo-delete") {
    const date = calDate_(data.date);
    if (!date) return fail_("bad date");

    const trashed = [];
    const result = withTab_(CAL_SHEET, function () {
      const sheet = calendarSheet_();
      const last = sheet.getLastRow();
      if (last < 2) return;
      const rows = sheet.getRange(2, 1, last - 1, 6).getValues();
      // 뒤에서부터 지워야 행 번호가 밀리지 않는다
      for (let i = rows.length - 1; i >= 0; i--) {
        if (String(rows[i][2]).trim() === "photo" && calDateKey_(rows[i][1]) === date) {
          trashed.push(String(rows[i][5]).trim());
          sheet.deleteRow(i + 2);
        }
      }
    });
    if (!trashed.length) return fail_("not found");
    trashed.forEach(trashPhoto_);
    result.removed = trashed.length;
    return ok_(result);
  }

  return fail_("unknown action");
}
