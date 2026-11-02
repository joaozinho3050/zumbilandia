// Modelo 3D do avião "Andorinha": tudo feito em código, com peças móveis.
// Frente = -Z, cima = +Y, direita = +X. Origem ~ centro de gravidade.
import * as THREE from '../lib/three.module.min.js';

export const PINTURAS = [
  { nome: 'Clássico', base: '#f3ead8', acc: '#c8282e', faixa: '#1d2b4a', barriga: '#e2d6bd', ponta: '#f2c230' },
  { nome: 'Céu', base: '#f4f7fb', acc: '#2a6fd0', faixa: '#8fc6ff', barriga: '#dfe8f3', ponta: '#ffffff' },
  { nome: 'Ipê', base: '#f6c12c', acc: '#1d1d1d', faixa: '#e85d1f', barriga: '#e9b21c', ponta: '#1d1d1d' },
  { nome: 'Noturno', base: '#22252c', acc: '#d4a63a', faixa: '#d4a63a', barriga: '#2e323b', ponta: '#d4a63a' },
  { nome: 'Arara', base: '#2f9e5b', acc: '#e63b2e', faixa: '#ffd23c', barriga: '#3a7fd5', ponta: '#ffd23c' },
];

const FUS_Z0 = -3.75, FUS_Z1 = 4.55, FUS_N = 40;
function raioFus(z) { // perfil do corpo
  const t = (z - FUS_Z0) / (FUS_Z1 - FUS_Z0);
  if (t <= 0 || t >= 1) return 0.02;
  const nariz = Math.min(1, Math.pow(t / 0.13, 0.5));
  const cauda = Math.pow(Math.min(1, (1 - t) / 0.62), 0.85);
  return Math.max(0.06, 0.72 * nariz * (0.25 + 0.75 * cauda));
}
const vFus = (z) => (z - FUS_Z0) / (FUS_Z1 - FUS_Z0);

// Textura da pintura do corpo (u = volta, v = comprimento)
function texturaCorpo(p) {
  const W = 1024, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const Y = (z) => (1 - vFus(z)) * H; // y do canvas para um z do corpo
  g.fillStyle = p.base; g.fillRect(0, 0, W, H);
  // barriga (u perto de 0 e 1)
  g.fillStyle = p.barriga; g.fillRect(0, 0, W * 0.13, H); g.fillRect(W * 0.87, 0, W * 0.13, H);
  // capô colorido com bico em ponta nas laterais
  g.fillStyle = p.acc; g.fillRect(0, Y(-2.35), W, H - Y(-2.35));
  for (const u of [0.25, 0.75]) { g.beginPath(); g.moveTo(W * (u - 0.12), Y(-2.35)); g.lineTo(W * u, Y(-1.4)); g.lineTo(W * (u + 0.12), Y(-2.35)); g.fill(); }
  // faixas laterais (cheatline) que afinam até a cauda
  for (const u of [0.25, 0.75]) {
    const s = u < 0.5 ? 1 : -1;
    g.fillStyle = p.faixa; g.beginPath();
    g.moveTo(W * (u - 0.03 * s), Y(-1.9)); g.lineTo(W * (u - 0.025 * s), Y(4.4)); g.lineTo(W * (u + 0.02 * s), Y(4.4)); g.lineTo(W * (u + 0.06 * s), Y(-1.9)); g.fill();
    g.fillStyle = p.acc; g.fillRect(W * Math.min(u + 0.065 * s, u + 0.075 * s), Y(2.2), W * 0.01, Y(-1.6) - Y(2.2));
  }
  // linhas de painel e rebites
  g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2;
  for (const z of [-2.35, -1.5, -0.2, 1.0, 2.2, 3.4]) { g.beginPath(); g.moveTo(0, Y(z)); g.lineTo(W, Y(z)); g.stroke(); }
  g.beginPath(); g.moveTo(W * 0.5, Y(1.0)); g.lineTo(W * 0.5, Y(4.4)); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (const z of [-2.35, -1.5, -0.2, 1.0, 2.2, 3.4]) for (let u = 0; u < 1; u += 0.012) g.fillRect(u * W, Y(z) - 7, 2, 2), g.fillRect(u * W, Y(z) + 5, 2, 2);
  // portinhola de óleo e tampa de combustível
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.strokeRect(W * 0.6, Y(-2.9), 30, 24);
  g.fillStyle = '#888'; g.beginPath(); g.arc(W * 0.5, Y(-1.7), 9, 0, 7); g.fill();
  // degrau / marcas "NO STEP"
  // matrícula nos dois lados
  g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const [u, ang] of [[0.25, Math.PI / 2], [0.75, -Math.PI / 2]]) {
    g.save(); g.translate(W * (u + (u < 0.5 ? 0.075 : -0.075)), Y(2.75)); g.rotate(ang);
    g.fillStyle = p.faixa; g.fillText('PT-CEU', 0, 0); g.restore();
    // bandeirinha
    g.save(); g.translate(W * (u + (u < 0.5 ? 0.075 : -0.075)), Y(3.8)); g.rotate(ang);
    g.fillStyle = '#1f9d4a'; g.fillRect(-26, -18, 52, 36); g.fillStyle = '#ffd400';
    g.beginPath(); g.moveTo(-22, 0); g.lineTo(0, -15); g.lineTo(22, 0); g.lineTo(0, 15); g.fill();
    g.fillStyle = '#1e3c96'; g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fill(); g.restore();
  }
  // sujeira de escapamento nas laterais
  for (const u of [0.25, 0.75]) {
    const gr = g.createLinearGradient(0, Y(-2.6), 0, Y(-0.4)); gr.addColorStop(0, 'rgba(30,25,20,0.35)'); gr.addColorStop(1, 'rgba(30,25,20,0)');
    g.fillStyle = gr; g.fillRect(W * (u - 0.05), Y(-0.4), W * 0.1, Y(-2.6) - Y(-0.4));
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// Perfil de asa (NACA 2412 simplificado). Devolve pontos (x corda 0..1, y) fechados entre x0 e x1.
export function perfil(x0, x1, n = 12, tc = 0.13) {
  const th = (x) => 5 * tc * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const cam = (x) => (x < 0.4 ? 0.02 / 0.16 * (0.8 * x - x * x) : 0.02 / 0.36 * (0.2 + 0.8 * x - x * x));
  const xs = []; for (let i = 0; i <= n; i++) { const s = (1 - Math.cos(Math.PI * i / n)) / 2; xs.push(x0 + (x1 - x0) * s); }
  const pts = [];
  for (const x of xs) pts.push([x, cam(x) + th(x)]);             // em cima, de frente pra trás
  for (let i = xs.length - 1; i >= 0; i--) pts.push([xs[i], cam(xs[i]) - th(xs[i])]); // embaixo, de trás pra frente
  return pts;
}
// Superfície tipo asa: estações {s, le, c, y}; map(s, z, y) -> [x,y,z]. Fecha as pontas.
export function loft(stations, pts, map) {
  const pos = [], idx = [], P = pts.length;
  for (const st of stations) for (const [cx, cy] of pts) pos.push(...map(st.s, st.le + cx * st.c, st.y + cy * st.c));
  for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < P; j++) {
    const a = i * P + j, b = i * P + (j + 1) % P, c = a + P, d = b + P; idx.push(a, c, b, b, c, d);
  }
  for (const [k, flip] of [[0, true], [stations.length - 1, false]]) { // tampas
    const base = pos.length / 3, st = stations[k];
    pos.push(...map(st.s, st.le + st.c * 0.4, st.y + st.c * 0.02));
    for (let j = 0; j < P; j++) { const a = k * P + j, b = k * P + (j + 1) % P; flip ? idx.push(base, a, b) : idx.push(base, b, a); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}
export const flipGeo = (g) => { const i = g.index.array; for (let k = 0; k < i.length; k += 3) { const t = i[k]; i[k] = i[k + 1]; i[k + 1] = t; } g.computeVertexNormals(); return g; };

// Peça móvel (aileron, profundor, leme): gira em volta da linha de dobradiça
export function articulada(geo, mat, a, b) {
  const piv = new THREE.Group(); piv.position.copy(a);
  geo.translate(-a.x, -a.y, -a.z);
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; piv.add(m);
  piv.userData.eixo = b.clone().sub(a).normalize();
  piv.userData.set = (ang) => piv.quaternion.setFromAxisAngle(piv.userData.eixo, ang);
  return piv;
}

export function brilho(cor, tam) { // bolinha de luz (sprite aditivo)
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(0.2, cor); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(tam); s.userData.tam = tam; return s;
}

export function criarAviao(pintura = PINTURAS[0], comPainel = true) {
  const p = pintura, A = new THREE.Group(), parts = {};
  const mBase = new THREE.MeshStandardMaterial({ color: p.base, roughness: 0.35, metalness: 0.1 });
  const mAcc = new THREE.MeshStandardMaterial({ color: p.acc, roughness: 0.35, metalness: 0.1 });
  const mPonta = new THREE.MeshStandardMaterial({ color: p.ponta, roughness: 0.4 });
  const mMetal = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.9 });
  const mEscuro = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.6, metalness: 0.3 });
  const mPneu = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const sombra = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; } }); return o; };

  // --- Corpo (torno) ---
  const prof = []; for (let i = 0; i <= FUS_N; i++) { const z = FUS_Z0 + (FUS_Z1 - FUS_Z0) * i / FUS_N; prof.push(new THREE.Vector2(raioFus(z), z)); }
  const gF = new THREE.LatheGeometry(prof, 40); gF.rotateX(Math.PI / 2); gF.scale(0.95, 1.12, 1); gF.translate(0, 0.05, 0);
  // levanta a cauda (linha de cima mais reta, de baixo sobe)
  { const ps = gF.attributes.position; for (let i = 0; i < ps.count; i++) { const z = ps.getZ(i); ps.setY(i, ps.getY(i) + Math.max(0, z - 0.5) * 0.11); } gF.computeVertexNormals(); }
  const mCorpo = new THREE.MeshStandardMaterial({ map: texturaCorpo(p), roughness: 0.32, metalness: 0.1, side: THREE.DoubleSide });
  const corpo = new THREE.Mesh(gF, mCorpo); corpo.castShadow = true; A.add(corpo); parts.corpo = corpo;

  // --- Hélice, cubo e disco borrado ---
  const helice = new THREE.Group(); helice.position.set(0, 0.05, FUS_Z0 - 0.02); A.add(helice);
  const spP = []; for (let i = 0; i <= 10; i++) { const t = i / 10; spP.push(new THREE.Vector2(0.36 * Math.sqrt(1 - t * t) + 0.001, -t * 0.62)); }
  const gS = new THREE.LatheGeometry(spP, 24); gS.rotateX(-Math.PI / 2);
  helice.add(new THREE.Mesh(gS, new THREE.MeshStandardMaterial({ color: p.acc, roughness: 0.15, metalness: 0.6 })));
  const lam = new THREE.Shape(); lam.moveTo(-0.07, 0); lam.quadraticCurveTo(-0.13, 0.6, -0.08, 1.12); lam.quadraticCurveTo(0, 1.22, 0.08, 1.12); lam.quadraticCurveTo(0.12, 0.5, 0.07, 0); lam.closePath();
  const gL = new THREE.ExtrudeGeometry(lam, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
  const mLam = new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.5, metalness: 0.2 });
  const pas = new THREE.Group(); helice.add(pas); parts.pas = pas;
  for (let k = 0; k < 3; k++) {
    const b = new THREE.Group(); b.rotation.z = k * Math.PI * 2 / 3;
    const m = new THREE.Mesh(gL, mLam); m.rotation.y = 0.35; m.position.z = 0.06; b.add(m);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.06), mPonta); tip.position.set(0, 1.12, 0.08); tip.rotation.y = 0.35; b.add(tip);
    pas.add(sombra(b));
  }
  { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, 'rgba(40,40,40,0.0)'); gr.addColorStop(0.3, 'rgba(40,40,40,0.25)'); gr.addColorStop(0.86, 'rgba(30,30,30,0.3)'); gr.addColorStop(0.9, p.ponta); gr.addColorStop(0.97, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill();
    const disco = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 }));
    disco.position.z = 0.1; helice.add(disco); parts.disco = disco; }
  parts.helice = helice;

  // escapamentos (3 de cada lado) com brasa
  const mBrasa = new THREE.MeshStandardMaterial({ color: 0x331a10, emissive: 0xff5a1a, emissiveIntensity: 0.3, roughness: 0.7 });
  parts.brasa = mBrasa;
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.28, 10, 1, true), mEscuro);
    e.position.set(s * 0.6, -0.12, -2.85 + i * 0.22); e.rotation.z = s * 1.25; A.add(e);
    const f = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), mBrasa); f.position.set(s * 0.73, -0.17, -2.85 + i * 0.22); f.rotation.y = s * Math.PI / 2; f.rotation.x = 0.3; A.add(f);
  }
  // entrada de ar embaixo do capô
  const ar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.7), mEscuro); ar.position.set(0, -0.68, -2.8); A.add(ar);
  // venezianas no capô
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.2), mEscuro); v.position.set(s * 0.66, 0.25, -3.0 + i * 0.12); v.rotation.z = s * 0.4; A.add(v); }

  // --- Asas ---
  const asa = (s) => { const t = (s - 0.4) / (5.25 - 0.4); return { s, le: -1.0 + t * 0.55, c: 2.15 - t * 1.0, y: -0.48 + t * 0.32 }; };
  const stA = (s0, s1, n = 4) => Array.from({ length: n + 1 }, (_, i) => asa(s0 + (s1 - s0) * i / n));
  const H = 0.74; // dobradiça em 74% da corda
  const mapD = (s, z, y) => [s, y, z], mapE = (s, z, y) => [-s, y, z];
  for (const lado of [1, -1]) {
    const map = lado > 0 ? mapD : mapE, fx = (g) => (lado > 0 ? g : flipGeo(g));
    A.add(sombra(new THREE.Mesh(fx(loft(stA(0.3, 4.75, 6), perfil(0, H, 14), map)), mBase)));
    // ponta arredondada colorida
    const tipSt = [asa(4.75), { ...asa(5.05), c: asa(5.05).c * 0.92, le: asa(5.05).le + 0.05 }, { ...asa(5.3), c: asa(5.3).c * 0.6, le: asa(5.3).le + 0.25 }];
    A.add(sombra(new THREE.Mesh(fx(loft(tipSt, perfil(0, 1, 14), map)), mAcc)));
    // bordo de fuga fixo perto do corpo
    A.add(sombra(new THREE.Mesh(fx(loft(stA(0.3, 0.75, 1), perfil(H, 1, 6), map)), mBase)));
    A.add(sombra(new THREE.Mesh(fx(loft(stA(2.6, 2.85, 1), perfil(H, 1, 6), map)), mBase)));
    // flape e aileron
    const hinge = (s) => { const a = asa(s); return new THREE.Vector3(lado * s, a.y + 0.02 * a.c, a.le + H * a.c); };
    const flap = articulada(fx(loft(stA(0.75, 2.6, 2), perfil(H, 1, 6), map)), mBase, hinge(0.75), hinge(2.6));
    const ail = articulada(fx(loft(stA(2.85, 4.75, 2), perfil(H, 1, 6), map)), mAcc, hinge(2.85), hinge(4.75));
    A.add(flap, ail);
    parts[lado > 0 ? 'flapD' : 'flapE'] = flap; parts[lado > 0 ? 'ailD' : 'ailE'] = ail;
    // luzes de navegação (vermelha à esquerda, verde à direita) + estrobo
    const tp = asa(5.2);
    const nav = brilho(lado > 0 ? '#2bff6a' : '#ff2d2d', 0.9); nav.position.set(lado * 5.32, tp.y + 0.03, tp.le + 0.32); A.add(nav);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: lado > 0 ? 0x40ff80 : 0xff4040 })); lamp.position.copy(nav.position); A.add(lamp);
    const est = brilho('#ffffff', 2.2); est.position.set(lado * 5.3, tp.y + 0.03, tp.le + 0.75); A.add(est);
    parts[lado > 0 ? 'navD' : 'navE'] = nav; parts[lado > 0 ? 'estD' : 'estE'] = est;
    // insígnia na asa (círculo)
    const ins = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshStandardMaterial({ map: insignia(p), transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
    const ai = asa(3.6); ins.rotation.x = -Math.PI / 2; ins.position.set(lado * 3.6, ai.y + ai.c * 0.105, ai.le + ai.c * 0.38); A.add(ins);
    // trilho de saída: ponta da asa (para os rastros de vórtice)
    parts[lado > 0 ? 'pontaD' : 'pontaE'] = new THREE.Vector3(lado * 5.3, tp.y, tp.le + 0.5);
  }
  // tubo de pitot sob a asa direita
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), mMetal); pit.rotation.x = Math.PI / 2; pit.position.set(3.4, -0.32, -1.0); A.add(pit);
  // carenagem da junção asa-corpo
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), mBase); f.scale.set(0.8, 0.45, 2.8); f.position.set(s * 0.5, -0.42, -0.1); A.add(f); }

  // --- Cauda ---
  const est = (s) => { const t = s / 1.95; return { s, le: 3.3 + t * 0.45, c: 1.15 - t * 0.5, y: 0.42 }; };
  const stE = (s0, s1, n = 3) => Array.from({ length: n + 1 }, (_, i) => est(s0 + (s1 - s0) * i / n));
  const He = 0.6;
  for (const lado of [1, -1]) {
    const map = lado > 0 ? mapD : mapE, fx = (g) => (lado > 0 ? g : flipGeo(g));
    A.add(sombra(new THREE.Mesh(fx(loft(stE(0.1, 1.95), perfil(0, He, 10, 0.1), map)), mBase)));
    const hg = (s) => { const a = est(s); return new THREE.Vector3(lado * s, a.y, a.le + He * a.c); };
    const prof = articulada(fx(loft(stE(0.15, 1.95, 2), perfil(He, 1, 6, 0.1), map)), mAcc, hg(0.15), hg(1.95));
    A.add(prof); parts[lado > 0 ? 'profD' : 'profE'] = prof;
  }
  const der = (s) => { const t = (s - 0.35) / 1.55; return { s, le: 2.75 + t * 1.05, c: 1.65 - t * 0.85, y: 0 }; };
  const stD = (s0, s1, n = 3) => Array.from({ length: n + 1 }, (_, i) => der(s0 + (s1 - s0) * i / n));
  const mapV = (s, z, y) => [y, s + 0.2, z];
  A.add(sombra(new THREE.Mesh(flipGeo(loft(stD(0.35, 1.9), perfil(0, 0.62, 10, 0.1), mapV)), mBase)));
  const hd = (s) => { const a = der(s); return new THREE.Vector3(0, s + 0.2, a.le + 0.62 * a.c); };
  const gLeme = flipGeo(loft(stD(0.4, 1.9, 2), perfil(0.62, 1, 6, 0.1), mapV)); uvPorAltura(gLeme, 0.6, 2.1);
  const leme = articulada(gLeme, new THREE.MeshStandardMaterial({ map: listras(p), roughness: 0.35 }), hd(0.4), hd(1.9));
  A.add(leme); parts.leme = leme;
  // farol rotativo vermelho no topo da deriva e luz branca da cauda
  const bea = brilho('#ff3030', 1.6); bea.position.set(0, 2.15, 3.55); A.add(bea); parts.beacon = bea;
  const cauda = brilho('#ffffff', 0.8); cauda.position.set(0, 0.6, FUS_Z1 + 0.05); A.add(cauda); parts.luzCauda = cauda;
  // antena de fio da deriva até a cabine
  const fio = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2.05, 3.0), new THREE.Vector3(0, 1.05, 0.4)]), new THREE.LineBasicMaterial({ color: 0x222222 }));
  A.add(fio);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.45, 6), mEscuro); ant.position.set(0, -0.62, 1.2); ant.rotation.x = 0.5; A.add(ant);

  // --- Cabine: bolha, moldura, piloto e painel ---
  const vid = new THREE.MeshStandardMaterial({ color: 0x9cc8e6, roughness: 0.03, metalness: 0.75, transparent: true, opacity: 0.32, envMapIntensity: 2, depthWrite: false });
  const bolha = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), vid);
  bolha.scale.set(0.56, 0.52, 1.55); bolha.position.set(0, 0.62, -0.25); bolha.renderOrder = 2; A.add(bolha); parts.bolha = bolha;
  for (const z of [-0.95, 0.15]) { const t = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 24, Math.PI), mEscuro); const k = Math.sqrt(1 - ((z + 0.25) / 1.55) ** 2); t.scale.set(0.56 * k, 0.52 * k, 1); t.position.set(0, 0.62, z); A.add(t); }
  const trilho = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 2.9), mEscuro); trilho.position.set(0, 1.14, -0.25); A.add(trilho);
  // piloto
  const pil = criarPiloto('classico'); pil.position.set(0, 0.62, -0.05); A.add(pil); parts.piloto = pil; parts.cachecol = pil.userData.cachecol;
  const banco = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.12), mEscuro); banco.position.set(0, 0.62, 0.3); banco.rotation.x = -0.15; A.add(banco);
  // painel de instrumentos (textura viva) e tampa anti-reflexo
  if (comPainel) {
    const pc = document.createElement('canvas'); pc.width = 512; pc.height = 192;
    const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace;
    const painel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.375), new THREE.MeshBasicMaterial({ map: pt }));
    painel.position.set(0, 0.94, -0.98); painel.rotation.x = -0.2; A.add(painel);
    parts.painel = { canvas: pc, tex: pt };
  }
  const tampa = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.04, 0.3), mEscuro); tampa.position.set(0, 1.12, -1.02); A.add(tampa);
  // manche
  const manche = new THREE.Group(); manche.position.set(0, 0.25, -0.6); A.add(manche); parts.manche = manche;
  { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 6), mEscuro); h.position.y = 0.25; manche.add(h);
    const pu = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0x111111 })); pu.position.y = 0.52; manche.add(pu); }

  // --- Trem de pouso triciclo (recolhe) ---
  parts.trem = []; parts.rodas = [];
  const perna = (x, y, z, comp, r, eixo, sinal) => pernaTrem(A, parts, { mMetal, mEscuro, mPneu, polaina: mAcc, tampa: mBase }, x, y, z, comp, r, eixo, sinal);
  perna(0, -0.55, -2.55, 1.05, 0.27, 'x', 1);
  perna(1.75, -0.38, -0.05, 1.22, 0.33, 'z', 1);
  perna(-1.75, -0.38, -0.05, 1.22, 0.33, 'z', -1);
  parts.alturaTrem = 1.93; // da origem ao chão com o trem baixado

  // farol de pouso (cone de luz) sob a asa esquerda
  const lampF = brilho('#fff6dd', 1.4); lampF.position.set(-2.2, -0.45, -1.3); A.add(lampF); parts.lampFarol = lampF;
  parts.helices = [{ pas, disco: parts.disco, raio: 1.2, h: helice }];
  parts.cauda = new THREE.Vector3(0, 0.3, FUS_Z1 + 0.3);
  parts.entrada = new THREE.Vector3(0, 1.1, -0.2);
  // onde dá pra pisar em cima (coordenadas locais): devolve alturas possíveis
  parts.superficies = (x, z) => {
    const ax = Math.abs(x), r = [];
    if (ax < 0.5 && z > FUS_Z0 + 0.4 && z < FUS_Z1 - 0.3) { let y = raioFus(z) * 1.12 + 0.05 + Math.max(0, z - 0.5) * 0.11; const k = (z + 0.25) / 1.55; if (Math.abs(k) < 1) y = Math.max(y, 0.62 + 0.52 * Math.sqrt(1 - k * k)); r.push(y); }
    if (ax > 0.4 && ax < 5.2) { const a = asa(ax); if (z > a.le && z < a.le + a.c) r.push(a.y + a.c * 0.1); }
    if (ax < 1.95) { const e = est(ax); if (z > e.le && z < e.le + e.c) r.push(e.y + e.c * 0.07); }
    if (ax < 0.14 && z > 2.8 && z < 4.45) r.push(2.15); // deriva (parede)
    return r;
  };
  parts.envergadura = 10.6; parts.raioCorpo = 0.75; parts.saida = new THREE.Vector3(1.4, 0, 2.3);
  mesclar(A);

    A.userData.parts = parts;
  return A;
}

export function insignia(p) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = p.faixa; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 44, 0, 7); g.fill();
  g.fillStyle = p.acc; g.beginPath(); // estrela de 5 pontas
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 16 : 40, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function listras(p) { // leme listrado
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : p.acc; g.fillRect(0, i * 32, 64, 32); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// O loft não gera UV: o leme recebe UV pela altura
export function uvPorAltura(g, y0, y1) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = 0.5; uv[i * 2 + 1] = (p.getY(i) - y0) / (y1 - y0); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// Desenha o painel (velocímetro, horizonte artificial, altímetro, variômetro, bússola, giros)
export function desenhaPainel(painel, d) {
  const g = painel.canvas.getContext('2d'), W = 512, H = 192;
  g.fillStyle = '#26282c'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1b1c1f'; for (let i = 0; i < 8; i++) g.fillRect(6 + i * 64, 4, 2, 2);
  const rel = (cx, cy, r) => { g.fillStyle = '#0d0e10'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.strokeStyle = '#555a61'; g.lineWidth = 4; g.stroke(); };
  const pont = (cx, cy, r, a, cor = '#fff', w = 4) => { g.strokeStyle = cor; g.lineWidth = w; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r); g.stroke(); };
  const marcas = (cx, cy, r, n, cor = '#ddd') => { g.strokeStyle = cor; g.lineWidth = 2; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.sin(a) * r * 0.82, cy - Math.cos(a) * r * 0.82); g.lineTo(cx + Math.sin(a) * r * 0.95, cy - Math.cos(a) * r * 0.95); g.stroke(); } };
  const txt = (s, x, y, sz = 14, cor = '#ddd') => { g.fillStyle = cor; g.font = `bold ${sz}px sans-serif`; g.textAlign = 'center'; g.fillText(s, x, y); };
  // velocímetro
  rel(64, 70, 54); g.lineWidth = 6; g.strokeStyle = '#2bbd4a'; g.beginPath(); g.arc(64, 70, 46, -Math.PI / 2 + 0.6, -Math.PI / 2 + 3.2); g.stroke();
  g.strokeStyle = '#e8c21e'; g.beginPath(); g.arc(64, 70, 46, -Math.PI / 2 + 3.2, -Math.PI / 2 + 4.6); g.stroke();
  marcas(64, 70, 54, 24); pont(64, 70, 44, d.vel / 400 * Math.PI * 2); txt('km/h', 64, 102, 11); txt(String(Math.round(d.vel)), 64, 90, 13, '#fff');
  // horizonte artificial
  const cx = 192, cy = 70, r = 54; g.save(); g.beginPath(); g.arc(cx, cy, r, 0, 7); g.clip();
  g.translate(cx, cy); g.rotate(-d.rol); const off = d.arf * 120;
  g.fillStyle = '#3c8de0'; g.fillRect(-100, -200 + off, 200, 200); g.fillStyle = '#8a5a2b'; g.fillRect(-100, off, 200, 200);
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(-80, off); g.lineTo(80, off); g.stroke();
  for (let k = -3; k <= 3; k++) if (k) { g.beginPath(); g.moveTo(-14, off - k * 20); g.lineTo(14, off - k * 20); g.stroke(); }
  g.restore(); g.strokeStyle = '#555a61'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
  g.strokeStyle = '#ffb21e'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 34, cy); g.lineTo(cx - 10, cy); g.lineTo(cx, cy + 8); g.lineTo(cx + 10, cy); g.lineTo(cx + 34, cy); g.stroke();
  // altímetro
  rel(320, 70, 54); marcas(320, 70, 54, 10); for (let i = 0; i < 10; i++) txt(String(i), 320 + Math.sin(i / 10 * 6.283) * 36, 75 - Math.cos(i / 10 * 6.283) * 36, 12);
  pont(320, 70, 26, (d.alt / 1000) * Math.PI * 2, '#fff', 6); pont(320, 70, 46, (d.alt % 100) / 100 * Math.PI * 2, '#fff', 3); txt('ALT', 320, 102, 11);
  // variômetro
  rel(448, 70, 54); marcas(448, 70, 54, 12); pont(448, 70, 44, -Math.PI / 2 + Math.max(-1, Math.min(1, d.vs / 20)) * 2.6, '#fff'); txt('SOBE', 448, 52, 10); txt('m/s', 448, 102, 11);
  // fila de baixo: bússola, giros, combustível, trem
  g.fillStyle = '#0d0e10'; g.fillRect(150, 140, 210, 40); g.save(); g.beginPath(); g.rect(150, 140, 210, 40); g.clip();
  for (let k = -6; k <= 6; k++) { const hd = Math.round(d.rumo / 10) * 10 + k * 10, x = 255 + (hd - d.rumo) * 4; const n = ((hd % 360) + 360) % 360;
    g.fillStyle = '#ddd'; g.fillRect(x - 1, 140, 2, n % 30 ? 6 : 12); if (!(n % 30)) txt(({ 0: 'N', 90: 'L', 180: 'S', 270: 'O' })[n] || String(n / 10), x, 172, 13, n % 90 ? '#ddd' : '#ffb21e'); }
  g.restore(); g.fillStyle = '#ffb21e'; g.fillRect(254, 140, 2, 40);
  rel(64, 160, 28); marcas(64, 160, 28, 8); pont(64, 160, 22, -2.2 + d.rpm * 4.4, '#ff8a3a', 3); txt('RPM', 64, 182, 9);
  rel(448, 160, 28); txt('TREM', 448, 152, 10); g.fillStyle = d.trem > 0.98 ? '#2bff6a' : d.trem < 0.02 ? '#333' : '#ffb21e';
  for (const x of [436, 448, 460]) { g.beginPath(); g.arc(x, 168, 4, 0, 7); g.fill(); }
  txt('FLAP ' + Math.round(d.flap * 30) + '°', 400, 160, 11, '#aaa');
  if (d.estol) txt('ESTOL!', 110, 160, 16, '#ff4040');
  painel.tex.needsUpdate = true;
}

// Piloto sentado (cabeça = children[1], capacete = children[2])
export function criarPiloto(estilo = 'classico') {
  const pil = new THREE.Group(), jato = estilo === 'jato';
  const mMetal = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.9 }), mEscuro = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.6 });
  const jaq = new THREE.MeshStandardMaterial({ color: jato ? 0x5b6346 : 0x6b4226, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), jaq); torso.scale.set(1.05, 1.1, 0.75); pil.add(torso);
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd9a27a, roughness: 0.7 })); cabeca.position.y = 0.36; pil.add(cabeca);
  const capacete = new THREE.Mesh(new THREE.SphereGeometry(jato ? 0.19 : 0.165, 16, 10, 0, Math.PI * 2, 0, Math.PI * (jato ? 0.62 : 0.55)), new THREE.MeshStandardMaterial({ color: jato ? 0xe9e9e4 : 0x5a3b22, roughness: 0.5 }));
  capacete.position.y = 0.37; capacete.rotation.x = 0.25; pil.add(capacete);
  if (jato) { // viseira escura, máscara de oxigênio e mangueira
    const vis = new THREE.Mesh(new THREE.SphereGeometry(0.195, 16, 8, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.32, Math.PI * 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1a22, metalness: 0.9, roughness: 0.05 }));
    vis.position.y = 0.37; vis.rotation.y = Math.PI; capacete.add(vis); vis.position.set(0, 0, 0);
    const masc = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mEscuro); masc.scale.set(1, 0.9, 1.2); masc.position.set(0, 0.3, -0.13); pil.add(masc);
    const mang = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 6, 10, 1.6), mEscuro); mang.position.set(0.05, 0.18, -0.1); mang.rotation.set(0, 1.2, 2.4); pil.add(mang);
  } else {
    for (const s of [-1, 1]) {
      const o = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 14), mMetal); o.position.set(s * 0.06, 0.47, -0.11); o.rotation.x = -0.6; pil.add(o);
      const lente = new THREE.Mesh(new THREE.CircleGeometry(0.042, 12), new THREE.MeshStandardMaterial({ color: 0x4aa0c0, metalness: 0.9, roughness: 0.05 })); lente.position.copy(o.position); lente.rotation.x = -0.6 + Math.PI; pil.add(lente);
      const fone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), mEscuro); fone.rotation.z = Math.PI / 2; fone.position.set(s * 0.16, 0.36, 0); pil.add(fone);
    }
    const mic = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, 4, 10, 1.4), mEscuro); mic.position.set(0.04, 0.33, -0.02); mic.rotation.set(Math.PI / 2, 0, 2.3); pil.add(mic);
    const g = new THREE.PlaneGeometry(0.1, 0.55, 1, 8); g.translate(0, -0.275, 0); g.rotateX(Math.PI / 2 - 0.2);
    const ca = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 })); ca.position.set(0.1, 0.2, 0.12); pil.add(ca); pil.userData.cachecol = ca;
  }
  return pil;
}

// Perna de trem de pouso que recolhe (eixo 'x' = para trás, 'z' = para dentro)
export function pernaTrem(A, parts, m, x, y, z, comp, r, eixo, sinal, rodas = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); A.add(g);
  const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * Math.max(1, r * 2.5), 0.05 * Math.max(1, r * 2.5), comp * 0.6, 8), m.mMetal); st.position.y = -comp * 0.3; g.add(st);
  const ol = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * Math.max(1, r * 2.5), 0.07 * Math.max(1, r * 2.5), comp * 0.45, 8), m.mEscuro); ol.position.y = -comp * 0.18; g.add(ol);
  const roda = new THREE.Group(); roda.position.y = -comp; g.add(roda);
  for (let k = 0; k < rodas; k++) {
    const dx = rodas > 1 ? (k - (rodas - 1) / 2) * r * 0.75 : 0;
    const pn = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, r * 0.3, 10, 20), m.mPneu); pn.rotation.y = Math.PI / 2; pn.position.x = dx; roda.add(pn);
    const cubo = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.48, r * 0.48, r * 0.5, 14), m.mMetal); cubo.rotation.z = Math.PI / 2; cubo.position.x = dx; roda.add(cubo);
  }
  if (m.polaina) { const pol = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 14, 10), m.polaina); pol.scale.set(0.42, 0.75, 1.7); pol.position.set(0, -comp + r * 0.25, 0.05); g.add(pol); }
  if (m.tampa) { const tp = new THREE.Mesh(new THREE.BoxGeometry(0.03, comp * 0.8, Math.max(0.3, r)), m.tampa); tp.position.set(sinal * 0.09 * Math.max(1, r * 3), -comp * 0.4, 0); g.add(tp); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { eixo, sinal }; parts.trem.push(g); parts.rodas.push(roda);
  return g;
}

// Junta as peças paradas (filhas diretas, sem textura e opacas) por material: menos chamadas de desenho
export function mesclar(raiz) {
  const grupos = new Map();
  for (const o of [...raiz.children]) {
    if (!o.isMesh || o.material.map || o.material.transparent || o.userData.fixo === false) continue;
    if (!grupos.has(o.material)) grupos.set(o.material, []);
    grupos.get(o.material).push(o);
  }
  for (const [mat, lista] of grupos) {
    if (lista.length < 2) continue;
    const pos = [], nor = [];
    for (const o of lista) {
      o.updateMatrix(); const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrix);
      if (!g.attributes.normal) g.computeVertexNormals();
      pos.push(g.attributes.position.array); nor.push(g.attributes.normal.array); raiz.remove(o);
    }
    const junta = (arrs) => { const n = arrs.reduce((s, a) => s + a.length, 0), out = new Float32Array(n); let k = 0; for (const a of arrs) { out.set(a, k); k += a.length; } return out; };
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(junta(pos), 3)); g.setAttribute('normal', new THREE.BufferAttribute(junta(nor), 3));
    const m = new THREE.Mesh(g, mat); m.castShadow = true; raiz.add(m);
  }
}
