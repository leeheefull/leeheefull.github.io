# yuju Apps Script

yuju 가 쓰는 Google Apps Script 웹앱의 원본. 시트 하나(`104A_zVF_EC...iLjo`)에 붙어 있고,
앱은 `no-cors` 로만 호출하므로 응답을 읽지 못한다.

배포되는 사이트에 포함되지 않도록 `yuju/` 바깥에 둔다 (워크플로는 `yuju/`·`portfolio/`·
`pages/`·`assets/` 만 복사한다).

## 파일

| 파일 | 하는 일 |
|---|---|
| `common.gs` | 시트 탭 이름, `sheet_`·`json_`·`ok_`·`fail_`·`stamp_` |
| `main.gs` | `doPost` 라우터. 액션 앞머리로 각 파일에 넘긴다 |
| `note.gs` | 방명록 쓰기 (액션 없이 오는 요청) |
| `voca.gs` | `add` · `fail` · `cleanup` |
| `todo.gs` | `todo-add` · `todo-toggle` |
| `calendar.gs` | `cal-add` · `cal-delete` · `cal-photo` · `cal-photo-delete` · `cal-ping` |

## 고치고 올리는 법

편집기에서 **기존 파일을 열어 ⌘A → ⌘V 로 덮어쓴다.** 새 파일을 만들면 같은 이름이
두 번 선언돼 프로젝트 전체가 SyntaxError 로 죽는다.

배포는 `배포 → 배포 관리 → 편집 → 버전: 새 버전`. 버전을 안 바꾸면 옛 코드가 계속 나간다.
반영됐는지는 `cal-ping` 으로 확인한다.

```
curl -sL -X POST "<웹앱 URL>" -H "Content-Type: text/plain" -d '{"action":"cal-ping"}'
```

새 배포 URL이 나오면 `yuju/*/[a-z]*.js` 네 파일의 `WRITE_URL` 도 같이 갈아야 한다.

## 겪은 함정

- 파일이 나뉘어도 전역은 하나다. 같은 상수를 두 파일에서 선언하면 프로젝트 전체가 죽는다
- `DriveApp` 은 새 OAuth 범위다. 배포만으로는 동의 창이 안 뜨고, `_` 없는 함수를
  편집기에서 한 번 실행해야 한다
- 예외가 새어나가면 웹앱이 HTML 오류 페이지를 돌려준다. `main.gs` 의 `try/catch` 가
  그걸 JSON 으로 바꾼다. 원인을 볼 수 있는 유일한 통로다
