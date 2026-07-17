---
title: '파트너 서비스 NoSQL Cache 기술 변경'
company: '위메프'
period: '2023.02 - 2023.03'
summary: 'Couchbase 만료에 따라 파트너 도메인 캐시 36만 건을 Redis로 무중단 이관'
tech: ['Java', 'Spring Boot', 'MyBatis', 'MySQL', 'Redis', 'Couchbase', 'Maven', 'Jenkins']
order: 2
---

```mermaid
flowchart LR
    A["Couchbase<br/>사용 기한 만료"] -->|"배치 이관 36만 건"| B["이중 적재 운영<br/>Couchbase + Redis"]
    B -->|"정합성 확인 후 기존 로직 제거"| C["Redis 단독 운영"]
```

## 배경

- 파트너 도메인 캐시로 쓰던 Couchbase의 사용 기한이 만료되어, 서비스 중단 없이 Redis로 캐시 저장소를 교체해야 했음

## 주요 작업

- 파트너 도메인 캐시의 Redis 이관 설계·구현
- 데이터 정합성을 위해 **Couchbase-Redis 이중 적재 기간**을 운영한 뒤 Couchbase 로직 제거하는 단계적 전환
- 기존 캐시 데이터 **약 36만 건**을 Redis로 옮기는 배치 구현, chunk size 조정으로 처리 효율 확보

## 성과

- 캐시 저장소 교체를 **서비스 중단·데이터 불일치 없이 완료**
- 단계적 이중 적재 전략으로 전환 기간 중에도 캐시 미스·정합성 이슈 없이 운영
