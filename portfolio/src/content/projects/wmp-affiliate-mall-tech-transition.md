---
title: '제휴쇼핑몰 서비스 기술셋 전환'
company: '위메프'
period: '2023.01 - 2023.04'
summary: 'Node.js 서비스를 Kotlin Spring 멀티 모듈로 전환하고 테스트·문서화 체계 구축'
tech: ['Kotlin', 'Spring Boot', 'JPA', 'QueryDSL', 'Node Express', 'MySQL', 'Gradle', 'AWS']
order: 3
---

## 배경

- 제휴쇼핑몰 어드민/파트너 서비스가 Node.js로 작성되어 팀 주력 스택과 달라 유지보수가 어려웠고, API 리포와 Batch 리포가 분리되어 같은 도메인 코드가 중복 관리되고 있었음
- 테스트 코드가 없어 CI 단계에서 빌드가 불안정한 문제도 함께 해결해야 했음

## 주요 작업

- 어드민/파트너 서비스를 **Node.js → Kotlin Spring**으로 전환
- 중복 코드가 발생하던 리포 구조를 **멀티 모듈(Domain / API / Batch / Client)** 로 재설계
- **RestDocs 도입** — 통합 테스트를 작성해야만 API 문서가 생성되는 구조로 만들어 테스트 작성을 강제
- Logback 로그를 CloudWatch에 적재하고 Grafana로 시각화하는 모니터링 체계 구성

## 성과

- 도메인 로직이 한 모듈로 모여 **중복 코드 제거와 유지보수성 개선**
- 테스트-문서화가 묶인 구조 덕분에 CI 빌드 안정성과 API 문서 최신성을 동시에 확보
