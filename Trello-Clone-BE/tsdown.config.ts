import { defineConfig } from 'tsdown';

// Production bundle (ADR-015): dependencies stay external, except @trello-clone/shared, which
// ships TypeScript source (no build step) and so must be inlined for `node dist/server.js`.
export default defineConfig({
  deps: { alwaysBundle: ['@trello-clone/shared'] },
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  // Emit dist/server.js (the package is "type": "module"), which `start` runs.
  fixedExtension: false,
  clean: true,
});
