// include: shell.js
// include: minimum_runtime_check.js
(function() {
  // "30.0.0" -> 300000
  function humanReadableVersionToPacked(str) {
    str = str.split('-')[0]; // Remove any trailing part from e.g. "12.53.3-alpha"
    var vers = str.split('.').slice(0, 3);
    while(vers.length < 3) vers.push('00');
    vers = vers.map((n, i, arr) => n.padStart(2, '0'));
    return vers.join('');
  }
  // 300000 -> "30.0.0"
  var packedVersionToHumanReadable = n => [n / 10000 | 0, (n / 100 | 0) % 100, n % 100].join('.');

  var TARGET_NOT_SUPPORTED = 2147483647;

  // Note: We use a typeof check here instead of optional chaining using
  // globalThis because older browsers might not have globalThis defined.

  // We skip the node version checking when running on Bun/Deno since the node
  // version they report doesn't seem to be useful.
  if (typeof process !== 'undefined' && !process.versions?.bun && typeof Deno == "undefined") {
    var currentNodeVersion = process.versions?.node ? humanReadableVersionToPacked(process.versions.node) : TARGET_NOT_SUPPORTED;
    if (currentNodeVersion < 180300) {
      throw new Error(`This emscripten-generated code requires node v${ packedVersionToHumanReadable(180300) } (detected v${packedVersionToHumanReadable(currentNodeVersion)})`);
    }
  }

  var userAgent = typeof navigator !== 'undefined' && navigator.userAgent;
  if (!userAgent) {
    return;
  }

  var currentSafariVersion = userAgent.includes("Safari/") && !userAgent.includes("Chrome/") && userAgent.match(/Version\/(\d+\.?\d*\.?\d*)/) ? humanReadableVersionToPacked(userAgent.match(/Version\/(\d+\.?\d*\.?\d*)/)[1]) : TARGET_NOT_SUPPORTED;
  if (currentSafariVersion < 150000) {
    throw new Error(`This emscripten-generated code requires Safari v${ packedVersionToHumanReadable(150000) } (detected v${currentSafariVersion})`);
  }

  var currentFirefoxVersion = userAgent.match(/Firefox\/(\d+(?:\.\d+)?)/) ? parseFloat(userAgent.match(/Firefox\/(\d+(?:\.\d+)?)/)[1]) : TARGET_NOT_SUPPORTED;
  if (currentFirefoxVersion < 79) {
    throw new Error(`This emscripten-generated code requires Firefox v79 (detected v${currentFirefoxVersion})`);
  }

  var currentChromeVersion = userAgent.match(/Chrome\/(\d+(?:\.\d+)?)/) ? parseFloat(userAgent.match(/Chrome\/(\d+(?:\.\d+)?)/)[1]) : TARGET_NOT_SUPPORTED;
  if (currentChromeVersion < 85) {
    throw new Error(`This emscripten-generated code requires Chrome v85 (detected v${currentChromeVersion})`);
  }
})();

// end include: minimum_runtime_check.js
// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(moduleArg) => Promise<Module>
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module != 'undefined' ? Module : {};

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

// Attempt to auto-detect the environment
var ENVIRONMENT_IS_WEB = !!globalThis.window;
var ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;
// N.b. Electron.js environment is simultaneously a NODE-environment, but
// also a web environment.
var ENVIRONMENT_IS_NODE = globalThis.process?.versions?.node && globalThis.process?.type != 'renderer';
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// include: <tmp>\tmpge058lku.js

  if (!Module['expectedDataFileDownloads']) Module['expectedDataFileDownloads'] = 0;
  Module['expectedDataFileDownloads']++;
  (() => {
    // Do not attempt to redownload the virtual filesystem data when in a pthread or a Wasm Worker context.
    var isPthread = typeof ENVIRONMENT_IS_PTHREAD != 'undefined' && ENVIRONMENT_IS_PTHREAD;
    var isWasmWorker = typeof ENVIRONMENT_IS_WASM_WORKER != 'undefined' && ENVIRONMENT_IS_WASM_WORKER;
    if (isPthread || isWasmWorker) return;
    var isNode = globalThis.process && globalThis.process.versions && globalThis.process.versions.node && globalThis.process.type != 'renderer';
    async function loadPackage(metadata) {

      var PACKAGE_PATH = '';
      if (typeof window === 'object') {
        PACKAGE_PATH = window['encodeURIComponent'](window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) + '/');
      } else if (typeof process === 'undefined' && typeof location !== 'undefined') {
        // web worker
        PACKAGE_PATH = encodeURIComponent(location.pathname.substring(0, location.pathname.lastIndexOf('/')) + '/');
      }
      var PACKAGE_NAME = './build/port/client.data';
      var REMOTE_PACKAGE_BASE = 'client.data';
      var REMOTE_PACKAGE_NAME = Module['locateFile'] ? Module['locateFile'](REMOTE_PACKAGE_BASE, '') : REMOTE_PACKAGE_BASE;
      var REMOTE_PACKAGE_SIZE = metadata['remote_package_size'];

      async function fetchRemotePackage(packageName, packageSize) {
        if (isNode) {
          var contents = require('fs').readFileSync(packageName);
          return new Uint8Array(contents).buffer;
        }
        if (!Module['dataFileDownloads']) Module['dataFileDownloads'] = {};
        try {
          var response = await fetch(packageName);
        } catch (e) {
          throw new Error(`Network Error: ${packageName}`, {e});
        }
        if (!response.ok) {
          throw new Error(`${response.status}: ${response.url}`);
        }

        const chunks = [];
        const headers = response.headers;
        const total = Number(headers.get('Content-Length') || packageSize);
        let loaded = 0;

        Module['setStatus'] && Module['setStatus']('Downloading data...');
        const reader = response.body.getReader();

        while (1) {
          var {done, value} = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          Module['dataFileDownloads'][packageName] = {loaded, total};

          let totalLoaded = 0;
          let totalSize = 0;

          for (const download of Object.values(Module['dataFileDownloads'])) {
            totalLoaded += download.loaded;
            totalSize += download.total;
          }

          Module['setStatus'] && Module['setStatus'](`Downloading data... (${totalLoaded}/${totalSize})`);
        }

        const packageData = new Uint8Array(chunks.map((c) => c.length).reduce((a, b) => a + b, 0));
        let offset = 0;
        for (const chunk of chunks) {
          packageData.set(chunk, offset);
          offset += chunk.length;
        }
        return packageData.buffer;
      }

      var fetchPromise;
      var fetched = Module['getPreloadedPackage'] && Module['getPreloadedPackage'](REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE);

      if (!fetched) {
        // Note that we don't use await here because we want to execute the
        // the rest of this function immediately.
        fetchPromise = fetchRemotePackage(REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE);
      }

    async function runWithFS(Module) {

      function assert(check, msg) {
        if (!check) throw new Error(msg);
      }
Module['FS_createPath']("/", "cursors", true, true);
Module['FS_createPath']("/", "fonts", true, true);
Module['FS_createPath']("/", "gamedata", true, true);
Module['FS_createPath']("/", "icon", true, true);
Module['FS_createPath']("/", "lib", true, true);
Module['FS_createPath']("/", "localadvent", true, true);
Module['FS_createPath']("/", "localchristmas", true, true);
Module['FS_createPath']("/", "localchristmas2019", true, true);
Module['FS_createPath']("/", "locale", true, true);
Module['FS_createPath']("/", "maps", true, true);
Module['FS_createPath']("/", "playerbot_ui", true, true);
Module['FS_createPath']("/", "property", true, true);
Module['FS_createPath']("/", "textureset", true, true);
Module['FS_createPath']("/", "uiscript", true, true);
Module['FS_createPath']("/", "usr", true, true);
Module['FS_createPath']("/", "ymir work", true, true);
Module['FS_createPath']("/icon", "item", true, true);
Module['FS_createPath']("/lib", "encodings", true, true);
Module['FS_createPath']("/lib", "json", true, true);
Module['FS_createPath']("/lib", "simplejson", true, true);
Module['FS_createPath']("/lib", "xml", true, true);
Module['FS_createPath']("/localchristmas", "effects", true, true);
Module['FS_createPath']("/localchristmas", "models", true, true);
Module['FS_createPath']("/localchristmas", "mounts", true, true);
Module['FS_createPath']("/localchristmas", "stones", true, true);
Module['FS_createPath']("/localchristmas", "waves", true, true);
Module['FS_createPath']("/localchristmas", "worldbosses", true, true);
Module['FS_createPath']("/localchristmas2019", "celebration", true, true);
Module['FS_createPath']("/locale", "common", true, true);
Module['FS_createPath']("/locale", "en", true, true);
Module['FS_createPath']("/locale", "pl", true, true);
Module['FS_createPath']("/locale", "tr", true, true);
Module['FS_createPath']("/maps", "map_a2", true, true);
Module['FS_createPath']("/maps", "metin2_map_skipia_dungeon_boss", true, true);
Module['FS_createPath']("/maps", "plague_dungeon", true, true);
Module['FS_createPath']("/playerbot_ui", "assault_horse", true, true);
Module['FS_createPath']("/playerbot_ui", "drawer_classic", true, true);
Module['FS_createPath']("/playerbot_ui", "drawer_icons", true, true);
Module['FS_createPath']("/playerbot_ui", "sidekick_offline", true, true);
Module['FS_createPath']("/playerbot_ui", "sidekick_orders", true, true);
Module['FS_createPath']("/playerbot_ui", "skillbook", true, true);
Module['FS_createPath']("/playerbot_ui", "sm_coupon", true, true);
Module['FS_createPath']("/usr", "local", true, true);
Module['FS_createPath']("/ymir work", "effect", true, true);
Module['FS_createPath']("/ymir work", "environment", true, true);
Module['FS_createPath']("/ymir work", "monster", true, true);
Module['FS_createPath']("/ymir work", "npc2", true, true);
Module['FS_createPath']("/ymir work", "ui", true, true);
Module['FS_createPath']("/lib/xml", "dom", true, true);
Module['FS_createPath']("/lib/xml", "parsers", true, true);
Module['FS_createPath']("/localchristmas/models", "34801", true, true);
Module['FS_createPath']("/localchristmas/models", "34802", true, true);
Module['FS_createPath']("/localchristmas/models", "34803", true, true);
Module['FS_createPath']("/localchristmas/models", "34804", true, true);
Module['FS_createPath']("/localchristmas/models", "34805", true, true);
Module['FS_createPath']("/localchristmas/models", "34806", true, true);
Module['FS_createPath']("/localchristmas/models", "34807", true, true);
Module['FS_createPath']("/localchristmas/models", "34808", true, true);
Module['FS_createPath']("/localchristmas/models", "34809", true, true);
Module['FS_createPath']("/localchristmas/mounts", "dragon", true, true);
Module['FS_createPath']("/localchristmas/mounts", "ice", true, true);
Module['FS_createPath']("/localchristmas/mounts", "rudolf", true, true);
Module['FS_createPath']("/localchristmas/stones", "ball", true, true);
Module['FS_createPath']("/localchristmas/stones", "metin", true, true);
Module['FS_createPath']("/localchristmas/stones", "snowman", true, true);
Module['FS_createPath']("/localchristmas/waves", "model1", true, true);
Module['FS_createPath']("/localchristmas/waves", "model2", true, true);
Module['FS_createPath']("/localchristmas/waves", "model3", true, true);
Module['FS_createPath']("/localchristmas/waves", "model4", true, true);
Module['FS_createPath']("/localchristmas/waves", "model5", true, true);
Module['FS_createPath']("/localchristmas/waves", "model6", true, true);
Module['FS_createPath']("/localchristmas/waves", "model7", true, true);
Module['FS_createPath']("/localchristmas/waves", "model8", true, true);
Module['FS_createPath']("/localchristmas/worldbosses", "herald", true, true);
Module['FS_createPath']("/localchristmas/worldbosses", "thief", true, true);
Module['FS_createPath']("/localchristmas/worldbosses", "winter", true, true);
Module['FS_createPath']("/locale/common", "ui", true, true);
Module['FS_createPath']("/locale/en", "ui", true, true);
Module['FS_createPath']("/locale/pl", "map", true, true);
Module['FS_createPath']("/locale/pl", "ui", true, true);
Module['FS_createPath']("/locale/tr", "ui", true, true);
Module['FS_createPath']("/maps/map_a2", "001005", true, true);
Module['FS_createPath']("/maps/metin2_map_skipia_dungeon_boss", "000000", true, true);
Module['FS_createPath']("/maps/metin2_map_skipia_dungeon_boss", "000001", true, true);
Module['FS_createPath']("/maps/metin2_map_skipia_dungeon_boss", "001000", true, true);
Module['FS_createPath']("/maps/metin2_map_skipia_dungeon_boss", "001001", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "000000", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "000001", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "000002", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "000003", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "001000", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "001001", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "001002", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "001003", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "002000", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "002001", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "002002", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "002003", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "003000", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "003001", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "003002", true, true);
Module['FS_createPath']("/maps/plague_dungeon", "003003", true, true);
Module['FS_createPath']("/usr/local", "lib", true, true);
Module['FS_createPath']("/ymir work/effect", "monster2", true, true);
Module['FS_createPath']("/ymir work/effect", "plechito", true, true);
Module['FS_createPath']("/ymir work/monster", "halloween2022_coffin", true, true);
Module['FS_createPath']("/ymir work/npc2", "jlantern_mark", true, true);
Module['FS_createPath']("/ymir work/ui", "atlas", true, true);
Module['FS_createPath']("/ymir work/ui", "community", true, true);
Module['FS_createPath']("/ymir work/ui", "game", true, true);
Module['FS_createPath']("/ymir work/ui", "localchristmas", true, true);
Module['FS_createPath']("/locale/common/ui", "login", true, true);
Module['FS_createPath']("/locale/en/ui", "login", true, true);
Module['FS_createPath']("/locale/pl/ui", "login", true, true);
Module['FS_createPath']("/locale/tr/ui", "login", true, true);
Module['FS_createPath']("/usr/local/lib", "python3.13", true, true);
Module['FS_createPath']("/ymir work/effect/plechito", "monster", true, true);
Module['FS_createPath']("/ymir work/ui/atlas", "metin2_map_skipia_dungeon_boss", true, true);
Module['FS_createPath']("/ymir work/ui/atlas", "plague_dungeon", true, true);
Module['FS_createPath']("/ymir work/ui/community", "gf243", true, true);
Module['FS_createPath']("/ymir work/ui/game", "questboard", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "__phello__", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "_pyrepl", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "asyncio", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "collections", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "concurrent", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "ctypes", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "curses", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "dbm", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "email", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "encodings", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "html", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "http", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "importlib", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "json", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "logging", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "multiprocessing", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "pathlib", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "pydoc_data", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "re", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "sqlite3", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "sysconfig", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "tomllib", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "unittest", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "urllib", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "wsgiref", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "xml", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "xmlrpc", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "zipfile", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13", "zoneinfo", true, true);
Module['FS_createPath']("/ymir work/effect/plechito/monster", "halloween2021", true, true);
Module['FS_createPath']("/ymir work/effect/plechito/monster", "halloween2022", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13/concurrent", "futures", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13/email", "mime", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13/importlib", "metadata", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13/importlib", "resources", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13/multiprocessing", "dummy", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13/xml", "dom", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13/xml", "etree", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13/xml", "parsers", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13/xml", "sax", true, true);
Module['FS_createPath']("/usr/local/lib/python3.13/zipfile", "_path", true, true);

      async function processPackageData(arrayBuffer) {
        assert(arrayBuffer, 'Loading data file failed.');
        assert(arrayBuffer.constructor.name === ArrayBuffer.name, 'bad input to processPackageData ' + arrayBuffer.constructor.name);
        var byteArray = new Uint8Array(arrayBuffer);
        var curr;
        // PATCH (PT-BR): confere se o client.data bate com este client.js. Um download
        // cortado / cache antigo no IndexedDB / client.data de outra versao no servidor
        // fazem o Python ler os arquivos nos lugares errados ("Failed to import
        // encodings module ... IndentationError"). Copia do cache ruim -> apaga e recarrega.
        try {
          var m2wBad = byteArray.length !== REMOTE_PACKAGE_SIZE;
          if (!m2wBad) {
            for (var m2wF of metadata['files']) {
              if (/\/python3\.\d+\/encodings\/__init__\.py$/.test(m2wF['filename'])) {
                var m2wC = byteArray[m2wF['start']];
                m2wBad = !(m2wC === 0x22 || m2wC === 0x23 || m2wC === 0x27);   // " # '
                break;
              }
            }
          }
          if (m2wBad) {
            var m2wCached = !!globalThis.m2wDataFromCache;
            console.error('[m2w] client.data invalido (' + byteArray.length + ' bytes, esperado ' + REMOTE_PACKAGE_SIZE + ', cache=' + m2wCached + ')');
            var m2wTried = false;
            try { m2wTried = sessionStorage.getItem('m2w.dataRetry') === '1'; sessionStorage.setItem('m2w.dataRetry', '1'); } catch (e) { }
            if (!m2wTried && typeof indexedDB !== 'undefined') {
              Module['setStatus'] && Module['setStatus']('Arquivos do jogo danificados - baixando de novo...');
              try { indexedDB.deleteDatabase('m2w-corpus'); } catch (e) { }
              setTimeout(function () { location.reload(); }, 1500);
              await new Promise(function () { });   // para aqui ate recarregar
            }
            throw new Error('Os arquivos do jogo (client.data, ' + byteArray.length + ' bytes) nao correspondem a esta versao do client.js (esperado ' + REMOTE_PACKAGE_SIZE + ' bytes). ' +
              'Limpe os dados do site no navegador e recarregue. Se continuar, o client.data no servidor e de outra versao: envie juntos client.data, client.wasm e client.js do mesmo build.');
          }
          try { sessionStorage.removeItem('m2w.dataRetry'); } catch (e) { }
        } catch (m2wE) {
          if (Module['onAbort']) Module['onAbort'](String(m2wE && m2wE.message || m2wE));
          throw m2wE;
        }
        // Reuse the bytearray from the XHR as the source for file reads.
          for (var file of metadata['files']) {
            var name = file['filename'];
            var data = byteArray.subarray(file['start'], file['end']);
            // canOwn this data in the filesystem, it is a slice into the heap that will never change
        Module['FS_createDataFile'](name, null, data, true, true, true);
          }
          Module['removeRunDependency']('datafile_./build/port/client.data');
      }
      Module['addRunDependency']('datafile_./build/port/client.data');

      if (!Module['preloadResults']) Module['preloadResults'] = {};

      Module['preloadResults'][PACKAGE_NAME] = {fromCache: false};
      if (!fetched) {
        fetched = await fetchPromise;
      }
      await processPackageData(fetched);

    }
    // Detect whether the module JS file has already been loaded.
    if (Module['FS_createPath']) {
      runWithFS(Module);
    } else {
      if (!Module['preRun']) Module['preRun'] = [];
      Module['preRun'].push(runWithFS); // FS is not initialized yet, wait for it
    }

    }
    loadPackage({"files": [{"filename": "/AtlasInfo.txt", "start": 0, "end": 4898}, {"filename": "/autohunt_item_catalog.py", "start": 4898, "end": 565751}, {"filename": "/autohunt_native.py", "start": 565751, "end": 569384}, {"filename": "/autohunt_native_frontend.py", "start": 569384, "end": 581823}, {"filename": "/autohunt_native_messages.py", "start": 581823, "end": 586478}, {"filename": "/autohuntadvanced.py", "start": 586478, "end": 613291}, {"filename": "/autohuntbehaviour.py", "start": 613291, "end": 631879}, {"filename": "/autohuntcustom.py", "start": 631879, "end": 640206}, {"filename": "/autohuntloothelp.py", "start": 640206, "end": 652472}, {"filename": "/autohuntpriority.py", "start": 652472, "end": 656883}, {"filename": "/autohuntquickslot.py", "start": 656883, "end": 662377}, {"filename": "/autohunttooltip.py", "start": 662377, "end": 667685}, {"filename": "/autologin.py", "start": 667685, "end": 678214}, {"filename": "/autostackpump.py", "start": 678214, "end": 679600}, {"filename": "/autotarget.py", "start": 679600, "end": 692847}, {"filename": "/channel.inf", "start": 692847, "end": 692850}, {"filename": "/chatwhisperaction.py", "start": 692850, "end": 693767}, {"filename": "/cinemachine.py", "start": 693767, "end": 696734}, {"filename": "/clientclock.py", "start": 696734, "end": 697100}, {"filename": "/clientfps.py", "start": 697100, "end": 700089}, {"filename": "/clientloading.py", "start": 700089, "end": 711548}, {"filename": "/clientqol.py", "start": 711548, "end": 717206}, {"filename": "/collectorproto.py", "start": 717206, "end": 724305}, {"filename": "/colorInfo.py", "start": 724305, "end": 726645}, {"filename": "/configMain.py", "start": 726645, "end": 746385}, {"filename": "/consoleModule.py", "start": 746385, "end": 771321}, {"filename": "/constInfo.py", "start": 771321, "end": 785528}, {"filename": "/credentialstore.py", "start": 785528, "end": 794066}, {"filename": "/cursors/102.png", "start": 794066, "end": 795177}, {"filename": "/cursors/104.png", "start": 795177, "end": 796795}, {"filename": "/cursors/105.png", "start": 796795, "end": 797790}, {"filename": "/cursors/106.png", "start": 797790, "end": 799084}, {"filename": "/cursors/107.png", "start": 799084, "end": 800382}, {"filename": "/cursors/108.png", "start": 800382, "end": 801279}, {"filename": "/cursors/109.png", "start": 801279, "end": 802563}, {"filename": "/cursors/110.png", "start": 802563, "end": 803494}, {"filename": "/cursors/111.png", "start": 803494, "end": 804427}, {"filename": "/cursors/114.png", "start": 804427, "end": 805324}, {"filename": "/cursors/139.png", "start": 805324, "end": 806233}, {"filename": "/cursors/140.png", "start": 806233, "end": 806706}, {"filename": "/cursors/141.png", "start": 806706, "end": 807180}, {"filename": "/cursors/142.png", "start": 807180, "end": 807621}, {"filename": "/cursors/index.txt", "start": 807621, "end": 807739}, {"filename": "/customfleamarket.py", "start": 807739, "end": 941086}, {"filename": "/debugInfo.py", "start": 941086, "end": 941258}, {"filename": "/dragon_soul_refine_settings.py", "start": 941258, "end": 942547}, {"filename": "/dragonsoulbatch.py", "start": 942547, "end": 945770}, {"filename": "/dragonsoulrefine.py", "start": 945770, "end": 949146}, {"filename": "/dragonsoulswitch.py", "start": 949146, "end": 951390}, {"filename": "/dt_item_catalog.py", "start": 951390, "end": 994080}, {"filename": "/dt_mob_catalog.py", "start": 994080, "end": 997778}, {"filename": "/emotion.py", "start": 997778, "end": 1009170}, {"filename": "/english_gui.py", "start": 1009170, "end": 1098859}, {"filename": "/eventManager.py", "start": 1098859, "end": 1101373}, {"filename": "/exception.py", "start": 1101373, "end": 1102122}, {"filename": "/f10_locale.py", "start": 1102122, "end": 1122237}, {"filename": "/file_utils.py", "start": 1122237, "end": 1123854}, {"filename": "/flamewindPath.py", "start": 1123854, "end": 1124621}, {"filename": "/fonts/arial_12_n_b.bin", "start": 1124621, "end": 1137175}, {"filename": "/fonts/arial_12_n_n.bin", "start": 1137175, "end": 1149681}, {"filename": "/fonts/arial_15_n_b.bin", "start": 1149681, "end": 1163624}, {"filename": "/fonts/arial_15_n_n.bin", "start": 1163624, "end": 1177417}, {"filename": "/fonts/arial_18_n_b.bin", "start": 1177417, "end": 1193673}, {"filename": "/fonts/arial_18_n_n.bin", "start": 1193673, "end": 1210451}, {"filename": "/fonts/arial_21_n_b.bin", "start": 1210451, "end": 1230991}, {"filename": "/fonts/arial_21_n_n.bin", "start": 1230991, "end": 1249956}, {"filename": "/fonts/arial_23_n_b.bin", "start": 1249956, "end": 1271562}, {"filename": "/fonts/arial_24_n_b.bin", "start": 1271562, "end": 1294424}, {"filename": "/fonts/arial_24_n_n.bin", "start": 1294424, "end": 1317358}, {"filename": "/fonts/arial_27_n_b.bin", "start": 1317358, "end": 1342902}, {"filename": "/fonts/arial_30_n_b.bin", "start": 1342902, "end": 1371140}, {"filename": "/fonts/arial_30_n_n.bin", "start": 1371140, "end": 1397350}, {"filename": "/fonts/arial_32_n_b.bin", "start": 1397350, "end": 1428548}, {"filename": "/fonts/arial_36_n_b.bin", "start": 1428548, "end": 1465234}, {"filename": "/fonts/arial_36_n_n.bin", "start": 1465234, "end": 1501272}, {"filename": "/fonts/arial_45_n_b.bin", "start": 1501272, "end": 1553600}, {"filename": "/fonts/arial_54_n_b.bin", "start": 1553600, "end": 1620724}, {"filename": "/fonts/tahoma_12_i_n.bin", "start": 1620724, "end": 1633302}, {"filename": "/fonts/tahoma_12_n_b.bin", "start": 1633302, "end": 1645904}, {"filename": "/fonts/tahoma_12_n_n.bin", "start": 1645904, "end": 1658434}, {"filename": "/fonts/tahoma_14_n_n.bin", "start": 1658434, "end": 1671862}, {"filename": "/fonts/tahoma_15_i_n.bin", "start": 1671862, "end": 1686825}, {"filename": "/fonts/tahoma_15_n_b.bin", "start": 1686825, "end": 1700708}, {"filename": "/fonts/tahoma_15_n_n.bin", "start": 1700708, "end": 1714501}, {"filename": "/fonts/tahoma_16_n_n.bin", "start": 1714501, "end": 1728691}, {"filename": "/fonts/tahoma_18_i_n.bin", "start": 1728691, "end": 1746963}, {"filename": "/fonts/tahoma_18_n_b.bin", "start": 1746963, "end": 1763885}, {"filename": "/fonts/tahoma_18_n_n.bin", "start": 1763885, "end": 1779853}, {"filename": "/fonts/tahoma_20_n_n.bin", "start": 1779853, "end": 1797251}, {"filename": "/fonts/tahoma_21_i_n.bin", "start": 1797251, "end": 1818757}, {"filename": "/fonts/tahoma_21_n_b.bin", "start": 1818757, "end": 1838835}, {"filename": "/fonts/tahoma_21_n_n.bin", "start": 1838835, "end": 1857086}, {"filename": "/fonts/tahoma_24_i_n.bin", "start": 1857086, "end": 1881532}, {"filename": "/fonts/tahoma_24_n_b.bin", "start": 1881532, "end": 1905138}, {"filename": "/fonts/tahoma_24_n_n.bin", "start": 1905138, "end": 1927256}, {"filename": "/fonts/tahoma_25_n_n.bin", "start": 1927256, "end": 1950549}, {"filename": "/fonts/tahoma_28_n_n.bin", "start": 1950549, "end": 1976283}, {"filename": "/fonts/tahoma_30_i_n.bin", "start": 1976283, "end": 2008901}, {"filename": "/fonts/tahoma_30_n_b.bin", "start": 2008901, "end": 2038489}, {"filename": "/fonts/tahoma_30_n_n.bin", "start": 2038489, "end": 2065917}, {"filename": "/fonts/tahoma_32_n_n.bin", "start": 2065917, "end": 2095451}, {"filename": "/fonts/tahoma_35_n_n.bin", "start": 2095451, "end": 2129319}, {"filename": "/fonts/tahoma_36_i_n.bin", "start": 2129319, "end": 2171909}, {"filename": "/fonts/tahoma_36_n_b.bin", "start": 2171909, "end": 2210215}, {"filename": "/fonts/tahoma_36_n_n.bin", "start": 2210215, "end": 2245317}, {"filename": "/fonts/tahoma_40_n_n.bin", "start": 2245317, "end": 2285475}, {"filename": "/fonts/tahoma_42_n_n.bin", "start": 2285475, "end": 2328695}, {"filename": "/fonts/tahoma_48_n_n.bin", "start": 2328695, "end": 2381989}, {"filename": "/game.py", "start": 2381989, "end": 2546754}, {"filename": "/game1.cfg", "start": 2546754, "end": 2546899}, {"filename": "/gameRules.py", "start": 2546899, "end": 2550692}, {"filename": "/gameSettings.py", "start": 2550692, "end": 2551463}, {"filename": "/gamedata/AtlasInfo.txt", "start": 2551463, "end": 2556396}, {"filename": "/gamedata/assassin_m.msm", "start": 2556396, "end": 2592466}, {"filename": "/gamedata/assassin_w.msm", "start": 2592466, "end": 2630852}, {"filename": "/gamedata/atlasinfo.txt", "start": 2630852, "end": 2635683}, {"filename": "/gamedata/item_list.txt", "start": 2635683, "end": 2887811}, {"filename": "/gamedata/item_proto", "start": 2887811, "end": 3041235}, {"filename": "/gamedata/item_scale.txt", "start": 3041235, "end": 3046609}, {"filename": "/gamedata/mob_proto", "start": 3046609, "end": 3105257}, {"filename": "/gamedata/npclist.txt", "start": 3105257, "end": 3147388}, {"filename": "/gamedata/race_height.txt", "start": 3147388, "end": 3148264}, {"filename": "/gamedata/shaman_m.msm", "start": 3148264, "end": 3185054}, {"filename": "/gamedata/shaman_w.msm", "start": 3185054, "end": 3222646}, {"filename": "/gamedata/skilltable.txt", "start": 3222646, "end": 3235570}, {"filename": "/gamedata/sura_m.msm", "start": 3235570, "end": 3270997}, {"filename": "/gamedata/sura_w.msm", "start": 3270997, "end": 3308618}, {"filename": "/gamedata/warrior_m.msm", "start": 3308618, "end": 3346246}, {"filename": "/gamedata/warrior_w.msm", "start": 3346246, "end": 3385632}, {"filename": "/gamedata/wolfman_m.msm", "start": 3385632, "end": 3446147}, {"filename": "/gamefont.py", "start": 3446147, "end": 3447227}, {"filename": "/gmpossess.py", "start": 3447227, "end": 3460518}, {"filename": "/grpblk.txt", "start": 3460518, "end": 3460992}, {"filename": "/guildwarkills.py", "start": 3460992, "end": 3465336}, {"filename": "/hash_utils.py", "start": 3465336, "end": 3466357}, {"filename": "/interfaceModule.py", "start": 3466357, "end": 3680384}, {"filename": "/introCreate.py", "start": 3680384, "end": 3708365}, {"filename": "/introEmpire.py", "start": 3708365, "end": 3717261}, {"filename": "/introLoading.py", "start": 3717261, "end": 3729429}, {"filename": "/introLogin.py", "start": 3729429, "end": 3785606}, {"filename": "/introLogo.py", "start": 3785606, "end": 3789666}, {"filename": "/introSelect.py", "start": 3789666, "end": 3811995}, {"filename": "/introloginold.py", "start": 3811995, "end": 3848093}, {"filename": "/inventoryarrange.py", "start": 3848093, "end": 3856578}, {"filename": "/inventorypagelocks.py", "start": 3856578, "end": 3864878}, {"filename": "/inventorysortpins.py", "start": 3864878, "end": 3889261}, {"filename": "/itemshop_contentwindow.py", "start": 3889261, "end": 3889561}, {"filename": "/itemshop_shopwindow.py", "start": 3889561, "end": 3910116}, {"filename": "/itemshop_subscriptionwindow.py", "start": 3910116, "end": 3916480}, {"filename": "/itemshop_usevoucher.py", "start": 3916480, "end": 3919539}, {"filename": "/lib/UserDict.pyc", "start": 3919539, "end": 3928539}, {"filename": "/lib/__future__.pyc", "start": 3928539, "end": 3932970}, {"filename": "/lib/_abcoll.pyc", "start": 3932970, "end": 3955309}, {"filename": "/lib/_locale.pyc", "start": 3955309, "end": 4005150}, {"filename": "/lib/_weakrefset.pyc", "start": 4005150, "end": 4015640}, {"filename": "/lib/abc.pyc", "start": 4015640, "end": 4021827}, {"filename": "/lib/base64.pyc", "start": 4021827, "end": 4032314}, {"filename": "/lib/bisect.pyc", "start": 4032314, "end": 4035550}, {"filename": "/lib/codecs.pyc", "start": 4035550, "end": 4072528}, {"filename": "/lib/collections.pyc", "start": 4072528, "end": 4098700}, {"filename": "/lib/copy.pyc", "start": 4098700, "end": 4110870}, {"filename": "/lib/copy_reg.pyc", "start": 4110870, "end": 4116027}, {"filename": "/lib/decimal.pyc", "start": 4116027, "end": 4283006}, {"filename": "/lib/difflib.pyc", "start": 4283006, "end": 4343770}, {"filename": "/lib/encodings/__init__.pyc", "start": 4343770, "end": 4348280}, {"filename": "/lib/encodings/aliases.pyc", "start": 4348280, "end": 4357083}, {"filename": "/lib/encodings/cp949.pyc", "start": 4357083, "end": 4359092}, {"filename": "/lib/fnmatch.pyc", "start": 4359092, "end": 4362824}, {"filename": "/lib/functools.pyc", "start": 4362824, "end": 4369017}, {"filename": "/lib/genericpath.pyc", "start": 4369017, "end": 4372320}, {"filename": "/lib/hashlib.pyc", "start": 4372320, "end": 4376520}, {"filename": "/lib/heapq.pyc", "start": 4376520, "end": 4390416}, {"filename": "/lib/json/__init__.pyc", "start": 4390416, "end": 4404317}, {"filename": "/lib/json/decoder.pyc", "start": 4404317, "end": 4416217}, {"filename": "/lib/json/encoder.pyc", "start": 4416217, "end": 4429853}, {"filename": "/lib/json/scanner.pyc", "start": 4429853, "end": 4432067}, {"filename": "/lib/keyword.pyc", "start": 4432067, "end": 4434236}, {"filename": "/lib/linecache.pyc", "start": 4434236, "end": 4437471}, {"filename": "/lib/locale.pyc", "start": 4437471, "end": 4487312}, {"filename": "/lib/metin2hub.com.txt", "start": 4487312, "end": 4487377}, {"filename": "/lib/ntpath.pyc", "start": 4487377, "end": 4499338}, {"filename": "/lib/numbers.pyc", "start": 4499338, "end": 4512296}, {"filename": "/lib/os.pyc", "start": 4512296, "end": 4538065}, {"filename": "/lib/random.pyc", "start": 4538065, "end": 4562844}, {"filename": "/lib/re.pyc", "start": 4562844, "end": 4576022}, {"filename": "/lib/shlex.pyc", "start": 4576022, "end": 4583632}, {"filename": "/lib/shutil.pyc", "start": 4583632, "end": 4602905}, {"filename": "/lib/simplejson/__init__.py", "start": 4602905, "end": 4627234}, {"filename": "/lib/simplejson/__init__.pyc", "start": 4627234, "end": 4649491}, {"filename": "/lib/simplejson/compat.py", "start": 4649491, "end": 4650340}, {"filename": "/lib/simplejson/compat.pyc", "start": 4650340, "end": 4651675}, {"filename": "/lib/simplejson/decoder.py", "start": 4651675, "end": 4666594}, {"filename": "/lib/simplejson/decoder.pyc", "start": 4666594, "end": 4679309}, {"filename": "/lib/simplejson/encoder.py", "start": 4679309, "end": 4708601}, {"filename": "/lib/simplejson/encoder.pyc", "start": 4708601, "end": 4731116}, {"filename": "/lib/simplejson/errors.py", "start": 4731116, "end": 4732948}, {"filename": "/lib/simplejson/errors.pyc", "start": 4732948, "end": 4735585}, {"filename": "/lib/simplejson/ordered_dict.py", "start": 4735585, "end": 4738633}, {"filename": "/lib/simplejson/ordered_dict.pyc", "start": 4738633, "end": 4743975}, {"filename": "/lib/simplejson/raw_json.py", "start": 4743975, "end": 4744201}, {"filename": "/lib/simplejson/raw_json.pyc", "start": 4744201, "end": 4744983}, {"filename": "/lib/simplejson/scanner.py", "start": 4744983, "end": 4748039}, {"filename": "/lib/simplejson/scanner.pyc", "start": 4748039, "end": 4751137}, {"filename": "/lib/simplejson/tool.py", "start": 4751137, "end": 4752315}, {"filename": "/lib/simplejson/tool.pyc", "start": 4752315, "end": 4753811}, {"filename": "/lib/site.pyc", "start": 4753811, "end": 4772986}, {"filename": "/lib/sre_compile.pyc", "start": 4772986, "end": 4784093}, {"filename": "/lib/sre_constants.pyc", "start": 4784093, "end": 4790201}, {"filename": "/lib/sre_parse.pyc", "start": 4790201, "end": 4809445}, {"filename": "/lib/stat.pyc", "start": 4809445, "end": 4812236}, {"filename": "/lib/string.pyc", "start": 4812236, "end": 4831892}, {"filename": "/lib/struct.pyc", "start": 4831892, "end": 4832114}, {"filename": "/lib/subprocess.pyc", "start": 4832114, "end": 4864730}, {"filename": "/lib/sysconfig.pyc", "start": 4864730, "end": 4882301}, {"filename": "/lib/threading.pyc", "start": 4882301, "end": 4925321}, {"filename": "/lib/traceback.pyc", "start": 4925321, "end": 4937024}, {"filename": "/lib/types.pyc", "start": 4937024, "end": 4939554}, {"filename": "/lib/uuid.pyc", "start": 4939554, "end": 4959877}, {"filename": "/lib/warnings.pyc", "start": 4959877, "end": 4973109}, {"filename": "/lib/weakref.pyc", "start": 4973109, "end": 4989146}, {"filename": "/lib/xml/__init__.pyc", "start": 4989146, "end": 4990263}, {"filename": "/lib/xml/dom/__init__.pyc", "start": 4990263, "end": 4997600}, {"filename": "/lib/xml/dom/domreg.pyc", "start": 4997600, "end": 5001106}, {"filename": "/lib/xml/dom/expatbuilder.pyc", "start": 5001106, "end": 5037804}, {"filename": "/lib/xml/dom/minicompat.pyc", "start": 5037804, "end": 5041948}, {"filename": "/lib/xml/dom/minidom.pyc", "start": 5041948, "end": 5116652}, {"filename": "/lib/xml/dom/minidomer.pyc", "start": 5116652, "end": 5116725}, {"filename": "/lib/xml/dom/nodefilter.pyc", "start": 5116725, "end": 5117968}, {"filename": "/lib/xml/dom/xmlbuilder.pyc", "start": 5117968, "end": 5136627}, {"filename": "/lib/xml/parsers/__init__.pyc", "start": 5136627, "end": 5136980}, {"filename": "/lib/xml/parsers/expat.pyc", "start": 5136980, "end": 5137306}, {"filename": "/lib/xml/parsers/invers.pyc", "start": 5137306, "end": 5137322}, {"filename": "/locale.cfg", "start": 5137322, "end": 5137336}, {"filename": "/locale/common/locale_game_ex.txt", "start": 5137336, "end": 5139368}, {"filename": "/locale/common/locale_game_ikashop.txt", "start": 5139368, "end": 5153400}, {"filename": "/locale/common/locale_interface_ex.txt", "start": 5153400, "end": 5153809}, {"filename": "/locale/common/mob_drop_item.txt", "start": 5153809, "end": 5220696}, {"filename": "/locale/common/refine_table.txt", "start": 5220696, "end": 5270655}, {"filename": "/locale/common/special_item_group.txt", "start": 5270655, "end": 5298789}, {"filename": "/locale/common/ui/dragonsoulrefinewindow.py", "start": 5298789, "end": 5303078}, {"filename": "/locale/common/ui/dragonsoulwindow.py", "start": 5303078, "end": 5311992}, {"filename": "/locale/common/ui/energybar.py", "start": 5311992, "end": 5313160}, {"filename": "/locale/common/ui/expandedtaskbar.py", "start": 5313160, "end": 5315806}, {"filename": "/locale/common/ui/giftbox.py", "start": 5315806, "end": 5316405}, {"filename": "/locale/common/ui/inventorywindow.py", "start": 5316405, "end": 5352489}, {"filename": "/locale/common/ui/loadingwindow.py", "start": 5352489, "end": 5353663}, {"filename": "/locale/common/ui/login/login.dds", "start": 5353663, "end": 5419327}, {"filename": "/locale/common/ui/login/loginwindow.sub", "start": 5419327, "end": 5419410}, {"filename": "/locale/common/ui/loginwindow.py", "start": 5419410, "end": 5439639}, {"filename": "/locale/common/ui/new_createcharacterwindow.py", "start": 5439639, "end": 5456943}, {"filename": "/locale/common/ui/new_selectcharacterwindow.py", "start": 5456943, "end": 5471539}, {"filename": "/locale/common/ui/passworddialog.py", "start": 5471539, "end": 5474362}, {"filename": "/locale/common/ui/selectcharacterwindow.py", "start": 5474362, "end": 5494764}, {"filename": "/locale/common/ui/selectempirewindow.py", "start": 5494764, "end": 5508184}, {"filename": "/locale/common/ui/systemdialog.py", "start": 5508184, "end": 5511021}, {"filename": "/locale/common/ui/taskbar.py", "start": 5511021, "end": 5522409}, {"filename": "/locale/common/ui/taskbar_coin.py", "start": 5522409, "end": 5533797}, {"filename": "/locale/common/ui/taskbar_egg.py", "start": 5533797, "end": 5544625}, {"filename": "/locale/common/ui/taskbar_heart.py", "start": 5544625, "end": 5556045}, {"filename": "/locale/common/ui/taskbar_pumpkin.py", "start": 5556045, "end": 5567529}, {"filename": "/locale/common/ui/webwindow.py", "start": 5567529, "end": 5568470}, {"filename": "/locale/en/empiredesc_a.txt", "start": 5568470, "end": 5569298}, {"filename": "/locale/en/empiredesc_b.txt", "start": 5569298, "end": 5570334}, {"filename": "/locale/en/empiredesc_c.txt", "start": 5570334, "end": 5571053}, {"filename": "/locale/en/guildbuildinglist.txt", "start": 5571053, "end": 5575615}, {"filename": "/locale/en/item_names.txt", "start": 5575615, "end": 5721127}, {"filename": "/locale/en/itemdesc.txt", "start": 5721127, "end": 5982185}, {"filename": "/locale/en/jobdesc_assassin.txt", "start": 5982185, "end": 5982765}, {"filename": "/locale/en/jobdesc_shaman.txt", "start": 5982765, "end": 5983223}, {"filename": "/locale/en/jobdesc_sura.txt", "start": 5983223, "end": 5983800}, {"filename": "/locale/en/jobdesc_warrior.txt", "start": 5983800, "end": 5984371}, {"filename": "/locale/en/locale_game.txt", "start": 5984371, "end": 6021404}, {"filename": "/locale/en/locale_game_ikashop.txt", "start": 6021404, "end": 6021566}, {"filename": "/locale/en/locale_interface.txt", "start": 6021566, "end": 6031693}, {"filename": "/locale/en/mob_names.txt", "start": 6031693, "end": 6066281}, {"filename": "/locale/en/rules.txt", "start": 6066281, "end": 6068345}, {"filename": "/locale/en/skilldesc.txt", "start": 6068345, "end": 6088156}, {"filename": "/locale/en/ui/login/loginwindow.sub", "start": 6088156, "end": 6088246}, {"filename": "/locale/en/ui/login/loginwindow.tga", "start": 6088246, "end": 6191458}, {"filename": "/locale/en/wiki_game.txt", "start": 6191458, "end": 6196186}, {"filename": "/locale/pl/empiredesc_a.txt", "start": 6196186, "end": 6196966}, {"filename": "/locale/pl/empiredesc_b.txt", "start": 6196966, "end": 6198068}, {"filename": "/locale/pl/empiredesc_c.txt", "start": 6198068, "end": 6198761}, {"filename": "/locale/pl/guildbuildinglist.txt", "start": 6198761, "end": 6203396}, {"filename": "/locale/pl/itemdesc.txt", "start": 6203396, "end": 6472081}, {"filename": "/locale/pl/jobdesc_assassin.txt", "start": 6472081, "end": 6472507}, {"filename": "/locale/pl/jobdesc_shaman.txt", "start": 6472507, "end": 6472909}, {"filename": "/locale/pl/jobdesc_sura.txt", "start": 6472909, "end": 6473354}, {"filename": "/locale/pl/jobdesc_warrior.txt", "start": 6473354, "end": 6473797}, {"filename": "/locale/pl/locale_game.txt", "start": 6473797, "end": 6551233}, {"filename": "/locale/pl/locale_game_marty.txt", "start": 6551233, "end": 6732836}, {"filename": "/locale/pl/locale_interface.txt", "start": 6732836, "end": 6751767}, {"filename": "/locale/pl/map/gm_guild_build_point.txt", "start": 6751767, "end": 6751827}, {"filename": "/locale/pl/map/map_a2_point.txt", "start": 6751827, "end": 6752085}, {"filename": "/locale/pl/map/map_b2_point.txt", "start": 6752085, "end": 6752386}, {"filename": "/locale/pl/map/map_c2_point.txt", "start": 6752386, "end": 6752685}, {"filename": "/locale/pl/map/map_n_snowm_01_point.txt", "start": 6752685, "end": 6753056}, {"filename": "/locale/pl/map/map_n_snowm_02_point.txt", "start": 6753056, "end": 6753210}, {"filename": "/locale/pl/map/metin2_guild_village_01_point.txt", "start": 6753210, "end": 6753312}, {"filename": "/locale/pl/map/metin2_guild_village_02_point.txt", "start": 6753312, "end": 6753414}, {"filename": "/locale/pl/map/metin2_guild_village_03_point.txt", "start": 6753414, "end": 6753516}, {"filename": "/locale/pl/map/metin2_map_a1_point.txt", "start": 6753516, "end": 6754701}, {"filename": "/locale/pl/map/metin2_map_a3_point.txt", "start": 6754701, "end": 6755280}, {"filename": "/locale/pl/map/metin2_map_anglar_dungeon_01_point.txt", "start": 6755280, "end": 6755300}, {"filename": "/locale/pl/map/metin2_map_b1_point.txt", "start": 6755300, "end": 6756424}, {"filename": "/locale/pl/map/metin2_map_b3_point.txt", "start": 6756424, "end": 6757000}, {"filename": "/locale/pl/map/metin2_map_bayblacksand_point.txt", "start": 6757000, "end": 6757104}, {"filename": "/locale/pl/map/metin2_map_bf_02_point.txt", "start": 6757104, "end": 6757124}, {"filename": "/locale/pl/map/metin2_map_bf_03_point.txt", "start": 6757124, "end": 6757144}, {"filename": "/locale/pl/map/metin2_map_bf_point.txt", "start": 6757144, "end": 6757164}, {"filename": "/locale/pl/map/metin2_map_c1_point.txt", "start": 6757164, "end": 6758306}, {"filename": "/locale/pl/map/metin2_map_c3_point.txt", "start": 6758306, "end": 6758883}, {"filename": "/locale/pl/map/metin2_map_capedragonhead_point.txt", "start": 6758883, "end": 6759418}, {"filename": "/locale/pl/map/metin2_map_dawnmist_dungeon_01_point.txt", "start": 6759418, "end": 6759522}, {"filename": "/locale/pl/map/metin2_map_dawnmistwood_point.txt", "start": 6759522, "end": 6759652}, {"filename": "/locale/pl/map/metin2_map_defensewave_port_point.txt", "start": 6759652, "end": 6759796}, {"filename": "/locale/pl/map/metin2_map_e1_01_point.txt", "start": 6759796, "end": 6759900}, {"filename": "/locale/pl/map/metin2_map_e1_02_point.txt", "start": 6759900, "end": 6760004}, {"filename": "/locale/pl/map/metin2_map_e1_03_point.txt", "start": 6760004, "end": 6760108}, {"filename": "/locale/pl/map/metin2_map_e1_point.txt", "start": 6760108, "end": 6760212}, {"filename": "/locale/pl/map/metin2_map_eastplain_01_point.txt", "start": 6760212, "end": 6760899}, {"filename": "/locale/pl/map/metin2_map_eastplain_03_point.txt", "start": 6760899, "end": 6760981}, {"filename": "/locale/pl/map/metin2_map_elemental_04_point.txt", "start": 6760981, "end": 6761001}, {"filename": "/locale/pl/map/metin2_map_empirewar01_point.txt", "start": 6761001, "end": 6761059}, {"filename": "/locale/pl/map/metin2_map_empirewar02_point.txt", "start": 6761059, "end": 6761117}, {"filename": "/locale/pl/map/metin2_map_empirewar03_point.txt", "start": 6761117, "end": 6761175}, {"filename": "/locale/pl/map/metin2_map_guild_01_point.txt", "start": 6761175, "end": 6761235}, {"filename": "/locale/pl/map/metin2_map_guild_02_point.txt", "start": 6761235, "end": 6761296}, {"filename": "/locale/pl/map/metin2_map_guild_03_point.txt", "start": 6761296, "end": 6761358}, {"filename": "/locale/pl/map/metin2_map_icecrystalcave_point.txt", "start": 6761358, "end": 6761444}, {"filename": "/locale/pl/map/metin2_map_milgyo_point.txt", "start": 6761444, "end": 6761653}, {"filename": "/locale/pl/map/metin2_map_mists_of_island_point.txt", "start": 6761653, "end": 6761758}, {"filename": "/locale/pl/map/metin2_map_monkey_dungeon2_point.txt", "start": 6761758, "end": 6762378}, {"filename": "/locale/pl/map/metin2_map_monkey_dungeon3_point.txt", "start": 6762378, "end": 6762954}, {"filename": "/locale/pl/map/metin2_map_monkey_dungeon_11_point.txt", "start": 6762954, "end": 6763508}, {"filename": "/locale/pl/map/metin2_map_monkey_dungeon_12_point.txt", "start": 6763508, "end": 6764062}, {"filename": "/locale/pl/map/metin2_map_monkey_dungeon_13_point.txt", "start": 6764062, "end": 6764616}, {"filename": "/locale/pl/map/metin2_map_monkey_dungeon_point.txt", "start": 6764616, "end": 6764637}, {"filename": "/locale/pl/map/metin2_map_mt_th_dungeon_01_point.txt", "start": 6764637, "end": 6764657}, {"filename": "/locale/pl/map/metin2_map_mt_thunder_point.txt", "start": 6764657, "end": 6764700}, {"filename": "/locale/pl/map/metin2_map_n_desert_01_point.txt", "start": 6764700, "end": 6764941}, {"filename": "/locale/pl/map/metin2_map_n_flame_01_point.txt", "start": 6764941, "end": 6765235}, {"filename": "/locale/pl/map/metin2_map_n_flame_02_point.txt", "start": 6765235, "end": 6765298}, {"filename": "/locale/pl/map/metin2_map_n_flame_dungeon_01_point.txt", "start": 6765298, "end": 6765361}, {"filename": "/locale/pl/map/metin2_map_nusluck01_point.txt", "start": 6765361, "end": 6765381}, {"filename": "/locale/pl/map/metin2_map_privateshop_point.txt", "start": 6765381, "end": 6765589}, {"filename": "/locale/pl/map/metin2_map_skipia_dungeon_01_point.txt", "start": 6765589, "end": 6765782}, {"filename": "/locale/pl/map/metin2_map_skipia_dungeon_02_point.txt", "start": 6765782, "end": 6765866}, {"filename": "/locale/pl/map/metin2_map_skipia_dungeon_boss_point.txt", "start": 6765866, "end": 6765887}, {"filename": "/locale/pl/map/metin2_map_smhdungeon_01_point.txt", "start": 6765887, "end": 6765969}, {"filename": "/locale/pl/map/metin2_map_snakevalley_point.txt", "start": 6765969, "end": 6766073}, {"filename": "/locale/pl/map/metin2_map_spiderdungeon_02_point.txt", "start": 6766073, "end": 6766115}, {"filename": "/locale/pl/map/metin2_map_spiderdungeon_03_point.txt", "start": 6766115, "end": 6766156}, {"filename": "/locale/pl/map/metin2_map_spiderdungeon_point.txt", "start": 6766156, "end": 6766237}, {"filename": "/locale/pl/map/metin2_map_trent02_point.txt", "start": 6766237, "end": 6766279}, {"filename": "/locale/pl/map/metin2_map_trent_point.txt", "start": 6766279, "end": 6766338}, {"filename": "/locale/pl/map/metin2_map_wedding_01_point.txt", "start": 6766338, "end": 6766562}, {"filename": "/locale/pl/map/metin2_map_whitdragonvalley_point.txt", "start": 6766562, "end": 6766645}, {"filename": "/locale/pl/map/metin2_map_wl_01_point.txt", "start": 6766645, "end": 6766704}, {"filename": "/locale/pl/rules.txt", "start": 6766704, "end": 6768741}, {"filename": "/locale/pl/skilldesc.txt", "start": 6768741, "end": 6788979}, {"filename": "/locale/pl/ui/dragonsoulrefinewindow.py", "start": 6788979, "end": 6793346}, {"filename": "/locale/pl/ui/energybar.py", "start": 6793346, "end": 6794514}, {"filename": "/locale/pl/ui/expandedtaskbar.py", "start": 6794514, "end": 6799402}, {"filename": "/locale/pl/ui/giftbox.py", "start": 6799402, "end": 6800001}, {"filename": "/locale/pl/ui/inventorywindow.py", "start": 6800001, "end": 6827701}, {"filename": "/locale/pl/ui/loadingwindow.py", "start": 6827701, "end": 6829340}, {"filename": "/locale/pl/ui/login/login.dds", "start": 6829340, "end": 7146908}, {"filename": "/locale/pl/ui/login/loginwindow.sub", "start": 7146908, "end": 7146992}, {"filename": "/locale/pl/ui/login_small.jpg", "start": 7146992, "end": 7442485}, {"filename": "/locale/pl/ui/loginwindow.py", "start": 7442485, "end": 7462774}, {"filename": "/locale/pl/ui/new_createcharacterwindow.py", "start": 7462774, "end": 7480061}, {"filename": "/locale/pl/ui/newtaskbar.py", "start": 7480061, "end": 7492550}, {"filename": "/locale/pl/ui/passworddialog.py", "start": 7492550, "end": 7495373}, {"filename": "/locale/pl/ui/selectcharacterwindow.py", "start": 7495373, "end": 7515767}, {"filename": "/locale/pl/ui/selectempirewindow.py", "start": 7515767, "end": 7521820}, {"filename": "/locale/pl/ui/systemdialog.py", "start": 7521820, "end": 7525392}, {"filename": "/locale/pl/ui/taskbar.py", "start": 7525392, "end": 7536686}, {"filename": "/locale/pl/ui/webwindow.py", "start": 7536686, "end": 7537627}, {"filename": "/locale/pl/wiki_game.txt", "start": 7537627, "end": 7542585}, {"filename": "/locale/tr/atlasinfo.txt", "start": 7542585, "end": 7548839}, {"filename": "/locale/tr/attendance_desc.txt", "start": 7548839, "end": 7550169}, {"filename": "/locale/tr/battle_pass.txt", "start": 7550169, "end": 7551900}, {"filename": "/locale/tr/catchking_event_desc.txt", "start": 7551900, "end": 7555002}, {"filename": "/locale/tr/catchking_event_simple_desc - Copy.txt", "start": 7555002, "end": 7555331}, {"filename": "/locale/tr/catchking_event_simple_desc.txt", "start": 7555331, "end": 7555660}, {"filename": "/locale/tr/chest_drop", "start": 7555660, "end": 7593040}, {"filename": "/locale/tr/desc_battle_field.txt", "start": 7593040, "end": 7594346}, {"filename": "/locale/tr/empiredesc_a.txt", "start": 7594346, "end": 7595119}, {"filename": "/locale/tr/empiredesc_b.txt", "start": 7595119, "end": 7596144}, {"filename": "/locale/tr/empiredesc_c.txt", "start": 7596144, "end": 7596850}, {"filename": "/locale/tr/fish_event_desc.txt", "start": 7596850, "end": 7597743}, {"filename": "/locale/tr/guildbuildinglist.txt", "start": 7597743, "end": 7606123}, {"filename": "/locale/tr/guildbuildinglist_playerbots.txt", "start": 7606123, "end": 7610613}, {"filename": "/locale/tr/insult.txt", "start": 7610613, "end": 7610619}, {"filename": "/locale/tr/item_names.txt", "start": 7610619, "end": 7925918}, {"filename": "/locale/tr/item_proto", "start": 7925918, "end": 8181454}, {"filename": "/locale/tr/item_proto.txt", "start": 8181454, "end": 10636998}, {"filename": "/locale/tr/item_scale.txt", "start": 10636998, "end": 10648715}, {"filename": "/locale/tr/itemdesc.txt", "start": 10648715, "end": 11255978}, {"filename": "/locale/tr/jobdesc_assassin.txt", "start": 11255978, "end": 11256345}, {"filename": "/locale/tr/jobdesc_shaman.txt", "start": 11256345, "end": 11256718}, {"filename": "/locale/tr/jobdesc_sura.txt", "start": 11256718, "end": 11257147}, {"filename": "/locale/tr/jobdesc_warrior.txt", "start": 11257147, "end": 11257554}, {"filename": "/locale/tr/locale_game.txt", "start": 11257554, "end": 11418095}, {"filename": "/locale/tr/locale_game_ikashop.txt", "start": 11418095, "end": 11431875}, {"filename": "/locale/tr/locale_interface.txt", "start": 11431875, "end": 11463257}, {"filename": "/locale/tr/locale_interface_ex.txt", "start": 11463257, "end": 11463779}, {"filename": "/locale/tr/locale_quest.txt", "start": 11463779, "end": 11480620}, {"filename": "/locale/tr/locale_string.txt", "start": 11480620, "end": 11527145}, {"filename": "/locale/tr/mini_game_okey_desc.txt", "start": 11527145, "end": 11528562}, {"filename": "/locale/tr/mob_names.txt", "start": 11528562, "end": 11596186}, {"filename": "/locale/tr/mob_proto", "start": 11596186, "end": 11664314}, {"filename": "/locale/tr/mob_proto.txt", "start": 11664314, "end": 12192361}, {"filename": "/locale/tr/mob_scale.txt", "start": 12192361, "end": 12193695}, {"filename": "/locale/tr/monster_card.txt", "start": 12193695, "end": 12197615}, {"filename": "/locale/tr/partymatch_info.txt", "start": 12197615, "end": 12198632}, {"filename": "/locale/tr/pet_skill.txt", "start": 12198632, "end": 12199974}, {"filename": "/locale/tr/pet_skill_bonus.txt", "start": 12199974, "end": 12200935}, {"filename": "/locale/tr/playerbot_texts.txt", "start": 12200935, "end": 12319702}, {"filename": "/locale/tr/rules.txt", "start": 12319702, "end": 12321815}, {"filename": "/locale/tr/shop_deco.txt", "start": 12321815, "end": 12322320}, {"filename": "/locale/tr/shop_titles.txt", "start": 12322320, "end": 12340545}, {"filename": "/locale/tr/skilldesc.txt", "start": 12340545, "end": 12360675}, {"filename": "/locale/tr/skilltable.txt", "start": 12360675, "end": 12374383}, {"filename": "/locale/tr/skilltable2.txt", "start": 12374383, "end": 12387174}, {"filename": "/locale/tr/ui/login/loginwindow.sub", "start": 12387174, "end": 12387264}, {"filename": "/locale/tr/ui/login/loginwindow.tga", "start": 12387264, "end": 12490476}, {"filename": "/locale/tr/user_situation.txt", "start": 12490476, "end": 12491113}, {"filename": "/locale/tr/web_linked_banner.txt", "start": 12491113, "end": 12491326}, {"filename": "/locale/tr/wiki_game.txt", "start": 12491326, "end": 12496314}, {"filename": "/localeInfo.py", "start": 12496314, "end": 12561614}, {"filename": "/localeinfo_point.py", "start": 12561614, "end": 12574357}, {"filename": "/marketquantitydialog.py", "start": 12574357, "end": 12578782}, {"filename": "/mathUtils.py", "start": 12578782, "end": 12581789}, {"filename": "/metin2.cfg", "start": 12581789, "end": 12581934}, {"filename": "/mouse.cfg", "start": 12581934, "end": 12581937}, {"filename": "/mouseModule.py", "start": 12581937, "end": 12594043}, {"filename": "/musicInfo.py", "start": 12594043, "end": 12594552}, {"filename": "/networkModule.py", "start": 12594552, "end": 12603541}, {"filename": "/offlineShopBuilder.py", "start": 12603541, "end": 12623394}, {"filename": "/offlineShopGuest.py", "start": 12623394, "end": 12646005}, {"filename": "/offlineShopHistory.py", "start": 12646005, "end": 12650296}, {"filename": "/offlineShopManage.py", "start": 12650296, "end": 12704753}, {"filename": "/offlineShopSearch.py", "start": 12704753, "end": 12735365}, {"filename": "/offlineShopUi.py", "start": 12735365, "end": 12744960}, {"filename": "/pickupnearby.py", "start": 12744960, "end": 12747194}, {"filename": "/playerSettingModule.py", "start": 12747194, "end": 12755670}, {"filename": "/playerbot_client_update.py", "start": 12755670, "end": 12757266}, {"filename": "/playerbot_client_version.py", "start": 12757266, "end": 12757393}, {"filename": "/playerbot_lang.py", "start": 12757393, "end": 12763220}, {"filename": "/playerbot_quest_titles.py", "start": 12763220, "end": 12768246}, {"filename": "/playerbot_status_keys.py", "start": 12768246, "end": 12779272}, {"filename": "/playerbot_status_tail.py", "start": 12779272, "end": 12793501}, {"filename": "/property.json", "start": 12793501, "end": 13206395}, {"filename": "/property/crc_index.txt", "start": 13206395, "end": 13283596}, {"filename": "/prototype.py", "start": 13283596, "end": 13285187}, {"filename": "/qolfov.py", "start": 13285187, "end": 13287178}, {"filename": "/qolfps.py", "start": 13287178, "end": 13289370}, {"filename": "/qolmapname.py", "start": 13289370, "end": 13293367}, {"filename": "/qolnewitems.py", "start": 13293367, "end": 13297880}, {"filename": "/qolrefinehold.py", "start": 13297880, "end": 13299188}, {"filename": "/qolsnow.py", "start": 13299188, "end": 13302349}, {"filename": "/questcurtain.py", "start": 13302349, "end": 13304490}, {"filename": "/refineassist.py", "start": 13304490, "end": 13321919}, {"filename": "/refinestorage.py", "start": 13321919, "end": 13338104}, {"filename": "/replay3d.py", "start": 13338104, "end": 13365526}, {"filename": "/rootlibcythonizer.py", "start": 13365526, "end": 13366350}, {"filename": "/safeboxtransfer.py", "start": 13366350, "end": 13374612}, {"filename": "/safeshopslots.py", "start": 13374612, "end": 13375591}, {"filename": "/serverCommandParser.py", "start": 13375591, "end": 13381135}, {"filename": "/serverInfo.py", "start": 13381135, "end": 13385946}, {"filename": "/shop_title_tr.py", "start": 13385946, "end": 13390138}, {"filename": "/shopautoprice.py", "start": 13390138, "end": 13407285}, {"filename": "/shoppricebatch.py", "start": 13407285, "end": 13413075}, {"filename": "/shoppricepump.py", "start": 13413075, "end": 13419661}, {"filename": "/sidekickbuy.py", "start": 13419661, "end": 13422370}, {"filename": "/sidekickcollision.py", "start": 13422370, "end": 13428197}, {"filename": "/sidekickskilltip.py", "start": 13428197, "end": 13448205}, {"filename": "/skillbookicon.py", "start": 13448205, "end": 13450079}, {"filename": "/soundvolume.py", "start": 13450079, "end": 13452977}, {"filename": "/special_flags.py", "start": 13452977, "end": 13453609}, {"filename": "/stringCommander.py", "start": 13453609, "end": 13455407}, {"filename": "/system.py", "start": 13455407, "end": 13465056}, {"filename": "/tahoma.ttf", "start": 13465056, "end": 14384316}, {"filename": "/test_affect.py", "start": 14384316, "end": 14385331}, {"filename": "/tween.py", "start": 14385331, "end": 14387000}, {"filename": "/tweenCamera.py", "start": 14387000, "end": 14394098}, {"filename": "/ui.py", "start": 14394098, "end": 14579754}, {"filename": "/uiAffectBar.py", "start": 14579754, "end": 14616623}, {"filename": "/uiAttachMetin.py", "start": 14616623, "end": 14620640}, {"filename": "/uiAttributeList.py", "start": 14620640, "end": 14627139}, {"filename": "/uiBusyAction.py", "start": 14627139, "end": 14630673}, {"filename": "/uiCandidate.py", "start": 14630673, "end": 14634522}, {"filename": "/uiCaptcha.py", "start": 14634522, "end": 14641253}, {"filename": "/uiCharacter.py", "start": 14641253, "end": 14684147}, {"filename": "/uiCharacterDetails.py", "start": 14684147, "end": 14689554}, {"filename": "/uiChat.py", "start": 14689554, "end": 14728903}, {"filename": "/uiCommon.py", "start": 14728903, "end": 14748821}, {"filename": "/uiCraft.py", "start": 14748821, "end": 14776923}, {"filename": "/uiCube.py", "start": 14776923, "end": 14792156}, {"filename": "/uiDragonSoul.py", "start": 14792156, "end": 14850381}, {"filename": "/uiEquipmentDialog.py", "start": 14850381, "end": 14853707}, {"filename": "/uiExchange.py", "start": 14853707, "end": 14863568}, {"filename": "/uiFishing.py", "start": 14863568, "end": 14872585}, {"filename": "/uiFloatingText.py", "start": 14872585, "end": 14874213}, {"filename": "/uiGameButton.py", "start": 14874213, "end": 14877832}, {"filename": "/uiGameMaster.py", "start": 14877832, "end": 14885471}, {"filename": "/uiGameOption.py", "start": 14885471, "end": 14909237}, {"filename": "/uiGuild.py", "start": 14909237, "end": 14987960}, {"filename": "/uiHelp.py", "start": 14987960, "end": 14991049}, {"filename": "/uiHorseInventory.py", "start": 14991049, "end": 14999650}, {"filename": "/uiInventory.py", "start": 14999650, "end": 15075010}, {"filename": "/uiItemExchange.py", "start": 15075010, "end": 15083612}, {"filename": "/uiItemShop.py", "start": 15083612, "end": 15112630}, {"filename": "/uiMaintenance.py", "start": 15112630, "end": 15114049}, {"filename": "/uiMapNameShower.py", "start": 15114049, "end": 15124465}, {"filename": "/uiMessenger.py", "start": 15124465, "end": 15189181}, {"filename": "/uiMiniMap.py", "start": 15189181, "end": 15219316}, {"filename": "/uiMoveChannel.py", "start": 15219316, "end": 15223878}, {"filename": "/uiOption.py", "start": 15223878, "end": 15234739}, {"filename": "/uiParty.py", "start": 15234739, "end": 15257523}, {"filename": "/uiPhaseCurtain.py", "start": 15257523, "end": 15259063}, {"filename": "/uiPickETC.py", "start": 15259063, "end": 15261705}, {"filename": "/uiPickMoney.py", "start": 15261705, "end": 15268222}, {"filename": "/uiPlayerGauge.py", "start": 15268222, "end": 15269384}, {"filename": "/uiPlayerStat.py", "start": 15269384, "end": 15276527}, {"filename": "/uiPointReset.py", "start": 15276527, "end": 15278436}, {"filename": "/uiPotionRecharge.py", "start": 15278436, "end": 15290098}, {"filename": "/uiPrivateShopBuilder.py", "start": 15290098, "end": 15304862}, {"filename": "/uiQuest.py", "start": 15304862, "end": 15328755}, {"filename": "/uiRefine.py", "start": 15328755, "end": 15343860}, {"filename": "/uiReport.py", "start": 15343860, "end": 15346226}, {"filename": "/uiReputation.py", "start": 15346226, "end": 15349758}, {"filename": "/uiRestart.py", "start": 15349758, "end": 15351405}, {"filename": "/uiSafeBox.py", "start": 15351405, "end": 15373913}, {"filename": "/uiScriptLocale.py", "start": 15373913, "end": 15385172}, {"filename": "/uiSelectItem.py", "start": 15385172, "end": 15388634}, {"filename": "/uiSelectMusic.py", "start": 15388634, "end": 15393781}, {"filename": "/uiShop.py", "start": 15393781, "end": 15415544}, {"filename": "/uiSpecialShop.py", "start": 15415544, "end": 15423878}, {"filename": "/uiSystem.py", "start": 15423878, "end": 15430215}, {"filename": "/uiSystemOption.py", "start": 15430215, "end": 15439040}, {"filename": "/uiTarget.py", "start": 15439040, "end": 15471940}, {"filename": "/uiTaskBar.py", "start": 15471940, "end": 15507798}, {"filename": "/uiTip.py", "start": 15507798, "end": 15517091}, {"filename": "/uiToolTip.py", "start": 15517091, "end": 15631753}, {"filename": "/uiUploadMark.py", "start": 15631753, "end": 15641712}, {"filename": "/uiWeb.py", "start": 15641712, "end": 15643582}, {"filename": "/uiWhisper.py", "start": 15643582, "end": 15656727}, {"filename": "/uiWonExchange.py", "start": 15656727, "end": 15662551}, {"filename": "/ui_event.py", "start": 15662551, "end": 15664719}, {"filename": "/uiacce.py", "start": 15664719, "end": 15674389}, {"filename": "/uiautoban.py", "start": 15674389, "end": 15677664}, {"filename": "/uiautohunt.py", "start": 15677664, "end": 15970275}, {"filename": "/uiautohuntitems.py", "start": 15970275, "end": 16041212}, {"filename": "/uicharacternew.py", "start": 16041212, "end": 16090739}, {"filename": "/uichestopener.py", "start": 16090739, "end": 16109430}, {"filename": "/uichestpreview.py", "start": 16109430, "end": 16126252}, {"filename": "/uichestshortcut.py", "start": 16126252, "end": 16133937}, {"filename": "/uicollector.py", "start": 16133937, "end": 16184113}, {"filename": "/uidisplayoptions.py", "start": 16184113, "end": 16194285}, {"filename": "/uiex.py", "start": 16194285, "end": 16195489}, {"filename": "/uiglobalrankingsmanager.py", "start": 16195489, "end": 16210776}, {"filename": "/uigmpanel.py", "start": 16210776, "end": 16313375}, {"filename": "/uiguildbots.py", "start": 16313375, "end": 16319998}, {"filename": "/uiikashop.py", "start": 16319998, "end": 16447959}, {"filename": "/uiinventorydrawer.py", "start": 16447959, "end": 16461731}, {"filename": "/uiitemtrash.py", "start": 16461731, "end": 16470659}, {"filename": "/uiminimapmarkers.py", "start": 16470659, "end": 16487942}, {"filename": "/uimobpreview.py", "start": 16487942, "end": 16496087}, {"filename": "/uiplayerbotadmin.py", "start": 16496087, "end": 16641762}, {"filename": "/uiplayerbotfame.py", "start": 16641762, "end": 16651255}, {"filename": "/uiplayerbothelp.py", "start": 16651255, "end": 16674684}, {"filename": "/uiplayerbotstyle.py", "start": 16674684, "end": 16677656}, {"filename": "/uiscript/AtlasWindow.py", "start": 16677656, "end": 16678513}, {"filename": "/uiscript/BeltInventoryWindow.py", "start": 16678513, "end": 16680488}, {"filename": "/uiscript/CharacterDetailsWindow.py", "start": 16680488, "end": 16694498}, {"filename": "/uiscript/CharacterWindow.py", "start": 16694498, "end": 16719161}, {"filename": "/uiscript/CinemachineWindow.py", "start": 16719161, "end": 16722809}, {"filename": "/uiscript/ConnectingDialog.py", "start": 16722809, "end": 16723642}, {"filename": "/uiscript/CostumeWindow.py", "start": 16723642, "end": 16730331}, {"filename": "/uiscript/CraftingWindow.py", "start": 16730331, "end": 16737609}, {"filename": "/uiscript/CubeResultWindow.py", "start": 16737609, "end": 16739208}, {"filename": "/uiscript/CubeWindow.py", "start": 16739208, "end": 16746523}, {"filename": "/uiscript/EquipmentDialog.py", "start": 16746523, "end": 16748222}, {"filename": "/uiscript/HelpWindow.py", "start": 16748222, "end": 16756747}, {"filename": "/uiscript/HelpWindow2.py", "start": 16756747, "end": 16765513}, {"filename": "/uiscript/IMEKOR.py", "start": 16765513, "end": 16766013}, {"filename": "/uiscript/InventoryWindow.py", "start": 16766013, "end": 16779442}, {"filename": "/uiscript/LoadingWindow.py", "start": 16779442, "end": 16781878}, {"filename": "/uiscript/LoginWindow.py", "start": 16781878, "end": 16790846}, {"filename": "/uiscript/MallWindow.py", "start": 16790846, "end": 16791978}, {"filename": "/uiscript/MarkListWindow.py", "start": 16791978, "end": 16793643}, {"filename": "/uiscript/MessengerWindow.py", "start": 16793643, "end": 16797260}, {"filename": "/uiscript/MiniMap.py", "start": 16797260, "end": 16801916}, {"filename": "/uiscript/MouseButtonWindow.py", "start": 16801916, "end": 16803249}, {"filename": "/uiscript/MoveChannelDialog.py", "start": 16803249, "end": 16804957}, {"filename": "/uiscript/MusicListWindow.py", "start": 16804957, "end": 16806626}, {"filename": "/uiscript/PartyMemberInfoBoard.py", "start": 16806626, "end": 16809218}, {"filename": "/uiscript/PickETCDialog.py", "start": 16809218, "end": 16810863}, {"filename": "/uiscript/PickMoneyDialog.py", "start": 16810863, "end": 16812510}, {"filename": "/uiscript/PickMoneyDialog_cheque.py", "start": 16812510, "end": 16817040}, {"filename": "/uiscript/PopupDialog.py", "start": 16817040, "end": 16818069}, {"filename": "/uiscript/PrivateShopBuilder.py", "start": 16818069, "end": 16823487}, {"filename": "/uiscript/PrivateShopGuest.py", "start": 16823487, "end": 16826908}, {"filename": "/uiscript/PrivateShopHistory.py", "start": 16826908, "end": 16829225}, {"filename": "/uiscript/PrivateShopManage.py", "start": 16829225, "end": 16837016}, {"filename": "/uiscript/RightMouseButtonWindow.py", "start": 16837016, "end": 16838324}, {"filename": "/uiscript/SafeboxWindow.py", "start": 16838324, "end": 16840448}, {"filename": "/uiscript/TaskBar.py", "start": 16840448, "end": 16852842}, {"filename": "/uiscript/WebWindow.py", "start": 16852842, "end": 16853665}, {"filename": "/uiscript/WhisperDialog.py", "start": 16853665, "end": 16858564}, {"filename": "/uiscript/WonExchangeWindow.py", "start": 16858564, "end": 16863044}, {"filename": "/uiscript/acce_absorbwindow.py", "start": 16863044, "end": 16865105}, {"filename": "/uiscript/acce_combinewindow.py", "start": 16865105, "end": 16867860}, {"filename": "/uiscript/acceptguildwardialog.py", "start": 16867860, "end": 16870984}, {"filename": "/uiscript/atlaswindow.py", "start": 16870984, "end": 16871841}, {"filename": "/uiscript/attachstonedialog.py", "start": 16871841, "end": 16874513}, {"filename": "/uiscript/attributelistwindow.py", "start": 16874513, "end": 16876153}, {"filename": "/uiscript/beltinventorywindow.py", "start": 16876153, "end": 16878128}, {"filename": "/uiscript/buildguildbuildingwindow.py", "start": 16878128, "end": 16886373}, {"filename": "/uiscript/captchadialog.py", "start": 16886373, "end": 16890663}, {"filename": "/uiscript/changegradenamedialog.py", "start": 16890663, "end": 16892184}, {"filename": "/uiscript/changepassworddialog.py", "start": 16892184, "end": 16895670}, {"filename": "/uiscript/characterdetailswindow.py", "start": 16895670, "end": 16910048}, {"filename": "/uiscript/characterwindow.py", "start": 16910048, "end": 16935518}, {"filename": "/uiscript/characterwindownew.py", "start": 16935518, "end": 16964522}, {"filename": "/uiscript/characterwindownewae.py", "start": 16964522, "end": 16993535}, {"filename": "/uiscript/cinemachinewindow.py", "start": 16993535, "end": 16997364}, {"filename": "/uiscript/configwindow.py", "start": 16997364, "end": 17008553}, {"filename": "/uiscript/connectingdialog.py", "start": 17008553, "end": 17009442}, {"filename": "/uiscript/costumewindow.py", "start": 17009442, "end": 17016131}, {"filename": "/uiscript/craftingwindow.py", "start": 17016131, "end": 17023771}, {"filename": "/uiscript/createcharacterwindow.py", "start": 17023771, "end": 17047238}, {"filename": "/uiscript/cuberesultwindow.py", "start": 17047238, "end": 17048935}, {"filename": "/uiscript/cubewindow.py", "start": 17048935, "end": 17056250}, {"filename": "/uiscript/declareguildwardialog.py", "start": 17056250, "end": 17059403}, {"filename": "/uiscript/dialog_busy_action.py", "start": 17059403, "end": 17060391}, {"filename": "/uiscript/dragonsoulrefinewindow.py", "start": 17060391, "end": 17064513}, {"filename": "/uiscript/dragonsoulwindow.py", "start": 17064513, "end": 17082910}, {"filename": "/uiscript/dragonsoulwindowae.py", "start": 17082910, "end": 17099850}, {"filename": "/uiscript/energybar.py", "start": 17099850, "end": 17101010}, {"filename": "/uiscript/equipmentdialog.py", "start": 17101010, "end": 17102709}, {"filename": "/uiscript/exchangedialog.py", "start": 17102709, "end": 17106858}, {"filename": "/uiscript/exchangedialog_cheque.py", "start": 17106858, "end": 17112615}, {"filename": "/uiscript/exchangeitemsdialog.py", "start": 17112615, "end": 17116709}, {"filename": "/uiscript/expandedtaskbar.py", "start": 17116709, "end": 17117513}, {"filename": "/uiscript/fishinggamedialog.py", "start": 17117513, "end": 17122911}, {"filename": "/uiscript/fishingwindow.py", "start": 17122911, "end": 17128565}, {"filename": "/uiscript/gamemaster_captchadialog.py", "start": 17128565, "end": 17130729}, {"filename": "/uiscript/gamemaster_targetplayer.py", "start": 17130729, "end": 17134489}, {"filename": "/uiscript/gamemasterbandialog.py", "start": 17134489, "end": 17137828}, {"filename": "/uiscript/gameoptiondialog.py", "start": 17137828, "end": 17160722}, {"filename": "/uiscript/gamewindow.py", "start": 17160722, "end": 17165062}, {"filename": "/uiscript/giftbox.py", "start": 17165062, "end": 17165661}, {"filename": "/uiscript/guildwindow.py", "start": 17165661, "end": 17168586}, {"filename": "/uiscript/guildwindow_baseinfopage.py", "start": 17168586, "end": 17175198}, {"filename": "/uiscript/guildwindow_boardpage.py", "start": 17175198, "end": 17176790}, {"filename": "/uiscript/guildwindow_gradepage.py", "start": 17176790, "end": 17177826}, {"filename": "/uiscript/guildwindow_guildinfopage.py", "start": 17177826, "end": 17188916}, {"filename": "/uiscript/guildwindow_guildskillpage.py", "start": 17188916, "end": 17193179}, {"filename": "/uiscript/guildwindow_memberpage.py", "start": 17193179, "end": 17194221}, {"filename": "/uiscript/helpwindow.py", "start": 17194221, "end": 17203030}, {"filename": "/uiscript/helpwindow2.py", "start": 17203030, "end": 17212137}, {"filename": "/uiscript/horseinventorywindow.py", "start": 17212137, "end": 17214341}, {"filename": "/uiscript/imekor.py", "start": 17214341, "end": 17214841}, {"filename": "/uiscript/inputdialog.py", "start": 17214841, "end": 17216452}, {"filename": "/uiscript/inputdialogwithdescription.py", "start": 17216452, "end": 17218272}, {"filename": "/uiscript/inputdialogwithdescription2.py", "start": 17218272, "end": 17220430}, {"filename": "/uiscript/inventorywindow.py", "start": 17220430, "end": 17233859}, {"filename": "/uiscript/inventorywindowex.py", "start": 17233859, "end": 17270094}, {"filename": "/uiscript/itemshopitem.py", "start": 17270094, "end": 17273948}, {"filename": "/uiscript/itemshopwindow.py", "start": 17273948, "end": 17281797}, {"filename": "/uiscript/loadingwindow.py", "start": 17281797, "end": 17284233}, {"filename": "/uiscript/localhackwindow.py", "start": 17284233, "end": 17287743}, {"filename": "/uiscript/loginwindow.py", "start": 17287743, "end": 17296711}, {"filename": "/uiscript/maintenancedialog.py", "start": 17296711, "end": 17298915}, {"filename": "/uiscript/mallwindow.py", "start": 17298915, "end": 17300047}, {"filename": "/uiscript/marklistwindow.py", "start": 17300047, "end": 17301712}, {"filename": "/uiscript/messengerwindow.py", "start": 17301712, "end": 17305329}, {"filename": "/uiscript/minimap.py", "start": 17305329, "end": 17309985}, {"filename": "/uiscript/moneyinputdialog.py", "start": 17309985, "end": 17311797}, {"filename": "/uiscript/moneyinputdialog_cheque.py", "start": 17311797, "end": 17317067}, {"filename": "/uiscript/mousebuttonwindow.py", "start": 17317067, "end": 17318400}, {"filename": "/uiscript/movechanneldialog.py", "start": 17318400, "end": 17320197}, {"filename": "/uiscript/musiclistwindow.py", "start": 17320197, "end": 17321866}, {"filename": "/uiscript/partymemberinfoboard.py", "start": 17321866, "end": 17324458}, {"filename": "/uiscript/passworddialog.py", "start": 17324458, "end": 17326327}, {"filename": "/uiscript/picketcdialog.py", "start": 17326327, "end": 17328070}, {"filename": "/uiscript/pickmoneydialog.py", "start": 17328070, "end": 17329815}, {"filename": "/uiscript/pickmoneydialog_cheque.py", "start": 17329815, "end": 17334602}, {"filename": "/uiscript/playerstatswindow.py", "start": 17334602, "end": 17338058}, {"filename": "/uiscript/popupdialog.py", "start": 17338058, "end": 17339148}, {"filename": "/uiscript/potionrechargedialog.py", "start": 17339148, "end": 17343283}, {"filename": "/uiscript/privateshopbuilder.py", "start": 17343283, "end": 17348701}, {"filename": "/uiscript/privateshopguest.py", "start": 17348701, "end": 17352270}, {"filename": "/uiscript/privateshophistory.py", "start": 17352270, "end": 17354714}, {"filename": "/uiscript/privateshopmanage.py", "start": 17354714, "end": 17362873}, {"filename": "/uiscript/questdialog.py", "start": 17362873, "end": 17363301}, {"filename": "/uiscript/questiondialog.py", "start": 17363301, "end": 17364719}, {"filename": "/uiscript/questiondialog2.py", "start": 17364719, "end": 17366386}, {"filename": "/uiscript/questiondialog3.py", "start": 17366386, "end": 17368213}, {"filename": "/uiscript/refinedialog.py", "start": 17368213, "end": 17370321}, {"filename": "/uiscript/reportplayerdialog.py", "start": 17370321, "end": 17372737}, {"filename": "/uiscript/reputationbar.py", "start": 17372737, "end": 17374485}, {"filename": "/uiscript/restartdialog.py", "start": 17374485, "end": 17375569}, {"filename": "/uiscript/rightmousebuttonwindow.py", "start": 17375569, "end": 17376877}, {"filename": "/uiscript/rulesdialog.py", "start": 17376877, "end": 17379184}, {"filename": "/uiscript/safeboxwindow.py", "start": 17379184, "end": 17381308}, {"filename": "/uiscript/selectcharacterwindow.py", "start": 17381308, "end": 17401576}, {"filename": "/uiscript/selectempirewindow.py", "start": 17401576, "end": 17408390}, {"filename": "/uiscript/selectitemwindow.py", "start": 17408390, "end": 17409795}, {"filename": "/uiscript/shopdialog.py", "start": 17409795, "end": 17415157}, {"filename": "/uiscript/shopsearchwindow.py", "start": 17415157, "end": 17419602}, {"filename": "/uiscript/skillpointresetdialog.py", "start": 17419602, "end": 17420542}, {"filename": "/uiscript/specialshopwindow.py", "start": 17420542, "end": 17421675}, {"filename": "/uiscript/systemdialog.py", "start": 17421675, "end": 17426961}, {"filename": "/uiscript/systemdialog_formall.py", "start": 17426961, "end": 17429766}, {"filename": "/uiscript/systemdialog_forportal.py", "start": 17429766, "end": 17431964}, {"filename": "/uiscript/systemoptiondialog.py", "start": 17431964, "end": 17445897}, {"filename": "/uiscript/taskbar.py", "start": 17445897, "end": 17458702}, {"filename": "/uiscript/webwindow.py", "start": 17458702, "end": 17459525}, {"filename": "/uiscript/whisperdialog.py", "start": 17459525, "end": 17464424}, {"filename": "/uiscript/wonexchangewindow.py", "start": 17464424, "end": 17468904}, {"filename": "/uiserverready.py", "start": 17468904, "end": 17469587}, {"filename": "/uisidekick.py", "start": 17469587, "end": 17553547}, {"filename": "/uisidekickinventory.py", "start": 17553547, "end": 17625338}, {"filename": "/uistacksplit.py", "start": 17625338, "end": 17644310}, {"filename": "/uiswitchbot.py", "start": 17644310, "end": 17848623}, {"filename": "/uiwiki.py", "start": 17848623, "end": 17922696}, {"filename": "/uiwikilink.py", "start": 17922696, "end": 17923425}, {"filename": "/uiworldboss.py", "start": 17923425, "end": 17936762}, {"filename": "/updateable.py", "start": 17936762, "end": 17937605}, {"filename": "/usr/local/lib/python3.13/__future__.py", "start": 17937605, "end": 17942823}, {"filename": "/usr/local/lib/python3.13/__hello__.py", "start": 17942823, "end": 17943050}, {"filename": "/usr/local/lib/python3.13/__phello__/__init__.py", "start": 17943050, "end": 17943147}, {"filename": "/usr/local/lib/python3.13/__phello__/spam.py", "start": 17943147, "end": 17943244}, {"filename": "/usr/local/lib/python3.13/_aix_support.py", "start": 17943244, "end": 17947265}, {"filename": "/usr/local/lib/python3.13/_android_support.py", "start": 17947265, "end": 17954160}, {"filename": "/usr/local/lib/python3.13/_apple_support.py", "start": 17954160, "end": 17956416}, {"filename": "/usr/local/lib/python3.13/_collections_abc.py", "start": 17956416, "end": 17988680}, {"filename": "/usr/local/lib/python3.13/_colorize.py", "start": 17988680, "end": 17991528}, {"filename": "/usr/local/lib/python3.13/_compat_pickle.py", "start": 17991528, "end": 18000263}, {"filename": "/usr/local/lib/python3.13/_compression.py", "start": 18000263, "end": 18005944}, {"filename": "/usr/local/lib/python3.13/_distutils_system_mod.py", "start": 18005944, "end": 18011660}, {"filename": "/usr/local/lib/python3.13/_ios_support.py", "start": 18011660, "end": 18014332}, {"filename": "/usr/local/lib/python3.13/_markupbase.py", "start": 18014332, "end": 18028985}, {"filename": "/usr/local/lib/python3.13/_opcode_metadata.py", "start": 18028985, "end": 18038250}, {"filename": "/usr/local/lib/python3.13/_osx_support.py", "start": 18038250, "end": 18060273}, {"filename": "/usr/local/lib/python3.13/_py_abc.py", "start": 18060273, "end": 18066462}, {"filename": "/usr/local/lib/python3.13/_pydatetime.py", "start": 18066462, "end": 18158452}, {"filename": "/usr/local/lib/python3.13/_pydecimal.py", "start": 18158452, "end": 18385735}, {"filename": "/usr/local/lib/python3.13/_pyio.py", "start": 18385735, "end": 18479428}, {"filename": "/usr/local/lib/python3.13/_pylong.py", "start": 18479428, "end": 18491258}, {"filename": "/usr/local/lib/python3.13/_pyrepl/__init__.py", "start": 18491258, "end": 18492183}, {"filename": "/usr/local/lib/python3.13/_pyrepl/__main__.py", "start": 18492183, "end": 18492605}, {"filename": "/usr/local/lib/python3.13/_pyrepl/_minimal_curses.py", "start": 18492605, "end": 18494449}, {"filename": "/usr/local/lib/python3.13/_pyrepl/_threading_handler.py", "start": 18494449, "end": 18496619}, {"filename": "/usr/local/lib/python3.13/_pyrepl/base_eventqueue.py", "start": 18496619, "end": 18500456}, {"filename": "/usr/local/lib/python3.13/_pyrepl/commands.py", "start": 18500456, "end": 18512646}, {"filename": "/usr/local/lib/python3.13/_pyrepl/completing_reader.py", "start": 18512646, "end": 18522696}, {"filename": "/usr/local/lib/python3.13/_pyrepl/console.py", "start": 18522696, "end": 18529562}, {"filename": "/usr/local/lib/python3.13/_pyrepl/curses.py", "start": 18529562, "end": 18530803}, {"filename": "/usr/local/lib/python3.13/_pyrepl/fancy_termios.py", "start": 18530803, "end": 18532964}, {"filename": "/usr/local/lib/python3.13/_pyrepl/historical_reader.py", "start": 18532964, "end": 18546204}, {"filename": "/usr/local/lib/python3.13/_pyrepl/input.py", "start": 18546204, "end": 18549983}, {"filename": "/usr/local/lib/python3.13/_pyrepl/keymap.py", "start": 18549983, "end": 18556443}, {"filename": "/usr/local/lib/python3.13/_pyrepl/main.py", "start": 18556443, "end": 18558381}, {"filename": "/usr/local/lib/python3.13/_pyrepl/pager.py", "start": 18558381, "end": 18564196}, {"filename": "/usr/local/lib/python3.13/_pyrepl/reader.py", "start": 18564196, "end": 18591908}, {"filename": "/usr/local/lib/python3.13/_pyrepl/readline.py", "start": 18591908, "end": 18612127}, {"filename": "/usr/local/lib/python3.13/_pyrepl/simple_interact.py", "start": 18612127, "end": 18617895}, {"filename": "/usr/local/lib/python3.13/_pyrepl/trace.py", "start": 18617895, "end": 18618328}, {"filename": "/usr/local/lib/python3.13/_pyrepl/types.py", "start": 18618328, "end": 18618682}, {"filename": "/usr/local/lib/python3.13/_pyrepl/unix_console.py", "start": 18618682, "end": 18644319}, {"filename": "/usr/local/lib/python3.13/_pyrepl/unix_eventqueue.py", "start": 18644319, "end": 18646843}, {"filename": "/usr/local/lib/python3.13/_pyrepl/utils.py", "start": 18646843, "end": 18649075}, {"filename": "/usr/local/lib/python3.13/_pyrepl/windows_console.py", "start": 18649075, "end": 18670695}, {"filename": "/usr/local/lib/python3.13/_pyrepl/windows_eventqueue.py", "start": 18670695, "end": 18671686}, {"filename": "/usr/local/lib/python3.13/_sitebuiltins.py", "start": 18671686, "end": 18674814}, {"filename": "/usr/local/lib/python3.13/_strptime.py", "start": 18674814, "end": 18704197}, {"filename": "/usr/local/lib/python3.13/_sysconfigdata__linux_x86_64-linux-gnu.py", "start": 18704197, "end": 18751573}, {"filename": "/usr/local/lib/python3.13/_sysconfigdata__x86_64-linux-gnu.py", "start": 18751573, "end": 18798949}, {"filename": "/usr/local/lib/python3.13/_threading_local.py", "start": 18798949, "end": 18803312}, {"filename": "/usr/local/lib/python3.13/_weakrefset.py", "start": 18803312, "end": 18809205}, {"filename": "/usr/local/lib/python3.13/abc.py", "start": 18809205, "end": 18815743}, {"filename": "/usr/local/lib/python3.13/antigravity.py", "start": 18815743, "end": 18816243}, {"filename": "/usr/local/lib/python3.13/argparse.py", "start": 18816243, "end": 18918301}, {"filename": "/usr/local/lib/python3.13/ast.py", "start": 18918301, "end": 18983640}, {"filename": "/usr/local/lib/python3.13/asyncio/__init__.py", "start": 18983640, "end": 18984860}, {"filename": "/usr/local/lib/python3.13/asyncio/__main__.py", "start": 18984860, "end": 18990983}, {"filename": "/usr/local/lib/python3.13/asyncio/base_events.py", "start": 18990983, "end": 19071228}, {"filename": "/usr/local/lib/python3.13/asyncio/base_futures.py", "start": 19071228, "end": 19073202}, {"filename": "/usr/local/lib/python3.13/asyncio/base_subprocess.py", "start": 19073202, "end": 19082879}, {"filename": "/usr/local/lib/python3.13/asyncio/base_tasks.py", "start": 19082879, "end": 19085551}, {"filename": "/usr/local/lib/python3.13/asyncio/constants.py", "start": 19085551, "end": 19086964}, {"filename": "/usr/local/lib/python3.13/asyncio/coroutines.py", "start": 19086964, "end": 19090306}, {"filename": "/usr/local/lib/python3.13/asyncio/events.py", "start": 19090306, "end": 19120092}, {"filename": "/usr/local/lib/python3.13/asyncio/exceptions.py", "start": 19120092, "end": 19121844}, {"filename": "/usr/local/lib/python3.13/asyncio/format_helpers.py", "start": 19121844, "end": 19124571}, {"filename": "/usr/local/lib/python3.13/asyncio/futures.py", "start": 19124571, "end": 19138728}, {"filename": "/usr/local/lib/python3.13/asyncio/locks.py", "start": 19138728, "end": 19159308}, {"filename": "/usr/local/lib/python3.13/asyncio/log.py", "start": 19159308, "end": 19159432}, {"filename": "/usr/local/lib/python3.13/asyncio/mixins.py", "start": 19159432, "end": 19159913}, {"filename": "/usr/local/lib/python3.13/asyncio/proactor_events.py", "start": 19159913, "end": 19193408}, {"filename": "/usr/local/lib/python3.13/asyncio/protocols.py", "start": 19193408, "end": 19200365}, {"filename": "/usr/local/lib/python3.13/asyncio/queues.py", "start": 19200365, "end": 19210543}, {"filename": "/usr/local/lib/python3.13/asyncio/runners.py", "start": 19210543, "end": 19217773}, {"filename": "/usr/local/lib/python3.13/asyncio/selector_events.py", "start": 19217773, "end": 19265946}, {"filename": "/usr/local/lib/python3.13/asyncio/sslproto.py", "start": 19265946, "end": 19297815}, {"filename": "/usr/local/lib/python3.13/asyncio/staggered.py", "start": 19297815, "end": 19304892}, {"filename": "/usr/local/lib/python3.13/asyncio/streams.py", "start": 19304892, "end": 19333373}, {"filename": "/usr/local/lib/python3.13/asyncio/subprocess.py", "start": 19333373, "end": 19341110}, {"filename": "/usr/local/lib/python3.13/asyncio/taskgroups.py", "start": 19341110, "end": 19351159}, {"filename": "/usr/local/lib/python3.13/asyncio/tasks.py", "start": 19351159, "end": 19390916}, {"filename": "/usr/local/lib/python3.13/asyncio/threads.py", "start": 19390916, "end": 19391706}, {"filename": "/usr/local/lib/python3.13/asyncio/timeouts.py", "start": 19391706, "end": 19397768}, {"filename": "/usr/local/lib/python3.13/asyncio/transports.py", "start": 19397768, "end": 19408576}, {"filename": "/usr/local/lib/python3.13/asyncio/trsock.py", "start": 19408576, "end": 19411051}, {"filename": "/usr/local/lib/python3.13/asyncio/unix_events.py", "start": 19411051, "end": 19465467}, {"filename": "/usr/local/lib/python3.13/asyncio/windows_events.py", "start": 19465467, "end": 19498097}, {"filename": "/usr/local/lib/python3.13/asyncio/windows_utils.py", "start": 19498097, "end": 19503157}, {"filename": "/usr/local/lib/python3.13/base64.py", "start": 19503157, "end": 19524786}, {"filename": "/usr/local/lib/python3.13/bdb.py", "start": 19524786, "end": 19560129}, {"filename": "/usr/local/lib/python3.13/bisect.py", "start": 19560129, "end": 19563552}, {"filename": "/usr/local/lib/python3.13/bz2.py", "start": 19563552, "end": 19575521}, {"filename": "/usr/local/lib/python3.13/cProfile.py", "start": 19575521, "end": 19582144}, {"filename": "/usr/local/lib/python3.13/calendar.py", "start": 19582144, "end": 19608221}, {"filename": "/usr/local/lib/python3.13/cmd.py", "start": 19608221, "end": 19623537}, {"filename": "/usr/local/lib/python3.13/code.py", "start": 19623537, "end": 19636707}, {"filename": "/usr/local/lib/python3.13/codecs.py", "start": 19636707, "end": 19673635}, {"filename": "/usr/local/lib/python3.13/codeop.py", "start": 19673635, "end": 19679463}, {"filename": "/usr/local/lib/python3.13/collections/__init__.py", "start": 19679463, "end": 19731963}, {"filename": "/usr/local/lib/python3.13/colorsys.py", "start": 19731963, "end": 19736025}, {"filename": "/usr/local/lib/python3.13/compileall.py", "start": 19736025, "end": 19756781}, {"filename": "/usr/local/lib/python3.13/concurrent/__init__.py", "start": 19756781, "end": 19756819}, {"filename": "/usr/local/lib/python3.13/concurrent/futures/__init__.py", "start": 19756819, "end": 19758402}, {"filename": "/usr/local/lib/python3.13/concurrent/futures/_base.py", "start": 19758402, "end": 19781247}, {"filename": "/usr/local/lib/python3.13/concurrent/futures/process.py", "start": 19781247, "end": 19816510}, {"filename": "/usr/local/lib/python3.13/concurrent/futures/thread.py", "start": 19816510, "end": 19825472}, {"filename": "/usr/local/lib/python3.13/configparser.py", "start": 19825472, "end": 19879437}, {"filename": "/usr/local/lib/python3.13/contextlib.py", "start": 19879437, "end": 19907238}, {"filename": "/usr/local/lib/python3.13/contextvars.py", "start": 19907238, "end": 19907367}, {"filename": "/usr/local/lib/python3.13/copy.py", "start": 19907367, "end": 19916342}, {"filename": "/usr/local/lib/python3.13/copyreg.py", "start": 19916342, "end": 19923956}, {"filename": "/usr/local/lib/python3.13/csv.py", "start": 19923956, "end": 19943134}, {"filename": "/usr/local/lib/python3.13/ctypes/__init__.py", "start": 19943134, "end": 19961916}, {"filename": "/usr/local/lib/python3.13/ctypes/_aix.py", "start": 19961916, "end": 19974421}, {"filename": "/usr/local/lib/python3.13/ctypes/_endian.py", "start": 19974421, "end": 19976978}, {"filename": "/usr/local/lib/python3.13/ctypes/util.py", "start": 19976978, "end": 19991230}, {"filename": "/usr/local/lib/python3.13/ctypes/wintypes.py", "start": 19991230, "end": 19996859}, {"filename": "/usr/local/lib/python3.13/curses/__init__.py", "start": 19996859, "end": 20000228}, {"filename": "/usr/local/lib/python3.13/curses/ascii.py", "start": 20000228, "end": 20002771}, {"filename": "/usr/local/lib/python3.13/curses/has_key.py", "start": 20002771, "end": 20008405}, {"filename": "/usr/local/lib/python3.13/curses/panel.py", "start": 20008405, "end": 20008492}, {"filename": "/usr/local/lib/python3.13/curses/textpad.py", "start": 20008492, "end": 20016246}, {"filename": "/usr/local/lib/python3.13/dataclasses.py", "start": 20016246, "end": 20080791}, {"filename": "/usr/local/lib/python3.13/datetime.py", "start": 20080791, "end": 20081059}, {"filename": "/usr/local/lib/python3.13/dbm/__init__.py", "start": 20081059, "end": 20087083}, {"filename": "/usr/local/lib/python3.13/dbm/dumb.py", "start": 20087083, "end": 20098794}, {"filename": "/usr/local/lib/python3.13/dbm/gnu.py", "start": 20098794, "end": 20098980}, {"filename": "/usr/local/lib/python3.13/dbm/ndbm.py", "start": 20098980, "end": 20099164}, {"filename": "/usr/local/lib/python3.13/dbm/sqlite3.py", "start": 20099164, "end": 20103246}, {"filename": "/usr/local/lib/python3.13/decimal.py", "start": 20103246, "end": 20106044}, {"filename": "/usr/local/lib/python3.13/difflib.py", "start": 20106044, "end": 20189412}, {"filename": "/usr/local/lib/python3.13/dis.py", "start": 20189412, "end": 20230374}, {"filename": "/usr/local/lib/python3.13/doctest.py", "start": 20230374, "end": 20339707}, {"filename": "/usr/local/lib/python3.13/email/__init__.py", "start": 20339707, "end": 20341471}, {"filename": "/usr/local/lib/python3.13/email/_encoded_words.py", "start": 20341471, "end": 20350012}, {"filename": "/usr/local/lib/python3.13/email/_header_value_parser.py", "start": 20350012, "end": 20461752}, {"filename": "/usr/local/lib/python3.13/email/_parseaddr.py", "start": 20461752, "end": 20479647}, {"filename": "/usr/local/lib/python3.13/email/_policybase.py", "start": 20479647, "end": 20495182}, {"filename": "/usr/local/lib/python3.13/email/base64mime.py", "start": 20495182, "end": 20498733}, {"filename": "/usr/local/lib/python3.13/email/charset.py", "start": 20498733, "end": 20515796}, {"filename": "/usr/local/lib/python3.13/email/contentmanager.py", "start": 20515796, "end": 20526384}, {"filename": "/usr/local/lib/python3.13/email/encoders.py", "start": 20526384, "end": 20528162}, {"filename": "/usr/local/lib/python3.13/email/errors.py", "start": 20528162, "end": 20531976}, {"filename": "/usr/local/lib/python3.13/email/feedparser.py", "start": 20531976, "end": 20554874}, {"filename": "/usr/local/lib/python3.13/email/generator.py", "start": 20554874, "end": 20576277}, {"filename": "/usr/local/lib/python3.13/email/header.py", "start": 20576277, "end": 20600369}, {"filename": "/usr/local/lib/python3.13/email/headerregistry.py", "start": 20600369, "end": 20621188}, {"filename": "/usr/local/lib/python3.13/email/iterators.py", "start": 20621188, "end": 20623317}, {"filename": "/usr/local/lib/python3.13/email/message.py", "start": 20623317, "end": 20671532}, {"filename": "/usr/local/lib/python3.13/email/mime/__init__.py", "start": 20671532, "end": 20671532}, {"filename": "/usr/local/lib/python3.13/email/mime/application.py", "start": 20671532, "end": 20672853}, {"filename": "/usr/local/lib/python3.13/email/mime/audio.py", "start": 20672853, "end": 20675857}, {"filename": "/usr/local/lib/python3.13/email/mime/base.py", "start": 20675857, "end": 20676771}, {"filename": "/usr/local/lib/python3.13/email/mime/image.py", "start": 20676771, "end": 20680497}, {"filename": "/usr/local/lib/python3.13/email/mime/message.py", "start": 20680497, "end": 20681812}, {"filename": "/usr/local/lib/python3.13/email/mime/multipart.py", "start": 20681812, "end": 20683431}, {"filename": "/usr/local/lib/python3.13/email/mime/nonmultipart.py", "start": 20683431, "end": 20684120}, {"filename": "/usr/local/lib/python3.13/email/mime/text.py", "start": 20684120, "end": 20685514}, {"filename": "/usr/local/lib/python3.13/email/parser.py", "start": 20685514, "end": 20690489}, {"filename": "/usr/local/lib/python3.13/email/policy.py", "start": 20690489, "end": 20701103}, {"filename": "/usr/local/lib/python3.13/email/quoprimime.py", "start": 20701103, "end": 20710967}, {"filename": "/usr/local/lib/python3.13/email/utils.py", "start": 20710967, "end": 20727582}, {"filename": "/usr/local/lib/python3.13/encodings/__init__.py", "start": 20727582, "end": 20733466}, {"filename": "/usr/local/lib/python3.13/encodings/aliases.py", "start": 20733466, "end": 20749179}, {"filename": "/usr/local/lib/python3.13/encodings/ascii.py", "start": 20749179, "end": 20750427}, {"filename": "/usr/local/lib/python3.13/encodings/base64_codec.py", "start": 20750427, "end": 20751960}, {"filename": "/usr/local/lib/python3.13/encodings/big5.py", "start": 20751960, "end": 20752979}, {"filename": "/usr/local/lib/python3.13/encodings/big5hkscs.py", "start": 20752979, "end": 20754018}, {"filename": "/usr/local/lib/python3.13/encodings/bz2_codec.py", "start": 20754018, "end": 20756267}, {"filename": "/usr/local/lib/python3.13/encodings/charmap.py", "start": 20756267, "end": 20758351}, {"filename": "/usr/local/lib/python3.13/encodings/cp037.py", "start": 20758351, "end": 20771472}, {"filename": "/usr/local/lib/python3.13/encodings/cp1006.py", "start": 20771472, "end": 20785040}, {"filename": "/usr/local/lib/python3.13/encodings/cp1026.py", "start": 20785040, "end": 20798153}, {"filename": "/usr/local/lib/python3.13/encodings/cp1125.py", "start": 20798153, "end": 20832750}, {"filename": "/usr/local/lib/python3.13/encodings/cp1140.py", "start": 20832750, "end": 20845855}, {"filename": "/usr/local/lib/python3.13/encodings/cp1250.py", "start": 20845855, "end": 20859541}, {"filename": "/usr/local/lib/python3.13/encodings/cp1251.py", "start": 20859541, "end": 20872902}, {"filename": "/usr/local/lib/python3.13/encodings/cp1252.py", "start": 20872902, "end": 20886413}, {"filename": "/usr/local/lib/python3.13/encodings/cp1253.py", "start": 20886413, "end": 20899507}, {"filename": "/usr/local/lib/python3.13/encodings/cp1254.py", "start": 20899507, "end": 20913009}, {"filename": "/usr/local/lib/python3.13/encodings/cp1255.py", "start": 20913009, "end": 20925475}, {"filename": "/usr/local/lib/python3.13/encodings/cp1256.py", "start": 20925475, "end": 20938289}, {"filename": "/usr/local/lib/python3.13/encodings/cp1257.py", "start": 20938289, "end": 20951663}, {"filename": "/usr/local/lib/python3.13/encodings/cp1258.py", "start": 20951663, "end": 20965027}, {"filename": "/usr/local/lib/python3.13/encodings/cp273.py", "start": 20965027, "end": 20979159}, {"filename": "/usr/local/lib/python3.13/encodings/cp424.py", "start": 20979159, "end": 20991214}, {"filename": "/usr/local/lib/python3.13/encodings/cp437.py", "start": 20991214, "end": 21025778}, {"filename": "/usr/local/lib/python3.13/encodings/cp500.py", "start": 21025778, "end": 21038899}, {"filename": "/usr/local/lib/python3.13/encodings/cp720.py", "start": 21038899, "end": 21052585}, {"filename": "/usr/local/lib/python3.13/encodings/cp737.py", "start": 21052585, "end": 21087266}, {"filename": "/usr/local/lib/python3.13/encodings/cp775.py", "start": 21087266, "end": 21121742}, {"filename": "/usr/local/lib/python3.13/encodings/cp850.py", "start": 21121742, "end": 21155847}, {"filename": "/usr/local/lib/python3.13/encodings/cp852.py", "start": 21155847, "end": 21190849}, {"filename": "/usr/local/lib/python3.13/encodings/cp855.py", "start": 21190849, "end": 21224699}, {"filename": "/usr/local/lib/python3.13/encodings/cp856.py", "start": 21224699, "end": 21237122}, {"filename": "/usr/local/lib/python3.13/encodings/cp857.py", "start": 21237122, "end": 21271030}, {"filename": "/usr/local/lib/python3.13/encodings/cp858.py", "start": 21271030, "end": 21305045}, {"filename": "/usr/local/lib/python3.13/encodings/cp860.py", "start": 21305045, "end": 21339726}, {"filename": "/usr/local/lib/python3.13/encodings/cp861.py", "start": 21339726, "end": 21374359}, {"filename": "/usr/local/lib/python3.13/encodings/cp862.py", "start": 21374359, "end": 21407729}, {"filename": "/usr/local/lib/python3.13/encodings/cp863.py", "start": 21407729, "end": 21441981}, {"filename": "/usr/local/lib/python3.13/encodings/cp864.py", "start": 21441981, "end": 21475644}, {"filename": "/usr/local/lib/python3.13/encodings/cp865.py", "start": 21475644, "end": 21510262}, {"filename": "/usr/local/lib/python3.13/encodings/cp866.py", "start": 21510262, "end": 21544658}, {"filename": "/usr/local/lib/python3.13/encodings/cp869.py", "start": 21544658, "end": 21577623}, {"filename": "/usr/local/lib/python3.13/encodings/cp874.py", "start": 21577623, "end": 21590218}, {"filename": "/usr/local/lib/python3.13/encodings/cp875.py", "start": 21590218, "end": 21603072}, {"filename": "/usr/local/lib/python3.13/encodings/cp932.py", "start": 21603072, "end": 21604095}, {"filename": "/usr/local/lib/python3.13/encodings/cp949.py", "start": 21604095, "end": 21605118}, {"filename": "/usr/local/lib/python3.13/encodings/cp950.py", "start": 21605118, "end": 21606141}, {"filename": "/usr/local/lib/python3.13/encodings/euc_jis_2004.py", "start": 21606141, "end": 21607192}, {"filename": "/usr/local/lib/python3.13/encodings/euc_jisx0213.py", "start": 21607192, "end": 21608243}, {"filename": "/usr/local/lib/python3.13/encodings/euc_jp.py", "start": 21608243, "end": 21609270}, {"filename": "/usr/local/lib/python3.13/encodings/euc_kr.py", "start": 21609270, "end": 21610297}, {"filename": "/usr/local/lib/python3.13/encodings/gb18030.py", "start": 21610297, "end": 21611328}, {"filename": "/usr/local/lib/python3.13/encodings/gb2312.py", "start": 21611328, "end": 21612355}, {"filename": "/usr/local/lib/python3.13/encodings/gbk.py", "start": 21612355, "end": 21613370}, {"filename": "/usr/local/lib/python3.13/encodings/hex_codec.py", "start": 21613370, "end": 21614878}, {"filename": "/usr/local/lib/python3.13/encodings/hp_roman8.py", "start": 21614878, "end": 21628353}, {"filename": "/usr/local/lib/python3.13/encodings/hz.py", "start": 21628353, "end": 21629364}, {"filename": "/usr/local/lib/python3.13/encodings/idna.py", "start": 21629364, "end": 21642611}, {"filename": "/usr/local/lib/python3.13/encodings/iso2022_jp.py", "start": 21642611, "end": 21643664}, {"filename": "/usr/local/lib/python3.13/encodings/iso2022_jp_1.py", "start": 21643664, "end": 21644725}, {"filename": "/usr/local/lib/python3.13/encodings/iso2022_jp_2.py", "start": 21644725, "end": 21645786}, {"filename": "/usr/local/lib/python3.13/encodings/iso2022_jp_2004.py", "start": 21645786, "end": 21646859}, {"filename": "/usr/local/lib/python3.13/encodings/iso2022_jp_3.py", "start": 21646859, "end": 21647920}, {"filename": "/usr/local/lib/python3.13/encodings/iso2022_jp_ext.py", "start": 21647920, "end": 21648989}, {"filename": "/usr/local/lib/python3.13/encodings/iso2022_kr.py", "start": 21648989, "end": 21650042}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_1.py", "start": 21650042, "end": 21663218}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_10.py", "start": 21663218, "end": 21676807}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_11.py", "start": 21676807, "end": 21689142}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_13.py", "start": 21689142, "end": 21702413}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_14.py", "start": 21702413, "end": 21716065}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_15.py", "start": 21716065, "end": 21729277}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_16.py", "start": 21729277, "end": 21742834}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_2.py", "start": 21742834, "end": 21756238}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_3.py", "start": 21756238, "end": 21769327}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_4.py", "start": 21769327, "end": 21782703}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_5.py", "start": 21782703, "end": 21795718}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_6.py", "start": 21795718, "end": 21806551}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_7.py", "start": 21806551, "end": 21819395}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_8.py", "start": 21819395, "end": 21830431}, {"filename": "/usr/local/lib/python3.13/encodings/iso8859_9.py", "start": 21830431, "end": 21843587}, {"filename": "/usr/local/lib/python3.13/encodings/johab.py", "start": 21843587, "end": 21844610}, {"filename": "/usr/local/lib/python3.13/encodings/koi8_r.py", "start": 21844610, "end": 21858389}, {"filename": "/usr/local/lib/python3.13/encodings/koi8_t.py", "start": 21858389, "end": 21871582}, {"filename": "/usr/local/lib/python3.13/encodings/koi8_u.py", "start": 21871582, "end": 21885344}, {"filename": "/usr/local/lib/python3.13/encodings/kz1048.py", "start": 21885344, "end": 21899067}, {"filename": "/usr/local/lib/python3.13/encodings/latin_1.py", "start": 21899067, "end": 21900331}, {"filename": "/usr/local/lib/python3.13/encodings/mac_arabic.py", "start": 21900331, "end": 21936798}, {"filename": "/usr/local/lib/python3.13/encodings/mac_croatian.py", "start": 21936798, "end": 21950431}, {"filename": "/usr/local/lib/python3.13/encodings/mac_cyrillic.py", "start": 21950431, "end": 21963885}, {"filename": "/usr/local/lib/python3.13/encodings/mac_farsi.py", "start": 21963885, "end": 21979055}, {"filename": "/usr/local/lib/python3.13/encodings/mac_greek.py", "start": 21979055, "end": 21992776}, {"filename": "/usr/local/lib/python3.13/encodings/mac_iceland.py", "start": 21992776, "end": 22006274}, {"filename": "/usr/local/lib/python3.13/encodings/mac_latin2.py", "start": 22006274, "end": 22020392}, {"filename": "/usr/local/lib/python3.13/encodings/mac_roman.py", "start": 22020392, "end": 22033872}, {"filename": "/usr/local/lib/python3.13/encodings/mac_romanian.py", "start": 22033872, "end": 22047533}, {"filename": "/usr/local/lib/python3.13/encodings/mac_turkish.py", "start": 22047533, "end": 22061046}, {"filename": "/usr/local/lib/python3.13/encodings/mbcs.py", "start": 22061046, "end": 22062257}, {"filename": "/usr/local/lib/python3.13/encodings/oem.py", "start": 22062257, "end": 22063276}, {"filename": "/usr/local/lib/python3.13/encodings/palmos.py", "start": 22063276, "end": 22076795}, {"filename": "/usr/local/lib/python3.13/encodings/ptcp154.py", "start": 22076795, "end": 22090810}, {"filename": "/usr/local/lib/python3.13/encodings/punycode.py", "start": 22090810, "end": 22098435}, {"filename": "/usr/local/lib/python3.13/encodings/quopri_codec.py", "start": 22098435, "end": 22099960}, {"filename": "/usr/local/lib/python3.13/encodings/raw_unicode_escape.py", "start": 22099960, "end": 22101292}, {"filename": "/usr/local/lib/python3.13/encodings/rot_13.py", "start": 22101292, "end": 22103741}, {"filename": "/usr/local/lib/python3.13/encodings/shift_jis.py", "start": 22103741, "end": 22104780}, {"filename": "/usr/local/lib/python3.13/encodings/shift_jis_2004.py", "start": 22104780, "end": 22105839}, {"filename": "/usr/local/lib/python3.13/encodings/shift_jisx0213.py", "start": 22105839, "end": 22106898}, {"filename": "/usr/local/lib/python3.13/encodings/tis_620.py", "start": 22106898, "end": 22119198}, {"filename": "/usr/local/lib/python3.13/encodings/undefined.py", "start": 22119198, "end": 22120499}, {"filename": "/usr/local/lib/python3.13/encodings/unicode_escape.py", "start": 22120499, "end": 22121803}, {"filename": "/usr/local/lib/python3.13/encodings/utf_16.py", "start": 22121803, "end": 22127083}, {"filename": "/usr/local/lib/python3.13/encodings/utf_16_be.py", "start": 22127083, "end": 22128120}, {"filename": "/usr/local/lib/python3.13/encodings/utf_16_le.py", "start": 22128120, "end": 22129157}, {"filename": "/usr/local/lib/python3.13/encodings/utf_32.py", "start": 22129157, "end": 22134332}, {"filename": "/usr/local/lib/python3.13/encodings/utf_32_be.py", "start": 22134332, "end": 22135262}, {"filename": "/usr/local/lib/python3.13/encodings/utf_32_le.py", "start": 22135262, "end": 22136192}, {"filename": "/usr/local/lib/python3.13/encodings/utf_7.py", "start": 22136192, "end": 22137138}, {"filename": "/usr/local/lib/python3.13/encodings/utf_8.py", "start": 22137138, "end": 22138143}, {"filename": "/usr/local/lib/python3.13/encodings/utf_8_sig.py", "start": 22138143, "end": 22142276}, {"filename": "/usr/local/lib/python3.13/encodings/uu_codec.py", "start": 22142276, "end": 22145127}, {"filename": "/usr/local/lib/python3.13/encodings/zlib_codec.py", "start": 22145127, "end": 22147331}, {"filename": "/usr/local/lib/python3.13/enum.py", "start": 22147331, "end": 22232909}, {"filename": "/usr/local/lib/python3.13/filecmp.py", "start": 22232909, "end": 22243561}, {"filename": "/usr/local/lib/python3.13/fileinput.py", "start": 22243561, "end": 22259278}, {"filename": "/usr/local/lib/python3.13/fnmatch.py", "start": 22259278, "end": 22265458}, {"filename": "/usr/local/lib/python3.13/fractions.py", "start": 22265458, "end": 22305479}, {"filename": "/usr/local/lib/python3.13/ftplib.py", "start": 22305479, "end": 22340719}, {"filename": "/usr/local/lib/python3.13/functools.py", "start": 22340719, "end": 22379842}, {"filename": "/usr/local/lib/python3.13/genericpath.py", "start": 22379842, "end": 22386089}, {"filename": "/usr/local/lib/python3.13/getopt.py", "start": 22386089, "end": 22393577}, {"filename": "/usr/local/lib/python3.13/getpass.py", "start": 22393577, "end": 22399810}, {"filename": "/usr/local/lib/python3.13/gettext.py", "start": 22399810, "end": 22421771}, {"filename": "/usr/local/lib/python3.13/glob.py", "start": 22421771, "end": 22441491}, {"filename": "/usr/local/lib/python3.13/graphlib.py", "start": 22441491, "end": 22451139}, {"filename": "/usr/local/lib/python3.13/gzip.py", "start": 22451139, "end": 22475772}, {"filename": "/usr/local/lib/python3.13/hashlib.py", "start": 22475772, "end": 22485218}, {"filename": "/usr/local/lib/python3.13/heapq.py", "start": 22485218, "end": 22508242}, {"filename": "/usr/local/lib/python3.13/hmac.py", "start": 22508242, "end": 22515958}, {"filename": "/usr/local/lib/python3.13/html/__init__.py", "start": 22515958, "end": 22520733}, {"filename": "/usr/local/lib/python3.13/html/entities.py", "start": 22520733, "end": 22596245}, {"filename": "/usr/local/lib/python3.13/html/parser.py", "start": 22596245, "end": 22615116}, {"filename": "/usr/local/lib/python3.13/http/__init__.py", "start": 22615116, "end": 22623562}, {"filename": "/usr/local/lib/python3.13/http/client.py", "start": 22623562, "end": 22682175}, {"filename": "/usr/local/lib/python3.13/http/cookiejar.py", "start": 22682175, "end": 22759691}, {"filename": "/usr/local/lib/python3.13/http/cookies.py", "start": 22759691, "end": 22781461}, {"filename": "/usr/local/lib/python3.13/http/server.py", "start": 22781461, "end": 22830453}, {"filename": "/usr/local/lib/python3.13/imaplib.py", "start": 22830453, "end": 22884493}, {"filename": "/usr/local/lib/python3.13/importlib/__init__.py", "start": 22884493, "end": 22889260}, {"filename": "/usr/local/lib/python3.13/importlib/_abc.py", "start": 22889260, "end": 22890614}, {"filename": "/usr/local/lib/python3.13/importlib/_bootstrap.py", "start": 22890614, "end": 22947696}, {"filename": "/usr/local/lib/python3.13/importlib/_bootstrap_external.py", "start": 22947696, "end": 23020865}, {"filename": "/usr/local/lib/python3.13/importlib/abc.py", "start": 23020865, "end": 23028524}, {"filename": "/usr/local/lib/python3.13/importlib/machinery.py", "start": 23028524, "end": 23029458}, {"filename": "/usr/local/lib/python3.13/importlib/metadata/__init__.py", "start": 23029458, "end": 23063549}, {"filename": "/usr/local/lib/python3.13/importlib/metadata/_adapters.py", "start": 23063549, "end": 23065956}, {"filename": "/usr/local/lib/python3.13/importlib/metadata/_collections.py", "start": 23065956, "end": 23066699}, {"filename": "/usr/local/lib/python3.13/importlib/metadata/_functools.py", "start": 23066699, "end": 23069594}, {"filename": "/usr/local/lib/python3.13/importlib/metadata/_itertools.py", "start": 23069594, "end": 23071662}, {"filename": "/usr/local/lib/python3.13/importlib/metadata/_meta.py", "start": 23071662, "end": 23073463}, {"filename": "/usr/local/lib/python3.13/importlib/metadata/_text.py", "start": 23073463, "end": 23075629}, {"filename": "/usr/local/lib/python3.13/importlib/metadata/diagnose.py", "start": 23075629, "end": 23076008}, {"filename": "/usr/local/lib/python3.13/importlib/readers.py", "start": 23076008, "end": 23076335}, {"filename": "/usr/local/lib/python3.13/importlib/resources/__init__.py", "start": 23076335, "end": 23077038}, {"filename": "/usr/local/lib/python3.13/importlib/resources/_adapters.py", "start": 23077038, "end": 23081520}, {"filename": "/usr/local/lib/python3.13/importlib/resources/_common.py", "start": 23081520, "end": 23087109}, {"filename": "/usr/local/lib/python3.13/importlib/resources/_functional.py", "start": 23087109, "end": 23089760}, {"filename": "/usr/local/lib/python3.13/importlib/resources/_itertools.py", "start": 23089760, "end": 23091037}, {"filename": "/usr/local/lib/python3.13/importlib/resources/abc.py", "start": 23091037, "end": 23096240}, {"filename": "/usr/local/lib/python3.13/importlib/resources/readers.py", "start": 23096240, "end": 23102483}, {"filename": "/usr/local/lib/python3.13/importlib/resources/simple.py", "start": 23102483, "end": 23105073}, {"filename": "/usr/local/lib/python3.13/importlib/simple.py", "start": 23105073, "end": 23105427}, {"filename": "/usr/local/lib/python3.13/importlib/util.py", "start": 23105427, "end": 23116626}, {"filename": "/usr/local/lib/python3.13/inspect.py", "start": 23116626, "end": 23244902}, {"filename": "/usr/local/lib/python3.13/io.py", "start": 23244902, "end": 23248484}, {"filename": "/usr/local/lib/python3.13/ipaddress.py", "start": 23248484, "end": 23330119}, {"filename": "/usr/local/lib/python3.13/json/__init__.py", "start": 23330119, "end": 23344139}, {"filename": "/usr/local/lib/python3.13/json/decoder.py", "start": 23344139, "end": 23357011}, {"filename": "/usr/local/lib/python3.13/json/encoder.py", "start": 23357011, "end": 23373159}, {"filename": "/usr/local/lib/python3.13/json/scanner.py", "start": 23373159, "end": 23375593}, {"filename": "/usr/local/lib/python3.13/json/tool.py", "start": 23375593, "end": 23378963}, {"filename": "/usr/local/lib/python3.13/keyword.py", "start": 23378963, "end": 23380036}, {"filename": "/usr/local/lib/python3.13/linecache.py", "start": 23380036, "end": 23387320}, {"filename": "/usr/local/lib/python3.13/locale.py", "start": 23387320, "end": 23466353}, {"filename": "/usr/local/lib/python3.13/logging/__init__.py", "start": 23466353, "end": 23550119}, {"filename": "/usr/local/lib/python3.13/logging/config.py", "start": 23550119, "end": 23592597}, {"filename": "/usr/local/lib/python3.13/logging/handlers.py", "start": 23592597, "end": 23654969}, {"filename": "/usr/local/lib/python3.13/lzma.py", "start": 23654969, "end": 23668368}, {"filename": "/usr/local/lib/python3.13/mailbox.py", "start": 23668368, "end": 23750012}, {"filename": "/usr/local/lib/python3.13/mimetypes.py", "start": 23750012, "end": 23773863}, {"filename": "/usr/local/lib/python3.13/modulefinder.py", "start": 23773863, "end": 23797655}, {"filename": "/usr/local/lib/python3.13/multiprocessing/__init__.py", "start": 23797655, "end": 23798571}, {"filename": "/usr/local/lib/python3.13/multiprocessing/connection.py", "start": 23798571, "end": 23840523}, {"filename": "/usr/local/lib/python3.13/multiprocessing/context.py", "start": 23840523, "end": 23852207}, {"filename": "/usr/local/lib/python3.13/multiprocessing/dummy/__init__.py", "start": 23852207, "end": 23855268}, {"filename": "/usr/local/lib/python3.13/multiprocessing/dummy/connection.py", "start": 23855268, "end": 23856866}, {"filename": "/usr/local/lib/python3.13/multiprocessing/forkserver.py", "start": 23856866, "end": 23869255}, {"filename": "/usr/local/lib/python3.13/multiprocessing/heap.py", "start": 23869255, "end": 23880881}, {"filename": "/usr/local/lib/python3.13/multiprocessing/managers.py", "start": 23880881, "end": 23929083}, {"filename": "/usr/local/lib/python3.13/multiprocessing/pool.py", "start": 23929083, "end": 23961851}, {"filename": "/usr/local/lib/python3.13/multiprocessing/popen_fork.py", "start": 23961851, "end": 23964367}, {"filename": "/usr/local/lib/python3.13/multiprocessing/popen_forkserver.py", "start": 23964367, "end": 23966597}, {"filename": "/usr/local/lib/python3.13/multiprocessing/popen_spawn_posix.py", "start": 23966597, "end": 23968626}, {"filename": "/usr/local/lib/python3.13/multiprocessing/popen_spawn_win32.py", "start": 23968626, "end": 23973261}, {"filename": "/usr/local/lib/python3.13/multiprocessing/process.py", "start": 23973261, "end": 23985316}, {"filename": "/usr/local/lib/python3.13/multiprocessing/queues.py", "start": 23985316, "end": 23997984}, {"filename": "/usr/local/lib/python3.13/multiprocessing/reduction.py", "start": 23997984, "end": 24007496}, {"filename": "/usr/local/lib/python3.13/multiprocessing/resource_sharer.py", "start": 24007496, "end": 24012641}, {"filename": "/usr/local/lib/python3.13/multiprocessing/resource_tracker.py", "start": 24012641, "end": 24024639}, {"filename": "/usr/local/lib/python3.13/multiprocessing/shared_memory.py", "start": 24024639, "end": 24043550}, {"filename": "/usr/local/lib/python3.13/multiprocessing/sharedctypes.py", "start": 24043550, "end": 24049856}, {"filename": "/usr/local/lib/python3.13/multiprocessing/spawn.py", "start": 24049856, "end": 24059500}, {"filename": "/usr/local/lib/python3.13/multiprocessing/synchronize.py", "start": 24059500, "end": 24071772}, {"filename": "/usr/local/lib/python3.13/multiprocessing/util.py", "start": 24071772, "end": 24085759}, {"filename": "/usr/local/lib/python3.13/netrc.py", "start": 24085759, "end": 24092681}, {"filename": "/usr/local/lib/python3.13/ntpath.py", "start": 24092681, "end": 24123567}, {"filename": "/usr/local/lib/python3.13/nturl2path.py", "start": 24123567, "end": 24125941}, {"filename": "/usr/local/lib/python3.13/numbers.py", "start": 24125941, "end": 24137408}, {"filename": "/usr/local/lib/python3.13/opcode.py", "start": 24137408, "end": 24140233}, {"filename": "/usr/local/lib/python3.13/operator.py", "start": 24140233, "end": 24151213}, {"filename": "/usr/local/lib/python3.13/optparse.py", "start": 24151213, "end": 24211582}, {"filename": "/usr/local/lib/python3.13/os.py", "start": 24211582, "end": 24253217}, {"filename": "/usr/local/lib/python3.13/pathlib/__init__.py", "start": 24253217, "end": 24253513}, {"filename": "/usr/local/lib/python3.13/pathlib/_abc.py", "start": 24253513, "end": 24287078}, {"filename": "/usr/local/lib/python3.13/pathlib/_local.py", "start": 24287078, "end": 24318538}, {"filename": "/usr/local/lib/python3.13/pdb.py", "start": 24318538, "end": 24409462}, {"filename": "/usr/local/lib/python3.13/pickle.py", "start": 24409462, "end": 24476419}, {"filename": "/usr/local/lib/python3.13/pickletools.py", "start": 24476419, "end": 24570471}, {"filename": "/usr/local/lib/python3.13/pkgutil.py", "start": 24570471, "end": 24588752}, {"filename": "/usr/local/lib/python3.13/platform.py", "start": 24588752, "end": 24636097}, {"filename": "/usr/local/lib/python3.13/plistlib.py", "start": 24636097, "end": 24666131}, {"filename": "/usr/local/lib/python3.13/poplib.py", "start": 24666131, "end": 24680735}, {"filename": "/usr/local/lib/python3.13/posixpath.py", "start": 24680735, "end": 24698968}, {"filename": "/usr/local/lib/python3.13/pprint.py", "start": 24698968, "end": 24723126}, {"filename": "/usr/local/lib/python3.13/profile.py", "start": 24723126, "end": 24746265}, {"filename": "/usr/local/lib/python3.13/pstats.py", "start": 24746265, "end": 24775561}, {"filename": "/usr/local/lib/python3.13/pty.py", "start": 24775561, "end": 24781698}, {"filename": "/usr/local/lib/python3.13/py_compile.py", "start": 24781698, "end": 24789535}, {"filename": "/usr/local/lib/python3.13/pyclbr.py", "start": 24789535, "end": 24800931}, {"filename": "/usr/local/lib/python3.13/pydoc.py", "start": 24800931, "end": 24911165}, {"filename": "/usr/local/lib/python3.13/pydoc_data/__init__.py", "start": 24911165, "end": 24911165}, {"filename": "/usr/local/lib/python3.13/pydoc_data/topics.py", "start": 24911165, "end": 25439337}, {"filename": "/usr/local/lib/python3.13/queue.py", "start": 25439337, "end": 25452818}, {"filename": "/usr/local/lib/python3.13/quopri.py", "start": 25452818, "end": 25460001}, {"filename": "/usr/local/lib/python3.13/random.py", "start": 25460001, "end": 25497007}, {"filename": "/usr/local/lib/python3.13/re/__init__.py", "start": 25497007, "end": 25514883}, {"filename": "/usr/local/lib/python3.13/re/_casefix.py", "start": 25514883, "end": 25520327}, {"filename": "/usr/local/lib/python3.13/re/_compiler.py", "start": 25520327, "end": 25546617}, {"filename": "/usr/local/lib/python3.13/re/_constants.py", "start": 25546617, "end": 25552556}, {"filename": "/usr/local/lib/python3.13/re/_parser.py", "start": 25552556, "end": 25593793}, {"filename": "/usr/local/lib/python3.13/reprlib.py", "start": 25593793, "end": 25600985}, {"filename": "/usr/local/lib/python3.13/rlcompleter.py", "start": 25600985, "end": 25608903}, {"filename": "/usr/local/lib/python3.13/runpy.py", "start": 25608903, "end": 25621788}, {"filename": "/usr/local/lib/python3.13/sched.py", "start": 25621788, "end": 25628139}, {"filename": "/usr/local/lib/python3.13/secrets.py", "start": 25628139, "end": 25630123}, {"filename": "/usr/local/lib/python3.13/selectors.py", "start": 25630123, "end": 25649580}, {"filename": "/usr/local/lib/python3.13/shelve.py", "start": 25649580, "end": 25658390}, {"filename": "/usr/local/lib/python3.13/shlex.py", "start": 25658390, "end": 25671743}, {"filename": "/usr/local/lib/python3.13/shutil.py", "start": 25671743, "end": 25729206}, {"filename": "/usr/local/lib/python3.13/signal.py", "start": 25729206, "end": 25731701}, {"filename": "/usr/local/lib/python3.13/site.py", "start": 25731701, "end": 25758349}, {"filename": "/usr/local/lib/python3.13/smtplib.py", "start": 25758349, "end": 25801880}, {"filename": "/usr/local/lib/python3.13/socket.py", "start": 25801880, "end": 25839639}, {"filename": "/usr/local/lib/python3.13/socketserver.py", "start": 25839639, "end": 25867704}, {"filename": "/usr/local/lib/python3.13/sqlite3/__init__.py", "start": 25867704, "end": 25870205}, {"filename": "/usr/local/lib/python3.13/sqlite3/__main__.py", "start": 25870205, "end": 25874162}, {"filename": "/usr/local/lib/python3.13/sqlite3/dbapi2.py", "start": 25874162, "end": 25877793}, {"filename": "/usr/local/lib/python3.13/sqlite3/dump.py", "start": 25877793, "end": 25882033}, {"filename": "/usr/local/lib/python3.13/sre_compile.py", "start": 25882033, "end": 25882264}, {"filename": "/usr/local/lib/python3.13/sre_constants.py", "start": 25882264, "end": 25882496}, {"filename": "/usr/local/lib/python3.13/sre_parse.py", "start": 25882496, "end": 25882725}, {"filename": "/usr/local/lib/python3.13/ssl.py", "start": 25882725, "end": 25935431}, {"filename": "/usr/local/lib/python3.13/stat.py", "start": 25935431, "end": 25941578}, {"filename": "/usr/local/lib/python3.13/statistics.py", "start": 25941578, "end": 26003409}, {"filename": "/usr/local/lib/python3.13/string.py", "start": 26003409, "end": 26015195}, {"filename": "/usr/local/lib/python3.13/stringprep.py", "start": 26015195, "end": 26028112}, {"filename": "/usr/local/lib/python3.13/struct.py", "start": 26028112, "end": 26028369}, {"filename": "/usr/local/lib/python3.13/subprocess.py", "start": 26028369, "end": 26117855}, {"filename": "/usr/local/lib/python3.13/symtable.py", "start": 26117855, "end": 26132062}, {"filename": "/usr/local/lib/python3.13/sysconfig/__init__.py", "start": 26132062, "end": 26160738}, {"filename": "/usr/local/lib/python3.13/sysconfig/__main__.py", "start": 26160738, "end": 26169069}, {"filename": "/usr/local/lib/python3.13/tabnanny.py", "start": 26169069, "end": 26180600}, {"filename": "/usr/local/lib/python3.13/tarfile.py", "start": 26180600, "end": 26296361}, {"filename": "/usr/local/lib/python3.13/tempfile.py", "start": 26296361, "end": 26336455}, {"filename": "/usr/local/lib/python3.13/textwrap.py", "start": 26336455, "end": 26356394}, {"filename": "/usr/local/lib/python3.13/this.py", "start": 26356394, "end": 26357397}, {"filename": "/usr/local/lib/python3.13/threading.py", "start": 26357397, "end": 26412641}, {"filename": "/usr/local/lib/python3.13/timeit.py", "start": 26412641, "end": 26426104}, {"filename": "/usr/local/lib/python3.13/token.py", "start": 26426104, "end": 26428593}, {"filename": "/usr/local/lib/python3.13/tokenize.py", "start": 26428593, "end": 26450161}, {"filename": "/usr/local/lib/python3.13/tomllib/__init__.py", "start": 26450161, "end": 26450469}, {"filename": "/usr/local/lib/python3.13/tomllib/_parser.py", "start": 26450469, "end": 26473135}, {"filename": "/usr/local/lib/python3.13/tomllib/_re.py", "start": 26473135, "end": 26476093}, {"filename": "/usr/local/lib/python3.13/tomllib/_types.py", "start": 26476093, "end": 26476347}, {"filename": "/usr/local/lib/python3.13/trace.py", "start": 26476347, "end": 26506061}, {"filename": "/usr/local/lib/python3.13/traceback.py", "start": 26506061, "end": 26572585}, {"filename": "/usr/local/lib/python3.13/tracemalloc.py", "start": 26572585, "end": 26590632}, {"filename": "/usr/local/lib/python3.13/tty.py", "start": 26590632, "end": 26592667}, {"filename": "/usr/local/lib/python3.13/turtle.py", "start": 26592667, "end": 26737994}, {"filename": "/usr/local/lib/python3.13/types.py", "start": 26737994, "end": 26749201}, {"filename": "/usr/local/lib/python3.13/typing.py", "start": 26749201, "end": 26881919}, {"filename": "/usr/local/lib/python3.13/unittest/__init__.py", "start": 26881919, "end": 26885142}, {"filename": "/usr/local/lib/python3.13/unittest/__main__.py", "start": 26885142, "end": 26885614}, {"filename": "/usr/local/lib/python3.13/unittest/_log.py", "start": 26885614, "end": 26888360}, {"filename": "/usr/local/lib/python3.13/unittest/async_case.py", "start": 26888360, "end": 26893990}, {"filename": "/usr/local/lib/python3.13/unittest/case.py", "start": 26893990, "end": 26952353}, {"filename": "/usr/local/lib/python3.13/unittest/loader.py", "start": 26952353, "end": 26971694}, {"filename": "/usr/local/lib/python3.13/unittest/main.py", "start": 26971694, "end": 26983326}, {"filename": "/usr/local/lib/python3.13/unittest/mock.py", "start": 26983326, "end": 27094249}, {"filename": "/usr/local/lib/python3.13/unittest/result.py", "start": 27094249, "end": 27103379}, {"filename": "/usr/local/lib/python3.13/unittest/runner.py", "start": 27103379, "end": 27113747}, {"filename": "/usr/local/lib/python3.13/unittest/signals.py", "start": 27113747, "end": 27116150}, {"filename": "/usr/local/lib/python3.13/unittest/suite.py", "start": 27116150, "end": 27129662}, {"filename": "/usr/local/lib/python3.13/unittest/util.py", "start": 27129662, "end": 27134877}, {"filename": "/usr/local/lib/python3.13/urllib/__init__.py", "start": 27134877, "end": 27134877}, {"filename": "/usr/local/lib/python3.13/urllib/error.py", "start": 27134877, "end": 27137292}, {"filename": "/usr/local/lib/python3.13/urllib/parse.py", "start": 27137292, "end": 27182968}, {"filename": "/usr/local/lib/python3.13/urllib/request.py", "start": 27182968, "end": 27285437}, {"filename": "/usr/local/lib/python3.13/urllib/response.py", "start": 27285437, "end": 27287798}, {"filename": "/usr/local/lib/python3.13/urllib/robotparser.py", "start": 27287798, "end": 27297266}, {"filename": "/usr/local/lib/python3.13/uuid.py", "start": 27297266, "end": 27326407}, {"filename": "/usr/local/lib/python3.13/warnings.py", "start": 27326407, "end": 27353355}, {"filename": "/usr/local/lib/python3.13/wave.py", "start": 27353355, "end": 27376591}, {"filename": "/usr/local/lib/python3.13/weakref.py", "start": 27376591, "end": 27398104}, {"filename": "/usr/local/lib/python3.13/webbrowser.py", "start": 27398104, "end": 27422886}, {"filename": "/usr/local/lib/python3.13/wsgiref/__init__.py", "start": 27422886, "end": 27423543}, {"filename": "/usr/local/lib/python3.13/wsgiref/handlers.py", "start": 27423543, "end": 27445207}, {"filename": "/usr/local/lib/python3.13/wsgiref/headers.py", "start": 27445207, "end": 27452577}, {"filename": "/usr/local/lib/python3.13/wsgiref/simple_server.py", "start": 27452577, "end": 27457629}, {"filename": "/usr/local/lib/python3.13/wsgiref/types.py", "start": 27457629, "end": 27459346}, {"filename": "/usr/local/lib/python3.13/wsgiref/util.py", "start": 27459346, "end": 27464835}, {"filename": "/usr/local/lib/python3.13/wsgiref/validate.py", "start": 27464835, "end": 27479871}, {"filename": "/usr/local/lib/python3.13/xml/__init__.py", "start": 27479871, "end": 27480428}, {"filename": "/usr/local/lib/python3.13/xml/dom/NodeFilter.py", "start": 27480428, "end": 27481364}, {"filename": "/usr/local/lib/python3.13/xml/dom/__init__.py", "start": 27481364, "end": 27485383}, {"filename": "/usr/local/lib/python3.13/xml/dom/domreg.py", "start": 27485383, "end": 27488834}, {"filename": "/usr/local/lib/python3.13/xml/dom/expatbuilder.py", "start": 27488834, "end": 27524527}, {"filename": "/usr/local/lib/python3.13/xml/dom/minicompat.py", "start": 27524527, "end": 27527894}, {"filename": "/usr/local/lib/python3.13/xml/dom/minidom.py", "start": 27527894, "end": 27596350}, {"filename": "/usr/local/lib/python3.13/xml/dom/pulldom.py", "start": 27596350, "end": 27607987}, {"filename": "/usr/local/lib/python3.13/xml/dom/xmlbuilder.py", "start": 27607987, "end": 27620407}, {"filename": "/usr/local/lib/python3.13/xml/etree/ElementInclude.py", "start": 27620407, "end": 27627359}, {"filename": "/usr/local/lib/python3.13/xml/etree/ElementPath.py", "start": 27627359, "end": 27641587}, {"filename": "/usr/local/lib/python3.13/xml/etree/ElementTree.py", "start": 27641587, "end": 27715896}, {"filename": "/usr/local/lib/python3.13/xml/etree/__init__.py", "start": 27715896, "end": 27717501}, {"filename": "/usr/local/lib/python3.13/xml/etree/cElementTree.py", "start": 27717501, "end": 27717583}, {"filename": "/usr/local/lib/python3.13/xml/parsers/__init__.py", "start": 27717583, "end": 27717750}, {"filename": "/usr/local/lib/python3.13/xml/parsers/expat.py", "start": 27717750, "end": 27717998}, {"filename": "/usr/local/lib/python3.13/xml/sax/__init__.py", "start": 27717998, "end": 27721236}, {"filename": "/usr/local/lib/python3.13/xml/sax/_exceptions.py", "start": 27721236, "end": 27725935}, {"filename": "/usr/local/lib/python3.13/xml/sax/expatreader.py", "start": 27725935, "end": 27741969}, {"filename": "/usr/local/lib/python3.13/xml/sax/handler.py", "start": 27741969, "end": 27757586}, {"filename": "/usr/local/lib/python3.13/xml/sax/saxutils.py", "start": 27757586, "end": 27769841}, {"filename": "/usr/local/lib/python3.13/xml/sax/xmlreader.py", "start": 27769841, "end": 27782465}, {"filename": "/usr/local/lib/python3.13/xmlrpc/__init__.py", "start": 27782465, "end": 27782503}, {"filename": "/usr/local/lib/python3.13/xmlrpc/client.py", "start": 27782503, "end": 27831064}, {"filename": "/usr/local/lib/python3.13/xmlrpc/server.py", "start": 27831064, "end": 27867886}, {"filename": "/usr/local/lib/python3.13/zipapp.py", "start": 27867886, "end": 27876504}, {"filename": "/usr/local/lib/python3.13/zipfile/__init__.py", "start": 27876504, "end": 27966295}, {"filename": "/usr/local/lib/python3.13/zipfile/__main__.py", "start": 27966295, "end": 27966353}, {"filename": "/usr/local/lib/python3.13/zipfile/_path/__init__.py", "start": 27966353, "end": 27978309}, {"filename": "/usr/local/lib/python3.13/zipfile/_path/glob.py", "start": 27978309, "end": 27981623}, {"filename": "/usr/local/lib/python3.13/zipimport.py", "start": 27981623, "end": 28014513}, {"filename": "/usr/local/lib/python3.13/zoneinfo/__init__.py", "start": 28014513, "end": 28015216}, {"filename": "/usr/local/lib/python3.13/zoneinfo/_common.py", "start": 28015216, "end": 28020510}, {"filename": "/usr/local/lib/python3.13/zoneinfo/_tzpath.py", "start": 28020510, "end": 28025898}, {"filename": "/usr/local/lib/python3.13/zoneinfo/_zoneinfo.py", "start": 28025898, "end": 28050572}, {"filename": "/utils.py", "start": 28050572, "end": 28067589}, {"filename": "/wiki_catalog.py", "start": 28067589, "end": 28988409}, {"filename": "/wiki_extra.py", "start": 28988409, "end": 31586548}, {"filename": "/wikilivedrops.py", "start": 31586548, "end": 31590171}, {"filename": "/wikiui.py", "start": 31590171, "end": 31600699}, {"filename": "/worldbonusmax.py", "start": 31600699, "end": 31604557}, {"filename": "/yangamount.py", "start": 31604557, "end": 31605815}, {"filename": "/icon/item/54700.tga", "start": 31605815, "end": 31609955}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000000/areaambiencedata.txt", "start": 31609955, "end": 31609996}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000000/areadata.txt", "start": 31609996, "end": 31615684}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000000/areaproperty.txt", "start": 31615684, "end": 31615740}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000000/attr.atr", "start": 31615740, "end": 31681282}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000000/height.raw", "start": 31681282, "end": 31715604}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000000/minimap.dds", "start": 31715604, "end": 31748500}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000000/shadowmap.dds", "start": 31748500, "end": 31792332}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000000/shadowmap.raw", "start": 31792332, "end": 31923404}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000000/tile.raw", "start": 31923404, "end": 31989968}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000000/water.wtr", "start": 31989968, "end": 32006359}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000001/areaambiencedata.txt", "start": 32006359, "end": 32006400}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000001/areadata.txt", "start": 32006400, "end": 32006433}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000001/areaproperty.txt", "start": 32006433, "end": 32006489}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000001/attr.atr", "start": 32006489, "end": 32072031}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000001/height.raw", "start": 32072031, "end": 32106353}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000001/minimap.dds", "start": 32106353, "end": 32139249}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000001/shadowmap.dds", "start": 32139249, "end": 32183081}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000001/shadowmap.raw", "start": 32183081, "end": 32314153}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000001/tile.raw", "start": 32314153, "end": 32380717}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/000001/water.wtr", "start": 32380717, "end": 32397108}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001000/areaambiencedata.txt", "start": 32397108, "end": 32397149}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001000/areadata.txt", "start": 32397149, "end": 32397317}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001000/areaproperty.txt", "start": 32397317, "end": 32397373}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001000/attr.atr", "start": 32397373, "end": 32462915}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001000/height.raw", "start": 32462915, "end": 32497237}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001000/minimap.dds", "start": 32497237, "end": 32530133}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001000/shadowmap.dds", "start": 32530133, "end": 32573965}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001000/shadowmap.raw", "start": 32573965, "end": 32705037}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001000/tile.raw", "start": 32705037, "end": 32771601}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001000/water.wtr", "start": 32771601, "end": 32787992}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001001/areaambiencedata.txt", "start": 32787992, "end": 32788033}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001001/areadata.txt", "start": 32788033, "end": 32788066}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001001/areaproperty.txt", "start": 32788066, "end": 32788122}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001001/attr.atr", "start": 32788122, "end": 32853664}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001001/height.raw", "start": 32853664, "end": 32887986}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001001/minimap.dds", "start": 32887986, "end": 32920882}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001001/shadowmap.dds", "start": 32920882, "end": 32964714}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001001/shadowmap.raw", "start": 32964714, "end": 33095786}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001001/tile.raw", "start": 33095786, "end": 33162350}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/001001/water.wtr", "start": 33162350, "end": 33178741}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/mapproperty.txt", "start": 33178741, "end": 33178788}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/setting.txt", "start": 33178788, "end": 33179013}, {"filename": "/maps/metin2_map_skipia_dungeon_boss/skipia_dungeon.msenv", "start": 33179013, "end": 33181068}, {"filename": "/ymir work/ui/atlas/metin2_map_skipia_dungeon_boss/atlas.sub", "start": 33181068, "end": 33181185}, {"filename": "/ymir work/ui/atlas/metin2_map_skipia_dungeon_boss/metin2_map_skipia_dungeon_boss_atlas.dds", "start": 33181185, "end": 34229889}, {"filename": "/autofishing.py", "start": 34229889, "end": 34235526}, {"filename": "/christmas_items.py", "start": 34235526, "end": 34239877}, {"filename": "/christmasevent.py", "start": 34239877, "end": 34244277}, {"filename": "/companionoffline_text.py", "start": 34244277, "end": 34335444}, {"filename": "/companionoptions_text.py", "start": 34335444, "end": 34363432}, {"filename": "/companionstoragehelp.py", "start": 34363432, "end": 34378771}, {"filename": "/craftstorage.py", "start": 34378771, "end": 34394567}, {"filename": "/holidaypreview.py", "start": 34394567, "end": 34398017}, {"filename": "/icon/item/plague_crystal.tga", "start": 34398017, "end": 34401087}, {"filename": "/icon/item/plague_key1.tga", "start": 34401087, "end": 34404992}, {"filename": "/icon/item/plague_key2.tga", "start": 34404992, "end": 34408525}, {"filename": "/icon/item/plague_key3.tga", "start": 34408525, "end": 34412370}, {"filename": "/icon/item/plague_pass.tga", "start": 34412370, "end": 34416229}, {"filename": "/icon/item/plague_potion1.tga", "start": 34416229, "end": 34419092}, {"filename": "/localadvent/chest-icon.png", "start": 34419092, "end": 34421340}, {"filename": "/localadvent.py", "start": 34421340, "end": 34435415}, {"filename": "/localchristmas/effects/detail_lens.dds", "start": 34435415, "end": 34457415}, {"filename": "/localchristmas/effects/festive_lamp.mse", "start": 34457415, "end": 34458789}, {"filename": "/localchristmas/models/34801/damage.msa", "start": 34458789, "end": 34458927}, {"filename": "/localchristmas/models/34801/dead.msa", "start": 34458927, "end": 34459063}, {"filename": "/localchristmas/models/34801/motlist.txt", "start": 34459063, "end": 34459259}, {"filename": "/localchristmas/models/34801/run.msa", "start": 34459259, "end": 34459394}, {"filename": "/localchristmas/models/34801/shape.msm", "start": 34459394, "end": 34460467}, {"filename": "/localchristmas/models/34801/special.msa", "start": 34460467, "end": 34460606}, {"filename": "/localchristmas/models/34801/wait.msa", "start": 34460606, "end": 34460742}, {"filename": "/localchristmas/models/34801/wait_1.msa", "start": 34460742, "end": 34460880}, {"filename": "/localchristmas/models/34801/walk.msa", "start": 34460880, "end": 34461016}, {"filename": "/localchristmas/models/34802/motlist.txt", "start": 34461016, "end": 34461043}, {"filename": "/localchristmas/models/34802/shape.msm", "start": 34461043, "end": 34462540}, {"filename": "/localchristmas/models/34802/wait.msa", "start": 34462540, "end": 34462686}, {"filename": "/localchristmas/models/34803/motlist.txt", "start": 34462686, "end": 34462822}, {"filename": "/localchristmas/models/34803/run.msa", "start": 34462822, "end": 34462967}, {"filename": "/localchristmas/models/34803/shape.msm", "start": 34462967, "end": 34463214}, {"filename": "/localchristmas/models/34803/wait.msa", "start": 34463214, "end": 34463360}, {"filename": "/localchristmas/models/34803/wait1.msa", "start": 34463360, "end": 34463507}, {"filename": "/localchristmas/models/34803/wait2.msa", "start": 34463507, "end": 34463654}, {"filename": "/localchristmas/models/34803/walk.msa", "start": 34463654, "end": 34463800}, {"filename": "/localchristmas/models/34804/shape.msm", "start": 34463800, "end": 34464011}, {"filename": "/localchristmas/models/34804/wait.msa", "start": 34464011, "end": 34464146}, {"filename": "/localchristmas/models/34805/shape.msm", "start": 34464146, "end": 34464357}, {"filename": "/localchristmas/models/34805/wait.msa", "start": 34464357, "end": 34464492}, {"filename": "/localchristmas/models/34806/shape.msm", "start": 34464492, "end": 34464674}, {"filename": "/localchristmas/models/34806/wait.msa", "start": 34464674, "end": 34464809}, {"filename": "/localchristmas/models/34807/motlist.txt", "start": 34464809, "end": 34464835}, {"filename": "/localchristmas/models/34807/shape.msm", "start": 34464835, "end": 34465947}, {"filename": "/localchristmas/models/34807/wait.msa", "start": 34465947, "end": 34466146}, {"filename": "/localchristmas/models/34808/shape.msm", "start": 34466146, "end": 34466554}, {"filename": "/localchristmas/models/34809/shape.msm", "start": 34466554, "end": 34467683}, {"filename": "/localchristmas/mounts/dragon/attack.msa", "start": 34467683, "end": 34467845}, {"filename": "/localchristmas/mounts/dragon/combo.msa", "start": 34467845, "end": 34468006}, {"filename": "/localchristmas/mounts/dragon/damage.msa", "start": 34468006, "end": 34468168}, {"filename": "/localchristmas/mounts/dragon/dead.msa", "start": 34468168, "end": 34468328}, {"filename": "/localchristmas/mounts/dragon/motlist.txt", "start": 34468328, "end": 34468711}, {"filename": "/localchristmas/mounts/dragon/run.msa", "start": 34468711, "end": 34468914}, {"filename": "/localchristmas/mounts/dragon/shape.msm", "start": 34468914, "end": 34472553}, {"filename": "/localchristmas/mounts/dragon/stay00.msa", "start": 34472553, "end": 34472715}, {"filename": "/localchristmas/mounts/dragon/stay01.msa", "start": 34472715, "end": 34473343}, {"filename": "/localchristmas/mounts/dragon/stay02.msa", "start": 34473343, "end": 34473505}, {"filename": "/localchristmas/mounts/dragon/walk.msa", "start": 34473505, "end": 34473709}, {"filename": "/localchristmas/mounts/ice/attack.msa", "start": 34473709, "end": 34473871}, {"filename": "/localchristmas/mounts/ice/damage.msa", "start": 34473871, "end": 34474033}, {"filename": "/localchristmas/mounts/ice/dead.msa", "start": 34474033, "end": 34474193}, {"filename": "/localchristmas/mounts/ice/motlist.txt", "start": 34474193, "end": 34474573}, {"filename": "/localchristmas/mounts/ice/run.msa", "start": 34474573, "end": 34474774}, {"filename": "/localchristmas/mounts/ice/shape.msm", "start": 34474774, "end": 34477983}, {"filename": "/localchristmas/mounts/ice/stay00.msa", "start": 34477983, "end": 34478145}, {"filename": "/localchristmas/mounts/ice/stay01.msa", "start": 34478145, "end": 34478307}, {"filename": "/localchristmas/mounts/ice/stay02.msa", "start": 34478307, "end": 34478469}, {"filename": "/localchristmas/mounts/ice/walk.msa", "start": 34478469, "end": 34478673}, {"filename": "/localchristmas/mounts/icon_dragon.tga", "start": 34478673, "end": 34482551}, {"filename": "/localchristmas/mounts/icon_ice.tga", "start": 34482551, "end": 34486438}, {"filename": "/localchristmas/mounts/icon_rudolf.tga", "start": 34486438, "end": 34490325}, {"filename": "/localchristmas/mounts/rudolf/attack.msa", "start": 34490325, "end": 34490487}, {"filename": "/localchristmas/mounts/rudolf/damage.msa", "start": 34490487, "end": 34490649}, {"filename": "/localchristmas/mounts/rudolf/dead.msa", "start": 34490649, "end": 34490809}, {"filename": "/localchristmas/mounts/rudolf/motlist.txt", "start": 34490809, "end": 34491189}, {"filename": "/localchristmas/mounts/rudolf/run.msa", "start": 34491189, "end": 34491390}, {"filename": "/localchristmas/mounts/rudolf/shape.msm", "start": 34491390, "end": 34494599}, {"filename": "/localchristmas/mounts/rudolf/stay00.msa", "start": 34494599, "end": 34494761}, {"filename": "/localchristmas/mounts/rudolf/stay01.msa", "start": 34494761, "end": 34494923}, {"filename": "/localchristmas/mounts/rudolf/stay02.msa", "start": 34494923, "end": 34495085}, {"filename": "/localchristmas/mounts/rudolf/walk.msa", "start": 34495085, "end": 34495289}, {"filename": "/localchristmas/stones/ball/attack.msa", "start": 34495289, "end": 34495946}, {"filename": "/localchristmas/stones/ball/destroy.msa", "start": 34495946, "end": 34497020}, {"filename": "/localchristmas/stones/ball/motlist.txt", "start": 34497020, "end": 34497443}, {"filename": "/localchristmas/stones/ball/shape.msm", "start": 34497443, "end": 34499028}, {"filename": "/localchristmas/stones/ball/spawn.msa", "start": 34499028, "end": 34499682}, {"filename": "/localchristmas/stones/ball/stay00.msa", "start": 34499682, "end": 34499848}, {"filename": "/localchristmas/stones/metin/attack.msa", "start": 34499848, "end": 34500505}, {"filename": "/localchristmas/stones/metin/destroy.msa", "start": 34500505, "end": 34501577}, {"filename": "/localchristmas/stones/metin/motlist.txt", "start": 34501577, "end": 34502000}, {"filename": "/localchristmas/stones/metin/shape.msm", "start": 34502000, "end": 34504046}, {"filename": "/localchristmas/stones/metin/spawn.msa", "start": 34504046, "end": 34504700}, {"filename": "/localchristmas/stones/metin/stay00.msa", "start": 34504700, "end": 34504866}, {"filename": "/localchristmas/stones/snowman/front_dead.msa", "start": 34504866, "end": 34505071}, {"filename": "/localchristmas/stones/snowman/motlist.txt", "start": 34505071, "end": 34505301}, {"filename": "/localchristmas/stones/snowman/shape.msm", "start": 34505301, "end": 34506413}, {"filename": "/localchristmas/stones/snowman/wait.msa", "start": 34506413, "end": 34506612}, {"filename": "/localchristmas/waves/model1/back_damage.msa", "start": 34506612, "end": 34506786}, {"filename": "/localchristmas/waves/model1/back_knockdown.msa", "start": 34506786, "end": 34506963}, {"filename": "/localchristmas/waves/model1/front_damage.msa", "start": 34506963, "end": 34507138}, {"filename": "/localchristmas/waves/model1/front_dead.msa", "start": 34507138, "end": 34507311}, {"filename": "/localchristmas/waves/model1/front_knockdown.msa", "start": 34507311, "end": 34507489}, {"filename": "/localchristmas/waves/model1/front_standup.msa", "start": 34507489, "end": 34507665}, {"filename": "/localchristmas/waves/model1/motlist.txt", "start": 34507665, "end": 34508159}, {"filename": "/localchristmas/waves/model1/normal_attack.msa", "start": 34508159, "end": 34509430}, {"filename": "/localchristmas/waves/model1/run.msa", "start": 34509430, "end": 34509632}, {"filename": "/localchristmas/waves/model1/shape.msm", "start": 34509632, "end": 34511055}, {"filename": "/localchristmas/waves/model1/wait.msa", "start": 34511055, "end": 34511222}, {"filename": "/localchristmas/waves/model1/wait1.msa", "start": 34511222, "end": 34511390}, {"filename": "/localchristmas/waves/model1/walk.msa", "start": 34511390, "end": 34511593}, {"filename": "/localchristmas/waves/model2/00.msa", "start": 34511593, "end": 34511756}, {"filename": "/localchristmas/waves/model2/00_1.msa", "start": 34511756, "end": 34511923}, {"filename": "/localchristmas/waves/model2/00_2.msa", "start": 34511923, "end": 34512090}, {"filename": "/localchristmas/waves/model2/02.msa", "start": 34512090, "end": 34512298}, {"filename": "/localchristmas/waves/model2/03.msa", "start": 34512298, "end": 34512507}, {"filename": "/localchristmas/waves/model2/20.msa", "start": 34512507, "end": 34514646}, {"filename": "/localchristmas/waves/model2/20_1.msa", "start": 34514646, "end": 34516431}, {"filename": "/localchristmas/waves/model2/30.msa", "start": 34516431, "end": 34516596}, {"filename": "/localchristmas/waves/model2/31.msa", "start": 34516596, "end": 34516759}, {"filename": "/localchristmas/waves/model2/32.msa", "start": 34516759, "end": 34516922}, {"filename": "/localchristmas/waves/model2/33.msa", "start": 34516922, "end": 34517085}, {"filename": "/localchristmas/waves/model2/34.msa", "start": 34517085, "end": 34517250}, {"filename": "/localchristmas/waves/model2/35.msa", "start": 34517250, "end": 34517415}, {"filename": "/localchristmas/waves/model2/37.msa", "start": 34517415, "end": 34517580}, {"filename": "/localchristmas/waves/model2/motlist.txt", "start": 34517580, "end": 34518007}, {"filename": "/localchristmas/waves/model2/shape.msm", "start": 34518007, "end": 34519144}, {"filename": "/localchristmas/waves/model3/attack00.msa", "start": 34519144, "end": 34520412}, {"filename": "/localchristmas/waves/model3/damage.msa", "start": 34520412, "end": 34520581}, {"filename": "/localchristmas/waves/model3/dead.msa", "start": 34520581, "end": 34520748}, {"filename": "/localchristmas/waves/model3/knock_down.msa", "start": 34520748, "end": 34520921}, {"filename": "/localchristmas/waves/model3/motlist.txt", "start": 34520921, "end": 34521343}, {"filename": "/localchristmas/waves/model3/run.msa", "start": 34521343, "end": 34521551}, {"filename": "/localchristmas/waves/model3/shape.msm", "start": 34521551, "end": 34522690}, {"filename": "/localchristmas/waves/model3/stand_up.msa", "start": 34522690, "end": 34522861}, {"filename": "/localchristmas/waves/model3/stay00.msa", "start": 34522861, "end": 34523030}, {"filename": "/localchristmas/waves/model4/attack00.msa", "start": 34523030, "end": 34524298}, {"filename": "/localchristmas/waves/model4/damage.msa", "start": 34524298, "end": 34524467}, {"filename": "/localchristmas/waves/model4/dead.msa", "start": 34524467, "end": 34524634}, {"filename": "/localchristmas/waves/model4/knock_down.msa", "start": 34524634, "end": 34524807}, {"filename": "/localchristmas/waves/model4/motlist.txt", "start": 34524807, "end": 34525229}, {"filename": "/localchristmas/waves/model4/run.msa", "start": 34525229, "end": 34525439}, {"filename": "/localchristmas/waves/model4/shape.msm", "start": 34525439, "end": 34526574}, {"filename": "/localchristmas/waves/model4/stand_up.msa", "start": 34526574, "end": 34526745}, {"filename": "/localchristmas/waves/model4/stay00.msa", "start": 34526745, "end": 34526914}, {"filename": "/localchristmas/waves/model5/attack00.msa", "start": 34526914, "end": 34528182}, {"filename": "/localchristmas/waves/model5/damage.msa", "start": 34528182, "end": 34528351}, {"filename": "/localchristmas/waves/model5/dead.msa", "start": 34528351, "end": 34528518}, {"filename": "/localchristmas/waves/model5/knock_down.msa", "start": 34528518, "end": 34528691}, {"filename": "/localchristmas/waves/model5/motlist.txt", "start": 34528691, "end": 34529113}, {"filename": "/localchristmas/waves/model5/run.msa", "start": 34529113, "end": 34529323}, {"filename": "/localchristmas/waves/model5/shape.msm", "start": 34529323, "end": 34530456}, {"filename": "/localchristmas/waves/model5/stand_up.msa", "start": 34530456, "end": 34530627}, {"filename": "/localchristmas/waves/model5/stay00.msa", "start": 34530627, "end": 34530796}, {"filename": "/localchristmas/waves/model6/00.msa", "start": 34530796, "end": 34530961}, {"filename": "/localchristmas/waves/model6/00_1.msa", "start": 34530961, "end": 34531128}, {"filename": "/localchristmas/waves/model6/03.msa", "start": 34531128, "end": 34531337}, {"filename": "/localchristmas/waves/model6/20.msa", "start": 34531337, "end": 34533276}, {"filename": "/localchristmas/waves/model6/20_1.msa", "start": 34533276, "end": 34535476}, {"filename": "/localchristmas/waves/model6/30.msa", "start": 34535476, "end": 34535641}, {"filename": "/localchristmas/waves/model6/30_1.msa", "start": 34535641, "end": 34535808}, {"filename": "/localchristmas/waves/model6/31.msa", "start": 34535808, "end": 34535973}, {"filename": "/localchristmas/waves/model6/32.msa", "start": 34535973, "end": 34536138}, {"filename": "/localchristmas/waves/model6/33.msa", "start": 34536138, "end": 34536303}, {"filename": "/localchristmas/waves/model6/34.msa", "start": 34536303, "end": 34536468}, {"filename": "/localchristmas/waves/model6/34_1.msa", "start": 34536468, "end": 34536635}, {"filename": "/localchristmas/waves/model6/35.msa", "start": 34536635, "end": 34536800}, {"filename": "/localchristmas/waves/model6/36.msa", "start": 34536800, "end": 34536965}, {"filename": "/localchristmas/waves/model6/motlist.txt", "start": 34536965, "end": 34537414}, {"filename": "/localchristmas/waves/model6/shape.msm", "start": 34537414, "end": 34538546}, {"filename": "/localchristmas/waves/model7/back_damage.msa", "start": 34538546, "end": 34538761}, {"filename": "/localchristmas/waves/model7/back_knockdown.msa", "start": 34538761, "end": 34538979}, {"filename": "/localchristmas/waves/model7/front_damage.msa", "start": 34538979, "end": 34539195}, {"filename": "/localchristmas/waves/model7/front_dead.msa", "start": 34539195, "end": 34539409}, {"filename": "/localchristmas/waves/model7/front_knockdown.msa", "start": 34539409, "end": 34539628}, {"filename": "/localchristmas/waves/model7/front_standup.msa", "start": 34539628, "end": 34539845}, {"filename": "/localchristmas/waves/model7/motlist.txt", "start": 34539845, "end": 34540339}, {"filename": "/localchristmas/waves/model7/normal_attack.msa", "start": 34540339, "end": 34541648}, {"filename": "/localchristmas/waves/model7/run.msa", "start": 34541648, "end": 34541858}, {"filename": "/localchristmas/waves/model7/shape.msm", "start": 34541858, "end": 34542986}, {"filename": "/localchristmas/waves/model7/wait.msa", "start": 34542986, "end": 34543194}, {"filename": "/localchristmas/waves/model7/wait1.msa", "start": 34543194, "end": 34543403}, {"filename": "/localchristmas/waves/model7/walk.msa", "start": 34543403, "end": 34543614}, {"filename": "/localchristmas/waves/model8/attack00.msa", "start": 34543614, "end": 34544876}, {"filename": "/localchristmas/waves/model8/damage.msa", "start": 34544876, "end": 34545045}, {"filename": "/localchristmas/waves/model8/dead.msa", "start": 34545045, "end": 34545212}, {"filename": "/localchristmas/waves/model8/knock_down.msa", "start": 34545212, "end": 34545385}, {"filename": "/localchristmas/waves/model8/motlist.txt", "start": 34545385, "end": 34545807}, {"filename": "/localchristmas/waves/model8/run.msa", "start": 34545807, "end": 34546017}, {"filename": "/localchristmas/waves/model8/shape.msm", "start": 34546017, "end": 34547147}, {"filename": "/localchristmas/waves/model8/stand_up.msa", "start": 34547147, "end": 34547318}, {"filename": "/localchristmas/waves/model8/stay00.msa", "start": 34547318, "end": 34547487}, {"filename": "/localchristmas/worldbosses/herald/back_damage00.msa", "start": 34547487, "end": 34547660}, {"filename": "/localchristmas/worldbosses/herald/back_damage01.msa", "start": 34547660, "end": 34547833}, {"filename": "/localchristmas/worldbosses/herald/back_dead.msa", "start": 34547833, "end": 34548002}, {"filename": "/localchristmas/worldbosses/herald/back_knockdown.msa", "start": 34548002, "end": 34548176}, {"filename": "/localchristmas/worldbosses/herald/front_damage00.msa", "start": 34548176, "end": 34548348}, {"filename": "/localchristmas/worldbosses/herald/front_damage01.msa", "start": 34548348, "end": 34548522}, {"filename": "/localchristmas/worldbosses/herald/front_dead.msa", "start": 34548522, "end": 34548692}, {"filename": "/localchristmas/worldbosses/herald/front_knockdown.msa", "start": 34548692, "end": 34548867}, {"filename": "/localchristmas/worldbosses/herald/motlist.txt", "start": 34548867, "end": 34549513}, {"filename": "/localchristmas/worldbosses/herald/normal_attack01.msa", "start": 34549513, "end": 34550821}, {"filename": "/localchristmas/worldbosses/herald/run.msa", "start": 34550821, "end": 34551028}, {"filename": "/localchristmas/worldbosses/herald/shape.msm", "start": 34551028, "end": 34552158}, {"filename": "/localchristmas/worldbosses/herald/special_attack01.msa", "start": 34552158, "end": 34554758}, {"filename": "/localchristmas/worldbosses/herald/wait00.msa", "start": 34554758, "end": 34554925}, {"filename": "/localchristmas/worldbosses/herald/wait01.msa", "start": 34554925, "end": 34555091}, {"filename": "/localchristmas/worldbosses/herald/wait02.msa", "start": 34555091, "end": 34555257}, {"filename": "/localchristmas/worldbosses/herald/walk.msa", "start": 34555257, "end": 34555421}, {"filename": "/localchristmas/worldbosses/thief/attack00.msa", "start": 34555421, "end": 34556692}, {"filename": "/localchristmas/worldbosses/thief/damage.msa", "start": 34556692, "end": 34556862}, {"filename": "/localchristmas/worldbosses/thief/dead.msa", "start": 34556862, "end": 34557030}, {"filename": "/localchristmas/worldbosses/thief/knock_down.msa", "start": 34557030, "end": 34557204}, {"filename": "/localchristmas/worldbosses/thief/motlist.txt", "start": 34557204, "end": 34557659}, {"filename": "/localchristmas/worldbosses/thief/run.msa", "start": 34557659, "end": 34557868}, {"filename": "/localchristmas/worldbosses/thief/shape.msm", "start": 34557868, "end": 34559427}, {"filename": "/localchristmas/worldbosses/thief/skill00.msa", "start": 34559427, "end": 34561331}, {"filename": "/localchristmas/worldbosses/thief/stand_up.msa", "start": 34561331, "end": 34561503}, {"filename": "/localchristmas/worldbosses/thief/stay00.msa", "start": 34561503, "end": 34561673}, {"filename": "/localchristmas/worldbosses/winter/attack00.msa", "start": 34561673, "end": 34562524}, {"filename": "/localchristmas/worldbosses/winter/damage.msa", "start": 34562524, "end": 34562690}, {"filename": "/localchristmas/worldbosses/winter/dead.msa", "start": 34562690, "end": 34562854}, {"filename": "/localchristmas/worldbosses/winter/knock_down.msa", "start": 34562854, "end": 34563024}, {"filename": "/localchristmas/worldbosses/winter/motlist.txt", "start": 34563024, "end": 34563513}, {"filename": "/localchristmas/worldbosses/winter/run.msa", "start": 34563513, "end": 34563720}, {"filename": "/localchristmas/worldbosses/winter/shape.msm", "start": 34563720, "end": 34566113}, {"filename": "/localchristmas/worldbosses/winter/skill00.msa", "start": 34566113, "end": 34567994}, {"filename": "/localchristmas/worldbosses/winter/skill01.msa", "start": 34567994, "end": 34573184}, {"filename": "/localchristmas/worldbosses/winter/stand_up.msa", "start": 34573184, "end": 34573352}, {"filename": "/localchristmas/worldbosses/winter/stay00.msa", "start": 34573352, "end": 34573518}, {"filename": "/localchristmas2019/buff_grzaniec.tga", "start": 34573518, "end": 34576924}, {"filename": "/localchristmas2019/celebration/boom2.dds", "start": 34576924, "end": 34593436}, {"filename": "/localchristmas2019/celebration/boom3.dds", "start": 34593436, "end": 34609948}, {"filename": "/localchristmas2019/celebration/stage_2.mse", "start": 34609948, "end": 34616420}, {"filename": "/localchristmas2019/celebration/stage_3.mse", "start": 34616420, "end": 34622892}, {"filename": "/localsockshop.py", "start": 34622892, "end": 34629909}, {"filename": "/maps/map_a2/001005/areadata.txt", "start": 34629909, "end": 34632316}, {"filename": "/maps/map_a2/001005/height.raw", "start": 34632316, "end": 34666638}, {"filename": "/maps/map_a2/001005/shadowmap.raw", "start": 34666638, "end": 34797710}, {"filename": "/maps/map_a2/001005/tile.raw", "start": 34797710, "end": 34864274}, {"filename": "/maps/plague_dungeon/000000/areaambiencedata.txt", "start": 34864274, "end": 34864315}, {"filename": "/maps/plague_dungeon/000000/areadata.txt", "start": 34864315, "end": 34872307}, {"filename": "/maps/plague_dungeon/000000/areaproperty.txt", "start": 34872307, "end": 34872363}, {"filename": "/maps/plague_dungeon/000000/attr.atr", "start": 34872363, "end": 34937905}, {"filename": "/maps/plague_dungeon/000000/height.raw", "start": 34937905, "end": 34972227}, {"filename": "/maps/plague_dungeon/000000/minimap.dds", "start": 34972227, "end": 35005123}, {"filename": "/maps/plague_dungeon/000000/shadowmap.dds", "start": 35005123, "end": 35038019}, {"filename": "/maps/plague_dungeon/000000/shadowmap.raw", "start": 35038019, "end": 35169091}, {"filename": "/maps/plague_dungeon/000000/tile.raw", "start": 35169091, "end": 35235655}, {"filename": "/maps/plague_dungeon/000000/water.wtr", "start": 35235655, "end": 35252046}, {"filename": "/maps/plague_dungeon/000001/areaambiencedata.txt", "start": 35252046, "end": 35252087}, {"filename": "/maps/plague_dungeon/000001/areadata.txt", "start": 35252087, "end": 35257918}, {"filename": "/maps/plague_dungeon/000001/areaproperty.txt", "start": 35257918, "end": 35257974}, {"filename": "/maps/plague_dungeon/000001/attr.atr", "start": 35257974, "end": 35323516}, {"filename": "/maps/plague_dungeon/000001/height.raw", "start": 35323516, "end": 35357838}, {"filename": "/maps/plague_dungeon/000001/minimap.dds", "start": 35357838, "end": 35390734}, {"filename": "/maps/plague_dungeon/000001/shadowmap.dds", "start": 35390734, "end": 35423630}, {"filename": "/maps/plague_dungeon/000001/shadowmap.raw", "start": 35423630, "end": 35554702}, {"filename": "/maps/plague_dungeon/000001/tile.raw", "start": 35554702, "end": 35621266}, {"filename": "/maps/plague_dungeon/000001/water.wtr", "start": 35621266, "end": 35637657}, {"filename": "/maps/plague_dungeon/000002/areaambiencedata.txt", "start": 35637657, "end": 35637698}, {"filename": "/maps/plague_dungeon/000002/areadata.txt", "start": 35637698, "end": 35637731}, {"filename": "/maps/plague_dungeon/000002/areaproperty.txt", "start": 35637731, "end": 35637787}, {"filename": "/maps/plague_dungeon/000002/attr.atr", "start": 35637787, "end": 35703329}, {"filename": "/maps/plague_dungeon/000002/height.raw", "start": 35703329, "end": 35737651}, {"filename": "/maps/plague_dungeon/000002/minimap.dds", "start": 35737651, "end": 35770547}, {"filename": "/maps/plague_dungeon/000002/shadowmap.dds", "start": 35770547, "end": 35803443}, {"filename": "/maps/plague_dungeon/000002/shadowmap.raw", "start": 35803443, "end": 35934515}, {"filename": "/maps/plague_dungeon/000002/tile.raw", "start": 35934515, "end": 36001079}, {"filename": "/maps/plague_dungeon/000002/water.wtr", "start": 36001079, "end": 36017470}, {"filename": "/maps/plague_dungeon/000003/areaambiencedata.txt", "start": 36017470, "end": 36017511}, {"filename": "/maps/plague_dungeon/000003/areadata.txt", "start": 36017511, "end": 36017544}, {"filename": "/maps/plague_dungeon/000003/areaproperty.txt", "start": 36017544, "end": 36017600}, {"filename": "/maps/plague_dungeon/000003/attr.atr", "start": 36017600, "end": 36083142}, {"filename": "/maps/plague_dungeon/000003/height.raw", "start": 36083142, "end": 36117464}, {"filename": "/maps/plague_dungeon/000003/minimap.dds", "start": 36117464, "end": 36150360}, {"filename": "/maps/plague_dungeon/000003/shadowmap.dds", "start": 36150360, "end": 36183256}, {"filename": "/maps/plague_dungeon/000003/shadowmap.raw", "start": 36183256, "end": 36314328}, {"filename": "/maps/plague_dungeon/000003/tile.raw", "start": 36314328, "end": 36380892}, {"filename": "/maps/plague_dungeon/000003/water.wtr", "start": 36380892, "end": 36397283}, {"filename": "/maps/plague_dungeon/001000/areaambiencedata.txt", "start": 36397283, "end": 36397324}, {"filename": "/maps/plague_dungeon/001000/areadata.txt", "start": 36397324, "end": 36398039}, {"filename": "/maps/plague_dungeon/001000/areaproperty.txt", "start": 36398039, "end": 36398095}, {"filename": "/maps/plague_dungeon/001000/attr.atr", "start": 36398095, "end": 36463637}, {"filename": "/maps/plague_dungeon/001000/height.raw", "start": 36463637, "end": 36497959}, {"filename": "/maps/plague_dungeon/001000/minimap.dds", "start": 36497959, "end": 36530855}, {"filename": "/maps/plague_dungeon/001000/shadowmap.dds", "start": 36530855, "end": 36563751}, {"filename": "/maps/plague_dungeon/001000/shadowmap.raw", "start": 36563751, "end": 36694823}, {"filename": "/maps/plague_dungeon/001000/tile.raw", "start": 36694823, "end": 36761387}, {"filename": "/maps/plague_dungeon/001000/water.wtr", "start": 36761387, "end": 36777778}, {"filename": "/maps/plague_dungeon/001001/areaambiencedata.txt", "start": 36777778, "end": 36777819}, {"filename": "/maps/plague_dungeon/001001/areadata.txt", "start": 36777819, "end": 36789082}, {"filename": "/maps/plague_dungeon/001001/areaproperty.txt", "start": 36789082, "end": 36789138}, {"filename": "/maps/plague_dungeon/001001/attr.atr", "start": 36789138, "end": 36854680}, {"filename": "/maps/plague_dungeon/001001/height.raw", "start": 36854680, "end": 36889002}, {"filename": "/maps/plague_dungeon/001001/minimap.dds", "start": 36889002, "end": 36921898}, {"filename": "/maps/plague_dungeon/001001/shadowmap.dds", "start": 36921898, "end": 36954794}, {"filename": "/maps/plague_dungeon/001001/shadowmap.raw", "start": 36954794, "end": 37085866}, {"filename": "/maps/plague_dungeon/001001/tile.raw", "start": 37085866, "end": 37152430}, {"filename": "/maps/plague_dungeon/001001/water.wtr", "start": 37152430, "end": 37168821}, {"filename": "/maps/plague_dungeon/001002/areaambiencedata.txt", "start": 37168821, "end": 37168862}, {"filename": "/maps/plague_dungeon/001002/areadata.txt", "start": 37168862, "end": 37191702}, {"filename": "/maps/plague_dungeon/001002/areaproperty.txt", "start": 37191702, "end": 37191758}, {"filename": "/maps/plague_dungeon/001002/attr.atr", "start": 37191758, "end": 37257300}, {"filename": "/maps/plague_dungeon/001002/height.raw", "start": 37257300, "end": 37291622}, {"filename": "/maps/plague_dungeon/001002/minimap.dds", "start": 37291622, "end": 37324518}, {"filename": "/maps/plague_dungeon/001002/shadowmap.dds", "start": 37324518, "end": 37357414}, {"filename": "/maps/plague_dungeon/001002/shadowmap.raw", "start": 37357414, "end": 37488486}, {"filename": "/maps/plague_dungeon/001002/tile.raw", "start": 37488486, "end": 37555050}, {"filename": "/maps/plague_dungeon/001002/water.wtr", "start": 37555050, "end": 37571441}, {"filename": "/maps/plague_dungeon/001003/areaambiencedata.txt", "start": 37571441, "end": 37571482}, {"filename": "/maps/plague_dungeon/001003/areadata.txt", "start": 37571482, "end": 37581824}, {"filename": "/maps/plague_dungeon/001003/areaproperty.txt", "start": 37581824, "end": 37581880}, {"filename": "/maps/plague_dungeon/001003/attr.atr", "start": 37581880, "end": 37647422}, {"filename": "/maps/plague_dungeon/001003/height.raw", "start": 37647422, "end": 37681744}, {"filename": "/maps/plague_dungeon/001003/minimap.dds", "start": 37681744, "end": 37714640}, {"filename": "/maps/plague_dungeon/001003/shadowmap.dds", "start": 37714640, "end": 37747536}, {"filename": "/maps/plague_dungeon/001003/shadowmap.raw", "start": 37747536, "end": 37878608}, {"filename": "/maps/plague_dungeon/001003/tile.raw", "start": 37878608, "end": 37945172}, {"filename": "/maps/plague_dungeon/001003/water.wtr", "start": 37945172, "end": 37961563}, {"filename": "/maps/plague_dungeon/002000/areaambiencedata.txt", "start": 37961563, "end": 37961604}, {"filename": "/maps/plague_dungeon/002000/areadata.txt", "start": 37961604, "end": 37961637}, {"filename": "/maps/plague_dungeon/002000/areaproperty.txt", "start": 37961637, "end": 37961693}, {"filename": "/maps/plague_dungeon/002000/attr.atr", "start": 37961693, "end": 38027235}, {"filename": "/maps/plague_dungeon/002000/height.raw", "start": 38027235, "end": 38061557}, {"filename": "/maps/plague_dungeon/002000/minimap.dds", "start": 38061557, "end": 38094453}, {"filename": "/maps/plague_dungeon/002000/shadowmap.dds", "start": 38094453, "end": 38127349}, {"filename": "/maps/plague_dungeon/002000/shadowmap.raw", "start": 38127349, "end": 38258421}, {"filename": "/maps/plague_dungeon/002000/tile.raw", "start": 38258421, "end": 38324985}, {"filename": "/maps/plague_dungeon/002000/water.wtr", "start": 38324985, "end": 38341376}, {"filename": "/maps/plague_dungeon/002001/areaambiencedata.txt", "start": 38341376, "end": 38341417}, {"filename": "/maps/plague_dungeon/002001/areadata.txt", "start": 38341417, "end": 38357442}, {"filename": "/maps/plague_dungeon/002001/areaproperty.txt", "start": 38357442, "end": 38357498}, {"filename": "/maps/plague_dungeon/002001/attr.atr", "start": 38357498, "end": 38423040}, {"filename": "/maps/plague_dungeon/002001/height.raw", "start": 38423040, "end": 38457362}, {"filename": "/maps/plague_dungeon/002001/minimap.dds", "start": 38457362, "end": 38490258}, {"filename": "/maps/plague_dungeon/002001/shadowmap.dds", "start": 38490258, "end": 38523154}, {"filename": "/maps/plague_dungeon/002001/shadowmap.raw", "start": 38523154, "end": 38654226}, {"filename": "/maps/plague_dungeon/002001/tile.raw", "start": 38654226, "end": 38720790}, {"filename": "/maps/plague_dungeon/002001/water.wtr", "start": 38720790, "end": 38737181}, {"filename": "/maps/plague_dungeon/002002/areaambiencedata.txt", "start": 38737181, "end": 38737222}, {"filename": "/maps/plague_dungeon/002002/areadata.txt", "start": 38737222, "end": 38755719}, {"filename": "/maps/plague_dungeon/002002/areaproperty.txt", "start": 38755719, "end": 38755775}, {"filename": "/maps/plague_dungeon/002002/attr.atr", "start": 38755775, "end": 38821317}, {"filename": "/maps/plague_dungeon/002002/height.raw", "start": 38821317, "end": 38855639}, {"filename": "/maps/plague_dungeon/002002/minimap.dds", "start": 38855639, "end": 38888535}, {"filename": "/maps/plague_dungeon/002002/shadowmap.dds", "start": 38888535, "end": 38921431}, {"filename": "/maps/plague_dungeon/002002/shadowmap.raw", "start": 38921431, "end": 39052503}, {"filename": "/maps/plague_dungeon/002002/tile.raw", "start": 39052503, "end": 39119067}, {"filename": "/maps/plague_dungeon/002002/water.wtr", "start": 39119067, "end": 39135458}, {"filename": "/maps/plague_dungeon/002003/areaambiencedata.txt", "start": 39135458, "end": 39135499}, {"filename": "/maps/plague_dungeon/002003/areadata.txt", "start": 39135499, "end": 39144197}, {"filename": "/maps/plague_dungeon/002003/areaproperty.txt", "start": 39144197, "end": 39144253}, {"filename": "/maps/plague_dungeon/002003/attr.atr", "start": 39144253, "end": 39209795}, {"filename": "/maps/plague_dungeon/002003/height.raw", "start": 39209795, "end": 39244117}, {"filename": "/maps/plague_dungeon/002003/minimap.dds", "start": 39244117, "end": 39277013}, {"filename": "/maps/plague_dungeon/002003/shadowmap.dds", "start": 39277013, "end": 39309909}, {"filename": "/maps/plague_dungeon/002003/shadowmap.raw", "start": 39309909, "end": 39440981}, {"filename": "/maps/plague_dungeon/002003/tile.raw", "start": 39440981, "end": 39507545}, {"filename": "/maps/plague_dungeon/002003/water.wtr", "start": 39507545, "end": 39523936}, {"filename": "/maps/plague_dungeon/003000/areaambiencedata.txt", "start": 39523936, "end": 39523977}, {"filename": "/maps/plague_dungeon/003000/areadata.txt", "start": 39523977, "end": 39524010}, {"filename": "/maps/plague_dungeon/003000/areaproperty.txt", "start": 39524010, "end": 39524066}, {"filename": "/maps/plague_dungeon/003000/attr.atr", "start": 39524066, "end": 39589608}, {"filename": "/maps/plague_dungeon/003000/height.raw", "start": 39589608, "end": 39623930}, {"filename": "/maps/plague_dungeon/003000/minimap.dds", "start": 39623930, "end": 39656826}, {"filename": "/maps/plague_dungeon/003000/shadowmap.dds", "start": 39656826, "end": 39689722}, {"filename": "/maps/plague_dungeon/003000/shadowmap.raw", "start": 39689722, "end": 39820794}, {"filename": "/maps/plague_dungeon/003000/tile.raw", "start": 39820794, "end": 39887358}, {"filename": "/maps/plague_dungeon/003000/water.wtr", "start": 39887358, "end": 39903749}, {"filename": "/maps/plague_dungeon/003001/areaambiencedata.txt", "start": 39903749, "end": 39903790}, {"filename": "/maps/plague_dungeon/003001/areadata.txt", "start": 39903790, "end": 39908004}, {"filename": "/maps/plague_dungeon/003001/areaproperty.txt", "start": 39908004, "end": 39908060}, {"filename": "/maps/plague_dungeon/003001/attr.atr", "start": 39908060, "end": 39973602}, {"filename": "/maps/plague_dungeon/003001/height.raw", "start": 39973602, "end": 40007924}, {"filename": "/maps/plague_dungeon/003001/minimap.dds", "start": 40007924, "end": 40040820}, {"filename": "/maps/plague_dungeon/003001/shadowmap.dds", "start": 40040820, "end": 40073716}, {"filename": "/maps/plague_dungeon/003001/shadowmap.raw", "start": 40073716, "end": 40204788}, {"filename": "/maps/plague_dungeon/003001/tile.raw", "start": 40204788, "end": 40271352}, {"filename": "/maps/plague_dungeon/003001/water.wtr", "start": 40271352, "end": 40287743}, {"filename": "/maps/plague_dungeon/003002/areaambiencedata.txt", "start": 40287743, "end": 40287784}, {"filename": "/maps/plague_dungeon/003002/areadata.txt", "start": 40287784, "end": 40287817}, {"filename": "/maps/plague_dungeon/003002/areaproperty.txt", "start": 40287817, "end": 40287873}, {"filename": "/maps/plague_dungeon/003002/attr.atr", "start": 40287873, "end": 40353415}, {"filename": "/maps/plague_dungeon/003002/height.raw", "start": 40353415, "end": 40387737}, {"filename": "/maps/plague_dungeon/003002/minimap.dds", "start": 40387737, "end": 40420633}, {"filename": "/maps/plague_dungeon/003002/shadowmap.dds", "start": 40420633, "end": 40453529}, {"filename": "/maps/plague_dungeon/003002/shadowmap.raw", "start": 40453529, "end": 40584601}, {"filename": "/maps/plague_dungeon/003002/tile.raw", "start": 40584601, "end": 40651165}, {"filename": "/maps/plague_dungeon/003002/water.wtr", "start": 40651165, "end": 40667556}, {"filename": "/maps/plague_dungeon/003003/areaambiencedata.txt", "start": 40667556, "end": 40667597}, {"filename": "/maps/plague_dungeon/003003/areadata.txt", "start": 40667597, "end": 40667630}, {"filename": "/maps/plague_dungeon/003003/areaproperty.txt", "start": 40667630, "end": 40667686}, {"filename": "/maps/plague_dungeon/003003/attr.atr", "start": 40667686, "end": 40733228}, {"filename": "/maps/plague_dungeon/003003/height.raw", "start": 40733228, "end": 40767550}, {"filename": "/maps/plague_dungeon/003003/minimap.dds", "start": 40767550, "end": 40800446}, {"filename": "/maps/plague_dungeon/003003/shadowmap.dds", "start": 40800446, "end": 40833342}, {"filename": "/maps/plague_dungeon/003003/shadowmap.raw", "start": 40833342, "end": 40964414}, {"filename": "/maps/plague_dungeon/003003/tile.raw", "start": 40964414, "end": 41030978}, {"filename": "/maps/plague_dungeon/003003/water.wtr", "start": 41030978, "end": 41047369}, {"filename": "/maps/plague_dungeon/mapproperty.txt", "start": 41047369, "end": 41047416}, {"filename": "/maps/plague_dungeon/regen.txt", "start": 41047416, "end": 41047553}, {"filename": "/maps/plague_dungeon/setting.txt", "start": 41047553, "end": 41047755}, {"filename": "/qolexppercent.py", "start": 41047755, "end": 41053502}, {"filename": "/questjournal.py", "start": 41053502, "end": 41070987}, {"filename": "/questjournal_catalog.py", "start": 41070987, "end": 41079203}, {"filename": "/questsidebar.py", "start": 41079203, "end": 41084084}, {"filename": "/specialuniquetooltip.py", "start": 41084084, "end": 41084669}, {"filename": "/textureset/plague_dungeon.txt", "start": 41084669, "end": 41087081}, {"filename": "/uifortunewheel.py", "start": 41087081, "end": 41114579}, {"filename": "/uihunterforge.py", "start": 41114579, "end": 41124332}, {"filename": "/uisidekickalchemy.py", "start": 41124332, "end": 41138907}, {"filename": "/uisidekickoffline.py", "start": 41138907, "end": 41164356}, {"filename": "/uisidekickoptions.py", "start": 41164356, "end": 41169801}, {"filename": "/uisidekickorders.py", "start": 41169801, "end": 41180821}, {"filename": "/uisidekickstorage.py", "start": 41180821, "end": 41188443}, {"filename": "/wikiguides.py", "start": 41188443, "end": 41198849}, {"filename": "/ymir work/effect/monster2/smoke_dust.dds", "start": 41198849, "end": 41219457}, {"filename": "/ymir work/effect/plechito/monster/halloween2021/spawn_light.dds", "start": 41219457, "end": 41306993}, {"filename": "/ymir work/effect/plechito/monster/halloween2021/stmoke01.dds", "start": 41306993, "end": 41328993}, {"filename": "/ymir work/effect/plechito/monster/halloween2022/coffin_destroy.mse", "start": 41328993, "end": 41338861}, {"filename": "/ymir work/effect/plechito/monster/halloween2022/coffin_loop_green.mse", "start": 41338861, "end": 41348096}, {"filename": "/ymir work/effect/plechito/monster/halloween2022/coffin_loop_red.mse", "start": 41348096, "end": 41357331}, {"filename": "/ymir work/effect/plechito/monster/halloween2022/smoke00.dds", "start": 41357331, "end": 41444867}, {"filename": "/ymir work/effect/plechito/monster/halloween2022/stone1_attack.mse", "start": 41444867, "end": 41455008}, {"filename": "/ymir work/environment/plague_dungeon.msenv", "start": 41455008, "end": 41457361}, {"filename": "/ymir work/monster/halloween2022_coffin/attack.msa", "start": 41457361, "end": 41458033}, {"filename": "/ymir work/monster/halloween2022_coffin/destroy.gr2", "start": 41458033, "end": 41529901}, {"filename": "/ymir work/monster/halloween2022_coffin/destroy.msa", "start": 41529901, "end": 41531211}, {"filename": "/ymir work/monster/halloween2022_coffin/halloween2022_coffin_1.gr2", "start": 41531211, "end": 41728855}, {"filename": "/ymir work/monster/halloween2022_coffin/halloween2022_coffin_1.msm", "start": 41728855, "end": 41730438}, {"filename": "/ymir work/monster/halloween2022_coffin/halloween2022_coffin_2.gr2", "start": 41730438, "end": 41928786}, {"filename": "/ymir work/monster/halloween2022_coffin/halloween2022_coffin_2.msm", "start": 41928786, "end": 41930367}, {"filename": "/ymir work/monster/halloween2022_coffin/halloween_2022_coffin_1.dds", "start": 41930367, "end": 42629559}, {"filename": "/ymir work/monster/halloween2022_coffin/halloween_2022_coffin_2.dds", "start": 42629559, "end": 43328751}, {"filename": "/ymir work/monster/halloween2022_coffin/motlist.txt", "start": 43328751, "end": 43329174}, {"filename": "/ymir work/monster/halloween2022_coffin/spawn.gr2", "start": 43329174, "end": 43345242}, {"filename": "/ymir work/monster/halloween2022_coffin/spawn.msa", "start": 43345242, "end": 43346132}, {"filename": "/ymir work/monster/halloween2022_coffin/stay00.gr2", "start": 43346132, "end": 43361688}, {"filename": "/ymir work/monster/halloween2022_coffin/stay00.msa", "start": 43361688, "end": 43361886}, {"filename": "/ymir work/npc2/jlantern_mark/fb1.dds", "start": 43361886, "end": 43370206}, {"filename": "/ymir work/npc2/jlantern_mark/fb2.dds", "start": 43370206, "end": 43378526}, {"filename": "/ymir work/npc2/jlantern_mark/fb3.dds", "start": 43378526, "end": 43386846}, {"filename": "/ymir work/npc2/jlantern_mark/fire_hallowen1.mse", "start": 43386846, "end": 43396501}, {"filename": "/ymir work/npc2/jlantern_mark/jlantern_mark.dds", "start": 43396501, "end": 43658773}, {"filename": "/ymir work/npc2/jlantern_mark/jlantern_mark.gr2", "start": 43658773, "end": 43786485}, {"filename": "/ymir work/npc2/jlantern_mark/jlantern_mark.msm", "start": 43786485, "end": 43787984}, {"filename": "/ymir work/npc2/jlantern_mark/jlanternitem_mark.dds", "start": 43787984, "end": 43809976}, {"filename": "/ymir work/npc2/jlantern_mark/motlist.txt", "start": 43809976, "end": 43810059}, {"filename": "/ymir work/npc2/jlantern_mark/smoke04.dds", "start": 43810059, "end": 43826571}, {"filename": "/ymir work/npc2/jlantern_mark/wait.gr2", "start": 43826571, "end": 43859855}, {"filename": "/ymir work/npc2/jlantern_mark/wait.msa", "start": 43859855, "end": 43860000}, {"filename": "/ymir work/npc2/jlantern_mark/wait1.gr2", "start": 43860000, "end": 43916496}, {"filename": "/ymir work/npc2/jlantern_mark/wait1.msa", "start": 43916496, "end": 43916644}, {"filename": "/ymir work/npc2/jlantern_mark/wait2.gr2", "start": 43916644, "end": 43968988}, {"filename": "/ymir work/npc2/jlantern_mark/wait2.msa", "start": 43968988, "end": 43969134}, {"filename": "/ymir work/ui/atlas/plague_dungeon/atlas.sub", "start": 43969134, "end": 43969244}, {"filename": "/ymir work/ui/game/questboard/plague_dungeon01.tga", "start": 43969244, "end": 44014288}, {"filename": "/ymir work/ui/game/questboard/plague_dungeon02.tga", "start": 44014288, "end": 44059332}, {"filename": "/ymir work/ui/game/questboard/plague_dungeon03.tga", "start": 44059332, "end": 44104376}, {"filename": "/ymir work/ui/game/questboard/plague_dungeon04.tga", "start": 44104376, "end": 44149420}, {"filename": "/ymir work/ui/game/questboard/plague_dungeon05.tga", "start": 44149420, "end": 44194464}, {"filename": "/ymir work/ui/game/questboard/plague_dungeon06.tga", "start": 44194464, "end": 44239508}, {"filename": "/ymir work/ui/game/questboard/plague_dungeon07.tga", "start": 44239508, "end": 44284552}, {"filename": "/ymir work/ui/game/questboard/plague_dungeon08.tga", "start": 44284552, "end": 44329596}, {"filename": "/ymir work/ui/game/questboard/plague_guard.tga", "start": 44329596, "end": 44372530}, {"filename": "/ymir work/ui/localchristmas/duch_swiat.tga", "start": 44372530, "end": 44376670}, {"filename": "/ymir work/ui/plague_dungeon_atlas.dds", "start": 44376670, "end": 44638942}, {"filename": "/communitylegacy.py", "start": 44638942, "end": 44657752}, {"filename": "/communityreportcompat.py", "start": 44657752, "end": 44658305}, {"filename": "/playerbot_ui/assault_horse/50047.tga", "start": 44658305, "end": 44662445}, {"filename": "/playerbot_ui/assault_horse/50048.tga", "start": 44662445, "end": 44666585}, {"filename": "/playerbot_ui/assault_horse/50049.tga", "start": 44666585, "end": 44670725}, {"filename": "/playerbot_ui/autohunt_button_01.tga", "start": 44670725, "end": 44674523}, {"filename": "/playerbot_ui/autohunt_button_02.tga", "start": 44674523, "end": 44678277}, {"filename": "/playerbot_ui/autohunt_button_03.tga", "start": 44678277, "end": 44682059}, {"filename": "/playerbot_ui/channel_btn_1.tga", "start": 44682059, "end": 44682977}, {"filename": "/playerbot_ui/channel_btn_2.tga", "start": 44682977, "end": 44683895}, {"filename": "/playerbot_ui/channel_btn_3.tga", "start": 44683895, "end": 44684813}, {"filename": "/playerbot_ui/channel_frame_1.tga", "start": 44684813, "end": 44687331}, {"filename": "/playerbot_ui/channel_frame_2.tga", "start": 44687331, "end": 44689849}, {"filename": "/playerbot_ui/channel_frame_3.tga", "start": 44689849, "end": 44692367}, {"filename": "/playerbot_ui/channel_frame_4.tga", "start": 44692367, "end": 44694885}, {"filename": "/playerbot_ui/chest_button.tga", "start": 44694885, "end": 44695687}, {"filename": "/playerbot_ui/chest_button_big.tga", "start": 44695687, "end": 44697495}, {"filename": "/playerbot_ui/chest_slot.tga", "start": 44697495, "end": 44700585}, {"filename": "/playerbot_ui/deposit_btn1.tga", "start": 44700585, "end": 44702393}, {"filename": "/playerbot_ui/deposit_btn2.tga", "start": 44702393, "end": 44704201}, {"filename": "/playerbot_ui/deposit_btn3.tga", "start": 44704201, "end": 44706009}, {"filename": "/playerbot_ui/drawer_classic/frame.tga", "start": 44706009, "end": 44710149}, {"filename": "/playerbot_ui/drawer_classic/horse.tga", "start": 44710149, "end": 44712689}, {"filename": "/playerbot_ui/drawer_classic/mall.tga", "start": 44712689, "end": 44715021}, {"filename": "/playerbot_ui/drawer_classic/opener.tga", "start": 44715021, "end": 44717561}, {"filename": "/playerbot_ui/drawer_classic/preview.tga", "start": 44717561, "end": 44721701}, {"filename": "/playerbot_ui/drawer_classic/search.tga", "start": 44721701, "end": 44724345}, {"filename": "/playerbot_ui/drawer_classic/shop.tga", "start": 44724345, "end": 44726781}, {"filename": "/playerbot_ui/drawer_classic/switchbot.tga", "start": 44726781, "end": 44729425}, {"filename": "/playerbot_ui/drawer_classic/trash.tga", "start": 44729425, "end": 44733565}, {"filename": "/playerbot_ui/drawer_classic/wiki.tga", "start": 44733565, "end": 44735481}, {"filename": "/playerbot_ui/drawer_icons/horse.tga", "start": 44735481, "end": 44738597}, {"filename": "/playerbot_ui/drawer_icons/mall.tga", "start": 44738597, "end": 44741713}, {"filename": "/playerbot_ui/drawer_icons/opener.tga", "start": 44741713, "end": 44744829}, {"filename": "/playerbot_ui/drawer_icons/preview.tga", "start": 44744829, "end": 44747945}, {"filename": "/playerbot_ui/drawer_icons/shop.tga", "start": 44747945, "end": 44751061}, {"filename": "/playerbot_ui/drawer_icons/storekeeper.tga", "start": 44751061, "end": 44754177}, {"filename": "/playerbot_ui/drawer_icons/switchbot.tga", "start": 44754177, "end": 44757293}, {"filename": "/playerbot_ui/drawer_icons/trash.tga", "start": 44757293, "end": 44760409}, {"filename": "/playerbot_ui/flag_1.tga", "start": 44760409, "end": 44761221}, {"filename": "/playerbot_ui/flag_2.tga", "start": 44761221, "end": 44762033}, {"filename": "/playerbot_ui/flag_3.tga", "start": 44762033, "end": 44762845}, {"filename": "/playerbot_ui/fortune_wheel.tga", "start": 44762845, "end": 45122863}, {"filename": "/playerbot_ui/horse_inv_btn1.tga", "start": 45122863, "end": 45124671}, {"filename": "/playerbot_ui/horse_inv_btn2.tga", "start": 45124671, "end": 45126479}, {"filename": "/playerbot_ui/horse_inv_btn3.tga", "start": 45126479, "end": 45128287}, {"filename": "/playerbot_ui/inventory_buttons_slot.tga", "start": 45128287, "end": 45135231}, {"filename": "/playerbot_ui/marker_pin.tga", "start": 45135231, "end": 45135909}, {"filename": "/playerbot_ui/myshop_btn1.tga", "start": 45135909, "end": 45137717}, {"filename": "/playerbot_ui/myshop_btn2.tga", "start": 45137717, "end": 45139525}, {"filename": "/playerbot_ui/myshop_btn3.tga", "start": 45139525, "end": 45141333}, {"filename": "/playerbot_ui/page_lock.tga", "start": 45141333, "end": 45141747}, {"filename": "/playerbot_ui/sidekick_button_01.tga", "start": 45141747, "end": 45145619}, {"filename": "/playerbot_ui/sidekick_button_02.tga", "start": 45145619, "end": 45149413}, {"filename": "/playerbot_ui/sidekick_button_03.tga", "start": 45149413, "end": 45153285}, {"filename": "/playerbot_ui/sidekick_offline/arrow_01.tga", "start": 45153285, "end": 45155629}, {"filename": "/playerbot_ui/sidekick_offline/arrow_02.tga", "start": 45155629, "end": 45157973}, {"filename": "/playerbot_ui/sidekick_offline/arrow_03.tga", "start": 45157973, "end": 45160317}, {"filename": "/playerbot_ui/sidekick_offline/full_01.tga", "start": 45160317, "end": 45190961}, {"filename": "/playerbot_ui/sidekick_offline/full_02.tga", "start": 45190961, "end": 45221605}, {"filename": "/playerbot_ui/sidekick_offline/full_03.tga", "start": 45221605, "end": 45252249}, {"filename": "/playerbot_ui/sidekick_offline/half_01.tga", "start": 45252249, "end": 45267193}, {"filename": "/playerbot_ui/sidekick_offline/half_02.tga", "start": 45267193, "end": 45282137}, {"filename": "/playerbot_ui/sidekick_offline/half_03.tga", "start": 45282137, "end": 45297081}, {"filename": "/playerbot_ui/sidekick_offline/selector_01.tga", "start": 45297081, "end": 45309325}, {"filename": "/playerbot_ui/sidekick_offline/selector_02.tga", "start": 45309325, "end": 45321569}, {"filename": "/playerbot_ui/sidekick_offline/selector_03.tga", "start": 45321569, "end": 45333813}, {"filename": "/playerbot_ui/sidekick_orders/combat.tga", "start": 45333813, "end": 45337953}, {"filename": "/playerbot_ui/sidekick_orders/filter.tga", "start": 45337953, "end": 45342093}, {"filename": "/playerbot_ui/sidekick_orders/fish.tga", "start": 45342093, "end": 45346233}, {"filename": "/playerbot_ui/sidekick_orders/letter.tga", "start": 45346233, "end": 45350373}, {"filename": "/playerbot_ui/sidekick_orders/loot.tga", "start": 45350373, "end": 45354513}, {"filename": "/playerbot_ui/sidekick_orders/report.tga", "start": 45354513, "end": 45358653}, {"filename": "/playerbot_ui/skillbook/1.tga", "start": 45358653, "end": 45361588}, {"filename": "/playerbot_ui/skillbook/106.tga", "start": 45361588, "end": 45364541}, {"filename": "/playerbot_ui/skillbook/107.tga", "start": 45364541, "end": 45367480}, {"filename": "/playerbot_ui/skillbook/108.tga", "start": 45367480, "end": 45370433}, {"filename": "/playerbot_ui/skillbook/109.tga", "start": 45370433, "end": 45373384}, {"filename": "/playerbot_ui/skillbook/110.tga", "start": 45373384, "end": 45376327}, {"filename": "/playerbot_ui/skillbook/111.tga", "start": 45376327, "end": 45379280}, {"filename": "/playerbot_ui/skillbook/16.tga", "start": 45379280, "end": 45382231}, {"filename": "/playerbot_ui/skillbook/17.tga", "start": 45382231, "end": 45385162}, {"filename": "/playerbot_ui/skillbook/18.tga", "start": 45385162, "end": 45388073}, {"filename": "/playerbot_ui/skillbook/19.tga", "start": 45388073, "end": 45391026}, {"filename": "/playerbot_ui/skillbook/2.tga", "start": 45391026, "end": 45393977}, {"filename": "/playerbot_ui/skillbook/20.tga", "start": 45393977, "end": 45396928}, {"filename": "/playerbot_ui/skillbook/3.tga", "start": 45396928, "end": 45399871}, {"filename": "/playerbot_ui/skillbook/31.tga", "start": 45399871, "end": 45402818}, {"filename": "/playerbot_ui/skillbook/32.tga", "start": 45402818, "end": 45405721}, {"filename": "/playerbot_ui/skillbook/33.tga", "start": 45405721, "end": 45408662}, {"filename": "/playerbot_ui/skillbook/34.tga", "start": 45408662, "end": 45411605}, {"filename": "/playerbot_ui/skillbook/35.tga", "start": 45411605, "end": 45414541}, {"filename": "/playerbot_ui/skillbook/4.tga", "start": 45414541, "end": 45417488}, {"filename": "/playerbot_ui/skillbook/46.tga", "start": 45417488, "end": 45420385}, {"filename": "/playerbot_ui/skillbook/47.tga", "start": 45420385, "end": 45423326}, {"filename": "/playerbot_ui/skillbook/48.tga", "start": 45423326, "end": 45426277}, {"filename": "/playerbot_ui/skillbook/49.tga", "start": 45426277, "end": 45429208}, {"filename": "/playerbot_ui/skillbook/5.tga", "start": 45429208, "end": 45432143}, {"filename": "/playerbot_ui/skillbook/50.tga", "start": 45432143, "end": 45435094}, {"filename": "/playerbot_ui/skillbook/51.tga", "start": 45435094, "end": 45438019}, {"filename": "/playerbot_ui/skillbook/61.tga", "start": 45438019, "end": 45440947}, {"filename": "/playerbot_ui/skillbook/62.tga", "start": 45440947, "end": 45443890}, {"filename": "/playerbot_ui/skillbook/63.tga", "start": 45443890, "end": 45446827}, {"filename": "/playerbot_ui/skillbook/64.tga", "start": 45446827, "end": 45449774}, {"filename": "/playerbot_ui/skillbook/65.tga", "start": 45449774, "end": 45452725}, {"filename": "/playerbot_ui/skillbook/66.tga", "start": 45452725, "end": 45455678}, {"filename": "/playerbot_ui/skillbook/76.tga", "start": 45455678, "end": 45458631}, {"filename": "/playerbot_ui/skillbook/77.tga", "start": 45458631, "end": 45461574}, {"filename": "/playerbot_ui/skillbook/78.tga", "start": 45461574, "end": 45464525}, {"filename": "/playerbot_ui/skillbook/79.tga", "start": 45464525, "end": 45467478}, {"filename": "/playerbot_ui/skillbook/80.tga", "start": 45467478, "end": 45470421}, {"filename": "/playerbot_ui/skillbook/81.tga", "start": 45470421, "end": 45473370}, {"filename": "/playerbot_ui/skillbook/91.tga", "start": 45473370, "end": 45476313}, {"filename": "/playerbot_ui/skillbook/92.tga", "start": 45476313, "end": 45479262}, {"filename": "/playerbot_ui/skillbook/93.tga", "start": 45479262, "end": 45482213}, {"filename": "/playerbot_ui/skillbook/94.tga", "start": 45482213, "end": 45485160}, {"filename": "/playerbot_ui/skillbook/95.tga", "start": 45485160, "end": 45488111}, {"filename": "/playerbot_ui/skillbook/96.tga", "start": 45488111, "end": 45491052}, {"filename": "/playerbot_ui/sm_coupon/80019.tga", "start": 45491052, "end": 45495192}, {"filename": "/playerbot_ui/sm_coupon/80020.tga", "start": 45495192, "end": 45499332}, {"filename": "/playerbot_ui/sm_coupon/80021.tga", "start": 45499332, "end": 45503472}, {"filename": "/playerbot_ui/sm_coupon/80022.tga", "start": 45503472, "end": 45507612}, {"filename": "/playerbot_ui/stack_button_01.tga", "start": 45507612, "end": 45509420}, {"filename": "/playerbot_ui/stack_button_02.tga", "start": 45509420, "end": 45511228}, {"filename": "/playerbot_ui/stack_button_03.tga", "start": 45511228, "end": 45513036}, {"filename": "/refineauto.py", "start": 45513036, "end": 45533393}, {"filename": "/uicommunitycontrols.py", "start": 45533393, "end": 45538419}, {"filename": "/uicommunitylocale.py", "start": 45538419, "end": 45538528}, {"filename": "/uireportpanel.py", "start": 45538528, "end": 45561718}, {"filename": "/ymir work/ui/community/gf243/community_button_click.sub", "start": 45561718, "end": 45561832}, {"filename": "/ymir work/ui/community/gf243/community_button_default.sub", "start": 45561832, "end": 45561944}, {"filename": "/ymir work/ui/community/gf243/community_button_mouse_over.sub", "start": 45561944, "end": 45562058}, {"filename": "/ymir work/ui/community/gf243/community_config_main_title.sub", "start": 45562058, "end": 45562170}, {"filename": "/ymir work/ui/community/gf243/community_config_sub_title.sub", "start": 45562170, "end": 45562282}, {"filename": "/ymir work/ui/community/gf243/community_config_subtopic_title_bg.sub", "start": 45562282, "end": 45562390}, {"filename": "/ymir work/ui/community/gf243/community_drop_button_click.sub", "start": 45562390, "end": 45562504}, {"filename": "/ymir work/ui/community/gf243/community_drop_button_default.sub", "start": 45562504, "end": 45562618}, {"filename": "/ymir work/ui/community/gf243/community_drop_button_mouse_over.sub", "start": 45562618, "end": 45562732}, {"filename": "/ymir work/ui/community/gf243/community_drop_list_bottom.sub", "start": 45562732, "end": 45562844}, {"filename": "/ymir work/ui/community/gf243/community_drop_list_middle.sub", "start": 45562844, "end": 45562956}, {"filename": "/ymir work/ui/community/gf243/community_drop_list_top.sub", "start": 45562956, "end": 45563068}, {"filename": "/ymir work/ui/community/gf243/community_drop_mouse_over.sub", "start": 45563068, "end": 45563180}, {"filename": "/ymir work/ui/community/gf243/community_friend_block.sub", "start": 45563180, "end": 45563292}, {"filename": "/ymir work/ui/community/gf243/community_friend_guild_main_title.sub", "start": 45563292, "end": 45563404}, {"filename": "/ymir work/ui/community/gf243/community_friend_member.sub", "start": 45563404, "end": 45563516}, {"filename": "/ymir work/ui/community/gf243/community_friend_request.sub", "start": 45563516, "end": 45563628}, {"filename": "/ymir work/ui/community/gf243/community_guild_member.sub", "start": 45563628, "end": 45563740}, {"filename": "/ymir work/ui/community/gf243/community_icon_block_click.sub", "start": 45563740, "end": 45563852}, {"filename": "/ymir work/ui/community/gf243/community_icon_block_default.sub", "start": 45563852, "end": 45563964}, {"filename": "/ymir work/ui/community/gf243/community_icon_block_mouse_over.sub", "start": 45563964, "end": 45564076}, {"filename": "/ymir work/ui/community/gf243/community_icon_delete_click.sub", "start": 45564076, "end": 45564189}, {"filename": "/ymir work/ui/community/gf243/community_icon_delete_default.sub", "start": 45564189, "end": 45564302}, {"filename": "/ymir work/ui/community/gf243/community_icon_delete_mouse_over.sub", "start": 45564302, "end": 45564415}, {"filename": "/ymir work/ui/community/gf243/community_icon_family_default.sub", "start": 45564415, "end": 45564529}, {"filename": "/ymir work/ui/community/gf243/community_icon_family_mouse_over.sub", "start": 45564529, "end": 45564643}, {"filename": "/ymir work/ui/community/gf243/community_icon_friend.sub", "start": 45564643, "end": 45564757}, {"filename": "/ymir work/ui/community/gf243/community_icon_friend_invite_click.sub", "start": 45564757, "end": 45564868}, {"filename": "/ymir work/ui/community/gf243/community_icon_friend_invite_default.sub", "start": 45564868, "end": 45564979}, {"filename": "/ymir work/ui/community/gf243/community_icon_friend_invite_mouse_over.sub", "start": 45564979, "end": 45565090}, {"filename": "/ymir work/ui/community/gf243/community_icon_guild_member.sub", "start": 45565090, "end": 45565204}, {"filename": "/ymir work/ui/community/gf243/community_icon_level.sub", "start": 45565204, "end": 45565318}, {"filename": "/ymir work/ui/community/gf243/community_icon_my_message_click.sub", "start": 45565318, "end": 45565432}, {"filename": "/ymir work/ui/community/gf243/community_icon_my_message_default.sub", "start": 45565432, "end": 45565546}, {"filename": "/ymir work/ui/community/gf243/community_icon_my_message_mouse_over.sub", "start": 45565546, "end": 45565660}, {"filename": "/ymir work/ui/community/gf243/community_icon_party_invite_click.sub", "start": 45565660, "end": 45565774}, {"filename": "/ymir work/ui/community/gf243/community_icon_party_invite_default.sub", "start": 45565774, "end": 45565888}, {"filename": "/ymir work/ui/community/gf243/community_icon_party_invite_mouse_over.sub", "start": 45565888, "end": 45566002}, {"filename": "/ymir work/ui/community/gf243/community_icon_position_default.sub", "start": 45566002, "end": 45566116}, {"filename": "/ymir work/ui/community/gf243/community_icon_position_mouse_over.sub", "start": 45566116, "end": 45566230}, {"filename": "/ymir work/ui/community/gf243/community_icon_request_accept_click.sub", "start": 45566230, "end": 45566344}, {"filename": "/ymir work/ui/community/gf243/community_icon_request_accept_default.sub", "start": 45566344, "end": 45566458}, {"filename": "/ymir work/ui/community/gf243/community_icon_request_accept_mouse_over.sub", "start": 45566458, "end": 45566572}, {"filename": "/ymir work/ui/community/gf243/community_icon_whisper_click.sub", "start": 45566572, "end": 45566684}, {"filename": "/ymir work/ui/community/gf243/community_icon_whisper_default.sub", "start": 45566684, "end": 45566796}, {"filename": "/ymir work/ui/community/gf243/community_icon_whisper_mouse_over.sub", "start": 45566796, "end": 45566908}, {"filename": "/ymir work/ui/community/gf243/community_icon_wishlist_click.sub", "start": 45566908, "end": 45567022}, {"filename": "/ymir work/ui/community/gf243/community_icon_wishlist_default.sub", "start": 45567022, "end": 45567136}, {"filename": "/ymir work/ui/community/gf243/community_icon_wishlist_mouse_over.sub", "start": 45567136, "end": 45567250}, {"filename": "/ymir work/ui/community/gf243/community_icon_x_click.sub", "start": 45567250, "end": 45567364}, {"filename": "/ymir work/ui/community/gf243/community_icon_x_default.sub", "start": 45567364, "end": 45567478}, {"filename": "/ymir work/ui/community/gf243/community_icon_x_mouse_over.sub", "start": 45567478, "end": 45567592}, {"filename": "/ymir work/ui/community/gf243/community_info_bar_default.sub", "start": 45567592, "end": 45567704}, {"filename": "/ymir work/ui/community/gf243/community_info_bar_family.sub", "start": 45567704, "end": 45567816}, {"filename": "/ymir work/ui/community/gf243/community_info_bar_family_default.sub", "start": 45567816, "end": 45567928}, {"filename": "/ymir work/ui/community/gf243/community_info_bar_family_mouse_over.sub", "start": 45567928, "end": 45568040}, {"filename": "/ymir work/ui/community/gf243/community_info_bar_mouse_over.sub", "start": 45568040, "end": 45568152}, {"filename": "/ymir work/ui/community/gf243/community_info_bar_player.sub", "start": 45568152, "end": 45568264}, {"filename": "/ymir work/ui/community/gf243/community_lower_tab_config.sub", "start": 45568264, "end": 45568375}, {"filename": "/ymir work/ui/community/gf243/community_lower_tab_friend.sub", "start": 45568375, "end": 45568484}, {"filename": "/ymir work/ui/community/gf243/community_lower_tab_guild.sub", "start": 45568484, "end": 45568594}, {"filename": "/ymir work/ui/community/gf243/community_request_button_twinkle.sub", "start": 45568594, "end": 45568707}, {"filename": "/ymir work/ui/community/gf243/community_state_blue.sub", "start": 45568707, "end": 45568821}, {"filename": "/ymir work/ui/community/gf243/community_state_deep_red.sub", "start": 45568821, "end": 45568935}, {"filename": "/ymir work/ui/community/gf243/community_state_green.sub", "start": 45568935, "end": 45569049}, {"filename": "/ymir work/ui/community/gf243/community_state_red.sub", "start": 45569049, "end": 45569163}, {"filename": "/ymir work/ui/community/gf243/community_state_yellow.sub", "start": 45569163, "end": 45569277}, {"filename": "/ymir work/ui/community/gf243/community_tab_mouse_over_block.sub", "start": 45569277, "end": 45569389}, {"filename": "/ymir work/ui/community/gf243/community_tab_mouse_over_member.sub", "start": 45569389, "end": 45569500}, {"filename": "/ymir work/ui/community/gf243/community_tab_mouse_over_request.sub", "start": 45569500, "end": 45569613}, {"filename": "/ymir work/ui/community/gf243/control_add_blocked.sub", "start": 45569613, "end": 45569726}, {"filename": "/ymir work/ui/community/gf243/control_add_click.sub", "start": 45569726, "end": 45569839}, {"filename": "/ymir work/ui/community/gf243/control_add_default.sub", "start": 45569839, "end": 45569952}, {"filename": "/ymir work/ui/community/gf243/control_add_friends.sub", "start": 45569952, "end": 45570065}, {"filename": "/ymir work/ui/community/gf243/control_add_mouse_over.sub", "start": 45570065, "end": 45570178}, {"filename": "/ymir work/ui/community/gf243/control_add_requests.sub", "start": 45570178, "end": 45570291}, {"filename": "/ymir work/ui/community/gf243/control_block_blocked.sub", "start": 45570291, "end": 45570403}, {"filename": "/ymir work/ui/community/gf243/control_block_click.sub", "start": 45570403, "end": 45570515}, {"filename": "/ymir work/ui/community/gf243/control_block_default.sub", "start": 45570515, "end": 45570627}, {"filename": "/ymir work/ui/community/gf243/control_block_friends.sub", "start": 45570627, "end": 45570739}, {"filename": "/ymir work/ui/community/gf243/control_block_mouse_over.sub", "start": 45570739, "end": 45570851}, {"filename": "/ymir work/ui/community/gf243/control_block_requests.sub", "start": 45570851, "end": 45570963}, {"filename": "/ymir work/ui/community/gf243/control_scroll_blocked.sub", "start": 45570963, "end": 45571074}, {"filename": "/ymir work/ui/community/gf243/control_scroll_click.sub", "start": 45571074, "end": 45571185}, {"filename": "/ymir work/ui/community/gf243/control_scroll_default.sub", "start": 45571185, "end": 45571296}, {"filename": "/ymir work/ui/community/gf243/control_scroll_friends.sub", "start": 45571296, "end": 45571407}, {"filename": "/ymir work/ui/community/gf243/control_scroll_mouse_over.sub", "start": 45571407, "end": 45571518}, {"filename": "/ymir work/ui/community/gf243/control_scroll_requests.sub", "start": 45571518, "end": 45571629}, {"filename": "/ymir work/ui/community/gf243/hit.tga", "start": 45571629, "end": 45612745}, {"filename": "/ymir work/ui/community/gf243/messengers_01.dds", "start": 45612745, "end": 46137161}, {"filename": "/ymir work/ui/community/gf243/panel_contact_0.sub", "start": 46137161, "end": 46137273}, {"filename": "/ymir work/ui/community/gf243/panel_contact_1.sub", "start": 46137273, "end": 46137387}, {"filename": "/ymir work/ui/community/gf243/panel_contact_2.sub", "start": 46137387, "end": 46137501}, {"filename": "/ymir work/ui/community/gf243/panel_header_0.sub", "start": 46137501, "end": 46137613}, {"filename": "/ymir work/ui/community/gf243/panel_header_1.sub", "start": 46137613, "end": 46137727}, {"filename": "/ymir work/ui/community/gf243/panel_header_2.sub", "start": 46137727, "end": 46137841}, {"filename": "/ymir work/ui/community/gf243/panel_header_3.sub", "start": 46137841, "end": 46137955}, {"filename": "/ymir work/ui/community/gf243/panel_header_4.sub", "start": 46137955, "end": 46138069}, {"filename": "/ymir work/ui/community/gf243/panel_reason_drop.sub", "start": 46138069, "end": 46138183}, {"filename": "/ymir work/ui/community/gf243/panel_spouse_0.sub", "start": 46138183, "end": 46138295}, {"filename": "/ymir work/ui/community/gf243/panel_spouse_1.sub", "start": 46138295, "end": 46138409}, {"filename": "/ymir work/ui/community/gf243/panel_spouse_2.sub", "start": 46138409, "end": 46138523}, {"filename": "/ymir work/ui/community/gf243/report_heading_left.sub", "start": 46138523, "end": 46138631}, {"filename": "/ymir work/ui/community/gf243/report_heading_right.sub", "start": 46138631, "end": 46138739}, {"filename": "/ymir work/ui/community/gf243/report_reason_0.sub", "start": 46138739, "end": 46138848}, {"filename": "/ymir work/ui/community/gf243/report_reason_1.sub", "start": 46138848, "end": 46138958}, {"filename": "/ymir work/ui/community/gf243/report_reason_2.sub", "start": 46138958, "end": 46139068}, {"filename": "/ymir work/ui/community/gf243/report_reasons.tga", "start": 46139068, "end": 46146024}, {"filename": "/ymir work/ui/community/gf243/report_send_down_left.sub", "start": 46146024, "end": 46146138}, {"filename": "/ymir work/ui/community/gf243/report_send_down_middle.sub", "start": 46146138, "end": 46146252}, {"filename": "/ymir work/ui/community/gf243/report_send_down_right.sub", "start": 46146252, "end": 46146366}, {"filename": "/ymir work/ui/community/gf243/report_send_hit.sub", "start": 46146366, "end": 46146477}, {"filename": "/ymir work/ui/community/gf243/report_send_hit.tga", "start": 46146477, "end": 46158029}, {"filename": "/ymir work/ui/community/gf243/report_send_over_left.sub", "start": 46158029, "end": 46158143}, {"filename": "/ymir work/ui/community/gf243/report_send_over_middle.sub", "start": 46158143, "end": 46158257}, {"filename": "/ymir work/ui/community/gf243/report_send_over_right.sub", "start": 46158257, "end": 46158371}, {"filename": "/ymir work/ui/community/gf243/report_send_up_left.sub", "start": 46158371, "end": 46158481}, {"filename": "/ymir work/ui/community/gf243/report_send_up_middle.sub", "start": 46158481, "end": 46158592}, {"filename": "/ymir work/ui/community/gf243/report_send_up_right.sub", "start": 46158592, "end": 46158705}, {"filename": "/ymir work/ui/community/gf243/tab_hit_0.sub", "start": 46158705, "end": 46158804}, {"filename": "/ymir work/ui/community/gf243/tab_hit_1.sub", "start": 46158804, "end": 46158903}, {"filename": "/ymir work/ui/community/gf243/tab_hit_2.sub", "start": 46158903, "end": 46159002}, {"filename": "/ymir work/ui/community/gf243/windows.dds", "start": 46159002, "end": 46683418}], "remote_package_size": 46683418});

  })();

// end include: <tmp>\tmpge058lku.js
// include: <tmp>\tmpfeacxmpm.js

    // All the pre-js content up to here must remain later on, we need to run
    // it.
    if ((typeof ENVIRONMENT_IS_WASM_WORKER != 'undefined' && ENVIRONMENT_IS_WASM_WORKER) || (typeof ENVIRONMENT_IS_PTHREAD != 'undefined' && ENVIRONMENT_IS_PTHREAD) || (typeof ENVIRONMENT_IS_AUDIO_WORKLET != 'undefined' && ENVIRONMENT_IS_AUDIO_WORKLET)) Module['preRun'] = [];
    var necessaryPreJSTasks = Module['preRun'].slice();
  // end include: <tmp>\tmpfeacxmpm.js
// include: ./compat/runtime.js
// SPDX-License-Identifier: GPL-2.0-or-later
// runtime.js - the JavaScript side of the compatibility layer, linked into
// client.js as `--pre-js`: options from the page address, screen and canvas
// measures, and what the page does when the client ends. C++ reaches it
// through one-line EM_JS bridges (platform_none.cpp, ...).
//
// Design (the renaming plan, section "runtime.js"):
// The build has no -sMODULARIZE, so this file is pasted into client.js at
// top level, right after `Module` is declared and BEFORE `HEAPU8`, `FS` or
// `Module.canvas` exist. Therefore the top level only DEFINES functions and
// the `m2w` object; nothing here touches the runtime until a function is
// called later, from C++. Functions called from here by the emitted EM_JS
// code (`m2w_ui_scale()`) keep working because the bridges stay in the
// glue under their C names.
//
// `window.m2w` is never overwritten: client.html may have put settings in
// it before client.js loaded (`m2w.config.bridge`), and every field is only
// added if missing.

var m2w = globalThis.m2w = globalThis.m2w || {};

// Who made this - one line in the console at start. Not required by the
// license; if you keep it (or mention the project elsewhere), thank you!
// See NOTICE.
if (typeof document !== 'undefined')
    console.log('Metin2 WebClient by nairoad - https://github.com/nairoad/Metin2-WebClient');

m2w.config = m2w.config || {};

// ---------------------------------------------------------------------------
// Options: `?name=value` in the page address
// ---------------------------------------------------------------------------
// Every option has a `name` (the address parameter), the `file` that reads
// it and a `doc` line. `reference.py` reads this table into docs/REFERENCE.md.
//
// ON A REAL SITE ONLY THE PLAYER OPTIONS WORK (`site: true`: scale, language,
// return address, cursor, frame and memory limits). Everything else - the
// bridge and corpus addresses, probes, drawing switches - is read only on a
// local page (file://, localhost, 127.0.0.1): a link to the operator's real
// site with `?bridge=wss://attacker` or `?corpus=https://attacker/` would
// otherwise send the player's login, or load the attacker's game scripts,
// under the real address bar (security audit). On a site the
// bridge address comes from the page itself (m2w.config.bridge).

/// True on a page opened from this machine (file://, localhost, 127.0.0.1,
/// [::1]) - where the diagnostic options are allowed.
m2w.isLocalPage = function () {
    try {
        var loc = globalThis.location;
        return loc.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname);
    } catch (e) {
        return false;
    }
};

m2w.options = m2w.options || {
    table: [
        { name: 'scale',  file: 'platform_none.cpp', site: true,
          doc: 'GUI scale 1-4, snapped to a baked font scale; remembered in localStorage' },
        { name: 'max',    file: 'platform_none.cpp', site: true,
          doc: 'drawing-buffer limit WxH (default 1920x1080); 0 = no limit' },
        { name: 'cursor', file: 'platform_none.cpp', site: true,
          doc: 'software | hardware; default from metin2.cfg' },
        { name: 'return', file: 'platform_none.cpp', site: true,
          doc: 'page to go back to when the client ends' },
        { name: 'run',    file: 'main_web.cpp',
          doc: '0 = link check only, do not enter WinMain' },
        { name: 'missing',  file: 'paths_web.cpp',
          doc: '1 = write every file nobody could find to /missing.txt' },
        { name: 'nomodels', file: 'paths_web.cpp',
          doc: '1 = every .gr2 is treated as missing (negative control)' }
    ],

    /// Raw value of an option by its name, or null when the address has none
    /// - and null for a non-player option on a page that is not local.
    get: function (name) {
        try {
            if (!m2w.isLocalPage()) {
                var row = null;
                for (var i = 0; i < this.table.length; ++i)
                    if (this.table[i].name === name) { row = this.table[i]; break; }
                if (!row || !row.site) return null;
            }
            return new URLSearchParams(globalThis.location.search).get(name);
        } catch (e) {
            return null;
        }
    },

    /// Adds rows from another file (each compat file registers its own).
    add: function (rows) {
        for (var i = 0; i < rows.length; ++i) this.table.push(rows[i]);
    }
};

// ---------------------------------------------------------------------------
// Screen measures
// ---------------------------------------------------------------------------

/// GUI scale: the game sees a LOGICAL screen =
/// physical pixels / scale (`?scale=2` -> windows and fonts 2x larger), while
/// the canvas and the drawing buffer stay PHYSICAL - the 3D world in full
/// resolution, interface quads multiplied in the shader (gl_device.cpp), fonts
/// baked at `lfHeight * scale` (platform_text.cpp), so letters are sharp,
/// not enlarged. Only scales with baked fonts are allowed
/// (tools/bake_fonts.py SKALE); the choice is remembered in
/// localStorage `m2w.scale`. Cached after the first call.
/// PATCH (PT-BR): qualidade grafica do celular ('low' | 'med' | 'high'), escolhida no
/// botao "Graficos" do overlay (localStorage m2w.gfx, ou ?gfx=). 'high' = como antes.
m2w.gfxLevel = function () {
    var v = null;
    try { v = new URLSearchParams(globalThis.location.search).get('gfx'); } catch (e) { }
    try { if (!v) v = localStorage.getItem('m2w.gfx'); } catch (e) { }
    return (v === 'low' || v === 'med') ? v : 'high';
};
/// Escala de interface que o jogador escolheu (antes do ajuste do modo grafico).
m2w.isPolishLocale = function () {
    try {
        var sp = new URLSearchParams(globalThis.location.search);
        var ql = sp.get('lang') || localStorage.getItem('m2/lang') || localStorage.getItem('m2w.uiLang') || sp.get('deflang') || '';
        if (!ql) ql = String((navigator.languages && navigator.languages[0]) || navigator.language || '');
        return String(ql).toLowerCase().slice(0, 2) === 'pl';
    } catch (e) { return false; }
};
m2w.mobileScaleChoice = function () {
    var mv = null;
    try { mv = m2w.options.get('uiscale'); if (mv === null) mv = localStorage.getItem('m2w.mobileScale'); } catch (e) { }
    if (mv === 'hd') return 'hd';
    var mf = parseFloat(mv);
    var defScale = m2w.isPolishLocale() ? 1 : 1.25;
    return ([1, 1.25, 1.5].indexOf(mf) >= 0) ? mf : defScale;
};
m2w.uiScale = function () {
    if (m2w.uiScaleValue) return m2w.uiScaleValue;
    // Graficos "baixo": desenha na resolucao LOGICA (escala 1). As janelas ficam do
    // mesmo tamanho, mas o 3D tem menos pixels (125% -> 36% menos pixels por quadro).
    if (m2w.isMobile && m2w.isMobile() && m2w.gfxLevel() === 'low') {
        m2w.uiScaleValue = 1;
        return 1;
    }
    // Mobile: fixed 1:1 logical == physical (the buffer is a constant 1024x576, see windowSize).
    // PATCH (PT-BR): no celular a escala da interface agora e escolhida pelo jogador
    // (botao "Tamanho" do overlay -> localStorage m2w.mobileScale, ou ?uiscale=).
    // O buffer de desenho continua do mesmo tamanho (3D nitido); so a tela LOGICA
    // do jogo diminui, entao janelas, icones e fontes ficam maiores.
    if (m2w.isMobile && m2w.isMobile()) {
        var ms = m2w.isPolishLocale() ? 1 : 1.25;
        try {
            var mv = m2w.options.get('uiscale');
            if (mv === null) mv = localStorage.getItem('m2w.mobileScale');
            var mf = parseFloat(mv);
            if ([1, 1.25, 1.5].indexOf(mf) >= 0) ms = mf;
            // "hd": mesmo tamanho de janelas do 125%, mas com escala inteira (2x) sobre um
            // buffer 1,6x maior -> letras desenhadas no tamanho real (sem borrar).
            if (mv === 'hd') ms = 2;
        } catch (e) { }
        m2w.uiScaleValue = ms;
        return ms;
    }
    var scale = 1;
    try {
        var v = m2w.options.get('scale');
        if (v === null) v = localStorage.getItem('m2w.scale');
        else localStorage.setItem('m2w.scale', v);
        var f = parseFloat(v);
        if (f >= 1 && f <= 4) scale = f;
    } catch (e) { }
    var allowed = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
    var nearest = allowed[0];
    for (var i = 1; i < allowed.length; ++i)
        if (Math.abs(allowed[i] - scale) < Math.abs(nearest - scale)) nearest = allowed[i];
    if (nearest !== scale) console.warn('m2w scale: ' + scale + ' -> ' + nearest + ' (baked fonts)');
    m2w.uiScaleValue = nearest;
    return nearest;
};

/// Effective device pixel ratio with the RESOLUTION CAP: the
/// drawing buffer does not exceed 1920x1080 (user: "Full HD at most"). On a
/// larger screen the game gets 1080p and the browser stretches the canvas
/// (CSS 100%) over the whole area - like the Windows client at 1920x1080 on
/// a 4K monitor. One factor, min(devicePixelRatio, 1920 / CSS width,
/// 1080 / CSS height), goes through EVERY screen measure (GetSystemMetrics,
/// desktop mode, canvas size, mouse). `?max=WxH` changes the limit,
/// `?max=0` removes it.
/// Mobile entry (client.html?mobile=1 / mobile.html): true.
m2w.isMobile = function () {
    try {
        return !!(globalThis.m2w && globalThis.m2w.config && globalThis.m2w.config.mobile)
            || m2w.options.get('mobile') === '1';
    } catch (e) { return false; }
};

m2w.effectiveDpr = function () {
    var dpr = globalThis.devicePixelRatio || 1;
    try {
        if (m2w.maxBuffer === undefined) {
            var v = m2w.options.get('max');
            var w = 1920, h = 1080;
            if (m2w.isMobile()) { w = 1280; h = 720; }  // mobile: capped buffer (height floor below)
            if (v !== null) {
                var mm = /^(\d+)x(\d+)$/.exec(v);
                if (mm) { w = parseInt(mm[1], 10); h = parseInt(mm[2], 10); }
                else if (v === '0') { w = 0; h = 0; }
            }
            m2w.maxBuffer = { w: w, h: h };
            if (w > 0) console.log('m2w screen: buffer limit ' + w + 'x' + h + ' (?max=)');
        }
        var k = m2w.maxBuffer;
        var cw = globalThis.innerWidth || 0, ch = globalThis.innerHeight || 0;
        if (k.w > 0 && cw > 0 && ch > 0) {
            var f = Math.min(dpr, k.w / cw, k.h / ch);
            if (f < dpr) dpr = f;
            // Mobile floor: the Metin UI (character select, Start button) needs >= 600 px of
            // logical height, or its bottom falls off the screen. The canvas is stretched by CSS.
            if (m2w.isMobile() && ch > 0 && dpr < 600 / ch) dpr = 600 / ch;
        }
    } catch (e) { }
    return dpr;
};

/// LOGICAL pixels per CSS pixel: effective dpr / GUI scale. Every "screen
/// size" the game asks for goes through this.
m2w.cssToBufferRatio = function () {
    return m2w.effectiveDpr() / m2w.uiScale();
};

/// Cursor mode from the address: 1 = software (the game draws it, browser
/// cursor hidden - cursor_web.cpp), 2 = hardware (CSS), 0 = not given
/// (metin2.cfg decides).
m2w.cursorMode = function () {
    var v = m2w.options.get('cursor');
    if (v === 'software') return 1;
    if (v === 'hardware') return 2;
    // PATCH (PT-BR): no celular/app nao existe mouse; o cursor desenhado pelo
    // jogo (software) ficava parado na tela. Mobile usa sempre o modo hardware.
    if (m2w.isMobile && m2w.isMobile()) return 2;
    return 0;
};

/// Canvas state for WM_SIZE: what = 0 width, 1 height (both in LOGICAL
/// pixels), 2 = the tab is hidden (1/0).
///
/// The DISPLAYED size, not the buffer: `canvas.width/height` is
/// the buffer we set at Reset, so after a window resize it looked unchanged,
/// WM_SIZE never went out and a 1280x150 image was stretched over 1253x918.
/// PHYSICAL pixels: CSS pixels at 150 % Windows scaling gave a
/// 1677x1278 buffer stretched to 2516x1917 - every glyph blurred 1.5x.
/// `GetSystemMetrics` multiplies by the same ratio, so both measures agree.
/// Mobile: a RIGID 1024x576 (16:9) buffer, never recomputed from innerWidth/innerHeight, so rotation,
/// the address bar and Fullscreen cannot move the layout wndMgr built once; only the CSS size changes.
// PATCH (PT-BR): o buffer fixo 1024x576 (16:9) era ESTICADO pelo CSS em celulares
// 19.5:9 / 20:9 (ex.: 800x360), deixando o mundo, a minimapa e os personagens ~25%
// mais largos. Agora o buffer continua RIGIDO (calculado uma unica vez), mas com a
// proporcao da tela em paisagem: altura 576 e largura proporcional (telas mais largas
// que 16:9) ou largura 1024 e altura proporcional (tablets 4:3 / 16:10).
// `?aspect=0` volta ao comportamento antigo (1024x576 fixo).
m2w.options.add([
    { name: 'uiscale', file: 'site', site: true,
      doc: 'mobile: interface scale 1 / 1.25 / 1.5 (default 1.25; remembered in localStorage m2w.mobileScale)' },
    { name: 'aspect', file: 'site', site: true,
      doc: 'mobile: 0 = fixed 1024x576 buffer (old behaviour); default follows the screen aspect' }
]);
m2w.MOBILE_BUFFER = (function () {
    var buf = { w: 1024, h: 576 };
    try {
        if (m2w.options && m2w.options.get && m2w.options.get('aspect') === '0') return buf;
        var sw = 0, sh = 0;
        if (globalThis.screen && globalThis.screen.width > 0 && globalThis.screen.height > 0) {
            sw = globalThis.screen.width; sh = globalThis.screen.height;
        }
        if (!(sw > 0 && sh > 0)) { sw = globalThis.innerWidth || 0; sh = globalThis.innerHeight || 0; }
        if (!(sw > 0 && sh > 0)) return buf;
        var aspect = Math.max(sw, sh) / Math.min(sw, sh);           // sempre paisagem
        aspect = Math.max(4 / 3, Math.min(2.4, aspect));
        if (aspect >= 16 / 9) {
            buf.h = 576;
            buf.w = Math.round(576 * aspect / 2) * 2;
        } else {
            buf.w = 1024;
            buf.h = Math.round(1024 / aspect / 2) * 2;
        }
        var hd = m2w.mobileScaleChoice();
        if (m2w.gfxLevel() === 'low') {
            // Resolucao = tela logica: buffer / escala escolhida (a escala efetiva vira 1).
            var lowS = (hd === 'hd') ? 1.25 : hd;
            buf.w = Math.round(buf.w / lowS / 2) * 2;
            buf.h = Math.round(buf.h / lowS / 2) * 2;
            hd = null;
        }
        if (hd === 'hd') {
            buf.w = Math.round(buf.w * 1.6 / 2) * 2;
            buf.h = Math.round(buf.h * 1.6 / 2) * 2;
            m2w.mobileHd = true;
        }
        console.log('m2w mobile buffer: ' + buf.w + 'x' + buf.h + ' (aspect ' + aspect.toFixed(3) + ')');
    } catch (e) { buf = { w: 1024, h: 576 }; }
    return buf;
})();

/// PATCH (PT-BR): tela LOGICA do celular = buffer / escala da interface (o motor
/// multiplica de volta pela escala ao criar o buffer de desenho - gl_device.cpp).
m2w.mobileLogical = function () {
    if (m2w._mobileLogical) return m2w._mobileLogical;
    var s = m2w.uiScale() || 1;
    m2w._mobileLogical = { w: Math.round(m2w.MOBILE_BUFFER.w / s / 2) * 2,
                           h: Math.round(m2w.MOBILE_BUFFER.h / s / 2) * 2 };
    console.log('m2w mobile UI scale ' + s + ': logical screen ' + m2w._mobileLogical.w + 'x' + m2w._mobileLogical.h);
    return m2w._mobileLogical;
};

m2w.canvasState = function (what) {
    try {
        if (what == 2)
            return (m2w.options.get('bgpause') === '1' && typeof document !== 'undefined' && document.hidden) ? 1 : 0;
        if (m2w.isMobile && m2w.isMobile()) return (what == 1) ? m2w.mobileLogical().h : m2w.mobileLogical().w;
        var canvas = (typeof Module !== 'undefined' && Module.canvas)
                   ? Module.canvas
                   : document.getElementById('canvas');
        var ratio = m2w.cssToBufferRatio();
        if (canvas) {
            var n = (what == 1) ? canvas.clientHeight : canvas.clientWidth;
            if (n > 0) return Math.round(n * ratio);
            n = (what == 1) ? canvas.height : canvas.width;
            if (n > 0) return n;
        }
        return Math.round(((what == 1) ? (globalThis.innerHeight || 0)
                                       : (globalThis.innerWidth || 0)) * ratio);
    } catch (e) {
        return 0;
    }
};

/// Window (= screen) size in LOGICAL pixels for GetSystemMetrics.
/// `innerWidth/innerHeight` are CSS pixels; without the ratio the game got a
/// smaller "screen" than the monitor, drew a smaller buffer and the browser
/// stretched it - blurred text at 150 % Windows scaling.
m2w.windowSize = function (isHeight) {
    try {
        if (m2w.isMobile && m2w.isMobile()) return isHeight ? m2w.mobileLogical().h : m2w.mobileLogical().w;
        var css = isHeight ? (globalThis.innerHeight || 0) : (globalThis.innerWidth || 0);
        return Math.round(css * m2w.cssToBufferRatio());
    } catch (e) {
        return 0;
    }
};

// Keep requestAnimationFrame progressing at ~30 FPS when the tab is hidden
// (unless ?bgpause=1 is set), while guaranteeing each callback fires at most
// once so Emscripten MainLoop never duplicates its loop chain.
(function () {
    if (typeof globalThis.requestAnimationFrame !== 'function') return;
    var origRAF = globalThis.requestAnimationFrame.bind(globalThis);
    var origCAF = typeof globalThis.cancelAnimationFrame === 'function'
        ? globalThis.cancelAnimationFrame.bind(globalThis)
        : function () {};
    var nextId = 1;
    var pending = new Map();
    function invoke(id) {
        var entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        if (entry.rafId !== null) origCAF(entry.rafId);
        if (entry.timerId !== null) clearTimeout(entry.timerId);
        entry.cb(typeof performance !== 'undefined' ? performance.now() : Date.now());
    }
    globalThis.requestAnimationFrame = function (cb) {
        var id = nextId++;
        var entry = { cb: cb, rafId: null, timerId: null };
        pending.set(id, entry);
        entry.rafId = origRAF(function () { invoke(id); });
        if (typeof document !== 'undefined' && document.hidden && m2w.options.get('bgpause') !== '1') {
            entry.timerId = setTimeout(function () { invoke(id); }, 33);
        }
        return id;
    };
    globalThis.cancelAnimationFrame = function (id) {
        var entry = pending.get(id);
        if (!entry) { origCAF(id); return; }
        pending.delete(id);
        if (entry.rafId !== null) origCAF(entry.rafId);
        if (entry.timerId !== null) clearTimeout(entry.timerId);
    };
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', function () {
            if (document.hidden && m2w.options.get('bgpause') !== '1') {
                pending.forEach(function (entry, id) {
                    if (entry.timerId === null) {
                        entry.timerId = setTimeout(function () { invoke(id); }, 33);
                    }
                });
            }
        });
    }
})();

// ---------------------------------------------------------------------------
// End of the game
// ---------------------------------------------------------------------------

/// `u` as an absolute address when it is an http(s) page (relative addresses
/// are resolved against this page), '' otherwise. Everything that navigates
/// to an address from outside - `?return=`, the in-game browser - goes
/// through here: a `javascript:` or `data:` address would run code in the
/// player's page (a link to the real site with `?return=javascript:...`).
m2w.safeUrl = function (u) {
    try {
        var a = new URL(String(u), globalThis.location.href);
        return (a.protocol === 'https:' || a.protocol === 'http:') ? a.href : '';
    } catch (e) {
        return '';
    }
};

/// What the page does after PostQuitMessage (user decision): first
/// try to close the tab, and when the browser refuses (only a tab opened by
/// script may close itself) go back where the player came from - `?return=`,
/// `m2w.config.returnUrl` set by the page, or `document.referrer` on the
/// same origin - and with none of these, show a message. The client carries
/// NO page address of its own; that is a deployment setting.
m2w.quit = function () {
    try {
        var target = m2w.options.get('return') || '';
        if (!target && m2w.config.returnUrl) target = String(m2w.config.returnUrl);
        if (!target && document.referrer) {
            try {
                var r = new URL(document.referrer);
                if (r.origin === location.origin && r.href !== location.href) target = r.href;
            } catch (e) {}
        }
        target = target ? m2w.safeUrl(target) : '';
        var status = document.getElementById('status');
        /// Puts `t` in the page status line (`Module.setStatus`) and makes it visible.
        var show = function (t) {
            if (typeof Module !== 'undefined' && Module.setStatus) Module.setStatus(t);
            if (status) { status.className = ''; status.style.display = 'block'; }
        };
        show('The client has closed.');
        try { window.close(); } catch (e) {}
        setTimeout(function () {
            if (target) {
                show('The client has closed - returning to the site...');
                location.href = target;
            } else {
                show('The client has closed. Reload the page to play again (reason: syserr / console).');
            }
        }, 400);
    } catch (e) {}
};

// ---------------------------------------------------------------------------
// Heap helpers for the EM_JS bridges
// ---------------------------------------------------------------------------
// The C++ side passes pointers into the wasm heap; these write results
// there, so every bridge stays one line. `HEAP32` / `HEAPU8` /
// `HEAPF64` / `_malloc` are the module's own - resolved at call time, so
// they are the current views even after memory growth.

/// Copies `bytes` (a Uint8Array, or null) into a new `malloc` buffer and
/// writes its length under `piLength`; returns the pointer, or 0 (length 0)
/// for null. The caller frees it.
m2w.heapBytes = function (bytes, piLength) {
    if (!bytes) { HEAP32[piLength >> 2] = 0; return 0; }
    var p = _malloc(bytes.length ? bytes.length : 1);
    HEAPU8.set(bytes, p);
    HEAP32[piLength >> 2] = bytes.length;
    return p;
};

/// `s` as a NUL-terminated UTF-8 string in a new `malloc` buffer (the
/// caller frees it).
m2w.heapString = function (s) {
    var n = lengthBytesUTF8(s) + 1;
    var p = _malloc(n);
    stringToUTF8(s, p, n);
    return p;
};

/// Writes the numbers of `values` as 32-bit ints from address `p` on.
m2w.heapInts = function (p, values) {
    for (var k = 0; k < values.length; ++k) HEAP32[(p >> 2) + k] = values[k];
};

/// Writes the numbers of `values` as doubles from address `p` on.
m2w.heapDoubles = function (p, values) {
    for (var k = 0; k < values.length; ++k) HEAPF64[(p >> 3) + k] = values[k];
};

// ---------------------------------------------------------------------------
// Start (main_web.cpp)
// ---------------------------------------------------------------------------

/// 0 when the address says `?run=0` (do not start the client), else 1 -
/// also 1 when the page replaced `m2w.options` with its own object.
m2w.shouldRun = function () {
    try {
        return m2w.options.get('run') === '0' ? 0 : 1;
    } catch (e) {
        return 1;    // e.g. the page replaced `m2w.options` with its own object
    }
};

// ---------------------------------------------------------------------------
// Mouse and characters as window messages (events_web.cpp)
// ---------------------------------------------------------------------------
// Listeners put events into a queue. The queue is drained once per frame
// by `PeekMessage` (platform_none.cpp) - the same "poll, do not listen"
// decision as WM_SIZE - with ONE exception: a right or middle press is
// handed to the game at once (`m2w.pumpNow`, see the mousedown listener).
// `m2w.events` is the state: `queue`, virtual position `x, y` (what the
// game sees; `fx, fy` the same with the fraction kept), the last real
// position `rx, ry`, `buttons` (bit mask of held buttons), `drag` (the
// game turns the camera), `lockRequested` / `lockAskedAt` (pointer lock
// asked for, not yet granted), `lockBroken` (no lock for this drag - the
// fallback path), and the diagnostic counters `rejected` (movement jumps
// discarded) and `lockFailed`.
m2w.events = m2w.events || null;

/// Installs the listeners on the canvas and the window. Safe to repeat;
/// does nothing until the canvas exists.
m2w.eventsStart = function () {
    if (m2w.events || !globalThis.document) return;

    var canvas = (typeof Module !== 'undefined' && Module.canvas)
               ? Module.canvas
               : document.getElementById('canvas');
    if (!canvas) return;

    var state = { queue: [], x: 0, y: 0, fx: 0, fy: 0, rx: 0, ry: 0,
                  buttons: 0, drag: false, lockRequested: false,
                  lockAskedAt: 0, lockBroken: false, rejected: 0,
                  lockFailed: 0 };
    m2w.events = state;

    // Client coordinates = canvas pixels from its top-left corner.
    // `getBoundingClientRect` gives the canvas position on the page, and
    // `width / rect.width` converts CSS pixels to buffer pixels (not the
    // same when the canvas is scaled by style). The buffer is PHYSICAL and
    // the game counts in LOGICAL pixels (physical / GUI scale),
    // hence the division by the scale.
    /// CSS pixels of canvas rectangle `r` -> LOGICAL game pixels (buffer / GUI
    /// scale), as {sx, sy}; 1 for an empty rectangle.
    var scaleFactors = function (r) {
        var scale = m2w.uiScale();
        return { sx: r.width  ? (canvas.width  / scale / r.width)  : 1,
                 sy: r.height ? (canvas.height / scale / r.height) : 1 };
    };
    /// Stores the event's position in logical game pixels as both the real
    /// (`rx`, `ry`) and the virtual (`x`, `y`) cursor.
    var position = function (e) {
        var r = canvas.getBoundingClientRect();
        var f = scaleFactors(r);
        state.rx = Math.round((e.clientX - r.left) * f.sx);
        state.ry = Math.round((e.clientY - r.top)  * f.sy);
        state.x = state.fx = state.rx;
        state.y = state.fy = state.ry;
    };

    /// Queues a window message with the current virtual cursor; above 256
    /// waiting messages the oldest is dropped.
    var push = function (message, wParam) {
        // The queue grows only between frames; if the client stalls there
        // is no reason to grow without bound - old input is useless anyway.
        if (state.queue.length > 256) state.queue.shift();
        state.queue.push({ k: message, w: wParam, x: state.x, y: state.y });
    };

    var buttonDown = [0x0201, 0x0207, 0x0204];  // WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_RBUTTONDOWN
    var buttonUp   = [0x0202, 0x0208, 0x0205];

    // CAMERA TURN = POINTER LOCK. The original computes the turn
    // speed from the DISTANCE to the anchor point while dragging with the
    // right (or middle) button and moves the cursor back to it with
    // `SetCursorPos` every move (PythonApplicationEvent.cpp,
    // `CCamera::Drag`). A browser cannot move the cursor, so the distance
    // grew with every millimetre and the camera "sped up and spun without
    // end" (user). Pointer Lock gives RELATIVE movement (`movementX/Y`);
    // the virtual position is what `SetCursorPos` moves back.
    //
    // THE LOCK FOLLOWS THE GAME, NOT THE BUTTON. It used to be requested on
    // every right press, but a right press is not always a camera turn: on
    // an inventory slot it drinks a potion, and the page still went into
    // "turn" mode (user). The game itself says when it turns the camera -
    // `CCamera::BeginDrag` / `EndDrag`, patched to call `m2w.cameraDrag`
    // (tools/stage_port.py) - and only then is the lock requested.
    /// True while the canvas holds the pointer lock.
    var locked = function () {
        return document.pointerLockElement === canvas;
    };
    /// True while movement is RELATIVE: the game turns the camera, or a
    /// lock is held, or one was requested in the last second (it may still
    /// arrive after a quick click - see the mousemove listener).
    var relative = function () {
        return state.drag || locked() ||
               (state.lockRequested && performance.now() - state.lockAskedAt < 1000);
    };
    /// No lock for this drag: the fallback path, the cursor stays visible.
    var lockFailed = function () {
        state.lockFailed += 1;
        state.lockRequested = false;
        state.lockBroken = true;
        m2w.cursorRefresh();
    };

    /// The game started (1) or ended (0) a camera drag.
    m2w.cameraDrag = function (on) {
        if (on) {
            if (state.drag) return;
            state.drag = true;
            state.lockBroken = false;
            // Relative from HERE: the virtual position starts at the real
            // one, fraction cleared.
            state.fx = state.x;
            state.fy = state.y;
            if (locked()) {
                // nothing to ask for
            } else if (!canvas.requestPointerLock) {
                state.lockBroken = true;
            } else {
                // `requestPointerLock` is ASYNCHRONOUS; from the request on
                // the cursor counts as hidden - Firefox warps it to the
                // centre when the lock arrives, and a visible cursor showed
                // that as "for a split second the mouse goes to the middle"
                // (user). Firefox grants a lock only while a user input
                // handler runs, which is why a right press is handed to the
                // game at once (mousedown below).
                state.lockRequested = true;
                state.lockAskedAt = performance.now();
                try {
                    var p = canvas.requestPointerLock();
                    // A refusal also fires `pointerlockerror`, which counts it.
                    if (p && p.catch) p.catch(function () { });
                } catch (err) {
                    lockFailed();
                }
            }
        } else {
            state.drag = false;
            // After the lock ends the real cursor is where it was on press;
            // the virtual position returns to it with the first ordinary
            // `mousemove`. A lock still on its way is let go when it comes
            // (pointerlockchange).
            if (locked() && document.exitPointerLock) document.exitPointerLock();
        }
        m2w.cursorRefresh();
    };

    // Movement is caught on the WINDOW: dragging with a button held takes
    // the cursor outside the canvas, and the turn (or an item being
    // dragged) must go on - Windows kept delivering it to the captured
    // window.
    globalThis.addEventListener('mousemove', function (e) {
        if (e.target !== canvas && !state.buttons && !relative()) return;
        // While RELATIVE, clientX/Y is never taken: Firefox, enabling the
        // lock, warps the cursor to the window centre and sends a
        // `mousemove` with the centre as clientX/Y BEFORE
        // `pointerLockElement` is set - also when the button is already up
        // (a quick click); taken as a hand movement it put the game cursor
        // in the middle "for a second" (user). `movementX/Y` exists in
        // every browser without a lock too.
        if (relative()) {
            // Firefox (Windows) also warps the hidden cursor to the centre
            // DURING the lock and reports it as movement of hundreds of
            // pixels; summed like a hand movement it gave "the camera jumps
            // now and then" (user). A hand moves tens of pixels between
            // events; the threshold of a quarter of the window (min 200 CSS
            // px) cuts only the warps. Rejected ones are counted.
            var r = canvas.getBoundingClientRect();
            var threshold = Math.max(200, r.width / 4);
            if (Math.abs(e.movementX) > threshold || Math.abs(e.movementY) > threshold) {
                state.rejected += 1;
                return;
            }
            // THE FRACTION IS KEPT. One CSS pixel is less than one game
            // pixel when the GUI scale is above the device pixel ratio
            // (0.5 at scale 2, or at scale 1 on a 4K screen); rounded every
            // event, slow movement left or up vanished
            // (Math.round(n - 0.5) = n) while right or down did not.
            var f = scaleFactors(r);
            state.fx += e.movementX * f.sx;
            state.fy += e.movementY * f.sy;
            state.x = Math.round(state.fx);
            state.y = Math.round(state.fy);
        } else {
            position(e);
        }
    });
    document.addEventListener('pointerlockerror', lockFailed);
    document.addEventListener('pointerlockchange', function () {
        state.lockRequested = false;
        if (locked()) {
            // The lock came after the drag ended (press and release before
            // the browser granted it). Nothing turns - let it go, or the
            // cursor stays captured.
            if (!state.drag && document.exitPointerLock) document.exitPointerLock();
        } else if (state.drag) {
            // Lost during a turn (Esc, focus loss): the fallback path.
            state.lockBroken = true;
        }
        m2w.cursorRefresh();
    });

    canvas.addEventListener('mousedown', function (e) {
        if (!relative()) position(e);
        if (e.button >= 0 && e.button <= 2) {
            state.buttons |= 1 << e.button;
            push(buttonDown[e.button], 0);
        }
        // A RIGHT OR MIDDLE PRESS GOES TO THE GAME AT ONCE, not with the
        // next frame: the game decides while handling it whether this is a
        // camera turn (`m2w.cameraDrag`), and Firefox grants a pointer lock
        // only while a user input handler runs. The whole queue is taken,
        // in order, so nothing overtakes anything.
        if (e.button === 1 || e.button === 2) m2w.pumpNow();
        // Blur any active HTML input (e.g. chat bar) when clicking on the game canvas
        var ae = document.activeElement;
        if (ae && ae !== canvas && typeof ae.blur === 'function') {
            try { ae.blur(); } catch (err) {}
        }
        // Focus on the canvas - without it the keyboard goes to the page.
        if (canvas.focus) canvas.focus();
        e.preventDefault();
    });

    // RELEASE IS CAUGHT ON THE WINDOW, NOT ON THE CANVAS: a button pressed
    // on the canvas and released outside it would otherwise leave the
    // client with the button down and the capture held forever. The lock
    // is let go by the game ending its drag (`m2w.cameraDrag(0)`).
    globalThis.addEventListener('mouseup', function (e) {
        if (e.button >= 0 && e.button <= 2) state.buttons &= ~(1 << e.button);
        if (!relative()) position(e);
        if (e.button >= 0 && e.button <= 2) push(buttonUp[e.button], 0);
        if (e.button === 1 || e.button === 2) {
            // The release goes to the game at once too, so the drag ends
            // (and the lock goes) in the same moment. Should the game keep
            // dragging with neither button held (a right release with an
            // item on the cursor skips `EndDrag` in game.py), the page does
            // not keep the pointer captured for it.
            m2w.pumpNow();
            if (state.drag && !(state.buttons & 6)) {
                state.drag = false;
                if (locked() && document.exitPointerLock) document.exitPointerLock();
                m2w.cursorRefresh();
            }
        }
    });

    // Without these the right button opens the browser menu instead of
    // turning the camera, and the wheel scrolls the page instead of zooming.
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    canvas.addEventListener('wheel', function (e) {
        position(e);
        // Windows carries a multiple of 120 in the HIGH word of `wParam`
        // and `PythonApplicationProcedure` reads `short(HIWORD(wParam))`.
        // The sign is opposite: in the browser `deltaY` grows "away".
        var steps = (e.deltaY > 0) ? -120 : 120;
        push(0x020A, (steps & 0xFFFF) << 16);              // WM_MOUSEWHEEL
        e.preventDefault();
    }, { passive: false });

    // CHARACTERS - the path of login and chat: a text field waits for
    // `WM_CHAR`, not for a key state. `e.key` of length one is a character;
    // anything longer is a key name ("Enter", "F5").
    globalThis.addEventListener('keydown', function (e) {
        if (m2w.isTypingInHtmlInput && m2w.isTypingInHtmlInput(e)) return;
        var vk = 0;
        if (e.key === 'Backspace') vk = 0x08;
        else if (e.key === 'Tab') vk = 0x09;
        else if (e.key === 'Enter') vk = 0x0D;
        else if (e.key === 'Escape') vk = 0x1B;
        else if (e.key === 'Delete') vk = 0x2E;
        else if (e.key === 'ArrowLeft') vk = 0x25;
        else if (e.key === 'ArrowUp') vk = 0x26;
        else if (e.key === 'ArrowRight') vk = 0x27;
        else if (e.key === 'ArrowDown') vk = 0x28;
        else if (e.key === 'Home') vk = 0x24;
        else if (e.key === 'End') vk = 0x23;
        else if (e.key.length === 1) vk = e.key.toUpperCase().charCodeAt(0);
        if (vk) push(0x0100, vk);                            // WM_KEYDOWN

        // `WM_CHAR` carries the CHARACTER, case preserved.
        if (e.key.length === 1) push(0x0102, e.key.charCodeAt(0));
        else if (e.key === 'Enter') push(0x0102, 13);
        else if (e.key === 'Backspace') push(0x0102, 8);

        // Keys the browser uses for itself and the game for something
        // else. The rest stays with the page - F5, F12, Ctrl+... must work,
        // or we take our own tools away.
        if (e.key === 'Tab' || e.key.indexOf('Arrow') === 0) e.preventDefault();
    });

    // Focus loss - see the same note in input_web.cpp. Events from before
    // the loss no longer describe anything. A button held at that moment
    // will be released outside the page, where no `mouseup` reaches us:
    // it is released NOW, so the game ends its camera drag (and the page
    // its lock) instead of turning the camera with no button held.
    globalThis.addEventListener('blur', function () {
        state.queue.length = 0;
        for (var b = 0; b <= 2; ++b)
            if (state.buttons & (1 << b)) push(buttonUp[b], 0);
        state.buttons = 0;
    });
};

/// Next queued event `{k, w, x, y}` or null.
m2w.eventPoll = function () {
    var state = m2w.events;
    if (!state || !state.queue.length) return null;
    return state.queue.shift();
};

/// Takes one event off the queue into four ints at `pData` (message,
/// `wParam`, x, y); 0 when the queue is empty, else 1.
m2w.eventPollInto = function (pData) {
    var z = m2w.eventPoll();
    if (!z) return 0;
    m2w.heapInts(pData, [z.k, z.w, z.x, z.y]);
    return 1;
};

/// Moves the virtual cursor to (x, y) - what `SetCursorPos` does; 0 before
/// the events are installed.
m2w.mouseSet = function (x, y) {
    var state = m2w.events;
    if (!state) return 0;
    state.x = state.fx = x;
    state.y = state.fy = y;
    return 1;
};

/// Hands the queued messages to the game now (`M2W_PumpMessagesNow`, the
/// `CPythonApplication::Loop` patch in tools/stage_port.py); returns how
/// many were taken - 0 before the main loop runs or the module is ready.
m2w.pumpNow = function () {
    if (typeof runtimeInitialized === 'undefined' || !runtimeInitialized) return 0;
    if (typeof Module === 'undefined' || !Module._M2W_PumpMessagesNow) return 0;
    return Module._M2W_PumpMessagesNow();
};

// ---------------------------------------------------------------------------
// Keyboard state (input_web.cpp)
// ---------------------------------------------------------------------------

/// Installs the key-state table (`globalThis.m2w_keys`, 256 bytes indexed
/// by VK code) and the `keydown` / `keyup` / `blur` listeners that fill it.
/// Kept in JavaScript because that is where the events arrive; a query from
/// C++ is one boundary crossing per key per frame, and there are few pollers.
m2w.keysStart = function () {
    if (globalThis.m2w_keys || !globalThis.document) return;

    var state = new Uint8Array(256);
    globalThis.m2w_keys = state;

    // `KeyboardEvent.code` -> Windows virtual key. Only the keys the client
    // POLLS through `GetAsyncKeyState` are listed - the rest of the `VK_*`
    // family belongs to key bindings, which take another road.
    var map = {
        ShiftLeft: 0xA0, ShiftRight: 0xA1,      // VK_LSHIFT / VK_RSHIFT
        ControlLeft: 0xA2, ControlRight: 0xA3,  // VK_LCONTROL / VK_RCONTROL
        AltLeft: 0xA4, AltRight: 0xA5,          // VK_LMENU / VK_RMENU
        CapsLock: 0x14,                         // VK_CAPITAL
        Escape: 0x1B, Space: 0x20, Enter: 0x0D, Tab: 0x09,
        ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28
    };
    // Letters and digits: the virtual key equals the ASCII code of the
    // upper-case character.
    for (var i = 0; i < 26; ++i)
        map['Key' + String.fromCharCode(65 + i)] = 65 + i;
    for (var c = 0; c < 10; ++c)
        map['Digit' + c] = 48 + c;
    for (var f = 1; f <= 12; ++f)
        map['F' + f] = 0x70 + (f - 1);          // VK_F1 = 0x70

    /// Records key event `e` as down (1) / up (0), with the either-side VK too.
    var set = function (e, value) {
        var vk = map[e.code];
        if (vk !== undefined) state[vk] = value;
        // `Shift`, `Control`, `Alt` also exist as "either of the pair" -
        // VK_SHIFT 0x10, VK_CONTROL 0x11, VK_MENU 0x12. TMP4 asks for both.
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state[0x10] = value;
        if (e.code === 'ControlLeft' || e.code === 'ControlRight') state[0x11] = value;
        if (e.code === 'AltLeft' || e.code === 'AltRight') state[0x12] = value;
    };

    globalThis.addEventListener('keydown', function (e) {
        if (m2w.isTypingInHtmlInput && m2w.isTypingInHtmlInput(e)) { state.fill(0); return; }
        set(e, 1);
    });
    globalThis.addEventListener('keyup', function (e) { set(e, 0); });

    // Losing focus is the one moment a key can stay "down forever": its
    // release outside the page never arrives. Win32 had the same problem
    // and the same answer - the state is cleared on WM_KILLFOCUS.
    globalThis.addEventListener('blur', function () { state.fill(0); });
};

/// Whether the key with this VK code is down now (0/1).
m2w.keyPressed = function (iVk) {
    var state = globalThis.m2w_keys;
    if (!state || iVk < 0 || iVk > 255) return 0;
    return state[iVk] ? 1 : 0;
};

// ---------------------------------------------------------------------------
// Intro movie (movie_web.cpp)
// ---------------------------------------------------------------------------

/// Puts a `<video>` overlay over the page and plays `bytes` (a copy taken
/// by the bridge - a `Blob` cannot hold a view of the wasm heap, which
/// moves whenever memory grows); `name` only for the warning.
m2w.moviePlay = function (bytes, name) {
    if (!globalThis.document) return;

    var old = document.getElementById('m2w_movie');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var blob = new Blob([bytes]);
    var url = URL.createObjectURL(blob);

    var v = document.createElement('video');
    v.id = 'm2w_movie';
    v.src = url;
    v.autoplay = true;
    v.style.position = 'absolute';
    v.style.left = '0';
    v.style.top = '0';
    v.style.width = '100%';
    v.style.height = '100%';
    v.style.objectFit = 'contain';
    v.style.background = '#000';

    /// Frees the object URL and removes the video element.
    var cleanUp = function () {
        URL.revokeObjectURL(url);
        if (v.parentNode) v.parentNode.removeChild(v);
    };
    v.onended = cleanUp;
    /// The browser cannot play the file: warn and remove the overlay.
    v.onerror = function () {
        console.warn('m2w movie: cannot play ' + name);
        cleanUp();
    };
    // Skipping - in TMP4 any key or a click did it.
    v.onclick = cleanUp;

    document.body.appendChild(v);

    // The browser may refuse to play with sound before the player's first
    // gesture; then try again MUTED - a silent movie beats none.
    var p = v.play();
    if (p && p.catch) {
        p.catch(function () { v.muted = true; v.play().catch(cleanUp); });
    }
};

// ---------------------------------------------------------------------------
// Cursor (cursor_web.cpp)
// ---------------------------------------------------------------------------
// `m2w.cursor`: `css` = the last shape the game set, `hidden` = what
// `ShowCursor` says, `software` = the game draws its own cursor and the
// browser's stays `none` (?cursor=software / metin2.cfg SOFTWARE_CURSOR).
m2w.cursor = m2w.cursor || { css: '', hidden: false, software: false };

/// The canvas element, if the page has one.
m2w.cursorCanvas = function () {
    return document.getElementById('canvas') || document.querySelector('canvas');
};

/// Writes `canvas.style.cursor` from the current state. CAMERA-TURN
/// FALLBACK: when the browser refuses the pointer lock (e.g. an
/// app panel: "root document not valid for pointer lock") the real cursor
/// follows the hand; hiding it then would make it reappear wherever it got
/// to on release ("the cursor jumps", user). So during a camera drag
/// with NO lock (`lockBroken`) it stays visible (in the "turn camera" shape the game just
/// set). A lock REQUESTED but not yet granted counts as a lock,
/// or the cursor is visible at the moment the browser warps it to the
/// centre.
m2w.cursorRefresh = function () {
    try {
        var canvas = m2w.cursorCanvas();
        if (!canvas) return;
        var ev = m2w.events;
        var noLock = ev && ev.drag && ev.lockBroken;
        canvas.style.cursor = m2w.cursor.software ? 'none'
            : ((!m2w.cursor.hidden || noLock) ? (m2w.cursor.css || '') : 'none');
    } catch (e) { }
};

/// The game set a shape: remember it and apply it when the cursor is shown.
/// The last value is remembered so that `cursorVisible(1)` returns to it
/// (earlier it set '' and lost the shape).
m2w.cursorSet = function (css) {
    try {
        m2w.cursor.css = css;
        var canvas = m2w.cursorCanvas();
        if (canvas && !m2w.cursor.hidden && !m2w.cursor.software)
            canvas.style.cursor = css;
    } catch (e) { }    // no canvas yet is not an error
};

/// `ShowCursor`: visible (1) or hidden (0).
m2w.cursorVisible = function (visible) {
    m2w.cursor.hidden = !visible;
    m2w.cursorRefresh();
};

// ---------------------------------------------------------------------------
// DirectInput scan codes (keyboard_web.cpp)
// ---------------------------------------------------------------------------
// `m2w.dik` is a 256-byte table of DirectInput scan codes (`DIK_*`), 1 while
// the key is down. `KeyboardEvent.code` is the key's POSITION regardless of
// layout (`KeyA` = the key at A on a QWERTY board), which is exactly what a
// scan code is, so the mapping is literal. Keys the browser keeps for itself
// never arrive (PrintScreen, F11, F12).
m2w.dik = m2w.dik || null;

/// Installs the listeners and the table. Safe to repeat.
m2w.dikStart = function () {
    if (m2w.dik || !globalThis.document) return;

    var map = {
        Escape:1, Digit1:2, Digit2:3, Digit3:4, Digit4:5, Digit5:6,
        Digit6:7, Digit7:8, Digit8:9, Digit9:10, Digit0:11,
        Minus:12, Equal:13, Backspace:14, Tab:15,
        KeyQ:16, KeyW:17, KeyE:18, KeyR:19, KeyT:20, KeyY:21, KeyU:22,
        KeyI:23, KeyO:24, KeyP:25, BracketLeft:26, BracketRight:27,
        Enter:28, ControlLeft:29,
        KeyA:30, KeyS:31, KeyD:32, KeyF:33, KeyG:34, KeyH:35, KeyJ:36,
        KeyK:37, KeyL:38, Semicolon:39, Quote:40, Backquote:41,
        ShiftLeft:42, Backslash:43,
        KeyZ:44, KeyX:45, KeyC:46, KeyV:47, KeyB:48, KeyN:49, KeyM:50,
        Comma:51, Period:52, Slash:53, ShiftRight:54,
        NumpadMultiply:55, AltLeft:56, Space:57, CapsLock:58,
        F1:59, F2:60, F3:61, F4:62, F5:63, F6:64, F7:65, F8:66, F9:67,
        F10:68, NumLock:69, ScrollLock:70,
        Numpad7:71, Numpad8:72, Numpad9:73, NumpadSubtract:74,
        Numpad4:75, Numpad5:76, Numpad6:77, NumpadAdd:78,
        Numpad1:79, Numpad2:80, Numpad3:81, Numpad0:82, NumpadDecimal:83,
        F11:87, F12:88,
        NumpadEnter:156, ControlRight:157, NumpadDivide:181, AltRight:184,
        Home:199, ArrowUp:200, PageUp:201, ArrowLeft:203, ArrowRight:205,
        End:207, ArrowDown:208, PageDown:209, Insert:210, Delete:211,
        MetaLeft:219, MetaRight:220, ContextMenu:221
    };

    var state = new Uint8Array(256);
    m2w.dik = state;

    var imeAllowedDik = {
        Escape:1, Backspace:14, Tab:15, Enter:28, ControlLeft:29,
        ShiftLeft:42, ShiftRight:54, AltLeft:56, NumpadEnter:156,
        ControlRight:157, AltRight:184, Home:199, ArrowUp:200,
        PageUp:201, ArrowLeft:203, ArrowRight:205, End:207,
        ArrowDown:208, PageDown:209, Insert:210, Delete:211
    };

    document.addEventListener('keydown', function (e) {
        if (m2w.isTypingInHtmlInput && m2w.isTypingInHtmlInput(e)) {
            state.fill(0);
            return;
        }
        var d = map[e.code];
        if (d !== undefined) {
            if (m2w.imeActive && !e.ctrlKey && !e.altKey && !e.metaKey && !imeAllowedDik[e.code]) {
                if (e.code !== 'F5' && e.code !== 'F12')
                    e.preventDefault();
                return;
            }
            state[d] = 1;
            // Game keys must not scroll or leave the page. F5 and F12 are
            // not blocked - they belong to the user, not to the game.
            if (e.code !== 'F5' && e.code !== 'F12')
                e.preventDefault();
        }
    }, true);

    document.addEventListener('keyup', function (e) {
        var d = map[e.code];
        if (d !== undefined) state[d] = 0;
    }, true);

    // Focus loss releases EVERYTHING. Otherwise a key held while switching
    // tabs stays down forever - the character runs by itself and nobody
    // knows why.
    globalThis.addEventListener('blur', function () {
        state.fill(0);
    });
};

// ---------------------------------------------------------------------------
// Language and font (locale_web.cpp)
// ---------------------------------------------------------------------------
m2w.options.add([
    { name: 'lang',    file: 'locale_web.cpp', site: true,
      doc: 'language of the game texts (en, de, pl, ...); remembered in localStorage m2/lang' },
    { name: 'deflang', file: 'locale_web.cpp', site: true,
      doc: 'default language given by the embedding page (the server language)' }
]);

/// Language -> Windows code page, with the three locale folder names that
/// differ from BCP 47 (cs -> cz, da -> dk, el -> gr).
m2w.locales = {
    en: 1252, de: 1252, fr: 1252, es: 1252, it: 1252, nl: 1252, pt: 1252, dk: 1252,
    cz: 1250, hu: 1250, pl: 1250, ro: 1250,
    ru: 1251, gr: 1253, tr: 1254
};

/// The language to play in, in this order:
/// `?lang=` (remembered), then localStorage `m2/lang`, then `?deflang=`,
/// then the browser languages, finally `en`. Returns {lang, codePage}.
m2w.browserLanguage = function () {
    var FROM_BROWSER = { cs: 'cz', da: 'dk', el: 'gr' };
    /// A supported language code from `s` (`pl-PL` -> `pl`; cs/da/el mapped to
    /// the client's cz/dk/gr), or '' when the client has no such locale.
    var pick = function (s) {
        s = String(s || '').toLowerCase().split('-')[0];
        if (FROM_BROWSER[s]) s = FROM_BROWSER[s];
        return m2w.locales[s] ? s : '';
    };
    var v = pick(m2w.options.get('lang'));
    var explicitLang = !!v;
    if (v) { try { localStorage.setItem('m2/lang', v); } catch (e) {} }
    // PATCH (PT-BR): sem ?lang= na URL, vale o idioma escolhido DENTRO do jogo
    // (linha LANGUAGE do /game1.cfg, agora salvo entre sessoes).
    if (!v) v = pick(m2w.gameCfgLanguage());
    if (!v) { try { v = pick(localStorage.getItem('m2/lang')); } catch (e) {} }
    if (!v) v = pick(m2w.options.get('deflang'));
    if (!v) {
        try {
            var langs = navigator.languages || [navigator.language];
            for (var i = 0; i < langs.length && !v; i++) v = pick(langs[i]);
        } catch (e) {}
    }
    if (!v) v = 'en';
    // PATCH (PT-BR): traducao brasileira (site/locale_pt/, carregada no preRun do
    // client.html). A interface usa locale/pt por cima do ingles; nomes de itens e
    // monstros tambem em PT. O locale.cfg fica em 'en' (imagens/efeitos do ingles).
    // Idioma da interface (o overlay do celular usa para traduzir botões e dicas).
    try { localStorage.setItem('m2w.uiLang', v); } catch (e) {}
    m2w.uiLang = v;
    if (v === 'pt' && m2w.installPtBr()) {
        m2w.writeGameCfgLanguage('pt', explicitLang);
        return { lang: 'en', codePage: m2w.locales.en };
    }
    // PATCH (PT-BR): o pacote do jogo so tem as pastas locale/pl, locale/en e
    // locale/tr. Um idioma sem pasta (ex.: pt) quebrava nomes de itens/monstros;
    // nesse caso usamos o ingles.
    if (!m2w.hasLocaleDir(v)) v = m2w.hasLocaleDir('en') ? 'en' : v;
    // PATCH (PT-BR): o motivo de ?lang=en "nao fazer nada": o ?lang so mudava o
    // /locale.cfg (nomes de itens/monstros). A INTERFACE do jogo segue a linha
    // LANGUAGE do /game1.cfg (systemSetting.GetLanguage()), que nao existia no
    // pacote nem era salva entre sessoes -> sempre polones. Agora gravamos o
    // idioma tambem no game1.cfg.
    m2w.writeGameCfgLanguage(v, explicitLang);
    return { lang: v, codePage: m2w.locales[v] };
};

/// PATCH (PT-BR): instala a traducao PT-BR que o client.html baixou para /m2w_pt/
/// (locale_game, locale_interface, item_names, mob_names). Copia tambem os demais
/// textos de /locale/en para /locale/pt (descricoes de itens/habilidades etc.),
/// para que nada falte quando o idioma do jogo for 'pt'. Devolve true se instalou.
m2w.installPtBr = function () {
    try {
        if (typeof FS === 'undefined' || !FS.analyzePath) return false;
        if (!FS.analyzePath('/m2w_pt/locale_game.txt').exists) return false;
        try { FS.mkdir('/locale'); } catch (e) { }
        try { FS.mkdir('/locale/pt'); } catch (e) { }
        try {
            var enFiles = FS.readdir('/locale/en');
            for (var i = 0; i < enFiles.length; ++i) {
                var n = enFiles[i];
                if (n === '.' || n === '..') continue;
                var p = '/locale/en/' + n;
                try {
                    if (FS.isFile(FS.stat(p).mode) && !FS.analyzePath('/locale/pt/' + n).exists)
                        FS.writeFile('/locale/pt/' + n, FS.readFile(p));
                } catch (e) { }
            }
        } catch (e) { }
        var mine = ['locale_game.txt', 'locale_interface.txt', 'item_names.txt', 'mob_names.txt', 'playerbot_texts.txt'];
        for (var j = 0; j < mine.length; ++j) {
            var src = '/m2w_pt/' + mine[j];
            if (!FS.analyzePath(src).exists) continue;
            var data = FS.readFile(src);
            FS.writeFile('/locale/pt/' + mine[j], data);
            // Nomes tambem no locale/en: o motor pode lê-los pela pasta do locale.cfg.
            if (mine[j] === 'item_names.txt' || mine[j] === 'mob_names.txt')
                FS.writeFile('/locale/en/' + mine[j], data);
        }
        console.log('m2w locale: traducao PT-BR instalada em /locale/pt');
        return true;
    } catch (e) {
        console.warn('m2w locale: falha ao instalar PT-BR - ' + e);
        return false;
    }
};

/// PATCH (PT-BR): /locale/<lang> existe no pacote? (true se o FS ainda nao existe)
m2w.hasLocaleDir = function (lang) {
    try {
        if (typeof FS === 'undefined' || !FS.analyzePath) return true;
        return !!FS.analyzePath('/locale/' + lang).exists;
    } catch (e) { return true; }
};

/// PATCH (PT-BR): idioma gravado no /game1.cfg (linha LANGUAGE), ou ''.
m2w.gameCfgLanguage = function () {
    try {
        if (typeof FS === 'undefined' || !FS.analyzePath || !FS.analyzePath('/game1.cfg').exists) return '';
        var txt = FS.readFile('/game1.cfg', { encoding: 'utf8' });
        var m = /^[ \t]*LANGUAGE[ \t]+([A-Za-z]+)/m.exec(txt);
        return m ? m[1].toLowerCase() : '';
    } catch (e) { return ''; }
};

/// PATCH (PT-BR): grava LANGUAGE no /game1.cfg (cria o arquivo se faltar).
/// Com `force` (idioma vindo de ?lang=) sobrescreve a escolha feita no jogo.
m2w.writeGameCfgLanguage = function (lang, force) {
    try {
        if (typeof FS === 'undefined' || !FS.writeFile) return;
        var exists = !!FS.analyzePath('/game1.cfg').exists;
        var txt = exists ? FS.readFile('/game1.cfg', { encoding: 'utf8' }) : '';
        var cur = m2w.gameCfgLanguage();
        if (exists && cur && !force) return;
        if (cur === lang) return;
        var line = 'LANGUAGE\t\t\t\t' + lang;
        if (/^[ \t]*LANGUAGE[ \t]+.*$/m.test(txt)) txt = txt.replace(/^[ \t]*LANGUAGE[ \t]+.*$/m, line);
        else txt = (txt && !/\n$/.test(txt) ? txt + '\r\n' : txt) + line + '\r\n';
        FS.writeFile('/game1.cfg', txt);
        console.log('m2w locale: game1.cfg LANGUAGE = ' + lang);
    } catch (e) { console.warn('m2w locale: game1.cfg - ' + e); }
};

/// Registers `/tahoma.ttf` from the preloaded package (MEMFS, before main)
/// as the browser font "Tahoma". MEASURED, not guessed: the game asks for
/// UI_DEF_FONT = "Tahoma:12", `CreateFontIndirectA` (platform_text.cpp)
/// turns it into CSS `font-family: "Tahoma"` and LEAVES THE CHOICE TO THE
/// BROWSER - without our own file the result depends on what the system
/// substitutes (user: "the font is awful"). Loading
/// is asynchronous (`FontFace.load()`), but the bytes are already in
/// memory - parsing 919 kB takes milliseconds, and Python start-up gives
/// plenty of slack.
m2w.fsPersistStarted = false;
m2w.fsPersistStart = function () {
    if (m2w.fsPersistStarted || typeof FS === 'undefined' || typeof localStorage === 'undefined') return;
    m2w.fsPersistStarted = true;
    var PREFIX = 'm2w.fs:';
    var DIRS = ['/cache', '/UserData'];
    var FILES = ['/metin2.cfg', '/channel.inf', '/game1.cfg'];   // PATCH (PT-BR): + idioma do jogo
    var known = {};

    function toB64(u8) {
        var s = '';
        for (var i = 0; i < u8.length; i += 8192)
            s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
        return btoa(s);
    }
    function fromB64(b64) {
        var s = atob(b64), u8 = new Uint8Array(s.length);
        for (var i = 0; i < s.length; ++i) u8[i] = s.charCodeAt(i);
        return u8;
    }
    function ensureDir(dir) {
        var parts = dir.split('/').filter(Boolean), cur = '';
        for (var i = 0; i < parts.length; ++i) {
            cur += '/' + parts[i];
            try { FS.mkdir(cur); } catch (e) {}
        }
    }

    // 1. Restore saved files from localStorage into MEMFS before Python starts
    try {
        var restored = 0;
        for (var i = 0; i < localStorage.length; ++i) {
            var k = localStorage.key(i);
            if (!k || k.indexOf(PREFIX) !== 0) continue;
            var path = k.slice(PREFIX.length);
            var b64 = localStorage.getItem(k);
            if (b64 === null) continue;
            var slash = path.lastIndexOf('/');
            if (slash > 0) ensureDir(path.slice(0, slash));
            FS.writeFile(path, fromB64(b64));
            known[path] = b64;
            ++restored;
        }
        if (restored > 0) console.log('m2w fs: restored ' + restored + ' saved file(s) from localStorage');
    } catch (e) {
        console.warn('m2w fs: restore failed - ' + e);
    }

    // 2. Sync changes in /cache, /UserData, /metin2.cfg, /channel.inf to localStorage
    function walkDir(dir, out) {
        var list;
        try { list = FS.readdir(dir); } catch (e) { return; }
        for (var i = 0; i < list.length; ++i) {
            var name = list[i];
            if (name === '.' || name === '..' || name.slice(-4) === '.tmp') continue;
            var full = dir + '/' + name;
            try {
                var st = FS.stat(full);
                if (FS.isDir(st.mode)) walkDir(full, out);
                else if (FS.isFile(st.mode)) out.push(full);
            } catch (e) {}
        }
    }
    function syncAll() {
        try {
            var list = [];
            for (var i = 0; i < DIRS.length; ++i) walkDir(DIRS[i], list);
            for (var j = 0; j < FILES.length; ++j) {
                try { if (FS.isFile(FS.stat(FILES[j]).mode)) list.push(FILES[j]); } catch (e) {}
            }
            var seen = {};
            for (var k = 0; k < list.length; ++k) {
                var p = list[k];
                seen[p] = true;
                var u8 = FS.readFile(p);
                if (!u8 || u8.length > 512 * 1024) continue;
                var b64 = toB64(u8);
                if (known[p] !== b64) {
                    localStorage.setItem(PREFIX + p, b64);
                    known[p] = b64;
                }
            }
            for (var oldPath in known) {
                if (!seen[oldPath] && oldPath.indexOf('/cache/') === 0) {
                    localStorage.removeItem(PREFIX + oldPath);
                    delete known[oldPath];
                }
            }
        } catch (e) {}
    }
    setInterval(syncAll, 1000);
    if (typeof globalThis.addEventListener === 'function')
        globalThis.addEventListener('beforeunload', syncAll);
};

m2w.loadFont = function () {
    m2w.fsPersistStart();
    try {
        var bytes = FS.readFile('/tahoma.ttf');
        var font = new FontFace('Tahoma', bytes.buffer);
        document.fonts.add(font);
        font.load().then(function () {
            console.log('m2w font: Tahoma loaded from tahoma.ttf');
        }).catch(function (e) {
            console.warn('m2w font: Tahoma failed to load - ' + e);
        });
    } catch (e) {
        console.warn('m2w font: no /tahoma.ttf in MEMFS (' + e + ') - '
                     + 'run tools/build_client_data.py; the UI will use the '
                     + 'browser fallback font');
    }
};

// ---------------------------------------------------------------------------
// Network: the WebSocket bridge (network_web.cpp)
// ---------------------------------------------------------------------------
m2w.options.add([
    { name: 'bridge', file: 'network_web.cpp',
      doc: 'WebSocket bridge address (bridge/): ws://host:port, wss://host, host:port or host; default 127.0.0.1:11496 locally, the page host otherwise' }
]);

/// `m2w.bridge` = {host, port, tls} once `m2w.bridgeStart` ran.
m2w.bridge = m2w.bridge || null;

/// Decides where the bridge is and tells SOCKFS the URL scheme. Runs once,
/// at the first `connect()`.
///
/// TWO DEPLOYMENTS, both real: (1) a LOCAL page (file://, localhost, 127.0.0.1) - the
/// bridge stands next to it on its own port 11496; (2) a page FROM A
/// SERVER (nginx) - the bridge has no address of its own, it goes through
/// the page's host and port and the web server forwards it, hence
/// `location.host` WITH the port. Over HTTPS `wss://` is required: the
/// browser refuses a plain WebSocket from an encrypted page.
///
/// An explicit address wins over everything: `?bridge=` (local pages only -
/// see m2w.options), then
/// `m2w.config.bridge` (written into
/// site/client.html by link_client.py from private/bridge.txt -
/// page on a hosting, proxy elsewhere). Accepted with or without
/// a scheme: "ws://host:port", "wss://host", "host:port", "host".
m2w.bridgeStart = function () {
    if (m2w.bridge) return;

    var tls = false;
    var host = '127.0.0.1';
    var port = 11496;

    try {
        var loc = globalThis.location;
        var local = (loc.protocol === 'file:') ||
                    /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname);
        tls = (loc.protocol === 'https:');

        if (local) {
            host = '127.0.0.1';
            port = 11496;
        } else {
            host = loc.hostname;
            // No port in the address means the scheme's default, not 11496
            // - the nginx-on-80/443 case.
            port = loc.port ? parseInt(loc.port, 10) : (tls ? 443 : 80);
        }

        var manual = m2w.options.get('bridge');
        if (!manual && m2w.config.bridge) manual = String(m2w.config.bridge);
        if (manual) {
            if (manual.indexOf('wss://') === 0) { tls = true;  manual = manual.slice(6); }
            else if (manual.indexOf('ws://') === 0) { tls = false; manual = manual.slice(5); }
            var colon = manual.lastIndexOf(':');
            if (colon > 0) {
                host = manual.slice(0, colon);
                port = parseInt(manual.slice(colon + 1), 10);
            } else {
                host = manual;
                port = tls ? 443 : 80;
            }
        }
    } catch (e) { }

    if (!(port > 0 && port < 65536)) port = 11496;

    m2w.bridge = { host: host, port: port, tls: tls };

    // SOCKFS builds the address itself but takes the scheme from here. It
    // must stay exactly "ws://" or "wss://": only then emscripten APPENDS
    // host, port and path; anything longer is used verbatim and every
    // connection would go to the same address without the target in the
    // path. SOCKFS copies `Module["websocket"]` into `SOCKFS.websocketArgs`
    // ONCE, at mount (start-up), and this runs at the first connect() -
    // so writing `Module["websocket"]` alone creates an object SOCKFS no
    // longer reads and the default "ws://" stays; on http no difference,
    // on https a SecurityError -> EHOSTUNREACH. Measured on the hosted
    // page: `SOCKFS.websocketArgs = {}`, `Module.websocket = {url:"wss://"}`,
    // different objects. Hence BOTH are written.
    var scheme = tls ? 'wss://' : 'ws://';
    if (typeof Module !== 'undefined') {
        Module['websocket'] = Module['websocket'] || {};
        Module['websocket']['url'] = scheme;
    }
    if (typeof SOCKFS !== 'undefined' && SOCKFS.websocketArgs)
        SOCKFS.websocketArgs['url'] = scheme;

    console.log('m2w network: bridge ' + scheme + host + ':' + port);
};

/// Registers `<bridge host>/to/<target>` in emscripten's name table and
/// returns the fake address it was given, packed like `sin_addr` (network
/// order: first octet in the lowest byte). 0 when the table refused.
m2w.addressViaBridge = function (target) {
    var k = m2w.bridge;
    var host = (k && k.host) ? k.host : '127.0.0.1';
    var ip = DNS.lookup_name(host + '/to/' + target);
    var a = ip.split('.');
    if (a.length !== 4) return 0;
    return ((+a[0]) | ((+a[1]) << 8) | ((+a[2]) << 16) | ((+a[3]) << 24)) | 0;
};

// ---------------------------------------------------------------------------
// In-game web browser (webbrowser_web.cpp): an <iframe> over the canvas
// ---------------------------------------------------------------------------
/// `m2w.webbrowser.frame` is the iframe, created on the first show.
m2w.webbrowser = m2w.webbrowser || { frame: null };

/// Creates the iframe if needed, places it at (left, top, right, bottom)
/// CSS pixels and loads `url`. Returns 1 when the frame exists; whether
/// the PAGE shows in it depends on the shop's headers (see the .cpp).
m2w.webbrowserShow = function (url, left, top, right, bottom) {
    var S = m2w.webbrowser;
    if (!globalThis.document) return 0;
    url = url ? m2w.safeUrl(url) : '';
    if (!url) return 0;

    if (!S.frame) {
        S.frame = document.createElement('iframe');
        S.frame.id = 'm2w_webbrowser';
        S.frame.style.position = 'absolute';
        S.frame.style.border = '0';
        // No `allow-same-origin` towards OUR page: the shop gets an origin
        // of its own and cannot reach into the client.
        S.frame.setAttribute('sandbox',
            'allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation');
        document.body.appendChild(S.frame);
    }

    m2w.webbrowserMove(left, top, right, bottom);
    S.frame.style.display = 'block';
    S.frame.src = url;
    return 1;
};

/// Moves and resizes the frame to (left, top, right, bottom) CSS pixels;
/// nothing before the first show.
m2w.webbrowserMove = function (left, top, right, bottom) {
    var S = m2w.webbrowser;
    if (!S.frame) return;
    S.frame.style.left   = left + 'px';
    S.frame.style.top    = top + 'px';
    S.frame.style.width  = (right - left) + 'px';
    S.frame.style.height = (bottom - top) + 'px';
};

/// Hides the frame and unloads the page on purpose: a hidden frame would
/// live on, play sound and keep the shop's connections.
m2w.webbrowserHide = function () {
    var S = m2w.webbrowser;
    if (!S.frame) return;
    S.frame.style.display = 'none';
    S.frame.src = 'about:blank';
};

/// Removes the frame from the page for good (the next show creates a new one).
m2w.webbrowserDestroy = function () {
    var S = m2w.webbrowser;
    if (!S.frame) return;
    if (S.frame.parentNode) S.frame.parentNode.removeChild(S.frame);
    S.frame = null;
};

// ---------------------------------------------------------------------------
// Corpus: game data streamed on demand (webfs_web.cpp)
// ---------------------------------------------------------------------------
m2w.options.add([
    { name: 'corpus',     file: 'webfs_web.cpp',
      doc: 'address of the corpus directory (manifest.bin + <hash>.bin chunks); default corpus/ next to the page' },
    { name: 'corpusMB',   file: 'webfs_web.cpp', site: true,
      doc: 'chunk memory budget in MB (default by device memory: 512 from 8 GB, 256 from 4 GB or unknown, else 96)' },
    { name: 'noprefetch', file: 'webfs_web.cpp', site: true,
      doc: '1 = no prefetch in the recorded order (A/B measurement)' },
    { name: 'nofetch',    file: 'site/preload.js', site: true,
      doc: '1 = no background download of the whole corpus (read by the page itself, which loads before client.js)' }
]);

/// What the page (site/preload.js) and the console
/// (tools/chunk_order.py) read about the corpus - one object since
/// Phase E (before: loose globals `m2w_all_chunks`,
/// `m2w_corpus_url_js`, `m2w_chunk_order`, `m2w_fetch_count`):
/// `url` corpus address, `all` every chunk hash, `order` chunk indices in
/// order of first use, `fetchCount` synchronous downloads so far.
/// The prefetch progress is `m2w.prefetch` (set by `m2w.prefetchStart`).
m2w.corpus = m2w.corpus || { url: '', all: [], order: [], fetchCount: 0 };
m2w.prefetch = m2w.prefetch || null;

/// Downloads `url` SYNCHRONOUSLY and returns a Uint8Array, or null: a
/// synchronous XMLHttpRequest on the main thread
/// - not Asyncify, not SharedArrayBuffer, both cost more than needed, and
/// it does NOT change the order of game code, which assumes the file is
/// ready right after `fopen`. `responseType = 'arraybuffer'` is ILLEGAL on
/// a synchronous request, so the bytes come as text through
/// `charset=x-user-defined`, which maps every byte to U+F700+byte and
/// `& 0xFF` gives the byte back - for 0x80-0x9F too. (ISO-8859-1, tried
/// first, is aliased to windows-1252 by the WHATWG standard and
/// remaps 0x80-0x9F: byte 0x94 came out as 0x1D.)
///
/// `expected` > 0 is the chunk size from the manifest: the text API does
/// BOM sniffing despite the charset, and a chunk starting with FE FF /
/// FF FE / EF BB BF came back decoded as UTF-16/UTF-8 with another length
/// (measured: chunk 195, 4194304 B -> 2097151 "characters", 44 files read
/// from shifted places). Refusing beats garbage.
/// Compared with the manifest size, not Content-Length (under gzip that
/// counts bytes on the wire). build_corpus.py makes sure no chunk starts
/// with a BOM; this is the second line.
m2w.fetchSync = function (url, expected) {
    try {
        globalThis._m2wSyncBusyUntil = performance.now() + 900;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.overrideMimeType('text/plain; charset=x-user-defined');
        xhr.send(null);
        globalThis._m2wSyncBusyUntil = performance.now() + 900;
        if (xhr.status !== 200 && xhr.status !== 0) return null;
        var text = xhr.responseText;
        var n = text.length;
        ++m2w.corpus.fetchCount;
        if (expected > 0 && n !== expected) {
            console.error('m2w corpus: ' + url + ' - manifest ' + expected + ' B, but text ' + n +
                          ' characters (BOM sniffing?) - REFUSED instead of garbage');
            return null;
        }
        var bytes = new Uint8Array(n);
        for (var i = 0; i < n; ++i) bytes[i] = text.charCodeAt(i) & 0xFF;
        if (m2w.chunks && m2w.chunks.storage) {
            var copy = bytes.slice().buffer;
            m2w.chunks.storage.then(function (st) {
                if (st) { try { st.put(url, new Response(copy, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (e) {} }
            });
        }
        return bytes;
    } catch (e) {
        return null;
    }
};

/// Opens persistent chunk storage: Cache Storage when available (HTTPS / localhost),
/// or IndexedDB ('m2w-corpus', store 'chunks') on plain HTTP origins (e.g. http://VPS-IP).
m2w.openCorpusStorage = function () {
    if (m2w.corpusStoragePromise) return m2w.corpusStoragePromise;
    m2w.corpusStoragePromise = new Promise(function (resolve) {
        if (typeof caches !== 'undefined' && caches && caches.open) {
            caches.open('m2w-corpus').then(function (c) { resolve(c); })
                                      .catch(function () { openIdb(resolve); });
            return;
        }
        openIdb(resolve);
    });
    function openIdb(resolve) {
        if (typeof indexedDB === 'undefined' || !indexedDB || !indexedDB.open) {
            console.warn('m2w corpus: neither Cache Storage nor IndexedDB available on this origin');
            resolve(null);
            return;
        }
        try {
            var req = indexedDB.open('m2w-corpus', 1);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains('chunks'))
                    db.createObjectStore('chunks');
            };
            req.onsuccess = function () {
                var db = req.result;
                console.log('m2w corpus: using IndexedDB persistent storage (HTTP origin)');
                resolve({
                    match: function (url) {
                        return new Promise(function (res) {
                            try {
                                var tx = db.transaction('chunks', 'readonly');
                                var getReq = tx.objectStore('chunks').get(url);
                                getReq.onsuccess = function () {
                                    var val = getReq.result;
                                    if (!val) { res(null); return; }
                                    var buf = val.buffer ? val.buffer : val;
                                    res({ arrayBuffer: function () { return Promise.resolve(buf); } });
                                };
                                getReq.onerror = function () { res(null); };
                            } catch (e) { res(null); }
                        });
                    },
                    put: function (url, respOrBuf) {
                        var p = (respOrBuf && typeof respOrBuf.arrayBuffer === 'function')
                            ? respOrBuf.arrayBuffer()
                            : Promise.resolve(respOrBuf && respOrBuf.buffer ? respOrBuf.buffer : respOrBuf);
                        return p.then(function (buf) {
                            return new Promise(function (res) {
                                try {
                                    var tx = db.transaction('chunks', 'readwrite');
                                    tx.objectStore('chunks').put(buf, url);
                                    tx.oncomplete = function () { res(); };
                                    tx.onerror = function () { res(); };
                                } catch (e) { res(); }
                            });
                        }).catch(function () {});
                    }
                });
            };
            req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
    }
    return m2w.corpusStoragePromise;
};

/// Chunk memory on the page side. Why: the synchronous XHR was
/// the ONLY road - the corpus then had 477 chunks and we kept sixteen, so in the
/// world a miss was the rule and every miss a full blocking round trip:
/// stutter on entering new terrain. Two things were missing: PERSISTENT
/// memory (Cache Storage / IndexedDB - a chunk stays on disk between sessions)
/// and BACKGROUND fetches (a chunk fetched
/// asynchronously costs no frame; when the game asks, it is already here).
///
/// `m2w.chunks`: `map` name -> Uint8Array (insertion order = age),
/// `inFlight` names already requested, `bytes` held (reservations of the
/// prefetch included), `budget`, counters `fromMemory` / `fromStorage` /
/// `fromNetwork`, `used` = names already handed to the game (evicted
/// first), `background` = fetches started from `Get()` in flight (limit 2),
/// `storage` = promise of the Cache Storage / IndexedDB or null.
m2w.chunks = m2w.chunks || null;

/// Creates the chunk cache once (`m2w.chunks`, budget `budgetMB` MB) with its
/// eviction rule and opens the Cache Storage / IndexedDB `m2w-corpus`.
m2w.chunkCacheStart = function (budgetMB) {
    if (m2w.chunks) return;
    // Measurement: `performance.getEntriesByType('resource')` for every
    // chunk (the default buffer of 250 stops half-way through loading).
    try { performance.setResourceTimingBufferSize(4000); } catch (e) { }
    var state = {
        map: new Map(),
        inFlight: new Set(),
        bytes: 0,
        budget: budgetMB * 1024 * 1024,
        fromMemory: 0,
        fromStorage: 0,
        fromNetwork: 0,
        used: new Set(),
        background: 0
    };
    // Makes room in the budget: FIRST the oldest already used, only then the
    // oldest unused (e.g. prefetched, not yet read). `protectedName` is
    // what is being inserted. Bytes reserved by the prefetch (no key in the
    // map) are in `state.bytes` and come back when the chunk arrives -
    // hence the loop also ends on an empty map.
    /// Evicts toward the budget: first the oldest chunks the game
    /// already used, then the oldest unused; never `protectedName` or the last
    /// chunk.
    state.evict = function (protectedName) {
        var pass = 0;
        while (state.bytes > state.budget && state.map.size > 1 && pass < 2) {
            var found = false;
            var it = state.map.keys();
            for (var r = it.next(); !r.done; r = it.next()) {
                var k = r.value;
                if (k === protectedName) continue;
                if (pass === 0 && !state.used.has(k)) continue;
                state.bytes -= state.map.get(k).length;
                state.map.delete(k);
                state.used.delete(k);
                found = true;
                break;
            }
            if (!found) ++pass;
        }
    };
    m2w.chunks = state;
    state.storage = m2w.openCorpusStorage();
};

/// SYNCHRONOUS read from the page memory: the chunk's bytes or null. This
/// is the whole gain of background fetching - a chunk already here costs
/// the game no round trip.
m2w.chunkFromCache = function (name) {
    var state = m2w.chunks;
    if (!state) return null;
    var data = state.map.get(name);
    if (!data) return null;
    ++state.fromMemory;
    state.used.add(name);
    if (m2w.prefetch) m2w.prefetch.lastProgress = performance.now();
    return data;
};

/// Puts a chunk the game just read (blocking fetch) into the page memory,
/// marked as used, and keeps the budget.
m2w.chunkCachePut = function (name, bytes) {
    var state = m2w.chunks;
    if (!state || !bytes || !bytes.length) return;
    if (state.map.has(name)) return;
    state.map.set(name, bytes);
    state.bytes += bytes.length;
    state.used.add(name);
    state.evict(name);
};

/// Fetches a chunk IN THE BACKGROUND - Cache Storage first, then the
/// network - into the page memory. UPPER BOUND IN FLIGHT: the synchronous road never yields, so successive `Get()`
/// calls in one frame kept adding 3 fetches each - 52 measured at once;
/// the browser has 6 sockets per server, the fetches held them with bodies
/// nobody read, and the synchronous XHR waited for a socket exactly 20.0 s
/// (7 x 20 s = 140 of 145 s of loading). Two from here + two from the
/// prefetch (a separate counter so neither starves the other) = 4 of 6;
/// the XHR always has one free.
m2w.chunkInBackground = function (url, name) {
    var state = m2w.chunks;
    if (!state) return;
    if (state.map.has(name) || state.inFlight.has(name)) return;
    if (state.bytes > state.budget) return;
    if (state.background >= 2) return;
    state.inFlight.add(name);
    ++state.background;

    /// Stores the fetched chunk (unless it arrived meanwhile), evicts to budget,
    /// counts where it came from and frees the background slot.
    var put = function (buffer, fromStorage) {
        var data = new Uint8Array(buffer);
        if (!state.map.has(name)) {
            state.map.set(name, data);
            state.bytes += data.length;
            state.evict(name);
        }
        if (fromStorage) ++state.fromStorage; else ++state.fromNetwork;
        state.inFlight.delete(name);
        --state.background;
    };

    state.storage.then(function (storage) {
        var stored = storage ? storage.match(url) : Promise.resolve(null);
        return Promise.resolve(stored).then(function (response) {
            if (response) return response.arrayBuffer().then(function (b) { put(b, true); });
            if (globalThis._m2wSyncBusyUntil && performance.now() < globalThis._m2wSyncBusyUntil) {
                state.inFlight.delete(name);
                --state.background;
                return;
            }
            return fetch(url).then(function (response2) {
                if (!response2 || !response2.ok) throw new Error('HTTP');
                if (storage) { try { storage.put(url, response2.clone()); } catch (e) { } }
                return response2.arrayBuffer().then(function (b) { put(b, false); });
            });
        });
    }).catch(function () { state.inFlight.delete(name); --state.background; });
};

/// PREFETCH IN THE RECORDED ORDER.
/// `<corpus>/order.txt` (tools/chunk_order.py) lists chunk
/// hashes in the order the game reached for them at login and entering
/// the village (recorded once through `m2w.corpus.order`). From
/// page start they are fetched in that order, two at a time, into the page
/// memory and Cache Storage.
///
/// SLIDING WINDOW: the HTTP cache proved UNRELIABLE (measured: after 400 MB
/// fetched in 2 s the synchronous XHR still went to the network despite
/// `immutable`), and Cache Storage cannot be read synchronously. The only
/// thing that spares the game is a chunk lying in `map` BEFORE it asks.
/// So the prefetch downloads nothing it has no budget for: it waits until
/// the game USES (reads from memory) the oldest chunks, evicts them, and
/// only then fetches the next. With the game reading in the same order the
/// prefetch stays one budget (m2w.corpusBudget: 96-512 MB = 24-128 chunks)
/// ahead. When the game left the recorded path and used nothing for 15 s, the
/// oldest chunk is evicted anyway - or the prefetch would stand on unwanted
/// chunks all session.
/// `?noprefetch=1` disables it. Progress: `m2w.prefetch` and the
/// `Module.setStatus` bar before entering the game.
m2w.prefetchStart = function (base) {
    var state = m2w.chunks;
    if (!state || m2w.prefetch) return;
    if (m2w.options.get('noprefetch') === '1') {
        console.log('m2w corpus: prefetch DISABLED (?noprefetch=1)');
        return;
    }
    var CHUNK = 4 * 1048576;
    var w = m2w.prefetch = {
        total: 0, done: 0, toMemory: 0, fromStorage: 0, errors: 0,
        waits: 0, forcedEvictions: 0, start: performance.now(), end: 0,
        lastProgress: performance.now()
    };

    // Makes room for one chunk by evicting the OLDEST ALREADY USED; an
    // unused one is left alone, the game will still come for it.
    /// Evicts OLDEST ALREADY USED chunks until one more chunk (CHUNK bytes) fits;
    /// false when that is impossible without touching unused ones.
    var makeRoom = function () {
        var it = state.map.keys();
        while (state.bytes + CHUNK > state.budget) {
            var k = it.next();
            if (k.done) return false;
            if (!state.used.has(k.value)) continue;
            state.bytes -= state.map.get(k.value).length;
            state.map.delete(k.value);
            state.used.delete(k.value);
        }
        return true;
    };
    // Waits for room and RESERVES it (`state.bytes += CHUNK`), so parallel
    // fetches do not count on the same free slot.
    /// Resolves once room for one chunk is found and RESERVED; after 15 s with no
    /// progress evicts the oldest chunk anyway, otherwise retries every 200 ms.
    var waitForRoom = function () {
        if (!makeRoom()) {
            if (performance.now() - w.lastProgress > 15000 && state.map.size) {
                var oldest = state.map.keys().next().value;
                state.bytes -= state.map.get(oldest).length;
                state.map.delete(oldest);
                ++w.forcedEvictions;
                w.lastProgress = performance.now();
            }
            if (!makeRoom()) {
                ++w.waits;
                return new Promise(function (resolve) { setTimeout(resolve, 25); })
                    .then(waitForRoom);
            }
        }
        state.bytes += CHUNK;
        return Promise.resolve();
    };
    /// Stores a prefetched chunk in place of its reservation (unless it arrived
    /// meanwhile) and marks progress.
    var put = function (name, buffer) {
        state.bytes -= CHUNK;
        if (state.map.has(name)) return;
        var data = new Uint8Array(buffer);
        state.map.set(name, data);
        state.bytes += data.length;
        ++w.toMemory;
        w.lastProgress = performance.now();
    };
    /// Every tenth chunk (and at the end) logs the prefetch progress and updates
    /// the page status bar until the game starts.
    var report = function () {
        if ((w.done % 10) !== 0 && w.done !== w.total) return;
        console.log('m2w corpus: prefetch ' + w.done + '/' + w.total +
                    ' (in memory ' + w.toMemory + ', from storage ' + w.fromStorage +
                    ', errors ' + w.errors + ', waits for room ' + w.waits + ', ' +
                    Math.round((performance.now() - w.start) / 100) / 10 + ' s)');
        try {
            var s = document.getElementById('status');
            if (s && s.className !== 'done' && typeof Module !== 'undefined' &&
                Module.setStatus && w.done !== w.total)
                Module.setStatus('Game data: ' + w.done + ' / ' + w.total + ' chunks...');
        } catch (e) { }
    };

    fetch(base + 'order.txt', { cache: 'no-store' }).then(function (o) {
        if (!o.ok) throw new Error('HTTP ' + o.status);
        return o.text();
    }).then(function (t) {
        var hashes = t.match(/[0-9a-f]{32}/g) || [];
        w.total = hashes.length;
        return state.storage.then(function (storage) {
            var i = 0;
            /// Fetches the next chunk of the list (from Cache Storage or the network),
            /// then calls itself; two of these run in parallel.
            var one = function () {
                if (i >= hashes.length) return Promise.resolve();
                var name = hashes[i++] + '.bin';
                var url = base + name;
                if (state.map.has(name) || state.inFlight.has(name)) {
                    ++w.done; report(); return one();
                }
                return waitForRoom().then(function () {
                    if (state.map.has(name) || state.inFlight.has(name)) {
                        state.bytes -= CHUNK;
                        return;
                    }
                    state.inFlight.add(name);
                    var p = storage ? storage.match(url) : Promise.resolve(null);
                    return Promise.resolve(p).then(function (response) {
                        if (response) {
                            ++w.fromStorage;
                            return response.arrayBuffer().then(function (b) { put(name, b); });
                        }
                        return fetch(url).then(function (response2) {
                            if (!response2 || !response2.ok) throw new Error('HTTP ' + (response2 && response2.status));
                            if (storage) { try { storage.put(url, response2.clone()); } catch (e) { } }
                            return response2.arrayBuffer().then(function (b) { put(name, b); });
                        }).then(function () {
                            return new Promise(function (r) { setTimeout(r, 120); });
                        });
                    }).catch(function (e) {
                        ++w.errors;
                        state.bytes -= CHUNK;
                        console.warn('m2w corpus: prefetch ' + name + ' - ' + e);
                    }).then(function () { state.inFlight.delete(name); });
                }).then(function () {
                    ++w.done; report();
                    return one();
                });
            };
            // 2 parallel lanes max so at least 2 of the browser's 6 sockets per origin
            // stay free for the game's synchronous XHRs on a cold start (6 lanes caused 20s socket deadlocks).
            var lanes = 2, jobs = [];
            for (var lane = 0; lane < lanes; ++lane) jobs.push(one());
            return Promise.all(jobs);
        });
    }).then(function () {
        w.end = performance.now();
    }).catch(function (e) {
        console.warn('m2w corpus: no order.txt - no prefetch (' + e + ')');
    });
};

/// Hands the page the list of all chunk hashes and the corpus address
/// (preload.js downloads the rest into Cache Storage, from which the next
/// start's prefetch reads it into memory. The Service
/// Worker does NOT see the synchronous XHR, see below).
m2w.chunkList = function (list, base) {
    m2w.corpus.all = list.split('\n').filter(function (x) { return x.length === 32; });
    m2w.corpus.url = base;
};

/// Counters for the report: 0 from memory, 1 from storage, 2 from network,
/// 3 chunks held, 4 MB held.
m2w.chunkCounter = function (what) {
    var s = m2w.chunks;
    if (!s) return 0;
    if (what === 0) return s.fromMemory;
    if (what === 1) return s.fromStorage;
    if (what === 2) return s.fromNetwork;
    if (what === 3) return s.map.size;
    return (s.bytes / 1048576) | 0;
};

/// Chunk memory budget in MB (`?corpusMB=` wins; otherwise by the device's
/// memory). Until the measurement it was 96.
/// Measured with a headless Edge, login + village,
/// 90 s: the game uses ~102 chunks (~408 MB), and with 96 MB it evicted
/// chunks it needed again a moment later - 138 BLOCKING downloads on a
/// SECOND start (89 from the network, 4.8 s of frozen main thread on
/// localhost); 256 MB -> 75 (62 from the network, 2.8 s); 512 MB -> 22
/// (0 from the network, 0.6 s), also on a first start 22 instead of 137.
/// A Service Worker does not help here: it does not see the synchronous
/// XHR at all. `navigator.deviceMemory` is the RAM in GB
/// rounded down and capped at 8 (Chromium; Firefox and Safari give none).
m2w.corpusBudget = function () {
    var v = m2w.options.get('corpusMB');
    if (v) { var i = parseInt(v, 10); if (i > 0) return i; }
    var gb = (typeof navigator !== 'undefined') ? navigator.deviceMemory : undefined;
    // Mobile keeps a safe 384 MB; PC 768 MB (was 256-512): the game uses ~100 chunks
    // (~400 MB) so a bigger budget stops the evict / re-read-from-storage cycle while
    // the character and the bots spawn in M1.
    if (m2w.isMobile && m2w.isMobile()) return 384;
    if (gb >= 4) return 768;
    if (gb > 0) return 256;
    return 768;
};

/// Corpus address with a trailing slash (`?corpus=`, default corpus/).
m2w.corpusUrl = function () {
    var s = m2w.options.get('corpus') || 'corpus/';
    if (s.length && s[s.length - 1] !== '/') s += '/';
    return s;
};

/// Records the first use of a chunk (tools/chunk_order.py reads
/// `m2w.corpus.order` from the console after a session).
m2w.chunkUsed = function (index) {
    m2w.corpus.order.push(index);
};

// ---------------------------------------------------------------------------
// Text: 2D canvases behind GDI (platform_text.cpp)
// ---------------------------------------------------------------------------
// `m2w.canvases[i]` = {c: canvas, x: 2D context}; the fallback road when a
// font has no baked glyphs (the main road pastes GDI bitmaps in C++).
m2w.canvases = m2w.canvases || [];

/// Creates a canvas of the given size and returns its index.
m2w.textCanvasCreate = function (width, height) {
    var c = (typeof OffscreenCanvas !== 'undefined')
            ? new OffscreenCanvas(width, height)
            : document.createElement('canvas');
    c.width = width; c.height = height;
    m2w.canvases.push({ c: c, x: c.getContext('2d', { willReadFrequently: true }) });
    return m2w.canvases.length - 1;
};

/// Sets the CSS font of text canvas `id` (baseline at the top).
m2w.textCanvasFont = function (id, css) {
    var p = m2w.canvases[id];
    p.x.font = css;
    p.x.textBaseline = 'top';
};

/// Advance width of `text` in CSS pixels, in the canvas font.
m2w.textMeasure = function (id, text) {
    return m2w.canvases[id].x.measureText(text).width;
};

/// Width, left and right bounding box of `text` - three numbers from one
/// `TextMetrics` (one boundary crossing instead of three).
m2w.textMeasureThree = function (id, text) {
    var m = m2w.canvases[id].x.measureText(text);
    return [m.width,
            (m.actualBoundingBoxLeft === undefined) ? 0 : m.actualBoundingBoxLeft,
            (m.actualBoundingBoxRight === undefined) ? m.width : m.actualBoundingBoxRight];
};

/// REAL KERNING: cumulative width after every prefix of `text`,
/// so the difference of two neighbours is the width of a character IN ITS
/// NEIGHBOURHOOD - measured in isolation, "T" next to "y" and "T" next to
/// "l" would come out the same, and the strings looked "crooked" (user).
m2w.textMeasurePrefixes = function (id, text, capacity) {
    var n = Math.min(text.length, capacity);
    var p = m2w.canvases[id];
    var out = new Array(n);
    for (var i = 0; i < n; ++i) out[i] = p.x.measureText(text.slice(0, i + 1)).width;
    return out;
};

/// Right edge of `text`'s ink (`actualBoundingBoxRight`), or its width where
/// the browser does not report it.
m2w.textBboxRight = function (id, text) {
    var m = m2w.canvases[id].x.measureText(text);
    return (m.actualBoundingBoxRight === undefined) ? m.width : m.actualBoundingBoxRight;
};

/// Ink height of `text` (ascent + descent of its bounding box).
m2w.textHeight = function (id, text) {
    var m = m2w.canvases[id].x.measureText(text);
    var a = (m.actualBoundingBoxAscent === undefined) ? 0 : m.actualBoundingBoxAscent;
    var d = (m.actualBoundingBoxDescent === undefined) ? 0 : m.actualBoundingBoxDescent;
    return a + d;
};

/// FULL LINE height of the font, NOT of a particular string:
/// `GrpFontTexture::UpdateCharacterInfomation` packs every character into
/// the atlas in a cell as high as `GetTextExtentPoint32` says. Real GDI
/// returns the line height (ascent + descent + internal leading); we used
/// to return the nominal size (`lfHeight`), without room for descenders,
/// so with `textBaseline='top'` a "y" spilled into the NEXT atlas row and
/// showed up as a stray dot under an unrelated string (user report).
/// `fontBoundingBoxAscent/Descent` measure the whole font; the "Mjpqy"
/// probe is the fallback for browsers without those fields.
m2w.textLineHeight = function (id) {
    var m = m2w.canvases[id].x.measureText('Mjpqy');
    if (m.fontBoundingBoxAscent !== undefined && m.fontBoundingBoxDescent !== undefined)
        return m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
    var a = (m.actualBoundingBoxAscent === undefined) ? 0 : m.actualBoundingBoxAscent;
    var d = (m.actualBoundingBoxDescent === undefined) ? 0 : m.actualBoundingBoxDescent;
    return a + d;
};

/// Draws `text` at (x, y); with `opaque` the background is filled first,
/// from the text down to the bottom of the canvas (GDI OPAQUE semantics).
m2w.textDraw = function (id, x, y, text, colour, background, opaque) {
    var p = m2w.canvases[id];
    if (opaque) {
        var w = p.x.measureText(text).width;
        p.x.fillStyle = background;
        p.x.fillRect(x, y, w, p.c.height - y);
    }
    p.x.fillStyle = colour;
    p.x.fillText(text, x, y);
};

/// Reads the rectangle [x0, x1) x [y0, y1) of the canvas into the DIB
/// (`target` = wasm address, `stride` = DIB width) as BGRA - the step that
/// hands the picture to TMP4 under the pointer from `CreateDIBSection`.
///
/// Only the touched rectangle: the first version copied the whole
/// 512x512 atlas for EVERY new character - a `getImageData` plus about a
/// million writes per letter, thirty new chat characters = thirty million
/// writes in one frame, stutter at every new name.
/// Only columns of THIS character: a full-width copy after every
/// `TextOutW` let a "y" (ink one pixel LEFT of its origin) permanently
/// overwrite the "L" packed before it - the atlas has no gutter.
/// Anti-aliasing threshold: `getImageData` returns
/// un-premultiplied colour, so a pixel barely touched is (255,255,255,a=2)
/// and the engine's "blue != 0" binarisation turned every faint edge into
/// a full dot; pixels under alpha 8 are dropped here (lowered from 64 in
/// 291h, when the dots proved to be the overwrite above, not the halo).
m2w.textReadRows = function (id, target, stride, x0, x1, y0, y1) {
    var p = m2w.canvases[id];
    if (y1 <= y0 || x1 <= x0) return;
    if (x0 < 0) x0 = 0;
    if (x1 > stride) x1 = stride;
    if (x1 <= x0) return;
    var w = x1 - x0;
    var d = p.x.getImageData(x0, y0, w, y1 - y0).data;
    var threshold = 8;
    // GDI keeps pixels as BGRA, the canvas as RGBA - the swap is here,
    // because TMP4 reads these bytes directly.
    for (var row = y0; row < y1; ++row) {
        var cb = target + (row * stride + x0) * 4;
        var db = (row - y0) * w * 4;
        for (var col = 0; col < w; ++col) {
            var a = d[db + col * 4 + 3];
            if (a < threshold) {
                HEAPU8[cb + col * 4 + 0] = 0;
                HEAPU8[cb + col * 4 + 1] = 0;
                HEAPU8[cb + col * 4 + 2] = 0;
                HEAPU8[cb + col * 4 + 3] = 0;
                continue;
            }
            HEAPU8[cb + col * 4 + 0] = d[db + col * 4 + 2];
            HEAPU8[cb + col * 4 + 1] = d[db + col * 4 + 1];
            HEAPU8[cb + col * 4 + 2] = d[db + col * 4 + 0];
            HEAPU8[cb + col * 4 + 3] = a;
        }
    }
};

// ---------------------------------------------------------------------------
// Sound: Web Audio behind CSoundManager (sound_web.cpp)
// ---------------------------------------------------------------------------
// Deliberately thin: every NUMBER (volume curve, distance scales, music
// state machine, slot allocation) stays in C++ where it can be compared line
// by line with `milesLib/SoundManager.cpp`; here is only what C++ cannot do.
//
// `m2w.sound`: `ctx` = the AudioContext (null when the browser has none),
// `buffers` = Map crc -> AudioBuffer | null (decoding) | false (failed),
// `slots[i]` = a permanent PAIR of nodes (gain + panner) plus the one-shot
// source playing in it; `gesture` = the first user gesture has happened.
//
// A slot is a permanent pair because `AudioBufferSourceNode` is single-use
// (a Miles `HSAMPLE` could be restarted), so a source is created at every
// play and connected to the pair. `IsDone` counts as Miles did: the slot is
// free when nothing plays in it and nothing waits to be decoded.
m2w.sound = m2w.sound || null;

/// Starts a buffer in a slot; shared by an immediate play and by a decode
/// that has just finished. `generation` guards the `onended` callback: a
/// slot re-allocated in the meantime belongs to somebody else.
m2w.soundStartSource = function (slot, buffer) {
    var S = m2w.sound;
    var s = S.slots[slot];

    if (s.source) { try { s.source.stop(); } catch (e) { } s.source = null; }

    var src = S.ctx.createBufferSource();
    src.buffer = buffer;
    // Miles: `iLoopCount` 0 means "forever", 1 "once", n "n times".
    src.loop = (s.loops === 0);
    src.connect(s.spatial ? s.panner : s.gain);

    var mine = s.generation;
    var left = s.loops;
    /// When a play finishes: plays again while repeats remain (Miles loop count),
    /// otherwise frees the slot - unless the slot was reused meanwhile.
    src.onended = function () {
        if (s.generation !== mine) return;   // slot already given to somebody else
        if (!src.loop && --left > 0) { m2w.soundStartSource(slot, buffer); return; }
        s.source = null;
    };

    s.source = src;
    if (S.ctx.state === 'suspended') S.ctx.resume();
    src.start();
};

/// Creates the context and `slots` node pairs. `equalpower` panning IS the
/// provider TMP4 chose ("Miles Fast 2D Positional Audio": pan and volume,
/// no HRTF); `refDistance` 1 because C++ divides positions by the sound
/// scale (200) first - see sound_web.cpp, "Design".
m2w.soundStart = function (slots) {
    if (m2w.sound) return;

    var S = { ctx: null, buffers: new Map(), slots: [], gesture: false };
    m2w.sound = S;

    var Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return;
    S.ctx = new Context();

    for (var i = 0; i < slots; ++i) {
        var g = S.ctx.createGain();
        var p = S.ctx.createPanner();
        p.panningModel = 'equalpower';   // "Miles Fast 2D Positional Audio"
        p.distanceModel = 'inverse';
        p.refDistance = 1;               // see the note on the constant 200
        p.rolloffFactor = 1;
        p.connect(g);
        g.connect(S.ctx.destination);
        S.slots.push({
            gain: g, panner: p, source: null,
            waiting: 0,      // crc of the file being waited for (0 = none)
            generation: 0,   // grows at every play and stop
            loops: 1,
            spatial: 0
        });
    }

    // The browser will not play before the first user gesture. Miles had no
    // such notion - a platform requirement, not a choice.
    /// The first user gesture: remembers it and resumes the suspended audio
    /// context (browsers allow sound only after one).
    var wake = function () {
        if (S.gesture) return;
        S.gesture = true;
        if (S.ctx && S.ctx.state === 'suspended') S.ctx.resume();
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (n) {
        globalThis.addEventListener(n, wake, { once: true, passive: true });
    });
};

/// Hands the bytes of a file to the decoder. 1 = buffer ready, 0 = decoding
/// (slots that wait for this crc start when it finishes), -1 = cannot.
/// `bytes` must be a COPY: `decodeAudioData` detaches the buffer it gets
/// and a piece of the wasm heap must never be detached.
m2w.soundLoad = function (crc, bytes) {
    var S = m2w.sound;
    if (!S || !S.ctx) return -1;

    var known = S.buffers.get(crc);
    if (known !== undefined) return (known === null) ? 0 : (known === false ? -1 : 1);

    S.buffers.set(crc, null);   // null = in progress

    S.ctx.decodeAudioData(bytes, function (buffer) {
        S.buffers.set(crc, buffer);
        for (var i = 0; i < S.slots.length; ++i) {
            var s = S.slots[i];
            if (s.waiting === crc) { s.waiting = 0; m2w.soundStartSource(i, buffer); }
        }
    }, function () {
        S.buffers.set(crc, false);   // false = tried and failed
        for (var i = 0; i < S.slots.length; ++i)
            if (S.slots[i].waiting === crc) S.slots[i].waiting = 0;
    });

    return 0;
};

/// Plays a file in a slot: now if decoded, when the decode finishes if
/// not yet, never if unknown or broken.
m2w.soundPlay = function (slot, crc, loops, spatial) {
    var S = m2w.sound;
    if (!S || !S.ctx) return;
    var s = S.slots[slot];
    if (!s) return;

    ++s.generation;
    s.loops = loops;
    s.spatial = spatial;
    s.waiting = 0;

    var buffer = S.buffers.get(crc);
    if (buffer === undefined || buffer === false) return;   // unknown or broken
    if (buffer === null) { s.waiting = crc; return; }       // still decoding
    m2w.soundStartSource(slot, buffer);
};

/// Stops slot `slot` at once and forgets a pending start (bumps the
/// generation, so a late `onended` does nothing).
m2w.soundStop = function (slot) {
    var S = m2w.sound;
    if (!S) return;
    var s = S.slots[slot];
    if (!s) return;
    ++s.generation;
    s.waiting = 0;
    if (s.source) { try { s.source.stop(); } catch (e) { } s.source = null; }
};

/// 1 when nothing plays in the slot and nothing waits for a decode.
m2w.soundSlotFree = function (slot) {
    var S = m2w.sound;
    if (!S) return 1;
    var s = S.slots[slot];
    if (!s) return 1;
    return (s.source === null && s.waiting === 0) ? 1 : 0;
};

/// Sets the slot's gain (0..1) from now on.
m2w.soundVolume = function (slot, volume) {
    var S = m2w.sound;
    if (!S || !S.ctx) return;
    var s = S.slots[slot];
    if (s) s.gain.gain.setValueAtTime(volume, S.ctx.currentTime);
};

/// Source position relative to the listener (C++ already divided by the
/// scale and flipped Z).
m2w.soundPosition = function (slot, x, y, z) {
    var S = m2w.sound;
    if (!S) return;
    var s = S.slots[slot];
    if (!s) return;
    if (s.panner.positionX) {
        s.panner.positionX.value = x;
        s.panner.positionY.value = y;
        s.panner.positionZ.value = z;
    } else {
        s.panner.setPosition(x, y, z);   // older form of the same
    }
};

/// Listener position alone; TMP4 keeps it apart from the direction
/// (`SetListenerPosition` vs `SetListenerDirection`) and calls them from
/// different places, so here too they are two functions.
m2w.soundListenerPosition = function (x, y, z) {
    var S = m2w.sound;
    if (!S || !S.ctx) return;
    var L = S.ctx.listener;
    if (L.positionX) {
        L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
    } else {
        L.setPosition(x, y, z);
    }
};

/// Listener direction alone - the counterpart of `AIL_set_3D_orientation`.
m2w.soundListenerDirection = function (fx, fy, fz, ux, uy, uz) {
    var S = m2w.sound;
    if (!S || !S.ctx) return;
    var L = S.ctx.listener;
    if (L.forwardX) {
        L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
        L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
    } else {
        L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
};

// ---------------------------------------------------------------------------
// IME: focus of the hidden text element (ime_web.cpp)
// ---------------------------------------------------------------------------
// The browser composes characters (CJK input methods) only while a text
// element has focus. The design is a hidden element `m2w_ime`
// over the canvas whose `composition*` and `paste` events call the
// `M2W_Ime*` exports with `Module.ccall`; NO PAGE CREATES THAT ELEMENT
// and no such listener exists yet (git grep), so today this is a
// no-op and characters reach the game only as `WM_CHAR` from `keydown`
// (`m2w.eventsStart`). `EnableIME` may run before the page is ready, so a
// missing element is not an error.
/// Focuses (`enabled`) or blurs the `m2w_ime` element; nothing when the page
/// has none (today no page does).
m2w.imeActive = false;
m2w.isTypingInHtmlInput = function (e) {
    var el = (e && e.target) || (globalThis.document && document.activeElement);
    if (!el || el === document.body || el === document.documentElement || el.id === 'canvas') {
        el = globalThis.document && document.activeElement;
    }
    if (!el || el.id === 'canvas') return false;
    var tag = (el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
};
m2w.imeEnable = function (enabled) {
    m2w.imeActive = !!enabled;
    if (enabled && m2w.dik) m2w.dik.fill(0);
    var e = globalThis.document && document.getElementById('m2w_ime');
    if (!e) return;
    if (enabled) e.focus(); else e.blur();
};

// ---------------------------------------------------------------------------
// Loop (win32_compat.cpp)
// ---------------------------------------------------------------------------
m2w.options.add([
    { name: 'fps', file: 'win32_compat.cpp', site: true,
      doc: 'artificial frame limit N for tests: loop turns faster than 1000/N ms are skipped, as on a slow monitor' },
    { name: 'events', file: 'win32_compat.cpp',
      doc: 'loop = the old road of the event frame counter, one event frame per loop turn, for A/B (stage_port.py)' }
]);

/// `?fps=N` as a number, 0 when absent or not positive.
m2w.fpsLimit = function () {
    var f = parseFloat(m2w.options.get('fps'));
    if (f > 0) return f;
    // PATCH (PT-BR): limite de quadros do modo grafico do celular (le a cada chamada,
    // entao trocar no menu vale na hora se o motor consultar de novo).
    if (m2w.isMobile && m2w.isMobile()) {
        var g = m2w.gfxLevel();
        if (g === 'low') return 30;
    }
    return 0;
};

/// 1 when `?events=loop` is in the address.
m2w.eventsFromLoop = function () {
    return m2w.options.get('events') === 'loop' ? 1 : 0;
};

// ---------------------------------------------------------------------------
// Forest (speedtree_web.cpp)
// ---------------------------------------------------------------------------
m2w.options.add([
    { name: 'forest', file: 'speedtree_web.cpp',
      doc: 'tree diagnostics 1-5: 1 draw every instance, 2 no alpha/fog/culling, 3 no depth test, 4 trees after the terrain, 5 every tree 25 m in front of the camera; gl_device.cpp writes /las.txt' }
]);

// ---------------------------------------------------------------------------
// GL device render switches (gl_*.cpp)
// ---------------------------------------------------------------------------
m2w.options.add([
    { name: 'tnl', file: 'gl_device.cpp',
      doc: '0 = software vertex transformation (VertexShaderVersion 0, the STP terrain road) to compare with the default hardware road' },
    { name: 'noflip', file: 'gl_render_states.cpp',
      doc: '1 switches the Y flip of drawing to a texture off (A/B test); window.m2w_no_reflection overrides it live' },
    { name: 'nocustom', file: 'gl_buffers.cpp',
      doc: '1 = characters through the fixed-function pipeline instead of road B (experiment)' },
    { name: 'nocull', file: 'gl_buffers.cpp',
      doc: '1 = no face culling on road B (experiment)' },
    { name: 'shadow', file: 'gl_buffers.cpp',
      doc: 'terrain shadow pass experiment: 0 skip the pass, 1/2/3 pretend no texture on stage 0/1/both' }
]);

// ---------------------------------------------------------------------------
// Skinning (granny_pose.cpp)
// ---------------------------------------------------------------------------
m2w.options.add([
    { name: 'skinshortcut', file: 'granny_pose.cpp',
      doc: '0 switches the full-weight skinning shortcut off, to measure both roads in one machine state' }
]);

// ---------------------------------------------------------------------------
// Probes without a server (custom_draw.cpp)
// ---------------------------------------------------------------------------
m2w.options.add([
    { name: 'modelprobe', file: 'custom_draw.cpp',
      doc: 'draw N instances of a .gr2 model on the login screen, pose and skin every frame (1..200)' },
    { name: 'probefile', file: 'custom_draw.cpp',
      doc: 'the model file for ?modelprobe instead of warrior_novice.gr2' },
    { name: 'probehash', file: 'custom_draw.cpp',
      doc: 'with ?modelprobe: print the FNV-1a hash of the canvas after the F-th probe frame (tools/gates/check_probe.py)' },
    { name: 'textureprobe', file: 'custom_draw.cpp',
      doc: 'load every image of a directory through CResourceManager and time it; 1 = d:/ymir work/pc/warrior/' }
]);
// end include: ./compat/runtime.js
// include: <tmp>\tmpparey1nh.js

    if (!Module['preRun']) throw 'Module.preRun should exist because file support used it; did a pre-js delete it?';
    necessaryPreJSTasks.forEach((task) => {
      if (Module['preRun'].indexOf(task) < 0) throw 'All preRun tasks that exist before user pre-js code should remain after; did you replace Module or modify Module.preRun?';
    });
  // end include: <tmp>\tmpparey1nh.js


var programArgs = [];
var thisProgram = './this.program';
var quit_ = (status, toThrow) => {
  throw toThrow;
};

// In MODULARIZE mode _scriptName needs to be captured already at the very top of the page immediately when the page is parsed, so it is generated there
// before the page load. In non-MODULARIZE modes generate it here.
var _scriptName = globalThis.document?.currentScript?.src;

if (typeof __filename != 'undefined') { // Node
  _scriptName = __filename;
} else
if (ENVIRONMENT_IS_WORKER) {
  _scriptName = self.location.href;
}

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var readAsync, readBinary;

if (ENVIRONMENT_IS_NODE) {
  const isNode = globalThis.process?.versions?.node && globalThis.process?.type != 'renderer';
  if (!isNode) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  // These modules will usually be used on Node.js. Load them eagerly to avoid
  // the complexity of lazy-loading.
  var fs = require('node:fs');

  scriptDirectory = __dirname + '/';

// include: node_shell_read.js
readBinary = (filename) => {
  // We need to re-wrap `file://` strings to URLs.
  filename = isFileURI(filename) ? new URL(filename) : filename;
  var ret = fs.readFileSync(filename);
  assert(Buffer.isBuffer(ret));
  return ret;
};

readAsync = async (filename, binary = true) => {
  // See the comment in the `readBinary` function.
  filename = isFileURI(filename) ? new URL(filename) : filename;
  var ret = fs.readFileSync(filename, binary ? undefined : 'utf8');
  assert(binary ? Buffer.isBuffer(ret) : typeof ret == 'string');
  return ret;
};
// end include: node_shell_read.js
  if (process.argv.length > 1) {
    thisProgram = process.argv[1].replace(/\\/g, '/');
  }

  programArgs = process.argv.slice(2);

  // MODULARIZE will export the module in the proper place outside, we don't need to export here
  if (typeof module != 'undefined') {
    module['exports'] = Module;
  }

  quit_ = (status, toThrow) => {
    process.exitCode = status;
    throw toThrow;
  };

} else
if (ENVIRONMENT_IS_SHELL) {

} else

// Note that this includes Node.js workers when relevant (pthreads is enabled).
// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
// ENVIRONMENT_IS_NODE.
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  try {
    scriptDirectory = new URL('.', _scriptName).href; // includes trailing slash
  } catch {
    // Must be a `blob:` or `data:` URL (e.g. `blob:http://site.com/etc/etc`), we cannot
    // infer anything from them.
  }

  if (!(globalThis.window || globalThis.WorkerGlobalScope)) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  {
// include: web_or_worker_shell_read.js
if (ENVIRONMENT_IS_WORKER) {
    readBinary = (url) => {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.responseType = 'arraybuffer';
      xhr.send(null);
      return new Uint8Array(/** @type{!ArrayBuffer} */(xhr.response));
    };
  }

  readAsync = async (url) => {
    // Fetch has some additional restrictions over XHR, like it can't be used on a file:// url.
    // See https://github.com/github/fetch/pull/92#issuecomment-140665932
    // Cordova or Electron apps are typically loaded from a file:// url.
    // So use XHR on webview if URL is a file URL.
    if (isFileURI(url)) {
      return new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = () => {
          if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
            resolve(xhr.response);
            return;
          }
          reject(xhr.status);
        };
        xhr.onerror = reject;
        xhr.send(null);
      });
    }
    var response = await fetch(url, { credentials: 'same-origin' });
    if (response.ok) {
      return response.arrayBuffer();
    }
    throw new Error(response.status + ' : ' + response.url);
  };
// end include: web_or_worker_shell_read.js
  }
} else
{
  throw new Error('environment detection error');
}

var out = console.log.bind(console);
var err = console.error.bind(console);

var IDBFS = 'IDBFS is no longer included by default; build with -lidbfs.js';
var PROXYFS = 'PROXYFS is no longer included by default; build with -lproxyfs.js';
var WORKERFS = 'WORKERFS is no longer included by default; build with -lworkerfs.js';
var FETCHFS = 'FETCHFS is no longer included by default; build with -lfetchfs.js';
var ICASEFS = 'ICASEFS is no longer included by default; build with -licasefs.js';
var JSFILEFS = 'JSFILEFS is no longer included by default; build with -ljsfilefs.js';
var OPFS = 'OPFS is no longer included by default; build with -lopfs.js';

var NODEFS = 'NODEFS is no longer included by default; build with -lnodefs.js';

// perform assertions in shell.js after we set up out() and err(), as otherwise
// if an assertion fails it cannot print the message

assert(!ENVIRONMENT_IS_SHELL, 'shell environment detected but not enabled at build time (add `shell` to `-sENVIRONMENT` to enable)');

// end include: shell.js

// include: preamble.js
// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

var wasmBinary;

if (!globalThis.WebAssembly) {
  err('no native wasm support detected');
}

// Wasm globals

//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS;

// In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
// don't define it at all in release modes.  This matches the behaviour of
// MINIMAL_RUNTIME.
// TODO(sbc): Make this the default even without STRICT enabled.
/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed' + (text ? ': ' + text : ''));
  }
}

// We used to include malloc/free by default in the past. Show a helpful error in
// builds with assertions.
function _free() {
  // Show a helpful error since we used to include free by default in the past.
  abort('free() called but not included in the build - add `_free` to EXPORTED_FUNCTIONS');
}

/**
 * Indicates whether filename is delivered via file protocol (as opposed to http/https)
 * @noinline
 */
var isFileURI = (filename) => filename.startsWith('file://');

// include: runtime_common.js
// include: runtime_exceptions.js
// Base Emscripten EH error class
class EmscriptenEH {}

class EmscriptenSjLj extends EmscriptenEH {}

// end include: runtime_exceptions.js
// include: runtime_debug.js
var runtimeDebug = true; // Switch to false at runtime to disable logging at the right times

// Used by XXXXX_DEBUG settings to output debug messages.
function dbg(...args) {
  if (!runtimeDebug && typeof runtimeDebug != 'undefined') return;
  // TODO(sbc): Make this configurable somehow.  Its not always convenient for
  // logging to show up as warnings.
  console.warn(...args);
}

// Endianness check
(() => {
  var h16 = new Int16Array(1);
  var h8 = new Int8Array(h16.buffer);
  h16[0] = 0x6373;
  if (h8[0] !== 0x73 || h8[1] !== 0x63) abort('Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)');
})();

function consumedModuleProp(prop) {
  var value = Module[prop];
  var msg = `Attempt to modify \`Module.${prop}\` after it has already been processed.  This can happen, for example, when code is injected via '--post-js' rather than '--pre-js'`;
  if (Array.isArray(value)) {
    value = new Proxy(value, {
      set(target, key, val) {
        abort(msg);
        return false;
      },
      defineProperty(target, key, descriptor) {
        abort(msg);
        return false;
      },
      deleteProperty(target, key) {
        abort(msg);
        return false;
      }
    });
  }
  Object.defineProperty(Module, prop, {
    configurable: true,
    get() { return value; },
    set() {
      abort(msg);
    }
  });
}

function makeInvalidEarlyAccess(name) {
  return () => assert(false, `call to '${name}' via reference taken before Wasm module initialization`);

}

function ignoredModuleProp(prop) {
  if (Object.getOwnPropertyDescriptor(Module, prop)) {
    abort(`\`Module.${prop}\` was supplied but \`${prop}\` not included in INCOMING_MODULE_JS_API`);
  }
}

// forcing the filesystem exports a few things by default
function isExportedByForceFilesystem(name) {
  return name === 'FS_createPath' ||
         name === 'FS_createDataFile' ||
         name === 'FS_createPreloadedFile' ||
         name === 'FS_preloadFile' ||
         name === 'FS_unlink' ||
         name === 'addRunDependency' ||
         // The old FS has some functionality that WasmFS lacks.
         name === 'FS_createLazyFile' ||
         name === 'FS_createDevice' ||
         name === 'removeRunDependency';
}

/**
 * Intercept access to a symbols in the global symbol.  This enables us to give
 * informative warnings/errors when folks attempt to use symbols they did not
 * include in their build, or no symbols that no longer exist.
 *
 * We don't define this in MODULARIZE mode since in that mode emscripten symbols
 * are never placed in the global scope.
 */
function hookGlobalSymbolAccess(sym, func) {
  if (!Object.getOwnPropertyDescriptor(globalThis, sym)) {
    Object.defineProperty(globalThis, sym, {
      configurable: true,
      get() {
        func();
        return undefined;
      }
    });
  }
}

function missingGlobal(sym, msg) {
  hookGlobalSymbolAccess(sym, () => {
    warnOnce(`\`${sym}\` is no longer defined by emscripten. ${msg}`);
  });
}

missingGlobal('buffer', 'Please use HEAP8.buffer or wasmMemory.buffer');
missingGlobal('asm', 'Please use wasmExports instead');

function missingLibrarySymbol(sym) {
  hookGlobalSymbolAccess(sym, () => {
    // Can't `abort()` here because it would break code that does runtime
    // checks.  e.g. `if (typeof SDL === 'undefined')`.
    var msg = `\`${sym}\` is a library symbol and not included by default; add it to your library.js __deps or to DEFAULT_LIBRARY_FUNCS_TO_INCLUDE on the command line`;
    // DEFAULT_LIBRARY_FUNCS_TO_INCLUDE requires the name as it appears in
    // library.js, which means $name for a JS name with no prefix, or name
    // for a JS name like _name.
    var librarySymbol = sym;
    if (!librarySymbol.startsWith('_')) {
      librarySymbol = '$' + sym;
    }
    msg += ` (e.g. -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='${librarySymbol}')`;
    if (isExportedByForceFilesystem(sym)) {
      msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
    }
    warnOnce(msg);
  });

  // Any symbol that is not included from the JS library is also (by definition)
  // not exported on the Module object.
  unexportedRuntimeSymbol(sym);
}

function unexportedRuntimeSymbol(sym) {
  if (!Object.getOwnPropertyDescriptor(Module, sym)) {
    Object.defineProperty(Module, sym, {
      configurable: true,
      get() {
        var msg = `'${sym}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
        if (isExportedByForceFilesystem(sym)) {
          msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
        }
        abort(msg);
      },
    });
  }
}

// end include: runtime_debug.js
// include: runtime_stack_check.js
const stackCookie1 = 0x02135467;
const stackCookie2 = 0x89BACDFE;

// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  var max = _emscripten_stack_get_end();
  assert((max & 3) == 0);
  // If the stack ends at address zero we write our cookies 4 bytes into the
  // stack.  This prevents interference with SAFE_HEAP and ASAN which also
  // monitor writes to address zero.
  if (max == 0) {
    max += 4;
  }
  // The stack grow downwards towards _emscripten_stack_get_end.
  // We write cookies to the final two words in the stack and detect if they are
  // ever overwritten.
  HEAPU32[((max)>>2)] = stackCookie1;
  HEAPU32[(((max)+(4))>>2)] = stackCookie2;
  // Also test the global address 0 for integrity.
  HEAPU32[((0)>>2)] = 1668509029;
}

function u32ToHexString(num) {
  return '0x' + (num >>> 0).toString(16).padStart(8, '0');
}

function checkStackCookie() {
  if (ABORT) return;
  var max = _emscripten_stack_get_end();
  // See writeStackCookie().
  if (max == 0) {
    max += 4;
  }
  var val1 = HEAPU32[((max)>>2)];
  var val2 = HEAPU32[(((max)+(4))>>2)];
  if (val1 != stackCookie1 || val2 != stackCookie2) {
    abort(`Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords ${u32ToHexString(stackCookie2)} and ${u32ToHexString(stackCookie1)}, but received ${u32ToHexString(val2)} ${u32ToHexString(val1)}`);
  }
  // Also test the global address 0 for integrity.
  if (HEAPU32[((0)>>2)] != 0x63736d65 /* 'emsc' */) {
    abort('Runtime error: The application has corrupted its heap memory area (address zero)!');
  }
}
// end include: runtime_stack_check.js
// Memory management

var runtimeInitialized = false;



// When ALLOW_MEMORY_GROWTH is enabled, the conversion from Wasm
// memory to ArrayBuffer requires some additional logic.
function getMemoryBuffer() {
  return wasmMemory.buffer;
}

function updateMemoryViews() {
  // If we already have a heap that is resizeable/growable buffer we don't
  // need to do anything in updateMemoryViews.
  if (HEAP8?.buffer?.resizable) return;
  var b = getMemoryBuffer();
  HEAP8 = new Int8Array(b);
  HEAP16 = new Int16Array(b);
  HEAPU8 = new Uint8Array(b);
  HEAPU16 = new Uint16Array(b);
  HEAP32 = new Int32Array(b);
  HEAPU32 = new Uint32Array(b);
  HEAPF32 = new Float32Array(b);
  HEAPF64 = new Float64Array(b);
  HEAP64 = new BigInt64Array(b);
  
}

// include: memoryprofiler.js
// end include: memoryprofiler.js
// end include: runtime_common.js
assert(globalThis.Int32Array && globalThis.Float64Array && Int32Array.prototype.subarray && Int32Array.prototype.set,
       'JS engine does not provide full typed array support');

function preRun() {
  var preRun = Module['preRun'];
  if (preRun) {
    if (typeof preRun == 'function') preRun = [preRun];
    onPreRuns.push(...preRun);
  }
  consumedModuleProp('preRun');
  // Begin ATPRERUNS hooks
  callRuntimeCallbacks(onPreRuns);
  // End ATPRERUNS hooks
}

function initRuntime() {
  assert(!runtimeInitialized);
  runtimeInitialized = true;

  checkStackCookie();

  // Begin ATINITS hooks
  SOCKFS.root = FS.mount(SOCKFS, {}, null);
// PATCH: algum acesso ao sistema de arquivos antes da inicializacao (ex.: um arquivo
// aberto que ficou sem fechar por causa de um erro) ocupava o descritor 0 e a
// inicializacao parava com "invalid handle for stdin (1)". Libera 0-2 antes.
try {
  if (FS.streams) for (var m2wFd = 0; m2wFd < 3; m2wFd++) {
    if (FS.streams[m2wFd]) {
      console.warn('[m2w] descritor ' + m2wFd + ' ocupado antes do FS.init (' + (FS.streams[m2wFd].path || '?') + ') - liberando');
      try { FS.close(FS.streams[m2wFd]); } catch (e) { FS.streams[m2wFd] = null; }
    }
  }
} catch (e) { }
if (!Module['noFSInit'] && !FS.initialized) FS.init();
globalThis.m2wFsReady = true;
TTY.init();
PIPEFS.root = FS.mount(PIPEFS, {}, null);
  // End ATINITS hooks

  wasmExports['__wasm_call_ctors']();

  // Begin ATPOSTCTORS hooks
  FS.ignorePermissions = false;
  // End ATPOSTCTORS hooks

  checkStackCookie();
}

function postRun() {
  checkStackCookie();

  var postRun = Module['postRun'];
  if (postRun) {
    if (typeof postRun == 'function') postRun = [postRun];
    onPostRuns.push(...postRun);
  }
  consumedModuleProp('postRun');

  // Begin ATPOSTRUNS hooks
  callRuntimeCallbacks(onPostRuns);
  // End ATPOSTRUNS hooks
}

/**
 * @param {string|number=} what
 */
function abort(what) {
  Module['onAbort']?.(what);

  what = `Aborted(${what})`;
  // TODO(sbc): Should we remove printing and leave it up to whoever
  // catches the exception?
  err(what);

  ABORT = true;

  // Use a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.
  // FIXME This approach does not work in Wasm EH because it currently does not assume
  // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
  // a trap or not based on a hidden field within the object. So at the moment
  // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
  // allows this in the wasm spec.

  // Suppress closure compiler warning here. Closure compiler's builtin extern
  // definition for WebAssembly.RuntimeError claims it takes no arguments even
  // though it can.
  // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
  /** @suppress {checkTypes} */
  var e = new WebAssembly.RuntimeError(what);

  // Throw the error whether or not MODULARIZE is set because abort is used
  // in code paths apart from instantiation where an exception is expected
  // to be thrown when abort is called.
  throw e;
}

function createExportWrapper(name, func, nargs) {
  assert(func);
  return (...args) => {
    assert(runtimeInitialized, `native function \`${name}\` called before runtime initialization`);
    // Only assert for too many arguments. Too few can be valid since the missing arguments will be zero filled.
    assert(args.length <= nargs, `native function \`${name}\` called with ${args.length} args but expects ${nargs}`);
    return func(...args);
  };
}

var wasmBinaryFile;

function findWasmBinary() {
  return locateFile('client.wasm');
}

function getBinarySync(file) {
  if (file == wasmBinaryFile && wasmBinary) {
    return new Uint8Array(wasmBinary);
  }
  if (readBinary) {
    return readBinary(file);
  }
  // Throwing a plain string here, even though it not normally advisable since
  // this gets turning into an `abort` in instantiateArrayBuffer.
  throw 'both async and sync fetching of the wasm failed';
}

async function getWasmBinary(binaryFile) {
  // If we don't have the binary yet, load it asynchronously using readAsync.
  if (!wasmBinary) {
    // Fetch the binary using readAsync
    try {
      var response = await readAsync(binaryFile);
      return new Uint8Array(response);
    } catch {
      // Fall back to getBinarySync below;
    }
  }

  // Otherwise, getBinarySync should be able to get it synchronously
  return getBinarySync(binaryFile);
}

async function instantiateArrayBuffer(binaryFile, imports) {
  try {
    var binary = await getWasmBinary(binaryFile);
    var instance = await WebAssembly.instantiate(binary, imports);
    return instance;
  } catch (reason) {
    err(`failed to asynchronously prepare wasm: ${reason}`);

    // Warn on some common problems.
    if (isFileURI(binaryFile)) {
      err(`warning: Loading from a file URI (${binaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`);
    }
    abort(reason);
  }
}

async function instantiateAsync(binary, binaryFile, imports) {
  if (!binary
      // Don't use streaming for file:// delivered objects in a webview, fetch them synchronously.
      && !isFileURI(binaryFile)
      // Avoid using instantiateStreaming() on Node.js since the `fetch()` API
      // does not support `file://` URLs.
      // See: https://github.com/emscripten-core/emscripten/pull/16917
      && !ENVIRONMENT_IS_NODE
     ) {
    try {
      var response = fetch(binaryFile, { credentials: 'same-origin' });
      var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
      return instantiationResult;
    } catch (reason) {
      // We expect the most common failure cause to be a bad MIME type for the binary,
      // in which case falling back to ArrayBuffer instantiation should work.
      err(`wasm streaming compile failed: ${reason}`);
      err('falling back to ArrayBuffer instantiation');
      // fall back of instantiateArrayBuffer below
    };
  }
  return instantiateArrayBuffer(binaryFile, imports);
}

function getWasmImports() {
  // prepare imports
  var imports = {
    'env': wasmImports,
    'wasi_snapshot_preview1': wasmImports,
  };
  return imports;
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
async function createWasm() {
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  function receiveInstance(instance) {
    wasmExports = instance.exports;

    assignWasmExports(wasmExports);

    updateMemoryViews();

    return wasmExports;
  }

  // Prefer streaming instantiation if available.
  // Async compilation can be confusing when an error on the page overwrites Module
  // (for example, if the order of elements is wrong, and the one defining Module is
  // later), so we save Module and check it later.
  var trueModule = Module;
  function receiveInstantiationResult(result) {
    // 'result' is a ResultObject object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    assert(Module === trueModule, 'the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?');
    trueModule = null;
    // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
    // When the regression is fixed, can restore the above PTHREADS-enabled path.
    return receiveInstance(result['instance']);
  }

  var info = getWasmImports();

  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to
  // run the instantiation parallel to any other async startup actions they are
  // performing.
  // Also pthreads and wasm workers initialize the wasm instance through this
  // path.
  var instantiateWasm = Module['instantiateWasm'];
  if (instantiateWasm) {
    return new Promise((resolve) => {
      try {
        instantiateWasm(info, (inst) => resolve(receiveInstance(inst)));
      } catch(e) {
        err(`Module.instantiateWasm callback failed with error: ${e}`);
        throw e;
      }
    });
  }

  wasmBinaryFile ??= findWasmBinary();
  var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
  var exports = receiveInstantiationResult(result);
  return exports;
}

// end include: preamble.js

// Begin JS library code


  class ExitStatus {
      name = 'ExitStatus';
      constructor(status) {
        this.message = `Program terminated with exit(${status})`;
        this.status = status;
      }
    }

  /** @type {!Int32Array} */
  var HEAP32;

  /** @type {!Int8Array} */
  var HEAP8;

  /** @type {!Uint32Array} */
  var HEAPU32;

  var callRuntimeCallbacks = (callbacks) => {
      while (callbacks.length > 0) {
        // Pass the module as the first argument.
        callbacks.shift()(Module);
      }
    };
  var onPostRuns = [];
  var addOnPostRun = (cb) => onPostRuns.push(cb);

  var onPreRuns = [];
  var addOnPreRun = (cb) => onPreRuns.push(cb);


  var noExitRuntime = true;

  function ptrToString(ptr) {
      assert(typeof ptr === 'number', `ptrToString expects a number, got ${typeof ptr}`);
      // Convert to 32-bit unsigned value
      ptr >>>= 0;
      return '0x' + ptr.toString(16).padStart(8, '0');
    }

  var stackRestore = (val) => __emscripten_stack_restore(val);

  var stackSave = () => _emscripten_stack_get_current();

  var warnOnce = (text) => {
      warnOnce.shown ||= {};
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        if (ENVIRONMENT_IS_NODE) text = 'warning: ' + text;
        err(text);
      }
    };

  

  function __Z16ReleaseSemaphorePvlPl(...args
  ) {
  abort('missing function: _Z16ReleaseSemaphorePvlPl');
  }
  __Z16ReleaseSemaphorePvlPl.stub = true;

  var UTF8Decoder = globalThis.TextDecoder && new TextDecoder();
  
  
    /**
   * heapOrArray is either a regular array, or a JavaScript typed array view.
   * @param {number} idx
   * @param {number=} maxBytesToRead
   * @param {boolean=} ignoreNul
   * @return {number}
   */
  var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
      var maxIdx = idx + maxBytesToRead;
      if (ignoreNul) return maxIdx;
      // TextDecoder needs to know the byte length in advance, it doesn't stop on
      // null terminator by itself.
      // As a tiny code save trick, compare idx against maxIdx using a negation,
      // so that maxBytesToRead=undefined/NaN means Infinity.
      while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
      return idx;
    };
  
  
    /**
   * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
   * array that contains uint8 values, returns a copy of that string as a
   * Javascript String object.
   * heapOrArray is either a regular array, or a JavaScript typed array view.
   * @param {number=} idx
   * @param {number=} maxBytesToRead
   * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
   * @return {string}
   */
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
  
      var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
  
      // When using conditional TextDecoder, skip it for short strings as the overhead of the native call is not worth it.
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
      }
      var str = '';
      while (idx < endPtr) {
        // For UTF8 byte structure, see:
        // http://en.wikipedia.org/wiki/UTF-8#Description
        // https://www.ietf.org/rfc/rfc2279.txt
        // https://tools.ietf.org/html/rfc3629
        var u0 = heapOrArray[idx++];
        if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 0xF0) == 0xE0) {
          u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        } else {
          if ((u0 & 0xF8) != 0xF0) warnOnce(`Invalid UTF-8 leading byte ${ptrToString(u0)} encountered when deserializing a UTF-8 string in wasm memory to a JS string!`);
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);
        }
  
        if (u0 < 0x10000) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 0x10000;
          str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
        }
      }
      return str;
    };
  
  /** @type {!Uint8Array} */
  var HEAPU8;
  
    /**
   * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
   * emscripten HEAP, returns a copy of that string as a Javascript String object.
   *
   * @param {number} ptr
   * @param {number=} maxBytesToRead - An optional length that specifies the
   *   maximum number of bytes to read. You can omit this parameter to scan the
   *   string until the first 0 byte. If maxBytesToRead is passed, and the string
   *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
   *   string will cut short at that byte index.
   * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
   * @return {string}
   */
  var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => {
      assert(typeof ptr == 'number', `UTF8ToString expects a number (got ${typeof ptr})`);
      return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : '';
    };
  var ___assert_fail = (condition, filename, line, func) =>
      abort(`Assertion failed: ${UTF8ToString(condition)}, at: ` + [filename ? UTF8ToString(filename) : 'unknown filename', line, func ? UTF8ToString(func) : 'unknown function']);

  var wasmTableMirror = [];
  
  
  var getWasmTableEntry = (funcPtr) => {
      var func = wasmTableMirror[funcPtr];
      if (!func) {
        /** @suppress {checkTypes} */
        wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
      }
      /** @suppress {checkTypes} */
      assert(wasmTable.get(funcPtr) == func, 'table mirror is out of date');
      return func;
    };
  var ___call_sighandler = (fp, sig) => getWasmTableEntry(fp)(sig);

  
  class ExceptionInfo {
      // excPtr - Thrown object pointer to wrap. Metadata pointer is calculated from it.
      constructor(excPtr) {
        this.excPtr = excPtr;
        this.ptr = excPtr - 24;
      }
  
      set_type(type) {
        HEAPU32[(((this.ptr)+(4))>>2)] = type;
      }
  
      get_type() {
        return HEAPU32[(((this.ptr)+(4))>>2)];
      }
  
      set_destructor(destructor) {
        HEAPU32[(((this.ptr)+(8))>>2)] = destructor;
      }
  
      get_destructor() {
        return HEAPU32[(((this.ptr)+(8))>>2)];
      }
  
      set_caught(caught) {
        caught = caught ? 1 : 0;
        HEAP8[(this.ptr)+(12)] = caught;
      }
  
      get_caught() {
        return HEAP8[(this.ptr)+(12)] != 0;
      }
  
      set_rethrown(rethrown) {
        rethrown = rethrown ? 1 : 0;
        HEAP8[(this.ptr)+(13)] = rethrown;
      }
  
      get_rethrown() {
        return HEAP8[(this.ptr)+(13)] != 0;
      }
  
      // Initialize native structure fields. Should be called once after allocated.
      init(type, destructor) {
        this.set_adjusted_ptr(0);
        this.set_type(type);
        this.set_destructor(destructor);
      }
  
      set_adjusted_ptr(adjustedPtr) {
        HEAPU32[(((this.ptr)+(16))>>2)] = adjustedPtr;
      }
  
      get_adjusted_ptr() {
        return HEAPU32[(((this.ptr)+(16))>>2)];
      }
    }
  
  var uncaughtExceptionCount = 0;
  
  var __Unwind_RaiseException = (ex) => {
      assert(false, 'Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch.');
    };
  var ___cxa_throw = (ptr, type, destructor) => {
      var info = new ExceptionInfo(ptr);
      // Initialize ExceptionInfo content after it was allocated in __cxa_allocate_exception.
      info.init(type, destructor);
      uncaughtExceptionCount++;
      __Unwind_RaiseException(ptr);
    };

  var initRandomFill = () => {
      // This block is not needed on v19+ since crypto.getRandomValues is builtin
      if (ENVIRONMENT_IS_NODE) {
        var nodeCrypto = require('node:crypto');
        return (view) => (nodeCrypto.randomFillSync(view), 0);
      }
  
      return (view) => (crypto.getRandomValues(view), 0);
    };
  var randomFill = (view) => (randomFill = initRandomFill())(view);
  
  var PATH = {
  isAbs:(path) => path.charAt(0) === '/',
  splitPath:(filename) => {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },
  normalizeArray:(parts, allowAboveRoot) => {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift('..');
          }
        }
        return parts;
      },
  normalize:(path) => {
        var isAbsolute = PATH.isAbs(path),
            trailingSlash = path.slice(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter((p) => !!p), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },
  dirname:(path) => {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.slice(0, -1);
        }
        return root + dir;
      },
  basename:(path) => path && path.match(/([^\/]+|\/)\/*$/)[1],
join:(...paths) => PATH.normalize(paths.join('/')),
join2:(l, r) => PATH.normalize(l + '/' + r),
};


var PATH_FS = {
resolve:(...args) => {
      var resolvedPath = '',
        resolvedAbsolute = false;
      for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
        var path = (i >= 0) ? args[i] : FS.cwd();
        // Skip empty and invalid entries
        if (typeof path != 'string') {
          throw new TypeError('Arguments to path.resolve must be strings');
        } else if (!path) {
          return ''; // an invalid portion invalidates the whole thing
        }
        resolvedPath = path + '/' + resolvedPath;
        resolvedAbsolute = PATH.isAbs(path);
      }
      // At this point the path should be resolved to a full absolute path, but
      // handle relative paths to be safe (might happen when process.cwd() fails)
      resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter((p) => !!p), !resolvedAbsolute).join('/');
      return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
    },
relative:(from, to) => {
      from = PATH_FS.resolve(from).slice(1);
      to = PATH_FS.resolve(to).slice(1);
      function trim(arr) {
        var start = 0;
        for (; start < arr.length; start++) {
          if (arr[start] !== '') break;
        }
        var end = arr.length - 1;
        for (; end >= 0; end--) {
          if (arr[end] !== '') break;
        }
        if (start > end) return [];
        return arr.slice(start, end - start + 1);
      }
      var fromParts = trim(from.split('/'));
      var toParts = trim(to.split('/'));
      var length = Math.min(fromParts.length, toParts.length);
      var samePartsLength = length;
      for (var i = 0; i < length; i++) {
        if (fromParts[i] !== toParts[i]) {
          samePartsLength = i;
          break;
        }
      }
      var outputParts = [];
      for (var i = samePartsLength; i < fromParts.length; i++) {
        outputParts.push('..');
      }
      outputParts = outputParts.concat(toParts.slice(samePartsLength));
      return outputParts.join('/');
    },
};



var FS_stdin_getChar_buffer = [];

var lengthBytesUTF8 = (str) => {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
      // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
      // unit, not a Unicode code point of the character! So decode
      // UTF16->UTF32->UTF8.
      // See http://unicode.org/faq/utf_bom.html#utf16-3
      var c = str.charCodeAt(i); // possibly a lead surrogate
      if (c <= 0x7F) {
        len++;
      } else if (c <= 0x7FF) {
        len += 2;
      } else if (c >= 0xD800 && c <= 0xDFFF) {
        len += 4; ++i;
      } else {
        len += 3;
      }
    }
    return len;
  };

var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
    assert(typeof str === 'string', `stringToUTF8Array expects a string (got ${typeof str})`);
    // Parameter maxBytesToWrite is not optional. Negative values, 0, null,
    // undefined and false each don't write out any bytes.
    if (!(maxBytesToWrite > 0))
      return 0;

    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
    for (var i = 0; i < str.length; ++i) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
      // and https://www.ietf.org/rfc/rfc2279.txt
      // and https://tools.ietf.org/html/rfc3629
      var u = str.codePointAt(i);
      if (u <= 0x7F) {
        if (outIdx >= endIdx) break;
        heap[outIdx++] = u;
      } else if (u <= 0x7FF) {
        if (outIdx + 1 >= endIdx) break;
        heap[outIdx++] = 0xC0 | (u >> 6);
        heap[outIdx++] = 0x80 | (u & 63);
      } else if (u <= 0xFFFF) {
        if (outIdx + 2 >= endIdx) break;
        heap[outIdx++] = 0xE0 | (u >> 12);
        heap[outIdx++] = 0x80 | ((u >> 6) & 63);
        heap[outIdx++] = 0x80 | (u & 63);
      } else {
        if (outIdx + 3 >= endIdx) break;
        if (u > 0x10FFFF) warnOnce(`Invalid Unicode code point ${ptrToString(u)} encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).`);
        heap[outIdx++] = 0xF0 | (u >> 18);
        heap[outIdx++] = 0x80 | ((u >> 12) & 63);
        heap[outIdx++] = 0x80 | ((u >> 6) & 63);
        heap[outIdx++] = 0x80 | (u & 63);
        // Gotcha: if codePoint is over 0xFFFF, it is represented as a surrogate pair in UTF-16.
        // We need to manually skip over the second code unit for correct iteration.
        i++;
      }
    }
    // Null-terminate the pointer to the buffer.
    heap[outIdx] = 0;
    return outIdx - startIdx;
  };
/** @type {function(string, boolean=, number=)} */
  var intArrayFromString = (stringy, dontAddNull, length) => {
      var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
      var u8array = new Array(len);
      var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
      if (dontAddNull) u8array.length = numBytesWritten;
      return u8array;
    };
  var FS_stdin_getChar = () => {
      if (!FS_stdin_getChar_buffer.length) {
        var result = null;
        if (ENVIRONMENT_IS_NODE) {
          // we will read data by chunks of BUFSIZE
          var BUFSIZE = 256;
          var buf = Buffer.alloc(BUFSIZE);
          var bytesRead = 0;
  
          // For some reason we must suppress a closure warning here, even though
          // fd definitely exists on process.stdin, and is even the proper way to
          // get the fd of stdin,
          // https://github.com/nodejs/help/issues/2136#issuecomment-523649904
          // This started to happen after moving this logic out of library_tty.js,
          // so it is related to the surrounding code in some unclear manner.
          /** @suppress {missingProperties} */
          var fd = process.stdin.fd;
  
          try {
            bytesRead = fs.readSync(fd, buf, 0, BUFSIZE);
          } catch(e) {
            // Cross-platform differences: on Windows, reading EOF throws an
            // exception, but on other OSes, reading EOF returns 0. Uniformize
            // behavior by treating the EOF exception to return 0.
            if (e.toString().includes('EOF')) bytesRead = 0;
            else throw e;
          }
  
          if (bytesRead > 0) {
            result = buf.slice(0, bytesRead).toString('utf-8');
          }
        } else
        if (globalThis.window?.prompt) {
          // Browser.
          result = window.prompt('Input: ');  // returns null on cancel
          if (result !== null) {
            result += '\n';
          }
        } else
        {}
        if (!result) {
          return null;
        }
        FS_stdin_getChar_buffer = intArrayFromString(result, true);
      }
      return FS_stdin_getChar_buffer.shift();
    };
  var TTY = {
  ttys:[],
  init() {
        // https://github.com/emscripten-core/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
        //   // device, it always assumes it's a TTY device. because of this, we're forcing
        //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
        //   // with text files until FS.init can be refactored.
        //   process.stdin.setEncoding('utf8');
        // }
      },
  shutdown() {
        // https://github.com/emscripten-core/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
        //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
        //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
        //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
        //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
        //   process.stdin.pause();
        // }
      },
  register(dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },
  stream_ops:{
  open(stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(43);
          }
          stream.tty = tty;
          stream.seekable = false;
        },
  close(stream) {
          // flush any pending line data
          stream.tty.ops.fsync(stream.tty);
        },
  fsync(stream) {
          stream.tty.ops.fsync(stream.tty);
        },
  read(stream, buffer, offset, length, pos /* ignored */) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(60);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(29);
            }
            if (result === undefined && !bytesRead) {
              throw new FS.ErrnoError(6);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset+i] = result;
          }
          if (bytesRead) {
            stream.node.atime = Date.now();
          }
          return bytesRead;
        },
  write(stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(60);
          }
          try {
            for (var i = 0; i < length; i++) {
              stream.tty.ops.put_char(stream.tty, buffer[offset+i]);
            }
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
          if (length) {
            stream.node.mtime = stream.node.ctime = Date.now();
          }
          return i;
        },
  },
  default_tty_ops:{
  get_char(tty) {
          return FS_stdin_getChar();
        },
  put_char(tty, val) {
          if (val === null || val === 10) {
            out(UTF8ArrayToString(tty.output));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
          }
        },
  fsync(tty) {
          if (tty.output?.length > 0) {
            out(UTF8ArrayToString(tty.output));
            tty.output = [];
          }
        },
  ioctl_tcgets(tty) {
          // typical setting
          return {
            c_iflag: 25856,
            c_oflag: 5,
            c_cflag: 191,
            c_lflag: 35387,
            c_cc: [
              0x03, 0x1c, 0x7f, 0x15, 0x04, 0x00, 0x01, 0x00, 0x11, 0x13, 0x1a, 0x00,
              0x12, 0x0f, 0x17, 0x16, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
              0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            ]
          };
        },
  ioctl_tcsets(tty, optional_actions, data) {
          // currently just ignore
          return 0;
        },
  ioctl_tiocgwinsz(tty) {
          return [24, 80];
        },
  },
  default_tty1_ops:{
  put_char(tty, val) {
          if (val === null || val === 10) {
            err(UTF8ArrayToString(tty.output));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },
  fsync(tty) {
          if (tty.output?.length > 0) {
            err(UTF8ArrayToString(tty.output));
            tty.output = [];
          }
        },
  },
  };
  
  
  var zeroMemory = (ptr, size) => HEAPU8.fill(0, ptr, ptr + size);
  
  var alignMemory = (size, alignment) => {
      assert(alignment, 'alignment argument is required');
      return Math.ceil(size / alignment) * alignment;
    };
  var mmapAlloc = (size) => {
      size = alignMemory(size, 65536);
      var ptr = _emscripten_builtin_memalign(65536, size);
      if (ptr) zeroMemory(ptr, size);
      return ptr;
    };
  
  var MEMFS = {
  ops_table:null,
  mount(mount) {
        return MEMFS.createNode(null, '/', 16895, 0);
      },
  createNode(parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          // not supported
          throw new FS.ErrnoError(63);
        }
        MEMFS.ops_table ||= {
          dir: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              lookup: MEMFS.node_ops.lookup,
              mknod: MEMFS.node_ops.mknod,
              rename: MEMFS.node_ops.rename,
              unlink: MEMFS.node_ops.unlink,
              rmdir: MEMFS.node_ops.rmdir,
              readdir: MEMFS.node_ops.readdir,
              symlink: MEMFS.node_ops.symlink
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek
            }
          },
          file: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek,
              read: MEMFS.stream_ops.read,
              write: MEMFS.stream_ops.write,
              mmap: MEMFS.stream_ops.mmap,
              msync: MEMFS.stream_ops.msync
            }
          },
          link: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              readlink: MEMFS.node_ops.readlink
            },
            stream: {}
          },
          chrdev: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: FS.chrdev_stream_ops
          }
        };
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          // The actual number of bytes used in the typed array, as opposed to
          // contents.length which gives the whole capacity.
          node.usedBytes = 0;
          // The byte data of the file is stored in a typed array.
          // Note: typed arrays are not resizable like normal JS arrays are, so
          // there is a small penalty involved for appending file writes that
          // continuously grow a file similar to std::vector capacity vs used.
          node.contents = MEMFS.emptyFileContents ??= new Uint8Array(0);
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.atime = node.mtime = node.ctime = Date.now();
        // add the new node to the parent
        if (parent) {
          parent.contents[name] = node;
          parent.atime = parent.mtime = parent.ctime = node.atime;
        }
        return node;
      },
  getFileDataAsTypedArray(node) {
        assert(FS.isFile(node.mode), 'getFileDataAsTypedArray called on non-file');
        return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
      },
  expandFileStorage(node, newCapacity) {
        var prevCapacity = node.contents.length;
        if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
        // Don't expand strictly to the given requested limit if it's only a very
        // small increase, but instead geometrically grow capacity.
        // For small filesizes (<1MB), perform size*2 geometric increase, but for
        // large sizes, do a much more conservative size*1.125 increase to avoid
        // overshooting the allocation cap by a very large margin.
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) >>> 0);
        if (prevCapacity) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
        var oldContents = MEMFS.getFileDataAsTypedArray(node);
        node.contents = new Uint8Array(newCapacity); // Allocate new storage.
        node.contents.set(oldContents);
      },
  resizeFileStorage(node, newSize) {
        if (node.usedBytes == newSize) return;
        var oldContents = node.contents;
        node.contents = new Uint8Array(newSize); // Allocate new storage.
        node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
        node.usedBytes = newSize;
      },
  node_ops:{
  getattr(node) {
          var attr = {};
          // device numbers reuse inode numbers.
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.atime);
          attr.mtime = new Date(node.mtime);
          attr.ctime = new Date(node.ctime);
          // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
          //       but this is not required by the standard.
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },
  setattr(node, attr) {
          for (const key of ['mode', 'atime', 'mtime', 'ctime']) {
            if (attr[key] != null) {
              node[key] = attr[key];
            }
          }
          if (attr.size !== undefined) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },
  lookup(parent, name) {
          throw new FS.ErrnoError(44);
        },
  mknod(parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },
  rename(old_node, new_dir, new_name) {
          var new_node;
          try {
            new_node = FS.lookupNode(new_dir, new_name);
          } catch (e) {}
          if (new_node) {
            if (FS.isDir(old_node.mode)) {
              // if we're overwriting a directory at new_name, make sure it's empty.
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(55);
              }
            }
            FS.hashRemoveNode(new_node);
          }
          // do the internal rewiring
          delete old_node.parent.contents[old_node.name];
          new_dir.contents[new_name] = old_node;
          old_node.name = new_name;
          new_dir.ctime = new_dir.mtime = old_node.parent.ctime = old_node.parent.mtime = Date.now();
        },
  unlink(parent, name) {
          delete parent.contents[name];
          parent.ctime = parent.mtime = Date.now();
        },
  rmdir(parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(55);
          }
          delete parent.contents[name];
          parent.ctime = parent.mtime = Date.now();
        },
  readdir(node) {
          return ['.', '..', ...Object.keys(node.contents)];
        },
  symlink(parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 0o777 | 40960, 0);
          node.link = oldpath;
          return node;
        },
  readlink(node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(28);
          }
          return node.link;
        },
  },
  stream_ops:{
  read(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          assert(size >= 0);
          buffer.set(contents.subarray(position, position + size), offset);
          return size;
        },
  write(stream, buffer, offset, length, position, canOwn) {
          assert(buffer.subarray, 'FS.write expects a TypedArray');
          // If the buffer is located in main memory (HEAP), and if
          // memory can grow, we can't hold on to references of the
          // memory buffer, as they may get invalidated. That means we
          // need to copy its contents.
          if (buffer.buffer === HEAP8.buffer) {
            canOwn = false;
          }
  
          if (!length) return 0;
          var node = stream.node;
          node.mtime = node.ctime = Date.now();
  
          if (canOwn) {
            assert(!position, 'canOwn must imply no weird position inside the file');
            node.contents = buffer.subarray(offset, offset + length);
            node.usedBytes = length;
          } else if (!node.usedBytes && !position) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
            node.contents = buffer.slice(offset, offset + length);
            node.usedBytes = length;
          } else {
            MEMFS.expandFileStorage(node, position+length);
            // Use typed array write which is available.
            node.contents.set(buffer.subarray(offset, offset + length), position);
            node.usedBytes = Math.max(node.usedBytes, position + length);
          }
          return length;
        },
  llseek(stream, offset, whence) {
          var position = offset;
          if (whence === 1) {
            position += stream.position;
          } else if (whence === 2) {
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(28);
          }
          return position;
        },
  mmap(stream, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(43);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          // Only make a new copy when MAP_PRIVATE is specified.
          if (!(flags & 2) && contents.buffer === HEAP8.buffer) {
            // We can't emulate MAP_SHARED when the file is not backed by the
            // buffer we're mapping to (e.g. the HEAP buffer).
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            allocated = true;
            ptr = mmapAlloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(48);
            }
            if (contents) {
              // Try to avoid unnecessary slices.
              if (position > 0 || position + length < contents.length) {
                if (contents.subarray) {
                  contents = contents.subarray(position, position + length);
                } else {
                  contents = Array.prototype.slice.call(contents, position, position + length);
                }
              }
              HEAP8.set(contents, ptr);
            }
          }
          return { ptr, allocated };
        },
  msync(stream, buffer, offset, length, mmapFlags) {
          MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          // should we check if bytesWritten and length are the same?
          return 0;
        },
  },
  };
  
  var FS_modeStringToFlags = (str) => {
      if (typeof str != 'string') return str;
      var flagModes = {
        'r': 0,
        'r+': 2,
        'w': 512 | 64 | 1,
        'w+': 512 | 64 | 2,
        'a': 1024 | 64 | 1,
        'a+': 1024 | 64 | 2,
      };
      var flags = flagModes[str];
      if (typeof flags == 'undefined') {
        throw new Error(`Unknown file open mode: ${str}`);
      }
      return flags;
    };
  
  var FS_fileDataToTypedArray = (data) => {
      if (typeof data == 'string') {
        data = intArrayFromString(data, true);
      }
      if (!data.subarray) {
        data = new Uint8Array(data);
      }
      return data;
    };
  
  var FS_getMode = (canRead, canWrite) => {
      var mode = 0;
      if (canRead) mode |= 292 | 73;
      if (canWrite) mode |= 146;
      return mode;
    };
  
  
  
  
  var strError = (errno) => UTF8ToString(_strerror(errno));
  
  var ERRNO_CODES = {
      'EPERM': 63,
      'ENOENT': 44,
      'ESRCH': 71,
      'EINTR': 27,
      'EIO': 29,
      'ENXIO': 60,
      'E2BIG': 1,
      'ENOEXEC': 45,
      'EBADF': 8,
      'ECHILD': 12,
      'EAGAIN': 6,
      'EWOULDBLOCK': 6,
      'ENOMEM': 48,
      'EACCES': 2,
      'EFAULT': 21,
      'ENOTBLK': 105,
      'EBUSY': 10,
      'EEXIST': 20,
      'EXDEV': 75,
      'ENODEV': 43,
      'ENOTDIR': 54,
      'EISDIR': 31,
      'EINVAL': 28,
      'ENFILE': 41,
      'EMFILE': 33,
      'ENOTTY': 59,
      'ETXTBSY': 74,
      'EFBIG': 22,
      'ENOSPC': 51,
      'ESPIPE': 70,
      'EROFS': 69,
      'EMLINK': 34,
      'EPIPE': 64,
      'EDOM': 18,
      'ERANGE': 68,
      'ENOMSG': 49,
      'EIDRM': 24,
      'ECHRNG': 106,
      'EL2NSYNC': 156,
      'EL3HLT': 107,
      'EL3RST': 108,
      'ELNRNG': 109,
      'EUNATCH': 110,
      'ENOCSI': 111,
      'EL2HLT': 112,
      'EDEADLK': 16,
      'ENOLCK': 46,
      'EBADE': 113,
      'EBADR': 114,
      'EXFULL': 115,
      'ENOANO': 104,
      'EBADRQC': 103,
      'EBADSLT': 102,
      'EDEADLOCK': 16,
      'EBFONT': 101,
      'ENOSTR': 100,
      'ENODATA': 116,
      'ETIME': 117,
      'ENOSR': 118,
      'ENONET': 119,
      'ENOPKG': 120,
      'EREMOTE': 121,
      'ENOLINK': 47,
      'EADV': 122,
      'ESRMNT': 123,
      'ECOMM': 124,
      'EPROTO': 65,
      'EMULTIHOP': 36,
      'EDOTDOT': 125,
      'EBADMSG': 9,
      'ENOTUNIQ': 126,
      'EBADFD': 127,
      'EREMCHG': 128,
      'ELIBACC': 129,
      'ELIBBAD': 130,
      'ELIBSCN': 131,
      'ELIBMAX': 132,
      'ELIBEXEC': 133,
      'ENOSYS': 52,
      'ENOTEMPTY': 55,
      'ENAMETOOLONG': 37,
      'ELOOP': 32,
      'EOPNOTSUPP': 138,
      'EPFNOSUPPORT': 139,
      'ECONNRESET': 15,
      'ENOBUFS': 42,
      'EAFNOSUPPORT': 5,
      'EPROTOTYPE': 67,
      'ENOTSOCK': 57,
      'ENOPROTOOPT': 50,
      'ESHUTDOWN': 140,
      'ECONNREFUSED': 14,
      'EADDRINUSE': 3,
      'ECONNABORTED': 13,
      'ENETUNREACH': 40,
      'ENETDOWN': 38,
      'ETIMEDOUT': 73,
      'EHOSTDOWN': 142,
      'EHOSTUNREACH': 23,
      'EINPROGRESS': 26,
      'EALREADY': 7,
      'EDESTADDRREQ': 17,
      'EMSGSIZE': 35,
      'EPROTONOSUPPORT': 66,
      'ESOCKTNOSUPPORT': 137,
      'EADDRNOTAVAIL': 4,
      'ENETRESET': 39,
      'EISCONN': 30,
      'ENOTCONN': 53,
      'ETOOMANYREFS': 141,
      'EUSERS': 136,
      'EDQUOT': 19,
      'ESTALE': 72,
      'ENOTSUP': 138,
      'ENOMEDIUM': 148,
      'EILSEQ': 25,
      'EOVERFLOW': 61,
      'ECANCELED': 11,
      'ENOTRECOVERABLE': 56,
      'EOWNERDEAD': 62,
      'ESTRPIPE': 135,
    };
  
  var asyncLoad = async (url) => {
      var arrayBuffer = await readAsync(url);
      assert(arrayBuffer, `Loading data file "${url}" failed (no arrayBuffer).`);
      return new Uint8Array(arrayBuffer);
    };
  
  
  var FS_createDataFile = (...args) => FS.createDataFile(...args);
  
  var getUniqueRunDependency = (id) => {
      var orig = id;
      while (1) {
        if (!runDependencyTracking[id]) return id;
        id = orig + Math.random();
      }
    };
  
  var dependenciesPromise = null;
  var resolveRunDependencies = async () => dependenciesPromise;
  var runDependencies = 0;
  
  
  var dependenciesPromiseResolve = null;
  
  var runDependencyTracking = {
  };
  
  var runDependencyWatcher = null;
  var removeRunDependency = (id) => {
      runDependencies--;
  
      Module['monitorRunDependencies']?.(runDependencies);
  
      assert(id, 'removeRunDependency requires an ID');
      assert(runDependencyTracking[id]);
      delete runDependencyTracking[id];
      if (!runDependencies) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
        }
        dependenciesPromiseResolve();
      }
    };
  
  
  
  
  var addRunDependency = (id) => {
      if (!runDependencies) {
        dependenciesPromise = new Promise((resolve) => dependenciesPromiseResolve = resolve);
      }
      runDependencies++;
  
      Module['monitorRunDependencies']?.(runDependencies);
  
      assert(id, 'addRunDependency requires an ID')
      assert(!runDependencyTracking[id]);
      runDependencyTracking[id] = 1;
      if (!runDependencyWatcher && globalThis.setInterval) {
        // Check for missing dependencies every few seconds
        runDependencyWatcher = setInterval(() => {
          if (ABORT) {
            clearInterval(runDependencyWatcher);
            runDependencyWatcher = null;
            return;
          }
          var shown = false;
          for (var dep in runDependencyTracking) {
            if (!shown) {
              shown = true;
              err('still waiting on run dependencies:');
            }
            err(`dependency: ${dep}`);
          }
          if (shown) {
            err('(end of list)');
          }
        }, 10000);
        // Prevent this timer from keeping the runtime alive if nothing
        // else is.
        runDependencyWatcher.unref?.()
      }
    };
  
  
  var preloadPlugins = [];
  var FS_handledByPreloadPlugin = async (byteArray, fullname) => {
      // Ensure plugins are ready.
      if (typeof Browser != 'undefined') Browser.init();
  
      for (var plugin of preloadPlugins) {
        if (plugin['canHandle'](fullname)) {
          assert(plugin['handle'].constructor.name === 'AsyncFunction', 'Filesystem plugin handlers must be async functions (See #24914)')
          return plugin['handle'](byteArray, fullname);
        }
      }
      // If no plugin handled this file then return the original/unmodified
      // byteArray.
      return byteArray;
    };
  var FS_preloadFile = async (parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish) => {
      // TODO we should allow people to just pass in a complete filename instead
      // of parent and name being that we just join them anyways
      var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
      var dep = getUniqueRunDependency(`cp ${fullname}`); // might have several active requests for the same fullname
      addRunDependency(dep);
  
      try {
        var byteArray = url;
        if (typeof url == 'string') {
          byteArray = await asyncLoad(url);
        }
  
        byteArray = await FS_handledByPreloadPlugin(byteArray, fullname);
        preFinish?.();
        if (!dontCreateFile) {
          FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
        }
      } finally {
        removeRunDependency(dep);
      }
    };
  var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
      FS_preloadFile(parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish).then(onload).catch(onerror);
    };
  
  var FS = {
  root:null,
  mounts:[],
  devices:{
  },
  streams:[],
  nextInode:1,
  nameTable:null,
  currentPath:"/",
  initialized:false,
  ignorePermissions:true,
  filesystems:null,
  syncFSRequests:0,
  ErrnoError:class extends Error {
        name = 'ErrnoError';
        // We set the `name` property to be able to identify `FS.ErrnoError`
        // - the `name` is a standard ECMA-262 property of error objects. Kind of good to have it anyway.
        // - when using PROXYFS, an error can come from an underlying FS
        // as different FS objects have their own FS.ErrnoError each,
        // the test `err instanceof FS.ErrnoError` won't detect an error coming from another filesystem, causing bugs.
        // we'll use the reliable test `err.name == "ErrnoError"` instead
        constructor(errno) {
          super(runtimeInitialized ? strError(errno) : '');
          this.errno = errno;
          for (var key in ERRNO_CODES) {
            if (ERRNO_CODES[key] === errno) {
              this.code = key;
              break;
            }
          }
        }
      },
  FSStream:class {
        shared = {};
        get object() {
          return this.node;
        }
        set object(val) {
          this.node = val;
        }
        get isRead() {
          return (this.flags & 2097155) !== 1;
        }
        get isWrite() {
          return (this.flags & 2097155) !== 0;
        }
        get isAppend() {
          return (this.flags & 1024);
        }
        get flags() {
          return this.shared.flags;
        }
        set flags(val) {
          this.shared.flags = val;
        }
        get position() {
          return this.shared.position;
        }
        set position(val) {
          this.shared.position = val;
        }
      },
  FSNode:class {
        node_ops = {};
        stream_ops = {};
        readMode = 292 | 73;
        writeMode = 146;
        mounted = null;
        constructor(parent, name, mode, rdev) {
          if (!parent) {
            parent = this;  // root node sets parent to itself
          }
          this.parent = parent;
          this.mount = parent.mount;
          this.id = FS.nextInode++;
          this.name = name;
          this.mode = mode;
          this.rdev = rdev;
          this.atime = this.mtime = this.ctime = Date.now();
        }
        get read() {
          return (this.mode & this.readMode) === this.readMode;
        }
        set read(val) {
          val ? this.mode |= this.readMode : this.mode &= ~this.readMode;
        }
        get write() {
          return (this.mode & this.writeMode) === this.writeMode;
        }
        set write(val) {
          val ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
        }
        get isFolder() {
          return FS.isDir(this.mode);
        }
        get isDevice() {
          return FS.isChrdev(this.mode);
        }
        // The per-inode readiness wait-queue. The node carries a Set of listener
        // entries {cb}; producers (SOCKFS, PIPEFS) call notifyListeners on a
        // readiness transition, and poll()/epoll consume it. It lives on the node
        // (not the fd) so dup'd fds share one queue. Only nodes that derive real
        // readiness (sockets, pipes, and an epoll's own node) ever use this -
        // always-ready types (regular files, ttys) never register or notify.
        addListener(cb, exclusive = false) {
          var entry = {cb, exclusive};
          var listeners = (this.listeners ??= new Set());
          listeners.add(entry);
          return {listeners, entry};
        }
        notifyListeners(flags) {
          // Iterates the set without copying, which is safe ONLY under a
          // load-bearing contract that every internal listener must honour:
          //   1. A listener must not run user code synchronously (a poll waiter only
          //      resolves a Promise; an epoll registration only re-lists +
          //      re-notifies; the epoll callback only schedules a tick). User code
          //      runs on a later tick, never inside this loop.
          //   2. A listener may delete entries only from ITS OWN waiter, never from
          //      a sibling node's set that may be mid-iteration. (Deleting an entry
          //      of the set being iterated here is fine - a Set tolerates removal of
          //      a not-yet-visited entry mid-iteration; mutating a *different* node's
          //      set is fine because that set is not being iterated.)
          // Violating either gives silently skipped wakeups that are near-impossible
          // to reproduce. Any new producer/listener must preserve it.
          if (!this.listeners) return;
          // Fire every non-exclusive listener. Among EPOLLEXCLUSIVE registrations
          // (one fd watched by several epolls) wake only one, rotating round-robin
          // per node, to avoid a thundering herd. (Only epoll registrations are ever
          // exclusive; poll waiters and a node's own consumers are not.)
          var excl;
          for (var entry of this.listeners) {
            if (entry.exclusive) (excl ||= []).push(entry);
            else entry.cb(flags);
          }
          if (excl) {
            var i = (this.exclTurn || 0) % excl.length;
            this.exclTurn = i + 1;
            excl[i].cb(flags);
          }
        }
      },
  lookupPath(path, opts = {}) {
        if (!path) {
          throw new FS.ErrnoError(44);
        }
        opts.follow_mount ??= true
  
        if (!PATH.isAbs(path)) {
          path = FS.cwd() + '/' + path;
        }
  
        // limit max consecutive symlinks to SYMLOOP_MAX.
        linkloop: for (var nlinks = 0; nlinks < 40; nlinks++) {
          // split the absolute path
          var parts = path.split('/').filter((p) => !!p);
  
          // start at the root
          var current = FS.root;
          var current_path = '/';
  
          for (var i = 0; i < parts.length; i++) {
            var islast = (i === parts.length-1);
            if (islast && opts.parent) {
              // stop resolving
              break;
            }
  
            if (parts[i] === '.') {
              continue;
            }
  
            if (parts[i] === '..') {
              current_path = PATH.dirname(current_path);
              if (FS.isRoot(current)) {
                path = current_path + '/' + parts.slice(i + 1).join('/');
                // We're making progress here, don't let many consecutive ..'s
                // lead to ELOOP
                nlinks--;
                continue linkloop;
              } else {
                current = current.parent;
              }
              continue;
            }
  
            current_path = PATH.join2(current_path, parts[i]);
            try {
              current = FS.lookupNode(current, parts[i]);
            } catch (e) {
              // if noent_okay is true, suppress a ENOENT in the last component
              // and return an object with an undefined node. This is needed for
              // resolving symlinks in the path when creating a file.
              if ((e?.errno === 44) && islast && opts.noent_okay) {
                return { path: current_path };
              }
              throw e;
            }
  
            // jump to the mount's root node if this is a mountpoint
            if (FS.isMountpoint(current) && (!islast || opts.follow_mount)) {
              current = current.mounted.root;
            }
  
            // by default, lookupPath will not follow a symlink if it is the final path component.
            // setting opts.follow = true will override this behavior.
            if (FS.isLink(current.mode) && (!islast || opts.follow)) {
              if (!current.node_ops.readlink) {
                throw new FS.ErrnoError(52);
              }
              var link = current.node_ops.readlink(current);
              if (!PATH.isAbs(link)) {
                link = PATH.dirname(current_path) + '/' + link;
              }
              path = link + '/' + parts.slice(i + 1).join('/');
              continue linkloop;
            }
          }
          return { path: current_path, node: current };
        }
        throw new FS.ErrnoError(32);
      },
  getPath(node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length-1] !== '/' ? `${mount}/${path}` : mount + path;
          }
          path = path ? `${node.name}/${path}` : node.name;
          node = node.parent;
        }
      },
  hashName(parentid, name) {
        var hash = 0;
  
        for (var i = 0; i < name.length; i++) {
          hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
      },
  hashAddNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },
  hashRemoveNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },
  lookupNode(parent, name) {
        var errCode = FS.mayLookup(parent);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        // if we failed to find it in the cache, call into the VFS
        return FS.lookup(parent, name);
      },
  createNode(parent, name, mode, rdev) {
        assert(typeof parent == 'object')
        var node = new FS.FSNode(parent, name, mode, rdev);
  
        FS.hashAddNode(node);
  
        return node;
      },
  destroyNode(node) {
        FS.hashRemoveNode(node);
      },
  isRoot(node) {
        return node === node.parent;
      },
  isMountpoint(node) {
        return !!node.mounted;
      },
  isFile(mode) {
        return (mode & 61440) === 32768;
      },
  isDir(mode) {
        return (mode & 61440) === 16384;
      },
  isLink(mode) {
        return (mode & 61440) === 40960;
      },
  isChrdev(mode) {
        return (mode & 61440) === 8192;
      },
  isBlkdev(mode) {
        return (mode & 61440) === 24576;
      },
  isFIFO(mode) {
        return (mode & 61440) === 4096;
      },
  isSocket(mode) {
        return (mode & 49152) === 49152;
      },
  flagsToPermissionString(flag) {
        var perms = ['r', 'w', 'rw'][flag & 3];
        if ((flag & 512)) {
          perms += 'w';
        }
        return perms;
      },
  nodePermissions(node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        // return 0 if any user, group or owner bits are set.
        if (perms.includes('r') && !(node.mode & 292)) {
          return 2;
        }
        if (perms.includes('w') && !(node.mode & 146)) {
          return 2;
        }
        if (perms.includes('x') && !(node.mode & 73)) {
          return 2;
        }
        return 0;
      },
  mayLookup(dir) {
        if (!FS.isDir(dir.mode)) return 54;
        var errCode = FS.nodePermissions(dir, 'x');
        if (errCode) return errCode;
        if (!dir.node_ops.lookup) return 2;
        return 0;
      },
  mayCreate(dir, name) {
        if (!FS.isDir(dir.mode)) {
          return 54;
        }
        try {
          var node = FS.lookupNode(dir, name);
          return 20;
        } catch (e) {
        }
        return FS.nodePermissions(dir, 'wx');
      },
  mayDelete(dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var errCode = FS.nodePermissions(dir, 'wx');
        if (errCode) {
          return errCode;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return 54;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return 10;
          }
        } else if (FS.isDir(node.mode)) {
          return 31;
        }
        return 0;
      },
  mayOpen(node, flags) {
        if (!node) {
          return 44;
        }
        if (FS.isLink(node.mode)) {
          return 32;
        }
        var mode = FS.flagsToPermissionString(flags);
        if (FS.isDir(node.mode)) {
          // opening for write
          // TODO: check for O_SEARCH? (== search for dir only)
          if (mode !== 'r' || (flags & (512 | 64))) {
            return 31;
          }
        }
        return FS.nodePermissions(node, mode);
      },
  checkOpExists(op, err) {
        if (!op) {
          throw new FS.ErrnoError(err);
        }
        return op;
      },
  MAX_OPEN_FDS:4096,
  nextfd() {
        for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(33);
      },
  getStreamChecked(fd) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(8);
        }
        return stream;
      },
  getStream:(fd) => FS.streams[fd],
  createStream(stream, fd = -1) {
        assert(fd >= -1);
  
        // clone it, so we can return an instance of FSStream
        stream = Object.assign(new FS.FSStream(), stream);
        if (fd == -1) {
          fd = FS.nextfd();
        }
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },
  closeStream(fd) {
        FS.streams[fd] = null;
      },
  dupStream(origStream, fd = -1) {
        var stream = FS.createStream(origStream, fd);
        stream.stream_ops?.dup?.(stream);
        return stream;
      },
  doSetAttr(stream, node, attr) {
        var setattr = stream?.stream_ops.setattr;
        var arg = setattr ? stream : node;
        setattr ??= node.node_ops.setattr;
        FS.checkOpExists(setattr, 63)
        try {
          setattr(arg, attr);
        } catch (e) {
          if (e instanceof RangeError) {
            throw new FS.ErrnoError(22);
          }
          throw e;
        }
      },
  chrdev_stream_ops:{
  open(stream) {
          var device = FS.getDevice(stream.node.rdev);
          // override node's stream ops with the device's
          stream.stream_ops = device.stream_ops;
          // forward the open call
          stream.stream_ops.open?.(stream);
        },
  llseek() {
          throw new FS.ErrnoError(70);
        },
  },
  major:(dev) => ((dev) >> 8),
  minor:(dev) => ((dev) & 0xff),
  makedev:(ma, mi) => ((ma) << 8 | (mi)),
  registerDevice(dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },
  getDevice:(dev) => FS.devices[dev],
  getMounts(mount) {
        var mounts = [];
        var check = [mount];
  
        while (check.length) {
          var m = check.pop();
  
          mounts.push(m);
  
          check.push(...m.mounts);
        }
  
        return mounts;
      },
  syncfs(populate, callback) {
        if (typeof populate == 'function') {
          callback = populate;
          populate = false;
        }
  
        FS.syncFSRequests++;
  
        if (FS.syncFSRequests > 1) {
          err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
        }
  
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
  
        function doCallback(errCode) {
          assert(FS.syncFSRequests > 0);
          FS.syncFSRequests--;
          return callback(errCode);
        }
  
        function done(errCode) {
          if (errCode) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(errCode);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        };
  
        // sync all mounts
        for (var mount of mounts) {
          if (mount.type.syncfs) {
            mount.type.syncfs(mount, populate, done);
          } else {
            done(null);
          }
        }
      },
  mount(type, opts, mountpoint) {
        if (typeof type == 'string') {
          // The filesystem was not included, and instead we have an error
          // message stored in the variable.
          throw type;
        }
        var root = mountpoint === '/';
        var pseudo = !mountpoint;
        var node;
  
        if (root && FS.root) {
          throw new FS.ErrnoError(10);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
          mountpoint = lookup.path;  // use the absolute path
          node = lookup.node;
  
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10);
          }
  
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(54);
          }
        }
  
        var mount = {
          type,
          opts,
          mountpoint,
          mounts: []
        };
  
        // create a root node for the fs
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
  
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          // set as a mountpoint
          node.mounted = mount;
  
          // add the new mount to the current mount's children
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
  
        return mountRoot;
      },
  unmount(mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(28);
        }
  
        // destroy the nodes for this mount, and all its child mounts
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
  
        for (var [hash, current] of Object.entries(FS.nameTable)) {
          while (current) {
            var next = current.name_next;
  
            if (mounts.includes(current.mount)) {
              FS.destroyNode(current);
            }
  
            current = next;
          }
        }
  
        // no longer a mountpoint
        node.mounted = null;
  
        // remove this mount from the child mounts
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
      },
  lookup(parent, name) {
        return parent.node_ops.lookup(parent, name);
      },
  mknod(path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name) {
          throw new FS.ErrnoError(28);
        }
        if (name === '.' || name === '..') {
          throw new FS.ErrnoError(20);
        }
        var errCode = FS.mayCreate(parent, name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },
  statfs(path) {
        return FS.statfsNode(FS.lookupPath(path, {follow: true}).node);
      },
  statfsStream(stream) {
        // We keep a separate statfsStream function because noderawfs overrides
        // it. In noderawfs, stream.node is sometimes null. Instead, we need to
        // look at stream.path.
        return FS.statfsNode(stream.node);
      },
  statfsNode(node) {
        // NOTE: None of the defaults here are true. We're just returning safe and
        //       sane values. Currently nodefs and rawfs replace these defaults,
        //       other file systems leave them alone.
        var rtn = {
          bsize: 4096,
          frsize: 4096,
          blocks: 1e6,
          bfree: 5e5,
          bavail: 5e5,
          files: FS.nextInode,
          ffree: FS.nextInode - 1,
          fsid: 42,
          flags: 2,
          namelen: 255,
        };
  
        if (node.node_ops.statfs) {
          Object.assign(rtn, node.node_ops.statfs(node.mount.opts.root));
        }
        return rtn;
      },
  create(path, mode = 0o666) {
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },
  mkdir(path, mode = 0o777) {
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },
  mkdirTree(path, mode) {
        var dirs = path.split('/');
        var d = '';
        for (var dir of dirs) {
          if (!dir) continue;
          if (d || PATH.isAbs(path)) d += '/';
          d += dir;
          try {
            FS.mkdir(d, mode);
          } catch(e) {
            if (e.errno != 20) throw e;
          }
        }
      },
  mkdev(path, mode, dev) {
        if (typeof dev == 'undefined') {
          dev = mode;
          mode = 0o666;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },
  symlink(oldpath, newpath) {
        if (!PATH_FS.resolve(oldpath)) {
          throw new FS.ErrnoError(44);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var newname = PATH.basename(newpath);
        var errCode = FS.mayCreate(parent, newname);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },
  link(oldpath, newpath, flags) {
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var newname = PATH.basename(newpath);
        var errCode = FS.mayCreate(parent, newname);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        // Hardlinks are only supported by filesystem backends that provide a
        // `link` node op (e.g. NODERAWFS backed by the host). NODEFS omits it:
        // a host hardlink cannot be confined to the mount root.
        if (!parent.node_ops.link) {
          throw new FS.ErrnoError(34);
        }
        return parent.node_ops.link(parent, newname, oldpath, flags);
      },
  rename(old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        // parents must exist
        var lookup, old_dir, new_dir;
  
        // let the errors from non existent directories percolate up
        lookup = FS.lookupPath(old_path, { parent: true });
        old_dir = lookup.node;
        lookup = FS.lookupPath(new_path, { parent: true });
        new_dir = lookup.node;
  
        if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
        // need to be part of the same mount
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(75);
        }
        // source must exist
        var old_node = FS.lookupNode(old_dir, old_name);
        // old path should not be an ancestor of the new path
        var relative = PATH_FS.relative(old_path, new_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(28);
        }
        // new path should not be an ancestor of the old path
        relative = PATH_FS.relative(new_path, old_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(55);
        }
        // see if the new path already exists
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
          // not fatal
        }
        // early out if nothing needs to change
        if (old_node === new_node) {
          return;
        }
        // we'll need to delete the old entry
        var isdir = FS.isDir(old_node.mode);
        var errCode = FS.mayDelete(old_dir, old_name, isdir);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        // need delete permissions if we'll be overwriting.
        // need create permissions if new doesn't already exist.
        errCode = new_node ?
          FS.mayDelete(new_dir, new_name, isdir) :
          FS.mayCreate(new_dir, new_name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
          throw new FS.ErrnoError(10);
        }
        // if we are going to change the parent, check write permissions
        if (new_dir !== old_dir) {
          errCode = FS.nodePermissions(old_dir, 'w');
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        // remove the node from the lookup hash
        FS.hashRemoveNode(old_node);
        // do the underlying fs rename
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
          // update old node (we do this here to avoid each backend
          // needing to)
          old_node.parent = new_dir;
        } catch (e) {
          throw e;
        } finally {
          // add the node back to the hash (in case node_ops.rename
          // changed its name)
          FS.hashAddNode(old_node);
        }
      },
  rmdir(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, true);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
      },
  readdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        var readdir = FS.checkOpExists(node.node_ops.readdir, 54);
        return readdir(node);
      },
  unlink(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, false);
        if (errCode) {
          // According to POSIX, we should map EISDIR to EPERM, but
          // we instead do what Linux does (and we must, as we use
          // the musl linux libc).
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
      },
  readlink(path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(44);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(28);
        }
        return link.node_ops.readlink(link);
      },
  stat(path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        var getattr = FS.checkOpExists(node.node_ops.getattr, 63);
        return getattr(node);
      },
  fstat(fd) {
        var stream = FS.getStreamChecked(fd);
        var node = stream.node;
        var getattr = stream.stream_ops.getattr;
        var arg = getattr ? stream : node;
        getattr ??= node.node_ops.getattr;
        FS.checkOpExists(getattr, 63)
        return getattr(arg);
      },
  lstat(path) {
        return FS.stat(path, true);
      },
  doChmod(stream, node, mode, dontFollow) {
        FS.doSetAttr(stream, node, {
          mode: (mode & 4095) | (node.mode & ~4095),
          ctime: Date.now(),
          dontFollow
        });
      },
  chmod(path, mode, dontFollow) {
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        FS.doChmod(null, node, mode, dontFollow);
      },
  lchmod(path, mode) {
        FS.chmod(path, mode, true);
      },
  fchmod(fd, mode) {
        var stream = FS.getStreamChecked(fd);
        FS.doChmod(stream, stream.node, mode, false);
      },
  doChown(stream, node, dontFollow) {
        FS.doSetAttr(stream, node, {
          timestamp: Date.now(),
          dontFollow
          // we ignore the uid / gid for now
        });
      },
  chown(path, uid, gid, dontFollow) {
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        FS.doChown(null, node, dontFollow);
      },
  lchown(path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },
  fchown(fd, uid, gid) {
        var stream = FS.getStreamChecked(fd);
        FS.doChown(stream, stream.node, false);
      },
  doTruncate(stream, node, len) {
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(28);
        }
        var errCode = FS.nodePermissions(node, 'w');
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        FS.doSetAttr(stream, node, {
          size: len,
          timestamp: Date.now()
        });
      },
  truncate(path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(28);
        }
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        FS.doTruncate(null, node, len);
      },
  ftruncate(fd, len) {
        var stream = FS.getStreamChecked(fd);
        if (len < 0 || (stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(28);
        }
        FS.doTruncate(stream, stream.node, len);
      },
  utime(path, atime, mtime, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        FS.doSetAttr(null, lookup.node, {
          atime: atime,
          mtime: mtime,
          dontFollow
        });
      },
  open(path, flags, mode = 0o666) {
        if (path === '') {
          throw new FS.ErrnoError(44);
        }
        flags = FS_modeStringToFlags(flags);
        if ((flags & 64)) {
          mode = (mode & 4095) | 32768;
        } else {
          mode = 0;
        }
        var node;
        var isDirPath;
        if (typeof path == 'object') {
          node = path;
        } else {
          isDirPath = path.endsWith('/');
          // noent_okay makes it so that if the final component of the path
          // doesn't exist, lookupPath returns `node: undefined`. `path` will be
          // updated to point to the target of all symlinks.
          var lookup = FS.lookupPath(path, {
            follow: !(flags & 131072),
            noent_okay: true
          });
          node = lookup.node;
          path = lookup.path;
        }
        // perhaps we need to create the node
        var created = false;
        if ((flags & 64)) {
          if (node) {
            // if O_CREAT and O_EXCL are set, error out if the node already exists
            if ((flags & 128)) {
              throw new FS.ErrnoError(20);
            }
          } else if (isDirPath) {
            throw new FS.ErrnoError(31);
          } else {
            // node doesn't exist, try to create it
            // Ignore the permission bits here to ensure we can `open` this new
            // file below. We use chmod below to apply the permissions once the
            // file is open.
            node = FS.mknod(path, mode | 0o777, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(44);
        }
        // can't truncate a device
        if (FS.isChrdev(node.mode)) {
          flags &= ~512;
        }
        // if asked only for a directory, then this must be one
        if ((flags & 65536) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(54);
        }
        // check permissions, if this is not a file we just created now (it is ok to
        // create and write to a file with read-only permissions; it is read-only
        // for later use)
        if (!created) {
          var errCode = FS.mayOpen(node, flags);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        // do truncation if necessary
        if ((flags & 512) && !created) {
          FS.truncate(node, 0);
        }
        // we've already handled these, don't pass down to the underlying vfs
        flags &= ~(128 | 512 | 131072);
  
        // register the stream with the filesystem
        var stream = FS.createStream({
          node,
          path: FS.getPath(node),  // we want the absolute path to the node
          flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          // used by the file family libc calls (fopen, fwrite, ferror, etc.)
          ungotten: [],
          error: false
        });
        // call the new stream's open function
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (created) {
          FS.chmod(node, mode & 0o777);
        }
        return stream;
      },
  close(stream) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (stream.getdents) stream.getdents = null; // free readdir state
        // The fd is going away: wake anything waiting on it (poll/epoll) with
        // POLLNVAL so a blocking wait unblocks and an epoll registration is evicted
        // on its next derive. Only sockets/pipes/epoll ever carry a wait-queue, so
        // for every other stream (incl. nodeless noderawfs stdio) this is a no-op.
        stream.node?.notifyListeners(32);
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
        stream.fd = null;
      },
  isClosed(stream) {
        return stream.fd === null;
      },
  llseek(stream, offset, whence) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(70);
        }
        if (whence != 0 && whence != 1 && whence != 2) {
          throw new FS.ErrnoError(28);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },
  read(stream, buffer, offset, length, position) {
        assert(offset >= 0);
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(28);
        }
        var seeking = typeof position != 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },
  write(stream, buffer, offset, length, position, canOwn) {
        assert(offset >= 0);
        assert(buffer.subarray, 'FS.write expects a TypedArray');
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(28);
        }
        if (stream.seekable && stream.flags & 1024) {
          // seek to the end before writing in append mode
          FS.llseek(stream, 0, 2);
        }
        var seeking = typeof position != 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        return bytesWritten;
      },
  mmap(stream, length, position, prot, flags) {
        // User requests writing to file (prot & PROT_WRITE != 0).
        // Checking if we have permissions to write to the file unless
        // MAP_PRIVATE flag is set. According to POSIX spec it is possible
        // to write to file opened in read-only mode with MAP_PRIVATE flag,
        // as all modifications will be visible only in the memory of
        // the current process.
        if ((prot & 2)
            && !(flags & 2)
            && (stream.flags & 2097155) !== 2) {
          throw new FS.ErrnoError(2);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(2);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(43);
        }
        if (!length) {
          throw new FS.ErrnoError(28);
        }
        return stream.stream_ops.mmap(stream, length, position, prot, flags);
      },
  msync(stream, buffer, offset, length, mmapFlags) {
        assert(offset >= 0);
        if (!stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
      },
  ioctl(stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(59);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },
  readFile(path, opts = {}) {
        opts.flags = opts.flags ?? 0;
        opts.encoding = opts.encoding ?? 'binary';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          abort(`Invalid encoding type "${opts.encoding}"`);
        }
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === 'utf8') {
          buf = UTF8ArrayToString(buf);
        }
        FS.close(stream);
        return buf;
      },
  writeFile(path, data, opts = {}) {
        opts.flags = opts.flags ?? 577;
        var stream = FS.open(path, opts.flags, opts.mode);
        data = FS_fileDataToTypedArray(data);
        FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
        FS.close(stream);
      },
  cwd:() => FS.currentPath,
  chdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
          throw new FS.ErrnoError(44);
        }
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(54);
        }
        var errCode = FS.nodePermissions(lookup.node, 'x');
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        FS.currentPath = lookup.path;
      },
  createDefaultDirectories() {
        FS.mkdir('/tmp');
        FS.mkdir('/home');
        FS.mkdir('/home/web_user');
      },
  createDefaultDevices() {
        // create /dev
        FS.mkdir('/dev');
        // setup /dev/null
        FS.registerDevice(FS.makedev(1, 3), {
          read: () => 0,
          write: (stream, buffer, offset, length, pos) => length,
          llseek: () => 0,
        });
        FS.mkdev('/dev/null', FS.makedev(1, 3));
        // setup /dev/tty and /dev/tty1
        // stderr needs to print output using err() rather than out()
        // so we register a second tty just for it.
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev('/dev/tty', FS.makedev(5, 0));
        FS.mkdev('/dev/tty1', FS.makedev(6, 0));
        // setup /dev/[u]random
        // use a buffer to avoid overhead of individual crypto calls per byte
        var randomBuffer = new Uint8Array(1024), randomLeft = 0;
        var randomByte = () => {
          if (!randomLeft) {
            randomFill(randomBuffer);
            randomLeft = randomBuffer.byteLength;
          }
          return randomBuffer[--randomLeft];
        };
        FS.createDevice('/dev', 'random', randomByte);
        FS.createDevice('/dev', 'urandom', randomByte);
        // we're not going to emulate the actual shm device,
        // just create the tmp dirs that reside in it commonly
        FS.mkdir('/dev/shm');
        FS.mkdir('/dev/shm/tmp');
      },
  createSpecialDirectories() {
        // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the
        // name of the stream for fd 6 (see test_unistd_ttyname)
        FS.mkdir('/proc');
        var proc_self = FS.mkdir('/proc/self');
        FS.mkdir('/proc/self/fd');
        FS.mount({
          mount() {
            var node = FS.createNode(proc_self, 'fd', 16895, 73);
            node.stream_ops = {
              llseek: MEMFS.stream_ops.llseek,
            };
            node.node_ops = {
              lookup(parent, name) {
                var fd = +name;
                var stream = FS.getStreamChecked(fd);
                var ret = {
                  parent: null,
                  mount: { mountpoint: 'fake' },
                  node_ops: { readlink: () => stream.path },
                  id: fd + 1,
                };
                ret.parent = ret; // make it look like a simple root node
                return ret;
              },
              readdir() {
                return Array.from(FS.streams.entries())
                  .filter(([k, v]) => v)
                  .map(([k, v]) => k.toString());
              }
            };
            return node;
          }
        }, {}, '/proc/self/fd');
      },
  createStandardStreams(input, output, error) {
        // TODO deprecate the old functionality of a single
        // input / output callback and that utilizes FS.createDevice
        // and instead require a unique set of stream ops
  
        // by default, we symlink the standard streams to the
        // default tty devices. however, if the standard streams
        // have been overwritten we create a unique device for
        // them instead.
        if (input) {
          FS.createDevice('/dev', 'stdin', input);
        } else {
          FS.symlink('/dev/tty', '/dev/stdin');
        }
        if (output) {
          FS.createDevice('/dev', 'stdout', null, output);
        } else {
          FS.symlink('/dev/tty', '/dev/stdout');
        }
        if (error) {
          FS.createDevice('/dev', 'stderr', null, error);
        } else {
          FS.symlink('/dev/tty1', '/dev/stderr');
        }
  
        // open default streams for the stdin, stdout and stderr devices
        var stdin = FS.open('/dev/stdin', 0);
        var stdout = FS.open('/dev/stdout', 1);
        var stderr = FS.open('/dev/stderr', 1);
        assert(stdin.fd === 0, `invalid handle for stdin (${stdin.fd})`);
        assert(stdout.fd === 1, `invalid handle for stdout (${stdout.fd})`);
        assert(stderr.fd === 2, `invalid handle for stderr (${stderr.fd})`);
      },
  staticInit() {
        FS.nameTable = new Array(4096);
  
        FS.mount(MEMFS, {}, '/');
  
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
  
        FS.filesystems = {
          'MEMFS': MEMFS,
        };
      },
  init(input, output, error) {
        assert(!FS.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
        FS.initialized = true;
  
        // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
        input ??= Module['stdin'];
        output ??= Module['stdout'];
        error ??= Module['stderr'];
  
        FS.createStandardStreams(input, output, error);
      },
  quit() {
        FS.initialized = false;
        // force-flush all streams, so we get musl std streams printed out
        _fflush(0);
        // close all of our streams
        for (var stream of FS.streams) {
          if (stream) {
            FS.close(stream);
          }
        }
      },
  findObject(path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (!ret.exists) {
          return null;
        }
        return ret.object;
      },
  analyzePath(path, dontResolveLastLink) {
        // operate from within the context of the symlink's target
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {
        }
        var ret = {
          isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
          parentExists: false, parentPath: null, parentObject: null
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === '/';
        } catch (e) {
          ret.error = e.errno;
        };
        return ret;
      },
  createPath(parent, path, canRead, canWrite) {
        parent = typeof parent == 'string' ? parent : FS.getPath(parent);
        var parts = path.split('/').reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {
            if (e.errno != 20) throw e;
          }
          parent = current;
        }
        return current;
      },
  createFile(parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(canRead, canWrite);
        return FS.create(path, mode);
      },
  createDataFile(parent, name, data, canRead, canWrite, canOwn) {
        var path = name;
        if (parent) {
          parent = typeof parent == 'string' ? parent : FS.getPath(parent);
          path = name ? PATH.join2(parent, name) : parent;
        }
        var mode = FS_getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          data = FS_fileDataToTypedArray(data);
          // make sure we can write to the file
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 577);
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
      },
  createDevice(parent, name, input, output) {
        var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(!!input, !!output);
        FS.createDevice.major ??= 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        // Create a fake device that a set of stream ops to emulate
        // the old behavior.
        FS.registerDevice(dev, {
          open(stream) {
            stream.seekable = false;
          },
          close(stream) {
            // flush any pending line data
            if (output?.buffer?.length) {
              output(10);
            }
          },
          read(stream, buffer, offset, length, pos /* ignored */) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
              if (result === undefined && !bytesRead) {
                throw new FS.ErrnoError(6);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset+i] = result;
            }
            if (bytesRead) {
              stream.node.atime = Date.now();
            }
            return bytesRead;
          },
          write(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset+i]);
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
            }
            if (length) {
              stream.node.mtime = stream.node.ctime = Date.now();
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },
  forceLoadFile(obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        if (globalThis.XMLHttpRequest) {
          abort('Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.');
        } else { // Command-line.
          try {
            obj.contents = readBinary(obj.url);
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
        }
      },
  createLazyFile(parent, name, url, canRead, canWrite) {
        // Lazy chunked Uint8Array (implements get and length from Uint8Array).
        // Actual getting is abstracted away for eventual reuse.
        class LazyUint8Array {
          lengthKnown = false;
          chunks = []; // Loaded chunks. Index is the chunk number
          get(idx) {
            if (idx > this.length-1 || idx < 0) {
              return undefined;
            }
            var chunkOffset = idx % this.chunkSize;
            var chunkNum = (idx / this.chunkSize)|0;
            return this.getter(chunkNum)[chunkOffset];
          }
          setDataGetter(getter) {
            this.getter = getter;
          }
          cacheLength() {
            // Find length
            var xhr = new XMLHttpRequest();
            xhr.open('HEAD', url, false);
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) abort(`Couldn't load ${url}. Status: ${xhr.status}`);
            var datalength = Number(xhr.getResponseHeader('Content-length'));
            var header;
            var hasByteServing = (header = xhr.getResponseHeader('Accept-Ranges')) && header === 'bytes';
            var usesGzip = (header = xhr.getResponseHeader('Content-Encoding')) && header === 'gzip';
  
            var chunkSize = 1024*1024; // Chunk size in bytes
  
            if (!hasByteServing) chunkSize = datalength;
  
            // Function to get a range from the remote URL.
            var doXHR = (from, to) => {
              if (from > to) abort(`invalid range (${from}, ${to}) or no bytes requested!`);
              if (to > datalength-1) abort(`only ${datalength} bytes available! programmer error!`);
  
              // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
              var xhr = new XMLHttpRequest();
              xhr.open('GET', url, false);
              if (datalength !== chunkSize) xhr.setRequestHeader('Range', `bytes=${from}-${to}`);
  
              // Some hints to the browser that we want binary data.
              xhr.responseType = 'arraybuffer';
              if (xhr.overrideMimeType) {
                xhr.overrideMimeType('text/plain; charset=x-user-defined');
              }
  
              xhr.send(null);
              if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) abort(`Couldn't load ${url}. Status: ${xhr.status}`);
              if (xhr.response !== undefined) {
                return new Uint8Array(/** @type{Array<number>} */(xhr.response || []));
              }
              return intArrayFromString(xhr.responseText ?? '', true);
            };
            var lazyArray = this;
            lazyArray.setDataGetter((chunkNum) => {
              var start = chunkNum * chunkSize;
              var end = (chunkNum+1) * chunkSize - 1; // including this byte
              end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
              if (typeof lazyArray.chunks[chunkNum] == 'undefined') {
                lazyArray.chunks[chunkNum] = doXHR(start, end);
              }
              if (typeof lazyArray.chunks[chunkNum] == 'undefined') abort('doXHR failed!');
              return lazyArray.chunks[chunkNum];
            });
  
            if (usesGzip || !datalength) {
              // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
              chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
              datalength = this.getter(0).length;
              chunkSize = datalength;
              out('LazyFiles on gzip forces download of the whole file when length is accessed');
            }
  
            this._length = datalength;
            this._chunkSize = chunkSize;
            this.lengthKnown = true;
          }
          get length() {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._length;
          }
          get chunkSize() {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._chunkSize;
          }
        }
  
        if (globalThis.XMLHttpRequest) {
          if (!ENVIRONMENT_IS_WORKER) abort('Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc');
          var lazyArray = new LazyUint8Array();
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
  
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        // This is a total hack, but I want to get this lazy file code out of the
        // core of MEMFS. If we want to keep this lazy file concept I feel it should
        // be its own thin LAZYFS proxying calls to MEMFS.
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        // Add a function that defers querying the file size until it is asked the first time.
        Object.defineProperties(node, {
          usedBytes: {
            get: function() { return this.contents.length; }
          }
        });
        // override each stream op with one that tries to force load the lazy file first
        var stream_ops = {};
        for (const [key, fn] of Object.entries(node.stream_ops)) {
          stream_ops[key] = (...args) => {
            FS.forceLoadFile(node);
            return fn(...args);
          };
        }
        function writeChunks(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= contents.length)
            return 0;
          var size = Math.min(contents.length - position, length);
          assert(size >= 0);
          if (contents.slice) { // normal array
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        }
        // use a custom read function
        stream_ops.read = (stream, buffer, offset, length, position) => {
          FS.forceLoadFile(node);
          return writeChunks(stream, buffer, offset, length, position)
        };
        // use a custom mmap function
        stream_ops.mmap = (stream, length, position, prot, flags) => {
          FS.forceLoadFile(node);
          var ptr = mmapAlloc(length);
          if (!ptr) {
            throw new FS.ErrnoError(48);
          }
          writeChunks(stream, HEAP8, ptr, length, position);
          return { ptr, allocated: true };
        };
        node.stream_ops = stream_ops;
        return node;
      },
  };
  
  var SOCKFS = {
  websocketArgs:{
  },
  callbacks:{
  },
  on(event, callback) {
        SOCKFS.callbacks[event] = callback;
      },
  emit(event, param) {
        SOCKFS.callbacks[event]?.(param);
        // Bridge socket readiness into the inode wait-queue (poll/epoll). The
        // 'error' event carries [fd, ...]; the rest carry the fd directly.
        var fd = event === 'error' ? param[0] : param;
        var flags = {
          'message':    64 | 1,
          'open':       4,
          'connection': 64 | 1,
          'close':      1 | 16,
          'error':      8,
        }[event];
        // 'listen' has no readiness mapping; skip it.
        if (flags) FS.getStream(fd)?.node.notifyListeners(flags);
      },
  mount(mount) {
        // The incoming Module['websocket'] can be used for configuring 
        // subprotocol/url, etc
        SOCKFS.websocketArgs = Module['websocket'] || {};
        // Add the Event registration mechanism to the exported websocket configuration
        // object so we can register network callbacks from native JavaScript too.
        // For more documentation see system/include/emscripten/emscripten.h
        (Module['websocket'] ??= {})['on'] = SOCKFS.on;
  
        return FS.createNode(null, '/', 16895, 0);
      },
  createSocket(family, type, protocol) {
        if (family != 2
           ) {
          throw new FS.ErrnoError(5);
        }
        type &= ~526336; // Some applications may pass it; it makes no sense for a single process.
        // Emscripten only supports SOCK_STREAM and SOCK_DGRAM
        if (type != 1 && type != 2) {
          throw new FS.ErrnoError(28);
        }
        var streaming = type == 1;
        // The IPPROTO_TCP protocol guard only applies to INET stream sockets; unix
        // stream sockets use protocol 0.
        if (streaming && protocol && protocol != 6
           ) {
          throw new FS.ErrnoError(66); // if SOCK_STREAM, must be tcp or 0.
        }
  
        // create our internal socket structure
        var sock = {
          family,
          type,
          protocol,
          server: null,
          error: null, // Used in getsockopt for SOL_SOCKET/SO_ERROR test
          peers: {},
          pending: [],
          recv_queue: [],
          sock_ops: SOCKFS.websocket_sock_ops
        };
  
        // create the filesystem node to store the socket structure
        var name = SOCKFS.nextname();
        var node = FS.createNode(SOCKFS.root, name, 49152, 0);
        node.sock = sock;
  
        // and the wrapping stream that enables library functions such
        // as read and write to indirectly interact with the socket
        var stream = FS.createStream({
          path: name,
          node,
          flags: 2,
          seekable: false,
          stream_ops: SOCKFS.stream_ops
        });
  
        // map the new stream to the socket structure (sockets have a 1:1
        // relationship with a stream)
        sock.stream = stream;
  
        return sock;
      },
  getSocket(fd) {
        var stream = FS.getStream(fd);
        if (!stream || !FS.isSocket(stream.node.mode)) {
          return null;
        }
        return stream.node.sock;
      },
  stream_ops:{
  getattr(stream) {
          var node = stream.node;
          return {
            dev: 1,
            ino: node.id,
            mode: 49152 | 0o777,
            nlink: 1,
            uid: 0,
            gid: 0,
            rdev: 0,
            size: 0,
            atime: new Date(0),
            mtime: new Date(0),
            ctime: new Date(0),
            blksize: 4096,
            blocks: 0,
          };
        },
  poll(stream) {
          var sock = stream.node.sock;
          return sock.sock_ops.poll(sock);
        },
  ioctl(stream, request, varargs) {
          var sock = stream.node.sock;
          return sock.sock_ops.ioctl(sock, request, varargs);
        },
  read(stream, buffer, offset, length, position /* ignored */) {
          var sock = stream.node.sock;
          var msg = sock.sock_ops.recvmsg(sock, length);
          if (!msg) {
            // socket is closed
            return 0;
          }
          buffer.set(msg.buffer, offset);
          return msg.buffer.length;
        },
  write(stream, buffer, offset, length, position /* ignored */) {
          var sock = stream.node.sock;
          return sock.sock_ops.sendmsg(sock, buffer, offset, length);
        },
  close(stream) {
          var sock = stream.node.sock;
          sock.sock_ops.close(sock);
        },
  },
  nextname() {
        if (!SOCKFS.nextname.current) {
          SOCKFS.nextname.current = 0;
        }
        return `socket[${SOCKFS.nextname.current++}]`;
      },
  websocket_sock_ops:{
  createPeer(sock, addr, port) {
          var ws;
  
          if (typeof addr == 'object') {
            ws = addr;
            addr = null;
            port = null;
          }
  
          if (ws) {
            // for sockets that've already connected (e.g. we're the server)
            // we can inspect the _socket property for the address
            if (ws._socket) {
              addr = ws._socket.remoteAddress;
              port = ws._socket.remotePort;
            }
            // if we're just now initializing a connection to the remote,
            // inspect the url property
            else {
              var result = /ws[s]?:\/\/([^:]+):(\d+)/.exec(ws.url);
              if (!result) {
                throw new Error('WebSocket URL must be in the format ws(s)://address:port');
              }
              addr = result[1];
              port = parseInt(result[2], 10);
            }
          } else {
            // create the actual websocket object and connect
            try {
              // The default value is 'ws://' the replace is needed because the compiler replaces '//' comments with '#'
              // comments without checking context, so we'd end up with ws:#, the replace swaps the '#' for '//' again.
              var url = 'ws://'.replace('#', '//');
              // Make the WebSocket subprotocol (Sec-WebSocket-Protocol) default to binary if no configuration is set.
              var subProtocols = 'binary'; // The default value is 'binary'
              // The default WebSocket options
              var opts = undefined;
  
              // Fetch runtime WebSocket URL config.
              if (SOCKFS.websocketArgs['url']) {
                url = SOCKFS.websocketArgs['url'];
              }
              // Fetch runtime WebSocket subprotocol config.
              if (SOCKFS.websocketArgs['subprotocol']) {
                subProtocols = SOCKFS.websocketArgs['subprotocol'];
              } else if (SOCKFS.websocketArgs['subprotocol'] === null) {
                subProtocols = 'null'
              }
  
              if (url === 'ws://' || url === 'wss://') { // Is the supplied URL config just a prefix, if so complete it.
                var parts = addr.split('/');
                url = url + parts[0] + ':' + port + '/' + parts.slice(1).join('/');
              }
  
              if (subProtocols !== 'null') {
                // The regex trims the string (removes spaces at the beginning and end), then splits the string by
                // <any space>,<any space> into an Array. Whitespace removal is important for Websockify and ws.
                subProtocols = subProtocols.replace(/^ +| +$/g,'').split(/ *, */);
  
                opts = subProtocols;
              }
  
              // If node we use the ws library.
              var WebSocketConstructor;
              if (ENVIRONMENT_IS_NODE) {
                WebSocketConstructor = /** @type{(typeof WebSocket)} */(require('ws'));
              } else
              {
                WebSocketConstructor = WebSocket;
              }
              ws = new WebSocketConstructor(url, opts);
              ws.binaryType = 'arraybuffer';
            } catch (e) {
              throw new FS.ErrnoError(23);
            }
          }
  
          var peer = {
            addr,
            port,
            socket: ws,
            msg_send_queue: []
          };
  
          SOCKFS.websocket_sock_ops.addPeer(sock, peer);
          SOCKFS.websocket_sock_ops.handlePeerEvents(sock, peer);
  
          // if this is a bound dgram socket, send the port number first to allow
          // us to override the ephemeral port reported to us by remotePort on the
          // remote end.
          if (sock.type === 2 && typeof sock.sport != 'undefined') {
            peer.msg_send_queue.push(new Uint8Array([
                255, 255, 255, 255,
                'p'.charCodeAt(0), 'o'.charCodeAt(0), 'r'.charCodeAt(0), 't'.charCodeAt(0),
                ((sock.sport & 0xff00) >> 8) , (sock.sport & 0xff)
            ]));
          }
  
          return peer;
        },
  getPeer(sock, addr, port) {
          return sock.peers[addr + ':' + port];
        },
  addPeer(sock, peer) {
          sock.peers[peer.addr + ':' + peer.port] = peer;
        },
  removePeer(sock, peer) {
          delete sock.peers[peer.addr + ':' + peer.port];
        },
  handlePeerEvents(sock, peer) {
          var first = true;
  
          function handleOpen() {
  
            sock.connecting = false;
            SOCKFS.emit('open', sock.stream.fd);
  
            try {
              var queued = peer.msg_send_queue.shift();
              while (queued) {
                peer.socket.send(queued);
                queued = peer.msg_send_queue.shift();
              }
            } catch (e) {
              // not much we can do here in the way of proper error handling as we've already
              // lied and said this data was sent. shut it down.
              peer.socket.close();
            }
          }
  
          function handleMessage(data) {
            if (typeof data == 'string') {
              var encoder = new TextEncoder(); // should be utf-8
              data = encoder.encode(data); // make a typed array from the string
            } else {
              assert(data.byteLength !== undefined); // must receive an ArrayBuffer
              if (data.byteLength == 0) {
                // An empty ArrayBuffer will emit a pseudo disconnect event
                // as recv/recvmsg will return zero which indicates that a socket
                // has performed a shutdown although the connection has not been disconnected yet.
                return;
              }
              data = new Uint8Array(data); // make a typed array view on the array buffer
            }
  
            // if this is the port message, override the peer's port with it
            var wasfirst = first;
            first = false;
            if (wasfirst &&
                data.length === 10 &&
                data[0] === 255 && data[1] === 255 && data[2] === 255 && data[3] === 255 &&
                data[4] === 'p'.charCodeAt(0) && data[5] === 'o'.charCodeAt(0) && data[6] === 'r'.charCodeAt(0) && data[7] === 't'.charCodeAt(0)) {
              // update the peer's port and its key in the peer map
              var newport = ((data[8] << 8) | data[9]);
              SOCKFS.websocket_sock_ops.removePeer(sock, peer);
              peer.port = newport;
              SOCKFS.websocket_sock_ops.addPeer(sock, peer);
              return;
            }
  
            sock.recv_queue.push({ addr: peer.addr, port: peer.port, data: data });
            SOCKFS.emit('message', sock.stream.fd);
          }
  
          if (ENVIRONMENT_IS_NODE) {
             // EventEmitter-style events use by ws library objects in Node.js).
            peer.socket.on('open', handleOpen);
            peer.socket.on('message', (data, isBinary) => {
              if (!isBinary) {
                return;
              }
              handleMessage((new Uint8Array(data)).buffer); // copy from node Buffer -> ArrayBuffer
            });
            peer.socket.on('close', () => SOCKFS.emit('close', sock.stream.fd));
            peer.socket.on('error', (error) =>{
              // Although the ws library may pass errors that may be more descriptive than
              // ECONNREFUSED they are not necessarily the expected error code e.g.
              // ENOTFOUND on getaddrinfo seems to be node.js specific, so using ECONNREFUSED
              // is still probably the most useful thing to do.
              sock.error = 14; // Used in getsockopt for SOL_SOCKET/SO_ERROR test.
              SOCKFS.emit('error', [sock.stream.fd, sock.error, 'ECONNREFUSED: Connection refused']);
            });
            return;
          }
          peer.socket.onopen = handleOpen;
          peer.socket.onclose = () => SOCKFS.emit('close', sock.stream.fd);
          peer.socket.onmessage = (event) => handleMessage(event.data);
          peer.socket.onerror = (error) => {
            // The WebSocket spec only allows a 'simple event' to be thrown on error,
            // so we only really know as much as ECONNREFUSED.
            sock.error = 14; // Used in getsockopt for SOL_SOCKET/SO_ERROR test.
            SOCKFS.emit('error', [sock.stream.fd, sock.error, 'ECONNREFUSED: Connection refused']);
          };
        },
  poll(sock) {
          if (sock.type === 1 && sock.server) {
            // listen sockets should only say they're available for reading
            // if there are pending clients.
            return sock.pending.length ? (64 | 1) : 0;
          }
  
          var mask = 0;
          var dest = sock.type === 1 ?  // we only care about the socket state for connection-based sockets
            SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport) :
            null;
  
          if (sock.recv_queue.length ||
              !dest ||  // connection-less sockets are always ready to read
              (dest && dest.socket.readyState === dest.socket.CLOSING) ||
              (dest && dest.socket.readyState === dest.socket.CLOSED)) {  // let recv return 0 once closed
            mask |= (64 | 1);
          }
  
          if (!dest ||  // connection-less sockets are always ready to write
              (dest && dest.socket.readyState === dest.socket.OPEN)) {
            mask |= 4;
          }
  
          if ((dest && dest.socket.readyState === dest.socket.CLOSING) ||
              (dest && dest.socket.readyState === dest.socket.CLOSED)) {
            // When an non-blocking connect fails mark the socket as writable.
            // Its up to the calling code to then use getsockopt with SO_ERROR to
            // retrieve the error.
            // See https://man7.org/linux/man-pages/man2/connect.2.html
            if (sock.connecting) {
              mask |= 4;
            } else  {
              // A closed peer is both a full hangup and a read-side hangup.
              mask |= 16 | 8192;
            }
          }
  
          return mask;
        },
  ioctl(sock, request, arg) {
          switch (request) {
            case 21531:
              var bytes = 0;
              if (sock.recv_queue.length) {
                bytes = sock.recv_queue[0].data.length;
              }
              HEAP32[((arg)>>2)] = bytes;
              return 0;
            case 21537:
              var on = HEAP32[((arg)>>2)];
              if (on) {
                sock.stream.flags |= 2048;
              } else {
                sock.stream.flags &= ~2048;
              }
              return 0;
            default:
              return 28;
          }
        },
  close(sock) {
          // if we've spawned a listen server, close it
          if (sock.server) {
            try {
              sock.server.close();
            } catch (e) {
            }
            sock.server = null;
          }
          // close any peer connections
          for (var peer of Object.values(sock.peers)) {
            try {
              peer.socket.close();
            } catch (e) {
            }
            SOCKFS.websocket_sock_ops.removePeer(sock, peer);
          }
          return 0;
        },
  bind(sock, addr, port) {
          if (typeof sock.saddr != 'undefined' || typeof sock.sport != 'undefined') {
            throw new FS.ErrnoError(28);  // already bound
          }
          sock.saddr = addr;
          sock.sport = port;
          // in order to emulate dgram sockets, we need to launch a listen server when
          // binding on a connection-less socket
          // note: this is only required on the server side
          if (sock.type === 2) {
            // close the existing server if it exists
            if (sock.server) {
              sock.server.close();
              sock.server = null;
            }
            // swallow error operation not supported error that occurs when binding in the
            // browser where this isn't supported
            try {
              sock.sock_ops.listen(sock, 0);
            } catch (e) {
              if (!(e.name === 'ErrnoError')) throw e;
              if (e.errno !== 138) throw e;
            }
          }
        },
  connect(sock, addr, port) {
          if (sock.server) {
            throw new FS.ErrnoError(138);
          }
  
          // TODO autobind
          // if (!sock.addr && sock.type == 2) {
          // }
  
          // early out if we're already connected / in the middle of connecting
          if (typeof sock.daddr != 'undefined' && typeof sock.dport != 'undefined') {
            var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
            if (dest) {
              if (dest.socket.readyState === dest.socket.CONNECTING) {
                throw new FS.ErrnoError(7);
              } else {
                throw new FS.ErrnoError(30);
              }
            }
          }
  
          // add the socket to our peer list and set our
          // destination address / port to match
          var peer = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
          sock.daddr = peer.addr;
          sock.dport = peer.port;
  
          // because we cannot synchronously block to wait for the WebSocket
          // connection to complete, we return here pretending that the connection
          // was a success.
          sock.connecting = true;
        },
  listen(sock, backlog) {
          if (!ENVIRONMENT_IS_NODE) {
            throw new FS.ErrnoError(138);
          }
          if (sock.server) {
             throw new FS.ErrnoError(28);  // already listening
          }
          var WebSocketServer = require('ws').Server;
          var host = sock.saddr;
          sock.server = new WebSocketServer({
            host,
            port: sock.sport
            // TODO support backlog
          });
          SOCKFS.emit('listen', sock.stream.fd); // Send Event with listen fd.
  
          sock.server.on('connection', (ws) => {
            if (sock.type === 1) {
              var newsock = SOCKFS.createSocket(sock.family, sock.type, sock.protocol);
  
              // create a peer on the new socket
              var peer = SOCKFS.websocket_sock_ops.createPeer(newsock, ws);
              newsock.daddr = peer.addr;
              newsock.dport = peer.port;
  
              // push to queue for accept to pick up
              sock.pending.push(newsock);
              SOCKFS.emit('connection', newsock.stream.fd);
              // A queued client makes the listening socket readable (POLLIN).
              sock.stream.node.notifyListeners(64 | 1);
            } else {
              // create a peer on the listen socket so calling sendto
              // with the listen socket and an address will resolve
              // to the correct client
              SOCKFS.websocket_sock_ops.createPeer(sock, ws);
              SOCKFS.emit('connection', sock.stream.fd);
            }
          });
          sock.server.on('close', () => {
            SOCKFS.emit('close', sock.stream.fd);
            sock.server = null;
          });
          sock.server.on('error', (error) => {
            // Although the ws library may pass errors that may be more descriptive than
            // ECONNREFUSED they are not necessarily the expected error code e.g.
            // ENOTFOUND on getaddrinfo seems to be node.js specific, so using EHOSTUNREACH
            // is still probably the most useful thing to do. This error shouldn't
            // occur in a well written app as errors should get trapped in the compiled
            // app's own getaddrinfo call.
            sock.error = 23; // Used in getsockopt for SOL_SOCKET/SO_ERROR test.
            SOCKFS.emit('error', [sock.stream.fd, sock.error, 'EHOSTUNREACH: Host is unreachable']);
            // don't throw
          });
        },
  accept(listensock) {
          if (!listensock.server || !listensock.pending.length) {
            throw new FS.ErrnoError(28);
          }
          var newsock = listensock.pending.shift();
          newsock.stream.flags = listensock.stream.flags;
          return newsock;
        },
  getname(sock, peer) {
          var addr, port;
          if (peer) {
            if (sock.daddr === undefined || sock.dport === undefined) {
              throw new FS.ErrnoError(53);
            }
            addr = sock.daddr;
            port = sock.dport;
          } else {
            // TODO saddr and sport will be set for bind()'d UDP sockets, but what
            // should we be returning for TCP sockets that've been connect()'d?
            addr = sock.saddr || 0;
            port = sock.sport || 0;
          }
          return { addr, port };
        },
  sendmsg(sock, buffer, offset, length, addr, port) {
          if (sock.type === 2) {
            // connection-less sockets will honor the message address,
            // and otherwise fall back to the bound destination address
            if (addr === undefined || port === undefined) {
              addr = sock.daddr;
              port = sock.dport;
            }
            // if there was no address to fall back to, error out
            if (addr === undefined || port === undefined) {
              throw new FS.ErrnoError(17);
            }
          } else {
            // connection-based sockets will only use the bound
            addr = sock.daddr;
            port = sock.dport;
          }
  
          // find the peer for the destination address
          var dest = SOCKFS.websocket_sock_ops.getPeer(sock, addr, port);
  
          // early out if not connected with a connection-based socket
          if (sock.type === 1) {
            if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
              throw new FS.ErrnoError(53);
            }
          }
  
          // create a copy of the incoming data to send, as the WebSocket API
          // doesn't work entirely with an ArrayBufferView, it'll just send
          // the entire underlying buffer
          if (ArrayBuffer.isView(buffer)) {
            offset += buffer.byteOffset;
            buffer = buffer.buffer;
          }
  
          var data = buffer.slice(offset, offset + length);
  
          // if we don't have a cached connectionless UDP datagram connection, or
          // the TCP socket is still connecting, queue the message to be sent upon
          // connect, and lie, saying the data was sent now.
          if (!dest || dest.socket.readyState !== dest.socket.OPEN) {
            // if we're not connected, open a new connection
            if (sock.type === 2) {
              if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                dest = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
              }
            }
            dest.msg_send_queue.push(data);
            return length;
          }
  
          try {
            // send the actual data
            dest.socket.send(data);
            return length;
          } catch (e) {
            throw new FS.ErrnoError(28);
          }
        },
  recvmsg(sock, length, flags) {
          // http://pubs.opengroup.org/onlinepubs/7908799/xns/recvmsg.html
          if (sock.type === 1 && sock.server) {
            // tcp servers should not be recv()'ing on the listen socket
            throw new FS.ErrnoError(53);
          }
  
          // MSG_PEEK returns the head of the queue without consuming it, so a
          // later recv sees the same bytes and poll still reports it readable.
          var peek = flags & 2;
          var queued = sock.recv_queue[0];
          if (!queued) {
            if (sock.type === 1) {
              var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
  
              if (!dest) {
                // if we have a destination address but are not connected, error out
                throw new FS.ErrnoError(53);
              }
              if (dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                // return null if the socket has closed
                return null;
              }
              // else, our socket is in a valid state but truly has nothing available
              throw new FS.ErrnoError(6);
            }
            throw new FS.ErrnoError(6);
          }
  
          // queued.data will be an ArrayBuffer if it's unadulterated, but if it's
          // requeued TCP data it'll be an ArrayBufferView
          var queuedLength = queued.data.byteLength || queued.data.length;
          var queuedOffset = queued.data.byteOffset || 0;
          var queuedBuffer = queued.data.buffer || queued.data;
          var bytesRead = Math.min(length, queuedLength);
          var res = {
            buffer: new Uint8Array(queuedBuffer, queuedOffset, bytesRead),
            addr: queued.addr,
            port: queued.port
          };
  
          if (peek) return res;
          sock.recv_queue.shift();
  
          // push back any unread data for TCP connections
          if (sock.type === 1 && bytesRead < queuedLength) {
            var bytesRemaining = queuedLength - bytesRead;
            queued.data = new Uint8Array(queuedBuffer, queuedOffset + bytesRead, bytesRemaining);
            sock.recv_queue.unshift(queued);
          }
  
          return res;
        },
  },
  };
  
  var getSocketFromFD = (fd) => {
      var socket = SOCKFS.getSocket(fd);
      if (!socket) throw new FS.ErrnoError(8);
      return socket;
    };
  
  var inetPton4 = (str) => {
      var b = str.split('.');
      for (var i = 0; i < 4; i++) {
        var tmp = Number(b[i]);
        if (isNaN(tmp)) return null;
        b[i] = tmp;
      }
      return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
    };
  
  var inetPton6 = (str) => {
      var words;
      var w, offset, z, i;
      /* http://home.deds.nl/~aeron/regex/ */
      var valid6regx = /^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i
      var parts = [];
      if (!valid6regx.test(str)) {
        return null;
      }
      if (str === '::') {
        return [0, 0, 0, 0, 0, 0, 0, 0];
      }
      // Z placeholder to keep track of zeros when splitting the string on ':'
      if (str.startsWith('::')) {
        str = str.replace('::', 'Z:'); // leading zeros case
      } else {
        str = str.replace('::', ':Z:');
      }
  
      if (str.indexOf('.') > 0) {
        // parse IPv4 embedded address
        str = str.replace(new RegExp('[.]', 'g'), ':');
        words = str.split(':');
        words[words.length-4] = Number(words[words.length-4]) + Number(words[words.length-3])*256;
        words[words.length-3] = Number(words[words.length-2]) + Number(words[words.length-1])*256;
        words = words.slice(0, words.length-2);
      } else {
        words = str.split(':');
      }
  
      offset = 0; z = 0;
      for (w=0; w < words.length; w++) {
        if (typeof words[w] == 'string') {
          if (words[w] === 'Z') {
            // compressed zeros - write appropriate number of zero words
            for (z = 0; z < (8 - words.length+1); z++) {
              parts[w+z] = 0;
            }
            offset = z-1;
          } else {
            // parse hex field to 16-bit value and write it in network byte-order
            parts[w+offset] = _htons(parseInt(words[w],16));
          }
        } else {
          // parsed IPv4 words
          parts[w+offset] = words[w];
        }
      }
      return [
        (parts[1] << 16) | parts[0],
        (parts[3] << 16) | parts[2],
        (parts[5] << 16) | parts[4],
        (parts[7] << 16) | parts[6]
      ];
    };
  
  
  
  var DNS = {
  address_map:{
  id:1,
  addrs:{
  },
  names:{
  },
  },
  lookup_name(name) {
        // If the name is already a valid ipv4 / ipv6 address, don't generate a fake one.
        var res = inetPton4(name);
        if (res !== null) {
          return name;
        }
        res = inetPton6(name);
        if (res !== null) {
          return name;
        }
  
        // See if this name is already mapped.
        var addr;
  
        if (DNS.address_map.addrs[name]) {
          addr = DNS.address_map.addrs[name];
        } else {
          var id = DNS.address_map.id++;
          assert(id < 65535, 'exceeded max address mappings of 65535');
  
          addr = '172.29.' + (id & 0xff) + '.' + (id & 0xff00);
  
          DNS.address_map.names[addr] = name;
          DNS.address_map.addrs[name] = addr;
        }
  
        return addr;
      },
  lookup_addr(addr) {
        if (DNS.address_map.names[addr]) {
          return DNS.address_map.names[addr];
        }
  
        return null;
      },
  };
  
  
  /** @type {!Int16Array} */
  var HEAP16;
  
  /** @param {number=} addrlen */
  var writeSockaddr = (sa, family, addr, port, addrlen) => {
      switch (family) {
        case 2:
          // The address may still be an unresolved hostname (e.g. a peer name
          // recorded at connect time); map it to its (possibly fake) IP here so
          // callers can pass names and IPs alike.
          addr = inetPton4(DNS.lookup_name(addr));
          zeroMemory(sa, 16);
          if (addrlen) {
            HEAP32[((addrlen)>>2)] = 16;
          }
          HEAP16[((sa)>>1)] = family;
          HEAP32[(((sa)+(4))>>2)] = addr;
          HEAP16[(((sa)+(2))>>1)] = _htons(port);
          break;
        case 10:
          addr = inetPton6(DNS.lookup_name(addr));
          zeroMemory(sa, 28);
          if (addrlen) {
            HEAP32[((addrlen)>>2)] = 28;
          }
          HEAP32[((sa)>>2)] = family;
          HEAP32[(((sa)+(8))>>2)] = addr[0];
          HEAP32[(((sa)+(12))>>2)] = addr[1];
          HEAP32[(((sa)+(16))>>2)] = addr[2];
          HEAP32[(((sa)+(20))>>2)] = addr[3];
          HEAP16[(((sa)+(2))>>1)] = _htons(port);
          break;
        default:
          return 5;
      }
      return 0;
    };
  function ___syscall_accept4(fd, addr, len, flags, u1, u2) {
  try {
  
      var sock = getSocketFromFD(fd);
      var newsock = sock.sock_ops.accept(sock);
      if (addr) {
        var errno = writeSockaddr(addr, newsock.family, newsock.daddr, newsock.dport, len);
        assert(!errno);
      }
      return newsock.stream.fd;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  var inetNtop4 = (addr) =>
      (addr & 0xff) + '.' + ((addr >> 8) & 0xff) + '.' + ((addr >> 16) & 0xff) + '.' + ((addr >> 24) & 0xff);
  
  
  var inetNtop6 = (ints) => {
      //  ref:  http://www.ietf.org/rfc/rfc2373.txt - section 2.5.4
      //  Format for IPv4 compatible and mapped  128-bit IPv6 Addresses
      //  128-bits are split into eight 16-bit words
      //  stored in network byte order (big-endian)
      //  |                80 bits               | 16 |      32 bits        |
      //  +-----------------------------------------------------------------+
      //  |               10 bytes               |  2 |      4 bytes        |
      //  +--------------------------------------+--------------------------+
      //  +               5 words                |  1 |      2 words        |
      //  +--------------------------------------+--------------------------+
      //  |0000..............................0000|0000|    IPv4 ADDRESS     | (compatible)
      //  +--------------------------------------+----+---------------------+
      //  |0000..............................0000|FFFF|    IPv4 ADDRESS     | (mapped)
      //  +--------------------------------------+----+---------------------+
      var str = '';
      var word = 0;
      var longest = 0;
      var lastzero = 0;
      var zstart = 0;
      var len = 0;
      var i = 0;
      var parts = [
        ints[0] & 0xffff,
        (ints[0] >> 16),
        ints[1] & 0xffff,
        (ints[1] >> 16),
        ints[2] & 0xffff,
        (ints[2] >> 16),
        ints[3] & 0xffff,
        (ints[3] >> 16)
      ];
  
      // Handle IPv4-compatible, IPv4-mapped, loopback and any/unspecified addresses
  
      var hasipv4 = true;
      var v4part = '';
      // check if the 10 high-order bytes are all zeros (first 5 words)
      for (i = 0; i < 5; i++) {
        if (parts[i]) {
          hasipv4 = false;
          break;
        }
      }
  
      if (hasipv4) {
        // low-order 32-bits store an IPv4 address (bytes 13 to 16) (last 2 words)
        v4part = inetNtop4(parts[6] | (parts[7] << 16));
        // IPv4-mapped IPv6 address if 16-bit value (bytes 11 and 12) == 0xFFFF (6th word)
        if (parts[5] === -1) {
          str = '::ffff:';
          str += v4part;
          return str;
        }
        // IPv4-compatible IPv6 address if 16-bit value (bytes 11 and 12) == 0x0000 (6th word)
        if (!parts[5]) {
          str = '::';
          // special case IPv6 addresses
          if (v4part === '0.0.0.0') v4part = ''; // any/unspecified address
          if (v4part === '0.0.0.1') v4part = '1';// loopback address
          str += v4part;
          return str;
        }
      }
  
      // Handle all other IPv6 addresses
  
      // first run to find the longest contiguous zero words
      for (word = 0; word < 8; word++) {
        if (!parts[word]) {
          if (word - lastzero > 1) {
            len = 0;
          }
          lastzero = word;
          len++;
        }
        if (len > longest) {
          longest = len;
          zstart = word - longest + 1;
        }
      }
  
      for (word = 0; word < 8; word++) {
        if (longest > 1) {
          // compress contiguous zeros - to produce '::'
          if (!parts[word] && word >= zstart && word < (zstart + longest) ) {
            if (word === zstart) {
              str += ':';
              if (!zstart) str += ':'; //leading zeros case
            }
            continue;
          }
        }
        // converts 16-bit words from big-endian to little-endian before converting to hex string
        str += Number(_ntohs(parts[word] & 0xffff)).toString(16);
        str += word < 7 ? ':' : '';
      }
      return str;
    };
  
  
  
  /** @type {!Uint16Array} */
  var HEAPU16;
  
  var readSockaddr = (sa, salen) => {
      // family / port offsets are common to both sockaddr_in and sockaddr_in6
      var family = HEAP16[((sa)>>1)];
      var port = _ntohs(HEAPU16[(((sa)+(2))>>1)]);
      var addr;
  
      switch (family) {
        case 2:
          if (salen !== 16) {
            return { errno: 28 };
          }
          addr = HEAP32[(((sa)+(4))>>2)];
          addr = inetNtop4(addr);
          break;
        case 10:
          if (salen !== 28) {
            return { errno: 28 };
          }
          addr = [
            HEAP32[(((sa)+(8))>>2)],
            HEAP32[(((sa)+(12))>>2)],
            HEAP32[(((sa)+(16))>>2)],
            HEAP32[(((sa)+(20))>>2)]
          ];
          addr = inetNtop6(addr);
          break;
        default:
          return { errno: 5 };
      }
  
      return { family: family, addr: addr, port: port };
    };
  
  
  var getSocketAddress = (addrp, addrlen) => {
      var info = readSockaddr(addrp, addrlen);
      if (info.errno) throw new FS.ErrnoError(info.errno);
      info.addr = DNS.lookup_addr(info.addr) || info.addr;
      return info;
    };
  function ___syscall_bind(fd, addr, len, u1, u2, u3) {
  try {
  
      var sock = getSocketFromFD(fd);
      var info = getSocketAddress(addr, len);
      sock.sock_ops.bind(sock, info.addr, info.port);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  
  
  
  
  
  /** not-@type {!BigInt64Array} */
  var HEAP64;
  var SYSCALLS = {
  currentUmask:18,
  calculateAt(dirfd, path, allowEmpty) {
        if (PATH.isAbs(path)) {
          return path;
        }
        // relative path
        var dir;
        if (dirfd === -100) {
          dir = FS.cwd();
        } else {
          var dirstream = SYSCALLS.getStreamFromFD(dirfd);
          dir = dirstream.path;
        }
        if (path.length == 0) {
          if (!allowEmpty) {
            throw new FS.ErrnoError(44);;
          }
          return dir;
        }
        return dir + '/' + path;
      },
  writeStat(buf, stat) {
        HEAPU32[((buf)>>2)] = stat.dev;
        HEAPU32[(((buf)+(4))>>2)] = stat.mode;
        HEAPU32[(((buf)+(8))>>2)] = stat.nlink;
        HEAPU32[(((buf)+(12))>>2)] = stat.uid;
        HEAPU32[(((buf)+(16))>>2)] = stat.gid;
        HEAPU32[(((buf)+(20))>>2)] = stat.rdev;
        HEAP64[(((buf)+(24))>>3)] = BigInt(stat.size);
        HEAP32[(((buf)+(32))>>2)] = 4096;
        HEAP32[(((buf)+(36))>>2)] = stat.blocks;
        var atime = stat.atime.getTime();
        var mtime = stat.mtime.getTime();
        var ctime = stat.ctime.getTime();
        HEAP64[(((buf)+(40))>>3)] = BigInt(Math.floor(atime / 1000));
        HEAPU32[(((buf)+(48))>>2)] = (atime % 1000) * 1000 * 1000;
        HEAP64[(((buf)+(56))>>3)] = BigInt(Math.floor(mtime / 1000));
        HEAPU32[(((buf)+(64))>>2)] = (mtime % 1000) * 1000 * 1000;
        HEAP64[(((buf)+(72))>>3)] = BigInt(Math.floor(ctime / 1000));
        HEAPU32[(((buf)+(80))>>2)] = (ctime % 1000) * 1000 * 1000;
        HEAP64[(((buf)+(88))>>3)] = BigInt(stat.ino);
        return 0;
      },
  writeStatFs(buf, stats) {
        HEAPU32[(((buf)+(4))>>2)] = stats.bsize;
        HEAPU32[(((buf)+(60))>>2)] = stats.bsize;
        HEAP64[(((buf)+(8))>>3)] = BigInt(stats.blocks);
        HEAP64[(((buf)+(16))>>3)] = BigInt(stats.bfree);
        HEAP64[(((buf)+(24))>>3)] = BigInt(stats.bavail);
        HEAP64[(((buf)+(32))>>3)] = BigInt(stats.files);
        HEAP64[(((buf)+(40))>>3)] = BigInt(stats.ffree);
        HEAPU32[(((buf)+(48))>>2)] = stats.fsid;
        HEAPU32[(((buf)+(64))>>2)] = stats.flags;  // ST_NOSUID
        HEAPU32[(((buf)+(56))>>2)] = stats.namelen;
      },
  doMsync(addr, stream, len, flags, offset) {
        if (!FS.isFile(stream.node.mode)) {
          throw new FS.ErrnoError(43);
        }
        if (flags & 2) {
          // MAP_PRIVATE calls need not to be synced back to underlying fs
          return 0;
        }
        var buffer = HEAPU8.subarray(addr, addr + len);
        FS.msync(stream, buffer, offset, len, flags);
      },
  getStreamFromFD(fd) {
        var stream = FS.getStreamChecked(fd);
        return stream;
      },
  varargs:undefined,
  getStr(ptr) {
        var ret = UTF8ToString(ptr);
        return ret;
      },
  };
  function ___syscall_chdir(path) {
  try {
  
      path = SYSCALLS.getStr(path);
      FS.chdir(path);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_chmod(path, mode) {
  try {
  
      path = SYSCALLS.getStr(path);
      FS.chmod(path, mode);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  function ___syscall_connect(fd, addr, len, u1, u2, u3) {
  try {
  
      var sock = getSocketFromFD(fd);
      var info = getSocketAddress(addr, len);
      sock.sock_ops.connect(sock, info.addr, info.port);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_dup3(fd, newfd, flags) {
  try {
  
      if (fd === newfd) return -28;
      if (flags & ~524288) return -28;
      var old = SYSCALLS.getStreamFromFD(fd);
      // Check newfd is within range of valid open file descriptors.
      if (newfd < 0 || newfd >= FS.MAX_OPEN_FDS) return -8;
      var existing = FS.getStream(newfd);
      if (existing) FS.close(existing);
      var stream = FS.dupStream(old, newfd);
      if (flags & 524288) {
        stream.flags |= 524288;
      }
      return stream.fd;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_faccessat(dirfd, path, amode, flags) {
  try {
  
      path = SYSCALLS.getStr(path);
      assert(!flags || flags == 512);
      path = SYSCALLS.calculateAt(dirfd, path);
      if (amode & ~7) {
        // need a valid mode
        return -28;
      }
      var lookup = FS.lookupPath(path, { follow: true });
      var node = lookup.node;
      if (!node) {
        return -44;
      }
      var perms = '';
      if (amode & 4) perms += 'r';
      if (amode & 2) perms += 'w';
      if (amode & 1) perms += 'x';
      if (perms /* otherwise, they've just passed F_OK */ && FS.nodePermissions(node, perms)) {
        return -2;
      }
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  var INT53_MAX = 9007199254740992;
  
  var INT53_MIN = -9007199254740992;
  var bigintToI53Checked = (num) => (num < INT53_MIN || num > INT53_MAX) ? NaN : Number(num);
  function ___syscall_fadvise64(fd, offset, len, advice) {
    offset = bigintToI53Checked(offset);
    len = bigintToI53Checked(len);
  
  
  try {
  
      // Advisory only, so a no-op, but a pipe/socket fd is still a seek error
      // (ESPIPE), matching Linux.
      if (!SYSCALLS.getStreamFromFD(fd).seekable) {
        return -70;
      }
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  ;
  }

  function ___syscall_fchdir(fd) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.chdir(stream.path);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_fchmod(fd, mode) {
  try {
  
      FS.fchmod(fd, mode);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_fchmodat2(dirfd, path, mode, flags) {
  try {
  
      var nofollow = flags & 256;
      path = SYSCALLS.getStr(path);
      path = SYSCALLS.calculateAt(dirfd, path);
      FS.chmod(path, mode, nofollow);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_fchown32(fd, owner, group) {
  try {
  
      FS.fchown(fd, owner, group);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_fchownat(dirfd, path, owner, group, flags) {
  try {
  
      path = SYSCALLS.getStr(path);
      var nofollow = flags & 256;
      flags = flags & (~256);
      assert(!flags);
      path = SYSCALLS.calculateAt(dirfd, path);
      (nofollow ? FS.lchown : FS.chown)(path, owner, group);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  var syscallGetVarargI = () => {
      assert(SYSCALLS.varargs != undefined);
      // the `+` prepended here is necessary to convince the JSCompiler that varargs is indeed a number.
      var ret = HEAP32[((+SYSCALLS.varargs)>>2)];
      SYSCALLS.varargs += 4;
      return ret;
    };
  var syscallGetVarargP = syscallGetVarargI;
  
  
  
  function ___syscall_fcntl64(fd, cmd, varargs) {
  SYSCALLS.varargs = varargs;
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (cmd) {
        case 0: {
          var arg = syscallGetVarargI();
          if (arg < 0) {
            return -28;
          }
          while (FS.streams[arg]) {
            arg++;
          }
          var newStream;
          newStream = FS.dupStream(stream, arg);
          return newStream.fd;
        }
        case 1:
        case 2:
          return 0;  // FD_CLOEXEC makes no sense for a single process.
        case 3:
          return stream.flags;
        case 4: {
          var arg = syscallGetVarargI();
          var mask = 289792;
          stream.flags = (stream.flags & ~mask) | (arg & mask);
          return 0;
        }
        case 12: {
          var arg = syscallGetVarargP();
          var offset = 0;
          // We're always unlocked.
          HEAP16[(((arg)+(offset))>>1)] = 2;
          return 0;
        }
        case 13:
        case 14:
          // Pretend that the locking is successful. These are process-level locks,
          // and Emscripten programs are a single process. If we supported linking a
          // filesystem between programs, we'd need to do more here.
          // See https://github.com/emscripten-core/emscripten/issues/23697
          return 0;
      }
      return -28;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_fdatasync(fd) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      return 0; // we can't do anything synchronously; the in-memory FS is already synced to
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_fstat64(fd, buf) {
  try {
  
      return SYSCALLS.writeStat(buf, FS.fstat(fd));
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_fstatfs64(fd, size, buf) {
  try {
  
      assert(size === 88);
      var stream = SYSCALLS.getStreamFromFD(fd);
      SYSCALLS.writeStatFs(buf, FS.statfsStream(stream));
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_ftruncate64(fd, length) {
    length = bigintToI53Checked(length);
  
  
  try {
  
      if (isNaN(length)) return -22;
      FS.ftruncate(fd, length);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  ;
  }

  
  
  var stringToUTF8 = (str, outPtr, maxBytesToWrite) => {
      assert(typeof maxBytesToWrite == 'number', 'stringToUTF8 requires a third parameter that specifies the length of the output buffer');
      return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
    };
  function ___syscall_getcwd(buf, size) {
  try {
  
      if (!size) return -28;
      var cwd = FS.cwd();
      var cwdLengthInBytes = lengthBytesUTF8(cwd) + 1;
      if (size < cwdLengthInBytes) return -68;
      stringToUTF8(cwd, buf, size);
      return cwdLengthInBytes;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  
  
  
  function ___syscall_getdents64(fd, dirp, count) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd)
      stream.getdents ||= FS.readdir(stream.path);
  
      var struct_size = 280;
      var pos = 0;
      var off = FS.llseek(stream, 0, 1);
  
      var startIdx = Math.floor(off / struct_size);
      var endIdx = Math.min(stream.getdents.length, startIdx + Math.floor(count/struct_size))
      for (var idx = startIdx; idx < endIdx; idx++) {
        var id;
        var type;
        var name = stream.getdents[idx];
        if (name === '.') {
          id = stream.node.id;
          type = 4;
        }
        else if (name === '..') {
          var lookup = FS.lookupPath(stream.path, { parent: true });
          id = lookup.node.id;
          type = 4;
        }
        else {
          var child;
          try {
            child = FS.lookupNode(stream.node, name);
          } catch (e) {
            // If the entry is not a directory, file, or symlink, nodefs
            // lookupNode will raise EINVAL. Skip these and continue.
            if (e?.errno === 28) {
              continue;
            }
            throw e;
          }
          id = child.id;
          type = FS.isChrdev(child.mode) ? 2 : // character device.
                 FS.isDir(child.mode) ? 4 :    // directory
                 FS.isLink(child.mode) ? 10 :   // symbolic link.
                 8;                            // regular file.
        }
        assert(id);
        HEAP64[((dirp + pos)>>3)] = BigInt(id);
        HEAP64[(((dirp + pos)+(8))>>3)] = BigInt((idx + 1) * struct_size);
        HEAP16[(((dirp + pos)+(16))>>1)] = 280;
        HEAP8[(dirp + pos)+(18)] = type;
        stringToUTF8(name, dirp + pos + 19, 256);
        pos += struct_size;
      }
      FS.llseek(stream, idx * struct_size, 0);
      return pos;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  var ___syscall_getgid32 = () => 0;

  
  function ___syscall_getpeername(fd, addr, len, u1, u2, u3) {
  try {
  
      var sock = getSocketFromFD(fd);
      if (!sock.daddr) {
        return -53; // The socket is not connected.
      }
      var errno = writeSockaddr(addr, sock.family, sock.daddr, sock.dport, len);
      assert(!errno);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  function ___syscall_getsockname(fd, addr, len, u1, u2, u3) {
  try {
  
      var sock = getSocketFromFD(fd);
      var defaultAddr = '0.0.0.0';
      // TODO: sock.saddr should never be undefined, see TODO in websocket_sock_ops.getname
      var errno = writeSockaddr(addr, sock.family, sock.saddr || defaultAddr, sock.sport, len);
      assert(!errno);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  function ___syscall_getsockopt(fd, level, optname, optval, optlen, unused) {
  try {
  
      var sock = getSocketFromFD(fd);
      // Minimal getsockopt aimed at resolving https://github.com/emscripten-core/emscripten/issues/2211
      // so only supports SOL_SOCKET with SO_ERROR.
      if (level === 1) {
        if (optname === 4) {
          HEAP32[((optval)>>2)] = sock.error;
          HEAP32[((optlen)>>2)] = 4;
          sock.error = null; // Clear the error (The SO_ERROR option obtains and then clears this field).
          return 0;
        }
      }
      return -50; // The option is unknown at the level indicated.
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  var ___syscall_getuid32 = () => 0;

  
  
  
  
  function ___syscall_ioctl(fd, op, varargs) {
  SYSCALLS.varargs = varargs;
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (op) {
        case 21509: {
          if (!stream.tty) return -59;
          return 0;
        }
        case 21505: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tcgets) {
            var termios = stream.tty.ops.ioctl_tcgets(stream);
            var argp = syscallGetVarargP();
            HEAP32[((argp)>>2)] = termios.c_iflag || 0;
            HEAP32[(((argp)+(4))>>2)] = termios.c_oflag || 0;
            HEAP32[(((argp)+(8))>>2)] = termios.c_cflag || 0;
            HEAP32[(((argp)+(12))>>2)] = termios.c_lflag || 0;
            for (var i = 0; i < 32; i++) {
              HEAP8[(argp + i)+(17)] = termios.c_cc[i] || 0;
            }
            return 0;
          }
          return 0;
        }
        case 21510:
        case 21511:
        case 21512: {
          if (!stream.tty) return -59;
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21506:
        case 21507:
        case 21508: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tcsets) {
            var argp = syscallGetVarargP();
            var c_iflag = HEAP32[((argp)>>2)];
            var c_oflag = HEAP32[(((argp)+(4))>>2)];
            var c_cflag = HEAP32[(((argp)+(8))>>2)];
            var c_lflag = HEAP32[(((argp)+(12))>>2)];
            var c_cc = []
            for (var i = 0; i < 32; i++) {
              c_cc.push(HEAP8[(argp + i)+(17)]);
            }
            return stream.tty.ops.ioctl_tcsets(stream.tty, op, { c_iflag, c_oflag, c_cflag, c_lflag, c_cc });
          }
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21519: {
          if (!stream.tty) return -59;
          var argp = syscallGetVarargP();
          HEAP32[((argp)>>2)] = 0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -59;
          return -28; // not supported
        }
        case 21537:
        case 21531: {
          var argp = syscallGetVarargP();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          // TODO: in theory we should write to the winsize struct that gets
          // passed in, but for now musl doesn't read anything on it
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tiocgwinsz) {
            var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);
            var argp = syscallGetVarargP();
            HEAP16[((argp)>>1)] = winsize[0];
            HEAP16[(((argp)+(2))>>1)] = winsize[1];
          }
          return 0;
        }
        case 21524: {
          // TODO: technically, this ioctl call should change the window size.
          // but, since emscripten doesn't have any concept of a terminal window
          // yet, we'll just silently throw it away as we do TIOCGWINSZ
          if (!stream.tty) return -59;
          return 0;
        }
        case 21515: {
          if (!stream.tty) return -59;
          return 0;
        }
        default: return -28; // not supported
      }
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_listen(fd, backlog, u1, u2, u3, u4) {
  try {
  
      var sock = getSocketFromFD(fd);
      sock.sock_ops.listen(sock, backlog);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_lstat64(path, buf) {
  try {
  
      path = SYSCALLS.getStr(path);
      return SYSCALLS.writeStat(buf, FS.lstat(path));
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_mkdirat(dirfd, path, mode) {
  try {
  
      path = SYSCALLS.getStr(path);
      path = SYSCALLS.calculateAt(dirfd, path);
      mode &= ~SYSCALLS.currentUmask;
      FS.mkdir(path, mode, 0);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_newfstatat(dirfd, path, buf, flags) {
  try {
  
      path = SYSCALLS.getStr(path);
      var nofollow = flags & 256;
      var allowEmpty = flags & 4096;
      flags = flags & (~6400);
      assert(!flags, `unknown flags in __syscall_newfstatat: ${flags}`);
      path = SYSCALLS.calculateAt(dirfd, path, allowEmpty);
      return SYSCALLS.writeStat(buf, nofollow ? FS.lstat(path) : FS.stat(path));
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  function ___syscall_openat(dirfd, path, flags, varargs) {
  SYSCALLS.varargs = varargs;
  try {
  
      path = SYSCALLS.getStr(path);
      path = SYSCALLS.calculateAt(dirfd, path);
      var mode = varargs ? syscallGetVarargI() : 0;
      if (flags & 64) {
        mode &= ~SYSCALLS.currentUmask;
      }
      return FS.open(path, flags, mode).fd;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  var PIPEFS = {
  BUCKET_BUFFER_SIZE:8192,
  mount(mount) {
        // Do not pollute the real root directory or its child nodes with pipes
        // Looks like it is OK to create another pseudo-root node not linked to the FS.root hierarchy this way
        return FS.createNode(null, '/', 16384 | 0o777, 0);
      },
  createPipe() {
        var pipe = {
          buckets: [],
          // Open write ends. When it drops to 0 the reader sees EOF and poll must
          // report POLLHUP (Linux semantics). Buckets are freed once both counts
          // reach 0.
          writerCount: 1,
          writeClosed: false,
          // Open read ends. When it drops to 0 the writer sees POLLERR (a further
          // write would get EPIPE).
          readerCount: 1,
          readClosed: false,
          timestamp: new Date(),
        };
  
        pipe.buckets.push({
          buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
          offset: 0,
          roffset: 0
        });
  
        var rName = PIPEFS.nextname();
        var wName = PIPEFS.nextname();
        var rNode = FS.createNode(PIPEFS.root, rName, 4096, 0);
        var wNode = FS.createNode(PIPEFS.root, wName, 4096, 0);
  
        rNode.pipe = pipe;
        wNode.pipe = pipe;
        // The read end's node carries the reader poll wait-queue (writes wake it);
        // the write end's node carries the writer wait-queue (read-end close wakes it).
        pipe.readNode = rNode;
        pipe.writeNode = wNode;
  
        var readableStream = FS.createStream({
          path: rName,
          node: rNode,
          flags: 0,
          seekable: false,
          stream_ops: PIPEFS.stream_ops
        });
        rNode.stream = readableStream;
  
        var writableStream = FS.createStream({
          path: wName,
          node: wNode,
          flags: 1,
          seekable: false,
          stream_ops: PIPEFS.stream_ops
        });
        wNode.stream = writableStream;
  
        return {
          readable_fd: readableStream.fd,
          writable_fd: writableStream.fd
        };
      },
  stream_ops:{
  getattr(stream) {
          var node = stream.node;
          var timestamp = node.pipe.timestamp;
          return {
            dev: 14,
            ino: node.id,
            mode: 0o10600,
            nlink: 1,
            uid: 0,
            gid: 0,
            rdev: 0,
            size: 0,
            atime: timestamp,
            mtime: timestamp,
            ctime: timestamp,
            blksize: 4096,
            blocks: 0,
          };
        },
  poll(stream) {
          var pipe = stream.node.pipe;
  
          if ((stream.flags & 2097155) === 1) {
            // Linux keeps the write end writable (the write itself fails with
            // EPIPE) while also signalling POLLERR once every read end is closed.
            var mask = 256 | 4;
            if (pipe.readClosed) {
              mask |= 8;
            }
            return mask;
          }
          var mask = 0;
          for (var bucket of pipe.buckets) {
            if (bucket.offset - bucket.roffset > 0) {
              mask = 64 | 1;
              break;
            }
          }
          // With every write end closed the read end is at EOF: readable (read
          // returns 0) and hung up.
          if (pipe.writeClosed) {
            mask |= 16 | 1;
          }
          return mask;
        },
  dup(stream) {
          var pipe = stream.node.pipe;
          if ((stream.flags & 2097155) === 1) {
            pipe.writerCount++;
          } else {
            pipe.readerCount++;
          }
        },
  ioctl(stream, request, argp) {
          if (request == 21531) {
            var pipe = stream.node.pipe;
            var currentLength = 0;
            for (var bucket of pipe.buckets) {
              currentLength += bucket.offset - bucket.roffset;
            }
            HEAP32[((argp)>>2)] = currentLength;
            return 0;
          }
          return 28;
        },
  fsync(stream) {
          return 28;
        },
  read(stream, buffer, offset, length, position /* ignored */) {
          var pipe = stream.node.pipe;
          var currentLength = 0;
  
          for (var bucket of pipe.buckets) {
            currentLength += bucket.offset - bucket.roffset;
          }
  
          assert(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer));
          var data = buffer.subarray(offset, offset + length);
  
          if (length <= 0) {
            return 0;
          }
          if (currentLength == 0) {
            // Behave as if the read end is always non-blocking
            throw new FS.ErrnoError(6);
          }
          var toRead = Math.min(currentLength, length);
  
          var totalRead = toRead;
          var toRemove = 0;
  
          for (var bucket of pipe.buckets) {
            var bucketSize = bucket.offset - bucket.roffset;
  
            if (toRead <= bucketSize) {
              var tmpSlice = bucket.buffer.subarray(bucket.roffset, bucket.offset);
              if (toRead < bucketSize) {
                tmpSlice = tmpSlice.subarray(0, toRead);
                bucket.roffset += toRead;
              } else {
                toRemove++;
              }
              data.set(tmpSlice);
              break;
            } else {
              var tmpSlice = bucket.buffer.subarray(bucket.roffset, bucket.offset);
              data.set(tmpSlice);
              data = data.subarray(tmpSlice.byteLength);
              toRead -= tmpSlice.byteLength;
              toRemove++;
            }
          }
  
          if (toRemove && toRemove == pipe.buckets.length) {
            // Do not generate excessive garbage in use cases such as
            // write several bytes, read everything, write several bytes, read everything...
            toRemove--;
            pipe.buckets[toRemove].offset = 0;
            pipe.buckets[toRemove].roffset = 0;
          }
  
          pipe.buckets.splice(0, toRemove);
  
          return totalRead;
        },
  write(stream, buffer, offset, length, position /* ignored */) {
          var pipe = stream.node.pipe;
  
          assert(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer));
          var data = buffer.subarray(offset, offset + length);
  
          var dataLen = data.byteLength;
          if (dataLen <= 0) {
            return 0;
          }
  
          var currBucket = null;
  
          if (pipe.buckets.length == 0) {
            currBucket = {
              buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
              offset: 0,
              roffset: 0
            };
            pipe.buckets.push(currBucket);
          } else {
            currBucket = pipe.buckets[pipe.buckets.length - 1];
          }
  
          assert(currBucket.offset <= PIPEFS.BUCKET_BUFFER_SIZE);
  
          var freeBytesInCurrBuffer = PIPEFS.BUCKET_BUFFER_SIZE - currBucket.offset;
          if (freeBytesInCurrBuffer >= dataLen) {
            currBucket.buffer.set(data, currBucket.offset);
            currBucket.offset += dataLen;
            pipe.readNode.notifyListeners(64 | 1);
            return dataLen;
          } else if (freeBytesInCurrBuffer > 0) {
            currBucket.buffer.set(data.subarray(0, freeBytesInCurrBuffer), currBucket.offset);
            currBucket.offset += freeBytesInCurrBuffer;
            data = data.subarray(freeBytesInCurrBuffer, data.byteLength);
          }
  
          var numBuckets = (data.byteLength / PIPEFS.BUCKET_BUFFER_SIZE) | 0;
          var remElements = data.byteLength % PIPEFS.BUCKET_BUFFER_SIZE;
  
          for (var i = 0; i < numBuckets; i++) {
            var newBucket = {
              buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
              offset: PIPEFS.BUCKET_BUFFER_SIZE,
              roffset: 0
            };
            pipe.buckets.push(newBucket);
            newBucket.buffer.set(data.subarray(0, PIPEFS.BUCKET_BUFFER_SIZE));
            data = data.subarray(PIPEFS.BUCKET_BUFFER_SIZE, data.byteLength);
          }
  
          if (remElements > 0) {
            var newBucket = {
              buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
              offset: data.byteLength,
              roffset: 0
            };
            pipe.buckets.push(newBucket);
            newBucket.buffer.set(data);
          }
  
          pipe.readNode.notifyListeners(64 | 1);
          return dataLen;
        },
  close(stream) {
          var pipe = stream.node.pipe;
          // When the last write end closes, wake any poll/epoll waiter on the read
          // end with POLLHUP so a reader blocked on the writer dropping unblocks.
          if ((stream.flags & 2097155) === 1) {
            if (!--pipe.writerCount) {
              pipe.writeClosed = true;
              pipe.readNode.notifyListeners(16 | 64 | 1);
            }
          } else if (!--pipe.readerCount) {
            // Mirror: when the last read end closes, wake any poll/epoll waiter on
            // the write end with POLLERR (a further write would get EPIPE).
            pipe.readClosed = true;
            pipe.writeNode.notifyListeners(8 | 256 | 4);
          }
          if (!pipe.readerCount && !pipe.writerCount) {
            pipe.buckets = null;
          }
        },
  },
  nextname() {
        if (!PIPEFS.nextname.current) {
          PIPEFS.nextname.current = 0;
        }
        return 'pipe[' + (PIPEFS.nextname.current++) + ']';
      },
  };
  
  function ___syscall_pipe2(fdPtr, flags) {
  try {
  
      if (fdPtr == 0) {
        throw new FS.ErrnoError(21);
      }
      var validFlags = 524288 | 2048;
      if (flags & ~validFlags) {
        throw new FS.ErrnoError(138);
      }
  
      var res = PIPEFS.createPipe();
  
      if (flags & 2048) {
        FS.getStream(res.readable_fd).flags |= 2048;
        FS.getStream(res.writable_fd).flags |= 2048;
      }
  
      HEAP32[((fdPtr)>>2)] = res.readable_fd;
      HEAP32[(((fdPtr)+(4))>>2)] = res.writable_fd;
  
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  var pollOne = (fd, events) => {
      var stream = FS.getStream(fd);
      if (!stream) return 32;
      // Streams without a poll handler (regular files, incl. NODERAWFS/NODEFS
      // which leave stream_ops unset) are treated as always readable+writable.
      var flags = stream.stream_ops?.poll?.(stream) ?? 5;
      return flags & (events | 8 | 16 | 32);
    };
  
  
  var doPollSync = (fds, nfds) => {
      var count = 0;
      for (var i = 0, pollfd = fds; i < nfds; i++, pollfd += 8) {
        var revents = pollOne(
          HEAP32[((pollfd)>>2)],
          HEAP16[(((pollfd)+(4))>>1)]);
        if (revents) count++;
        HEAP16[(((pollfd)+(6))>>1)] = revents;
      }
      return count;
    };
  function ___syscall_poll(fds, nfds, timeout) {
  try {
  
      var count = doPollSync(fds, nfds);
      if (!count && timeout != 0) warnOnce('non-zero poll() timeout not supported: ' + timeout)
      return count;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_poll_nonblocking(fds, nfds) {
  try {
  
      return doPollSync(fds, nfds);
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  
  
  function ___syscall_readlinkat(dirfd, path, buf, bufsize) {
  try {
  
      path = SYSCALLS.getStr(path);
      path = SYSCALLS.calculateAt(dirfd, path);
      if (bufsize <= 0) return -28;
      var ret = FS.readlink(path);
  
      var len = Math.min(bufsize, lengthBytesUTF8(ret));
      var endChar = HEAP8[buf+len];
      stringToUTF8(ret, buf, bufsize+1);
      // readlink is one of the rare functions that write out a C string, but does never append a null to the output buffer(!)
      // stringToUTF8() always appends a null byte, so restore the character under the null byte after the write.
      HEAP8[buf+len] = endChar;
      return len;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  
  function ___syscall_recvfrom(fd, buf, len, flags, addr, alen) {
  try {
  
      var sock = getSocketFromFD(fd);
      var msg = sock.sock_ops.recvmsg(sock, len, flags);
      if (!msg) return 0; // socket is closed
      if (addr) {
        var errno = writeSockaddr(addr, sock.family, msg.addr, msg.port, alen);
        assert(!errno);
      }
      HEAPU8.set(msg.buffer, buf);
      return msg.buffer.byteLength;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  
  
  
  function ___syscall_recvmsg(fd, message, flags, u1, u2, u3) {
  try {
  
      var sock = getSocketFromFD(fd);
      var iov = HEAPU32[(((message)+(8))>>2)];
      var num = HEAP32[(((message)+(12))>>2)];
      // get the total amount of data we can read across all arrays
      var total = 0;
      for (var i = 0; i < num; i++) {
        total += HEAP32[(((iov)+((8 * i) + 4))>>2)];
      }
      // try to read total data (MSG_PEEK, when set, leaves it buffered)
      var msg = sock.sock_ops.recvmsg(sock, total, flags);
      if (!msg) return 0; // socket is closed
  
      // TODO honor flags:
      // MSG_OOB
      // Requests out-of-band data. The significance and semantics of out-of-band data are protocol-specific.
      // MSG_WAITALL
      // Requests that the function block until the full amount of data requested can be returned. The function may return a smaller amount of data if a signal is caught, if the connection is terminated, if MSG_PEEK was specified, or if an error is pending for the socket.
  
      // write the source address out
      var name = HEAPU32[((message)>>2)];
      if (name) {
        var namelen = message + 4;
        var errno = writeSockaddr(name, sock.family, msg.addr, msg.port, namelen);
        assert(!errno);
      }
      // write the buffer out to the scatter-gather arrays
      var bytesRead = 0;
      var bytesRemaining = msg.buffer.byteLength;
      for (var i = 0; bytesRemaining > 0 && i < num; i++) {
        var iovbase = HEAPU32[(((iov)+((8 * i) + 0))>>2)];
        var iovlen = HEAP32[(((iov)+((8 * i) + 4))>>2)];
        if (!iovlen) {
          continue;
        }
        var length = Math.min(iovlen, bytesRemaining);
        var buf = msg.buffer.subarray(bytesRead, bytesRead + length);
        HEAPU8.set(buf, iovbase);
        bytesRead += length;
        bytesRemaining -= length;
      }
  
      HEAP32[(((message)+(20))>>2)] = 0;
      HEAP32[(((message)+(24))>>2)] = 0;
  
      // TODO report truncation in msghdr.msg_flags
      // MSG_EOR
      // End of record was received (if supported by the protocol).
      // MSG_OOB
      // Out-of-band data was received.
      // MSG_TRUNC
      // Normal data was truncated.
      // MSG_CTRUNC
  
      return bytesRead;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_renameat(olddirfd, oldpath, newdirfd, newpath) {
  try {
  
      oldpath = SYSCALLS.getStr(oldpath);
      newpath = SYSCALLS.getStr(newpath);
      oldpath = SYSCALLS.calculateAt(olddirfd, oldpath);
      newpath = SYSCALLS.calculateAt(newdirfd, newpath);
      FS.rename(oldpath, newpath);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_rmdir(path) {
  try {
  
      path = SYSCALLS.getStr(path);
      FS.rmdir(path);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  
  
  
  function ___syscall_sendmsg(fd, message, flags, u1, u2, u3) {
  try {
  
      var sock = getSocketFromFD(fd);
      var iov = HEAPU32[(((message)+(8))>>2)];
      var num = HEAP32[(((message)+(12))>>2)];
      // read the address and port to send to
      var addr, port;
      var name = HEAPU32[((message)>>2)];
      var namelen = HEAP32[(((message)+(4))>>2)];
      if (name) {
        var info = getSocketAddress(name, namelen);
        port = info.port;
        addr = info.addr;
      }
      // concatenate scatter-gather arrays into one message buffer
      var total = 0;
      for (var i = 0; i < num; i++) {
        total += HEAP32[(((iov)+((8 * i) + 4))>>2)];
      }
      var view = new Uint8Array(total);
      var offset = 0;
      for (var i = 0; i < num; i++) {
        var iovbase = HEAPU32[(((iov)+((8 * i) + 0))>>2)];
        var iovlen = HEAP32[(((iov)+((8 * i) + 4))>>2)];
        for (var j = 0; j < iovlen; j++) {
          view[offset++] = HEAP8[(iovbase)+(j)];
        }
      }
      // write the buffer
      return sock.sock_ops.sendmsg(sock, view, 0, total, addr, port);
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  
  function ___syscall_sendto(fd, buf, len, flags, addr, alen) {
  try {
  
      var sock = getSocketFromFD(fd);
      if (!addr) {
        // send, no address provided
        return FS.write(sock.stream, HEAP8, buf, len);
      }
      var dest = getSocketAddress(addr, alen);
      // sendto an address
      return sock.sock_ops.sendmsg(sock, HEAP8, buf, len, dest.addr, dest.port);
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_setsockopt(fd, level, optname, optval, optlen, unused) {
  try {
  
      getSocketFromFD(fd); // validate the fd (and keep this syscall's catch reachable)
      return -50; // The option is unknown at the level indicated.
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_shutdown(fd, how, u1, u2, u3, u4) {
  try {
  
      var sock = getSocketFromFD(fd);
      return -52; // unsupported feature
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_socket(domain, type, protocol, u1, u2, u3) {
  try {
  
      var sock = SOCKFS.createSocket(domain, type, protocol);
      return sock.stream.fd;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_stat64(path, buf) {
  try {
  
      path = SYSCALLS.getStr(path);
      return SYSCALLS.writeStat(buf, FS.stat(path));
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_statfs64(path, size, buf) {
  try {
  
      assert(size === 88);
      SYSCALLS.writeStatFs(buf, FS.statfs(SYSCALLS.getStr(path)));
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_symlinkat(target, dirfd, linkpath) {
  try {
  
      target = SYSCALLS.getStr(target);
      linkpath = SYSCALLS.getStr(linkpath);
      linkpath = SYSCALLS.calculateAt(dirfd, linkpath);
      FS.symlink(target, linkpath);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  function ___syscall_truncate64(path, length) {
    length = bigintToI53Checked(length);
  
  
  try {
  
      if (isNaN(length)) return -22;
      path = SYSCALLS.getStr(path);
      FS.truncate(path, length);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  ;
  }

  function ___syscall_umask(mask) {
  try {
  
      var old = SYSCALLS.currentUmask;
      SYSCALLS.currentUmask = mask;
      return old;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  function ___syscall_unlinkat(dirfd, path, flags) {
  try {
  
      path = SYSCALLS.getStr(path);
      path = SYSCALLS.calculateAt(dirfd, path);
      if (!flags) {
        FS.unlink(path);
      } else if (flags === 512) {
        FS.rmdir(path);
      } else {
        return -28;
      }
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  var readI53FromI64 = (ptr) => {
      return HEAPU32[((ptr)>>2)] + HEAP32[(((ptr)+(4))>>2)] * 4294967296;
    };
  
  
  function ___syscall_utimensat(dirfd, path, times, flags) {
  try {
  
      var nofollow = flags & 256;
      path = SYSCALLS.getStr(path);
      path = SYSCALLS.calculateAt(dirfd, path, true);
      var now = Date.now(), atime, mtime;
      if (!times) {
        atime = now;
        mtime = now;
      } else {
        var seconds = readI53FromI64(times);
        var nanoseconds = HEAP32[(((times)+(8))>>2)];
        if (nanoseconds == 1073741823) {
          atime = now;
        } else if (nanoseconds == 1073741822) {
          atime = null;
        } else {
          atime = (seconds*1000) + (nanoseconds/(1000*1000));
        }
        times += 16;
        seconds = readI53FromI64(times);
        nanoseconds = HEAP32[(((times)+(8))>>2)];
        if (nanoseconds == 1073741823) {
          mtime = now;
        } else if (nanoseconds == 1073741822) {
          mtime = null;
        } else {
          mtime = (seconds*1000) + (nanoseconds/(1000*1000));
        }
      }
      // null here means UTIME_OMIT was passed. If both were set to UTIME_OMIT then
      // we can skip the call completely.
      if ((mtime ?? atime) !== null) {
        FS.utime(path, atime, mtime, nofollow);
      }
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  var __abort_js = () =>
      abort('native code called abort()');

  
  
  
  var __emscripten_lookup_name = (name) => {
      // uint32_t _emscripten_lookup_name(const char *name);
      var nameString = UTF8ToString(name);
      return inetPton4(DNS.lookup_name(nameString));
    };

  var runtimeKeepaliveCounter = 0;
  var __emscripten_runtime_keepalive_clear = () => {
      noExitRuntime = false;
      runtimeKeepaliveCounter = 0;
    };

  var __emscripten_system = (command) => {
      if (ENVIRONMENT_IS_NODE) {
        if (!command) return 1; // shell is available
  
        var cmdstr = UTF8ToString(command);
        if (!cmdstr.length) return 0; // this is what glibc seems to do (shell works test?)
  
        var cp = require('node:child_process');
        var ret = cp.spawnSync(cmdstr, [], {shell:true, stdio:'inherit'});
  
        var _W_EXITCODE = (ret, sig) => ((ret) << 8 | (sig));
  
        // this really only can happen if process is killed by signal
        if (ret.status === null) {
          // sadly node doesn't expose such function
          var signalToNumber = (sig) => {
            // implement only the most common ones, and fallback to SIGINT
            switch (sig) {
              case 'SIGHUP': return 1;
              case 'SIGQUIT': return 3;
              case 'SIGFPE': return 8;
              case 'SIGKILL': return 9;
              case 'SIGALRM': return 14;
              case 'SIGTERM': return 15;
              default: return 2;
            }
          }
          return _W_EXITCODE(0, signalToNumber(ret.signal));
        }
  
        return _W_EXITCODE(ret.status, 0);
      }
      // int system(const char *command);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/system.html
      // Can't call external programs.
      if (!command) return 0; // no shell available
      return -52;
    };

  var __emscripten_throw_longjmp = () => {
      throw new EmscriptenSjLj;
    };

  
  function __gmtime_js(time, tmPtr) {
    time = bigintToI53Checked(time);
  
  
      var date = new Date(time * 1000);
      if (isNaN(date.getTime())) {
        return 1;
      }
      HEAP32[((tmPtr)>>2)] = date.getUTCSeconds();
      HEAP32[(((tmPtr)+(4))>>2)] = date.getUTCMinutes();
      HEAP32[(((tmPtr)+(8))>>2)] = date.getUTCHours();
      HEAP32[(((tmPtr)+(12))>>2)] = date.getUTCDate();
      HEAP32[(((tmPtr)+(16))>>2)] = date.getUTCMonth();
      HEAP32[(((tmPtr)+(20))>>2)] = date.getUTCFullYear()-1900;
      HEAP32[(((tmPtr)+(24))>>2)] = date.getUTCDay();
      var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
      var yday = ((date.getTime() - start) / (1000 * 60 * 60 * 24))|0;
      HEAP32[(((tmPtr)+(28))>>2)] = yday;
      return 0;
    ;
  }

  var isLeapYear = (year) => year%4 === 0 && (year%100 !== 0 || year%400 === 0);
  
  var MONTH_DAYS_LEAP_CUMULATIVE = [0,31,60,91,121,152,182,213,244,274,305,335];
  
  var MONTH_DAYS_REGULAR_CUMULATIVE = [0,31,59,90,120,151,181,212,243,273,304,334];
  var ydayFromDate = (date) => {
      var leap = isLeapYear(date.getFullYear());
      var monthDaysCumulative = (leap ? MONTH_DAYS_LEAP_CUMULATIVE : MONTH_DAYS_REGULAR_CUMULATIVE);
      var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1; // -1 since it's days since Jan 1
  
      return yday;
    };
  
  
  function __localtime_js(time, tmPtr) {
    time = bigintToI53Checked(time);
  
  
      var date = new Date(time*1000);
      if (isNaN(date.getTime())) {
        return 1;
      }
      HEAP32[((tmPtr)>>2)] = date.getSeconds();
      HEAP32[(((tmPtr)+(4))>>2)] = date.getMinutes();
      HEAP32[(((tmPtr)+(8))>>2)] = date.getHours();
      HEAP32[(((tmPtr)+(12))>>2)] = date.getDate();
      HEAP32[(((tmPtr)+(16))>>2)] = date.getMonth();
      HEAP32[(((tmPtr)+(20))>>2)] = date.getFullYear()-1900;
      HEAP32[(((tmPtr)+(24))>>2)] = date.getDay();
  
      var yday = ydayFromDate(date)|0;
      HEAP32[(((tmPtr)+(28))>>2)] = yday;
      HEAP32[(((tmPtr)+(36))>>2)] = -(date.getTimezoneOffset() * 60);
  
      // Attention: DST is in December in South, and some regions don't have DST at all.
      var start = new Date(date.getFullYear(), 0, 1);
      var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
      var winterOffset = start.getTimezoneOffset();
      var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset))|0;
      HEAP32[(((tmPtr)+(32))>>2)] = dst;
      return 0;
    ;
  }

  
  
  var __mktime_js = function(tmPtr) {
  
  var ret = (() => { 
      var date = new Date(HEAP32[(((tmPtr)+(20))>>2)] + 1900,
                          HEAP32[(((tmPtr)+(16))>>2)],
                          HEAP32[(((tmPtr)+(12))>>2)],
                          HEAP32[(((tmPtr)+(8))>>2)],
                          HEAP32[(((tmPtr)+(4))>>2)],
                          HEAP32[((tmPtr)>>2)],
                          0);
      if (isNaN(date.getTime())) {
        return -1;
      }
  
      // There's an ambiguous hour when the time goes back; the tm_isdst field is
      // used to disambiguate it.  Date() basically guesses, so we fix it up if it
      // guessed wrong, or fill in tm_isdst with the guess if it's -1.
      var dst = HEAP32[(((tmPtr)+(32))>>2)];
      var guessedOffset = date.getTimezoneOffset();
      var start = new Date(date.getFullYear(), 0, 1);
      var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
      var winterOffset = start.getTimezoneOffset();
      var dstOffset = Math.min(winterOffset, summerOffset); // DST is in December in South
      if (dst < 0) {
        // Attention: some regions don't have DST at all.
        dst = Number(summerOffset != winterOffset && dstOffset == guessedOffset);
      } else if ((dst > 0) != (dstOffset == guessedOffset)) {
        var nonDstOffset = Math.max(winterOffset, summerOffset);
        var trueOffset = dst > 0 ? dstOffset : nonDstOffset;
        // Don't try setMinutes(date.getMinutes() + ...) -- it's messed up.
        date.setTime(date.getTime() + (trueOffset - guessedOffset)*60000);
        if (isNaN(date.getTime())) {
          return -1;
        }
      }
  
      HEAP32[(((tmPtr)+(32))>>2)] = dst;
      HEAP32[(((tmPtr)+(24))>>2)] = date.getDay();
      var yday = ydayFromDate(date)|0;
      HEAP32[(((tmPtr)+(28))>>2)] = yday;
      // To match expected behavior, update fields from date
      HEAP32[((tmPtr)>>2)] = date.getSeconds();
      HEAP32[(((tmPtr)+(4))>>2)] = date.getMinutes();
      HEAP32[(((tmPtr)+(8))>>2)] = date.getHours();
      HEAP32[(((tmPtr)+(12))>>2)] = date.getDate();
      HEAP32[(((tmPtr)+(16))>>2)] = date.getMonth();
      HEAP32[(((tmPtr)+(20))>>2)] = date.getYear();
  
      // Return time in seconds
      return date.getTime() / 1000;
     })();
  return BigInt(ret);
  };

  
  
  
  
  
  
  
  function __mmap_js(len, prot, flags, fd, offset, allocated, addr) {
    offset = bigintToI53Checked(offset);
  
  
  try {
  
      // musl's mmap doesn't allow values over a certain limit
      // see OFF_MASK in mmap.c.
      assert(!isNaN(offset));
      var stream = SYSCALLS.getStreamFromFD(fd);
      var res = FS.mmap(stream, len, offset, prot, flags);
      var ptr = res.ptr;
      HEAP32[((allocated)>>2)] = res.allocated;
      HEAPU32[((addr)>>2)] = ptr;
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  ;
  }

  
  function __msync_js(addr, len, prot, flags, fd, offset) {
    offset = bigintToI53Checked(offset);
  
  
  try {
  
      if (isNaN(offset)) return -22;
      SYSCALLS.doMsync(addr, SYSCALLS.getStreamFromFD(fd), len, flags, offset);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  ;
  }

  
  function __munmap_js(addr, len, prot, flags, fd, offset) {
    offset = bigintToI53Checked(offset);
  
  
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      if (prot & 2) {
        SYSCALLS.doMsync(addr, stream, len, flags, offset);
      }
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  ;
  }

  var timers = {
  };
  
  var clearTimers = () => {
      for (var t of Object.values(timers)) {
        clearTimeout(t.id);
      }
    };
  
  var handleException = (e) => {
      // Certain exception types we do not treat as errors since they are used for
      // internal control flow.
      // 1. ExitStatus, which is thrown by exit()
      // 2. "unwind", which is thrown by emscripten_unwind_to_js_event_loop() and others
      //    that wish to return to JS event loop.
      if (e instanceof ExitStatus || e == 'unwind') {
        return EXITSTATUS;
      }
      checkStackCookie();
      if (e instanceof WebAssembly.RuntimeError) {
        if (_emscripten_stack_get_current() <= 0) {
          err('Stack overflow detected.  You can try increasing -sSTACK_SIZE (currently set to 5242880)');
        }
      }
      quit_(1, e);
    };
  
  
  var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
  var _proc_exit = (code) => {
      EXITSTATUS = code;
      if (!keepRuntimeAlive()) {
        Module['onExit']?.(code);
        ABORT = true;
      }
      quit_(code, new ExitStatus(code));
    };
  
  
  /** @param {boolean|number=} implicit */
  var exitJS = (status, implicit) => {
      EXITSTATUS = status;
  
      checkUnflushedContent();
  
      // if exit() was called explicitly, warn the user if the runtime isn't actually being shut down
      if (keepRuntimeAlive() && !implicit) {
        var msg = `program exited (with status: ${status}), but keepRuntimeAlive() is set (counter=${runtimeKeepaliveCounter}) due to an async operation, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)`;
        err(msg);
      }
  
      _proc_exit(status);
    };
  var _exit = exitJS;
  
  
  var maybeExit = () => {
      if (!keepRuntimeAlive()) {
        try {
          _exit(EXITSTATUS);
        } catch (e) {
          handleException(e);
        }
      }
    };
  var callUserCallback = (func) => {
      if (ABORT) {
        err('user callback triggered after runtime exited or application aborted.  Ignoring.');
        return;
      }
      try {
        return func();
      } catch (e) {
        handleException(e);
      } finally {
        maybeExit();
      }
    };
  
  
  var _emscripten_get_now = () => performance.now();
  var __setitimer_js = (which, timeout_ms) => {
      // First, clear any existing timer.
      if (timers[which]) {
        clearTimeout(timers[which].id);
        delete timers[which];
      }
  
      // A timeout of zero simply cancels the current timeout so we have nothing
      // more to do.
      if (!timeout_ms) return 0;
  
      var id = setTimeout(() => {
        assert(which in timers);
        delete timers[which];
        callUserCallback(() => __emscripten_timeout(which, _emscripten_get_now()));
      }, timeout_ms);
      timers[which] = { id, timeout_ms };
      return 0;
    };

  
  
  
  var __tzset_js = (timezone, daylight, std_name, dst_name) => {
      // TODO: Use (malleable) environment variables instead of system settings.
      var currentYear = new Date().getFullYear();
      var winter = new Date(currentYear, 0, 1);
      var summer = new Date(currentYear, 6, 1);
      var winterOffset = winter.getTimezoneOffset();
      var summerOffset = summer.getTimezoneOffset();
  
      // Local standard timezone offset. Local standard time is not adjusted for
      // daylight savings.  This code uses the fact that getTimezoneOffset returns
      // a greater value during Standard Time versus Daylight Saving Time (DST).
      // Thus it determines the expected output during Standard Time, and it
      // compares whether the output of the given date the same (Standard) or less
      // (DST).
      var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
  
      // timezone is specified as seconds west of UTC ("The external variable
      // `timezone` shall be set to the difference, in seconds, between
      // Coordinated Universal Time (UTC) and local standard time."), the same
      // as returned by stdTimezoneOffset.
      // See http://pubs.opengroup.org/onlinepubs/009695399/functions/tzset.html
      HEAPU32[((timezone)>>2)] = stdTimezoneOffset * 60;
  
      HEAP32[((daylight)>>2)] = Number(winterOffset != summerOffset);
  
      var extractZone = (timezoneOffset) => {
        // Why inverse sign?
        // Read here https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
        var sign = timezoneOffset >= 0 ? '-' : '+';
  
        var absOffset = Math.abs(timezoneOffset)
        var hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
        var minutes = String(absOffset % 60).padStart(2, '0');
  
        return `UTC${sign}${hours}${minutes}`;
      }
  
      var winterName = extractZone(winterOffset);
      var summerName = extractZone(summerOffset);
      assert(winterName);
      assert(summerName);
      assert(lengthBytesUTF8(winterName) <= 16, `timezone name truncated to fit in TZNAME_MAX (${winterName})`);
      assert(lengthBytesUTF8(summerName) <= 16, `timezone name truncated to fit in TZNAME_MAX (${summerName})`);
      if (summerOffset < winterOffset) {
        // Northern hemisphere
        stringToUTF8(winterName, std_name, 17);
        stringToUTF8(summerName, dst_name, 17);
      } else {
        stringToUTF8(winterName, dst_name, 17);
        stringToUTF8(summerName, std_name, 17);
      }
    };

  
  var _emscripten_get_now_res = () => { // return resolution of get_now, in nanoseconds
      if (ENVIRONMENT_IS_NODE) {
        return 1; // nanoseconds
      }
      // Modern environment where performance.now() is supported:
      return 1000; // microseconds (1/1000 of a millisecond)
    };
  
  var nowIsMonotonic = 1;
  
  var checkWasiClock = (clock_id) => clock_id >= 0 && clock_id <= 3;
  
  var _clock_res_get = (clk_id, pres) => {
      if (!checkWasiClock(clk_id)) {
        return 28;
      }
      var nsec;
      // all wasi clocks but realtime are monotonic
      if (clk_id === 0) {
        nsec = 1000 * 1000; // educated guess that it's milliseconds
      } else if (nowIsMonotonic) {
        nsec = _emscripten_get_now_res();
      } else {
        return 52;
      }
      HEAP64[((pres)>>3)] = BigInt(nsec);
      return 0;
    };

  
  var _emscripten_date_now = () => Date.now();
  
  
  
  
  function _clock_time_get(clk_id, ignored_precision, ptime) {
    ignored_precision = bigintToI53Checked(ignored_precision);
  
  
      if (!checkWasiClock(clk_id)) {
        return 28;
      }
      var now;
      // all wasi clocks but realtime are monotonic
      if (clk_id === 0) {
        now = _emscripten_date_now();
      } else if (nowIsMonotonic) {
        now = _emscripten_get_now();
      } else {
        return 52;
      }
      // "now" is in ms, and wasi times are in ns.
      var nsec = Math.round(now * 1000 * 1000);
      HEAP64[((ptime)>>3)] = BigInt(nsec);
      return 0;
    ;
  }

  var readEmAsmArgsArray = [];
  
  
  
  
  /** @type {!Float64Array} */
  var HEAPF64;
  
  var readEmAsmArgs = (sigPtr, buf) => {
      // Nobody should have mutated _readEmAsmArgsArray underneath us to be something else than an array.
      assert(Array.isArray(readEmAsmArgsArray));
      // The input buffer is allocated on the stack, so it must be stack-aligned.
      assert(buf % 16 == 0);
      readEmAsmArgsArray.length = 0;
      var ch;
      // Most arguments are i32s, so shift the buffer pointer so it is a plain
      // index into HEAP32.
      while (ch = HEAPU8[sigPtr++]) {
        var chr = String.fromCharCode(ch);
        var validChars = ['d', 'f', 'i', 'p'];
        // In WASM_BIGINT mode we support passing i64 values as bigint.
        validChars.push('j');
        assert(validChars.includes(chr), `Invalid character ${ch}("${chr}") in readEmAsmArgs! Use only [${validChars}], and do not specify "v" for void return argument.`);
        // Floats are always passed as doubles, so all types except for 'i'
        // are 8 bytes and require alignment.
        var wide = (ch != 105);
        wide &= (ch != 112);
        buf += wide && (buf % 8) ? 4 : 0;
        readEmAsmArgsArray.push(
          // Special case for pointers under wasm64 or CAN_ADDRESS_2GB mode.
          ch == 112 ? HEAPU32[((buf)>>2)] :
          ch == 106 ? HEAP64[((buf)>>3)] :
          ch == 105 ?
            HEAP32[((buf)>>2)] :
            HEAPF64[((buf)>>3)]
        );
        buf += wide ? 8 : 4;
      }
      return readEmAsmArgsArray;
    };
  var runEmAsmFunction = (code, sigPtr, argbuf) => {
      var args = readEmAsmArgs(sigPtr, argbuf);
      assert(ASM_CONSTS.hasOwnProperty(code), `No EM_ASM constant found at address ${code}.  The loaded WebAssembly file is likely out of sync with the generated JavaScript.`);
      return ASM_CONSTS[code](...args);
    };
  var _emscripten_asm_const_int = (code, sigPtr, argbuf) => {
      return runEmAsmFunction(code, sigPtr, argbuf);
    };

  
  var _emscripten_set_main_loop_timing = (mode, value) => {
      MainLoop.timingMode = mode;
      MainLoop.timingValue = value;
  
      if (!MainLoop.func) {
        err('emscripten_set_main_loop_timing: Cannot set timing mode for main loop since a main loop does not exist! Call emscripten_set_main_loop first to set one up.');
        return 1; // Return non-zero on failure, can't set timing mode when there is no main loop.
      }
  
      if (mode == 0) {
        MainLoop.scheduler = function MainLoop_scheduler_setTimeout() {
          var timeUntilNextTick = Math.max(0, MainLoop.tickStartTime + value - _emscripten_get_now())|0;
          setTimeout(MainLoop.runner, timeUntilNextTick); // doing this each time means that on exception, we stop
        };
      } else if (mode == 1) {
        MainLoop.scheduler = function MainLoop_scheduler_rAF() {
          MainLoop.requestAnimationFrame(MainLoop.runner);
        };
      } else {
        assert(mode == 2);
        if (!MainLoop.setImmediate) {
          if (globalThis.scheduler) {
            // Some modern browsers implement scheduler.postTask, but not all.
            MainLoop.setImmediate = scheduler.postTask.bind(scheduler);
          } else if (globalThis.setImmediate) {
            MainLoop.setImmediate = setImmediate;
          } else {
            // Emulate setImmediate. (note: not a complete polyfill, we don't emulate clearImmediate() to keep code size to minimum, since not needed)
            var setImmediates = [];
            var emscriptenMainLoopMessageId = 'setimmediate';
            /** @param {Event} event */
            var MainLoop_setImmediate_messageHandler = (event) => {
              if (event.data === emscriptenMainLoopMessageId) {
                event.stopPropagation();
                setImmediates.shift()();
              }
            };
            addEventListener('message', MainLoop_setImmediate_messageHandler, true);
            MainLoop.setImmediate = /** @type{function(function(): ?, ...?): number} */((func) => {
              setImmediates.push(func);
              if (ENVIRONMENT_IS_WORKER) {
                // The postMessge API in a Worker, sends message to the main
                // thread and does not support the `targetOrigin` (*) argument.
                postMessage(emscriptenMainLoopMessageId);
              } else {
                postMessage(emscriptenMainLoopMessageId, '*');
              }
            });
          }
        }
        MainLoop.scheduler = function MainLoop_scheduler_setImmediate() {
          MainLoop.setImmediate(MainLoop.runner);
        };
      }
      return 0;
    };
  
  
  
    /**
   * @param {number=} arg
   * @param {boolean=} noSetTiming
   */
  var setMainLoop = (iterFunc, fps, simulateInfiniteLoop, arg, noSetTiming) => {
      assert(!MainLoop.func, 'emscripten_set_main_loop: there can only be one main loop function at once')
      MainLoop.func = iterFunc;
      MainLoop.arg = arg;
  
      var thisMainLoopId = MainLoop.currentlyRunningMainloop;
      function checkIsRunning() {
        if (thisMainLoopId < MainLoop.currentlyRunningMainloop) {
          maybeExit();
          return false;
        }
        return true;
      }
  
      // We create the loop runner here but it is not actually running until
      // _emscripten_set_main_loop_timing is called (which might happen at a
      // later time).
      MainLoop.runner = function MainLoop_runner() {
        if (ABORT) return;
        if (MainLoop.queue.length > 0) {
          var start = Date.now();
          var blocker = MainLoop.queue.shift();
          blocker.func(blocker.arg);
          if (MainLoop.remainingBlockers) {
            var remaining = MainLoop.remainingBlockers;
            var next = remaining%1 == 0 ? remaining-1 : Math.floor(remaining);
            if (blocker.counted) {
              MainLoop.remainingBlockers = next;
            } else {
              // not counted, but move the progress along a tiny bit
              next = next + 0.5; // do not steal all the next one's progress
              MainLoop.remainingBlockers = (8*remaining + next)/9;
            }
          }
          MainLoop.updateStatus();
  
          // catches pause/resume main loop from blocker execution
          if (!checkIsRunning()) return;
  
          setTimeout(MainLoop.runner, 0);
          return;
        }
  
        // catch pauses from non-main loop sources
        if (!checkIsRunning()) return;
  
        // Implement very basic swap interval control
        MainLoop.currentFrameNumber = MainLoop.currentFrameNumber + 1 | 0;
        if (MainLoop.timingMode == 1 && MainLoop.timingValue > 1 && MainLoop.currentFrameNumber % MainLoop.timingValue != 0) {
          // Not the scheduled time to render this frame - skip.
          MainLoop.scheduler();
          return;
        } else if (MainLoop.timingMode == 0) {
          MainLoop.tickStartTime = _emscripten_get_now();
          if (Module['ctx']) {
            warnOnce('Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!');
          }
        }
  
        MainLoop.runIter(iterFunc);
  
        // catch pauses from the main loop itself
        if (!checkIsRunning()) return;
  
        MainLoop.scheduler();
      }
  
      if (!noSetTiming) {
        if (fps > 0) {
          _emscripten_set_main_loop_timing(0, 1000.0 / fps);
        } else {
          // Do rAF by rendering each frame (no decimating)
          _emscripten_set_main_loop_timing(1, 1);
        }
  
        MainLoop.scheduler();
      }
  
      if (simulateInfiniteLoop) {
        throw 'unwind';
      }
    };
  
  
  var MainLoop = {
  func:null,
  scheduler:null,
  currentlyRunningMainloop:0,
  arg:0,
  timingMode:0,
  timingValue:0,
  currentFrameNumber:0,
  queue:[],
  preMainLoop:[],
  postMainLoop:[],
  pause() {
        if (MainLoop.scheduler) {
          MainLoop.scheduler = null;
          // Incrementing this signals the previous main loop that it's now become old, and it must return.
          MainLoop.currentlyRunningMainloop++;
          
        }
      },
  resume() {
        MainLoop.currentlyRunningMainloop++;
        var timingMode = MainLoop.timingMode;
        var timingValue = MainLoop.timingValue;
        var func = MainLoop.func;
        MainLoop.func = null;
        // do not set timing and call scheduler, we will do it on the next lines
        setMainLoop(func, 0, false, MainLoop.arg, true);
        _emscripten_set_main_loop_timing(timingMode, timingValue);
        MainLoop.scheduler();
      },
  updateStatus() {
        if (Module['setStatus']) {
          var message = Module['statusMessage'] || 'Please wait...';
          var remaining = MainLoop.remainingBlockers ?? 0;
          var expected = MainLoop.expectedBlockers ?? 0;
          if (remaining) {
            if (remaining < expected) {
              Module['setStatus'](`{message} ({expected - remaining}/{expected})`);
            } else {
              Module['setStatus'](message);
            }
          } else {
            Module['setStatus']('');
          }
        }
      },
  init() {
      },
  runIter(func) {
        if (ABORT) return;
        for (var pre of MainLoop.preMainLoop) {
          if (pre() === false) {
            return; // |return false| skips a frame
          }
        }
        callUserCallback(func);
        for (var post of MainLoop.postMainLoop) {
          post();
        }
        checkStackCookie();
      },
  nextRAF:0,
  fakeRequestAnimationFrame(func) {
        // try to keep 60fps between calls to here
        var now = Date.now();
        if (!MainLoop.nextRAF) {
          MainLoop.nextRAF = now + 1000/60;
        } else {
          while (now + 2 >= MainLoop.nextRAF) { // fudge a little, to avoid timer jitter causing us to do lots of delay:0
            MainLoop.nextRAF += 1000/60;
          }
        }
        var delay = Math.max(MainLoop.nextRAF - now, 0);
        setTimeout(func, delay);
      },
  requestAnimationFrame(func) {
        if (globalThis.requestAnimationFrame) {
          requestAnimationFrame(func);
        } else {
          MainLoop.fakeRequestAnimationFrame(func);
        }
      },
  };
  var _emscripten_cancel_main_loop = () => {
      MainLoop.pause();
      MainLoop.func = null;
    };


  var _emscripten_err = (str) => err(UTF8ToString(str));

  var jsStackTrace = () => new Error().stack.toString();
  
  /** @param {number=} flags */
  var getCallstack = (flags) => {
      var callstack = jsStackTrace();
  
      if (flags & 8) {
        warnOnce('emscripten_log with EM_LOG_C_STACK no longer has any effect');
      }
  
      // Process all lines:
      var lines = callstack.split('\n');
      callstack = '';
      // Extract components of form:
      // '       Object._main@http://server.com:4324:12'
      var firefoxRe = new RegExp('\\s*(.*?)@(.*?):([0-9]+):([0-9]+)');
      // Extract components of form:
      // '    at Object._main (http://server.com/file.html:4324:12)'
      var chromeRe = new RegExp('\\s*at (.*?) \\\((.*):(.*):(.*)\\\)');
  
      for (var line of lines) {
        var symbolName = '';
        var file = '';
        var lineno = 0;
        var column = 0;
  
        var parts = chromeRe.exec(line);
        if (parts?.length == 5) {
          symbolName = parts[1];
          file = parts[2];
          lineno = parts[3];
          column = parts[4];
        } else {
          parts = firefoxRe.exec(line);
          if (parts?.length >= 4) {
            symbolName = parts[1];
            file = parts[2];
            lineno = parts[3];
            // Old Firefox doesn't carry column information, but in new FF30, it
            // is present. See https://bugzil.la/762556
            column = parts[4]|0;
          } else {
            // Was not able to extract this line for demangling/sourcemapping
            // purposes. Output it as-is.
            callstack += line + '\n';
            continue;
          }
        }
  
        // Find the symbols in the callstack that corresponds to the functions that
        // report callstack information, and remove everything up to these from the
        // output.
        if (symbolName == '_emscripten_log' || symbolName == '_emscripten_get_callstack') {
          callstack = '';
          continue;
        }
  
        if ((flags & 24)) {
          if (flags & 64) {
            file = file.substring(file.replace(/\\/g, '/').lastIndexOf('/')+1);
          }
          callstack += `    at ${symbolName} (${file}:${lineno}:${column})\n`;
        }
      }
      // Trim extra whitespace at the end of the output.
      callstack = callstack.replace(/\s+$/, '');
      return callstack;
    };
  
  
  var _emscripten_get_callstack = (flags, str, maxbytes) => {
      var callstack = getCallstack(flags);
      // User can query the required amount of bytes to hold the callstack.
      if (!str || maxbytes <= 0) {
        return lengthBytesUTF8(callstack)+1;
      }
      // Output callstack string as C string to HEAP.
      var bytesWrittenExcludingNull = stringToUTF8(callstack, str, maxbytes);
  
      // Return number of bytes written, including null.
      return bytesWrittenExcludingNull+1;
    };

  var maybeCStringToJsString = (cString) => {
      // 'cString > 2' checks if the input is a number, and isn't of the special
      // values we accept here, EMSCRIPTEN_EVENT_TARGET_* (which map to 0, 1, 2).
      // In other words, if cString > 2 then it's a pointer to a valid place in
      // memory, and points to a C string.
      return cString > 2 ? UTF8ToString(cString) : cString;
    };
  
  /** @type {Object} */
  var specialHTMLTargets = [0, globalThis.document ?? 0, globalThis.window ?? 0];
  var findEventTarget = (target) => {
      target = maybeCStringToJsString(target);
      var domElement = specialHTMLTargets[target] || globalThis.document?.querySelector(target);
      return domElement;
    };
  var findCanvasEventTarget = findEventTarget;
  
  var _emscripten_get_canvas_element_size = (target, width, height) => {
      var canvas = findCanvasEventTarget(target);
      if (!canvas) return -4;
      HEAP32[((width)>>2)] = canvas.width;
      HEAP32[((height)>>2)] = canvas.height;
    };

  var getHeapMax = () =>
      // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
      // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
      // for any code that deals with heap sizes, which would require special
      // casing all heap size related code to treat 0 specially.
      2147483648;
  var _emscripten_get_heap_max = () => getHeapMax();


  var GLctx;
  
  var webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance = (ctx) =>
      // Closure is expected to be allowed to minify the '.dibvbi' property, so not accessing it quoted.
      !!(ctx.dibvbi = ctx.getExtension('WEBGL_draw_instanced_base_vertex_base_instance'));
  
  var webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance = (ctx) => {
      // Closure is expected to be allowed to minify the '.mdibvbi' property, so not accessing it quoted.
      return !!(ctx.mdibvbi = ctx.getExtension('WEBGL_multi_draw_instanced_base_vertex_base_instance'));
    };
  
  var webgl_enable_EXT_polygon_offset_clamp = (ctx) =>
      !!(ctx.extPolygonOffsetClamp = ctx.getExtension('EXT_polygon_offset_clamp'));
  
  var webgl_enable_EXT_clip_control = (ctx) =>
      !!(ctx.extClipControl = ctx.getExtension('EXT_clip_control'));
  
  var webgl_enable_WEBGL_polygon_mode = (ctx) =>
      !!(ctx.webglPolygonMode = ctx.getExtension('WEBGL_polygon_mode'));
  
  var webgl_enable_WEBGL_multi_draw = (ctx) =>
      // Closure is expected to be allowed to minify the '.multiDrawWebgl' property, so not accessing it quoted.
      !!(ctx.multiDrawWebgl = ctx.getExtension('WEBGL_multi_draw'));
  
  var getEmscriptenSupportedExtensions = (ctx) => {
      // Restrict the list of advertised extensions to those that we actually
      // support.
      var supportedExtensions = [
        // WebGL 2 extensions
        'EXT_color_buffer_float',
        'EXT_conservative_depth',
        'EXT_disjoint_timer_query_webgl2',
        'EXT_texture_norm16',
        'NV_shader_noperspective_interpolation',
        'WEBGL_clip_cull_distance',
        // WebGL 1 and WebGL 2 extensions
        'EXT_clip_control',
        'EXT_color_buffer_half_float',
        'EXT_depth_clamp',
        'EXT_float_blend',
        'EXT_polygon_offset_clamp',
        'EXT_texture_compression_bptc',
        'EXT_texture_compression_rgtc',
        'EXT_texture_filter_anisotropic',
        'KHR_parallel_shader_compile',
        'OES_texture_float_linear',
        'WEBGL_blend_func_extended',
        'WEBGL_compressed_texture_astc',
        'WEBGL_compressed_texture_etc',
        'WEBGL_compressed_texture_etc1',
        'WEBGL_compressed_texture_s3tc',
        'WEBGL_compressed_texture_s3tc_srgb',
        'WEBGL_debug_renderer_info',
        'WEBGL_debug_shaders',
        'WEBGL_lose_context',
        'WEBGL_multi_draw',
        'WEBGL_polygon_mode'
      ];
      // .getSupportedExtensions() can return null if context is lost, so coerce to empty array.
      return ctx.getSupportedExtensions()?.filter(ext => supportedExtensions.includes(ext)) ?? [];
    };
  
  var registerPreMainLoop = (f) => {
      // Does nothing unless $MainLoop is included/used.
      typeof MainLoop != 'undefined' && MainLoop.preMainLoop.push(f);
    };
  
  
  var webglBufferSubData = (target, offset, size, data, src = HEAPU8) => {
      if (true) {
        size && GLctx.bufferSubData(target, offset, src, data, size);
        return;
      }
    };
  
  
  
  
  var GL = {
  counter:1,
  buffers:[],
  mappedBuffers:{
  },
  programs:[],
  framebuffers:[],
  renderbuffers:[],
  textures:[],
  shaders:[],
  vaos:[],
  contexts:[],
  offscreenCanvases:{
  },
  queries:[],
  samplers:[],
  transformFeedbacks:[],
  syncs:[],
  byteSizeByTypeRoot:5120,
  byteSizeByType:[1,1,2,2,4,4,4,2,3,4,8],
  stringCache:{
  },
  stringiCache:{
  },
  unpackAlignment:4,
  unpackRowLength:0,
  recordError:(errorCode) => {
        if (!GL.lastError) {
          GL.lastError = errorCode;
        }
      },
  getNewId:(table) => {
        var ret = GL.counter++;
        for (var i = table.length; i < ret; i++) {
          table[i] = null;
        }
        // Skip over any non-null elements that might have been created by
        // glBindBuffer.
        while (table[ret]) {
          ret = GL.counter++;
        }
        return ret;
      },
  genObject:(n, buffers, createFunction, objectTable
        ) => {
        for (var i = 0; i < n; i++) {
          var buffer = GLctx[createFunction]();
          var id = buffer && GL.getNewId(objectTable);
          if (buffer) {
            buffer.name = id;
            objectTable[id] = buffer;
          } else {
            GL.recordError(0x502 /* GL_INVALID_OPERATION */);
          }
          HEAP32[(((buffers)+(i*4))>>2)] = id;
        }
      },
  MAX_TEMP_BUFFER_SIZE:2097152,
  numTempVertexBuffersPerSize:64,
  log2ceilLookup:(i) => 32 - Math.clz32(i ? i - 1 : 0),
  generateTempBuffers:(quads, context) => {
        var largestIndex = GL.log2ceilLookup(GL.MAX_TEMP_BUFFER_SIZE);
        context.tempVertexBufferCounters1 = [];
        context.tempVertexBufferCounters2 = [];
        context.tempVertexBufferCounters1.length = context.tempVertexBufferCounters2.length = largestIndex+1;
        context.tempVertexBuffers1 = [];
        context.tempVertexBuffers2 = [];
        context.tempVertexBuffers1.length = context.tempVertexBuffers2.length = largestIndex+1;
        context.tempIndexBuffers = [];
        context.tempIndexBuffers.length = largestIndex+1;
        for (var i = 0; i <= largestIndex; ++i) {
          context.tempIndexBuffers[i] = null; // Created on-demand
          context.tempVertexBufferCounters1[i] = context.tempVertexBufferCounters2[i] = 0;
          var ringbufferLength = GL.numTempVertexBuffersPerSize;
          context.tempVertexBuffers1[i] = [];
          context.tempVertexBuffers2[i] = [];
          var ringbuffer1 = context.tempVertexBuffers1[i];
          var ringbuffer2 = context.tempVertexBuffers2[i];
          ringbuffer1.length = ringbuffer2.length = ringbufferLength;
          for (var j = 0; j < ringbufferLength; ++j) {
            ringbuffer1[j] = ringbuffer2[j] = null; // Created on-demand
          }
        }
  
        if (quads) {
          // GL_QUAD indexes can be precalculated
          context.tempQuadIndexBuffer = GLctx.createBuffer();
          context.GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, context.tempQuadIndexBuffer);
          var numIndexes = GL.MAX_TEMP_BUFFER_SIZE >> 1;
          var quadIndexes = new Uint16Array(numIndexes);
          var i = 0, v = 0;
          while (1) {
            quadIndexes[i++] = v;
            if (i >= numIndexes) break;
            quadIndexes[i++] = v+1;
            if (i >= numIndexes) break;
            quadIndexes[i++] = v+2;
            if (i >= numIndexes) break;
            quadIndexes[i++] = v;
            if (i >= numIndexes) break;
            quadIndexes[i++] = v+2;
            if (i >= numIndexes) break;
            quadIndexes[i++] = v+3;
            if (i >= numIndexes) break;
            v += 4;
          }
          context.GLctx.bufferData(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, quadIndexes, 0x88E4 /*GL_STATIC_DRAW*/);
          context.GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, null);
        }
      },
  getTempVertexBuffer:(sizeBytes) => {
        var idx = GL.log2ceilLookup(sizeBytes);
        var ringbuffer = GL.currentContext.tempVertexBuffers1[idx];
        var nextFreeBufferIndex = GL.currentContext.tempVertexBufferCounters1[idx];
        GL.currentContext.tempVertexBufferCounters1[idx] = (GL.currentContext.tempVertexBufferCounters1[idx]+1) & (GL.numTempVertexBuffersPerSize-1);
        var vbo = ringbuffer[nextFreeBufferIndex];
        if (vbo) {
          return vbo;
        }
        var prevVBO = GLctx.getParameter(0x8894 /*GL_ARRAY_BUFFER_BINDING*/);
        ringbuffer[nextFreeBufferIndex] = GLctx.createBuffer();
        GLctx.bindBuffer(0x8892 /*GL_ARRAY_BUFFER*/, ringbuffer[nextFreeBufferIndex]);
        GLctx.bufferData(0x8892 /*GL_ARRAY_BUFFER*/, 1 << idx, 0x88E8 /*GL_DYNAMIC_DRAW*/);
        GLctx.bindBuffer(0x8892 /*GL_ARRAY_BUFFER*/, prevVBO);
        return ringbuffer[nextFreeBufferIndex];
      },
  getTempIndexBuffer:(sizeBytes) => {
        var idx = GL.log2ceilLookup(sizeBytes);
        var ibo = GL.currentContext.tempIndexBuffers[idx];
        if (ibo) {
          return ibo;
        }
        var prevIBO = GLctx.getParameter(0x8895 /*ELEMENT_ARRAY_BUFFER_BINDING*/);
        GL.currentContext.tempIndexBuffers[idx] = GLctx.createBuffer();
        GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, GL.currentContext.tempIndexBuffers[idx]);
        GLctx.bufferData(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, 1 << idx, 0x88E8 /*GL_DYNAMIC_DRAW*/);
        GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, prevIBO);
        return GL.currentContext.tempIndexBuffers[idx];
      },
  newRenderingFrameStarted:() => {
        if (!GL.currentContext) {
          return;
        }
        var vb = GL.currentContext.tempVertexBuffers1;
        GL.currentContext.tempVertexBuffers1 = GL.currentContext.tempVertexBuffers2;
        GL.currentContext.tempVertexBuffers2 = vb;
        vb = GL.currentContext.tempVertexBufferCounters1;
        GL.currentContext.tempVertexBufferCounters1 = GL.currentContext.tempVertexBufferCounters2;
        GL.currentContext.tempVertexBufferCounters2 = vb;
        var largestIndex = GL.log2ceilLookup(GL.MAX_TEMP_BUFFER_SIZE);
        for (var i = 0; i <= largestIndex; ++i) {
          GL.currentContext.tempVertexBufferCounters1[i] = 0;
        }
      },
  getSource:(shader, count, string, length) => {
        var source = '';
        for (var i = 0; i < count; ++i) {
          var len = length ? HEAPU32[(((length)+(i*4))>>2)] : undefined;
          source += UTF8ToString(HEAPU32[(((string)+(i*4))>>2)], len);
        }
        return source;
      },
  calcBufLength:(size, type, stride, count) => {
        if (stride > 0) {
          return count * stride;  // XXXvlad this is not exactly correct I don't think
        }
        var typeSize = GL.byteSizeByType[type - GL.byteSizeByTypeRoot];
        return size * typeSize * count;
      },
  usedTempBuffers:[],
  preDrawHandleClientVertexAttribBindings:(count) => {
        GL.resetBufferBinding = false;
  
        // TODO: initial pass to detect ranges we need to upload, might not need
        // an upload per attrib
        for (var i = 0; i < GL.currentContext.maxVertexAttribs; ++i) {
          var cb = GL.currentContext.clientBuffers[i];
          if (!cb.clientside || !cb.enabled) continue;
  
          assert(count || !GLctx.currentElementArrayBufferBinding, 'must use array buffers when using element buffer');
  
          GL.resetBufferBinding = true;
  
          var size = GL.calcBufLength(cb.size, cb.type, cb.stride, count);
          var buf = GL.getTempVertexBuffer(size);
          GLctx.bindBuffer(0x8892 /*GL_ARRAY_BUFFER*/, buf);
          webglBufferSubData(0x8892 /*GL_ARRAY_BUFFER*/, 0, size, cb.ptr);
          cb.vertexAttribPointerAdaptor.call(GLctx, i, cb.size, cb.type, cb.normalized, cb.stride, 0);
        }
      },
  postDrawHandleClientVertexAttribBindings:() => {
        if (GL.resetBufferBinding) {
          GLctx.bindBuffer(0x8892 /*GL_ARRAY_BUFFER*/, GL.buffers[GLctx.currentArrayBufferBinding]);
        }
      },
  createContext:(/** @type {HTMLCanvasElement} */ canvas, webGLContextAttributes) => {
  
        // BUG: Workaround Safari WebGL issue: After successfully acquiring WebGL
        // context on a canvas, calling .getContext() will always return that
        // context independent of which 'webgl' or 'webgl2'
        // context version was passed. See:
        //   https://webkit.org/b/222758
        // and:
        //   https://github.com/emscripten-core/emscripten/issues/13295.
        // TODO: Once the bug is fixed and shipped in Safari, adjust the Safari
        // version field in above check.
        if (!canvas.getContextSafariWebGL2Fixed) {
          canvas.getContextSafariWebGL2Fixed = canvas.getContext;
          /** @type {function(this:HTMLCanvasElement, string, (Object|null)=): (Object|null)} */
          function fixedGetContext(ver, attrs) {
            var gl = canvas.getContextSafariWebGL2Fixed(ver, attrs);
            return ((ver == 'webgl') == (gl instanceof WebGLRenderingContext)) ? gl : null;
          }
          canvas.getContext = fixedGetContext;
        }
  
        var ctx = canvas.getContext('webgl2', webGLContextAttributes);
  
        if (!ctx) return 0;
  
        var handle = GL.registerContext(ctx, webGLContextAttributes);
  
        return handle;
      },
  registerContext:(ctx, webGLContextAttributes) => {
        // without pthreads a context is just an integer ID
        var handle = GL.getNewId(GL.contexts);
  
        var context = {
          handle,
          attributes: webGLContextAttributes,
          version: webGLContextAttributes.majorVersion,
          GLctx: ctx
        };
  
        // Store the created context object so that we can access the context
        // given a canvas without having to pass the parameters again.
        if (ctx.canvas) ctx.canvas.GLctxObject = context;
        GL.contexts[handle] = context;
        if (typeof webGLContextAttributes.enableExtensionsByDefault == 'undefined' || webGLContextAttributes.enableExtensionsByDefault) {
          GL.initExtensions(context);
        }
  
        context.maxVertexAttribs = context.GLctx.getParameter(0x8869 /*GL_MAX_VERTEX_ATTRIBS*/);
        context.clientBuffers = [];
        for (var i = 0; i < context.maxVertexAttribs; i++) {
          context.clientBuffers[i] = {
            enabled: false,
            clientside: false,
            size: 0,
            type: 0,
            normalized: 0,
            stride: 0,
            ptr: 0,
            vertexAttribPointerAdaptor: null,
          };
        }
  
        GL.generateTempBuffers(false, context);
  
        return handle;
      },
  makeContextCurrent:(contextHandle) => {
  
        // Active Emscripten GL layer context object.
        GL.currentContext = GL.contexts[contextHandle];
        // Active WebGL context object.
        Module['ctx'] = GLctx = GL.currentContext?.GLctx;
        return !(contextHandle && !GLctx);
      },
  getContext:(contextHandle) => {
        return GL.contexts[contextHandle];
      },
  deleteContext:(contextHandle) => {
        if (GL.currentContext === GL.contexts[contextHandle]) {
          GL.currentContext = null;
        }
        if (typeof JSEvents == 'object') {
          // Release all JS event handlers on the DOM element that the GL context is
          // associated with since the context is now deleted.
          JSEvents.removeAllHandlersOnTarget(GL.contexts[contextHandle].GLctx.canvas);
        }
        // Make sure the canvas object no longer refers to the context object so
        // there are no GC surprises.
        if (GL.contexts[contextHandle]?.GLctx.canvas) {
          GL.contexts[contextHandle].GLctx.canvas.GLctxObject = undefined;
        }
        GL.contexts[contextHandle] = null;
      },
  initExtensions:(context) => {
        // If this function is called without a specific context object, init the
        // extensions of the currently active context.
        context ||= GL.currentContext;
  
        if (context.initExtensionsDone) return;
        context.initExtensionsDone = true;
  
        var GLctx = context.GLctx;
  
        // Detect the presence of a few extensions manually, since the GL interop
        // layer itself will need to know if they exist.
  
        // Extensions that are available in both WebGL 1 and WebGL 2
        webgl_enable_WEBGL_multi_draw(GLctx);
        webgl_enable_EXT_polygon_offset_clamp(GLctx);
        webgl_enable_EXT_clip_control(GLctx);
        webgl_enable_WEBGL_polygon_mode(GLctx);
        // Extensions that are available from WebGL >= 2 (no-op if called on a WebGL 1 context active)
        webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance(GLctx);
        webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance(GLctx);
  
        // On WebGL 2, EXT_disjoint_timer_query is replaced with an alternative
        // that's based on core APIs, and exposes only the queryCounterEXT()
        // entrypoint.
        if (context.version >= 2) {
          GLctx.disjointTimerQueryExt = GLctx.getExtension('EXT_disjoint_timer_query_webgl2');
        }
  
        // However, Firefox exposes the WebGL 1 version on WebGL 2 as well and
        // thus we look for the WebGL 1 version again if the WebGL 2 version
        // isn't present. https://bugzil.la/1328882
        if (context.version < 2 || !GLctx.disjointTimerQueryExt)
        {
          GLctx.disjointTimerQueryExt = GLctx.getExtension('EXT_disjoint_timer_query');
        }
  
        for (var ext of getEmscriptenSupportedExtensions(GLctx)) {
          // WEBGL_lose_context, WEBGL_debug_renderer_info and WEBGL_debug_shaders
          // are not enabled by default.
          if (!ext.includes('lose_context') && !ext.includes('debug')) {
            // Call .getExtension() to enable that extension permanently.
            GLctx.getExtension(ext);
          }
        }
      },
  };
  var _emscripten_is_webgl_context_lost = (contextHandle) =>
      !GL.contexts[contextHandle] || GL.contexts[contextHandle].GLctx.isContextLost();

  
  
  var growMemory = (size) => {
      var oldHeapSize = wasmMemory.buffer.byteLength;
      var pages = ((size - oldHeapSize + 65535) / 65536) | 0;
      try {
        // round size grow request up to wasm page size (fixed 64KB per spec)
        wasmMemory.grow(pages); // .grow() takes a delta compared to the previous size
        updateMemoryViews();
        return 1 /*success*/;
      } catch(e) {
        err(`growMemory: Attempted to grow heap from ${oldHeapSize} bytes to ${size} bytes, but got error: ${e}`);
      }
      // implicit 0 return to save code size (caller will cast 'undefined' into 0
      // anyhow)
    };
  
  var _emscripten_resize_heap = (requestedSize) => {
      var oldSize = HEAPU8.length;
      // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
      requestedSize >>>= 0;
      // With multithreaded builds, races can happen (another thread might increase the size
      // in between), so return a failure, and let the caller retry.
      assert(requestedSize > oldSize);
  
      // Memory resize rules:
      // 1.  Always increase heap size to at least the requested size, rounded up
      //     to next page multiple.
      // 2a. If MEMORY_GROWTH_LINEAR_STEP == -1, excessively resize the heap
      //     geometrically: increase the heap size according to
      //     MEMORY_GROWTH_GEOMETRIC_STEP factor (default +20%), At most
      //     overreserve by MEMORY_GROWTH_GEOMETRIC_CAP bytes (default 96MB).
      // 2b. If MEMORY_GROWTH_LINEAR_STEP != -1, excessively resize the heap
      //     linearly: increase the heap size by at least
      //     MEMORY_GROWTH_LINEAR_STEP bytes.
      // 3.  Max size for the heap is capped at 2048MB-WASM_PAGE_SIZE, or by
      //     MAXIMUM_MEMORY, or by ASAN limit, depending on which is smallest
      // 4.  If we were unable to allocate as much memory, it may be due to
      //     over-eager decision to excessively reserve due to (3) above.
      //     Hence if an allocation fails, cut down on the amount of excess
      //     growth, in an attempt to succeed to perform a smaller allocation.
  
      // A limit is set for how much we can grow. We should not exceed that
      // (the wasm binary specifies it, so if we tried, we'd fail anyhow).
      var maxHeapSize = getHeapMax();
      if (requestedSize > maxHeapSize) {
        err(`Cannot enlarge memory, requested ${requestedSize} bytes, but the limit is ${maxHeapSize} bytes!`);
        return false;
      }
  
      // Loop through potential heap size increases. If we attempt a too eager
      // reservation that fails, cut down on the attempted size and reserve a
      // smaller bump instead. (max 3 times, chosen somewhat arbitrarily)
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown); // ensure geometric growth
        // but limit overreserving (default to capping at +96MB overgrowth at most)
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296 );
  
        var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
  
        var replacement = growMemory(newSize);
        if (replacement) {
  
          return true;
        }
      }
      err(`Failed to grow the heap from ${oldSize} bytes to ${newSize} bytes, not enough memory!`);
      return false;
    };

  var _emscripten_set_canvas_element_size = (target, width, height) => {
      var canvas = findCanvasEventTarget(target);
      if (!canvas) return -4;
      canvas.width = width;
      canvas.height = height;
      return 0;
    };

  
  var _emscripten_set_main_loop = (func, fps, simulateInfiniteLoop) => {
      var iterFunc = getWasmTableEntry(func);
      setMainLoop(iterFunc, fps, simulateInfiniteLoop);
    };

  
  var webglPowerPreferences = ["default","low-power","high-performance"];
  
  
  
  
  var _emscripten_webgl_do_create_context = (target, attributes) => {
      assert(attributes);
      var attr32 = ((attributes)>>2);
      var powerPreference = HEAP32[attr32 + (8>>2)];
      var contextAttributes = {
        'alpha': !!HEAP8[attributes + 0],
        'depth': !!HEAP8[attributes + 1],
        'stencil': !!HEAP8[attributes + 2],
        'antialias': !!HEAP8[attributes + 3],
        'premultipliedAlpha': !!HEAP8[attributes + 4],
        'preserveDrawingBuffer': !!HEAP8[attributes + 5],
        'powerPreference': webglPowerPreferences[powerPreference],
        'failIfMajorPerformanceCaveat': !!HEAP8[attributes + 12],
        'desynchronized': !!HEAP8[attributes + 33],
        // The following are not predefined WebGL context attributes in the WebGL specification, so the property names can be minified by Closure.
        majorVersion: HEAP32[attr32 + (16>>2)],
        minorVersion: HEAP32[attr32 + (20>>2)],
        enableExtensionsByDefault: HEAP8[attributes + 24],
        explicitSwapControl: HEAP8[attributes + 25],
        proxyContextToMainThread: HEAP32[attr32 + (28>>2)],
        renderViaOffscreenBackBuffer: HEAP8[attributes + 32]
      };
  
      //  TODO: Make these into hard errors at some point in the future
      if (contextAttributes.majorVersion !== 1 && contextAttributes.majorVersion !== 2) {
        err(`Invalid WebGL version requested: ${contextAttributes.majorVersion}`);
      }
      if (contextAttributes.majorVersion !== 2) {
        err('WebGL 1 requested but only WebGL 2 is supported (MIN_WEBGL_VERSION is 2)');
      }
  
      var canvas = findCanvasEventTarget(target);
  
      if (!canvas) {
        return 0;
      }
  
      if (contextAttributes.explicitSwapControl) {
        return 0;
      }
  
      var contextHandle = GL.createContext(canvas, contextAttributes);
      return contextHandle;
    };
  var _emscripten_webgl_create_context = _emscripten_webgl_do_create_context;

  
  
  
  
  
  
  
  var _emscripten_webgl_enable_extension = (contextHandle, extension) => {
      var context = GL.getContext(contextHandle);
      var extString = UTF8ToString(extension);
      if (extString.startsWith('GL_')) extString = extString.slice(3); // Allow enabling extensions both with "GL_" prefix and without.
  
      // Switch-board that pulls in code for all GL extensions, even if those are not used :/
      // Build with -sGL_SUPPORT_SIMPLE_ENABLE_EXTENSIONS=0 to avoid this.
  
      if (extString == 'WEBGL_draw_instanced_base_vertex_base_instance') webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance(GLctx);
      if (extString == 'WEBGL_multi_draw_instanced_base_vertex_base_instance') webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance(GLctx);
  
      if (extString == 'WEBGL_multi_draw') webgl_enable_WEBGL_multi_draw(GLctx);
      if (extString == 'EXT_polygon_offset_clamp') webgl_enable_EXT_polygon_offset_clamp(GLctx);
      if (extString == 'EXT_clip_control') webgl_enable_EXT_clip_control(GLctx);
      if (extString == 'WEBGL_polygon_mode') webgl_enable_WEBGL_polygon_mode(GLctx);
  
      var ext = context.GLctx.getExtension(extString);
      return !!ext;
    };

  
  var _emscripten_webgl_do_get_current_context = () => GL.currentContext ? GL.currentContext.handle : 0;
  var _emscripten_webgl_get_current_context = _emscripten_webgl_do_get_current_context;

  var _emscripten_webgl_make_context_current = (contextHandle) => {
      var success = GL.makeContextCurrent(contextHandle);
      return success ? 0 : -5;
    };

  var ENV = {
  };
  
  var getExecutableName = () => thisProgram;
  var getEnvStrings = () => {
      if (!getEnvStrings.strings) {
        // Default values.
        var lang = (globalThis.navigator?.language ?? 'C').replace('-', '_') + '.UTF-8';
        var env = {
          'USER': 'web_user',
          'LOGNAME': 'web_user',
          'PATH': '/',
          'PWD': '/',
          'HOME': '/home/web_user',
          'LANG': lang,
          '_': getExecutableName()
        };
        // Apply the user-provided values, if any.
        for (var x in ENV) {
          // x is a key in ENV; if ENV[x] is undefined, that means it was
          // explicitly set to be so. We allow user code to do that to
          // force variables with default values to remain unset.
          if (ENV[x] === undefined) delete env[x];
          else env[x] = ENV[x];
        }
        var strings = [];
        for (var x in env) {
          strings.push(`${x}=${env[x]}`);
        }
        getEnvStrings.strings = strings;
      }
      return getEnvStrings.strings;
    };
  
  
  var _environ_get = (__environ, environ_buf) => {
      var bufSize = 0;
      var envp = 0;
      for (var string of getEnvStrings()) {
        var ptr = environ_buf + bufSize;
        HEAPU32[(((__environ)+(envp))>>2)] = ptr;
        bufSize += stringToUTF8(string, ptr, Infinity) + 1;
        envp += 4;
      }
      return 0;
    };

  
  
  var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
      var strings = getEnvStrings();
      HEAPU32[((penviron_count)>>2)] = strings.length;
      var bufSize = 0;
      for (var string of strings) {
        bufSize += lengthBytesUTF8(string) + 1;
      }
      HEAPU32[((penviron_buf_size)>>2)] = bufSize;
      return 0;
    };


  function _fd_close(fd) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }
  

  
  
  
  function _fd_fdstat_get(fd, pbuf) {
  try {
  
      var rightsBase = 0;
      var rightsInheriting = 0;
      var flags = 0;
      {
        var stream = SYSCALLS.getStreamFromFD(fd);
        // All character devices are terminals (other things a Linux system would
        // assume is a character device, like the mouse, we have special APIs for).
        var type = stream.tty ? 2 :
                   FS.isDir(stream.mode) ? 3 :
                   FS.isLink(stream.mode) ? 7 :
                   4;
      }
      HEAP8[pbuf] = type;
      HEAP16[(((pbuf)+(2))>>1)] = flags;
      HEAP64[(((pbuf)+(8))>>3)] = BigInt(rightsBase);
      HEAP64[(((pbuf)+(16))>>3)] = BigInt(rightsInheriting);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }
  

  
  /** @param {number=} offset */
  var doReadv = (stream, iov, iovcnt, offset) => {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[((iov)>>2)];
        var len = HEAPU32[(((iov)+(4))>>2)];
        iov += 8;
        try {
          var curr = FS.read(stream, HEAP8, ptr, len, offset);
        } catch (e) {
          // On a non-blocking stream a subsequent read may would-block after we
          // already gathered data. POSIX readv is a single gather-read: return
          // what we have rather than failing the whole call.
          if (ret > 0 && e instanceof FS.ErrnoError &&
              (e.errno == 6 || e.errno == 6)) {
            break;
          }
          throw e;
        }
        if (curr < 0) return -1;
        ret += curr;
        if (curr < len) break; // nothing more to read
        if (typeof offset != 'undefined') {
          offset += curr;
        }
      }
      return ret;
    };
  
  
  
  function _fd_pread(fd, iov, iovcnt, offset, pnum) {
    offset = bigintToI53Checked(offset);
  
  
  try {
  
      if (isNaN(offset)) return 22;
      var stream = SYSCALLS.getStreamFromFD(fd)
      var num = doReadv(stream, iov, iovcnt, offset);
      HEAPU32[((pnum)>>2)] = num;
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  ;
  }

  
  
  /** @param {number=} offset */
  var doWritev = (stream, iov, iovcnt, offset) => {
      // Gather all iovecs into one contiguous buffer and issue a single
      // FS.write, matching POSIX writev's single gather-write semantics (as
      // __syscall_sendmsg already does). Per-iovec writes fragment a stream
      // socket send into multiple segments, breaking stream byte semantics.
      if (iovcnt == 1) {
        // Single iovec: write directly from HEAP8, no gather buffer needed.
        return FS.write(stream, HEAP8, HEAPU32[((iov)>>2)], HEAPU32[(((iov)+(4))>>2)], offset);
      }
      var total = 0;
      for (var i = 0, p = iov; i < iovcnt; i++, p += 8) {
        total += HEAPU32[(((p)+(4))>>2)];
      }
      var view = new Uint8Array(total);
      var voff = 0;
      for (var i = 0; i < iovcnt; i++, iov += 8) {
        var ptr = HEAPU32[((iov)>>2)];
        var len = HEAPU32[(((iov)+(4))>>2)];
        view.set(HEAPU8.subarray(ptr, ptr + len), voff);
        voff += len;
      }
      return FS.write(stream, view, 0, total, offset);
    };
  
  
  
  function _fd_pwrite(fd, iov, iovcnt, offset, pnum) {
    offset = bigintToI53Checked(offset);
  
  
  try {
  
      if (isNaN(offset)) return 22;
      var stream = SYSCALLS.getStreamFromFD(fd)
      var num = doWritev(stream, iov, iovcnt, offset);
      HEAPU32[((pnum)>>2)] = num;
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  ;
  }

  
  
  function _fd_read(fd, iov, iovcnt, pnum) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = doReadv(stream, iov, iovcnt);
      HEAPU32[((pnum)>>2)] = num;
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }
  

  
  
  function _fd_seek(fd, offset, whence, newOffset) {
    offset = bigintToI53Checked(offset);
  
  
  try {
  
      if (isNaN(offset)) return 22;
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.llseek(stream, offset, whence);
      HEAP64[((newOffset)>>3)] = BigInt(stream.position);
      if (stream.getdents && !offset && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  ;
  }

  function _fd_sync(fd) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      var rtn = stream.stream_ops?.fsync?.(stream);
      return rtn;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }
  

  
  
  function _fd_write(fd, iov, iovcnt, pnum) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = doWritev(stream, iov, iovcnt);
      HEAPU32[((pnum)>>2)] = num;
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }
  

  
  
  
  
  
  
  
  
  
  
  var _getaddrinfo = (node, service, hint, out) => {
      // Note getaddrinfo currently only returns a single addrinfo with ai_next defaulting to NULL. When NULL
      // hints are specified or ai_family set to AF_UNSPEC or ai_socktype or ai_protocol set to 0 then we
      // really should provide a linked list of suitable addrinfo values.
      var addrs = [];
      var canon = null;
      var addr = 0;
      var port = 0;
      var flags = 0;
      var family = 0;
      var type = 0;
      var proto = 0;
      var ai, last;
  
      function allocaddrinfo(family, type, proto, canon, addr, port) {
        var sa, salen, ai;
        var errno;
  
        salen = family === 10 ?
          28 :
          16;
        addr = family === 10 ?
          inetNtop6(addr) :
          inetNtop4(addr);
        sa = _malloc(salen);
        errno = writeSockaddr(sa, family, addr, port);
        assert(!errno);
  
        ai = _malloc(32);
        HEAP32[(((ai)+(4))>>2)] = family;
        HEAP32[(((ai)+(8))>>2)] = type;
        HEAP32[(((ai)+(12))>>2)] = proto;
        HEAPU32[(((ai)+(24))>>2)] = canon;
        HEAPU32[(((ai)+(20))>>2)] = sa;
        if (family === 10) {
          HEAP32[(((ai)+(16))>>2)] = 28;
        } else {
          HEAP32[(((ai)+(16))>>2)] = 16;
        }
        HEAP32[(((ai)+(28))>>2)] = 0;
  
        return ai;
      }
  
      if (hint) {
        flags = HEAP32[((hint)>>2)];
        family = HEAP32[(((hint)+(4))>>2)];
        type = HEAP32[(((hint)+(8))>>2)];
        proto = HEAP32[(((hint)+(12))>>2)];
      }
      if (type && !proto) {
        proto = type === 2 ? 17 : 6;
      }
      if (!type && proto) {
        type = proto === 17 ? 2 : 1;
      }
  
      // If type or proto are set to zero in hints we should really be returning multiple addrinfo values, but for
      // now default to a TCP STREAM socket so we can at least return a sensible addrinfo given NULL hints.
      if (!proto) {
        proto = 6;
      }
      if (!type) {
        type = 1;
      }
  
      if (!node && !service) {
        return -2;
      }
      if (flags & ~(1|2|4|
          1024|8|16|32)) {
        return -1;
      }
      if (hint && (HEAP32[((hint)>>2)] & 2) && !node) {
        return -1;
      }
      if (flags & 32) {
        // TODO
        return -2;
      }
      if (type && type !== 1 && type !== 2) {
        return -7;
      }
      if (family !== 0 && family !== 2 && family !== 10) {
        return -6;
      }
  
      if (service) {
        service = UTF8ToString(service);
        port = parseInt(service, 10);
  
        if (isNaN(port)) {
          if (flags & 1024) {
            return -2;
          }
          // TODO support resolving well-known service names from:
          // http://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.txt
          return -8;
        }
      }
  
      if (!node) {
        if (family === 0) {
          family = 2;
        }
        if (!(flags & 1)) {
          if (family === 2) {
            addr = _htonl(2130706433);
          } else {
            addr = [0, 0, 0, _htonl(1)];
          }
        }
        ai = allocaddrinfo(family, type, proto, null, addr, port);
        HEAPU32[((out)>>2)] = ai;
        return 0;
      }
  
      //
      // try as a numeric address
      //
      node = UTF8ToString(node);
      addr = inetPton4(node);
      if (addr !== null) {
        // incoming node is a valid ipv4 address
        if (family === 0 || family === 2) {
          family = 2;
        }
        else if (family === 10 && (flags & 8)) {
          addr = [0, 0, _htonl(0xffff), addr];
          family = 10;
        } else {
          return -2;
        }
      } else {
        addr = inetPton6(node);
        if (addr !== null) {
          // incoming node is a valid ipv6 address
          if (family === 0 || family === 10) {
            family = 10;
          } else {
            return -2;
          }
        }
      }
      if (addr != null) {
        ai = allocaddrinfo(family, type, proto, node, addr, port);
        HEAPU32[((out)>>2)] = ai;
        return 0;
      }
      if (flags & 4) {
        return -2;
      }
  
      //
      // try as a hostname
      //
      // resolve the hostname to a temporary fake address
      node = DNS.lookup_name(node);
      addr = inetPton4(node);
      if (family === 0) {
        family = 2;
      } else if (family === 10) {
        addr = [0, 0, _htonl(0xffff), addr];
      }
      ai = allocaddrinfo(family, type, proto, null, addr, port);
      HEAPU32[((out)>>2)] = ai;
      return 0;
    };

  
  
  var _getnameinfo = (sa, salen, node, nodelen, serv, servlen, flags) => {
      var info = readSockaddr(sa, salen);
      if (info.errno) {
        return -6;
      }
      var port = info.port;
      var addr = info.addr;
  
      var overflowed = false;
  
      if (node && nodelen) {
        var lookup;
        if ((flags & 1) || !(lookup = DNS.lookup_addr(addr))) {
          if (flags & 8) {
            return -2;
          }
        } else {
          addr = lookup;
        }
        var numBytesWrittenExclNull = stringToUTF8(addr, node, nodelen);
  
        if (numBytesWrittenExclNull+1 >= nodelen) {
          overflowed = true;
        }
      }
  
      if (serv && servlen) {
        port = '' + port;
        var numBytesWrittenExclNull = stringToUTF8(port, serv, servlen);
  
        if (numBytesWrittenExclNull+1 >= servlen) {
          overflowed = true;
        }
      }
  
      if (overflowed) {
        // Note: even when we overflow, getnameinfo() is specced to write out the truncated results.
        return -12;
      }
  
      return 0;
    };

  var Protocols = {
  list:[],
  map:{
  },
  };
  
  var stringToAscii = (str, buffer) => {
      for (var i = 0; i < str.length; ++i) {
        assert(str.charCodeAt(i) === (str.charCodeAt(i) & 0xff));
        HEAP8[buffer++] = str.charCodeAt(i);
      }
      // Null-terminate the string
      HEAP8[buffer] = 0;
    };
  
  
  
  var _setprotoent = (stayopen) => {
      // void setprotoent(int stayopen);
  
      // Allocate and populate a protoent structure given a name, protocol number and array of aliases
      function allocprotoent(name, proto, aliases) {
        // write name into buffer
        var nameBuf = _malloc(name.length + 1);
        stringToAscii(name, nameBuf);
  
        // write aliases into buffer
        var j = 0;
        var length = aliases.length;
        var aliasListBuf = _malloc((length + 1) * 4); // Use length + 1 so we have space for the terminating NULL ptr.
  
        for (var i = 0; i < length; i++, j += 4) {
          var alias = aliases[i];
          var aliasBuf = _malloc(alias.length + 1);
          stringToAscii(alias, aliasBuf);
          HEAPU32[(((aliasListBuf)+(j))>>2)] = aliasBuf;
        }
        HEAPU32[(((aliasListBuf)+(j))>>2)] = 0; // Terminating NULL pointer.
  
        // generate protoent
        var pe = _malloc(12);
        HEAPU32[((pe)>>2)] = nameBuf;
        HEAPU32[(((pe)+(4))>>2)] = aliasListBuf;
        HEAP32[(((pe)+(8))>>2)] = proto;
        return pe;
      };
  
      // Populate the protocol 'database'. The entries are limited to tcp and udp, though it is fairly trivial
      // to add extra entries from /etc/protocols if desired - though not sure if that'd actually be useful.
      var list = Protocols.list;
      var map  = Protocols.map;
      if (!list.length) {
          var entry = allocprotoent('tcp', 6, ['TCP']);
          list.push(entry);
          map['tcp'] = map['6'] = entry;
          entry = allocprotoent('udp', 17, ['UDP']);
          list.push(entry);
          map['udp'] = map['17'] = entry;
      }
  
      _setprotoent.index = 0;
    };
  
  
  var _getprotobyname = (name) => {
      // struct protoent *getprotobyname(const char *);
      name = UTF8ToString(name);
      _setprotoent(true);
      var result = Protocols.map[name];
      return result;
    };

  var _emscripten_glActiveTexture = (x0) => GLctx.activeTexture(x0);
  var _glActiveTexture = _emscripten_glActiveTexture;

  var _emscripten_glAttachShader = (program, shader) => {
      GLctx.attachShader(GL.programs[program], GL.shaders[shader]);
    };
  var _glAttachShader = _emscripten_glAttachShader;

  var _emscripten_glBeginQuery = (target, id) => {
      GLctx.beginQuery(target, GL.queries[id]);
    };
  var _glBeginQuery = _emscripten_glBeginQuery;

  var _emscripten_glBindBuffer = (target, buffer) => {
      // Calling glBindBuffer with an unknown buffer will implicitly create a
      // new one.  Here we bypass `GL.counter` and directly using the ID passed
      // in.
      if (buffer && !GL.buffers[buffer]) {
        var b = GLctx.createBuffer();
        b.name = buffer;
        GL.buffers[buffer] = b;
      }
      if (target == 0x8892 /*GL_ARRAY_BUFFER*/) {
        GLctx.currentArrayBufferBinding = buffer;
      } else if (target == 0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/) {
        GLctx.currentElementArrayBufferBinding = buffer;
      }
  
      if (target == 0x88EB /*GL_PIXEL_PACK_BUFFER*/) {
        // In WebGL 2 glReadPixels entry point, we need to use a different WebGL 2
        // API function call when a buffer is bound to
        // GL_PIXEL_PACK_BUFFER_BINDING point, so must keep track whether that
        // binding point is non-null to know what is the proper API function to
        // call.
        GLctx.currentPixelPackBufferBinding = buffer;
      } else if (target == 0x88EC /*GL_PIXEL_UNPACK_BUFFER*/) {
        // In WebGL 2 gl(Compressed)Tex(Sub)Image[23]D entry points, we need to
        // use a different WebGL 2 API function call when a buffer is bound to
        // GL_PIXEL_UNPACK_BUFFER_BINDING point, so must keep track whether that
        // binding point is non-null to know what is the proper API function to
        // call.
        GLctx.currentPixelUnpackBufferBinding = buffer;
      }
      GLctx.bindBuffer(target, GL.buffers[buffer]);
    };
  var _glBindBuffer = _emscripten_glBindBuffer;

  var _emscripten_glBindFramebuffer = (target, framebuffer) => {
  
      GLctx.bindFramebuffer(target, GL.framebuffers[framebuffer]);
  
    };
  var _glBindFramebuffer = _emscripten_glBindFramebuffer;

  var _emscripten_glBindRenderbuffer = (target, renderbuffer) => {
      GLctx.bindRenderbuffer(target, GL.renderbuffers[renderbuffer]);
    };
  var _glBindRenderbuffer = _emscripten_glBindRenderbuffer;

  var _emscripten_glBindTexture = (target, texture) => {
      GLctx.bindTexture(target, GL.textures[texture]);
    };
  var _glBindTexture = _emscripten_glBindTexture;

  var _emscripten_glBindVertexArray = (vao) => {
      GLctx.bindVertexArray(GL.vaos[vao]);
      var ibo = GLctx.getParameter(0x8895 /*ELEMENT_ARRAY_BUFFER_BINDING*/);
      GLctx.currentElementArrayBufferBinding = ibo ? (ibo.name | 0) : 0;
    };
  var _glBindVertexArray = _emscripten_glBindVertexArray;

  var _emscripten_glBlendEquation = (x0) => GLctx.blendEquation(x0);
  var _glBlendEquation = _emscripten_glBlendEquation;

  var _emscripten_glBlendFunc = (x0, x1) => GLctx.blendFunc(x0, x1);
  var _glBlendFunc = _emscripten_glBlendFunc;

  
  var _emscripten_glBufferData = (target, size, data, usage) => {
  
      if (true) {
        // If size is zero, WebGL would interpret uploading the whole input
        // arraybuffer (starting from given offset), which would not make sense in
        // WebAssembly, so avoid uploading if size is zero. However we must still
        // call bufferData to establish a backing storage of zero bytes.
        if (data && size) {
          GLctx.bufferData(target, HEAPU8, usage, data, size);
        } else {
          GLctx.bufferData(target, size, usage);
        }
        return;
      }
    };
  var _glBufferData = _emscripten_glBufferData;

  
  var _emscripten_glBufferSubData = (target, offset, size, data) => webglBufferSubData(target, offset, size, data);
  var _glBufferSubData = _emscripten_glBufferSubData;

  var _emscripten_glCheckFramebufferStatus = (x0) => GLctx.checkFramebufferStatus(x0);
  var _glCheckFramebufferStatus = _emscripten_glCheckFramebufferStatus;

  var _emscripten_glClear = (x0) => GLctx.clear(x0);
  var _glClear = _emscripten_glClear;

  var _emscripten_glClearColor = (x0, x1, x2, x3) => GLctx.clearColor(x0, x1, x2, x3);
  var _glClearColor = _emscripten_glClearColor;

  var _emscripten_glClearDepthf = (x0) => GLctx.clearDepth(x0);
  var _glClearDepthf = _emscripten_glClearDepthf;

  var _emscripten_glClearStencil = (x0) => GLctx.clearStencil(x0);
  var _glClearStencil = _emscripten_glClearStencil;

  var _emscripten_glColorMask = (red, green, blue, alpha) => {
      GLctx.colorMask(!!red, !!green, !!blue, !!alpha);
    };
  var _glColorMask = _emscripten_glColorMask;

  var _emscripten_glCompileShader = (shader) => {
      GLctx.compileShader(GL.shaders[shader]);
    };
  var _glCompileShader = _emscripten_glCompileShader;

  
  var _emscripten_glCompressedTexImage2D = (target, level, internalFormat, width, height, border, imageSize, data) => {
      // `data` may be null here, which means "allocate uninitialized space but
      // don't upload" in GLES parlance, but `compressedTexImage2D` requires the
      // final data parameter, so we simply pass a heap view starting at zero
      // effectively uploading whatever happens to be near address zero.  See
      // https://github.com/emscripten-core/emscripten/issues/19300.
      if (true) {
        if (GLctx.currentPixelUnpackBufferBinding || !imageSize) {
          GLctx.compressedTexImage2D(target, level, internalFormat, width, height, border, imageSize, data);
          return;
        }
        GLctx.compressedTexImage2D(target, level, internalFormat, width, height, border, HEAPU8, data, imageSize);
        return;
      }
    };
  var _glCompressedTexImage2D = _emscripten_glCompressedTexImage2D;

  var _emscripten_glCreateProgram = () => {
      var id = GL.getNewId(GL.programs);
      var program = GLctx.createProgram();
      // Store additional information needed for each shader program:
      program.name = id;
      // Lazy cache results of
      // glGetProgramiv(GL_ACTIVE_UNIFORM_MAX_LENGTH/GL_ACTIVE_ATTRIBUTE_MAX_LENGTH/GL_ACTIVE_UNIFORM_BLOCK_MAX_NAME_LENGTH)
      program.maxUniformLength = program.maxAttributeLength = program.maxUniformBlockNameLength = 0;
      program.uniformIdCounter = 1;
      GL.programs[id] = program;
      return id;
    };
  var _glCreateProgram = _emscripten_glCreateProgram;

  var _emscripten_glCreateShader = (shaderType) => {
      var id = GL.getNewId(GL.shaders);
      GL.shaders[id] = GLctx.createShader(shaderType);
  
      return id;
    };
  var _glCreateShader = _emscripten_glCreateShader;

  var _emscripten_glCullFace = (x0) => GLctx.cullFace(x0);
  var _glCullFace = _emscripten_glCullFace;

  
  var _emscripten_glDeleteBuffers = (n, buffers) => {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((buffers)+(i*4))>>2)];
        var buffer = GL.buffers[id];
  
        // From spec: "glDeleteBuffers silently ignores 0's and names that do not
        // correspond to existing buffer objects."
        if (!buffer) continue;
  
        GLctx.deleteBuffer(buffer);
        buffer.name = 0;
        GL.buffers[id] = null;
  
        if (id == GLctx.currentArrayBufferBinding) GLctx.currentArrayBufferBinding = 0;
        if (id == GLctx.currentElementArrayBufferBinding) GLctx.currentElementArrayBufferBinding = 0;
        if (id == GLctx.currentPixelPackBufferBinding) GLctx.currentPixelPackBufferBinding = 0;
        if (id == GLctx.currentPixelUnpackBufferBinding) GLctx.currentPixelUnpackBufferBinding = 0;
      }
    };
  var _glDeleteBuffers = _emscripten_glDeleteBuffers;

  
  var _emscripten_glDeleteFramebuffers = (n, framebuffers) => {
      for (var i = 0; i < n; ++i) {
        var id = HEAP32[(((framebuffers)+(i*4))>>2)];
        var framebuffer = GL.framebuffers[id];
        if (!framebuffer) continue; // GL spec: "glDeleteFramebuffers silently ignores 0s and names that do not correspond to existing framebuffer objects".
        GLctx.deleteFramebuffer(framebuffer);
        framebuffer.name = 0;
        GL.framebuffers[id] = null;
      }
    };
  var _glDeleteFramebuffers = _emscripten_glDeleteFramebuffers;

  var _emscripten_glDeleteProgram = (id) => {
      if (!id) return;
      var program = GL.programs[id];
      if (!program) {
        // glDeleteProgram actually signals an error when deleting a nonexisting
        // object, unlike some other GL delete functions.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      GLctx.deleteProgram(program);
      program.name = 0;
      GL.programs[id] = null;
    };
  var _glDeleteProgram = _emscripten_glDeleteProgram;

  
  var _emscripten_glDeleteRenderbuffers = (n, renderbuffers) => {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((renderbuffers)+(i*4))>>2)];
        var renderbuffer = GL.renderbuffers[id];
        if (!renderbuffer) continue; // GL spec: "glDeleteRenderbuffers silently ignores 0s and names that do not correspond to existing renderbuffer objects".
        GLctx.deleteRenderbuffer(renderbuffer);
        renderbuffer.name = 0;
        GL.renderbuffers[id] = null;
      }
    };
  var _glDeleteRenderbuffers = _emscripten_glDeleteRenderbuffers;

  var _emscripten_glDeleteShader = (id) => {
      if (!id) return;
      var shader = GL.shaders[id];
      if (!shader) {
        // glDeleteShader actually signals an error when deleting a nonexisting
        // object, unlike some other GL delete functions.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      GLctx.deleteShader(shader);
      GL.shaders[id] = null;
    };
  var _glDeleteShader = _emscripten_glDeleteShader;

  
  var _emscripten_glDeleteTextures = (n, textures) => {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((textures)+(i*4))>>2)];
        var texture = GL.textures[id];
        // GL spec: "glDeleteTextures silently ignores 0s and names that do not
        // correspond to existing textures".
        if (!texture) continue;
        GLctx.deleteTexture(texture);
        texture.name = 0;
        GL.textures[id] = null;
      }
    };
  var _glDeleteTextures = _emscripten_glDeleteTextures;

  
  var _emscripten_glDeleteVertexArrays = (n, vaos) => {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((vaos)+(i*4))>>2)];
        GLctx.deleteVertexArray(GL.vaos[id]);
        GL.vaos[id] = null;
      }
    };
  var _glDeleteVertexArrays = _emscripten_glDeleteVertexArrays;

  var _emscripten_glDepthFunc = (x0) => GLctx.depthFunc(x0);
  var _glDepthFunc = _emscripten_glDepthFunc;

  var _emscripten_glDepthMask = (flag) => {
      GLctx.depthMask(!!flag);
    };
  var _glDepthMask = _emscripten_glDepthMask;

  var _emscripten_glDisable = (x0) => GLctx.disable(x0);
  var _glDisable = _emscripten_glDisable;

  var _emscripten_glDisableVertexAttribArray = (index) => {
      var cb = GL.currentContext.clientBuffers[index];
      cb.enabled = false;
      GLctx.disableVertexAttribArray(index);
    };
  var _glDisableVertexAttribArray = _emscripten_glDisableVertexAttribArray;

  var _emscripten_glDrawArrays = (mode, first, count) => {
      // bind any client-side buffers
      GL.preDrawHandleClientVertexAttribBindings(first + count);
  
      GLctx.drawArrays(mode, first, count);
  
      GL.postDrawHandleClientVertexAttribBindings();
    };
  var _glDrawArrays = _emscripten_glDrawArrays;

  
  
  var _emscripten_glDrawElements = (mode, count, type, indices) => {
      var buf;
      var vertexes = 0;
      if (!GLctx.currentElementArrayBufferBinding) {
        var size = GL.calcBufLength(1, type, 0, count);
        buf = GL.getTempIndexBuffer(size);
        GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, buf);
        webglBufferSubData(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, 0, size, indices);
  
        // Calculating vertex count if shader's attribute data is on client side
        if (count > 0) {
          for (var i = 0; i < GL.currentContext.maxVertexAttribs; ++i) {
            var cb = GL.currentContext.clientBuffers[i];
            if (cb.clientside && cb.enabled) {
              let arrayClass;
              switch(type) {
                case 0x1401 /* GL_UNSIGNED_BYTE */: arrayClass = Uint8Array; break;
                case 0x1403 /* GL_UNSIGNED_SHORT */: arrayClass = Uint16Array; break;
                case 0x1405 /* GL_UNSIGNED_INT */: arrayClass = Uint32Array; break;
                default:
                  GL.recordError(0x502 /* GL_INVALID_OPERATION */);
                  return;
              }
  
              vertexes = new arrayClass(HEAPU8.buffer, indices, count).reduce((max, current) => Math.max(max, current)) + 1;
              break;
            }
          }
        }
  
        // the index is now 0
        indices = 0;
      }
  
      // bind any client-side buffers
      GL.preDrawHandleClientVertexAttribBindings(vertexes);
  
      GLctx.drawElements(mode, count, type, indices);
  
      GL.postDrawHandleClientVertexAttribBindings(count);
  
      if (!GLctx.currentElementArrayBufferBinding) {
        GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, null);
      }
    };
  var _glDrawElements = _emscripten_glDrawElements;

  var _emscripten_glEnable = (x0) => GLctx.enable(x0);
  var _glEnable = _emscripten_glEnable;

  var _emscripten_glEnableVertexAttribArray = (index) => {
      var cb = GL.currentContext.clientBuffers[index];
      cb.enabled = true;
      GLctx.enableVertexAttribArray(index);
    };
  var _glEnableVertexAttribArray = _emscripten_glEnableVertexAttribArray;

  var _emscripten_glEndQuery = (x0) => GLctx.endQuery(x0);
  var _glEndQuery = _emscripten_glEndQuery;

  var _emscripten_glFramebufferRenderbuffer = (target, attachment, renderbuffertarget, renderbuffer) => {
      GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget,
                                         GL.renderbuffers[renderbuffer]);
    };
  var _glFramebufferRenderbuffer = _emscripten_glFramebufferRenderbuffer;

  var _emscripten_glFramebufferTexture2D = (target, attachment, textarget, texture, level) => {
      GLctx.framebufferTexture2D(target, attachment, textarget,
                                      GL.textures[texture], level);
    };
  var _glFramebufferTexture2D = _emscripten_glFramebufferTexture2D;

  var _emscripten_glGenBuffers = (n, buffers) => {
      GL.genObject(n, buffers, 'createBuffer', GL.buffers
        );
    };
  var _glGenBuffers = _emscripten_glGenBuffers;

  var _emscripten_glGenFramebuffers = (n, ids) => {
      GL.genObject(n, ids, 'createFramebuffer', GL.framebuffers
        );
    };
  var _glGenFramebuffers = _emscripten_glGenFramebuffers;

  var _emscripten_glGenQueries = (n, ids) => {
      GL.genObject(n, ids, 'createQuery', GL.queries
        );
    };
  var _glGenQueries = _emscripten_glGenQueries;

  var _emscripten_glGenRenderbuffers = (n, renderbuffers) => {
      GL.genObject(n, renderbuffers, 'createRenderbuffer', GL.renderbuffers
        );
    };
  var _glGenRenderbuffers = _emscripten_glGenRenderbuffers;

  var _emscripten_glGenTextures = (n, textures) => {
      GL.genObject(n, textures, 'createTexture', GL.textures
        );
    };
  var _glGenTextures = _emscripten_glGenTextures;

  var _emscripten_glGenVertexArrays = (n, arrays) => {
      GL.genObject(n, arrays, 'createVertexArray', GL.vaos
        );
    };
  var _glGenVertexArrays = _emscripten_glGenVertexArrays;

  
  var _emscripten_glGetAttribLocation = (program, name) =>
      GLctx.getAttribLocation(GL.programs[program], UTF8ToString(name));
  var _glGetAttribLocation = _emscripten_glGetAttribLocation;

  var _emscripten_glGetError = () => {
      var error = GLctx.getError() || GL.lastError;
      GL.lastError = 0/*GL_NO_ERROR*/;
      return error;
    };
  var _glGetError = _emscripten_glGetError;

  
  var readI53FromU64 = (ptr) => {
      return HEAPU32[((ptr)>>2)] + HEAPU32[(((ptr)+(4))>>2)] * 4294967296;
    };
  
  var writeI53ToI64 = (ptr, num) => {
      HEAPU32[((ptr)>>2)] = num;
      var lower = HEAPU32[((ptr)>>2)];
      HEAPU32[(((ptr)+(4))>>2)] = (num - lower)/4294967296;
      var deserialized = (num >= 0) ? readI53FromU64(ptr) : readI53FromI64(ptr);
      var offset = ((ptr)>>2);
      if (deserialized != num) warnOnce(`writeI53ToI64() out of range: serialized JS Number ${num} to Wasm heap as bytes lo=${ptrToString(HEAPU32[offset])}, hi=${ptrToString(HEAPU32[offset+1])}, which deserializes back to ${deserialized} instead!`);
    };
  
  
  var webglGetExtensions = () => {
      var exts = getEmscriptenSupportedExtensions(GLctx);
      exts = exts.concat(exts.map((e) => 'GL_' + e));
      return exts;
    };
  
  
  
  
  /** @type {!Float32Array} */
  var HEAPF32;
  var emscriptenWebGLGet = (name_, p, type) => {
      // Guard against user passing a null pointer.
      // Note that GLES2 spec does not say anything about how passing a null
      // pointer should be treated.  Testing on desktop core GL 3, the application
      // crashes on glGetIntegerv to a null pointer, but better to report an error
      // instead of doing anything random.
      if (!p) {
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      var ret = undefined;
      switch (name_) { // Handle a few trivial GLES values
        case 0x8DFA: // GL_SHADER_COMPILER
          ret = 1;
          break;
        case 0x8DF8: // GL_SHADER_BINARY_FORMATS
          if (type != 0 && type != 1) {
            GL.recordError(0x500); // GL_INVALID_ENUM
          }
          // Do not write anything to the out pointer, since no binary formats are
          // supported.
          return;
        case 0x87FE: // GL_NUM_PROGRAM_BINARY_FORMATS
        case 0x8DF9: // GL_NUM_SHADER_BINARY_FORMATS
          ret = 0;
          break;
        case 0x86A2: // GL_NUM_COMPRESSED_TEXTURE_FORMATS
          // WebGL doesn't have GL_NUM_COMPRESSED_TEXTURE_FORMATS (it's obsolete
          // since GL_COMPRESSED_TEXTURE_FORMATS returns a JS array that can be
          // queried for length), so implement it ourselves to allow C++ GLES2
          // code to get the length.
          var formats = GLctx.getParameter(0x86A3 /*GL_COMPRESSED_TEXTURE_FORMATS*/);
          ret = formats ? formats.length : 0;
          break;
  
        case 0x821D: // GL_NUM_EXTENSIONS
          if (GL.currentContext.version < 2) {
            // Calling GLES3/WebGL2 function with a GLES2/WebGL1 context
            GL.recordError(0x502 /* GL_INVALID_OPERATION */);
            return;
          }
          ret = webglGetExtensions().length;
          break;
        case 0x821B: // GL_MAJOR_VERSION
        case 0x821C: // GL_MINOR_VERSION
          if (GL.currentContext.version < 2) {
            GL.recordError(0x500); // GL_INVALID_ENUM
            return;
          }
          ret = name_ == 0x821B ? 3 : 0; // return version 3.0
          break;
      }
  
      if (ret === undefined) {
        var result = GLctx.getParameter(name_);
        switch (typeof result) {
          case 'number':
            ret = result;
            break;
          case 'boolean':
            ret = result ? 1 : 0;
            break;
          case 'string':
            GL.recordError(0x500); // GL_INVALID_ENUM
            return;
          case 'object':
            if (result === null) {
              // null is a valid result for some (e.g., which buffer is bound -
              // perhaps nothing is bound), but otherwise can mean an invalid
              // name_, which we need to report as an error
              switch (name_) {
                case 0x8894: // ARRAY_BUFFER_BINDING
                case 0x8B8D: // CURRENT_PROGRAM
                case 0x8895: // ELEMENT_ARRAY_BUFFER_BINDING
                case 0x8CA6: // FRAMEBUFFER_BINDING or DRAW_FRAMEBUFFER_BINDING
                case 0x8CA7: // RENDERBUFFER_BINDING
                case 0x8069: // TEXTURE_BINDING_2D
                case 0x85B5: // WebGL 2 GL_VERTEX_ARRAY_BINDING, or WebGL 1 extension OES_vertex_array_object GL_VERTEX_ARRAY_BINDING_OES
                case 0x8F36: // COPY_READ_BUFFER_BINDING or COPY_READ_BUFFER
                case 0x8F37: // COPY_WRITE_BUFFER_BINDING or COPY_WRITE_BUFFER
                case 0x88ED: // PIXEL_PACK_BUFFER_BINDING
                case 0x88EF: // PIXEL_UNPACK_BUFFER_BINDING
                case 0x8CAA: // READ_FRAMEBUFFER_BINDING
                case 0x8919: // SAMPLER_BINDING
                case 0x8C1D: // TEXTURE_BINDING_2D_ARRAY
                case 0x806A: // TEXTURE_BINDING_3D
                case 0x8E25: // TRANSFORM_FEEDBACK_BINDING
                case 0x8C8F: // TRANSFORM_FEEDBACK_BUFFER_BINDING
                case 0x8A28: // UNIFORM_BUFFER_BINDING
                case 0x8514: { // TEXTURE_BINDING_CUBE_MAP
                  ret = 0;
                  break;
                }
                default: {
                  GL.recordError(0x500); // GL_INVALID_ENUM
                  return;
                }
              }
            } else if (result instanceof Float32Array ||
                       result instanceof Uint32Array ||
                       result instanceof Int32Array ||
                       result instanceof Array) {
              for (var i = 0; i < result.length; ++i) {
                switch (type) {
                  case 0: HEAP32[(((p)+(i*4))>>2)] = result[i]; break;
                  case 2: HEAPF32[(((p)+(i*4))>>2)] = result[i]; break;
                  case 4: HEAP8[(p)+(i)] = result[i] ? 1 : 0; break;
                }
              }
              return;
            } else {
              try {
                ret = result.name | 0;
              } catch(e) {
                GL.recordError(0x500); // GL_INVALID_ENUM
                err(`GL_INVALID_ENUM in glGet${type}v: Unknown object returned from WebGL getParameter(${name_})! (error: ${e})`);
                return;
              }
            }
            break;
          default:
            GL.recordError(0x500); // GL_INVALID_ENUM
            err(`GL_INVALID_ENUM in glGet${type}v: Native code calling glGet${type}v(${name_}) and it returns ${result} of type ${typeof(result)}!`);
            return;
        }
      }
  
      switch (type) {
        case 1: writeI53ToI64(p, ret); break;
        case 0: HEAP32[((p)>>2)] = ret; break;
        case 2:   HEAPF32[((p)>>2)] = ret; break;
        case 4: HEAP8[p] = ret ? 1 : 0; break;
      }
    };
  
  var _emscripten_glGetIntegerv = (name_, p) => emscriptenWebGLGet(name_, p, 0);
  var _glGetIntegerv = _emscripten_glGetIntegerv;

  
  var _emscripten_glGetProgramInfoLog = (program, maxLength, length, infoLog) => {
      var log = GLctx.getProgramInfoLog(GL.programs[program]);
      if (log === null) log = '(unknown error)';
      var numBytesWrittenExclNull = (maxLength > 0 && infoLog) ? stringToUTF8(log, infoLog, maxLength) : 0;
      if (length) HEAP32[((length)>>2)] = numBytesWrittenExclNull;
    };
  var _glGetProgramInfoLog = _emscripten_glGetProgramInfoLog;

  
  var _emscripten_glGetProgramiv = (program, pname, p) => {
      if (!p) {
        // GLES2 specification does not specify how to behave if p is a null
        // pointer. Since calling this function does not make sense if p == null,
        // issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
  
      if (program >= GL.counter) {
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
  
      program = GL.programs[program];
  
      if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
        var log = GLctx.getProgramInfoLog(program);
        if (log === null) log = '(unknown error)';
        HEAP32[((p)>>2)] = log.length + 1;
      } else if (pname == 0x8B87 /* GL_ACTIVE_UNIFORM_MAX_LENGTH */) {
        if (!program.maxUniformLength) {
          var numActiveUniforms = GLctx.getProgramParameter(program, 0x8B86/*GL_ACTIVE_UNIFORMS*/);
          for (var i = 0; i < numActiveUniforms; ++i) {
            program.maxUniformLength = Math.max(program.maxUniformLength, GLctx.getActiveUniform(program, i).name.length+1);
          }
        }
        HEAP32[((p)>>2)] = program.maxUniformLength;
      } else if (pname == 0x8B8A /* GL_ACTIVE_ATTRIBUTE_MAX_LENGTH */) {
        if (!program.maxAttributeLength) {
          var numActiveAttributes = GLctx.getProgramParameter(program, 0x8B89/*GL_ACTIVE_ATTRIBUTES*/);
          for (var i = 0; i < numActiveAttributes; ++i) {
            program.maxAttributeLength = Math.max(program.maxAttributeLength, GLctx.getActiveAttrib(program, i).name.length+1);
          }
        }
        HEAP32[((p)>>2)] = program.maxAttributeLength;
      } else if (pname == 0x8A35 /* GL_ACTIVE_UNIFORM_BLOCK_MAX_NAME_LENGTH */) {
        if (!program.maxUniformBlockNameLength) {
          var numActiveUniformBlocks = GLctx.getProgramParameter(program, 0x8A36/*GL_ACTIVE_UNIFORM_BLOCKS*/);
          for (var i = 0; i < numActiveUniformBlocks; ++i) {
            program.maxUniformBlockNameLength = Math.max(program.maxUniformBlockNameLength, GLctx.getActiveUniformBlockName(program, i).length+1);
          }
        }
        HEAP32[((p)>>2)] = program.maxUniformBlockNameLength;
      } else {
        HEAP32[((p)>>2)] = GLctx.getProgramParameter(program, pname);
      }
    };
  var _glGetProgramiv = _emscripten_glGetProgramiv;

  var _emscripten_glGetQueryObjectuiv = (id, pname, params) => {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      var query = GL.queries[id];
      var param = GLctx.getQueryParameter(query, pname);
      var ret;
      if (typeof param == 'boolean') {
        ret = param ? 1 : 0;
      } else {
        ret = param;
      }
      HEAP32[((params)>>2)] = ret;
    };
  var _glGetQueryObjectuiv = _emscripten_glGetQueryObjectuiv;

  
  
  var _emscripten_glGetShaderInfoLog = (shader, maxLength, length, infoLog) => {
      var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
      if (log === null) log = '(unknown error)';
      var numBytesWrittenExclNull = (maxLength > 0 && infoLog) ? stringToUTF8(log, infoLog, maxLength) : 0;
      if (length) HEAP32[((length)>>2)] = numBytesWrittenExclNull;
    };
  var _glGetShaderInfoLog = _emscripten_glGetShaderInfoLog;

  
  var _emscripten_glGetShaderiv = (shader, pname, p) => {
      if (!p) {
        // GLES2 specification does not specify how to behave if p is a null
        // pointer. Since calling this function does not make sense if p == null,
        // issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
        var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
        if (log === null) log = '(unknown error)';
        // The GLES2 specification says that if the shader has an empty info log,
        // a value of 0 is returned. Otherwise the log has a null char appended.
        // (An empty string is falsey, so we can just check that instead of
        // looking at log.length.)
        var logLength = log ? log.length + 1 : 0;
        HEAP32[((p)>>2)] = logLength;
      } else if (pname == 0x8B88) { // GL_SHADER_SOURCE_LENGTH
        var source = GLctx.getShaderSource(GL.shaders[shader]);
        // source may be a null, or the empty string, both of which are falsey
        // values that we report a 0 length for.
        var sourceLength = source ? source.length + 1 : 0;
        HEAP32[((p)>>2)] = sourceLength;
      } else {
        HEAP32[((p)>>2)] = GLctx.getShaderParameter(GL.shaders[shader], pname);
      }
    };
  var _glGetShaderiv = _emscripten_glGetShaderiv;

  /** @suppress {checkTypes} */
  var jstoi_q = (str) => parseInt(str);
  
  /** @noinline */
  var webglGetLeftBracePos = (name) => name.slice(-1) == ']' && name.lastIndexOf('[');
  
  var webglPrepareUniformLocationsBeforeFirstUse = (program) => {
      var uniformLocsById = program.uniformLocsById, // Maps GLuint -> WebGLUniformLocation
        uniformSizeAndIdsByName = program.uniformSizeAndIdsByName, // Maps name -> [uniform array length, GLuint]
        i, j;
  
      // On the first time invocation of glGetUniformLocation on this shader program:
      // initialize cache data structures and discover which uniforms are arrays.
      if (!uniformLocsById) {
        // maps GLint integer locations to WebGLUniformLocations
        program.uniformLocsById = uniformLocsById = {};
        // maps integer locations back to uniform name strings, so that we can lazily fetch uniform array locations
        program.uniformArrayNamesById = {};
  
        var numActiveUniforms = GLctx.getProgramParameter(program, 0x8B86/*GL_ACTIVE_UNIFORMS*/);
        for (i = 0; i < numActiveUniforms; ++i) {
          var u = GLctx.getActiveUniform(program, i);
          var nm = u.name;
          var sz = u.size;
          var lb = webglGetLeftBracePos(nm);
          var arrayName = lb > 0 ? nm.slice(0, lb) : nm;
  
          // Assign a new location.
          var id = program.uniformIdCounter;
          program.uniformIdCounter += sz;
          // Eagerly get the location of the uniformArray[0] base element.
          // The remaining indices >0 will be left for lazy evaluation to
          // improve performance. Those may never be needed to fetch, if the
          // application fills arrays always in full starting from the first
          // element of the array.
          uniformSizeAndIdsByName[arrayName] = [sz, id];
  
          // Store placeholder integers in place that highlight that these
          // >0 index locations are array indices pending population.
          for (j = 0; j < sz; ++j) {
            uniformLocsById[id] = j;
            program.uniformArrayNamesById[id++] = arrayName;
          }
        }
      }
    };
  
  
  
  var _emscripten_glGetUniformLocation = (program, name) => {
  
      name = UTF8ToString(name);
  
      if (program = GL.programs[program]) {
        webglPrepareUniformLocationsBeforeFirstUse(program);
        var uniformLocsById = program.uniformLocsById; // Maps GLuint -> WebGLUniformLocation
        var arrayIndex = 0;
        var uniformBaseName = name;
  
        // Invariant: when populating integer IDs for uniform locations, we must
        // maintain the precondition that arrays reside in contiguous addresses,
        // i.e. for a 'vec4 colors[10];', colors[4] must be at location
        // colors[0]+4.  However, user might call glGetUniformLocation(program,
        // "colors") for an array, so we cannot discover based on the user input
        // arguments whether the uniform we are dealing with is an array. The only
        // way to discover which uniforms are arrays is to enumerate over all the
        // active uniforms in the program.
        var leftBrace = webglGetLeftBracePos(name);
  
        // If user passed an array accessor "[index]", parse the array index off the accessor.
        if (leftBrace > 0) {
          arrayIndex = jstoi_q(name.slice(leftBrace + 1)) >>> 0; // "index]", coerce parseInt(']') with >>>0 to treat "foo[]" as "foo[0]" and foo[-1] as unsigned out-of-bounds.
          uniformBaseName = name.slice(0, leftBrace);
        }
  
        // Have we cached the location of this uniform before?
        // A pair [array length, GLint of the uniform location]
        var sizeAndId = program.uniformSizeAndIdsByName[uniformBaseName];
  
        // If a uniform with this name exists, and if its index is within the
        // array limits (if it's even an array), query the WebGLlocation, or
        // return an existing cached location.
        if (sizeAndId && arrayIndex < sizeAndId[0]) {
          arrayIndex += sizeAndId[1]; // Add the base location of the uniform to the array index offset.
          if ((uniformLocsById[arrayIndex] = uniformLocsById[arrayIndex] || GLctx.getUniformLocation(program, name))) {
            return arrayIndex;
          }
        }
      }
      else {
        // N.b. we are currently unable to distinguish between GL program IDs that
        // never existed vs GL program IDs that have been deleted, so report
        // GL_INVALID_VALUE in both cases.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
      }
      return -1;
    };
  var _glGetUniformLocation = _emscripten_glGetUniformLocation;

  var _emscripten_glIsEnabled = (x0) => GLctx.isEnabled(x0);
  var _glIsEnabled = _emscripten_glIsEnabled;

  var _emscripten_glLinkProgram = (program) => {
      program = GL.programs[program];
      GLctx.linkProgram(program);
      // Invalidate earlier computed uniform->ID mappings, those have now become stale
      program.uniformLocsById = 0; // Mark as null-like so that glGetUniformLocation() knows to populate this again.
      program.uniformSizeAndIdsByName = {};
  
    };
  var _glLinkProgram = _emscripten_glLinkProgram;

  
  
  
  
  
  
  
  var heapObjectForWebGLType = (type) => {
      // Micro-optimization for size: Subtract lowest GL enum number (0x1400/* GL_BYTE */) from type to compare
      // smaller values for the heap, for shorter generated code size.
      // Also the type HEAPU16 is not tested for explicitly, but any unrecognized type will return out HEAPU16.
      // (since most types are HEAPU16)
      type -= 0x1400;
      if (type == 0) return HEAP8;
  
      if (type == 1) return HEAPU8;
  
      if (type == 2) return HEAP16;
  
      if (type == 4) return HEAP32;
  
      if (type == 6) return HEAPF32;
  
      if (type == 5
        || type == 28922
        || type == 28520
        || type == 30779
        || type == 30782
        )
        return HEAPU32;
  
      return HEAPU16;
    };
  
  var toTypedArrayIndex = (pointer, heap) =>
      pointer >>> (31 - Math.clz32(heap.BYTES_PER_ELEMENT));
  
  var _emscripten_glReadPixels = (x, y, width, height, format, type, pixels) => {
      if (true) {
        if (GLctx.currentPixelPackBufferBinding) {
          GLctx.readPixels(x, y, width, height, format, type, pixels);
          return;
        }
        var heap = heapObjectForWebGLType(type);
        var target = toTypedArrayIndex(pixels, heap);
        GLctx.readPixels(x, y, width, height, format, type, heap, target);
        return;
      }
    };
  var _glReadPixels = _emscripten_glReadPixels;

  var _emscripten_glRenderbufferStorage = (x0, x1, x2, x3) => GLctx.renderbufferStorage(x0, x1, x2, x3);
  var _glRenderbufferStorage = _emscripten_glRenderbufferStorage;

  var _emscripten_glShaderSource = (shader, count, string, length) => {
      var source = GL.getSource(shader, count, string, length);
  
      GLctx.shaderSource(GL.shaders[shader], source);
    };
  var _glShaderSource = _emscripten_glShaderSource;

  var computeUnpackAlignedImageSize = (width, height, sizePerPixel) => {
      function roundedToNextMultipleOf(x, y) {
        return (x + y - 1) & -y;
      }
      var plainRowSize = (GL.unpackRowLength || width) * sizePerPixel;
      var alignedRowSize = roundedToNextMultipleOf(plainRowSize, GL.unpackAlignment);
      return height * alignedRowSize;
    };
  
  var colorChannelsInGlTextureFormat = (format) => {
      // Micro-optimizations for size: map format to size by subtracting smallest
      // enum value (0x1902) from all values first.  Also omit the most common
      // size value (1) from the list, which is assumed by formats not on the
      // list.
      var colorChannels = {
        // 0x1902 /* GL_DEPTH_COMPONENT */ - 0x1902: 1,
        // 0x1906 /* GL_ALPHA */ - 0x1902: 1,
        5: 3,
        6: 4,
        // 0x1909 /* GL_LUMINANCE */ - 0x1902: 1,
        8: 2,
        29502: 3,
        29504: 4,
        // 0x1903 /* GL_RED */ - 0x1902: 1,
        26917: 2,
        26918: 2,
        // 0x8D94 /* GL_RED_INTEGER */ - 0x1902: 1,
        29846: 3,
        29847: 4
      };
      return colorChannels[format - 0x1902]||1;
    };
  
  
  
  var emscriptenWebGLGetTexPixelData = (type, format, width, height, pixels) => {
      var heap = heapObjectForWebGLType(type);
      var sizePerPixel = colorChannelsInGlTextureFormat(format) * heap.BYTES_PER_ELEMENT;
      var bytes = computeUnpackAlignedImageSize(width, height, sizePerPixel);
      return heap.subarray(toTypedArrayIndex(pixels, heap), toTypedArrayIndex(pixels + bytes, heap));
    };
  
  
  
  var _emscripten_glTexImage2D = (target, level, internalFormat, width, height, border, format, type, pixels) => {
      if (true) {
        if (GLctx.currentPixelUnpackBufferBinding) {
          GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels);
          return;
        }
        if (pixels) {
          var heap = heapObjectForWebGLType(type);
          var index = toTypedArrayIndex(pixels, heap);
          GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, heap, index);
          return;
        }
      }
      var pixelData = pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels) : null;
      GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixelData);
    };
  var _glTexImage2D = _emscripten_glTexImage2D;

  var _emscripten_glTexParameteri = (x0, x1, x2) => GLctx.texParameteri(x0, x1, x2);
  var _glTexParameteri = _emscripten_glTexParameteri;

  
  var webglGetProgramUniformLocation = (program, location) => {
  
      if (program) {
        var webglLoc = program.uniformLocsById[location];
        // program.uniformLocsById[location] stores either an integer, or a
        // WebGLUniformLocation.
        // If an integer, we have not yet bound the location, so do it now. The
        // integer value specifies the array index we should bind to.
        if (typeof webglLoc == 'number') {
          program.uniformLocsById[location] = webglLoc = GLctx.getUniformLocation(program, program.uniformArrayNamesById[location] + (webglLoc > 0 ? `[${webglLoc}]` : ''));
        }
        // Else an already cached WebGLUniformLocation, return it.
        return webglLoc;
      } else {
        GL.recordError(0x502/*GL_INVALID_OPERATION*/);
      }
    };
  
  var webglGetUniformLocation = (location) => {
  
      return webglGetProgramUniformLocation(GLctx.currentProgram, location);
    };
  
  var _emscripten_glUniform1f = (location, v0) => {
      GLctx.uniform1f(webglGetUniformLocation(location), v0);
    };
  var _glUniform1f = _emscripten_glUniform1f;

  
  var _emscripten_glUniform1i = (location, v0) => {
      GLctx.uniform1i(webglGetUniformLocation(location), v0);
    };
  var _glUniform1i = _emscripten_glUniform1i;

  
  var _emscripten_glUniform2f = (location, v0, v1) => {
      GLctx.uniform2f(webglGetUniformLocation(location), v0, v1);
    };
  var _glUniform2f = _emscripten_glUniform2f;

  
  
  var _emscripten_glUniform3fv = (location, count, value) => {
  
      count && GLctx.uniform3fv(webglGetUniformLocation(location), HEAPF32, ((value)>>2), count*3);
    };
  var _glUniform3fv = _emscripten_glUniform3fv;

  
  var _emscripten_glUniform4f = (location, v0, v1, v2, v3) => {
      GLctx.uniform4f(webglGetUniformLocation(location), v0, v1, v2, v3);
    };
  var _glUniform4f = _emscripten_glUniform4f;

  
  
  var _emscripten_glUniform4fv = (location, count, value) => {
  
      count && GLctx.uniform4fv(webglGetUniformLocation(location), HEAPF32, ((value)>>2), count*4);
    };
  var _glUniform4fv = _emscripten_glUniform4fv;

  
  
  var _emscripten_glUniformMatrix4fv = (location, count, transpose, value) => {
  
      count && GLctx.uniformMatrix4fv(webglGetUniformLocation(location), !!transpose, HEAPF32, ((value)>>2), count*16);
    };
  var _glUniformMatrix4fv = _emscripten_glUniformMatrix4fv;

  var _emscripten_glUseProgram = (program) => {
      program = GL.programs[program];
      GLctx.useProgram(program);
      // Record the currently active program so that we can access the uniform
      // mapping table of that program.
      GLctx.currentProgram = program;
    };
  var _glUseProgram = _emscripten_glUseProgram;

  var _emscripten_glVertexAttribPointer = (index, size, type, normalized, stride, ptr) => {
      var cb = GL.currentContext.clientBuffers[index];
      if (!GLctx.currentArrayBufferBinding) {
        cb.size = size;
        cb.type = type;
        cb.normalized = normalized;
        cb.stride = stride;
        cb.ptr = ptr;
        cb.clientside = true;
        cb.vertexAttribPointerAdaptor = /** @this {WebGLRenderingContext} */ function(index, size, type, normalized, stride, ptr) {
          this.vertexAttribPointer(index, size, type, normalized, stride, ptr);
        };
        return;
      }
      cb.clientside = false;
      GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr);
    };
  var _glVertexAttribPointer = _emscripten_glVertexAttribPointer;

  var _emscripten_glViewport = (x0, x1, x2, x3) => GLctx.viewport(x0, x1, x2, x3);
  var _glViewport = _emscripten_glViewport;


  
  var _random_get = (buffer, size) => randomFill(HEAPU8.subarray(buffer, buffer + size));



  
  
  var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
  var stringToUTF8OnStack = (str) => {
      var size = lengthBytesUTF8(str) + 1;
      var ret = stackAlloc(size);
      stringToUTF8(str, ret, size);
      return ret;
    };































  var FS_createPath = (...args) => FS.createPath(...args);



  var FS_unlink = (...args) => FS.unlink(...args);

  var FS_createLazyFile = (...args) => FS.createLazyFile(...args);

  var FS_createDevice = (...args) => FS.createDevice(...args);



  FS.createPreloadedFile = FS_createPreloadedFile;
  FS.preloadFile = FS_preloadFile;
  FS.staticInit();;

      Module['requestAnimationFrame'] = MainLoop.requestAnimationFrame;
      Module['pauseMainLoop'] = MainLoop.pause;
      Module['resumeMainLoop'] = MainLoop.resume;
      MainLoop.init();;

      // Signal GL rendering layer that processing of a new frame is about to
      // start. This helps it optimize VBO double-buffering and reduce GPU stalls.
      registerPreMainLoop(() => GL.newRenderingFrameStarted());
    ;
// End JS library code

// include: postlibrary.js
// This file is included after the automatically-generated JS library code
// but before the wasm module is created.

{

  // Begin ATMODULES hooks
  if (Module['noExitRuntime']) noExitRuntime = Module['noExitRuntime'];

if (Module['print']) out = Module['print'];
if (Module['printErr']) err = Module['printErr'];
if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];
  // End ATMODULES hooks

  checkIncomingModuleAPI();

  if (Module['arguments']) programArgs = Module['arguments'];
  if (Module['thisProgram']) thisProgram = Module['thisProgram'];

  // Assertions on removed incoming Module JS APIs.
  assert(typeof Module['memoryInitializerPrefixURL'] == 'undefined', 'Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['pthreadMainPrefixURL'] == 'undefined', 'Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['cdInitializerPrefixURL'] == 'undefined', 'Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['filePackagePrefixURL'] == 'undefined', 'Module.filePackagePrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['read'] == 'undefined', 'Module.read option was removed');
  assert(typeof Module['readAsync'] == 'undefined', 'Module.readAsync option was removed (modify readAsync in JS)');
  assert(typeof Module['readBinary'] == 'undefined', 'Module.readBinary option was removed (modify readBinary in JS)');
  assert(typeof Module['setWindowTitle'] == 'undefined', 'Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)');
  assert(typeof Module['TOTAL_MEMORY'] == 'undefined', 'Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY');
  assert(typeof Module['ENVIRONMENT'] == 'undefined', 'Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)');
  assert(typeof Module['STACK_SIZE'] == 'undefined', 'STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time')
  // If memory is defined in wasm, the user can't provide it, or set INITIAL_MEMORY
  assert(typeof Module['wasmMemory'] == 'undefined', 'Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally');
  assert(typeof Module['INITIAL_MEMORY'] == 'undefined', 'Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically');

  var preInit = Module['preInit'];
  if (preInit) {
    if (typeof preInit == 'function') Module['preInit'] = preInit = [preInit];
    // Written as a loop so that preInit functions that themselves add more
    // preInit functions.  Is this actually needed?
    while (preInit.length > 0) {
      preInit.shift()();
    }
  }
  consumedModuleProp('preInit');
}

// Begin runtime exports
  Module['callMain'] = callMain;
  Module['addRunDependency'] = addRunDependency;
  Module['removeRunDependency'] = removeRunDependency;
  Module['FS_preloadFile'] = FS_preloadFile;
  Module['FS_unlink'] = FS_unlink;
  Module['FS_createPath'] = FS_createPath;
  Module['FS_createDevice'] = FS_createDevice;
  Module['FS'] = FS;
  Module['FS_createDataFile'] = FS_createDataFile;
  Module['FS_createLazyFile'] = FS_createLazyFile;
  var missingLibrarySymbols = [
  'writeI53ToI64Clamped',
  'writeI53ToI64Signaling',
  'writeI53ToU64Clamped',
  'writeI53ToU64Signaling',
  'convertI32PairToI53',
  'convertI32PairToI53Checked',
  'convertU32PairToI53',
  'getTempRet0',
  'setTempRet0',
  'createNamedFunction',
  'withStackSave',
  'runMainThreadEmAsm',
  'autoResumeAudioContext',
  'getDynCaller',
  'dynCall',
  'runtimeKeepalivePush',
  'runtimeKeepalivePop',
  'asmjsMangle',
  'HandleAllocator',
  'addOnInit',
  'addOnPostCtor',
  'addOnPreMain',
  'addOnExit',
  'STACK_SIZE',
  'STACK_ALIGN',
  'POINTER_SIZE',
  'ASSERTIONS',
  'ccall',
  'cwrap',
  'convertJsFunctionToWasm',
  'getEmptyTableSlot',
  'updateTableMap',
  'getFunctionAddress',
  'addFunction',
  'removeFunction',
  'setValue',
  'getValue',
  'intArrayToString',
  'AsciiToString',
  'UTF16ToString',
  'stringToUTF16',
  'lengthBytesUTF16',
  'UTF32ToString',
  'stringToUTF32',
  'lengthBytesUTF32',
  'stringToNewUTF8',
  'writeArrayToMemory',
  'registerKeyEventCallback',
  'getBoundingClientRect',
  'fillMouseEventData',
  'registerMouseEventCallback',
  'registerWheelEventCallback',
  'registerUiEventCallback',
  'registerFocusEventCallback',
  'fillDeviceOrientationEventData',
  'registerDeviceOrientationEventCallback',
  'fillDeviceMotionEventData',
  'registerDeviceMotionEventCallback',
  'screenOrientation',
  'fillOrientationChangeEventData',
  'registerOrientationChangeEventCallback',
  'fillFullscreenChangeEventData',
  'registerFullscreenChangeEventCallback',
  'callCanvasResizedCallback',
  'JSEvents_requestFullscreen',
  'JSEvents_resizeCanvasForFullscreen',
  'registerRestoreOldStyle',
  'hideEverythingExceptGivenElement',
  'restoreHiddenElements',
  'setLetterbox',
  'currentFullscreenStrategy',
  'softFullscreenResizeWebGLRenderTarget',
  'doRequestFullscreen',
  'fillPointerlockChangeEventData',
  'registerPointerlockChangeEventCallback',
  'registerPointerlockErrorEventCallback',
  'requestPointerLock',
  'fillVisibilityChangeEventData',
  'registerVisibilityChangeEventCallback',
  'registerTouchEventCallback',
  'fillGamepadEventData',
  'registerGamepadEventCallback',
  'registerBeforeUnloadEventCallback',
  'fillBatteryEventData',
  'registerBatteryEventCallback',
  'setCanvasElementSize',
  'getCanvasElementSize',
  'convertPCtoSourceLocation',
  'wasiRightsToMuslOFlags',
  'wasiOFlagsToMuslOFlags',
  'safeSetTimeout',
  'setImmediateWrapped',
  'safeRequestAnimationFrame',
  'clearImmediateWrapped',
  'registerPostMainLoop',
  'getPromise',
  'makePromise',
  'addPromise',
  'idsToPromises',
  'makePromiseCallback',
  'findMatchingCatch',
  'incrementUncaughtExceptionCount',
  'decrementUncaughtExceptionCount',
  'Browser_asyncPrepareDataCounter',
  'arraySum',
  'addDays',
  'FS_mkdirTree',
  '_setNetworkCallback',
  'emscriptenWebGLGetUniform',
  'emscriptenWebGLGetVertexAttrib',
  '__glGetActiveAttribOrUniform',
  'emscriptenWebGLGetBufferBinding',
  'emscriptenWebGLValidateMapBufferTarget',
  'writeGLArray',
  'registerWebGlEventCallback',
  'runAndAbortIfError',
  'emscriptenWebGLGetIndexed',
  'writeStringToMemory',
  'writeAsciiToMemory',
  'allocateUTF8',
  'allocateUTF8OnStack',
  'demangle',
  'stackTrace',
  'getNativeTypeSize',
];
missingLibrarySymbols.forEach(missingLibrarySymbol)

  var unexportedSymbols = [
  'run',
  'out',
  'err',
  'abort',
  'wasmExports',
  'writeStackCookie',
  'checkStackCookie',
  'writeI53ToI64',
  'readI53FromI64',
  'readI53FromU64',
  'INT53_MAX',
  'INT53_MIN',
  'bigintToI53Checked',
  'HEAP8',
  'HEAPU8',
  'HEAP16',
  'HEAPU16',
  'HEAP32',
  'HEAPU32',
  'HEAPF32',
  'HEAPF64',
  'HEAP64',
  'HEAPU64',
  'stackSave',
  'stackRestore',
  'stackAlloc',
  'ptrToString',
  'zeroMemory',
  'exitJS',
  'getHeapMax',
  'growMemory',
  'ENV',
  'ERRNO_CODES',
  'strError',
  'inetPton4',
  'inetNtop4',
  'inetPton6',
  'inetNtop6',
  'readSockaddr',
  'writeSockaddr',
  'DNS',
  'Protocols',
  'Sockets',
  'timers',
  'warnOnce',
  'readEmAsmArgsArray',
  'readEmAsmArgs',
  'runEmAsmFunction',
  'jstoi_q',
  'getExecutableName',
  'handleException',
  'keepRuntimeAlive',
  'callUserCallback',
  'maybeExit',
  'asyncLoad',
  'alignMemory',
  'mmapAlloc',
  'wasmTable',
  'wasmMemory',
  'getUniqueRunDependency',
  'noExitRuntime',
  'addOnPreRun',
  'addOnPostRun',
  'freeTableIndexes',
  'functionsInTableMap',
  'PATH',
  'PATH_FS',
  'UTF8Decoder',
  'UTF8ArrayToString',
  'UTF8ToString',
  'stringToUTF8Array',
  'stringToUTF8',
  'lengthBytesUTF8',
  'intArrayFromString',
  'stringToAscii',
  'UTF16Decoder',
  'stringToUTF8OnStack',
  'JSEvents',
  'specialHTMLTargets',
  'maybeCStringToJsString',
  'findEventTarget',
  'findCanvasEventTarget',
  'restoreOldWindowedStyle',
  'jsStackTrace',
  'getCallstack',
  'UNWIND_CACHE',
  'ExitStatus',
  'getEnvStrings',
  'checkWasiClock',
  'doReadv',
  'doWritev',
  'initRandomFill',
  'randomFill',
  'emSetImmediate',
  'emClearImmediate_deps',
  'emClearImmediate',
  'registerPreMainLoop',
  'promiseMap',
  'uncaughtExceptionCount',
  'exceptionCaught',
  'ExceptionInfo',
  'Browser',
  'requestFullscreen',
  'setCanvasSize',
  'getUserMedia',
  'createContext',
  'getPreloadedImageData__data',
  'wget',
  'MONTH_DAYS_REGULAR',
  'MONTH_DAYS_LEAP',
  'MONTH_DAYS_REGULAR_CUMULATIVE',
  'MONTH_DAYS_LEAP_CUMULATIVE',
  'isLeapYear',
  'ydayFromDate',
  'SYSCALLS',
  'getSocketFromFD',
  'getSocketAddress',
  'preloadPlugins',
  'FS_createPreloadedFile',
  'FS_modeStringToFlags',
  'FS_getMode',
  'FS_fileDataToTypedArray',
  'FS_stdin_getChar_buffer',
  'FS_stdin_getChar',
  'FS_readFile',
  'FS_root',
  'FS_mounts',
  'FS_devices',
  'FS_streams',
  'FS_nextInode',
  'FS_nameTable',
  'FS_currentPath',
  'FS_initialized',
  'FS_ignorePermissions',
  'FS_filesystems',
  'FS_syncFSRequests',
  'FS_lookupPath',
  'FS_getPath',
  'FS_hashName',
  'FS_hashAddNode',
  'FS_hashRemoveNode',
  'FS_lookupNode',
  'FS_createNode',
  'FS_destroyNode',
  'FS_isRoot',
  'FS_isMountpoint',
  'FS_isFile',
  'FS_isDir',
  'FS_isLink',
  'FS_isChrdev',
  'FS_isBlkdev',
  'FS_isFIFO',
  'FS_isSocket',
  'FS_flagsToPermissionString',
  'FS_nodePermissions',
  'FS_mayLookup',
  'FS_mayCreate',
  'FS_mayDelete',
  'FS_mayOpen',
  'FS_checkOpExists',
  'FS_nextfd',
  'FS_getStreamChecked',
  'FS_getStream',
  'FS_createStream',
  'FS_closeStream',
  'FS_dupStream',
  'FS_doSetAttr',
  'FS_chrdev_stream_ops',
  'FS_major',
  'FS_minor',
  'FS_makedev',
  'FS_registerDevice',
  'FS_getDevice',
  'FS_getMounts',
  'FS_syncfs',
  'FS_mount',
  'FS_unmount',
  'FS_lookup',
  'FS_mknod',
  'FS_statfs',
  'FS_statfsStream',
  'FS_statfsNode',
  'FS_create',
  'FS_mkdir',
  'FS_mkdev',
  'FS_symlink',
  'FS_link',
  'FS_rename',
  'FS_rmdir',
  'FS_readdir',
  'FS_readlink',
  'FS_stat',
  'FS_fstat',
  'FS_lstat',
  'FS_doChmod',
  'FS_chmod',
  'FS_lchmod',
  'FS_fchmod',
  'FS_doChown',
  'FS_chown',
  'FS_lchown',
  'FS_fchown',
  'FS_doTruncate',
  'FS_truncate',
  'FS_ftruncate',
  'FS_utime',
  'FS_open',
  'FS_close',
  'FS_isClosed',
  'FS_llseek',
  'FS_read',
  'FS_write',
  'FS_mmap',
  'FS_msync',
  'FS_ioctl',
  'FS_writeFile',
  'FS_cwd',
  'FS_chdir',
  'FS_createDefaultDirectories',
  'FS_createDefaultDevices',
  'FS_createSpecialDirectories',
  'FS_createStandardStreams',
  'FS_staticInit',
  'FS_init',
  'FS_quit',
  'FS_findObject',
  'FS_analyzePath',
  'FS_createFile',
  'FS_forceLoadFile',
  'MEMFS',
  'TTY',
  'PIPEFS',
  'SOCKFS',
  'tempFixedLengthArray',
  'miniTempWebGLFloatBuffers',
  'miniTempWebGLIntBuffers',
  'heapObjectForWebGLType',
  'toTypedArrayIndex',
  'webgl_enable_WEBGL_multi_draw',
  'webgl_enable_EXT_polygon_offset_clamp',
  'webgl_enable_EXT_clip_control',
  'webgl_enable_WEBGL_polygon_mode',
  'GL',
  'emscriptenWebGLGet',
  'computeUnpackAlignedImageSize',
  'colorChannelsInGlTextureFormat',
  'emscriptenWebGLGetTexPixelData',
  'webglGetProgramUniformLocation',
  'webglGetUniformLocation',
  'webglPrepareUniformLocationsBeforeFirstUse',
  'webglGetLeftBracePos',
  'AL',
  'GLUT',
  'EGL',
  'GLEW',
  'IDBStore',
  'SDL',
  'SDL_gfx',
  'webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance',
  'webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance',
  'print',
  'printErr',
  'jstoi_s',
];
unexportedSymbols.forEach(unexportedRuntimeSymbol);

  // End runtime exports
  // Begin JS library exports
  // End JS library exports

// end include: postlibrary.js

function checkIncomingModuleAPI() {
  ignoredModuleProp('fetchSettings');
  ignoredModuleProp('logReadFiles');
  ignoredModuleProp('loadSplitModule');
  ignoredModuleProp('onMalloc');
  ignoredModuleProp('onRealloc');
  ignoredModuleProp('onFree');
  ignoredModuleProp('onSbrkGrow');
  ignoredModuleProp('onCOSCacheHit');
  ignoredModuleProp('onCOSCacheMiss');
  ignoredModuleProp('onCOSStore');
  ignoredModuleProp('GL_MAX_TEXTURE_IMAGE_UNITS');
  ignoredModuleProp('SDL_canPlayWithWebAudio');
  ignoredModuleProp('SDL_numSimultaneouslyQueuedBuffers');
  ignoredModuleProp('freePreloadedMediaOnUse');
  ignoredModuleProp('preinitializedWebGLContext');
  ignoredModuleProp('keyboardListeningElement');
  ignoredModuleProp('doNotCaptureKeyboard');
  ignoredModuleProp('extraStackTrace');
  ignoredModuleProp('preloadPlugins');
  ignoredModuleProp('preMainLoop');
  ignoredModuleProp('postMainLoop');
  ignoredModuleProp('forcedAspectRatio');
  ignoredModuleProp('mainScriptUrlOrBlob');
  ignoredModuleProp('onFullScreen');
  ignoredModuleProp('INITIAL_MEMORY');
  ignoredModuleProp('wasmMemory');
}
var ASM_CONSTS = {
  3394462: () => { if (!(m2w.isMobile && m2w.isMobile())) m2w.cursor.software = true; },  
 3394494: ($0) => { try { FS.mkdir(UTF8ToString($0)); } catch (e) { } }
};
function m2w_cursor_set(c_szCss) { m2w.cursorSet(UTF8ToString(c_szCss)); }
function m2w_cursor_visible(bVisible) { m2w.cursorVisible(bVisible); }
function m2w_probe_file() { var w = m2w.options.get('probefile'); if (!w) return 0; var n = lengthBytesUTF8(w) + 1, p = _malloc(n); stringToUTF8(w, p, n); return p; }
function m2w_probe_hash_frame() { var n = parseInt(m2w.options.get('probehash') || '', 10); return (isFinite(n) && n > 0) ? n : 0; }
function m2w_probe_count() { var w = m2w.options.get('modelprobe'); if (!w) return 0; var n = parseInt(w, 10); if (!isFinite(n) || n < 1) n = 1; return n > 200 ? 200 : n; }
function m2w_texture_dir() { var w = m2w.options.get('textureprobe'); if (!w) return 0; if (w === '1') w = 'd:/ymir work/pc/warrior/'; var n = lengthBytesUTF8(w) + 1, p = _malloc(n); stringToUTF8(w, p, n); return p; }
function m2w_display_mode_size(bHeight) { return m2w.windowSize(bHeight); }
function m2w_events_start() { m2w.eventsStart(); }
function m2w_event_poll(pData) { return m2w.eventPollInto(pData); }
function m2w_mouse_position(bY) { var state = m2w.events; if (!state) return 0; return bY ? state.y : state.x; }
function m2w_mouse_set(x,y) { return m2w.mouseSet(x, y); }
function m2w_camera_drag(bOn) { if (m2w.cameraDrag) m2w.cameraDrag(bOn); }
function m2w_no_custom() { return m2w.options.get('nocustom') === '1' ? 1 : 0; }
function m2w_no_cull() { return m2w.options.get('nocull') === '1' ? 1 : 0; }
function m2w_shadow_mode() { var v = m2w.options.get('shadow'); if (v === null) return -1; var n = parseInt(v, 10); return (n >= 0 && n <= 3) ? n : -1; }
function m2w_software_tnl() { return m2w.options.get('tnl') === '0' ? 1 : 0; }
function m2w_no_flip() { if (window.m2w_no_reflection !== undefined) return window.m2w_no_reflection ? 1 : 0; return m2w.options.get('noflip') === '1' ? 1 : 0; }
function m2w_skin_shortcut() { return m2w.options.get('skinshortcut') === '0' ? 0 : 1; }
function m2w_ime_enable(iEnabled) { m2w.imeEnable(iEnabled); }
function m2w_keys_start() { if (globalThis.m2w) m2w.keysStart(); }
function m2w_key_pressed(iVk) { return globalThis.m2w ? m2w.keyPressed(iVk) : 0; }
function m2w_dik_start() { m2w.dikStart(); }
function m2w_dik_pressed(iDik) { var state = m2w.dik; if (!state || iDik < 0 || iDik > 255) return 0; return state[iDik] ? 1 : 0; }
function m2w_dik_copy_state(pTarget) { var state = m2w.dik; if (!state) { HEAPU8.fill(0, pTarget, pTarget + 256); return; } HEAPU8.set(state, pTarget); }
function m2w_load_font() { m2w.loadFont(); }
function m2w_browser_language(pszBuffer,iSize) { var r = m2w.browserLanguage(); stringToUTF8(r.lang, pszBuffer, iSize); return r.codePage; }
function m2w_should_run() { return m2w.shouldRun(); }
function m2w_movie_play(c_pData,iBytes,c_szName) { m2w.moviePlay(HEAPU8.slice(c_pData, c_pData + iBytes), UTF8ToString(c_szName)); }
function m2w_bridge_start() { m2w.bridgeStart(); }
function m2w_bridge_port() { var k = m2w.bridge; return (k && k.port > 0 && k.port < 65536) ? k.port : 11496; }
function m2w_address_via_bridge(c_szTarget) { return m2w.addressViaBridge(UTF8ToString(c_szTarget)); }
function m2w_missing_log_enabled() { return m2w.options.get('missing') === '1' ? 1 : 0; }
function m2w_no_models() { return m2w.options.get('nomodels') === '1' ? 1 : 0; }
function m2w_ui_scale() { return m2w.uiScale(); }
function m2w_effective_dpr() { return m2w.effectiveDpr(); }
function m2w_css_to_buffer_ratio() { return m2w.cssToBufferRatio(); }
function m2w_cursor_mode() { return m2w.cursorMode(); }
function m2w_canvas_state(iWhat) { return m2w.canvasState(iWhat); }
function m2w_window_size(bHeight) { return m2w.windowSize(bHeight); }
function m2w_quit_page() { m2w.quit(); }
function m2w_canvas_create(iWidth,iHeight) { return m2w.textCanvasCreate(iWidth, iHeight); }
function m2w_canvas_font(iId,c_szCss) { m2w.textCanvasFont(iId, UTF8ToString(c_szCss)); }
function m2w_canvas_measure(iId,c_szText) { return m2w.textMeasure(iId, UTF8ToString(c_szText)); }
function m2w_canvas_measure_three(iId,c_szText,pdOut) { m2w.heapDoubles(pdOut, m2w.textMeasureThree(iId, UTF8ToString(c_szText))); }
function m2w_canvas_measure_prefixes(iId,c_szText,pdOut,iCapacity) { var a = m2w.textMeasurePrefixes(iId, UTF8ToString(c_szText), iCapacity); for (var i = 0; i < a.length; ++i) HEAPF64[(pdOut >> 3) + i] = a[i]; return a.length; }
function m2w_canvas_bbox_right(iId,c_szText) { return m2w.textBboxRight(iId, UTF8ToString(c_szText)); }
function m2w_canvas_height(iId,c_szText) { return m2w.textHeight(iId, UTF8ToString(c_szText)); }
function m2w_canvas_line_height(iId) { return m2w.textLineHeight(iId); }
function m2w_canvas_draw(iId,x,y,c_szText,c_szColour,c_szBack,bOpaque) { m2w.textDraw(iId, x, y, UTF8ToString(c_szText), UTF8ToString(c_szColour), UTF8ToString(c_szBack), bOpaque); }
function m2w_canvas_read_rows(iId,pvTarget,iStride,x0,x1,y0,y1) { m2w.textReadRows(iId, pvTarget, iStride, x0, x1, y0, y1); }
function m2w_sound_init(iSlots) { m2w.soundStart(iSlots); }
function m2w_sound_load(uCrc,c_pvData,iBytes) { return m2w.soundLoad(uCrc, HEAPU8.slice(c_pvData, c_pvData + iBytes).buffer); }
function m2w_sound_play(iSlot,uCrc,iLoops,iSpatial) { m2w.soundPlay(iSlot, uCrc, iLoops, iSpatial); }
function m2w_sound_stop(iSlot) { m2w.soundStop(iSlot); }
function m2w_sound_slot_free(iSlot) { return m2w.soundSlotFree(iSlot); }
function m2w_sound_volume(iSlot,fVolume) { m2w.soundVolume(iSlot, fVolume); }
function m2w_sound_position(iSlot,fX,fY,fZ) { m2w.soundPosition(iSlot, fX, fY, fZ); }
function m2w_sound_listener_position(fX,fY,fZ) { m2w.soundListenerPosition(fX, fY, fZ); }
function m2w_sound_listener_direction(fFwdX,fFwdY,fFwdZ,fUpX,fUpY,fUpZ) { m2w.soundListenerDirection(fFwdX, fFwdY, fFwdZ, fUpX, fUpY, fUpZ); }
function m2w_forest_mode() { return parseInt(m2w.options.get('forest') || '0', 10) || 0; }
function m2w_webbrowser_show(c_szUrl,l,t,r,b) { return m2w.webbrowserShow(UTF8ToString(c_szUrl), l, t, r, b); }
function m2w_webbrowser_move(l,t,r,b) { m2w.webbrowserMove(l, t, r, b); }
function m2w_webbrowser_hide() { m2w.webbrowserHide(); }
function m2w_webbrowser_destroy() { m2w.webbrowserDestroy(); }
function m2w_fetch(c_szUrl,piLength,iExpected) { return m2w.heapBytes(m2w.fetchSync(UTF8ToString(c_szUrl), iExpected), piLength); }
function m2w_chunk_cache_start(iBudgetMB) { m2w.chunkCacheStart(iBudgetMB); }
function m2w_chunk_from_cache(c_szName,piLength) { return m2w.heapBytes(m2w.chunkFromCache(UTF8ToString(c_szName)), piLength); }
function m2w_chunk_cache_put(c_szName,c_pData,iLength) { if (iLength <= 0) return; m2w.chunkCachePut(UTF8ToString(c_szName), HEAPU8.slice(c_pData, c_pData + iLength)); }
function m2w_chunk_in_background(c_szUrl,c_szName) { m2w.chunkInBackground(UTF8ToString(c_szUrl), UTF8ToString(c_szName)); }
function m2w_prefetch_start(c_szBase) { m2w.prefetchStart(UTF8ToString(c_szBase)); }
function m2w_chunk_list(c_szList,c_szBase) { m2w.chunkList(UTF8ToString(c_szList), UTF8ToString(c_szBase)); }
function m2w_chunk_cache_counter(iWhat) { return m2w.chunkCounter(iWhat); }
function m2w_corpus_budget() { return m2w.corpusBudget(); }
function m2w_corpus_url() { return m2w.heapString(m2w.corpusUrl()); }
function m2w_chunk_used(iChunk) { m2w.chunkUsed(iChunk); }
function m2w_fps_limit() { return m2w.fpsLimit(); }
function m2w_events_from_loop() { return m2w.eventsFromLoop(); }
function _Py_emscripten_runtime() { var info; if (typeof navigator == 'object') { info = navigator.userAgent; } else if (typeof process == 'object') { info = "Node.js ".concat(process.version); } else { info = "UNKNOWN"; } var len = lengthBytesUTF8(info) + 1; var res = _malloc(len); if (res) stringToUTF8(info, res, len); return res; }
function _Py_CheckEmscriptenSignals_Helper() { if (!Module.Py_EmscriptenSignalBuffer) { return 0; } try { let result = Module.Py_EmscriptenSignalBuffer[0]; Module.Py_EmscriptenSignalBuffer[0] = 0; return result; } catch(e) { return 0; } }

// Imports from the Wasm binary.
var _M2W_ImeCompositionStart = Module['_M2W_ImeCompositionStart'] = makeInvalidEarlyAccess('_M2W_ImeCompositionStart');
var _M2W_ImeCompositionUpdate = Module['_M2W_ImeCompositionUpdate'] = makeInvalidEarlyAccess('_M2W_ImeCompositionUpdate');
var _M2W_ImeCompositionEnd = Module['_M2W_ImeCompositionEnd'] = makeInvalidEarlyAccess('_M2W_ImeCompositionEnd');
var _M2W_ImePaste = Module['_M2W_ImePaste'] = makeInvalidEarlyAccess('_M2W_ImePaste');
var _main = Module['_main'] = makeInvalidEarlyAccess('_main');
var _ntohs = makeInvalidEarlyAccess('_ntohs');
var _htons = makeInvalidEarlyAccess('_htons');
var _malloc = makeInvalidEarlyAccess('_malloc');
var _htonl = makeInvalidEarlyAccess('_htonl');
var _strerror = makeInvalidEarlyAccess('_strerror');
var _fflush = makeInvalidEarlyAccess('_fflush');
var _M2W_PumpMessagesNow = Module['_M2W_PumpMessagesNow'] = makeInvalidEarlyAccess('_M2W_PumpMessagesNow');
var _emscripten_stack_get_end = makeInvalidEarlyAccess('_emscripten_stack_get_end');
var _emscripten_stack_get_base = makeInvalidEarlyAccess('_emscripten_stack_get_base');
var _emscripten_builtin_memalign = makeInvalidEarlyAccess('_emscripten_builtin_memalign');
var __emscripten_timeout = makeInvalidEarlyAccess('__emscripten_timeout');
var _setThrew = makeInvalidEarlyAccess('_setThrew');
var _emscripten_stack_init = makeInvalidEarlyAccess('_emscripten_stack_init');
var _emscripten_stack_get_free = makeInvalidEarlyAccess('_emscripten_stack_get_free');
var __emscripten_stack_restore = makeInvalidEarlyAccess('__emscripten_stack_restore');
var __emscripten_stack_alloc = makeInvalidEarlyAccess('__emscripten_stack_alloc');
var _emscripten_stack_get_current = makeInvalidEarlyAccess('_emscripten_stack_get_current');
var memory = makeInvalidEarlyAccess('memory');
var __indirect_function_table = makeInvalidEarlyAccess('__indirect_function_table');
var _Py_EMSCRIPTEN_SIGNAL_HANDLING = Module['_Py_EMSCRIPTEN_SIGNAL_HANDLING'] = makeInvalidEarlyAccess('_Py_EMSCRIPTEN_SIGNAL_HANDLING');
var wasmMemory = makeInvalidEarlyAccess('wasmMemory');
var wasmTable = makeInvalidEarlyAccess('wasmTable');

function assignWasmExports(wasmExports) {
  assert(typeof wasmExports['M2W_ImeCompositionStart'] != 'undefined', 'missing Wasm export: M2W_ImeCompositionStart');
  assert(typeof wasmExports['M2W_ImeCompositionUpdate'] != 'undefined', 'missing Wasm export: M2W_ImeCompositionUpdate');
  assert(typeof wasmExports['M2W_ImeCompositionEnd'] != 'undefined', 'missing Wasm export: M2W_ImeCompositionEnd');
  assert(typeof wasmExports['M2W_ImePaste'] != 'undefined', 'missing Wasm export: M2W_ImePaste');
  assert(typeof wasmExports['__main_argc_argv'] != 'undefined', 'missing Wasm export: __main_argc_argv');
  assert(typeof wasmExports['ntohs'] != 'undefined', 'missing Wasm export: ntohs');
  assert(typeof wasmExports['htons'] != 'undefined', 'missing Wasm export: htons');
  assert(typeof wasmExports['malloc'] != 'undefined', 'missing Wasm export: malloc');
  assert(typeof wasmExports['htonl'] != 'undefined', 'missing Wasm export: htonl');
  assert(typeof wasmExports['strerror'] != 'undefined', 'missing Wasm export: strerror');
  assert(typeof wasmExports['fflush'] != 'undefined', 'missing Wasm export: fflush');
  assert(typeof wasmExports['M2W_PumpMessagesNow'] != 'undefined', 'missing Wasm export: M2W_PumpMessagesNow');
  assert(typeof wasmExports['emscripten_stack_get_end'] != 'undefined', 'missing Wasm export: emscripten_stack_get_end');
  assert(typeof wasmExports['emscripten_stack_get_base'] != 'undefined', 'missing Wasm export: emscripten_stack_get_base');
  assert(typeof wasmExports['emscripten_builtin_memalign'] != 'undefined', 'missing Wasm export: emscripten_builtin_memalign');
  assert(typeof wasmExports['_emscripten_timeout'] != 'undefined', 'missing Wasm export: _emscripten_timeout');
  assert(typeof wasmExports['setThrew'] != 'undefined', 'missing Wasm export: setThrew');
  assert(typeof wasmExports['emscripten_stack_init'] != 'undefined', 'missing Wasm export: emscripten_stack_init');
  assert(typeof wasmExports['emscripten_stack_get_free'] != 'undefined', 'missing Wasm export: emscripten_stack_get_free');
  assert(typeof wasmExports['_emscripten_stack_restore'] != 'undefined', 'missing Wasm export: _emscripten_stack_restore');
  assert(typeof wasmExports['_emscripten_stack_alloc'] != 'undefined', 'missing Wasm export: _emscripten_stack_alloc');
  assert(typeof wasmExports['emscripten_stack_get_current'] != 'undefined', 'missing Wasm export: emscripten_stack_get_current');
  assert(typeof wasmExports['memory'] != 'undefined', 'missing Wasm export: memory');
  assert(typeof wasmExports['__indirect_function_table'] != 'undefined', 'missing Wasm export: __indirect_function_table');
  assert(typeof wasmExports['Py_EMSCRIPTEN_SIGNAL_HANDLING'] != 'undefined', 'missing Wasm export: Py_EMSCRIPTEN_SIGNAL_HANDLING');
  _M2W_ImeCompositionStart = Module['_M2W_ImeCompositionStart'] = createExportWrapper('M2W_ImeCompositionStart', wasmExports['M2W_ImeCompositionStart'], 0);
  _M2W_ImeCompositionUpdate = Module['_M2W_ImeCompositionUpdate'] = createExportWrapper('M2W_ImeCompositionUpdate', wasmExports['M2W_ImeCompositionUpdate'], 3);
  _M2W_ImeCompositionEnd = Module['_M2W_ImeCompositionEnd'] = createExportWrapper('M2W_ImeCompositionEnd', wasmExports['M2W_ImeCompositionEnd'], 1);
  _M2W_ImePaste = Module['_M2W_ImePaste'] = createExportWrapper('M2W_ImePaste', wasmExports['M2W_ImePaste'], 1);
  _main = Module['_main'] = createExportWrapper('__main_argc_argv', wasmExports['__main_argc_argv'], 2);
  _ntohs = createExportWrapper('ntohs', wasmExports['ntohs'], 1);
  _htons = createExportWrapper('htons', wasmExports['htons'], 1);
  _malloc = createExportWrapper('malloc', wasmExports['malloc'], 1);
  _htonl = createExportWrapper('htonl', wasmExports['htonl'], 1);
  _strerror = createExportWrapper('strerror', wasmExports['strerror'], 1);
  _fflush = createExportWrapper('fflush', wasmExports['fflush'], 1);
  _M2W_PumpMessagesNow = Module['_M2W_PumpMessagesNow'] = createExportWrapper('M2W_PumpMessagesNow', wasmExports['M2W_PumpMessagesNow'], 0);
  _emscripten_stack_get_end = wasmExports['emscripten_stack_get_end'];
  _emscripten_stack_get_base = wasmExports['emscripten_stack_get_base'];
  _emscripten_builtin_memalign = createExportWrapper('emscripten_builtin_memalign', wasmExports['emscripten_builtin_memalign'], 2);
  __emscripten_timeout = createExportWrapper('_emscripten_timeout', wasmExports['_emscripten_timeout'], 2);
  _setThrew = createExportWrapper('setThrew', wasmExports['setThrew'], 2);
  _emscripten_stack_init = wasmExports['emscripten_stack_init'];
  _emscripten_stack_get_free = wasmExports['emscripten_stack_get_free'];
  __emscripten_stack_restore = wasmExports['_emscripten_stack_restore'];
  __emscripten_stack_alloc = wasmExports['_emscripten_stack_alloc'];
  _emscripten_stack_get_current = wasmExports['emscripten_stack_get_current'];
  memory = wasmMemory = wasmExports['memory'];
  __indirect_function_table = wasmTable = wasmExports['__indirect_function_table'];
  _Py_EMSCRIPTEN_SIGNAL_HANDLING = Module['_Py_EMSCRIPTEN_SIGNAL_HANDLING'] = wasmExports['Py_EMSCRIPTEN_SIGNAL_HANDLING'].value;
}

var wasmImports = {
  /** @export */
  _Py_CheckEmscriptenSignals_Helper,
  /** @export */
  _Py_emscripten_runtime,
  /** @export */
  _Z16ReleaseSemaphorePvlPl: __Z16ReleaseSemaphorePvlPl,
  /** @export */
  __assert_fail: ___assert_fail,
  /** @export */
  __call_sighandler: ___call_sighandler,
  /** @export */
  __cxa_throw: ___cxa_throw,
  /** @export */
  __syscall_accept4: ___syscall_accept4,
  /** @export */
  __syscall_bind: ___syscall_bind,
  /** @export */
  __syscall_chdir: ___syscall_chdir,
  /** @export */
  __syscall_chmod: ___syscall_chmod,
  /** @export */
  __syscall_connect: ___syscall_connect,
  /** @export */
  __syscall_dup3: ___syscall_dup3,
  /** @export */
  __syscall_faccessat: ___syscall_faccessat,
  /** @export */
  __syscall_fadvise64: ___syscall_fadvise64,
  /** @export */
  __syscall_fchdir: ___syscall_fchdir,
  /** @export */
  __syscall_fchmod: ___syscall_fchmod,
  /** @export */
  __syscall_fchmodat2: ___syscall_fchmodat2,
  /** @export */
  __syscall_fchown32: ___syscall_fchown32,
  /** @export */
  __syscall_fchownat: ___syscall_fchownat,
  /** @export */
  __syscall_fcntl64: ___syscall_fcntl64,
  /** @export */
  __syscall_fdatasync: ___syscall_fdatasync,
  /** @export */
  __syscall_fstat64: ___syscall_fstat64,
  /** @export */
  __syscall_fstatfs64: ___syscall_fstatfs64,
  /** @export */
  __syscall_ftruncate64: ___syscall_ftruncate64,
  /** @export */
  __syscall_getcwd: ___syscall_getcwd,
  /** @export */
  __syscall_getdents64: ___syscall_getdents64,
  /** @export */
  __syscall_getgid32: ___syscall_getgid32,
  /** @export */
  __syscall_getpeername: ___syscall_getpeername,
  /** @export */
  __syscall_getsockname: ___syscall_getsockname,
  /** @export */
  __syscall_getsockopt: ___syscall_getsockopt,
  /** @export */
  __syscall_getuid32: ___syscall_getuid32,
  /** @export */
  __syscall_ioctl: ___syscall_ioctl,
  /** @export */
  __syscall_listen: ___syscall_listen,
  /** @export */
  __syscall_lstat64: ___syscall_lstat64,
  /** @export */
  __syscall_mkdirat: ___syscall_mkdirat,
  /** @export */
  __syscall_newfstatat: ___syscall_newfstatat,
  /** @export */
  __syscall_openat: ___syscall_openat,
  /** @export */
  __syscall_pipe2: ___syscall_pipe2,
  /** @export */
  __syscall_poll: ___syscall_poll,
  /** @export */
  __syscall_poll_nonblocking: ___syscall_poll_nonblocking,
  /** @export */
  __syscall_readlinkat: ___syscall_readlinkat,
  /** @export */
  __syscall_recvfrom: ___syscall_recvfrom,
  /** @export */
  __syscall_recvmsg: ___syscall_recvmsg,
  /** @export */
  __syscall_renameat: ___syscall_renameat,
  /** @export */
  __syscall_rmdir: ___syscall_rmdir,
  /** @export */
  __syscall_sendmsg: ___syscall_sendmsg,
  /** @export */
  __syscall_sendto: ___syscall_sendto,
  /** @export */
  __syscall_setsockopt: ___syscall_setsockopt,
  /** @export */
  __syscall_shutdown: ___syscall_shutdown,
  /** @export */
  __syscall_socket: ___syscall_socket,
  /** @export */
  __syscall_stat64: ___syscall_stat64,
  /** @export */
  __syscall_statfs64: ___syscall_statfs64,
  /** @export */
  __syscall_symlinkat: ___syscall_symlinkat,
  /** @export */
  __syscall_truncate64: ___syscall_truncate64,
  /** @export */
  __syscall_umask: ___syscall_umask,
  /** @export */
  __syscall_unlinkat: ___syscall_unlinkat,
  /** @export */
  __syscall_utimensat: ___syscall_utimensat,
  /** @export */
  _abort_js: __abort_js,
  /** @export */
  _emscripten_lookup_name: __emscripten_lookup_name,
  /** @export */
  _emscripten_runtime_keepalive_clear: __emscripten_runtime_keepalive_clear,
  /** @export */
  _emscripten_system: __emscripten_system,
  /** @export */
  _emscripten_throw_longjmp: __emscripten_throw_longjmp,
  /** @export */
  _gmtime_js: __gmtime_js,
  /** @export */
  _localtime_js: __localtime_js,
  /** @export */
  _mktime_js: __mktime_js,
  /** @export */
  _mmap_js: __mmap_js,
  /** @export */
  _msync_js: __msync_js,
  /** @export */
  _munmap_js: __munmap_js,
  /** @export */
  _setitimer_js: __setitimer_js,
  /** @export */
  _tzset_js: __tzset_js,
  /** @export */
  clock_res_get: _clock_res_get,
  /** @export */
  clock_time_get: _clock_time_get,
  /** @export */
  emscripten_asm_const_int: _emscripten_asm_const_int,
  /** @export */
  emscripten_cancel_main_loop: _emscripten_cancel_main_loop,
  /** @export */
  emscripten_date_now: _emscripten_date_now,
  /** @export */
  emscripten_err: _emscripten_err,
  /** @export */
  emscripten_get_callstack: _emscripten_get_callstack,
  /** @export */
  emscripten_get_canvas_element_size: _emscripten_get_canvas_element_size,
  /** @export */
  emscripten_get_heap_max: _emscripten_get_heap_max,
  /** @export */
  emscripten_get_now: _emscripten_get_now,
  /** @export */
  emscripten_is_webgl_context_lost: _emscripten_is_webgl_context_lost,
  /** @export */
  emscripten_resize_heap: _emscripten_resize_heap,
  /** @export */
  emscripten_set_canvas_element_size: _emscripten_set_canvas_element_size,
  /** @export */
  emscripten_set_main_loop: _emscripten_set_main_loop,
  /** @export */
  emscripten_webgl_create_context: _emscripten_webgl_create_context,
  /** @export */
  emscripten_webgl_enable_extension: _emscripten_webgl_enable_extension,
  /** @export */
  emscripten_webgl_get_current_context: _emscripten_webgl_get_current_context,
  /** @export */
  emscripten_webgl_make_context_current: _emscripten_webgl_make_context_current,
  /** @export */
  environ_get: _environ_get,
  /** @export */
  environ_sizes_get: _environ_sizes_get,
  /** @export */
  exit: _exit,
  /** @export */
  fd_close: _fd_close,
  /** @export */
  fd_fdstat_get: _fd_fdstat_get,
  /** @export */
  fd_pread: _fd_pread,
  /** @export */
  fd_pwrite: _fd_pwrite,
  /** @export */
  fd_read: _fd_read,
  /** @export */
  fd_seek: _fd_seek,
  /** @export */
  fd_sync: _fd_sync,
  /** @export */
  fd_write: _fd_write,
  /** @export */
  getaddrinfo: _getaddrinfo,
  /** @export */
  getnameinfo: _getnameinfo,
  /** @export */
  getprotobyname: _getprotobyname,
  /** @export */
  glActiveTexture: _glActiveTexture,
  /** @export */
  glAttachShader: _glAttachShader,
  /** @export */
  glBeginQuery: _glBeginQuery,
  /** @export */
  glBindBuffer: _glBindBuffer,
  /** @export */
  glBindFramebuffer: _glBindFramebuffer,
  /** @export */
  glBindRenderbuffer: _glBindRenderbuffer,
  /** @export */
  glBindTexture: _glBindTexture,
  /** @export */
  glBindVertexArray: _glBindVertexArray,
  /** @export */
  glBlendEquation: _glBlendEquation,
  /** @export */
  glBlendFunc: _glBlendFunc,
  /** @export */
  glBufferData: _glBufferData,
  /** @export */
  glBufferSubData: _glBufferSubData,
  /** @export */
  glCheckFramebufferStatus: _glCheckFramebufferStatus,
  /** @export */
  glClear: _glClear,
  /** @export */
  glClearColor: _glClearColor,
  /** @export */
  glClearDepthf: _glClearDepthf,
  /** @export */
  glClearStencil: _glClearStencil,
  /** @export */
  glColorMask: _glColorMask,
  /** @export */
  glCompileShader: _glCompileShader,
  /** @export */
  glCompressedTexImage2D: _glCompressedTexImage2D,
  /** @export */
  glCreateProgram: _glCreateProgram,
  /** @export */
  glCreateShader: _glCreateShader,
  /** @export */
  glCullFace: _glCullFace,
  /** @export */
  glDeleteBuffers: _glDeleteBuffers,
  /** @export */
  glDeleteFramebuffers: _glDeleteFramebuffers,
  /** @export */
  glDeleteProgram: _glDeleteProgram,
  /** @export */
  glDeleteRenderbuffers: _glDeleteRenderbuffers,
  /** @export */
  glDeleteShader: _glDeleteShader,
  /** @export */
  glDeleteTextures: _glDeleteTextures,
  /** @export */
  glDeleteVertexArrays: _glDeleteVertexArrays,
  /** @export */
  glDepthFunc: _glDepthFunc,
  /** @export */
  glDepthMask: _glDepthMask,
  /** @export */
  glDisable: _glDisable,
  /** @export */
  glDisableVertexAttribArray: _glDisableVertexAttribArray,
  /** @export */
  glDrawArrays: _glDrawArrays,
  /** @export */
  glDrawElements: _glDrawElements,
  /** @export */
  glEnable: _glEnable,
  /** @export */
  glEnableVertexAttribArray: _glEnableVertexAttribArray,
  /** @export */
  glEndQuery: _glEndQuery,
  /** @export */
  glFramebufferRenderbuffer: _glFramebufferRenderbuffer,
  /** @export */
  glFramebufferTexture2D: _glFramebufferTexture2D,
  /** @export */
  glGenBuffers: _glGenBuffers,
  /** @export */
  glGenFramebuffers: _glGenFramebuffers,
  /** @export */
  glGenQueries: _glGenQueries,
  /** @export */
  glGenRenderbuffers: _glGenRenderbuffers,
  /** @export */
  glGenTextures: _glGenTextures,
  /** @export */
  glGenVertexArrays: _glGenVertexArrays,
  /** @export */
  glGetAttribLocation: _glGetAttribLocation,
  /** @export */
  glGetError: _glGetError,
  /** @export */
  glGetIntegerv: _glGetIntegerv,
  /** @export */
  glGetProgramInfoLog: _glGetProgramInfoLog,
  /** @export */
  glGetProgramiv: _glGetProgramiv,
  /** @export */
  glGetQueryObjectuiv: _glGetQueryObjectuiv,
  /** @export */
  glGetShaderInfoLog: _glGetShaderInfoLog,
  /** @export */
  glGetShaderiv: _glGetShaderiv,
  /** @export */
  glGetUniformLocation: _glGetUniformLocation,
  /** @export */
  glIsEnabled: _glIsEnabled,
  /** @export */
  glLinkProgram: _glLinkProgram,
  /** @export */
  glReadPixels: _glReadPixels,
  /** @export */
  glRenderbufferStorage: _glRenderbufferStorage,
  /** @export */
  glShaderSource: _glShaderSource,
  /** @export */
  glTexImage2D: _glTexImage2D,
  /** @export */
  glTexParameteri: _glTexParameteri,
  /** @export */
  glUniform1f: _glUniform1f,
  /** @export */
  glUniform1i: _glUniform1i,
  /** @export */
  glUniform2f: _glUniform2f,
  /** @export */
  glUniform3fv: _glUniform3fv,
  /** @export */
  glUniform4f: _glUniform4f,
  /** @export */
  glUniform4fv: _glUniform4fv,
  /** @export */
  glUniformMatrix4fv: _glUniformMatrix4fv,
  /** @export */
  glUseProgram: _glUseProgram,
  /** @export */
  glVertexAttribPointer: _glVertexAttribPointer,
  /** @export */
  glViewport: _glViewport,
  /** @export */
  invoke_ii,
  /** @export */
  invoke_iii,
  /** @export */
  invoke_iiii,
  /** @export */
  invoke_v,
  /** @export */
  invoke_vi,
  /** @export */
  invoke_vii,
  /** @export */
  invoke_viii,
  /** @export */
  m2w_address_via_bridge,
  /** @export */
  m2w_bridge_port,
  /** @export */
  m2w_bridge_start,
  /** @export */
  m2w_browser_language,
  /** @export */
  m2w_camera_drag,
  /** @export */
  m2w_canvas_bbox_right,
  /** @export */
  m2w_canvas_create,
  /** @export */
  m2w_canvas_draw,
  /** @export */
  m2w_canvas_font,
  /** @export */
  m2w_canvas_height,
  /** @export */
  m2w_canvas_line_height,
  /** @export */
  m2w_canvas_measure,
  /** @export */
  m2w_canvas_measure_three,
  /** @export */
  m2w_canvas_read_rows,
  /** @export */
  m2w_canvas_state,
  /** @export */
  m2w_chunk_cache_put,
  /** @export */
  m2w_chunk_cache_start,
  /** @export */
  m2w_chunk_from_cache,
  /** @export */
  m2w_chunk_in_background,
  /** @export */
  m2w_chunk_list,
  /** @export */
  m2w_chunk_used,
  /** @export */
  m2w_corpus_budget,
  /** @export */
  m2w_corpus_url,
  /** @export */
  m2w_css_to_buffer_ratio,
  /** @export */
  m2w_cursor_mode,
  /** @export */
  m2w_cursor_set,
  /** @export */
  m2w_cursor_visible,
  /** @export */
  m2w_dik_copy_state,
  /** @export */
  m2w_dik_start,
  /** @export */
  m2w_display_mode_size,
  /** @export */
  m2w_event_poll,
  /** @export */
  m2w_events_from_loop,
  /** @export */
  m2w_events_start,
  /** @export */
  m2w_fetch,
  /** @export */
  m2w_forest_mode,
  /** @export */
  m2w_fps_limit,
  /** @export */
  m2w_ime_enable,
  /** @export */
  m2w_key_pressed,
  /** @export */
  m2w_keys_start,
  /** @export */
  m2w_load_font,
  /** @export */
  m2w_missing_log_enabled,
  /** @export */
  m2w_mouse_position,
  /** @export */
  m2w_mouse_set,
  /** @export */
  m2w_movie_play,
  /** @export */
  m2w_no_cull,
  /** @export */
  m2w_no_custom,
  /** @export */
  m2w_no_flip,
  /** @export */
  m2w_no_models,
  /** @export */
  m2w_prefetch_start,
  /** @export */
  m2w_probe_count,
  /** @export */
  m2w_probe_file,
  /** @export */
  m2w_probe_hash_frame,
  /** @export */
  m2w_quit_page,
  /** @export */
  m2w_shadow_mode,
  /** @export */
  m2w_should_run,
  /** @export */
  m2w_skin_shortcut,
  /** @export */
  m2w_software_tnl,
  /** @export */
  m2w_sound_init,
  /** @export */
  m2w_sound_listener_direction,
  /** @export */
  m2w_sound_listener_position,
  /** @export */
  m2w_sound_load,
  /** @export */
  m2w_sound_play,
  /** @export */
  m2w_sound_position,
  /** @export */
  m2w_sound_slot_free,
  /** @export */
  m2w_sound_stop,
  /** @export */
  m2w_sound_volume,
  /** @export */
  m2w_texture_dir,
  /** @export */
  m2w_ui_scale,
  /** @export */
  m2w_webbrowser_destroy,
  /** @export */
  m2w_webbrowser_hide,
  /** @export */
  m2w_webbrowser_move,
  /** @export */
  m2w_webbrowser_show,
  /** @export */
  m2w_window_size,
  /** @export */
  proc_exit: _proc_exit,
  /** @export */
  random_get: _random_get
};

function invoke_ii(index,a1) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_vi(index,a1) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_viii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1,a2);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_v(index) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)();
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1,a2);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}


// include: postamble.js
// === Auto-generated postamble setup entry stuff ===

var calledRun;

function callMain(args = []) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on Module["onRuntimeInitialized"])');
  assert(typeof onPreRuns === 'undefined' || onPreRuns.length == 0, 'cannot call main when preRun functions remain to be called');

  var entryFunction = _main;

  args.unshift(thisProgram);

  var argc = args.length;
  var argv = stackAlloc((argc + 1) * 4);
  var argv_ptr = argv;
  for (var arg of args) {
    HEAPU32[((argv_ptr)>>2)] = stringToUTF8OnStack(arg);
    argv_ptr += 4;
  }
  HEAPU32[((argv_ptr)>>2)] = 0;

  try {

    var ret = entryFunction(argc, argv);

    // if we're not running an evented main loop, it's time to exit
    exitJS(ret, /* implicit = */ true);
    return ret;
  } catch (e) {
    return handleException(e);
  }
}

function stackCheckInit() {
  // This is normally called automatically during __wasm_call_ctors but need to
  // get these values before even running any of the ctors so we call it redundantly
  // here.
  _emscripten_stack_init();
  // TODO(sbc): Move writeStackCookie to native to to avoid this.
  writeStackCookie();
}

async function run(args = programArgs) {
  assert(!calledRun);
  calledRun = true;

  stackCheckInit();

  preRun();

  if (runDependencies) {
    await resolveRunDependencies();
  }

  var setStatus = Module['setStatus'];
  if (setStatus) {
    setStatus('Running...');
    // Yield to the event loop to allow the browser to paint "Running..."
    await new Promise((resolve) => setTimeout(resolve, 1));
    // Then we want to clear the status text, but only after the rest of this function runs.
    setTimeout(setStatus, 1, '');
  }

  if (ABORT) return;

  initRuntime();

  // No ATMAINS hooks

  Module['onRuntimeInitialized']?.();
  consumedModuleProp('onRuntimeInitialized');

  var noInitialRun = Module['noInitialRun'] || false;
  if (!noInitialRun) callMain(args);

  postRun();
}

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var oldOut = out;
  var oldErr = err;
  var has = false;
  out = err = (x) => {
    has = true;
  }
  try { // it doesn't matter if it fails
    _fflush(0);
    // also flush in the JS FS layer
    for (var name of ['stdout', 'stderr']) {
      var info = FS.analyzePath('/dev/' + name);
      if (!info) return;
      var stream = info.object;
      var rdev = stream.rdev;
      var tty = TTY.ttys[rdev];
      if (tty?.output?.length) {
        has = true;
      }
    }
  } catch(e) {}
  out = oldOut;
  err = oldErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.');
  }
}

var wasmExports;

// With async instantation wasmExports is assigned asynchronously when the
// instance is received.
createWasm().then(() => run());

// end include: postamble.js

