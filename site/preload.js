// preload.js - a download bar in the corner and downloading the whole corpus in the background
// Loaded by site/client.html.
//
// Two phases:
//   1. THE MOST IMPORTANT - `corpus/order.txt` (the recorded order
//      of use: login + village); done by `m2w_prefetch_start`
//      in compat/webfs_web.cpp (a window in memory + Cache Storage); here we only
//      show the progress;
//   2. THE REST IN THE BACKGROUND - all the other chunks of the manifest, one by one,
//      into Cache Storage. From there the prefetch and the background fetches
//      of runtime.js read them without the network (the game's synchronous XHR
//      does NOT go through the Service Worker).
// The bar disappears when everything is on disk. `?nofetch=1`
// turns phase 2 off.
//
// The texts ON THE BAR are for the player and still Polish (the page language
// is a separate decision); names and console messages are English.
(function () {
    var q = new URLSearchParams(location.search);
    var noBackground = q.get('nofetch') === '1';

    // --- Service Worker -----------------------------------------------------
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(function (r) {
            console.log('[sw] registered, scope ' + r.scope);
        }).catch(function (e) {
            console.warn('[sw] no Service Worker (' + e + ') - chunks will come from the network on every start');
        });
    }

    // --- the corner bar ----------------------------------------------------
    // PT-BR: barra semitransparente com botões de minimizar (–) e fechar (×).
    // Minimizada vira uma pílula pequena com a porcentagem (toque para abrir de novo);
    // fechada some até recarregar a página. O download continua em segundo plano.
    var isMobilePage = /[?&]mobile=1(&|$)/.test(location.search) || (!/[?&]mobile=0(&|$)/.test(location.search) && (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent || '') || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 920)));
    var barClosed = false;
    var barMin = false;
    try { var _dlPref = localStorage.getItem('m2w.dlbar'); barMin = _dlPref ? (_dlPref === 'min') : isMobilePage; } catch (e) { barMin = isMobilePage; }

    var css = document.createElement('style');
    css.textContent =
        '#m2w_download{position:fixed;right:10px;bottom:10px;z-index:20;min-width:230px;max-width:min(360px,80vw);padding:6px 9px 7px;' +
        'background:rgba(12,10,8,.38);border:1px solid rgba(201,162,74,.28);border-radius:8px;color:#efe2c4;' +
        'font:12px/1.35 system-ui,sans-serif;text-shadow:0 1px 2px #000;pointer-events:none;display:none;' +
        '-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);box-sizing:border-box}' +
        '#m2w_download.mobile{right:auto;bottom:auto;left:50%;top:42px;transform:translateX(-50%);z-index:10001;min-width:210px;font-size:11px}' +
        '#m2w_download .dl-head{display:flex;align-items:center;gap:6px}' +
        '#m2w_download .dl-text{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '#m2w_download .dl-btn{pointer-events:auto;flex:none;width:22px;height:20px;padding:0;border:1px solid rgba(201,162,74,.35);' +
        'border-radius:4px;background:rgba(0,0,0,.35);color:#efe2c4;font:700 13px/1 system-ui,sans-serif;cursor:pointer;touch-action:manipulation}' +
        '#m2w_download .dl-btn:active{background:rgba(201,162,74,.35)}' +
        '#m2w_download .dl-track{margin-top:5px;height:5px;background:rgba(42,34,24,.6);border-radius:3px;overflow:hidden}' +
        '#m2w_download .dl-fill{height:100%;width:0;background:#c9a24a}' +
        '#m2w_download .dl-detail{margin-top:2px;color:#c8bba0;font-size:10.5px;opacity:.85}' +
        '#m2w_download .dl-pill{display:none}' +
        '#m2w_download.min{min-width:0;padding:3px 4px 3px 8px;border-radius:12px;pointer-events:auto;cursor:pointer}' +
        '#m2w_download.min .dl-full{display:none}' +
        '#m2w_download.min .dl-pill{display:flex;align-items:center;gap:6px;font-weight:700;white-space:nowrap}';
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.id = 'm2w_download';
    if (isMobilePage) bar.className = 'mobile';
    bar.innerHTML =
        '<div class="dl-full">' +
          '<div class="dl-head"><span class="dl-text" id="m2w_download_text">Dane gry</span>' +
          '<button type="button" class="dl-btn" data-act="min" title="Minimizar" aria-label="Minimizar">&#8211;</button>' +
          '<button type="button" class="dl-btn" data-act="close" title="Fechar" aria-label="Fechar">&#215;</button></div>' +
          '<div class="dl-track"><div class="dl-fill" id="m2w_download_fill"></div></div>' +
          '<div class="dl-detail" id="m2w_download_detail"></div>' +
        '</div>' +
        '<div class="dl-pill" title="Mostrar o download"><span>&#11015; <span id="m2w_download_pct">0%</span></span>' +
          '<button type="button" class="dl-btn" data-act="close" title="Fechar" aria-label="Fechar">&#215;</button></div>';
    document.body.appendChild(bar);
    var elText = bar.querySelector('#m2w_download_text');
    var elFill = bar.querySelector('#m2w_download_fill');
    var elDetail = bar.querySelector('#m2w_download_detail');
    var elPct = bar.querySelector('#m2w_download_pct');
    var hideAt = 0;

    function setMin(v) {
        barMin = !!v;
        bar.classList.toggle('min', barMin);
        try { localStorage.setItem('m2w.dlbar', barMin ? 'min' : ''); } catch (e) { }
    }
    setMin(barMin);
    // Os toques nos botões não podem chegar ao jogo (canvas/janela).
    ['touchstart', 'touchend', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(function (n) {
        bar.addEventListener(n, function (e) { e.stopPropagation(); }, { passive: true });
    });
    bar.addEventListener('click', function (e) {
        e.stopPropagation();
        var b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
        var act = b ? b.getAttribute('data-act') : (barMin ? 'restore' : '');
        if (act === 'close') { barClosed = true; bar.style.display = 'none'; }
        else if (act === 'min') setMin(true);
        else if (act === 'restore') setMin(false);
    });

    /// Shows the bar with `text`, the fill `fraction` (0..1) and a smaller `detail` line.
    function show(text, fraction, detail) {
        if (barClosed) return;
        bar.style.display = 'block';
        var pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
        elText.textContent = text;
        elFill.style.width = pct + '%';
        elDetail.textContent = detail || '';
        if (elPct) elPct.textContent = pct + '%';
    }
    /// Hides the bar after `delay` ms, unless `show` or `hide` was called again meanwhile.
    function hide(delay) {
        hideAt = performance.now() + (delay || 0);
        setTimeout(function () { if (performance.now() >= hideAt) bar.style.display = 'none'; }, (delay || 0) + 20);
    }

    // --- phase 2: the rest of the corpus -----------------------------------
    // `m2w.download` (console): start/end in ms, `done` downloaded, `fromCache`
    // already on disk, `errors`, `total` chunks, `bytes` downloaded.
    var download = { start: 0, done: 0, fromCache: 0, total: 0, bytes: 0, errors: 0, end: 0 };
    var m2w = globalThis.m2w = globalThis.m2w || {};
    m2w.download = download;

    /// Download speed of phase 2 so far, in MB/s (0 in the first half second).
    function megabytesPerSecond() {
        var s = (performance.now() - download.start) / 1000;
        return s > 0.5 ? (download.bytes / 1048576 / s) : 0;
    }

    /// Phase 2: every chunk of the manifest not yet in Cache Storage is
    /// downloaded into it, one at a time, with a pause so the game keeps its
    /// bandwidth; the bar shows the progress.
    function backgroundPhase() {
        var list = (m2w.corpus && m2w.corpus.all) || [];
        var base = (m2w.corpus && m2w.corpus.url) || 'corpus/';
        var openStorage = m2w.openCorpusStorage ? m2w.openCorpusStorage()
            : (('caches' in globalThis) ? caches.open('m2w-corpus') : Promise.resolve(null));
        if (!list.length || noBackground) { hide(1500); return; }
        download.total = list.length;
        download.start = performance.now();
        openStorage.then(function (c) {
            if (!c) { hide(1500); return; }
            var i = 0;
            /// Takes the next chunk: from disk if there, else from the network into the cache.
            function next() {
                if (i >= list.length) {
                    download.end = performance.now();
                    show('Dane gry: zapisano w pami\u0119ci', 1, download.total + ' cz.');
                    console.log('[corpus] background: ' + download.done + ' downloaded, ' + download.fromCache + ' from disk, ' +
                                download.errors + ' errors, ' + Math.round((download.end - download.start) / 1000) + ' s');
                    hide(4000);
                    return;
                }
                if (globalThis._m2oInputActiveUntil && performance.now() < globalThis._m2oInputActiveUntil) {
                    setTimeout(next, 350);
                    return;
                }
                var name = list[i++] + '.bin';
                var sUrl = base + name;
                var wasNet = false;
                var hydrateRam = function (b) {
                    var st = m2w.chunks;
                    if (st && st.map && !st.map.has(name) && (st.bytes + b.byteLength <= st.budget)) {
                        var arr = new Uint8Array(b);
                        st.map.set(name, arr);
                        st.bytes += arr.length;
                    }
                };
                if (m2w.chunks && m2w.chunks.map && m2w.chunks.map.has(name)) {
                    ++download.fromCache;
                    setTimeout(next, 2);
                    return;
                }
                c.match(sUrl).then(function (cached) {
                    if (cached) {
                        ++download.fromCache;
                        if (m2w.chunks && m2w.chunks.map && !m2w.chunks.map.has(name) && (m2w.chunks.bytes + 4194304 <= m2w.chunks.budget)) {
                            return cached.arrayBuffer().then(hydrateRam);
                        }
                        return;
                    }
                    wasNet = true;
                    return fetch(sUrl).then(function (o) {
                        if (!o || !o.ok) throw new Error('HTTP ' + (o && o.status));
                        return o.arrayBuffer().then(function (b) {
                            download.bytes += b.byteLength;
                            hydrateRam(b);
                            return c.put(sUrl, new Response(b, { headers: { 'Content-Type': 'application/octet-stream' } }));
                        });
                    }).then(function () { ++download.done; });
                }).catch(function (e) { ++download.errors; }).then(function () {
                    var n = download.done + download.fromCache + download.errors;
                    if (download.done > 0 || (n % 25) === 0)
                        show('Dane gry (w tle): ' + n + ' / ' + download.total, n / download.total,
                             download.done ? (megabytesPerSecond().toFixed(1) + ' MB/s' + (download.errors ? ', erros ' + download.errors : '')) : 'carregando na memória...');
                    setTimeout(next, wasNet ? 35 : 5);
                });
            }
            next();
        });
    }

    // --- phase 1: prefetch progress from compat ----------------------------
    var backgroundStarted = false;
    var lastDone = -1, lastChange = 0;
    /// Polls `m2w.prefetch` every 500 ms: shows phase 1, and starts phase 2
    /// when it is done or has stalled for 10 s (or there is no order.txt).
    function watch() {
        var w = m2w.prefetch;
        // m2w_prefetch fields in English (runtime.js: total/done/fromStorage)
        if (w && w.total > 0) {
            if (w.done !== lastDone) { lastDone = w.done; lastChange = performance.now(); }
            // The prefetch waits for room in memory (a sliding window) and can
            // stall when the game has left the recorded path - after 10 s without progress
            // we move to the background, which covers the rest of the list anyway.
            var bStalled = performance.now() - lastChange > 12000;
            if (w.done < w.total && !bStalled)
                show('Dane podstawowe: ' + w.done + ' / ' + w.total, w.done / w.total,
                     (w.fromStorage ? w.fromStorage + ' z pami\u0119ci' : ''));
            else if (!backgroundStarted) {
                backgroundStarted = true;
                show('Dane podstawowe: gotowe', 1, '');
                setTimeout(backgroundPhase, 600);
            }
        } else if (!w && performance.now() > 25000 && !backgroundStarted && m2w.corpus && m2w.corpus.all.length) {
            // no order.txt - straight to the background
            backgroundStarted = true;
            backgroundPhase();
        }
        if (!backgroundStarted || (download.start && !download.end)) setTimeout(watch, 500);
    }
    setTimeout(watch, 2000);
})();
