// @ts-check
import { defineConfig } from 'astro/config';
import csp from './src/shared/csp-integration.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://bobbyphtr.github.io',
  integrations: [csp()],
});