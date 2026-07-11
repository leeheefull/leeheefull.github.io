---
title: '제휴쇼핑몰 서비스 기술셋 전환'
company: '위메프'
period: '2023.01 - 2023.04'
summary: 'Node.js 서비스를 Kotlin Spring 멀티 모듈로 전환하고 테스트·문서화 체계 구축'
tech: ['Kotlin', 'Spring Boot', 'JPA', 'QueryDSL', 'Node Express', 'MySQL', 'Gradle', 'AWS']
order: 3
---

- 유지보수 어려움을 해결하기 위해 제휴 쇼핑몰 어드민/파트너 서비스를 Node.js에서 Kotlin Spring으로 기술 전환
- 모니터링을 위해 Logback 설정으로 로그를 CloudWatch에 쌓고, 이를 Grafana에서 시각화할 수 있도록 함
- 같은 도메인에 대해 API 레포와 Batch 레포가 나뉘어 중복 코드가 발생하고 유지보수가 어려웠던 구조를 멀티 모듈(Domain, API, Batch, Client)로 개선
- 테스트 코드 부재로 CI 단계에서 빌드가 불안정했던 문제를 RestDocs 도입으로 개선 — 통합 테스트 코드를 작성해야만 API 문서화가 가능하도록 구현
