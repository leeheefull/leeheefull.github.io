---
title: '파트너 서비스 NoSQL Cache 기술 변경'
company: '위메프'
period: '2023.02 - 2023.03'
summary: 'Couchbase 만료에 따라 파트너 도메인 캐시 36만 건을 Redis로 무중단 이관'
tech: ['Java', 'Spring Boot', 'MyBatis', 'MySQL', 'Redis', 'Couchbase', 'Maven', 'Jenkins']
order: 2
---

- 기존 Couchbase의 사용 기한 만료에 따라 파트너 도메인 캐시를 Redis로 이관
- 데이터 정합성을 유지하기 위해 Couchbase와 Redis의 이중 적재 기간을 설정하고, 이후 Couchbase 로직을 제거
- 약 36만 건의 NoSQL 데이터를 Redis로 이관하기 위해 Batch 작업을 구현하고, 효율적인 처리를 위해 chunk size를 조정
