// Cenário: céu, luz, terreno, mar, árvores, aeroporto, vila, balões, farol, barcos, pássaros, nuvens.
import * as THREE from '../lib/three.module.min.js';
import { MUNDO, PISTA, LAGO, ATOL, FAROL, LUGARES, CANION, terreno, corChao, fbm, rng, clamp, lerp, smooth } from './mundo.js';

const C = (h) => new THREE.Color(h);
export const HORAS = [
  { nome: 'Amanhecer', elev: 7, az: 95, top: '#4d73b3', hor: '#f3b593', low: '#59617e', sol: '#ffb27a', luz: 2.4, hc: '#9fb6e0', hg: '#6a5444', hi: 1.0, nuvem: '#ffe0cc', estrelas: 0.05, exp: 1.0, densidade: 0.00011 },
  { nome: 'Dia', elev: 52, az: 150, top: '#2a68d0', hor: '#bfdcf5', low: '#88aed6', sol: '#fff3df', luz: 3.0, hc: '#c4dcff', hg: '#6e6650', hi: 1.15, nuvem: '#ffffff', estrelas: 0, exp: 0.95, densidade: 0.00008 },
  { nome: 'Pôr do sol', elev: 4, az: 255, top: '#2e3a78', hor: '#ff9358', low: '#5e3a58', sol: '#ff7a3a', luz: 2.3, hc: '#8e7cb8', hg: '#563636', hi: 0.9, nuvem: '#ffb48e', estrelas: 0.12, exp: 1.05, densidade: 0.0001 },
  { nome: 'Noite', elev: 38, az: 200, top: '#040919', hor: '#162a52', low: '#04060d', sol: '#a9bcff', luz: 0.45, hc: '#3c4f8c', hg: '#0d0f18', hi: 0.45, nuvem: '#56618a', estrelas: 1, exp: 1.25, densidade: 0.00009, lua: true },
];

export function criarCenario(renderer, Q) {
  const cena = new THREE.Scene();
  const R = rng(1234);
  const out = { cena, animar: [], noite: 0 };
  const obst = []; // prédios sólidos: { x, z, r } círculo ou { x, z, hx, hz } caixa
  out.bateObst = (x, z, raio) => obst.some((o) => o.r ? Math.hypot(x - o.x, z - o.z) < o.r + raio : Math.abs(x - o.x) < o.hx + raio && Math.abs(z - o.z) < o.hz + raio);

  // ---------- Céu ----------
  const ceuU = { top: { value: C('#2a68d0') }, hor: { value: C('#bfdcf5') }, low: { value: C('#88aed6') }, solDir: { value: new THREE.Vector3(0, 1, 0) }, solCor: { value: C('#fff') }, estrelas: { value: 0 }, lua: { value: 0 } };
  const ceuMat = new THREE.ShaderMaterial({
    uniforms: ceuU, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top,hor,low,solDir,solCor; uniform float estrelas,lua; varying vec3 vD;
      float h3(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){ vec3 d = normalize(vD); float y = d.y;
        vec3 c = mix(hor, top, pow(clamp(y,0.0,1.0), 0.45));
        c = mix(c, low, smoothstep(0.0, -0.3, y));
        float s = max(dot(d, solDir), 0.0);
        float g = lua > 0.5 ? 0.25 : 1.0;
        c += solCor * (pow(s, 6.0) * 0.22 * g + pow(s, 60.0) * 0.6 * g + pow(s, 3.0) * 0.18 * g * (1.0 - abs(y)));
        c += solCor * smoothstep(lua > 0.5 ? 0.99965 : 0.99925, lua > 0.5 ? 0.9998 : 0.9995, s) * (lua > 0.5 ? 1.6 : 6.0);
        if (estrelas > 0.0) { vec3 q = floor(d * 380.0); float st = step(0.9975, h3(q)); float tw = 0.6 + 0.4 * h3(q + 3.1);
          c += vec3(st * tw * estrelas * smoothstep(0.02, 0.25, y)); }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const ceu = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), ceuMat); ceu.renderOrder = -10; ceu.frustumCulled = false; cena.add(ceu);
  const cenaEnv = new THREE.Scene(); cenaEnv.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), ceuMat));
  const pmrem = new THREE.PMREMGenerator(renderer); let envRT = null;
  const refazEnv = () => { const rt = pmrem.fromScene(cenaEnv, 0, 0.1, 200); if (envRT) envRT.dispose(); envRT = rt; cena.environment = rt.texture; };
  out.ceu = ceu;

  // ---------- Luz ----------
  const sol = new THREE.DirectionalLight(0xffffff, 3); cena.add(sol, sol.target);
  if (Q.sombra) {
    sol.castShadow = true; sol.shadow.mapSize.set(Q.sombra, Q.sombra);
    const sc = sol.shadow.camera; sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 500;
    sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.04;
  }
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); cena.add(hemi);
  cena.fog = new THREE.FogExp2(0xbfdcf5, 0.0001);
  out.sol = sol; out.solDir = new THREE.Vector3(0, 1, 0);

  // Hora do dia: mistura suave entre predefinições
  let hAtual = null; const tmp = new THREE.Color();
  out.aplicarHora = (a, b, t) => { // a,b = índices; t = 0..1
    const A = HORAS[a], B = HORAS[b], k = smooth(0, 1, t);
    const mix = (u, x, y) => u.value.copy(C(x)).lerp(C(y), k);
    mix(ceuU.top, A.top, B.top); mix(ceuU.hor, A.hor, B.hor); mix(ceuU.low, A.low, B.low); mix(ceuU.solCor, A.sol, B.sol);
    ceuU.estrelas.value = lerp(A.estrelas, B.estrelas, k); ceuU.lua.value = k < 0.5 ? (A.lua ? 1 : 0) : (B.lua ? 1 : 0);
    const el = THREE.MathUtils.degToRad(lerp(A.elev, B.elev, k)), az = THREE.MathUtils.degToRad(lerpAng(A.az, B.az, k));
    out.solDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();
    ceuU.solDir.value.copy(out.solDir);
    sol.color.copy(ceuU.solCor.value); sol.intensity = lerp(A.luz, B.luz, k);
    hemi.color.copy(C(A.hc)).lerp(C(B.hc), k); hemi.groundColor.copy(C(A.hg)).lerp(C(B.hg), k); hemi.intensity = lerp(A.hi, B.hi, k);
    cena.fog.color.copy(ceuU.hor.value); cena.fog.density = lerp(A.densidade, B.densidade, k) * (Q.alta ? 1 : 1.4);
    renderer.toneMappingExposure = lerp(A.exp, B.exp, k);
    matNuvem.color.copy(C(A.nuvem)).lerp(C(B.nuvem), k);
    out.noite = lerp(A.lua ? 1 : 0, B.lua ? 1 : 0, k);
    luzesNoite.forEach((m) => { m.material.opacity = smooth(0.3, 0.9, out.noite); m.visible = out.noite > 0.05; });
    feixe.material.opacity = 0.02 + out.noite * 0.1;
    refazEnv();
  };
  const lerpAng = (a, b, t) => { let d = ((b - a + 540) % 360) - 180; return a + d * t; };

  // ---------- Terreno ----------
  const N = Q.alta ? 360 : 240, cel = MUNDO / N;
  const alt = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) alt[j * (N + 1) + i] = terreno(-MUNDO / 2 + i * cel, -MUNDO / 2 + j * cel).h;
  const H = (i, j) => alt[clamp(j, 0, N) * (N + 1) + clamp(i, 0, N)];
  out.chao = (x, z) => { // altura do chão como a malha desenha (bilinear)
    const fx = (x + MUNDO / 2) / cel, fz = (z + MUNDO / 2) / cel;
    if (fx < 0 || fz < 0 || fx >= N || fz >= N) return -50;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return lerp(lerp(H(i, j), H(i + 1, j), u), lerp(H(i, j + 1), H(i + 1, j + 1), u), v);
  };
  out.normalY = (x, z) => { const e = cel; const a = out.chao(x - e, z), b = out.chao(x + e, z), c = out.chao(x, z - e), d = out.chao(x, z + e); return 2 * e / Math.hypot(a - b, 2 * e, c - d); };
  const gT = new THREE.PlaneGeometry(MUNDO, MUNDO, N, N); gT.rotateX(-Math.PI / 2);
  const pT = gT.attributes.position, cores = new Float32Array(pT.count * 3), cc = [0, 0, 0], col = new THREE.Color();
  for (let k = 0; k < pT.count; k++) {
    const i = k % (N + 1), j = Math.floor(k / (N + 1)), x = pT.getX(k), z = pT.getZ(k);
    pT.setY(k, alt[k]);
    const ny = 2 * cel / Math.hypot(H(i - 1, j) - H(i + 1, j), 2 * cel, H(i, j - 1) - H(i, j + 1));
    corChao(x, z, ny, cc); col.setRGB(cc[0], cc[1], cc[2], THREE.SRGBColorSpace);
    cores[k * 3] = col.r; cores[k * 3 + 1] = col.g; cores[k * 3 + 2] = col.b;
  }
  gT.setAttribute('color', new THREE.BufferAttribute(cores, 3)); gT.computeVertexNormals();
  const detalhe = texRuido(256, 0.82, 1.0); detalhe.repeat.set(MUNDO / 50, MUNDO / 50);
  const matChao = new THREE.MeshLambertMaterial({ vertexColors: true, map: detalhe });
  if (!window.__semDet) detalharChao(matChao);
  const chao = new THREE.Mesh(gT, matChao);
  chao.receiveShadow = true; cena.add(chao);
  out.miniMapa = (canvas, alcance) => { // imagem de cima pro minimapa
    const S = canvas.width, g = canvas.getContext('2d'), img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = (x / S - 0.5) * 2 * alcance, wz = (y / S - 0.5) * 2 * alcance, h = out.chao(wx, wz), k = (y * S + x) * 4;
      let r, gg, b;
      if (h < 0) { const t = smooth(0, 30, -h); r = lerp(80, 20, t); gg = lerp(200, 70, t); b = lerp(205, 130, t); }
      else { corChao(wx, wz, out.normalY(wx, wz), cc); const s = 0.75 + 0.25 * smooth(0, 600, h); r = cc[0] * 255 * s; gg = cc[1] * 255 * s; b = cc[2] * 255 * s; }
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  };

  // ---------- Mar (cor pela profundidade: laguna turquesa, mar fundo azul) ----------
  const nTex = texOndas(); nTex.wrapS = nTex.wrapT = THREE.RepeatWrapping; nTex.repeat.set(MUNDO / 45, MUNDO / 45);
  const matAgua = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.06, metalness: 0.02, normalMap: nTex, normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 1.1 });
  const uT = { value: 0 }; out.uAgua = uT;
  matAgua.onBeforeCompile = (sh) => {
    sh.uniforms.uT = uT;
    sh.fragmentShader = 'uniform float uT;\n' + sh.fragmentShader.replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
      `vec3 n1 = texture2D( normalMap, vNormalMapUv + uT * vec2(0.012, 0.007) ).xyz * 2.0 - 1.0;
       vec3 n2 = texture2D( normalMap, vNormalMapUv * 0.27 + uT * vec2(-0.004, 0.009) ).xyz * 2.0 - 1.0;
       vec3 mapN = normalize(vec3(n1.xy + n2.xy, n1.z * n2.z));
       mapN.xy *= 1.0 - smoothstep(600.0, 5000.0, length(vViewPosition)) * 0.8;`);
  };
  const NA = Q.alta ? 220 : 150, gA = new THREE.PlaneGeometry(MUNDO, MUNDO, NA, NA); gA.rotateX(-Math.PI / 2);
  const pA = gA.attributes.position, cA = new Float32Array(pA.count * 4);
  const corAgua = (prof, o, k) => {
    const t = smooth(0, 16, prof), raso = [0.30, 0.86, 0.82], fundo = [0.02, 0.16, 0.30];
    col.setRGB(lerp(raso[0], fundo[0], t), lerp(raso[1], fundo[1], t), lerp(raso[2], fundo[2], t), THREE.SRGBColorSpace);
    const esp = smooth(1.6, 0, prof); col.lerp(tmp.setRGB(0.9, 0.97, 1), esp * 0.5); // espuma na beira
    o[k] = col.r; o[k + 1] = col.g; o[k + 2] = col.b; o[k + 3] = prof < -0.5 ? 0 : lerp(0.42, 0.93, smooth(0, 22, prof)) + esp * 0.2;
  };
  for (let k = 0; k < pA.count; k++) corAgua(-out.chao(pA.getX(k), pA.getZ(k)), cA, k * 4);
  gA.setAttribute('color', new THREE.BufferAttribute(cA, 4));
  cena.add(new THREE.Mesh(gA, matAgua));
  // mar de fora (anel até o horizonte)
  const forma = new THREE.Shape(); const L = 40000; forma.moveTo(-L, -L); forma.lineTo(L, -L); forma.lineTo(L, L); forma.lineTo(-L, L);
  const buraco = new THREE.Path(); const m = MUNDO / 2; buraco.moveTo(-m, -m); buraco.lineTo(-m, m); buraco.lineTo(m, m); buraco.lineTo(m, -m); forma.holes.push(buraco);
  const gF = new THREE.ShapeGeometry(forma); gF.rotateX(-Math.PI / 2);
  { const p = gF.attributes.position, uv = gF.attributes.uv, c4 = new Float32Array(p.count * 4);
    for (let k = 0; k < p.count; k++) { corAgua(60, c4, k * 4); uv.setXY(k, p.getX(k) / MUNDO + 0.5, -p.getZ(k) / MUNDO + 0.5); }
    gF.setAttribute('color', new THREE.BufferAttribute(c4, 4)); }
  cena.add(new THREE.Mesh(gF, matAgua));
  // lago na montanha
  { const g = new THREE.CircleGeometry(LAGO.r * 1.12, 48); g.rotateX(-Math.PI / 2); const p = g.attributes.position, c4 = new Float32Array(p.count * 4);
    for (let k = 0; k < p.count; k++) { const x = p.getX(k) + LAGO.x, z = p.getZ(k) + LAGO.z; corAgua(Math.max(0, LAGO.h - out.chao(x, z)) * 0.8, c4, k * 4); }
    g.setAttribute('color', new THREE.BufferAttribute(c4, 4));
    const lago = new THREE.Mesh(g, matAgua); lago.position.set(LAGO.x, LAGO.h, LAGO.z); cena.add(lago); }
  out.lago = LAGO;

  // ---------- Pista e aeroporto ----------
  const compr = PISTA.z1 - PISTA.z0, pista = new THREE.Mesh(new THREE.PlaneGeometry(PISTA.w, compr), new THREE.MeshLambertMaterial({ map: texPista(compr), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  pista.rotation.x = -Math.PI / 2; pista.position.set(PISTA.x, PISTA.h + 0.05, (PISTA.z0 + PISTA.z1) / 2); pista.receiveShadow = true; cena.add(pista);
  const asfalto = new THREE.MeshLambertMaterial({ color: 0x55585c, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const taxi = new THREE.Mesh(new THREE.PlaneGeometry(18, compr - 200), asfalto); taxi.rotation.x = -Math.PI / 2; taxi.position.set(PISTA.x + 85, PISTA.h + 0.04, (PISTA.z0 + PISTA.z1) / 2); taxi.receiveShadow = true; cena.add(taxi);
  for (const z of [PISTA.z0 + 120, 200, PISTA.z1 - 120]) { const t = new THREE.Mesh(new THREE.PlaneGeometry(70, 16), asfalto); t.rotation.x = -Math.PI / 2; t.position.set(PISTA.x + 52, PISTA.h + 0.04, z); cena.add(t); }
  const patio = new THREE.Mesh(new THREE.PlaneGeometry(110, 360), asfalto); patio.rotation.x = -Math.PI / 2; patio.position.set(PISTA.x + 150, PISTA.h + 0.04, 120); patio.receiveShadow = true; cena.add(patio);
  // hangares
  for (const [z, cor] of [[-20, 0xb8b2a2], [60, 0x8fa6b8], [140, 0xb8a089]]) {
    const hg = new THREE.Group(); hg.position.set(PISTA.x + 230, PISTA.h, z);
    const gc = new THREE.CylinderGeometry(18, 18, 40, 24, 1, false, -Math.PI / 2, Math.PI); gc.rotateX(-Math.PI / 2); gc.rotateY(Math.PI / 2); gc.scale(1, 0.75, 1);
    const corpo = new THREE.Mesh(gc, new THREE.MeshLambertMaterial({ color: cor })); corpo.receiveShadow = true;
    const gp = new THREE.CircleGeometry(16.5, 24, 0, Math.PI); gp.rotateY(-Math.PI / 2); gp.scale(1, 0.75, 1);
    const porta = new THREE.Mesh(gp, new THREE.MeshLambertMaterial({ color: 0x3d3f44 })); porta.position.x = -20.15;
    hg.add(corpo, porta); cena.add(hg); obst.push({ x: PISTA.x + 230, z, hx: 20, hz: 18 });
  }
  // torre de controle
  { const t = new THREE.Group(); t.position.set(PISTA.x + 170, PISTA.h, 330);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4, 24, 12), new THREE.MeshLambertMaterial({ color: 0xece6d8 })); base.position.y = 12;
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 5, 5, 8), new THREE.MeshStandardMaterial({ color: 0x5c8fb0, metalness: 0.8, roughness: 0.1 })); cab.position.y = 26.5;
    const tp = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.8, 8), new THREE.MeshLambertMaterial({ color: 0xc8382e })); tp.position.y = 29.4;
    const an = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 4), new THREE.MeshLambertMaterial({ color: 0xffffff })); an.position.y = 33.5;
    // radar giratório
    const radar = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 0.4), new THREE.MeshLambertMaterial({ color: 0xffffff })); radar.position.y = 31;
    out.animar.push((t) => { radar.rotation.y = t * 1.5; });
    t.add(base, cab, tp, an, radar); cena.add(t); obst.push({ x: PISTA.x + 170, z: 330, r: 4.2 }); }
  // biruta (aponta para o vento e balança)
  { const b = new THREE.Group(); b.position.set(PISTA.x - 50, PISTA.h, PISTA.z1 - 260);
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 7, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd })); poste.position.y = 3.5; b.add(poste);
    const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d'); for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#fff' : '#ff6a1a'; g.fillRect(i * 13, 0, 13, 8); }
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const ge = new THREE.CylinderGeometry(0.6, 0.25, 3.5, 12, 1, true); ge.rotateZ(Math.PI / 2); ge.translate(1.75, 0, 0);
    const meia = new THREE.Mesh(ge, new THREE.MeshLambertMaterial({ map: tx, side: THREE.DoubleSide })); meia.position.y = 6.8; b.add(meia);
    out.animar.push((t) => { meia.rotation.y = 0.6 + Math.sin(t * 0.7) * 0.15; meia.rotation.z = -0.15 + Math.sin(t * 3.1) * 0.05; });
    cena.add(b); }
  // luzes da pista (só aparecem à noite)
  const luzesNoite = [];
  { const ps = [], cs = [];
    for (let z = PISTA.z0; z <= PISTA.z1; z += 50) for (const s of [-1, 1]) { ps.push(PISTA.x + s * (PISTA.w / 2 + 1), PISTA.h + 0.5, z); cs.push(1, 0.95, 0.8); }
    for (let x = -20; x <= 20; x += 5) { ps.push(x, PISTA.h + 0.5, PISTA.z0 - 1); cs.push(1, 0.2, 0.2); ps.push(x, PISTA.h + 0.5, PISTA.z1 + 1); cs.push(0.2, 1, 0.3); }
    for (let k = 1; k <= 8; k++) for (const x of [-6, 0, 6]) { ps.push(x, PISTA.h + 1.5, PISTA.z1 + 30 * k); cs.push(1, 1, 0.9); } // luzes de aproximação
    luzesNoite.push(pontosLuz(ps, cs, 7)); }

  // ---------- Árvores ----------
  const geoPinho = juntar([[cil(0.35, 0.5, 3, 5).translate(0, 1.5, 0), '#5a3b25'], [cone(3, 5.5, 7).translate(0, 5, 0), '#2d5a2e'], [cone(2.3, 4.5, 7).translate(0, 7.5, 0), '#326636'], [cone(1.4, 3.5, 7).translate(0, 9.8, 0), '#3a7040']]);
  const geoArv = juntar([[cil(0.35, 0.55, 4, 5).translate(0, 2, 0), '#6a4a2e'], [new THREE.IcosahedronGeometry(3.4, 1).scale(1, 0.85, 1).translate(0, 6.2, 0), '#4b8a35'], [new THREE.IcosahedronGeometry(2.4, 1).translate(1.6, 7.6, 0.8), '#5a9a3c'], [new THREE.IcosahedronGeometry(2.2, 1).translate(-1.5, 7.2, -1), '#468032']]);
  const coq = [];
  for (let i = 0; i < 5; i++) coq.push([cil(0.32 - i * 0.03, 0.36 - i * 0.03, 2.2, 6).rotateZ(0.06 * i).translate(i * 0.25, 1.1 + i * 2.1, 0), '#8a6a48']);
  for (let i = 0; i < 8; i++) { const f = new THREE.BoxGeometry(0.9, 0.08, 4.6); f.translate(0, 0, 2.3); f.rotateX(0.35); f.rotateY(i * Math.PI / 4); f.translate(1.2, 10.6, 0); coq.push([f, i % 2 ? '#3f8a3a' : '#4fa043']); }
  for (let i = 0; i < 3; i++) coq.push([new THREE.SphereGeometry(0.35, 6, 4).translate(1.2 + Math.cos(i * 2.1) * 0.5, 10.2, Math.sin(i * 2.1) * 0.5), '#5a4024']);
  const geoCoq = juntar(coq);
  const matArv = new THREE.MeshLambertMaterial({ vertexColors: true });
  const tipos = [{ g: geoPinho, max: Q.alta ? 3000 : 1500, l: [] }, { g: geoArv, max: Q.alta ? 3200 : 1600, l: [] }, { g: geoCoq, max: Q.alta ? 900 : 500, l: [] }];
  const vila = LUGARES.find((l) => l.id === 'vila');
  for (let k = 0; k < 120000; k++) {
    const x = (R() - 0.5) * MUNDO * 0.8, z = (R() - 0.5) * MUNDO * 0.8, t = terreno(x, z), h = out.chao(x, z);
    if (h < 1.5 || (Math.abs(x - PISTA.x) < 320 && z > PISTA.z0 - 300 && z < PISTA.z1 + 300)) continue;
    if (Math.hypot(x - vila.x, z - vila.z) < 260 || Math.hypot(x - FAROL.x, z - FAROL.z) < 40) continue;
    const ny = out.normalY(x, z), mata = fbm(x * 0.003 + 50, z * 0.003, 3);
    let tp = -1;
    if (t.mesa > 0.3) { if (h < 8 && R() < 0.3) tp = 1; }
    else if (h < 9 && ny > 0.9 && R() < 0.6) tp = 2;
    else if (h > 130 && h < 470 && ny > 0.78 && mata > 0.42) tp = 0;
    else if (h >= 9 && h < 200 && ny > 0.86 && mata > 0.5) tp = 1;
    else if (h >= 9 && h < 200 && ny > 0.9 && R() < 0.04) tp = 1;
    if (tp < 0 || tipos[tp].l.length >= tipos[tp].max) continue;
    tipos[tp].l.push([x, h - 0.3, z, 0.7 + R() * 0.7, R() * 6.28]);
  }
  const tmp2 = new THREE.Vector3();
  const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  for (const tp of tipos) {
    const im = new THREE.InstancedMesh(tp.g, matArv, tp.l.length);
    tp.l.forEach(([x, y, z, s, r], i) => { q.setFromEuler(e.set((R() - 0.5) * 0.08, r, (R() - 0.5) * 0.08)); mt.compose(ps.set(x, y, z), q, sc.set(s, s * (0.85 + R() * 0.3), s)); im.setMatrixAt(i, mt); im.setColorAt(i, col.setHSL(0.0, 0, 0.82 + R() * 0.36)); });
    im.receiveShadow = true; cena.add(im);
  }

  // ---------- Vila das Flores ----------
  { const casas = [], tetos = [], luzP = [], luzC = [];
    const cores = ['#f5e6c8', '#f2c2a4', '#bfe0d8', '#f6d36b', '#e8a0a8', '#a8c8f0', '#ffffff', '#f0b46a'];
    for (let k = 0; k < 400 && casas.length < (Q.alta ? 70 : 45); k++) {
      const a = R() * 6.28, r = 30 + Math.sqrt(R()) * 230, x = vila.x + Math.cos(a) * r, z = vila.z + Math.sin(a) * r, h = out.chao(x, z);
      if (h < 4 || out.normalY(x, z) < 0.94 || casas.some((c) => Math.hypot(c[0] - x, c[2] - z) < 16)) continue;
      const w = 7 + R() * 4, d = 8 + R() * 5, alt = 5 + R() * 3, rot = Math.round(a / (Math.PI / 2)) * Math.PI / 2 + (R() - 0.5) * 0.3;
      casas.push([x, h, z, w, alt, d, rot, cores[Math.floor(R() * cores.length)]]); obst.push({ x, z, r: Math.max(w, d) * 0.5 });
      luzP.push(x + Math.cos(rot) * (w / 2 + 0.3), h + 2.5, z - Math.sin(rot) * (w / 2 + 0.3)); luzC.push(1, 0.75, 0.4);
    }
    const gC = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const imC = new THREE.InstancedMesh(gC, new THREE.MeshLambertMaterial(), casas.length);
    const imT = new THREE.InstancedMesh(new THREE.ConeGeometry(0.78, 1, 4).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial(), casas.length);
    casas.forEach(([x, h, z, w, a, d, r, c], i) => {
      q.setFromAxisAngle(ps.set(0, 1, 0), r);
      mt.compose(ps.set(x, h - 1, z), q, sc.set(w, a + 1, d)); imC.setMatrixAt(i, mt); imC.setColorAt(i, col.set(c));
      mt.compose(ps.set(x, h + a + (3 + w * 0.2) / 2, z), q, sc.set(w * 1.15, 3 + w * 0.2, d * 1.15)); imT.setMatrixAt(i, mt); imT.setColorAt(i, col.set(R() < 0.7 ? '#b4532e' : '#8a3e2a'));
    });
    imC.castShadow = imT.castShadow = false; imC.receiveShadow = true; cena.add(imC, imT);
    // igreja com torre e sino
    const hI = out.chao(vila.x, vila.z), ig = new THREE.Group(); ig.position.set(vila.x, hI - 1, vila.z);
    const branco = new THREE.MeshLambertMaterial({ color: 0xfbf6ea }), telha = new THREE.MeshLambertMaterial({ color: 0xa8492a }), azul = new THREE.MeshLambertMaterial({ color: 0x2c64b0 });
    const nave = new THREE.Mesh(new THREE.BoxGeometry(12, 10, 22), branco); nave.position.y = 5;
    const tn = new THREE.Mesh(new THREE.ConeGeometry(9.5, 5, 4).rotateY(Math.PI / 4), telha); tn.scale.set(0.9, 1, 1.65); tn.position.y = 12.5;
    const torre = new THREE.Mesh(new THREE.BoxGeometry(6, 22, 6), branco); torre.position.set(0, 11, -13);
    const cup = new THREE.Mesh(new THREE.ConeGeometry(4.6, 7, 4).rotateY(Math.PI / 4), azul); cup.position.set(0, 25.5, -13);
    const cruz = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), branco); cruz.position.set(0, 30, -13);
    const cruz2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.3), branco); cruz2.position.set(0, 30.4, -13);
    const porta = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 0.3), azul); porta.position.set(0, 2.5, 11.1);
    const praca = new THREE.Mesh(new THREE.CircleGeometry(34, 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd8c8a8, polygonOffset: true, polygonOffsetFactor: -2 })); praca.position.y = 1.05;
    ig.add(nave, tn, torre, cup, cruz, cruz2, porta, praca); cena.add(ig); obst.push({ x: vila.x, z: vila.z - 2, hx: 6, hz: 14 });
    luzesNoite.push(pontosLuz(luzP, luzC, 6)); }

  // ---------- Turbinas de vento nos morros ----------
  { const cand = [];
    for (let k = 0; k < 900; k++) { const x = (R() - 0.5) * 3600, z = (R() - 0.5) * 3600 + 200, h = out.chao(x, z);
      if (h > 60 && terreno(x, z).mtn < 0.3 && terreno(x, z).mesa < 0.1 && Math.abs(x) > 400 && Math.hypot(x - vila.x, z - vila.z) > 400) cand.push([x, h, z]); }
    cand.sort((a, b) => b[1] - a[1]); const esc = [];
    for (const c of cand) { if (esc.length >= 8) break; if (esc.every((o) => Math.hypot(o[0] - c[0], o[2] - c[2]) > 220)) esc.push(c); }
    const bco = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 }), luzes = [], cl = [];
    for (const [x, h, z] of esc) {
      const t = new THREE.Group(); t.position.set(x, h - 1, z); t.rotation.y = 1.1;
      const torre = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.2, 62, 10), bco); torre.position.y = 31;
      const nac = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 8), bco); nac.position.set(0, 62, 1);
      const rot = new THREE.Group(); rot.position.set(0, 62, -3.2);
      const cubo = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), bco); cubo.scale.z = 1.4; rot.add(cubo);
      for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 28, 0.4).translate(0, 15, 0), bco); p.rotation.z = i * Math.PI * 2 / 3; rot.add(p); }
      t.add(torre, nac, rot); cena.add(t); obst.push({ x, z, r: 2.4 }); const fase = R() * 6;
      out.animar.push((tt) => { rot.rotation.z = tt * 1.4 + fase; });
      luzes.push(x, h + 64, z); cl.push(1, 0.1, 0.1);
    }
    luzesNoite.push(pontosLuz(luzes, cl, 10)); }

  // ---------- Farol ----------
  const feixe = (() => {
    const h = out.chao(FAROL.x, FAROL.z), f = new THREE.Group(); f.position.set(FAROL.x, h - 1, FAROL.z); cena.add(f);
    const c = document.createElement('canvas'); c.width = 16; c.height = 256; const g = c.getContext('2d');
    for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#d42a2a'; g.fillRect(0, i * 256 / 7, 16, 256 / 7 + 1); }
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const torre = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 5.2, 30, 20), new THREE.MeshLambertMaterial({ map: tx })); torre.position.y = 15;
    const gal = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 0.6, 20), new THREE.MeshLambertMaterial({ color: 0x222222 })); gal.position.y = 30.3;
    const vid = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 4, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c0 })); vid.position.y = 32.6;
    const dom = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xc02020 })); dom.position.y = 34.6;
    const casa = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), new THREE.MeshLambertMaterial({ color: 0xf8f4ea })); casa.position.set(10, 2.5, 4);
    const tt = new THREE.Mesh(new THREE.ConeGeometry(7.5, 3.5, 4).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial({ color: 0xc02020 })); tt.scale.set(1, 1, 0.8); tt.position.set(10, 6.7, 4);
    f.add(torre, gal, vid, dom, casa, tt); obst.push({ x: FAROL.x, z: FAROL.z, r: 5.4 }, { x: FAROL.x + 10, z: FAROL.z + 4, hx: 5, hz: 4 });
    const gc = document.createElement('canvas'); gc.width = 4; gc.height = 128; const gg = gc.getContext('2d'); const gr = gg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,240,190,0)'); gr.addColorStop(1, 'rgba(255,240,190,1)'); gg.fillStyle = gr; gg.fillRect(0, 0, 4, 128);
    const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const rot = new THREE.Group(); rot.position.y = 32.6; f.add(rot);
    for (const s of [1, -1]) { const cg = new THREE.ConeGeometry(14, 260, 16, 1, true); cg.translate(0, -130, 0); cg.rotateZ(s * Math.PI / 2); rot.add(new THREE.Mesh(cg, mat)); }
    out.animar.push((t) => { rot.rotation.y = t * 0.9; });
    const luz = pontosLuz([FAROL.x, h + 32, FAROL.z], [1, 0.95, 0.7], 30); luzesNoite.push(luz);
    return { material: mat };
  })();

  // ---------- Balões ----------
  { const bal = LUGARES.find((l) => l.id === 'baloes'), paletas = [['#e63946', '#ffd166'], ['#06d6a0', '#ffffff', '#118ab2'], ['#ff7b00', '#ffd000', '#ff3c00'], ['#7b2cbf', '#ffffff'], ['#3a86ff', '#ffbe0b'], ['#f15bb5', '#fee440', '#00bbf9'], ['#2a9d8f', '#e9c46a', '#e76f51'], ['#ffffff', '#d62828'], ['#8ac926', '#1982c4', '#ffca3a'], ['#fb5607', '#3a86ff']];
    const perfilB = [[1.2, 0], [2.6, 2], [4.8, 4.6], [6.8, 7.6], [7.8, 10.6], [7.9, 12.6], [7.2, 15], [5.2, 17.2], [2.6, 18.4], [0.01, 18.8]].map(([r, y]) => new THREE.Vector2(r, y));
    const gB = new THREE.LatheGeometry(perfilB, 24);
    const cesto = new THREE.MeshLambertMaterial({ color: 0x8a5a2b }), corda = new THREE.LineBasicMaterial({ color: 0x3a3a3a });
    for (let i = 0; i < 10; i++) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'), pal = paletas[i];
      for (let k = 0; k < 12; k++) { g.fillStyle = pal[k % pal.length]; g.fillRect(k * 256 / 12, 0, 256 / 12 + 1, 64); }
      if (i % 2) { g.fillStyle = pal[1]; g.fillRect(0, 26, 256, 8); }
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
      const b = new THREE.Group();
      const env = new THREE.Mesh(gB, new THREE.MeshStandardMaterial({ map: tx, roughness: 0.7, side: THREE.DoubleSide })); env.castShadow = true; b.add(env);
      const cx = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 1.8), cesto); cx.position.y = -4.6; b.add(cx);
      const pts = []; for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [0.85, 0.85], [-0.85, 0.85]]) pts.push(new THREE.Vector3(x, -4, z), new THREE.Vector3(x * 1.4, 0, z * 1.4));
      b.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), corda));
      const chama = brilhoSprite('#ffae3a', 2.5); chama.position.y = -1.8; b.add(chama);
      const cxr = bal.x + (R() - 0.5) * 1200, czr = bal.z + (R() - 0.5) * 1000, rr = 60 + R() * 150, al = 90 + R() * 260, vel = 0.01 + R() * 0.015, fase = R() * 6.28, esc = 0.9 + R() * 0.5;
      b.scale.setScalar(esc); cena.add(b);
      out.animar.push((t) => {
        const a = fase + t * vel, x = cxr + Math.cos(a) * rr, z = czr + Math.sin(a) * rr;
        b.position.set(x, Math.max(out.chao(x, z), 0) + al + Math.sin(t * 0.3 + fase) * 8, z); b.rotation.y = t * 0.05 + fase;
        const f = Math.sin(t * 0.7 + fase * 3) > 0.6; chama.visible = f; chama.scale.setScalar(f ? 2 + Math.random() * 1.2 : 0.01);
      });
    } }

  // ---------- Barquinhos a vela ----------
  { const cascoG = new THREE.BoxGeometry(2.4, 1.2, 8, 2, 1, 4); { const p = cascoG.attributes.position; for (let k = 0; k < p.count; k++) { const z = p.getZ(k), y = p.getY(k); let x = p.getX(k); if (z < -1) x *= 1 - (-1 - z) / 3.2; if (y < 0) x *= 0.6; p.setX(k, x); } cascoG.computeVertexNormals(); }
    const velaG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1, -0.5), new THREE.Vector3(0, 10, -0.3), new THREE.Vector3(0, 1, 3.4)]); velaG.computeVertexNormals();
    const bujaG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.2, -0.9), new THREE.Vector3(0, 9, -0.6), new THREE.Vector3(0, 0.8, -4)]); bujaG.computeVertexNormals();
    const rotas = [[ATOL.x, ATOL.z, 300], [ATOL.x, ATOL.z, 380], [ATOL.x + 200, ATOL.z - 100, 150], [FAROL.x - 300, FAROL.z - 150, 200], [-300, 2600, 250], [1400, 2000, 300], [-1800, 1700, 260], [3500, 1600, 260]];
    rotas.forEach(([cx, cz, r], i) => {
      const b = new THREE.Group();
      b.add(new THREE.Mesh(cascoG, new THREE.MeshLambertMaterial({ color: ['#ffffff', '#1f4e8c', '#c0392b', '#f4d03f'][i % 4] })));
      const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 10, 5), new THREE.MeshLambertMaterial({ color: 0x8a6a48 })); mastro.position.set(0, 5.4, -0.4); b.add(mastro);
      const mv = new THREE.MeshLambertMaterial({ color: i % 3 ? 0xfdfbf5 : 0xffcf5a, side: THREE.DoubleSide });
      b.add(new THREE.Mesh(velaG, mv), new THREE.Mesh(bujaG, mv)); cena.add(b);
      const vel = (0.012 + R() * 0.01) * (i % 2 ? 1 : -1), fase = R() * 6.28;
      out.animar.push((t) => { const a = fase + t * vel; b.position.set(cx + Math.cos(a) * r, 0.3 + Math.sin(t * 1.3 + fase) * 0.15, cz + Math.sin(a) * r);
        b.rotation.set(Math.sin(t * 1.1 + fase) * 0.04, -a + (vel > 0 ? Math.PI : 0), 0.18 * Math.sign(vel) + Math.sin(t * 0.9) * 0.05); });
    }); }

  // ---------- Gaivotas ----------
  { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.3), new THREE.Vector3(-1.2, 0.35, 0.2), new THREE.Vector3(0, 0, 0.4), new THREE.Vector3(0, 0, -0.3), new THREE.Vector3(0, 0, 0.4), new THREE.Vector3(1.2, 0.35, 0.2)]); g.computeVertexNormals();
    const n = 36, im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xf6f6f6, side: THREE.DoubleSide }), n); im.frustumCulled = false; cena.add(im);
    const aves = Array.from({ length: n }, (_, i) => { const c = i < 18 ? [FAROL.x, FAROL.z] : [ATOL.x, ATOL.z]; return { cx: c[0] + (R() - 0.5) * 200, cz: c[1] + (R() - 0.5) * 200, r: 40 + R() * 120, h: 30 + R() * 60, v: (0.15 + R() * 0.15) * (R() < 0.5 ? 1 : -1), f: R() * 6.28 }; });
    out.animar.push((t) => { aves.forEach((a, i) => { const ang = a.f + t * a.v; ps.set(a.cx + Math.cos(ang) * a.r, a.h + Math.sin(t + a.f) * 4, a.cz + Math.sin(ang) * a.r);
      q.setFromEuler(e.set(0, -ang + (a.v > 0 ? 0 : Math.PI), a.v > 0 ? 0.3 : -0.3)); const fl = Math.sin(t * 7 + a.f * 5); mt.compose(ps, q, sc.set(2.2, 2.2 * fl, 2.2)); im.setMatrixAt(i, mt); });
      im.instanceMatrix.needsUpdate = true; }); }

  // ---------- Nuvens ----------
  const matNuvem = new THREE.SpriteMaterial({ map: texNuvem(), transparent: true, depthWrite: false, opacity: 0.92 });
  { const grupos = Q.alta ? 70 : 40;
    for (let k = 0; k < grupos; k++) {
      const cx = (R() - 0.5) * MUNDO * 1.1, cz = (R() - 0.5) * MUNDO * 1.1, cy = 650 + R() * 600, n = 5 + Math.floor(R() * 7), larg = 120 + R() * 220;
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(matNuvem); const tam = 150 + R() * 220;
        s.position.set(cx + (R() - 0.5) * larg * 2, cy + (R() - 0.5) * 50 + (i % 3) * 25, cz + (R() - 0.5) * larg); s.scale.set(tam * 1.4, tam, 1);
        s.material = matNuvem; cena.add(s);
      }
    } }


  // ---------- Pedras grandes espalhadas ----------
  { const g = new THREE.IcosahedronGeometry(1, 1); { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.75 + 0.5 * Math.abs(Math.sin(p.getX(i) * 7.1 + p.getZ(i) * 3.3)); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); } g.computeVertexNormals(); }
    const n = Q.alta ? 900 : 500, im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xffffff }), n); let k = 0;
    for (let t = 0; t < 40000 && k < n; t++) {
      const x = (R() - 0.5) * MUNDO * 0.75, z = (R() - 0.5) * MUNDO * 0.75, h = out.chao(x, z); if (h < 0.5) continue;
      const ny = out.normalY(x, z), tr = terreno(x, z), praia = h < 5 && R() < 0.08, morro = (tr.mtn > 0.4 || tr.mesa > 0.4) && ny < 0.9 && R() < 0.5, campo = h > 10 && R() < 0.01;
      if (!(praia || morro || campo)) continue; if (Math.abs(x - PISTA.x) < 300 && z > PISTA.z0 - 200 && z < PISTA.z1 + 200) continue;
      const s = (morro ? 2 + R() * 6 : 0.8 + R() * 2.2);
      q.setFromEuler(e.set(R() * 3, R() * 6.28, R() * 3)); mt.compose(ps.set(x, h - s * 0.25, z), q, sc.set(s, s, s)); im.setMatrixAt(k, mt);
      im.setColorAt(k, tr.mesa > 0.4 ? col.setRGB(0.55 + R() * 0.1, 0.27, 0.16) : col.setRGB(0.42 + R() * 0.12, 0.41 + R() * 0.1, 0.39 + R() * 0.08)); k++;
    }
    im.count = k; im.receiveShadow = true; cena.add(im); }

  // ---------- Plantações perto da vila (retalhos coloridos que seguem o chão) ----------
  { const cores = ['#d8b64a', '#9fbf4a', '#7a5a3a', '#c9d65a', '#e0c070', '#5f8f3a'];
    const texF = (cor) => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = cor; g.fillRect(0, 0, 64, 64);
      g.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 64; i += 8) g.fillRect(0, i, 64, 3); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const mats = cores.map((c) => new THREE.MeshLambertMaterial({ map: texF(c), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    let feitos = 0; const campos = [];
    for (let t = 0; t < 400 && feitos < (Q.alta ? 34 : 22); t++) {
      const a = R() * 6.28, r = 300 + R() * 900, cx = vila.x + Math.cos(a) * r, cz = vila.z + Math.sin(a) * r, h = out.chao(cx, cz);
      if (campos.some(([a, b]) => Math.hypot(a - cx, b - cz) < 130) || Math.hypot(cx - vila.x, cz - vila.z) < 290 || h < 6 || h > 150 || out.normalY(cx, cz) < 0.95 || (Math.abs(cx - PISTA.x) < 350 && cz > PISTA.z0 - 250 && cz < PISTA.z1 + 250)) continue;
      const w = 60 + R() * 70, d = 80 + R() * 90, rot = R() * 3.14, g = new THREE.PlaneGeometry(w, d, 6, 6); g.rotateX(-Math.PI / 2); g.rotateY(rot);
      const p = g.attributes.position; let ok = true;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) + cx, z = p.getZ(i) + cz, hh = out.chao(x, z); if (hh < 4) ok = false; p.setY(i, hh + 0.25); p.setX(i, x); p.setZ(i, z); }
      if (!ok) continue; g.computeVertexNormals(); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 40, uv.getY(i) * d / 40);
      const m = new THREE.Mesh(g, mats[Math.floor(R() * mats.length)]); m.receiveShadow = true; cena.add(m); feitos++; campos.push([cx, cz]);
    } }

  // ---------- Estrada do aeroporto até a vila ----------
  { const pts = [[PISTA.x + 150, 320], [330, 420], [520, 470], [680, 520], [vila.x - 20, vila.z]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curva = new THREE.CatmullRomCurve3(pts), N = 160, larg = 7, pos = [], uv = [], idx = [];
    const c = document.createElement('canvas'); c.width = 32; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#4a4c50'; g.fillRect(0, 0, 32, 128); g.fillStyle = '#d8d0b0'; g.fillRect(1, 0, 2, 128); g.fillRect(29, 0, 2, 128); g.fillStyle = '#f2d050'; g.fillRect(15, 0, 2, 70);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 4;
    const comp = curva.getLength();
    for (let i = 0; i <= N; i++) { const t = i / N, p = curva.getPointAt(t), tg = curva.getTangentAt(t), lado = tmp2.set(-tg.z, 0, tg.x).normalize();
      for (const s of [-1, 1]) { const x = p.x + lado.x * s * larg / 2, z = p.z + lado.z * s * larg / 2; pos.push(x, out.chao(x, z) + 0.2, z); uv.push(s < 0 ? 0 : 1, t * comp / 12); }
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx); ge.computeVertexNormals();
    const rua = new THREE.Mesh(ge, new THREE.MeshLambertMaterial({ map: tx, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide })); rua.receiveShadow = true; cena.add(rua);
    // postes de luz ao longo da estrada
    const postes = [], cp = [];
    for (let i = 1; i < 12; i++) { const p = curva.getPointAt(i / 12), tg = curva.getTangentAt(i / 12), x = p.x - tg.z * 6, z = p.z + tg.x * 6, h = out.chao(x, z);
      const po = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7, 5), new THREE.MeshLambertMaterial({ color: 0x555a60 })); po.position.set(x, h + 3.5, z); cena.add(po); postes.push(x, h + 7.2, z); cp.push(1, 0.8, 0.5); }
    luzesNoite.push(pontosLuz(postes, cp, 9)); }

  // ---------- Ponte em arco sobre o rio do cânion ----------
  { const bx = 3350, cz = CANION(bx); let z1 = cz, z2 = cz; const deck = 205;
    while (out.chao(bx, z1) < deck - 3 && z1 > cz - 500) z1 -= 4; while (out.chao(bx, z2) < deck - 3 && z2 < cz + 500) z2 += 4;
    const L = z2 - z1 + 20, mid = (z1 + z2) / 2, ponte = new THREE.Group(); ponte.position.set(bx, deck, mid); cena.add(ponte);
    const aco = new THREE.MeshStandardMaterial({ color: 0xc8402e, roughness: 0.5, metalness: 0.4 }), conc = new THREE.MeshLambertMaterial({ color: 0x9a9690 });
    const tab = new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, L), conc); ponte.add(tab);
    const asf = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, L), new THREE.MeshLambertMaterial({ color: 0x3a3c40 })); asf.position.y = 0.85; ponte.add(asf);
    const arcoR = L / 2 * 0.95;
    for (const s of [-1, 1]) {
      const ka = 0.5, base = -1.5 - arcoR * ka; // arco convexo: pés nas paredes, topo encostando no tabuleiro
      const a = new THREE.Mesh(new THREE.TorusGeometry(arcoR, 1.6, 8, 48, Math.PI), aco); a.rotation.y = Math.PI / 2; a.scale.set(1, ka, 1); a.position.set(s * 5, base, 0); ponte.add(a);
      const gr = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, L), aco); gr.position.set(s * 5.8, 1.5, 0); ponte.add(gr);
      for (let k = -8; k <= 8; k++) { const z = k * L / 18, ya = base + Math.sqrt(Math.max(0, arcoR * arcoR - z * z)) * ka, h = -1 - ya; if (h < 1.5) continue;
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), aco); pil.position.set(s * 5, ya + h / 2, z); ponte.add(pil); }
    }
    ponte.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } }); out.ponte = ponte.position; }

  // ---------- Cachoeira caindo do planalto no rio ----------
  const cachoeira = (() => {
    const bx = 2650, cz = CANION(bx); let zt = cz + 30; while (out.chao(bx, zt) < 160 && zt < cz + 400) zt += 3;
    const N = 30, larg = 26, pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) { const z = zt - (zt - cz + 10) * (i / N), h = Math.max(out.chao(bx, z), 0) + 1.2;
      for (const s of [-1, 1]) { pos.push(bx + s * larg / 2 * (1 + i / N * 0.4), h, z); uv.push(s < 0 ? 0 : 1, i / N * 4); }
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx); ge.computeVertexNormals();
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d'); g.fillStyle = 'rgba(200,230,240,0.55)'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + R() * 0.6})`; g.fillRect(R() * 64, R() * 256, 1 + R() * 2.5, 10 + R() * 50); }
    const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    const m = new THREE.Mesh(ge, new THREE.MeshLambertMaterial({ map: tx, transparent: true, side: THREE.DoubleSide, depthWrite: false, emissive: 0x405058 })); cena.add(m);
    out.animar.push((t) => { tx.offset.y = t * 0.9; });
    return { pe: new THREE.Vector3(bx, 0.5, cz) };
  })();
  out.cachoeira = cachoeira.pe;

  // ---------- Grama, flores e pedrinhas só ao redor da câmera ----------
  { const CEL = 5, LADO = Q.alta ? 48 : 34, n = LADO * LADO;
    const tufo = juntar([0, 1, 2, 3, 4].map((k) => { const g = new THREE.ConeGeometry(0.06, 0.55 + (k % 3) * 0.18, 3); g.translate(Math.cos(k * 1.3) * 0.12, 0.3, Math.sin(k * 1.3) * 0.12); g.rotateZ((k - 2) * 0.18); return [g, k % 2 ? '#5d8f35' : '#71a23e']; }));
    const flor = juntar([[new THREE.ConeGeometry(0.03, 0.45, 3).translate(0, 0.22, 0), '#4f7f2e'], [new THREE.IcosahedronGeometry(0.09, 0).translate(0, 0.47, 0), '#ffffff']]);
    const pedra = new THREE.IcosahedronGeometry(0.3, 0);
    const imT = new THREE.InstancedMesh(tufo, new THREE.MeshLambertMaterial({ vertexColors: true }), n);
    const imF = new THREE.InstancedMesh(flor, new THREE.MeshLambertMaterial({ vertexColors: true }), n);
    const imP = new THREE.InstancedMesh(pedra, new THREE.MeshLambertMaterial({ color: 0x8a8580 }), n);
    for (const im of [imT, imF, imP]) { im.frustumCulled = false; im.count = 0; cena.add(im); }
    const coresF = ['#ffffff', '#ffd23e', '#ff6fa0', '#b48cff', '#ff5a3a'].map((c) => new THREE.Color(c));
    const hsh = (a, b, s) => { const v = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
    let ultCx = 1e9, ultCz = 1e9;
    out.atualizarPerto = (cp) => {
      const solo = cp.y - Math.max(0, out.chao(cp.x, cp.z));
      const vis = solo < 60; imT.visible = imF.visible = imP.visible = vis; if (!vis) return;
      const cx = Math.round(cp.x / CEL), cz = Math.round(cp.z / CEL); if (cx === ultCx && cz === ultCz) return; ultCx = cx; ultCz = cz;
      let nt = 0, nf = 0, np = 0;
      for (let j = 0; j < LADO; j++) for (let i = 0; i < LADO; i++) {
        const gx = cx + i - LADO / 2, gz = cz + j - LADO / 2, x = (gx + hsh(gx, gz, 1)) * CEL, z = (gz + hsh(gx, gz, 2)) * CEL, h = out.chao(x, z);
        if (h < 2.5 || h > 430 || (Math.abs(x - PISTA.x) < 30 && z > PISTA.z0 && z < PISTA.z1)) continue;
        const ny = out.normalY(x, z), tr = terreno(x, z); if (ny < 0.85 || tr.mesa > 0.3) continue;
        const r = hsh(gx, gz, 3), s = 0.7 + hsh(gx, gz, 4) * 0.9;
        q.setFromEuler(e.set(0, r * 6.28, 0)); mt.compose(ps.set(x, h - 0.05, z), q, sc.set(s, s * (0.8 + r * 0.6), s));
        if (r < 0.06) { imP.setMatrixAt(np++, mt); }
        else if (r < 0.2 && h < 200) { imF.setMatrixAt(nf, mt); imF.setColorAt(nf++, coresF[Math.floor(hsh(gx, gz, 5) * 5)]); }
        else { imT.setMatrixAt(nt, mt); imT.setColorAt(nt++, col.setHSL(0.22 + r * 0.06, 0.4, 0.42 + r * 0.25)); }
      }
      for (const [im, c] of [[imT, nt], [imF, nf], [imP, np]]) { im.count = c; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    };
  }
  luzesNoite.forEach((p) => cena.add(p));
  out.luzesNoite = luzesNoite;
  return out;
}

// ---------- utilidades ----------
const cil = (a, b, h, n) => new THREE.CylinderGeometry(a, b, h, n);
const cone = (r, h, n) => new THREE.ConeGeometry(r, h, n);
function juntar(lista) { // junta geometrias com cor por vértice
  const pos = [], nor = [], cor = [], c = new THREE.Color();
  for (const [g0, hex] of lista) {
    const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); c.set(hex);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    for (let i = 0; i < g.attributes.position.count; i++) cor.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  return g;
}
let texBrilho = null;
function brilhoTex() {
  if (texBrilho) return texBrilho;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (texBrilho = new THREE.CanvasTexture(c));
}
function brilhoSprite(cor, tam) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: brilhoTex(), color: cor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.scale.setScalar(tam); return s; }
function pontosLuz(pos, cor, tam) { // pontos de luz que só acendem à noite
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: tam, map: brilhoTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, sizeAttenuation: true, fog: false }));
  p.visible = false; return p;
}
function texRuido(S, a, b) {
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { const x = i % S, y = Math.floor(i / S); const v = (a + (b - a) * (0.55 * Math.random() + 0.45 * (0.5 + 0.5 * Math.sin(x * 0.2) * Math.sin(y * 0.17)))) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function texOndas() { // mapa de normais repetível: soma de senos com frequência inteira
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), img = g.createImageData(S, S);
  const ondas = []; const r = rng(7); for (let i = 0; i < 14; i++) ondas.push([Math.round((r() - 0.5) * 10), Math.round((r() - 0.5) * 10), r() * 6.28, 1 / (1 + i * 0.4)]);
  const h = (x, y) => ondas.reduce((s, [fx, fy, p, a]) => s + a * Math.sin((fx * x + fy * y) / S * 6.283 + p), 0);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1), n = Math.hypot(dx, dy, 2), k = (y * S + x) * 4;
    img.data[k] = (-dx / n * 0.5 + 0.5) * 255; img.data[k + 1] = (dy / n * 0.5 + 0.5) * 255; img.data[k + 2] = (2 / n * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0); return new THREE.CanvasTexture(c);
}
function texNuvem() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), r = rng(99);
  for (let i = 0; i < 26; i++) {
    const x = S * (0.22 + r() * 0.56), y = S * (0.35 + r() * 0.3) - (i < 8 ? 0 : 20), rad = S * (0.1 + r() * 0.16);
    const gr = g.createRadialGradient(x, y - rad * 0.3, 0, x, y, rad); const sombra = 0.82 + (y / S) * -0.2;
    gr.addColorStop(0, `rgba(255,255,255,${0.55})`); gr.addColorStop(0.6, `rgba(${235 * sombra | 0},${238 * sombra | 0},${245 * sombra | 0},0.35)`); gr.addColorStop(1, 'rgba(230,235,245,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function texPista(compr) {
  const W = 128, H = 2048, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#45484c'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.08})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  const m = H / compr; // pixels por metro (vertical)
  g.fillStyle = '#eee'; g.fillRect(4, 0, 3, H); g.fillRect(W - 7, 0, 3, H);
  for (let y = 70 * m; y < H - 70 * m; y += 50 * m) g.fillRect(W / 2 - 1.5, y, 3, 28 * m);
  for (const top of [true, false]) {
    const y0 = top ? 6 * m : H - 6 * m - 30 * m;
    for (let i = 0; i < 8; i++) { const x = 10 + i * 14.2; g.fillRect(x, y0, 8, 30 * m); }
    g.save(); g.translate(W / 2, top ? 60 * m : H - 60 * m); if (top) g.rotate(Math.PI); g.scale(1, m * 0.55);
    g.font = 'bold 48px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(top ? '18' : '36', 0, 0); g.restore();
    const ya = top ? 300 * m : H - 300 * m - 45 * m; g.fillRect(W / 2 - 30, ya, 12, 45 * m); g.fillRect(W / 2 + 18, ya, 12, 45 * m);
    g.fillStyle = 'rgba(20,20,20,0.35)'; for (let i = 0; i < 18; i++) g.fillRect(W / 2 - 22 + Math.random() * 44, (top ? 160 : H - 360 * m) + Math.random() * 200 * m * 0.8, 2 + Math.random() * 3, 40 + Math.random() * 90);
    g.fillStyle = '#eee';
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ---------- Detalhe do chão só de perto: grama/areia, rocha em 3 direções e relevo falso (bump) ----------
function texTile(S, desenha) { // textura repetível (desenha cada coisa 9 vezes nas bordas)
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  const r = rng(S * 7 + desenha.length);
  const em9 = (f) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { g.save(); g.translate(dx, dy); f(); g.restore(); } };
  desenha(g, S, r, em9);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
let texDet = null;
function detalharChao(mat) {
  texDet ??= {
    grama: texTile(256, (g, S, r, em9) => { // tufos e folhas
      for (let i = 0; i < 2600; i++) { const x = r() * S, y = r() * S, l = 3 + r() * 9, a = -Math.PI / 2 + (r() - 0.5) * 0.9, v = 70 + r() * 120;
        em9(() => { g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1 + r() * 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }); }
      for (let i = 0; i < 60; i++) { const x = r() * S, y = r() * S, rr = 6 + r() * 18, v = r() < 0.5 ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.1)'; em9(() => { g.fillStyle = v; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); }); }
    }),
    rocha: texTile(256, (g, S, r, em9) => { // camadas, blocos e rachaduras
      for (let i = 0; i < 26; i++) { const y = r() * S, h = 3 + r() * 14, v = 90 + r() * 90; em9(() => { g.fillStyle = `rgba(${v},${v},${v},.55)`; g.fillRect(0, y, S, h); }); }
      for (let i = 0; i < 140; i++) { const x = r() * S, y = r() * S, w = 8 + r() * 30, h = 5 + r() * 16, v = 95 + r() * 70; em9(() => { g.fillStyle = `rgba(${v},${v},${v},.35)`; g.beginPath(); g.ellipse(x, y, w, h, 0, 0, 7); g.fill(); }); }
      for (let i = 0; i < 30; i++) { let x = r() * S, y = r() * S; const pts = [[x, y]]; for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 30; y += r() * 22; pts.push([x, y]); }
        em9(() => { g.strokeStyle = 'rgba(40,40,40,.3)'; g.lineWidth = 1.5; g.beginPath(); pts.forEach(([a, b], k) => (k ? g.lineTo(a, b) : g.moveTo(a, b))); g.stroke(); }); }
    }),
  };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tGrama = { value: texDet.grama }; sh.uniforms.tRocha = { value: texDet.rocha };
    sh.vertexShader = 'varying vec3 vMundo; varying vec3 vNorm;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vMundo = (modelMatrix * vec4(transformed, 1.0)).xyz; vNorm = normal;');
    sh.fragmentShader = 'uniform sampler2D tGrama, tRocha; varying vec3 vMundo; varying vec3 vNorm;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dist = length(vViewPosition);
        float perto = 1.0 - smoothstep(90.0, 650.0, dist), meio = 1.0 - smoothstep(600.0, 3500.0, dist);
        vec3 nw = normalize(vNorm); vec3 w = pow(abs(nw), vec3(4.0)); w /= (w.x + w.y + w.z);
        float roc = smoothstep(0.88, 0.66, nw.y);
        float gr = mix(texture2D(tGrama, vMundo.xz * 0.12).r, texture2D(tGrama, vMundo.xz * 0.031).r, 0.45);
        float rc = texture2D(tRocha, vMundo.zy * 0.07).r * w.x + texture2D(tRocha, vMundo.xz * 0.07).r * w.y + texture2D(tRocha, vMundo.xy * 0.07).r * w.z;
        float rm = texture2D(tRocha, vMundo.zy * 0.009).r * w.x + texture2D(tRocha, vMundo.xz * 0.009).r * w.y + texture2D(tRocha, vMundo.xy * 0.009).r * w.z;
        float det = mix(gr, rc, roc);
        float altura = det * perto + (rm - 0.5) * meio * (0.35 + roc);
        float amp = mix(0.8, 0.45, roc);
        diffuseColor.rgb *= mix(1.0, 1.0 - amp * 0.5 + det * amp, perto) * mix(1.0, 0.8 + rm * 0.4, meio * (0.3 + roc * 0.7));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { // relevo falso a partir da textura (mesma ideia do bump do three)
          vec3 px = dFdx(-vViewPosition), py = dFdy(-vViewPosition);
          float hx = dFdx(altura), hy = dFdy(altura);
          vec3 r1 = cross(py, normal), r2 = cross(normal, px); float dt = dot(px, r1);
          vec3 grad = sign(dt) * (hx * r1 + hy * r2) * (1.4 + roc * 0.5);
          normal = normalize(abs(dt) * normal - grad);
        }`);
  };
}
