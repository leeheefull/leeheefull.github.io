import { defineConfig } from 'astro/config';

// 이력서(/resume)와 포트폴리오(/portfolio)를 한 빌드에서 함께 낸다.
// 경로는 src/pages 아래 폴더 이름이 그대로 주소가 된다.
export default defineConfig({
  site: 'https://leeheefull.github.io',
});
