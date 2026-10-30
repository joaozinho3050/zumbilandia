// Modelos 3D do jogo (funções puras: só criam Object3D). Estilo em ESTILO.md.
import * as THREE from 'three';

// 0.149 não convertia cor hex; 0.160 converte sRGB->linear. Desligado para as cores ficarem idênticas às de
// modelos.html; o renderer deve usar outputColorSpace = THREE.LinearSRGBColorSpace (equivale ao 0.149).
THREE.ColorManagement.enabled = false;

export const STYLES = {
  F: { id: 'F', nome: 'Massinha', prim: { player: 'round', zombie: 'round', car: 'round', house: 'round', items: 'round' }, head: 1.4, outline: true,
    pal: { skin: 0xffcfa8, shirt: 0xff8c69, pants: 0x5b7bd5, zskin: 0xb5e07a, zshirt: 0xa77bd1, car: 0x5bc0de, glass: 0xe6f7ff, wheel: 0x2f2a35, wall: 0xfff3d6, roof: 0xf06c7a, door: 0x9b6a3c, wood: 0xeab26a, grip: 0x6e4422, metal: 0x9aa3b5, can: 0xff5c57, ground: 0x8fd16a, helm: 0xff5c57, jacket: 0x9b6a3c, guard: 0x9aa3b5, blush: 0xff9fb0 } },
  H: { id: 'H', nome: 'Sua mistura', prim: { player: 'box', zombie: 'facet', car: 'slim', house: 'box', items: 'round' }, head: 1.35, outline: true,
    pal: { skin: 0xf7cfa8, shirt: 0x5f97c9, pants: 0x46546b, zskin: 0x9cc77e, zshirt: 0x8d6f9e, car: 0xb8c0c8, glass: 0x45505c, wheel: 0x2a2730, wall: 0xf0e2c4, roof: 0xc9705f, door: 0xe0753f, wood: 0xd9a066, grip: 0x5e4129, metal: 0x8d96a3, can: 0xe0603f, ground: 0x78a865, helm: 0xe0603f, jacket: 0x7d5538, guard: 0x8d96a3, blush: 0xf59a9a, accent: 0xe0753f } },
  I: { id: 'I', nome: 'Final (F + H)', prim: { player: 'round', zombie: 'round', car: 'slim', house: 'box', items: 'round' }, head: 1.4, outline: true,
    pal: { skin: 0xffcfa8, shirt: 0xff8c69, pants: 0x5b7bd5, zskin: 0xb5e07a, zshirt: 0xa77bd1, car: 0xc9d3e0, glass: 0x4a5266, wheel: 0x2f2a35, wall: 0xfff3d6, roof: 0xf06c7a, door: 0xff8c69, wood: 0xeab26a, grip: 0x6e4422, metal: 0x9aa3b5, can: 0xff5c57, ground: 0x8fd16a, helm: 0xff5c57, jacket: 0x9b6a3c, guard: 0x9aa3b5, blush: 0xff9fb0, accent: 0xff8c69 } },
};
export const FINAL = { player: 'F', zombie: 'F', armor: 'F', car: 'I', house: 'H', items: 'I' };

// ---------- helpers ----------
const mats = new Map();
const mat = c => { let m = mats.get(c); if (!m) mats.set(c, m = new THREE.MeshLambertMaterial({ color: c, flatShading: true })); return m; };
const INK = new THREE.MeshBasicMaterial({ color: 0x15121a, side: THREE.BackSide });
function add(g, geo, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
}
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (a, b, h, n) => new THREE.CylinderGeometry(a, b, h, n);
const Cap = (r, l, n = 8) => new THREE.CapsuleGeometry(r, Math.max(l, 0.01), 3, n);
const Sph = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);

// contorno: casca invertida 1,07× cor #15121a
export function outline(root) {
  const list = []; root.traverse(o => { if (o.isMesh && !o.userData.noInk) list.push(o); });
  for (const m of list) { const s = new THREE.Mesh(m.geometry, INK); s.scale.setScalar(1.07); s.userData.noInk = true; m.add(s); }
  return root;
}
const done = g => outline(g);

// ---------- personagens (prim 'round') ----------
// traço do rosto preso à cabeça, assentado na superfície da esfera (senão fica enterrado)
function face(head, geo, color, x, dy, out = 0, rz = 0) {
  const R = head.geometry.parameters.radius;
  const z = Math.sqrt(Math.max(R * R - x * x - dy * dy, 0)) + 0.012 + out;
  return add(head, geo, color, x, dy, z, 0, 0, rz);
}
// pivô = Group na articulação; malhas ficam deslocadas dentro dele (girar .rotation.x balança o membro)
function pivot(parent, name, x, y, z) { const p = new THREE.Group(); p.name = name; p.position.set(x, y, z); parent.add(p); return p; }
const HIP = 0.55, NECK = 1.3, SHOULDER = 1.1; // alturas das articulações (m)
function humanoid(zombie, armor = {}) {
  const st = STYLES[FINAL[zombie ? 'zombie' : 'player']], c = st.pal, g = new THREE.Group();
  const skin = zombie ? c.zskin : c.skin, shirt = zombie ? c.zshirt : c.shirt;
  const hr = 0.24 * st.head, hy = NECK + hr, front = hr * 1.02;
  const body = pivot(g, 'body', 0, HIP, 0), head = pivot(body, 'head', 0, NECK - HIP, 0);
  const legL = pivot(g, 'legL', -0.15, HIP, 0), legR = pivot(g, 'legR', 0.15, HIP, 0);
  for (const l of [legL, legR]) add(l, Cap(0.13, 0.55 - 0.26), c.pants, 0, 0.275 - HIP, 0);
  const t = add(body, Cap(0.62 * 0.45, 0.62 * 0.45, 10), shirt, 0, 0.86 - HIP, 0);
  const hd = add(head, Sph(hr * 1.05), skin, 0, hr, 0);
  if (zombie) {
    add(body, Cap(0.1, 0.3), skin, -0.34, 1.05 - HIP, 0.22, Math.PI / 2.2, 0, 0);
    add(body, Cap(0.1, 0.25), skin, 0.34, 0.98 - HIP, 0.2, Math.PI / 2.6, 0, 0.1);
    for (const sx of [-1, 1]) face(hd, Box(0.11, 0.09, 0.03), 0xfff6c2, sx * 0.12, 0.02);
    for (const sx of [-1, 1]) face(hd, Box(0.04, 0.04, 0.02), 0xd9302c, sx * 0.12, 0.02, 0.02);
    face(hd, Box(0.16, 0.035, 0.02), 0x3a2028, 0.02, -0.13, 0, 0.15);
    t.rotation.x = 0.15; hd.rotation.z = 0.22; hd.position.z = 0.08;
  } else {
    for (const sx of [-1, 1]) add(pivot(g, sx < 0 ? 'armL' : 'armR', sx * 0.42, SHOULDER, 0), Cap(0.1, 0.3), shirt, 0, 0.88 - SHOULDER, 0, 0, 0, sx * 0.12);
    for (const sx of [-1, 1]) {
      face(hd, Box(0.1, 0.13, 0.03), 0x1d1a24, sx * 0.12, 0.01);
      face(hd, Box(0.035, 0.035, 0.02), 0xffffff, sx * 0.12 + 0.025, 0.045, 0.02);
      face(hd, Box(0.08, 0.04, 0.02), c.blush, sx * 0.21, -0.09);
    }
  }
  if (armor.head) {
    add(head, new THREE.SphereGeometry(hr * 1.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), c.helm, 0, hy + 0.02 - NECK, 0);
    add(head, Box(hr * 1.6, 0.05, 0.06), 0x2a2a33, 0, hy + 0.12 - NECK, front + 0.03);
  }
  if (armor.torso) {
    add(body, Cap(0.7 * 0.45, 0.66 * 0.45, 10), c.jacket, 0, 0.86 - HIP, 0);
    add(body, Box(0.06, 0.5, 0.02), 0xd8c9a0, 0, 0.88 - HIP, 0.23);
  }
  if (armor.legs) for (const l of [legL, legR]) add(l, Box(0.3, 0.3, 0.32), c.guard, 0, 0.25 - HIP, 0.02);
  return done(g);
}
export const makePlayer = (opts = {}) => humanoid(false, opts.armor || {});
export const makeZombie = () => humanoid(true);
// partes soltas, origem na articulação (body/legs em y=0.55 do corpo inteiro; legL x=-0.15, legR x=+0.15)
export function makeZombieParts() {
  const z = makeZombie(), out = {};
  for (const n of ['body', 'legL', 'legR']) { out[n] = z.getObjectByName(n); z.remove(out[n]); out[n].position.set(0, 0, 0); }
  return out;
}

// ---------- carro (I, 'slim') ----------
export function makeCar() {
  const c = STYLES[FINAL.car].pal, g = new THREE.Group(), acc = c.accent;
  add(g, Box(2.0, 0.32, 0.92), c.car, 0, 0.42, 0);
  for (const z of [-0.475, 0.475]) add(g, Box(1.7, 0.07, 0.04), acc, 0, 0.47, z);
  add(g, Cyl(0.42, 0.56, 0.32, 4), c.glass, -0.1, 0.75, 0, 0, Math.PI / 4, 0).scale.set(1.25, 1, 0.95);
  add(g, Box(0.9, 0.05, 0.7), c.car, -0.1, 0.935, 0);
  for (const x of [-1.04, 1.04]) add(g, Box(0.08, 0.1, 0.94), 0x5a5f6e, x, 0.3, 0);
  for (const z of [-0.3, 0.3]) {
    add(g, Box(0.05, 0.09, 0.16), 0xfff3b0, 1.03, 0.47, z);
    add(g, Box(0.05, 0.08, 0.14), 0xd9302c, -1.03, 0.47, z);
  }
  const wr = 0.19;
  for (const x of [-0.62, 0.62]) for (const z of [-0.5, 0.5]) {
    add(g, Cyl(wr, wr, 0.16, 10), c.wheel, x, wr, z, Math.PI / 2, 0, 0);
    add(g, Cyl(0.08, 0.08, 0.02, 8), 0xc9d3e0, x, wr, z + Math.sign(z) * 0.09, Math.PI / 2, 0, 0);
  }
  return done(g);
}

// ---------- casa (H, 'box'); frente +z, side: 's'(padrão)|'n'|'e'|'w' ----------
export function makeHouse(w = 2.6, d = 2.2, side = 's') {
  const c = STYLES[FINAL.house].pal, g = new THREE.Group(), sx = w / 2.6, sz = d / 2.2, f = d / 2;
  add(g, Box(w, 1.6, d), c.wall, 0, 0.8, 0);
  add(g, Box(0.5, 0.9, 0.05), c.door, 0.17 * w, 0.45, f + 0.01);
  add(g, Box(0.06, 0.06, 0.04), 0xf2d16b, 0.17 * w + 0.15, 0.45, f + 0.04);
  add(g, Box(0.55, 0.45, 0.05), c.glass, -0.21 * w, 1.0, f + 0.01);
  add(g, Box(0.6, 0.07, 0.1), c.wood, -0.21 * w, 0.74, f + 0.05);
  add(g, new THREE.ConeGeometry(2.0, 1.0, 4), c.roof, 0, 2.1, 0, 0, Math.PI / 4, 0).scale.set(sx, 1, sz);
  add(g, Box(0.28, 0.6, 0.28), c.roof, 0.75 * sx, 2.2, -0.4 * sz);
  add(g, new THREE.IcosahedronGeometry(0.35, 0), c.ground, -w / 2 - 0.25, 0.3, f - 0.2);
  g.rotation.y = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }[side] ?? 0;
  return done(g);
}

// ---------- itens (I, 'round') ----------
const ITEMS = {
  bat: (g, c) => { const b = new THREE.Group(); b.rotation.z = 0.35; g.add(b);
    add(b, Cap(0.09, 0.6), c.wood, 0, 0.15, 0); add(b, Cyl(0.05, 0.05, 0.45, 8), c.grip, 0, -0.38, 0); },
  gascan: (g, c) => { add(g, Cap(0.2, 0.28), c.can, 0, 0.3, 0).scale.x = 1.4;
    add(g, Box(0.3, 0.08, 0.08), c.grip, -0.05, 0.62, 0);
    add(g, Cyl(0.045, 0.045, 0.25, 8), c.metal, 0.2, 0.62, 0, 0, 0, -0.6); },
  pistol: (g, c) => { add(g, Cap(0.07, 0.4), c.metal, 0, 0.2, 0, 0, 0, Math.PI / 2);
    add(g, Box(0.14, 0.3, 0.11), c.grip, -0.15, 0.02, 0, 0, 0, -0.2); },
  pipe: (g, c) => { add(g, Cyl(0.06, 0.06, 0.9, 10), c.metal, 0, 0.45, 0, 0, 0, 0.35);
    for (const s of [-1, 1]) add(g, Cyl(0.075, 0.075, 0.06, 10), c.metal, -Math.sin(0.35) * s * 0.4, 0.45 + Math.cos(0.35) * s * 0.4, 0, 0, 0, 0.35); },
  food: (g, c) => { add(g, Cyl(0.15, 0.15, 0.24, 12), c.metal, 0, 0.12, 0);
    add(g, Cyl(0.16, 0.16, 0.14, 12), c.shirt, 0, 0.12, 0); },
  bandage: (g, c) => { add(g, Cyl(0.16, 0.16, 0.14, 12), c.wall, 0, 0.07, 0);
    add(g, Box(0.16, 0.02, 0.05), c.can, 0, 0.15, 0); add(g, Box(0.05, 0.02, 0.16), c.can, 0, 0.15, 0); },
  ammo: (g, c) => { add(g, Box(0.36, 0.16, 0.22), c.wood, 0, 0.08, 0); add(g, Box(0.1, 0.18, 0.24), c.shirt, 0, 0.08, 0);
    for (const x of [-0.12, 0.12]) { add(g, Cyl(0.045, 0.045, 0.12, 8), c.metal, x, 0.2, 0); add(g, Sph(0.045, 8, 6), 0xf2d16b, x, 0.26, 0); } },
  key: (g, c) => { const K = 0xf2d16b;
    add(g, new THREE.TorusGeometry(0.1, 0.03, 6, 12), K, -0.22, 0.2, 0);
    add(g, Cyl(0.03, 0.03, 0.4, 8), K, 0.05, 0.2, 0, 0, 0, Math.PI / 2);
    add(g, Box(0.05, 0.1, 0.05), K, 0.15, 0.14, 0); add(g, Box(0.05, 0.08, 0.05), K, 0.22, 0.15, 0); },
  hose: (g, c) => { for (const y of [0.06, 0.15]) add(g, new THREE.TorusGeometry(0.2, 0.05, 6, 14), c.wheel, 0, y, 0, Math.PI / 2, 0, 0);
    add(g, Cyl(0.04, 0.04, 0.22, 8), c.metal, 0.3, 0.1, 0, 0, 0, Math.PI / 2); },
  rag: (g, c) => { add(g, Cyl(0.22, 0.22, 0.05, 8), 0xd8c9a0, 0, 0.025, 0);
    add(g, Cyl(0.17, 0.17, 0.05, 8), c.wall, 0, 0.07, 0, 0, 0.4, 0);
    add(g, Cap(0.06, 0.1), 0xd8c9a0, 0, 0.14, 0, 0, 0, Math.PI / 2); },
  wire: (g, c) => { add(g, Cyl(0.12, 0.12, 0.16, 10), c.metal, 0, 0.1, 0);
    for (const y of [0.02, 0.18]) add(g, Cyl(0.19, 0.19, 0.05, 10), c.wood, 0, y, 0); },
  bottle: (g, c) => { add(g, Cap(0.1, 0.22), 0x78a865, 0, 0.2, 0); add(g, Cyl(0.04, 0.045, 0.16, 8), 0x78a865, 0, 0.45, 0);
    add(g, Cyl(0.05, 0.05, 0.04, 8), c.metal, 0, 0.55, 0); },
  molotov: (g, c) => { add(g, Cap(0.1, 0.22), 0x78a865, 0, 0.2, 0); add(g, Cyl(0.04, 0.045, 0.16, 8), 0x78a865, 0, 0.45, 0);
    add(g, Cyl(0.03, 0.03, 0.1, 6), 0xd8c9a0, 0, 0.58, 0);
    add(g, new THREE.ConeGeometry(0.08, 0.2, 6), c.can, 0, 0.73, 0); add(g, new THREE.ConeGeometry(0.045, 0.12, 6), 0xf2d16b, 0, 0.71, 0.01); },
  helmet: (g, c) => { add(g, new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), c.helm, 0, 0.04, 0);
    add(g, Cyl(0.29, 0.29, 0.05, 10), c.helm, 0, 0.02, 0); add(g, Box(0.36, 0.06, 0.1), 0x2a2a33, 0, 0.16, 0.25); },
  jacket: (g, c) => { add(g, Cap(0.2, 0.2, 10), c.jacket, 0, 0.3, 0);
    for (const s of [-1, 1]) add(g, Cap(0.07, 0.2), c.jacket, s * 0.27, 0.28, 0, 0, 0, s * 0.25);
    add(g, Box(0.04, 0.3, 0.02), 0xd8c9a0, 0, 0.3, 0.205); },
  shinguards: (g, c) => { for (const s of [-1, 1]) {
    add(g, Box(0.18, 0.34, 0.14), c.guard, s * 0.13, 0.17, 0);
    for (const y of [0.09, 0.25]) add(g, Box(0.2, 0.04, 0.16), 0xd8c9a0, s * 0.13, y, 0); } },
};
export function makeItem(id) {
  const f = ITEMS[id]; if (!f) throw new Error('item desconhecido: ' + id);
  const g = new THREE.Group(); f(g, STYLES[FINAL.items].pal); return done(g);
}

// ---------- cenário ----------
export function makeTree() {
  const g = new THREE.Group();
  add(g, Cyl(0.1, 0.12, 0.7, 6), 0x9b6a3c, 0, 0.35, 0);
  add(g, new THREE.IcosahedronGeometry(0.55, 0), 0x78a865, 0, 1.05, 0);
  return done(g);
}
export function makeFence(len = 2) {
  const g = new THREE.Group(), n = Math.max(1, Math.round(len / 0.5));
  for (let i = 0; i <= n; i++) add(g, Cyl(0.04, 0.04, 0.45, 6), 0xeab26a, -len / 2 + len * i / n, 0.225, 0);
  for (const y of [0.15, 0.32]) add(g, Box(len, 0.05, 0.03), 0xeab26a, 0, y, 0);
  return done(g);
}

// ---------- interiores (ESTILO.md "Interiores"): parede, telhado, porta, móveis, chão ----------
const CASA = { A: { wall: 0xf0e2c4, roof: 0xc9705f }, B: { wall: 0xfff3d6, roof: 0xf06c7a }, C: { wall: 0xcfe8f5, roof: 0x5b7bd5 } };
const VIDRO = 0x45505c, FLORA = 0xeab26a, ARBUSTO = 0x78a865, PUXADOR = 0xf2d16b, ASSOALHO = 0xe8dcc2;

// bloco com cantos arredondados no perfil, centrado na origem: uma malha só, sem faces coincidentes
function softGeo(w, h, d, r = 0.06) {
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2, k = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3), s = new THREE.Shape();
  s.moveTo(x0 + k, y0); s.lineTo(x1 - k, y0); s.quadraticCurveTo(x1, y0, x1, y0 + k);
  s.lineTo(x1, y1 - k); s.quadraticCurveTo(x1, y1, x1 - k, y1);
  s.lineTo(x0 + k, y1); s.quadraticCurveTo(x0, y1, x0, y1 - k);
  s.lineTo(x0, y0 + k); s.quadraticCurveTo(x0, y0, x0 + k, y0);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 3 }).translate(0, 0, -d / 2);
}

// parede de base ao longo de x, centrada em x e z, apoiada no chão (0 a h)
export function makeWallSeg(len, h = 0.8, thick = 0.2, color = CASA.A.wall) {
  const g = new THREE.Group(); add(g, Box(len, h, thick), color, 0, h / 2, 0); return done(g);
}

// faixa de paredes externas 0,8–2,2 m (com janelas) + telhado pirâmide 4 lados + chaminé; footprint w×d
export function makeRoof(w, d, pal = 'A') {
  const P = CASA[pal] || CASA.A, g = new THREE.Group();
  const t = 0.2, y0 = 0.8, H = 1.4, yT = y0 + H, RH = 0.9, yc = y0 + H / 2;
  const xc = w / 2 - t / 2, zc = d / 2 - t / 2, L = d - 2 * t;
  // fachadas em ±w/2 e ±d/2; as de frente/fundo passam por cima dos cantos, sem sobreposição de faces
  add(g, Box(w, H, t), P.wall, 0, yc, zc); add(g, Box(w, H, t), P.wall, 0, yc, -zc);
  add(g, Box(t, H, L), P.wall, xc, yc, 0); add(g, Box(t, H, L), P.wall, -xc, yc, 0);
  // janela (vidro 45505c) com floreira madeira eab26a e dois arbustos 78a865; (x,z) = centro na fachada
  const janela = (x, z, alongX) => {
    const ox = alongX ? 0 : Math.sign(x), oz = alongX ? Math.sign(z) : 0;
    add(g, alongX ? Box(0.8, 0.5, 0.04) : Box(0.04, 0.5, 0.8), VIDRO, x, 1.5, z);
    add(g, alongX ? Box(1.0, 0.12, 0.14) : Box(0.14, 0.12, 1.0), FLORA, x + ox * 0.05, 1.18, z + oz * 0.05);
    for (const k of [-0.36, 0.36]) add(g, new THREE.IcosahedronGeometry(0.08, 0), ARBUSTO, alongX ? x + k : x + ox * 0.06, 1.27, alongX ? z + oz * 0.06 : z + k);
  };
  const vaos = L2 => { const n = Math.max(1, Math.floor(L2 / 2.4)); return Array.from({ length: n }, (_, i) => -L2 / 2 + L2 * (i + 0.5) / n); };
  for (const s of [-1, 1]) {
    for (const u of vaos(w)) janela(u, s * d / 2, true);
    for (const u of vaos(L)) janela(s * w / 2, u, false);
  }
  // telhado pirâmide 4 lados (aberto embaixo, sobre a faixa), beiral 0,2 m
  const hx = w / 2 + 0.2, hz = d / 2 + 0.2;
  add(g, new THREE.ConeGeometry(1, RH, 4, 1, true).rotateY(Math.PI / 4).scale(hx * Math.SQRT2, 1, hz * Math.SQRT2), P.roof, 0, yT + RH / 2, 0);
  // chaminé: sai do telhado na superfície em x=0,3w, z=-0,3d
  const cx = 0.3 * w, cz = -0.3 * d, sur = yT + RH * (1 - Math.max(Math.abs(cx) / hx, Math.abs(cz) / hz));
  const cb = yT + 0.1, ct = sur + 0.35;
  add(g, Box(0.28, ct - cb, 0.28), P.roof, cx, (cb + ct) / 2, cz);
  return done(g);
}

// folha de porta (2,0 m de altura, 0,2 m de espessura) com pivô na borda x=0: gira 90° em y para abrir
export function makeDoor(w = 1.4, color = 0xe0753f) {
  const g = new THREE.Group(), H = 2.0, T = 0.2;
  add(g, softGeo(w, H, T, 0.04), color, w / 2, H / 2, 0);
  for (const z of [-1, 1]) add(g, new THREE.SphereGeometry(0.05, 8, 6), PUXADOR, w - 0.15, 1.0, z * (T / 2 + 0.03));
  return done(g);
}

// folha de móvel: pivô na face da frente (z=d/2) na borda x0; dir +1 cresce para +x, -1 para -x; aberta gira 0,9 rad para fora
function folha(g, x0, y0, lw, lh, d, dir, color, knob, open) {
  const p = new THREE.Group(); p.position.set(x0, y0, d / 2); p.rotation.y = open ? -dir * 0.9 : 0; g.add(p);
  add(p, softGeo(lw, lh, 0.04, 0.02), color, dir * lw / 2, lh / 2, 0);
  add(p, Cap(0.02, lh * 0.25), knob, dir * (lw - 0.07), lh * 0.5, 0.03);
  return p;
}

// móveis (ESTILO.md): medidas w×d×h em m, base no chão, frente +z. open:true = versão vasculhada
export function makeFurniture(kind, opts = {}) {
  const g = new THREE.Group(), op = !!opts.open;
  switch (kind) {
    case 'fridge':
      add(g, softGeo(0.7, 1.6, 0.7, 0.1), 0xe6f7ff, 0, 0.8, 0);
      folha(g, -0.33, 0.02, 0.66, 1.56, 0.7, 1, 0xe6f7ff, 0x9aa3b5, op);
      break;
    case 'cabinet':
      add(g, softGeo(1.2, 0.9, 0.5, 0.06), 0xeab26a, 0, 0.45, 0);
      folha(g, -0.58, 0.02, 0.57, 0.86, 0.5, 1, 0xeab26a, 0x6e4422, op);
      folha(g, 0.58, 0.02, 0.57, 0.86, 0.5, -1, 0xeab26a, 0x6e4422, false);
      break;
    case 'wardrobe':
      add(g, softGeo(1.0, 1.8, 0.5, 0.05), 0x9b6a3c, 0, 0.9, 0);
      folha(g, -0.48, 0.02, 0.47, 1.76, 0.5, 1, 0x9b6a3c, 0x9aa3b5, op);
      folha(g, 0.48, 0.02, 0.47, 1.76, 0.5, -1, 0x9b6a3c, 0x9aa3b5, false);
      add(g, Box(0.04, 1.7, 0.1), 0xd8c9a0, 0, 0.9, 0.25);   // friso central
      add(g, Box(1.04, 0.06, 0.1), 0xd8c9a0, 0, 1.8, 0.25);  // cornija
      break;
    case 'drawer':
      add(g, softGeo(0.8, 0.8, 0.4, 0.05), 0xeab26a, 0, 0.4, 0);
      [0.15, 0.4, 0.65].forEach((y, i) => {
        const z = op && i === 2 ? 0.2 : 0;   // gaveta de cima puxada
        add(g, softGeo(0.74, 0.22, 0.04, 0.03), 0xeab26a, 0, y, 0.2 + z);
        add(g, Cap(0.02, 0.2), 0x6e4422, 0, y, 0.23 + z).rotation.z = Math.PI / 2;
      });
      break;
    case 'shelf': { // gôndola de mercado: laterais, 4 prateleiras, produtos em blocos
      const M = 0x9aa3b5;
      for (const x of [-0.97, 0.97]) add(g, Box(0.04, 1.4, 0.6), M, x, 0.7, 0);
      for (const y of [0.05, 0.5, 0.95, 1.37]) add(g, Box(1.92, 0.04, 0.56), M, 0, y, 0);
      const PR = [0xff8c69, 0x8fd16a, 0xf2d16b]; let i = 0;
      for (const y of [0.05, 0.5, 0.95]) for (let x = -0.75; x <= 0.76; x += 0.25)
        add(g, softGeo(0.2, 0.22, 0.2, 0.04), PR[i++ % 3], x, y + 0.12, 0);   // assenta 1 cm dentro da prateleira
      break; }
    case 'box': { // caixa de depósito de papelão, tampa em pivô na borda de trás
      add(g, softGeo(0.6, 0.5, 0.6, 0.04), 0xd6b27a, 0, 0.25, 0);
      const p = new THREE.Group(); p.position.set(0, 0.5, -0.31); p.rotation.x = op ? -1.2 : 0; g.add(p);
      const lid = add(p, Box(0.62, 0.03, 0.62), 0xd6b27a, 0, 0, 0.31);
      add(lid, Box(0.12, 0.03, 0.5), 0xd8c9a0, 0, 0.02, 0);   // fita
      break; }
    case 'register': // caixa registradora (decoração de mercado): medidas não definidas no ESTILO.md
      add(g, softGeo(0.45, 0.25, 0.4, 0.04), 0x5e5b6b, 0, 0.125, 0);
      add(g, Box(0.3, 0.16, 0.03), 0x4a5266, 0, 0.31, -0.08).rotation.x = -0.5;
      break;
    default: throw new Error('móvel desconhecido: ' + kind);
  }
  return done(g);
}

// assoalho de interior: 1 cm acima do chão (grama em y=0)
export function makeFloor(w, d) {
  const g = new THREE.Group(); add(g, Box(w, 0.01, d), ASSOALHO, 0, 0.005, 0); return done(g);
}
