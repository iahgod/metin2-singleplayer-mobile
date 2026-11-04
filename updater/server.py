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
import struct
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



LARGE_PACK_CLIENT_DATA_PREFIXES = (
    'maps/', 'icon/', 'textureset/', 'ymir work/environment/', 'ymir work/ui/',
    'localadvent/', 'localchristmas/', 'localchristmas2019/'
)


def merge_property_crc(prop_out, data_dir):
    """Appends any missing <CRC>\t<path> entries from unpacked `property` pack into
    data_dir/property/crc_index.txt."""
    crc_file = data_dir / 'property' / 'crc_index.txt'
    if not crc_file.is_file() or not prop_out.is_dir():
        return 0
    existing_lines = crc_file.read_text(encoding='latin1').splitlines()
    have_paths = {l.split('\t', 1)[1].strip().lower() for l in existing_lines if '\t' in l}
    added = []
    for p in sorted(prop_out.rglob('*')):
        if not p.is_file():
            continue
        rel = p.relative_to(prop_out).as_posix()
        if not rel.lower().startswith('property/'):
            rel = 'property/' + rel
        if rel.lower() in have_paths:
            continue
        try:
            lines = p.read_text(encoding='latin1', errors='replace').splitlines()
            if len(lines) >= 2 and lines[0].strip().startswith('YPRT'):
                crc_val = lines[1].strip()
                if crc_val.isdigit():
                    added.append(f'{crc_val}\t{rel}')
                    have_paths.add(rel.lower())
        except Exception:
            pass
    if added:
        body = crc_file.read_bytes()
        if not body.endswith(b'\n'):
            body += b'\n'
        crc_file.write_bytes(body + ('\n'.join(added) + '\n').encode('latin1'))
    return len(added)



def pad_dds_pot(raw: bytes) -> bytes:
    if len(raw) < 128 or raw[:4] != b'DDS ':
        return raw
    magic, size, flags, height, width, pitch, depth, mips = struct.unpack_from("<4s7I", raw, 0)
    pf_size, pf_flags, fourcc, rgb_bits = struct.unpack_from("<2I4sI", raw, 76)
    if fourcc not in (b'DXT1', b'DXT3', b'DXT5'):
        return raw
    is_pot = (width & (width - 1)) == 0 and (height & (height - 1)) == 0
    if is_pot and mips <= 1:
        return raw
    new_w = 1
    while new_w < width:
        new_w <<= 1
    new_h = 1
    while new_h < height:
        new_h <<= 1
    block_sz = 8 if fourcc == b'DXT1' else 16
    old_bw = (width + 3) >> 2
    old_bh = (height + 3) >> 2
    new_bw = new_w >> 2
    new_bh = new_h >> 2
    out = bytearray(128 + new_bw * new_bh * block_sz)
    out[:128] = raw[:128]
    for by in range(old_bh):
        src_off = 128 + by * old_bw * block_sz
        dst_off = 128 + by * new_bw * block_sz
        out[dst_off:dst_off + old_bw * block_sz] = raw[src_off:src_off + old_bw * block_sz]
    new_flags = flags & ~0x20000
    struct.pack_into("<I", out, 8, new_flags)
    struct.pack_into("<I", out, 12, new_h)
    struct.pack_into("<I", out, 16, new_w)
    struct.pack_into("<I", out, 20, new_bw * new_bh * block_sz)
    struct.pack_into("<I", out, 28, 0)
    return bytes(out)

def append_to_corpus(work_dir, names, corpus_dir=None):
    """Appends any files from unpacked packs in `work_dir` that are missing from
    `corpus/manifest.bin` into new 4 MB content-addressed chunks and updates manifest.bin(.gz)."""
    corpus_dir = corpus_dir or (SITE_DIR / 'corpus')
    man_path = corpus_dir / 'manifest.bin'
    man_bak = corpus_dir / 'manifest.bin.bak_orig'
    if not man_bak.exists() and man_path.exists():
        shutil.copy2(man_path, man_bak)
    base_man = man_bak if man_bak.exists() else man_path
    if not base_man.exists():
        return 0, 0

    b = base_man.read_bytes()
    if b[:4] != b'M2WF':
        return 0, 0
    ver, chunk_size, chunk_total, pack_count, file_count, boot = struct.unpack_from('<6I', b, 4)
    pos = 28
    chunks = []
    for _ in range(chunk_total):
        chunks.append((b[pos:pos + 16].hex(), struct.unpack_from('<I', b, pos + 16)[0]))
        pos += 20
    packs = []
    for _ in range(pack_count):
        nlen = struct.unpack_from('<H', b, pos)[0]
        pos += 2
        packs.append(b[pos:pos + nlen])
        pos += nlen
    existing_entries = {}
    existing = {}
    for _ in range(file_count):
        p_idx, c_idx, off, sz = struct.unpack_from('<HIII', b, pos)
        pos += 14
        nlen = struct.unpack_from('<H', b, pos)[0]
        pos += 2
        name = b[pos:pos + nlen].decode('utf-8', 'replace').lower()
        pos += nlen
        existing[name] = sz
        existing_entries[name] = (p_idx, c_idx, off, sz)

    to_add = {}
    for name in names:
        out = work_dir / name
        if not out.is_dir():
            continue
        for p in sorted(out.rglob('*')):
            if not p.is_file():
                continue
            rel = p.relative_to(out).as_posix().lower()
            if name == 'property' and not rel.startswith('property/'):
                rel = 'property/' + rel
            if rel.endswith('.py'):
                continue
            sz = p.stat().st_size
            if existing.get(rel) == sz:
                continue
            to_add[rel] = p

    if not to_add:
        return 0, 0

    file_list = sorted(to_add.items())
    new_chunks = []
    new_entries = []
    buf = bytearray()
    chunk_num = len(chunks)
    BOMS = (bytes([0xFE, 0xFF]), bytes([0xFF, 0xFE]), bytes([0xEF, 0xBB, 0xBF]))

    def starts_with_bom(x):
        return any(x[:len(bm)] == bm for bm in BOMS)

    def close_chunk():
        nonlocal buf, chunk_num
        if not buf:
            return
        data = bytes(buf)
        digest = hashlib.sha256(data).hexdigest()[:32]
        c_bin = corpus_dir / f'{digest}.bin'
        if not c_bin.exists():
            c_bin.write_bytes(data)
            subprocess.run(['gzip', '-k', '-9', '-f', str(c_bin)], check=False)
        new_chunks.append((digest, len(data)))
        buf = bytearray()
        chunk_num += 1

    def close_avoiding_bom(next_b):
        nonlocal buf
        cut = len(buf)
        while cut > 0 and starts_with_bom(bytes(buf[cut:]) + next_b[:3]):
            cut -= 1
        suffix = bytes(buf[cut:])
        if suffix:
            for i in range(len(new_entries) - 1, -1, -1):
                ck, shf, sz, nm = new_entries[i]
                if ck != chunk_num:
                    break
                if shf >= cut:
                    new_entries[i] = (ck + 1, shf - cut, sz, nm)
            del buf[cut:]
        close_chunk()
        buf += suffix

    for idx, (rel_name, fpath) in enumerate(file_list):
        content = fpath.read_bytes()
        if rel_name.startswith('ymir work/ui/community/') and rel_name.endswith('.dds'):
            content = pad_dds_pot(content)
        new_entries.append((chunk_num, len(buf), len(content), rel_name))
        rest = content
        while rest:
            place = chunk_size - len(buf)
            buf += rest[:place]
            rest = rest[place:]
            if len(buf) >= chunk_size:
                nxt = rest[:3] if rest else (file_list[idx + 1][1].read_bytes()[:3] if idx + 1 < len(file_list) else b'')
                close_avoiding_bom(nxt)
    close_chunk()

    for ck, shf, sz, nm in new_entries:
        existing_entries[nm.lower()] = (0, ck, shf, sz)
    sorted_entries = sorted(existing_entries.items(), key=lambda x: x[0])
    all_chunks = chunks + new_chunks
    total_files = len(sorted_entries)
    out_parts = [b'M2WF', struct.pack('<6I', ver, chunk_size, len(all_chunks), len(packs), total_files, boot)]
    for digest, sz in all_chunks:
        out_parts.append(bytes.fromhex(digest))
        out_parts.append(struct.pack('<I', sz))
    for pb in packs:
        out_parts.append(struct.pack('<H', len(pb)))
        out_parts.append(pb)
    for nm, (p_idx, ck, shf, sz) in sorted_entries:
        nb = nm.encode('utf-8')
        out_parts.append(struct.pack('<HIII', p_idx, ck, shf, sz))
        out_parts.append(struct.pack('<H', len(nb)))
        out_parts.append(nb)

    new_man_bytes = b''.join(out_parts)
    man_path.write_bytes(new_man_bytes)
    subprocess.run(['gzip', '-k', '-9', '-f', str(man_path)], check=False)
    return len(new_entries), len(new_chunks)


def sync_data_packs(packs_dir, data_dir, node='node', unpack_js=None, work_dir=None):
    """Unpacks `gamedata`, `property` and every `patch_*` pack of the client package, updates
    data_dir (client.data) and appends any missing 3D/texture assets to corpus/manifest.bin."""
    unpack_js = unpack_js or (UPDATER_DIR / 'unpack_pack.js')
    work_dir = work_dir or (UPDATER_DIR / 'datapacks')
    shutil.rmtree(work_dir, ignore_errors=True)
    names = ['gamedata', 'property'] + sorted(p.stem for p in packs_dir.glob('patch_*.index') if p.stem not in DATA_PACK_SKIP)
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
                           capture_output=True, text=True, encoding='utf-8', errors='replace')
        if r.returncode != 0:
            log_line(f'UWAGA: nie rozpakowano paczki {name}: {(r.stdout + r.stderr).strip()[:200]}')
            continue
        if name == 'property':
            crc_added = merge_property_crc(out, data_dir)
            if crc_added:
                log_line(f'property/crc_index.txt: dopisano {crc_added} nowych obiektow 3D.')
                changed += crc_added
            continue
        files = [p for p in out.rglob('*') if p.is_file()]
        size = sum(p.stat().st_size for p in files)
        large_pack = (name != 'gamedata' and size > DATA_PACK_MAX_BYTES)
        added = 0
        for p in files:
            rel = p.relative_to(out).as_posix()
            rel_low = rel.lower()
            if rel_low.endswith('.py'):
                continue
            if large_pack and not rel_low.startswith(LARGE_PACK_CLIENT_DATA_PREFIXES):
                continue
            dest = rel if rel in exact else lower.get(rel_low, rel)
            target = data_dir / dest
            data = p.read_bytes()
            if target.is_file() and target.read_bytes() == data:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            exact[dest] = True
            lower.setdefault(rel_low, dest)
            added += 1
        changed += added
        if large_pack:
            log_line(f'Paczka {name} ({size // 1024} kB): dodano mapy/ikony do client.data ({added}), modele 3D trafia do korpusu.')
        else:
            log_line(f'Paczka danych {name}: {len(files)} plikow, nowych/zmienionych {added}.')
    scripts_link = work_dir / '_scripts'
    if (UPDATER_DIR / 'scripts').is_dir() and not scripts_link.exists():
        try:
            os.symlink(str(UPDATER_DIR / 'scripts'), str(scripts_link))
        except Exception:
            pass
    c_files, c_chunks = append_to_corpus(work_dir, [n for n in names if n != 'gamedata'] + (['_scripts'] if scripts_link.exists() else []))
    if c_files:
        log_line(f'Korpus WebFS (manifest.bin): dopisano {c_files} plikow w {c_chunks} nowych blokach 4 MB.')
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
                encoding='utf-8',
                errors='replace',
            )
            if r.returncode != 0:
                raise RuntimeError(f'Blad unpack_pack dla {pack_name}: {r.stdout} {r.stderr}')

    py_files = sorted(scripts_dir.rglob('*.py'))
    log_line(f'Konwersja kodowania i przepisanie {len(py_files)} skryptow do Pythona 3 (lib2to3) ...')
    to_utf8(py_files)
    import ast
    to_fix = []
    for p in py_files:
        if p.stat().st_size > 400000:
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
        if p.stat().st_size > 400000:
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
        is_ui_bundle = rel_low.startswith('ymir work/ui/community/') or (
            rel_low.startswith('playerbot_ui/') and not rel_low.startswith('playerbot_ui/fortune_wheel/')
        )
        if not is_ui_bundle:
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
        if is_ui_bundle and ext == '.dds':
            dest_path.write_bytes(pad_dds_pot(p.read_bytes()))
        else:
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
    new_js_txt = js_txt[:m.start()] + f'loadPackage({new_pkg_json});' + js_txt[m.end():]
    fc_pat = re.compile(r'^Module\[\'FS_createPath\'\]\("([^"]*)",\s*"([^"]*)",\s*true,\s*true\);\r?$', re.M)
    fc_matches = list(fc_pat.finditer(new_js_txt))
    if fc_matches:
        for fm in fc_matches:
            fp, fleaf = fm.group(1), fm.group(2)
            dirs_set.add(('/' + fleaf) if fp == '/' else (fp.rstrip('/') + '/' + fleaf))
        fc_lines = []
        for d in sorted(dirs_set, key=lambda x: (x.count('/'), x)):
            s = d.strip('/')
            parent_d = '/' + '/'.join(s.split('/')[:-1]) if '/' in s else '/'
            leaf_d = s.split('/')[-1]
            fc_lines.append(f"Module['FS_createPath'](\"{parent_d}\", \"{leaf_d}\", true, true);")
        new_js_txt = new_js_txt[:fc_matches[0].start()] + '\n'.join(fc_lines) + new_js_txt[fc_matches[-1].end():]
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
    html_txt = re.sub(r'(var\s+BUILD_VER\s*=\s*")[A-Za-z0-9_.-]+(")', rf'\g<1>{ver_hash}\2', html_txt)
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
                encoding='utf-8',
                errors='replace',
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
            subprocess.run(['/opt/metin2-web/updater/install_teleexpress.sh'], check=False)
            for _pws in ('/opt/metin2/files/playerbot_world_settings.py', '/opt/metin2/linux-port/docker/panel/app/playerbot_world_settings.py'):
                if os.path.exists(_pws):
                    _s = open(_pws, encoding='utf-8', errors='replace').read()
                    _old = "    def performance_red():\n        now = int(time.time())\n        with locked(path):\n            values = read(path)\n            if values['ROTATION_ENABLED'] and values['ROTATION_PERF_UNTIL'] <= now:\n                values['ROTATION_PERF_UNTIL'] = now + 1800\n                write(path, values)"
                    if _old in _s:
                        open(_pws, 'w', encoding='utf-8').write(_s.replace(_old, "    def performance_red():\n        return"))
            subprocess.run(['docker', 'cp', '/opt/metin2/files/playerbot_world_settings.py', 'metin2-panel:/opt/panel/playerbot_world_settings.py'], check=False)
            subprocess.run(['docker', 'restart', 'metin2-panel'], check=False)
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
