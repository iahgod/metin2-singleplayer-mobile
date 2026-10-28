#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""merge_release.py - builds a repo-ready client.data from the repository's image and a live site.

The repository (site/client.data + site/client.js) carries the maintainers' own script patches and a
neutral server address. A live site is rebuilt by the VPS updater from the newest upstream packs, so
it has the newest game data and maps but not those patches. This tool takes the repository image as the
base and lays the *upstream-owned* files of the live site over it:

  * /gamedata/*, /maps/*, /icon/*, /ymir work/ui/atlas/*, /locale/<lang>/skilldesc.txt  (data)
  * the files listed in TAKE_LIVE_FILES (version marker and upstream fixes in otherwise stock scripts)

and keeps the repository's version of everything else (KEEP_REPO_FILES: their patched scripts and the
server address). Any other file that differs is only REPORTED, never taken silently.

The tables in client.js are rebuilt (offsets, remote_package_size, FS_createPath for new folders); the
.gz files are regenerated. The production address is never copied: the tool refuses to write an image
that contains the address from updater/server_ip.txt or $M2W_FORBID.

usage: merge_release.py <repo_site_dir> <live_site_dir> <out_dir>
"""
import gzip
import json
import os
import re
import sys

TAKE_LIVE_PREFIXES = ('/gamedata/', '/maps/', '/icon/', '/ymir work/ui/atlas/')
TAKE_LIVE_RE = re.compile(r'^/locale/[a-z]{2}/skilldesc\.txt$')
TAKE_LIVE_FILES = {'/playerbot_client_version.py', '/uiToolTip.py'}
KEEP_REPO_FILES = {'/introLogin.py', '/uiChat.py', '/serverInfo.py'}


def read_image(site_dir):
    js = open(os.path.join(site_dir, 'client.js'), encoding='latin1').read()
    i = re.search(r'loadPackage\(\{', js).end() - 1
    depth, k = 0, i
    while True:
        c = js[k]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                break
        k += 1
    meta = json.loads(js[i:k + 1])
    data = open(os.path.join(site_dir, 'client.data'), 'rb').read()
    assert meta['files'][-1]['end'] == len(data) == meta['remote_package_size'], 'client.js does not match client.data in ' + site_dir
    files = {e['filename']: data[e['start']:e['end']] for e in meta['files']}
    return js, (i, k + 1), meta, files


def same_text(a, b):
    return a.replace(b'\r\n', b'\n') == b.replace(b'\r\n', b'\n')


def main(repo_dir, live_dir, out_dir):
    rjs, (ri, rk), rmeta, repo = read_image(repo_dir)
    _, _, _, live = read_image(live_dir)
    order = [e['filename'] for e in rmeta['files']]
    result = dict(repo)
    taken, new_files, unresolved = [], [], []
    for name, body in live.items():
        take = (name.startswith(TAKE_LIVE_PREFIXES) or TAKE_LIVE_RE.match(name) or name in TAKE_LIVE_FILES) \
            and name not in KEEP_REPO_FILES
        if name not in repo:
            if take:
                result[name] = body
                order.append(name)
                new_files.append(name)
            else:
                unresolved.append(('only in live', name))
            continue
        if repo[name] == body:
            continue
        if take:
            result[name] = body
            taken.append(name)
        elif name in KEEP_REPO_FILES or same_text(repo[name], body):
            pass
        else:
            unresolved.append(('differs', name))

    # never ship a production address
    forbid = os.environ.get('M2W_FORBID', '').strip()
    if not forbid:
        try:
            forbid = open('/opt/metin2-web/updater/server_ip.txt').read().strip()
        except OSError:
            forbid = ''
    blob = b''.join(result[n] for n in order)
    if forbid and forbid.encode() in blob:
        sys.exit('REFUSED: the merged image contains the production address')

    # rebuild image + table
    out, table = bytearray(), []
    for name in order:
        b = result[name]
        table.append({'filename': name, 'start': len(out), 'end': len(out) + len(b)})
        out += b
    js = rjs[:ri] + json.dumps({'files': table, 'remote_package_size': len(out)}) + rjs[rk:]
    dirs = set()
    for name in order:
        p = os.path.dirname(name)
        while p and p != '/':
            dirs.add(p)
            p = os.path.dirname(p)
    extra = ''
    for d in sorted(dirs):
        s = d.strip('/')
        parent = '/' + '/'.join(s.split('/')[:-1]) if '/' in s else '/'
        line = "Module['FS_createPath'](\"%s\", \"%s\", true, true);" % (parent, s.split('/')[-1])
        if line not in js:
            extra += line + '\n'
    if extra:
        anchor = "Module['FS_createPath'](\"/\", \"cursors\", true, true);"
        if anchor not in js:
            sys.exit('REFUSED: FS_createPath anchor not found in client.js')
        js = js.replace(anchor, anchor + '\n' + extra.rstrip('\n'), 1)

    os.makedirs(out_dir, exist_ok=True)
    open(os.path.join(out_dir, 'client.data'), 'wb').write(out)
    open(os.path.join(out_dir, 'client.js'), 'w', encoding='latin1', newline='').write(js)
    for f in ('client.data', 'client.js'):
        raw = open(os.path.join(out_dir, f), 'rb').read()
        with open(os.path.join(out_dir, f + '.gz'), 'wb') as g:
            g.write(gzip.compress(raw, 9, mtime=0))
    print('base (repo) files        :', len(repo))
    print('taken from live (changed):', len(taken), taken)
    print('new from live            :', len(new_files))
    print('kept from repo (differ)  :', sorted(n for n in KEEP_REPO_FILES if n in live and n in repo and repo[n] != live[n]))
    print('UNRESOLVED differences   :', len(unresolved), unresolved[:20])
    print('result: %d files, %d bytes' % (len(table), len(out)))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
