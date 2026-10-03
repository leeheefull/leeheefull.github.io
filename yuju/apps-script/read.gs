// 앱이 시트를 직접 읽지 않고 여기를 거친다. 스크립트는 소유자 권한으로 돌기 때문에
// 시트를 비공개로 두고도 읽을 수 있고, 시트 주소가 앱 코드에서 사라진다.
//
// 여러 탭을 한 번에 돌려준다. Apps Script 는 부를 때마다 1~2초가 고정으로 붙어서
// 홈에서 네 탭을 따로 부르는 것보다 한 번에 부르는 게 훨씬 빠르다.

// {action:"read", tabs:["calendar","note"]} → {ok, at, tabs:{calendar:[[...]], note:[[...]]}}
function readAction_(data) {
  const names = Array.isArray(data.tabs) ? data.tabs : [];
  // at 은 읽기 전에 잰다. 이 시각 전에 끝난 쓰기는 모두 이 응답에 들어 있다
  const at = Date.now();
  const tabs = {};
  for (let i = 0; i < names.length; i++) {
    const name = String(names[i]);
    if (READABLE_SHEETS.indexOf(name) < 0) continue; // 열어주지 않은 탭은 조용히 뺀다
    tabs[name] = tabRows_(name);
  }
  return ok_({ at: at, tabs: tabs });
}
