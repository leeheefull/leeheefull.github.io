// note 탭 1행은 헤더: created_at | name | message
// 앱은 시트를 직접 읽지 않는다. 읽기도 쓰기도 Apps Script 를 거치므로
// 시트 주소가 여기 없고, 시트를 비공개로 둘 수 있다.
// 배포 주소와 캐시는 store.js 가 갖고 있다.
const SHEET = "note";

const noteForm = document.getElementById("noteForm");
const noteText = document.getElementById("noteText");
const noteSubmit = document.getElementById("noteSubmit");
const noteList = document.getElementById("noteList");
const notesStatus = document.getElementById("notesStatus");

// gviz CSV는 모든 셀을 따옴표로 감싸므로 내용의 쉼표/따옴표까지 처리한다
function parseCsvRow(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function renderNotes(csv) {
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .map(parseCsvRow)
    .filter((r) => r[1] && r[2] && r[0] !== "created_at");

  noteList.innerHTML = "";

  if (rows.length === 0) {
    notesStatus.textContent = "아직 남긴 글이 없어요. 첫 글을 남겨보세요!";
    return;
  }

  notesStatus.textContent = "";
  rows.reverse(); // 최신 글이 위로

  for (const [time, name, message] of rows) {
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
    msg.textContent = message;

    li.append(meta, msg);
    noteList.append(li);
  }
}

async function loadNotes(quiet) {
  try {
    renderNotes(await fetchSheet(SHEET));
  } catch {
    // 캐시로 이미 글이 떠 있으면 굳이 실패를 알리지 않는다
    if (!quiet) notesStatus.textContent = "글을 불러오지 못했어요. 잠시 후 다시 열어주세요.";
  }
}

noteForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const message = noteText.value.trim();
  if (!message) return;

  const name = noteForm.elements.who.value;
  noteSubmit.disabled = true;
  notesStatus.textContent = "남기는 중...";

  try {
    // Apps Script는 CORS 응답을 안 주므로 no-cors로 보내고 응답은 확인하지 않는다
    await fetch(YUJU_API, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ name, message }),
    });
    noteText.value = "";
    notesStatus.textContent = "남겼어요!";
    setTimeout(loadNotes, 1500); // 시트 반영까지 약간 걸린다
  } catch {
    notesStatus.textContent = "전송에 실패했어요. 다시 시도해 주세요.";
  } finally {
    noteSubmit.disabled = false;
  }
});

// 홈에서 미리 받아뒀거나 지난번에 읽어둔 게 있으면 먼저 그린다. 이어지는 읽기가 덮는다
const cached = cachedSheet(SHEET);
if (cached) renderNotes(cached);
loadNotes(Boolean(cached));
