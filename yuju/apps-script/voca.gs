// spain-voca 컬럼: 1 book name | 2 chapter | 3 spanish | 4 korean | 5 construction | 6 fail count

// 단어장 쓰기는 withTab_ 대신 잠금만 따로 건다.
// withTab_ 는 쓰고 나서 탭 전체를 다시 읽어 돌려주는데, 이 탭은 900단어(~180KB)라
// 오답 한 번 올릴 때마다 그걸 읽고 실어 보내면 느리기만 하다. 퀴즈 페이지는 오답 응답을
// 보지도 않는다(보내고 잊는다). 그래도 잠금은 필요하다 — add 는 "마지막 행 + 1" 에 붙이고
// cleanup 은 행 번호로 지워서, 다른 쓰기와 겹치면 엉뚱한 줄을 덮거나 지운다.
function withVocaLock_(write) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const result = write();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

// 사람이 쓰는 칸의 최대 길이. 넘치는 건 잘라서 넣는다 — 시트가 터지는 것보다 낫다
const VOCA_BOOK_MAX = 60;
const VOCA_WORD_MAX = 200;
const VOCA_CONSTRUCTION_MAX = 300;
const VOCA_ADD_MAX = 1000;

function vocaTrim_(v) {
  return String(v === null || v === undefined ? "" : v).trim();
}

function vocaAction_(action, data) {
  // 단어 일괄 추가
  // {action:"add", book:"비바 델레 B1 기출단어", chapter:10, rows:[{spanish,korean,construction},...]}
  if (action === "add") {
    const book = vocaTrim_(data.book);
    if (!book) return fail_("bad book");
    // 숫자나 숫자 글자만 받는다. Number("") · Number(null) · Number(true) 가 0·1 이 되는 걸 막는다
    const rawChapter = data.chapter;
    const chapter = typeof rawChapter === "number" || (typeof rawChapter === "string" && rawChapter.trim())
      ? Number(rawChapter) : NaN;
    if (!isFinite(chapter) || chapter < 0 || chapter > 9999) {
      return fail_("bad chapter");
    }
    if (!Array.isArray(data.rows) || data.rows.length < 1 || data.rows.length > VOCA_ADD_MAX) {
      return fail_("bad rows");
    }
    // 한 줄이라도 이상하면 통째로 거절한다. 일부만 들어가면 어디까지 들어갔는지 알 길이 없다
    const rows = [];
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      if (!r || typeof r !== "object") return fail_("bad rows");
      const spanish = vocaTrim_(r.spanish);
      const korean = vocaTrim_(r.korean);
      if (!spanish || !korean) return fail_("bad rows");
      rows.push([
        text_(book, VOCA_BOOK_MAX),
        chapter,
        text_(spanish, VOCA_WORD_MAX),
        text_(korean, VOCA_WORD_MAX),
        text_(vocaTrim_(r.construction), VOCA_CONSTRUCTION_MAX),
        0,
      ]);
    }
    return ok_(withVocaLock_(() => {
      const sheet = sheet_(VOCA_SHEET);
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
      return { added: rows.length };
    }));
  }

  // 오답 카운트 +1 {action:"fail", spanish:"단어", book:"책이름"} (퀴즈 페이지용)
  if (action === "fail") {
    const spanish = vocaTrim_(data.spanish);
    if (!spanish) return fail_("bad word");
    const book = vocaTrim_(data.book);
    const found = withVocaLock_(() => {
      const sheet = sheet_(VOCA_SHEET);
      const last = sheet.getLastRow();
      if (last < 2) return false; // 헤더뿐이면 getRange 가 0행이라 예외가 난다
      const values = sheet.getRange(2, 1, last - 1, 6).getValues();
      for (let i = 0; i < values.length; i++) {
        // 두 책에 겹치는 단어가 43개라 book까지 맞춰야 엉뚱한 책의 행이 올라가지 않는다.
        // book 이 비면 (책 이름이 빈 행 등) 첫 매치로 처리한다.
        // 시트는 숫자처럼 생긴 칸을 숫자로 돌려줄 수 있어서 글자로 맞춰 비교한다
        if (String(values[i][2]).trim() === spanish && (!book || String(values[i][0]).trim() === book)) {
          sheet.getRange(i + 2, 6).setValue(Number(values[i][5] || 0) + 1);
          return true;
        }
      }
      return false;
    });
    // 탭을 돌려주지 않는다 — 퀴즈는 응답을 보지 않고, 다음에 열 때 읽기가 새 숫자를 가져온다
    return found ? ok_() : fail_("not found");
  }

  // 스페인어가 빈 잔여행 삭제 {action:"cleanup"}
  if (action === "cleanup") {
    return ok_(withVocaLock_(() => {
      const sheet = sheet_(VOCA_SHEET);
      const last = sheet.getLastRow();
      if (last < 2) return { removed: 0 };
      const values = sheet.getRange(2, 3, last - 1, 1).getValues();
      let removed = 0;
      // 뒤에서부터 지워야 행 번호가 밀리지 않는다
      for (let i = values.length - 1; i >= 0; i--) {
        if (!String(values[i][0]).trim()) {
          sheet.deleteRow(i + 2);
          removed++;
        }
      }
      return { removed: removed };
    }));
  }

  return fail_("unknown action");
}
