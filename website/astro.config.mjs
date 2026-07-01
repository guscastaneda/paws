import { defineConfig } from 'astro/config';

// Public marketing site for Paws on Longmeadow.
// Static output, deployed on Cloudflare Pages. The only backend touchpoint is the
// meet & greet lead form, which POSTs to the existing Worker /lead endpoint from the
// browser, so no SSR/adapter is needed here.
export default defineConfig({
  site: 'https://pawsonlongmeadow.com',
  output: 'static',
});
