import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: ['pg-native'],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
};

await build({ ...common, entryPoints: ['../../packages/db/src/cli.ts'], outfile: 'dist/bootstrap.js' });

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/index.js',
  sourcemap: true,
  external: ['pg-native'],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
console.log('worker bundled');
