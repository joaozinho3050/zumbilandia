// Piloto a pé: corpo articulado (joelho, cotovelo, pescoço), rosto, macacão com detalhes,
// botas com garras magnéticas, paraquedas — e animações que se misturam suavemente.
import * as THREE from '../lib/three.module.min.js';

export function criarPessoa() {
  const raiz = new THREE.Group();
  const m = (c, r = 0.75, mt = 0.05, e = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt, ...e });
  const macacao = m('#5d6747'), escuro = m('#454d34'), pele = m('#d6a07a', 0.6), luva = m('#1c1c1c', 0.6), bota = m('#2b231d', 0.7), sola = m('#121212', 0.9);
  const cinta = m('#2f3a52', 0.6), fivela = m('#c9ccd0', 0.25, 0.9), capM = m('#ecebe6', 0.35), visM = m('#141820', 0.05, 0.95), mochila = m('#3a4436');
  const cap = (r, l, mat, seg = 10) => { const g = new THREE.CapsuleGeometry(r, l, 4, seg); g.translate(0, -l / 2 - r, 0); return new THREE.Mesh(g, mat); };
  const caixa = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const J = {}; // juntas
  const junta = (nome, pai, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); pai.add(g); J[nome] = g; return g; };

  const quadril = junta('quadril', raiz, 0, 0.98, 0);
  const bacia = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), macacao); bacia.scale.set(1.15, 0.75, 0.85); quadril.add(bacia);
  const cinto = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.022, 6, 20), cinta); cinto.rotation.x = Math.PI / 2; cinto.position.y = 0.07; quadril.add(cinto);
  const fiv = caixa(0.06, 0.045, 0.02, fivela); fiv.position.set(0, 0.07, -0.16); quadril.add(fiv);
  // tronco
  const tronco = junta('tronco', quadril, 0, 0.08, 0);
  const barriga = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.14, 4, 12), macacao); barriga.position.y = 0.12; barriga.scale.set(1.12, 1, 0.85); tronco.add(barriga);
  const peito = junta('peito', tronco, 0, 0.26, 0);
  const torax = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.16, 4, 14), macacao); torax.position.y = 0.1; torax.scale.set(1.3, 1, 0.82); peito.add(torax);
  const ziper = caixa(0.012, 0.36, 0.01, fivela); ziper.position.set(0.02, 0.04, -0.128); peito.add(ziper);
  for (const s of [-1, 1]) {
    const bolso = caixa(0.09, 0.08, 0.02, escuro); bolso.position.set(s * 0.1, 0.15, -0.122); peito.add(bolso);
    const aba = caixa(0.095, 0.025, 0.025, escuro); aba.position.set(s * 0.1, 0.195, -0.125); peito.add(aba);
    const alca = caixa(0.04, 0.42, 0.02, cinta); alca.position.set(s * 0.085, 0.05, -0.135); alca.rotation.z = s * 0.12; peito.add(alca); // arnês
    const alcaC = caixa(0.04, 0.4, 0.02, cinta); alcaC.position.set(s * 0.085, 0.08, 0.13); peito.add(alcaC);
  }
  const peitoral = caixa(0.24, 0.035, 0.02, cinta); peitoral.position.set(0, 0.06, -0.142); peito.add(peitoral);
  const fv2 = caixa(0.05, 0.05, 0.02, fivela); fv2.position.set(0, 0.06, -0.152); peito.add(fv2);
  // etiqueta com nome e bandeira no ombro
  const etq = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), new THREE.MeshBasicMaterial({ map: texNome() })); etq.position.set(-0.1, 0.2, -0.134); etq.rotation.y = Math.PI; peito.add(etq);
  // mochila do paraquedas com puxador
  const pack = caixa(0.26, 0.34, 0.1, mochila); pack.position.set(0, 0.1, 0.165); peito.add(pack);
  const tampa = caixa(0.27, 0.05, 0.11, m('#33404f')); tampa.position.set(0, 0.27, 0.165); peito.add(tampa);
  const puxa = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.008, 6, 12), m('#d23a2a', 0.4)); puxa.position.set(0.12, -0.02, -0.15); peito.add(puxa);
  // pescoço e cabeça com rosto
  const pescoco = junta('pescoco', peito, 0, 0.3, 0);
  const pesc = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.08, 10), pele); pesc.position.y = 0.03; pescoco.add(pesc);
  const gola = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.018, 6, 14), macacao); gola.rotation.x = Math.PI / 2; gola.position.y = -0.005; pescoco.add(gola);
  const cabeca = junta('cabeca', pescoco, 0, 0.08, 0);
  const cranio = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14), pele); cranio.scale.set(0.95, 1.12, 1.05); cranio.position.y = 0.1; cabeca.add(cranio);
  const queixo = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), pele); queixo.scale.set(1.1, 0.8, 1); queixo.position.set(0, 0.035, -0.04); cabeca.add(queixo);
  const nariz = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 6), pele); nariz.rotation.x = -Math.PI / 2 - 0.3; nariz.position.set(0, 0.09, -0.11); cabeca.add(nariz);
  const branco = m('#f4f2ee', 0.4), pupila = m('#2a1b10', 0.3);
  for (const s of [-1, 1]) {
    const olho = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), branco); olho.position.set(s * 0.036, 0.115, -0.093); cabeca.add(olho);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), pupila); pu.position.set(s * 0.036, 0.115, -0.108); cabeca.add(pu);
    const sob = caixa(0.035, 0.008, 0.01, m('#3a2a1e')); sob.position.set(s * 0.036, 0.142, -0.1); sob.rotation.z = -s * 0.15; cabeca.add(sob);
    const orelha = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), pele); orelha.scale.set(0.5, 1, 0.8); orelha.position.set(s * 0.097, 0.1, 0); cabeca.add(orelha);
  }
  const boca = caixa(0.035, 0.007, 0.01, m('#8a4a3a')); boca.position.set(0, 0.05, -0.098); cabeca.add(boca);
  const cabelo = new THREE.Mesh(new THREE.SphereGeometry(0.104, 14, 10, 0, Math.PI, Math.PI * 0.3, Math.PI * 0.4), m('#3a2618', 0.9)); cabelo.position.y = 0.1; cabeca.add(cabelo);
  // capacete com faixa e viseira
  const capacete = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), capM); capacete.position.set(0, 0.115, 0.01); capacete.rotation.x = 0.18; cabeca.add(capacete);
  const faixa = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 20, Math.PI), m('#d23a2a', 0.4)); faixa.rotation.set(0, Math.PI / 2, Math.PI / 2); faixa.position.set(0, 0.12, 0.01); cabeca.add(faixa);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8, -Math.PI * 0.78, Math.PI * 0.56, Math.PI * 0.3, Math.PI * 0.18), visM); visor.position.set(0, 0.115, 0.005); cabeca.add(visor); J.visor = visor;
  // braços: ombro -> cotovelo -> mão (com polegar)
  const braco = (s) => {
    const om = junta(s > 0 ? 'ombroD' : 'ombroE', peito, s * 0.2, 0.2, 0);
    const ombreira = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), macacao); om.add(ombreira);
    if (s < 0) { const band = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.04), new THREE.MeshBasicMaterial({ map: texBandeira(), side: THREE.DoubleSide })); band.position.set(-0.066, -0.06, 0); band.rotation.y = -Math.PI / 2; om.add(band); }
    om.add(cap(0.052, 0.2, macacao));
    const co = junta(s > 0 ? 'cotoveloD' : 'cotoveloE', om, 0, -0.29, 0);
    co.add(cap(0.045, 0.18, macacao));
    const pulso = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), luva); pulso.position.y = -0.22; co.add(pulso);
    const mao = junta(s > 0 ? 'maoD' : 'maoE', co, 0, -0.26, 0);
    const palma = caixa(0.07, 0.09, 0.035, luva); palma.position.y = -0.04; mao.add(palma);
    const dedos = caixa(0.065, 0.05, 0.03, luva); dedos.position.set(0, -0.1, -0.008); dedos.rotation.x = -0.35; mao.add(dedos);
    const pol = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.035, 3, 6), luva); pol.position.set(-s * 0.038, -0.045, -0.02); pol.rotation.z = s * 0.6; mao.add(pol);
  };
  braco(1); braco(-1);
  // pernas: quadril -> joelho -> tornozelo (bota com sola, cadarço e garras)
  const garras = [];
  const perna = (s) => {
    const cx = junta(s > 0 ? 'coxaD' : 'coxaE', quadril, s * 0.095, -0.03, 0);
    cx.add(cap(0.07, 0.3, macacao));
    const laco = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.014, 6, 16), cinta); laco.rotation.x = Math.PI / 2; laco.position.y = -0.1; cx.add(laco);
    const bolsoP = caixa(0.03, 0.12, 0.09, escuro); bolsoP.position.set(s * 0.075, -0.2, 0); cx.add(bolsoP);
    const jo = junta(s > 0 ? 'joelhoD' : 'joelhoE', cx, 0, -0.44, 0);
    const joelheira = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), escuro); joelheira.scale.set(1, 0.9, 0.7); joelheira.position.z = -0.03; jo.add(joelheira);
    jo.add(cap(0.058, 0.3, macacao));
    const to = junta(s > 0 ? 'tornD' : 'tornE', jo, 0, -0.43, 0);
    const cano = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.064, 0.13, 10), bota); cano.position.y = 0.01; to.add(cano);
    const pe = caixa(0.11, 0.08, 0.25, bota); pe.position.set(0, -0.06, -0.05); to.add(pe);
    const bico = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), bota); bico.scale.set(1, 0.72, 1); bico.position.set(0, -0.065, -0.16); to.add(bico);
    const so = caixa(0.115, 0.022, 0.29, sola); so.position.set(0, -0.105, -0.06); to.add(so);
    for (let k = 0; k < 3; k++) { const c = caixa(0.07, 0.006, 0.008, m('#c9b48a')); c.position.set(0, -0.015 - k * 0.025, -0.115 + k * 0.03); to.add(c); }
    const gr = new THREE.Group(); gr.position.set(0, -0.12, -0.06); to.add(gr); // garras magnéticas
    const azul = m('#9fd8ff', 0.2, 0.9, { emissive: 0x2a9dff, emissiveIntensity: 0.9 });
    for (let k = -1; k <= 1; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.06, 5), azul); c.rotation.x = Math.PI; c.position.set(k * 0.035, -0.02, -0.12); gr.add(c);
      const c2 = c.clone(); c2.position.z = 0.1; gr.add(c2); }
    const placa = caixa(0.1, 0.012, 0.26, azul); placa.position.y = 0.005; gr.add(placa);
    garras.push(gr);
  };
  perna(1); perna(-1);
  // paraquedas: velame retangular em gomos + cordas + manetes
  const pq = new THREE.Group(); pq.visible = false; raiz.add(pq);
  const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) { g.fillStyle = ['#ff6b35', '#ffffff', '#1d4fa3'][i % 3]; g.fillRect(i * 256 / 9, 0, 256 / 9 + 1, 32); }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const gV = new THREE.CylinderGeometry(3.6, 3.6, 2.6, 18, 1, true, -Math.PI * 0.32, Math.PI * 0.64); gV.rotateX(-Math.PI / 2); gV.scale(1, 0.55, 1);
  const velame = new THREE.Mesh(gV, m('#fff', 0.8, 0, { map: tx, side: THREE.DoubleSide })); velame.position.y = 3.2; velame.castShadow = true; pq.add(velame);
  const pts = []; for (let i = 0; i <= 8; i++) { const a = -Math.PI * 0.32 + i / 8 * Math.PI * 0.64, x = Math.sin(a) * 3.6, y = 3.2 + Math.cos(a) * 3.6 * 0.55 - 0.2; for (const z of [-1.2, 1.2]) pts.push(new THREE.Vector3(x, y, z), new THREE.Vector3(x > 0 ? 0.2 : -0.2, 1.55, 0)); }
  pq.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x333333 })));
  raiz.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const pose = {}; for (const k of Object.keys(J)) pose[k] = new THREE.Euler();
  return { obj: raiz, J, garras, pq, pose, fase: 0, y: 0, t0: 0 };
}

function texNome() { const c = document.createElement('canvas'); c.width = 64; c.height = 24; const g = c.getContext('2d'); g.fillStyle = '#2b2b22'; g.fillRect(0, 0, 64, 24); g.fillStyle = '#e8e2c8'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText('PILOTO', 32, 17); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function texBandeira() { const c = document.createElement('canvas'); c.width = 48; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#1f9d4a'; g.fillRect(0, 0, 48, 32); g.fillStyle = '#ffd400'; g.beginPath(); g.moveTo(4, 16); g.lineTo(24, 3); g.lineTo(44, 16); g.lineTo(24, 29); g.fill(); g.fillStyle = '#1e3c96'; g.beginPath(); g.arc(24, 16, 7, 0, 7); g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

// Pose desejada para cada situação; a função mistura suavemente da pose atual para ela.
// modo: 'pe' | 'pulo' | 'queda' | 'paraquedas' | 'sobre' | 'subindo' | 'pouso'
export function animarPessoa(p, modo, rapidez, t, dt, garras, vento = 0) {
  const A = {}; const set = (k, x = 0, y = 0, z = 0) => (A[k] = [x, y, z]);
  for (const k of Object.keys(p.J)) set(k);
  let quadY = 0.98, raizX = 0;
  p.garras.forEach((g) => (g.visible = garras));
  p.pq.visible = modo === 'paraquedas';
  if (modo === 'pe') {
    const v = Math.min(rapidez, 7), corre = v > 3.6;
    p.fase += dt * (v < 0.2 ? 0 : 2.2 + v * 1.25);
    const f = p.fase, a = Math.min(1, v / 2.5) * (corre ? 0.95 : 0.6);
    if (v < 0.2) { // parado: respira e olha em volta
      const r = Math.sin(t * 1.6) * 0.03; set('peito', r, 0, 0); set('cabeca', Math.sin(t * 0.3) * 0.08, Math.sin(t * 0.37) * 0.45, 0);
      set('ombroD', 0.05, 0, 0.1 + r); set('ombroE', 0.05, 0, -0.1 - r); set('cotoveloD', -0.18); set('cotoveloE', -0.18);
      set('coxaD', 0, 0, 0.03); set('coxaE', 0, 0, -0.03); quadY = 0.98 + r * 0.2;
    } else {
      set('coxaD', Math.sin(f) * a); set('coxaE', -Math.sin(f) * a);
      set('joelhoD', Math.max(0, -Math.cos(f)) * a * 1.6 + 0.05); set('joelhoE', Math.max(0, Math.cos(f)) * a * 1.6 + 0.05);
      set('tornD', -Math.max(0, Math.sin(f)) * 0.3); set('tornE', -Math.max(0, -Math.sin(f)) * 0.3);
      set('ombroD', -Math.sin(f) * a * 0.9, 0, 0.08); set('ombroE', Math.sin(f) * a * 0.9, 0, -0.08);
      set('cotoveloD', corre ? -1.5 : -0.25 - Math.max(0, Math.sin(f)) * 0.5); set('cotoveloE', corre ? -1.5 : -0.25 - Math.max(0, -Math.sin(f)) * 0.5);
      set('tronco', corre ? -0.22 : -0.05, Math.sin(f) * 0.12, 0); set('peito', 0, -Math.sin(f) * 0.15, 0); set('cabeca', corre ? 0.2 : 0.05);
      quadY = 0.98 - Math.abs(Math.cos(f)) * (corre ? 0.07 : 0.035);
    }
  } else if (modo === 'pulo') {
    set('coxaD', -0.7); set('coxaE', -0.3); set('joelhoD', 1.2); set('joelhoE', 0.8); set('ombroD', -0.4, 0, 0.6); set('ombroE', -0.4, 0, -0.6); set('cotoveloD', -0.6); set('cotoveloE', -0.6);
  } else if (modo === 'pouso') {
    quadY = 0.72; set('coxaD', -1.1); set('coxaE', -1.1); set('joelhoD', 1.9); set('joelhoE', 1.9); set('tornD', -0.7); set('tornE', -0.7); set('tronco', -0.5); set('cabeca', 0.4);
    set('ombroD', -0.6, 0, 0.3); set('ombroE', -0.6, 0, -0.3); set('cotoveloD', -0.4); set('cotoveloE', -0.4);
  } else if (modo === 'queda') { // barriga pra baixo, arqueado, braços e pernas abertos
    raizX = -1.35; quadY = 0.55; const fl = Math.sin(t * 11) * 0.06;
    set('ombroD', -0.3, 0, 1.35 + fl); set('ombroE', -0.3, 0, -1.35 - fl); set('cotoveloD', -0.9); set('cotoveloE', -0.9);
    set('coxaD', 0.35, 0, 0.28); set('coxaE', 0.35, 0, -0.28); set('joelhoD', 1.0 + fl); set('joelhoE', 1.0 - fl);
    set('tronco', 0.25); set('cabeca', 0.75); set('pescoco', 0.3);
  } else if (modo === 'paraquedas') { // pendurado nas manetes, pernas balançando
    const b = Math.sin(t * 1.3) * 0.12;
    set('ombroD', 0.2, 0, 2.55); set('ombroE', 0.2, 0, -2.55); set('cotoveloD', -0.5); set('cotoveloE', -0.5);
    set('coxaD', 0.15 + b, 0, 0.05); set('coxaE', 0.15 - b, 0, -0.05); set('joelhoD', 0.25); set('joelhoE', 0.35); set('cabeca', -0.25, Math.sin(t * 0.4) * 0.5, 0);
  } else if (modo === 'sobre') {
    const ag = garras ? Math.min(1, vento * 1.3) : 0;
    if (!garras && vento > 0.15) { // sem garras: se debatendo contra o vento
      set('tronco', 0.35); set('ombroD', -1.2 + Math.sin(t * 9) * 1.0, 0, 0.6); set('ombroE', -1.2 + Math.sin(t * 8 + 1) * 1.0, 0, -0.6);
      set('cotoveloD', -0.6); set('cotoveloE', -0.6); set('coxaD', -0.5); set('coxaE', 0.3); set('joelhoD', 0.8); set('joelhoE', 0.4); set('cabeca', -0.3);
    } else {
      p.fase += dt * rapidez * 2.4; const f = p.fase, a = Math.min(1, rapidez / 1.5) * 0.45;
      quadY = 0.98 - 0.32 * ag;
      set('coxaD', -1.15 * ag + Math.sin(f) * a); set('coxaE', -1.15 * ag - Math.sin(f) * a); set('joelhoD', 2.0 * ag + Math.max(0, -Math.cos(f)) * a * 1.4); set('joelhoE', 2.0 * ag + Math.max(0, Math.cos(f)) * a * 1.4);
      set('tornD', -0.8 * ag); set('tornE', -0.8 * ag); set('tronco', -0.55 * ag); set('cabeca', 0.5 * ag);
      set('ombroD', -1.2 * ag - Math.sin(f) * a, 0, 0.15); set('cotoveloD', -0.2); set('ombroE', -0.3 * ag + Math.sin(f) * a, 0, -0.15 - 0.9 * ag); set('cotoveloE', -0.3);
    }
  } else if (modo === 'subindo') { // passando pela cabine
    quadY = 0.85; set('coxaD', -1.3); set('joelhoD', 1.6); set('coxaE', 0.2); set('ombroD', -2.2); set('ombroE', -1.6); set('cotoveloD', -0.3); set('cotoveloE', -0.5); set('tronco', -0.3);
  }
  set('quadril', raizX); delete A.visor;
  const k = 1 - Math.exp(-dt * (modo === 'queda' || modo === 'pouso' ? 9 : 13));
  for (const [nome, [x, y, z]] of Object.entries(A)) { const e = p.pose[nome]; e.x += (x - e.x) * k; e.y += (y - e.y) * k; e.z += (z - e.z) * k; p.J[nome].rotation.copy(e); }
  p.y += (quadY - p.y) * k; p.J.quadril.position.y = p.y;
}
