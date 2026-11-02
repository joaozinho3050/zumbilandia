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
  const dorso = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), mE); dorso.scale.set(0.62, 0.42, 4.6); dorso.position.set(0, 0.58, 0.6); A.add(dorso);
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
  const rad = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), mBx); rad.scale.set(0.42, 0.42, 1.9); rad.position.set(0, -0.72, 1.1); A.add(rad);
  const radB = new THREE.Mesh(new THREE.CircleGeometry(0.34, 18), mat('#0d0d0d', 0.9)); radB.scale.set(1, 0.8, 1); radB.position.set(0, -0.78, -0.62); radB.rotation.y = Math.PI; A.add(radB);
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
    for (let i = -3; i <= 3; i++) g.fillRect(W * (0.5 + i * 0.035) - 14, Y(-12.0), 26, 34);
    for (const u of [0.31, 0.69]) g.fillRect(W * u - 18, Y(-12.7), 36, 30);
    for (const u of [0.26, 0.74]) for (let z = -8; z < 3; z += 2.2) { g.beginPath(); g.arc(W * u, Y(z), 9, 0, 7); g.fill(); } // vigias
    g.fillStyle = p.faixa; g.fillRect(W * 0.245, Y(3.5), 14, Y(-10.5) - Y(3.5)); g.fillRect(W * 0.745, Y(3.5), 14, Y(-10.5) - Y(3.5));
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3; g.strokeRect(W * 0.2, Y(-8.6), 40, Y(-10.2) - Y(-8.6)); g.strokeRect(W * 0.76, Y(-8.6), 40, Y(-10.2) - Y(-8.6)); // portas de paraquedistas
    linhasPainel(g, Y, W, [-11.2, -8, -5, -2, 1, 3.5], 0.2);
    textoLado(g, W, Y, -3.5, 'FORÇA AÉREA', p.faixa, 46, 0.03); textoLado(g, W, Y, 1.8, '2451', p.faixa, 56, 0.03);
  });
  const corpo = corpoTorno(rf, Z0, Z1, 40, 40, 1, 1, mat('#fff', 0.6, 0.15, { map: tex, side: THREE.DoubleSide })); A.add(corpo);
  // cauda levantada: casca só por cima/lados, aberta embaixo (onde ficam rampa e porta)
  { const N = 10, seg = 28, abre = Math.PI / 3, pos = [], idx = [];
    for (let i = 0; i <= N; i++) { const t = i / N, z = BAIA.fim + t * 10.4, r = R * (1 - t * 0.78), yc = t * t * 0.6 + t * 1.0;
      for (let j = 0; j <= seg; j++) { const a = -Math.PI / 2 + abre + j / seg * (2 * Math.PI - 2 * abre); pos.push(Math.cos(a) * r, yc + Math.sin(a) * r, z); } }
    for (let i = 0; i < N; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const cs = new THREE.Mesh(g, mat(p.base, 0.6, 0.15, { side: THREE.DoubleSide })); cs.castShadow = true; cs.userData.fixo = false; A.add(cs);
    const ponta = new THREE.Mesh(new THREE.SphereGeometry(R * 0.22, 12, 8), mB); ponta.position.set(0, 1.6, BAIA.fim + 10.4); A.add(ponta); }
  // interior: piso com trilhos, costelas, bancos vermelhos, caixas e luz verde de salto
  const piso = new THREE.Mesh(new THREE.BoxGeometry(BAIA.meia * 2, 0.12, BAIA.fim - BAIA.frente), mPiso); piso.position.set(0, BAIA.piso - 0.06, (BAIA.fim + BAIA.frente) / 2); A.add(piso);
  for (const x of [-0.9, 0.9]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, BAIA.fim - BAIA.frente), mMet); tr.position.set(x, BAIA.piso + 0.02, (BAIA.fim + BAIA.frente) / 2); A.add(tr); }
  for (let z = BAIA.frente + 0.8; z < BAIA.fim; z += 1.4) { const c = new THREE.Mesh(new THREE.TorusGeometry(R - 0.12, 0.06, 4, 24, Math.PI * 1.4), mInt); c.position.z = z; c.rotation.z = -Math.PI * 0.2; c.material = mat('#6c7868', 0.8); A.add(c); }
  const parede = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 24), mat('#4f5a4c', 0.9)); parede.position.z = BAIA.frente; A.add(parede);
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 10), mat('#6e2a2a', 0.9)); b.position.set(s * 1.45, -0.75, -3.5); A.add(b);
    const rede = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 10), mat('#7a2020', 0.9, 0, { wireframe: true })); rede.position.set(s * 1.62, -0.2, -3.5); A.add(rede); }
  for (const [z, w, h] of [[-7.5, 1.6, 1.2], [-5.6, 1.2, 0.9]]) { const cx = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.4), mat('#8a6a3e', 0.9)); cx.position.set(0, BAIA.piso + h / 2, z); A.add(cx);
    const cinta = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.08), mat('#c49a1a', 0.8)); cinta.position.copy(cx.position); A.add(cinta); }
  const luzSalto = brilho('#40ff70', 0.9); luzSalto.position.set(1.2, 0.6, BAIA.fim - 0.3); A.add(luzSalto); parts.luzSalto = luzSalto;
  const luzInt = brilho('#ff5040', 2.5); luzInt.position.set(0, 1.5, -2); A.add(luzInt);
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
    A.add(sombra(new THREE.Mesh(fx(loft(stA(0.2, 20.2, 8), perfil(0, H, 14, 0.16), map)), mB)));
    const hinge = (s) => { const a = asa(s); return new THREE.Vector3(lado * s, a.y, a.le + H * a.c); };
    const flap = articulada(fx(loft(stA(0.5, 13.5, 3), perfil(H, 1, 5, 0.16), map)), mB, hinge(0.5), hinge(13.5));
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
  const car = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), mB); car.scale.set(1.4, 0.6, 4.2); car.position.set(0, R - 0.1, -0.8); A.add(car);
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
  parts.cauda = new THREE.Vector3(0, 1.5, BAIA.fim + 10.5); parts.entrada = new THREE.Vector3(-2.4, -1.0, -10); parts.envergadura = 40.4; parts.raioCorpo = 2.2; parts.saida = new THREE.Vector3(-3.8, 0, -10); parts.entradaVoo = new THREE.Vector3(0, BAIA.piso, BAIA.frente + 0.6);
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

// Catálogo: física de cada um
export const TIPOS = {
  andorinha: { nome: 'Andorinha', desc: 'Acrobático leve, fácil de pilotar.', criar: (i) => criarAviao(PINTURAS[i % PINTURAS.length]), pinturas: PINTURAS, VS: 27, empuxo: 24, vmax: 85, rol: 2.6, arf: 1.5, guinada: 0.45, motor: 'helice' },
  caca: { nome: 'Caça a jato', desc: 'Estilo F-16: rápido, rola muito, pós-combustor.', criar: (i) => criarJato(PINT_JATO[i % PINT_JATO.length]), pinturas: PINT_JATO, VS: 62, empuxo: 42, vmax: 300, rol: 4.2, arf: 1.25, guinada: 0.3, motor: 'jato', armas: { cadencia: 18, vel: 1050, canos: [[-0.75, 0.35, -4.6]] } }, // canhão no lado esquerdo, como no F-16
  guerra: { nome: 'Caça da 2ª Guerra', desc: 'Estilo P-51: hélice grande, roda na cauda.', criar: (i) => criarWarbird(PINT_WAR[i % PINT_WAR.length]), pinturas: PINT_WAR, VS: 40, empuxo: 30, vmax: 185, rol: 2.3, arf: 1.3, guinada: 0.4, motor: 'helice', armas: { cadencia: 14, vel: 880, canos: [[-2.6, -0.25, -1.7], [2.6, -0.25, -1.7], [-2.9, -0.22, -1.6], [2.9, -0.22, -1.6]] } }, // metralhadoras nas asas
  cargueiro: { nome: 'Cargueiro', desc: 'Estilo C-130: 4 motores, rampa traseira.', criar: (i) => criarCargueiro(PINT_CARGA[i % PINT_CARGA.length]), pinturas: PINT_CARGA, VS: 44, empuxo: 11, vmax: 160, rol: 0.7, arf: 0.45, guinada: 0.2, motor: 'turbo' },
};
