import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    company: z.enum(['마이리얼트립', '큐텐테크놀로지', '위메프']),
    period: z.string().optional(),
    summary: z.string(),
    // 이력서에 들어가는 한 줄. 사내 용어 없이 무엇을 했고 결과가 어땠는지만 쓴다
    resume: z.string(),
    // 이 프로젝트에서 맡은 역할. 근거가 없으면 비워 둔다
    role: z.string().optional(),
    tech: z.array(z.string()).default([]),
    order: z.number(),
  }),
});

export const collections = { projects };
