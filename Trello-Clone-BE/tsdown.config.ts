import { defineConfig } from 'tsdown';

// Production bundle (ADR-015): dependencies stay external; @trello-clone/shared is inlined once it exists.
export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  // Emit dist/server.js (the package is "type": "module"), which `start` runs.
  fixedExtension: false,
  clean: true,
});
