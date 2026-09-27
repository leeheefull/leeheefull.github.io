// 앱이 시트를 직접 읽지 않고 여기를 거친다. 스크립트는 소유자 권한으로 돌기 때문에
// 시트를 비공개로 두고도 읽을 수 있고, 시트 주소가 앱 코드에서 사라진다.
//
// 돌려주는 건 예전 gviz 와 같은 CSV 다. 앱의 파서를 그대로 쓰려고 형식을 맞췄다.

// 열어줄 탭을 못박는다. 아무 탭이나 내주면 시트를 비공개로 돌린 의미가 없다
const READABLE_SHEETS = ["calendar", "note", "to-do-list", "spain-voca"];

function readAction_(mode, e) {
  const param = (e && e.parameter) || {};

  if (mode === "tab") {
    const name = String(param.sheet || "");
    if (READABLE_SHEETS.indexOf(name) < 0) return text_("");
    return text_(tabCsv_(name));
  }

  // 글 탭에서 가장 최근 시각 한 줄. 안 읽은 글 점이 이것만 본다.
  // 전체를 내려받지 않으니 글 안의 줄바꿈도 문제가 되지 않는다.
  if (mode === "note-stamp") {
    const sheet = sheet_(NOTE_SHEET);
    const last = sheet.getLastRow();
    if (last < 2) return text_('""');
    const values = sheet.getRange(2, 1, last - 1, 1).getValues();
    let newest = "";
    for (let i = 0; i < values.length; i++) {
      const v = cellText_(values[i][0]);
      if (v > newest) newest = v;
    }
    return text_(csvRow_([newest]));
  }

  // 기념일만. 홈 칩이 이것만 본다
  if (mode === "anniv") {
    const sheet = sheet_(CAL_SHEET);
    const last = sheet.getLastRow();
    if (last < 2) return text_("");
    const values = sheet.getRange(2, 1, last - 1, 4).getValues();
    const out = [];
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][2]).trim() === "anniv") {
        out.push(csvRow_([values[i][1], values[i][3]]));
      }
    }
    return text_(out.join("\n"));
  }

  return text_("");
}

function tabCsv_(name) {
  const sheet = sheet_(name);
  if (!sheet) return "";
  const rows = sheet.getLastRow();
  const cols = sheet.getLastColumn();
  if (rows < 1 || cols < 1) return "";
  return sheet.getRange(1, 1, rows, cols).getValues().map(csvRow_).join("\n");
}

// gviz 처럼 모든 칸을 따옴표로 감싼다. 앱 파서가 그걸 전제로 한다
function csvRow_(row) {
  return row.map(function (v) {
    return '"' + cellText_(v).replace(/"/g, '""') + '"';
  }).join(",");
}

// 날짜 열은 텍스트 서식이라 보통 문자열로 오지만, 서식이 풀리면 Date 로 온다
function cellText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, "Asia/Seoul", "yyyy-MM-dd HH:mm");
  return String(v === null || v === undefined ? "" : v);
}

function text_(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT);
}
