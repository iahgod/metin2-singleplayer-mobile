// =============================================================================
//  METIN2 FULLSCREEN 3D HLTV SPECTATOR HUD (for client.html?replay=<war_id>)
//  Powered by 100% Authentic Metin2 C++ WebGL Engine (client.wasm + replay3d.py)
// =============================================================================
(function () {
  var params = new URLSearchParams(window.location.search);
  var replayWarId = params.get('replay');
  var liveWarMode = params.get('live_war') === '1';
  if (!replayWarId && !liveWarMode) return;

  var warNum = params.get('war_num') || replayWarId || '1';
  var isEmbedded = params.get('embed') === '1' || (window.self !== window.top);

  var CLASSES = {
    0: { name: 'Guerreiro', icon: '⚔️', weapon: 'Espada de duas mãos / Aço', color: '#f59e0b' },
    1: { name: 'Ninja',    icon: '🗡️', weapon: 'Adagas / Arco',         color: '#10b981' },
    2: { name: 'Sura',     icon: '🔥', weapon: 'Espada / Magia', color: '#a855f7' },
    3: { name: 'Xamã',     icon: '🔔', weapon: 'Sino / Leque',       color: '#ec4899' }
  };

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtMMSS(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // Hide default #status text so our E-Sports progress banner handles status cleanly
  var origStatusEl = document.getElementById('status');
  if (origStatusEl) origStatusEl.style.display = 'none';

  // Build Fullscreen Spectator Overlay DOM over #canvas (real client.wasm)
  var root = document.createElement('div');
  root.id = 'hltvFullscreenRoot';
  root.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;background:transparent;color:#e8d9b8;' +
    'font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;z-index:25;overflow:hidden;user-select:none;pointer-events:none;';

  root.innerHTML =
    '<style>' +
      '#hltvFullscreenRoot * { box-sizing: border-box; }' +
      '.h-panel { pointer-events: auto;' + (isEmbedded ? ' display: none !important;' : '') + ' }' +
      '.h-btn { display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:7px;font-weight:700;font-size:12px;' +
      '  border:1px solid #4a3a28;background:rgba(24,18,13,0.92);color:#e2cfa6;cursor:pointer;text-decoration:none;pointer-events:auto; }' +
      '.h-btn:hover { border-color:#d4ac54;color:#fff; }' +
      '.h-btn.active { background:linear-gradient(180deg,#d4ac54 0%,#9e7624 100%);color:#140f08;border-color:#fde68a; }' +
      '.h-roster-item { padding:5px 7px;border-radius:6px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);' +
      '  margin-bottom:4px;cursor:pointer;transition:all 0.12s;font-size:11.5px; }' +
      '.h-roster-item:hover { background:rgba(212,172,84,0.16);border-color:#d4ac54; }' +
      '.h-roster-item.selected { background:rgba(212,172,84,0.28);border-color:#facc15; }' +
      '.h-roster-item.dead { opacity:0.38;filter:grayscale(0.85); }' +
      '.h-kf-item { padding:5px 8px;border-radius:6px;background:rgba(255,255,255,0.04);border-left:3px solid #ef4444;margin-bottom:4px;cursor:pointer;font-size:11px; }' +
      '.h-kf-item.s2 { border-left-color:#3b82f6; }' +
      '.h-kf-item:hover { background:rgba(212,172,84,0.18); }' +
    '</style>' +

    '<div id="hltvLabels3D" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5"></div>' +

    '<!-- Engine 3D Loading Banner -->' +
    '<div id="hEngineLoader" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(500px,92vw);' +
    '  background:rgba(12,9,7,0.94);border:1px solid #d4ac54;border-radius:14px;padding:18px 22px;text-align:center;z-index:30;' +
    '  box-shadow:0 18px 50px rgba(0,0,0,0.9);pointer-events:auto;transition:opacity 0.35s">' +
      '<div style="font-size:15px;font-weight:900;color:#fde68a;margin-bottom:6px">⚔️ Metin2 HLTV 3D Replay (motor do jogo .gr2)</div>' +
      '<div id="hLoaderStage" style="font-size:12px;color:#d6c5a3;margin-bottom:10px;word-break:break-word">Inicjalizacja silnika WebGL C++ (client.wasm)...</div>' +
      '<div style="height:8px;background:#231b12;border:1px solid #4a3a26;border-radius:999px;overflow:hidden">' +
        '<div id="hLoaderBar" style="width:12%;height:100%;background:linear-gradient(90deg,#b45309,#facc15);transition:width 0.2s"></div>' +
      '</div>' +
      '<div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:12px">' +
        '<button id="hBtnCopyDiag" class="h-btn" type="button" style="font-size:11.5px;padding:5px 10px;border-color:#d4ac54">📋 Copiar log completo de erros</button>' +
        '<button id="hBtnHideLoader" class="h-btn" type="button" style="font-size:11.5px;padding:5px 10px">👁️ Ocultar janela e mostrar o 3D</button>' +
      '</div>' +
    '</div>' +

    '<!-- Always-available floating 3D diagnostic button -->' +
    '<div style="position:absolute;top:10px;right:12px;z-index:35;display:flex;gap:6px;pointer-events:auto">' +
      '<button id="hBtnCornerDiag" class="h-btn" type="button" title="Copiar log de diagnóstico 3D (Shift+clique = mostrar/ocultar janela de carregamento)" style="font-size:11px;padding:4px 9px;background:rgba(12,9,7,0.88);border-color:#755935">🐞 Log 3D</button>' +
    '</div>' +

    '<!-- Top E-Sports Scoreboard -->' +
    '<div class="h-panel" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);width:min(760px,92vw);background:rgba(12,9,7,0.92);' +
    '  border:1px solid #85683a;border-radius:12px;padding:8px 18px 10px;z-index:20;box-shadow:0 12px 34px rgba(0,0,0,0.85)">' +
      '<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px">' +
        '<div>' +
          '<div id="hG1" style="font-size:17px;font-weight:900;color:#f87171">🔴 ChaosKings</div>' +
          '<div id="hAlive1" style="font-size:11px;color:#b8a688">Vivos: 20 / 20</div>' +
        '</div>' +
        '<div id="hScore" style="font-size:26px;font-weight:900;color:#facc15;background:rgba(0,0,0,0.65);border:1px solid #755935;padding:3px 18px;border-radius:9px;font-variant-numeric:tabular-nums">0 : 0</div>' +
        '<div style="text-align:right">' +
          '<div id="hG2" style="font-size:17px;font-weight:900;color:#60a5fa">SilentGuard 🔵</div>' +
          '<div id="hAlive2" style="font-size:11px;color:#b8a688">Vivos: 20 / 20</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:6px;height:8px;background:#1e3a8a;border:1px solid #52402b;border-radius:999px;overflow:hidden;display:flex">' +
        '<div id="hTug1" style="width:50%;height:100%;background:linear-gradient(90deg,#991b1b,#ef4444,#fca5a5);transition:width 0.15s"></div>' +
        '<div style="flex:1;height:100%;background:linear-gradient(90deg,#93c5fd,#3b82f6,#1d4ed8)"></div>' +
      '</div>' +
    '</div>' +

    '<!-- Left Team Roster (ChaosKings) -->' +
    '<div class="h-panel" style="position:absolute;top:105px;left:12px;bottom:82px;width:210px;background:rgba(10,8,6,0.88);border:1px solid #3d2f20;border-radius:11px;padding:9px;display:flex;flex-direction:column;z-index:20">' +
      '<div id="hRosterHead1" style="font-size:11.5px;font-weight:800;color:#f87171;text-transform:uppercase;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">🔴 ChaosKings (clique = seguir)</div>' +
      '<div id="hRoster1" style="flex:1;overflow-y:auto;padding-right:2px"></div>' +
    '</div>' +

    '<!-- Right Team Roster (SilentGuard) + Kill-Feed -->' +
    '<div class="h-panel" style="position:absolute;top:105px;right:12px;bottom:82px;width:240px;display:flex;flex-direction:column;gap:8px;z-index:20">' +
      '<div style="flex:1;background:rgba(10,8,6,0.88);border:1px solid #3d2f20;border-radius:11px;padding:9px;display:flex;flex-direction:column;min-height:0">' +
        '<div id="hRosterHead2" style="font-size:11.5px;font-weight:800;color:#60a5fa;text-transform:uppercase;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">🔵 SilentGuard (clique = seguir)</div>' +
        '<div id="hRoster2" style="flex:1;overflow-y:auto;padding-right:2px"></div>' +
      '</div>' +
      '<div style="height:175px;background:rgba(10,8,6,0.88);border:1px solid #3d2f20;border-radius:11px;padding:8px;display:flex;flex-direction:column">' +
        '<div style="font-size:11px;font-weight:800;color:#d4ac54;text-transform:uppercase;margin-bottom:5px">💀 Dziennik Starcia (Kill-Feed)</div>' +
        '<div id="hKfList" style="flex:1;overflow-y:auto"></div>' +
      '</div>' +
    '</div>' +

    '<!-- Bottom-Left PiP 2D Tactical Minimap -->' +
    '<div class="h-panel" style="position:absolute;bottom:84px;left:234px;width:154px;height:154px;border:2px solid #d4ac54;border-radius:11px;overflow:hidden;background:#080604;z-index:20;box-shadow:0 10px 28px rgba(0,0,0,0.9)">' +
      '<canvas id="hPipCanvas" width="154" height="154" style="width:100%;height:100%;display:block;cursor:pointer" title="Clique no radar para mover a câmera 3D"></canvas>' +
      '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(10,8,6,0.85);font-size:9.5px;font-weight:800;color:#f3d287;text-align:center;padding:2px 0">🗺️ RADAR TAKTYCZNY 2D</div>' +
    '</div>' +

    '<!-- Bottom Controls & Timeline Bar -->' +
    '<div class="h-panel" style="position:absolute;left:12px;right:12px;bottom:12px;height:60px;background:rgba(12,9,7,0.94);border:1px solid #523f29;border-radius:12px;padding:0 14px;display:flex;align-items:center;gap:10px;z-index:20">' +
      '<a href="/wojny.html" class="h-btn">← Crônica 2D/3D</a>' +
      '<button id="hPlayBtn" class="h-btn active" type="button">⏸️ Pauza</button>' +
      '<input id="hScrubber" type="range" min="0" max="100" value="0" step="0.05" style="flex:1;accent-color:#d4ac54;cursor:pointer">' +
      '<span id="hTimeLbl" style="font-weight:800;color:#f3d287;min-width:95px;text-align:center;font-variant-numeric:tabular-nums">00:00 / 05:00</span>' +
      '<div style="display:flex;gap:4px">' +
        '<button class="h-btn h-cam active" data-cam="director" type="button">🎬 Auto-Director</button>' +
        '<button class="h-btn h-cam" data-cam="follow" type="button">👁️ Seguir POV</button>' +
        '<button class="h-btn h-cam" data-cam="free" type="button">🦅 Free-Cam</button>' +
        '<button id="hBtnLabelMode" class="h-btn" type="button" title="Alternar estilo dos nomes no 3D">🏷️ Nomes: compactos</button>' +
      '</div>' +
      '<div style="display:flex;gap:4px">' +
        '<button class="h-btn h-spd" data-spd="0.5" type="button">0.5x</button>' +
        '<button class="h-btn h-spd active" data-spd="1" type="button">1x</button>' +
        '<button class="h-btn h-spd" data-spd="2" type="button">2x</button>' +
        '<button class="h-btn h-spd" data-spd="4" type="button">4x</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(root);

  window.__m2wJsErrors = window.__m2wJsErrors || [];
  function pushJsErr(msg) {
    try {
      var s = String(msg || '');
      if (/SpeedTreeRT Error|UNKNOWN NAME/.test(s)) return;
      window.__m2wJsErrors.push(new Date().toISOString().slice(11, 19) + ' ' + s);
      if (window.__m2wJsErrors.length > 40) window.__m2wJsErrors.shift();
    } catch (e) {}
  }
  window.addEventListener('error', function (ev) {
    pushJsErr('[window.onerror] ' + (ev && (ev.message || ev.error) || 'unknown') + (ev && ev.filename ? ' @ ' + ev.filename + ':' + ev.lineno : ''));
  });
  window.addEventListener('unhandledrejection', function (ev) {
    pushJsErr('[unhandledrejection] ' + (ev && ev.reason));
  });
  var origConsoleError = console.error;
  console.error = function () {
    try {
      pushJsErr(Array.prototype.map.call(arguments, function (a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); }).join(' '));
    } catch (e) {}
    return origConsoleError.apply(console, arguments);
  };

  var st = {
    open: true,
    replay: null,
    replayRawJson: null,
    injectedToWasm: false,
    wasmReady: false,
    manualHiddenLoader: false,
    playing: true,
    speed: 1,
    cursor: 0,
    lastTick: performance.now(),
    camMode: 'director',
    labelMode: 'compact',
    followPid: null,
    camX: 57.0,
    camY: 41.4,
    camZ: 0.0,
    camRot: 25.0,
    camPitch: 26.0,
    camDist: 2050.0,
    lastRosterUpdate: 0,
    lastKfCount: -1,
    projMap: {},
    mapImg: null
  };

  var pipCanvas = document.getElementById('hPipCanvas');
  var pipCtx = pipCanvas.getContext('2d');
  var scrubber = document.getElementById('hScrubber');
  var playBtn = document.getElementById('hPlayBtn');
  var btnLabelMode = document.getElementById('hBtnLabelMode');
  var labelsEl = document.getElementById('hltvLabels3D');
  var loaderBox = document.getElementById('hEngineLoader');
  var loaderStage = document.getElementById('hLoaderStage');
  var loaderBar = document.getElementById('hLoaderBar');
  var btnCopyDiag = document.getElementById('hBtnCopyDiag');
  var btnHideLoader = document.getElementById('hBtnHideLoader');
  var btnCornerDiag = document.getElementById('hBtnCornerDiag');

  function getAnyWasmFs() {
    try {
      var m = window.Module;
      if (m && m.FS && typeof m.FS.analyzePath === 'function' && typeof m.FS.readFile === 'function') {
        return m.FS;
      }
    } catch (e) {}
    return null;
  }

  function safeReadFsText(fs, path, maxLen) {
    if (!fs) return '<FS not initialized>';
    try {
      if (!fs.analyzePath(path).exists) return '<missing>';
      var txt = fs.readFile(path, { encoding: 'utf8' }) || '';
      if (maxLen && txt.length > maxLen) {
        return '...(truncated ' + (txt.length - maxLen) + ' chars)...\n' + txt.slice(-maxLen);
      }
      return txt || '<empty>';
    } catch (e) {
      return '<error: ' + e.message + '>';
    }
  }

  function buildFullDiagReport() {
    var fs = getAnyWasmFs();
    var m2w = window.m2w || {};
    var lines = [];
    lines.push('=== METIN2 HLTV 3D REPLAY DIAGNOSTIC REPORT ===');
    lines.push('Time: ' + new Date().toISOString());
    lines.push('URL: ' + window.location.href);
    lines.push('HUD State: ' + JSON.stringify({
      warId: replayWarId,
      hasReplayJson: !!st.replayRawJson,
      replayFrames: st.replay && st.replay.frames ? st.replay.frames.length : 0,
      injectedToWasm: st.injectedToWasm,
      wasmReady: st.wasmReady,
      cursor: Math.round(st.cursor * 100) / 100,
      camX: Math.round(st.camX * 10) / 10,
      camY: Math.round(st.camY * 10) / 10,
      camZ: Math.round((st.camZ || 0) * 10) / 10,
      projectedActors: Object.keys(st.projMap || {}).length,
      loaderText: loaderStage ? loaderStage.textContent : ''
    }));
    lines.push('m2w Preload/Download: ' + JSON.stringify({
      prefetch: m2w.prefetch || null,
      download: m2w.download || null
    }));
    if (fs) {
      var filesCheck = ['/introLogin.py', '/replay3d.py', '/m2w_replay_init.json', '/replay_data.json', '/m2w_cmd.py', '/m2w_replay_status.json', '/m2w_replay_state.json', '/syserr.txt', '/stdout.txt'];
      var existsMap = {};
      for (var i = 0; i < filesCheck.length; i++) {
        try { existsMap[filesCheck[i]] = !!fs.analyzePath(filesCheck[i]).exists; } catch (e) { existsMap[filesCheck[i]] = false; }
      }
      lines.push('MEMFS Files Exists: ' + JSON.stringify(existsMap));
      lines.push('--- /m2w_replay_status.json ---');
      lines.push(safeReadFsText(fs, '/m2w_replay_status.json', 2000));
      lines.push('--- /m2w_replay_state.json ---');
      lines.push(safeReadFsText(fs, '/m2w_replay_state.json', 2000));
      lines.push('--- /syserr.txt ---');
      lines.push(safeReadFsText(fs, '/syserr.txt', 4000));
      lines.push('--- /stdout.txt ---');
      lines.push(safeReadFsText(fs, '/stdout.txt', 2500));
    } else {
      lines.push('MEMFS: Module.FS not available yet');
    }
    lines.push('--- JS Console Errors (last ' + (window.__m2wJsErrors ? window.__m2wJsErrors.length : 0) + ') ---');
    lines.push((window.__m2wJsErrors && window.__m2wJsErrors.length) ? window.__m2wJsErrors.join('\n') : '<none>');
    return lines.join('\n');
  }

  function copyDiagToClipboard(btnEl) {
    var report = buildFullDiagReport();
    function flashOk() {
      if (!btnEl) return;
      var orig = btnEl.textContent;
      btnEl.textContent = '✅ Log copiado!';
      setTimeout(function () { btnEl.textContent = orig; }, 2200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report).then(flashOk).catch(function () {
        fallbackCopy(report, flashOk);
      });
    } else {
      fallbackCopy(report, flashOk);
    }
  }

  function fallbackCopy(text, cb) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (cb) cb();
    } catch (e) {}
  }

  function hideLoaderBanner() {
    st.manualHiddenLoader = true;
    if (loaderBox) {
      loaderBox.style.opacity = '0';
      setTimeout(function () { loaderBox.style.display = 'none'; }, 250);
    }
  }

  if (btnCopyDiag) {
    btnCopyDiag.addEventListener('click', function () { copyDiagToClipboard(btnCopyDiag); });
  }
  if (btnHideLoader) {
    btnHideLoader.addEventListener('click', function () { hideLoaderBanner(); });
  }
  if (btnCornerDiag) {
    btnCornerDiag.addEventListener('click', function (ev) {
      if (ev.shiftKey && loaderBox) {
        if (loaderBox.style.display === 'none') {
          st.manualHiddenLoader = false;
          loaderBox.style.display = 'block';
          loaderBox.style.opacity = '1';
        } else {
          hideLoaderBanner();
        }
        return;
      }
      copyDiagToClipboard(btnCornerDiag);
    });
  }

  function getReadyWasmFs() {
    try {
      var m = window.Module;
      if (!m || !m.FS) return null;
      var fs = m.FS;
      if (typeof fs.writeFile !== 'function' || typeof fs.analyzePath !== 'function') return null;
      // CRITICAL: Never call FS.open / FS.writeFile before FS.init() creates stdin(0), stdout(1), stderr(2)
      // and client.data unpacks /introLogin.py, otherwise FS.open steals fd=0..3 and aborts createStandardStreams!
      if (!fs.streams || !fs.streams[0] || !fs.streams[1] || !fs.streams[2]) return null;
      var check = fs.analyzePath('/introLogin.py');
      if (!check || !check.exists) return null;
      return fs;
    } catch (e) {
      return null;
    }
  }

  function sendCtrlToWasm(ctrlObj) {
    try {
      var fs = getReadyWasmFs();
      if (!fs) return;
      fs.writeFile('/m2w_replay_ctrl.json', JSON.stringify(ctrlObj));
    } catch (e) {}
  }

  window.addEventListener('message', function (ev) {
    if (!ev.data) return;
    if (ev.data.type === 'm2_replay_data' && ev.data.data) {
      applyReplayData(ev.data.data);
      return;
    }
    if (ev.data.type === 'm2_replay_ctrl' && ev.data.payload) {
      var p = ev.data.payload;
      if (p.playing !== undefined) st.playing = !!p.playing;
      if (p.speed !== undefined) st.speed = parseFloat(p.speed) || 1;
      if (p.seek !== undefined) st.cursor = parseFloat(p.seek) || 0;
      if (p.cam_mode) st.camMode = p.cam_mode;
      if (p.follow_pid !== undefined) st.followPid = p.follow_pid;
      sendCtrlToWasm(p);
    }
  });

  playBtn.addEventListener('click', function () {
    if (!st.replay) return;
    if (st.cursor >= st.replay.frames.length - 1) {
      st.cursor = 0;
      sendCtrlToWasm({ seek: 0, playing: true });
    }
    st.playing = !st.playing;
    st.lastTick = performance.now();
    playBtn.textContent = st.playing ? '⏸️ Pausar' : '▶️ Reproduzir';
    sendCtrlToWasm({ playing: st.playing });
  });

  scrubber.addEventListener('input', function () {
    st.cursor = parseFloat(this.value) || 0;
    st.lastKfCount = -1;
    sendCtrlToWasm({ seek: st.cursor });
  });

  document.querySelectorAll('.h-cam').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.h-cam').forEach(function (x) { x.classList.remove('active'); });
      this.classList.add('active');
      st.camMode = this.dataset.cam;
      sendCtrlToWasm({ cam_mode: st.camMode });
    });
  });

  document.querySelectorAll('.h-spd').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.h-spd').forEach(function (x) { x.classList.remove('active'); });
      this.classList.add('active');
      st.speed = parseFloat(this.dataset.spd) || 1;
      sendCtrlToWasm({ speed: st.speed });
    });
  });

  if (btnLabelMode) {
    btnLabelMode.addEventListener('click', function () {
      if (st.labelMode === 'compact') {
        st.labelMode = 'full';
        btnLabelMode.textContent = '🏷️ Nomes: completos';
      } else if (st.labelMode === 'full') {
        st.labelMode = 'bars';
        btnLabelMode.textContent = '🏷️ Nicki: Tylko Paski HP';
      } else {
        st.labelMode = 'compact';
        btnLabelMode.textContent = '🏷️ Nomes: compactos';
      }
    });
  }

  window._hFollowUnit = function (pid) {
    st.camMode = 'follow';
    st.followPid = pid;
    document.querySelectorAll('.h-cam').forEach(function (x) {
      x.classList.toggle('active', x.dataset.cam === 'follow');
    });
    sendCtrlToWasm({ cam_mode: 'follow', follow_pid: pid });
  };

  window._hSeekKill = function (sec, kx, ky) {
    if (!st.replay) return;
    var frames = st.replay.frames;
    var idx = 0;
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].t <= sec) idx = i;
      else break;
    }
    st.cursor = idx;
    scrubber.value = idx;
    st.lastKfCount = -1;
    var payload = { seek: idx };
    if (kx && ky) {
      st.camMode = 'free';
      document.querySelectorAll('.h-cam').forEach(function (x) {
        x.classList.toggle('active', x.dataset.cam === 'free');
      });
      payload.cam_mode = 'free';
      payload.cam_pan_x = kx * 512.0;
      payload.cam_pan_y = ky * 512.0;
    }
    sendCtrlToWasm(payload);
  };

  // Click on 2D Radar to pan 3D camera
  pipCanvas.addEventListener('click', function (ev) {
    var rect = pipCanvas.getBoundingClientRect();
    var px = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 100.0;
    var py = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * 100.0;
    st.camMode = 'free';
    st.camX = px;
    st.camY = py;
    document.querySelectorAll('.h-cam').forEach(function (x) {
      x.classList.toggle('active', x.dataset.cam === 'free');
    });
    sendCtrlToWasm({ cam_mode: 'free', cam_pan_x: px * 512.0, cam_pan_y: py * 512.0 });
  });

  // Mouse Orbit / Zoom on #canvas (real 3D WebGL engine)
  var gameCanvas = document.getElementById('canvas');
  if (gameCanvas) {
    var dragging = false, dragBtn = 0, lastX = 0, lastY = 0;
    gameCanvas.addEventListener('mousedown', function (e) {
      dragging = true;
      dragBtn = e.button;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (dragBtn === 2 || e.shiftKey) {
        st.camMode = 'free';
        document.querySelectorAll('.h-cam').forEach(function (x) {
          x.classList.toggle('active', x.dataset.cam === 'free');
        });
        sendCtrlToWasm({ cam_delta_x: -dx * 16.0, cam_delta_y: -dy * 16.0 });
      } else {
        st.camRot = (st.camRot - dx * 0.45) % 360;
        st.camPitch = Math.max(10, Math.min(75, st.camPitch + dy * 0.35));
        sendCtrlToWasm({ cam_rot: st.camRot, cam_pitch: st.camPitch });
      }
    });
    window.addEventListener('mouseup', function () { dragging = false; });
    gameCanvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      st.camDist = Math.max(700, Math.min(4800, st.camDist + (e.deltaY > 0 ? 180 : -180)));
      sendCtrlToWasm({ cam_dist: st.camDist });
    }, { passive: false });
  }

  function renderRosters(units) {
    var r1 = [], r2 = [];
    units.forEach(function (u) {
      if (u.side === 1) r1.push(u);
      else r2.push(u);
    });
    r1.sort(function (a, b) { return (b.leader ? 1000 : 0) + b.level - ((a.leader ? 1000 : 0) + a.level); });
    r2.sort(function (a, b) { return (b.leader ? 1000 : 0) + b.level - ((a.leader ? 1000 : 0) + a.level); });

    function htmlFor(arr) {
      return arr.map(function (u) {
        var c = CLASSES[u.cls] || CLASSES[0];
        var sel = (st.camMode === 'follow' && st.followPid === u.pid) ? ' selected' : '';
        var dead = u.hp <= 2 ? ' dead' : '';
        var col = u.hp > 55 ? '#22c55e' : (u.hp > 25 ? '#eab308' : '#ef4444');
        return '<div class="h-roster-item' + sel + dead + '" onclick="window._hFollowUnit(' + u.pid + ')">' +
          '<div style="display:flex;justify-content:space-between;font-weight:700;color:#f1e3c6">' +
            '<span>' + c.icon + ' ' + (u.leader ? '👑 ' : '') + esc(u.name) + '</span>' +
            '<span style="color:#d4ac54;font-size:10px">Lv.' + u.level + '</span>' +
          '</div>' +
          '<div style="height:4px;background:#000;border-radius:3px;margin-top:3px;overflow:hidden">' +
            '<div style="height:100%;width:' + Math.max(0, Math.min(100, u.hp)).toFixed(0) + '%;background:' + col + '"></div>' +
          '</div>' +
        '</div>';
      }).join('');
    }
    document.getElementById('hRoster1').innerHTML = htmlFor(r1);
    document.getElementById('hRoster2').innerHTML = htmlFor(r2);
  }

  function renderKillFeed(events, curT) {
    var past = [];
    for (var i = 0; i < events.length; i++) {
      if (events[i].t <= curT) past.push(events[i]);
    }
    if (past.length === st.lastKfCount) return;
    st.lastKfCount = past.length;
    var el = document.getElementById('hKfList');
    if (!past.length) {
      el.innerHTML = '<div style="color:#8c7c68;font-size:11px;text-align:center;padding:18px 4px">Starcie w toku...</div>';
      return;
    }
    var recent = past.slice(-25).reverse();
    el.innerHTML = recent.map(function (ev) {
      var kSide = ev.killer_side || 1;
      var kCol = kSide === 1 ? '#f87171' : '#60a5fa';
      var vCol = kSide === 1 ? '#60a5fa' : '#f87171';
      var kCls = CLASSES[(ev.killer_job || 0) % 4] || CLASSES[0];
      var vCls = CLASSES[(ev.victim_job || 0) % 4] || CLASSES[0];
      return '<div class="h-kf-item ' + (kSide === 2 ? 's2' : '') + '" onclick="window._hSeekKill(' + ev.t + ',' + (ev.x || 50) + ',' + (ev.y || 50) + ')">' +
        '<div style="display:flex;justify-content:space-between;color:#9b8b74;font-size:9.5px">' +
          '<span>⏱️ ' + fmtMMSS(ev.t) + '</span>' +
          '<span style="color:#facc15;font-weight:800">' + (ev.skill ? '💥 SKILL' : '⚔️ +' + (ev.pts || 50) + ' pts') + '</span>' +
        '</div>' +
        '<div style="margin-top:2px">' +
          '<strong style="color:' + kCol + '">' + kCls.icon + ' ' + esc(ev.killer) + '</strong> ' +
          '<span style="color:#d4ac54">➔</span> ' +
          '<strong style="color:' + vCol + '">' + vCls.icon + ' ' + esc(ev.victim) + '</strong>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderPipMinimap(units) {
    var w = pipCanvas.width, h = pipCanvas.height;
    pipCtx.clearRect(0, 0, w, h);
    if (st.mapImg && st.mapImg.complete && st.mapImg.naturalWidth > 0) {
      pipCtx.drawImage(st.mapImg, 0, 0, w, h);
      pipCtx.fillStyle = 'rgba(8,6,4,0.32)';
      pipCtx.fillRect(0, 0, w, h);
    } else {
      pipCtx.fillStyle = '#121915';
      pipCtx.fillRect(0, 0, w, h);
    }
    pipCtx.strokeStyle = 'rgba(250,204,21,0.55)';
    pipCtx.lineWidth = 1;
    pipCtx.strokeRect((st.camX / 100) * w - 20, (st.camY / 100) * h - 14, 40, 28);

    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.hp <= 0) continue;
      var ux = (u.x / 100) * w;
      var uy = (u.y / 100) * h;
      pipCtx.beginPath();
      pipCtx.arc(ux, uy, u.leader ? 4 : 2.6, 0, Math.PI * 2);
      pipCtx.fillStyle = u.side === 1 ? '#ef4444' : '#3b82f6';
      pipCtx.fill();
      if (u.leader) {
        pipCtx.strokeStyle = '#facc15';
        pipCtx.lineWidth = 1.2;
        pipCtx.stroke();
      }
    }
  }

  function render3DProjectedLabels(units, curT) {
    if (!st.wasmReady || !labelsEl) return;
    var hotPids = {};
    var evs = (st.replay && st.replay.events) || [];
    for (var k = 0; k < evs.length; k++) {
      var dtEv = evs[k].t - (curT || 0);
      if (dtEv >= -2.5 && dtEv <= 3.5) {
        if (evs[k].killer_pid) hotPids[evs[k].killer_pid] = true;
        if (evs[k].victim_pid) hotPids[evs[k].victim_pid] = true;
      }
    }

    var html = [];
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.hp <= 0.5 && st.labelMode !== 'full') continue;
      var p = st.projMap[u.pid];
      if (!p) continue;
      var px = p[0], py = p[1];
      if (px < 180 || px > window.innerWidth - 210 || py < 70 || py > window.innerHeight - 65) continue;

      var isPriority = !!u.leader || (st.camMode === 'follow' && st.followPid === u.pid) || !!hotPids[u.pid];
      var showFullText = (st.labelMode === 'full') || (st.labelMode === 'compact' && isPriority);
      var hpPct = Math.max(0, Math.min(100, u.hp)).toFixed(0);
      var sideBarCol = u.side === 1 ? '#ef4444' : '#3b82f6';

      if (!showFullText) {
        // Sleek Metin2-style thin HP bar only (does not obscure 3D character models!)
        html.push(
          '<div style="position:absolute;left:' + px + 'px;top:' + py + 'px;transform:translate(-50%,-100%);width:26px;height:3px;background:rgba(0,0,0,0.75);border:1px solid rgba(0,0,0,0.9);border-radius:2px;overflow:hidden">' +
            '<div style="height:100%;width:' + hpPct + '%;background:' + sideBarCol + '"></div>' +
          '</div>'
        );
        continue;
      }

      var nameCol = u.side === 1 ? '#fca5a5' : '#93c5fd';
      var hpCol = u.hp > 55 ? '#22c55e' : (u.hp > 25 ? '#eab308' : '#ef4444');
      var deadStyle = u.hp <= 1 ? 'opacity:0.32;' : '';
      var zIdx = isPriority ? 8 : 5;
      html.push(
        '<div style="position:absolute;left:' + px + 'px;top:' + py + 'px;transform:translate(-50%,-100%);z-index:' + zIdx + ';' + deadStyle +
        'background:rgba(10,8,6,0.58);border:1px solid ' + (u.leader ? 'rgba(250,204,21,0.75)' : 'rgba(255,255,255,0.14)') + ';' +
        'border-radius:4px;padding:1px 5px;white-space:nowrap;font-size:9.5px;line-height:1.15;font-weight:800;color:' + nameCol + ';text-shadow:0 1px 2px #000,0 0 4px #000">' +
          '<div>' + (u.leader ? '👑 ' : '') + esc(u.name) + ' <span style="color:#d4ac54;font-size:8.5px;font-weight:700">Lv.' + u.level + '</span></div>' +
          '<div style="height:2px;background:rgba(0,0,0,0.85);border-radius:1px;margin-top:1px;overflow:hidden">' +
            '<div style="height:100%;width:' + hpPct + '%;background:' + hpCol + '"></div>' +
          '</div>' +
        '</div>'
      );
    }
    labelsEl.innerHTML = html.join('');
  }

  function readTailFromFs(fs, paths) {
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      try {
        if (fs.analyzePath(p).exists) {
          var txt = fs.readFile(p, { encoding: 'utf8' }) || '';
          var lines = txt.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) {
            return l && !/SpeedTreeRT Error|UNKNOWN NAME/.test(l);
          });
          if (lines.length) {
            return lines.slice(-3).join(' | ');
          }
        }
      } catch (e) {}
    }
    return '';
  }

  function tryInjectAndPollWasm() {
    var fs = getReadyWasmFs();
    if (!fs || !st.replayRawJson) return;

    if (!st.injectedToWasm) {
      // Wait for preload.js (window.m2w) to finish downloading background corpus chunks (352/352)
      // so metin2_map_guild_01 and warrior/ninja/sura/shaman .gr2 models are in MEMFS before net.Warp!
      var m2w = window.m2w;
      if (m2w) {
        if (!st.waitStartMs) st.waitStartMs = performance.now();
        var waitedMs = performance.now() - st.waitStartMs;
        var pf = m2w.prefetch;
        var dl = m2w.download;
        var stillPrefetching = pf && pf.total > 0 && pf.done < pf.total;
        var stillDownloading = dl && (dl.total === 0 || (!dl.end && (dl.done + dl.fromCache + dl.errors) < dl.total));
        if ((stillPrefetching || stillDownloading) && waitedMs < 45000) {
          if (dl && dl.total > 0) {
            var doneChunks = dl.done + dl.fromCache + dl.errors;
            var pct = Math.max(8, Math.min(24, Math.round(8 + (doneChunks / dl.total) * 16)));
            if (loaderStage) {
              loaderStage.textContent = 'Pobieranie paczek 3D (mapa + modele .gr2): ' + doneChunks + ' / ' + dl.total + '...';
            }
            if (loaderBar) loaderBar.style.width = pct + '%';
          } else if (pf && pf.total > 0) {
            if (loaderStage) {
              loaderStage.textContent = 'Inicjalizacja paczek startowych 3D: ' + pf.done + ' / ' + pf.total + '...';
            }
          }
          return;
        }
      }
      try {
        fs.writeFile('/m2w_replay_init.json', st.replayRawJson);
        fs.writeFile('/replay_data.json', st.replayRawJson);
        fs.writeFile('/m2w_cmd.py', 'import replay3d\nreplay3d.StartReplay3D(getattr(self, "stream", None), "/m2w_replay_init.json")\n');
        st.injectedToWasm = true;
        st.injectedAt = performance.now();
        loaderStage.textContent = 'Przekazano dane wojny do silnika C++ (wczytywanie mapy i modeli .gr2)...';
        loaderBar.style.width = '25%';
      } catch (e) {
        console.error('WASM FS inject error:', e);
      }
    }

    try {
      var hasStatus = fs.analyzePath('/m2w_replay_status.json').exists;
      if (hasStatus) {
        var sRaw = fs.readFile('/m2w_replay_status.json', { encoding: 'utf8' });
        var sObj = JSON.parse(sRaw);
        if (sObj && sObj.step === 'ready') {
          st.wasmReady = true;
          hideLoaderBanner();
        } else if (sObj && (sObj.error || sObj.state === 'error') && loaderStage && !st.wasmReady) {
          var errTail = readTailFromFs(fs, ['/syserr.txt', 'syserr.txt', '/stdout.txt']);
          loaderStage.textContent = '⚠️ Erro no Replay3D (' + (sObj.step || '?') + '): ' + (sObj.error || sObj.msg) + (errTail ? ' [' + errTail + ']' : '');
        }
      } else if (!st.wasmReady && st.injectedAt && (performance.now() - st.injectedAt > 3000)) {
        var tail = readTailFromFs(fs, ['/syserr.txt', 'syserr.txt', '/stdout.txt']);
        if (tail) {
          if (/unexpected indent \(__init__\.py/.test(tail) && typeof indexedDB !== 'undefined') {
            try {
              if (sessionStorage.getItem('m2w_idb_flushed') !== '1') {
                sessionStorage.setItem('m2w_idb_flushed', '1');
                if (loaderStage) loaderStage.textContent = '🔄 Limpando cache antigo do IndexedDB (client.data) e recarregando...';
                var delReq = indexedDB.deleteDatabase('m2w-corpus');
                delReq.onsuccess = delReq.onerror = delReq.onblocked = function () {
                  window.location.reload();
                };
                setTimeout(function () { window.location.reload(); }, 900);
                return;
              }
            } catch (e) {}
          }
          if (loaderStage) {
            loaderStage.textContent = '⚠️ Diagnóstico syserr.txt: ' + tail;
          }
        }
      }
      if (fs.analyzePath('/m2w_replay_state.json').exists) {
        var raw = fs.readFile('/m2w_replay_state.json', { encoding: 'utf8' });
        var wState = JSON.parse(raw);
        if (wState) {
          if (wState.status === 'loading' && !st.wasmReady) {
            var prog = Math.max(15, Math.min(99, wState.progress || 25));
            loaderBar.style.width = prog + '%';
            if (wState.stage && loaderStage) loaderStage.textContent = wState.stage;
          } else if (wState.status === 'error' && !st.wasmReady) {
            if (wState.stage && loaderStage) loaderStage.textContent = '⚠️ ' + wState.stage;
          } else {
            st.wasmReady = true;
            hideLoaderBanner();
            if (typeof wState.cursor === 'number' && st.playing) {
              st.cursor = wState.cursor;
            }
            if (typeof wState.cam_x === 'number' && typeof wState.cam_y === 'number') {
              st.camX = wState.cam_x / 512.0;
              st.camY = wState.cam_y / 512.0;
            }
            if (typeof wState.cam_z === 'number') {
              st.camZ = wState.cam_z;
            }
            if (Array.isArray(wState.proj)) {
              var pm = {};
              for (var i = 0; i < wState.proj.length; i++) {
                var pr = wState.proj[i];
                pm[pr[0]] = [pr[1], pr[2]];
              }
              st.projMap = pm;
            }
          }
        }
      }
    } catch (e) {}
  }

  function tick(now) {
    requestAnimationFrame(tick);
    if (!st.replay) return;

    tryInjectAndPollWasm();

    var frames = st.replay.frames;
    if (!frames || !frames.length) return;

    var dt = Math.min(0.1, Math.max(0.001, (now - st.lastTick) / 1000));
    st.lastTick = now;

    if (st.playing && !st.wasmReady) {
      st.cursor += (dt * st.speed) / 2.0;
      if (st.cursor >= frames.length - 1) {
        st.cursor = frames.length - 1;
        st.playing = false;
        playBtn.textContent = '▶️ Reproduzir';
      }
    }
    scrubber.value = st.cursor;

    var idx0 = Math.max(0, Math.min(frames.length - 1, Math.floor(st.cursor)));
    var idx1 = Math.min(frames.length - 1, idx0 + 1);
    var alpha = st.cursor - idx0;

    var f0 = frames[idx0];
    var f1 = frames[idx1];
    var curT = f0.t + (f1.t - f0.t) * alpha;
    var maxT = frames[frames.length - 1].t || 300;
    document.getElementById('hTimeLbl').textContent = fmtMMSS(curT) + ' / ' + fmtMMSS(maxT);
    document.getElementById('hScore').textContent = (f0.s1 || 0) + ' : ' + (f0.s2 || 0);

    var u1Map = {};
    for (var i = 0; i < f1.u.length; i++) u1Map[f1.u[i][0]] = f1.u[i];

    var roster = st.replay.roster || {};
    var units = [];
    var alive1 = 0, alive2 = 0, tot1 = 0, tot2 = 0, hpSum1 = 0, hpSum2 = 0;

    for (var j = 0; j < f0.u.length; j++) {
      var u0 = f0.u[j];
      var pid = u0[0];
      var u1 = u1Map[pid] || u0;
      var r = roster[pid] || { name: 'Guerreiro #' + pid, level: 40, side: 1, job: 0, cls: 0, leader: false };

      var stepJump = Math.hypot(u1[1] - u0[1], u1[2] - u0[2]);
      var x, y, hp;
      if (u0[3] <= 0.5 || u0[4] === 4) {
        x = u0[1];
        y = u0[2];
        hp = 0;
      } else if (stepJump > 1.2) {
        x = alpha < 0.5 ? u0[1] : u1[1];
        y = alpha < 0.5 ? u0[2] : u1[2];
        hp = u0[3] + (u1[3] - u0[3]) * alpha;
      } else {
        x = u0[1] + (u1[1] - u0[1]) * alpha;
        y = u0[2] + (u1[2] - u0[2]) * alpha;
        hp = u0[3] + (u1[3] - u0[3]) * alpha;
      }
      var act = u0[4] || 0;
      var angle = u0[5] != null ? u0[5] : (r.side === 1 ? 90 : 270);
      var dmg = u0[6] || 0;

      if (r.side === 1) {
        tot1++;
        if (hp > 2) { alive1++; hpSum1 += hp; }
      } else {
        tot2++;
        if (hp > 2) { alive2++; hpSum2 += hp; }
      }

      units.push({
        pid: pid, name: r.name, level: r.level || 35, side: r.side || 1,
        leader: !!r.leader, job: r.job || 0, cls: r.cls != null ? r.cls : ((r.job || 0) % 4),
        armor: r.armor || 11229, weapon: r.weapon || 19,
        x: x, y: y, hp: hp, act: act, angle: angle, dmg: dmg
      });
    }

    document.getElementById('hAlive1').textContent = 'Vivos: ' + alive1 + ' / ' + tot1;
    document.getElementById('hAlive2').textContent = 'Vivos: ' + alive2 + ' / ' + tot2;
    var tugPct = (hpSum1 + hpSum2) > 0 ? (hpSum1 / (hpSum1 + hpSum2)) * 100 : 50;
    document.getElementById('hTug1').style.width = tugPct.toFixed(1) + '%';

    if (now - st.lastRosterUpdate > 240) {
      st.lastRosterUpdate = now;
      renderRosters(units);
    }
    renderKillFeed(st.replay.events || [], curT);
    renderPipMinimap(units);
    render3DProjectedLabels(units, curT);
  }

  // Load 2D radar map image
  var mapImg = new Image();
  mapImg.src = '/maps/4.webp';
  st.mapImg = mapImg;

  var tickStarted = false;
  function applyReplayData(data) {
    if (!data || !data.ok) return;
    var isFirstLoad = !st.replay;
    st.replay = data;
    st.replayRawJson = JSON.stringify(data);
    if (isFirstLoad) {
      st.cursor = 0;
      st.playing = true;
      st.lastKfCount = -1;
      scrubber.max = Math.max(1, (data.frames || []).length - 1);
      scrubber.value = 0;
      st.injectedToWasm = false;
    }

    var g1 = (data.guild1 && data.guild1.name) || 'ChaosKings';
    var g2 = (data.guild2 && data.guild2.name) || 'SilentGuard';
    document.getElementById('hG1').textContent = '🔴 ' + g1;
    document.getElementById('hG2').textContent = g2 + ' 🔵';
    document.getElementById('hRosterHead1').textContent = '🔴 ' + g1 + ' (clique = seguir)';
    document.getElementById('hRosterHead2').textContent = '🔵 ' + g2 + ' (clique = seguir)';

    mapImg.src = '/maps/' + (data.map_index || 4) + '.webp';

    if (!tickStarted) {
      tickStarted = true;
      st.lastTick = performance.now();
      requestAnimationFrame(tick);
    }
  }

  // 1. Check if already loaded in parent wojny.html (0ms instant load!)
  var loadedFromParent = false;
  try {
    if (window.parent && window.parent !== window && window.parent.__currentWarReplayData) {
      applyReplayData(window.parent.__currentWarReplayData);
      loadedFromParent = true;
    }
  } catch (e) {}

  // 2. Otherwise fetch from the exact working endpoint used by wojny.html (/api/guild-wars?replay=...)
  if (!loadedFromParent) {
    var targetId = replayWarId || warNum;
    var primaryUrl = liveWarMode
      ? '/api/guild-wars?live=1'
      : ('/api/guild-wars?replay=' + encodeURIComponent(targetId));

    fetch(primaryUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error('Sem dados do replay');
        applyReplayData(data);
      })
      .catch(function () {
        // Fallback endpoint
        return fetch('/api/guild-war-replay?id=' + encodeURIComponent(targetId))
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data || !data.ok) throw new Error('Sem dados do replay');
            applyReplayData(data);
          });
      })
      .catch(function (err) {
        console.error('Failed to load replay:', err);
        if (!st.replay && loaderStage) {
          loaderStage.textContent = 'Erro ao baixar dados da guerra: ' + err.message;
        }
      });
  }
})();
