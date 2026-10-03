// 이력서와 포트폴리오가 같이 쓰는 인적 사항·경력 데이터.
// 한쪽만 고쳐서 두 페이지 내용이 어긋나지 않도록 여기 한 곳에서 관리한다.

export type Company = '마이리얼트립' | '큐텐테크놀로지' | '위메프';

export const profile = {
  name: '이희찬',
  role: 'Backend Engineer',
  email: 'leeheefull@gmail.com',
};

export const skills = [
  { label: '언어', items: ['Kotlin', 'Java'] },
  { label: '백엔드', items: ['Spring Boot', 'Spring Batch', 'JPA', 'QueryDSL', 'MyBatis'] },
  { label: '데이터', items: ['MySQL', 'Elasticsearch', 'Redis', 'Kafka'] },
  { label: '인프라 · 도구', items: ['AWS', 'Jenkins', 'Gradle', 'Claude Code'] },
];

export interface Phase {
  company: Company;
  team: string;
  period: string;
  description: string;
  /** 이력서 연혁에 쓰는 한 줄 */
  summary: string;
  note?: string;
}

export interface Career {
  company: string;
  team?: string;
  period: string;
  description: string;
  /** 이력서 연혁에 쓰는 한 줄 */
  summary: string;
  /** 이 경력에 속한 프로젝트를 가져올 회사 이름 */
  projectsFrom?: Company;
  phases?: Phase[];
  /** 정규직 경력 연차 계산에 넣을 기간 [시작, 끝]. 끝이 없으면 현재까지 */
  span?: [string, string?];
}

export const careers: Career[] = [
  {
    company: '마이리얼트립',
    team: 'Stay실 · 숙박프로덕트팀',
    period: '2024.12 - 현재',
    description:
      '숙박 플랫폼 백엔드 개발 — 직계약 숙소 플랫폼(스테이넷)과 통합숙소 서비스를 중심으로 OTA/CMS 공급사 연동, 판매 정책·정산 체계 고도화를 담당. AI 에이전트를 연동 개발·영업 자동화 파이프라인에 도입해 팀의 업무 방식을 바꾸는 작업을 병행.',
    summary: '직계약 숙소 플랫폼의 공급사 연동, 판매 정책, 가격·수수료 체계',
    projectsFrom: '마이리얼트립',
    span: ['2024.12'],
  },
  {
    company: '위메프 · 큐텐테크놀로지',
    period: '2022.05 - 2024.09 (2년 4개월)',
    description: '위메프 입사 후 큐텐의 위메프 인수에 따라 큐텐테크놀로지로 전적, 연속 근무',
    summary: '위메프 입사 후 큐텐의 인수로 전적, 연속 근무',
    span: ['2022.05', '2024.09'],
    phases: [
      {
        company: '큐텐테크놀로지',
        team: '여행컬처개발그룹 · 백엔드개발팀',
        period: '2023.06 - 2024.09',
        description: '위메프 투어 서비스 관련 서버 개발',
        summary: '투어 서비스 — 해외호텔 판매 시스템 신규 개발, 대용량 데이터 배치',
        note: '위메프 인수에 따른 전적',
      },
      {
        company: '위메프',
        team: '플랫폼개발실 · 파트너개발팀',
        period: '2022.05 - 2023.06',
        description: '위메프 파트너 및 제휴쇼핑몰 서비스 관련 서버 개발',
        summary: '파트너·제휴쇼핑몰 서비스 — 캐시 저장소 이관, Node.js → Kotlin 전환',
      },
    ],
  },
  {
    company: '포시에스',
    team: 'R&D연구소 · 클라우드개발팀 (인턴)',
    period: '2021.09 - 2021.12',
    description: '이폼사인 전자계약 서비스 관련 서버 개발',
    summary: '전자계약 서비스(이폼사인) 서버 개발',
  },
];

export const education = [{ school: '한신대학교', major: '컴퓨터공학부' }];

export const certifications = [
  { name: '정보처리기사', issuer: '한국산업인력공단', date: '2021.06' },
];

const toMonths = (ym: string) => {
  const [y, m] = ym.split('.').map(Number);
  return y * 12 + (m - 1);
};

/** 인턴을 뺀 총 경력. 경력란의 "2년 4개월" 표기와 같은 방식(끝 월 - 시작 월)으로 센다 */
export function totalExperience(now = new Date()) {
  const nowYm = `${now.getFullYear()}.${now.getMonth() + 1}`;
  const months = careers
    .filter((c) => c.span)
    .reduce((sum, c) => {
      const [start, end = nowYm] = c.span!;
      return sum + toMonths(end) - toMonths(start);
    }, 0);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years}년 ${rest}개월` : `${years}년`;
}
