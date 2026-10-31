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
let zIM, zIK, zParts, plP, zPs = [], eqSig = '000', dPool = [], dCache = new Map(), ring, brk = [], demoRig = null, plRig, tIM, tIK, tSig = '', tList = [], bt = 0, pPh = 0, pPx = 0, pPy = 0, pV = 0, RM = 1, zIMs = [],
   carIM, carIK, crIM = [], roofIM = [], doorIM, roofSig = '', doorA = new Map(), lastDraw = 0, playerPivot, zData = new Map(), frame = 0;
const dummy = new THREE.Object3D(), zR = new THREE.Matrix4(), zM = new THREE.Matrix4(), zB = new THREE.Matrix4(), zQ = new THREE.Quaternion(), zE = new THREE.Euler(), zV = new THREE.Vector3(), zS = new THREE.Vector3(1, 1, 1);
const shots = [], hits = [];
let own, ownId = null, lidA = 0, cSm = { x: 0, y: 0, d: 1 }, sPool = [], sT = 0, fireIM, flameIM, flights = [], bottle = null;
const OWN_LAMP = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const OWN_BEAM = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.14, depthWrite: false, fog: false });
const SMOKE = new THREE.MeshBasicMaterial({ color: 0xbfc4cc });

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
function mkRig(armor, back) {
  const m = makePlayer({ armor, back }), P = {};
  for (const n of ['head', 'armL', 'armR', 'legL', 'legR', 'body']) { // head antes do body: sai do corpo
    const o = m.getObjectByName(n), pos = o.position.clone(); o.removeFromParent(); o.position.set(0, 0, 0);
    const g = new THREE.Group(); g.add(...pair(bake(o))); g.position.copy(pos); P[n] = g;
  }
  for (const n of ['head', 'armL', 'armR']) { if (n !== 'head') P[n].position.y -= P.body.position.y; P.body.add(P[n]); }
  const hs = pair(bake(makeItem('hose'))); const hi = new THREE.Group(); hi.add(...hs); hi.scale.setScalar(0.7); P.hose = new THREE.Group(); P.hose.add(hi); P.hose.position.set(0, -0.55, 0.12); P.hose.visible = false; P.armR.add(P.hose); // mangueira na mao (so no siphon)
  const g = new THREE.Group(); g.add(P.body, P.legL, P.legR);
  for (const n in P) P[n].userData.p0 = P[n].position.clone();
  P.hose.userData.p0 = P.hose.position.clone();
  return { g, P };
}
// carro proprio (criado 1x): carroceria, tampa e 4 rodas viram 1 par de malhas cada (10 calls) + 3 de farol
function mkCarOwn() {
  const g = makeCar({ parts: true }), N = n => g.getObjectByName(n), P = { g };
  const bk = o => { // troca as malhas do pivo por 1 par baked no espaco local do pivo
    const par = o.parent, p0 = o.position.clone(), q0 = o.quaternion.clone(), ms = [];
    o.removeFromParent(); o.position.set(0, 0, 0); o.quaternion.identity(); o.traverse(m => m.isMesh && ms.push(m));
    const b = bake(o); ms.forEach(m => m.removeFromParent()); o.add(...pair(b)); o.position.copy(p0); o.quaternion.copy(q0); par.add(o);
  };
  const body = P.body = N('body'), lid = P.lid = N('trunkLid'); lid.removeFromParent(); bk(body); body.add(lid); bk(lid);
  P.w = ['FL', 'FR', 'RL', 'RR'].map(n => { const w = N('wheel' + n); bk(w); return w; });
  P.ex = N('exhaust');
  for (const n of ['lightL', 'lightR']) { const q = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), OWN_LAMP); q.rotation.y = Math.PI / 2; q.position.x = 0.03; N(n).add(q); P[n] = q; }
  const beam = P.beam = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5).rotateX(-Math.PI / 2), OWN_BEAM); beam.position.set(2.4, 0.03, 0); g.add(beam);
  g.visible = false; g.scale.set(2, 2, 2.1); scene.add(g);
  return P;
}
const freeRig = r => r.g.traverse(o => o.isMesh && o.geometry.dispose());
function buildPlayer(armor, back) { // troca a armadura: dispose da geometria antiga (R.mem estavel)
  if (plRig) { scene.remove(playerG); freeRig(plRig); }
  plRig = mkRig(armor, back); playerG = plRig.g; plP = plRig.P; scene.add(playerG);
}
const sm = x => x * x * (3 - 2 * x);
function animPlayer(p, dt) {
  const an = p.anim || { move: 'idle', act: null, t: 0 };
  pV += (Math.hypot(p.x - pPx, p.y - pPy) / Math.max(dt, 0.001) - pV) * 0.3; pPx = p.x; pPy = p.y; // velocidade suavizada
  bt += dt; pPh += dt * Math.max(pV, 0.5) * (an.move === 'crouch' ? 3 : 2.6);
  pose(plRig, an.move, an.act, an.t, Math.min(1, pV / 0.8));
}
function pose(rig, mv, act, t, k) {
  const P = rig.P, playerG = rig.g, mov = mv === 'walk' || mv === 'run' || mv === 'crouch';
  const amp = (mv === 'run' ? 0.7 : mv === 'crouch' ? 0.3 : 0.436) * k * RM * (mov ? 1 : 0), s = Math.sin(pPh) * amp;
  const cr = mv === 'crouch', bob = mov && RM === 1 ? Math.abs(Math.sin(pPh)) * (mv === 'run' ? 0.06 : 0.04) * k : 0;
  for (const n in P) { P[n].position.copy(P[n].userData.p0); P[n].rotation.set(0, 0, 0); P[n].scale.set(1, 1, 1); }
  playerG.rotation.z = 0; playerG.scale.set(1, 1, 1); playerG.position.y = 0; P.hose.visible = act === 'siphon';
  P.legL.rotation.x = s; P.legR.rotation.x = -s; P.armL.rotation.x = -s; P.armR.rotation.x = s;
  P.body.rotation.x = mv === 'run' ? 0.14 : cr ? 0.1 : 0;
  P.body.position.y += bob - (cr ? 0.15 : 0);
  if (cr) for (const l of [P.legL, P.legR]) { l.scale.y = 0.8; l.position.y = 0.44; }
  if (!mov || RM < 1) P.body.scale.y = 1 + 0.01 * (1 + Math.sin(bt * 2)) * RM;
  const u = x => Math.min(1, t / x);
  if (act === 'swing') { P.armR.rotation.x = -1.75 * Math.sin(Math.PI * u(0.25)); P.body.rotation.y = 0.3 * Math.sin(Math.PI * u(0.25)); }
  else if (act === 'siphon') { const w = Math.sin(t * 6); P.body.rotation.x = 0.5; P.body.position.y -= 0.2; for (const l of [P.legL, P.legR]) { l.rotation.x = -0.9; l.scale.y = 0.75; l.position.y = 0.4; } P.armL.rotation.x = -1.2 + 0.1 * w; P.armR.rotation.x = -1.3 - 0.1 * w; }
  else if (act === 'throw') { const e = u(0.4); P.armR.rotation.x = e < 0.4 ? 0.8 * sm(e / 0.4) : 0.8 - 3.1 * sm((e - 0.4) / 0.6); P.body.rotation.y = e < 0.4 ? 0.3 * e : 0.12 - 0.5 * (e - 0.4); }
  else if (act === 'shot') P.armR.rotation.x = -1.45 + 0.25 * Math.max(0, 1 - t / 0.15);
  else if (act === 'search') { const w = Math.sin(t * 14); P.armL.rotation.x = -1 + 0.5 * w; P.armR.rotation.x = -1 - 0.5 * w; P.body.rotation.x = 0.15; }
  else if (act === 'eat') P.armR.rotation.x = -2.3 * sm(u(0.2)) + 0.15 * Math.sin(t * 20);
  else if (act === 'heal') { P.armL.rotation.x = -1.3 * sm(u(0.2)); P.armR.rotation.x = -1 * sm(u(0.2)) + 0.2 * Math.sin(t * 14); }
  else if (act === 'equip') { const e = Math.sin(Math.PI * u(0.2)); playerG.scale.setScalar(1 + 0.1 * e); playerG.position.y = 0.12 * e; }
  else if (act === 'pick' || act === 'drop') { const e = Math.sin(Math.PI * u(0.4)); P.body.rotation.x = 0.6 * e; P.armL.rotation.x = P.armR.rotation.x = -0.8 * e; }
  else if (act === 'craft') { P.armL.rotation.x = -1.1 + 0.3 * Math.sin(t * 16); P.armR.rotation.x = -1.1 - 0.3 * Math.sin(t * 16); }
  else if (act === 'jump') { const e = Math.sin(Math.PI * u(0.6)); playerG.position.y = 0.5 * e; P.legL.rotation.x = P.legR.rotation.x = -0.9 * e; P.legL.scale.y = P.legR.scale.y = 1 - 0.3 * e; P.armL.rotation.x = P.armR.rotation.x = -0.8 * e; }
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
  buildPlayer({}); own = mkCarOwn();
  const sg = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(sg, SMOKE); m.visible = false; m.userData = { t: 9 }; scene.add(m); sPool.push(m); }
  const mb = bake(makeItem('molotov')); // garrafa em voo (2 no ar, 4 calls)
  for (let i = 0; i < 2; i++) { const g = new THREE.Group(); g.add(...pair(mb)); g.visible = false; g.scale.setScalar(1.2); scene.add(g); flights.push(g); }
  const fg = new THREE.ConeGeometry(0.28, 1, 5).translate(0, 0.5, 0); // 4 fogos x 3 chamas, 2 calls
  fireIM = new THREE.InstancedMesh(fg, cmat(0xff7a1f), 12); flameIM = new THREE.InstancedMesh(fg, cmat(0xffd23f), 12);
  fireIM.frustumCulled = flameIM.frustumCulled = false; fireIM.count = flameIM.count = 0; scene.add(fireIM, flameIM);
  const zq = makeZombieParts({ police: true }); zPs = ['body', 'legL', 'legR'].map(n => instanced(bake(zq[n]), 96));
  const rm = new THREE.MeshBasicMaterial({ color: 0xff5c57, transparent: true, opacity: 0.45, depthWrite: false, fog: false });
  ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 24).rotateX(-Math.PI / 2), rm); ring.visible = false; scene.add(ring);
  for (let i = 0; i < 8; i++) { const g = new THREE.Group(); g.add(new THREE.Mesh(undefined, BODY), new THREE.Mesh(undefined, LINE)); g.visible = false; scene.add(g); dPool.push(g); }
  const bg = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(bg, cmat(0xffffff)); m.visible = false; m.userData = { end: 0 }; scene.add(m); brk.push(m); }

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

const cv3 = new THREE.Vector3();
function carOwnDraw(c, p, dt, now, trunk) {
  const o = own, inp = p.car ? p.input : { mx: 0, my: 0 }, v = c.speed || 0, st = o.st || (o.st = { v, pitch: 0, roll: 0, steer: 0, sp: 0, ph: 0 });
  const acc = (v - st.v) / Math.max(dt, 0.001); st.v = v;
  const k = Math.min(1, dt * 8), bump = RM === 1 ? Math.sin(now / 90) * 0.004 * Math.min(1, Math.abs(v) / 5) : 0;
  st.pitch += (Math.max(-0.08, Math.min(0.08, acc * 0.01)) * RM - st.pitch) * k;
  st.roll += (-inp.mx * Math.abs(v) * 0.005 * RM - st.roll) * k;
  st.steer += (-inp.mx * 0.5 - st.steer) * Math.min(1, dt * 10);
  o.g.position.set(c.x, 0, c.y); o.g.rotation.y = -c.dir;
  o.body.rotation.set(st.roll + bump, 0, st.pitch); o.body.position.y = Math.abs(bump) * 2;
  st.ph += v * dt / 2 / 0.19; // v m/s em 1/2 escala do modelo, raio 0,19
  o.w.forEach((w, i) => { w.rotation.x = st.ph; w.rotation.y = i < 2 ? st.steer : 0; });
  lidA += ((trunk ? 1 : 0) - lidA) * Math.min(1, dt * 8); o.lid.rotation.z = -Math.PI / 3 * lidA;
  const on = !!(p.car && p._eng);
  o.lightL.visible = o.lightR.visible = o.beam.visible = on;
  if (on && RM === 1 && (sT -= dt) <= 0) {
    sT = 0.15; const m = sPool.find(s => !s.visible);
    if (m) { o.g.updateMatrixWorld(true); o.ex.getWorldPosition(cv3); m.position.copy(cv3); m.userData = { t: 0, vx: -Math.cos(c.dir) * 0.3 + (Math.random() - 0.5) * 0.3, vz: -Math.sin(c.dir) * 0.3 + (Math.random() - 0.5) * 0.3 }; m.scale.setScalar(0.08); m.visible = true; }
  }
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
  const bk = p.equip && p.equip.back && p.equip.back.id || null;
  const es = ['head', 'torso', 'legs'].map(k => p.equip && p.equip[k] ? 1 : 0).join('') + (bk || '');
  if (es !== eqSig) { eqSig = es; buildPlayer({ head: es[0] === '1', torso: es[1] === '1', legs: es[2] === '1' }, bk); }
  playerG.visible = !p.car; playerG.position.set(p.x, 0, p.y); playerG.rotation.y = Math.PI / 2 - p.dir; animPlayer(p, dtm / 1000);
  const ja = p.action && p.action.type === 'jump' ? p.action : null;
  if (ja && p.anim && p.anim.act === 'jump') { const u = Math.min(1, p.anim.t / 0.6); playerG.position.x = ja.x0 + (ja.x1 - ja.x0) * u; playerG.position.z = ja.y0 + (ja.y1 - ja.y0) * u; }

  // zumbis: 3 InstancedMesh (body, legL, legR) + contorno; so <=20 m recalcula a pose, os outros so a posicao
  let n = 0; const dt = dtm / 1000, seen = new Set(), cn = [0, 0];
  const poseZ = (id, x, y, anim, ang, sc, pol, run) => {
    const k = +id || [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7); // id 'p:12' (zumbi de spawn) em id*1.7 dava NaN: matriz do corpo NaN, so as pernas apareciam
    const S = pol ? zPs : zIMs, n = cn[pol ? 1 : 0]++;
    let d = zData.get(id); if (!d) zData.set(id, d = { a: ang, ph: k * 1.7, sw: 0, ro: 0, ln: 0, fw: 0, f });
    d.f = frame; const dd = (x - p.x) ** 2 + (y - p.y) ** 2, act = anim && anim.act, t = anim ? anim.t : 0;
    if (dd <= 400) {
      const w = anim && anim.move === 'walk';
      if (w) d.ph += dt * 3.2 * (run ? 1.6 : 1);
      d.sw = w ? 0.45 * Math.sin(d.ph) * RM : 0; d.ro = (w ? 0.105 * Math.sin(d.ph * 0.5) : 0.02 * Math.sin(now / 700 + k)) * RM; d.ln = 0.15; d.fw = 0;
      if (act === 'windup') { const e = Math.min(1, t / 1.0); if (e < 0.7) { const r = sm(e / 0.7); d.ln = 0.15 - 0.3 * r; d.fw = -0.12 * r; } else { const r = sm((e - 0.7) / 0.3); d.ln = -0.15 + 0.65 * r; d.fw = -0.12 + 0.37 * r; } }
      else if (act === 'climb') { d.ln = 0.15 + 0.52 * 0.77; d.sw = 0.8 * Math.sin(t * 10); }
      else if (act === 'hit') { d.ln = 0.5; d.fw = 0.25 + 0.1 * Math.sin(t * 22); }
    }
    const e = act === 'dead' ? sm(Math.min(1, t / 0.5)) : 0;
    dummy.position.set(x, 0.25 * e + (act === 'climb' ? 0.35 + 0.08 * Math.sin(t * 8) : 0), y); dummy.rotation.set(0, d.a, -Math.PI / 2 * e); dummy.scale.setScalar(sc); dummy.updateMatrix();
    zR.copy(dummy.matrix);
    zQ.setFromEuler(zE.set(d.ln, 0, d.ro)); zM.compose(zV.set(0, 0.55, d.fw), zQ, zS); S[0][0].setMatrixAt(n, zB.multiplyMatrices(zR, zM));
    for (let i = 1; i < 3; i++) { zQ.setFromEuler(zE.set(i === 1 ? d.sw : -d.sw, 0, 0)); zM.compose(zV.set(i === 1 ? -0.15 : 0.15, 0.55, 0), zQ, zS); S[i][0].setMatrixAt(n, zB.multiplyMatrices(zR, zM)); }
  };
  for (const z of G.zombies) {
    if (cn[0] + cn[1] >= 96) break;
    const d = zData.get(z.id), ang0 = Math.atan2(p.x - z.x, p.y - z.y);
    if (d) {
      const dx = z.x - d.x, dy = z.y - d.y;
      if (dx * dx + dy * dy > 1e-5) d.a = Math.atan2(dx, dy); else if (z.state !== 'idle') d.a = ang0;
      d.x = z.x; d.y = z.y;
    }
    poseZ(z.id, z.x, z.y, z.anim, ang0, z.state === 'attack' ? 1 + 0.12 * Math.abs(Math.sin(now / 45)) : 1, z.police, z.runner);
    const q = zData.get(z.id); q.x = z.x; q.y = z.y; seen.add(z.id);
  }
  for (const y of G.dying) if (cn[0] + cn[1] < 96 && !seen.has(y.id)) poseZ(y.id, y.x, y.y, y.anim, 0, 1);
  if (zData.size > cn[0] + cn[1] + 32) for (const [k, d] of zData) if (d.f !== frame) zData.delete(k);
  [zIMs, zPs].forEach((S, j) => { for (const [im, ik] of S) { im.count = ik.count = cn[j]; im.instanceMatrix.needsUpdate = true; ik.instanceMatrix = im.instanceMatrix; } });

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
  const tr = p.action && p.action.type === 'search' && p.action.trunk ? p.action.id : null, wantId = p.car || tr;
  if (wantId) ownId = wantId; else if (ownId && lidA < 0.02) ownId = null; // tampa fecha antes de voltar ao instanciado
  const oc = ownId && G.cars.find(c => c.id === ownId);
  for (const c of G.cars) { if (n >= 24) break; if (c === oc) continue; place(carIM, n++, c.x, 0, c.y, -c.dir, 2, 2, 2.1); }
  carIM.count = carIK.count = n; carIM.instanceMatrix.needsUpdate = true; carIK.instanceMatrix = carIM.instanceMatrix;

  own.g.visible = !!oc;
  if (oc) carOwnDraw(oc, p, dt, now, tr === oc.id);
  else if (!ownId) lidA = 0;
  for (const m of sPool) if (m.visible) { const u = m.userData; u.t += dt; const k = u.t / 0.9; if (k >= 1) m.visible = false; else { m.position.x += u.vx * dt; m.position.y += 0.7 * dt; m.position.z += u.vz * dt; m.scale.setScalar((0.08 + 0.2 * Math.min(1, k / 0.6)) * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1)); } }

  // molotov em voo (arco) e fogo no chao (3 chamas por fogo, cap 4)
  flights.forEach((g, i) => { const f = G.flights[i]; g.visible = !!f; if (!f) return; const u = Math.min(1, f.t / f.T); g.position.set(f.x0 + (f.x - f.x0) * u, 0.9 + 3.2 * u * (1 - u) * 1 + 0.3 * u * 0, f.y0 + (f.y - f.y0) * u); g.rotation.set(u * 14, 0, u * 6); });
  let fn = 0;
  for (const f of G.fires.slice(0, 4)) {
    const age = G.t - f.t0, k = Math.min(1, age / 0.25) * Math.min(1, Math.max(0, (3 - age) / 0.5));
    for (let j = 0; j < 3; j++) {
      const a = j * 2.1 + f.x, r = j ? 0.5 : 0, fl = RM === 1 ? 0.75 + 0.25 * Math.sin(now / 90 + j * 2 + f.y) : 1, h = (1.25 - 0.3 * j) * fl * k;
      place(fireIM, fn, f.x + Math.cos(a) * r, 0, f.y + Math.sin(a) * r, now / 700 + j, 1.2 * k, h, 1.2 * k);
      place(flameIM, fn++, f.x + Math.cos(a) * r, 0, f.y + Math.sin(a) * r, 0, 0.6 * k, h * 0.6, 0.6 * k);
    }
  }
  fireIM.count = flameIM.count = fn; fireIM.instanceMatrix.needsUpdate = flameIM.instanceMatrix.needsUpdate = true;

  // baus
  const cnt = [0, 0];
  for (const c of G.crates) { if (c.w) continue; const k = c.opened ? 1 : 0, im = crIM[k][0]; if (cnt[k] < 128) place(im, cnt[k]++, c.x, 0, c.y, 0); }
  crIM.forEach(([im, ik], k) => { im.count = ik.count = cnt[k]; im.instanceMatrix.needsUpdate = true; ik.instanceMatrix = im.instanceMatrix; });

  // drops: so os 8 mais proximos; geometria baked por id (cache), flutua e gira devagar
  const near = [];
  for (const d of G.drops || []) { const q = (d.x - p.x) ** 2 + (d.y - p.y) ** 2; if (near.length < 8 || q < near[7].q) { near.push({ d, q }); near.sort((a, b) => a.q - b.q); near.length = Math.min(8, near.length); } }
  dPool.forEach((g, i) => {
    const e = near[i]; let b = e && dCache.get(e.d.item.id);
    if (e && b === undefined) { try { b = bake(makeItem(e.d.item.id)); } catch (_) { b = null; } dCache.set(e.d.item.id, b); }
    g.visible = !!b; if (!b) return;
    if (g.children[0].geometry !== b.body) { g.children[0].geometry = b.body; g.children[1].geometry = b.ink; }
    g.position.set(e.d.x, 0.12 + (RM === 1 ? 0.03 * Math.sin(now / 500 + i) : 0), e.d.y); g.rotation.y = RM === 1 ? now / 2500 + i : i; g.scale.setScalar(0.6);
  });
  // anel sob o zumbi preparando o bote
  const T = G.target && typeof G.target === 'object' ? G.target : G.zombies.find(z => z.id === G.target);
  ring.visible = !!T; if (T) { ring.position.set(T.x, 0.03, T.y); ring.scale.setScalar(1 + (RM === 1 ? 0.1 * Math.sin(now / 120) : 0)); }

  // efeitos (reaproveitados)
  for (const ev of G.events) {
    if (ev.type === 'shot') {
      const l = shots.find(s => !s.visible) || shots[0], a = l.geometry.attributes.position, dir = ev.dir ?? p.dir;
      a.setXYZ(0, p.x, 1.1, p.y); a.setXYZ(1, p.x + Math.cos(dir) * 3, 1.1, p.y + Math.sin(dir) * 3); a.needsUpdate = true;
      l.visible = true; l.userData.end = now + 80;
    } else if (ev.type === 'armorBreak') {
      const c = { head: 0xff5c57, torso: 0x9b6a3c, legs: 0x9aa3b5 }[ev.part] || 0x9aa3b5;
      for (let i = 0; i < 5; i++) { const m = brk.find(s => !s.visible) || brk[i]; m.material = cmat(c); m.position.set(p.x, 1, p.y); m.userData = { end: now + 300, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 4 }; m.visible = true; }
    } else if (ev.type === 'burn') {
      const z = ev.id === 'player' ? p : G.zombies.find(q => q.id === ev.id), m = hits.find(s => !s.visible) || hits[0];
      if (z) { m.position.set(z.x, 1, z.y); m.scale.setScalar(2.4); m.visible = true; m.userData.end = now + 220; }
    } else if (ev.type === 'hit') {
      const m = hits.find(s => !s.visible) || hits[0]; m.position.set(ev.x ?? p.x, 1, ev.y ?? p.y); m.visible = true; m.userData.end = now + 80;
    }
  }
  for (const m of brk) if (m.visible) { const u = m.userData; if (now >= u.end) m.visible = false; else { u.vy -= 14 * dt; m.position.x += u.vx * dt; m.position.y = Math.max(0.05, m.position.y + u.vy * dt); m.position.z += u.vz * dt; m.rotation.x += 8 * dt; m.rotation.z += 6 * dt; } }
  for (const o of shots) if (o.visible && now >= o.userData.end) o.visible = false;
  for (const o of hits) if (o.visible && now >= o.userData.end) { o.visible = false; o.scale.setScalar(1); }

  // camera ~55 graus
  const dc = p.car && G.cars.find(c => c.id === p.car), k = 1 - Math.exp(-dt * 3);
  cSm.x += ((dc ? Math.cos(dc.dir) * dc.speed * 0.4 : 0) - cSm.x) * k; cSm.y += ((dc ? Math.sin(dc.dir) * dc.speed * 0.4 : 0) - cSm.y) * k; cSm.d += ((dc ? 1.25 : 1) - cSm.d) * k;
  const d = camera.userData.d * cSm.d, el = 0.96, fx = p.x + cSm.x, fy = p.y + cSm.y;
  scene.fog.near = d + 2; scene.fog.far = d + 30;
  camera.position.set(fx, 0.5 + d * Math.sin(el), fy + d * Math.cos(el));
  camera.lookAt(fx, 0.5, fy);
  renderer.render(scene, camera);
}

// ---------- itens 3D (icone e giro) no MESMO renderer ----------
let iRig, iS, iC, iRT, iPivot, iR = 1, spinT = 0, spinRaf = 0, spinCv = null, spinId = null;
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
  for (const o of iPivot.children) o !== iRig?.g && o.traverse(x => x.isMesh && x.geometry.dispose());
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
  if (t - spinT < 100) return; spinT = t;
  if (demoRig) demoPose(t); else iPivot.rotation.y = t / 1000 * 0.8;
  const cv = spinCv.getContext('2d'); cv.imageSmoothingEnabled = false;
  const tmp = spinTick.c || (spinTick.c = document.createElement('canvas')); tmp.width = tmp.height = 160;
  tmp.getContext('2d').putImageData(itemShot(160), 0, 0);
  cv.clearRect(0, 0, spinCv.width, spinCv.height); cv.drawImage(tmp, 0, 0, spinCv.width, spinCv.height);
}
function spin(canvas, id) {
  spinStop(); demoRig = null;
  if (!canvas || !renderer || !itemLoad(id)) return;
  spinCv = canvas; spinId = id; spinRaf = requestAnimationFrame(spinTick);
}
// demos de acao: jogador de armadura completa repetindo a acao num loop de 1,2 s (mesmo renderer, mesmo RT do spin)
const DEMO = { run: ['run'], crouch: ['crouch'], jump: ['idle', 'jump'], equip: ['idle', 'equip'], siphon: ['crouch', 'siphon'], throw: ['idle', 'throw'], craft: ['idle', 'craft'], search: ['idle', 'search'] };
function demoPose(t) {
  const [mv, act] = DEMO[spinId], s = t / 1000, c = s % 1.2, rig = demoRig;
  for (const n in rig.P) { rig.P[n].position.copy(rig.P[n].userData.p0); rig.P[n].rotation.set(0, 0, 0); rig.P[n].scale.set(1, 1, 1); }
  rig.g.rotation.set(0, 0.5, 0); rig.g.scale.set(1, 1, 1); rig.g.position.set(0, 0, 0);
  const ph = pPh; pPh = s * 6; bt = s; // reaproveita a fase global so durante a pose
  pose(rig, mv, act, c, 1); pPh = ph;
  if (act === 'jump') rig.g.position.x = -0.6 + 1.2 * Math.min(1, c / 0.6);
}
function demo(canvas, id) {
  if (!DEMO[id]) return spin(canvas, id);
  spinStop(); itemSetup();
  if (!iRig) iRig = mkRig({ head: 1, torso: 1, legs: 1 });
  iPivot.clear(); iPivot.rotation.y = 0; iPivot.add(iRig.g); demoRig = iRig;
  iC.position.set(0.7, 0.4, 0.9).normalize().multiplyScalar(5.6); iC.lookAt(0, 0.95, 0); iC.updateMatrixWorld();
  spinCv = canvas; spinId = id; spinRaf = requestAnimationFrame(spinTick);
}

window.R = { init, draw, icon, spin, demo, info: () => ({ calls: renderer.info.render.calls, verts: lastBake.verts, ms: lastBake.ms }), mem: () => renderer.info.memory.geometries, chunks: () => chunks.size };
