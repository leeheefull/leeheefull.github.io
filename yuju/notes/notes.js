// note 탭 1행은 헤더: created_at | name | message
// 앱은 시트를 직접 읽지 않는다. 읽기도 쓰기도 store.js 를 거쳐 Apps Script 로 가므로
// 시트 주소가 여기 없고, 시트를 비공개로 둘 수 있다.
const SHEET = "note";

// 다시 화면에 돌아왔을 때 이만큼 지났으면 새로 읽는다. 잠깐 다른 앱을 본 정도로는 부르지 않는다
const REFETCH_MS = 60 * 1000;

const noteForm = document.getElementById("noteForm");
const noteText = document.getElementById("noteText");
const noteSubmit = document.getElementById("noteSubmit");
const noteList = document.getElementById("noteList");
const notesStatus = document.getElementById("notesStatus");

let lastFetch = 0; // 마지막으로 서버에서 읽어온 시각
let sending = false;

// 행은 서버가 준 문자열 배열 그대로다. 예전엔 CSV 를 줄 단위로 잘라 읽어서
// 여러 줄짜리 글이 깨졌는데, 이제 셀 하나가 통째로 오니 줄바꿈도 그대로 남는다(.msg 는 pre-wrap)
function renderNotes(rows) {
  const notes = (rows || []).filter((r) => r && r[1] && r[2] && r[0] !== "created_at");

  noteList.innerHTML = "";

  if (notes.length === 0) {
    notesStatus.textContent = "아직 남긴 글이 없어요. 첫 글을 남겨보세요!";
    return;
  }

  notesStatus.textContent = "";
  notes.reverse(); // 최신 글이 위로

  // 한 번에 붙여서 글이 많아도 화면을 한 번만 다시 그린다
  const frag = document.createDocumentFragment();
  for (const [time, name, message] of notes) {
    const li = document.createElement("li");

    const meta = document.createElement("div");
    meta.className = "meta";
    const who = document.createElement("span");
    who.textContent = name;
    const when = document.createElement("span");
    when.textContent = time;
    meta.append(who, when);

    const msg = document.createElement("p");
    msg.className = "msg";
    msg.textContent = message; // textContent 라 글 속의 태그는 글자로만 보인다

    li.append(meta, msg);
    frag.append(li);
  }
  noteList.append(frag);
}

async function loadNotes(quiet) {
  try {
    const rows = await fetchTab(SHEET);
    lastFetch = Date.now();
    // null 이면 이미 더 새 걸 그려둔 상태다(쓰기 응답이 먼저 왔다든가). 그대로 둔다
    if (rows) renderNotes(rows);
  } catch (err) {
    if (err instanceof YujuAuthError) return; // 잠금 화면이 떠 있다
    // 캐시로 이미 글이 떠 있으면 굳이 실패를 알리지 않는다
    if (!quiet) notesStatus.textContent = "글을 불러오지 못했어요. 잠시 후 다시 열어주세요.";
  }
}

noteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (sending) return; // 버튼을 빠르게 두 번 눌러도 한 번만 보낸다

  const message = noteText.value.trim();
  if (!message) return;

  const name = noteForm.elements.who.value;
  sending = true;
  noteSubmit.disabled = true;
  notesStatus.textContent = "남기는 중...";

  try {
    // 서버는 쓰고 난 note 탭을 같이 돌려준다. 다시 읽으러 갈 필요 없이 바로 그린다
    const { rows } = await sendAction({ action: "note-add", name, message }, SHEET);
    noteText.value = "";
    lastFetch = Date.now();
    if (rows) renderNotes(rows);
    notesStatus.textContent = "남겼어요!";
  } catch (err) {
    // 실패하면 쓴 글은 그대로 둔다 — 다시 누르기만 하면 되게
    notesStatus.textContent = err instanceof YujuAuthError ? "" : "전송에 실패했어요. 다시 시도해 주세요.";
  } finally {
    sending = false;
    noteSubmit.disabled = false;
  }
});

// 홈 화면에 띄워둔 앱은 며칠씩 안 닫힌다. 다시 꺼냈을 때 상대가 남긴 글이 보이도록 새로 읽는다
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastFetch >= REFETCH_MS) loadNotes(true);
});

// 키를 기기에 못 남기는 브라우저는 새로 고치지 않고 잠금만 걷는다. 그때 처음부터 다시 읽는다
window.addEventListener("yuju:unlocked", () => loadNotes());

// 홈에서 미리 받아뒀거나 지난번에 읽어둔 게 있으면 먼저 그린다. 이어지는 읽기가 덮는다
const cached = cachedTab(SHEET);
if (cached) renderNotes(cached);
loadNotes(Boolean(cached));
