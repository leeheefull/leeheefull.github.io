// 탭마다 페이지가 따로라, 한 페이지가 읽어온 걸 다음 페이지가 쓰려면 기기에 남기는 수밖에 없다.
// 담는 건 시트가 준 CSV 원문 그대로다 — 해석하는 방식은 탭마다 달라서 원문이 공통분모다.
//
// 배포 주소도 여기 하나만 둔다. 앱스크립트를 새로 배포하면 고칠 곳은 이 한 줄이다.
const YUJU_API =
  "https://script.google.com/macros/s/AKfycbz1wxRhqnlcgD6wFhNTZX82AQFo_OxNx-lSQmczyBEzdhe-WOrDoNoHibpjCk05m6I/exec";

const sheetUrl = (name) => `${YUJU_API}?mode=tab&sheet=${encodeURIComponent(name)}`;

// 사파리 프라이빗 모드에서는 localStorage 를 건드리기만 해도 예외가 난다.
// 캐시가 없어도 앱은 그대로 돌아야 하므로 조용히 넘긴다.
function readStore(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 저장 못 해도 동작은 한다 */ }
}

const sheetKey = (name) => `yuju:sheet:${name}`;

// 지난번에 읽어둔 CSV. 없으면 null
function cachedSheet(name) {
  return readStore(sheetKey(name));
}

// 시트를 읽고 캐시에 남긴다. 실패는 그대로 던진다 — 캐시로 버틸지는 부르는 쪽이 정한다
async function fetchSheet(name) {
  const res = await fetch(sheetUrl(name), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const csv = await res.text();
  writeStore(sheetKey(name), csv);
  return csv;
}

// 홈에서만 부른다. 한 탭을 읽는 데 2초쯤 걸리지만 동시에 쏘면 넷을 합쳐도 그 정도다.
// 홈을 보는 동안 미리 받아두면 탭을 눌렀을 때 기다릴 게 없다.
// 탭을 곧바로 누르면 이 요청들은 페이지와 함께 끊긴다. 그래도 탭이 제 몫을 다시 읽으니 손해는 없다.
function prefetchSheets(names) {
  for (const name of names) fetchSheet(name).catch(() => {});
}
