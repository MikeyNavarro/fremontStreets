import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Keep static JSON and its consuming JS on the same release through Pages caches.
const dataHash=createHash('sha256');
for(const file of ['roads.json','zones.json','study-network.json'])dataHash.update(readFileSync(new URL(`./public/data/${file}`,import.meta.url)));
const dataVersion=dataHash.digest('hex').slice(0,20);

export default defineConfig(({ command, isPreview }) => ({
  define: { __FREMONT_DATA_VERSION__: JSON.stringify(dataVersion) },
  base: command === 'build' || isPreview ? '/fremontStreets/' : '/',
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'maplibre', test: /node_modules[\\/]maplibre-gl[\\/]/ },
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
          ],
        },
      },
    },
  },
}));
