import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    company: z.enum(['마이리얼트립', '큐텐테크놀로지', '위메프']),
    period: z.string().optional(),
    summary: z.string(),
    tech: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    order: z.number(),
  }),
});

export const collections = { projects };
