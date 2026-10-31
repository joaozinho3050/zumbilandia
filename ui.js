/* ui.js: HUD em jogo (U1). Escreve players[0].input; chama G.switchWeapon, SFX.mute.
   Ganchos para outras tarefas: buildMenu() (U3), buildStart/buildDead/buildTour() (U4). */
(function () {
  'use strict';
  const CSS = `
#ui{--fundo:#2b2236;--slot:#3d3150;--borda:#5d4a78;--texto:#fff1e0;--vida:#ff5c57;--superficie:rgba(43,34,54,.65);--superficie-forte:rgba(43,34,54,.92);--sombra:0 2px 8px rgba(21,18,26,.45);--sombra-texto:0 1px 0 #15121a;--fome:#eab26a;--folego:#cfe8f5;--armadura:#9aa3b5;--municao:#f2d16b;--esp-1:4px;--esp-2:8px;--esp-3:12px;--esp-4:16px;--esp-5:24px;--toque:48px;--fade:180ms;
--ml:max(16px,env(safe-area-inset-left));--mr:max(16px,env(safe-area-inset-right));--mt:max(16px,env(safe-area-inset-top));--mb:max(16px,env(safe-area-inset-bottom));
font-family:'Atkinson Hyperlegible',sans-serif;color:var(--texto);touch-action:none;user-select:none;-webkit-user-select:none}
#ui *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
#ui svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;flex:none}
#hud{position:absolute;inset:0;pointer-events:none}
#hud>*{position:absolute;transition:opacity var(--fade),transform var(--fade)}
#ui .hidden{opacity:0!important;pointer-events:none!important}
.pill{display:flex;align-items:center;gap:var(--esp-2);height:36px;padding:0 var(--esp-3) 0 var(--esp-2);background:var(--superficie);border:2px solid var(--borda);border-radius:14px;box-shadow:var(--sombra);font-family:'Pixelify Sans',monospace;font-size:14px;text-shadow:var(--sombra-texto)}
.bar{position:relative;overflow:hidden;height:8px;background:var(--slot);border-radius:4px}
.bar i{position:absolute;inset:0;border-radius:4px;transform-origin:left;background:currentColor}
#hp,#hunger,#stamina,#armor{left:var(--ml)}
#hp{top:var(--mt);color:var(--vida)}#hp .bar{width:140px}
#hunger{top:calc(var(--mt) + 44px);color:var(--fome)}#hunger .bar{width:100px}
#stamina{top:calc(var(--mt) + 88px);color:var(--folego);height:28px}#stamina .bar{width:100px;height:6px}
#armor{top:calc(var(--mt) + 132px);color:var(--armadura)}#armor .bar{width:60px}
.pulse{animation:pulso 1s ease-in-out infinite}
@keyframes pulso{50%{transform:scale(1.06)}}
#time{top:var(--mt);right:calc(var(--mr) + 112px);height:48px;display:flex;align-items:center;font:20px 'Pixelify Sans',monospace;text-shadow:var(--sombra-texto)}
#hint{top:56px;left:50%;transform:translateX(-50%);max-width:60vw;display:flex;align-items:center;gap:var(--esp-2);min-height:36px;padding:0 var(--esp-3);background:var(--superficie);border:2px solid var(--borda);border-radius:14px;box-shadow:var(--sombra);font-size:16px;pointer-events:auto}
#hint span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#hint button{display:none;min-width:48px;min-height:48px;border:0;background:none;color:var(--municao);font:inherit;font-size:14px;text-decoration:underline}
#hint.g button{display:block}
#toast{right:var(--mr);bottom:calc(var(--mb) + 184px);max-width:230px;padding:6px var(--esp-3);background:var(--superficie);border:2px solid var(--borda);border-radius:14px;box-shadow:var(--sombra);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#flash{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 60px 12px var(--vida);transition:opacity var(--fade)}
#hud button{pointer-events:auto;touch-action:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:0;color:var(--texto);background:var(--superficie);border:2px solid var(--borda);border-radius:50%;box-shadow:var(--sombra);font:12px 'Pixelify Sans',monospace;text-shadow:var(--sombra-texto);opacity:.65}
#hud button.active{opacity:1;transform:scale(.96)}
#hud button.hidden{opacity:0}
#btn-attack{right:var(--mr);bottom:var(--mb);width:84px;height:84px}
#btn-action{right:calc(var(--mr) + 100px);bottom:calc(var(--mb) + 24px);width:72px;height:72px}
#btn-action.near{border-color:var(--vida)}
#btn-action .ring{position:absolute;left:-6px;top:-6px;width:84px;height:84px;overflow:visible;pointer-events:none;transition:opacity var(--fade)}
#btn-action .ring circle{fill:none;stroke:var(--municao);stroke-width:3;stroke-linecap:butt}
#btn-weapon{right:calc(var(--mr) + 16px);bottom:calc(var(--mb) + 104px);width:56px;height:56px;font-size:11px}
#btn-weapon b{font-weight:400;color:var(--municao);font-size:14px}
#btn-weapon b.vazio{color:var(--vida)}
#btn-weapon img{width:28px;height:28px;image-rendering:pixelated}
#btn-menu,#btn-mute{top:var(--mt);width:48px;height:48px}
#btn-menu{right:var(--mr)}#btn-mute{right:calc(var(--mr) + 56px)}
#btn-mute .x{display:none;color:var(--vida)}#btn-mute.m .x{display:inline}
#joy{left:0;bottom:0;width:180px;height:180px;pointer-events:auto;touch-action:none}
#joy .base{position:absolute;left:var(--ml);bottom:var(--mb);width:120px;height:120px;border-radius:50%;background:var(--superficie);border:2px solid var(--borda);opacity:.65;transition:opacity var(--fade),border-color var(--fade)}
#joy.active .base{opacity:1}
#joy.car .base{border-radius:14px}
#joy.car .marca{display:none}
#fuel,#re{right:var(--mr)}#fuel{top:calc(var(--mt) + 56px);color:var(--municao)}#re{top:calc(var(--mt) + 100px);color:var(--vida)}
#fuel svg{width:20px;height:20px}
#joy.run .base{border-color:var(--folego)}
#joy .zona{position:absolute;left:calc(var(--ml) - 30px);bottom:calc(var(--mb) - 30px);width:180px;height:180px;border-radius:50%;border:2px solid var(--folego);opacity:0;pointer-events:none;transition:opacity var(--fade),background var(--fade)}
#joy.active .zona{opacity:.3}#joy.active.run .zona{opacity:.8;background:rgba(207,232,245,.18)}#joy.car .zona{display:none}
#joy .marca{position:absolute;left:0;top:0;width:100%;height:100%;fill:none;stroke:var(--borda);stroke-width:1}
#btn-crouch{left:calc(var(--ml) + 36px);bottom:calc(var(--mb) + 136px);width:48px;height:48px}
#btn-crouch.on{opacity:1;border-color:var(--folego)}
#joy .nub{position:absolute;left:36px;top:36px;width:48px;height:48px;border-radius:50%;background:var(--slot);border:2px solid var(--texto)}
#menu{z-index:5;position:absolute;left:50%;top:50%;width:92vw;height:86vh;transform:translate(-50%,-50%);display:flex;flex-direction:column;background:var(--superficie-forte);border:2px solid var(--borda);border-radius:14px;transition:opacity var(--fade);pointer-events:auto}
#menu .tabs{display:flex;align-items:center;gap:var(--esp-1);padding:var(--esp-2);border-bottom:2px solid var(--borda);font:12px 'Pixelify Sans',monospace}
#menu button{color:var(--texto);font-family:inherit;touch-action:manipulation}
#menu .tabs button{flex:1;min-width:0;height:48px;display:flex;align-items:center;justify-content:center;gap:var(--esp-1);padding:0;border:2px solid var(--borda);border-radius:14px;background:var(--slot);font-size:14px}
#menu .tabs button.on{background:var(--borda)}
#menu .tabs button.x{flex:none;width:48px;font-size:20px}
#menu .pane{display:none;flex:1;min-height:0;overflow-y:auto;touch-action:pan-y;padding:var(--esp-3);font-size:14px}
#menu .pane.on{display:block}
#menu h3{margin:0 0 var(--esp-2);font:16px 'Pixelify Sans',monospace;font-weight:400}
#menu h3.full{color:var(--vida)}
#tab-map{text-align:center}
#tab-map canvas{width:min(320px,60vh);height:min(320px,60vh);image-rendering:pixelated;border:2px solid var(--borda);border-radius:14px;background:var(--fundo)}
#menu input{width:100%;height:48px;padding:0 var(--esp-3);border:2px solid var(--borda);border-radius:14px;background:var(--slot);color:var(--texto);font:16px 'Atkinson Hyperlegible',sans-serif;touch-action:manipulation;user-select:text;-webkit-user-select:text}
#menu .hit{display:block;width:100%;min-height:48px;margin-top:var(--esp-2);text-align:left;padding:0 var(--esp-3);border:2px solid var(--borda);border-radius:14px;background:var(--slot);font-size:14px}
#menu ol{margin:var(--esp-1) 0;padding-left:var(--esp-5)}
#menu canvas.demo{width:160px;height:120px;border:2px solid var(--borda);border-radius:14px;background:var(--fundo)}
#start,#dead,#confirm{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--esp-4);transition:opacity var(--fade);pointer-events:auto;z-index:8}
#start{background:var(--fundo)}
#dead{background:var(--superficie-forte);z-index:7;text-align:center}
#confirm{background:var(--superficie-forte);z-index:9}
#start h1,#dead h1{margin:0;font:400 32px 'Pixelify Sans',monospace;text-shadow:var(--sombra-texto)}
#start .cards{display:flex;gap:var(--esp-4)}
#start .card{position:relative;width:240px;height:140px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--esp-1);background:var(--slot);border:2px solid var(--borda);border-radius:14px;box-shadow:var(--sombra);font-size:14px;cursor:pointer;touch-action:manipulation}
#start .card b{font:400 20px 'Pixelify Sans',monospace}
#start .card .del{position:absolute;top:0;right:0;width:48px;height:48px;padding:0;display:flex;align-items:center;justify-content:center;background:none;border:0;color:var(--texto)}
#dead p,#confirm p{margin:0;font-size:16px}
#ui .big{min-width:160px;min-height:56px;padding:0 var(--esp-5);border:2px solid var(--borda);border-radius:14px;background:var(--slot);color:var(--texto);font:400 18px 'Pixelify Sans',monospace;touch-action:manipulation}
#ui .big.sim{border-color:var(--vida);color:var(--vida)}
#confirm .row2{display:flex;gap:var(--esp-4)}
#ui.morto #hud,#ui.morto #hud *{pointer-events:none!important}
#tour{position:fixed;inset:0;pointer-events:none;z-index:6;background:rgba(43,34,54,.35);transition:opacity var(--fade)}
#tour .cut{position:fixed;border:3px solid var(--municao);border-radius:14px;pointer-events:none;transition:opacity var(--fade),transform var(--fade)}
#tour .tip{position:fixed;left:50%;bottom:var(--mb);transform:translateX(-50%);width:min(300px,50vw);display:flex;flex-direction:column;gap:var(--esp-2);padding:var(--esp-3);background:var(--superficie);border:2px solid var(--borda);border-radius:14px;box-shadow:var(--sombra);font-size:16px;pointer-events:auto}
#tour .tip div{display:flex;gap:var(--esp-2);align-items:center}
#tour .tip button{flex:1;min-height:48px;border:2px solid var(--borda);border-radius:14px;background:var(--slot);color:var(--texto);font:400 14px 'Pixelify Sans',monospace}
#tour .tip i{font:400 14px 'Pixelify Sans',monospace;font-style:normal;color:var(--municao)}
#container{z-index:5;position:absolute;left:50%;top:50%;width:92vw;height:86vh;transform:translate(-50%,-50%);display:flex;flex-direction:column;background:var(--superficie-forte);border:2px solid var(--borda);border-radius:14px;transition:opacity var(--fade);pointer-events:auto;touch-action:pan-y;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
#ui:has(#container:not(.hidden)) #hint{top:auto;bottom:max(8px,env(safe-area-inset-bottom));z-index:6}
#container .top{display:flex;align-items:center;justify-content:flex-end;gap:var(--esp-2);padding:var(--esp-2);border-bottom:2px solid var(--borda)}
#container .top .sp{flex:1}
#menu .pane.cols.on{display:flex;overflow:hidden;padding:0}
.ip button{color:var(--texto);font-family:inherit;touch-action:pan-y}
.ip .btn,#menu .btn{min-width:48px;min-height:48px;padding:0 var(--esp-4);border:2px solid var(--borda);border-radius:14px;background:var(--slot);font:14px 'Pixelify Sans',monospace}
.ip .btn:disabled,#menu .btn:disabled{opacity:.35}
.ip.cols,.ip .cols{flex:1;min-height:0;display:flex}
.ip .col{flex:1;min-width:0;overflow-y:auto;touch-action:pan-y;padding:var(--esp-3)}
.ip .col+.col{border-left:2px solid var(--borda)}
.ip h3{margin:0 0 var(--esp-2);font:16px 'Pixelify Sans',monospace;font-weight:400}
.ip h3.full{color:var(--vida)}
.ip .grid{display:grid;grid-template-columns:repeat(auto-fill,56px);gap:var(--esp-2)}
.ip .slot{position:relative;overflow:hidden;width:56px;height:56px;padding:0;border:2px solid var(--borda);border-radius:14px;background:var(--slot);display:flex;align-items:center;justify-content:center;font-size:10px;line-height:1}
.ip .slot:disabled{border-style:dashed;background:none}
.ip .slot.ex{border-color:var(--municao)}
.ip .slot.sel{border-color:var(--texto)}
.ip .slot.no img{opacity:.35}
.ip .slot img{width:36px;height:36px;image-rendering:pixelated;pointer-events:none}
.ip .slot b{position:absolute;right:4px;top:2px;font:12px 'Pixelify Sans',monospace;font-weight:400;text-shadow:var(--sombra-texto)}
.ip .slot>i{position:absolute;inset:0;background:var(--texto);opacity:0;transform:scaleY(0);transform-origin:bottom;pointer-events:none}
.ip .slot.h>i{opacity:.35;transform:scaleY(1);transition:transform 400ms linear}
.ip .dur{position:absolute;left:6px;right:6px;bottom:4px;height:5px;background:var(--fundo);border-radius:3px;overflow:hidden}
.ip .dur i{display:block;height:100%;background:var(--armadura)}
.ip canvas.spin{display:block;width:96px;height:96px;margin:0 0 4px;image-rendering:pixelated}
.ip .acts{display:flex;flex-wrap:wrap;gap:var(--esp-2);margin-top:var(--esp-2)}
.dim{color:var(--armadura)}
@media (prefers-reduced-motion:reduce){#ui *{transition:none!important;animation:none!important}}`;

  const ICON = {
    heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    apple: '<path d="M12 8c-3-2-7 0-6 5 .8 4 3 7 6 7s5.2-3 6-7c1-5-3-7-6-5z"/><path d="M12 8c0-2 1-3 3-4"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
    cracked: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M12 3v5l-2 3 3 3-1 3"/>',
    menu: '<path d="M5 7h14M5 12h14M5 17h14"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>',
    muted: '<path d="M4 9v6h4l5 4V5L8 9z"/><path class="x" d="M17 9l5 6M22 9l-5 6"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8c0 4-2 6-5 6-2.5 0-4-1.5-5.5-4L4.5 13.5a1.5 1.5 0 0 1 3-1z"/>',
    door: '<path d="M5 21V4h9v17M3 21h14"/><path d="M17 12h5m-2-2 2 2-2 2"/>',
    exit: '<path d="M5 21V4h9v17M3 21h14"/><path d="M22 12h-5m2-2-2 2 2 2"/>',
    trunk: '<path d="M3 16v-4l2-4h8l3 4v4z"/><circle cx="7" cy="17" r="1.5"/><circle cx="13" cy="17" r="1.5"/><path d="M18 5l4 3-4 3"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>',
    jump: '<path d="M12 20V5m-6 6 6-6 6 6"/>',
    box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
    man: '<circle cx="12" cy="5" r="3"/><path d="M7 21v-7l-2-5h14l-2 5v7M12 14v7"/>',
    pack: '<path d="M6 8a6 6 0 0 1 12 0v12H6z"/><path d="M9 14h6"/>',
    craft: '<path d="M14 6l4 4-9 9H5v-4z"/><path d="M12 8l4 4"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>',
    book: '<path d="M4 5h7a2 2 0 0 1 1 1v13a2 2 0 0 0-1-1H4zM20 5h-7a2 2 0 0 0-1 1v13a2 2 0 0 1 1-1h7z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
    hit: '<path d="M4 18c2-8 8-13 16-14"/><path d="M14 4h6v6"/><path d="M6 20l4-4"/>',
    pump: '<path d="M5 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M3 21h13M6 8h7"/><path d="M14 10h2.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
    fire: '<path d="M10 11h4v2l1.5 2v5.5h-7V15l1.5-2z"/><path d="M11 11V8.5h2V11"/><path d="M12 2c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1 .6-1.7 1-2.5.2.8.6 1 1 1 0-1.5 0-2.5 1-3.5z"/>',
    crouch: '<circle cx="15" cy="6" r="2.5"/><path d="M14 10l-3 4.5 4 2.5-1 4.5M11 14.5l-4 1.5v4h4"/>'
  };
  const svg = (n, c) => '<svg viewBox="0 0 24 24"' + (c ? ' style="color:' + c + '"' : '') + '>' + ICON[n] + '</svg>';

  // near.type -> [icone, rotulo <= 8 letras]
  const ACAO = {
    crate: ['search', 'BUSCAR'], tomb: ['hand', 'PEGAR'], enter: ['door', 'ENTRAR'], exit: ['exit', 'SAIR'],
    trunk: ['trunk', 'MALA'], car: ['door', 'ENTRAR'], siphon: ['pump', 'SIFONAR'], pour: ['pump', 'DESPEJAR'], search: ['search', 'BUSCAR'], drop: ['hand', 'PEGAR'], fence: ['jump', 'PULAR'], cut: ['hand', 'CORTAR'], locked: ['door', 'TRANCADA']
  };
  const acaoDe = (n) => n.type === 'door' && n.locked ? (n.cut ? ACAO.cut : ACAO.locked) : n.act ? ACAO[n.act] : n.type === 'door' ? (n.open ? ['door', 'FECHAR'] : ['door', 'ABRIR']) : ACAO[n.type] || ['hand', 'AÇÃO'];
  const NOME = { food: 'Comida', bandage: 'Bandagem', ammo: 'Munição', rag: 'Trapo', wire: 'Arame', bottle: 'Garrafa', hose: 'Mangueira', gascan: 'Galão', key: 'Chave', pipe: 'Cano', pipe_r: 'Cano reforçado', bat: 'Taco', pistol: 'Pistola', molotov: 'Molotov', helmet: 'Capacete', jacket: 'Jaqueta', shinguards: 'Caneleiras', bag_school: 'Mochila escolar', bag_hiking: 'Mochila de trilha', bag_military: 'Mochila militar' };
  const BAG = { bag_school: 4, bag_hiking: 8, bag_military: 12 };
  const CNOME = { fridge: 'Geladeira', cabinet: 'Armário', wardrobe: 'Guarda-roupa', drawer: 'Gaveta', shelf: 'Gôndola', box: 'Caixa', trunk: 'Porta-malas', tomb: 'Tumba' };
  const ARMA = { pipe: 'CANO', pipe_r: 'CANO+', bat: 'TACO', pistol: 'PISTOLA', molotov: 'MOLOTOV' };
  const DUR = { helmet: 20, jacket: 20, shinguards: 10, cutter: 4 };

  const held = { atk: false, act: false }, keys = new Set(), last = {}, E = {};
  const joy = { id: null, cx: 0, cy: 0, mx: 0, my: 0, run: false };
  let tapT = null, intT = 0, pend = false, hintGuia = '', crouchPend = false, root, armorUntil = 0, hintUntil = 0, hintNear = '', toastUntil = 0, flashUntil = 0, menuEl, startEl, confirmEl, deadEl, tourEl, tourStep = -1, tourPos, contEl, contSig = '', hp = null;

  const put = (k, v, fn) => { if (last[k] !== v) { last[k] = v; fn(v); } };
  const el = (tag, id, parent, html, cls) => {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    parent.appendChild(e);
    return e;
  };
  const fmt = (t) => { const s = Math.floor(t || 0); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const pill = (id, icon, w, cls, hud) => el('div', id, hud, svg(icon) + '<div class="bar"><i></i></div>', 'pill hidden' + (cls || ''));
  const fill = (e, f) => { e.querySelector('i').style.transform = 'scaleX(' + Math.max(0, Math.min(1, f)) + ')'; };

  function hold(b, down, up) {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('active'); down(); });
    const end = () => { b.classList.remove('active'); up && up(); };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
  }
  const btn = (id, parent, html) => el('button', id, parent, html);

  function toggleMute() { try { SFX.mute(!SFX.muted()); } catch (e) {} }

  function toggleMenu(open) {
    if (contEl && !contEl.classList.contains('hidden')) return;
    const v = open === undefined ? !UI.paused : open;
    if (v === UI.paused || (v && startEl && !startEl.classList.contains('hidden'))) return;
    UI.paused = v;
    menuEl.classList.toggle('hidden', !v);
    if (v) { held.atk = held.act = false; intT = 0; try { window.G.save(); } catch (e) {} buildMenu(); showTab(curTab); }
    else { demoOff(); spinOff(); }
  }

  // ---- MENU (U3) ----
  const ABAS = [['pack', 'Mochila', 'inv'], ['man', 'Equipar', 'equip'], ['craft', 'Fabricar', 'craft'], ['map', 'Mapa', 'map'], ['book', 'Guia', 'guide'], ['gear', 'Ajustes', 'settings']];
  const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nm = (id) => NOME[id] || id;
  const ico = (id) => {
    let src = null;
    try { src = window.R && R.icon ? R.icon(id) : null; } catch (e) {}
    return src ? '<img src="' + (src.src || src) + '" alt="">' : svg('box');
  };
  const have = (id) => ((window.G.player.inv || []).filter((i) => i.id === id).reduce((a, i) => a + (i.qty == null ? 1 : i.qty), 0));
  const say = (t) => { E.toast.textContent = t; toastUntil = performance.now() + 2000; };
  const spinOff = () => { try { window.R && R.spin && R.spin(null); } catch (e) {} };
  const demoOff = () => { try { window.R && R.demo && R.demo(null); } catch (e) {} };

  let curTab = 'inv', selInv = -1, guideQ = '', guideOpen = null, mapRaf = 0, panes = {}, tabBtns = {};
  const mapCache = new Map();

  function showTab(id) {
    if (curTab === 'guide' && id !== 'guide') demoOff();
    if (id !== 'inv') spinOff();
    curTab = id;
    for (const k in panes) { panes[k].classList.toggle('on', k === id); tabBtns[k].classList.toggle('on', k === id); }
    ({ inv: renderInv, equip: renderEquip, craft: renderCraft, map: renderMap, guide: renderGuide, settings: renderSettings })[id]();
  }

  // ---- componente único de painel de itens (duas colunas): slot, coluna, aviso ----
  const qtxt = (it) => it.id === 'gascan' && it.fuel != null ? Math.round(it.fuel / 10 * 100) + '%' : it.qty > 1 ? it.qty : '';
  // o: a (atributos), ex, sel, no (esmaecido), hold (overlay do segurar), lab (rótulo se vazio), q (texto no canto), dur, tag
  function slotH(it, o) {
    o = o || {};
    const cls = 'slot' + (o.ex ? ' ex' : '') + (o.sel ? ' sel' : '') + (o.no ? ' no' : ''), tag = o.tag || 'button';
    if (!it) return '<' + tag + ' class="' + cls + '" disabled' + (o.lab ? ' aria-label="' + o.lab + '"' : '') + '>' + (o.lab ? '<span class="dim">' + o.lab + '</span>' : '') + '</' + tag + '>';
    const q = o.q != null ? o.q : qtxt(it), d = o.dur != null ? '<span class="dur"><i style="width:' + Math.round(Math.max(0, Math.min(1, o.dur)) * 100) + '%"></i></span>' : '';
    return '<' + tag + (tag === 'div' ? ' role="button" tabindex="0"' : '') + ' class="' + cls + '" ' + (o.a || '') + ' aria-label="' + (o.lab || nm(it.id)) + '">' + ico(it.id) + (o.hold ? '<i></i>' : '') + (q !== '' ? '<b>' + q + '</b>' : '') + d + '</' + tag + '>';
  }
  const col = (t, full, body) => '<div class="col"><h3' + (full ? ' class="full"' : '') + '>' + t + '</h3>' + body + '</div>';
  const grid = (h) => '<div class="grid">' + h + '</div>';
  const durOf = (it) => it.dur == null ? null : it.dur / (DUR[it.id] || it.dur || 1);

  const cap = (p) => window.G.capOf ? window.G.capOf(p) : 8;
  const capTxt = (p) => cap(p) > 8 ? '8+' + (cap(p) - 8) : '8';
  const bagCol = (p, f) => { // coluna da mochila: f(item, i) -> opções do slot
    const inv = p.inv || [];
    let g = '';
    for (let i = 0; i < Math.max(cap(p), inv.length); i++) g += slotH(inv[i], Object.assign({ ex: i >= 8 }, inv[i] && f(inv[i], i)));
    return col('Mochila ' + inv.length + '/' + capTxt(p), inv.length >= cap(p), grid(g));
  };
  const equipavel = (id) => !!(DUR[id] || BAG[id]);

  function renderInv() {
    const p = window.G.player, inv = p.inv || [], it = inv[selInv];
    let det = '<span class="dim">Toque num item.</span>';
    if (it) {
      const usa = it.id === 'food' || it.id === 'bandage', d = durOf(it);
      det = '<canvas class="spin" width="160" height="160"></canvas><h3>' + nm(it.id) + ' ×' + (it.qty || 1) + (d != null ? ' · dur ' + it.dur : '') + '</h3><div class="dim">' + (usa ? 'Toque de novo para usar.' : equipavel(it.id) ? 'Pode ser equipado.' : ['pistol','bat','pipe','pipe_r','molotov'].includes(it.id) ? 'Arma — troque com o botão ARMA.' : 'Material para fabricar ou usar no mundo.') + '</div><div class="acts">' +
        (usa ? '<button class="btn" data-a="use" data-v="' + selInv + '">USAR</button>' : '') + (equipavel(it.id) ? '<button class="btn" data-a="eq" data-v="' + it.id + '">EQUIPAR</button>' : '') + '<button class="btn" data-a="drop" data-v="' + selInv + '">LARGAR</button></div>';
    }
    panes.inv.innerHTML = bagCol(p, (x, i) => ({ a: 'data-a="slot" data-v="' + i + '"', sel: i === selInv, dur: durOf(x) })) + '<div class="col">' + det + '</div>';
    // item selecionado girando em 3D (mesmo renderer do jogo)
    const cv = panes.inv.querySelector('canvas.spin');
    try { window.R && R.spin && R.spin(cv || null, it ? it.id : null); } catch (e) {}
  }

  function renderEquip() {
    const G = window.G, p = G.player, eq = p.equip || {};
    const nomes = { head: 'Cabeça', torso: 'Tronco', legs: 'Pernas', back: 'Costas' };
    let g = '';
    for (const part in nomes) {
      const it = eq[part];
      g += slotH(it, { a: 'data-a="un" data-v="' + part + '"', lab: nomes[part] + (it ? ': ' + nm(it.id) : ''), dur: it && part !== 'back' ? durOf(it) : null });
    }
    panes.equip.innerHTML = col('Equipados', false, grid(g) + '<p class="dim">Toque na peça para tirar.</p>') +
      bagCol(p, (x) => equipavel(x.id) ? { a: 'data-a="eq" data-v="' + x.id + '"', dur: durOf(x) } : { no: true });
  }

  let selRec = '';
  const okIng = (x) => x.fuel ? (window.G.player.inv || []).some((i) => i.id === x.id && (i.fuel || 0) >= x.fuel) : have(x.id) >= x.qty;
  function renderCraft() {
    const rs = window.G.recipes || [], r = rs.find((x) => x.id === selRec) || rs[0];
    const pode = (x) => x.ing.every(okIng);
    const left = grid(rs.map((x) => slotH({ id: x.out }, { tag: 'div', a: 'data-a="rec" data-v="' + x.id + '"', sel: x === r, no: !pode(x), q: '', lab: nm(x.out) })).join(''));
    let right = '<span class="dim">Sem receitas</span>';
    if (r) {
      const falta = r.ing.filter((x) => !okIng(x)).map((x) => nm(x.id) + (x.fuel ? ' com ' + x.fuel + ' L' : ''));
      right = '<h3>' + nm(r.out) + '</h3>' + grid(r.ing.map((x) => slotH({ id: x.id }, { tag: 'div', no: !okIng(x), q: x.fuel ? x.fuel + ' L' : Math.min(have(x.id), 99) + '/' + x.qty })).join('')) +
        (falta.length ? '<p class="dim">falta: ' + falta.join(', ') + '</p>' : '') + '<div class="acts"><button class="btn" data-a="craft" data-v="' + r.id + '"' + (falta.length ? ' disabled' : '') + '>FABRICAR</button></div>';
    }
    panes.craft.innerHTML = '<div class="col"><h3>Receitas</h3>' + left + '</div><div class="col">' + right + '</div>';
  }

  // Mapa: 5x5 chunks em volta do jogador, 48 px por chunk (1,2 px/m), cache por chunk, 4 novos por frame
  const MN = 5, MC = 48, MS = MC / 40; // px por metro
  function renderMap() {
    if (!panes.map.firstChild) { const c = el('canvas', null, panes.map); c.width = c.height = MN * MC; }
    if (!mapRaf) mapRaf = requestAnimationFrame(mapLoop);
  }
  function mapChunk(k, cx, cy) {
    let c = mapCache.get(k);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = MC;
    const x = c.getContext('2d'), g = window.G.gen ? window.G.gen(cx, cy) : {}, ox = cx * 40, oy = cy * 40;
    x.fillStyle = '#8fd16a'; x.fillRect(0, 0, MC, MC);
    const box = (r, col) => { x.fillStyle = col; x.fillRect((r.x - ox) * MS, (r.y - oy) * MS, Math.max(1, r.w * MS), Math.max(1, r.h * MS)); };
    (g.roads || []).forEach((r) => box(r, '#5e5b6b'));
    (g.houses || []).forEach((r) => box(r, '#f0e2c4'));
    mapCache.set(k, c);
    return c;
  }
  function mapLoop() {
    mapRaf = 0;
    if (!UI.paused || curTab !== 'map') return;
    const G = window.G, p = G.player, cv = panes.map.firstChild, x = cv.getContext('2d');
    const pcx = Math.floor(p.x / 40), pcy = Math.floor(p.y / 40), h = (MN - 1) / 2, ex = new Set(G.explored);
    let budget = 4;
    x.fillStyle = '#2b2236'; x.fillRect(0, 0, cv.width, cv.height);
    for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
      const cx = pcx - h + i, cy = pcy - h + j, k = cx + ',' + cy;
      if (!ex.has(k)) continue;
      if (!mapCache.has(k)) { if (budget <= 0) continue; budget--; }
      x.drawImage(mapChunk(k, cx, cy), i * MC, j * MC);
    }
    const w2p = (wx, wy) => [(wx - (pcx - h) * 40) * MS, (wy - (pcy - h) * 40) * MS];
    x.fillStyle = '#ff5c57';
    const tombs = (G.crates || []).filter((c) => c.tomb);
    for (const k in G.chunks) for (const id in (G.chunks[k].crates || {})) { const c = G.chunks[k].crates[id]; if (c && c.tomb && c.x != null) tombs.push(c); }
    for (const t of tombs) { const [a, b] = w2p(t.x, t.y); x.fillRect(a - 3, b - 3, 6, 6); }
    const [a, b] = w2p(p.x, p.y);
    x.fillStyle = '#ff8c69'; x.beginPath(); x.arc(a, b, 3.5, 0, 6.3); x.fill();
    if (typeof p.dir === 'number') { x.strokeStyle = '#fff1e0'; x.lineWidth = 2; x.beginPath(); x.moveTo(a, b); x.lineTo(a + Math.cos(p.dir) * 8, b + Math.sin(p.dir) * 8); x.stroke(); }
    mapRaf = requestAnimationFrame(mapLoop);
  }

  function renderGuide() {
    if (!panes.guide.firstChild) {
      const i = el('input', null, panes.guide); i.type = 'search'; i.placeholder = 'Buscar: gasolina, chave…'; i.setAttribute('aria-label', 'Buscar no guia');
      el('div', null, panes.guide, '', 'res'); el('div', null, panes.guide, '', 'ent');
      i.addEventListener('input', () => { guideQ = i.value; listGuide(); });
    }
    panes.guide.firstChild.value = guideQ;
    listGuide();
  }
  function listGuide() {
    const G = window.G, all = G.guide, q = sem(guideQ);
    const hits = all.filter((e) => !q || sem(e.titulo + ' ' + (e.palavras || []).join(' ') + ' ' + e.id).includes(q));
    panes.guide.querySelector('.res').innerHTML = hits.map((e) => '<button class="hit" data-a="guide" data-v="' + e.id + '">' + e.titulo + '</button>').join('') || '<div class="dim">Nada encontrado</div>';
    if (hits.length && !hits.some((e) => e.id === guideOpen)) guideOpen = hits[0].id;
    const e = hits.find((x) => x.id === guideOpen), ent = panes.guide.querySelector('.ent');
    if (!e) { ent.innerHTML = ''; demoOff(); return; }
    ent.innerHTML = '<h3>' + e.titulo + '</h3><div><b>Precisa:</b> ' + (e.precisa || []).map((x) => (x.item ? nm(x.item) : x.lugar) + ' (' + x.onde + ')').join('; ') + '</div><ol>' + (e.passos || []).map((s) => '<li>' + s + '</li>').join('') + '</ol><canvas class="demo" width="160" height="120"></canvas>';
    try { window.R && R.demo && R.demo(ent.querySelector('canvas'), e.demo); } catch (er) {}
  }

  function renderSettings() {
    const m = !!(window.SFX && SFX.muted && SFX.muted());
    panes.settings.innerHTML = '<h3>Ajustes</h3><button class="btn" data-a="mute">Som: ' + (m ? 'mudo' : 'ligado') + '</button> <button class="btn" data-a="exit">Sair para o início</button> <button class="btn" data-a="delw">Apagar este mundo</button>';
  }

  // ---- CONTÊINER (M4.5): esquerda = contêiner, direita = mochila ----
  function contData(G, p) {
    const o = p.open, e = o && (o.type === 'trunk' ? G.cars : G.crates).find((c) => c.id === o.id);
    return e && { list: o.type === 'trunk' ? e.trunk : e.loot, name: CNOME[o.type === 'trunk' ? 'trunk' : e.tomb ? 'tomb' : e.kind] || 'Móvel', cap: o.type === 'trunk' ? 10 : e.tomb ? Infinity : e.kind === 'shelf' ? 8 : 6 };
  }
  function renderCont(G, p, c) {
    const cs = (list, n, side, ex) => { let g = ''; for (let i = 0; i < Math.max(n, list.length); i++) g += slotH(list[i], { a: 'data-s="' + side + '" data-i="' + i + '"', hold: true, ex: ex && i >= 8 }); return g; };
    contEl.querySelector('.cols').innerHTML = col(c.name + ' ' + c.list.length + (c.cap === Infinity ? '' : '/' + c.cap), c.list.length >= c.cap, grid(cs(c.list, c.cap === Infinity ? 0 : c.cap, 'c'))) +
      col('Mochila ' + p.inv.length + '/' + capTxt(p), p.inv.length >= cap(p), grid(cs(p.inv, cap(p), 'inv', true)));
  }
  function holdEnd() { if (hp) { clearTimeout(hp.t); hp.b.classList.remove('h'); hp = null; } }
  function buildCont() {
    contEl = el('div', 'container', root, '<div class="top"><button class="btn" data-k="all">Pegar tudo</button><button class="btn" data-k="x" aria-label="Fechar">✕</button></div><div class="cols"></div>', 'hidden ip');
    const G = () => window.G;
    contEl.addEventListener('pointerdown', (e) => {
      const k = e.target.closest('[data-k]'), b = e.target.closest('[data-s]');
      if (k) { if (k.dataset.k === 'x') G().closeC(); else G().takeAll(); return; }
      if (!b || hp) return;
      const f = b.dataset.s, i = +b.dataset.i;
      hp = { b, x: e.clientX, y: e.clientY, t: setTimeout(() => { const h = hp; hp = null; h.b.classList.remove('h'); G().moveItem(f, i, 1); }, G().HOLD_MS || 400) };
      void b.offsetWidth; b.classList.add('h');
    });
    contEl.addEventListener('pointermove', (e) => { if (hp && Math.hypot(e.clientX - hp.x, e.clientY - hp.y) > 8) holdEnd(); });
    const up = (e) => {
      if (!hp) return;
      const h = hp, ok = e.type === 'pointerup'; holdEnd();
      if (ok) G().moveItem(h.b.dataset.s, +h.b.dataset.i);
    };
    contEl.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', holdEnd);
    contEl.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerdown', (e) => { if (!contEl.classList.contains('hidden') && !contEl.contains(e.target)) window.G.closeC(); });
  }
  function contTick(G, p) {
    const c = contData(G, p), on = !!c, was = !contEl.classList.contains('hidden');
    if (on !== was) {
      hide(contEl, !on); contSig = '';
      if (on) { held.atk = held.act = false; intT = 0; UI.paused = true; } else { holdEnd(); if (menuEl.classList.contains('hidden')) UI.paused = false; }
    }
    if (!on) return;
    const sig = JSON.stringify([c.list, p.inv, cap(p)]);
    if (sig !== contSig) { contSig = sig; holdEnd(); renderCont(G, p, c); }
  }

  function menuClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const G = window.G, a = b.dataset.a, v = b.dataset.v;
    if (a === 'tab') return showTab(v);
    if (a === 'slot') {
      const i = +v, it = G.player.inv[i];
      if (i === selInv && it && (it.id === 'food' || it.id === 'bandage')) { G.useItem(i); if (!G.player.inv[i]) selInv = -1; } else selInv = i;
    } else if (a === 'use') { G.useItem(+v); if (!G.player.inv[+v]) selInv = -1; }
    else if (a === 'rec') selRec = v;
    else if (a === 'eq') G.equip(v);
    else if (a === 'un') G.unequip(v);
    else if (a === 'drop') { G.drop(+v); if (!G.player.inv[+v]) selInv = -1; }
    else if (a === 'craft') { if (G.craft && G.craft(v) !== false) say('Fabricou: ' + nm(G.recipes.find((r) => r.id === v).out)); }
    else if (a === 'guide') { guideOpen = v; return listGuide(); }
    else if (a === 'mute') toggleMute();
    else if (a === 'exit') { try { G.save(); } catch (er) {} toggleMenu(false); return openStart(); }
    else if (a === 'delw') { toggleMenu(false); return UI._askDelete(G.slot); }
    showTab(curTab);
  }

  function buildMenu() {
    if (menuEl.firstChild) return;
    const tabs = el('div', null, menuEl, '', 'tabs');
    for (const [ic, nome, id] of ABAS) {
      const b = el('button', null, tabs, svg(ic) + '<span>' + nome + '</span>'); b.dataset.a = 'tab'; b.dataset.v = id; tabBtns[id] = b;
    }
    const x = el('button', null, tabs, '✕', 'x'); x.setAttribute('aria-label', 'Fechar');
    x.addEventListener('click', () => toggleMenu(false));
    for (const [, , id] of ABAS) panes[id] = el('div', 'tab-' + id, menuEl, '', 'pane' + (['inv', 'equip', 'craft'].includes(id) ? ' cols ip' : ''));
    menuEl.addEventListener('click', menuClick);
    document.addEventListener('pointerdown', (e) => { if (UI.paused && startEl.classList.contains('hidden') && !menuEl.contains(e.target) && !E.menuB.contains(e.target)) toggleMenu(false); });
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', () => { menuEl.style.height = Math.min(window.innerHeight * .86, vv.height - 8) + 'px'; });
  }
  const lsGet = (k) => { try { return localStorage[k]; } catch (e) { return null; } };
  const hide = (e, v) => e.classList.toggle('hidden', v);
  const TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';

  function openStart() {
    const G = window.G, sl = G.slots();
    UI.paused = true; hide(deadEl, true); hide(tourEl, true); tourStep = -1; document.getElementById('ui').classList.remove('morto');
    startEl.querySelector('.cards').innerHTML = [0, 1, 2].map((i) => {
      const s = sl[i];
      return '<div class="card" role="button" tabindex="0" data-i="' + i + '">' + (s
        ? '<b>' + fmt(s.t) + '</b><span>Seed ' + (s.seed >>> 0).toString(36).slice(-5).toUpperCase() + '</span><button class="del" data-del="' + i + '" aria-label="Apagar">' + TRASH + '</button>'
        : '<b>Novo mundo</b><span>Slot ' + (i + 1) + '</span>') + '</div>';
    }).join('');
    hide(startEl, false);
  }
  function play(i) {
    const G = window.G;
    if (!(G.slots()[i] && G.load(i + 1))) G.init(Date.now(), i + 1);
    hide(startEl, true); UI.paused = false;
    if (!lsGet('zl1.tour')) tourGo(0);
  }
  function buildStart() {
    startEl = el('div', 'start', root, '<h1>Zumbilândia</h1><div class="cards"></div>');
    confirmEl = el('div', 'confirm', root, '<p>Apagar o mundo?</p><div class="row2"><button class="big sim">SIM</button><button class="big">NÃO</button></div>', 'hidden');
    let del = -1;
    // também usado por Ajustes ▸ "Apagar este mundo" (mesma confirmação)
    UI._askDelete = (slot) => { del = slot - 1; UI.paused = true; hide(confirmEl, false); };
    startEl.addEventListener('click', (e) => {
      const d = e.target.closest('[data-del]'), c = e.target.closest('.card');
      if (d) { del = +d.dataset.del; return hide(confirmEl, false); }
      if (c) play(+c.dataset.i);
    });
    confirmEl.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('sim')) { try { window.G.wipe(del + 1); } catch (er) {} openStart(); }
      else if (startEl.classList.contains('hidden')) UI.paused = false; // NÃO vindo do jogo: volta a jogar
      hide(confirmEl, true);
    });
  }
  function buildDead() {
    deadEl = el('div', 'dead', root, '<h1>Você morreu</h1><p class="t"></p><p>Seus itens ficaram na tumba (marcada no mapa)</p><button class="big">RENASCER</button>', 'hidden');
    deadEl.querySelector('button').addEventListener('click', () => {
      try { window.G.respawn(); } catch (e) {}
      hide(deadEl, true); document.getElementById('ui').classList.remove('morto');
    });
  }
  const PASSOS = [['#joy', 'Arraste o joystick para andar. Empurre até a borda para correr.'], ['#btn-attack', 'Toque ATACAR para bater nos zumbis.'], ['#btn-action', 'Perto de um móvel, toque BUSCAR e fique parado.'], ['#btn-menu', 'Abra o MENU e veja sua mochila.'], ['#btn-menu', 'No MENU, abra a aba Mapa.']];
  function tourGo(n) {
    tourStep = n;
    if (n >= PASSOS.length) { try { localStorage['zl1.tour'] = 'done'; } catch (e) {} return hide(tourEl, true); }
    const p = window.G.player; tourPos = [p.x, p.y];
    const r = document.querySelector(PASSOS[n][0]).getBoundingClientRect(), c = tourEl.querySelector('.cut');
    c.dataset.target = PASSOS[n][0];
    Object.assign(c.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
    tourEl.querySelector('i').textContent = (n + 1) + '/' + PASSOS.length;
    tourEl.querySelector('span').textContent = PASSOS[n][1];
    hide(tourEl, false);
  }
  function buildTour() {
    tourEl = el('div', 'tour', root, '<div class="cut"></div><div class="tip"><i></i><span></span><div><button data-k="n">Próximo</button><button data-k="p">Pular tour</button></div></div>', 'hidden');
    tourEl.addEventListener('click', (e) => {
      const k = e.target.closest('button');
      if (k) tourGo(k.dataset.k === 'p' ? 9 : tourStep + 1);
    });
  }
  // avanca quando o jogador faz a acao (chamado em draw, antes de limpar events)
  function tourTick(G, p) {
    const t = tourStep, ev = G.events;
    const ok = t === 0 ? Math.hypot(p.x - tourPos[0], p.y - tourPos[1]) > 3
      : t === 1 ? ev.some((e) => e.type === 'swing' || e.type === 'shot')
      : t === 2 ? ev.some((e) => e.type === 'crateOpen')
      : t === 3 ? UI.paused
      : UI.paused && curTab === 'map';
    if (ok) tourGo(t + 1);
  }
  function deadTick(G) {
    if (!G.dead || !startEl.classList.contains('hidden') || !deadEl.classList.contains('hidden')) return;
    deadEl.querySelector('.t').textContent = 'sobreviveu ' + fmt(G.t);
    hide(deadEl, false); document.getElementById('ui').classList.add('morto');
  }

  function init(r) {
    root = r;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    const hud = el('div', 'hud', root);
    E.hp = el('div', 'hp', hud, svg('heart') + '<div class="bar"><i></i></div>', 'pill');
    E.hunger = pill('hunger', 'apple', 0, 0, hud);
    E.stamina = el('div', 'stamina', hud, '<div class="bar"><i></i></div>', 'pill hidden');
    E.armor = pill('armor', 'shield', 0, 0, hud);
    E.time = el('div', 'time', hud, '00:00');
    E.hint = el('div', 'hint', hud, '<span></span><button>ver no guia</button>', 'hidden');
    E.hint.lastChild.addEventListener('click', () => { if (hintGuia) { guideOpen = hintGuia; guideQ = ''; curTab = 'guide'; } toggleMenu(true); });
    E.toast = el('div', 'toast', hud, '', 'hidden');
    E.flash = el('div', 'flash', hud, '', 'hidden');
    const joyEl = el('div', 'joy', hud, '<div class="base"><svg class="marca" viewBox="0 0 120 120"><circle cx="60" cy="60" r="54"/></svg><div class="nub"></div></div><div class="zona"></div>');
    E.joy = joyEl; E.nub = joyEl.querySelector('.nub');
    E.crouch = btn('btn-crouch', hud, svg('crouch')); E.crouch.setAttribute('aria-label', 'Agachar');
    E.atk = btn('btn-attack', hud, svg('hit') + 'ATACAR');
    E.fuel = el('div', 'fuel', hud, svg('pump') + '<span>0</span>', 'pill hidden');
    E.re = el('div', 're', hud, 'RÉ', 'pill hidden');
    E.act = btn('btn-action', hud, '', 'hidden');
    E.act.className = 'hidden';
    // anel de progresso da BUSCA (stroke-dashoffset = 1 - t; pathLength=1)
    const tp = document.createElement('template');
    tp.innerHTML = '<svg class="ring" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="39" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" transform="rotate(-90 42 42)"/></svg>';
    E.ring = tp.content.firstChild; E.act.appendChild(E.ring);
    E.wpn = btn('btn-weapon', hud, '');
    E.menuB = btn('btn-menu', hud, svg('menu'));
    E.mute = btn('btn-mute', hud, svg('muted'));
    E.menuB.setAttribute('aria-label', 'Menu'); E.mute.setAttribute('aria-label', 'Mudo');
    menuEl = el('div', 'menu', root, '', 'hidden');

    hold(E.atk, () => { held.atk = true; }, () => { held.atk = false; });
    hold(E.act, () => { pend = true; held.act = true; intT = performance.now(); }, () => { intT = 0; held.act = false; });
    hold(E.wpn, () => window.G.switchWeapon());
    hold(E.menuB, () => toggleMenu());
    hold(E.mute, toggleMute);
    hold(E.crouch, () => { crouchPend = true; });

    joyEl.addEventListener('pointerdown', (e) => {
      if (joy.id !== null) return;
      e.preventDefault();
      joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyEl.classList.add('active');
      const b = joyEl.firstChild.getBoundingClientRect();
      joy.cx = b.left + 60; joy.cy = b.top + 60;
      move(e);
    });
    const move = (e) => {
      if (e.pointerId !== joy.id) return;
      let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
      let d = Math.hypot(dx, dy);
      if (joyEl.classList.contains('car')) { dx = Math.max(-60, Math.min(60, dx)); dy = Math.max(-60, Math.min(60, dy)); d = Math.max(Math.abs(dx), Math.abs(dy)); }
      else if (d > 90) { dx *= 90 / d; dy *= 90 / d; }
      const k = d > 60 ? 60 / Math.min(d, 90) : 1; // dentro do raio: velocidade proporcional; alem: so a zona de corrida
      joy.mx = dx * k / 60; joy.my = dy * k / 60;
      if (!joyEl.classList.contains('car')) { if (d >= 81) joy.run = true; else if (d < 69) joy.run = false; } // zona externa: liga >= 1,35x o raio, desliga < 1,15x
      E.nub.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    };
    const rel = (e) => {
      if (e.pointerId !== joy.id) return;
      joy.id = null; joy.mx = joy.my = 0; joy.run = false; joyEl.classList.remove('active'); E.nub.style.transform = '';
    };
    joyEl.addEventListener('pointermove', move);
    joyEl.addEventListener('pointerup', rel);
    joyEl.addEventListener('pointercancel', rel);

    const typing = (e) => /^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName);
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'KeyQ') window.G.switchWeapon();
      else if (e.code === 'Escape' || e.code === 'Tab') toggleMenu();
      else if (e.code === 'KeyM') toggleMute();
      else if (e.code === 'KeyE') { pend = true; intT = performance.now(); }
      else if (e.code === 'KeyC') crouchPend = true;
    });
    window.addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyE') intT = 0; });
    window.addEventListener('blur', () => { keys.clear(); held.atk = held.act = false; intT = 0; });
    // tocar para vasculhar: toque rapido no mundo (fora de #ui) => R.pick -> target + interact
    const tp0 = {};
    document.addEventListener('pointerdown', (e) => { tp0[e.pointerId] = { x: e.clientX, y: e.clientY, t: performance.now(), ok: !(e.target.closest && e.target.closest('#ui')) }; });
    document.addEventListener('pointercancel', (e) => { delete tp0[e.pointerId]; });
    document.addEventListener('pointerup', (e) => {
      const d = tp0[e.pointerId]; delete tp0[e.pointerId];
      if (!d || !d.ok || UI.paused || performance.now() - d.t > 300 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
      try { const a = window.R && R.pick && R.pick(e.clientX, e.clientY); if (a) tapT = { type: a.type, id: a.id }; } catch (er) {}
    });
    buildStart(); buildDead(); buildTour(); buildCont(); openStart();
  }

  function draw(G) {
    if (!root) return;
    const p = G.players[0], inp = p.input, now = performance.now();
    const kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const ky = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    const k = kx && ky ? Math.SQRT1_2 : 1, pz = UI.paused;
    const car = G.cars && G.cars.find((c) => c.id === p.car);
    const zm = (v) => (Math.abs(v) < .12 ? 0 : v); // zona morta do volante
    inp.mx = pz ? 0 : joy.id !== null ? (car ? zm(joy.mx) : joy.mx) : kx * k;
    inp.my = pz ? 0 : joy.id !== null ? (car ? -zm(joy.my) : joy.my) : car ? -ky : ky * k; // no carro, para cima = acelerar
    inp.run = !pz && (joy.run || keys.has('ShiftLeft') || keys.has('ShiftRight'));
    if (crouchPend && !pz) inp.crouch = true; // pulso: o game alterna e zera
    crouchPend = false;
    inp.attack = !pz && !car && (held.atk || keys.has('Space'));
    const cutD = !!(p.near && p.near.type === 'door' && p.near.locked && (p.inv || []).some((i) => i.id === 'cutter'));
    inp.hold = !pz && !car && (held.act || keys.has('KeyE')) && (cutD || !!(p.near && p.near.act));
    const fence = p.near && p.near.type === 'fence';
    if (fence && pend && !pz) inp.jump = true; // pulso: o game consome
    if (tapT && !pz) inp.target = tapT; // tocar para vasculhar: pulso
    inp.interact = !!(tapT && !pz) || !pz && !fence && !inp.hold && (pend || (intT > 0 && now - intT > 350)); // com act, segurar = hold, nao interact
    pend = false; tapT = null;

    // eventos (G empurra; UI limpa por ultimo)
    for (const ev of G.events) {
      if (ev.type === 'hurt') {
        flashUntil = now + 150; armorUntil = now + 3000;
        try { navigator.vibrate && navigator.vibrate(60); } catch (e) {}
      } else if (ev.type === 'equip') armorUntil = now + 3000;
      else if (ev.type === 'crateOpen') { E.toast.textContent = ev.item ? 'Encontrou: ' + (NOME[ev.item] || ev.item) : 'Vazio'; toastUntil = now + 2000; }
      else if (ev.type === 'full') { E.toast.textContent = 'Mochila cheia'; toastUntil = now + 2000; }
      else if (ev.type === 'hint') {
        E.hint.firstChild.textContent = ev.text; E.hint.classList.toggle('g', !!ev.guia); hintGuia = ev.guia || '';
        hintUntil = now + 4000; hintNear = p.near ? p.near.type + p.near.id : '';
      }
    }
    if (tourStep >= 0 && tourStep < PASSOS.length) tourTick(G, p);
    deadTick(G);
    G.events.length = 0;

    const nk = p.near ? p.near.type + p.near.id : '';
    if (hintUntil && (now > hintUntil || nk !== hintNear)) hintUntil = 0;
    put('hint', hintUntil > 0, (v) => E.hint.classList.toggle('hidden', !v));
    put('toast', now < toastUntil, (v) => E.toast.classList.toggle('hidden', !v));
    put('flash', now < flashUntil, (v) => E.flash.classList.toggle('hidden', !v));

    const hp = Math.round(p.hp || 0), hu = Math.round(p.hunger || 0);
    put('hp', hp, (v) => { fill(E.hp, v / 100); E.hp.classList.toggle('pulse', v < 30); });
    put('hu', hu < 50 ? hu : -1, (v) => { E.hunger.classList.toggle('hidden', v < 0); if (v >= 0) { fill(E.hunger, v / 100); E.hunger.classList.toggle('pulse', v < 20); } });
    const st = p.stamina == null ? 100 : Math.round(p.stamina);
    put('st', st < 100 ? st : -1, (v) => { E.stamina.classList.toggle('hidden', v < 0); if (v >= 0) fill(E.stamina, v / 100); });

    let cur = 0, mx = 0, low = false;
    for (const s of ['head', 'torso', 'legs']) { const it = p.equip && p.equip[s]; if (it) { cur += it.dur; mx += DUR[it.id] || it.dur || 1; } }
    low = mx > 0 && cur / mx < 0.3;
    put('arm', mx > 0 && (low || now < armorUntil) ? Math.round(cur / mx * 100) : -1, (v) => {
      E.armor.classList.toggle('hidden', v < 0);
      if (v >= 0) { fill(E.armor, v / 100); E.armor.firstChild.outerHTML = svg(v < 30 ? 'cracked' : 'shield'); }
    });

    put('time', fmt(G.t), (v) => { E.time.textContent = v; });

    contTick(G, p);
    const nr = p.open ? null : car ? { type: 'exit' } : p.near;
    const cutN = nr && nr.type === 'door' && nr.locked && (p.inv || []).some((i) => i.id === 'cutter');
    put('near', nr ? nr.type + (nr.open ? '1' : '0') + (nr.act || '') + (nr.locked ? (cutN ? 'c' : 'l') : '') : '', (v) => {
      E.act.classList.toggle('hidden', !v);
      E.act.classList.toggle('near', !!v);
      if (v) { const a = acaoDe(cutN ? Object.assign({ cut: 1 }, nr) : nr); E.act.innerHTML = svg(a[0]) + a[1]; E.act.appendChild(E.ring); }
    });
    const gc = (p.inv || []).find((i) => i.id === 'gascan'), sf = p.action && p.action.type === 'siphon';
    const sa = sf ? Math.min(1, ((p.action.act === 'pour' ? (G.cars.find((c) => c.id === p.action.id) || {}).fuel : gc && gc.fuel) || 0) / 10)
      : p.action && p.action.type === 'search' ? Math.min(1, Math.max(0, p.action.t || 0)) : p.action && p.action.type === 'cut' ? Math.min(1, Math.max(0, (p.action.t || 0) / 1.5)) : -1;
    put('ring', sa < 0 ? -1 : Math.round(sa * 100), (v) => {
      E.ring.classList.toggle('hidden', v < 0);
      if (v >= 0) E.ring.firstElementChild.setAttribute('stroke-dashoffset', String(1 - v / 100));
    });

    const fc = car || (p.near && (p.near.type === 'car' || p.near.type === 'trunk') ? p.near : null), fl = fc ? Math.round(fc.fuel * 10) / 10 : -1;
    put('fuel', fl, (v) => { E.fuel.classList.toggle('hidden', v < 0); E.fuel.lastChild.textContent = v < 0 ? '' : v.toFixed(1) + ' L'; });
    put('re', !!(car && car.speed < -.5), (v) => E.re.classList.toggle('hidden', !v));
    put('incar', !!car, (v) => {
      E.joy.classList.toggle('car', v); E.atk.classList.toggle('hidden', v); E.crouch.classList.toggle('hidden', v);
      if (v) { joy.mx = joy.my = 0; E.nub.style.transform = ''; }
    });
    const w = p.weapon, ranged = w === 'pistol', am = ranged ? p.ammo | 0 : -1;
    put('wpn', w + '|' + am, () => {
      E.atk.innerHTML = svg(w === 'molotov' ? 'fire' : 'hit') + (w === 'molotov' ? 'JOGAR' : 'ATACAR');
      const src = window.R && R.icon ? R.icon(w) : null;
      E.wpn.innerHTML = (src ? '<img src="' + src + '" alt="">' : ARMA[w] || w) + (ranged ? '<b' + (am ? '' : ' class="vazio"') + '>' + am + '</b>' : '');
    });
    put('mute', !!(window.SFX && SFX.muted && SFX.muted()), (v) => { E.mute.classList.toggle('m', v); E.mute.innerHTML = svg(v ? 'muted' : 'sound'); });
    put('run', !!p.running, (v) => E.joy.classList.toggle('run', v));
    put('crouch', !!p.crouch, (v) => E.crouch.classList.toggle('on', v));
  }

  window.UI = { init, draw, paused: false };
})();
