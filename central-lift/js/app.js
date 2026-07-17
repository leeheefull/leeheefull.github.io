/* 중앙리프트 공통: 시트 DB 리더 + 헤더/푸터 + 접수 API */
const SHEET_ID = "1yvQ5UoYWz0bkfnjzORmgiNy5E3w0DePHTJgE_GlBNxM";
const WRITE_URL =
  "https://script.google.com/macros/s/AKfycby7L6nEDEA4LrQJS8PsQF6na9OCbA_ODxP35qQImgrTLV5PyXz1CNQHdJh73sgy2s171Q/exec";

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

// 테이블(시트 탭)을 객체 배열로 읽는다
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

// key-value 시트(site, home)를 객체로
async function readKv(name) {
  const rows = await readTable(name);
  const o = {};
  rows.forEach((r) => { o[r.key] = r.value || ""; });
  return o;
}

// 접수 (Apps Script)
async function submitForm(payload) {
  await fetch(WRITE_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload),
  });
}

function maskName(name) {
  if (!name) return "";
  if (name.includes("*")) return name; // 이미 마스킹됨
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

// ── 공통 헤더/푸터 ──────────────────────────────────────
function renderChrome() {
  document.querySelector("header.site").innerHTML = `
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
          </div>
        </div>
        <div><a class="top" href="notice.html">A/S신청</a></div>
        <div><a class="top" href="qa.html">견적문의</a></div>
      </nav>
      <a class="tel-btn" href="tel:031-998-6588">📞 031-998-6588</a>
      <button class="menu-toggle" id="menuToggle" aria-label="메뉴">☰</button>
    </div>`;
  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("gnb").classList.toggle("open");
  });

  document.querySelector("footer.site").innerHTML = `
    <div class="container">
      <div class="top-links">
        <a href="terms.html?id=privacy">개인정보 처리방침</a>
        <a href="terms.html?id=dismail">이메일 무단수집 거부</a>
        <a href="terms.html?id=provision">이용약관</a>
      </div>
      <img class="ft-logo" src="img/logo2.png" alt="중앙리프트">
      <p>중앙리프트 &nbsp; 대표 : 김경남<br>
      Tel : 031-998-6588 &nbsp; Fax : 031-998-8365 &nbsp; 이메일 : kmkm4939@hanmil.net<br>
      주소 : 경기도 김포시 고촌읍 신곡로 120<br>
      Copyright © 중앙리프트 All rights reserved.</p>
    </div>`;
}

document.addEventListener("DOMContentLoaded", renderChrome);
