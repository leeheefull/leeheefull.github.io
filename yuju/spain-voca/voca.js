const SHEET_ID = "104A_zVF_ECnkXugsAEqP5sTFCUII9UTMuSU2ditiLjo";
// spain-voca 탭, 1행은 헤더: spanish | korean | construction | fail count
const READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=spain-voca`;
// 오답 카운트 기록용 Apps Script 웹 앱. {action:"fail", spanish} 를 받는다.
const WRITE_URL =
  "https://script.google.com/macros/s/AKfycbyX55OCLmtAtFm6-YOsx6mwYkZpaQFMD_-Nl8gYlc3wdp9A5tkbSZqDqMwFyZXBesDm/exec";

const menuEl = document.getElementById("vocaMenu");
const quizEl = document.getElementById("vocaQuiz");
const resultEl = document.getElementById("vocaResult");
const statusEl = document.getElementById("vocaStatus");
const modeAllBtn = document.getElementById("modeAll");
const modeFailBtn = document.getElementById("modeFail");
const progressEl = document.getElementById("quizProgress");
const wordEl = document.getElementById("quizWord");
const hintEl = document.getElementById("quizHint");
const hintBtn = document.getElementById("hintBtn");
const optionsEl = document.getElementById("quizOptions");
const feedbackEl = document.getElementById("quizFeedback");
const nextBtn = document.getElementById("nextBtn");
const resultScoreEl = document.getElementById("resultScore");
const resultWrongEl = document.getElementById("resultWrong");
const retryBtn = document.getElementById("retryBtn");
const backToMenuBtn = document.getElementById("backToMenuBtn");

let words = [];
let quiz = null; // { mode, deck, index, correct, wrong: [word...] }

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
    const csv = await res.text();
    words = csv
      .trim()
      .split(/\r?\n/)
      .map(parseCsvRow)
      .filter((r) => r[0] && r[1] && r[0] !== "spanish")
      .map((r) => ({
        spanish: r[0],
        korean: r[1],
        construction: r[2] || "",
        fail: Number(r[3]) || 0,
      }));

    const failCount = words.filter((w) => w.fail > 0).length;
    statusEl.textContent = `총 ${words.length}개 단어 · 자주 틀린 단어 ${failCount}개`;
    modeAllBtn.disabled = false;
    modeFailBtn.disabled = failCount === 0;
  } catch {
    statusEl.textContent = "단어를 불러오지 못했어요. 잠시 후 다시 열어주세요.";
  }
}

function reportFail(spanish) {
  // Apps Script는 CORS 응답을 안 주므로 no-cors로 보내고 응답은 확인하지 않는다
  fetch(WRITE_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "fail", spanish }),
  }).catch(() => {});
}

function startQuiz(mode) {
  const pool = mode === "fail" ? words.filter((w) => w.fail > 0) : words;
  quiz = { mode, deck: shuffle(pool), index: 0, correct: 0, wrong: [] };
  menuEl.hidden = true;
  resultEl.hidden = true;
  quizEl.hidden = false;
  showQuestion();
}

function showQuestion() {
  const word = quiz.deck[quiz.index];

  progressEl.textContent = `${quiz.index + 1} / ${quiz.deck.length}`;
  wordEl.textContent = word.spanish;
  hintEl.textContent = word.construction;
  hintEl.hidden = true;
  hintBtn.hidden = !word.construction;
  feedbackEl.textContent = "";
  nextBtn.hidden = true;

  // 정답 1개 + 뜻이 겹치지 않는 오답 3개
  const distractors = shuffle(
    words.filter((w) => w.korean !== word.korean)
  ).slice(0, 3);
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
  if (nextBtn.hidden === false) return; // 이미 답을 고른 상태

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
    reportFail(word.spanish);
  }

  nextBtn.hidden = false;
  nextBtn.textContent = quiz.index + 1 < quiz.deck.length ? "다음 문제" : "결과 보기";
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
  quizEl.hidden = true;
  resultEl.hidden = false;
  resultScoreEl.textContent = `${quiz.deck.length}문제 중 ${quiz.correct}개 정답!`;

  resultWrongEl.innerHTML = "";
  for (const w of quiz.wrong) {
    const li = document.createElement("li");
    li.textContent = `${w.spanish} — ${w.korean}`;
    resultWrongEl.append(li);
  }
}

function backToMenu() {
  quizEl.hidden = true;
  resultEl.hidden = true;
  menuEl.hidden = false;
  const failCount = words.filter((w) => w.fail > 0).length;
  statusEl.textContent = `총 ${words.length}개 단어 · 자주 틀린 단어 ${failCount}개`;
  modeFailBtn.disabled = failCount === 0;
}

modeAllBtn.addEventListener("click", () => startQuiz("all"));
modeFailBtn.addEventListener("click", () => startQuiz("fail"));
hintBtn.addEventListener("click", () => {
  hintEl.hidden = false;
  hintBtn.hidden = true;
});
nextBtn.addEventListener("click", nextQuestion);
retryBtn.addEventListener("click", () => startQuiz(quiz.mode));
backToMenuBtn.addEventListener("click", backToMenu);

loadWords();
