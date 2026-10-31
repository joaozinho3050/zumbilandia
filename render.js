// Render do Zumbilandia (fase 0.2): three.js pixelado, cenario fundido por chunk. So le G, nunca muta.
import * as THREE from './lib/three.module.min.js'; // relativo: dispensa o importmap (iOS < 16.4)
import { makePlayer, makeZombieParts, makeCar, makeTree, makeFence, makeHouse, makeItem, makeWallSeg, makeRoof, makeMarketRoof, makeDoor, makeFurniture, makeFloor, makeDoorFrame, makeDoorstep, makePadlock, makeProp, makeStairs, makeGate, makeSlab, outline } from './modelos.js';

const ROTY = [0, Math.PI / 2, Math.PI, -Math.PI / 2], CH = 40, INK = 0x15121a, SIDES = ['n', 's', 'w', 'e'], LOOKS = [0xa77bd1, 0x5b7bd5, 0x9b6a3c, 0x78a865, 0xd6cfc4, 0xff8c69, 0x4a5266, 0x2f3a6b, 0xe6f7ff, 0x5b7bd5]; // 8 jaleco, 9 macacao (roupa por lugar; sem call nova)
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
let sickBend = false, lastBake = { verts: 0, ms: 0 }, bakes = 0, canIM, canIK, bdIM, cuIM, nzRings = [], canRoll = new Map();
let ground; const mkRoof = new Map(); // id do mercado -> [corpo, contorno]
let zIM, zIK, zParts, plP, zPs = [], eqSig = '000', dPool = [], dCache = new Map(), ring, brk = [], demoRig = null, plRig, tIM, tIK, tSig = '', tList = [], bt = 0, pPh = 0, pPx = 0, pPy = 0, pV = 0, RM = 1, zIMs = [],
   carIM, carIK, crIM = [], roofIM = [], doorIM, roofSig = '', doorA = new Map(), lastDraw = 0, playerPivot, zData = new Map(), frame = 0,
   doorB, wallIM, padIM, padFall = [], hl, hlG = new Map(), doorT = new Map(), doorSh = new Map(), aimRing, seenIM, crB = [], ZBODY, lookC = [], roof2IM = [], gateB, stairB, up = null, cH = 0, wallBase = 0;
const FLH = 2.4; // altura de um andar (m)
const stairRy = S => Math.abs(S.h) > Math.abs(S.w) ? (S.ly1 > S.ly0 ? 0 : Math.PI) : (S.lx1 > S.lx0 ? Math.PI / 2 : -Math.PI / 2); // +z do modelo = sentido da subida
const dummy = new THREE.Object3D(), zR = new THREE.Matrix4(), zM = new THREE.Matrix4(), zB = new THREE.Matrix4(), zQ = new THREE.Quaternion(), zE = new THREE.Euler(), zV = new THREE.Vector3(), zS = new THREE.Vector3(1, 1, 1);
const shots = [], hits = [], wc0 = new THREE.Color();
let spillIM, flash, devLn = null, devEl = null, devCh = '', devT = 0, devN = 0, own, ownId = null, lidA = 0, cSm = { x: 0, y: 0, d: 1 }, sPool = [], sT = 0, fireIM, flameIM, flights = [], bottle = null;
const OWN_LAMP = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const OWN_BEAM = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.14, depthWrite: false, fog: false });
const SMOKE = new THREE.MeshBasicMaterial({ color: 0xbfc4cc }), BOOM = new THREE.MeshBasicMaterial({ color: 0xff8a2b });
const hsh = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }; // ids podem ser texto
const puff = (x, y, z, vx, vz, vy = 0.7, sc = 1, mat = SMOKE) => { const m = sPool.find(s => !s.visible); if (!m) return; m.material = mat; m.position.set(x, y, z); m.userData = { t: 0, vx, vz, vy, sc }; m.scale.setScalar(0.08); m.visible = true; };

const EL = 0.96; let VIEW_R = 7; // 100 % = raio 7 m (dono); R.zoom(%) ajusta
function camDist() { // menor d tal que (±R,0) e (0,±R) do chao projetam em |ndc|<=1 (camera olhando de EL)
  const c = camera, v = new THREE.Vector3();
  for (let d = 3; d < 120; d += 0.5) {
    c.position.set(0, 0.5 + d * Math.sin(EL), d * Math.cos(EL)); c.lookAt(0, 0.5, 0); c.updateMatrixWorld(true);
    if ([[VIEW_R, 0], [-VIEW_R, 0], [0, VIEW_R], [0, -VIEW_R]].every(([x, z]) => { v.set(x, 0, z).project(c); return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1; })) return d;
  }
  return 120;
}
function size() {
  renderer.setSize(Math.max(1, (innerWidth * f) | 0), Math.max(1, (innerHeight * f) | 0), false);
  const a = innerWidth / innerHeight;
  camera.aspect = a;
  camera.updateProjectionMatrix();
  camera.userData.d = camDist(); // raio minimo de VIEW_R m no chao em qualquer direcao da tela (dono)
  scene.fog.near = camera.userData.d + 14; scene.fog.far = camera.userData.d + 34;
  camera.far = camera.userData.d + 70; camera.updateProjectionMatrix();
  { // G.viewR = raio visivel no chao (eixo maior): zumbi so fica sabendo do jogador se estiver na tela
    const c = camera, v = new THREE.Vector3(), d = c.userData.d; c.position.set(0, 0.5 + d * Math.sin(EL), d * Math.cos(EL)); c.lookAt(0, 0.5, 0); c.updateMatrixWorld(true);
    let m = 0; for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { v.set(nx, ny, 0.5).unproject(c).sub(c.position).normalize(); if (v.y < -1e-3) { const t = -c.position.y / v.y; m = Math.max(m, Math.hypot(c.position.x + v.x * t, c.position.z + v.z * t)); } }
    if (m > 0 && window.G) window.G.viewR = m;
  }
}

// ---------- cenario ----------
const plane = (g, w, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), cmat(c)); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); g.add(m); };
const box = (g, w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cmat(c)); m.position.set(x, y, z); g.add(m); };

function houseSide(h) { // lado ('w','e','n','s' = -x,+x,-y,+y) com a via mais perto (grade ou way): sonda G.onRoad a partir do meio de cada parede
  let best = 'n', bd = 20.5;
  for (const [s, dx, dy] of [['w', -1, 0], ['e', 1, 0], ['n', 0, -1], ['s', 0, 1]])
    for (let d = 0; d < bd; d += 0.5) if (window.G.onRoad(h.x + h.w / 2 + dx * (h.w / 2 + d), h.y + h.h / 2 + dy * (h.h / 2 + d))) { bd = d; best = s; break; }
  return best;
}
// tira de quad ao longo da polilinha pts (largura 2*hw, y fixo): normais medias nos vertices => sem frestas nas curvas; cor via material (collect)
function stripMesh(pts, hw, y, c) {
  const v = [], L = [], R = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    L.push([p[0] + nx * hw, p[1] + nz * hw]); R.push([p[0] - nx * hw, p[1] - nz * hw]);
  });
  for (let i = 0; i + 1 < pts.length; i++) for (const q of [[L[i], L[i + 1], R[i]], [R[i], L[i + 1], R[i + 1]]]) for (const p of q) v.push(p[0], y, p[1]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  return new THREE.Mesh(g, cmat(c));
}
// tracejado: pedacos de 1,2 m a cada 2,4 m de arco (uma malha so)
function dashMesh(pts, y, c) {
  const v = []; let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], l = Math.hypot(x1 - x0, z1 - z0); if (!l) continue;
    const dx = (x1 - x0) / l, dz = (z1 - z0) / l;
    for (let t = (2.4 - acc % 2.4) % 2.4; t + 1.2 <= l; t += 2.4) {
      const ax = x0 + dx * t, az = z0 + dz * t, bx = ax + dx * 1.2, bz = az + dz * 1.2, nx = -dz * 0.075, nz = dx * 0.075;
      for (const p of [[ax + nx, az + nz], [bx + nx, bz + nz], [ax - nx, az - nz], [ax - nx, az - nz], [bx + nx, bz + nz], [bx - nx, bz - nz]]) v.push(p[0], y, p[1]);
    }
    acc += l;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  return new THREE.Mesh(g, cmat(c));
}
const warned = new Set(); // kind sem modelo cai em 'box' (um aviso por kind), nunca lanca
function furn(kind, o) { try { return makeFurniture(kind, o); } catch (_) { if (!warned.has(kind)) { warned.add(kind); console.warn('movel sem modelo, usando box: ' + kind); } return makeFurniture('box', o); } }
// frente do movel (+z local) para longe da parede onde encosta (c.wall 0=-y,1=+y,2=-x,3=+x); livre (-1): para o centro do comodo
const WALL_RY = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
function furnRy(c, hs) {
  if (c.wall >= 0) return WALL_RY[c.wall];
  const h = hs.find(q => c.x >= q.x && c.x <= q.x + q.w && c.y >= q.y && c.y <= q.y + q.h);
  const m = h && ((h.rooms || []).find(q => (q.floor || 0) === (c.floor || 0) && c.x >= q.x0 && c.x <= q.x1 && c.y >= q.y0 && c.y <= q.y1) || { x0: h.x, y0: h.y, x1: h.x + h.w, y1: h.y + h.h });
  if (!m) return 0;
  const dx = (m.x0 + m.x1) / 2 - c.x, dy = (m.y0 + m.y1) / 2 - c.y;
  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return 0;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Math.PI / 2 : -Math.PI / 2) : (dy > 0 ? 0 : Math.PI);
}
function buildChunk(cx, cy, src) {
  const g = new THREE.Group(), ox = cx * CH, oy = cy * CH, dst = [];
  const rural = src.zone === 'rural';
  plane(g, CH, CH, 0x8fd16a, ox + 20, 0, oy + 20);
  if (rural) plane(g, 20, 20, 0x86c763, ox + 10 + 20 * ((cx + cy) & 1), 0.005, oy + 10 + 20 * (cx & 1)); // pasto: mancha de 20 m (tom alternado da grama)
  else for (const B of src.lots) { // quadras alternam o tom da grama (recortadas no chunk)
    const x0 = Math.max(B.x, ox), x1 = Math.min(B.x + B.w, ox + CH), y0 = Math.max(B.y, oy), y1 = Math.min(B.y + B.h, oy + CH);
    if (((B.i + B.j) & 1) === 0 && x1 - x0 > 0.1 && y1 - y0 > 0.1) plane(g, x1 - x0, y1 - y0, 0x86c763, (x0 + x1) / 2, 0.005, (y0 + y1) / 2);
  }
  for (const r of src.roads) plane(g, r.w, r.h, 0x5e5b6b, r.x + r.w / 2, 0.01, r.y + r.h / 2);
  for (const w of src.ways) g.add(stripMesh(w.pts, w.w / 2 + 1.2, 0.008, 0xd6cfc4), stripMesh(w.pts, w.w / 2, 0.01, 0x5e5b6b), dashMesh(w.pts, 0.02, 0xf2d16b)); // estrada: calcada, asfalto, faixa tracejada
  const bal = src.props.filter(q => q.balao);
  for (const r of src.roads) { // calcada (5 cm, 0,6 m fora do asfalto) e faixa central tracejada, so fora dos cruzamentos (e do balao)
    const hz = r.w >= r.h, a0 = hz ? r.x : r.y, a1 = hz ? r.x + r.w : r.y + r.h, c0 = hz ? r.y : r.x, wd = hz ? r.h : r.w, mid = c0 + wd / 2;
    const cuts = e => src.roads.filter(o => o !== r && (hz ? o.y < e && o.y + o.h > e : o.x < e && o.x + o.w > e)).map(o => hz ? [o.x, o.x + o.w] : [o.y, o.y + o.h]);
    const free = (e, ex = []) => { const out = []; let s = a0; for (const [p, q] of cuts(e).concat(ex).sort((u, v) => u[0] - v[0])) { if (p > s) out.push([s, p]); s = Math.max(s, q); } if (s < a1) out.push([s, a1]); return out; };
    for (const e of [c0 - 0.3, c0 + wd + 0.3]) for (const [s, t] of free(e)) if (t - s > 0.2) { if (hz) box(g, t - s, 0.05, 0.6, 0xd6cfc4, (s + t) / 2, 0.025, e); else box(g, 0.6, 0.05, t - s, 0xd6cfc4, e, 0.025, (s + t) / 2); }
    for (const [s, t] of free(mid, bal.filter(b => Math.abs((hz ? b.y : b.x) - mid) < 0.6).map(b => hz ? [b.x - 7, b.x + 7] : [b.y - 7, b.y + 7]))) if (t - s > 1.2) g.add(dashMesh(hz ? [[s, mid], [t, mid]] : [[mid, s], [mid, t]], 0.02, 0xf2d16b));
  }
  for (const b of bal) { // balao: meio-fio em volta do canteiro e faixa circular tracejada (o asfalto ja e o cruzamento)
    const ring = (r0, r1, y, c) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 28), cmat(c)); m.rotation.x = -Math.PI / 2; m.position.set(b.x, y, b.y); g.add(m); };
    ring(2.1, 2.6, 0.03, 0xd6cfc4);
    g.add(dashMesh(Array.from({ length: 21 }, (_, i) => [b.x + Math.cos(i / 20 * 6.2832) * 4.6, b.y + Math.sin(i / 20 * 6.2832) * 4.6]), 0.02, 0xf2d16b));
  }
  for (const h of src.houses) {
    if (h.parts) { // interior: chao + base 0,8 m das paredes (portas ficam de fora, sao instanciadas)
      for (const m of h.rooms.filter(m => !m.floor)) { const f = makeFloor(m.x1 - m.x0, m.y1 - m.y0); f.position.set((m.x0 + m.x1) / 2, 0, (m.y0 + m.y1) / 2); g.add(f); } // chao por comodo (L: o recorte fica sem piso)
      for (const d of h.doors) { // batente + soleira/capacho voltados para fora; so a folha e instanciada
        const ax = d.w >= d.h, o = ax ? (d.y < h.y + h.h / 2 ? -1 : 1) : (d.x < h.x + h.w / 2 ? -1 : 1), wc = h.sign ? 0xd6cfc4 : WALL[h.pal], L = Math.max(d.w, d.h);
        const x = ax ? (o < 0 ? d.x + d.w : d.x) : d.x + d.w / 2, z = ax ? d.y + d.h / 2 : (o < 0 ? d.y : d.y + d.h), ry = ax ? (o < 0 ? Math.PI : 0) : (o < 0 ? -Math.PI / 2 : Math.PI / 2);
        dst.push([wc, L, x, z, ry, d.gate]);
      }
      for (const p of h.parts) {
        if (p.door || p.floor) continue;
        const m = makeWallSeg(Math.max(p.w, p.h), 0.8, 0.2, h.sign ? 0xd6cfc4 : WALL[h.pal]); m.position.set(p.x + p.w / 2, 0, p.y + p.h / 2); if (p.h > p.w) m.rotation.y = Math.PI / 2; g.add(m);
      }
      continue;
    }
    const s = houseSide(h), K = 1.6, sw = s === 'e' || s === 'w';
    const m = makeHouse((sw ? h.h : h.w) / K, (sw ? h.w : h.h) / K, s);
    m.scale.setScalar(K); m.position.set(h.x + h.w / 2, 0, h.y + h.h / 2); g.add(m);
  }
  // arvores: InstancedMesh unico (tronco+copa, 2 calls) balancando inteiro, mais barato que separar a copa
  for (const e of src.fences) { const hz = e.w >= e.h, m = makeFence(Math.max(e.w, e.h)); m.position.set(e.x + e.w / 2, 0, e.y + e.h / 2); if (!hz) m.rotation.y = Math.PI / 2; g.add(m); }
  const P = [[], []], C = []; collect(g, P, C);
  for (const [wc, L, x, z, ry, gt] of dst) { stamp(P, C, 'fr' + wc + L, () => makeDoorFrame(L, 2.0, wc), x, 0, z, ry); if (!gt) stamp(P, C, 'st' + L, () => makeDoorstep(L), x, 0, z, ry); }
  for (const h of src.houses) if (h.stairs) { const S = h.stairs; stamp(P, C, 'stairs', makeStairs, S.x + S.w / 2, 0, S.y + S.h / 2, stairRy(S)); } // escada do sobrado (o topo encosta na laje do andar 1)
  for (const q of src.props) { if (q.kind === 'can') continue; /* lata e dinamica (canIM) */ const k = q.kind === 'pole' ? 'lamp' : q.kind === 'canteiro' && q.balao ? 'canteiro_g' : q.kind === 'graf' ? 'graf' + q.t + (q.sm ? 's' : '') : q.kind; try { stamp(P, C, 'p' + k, () => makeProp(k), q.x, 0, q.y, q.a || 0); } catch (_) {} }
  for (const t of src.tanks) stamp(P, C, 'ptank', () => makeProp('tank'), t.x, 0, t.y, 0); // tampa do tanque do posto
  for (const c of src.crates) { // moveis (cache por kind+estado); frente aponta para o centro do lote
    if (!c.w || c.floor) continue; // andar 1: so no mesh preguicoso
    const op = !!c.opened && !c.scenery && c.kind !== 'register'; // cenario e caixa registradora nunca aparecem vasculhados
    stamp(P, C, c.kind + (c.kind === 'corpse' ? c.look | 0 : '') + (op ? '+' : c.locked ? 'L' : '-'), () => furn(c.kind, { open: op, locked: !!c.locked, look: c.look }), c.x, 0, c.y, furnRy(c, src.houses));
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
  const group = buildChunk(cx, cy, { zone: G.zone(cx * CH + 20, cy * CH + 20).zona, ways: only(G.ways, k), roads: only(G.roads, k), houses: only(G.houses, k), trees: only(G.trees, k), fences: only(G.fences, k), crates: only(G.crates, k), props: only(G.props || [], k), tanks: only(G.tanks, k), lots: G.layout(cx, cy).lots });
  lastBake.ms = performance.now() - t0; bakes++;
  scene.add(group); chunks.set(k, { group, sig });
}
// assinatura do chunk = so os cadeados de movel ainda fechados; abrir movel NAO refaz o bake (o marcador verde e o seenIM)
const lockSig = (G, k) => { let s = ''; for (const c of G.crates) if (c.ch === k && c.w && c.locked) s += c.id; return s; };
let seenEp = -1;
function syncChunks(G) {
  if (G._ep !== seenEp) { seenEp = G._ep; for (const c of chunks.values()) free(c); chunks.clear(); seenGen = -1; queue = []; } // mundo novo (G.init/load): descarta o bake do mundo antigo, mesmo com as mesmas chaves de chunk
  if (G.chunkGen !== seenGen) {
    seenGen = G.chunkGen;
    const want = new Set(G.loaded);
    for (const [k, c] of chunks) if (!want.has(k)) { free(c); chunks.delete(k); }
    queue = G.loaded.filter(k => !chunks.has(k));
  }
  if (G.events.some(e => e.type === 'cut')) for (const [k, c] of chunks) if (lockSig(G, k) !== c.sig) { free(c); mkChunk(G, k, lockSig(G, k)); return; } // cadeado cortado: rebake so deste chunk
  if (!queue.length) return;
  const p = G.player, dist = k => { const [x, y] = k.split(',').map(Number); return (x * CH + CH / 2 - p.x) ** 2 + (y * CH + CH / 2 - p.y) ** 2; };
  let bi = 0; for (let i = 1; i < queue.length; i++) if (dist(queue[i]) < dist(queue[bi])) bi = i;
  const k = queue.splice(bi, 1)[0];
  if (chunks.has(k) || !G.loaded.includes(k)) return;
  mkChunk(G, k, lockSig(G, k));
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
  const ci = new THREE.Group(); ci.add(...pair(bake(makeItem('cutter')))); ci.rotation.z = Math.PI; P.cutter = new THREE.Group(); P.cutter.add(ci); P.cutter.position.set(0, -0.45, 0.12); P.cutter.visible = false; P.armR.add(P.cutter);
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
  const crack = P.crack = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([[0, 0.12, 0], [0.02, -0.1, 0.05], [0, 0.02, 0], [0.02, 0.05, -0.18], [0, 0.02, 0], [0.02, -0.06, 0.2], [0.02, 0.05, -0.18], [0.02, 0.1, -0.2]].map(a => new THREE.Vector3(...a))), new THREE.LineBasicMaterial({ color: 0xeaf2f8 })); crack.position.set(0.36, 0.78, 0); crack.rotation.z = -0.9; crack.visible = false; body.add(crack);
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
  sickBend = !!(window.G && G.player && G.player.sick > 29.4);
  pose(plRig, an.move, an.act, an.t, Math.min(1, pV / 0.8));
}
function pose(rig, mv, act, t, k) {
  const P = rig.P, playerG = rig.g, mov = mv === 'walk' || mv === 'run' || mv === 'crouch';
  const amp = (mv === 'run' ? 0.7 : mv === 'crouch' ? 0.3 : 0.436) * k * RM * (mov ? 1 : 0), s = Math.sin(pPh) * amp;
  const cr = mv === 'crouch', bob = mov && RM === 1 ? Math.abs(Math.sin(pPh)) * (mv === 'run' ? 0.06 : 0.04) * k : 0;
  for (const n in P) { P[n].position.copy(P[n].userData.p0); P[n].rotation.set(0, 0, 0); P[n].scale.set(1, 1, 1); }
  playerG.rotation.z = 0; playerG.scale.set(1, 1, 1); playerG.position.y = 0; P.hose.visible = act === 'siphon'; P.cutter.visible = false;
  P.legL.rotation.x = s; P.legR.rotation.x = -s; P.armL.rotation.x = -s; P.armR.rotation.x = s;
  P.body.rotation.x = mv === 'run' ? 0.14 : cr ? 0.1 : 0;
  P.body.position.y += bob - (cr ? 0.15 : 0);
  if (cr) for (const l of [P.legL, P.legR]) { l.scale.y = 0.8; l.position.y = 0.44; }
  if (!mov || RM < 1) P.body.scale.y = 1 + 0.01 * (1 + Math.sin(bt * 2)) * RM;
  const u = x => Math.min(1, t / x);
  if (act === 'swing') { P.armR.rotation.x = -1.75 * Math.sin(Math.PI * u(0.25)); P.body.rotation.y = 0.3 * Math.sin(Math.PI * u(0.25)); }
  else if (act === 'siphon') { const w = Math.sin(t * 6); P.body.rotation.x = 0.5; P.body.position.y -= 0.2; for (const l of [P.legL, P.legR]) { l.rotation.x = -0.9; l.scale.y = 0.75; l.position.y = 0.4; } P.armL.rotation.x = -1.2 + 0.1 * w; P.armR.rotation.x = -1.3 - 0.1 * w; }
  else if (act === 'cut') { const w = Math.max(0, Math.sin(t * 12)); P.body.rotation.x = 0.55; P.body.position.y -= 0.22; for (const l of [P.legL, P.legR]) { l.rotation.x = -0.9; l.scale.y = 0.75; l.position.y = 0.4; } P.armL.rotation.x = -1.25 + 0.15 * w; P.armR.rotation.x = -1.3 + 0.15 * w; P.cutter.visible = true; P.cutter.scale.setScalar(0.65 - 0.06 * w); }
  else if (act === 'throw') { const e = u(0.4); P.armR.rotation.x = e < 0.4 ? 0.8 * sm(e / 0.4) : 0.8 - 3.1 * sm((e - 0.4) / 0.6); P.body.rotation.y = e < 0.4 ? 0.3 * e : 0.12 - 0.5 * (e - 0.4); }
  else if (act === 'shot') P.armR.rotation.x = -1.45 + 0.25 * Math.max(0, 1 - t / 0.15);
  else if (act === 'search') { const w = Math.sin(t * 14); P.armL.rotation.x = -1 + 0.5 * w; P.armR.rotation.x = -1 - 0.5 * w; P.body.rotation.x = 0.15; }
  else if (act === 'eat') { P.armR.rotation.x = -2.3 * sm(u(0.2)) + 0.15 * Math.sin(t * 20); if (sickBend) P.body.rotation.x = 0.7 * RM * Math.sin(Math.PI * u(0.6)); } // comida estragada com enjoo: curva o tronco
  else if (act === 'heal') { P.armL.rotation.x = -1.3 * sm(u(0.2)); P.armR.rotation.x = -1 * sm(u(0.2)) + 0.2 * Math.sin(t * 14); }
  else if (act === 'stairs') { const w = Math.sin(t * 14); P.legL.rotation.x = -0.9 * Math.max(0, w); P.legR.rotation.x = -0.9 * Math.max(0, -w); P.armL.rotation.x = 0.5 * w; P.armR.rotation.x = -0.5 * w; P.body.position.y += 0.05 * Math.abs(w); P.body.rotation.x = 0.12; }
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
  { // tinge so a roupa: vertices da cor da camisa viram branco + tint=1; o shader multiplica so eles pela instanceColor (nenhuma call nova)
    const g = zIMs[0][0].geometry, c = g.attributes.color, t = new Float32Array(c.count), k = new THREE.Color(0xa77bd1);
    for (let i = 0; i < c.count; i++) if (Math.abs(c.getX(i) - k.r) + Math.abs(c.getY(i) - k.g) + Math.abs(c.getZ(i) - k.b) < 0.02) { t[i] = 1; c.setXYZ(i, 1, 1, 1); }
    g.setAttribute('tint', new THREE.BufferAttribute(t, 1));
    ZBODY = BODY.clone();
    ZBODY.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute float tint;\n' + sh.vertexShader.replace('#include <color_vertex>', 'vColor = color.rgb;\n#ifdef USE_INSTANCING_COLOR\nvColor *= mix(vec3(1.0), instanceColor.rgb, tint);\n#endif');
    };
    zIMs[0][0].material = ZBODY; zIMs[0][0].setColorAt(0, new THREE.Color(1, 1, 1));
    lookC = LOOKS.map(c => new THREE.Color(c));
  }
  [tIM, tIK] = instanced(makeTree(), 768);
  [carIM, carIK] = instanced(makeCar(), 24);
  // telhado por paleta x lado da porta: a fachada do lado da porta e removida do modelo (vira 3 pecas em wallIM com vao de 2,0 m)
  const SIDEF = { n: p => p.z < -2.85, s: p => p.z > 2.85, w: p => p.x < -2.85, e: p => p.x > 2.85 };
  roofIM = [0, 1, 2].map(i => SIDES.map(sd => { const m = makeRoof(6, 6, 'ABC'[i]); for (const c of [...m.children]) if (SIDEF[sd](c.position)) m.remove(c); const r = instanced(m, 64); r[0].visible = r[1].visible = false; return r; }));
  roof2IM = [0, 1, 2].map(i => SIDES.map(sd => { const m = makeRoof(6, 6, 'ABC'[i], 2); for (const c of [...m.children]) if (SIDEF[sd](c.position)) m.remove(c); const r = instanced(m, 16); r[0].visible = r[1].visible = false; return r; })); // casca de 2 andares (sobrado)
  gateB = bake(makeGate(2.4)); stairB = bake(makeStairs()); // portao instanciado na wallIM (0 calls extras); gateB so no destaque
  wallIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).setAttribute('color', new THREE.BufferAttribute(new Float32Array(72).fill(1), 3)), BODY, 256);
  wallIM.frustumCulled = false; wallIM.count = 0; wallIM.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(wallIM);
  doorB = bake(makeDoor(1.4)); doorIM = instanced(doorB, 128);
  crB = [false, true].map(o => bake(crateModel(o))); crIM = crB.map(b => instanced(b, 128));
  const pb = bake(makePadlock()); padIM = instanced(pb, 128); padIM[0].setColorAt(0, new THREE.Color(1, 1, 1));
  for (let i = 0; i < 4; i++) { const g = new THREE.Group(); g.add(...pair(pb)); g.visible = false; g.userData = { t: 9 }; scene.add(g); padFall.push(g); }
  hl = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ color: 0xf2d16b, side: THREE.BackSide, transparent: true, opacity: 0.8, depthWrite: false, fog: false })); hl.visible = false; hl.frustumCulled = false; scene.add(hl);
  buildPlayer({}); own = mkCarOwn();
  const sg = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(sg, SMOKE); m.visible = false; m.userData = { t: 9 }; scene.add(m); sPool.push(m); }
  const mb = bake(makeItem('molotov')); // garrafa em voo (2 no ar, 4 calls)
  for (let i = 0; i < 2; i++) { const g = new THREE.Group(); g.add(...pair(mb)); g.visible = false; g.scale.setScalar(1.2); scene.add(g); flights.push(g); }
  const fg = new THREE.ConeGeometry(0.28, 1, 5).translate(0, 0.5, 0); // 4 fogos x 3 chamas, 2 calls
  fireIM = new THREE.InstancedMesh(fg, cmat(0xff7a1f), 24); flameIM = new THREE.InstancedMesh(fg, cmat(0xffd23f), 24);
  spillIM = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x14131a, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 4); spillIM.frustumCulled = false; spillIM.count = 0; scene.add(spillIM);
  flash = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.8, depthWrite: false, fog: false })); flash.visible = false; flash.userData = { t: 9, r: 5 }; scene.add(flash);
  fireIM.frustumCulled = flameIM.frustumCulled = false; fireIM.count = flameIM.count = 0; scene.add(fireIM, flameIM);
  const zq = makeZombieParts({ police: true }); zPs = ['body', 'legL', 'legR'].map(n => instanced(bake(zq[n]), 96));
  const rm = new THREE.MeshBasicMaterial({ color: 0xff5c57, transparent: true, opacity: 0.45, depthWrite: false, fog: false });
  ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 24).rotateX(-Math.PI / 2), rm); ring.visible = false; scene.add(ring);
  seenIM = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.11), new THREE.MeshBasicMaterial({ color: 0x8fd16a, fog: false }), 128); seenIM.frustumCulled = false; seenIM.count = 0; seenIM.visible = false; scene.add(seenIM); // 'visto': 1 draw call so quando ha movel vasculhado (grama 8fd16a)
  [canIM, canIK] = instanced(makeProp('can'), 64); // latas no chao (dinamicas: o chute as move)
  { const bd = new THREE.Group(); for (const a of [0.45, -0.45]) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.03), new THREE.MeshLambertMaterial({ color: 0x9b6a3c, flatShading: true })); m.rotation.z = a; bd.add(m); } // tabuas cruzadas na janela
    const cu = new THREE.Group(); { const cm2 = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.3, 0.03), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })); cm2.position.set(0, 0.12, 0); cu.add(cm2); } // cortina: cor por instancia
    bdIM = instanced(outline(bd), 256); cuIM = instanced(outline(cu), 256); for (const [a, b] of [bdIM, cuIM]) a.visible = b.visible = false; cuIM[0].setColorAt(0, new THREE.Color(1, 1, 1)); }
  for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1e0, transparent: true, opacity: 0.55, depthWrite: false, fog: false })); m.visible = false; m.userData = { t: 9, r: 1 }; scene.add(m); nzRings.push(m); } // anel de ruido (so visual)
  aimRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2d16b, transparent: true, opacity: 0.7, depthWrite: false, fog: false })); aimRing.visible = false; scene.add(aimRing); // mira assistida: anel fino amarelo (maçaneta f2d16b) sob o alvo
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
  const hp = c.hp ?? 100;
  if (o.cid !== c.id) { o.cid = c.id; o.hop = 0; o.hp0 = hp; }
  if (hp < o.hp0 && RM === 1) o.hop = 0.12; o.hp0 = hp; // salto de 120 ms ao bater
  o.hop = Math.max(0, o.hop - dt);
  const hood = hp < 50 ? 0.05 : 0; // capo amassado: frente sobe
  o.body.rotation.set(st.roll + bump, 0, st.pitch + hood); o.body.position.y = Math.abs(bump) * 2 + (o.hop > 0 ? Math.sin(o.hop / 0.12 * Math.PI) * 0.06 : 0);
  o.crack.visible = hp < 75;
  st.ph += v * dt / 2 / 0.19; // v m/s em 1/2 escala do modelo, raio 0,19
  o.w.forEach((w, i) => { w.rotation.x = st.ph; w.rotation.y = i < 2 ? st.steer : 0; });
  lidA += ((trunk ? 1 : 0) - lidA) * Math.min(1, dt * 8); o.lid.rotation.z = -Math.PI / 3 * lidA;
  const on = !!(p.car && p._eng);
  o.lightL.visible = on && hp >= 50; o.lightR.visible = o.beam.visible = on; // farol esquerdo apaga
  if ((on || hp < 25) && RM === 1 && (sT -= dt) <= 0) {
    sT = 0.15; o.g.updateMatrixWorld(true);
    if (hp < 25) { cv3.set(0.6, 0.55, 0); o.body.localToWorld(cv3); puff(cv3.x, cv3.y, cv3.z, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 1.1, 1.3); } // fumaca do capo
    if (on) { o.ex.getWorldPosition(cv3); puff(cv3.x, cv3.y, cv3.z, -Math.cos(c.dir) * 0.3 + (Math.random() - 0.5) * 0.3, -Math.sin(c.dir) * 0.3 + (Math.random() - 0.5) * 0.3); }
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
    roofSig = rs; const rn = new Array(24).fill(0), keep = new Set(); let wn = 0, bn = 0, cn2 = 0; const wc = new THREE.Color();
    const piece = (col, x0, x1, z0, z1, y0, hh) => { if (wn >= 256 || x1 - x0 < 0.01 || z1 - z0 < 0.01) return; place(wallIM, wn, (x0 + x1) / 2, y0, (z0 + z1) / 2, 0, x1 - x0, hh, z1 - z0); wallIM.setColorAt(wn++, wc.set(col)); };
    for (const h of G.houses) {
      if (!h.parts || h.open || !chunks.has(h.ch)) continue; // open: patio do posto, sem telhado
      const s = h.id === p.inside ? 0 : 1;
      if (h.sign) { // telhado plano com letreiro: um objeto (2 calls) por landmark, criado sob demanda (desenhado com a porta ao sul e girado por rot)
        keep.add(h.id); let e = mkRoof.get(h.id);
        if (!e) { e = instanced(makeMarketRoof(h.cw, h.cd, h.dx, h.sign), 1); e[0].count = e[1].count = 1; e[1].instanceMatrix = e[0].instanceMatrix; mkRoof.set(h.id, e); }
        place(e[0], 0, h.x + h.w / 2, 0, h.y + h.h / 2, ROTY[h.rot || 0], s, s, s); e[0].instanceMatrix.needsUpdate = true; continue;
      }
      const two = h.stairs ? 12 : 0, hh = h.stairs ? 3.8 : 1.4, gt = h.doors.find(q => q.gate);
      const vols = h.wing ? [Object.assign({ d: h.doors[0] }, h.main), Object.assign({ d: gt || null, sh: h.wing.sh }, h.wing)] : [{ x: h.x, y: h.y, w: h.w, h: h.h, d: h.doors[0] }]; // L/garagem: um telhado por volume
      for (const v of vols) {
        const d = v.d, ax = d && d.w >= d.h, si = d ? (ax ? (d.y < v.y + v.h / 2 ? 0 : 1) : (d.x < v.x + v.w / 2 ? 2 : 3)) : { y1: 1, y0: 0, x1: 3, x0: 2 }[v.sh], ri = two + h.pal * 4 + si;
        if (rn[ri] >= (two ? 16 : 64)) continue;
        place((two ? roof2IM : roofIM)[h.pal][si][0], rn[ri]++, v.x + v.w / 2, 0, v.y + v.h / 2, 0, s * v.w / 6, s, s * v.h / 6);
        if (s && h.fx !== undefined) { // gv>=2: janelas do andar terreo com tabuas (1/8) ou cortina (2/8); a fachada da porta nao tem janela
          const fx = v === vols[0] ? h.fx : Math.imul(h.fx, 0x9E3779B1) >>> 0, cx0 = v.x + v.w / 2, cy0 = v.y + v.h / 2;
          for (let f = 0; f < 4; f++) {
            if (f === si) continue;
            for (let i = 0; i < 2; i++) {
              const q = (fx >>> (3 * (f * 2 + i))) & 7; if (q > 2) continue;
              const u = (i ? 1 : -1) * 0.25, zf = f < 2, wx = zf ? cx0 + u * v.w : cx0 + (f === 3 ? 1 : -1) * (v.w / 2 + 0.05), wz = zf ? cy0 + (f === 1 ? 1 : -1) * (v.h / 2 + 0.05) : cy0 + u * v.h;
              if (q === 0 && bn < 256) place(bdIM[0], bn++, wx, 1.5, wz, zf ? 0 : Math.PI / 2);
              else if (q && cn2 < 256) { place(cuIM[0], cn2, wx, 1.5, wz, zf ? 0 : Math.PI / 2); cuIM[0].setColorAt(cn2++, wc.set(q === 1 ? 0xff8c69 : 0x5b7bd5)); }
            }
          }
        }
        if (!s || !d) continue;
        const col = WALL[h.pal], t = Math.min(d.w, d.h);
        if (ax) { piece(col, v.x, d.x, d.y, d.y + t, 0.8, hh); piece(col, d.x + d.w, v.x + v.w, d.y, d.y + t, 0.8, hh); piece(col, d.x, d.x + d.w, d.y, d.y + t, 2.0, hh - 1.2); }
        else { piece(col, d.x, d.x + t, v.y + t, d.y, 0.8, hh); piece(col, d.x, d.x + t, d.y + d.h, v.y + v.h - t, 0.8, hh); piece(col, d.x, d.x + t, d.y, d.y + d.h, 2.0, hh - 1.2); }
      }
    }
    for (const [id, e] of mkRoof) if (!keep.has(id)) { scene.remove(...e); e[0].geometry.dispose(); e[1].geometry.dispose(); mkRoof.delete(id); }
    [roofIM, roof2IM].forEach((R2, j) => R2.forEach((r, pi) => r.forEach(([im, ik], si) => { const c = rn[j * 12 + pi * 4 + si]; im.count = ik.count = c; im.visible = ik.visible = c > 0; im.instanceMatrix.needsUpdate = true; ik.instanceMatrix = im.instanceMatrix; })));
    for (const [im, ik, n] of [[bdIM[0], bdIM[1], bn], [cuIM[0], cuIM[1], cn2]]) { im.count = ik.count = n; im.visible = ik.visible = n > 0; im.instanceMatrix.needsUpdate = true; ik.instanceMatrix = im.instanceMatrix; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    wallBase = wn; wallIM.count = wn; wallIM.visible = wn > 0; wallIM.instanceMatrix.needsUpdate = true; if (wallIM.instanceColor) wallIM.instanceColor.needsUpdate = true;
  }
  // portas: pivo na dobradica, giram 90 graus PARA DENTRO da casa em 150 ms; cadeado dourado na altura da macaneta (pulsa a <6 m)
  let dn = 0, ln = 0, gn = 0; doorT.clear();
  for (const h of G.houses) {
    if (!h.parts || !chunks.has(h.ch)) continue;
    for (const d of h.doors) {
      if (dn >= 128) break;
      const ax = d.w >= d.h, hx = h.x + h.w / 2, hy = h.y + h.h / 2;
      if (d.gate) { // portao: painel enrola para cima (escala Y presa ao topo) em 0,3 s
        let u = doorA.get(d.id); if (u === undefined) u = d.open ? 1 : 0; u += Math.max(-dtm / 300, Math.min(dtm / 300, (d.open ? 1 : 0) - u)); doorA.set(d.id, u);
        const Lg = Math.max(d.w, d.h), tg = { x: ax ? d.x : d.x + d.w / 2, z: ax ? d.y + d.h / 2 : d.y, a: ax ? 0 : -Math.PI / 2, sx: Lg / 2.4, sy: 1 - 0.92 * sm(u), sz: 1, gate: true };
        doorT.set(d.id, tg);
        if (wallBase + gn * 5 + 5 <= 256) { // painel + 4 frisos como pecas da wallIM (so cor, sem contorno), a 2,0 m de altura e enrolando para o topo
          const sy = tg.sy, cx = ax ? d.x + Lg / 2 : d.x + d.w / 2, cz = ax ? d.y + d.h / 2 : d.y + Lg / 2, i = wallBase + gn * 5;
          place(wallIM, i, cx, 2.0 - 2.0 * sy, cz, tg.a, Lg, 2.0 * sy, 0.12); wallIM.setColorAt(i, wc0.set(0xeab26a));
          [0.4, 0.85, 1.3, 1.75].forEach((k, j) => { place(wallIM, i + 1 + j, cx, 2.0 - k * sy - 0.025, cz, tg.a, Lg - 0.1, 0.05, 0.16); wallIM.setColorAt(i + 1 + j, wc0.set(0x6e4422)); });
          gn++;
        }
        continue;
      }
      const a0 = ax ? 0 : -Math.PI / 2, o1 = !d.open ? a0 : ax ? (d.y < hy ? -Math.PI / 2 : Math.PI / 2) : (d.x < hx ? 0 : -Math.PI), a1 = d.broken ? a0 + (o1 - a0) * 0.7 : o1; // quebrada: pendurada torta, nunca fecha
      let a = doorA.get(d.id); if (a === undefined) a = a1;
      const st = dtm * Math.PI / 300; a += Math.max(-st, Math.min(st, a1 - a)); doorA.set(d.id, a);
      const sh = doorSh.get(d.id), tr = sh && now < sh && RM === 1 ? Math.sin(now / 25) * 0.06 : 0; // pancada de zumbi: porta treme 0,3 s
      const L = Math.max(d.w, d.h), t = { x: ax ? d.x : d.x + d.w / 2, z: ax ? d.y + d.h / 2 : d.y, a, sx: L / 1.4, sz: 0.9 };
      doorT.set(d.id, t); place(doorIM[0], dn++, t.x, 0, t.z, a + tr, t.sx, d.broken ? 0.85 : 1, t.sz);
      if (d.locked && ln < 128) {
        const o = ax ? (d.y < hy ? -1 : 1) : (d.x < hx ? -1 : 1), px = ax ? d.x + L - 0.3 : d.x + d.w / 2 + o * 0.22, pz = ax ? d.y + d.h / 2 + o * 0.22 : d.y + L - 0.3;
        const near = (px - p.x) ** 2 + (pz - p.y) ** 2 < 36, k = near && RM === 1 ? Math.sin(now / 220) : 0, sc = 3.2 * (1 + 0.1 * k);
        place(padIM[0], ln, px, 0.95, pz, ax ? 0 : Math.PI / 2, sc, sc, sc); padIM[0].setColorAt(ln++, wc0.setScalar(near ? 1.15 + 0.25 * k : 1));
      }
    }
  }
  wallIM.count = wallBase + gn * 5; wallIM.visible = wallIM.count > 0; wallIM.instanceMatrix.needsUpdate = true; if (wallIM.instanceColor) wallIM.instanceColor.needsUpdate = true;
  doorIM[0].count = doorIM[1].count = dn; doorIM[0].instanceMatrix.needsUpdate = true; doorIM[1].instanceMatrix = doorIM[0].instanceMatrix;
  padIM[0].count = padIM[1].count = Math.min(ln, 128); padIM[0].visible = padIM[1].visible = ln > 0; padIM[0].instanceMatrix.needsUpdate = true; padIM[1].instanceMatrix = padIM[0].instanceMatrix;
  if (padIM[0].instanceColor) padIM[0].instanceColor.needsUpdate = true;

  // andar 1 (sobrado): 1 mesh baked sob demanda (paredes, moveis, laje com furo), so ao chegar na escada; visivel so com o jogador la em cima; descartado ao sair da casa
  { const wantUp = p.floor ? p.inside : p.near && p.near.type === 'stairs' ? p.near.id : null, uh = wantUp && G.houses.find(h => h.id === wantUp && h.stairs), fc = uh ? G.crates.filter(c => c.floor && c.ch === uh.ch) : [], us = uh ? uh.id + '|' + fc.reduce((a, c) => a + (c.opened ? 1 : 0), 0) : null;
    if ((up && up.sig) !== us) {
      if (up) { scene.remove(up.g); up.g.children.forEach(m => m.geometry.dispose()); up = null; }
      if (uh) {
        const g = new THREE.Group(), P = [[], []], C = [], cx = uh.x + uh.w / 2, cz = uh.y + uh.h / 2, S = uh.stairs, t0 = performance.now();
        const sl = makeSlab(uh.w, uh.h, { x: S.x + S.w / 2 - cx, z: S.y + S.h / 2 - cz, w: S.w, d: S.h }); sl.position.set(cx, FLH, cz); g.add(sl);
        for (const q of uh.parts) if (q.floor) { const m = makeWallSeg(Math.max(q.w, q.h), 0.8, 0.2, WALL[uh.pal]); m.position.set(q.x + q.w / 2, FLH, q.y + q.h / 2); if (q.h > q.w) m.rotation.y = Math.PI / 2; g.add(m); }
        collect(g, P, C);
        for (const c of fc) if (c.w) { const op = !!c.opened && !c.scenery; stamp(P, C, c.kind + (op ? '+' : '-'), () => furn(c.kind, { open: op }), c.x, FLH, c.y, furnRy(c, G.houses)); }
        const b = geoms(P, C), o = new THREE.Group(); o.add(...pair(b)); scene.add(o); up = { id: uh.id, sig: us, g: o }; lastBake.up = performance.now() - t0;
      }
    }
    if (up) up.g.visible = !!p.floor; }
  ground.position.set(p.x, -0.01, p.y);
  const bk = p.equip && p.equip.back && p.equip.back.id || null;
  const es = ['head', 'torso', 'legs'].map(k => p.equip && p.equip[k] ? 1 : 0).join('') + (bk || '');
  if (es !== eqSig) { eqSig = es; buildPlayer({ head: es[0] === '1', torso: es[1] === '1', legs: es[2] === '1' }, bk); }
  playerG.visible = !p.car; playerG.position.set(p.x, 0, p.y); playerG.rotation.y = Math.PI / 2 - p.dir; animPlayer(p, dtm / 1000); playerG.position.y += FLH * (p.floor || 0);
  const ja = p.action && p.action.type === 'jump' ? p.action : null;
  if (ja && p.anim && p.anim.act === 'jump') { const u = Math.min(1, p.anim.t / 0.6); playerG.position.x = ja.x0 + (ja.x1 - ja.x0) * u; playerG.position.z = ja.y0 + (ja.y1 - ja.y0) * u; }

  // zumbis: 3 InstancedMesh (body, legL, legR) + contorno; so <=20 m recalcula a pose, os outros so a posicao
  let n = 0; const dt = dtm / 1000, seen = new Set(), cn = [0, 0];
  const poseZ = (id, x, y, anim, ang, sc, pol, run, look, fh = 0, fx) => { // fx {crawl, limp, lg (idade do tiro na perna, s)}: poses so por matriz, sem mesh nova
    const k = +id || [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7); // id 'p:12' (zumbi de spawn) em id*1.7 dava NaN: matriz do corpo NaN, so as pernas apareciam
    const S = pol ? zPs : zIMs, n = cn[pol ? 1 : 0]++;
    const cw = !!(fx && fx.crawl), lm = !!(fx && fx.limp), lgA = fx && fx.lg !== undefined ? fx.lg : 9;
    let d = zData.get(id); if (!d) zData.set(id, d = { a: ang, ph: k * 1.7, sw: 0, ro: 0, ln: cw ? 1.35 : 0, fw: 0, l1: cw ? 1.2 : 0, l2: cw ? 1.2 : 0, f });
    d.f = frame; if (look !== undefined) d.lk = look; else if (d.lk === undefined) d.lk = k % 8; sc *= 0.9 + 0.2 * (((k * 37) % 11) / 10); // look 0..7 (game) ou hash do id: cor da roupa + escala 0,9-1,1
    const dd = (x - p.x) ** 2 + (y - p.y) ** 2, act = anim && anim.act, t = anim ? anim.t : 0;
    let ly = cw ? -0.22 : 0; // rastejante: quadril rente ao chao
    if (dd <= 400) {
      const w = anim && anim.move === 'walk';
      if (w) d.ph += dt * (cw ? 2.4 : lm ? 2 : 3.2) * (run ? 1.6 : 1);
      d.sw = w ? 0.45 * Math.sin(d.ph) * RM : 0; d.ro = (w ? 0.105 * Math.sin(d.ph * 0.5) : 0.02 * Math.sin(now / 700 + k)) * RM; d.ln = 0.15; d.fw = 0;
      if (act === 'windup') { const e = Math.min(1, t / 1.0); if (e < 0.7) { const r = sm(e / 0.7); d.ln = 0.15 - 0.3 * r; d.fw = -0.12 * r; } else { const r = sm((e - 0.7) / 0.3); d.ln = -0.15 + 0.65 * r; d.fw = -0.12 + 0.37 * r; } }
      else if (act === 'climb') { d.ln = 0.15 + 0.52 * 0.77; d.sw = 0.8 * Math.sin(t * 10); }
      else if (act === 'hit') { d.ln = 0.5; d.fw = 0.25 + 0.1 * Math.sin(t * 22); }
      d.l1 = d.sw; d.l2 = -d.sw;
      if (cw) { // rastejante: corpo deitado (~77 graus), avanca em impulsos com balanco lateral, pernas arrastando alternadas; windup 1,2 s (ergue e bota)
        const a = w ? Math.sin(d.ph) : 0;
        d.ln = 1.35 + 0.1 * a * a * RM; d.fw = 0.1 * Math.max(0, a) * RM; d.ro = (w ? 0.16 * a : 0.03 * Math.sin(now / 700 + k)) * RM; d.l1 = 1.2 + 0.2 * a * RM; d.l2 = 1.2 - 0.2 * a * RM;
        if (act === 'windup') { const e = Math.min(1, t / 1.2); d.ln = 1.35 - 0.5 * sm(Math.min(1, e / 0.75)) + (e > 0.75 ? 0.6 * sm((e - 0.75) / 0.25) : 0); d.fw = e > 0.75 ? 0.3 * sm((e - 0.75) / 0.25) : 0; }
        else if (act === 'hit') { d.ln = 1.1; d.fw = 0.2; }
      } else if (lm && w && act !== 'windup') { // manco: passo assimetrico (uma perna curta), inclinado para o lado, afundando no passo ruim
        const a = Math.sin(d.ph);
        d.l1 = 0.15 * a * RM; d.l2 = -0.5 * a * RM; d.ln = 0.3 + 0.08 * a * RM; d.ro = (0.14 + 0.08 * a) * RM; ly = -0.07 * Math.max(0, Math.sin(d.ph + 1)) * RM;
      }
    }
    const lk = RM === 1 && lgA < 0.3 ? Math.sin(Math.PI * lgA / 0.3) : 0, hs = act === 'dead' && anim.hs; // lk: dobra de joelho 0,3 s ao levar tiro na perna; hs: queda para tras
    const e = act === 'dead' ? sm(Math.min(1, t / (hs ? 0.3 : 0.5))) : 0;
    dummy.position.set(x, fh + ly - 0.25 * lk + 0.25 * e + (act === 'climb' ? 0.35 + 0.08 * Math.sin(t * 8) : 0), y);
    if (hs) { dummy.rotation.order = 'YXZ'; dummy.rotation.set(-Math.PI / 2 * e, d.a, 0); } else dummy.rotation.set(0, d.a, (cw ? -0.5 : -Math.PI / 2) * e);
    dummy.scale.setScalar(sc); dummy.updateMatrix(); dummy.rotation.order = 'XYZ';
    zR.copy(dummy.matrix);
    zQ.setFromEuler(zE.set(d.ln + 0.35 * lk, 0, d.ro)); zM.compose(zV.set(0, 0.55, d.fw), zQ, zS); S[0][0].setMatrixAt(n, zB.multiplyMatrices(zR, zM)); if (!pol) S[0][0].setColorAt(n, lookC[d.lk]);
    for (let i = 1; i < 3; i++) { zQ.setFromEuler(zE.set((i === 1 ? d.l1 : d.l2) + (lk && (i === 1) === ((k & 1) === 0) ? 0.9 * lk : 0), 0, 0)); zM.compose(zV.set(i === 1 ? -0.15 : 0.15, 0.55, 0), zQ, zS); S[i][0].setMatrixAt(n, zB.multiplyMatrices(zR, zM)); }
  };
  const upH = p.floor ? G.houses.find(h => h.id === p.inside) : null;
  for (const z of G.zombies) {
    if (cn[0] + cn[1] >= 96) break;
    if ((z.floor || 0) !== (p.floor || 0) && (z.floor || (upH && z.x > upH.x && z.x < upH.x + upH.w && z.y > upH.y && z.y < upH.y + upH.h))) continue; // andar de cima so aparece para quem esta la (e o terreo some sob a laje)
    const d = zData.get(z.id), ang0 = z.state === 'idle' && z.face !== undefined ? Math.atan2(Math.cos(z.face), Math.sin(z.face)) : Math.atan2(p.x - z.x, p.y - z.y); // parado: olha para z.face (costas = ataque furtivo)
    if (d) {
      const dx = z.x - d.x, dy = z.y - d.y;
      if (dx * dx + dy * dy > 1e-5) d.a = Math.atan2(dx, dy); else d.a = ang0;
      d.x = z.x; d.y = z.y;
    }
    poseZ(z.id, z.x, z.y, z.anim, ang0, z.state === 'attack' ? 1 + 0.12 * Math.abs(Math.sin(now / 45)) : 1, z.police, z.runner, Number.isInteger(z.look) ? z.look : z.look === 'jaleco' ? 8 : z.look === 'macacao' ? 9 : undefined, FLH * (z.floor || 0), z.crawl || z.limp || z.lg !== undefined ? { crawl: z.crawl, limp: z.limp, lg: z.lg !== undefined ? G.t - z.lg : undefined } : undefined);
    const q = zData.get(z.id); q.x = z.x; q.y = z.y; seen.add(z.id);
  }
  for (const y of G.dying) if (cn[0] + cn[1] < 96 && !seen.has(y.id)) poseZ(y.id, y.x, y.y, y.anim, 0, 1, false, false, undefined, 0, y.crawl ? { crawl: true } : undefined);
  if (zData.size > cn[0] + cn[1] + 32) for (const [k, d] of zData) if (d.f !== frame) zData.delete(k);
  [zIMs, zPs].forEach((S, j) => { for (const [im, ik] of S) { im.count = ik.count = cn[j]; im.instanceMatrix.needsUpdate = true; ik.instanceMatrix = im.instanceMatrix; } });
  if (zIMs[0][0].instanceColor) zIMs[0][0].instanceColor.needsUpdate = true;

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
  for (const c of G.cars) {
    if (n >= 24) break; if (c === oc) continue;
    const hp = c.hp ?? 100, g = c.burnt ? 0.2 : hp < 25 ? 0.5 : hp < 50 ? 0.65 : hp < 75 ? 0.82 : 1;
    const bl = c.alarmT > 0 ? (RM === 1 ? (Math.floor(now / 250) & 1 ? 1.6 : 1) : 1.3) : 1; // alarme: carroceria/farois piscam (reduced-motion: acesa fixa)
    carIM.setColorAt(n, wc0.setRGB(g * bl, g * bl, g * bl)); place(carIM, n++, c.x, 0, c.y, -c.dir, 2, c.burnt ? 1.92 : 2, 2.1);
  }
  carIM.count = carIK.count = n; carIM.instanceMatrix.needsUpdate = true; if (carIM.instanceColor) carIM.instanceColor.needsUpdate = true; carIK.instanceMatrix = carIM.instanceMatrix;

  own.g.visible = !!oc;
  if (oc) carOwnDraw(oc, p, dt, now, tr === oc.id);
  else if (!ownId) lidA = 0;
  for (const m of sPool) if (m.visible) { const u = m.userData; u.t += dt; const k = u.t / 0.9; if (k >= 1) m.visible = false; else { m.position.x += u.vx * dt; m.position.y += (u.vy ?? 0.7) * dt; m.position.z += u.vz * dt; m.scale.setScalar((u.sc || 1) * (0.08 + 0.2 * Math.min(1, k / 0.6)) * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1)); } }

  // molotov em voo (arco) e fogo no chao (3 chamas por fogo, cap 4)
  flights.forEach((g, i) => { const f = G.flights[i]; g.visible = !!f; if (!f) return; const u = Math.min(1, f.t / f.T); g.position.set(f.x0 + (f.x - f.x0) * u, 0.9 + 3.2 * u * (1 - u) * 1 + 0.3 * u * 0, f.y0 + (f.y - f.y0) * u); g.rotation.set(u * 14, 0, u * 6); });
  let fn = 0;
  for (const f of G.fires.slice(0, 4)) {
    const age = G.t - f.t0, mx = f.max || 3, k = Math.min(1, age / 0.25) * Math.min(1, Math.max(0, (mx - age) / 0.5));
    for (let j = 0; j < 3; j++) {
      const a = j * 2.1 + f.x, r = j ? (f.r || 2) * 0.25 : 0, fl = RM === 1 ? 0.75 + 0.25 * Math.sin(now / 90 + j * 2 + f.y) : 1, h = (1.25 - 0.3 * j) * fl * k;
      place(fireIM, fn, f.x + Math.cos(a) * r, 0, f.y + Math.sin(a) * r, now / 700 + j, 1.2 * k, h, 1.2 * k);
      place(flameIM, fn++, f.x + Math.cos(a) * r, 0, f.y + Math.sin(a) * r, 0, 0.6 * k, h * 0.6, 0.6 * k);
    }
  }
  let cb = 0; // carros em chamas (max 4): 3 chamas + fumaca; mesmo InstancedMesh do fogo
  for (const c of G.cars) {
    if (!(c.burn > 0) || cb >= 4) continue; cb++;
    for (let j = 0; j < 3; j++) {
      const ox = (j - 1) * 0.9, fl = RM === 1 ? 0.75 + 0.25 * Math.sin(now / 90 + j * 2 + hsh(c.id) % 7) : 1, h = 1.6 * fl, ca = Math.cos(c.dir), sa = Math.sin(c.dir);
      place(fireIM, fn, c.x + ca * ox, 0.5, c.y + sa * ox, now / 700 + j, 1.4, h, 1.4);
      place(flameIM, fn++, c.x + ca * ox, 0.5, c.y + sa * ox, 0, 0.7, h * 0.6, 0.7);
    }
    if (RM === 1 && frame % 9 === 0) puff(c.x + (Math.random() - 0.5), 1.4, c.y + (Math.random() - 0.5), 0.2, 0.2, 1.2, 1.6);
  }
  // pocas de gasolina (max 4): disco escuro que cresce em 3 s (300 - tempo restante)
  let sn = 0;
  for (const s of G.spills.slice(0, 4)) { const age = 300 - (s.expires - G.t), k = RM === 1 ? sm(Math.min(1, Math.max(0, age / 3))) : 1; place(spillIM, sn++, s.x, 0.02, s.y, 0, s.r * k, 1, s.r * k); }
  spillIM.count = sn; spillIM.instanceMatrix.needsUpdate = true;
  fireIM.count = flameIM.count = fn; fireIM.instanceMatrix.needsUpdate = flameIM.instanceMatrix.needsUpdate = true;

  // baus
  const cnt = [0, 0];
  for (const c of G.crates) { if (c.w || (c.floor || 0) !== (p.floor || 0)) continue; const k = c.opened ? 1 : 0, im = crIM[k][0]; if (cnt[k] < 128) place(im, cnt[k]++, c.x, FLH * (c.floor || 0), c.y, 0); }
  { let sn = 0; // marcador de vasculhado no topo (so do andar atual, 1 InstancedMesh)
    for (const c of G.crates) if (c.opened && !c.scenery && c.kind !== 'register' && (c.floor || 0) === (p.floor || 0) && sn < 128) place(seenIM, sn++, c.x, FLH * (c.floor || 0) + (c.w ? FH[c.kind] || 1 : 0.6) + 0.28 + (RM === 1 ? 0.04 * Math.sin(now / 400 + sn) : 0), c.y, RM === 1 ? now / 700 : 0);
    seenIM.count = sn; seenIM.visible = sn > 0; seenIM.instanceMatrix.needsUpdate = true; }
  { let cn = 0; // latas (max 64 a <= 14 m): chute = desliza 1 m em 0,6 s com um pulinho e rolando
    for (const c of G.props) {
      if (c.kind !== 'can' || cn >= 64 || Math.abs(c.x - p.x) > 14 || Math.abs(c.y - p.y) > 14) continue;
      let x = c.x, y = c.y, hop = 0, roll = 0; const r = canRoll.get(c.id);
      if (r) { const k = Math.min(1, (now - r.t0) / 600); x = r.x0 + (c.x - r.x0) * k; y = r.y0 + (c.y - r.y0) * k; if (RM === 1) { hop = 0.08 * Math.sin(Math.PI * k); roll = k * 9; } if (k >= 1) canRoll.delete(c.id); }
      dummy.position.set(x, hop, y); dummy.rotation.order = 'YXZ'; dummy.rotation.set(roll, c.a || 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); canIM.setMatrixAt(cn++, dummy.matrix);
    }
    dummy.rotation.order = 'XYZ'; canIM.count = canIK.count = cn; canIM.visible = canIK.visible = cn > 0; canIM.instanceMatrix.needsUpdate = true; canIK.instanceMatrix = canIM.instanceMatrix; }
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
  // ALVO VISIVEL: casca extra (1 call) com o modelo do alvo de p.near, escalada, emissiva, pulsando
  const nr = !p.car && p.near; let on = false;
  if (nr) {
    let geo, x, z, ry = 0, sx = 1, sy = 1, sz = 1, y = 0;
    if (nr.type === 'door') { const t = doorT.get(nr.id); if (t && t.gate) { geo = gateB.body; x = t.x; z = t.z; y = 2.0; ry = t.a; sx = t.sx * 1.06; sy = t.sy * 1.03; sz = 2.4; } else if (t) { geo = doorB.body; x = t.x; z = t.z; ry = t.a; sx = t.sx * 1.08; sy = 1.05; sz = 2.4; } }
    else if (nr.type === 'stairs') { const h = G.houses.find(q => q.id === nr.id), S = h && h.stairs; if (S) { geo = stairB.body; x = S.x + S.w / 2; z = S.y + S.h / 2; ry = stairRy(S); sx = sz = 1.12; sy = 1.02; } }
    else if (nr.type === 'drop') { const q = G.drops.find(e => e.id === nr.id), b = q && dCache.get(q.item.id); if (b) { geo = b.body; x = q.x; z = q.y; y = 0.12; ry = now / 2500; sx = sy = sz = 0.6 * 1.25; } }
    else { const c = G.crates.find(e => e.id === nr.id); if (c) {
      if (c.w) { const op = !!c.opened && !c.scenery, key = c.kind + op; geo = hlG.get(key); if (!geo) hlG.set(key, geo = bake(furn(c.kind, { open: op })).body); ry = furnRy(c, G.houses); sx = sz = 1.1; sy = 1.06; }
      else geo = crB[c.opened ? 1 : 0].body, sx = sz = 1.15, sy = 1.1;
      x = c.x; z = c.y; y = FLH * (c.floor || 0); } }
    if (geo) { on = true; if (hl.geometry !== geo) hl.geometry = geo; hl.position.set(x, y, z); hl.rotation.y = ry; hl.scale.set(sx, sy, sz); hl.material.opacity = RM === 1 ? 0.7 + 0.3 * Math.sin(now / 160) : 0.9; }
  }
  hl.visible = on;
  // anel sob o zumbi preparando o bote
  const T = G.target && typeof G.target === 'object' ? G.target : G.zombies.find(z => z.id === G.target);
  const A = G.aim; aimRing.visible = !!A; if (A) { aimRing.position.set(A.x, 0.04, A.y); aimRing.scale.setScalar((A.hs ? 1.25 : 1) + (RM === 1 ? 0.08 * Math.sin(now / 150) : 0)); aimRing.material.opacity = A.hs ? 1 : 0.7; aimRing.material.color.setHex(A.hs ? 0xff8c69 : 0xf2d16b); } // hs: parado e perto => chance de cabeca maior: anel mais grosso e laranja
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
    } else if (ev.type === 'miss') { for (let i = 0; i < 3; i++) puff(ev.x + (Math.random() - 0.5) * 0.4, 0.1, ev.y + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 0.5, 0.7); // poeira onde a bala bateu
    } else if (ev.type === 'can') canRoll.set(ev.id, { t0: now, x0: ev.x, y0: ev.y });
    else if (ev.type === 'noise') { const m = nzRings.find(q => !q.visible) || nzRings[0]; m.position.set(ev.x, 0.05, ev.y); m.userData = { t: 0, r: Math.min(ev.r, 12) }; m.scale.setScalar(RM === 1 ? 0.3 * m.userData.r : m.userData.r); m.material.opacity = 0.55; m.visible = true; }
    else if (ev.type === 'doorHit') doorSh.set(ev.id, now + 300);
    else if (ev.type === 'cut') {
      const t = doorT.get(ev.id), g = padFall.find(q => !q.visible) || padFall[0];
      if (t) { const ax = Math.abs(Math.sin(t.a)) > 0.5 ? 0 : 1; g.position.set(t.x + (ax ? 1.1 : 0), 0.95, t.z + (ax ? 0 : 1.1)); g.userData = { t: 0, vy: 1.5, vx: (Math.random() - 0.5) * 1.2, vz: (Math.random() - 0.5) * 1.2 }; g.scale.setScalar(3.2); g.visible = true; }
    } else if (ev.type === 'blast') {
      flash.position.set(ev.x, 0.8, ev.y); flash.userData = { t: 0, r: ev.r }; flash.visible = true;
      if (RM === 1) for (let i = 0; i < 8; i++) { const a = i * 0.785 + Math.random(), v = 3 + Math.random() * 3; puff(ev.x, 0.6, ev.y, Math.cos(a) * v, Math.sin(a) * v, 2 + Math.random() * 3, 3, i & 1 ? BOOM : SMOKE); }
    } else if (ev.type === 'burn') {
      const z = ev.id === 'player' ? p : G.zombies.find(q => q.id === ev.id), m = hits.find(s => !s.visible) || hits[0];
      if (z) { m.position.set(z.x, 1, z.y); m.scale.setScalar(2.4); m.visible = true; m.userData.end = now + 220; }
    } else if (ev.type === 'hit') {
      const m = hits.find(s => !s.visible) || hits[0]; m.position.set(ev.x ?? p.x, 1, ev.y ?? p.y); m.visible = true; m.userData.end = now + 80;
    }
  }
  for (const g of padFall) if (g.visible) { const u = g.userData; u.t += dt; u.vy -= 14 * dt; g.position.x += u.vx * dt; g.position.z += u.vz * dt; g.position.y = Math.max(0.05, g.position.y + u.vy * dt); if (g.position.y <= 0.05) { u.vy = 0; u.vx *= 0.8; u.vz *= 0.8; } g.rotation.x += 9 * dt * (g.position.y > 0.06); g.rotation.z += 6 * dt * (g.position.y > 0.06); if (u.t > 1.6) g.visible = false; }
  for (const m of brk) if (m.visible) { const u = m.userData; if (now >= u.end) m.visible = false; else { u.vy -= 14 * dt; m.position.x += u.vx * dt; m.position.y = Math.max(0.05, m.position.y + u.vy * dt); m.position.z += u.vz * dt; m.rotation.x += 8 * dt; m.rotation.z += 6 * dt; } }
  if (flash.visible) { const u = flash.userData; u.t += dt; const k = u.t / 0.35; if (k >= 1) flash.visible = false; else { flash.scale.setScalar(u.r * (0.3 + 0.7 * k)); flash.material.opacity = 0.8 * (1 - k); } }
  for (const m of nzRings) if (m.visible) { const u = m.userData; u.t += dt; const k = u.t / 0.6; if (k >= 1) m.visible = false; else { m.scale.setScalar(u.r * (RM === 1 ? 0.3 + 0.7 * k : 1)); m.material.opacity = 0.55 * (1 - k); } } // anel de ruido: cresce ate o raio e some em 0,6 s (reduced-motion: ja no raio)
  for (const o of shots) if (o.visible && now >= o.userData.end) o.visible = false;
  for (const o of hits) if (o.visible && now >= o.userData.end) { o.visible = false; o.scale.setScalar(1); }

  // camera ~55 graus
  const dc = p.car && G.cars.find(c => c.id === p.car), k = 1 - Math.exp(-dt * 3);
  cSm.x += ((dc ? Math.cos(dc.dir) * dc.speed * 0.4 : 0) - cSm.x) * k; cSm.y += ((dc ? Math.sin(dc.dir) * dc.speed * 0.4 : 0) - cSm.y) * k; cSm.d += ((dc ? 1.25 : 1) - cSm.d) * k;
  cH += ((p.floor || 0) * FLH - cH) * (1 - Math.exp(-dt * 6));
  const d = camera.userData.d * cSm.d, el = EL, fx = p.x + cSm.x, fy = p.y + cSm.y;
  scene.fog.near = d + 14; scene.fog.far = d + 34;
  camera.position.set(fx, 0.5 + cH + d * Math.sin(el), fy + d * Math.cos(el));
  camera.lookAt(fx, 0.5 + cH, fy);
  if (devLn) devUpdate(p, now);
  renderer.render(scene, camera);
}
// overlay dev: bordas dos chunks (1 LineSegments reaproveitado, so reescrito ao mudar o chunk) + FPS/calls a 2 Hz em DOM
function devUpdate(p, now) {
  const cx = Math.floor(p.x / CH), cy = Math.floor(p.y / CH), k = cx + ',' + cy;
  if (k !== devCh) {
    devCh = k; const a = devLn.geometry.attributes.position, R2 = 2; let i = 0;
    for (let j = -R2; j <= R2 + 1; j++) {
      a.setXYZ(i++, (cx + j) * CH, 0.1, (cy - R2) * CH); a.setXYZ(i++, (cx + j) * CH, 0.1, (cy + R2 + 1) * CH);
      a.setXYZ(i++, (cx - R2) * CH, 0.1, (cy + j) * CH); a.setXYZ(i++, (cx + R2 + 1) * CH, 0.1, (cy + j) * CH);
    }
    a.needsUpdate = true;
  }
  devN++;
  if (now - devT >= 500) { devEl.textContent = Math.round(devN * 1000 / (now - devT)) + ' fps · ' + renderer.info.render.calls + ' calls · chunk ' + k; devN = 0; devT = now; }
}
function devOverlay(on) {
  if (!on) { if (devLn) { scene.remove(devLn); devLn.geometry.dispose(); devLn.material.dispose(); devLn = null; } if (devEl) { devEl.remove(); devEl = null; } return; }
  if (devLn) return;
  devLn = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3)), new THREE.LineBasicMaterial({ color: 0xff3df2, fog: false }));
  devLn.frustumCulled = false; scene.add(devLn); devCh = ''; devT = performance.now(); devN = 0;
  devEl = document.createElement('div'); devEl.style.cssText = 'position:fixed;left:6px;top:6px;z-index:50;font:12px monospace;color:#fff;background:#0008;padding:2px 6px;border-radius:4px;pointer-events:none'; document.body.appendChild(devEl);
}
// ---------- itens 3D (icone e giro) no MESMO renderer ----------
let iRig, iS, iC, iRT, iPivot, iR = 1, spinT = 0, spinRaf = 0, spinCv = null, spinId = null, demoFn = null, zdR = null;
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
  if (demoFn) demoFn(t / 1000); else if (demoRig) demoPose(t); else iPivot.rotation.y = t / 1000 * 0.8;
  const cv = spinCv.getContext('2d'); cv.imageSmoothingEnabled = false;
  const tmp = spinTick.c || (spinTick.c = document.createElement('canvas')); tmp.width = tmp.height = 160;
  tmp.getContext('2d').putImageData(itemShot(160), 0, 0);
  cv.clearRect(0, 0, spinCv.width, spinCv.height); cv.drawImage(tmp, 0, 0, spinCv.width, spinCv.height);
}
function spin(canvas, id) {
  spinStop(); demoRig = null; demoFn = null;
  if (!canvas || !renderer || !itemLoad(id)) return;
  spinCv = canvas; spinId = id; spinRaf = requestAnimationFrame(spinTick);
}
// demos de acao: jogador de armadura completa repetindo a acao num loop de 1,2 s (mesmo renderer, mesmo RT do spin)
const DEMO = { run: ['run'], crouch: ['crouch'], jump: ['idle', 'jump'], stairs: ['idle', 'stairs'], equip: ['idle', 'equip'], siphon: ['crouch', 'siphon'], tank: ['crouch', 'siphon'], cut: ['crouch', 'cut'], throw: ['idle', 'throw'], craft: ['idle', 'craft'], search: ['idle', 'search'] };
function demoPose(t) {
  const [mv, act] = DEMO[spinId], s = t / 1000, c = s % 1.2, rig = demoRig;
  for (const n in rig.P) { rig.P[n].position.copy(rig.P[n].userData.p0); rig.P[n].rotation.set(0, 0, 0); rig.P[n].scale.set(1, 1, 1); }
  rig.g.rotation.set(0, 0.5, 0); rig.g.scale.set(1, 1, 1); rig.g.position.set(0, 0, 0);
  const ph = pPh; pPh = s * 6; bt = s; // reaproveita a fase global so durante a pose
  pose(rig, mv, act, c, 1); pPh = ph;
  if (act === 'jump') rig.g.position.x = -0.6 + 1.2 * Math.min(1, c / 0.6);
}
// mini-cenas de zumbi do guia (rastejante, tiro na cabeca/perna, horda): 3 pecas por zumbi, mesmas formulas de pose do jogo (so matriz, sem mesh nova)
const ZDEMO = ['crawl', 'shot', 'horde'];
function zRig() { const zp = makeZombieParts(), P = {}; for (const n of ['body', 'legL', 'legR']) { P[n] = new THREE.Group(); P[n].add(...pair(bake(zp[n]))); } const g = new THREE.Group(); g.add(P.body, P.legL, P.legR); return { g, P }; }
function zRigPose(r, o) { // o: x, z, yaw, ph, w (andando), crawl, limp, lk (dobra de joelho 0-1, perna esq.), fall (queda para tras 0-1)
  const a = o.w ? Math.sin(o.ph) : 0, cw = !!o.crawl, lm = !!o.limp && !cw;
  let ln = 0.15, ro = 0.02 * Math.sin(o.ph * 0.5) * RM, l1 = 0.45 * a * RM, l2 = -l1, fw = 0, ly = 0;
  if (o.w && !cw) ro = 0.105 * Math.sin(o.ph * 0.5) * RM;
  if (cw) { ln = 1.35 + 0.1 * a * a * RM; fw = 0.1 * Math.max(0, a) * RM; ro = (o.w ? 0.16 * a : 0) * RM; l1 = 1.2 + 0.2 * a * RM; l2 = 1.2 - 0.2 * a * RM; ly = -0.22; }
  else if (lm && o.w) { l1 = 0.15 * a * RM; l2 = -0.5 * a * RM; ln = 0.3 + 0.08 * a * RM; ro = (0.14 + 0.08 * a) * RM; ly = -0.07 * Math.max(0, Math.sin(o.ph + 1)) * RM; }
  const lk = o.lk || 0; ln += 0.35 * lk; l1 += 0.9 * lk; ly -= 0.25 * lk;
  r.P.body.position.set(0, 0.55, fw); r.P.body.rotation.set(ln, 0, ro); r.P.legL.position.set(-0.15, 0.55, 0); r.P.legR.position.set(0.15, 0.55, 0); r.P.legL.rotation.set(l1, 0, 0); r.P.legR.rotation.set(l2, 0, 0);
  r.g.rotation.order = 'YXZ'; r.g.rotation.set(-Math.PI / 2 * (o.fall || 0), o.yaw, 0); r.g.position.set(o.x, ly + 0.25 * (o.fall || 0), o.z);
}
function demoZ(canvas, id) {
  spinStop(); itemSetup(); demoRig = null;
  if (!zdR) zdR = [0, 1, 2, 3].map(zRig);
  if (!iRig) iRig = mkRig({ head: 1, torso: 1, legs: 1 });
  iPivot.clear(); iPivot.rotation.y = 0;
  const n = id === 'horde' ? 4 : id === 'shot' ? 2 : 1; for (let i = 0; i < n; i++) iPivot.add(zdR[i].g);
  if (id === 'shot') iPivot.add(iRig.g);
  iC.position.set(0.55, 0.5, 1).normalize().multiplyScalar(id === 'horde' ? 8.5 : 6.2); iC.lookAt(0, 0.6, 0); iC.updateMatrixWorld();
  const R90 = Math.PI / 2;
  demoFn = (s) => {
    if (id === 'crawl') zRigPose(zdR[0], { x: -1.4 + 0.8 * (s % 3.5), z: 0, yaw: R90, ph: s * 2.4, w: true, crawl: true });
    else if (id === 'horde') {
      for (let i = 0; i < 3; i++) zRigPose(zdR[i], { x: -2.4 + ((s * 0.6 + i * 0.5) % 5), z: (i - 1) * 0.9, yaw: R90, ph: s * 3.2 + i * 1.7, w: true });
      zRigPose(zdR[3], { x: -3.4 + ((s * 0.6) % 5), z: 0.1, yaw: R90, ph: s * 2.4, w: true, crawl: true });
    } else { // boneco atira: volta par = cabeca (cai para tras), volta impar = perna (dobra e passa a mancar)
      const L = 5, u = s % L, v = Math.floor(s / L) % 2, T = 1.6, t = u - T, z0 = zdR[0];
      iRig.g.position.set(-1.7, 0, 0); iRig.g.rotation.set(0, R90, 0); pose(iRig, 'idle', t >= 0 && t < 0.5 ? 'shot' : null, Math.max(0, t), 1);
      iRig.g.position.set(-1.7, 0, 0); iRig.g.rotation.set(0, R90, 0);
      const x = u < T ? 1.7 - 0.8 * (u / T) : v ? 0.9 - 0.25 * Math.max(0, u - T - 0.3) : 0.9;
      if (v === 0) zRigPose(z0, { x, z: 0, yaw: -R90, ph: s * 3.2, w: u < T, fall: t > 0 ? sm(Math.min(1, t / 0.3)) : 0 });
      else zRigPose(z0, { x, z: 0, yaw: -R90, ph: s * 2, w: u < T || t > 0.3, limp: t > 0, lk: t > 0 && t < 0.3 ? Math.sin(Math.PI * t / 0.3) * RM : 0 });
    }
  };
  spinCv = canvas; spinId = id; spinRaf = requestAnimationFrame(spinTick);
}
function demo(canvas, id) {
  if (ZDEMO.includes(id)) return demoZ(canvas, id);
  demoFn = null;
  if (!DEMO[id]) return spin(canvas, id);
  spinStop(); itemSetup();
  if (!iRig) iRig = mkRig({ head: 1, torso: 1, legs: 1 });
  iPivot.clear(); iPivot.rotation.y = 0; iPivot.add(iRig.g); demoRig = iRig;
  if (id === 'tank') { const t = new THREE.Group(); t.add(...pair(bake(makeProp('tank')))); t.position.set(0.55, 0, 0.5); iPivot.add(t); } // boneco sifonando a tampa do tanque
  iC.position.set(0.7, 0.4, 0.9).normalize().multiplyScalar(5.6); iC.lookAt(0, 0.95, 0); iC.updateMatrixWorld();
  spinCv = canvas; spinId = id; spinRaf = requestAnimationFrame(spinTick);
}

// toque na tela -> {type,id}|null: raio da camera contra caixas por entidade (moveis, tumbas/baus, portas, drops) a <=2,5 m do jogador
const FH = { corpse: 0.3, fridge: 1.6, cabinet: 0.9, wardrobe: 1.8, drawer: 0.8, shelf: 1.4, box: 0.5, stove: 0.95, sink: 1.1, bed: 0.6, nightstand: 0.5, toilet: 0.9, medcab: 1.8, sofa: 0.85, bookshelf: 1.8, table: 0.78, box_mercado: 0.5, box_posto: 0.5, box_galpao: 0.5, toolbox_oficina: 0.2, pshelf: 1.5, medcart: 0.9, gunlocker: 1.8, desk: 1, locker: 1.8, sacristy: 1.6 };
function pick(cx, cy) {
  const G = window.G; if (!G || !renderer) return null;
  const r = renderer.domElement.getBoundingClientRect(), p = G.player, ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
  let best = null, bt = 1e9; const B = new THREE.Box3(), v = new THREE.Vector3(), E = 0.15;
  const test = (x0, y0, z0, x1, y1, z1, type, id) => {
    if (Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(z0 - p.y, 0, p.y - z1)) > 2.5) return;
    B.min.set(x0 - E, y0, z0 - E); B.max.set(x1 + E, y1 + E, z1 + E);
    if (ray.ray.intersectBox(B, v)) { const t = v.distanceTo(ray.ray.origin); if (t < bt) { bt = t; best = { type, id }; } }
  };
  const pf = p.floor || 0;
  for (const c of G.crates) {
    if (c.scenery || (c.floor || 0) !== pf) continue;
    if (c.w) { const h = FH[c.kind] || 1, fy = FLH * pf; test(c.x - c.w / 2, fy + (c.kind === 'medcab' ? 1.2 : 0), c.y - c.h / 2, c.x + c.w / 2, fy + h, c.y + c.h / 2, c.tomb ? 'tomb' : 'crate', c.id); }
    else test(c.x - 0.4, 0, c.y - 0.35, c.x + 0.4, 0.6, c.y + 0.35, c.tomb ? 'tomb' : 'crate', c.id);
  }
  if (!pf) for (const h of G.houses) for (const d of h.doors || []) { const m = Math.max(0, 0.5 - Math.min(d.w, d.h)) / 2; test(d.x - m, 0, d.y - m, d.x + d.w + m, 2.0, d.y + d.h + m, 'door', d.id); }
  for (const d of G.drops || []) test(d.x - 0.3, 0, d.y - 0.3, d.x + 0.3, 0.5, d.y + 0.3, 'drop', d.id);
  return best;
}
// sanidade p/ testes: matriz com NaN some da tela sem erro (bug dos zumbis com id texto); vale p/ zumbis, NPCs e tudo instanciado
function badMatrices() {
  let bad = 0;
  scene.traverse(o => {
    if (o.isInstancedMesh) { const a = o.instanceMatrix.array; for (let i = 0; i < o.count * 16; i++) if (!Number.isFinite(a[i])) { bad++; break; } }
    else if (o.isMesh && o.visible && !o.matrixWorld.elements.every(Number.isFinite)) bad++;
  });
  return bad;
}
window.R = { toScreen(x, y, z) { if (!camera || !renderer) return null; const v = new THREE.Vector3(x, y, z).project(camera); if (v.z > 1) return null; const b = renderer.domElement.getBoundingClientRect(); return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height }; }, seenN: () => (seenIM && seenIM.visible ? seenIM.count : 0), aimOn: () => !!aimRing && aimRing.visible, zoom(pct) { VIEW_R = 7 * Math.max(50, Math.min(170, +pct || 100)) / 100; if (camera) size(); }, init, draw, pick, icon, spin, demo, info: () => ({ bakes, calls: renderer.info.render.calls, verts: lastBake.verts, ms: lastBake.ms, up: lastBake.up }), mem: () => renderer.info.memory.geometries, chunks: () => chunks.size, badMatrices, devOverlay,
  view() { const c = camera, v = new THREE.Vector3(), d = c.userData.d; c.position.set(0, 0.5 + d * Math.sin(EL), d * Math.cos(EL)); c.lookAt(0, 0.5, 0); c.updateMatrixWorld(true); return [[VIEW_R, 0], [-VIEW_R, 0], [0, VIEW_R], [0, -VIEW_R]].map(([x, z]) => { v.set(x, 0, z).project(c); return Math.max(Math.abs(v.x), Math.abs(v.y)); }); } };
