const SHEET_ID = "104A_zVF_ECnkXugsAEqP5sTFCUII9UTMuSU2ditiLjo";
// spain-voca 탭, 1행은 헤더: book name | chapter | spanish | korean | construction | fail count
const READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=spain-voca`;
// 오답 카운트 기록용 Apps Script 웹 앱. {action:"fail", spanish} 를 받는다.
const WRITE_URL =
  "https://script.google.com/macros/s/AKfycbxpcZsBqHbpU4jvnnIQ37wHaOuYfj2lHabQLGE4QvQaiuvFvfv-kJTq2bxiBZ6ASCng/exec";

const menuEl = document.getElementById("vocaMenu");
const unitsEl = document.getElementById("vocaUnits");
const quizEl = document.getElementById("vocaQuiz");
const resultEl = document.getElementById("vocaResult");
const statusEl = document.getElementById("vocaStatus");
const modeAllBtn = document.getElementById("modeAll");
const modeFailBtn = document.getElementById("modeFail");
const bookListEl = document.getElementById("bookList");
const unitsTitleEl = document.getElementById("unitsTitle");
const bookRandomBtn = document.getElementById("bookRandomBtn");
const unitGridEl = document.getElementById("unitGrid");
const unitsBackBtn = document.getElementById("unitsBackBtn");
const progressEl = document.getElementById("quizProgress");
const scopeEl = document.getElementById("quizScope");
const failBadgeEl = document.getElementById("failBadge");
const wordEl = document.getElementById("quizWord");
const hintEl = document.getElementById("quizHint");
const hintBtn = document.getElementById("hintBtn");
const optionsEl = document.getElementById("quizOptions");
const feedbackEl = document.getElementById("quizFeedback");
const nextBtn = document.getElementById("nextBtn");
const quizBackBtn = document.getElementById("quizBackBtn");
const resultScoreEl = document.getElementById("resultScore");
const resultWrongEl = document.getElementById("resultWrong");
const retryBtn = document.getElementById("retryBtn");
const backToMenuBtn = document.getElementById("backToMenuBtn");

let words = [];
let currentBook = null;
let quiz = null; // { scope: {mode:"all"|"fail"|"unit", book?, unit?}, deck, index, correct, wrong: [word...] }

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

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadWords() {
  try {
    const res = await fetch(READ_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    words = csv
      .trim()
      .split(/\r?\n/)
      .map(parseCsvRow)
      .filter((r) => r[0] && r[2] && r[3] && r[2] !== "spanish")
      .map((r) => ({
        book: r[0],
        unit: Number(r[1]) || 0,
        spanish: r[2],
        korean: r[3],
        construction: r[4] || "",
        fail: Number(r[5]) || 0,
      }));
    if (words.length === 0) throw new Error("empty sheet");

    renderMenu();
  } catch {
    statusEl.textContent = "단어를 불러오지 못했어요. 잠시 후 다시 열어주세요.";
  }
}

function failCount() {
  return words.filter((w) => w.fail > 0).length;
}

// 시트 등장 순서를 유지하며 book -> unit -> 단어 수 로 묶는다
function groupBooks() {
  const books = new Map();
  for (const w of words) {
    if (!books.has(w.book)) books.set(w.book, new Map());
    const units = books.get(w.book);
    units.set(w.unit, (units.get(w.unit) || 0) + 1);
  }
  return books;
}

function renderMenu() {
  statusEl.textContent = `총 ${words.length}개 단어 · 자주 틀린 단어 ${failCount()}개`;
  modeAllBtn.disabled = words.length === 0;
  modeFailBtn.disabled = failCount() === 0;

  bookListEl.innerHTML = "";
  for (const [book, units] of groupBooks()) {
    const wordTotal = [...units.values()].reduce((a, b) => a + b, 0);
    const unitNums = [...units.keys()];
    const btn = document.createElement("button");
    btn.className = "voca-book";
    const label = document.createElement("span");
    const title = document.createElement("span");
    title.className = "book-title";
    title.textContent = `📖 ${book}`;
    const meta = document.createElement("span");
    meta.className = "book-meta";
    meta.textContent = `unit ${Math.min(...unitNums)}~${Math.max(...unitNums)} · ${wordTotal}단어`;
    label.append(title, meta);
    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = "›";
    btn.append(label, chevron);
    btn.addEventListener("click", () => showUnits(book));
    bookListEl.append(btn);
  }
}

function showScreen(screen) {
  menuEl.hidden = screen !== "menu";
  unitsEl.hidden = screen !== "units";
  quizEl.hidden = screen !== "quiz";
  resultEl.hidden = screen !== "result";
}

function showUnits(book) {
  currentBook = book;
  unitsTitleEl.textContent = book;

  const units = groupBooks().get(book) || new Map();
  const wordTotal = [...units.values()].reduce((a, b) => a + b, 0);
  bookRandomBtn.textContent = `🎲 이 책 전체 랜덤 (${wordTotal}단어)`;

  unitGridEl.innerHTML = "";
  for (const unit of [...units.keys()].sort((a, b) => a - b)) {
    const btn = document.createElement("button");
    btn.className = "unit-btn";
    const num = document.createElement("span");
    num.textContent = unit;
    const count = document.createElement("small");
    count.textContent = `${units.get(unit)}단어`;
    btn.append(num, count);
    btn.addEventListener("click", () => startQuiz({ mode: "unit", book, unit }));
    unitGridEl.append(btn);
  }
  showScreen("units");
}

function scopeLabel(scope) {
  if (scope.mode === "all") return "전체 랜덤";
  if (scope.mode === "fail") return "틀린 문제";
  if (scope.mode === "book") return "책 전체 랜덤";
  return `unit ${scope.unit}`;
}

function buildDeck(scope) {
  if (scope.mode === "all") return words;
  if (scope.mode === "fail") return words.filter((w) => w.fail > 0);
  if (scope.mode === "book") return words.filter((w) => w.book === scope.book);
  return words.filter((w) => w.book === scope.book && w.unit === scope.unit);
}

function startQuiz(scope) {
  const deck = shuffle(buildDeck(scope));
  if (deck.length === 0) return;
  quiz = { scope, deck, index: 0, correct: 0, wrong: [] };
  quizBackBtn.textContent = scope.book ? "← unit 선택으로" : "← 처음으로";
  showScreen("quiz");
  showQuestion();
}

function showQuestion() {
  const word = quiz.deck[quiz.index];

  scopeEl.textContent = scopeLabel(quiz.scope);
  progressEl.querySelector("#quizNo").textContent = `${quiz.index + 1} / ${quiz.deck.length}`;
  failBadgeEl.textContent = `${word.fail}번 틀렸어요`;
  failBadgeEl.hidden = word.fail === 0;
  wordEl.textContent = word.spanish;
  hintEl.textContent = word.construction;
  hintEl.hidden = true;
  hintBtn.hidden = !word.construction;
  feedbackEl.textContent = "";
  // display:none 이 아니라 visibility 로 숨겨 자리를 유지한다
  // (다음 문제 더블탭 시 아래의 뒤로가기 버튼이 그 자리로 올라오는 사고 방지)
  nextBtn.classList.add("hold");

  // 정답 1개 + 오답 3개. 보기끼리도 뜻이 겹치지 않게 고른다.
  // 책이 정해진 스코프면 그 책 안에서만 뽑는다 — 책마다 뜻 표기 형식이 달라서
  // 섞이면 뜻이 아니라 생김새로 정답을 골라낼 수 있다
  const pool = quiz.scope.book ? words.filter((w) => w.book === quiz.scope.book) : words;
  const seen = new Set([word.korean]);
  const distractors = [];
  for (const w of shuffle(pool)) {
    if (seen.has(w.korean)) continue;
    seen.add(w.korean);
    distractors.push(w);
    if (distractors.length === 3) break;
  }
  const options = shuffle([word, ...distractors]);

  optionsEl.innerHTML = "";
  for (const opt of options) {
    const btn = document.createElement("button");
    btn.className = "voca-option";
    btn.textContent = opt.korean;
    btn.addEventListener("click", () => answer(btn, opt, word));
    optionsEl.append(btn);
  }
}

function answer(btn, picked, word) {
  if (!nextBtn.classList.contains("hold")) return; // 이미 답을 고른 상태

  const isCorrect = picked.korean === word.korean;
  for (const b of optionsEl.children) {
    b.disabled = true;
    if (b.textContent === word.korean) b.classList.add("correct");
  }

  if (isCorrect) {
    quiz.correct++;
    feedbackEl.textContent = "정답이에요! 🎉";
  } else {
    btn.classList.add("wrong");
    feedbackEl.textContent = `아쉬워요! 정답은 "${word.korean}"`;
    word.fail++;
    quiz.wrong.push(word);
    reportFail(word);
  }

  nextBtn.classList.remove("hold");
  nextBtn.textContent = quiz.index + 1 < quiz.deck.length ? "다음 문제" : "결과 보기";
}

function reportFail(word) {
  // Apps Script는 CORS 응답을 안 주므로 no-cors로 보내고 응답은 확인하지 않는다
  fetch(WRITE_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    // 두 책에 같은 스페인어 단어가 있어서 book 없이는 엉뚱한 행의 카운트가 올라간다
    body: JSON.stringify({ action: "fail", spanish: word.spanish, book: word.book }),
  }).catch(() => {});
}

function nextQuestion() {
  quiz.index++;
  if (quiz.index < quiz.deck.length) {
    showQuestion();
  } else {
    showResult();
  }
}

function showResult() {
  showScreen("result");
  resultScoreEl.textContent = `${quiz.deck.length}문제 중 ${quiz.correct}개 정답!`;

  resultWrongEl.innerHTML = "";
  for (const w of quiz.wrong) {
    const li = document.createElement("li");
    li.textContent = `${w.spanish} — ${w.korean}`;
    resultWrongEl.append(li);
  }
}

function backToMenu() {
  renderMenu();
  showScreen("menu");
}

function leaveQuiz() {
  // 중간에 나가도 푼 데까지는 결과로 보여준다 (특히 900문제 전체 랜덤용)
  const answered = !nextBtn.classList.contains("hold");
  const answeredCount = quiz.index + (answered ? 1 : 0);
  if (answeredCount > 0) {
    quiz.deck = quiz.deck.slice(0, answeredCount);
    showResult();
  } else if (quiz.scope.book) {
    showUnits(quiz.scope.book);
  } else {
    backToMenu();
  }
}

modeAllBtn.addEventListener("click", () => startQuiz({ mode: "all" }));
modeFailBtn.addEventListener("click", () => startQuiz({ mode: "fail" }));
bookRandomBtn.addEventListener("click", () => startQuiz({ mode: "book", book: currentBook }));
unitsBackBtn.addEventListener("click", backToMenu);
quizBackBtn.addEventListener("click", leaveQuiz);
hintBtn.addEventListener("click", () => {
  hintEl.hidden = false;
  hintBtn.hidden = true;
});
nextBtn.addEventListener("click", nextQuestion);
retryBtn.addEventListener("click", () => startQuiz(quiz.scope));
backToMenuBtn.addEventListener("click", backToMenu);

loadWords();
