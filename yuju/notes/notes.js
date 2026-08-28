const SHEET_ID = "104A_zVF_ECnkXugsAEqP5sTFCUII9UTMuSU2ditiLjo";
// note 탭이 테이블, 1행은 헤더: created_at | name | message
const READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=note`;
// 글쓰기 API: 시트에 붙은 Apps Script 웹 앱 URL. 비어 있으면 글쓰기가 잠긴다.
const WRITE_URL =
  "https://script.google.com/macros/s/AKfycbzJmNhmQAn3Uktj32YTIaMTXM7ZFwoQETlpZhuOhi-PZcQf55H33VNp6NfkwGwS4Ek/exec";

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

async function loadNotes() {
  try {
    const res = await fetch(READ_URL, { cache: "no-store" });
    renderNotes(await res.text());
  } catch {
    notesStatus.textContent = "글을 불러오지 못했어요. 잠시 후 다시 열어주세요.";
  }
}

noteForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const message = noteText.value.trim();
  if (!message) return;

  if (!WRITE_URL) {
    notesStatus.textContent = "글쓰기는 아직 준비 중이에요!";
    return;
  }

  const name = noteForm.elements.who.value;
  noteSubmit.disabled = true;
  notesStatus.textContent = "남기는 중...";

  try {
    // Apps Script는 CORS 응답을 안 주므로 no-cors로 보내고 응답은 확인하지 않는다
    await fetch(WRITE_URL, {
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

loadNotes();
