// mobile_overlay.js - Old2-style dark-fantasy mobile HUD + SVG icons + Chat history + QuickSlot picker for client.html?mobile=1.
// Communicates with the engine via:
//   * /m2w_cmd.py (JS -> Python bridge polled in LoginWindow, SelectCharacterWindow, GameWindow)
//   * /m2w_hud.json (Python -> JS HUD status + 8 quickslots + open_windows + chat_lines written every 15 frames)
//   * synthetic keyboard / mouse events for movement (WASD), attack (Space), UI LMB drag & camera RMB drag.
(function () {
  "use strict";
  var isTouchDevice = (function () {
    try {
      var ua = navigator.userAgent || "";
      if (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua)) return true;
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) return false;
      return ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    } catch (e) { return false; }
  })();
  var isMobile = /[?&]mobile=1(&|$)/.test(location.search) ||
    !!(window.m2w && window.m2w.config && window.m2w.config.mobile) ||
    !!(window.m2w && typeof window.m2w.isMobile === "function" && window.m2w.isMobile()) ||
    (!/[?&]mobile=0(&|$)/.test(location.search) && isTouchDevice);

  // ---------------------------------------------------------------- IDIOMA DO OVERLAY
  var M2I18N = { lang: "pt", texts: null };
  try {
    var _sp = new URLSearchParams(location.search);
    var _ql = _sp.get("lang") || _sp.get("deflang");
    var _bl = String((navigator.languages && navigator.languages[0]) || navigator.language || "").toLowerCase().slice(0, 2);
    var _lv = _ql || localStorage.getItem("m2w.uiLang") || localStorage.getItem("m2/lang") || ((_bl === "pt" || _bl === "en" || _bl === "pl") ? _bl : "pt");
    M2I18N.lang = String(_lv).toLowerCase().slice(0, 2) || "pt";
  } catch (e) { }

  // ---------------------------------------------------------------- FONTE "estilo Metin2"
  (function () {
    try {
      var fcss = document.createElement("style");
      if (M2I18N.lang === "pl") {
        fcss.textContent =
          "@font-face{font-family:'Tahoma';font-weight:400;font-display:swap;src:local('Tahoma'),url(fonts/tahoma.ttf) format('truetype')}" +
          "@font-face{font-family:'Tahoma';font-weight:700;font-display:swap;src:local('Tahoma Bold'),local('Tahoma-Bold'),local('Tahoma'),url(fonts/tahoma.ttf) format('truetype')}" +
          "@font-face{font-family:'M2Tahoma';font-weight:400;font-display:swap;src:local('Tahoma'),url(fonts/tahoma.ttf) format('truetype')}" +
          "@font-face{font-family:'M2Tahoma';font-weight:700;font-display:swap;src:local('Tahoma Bold'),local('Tahoma-Bold'),local('Tahoma'),url(fonts/tahoma.ttf) format('truetype')}" +
          "#m2o,#m2o *,#m2o-kb,#m2o-kb *,#m2o_loading,#m2o_loading *,#m2w_download,#m2w_download *{font-family:Tahoma,'Segoe UI',Roboto,Arial,sans-serif !important}";
      } else {
        fcss.textContent =
          "@font-face{font-family:'M2Tahoma';font-weight:400;font-display:swap;src:local('Tahoma'),url(fonts/DejaVuSansCondensed.woff) format('woff')}" +
          "@font-face{font-family:'M2Tahoma';font-weight:700;font-display:swap;src:local('Tahoma Bold'),local('Tahoma-Bold'),url(fonts/DejaVuSansCondensed-Bold.woff) format('woff')}" +
          "#m2o,#m2o *,#m2o-kb,#m2o-kb *,#m2o_loading,#m2o_loading *,#m2w_download,#m2w_download *{font-family:'M2Tahoma',Tahoma,'Segoe UI',sans-serif !important}";
      }
      (document.head || document.documentElement).appendChild(fcss);
    } catch (e) { }
  })();
  function trS(s) {
    if (!M2I18N.texts || M2I18N.lang === "pt" || !s) return s;
    var k = String(s).trim();
    var e = M2I18N.texts[k];
    if (!e) return s;
    var v = e[M2I18N.lang] || e.en;
    return v ? String(s).replace(k, v) : s;
  }
  function trTree(node) {
    if (!M2I18N.texts || M2I18N.lang === "pt" || !node) return;
    if (node.nodeType === 3) {
      var nv = trS(node.nodeValue);
      if (nv !== node.nodeValue) node.nodeValue = nv;
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.tagName === "SCRIPT" || node.tagName === "STYLE" || node.tagName === "CANVAS") return;
    ["title", "placeholder", "alt"].forEach(function (a) {
      var v = node.getAttribute && node.getAttribute(a);
      if (v) { var t = trS(v); if (t !== v) node.setAttribute(a, t); }
    });
    for (var c = node.firstChild; c; c = c.nextSibling) trTree(c);
  }
  (function loadOverlayI18n() {
    if (typeof fetch !== "function") return;
    fetch("i18n/overlay.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      M2I18N.texts = d.texts || {};
      var tips = d.tips && (d.tips[M2I18N.lang] || d.tips.en);
      if (tips && tips.length) { LOADING_TIPS = tips; }
      trTree(document.body);
      try {
        new MutationObserver(function (muts) {
          for (var i = 0; i < muts.length; i++) {
            var m = muts[i];
            if (m.type === "characterData") trTree(m.target);
            else if (m.type === "attributes") trTree(m.target);
            else for (var j = 0; j < m.addedNodes.length; j++) trTree(m.addedNodes[j]);
          }
        }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["title", "placeholder"] });
      } catch (e) { }
    }).catch(function () { });
  })();

  // ---------------------------------------------------------------- PWA, WebGL High-Performance, Persistent Storage & WakeLock
  (function initPwaAndDeviceBoost() {
    // 1. Force powerPreference: "high-performance" on WebGL context creation
    try {
      if (!window._m2wGlPatched && typeof HTMLCanvasElement !== "undefined") {
        window._m2wGlPatched = true;
        var origGetCtx = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, attrs) {
          if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") {
            attrs = Object.assign({ powerPreference: "high-performance" }, attrs || {}, { powerPreference: "high-performance" });
          }
          return origGetCtx.call(this, type, attrs);
        };
      }
    } catch (e) { }

    // 2. Register test-safe Service Worker (sw.js with updateViaCache: 'none')
    try {
      if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
        navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
          try { reg.update(); } catch (e) { }
        }).catch(function () { });
      }
    } catch (e) { }

    // 3. Protect IndexedDB (m2w-corpus maps & 3D models) from Android eviction
    try {
      if (navigator.storage && typeof navigator.storage.persist === "function") {
        navigator.storage.persist().catch(function () { });
      }
    } catch (e) { }

    // 4. Screen Wake Lock so the phone screen never dims/locks during gameplay
    var wakeLockSentinel = null;
    function requestWakeLock() {
      try {
        if ("wakeLock" in navigator && navigator.wakeLock && typeof navigator.wakeLock.request === "function") {
          if (wakeLockSentinel && !wakeLockSentinel.released) return;
          navigator.wakeLock.request("screen").then(function (sentinel) {
            wakeLockSentinel = sentinel;
          }).catch(function () { });
        }
      } catch (e) { }
    }
    requestWakeLock();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") requestWakeLock();
    });
    window.addEventListener("touchstart", requestWakeLock, { passive: true, once: true });
  })();

  // ---------------------------------------------------------------- helpers
  // JS -> Python: o jogo lê e apaga /m2w_cmd.py a cada 2 frames. Antes, cada chamada
  // SOBRESCREVIA o arquivo, então dois toques rápidos (ex.: poção + coletar) perdiam o
  // primeiro comando. Agora os comandos entram numa fila (anexados ao arquivo) e cada
  // um roda isolado em try/except, para que um erro não cancele os seguintes.
  function wrapPyChunk(code) {
    // Só ASCII no arquivo: letras acentuadas viram \uXXXX (a tela de seleção de
    // personagem lê o arquivo sem definir a codificação; um "ç" travava a fila).
    var lit = JSON.stringify(String(code)).replace(/[\u007f-\uffff]/g, function (ch) {
      return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4);
    });
    return "try:\n" +
      "    exec(compile(" + lit + ", '<m2o>', 'exec'), globals())\n" +
      "except Exception:\n" +
      "    __import__('traceback').print_exc()\n";
  }
  function runPy(code) {
    try {
      if (!window.Module || !Module.FS) { console.warn("[overlay] Module.FS not ready"); return false; }
      // Não mexe no sistema de arquivos antes do jogo iniciar (durante o download).
      if (!window.m2wFsReady) return false;
      var prev = "";
      try {
        if (Module.FS.analyzePath("/m2w_cmd.py").exists) prev = Module.FS.readFile("/m2w_cmd.py", { encoding: "utf8" });
      } catch (e2) { prev = ""; }
      if (prev && prev.length > 60000) prev = "";
      Module.FS.writeFile("/m2w_cmd.py", (prev ? prev + "\n" : "# m2oq " + Date.now() + "\n") + wrapPyChunk(code));
      return true;
    } catch (e) { console.error("[overlay] runPy failed", e); return false; }
  }
  var pyCmd = runPy;
  function fsExists(p) { try { return !!(window.Module && Module.FS && Module.FS.analyzePath(p).exists); } catch (e) { return false; } }
  function fsMtime(p) {
    try {
      var st = Module.FS.stat(p);
      var m = st && st.mtime;
      return m ? (typeof m === "number" ? m : (m.getTime ? m.getTime() : Number(m) || 0)) : 0;
    } catch (e) { return 0; }
  }
  function fsRm(p) { try { if (window.Module && Module.FS) Module.FS.unlink(p); } catch (e) { } }
  function pyActed(code, timeoutMs) {
    return new Promise(function (resolve) {
      fsRm("/m2w_acted");
      if (!runPy(code)) { resolve(false); return; }
      var t0 = Date.now();
      (function poll() {
        if (fsExists("/m2w_acted")) { fsRm("/m2w_acted"); resolve(true); return; }
        if (Date.now() - t0 > timeoutMs) { fsRm("/m2w_cmd.py"); resolve(false); return; }
        setTimeout(poll, 60);
      })();
    });
  }
  function safePy(lines) {
    var body = lines.map(function (l) { return "    " + l; }).join("\n");
    return "try:\n" + body + "\nexcept Exception as _e:\n" +
      "    try:\n        import chat\n        chat.AppendChat(chat.CHAT_TYPE_INFO, 'overlay: ' + str(_e))\n" +
      "    except Exception:\n        pass";
  }
  function chatCmd(cmd) { return "import net\nnet.SendChatPacket(" + JSON.stringify(cmd) + ")"; }

  // =========================================================================
  // CLASSIC 2009 METIN2 LOADING SCREEN (Wallpapers + Authentic 336x25 Gauge + Rotating Tips)
  // =========================================================================
  var loadCss = document.createElement("style");
  loadCss.textContent =
    "#m2o_loading{position:fixed;inset:0;z-index:999999;background-color:#050505;background-position:center center;background-repeat:no-repeat;background-size:cover;display:none;flex-direction:column;justify-content:space-between;align-items:center;pointer-events:auto;user-select:none;-webkit-user-select:none;transition:opacity 0.45s ease-out;opacity:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Tahoma,Arial,sans-serif;overflow:hidden}" +
    "#m2o_loading .m2-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at center,rgba(0,0,0,0) 42%,rgba(0,0,0,0.65) 80%,rgba(0,0,0,0.95) 100%),linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.5) 25%,transparent 55%)}" +
    "#m2o_loading .m2-branding{position:relative;z-index:2;margin-top:28px;text-align:center}" +
    "#m2o_loading .m2-title{font-family:'Cinzel','Trajan Pro','Georgia','Times New Roman',serif;font-size:28px;font-weight:700;letter-spacing:6px;color:#f7dfa0;text-shadow:0 2px 6px #000,0 0 16px rgba(184,150,80,0.7)}" +
    "#m2o_loading .m2-bottom{position:relative;z-index:2;width:100%;max-width:560px;display:flex;flex-direction:column;align-items:center;margin-bottom:24px;padding:0 16px;box-sizing:border-box}" +
    "#m2o_loading .m2-stage-row{display:flex;justify-content:space-between;align-items:center;width:336px;max-width:90vw;margin-bottom:8px;font-size:12.5px;font-weight:600;color:#f3dfb0;text-shadow:1px 1px 2px #000,-1px -1px 2px #000,1px -1px 2px #000,-1px 1px 2px #000}" +
    "#m2o_loading #m2_loading_stage{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "#m2o_loading #m2_loading_pct{color:#ffcb52;margin-left:8px;font-variant-numeric:tabular-nums}" +
    "#m2o_loading .m2-gauge-container{position:relative;width:336px;max-width:90vw;height:25px;margin-bottom:14px;box-shadow:0 3px 12px rgba(0,0,0,0.9);border-radius:2px}" +
    "#m2o_loading .m2-gauge-bg{position:absolute;inset:0;background:url('loading/gauge_empty.png') no-repeat center;background-size:336px 25px}" +
    "#m2o_loading .m2-gauge-fill-wrap{position:absolute;top:0;left:0;height:25px;width:0%;overflow:hidden;transition:width 0.12s linear}" +
    "#m2o_loading .m2-gauge-fill{width:336px;height:25px;background:url('loading/gauge_full.png') no-repeat left center;background-size:336px 25px}" +
    "#m2o_loading .m2-tip{text-align:center;color:#d8cbae;font-size:12px;font-style:italic;line-height:1.4;text-shadow:1px 1px 3px #000,0 0 6px rgba(0,0,0,0.95);min-height:34px;display:flex;align-items:center;justify-content:center;transition:opacity 0.3s ease}";
  document.head.appendChild(loadCss);

  var loadingEl = document.createElement("div");
  loadingEl.id = "m2o_loading";
  loadingEl.innerHTML =
    '<div class="m2-vignette"></div>' +
    '<div class="m2-branding"><div class="m2-title">METIN2</div></div>' +
    '<div class="m2-bottom">' +
      '<div class="m2-stage-row">' +
        '<span id="m2_loading_stage">Iniciando o jogo...</span>' +
        '<span id="m2_loading_pct">0%</span>' +
      '</div>' +
      '<div class="m2-gauge-container">' +
        '<div class="m2-gauge-bg"></div>' +
        '<div class="m2-gauge-fill-wrap" id="m2_loading_fill_wrap"><div class="m2-gauge-fill"></div></div>' +
      '</div>' +
      '<div class="m2-tip" id="m2_loading_tip">Dica: aperte Espa\u00E7o ou toque no bot\u00E3o de ataque para lutar.</div>' +
    '</div>';
  document.body.appendChild(loadingEl);

  var loadingStageEl = document.getElementById("m2_loading_stage");
  var loadingPctEl = document.getElementById("m2_loading_pct");
  var loadingFillWrap = document.getElementById("m2_loading_fill_wrap");
  var loadingTipEl = document.getElementById("m2_loading_tip");

  // Imagens de carregamento: usa TODAS as que existirem na pasta loading/, com o
  // nome loading0.jpg, loading1.jpg, loading2.jpg... (ou .png), sem limite de 6.
  // Elas são conferidas no servidor a cada abertura (cache "no-cache"), então trocar
  // uma imagem na pasta vale na próxima vez que o jogo abrir, sem limpar dados.
  var LOADING_WALLPAPERS = ["loading/loading0.jpg"];
  var loadingBlobUrl = null;
  (function discoverLoadingImages() {
    if (typeof fetch !== "function") return;
    var found = [];
    var MAX = 60;
    function probe(i) {
      if (i >= MAX) return finish();
      var tryExt = function (exts) {
        if (!exts.length) return finish();
        var url = "loading/loading" + i + "." + exts[0];
        fetch(url, { method: "HEAD", cache: "no-store" }).then(function (r) {
          if (r.ok && !/text\/html/i.test(r.headers.get("Content-Type") || "")) { found.push(url); probe(i + 1); }
          else tryExt(exts.slice(1));
        }).catch(function () { tryExt(exts.slice(1)); });
      };
      tryExt(["jpg", "png", "jpeg", "webp"]);
    }
    function finish() { if (found.length) LOADING_WALLPAPERS = found; }
    probe(0);
  })();
  function setLoadingWallpaper(url) {
    loadingEl.style.backgroundImage = "url('" + url + "')";
    if (typeof fetch !== "function") return;
    fetch(url, { cache: "no-cache" }).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
      if (!b || !loadingActive) return;
      if (loadingBlobUrl) { try { URL.revokeObjectURL(loadingBlobUrl); } catch (e) { } }
      loadingBlobUrl = URL.createObjectURL(b);
      loadingEl.style.backgroundImage = "url('" + loadingBlobUrl + "')";
    }).catch(function () { });
  }
  var LOADING_TIPS = [
    "Dica: aperte Espa\u00E7o ou toque no bot\u00E3o de ataque para lutar.",
    "Dica: Pedras Espirituais podem ser encaixadas em armas e armaduras no Ferreiro.",
    "Dica: use Po\u00E7\u00F5es Vermelhas e Azuis para recuperar HP e MP rapidamente.",
    "Dica: as habilidades de montaria evoluem depois que voc\u00EA consegue um Cavalo de Batalha ou Militar.",
    "Dica: itens podem ser aprimorados no Ferreiro da primeira vila.",
    "Dica: aperte Z ou toque no \u00EDcone da m\u00E3o para pegar rapidamente os itens do ch\u00E3o.",
    "Dica: grupos de monstros s\u00E3o agressivos e atacam quando voc\u00EA chega perto demais.",
    "Dica: habilidades com 17 a 20 pontos podem subir para o n\u00EDvel Mestre (M1).",
    "Dica: arraste o dedo no lado direito da tela para girar a c\u00E2mera; use dois dedos para dar zoom.",
    "Dica: voc\u00EA pode fundar sua pr\u00F3pria guilda com o Guarda da Vila a partir do n\u00EDvel 40.",
    "Dica: toque duas vezes em um item ou NPC para usar o clique direito.",
    "Dica: peixes pescados em rios e lagos podem ser assados na fogueira."
  ];

  var loadingActive = false;
  var loadingCurPct = 0;
  var loadingTgtPct = 0;
  var loadingTipTimer = null;
  var loadingTipIdx = Math.floor(Math.random() * LOADING_TIPS.length);
  var lastLoadingRaw = "";

  function showLoadingScreen(initialStage) {
    if (loadingActive) return;
    loadingActive = true;
    loadingCurPct = 0;
    loadingTgtPct = 8;

    var wp = LOADING_WALLPAPERS[Math.floor(Math.random() * LOADING_WALLPAPERS.length)];
    setLoadingWallpaper(wp);
    loadingStageEl.textContent = initialStage || "Iniciando o jogo...";
    loadingPctEl.textContent = "0%";
    loadingFillWrap.style.width = "0%";

    loadingTipIdx = Math.floor(Math.random() * LOADING_TIPS.length);
    loadingTipEl.textContent = LOADING_TIPS[loadingTipIdx];
    loadingEl.style.display = "flex";
    requestAnimationFrame(function () {
      loadingEl.style.opacity = "1";
    });

    if (loadingTipTimer) clearInterval(loadingTipTimer);
    loadingTipTimer = setInterval(function () {
      loadingTipEl.style.opacity = "0";
      setTimeout(function () {
        loadingTipIdx = (loadingTipIdx + 1) % LOADING_TIPS.length;
        loadingTipEl.textContent = LOADING_TIPS[loadingTipIdx];
        loadingTipEl.style.opacity = "1";
      }, 300);
    }, 4500);
  }

  // As etapas de carregamento vêm do motor (Python) em polonês: traduzimos aqui.
  var STAGE_PT = {
    "Inicjalizacja gry...": "Iniciando o jogo...",
    "Inicjalizacja...": "Iniciando...",
    "Wczytywanie mapy i terenu...": "Carregando mapa e terreno...",
    "Wczytywanie audio...": "Carregando \u00E1udio...",
    "Wczytywanie efektow...": "Carregando efeitos...",
    "Wczytywanie modeli postaci...": "Carregando modelos dos personagens...",
    "Rejestracja animacji walki...": "Registrando anima\u00E7\u00F5es de combate...",
    "Rejestracja zbroi i broni...": "Registrando armaduras e armas...",
    "Rejestracja umiejetnosci...": "Registrando habilidades...",
    "Wczytywanie skilli...": "Carregando habilidades...",
    "Wczytywanie potworow...": "Carregando monstros...",
    "Wczytywanie NPC...": "Carregando NPCs...",
    "Wczytywanie obiektow...": "Carregando objetos...",
    "Wczytywanie swiata gry...": "Carregando o mundo do jogo...",
    "Wejscie do gry...": "Entrando no jogo...",
    "Wczytywanie postaci...": "Carregando personagem..."
  };
  function trStage(stage) {
    if (!stage) return stage;
    var k = String(stage).trim();
    return STAGE_PT[k] || k;
  }

  function updateLoadingProgress(pct, stage) {
    stage = trStage(stage);
    if (!loadingActive) showLoadingScreen(stage);
    loadingTgtPct = Math.max(loadingTgtPct, Math.min(100, pct));
    if (stage) loadingStageEl.textContent = stage;
  }

  function hideLoadingScreen() {
    if (!loadingActive) return;
    loadingTgtPct = 100;
    loadingCurPct = 100;
    loadingStageEl.textContent = "Entrando no jogo...";
    loadingPctEl.textContent = "100%";
    loadingFillWrap.style.width = "100%";

    setTimeout(function () {
      loadingEl.style.opacity = "0";
      setTimeout(function () {
        loadingEl.style.display = "none";
        loadingActive = false;
        if (loadingTipTimer) {
          clearInterval(loadingTipTimer);
          loadingTipTimer = null;
        }
      }, 450);
    }, 300);
  }

  // Smooth progress glide
  setInterval(function () {
    if (!loadingActive) return;
    if (loadingCurPct < loadingTgtPct) {
      var step = Math.max(1, (loadingTgtPct - loadingCurPct) * 0.22);
      loadingCurPct = Math.min(loadingTgtPct, loadingCurPct + step);
      var disp = Math.round(loadingCurPct);
      loadingPctEl.textContent = disp + "%";
      loadingFillWrap.style.width = loadingCurPct + "%";
    }
  }, 40);

  // Loading polling interval (only reads /m2w_hud.json while loadingActive is true!)
  var hadLoadingFile = false;
  setInterval(function () {
    try {
      if (!window.Module || !Module.FS) return;
      if (fsExists("/m2w_loading.json")) {
        hadLoadingFile = true;
        var raw = Module.FS.readFile("/m2w_loading.json", { encoding: "utf8" });
        if (raw !== lastLoadingRaw) {
          lastLoadingRaw = raw;
          var d = JSON.parse(raw);
          if (d && d.loading) {
            updateLoadingProgress(d.progress || 0, d.stage);
          }
        }
      } else if (hadLoadingFile && loadingActive) {
        hadLoadingFile = false;
        lastLoadingRaw = "";
        hideLoadingScreen();
      }
      if (loadingActive && fsExists("/m2w_hud.json")) {
        var rawHud = Module.FS.readFile("/m2w_hud.json", { encoding: "utf8" });
        var dh = JSON.parse(rawHud);
        if (dh && dh.max_hp > 0) {
          hadLoadingFile = false;
          hideLoadingScreen();
        }
      }
    } catch (e) { }
  }, 120);

  if (!isMobile) return;

  var KEYS = {
    W: 87, A: 65, S: 83, D: 68, R: 82, F: 70,
    Q: 81, E: 69, T: 84, G: 71, TAB: 9,
    SPACE: 32, Z: 90, I: 73, K: 75, P: 80, ESC: 27, ENTER: 13, SHIFT: 16,
    N1: 49, N2: 50, N3: 51, N4: 52, F1: 112, F2: 113, F3: 114, F4: 115
  };
  var KEYNAME = {
    87: "w", 65: "a", 83: "s", 68: "d", 82: "r", 70: "f",
    81: "q", 69: "e", 84: "t", 71: "g", 9: "Tab",
    32: " ", 90: "z", 73: "i", 75: "k", 80: "p", 27: "Escape", 13: "Enter", 16: "Shift",
    49: "1", 50: "2", 51: "3", 52: "4", 112: "F1", 113: "F2", 114: "F3", 115: "F4"
  };
  var KEYCODE = {
    87: "KeyW", 65: "KeyA", 83: "KeyS", 68: "KeyD", 82: "KeyR", 70: "KeyF",
    81: "KeyQ", 69: "KeyE", 84: "KeyT", 71: "KeyG", 9: "Tab",
    32: "Space", 90: "KeyZ", 73: "KeyI", 75: "KeyK", 80: "KeyP", 27: "Escape", 13: "Enter", 16: "ShiftLeft",
    49: "Digit1", 50: "Digit2", 51: "Digit3", 52: "Digit4", 112: "F1", 113: "F2", 114: "F3", 115: "F4"
  };

    var hapticsEnabled = (localStorage.getItem("m2o_haptics") !== "false");
  function haptic(pattern) {
    if (!hapticsEnabled) return;
    if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
      try { navigator.vibrate(pattern); } catch (e) { }
    }
  }
  function markInputActive() {
    window._m2oInputActiveUntil = performance.now() + 900;
  }

  function canvasEl() { return (window.Module && Module.canvas) || document.getElementById("canvas"); }

  function sendKey(keyCode, isDown) {
    var type = isDown ? "keydown" : "keyup";
    function make(bubbles) {
      var ev = new KeyboardEvent(type, {
        key: KEYNAME[keyCode] || "", code: KEYCODE[keyCode] || "",
        bubbles: bubbles, cancelable: true, composed: true,
        shiftKey: !!(keyCode === 16 ? isDown : (typeof shiftActive !== "undefined" && shiftActive))
      });
      try {
        Object.defineProperty(ev, "keyCode", { get: function () { return keyCode; } });
        Object.defineProperty(ev, "which", { get: function () { return keyCode; } });
        Object.defineProperty(ev, "charCode", { get: function () { return 0; } });
      } catch (e) { }
      return ev;
    }
    var c = canvasEl();
    if (c) c.dispatchEvent(make(false));
    window.dispatchEvent(make(false));
  }
  function tapKey(k, ms) { sendKey(k, true); setTimeout(function () { sendKey(k, false); }, ms || 55); }

  function keyEv(name) {
    var o = { key: name, bubbles: false, cancelable: true, composed: true };
    window.dispatchEvent(new KeyboardEvent("keydown", o));
    window.dispatchEvent(new KeyboardEvent("keyup", o));
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function typeText(str) {
    for (var i = 0; i < str.length; i++) {
      keyEv(str[i]);
      if (i % 8 === 7) await wait(15);
    }
  }
  async function clearField(n) {
    for (var i = 0; i < (n || 40); i++) { keyEv("Backspace"); if (i % 10 === 9) await wait(10); }
  }
  var busy = false;
  function typeIntoActive() {
    if (kbPref() !== "native" && typeof openGameKbManual === "function") { openGameKbManual(); return; }
    if (busy) return;
    var t = prompt("Digite o texto para o campo ativo:");
    if (t === null || t === "") return;
    busy = true;
    typeText(t).then(function () { busy = false; }, function () { busy = false; });
  }
  function loginFlow() {
    if (busy) return;
    var ls = null;
    try { ls = window.localStorage; } catch (e) { }
    var u = prompt("Usu\u00E1rio:", (ls && ls.getItem("m2o.login")) || "");
    if (u === null) return;
    var pw = prompt("Senha:", (ls && ls.getItem("m2o.pass")) || "");
    if (pw === null) return;
    try { ls.setItem("m2o.login", u); ls.setItem("m2o.pass", pw); } catch (e) { }
    busy = true;
    var loginPy =
      "try:\n" +
      "    if hasattr(self, 'rulesDialog') and self.rulesDialog:\n" +
      "        self.rulesDialog.Hide()\n" +
      "    if hasattr(self, '_LoginWindow__OnClickSelectServerButton'):\n" +
      "        self._LoginWindow__OnClickSelectServerButton()\n" +
      "    if hasattr(self, 'idEditLine') and hasattr(self, 'pwdEditLine'):\n" +
      "        self.idEditLine.SetText(" + JSON.stringify(u) + ")\n" +
      "        self.pwdEditLine.SetText(" + JSON.stringify(pw) + ")\n" +
      "        getattr(self, '_LoginWindow__OnClickLoginButton')()\n" +
      "        open('/m2w_acted', 'w').close()\n" +
      "except Exception as _e:\n" +
      "    print(_e)";
    pyActed(loginPy, 1500).then(function (ok) {
      if (ok) { busy = false; return; }
      return (async function () {
        await clearField(40);
        await typeText(u);
        keyEv("Enter");
        await wait(120);
        await clearField(40);
        await typeText(pw);
        await wait(60);
        keyEv("Enter");
      })();
    }).then(function () { busy = false; }, function () { busy = false; });
  }
  function enterStartFlow() {
    showLoadingScreen("Carregando personagem...");
    var py =
      "try:\n" +
      "    if type(self).__name__ == 'SelectCharacterWindow' and (hasattr(self, 'StartGameButton') or hasattr(self, 'StartGame')):\n" +
      "        self.StartGame()\n" +
      "        open('/m2w_acted', 'w').close()\n" +
      "except Exception as _e:\n" +
      "    print(_e)";
    pyActed(py, 500).then(function (ok) { if (!ok) tapKey(KEYS.ENTER, 40); });
  }
  function stretchCanvasEdgeToEdge() {
    try {
      var c = canvasEl();
      if (!c) return;
      c.style.setProperty("position", "fixed", "important");
      c.style.setProperty("inset", "0", "important");
      c.style.setProperty("top", "0", "important");
      c.style.setProperty("left", "0", "important");
      c.style.setProperty("width", "100dvw", "important");
      c.style.setProperty("height", "100dvh", "important");
      c.style.setProperty("max-width", "none", "important");
      c.style.setProperty("max-height", "none", "important");
      c.style.setProperty("object-fit", "fill", "important");
      c.style.setProperty("margin", "0", "important");
      c.style.setProperty("padding", "0", "important");
      c.style.setProperty("border", "none", "important");
      c.style.setProperty("display", "block", "important");
    } catch (e) { }
  }
  stretchCanvasEdgeToEdge();
  window.addEventListener("resize", stretchCanvasEdgeToEdge);
  window.addEventListener("orientationchange", stretchCanvasEdgeToEdge);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", stretchCanvasEdgeToEdge);
  document.addEventListener("fullscreenchange", stretchCanvasEdgeToEdge);
  document.addEventListener("webkitfullscreenchange", stretchCanvasEdgeToEdge);

  function ensureFullscreenAndLandscape() {
    stretchCanvasEdgeToEdge();
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        var d = document.documentElement;
        var p = d.requestFullscreen
          ? d.requestFullscreen({ navigationUI: "hide" })
          : (d.webkitRequestFullscreen && d.webkitRequestFullscreen());
        Promise.resolve(p).then(function () {
          stretchCanvasEdgeToEdge();
          try {
            if (screen.orientation && typeof screen.orientation.lock === "function") {
              screen.orientation.lock("landscape").catch(function () { });
            }
          } catch (e) { }
        }).catch(function () { });
      }
      if (screen.orientation && typeof screen.orientation.lock === "function") {
        screen.orientation.lock("landscape").catch(function () { });
      }
    } catch (e) { }
  }
  function toggleFullscreen() {
    ensureFullscreenAndLandscape();
  }
  document.addEventListener("touchstart", ensureFullscreenAndLandscape, { passive: true });
  document.addEventListener("touchend", ensureFullscreenAndLandscape, { passive: true });
  document.addEventListener("pointerdown", ensureFullscreenAndLandscape, { passive: true });
  document.addEventListener("click", ensureFullscreenAndLandscape, { passive: true });

  function mouse(type, x, y, button, dx, dy, buttonsMask) {
    var c = canvasEl();
    if (!c) return;
    var btns = typeof buttonsMask === "number" ? buttonsMask : (type === "mouseup" ? 0 : (button === 2 ? 2 : 1));
    var ev = new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, clientX: x, clientY: y,
      button: button, buttons: btns,
      movementX: dx || 0, movementY: dy || 0,
      shiftKey: !!(typeof shiftActive !== "undefined" && shiftActive)
    });
    try {
      var w = button === 2 ? 3 : (button === 1 ? 2 : 1);
      Object.defineProperty(ev, "which", { get: function () { return w; } });
    } catch (e) { }
    c.dispatchEvent(ev);
  }

  // ------------------------------------------------------------------- Old2 Gold-Copper SVG Icons
  function goldSvg(innerPaths, viewBox) {
    var vb = viewBox || "0 0 24 24";
    return '<svg viewBox="' + vb + '" xmlns="http://www.w3.org/2000/svg" class="m2o-svg">' +
      '<defs><linearGradient id="m2g" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#eef2f6"/>' +
      '<stop offset="52%" stop-color="#b8b09c"/>' +
      '<stop offset="100%" stop-color="#6e6656"/>' +
      '</linearGradient></defs>' +
      innerPaths +
      '</svg>';
  }

  var ICONS = {
    gear: goldSvg(
      '<path fill="url(#m2g)" stroke="#140f08" stroke-width="1.1" d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zm8.4 2.6l-1.7-.3a6.7 6.7 0 0 0-.6-1.5l1-1.4c.3-.4.2-.9-.1-1.2l-1.2-1.2c-.3-.3-.8-.4-1.2-.1l-1.4 1a6.7 6.7 0 0 0-1.5-.6l-.3-1.7C13.3 3.3 12.9 3 12.4 3h-1.6c-.5 0-.9.3-1 .8l-.3 1.7a6.7 6.7 0 0 0-1.5.6l-1.4-1c-.4-.3-.9-.2-1.2.1L4.2 6.4c-.3.3-.4.8-.1 1.2l1 1.4c-.3.5-.5 1-.6 1.5l-1.7.3c-.5.1-.8.5-.8 1v1.6c0 .5.3.9.8 1l1.7.3c.1.5.3 1 .6 1.5l-1 1.4c-.3.4-.2.9.1 1.2l1.2 1.2c.3.3.8.4 1.2.1l1.4-1c.5.3 1 .5 1.5.6l.3 1.7c.1.5.5.8 1 .8h1.6c.5 0 .9-.3 1-.8l.3-1.7c.5-.1 1-.3 1.5-.6l1.4 1c.4.3.9.2 1.2-.1l1.2-1.2c.3-.3.4-.8.1-1.2l-1-1.4c.3-.5.5-1 .6-1.5l1.7-.3c.5-.1.8-.5.8-1v-1.6c0-.5-.3-.9-.8-1z"/>'
    ),
    bag: goldSvg(
      '<path fill="url(#m2g)" stroke="#140f08" stroke-width="1.1" d="M9 4.5c0-1.1 1.3-2 3-2s3 .9 3 2v1h2.2c1.2 0 2.2 1 2.4 2.2l1.1 9.5c.2 1.7-1.1 3.3-2.8 3.3H6.1c-1.7 0-3-1.6-2.8-3.3l1.1-9.5C4.6 6.5 5.6 5.5 6.8 5.5H9v-1zm1.8 0v1h2.4v-1c0-.4-.5-.7-1.2-.7s-1.2.3-1.2.7zM6.2 11.2v2.2h4.1v1.3h3.4v-1.3h4.1v-2.2H13.7v-1h-3.4v1H6.2z"/>'
    ),
    char: goldSvg(
      '<path fill="url(#m2g)" stroke="#140f08" stroke-width="1.1" d="M12 3l4.2 2.2v4.3c0 2.6-1.8 4.8-4.2 5.4-2.4-.6-4.2-2.8-4.2-5.4V5.2L12 3zm-1.8 4.6v1.6h1.3v2.5h1v-2.5h1.3V7.6h-3.6zM5 19.8c0-2.6 3.2-4.3 7-4.3s7 1.7 7 4.3V21H5v-1.2z"/>'
    ),
    scroll: goldSvg(
      '<path fill="url(#m2g)" stroke="#140f08" stroke-width="1.1" d="M6.5 4h11a2 2 0 0 1 2 2v1.5a1.5 1.5 0 0 1-1.5 1.5H17v8a3 3 0 0 1-3 3H6.5a2.5 2.5 0 0 1 0-5H8V6a2 2 0 0 0-1.5-2zm2.5 4.5v1.4h6V8.5H9zm0 3v1.4h5v-1.4H9z"/>'
    ),
    horse: goldSvg(
      '<path fill="url(#m2g)" stroke="#140f08" stroke-width="1.1" d="M16.8 3.5l-2.3 1.7-2.2-.4-2.7 1.8L7 5.8 5 9.6l2.2 1.8 2.4-.6 1.1 1.4-3.7 4.6V20h10.4v-2.4l-1.9-4.5c1.5-1.5 2.5-3.6 2.5-6.1 0-1.3-.4-2.5-1.2-3.5zm-4.1 4.1a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>'
    ),
    gm: goldSvg(
      '<path fill="url(#m2g)" stroke="#140f08" stroke-width="1.1" d="M12 3l2.6 3.8 4.4-1.4-1.2 4.6 3.2 3.2-4.5 1.3-1.3 4.5-3.2-3.2-3.2 3.2-1.3-4.5-4.5-1.3 3.2-3.2L5 5.4l4.4 1.4L12 3zm0 6.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z"/>'
    ),
    swords: goldSvg(
      '<path fill="url(#m2g)" stroke="#120d06" stroke-width="1.15" d="M4.2 3.2l3.4.5 6.8 6.8 2.2-2.2-1.3-1.3 1.4-1.4 3.9 3.9-1.4 1.4-1.3-1.3-2.2 2.2 3.1 3.1 1.3-1.3 1.3 1.3-1.8 1.8 1.6 1.6-1.4 1.4-1.6-1.6-1.8 1.8-1.3-1.3 1.3-1.3-3.1-3.1-3.1 3.1 1.3 1.3-1.3 1.3-1.8-1.8-1.6 1.6-1.4-1.4 1.6-1.6-1.8-1.8 1.3-1.3 1.3 1.3 3.1-3.1-6.8-6.8-.5-3.4zm15.6 0l-.5 3.4-2.8 2.8-2.9-2.9 2.8-2.8 3.4-.5z"/>'
    ),
    hand: goldSvg(
      '<path fill="url(#m2g)" stroke="#140f08" stroke-width="1.1" d="M11.5 3.5a1.3 1.3 0 0 1 1.3 1.3v4.4h.7V4.6a1.3 1.3 0 0 1 2.6 0v4.9h.7V6.2a1.3 1.3 0 0 1 2.6 0v7.6c0 3.6-2.6 6.2-6.2 6.2H11c-2.6 0-4.7-1.4-5.8-3.8l-1.5-3.3a1.4 1.4 0 0 1 2.4-1.3l1.3 2V5.2a1.3 1.3 0 0 1 2.6 0v4h.7V4.8a1.3 1.3 0 0 1 1.3-1.3z"/>'
    ),
    slotsGrid: goldSvg(
      '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5" fill="url(#m2g)" stroke="#161008" stroke-width="1.1"/>' +
      '<rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" fill="url(#m2g)" stroke="#161008" stroke-width="1.1"/>' +
      '<rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" fill="url(#m2g)" stroke="#161008" stroke-width="1.1"/>' +
      '<rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" fill="url(#m2g)" stroke="#161008" stroke-width="1.1"/>'
    ),
    camMode: goldSvg(
      '<path fill="url(#m2g)" stroke="#140f08" stroke-width="1.1" d="M12 5c4.4 0 8.1 2.7 9.5 6.5-1.4 3.8-5.1 6.5-9.5 6.5S3.9 15.3 2.5 11.5C3.9 7.7 7.6 5 12 5zm0 2.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>'
    ),
    tapHand: goldSvg(
      '<path fill="url(#m2g)" stroke="#140f08" stroke-width="0.9" d="M12 2a1.5 1.5 0 0 1 1.5 1.5v6.5h.5a1.5 1.5 0 0 1 1.5 1.5v.5h.5a1.5 1.5 0 0 1 1.5 1.5v1.5a5.5 5.5 0 0 1-5.5 5.5h-1a5.5 5.5 0 0 1-5.5-5.5v-3.5a1.5 1.5 0 0 1 1.5-1.5h.5V8a1.5 1.5 0 0 1 3 0v2h1V3.5A1.5 1.5 0 0 1 12 2z"/>'
    ),
    lightning: goldSvg(
      '<path fill="url(#m2g)" stroke="#140f08" stroke-width="0.9" d="M13 2L4 13h6l-2 9 12-12h-7l2-8z"/>'
    ),
    divide: goldSvg(
      '<circle fill="url(#m2g)" cx="12" cy="5.5" r="2.2"/><rect fill="url(#m2g)" stroke="#140f08" stroke-width="0.7" x="4" y="10.5" width="16" height="3" rx="1.2"/><circle fill="url(#m2g)" cx="12" cy="18.5" r="2.2"/>'
    )
  };

  // ------------------------------------------------------------------- Authentic Metin2 Dark Steel & ThinBoard CSS
  var css = document.createElement("style");
  css.textContent =
    "html,body{margin:0 !important;padding:0 !important;width:100vw !important;height:100vh !important;width:100dvw !important;height:100dvh !important;overflow:hidden !important;background:#000 !important;position:fixed !important;inset:0 !important}" +
    "#canvas{position:fixed !important;inset:0 !important;top:0 !important;left:0 !important;width:100vw !important;height:100vh !important;width:100dvw !important;height:100dvh !important;max-width:none !important;max-height:none !important;object-fit:fill !important;margin:0 !important;padding:0 !important;border:none !important;display:block !important}" +
    "#m2o{position:fixed;top:0;bottom:0;left:env(safe-area-inset-left,0px);right:env(safe-area-inset-right,0px);z-index:9999;pointer-events:none;font:600 11.5px/1.2 Tahoma,'Segoe UI',Arial,sans-serif;color:#e2dfd7;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}" +
    "#m2o *{box-sizing:border-box}" +
    ":root{--sat:env(safe-area-inset-top,0px);--sar:env(safe-area-inset-right,0px);--sab:env(safe-area-inset-bottom,0px);--sal:env(safe-area-inset-left,0px)}" +
    "#m2o .settings-tabs{display:flex;gap:4px;margin-bottom:6px;border-bottom:1px solid #4a3e2e;padding-bottom:6px}" +
    "#m2o .settings-tabs button{flex:1;height:26px;font-size:10.5px;border-radius:2px;padding:0 6px;background:linear-gradient(180deg,#2a2c30 0%,#181a1d 100%);border:1px solid #5a503e;color:#b8b09c}" +
    "#m2o .settings-tabs button.active{background:linear-gradient(180deg,#524632 0%,#2d2518 100%);border-color:#ffd700;color:#fff2c4;font-weight:700}" +
    "#m2o .settings-pane{display:none;flex-direction:column;gap:7px}" +
    "#m2o .settings-pane.active{display:flex}" +
    "#m2o .net-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(88vw,330px);padding:16px 20px;text-align:center;background:rgba(12,14,18,0.95);border:10px solid transparent;border-image:url(icons/ui/thinboard_gold.png) 10 fill repeat;box-shadow:0 8px 32px rgba(0,0,0,0.95);z-index:999999;display:none;color:#e8d9b8;pointer-events:auto}" +
    "#m2o .net-modal button{background:linear-gradient(180deg,#474b50 0%,#2a2c30 100%);border:1px solid #786b52;color:#f3dfb0;box-shadow:0 2px 4px rgba(0,0,0,0.6)}" +
    "#m2o .net-modal button:active{background:linear-gradient(180deg,#25272b 0%,#383b40 100%);border-color:#b8b09c}" +
    "#m2o[data-scale=\"85\"] .hud-tl{transform:scale(0.82) !important;transform-origin:top left}" +
    "#m2o[data-scale=\"85\"] .tl-side{top:63px !important;transform:scale(0.82) !important;transform-origin:top left}" +
    "#m2o[data-scale=\"85\"] .joy{transform:scale(0.85) !important;transform-origin:bottom left}" +
    "#m2o[data-scale=\"85\"] .atk-btn,#m2o[data-scale=\"85\"] .pickup-btn,#m2o[data-scale=\"85\"] .qslot{transform:scale(0.85) !important;transform-origin:bottom right}" +
    "#m2o[data-scale=\"115\"] .hud-tl{transform:scale(1.1) !important;transform-origin:top left}" +
    "#m2o[data-scale=\"115\"] .tl-side{top:82px !important;transform:scale(0.95) !important;transform-origin:top left}" +
    "#m2o[data-scale=\"115\"] .joy{transform:scale(1.15) !important;transform-origin:bottom left}" +
    "#m2o[data-scale=\"115\"] .atk-btn,#m2o[data-scale=\"115\"] .pickup-btn,#m2o[data-scale=\"115\"] .qslot{transform:scale(1.15) !important;transform-origin:bottom right}" +

    "#m2o .m2o-svg{width:18px;height:18px;display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.95));pointer-events:none}" +
    "#m2o .gold-box{background:rgba(0,0,0,0.82);border:10px solid transparent;border-image:url(icons/ui/thinboard_9slice.png) 16 fill stretch;box-shadow:0 4px 14px rgba(0,0,0,0.92);color:#e2dfd7}" +
    "#m2o button{pointer-events:auto;touch-action:none;color:#e6e2d8;background:linear-gradient(180deg,#474b50 0%,#2b2e32 55%,#1c1e21 100%);border:1px solid #6c7075;box-shadow:inset 0 1px 0 rgba(255,255,255,0.16),inset 0 0 0 1px #232528,0 2px 4px rgba(0,0,0,0.85);font:inherit;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;text-shadow:1px 1px 1px #000}" +
    "#m2o button:active{background:linear-gradient(180deg,#25272b 0%,#383b40 100%);border-color:#9ea4ab;transform:scale(0.96)}" +
    /* Pre-world compact login helper bar */
    "#m2o .prebar{position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;gap:6px;flex-wrap:wrap;justify-content:center;z-index:10}" +
    "#m2o .prebar button{padding:5px 10px;border-radius:3px;font-size:11.5px;height:28px;white-space:nowrap;background:url(icons/ui/btn_steel_mid.png) center/100% 100% no-repeat;border:none;box-shadow:0 2px 4px rgba(0,0,0,0.85)}" +
    "#m2o .prebar button:active{background-image:url(icons/ui/btn_steel_mid_down.png)}" +
    /* 1. Top-left 100% Authentic Metin2 HUD from TaskBar.tga at compact 0.96x scale (~28% smaller) */
    "@keyframes rampageOrb{from{background-position:0 0}to{background-position:-680px 0}}" +
    "#m2o .hud-tl,#m2o .tl{position:absolute;top:5px;left:5px;width:158px;height:68px;transform:scale(0.96);transform-origin:top left;pointer-events:auto;z-index:20}" +
    "#m2o .hud-gauge-board{position:absolute;top:0;left:0;width:158px;height:47px;background:url(icons/ui/hud_gauge_board.png) no-repeat;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.85))}" +
    "#m2o .hud-orb{position:absolute;left:8px;top:4px;width:40px;height:40px;background:url(icons/ui/hud_orb_spritesheet.png) 0 0 no-repeat;animation:rampageOrb 1.35s steps(17) infinite;cursor:pointer;z-index:2}" +
    "#m2o .hud-orb-lv{position:absolute;left:28px;bottom:0px;transform:translateX(-50%);font-family:Tahoma,'Segoe UI',Arial,sans-serif;font-size:8.5px;font-weight:700;color:#e6d5a8;background:linear-gradient(180deg,#383b40 0%,#17191c 100%);border:1px solid #6c7075;border-radius:4px;padding:0 4px;white-space:nowrap;z-index:5;line-height:1.15;box-shadow:0 1px 3px rgba(0,0,0,0.95);text-shadow:1px 1px 0 #000;cursor:pointer;pointer-events:auto}" +
    "#m2o .hud-gauge-bar{position:absolute;left:59px;width:95px;overflow:hidden;z-index:2;cursor:pointer;pointer-events:auto}" +
    "#m2o .hud-gauge-bar:active{filter:brightness(1.2)}" +
    "#m2o .hud-bar-hp{top:14px;height:11px}" +
    "#m2o .hud-bar-mp{top:25px;height:11px}" +
    "#m2o .hud-bar-st{top:38px;height:6px}" +
    "#m2o .hud-gauge-trail{position:absolute;left:0;top:0;height:100%;width:0%;pointer-events:none;z-index:1;transition:width 0.55s cubic-bezier(0.22,1,0.36,1)}" +
    "#m2o .hud-bar-hp .hud-gauge-trail{background:linear-gradient(90deg,rgba(255,204,102,0.88) 0%,rgba(255,95,64,0.95) 100%)}" +
    "#m2o .hud-bar-mp .hud-gauge-trail{background:linear-gradient(90deg,rgba(148,216,255,0.88) 0%,rgba(77,171,247,0.95) 100%)}" +
    "#m2o .hud-bar-hp .hud-gauge-fill{position:relative;z-index:2;height:100%;width:0%;background:url(icons/ui/hud_hp_fill.png) left top no-repeat;transition:width 0.14s linear}" +
    "#m2o .hud-bar-mp .hud-gauge-fill{position:relative;z-index:2;height:100%;width:0%;background:url(icons/ui/hud_mp_fill.png) left top no-repeat;transition:width 0.14s linear}" +
    "#m2o .hud-bar-st .hud-gauge-fill{height:100%;width:100%;background:url(icons/ui/hud_st_fill.png) left top no-repeat}" +
    "#m2o .hud-gauge-txt{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-family:Tahoma,'Segoe UI',Arial,sans-serif;font-size:7px;font-weight:700;letter-spacing:0.2px;color:#fff;text-shadow:1px 1px 0 #000,-1px -1px 0 #000;pointer-events:none;z-index:3;line-height:10px;opacity:0.92}" +
    "#m2o.show-hud-num .hud-gauge-txt{display:flex}" +
    "#m2o .hud-exp-board{position:absolute;left:53px;top:43px;width:105px;height:25px;background:url(icons/ui/hud_exp_strip.png) no-repeat;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.85));cursor:pointer;pointer-events:auto;z-index:2}" +
    "#m2o .hud-exp-board:active{filter:drop-shadow(0 2px 4px rgba(0,0,0,0.85)) brightness(1.2)}" +
    "#m2o .hud-exp-socket{position:absolute;top:4px;width:19px;height:19px;overflow:hidden;pointer-events:none}" +
    "#m2o .hud-exp-point{position:absolute;left:0;bottom:0;width:19px;height:0%;background:url(icons/ui/hud_exp_point.png) left bottom no-repeat;background-size:19px 19px;transition:height 0.18s linear}" +
    "#m2o .target-pill{position:absolute;top:56px;left:50%;transform:translateX(-50%);padding:2px 9px;border-radius:10px;background:rgba(10,11,13,0.84);border:1px solid #786b52;box-shadow:0 2px 6px rgba(0,0,0,0.9);color:#f3dfb0;font:700 10px/1.3 Tahoma,'Segoe UI',sans-serif;text-shadow:1px 1px 1px #000;pointer-events:none;z-index:18;display:none;white-space:nowrap}" +
    /* Tooltip in authentic ThinBoard style placed on the RIGHT of HUD with z-index: 100000 so buttons never cover it */
    "#m2o .hud-tooltip{position:absolute;left:162px;top:8px;background:rgba(0,0,0,0.82);border:8px solid transparent;border-image:url(icons/ui/thinboard_9slice.png) 16 fill stretch;box-shadow:0 3px 10px rgba(0,0,0,0.95);padding:1px 6px;font-family:Tahoma,'Segoe UI',Arial,sans-serif;font-size:10.5px;font-weight:700;color:#e6e2d8;text-shadow:1px 1px 0 #000,-1px -1px 0 #000,0 1px 2px #000;white-space:nowrap;pointer-events:none;z-index:100000;opacity:0;transform:translateX(-4px);transition:opacity 0.16s ease,transform 0.16s ease;line-height:1.3;text-align:left}" +
    "#m2o .hud-tooltip.show{opacity:1;transform:translateX(0)}" +
    /* Steel buttons SLOTY / AUTO / LPM / PODZ directly below compact HUD */
    "#m2o .tl-side{position:absolute;top:75px;left:6px;display:flex;flex-direction:row;gap:3px;pointer-events:auto;z-index:20}" +
    "#m2o .tl-side button{position:relative;width:33px;height:16px;border:none;border-radius:2px;background:url(icons/ui/btn_steel_small.png) center/100% 100% no-repeat;box-shadow:0 1px 3px rgba(0,0,0,0.85);display:flex;flex-direction:row;align-items:center;justify-content:center;gap:1.5px;padding:0 2px;cursor:pointer}" +
    "#m2o .tl-side button:active{background-image:url(icons/ui/btn_steel_small_down.png);transform:scale(0.96)}" +
    "#m2o .tl-side button img{width:9.5px;height:9.5px;object-fit:contain;margin:0;pointer-events:none;filter:drop-shadow(0 1px 1px #000)}" +
    "#m2o .tl-side button .m2o-svg{width:9.5px;height:9.5px;margin:0;filter:drop-shadow(0 1px 1px #000)}" +
    "#m2o .tl-side button .mini-tag{position:static;font-family:Tahoma,'Segoe UI',Arial,sans-serif;font-size:6.8px;font-weight:700;letter-spacing:0.1px;color:#d8dde3;line-height:1;text-shadow:1px 1px 0 #000,-1px -1px 0 #000;pointer-events:none}" +
    "#m2o .tl-side button.active{background-image:url(icons/ui/btn_steel_small_over.png);box-shadow:0 0 5px rgba(216,221,227,0.45)}" +
    "#m2o .tl-side button.active .mini-tag{color:#ffe082}" +
    /* 2. Right edge below minimap - compact vertical column of 5 authentic icons in steel/antique-gold sockets */
    "#m2o .rcol{position:absolute;top:128px;right:10px;display:flex;flex-direction:column;gap:5px;align-items:center}" +
    "#m2o .rcol button{width:34px;height:34px;border-radius:50%;overflow:hidden;border:2px solid #786b52;outline:1px solid #1c1a17;background:url(icons/ui/slot_base.png) center/cover no-repeat,radial-gradient(circle,#1f2124 0%,#0c0d0f 100%);box-shadow:inset 0 0 0 1px #3a3429,inset 0 0 6px #000,0 2px 5px rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;padding:0}" +
    "#m2o .rcol button img{width:22px;height:22px;object-fit:contain;border-radius:50%;transform:scale(1.18);display:block;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.92))}" +
    "#m2o .rcol button:active{border-color:#b8b09c;transform:scale(0.94)}" +
    /* Popover menu under Gear */
    "#m2o .gear-menu{position:absolute;top:128px;right:50px;display:none;flex-direction:column;gap:4px;padding:4px;min-width:176px;pointer-events:auto;z-index:25}" +
    "#m2o .gear-menu.open{display:grid;grid-template-columns:1fr 1fr;max-height:calc(100vh - 136px);overflow-y:auto;min-width:330px;touch-action:pan-y}" +
    "#m2o .gear-menu button{width:100%;height:26px;padding:0 10px;border-radius:2px;justify-content:flex-start;gap:6px;font-size:11px;background:url(icons/ui/btn_steel_mid.png) center/100% 100% no-repeat;border:none}" +
    "#m2o .gear-menu button:active{background-image:url(icons/ui/btn_steel_mid_down.png)}" +
    /* GM modal */
    
    "#m2o .settings-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(94vw,420px);max-height:88vh;overflow-y:auto;padding:14px 18px;background:rgba(12,14,18,0.96);border:10px solid transparent;border-image:url(icons/ui/thinboard_gold.png) 10 fill repeat;box-shadow:0 8px 32px rgba(0,0,0,0.95);z-index:100005;display:none;flex-direction:column;gap:8px;color:#e8d9b8;pointer-events:auto;font-family:Tahoma,'Segoe UI',Arial,sans-serif}" +
    "#m2o .settings-modal.open{display:flex}" +
    "#m2o .settings-title{font-size:11px;font-weight:700;color:#f3dfb0;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #4a3e2e;padding-bottom:2px;margin-top:4px}" +
    "#m2o .settings-btns{display:flex;flex-wrap:wrap;gap:4px}" +
    "#m2o .settings-btns button{flex:1;min-width:70px;height:26px;padding:0 6px;font-size:10.5px;border-radius:2px;white-space:nowrap;background-image:url(icons/ui/btn_steel_mid_norm.png)}" +
    "#m2o .settings-btns button.active{border-color:#ffd700;color:#fff2c4;box-shadow:0 0 5px rgba(255,215,0,0.5);font-weight:700}" +
"#m2o .gm-modal{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:none;grid-template-columns:repeat(3,1fr);gap:5px;width:min(450px,92vw);max-height:82vh;overflow:auto;padding:6px;pointer-events:auto;z-index:35}" +
    "#m2o .gm-modal.open{display:grid}" +
    "#m2o .gm-modal button{min-height:32px;padding:4px 7px;border-radius:2px;font-size:11px;text-align:center}" +
    "#m2o .gm-modal .sep{grid-column:1/-1;color:#c8c2b4;font-size:10.5px;text-transform:uppercase;letter-spacing:0.5px;margin-top:3px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #3a3d42;padding-bottom:2px}" +
    /* 3. Bottom-right combat wheel (86x86px at right:52px, bottom:14px -> center 95,57) & 34x34 round slot_base medallions on R=84px */
    "#m2o .atk-btn{position:absolute;right:52px;bottom:14px;width:86px;height:86px;box-sizing:border-box;border-radius:50%;border:2.5px solid #786b52;outline:1px solid #1c1a17;background:radial-gradient(circle,#2a2d32 0%,#141619 72%,#090a0c 100%);box-shadow:inset 0 0 0 1.5px #3a3429,inset 0 0 8px #000,0 3px 10px rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;padding:0}" +
    "#m2o .atk-btn:active{background:radial-gradient(circle,#383c42 0%,#1b1e22 100%);border-color:#b8b09c;transform:scale(0.95)}" +
    "#m2o .atk-badge{position:absolute;top:-5px;right:-2px;background:linear-gradient(180deg,#3a3f47 0%,#181a1e 100%);border:1.5px solid #c89d46;border-radius:10px;padding:1px 5px;font-size:10px;font-weight:700;color:#ffe082;box-shadow:0 2px 5px rgba(0,0,0,0.9);pointer-events:none;display:none;z-index:4}" +
    "#m2o .qslot{position:absolute;width:34px;height:34px;box-sizing:border-box;border-radius:50%;overflow:hidden;border:2px solid #786b52;outline:1px solid #1c1a17;background:url(icons/ui/slot_base.png) center/cover no-repeat,radial-gradient(circle,#1b1d20 0%,#0b0c0e 100%);box-shadow:0 2px 6px rgba(0,0,0,0.95),inset 0 0 0 1px #3a3429,inset 0 0 5px #000;display:flex;align-items:center;justify-content:center;padding:0}" +
    "#m2o .qslot.filled{border-color:#9e9075;box-shadow:0 2px 8px rgba(0,0,0,0.95),inset 0 0 0 1px #4d4536,inset 0 0 5px #000}" +
    "#m2o .qslot.qs-cleared{border-color:#ff6b6b;box-shadow:0 0 10px rgba(255,90,90,0.85)}" +
    "#m2o .qslot.slot-attach-ready{border-color:#ffd984;box-shadow:0 0 10px rgba(255,217,132,0.85),inset 0 0 0 1px #ffd984}" +
    "#m2o .qslot .qs-art{position:absolute;inset:0;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;pointer-events:none}" +
    "#m2o .qslot .qs-art img{width:100%;height:100%;object-fit:cover;transform:scale(1.22);border-radius:50%;display:block}" +
    "#m2o .qslot .qs-art svg{width:100%;height:100%;display:block;transform:scale(1.15)}" +
    "#m2o .qslot:not(.filled) .qs-key{display:none}" +
    "#m2o .qslot .qs-empty{font-size:9.5px;font-weight:700;color:rgba(180,184,190,0.38);pointer-events:none}" +
    "#m2o .qslot .qs-key{position:absolute;top:2px;left:0;right:0;text-align:center;font-size:8.5px;font-weight:bold;color:#d8dde3;line-height:1;text-shadow:0 1px 2px #000,0 0 3px #000;z-index:3;pointer-events:none}" +
    "#m2o .qslot .qs-badge{position:absolute;bottom:2px;left:0;right:0;text-align:center;padding:0 2px;background:rgba(8,9,10,0.82);color:#fff;font-size:8px;font-weight:700;line-height:1.1;text-shadow:0 1px 2px #000,0 0 3px #000;z-index:3;pointer-events:none;white-space:nowrap}" +
    "#m2o .qslot .qs-badge:empty{display:none}" +
    /* 4. Bottom-left dark stone-steel joystick (matching Minimap shield) + steel medallion knob */
    "#m2o .joy{position:absolute;left:62px;bottom:22px;width:102px;height:102px;border-radius:50%;background:radial-gradient(circle,rgba(18,19,21,0.75) 0%,rgba(8,9,10,0.92) 100%);border:2px solid #6e6552;outline:1px solid #181715;box-shadow:inset 0 0 0 1.5px #332f26,inset 0 0 12px rgba(0,0,0,0.9),0 2px 8px rgba(0,0,0,0.8);pointer-events:auto;touch-action:none}" +
    "#m2o .joy::after{content:'';position:absolute;inset:8px;border-radius:50%;border:1px dashed rgba(120,107,82,0.42);pointer-events:none}" +
    "#m2o .joy i{position:absolute;left:30px;top:30px;width:40px;height:40px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#9ea4ab 0%,#494d52 60%,#1e2024 100%);border:1.5px solid #7d7058;box-shadow:inset 0 1px 1px rgba(255,255,255,0.35),0 2px 6px rgba(0,0,0,0.9);pointer-events:none;will-change:transform;transform:translate3d(0,0,0)}" +
    "#m2o .pickup-btn{position:absolute;left:12px;bottom:122px;width:34px;height:34px;border-radius:50%;border:2px solid #786b52;outline:1px solid #1c1a17;background:url(icons/ui/slot_base.png) center/cover no-repeat,radial-gradient(circle,#1f2124 0%,#0c0d0f 100%);box-shadow:inset 0 0 0 1px #3a3429,inset 0 0 6px #000,0 2px 5px rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;padding:0}" +
    "#m2o .pickup-btn img{width:22px;height:22px;object-fit:contain;display:block;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.92))}" +
    "#m2o .pickup-btn:active{border-color:#b8b09c;transform:scale(0.94)}" +
    /* 5. Bottom-center Chat History & Chat Input bar in authentic Metin2 ThinBoard + steel button style */
    "#m2o .chat-log{position:absolute;bottom:34px;left:50%;transform:translateX(-50%);width:min(520px,calc(100% - 300px));min-width:220px;height:76px;z-index:2;background:linear-gradient(180deg,rgba(0,0,0,0.22) 0%,rgba(0,0,0,0.72) 100%);border:1px solid rgba(110,96,70,0.48);border-bottom:none;border-radius:3px 3px 0 0;padding:3px 7px;overflow-y:auto;overflow-x:hidden;pointer-events:none;touch-action:pan-y;font:600 10.5px/1.3 Tahoma,'Segoe UI',sans-serif;text-shadow:1px 1px 1px #000;opacity:1;transition:opacity 0.45s ease}" +
    "#m2o .chat-log.interactive{pointer-events:auto}" +
    "#m2o .chat-log.faded{opacity:0;background-color:transparent;border-color:transparent;pointer-events:none}" +
    "#m2o .chat-log::-webkit-scrollbar{width:3px}" +
    "#m2o .chat-log::-webkit-scrollbar-thumb{background:rgba(140,146,154,0.55);border-radius:2px}" +
    "#m2o .chat-line{word-break:break-word;margin-bottom:1px;color:#f2ede2}" +
    "#m2o .chat-line.c-whisper{color:#58e66f}" +
    "#m2o .chat-line.c-notice{color:#e6c875}" +
    "#m2o .chat-line.c-guild{color:#76b9f0}" +
    "#m2o .chat-bar{position:absolute;bottom:5px;left:50%;transform:translateX(-50%);width:min(520px,calc(100% - 300px));min-width:220px;height:26px;background:rgba(8,9,12,0.82);border:1px solid rgba(110,94,64,0.72);border-image:none !important;box-shadow:inset 0 0 0 1px rgba(20,18,14,0.85),0 2px 6px rgba(0,0,0,0.8);border-radius:3px;display:flex;align-items:center;padding:0 4px;gap:4px;pointer-events:auto;transition:background 0.18s ease,border-color 0.18s ease,opacity 0.18s ease}" +
    "#m2o .chat-bar.typing{background:rgba(8,9,12,0.94);border-color:#c8a862;box-shadow:inset 0 0 0 1px #3a2f1d,0 0 6px rgba(200,168,98,0.32),0 2px 8px rgba(0,0,0,0.92);opacity:1 !important}" +
    "#m2o .chat-histbtn{flex:none;width:21px;height:19px;padding:0;display:flex;align-items:center;justify-content:center;background:rgba(36,32,26,0.85);border:1px solid rgba(110,90,53,0.75);border-radius:2px;pointer-events:auto}" +
    "#m2o .chat-histbtn svg{width:13px;height:13px;display:block;pointer-events:none}" +
    "#m2o .chat-tag{font-size:10px;font-weight:700;color:#d8dde3;background:linear-gradient(180deg,#30343a 0%,#1a1c20 100%);border:1px solid rgba(140,123,88,0.8);border-radius:2px;padding:0 6px;height:19px;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;text-shadow:1px 1px 0 #000}" +
    "#m2o .chat-inp{flex:1;min-width:0;height:19px;background:rgba(0,0,0,0.38);border:1px solid rgba(160,150,128,0.38);border-radius:2px;padding:0 6px;outline:none;color:#fff;font:600 11px Tahoma,'Segoe UI',sans-serif;pointer-events:auto;user-select:text;-webkit-user-select:text;touch-action:manipulation}" +
    "#m2o .chat-bar.typing .chat-inp{border-color:rgba(235,220,185,0.82);background:rgba(0,0,0,0.72)}" +
    "#m2o .chat-inp::placeholder{color:rgba(185,190,198,0.52)}" +
    "@media (max-width:1024px),(hover:none) and (pointer:coarse){" +
    "#m2o .chat-bar{left:50%;transform:translateX(-50%);bottom:3px;width:clamp(220px,calc(100% - 380px),310px);min-width:0;height:27px;padding:0 3px;gap:3px;background:rgba(8,9,12,0.52);border-color:rgba(110,94,64,0.45);box-shadow:0 1px 4px rgba(0,0,0,0.6);opacity:0.86}" +
    "#m2o .chat-log{left:50%;transform:translateX(-50%);bottom:32px;width:clamp(220px,calc(100% - 380px),310px);min-width:0;height:62px;font-size:9.5px;padding:2px 5px}" +
    "#m2o .chat-histbtn{width:24px;height:21px}" +
    "#m2o .chat-histbtn svg{width:14px;height:14px}" +
    "#m2o .chat-tag{height:21px;padding:0 6px;font-size:10px}" +
    "#m2o .chat-inp{height:21px;padding:0 5px;font-size:10.5px;background:rgba(0,0,0,0.28);border-color:rgba(150,140,115,0.28)}" +
    "#m2o .chat-send{width:26px !important;height:21px !important;font-size:10px !important}" +
    "}" +
    "#m2o.win-open .chat-bar:not(.typing),#m2o.win-open .chat-log:not(.interactive),#m2o.win-open .target-pill{visibility:hidden !important;pointer-events:none !important}" +
    "#m2o.chatlog-open.win-open .chat-bar:not(.typing){visibility:visible !important;pointer-events:auto !important}" +
    /* Controle deslizante de zoom (acima da barra de chat) */
    "#m2o .zoom-bar{position:absolute;top:6px;bottom:auto;right:12px;left:auto;transform:none;width:24px;height:112px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:5px 0;border-radius:12px;background:rgba(0,0,0,0.38);border:1px solid rgba(120,107,82,0.55);box-shadow:0 1px 4px rgba(0,0,0,0.6);pointer-events:auto;touch-action:none;z-index:3}" +
    "#m2o .zoom-bar .zb-ico{flex:none;width:14px;height:14px;display:flex;align-items:center;justify-content:center;color:#e6d5a8;font:700 13px/1 Tahoma,sans-serif;text-shadow:0 1px 2px #000;pointer-events:none}" +
    "#m2o .zoom-bar .zb-ico svg{width:14px;height:14px;display:block}" +
    "#m2o .zoom-track{position:relative;flex:1;width:22px;touch-action:none;cursor:pointer}" +
    "#m2o .zoom-track::before{content:'';position:absolute;top:0;bottom:0;left:9px;width:4px;border-radius:2px;background:linear-gradient(180deg,#141518,#2a2c30);box-shadow:inset 0 1px 1px #000,0 0 0 1px rgba(120,107,82,0.6)}" +
    "#m2o .zoom-fill{position:absolute;top:0;left:9px;width:4px;border-radius:2px;background:linear-gradient(180deg,#9c6f21,#e0b252);pointer-events:none}" +
    "#m2o .zoom-knob{position:absolute;left:3px;width:16px;height:16px;margin-top:-8px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#f3e2b0 0%,#c89d46 55%,#6e4f17 100%);border:1px solid #1c1a17;box-shadow:0 1px 4px rgba(0,0,0,0.9);pointer-events:none}" +
    "#m2o .zoom-bar.active .zoom-knob{transform:scale(1.2)}" +
    "#m2o.win-open .zoom-bar{visibility:hidden;pointer-events:none}" +
    "#m2o .shop-btn{position:absolute;top:4px;width:30px;height:30px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;border:2px solid #b48a3c;outline:1px solid #1c1a17;background:radial-gradient(circle,#3a2a12 0%,#120c05 100%);box-shadow:inset 0 0 6px #000,0 0 7px rgba(255,190,70,0.55),0 2px 5px rgba(0,0,0,0.9);pointer-events:auto;z-index:21}" +
    "#m2o .shop-btn:active{transform:scale(0.93)}" +
    "#m2o.win-open .shop-btn:not(.esc-btn):not(.kb-btn){display:none}" +
    "#m2o .rcol button{position:relative;overflow:visible}" +
    "#m2o .rc-badge{position:absolute;top:-4px;right:-4px;min-width:15px;height:15px;padding:0 3px;border-radius:8px;background:#b3261e;border:1px solid #f3dfb0;color:#fff;font:700 9px/13px Tahoma,sans-serif;text-align:center;pointer-events:none}" +
    "#m2o .rc-badge:empty{display:none}" +
    "#m2o .q-panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(340px,80vw);max-height:76vh;display:flex;flex-direction:column;gap:6px;padding:6px 8px;pointer-events:auto;z-index:40}" +
    "#m2o .q-head{display:flex;align-items:center;justify-content:space-between;color:#f3dfb0;font:700 13px Tahoma,sans-serif}" +
    "#m2o .q-close{width:26px;height:24px;border-radius:3px}" +
    "#m2o .q-list{overflow-y:auto;display:flex;flex-direction:column;gap:5px;touch-action:pan-y;-webkit-overflow-scrolling:touch}" +
    "#m2o .q-item{min-height:34px;border-radius:3px;justify-content:flex-start;gap:8px;padding:3px 8px;text-align:left;font:600 11.5px/1.3 Tahoma,sans-serif;touch-action:pan-y}" +
    "#m2o .q-item img{width:24px;height:24px;flex:none;pointer-events:none}" +
    "#m2o .q-item span{flex:1;white-space:normal}" +
    "#m2o .q-empty{color:#c8bba0;font-size:11px;padding:6px}" +
    "#m2o .chat-histbtn.wb-btn{position:relative;overflow:visible}" +
    "#m2o .chat-histbtn.wb-new{animation:m2wbBlink 0.9s ease-in-out infinite}" +
    "@keyframes m2wbBlink{50%{background:rgba(200,150,40,0.95);border-color:#ffd75e;box-shadow:0 0 8px rgba(255,215,94,0.9)}}" +
    "#m2o .wb-badge{position:absolute;top:-6px;right:-6px;min-width:13px;height:13px;padding:0 3px;border-radius:7px;background:#c62828;border:1px solid #ffb3b3;color:#fff;font:700 8.5px/12px Tahoma,sans-serif;text-align:center;pointer-events:none;display:none}" +
    "#m2o .wb-badge.on{display:block}" +
    "#m2o .wb-panel{top:auto;bottom:40px;transform:translateX(-50%);width:min(300px,78vw);max-height:62vh}" +
    "#m2o .wb-item{flex-direction:column;align-items:stretch;gap:1px}" +
    "#m2o .wb-item .wb-top{display:flex;align-items:center;gap:6px}" +
    "#m2o .wb-item .wb-name{flex:1;color:#f3dfb0;font-weight:700}" +
    "#m2o .wb-item .wb-cnt{background:#c62828;color:#fff;border-radius:7px;padding:0 5px;font-size:9.5px;line-height:14px}" +
    "#m2o .wb-item .wb-prev{color:#cfc6b4;font-weight:400;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "#m2o .wb-item.unread{border-color:#ffd75e}" +
    "#m2o .chat-send{width:26px;height:19px;border:none;font-size:10.5px;color:#e6e2d8;background:url(icons/ui/btn_steel_small.png) center/100% 100% no-repeat}";
  document.head.appendChild(css);

  var root = document.createElement("div");
  root.id = "m2o";
  document.body.appendChild(root);
  // BUG: toque num botão do overlay gera, depois do toque, eventos de mouse
  // "de compatibilidade" (mousemove/mousedown/mouseup) no botão. O jogo escuta
  // mousemove/mouseup na JANELA inteira, então recebia um "soltar botão esquerdo"
  // na posição do botão = clique no chão -> o personagem andava até lá.
  // Esses eventos param aqui, antes de chegar na janela.
  ["mousedown", "mouseup", "mousemove"].forEach(function (evName) {
    root.addEventListener(evName, function (e) { e.stopPropagation(); });
  });

  function btn(label, fn, cls, title, isHtml) {
    var b = document.createElement("button");
    b.type = "button";
    if (isHtml) b.innerHTML = label;
    else b.textContent = label;
    if (cls) b.className = cls;
    if (title) b.title = title;
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); fn(); });
    return b;
  }

  // ---- Syserr viewer modal + JS window.onerror fallback
  var jsErrors = [];
  window.addEventListener("error", function (ev) {
    try {
      var msg = (ev && ev.message) ? ev.message : String(ev);
      var loc = (ev && ev.filename) ? (" (" + ev.filename + ":" + (ev.lineno || 0) + ")") : "";
      jsErrors.push("[JS Error] " + msg + loc);
      if (jsErrors.length > 50) jsErrors.shift();
    } catch (e) { }
  });
  window.addEventListener("unhandledrejection", function (ev) {
    try {
      var reason = ev && ev.reason ? (ev.reason.stack || ev.reason.message || String(ev.reason)) : "unknown";
      jsErrors.push("[Promise Rejection] " + reason);
      if (jsErrors.length > 50) jsErrors.shift();
    } catch (e) { }
  });

  function readSyserr() {
    var names = ["syserr.txt", "/syserr.txt"];
    for (var i = 0; i < names.length; i++) {
      try { return Module.FS.readFile(names[i], { encoding: "utf8" }); } catch (e) { }
    }
    return null;
  }
  function copyText(ta, label) {
    var done = function (ok) { label.textContent = ok ? "Copiado!" : "Selecione e copie manualmente"; };
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(ta.value).then(function () { done(true); }, function () { fallback(); });
        return;
      }
    } catch (e) { }
    fallback();
    function fallback() {
      var ok = false;
      try { ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length); ok = document.execCommand("copy"); } catch (e) { }
      done(ok);
    }
  }
  function showSyserr() {
    var old = document.getElementById("m2o_log");
    if (old) old.remove();
    var raw = readSyserr();
    var text = "";
    var lines = [];
    if (raw !== null) {
      lines = raw.split(/\r?\n/).filter(function (l) {
        return l.length && !/UNKNOWN NAME|SpeedTreeRT Error/.test(l);
      });
    }
    if (raw === null || lines.length === 0) {
      text = (raw === null)
        ? "(syserr.txt: arquivo inexistente - nada foi registrado ainda)"
        : "(syserr.txt: 0 linhas relevantes ap\u00F3s o filtro)";
      if (jsErrors.length > 0) {
        text += "\n\n--- Erros de JS capturados (window.onerror) ---\n" + jsErrors.join("\n");
      } else {
        text += "\n(Nenhum erro de JS capturado nesta sess\u00E3o)";
      }
    } else {
      text = "syserr.txt: " + lines.length + " linhas ap\u00F3s o filtro, \u00FAltimas 80:\n\n" + lines.slice(-80).join("\n");
      if (jsErrors.length > 0) {
        text += "\n\n--- Erros de JS capturados (window.onerror) ---\n" + jsErrors.join("\n");
      }
    }
    var m = document.createElement("div");
    m.id = "m2o_log";
    m.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,.88);pointer-events:auto;display:flex;flex-direction:column;gap:8px;padding:8px;box-sizing:border-box;z-index:50";
    var ta = document.createElement("textarea");
    ta.readOnly = true;
    ta.value = text;
    ta.style.cssText = "flex:1;width:100%;box-sizing:border-box;background:#07090d;color:#cfd6e6;border:1px solid #b89650;border-radius:8px;font:11px/1.35 ui-monospace,Consolas,monospace;padding:6px;pointer-events:auto;user-select:text;-webkit-user-select:text";
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;align-items:center";
    var info = document.createElement("span");
    info.style.cssText = "color:#e0b354;flex:1";
    var bCopy = btn("Copiar", function () { copyText(ta, info); });
    bCopy.style.padding = "6px 12px";
    var bClose = btn("Fechar", function () { m.remove(); });
    bClose.style.padding = "6px 12px";
    row.appendChild(bCopy); row.appendChild(bClose); row.appendChild(info);
    m.appendChild(ta); m.appendChild(row);
    root.appendChild(m);
    ta.scrollTop = ta.scrollHeight;
    copyText(ta, info);
  }

  // =========================================================================
  // PRE-WORLD LOGIN BAR (shown while max_hp <= 0, hidden once in world)
  // =========================================================================
  // =========================================================================
  // INSTALAR COMO APP (PWA)
  // Android/Chrome: usa o pedido de instalação nativo (beforeinstallprompt).
  // iPhone/Safari e casos sem o pedido nativo: mostra as instruções.
  // =========================================================================
  var deferredInstall = null;
  var installBtns = [];
  function isStandaloneApp() {
    try {
      return (window.matchMedia && (window.matchMedia("(display-mode: fullscreen)").matches ||
        window.matchMedia("(display-mode: standalone)").matches)) || window.navigator.standalone === true;
    } catch (e) { return false; }
  }
  function updateInstallBtns() {
    var hide = isStandaloneApp();
    installBtns.forEach(function (b) { b.style.display = hide ? "none" : ""; });
  }
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredInstall = e;
    updateInstallBtns();
  });
  window.addEventListener("appinstalled", function () {
    deferredInstall = null;
    updateInstallBtns();
  });
  function showInstallHelp() {
    var old = document.getElementById("m2o_install");
    if (old) old.remove();
    var ua = navigator.userAgent || "";
    var ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var secure = location.protocol === "https:";
    var html = '<div style="font-size:13px;font-weight:700;color:#f3dfb0;margin-bottom:6px">Instalar o Metin2 no celular</div>';
    if (ios) {
      html += '1. Abra este endereço no <b>Safari</b>.<br>' +
        '2. Toque em <b>Compartilhar</b> (quadrado com seta ↑).<br>' +
        '3. Escolha <b>Adicionar à Tela de Início</b> e confirme.';
    } else {
      html += '1. Toque no menu <b>⋮</b> do Chrome (canto superior direito).<br>' +
        '2. Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.<br>' +
        '3. Abra o jogo pelo ícone <b>Metin2</b> na tela inicial.';
    }
    if (!secure) {
      html += '<div style="margin-top:6px;color:#e6c875;font-size:10.5px">Obs.: o site está sem HTTPS, então o navegador cria apenas um atalho ' +
        '(funciona igual, mas sem a instalação completa de app).</div>';
    }
    var m = document.createElement("div");
    m.id = "m2o_install";
    m.className = "gold-box";
    m.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(380px,90vw);padding:8px 10px;" +
      "pointer-events:auto;z-index:60;font:600 11.5px/1.5 Tahoma,'Segoe UI',sans-serif;color:#e6e2d8";
    m.innerHTML = html;
    var row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:flex-end;margin-top:8px";
    var ok = btn("Entendi", function () { m.remove(); });
    ok.style.cssText = "padding:4px 14px;height:26px;border-radius:3px";
    row.appendChild(ok);
    m.appendChild(row);
    root.appendChild(m);
  }
  function installApp() {
    if (deferredInstall) {
      var ev = deferredInstall;
      deferredInstall = null;
      try {
        ev.prompt();
        ev.userChoice.then(function () { updateInstallBtns(); }, function () { });
        return;
      } catch (e) { }
    }
    showInstallHelp();
  }

  // =========================================================================
  // IDIOMA DO JOGO (recarrega a página com ?lang=xx; o client.js grava a escolha)
  // =========================================================================
  function currentLang() {
    try {
      var q = new URLSearchParams(location.search).get("lang");
      if (q) return q;
      return localStorage.getItem("m2/lang") || "";
    } catch (e) { return ""; }
  }
  function setGameLang(code) {
    try { localStorage.setItem("m2/lang", code); } catch (e) { }
    var u = new URL(location.href);
    u.searchParams.set("lang", code);
    location.href = u.toString();
  }
  function showLangPicker() {
    var old = document.getElementById("m2o_lang");
    if (old) { old.remove(); return; }
    var m = document.createElement("div");
    m.id = "m2o_lang";
    m.className = "gold-box";
    m.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(300px,86vw);padding:8px 10px;" +
      "pointer-events:auto;z-index:60;font:600 11.5px/1.5 Tahoma,'Segoe UI',sans-serif;color:#e6e2d8;display:flex;flex-direction:column;gap:6px";
    var title = document.createElement("div");
    title.style.cssText = "font-size:13px;font-weight:700;color:#f3dfb0";
    title.textContent = "Idioma do jogo";
    m.appendChild(title);
    var cur = currentLang();
    [["pt", "Português (Brasil)"], ["en", "English"], ["pl", "Polski"]].forEach(function (o) {
      var b = btn((cur === o[0] ? "✔ " : "") + o[1], function () { setGameLang(o[0]); });
      b.style.cssText = "height:30px;border-radius:3px;justify-content:flex-start;padding:0 10px";
      m.appendChild(b);
    });
    var note = document.createElement("div");
    note.style.cssText = "font-size:10px;color:#c8bba0";
    note.textContent = "O jogo será recarregado para aplicar.";
    m.appendChild(note);
    var close = btn("Fechar", function () { m.remove(); });
    close.style.cssText = "height:26px;border-radius:3px";
    m.appendChild(close);
    root.appendChild(m);
  }

  // =========================================================================
  // JANELA DE MISSÕES (lista os pergaminhos de missão do jogo)
  // =========================================================================
  var questPanel = null;
  var questList = [];
  function questText(raw) {
    // Os textos do jogo chegam como bytes da code page (cp1252 / cp1250) "vistos" como latin-1.
    var t = String(raw || "");
    try {
      var bytes = new Uint8Array(t.length);
      var ok = true;
      for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i); if (c > 255) { ok = false; break; } bytes[i] = c; }
      if (ok && typeof TextDecoder !== "undefined") {
        var lang = "";
        try { lang = localStorage.getItem("m2/lang") || ""; } catch (e) { }
        t = new TextDecoder(lang === "pl" ? "windows-1250" : "windows-1252").decode(bytes);
      }
    } catch (e) { }
    return t.replace(/\|c[0-9a-fA-F]{8}|\|r|\|h|\|H[^|]*\|h/g, "").trim();
  }
  function requestQuestList() {
    runPy(safePy([
      "import interfaceModule, json",
      "interfaceModule.IsQBHide = 1",
      "_itf = getattr(self, 'interface', None)",
      "_ql = []",
      "if _itf:",
      "    try:",
      "        _itf.HideAllQuestButton()",
      "    except Exception:",
      "        pass",
      "    for _b in list(getattr(_itf, 'questButtonList', [])):",
      "        _ql.append({'i': int(getattr(_b, 'index', -1)), 'n': str(getattr(_b, 'name', '') or '')})",
      "_f = open('/m2w_quests.json', 'w')",
      "_f.write(json.dumps(_ql))",
      "_f.close()"
    ]));
  }
  function startQuest(idx) {
    runPy(safePy([
      "_itf = getattr(self, 'interface', None)",
      "if _itf:",
      "    for _b in list(getattr(_itf, 'questButtonList', [])):",
      "        if int(getattr(_b, 'index', -1)) == " + Number(idx) + ":",
      "            _itf._Interface__StartQuest(_b)",
      "            break"
    ]));
    if (questPanel) { questPanel.remove(); questPanel = null; }
    setTimeout(requestQuestList, 800);
  }
  function renderQuestPanel() {
    var badge = document.getElementById("m2o_quest_badge");
    if (badge) badge.textContent = questList.length ? String(questList.length) : "";
    if (!questPanel) return;
    var listEl = questPanel.querySelector(".q-list");
    listEl.innerHTML = "";
    if (!questList.length) {
      var em = document.createElement("div");
      em.className = "q-empty";
      em.textContent = "Nenhuma missão no momento.";
      listEl.appendChild(em);
      return;
    }
    questList.forEach(function (q) {
      var b = btn("", function () { startQuest(q.i); });
      b.className = "q-item";
      b.innerHTML = '<img src="icons/ui/quests.png" alt=""><span></span>';
      b.querySelector("span").textContent = questText(q.n) || ("Missão " + q.i);
      listEl.appendChild(b);
    });
  }
  function toggleQuestPanel(forceOpen) {
    if (questPanel && !forceOpen) { questPanel.remove(); questPanel = null; return; }
    if (!questPanel) {
      questPanel = document.createElement("div");
      questPanel.className = "q-panel gold-box";
      questPanel.innerHTML = '<div class="q-head"><span>Missões</span></div><div class="q-list"></div>';
      var x = btn("X", function () { toggleQuestPanel(); });
      x.className = "q-close";
      questPanel.querySelector(".q-head").appendChild(x);
      root.appendChild(questPanel);
    }
    renderQuestPanel();
    requestQuestList();
  }
  setInterval(function () {
    try {
      if (!window.Module || !Module.FS) return;
      if (fsExists("/m2w_quests.json")) {
        var ql = JSON.parse(Module.FS.readFile("/m2w_quests.json", { encoding: "utf8" }));
        fsRm("/m2w_quests.json");
        if (Array.isArray(ql)) { questList = ql; renderQuestPanel(); }
      }
    } catch (e) { }
  }, 250);
  // Atualiza a contagem de missões de tempos em tempos (e mantém os pergaminhos nativos ocultos).
  setInterval(function () {
    try {
      if (typeof inWorld !== "undefined" && inWorld && !fsExists("/m2w_cmd.py")) requestQuestList();
    } catch (e) { }
  }, 6000);

  // =========================================================================
  // TAMANHO DA INTERFACE DO JOGO (escala lógica; recarrega a página)
  // =========================================================================
  function currentUiScale() {
    try {
      var q = new URLSearchParams(location.search).get("uiscale");
      if (q) return q === "hd" ? "hd" : parseFloat(q);
      var v = localStorage.getItem("m2w.mobileScale");
      if (v === "hd") return "hd";
      return v ? parseFloat(v) : (M2I18N.lang === "pl" ? 1 : 1.25);
    } catch (e) { return 1.25; }
  }
  function setUiScale(v) {
    try { localStorage.setItem("m2w.mobileScale", String(v)); } catch (e) { }
    var u = new URL(location.href);
    u.searchParams.delete("uiscale");
    location.href = u.toString();
  }
  function showScalePicker() {
    var old = document.getElementById("m2o_scale");
    if (old) { old.remove(); return; }
    var m = document.createElement("div");
    m.id = "m2o_scale";
    m.className = "gold-box";
    m.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(320px,88vw);padding:8px 10px;" +
      "pointer-events:auto;z-index:60;font:600 11.5px/1.5 Tahoma,'Segoe UI',sans-serif;color:#e6e2d8;display:flex;flex-direction:column;gap:6px";
    var title = document.createElement("div");
    title.style.cssText = "font-size:13px;font-weight:700;color:#f3dfb0";
    title.textContent = "Tamanho das janelas do jogo";
    m.appendChild(title);
    var cur = currentUiScale();
    [[1, "Normal (100%)"], [1.25, "Grande (125%) - recomendado"],
     ["hd", "Grande HD (125%) - textos nítidos, exige mais do celular"],
     [1.5, "Muito grande (150%)"]].forEach(function (o) {
      var sel = (o[0] === "hd" || cur === "hd") ? cur === o[0] : Math.abs(cur - o[0]) < 0.01;
      var b = btn((sel ? "✔ " : "") + o[1], function () { setUiScale(o[0]); });
      b.style.cssText = "height:30px;border-radius:3px;justify-content:flex-start;padding:0 10px";
      m.appendChild(b);
    });
    var note = document.createElement("div");
    note.style.cssText = "font-size:10px;color:#c8bba0";
    note.textContent = "Aumenta inventário, janelas, ícones e textos do jogo. O jogo será recarregado. " +
      "O modo HD desenha o jogo em resolução maior (letras sem borrão), mas pode deixar o jogo mais lento ou esquentar o celular.";
    m.appendChild(note);
    var close = btn("Fechar", function () { m.remove(); });
    close.style.cssText = "height:26px;border-radius:3px";
    m.appendChild(close);
    root.appendChild(m);
  }

  var preBar = document.createElement("div");
  preBar.className = "prebar";
  // Tela de login mais limpa: só o essencial à vista; o resto em "Mais".
  preBar.appendChild(btn("Tela cheia", toggleFullscreen));
  preBar.appendChild(btn("Idioma", showLangPicker));
  preBar.appendChild(btn("Tamanho", showScalePicker));
  preBar.appendChild(btn("\u2699 Configura\u00E7\u00F5es", function () { openSettings(); }));
  preBar.appendChild(btn("\u2328 Teclado", function () { openGameKbManual(); }));
  var preMoreBtns = [];
  var preMore = btn("Mais \u25BE", function () {
    var open = preMoreBtns.length && preMoreBtns[0].style.display !== "none";
    preMoreBtns.forEach(function (b) { b.style.display = open ? "none" : ""; });
    preMore.textContent = open ? "Mais \u25BE" : "Menos \u25B4";
  });
  preBar.appendChild(preMore);
  [["Entrar", loginFlow], ["Iniciar (ENTER)", enterStartFlow], ["Digitar", typeIntoActive], ["Erros", showSyserr]].forEach(function (o) {
    var b = btn(o[0], o[1]);
    b.style.display = "none";
    preMoreBtns.push(b);
    preBar.appendChild(b);
  });
  var preInstallBtn = btn("Instalar app", installApp);
  installBtns.push(preInstallBtn);
  preBar.appendChild(preInstallBtn);
  root.appendChild(preBar);

  // =========================================================================
  // 1. TOP-LEFT HP / MP / 4-SEGMENT EXP BARS + 2 SQUARE 30x30 GOLD ICONS ON RIGHT
  // =========================================================================
  var hudTl = document.createElement("div");
  hudTl.className = "hud-tl tl";
  hudTl.innerHTML =
    '<div class="hud-gauge-board">' +
      '<div class="hud-orb" title="Personagem / Status (C)"></div>' +
      '<div class="hud-orb-lv" id="m2o_lv" title="Toque para mostrar/ocultar os n\u00FAmeros">Lv. 1</div>' +
      '<div class="hud-gauge-bar hud-bar-hp" id="m2o_bar_hp" title="Pontos de Vida (HP)">' +
        '<div class="hud-gauge-trail" id="m2o_hp_trail"></div>' +
        '<div class="hud-gauge-fill" id="m2o_hp_fill"></div>' +
        '<div class="hud-gauge-txt" id="m2o_hp_txt">0 / 0</div>' +
      '</div>' +
      '<div class="hud-gauge-bar hud-bar-mp" id="m2o_bar_mp" title="Pontos de Mana (MP)">' +
        '<div class="hud-gauge-trail" id="m2o_mp_trail"></div>' +
        '<div class="hud-gauge-fill" id="m2o_mp_fill"></div>' +
        '<div class="hud-gauge-txt" id="m2o_mp_txt">0 / 0</div>' +
      '</div>' +
      '<div class="hud-gauge-bar hud-bar-st" id="m2o_bar_st" title="Resist\u00EAncia (ST)">' +
        '<div class="hud-gauge-fill" id="m2o_st_fill"></div>' +
      '</div>' +
    '</div>' +
    '<div class="hud-exp-board" id="m2o_exp_wrap" title="Experi\u00EAncia">' +
      '<div class="hud-exp-socket" style="left:5px"><div class="hud-exp-point" id="m2o_orb_0"></div></div>' +
      '<div class="hud-exp-socket" style="left:30px"><div class="hud-exp-point" id="m2o_orb_1"></div></div>' +
      '<div class="hud-exp-socket" style="left:55px"><div class="hud-exp-point" id="m2o_orb_2"></div></div>' +
      '<div class="hud-exp-socket" style="left:80px"><div class="hud-exp-point" id="m2o_orb_3"></div></div>' +
    '</div>';

  var orbEl = hudTl.querySelector(".hud-orb");
  if (orbEl) {
    orbEl.addEventListener("click", function (e) {
      e.stopPropagation();
      runPy("try:\n    self.interface.ToggleCharacterWindow('STATUS')\nexcept Exception:\n    pass");
    });
  }

  var hudTipEl = document.createElement("div");
  hudTipEl.className = "hud-tooltip";
  hudTipEl.id = "m2o_hud_tip";
  var hudTipTimer = null;
  function showHudTip(html, x, y) {
    if (!hudTipEl) return;
    hudTipEl.innerHTML = html;
    hudTipEl.style.left = (typeof x === "number" ? x : 162) + "px";
    hudTipEl.style.top = (typeof y === "number" ? y : 8) + "px";
    hudTipEl.classList.add("show");
    if (hudTipTimer) clearTimeout(hudTipTimer);
    hudTipTimer = setTimeout(function () {
      hudTipEl.classList.remove("show");
    }, 3200);
  }

  function bindHudTap(elem, fn) {
    if (!elem) return;
    var lastT = 0;
    function act(e) {
      var now = Date.now();
      if (now - lastT < 280) return;
      lastT = now;
      e.stopPropagation();
      if (e.cancelable && e.type === "touchstart") e.preventDefault();
      fn(e);
    }
    elem.addEventListener("touchstart", act, { passive: false });
    elem.addEventListener("click", act);
  }

  var curHp = 0, curMaxHp = 1, curSp = 0, curMaxSp = 1, curExp = 0, curMaxExp = 1, curExpPct = 0;
  var curTargetVid = 0, curTargetDist = -1, curFishingMode = false;

  var expWrapEl = hudTl.querySelector("#m2o_exp_wrap");
  bindHudTap(expWrapEl, function () {
    var pStr = curExpPct.toFixed(2) + "%";
    var pts = curExp.toLocaleString() + " / " + curMaxExp.toLocaleString();
    showHudTip(
      '<span style="color:#e6c875">Experi\u00EAncia: </span><span style="color:#72f77e">' + pStr + '</span><br>' +
      '<span style="color:#cfd6e6;font-size:9.5px;font-weight:normal">Pontos: ' + pts + '</span>',
      162, 24
    );
  });

  var barHpEl = hudTl.querySelector("#m2o_bar_hp");
  bindHudTap(barHpEl, function () {
    showHudTip(
      '<span style="color:#ff6b6b">HP: </span><span style="color:#fff">' + curHp.toLocaleString() + ' / ' + curMaxHp.toLocaleString() + '</span>',
      162, 6
    );
  });

  var barMpEl = hudTl.querySelector("#m2o_bar_mp");
  bindHudTap(barMpEl, function () {
    showHudTip(
      '<span style="color:#4dabf7">MP: </span><span style="color:#fff">' + curSp.toLocaleString() + ' / ' + curMaxSp.toLocaleString() + '</span>',
      162, 16
    );
  });

  var lvEl = hudTl.querySelector("#m2o_lv");
  bindHudTap(lvEl, function () {
    root.classList.toggle("show-hud-num");
  });

  var targetPillEl = document.createElement("div");
  targetPillEl.className = "target-pill";
  targetPillEl.id = "m2o_target_pill";

  root.appendChild(hudTl);
  root.appendChild(hudTipEl);
  root.appendChild(targetPillEl);

  // Drag mode: "auto" (LMB when windows open, RMB camera when closed), "ui" (force LMB drag), "cam" (force RMB camera)
  var dragMode = "auto";
  var hudOpenWindows = false;
  var hudCursorAttached = false;
  var clickMode = "lmb"; // "lmb" or "ppm"
  var shiftActive = false;
  var lastTap = { x: 0, y: 0, t: 0 };

  var tlSide = document.createElement("div");
  tlSide.className = "tl-side";
  var btnDragMode = btn(
    ICONS.camMode + '<span class="mini-tag" id="m2o_drag_tag">AUTO</span>',
    function () {
      if (dragMode === "auto") dragMode = "ui";
      else if (dragMode === "ui") dragMode = "cam";
      else dragMode = "auto";
      updateDragModeBtn();
    },
    "",
    "Modo de toque: Auto / Janelas (arrastar) / C\u00E2mera (girar)",
    true
  );
  function updateDragModeBtn() {
    var tagEl = document.getElementById("m2o_drag_tag");
    if (!tagEl) return;
    if (dragMode === "ui") {
      tagEl.textContent = "JAN";
      btnDragMode.classList.add("active");
    } else if (dragMode === "cam") {
      tagEl.textContent = "C\u00C2M";
      btnDragMode.classList.remove("active");
    } else {
      tagEl.textContent = hudOpenWindows ? "A:UI" : "AUTO";
      btnDragMode.classList.toggle("active", !!hudOpenWindows);
    }
  }

  var btnClickMode = btn(
    ICONS.tapHand + '<span class="mini-tag" id="m2o_click_tag">SEL</span>',
    function () {
      clickMode = (clickMode === "lmb") ? "ppm" : "lmb";
      updateClickModeBtn();
    },
    "",
    "Modo de toque: \uD83D\uDC46 SEL (clique esquerdo: selecionar) / \u26A1 USAR (clique direito: usar / equipar / comprar)",
    true
  );
  function updateClickModeBtn() {
    var tag = document.getElementById("m2o_click_tag");
    if (!tag) return;
    if (clickMode === "ppm") {
      btnClickMode.innerHTML = ICONS.lightning + '<span class="mini-tag" id="m2o_click_tag">USAR</span>';
      btnClickMode.classList.add("active");
    } else {
      btnClickMode.innerHTML = ICONS.tapHand + '<span class="mini-tag" id="m2o_click_tag">SEL</span>';
      btnClickMode.classList.remove("active");
    }
  }

  var btnShift = btn(
    ICONS.divide + '<span class="mini-tag" id="m2o_shift_tag">DIV</span>',
    function () {
      setShift(!shiftActive);
    },
    "",
    "Dividir pilha de itens (Shift + clique)",
    true
  );
  function setShift(active) {
    shiftActive = !!active;
    btnShift.classList.toggle("active", shiftActive);
    sendKey(16, shiftActive);
  }

  // AUTO = ataque automático: com um alvo selecionado (toque no monstro) e perto,
  // segura o ataque (como segurar ESPAÇO no PC) até o alvo morrer ou sumir.
  // Solta quando o joystick é usado ou uma janela abre. (O antigo botão AUTO era o
  // "modo de toque" - foi para o menu de engrenagem.)
  var autoAtk = false;
  try { autoAtk = localStorage.getItem("m2o.autoAtk") === "1"; } catch (e) { }
  var autoAtkHeld = false;
  var btnAuto = btn(
    ICONS.swords + '<span class="mini-tag">AUTO</span>',
    function () {
      autoAtk = !autoAtk;
      try { localStorage.setItem("m2o.autoAtk", autoAtk ? "1" : "0"); } catch (e) { }
      btnAuto.classList.toggle("active", autoAtk);
      showHudTip(autoAtk ? "<b>Ataque autom\u00E1tico: LIGADO</b><br>Toque num monstro: o personagem ataca at\u00E9 ele morrer."
                         : "<b>Ataque autom\u00E1tico: DESLIGADO</b>");
      autoAtkTick();
    },
    "",
    "Ataque autom\u00E1tico no alvo selecionado",
    true
  );
  btnAuto.classList.toggle("active", autoAtk);
  function autoAtkTick() {
    var want = autoAtk && inWorld && !hudOpenWindows && !hudCursorAttached &&
      (typeof joyId === "undefined" || joyId === null) &&
      curTargetVid > 0 && curTargetDist >= 0 && curTargetDist <= 4 &&
      document.activeElement !== chatInp;
    if (want !== autoAtkHeld) {
      autoAtkHeld = want;
      sendKey(KEYS.SPACE, want);
    }
  }
  setInterval(function () { try { autoAtkTick(); } catch (e) { } }, 200);
  tlSide.appendChild(btnAuto);
  tlSide.appendChild(btnClickMode);
  tlSide.appendChild(btnShift);
  root.appendChild(tlSide);

  // =========================================================================
  // 2. RIGHT COLUMN OF 5 DOUBLE-RING GOLD SVG ICONS (top: 128px, right: 10px, 34x34)
  // =========================================================================
  var rCol = document.createElement("div");
  rCol.className = "rcol";
  root.appendChild(rCol);

  var gearMenu = document.createElement("div");
  gearMenu.className = "gear-menu gold-box";
  root.appendChild(gearMenu);

    var settingsModal = document.createElement("div");
  settingsModal.className = "settings-modal";
  settingsModal.id = "m2o_settings_modal";
  settingsModal.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;border-bottom:1px solid #786b52;padding-bottom:4px">' +
    '  <span style="font-size:13px;font-weight:700;color:#f3dfb0">\u2699 Configura\u00E7\u00F5es do cliente</span>' +
    '  <button type="button" id="m2o_set_close" style="width:26px;height:26px;min-height:26px;padding:0;border-radius:3px;font-size:13px;font-weight:700">X</button>' +
    '</div>' +
    '<div class="settings-tabs" id="m2o_set_tabs">' +
    '  <button type="button" data-tab="game" class="active">Jogo</button>' +
    '  <button type="button" data-tab="gfx">Gr\u00E1ficos e HUD</button>' +
    '  <button type="button" data-tab="m1">Cidade e M1</button>' +
    '  <button type="button" data-tab="tools">Ferramentas</button>' +
    '</div>' +
    '<div class="settings-pane active" data-pane="game">' +
    '  <div class="settings-btns" id="m2o_set_game_btns" style="display:grid;grid-template-columns:1fr 1fr;gap:5px"></div>' +
    '</div>' +
    '<div class="settings-pane" data-pane="gfx">' +
    '  <div style="font-size:10.5px;color:#b0a894">Gr\u00E1ficos / desempenho:</div>' +
    '  <div class="settings-btns" id="m2o_set_dpi_row">' +
    '    <button type="button" data-val="low">Baixo</button>' +
    '    <button type="button" data-val="med">M\u00E9dio</button>' +
    '    <button type="button" data-val="high">Alto</button>' +
    '  </div>' +
    '  <div style="font-size:10.5px;color:#b0a894;margin-top:2px">Limite de quadros (FPS):</div>' +
    '  <div class="settings-btns" id="m2o_set_fps_row">' +
    '    <button type="button" data-val="30">30 FPS</button>' +
    '    <button type="button" data-val="60">60 FPS</button>' +
    '    <button type="button" data-val="0">Sem limite</button>' +
    '  </div>' +
    '  <div style="font-size:10.5px;color:#b0a894;margin-top:2px">Tamanho do HUD (bot\u00F5es da tela):</div>' +
    '  <div class="settings-btns" id="m2o_set_hud_row">' +
    '    <button type="button" data-val="85">85%</button>' +
    '    <button type="button" data-val="100">100%</button>' +
    '    <button type="button" data-val="115">115%</button>' +
    '  </div>' +
    '</div>' +
    '<div class="settings-pane" data-pane="m1">' +
    '  <div style="font-size:10.5px;color:#b0a894">Lojas privadas (M1):</div>' +
    '  <div class="settings-btns" id="m2o_set_shop_row">' +
    '    <button type="button" id="m2o_btn_shop_hide">Esconder lojas (mais FPS)</button>' +
    '    <button type="button" id="m2o_btn_shop_near">Perto (10 m)</button>' +
    '    <button type="button" id="m2o_btn_shop_all">Todas</button>' +
    '  </div>' +
    '  <div style="font-size:10.5px;color:#b0a894;margin-top:2px">Placas das lojas:</div>' +
    '  <div class="settings-btns">' +
    '    <button type="button" id="m2o_btn_sales_off">Esconder placas</button>' +
    '    <button type="button" id="m2o_btn_sales_on">Mostrar placas</button>' +
    '  </div>' +
    '  <div style="font-size:10.5px;color:#b0a894;margin-top:2px">Nomes de monstros/personagens e bal\u00F5es de chat:</div>' +
    '  <div class="settings-btns">' +
    '    <button type="button" id="m2o_btn_names_off">Esconder nomes</button>' +
    '    <button type="button" id="m2o_btn_names_on">Mostrar nomes</button>' +
    '  </div>' +
    '</div>' +
    '<div class="settings-pane" data-pane="tools">' +
    '  <div style="font-size:10.5px;color:#b0a894">Ferramentas:</div>' +
    '  <div class="settings-btns">' +
    '    <button type="button" id="m2o_tool_type">\u2328 Teclado</button>' +
    '    <button type="button" id="m2o_tool_pctaskbar">Barra do PC liga/desliga</button>' +
    '  </div>' +
    '  <div class="settings-btns" style="margin-top:2px">' +
    '    <button type="button" id="m2o_tool_syserr">Registro de erros</button>' +
    '    <button type="button" id="m2o_tool_fs">Tela cheia</button>' +
    '  </div>' +
    '</div>';
  root.appendChild(settingsModal);
  // Tamanho do HUD (85% / 100% / 115%): o CSS usa #m2o[data-scale]. Faltava esta função
  // na versão 2.0.123 (os botões davam erro).
  function applyHudScale(v) {
    v = String(v || "100");
    if (v === "100") root.removeAttribute("data-scale"); else root.setAttribute("data-scale", v);
    try { if (typeof refreshJoyRect === "function") setTimeout(refreshJoyRect, 50); } catch (e) { }
  }
  try { applyHudScale(localStorage.getItem("m2o_hud_scale") || "100"); } catch (e) { }

  var tabsBar = settingsModal.querySelector("#m2o_set_tabs");
  if (tabsBar) {
    tabsBar.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      var t = b.getAttribute("data-tab");
      if (!t) return;
      var tbs = tabsBar.querySelectorAll("button");
      for (var i = 0; i < tbs.length; i++) tbs[i].classList.toggle("active", tbs[i] === b);
      var panes = settingsModal.querySelectorAll(".settings-pane");
      for (var j = 0; j < panes.length; j++) panes[j].classList.toggle("active", panes[j].getAttribute("data-pane") === t);
    });
  }

  function updateSettingsModalActive() {
    var curDpi = gfxLevel();
    var curFps = localStorage.getItem("m2o_fps_limit") || (curDpi === "low" ? "30" : "60");
    var curHud = localStorage.getItem("m2o_hud_scale") || "100";
    var dpiBtns = settingsModal.querySelectorAll("#m2o_set_dpi_row button");
    for (var i = 0; i < dpiBtns.length; i++) {
      dpiBtns[i].classList.toggle("active", dpiBtns[i].getAttribute("data-val") === curDpi);
    }
    var fpsBtns = settingsModal.querySelectorAll("#m2o_set_fps_row button");
    for (var j = 0; j < fpsBtns.length; j++) {
      fpsBtns[j].classList.toggle("active", fpsBtns[j].getAttribute("data-val") === curFps);
    }
    var hudBtns = settingsModal.querySelectorAll("#m2o_set_hud_row button");
    for (var k = 0; k < hudBtns.length; k++) {
      hudBtns[k].classList.toggle("active", hudBtns[k].getAttribute("data-val") === curHud);
    }
  }

  var setCloseBtn = settingsModal.querySelector("#m2o_set_close");
  if (setCloseBtn) {
    setCloseBtn.addEventListener("click", function () {
      settingsModal.classList.remove("open");
    });
  }

  var dpiRow = settingsModal.querySelector("#m2o_set_dpi_row");
  if (dpiRow) {
    dpiRow.addEventListener("click", function (e) {
      var btnEl = e.target.closest("button");
      if (!btnEl) return;
      var val = btnEl.getAttribute("data-val");
      if (!val) return;
      // Mesmo efeito do botão "Gráficos" do topo (resolução do modo Baixo: ao recarregar).
      try { localStorage.setItem("m2w.gfx", val); } catch (e2) { }
      if (val === "low") { try { localStorage.removeItem("m2o_fps_limit"); } catch (e3) { } }
      applyGfx();
      updateSettingsModalActive();
      var names = { low: "Baixo", med: "M\u00E9dio", high: "Alto" };
      var needReload = (val === "low") !== (gfxAtLoad === "low");
      showHudTip("<b>Gr\u00E1ficos: " + names[val] + "</b>" + (needReload ? "<br>A resolu\u00E7\u00E3o muda na pr\u00F3xima vez que o jogo abrir." : ""), 200, 8);
    });
  }

  var fpsRow = settingsModal.querySelector("#m2o_set_fps_row");
  if (fpsRow) {
    fpsRow.addEventListener("click", function (e) {
      var btnEl = e.target.closest("button");
      if (!btnEl) return;
      var val = btnEl.getAttribute("data-val");
      if (val === null) return;
      localStorage.setItem("m2o_fps_limit", val);
      updateSettingsModalActive();
      var lbl = val === "0" ? "Sem limite" : (val + " FPS");
      runPy("import chat; chat.AppendChat(chat.CHAT_TYPE_INFO, 'Limite de FPS: " + lbl + "')");
    });
  }

  var hudRow = settingsModal.querySelector("#m2o_set_hud_row");
  if (hudRow) {
    hudRow.addEventListener("click", function (e) {
      var btnEl = e.target.closest("button");
      if (!btnEl) return;
      var val = btnEl.getAttribute("data-val");
      if (!val) return;
      localStorage.setItem("m2o_hud_scale", val);
      updateSettingsModalActive();
      applyHudScale(val);
      runPy("import chat; chat.AppendChat(chat.CHAT_TYPE_INFO, 'Tamanho do HUD: " + val + "%')");
    });
  }

  var btnShopHide = settingsModal.querySelector("#m2o_btn_shop_hide");
  if (btnShopHide) {
    btnShopHide.addEventListener("click", function () {
      runPy("import systemSetting, chat\ntry:\n    systemSetting.SetShopRangeView(0.0)\n    systemSetting.SetShowSalesTextFlag(0)\n    chat.AppendChat(chat.CHAT_TYPE_INFO, 'Lojas privadas: ESCONDIDAS (mais FPS no M1)')\nexcept Exception as e:\n    chat.AppendChat(chat.CHAT_TYPE_INFO, 'Erro: ' + str(e))");
    });
  }
  var btnShopNear = settingsModal.querySelector("#m2o_btn_shop_near");
  if (btnShopNear) {
    btnShopNear.addEventListener("click", function () {
      runPy("import systemSetting, chat\ntry:\n    systemSetting.SetShopRangeView(1000.0)\n    chat.AppendChat(chat.CHAT_TYPE_INFO, 'Lojas: so as de perto (10 m)')\nexcept Exception as e:\n    chat.AppendChat(chat.CHAT_TYPE_INFO, 'Erro: ' + str(e))");
    });
  }
  var btnShopAll = settingsModal.querySelector("#m2o_btn_shop_all");
  if (btnShopAll) {
    btnShopAll.addEventListener("click", function () {
      runPy("import systemSetting, chat\ntry:\n    systemSetting.SetShopRangeView(5000.0)\n    chat.AppendChat(chat.CHAT_TYPE_INFO, 'Lojas: todas (50 m)')\nexcept Exception as e:\n    chat.AppendChat(chat.CHAT_TYPE_INFO, 'Erro: ' + str(e))");
    });
  }
  var btnSalesOff = settingsModal.querySelector("#m2o_btn_sales_off");
  if (btnSalesOff) {
    btnSalesOff.addEventListener("click", function () {
      runPy("import systemSetting, chat\ntry:\n    systemSetting.SetShowSalesTextFlag(0)\n    chat.AppendChat(chat.CHAT_TYPE_INFO, 'Placas das lojas: ESCONDIDAS')\nexcept Exception as e:\n    pass");
    });
  }
  var btnSalesOn = settingsModal.querySelector("#m2o_btn_sales_on");
  if (btnSalesOn) {
    btnSalesOn.addEventListener("click", function () {
      runPy("import systemSetting, chat\ntry:\n    systemSetting.SetShowSalesTextFlag(1)\n    chat.AppendChat(chat.CHAT_TYPE_INFO, 'Placas das lojas: VISIVEIS')\nexcept Exception as e:\n    pass");
    });
  }
  var btnNamesOff = settingsModal.querySelector("#m2o_btn_names_off");
  if (btnNamesOff) {
    btnNamesOff.addEventListener("click", function () {
      runPy(safePy([
        "import systemSetting, chat",
        "try: systemSetting.SetShowNameFlag(0)",
        "except Exception: pass",
        "try: systemSetting.SetViewChatFlag(0)",
        "except Exception: pass",
        "try: self.HideName()",
        "except Exception: pass",
        "chat.AppendChat(chat.CHAT_TYPE_INFO, 'Nomes e baloes: ESCONDIDOS (aparecem ao selecionar o alvo)')"
      ]));
    });
  }
  var btnNamesOn = settingsModal.querySelector("#m2o_btn_names_on");
  if (btnNamesOn) {
    btnNamesOn.addEventListener("click", function () {
      runPy(safePy([
        "import systemSetting, chat",
        "try: systemSetting.SetShowNameFlag(2)",
        "except Exception: pass",
        "try: systemSetting.SetViewChatFlag(1)",
        "except Exception: pass",
        "try: self.ShowName()",
        "except Exception: pass",
        "chat.AppendChat(chat.CHAT_TYPE_INFO, 'Nomes e baloes: VISIVEIS')"
      ]));
    });
  }

  var btnToolType = settingsModal.querySelector("#m2o_tool_type");
  if (btnToolType) {
    btnToolType.addEventListener("click", function () {
      settingsModal.classList.remove("open");
      typeIntoActive();
    });
  }
  var btnToolPc = settingsModal.querySelector("#m2o_tool_pctaskbar");
  if (btnToolPc) {
    btnToolPc.addEventListener("click", function () {
      runPy(safePy([
        "import constInfo",
        "self._mobShowPcTaskBar = not getattr(self, '_mobShowPcTaskBar', False)",
        "constInfo._mob_show_pc_chat = self._mobShowPcTaskBar",
        "if hasattr(self, 'interface') and self.interface:",
        "    if hasattr(self.interface, 'wndTaskBar') and self.interface.wndTaskBar:",
        "        if self._mobShowPcTaskBar: self.interface.wndTaskBar.Show()",
        "        else: self.interface.wndTaskBar.Hide()",
        "    if hasattr(self.interface, 'wndChat') and self.interface.wndChat:",
        "        if self._mobShowPcTaskBar: self.interface.wndChat.Show()",
        "        else: self.interface.wndChat.Hide()",
        "    if hasattr(self.interface, 'wndGameButton') and self.interface.wndGameButton:",
        "        if self._mobShowPcTaskBar: self.interface.wndGameButton.Show(); self.interface.wndGameButton.CheckGameButton()",
        "        else: self.interface.wndGameButton.Hide()"
      ]));
    });
  }
  var btnToolSyserr = settingsModal.querySelector("#m2o_tool_syserr");
  if (btnToolSyserr) {
    btnToolSyserr.addEventListener("click", function () {
      settingsModal.classList.remove("open");
      showSyserr();
    });
  }
  var btnToolFs = settingsModal.querySelector("#m2o_tool_fs");
  if (btnToolFs) {
    btnToolFs.addEventListener("click", function () {
      toggleFullscreen();
    });
  }

  var gmModal = document.createElement("div");
  gmModal.className = "gm-modal gold-box";
  root.appendChild(gmModal);

  // Menu único: o que antes ficava no menu da engrenagem agora é a aba "Jogo"
  // da janela de configurações.
  var lastGearBtn = null;
  function addGearItem(label, fn) {
    var pane = settingsModal.querySelector("#m2o_set_game_btns");
    var b = btn(label, function () {
      settingsModal.classList.remove("open");
      fn();
    });
    b.style.cssText = "height:30px;border-radius:2px;justify-content:flex-start;padding:0 8px;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    pane.appendChild(b);
    lastGearBtn = b;
  }
  function openSettings() {
    gearMenu.classList.remove("open");
    updateSettingsModalActive();
    settingsModal.classList.add("open");
  }
  addGearItem("Tela cheia", toggleFullscreen);
  addGearItem("Idioma do jogo", showLangPicker);
  addGearItem("Tamanho das janelas", showScalePicker);
  addGearItem("Instalar app no celular", installApp);
  installBtns.push(lastGearBtn);
  updateInstallBtns();
  addGearItem("Ca\u00E7a autom\u00E1tica (K)", function () {
    runPy("try:\n    self._GameWindow__ToggleAutoHunt()\nexcept Exception:\n    pass");
  });
  addGearItem("Modo de toque", function () {
    if (dragMode === "auto") dragMode = "ui";
    else if (dragMode === "ui") dragMode = "cam";
    else dragMode = "auto";
    showHudTip("<b>Modo de toque:</b> " + (dragMode === "ui" ? "arrastar janelas" : dragMode === "cam" ? "girar c\u00E2mera" : "autom\u00E1tico"));
  });
  addGearItem("Mapa grande (Atlas)", function () {
    runPy("try:\n    self.interface.wndMiniMap.ToggleAtlasWindow()\nexcept Exception:\n    pass");
  });
  addGearItem("Teclado: do jogo / do celular", function () {
    var nat = kbPref() === "native";
    try { localStorage.setItem("m2o.kb", nat ? "game" : "native"); } catch (e) { }
    applyChatKbMode();
    showHudTip("<b>Teclado:</b> " + (nat ? "do jogo (com tecla apagar)" : "do celular"));
  });
  addGearItem("ESC / Fechar janela", function () { tapKey(KEYS.ESC); });
  addGearItem("Chat: do jogo / simples", function () {
    var on = !nativeChatOn();
    try { localStorage.setItem("m2o.nativeChat", on ? "1" : "0"); } catch (e) { }
    applyNativeChat();
    showHudTip("<b>Chat:</b> " + (on ? "do jogo (todas as mensagens, bandeiras do reino)" : "simples (do overlay)"));
  });

  // GM modal contents
  var gmHead = document.createElement("div");
  gmHead.className = "sep";
  gmHead.innerHTML = "<span>Painel GM / Ferramentas</span>";
  var gmCloseBtn = btn("X", function () { gmModal.classList.remove("open"); });
  gmCloseBtn.style.cssText = "width:24px;height:24px;min-height:24px;border-radius:4px;padding:0";
  gmHead.appendChild(gmCloseBtn);
  gmModal.appendChild(gmHead);

  function addGmBtn(label, fnOrCode) {
    gmModal.appendChild(btn(label, function () {
      if (typeof fnOrCode === "function") fnOrCode();
      else runPy(fnOrCode);
    }));
  }
  addGmBtn("Painel GM (F9)", function () {
    gmModal.classList.remove("open");
    runPy("import net; net.SendChatPacket('/gmpanel_open')");
  });
  addGmBtn("Possuir bot", function () {
    gmModal.classList.remove("open");
    runPy(safePy([
      "import gmpossess, player, chr, chat",
      "_vid = player.GetTargetVID()",
      "if _vid:",
      "    gmpossess.RequestPossess(chr.GetNameByVID(_vid))",
      "else:",
      "    chat.AppendChat(chat.CHAT_TYPE_INFO, 'Possuir: selecione um bot primeiro!')"
    ]));
  });
  addGmBtn("Voltar ao GM", function () {
    gmModal.classList.remove("open");
    runPy("import gmpossess; gmpossess.RequestReturn()");
  });
  addGmBtn("Invisibilidade (/inv)", chatCmd("/inv"));
  addGmBtn("Velocidade 200", chatCmd("/mspd 200"));
  addGmBtn("HP/MP cheios", safePy([
    "import net, player",
    "_n = player.GetName()",
    "net.SendChatPacket('/set ' + _n + ' hp 999999')",
    "net.SendChatPacket('/set ' + _n + ' sp 999999')"
  ]));
  addGmBtn("Pr\u00F3x. jogador/bot", safePy([
    "import chr, player, constInfo, chat",
    "_me = player.GetMainCharacterIndex()",
    "_vids = [v for v in range(1, 400000) if v != _me and chr.HasInstance(v)]",
    "if not _vids:",
    "    chat.AppendChat(chat.CHAT_TYPE_INFO, 'Espectador: nenhum personagem por perto')",
    "else:",
    "    _i = (getattr(constInfo, '_spec_idx', -1) + 1) % len(_vids)",
    "    constInfo._spec_idx = _i",
    "    _v = _vids[_i]",
    "    player.SetTarget(_v)",
    "    _x, _y, _z = chr.GetPixelPosition(_v)",
    "    chat.AppendChat(chat.CHAT_TYPE_INFO, 'Espectador %d/%d: VID %d %s (%d, %d)' % (_i + 1, len(_vids), _v, chr.GetNameByVID(_v), int(_x) // 100, int(_y) // 100))"
  ]));
  addGmBtn("C\u00E2mera zoom m\u00E1x.", safePy([
    "import app, background",
    "app.SetCameraMaxDistance(5500.0)",
    "background.SetViewDistanceSet(0, 5500.0)",
    "background.SelectViewDistanceNum(0)"
  ]));
  addGmBtn("Ca\u00E7a autom\u00E1tica (K)", function () {
    runPy("try:\n    self._GameWindow__ToggleAutoHunt()\nexcept Exception:\n    pass");
  });

  var gmTpSep = document.createElement("div");
  gmTpSep.className = "sep";
  gmTpSep.textContent = "Teleportes";
  gmModal.appendChild(gmTpSep);
  [
    ["M1 Shinsoo", "/go c1"],
    ["M1 Chunjo", "/go b1"],
    ["M1 Jinno", "/go a1"],
    ["Vale dos Orcs", "/go valley"],
    ["Deserto", "/go desert"]
  ].forEach(function (tp) { addGmBtn(tp[0], chatCmd(tp[1])); });

  // 5 round buttons in right column with authentic Metin2 textures (Character window is opened via Red Orb)
  rCol.appendChild(btn('<img src="icons/ui/settings.png" alt="Op\u00E7\u00F5es">', function () {
    gmModal.classList.remove("open");
    if (settingsModal.classList.contains("open")) settingsModal.classList.remove("open");
    else openSettings();
  }, "", "Configura\u00E7\u00F5es", true));

  rCol.appendChild(btn('<img src="icons/ui/inventory.png" alt="Invent\u00E1rio">', function () {
    runPy("try:\n    self.interface.ToggleInventoryWindow()\nexcept Exception:\n    pass");
  }, "", "Invent\u00E1rio (I)", true));

  // Missões: em vez dos pergaminhos espalhados pela tela (o jogo os distribui em
  // colunas pelo lado esquerdo), mostramos uma janela com a lista.
  var questBtn = btn('<img src="icons/ui/quests.png" alt="Miss\u00F5es"><span class="rc-badge" id="m2o_quest_badge"></span>', function () {
    toggleQuestPanel();
  }, "", "Miss\u00F5es", true);
  rCol.appendChild(questBtn);

  rCol.appendChild(btn('<img src="icons/ui/mount.png" alt="Montaria">', function () {
    runPy("import net; net.SendChatPacket('/ride')");
  }, "", "Montar / desmontar", true));

  // Companheiro (no PC: tecla P). Chama direto a função do jogo; se não existir, simula o P.
  var SIDEKICK_SVG =
    '<svg viewBox="0 0 24 24" width="22" height="22" style="display:block;pointer-events:none;filter:drop-shadow(0 1px 2px #000)">' +
    '<defs><linearGradient id="m2sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#c8913a"/></linearGradient></defs>' +
    '<g fill="url(#m2sk)" stroke="#3a2a12" stroke-width="0.7">' +
    '<circle cx="16.2" cy="7.4" r="3"/>' +
    '<path d="M10.6 19.6c0-3.9 2.5-6.6 5.6-6.6s5.6 2.7 5.6 6.6z"/>' +
    '<circle cx="8.2" cy="8.6" r="3.4"/>' +
    '<path d="M1.9 21.2c0-4.4 2.8-7.4 6.3-7.4s6.3 3 6.3 7.4z"/>' +
    '</g></svg>';
  rCol.appendChild(btn(SIDEKICK_SVG, function () {
    runPy([
      "try:",
      "    self._GameWindow__ToggleSidekick()",
      "except Exception:",
      "    try:",
      "        import uisidekick",
      "        uisidekick.ToggleWindow()",
      "    except Exception:",
      "        open('/m2w_key_p', 'w').close()"
    ].join("\n"));
    setTimeout(function () {
      try { if (fsExists("/m2w_key_p")) { fsRm("/m2w_key_p"); tapKey(KEYS.P); } } catch (e) { }
    }, 600);
  }, "", "Companheiro (P)", true));

  // Loja de itens: o botão nativo fica pequeno, no canto do minimapa. Este é um atalho
  // maior, à esquerda da estrela, no topo (mesma ação).
  var shopBtn = btn(
    '<svg viewBox="0 0 24 24" width="20" height="20" style="display:block;pointer-events:none;filter:drop-shadow(0 1px 2px #000)">' +
    '<defs><linearGradient id="m2shop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset="1" stop-color="#d39a32"/></linearGradient></defs>' +
    '<g fill="url(#m2shop)" stroke="#3a2a12" stroke-width="0.8">' +
    '<path d="M1.6 3.6h3.2l2.6 11.2h11.2l2.2-8.2H6.2" fill="none" stroke="url(#m2shop)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<path d="M6.6 7.8h13.2l-1.7 5.8H7.9z"/>' +
    '<circle cx="9.2" cy="19.2" r="1.9"/>' +
    '<circle cx="17.2" cy="19.2" r="1.9"/>' +
    '</g></svg>', function () { toggleItemShop(); }, "shop-btn", "Loja de itens", true);
  root.appendChild(shopBtn);

  // =========================================================================
  // GRÁFICOS / DESEMPENHO (Baixo / Médio / Alto)
  //  - Baixo: 30 FPS, 3D na resolução lógica (menos pixels), visão curta, sem
  //    placas de loja e nomes extras, sem sombras.
  //  - Médio: visão média, sem sombras.  - Alto: como o jogo vem.
  // A resolução só muda ao recarregar; o resto vale na hora.
  // =========================================================================
  function gfxLevel() {
    try { var v = localStorage.getItem("m2w.gfx"); return (v === "low" || v === "med") ? v : "high"; } catch (e) { return "high"; }
  }
  var gfxAtLoad = gfxLevel();
  function gfxPy(lvl) {
    var dist = lvl === "low" ? 6400 : (lvl === "med" ? 12800 : 25600);
    var extras = lvl === "low" ? 0 : 1;
    return safePy([
      "import background, systemSetting, constInfo",
      "for _f in (lambda: background.SetShadowLevel(0), lambda: systemSetting.SetShadowLevel(0)):",
      "    try:",
      "        _f()",
      "    except Exception:",
      "        pass",
      "try:",
      "    background.SetViewDistanceSet(background.DISTANCE0, " + dist + ")",
      "    background.SelectViewDistanceNum(background.DISTANCE0)",
      "except Exception:",
      "    pass",
      "for _n in ('SetShowSalesTextFlag', 'SetAlwaysShowNameFlag'):",
      "    try:",
      "        getattr(systemSetting, _n)(" + extras + ")",
      "    except Exception:",
      "        pass",
      "constInfo._mob_fps_boost = " + (extras ? "False" : "True")
    ]);
  }
  function applyGfx() { if (inWorld) runPy(gfxPy(gfxLevel())); }

  // Lojas (de jogador / offline / NPC): toque curto = só ver o item (descrição);
  // segurar = perguntar se quer comprar. Usa a mesma marca "toque curto" do
  // inventário (constInfo._m2o_peek): as funções "AskBuy..." das lojas ignoram o
  // clique quando ele foi um toque curto. Roda ao entrar no jogo (as janelas de
  // loja já foram criadas).
  var SHOP_PEEK_PY = [
    "import sys, constInfo, app",
    "def _m2oWrapBuy(f):",
    "    def _w(self, *a, **k):",
    "        try:",
    "            if getattr(constInfo, '_m2o_peek', 0) and app.GetTime() - getattr(constInfo, '_m2o_peek_t', -99.0) < 0.8:",
    "                constInfo._m2o_peek = 0",
    "                return None",
    "        except Exception:",
    "            pass",
    "        return f(self, *a, **k)",
    "    _w._m2oBuy = True",
    "    return _w",
    "for _mn, _mod in list(sys.modules.items()):",
    "    if _mod is None:",
    "        continue",
    "    try:",
    "        _items = list(vars(_mod).items())",
    "    except Exception:",
    "        continue",
    "    for _cn, _cls in _items:",
    "        if not isinstance(_cls, type) or not ('Shop' in _cn or 'Market' in _cn):",
    "            continue",
    "        if getattr(_cls, '__module__', '') != _mn:",
    "            continue",
    "        for _an, _f in list(vars(_cls).items()):",
    "            if 'AskBuy' in _an and callable(_f) and not getattr(_f, '_m2oBuy', False):",
    "                setattr(_cls, _an, _m2oWrapBuy(_f))"
  ].join("\n");
  function showGfxPicker() {
    var old = document.getElementById("m2o_gfx");
    if (old) { old.remove(); return; }
    var m = document.createElement("div");
    m.id = "m2o_gfx";
    m.className = "gold-box";
    m.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(330px,90vw);padding:8px 10px;" +
      "pointer-events:auto;z-index:60;font:600 11.5px/1.5 Tahoma,'Segoe UI',sans-serif;color:#e6e2d8;display:flex;flex-direction:column;gap:6px";
    var title = document.createElement("div");
    title.style.cssText = "font-size:13px;font-weight:700;color:#f3dfb0";
    title.textContent = "Gr\u00E1ficos / desempenho";
    m.appendChild(title);
    var cur = gfxLevel();
    [["low", "Baixo - mais leve (30 FPS, menos resolu\u00E7\u00E3o, vis\u00E3o curta)"],
     ["med", "M\u00E9dio - equilibrado (vis\u00E3o m\u00E9dia)"],
     ["high", "Alto - melhor visual (como o jogo vem)"]].forEach(function (o) {
      var b = btn((cur === o[0] ? "\u2714 " : "") + o[1], function () {
        try { localStorage.setItem("m2w.gfx", o[0]); } catch (e) { }
        applyGfx();
        m.remove();
        var needReload = (o[0] === "low") !== (gfxAtLoad === "low");
        showHudTip(needReload
          ? "<b>Gr\u00E1ficos: " + o[1].split(" - ")[0] + "</b><br>A resolu\u00E7\u00E3o muda na pr\u00F3xima vez que o jogo abrir (ou recarregue a p\u00E1gina)."
          : "<b>Gr\u00E1ficos: " + o[1].split(" - ")[0] + "</b>", 200, 8);
      });
      b.style.cssText = "height:32px;border-radius:3px;justify-content:flex-start;padding:0 10px;text-align:left";
      m.appendChild(b);
    });
    var note = document.createElement("div");
    note.style.cssText = "font-size:10px;color:#c8bba0";
    note.textContent = "Use \"Baixo\" se o jogo estiver travando ou o celular esquentando.";
    m.appendChild(note);
    var close = btn("Fechar", function () { m.remove(); });
    close.style.cssText = "height:26px;border-radius:3px";
    m.appendChild(close);
    root.appendChild(m);
  }
  var gfxBtn = btn(
    '<svg viewBox="0 0 24 24" width="19" height="19" style="display:block;pointer-events:none;filter:drop-shadow(0 1px 2px #000)">' +
    '<g fill="url(#m2shop)" stroke="#3a2a12" stroke-width="0.8">' +
    '<rect x="3" y="13" width="4" height="8" rx="1"/>' +
    '<rect x="10" y="8" width="4" height="13" rx="1"/>' +
    '<rect x="17" y="3" width="4" height="18" rx="1"/>' +
    '</g></svg>', showGfxPicker, "shop-btn gfx-btn", "Gr\u00E1ficos / desempenho", true);
  // (botão de gráficos do topo removido: a opção está em Configurações)
  var escBtn = btn('<span style="font:700 10px/1 Tahoma,sans-serif;color:#ffe9a8;text-shadow:0 1px 2px #000;pointer-events:none">ESC</span>',
    function () { tapKey(KEYS.ESC); }, "shop-btn esc-btn", "ESC / Fechar janela", true);
  root.appendChild(escBtn);
  // VIP (conta Premium): no lugar da estrela do jogo, um botão no padrão dos outros,
  // que só aparece com o VIP ativo. Toque: lista curta dos benefícios.
  var vipBtn = btn('<span style="font:700 15px/1 Tahoma,sans-serif;color:#ffd75e;text-shadow:0 1px 2px #000;pointer-events:none">\u2605</span>',
    function () { toggleVipPanel(); }, "shop-btn vip-btn", "VIP", true);
  vipBtn.style.display = "none";
  root.appendChild(vipBtn);
  var vipActive = false;
  var vipPanel = null;
  var VIP_TXT = {
    SUBSCRIPTION_BENEFIT_EXP: { pt: "+50% de experi\u00EAncia", en: "50% more experience", pl: "50% wi\u0119cej do\u015Bwiadczenia" },
    SUBSCRIPTION_BENEFIT_DROP: { pt: "Chance de drop de itens em dobro", en: "Double item drop chance", pl: "Podw\u00F3jna szansa na przedmioty" },
    SUBSCRIPTION_BENEFIT_CHANNEL: { pt: "Acesso ao canal Premium", en: "Access to the Premium channel", pl: "Dost\u0119p do kana\u0142u Premium" },
    SUBSCRIPTION_BENEFIT_PICKUP: { pt: "Yang \u00E9 pego automaticamente", en: "Yang is picked up automatically", pl: "Yang zbierany automatycznie" },
    SUBSCRIPTION_BENEFIT_ITEM_VIEW: { pt: "Ver itens no chat", en: "Item previews in the chat", pl: "Podgl\u0105d przedmiot\u00F3w na czacie" },
    SUBSCRIPTION_BENEFIT_LOVE: { pt: "Pontos de amor regeneram em dobro", en: "Double love point regeneration", pl: "Podw\u00F3jna regeneracja punkt\u00F3w mi\u0142o\u015Bci" },
    SUBSCRIPTION_BENEFIT_FISH: { pt: "Mais chance de pescar", en: "Better chance to catch fish", pl: "Wi\u0119ksza szansa na ryb\u0119" },
    SUBSCRIPTION_BENEFIT_DEPOSIT: { pt: "+45 espa\u00E7os no armaz\u00E9m", en: "45 more storeroom slots", pl: "45 miejsc wi\u0119cej w magazynie" },
    SUBSCRIPTION_BENEFIT_EMOTION: { pt: "Uso de emo\u00E7\u00F5es", en: "Use of Emotions", pl: "U\u017Cywanie emocji" },
    SUBSCRIPTION_BENEFIT_PASSAGE: { pt: "Entrada gr\u00E1tis na Masmorra das Aranhas V2", en: "Free entry to Spider Dungeon V2", pl: "Darmowe wej\u015Bcie do Lochu Paj\u0105k\u00F3w V2" },
    SUBSCRIPTION_BENEFIT_GOLD: { pt: "Chance de drop de Yang em dobro", en: "Double Yang drop chance", pl: "Podw\u00F3jna szansa na Yang" },
    SUBSCRIPTION_BENEFIT_SHOP: { pt: "+20 espa\u00E7os na loja, loja aberta at\u00E9 48h", en: "20 more shop slots, shops open up to 48h", pl: "20 miejsc wi\u0119cej w sklepie, sklep do 48h" }
  };
  function toggleVipPanel() {
    if (vipPanel) { vipPanel.remove(); vipPanel = null; return; }
    runPy(safePy([
      "import json, localeInfo",
      "import itemshop_subscriptionwindow as _sw",
      "_keys = []",
      "_names = [n for n in dir(localeInfo) if n.startswith('SUBSCRIPTION_BENEFIT_')]",
      "for _i in sorted(_sw.BENEFITS):",
      "    _d = _sw.BENEFITS[_i].get('desc')",
      "    for _n in _names:",
      "        if getattr(localeInfo, _n, None) == _d:",
      "            _keys.append(_n)",
      "            break",
      "_f = open('/m2w_vipinfo.json', 'w')",
      "_f.write(json.dumps(_keys))",
      "_f.close()"
    ]));
  }
  function showVipPanel(keys) {
    if (vipPanel) vipPanel.remove();
    var lang = (M2I18N && M2I18N.lang) || "pt";
    var p = document.createElement("div");
    p.className = "gold-box";
    var br = vipBtn.getBoundingClientRect();
    p.style.cssText = "position:fixed;top:" + Math.round(br.bottom + 6) + "px;right:" + Math.max(6, Math.round(window.innerWidth - br.right - 40)) + "px;" +
      "width:min(230px,70vw);max-height:60vh;overflow:auto;padding:7px 9px;z-index:70;pointer-events:auto;" +
      "background:rgba(10,9,7,0.92);font:600 10.5px/1.45 Tahoma,sans-serif;color:#e6e2d8";
    var h = document.createElement("div");
    h.style.cssText = "font-weight:700;color:#ffd75e;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center";
    h.innerHTML = "<span>\u2605 VIP</span>";
    var x = btn("X", function () { p.remove(); vipPanel = null; });
    x.style.cssText = "width:20px;height:20px;padding:0;border-radius:3px;font-size:10px";
    h.appendChild(x);
    p.appendChild(h);
    if (!keys || !keys.length) keys = Object.keys(VIP_TXT);
    keys.forEach(function (k) {
      var t = VIP_TXT[k];
      var row = document.createElement("div");
      row.textContent = "\u2022 " + (t ? (t[lang] || t.en) : k);
      p.appendChild(row);
    });
    root.appendChild(p);
    vipPanel = p;
  }
  setInterval(function () {
    try {
      if (!window.Module || !Module.FS) return;
      if (fsExists("/m2w_vipinfo.json")) {
        var ks = JSON.parse(Module.FS.readFile("/m2w_vipinfo.json", { encoding: "utf8" }));
        fsRm("/m2w_vipinfo.json");
        showVipPanel(ks);
      }
      if (fsExists("/m2w_vip.json")) {
        var v = JSON.parse(Module.FS.readFile("/m2w_vip.json", { encoding: "utf8" }));
        fsRm("/m2w_vip.json");
        vipActive = !!(v && v.a);
        vipBtn.style.display = (vipActive && inWorld) ? "" : "none";
        if (!vipActive && vipPanel) { vipPanel.remove(); vipPanel = null; }
      }
    } catch (e) { }
  }, 300);
  // Confere o VIP de tempos em tempos e esconde a estrela do jogo (fica o botão novo).
  setInterval(function () {
    if (!inWorld || fsExists("/m2w_cmd.py")) return;
    runPy(safePy([
      "import chr, constInfo",
      "_a = 1 if chr.NEW_AFFECT_SUBSCRIPTION in getattr(constInfo, 'AFFECT_DICT', {}) else 0",
      "_vs = getattr(getattr(self, 'affectBar', None), 'vipShower', None)",
      "if _vs is not None and _a:",
      "    _vs.Hide()",
      "    _vs.Show = lambda *a: None",
      "open('/m2w_vip.json', 'w').write('{\"a\": %d}' % _a)"
    ]));
  }, 5000);
  var kbBtn = btn('<span style="font:700 15px/1 Tahoma,sans-serif;color:#ffe9a8;text-shadow:0 1px 2px #000;pointer-events:none">\u2328</span>',
    function () { if (gameKbOpen()) hideGameKb(); else openGameKbManual(); }, "shop-btn kb-btn", "Teclado", true);
  if (!isTouchDevice) kbBtn.style.display = "none";
  root.appendChild(kbBtn);
  // Posição em unidades do jogo (o minimapa é desenhado pelo jogo): ~168 px lógicos da direita.
  // O minimapa (do jogo) anda para a esquerda para dar lugar à barra de zoom vertical.
  var ZOOM_SIDE_CSS = 44;
  function shiftMiniMap() {
    if (!inWorld) return;
    var c = canvasEl();
    if (!c) return;
    var r = c.getBoundingClientRect();
    var lw = 0;
    try { lw = (window.m2w && m2w.mobileLogical) ? m2w.mobileLogical().w : 0; } catch (e) { }
    if (!lw) lw = c.width || r.width;
    var shiftL = Math.round(ZOOM_SIDE_CSS * lw / (r.width || 1));
    runPy(safePy([
      "_mm = getattr(getattr(self, 'interface', None), 'wndMiniMap', None)",
      "if _mm is not None:",
      "    if not hasattr(_mm, '_m2oOrigPos'):",
      "        _mm._m2oOrigPos = tuple(_mm.GetLocalPosition())",
      "    _mm.SetPosition(_mm._m2oOrigPos[0] - " + shiftL + ", _mm._m2oOrigPos[1])",
      "import constInfo",
      "constInfo._m2o_mm_shift = " + shiftL,
      "try:",
      "    import uiAffectBar",
      "    _AS = uiAffectBar.AffectShower",
      "    if not getattr(_AS, '_m2oVipPosPatch', False):",
      "        _ovp = _AS._AffectShower__SetVipShowerPosition",
      "        def _vp(self, width, _ovp=_ovp):",
      "            _ovp(self, width)",
      "            try:",
      "                _x, _y = self.vipShower.GetLocalPosition()",
      "                self.vipShower.SetPosition(_x + int(getattr(constInfo, '_m2o_mm_shift', 0)), _y)",
      "            except Exception:",
      "                pass",
      "        _AS._AffectShower__SetVipShowerPosition = _vp",
      "        _AS._m2oVipPosPatch = True",
      "    _ab = getattr(self, 'affectBar', None)",
      "    if _ab is not None:",
      "        _ab.ArrangeAffectImage()",
      "except Exception:",
      "    pass"
    ]));
  }
  window.addEventListener("resize", function () { setTimeout(shiftMiniMap, 600); });
  function positionShopBtn() {
    try {
      var c = canvasEl();
      if (!c) return;
      var r = c.getBoundingClientRect();
      var lw = 0;
      try { lw = (window.m2w && m2w.mobileLogical) ? m2w.mobileLogical().w : 0; } catch (e) { }
      if (!lw) lw = c.width || r.width;
      var k = r.width / lw;
      var shopRight = Math.round((window.innerWidth - r.right) + 168 * k) + ZOOM_SIDE_CSS;
      shopBtn.style.right = shopRight + "px";
      shopBtn.style.top = Math.round(r.top + 4 * k) + "px";
      escBtn.style.right = (shopRight + 36) + "px";
      escBtn.style.top = shopBtn.style.top;
      kbBtn.style.right = (shopRight + 72) + "px";
      kbBtn.style.top = shopBtn.style.top;
      vipBtn.style.right = (shopRight + 108) + "px";
      vipBtn.style.top = shopBtn.style.top;
    } catch (e) { }
  }
  positionShopBtn();
  window.addEventListener("resize", function () { setTimeout(positionShopBtn, 200); });

  var gmBtn = btn('<img src="icons/ui/gm.png" alt="GM">', function () {
    gearMenu.classList.remove("open");
    gmModal.classList.toggle("open");
  }, "", "Painel GM", true);
  gmBtn.style.display = "none";
  rCol.appendChild(gmBtn);

  // =========================================================================
  // 3. BOTTOM-RIGHT COMBAT WHEEL (86x86px, center right:95px, bottom:57px) + 34x34 SLOTS ON R=84px
  // =========================================================================
  var atkBtn = document.createElement("button");
  atkBtn.type = "button";
  atkBtn.className = "atk-btn";
  atkBtn.innerHTML =
    '<svg viewBox="0 0 64 64" width="60" height="60" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.95)) drop-shadow(0 0 6px rgba(212,168,83,0.35)); display:block;">' +
    '<defs>' +
    '<linearGradient id="m2b1" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '<stop offset="0%" stop-color="#ffffff"/>' +
    '<stop offset="35%" stop-color="#d8e2eb"/>' +
    '<stop offset="50%" stop-color="#7a8896"/>' +
    '<stop offset="70%" stop-color="#c5d1db"/>' +
    '<stop offset="100%" stop-color="#525d68"/>' +
    '</linearGradient>' +
    '<linearGradient id="m2g1" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '<stop offset="0%" stop-color="#fff0b3"/>' +
    '<stop offset="40%" stop-color="#e0b252"/>' +
    '<stop offset="75%" stop-color="#9c6f21"/>' +
    '<stop offset="100%" stop-color="#593a0b"/>' +
    '</linearGradient>' +
    '<radialGradient id="m2gem" cx="35%" cy="35%" r="65%">' +
    '<stop offset="0%" stop-color="#ff8a8a"/>' +
    '<stop offset="45%" stop-color="#d91b1b"/>' +
    '<stop offset="100%" stop-color="#5c0505"/>' +
    '</radialGradient>' +
    '</defs>' +
    '<!-- Miecz 1 (lewy dol -> prawy gora) -->' +
    '<g transform="translate(32,32) rotate(45) translate(-32,-32)">' +
    '<path d="M32 5 L36 14 L34.5 42 L29.5 42 L28 14 Z" fill="url(#m2b1)" stroke="#1a140e" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<line x1="32" y1="10" x2="32" y2="39" stroke="#3a444d" stroke-width="1.3" stroke-linecap="round"/>' +
    '<path d="M21 41 Q32 45 43 41 L44 44.5 Q32 48 20 44.5 Z" fill="url(#m2g1)" stroke="#1a140e" stroke-width="1.3"/>' +
    '<rect x="29.8" y="45" width="4.4" height="9.5" rx="1.5" fill="#4a2511" stroke="#1a140e" stroke-width="1.2"/>' +
    '<line x1="30" y1="48" x2="34" y2="48" stroke="#c89d46" stroke-width="1"/>' +
    '<line x1="30" y1="51.5" x2="34" y2="51.5" stroke="#c89d46" stroke-width="1"/>' +
    '<circle cx="32" cy="57" r="3.6" fill="url(#m2g1)" stroke="#1a140e" stroke-width="1.2"/>' +
    '<circle cx="32" cy="57" r="1.8" fill="url(#m2gem)"/>' +
    '</g>' +
    '<!-- Miecz 2 (prawy dol -> lewy gora) -->' +
    '<g transform="translate(32,32) rotate(-45) translate(-32,-32)">' +
    '<path d="M32 5 L36 14 L34.5 42 L29.5 42 L28 14 Z" fill="url(#m2b1)" stroke="#1a140e" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<line x1="32" y1="10" x2="32" y2="39" stroke="#3a444d" stroke-width="1.3" stroke-linecap="round"/>' +
    '<path d="M21 41 Q32 45 43 41 L44 44.5 Q32 48 20 44.5 Z" fill="url(#m2g1)" stroke="#1a140e" stroke-width="1.3"/>' +
    '<rect x="29.8" y="45" width="4.4" height="9.5" rx="1.5" fill="#4a2511" stroke="#1a140e" stroke-width="1.2"/>' +
    '<line x1="30" y1="48" x2="34" y2="48" stroke="#c89d46" stroke-width="1"/>' +
    '<line x1="30" y1="51.5" x2="34" y2="51.5" stroke="#c89d46" stroke-width="1"/>' +
    '<circle cx="32" cy="57" r="3.6" fill="url(#m2g1)" stroke="#1a140e" stroke-width="1.2"/>' +
    '<circle cx="32" cy="57" r="1.8" fill="url(#m2gem)"/>' +
    '</g>' +
    '</svg>' +
    '<span class="atk-badge" id="m2o_atk_badge">\uD83C\uDFA3</span>';
  root.appendChild(atkBtn);
  var atkBadgeEl = atkBtn.querySelector("#m2o_atk_badge");
  var atkTouch = null;
  var atkRafId = 0;
  function flushAtkMove() {
    atkRafId = 0;
    if (!atkTouch || !atkTouch.rmbDown) return;
    if (atkTouch.dx !== 0 || atkTouch.dy !== 0) {
      var dx = atkTouch.dx, dy = atkTouch.dy;
      atkTouch.dx = 0;
      atkTouch.dy = 0;
      mouse("mousemove", atkTouch.x, atkTouch.y, 2, dx, dy, 2);
    }
  }
  atkBtn.addEventListener("touchstart", function (e) {
    e.preventDefault();
    e.stopPropagation();
    markInputActive();
    sendKey(KEYS.SPACE, true);
    var t = e.changedTouches[0];
    if (t && !atkTouch) {
      atkTouch = { id: t.identifier, startX: t.clientX, startY: t.clientY, x: t.clientX, y: t.clientY, dx: 0, dy: 0, rmbDown: false };
    }
  }, { passive: false });
  atkBtn.addEventListener("touchmove", function (e) {
    e.preventDefault();
    e.stopPropagation();
    markInputActive();
    if (!atkTouch) return;
    var t = findTouch(e.changedTouches, atkTouch.id);
    if (!t) return;
    var dx = t.clientX - atkTouch.x, dy = t.clientY - atkTouch.y;
    atkTouch.x = t.clientX;
    atkTouch.y = t.clientY;
    var dist = Math.abs(t.clientX - atkTouch.startX) + Math.abs(t.clientY - atkTouch.startY);
    if (!atkTouch.rmbDown && dist >= 6) {
      atkTouch.rmbDown = true;
      mouse("mousedown", atkTouch.startX, atkTouch.startY, 2, 0, 0, 2);
    }
    if (atkTouch.rmbDown) {
      atkTouch.dx += dx;
      atkTouch.dy += dy;
      if (!atkRafId) atkRafId = requestAnimationFrame(flushAtkMove);
    }
  }, { passive: false });
  ["touchend", "touchcancel"].forEach(function (evName) {
    atkBtn.addEventListener(evName, function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (atkTouch) {
        if (atkRafId) {
          cancelAnimationFrame(atkRafId);
          flushAtkMove();
        }
        var t = findTouch(e.changedTouches, atkTouch.id) || { clientX: atkTouch.x, clientY: atkTouch.y };
        if (atkTouch.rmbDown) {
          mouse("mouseup", t.clientX, t.clientY, 2, 0, 0, 0);
        }
        atkTouch = null;
      }
      sendKey(KEYS.SPACE, false);
      autoAtkHeld = false;   // o AUTO volta a segurar no próximo ciclo, se for o caso
    }, { passive: false });
  });
  atkBtn.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); markInputActive(); sendKey(KEYS.SPACE, true); });
  atkBtn.addEventListener("mouseup", function (e) { e.preventDefault(); e.stopPropagation(); sendKey(KEYS.SPACE, false); });

  // Attack button (86x86px) center at right: 95px, bottom: 57px (right: 52px, bottom: 14px).
  // 6 slots (1, 2, 3, 4, F1, F2, each 34x34px) arranged on circular arc of radius R = 84px
  // at 26° intervals: 80°, 106°, 132°, 158°, 184°, 210° (0°=right, 90°=up, 180°=left, 270°=down).
  var QUICK_SLOTS = [
    { label: "1",  slot: 0, key: KEYS.N1, deg: 80,  right: 63,  bottom: 123 },
    { label: "2",  slot: 1, key: KEYS.N2, deg: 106, right: 101, bottom: 121 },
    { label: "3",  slot: 2, key: KEYS.N3, deg: 132, right: 134, bottom: 102 },
    { label: "4",  slot: 3, key: KEYS.N4, deg: 158, right: 156, bottom: 71 },
    { label: "F1", slot: 4, key: KEYS.F1, deg: 184, right: 162, bottom: 34 },
    { label: "F2", slot: 5, key: KEYS.F2, deg: 210, right: 151, bottom: 2 },
    { label: "F3", slot: 6, key: KEYS.F3, left:  12, bottom: 78 },
    { label: "F4", slot: 7, key: KEYS.F4, left:  12, bottom: 34 }
  ];

  // Original Metin2 PNG icon + Stylized SVG fallback generator for skills & potions
  function buildSlotVisual(slotObj, defaultLabel) {
    if (!slotObj || !slotObj.type || (!slotObj.vnum && !slotObj.name)) {
      return { filled: false, iconUrl: "", svg: "", badge: "", title: "" };
    }
    var nm = String(slotObj.name || "").trim();
    var low = nm.toLowerCase();
    var vnum = slotObj.vnum || 0;
    var iconUrl = String(slotObj.icon_url || "");
    var svg = "";
    var badge = "";

    if (slotObj.type === 2) {
      // SKILL
      if (!iconUrl && vnum > 0) iconUrl = "icons/skill/" + vnum + ".png";
      badge = "";
      if (low.indexOf("truj") >= 0 || vnum === 35 || vnum === 50) {
        svg = '<svg viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><radialGradient id="skPois" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#3a8f42"/><stop offset="60%" stop-color="#1e4226"/><stop offset="100%" stop-color="#0c140e"/></radialGradient></defs>' +
          '<rect width="34" height="34" fill="url(#skPois)"/>' +
          '<circle cx="12" cy="14" r="6.5" fill="#5ce669" fill-opacity="0.38"/>' +
          '<circle cx="21" cy="12" r="5.5" fill="#a855f7" fill-opacity="0.38"/>' +
          '<circle cx="17" cy="18" r="6" fill="#4ade80" fill-opacity="0.35"/>' +
          '<path d="M9 22 C13 12, 19 8, 26 6 C22 13, 18 18, 12 24 Z" fill="#bbf7d0" stroke="#062810" stroke-width="1"/>' +
          '</svg>';
      } else if (low.indexOf("wir") >= 0 || vnum === 32 || vnum === 2) {
        svg = '<svg viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><radialGradient id="skWhirl" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#9e2a2b"/><stop offset="65%" stop-color="#3d1318"/><stop offset="100%" stop-color="#120709"/></radialGradient></defs>' +
          '<rect width="34" height="34" fill="url(#skWhirl)"/>' +
          '<path d="M17 5 A11 11 0 1 1 7 19" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round"/>' +
          '<path d="M17 27 A11 11 0 1 1 27 13" fill="none" stroke="#fca5a5" stroke-width="1.8" stroke-linecap="round"/>' +
          '<path d="M8 22 L25 7 L21 15 L12 24 Z" fill="#fef08a" stroke="#450a0a" stroke-width="0.9"/>' +
          '</svg>';
      } else if (low.indexOf("szyb") >= 0 || low.indexOf("szar") >= 0 || vnum === 33 || vnum === 5) {
        svg = '<svg viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><radialGradient id="skFast" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#1d5b79"/><stop offset="65%" stop-color="#0f293a"/><stop offset="100%" stop-color="#071118"/></radialGradient></defs>' +
          '<rect width="34" height="34" fill="url(#skFast)"/>' +
          '<path d="M6 23 L27 6 M11 26 L29 11" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>' +
          '<path d="M19 5 L12 15 L18 15 L13 25 L24 13 L18 13 Z" fill="#fde047" stroke="#082f49" stroke-width="0.9"/>' +
          '</svg>';
      } else if (low.indexOf("zasad") >= 0 || low.indexOf("kryc") >= 0 || vnum === 31 || vnum === 34) {
        svg = '<svg viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><radialGradient id="skAmb" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#581c87"/><stop offset="65%" stop-color="#27103d"/><stop offset="100%" stop-color="#0b0512"/></radialGradient></defs>' +
          '<rect width="34" height="34" fill="url(#skAmb)"/>' +
          '<path d="M25 5 L11 19 L14 22 L28 8 Z" fill="#e9d5ff" stroke="#1e0636" stroke-width="1"/>' +
          '<path d="M9 17 L16 24 M8 24 L12 20" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>' +
          '</svg>';
      } else if (low.indexOf("strza") >= 0 || low.indexOf("ognist") >= 0 || low.indexOf("powtarz") >= 0 || (vnum >= 46 && vnum <= 50)) {
        svg = '<svg viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><radialGradient id="skBow" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#9a3412"/><stop offset="65%" stop-color="#431407"/><stop offset="100%" stop-color="#140703"/></radialGradient></defs>' +
          '<rect width="34" height="34" fill="url(#skBow)"/>' +
          '<path d="M10 6 C22 8, 24 20, 12 26" fill="none" stroke="#f59e0b" stroke-width="2.2"/>' +
          '<path d="M8 22 L26 8 M26 8 L20 8 M26 8 L25 14" fill="none" stroke="#fef08a" stroke-width="1.8" stroke-linecap="round"/>' +
          '</svg>';
      } else {
        svg = '<svg viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><radialGradient id="skGen" cx="50%" cy="45%" r="55%"><stop offset="0%" stop-color="#854d0e"/><stop offset="65%" stop-color="#3b2106"/><stop offset="100%" stop-color="#120a02"/></radialGradient></defs>' +
          '<rect width="34" height="34" fill="url(#skGen)"/>' +
          '<path d="M24 5 L27 8 L15 20 L12 17 Z" fill="#fef08a" stroke="#291502" stroke-width="0.9"/>' +
          '<path d="M9 15 L18 24 M8 23 L12 19" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round"/>' +
          '</svg>';
      }
    } else if (slotObj.type === 1) {
      // INVENTORY ITEM (Potions / Consumables)
      if (!iconUrl && vnum > 0) iconUrl = "icons/item/" + vnum + ".png";
      badge = (slotObj.count && slotObj.count > 0) ? String(slotObj.count) : "";
      var cTop = "#ef4444", cBot = "#7f1d1d", cBg = "#3b0a0a";
      if (low.indexOf("nieb") >= 0 || (vnum >= 27004 && vnum <= 27006)) {
        cTop = "#38bdf8"; cBot = "#1e3a8a"; cBg = "#081e3f";
      } else if (low.indexOf("ziel") >= 0 || (vnum >= 27100 && vnum <= 27105)) {
        cTop = "#4ade80"; cBot = "#14532d"; cBg = "#072614";
      } else if (low.indexOf("fiol") >= 0 || (vnum >= 27110 && vnum <= 27115)) {
        cTop = "#c084fc"; cBot = "#4c1d95"; cBg = "#1e093b";
      }
      svg = '<svg viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="34" height="34" fill="' + cBg + '"/>' +
        '<rect x="14.5" y="4" width="5" height="3" rx="1" fill="#d97706" stroke="#1c1206" stroke-width="0.8"/>' +
        '<rect x="13.5" y="6.8" width="7" height="2.4" rx="1" fill="#cbd5e1" stroke="#0f172a" stroke-width="0.8"/>' +
        '<path d="M14 9 L10 15 A7.5 7.5 0 1 0 24 15 L20 9 Z" fill="' + cBot + '" stroke="#e2c275" stroke-width="1.1"/>' +
        '<path d="M10.2 16.2 Q17 14.5 23.8 16.2 A7 7 0 0 1 10.2 16.2 Z" fill="' + cTop + '"/>' +
        '<circle cx="14" cy="16" r="2" fill="#ffffff" fill-opacity="0.55"/>' +
        '</svg>';
    } else {
      return { filled: false, iconUrl: "", svg: "", badge: "", title: "" };
    }
    return { filled: true, iconUrl: iconUrl, svg: svg, badge: badge, title: nm };
  }

  function renderSlotArt(artEl, vis) {
    if (!artEl) return;
    artEl.innerHTML = "";
    if (!vis || !vis.filled) return;
    if (vis.iconUrl) {
      var img = document.createElement("img");
      img.src = vis.iconUrl;
      img.alt = vis.title || "";
      img.onerror = function () {
        artEl.innerHTML = vis.svg || "";
      };
      artEl.appendChild(img);
    } else {
      artEl.innerHTML = vis.svg || "";
    }
  }

  var slotEls = [];
  QUICK_SLOTS.forEach(function (cfg) {
    var sb = document.createElement("button");
    sb.type = "button";
    sb.className = "qslot";
    if (typeof cfg.right === "number") sb.style.right = cfg.right + "px";
    if (typeof cfg.left === "number") sb.style.left = cfg.left + "px";
    sb.style.bottom = cfg.bottom + "px";
    sb.innerHTML =
      '<span class="qs-key">' + cfg.label + '</span>' +
      '<div class="qs-art"></div>' +
      '<span class="qs-empty">' + cfg.label + '</span>' +
      '<span class="qs-badge"></span>';

    var lpTimer = null;
    var lpTriggered = false;
    sb.addEventListener("touchstart", function (e) {
      e.preventDefault();
      e.stopPropagation();
      lpTriggered = false;
      clearTimeout(lpTimer);
      lpTimer = setTimeout(function () {
        lpTriggered = true;
        // Toque longo = limpar o slot. O motor espera o índice GLOBAL (página atual), não o local.
        runPy(safePy([
          "import player",
          "_g = " + cfg.slot,
          "try:",
          "    _g = player.LocalQuickSlotIndexToGlobalQuickSlotIndex(" + cfg.slot + ")",
          "except Exception:",
          "    pass",
          "player.RequestDeleteGlobalQuickSlot(_g)"
        ]));
        sb.classList.add("qs-cleared");
        setTimeout(function () { sb.classList.remove("qs-cleared"); }, 350);
        try { if (navigator.vibrate) navigator.vibrate(30); } catch (e2) { }
      }, 600);
    }, { passive: false });
    sb.addEventListener("touchcancel", function () { clearTimeout(lpTimer); }, { passive: true });

    function triggerSlotUse() {
      markInputActive();
      bindOrUseSlot(cfg.slot);
    }

    sb.addEventListener("touchend", function (e) {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(lpTimer);
      if (lpTriggered) return;
      triggerSlotUse();
    }, { passive: false });
    sb.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (lpTriggered) return;
      triggerSlotUse();
    });
    root.appendChild(sb);
    slotEls.push(sb);
  });

  // Usa ou vincula um slot rápido.
  // BUG ANTIGO: além do comando Python, o botão também simulava a tecla (1-4 / F1-F4).
  // Resultado: poções eram usadas 2x, habilidades de buff ligavam e desligavam na hora
  // (parecia que "o botão não funciona") e F1-F4 acionavam slots errados, porque neste
  // cliente F1-F4 apontam para os slots 6-9. Agora só o caminho Python é usado.
  function bindOrUseSlot(slotIdx) {
    runPy(
      "import player, mouseModule\n" +
      "if mouseModule.mouseController.isAttached():\n" +
      "    _done = False\n" +
      "    try:\n" +
      "        _tb = getattr(getattr(self, 'interface', None), 'wndTaskBar', None)\n" +
      "        if _tb:\n" +
      "            _tb.AddQuickSlot(" + slotIdx + ")\n" +
      "            _done = True\n" +
      "    except Exception:\n" +
      "        _done = False\n" +
      "    if not _done:\n" +
      "        try:\n" +
      "            _at = mouseModule.mouseController.GetAttachedType()\n" +
      "            _ap = mouseModule.mouseController.GetAttachedSlotNumber()\n" +
      "            if _at in (player.SLOT_TYPE_INVENTORY, player.SLOT_TYPE_SKILL):\n" +
      "                player.RequestAddLocalQuickSlot(" + slotIdx + ", _at, _ap)\n" +
      "        except Exception:\n" +
      "            pass\n" +
      "    try:\n" +
      "        if mouseModule.mouseController.isAttached():\n" +
      "            mouseModule.mouseController.DeattachObject()\n" +
      "    except Exception:\n" +
      "        pass\n" +
      "else:\n" +
      "    _pq = getattr(self, '_GameWindow__PressQuickSlot', None)\n" +
      "    if callable(_pq):\n" +
      "        _pq(" + slotIdx + ")\n" +
      "    else:\n" +
      "        player.RequestUseLocalQuickSlot(" + slotIdx + ")"
    );
  }

  // =========================================================================
  // 4. BOTTOM-LEFT GOLD JOYSTICK (WITH FLOATING ZONE) + PICKUP HAND SVG
  // =========================================================================
  var joy = document.createElement("div");
  joy.className = "joy";
  var knob = document.createElement("i");
  joy.appendChild(knob);
  root.appendChild(joy);

  var held = { 87: false, 65: false, 83: false, 68: false };
  function setHeld(k, on) {
    if (held[k] === on) return;
    held[k] = on;
    sendKey(k, on);
  }
  var joyId = null;
  var joyRect = null;
  var joyFloating = false;
  var joyKnobX = 0, joyKnobY = 0, joyRafId = 0;
  function refreshJoyRect() {
    try { joyRect = joy.getBoundingClientRect(); } catch (e) { joyRect = null; }
  }
  window.addEventListener("resize", refreshJoyRect);
  window.addEventListener("orientationchange", refreshJoyRect);
  function renderJoyKnob() {
    joyRafId = 0;
    knob.style.transform = "translate3d(" + joyKnobX.toFixed(1) + "px," + joyKnobY.toFixed(1) + "px,0)";
  }
  function joyMove(t) {
    markInputActive();
    var r = joyRect || joy.getBoundingClientRect();
    var cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.5;
    var dx = t.clientX - cx, dy = t.clientY - cy;
    var max = r.width * 0.5 || 51, len = Math.hypot(dx, dy) || 1;
    var k = Math.min(1, len / max);
    joyKnobX = (dx / len) * k * 28;
    joyKnobY = (dy / len) * k * 28;
    if (!joyRafId) joyRafId = requestAnimationFrame(renderJoyKnob);
    var dead = 0.22 * max;
    setHeld(KEYS.D, dx > dead);
    setHeld(KEYS.A, dx < -dead);
    setHeld(KEYS.S, dy > dead);
    setHeld(KEYS.W, dy < -dead);
  }
  function joyEnd() {
    joyId = null;
    joyKnobX = 0;
    joyKnobY = 0;
    if (joyRafId) { cancelAnimationFrame(joyRafId); joyRafId = 0; }
    knob.style.transform = "translate3d(0,0,0)";
    if (joyFloating) {
      joyFloating = false;
      joy.style.left = "62px";
      joy.style.bottom = "22px";
      refreshJoyRect();
    }
    setHeld(KEYS.W, false); setHeld(KEYS.A, false); setHeld(KEYS.S, false); setHeld(KEYS.D, false);
  }
  function findTouch(list, id) { for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i]; return null; }
  joy.addEventListener("touchstart", function (e) {
    e.preventDefault(); e.stopPropagation();
    if (joyId !== null) return;
    refreshJoyRect();
    var t = e.changedTouches[0];
    joyId = t.identifier;
    joyMove(t);
  }, { passive: false });
  joy.addEventListener("touchmove", function (e) {
    e.preventDefault(); e.stopPropagation();
    var t = findTouch(e.changedTouches, joyId);
    if (t) joyMove(t);
  }, { passive: false });
  ["touchend", "touchcancel"].forEach(function (n) {
    joy.addEventListener(n, function (e) {
      e.preventDefault(); e.stopPropagation();
      if (findTouch(e.changedTouches, joyId)) joyEnd();
    }, { passive: false });
  });

  var pickupBtn = document.createElement("button");
  pickupBtn.type = "button";
  pickupBtn.className = "pickup-btn";
  pickupBtn.innerHTML = '<img src="icons/ui/pickup.png" alt="Pegar">';
  pickupBtn.title = "Pegar itens do ch\u00E3o (Z)";
  // Antes: comando Python + tecla Z ao mesmo tempo (coleta dupla). A tecla Z já chama
  // GameWindow.PickUpItem(), que usa a coleta inteligente do cliente.
  function doPickup(e) {
    e.preventDefault();
    e.stopPropagation();
    markInputActive();
    tapKey(KEYS.Z, 45);
  }
  pickupBtn.addEventListener("touchstart", doPickup, { passive: false });
  pickupBtn.addEventListener("click", doPickup);
  root.appendChild(pickupBtn);

  // =========================================================================
  // 5. BOTTOM-CENTER OLD2 CHAT HISTORY BOX (320x68px, auto-fading) + CHAT INPUT BAR (320px)
  // =========================================================================
  var chatLog = document.createElement("div");
  chatLog.className = "chat-log faded";
  chatLog.style.display = "none";
  ["touchstart", "touchmove", "touchend", "mousedown", "mouseup", "click"].forEach(function (evName) {
    chatLog.addEventListener(evName, function (e) {
      e.stopPropagation();
      wakeChatLog();
    }, { passive: true });
  });
  root.appendChild(chatLog);

  var lastChatSig = "";
  var chatHasMessages = false;
  var chatFadeTimer = null;

  // Chat do jogo (nativo): mostra TODAS as mensagens (gritos e conversas de outros
  // jogadores, bandeiras do reino), igual ao PC. O chat simples do overlay só via as
  // mensagens que passavam pelo Python. Preferência: m2o.nativeChat (padrão: ligado).
  function nativeChatOn() { try { return localStorage.getItem("m2o.nativeChat") !== "0"; } catch (e) { return true; } }
  function setNativeChatEditBoard(editing) {
    if (!inWorld || !nativeChatOn()) return;
    runPy(safePy([
      "import chat",
      "_wc = getattr(getattr(self, 'interface', None), 'wndChat', None)",
      "if _wc is not None and hasattr(_wc, '_m2oSetEdit'):",
      "    _wc._m2oSetEdit(" + (editing ? "True" : "False") + ")"
    ]));
  }
  function applyNativeChat() {
    if (!inWorld) return;
    var on = nativeChatOn();
    var barTopL = 0, barLeftL = 0, barWL = 0;
    try {
      var cbr = chatBar.getBoundingClientRect();
      barTopL = Math.round(cssToLogicalY(cbr.top));
      barLeftL = Math.max(4, Math.round(cssToLogicalX(cbr.left)));
      barWL = Math.max(160, Math.round(cssToLogicalX(cbr.right)) - barLeftL);
    } catch (e) { }
    runPy(safePy([
      "import constInfo, wndMgr, systemSetting, ui, chat, app",
      "constInfo._mob_show_pc_chat = " + (on ? "True" : "False"),
      "_wc = getattr(getattr(self, 'interface', None), 'wndChat', None)",
      "if _wc is not None:",
      "    if " + (on ? "True" : "False") + ":",
      "        if not hasattr(_wc, '_m2oOrigHide'):",
      "            _wc._m2oOrigHide = _wc.Hide",
      "            _wc.Hide = (lambda *a, **k: None)",
      "        if not hasattr(_wc, '_m2oOrigOpenChat'):",
      "            _wc._m2oOrigOpenChat = _wc.OpenChat",
      "            def _m2oSetEdit(_ed, _w=_wc):",
      "                import app as _app",
      "                _w._m2oEditing = bool(_ed)",
      "                if not _ed:",
      "                    _w._chatShowUntil = _app.GetTime() + 2.2",
      "                _w.chatInputSet.Close()",
      "                _w.btnSendWhisper.Hide()",
      "                _w.btnChatLog.Hide()",
      "                _w.btnChatSizing.Hide()",
      "                _w.Refresh()",
      "            _wc._m2oSetEdit = _m2oSetEdit",
      "            def _m2oOpenChat(_w=_wc):",
      "                _w._m2oSetEdit(True)",
      "                try:",
      "                    open('/m2w_focus_chat', 'w').close()",
      "                except Exception:",
      "                    pass",
      "            _wc.OpenChat = _m2oOpenChat",
      "        try:",
      "            systemSetting.SetViewChatFlag(1)",
      "        except Exception:",
      "            pass",
      "        _sw = wndMgr.GetScreenWidth()",
      "        _sh = wndMgr.GetScreenHeight()",
      "        _eh = int(getattr(_wc, 'EDIT_LINE_HEIGHT', 25))",
      "        _cw = " + (barWL > 80 ? barWL : 0) + " or int(getattr(_wc, 'CHAT_WINDOW_WIDTH', 320))",
      "        _wc.CHAT_WINDOW_WIDTH = _cw",
      "        _top = " + (barTopL || 0) + " or (_sh - 28)",
      "        _left = " + (barWL > 80 ? barLeftL : -1),
      "        if _left < 0:",
      "            _left = max(0, (_sw - _cw) // 2)",
      "        _wc.SetPosition(_left, _top - _eh)",
      "        ui.Window.Show(_wc)",
      "        _wc.CloseChat()",
      "    else:",
      "        if hasattr(_wc, '_m2oOrigHide'):",
      "            _wc.Hide = _wc._m2oOrigHide",
      "            del _wc._m2oOrigHide",
      "        if hasattr(_wc, '_m2oOrigOpenChat'):",
      "            _wc.OpenChat = _wc._m2oOrigOpenChat",
      "            del _wc._m2oOrigOpenChat",
      "        _wc.Hide()"
    ]));
    updateChatLogVisibility();
  }
  window.addEventListener("resize", function () {
    setTimeout(function () { if (inWorld && nativeChatOn()) applyNativeChat(); }, 500);
  });
  function updateChatLogVisibility() {
    var want = (inWorld && chatHasMessages && !nativeChatOn()) ? "block" : "none";
    if (chatLog.style.display !== want) {
      chatLog.style.display = want;
    }
  }

  function wakeChatLog(interactive) {
    if (interactive) {
      chatLog.classList.add("interactive");
    }
    if (!chatHasMessages) return;
    updateChatLogVisibility();
    chatLog.classList.remove("faded");
    if (chatFadeTimer) clearTimeout(chatFadeTimer);
    chatFadeTimer = setTimeout(function () {
      if (document.activeElement === chatInp) {
        wakeChatLog(true);
        return;
      }
      chatLog.classList.remove("interactive");
      chatLog.classList.add("faded");
    }, 8000);
  }

  // Mensagens geradas pelo motor (em polonês) que aparecem no chat do celular.
  var CHAT_PREFIX_PT = [
    ["Otrzyma\u0142e\u015B:", "Voc\u00EA recebeu:"],
    ["[Gildia]", "[Guilda]"],
    ["[Grupa]", "[Grupo]"],
    ["[PW]", "[PM]"],
    ["Mistrz Gry", "Mestre do Jogo"]
  ];
  function trChatText(txt) {
    txt = String(txt || "");
    for (var i = 0; i < CHAT_PREFIX_PT.length; i++) {
      if (txt.indexOf(CHAT_PREFIX_PT[i][0]) >= 0) txt = txt.split(CHAT_PREFIX_PT[i][0]).join(CHAT_PREFIX_PT[i][1]);
    }
    return txt;
  }

  function chatColorClass(item) {
    var t = item && typeof item.type === "number" ? item.type : 0;
    var txt = String((item && item.text) || "");
    if (t === 7 || t === 6 || txt.indexOf("[PW]") >= 0 || txt.indexOf("Mistrz Gry") >= 0 || txt.indexOf("[PM]") >= 0) return "c-whisper";
    if (t === 1 || t === 2 || t === 8 || t === 10 || t === 11 || txt.indexOf("Przemiana") === 0 || txt.indexOf("Possuir") === 0 ||
        txt.indexOf("Otrzyma\u0142e\u015B:") === 0 || txt.indexOf("Voc\u00EA recebeu:") === 0) return "c-notice";
    if (t === 3 || t === 4 || txt.indexOf("[Gildia]") === 0 || txt.indexOf("[Grupa]") === 0 ||
        txt.indexOf("[Guilda]") === 0 || txt.indexOf("[Grupo]") === 0) return "c-guild";
    return "";
  }
  function renderChatLines(lines) {
    if (!Array.isArray(lines)) return;
    var valid = [];
    for (var j = 0; j < lines.length; j++) {
      if (lines[j] && lines[j].text) valid.push(lines[j]);
    }
    chatHasMessages = valid.length > 0;
    var sig = JSON.stringify(valid);
    if (sig === lastChatSig) {
      updateChatLogVisibility();
      return;
    }
    lastChatSig = sig;
    chatLog.innerHTML = "";
    for (var i = 0; i < valid.length; i++) {
      var item = valid[i];
      var row = document.createElement("div");
      var cls = chatColorClass(item);
      row.className = "chat-line" + (cls ? " " + cls : "");
      row.textContent = trChatText(item.text);
      chatLog.appendChild(row);
    }
    updateChatLogVisibility();
    if (chatHasMessages) {
      wakeChatLog(false);
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  }

  var chatBar = document.createElement("div");
  chatBar.className = "chat-bar";
  ["touchstart", "mousedown", "click"].forEach(function (evName) {
    chatBar.addEventListener(evName, function () { wakeChatLog(true); }, { passive: true });
  });
  var chatTag = document.createElement("span");
  chatTag.className = "chat-tag";
  chatTag.textContent = "Geral";
  // Tipo de chat (toque na etiqueta para trocar). O prefixo vai na frente da
  // mensagem, como no PC: # grupo, % guilda, ! gritar, @ comércio.
  var CHAT_MODES = [
    { name: "Geral", prefix: "", color: "#d8dde3" },
    { name: "Grupo", prefix: "#", color: "#9fe0ff" },
    { name: "Guilda", prefix: "%", color: "#c8f5a0" },
    { name: "Gritar", prefix: "!", color: "#ffb36b" },
    { name: "Com\u00E9rcio", prefix: "@", color: "#ffe680" }
  ];
  var chatModeIdx = 0;
  try { chatModeIdx = Math.max(0, Math.min(CHAT_MODES.length - 1, parseInt(localStorage.getItem("m2o.chatMode") || "0", 10) || 0)); } catch (e) { }
  function renderChatMode() {
    var m = CHAT_MODES[chatModeIdx];
    chatTag.textContent = m.name;
    chatTag.style.color = m.color;
  }
  renderChatMode();
  function cycleChatMode(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    chatModeIdx = (chatModeIdx + 1) % CHAT_MODES.length;
    try { localStorage.setItem("m2o.chatMode", String(chatModeIdx)); } catch (e2) { }
    renderChatMode();
  }
  chatTag.style.cursor = "pointer";
  chatTag.style.pointerEvents = "auto";
  chatTag.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true });
  chatTag.addEventListener("click", cycleChatMode);
  var chatInp = document.createElement("input");
  chatInp.type = "text";
  chatInp.className = "chat-inp";
  chatInp.placeholder = isTouchDevice ? (M2I18N.lang === "pl" ? "Czat..." : (M2I18N.lang === "en" ? "Chat..." : "Conversar...")) : (M2I18N.lang === "pl" ? "Czat... (lub /komenda)" : (M2I18N.lang === "en" ? "Chat... (or /command)" : "Conversar... (ou /comando)"));
  chatInp.autocomplete = "off";
  chatInp.autocorrect = "off";
  chatInp.autocapitalize = "off";
  chatInp.spellcheck = false;

  var sentChatHistory = [];
  var sentChatHistIdx = 0;

  chatInp.addEventListener("focus", function () {
    try {
      if (window.m2w && window.m2w.dik) window.m2w.dik.fill(0);
      if (window.m2w_keys) window.m2w_keys.fill(0);
    } catch (e) { }
    chatBar.classList.add("typing");
    wakeChatLog(true);
    setNativeChatEditBoard(true);
    if (isTouchDevice && kbPref() !== "native") {
      try { chatInp.blur(); } catch (e) { }
      showGameKb(null, chatInp);
    }
  });
  function applyChatKbMode() {
    var game = isTouchDevice && kbPref() !== "native";
    chatInp.readOnly = game;
    chatInp.inputMode = game ? "none" : "text";
  }
  applyChatKbMode();
  chatInp.addEventListener("blur", function () {
    if (gameKbOpen() && kbTargetEl === chatInp) return;
    chatBar.classList.remove("typing");
    chatLog.classList.remove("interactive");
    setNativeChatEditBoard(false);
  });
  ["touchstart", "touchend", "mousedown", "mouseup", "click", "keydown", "keyup", "keypress"].forEach(function (evName) {
    chatInp.addEventListener(evName, function (e) {
      e.stopPropagation();
      wakeChatLog(true);
      if (evName === "keydown") {
        if (e.key === "Enter" || e.keyCode === 13) {
          e.preventDefault();
          sendChatInput();
        } else if (e.key === "Escape" || e.keyCode === 27) {
          e.preventDefault();
          chatInp.value = "";
          chatInp.blur();
          setNativeChatEditBoard(false);
        } else if (e.key === "Tab" || e.keyCode === 9) {
          e.preventDefault();
          cycleChatMode();
        } else if (e.key === "ArrowUp" || e.keyCode === 38) {
          if (sentChatHistory.length > 0 && sentChatHistIdx < sentChatHistory.length) {
            e.preventDefault();
            sentChatHistIdx++;
            chatInp.value = sentChatHistory[sentChatHistory.length - sentChatHistIdx];
          }
        } else if (e.key === "ArrowDown" || e.keyCode === 40) {
          e.preventDefault();
          if (sentChatHistIdx > 1) {
            sentChatHistIdx--;
            chatInp.value = sentChatHistory[sentChatHistory.length - sentChatHistIdx];
          } else {
            sentChatHistIdx = 0;
            chatInp.value = "";
          }
        }
      }
    });
  });

  // On PC (or physical keyboard): pressing Enter in-world opens/focuses chatInp directly
  window.addEventListener("keydown", function (e) {
    if (!inWorld) return;
    if (e.key === "Enter" || e.keyCode === 13) {
      var ae = document.activeElement;
      if (ae === chatInp || ae === hiddenIme || (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA"))) return;
      if (editActive || fsExists("/m2w_edit.json") || gameKbOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      chatInp.readOnly = false;
      try { chatInp.focus(); } catch (err) { }
    }
  }, true);

  function sendChatInput() {
    var val = (chatInp.value || "").trim();
    sentChatHistIdx = 0;
    if (!val) { chatInp.blur(); setNativeChatEditBoard(false); return; }
    if (!sentChatHistory.length || sentChatHistory[sentChatHistory.length - 1] !== val) {
      sentChatHistory.push(val);
      if (sentChatHistory.length > 32) sentChatHistory.shift();
    }
    // Aplica o tipo de chat escolhido (se a mensagem já não tiver um prefixo).
    var cm = CHAT_MODES[chatModeIdx];
    if (cm && cm.prefix && "/#%!@".indexOf(val.charAt(0)) < 0 && val.indexOf("py:") !== 0) val = cm.prefix + val;
    if (val.indexOf("py:") === 0) {
      runPy(val.slice(3));
    } else {
      var esc = JSON.stringify(val);
      runPy(
        "import net, chat, player, textTail\n" +
        "_t = " + esc + "\n" +
        "if _t.startswith('/'):\n" +
        "    net.SendChatPacket(_t)\n" +
        "elif _t.startswith('!'):\n" +
        "    if len(_t) > 1:\n" +
        "        net.SendChatPacket(_t[1:], chat.CHAT_TYPE_SHOUT)\n" +
        "elif _t.startswith('%'):\n" +
        "    if len(_t) > 1:\n" +
        "        net.SendChatPacket(_t[1:], chat.CHAT_TYPE_GUILD)\n" +
        "elif _t.startswith('#'):\n" +
        "    if len(_t) > 1:\n" +
        "        net.SendChatPacket(_t[1:], chat.CHAT_TYPE_PARTY)\n" +
        "elif _t.startswith('@') and hasattr(chat, 'CHAT_TYPE_TRADE'):\n" +
        "    if len(_t) > 1:\n" +
        "        net.SendChatPacket(_t[1:], chat.CHAT_TYPE_TRADE)\n" +
        "else:\n" +
        "    net.SendChatPacket(_t, chat.CHAT_TYPE_TALKING)\n" +
        "    try:\n" +
        "        textTail.RegisterChatTail(player.GetMainCharacterIndex(), _t)\n" +
        "    except Exception:\n" +
        "        pass\n"
      );
    }
    chatInp.value = "";
    chatBar.classList.remove("typing");
    setNativeChatEditBoard(false);
    chatInp.blur();
    wakeChatLog(false);
  }

  var chatSend = document.createElement("button");
  chatSend.type = "button";
  chatSend.className = "chat-send";
  chatSend.textContent = "\u27A4";
  chatSend.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    sendChatInput();
  });

  // Histórico do chat: abre a janela de registro do próprio jogo (com abas Normal,
  // Grupo, Guilda, Gritar, Info...). Tocar de novo fecha.
  var chatLogBtn = document.createElement("button");
  chatLogBtn.type = "button";
  chatLogBtn.className = "chat-histbtn";
  chatLogBtn.title = "Hist\u00F3rico do chat";
  chatLogBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" style="display:block;pointer-events:none"><g fill="none" stroke="#e6d5a8" stroke-width="2" stroke-linecap="round"><path d="M5 4h11l3 3v13H5z"/><path d="M8 9h8M8 13h8M8 17h5"/></g></svg>';
  // styled via #m2o .chat-histbtn
  chatLogBtn.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true });
  chatLogBtn.addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation();
    toggleChatHistory();
  });
  chatBar.appendChild(chatLogBtn);
  // Mensagens privadas (sussurros): em vez dos envelopes que o jogo espalha pela tela
  // (um por pessoa, na coluna da direita), um botão só no chat. Pisca e mostra a
  // contagem quando chega mensagem nova; tocando abre a lista de conversas.
  var chatWhisperBtn = document.createElement("button");
  chatWhisperBtn.type = "button";
  chatWhisperBtn.className = "chat-histbtn wb-btn";
  chatWhisperBtn.title = "Mensagens";
  chatWhisperBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" style="display:block;pointer-events:none"><g fill="none" stroke="#e6d5a8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></g></svg><span class="wb-badge"></span>';
  chatWhisperBtn.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true });
  chatWhisperBtn.addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation();
    toggleWhisperPanel();
  });
  chatBar.appendChild(chatWhisperBtn);

  var whisperList = [];      // [{n: nome, u: não lidas, t: última mensagem}]
  var whisperPanel = null;
  var WB_PY = [
    "import json, constInfo, chat",
    "_itf = getattr(self, 'interface', None)",
    "if _itf is not None and not getattr(_itf, '_m2oWbPatched', False):",
    "    _itf._m2oWbPatched = True",
    "    _itf._m2oUnread = {}",
    "    def _m2oWbDump(_i=_itf):",
    "        _l = []",
    "        for _b in list(getattr(_i, 'whisperButtonList', [])):",
    "            _n = str(getattr(_b, 'name', '') or '')",
    "            _t = ''",
    "            try:",
    "                _w = _i._Interface__GetWhisper(_n)",
    "                if _w and _w.get('history'):",
    "                    _t = str(_w['history'][-1][1])",
    "            except Exception:",
    "                pass",
    "            _l.append({'n': _n, 'u': int(_i._m2oUnread.get(_n, 0)), 't': _t[-160:]})",
    "        try:",
    "            _f = open('/m2w_whisper.json', 'w')",
    "            _f.write(json.dumps(_l))",
    "            _f.close()",
    "        except Exception:",
    "            pass",
    "    _itf._m2oWbDump = _m2oWbDump",
    "    def _m2oWbHide(_i=_itf):",
    "        for _b in list(getattr(_i, 'whisperButtonList', [])):",
    "            try:",
    "                _b.Hide()",
    "            except Exception:",
    "                pass",
    "    _oArr = _itf._Interface__ArrangeWhisperButton",
    "    def _arr(_o=_oArr, _i=_itf):",
    "        _o()",
    "        _m2oWbHide(_i)",
    "        _i._m2oWbDump()",
    "    _itf._Interface__ArrangeWhisperButton = _arr",
    "    _itf.ShowAllWhisperButton = lambda _i=_itf: _m2oWbHide(_i)",
    "    _oRecv = _itf.RecvWhisper",
    "    def _recv(name, mode=chat.WHISPER_TYPE_NORMAL, _o=_oRecv, _i=_itf):",
    "        _r = _o(name, mode)",
    "        try:",
    "            _w = _i._Interface__GetWhisper(name)",
    "            _d = _w.get('dialog') if _w else None",
    "            if not (_d and _d.IsShow()):",
    "                _i._m2oUnread[name] = _i._m2oUnread.get(name, 0) + 1",
    "        except Exception:",
    "            pass",
    "        _m2oWbHide(_i)",
    "        return _r",
    "    _itf.RecvWhisper = _recv",
    "    _oPush = _itf.PushWhisperMessageStack",
    "    def _push(name, mode, text, _o=_oPush, _i=_itf):",
    "        _r = _o(name, mode, text)",
    "        _i._m2oWbDump()",
    "        return _r",
    "    _itf.PushWhisperMessageStack = _push",
    "    _oOpen = _itf.OpenWhisperDialog",
    "    def _open(name, targetEmpire=0, _o=_oOpen, _i=_itf):",
    "        _i._m2oUnread.pop(name, None)",
    "        _r = _o(name, targetEmpire)",
    "        _i._m2oWbDump()",
    "        return _r",
    "    _itf.OpenWhisperDialog = _open",
    "    _oClose = _itf.CloseWhisperDialog",
    "    def _close(name, destroy_data=True, _o=_oClose, _i=_itf):",
    "        _r = _o(name, destroy_data)",
    "        if destroy_data:",
    "            _i._m2oUnread.pop(name, None)",
    "        _i._m2oWbDump()",
    "        return _r",
    "    _itf.CloseWhisperDialog = _close",
    "    _m2oWbHide(_itf)",
    "    _itf._m2oWbDump()"
  ];
  // Inventário do companheiro no celular: o jogo abre a versão de PC (alta, 590 px,
  // equipamento em cima e bolsa embaixo) e ela corta na tela. Igual ao inventário do
  // personagem no celular: equipamento à esquerda, bolsa à direita (380 x 388).
  var SIDEKICK_MOBILE_BUILD = "def _m2oMobileBuild(self):\n    LEFT = 8\n    COLW = DS_SLOTS * CELL\n    y = 32\n    self.equipmentBase = self._Image(self, LEFT + (COLW - EQUIPMENT_BASE_WIDTH) // 2, y, EQUIPMENT_BASE_IMAGE)\n    equip = ui.SlotWindow()\n    equip.SetParent(self.equipmentBase)\n    equip.SetPosition(3, 3)\n    equip.SetSize(150, 182)\n    for wear, x, slotY, width, height in EQUIPMENT_LAYOUT:\n        equip.AppendSlot(WearPos(wear), x, slotY, width, height)\n    equip.SetSelectEmptySlotEvent(ui.__mem_func__(self.OnSelectEmptyEquip))\n    equip.SetSelectItemSlotEvent(ui.__mem_func__(self.OnSelectItemEquip))\n    equip.SetUnselectItemSlotEvent(ui.__mem_func__(self.OnRightClickEquip))\n    equip.SetUseSlotEvent(ui.__mem_func__(self.OnUseEquip))\n    equip.SetOverInItemEvent(ui.__mem_func__(self.OnOverInEquip))\n    equip.SetOverOutItemEvent(ui.__mem_func__(self.OnOverOut))\n    equip.Show()\n    self.widgets.append(equip)\n    self.equipSlots = equip\n    by = y + EQUIPMENT_BASE_HEIGHT + 4\n    bx = LEFT + (COLW - 182) // 2\n    self.bagMode = self._Btn(self, 'small', bx, by, TEXT_BAG, self.ShowBag)\n    self.dsMode = self._Btn(self, 'small', bx + 46, by, TEXT_ALCHEMY, self.ShowAlchemy)\n    self.dsBoard = ui.Window()\n    self.dsBoard.SetParent(self)\n    self.dsBoard.SetPosition(LEFT, 32)\n    self.dsBoard.SetSize(COLW, DS_BOARD_HEIGHT)\n    self.widgets.append(self.dsBoard)\n    self.dsSlots = ui.SlotWindow()\n    self.dsSlots.SetParent(self.dsBoard)\n    self.dsSlots.SetPosition(0, 0)\n    self.dsSlots.SetSize(DS_SLOTS * CELL, DS_BOARD_HEIGHT)\n    for deck in range(DS_DECKS):\n        self._Label(self.dsBoard, 4, 2 + deck * 78, TEXT_DS_DECK % (deck + 1))\n        for kind in range(DS_SLOTS):\n            self.dsSlots.AppendSlot(WearPos(WEAR_MAX + deck * DS_SLOTS + kind), kind * CELL, 22 + deck * 78, CELL, CELL)\n    self.dsSlots.SetSlotBaseImage(SLOT_BASE_IMAGE, 1.0, 1.0, 1.0, 1.0)\n    self.dsSlots.SetSelectEmptySlotEvent(ui.__mem_func__(self.OnSelectEmptyEquip))\n    self.dsSlots.SetSelectItemSlotEvent(ui.__mem_func__(self.OnSelectItemEquip))\n    self.dsSlots.SetUnselectItemSlotEvent(ui.__mem_func__(self.OnRightClickEquip))\n    self.dsSlots.SetUseSlotEvent(ui.__mem_func__(self.OnUseEquip))\n    self.dsSlots.SetOverInItemEvent(ui.__mem_func__(self.OnOverInEquip))\n    self.dsSlots.SetOverOutItemEvent(ui.__mem_func__(self.OnOverOut))\n    self.dsSlots.Show()\n    self.widgets.append(self.dsSlots)\n    self.dsBoard.Hide()\n    self.unpinButton = self._Btn(self, 'small', bx + 92, by, TEXT_UNPIN, self.OnUnpinButton)\n    self.destroyButton = self._Btn(self, 'small', bx + 138, by, TEXT_DESTROY, self.OnDestroyButton)\n    gridX = LEFT + COLW + 10\n    ty = 34\n    self.tabs = []\n    for i in range(MAX_PAGES):\n        tab = ui.RadioButton()\n        tab.SetParent(self)\n        tab.SetPosition(gridX + 4 + i * TAB_STEP, ty)\n        tab.SetUpVisual(TAB_IMAGE % 1)\n        tab.SetOverVisual(TAB_IMAGE % 2)\n        tab.SetDownVisual(TAB_IMAGE % 3)\n        tab.SetText(PAGE_NAMES[i])\n        tab.SAFE_SetEvent(self.SetPage, i)\n        tab.Show()\n        self.widgets.append(tab)\n        self.tabs.append(tab)\n    self.dsPrev = self._Btn(self, 'small', gridX, ty, '<', self.PreviousDsPage)\n    self.dsNext = self._Btn(self, 'small', gridX + 116, ty, '>', self.NextDsPage)\n    self.dsPageLine = self._Label(self, gridX + 56, ty + 2, '')\n    gy = ty + TAB_HEIGHT + 3\n    grid = ui.GridSlotWindow()\n    grid.SetParent(self)\n    grid.SetPosition(gridX, gy)\n    grid.ArrangeSlot(0, GRID_COLUMNS, GRID_ROWS, CELL, CELL, 0, 0)\n    grid.SetSlotBaseImage(SLOT_BASE_IMAGE, 1.0, 1.0, 1.0, 1.0)\n    grid.SetSelectEmptySlotEvent(ui.__mem_func__(self.OnSelectEmptyBag))\n    grid.SetSelectItemSlotEvent(ui.__mem_func__(self.OnSelectItemBag))\n    grid.SetUnselectItemSlotEvent(ui.__mem_func__(self.OnRightClickBag))\n    grid.SetUseSlotEvent(ui.__mem_func__(self.OnUseBag))\n    grid.SetOverInItemEvent(ui.__mem_func__(self.OnOverInBag))\n    grid.SetOverOutItemEvent(ui.__mem_func__(self.OnOverOut))\n    grid.Show()\n    self.widgets.append(grid)\n    self.bagSlots = grid\n    my = by + 30\n    self._Image(self, LEFT + 4, my + 1, MONEY_ICON_IMAGE)\n    self.goldLine = self._Label(self, LEFT + 24, my, '')\n    self.giveYangButton = self._Btn(self, 'small', bx + 92, my + 20, TEXT_GIVE_YANG, self.OnGiveYang)\n    self.takeYangButton = self._Btn(self, 'small', bx + 138, my + 20, TEXT_TAKE_YANG, self.OnTakeYang)\n    self._StatusLines(gy + GRID_ROWS * CELL + 6)\n    tooltip = uiToolTip.ItemToolTip()\n    if hasattr(tooltip, 'SetCannotUseItemForceSetDisableColor'):\n        tooltip.SetCannotUseItemForceSetDisableColor(False)\n    tooltip.HideToolTip()\n    self.tooltip = tooltip\n";
  function installSidekickLayout() {
    if (!inWorld || !isMobile) return;
    runPy(safePy([
      "import os, sys",
      "if os.path.exists('/mobile.flag'):",
      "    try:",
      "        import uisidekickinventory as _sk",
      "    except Exception:",
      "        _sk = None",
      "    if _sk is not None and not getattr(_sk, '_m2oMobileLayout', False):",
      "        exec(" + JSON.stringify(SIDEKICK_MOBILE_BUILD) + ", _sk.__dict__)",
      "        _sk.EquipmentWindow.WIDTH = 380",
      "        _sk.EquipmentWindow.HEIGHT = 388",
      "        _sk.EquipmentWindow.Build = _sk._m2oMobileBuild",
      "        _sk._m2oMobileLayout = True",
      "        _w = _sk._state.get('eqWindow')",
      "        if _w is not None and not _w.IsShow():",
      "            try:",
      "                _w.Destroy()",
      "            except Exception:",
      "                pass",
      "            _sk._state['eqWindow'] = None"
    ]));
  }
  function installWhisperPatch() { if (inWorld) runPy(safePy(WB_PY)); }
  function whisperUnread() {
    var n = 0;
    whisperList.forEach(function (w) { n += (Number(w.u) || 0); });
    return n;
  }
  function renderWhisperBadge() {
    var n = whisperUnread();
    var b = chatWhisperBtn.querySelector(".wb-badge");
    if (b) { b.textContent = n > 99 ? "99+" : String(n); b.classList.toggle("on", n > 0); }
    chatWhisperBtn.classList.toggle("wb-new", n > 0);
  }
  function openWhisperWith(name) {
    runPy(safePy([
      "_itf = getattr(self, 'interface', None)",
      "if _itf is not None:",
      "    _itf.OpenWhisperDialog(" + JSON.stringify(String(name)) + ")"
    ]));
    if (whisperPanel) { whisperPanel.remove(); whisperPanel = null; }
  }
  function renderWhisperPanel() {
    renderWhisperBadge();
    if (!whisperPanel) return;
    var listEl = whisperPanel.querySelector(".q-list");
    listEl.innerHTML = "";
    var nb = btn("", function () {
      if (whisperPanel) { whisperPanel.remove(); whisperPanel = null; }
      runPy(safePy([
        "if hasattr(self, 'interface') and self.interface and hasattr(self.interface, 'OpenWhisperDialogWithoutTarget'):",
        "    self.interface.OpenWhisperDialogWithoutTarget()"
      ]));
    });
    nb.className = "q-item";
    nb.innerHTML = '<span>✎ ' + trS("Nova mensagem") + '</span>';
    listEl.appendChild(nb);
    if (!whisperList.length) {
      var em = document.createElement("div");
      em.className = "q-empty";
      em.textContent = trS("Nenhuma conversa no momento.");
      listEl.appendChild(em);
      return;
    }
    whisperList.forEach(function (w) {
      var b = btn("", function () { openWhisperWith(w.n); });
      b.className = "q-item wb-item" + (w.u ? " unread" : "");
      b.innerHTML = '<div class="wb-top"><span class="wb-name"></span>' + (w.u ? '<span class="wb-cnt">' + w.u + '</span>' : '') + '</div><div class="wb-prev"></div>';
      b.querySelector(".wb-name").textContent = questText(w.n);
      b.querySelector(".wb-prev").textContent = questText(w.t);
      listEl.appendChild(b);
    });
  }
  function toggleWhisperPanel() {
    if (whisperPanel) { whisperPanel.remove(); whisperPanel = null; return; }
    whisperPanel = document.createElement("div");
    whisperPanel.className = "q-panel wb-panel gold-box";
    whisperPanel.innerHTML = '<div class="q-head"><span></span></div><div class="q-list"></div>';
    whisperPanel.querySelector(".q-head span").textContent = trS("Mensagens");
    var x = btn("X", function () { toggleWhisperPanel(); });
    x.className = "q-close";
    whisperPanel.querySelector(".q-head").appendChild(x);
    root.appendChild(whisperPanel);
    renderWhisperPanel();
    installWhisperPatch();
  }
  setInterval(function () {
    try {
      if (!window.Module || !Module.FS) return;
      if (fsExists("/m2w_whisper.json")) {
        var wl = JSON.parse(Module.FS.readFile("/m2w_whisper.json", { encoding: "utf8" }));
        fsRm("/m2w_whisper.json");
        if (Array.isArray(wl)) { whisperList = wl; renderWhisperPanel(); }
      }
    } catch (e) { }
  }, 300);
  // Instala (uma vez por entrada no mapa) e confere de tempos em tempos.
  setInterval(function () {
    try { if (inWorld && !fsExists("/m2w_cmd.py")) { installWhisperPatch(); installSidekickLayout(); } } catch (e) { }
  }, 10000);
  // Painel do histórico: largura da barra de chat (mín. 450 do jogo), do topo da tela
  // até logo acima da barra. Fecha no botão, no X da janela ou tocando fora dela.
  var chatHistRect = null;   // retângulo em px CSS, para fechar ao tocar fora
  function toggleChatHistory(forceClose) {
    var br = chatBar.getBoundingClientRect();
    var lx0 = cssToLogicalX(br.left), lx1 = cssToLogicalX(br.right);
    var ltop = cssToLogicalY(br.top);
    var W = Math.max(450, lx1 - lx0);
    var H = Math.min(230, Math.max(150, Math.round(ltop * 0.46)));
    var y0 = Math.max(8, ltop - H - 3);
    var cx = Math.round((lx0 + lx1) / 2);
    chatHistRect = { left: br.left - 20, right: br.right + 20, top: Math.max(0, br.top - (H * (br.height / 25))), bottom: br.top };
    runPy(safePy([
      "import wndMgr",
      "_w = self.interface.wndChatLog",
      "_wc = getattr(self.interface, 'wndChat', None)",
      "if _w.IsShow() or " + (forceClose ? "True" : "False") + ":",
      "    _w.Hide()",
      "    if _wc is not None:",
      "        _wc.CloseChat()",
      "else:",
      "    if _wc is not None:",
      "        _wc.CloseChat()",
      "        _wc.btnChatSizing.Hide()",
      "    _sw = wndMgr.GetScreenWidth()",
      "    _W = min(" + W + ", _sw)",
      "    _H = " + H,
      "    try:",
      "        _bw = _w.btnSizing.GetWidth()",
      "        _bh = _w.btnSizing.GetHeight()",
      "        _w.btnSizing.SetPosition(_W - _bw, _H - _bh)",
      "        _w.OnResize()",
      "        if hasattr(_w, 'chatInputSet') and _w.chatInputSet:",
      "            _w.chatInputSet.Close()",
      "    except Exception:",
      "        pass",
      "    _w.SetPosition(max(0, min(_sw - _W, " + cx + " - _W // 2)), " + y0 + ")",
      "    _w.Show()",
      "    _w.SetTop()"
    ]));
  }
  chatBar.appendChild(chatTag);
  chatBar.appendChild(chatInp);
  chatBar.appendChild(chatSend);
  root.appendChild(chatBar);

  // ------------------------------------------------------------------- Hidden Direct Mobile Keyboard Bridge (#m2o-hidden-ime)
  var hiddenIme = document.createElement("input");
  hiddenIme.id = "m2o-hidden-ime";
  hiddenIme.type = "text";
  hiddenIme.autocomplete = "off";
  hiddenIme.autocorrect = "off";
  hiddenIme.autocapitalize = "off";
  hiddenIme.spellcheck = false;
  hiddenIme.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1";
  document.body.appendChild(hiddenIme);

  var lastEditSeq = 0;
  var editActive = false;
  var tapPatchOk = false;
  var lastCanvasTapAt = 0;
  var keepKbUntil = 0;

  // ---------------------------------------------------------------------------
  // TECLADO VIRTUAL
  // BUGS ANTIGOS:
  //  1) Qualquer toque na tela de login abria o teclado: a cada toque o overlay lia
  //     /m2w_edit.json (que continua existindo enquanto o campo Usuário tem foco) e
  //     focava o input escondido. Agora o teclado só abre quando o toque caiu DENTRO
  //     de um campo de texto (marcamos isso no Python com "tap": true) ou quando o
  //     foco passa de um campo para outro com o teclado já aberto (Enter no usuário
  //     -> senha). Tocar fora do campo fecha o teclado.
  //  2) Apagar não funcionava: ao refocar, o input escondido era zerado com o texto
  //     ANTIGO do arquivo (gravado no momento do foco). Com o input vazio, o Android
  //     não gera evento ao apertar "apagar" e nada era apagado no jogo. Agora o texto
  //     só é ressincronizado quando o jogo informa um foco novo (com o texto atual) e,
  //     se mesmo assim o input estiver vazio, o "apagar" é repassado direto ao jogo.
  // ---------------------------------------------------------------------------
  // Toque curto num item = só mostrar o item (descrição); segurar ~0,45s = pegar/mover.
  // O jogo "pega" o item (mouseController.AttachObject) já no clique; marcamos o
  // clique curto com uma flag e o patch abaixo cancela esse AttachObject.
  var PEEK_PATCH_PY = [
    "import mouseModule",
    "_C = mouseModule.CMouseController",
    "if not getattr(_C, '_m2oPeekPatch', False):",
    "    _o = _C.AttachObject",
    "    def _m2oAttach(self, *a, _o=_o, **k):",
    "        import constInfo, app",
    "        try:",
    "            if getattr(constInfo, '_m2o_peek', 0) and app.GetTime() - getattr(constInfo, '_m2o_peek_t', -99.0) < 0.8:",
    "                constInfo._m2o_peek = 0",
    "                return",
    "        except Exception:",
    "            pass",
    "        return _o(self, *a, **k)",
    "    _C.AttachObject = _m2oAttach",
    "    _C._m2oPeekPatch = True",
    "open('/m2w_peek_ok', 'w').close()"
  ].join("\n");
  var peekPatchOk = false;

  // -------------------------------------------------------------------------
  // TELAS DE PERSONAGEM (seleção / criação) + DIÁLOGO DE NPC
  // Com a interface em 125%/150% a tela lógica fica mais baixa e os painéis do
  // jogo (posicionados para 600 px de altura) saíam cortados em baixo. Depois de
  // cada Open() reposicionamos: coluna da esquerda e painel da direita sobem até
  // caber, o logotipo da classe vai para o lado do painel, botões ficam dentro da tela.
  // No diálogo de NPC o fundo semitransparente vira um fundo escuro quase opaco.
  // -------------------------------------------------------------------------
  var UI_PATCH_PY = [
    "import constInfo",
    "def _m2oFit(win):",
    "    import wndMgr",
    "    d = getattr(win, 'dlgBoard', None)",
    "    if d is None:",
    "        return",
    "    ed = getattr(d, 'ElementDictionary', None) or {}",
    "    g = ed.get",
    "    if not hasattr(d, '_m2oOrig'):",
    "        d._m2oOrig = {}",
    "    def p0(n, w):",
    "        if n not in d._m2oOrig:",
    "            d._m2oOrig[n] = tuple(w.GetLocalPosition())",
    "        return d._m2oOrig[n]",
    "    sw = wndMgr.GetScreenWidth()",
    "    sh = wndMgr.GetScreenHeight()",
    "    M = 6",
    "    TOP = 24",
    "    delta = 0",
    "    cb = g('character_board')",
    "    s2 = g('select_thinboard2')",
    "    cbx = 0",
    "    cbr = 220",
    "    if cb is not None:",
    "        x, y = p0('character_board', cb)",
    "        bottom = y + cb.GetHeight()",
    "        if s2 is not None:",
    "            x2, y2 = p0('select_thinboard2', s2)",
    "            bottom = y2 + s2.GetHeight()",
    "        delta = max(0, min(bottom - (sh - M), y - TOP))",
    "        cb.SetPosition(x, y - delta)",
    "        if s2 is not None:",
    "            s2.SetPosition(x2, y2 - delta)",
    "        cbx = x",
    "        cbr = x + cb.GetWidth()",
    "    db = g('character_discriptionboard')",
    "    if db is not None:",
    "        x, y = p0('character_discriptionboard', db)",
    "        h = db.GetHeight()",
    "        ny = y",
    "        if y + h > sh - M:",
    "            ny = max(TOP, sh - M - h)",
    "        db.SetPosition(x, ny)",
    "    for n in ('name_warrior', 'name_assassin', 'name_sura', 'name_shaman', 'name_wolfman'):",
    "        w = g(n)",
    "        if w is None:",
    "            continue",
    "        x, y = p0(n, w)",
    "        ny = y - delta",
    "        if ny < 2:",
    "            w.SetPosition(cbr + 12, 6)",
    "        else:",
    "            w.SetPosition(x, ny)",
    "    w = g('desc_phase')",
    "    if w is not None:",
    "        x, y = p0('desc_phase', w)",
    "        w.SetPosition(x, max(0, y - delta))",
    "    for n in ('start_button', 'exit_button', 'create_button', 'cancel_button', 'textAlpha'):",
    "        w = g(n)",
    "        if w is None:",
    "            continue",
    "        x, y = p0(n, w)",
    "        h = w.GetHeight()",
    "        if y + h > sh - 2:",
    "            w.SetPosition(x, sh - 2 - h)",
    "constInfo._m2oFit = _m2oFit",
    "def _m2oWrapOpen(_cls):",
    "    if getattr(_cls, '_m2oFitPatch', False):",
    "        return",
    "    _o = _cls.Open",
    "    def _op(self, *a, _o=_o, **k):",
    "        r = _o(self, *a, **k)",
    "        try:",
    "            constInfo._m2oFit(self)",
    "        except Exception:",
    "            pass",
    "        return r",
    "    _cls.Open = _op",
    "    _cls._m2oFitPatch = True",
    "try:",
    "    import introSelect",
    "    _m2oWrapOpen(introSelect.SelectCharacterWindow)",
    "except Exception:",
    "    pass",
    "try:",
    "    import introCreate",
    "    _m2oWrapOpen(introCreate.CreateCharacterWindow)",
    "except Exception:",
    "    pass",
    "try:",
    "    import uiQuest, grp",
    "    _Q = uiQuest.QuestDialog",
    "    if not getattr(_Q, '_m2oDarkPatch', False):",
    "        _ol = _Q.LoadDialog",
    "        def _ld(self, *a, _ol=_ol, **k):",
    "            r = _ol(self, *a, **k)",
    "            try:",
    "                b = getattr(self, 'board', None)",
    "                if b is not None and hasattr(b, 'Base'):",
    "                    b.Base.SetColor(grp.GenerateColor(0.035, 0.03, 0.024, 0.94))",
    "            except Exception:",
    "                pass",
    "            return r",
    "        _Q.LoadDialog = _ld",
    "        _Q._m2oDarkPatch = True",
    "except Exception:",
    "    pass",
    "try:",
    "    import ui",
    "    if not getattr(ui.ScriptWindow, '_m2oChildShowPatch', False):",
    "        _os = ui.ScriptWindow.Show",
    "        def _sws(self, *a, _os=_os, **k):",
    "            try:",
    "                if tuple(self.GetGlobalPosition()) != tuple(self.GetLocalPosition()):",
    "                    return ui.Window.Show(self)",
    "            except Exception:",
    "                pass",
    "            return _os(self, *a, **k)",
    "        ui.ScriptWindow.Show = _sws",
    "        ui.ScriptWindow._m2oChildShowPatch = True",
    "except Exception:",
    "    pass",
    "def _m2oFitLogin(win):",
    "    import wndMgr",
    "    lb = getattr(win, 'loginBoard', None)",
    "    if lb is None:",
    "        return",
    "    cb = getattr(win, 'connectBoard', None)",
    "    cw = getattr(win, 'credentialsWindow', None)",
    "    try:",
    "        win.pwdEditLine._m2oSecret = True",
    "    except Exception:",
    "        pass",
    "    sw = wndMgr.GetScreenWidth()",
    "    sh = wndMgr.GetScreenHeight()",
    "    for _b in getattr(win, 'credentialsPageButtons', []) or []:",
    "        _b.Hide()",
    "    _lab = getattr(win, 'credentialsPageLabel', None)",
    "    if _lab is not None:",
    "        _lab.Hide()",
    "    _items = getattr(win, 'save_credential_items', []) or []",
    "    for _i, _it in enumerate(_items):",
    "        if _i >= 3:",
    "            _it.Hide()",
    "    _hc = 105 if _items else 0",
    "    if cw is not None:",
    "        cw.SetSize(208, 105)",
    "    _hb = cb.GetHeight() if cb is not None else 0",
    "    _total = _hb + 8 + lb.GetHeight() + 10 + _hc",
    "    _y = max(4, (sh - _total) // 2)",
    "    def _place(w, y):",
    "        w.SetWindowHorizontalAlignLeft()",
    "        w.SetWindowVerticalAlignTop()",
    "        w.SetPosition((sw - w.GetWidth()) // 2, y)",
    "    if cb is not None:",
    "        _place(cb, _y)",
    "        _y += _hb + 8",
    "    _place(lb, _y)",
    "    _y += lb.GetHeight() + 10",
    "    if cw is not None:",
    "        _place(cw, _y)",
    "constInfo._m2oFitLogin = _m2oFitLogin",
    "try:",
    "    import introLogin",
    "    _LC = introLogin.LoginWindow",
    "    if not getattr(_LC, '_m2oLoginPatch', False):",
    "        _olo = _LC.Open",
    "        def _lop(self, *a, _olo=_olo, **k):",
    "            r = _olo(self, *a, **k)",
    "            try:",
    "                constInfo._m2oFitLogin(self)",
    "            except Exception:",
    "                pass",
    "            return r",
    "        _LC.Open = _lop",
    "        _LC._m2oLoginPatch = True",
    "except Exception:",
    "    pass",
    "try:",
    "    import introCreate, os as _m2oOs",
    "    _CC = introCreate.CreateCharacterWindow",
    "    if not getattr(_CC, '_m2oCmdPatch', False):",
    "        _ocu = _CC.OnUpdate",
    "        def _ccu(self, *a, _ocu=_ocu, **k):",
    "            r = _ocu(self, *a, **k)",
    "            try:",
    "                if _m2oOs.path.exists('/m2w_cmd.py'):",
    "                    _jf = open('/m2w_cmd.py', 'r', encoding='utf-8', errors='replace')",
    "                    _js = _jf.read()",
    "                    _jf.close()",
    "                    _m2oOs.remove('/m2w_cmd.py')",
    "                    exec(_js, dict(globals(), self=self))",
    "            except Exception:",
    "                __import__('traceback').print_exc()",
    "            return r",
    "        _CC.OnUpdate = _ccu",
    "        _CC._m2oCmdPatch = True",
    "except Exception:",
    "    pass",
    "try:",
    "    import ui, uiMiniMap, miniMap, wndMgr as _wm",
    "    _AW = uiMiniMap.AtlasWindow",
    "    if not getattr(_AW, '_m2oFitPatch', False):",
    "        _oaws = _AW.Show",
    "        def _aws(self, *a, _oaws=_oaws, **k):",
    "            r = _oaws(self, *a, **k)",
    "            if not self.IsShow():",
    "                return r",
    "            try:",
    "                _sw = _wm.GetScreenWidth()",
    "                _sh = _wm.GetScreenHeight()",
    "                self.SetMapScale(1)",
    "                (_n, _ax, _ay) = miniMap.GetAtlasSize()",
    "                _s = min(1.0, float(_sh - 46) / float(_ay + 38), float(_sw - 20) / float(_ax + 15))",
    "                if _s < 1.0:",
    "                    self.SetMapScale(max(0.3, _s))",
    "                try:",
    "                    self._AtlasWindow__RefreshScaleButton()",
    "                except Exception:",
    "                    pass",
    "                _w = self.GetWidth()",
    "                _h = self.GetHeight()",
    "                self.SetPosition(max(0, (_sw - _w) // 2), max(0, (_sh - _h) // 2))",
    "                self.SetMapScale(self.scale)",
    "            except Exception:",
    "                pass",
    "            return r",
    "        _AW.Show = _aws",
    "        _AW._m2oFitPatch = True",
    "except Exception:",
    "    pass",
    "try:",
    "    import game, os as _m2oOs2",
    "    _GW = game.GameWindow",
    "    if not getattr(_GW, '_m2oClosePatch', False):",
    "        _ogc = _GW.Close",
    "        def _gwc(self, *a, _ogc=_ogc, **k):",
    "            try:",
    "                if _m2oOs2.path.exists('/m2w_hud.json'):",
    "                    _m2oOs2.remove('/m2w_hud.json')",
    "                open('/m2w_left_game', 'w').close()",
    "            except Exception:",
    "                pass",
    "            return _ogc(self, *a, **k)",
    "        _GW.Close = _gwc",
    "        _GW._m2oClosePatch = True",
    "except Exception:",
    "    pass",
    "if type(self).__name__ == 'LoginWindow':",
    "    try:",
    "        constInfo._m2oFitLogin(self)",
    "    except Exception:",
    "        pass",
    "if type(self).__name__ == 'SelectCharacterWindow':",
    "    try:",
    "        constInfo._m2oFit(self)",
    "    except Exception:",
    "        pass",
    "open('/m2w_ui_ok', 'w').close()"
  ].join("\n");
  var uiPatchOk = false;
  setInterval(function () {
    if (uiPatchOk) return;
    try {
      if (!window.Module || !Module.FS) return;
      if (fsExists("/m2w_ui_ok")) { uiPatchOk = true; return; }
      if (!fsExists("/m2w_cmd.py")) runPy(UI_PATCH_PY);
    } catch (e) { }
  }, 1700);
  setInterval(function () {
    if (peekPatchOk) return;
    try {
      if (!window.Module || !Module.FS) return;
      if (fsExists("/m2w_peek_ok")) { peekPatchOk = true; return; }
      if (!fsExists("/m2w_cmd.py")) runPy(PEEK_PATCH_PY);
    } catch (e) { }
  }, 1500);
  // Executa um comando Python e só chama `cb` depois que o jogo o consumiu.
  function runPyThen(code, cb, maxMs) {
    runPy(code);
    var t0 = Date.now();
    (function wait() {
      if (!fsExists("/m2w_cmd.py") || Date.now() - t0 > (maxMs || 300)) { cb(); return; }
      setTimeout(wait, 16);
    })();
  }
  function peekPy(on) {
    return "import constInfo, app\nconstInfo._m2o_peek = " + (on ? 1 : 0) + "\nconstInfo._m2o_peek_t = app.GetTime()";
  }

  var EDIT_TAP_PATCH_PY = [
    "import ui, json, os",
    "if not getattr(ui.EditLine, '_m2oTapPatch', False):",
    "    _o = ui.EditLine.OnMouseLeftButtonDown",
    "    def _m2oEditTap(self, *a, _o=_o):",
    "        import constInfo",
    "        _before = getattr(constInfo, '_mob_edit_seq', 0)",
    "        r = _o(self, *a)",
    "        try:",
    "            if getattr(constInfo, '_mob_edit_seq', 0) != _before and os.path.exists('/m2w_edit.json'):",
    "                _f = open('/m2w_edit.json', 'r')",
    "                _d = json.loads(_f.read())",
    "                _f.close()",
    "                _d['tap'] = True",
    "                _d['secret'] = bool(getattr(self, '_m2oSecret', False))",
    "                _d['text'] = str(self.GetText() or '')",
    "                _f = open('/m2w_edit.json', 'w')",
    "                _f.write(json.dumps(_d))",
    "                _f.close()",
    "        except Exception:",
    "            pass",
    "        return r",
    "    ui.EditLine.OnMouseLeftButtonDown = _m2oEditTap",
    "    ui.EditLine._m2oTapPatch = True",
    "open('/m2w_tap_ok', 'w').close()"
  ].join("\n");
  setInterval(function () {
    if (tapPatchOk) return;
    try {
      if (!window.Module || !Module.FS) return;
      if (fsExists("/m2w_tap_ok")) { tapPatchOk = true; return; }
      if (!fsExists("/m2w_cmd.py")) runPy(EDIT_TAP_PATCH_PY);
    } catch (e) { }
  }, 1500);

  function sendEditText(val, isReturn) {
    var escaped = JSON.stringify(val);
    var code =
      "import constInfo, ime\n" +
      "el = getattr(constInfo, '_last_active_editline', None)\n" +
      "if el:\n" +
      "    val = " + escaped + "\n" +
      "    el.SetText(val)\n" +
      "    ime.SetText(val)\n" +
      "    try:\n" +
      "        ime.MoveEnd()\n" +
      "    except Exception:\n" +
      "        pass\n" +
      (isReturn
        ? "    if hasattr(el, 'OnIMEReturn') and callable(el.OnIMEReturn):\n" +
          "        el.OnIMEReturn()\n" +
          "    elif getattr(el, 'eventReturn', None) and callable(el.eventReturn):\n" +
          "        el.eventReturn()\n"
        : "");
    pyCmd(code);
  }

  // Apaga o último caractere direto no campo do jogo (quando o input escondido está vazio).
  function sendEditBackspace() {
    pyCmd(
      "import constInfo, ime\n" +
      "el = getattr(constInfo, '_last_active_editline', None)\n" +
      "if el:\n" +
      "    _t = str(el.GetText() or '')\n" +
      "    if _t:\n" +
      "        _t = _t[:-1]\n" +
      "        el.SetText(_t)\n" +
      "        ime.SetText(_t)\n" +
      "        try:\n" +
      "            ime.MoveEnd()\n" +
      "        except Exception:\n" +
      "            pass\n"
    );
  }

  function closeKeyboard() {
    if (document.activeElement === hiddenIme) {
      try { hiddenIme.blur(); } catch (e) { }
    }
    if (typeof hideGameKb === "function") hideGameKb();
  }

  function submitEdit() {
    var val = hiddenIme.value;
    sendEditText(val, true);
    // Mantém o teclado aberto por um instante: se o Enter levar o foco para o
    // próximo campo (usuário -> senha), o teclado continua aberto nele.
    keepKbUntil = Date.now() + 900;
    setTimeout(function () {
      if (Date.now() >= keepKbUntil && !fsExists("/m2w_edit.json")) closeKeyboard();
    }, 950);
  }

  function cancelEdit() {
    editActive = false;
    closeKeyboard();
    fsRm("/m2w_edit.json");
    runPy(
      "import constInfo\n" +
      "el = getattr(constInfo, '_last_active_editline', None)\n" +
      "if el and getattr(el, 'KillFocus', None):\n" +
      "    try:\n" +
      "        el.KillFocus()\n" +
      "    except Exception:\n" +
      "        pass\n"
    );
  }

  function focusHiddenIme(editInfo) {
    if (editInfo) {
      hiddenIme.inputMode = editInfo.number_mode ? "numeric" : "text";
      if (editInfo.max && editInfo.max > 0) hiddenIme.maxLength = editInfo.max;
      else hiddenIme.removeAttribute("maxlength");
      hiddenIme.value = editInfo.text || "";
    }
    try {
      hiddenIme.focus();
      if (hiddenIme.setSelectionRange) {
        var len = hiddenIme.value.length;
        hiddenIme.setSelectionRange(len, len);
      }
    } catch (e) { }
  }

  function readEditInfo() {
    try {
      if (!fsExists("/m2w_edit.json")) return null;
      var ei = JSON.parse(Module.FS.readFile("/m2w_edit.json", { encoding: "utf8" }));
      return (ei && ei.active) ? ei : null;
    } catch (e) { return null; }
  }

  // Decide se um foco NOVO do jogo (seq diferente) deve abrir/redirecionar o teclado.
  function handleEditInfo(ei, fromTap) {
    if (!ei) return;
    var seq = Number(ei.seq) || 1;
    var kbOpen = document.activeElement === hiddenIme || gameKbOpen();
    if (editActive && seq === lastEditSeq && kbOpen && !fromTap) return;
    var isNewSeq = (!editActive || seq !== lastEditSeq);
    editActive = true;
    lastEditSeq = seq;
    var userTapped = (isNewSeq && !!ei.tap) || !!fromTap || (isNewSeq && Date.now() - lastCanvasTapAt < 650);
    var autoOpen = isNewSeq && lastPhase === "CreateCharacterWindow";
    if (userTapped || kbOpen || autoOpen || (isNewSeq && Date.now() < keepKbUntil)) {
      openKeyboardFor(ei);
    }
  }

  hiddenIme.addEventListener("input", function (e) {
    e.stopPropagation();
    sendEditText(hiddenIme.value, false);
  });

  ["keydown", "keyup", "keypress"].forEach(function (evName) {
    hiddenIme.addEventListener(evName, function (e) {
      e.stopPropagation();
      if (evName === "keydown") {
        if (e.key === "Enter" || e.keyCode === 13) {
          e.preventDefault();
          submitEdit();
        } else if (e.key === "Escape" || e.keyCode === 27) {
          e.preventDefault();
          cancelEdit();
        } else if ((e.key === "Backspace" || e.keyCode === 8) && hiddenIme.value === "") {
          e.preventDefault();
          sendEditBackspace();
        }
      }
    });
  });
  // Alguns teclados (Gboard) mandam "apagar" só como beforeinput.
  hiddenIme.addEventListener("beforeinput", function (e) {
    if (e.inputType === "deleteContentBackward" && hiddenIme.value === "") {
      e.preventDefault();
      sendEditBackspace();
    }
  });

  // =========================================================================
  // TECLADO DO JOGO (HTML)
  // O teclado do celular falhava ao apagar: com o campo escondido vazio ou com um
  // texto diferente do que o jogo mostra (conta salva, foco que mudou), o Android
  // não manda nada ao tocar em "apagar". Este teclado fala direto com o campo do
  // jogo: cada tecla acrescenta/apaga no texto ATUAL do campo (via Python), então
  // apagar sempre funciona. "Teclado do celular" continua disponível (botão 📱).
  // =========================================================================
  function kbPref() {
    try {
      var s = localStorage.getItem("m2o.kb");
      if (s === "native" || s === "game") return s;
    } catch (e) { }
    return isTouchDevice ? "game" : "native";
  }
  var kbCss = document.createElement("style");
  kbCss.textContent =
    "#m2o-kb{position:fixed;left:0;right:0;bottom:0;z-index:200;pointer-events:auto;display:none;flex-direction:column;gap:4px;padding:5px 6px calc(6px + env(safe-area-inset-bottom));" +
    "background:linear-gradient(180deg,rgba(28,24,18,.97),rgba(10,9,7,.98));border-top:2px solid #8a6d36;box-shadow:0 -4px 14px rgba(0,0,0,.7);" +
    "height:min(52vh,230px);box-sizing:border-box;touch-action:none;-webkit-user-select:none;user-select:none;font-family:Tahoma,'Segoe UI',sans-serif}" +
    "#m2o-kb.open{display:flex}" +
    "#m2o-kb .kb-top{display:flex;align-items:center;gap:6px;height:28px;flex:0 0 auto}" +
    "#m2o-kb .kb-view{flex:1;height:26px;line-height:26px;padding:0 8px;border:1px solid #6e5a35;border-radius:3px;background:#050505;color:#f3e7c8;font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr}" +
    "#m2o-kb .kb-view:after{content:'|';color:#d9a94a;animation:m2kbc 1s steps(1) infinite;margin-left:1px}" +
    "@keyframes m2kbc{50%{opacity:0}}" +
    "#m2o-kb .kb-small{height:26px;padding:0 8px;border-radius:3px;border:1px solid #6e5a35;background:#2a241b;color:#e6d5a8;font:700 11px Tahoma,sans-serif}" +
    "#m2o-kb .kb-row{display:flex;gap:4px;flex:1 1 0;min-height:0}" +
    "#m2o-kb .kb-key{flex:1 1 0;min-width:0;border-radius:4px;border:1px solid #4b4132;background:linear-gradient(180deg,#3a342b,#221e18);color:#f1e6cc;" +
    "font:700 15px Tahoma,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 1px 2px #000;padding:0}" +
    "#m2o-kb .kb-key.wide{flex:1.6 1 0}#m2o-kb .kb-key.space{flex:4 1 0}" +
    "#m2o-kb .kb-key.act{background:linear-gradient(180deg,#5a4a2a,#3a2f1a);color:#ffe9a8}" +
    "#m2o-kb .kb-key.ok{background:linear-gradient(180deg,#3d6b2c,#22401a);color:#eaffd8}" +
    "#m2o-kb .kb-key.down{filter:brightness(1.6);transform:translateY(1px)}";
  document.head.appendChild(kbCss);
  var gameKb = document.createElement("div");
  gameKb.id = "m2o-kb";
  root.appendChild(gameKb);   // dentro do overlay, por cima dos botões dele
  ["touchstart", "touchmove", "touchend", "mousedown", "mouseup", "mousemove", "click"].forEach(function (evName) {
    gameKb.addEventListener(evName, function (e) { e.stopPropagation(); }, { passive: true });
  });
  var kbTop = document.createElement("div");
  kbTop.className = "kb-top";
  var kbView = document.createElement("div");
  kbView.className = "kb-view";
  var kbNative = document.createElement("button");
  kbNative.type = "button";
  kbNative.className = "kb-small";
  kbNative.textContent = M2I18N.lang === "pl" ? "\uD83D\uDCF1 Klawiatura telefonu" : (M2I18N.lang === "en" ? "\uD83D\uDCF1 Phone keyboard" : "\uD83D\uDCF1 Teclado do celular");
  var kbClose = document.createElement("button");
  kbClose.type = "button";
  kbClose.className = "kb-small";
  kbClose.textContent = "✕";
  kbTop.appendChild(kbView);
  kbTop.appendChild(kbNative);
  kbTop.appendChild(kbClose);
  gameKb.appendChild(kbTop);
  var kbRowsEl = document.createElement("div");
  kbRowsEl.style.cssText = "display:flex;flex-direction:column;gap:4px;flex:1 1 auto;min-height:0";
  gameKb.appendChild(kbRowsEl);

  var kbShift = false, kbSym = false, kbSecret = false, kbText = "", kbInfo = null;
  var kbTargetEl = null;
  var kbAwaitView = false;   // null = campo do jogo; um <input> do overlay (ex.: chat)
  var KB_LETTERS = [
    "1234567890".split(""),
    "qwertyuiop".split(""),
    "asdfghjkl".split("").concat(["⌫"]),
    ["⇧"].concat("zxcvbnm".split("")).concat(["@", "."]),
    ["?123", " ", "-", "_", "OK"]
  ];
  var KB_SYMBOLS = [
    "1234567890".split(""),
    "!@#$%&*()=".split(""),
    "-_+/:;'\",".split("").concat(["⌫"]),
    "~[]{}<>?.".split("").concat(["|"]),
    ["ABC", " ", ".", ",", "OK"]
  ];
  function kbPy(kind, ch) {
    var L = [
      "import constInfo, ime, json",
      "el = getattr(constInfo, '_last_active_editline', None)",
      "if el:",
      "    t = str(el.GetText() or '')"
    ];
    if (kind === "add") {
      L.push("    if len(t) < int(getattr(el, 'max', 0) or 9999):");
      L.push("        t = t + " + JSON.stringify(ch));
    } else if (kind === "del") {
      L.push("    t = t[:-1]");
    } else if (kind === "clear") {
      L.push("    t = ''");
    }
    if (kind !== "view" && kind !== "enter") {
      L.push("    el.SetText(t)");
      L.push("    try:", "        ime.SetText(t)", "    except Exception:", "        pass");
      L.push("    try:", "        ime.MoveEnd()", "    except Exception:", "        pass");
    }
    L.push("    _f = open('/m2w_kbview.json', 'w')");
    L.push("    _f.write(json.dumps({'t': t, 's': bool(getattr(el, '_m2oSecret', False))}))");
    L.push("    _f.close()");
    if (kind === "enter") {
      L.push("    if hasattr(el, 'OnIMEReturn') and callable(el.OnIMEReturn):");
      L.push("        el.OnIMEReturn()");
      L.push("    elif getattr(el, 'eventReturn', None) and callable(el.eventReturn):");
      L.push("        el.eventReturn()");
    }
    return L.join("\n");
  }
  function renderKbView() {
    var t = kbSecret ? kbText.replace(/./g, "●") : kbText;
    kbView.textContent = t;
  }
  function kbPress(k) {
    kbAwaitView = false;
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { }
    if (k === "⌫") {
      kbText = kbText.slice(0, -1); renderKbView();
      // Campo do jogo: tecla de verdade (Backspace) - funciona em qualquer campo com foco
      // no jogo, inclusive o nome na criação de personagem.
      if (kbTargetEl) kbTargetEl.value = kbText; else keyEv("Backspace");
      return;
    }
    if (k === "⇧") { kbShift = !kbShift; buildKbRows(); return; }
    if (k === "?123") { kbSym = true; buildKbRows(); return; }
    if (k === "ABC") { kbSym = false; buildKbRows(); return; }
    if (k === "OK") {
      if (kbTargetEl) {
        var tEl = kbTargetEl;
        tEl.value = kbText;
        hideGameKb();
        if (tEl === chatInp) sendChatInput();
        return;
      }
      keyEv("Enter");
      // Enter pode levar o foco para o próximo campo (usuário -> senha): o teclado fica.
      keepKbUntil = Date.now() + 900;
      setTimeout(function () {
        if (Date.now() >= keepKbUntil && !fsExists("/m2w_edit.json")) hideGameKb();
      }, 950);
      return;
    }
    var ch = k;
    if (!kbSym && kbShift && ch.length === 1) { ch = ch.toUpperCase(); kbShift = false; buildKbRows(); }
    if (kbInfo && kbInfo.number_mode && !/^[0-9]$/.test(ch)) return;
    if (kbTargetEl && kbTargetEl.maxLength > 0 && kbText.length >= kbTargetEl.maxLength) return;
    kbText += ch;
    renderKbView();
    if (kbTargetEl) kbTargetEl.value = kbText; else keyEv(ch);
  }
  var kbRepeat = null;
  function bindKey(el, k) {
    var fire = function (e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      el.classList.add("down");
      kbPress(k);
      if (k === "⌫") {
        if (kbRepeat) clearTimeout(kbRepeat);
        var rep = function () { kbPress(k); kbRepeat = setTimeout(rep, 90); };
        kbRepeat = setTimeout(rep, 420);
      }
    };
    var up = function (e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      el.classList.remove("down");
      if (kbRepeat) { clearTimeout(kbRepeat); kbRepeat = null; }
    };
    el.addEventListener("touchstart", fire, { passive: false });
    el.addEventListener("touchend", up, { passive: false });
    el.addEventListener("touchcancel", up, { passive: false });
    el.addEventListener("mousedown", fire);
    el.addEventListener("mouseup", up);
    el.addEventListener("mouseleave", up);
  }
  function buildKbRows() {
    kbRowsEl.innerHTML = "";
    var rows = kbSym ? KB_SYMBOLS : KB_LETTERS;
    rows.forEach(function (row) {
      var r = document.createElement("div");
      r.className = "kb-row";
      row.forEach(function (k) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "kb-key";
        var label = k;
        if (!kbSym && kbShift && k.length === 1 && /[a-z]/.test(k)) label = k.toUpperCase();
        if (k === " ") { b.className += " space"; label = M2I18N.lang === "pl" ? "spacja" : (M2I18N.lang === "en" ? "space" : "espa\u00e7o"); }
        if (k === "⌫" || k === "⇧" || k === "?123" || k === "ABC") b.className += " act wide";
        if (k === "⇧" && kbShift) b.className += " down";
        if (k === "OK") b.className += " ok wide";
        b.textContent = label;
        bindKey(b, k);
        r.appendChild(b);
      });
      kbRowsEl.appendChild(r);
    });
  }
  buildKbRows();
  function gameKbOpen() { return gameKb.classList.contains("open"); }
  function showGameKb(ei, targetEl) {
    kbTargetEl = targetEl || null;
    kbInfo = ei || null;
    kbText = targetEl ? (targetEl.value || "") : ((ei && ei.text) || "");
    kbSecret = !!(ei && ei.secret);
    kbShift = false;
    kbSym = !!(ei && ei.number_mode);
    buildKbRows();
    renderKbView();
    gameKb.classList.add("open");
    if (lastPhase === "LoginWindow") {
      runPy("import constInfo\nif hasattr(constInfo, '_m2oFitLogin'):\n    try:\n        constInfo._m2oFitLogin(self, True)\n    except TypeError:\n        constInfo._m2oFitLogin(self)");
    }
    if (targetEl === chatInp) { chatBar.classList.add("typing"); wakeChatLog(true); }
    if (!targetEl) { kbAwaitView = true; runPy(kbPy("view")); }
  }
  function hideGameKb() {
    if (!gameKbOpen()) return;
    gameKb.classList.remove("open");
    if (lastPhase === "LoginWindow") {
      runPy("import constInfo\nif hasattr(constInfo, '_m2oFitLogin'):\n    try:\n        constInfo._m2oFitLogin(self, False)\n    except TypeError:\n        constInfo._m2oFitLogin(self)");
    }
    if (kbRepeat) { clearTimeout(kbRepeat); kbRepeat = null; }
    if (kbTargetEl === chatInp) { chatBar.classList.remove("typing"); chatLog.classList.remove("interactive"); setNativeChatEditBoard(false); }
    kbTargetEl = null;
  }
  // Botão "Teclado": abre o teclado do jogo quando quiser. No jogo, sem campo de texto
  // do jogo ativo, ele escreve no chat.
  function openGameKbManual() {
    var ei = readEditInfo();
    if (ei) { showGameKb(ei); return; }
    if (inWorld) { showGameKb(null, chatInp); return; }
    showGameKb(null);
  }
  function openKeyboardFor(ei) {
    // On desktop PC (non-touch), let the user type directly on their physical keyboard into the game canvas
    if (!isTouchDevice) { hideGameKb(); return; }
    if (kbPref() === "native") { hideGameKb(); focusHiddenIme(ei); }
    else { if (document.activeElement === hiddenIme) { try { hiddenIme.blur(); } catch (e) { } } showGameKb(ei); }
  }
  kbClose.addEventListener("click", function (e) { e.stopPropagation(); hideGameKb(); });
  kbNative.addEventListener("click", function (e) {
    e.stopPropagation();
    try { localStorage.setItem("m2o.kb", "native"); } catch (e2) { }
    hideGameKb();
    var wasChat = kbTargetEl === chatInp;
    var keep = kbText;
    applyChatKbMode();
    if (wasChat) { chatInp.value = keep; try { chatInp.focus(); } catch (e2) { } }
    else focusHiddenIme({ text: keep, max: kbInfo && kbInfo.max, number_mode: kbInfo && kbInfo.number_mode });
    showHudTip("<b>Teclado do celular ativado.</b><br>Para voltar ao teclado do jogo: engrenagem → Teclado.");
  });
  // Texto real do campo, mandado pelo Python depois de cada tecla.
  setInterval(function () {
    try {
      if (!window.Module || !Module.FS || !fsExists("/m2w_kbview.json")) return;
      var v = JSON.parse(Module.FS.readFile("/m2w_kbview.json", { encoding: "utf8" }));
      fsRm("/m2w_kbview.json");
      if (v && typeof v.t === "string") {
        kbSecret = !!v.s;
        // Só aceita se não há teclas ainda na fila (senão o texto "volta" um passo).
        // Só a leitura inicial (ao abrir): depois disso o texto é acompanhado aqui.
        if (kbAwaitView && !kbTargetEl) { kbText = v.t; kbAwaitView = false; }
        renderKbView();
      }
    } catch (e) { }
  }, 120);

  setInterval(function () {
    try {
      if (!window.Module || !Module.FS) return;
      if (fsExists("/m2w_focus_chat")) {
        fsRm("/m2w_focus_chat");
        if (isTouchDevice && kbPref() !== "native") showGameKb(null, chatInp);
        else { chatInp.readOnly = false; try { chatInp.focus(); } catch (e2) { } }
      }
      var ei = readEditInfo();
      if (ei) {
        handleEditInfo(ei, false);
      } else if (editActive) {
        editActive = false;
        if (Date.now() >= keepKbUntil) closeKeyboard();
      }
    } catch (e) { }
  }, 100);

  // =========================================================================
  // HUD POLLING (/m2w_hud.json) WITH DIRTY-CHECK & RAF DOM BATCHING
  // =========================================================================
  var inWorld = false;
  // =========================================================================
  // ZOOM POR CONTROLE DESLIZANTE (substitui o "pinça" com dois dedos)
  // Esquerda = câmera perto, direita = câmera longe. O valor é aplicado direto na
  // distância da câmera do jogo (app.SetCamera), entre ZOOM_MIN e a distância máxima
  // configurada no jogo (constInfo.CAMERA_MAX_DISTANCE: 2500 ou 3500).
  // =========================================================================
  var ZOOM_MIN = 300;
  var zoomBar = document.createElement("div");
  zoomBar.className = "zoom-bar";
  zoomBar.title = "Zoom da câmera";
  var LENS = function (plus) {
    return '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5" fill="none" stroke="#e6d5a8" stroke-width="2.4"/>' +
      '<path d="M15 15l6 6" stroke="#e6d5a8" stroke-width="2.8" stroke-linecap="round"/>' +
      '<path d="M7 10h6' + (plus ? 'M10 7v6' : '') + '" stroke="#e6d5a8" stroke-width="2" stroke-linecap="round"/></svg>';
  };
  zoomBar.innerHTML =
    '<span class="zb-ico" title="Aproximar">' + LENS(true) + '</span>' +
    '<div class="zoom-track"><div class="zoom-fill"></div><div class="zoom-knob"></div></div>' +
    '<span class="zb-ico" title="Afastar">' + LENS(false) + '</span>';
  root.appendChild(zoomBar);
  var zoomTrack = zoomBar.querySelector(".zoom-track");
  var zoomFill = zoomBar.querySelector(".zoom-fill");
  var zoomKnob = zoomBar.querySelector(".zoom-knob");
  var zoomValue = 0.55;          // 0..1
  var zoomDragId = null;
  var zoomLastUserAt = 0;
  var zoomSendTimer = null;
  var zoomPending = null;

  function renderZoom() {
    var pct = (Math.max(0, Math.min(1, zoomValue)) * 100).toFixed(1) + "%";
    zoomKnob.style.top = pct;
    zoomFill.style.height = pct;
  }
  renderZoom();
  function sendZoomNow() {
    zoomSendTimer = null;
    if (zoomPending === null) return;
    var v = zoomPending;
    zoomPending = null;
    // BUG: app.SetCamera a cada movimento do controle fazia a tela piscar (a câmera
    // "pulava" para a distância nova a cada comando). Agora só guardamos a distância
    // alvo e um pequeno "motor" dentro do jogo aproxima/afasta a câmera de forma
    // contínua (o mesmo zoom suave das teclas R/F do PC), parando ao chegar.
    runPy(safePy([
      "import app, constInfo, ui",
      "_mx = float(getattr(constInfo, 'CAMERA_MAX_DISTANCE', 2500.0) or 2500.0)",
      "_mn = " + ZOOM_MIN + ".0",
      "constInfo._m2o_zoom_target = _mn + (_mx - _mn) * " + v.toFixed(4),
      "constInfo._m2o_zoom_dir = 0",
      "_zd = getattr(constInfo, '_m2oZoomDrv', None)",
      "if _zd is None or not _zd.IsShow():",
      "    class _M2oZoomDriver(ui.Window):",
      "        def __init__(self):",
      "            ui.Window.__init__(self)",
      "            self.AddFlag('not_pick')",
      "        def OnUpdate(self):",
      "            import app, constInfo",
      "            _t = getattr(constInfo, '_m2o_zoom_target', None)",
      "            if _t is None:",
      "                return",
      "            _d = float(app.GetCamera()[0])",
      "            _dir = -1 if _d > _t else 1",
      "            _last = getattr(constInfo, '_m2o_zoom_dir', 0)",
      "            _prev = getattr(self, '_prevD', None)",
      "            self._prevD = _d",
      "            self._still = (getattr(self, '_still', 0) + 1) if (_prev is not None and abs(_d - _prev) < 0.5 and _last) else 0",
      "            if abs(_d - _t) < 20 or (_last and _dir != _last) or self._still > 20:",
      "                self._still = 0",
      "                app.ZoomCamera(app.CAMERA_STOP)",
      "                constInfo._m2o_zoom_target = None",
      "                constInfo._m2o_zoom_dir = 0",
      "                return",
      "            if _dir != _last:",
      "                app.ZoomCamera(app.CAMERA_TO_NEGATIVE if _dir < 0 else app.CAMERA_TO_POSITIVE)",
      "                constInfo._m2o_zoom_dir = _dir",
      "    _zd = _M2oZoomDriver()",
      "    _zd.SetSize(0, 0)",
      "    _zd.Show()",
      "    constInfo._m2oZoomDrv = _zd"
    ]));
  }
  function setZoomFromUser(v) {
    zoomValue = Math.max(0, Math.min(1, v));
    zoomLastUserAt = Date.now();
    renderZoom();
    zoomPending = zoomValue;
    try { localStorage.setItem("m2o.zoom", String(zoomValue)); } catch (e) { }
    // No máximo ~12 comandos por segundo enquanto arrasta (evita encher a fila).
    if (!zoomSendTimer) zoomSendTimer = setTimeout(sendZoomNow, 80);
  }
  // Barra vertical ao lado do minimapa: em cima = perto (+), embaixo = longe (-).
  function zoomFromX(clientY) {
    var r = zoomTrack.getBoundingClientRect();
    if (!r.height) return zoomValue;
    return (clientY - r.top) / r.height;
  }
  zoomBar.addEventListener("touchstart", function (e) {
    e.preventDefault(); e.stopPropagation();
    markInputActive();
    var t = e.changedTouches[0];
    if (!t || zoomDragId !== null) return;
    zoomDragId = t.identifier;
    zoomBar.classList.add("active");
    setZoomFromUser(zoomFromX(t.clientY));
  }, { passive: false });
  zoomBar.addEventListener("touchmove", function (e) {
    e.preventDefault(); e.stopPropagation();
    markInputActive();
    var t = findTouch(e.changedTouches, zoomDragId);
    if (t) setZoomFromUser(zoomFromX(t.clientY));
  }, { passive: false });
  ["touchend", "touchcancel"].forEach(function (n) {
    zoomBar.addEventListener(n, function (e) {
      e.preventDefault(); e.stopPropagation();
      if (findTouch(e.changedTouches, zoomDragId)) {
        zoomDragId = null;
        zoomBar.classList.remove("active");
      }
    }, { passive: false });
  });
  // Mouse (testes no PC)
  zoomBar.addEventListener("mousedown", function (e) {
    e.preventDefault(); e.stopPropagation();
    setZoomFromUser(zoomFromX(e.clientY));
    function mv(ev) { setZoomFromUser(zoomFromX(ev.clientY)); }
    function up() { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  });

  // Lê a distância atual da câmera do jogo para posicionar a bolinha
  // (ex.: depois de entrar no mundo, ou se algo mudou o zoom por fora).
  function requestZoomSync() {
    runPy(safePy([
      "import app, constInfo",
      "_d, _p, _r, _h = app.GetCamera()",
      "_mx = float(getattr(constInfo, 'CAMERA_MAX_DISTANCE', 2500.0) or 2500.0)",
      "_mn = " + ZOOM_MIN + ".0",
      "_t = (float(_d) - _mn) / max(1.0, _mx - _mn)",
      "_f = open('/m2w_cam.json', 'w')",
      "_f.write('{\"t\": %.4f}' % max(0.0, min(1.0, _t)))",
      "_f.close()"
    ]));
  }
  setInterval(function () {
    try {
      if (!inWorld || !window.Module || !Module.FS) return;
      if (fsExists("/m2w_cam.json")) {
        var cj = JSON.parse(Module.FS.readFile("/m2w_cam.json", { encoding: "utf8" }));
        fsRm("/m2w_cam.json");
        if (zoomDragId === null && Date.now() - zoomLastUserAt > 1500 && cj && typeof cj.t === "number") {
          zoomValue = cj.t;
          renderZoom();
        }
      } else if (zoomDragId === null && Date.now() - zoomLastUserAt > 4000 && !fsExists("/m2w_cmd.py")) {
        requestZoomSync();
      }
    } catch (e) { }
  }, 1500);

  var worldEls = [hudTl, tlSide, rCol, atkBtn, joy, pickupBtn, chatBar, zoomBar, shopBtn, escBtn, kbBtn].concat(slotEls);

  function setWorldMode(active) {
    inWorld = !!active;
    if (inWorld && loadingActive) {
      hideLoadingScreen();
    }
    preBar.style.display = inWorld ? "none" : "flex";
    worldEls.forEach(function (el) { el.style.display = inWorld ? "" : "none"; });
    updateChatLogVisibility();
    vipBtn.style.display = (inWorld && vipActive) ? "" : "none";
    if (!inWorld && vipPanel) { vipPanel.remove(); vipPanel = null; }
    if (!inWorld && whisperPanel) { whisperPanel.remove(); whisperPanel = null; }
    if (inWorld) {
      positionShopBtn();
      setTimeout(applyGfx, 2600);
      setTimeout(applyNativeChat, 350); setTimeout(applyNativeChat, 1200); setTimeout(applyNativeChat, 2900);
      setTimeout(shiftMiniMap, 1200);
      setTimeout(shiftMiniMap, 4500);
      whisperList = []; renderWhisperBadge();
      setTimeout(installWhisperPatch, 2200);
      setTimeout(installSidekickLayout, 3600);
      setTimeout(function () { runPy(SHOP_PEEK_PY); }, 3200);
      refreshJoyRect();
      lastLayoutSig = "";
      setTimeout(function () { syncNativeLayout(true); }, 900);
      setTimeout(function () { syncNativeLayout(true); }, 3500);
      // Reaplica o último zoom escolhido no controle deslizante (ou lê o do jogo).
      setTimeout(function () {
        var saved = null;
        try { saved = localStorage.getItem("m2o.zoom"); } catch (e) { }
        if (saved !== null && saved !== "" && !isNaN(Number(saved))) setZoomFromUser(Number(saved));
        else requestZoomSync();
      }, 1800);
    } else {
      gearMenu.classList.remove("open");
      gmModal.classList.remove("open");
      root.classList.remove("win-open");
      prevOpenWin = null;
      if (questPanel) { questPanel.remove(); questPanel = null; }
      try { if (document.activeElement === chatInp) chatInp.blur(); } catch (e) { }
      if (hudTipEl) hudTipEl.classList.remove("show");
      if (targetPillEl) targetPillEl.style.display = "none";
    }
  }
  setWorldMode(false);

  // =========================================================================
  // LAYOUT DA UI NATIVA x HUD HTML
  // O HUD (vida/mana/exp + botões AUTO/SEL/DIV) é HTML e fica por cima do canvas,
  // exatamente no canto em que o jogo desenha os ícones de buffs (affectBar, 10,10)
  // e a lista do grupo (PartyWindow, 10,52). Resultado: a barra de vida cobria o
  // grupo e os bônus ativos. Aqui convertemos a área ocupada pelo HUD (px CSS) para
  // px do jogo e movemos os buffs para a DIREITA do HUD e o grupo para BAIXO dos botões.
  // =========================================================================
  var lastLayoutSig = "";
  function syncNativeLayout(force) {
    try {
      if (!inWorld || !window.Module || !Module.FS) return;
      var vw = window.innerWidth || 0, vh = window.innerHeight || 0;
      if (vw < 50 || vh < 50) return;
      var hr = hudTl.getBoundingClientRect();
      var sr = tlSide.getBoundingClientRect();
      if (!hr.width || !hr.height) return;
      var ax = Math.round(hr.right + 6);
      var ay = 4;
      var px = Math.round(Math.max(6, hr.left + 2));
      var py = Math.round(Math.max(hr.bottom, sr.bottom || 0) + 6);
      var sig = [vw, vh, ax, ay, px, py].join(",");
      if (!force && sig === lastLayoutSig) return;
      lastLayoutSig = sig;
      runPy(safePy([
        "import wndMgr, ui",
        "_kx = float(wndMgr.GetScreenWidth()) / " + vw + ".0",
        "_ky = float(wndMgr.GetScreenHeight()) / " + vh + ".0",
        "_ax, _ay = int(" + ax + " * _kx), int(" + ay + " * _ky)",
        "_px, _py = int(" + px + " * _kx), int(" + py + " * _ky)",
        "_ab = getattr(self, 'affectBar', None)",
        "if _ab:",
        "    _ab.SetPosition(_ax, _ay)",
        "_wp = getattr(getattr(self, 'interface', None), 'wndParty', None)",
        "if _wp:",
        "    _wp._m2oPos = (_px, _py)",
        "    if not getattr(_wp, '_m2oPatched', False):",
        "        _wp._m2oPatched = True",
        "        def _m2oPartySetPos(x, y, _w=_wp):",
        "            _p = getattr(_w, '_m2oPos', None)",
        "            if _p:",
        "                x, y = _p",
        "            ui.Window.SetPosition(_w, x, y)",
        "        _wp.SetPosition = _m2oPartySetPos",
        "    _wp.SetPosition(_px, _py)",
        "    _arr = getattr(_wp, '_PartyWindow__ArrangePartyMemberInfoBoard', None)",
        "    if callable(_arr):",
        "        _arr()"
      ]));
    } catch (e) { }
  }
  var layoutTimer = null;
  function scheduleLayoutSync(delay, force) {
    if (layoutTimer) clearTimeout(layoutTimer);
    layoutTimer = setTimeout(function () { layoutTimer = null; syncNativeLayout(force); }, delay || 0);
  }
  window.addEventListener("resize", function () { scheduleLayoutSync(350, false); });
  window.addEventListener("orientationchange", function () { scheduleLayoutSync(600, false); });
  setInterval(function () { if (inWorld) syncNativeLayout(true); }, 8000);

  var elLv = document.getElementById("m2o_lv");
  var elHpTrail = document.getElementById("m2o_hp_trail");
  var elHpFill = document.getElementById("m2o_hp_fill");
  var elHpTxt = document.getElementById("m2o_hp_txt");
  var elMpTrail = document.getElementById("m2o_mp_trail");
  var elMpFill = document.getElementById("m2o_mp_fill");
  var elMpTxt = document.getElementById("m2o_mp_txt");
  var elExpWrap = document.getElementById("m2o_exp_wrap");
  var elOrbs = [
    document.getElementById("m2o_orb_0"),
    document.getElementById("m2o_orb_1"),
    document.getElementById("m2o_orb_2"),
    document.getElementById("m2o_orb_3")
  ];
  var lastHudRaw = "";
  var lastSlotsSig = "";
  var prevLvStr = "";
  var prevHpW = "";
  var prevHpTxt = "";
  var prevMpW = "";
  var prevMpTxt = "";
  var prevExpTitle = "";
  var prevOrbH = ["", "", "", ""];
  var prevIsGm = null;
  var prevFishing = null;
  var prevTargetStr = "";
  var prevOpenWin = null;
  var prevCursorAtt = null;
  var pendingHudData = null;
  var hudRafId = 0;

  function applyHudDom() {
    hudRafId = 0;
    var d = pendingHudData;
    if (!d) return;
    pendingHudData = null;

    var hp = Math.max(0, Number(d.hp) || 0), maxHp = Math.max(1, Number(d.max_hp) || 1);
    var sp = Math.max(0, Number(d.sp) || 0), maxSp = Math.max(1, Number(d.max_sp) || 1);
    var exp = Math.max(0, Number(d.exp) || 0), maxExp = Math.max(1, Number(d.max_exp) || 1);
    var expPct = Math.min(100, Math.max(0, (exp / maxExp) * 100));
    var expPctStr = expPct.toFixed(1) + "%";
    curHp = hp; curMaxHp = maxHp;
    curSp = sp; curMaxSp = maxSp;
    curExp = exp; curMaxExp = maxExp;
    curExpPct = expPct;

    var lvStr = "Lv. " + (d.level || 1);
    if (elLv && lvStr !== prevLvStr) {
      prevLvStr = lvStr;
      elLv.textContent = lvStr;
    }
    var hpW = Math.min(100, Math.round((hp / maxHp) * 100)) + "%";
    if (elHpFill && hpW !== prevHpW) {
      prevHpW = hpW;
      elHpFill.style.width = hpW;
      if (elHpTrail) elHpTrail.style.width = hpW;
    }
    var hpTxt = hp + " / " + maxHp;
    if (elHpTxt && hpTxt !== prevHpTxt) {
      prevHpTxt = hpTxt;
      elHpTxt.textContent = hpTxt;
    }
    var mpW = Math.min(100, Math.round((sp / maxSp) * 100)) + "%";
    if (elMpFill && mpW !== prevMpW) {
      prevMpW = mpW;
      elMpFill.style.width = mpW;
      if (elMpTrail) elMpTrail.style.width = mpW;
    }
    var mpTxt = sp + " / " + maxSp;
    if (elMpTxt && mpTxt !== prevMpTxt) {
      prevMpTxt = mpTxt;
      elMpTxt.textContent = mpTxt;
    }
    var expTitle = "EXP: " + exp + " / " + maxExp + " (" + expPctStr + ")";
    if (elExpWrap && expTitle !== prevExpTitle) {
      prevExpTitle = expTitle;
      elExpWrap.title = expTitle;
    }
    for (var oi = 0; oi < 4; oi++) {
      var orbFill = Math.min(100, Math.max(0, ((expPct - oi * 25) / 25) * 100));
      var orbH = orbFill.toFixed(1) + "%";
      if (elOrbs[oi] && orbH !== prevOrbH[oi]) {
        prevOrbH[oi] = orbH;
        elOrbs[oi].style.height = orbH;
      }
    }

    var isGm = !!d.is_gm;
    if (isGm !== prevIsGm) {
      prevIsGm = isGm;
      if (gmBtn) gmBtn.style.display = (inWorld && isGm) ? "" : "none";
      if (!isGm && gmModal.classList.contains("open")) gmModal.classList.remove("open");
    }

    var isFishing = !!d.fishing;
    curFishingMode = isFishing;
    if (isFishing !== prevFishing) {
      prevFishing = isFishing;
      if (atkBadgeEl) atkBadgeEl.style.display = isFishing ? "block" : "none";
    }

    var tVid = Number(d.target_vid) || 0;
    var tDist = typeof d.target_dist === "number" ? d.target_dist : -1;
    var tName = String(d.target_name || "").trim();
    curTargetVid = tVid;
    curTargetDist = tDist;
    var targetStr = (inWorld && tVid > 0 && tDist >= 0)
      ? ("\uD83C\uDFAF " + (tName ? (tName + " \u2022 ") : "") + tDist + " m")
      : "";
    if (targetStr !== prevTargetStr) {
      prevTargetStr = targetStr;
      if (targetPillEl) {
        if (targetStr) {
          targetPillEl.textContent = targetStr;
          targetPillEl.style.display = "block";
        } else {
          targetPillEl.style.display = "none";
        }
      }
    }

    hudOpenRaw = !!d.open_windows;
    var cursorAtt = !!(d.attached || d.cursor_attached);
    hudCursorAttached = cursorAtt;

    if (cursorAtt !== prevCursorAtt) {
      prevCursorAtt = cursorAtt;
      for (var si = 0; si < slotEls.length; si++) {
        slotEls[si].classList.toggle("slot-attach-ready", cursorAtt);
      }
    }
    applyOpenWin();

    if (Array.isArray(d.chat_lines)) {
      renderChatLines(d.chat_lines);
    }

    if (Array.isArray(d.slots)) {
      var sSig = JSON.stringify(d.slots);
      if (sSig !== lastSlotsSig) {
        lastSlotsSig = sSig;
        for (var i = 0; i < QUICK_SLOTS.length && i < d.slots.length; i++) {
          var sb = slotEls[i];
          var vis = buildSlotVisual(d.slots[i], QUICK_SLOTS[i].label);
          sb.classList.toggle("filled", vis.filled);
          sb.title = vis.title ? (QUICK_SLOTS[i].label + ": " + vis.title) : ("Slot " + QUICK_SLOTS[i].label);
          var artEl = sb.querySelector(".qs-art");
          var emptyEl = sb.querySelector(".qs-empty");
          var badgeEl = sb.querySelector(".qs-badge");
          renderSlotArt(artEl, vis);
          if (emptyEl) emptyEl.style.display = vis.filled ? "none" : "";
          if (badgeEl) badgeEl.textContent = vis.badge;
        }
      }
    }
  }

  setInterval(function () {
    try {
      if (!window.Module || !Module.FS || !fsExists("/m2w_hud.json")) {
        if (inWorld) {
          lastHudRaw = "";
          setWorldMode(false);
        }
        return;
      }
      var raw = Module.FS.readFile("/m2w_hud.json", { encoding: "utf8" });
      if (raw === lastHudRaw && inWorld) return;
      lastHudRaw = raw;
      var d = JSON.parse(raw);
      if (!d || !(d.max_hp > 0)) {
        if (inWorld) setWorldMode(false);
        return;
      }
      if (!inWorld) setWorldMode(true);
      pendingHudData = d;
      if (!hudRafId) hudRafId = requestAnimationFrame(applyHudDom);
    } catch (e) { }
  }, 180);

  // =========================================================================
  // QUEDA DE CONEXÃO / VOLTA AO LOGIN
  // BUG ANTIGO: o HUD só sumia se /m2w_hud.json desaparecesse, mas o jogo nunca apaga
  // esse arquivo. Ao cair o servidor e voltar para o login, o HUD (vida, joystick,
  // botões, chat) ficava por cima dos campos de usuário/senha. Agora perguntamos ao
  // jogo, a cada ~1,5 s, qual janela está ativa (Login, Seleção de personagem, Jogo).
  // Fora do jogo -> escondemos o HUD e apagamos o arquivo velho.
  // =========================================================================
  // Janelas que o HUD do jogo não conhece (Companheiro e a bolsa dele): uma
  // consulta leve diz se estão abertas, e elas passam a contar como "janela aberta"
  // (some o chat/zoom, o toque arrasta a janela em vez de girar a câmera).
  var hudOpenRaw = false;
  var shopOpen = false;
  // Converte coordenada da tela (CSS) para a tela lógica do jogo.
  function cssToLogicalY(cssY) {
    var c = canvasEl();
    if (!c) return cssY;
    var r = c.getBoundingClientRect();
    var lh = 0;
    try { lh = (window.m2w && m2w.mobileLogical) ? m2w.mobileLogical().h : 0; } catch (e) { }
    if (!lh) lh = c.height || r.height;
    return Math.round((cssY - r.top) * lh / (r.height || 1));
  }
  function cssToLogicalX(cssX) {
    var c = canvasEl();
    if (!c) return cssX;
    var r = c.getBoundingClientRect();
    var lw = 0;
    try { lw = (window.m2w && m2w.mobileLogical) ? m2w.mobileLogical().w : 0; } catch (e) { }
    if (!lw) lw = c.width || r.width;
    return Math.round((cssX - r.left) * lw / (r.width || 1));
  }
  // Loja de itens (662x464): grande demais para o celular e abria por baixo do HUD da
  // esquerda e dos botões da direita. Colocamos no espaço livre entre os dois, no topo.
  function placeItemShop() {
    var L = 0, R = 0;
    try {
      var tl = root.querySelector(".hud-tl"), side = root.querySelector(".tl-side");
      [tl, side].forEach(function (el) {
        if (el && el.offsetParent !== null) L = Math.max(L, el.getBoundingClientRect().right + 4);
      });
      if (rCol && rCol.offsetParent !== null) R = rCol.getBoundingClientRect().left - 4;
    } catch (e) { }
    var Ll = L ? cssToLogicalX(L) : 0;
    var Rl = R ? cssToLogicalX(R) : 0;
    runPy(safePy([
      "import wndMgr",
      "_w = self.interface.wndItemShop",
      "_sw = wndMgr.GetScreenWidth()",
      "_ww = _w.GetWidth()",
      "_L = " + Ll,
      "_R = " + Rl + " or _sw",
      "if _R - _L >= _ww:",
      "    _x = _L + (_R - _L - _ww) // 2",
      "else:",
      "    _x = max(0, min(_sw - _ww, _R - _ww))",
      "_w.SetPosition(_x, 0)"
    ]));
  }
  function toggleItemShop() {
    // Mesmo caminho do botão do minimapa: pede ao servidor a lista de itens
    // ("/itemshop open") e o servidor abre a janela. Chamar só Open() mostrava a
    // loja vazia.
    runPy(safePy([
      "import eventManager, uiItemShop",
      "eventManager.EventManager().send_event(uiItemShop.EVENT_OPEN_ITEMSHOP)"
    ]));
  }
  var xWinOpen = false;
  function applyOpenWin() {
    var openWin = hudOpenRaw || xWinOpen;
    hudOpenWindows = openWin;
    if (openWin !== prevOpenWin) {
      prevOpenWin = openWin;
      updateDragModeBtn();
      // Janelas do jogo (inventário, personagem, loja...) abrem centralizadas no celular:
      // a barra de chat e o "alvo" ficavam por cima da parte de baixo/título da janela e
      // "roubavam" os toques (botões da janela pareciam não funcionar).
      root.classList.toggle("win-open", openWin);
    }
    updateChatLogVisibility();
  }
  var XWIN_PY = [
    "import sys",
    "_o = 0",
    "try:",
    "    _m = sys.modules.get('uisidekick')",
    "    if _m is not None:",
    "        _w = _m._window.get('window')",
    "        if _w is not None and _w.IsShow():",
    "            _o = 1",
    "    _i = sys.modules.get('uisidekickinventory')",
    "    if not _o and _i is not None and _i.AnyShown():",
    "        _o = 1",
    "except Exception:",
    "    pass",
    "_s = 0",
    "_c = 0",
    "try:",
    "    _mm = getattr(getattr(self, 'interface', None), 'wndMiniMap', None)",
    "    _aw = getattr(_mm, 'AtlasWindow', None)",
    "    if _aw is not None and _aw.IsShow():",
    "        _o = 1",
    "except Exception:",
    "    pass",
    "try:",
    "    _cl = getattr(getattr(self, 'interface', None), 'wndChatLog', None)",
    "    if _cl is not None and _cl.IsShow():",
    "        _o = 1",
    "        _c = 1",
    "except Exception:",
    "    pass",
    "try:",
    "    _isw = getattr(getattr(self, 'interface', None), 'wndItemShop', None)",
    "    if _isw is not None and _isw.IsShow():",
    "        _s = 1",
    "        _o = 1",
    "except Exception:",
    "    pass",
    "open('/m2w_xwin', 'w').write('%d,%d,%d' % (_o, _s, _c))"
  ].join("\n");
  setInterval(function () {
    try {
      if (!window.Module || !Module.FS) return;
      if (fsExists("/m2w_xwin")) {
        var xr = String(Module.FS.readFile("/m2w_xwin", { encoding: "utf8" }) || "").trim().split(",");
        fsRm("/m2w_xwin");
        var v = xr[0] === "1";
        var shopNow = xr[1] === "1";
        root.classList.toggle("chatlog-open", xr[2] === "1");
        if (v !== xWinOpen) { xWinOpen = v; applyOpenWin(); }
        if (shopNow && !shopOpen) placeItemShop();
        shopOpen = shopNow;
      }
      if (!inWorld) { if (xWinOpen) { xWinOpen = false; applyOpenWin(); } return; }
      if (!fsExists("/m2w_cmd.py")) runPy(XWIN_PY);
    } catch (e) { }
  }, 700);

  // Fila de comandos travada (ninguém leu /m2w_cmd.py por vários segundos, ex.: troca de
  // tela): descarta, senão nenhum comando novo (nem o que esconde o HUD) é enviado.
  var cmdSeenAt = 0, cmdSeenMt = 0;
  setInterval(function () {
    try {
      if (!window.Module || !Module.FS || !fsExists("/m2w_cmd.py")) { cmdSeenAt = 0; return; }
      // A 1ª linha do arquivo diz quando a fila começou (runPy).
      var head = String(Module.FS.readFile("/m2w_cmd.py", { encoding: "utf8" }) || "").slice(0, 40);
      var m = /^# m2oq (\d+)/.exec(head);
      if (m && Date.now() - Number(m[1]) > 6000) fsRm("/m2w_cmd.py");
    } catch (e) { }
  }, 1000);

  // Saiu do jogo (ESC -> trocar personagem, sair, queda): o próprio jogo avisa ao
  // fechar a janela do jogo (/m2w_left_game) -> esconde o HUD na hora.
  setInterval(function () {
    try {
      if (!window.Module || !Module.FS || !fsExists("/m2w_left_game")) return;
      fsRm("/m2w_left_game");
      fsRm("/m2w_hud.json");
      lastHudRaw = "";
      root.classList.remove("chatlog-open");
      if (inWorld) setWorldMode(false);
    } catch (e) { }
  }, 250);

  var lastPhase = "";
  var lastPhaseAt = 0;
  setInterval(function () {
    try {
      if (!window.Module || !Module.FS) return;
      if (fsExists("/m2w_phase")) {
        var ph = String(Module.FS.readFile("/m2w_phase", { encoding: "utf8" }) || "").trim();
        var phT = fsMtime("/m2w_phase"), hudT = fsMtime("/m2w_hud.json");
        fsRm("/m2w_phase");
        // Resposta antiga (gravada antes do HUD atual)? Ignora, para não apagar um HUD válido.
        var stale = phT > 0 && hudT > 0 && phT < hudT;
        if (ph && !stale) {
          if (ph === "CreateCharacterWindow" && lastPhase !== ph) {
            setTimeout(function () {
              var eiC = readEditInfo();
              if (eiC && !gameKbOpen()) openKeyboardFor(eiC);
            }, 400);
          }
          if (ph === "SelectCharacterWindow" && lastPhase !== ph) {
            setTimeout(function () {
              runPy("import constInfo\nif hasattr(constInfo, '_m2oFit'):\n    try:\n        constInfo._m2oFit(self)\n    except Exception:\n        pass");
            }, 300);
          }
          lastPhase = ph;
          lastPhaseAt = Date.now();
          if (ph !== "GameWindow") {
            fsRm("/m2w_hud.json");
            lastHudRaw = "";
            if (inWorld) setWorldMode(false);
            if (loadingActive && ph === "LoginWindow") hideLoadingScreen();
          }
        }
      }
      if (!fsExists("/m2w_cmd.py")) {
        runPy("open('/m2w_phase', 'w').write(type(self).__name__)");
      }
    } catch (e) { }
  }, 1500);

  // =========================================================================
  // CANVAS TOUCH (RAF-COALESCED FOR 0ms CAMERA & UI DRAG + FLOATING JOYSTICK + PINCH ZOOM):
  // - Bottom-left movement zone floats the joystick to the thumb when no UI window is open.
  // - Two-finger pinch on #canvas smoothly zooms the camera in/out (R / F keys).
  // - When a UI window is open (or dragMode === "ui"): drag with LMB (button 0) so TitleBars & items drag smoothly!
  // - When no UI window is open (or dragMode === "cam"): drag on right half rotates camera with RMB (button 2), short tap clicks LMB!
  // =========================================================================
  // Zoom com dois dedos desativado: agora o zoom é pelo controle deslizante.
  var PINCH_ZOOM = false;
  var cam = null;
  var camRafId = 0;
  var pinchDist = 0;
  var pinchKeyHeld = 0;
  var pinchStopTimer = null;

  function stopPinchZoom() {
    if (pinchStopTimer) {
      clearTimeout(pinchStopTimer);
      pinchStopTimer = null;
    }
    if (pinchKeyHeld) {
      sendKey(pinchKeyHeld, false);
      pinchKeyHeld = 0;
    }
  }

  function shouldUseUiDrag() {
    if (dragMode === "ui") return true;
    if (dragMode === "cam") return false;
    return !!hudOpenWindows || !!hudCursorAttached;
  }

  function flushCamMove() {
    camRafId = 0;
    if (!cam || !cam.mode) return;
    if (cam.dx === 0 && cam.dy === 0) return;
    var dx = cam.dx, dy = cam.dy;
    cam.dx = 0;
    cam.dy = 0;
    if (cam.mode === "lmb") {
      mouse("mousemove", cam.x, cam.y, 0, dx, dy, 1);
    } else if (cam.mode === "rmb") {
      mouse("mousemove", cam.x, cam.y, 2, dx, dy, 2);
    }
  }

  function attachCanvas() {
    var c = canvasEl();
    if (!c) { setTimeout(attachCanvas, 300); return; }
    c.addEventListener("touchstart", function (e) {
      if (document.activeElement === chatInp) chatInp.blur();
      if (gearMenu.classList.contains("open")) gearMenu.classList.remove("open");
      if (root.classList.contains("chatlog-open") && chatHistRect && e.touches.length === 1) {
        var t0 = e.changedTouches[0];
        if (t0 && (t0.clientX < chatHistRect.left || t0.clientX > chatHistRect.right || t0.clientY > chatHistRect.bottom)) {
          e.preventDefault();
          root.classList.remove("chatlog-open");
          toggleChatHistory(true);
          return;
        }
      }
      lastCanvasTapAt = Date.now();
      e.preventDefault();
      markInputActive();

      // 1. Two-finger pinch-to-zoom when no UI window is being dragged
      if (PINCH_ZOOM && inWorld && !shouldUseUiDrag() && e.touches.length === 2 && joyId === null) {
        if (cam) {
          if (camRafId) { cancelAnimationFrame(camRafId); camRafId = 0; }
          if (cam.mode === "lmb") mouse("mouseup", cam.x, cam.y, 0, 0, 0, 0);
          else if (cam.mode === "rmb") mouse("mouseup", cam.x, cam.y, 2, 0, 0, 0);
          cam = null;
        }
        var p0 = e.touches[0], p1 = e.touches[1];
        pinchDist = Math.hypot(p0.clientX - p1.clientX, p0.clientY - p1.clientY);
        return;
      }

      var t = e.changedTouches[0];
      if (!t) return;
      var uiDrag = shouldUseUiDrag();

      // 2. Floating joystick in the bottom-left movement zone when no UI window is open
      if (inWorld && !uiDrag && joyId === null && e.touches.length === 1) {
        if (t.clientX >= 54 && t.clientX <= Math.min(220, window.innerWidth * 0.35) && t.clientY >= window.innerHeight - 165) {
          var rootLeft = 0;
          try { rootLeft = root.getBoundingClientRect().left || 0; } catch (e2) { rootLeft = 0; }
          var jLeft = Math.max(62, Math.min(180, Math.round(t.clientX - rootLeft - 51)));
          var jBottom = Math.max(8, Math.min(115, Math.round(window.innerHeight - t.clientY - 51)));
          joy.style.left = jLeft + "px";
          joy.style.bottom = jBottom + "px";
          joyFloating = true;
          refreshJoyRect();
          joyId = t.identifier;
          joyMove(t);
          return;
        }
      }

      // Toque que "quase" acertou um botão do overlay (dedo na borda): não manda nada
      // para o jogo, senão vira um clique no mapa e o personagem anda.
      if (inWorld && nearOverlayButton(t.clientX, t.clientY)) return;
      if (cam) return;
      cam = {
        id: t.identifier,
        startX: t.clientX, startY: t.clientY,
        x: t.clientX, y: t.clientY,
        dx: 0, dy: 0,
        t: Date.now(),
        moved: false,
        mode: null,
        uiDrag: uiDrag,
        right: t.clientX > window.innerWidth * 0.42
      };
      mouse("mousemove", t.clientX, t.clientY, 0, 0, 0, 0);
      // Janela aberta: segurar sem mexer = pegar o item para mover.
      if (inWorld && uiDrag && !hudCursorAttached && peekPatchOk) {
        var myCam = cam;
        myCam.lpTimer = setTimeout(function () {
          if (cam !== myCam || myCam.moved) return;
          myCam.moved = true;
          myCam.mode = "lmb";
          myCam.longPress = true;
          try { if (navigator.vibrate) navigator.vibrate(25); } catch (e3) { }
          runPyThen(peekPy(false), function () {
            if (cam !== myCam) return;
            mouse("mousemove", myCam.startX, myCam.startY, 0, 0, 0, 0);
            mouse("mousedown", myCam.startX, myCam.startY, 0, 0, 0, 1);
          });
        }, 450);
      }
    }, { passive: false });

    c.addEventListener("touchmove", function (e) {
      e.preventDefault();
      markInputActive();

      if (joyId !== null) {
        var jt = findTouch(e.changedTouches, joyId);
        if (jt) joyMove(jt);
      }

      if (pinchDist > 0 && e.touches.length === 2 && joyId === null) {
        var p0 = e.touches[0], p1 = e.touches[1];
        var newDist = Math.hypot(p0.clientX - p1.clientX, p0.clientY - p1.clientY);
        var delta = newDist - pinchDist;
        if (Math.abs(delta) >= 5) {
          pinchDist = newDist;
          var wantKey = delta > 0 ? KEYS.R : KEYS.F;
          if (pinchKeyHeld !== wantKey) {
            if (pinchKeyHeld) sendKey(pinchKeyHeld, false);
            pinchKeyHeld = wantKey;
            sendKey(pinchKeyHeld, true);
          }
          if (pinchStopTimer) clearTimeout(pinchStopTimer);
          pinchStopTimer = setTimeout(stopPinchZoom, 110);
        }
        return;
      }

      if (!cam) return;
      var t = findTouch(e.changedTouches, cam.id);
      if (!t) return;
      var dx = t.clientX - cam.x, dy = t.clientY - cam.y;
      cam.x = t.clientX;
      cam.y = t.clientY;
      var totalDist = Math.abs(t.clientX - cam.startX) + Math.abs(t.clientY - cam.startY);
      if (!cam.moved && totalDist < 8) return;

      if (!cam.moved) {
        cam.moved = true;
        if (cam.lpTimer) { clearTimeout(cam.lpTimer); cam.lpTimer = null; }
        if (cam.uiDrag) {
          cam.mode = "lmb";
          mouse("mousemove", cam.startX, cam.startY, 0, 0, 0, 0);
          mouse("mousedown", cam.startX, cam.startY, 0, 0, 0, 1);
        } else if (cam.right) {
          cam.mode = "rmb";
          mouse("mousedown", cam.startX, cam.startY, 2, 0, 0, 2);
        }
      }
      if (cam.mode === "lmb" || cam.mode === "rmb") {
        cam.dx += dx;
        cam.dy += dy;
        if (!camRafId) camRafId = requestAnimationFrame(flushCamMove);
      }
      if (cam.mode === "rmb") {
        if (Math.abs(dx) >= 3) {
          var rotKey = dx < 0 ? KEYS.Q : KEYS.E;
          sendKey(rotKey, true);
          setTimeout(function () { sendKey(rotKey, false); }, 40);
        }
        if (Math.abs(dy) >= 5) {
          var pitchKey = dy < 0 ? KEYS.T : KEYS.G;
          sendKey(pitchKey, true);
          setTimeout(function () { sendKey(pitchKey, false); }, 40);
        }
      }
    }, { passive: false });

    // Área do nome na tela de criar personagem (uiscript: textAlpha 306x~60 no
    // centro, acima dos botões Criar/Cancelar), em coordenadas lógicas do jogo.
    function tapOnCreateName(x, y) {
      try {
        var c = canvasEl();
        var r = c.getBoundingClientRect();
        var lg = (window.m2w && m2w.mobileLogical) ? m2w.mobileLogical() : { w: c.width, h: c.height };
        var lx = (x - r.left) * lg.w / r.width, ly = (y - r.top) * lg.h / r.height;
        var y0 = lg.h - lg.h * 70 / 600 - 31;
        return lx >= lg.w / 2 - 170 && lx <= lg.w / 2 + 170 && ly >= y0 - 12 && ly <= y0 + 34;
      } catch (e) { return false; }
    }

    function nearOverlayButton(x, y) {
      var M = 12;
      var els = root.querySelectorAll(".rcol button, .qslot, .atk-btn, .pickup-btn, .shop-btn, .tl-side button, .hud-tl, .zoom-bar, .chat-bar");
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (!el.offsetParent) continue;
        var cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (x >= r.left - M && x <= r.right + M && y >= r.top - M && y <= r.bottom + M) return true;
      }
      return false;
    }

    function fireClick(btn, x, y) {
      var seqAtTap = lastEditSeq;
      mouse("mousemove", x, y, 0, 0, 0, 0);
      if (shiftActive) sendKey(16, true);
      setTimeout(function () {
        mouse("mousedown", x, y, btn, 0, 0, btn === 2 ? 2 : 1);
        setTimeout(function () {
          mouse("mouseup", x, y, btn, 0, 0, 0);
          if (shiftActive) {
            sendKey(16, false);
            setShift(false);
          }
          // Depois do toque: se ele caiu num campo de texto, o jogo grava um foco novo
          // (seq diferente) -> abre o teclado. Se caiu fora, fecha o teclado.
          setTimeout(function () {
            try {
              var ei = readEditInfo();
              if (ei && (Number(ei.seq) || 1) !== seqAtTap) {
                handleEditInfo(ei, true);
              } else if (ei && lastPhase === "CreateCharacterWindow" && tapOnCreateName(x, y)) {
                // O campo do nome já tem foco (o toque não gera foco novo): abre o teclado.
                openKeyboardFor(ei);
              } else if (Date.now() >= keepKbUntil) {
                closeKeyboard();
              }
            } catch (e) { }
          }, 140);
        }, 45);
      }, 15);
    }

    function checkDropOnQuickSlot(x, y) {
      for (var i = 0; i < slotEls.length; i++) {
        var r = slotEls[i].getBoundingClientRect();
        if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4) {
          bindOrUseSlot(QUICK_SLOTS[i].slot);
          return true;
        }
      }
      return false;
    }

    function end(e) {
      e.preventDefault();
      if (joyId !== null && findTouch(e.changedTouches, joyId)) {
        joyEnd();
      }
      if (pinchDist > 0 && (!e.touches || e.touches.length < 2)) {
        stopPinchZoom();
        pinchDist = 0;
      }
      if (!cam) return;
      var t = findTouch(e.changedTouches, cam.id);
      if (!t) return;
      if (cam.lpTimer) { clearTimeout(cam.lpTimer); cam.lpTimer = null; }
      if (camRafId) {
        cancelAnimationFrame(camRafId);
        flushCamMove();
      }
      if (cam.mode === "lmb") {
        if (!checkDropOnQuickSlot(t.clientX, t.clientY)) {
          mouse("mousemove", t.clientX, t.clientY, 0, 0, 0, 1);
          mouse("mouseup", t.clientX, t.clientY, 0, 0, 0, 0);
        }
      } else if (cam.mode === "rmb") {
        mouse("mouseup", t.clientX, t.clientY, 2, 0, 0, 0);
      } else if (!cam.moved && Date.now() - cam.t < 650) {
        var tx = t.clientX, ty = t.clientY;
        var now = Date.now();
        var dist = Math.hypot(tx - lastTap.x, ty - lastTap.y);
        var isDoubleTap = (now - lastTap.t < 280) && (dist < 25);
        if (isDoubleTap) {
          lastTap = { x: 0, y: 0, t: 0 };
          fireClick(2, tx, ty);
        } else {
          lastTap = { x: tx, y: ty, t: now };
          var btnToUse = (clickMode === "ppm") ? 2 : 0;
          if (btnToUse === 0 && inWorld && cam.uiDrag && !hudCursorAttached && peekPatchOk) {
            // Toque curto com janela aberta: clica normalmente (botões, abas funcionam),
            // mas se cair num item ele NÃO é pego - só aparece a descrição.
            runPyThen(peekPy(true), function () { fireClick(0, tx, ty); });
          } else {
            fireClick(btnToUse, tx, ty);
          }
        }
      }
      cam = null;
    }
    c.addEventListener("touchend", end, { passive: false });
    c.addEventListener("touchcancel", end, { passive: false });
  }
  attachCanvas();

  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  document.addEventListener("touchmove", function (e) { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  window.m2o = { runPy: runPy, sendKey: sendKey, typeText: typeText, setWorldMode: setWorldMode };
})();
