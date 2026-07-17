---
title: 'AI 기반 CMS 연동 자동화 파이프라인 구축'
company: '마이리얼트립'
period: '2026.02 - 2026.05'
summary: '신규 숙소 공급사(CMS) 연동 과정을 AI 파이프라인으로 재설계 — 글로벌 CMS DerbySoft를 문서 자동 변환 → AI 코드 생성 → 검증 → Certification까지 완주, 이후 연동부터 재사용 가능한 방법론으로 정착'
tech: ['Kotlin', 'Spring Boot', 'Kafka', 'MySQL', 'Claude Code', 'AI Agent']
order: 4
---

## 배경

- 직계약 숙소를 늘리려면 호텔이 이미 쓰고 있는 CMS(Channel Management System)와의 연동이 필수인데, 공급사마다 스펙 문서·인증 절차가 달라 연동 1건당 개발 기간이 길고 반복 작업이 많았음
- 신규 글로벌 CMS인 DerbySoft 연동을 진행하면서, "이번 한 건"이 아니라 **연동 방법론 자체를 자동화**하는 것을 목표로 설정 (에픽 리드)

## 주요 작업

- 연동 프로세스를 **문서 수집·Markdown 변환 → AI 데이터 매핑 → AI 코드 생성 → 개발자 리팩토링 → 테스트 검증 → Certification → 운영 배포** 파이프라인으로 재설계
- 공급사 연동 문서를 크롤링해 Markdown 스펙으로 변환하고, 이를 기반으로 도메인 모델 매핑과 연동 코드 초안을 생성하는 Claude Code Skill 제작
- Daily Push vs LOS Push, minStayThrough vs minStayArrival 등 스펙 차이를 정리해 벤더와 영문으로 직접 협의, VCC(가상카드) 결제 정보 전송 구현
- 파트너/매니저 어드민에 공급사 매핑·CMS 코드 관리 기능 추가 (React)
- 연동 스펙 문서 저장소를 신설해 TravelgateX, Temairazu 등 후속 공급사 문서를 같은 형식으로 축적

## 성과

- DerbySoft **Certification 통과 후 운영 배포 완료** — 해외 직계약 숙소의 재고·요금·예약을 실시간 연동
- 사람이 하던 스펙 분석·매핑·보일러플레이트 작성을 AI로 대체해 **CMS 연동 리드타임을 단축**하고, 세 번째 공급사(Vendit)부터는 동일 파이프라인을 그대로 재적용
- 1회성 연동 개발이 아닌 **재사용 가능한 연동 자동화 방법론**을 팀 자산으로 정착시킴
