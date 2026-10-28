#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import hashlib
import http.server
import io
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import zipfile

UPDATER_DIR = pathlib.Path('/opt/metin2-web/updater')
SITE_DIR = pathlib.Path('/opt/metin2-web/site')
METIN2_DIR = pathlib.Path('/opt/metin2')
WEB_VERSION_FILE = UPDATER_DIR / 'webclient.version'
MANIFEST_URL = 'https://raw.githubusercontent.com/TieruYT/metin2-playerbots/main/update-manifest-mt2009.json'
def _read_server_ip():
    """The public address of this VPS: updater/server_ip.txt (private, never committed),
    else the M2W_SERVER_IP environment variable, else 127.0.0.1."""
    try:
        txt = (pathlib.Path(__file__).resolve().parent / 'server_ip.txt').read_text(encoding='utf-8').strip()
        if txt:
            return txt
    except OSError:
        pass
    return os.environ.get('M2W_SERVER_IP', '').strip() or '127.0.0.1'


SERVER_IP = _read_server_ip()

sys.path.insert(0, str(UPDATER_DIR))
import script_patches  # noqa: E402
import division  # noqa: E402

STATE = {
    'running': False,
    'started_at': None,
    'finished_at': None,
    'last_exit_code': None,
    'logs': ['Gotowy do pracy. Kliknij przycisk powyzej, aby rozpoczac aktualizacje.'],
}
LOCK = threading.Lock()


def log_line(msg):
    ts = time.strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    with LOCK:
        STATE['logs'].append(line)
        if len(STATE['logs']) > 600:
            STATE['logs'] = STATE['logs'][-600:]


def get_installed_server_version():
    ver_file = METIN2_DIR / 'VERSION'
    if ver_file.exists():
        return ver_file.read_text(encoding='utf-8', errors='ignore').strip()
    return 'nieznana'


def get_installed_client_version():
    if WEB_VERSION_FILE.exists():
        return WEB_VERSION_FILE.read_text(encoding='utf-8', errors='ignore').strip()
    return 'nieznana'


def fetch_upstream_manifest():
    req = urllib.request.Request(
        MANIFEST_URL + f'?t={int(time.time())}',
        headers={'Cache-Control': 'no-cache', 'User-Agent': 'Metin2-WebUpdater/1.0'}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8'))


def to_utf8(file_list):
    count = 0
    for p in file_list:
        raw = p.read_bytes()
        if raw.startswith(b'\xef\xbb\xbf'):
            raw = raw[3:]
            p.write_bytes(raw)
        try:
            raw.decode('utf-8')
            continue
        except UnicodeDecodeError:
            pass
        for enc in ('cp949', 'cp1250', 'latin1'):
            try:
                txt = raw.decode(enc)
                p.write_text(txt, encoding='utf-8', newline='')
                count += 1
                break
            except UnicodeDecodeError:
                continue
    return count


def match_names(directory):
    names = [p.name for p in directory.iterdir() if p.is_file() and p.name.endswith('.py')]
    by_lower = {n.lower(): n for n in names}
    usages = {}
    for n in names:
        content = (directory / n).read_text(encoding='utf-8', errors='replace')
        for m in re.finditer(r'^\s*(?:import|from)\s+([A-Za-z_][\w]*)', content, re.M):
            mod = m.group(1)
            key = (mod + '.py').lower()
            if key in by_lower:
                usages.setdefault(key, set()).add(mod)
    changed = 0
    for key, variants in usages.items():
        mod = sorted(variants, key=lambda s: (-sum(1 for c in s if c.isupper()), s))[0]
        old_name = by_lower[key]
        new_name = mod + '.py'
        if old_name != new_name:
            (directory / old_name).rename(directory / new_name)
            changed += 1
    return changed


def collect_uiscript_spellings(scripts_dir):
    formula = re.compile(r'[Uu][Ii][Ss]cript/([A-Za-z0-9_]+\.py)')
    found = {}
    for p in scripts_dir.rglob('*.py'):
        txt = p.read_text(encoding='utf-8', errors='replace')
        for m in formula.finditer(txt):
            name = m.group(1)
            found.setdefault(name.lower(), name)
    return found


# Packs whose content is data, not scripts: `gamedata` (item_proto, mob_proto, npclist, atlasinfo,
# race motions) and every `patch_*` pack (new maps, dungeons, icons - e.g. patch_beran, which carries
# the Beran-Setaou dungeon). They used to be ignored, so a new dungeon never reached the web client.
# patch_wiki is excluded: it is large, unchanged between updates and already streamed from the corpus.
DATA_PACK_SKIP = {'patch_wiki'}
DATA_PACK_MAX_BYTES = 12 * 1024 * 1024   # a patch pack above this stays in the streamed corpus


def merge_atlas(data_dir):
    """gamedata/atlasinfo.txt and our own gamedata/AtlasInfo.txt coexist in the image: every map
    line the first has and the second lacks is appended to the second."""
    low = data_dir / 'gamedata' / 'atlasinfo.txt'
    cap = data_dir / 'gamedata' / 'AtlasInfo.txt'
    if not (low.is_file() and cap.is_file()) or low.samefile(cap):
        return 0
    have = {re.sub(r'\s+', ' ', l.strip()).lower() for l in cap.read_text(encoding='latin1').splitlines()}
    add = [l for l in low.read_text(encoding='latin1').splitlines()
           if l.strip() and re.sub(r'\s+', ' ', l.strip()).lower() not in have]
    if add:
        body = cap.read_bytes()
        if not body.endswith(b'\n'):
            body += b'\r\n'
        cap.write_bytes(body + ('\r\n'.join(add) + '\r\n').encode('latin1'))
    return len(add)


def sync_data_packs(packs_dir, data_dir, node='node', unpack_js=None, work_dir=None):
    """Unpacks `gamedata` and every patch_* pack of the client package and copies their files into
    data_dir (the extracted client.data); returns how many files were added or replaced."""
    unpack_js = unpack_js or (UPDATER_DIR / 'unpack_pack.js')
    work_dir = work_dir or (UPDATER_DIR / 'datapacks')
    shutil.rmtree(work_dir, ignore_errors=True)
    names = ['gamedata'] + sorted(p.stem for p in packs_dir.glob('patch_*.index') if p.stem not in DATA_PACK_SKIP)
    exact = {}
    for p in data_dir.rglob('*'):
        if p.is_file():
            exact[p.relative_to(data_dir).as_posix()] = True
    lower = {}
    for rel in exact:
        lower.setdefault(rel.lower(), rel)
    changed = 0
    for name in names:
        if not (packs_dir / f'{name}.index').exists():
            continue
        out = work_dir / name
        r = subprocess.run([node, str(unpack_js), '.', name, str(out)], cwd=str(packs_dir),
                           capture_output=True, text=True)
        if r.returncode != 0:
            log_line(f'UWAGA: nie rozpakowano paczki {name}: {(r.stdout + r.stderr).strip()[:200]}')
            continue
        files = [p for p in out.rglob('*') if p.is_file()]
        size = sum(p.stat().st_size for p in files)
        if name != 'gamedata' and size > DATA_PACK_MAX_BYTES:
            log_line(f'Paczka {name}: {size // 1024} kB - za duza do obrazu startowego, zostaje w korpusie.')
            continue
        added = 0
        for p in files:
            rel = p.relative_to(out).as_posix()
            if rel.lower().endswith('.py'):
                continue   # scripts take the conversion path above
            dest = rel if rel in exact else lower.get(rel.lower(), rel)
            target = data_dir / dest
            data = p.read_bytes()
            if target.is_file() and target.read_bytes() == data:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            exact[dest] = True
            lower.setdefault(dest.lower(), dest)
            added += 1
        changed += added
        log_line(f'Paczka danych {name}: {len(files)} plikow, nowych/zmienionych {added}.')
    merged = merge_atlas(data_dir)
    if merged:
        log_line(f'AtlasInfo.txt: dopisano {merged} linii map z atlasinfo.txt.')
    shutil.rmtree(work_dir, ignore_errors=True)
    return changed


def rebuild_webclient(manifest):
    cli_info = manifest.get('client', {})
    cli_ver = cli_info.get('version', 'unknown')
    cli_url = cli_info.get('url', '')
    if not cli_url:
        raise RuntimeError('Brak adresu URL paczki klienta w manifescie!')

    data_dir = UPDATER_DIR / 'data'
    packs_dir = UPDATER_DIR / 'packs'
    scripts_dir = UPDATER_DIR / 'scripts'

    log_line('Rozpakowywanie aktualnego obrazu client.data ...')
    shutil.rmtree(data_dir, ignore_errors=True)
    data_dir.mkdir(parents=True, exist_ok=True)

    js_path = SITE_DIR / 'client.js'
    if not js_path.exists() or 'loadPackage(' not in js_path.read_text(encoding='utf-8'):
        js_path = SITE_DIR / 'preload.js'
    data_path = SITE_DIR / 'client.data'
    js_txt = js_path.read_text(encoding='utf-8')
    m = re.search(r'loadPackage\((\{.*?\})\);', js_txt)
    if not m:
        raise RuntimeError(f'Nie znaleziono loadPackage({{...}}) w {js_path.name}!')
    meta = json.loads(m.group(1))
    raw_data = data_path.read_bytes()
    for entry in meta['files']:
        rel = entry['filename'].lstrip('/')
        target = data_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw_data[entry['start']:entry['end']])
    log_line(f'Wypakowano {len(meta["files"])} plikow bazowych z client.data.')

    log_line(f'Pobieranie paczki klienta {cli_ver}: {cli_url} ...')
    shutil.rmtree(packs_dir, ignore_errors=True)
    packs_dir.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(cli_url, headers={'User-Agent': 'Metin2-WebUpdater/1.0'})
    zip_bytes = urllib.request.urlopen(req, timeout=180).read()
    log_line(f'Pobrano {len(zip_bytes) // (1024 * 1024)} MB. Wypakowywanie archiwow pack/* ...')

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        for name in z.namelist():
            norm = name.replace('\\', '/')
            if norm.startswith('pack/') and norm != 'pack/':
                fname = norm.split('/', 1)[1]
                (packs_dir / fname).write_bytes(z.read(name))

    shutil.rmtree(scripts_dir, ignore_errors=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    for pack_name in ('root', 'locale'):
        if (packs_dir / f'{pack_name}.index').exists():
            log_line(f'Dekodowanie paczki EterPack: {pack_name} ...')
            r = subprocess.run(
                ['node', str(UPDATER_DIR / 'unpack_pack.js'), '.', pack_name, str(scripts_dir)],
                cwd=str(packs_dir),
                capture_output=True,
                text=True,
            )
            if r.returncode != 0:
                raise RuntimeError(f'Blad unpack_pack dla {pack_name}: {r.stdout} {r.stderr}')

    py_files = sorted(scripts_dir.rglob('*.py'))
    log_line(f'Konwersja kodowania i przepisanie {len(py_files)} skryptow do Pythona 3 (lib2to3) ...')
    to_utf8(py_files)
    import ast
    to_fix = []
    for p in py_files:
        if p.stat().st_size > 150000:
            try:
                ast.parse(p.read_text(encoding='utf-8', errors='replace'))
                continue
            except SyntaxError:
                pass
        to_fix.append(str(p))
    if to_fix:
        subprocess.run(
            [sys.executable, '-m', 'lib2to3', '-j', '4', '-w', '-n', '--no-diffs', *to_fix],
            capture_output=True,
            text=True,
        )

    log_line('Nakladanie latek semantycznych (script_patches + division) ...')
    match_names(scripts_dir)
    import importlib; importlib.reload(script_patches); script_patches.apply_all(str(scripts_dir))

    for p in sorted(scripts_dir.rglob('*.py')):
        if p.stat().st_size > 150000:
            continue
        txt = p.read_text(encoding='utf-8', errors='replace')
        try:
            new_txt, int_cnt, _, _ = division.convert_divisions(txt)
            if int_cnt:
                p.write_text(new_txt, encoding='utf-8', newline='')
        except Exception:
            pass

    # Cap EXPECTED_EXE_BUILD in intrologin.py so WebClient never rejects newer root packs
    for il_cand in scripts_dir.glob('*'):
        if il_cand.is_file() and il_cand.name.lower() == 'intrologin.py':
            il_txt = il_cand.read_text(encoding='utf-8', errors='replace')
            il_txt = re.sub(r'EXPECTED_EXE_BUILD\s*=\s*\d+', 'EXPECTED_EXE_BUILD = 6', il_txt)
            il_cand.write_text(il_txt, encoding='utf-8', newline='')
            log_line('Zabezpieczono EXPECTED_EXE_BUILD = 6 w intrologin.py.')

    # Set SERVER_IP in serverInfo.py
    for si_cand in scripts_dir.glob('*'):
        if si_cand.is_file() and si_cand.name.lower() == 'serverinfo.py':
            si_txt = si_cand.read_text(encoding='utf-8', errors='replace')
            new_si, cnt = re.subn(
                r'^(SERVER_IP\s*=\s*)"[^"]*"',
                rf'\g<1>"{SERVER_IP}"',
                si_txt,
                flags=re.M,
            )
            if cnt == 0:
                new_si, cnt = re.subn(
                    r'^(\s*"host"\s*:\s*)"[^"]*"',
                    rf'\g<1>"{SERVER_IP}"',
                    si_txt,
                    count=1,
                    flags=re.M,
                )
            if cnt:
                si_cand.write_text(new_si, encoding='utf-8', newline='')
                log_line(f'Ustawiono adres serwera {SERVER_IP} w {si_cand.name}.')

    # Map existing paths in data_dir by lowercase relative path so case is preserved
    existing_map = {}
    for p in data_dir.rglob('*'):
        if p.is_file():
            rel = p.relative_to(data_dir).as_posix()
            existing_map[rel.lower()] = rel

    ui_spellings = collect_uiscript_spellings(scripts_dir)
    skip_exts = {'.tga', '.dds', '.jpg', '.png', '.bmp', '.mde', '.mse', '.gr2', '.mp3', '.wav', '.sub'}
    updated_files = 0

    for p in sorted(scripts_dir.rglob('*')):
        if not p.is_file():
            continue
        rel = p.relative_to(scripts_dir).as_posix()
        rel_low = rel.lower()
        ext = p.suffix.lower()
        if ext in skip_exts and p.name.lower() not in ('login_small.jpg', 'loginwindow.sub', 'login.dds', 'loginwindow.tga'):
            continue
        if not ext and p.name.lower() == 'locale.cfg':
            continue
        if rel_low.startswith('locale/') and not rel_low.startswith(('locale/pl/', 'locale/en/', 'locale/tr/', 'locale/common/')):
            continue
        if '/' in rel_low and not rel_low.startswith(('locale/', 'uiscript/')) and ext != '.py':
            continue

        if rel_low.startswith('uiscript/') and ext == '.py':
            spelled = ui_spellings.get(p.name.lower(), p.name)
            dest_rel = f'uiscript/{spelled}'
        elif rel_low in existing_map:
            dest_rel = existing_map[rel_low]
        else:
            dest_rel = rel

        dest_path = data_dir / dest_rel
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dest_path)
        updated_files += 1

    log_line(f'Zaktualizowano {updated_files} plikow skryptow i ukladow okien w obrazie danych.')

    sync_data_packs(packs_dir, data_dir)

    # Repack data_dir into client.data and update preload.js + client.html
    files_meta = []
    chunks = []
    offset = 0
    dirs_set = set()

    for p in sorted(data_dir.rglob('*')):
        if not p.is_file():
            continue
        rel_posix = '/' + p.relative_to(data_dir).as_posix()
        parent = os.path.dirname(rel_posix)
        while parent and parent != '/':
            dirs_set.add(parent)
            parent = os.path.dirname(parent)
        raw = p.read_bytes()
        end = offset + len(raw)
        files_meta.append({'filename': rel_posix, 'start': offset, 'end': end})
        chunks.append(raw)
        offset = end

    new_client_data = b''.join(chunks)
    tmp_data = SITE_DIR / 'client.data.tmp'
    tmp_data.write_bytes(new_client_data)
    os.chmod(tmp_data, 0o644)
    tmp_data.replace(data_path)

    new_pkg_json = json.dumps({'files': files_meta, 'remote_package_size': offset})
    extra_dirs = ''
    for d in sorted(dirs_set):
        parent_d = '/' + '/'.join(d.strip('/').split('/')[:-1]) if '/' in d.strip('/') else '/'
        leaf_d = d.strip('/').split('/')[-1]
        CreateLine = f"Module['FS_createPath'](\"{parent_d}\", \"{leaf_d}\", true, true);"
        if CreateLine not in js_txt:
            extra_dirs += CreateLine + '\n'
    new_js_txt = js_txt[:m.start()] + f'loadPackage({new_pkg_json});' + js_txt[m.end():]
    anchor = "Module['FS_createPath'](\"/\", \"cursors\", true, true);"
    if extra_dirs and anchor in new_js_txt:
        new_js_txt = new_js_txt.replace(anchor, anchor + '\n' + extra_dirs.rstrip('\n'), 1)
    tmp_js = SITE_DIR / (js_path.name + '.tmp')
    tmp_js.write_text(new_js_txt, encoding='utf-8', newline='\n')
    os.chmod(tmp_js, 0o644)
    tmp_js.replace(js_path)

    # Update cache version in client.html
    ver_hash = hashlib.sha256(new_client_data[:65536] + str(time.time()).encode()).hexdigest()[:12]
    html_path = SITE_DIR / 'client.html'
    html_txt = html_path.read_text(encoding='utf-8')
    html_txt = re.sub(r'(\?v=)[A-Za-z0-9_.-]+', rf'\g<1>{ver_hash}', html_txt)
    html_txt = re.sub(r'(@)[A-Za-z0-9_.-]+(")', rf'\g<1>{ver_hash}\2', html_txt)
    html_txt = re.sub(r'(var\s+M2W_PAGE_VER\s*=\s*")[A-Za-z0-9_.-]+(")', rf'\g<1>{ver_hash}\2', html_txt)
    html_path.write_text(html_txt, encoding='utf-8', newline='\n')
    os.chmod(html_path, 0o644)

    for gz_target in ('client.data', 'client.wasm', 'client.js', 'client.html', 'preload.js', 'mobile_overlay.js'):
        p_gz = SITE_DIR / gz_target
        if p_gz.exists():
            subprocess.run(['gzip', '-k', '-9', '-f', str(p_gz)], check=False)
    log_line('Wygenerowano statycznie skompresowane pliki gzip (.data.gz, .wasm.gz, .js.gz, .html.gz, overlay.gz).')

    WEB_VERSION_FILE.write_text(cli_ver + '\n', encoding='utf-8')
    shutil.rmtree(packs_dir, ignore_errors=True)
    shutil.rmtree(scripts_dir, ignore_errors=True)
    shutil.rmtree(data_dir, ignore_errors=True)
    log_line(f'SUKCES! Nowy client.data ({offset // 1024} kB, wersja {cli_ver}, build {ver_hash}) jest juz aktywny!')


def worker_run(mode):
    try:
        manifest = fetch_upstream_manifest()
        srv_ver = (manifest.get('server') or {}).get('version') or (manifest.get('migration') or {}).get('version') or manifest.get('version', '?')
        cli_ver = (manifest.get('client') or {}).get('version', '?')
        log_line(f'Rozpoczynam aktualizacje (tryb: {mode}) -> Serwer: {srv_ver}, Klient Web: {cli_ver}')

        if mode == 'all':
            log_line('--- ETAP 1/2: Aktualizacja serwera gry na VPS (vps-install.sh update) ---')
            proc = subprocess.Popen(
                ['sh', 'linux-port/tools/vps-install.sh', 'update', '--follow'],
                cwd=str(METIN2_DIR),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            for line in proc.stdout:
                s = line.rstrip()
                if s:
                    log_line(s)
            proc.wait()
            if proc.returncode != 0:
                raise RuntimeError(f'vps-install.sh update zakonczyl sie kodem {proc.returncode}')
            log_line('Serwer gry na VPS zostal pomyslnie zaktualizowany.')
            subprocess.run(['/opt/metin2-web/updater/install_m2w_assistant.sh'], check=False)
            log_line('Przywrocono Asystenta Straznika Wsi (Buffy VIP + 1-Klik Misje).')

        log_line('--- ETAP 2/2: Aktualizacja i przebudowa Klienta Web na VPS ---')
        rebuild_webclient(manifest)
        with LOCK:
            STATE['last_exit_code'] = 0
            STATE['finished_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
        log_line('=== WSZYSTKO ZAKTUALIZOWANE POMYSLNIE! ===')
    except BaseException as e:
        log_line(f'BLAD KRYTYCZNY: {e}')
        with LOCK:
            STATE['last_exit_code'] = 1
            STATE['finished_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
    finally:
        with LOCK:
            STATE['running'] = False


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def _send_json(self, code, payload):
        raw = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.startswith('/api/updater/status'):
            try:
                manifest = fetch_upstream_manifest()
            except Exception as e:
                manifest = {'error': str(e)}
            inst_srv = get_installed_server_version()
            inst_cli = get_installed_client_version()
            lat_srv = (manifest.get('server') or {}).get('version') or (manifest.get('migration') or {}).get('version') or manifest.get('version', '?')
            lat_cli = (manifest.get('client') or {}).get('version', '?')
            with LOCK:
                payload = {
                    'installed_server': inst_srv,
                    'latest_server': lat_srv,
                    'server_up_to_date': inst_srv == lat_srv,
                    'installed_client': inst_cli,
                    'latest_client': lat_cli,
                    'client_up_to_date': inst_cli == lat_cli,
                    'status_message': manifest.get('statusMessage', ''),
                    'published_at': manifest.get('publishedAt', ''),
                    'running': STATE['running'],
                    'started_at': STATE['started_at'],
                    'finished_at': STATE['finished_at'],
                    'last_exit_code': STATE['last_exit_code'],
                    'logs': list(STATE['logs']),
                }
            self._send_json(200, payload)
        else:
            self._send_json(404, {'error': 'Not found'})

    def do_POST(self):
        if self.path.startswith('/api/updater/run'):
            length = int(self.headers.get('Content-Length', '0'))
            body = json.loads(self.rfile.read(length).decode('utf-8') or '{}') if length else {}
            mode = body.get('mode', 'all')
            with LOCK:
                if STATE['running']:
                    self._send_json(409, {'error': 'Aktualizacja juz trwa!'})
                    return
                STATE['running'] = True
                STATE['started_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
                STATE['finished_at'] = None
                STATE['last_exit_code'] = None
                STATE['logs'] = [f'[{time.strftime("%H:%M:%S")}] Inicjalizacja zadania aktualizacji ({mode})...']
            t = threading.Thread(target=worker_run, args=(mode,), daemon=True)
            t.start()
            self._send_json(200, {'ok': True, 'mode': mode})
        else:
            self._send_json(404, {'error': 'Not found'})


if __name__ == '__main__':
    if not WEB_VERSION_FILE.exists():
        WEB_VERSION_FILE.write_text('2.0.106\n', encoding='utf-8')
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 11498), Handler)
    print('Metin2 Updater listening on 127.0.0.1:11498', flush=True)
    srv.serve_forever()
