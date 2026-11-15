// Build public/models/anatomy.glb from BodyParts3D OBJ elements (see extract-bp3d.py).
// Usage: node scripts/build-anatomy.mjs <extracted_dir>
// Output: public/models/anatomy.glb + src/components/twin/anatomyAnchors.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO, PropertyType } from '@gltf-transform/core';
import { KHRDracoMeshCompression, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { weld, simplifyPrimitive, draco, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

const SRC = process.argv[2];
if (!SRC) throw new Error('Usage: node scripts/build-anatomy.mjs <extracted_dir> (see anatomy-sources.md)');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
for (const group of ['lung_right', 'lung_left']) {
  if (manifest[group]?.source !== 'v3') throw new Error(`${group}: complete v3 lung lobes are required; rerun extraction`);
}

// Target triangle budget per group (detail where it matters, small file overall).
const BUDGET = {
  skin: 90000,
  brain: 60000,
  heart: 40000,
  lung_right: 40000,
  lung_left: 40000,
  lung_airways: 10000,
  liver: 30000,
  stomach: 15000,
  leg_bones: 40000,
  leg_muscles: 90000,
};

// Runtime applies health-status colors; distinct neutral materials keep adjacent organs legible.
const FILL = [0.902, 0.902, 0.89, 1];
const LINE = [0.604, 0.604, 0.588, 1];
const MATERIALS = {
  skin: { color: [0.84, 0.84, 0.82, 0.03], blend: true },
  brain: { color: FILL },
  heart: { color: FILL }, // one solid color (no outline)
  lungs: { color: FILL },
  lung_airways: { color: [0.62, 0.65, 0.65, 1] },
  liver: { color: [0.72, 0.72, 0.70, 1] },
  stomach: { color: [0.84, 0.84, 0.81, 1] },
  legs_bone: { color: FILL },
  legs_muscle: { color: FILL },
  dosimeter: { color: [0.35, 0.35, 0.35, 1] },
  // Only the body frame uses a front-view ribbon; Explore hides it when the camera rotates.
  skin_outline: { color: LINE, outline: true },
};

// ---------------------------------------------------------------- OBJ parsing
function readObj(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const v = [];
  const f = [];
  for (const line of txt.split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/);
      v.push(+p[1], +p[2], +p[3]);
    } else if (line.startsWith('f ')) {
      const p = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t.split('/')[0], 10));
      for (let i = 1; i + 1 < p.length; i++) f.push(p[0], p[i], p[i + 1]);
    }
  }
  const nv = v.length / 3;
  const indices = f.map((i) => (i < 0 ? nv + i : i - 1));
  if (!nv || !indices.length || v.some((x) => !Number.isFinite(x)) || indices.some((i) => !Number.isInteger(i) || i < 0 || i >= nv)) {
    throw new Error(`Invalid or empty OBJ geometry: ${file}`);
  }
  return { v, f: indices };
}

const raw = {};
for (const [g, spec] of Object.entries(manifest)) {
  if (!MATERIALS[spec.material] || !spec.elements?.length || spec.missing?.length) {
    throw new Error(`Incomplete anatomical group: ${g}; rerun extract-bp3d.py`);
  }
  const pos = [];
  const idx = [];
  for (const fj of spec.elements) {
    const { v, f } = readObj(path.join(SRC, g, fj + '.obj'));
    const base = pos.length / 3;
    for (let i = 0; i < v.length; i++) pos.push(v[i]);
    for (const i of f) idx.push(i + base);
  }
  raw[g] = { pos, idx, material: spec.material };
  console.log(`${g}: ${spec.elements.length} elements, ${pos.length / 3} verts, ${idx.length / 3} tris`);
}

// ---------------------------------------------------------------- orientation
const axisExtent = (p, a) => {
  let lo = Infinity, hi = -Infinity;
  for (let i = a; i < p.length; i += 3) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); }
  return [lo, hi];
};
const centroid = (p) => {
  const c = [0, 0, 0];
  for (let i = 0; i < p.length; i += 3) { c[0] += p[i]; c[1] += p[i + 1]; c[2] += p[i + 2]; }
  return c.map((x) => x / (p.length / 3));
};
const skin = raw.skin.pos;
const ext = [0, 1, 2].map((a) => axisExtent(skin, a));
const upAxis = ext.map((e) => e[1] - e[0]).indexOf(Math.max(...ext.map((e) => e[1] - e[0])));
const brainC = centroid(raw.brain.pos);
const upSign = brainC[upAxis] > (ext[upAxis][0] + ext[upAxis][1]) / 2 ? 1 : -1;
const footLevel = upSign > 0 ? ext[upAxis][0] : ext[upAxis][1];
const h = ext[upAxis][1] - ext[upAxis][0];
// Front: toes point forward. Compare the sole (lowest 3 %) with the shins (15–25 % height).
const others = [0, 1, 2].filter((a) => a !== upAxis);
let frontAxis = others[0], frontSign = 1, best = 0;
for (const a of others) {
  let sole = 0, ns = 0, shin = 0, nh = 0;
  for (let i = 0; i < skin.length; i += 3) {
    const t = Math.abs(skin[i + upAxis] - footLevel) / h;
    if (t < 0.03) { sole += skin[i + a]; ns++; } else if (t > 0.15 && t < 0.25) { shin += skin[i + a]; nh++; }
  }
  const d = sole / ns - shin / nh;
  if (Math.abs(d) > Math.abs(best)) { best = d; frontAxis = a; frontSign = Math.sign(d); }
}
const unit = (a, s) => [0, 1, 2].map((i) => (i === a ? s : 0));
const ey = unit(upAxis, upSign);
const ez = unit(frontAxis, frontSign);
const ex = [ey[1] * ez[2] - ey[2] * ez[1], ey[2] * ez[0] - ey[0] * ez[2], ey[0] * ez[1] - ey[1] * ez[0]];
const center = [0, 1, 2].map((a) => (ext[a][0] + ext[a][1]) / 2);
const MM = 0.001;
const tf = (x, y, z) => {
  const d = [x - center[0], y - center[1], z - center[2]];
  const dot = (e) => e[0] * d[0] + e[1] * d[1] + e[2] * d[2];
  return [dot(ex) * MM, (dot(ey) + h / 2) * MM, dot(ez) * MM]; // feet at y = 0
};
console.log(`up axis ${upAxis}${upSign > 0 ? '+' : '-'}, front axis ${frontAxis}${frontSign > 0 ? '+' : '-'}, height ${(h * MM).toFixed(3)} m`);

for (const g of Object.values(raw)) {
  const out = new Float32Array(g.pos.length);
  for (let i = 0; i < g.pos.length; i += 3) out.set(tf(g.pos[i], g.pos[i + 1], g.pos[i + 2]), i);
  g.out = out;
}
const lungL = centroid(Array.from(raw.lung_left.out));
const lungR = centroid(Array.from(raw.lung_right.out));
console.log(`left lung x ${lungL[0].toFixed(3)} (expect > 0), right lung x ${lungR[0].toFixed(3)} (expect < 0)`);
if (!(lungL[0] > 0 && lungR[0] < 0)) throw new Error('Unexpected handedness: astronaut left must be at +X');

// ---------------------------------------------------------------- anchors (organ points, metres)
// The camera is locked to the front view, so anchor heights are chosen inside each organ to
// spread the leader lines vertically (short 45-degree segments, no crossings).
const C = (g) => centroid(Array.from(raw[g].out));
const skinOut = raw.skin.out;
/** Mean point of an organ's vertices in a horizontal slice at fraction t of its height. */
const slice = (g, t, side = 0, tol = 0.012) => {
  const p = raw[g].out;
  const by = axisExtent(p, 1);
  const y = by[0] + (by[1] - by[0]) * t;
  const acc = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < p.length; i += 3) {
    if (Math.abs(p[i + 1] - y) > tol) continue;
    if (side && Math.sign(p[i]) !== side) continue;
    acc[0] += p[i]; acc[1] += p[i + 1]; acc[2] += p[i + 2]; n++;
  }
  if (!n) throw new Error(`${g}: cannot place anatomical anchor at slice ${t}`);
  return acc.map((v) => v / n);
};
/** Keep the hotspot on the actual anterior lung surface, not inside a bronchial tree. */
const frontPoint = (g, fraction) => {
  const point = slice(g, fraction);
  let front = -Infinity;
  const p = raw[g].out;
  for (let i = 0; i < p.length; i += 3) {
    if (Math.abs(p[i] - point[0]) < 0.012 && Math.abs(p[i + 1] - point[1]) < 0.012) front = Math.max(front, p[i + 2]);
  }
  if (!Number.isFinite(front)) throw new Error(`${g}: missing front surface for hotspot`);
  return [point[0], point[1], front + 0.003];
};
const skinAt = (y, side, tol = 0.01) => {
  let bestX = side > 0 ? -Infinity : Infinity, z = 0;
  for (let i = 0; i < skinOut.length; i += 3) {
    if (Math.abs(skinOut[i + 1] - y) > tol) continue;
    const x = skinOut[i];
    if (side > 0 ? x > bestX : x < bestX) { bestX = x; z = skinOut[i + 2]; }
  }
  return [bestX, y, z];
};
const heartC = C('heart');
const bodyAnchor = skinAt(heartC[1] - 0.36, +1); // outer edge of the left wrist
bodyAnchor[0] -= 0.003;
const anchors = {
  head: slice('brain', 0.72, -1),
  lungs: frontPoint('lung_right', 0.72),
  abdomen: slice('liver', 0.06),
  // Fixed to the existing chest surface; revising lung geometry must not move the badge.
  dosimeter: [0.08, 1.4191, 0.0534],
  heart: slice('heart', 0.15),
  body: bodyAnchor,
  legs: slice('leg_muscles', 0.42, +1),
};

// ---------------------------------------------------------------- outlines (front-view silhouettes)
// Rasterize a mesh's front projection, trace the outer contour of every connected part and build
// a thin flat ribbon around it at depth z. With the front-locked camera this reads as an outline.
function silhouetteRibbon(p, idx, { cell = 0.002, width = 0.0035, z = 0, minCells = 40, label = '' } = {}) {
  const bx = axisExtent(p, 0), by = axisExtent(p, 1);
  const x0 = bx[0] - 4 * cell, y0 = by[0] - 4 * cell;
  const W = Math.ceil((bx[1] - bx[0]) / cell) + 9, H = Math.ceil((by[1] - by[0]) / cell) + 9;
  const grid = new Uint8Array(W * H);
  const P = (i) => [(p[3 * i] - x0) / cell, (p[3 * i + 1] - y0) / cell];
  for (let t = 0; t < idx.length; t += 3) {
    const a = P(idx[t]), b = P(idx[t + 1]), c = P(idx[t + 2]);
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
        const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
        if (w0 >= -0.02 && w1 >= -0.02 && w0 + w1 <= 1.02) grid[y * W + x] = 1;
      }
  }
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] === 1;
  const seen = new Uint8Array(W * H);
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const pos = [], ind = [];
  let contours = 0;
  for (let start = 0; start < grid.length; start++) {
    if (!grid[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let size = 0;
    while (stack.length) {
      const i = stack.pop(); size++;
      const x = i % W, y = (i - x) / W;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (at(nx, ny) && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (size < minCells) continue;
    const sx = start % W, sy = (start - sx) / W;
    let cx = sx, cy = sy, d = 6;
    const pts = [];
    for (let guard = 0; guard < 4 * size + 16; guard++) {
      pts.push([cx, cy]);
      let found = false;
      for (let k = 0; k < 8; k++) {
        const nd = (d + 6 + k) % 8;
        const nx = cx + dirs[nd][0], ny = cy + dirs[nd][1];
        if (at(nx, ny)) { cx = nx; cy = ny; d = nd; found = true; break; }
      }
      if (!found || (cx === sx && cy === sy && pts.length > 2)) break;
    }
    if (pts.length < 8) continue;
    const n = pts.length, k = 3;
    const sm = pts.map((_, i) => {
      let ax = 0, ay = 0;
      for (let j = -k; j <= k; j++) { const q = pts[(i + j + n) % n]; ax += q[0]; ay += q[1]; }
      return [x0 + (ax / (2 * k + 1) + 0.5) * cell, y0 + (ay / (2 * k + 1) + 0.5) * cell];
    });
    const line = [sm[0]];
    for (const q of sm) { const l = line[line.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) >= cell * 1.5) line.push(q); }
    const m = line.length;
    const base = pos.length / 3;
    for (let i = 0; i < m; i++) {
      const a = line[(i - 1 + m) % m], b = line[(i + 1) % m];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
      const [x, y] = line[i];
      pos.push(x + (nx * width) / 2, y + (ny * width) / 2, z, x - (nx * width) / 2, y - (ny * width) / 2, z);
      const j = (i + 1) % m;
      ind.push(base + 2 * i, base + 2 * i + 1, base + 2 * j, base + 2 * j, base + 2 * i + 1, base + 2 * j + 1);
    }
    contours++;
  }
  console.log(`${label}: ${contours} contour(s), grid ${W}x${H}`);
  return { pos: new Float32Array(pos), ind };
}
/** Outline ribbon for a set of groups, placed just in front of their front-most point. */
function outlineFor(groups, material, opts = {}) {
  const p = [], idx = [];
  for (const g of groups) {
    const base = p.length / 3;
    for (const v of raw[g].out) p.push(v);
    for (const i of raw[g].idx) idx.push(base + i);
  }
  const z = opts.z ?? axisExtent(p, 2)[1] + 0.003;
  const r = silhouetteRibbon(p, idx, { ...opts, z, label: material });
  raw[material] = { out: r.pos, idx: r.ind, material };
}
outlineFor(['skin'], 'skin_outline', { z: 0, width: 0.0045 });

// ---------------------------------------------------------------- glTF document
const doc = new Document();
doc.getRoot().getAsset().copyright = 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International';
doc.getRoot().setExtras({
  anatomySources: {
    database: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/',
    lungLobes: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/BodyParts3D_3.0_obj_99.zip',
    remainingAnatomy: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip',
    license: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
    originalObjNotices: [
      'v3: BodyParts3D, Copyright(C) 2010-2011 The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan.',
      'v4: BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan.',
    ],
    adaptation: 'Selected original surfaces, native millimetres converted to metres/Y-up, simplified geometry and neutral display materials.',
  },
});
const buffer = doc.createBuffer();
const scene = doc.createScene('anatomy');
const mats = {};
const unlitExt = doc.createExtension(KHRMaterialsUnlit);
for (const [name, m] of Object.entries(MATERIALS)) {
  // glTF base colors are linear: convert the sRGB design colors.
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const rgba = [lin(m.color[0]), lin(m.color[1]), lin(m.color[2]), m.opacity ?? m.color[3]];
  // Organs: normal lit PBR material (metallic 0, roughness 0.6), shaded by the neutral environment.
  const mat = doc.createMaterial(name).setBaseColorFactor(rgba).setMetallicFactor(0).setRoughnessFactor(0.6);
  if (m.blend || m.opacity) mat.setAlphaMode('BLEND').setDoubleSided(false);
  if (m.outline) mat.setDoubleSided(true).setExtension('KHR_materials_unlit', unlitExt.createUnlit());
  mats[name] = mat;
}
function addMesh(name, positions, indices, matName) {
  const pos = doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer);
  const idx = doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute('POSITION', pos).setIndices(idx).setMaterial(mats[matName]);
  const mesh = doc.createMesh(name).addPrimitive(prim);
  scene.addChild(doc.createNode(name).setMesh(mesh));
}
// Opaque organs first, transparent skin last.
const order = Object.keys(raw).filter((g) => g !== 'skin').concat('skin');
for (const g of order) addMesh(g, raw[g].out, raw[g].idx, raw[g].material);

// Dosimeter marker: small box on the chest surface.
{
  const [cx, cy, cz] = anchors.dosimeter;
  const [w, hh, d] = [0.028, 0.036, 0.008];
  const p = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) p.push(cx + (sx * w) / 2, cy + (sy * hh) / 2, cz - d / 2 + (sz * d) / 2);
  const q = (a, b, c, e) => [a, b, c, a, c, e];
  const idx = [
    ...q(1, 3, 7, 5), ...q(0, 4, 6, 2), ...q(2, 6, 7, 3), ...q(0, 1, 5, 4), ...q(4, 5, 7, 6), ...q(0, 2, 3, 1),
  ];
  // These corner-order quads face inward; reverse them so the badge shades from its exterior.
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  addMesh('dosimeter', new Float32Array(p), idx, 'dosimeter');
}

// Keep every material separate (organs are recolored individually at runtime).
await doc.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }), weld({ tolerance: 0.0001 }), prune());

await MeshoptSimplifier.ready;
// Per-mesh simplification to the triangle budget.
for (const mesh of doc.getRoot().listMeshes()) {
  const target = BUDGET[mesh.getName()];
  for (const prim of mesh.listPrimitives()) {
    const tris = prim.getIndices().getCount() / 3;
    if (target && tris > target) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: target / tris, error: 0.002 });
  }
}
await doc.transform(weld({ tolerance: 0.0001 }), prune());
// Area-weighted smooth normals reveal organ volume without the flat triangle facets
// produced by the generic normals() transform. Separate lobe surfaces retain their fissures.
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const positions = prim.getAttribute('POSITION').getArray();
    const indices = prim.getIndices().getArray();
    const sums = new Float64Array(positions.length);
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
      const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const vertex of [a, b, c]) {
        sums[vertex] += nx; sums[vertex + 1] += ny; sums[vertex + 2] += nz;
      }
    }
    const normalValues = new Float32Array(positions.length);
    for (let i = 0; i < sums.length; i += 3) {
      const length = Math.hypot(sums[i], sums[i + 1], sums[i + 2]);
      if (length > 0) {
        normalValues[i] = sums[i] / length;
        normalValues[i + 1] = sums[i + 1] / length;
        normalValues[i + 2] = sums[i + 2] / length;
      } else normalValues[i + 1] = 1;
    }
    prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normalValues).setBuffer(buffer));
  }
}
await doc.transform(prune(), draco({ method: 'edgebreaker' }));

let total = 0;
for (const mesh of doc.getRoot().listMeshes()) {
  const t = mesh.listPrimitives()[0].getIndices().getCount() / 3;
  total += t;
  console.log(`  ${mesh.getName()}: ${t} tris`);
}
console.log(`total ${total} tris`);

const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression, KHRMaterialsUnlit])
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
const outGlb = path.join(ROOT, 'public', 'models', 'anatomy.glb');
await io.write(outGlb, doc);
console.log(`wrote ${outGlb} (${(fs.statSync(outGlb).size / 1e6).toFixed(2)} MB)`);

const fmt = (v) => v.map((x) => +x.toFixed(4)).join(' ');
const ts = `// GENERATED by scripts/build-anatomy.mjs — organ anchor points (metres, model space, front = +Z).
import type { ZoneId } from '../../brain/indicators';

export const ANATOMY_ANCHORS: Record<ZoneId, string> = {
${Object.entries(anchors).map(([k, v]) => `  ${k}: '${fmt(v)}',`).join('\n')}
};

export const ANATOMY_HEIGHT_M = ${(h * MM).toFixed(3)};
`;
fs.writeFileSync(path.join(ROOT, 'src', 'components', 'twin', 'anatomyAnchors.ts'), ts);
console.log(ts);
