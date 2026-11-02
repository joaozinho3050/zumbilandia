// Teste automático do Céu Aberto: node aviao/teste.cjs  (precisa do Playwright com Chromium)
// Abre o jogo num navegador sem tela e confere os fluxos que mais quebram. Sai com erro se algum falhar.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const raiz = path.join(__dirname, '..');
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  const f = path.join(raiz, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(raiz) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': tipos[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

const checagens = () => {
  const J = window.__jogo, V = J.jog.pos.constructor, res = [];
  const ok = (nome, cond, info = '') => res.push([nome, !!cond, info]);
  J.comecar();
  // 1. os 4 aviões decolam
  for (const t of ['andorinha', 'caca', 'guerra', 'cargueiro']) {
    J.S.tipo = t; J.nascerLugar(J.LUGARES[0]); const a = J.jog.aviao;
    for (let n = 0; a.V < a.T.VS * 1.15 && n < 200 && J.jog.vivo; n++) J.simular(0.25, { acel: 1 });
    J.simular(2, { p: J.S.inverter ? -0.5 : 0.5 });
    ok('decola: ' + t, J.jog.vivo && !a.chao && a.pos.y > 25, 'alt ' + Math.round(a.pos.y));
  }
  // 2. trocar de avião no chão não empilha aviões
  J.S.tipo = 'andorinha'; J.nascerLugar(J.LUGARES[0]);
  for (const t of ['caca', 'guerra', 'andorinha']) { J.S.tipo = t; J.nascerLugar(J.LUGARES[0]); }
  const p = J.jog.aviao.pos; ok('sem aviões empilhados', J.frota.filter((a) => a.pos.distanceTo(p) < 3).length === 1);
  // 3. sair no chão: fora da asa e consegue entrar de novo
  const b = J.jog.aviao; J.sair(); for (let i = 0; i < 40; i++) J.passo(1 / 30);
  const L = b.obj.worldToLocal(J.jog.pos.clone()); ok('sai fora da asa', J.jog.modo === 'pe' && Math.hypot(L.x, L.z) > 1, `x ${L.x.toFixed(1)} z ${L.z.toFixed(1)}`);
  J.entrar(); for (let i = 0; i < 40; i++) J.passo(1 / 30); ok('entra de novo', J.jog.modo === 'piloto' && J.jog.aviao === b);
  // 4. em voo: anda em cima, a deriva bloqueia, sem garras cai
  J.nascerLugar(J.LUGARES[2]); J.sair(); J.passo(1 / 60);
  J.jog.camYaw = 0; J.simular(3, { r: 1 }); ok('anda até a asa', J.jog.modo === 'sobre' && J.jog.L.x > 3, 'x ' + J.jog.L.x.toFixed(2));
  J.jog.L.set(0, 0.95, 2.0); J.simular(3, { p: -1 }); ok('deriva é parede', J.jog.modo === 'sobre' && J.jog.L.z < 2.85, 'z ' + J.jog.L.z.toFixed(2));
  J.garras(); J.simular(6, {}); ok('sem garras o vento derruba', J.jog.modo === 'queda'); J.garras();
  J.paraquedas(); ok('abre paraquedas', J.jog.modo === 'paraquedas');
  // 5. cargueiro gigante: entrar voando, sair, pilotar, devolver, soltar o avião pela rampa
  const n = J.npc, e = n.esc; J.S.tipo = 'andorinha'; J.comecarDesafio(J.DESAFIO_BAIA); const a = J.jog.aviao;
  a.pos.copy(n.obj.localToWorld(new V(0, -1.25 + 1.93 / e + 0.3 / e, 9.3 + 12 / e))); a.q.copy(n.q); a.dir.set(0, 0, -1).applyQuaternion(a.q);
  a.V = n.V + 12; a.trem = a.tremAlvo = 1; a.chao = false; a.queda = 0; a.entrouAtras = true;
  for (let i = 0; i < 300 && !a.preso && a.vivo; i++) { const Lc = n.obj.worldToLocal(a.pos.clone()); J.simular(1 / 60, { p: Math.max(-0.2, Math.min(0.2, ((-1.25 + 1.93 / e) - Lc.y) * e * 0.05)) * (J.S.inverter ? -1 : 1), r: Math.max(-0.3, Math.min(0.3, -Lc.x * e * 0.03)), acel: 0.3 }); }
  ok('entra no cargueiro voando', a.preso && a.vivo);
  J.simular(8, {}); J.sair(); J.passo(1 / 60); ok('sai dentro do baú', J.jog.modo === 'sobre' && J.jog.sobre === n);
  J.jog.L.copy(n.P.entrada).add(new V(0, 0, 0.5 / e)); J.entrar(); ok('pilota o cargueiro', J.jog.aviao === n && J.jog.modo === 'piloto');
  J.simular(3, { r: 0.4 }); J.sair(); ok('piloto automático assume', !n.comPiloto && J.jog.modo === 'sobre');
  J.jog.L.copy(n.obj.worldToLocal(a.obj.localToWorld(a.P.saida.clone()))); J.jog.L.y = -1.25; J.passo(1 / 60); // caminha até o avião
  J.entrar(); ok('volta pro avião guardado', J.jog.aviao === a);
  document.getElementById('tSoltar').dispatchEvent(new PointerEvent('pointerdown')); J.simular(10, { acel: 1 });
  ok('solta pela rampa e voa', !a.preso && a.vivo && !a.chao);
  return res;
};

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 640, height: 360 } }), erros = [];
  pg.on('pageerror', (e) => erros.push(e.message));
  await pg.goto(`http://localhost:${srv.address().port}/aviao/`);
  await pg.waitForFunction(() => window.__jogo, null, { timeout: 120000 });
  const res = await pg.evaluate(checagens);
  for (const [nome, passou, info] of res) console.log(`${passou ? 'ok   ' : 'FALHA'} ${nome}${info ? ' (' + info + ')' : ''}`);
  for (const e of erros) console.log('ERRO NA PÁGINA:', e);
  await b.close(); srv.close();
  const falhas = res.filter((r) => !r[1]).length + erros.length;
  console.log(falhas ? `\n${falhas} problema(s)` : '\nTudo certo'); process.exit(falhas ? 1 : 0);
})();
