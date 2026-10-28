# VPS one-click updater (`server.py`)

`server.py` is the service behind the "Update" button: it follows the upstream manifest, updates the
game server (`vps-install.sh update`) and rebuilds the web client's `client.data` in place.

## What changed: data packs reach the web client

Until now only the `root` and `locale` packs were read, so content that ships in other packs never
arrived. `sync_data_packs()` now also unpacks

* `gamedata` (item_proto, mob_proto, npclist, atlasinfo, race motions) and
* every `patch_*` pack (new maps, dungeons, icons - e.g. `patch_beran`, the Beran-Setaou dungeon),

and merges their files into the extracted image before it is repacked. Rules:

* `patch_wiki` is skipped (large, unchanged, already streamed from the corpus);
* a patch pack larger than 12 MB is skipped and stays in the streamed corpus;
* `.py` files are left to the script-conversion path;
* case of existing paths is kept, new directories get their `FS_createPath` line in `client.js`;
* lines of the new `atlasinfo.txt` missing from our `AtlasInfo.txt` are appended to it.

## Private settings

The server address is **not** in the source. It is read from `updater/server_ip.txt` (one line,
never committed), else from the `M2W_SERVER_IP` environment variable, else `127.0.0.1`.

## `merge_release.py` - a complete, repo-ready `client.data`

A live site is rebuilt by the updater from the newest upstream packs; the repository's `site/client.data`
carries the maintainers' own script patches and a neutral server address. To publish a release that has
both, run on the VPS:

    python3 updater/merge_release.py <repo>/site /opt/metin2-web/site /tmp/out

It takes the repository image as the base, lays the upstream-owned files of the live site over it
(`gamedata`, `maps`, `icon`, atlas, `skilldesc`, the version marker, stock-script fixes), keeps the
repository's own `introLogin.py`, `uiChat.py` and `serverInfo.py`, reports every other difference instead
of taking it, rebuilds the table in `client.js` (offsets, size, `FS_createPath` of new folders), writes
the `.gz` files and refuses to write an image that contains the production address.

### Three-way merge of the files an update changed

Give the tool a copy of the live site from BEFORE its last update (the updater leaves
`client.data.bak_pre_<version>` and `client.js.bak_pre_<version>`) as a fourth argument,
`<dir>:<suffix>`:

    python3 updater/merge_release.py <repo>/site /opt/metin2-web/site /tmp/out /opt/metin2-web/site:.bak_pre_2.0.132

Every other file the update changed is then merged with `git merge-file` (base = live before, ours =
repository, theirs = live now). A clean merge is taken; a conflict is reported and the repository's file
is kept. Example (2.0.132): five data files taken from live, `offlineShopSearch.py` and
`playerSettingModule.py` merged cleanly, no conflicts.
