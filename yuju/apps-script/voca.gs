// spain-voca 컬럼: 1 book name | 2 chapter | 3 spanish | 4 korean | 5 construction | 6 fail count
function vocaAction_(action, data) {
  const sheet = sheet_(VOCA_SHEET);

  // 단어 일괄 추가
  // {action:"add", book:"비바 델레 B1 기출단어", chapter:10, rows:[{spanish,korean,construction},...]}
  if (action === "add") {
    const rows = data.rows.map(r => [
      data.book, data.chapter, r.spanish, r.korean, r.construction || "", 0,
    ]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
    return ok_({ added: rows.length });
  }

  // 오답 카운트 +1 {action:"fail", spanish:"단어", book:"책이름"} (퀴즈 페이지용)
  if (action === "fail") {
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
    for (let i = 0; i < values.length; i++) {
      // 두 책에 겹치는 단어가 43개라 book까지 맞춰야 엉뚱한 책의 행이 올라가지 않는다.
      // book 없이 오는 옛 요청은 예전처럼 첫 매치로 처리한다
      if (values[i][2] === data.spanish && (!data.book || values[i][0] === data.book)) {
        sheet.getRange(i + 2, 6).setValue(Number(values[i][5] || 0) + 1);
        return ok_();
      }
    }
    return fail_("not found");
  }

  // 스페인어가 빈 잔여행 삭제 {action:"cleanup"}
  if (action === "cleanup") {
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
    let removed = 0;
    // 뒤에서부터 지워야 행 번호가 밀리지 않는다
    for (let i = values.length - 1; i >= 0; i--) {
      if (!String(values[i][2]).trim()) {
        sheet.deleteRow(i + 2);
        removed++;
      }
    }
    return ok_({ removed: removed });
  }

  return fail_("unknown action");
}
