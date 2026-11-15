// Visual check of the 2D body: renders the real <BodySvg> to PNGs (via librsvg / sharp).
// Usage: npx vite-node scripts/render-body-check.tsx [out_dir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { BodySvg } from '../src/components/twin/BodySvg';
import type { Status, ZoneId } from '../src/brain/indicators';

// sharp is loaded through Node (not bundled by Vite).
const sharp = createRequire(path.join(process.cwd(), 'package.json'))('sharp');
const OUT = process.argv[2] ?? path.join(os.tmpdir(), 'organ-check');
const ROOT = process.cwd();
fs.mkdirSync(OUT, { recursive: true });

const CASES: Record<string, Partial<Record<ZoneId, Status>>> = {
  day18: { head: 'ACT', lungs: 'OK', abdomen: 'OK', heart: 'WATCH', body: 'ACT', dosimeter: 'OK', legs: 'WATCH' },
  all_ok: { head: 'OK', lungs: 'OK', abdomen: 'OK', heart: 'OK', body: 'OK', dosimeter: 'OK', legs: 'OK' },
  all_act: { head: 'ACT', lungs: 'ACT', abdomen: 'ACT', heart: 'ACT', body: 'ACT', dosimeter: 'ACT', legs: 'ACT' },
};

for (const [name, zoneStatus] of Object.entries(CASES)) {
  let svg = renderToStaticMarkup(<BodySvg zoneStatus={zoneStatus} />);
  svg = svg.slice(svg.indexOf('<svg'), svg.lastIndexOf('</svg>') + 6);
  svg = svg
    .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"')
    .replace(/viewBox="[^"]*"/, 'viewBox="132.3 73.3 1025.8 2258.3"')
    .replace(/href="\/src\/assets\/body\/([^"]+)"/g, (_, f) => `href="data:image/${f.endsWith('.gif') ? 'gif' : 'png'};base64,${fs.readFileSync(path.join(ROOT, 'src/assets/body', f)).toString('base64')}"`);
  const out = path.join(OUT, `body-${name}.png`);
  await sharp(Buffer.from(svg), { density: 72 }).resize({ height: 1100 }).flatten({ background: '#ffffff' }).png().toFile(out);
  console.log(out);
}
