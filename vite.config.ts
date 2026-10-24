import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Keep static JSON and its consuming JS on the same release through Pages caches.
const dataHash=createHash('sha256');
dataHash.update(readFileSync(new URL('./public/data/map-study.json',import.meta.url)));
const dataVersion=dataHash.digest('hex').slice(0,20);

export default defineConfig(({ command, isPreview }) => ({
  define: { __FREMONT_MAP_VERSION__: JSON.stringify(dataVersion) },
  base: command === 'build' || isPreview ? '/fremontStreets/' : '/',
  // Keep original geographic sources in the repository; ship only map assets.
  publicDir: command === 'build' ? false : 'public',
  plugins: [{name:'map-study-static-assets',generateBundle(){
    for(const file of ['data/map-study.json','favicon.svg','.nojekyll'])this.emitFile({type:'asset',fileName:file,source:readFileSync(new URL(`./public/${file}`,import.meta.url))});
  }}],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'maplibre', test: /node_modules[\\/]maplibre-gl[\\/]/ },
          ],
        },
      },
    },
  },
}));
