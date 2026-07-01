import { defineCollection, z } from 'astro:content';

// Data-driven content: add a service / testimonial / FAQ by adding a JSON entry,
// not by editing markup. Mirrors "Draft_Website content/01_site-structure.md" §4.

const services = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    order: z.number().default(0),
    status: z.enum(['bookable', 'by-request', 'coming-soon']),
    price: z.string().optional(), // shown only when present
    modifiers: z.array(z.string()).default([]),
    blurb: z.string(),
    icon: z.string(), // sprite id, e.g. "i-home"
  }),
});

const testimonials = defineCollection({
  type: 'data',
  schema: z.object({
    quote: z.string(),
    name: z.string(),
    service: z.string().optional(),
  }),
});

const faqs = defineCollection({
  type: 'data',
  schema: z.object({
    question: z.string(),
    answer: z.string(),
    group: z.string(),
    order: z.number().default(0),
  }),
});

export const collections = { services, testimonials, faqs };
