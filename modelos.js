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
function humanoid(zombie, armor = {}, police = false, back = null, look = null) {
  const st = STYLES[FINAL[zombie ? 'zombie' : 'player']], c = st.pal, g = new THREE.Group();
  const skin = zombie ? c.zskin : c.skin, shirt = zombie ? (police ? 0x5b7bd5 : look === 'jaleco' ? 0xe6f7ff : look === 'macacao' ? 0x5b7bd5 : c.zshirt) : c.shirt;
  const hr = 0.24 * st.head, hy = NECK + hr, front = hr * 1.02;
  const body = pivot(g, 'body', 0, HIP, 0), head = pivot(body, 'head', 0, NECK - HIP, 0);
  const legL = pivot(g, 'legL', -0.15, HIP, 0), legR = pivot(g, 'legR', 0.15, HIP, 0);
  const pants = police ? 0x2f3a6b : look === 'jaleco' ? 0xcfe8f5 : c.pants; // macacao: calca 5b7bd5 (a mesma da camisa)
  for (const l of [legL, legR]) {
    add(l, Cap(0.13, 0.55 - 0.26), pants, 0, 0.275 - HIP, 0);
    if (police) add(l, softGeo(0.24, 0.12, 0.3, 0.04), 0x15121a, 0, 0.06 - HIP, 0.04); // sapato preto
  }
  const t = add(body, Cap(0.62 * 0.45, 0.62 * 0.45, 10), shirt, 0, 0.86 - HIP, 0);
  const hd = add(head, Sph(hr * 1.05), skin, 0, hr, 0);
  if (zombie) {
    const armA = add(body, Cap(0.1, 0.3), skin, -0.34, 1.05 - HIP, 0.22, Math.PI / 2.2, 0, 0);
    const armB = add(body, Cap(0.1, 0.25), skin, 0.34, 0.98 - HIP, 0.2, Math.PI / 2.6, 0, 0.1);
    if (police) for (const a of [armA, armB]) add(a, Cap(0.125, 0.12), shirt, 0, -0.08, 0); // manga da camisa (filha do braço)
    for (const sx of [-1, 1]) face(hd, Box(0.11, 0.09, 0.03), 0xfff6c2, sx * 0.12, 0.02);
    for (const sx of [-1, 1]) face(hd, Box(0.04, 0.04, 0.02), 0xd9302c, sx * 0.12, 0.02, 0.02);
    face(hd, Box(0.16, 0.035, 0.02), 0x3a2028, 0.02, -0.13, 0, 0.15);
    t.rotation.x = 0.15; hd.rotation.z = 0.22; hd.position.z = 0.08;
    if (look === 'jaleco') { add(t, Box(0.16, 0.05, 0.03), 0xff5c57, 0, 0.12, 0.31); add(t, Box(0.05, 0.16, 0.03), 0xff5c57, 0, 0.12, 0.31); } // cruz no peito
    if (look === 'macacao') add(t, Box(0.5, 0.07, 0.03), 0xf2d16b, 0, 0.1, 0.3);                                                              // faixa refletiva
    if (police) { // traje policial; peças filhas de hd/t, então acompanham a inclinação
      add(hd, new THREE.SphereGeometry(hr * 1.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x5b7bd5, 0, 0.02, 0); // quepe
      add(hd, Box(hr * 1.5, 0.04, 0.14), 0x2f2a35, 0, 0.1, 0.36);                                      // aba
      add(hd, Box(0.09, 0.07, 0.03), 0xf2d16b, 0, 0.2, 0.345);                                         // emblema
      add(t, Cap(0.31, 0.27, 10), 0x2f2a35, 0, 0, 0);                                                  // colete tático
      for (const sx of [-1, 1]) add(t, Cap(0.05, 0.12), 0x2f3a6b, sx * 0.2, 0.37, 0, 0, 0, Math.PI / 2); // ombreiras
      add(t, Box(0.08, 0.08, 0.03), 0xf2d16b, 0.1, 0.05, 0.31);                                        // distintivo
      add(t, Cyl(0.32, 0.32, 0.07, 12), 0x15121a, 0, -0.26, 0);                                        // cinto
      add(t, Box(0.08, 0.12, 0.1), 0x15121a, 0.35, -0.27, 0.04);                                       // coldre (quadril direito)
      for (const z of [-0.05, 0.05]) add(t, new THREE.TorusGeometry(0.04, 0.014, 6, 10), 0x9aa3b5, -0.345, -0.26, z, 0, Math.PI / 2, 0); // algemas
    }
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
  if (back) body.add(bagGroup(back));
  return done(g);
}
export const makePlayer = (opts = {}) => humanoid(false, opts.armor || {}, false, opts.back || null);
export const makeZombie = (opts = {}) => humanoid(true, {}, !!opts.police, null, opts.look || null);
// partes soltas, origem na articulação (body/legs em y=0.55 do corpo inteiro; legL x=-0.15, legR x=+0.15)
export function makeZombieParts(opts = {}) {
  const z = makeZombie(opts), out = {};
  for (const n of ['body', 'legL', 'legR']) { out[n] = z.getObjectByName(n); z.remove(out[n]); out[n].position.set(0, 0, 0); }
  return out;
}

// ---------- carro (I, 'slim') ----------
// parts:true = pivôs nomeados (M4 §3). body: tudo que fica na suspensão; wheelFL/FR (dianteiras, x>0) e
// wheelRL/RR giram em x (eixo), as dianteiras viram em y; trunkLid: dobradiça em (-0.6, 0.58), abre com rotation.z = -π/3;
// exhaust, lightL (z<0), lightR (z>0): marcadores vazios. Sem opção = mesma geometria de antes, sem pivôs.
export function makeCar(opts = {}) {
  const c = STYLES[FINAL.car].pal, g = new THREE.Group(), acc = c.accent, parts = !!opts.parts;
  const b = parts ? pivot(g, 'body', 0, 0, 0) : g;
  const x0 = parts ? -0.6 : -1;          // com parts, x < -0.6 é a tampa do porta-malas (peça própria)
  add(b, Box(1 - x0, 0.32, 0.92), c.car, (1 + x0) / 2, 0.42, 0);
  for (const z of [-0.475, 0.475]) add(b, Box(1.7, 0.07, 0.04), acc, 0, 0.47, z);
  add(b, Cyl(0.42, 0.56, 0.32, 4), c.glass, -0.1, 0.75, 0, 0, Math.PI / 4, 0).scale.set(1.25, 1, 0.95);
  add(b, Box(0.9, 0.05, 0.7), c.car, -0.1, 0.935, 0);
  for (const x of [-1.04, 1.04]) add(b, Box(0.08, 0.1, 0.94), 0x5a5f6e, x, 0.3, 0);
  for (const z of [-0.3, 0.3]) {
    add(b, Box(0.05, 0.09, 0.16), 0xfff3b0, 1.03, 0.47, z);
    add(b, Box(0.05, 0.08, 0.14), 0xd9302c, -1.03, 0.47, z);
  }
  const wr = 0.19;
  if (parts) {
    pivot(b, 'lightL', 1.07, 0.47, -0.3); pivot(b, 'lightR', 1.07, 0.47, 0.3); pivot(b, 'exhaust', -1.06, 0.2, 0);
    const lid = pivot(b, 'trunkLid', -0.6, 0.58, 0); add(lid, Box(0.4, 0.32, 0.92), c.car, -0.2, -0.16, 0);
    for (const [n, x, z] of [['wheelFL', 0.62, -0.5], ['wheelFR', 0.62, 0.5], ['wheelRL', -0.62, -0.5], ['wheelRR', -0.62, 0.5]]) {
      // eixo gira 90° em y: o x local do pivô vira o z do carro; o pivô gira em x (roda) em torno desse eixo
      const axle = pivot(g, 'axle' + n.slice(5), x, wr, z); axle.rotation.y = Math.PI / 2;
      const w = pivot(axle, n, 0, 0, 0); w.rotation.order = 'YXZ'; // Ry(direção)·Rx(giro): gira no próprio eixo mesmo virado
      // mesma orientação de polígono da versão sem pivôs (Rx(π/2)), só que com eixo no x local
      const spin = m => { m.rotation.order = 'YXZ'; m.rotation.set(Math.PI / 2, -Math.PI / 2, 0); return m; };
      spin(add(w, Cyl(wr, wr, 0.16, 10), c.wheel)); spin(add(w, Cyl(0.08, 0.08, 0.02, 8), 0xc9d3e0, -Math.sign(z) * 0.09));
    }
  } else {
    for (const x of [-0.62, 0.62]) for (const z of [-0.5, 0.5]) {
      add(g, Cyl(wr, wr, 0.16, 10), c.wheel, x, wr, z, Math.PI / 2, 0, 0);
      add(g, Cyl(0.08, 0.08, 0.02, 8), 0xc9d3e0, x, wr, z + Math.sign(z) * 0.09, Math.PI / 2, 0, 0);
    }
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
  pipe_r: (g, c) => { ITEMS.pipe(g, c); // cano reforçado: arame enrolado (anéis) por cima
    const p = new THREE.Group(); p.position.set(0, 0.45, 0); p.rotation.z = 0.35; g.add(p);
    for (const y of [-0.24, -0.16, -0.08, 0, 0.08, 0.16, 0.24]) add(p, new THREE.TorusGeometry(0.08, 0.018, 6, 10), 0xd8c9a0, 0, y, 0, Math.PI / 2, 0, 0); },
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
  if (BAGS[id]) { const g = new THREE.Group(); BAGS[id].build(g); return done(g); }
  const f = ITEMS[id]; if (!f) throw new Error('item desconhecido: ' + id);
  const g = new THREE.Group(); f(g, STYLES[FINAL.items].pal); return done(g);
}

// ---------- mochilas (M4.5 §2): build(g) monta em volta da origem, frente (bolsos) em +z, alça de mão no topo ----------
const BAGS = {
  bag_school: { d: 0.2, build(g) {
    add(g, softGeo(0.32, 0.36, 0.2, 0.08), 0xff8c69, 0, 0, 0);
    add(g, softGeo(0.2, 0.14, 0.04, 0.04), 0xff8c69, 0, -0.08, 0.125);           // bolso frontal, sai 4 cm do corpo
    add(g, new THREE.TorusGeometry(0.07, 0.018, 6, 10), 0x2f2a35, 0, 0.18, 0);    // alça de mão
  } },
  bag_hiking: { d: 0.22, build(g) {
    add(g, softGeo(0.3, 0.6, 0.22, 0.1), 0x78a865, 0, 0, 0);
    add(g, Cap(0.09, 0.1), 0xff5c57, 0, 0.36, 0, 0, 0, Math.PI / 2);             // saco de dormir enrolado (eixo x)
    for (const x of [-0.08, 0.08]) add(g, Box(0.07, 0.05, 0.03), 0x9aa3b5, x, 0, 0.12); // fivelas
  } },
  bag_military: { d: 0.24, build(g) {
    add(g, softGeo(0.4, 0.44, 0.24, 0.06), 0x4a5266, 0, 0, 0);
    for (const sx of [-1, 1]) add(g, softGeo(0.18, 0.26, 0.06, 0.04), 0x4a5266, sx * 0.22, -0.02, 0, 0, Math.PI / 2, 0); // bolsos laterais
    add(g, new THREE.TorusGeometry(0.07, 0.018, 6, 10), 0x2f2a35, 0, 0.22, 0);    // alça de mão
  } },
};
// mochila vestida, origem no pivô body do jogador: bolsos para trás (-z), costas no tronco, alças sobre os ombros
function bagGroup(id) {
  const B = BAGS[id]; if (!B) throw new Error('mochila desconhecida: ' + id);
  const g = new THREE.Group(), b = new THREE.Group();
  b.position.set(0, 0.31, -(0.239 + B.d / 2)); b.rotation.y = Math.PI; g.add(b); B.build(b);
  for (const sx of [-1, 1]) add(g, Cap(0.035, 0.3), 0x2f2a35, sx * 0.13, 0.52, -0.22); // alças
  return g;
}
export function makeBackpack(id) { return done(bagGroup(id)); }

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
export function makeRoof(w, d, pal = 'A', floors = 1) {
  const P = CASA[pal] || CASA.A, g = new THREE.Group();
  const t = 0.2, y0 = 0.8, H = floors > 1 ? 3.8 : 1.4, yT = y0 + H, RH = 0.9, yc = y0 + H / 2;
  const xc = w / 2 - t / 2, zc = d / 2 - t / 2, L = d - 2 * t;
  // fachadas em ±w/2 e ±d/2; as de frente/fundo passam por cima dos cantos, sem sobreposição de faces
  add(g, Box(w, H, t), P.wall, 0, yc, zc); add(g, Box(w, H, t), P.wall, 0, yc, -zc);
  add(g, Box(t, H, L), P.wall, xc, yc, 0); add(g, Box(t, H, L), P.wall, -xc, yc, 0);
  // janela (vidro 45505c) com floreira madeira eab26a e dois arbustos 78a865; (x,z) = centro na fachada
  const janela = (x, z, alongX, yb = 0) => {
    const ox = alongX ? 0 : Math.sign(x), oz = alongX ? Math.sign(z) : 0;
    add(g, alongX ? Box(0.8, 0.5, 0.04) : Box(0.04, 0.5, 0.8), VIDRO, x, 1.5 + yb, z);
    add(g, alongX ? Box(1.0, 0.12, 0.14) : Box(0.14, 0.12, 1.0), FLORA, x + ox * 0.05, 1.18 + yb, z + oz * 0.05);
    for (const k of [-0.36, 0.36]) add(g, new THREE.IcosahedronGeometry(0.08, 0), ARBUSTO, alongX ? x + k : x + ox * 0.06, 1.27 + yb, alongX ? z + oz * 0.06 : z + k);
  };
  const vaos = L2 => { const n = Math.max(1, Math.floor(L2 / 2.4)); return Array.from({ length: n }, (_, i) => -L2 / 2 + L2 * (i + 0.5) / n); };
  for (const s of [-1, 1]) {
    for (const yb of floors > 1 ? [0, 2.4] : [0]) {
      for (const u of vaos(w)) janela(u, s * d / 2, true, yb);
      for (const u of vaos(L)) janela(s * w / 2, u, false, yb);
    }
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

// telhado do mercado: faixa de paredes 0,8-3,0 m, vitrines na fachada sul (+z), laje plana com platibanda e letreiro MERCADO.
// doorX = centro da porta dupla (2 m) relativo ao centro do prédio.
const LETRAS = { M: ['101', '111', '111', '101', '101'], E: ['111', '100', '110', '100', '111'], R: ['110', '101', '110', '101', '101'], C: ['111', '100', '100', '100', '111'], A: ['010', '101', '111', '101', '101'], D: ['110', '101', '101', '101', '110'], O: ['111', '101', '101', '101', '111'], F: ['111', '100', '110', '100', '100'], I: ['111', '010', '010', '010', '111'], P: ['110', '101', '110', '100', '100'], L: ['100', '100', '100', '100', '111'], S: ['011', '100', '010', '001', '110'], N: ['101', '111', '111', '101', '101'], T: ['111', '010', '010', '010', '010'] };
export function makeMarketRoof(w, d, doorX = 0, label = 'MERCADO') {
  const g = new THREE.Group(), t = 0.2, y0 = 0.8, H = 2.2, yc = y0 + H / 2, zc = d / 2 - t / 2, xc = w / 2 - t / 2, L = d - 2 * t, PAR = 0xd6cfc4, ACC = 0xff8c69;
  add(g, Box(w, H, t), PAR, 0, yc, -zc);
  add(g, Box(t, H, L), PAR, xc, yc, 0); add(g, Box(t, H, L), PAR, -xc, yc, 0);
  // fachada sul: dois trechos + verga sobre a porta (vão de 0,8 a 2,0 m livre para a folha abrir)
  const a = doorX - 1, b = doorX + 1;
  add(g, Box(b - a, 1.0, t), PAR, doorX, 2.5, zc);
  for (const [x0, x1] of [[-w / 2, a], [b, w / 2]]) {
    add(g, Box(x1 - x0, H, t), PAR, (x0 + x1) / 2, yc, zc);
    if (x1 - x0 > 1.6) add(g, Box(x1 - x0 - 1.0, 1.5, 0.05), VIDRO, (x0 + x1) / 2, 1.75, d / 2 + 0.005); // vitrine larga
  }
  // laje plana + platibanda
  add(g, Box(w, 0.2, d), 0x5e5b6b, 0, 3.1, 0);
  add(g, Box(w, 0.4, t), ACC, 0, 3.4, zc); add(g, Box(w, 0.4, t), ACC, 0, 3.4, -zc);
  add(g, Box(t, 0.4, L), ACC, xc, 3.4, 0); add(g, Box(t, 0.4, L), ACC, -xc, 3.4, 0);
  // letreiro: placa ff8c69 sobre a verga, letras em blocos fff1e0 (fonte 3x5)
  const cell = 0.12, adv = 0.5, n = label.length, tw = n * adv - 0.14 + 0.5;
  add(g, Box(tw, 0.8, 0.1), ACC, doorX, 2.5, d / 2 + 0.04);
  [...label].forEach((ch, i) => LETRAS[ch].forEach((row, r) => {
    for (let c = 0; c < 3; c++) if (row[c] === '1') add(g, Box(cell, cell, 0.04), 0xfff1e0, doorX + (i - (n - 1) / 2) * adv + (c - 1) * cell, 2.5 + (2 - r) * cell, d / 2 + 0.1);
  }));
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

// móveis (ESTILO.md): medidas w×d×h em m, base no chão, FRENTE SEMPRE +z (costas/cabeceira em -z, encostam na parede; render.js gira por c.wall). open:true = versão vasculhada
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
    case 'stove': { // fogão: corpo branco, tampo escuro com 4 bocas, painel e porta do forno
      add(g, softGeo(0.7, 0.9, 0.6, 0.05), 0xe6f7ff, 0, 0.45, 0);
      add(g, Box(0.7, 0.04, 0.6), 0x5e5b6b, 0, 0.92, 0);
      for (const x of [-0.17, 0.17]) for (const z of [-0.14, 0.14]) add(g, Cyl(0.09, 0.09, 0.03, 10), 0x2f2a35, x, 0.95, z);
      add(g, Box(0.6, 0.12, 0.05), 0x5e5b6b, 0, 0.84, -0.3);   // painel traseiro
      folha(g, -0.3, 0.05, 0.6, 0.55, 0.6, 1, 0xe6f7ff, 0x9aa3b5, op);
      for (const x of [-0.2, 0, 0.2]) add(g, Cyl(0.03, 0.03, 0.04, 8), 0x2f2a35, x, 0.72, 0.31, Math.PI / 2, 0, 0);
      break; }
    case 'sink': // pia: gabinete, tampo, cuba de metal e torneira
      add(g, softGeo(0.76, 0.85, 0.46, 0.05), 0xeab26a, 0, 0.425, 0);
      add(g, Box(0.8, 0.05, 0.5), 0xe6f7ff, 0, 0.875, 0);
      add(g, Cyl(0.2, 0.17, 0.08, 10), 0x9aa3b5, 0, 0.9, 0.03).scale.x = 1.4;
      add(g, Cyl(0.025, 0.025, 0.2, 8), 0x9aa3b5, 0, 1.0, -0.2);
      add(g, Cyl(0.02, 0.02, 0.14, 8), 0x9aa3b5, 0, 1.09, -0.13, Math.PI / 2, 0, 0);
      folha(g, -0.19, 0.03, 0.36, 0.78, 0.46, 1, 0xeab26a, 0x6e4422, false);
      folha(g, 0.19, 0.03, 0.36, 0.78, 0.46, -1, 0xeab26a, 0x6e4422, false);
      break;
    case 'bed': // cama 1,0×2,0×0,6: estrado, colchão, travesseiro, coberta; cabeceira em -z
      add(g, softGeo(1.0, 0.3, 2.0, 0.05).rotateX(Math.PI / 2), 0xeab26a, 0, 0.15, 0);
      add(g, softGeo(0.9, 0.2, 1.9, 0.08).rotateX(Math.PI / 2), 0xfff3d6, 0, 0.4, 0);
      add(g, Box(1.04, 0.6, 0.08), 0xeab26a, 0, 0.3, -1.0);
      add(g, Cap(0.14, 0.4), 0xfff3d6, 0, 0.58, -0.7, 0, 0, Math.PI / 2);
      add(g, softGeo(0.94, 0.06, 1.15, 0.03).rotateX(Math.PI / 2), 0xff8c69, 0, 0.53, 0.3);
      break;
    case 'nightstand': // criado-mudo 0,45×0,4×0,5 com gaveta
      add(g, softGeo(0.45, 0.5, 0.4, 0.05), 0xeab26a, 0, 0.25, 0);
      add(g, softGeo(0.38, 0.18, 0.04, 0.03), 0xeab26a, 0, 0.35, 0.2 + (op ? 0.18 : 0));
      add(g, Cap(0.02, 0.1), 0x6e4422, 0, 0.35, 0.23 + (op ? 0.18 : 0)).rotation.z = Math.PI / 2;
      add(g, softGeo(0.38, 0.18, 0.04, 0.03), 0xeab26a, 0, 0.14, 0.2);
      add(g, Cap(0.02, 0.1), 0x6e4422, 0, 0.14, 0.23).rotation.z = Math.PI / 2;
      break;
    case 'toilet': // vaso 0,4×0,6×0,8
      add(g, Cyl(0.18, 0.13, 0.4, 10), 0xe6f7ff, 0, 0.2, 0.1);
      add(g, Cyl(0.2, 0.2, 0.05, 10), 0xe6f7ff, 0, 0.43, 0.1);
      add(g, softGeo(0.38, 0.45, 0.18, 0.05), 0xe6f7ff, 0, 0.62, -0.2);
      add(g, Cyl(0.03, 0.03, 0.04, 8), 0x9aa3b5, 0.12, 0.87, -0.2);
      break;
    case 'medcab': // armarinho de parede 0,5×0,15×0,6, base em y=1.2
      add(g, softGeo(0.5, 0.6, 0.16, 0.04), 0xe6f7ff, 0, 1.5, 0);
      folha(g, -0.23, 1.23, 0.46, 0.54, 0.16, 1, 0xe6f7ff, 0x9aa3b5, op);
      if (!op) { add(g, Box(0.16, 0.05, 0.03), 0xff5c57, 0, 1.5, 0.1); add(g, Box(0.05, 0.16, 0.03), 0xff5c57, 0, 1.5, 0.1); }
      break;
    case 'sofa': { // sofá 1,8×0,8×0,85
      const C = opts.color || 0x9b6a3c;
      add(g, softGeo(1.8, 0.4, 0.8, 0.08), C, 0, 0.2, 0);
      add(g, softGeo(1.8, 0.5, 0.2, 0.08), C, 0, 0.6, -0.3);
      for (const s of [-1, 1]) add(g, Cap(0.12, 0.4), C, s * 0.85, 0.45, 0.02);
      for (const x of [-0.4, 0.4]) add(g, softGeo(0.7, 0.14, 0.55, 0.05), 0xfff3d6, x, 0.45, 0.1);
      for (const s of [-1, 1]) add(g, Sph(0.12, 8, 6), 0xff8c69, s * 0.65, 0.62, -0.1);
      break; }
    case 'bookshelf': { // estante 1,0×0,3×1,8 com livros
      add(g, softGeo(1.0, 1.8, 0.3, 0.04), 0x9b6a3c, 0, 0.9, 0);
      const L = [0xff5c57, 0x5b7bd5, 0x78a865, 0xf2d16b, 0xff8c69]; let i = 0;
      for (const y of [0.3, 0.7, 1.1, 1.5]) {
        add(g, Box(0.92, 0.04, 0.34), 0xeab26a, 0, y - 0.18, 0);
        for (let x = -0.4; x < 0.42; x += 0.11, i++) add(g, Box(0.08, 0.26 + (i % 3) * 0.03, 0.2), L[i % 5], x, y - 0.03, 0.08 + (op && y === 1.1 && i % 4 === 0 ? 0.06 : 0));
      }
      break; }
    case 'toolbox': { // caixa de ferramentas 0,46×0,3×0,3: corpo vermelho, alça, trincos; tampa em pivô atrás
      const R = 0xff5c57;
      add(g, softGeo(0.46, 0.2, 0.3, 0.04), R, 0, 0.1, 0);
      const p = new THREE.Group(); p.position.set(0, 0.2, -0.15); p.rotation.x = op ? -1.8 : 0; g.add(p);
      add(p, softGeo(0.46, 0.06, 0.3, 0.03), R, 0, 0.03, 0.15);
      add(p, Cap(0.015, 0.2), 0x2f2a35, 0, 0.1, 0.15, 0, 0, Math.PI / 2);
      for (const x of [-0.15, 0.15]) add(p, Box(0.05, 0.05, 0.02), 0x9aa3b5, x, 0.02, 0.3);
      break; }
    case 'table': // mesa 1,2×0,8×0,75, 4 pés
      add(g, softGeo(1.2, 0.06, 0.8, 0.03).rotateX(Math.PI / 2), 0xeab26a, 0, 0.72, 0);
      for (const x of [-0.54, 0.54]) for (const z of [-0.34, 0.34]) add(g, Cyl(0.04, 0.04, 0.7, 6), 0x9b6a3c, x, 0.35, z);
      break;
    case 'box_mercado': case 'box_posto': case 'box_galpao': return makeFurniture('box', opts); // caixas de depósito (mesmo modelo)
    case 'toolbox_oficina': return makeFurniture('toolbox', opts); // bancada de ferramentas
    case 'pew': // banco de igreja 2,8×0,6×0,9
      add(g, Box(2.8, 0.08, 0.45), 0xeab26a, 0, 0.45, 0.05);
      add(g, Box(2.8, 0.55, 0.07), 0x9b6a3c, 0, 0.75, -0.25);
      for (const x of [-1.3, 0, 1.3]) add(g, Box(0.08, 0.45, 0.5), 0x9b6a3c, x, 0.225, 0);
      break;
    case 'altar': // altar 2,0×0,8×1,0: bloco de pedra, toalha, cruz
      add(g, softGeo(2.0, 0.95, 0.8, 0.05), 0xd6cfc4, 0, 0.475, 0);
      add(g, Box(2.06, 0.06, 0.86), 0xfff3d6, 0, 0.98, 0);
      add(g, Box(0.06, 0.4, 0.06), 0xf2d16b, 0, 1.2, 0); add(g, Box(0.22, 0.06, 0.06), 0xf2d16b, 0, 1.27, 0);
      break;
    case 'sacristy': // armário da sacristia 1,0×0,5×1,6 com cruz
      add(g, softGeo(1.0, 1.6, 0.5, 0.05), 0x9b6a3c, 0, 0.8, 0);
      folha(g, -0.48, 0.02, 0.47, 1.56, 0.5, 1, 0x9b6a3c, 0x9aa3b5, op);
      folha(g, 0.48, 0.02, 0.47, 1.56, 0.5, -1, 0x9b6a3c, 0x9aa3b5, false);
      add(g, Box(0.05, 0.3, 0.04), 0xf2d16b, 0, 1.35, 0.26); add(g, Box(0.18, 0.05, 0.04), 0xf2d16b, 0, 1.4, 0.26);
      break;
    case 'counter': case 'desk': { // balcão 2,2×0,7 / recepção 1,4×0,7, altura 1,0
      const w = kind === 'desk' ? 1.4 : 2.2;
      add(g, softGeo(w, 0.95, 0.7, 0.05), 0xeab26a, 0, 0.475, 0);
      add(g, Box(w + 0.06, 0.06, 0.76), 0xe6f7ff, 0, 0.98, 0);
      if (kind === 'desk') { add(g, Box(0.4, 0.03, 0.3), 0x9aa3b5, -0.3, 1.02, 0.1); const d = add(g, softGeo(0.5, 0.2, 0.04, 0.02), 0xeab26a, 0.3, 0.7, 0.36 + (op ? 0.2 : 0)); add(d, Cap(0.015, 0.1), 0x6e4422, 0, 0, 0.03).rotation.z = Math.PI / 2; }
      break; }
    case 'carteira': // carteira escolar 0,9×0,6×0,8
      add(g, Box(0.9, 0.05, 0.6), 0xeab26a, 0, 0.72, 0);
      for (const x of [-0.4, 0.4]) add(g, Cyl(0.025, 0.025, 0.7, 6), 0x9aa3b5, x, 0.35, -0.2);
      add(g, Box(0.4, 0.05, 0.4), 0x9b6a3c, 0, 0.42, 0.55); add(g, Box(0.4, 0.3, 0.05), 0x9b6a3c, 0, 0.62, 0.74);
      break;
    case 'pshelf': { // prateleira de farmácia 1,8×0,6×1,5: metal, caixas brancas, cruz vermelha
      const M = 0x9aa3b5, PR = [0xe6f7ff, 0xcfe8f5, 0xe6f7ff];
      for (const x of [-0.87, 0.87]) add(g, Box(0.04, 1.5, 0.56), M, x, 0.75, 0);
      for (const y of [0.05, 0.5, 0.95, 1.4]) add(g, Box(1.74, 0.04, 0.52), M, 0, y, 0);
      let i = 0; for (const y of [0.05, 0.5, 0.95]) for (let x = -0.68; x <= 0.69; x += 0.27) add(g, softGeo(0.2, 0.2, 0.18, 0.04), PR[i++ % 3], x, y + 0.12, 0);
      add(g, Box(0.22, 0.06, 0.03), 0xff5c57, 0.87, 1.2, 0.0); add(g, Box(0.06, 0.22, 0.03), 0xff5c57, 0.87, 1.2, 0.0);
      break; }
    case 'medcart': { // carrinho hospitalar 0,8×0,5×0,9
      add(g, softGeo(0.8, 0.6, 0.5, 0.05), 0xe6f7ff, 0, 0.5, 0);
      for (const y of [0.35, 0.6]) { const d = add(g, softGeo(0.7, 0.2, 0.04, 0.02), 0x9aa3b5, 0, y, 0.26 + (op && y === 0.6 ? 0.18 : 0)); add(d, Cap(0.012, 0.12), 0x2f2a35, 0, 0, 0.03).rotation.z = Math.PI / 2; }
      add(g, Box(0.14, 0.04, 0.02), 0xff5c57, 0.25, 0.82, 0.26); add(g, Box(0.04, 0.14, 0.02), 0xff5c57, 0.25, 0.82, 0.26);
      for (const x of [-0.35, 0.35]) for (const z of [-0.18, 0.18]) add(g, Cyl(0.06, 0.06, 0.06, 8), 0x2f2a35, x, 0.06, z, 0, 0, Math.PI / 2);
      break; }
    case 'stretcher': // maca 0,9×2,0×0,6
      add(g, Box(0.9, 0.06, 2.0), 0x9aa3b5, 0, 0.45, 0);
      add(g, softGeo(0.8, 0.12, 1.9, 0.05).rotateX(Math.PI / 2), 0xfff3d6, 0, 0.54, 0);
      add(g, softGeo(0.82, 0.04, 1.2, 0.02).rotateX(Math.PI / 2), 0xe6f7ff, 0, 0.62, 0.3);
      add(g, Cap(0.12, 0.4), 0xfff3d6, 0, 0.64, -0.75, 0, 0, Math.PI / 2);
      for (const x of [-0.4, 0.4]) for (const z of [-0.85, 0.85]) { add(g, Cyl(0.03, 0.03, 0.4, 6), 0x9aa3b5, x, 0.22, z); add(g, Cyl(0.07, 0.07, 0.05, 8), 0x2f2a35, x, 0.04, z, 0, 0, Math.PI / 2); }
      break;
    case 'gunlocker': { // armário de armas 1,2×0,5×1,8: metal, 2 portas; trancado = cadeado sempre visível
      add(g, softGeo(1.2, 1.8, 0.5, 0.04), 0x9aa3b5, 0, 0.9, 0);
      folha(g, -0.58, 0.02, 0.56, 1.76, 0.5, 1, 0x9aa3b5, 0x2f2a35, op);
      folha(g, 0.58, 0.02, 0.56, 1.76, 0.5, -1, 0x9aa3b5, 0x2f2a35, false);
      for (const y of [0.6, 1.2, 1.55]) add(g, Box(0.05, 0.01, 0.02), 0x2f2a35, -0.3, y, 0.26);
      if (opts.locked) { add(g, softGeo(0.14, 0.12, 0.05, 0.02), 0xf2d16b, 0, 0.95, 0.3); add(g, new THREE.TorusGeometry(0.05, 0.015, 6, 10), 0x9aa3b5, 0, 1.05, 0.3); }
      break; }
    case 'bars': // grade da cela 1,3×0,15×2,0 (várias barras)
      for (let x = -0.6; x <= 0.61; x += 0.15) add(g, Cyl(0.02, 0.02, 2.0, 6), 0x2f2a35, x, 1.0, 0);
      for (const y of [0.1, 1.0, 1.95]) add(g, Box(1.3, 0.05, 0.06), 0x9aa3b5, 0, y, 0);
      break;
    case 'locker': // armário de vestiário 1,2×0,5×1,8: 2 portas azuis
      add(g, softGeo(1.2, 1.8, 0.5, 0.04), 0x5b7bd5, 0, 0.9, 0);
      folha(g, -0.58, 0.02, 0.56, 1.76, 0.5, 1, 0x5b7bd5, 0x9aa3b5, op);
      folha(g, 0.58, 0.02, 0.56, 1.76, 0.5, -1, 0x5b7bd5, 0x9aa3b5, false);
      for (const x of [-0.3, 0.3]) for (const y of [1.5, 1.6]) add(g, Box(0.2, 0.012, 0.02), 0x2f2a35, x, y, 0.26);
      break;
    case 'pump': // bomba de combustível 0,7×0,5×1,3 (sem energia)
      add(g, softGeo(0.5, 1.2, 0.35, 0.05), 0xff5c57, 0, 0.65, 0);
      add(g, Box(0.52, 0.08, 0.37), 0x9aa3b5, 0, 0.04, 0);
      add(g, Box(0.34, 0.22, 0.03), 0x4a5266, 0, 0.95, 0.18);
      add(g, Box(0.52, 0.05, 0.37), 0xf2d16b, 0, 0.7, 0);
      add(g, Cap(0.03, 0.4), 0x2f2a35, 0.3, 0.7, 0.05, 0, 0, 0.3); add(g, Box(0.1, 0.1, 0.06), 0x2f2a35, 0.34, 0.45, 0.05);
      break;
    default: throw new Error('móvel desconhecido: ' + kind);
  }
  return done(g);
}

// assoalho de interior: 1 cm acima do chão (grama em y=0)
export function makeFloor(w, d) {
  const g = new THREE.Group(); add(g, Box(w, 0.01, d), ASSOALHO, 0, 0.005, 0); return done(g);
}

// ---------- portas legíveis, cadeado, props de rua ----------
const escurece = (c, k = 0.7) => { const o = new THREE.Color(c); o.multiplyScalar(k); return o.getHex(); };
// batente no vão (x de 0 a w, como makeDoor): montantes 0,08 + verga; sobressai 3 cm de cada lado da parede de 0,2
export function makeDoorFrame(w = 1.4, h = 2.0, wallColor = CASA.A.wall) {
  const g = new THREE.Group(), c = escurece(wallColor), T = 0.26;
  for (const x of [-0.04, w + 0.04]) add(g, Box(0.09, h + 0.1, T), c, x, (h + 0.1) / 2, 0);
  add(g, Box(w + 0.18, 0.1, T), c, w / 2, h + 0.05, 0);
  return done(g);
}
// soleira 0,1 m + capacho; frente +z, x de 0 a w
export function makeDoorstep(w = 1.4) {
  const g = new THREE.Group();
  add(g, softGeo(w + 0.2, 0.1, 0.4, 0.03), 0xd6cfc4, w / 2, 0.05, 0.3);
  add(g, softGeo(w * 0.6, 0.04, 0.3, 0.02), 0xeab26a, w / 2, 0.12, 0.34);
  return done(g);
}
export function makePadlock() {
  const g = new THREE.Group();
  add(g, softGeo(0.12, 0.1, 0.05, 0.02), 0xf2d16b, 0, 0, 0);
  add(g, new THREE.TorusGeometry(0.04, 0.012, 6, 10, Math.PI), 0x9aa3b5, 0, 0.05, 0);
  return done(g);
}
ITEMS.cutter = (g, c) => {
  for (const [s, col] of [[-1, 0xff5c57], [1, 0x2f2a35]]) {
    add(g, Cap(0.045, 0.5), col, s * 0.07, 0.22, 0, 0, 0, -s * 0.2);
    add(g, Box(0.07, 0.14, 0.05), 0x9aa3b5, -s * 0.06, 0.6, 0, 0, 0, s * 0.35);
  }
  add(g, Cyl(0.03, 0.03, 0.08, 8), 0x9aa3b5, 0, 0.48, 0, Math.PI / 2, 0, 0);
};
// ---------- F3 Cidades: escada, portão, laje, varanda (ESTILO.md "Casas variadas e sobrado") ----------
// escada 1,0 (x) × 2,4 (z), centrada na origem; sobe para +z até 2,4 m; o render gira por ry para a direção da subida
export function makeStairs() {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) add(g, Box(0.84, 0.4 * (i + 1), 0.4), FLORA, 0, 0.2 * (i + 1), -1.0 + 0.4 * i);
  for (const sx of [-1, 1]) add(g, Box(0.08, 2.4, 2.4), 0x9b6a3c, sx * 0.46, 1.2, 0);
  add(g, Cap(0.03, 2.2, 6), 0x6e4422, -0.46, 1.3, 0, Math.PI / 2 - 0.9, 0, 0);
  return done(g);
}
// portão de garagem: painel pendurado no topo (y de -2,0 a 0; o render posiciona em y=2,0 e escala Y para enrolar), x de 0 a w como a porta
export function makeGate(w = 2.4) {
  const g = new THREE.Group();
  add(g, Box(w, 2.0, 0.12), FLORA, w / 2, -1.0, 0);
  for (const y of [-0.4, -0.85, -1.3, -1.75]) add(g, Box(w - 0.1, 0.05, 0.16), 0x6e4422, w / 2, y, 0);
  add(g, Box(0.14, 0.06, 0.18), 0x9aa3b5, w / 2, -1.1, 0);
  for (const x of [-0.04, w + 0.04]) add(g, Box(0.08, 2.1, 0.2), 0x9aa3b5, x, -1.0, 0);
  return done(g);
}
// laje: placa 15 cm cobrindo w×d (centrada em x,z; topo em y=0), com furo (hole = {x,z,w,d} relativo ao centro) — 4 blocos em volta do furo
export function makeSlab(w, d, hole) {
  const g = new THREE.Group(), T = 0.15, hx0 = hole ? hole.x - hole.w / 2 : 0, hx1 = hole ? hole.x + hole.w / 2 : 0, hz0 = hole ? hole.z - hole.d / 2 : 0, hz1 = hole ? hole.z + hole.d / 2 : 0;
  const blk = (x0, x1, z0, z1) => { if (x1 - x0 > 0.01 && z1 - z0 > 0.01) { add(g, Box(x1 - x0, T, z1 - z0), ASSOALHO, (x0 + x1) / 2, -T / 2, (z0 + z1) / 2); add(g, Box(x1 - x0 - 0.02, 0.02, z1 - z0 - 0.02), ASSOALHO, (x0 + x1) / 2, 0.011, (z0 + z1) / 2); } };
  if (!hole) blk(-w / 2, w / 2, -d / 2, d / 2);
  else { blk(-w / 2, w / 2, -d / 2, hz0); blk(-w / 2, w / 2, hz1, d / 2); blk(-w / 2, hx0, hz0, hz1); blk(hx1, w / 2, hz0, hz1); }
  return done(g);
}
export function makeProp(kind) {
  const g = new THREE.Group();
  switch (kind) {
    case 'lamp':
      add(g, Cyl(0.04, 0.05, 2.6, 6), 0x2f2a35, 0, 1.3, 0);
      add(g, Cyl(0.1, 0.1, 0.06, 8), 0x2f2a35, 0, 0.03, 0);
      add(g, Sph(0.16, 8, 6), 0xfff3b0, 0, 2.7, 0);
      break;
    case 'trash':
      add(g, Cyl(0.28, 0.24, 0.8, 8), 0x78a865, 0, 0.4, 0);
      add(g, Cyl(0.3, 0.3, 0.06, 8), 0x78a865, 0, 0.83, 0);
      add(g, Cap(0.03, 0.14), 0x2f2a35, 0, 0.9, 0, 0, 0, Math.PI / 2);
      break;
    case 'mailbox':
      add(g, Cyl(0.04, 0.04, 1.0, 6), 0x2f2a35, 0, 0.5, 0);
      add(g, Cap(0.15, 0.3), 0xff5c57, 0, 1.1, 0, Math.PI / 2, 0, 0);
      add(g, Box(0.03, 0.12, 0.06), 0xf2d16b, 0.17, 1.2, 0.05);
      break;
    case 'hydrant':
      add(g, Cyl(0.14, 0.17, 0.6, 8), 0xff5c57, 0, 0.3, 0);
      add(g, Sph(0.15, 8, 6), 0xff5c57, 0, 0.66, 0);
      add(g, Cyl(0.05, 0.05, 0.4, 6), 0x9aa3b5, 0, 0.4, 0, 0, 0, Math.PI / 2);
      break;
    case 'bench':
      add(g, Box(1.4, 0.06, 0.4), 0xeab26a, 0, 0.45, 0);
      add(g, Box(1.4, 0.3, 0.05), 0xeab26a, 0, 0.7, -0.2);
      for (const x of [-0.6, 0.6]) add(g, Box(0.06, 0.45, 0.36), 0x2f2a35, x, 0.225, 0);
      break;
    case 'bush':
      add(g, new THREE.IcosahedronGeometry(0.45, 0), 0x78a865, 0, 0.4, 0);
      break;
    case 'varanda': // piso 3,0 x 1,2 a frente (+z local) e 2 colunas nas pontas externas
      add(g, Box(3.0, 0.08, 1.2), 0xd6cfc4, 0, 0.04, 0.6);
      for (const sx of [-1, 1]) add(g, Cyl(0.07, 0.07, 2.2, 8), 0xeab26a, sx * 1.35, 1.1, 1.05);
      add(g, Box(3.0, 0.1, 0.12), 0xeab26a, 0, 2.25, 1.05);
      break;
    case 'coreto': // praca: piso octogonal, 6 colunas, telhado cone (ESTILO.md Praca e balao)
      add(g, Cyl(2.2, 2.2, 0.2, 8), 0xd6cfc4, 0, 0.1, 0);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; add(g, Cyl(0.08, 0.08, 2.2, 8), 0xeab26a, Math.cos(a) * 1.8, 1.3, Math.sin(a) * 1.8); }
      add(g, Cyl(1.95, 1.95, 0.1, 8), 0xeab26a, 0, 2.45, 0);
      add(g, Cyl(0.05, 2.2, 1.0, 8), 0xc9705f, 0, 3.0, 0);
      add(g, Sph(0.12, 8, 6), 0xf2d16b, 0, 3.55, 0);
      break;
    case 'canteiro': case 'canteiro_g': { // canteiro redondo: anel d6cfc4, terra, arbusto e flores; _g = balao (Ø4 m)
      const k = kind === 'canteiro_g' ? 1.8 : 1;
      add(g, Cyl(1.1 * k, 1.1 * k, 0.3, 12), 0xd6cfc4, 0, 0.15, 0);
      add(g, Cyl(0.95 * k, 0.95 * k, 0.06, 12), 0x9b6a3c, 0, 0.32, 0);
      add(g, new THREE.IcosahedronGeometry(0.4 * k, 0), 0x78a865, 0, 0.6, 0);
      if (k > 1) add(g, new THREE.IcosahedronGeometry(0.3 * k, 0), 0x78a865, 0.8, 0.5, 0.5);
      for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.4; add(g, Sph(0.09, 6, 5), i % 2 ? 0xff8c69 : 0xf2d16b, Math.cos(a) * 0.7 * k, 0.4, Math.sin(a) * 0.7 * k); }
      break;
    }
    case 'torre': // torre da igreja (colisão r 1,1)
      add(g, Box(2.0, 5.0, 2.0), 0xfff3d6, 0, 2.5, 0);
      for (const s of [-1, 1]) { add(g, Box(0.5, 0.8, 0.04), 0x45505c, 0, 3.6, s * 1.02); add(g, Box(0.04, 0.8, 0.5), 0x45505c, s * 1.02, 3.6, 0); }
      add(g, new THREE.ConeGeometry(1.0, 1.6, 4).rotateY(Math.PI / 4).scale(1.4, 1, 1.4), 0xc9705f, 0, 5.8, 0);
      add(g, Sph(0.15, 8, 6), 0xf2d16b, 0, 4.3, 0); add(g, Box(0.06, 0.5, 0.06), 0xf2d16b, 0, 6.85, 0); add(g, Box(0.28, 0.06, 0.06), 0xf2d16b, 0, 6.95, 0);
      break;
    case 'cobertura': // cobertura do posto 6,2×3,0 a 3,2 m, sem colisão (frente +z)
      add(g, Box(6.2, 0.2, 3.0), 0xd6cfc4, 0, 3.3, 0); add(g, Box(6.2, 0.3, 0.1), 0xff5c57, 0, 3.15, 1.5);
      for (const x of [-2.9, 2.9]) for (const z of [-1.3, 1.3]) add(g, Cyl(0.08, 0.08, 3.2, 8), 0x9aa3b5, x, 1.6, z);
      break;
    case 'lapide': // lápide (colisão r 0,3)
      add(g, Box(0.6, 0.1, 0.25), 0x9aa3b5, 0, 0.05, 0);
      add(g, softGeo(0.5, 0.8, 0.15, 0.06), 0xd6cfc4, 0, 0.5, 0);
      add(g, Box(0.04, 0.3, 0.02), 0x9aa3b5, 0, 0.55, 0.08); add(g, Box(0.16, 0.04, 0.02), 0x9aa3b5, 0, 0.62, 0.08);
      break;
    case 'tank': // tampa do tanque (chão): disco, aro, alça
      add(g, Cyl(0.4, 0.4, 0.05, 12), 0x5e5b6b, 0, 0.025, 0); add(g, Cyl(0.32, 0.32, 0.06, 12), 0x9aa3b5, 0, 0.04, 0);
      add(g, Box(0.22, 0.03, 0.05), 0xf2d16b, 0, 0.09, 0);
      break;
    default: throw new Error('prop desconhecido: ' + kind);
  }
  return done(g);
}
