// Render do Zumbilandia (fase 0.2): three.js pixelado, cenario fundido por chunk. So le G, nunca muta.
import * as THREE from 'three';
import { makePlayer, makeZombieParts, makeCar, makeTree, makeFence, makeHouse, makeItem, makeWallSeg, makeRoof, makeMarketRoof, makeDoor, makeFurniture, makeFloor, outline } from './modelos.js';

const CH = 40, INK = 0x15121a;
const BODY = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const LINE = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
const cm = new Map(); // materiais so para o bake (a cor vira atributo)
const cmat = c => { let m = cm.get(c); if (!m) cm.set(c, m = new THREE.MeshBasicMaterial({ color: c })); return m; };

// Coleta as malhas de um Object3D (cor do material vira atributo por vertice) em listas P=[corpo,tinta], C=cores.
function collect(group, P, C) {
  group.updateMatrixWorld(true);
  group.traverse(o => {
    if (!o.isMesh) return;
    const ink = o.material.side === THREE.BackSide;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    const a = g.attributes.position.array; P[ink ? 1 : 0].push(a);
    if (!ink) { const k = o.material.color, c = new Float32Array(a.length); for (let i = 0; i < a.length; i += 3) { c[i] = k.r; c[i + 1] = k.g; c[i + 2] = k.b; } C.push(c); }
    g.dispose();
  });
}
const cat = l => { const r = new Float32Array(l.reduce((s, a) => s + a.length, 0)); let n = 0; for (const a of l) { r.set(a, n); n += a.length; } return r; };
function geoms(P, C) {
  const mk = (p, c) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(cat(p), 3)); if (c) g.setAttribute('color', new THREE.BufferAttribute(cat(c), 3)); return g; };
  const body = mk(P[0], C);
  body.computeVertexNormals(); // normais planas para a luz Lambert
  return { body, ink: mk(P[1]) };
}
const bake = group => { const P = [[], []], C = []; collect(group, P, C); return geoms(P, C); };
// geometria baked de um modelo, gerada 1x por chave e copiada com transformacao (x,y,z,ry) para o bake do chunk
const mcache = new Map();
function stamp(P, C, key, fn, x, y, z, ry) {
  let e = mcache.get(key);
  if (!e) { e = { P: [[], []], C: [] }; collect(fn(), e.P, e.C); mcache.set(key, e); }
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const k of [0, 1]) for (const a of e.P[k]) {
    const r = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 3) { r[i] = a[i] * c + a[i + 2] * s + x; r[i + 1] = a[i + 1] + y; r[i + 2] = -a[i] * s + a[i + 2] * c + z; }
    P[k].push(r);
  }
  C.push(...e.C);
}
const pair = (b) => [new THREE.Mesh(b.body, BODY), new THREE.Mesh(b.ink, LINE)];

// ---------- estado ----------
let renderer, scene, camera, playerG, f = 0.75, lastT = 0, slowT = 0, slowN = 0, fastT = 0, fastN = 0;
const chunks = new Map(); // 'cx,cy' -> { group, sig }
const WALL = [0xf0e2c4, 0xfff3d6, 0xcfe8f5]; // parede das paletas A/B/C
let lastBake = { verts: 0, ms: 0 };
let ground; const mkRoof = new Map(); // id do mercado -> [corpo, contorno]
let zIM, zIK, zParts, plP, tIM, tIK, tSig = '', tList = [], bt = 0, pPh = 0, pPx = 0, pPy = 0, pV = 0, RM = 1, zIMs = [],
   carIM, carIK, crIM = [], roofIM = [], doorIM, roofSig = '', doorA = new Map(), lastDraw = 0, playerPivot, zData = new Map(), frame = 0;
const dummy = new THREE.Object3D(), zR = new THREE.Matrix4(), zM = new THREE.Matrix4(), zB = new THREE.Matrix4(), zQ = new THREE.Quaternion(), zE = new THREE.Euler(), zV = new THREE.Vector3(), zS = new THREE.Vector3(1, 1, 1);
const shots = [], hits = [];

function size() {
  renderer.setSize(Math.max(1, (innerWidth * f) | 0), Math.max(1, (innerHeight * f) | 0), false);
  const a = innerWidth / innerHeight;
  camera.aspect = a;
  const d = Math.max(12, 12 / (a * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))); // ~24 m de largura
  camera.userData.d = d;
  scene.fog.near = d + 2; scene.fog.far = d + 30;
  camera.updateProjectionMatrix();
}

// ---------- cenario ----------
const plane = (g, w, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), cmat(c)); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); g.add(m); };
const box = (g, w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cmat(c)); m.position.set(x, y, z); g.add(m); };

function houseSide(h, roads) { // lado ('w','e','n','s' = -x,+x,-y,+y) com a rua mais proxima
  let best = 'n', bd = 1e9;
  for (const r of roads) {
    const c = [['w', h.x - (r.x + r.w), h.y < r.y + r.h && h.y + h.h > r.y], ['e', r.x - (h.x + h.w), h.y < r.y + r.h && h.y + h.h > r.y],
      ['n', h.y - (r.y + r.h), h.x < r.x + r.w && h.x + h.w > r.x], ['s', r.y - (h.y + h.h), h.x < r.x + r.w && h.x + h.w > r.x]];
    for (const [s, d, ok] of c) if (ok && d >= -0.01 && d < bd) { bd = d; best = s; }
  }
  // makeHouse: 's' (+z mundo = +y) e 'n' invertidos em relacao ao nome acima
  return { w: 'w', e: 'e', n: 'n', s: 's' }[best];
}

function buildChunk(cx, cy, src) {
  const g = new THREE.Group(), ox = cx * CH, oy = cy * CH, SP = [[6, 20], [26, 40]];
  plane(g, CH, CH, 0x8fd16a, ox + 20, 0, oy + 20);
  SP.forEach(([a], i) => SP.forEach(([b], j) => { if (((i + j + cx + cy) & 1) === 0) plane(g, 14, 14, 0x86c763, ox + a + 7, 0.005, oy + b + 7); }));
  for (const r of src.roads) plane(g, r.w, r.h, 0x5e5b6b, r.x + r.w / 2, 0.01, r.y + r.h / 2);
  for (const k of [0, 20]) for (const [a, b] of SP) for (const hz of [0, 1]) {
    const mid = (a + b) / 2, len = b - a;
    const X = hz ? ox + mid : ox + k, Y = hz ? oy + k : oy + mid;
    for (const s of [-0.3, 6.3]) { // calcada 5 cm, 0,6 m de largura, nas duas bordas
      const o = s < 0 ? -0.3 : 6.3;
      if (hz) box(g, len, 0.05, 0.6, 0xd6cfc4, X, 0.025, oy + k + o); else box(g, 0.6, 0.05, len, 0xd6cfc4, ox + k + o, 0.025, Y);
    }
    for (let t = a + 0.6; t + 1.2 <= b; t += 2.4) { // faixa central tracejada
      if (hz) plane(g, 1.2, 0.15, 0xf2d16b, ox + t + 0.6, 0.02, oy + k + 3); else plane(g, 0.15, 1.2, 0xf2d16b, ox + k + 3, 0.02, oy + t + 0.6);
    }
  }
  for (const h of src.houses) {
    if (h.parts) { // interior: chao + base 0,8 m das paredes (portas ficam de fora, sao instanciadas)
      const f = makeFloor(h.w, h.h); f.position.set(h.x + h.w / 2, 0, h.y + h.h / 2); g.add(f);
      for (const p of h.parts) {
        if (p.door) continue;
        const m = makeWallSeg(Math.max(p.w, p.h), 0.8, 0.2, h.kind === 'market' ? 0xd6cfc4 : WALL[h.pal]); m.position.set(p.x + p.w / 2, 0, p.y + p.h / 2); if (p.h > p.w) m.rotation.y = Math.PI / 2; g.add(m);
      }
      continue;
    }
    const s = houseSide(h, src.roads), K = 1.6, sw = s === 'e' || s === 'w';
    const m = makeHouse((sw ? h.h : h.w) / K, (sw ? h.w : h.h) / K, s);
    m.scale.setScalar(K); m.position.set(h.x + h.w / 2, 0, h.y + h.h / 2); g.add(m);
  }
  // arvores: InstancedMesh unico (tronco+copa, 2 calls) balancando inteiro, mais barato que separar a copa
  for (const e of src.fences) { const hz = e.w >= e.h, m = makeFence(Math.max(e.w, e.h)); m.position.set(e.x + e.w / 2, 0, e.y + e.h / 2); if (!hz) m.rotation.y = Math.PI / 2; g.add(m); }
  const P = [[], []], C = []; collect(g, P, C);
  for (const c of src.crates) { // moveis (cache por kind+estado); frente aponta para o centro do lote
    if (!c.w) continue;
    const h = src.houses.find(q => c.x >= q.x && c.x <= q.x + q.w && c.y >= q.y && c.y <= q.y + q.h) || { x: c.x, y: c.y, w: 0, h: 0 };
    const hx = h.x + h.w / 2, hy = h.y + h.h / 2, ry = c.w >= c.h ? (c.y > hy ? Math.PI : 0) : (c.x < hx ? Math.PI / 2 : -Math.PI / 2);
    const op = !!c.opened && c.kind !== 'register'; // caixa registradora nunca aparece vasculhada
    stamp(P, C, c.kind + (op ? '+' : '-'), () => makeFurniture(c.kind, { open: op }), c.x, 0, c.y, ry);
  }
  const b = geoms(P, C), [bm, im] = pair(b);
  lastBake.verts = (b.body.attributes.position.count + b.ink.attributes.position.count);
  const out = new THREE.Group(); out.add(bm, im);
  return out;
}

const free = c => { scene.remove(c.group); c.group.children.forEach(m => m.geometry.dispose()); };
const only = (l, k) => l.filter(e => e.ch === k);
let seenGen = -1, queue = [];
function mkChunk(G, k, sig) {
  const t0 = performance.now(), [cx, cy] = k.split(',').map(Number);
  const group = buildChunk(cx, cy, { roads: only(G.roads, k), houses: only(G.houses, k), trees: only(G.trees, k), fences: only(G.fences, k), crates: only(G.crates, k) });
  lastBake.ms = performance.now() - t0;
  scene.add(group); chunks.set(k, { group, sig });
}
function syncChunks(G) {
  if (G.chunkGen !== seenGen) {
    seenGen = G.chunkGen;
    const want = new Set(G.loaded);
    for (const [k, c] of chunks) if (!want.has(k)) { free(c); chunks.delete(k); }
    queue = G.loaded.filter(k => !chunks.has(k));
  }
  const op = {}; for (const c of G.crates) if (c.w && c.opened) op[c.ch] = (op[c.ch] || 0) + c.id + 1;
  for (const [k, c] of chunks) if ((op[k] || 0) !== c.sig) { free(c); mkChunk(G, k, op[k] || 0); return; } // movel vasculhado: rebake do chunk
  if (!queue.length) return;
  const p = G.player, dist = k => { const [x, y] = k.split(',').map(Number); return (x * CH + CH / 2 - p.x) ** 2 + (y * CH + CH / 2 - p.y) ** 2; };
  let bi = 0; for (let i = 1; i < queue.length; i++) if (dist(queue[i]) < dist(queue[bi])) bi = i;
  const k = queue.splice(bi, 1)[0];
  if (chunks.has(k) || !G.loaded.includes(k)) return;
  mkChunk(G, k, op[k] || 0);
}

// ---------- modelos instanciados ----------
function instanced(model, cap) {
  const b = model.isObject3D ? bake(model) : model, im = new THREE.InstancedMesh(b.body, BODY, cap), ik = new THREE.InstancedMesh(b.ink, LINE, cap);
  im.frustumCulled = ik.frustumCulled = false; im.count = ik.count = 0; scene.add(im, ik);
  return [im, ik];
}
function crateModel(open) {
  const g = new THREE.Group(), W = open ? 0xb98a4e : 0xeab26a, L = open ? 0x8a6234 : 0xd9a066;
  box(g, 0.7, 0.42, 0.55, W, 0, 0.21, 0);
  if (open) { box(g, 0.6, 0.02, 0.45, 0x3a2430, 0, 0.43, 0); const l = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.08, 0.58), cmat(L)); l.position.set(0, 0.62, -0.38); l.rotation.x = -1.2; g.add(l); }
  else { box(g, 0.74, 0.1, 0.59, L, 0, 0.47, 0); box(g, 0.1, 0.1, 0.04, 0x6e4422, 0, 0.36, 0.3); }
  return outline(g);
}
function place(im, i, x, y, z, ry, sx = 1, sy = 1, sz = 1) { dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }

// ---------- jogador: pivos body(head,armL,armR), legL, legR; cada um 1 par de malhas (12 calls) ----------
function buildPlayer() {
  const m = makePlayer(), P = {};
  for (const n of ['head', 'armL', 'armR', 'legL', 'legR', 'body']) { // head antes do body: sai do corpo
    const o = m.getObjectByName(n), pos = o.position.clone(); o.removeFromParent(); o.position.set(0, 0, 0);
    const g = new THREE.Group(); g.add(...pair(bake(o))); g.position.copy(pos); P[n] = g;
  }
  for (const n of ['head', 'armL', 'armR']) { if (n !== 'head') P[n].position.y -= P.body.position.y; P.body.add(P[n]); }
  playerG = new THREE.Group(); playerG.add(P.body, P.legL, P.legR); plP = P;
  for (const n in P) P[n].userData.p0 = P[n].position.clone();
}
const sm = x => x * x * (3 - 2 * x);
function animPlayer(p, dt, now) {
  const P = plP, an = p.anim || { move: 'idle', act: null, t: 0 }, act = an.act, t = an.t, mv = an.move;
  pV += (Math.hypot(p.x - pPx, p.y - pPy) / Math.max(dt, 0.001) - pV) * 0.3; pPx = p.x; pPy = p.y; // velocidade suavizada
  bt += dt; const k = Math.min(1, pV / 0.8), mov = mv === 'walk' || mv === 'run' || mv === 'crouch';
  pPh += dt * Math.max(pV, 0.5) * (mv === 'crouch' ? 3 : 2.6);
  const amp = (mv === 'run' ? 0.7 : mv === 'crouch' ? 0.3 : 0.436) * k * RM * (mov ? 1 : 0), s = Math.sin(pPh) * amp;
  const cr = mv === 'crouch', bob = mov && RM === 1 ? Math.abs(Math.sin(pPh)) * (mv === 'run' ? 0.06 : 0.04) * k : 0;
  for (const n in P) { P[n].position.copy(P[n].userData.p0); P[n].rotation.set(0, 0, 0); P[n].scale.set(1, 1, 1); }
  playerG.rotation.z = 0; playerG.scale.set(1, 1, 1); playerG.position.y = 0;
  P.legL.rotation.x = s; P.legR.rotation.x = -s; P.armL.rotation.x = -s; P.armR.rotation.x = s;
  P.body.rotation.x = mv === 'run' ? 0.14 : cr ? 0.1 : 0;
  P.body.position.y += bob - (cr ? 0.15 : 0);
  if (cr) for (const l of [P.legL, P.legR]) { l.scale.y = 0.8; l.position.y = 0.44; }
  if (!mov || RM < 1) P.body.scale.y = 1 + 0.01 * (1 + Math.sin(bt * 2)) * RM;
  const u = x => Math.min(1, t / x);
  if (act === 'swing') { P.armR.rotation.x = -1.75 * Math.sin(Math.PI * u(0.25)); P.body.rotation.y = 0.3 * Math.sin(Math.PI * u(0.25)); }
  else if (act === 'shot') P.armR.rotation.x = -1.45 + 0.25 * Math.max(0, 1 - t / 0.15);
  else if (act === 'search') { const w = Math.sin(t * 14); P.armL.rotation.x = -1 + 0.5 * w; P.armR.rotation.x = -1 - 0.5 * w; P.body.rotation.x = 0.15; }
  else if (act === 'eat') P.armR.rotation.x = -2.3 * sm(u(0.2)) + 0.15 * Math.sin(t * 20);
  else if (act === 'heal') { P.armL.rotation.x = -1.3 * sm(u(0.2)); P.armR.rotation.x = -1 * sm(u(0.2)) + 0.2 * Math.sin(t * 14); }
  else if (act === 'equip') { const e = Math.sin(Math.PI * u(0.2)); playerG.scale.setScalar(1 + 0.1 * e); playerG.position.y = 0.12 * e; }
  else if (act === 'pick' || act === 'drop') { const e = Math.sin(Math.PI * u(0.4)); P.body.rotation.x = 0.6 * e; P.armL.rotation.x = P.armR.rotation.x = -0.8 * e; }
  else if (act === 'craft') { P.armL.rotation.x = -1.1 + 0.3 * Math.sin(t * 16); P.armR.rotation.x = -1.1 - 0.3 * Math.sin(t * 16); }
  else if (act === 'hurt' && t < 0.08) { playerG.scale.set(1.05, 0.9, 1.05); P.body.rotation.x = -0.2; }
  else if (act === 'dead') { const e = sm(u(0.6)); playerG.rotation.z = -Math.PI / 2 * e; playerG.position.y = 0.25 * e; }
}

// ---------- API ----------
function init(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  scene = new THREE.Scene();
  const sky = 0xcfe8d6;
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 20, 60);
  camera = new THREE.PerspectiveCamera(40, 1, 0.5, 120);
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a4455, 0.6 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.45 * Math.PI); sun.position.set(8, 14, 12); scene.add(sun);

  ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), cmat(0x8fd16a)); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  RM = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.3 : 1;
  const zp = makeZombieParts(); zIMs = ['body', 'legL', 'legR'].map(n => instanced(bake(zp[n]), 96));
  [tIM, tIK] = instanced(makeTree(), 768);
  [carIM, carIK] = instanced(makeCar(), 24);
  roofIM = [0, 1, 2].map(i => instanced(makeRoof(6, 6, 'ABC'[i]), 64)); // cap 64 casas por paleta
  doorIM = instanced(makeDoor(1.4), 128);
  crIM = [false, true].map(o => instanced(crateModel(o), 128));
  buildPlayer(); scene.add(playerG);

  const sm = new THREE.LineBasicMaterial({ color: 0xffe066 }), hm = new THREE.MeshBasicMaterial({ color: 0xff8a3d }), hg = new THREE.IcosahedronGeometry(0.22, 0);
  for (let i = 0; i < 3; i++) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), sm); l.visible = false; l.frustumCulled = false; l.userData.end = 0; scene.add(l); shots.push(l); }
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(hg, hm); m.visible = false; m.userData.end = 0; scene.add(m); hits.push(m); }

  size(); addEventListener('resize', size);
}

function autoScale(now) {
  const dt = now - lastT; lastT = now;
  if (dt <= 0 || dt > 500) return;
  slowT += dt; slowN++; fastT += dt; fastN++;
  let nf = f;
  if (slowT >= 2000) { if (f > 0.45 && slowT / slowN > 22) nf = 0.45; slowT = slowN = 0; }
  if (fastT >= 4000) { if (f < 0.75 && fastT / fastN < 14) nf = 0.75; fastT = fastN = 0; }
  if (nf !== f) { f = nf; slowT = slowN = fastT = fastN = 0; size(); }
}

function draw(G) {
  const now = performance.now(); autoScale(now); frame++;
  syncChunks(G);

  const p = G.player, dtm = Math.min(50, lastDraw ? now - lastDraw : 16); lastDraw = now;
  // telhado+faixa 0,8-2,2 m por paleta (modelo 6x6 escalado a w,h); cutaway: escala 0 na casa onde o jogador esta, so quando inside/chunks mudam.
  // A base 0,8 m fica (interior visivel sem sumir a parede sul); a porta e engrossada 3 cm para cobrir a faixa acima do vao.
  const rs = G.chunkGen + '|' + chunks.size + '|' + p.inside;
  if (rs !== roofSig) {
    roofSig = rs; const rn = [0, 0, 0], keep = new Set();
    for (const h of G.houses) {
      if (!h.parts || !chunks.has(h.ch)) continue;
      const s = h.id === p.inside ? 0 : 1;
      if (h.kind === 'market') { // um objeto (2 calls) por mercado, criado sob demanda
        keep.add(h.id); let e = mkRoof.get(h.id);
        if (!e) { const dx = h.doors.reduce((a, q) => a + q.x + q.w / 2, 0) / h.doors.length - (h.x + h.w / 2); e = instanced(makeMarketRoof(h.w, h.h, dx), 1); e[0].count = e[1].count = 1; e[1].instanceMatrix = e[0].instanceMatrix; mkRoof.set(h.id, e); }
        place(e[0], 0, h.x + h.w / 2, 0, h.y + h.h / 2, 0, s, s, s); e[0].instanceMatrix.needsUpdate = true; continue;
      }
      if (rn[h.pal] >= 64) continue;
      place(roofIM[h.pal][0], rn[h.pal]++, h.x + h.w / 2, 0, h.y + h.h / 2, 0, s * h.w / 6, s, s * h.h / 6);
    }
    for (const [id, e] of mkRoof) if (!keep.has(id)) { scene.remove(...e); e[0].geometry.dispose(); e[1].geometry.dispose(); mkRoof.delete(id); }
    roofIM.forEach(([im, ik], i) => { im.count = ik.count = rn[i]; im.instanceMatrix.needsUpdate = true; ik.instanceMatrix = im.instanceMatrix; });
  }
  // portas: pivo na dobradica, giram 90 graus para dentro da casa em 150 ms
  let dn = 0;
  for (const h of G.houses) {
    if (!h.parts || !chunks.has(h.ch)) continue;
    for (const d of h.doors) {
      if (dn >= 128) break;
      const ax = d.w >= d.h, hx = h.x + h.w / 2, hy = h.y + h.h / 2;
      const a0 = ax ? 0 : -Math.PI / 2, a1 = !d.open ? a0 : ax ? (d.y < hy ? Math.PI / 2 : -Math.PI / 2) : (d.x < hx ? 0 : -Math.PI);
      let a = doorA.get(d.id); if (a === undefined) a = a1;
      const st = dtm * Math.PI / 300; a += Math.max(-st, Math.min(st, a1 - a)); doorA.set(d.id, a);
      place(doorIM[0], dn++, ax ? d.x : d.x + d.w / 2, 0, ax ? d.y + d.h / 2 : d.y, a, Math.max(d.w, d.h) / 1.4, 1, 1.3);
    }
  }
  doorIM[0].count = doorIM[1].count = dn; doorIM[0].instanceMatrix.needsUpdate = true; doorIM[1].instanceMatrix = doorIM[0].instanceMatrix;

  ground.position.set(p.x, -0.01, p.y);
  playerG.position.set(p.x, 0, p.y); playerG.rotation.y = Math.PI / 2 - p.dir; animPlayer(p, dtm / 1000, now);

  // zumbis: 3 InstancedMesh (body, legL, legR) + contorno; so <=20 m recalcula a pose, os outros so a posicao
  let n = 0; const dt = dtm / 1000, seen = new Set();
  const poseZ = (id, x, y, anim, ang, sc) => {
    let d = zData.get(id); if (!d) zData.set(id, d = { a: ang, ph: id * 1.7, sw: 0, ro: 0, ln: 0, fw: 0, f });
    d.f = frame; const dd = (x - p.x) ** 2 + (y - p.y) ** 2, act = anim && anim.act, t = anim ? anim.t : 0;
    if (dd <= 400) {
      const w = anim && anim.move === 'walk';
      if (w) d.ph += dt * 3.2;
      d.sw = w ? 0.45 * Math.sin(d.ph) * RM : 0; d.ro = (w ? 0.105 * Math.sin(d.ph * 0.5) : 0.02 * Math.sin(now / 700 + id)) * RM; d.ln = 0.15; d.fw = 0;
      if (act === 'windup') { const e = Math.min(1, t / 0.5); d.ln = 0.15 + 0.35 * e; d.fw = 0.25 * e; }
      else if (act === 'hit') { d.ln = 0.5; d.fw = 0.25 + 0.1 * Math.sin(t * 22); }
    }
    const e = act === 'dead' ? sm(Math.min(1, t / 0.5)) : 0;
    dummy.position.set(x, 0.25 * e, y); dummy.rotation.set(0, d.a, -Math.PI / 2 * e); dummy.scale.setScalar(sc); dummy.updateMatrix();
    zR.copy(dummy.matrix);
    zQ.setFromEuler(zE.set(d.ln, 0, d.ro)); zM.compose(zV.set(0, 0.55, d.fw), zQ, zS); zIMs[0][0].setMatrixAt(n, zB.multiplyMatrices(zR, zM));
    for (let i = 1; i < 3; i++) { zQ.setFromEuler(zE.set(i === 1 ? d.sw : -d.sw, 0, 0)); zM.compose(zV.set(i === 1 ? -0.15 : 0.15, 0.55, 0), zQ, zS); zIMs[i][0].setMatrixAt(n, zB.multiplyMatrices(zR, zM)); }
    n++;
  };
  for (const z of G.zombies) {
    if (n >= 96) break;
    const d = zData.get(z.id), ang0 = Math.atan2(p.x - z.x, p.y - z.y);
    if (d) {
      const dx = z.x - d.x, dy = z.y - d.y;
      if (dx * dx + dy * dy > 1e-5) d.a = Math.atan2(dx, dy); else if (z.state !== 'idle') d.a = ang0;
      d.x = z.x; d.y = z.y;
    }
    poseZ(z.id, z.x, z.y, z.anim, ang0, z.state === 'attack' ? 1 + 0.12 * Math.abs(Math.sin(now / 45)) : 1);
    const q = zData.get(z.id); q.x = z.x; q.y = z.y; seen.add(z.id);
  }
  for (const y of G.dying) if (n < 96 && !seen.has(y.id)) poseZ(y.id, y.x, y.y, y.anim, 0, 1);
  if (zData.size > n + 32) for (const [k, d] of zData) if (d.f !== frame) zData.delete(k);
  for (const [im, ik] of zIMs) { im.count = ik.count = n; im.instanceMatrix.needsUpdate = true; ik.instanceMatrix = im.instanceMatrix; }

  // arvores: lista so muda com os chunks; balanco (vento, fase por posicao) so <=30 m
  const ts = G.chunkGen + '|' + chunks.size;
  if (ts !== tSig) { tSig = ts; tList = G.trees.filter(t => chunks.has(t.ch)).slice(0, 768); tList.forEach((t, i) => { t.ry = t.x * 7.3; t.sc = 1.3 + (Math.abs(t.y * 3.1) % 0.5); place(tIM, i, t.x, 0, t.y, t.ry, t.sc, t.sc, t.sc); }); tIM.count = tIK.count = tList.length; tIM.instanceMatrix.needsUpdate = true; tIK.instanceMatrix = tIM.instanceMatrix; }
  if (RM === 1) {
    for (let i = 0; i < tList.length; i++) {
      const t = tList[i]; if ((t.x - p.x) ** 2 + (t.y - p.y) ** 2 > 900) continue;
      const w = Math.sin(now / 900 + t.x * 0.7 + t.y * 0.5) * 0.04;
      dummy.position.set(t.x, 0, t.y); dummy.rotation.set(w, t.ry, w * 0.6); dummy.scale.setScalar(t.sc); dummy.updateMatrix(); tIM.setMatrixAt(i, dummy.matrix);
    }
    tIM.instanceMatrix.needsUpdate = true;
  }

  // carros (caixa 4,2 x 2 m; modelo ~2,1 x 0,94)
  n = 0;
  for (const c of G.cars) { if (n >= 24) break; place(carIM, n++, c.x, 0, c.y, -c.dir, 2, 2, 2.1); }
  carIM.count = carIK.count = n; carIM.instanceMatrix.needsUpdate = true; carIK.instanceMatrix = carIM.instanceMatrix;

  // baus
  const cnt = [0, 0];
  for (const c of G.crates) { if (c.w) continue; const k = c.opened ? 1 : 0, im = crIM[k][0]; if (cnt[k] < 128) place(im, cnt[k]++, c.x, 0, c.y, 0); }
  crIM.forEach(([im, ik], k) => { im.count = ik.count = cnt[k]; im.instanceMatrix.needsUpdate = true; ik.instanceMatrix = im.instanceMatrix; });

  // efeitos (reaproveitados)
  for (const ev of G.events) {
    if (ev.type === 'shot') {
      const l = shots.find(s => !s.visible) || shots[0], a = l.geometry.attributes.position, dir = ev.dir ?? p.dir;
      a.setXYZ(0, p.x, 1.1, p.y); a.setXYZ(1, p.x + Math.cos(dir) * 3, 1.1, p.y + Math.sin(dir) * 3); a.needsUpdate = true;
      l.visible = true; l.userData.end = now + 80;
    } else if (ev.type === 'hit') {
      const m = hits.find(s => !s.visible) || hits[0]; m.position.set(ev.x ?? p.x, 1, ev.y ?? p.y); m.visible = true; m.userData.end = now + 80;
    }
  }
  for (const o of shots) if (o.visible && now >= o.userData.end) o.visible = false;
  for (const o of hits) if (o.visible && now >= o.userData.end) o.visible = false;

  // camera ~55 graus
  const d = camera.userData.d, el = 0.96;
  camera.position.set(p.x, 0.5 + d * Math.sin(el), p.y + d * Math.cos(el));
  camera.lookAt(p.x, 0.5, p.y);
  renderer.render(scene, camera);
}

// ---------- itens 3D (icone e giro) no MESMO renderer ----------
let iS, iC, iRT, iPivot, iR = 1, spinT = 0, spinRaf = 0, spinCv = null, spinId = null;
const icons = new Map();
function itemSetup() {
  if (iS) return;
  iS = new THREE.Scene();
  iS.add(new THREE.HemisphereLight(0xfff4e6, 0x3a4455, 0.9 * Math.PI));
  const l = new THREE.DirectionalLight(0xffffff, 0.75 * Math.PI); l.position.set(8, 14, 12); iS.add(l);
  iC = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  iPivot = new THREE.Group(); iS.add(iPivot);
}
function itemLoad(id) { // modelo centrado na origem; camera 3/4 enquadrada pela Box3
  itemSetup();
  let m; try { m = makeItem(id); } catch (e) { return false; }
  iPivot.clear(); iPivot.rotation.y = 0; iPivot.add(m);
  const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3()); m.position.sub(c);
  iR = b.getSize(new THREE.Vector3()).length() / 2;
  iC.position.set(0.7, 0.55, 0.9).normalize().multiplyScalar(iR / Math.sin(THREE.MathUtils.degToRad(15)) * 1.05);
  iC.lookAt(0, 0, 0); iC.updateMatrixWorld();
  return true;
}
// renderiza iS em RT sz x sz e devolve ImageData (linhas viradas); restaura todo o estado do renderer
function itemShot(sz) {
  if (!iRT || iRT.width !== sz) { iRT?.dispose(); iRT = new THREE.WebGLRenderTarget(sz, sz); }
  const r = renderer, rt = r.getRenderTarget(), vp = r.getViewport(new THREE.Vector4()), sc = r.getScissor(new THREE.Vector4()), st = r.getScissorTest(),
    cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
  const px = new Uint8Array(sz * sz * 4);
  try {
    r.setRenderTarget(iRT); r.setScissorTest(false); r.setClearColor(0, 0); r.clear();
    r.render(iS, iC); r.readRenderTargetPixels(iRT, 0, 0, sz, sz, px);
  } finally { r.setRenderTarget(rt); r.setViewport(vp); r.setScissor(sc); r.setScissorTest(st); r.setClearColor(cc, ca); }
  const out = new Uint8ClampedArray(px.length);
  for (let y = 0; y < sz; y++) out.set(px.subarray((sz - 1 - y) * sz * 4, (sz - y) * sz * 4), y * sz * 4);
  return new ImageData(out, sz, sz);
}
function icon(id) {
  if (icons.has(id)) return icons.get(id);
  let url = null;
  if (itemLoad(id)) { const c = document.createElement('canvas'); c.width = c.height = 96; c.getContext('2d').putImageData(itemShot(96), 0, 0); url = c.toDataURL('image/png'); }
  icons.set(id, url); return url;
}
function spinStop() { cancelAnimationFrame(spinRaf); spinRaf = 0; spinCv = null; spinId = null; }
function spinTick(t) {
  if (!spinCv) return;
  spinRaf = requestAnimationFrame(spinTick);
  if (t - spinT < 33) return; spinT = t;
  iPivot.rotation.y = t / 1000 * 0.8;
  const cv = spinCv.getContext('2d'); cv.imageSmoothingEnabled = false;
  const tmp = spinTick.c || (spinTick.c = document.createElement('canvas')); tmp.width = tmp.height = 160;
  tmp.getContext('2d').putImageData(itemShot(160), 0, 0);
  cv.clearRect(0, 0, spinCv.width, spinCv.height); cv.drawImage(tmp, 0, 0, spinCv.width, spinCv.height);
}
function spin(canvas, id) {
  spinStop();
  if (!canvas || !renderer || !itemLoad(id)) return;
  spinCv = canvas; spinId = id; spinRaf = requestAnimationFrame(spinTick);
}
// demos de acao do guia vem depois; por ora so itens
const demo = (canvas, id) => spin(canvas, id);

window.R = { init, draw, icon, spin, demo, info: () => ({ calls: renderer.info.render.calls, verts: lastBake.verts, ms: lastBake.ms }), mem: () => renderer.info.memory.geometries, chunks: () => chunks.size };
