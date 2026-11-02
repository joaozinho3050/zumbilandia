// Aviões de guerra e cargueiro, inspirados em aviões reais (proporções em metros).
// Frente = -Z, cima = +Y, direita = +X.
import * as THREE from '../lib/three.module.min.js';
import { perfil, loft, flipGeo, articulada, brilho, uvPorAltura, criarPiloto, pernaTrem, mesclar, criarAviao, PINTURAS } from './aviao3d.js';

const mapD = (s, z, y) => [s, y, z], mapE = (s, z, y) => [-s, y, z], mapV = (s, z, y) => [y, s, z];
const sombra = (o) => { o.traverse((m) => { if (m.isMesh) m.castShadow = true; }); return o; };
const est = (f) => (s0, s1, n = 3) => Array.from({ length: n + 1 }, (_, i) => f(s0 + (s1 - s0) * i / n));
const mat = (cor, r = 0.5, m = 0.2, extra = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: r, metalness: m, ...extra });
function corpoTorno(rf, z0, z1, n, seg, sx, sy, mat, liftCauda = 0, zCauda = 0) {
  const prof = []; for (let i = 0; i <= n; i++) { const z = z0 + (z1 - z0) * i / n; prof.push(new THREE.Vector2(Math.max(rf(z), 0.01), z)); }
  const g = new THREE.LatheGeometry(prof, seg); g.rotateX(Math.PI / 2); g.scale(sx, sy, 1);
  if (liftCauda) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.max(0, p.getZ(i) - zCauda) * liftCauda); }
  g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}
// pintura do corpo: desenho em canvas onde y do canvas = posição z (u = volta)
function texCorpo(z0, z1, base, desenha) {
  const W = 1024, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const Y = (z) => (1 - (z - z0) / (z1 - z0)) * H;
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  desenha(g, Y, W, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function linhasPainel(g, Y, W, zs, alfa = 0.25) {
  g.strokeStyle = `rgba(0,0,0,${alfa})`; g.lineWidth = 2;
  for (const z of zs) { g.beginPath(); g.moveTo(0, Y(z)); g.lineTo(W, Y(z)); g.stroke(); }
  g.fillStyle = `rgba(0,0,0,${alfa * 0.8})`;
  for (const z of zs) for (let u = 0; u < 1; u += 0.014) g.fillRect(u * W, Y(z) - 6, 2, 2);
}
function textoLado(g, W, Y, z, txt, cor, tam = 48, uOff = 0.07) {
  g.font = `bold ${tam}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = cor;
  for (const [u, ang] of [[0.25, Math.PI / 2], [0.75, -Math.PI / 2]]) { g.save(); g.translate(W * (u + (u < 0.5 ? uOff : -uOff)), Y(z)); g.rotate(ang); g.fillText(txt, 0, 0); g.restore(); }
}
function luzes(A, parts, xD, yD, zD, beaconPos, caudaPos, tam = 1) {
  for (const lado of [1, -1]) {
    const nav = brilho(lado > 0 ? '#2bff6a' : '#ff2d2d', 0.9 * tam); nav.position.set(lado * xD, yD, zD); A.add(nav);
    const est = brilho('#ffffff', 2.2 * tam); est.position.set(lado * xD, yD, zD + 0.4 * tam); A.add(est);
    parts[lado > 0 ? 'navD' : 'navE'] = nav; parts[lado > 0 ? 'estD' : 'estE'] = est;
    parts[lado > 0 ? 'pontaD' : 'pontaE'] = new THREE.Vector3(lado * xD, yD, zD + 0.4);
  }
  const bea = brilho('#ff3030', 1.6 * tam); bea.position.copy(beaconPos); A.add(bea); parts.beacon = bea;
  const cauda = brilho('#ffffff', 0.8 * tam); cauda.position.copy(caudaPos); A.add(cauda); parts.luzCauda = cauda;
}
function painelVivo(A, parts, pos, rotX, w = 1.0) {
  const pc = document.createElement('canvas'); pc.width = 512; pc.height = 192;
  const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), new THREE.MeshBasicMaterial({ map: pt })); p.position.copy(pos); p.rotation.x = rotX; A.add(p);
  parts.painel = { canvas: pc, tex: pt };
}
function helice(raio, nPas, corPa, corPonta, corCubo, cuboR, cuboL) {
  const h = new THREE.Group();
  const spP = []; for (let i = 0; i <= 10; i++) { const t = i / 10; spP.push(new THREE.Vector2(cuboR * Math.sqrt(1 - t * t) + 0.001, -t * cuboL)); }
  const gS = new THREE.LatheGeometry(spP, 20); gS.rotateX(-Math.PI / 2); h.add(new THREE.Mesh(gS, mat(corCubo, 0.2, 0.6)));
  const lam = new THREE.Shape(); const L = raio, w = raio * 0.11;
  lam.moveTo(-w * 0.6, 0); lam.quadraticCurveTo(-w * 1.2, L * 0.5, -w * 0.7, L * 0.95); lam.quadraticCurveTo(0, L * 1.04, w * 0.7, L * 0.95); lam.quadraticCurveTo(w * 1.1, L * 0.45, w * 0.6, 0); lam.closePath();
  const gL = new THREE.ExtrudeGeometry(lam, { depth: raio * 0.03, bevelEnabled: false });
  const pas = new THREE.Group(); h.add(pas); const mP = mat(corPa, 0.5, 0.2), mT = mat(corPonta, 0.4);
  for (let k = 0; k < nPas; k++) {
    const b = new THREE.Group(); b.rotation.z = k * Math.PI * 2 / nPas;
    const m = new THREE.Mesh(gL, mP); m.rotation.y = 0.35; m.position.z = cuboL * 0.2; b.add(m);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(w * 1.3, L * 0.08, raio * 0.05), mT); tip.position.set(0, L * 0.94, cuboL * 0.2); tip.rotation.y = 0.35; b.add(tip);
    pas.add(sombra(b));
  }
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64); gr.addColorStop(0, 'rgba(40,40,40,0)'); gr.addColorStop(0.3, 'rgba(40,40,40,0.22)'); gr.addColorStop(0.88, 'rgba(30,30,30,0.28)'); gr.addColorStop(0.92, corPonta); gr.addColorStop(0.98, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const disco = new THREE.Mesh(new THREE.CircleGeometry(raio * 1.02, 40), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 }));
  disco.position.z = cuboL * 0.25; h.add(disco);
  return { h, pas, disco, raio };
}

// ================== CAÇA A JATO (estilo F-16) ==================
export const PINT_JATO = [
  { nome: 'Cinza tático', base: '#9aa1a8', esc: '#6f777f', faixa: '#2a2f35', num: '#3c4249' },
  { nome: 'Agressor', base: '#c9b48a', esc: '#7d6a48', faixa: '#3d3426', num: '#2b241a' },
  { nome: 'Esquadrilha', base: '#1d4fa3', esc: '#e8eef6', faixa: '#ffd23c', num: '#ffffff' },
];
export function criarJato(p = PINT_JATO[0]) {
  const A = new THREE.Group(), parts = { trem: [], rodas: [] };
  const mB = mat(p.base, 0.55, 0.25), mE = mat(p.esc, 0.55, 0.25), mRad = mat('#5c6168', 0.6, 0.1), mMet = mat('#aeb3b8', 0.25, 0.9), mEsc = mat('#26282b', 0.6, 0.3), mPneu = mat('#141414', 0.9, 0), mBoc = mat('#4a4744', 0.45, 0.85);
  const Z0 = -7.6, Z1 = 6.6;
  const rf = (z) => { if (z < -4.7) { const t = (z - Z0) / 2.9; return 0.86 * Math.pow(Math.max(t, 0), 0.62); } if (z < 4.4) return 0.86 + 0.08 * Math.sin((z + 4.7) / 9.1 * Math.PI); return 0.86 - (z - 4.4) / 2.2 * 0.26; };
  const tex = texCorpo(Z0, Z1, p.base, (g, Y, W, H) => {
    g.fillStyle = '#5c6168'; g.fillRect(0, Y(-5.9), W, H - Y(-5.9));                         // radome
    g.fillStyle = p.esc; for (const [a, b] of [[0.35, 0.65]]) g.fillRect(W * a, Y(4.5), W * (b - a), Y(-5.5) - Y(4.5)); // dorso escuro
    g.beginPath(); g.fillStyle = p.esc; g.ellipse(W * 0.3, Y(0), 60, 220, 0.2, 0, 7); g.ellipse(W * 0.7, Y(1.5), 70, 260, -0.2, 0, 7); g.fill(); // camuflagem
    linhasPainel(g, Y, W, [-5.9, -3.9, -1.5, 0.8, 2.6, 4.4], 0.22);
    g.strokeStyle = 'rgba(0,0,0,.25)'; for (const u of [0.18, 0.82]) { g.beginPath(); g.moveTo(W * u, Y(-3.9)); g.lineTo(W * u, Y(4.4)); g.stroke(); }
    textoLado(g, W, Y, 2.4, 'FAB 4401', p.num, 38, 0.02);
    g.fillStyle = '#ffd23c'; g.fillRect(W * 0.48, Y(-3.0), W * 0.04, 10); // porta de reabastecimento
    g.fillStyle = 'rgba(200,30,30,.8)'; g.font = 'bold 22px sans-serif'; g.save(); g.translate(W * 0.31, Y(-4.6)); g.rotate(Math.PI / 2); g.fillText('▲ RESCUE', 0, 0); g.restore();
  });
  const corpo = corpoTorno(rf, Z0, Z1, 48, 36, 1.0, 0.92, mat('#fff', 0.5, 0.25, { map: tex }));
  A.add(corpo);
  // dorso (lombada atrás da cabine)
  // lombada (espinha) atrás da cabine: seção oval que sobe da cabine e afina até a deriva, como no F-16
  { const N = 14, prof = []; for (let i = 0; i <= N; i++) { const t = i / N, z = -3.0 + t * 7.4; prof.push([z, 0.5 * Math.sin(Math.min(1, t * 2.2) * Math.PI / 2) * (1 - t * 0.55), 0.45 + 0.2 * Math.sin(t * Math.PI) - t * 0.25]); }
    const pos = [], idx = [], SEG = 14;
    prof.forEach(([z, w, h], i) => { for (let j = 0; j <= SEG; j++) { const a = Math.PI * j / SEG; pos.push(Math.cos(a) * w, 0.45 + Math.sin(a) * h, z); } });
    for (let i = 0; i < N; i++) for (let j = 0; j < SEG; j++) { const a = i * (SEG + 1) + j, b = a + 1, c = a + SEG + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    A.add(new THREE.Mesh(g, mE)); }
  // aerofreios dos dois lados do bocal, antena de cima, sensor sob a entrada de ar e luzes de reabastecimento
  for (const s2 of [-1, 1]) { const af = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 1.1), mB); af.position.set(s2 * 0.78, 0, Z1 - 0.3); af.rotation.y = s2 * 0.08; A.add(af); }
  const antD = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.35), mEsc); antD.position.set(0, 1.08, -1.6); antD.rotation.x = 0.3; A.add(antD);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 12), mat('#7b8188', 0.5, 0.4)); pod.rotation.x = Math.PI / 2; pod.position.set(0.55, -1.15, -2.6); A.add(pod);
  const lente = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#20262c', 0.05, 0.9)); lente.rotation.x = -Math.PI / 2; lente.position.set(0.55, -1.15, -3.4); A.add(lente);
  // entrada de ar sob a cabine (boca escura)
  const entrada = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.55, 5.4, 24, 1, true), mB); entrada.rotation.x = Math.PI / 2; entrada.scale.set(1.05, 1, 0.72); entrada.position.set(0, -0.82, -1.1); A.add(entrada);
  const boca = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), mat('#0b0b0c', 0.9)); boca.scale.set(1.05, 0.72, 1); boca.position.set(0, -0.82, -3.78); boca.rotation.y = Math.PI; A.add(boca);
  const lábio = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 6, 28), mMet); lábio.scale.set(1.05, 0.72, 1); lábio.position.set(0, -0.82, -3.8); A.add(lábio);
  // tubo de pitot e antenas
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 1.0, 6), mMet); pit.rotation.x = Math.PI / 2; pit.position.set(0, 0, Z0 - 0.4); A.add(pit);
  for (const z of [-2.0, 1.5]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.25), mEsc); a.position.set(0, -1.32, z); a.rotation.x = 0.4; A.add(a); }
  // canopi dourado sem moldura e cadeira ejetável
  const vid = new THREE.MeshStandardMaterial({ color: 0xd7b46a, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.38, envMapIntensity: 2, depthWrite: false });
  const bolha = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), vid); bolha.scale.set(0.5, 0.62, 2.05); bolha.position.set(0, 0.5, -4.05); bolha.renderOrder = 2; A.add(bolha); parts.bolha = bolha;
  const arco = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 6, 20, Math.PI), mEsc); arco.scale.set(0.47, 0.6, 1); arco.position.set(0, 0.5, -3.1); A.add(arco);
  const cad = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.25), mEsc); cad.position.set(0, 0.62, -3.35); cad.rotation.x = -0.5; A.add(cad);
  const alca = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 4, 10), mat('#ffcc00', 0.5)); alca.position.set(0, 1.0, -3.35); A.add(alca);
  const pil = criarPiloto('jato'); pil.position.set(0, 0.35, -3.95); pil.rotation.x = -0.35; A.add(pil); parts.piloto = pil;
  painelVivo(A, parts, new THREE.Vector3(0, 0.72, -5.0), -0.35, 0.8);
  // HUD (vidro verde na frente)
  const hud = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.24), new THREE.MeshBasicMaterial({ color: 0x55ff99, transparent: true, opacity: 0.12, depthWrite: false })); hud.position.set(0, 1.0, -5.2); hud.rotation.x = -0.2; A.add(hud);
  // asas em delta cortado (bordo de fuga reto)
  const asa = (s) => { const t = (s - 0.8) / (4.6 - 0.8); const le = -0.9 + t * 3.5, te = 3.9 - t * 0.1; return { s, le, c: te - le, y: -0.1 }; };
  const H = 0.76;
  for (const lado of [1, -1]) {
    const map = lado > 0 ? mapD : mapE, fx = (g) => (lado > 0 ? g : flipGeo(g)), stA = est(asa);
    A.add(sombra(new THREE.Mesh(fx(loft(stA(0.75, 4.6, 5), perfil(0, H, 14, 0.045), map)), mB)));
    A.add(sombra(new THREE.Mesh(fx(loft(stA(0.75, 1.05, 1), perfil(H, 1, 5, 0.045), map)), mB)));
    const hinge = (s) => { const a = asa(s); return new THREE.Vector3(lado * s, a.y, a.le + H * a.c); };
    const flaperon = articulada(fx(loft(stA(1.05, 3.4, 2), perfil(H, 1, 5, 0.045), map)), mE, hinge(1.05), hinge(3.4)); A.add(flaperon);
    A.add(sombra(new THREE.Mesh(fx(loft(stA(3.4, 4.6, 1), perfil(H, 1, 5, 0.045), map)), mB)));
    parts[lado > 0 ? 'ailD' : 'ailE'] = flaperon; parts[lado > 0 ? 'flapD' : 'flapE'] = null;
    // extensão do bordo de ataque (LERX)
    const lerx = [{ s: 0.55, le: -4.2, c: 3.6, y: 0.0 }, { s: 1.1, le: -1.0, c: 0.6, y: -0.08 }];
    A.add(sombra(new THREE.Mesh(fx(loft(lerx, perfil(0, 1, 8, 0.03), map)), mB)));
    // trilho e míssil na ponta, tanque e míssil sob a asa
    const missil = (x, y, z, L) => { const g = new THREE.Group(); g.position.set(x, y, z);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, L, 10), mat('#e6e6e2', 0.4)); c.rotation.x = Math.PI / 2; g.add(c);
      const n = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.35, 10), mat('#3a3d40', 0.3, 0.5)); n.rotation.x = -Math.PI / 2; n.position.z = -L / 2 - 0.17; g.add(n);
      for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.32, 0.3), mat('#cfcfca', 0.5)); f.rotation.z = k * Math.PI / 2 + Math.PI / 4; f.position.z = L / 2 - 0.2; g.add(f);
        const cn = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.2, 0.12), mat('#cfcfca', 0.5)); cn.rotation.z = k * Math.PI / 2 + Math.PI / 4; cn.position.z = -L / 2 + 0.25; g.add(cn); }
      const faixa = new THREE.Mesh(new THREE.CylinderGeometry(0.067, 0.067, 0.08, 10), mat('#d4b02a', 0.5)); faixa.rotation.x = Math.PI / 2; faixa.position.z = -L / 2 + 0.6; g.add(faixa);
      A.add(sombra(g)); return g; };
    const tp = asa(4.6);
    const trilho = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, tp.c + 0.6), mB); trilho.position.set(lado * 4.66, tp.y, tp.le + tp.c / 2); A.add(trilho);
    missil(lado * 4.66, tp.y - 0.02, tp.le + tp.c / 2 - 0.2, 2.9);
    const tq = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), mB); tq.scale.set(0.38, 0.38, 2.3); tq.position.set(lado * 2.3, -0.85, 1.4); A.add(tq);
    const pil1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 1.2), mB); pil1.position.set(lado * 2.3, -0.38, 1.6); A.add(pil1);
    const pil2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.9), mB); pil2.position.set(lado * 3.6, -0.27, 2.6); A.add(pil2);
    missil(lado * 3.6, -0.5, 2.3, 2.9);
    // profundores inteiriços (giram inteiros)
    const pr = (s) => { const t = (s - 0.6) / 2.6; return { s, le: 4.7 + t * 1.6, c: 2.3 - t * 1.4, y: -0.12 - t * 0.25 }; };
    const gP = fx(loft(est(pr)(0.6, 3.2, 3), perfil(0, 1, 10, 0.05), map));
    const a0 = pr(0.6), a1 = pr(3.2);
    const prof = articulada(gP, mB, new THREE.Vector3(lado * 0.6, a0.y, a0.le + 0.45 * a0.c), new THREE.Vector3(lado * 3.2, a1.y, a1.le + 0.45 * a1.c)); A.add(prof);
    parts[lado > 0 ? 'profD' : 'profE'] = prof;
    // quilhas ventrais
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 1.2), mB); v.position.set(lado * 0.55, -0.95, 4.6); v.rotation.z = lado * 0.5; v.rotation.x = -0.3; A.add(v);
    // luzes de formação (faixas verdes)
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.6), new THREE.MeshBasicMaterial({ color: 0x6dffb0 })); fl.position.set(lado * 0.87, 0.15, -2.6); A.add(fl);
  }
  // deriva alta com leme
  const der = (s) => { const t = (s - 0.8) / 3.2; return { s, le: 3.0 + t * 3.0, c: 3.7 - t * 2.4, y: 0 }; };
  A.add(sombra(new THREE.Mesh(flipGeo(loft(est(der)(0.7, 4.0), perfil(0, 0.72, 10, 0.05), mapV)), mB)));
  const hd = (s) => { const a = der(s); return new THREE.Vector3(0, s, a.le + 0.72 * a.c); };
  const gLeme = flipGeo(loft(est(der)(1.0, 3.7, 2), perfil(0.72, 1, 5, 0.05), mapV));
  const leme = articulada(gLeme, mE, hd(1.0), hd(3.7)); A.add(leme); parts.leme = leme;
  const pontaDer = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 1.1), mEsc); pontaDer.position.set(0, 4.05, 6.4); A.add(pontaDer);
  // bocal de escape com pétalas + chama do pós-combustor
  const bocal = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.52, 1.2, 28, 1, true), mBoc); bocal.rotation.x = Math.PI / 2; bocal.position.set(0, 0, Z1 + 0.5); A.add(bocal);
  for (let k = 0; k < 14; k++) { const pe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 1.15), mMet); const a = k / 14 * Math.PI * 2; pe.position.set(Math.cos(a) * 0.57, Math.sin(a) * 0.57, Z1 + 0.5); pe.rotation.z = a + Math.PI / 2; pe.rotation.x = 0; A.add(pe); }
  const brasa = mat('#301510', 0.7, 0.2, { emissive: 0xff6a20, emissiveIntensity: 0.3 }); parts.brasa = brasa;
  const fundo = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), brasa); fundo.position.set(0, 0, Z1 + 0.1); A.add(fundo);
  const chama = new THREE.Group(); chama.position.set(0, 0, Z1 + 1.1); A.add(chama); parts.chama = chama;
  const cg = (r, l, cor, op) => { const g = new THREE.ConeGeometry(r, l, 20, 1, true); g.translate(0, -l / 2, 0); g.rotateX(-Math.PI / 2); return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); };
  chama.add(cg(0.5, 5, 0xff7a2a, 0.45), cg(0.36, 3.2, 0x8ab8ff, 0.6), cg(0.2, 1.8, 0xffffff, 0.7));
  for (let k = 0; k < 4; k++) { const d = brilho('#ffd7a0', 0.7 - k * 0.1); d.position.z = 0.9 + k * 0.9; chama.add(d); } // diamantes de choque
  // trem: bequilha sob a entrada de ar, principais recolhem para a fuselagem
  const m = { mMetal: mMet, mEscuro: mEsc, mPneu, tampa: mB };
  pernaTrem(A, parts, m, 0, -1.3, -3.2, 0.8, 0.3, 'x', 1);
  pernaTrem(A, parts, m, 1.15, -0.85, 1.0, 1.2, 0.38, 'z', 1);
  pernaTrem(A, parts, m, -1.15, -0.85, 1.0, 1.2, 0.38, 'z', -1);
  parts.alturaTrem = 2.42;
  luzes(A, parts, 4.66, 0.08, asa(4.6).le - 0.2, new THREE.Vector3(0, 4.2, 6.0), new THREE.Vector3(0, 3.3, 7.0));
  const lampF = brilho('#fff6dd', 1.2); lampF.position.set(0, -1.6, -3.0); A.add(lampF); parts.lampFarol = lampF;
  parts.cauda = new THREE.Vector3(0, 0, Z1 + 1.2); parts.entrada = new THREE.Vector3(0, 1.1, -3.9); parts.envergadura = 9.5; parts.raioCorpo = 0.95; parts.saida = new THREE.Vector3(1.6, 0, -5.4);
  parts.superficies = (x, z) => {
    const ax = Math.abs(x), r = [];
    if (ax < 0.55 && z > -6 && z < 5.5) r.push(z > -3 && z < 4.6 ? 1.0 : rf(z) * 0.92);
    if (ax > 0.7 && ax < 4.6) { const a = asa(ax); if (z > a.le && z < a.le + a.c) r.push(a.y + 0.05); }
    if (ax < 0.16 && z > 3.1 && z < 6.8) r.push(4.0); // deriva
    return r;
  };
  parts.helices = [];
  mesclar(A);
  A.userData.parts = parts; return A;
}

// ================== CAÇA DE HÉLICE DA 2ª GUERRA (estilo P-51) ==================
export const PINT_WAR = [
  { nome: 'Verde-oliva', base: '#58613f', baixo: '#a9ada3', nariz: '#f2c230', faixas: true },
  { nome: 'Alumínio', base: '#c7cbcf', baixo: '#c7cbcf', nariz: '#c8282e', faixas: false, metal: true },
  { nome: 'Azul-marinho', base: '#2c3d55', baixo: '#2c3d55', nariz: '#ffffff', faixas: false },
];
export function criarWarbird(p = PINT_WAR[0]) {
  const A = new THREE.Group(), parts = { trem: [], rodas: [] };
  const met = p.metal ? 0.85 : 0.15, rug = p.metal ? 0.3 : 0.6;
  const mB = mat(p.base, rug, met), mBx = mat(p.baixo, rug, met), mN = mat(p.nariz, 0.4, 0.2), mEsc = mat('#262626', 0.6, 0.3), mMet = mat('#b8bcc2', 0.25, 0.9), mPneu = mat('#151515', 0.9, 0);
  const mBr = mat('#ffffff', 0.5), mPr = mat('#111111', 0.5);
  const Z0 = -4.55, Z1 = 4.9;
  const rf = (z) => { const t = (z - Z0) / (Z1 - Z0); if (t < 0.07) return 0.5 + t / 0.07 * 0.1; if (t < 0.45) return 0.6 + Math.sin((t - 0.07) / 0.38 * Math.PI / 2) * 0.07; return 0.67 * Math.pow((1 - t) / 0.55, 0.9) + 0.06; };
  const tex = texCorpo(Z0, Z1, p.base, (g, Y, W, H) => {
    g.fillStyle = p.baixo; g.fillRect(0, 0, W * 0.2, H); g.fillRect(W * 0.8, 0, W * 0.2, H);
    g.fillStyle = p.nariz; g.fillRect(0, Y(-3.9), W, H - Y(-3.9));
    if (!p.metal) { g.fillStyle = '#1a1a1a'; g.fillRect(W * 0.38, Y(-0.9), W * 0.24, Y(-3.6) - Y(-0.9)); } // anti-reflexo
    if (p.faixas) { for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#111' : '#f4f4f0'; g.fillRect(0, Y(3.0 + i * 0.22), W, Y(2.78) - Y(3.0)); } }
    linhasPainel(g, Y, W, [-3.9, -2.6, -1.0, 1.4, 2.6, 3.9], 0.25);
    // estrela nas laterais e código
    for (const u of [0.25, 0.75]) { g.save(); g.translate(W * (u + (u < 0.5 ? 0.05 : -0.05)), Y(1.9)); g.fillStyle = '#1e3a7a'; g.beginPath(); g.arc(0, 0, 40, 0, 7); g.fill(); g.fillStyle = '#fff';
      g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 14 : 34, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.sin(a + (u < 0.5 ? Math.PI / 2 : -Math.PI / 2)) * r, Math.cos(a + (u < 0.5 ? Math.PI / 2 : -Math.PI / 2)) * r); } g.fill(); g.restore(); }
    textoLado(g, W, Y, 0.3, '44-14', '#f2f2f2', 40, 0.05);
    // manchas de óleo saindo dos escapamentos
    for (const u of [0.25, 0.75]) { const gr = g.createLinearGradient(0, Y(-2.6), 0, Y(0)); gr.addColorStop(0, 'rgba(20,18,15,.5)'); gr.addColorStop(1, 'rgba(20,18,15,0)'); g.fillStyle = gr; g.fillRect(W * (u - 0.06), Y(0), W * 0.12, Y(-2.6) - Y(0)); }
  });
  const corpo = corpoTorno(rf, Z0, Z1, 44, 36, 0.86, 1.18, mat('#fff', rug, met, { map: tex }), 0.05, 0.8); A.add(corpo);
  // hélice de 4 pás grande
  const hel = helice(1.7, 4, '#1c1c1c', '#f2c230', p.nariz, 0.3, 0.75); hel.h.position.set(0, 0.0, Z0 - 0.02); A.add(hel.h);
  parts.helices = [hel];
  // escapamentos (6 de cada lado)
  const brasa = mat('#301510', 0.7, 0.2, { emissive: 0xff5a1a, emissiveIntensity: 0.3 }); parts.brasa = brasa;
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.16), mEsc); e.position.set(s * 0.53, 0.18, -3.55 + i * 0.2); A.add(e);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.06), brasa); f.position.set(s * 0.585, 0.18, -3.55 + i * 0.2); f.rotation.y = s * Math.PI / 2; A.add(f);
  }
  // radiador na barriga
  // tomada de ar do radiador (barriga): boca reta afastada do corpo e carenagem que afina até a cauda, como no P-51D
  const sc = corpoTorno((z) => { const t = (z - 0.2) / 3.1; return 0.4 * (t < 0.06 ? 0.86 + t / 0.06 * 0.14 : Math.pow(1 - (t - 0.06) / 0.94, 0.75)); }, 0.2, 3.3, 18, 20, 0.95, 0.9, mBx);
  sc.position.y = -0.74; A.add(sc);
  const radB = new THREE.Mesh(new THREE.CircleGeometry(0.33, 20, 0, Math.PI), mat('#0d0d0d', 0.9)); radB.rotation.set(0, Math.PI, Math.PI); radB.scale.set(1, 0.95, 1); radB.position.set(0, -0.74, 0.19); A.add(radB); // boca (metade de baixo)
  const labio = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 20, Math.PI), mBx); labio.rotation.z = Math.PI; labio.scale.set(1, 0.92, 1); labio.position.set(0, -0.74, 0.2); A.add(labio);
  const saida = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.35), mEsc); saida.position.set(0, -1.02, 2.0); saida.rotation.x = 0.25; A.add(saida); // aba de saída de ar
  // entrada do carburador sob o nariz
  const carb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.6), mEsc); carb.position.set(0, -0.68, -3.6); A.add(carb);
  // canopi bolha com moldura e antena
  const vid = new THREE.MeshStandardMaterial({ color: 0xa8c8dc, roughness: 0.03, metalness: 0.7, transparent: true, opacity: 0.3, envMapIntensity: 2, depthWrite: false });
  const bolha = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), vid); bolha.scale.set(0.46, 0.5, 1.25); bolha.position.set(0, 0.64, 0.15); bolha.renderOrder = 2; A.add(bolha); parts.bolha = bolha;
  const para = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.04), new THREE.MeshStandardMaterial({ color: 0xa8c8dc, transparent: true, opacity: 0.35, metalness: 0.7, roughness: 0.05, depthWrite: false })); para.position.set(0, 0.85, -1.05); para.rotation.x = -0.6; A.add(para);
  for (const z of [-1.1, -0.2]) { const t = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 20, Math.PI), mEsc); const k = Math.sqrt(Math.max(0, 1 - ((z - 0.15) / 1.25) ** 2)); t.scale.set(0.46 * k + 0.02, 0.5 * k + 0.02, 1); t.position.set(0, 0.64, z); A.add(t); }
  const pil = criarPiloto('classico'); pil.position.set(0, 0.68, 0.25); A.add(pil); parts.piloto = pil; parts.cachecol = pil.userData.cachecol;
  painelVivo(A, parts, new THREE.Vector3(0, 0.95, -0.75), -0.2, 0.75);
  const ant = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.55, 0.18), mEsc); ant.position.set(0, 1.05, 1.9); ant.rotation.x = 0.35; A.add(ant);
  // asas de perfil laminar com faixas de invasão e metralhadoras
  const asa = (s) => { const t = (s - 0.35) / (5.65 - 0.35); return { s, le: -1.45 + t * 0.85, c: 2.65 - t * 1.6, y: -0.48 + t * 0.42 }; };
  const H = 0.75;
  for (const lado of [1, -1]) {
    const map = lado > 0 ? mapD : mapE, fx = (g) => (lado > 0 ? g : flipGeo(g)), stA = est(asa);
    const cortes = p.faixas ? [0.3, 1.9, 2.12, 2.34, 2.56, 2.78, 3.0, 5.5] : [0.3, 5.5];
    for (let i = 0; i < cortes.length - 1; i++) { const m = p.faixas && i > 0 && i < cortes.length - 2 ? (i % 2 ? mBr : mPr) : mB;
      A.add(sombra(new THREE.Mesh(fx(loft(stA(cortes[i], cortes[i + 1], 2), perfil(0, H, 12, 0.14), map)), m))); }
    const tipS = [asa(5.5), { ...asa(5.75), c: asa(5.75).c * 0.7, le: asa(5.75).le + 0.15 }];
    A.add(sombra(new THREE.Mesh(fx(loft(tipS, perfil(0, 1, 12, 0.12), map)), mB)));
    const hinge = (s) => { const a = asa(s); return new THREE.Vector3(lado * s, a.y + 0.02 * a.c, a.le + H * a.c); };
    const flap = articulada(fx(loft(stA(0.3, 3.2, 2), perfil(H, 1, 5, 0.14), map)), mB, hinge(0.3), hinge(3.2));
    const ail = articulada(fx(loft(stA(3.2, 5.5, 2), perfil(H, 1, 5, 0.14), map)), mB, hinge(3.2), hinge(5.5));
    A.add(flap, ail); parts[lado > 0 ? 'flapD' : 'flapE'] = flap; parts[lado > 0 ? 'ailD' : 'ailE'] = ail;
    for (let k = 0; k < 3; k++) { const a = asa(2.3 + k * 0.28), g = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8), mEsc); g.rotation.x = Math.PI / 2; g.position.set(lado * (2.3 + k * 0.28), a.y + 0.03, a.le - 0.12); A.add(g); }
    // estrela na asa
    const ins = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), mat('#1e3a7a', 0.6, 0, { polygonOffset: true, polygonOffsetFactor: -2 })); const ai = asa(4.4); ins.rotation.x = -Math.PI / 2; ins.position.set(lado * 4.4, ai.y + ai.c * 0.11, ai.le + ai.c * 0.4); A.add(ins);
    // estabilizador e profundor
    const pr = (s) => { const t = s / 2.35; return { s, le: 3.4 + t * 0.45, c: 1.35 - t * 0.65, y: 0.25 }; };
    A.add(sombra(new THREE.Mesh(fx(loft(est(pr)(0.15, 2.35), perfil(0, 0.62, 10, 0.1), map)), mB)));
    const hg = (s) => { const a = pr(s); return new THREE.Vector3(lado * s, a.y, a.le + 0.62 * a.c); };
    const prof = articulada(fx(loft(est(pr)(0.2, 2.35, 2), perfil(0.62, 1, 5, 0.1), map)), mB, hg(0.2), hg(2.35)); A.add(prof);
    parts[lado > 0 ? 'profD' : 'profE'] = prof;
  }
  const der = (s) => { const t = (s - 0.3) / 1.6; return { s, le: 3.0 + t * 0.9, c: 1.75 - t * 0.9, y: 0 }; };
  { const f = new THREE.Shape(); f.moveTo(1.7, 0); f.lineTo(3.05, 0.55); f.lineTo(3.05, 0); f.closePath(); // barbatana dorsal na frente da deriva (P-51D)
    const g = new THREE.ExtrudeGeometry(f, { depth: 0.07, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(0.035, 0, 0);
    const fil = new THREE.Mesh(g, mB); fil.position.y = rf(2.4) * 1.18 + (2.4 - 0.8) * 0.05 - 0.04; A.add(fil); }
  A.add(sombra(new THREE.Mesh(flipGeo(loft(est(der)(0.3, 1.95), perfil(0, 0.6, 10, 0.1), (s, z, y) => [y, s + 0.25, z])), mB)));
  const hd = (s) => { const a = der(s); return new THREE.Vector3(0, s + 0.25, a.le + 0.6 * a.c); };
  const gLeme = flipGeo(loft(est(der)(0.35, 1.95, 2), perfil(0.6, 1, 5, 0.1), (s, z, y) => [y, s + 0.25, z])); uvPorAltura(gLeme, 0.6, 2.2);
  const leme = articulada(gLeme, p.metal ? mN : mB, hd(0.35), hd(1.95)); A.add(leme); parts.leme = leme;
  // trem convencional: principais nas asas, bequilha na cauda
  const m = { mMetal: mMet, mEscuro: mEsc, mPneu, tampa: mB };
  pernaTrem(A, parts, m, 1.75, -0.45, -1.05, 1.55, 0.38, 'z', 1);
  pernaTrem(A, parts, m, -1.75, -0.45, -1.05, 1.55, 0.38, 'z', -1);
  pernaTrem(A, parts, { mMetal: mMet, mEscuro: mEsc, mPneu }, 0, -0.25, 4.3, 0.55, 0.16, 'x', 1);
  parts.alturaTrem = 2.3; parts.atitude = 0.17; // nariz pra cima no chão
  luzes(A, parts, 5.72, -0.06, asa(5.6).le + 0.3, new THREE.Vector3(0, 0.75, 2.4), new THREE.Vector3(0, 1.6, 4.8));
  const lampF = brilho('#fff6dd', 1.2); lampF.position.set(-2.4, -0.4, -1.4); A.add(lampF); parts.lampFarol = lampF;
  parts.cauda = new THREE.Vector3(0, 0.4, Z1 + 0.3); parts.entrada = new THREE.Vector3(0, 1.15, 0.2); parts.envergadura = 11.3; parts.raioCorpo = 0.75; parts.saida = new THREE.Vector3(1.5, 0, -3.0);
  parts.superficies = (x, z) => {
    const ax = Math.abs(x), r = [];
    if (ax < 0.45 && z > Z0 + 0.3 && z < Z1 - 0.3) { let y = rf(z) * 1.18 + Math.max(0, z - 0.8) * 0.05; const k = (z - 0.15) / 1.25; if (Math.abs(k) < 1) y = Math.max(y, 0.64 + 0.5 * Math.sqrt(1 - k * k)); r.push(y); }
    if (ax > 0.4 && ax < 5.6) { const a = asa(ax); if (z > a.le && z < a.le + a.c) r.push(a.y + a.c * 0.11); }
    if (ax < 0.14 && z > 3.0 && z < 4.8) r.push(2.25); // deriva
    return r;
  };
  mesclar(A);
  A.userData.parts = parts; return A;
}

// ================== CARGUEIRO (estilo C-130), com rampa traseira ==================
export const PINT_CARGA = [
  { nome: 'Cinza', base: '#8f979e', esc: '#5d646b', faixa: '#2a3038' },
  { nome: 'Camuflado', base: '#6d7356', esc: '#4c4a36', faixa: '#25261c' },
  { nome: 'Resgate', base: '#eef0f2', esc: '#e05a1e', faixa: '#c8282e' },
];
export const BAIA = { meia: 1.55, piso: -1.25, teto: 1.45, frente: -9.0, fim: 4.6, rampaFim: 9.3, raio: 2.05 };
export function criarCargueiro(p = PINT_CARGA[0]) {
  const A = new THREE.Group(), parts = { trem: [], rodas: [] };
  const mB = mat(p.base, 0.6, 0.15), mE = mat(p.esc, 0.6, 0.15), mEsc = mat('#2b2d30', 0.7, 0.2), mMet = mat('#b0b4b8', 0.3, 0.85), mPneu = mat('#141414', 0.9, 0);
  const mInt = mat('#7d8a78', 0.85, 0.05, { side: THREE.BackSide }), mPiso = mat('#5b5e61', 0.8, 0.4);
  const Z0 = -15.2, Z1 = BAIA.fim, R = 2.2;
  const rf = (z) => { if (z < -11.2) { const t = (z - Z0) / 4; return R * Math.pow(Math.max(0, Math.sin(t * Math.PI / 2)), 0.55); } return R; };
  const tex = texCorpo(Z0, Z1, p.base, (g, Y, W, H) => {
    g.fillStyle = '#4c5156'; g.fillRect(0, Y(-14.0), W, H - Y(-14.0)); // radome
    g.fillStyle = '#0d1014'; // janelas da cabine (parte de cima do nariz)
    for (let i = -3; i <= 3; i++) { g.fillRect(W * (0.5 + i * 0.036) - 16, Y(-12.2), 32, 50); g.fillRect(W * (0.5 + i * 0.036) - 10, Y(-11.4), 20, 16); } // para-brisa e janelas de cima ("sobrancelhas")
    for (const u of [0.32, 0.68]) { g.fillRect(W * u - 24, Y(-12.6), 48, 46); g.fillRect(W * u - 16, Y(-11.9), 32, 30); } // janelas laterais da cabine
    g.fillStyle = '#e8eaec'; for (let i = -3; i <= 3; i++) g.fillRect(W * (0.5 + i * 0.036) - 17, Y(-12.2) - 3, 34, 3); // molduras
    g.fillStyle = '#0d1014';
    for (const u of [0.26, 0.74]) for (let z = -8; z < 3; z += 2.2) { g.beginPath(); g.arc(W * u, Y(z), 9, 0, 7); g.fill(); } // vigias
    g.fillStyle = p.faixa; g.fillRect(W * 0.245, Y(3.5), 14, Y(-10.5) - Y(3.5)); g.fillRect(W * 0.745, Y(3.5), 14, Y(-10.5) - Y(3.5));
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3; g.strokeRect(W * 0.2, Y(-8.6), 40, Y(-10.2) - Y(-8.6)); g.strokeRect(W * 0.76, Y(-8.6), 40, Y(-10.2) - Y(-8.6)); // portas de paraquedistas
    linhasPainel(g, Y, W, [-11.2, -8, -5, -2, 1, 3.5], 0.2);
    textoLado(g, W, Y, -3.5, 'FORÇA AÉREA', p.faixa, 46, 0.03); textoLado(g, W, Y, 1.8, '2451', p.faixa, 56, 0.03);
  });
  const corpo = corpoTorno(rf, Z0, Z1, 40, 40, 1, 1, mat('#fff', 0.6, 0.15, { map: tex })); A.add(corpo);
  { // perfil real do Hercules: teto da cabine reto até perto da ponta, embaixo o nariz sobe antes e a ponta (radome) fica baixa
    const pp = corpo.geometry.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const z = pp.getZ(i); if (z > -10.6) continue;
      let x = pp.getX(i), y = pp.getY(i); const r = Math.hypot(x, y), base = rf(z); if (r < 1e-4 || base < 1e-3) continue;
      const t = z - Z0, w = y / r, topo = R * Math.pow(Math.sin(Math.min(1, t / 2.7) * Math.PI / 2), 0.42), baixo = R * Math.pow(Math.sin(Math.min(1, t / 4.6) * Math.PI / 2), 0.75);
      const rr = w > 0 ? base + (topo - base) * w : base + (baixo - base) * -w, k = rr / base;
      pp.setXYZ(i, x * k, y * k - 0.42 * R * Math.pow(1 - Math.min(1, t / 4.6), 2), z);
    }
    corpo.geometry.computeVertexNormals(); } // só a face de fora: de dentro se vê o revestimento
  // cauda levantada: casca só por cima/lados, aberta embaixo (onde ficam rampa e porta)
  { const N = 10, seg = 28, abre = Math.PI / 3, pos = [], idx = [];
    for (let i = 0; i <= N; i++) { const t = i / N, z = BAIA.fim + t * 10.4, r = R * (1 - t * 0.78), yc = t * t * 0.6 + t * 1.0;
      for (let j = 0; j <= seg; j++) { const a = -Math.PI / 2 + abre + j / seg * (2 * Math.PI - 2 * abre); pos.push(Math.cos(a) * r, yc + Math.sin(a) * r, z); } }
    for (let i = 0; i < N; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const cs = new THREE.Mesh(g, mat(p.base, 0.6, 0.15, { side: THREE.FrontSide })); cs.castShadow = true; cs.userData.fixo = false; A.add(cs);
    const csInt = new THREE.Mesh(g, mat('#5a6553', 0.9, 0.05, { side: THREE.BackSide })); csInt.userData.fixo = false; A.add(csInt); // lado de dentro da cauda
    const ponta = new THREE.Mesh(new THREE.SphereGeometry(R * 0.22, 12, 8), mB); ponta.position.set(0, 1.6, BAIA.fim + 10.4); A.add(ponta); }
  // interior: revestimento acolchoado, costelas, piso com faixas, luzes no teto, caixas nas laterais e a portinha da cabine
  const B = BAIA, comp = B.fim - B.frente, meioZ = (B.fim + B.frente) / 2;
  { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#6b7663'; g.fillRect(0, 0, 256, 128);
    for (let x = 0; x < 256; x += 32) for (let y = 0; y < 128; y += 32) { g.fillStyle = (x + y) % 64 ? '#727d69' : '#66705e'; g.fillRect(x + 2, y + 2, 28, 28); } // painéis de isolamento
    g.fillStyle = 'rgba(0,0,0,.35)'; for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 2, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, comp / 1.2);
    const gl = new THREE.CylinderGeometry(R - 0.08, R - 0.08, comp, 36, 1, true); gl.rotateX(Math.PI / 2);
    const forro = new THREE.Mesh(gl, mat('#fff', 0.95, 0, { map: t, side: THREE.BackSide })); forro.position.z = meioZ; forro.userData.fixo = false; A.add(forro); }
  const mRib = mat('#59644f', 0.8, 0.1);
  for (let z = B.frente + 0.8; z < B.fim; z += 1.4) { const c = new THREE.Mesh(new THREE.TorusGeometry(R - 0.14, 0.07, 4, 24, Math.PI * 1.45), mRib); c.position.z = z; c.rotation.z = -Math.PI * 0.225; A.add(c); }
  // piso: chapa escura com faixas amarelas de segurança nas bordas e setas para a frente
  { const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#4c4f53'; g.fillRect(0, 0, 128, 256); g.fillStyle = 'rgba(255,255,255,.05)'; for (let y = 0; y < 256; y += 8) g.fillRect(0, y, 128, 1);
    g.fillStyle = '#e8c21e'; g.fillRect(0, 0, 9, 256); g.fillRect(119, 0, 9, 256);
    g.fillStyle = 'rgba(232,194,30,.55)'; g.beginPath(); g.moveTo(64, 70); g.lineTo(94, 110); g.lineTo(80, 110); g.lineTo(64, 89); g.lineTo(48, 110); g.lineTo(34, 110); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, comp / 3); t.anisotropy = 4;
    const piso = new THREE.Mesh(new THREE.BoxGeometry(B.meia * 2, 0.12, comp), [mPiso, mPiso, mat('#fff', 0.8, 0.3, { map: t }), mPiso, mPiso, mPiso]); piso.position.set(0, B.piso - 0.06, meioZ); A.add(piso); }
  for (const x of [-0.9, 0.9]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, comp), mMet); tr.position.set(x, B.piso + 0.02, meioZ); A.add(tr); }
  for (const s2 of [-1, 1]) { // rodapé: tampa o vão entre o piso e a parede curva
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, comp), mat('#4f584a', 0.9)); r.position.set(s2 * (B.meia + 0.15), B.piso + 0.1, meioZ); // baixo: a asa do avião guardado passa por cima A.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, comp * 0.3), mat('#7a2b2b', 0.9)); b.position.set(s2 * (B.meia - 0.1), B.piso + 0.5, B.frente + comp * 0.2); // bancos lá na frente, longe da vaga do avião A.add(b); // banco de lona
    for (const [z, w, h] of [[B.frente + 1.4, 0.7, 0.8], [B.frente + 2.4, 0.6, 0.6]]) { // caixas presas na lateral, fora do caminho
      const cx = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.9), mat('#8a6a3e', 0.9)); cx.position.set(s2 * (B.meia - w / 2 - 0.05), B.piso + h / 2, z); A.add(cx);
      const ci = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.06, 0.93), mat('#c49a1a', 0.8)); ci.position.copy(cx.position); A.add(ci); }
  }
  // luzes no teto (faixas que brilham) ao longo do baú
  const mLuz = new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
  for (let z = B.frente + 1.2; z < B.fim - 0.5; z += 2.2) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.9), mLuz); l.position.set(0, R - 0.2, z); A.add(l); }
  // parede da frente com a portinha da cabine
  const mParede = mat('#59644f', 0.85, 0.1);
  const parede = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 32), mParede); parede.position.z = B.frente; A.add(parede);
  const moldura = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.95, 0.06), mat('#e8c21e', 0.6)); moldura.position.set(0, B.piso + 0.97, B.frente + 0.02); A.add(moldura);
  const vao = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.85), new THREE.MeshBasicMaterial({ color: 0x0e1012 })); vao.position.set(0, B.piso + 0.93, B.frente + 0.055); A.add(vao);
  const portinha = new THREE.Group(); portinha.position.set(0.4, B.piso + 0.93, B.frente + 0.07); A.add(portinha); // gira na dobradiça da direita
  { const pf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.83, 0.05).translate(-0.4, 0, 0), mat('#7c8873', 0.6, 0.3)); portinha.add(pf);
    const jan = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), mat('#9cc8e6', 0.05, 0.8)); jan.position.set(-0.4, 0.45, 0.03); portinha.add(jan);
    const mac = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.05), mMet); mac.position.set(-0.68, 0, 0.05); portinha.add(mac); }
  parts.portinha = portinha;
  { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#123a1c'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#7dffa0'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('▲ CABINE', 128, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ map: t })); placa.position.set(0, B.piso + 2.15, B.frente + 0.06); A.add(placa); }
  const luzPorta = brilho('#40ff70', 0.7); luzPorta.position.set(0, B.piso + 2.35, B.frente + 0.1); A.add(luzPorta);
  const luzSalto = brilho('#40ff70', 0.9); luzSalto.position.set(1.2, 0.6, B.fim - 0.3); A.add(luzSalto); parts.luzSalto = luzSalto;
  // rampa (abre para baixo até ficar reta) e porta de cima (sobe para dentro da cauda)
  const rampa = new THREE.Group(); rampa.position.set(0, BAIA.piso - 0.06, BAIA.fim); A.add(rampa);
  const gR = new THREE.BoxGeometry(BAIA.meia * 2 + 0.3, 0.16, 4.7); gR.translate(0, 0, 2.35); const rm = new THREE.Mesh(gR, mB); rm.castShadow = true; rampa.add(rm);
  const rmTopo = new THREE.Mesh(new THREE.BoxGeometry(BAIA.meia * 2, 0.02, 4.6).translate(0, 0.09, 2.35), mPiso); rampa.add(rmTopo);
  const porta = new THREE.Group(); porta.position.set(0, 1.3, BAIA.fim + 9.0); A.add(porta);
  const gP = new THREE.BoxGeometry(BAIA.meia * 2 + 0.4, 0.14, 5.2); gP.translate(0, 0, -2.6); const pm = new THREE.Mesh(gP, mB); porta.add(pm);
  parts.rampa = rampa; parts.porta = porta;
  parts.abrir = (k) => { rampa.rotation.x = -0.42 * (1 - k); porta.rotation.x = -0.55 * (1 - k) + 0.32 * k; }; parts.abrir(0);
  // asa alta, motores turbo-hélice
  const asa = (s) => { const t = (s - 1.5) / (20.2 - 1.5); return { s, le: -3.0 + t * 0.9, c: 4.9 - t * 2.0, y: R - 0.15 + t * 0.15 }; };
  const H = 0.72;
  parts.helices = [];
  for (const lado of [1, -1]) {
    const map = lado > 0 ? mapD : mapE, fx = (g) => (lado > 0 ? g : flipGeo(g)), stA = est(asa);
    A.add(sombra(new THREE.Mesh(fx(loft(stA(0.85, 20.2, 8), perfil(0, H, 14, 0.16), map)), mB)));
    const hinge = (s) => { const a = asa(s); return new THREE.Vector3(lado * s, a.y, a.le + H * a.c); };
    const flap = articulada(fx(loft(stA(0.9, 13.5, 3), perfil(H, 1, 5, 0.16), map)), mB, hinge(0.9), hinge(13.5));
    const ail = articulada(fx(loft(stA(13.5, 20.0, 2), perfil(H, 1, 5, 0.16), map)), mE, hinge(13.5), hinge(20.0));
    A.add(flap, ail); parts[lado > 0 ? 'flapD' : 'flapE'] = flap; parts[lado > 0 ? 'ailD' : 'ailE'] = ail;
    for (const xm of [5.2, 10.0]) {
      const a = asa(xm), x = lado * xm;
      const nac = corpoTorno((z) => { const t = (z + 7.2) / 9; return 0.75 * Math.pow(Math.min(1, Math.max(0, t) / 0.15), 0.5) * (t > 0.7 ? 1 - (t - 0.7) / 0.3 * 0.6 : 1); }, -7.2, 1.8, 16, 18, 1, 1.2, mB);
      nac.position.set(x, a.y - 0.45, 0); A.add(nac);
      const ent = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.8), mEsc); ent.position.set(x, a.y - 1.2, -5.8); A.add(ent);
      const esc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.6, 10), mEsc); esc.rotation.x = Math.PI / 2; esc.position.set(x + lado * 0.5, a.y - 0.2, -1.5); A.add(esc);
      const h = helice(2.05, 4, '#1c1c1c', '#f2f2f2', p.base, 0.42, 0.9); h.h.position.set(x, a.y - 0.45, -7.3); A.add(h.h); parts.helices.push(h);
    }
    // sponson (barriga do trem)
    const sp = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), mB); sp.scale.set(0.75, 0.75, 4.2); sp.position.set(lado * 1.85, -1.55, -0.6); A.add(sp);
    const pr = (s) => { const t = s / 8.0; return { s, le: 11.3 + t * 1.6, c: 3.9 - t * 1.9, y: 1.9 }; };
    A.add(sombra(new THREE.Mesh(fx(loft(est(pr)(0.3, 8.0), perfil(0, 0.65, 10, 0.12), map)), mB)));
    const hg = (s) => { const a = pr(s); return new THREE.Vector3(lado * s, a.y, a.le + 0.65 * a.c); };
    const prof = articulada(fx(loft(est(pr)(0.5, 8.0, 2), perfil(0.65, 1, 5, 0.12), map)), mE, hg(0.5), hg(8.0)); A.add(prof);
    parts[lado > 0 ? 'profD' : 'profE'] = prof;
  }
  // carenagem da asa no topo
  const car = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), mB); car.scale.set(1.4, 0.33, 4.2); car.position.set(0, R + 0.25, -0.8); A.add(car);
  const der = (s) => { const t = (s - 1.4) / 7.6; return { s, le: 8.2 + t * 4.4, c: 6.2 - t * 3.2, y: 0 }; };
  A.add(sombra(new THREE.Mesh(flipGeo(loft(est(der)(1.4, 9.0, 4), perfil(0, 0.65, 10, 0.12), mapV)), mB)));
  const hd = (s) => { const a = der(s); return new THREE.Vector3(0, s, a.le + 0.65 * a.c); };
  const leme = articulada(flipGeo(loft(est(der)(1.8, 8.8, 2), perfil(0.65, 1, 5, 0.12), mapV)), mE, hd(1.8), hd(8.8)); A.add(leme); parts.leme = leme;
  // trem: duas rodas em tandem de cada lado (sobem pro sponson) e bequilha dupla
  const m = { mMetal: mMet, mEscuro: mEsc, mPneu };
  for (const lado of [1, -1]) for (const z of [-1.8, 0.4]) { const g = pernaTrem(A, parts, m, lado * 1.85, -1.6, z, 0.55, 0.62, 'y', lado); g.userData.sobe = 0.7; }
  { const g = pernaTrem(A, parts, m, 0, -1.7, -11.5, 0.7, 0.45, 'x', 1, 2); }
  parts.alturaTrem = 2.75;
  luzes(A, parts, 20.2, asa(20.2).y, asa(20.2).le + 0.6, new THREE.Vector3(0, 9.2, 13.5), new THREE.Vector3(0, 1.8, BAIA.fim + 10.7), 1.6);
  const lampF = brilho('#fff6dd', 2.4); lampF.position.set(0, -2.1, -12.5); A.add(lampF); parts.lampFarol = lampF;
  const pil = criarPiloto('classico'); pil.position.set(-0.7, 0.85, -12.0); A.add(pil); parts.piloto = pil; parts.cachecol = pil.userData.cachecol;
  const pil2 = criarPiloto('classico'); pil2.position.set(0.7, 0.85, -12.0); A.add(pil2);
  painelVivo(A, parts, new THREE.Vector3(-0.7, 1.15, -13.0), -0.25, 0.9);
  parts.cauda = new THREE.Vector3(0, 1.5, BAIA.fim + 10.5); parts.entrada = new THREE.Vector3(-2.4, -1.0, -10); parts.envergadura = 40.4; parts.raioCorpo = 2.2; parts.saida = new THREE.Vector3(-3.8, 0, -10); parts.entradaVoo = new THREE.Vector3(0, BAIA.piso, BAIA.frente + 0.35); // a portinha da cabine
  parts.superficies = (x, z) => {
    const ax = Math.abs(x), r = [];
    if (ax < 1.0 && z > -12 && z < BAIA.fim) r.push(R);
    if (ax < BAIA.meia && z > BAIA.frente && z < BAIA.fim) r.push(BAIA.piso);
    if (ax < BAIA.meia && z >= BAIA.fim && z < BAIA.fim + 4.6 && parts.rampaAberta) r.push(BAIA.piso);
    if (ax > 0.2 && ax < 20.2) { const a = asa(ax); if (z > a.le && z < a.le + a.c) r.push(a.y + a.c * 0.1); }
    if (ax < 0.35 && z > 8.3 && z < 14.4) r.push(9.0); // deriva
    return r;
  };
  parts.baia = BAIA;
  mesclar(A);
  A.userData.parts = parts; return A;
}

// ================== EMBRAER A-29 SUPER TUCANO (medidas reais: 11,38 m de comprimento, 11,14 m de envergadura) ==================
export const PINT_TUCANO = [
  { nome: 'FAB cinza', base: '#7d858c', esc: '#5f676e', baixo: '#9aa1a7', faixa: '#2a2f35' },
  { nome: 'Esquadrilha da Fumaça', base: '#f4f4f2', esc: '#d4262c', baixo: '#1d3f9a', faixa: '#d4262c', fumaca: true },
  { nome: 'Camuflado', base: '#5e6b4a', esc: '#3f4934', baixo: '#a7ad9a', faixa: '#2b3122' },
];
export function criarTucano(p = PINT_TUCANO[0]) {
  const A = new THREE.Group(), parts = { trem: [], rodas: [] };
  const mB = mat(p.base, 0.45, 0.2), mE = mat(p.esc, 0.45, 0.2), mBx = mat(p.baixo, 0.45, 0.2), mEsc = mat('#26282b', 0.6, 0.3), mMet = mat('#aeb3b8', 0.25, 0.9), mPneu = mat('#141414', 0.9, 0);
  const Z0 = -5.55, Z1 = 5.6;
  const rf = (z) => { if (z < -3.6) { const t = (z - Z0) / 1.95; return 0.34 + 0.26 * Math.sin(Math.min(1, t) * Math.PI / 2); } if (z < -0.4) return 0.6; const t = (z + 0.4) / (Z1 + 0.4); return 0.6 - 0.46 * Math.pow(t, 1.25); };
  const tex = texCorpo(Z0, Z1, p.base, (g, Y, W, H) => {
    g.fillStyle = p.baixo; g.fillRect(0, 0, W * 0.16, H); g.fillRect(W * 0.84, 0, W * 0.16, H);
    if (p.fumaca) { // faixas da Esquadrilha da Fumaça: vermelho e azul varrendo o corpo
      for (const [u, c] of [[0.25, p.esc], [0.75, p.esc]]) { g.fillStyle = c; g.beginPath(); g.moveTo(W * (u - 0.09), Y(-5.4)); g.lineTo(W * (u + 0.09), Y(-5.4)); g.lineTo(W * (u + 0.03), Y(4.5)); g.lineTo(W * (u - 0.03), Y(4.5)); g.fill(); }
      g.fillStyle = '#1d3f9a'; g.fillRect(W * 0.4, Y(5.5), W * 0.2, Y(1.5) - Y(5.5));
    } else { g.fillStyle = p.esc; g.beginPath(); g.ellipse(W * 0.33, Y(0.5), 70, 260, 0.3, 0, 7); g.ellipse(W * 0.67, Y(2.5), 60, 200, -0.3, 0, 7); g.fill(); }
    g.fillStyle = '#1a1a1a'; g.fillRect(W * 0.42, Y(-2.7), W * 0.16, Y(-4.6) - Y(-2.7)); // faixa anti-reflexo no capô
    linhasPainel(g, Y, W, [-4.6, -3.6, -2.7, 1.3, 2.6, 4.0], 0.22);
    textoLado(g, W, Y, 2.0, 'FAB 5900', p.fumaca ? '#1d3f9a' : '#e8e8e8', 40, 0.06);
    for (const u of [0.25, 0.75]) { g.fillStyle = '#1f9d4a'; g.beginPath(); g.arc(W * u + (u < 0.5 ? 60 : -60), Y(3.3), 22, 0, 7); g.fill(); g.fillStyle = '#ffd400'; g.beginPath(); g.arc(W * u + (u < 0.5 ? 60 : -60), Y(3.3), 14, 0, 7); g.fill(); g.fillStyle = '#1e3c96'; g.beginPath(); g.arc(W * u + (u < 0.5 ? 60 : -60), Y(3.3), 7, 0, 7); g.fill(); } // cocar da FAB
  });
  A.add(corpoTorno(rf, Z0, Z1, 48, 36, 0.9, 1.25, mat('#fff', 0.45, 0.2, { map: tex }), 0.07, 0.2));
  // hélice de 5 pás (Hartzell) e cubo
  const hel = helice(1.19, 5, '#1c1c1c', '#f2c230', p.fumaca ? p.esc : '#2a2d30', 0.27, 0.62); hel.h.position.set(0, 0.02, Z0 - 0.02); A.add(hel.h); parts.helices = [hel];
  // tomada de ar sob o nariz e escapamentos dos dois lados (turbina PT6A)
  const ent = corpoTorno((z) => 0.22 * (z < -4.8 ? 0.85 : Math.pow(1 - (z + 4.8) / 1.6, 0.6)), -5.3, -3.2, 10, 14, 1.4, 0.8, mE); ent.position.y = -0.52; A.add(ent);
  const boca = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), mat('#0d0d0d', 0.9)); boca.scale.set(1.4, 0.8, 1); boca.rotation.y = Math.PI; boca.position.set(0, -0.52, -5.31); A.add(boca);
  const brasa = mat('#301510', 0.7, 0.2, { emissive: 0xff5a1a, emissiveIntensity: 0.3 }); parts.brasa = brasa;
  for (const s of [-1, 1]) {
    const esc = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.5, 12, 1, true), mEsc); esc.rotation.set(Math.PI / 2 - 0.5, 0, s * 0.9); esc.position.set(s * 0.6, -0.05, -4.2); A.add(esc);
    const f = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), brasa); f.position.set(s * 0.78, -0.12, -4.0); f.rotation.y = s * Math.PI / 2.4; A.add(f);
  }
  // cabine tandem: canopi longo com 3 arcos, dois pilotos (o de trás mais alto)
  const vid = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, roughness: 0.03, metalness: 0.8, transparent: true, opacity: 0.32, envMapIntensity: 2, depthWrite: false });
  const bolha = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), vid); bolha.scale.set(0.45, 0.55, 2.0); bolha.position.set(0, 0.62, -0.75); bolha.renderOrder = 2; A.add(bolha); parts.bolha = bolha;
  for (const z of [-2.35, -0.95, 0.75]) { const k = Math.sqrt(Math.max(0.05, 1 - ((z + 0.75) / 2.0) ** 2)); const t = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 20, Math.PI), mEsc); t.scale.set(0.45 * k + 0.02, 0.55 * k + 0.02, 1); t.position.set(0, 0.62, z); A.add(t); }
  const pil = criarPiloto('jato'); pil.position.set(0, 0.55, -1.75); A.add(pil); parts.piloto = pil;
  const pil2 = criarPiloto('jato'); pil2.position.set(0, 0.7, -0.25); A.add(pil2);
  for (const z of [-1.45, 0.05]) { const cad = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.16), mEsc); cad.position.set(0, 0.68 + (z > -1 ? 0.12 : 0), z); cad.rotation.x = -0.25; A.add(cad); } // assentos ejetáveis (abaixo do vidro)
  painelVivo(A, parts, new THREE.Vector3(0, 0.82, -2.35), -0.3, 0.75);
  const ant = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.4), mEsc); ant.position.set(0, 0.95, 2.2); ant.rotation.x = 0.4; A.add(ant);
  // asas: bordo de ataque quase reto, diedro de ~6°, metralhadoras .50 e cabides
  const asa = (s) => { const t = (s - 0.45) / (5.57 - 0.45); return { s, le: -0.95 + t * 0.4, c: 2.3 - t * 1.05, y: -0.45 + t * 0.52 }; };
  const H = 0.74;
  for (const lado of [1, -1]) {
    const map = lado > 0 ? mapD : mapE, fx = (g) => (lado > 0 ? g : flipGeo(g)), stA = est(asa);
    A.add(sombra(new THREE.Mesh(fx(loft(stA(0.4, 5.35, 6), perfil(0, H, 14, 0.15), map)), mB)));
    const tipS = [asa(5.35), { ...asa(5.57), c: asa(5.57).c * 0.85, le: asa(5.57).le + 0.06 }];
    A.add(sombra(new THREE.Mesh(fx(loft(tipS, perfil(0, 1, 12, 0.12), map)), p.fumaca ? mE : mB)));
    const hinge = (s) => { const a = asa(s); return new THREE.Vector3(lado * s, a.y + 0.02 * a.c, a.le + H * a.c); };
    const flap = articulada(fx(loft(stA(0.4, 3.2, 2), perfil(H, 1, 5, 0.15), map)), mB, hinge(0.4), hinge(3.2));
    const ail = articulada(fx(loft(stA(3.2, 5.35, 2), perfil(H, 1, 5, 0.15), map)), p.fumaca ? mE : mB, hinge(3.2), hinge(5.35));
    A.add(flap, ail); parts[lado > 0 ? 'flapD' : 'flapE'] = flap; parts[lado > 0 ? 'ailD' : 'ailE'] = ail;
    const ag = asa(2.0), cano = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.7, 8), mEsc); cano.rotation.x = Math.PI / 2; cano.position.set(lado * 2.0, ag.y - 0.02, ag.le - 0.25); A.add(cano);
    for (const sp of [3.0, 4.0]) { const ap = asa(sp), pl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.9), mE); pl.position.set(lado * sp, ap.y - 0.2, ap.le + ap.c * 0.4); A.add(pl); }
    if (!p.fumaca) { const ins = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), mat('#1f9d4a', 0.5, 0, { polygonOffset: true, polygonOffsetFactor: -2 })); const ai = asa(4.3); ins.rotation.x = -Math.PI / 2; ins.position.set(lado * 4.3, ai.y + ai.c * 0.12, ai.le + ai.c * 0.4); A.add(ins); }
    const pr = (s) => { const t = s / 2.3; return { s, le: 4.05 + t * 0.45, c: 1.35 - t * 0.6, y: 0.4 }; };
    A.add(sombra(new THREE.Mesh(fx(loft(est(pr)(0.1, 2.3), perfil(0, 0.62, 10, 0.1), map)), mB)));
    const hg = (s) => { const a = pr(s); return new THREE.Vector3(lado * s, a.y, a.le + 0.62 * a.c); };
    const prof = articulada(fx(loft(est(pr)(0.15, 2.3, 2), perfil(0.62, 1, 5, 0.1), map)), p.fumaca ? mE : mB, hg(0.15), hg(2.3)); A.add(prof); parts[lado > 0 ? 'profD' : 'profE'] = prof;
  }
  const der = (s) => { const t = (s - 0.35) / 1.85; return { s, le: 3.55 + t * 1.15, c: 1.95 - t * 1.0, y: 0 }; };
  { const f = new THREE.Shape(); f.moveTo(1.9, 0); f.lineTo(3.6, 0.45); f.lineTo(3.6, 0); f.closePath(); const g = new THREE.ExtrudeGeometry(f, { depth: 0.07, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(0.035, 0, 0); const fil = new THREE.Mesh(g, mB); fil.position.y = rf(2.6) * 1.25 + (2.6 - 0.2) * 0.07 - 0.05; A.add(fil); }
  A.add(sombra(new THREE.Mesh(flipGeo(loft(est(der)(0.35, 2.2), perfil(0, 0.62, 10, 0.1), (s, z, y) => [y, s + 0.3, z])), mB)));
  const hd = (s) => { const a = der(s); return new THREE.Vector3(0, s + 0.3, a.le + 0.62 * a.c); };
  const leme = articulada(flipGeo(loft(est(der)(0.4, 2.2, 2), perfil(0.62, 1, 5, 0.1), (s, z, y) => [y, s + 0.3, z])), p.fumaca ? mE : mB, hd(0.4), hd(2.2)); A.add(leme); parts.leme = leme;
  const m = { mMetal: mMet, mEscuro: mEsc, mPneu, tampa: mB };
  pernaTrem(A, parts, m, 0, -0.6, -3.9, 1.1, 0.25, 'x', 1);
  pernaTrem(A, parts, m, 1.6, -0.42, -0.15, 1.2, 0.33, 'z', 1);
  pernaTrem(A, parts, m, -1.6, -0.42, -0.15, 1.2, 0.33, 'z', -1);
  parts.alturaTrem = 1.95;
  luzes(A, parts, 5.58, 0.07, asa(5.5).le + 0.3, new THREE.Vector3(0, 2.55, 4.5), new THREE.Vector3(0, 0.7, Z1 + 0.05));
  const lampF = brilho('#fff6dd', 1.2); lampF.position.set(0, -1.3, -3.7); A.add(lampF); parts.lampFarol = lampF;
  parts.cauda = new THREE.Vector3(0, 0.5, Z1 + 0.3); parts.entrada = new THREE.Vector3(0, 1.15, -1.0); parts.envergadura = 11.14; parts.raioCorpo = 0.7; parts.saida = new THREE.Vector3(1.45, 0, -3.3); parts.comprimento = 11.4;
  parts.superficies = (x, z) => {
    const ax = Math.abs(x), r = [];
    if (ax < 0.45 && z > Z0 + 0.3 && z < Z1 - 0.3) { let y = rf(z) * 1.25 + Math.max(0, z - 0.2) * 0.07; const k = (z + 0.75) / 2.0; if (Math.abs(k) < 1) y = Math.max(y, 0.62 + 0.55 * Math.sqrt(1 - k * k)); r.push(y); }
    if (ax > 0.45 && ax < 5.5) { const a = asa(ax); if (z > a.le && z < a.le + a.c) r.push(a.y + a.c * 0.11); }
    if (ax < 0.14 && z > 3.6 && z < 5.4) r.push(2.5);
    return r;
  };
  mesclar(A); A.userData.parts = parts; return A;
}

// ================== CESSNA 172 SKYHAWK (8,28 m de comprimento, 11 m de envergadura, asa alta com montante) ==================
export const PINT_CESSNA = [
  { nome: 'Clássico', base: '#f6f6f2', f1: '#1d4f9a', f2: '#c8282e' },
  { nome: 'Escola amarelo', base: '#f2c230', f1: '#1d1d1d', f2: '#ffffff' },
  { nome: 'Vermelho', base: '#f6f6f2', f1: '#b8202a', f2: '#7a1418' },
];
export function criarCessna(p = PINT_CESSNA[0]) {
  const A = new THREE.Group(), parts = { trem: [], rodas: [] };
  const mB = mat(p.base, 0.35, 0.1), mF = mat(p.f1, 0.4, 0.1), mEsc = mat('#2a2b2e', 0.6, 0.3), mMet = mat('#c4c8cc', 0.3, 0.8), mPneu = mat('#141414', 0.9, 0);
  const Z0 = -3.9, Z1 = 4.35;
  // cabine larga e alta, capô do motor afinando, cone de cauda fino
  const rf = (z) => { if (z < -2.0) { const t = (z - Z0) / 1.9; return 0.36 + 0.3 * Math.sin(Math.min(1, t) * Math.PI / 2); } if (z < 0.9) return 0.66; const t = (z - 0.9) / (Z1 - 0.9); return 0.66 - 0.56 * Math.pow(t, 0.8); };
  const tex = texCorpo(Z0, Z1, p.base, (g, Y, W, H) => {
    for (const u of [0.25, 0.75]) { // faixas laterais e janelas
      g.fillStyle = p.f1; g.beginPath(); g.moveTo(W * (u - 0.035), Y(-3.8)); g.lineTo(W * (u + 0.02), Y(-3.8)); g.lineTo(W * (u + 0.01), Y(4.2)); g.lineTo(W * (u - 0.015), Y(4.2)); g.fill();
      g.fillStyle = p.f2; g.fillRect(W * (u - 0.05), Y(4.2), W * 0.012, Y(-3.6) - Y(4.2));
      const s = u < 0.5 ? 1 : -1; g.fillStyle = '#1a2430';
      g.beginPath(); g.moveTo(W * (u + s * 0.11), Y(-1.95)); g.lineTo(W * (u + s * 0.11), Y(-0.75)); g.lineTo(W * (u + s * 0.04), Y(-0.75)); g.lineTo(W * (u + s * 0.04), Y(-1.7)); g.fill(); // janela da porta
      g.beginPath(); g.moveTo(W * (u + s * 0.11), Y(-0.6)); g.lineTo(W * (u + s * 0.11), Y(0.7)); g.lineTo(W * (u + s * 0.05), Y(0.3)); g.lineTo(W * (u + s * 0.05), Y(-0.6)); g.fill(); // janela de trás
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(W * (u + Math.min(0, s * 0.13)), Y(-0.7), W * 0.13, Y(-2.0) - Y(-0.7)); // contorno da porta
    }
    g.fillStyle = '#1a2430'; g.beginPath(); g.moveTo(W * 0.36, Y(-2.0)); g.lineTo(W * 0.64, Y(-2.0)); g.lineTo(W * 0.6, Y(-1.3)); g.lineTo(W * 0.4, Y(-1.3)); g.fill(); // para-brisa
    linhasPainel(g, Y, W, [-2.9, -2.0, 0.9, 2.2, 3.4], 0.2);
    textoLado(g, W, Y, 2.3, 'PR-CEU', p.f1, 46, 0.03);
  });
  const corpo = corpoTorno(rf, Z0, Z1, 40, 32, 0.95, 1.12, mat('#fff', 0.35, 0.1, { map: tex }), 0.0, 0);
  { const pp = corpo.geometry.attributes.position; for (let i = 0; i < pp.count; i++) { const z = pp.getZ(i); if (z > 0.9) pp.setY(i, pp.getY(i) + (z - 0.9) * 0.1); } corpo.geometry.computeVertexNormals(); } // cone de cauda sobe (teto reto)
  A.add(corpo);
  const hel = helice(0.95, 2, '#2a2a2a', '#f2f2f2', p.base, 0.22, 0.42); hel.h.position.set(0, -0.02, Z0 - 0.02); A.add(hel.h); parts.helices = [hel];
  const brasa = mat('#301510', 0.7, 0.2, { emissive: 0xff5a1a, emissiveIntensity: 0.2 }); parts.brasa = brasa;
  const escap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), mEsc); escap.rotation.x = Math.PI / 2; escap.position.set(0.15, -0.66, -2.6); A.add(escap);
  const bocal = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8), brasa); bocal.position.set(0.15, -0.66, -2.44); A.add(bocal);
  for (const s of [-1, 1]) { const ar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.05), mEsc); ar.position.set(s * 0.18, -0.15, -3.86); A.add(ar); } // entradas de ar do capô
  // vidros (para-brisa e laterais) por cima da pintura, para dar brilho
  const vid = new THREE.MeshStandardMaterial({ color: 0x8fb0c4, roughness: 0.03, metalness: 0.8, transparent: true, opacity: 0.35, envMapIntensity: 2, depthWrite: false });
  const pb = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.7), vid); pb.position.set(0, 0.62, -1.75); pb.rotation.x = -0.95; A.add(pb);
  const pil = criarPiloto('classico'); pil.position.set(-0.28, 0.05, -1.1); pil.scale.setScalar(0.95); A.add(pil); parts.piloto = pil; parts.cachecol = pil.userData.cachecol; if (parts.cachecol) parts.cachecol.visible = false;
  painelVivo(A, parts, new THREE.Vector3(0, 0.35, -1.95), -0.25, 0.85);
  // asa alta: parte central reta e ponta afinando, diedro de 1,7°, montantes até o corpo
  const asa = (s) => { const t = Math.max(0, (s - 2.6) / (5.5 - 2.6)); return { s, le: -1.25 + t * 0.35, c: 1.63 - t * 0.5, y: 0.82 + s * 0.03 }; };
  const H = 0.75;
  for (const lado of [1, -1]) {
    const map = lado > 0 ? mapD : mapE, fx = (g) => (lado > 0 ? g : flipGeo(g)), stA = est(asa);
    A.add(sombra(new THREE.Mesh(fx(loft(stA(0.0, 5.3, 8), perfil(0, H, 14, 0.15), map)), mB)));
    A.add(sombra(new THREE.Mesh(fx(loft([asa(5.3), { ...asa(5.5), c: asa(5.5).c * 0.9 }], perfil(0, 1, 12, 0.13), map)), mF)));
    const hinge = (s) => { const a = asa(s); return new THREE.Vector3(lado * s, a.y + 0.02 * a.c, a.le + H * a.c); };
    const flap = articulada(fx(loft(stA(0.55, 2.9, 2), perfil(H, 1, 5, 0.15), map)), mB, hinge(0.55), hinge(2.9));
    const ail = articulada(fx(loft(stA(2.9, 5.3, 2), perfil(H, 1, 5, 0.15), map)), mB, hinge(2.9), hinge(5.3));
    A.add(flap, ail); parts[lado > 0 ? 'flapD' : 'flapE'] = flap; parts[lado > 0 ? 'ailD' : 'ailE'] = ail;
    const de = new THREE.Vector3(lado * 0.6, -0.42, -0.85), ate = new THREE.Vector3(lado * 2.55, asa(2.55).y, asa(2.55).le + 0.45), d = ate.clone().sub(de); // montante
    const mont = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, d.length(), 8), mB); mont.position.copy(de).addScaledVector(d, 0.5); mont.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); mont.scale.z = 2.2; A.add(mont);
    const pr = (s) => { const t = s / 1.7; return { s, le: 3.25 + t * 0.35, c: 1.3 - t * 0.45, y: 0.1 }; };
    A.add(sombra(new THREE.Mesh(fx(loft(est(pr)(0.1, 1.7), perfil(0, 0.6, 10, 0.1), map)), mB)));
    const hg = (s) => { const a = pr(s); return new THREE.Vector3(lado * s, a.y, a.le + 0.6 * a.c); };
    const prof = articulada(fx(loft(est(pr)(0.15, 1.7, 2), perfil(0.6, 1, 5, 0.1), map)), mB, hg(0.15), hg(1.7)); A.add(prof); parts[lado > 0 ? 'profD' : 'profE'] = prof;
  }
  const carW = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 1.5), mB); carW.position.set(0, 0.78, -0.6); A.add(carW); // junção asa-cabine
  // deriva inclinada para trás (marca do 172) com barbatana dorsal
  const der = (s) => { const t = (s - 0.3) / 1.25; return { s, le: 2.75 + t * 1.15, c: 1.5 - t * 0.6, y: 0 }; };
  A.add(sombra(new THREE.Mesh(flipGeo(loft(est(der)(0.3, 1.55), perfil(0, 0.65, 10, 0.1), (s, z, y) => [y, s + 0.45, z])), mB)));
  const hd = (s) => { const a = der(s); return new THREE.Vector3(0, s + 0.45, a.le + 0.65 * a.c); };
  const leme = articulada(flipGeo(loft(est(der)(0.35, 1.55, 2), perfil(0.65, 1, 5, 0.1), (s, z, y) => [y, s + 0.45, z])), mF, hd(0.35), hd(1.55)); A.add(leme); parts.leme = leme;
  { const f = new THREE.Shape(); f.moveTo(1.4, 0); f.lineTo(2.9, 0.42); f.lineTo(2.9, 0); f.closePath(); const g = new THREE.ExtrudeGeometry(f, { depth: 0.06, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(0.03, 0, 0); const fil = new THREE.Mesh(g, mB); fil.position.y = 0.74 + 0.05; A.add(fil); }
  // trem fixo com carenagens nas rodas
  const m = { mMetal: mMet, mEscuro: mEsc, mPneu, polaina: mB };
  pernaTrem(A, parts, m, 0, -0.62, -2.7, 0.85, 0.24, 'x', 1);
  for (const s of [-1, 1]) { const g = pernaTrem(A, parts, m, s * 1.2, -0.55, -0.2, 0.95, 0.29, 'y', s); g.rotation.z = s * 0.25; g.userData.sobe = 0; } // perna de mola inclinada pra fora, não recolhe
  parts.tremFixo = true; parts.alturaTrem = 1.8;
  luzes(A, parts, 5.52, asa(5.5).y, asa(5.5).le + 0.25, new THREE.Vector3(0, 2.05, 3.85), new THREE.Vector3(0, 0.55, Z1 + 0.05));
  const lampF = brilho('#fff6dd', 1.2); lampF.position.set(-2.4, 0.8, -1.3); A.add(lampF); parts.lampFarol = lampF;
  parts.cauda = new THREE.Vector3(0, 0.45, Z1 + 0.2); parts.entrada = new THREE.Vector3(0, 0.4, -1.1); parts.envergadura = 11.0; parts.raioCorpo = 0.75; parts.saida = new THREE.Vector3(1.4, 0, -1.6); parts.comprimento = 8.3;
  parts.superficies = (x, z) => {
    const ax = Math.abs(x), r = [];
    if (ax < 0.45 && z > Z0 + 0.3 && z < Z1 - 0.3 && (z < -1.3 || z > 0.9)) r.push(rf(z) * 1.12 + Math.max(0, z - 0.9) * 0.1);
    if (ax < 5.5) { const a = asa(ax); if (z > a.le && z < a.le + a.c) r.push(a.y + a.c * 0.1); }
    if (ax < 0.14 && z > 3.0 && z < 4.4) r.push(2.0);
    return r;
  };
  mesclar(A); A.userData.parts = parts; return A;
}

// Catálogo: física de cada um
export const TIPOS = {
  andorinha: { nome: 'Andorinha', desc: 'Acrobático leve, fácil de pilotar.', criar: (i) => criarAviao(PINTURAS[i % PINTURAS.length]), pinturas: PINTURAS, VS: 27, empuxo: 24, vmax: 85, rol: 2.6, arf: 1.5, guinada: 0.45, motor: 'helice' },
  caca: { nome: 'Caça a jato', desc: 'Estilo F-16: rápido, rola muito, pós-combustor.', criar: (i) => criarJato(PINT_JATO[i % PINT_JATO.length]), pinturas: PINT_JATO, VS: 62, empuxo: 42, vmax: 300, rol: 4.2, arf: 1.25, guinada: 0.3, motor: 'jato', armas: { cadencia: 18, vel: 750, canos: [[-0.75, 0.35, -4.6]], misseis: 4 } }, // canhão no lado esquerdo, como no F-16
  guerra: { nome: 'Caça da 2ª Guerra', desc: 'Estilo P-51: hélice grande, roda na cauda.', criar: (i) => criarWarbird(PINT_WAR[i % PINT_WAR.length]), pinturas: PINT_WAR, VS: 40, empuxo: 30, vmax: 185, rol: 2.3, arf: 1.3, guinada: 0.4, motor: 'helice', armas: { cadencia: 14, vel: 650, canos: [[-2.6, -0.25, -1.7], [2.6, -0.25, -1.7], [-2.9, -0.22, -1.6], [2.9, -0.22, -1.6]] } }, // metralhadoras nas asas
  tucano: { nome: 'A-29 Super Tucano', desc: 'Embraer da FAB: turboélice de ataque, 5 pás, metralhadoras.', criar: (i) => criarTucano(PINT_TUCANO[i % PINT_TUCANO.length]), pinturas: PINT_TUCANO, VS: 36, empuxo: 30, vmax: 165, rol: 3.0, arf: 1.35, guinada: 0.4, motor: 'turbo', armas: { cadencia: 15, vel: 650, canos: [[-2.0, -0.47, -1.6], [2.0, -0.47, -1.6]] } },
  cessna: { nome: 'Cessna 172', desc: 'O avião leve mais fabricado do mundo: asa alta, trem fixo, calmo.', criar: (i) => criarCessna(PINT_CESSNA[i % PINT_CESSNA.length]), pinturas: PINT_CESSNA, VS: 24, empuxo: 14, vmax: 66, rol: 1.6, arf: 1.05, guinada: 0.45, motor: 'helice' },
  cargueiro: { nome: 'Cargueiro', desc: 'Estilo C-130: 4 motores, rampa traseira.', criar: (i) => criarCargueiro(PINT_CARGA[i % PINT_CARGA.length]), pinturas: PINT_CARGA, VS: 44, empuxo: 11, vmax: 160, rol: 0.7, arf: 0.45, guinada: 0.2, motor: 'turbo' },
};
