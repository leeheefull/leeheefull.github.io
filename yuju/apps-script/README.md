# yuju Apps Script

yuju 가 쓰는 Google Apps Script 웹앱의 원본. 시트 하나(`104A_zVF_EC...iLjo`)에 붙어 있고,
앱은 `no-cors` 로만 호출하므로 응답을 읽지 못한다.

앱과 같이 두되 배포에서는 빠진다. 워크플로가 `yuju/` 를 복사할 때 이 디렉터리만
`--exclude` 로 제외하므로 `/yuju/apps-script/` 는 사이트에 올라가지 않는다.

## 파일

| 파일 | 하는 일 |
|---|---|
| `common.gs` | 시트 탭 이름, `sheet_`·`json_`·`ok_`·`fail_`·`stamp_` |
| `main.gs` | `doPost` 라우터. 액션 앞머리로 각 파일에 넘긴다 |
| `note.gs` | 방명록 쓰기 (액션 없이 오는 요청) |
| `voca.gs` | `add` · `fail` · `cleanup` |
| `todo.gs` | `todo-add` · `todo-toggle` |
| `calendar.gs` | `cal-add` · `cal-delete` · `cal-photo` · `cal-photo-delete` · `cal-ping` |
| `gcal.gs` | 일정·기념일을 구글 캘린더 "희찬❤유주" 에도 띄운다 (yuju → 구글 한 방향) |

## 고치고 올리는 법

편집기에서 **기존 파일을 열어 ⌘A → ⌘V 로 덮어쓴다.** 새 파일을 만들면 같은 이름이
두 번 선언돼 프로젝트 전체가 SyntaxError 로 죽는다.

배포는 `배포 → 배포 관리 → 편집 → 버전: 새 버전`. 버전을 안 바꾸면 옛 코드가 계속 나간다.
반영됐는지는 `cal-ping` 으로 확인한다.

```
curl -sL "<웹앱 URL>" -H "Content-Type: text/plain" -d '{"action":"cal-ping"}'
```

새 배포 URL이 나오면 `yuju/store.js` 의 `YUJU_API` 한 줄만 갈면 된다.

## 구글 캘린더 연동

`cal-add` 가 시트에 쓰면서 전용 캘린더 "희찬❤유주" 에도 하루 종일 일정을 만든다.
제목은 `(희찬) …` · `(유주) …` · `(유주희찬) …`, 기념일은 매년 반복이다.
구글 일정 id 는 calendar 탭 8열 `gcal_id` 에 두고 `cal-delete` 가 이걸로 같이 지운다.
구글 캘린더에서 고친 건 yuju 로 돌아오지 않는다.

처음 한 번은 편집기에서 `syncCalendarToGoogle` 을 실행한다. 캘린더 권한 동의 창이 뜨고,
8열 헤더를 붙이고, 기존 일정을 옮긴다. `gcal_id` 가 빈 줄만 처리하므로 다시 돌려도 된다.

## 겪은 함정

- 파일이 나뉘어도 전역은 하나다. 같은 상수를 두 파일에서 선언하면 프로젝트 전체가 죽는다
- `DriveApp` 은 새 OAuth 범위다. 배포만으로는 동의 창이 안 뜨고, `_` 없는 함수를
  편집기에서 한 번 실행해야 한다
- 예외가 새어나가면 웹앱이 HTML 오류 페이지를 돌려준다. `main.gs` 의 `try/catch` 가
  그걸 JSON 으로 바꾼다. 원인을 볼 수 있는 유일한 통로다
