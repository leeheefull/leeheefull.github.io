/* 중앙리프트 공통: 시트 DB 리더 + 헤더/푸터/플로팅 + 접수 API */
const SHEET_ID = "1yvQ5UoYWz0bkfnjzORmgiNy5E3w0DePHTJgE_GlBNxM";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
const WRITE_URL =
  "https://script.google.com/macros/s/AKfycby7L6nEDEA4LrQJS8PsQF6na9OCbA_ODxP35qQImgrTLV5PyXz1CNQHdJh73sgy2s171Q/exec";
const KAKAO_URL = "https://open.kakao.com/o/s6HZ5bYh";
const TEL = "031-998-6588";

// gviz CSV 파서 — 따옴표 안의 줄바꿈/쉼표/이스케이프 처리
function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur); cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  row.push(cur);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

async function readTable(name) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${name}`;
  const res = await fetch(url, { cache: "no-store" });
  const rows = parseCsv(await res.text());
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = (r[i] || "").trim(); });
    return o;
  });
}

async function readKv(name) {
  const rows = await readTable(name);
  const o = {};
  rows.forEach((r) => { o[r.key] = r.value || ""; });
  return o;
}

async function submitForm(payload) {
  await fetch(WRITE_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload),
  });
}

// SHA-256 해시 (비밀번호는 해시로만 저장/비교)
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 첨부파일 → base64 payload (합계 용량 제한)
async function encodeFiles(fileList, maxTotalMB) {
  const files = [...fileList].filter((f) => f.size > 0);
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > maxTotalMB * 1024 * 1024) {
    throw new Error(`첨부파일 용량은 총 ${maxTotalMB}MB 이하만 가능합니다.`);
  }
  return Promise.all(files.map((f) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: f.name, type: f.type || "application/octet-stream",
                           data: r.result.split(",")[1] });
    r.onerror = rej;
    r.readAsDataURL(f);
  })));
}

// 비밀글 게이트: 저장된 해시와 입력 비밀번호 비교
function renderSecretGate(container, passwordHash, onPass) {
  container.innerHTML = `
    <div class="secret-gate">
      <p>🔒 비밀글입니다. 비밀번호를 입력해주세요.</p>
      <div class="gate-row">
        <input type="password" id="gatePw" placeholder="비밀번호">
        <button class="btn" id="gateBtn">확인</button>
      </div>
      <p class="form-status" id="gateStatus"></p>
    </div>`;
  const check = async () => {
    const pw = container.querySelector("#gatePw").value;
    if (!pw) return;
    if (passwordHash && (await sha256(pw)) === passwordHash) {
      onPass();
    } else {
      container.querySelector("#gateStatus").textContent =
        passwordHash ? "비밀번호가 일치하지 않습니다." : "이 글은 열람할 수 없습니다.";
    }
  };
  container.querySelector("#gateBtn").addEventListener("click", check);
  container.querySelector("#gatePw").addEventListener("keydown", (e) => {
    if (e.key === "Enter") check();
  });
}

// 첨부파일 목록 렌더링
function renderFiles(urls) {
  const list = (urls || "").split("\n").filter(Boolean);
  if (!list.length) return "";
  return `<div class="file-list">` + list.map((u, i) => {
    const name = decodeURIComponent((u.split("|")[1] || `첨부파일 ${i + 1}`));
    const url = u.split("|")[0];
    return `<a href="${esc(url)}" target="_blank" rel="noopener">📎 ${esc(name)}</a>`;
  }).join("") + `</div>`;
}

function maskName(name) {
  if (!name) return "";
  if (name.includes("*")) return name;
  return name.length <= 1 ? name : name[0] + "*" + name.slice(2);
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function qs(key) {
  return new URLSearchParams(location.search).get(key);
}

// ── 공통 헤더/푸터/플로팅 ────────────────────────────────
function renderChrome() {
  document.querySelector("header.site").innerHTML = `
    <div class="util-bar">
      <div class="util-inner">
        <a href="tel:${TEL}">전화하기</a>
        <a href="${SHEET_URL}" target="_blank" rel="noopener">관리자</a>
      </div>
    </div>
    <div class="header-inner">
      <a class="logo" href="./"><img src="img/logo.png" alt="중앙리프트"></a>
      <nav class="gnb" id="gnb">
        <div>
          <a class="top" href="company.html">회사소개</a>
          <div class="sub">
            <a href="company.html">회사소개</a>
            <a href="map.html">오시는길</a>
          </div>
        </div>
        <div>
          <a class="top" href="gallery.html">제품소개</a>
          <div class="sub">
            <a href="gallery.html?ca=수직형 리프트게이트">수직형리프트게이트</a>
            <a href="gallery.html?ca=자동형 파워게이트">자동형파워게이트</a>
            <a href="gallery.html?ca=슬라이딩 게이트">슬라이딩 게이트</a>
            <a href="gallery.html?ca=특수형 리프트">특수형 리프트</a>
          </div>
        </div>
        <div><a class="top" href="notice.html">A/S신청</a></div>
        <div><a class="top" href="qa.html">견적문의</a></div>
      </nav>
      <button class="menu-toggle" id="menuToggle" aria-label="메뉴">☰</button>
    </div>`;
  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("gnb").classList.toggle("open");
  });

  // 우측 플로팅 버튼 (전화 / 카카오톡 / 상단으로)
  const floats = document.createElement("div");
  floats.className = "floats";
  floats.innerHTML = `
    <a class="f-tel" href="tel:${TEL}" aria-label="전화하기">📞</a>
    <a class="f-kakao" href="${KAKAO_URL}" target="_blank" rel="noopener" aria-label="카카오톡 문의">
      <svg viewBox="0 0 24 24" width="22" height="22"><path fill="#391b1b" d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.8-.8 2.8-.9 3.2 0 0-.02.2.1.28.12.07.26.02.26.02.35-.05 3.2-2.1 4.4-3 .47.07.96.1 1.44.1 5.5 0 10-3.6 10-8.1S17.5 3 12 3z"/></svg>
    </a>
    <button class="f-top" id="toTop" aria-label="상단으로">↑</button>`;
  document.body.append(floats);
  document.getElementById("toTop").addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }));

  document.querySelector("footer.site").innerHTML = `
    <div class="container">
      <div class="top-links">
        <a href="terms.html?id=privacy">개인정보 처리방침</a>
        <a href="terms.html?id=dismail">이메일 무단수집 거부</a>
        <a href="terms.html?id=provision">이용약관</a>
      </div>
      <div class="ft-body">
        <div>
          <img class="ft-logo" src="img/logo2.png" alt="중앙리프트">
          <p>중앙리프트 &nbsp; 대표 : 김경남<br>
          Tel : 031-998-6588 &nbsp; Fax : 031-998-8365 &nbsp; 이메일 : kmkm4939@hanmil.net<br>
          주소 : 경기도 김포시 고촌읍 신곡로 120<br>
          Copyright © 중앙리프트 All rights reserved.</p>
        </div>
        <a class="ft-login" href="${SHEET_URL}" target="_blank" rel="noopener">Login</a>
      </div>
    </div>`;
}

// 서브페이지 배너 + 탭 (각 페이지에서 호출)
function renderSubBanner(eng, kor, tabs) {
  const b = document.querySelector(".sub-banner");
  if (!b) return;
  b.innerHTML = `<h1>${eng}</h1><p>${kor}</p>`;
  if (tabs && tabs.length) {
    const bar = document.createElement("div");
    bar.className = "sub-tabs";
    bar.innerHTML = `<div class="container">` + tabs.map(([label, href, on]) =>
      `<a href="${href}" class="${on ? "on" : ""}">${label}</a>`).join("") + `</div>`;
    b.after(bar);
  }
}

document.addEventListener("DOMContentLoaded", renderChrome);
