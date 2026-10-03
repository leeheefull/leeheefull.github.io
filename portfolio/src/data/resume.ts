// 이력서에만 들어가는 내용. 프로젝트는 포트폴리오 글의 id로 가리키고,
// 이력서에는 무엇이 문제였고 무엇을 했고 결과가 어땠는지만 짧게 쓴다.
// 지원하는 곳에 맞춰 featured 순서만 바꿔 끼우면 된다.

export const summary = [
  '커머스·숙박 도메인에서 거래·가격·정산과 외부 공급사 연동을 맡아온 백엔드 개발자입니다.',
  '수수료·가격 체계처럼 여러 서비스에 걸친 변경을 무중단으로 전환하고, 그 결과를 거래액 같은 사업 지표로 확인하는 일을 해왔습니다.',
  '최근에는 AI 에이전트를 공급사 연동 개발에 도입해 연동 개발 기간을 최소 2개월에서 2주로 줄였습니다.',
];

/** 첫 화면에 크게 보이는 숫자. project 는 아래 featured 안의 id */
export const highlights = [
  { value: '+14.3%', label: '수수료를 올리고도 늘어난 거래액 (발효 2주)', project: 'mrt-minbak-commission-club' },
  { value: '2개월 → 2주', label: 'AI 파이프라인으로 줄인 공급사 연동 개발', project: 'mrt-cms-ai-pipeline' },
  { value: '3만 개 숙소', label: '연동 시스템을 서비스 중단 없이 이관', project: 'mrt-yanolja-migration' },
];

export interface FeaturedProject {
  /** 포트폴리오 글 id */
  id: string;
  /** 결과가 드러나는 제목 */
  title: string;
  problem: string;
  action: string;
  result: string;
}

export const featured: FeaturedProject[] = [
  {
    id: 'mrt-minbak-commission-club',
    title: '한인민박 수수료 개편 — 요율을 올리고도 거래액 +14.3%',
    problem:
      '연 거래액 약 410억 카테고리의 수수료를 10%에서 14%로 올리되 파트너 이탈은 막아야 했고, 약관 통지 일정상 7월 안에 시스템이 없으면 정책 자체가 발효될 수 없었음',
    action:
      '즉시확정 전환·낮은 취소율 숙소에 13%를 주는 판정 엔진 개발 — 월별 취소율 배치·API·알림이 같은 판정식을 쓰도록 통합. 처음 세운 BigQuery 연동 설계는 사전 검증으로 전제가 틀린 것을 확인하고 서비스 DB만으로 단순화',
    result:
      '기한 내 발효, 평균 수수료율 10.08% → 13.64%. 발효 2주 시점(1~15일 비교) 거래액 +14.3%·주문 +11.3%, 거래 숙소 수 유지. 신규 코드 장애 0건',
  },
  {
    id: 'mrt-cms-ai-pipeline',
    title: 'AI 기반 공급사 연동 파이프라인 — 연동 개발 2개월 → 2주',
    problem: '호텔 직계약 확대에 필요한 공급사(CMS) 연동이 건당 최소 2개월, 대부분이 스펙 분석·매핑·반복 코드 작성',
    action:
      '연동 문서를 스펙으로 변환해 매핑·코드 초안을 만드는 Claude Code 스킬 제작. AI 초안은 개발자 리팩토링 → 테스트 → 공급사 인증으로 검증하도록 사람이 붙는 단계를 고정하고, 연동 문서 270여 개를 재사용 자산으로 축적',
    result: '글로벌 공급사 DerbySoft 연동을 2주 개발로 완료, 인증 통과 후 운영 배포. 개발이 더 이상 연동 리드타임의 병목이 아니게 됨',
  },
  {
    id: 'mrt-commission-platform',
    title: '수수료 체계 전환 — 숙소 단위에서 상품 단위로, 4개 서비스 무중단',
    problem: '숙소 8천여 개 플랫폼이 숙소당 단일 요율만 지원해 상품별 차등 요율을 쓸 수 없었고, 정산 오류 문의의 원인이 됨',
    action:
      '전사 정산 플랫폼 연동과 장애 시 저장된 요율로 동작하는 fallback·알람, 정책 변경은 Kafka 이벤트로 동기화. 여행자·파트너·매니저·배치·공급사 전송까지 가격이 계산되는 모든 지점을 바꾸고 11단계 체크리스트로 나눠 배포',
    result: '서비스 중단 없이 전환, 배포 후 수수료 관련 장애 0건. 이후 상품별 차등 요율(한인민박 13%/14%)을 집행하는 기반이 됨',
  },
  {
    id: 'mrt-coupon-benefit',
    title: '쿠폰 플랫폼 연동과 장애 격리 — 1시간 내 핫픽스',
    problem: '숙소 목록·상세 가격에 주문 쿠폰이 빠져 실제 결제가보다 비싸게 노출',
    action:
      '숙소 전용 계산 로직을 전사 쿠폰 API로 교체하고 최저가 기준을 쿠폰 적용가로 변경. 연동 직후 장애에서 목록 1회 조회가 쿠폰 API를 2번 × 재시도 3회 호출해 부하를 키우는 구조를 찾아 제거하고, 서킷브레이커를 API 경로별 4개로 분리',
    result: '1시간 내 핫픽스, 쿠폰 장애가 숙박 서비스로 번지지 않는 구조 확보 — 같은 유형 재발 없음',
  },
  {
    id: 'mrt-yanolja-migration',
    title: '야놀자 연동 시스템 이관 — 국내 숙소 3만 개, 서비스 중단 없이',
    problem:
      '국내 숙소 약 3만 개가 연동된 야놀자 채널이 별도 레거시 서버에서 돌아, 다른 공급사 연동과 코드·인프라가 이원화돼 있었음',
    action:
      '배치 → 컨슈머(Kafka 브로커 포함) → 실시간 API 순으로 모듈을 나눠 이관하며 배치 조회 로직과 DB 커넥션 수를 최적화. 가격 변동 시 예약 실패 처리, 타임아웃 재시도의 중복 예약 방지로 예약 안정성 보강',
    result: '서비스 중단 없이 이관을 마치고 레거시 서버를 종료해 운영 포인트와 인프라 비용 절감. 이후 야놀자 연동 운영 전담',
  },
];

/** 대표 프로젝트 외에 회사별로 한 줄씩 보여줄 것. 나머지는 포트폴리오로 넘긴다 */
export const others: Record<string, string[]> = {
  마이리얼트립: ['mrt-lead-automation', 'mrt-hanin-minbak-integration', 'mrt-staynet-enhancement', 'mrt-hotelstory-cms'],
  큐텐테크놀로지: ['qten-overseas-hotel', 'qten-privacy-data-batch', 'qten-coupon-admin-integration'],
  위메프: ['wmp-nosql-cache-migration', 'wmp-affiliate-mall-tech-transition'],
};
