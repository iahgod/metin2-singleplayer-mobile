#!/usr/bin/env python3
import glob
import gzip
import hashlib
import http.server
import json
import math
import os
import random
import re
import socketserver
import threading
import time
import urllib.parse
import urllib.request
from markupsafe import escape
import pymysql

WEBHOOK_FILE = '/opt/metin2-web/reg/discord_webhook.json'
REPLAY_DIR = '/opt/metin2-web/reg/replays'
GUILD_TSV_GLOB = '/var/lib/docker/volumes/metin2_game-var/_data/channel*/game*/playerbot_guild_status.tsv'
STATUS_TSV_GLOB = '/var/lib/docker/volumes/metin2_game-var/_data/channel*/game*/playerbot_status.tsv'
REPLAY_FORMAT_VERSION = 3

os.makedirs(REPLAY_DIR, exist_ok=True)

PLAYERBOT_MAP_BOUNDS = {
    1: (409600, 896000, 102400, 128000),
    3: (307200, 819200, 102400, 102400),
    4: (128000, 0, 51200, 51200),       # Shinsoo guild map (Jungrang)
    21: (0, 102400, 102400, 128000),
    23: (102400, 204800, 102400, 102400),
    24: (179200, 0, 51200, 51200),      # Chunjo guild map (Waryong)
    41: (921600, 204800, 102400, 128000),
    43: (819200, 204800, 102400, 102400),
    44: (230400, 0, 51200, 51200),      # Jinno guild map (Imha)
}

EMPIRE_GUILD_MAP = {1: 4, 2: 24, 3: 44}

# Flat, obstacle-free plaza coordinates (in % of 51200x51200 map) verified against attr.atr & height.raw
GUILD_MAP_ARENA_CENTER = {
    4: (57.0, 41.4),   # metin2_map_guild_01 (Jungrang): local (29184, 21197)
    24: (24.2, 57.0),  # metin2_map_guild_02 (Waryong): local (12390, 29184)
    44: (24.2, 25.8),  # metin2_map_guild_03 (Imha): local (12390, 13210)
}

def default_armor_for(job, level):
    cls = int(job) % 4
    base = {0: 11200, 1: 11400, 2: 11600, 3: 11800}.get(cls, 11200)
    if level >= 54:
        return base + 76
    elif level >= 48:
        return base + 66
    elif level >= 42:
        return base + 56
    elif level >= 34:
        return base + 46
    elif level >= 26:
        return base + 36
    return base + 26

def default_weapon_for(job, level):
    cls = int(job) % 4
    if cls == 0:  # Wojownik (Sword / Two-handed)
        return 3067 if (int(job) == 0 and level >= 45) else (106 if level >= 45 else 66)
    elif cls == 1:  # Ninja (Daggers / Bow)
        return 1066 if level >= 45 else 1036
    elif cls == 2:  # Sura (Sword)
        return 106 if level >= 45 else 76
    else:  # Szaman (Bell / Fan)
        return 7166 if level >= 38 else 5036

def load_env_config():
    cfg = {}
    env_paths = [
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'),
        '/opt/metin2-web/.env',
        '/opt/metin2/.env',
        '/opt/metin2/linux-port/docker/.env',
    ]
    for p in env_paths:
        if os.path.isfile(p):
            try:
                with open(p, encoding='utf-8', errors='replace') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            k, v = line.split('=', 1)
                            cfg.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            except Exception:
                pass
    return cfg

_ENV_CFG = load_env_config()
DB_HOST = os.environ.get('DB_HOST') or _ENV_CFG.get('DB_HOST') or '127.0.0.1'
DB_PORT = int(os.environ.get('DB_PORT') or _ENV_CFG.get('DB_PORT') or 3306)
DB_USER = os.environ.get('DB_USER') or _ENV_CFG.get('DB_USER') or 'root'
DB_PASS = (
    os.environ.get('DB_PASSWORD')
    or os.environ.get('M2_DB_ROOT_PASSWORD')
    or _ENV_CFG.get('DB_PASSWORD')
    or _ENV_CFG.get('M2_DB_ROOT_PASSWORD')
    or 'YOUR_DB_PASSWORD'
)

def m2_hash(pw):
    return '*' + hashlib.sha1(hashlib.sha1(pw.encode('ascii')).digest()).hexdigest().upper()

def load_webhook_cfg():
    try:
        with open(WEBHOOK_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {'url': '', 'notified_wars': [], 'notified_live': [], 'notified_soon': {}}

def save_webhook_cfg(cfg):
    tmp = WEBHOOK_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2)
    os.replace(tmp, WEBHOOK_FILE)

def send_discord_webhook(url, title, description, color=0xd4ac54, fields=None):
    if not url or (not url.startswith('https://discord.com/api/webhooks/') and not url.startswith('https://discordapp.com/api/webhooks/')):
        return False, 'Nieprawidłowy adres Webhooka Discord.'
    embed = {
        'title': title,
        'description': description,
        'color': color,
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'footer': {'text': 'Metin2 — Kronika Wojen Gildii (https://127.0.0.1/wojny.html)'}
    }
    if fields:
        embed['fields'] = fields
    payload = json.dumps({'username': 'Kronikarz Wojen Metin2', 'embeds': [embed]}).encode('utf-8')
    req = urllib.request.Request(
        url, data=payload,
        headers={'Content-Type': 'application/json', 'User-Agent': 'Metin2WarChronicle/1.0'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return (200 <= resp.status < 300), f'HTTP {resp.status}'
    except Exception as e:
        return False, str(e)

def read_live_guild_tsv():
    out = {}
    for path in glob.glob(GUILD_TSV_GLOB):
        try:
            if time.time() - os.path.getmtime(path) > 300:
                continue
            with open(path, 'r', encoding='utf-8', errors='replace') as fh:
                lines = fh.read().splitlines()
            if not lines:
                continue
            head = lines[0].split('\t')
            for line in lines[1:]:
                cols = line.split('\t')
                if len(cols) < len(head):
                    continue
                row = dict(zip(head, cols))
                gid = int(row.get('guild_id', 0) or 0)
                if gid <= 0:
                    continue
                g = out.get(gid)
                if g is None:
                    g = {
                        'guild_id': gid,
                        'name': row.get('name', '').strip(),
                        'empire': int(row.get('empire', 1) or 1),
                        'online': 0,
                        'avg_strength': int(row.get('avg_strength', 0) or 0),
                        'war_with': row.get('war_with', '').strip(),
                        'war_score': int(row.get('war_score', 0) or 0),
                        'war_enemy_score': int(row.get('war_enemy_score', 0) or 0),
                        'next_war_in_s': -1,
                        'tower_raid': int(row.get('tower_raid', 0) or 0),
                    }
                    out[gid] = g
                g['online'] += int(row.get('online', 0) or 0)
                nw = int(row.get('next_war_in_s', -1) or -1)
                if nw >= 0 and (g['next_war_in_s'] < 0 or nw < g['next_war_in_s']):
                    g['next_war_in_s'] = nw
                if not g['war_with'] and row.get('war_with', '').strip():
                    g['war_with'] = row.get('war_with', '').strip()
                    g['war_score'] = int(row.get('war_score', 0) or 0)
                    g['war_enemy_score'] = int(row.get('war_enemy_score', 0) or 0)
        except Exception:
            continue
    return out

def read_all_bot_positions():
    """Read live (pid -> {map, x, y, hp, max_hp, action, status}) from playerbot_status.tsv."""
    bots = {}
    now = time.time()
    for path in glob.glob(STATUS_TSV_GLOB):
        try:
            if now - os.path.getmtime(path) > 30:
                continue
            with open(path, 'r', encoding='cp1250', errors='replace') as fh:
                header = None
                for line in fh:
                    if line.startswith('pid\t'):
                        header = line.rstrip('\r\n').split('\t')
                        continue
                    if not header:
                        continue
                    parts = line.rstrip('\r\n').split('\t', len(header) - 1)
                    if len(parts) != len(header):
                        continue
                    try:
                        pid = int(parts[0])
                        idx_map = header.index('map')
                        idx_x = header.index('x')
                        idx_y = header.index('y')
                        idx_hp = header.index('hp')
                        idx_mhp = header.index('max_hp')
                        idx_act = header.index('action')
                        bots[pid] = {
                            'map': int(parts[idx_map]),
                            'x': int(parts[idx_x]),
                            'y': int(parts[idx_y]),
                            'hp': int(parts[idx_hp]),
                            'max_hp': max(1, int(parts[idx_mhp])),
                            'action': int(parts[idx_act]),
                            'status': parts[-1]
                        }
                    except Exception:
                        continue
        except Exception:
            continue
    return bots

def world_to_pct_and_local(map_idx, wx, wy):
    bounds = PLAYERBOT_MAP_BOUNDS.get(map_idx)
    if not bounds:
        return 50.0, 50.0, 25600, 25600
    bx, by, bw, bh = bounds
    if wx < bx and wx <= bw and wy <= bh:
        lx, ly = int(wx), int(wy)
    else:
        lx, ly = int(wx - bx), int(wy - by)
    px = round(max(2.0, min(98.0, (lx / float(bw)) * 100.0)), 2)
    py = round(max(2.0, min(98.0, (ly / float(bh)) * 100.0)), 2)
    return px, py, max(1000, min(bw - 1000, lx)), max(1000, min(bh - 1000, ly))

# =============================================================================
#  LIVE RECORDER & HISTORICAL RECONSTRUCTION (V2 WITH 3D MODELS & SYNCED KILLS)
# =============================================================================
import gc
_ACTIVE_RECORDINGS = {}  # key: "g1_id:g2_id" -> dict
_REC_LOCK = threading.Lock()
_VERIFIED_REPLAYS = set()  # (war_id, target_s1, target_s2, REPLAY_FORMAT_VERSION)

def generate_reconstructed_replay(war_row, g1_info, g2_info, m1_list, m2_list):
    """Generate a deterministic, choreographed 2D/3D replay with 125cm melee range, face-to-face rotation, and synced kills."""
    war_id = int(war_row['id'])
    target_s1 = int(war_row['result1'])
    target_s2 = int(war_row['result2'])
    if target_s1 <= 0 and target_s2 <= 0:
        return

    vkey = (war_id, target_s1, target_s2, REPLAY_FORMAT_VERSION)
    out_path = os.path.join(REPLAY_DIR, f'war_{war_id}.json.gz')
    if vkey in _VERIFIED_REPLAYS and os.path.exists(out_path):
        return

    if os.path.exists(out_path):
        try:
            with gzip.open(out_path, 'rt', encoding='utf-8') as gz:
                old_rep = json.load(gz)
            if (old_rep.get('version') == REPLAY_FORMAT_VERSION
                    and old_rep.get('result1') == target_s1
                    and old_rep.get('result2') == target_s2):
                _VERIFIED_REPLAYS.add(vkey)
                del old_rep
                return
        except Exception:
            pass

    rng = random.Random(war_id * 1337 + target_s1 * 7 + target_s2)
    emp = int(g1_info.get('empire', 1) or 1)
    map_idx = EMPIRE_GUILD_MAP.get(emp, 4)
    cx, cy = GUILD_MAP_ARENA_CENTER.get(map_idx, (57.0, 41.4))
    cx_cm = cx * 512.0
    cy_cm = cy * 512.0

    f1 = m1_list[:18]
    f2 = m2_list[:22]

    roster = {}
    sim_units = []
    unit_by_pid = {}

    def add_fighter(m, side, idx, count):
        pid = int(m['pid'])
        lvl = int(m['level'])
        job = int(m.get('job', 0) or 0)
        cls = job % 4
        armor = int(m.get('armor') or 0) or default_armor_for(job, lvl)
        weapon = int(m.get('weapon') or 0) or default_weapon_for(job, lvl)
        hair = int(m.get('hair') or 0)
        max_hp = max(1500, int(m.get('max_hp') or (1200 + lvl * 85)))
        is_leader = (pid == (g1_info.get('leader_pid') if side == 1 else g2_info.get('leader_pid')))
        is_ranged = (cls == 3) or (cls == 1 and 2000 <= weapon < 3000)

        # Spawn in clean opposing guild battle lines in cm (~1150-1450 cm from center)
        rank_offset = 1380.0 if is_ranged else 1080.0
        spawn_wx = (cx_cm - rank_offset) if side == 1 else (cx_cm + rank_offset)
        lane_wy = cy_cm + (idx - (count - 1) / 2.0) * 145.0
        init_rot = 90.0 if side == 1 else 270.0  # Metin2 SetRotation: 90 = East (+X), 270 = West (-X)

        roster[str(pid)] = {
            'name': m['name'],
            'level': lvl,
            'side': side,
            'leader': is_leader,
            'job': job,
            'cls': cls,
            'armor': armor,
            'weapon': weapon,
            'hair': hair,
            'max_hp': max_hp,
            'kills': 0,
            'deaths': 0,
            'dmg': 0
        }
        u_obj = {
            'pid': pid, 'side': side, 'level': lvl, 'name': m['name'],
            'job': job, 'cls': cls, 'leader': is_leader, 'max_hp': max_hp,
            'is_ranged': is_ranged, 'slot_idx': idx,
            'wx': spawn_wx + rng.uniform(-70.0, 70.0),
            'wy': lane_wy + rng.uniform(-35.0, 35.0),
            'home_wy': lane_wy,
            'rot': init_rot,
            'hp': 100.0, 'dead_until': -1,
            'target_pid': 0,
            'last_skill_step': -10
        }
        sim_units.append(u_obj)
        unit_by_pid[pid] = u_obj

    for idx, m in enumerate(f1):
        add_fighter(m, 1, idx, len(f1))
    for idx, m in enumerate(f2):
        add_fighter(m, 2, idx, len(f2))

    n_frames = 240  # 8 minutes (240 * 2s = 480s)
    raw_frames = []
    raw_events = []

    bias1 = 1.0 + max(0.0, min(0.55, (target_s1 - target_s2) / float(max(1000, target_s1 + target_s2))))
    bias2 = 1.0 + max(0.0, min(0.55, (target_s2 - target_s1) / float(max(1000, target_s1 + target_s2))))

    def m2_rot(dx, dy):
        # Exact Metin2 CInstanceBase rotation: 0=South(+Y), 90=East(+X), 180=North(-Y), 270=West(-X)
        return math.degrees(math.atan2(dx, dy)) % 360.0

    for step in range(n_frames):
        t = step * 2

        # 1. Handle respawns and keep dead corpses 100% motionless on the ground
        for u in sim_units:
            if u['dead_until'] > step:
                u['hp'] = 0.0
                u['act'] = 4
                u['dmg_taken'] = 0
                u['target_pid'] = 0
            elif u['dead_until'] == step:
                # Respawn at guild edge formation and charge back into battle
                u['dead_until'] = -1
                u['hp'] = 100.0
                u['wx'] = (cx_cm - 1420.0) if u['side'] == 1 else (cx_cm + 1420.0)
                u['wy'] = u['home_wy'] + rng.uniform(-90.0, 90.0)
                u['rot'] = 90.0 if u['side'] == 1 else 270.0
                u['act'] = 1
                u['dmg_taken'] = 0
                u['target_pid'] = 0
            else:
                u['dmg_taken'] = 0
                u['act'] = 0

        alive_1 = [u for u in sim_units if u['side'] == 1 and u['dead_until'] < step and u['hp'] > 0]
        alive_2 = [u for u in sim_units if u['side'] == 2 and u['dead_until'] < step and u['hp'] > 0]

        # 2. Target assignment: maintain locked duels or pick closest lightly-engaged enemy
        engaged_count = {}
        for u in alive_1 + alive_2:
            t_u = unit_by_pid.get(u['target_pid'])
            if not t_u or t_u['dead_until'] >= step or t_u['hp'] <= 0:
                u['target_pid'] = 0
            else:
                engaged_count[t_u['pid']] = engaged_count.get(t_u['pid'], 0) + 1

        for u in alive_1 + alive_2:
            if u['target_pid'] == 0:
                enemies = alive_2 if u['side'] == 1 else alive_1
                if enemies:
                    # Prefer unengaged or 1-attacker enemies nearby so we get 15+ distinct 1v1 / 2v1 melee duels
                    best = min(
                        enemies,
                        key=lambda e: math.hypot(e['wx'] - u['wx'], e['wy'] - u['wy']) + engaged_count.get(e['pid'], 0) * 260.0
                    )
                    u['target_pid'] = best['pid']
                    engaged_count[best['pid']] = engaged_count.get(best['pid'], 0) + 1
                    if best['target_pid'] == 0 or (not best['is_ranged'] and rng.random() < 0.45):
                        best['target_pid'] = u['pid']

        # 3. Movement & Melee Positioning (125 cm sword range for melee, 375 cm for Shaman/Bow)
        handled_mutual = set()
        for u in alive_1 + alive_2:
            if u['pid'] in handled_mutual:
                continue
            t_u = unit_by_pid.get(u['target_pid'])
            if not t_u or t_u['hp'] <= 0 or t_u['dead_until'] >= step:
                continue

            dx = t_u['wx'] - u['wx']
            dy = t_u['wy'] - u['wy']
            dist = math.hypot(dx, dy)

            # Mutual melee duel: both fighters target each other -> close in to exact 125 cm face-to-face!
            if (t_u['target_pid'] == u['pid'] and not u['is_ranged'] and not t_u['is_ranged']):
                handled_mutual.add(u['pid'])
                handled_mutual.add(t_u['pid'])
                desired_sep = 125.0
                mx = 0.5 * (u['wx'] + t_u['wx'])
                my = 0.5 * (u['wy'] + t_u['wy'])
                if dist < 1.0:
                    ux, uy = (-1.0 if u['side'] == 1 else 1.0), 0.0
                else:
                    ux, uy = (u['wx'] - t_u['wx']) / dist, (u['wy'] - t_u['wy']) / dist

                if dist > desired_sep + 35.0:
                    # Both charge toward the midpoint up to 310 cm per 2s tick
                    new_sep = max(desired_sep, dist - 600.0)
                    u['wx'] = mx + ux * (new_sep * 0.5)
                    u['wy'] = my + uy * (new_sep * 0.5)
                    t_u['wx'] = mx - ux * (new_sep * 0.5)
                    t_u['wy'] = my - uy * (new_sep * 0.5)
                    u['act'] = 1 if new_sep > desired_sep + 25.0 else 2
                    t_u['act'] = 1 if new_sep > desired_sep + 25.0 else 2
                else:
                    # Locked in 125 cm sword-to-sword melee!
                    u['wx'] = mx + ux * (desired_sep * 0.5)
                    u['wy'] = my + uy * (desired_sep * 0.5)
                    t_u['wx'] = mx - ux * (desired_sep * 0.5)
                    t_u['wy'] = my - uy * (desired_sep * 0.5)
                    u['act'] = 3 if (step - u['last_skill_step'] >= rng.randint(4, 7)) else 2
                    if u['act'] == 3:
                        u['last_skill_step'] = step
                    t_u['act'] = 3 if (step - t_u['last_skill_step'] >= rng.randint(4, 7)) else 2
                    if t_u['act'] == 3:
                        t_u['last_skill_step'] = step

                u['rot'] = m2_rot(t_u['wx'] - u['wx'], t_u['wy'] - u['wy'])
                t_u['rot'] = m2_rot(u['wx'] - t_u['wx'], u['wy'] - t_u['wy'])
            else:
                # Non-mutual or ranged attacker: move to combat slot around t_u
                engage_dist = 375.0 if u['is_ranged'] else 130.0
                slot_rad = ((u['slot_idx'] % 5) - 2) * 0.52 + (math.pi if u['side'] == 1 else 0.0)
                goal_wx = t_u['wx'] + math.cos(slot_rad) * engage_dist
                goal_wy = t_u['wy'] + math.sin(slot_rad) * engage_dist
                gdx = goal_wx - u['wx']
                gdy = goal_wy - u['wy']
                gdist = math.hypot(gdx, gdy)
                if gdist > 45.0:
                    move_step = min(gdist, 310.0)
                    u['wx'] += (gdx / gdist) * move_step
                    u['wy'] += (gdy / gdist) * move_step
                    u['act'] = 1 if gdist > 110.0 else 2
                else:
                    u['wx'] = goal_wx
                    u['wy'] = goal_wy
                    u['act'] = 3 if (step - u['last_skill_step'] >= rng.randint(4, 7)) else 2
                    if u['act'] == 3:
                        u['last_skill_step'] = step
                # Always face directly toward the target enemy!
                u['rot'] = m2_rot(t_u['wx'] - u['wx'], t_u['wy'] - u['wy'])

        # 4. Combat Damage & Synchronized Melee Kills (killer MUST be in contact and facing victim)
        for u in list(alive_1 + alive_2):
            if u['hp'] <= 0 or u['dead_until'] >= step:
                continue
            enemies = alive_2 if u['side'] == 1 else alive_1
            attackers = [
                e for e in enemies
                if e['hp'] > 0 and e['dead_until'] < step
                and e['target_pid'] == u['pid']
                and math.hypot(e['wx'] - u['wx'], e['wy'] - u['wy']) <= (420.0 if e['is_ranged'] else 165.0)
            ]
            if not attackers:
                continue

            if rng.random() < 0.58:
                # Prefer melee attacker for dramatic close-quarters kills
                melee_atk = [e for e in attackers if not e['is_ranged']]
                attacker = rng.choice(melee_atk if melee_atk else attackers)
                side_mult = bias1 if attacker['side'] == 1 else bias2
                is_crit_skill = (attacker['act'] == 3) or (rng.random() < 0.24)
                hp_loss = (5.0 + (attacker['level'] ** 0.92) * rng.uniform(0.16, 0.34)) * side_mult
                if is_crit_skill:
                    hp_loss *= 1.4
                u['hp'] -= hp_loss
                real_dmg = max(120, int(round((hp_loss / 100.0) * u['max_hp'])))
                u['dmg_taken'] = real_dmg
                roster[str(attacker['pid'])]['dmg'] += real_dmg

                # Lock victim & killer face-to-face when HP gets low (< 45%)
                if u['hp'] < 45.0 and not attacker['is_ranged']:
                    u['target_pid'] = attacker['pid']
                    attacker['target_pid'] = u['pid']
                    u['rot'] = m2_rot(attacker['wx'] - u['wx'], attacker['wy'] - u['wy'])
                    attacker['rot'] = m2_rot(u['wx'] - attacker['wx'], u['wy'] - attacker['wy'])

                if u['hp'] <= 0.0:
                    u['hp'] = 0.0
                    u['dead_until'] = step + 5  # 5 steps (10s) motionless corpse, then respawn at camp
                    u['act'] = 4
                    attacker['act'] = 3 if is_crit_skill else 2
                    attacker['target_pid'] = u['pid']
                    # Snap killer to exact 120 cm strike distance facing victim if melee
                    if not attacker['is_ranged']:
                        kdx = u['wx'] - attacker['wx']
                        kdy = u['wy'] - attacker['wy']
                        kdist = math.hypot(kdx, kdy)
                        if kdist > 135.0 or kdist < 80.0:
                            ang_rad = math.atan2(kdy, kdx) if kdist > 1.0 else 0.0
                            attacker['wx'] = u['wx'] - math.cos(ang_rad) * 120.0
                            attacker['wy'] = u['wy'] - math.sin(ang_rad) * 120.0
                    attacker['rot'] = m2_rot(u['wx'] - attacker['wx'], u['wy'] - attacker['wy'])
                    u['rot'] = m2_rot(attacker['wx'] - u['wx'], attacker['wy'] - u['wy'])

                    roster[str(attacker['pid'])]['kills'] += 1
                    roster[str(u['pid'])]['deaths'] += 1
                    px = round(u['wx'] / 512.0, 2)
                    py = round(u['wy'] / 512.0, 2)
                    raw_events.append({
                        't': t,
                        'step': step,
                        'killer_pid': attacker['pid'],
                        'killer': attacker['name'],
                        'killer_lvl': attacker['level'],
                        'killer_job': attacker['job'],
                        'killer_side': attacker['side'],
                        'victim_pid': u['pid'],
                        'victim': u['name'],
                        'victim_lvl': u['level'],
                        'victim_job': u['job'],
                        'skill': is_crit_skill,
                        'x': px,
                        'y': py,
                        'wx': int(round(u['wx'])),
                        'wy': int(round(u['wy'])),
                        'weight': max(20, u['level'] * 2 + (15 if u['leader'] else 0))
                    })

        # 5. Serialize frame units
        frame_u = []
        for u in sim_units:
            u['wx'] = max(cx_cm - 3200.0, min(cx_cm + 3200.0, u['wx']))
            u['wy'] = max(cy_cm - 2600.0, min(cy_cm + 2600.0, u['wy']))
            wx = int(round(u['wx']))
            wy = int(round(u['wy']))
            px = round(wx / 512.0, 2)
            py = round(wy / 512.0, 2)
            frame_u.append([
                u['pid'], px, py,
                max(0, min(100, int(round(u['hp'])))), int(u['act']),
                int(round(u['rot'])) % 360, int(u['dmg_taken']), int(u['target_pid']), wx, wy
            ])

        raw_frames.append({'t': t, 'u': frame_u})

    # Distribute exact points across all kills of side 1 -> target_s1, and side 2 -> target_s2
    evs_side1 = [e for e in raw_events if e['killer_side'] == 1]
    evs_side2 = [e for e in raw_events if e['killer_side'] == 2]

    def assign_exact_points(ev_list, total_target):
        if not ev_list or total_target <= 0:
            for e in ev_list:
                e['pts'] = 0
            return
        w_sum = sum(e['weight'] for e in ev_list) or 1
        acc = 0
        for i, e in enumerate(ev_list):
            if i == len(ev_list) - 1:
                e['pts'] = max(1, total_target - acc)
            else:
                p = max(1, int(round(total_target * (e['weight'] / float(w_sum)))))
                if acc + p > total_target - (len(ev_list) - 1 - i):
                    p = max(1, total_target - (len(ev_list) - 1 - i) - acc)
                e['pts'] = p
                acc += p

    assign_exact_points(evs_side1, target_s1)
    assign_exact_points(evs_side2, target_s2)

    run_s1, run_s2 = 0, 0
    events = []
    ev_by_step = {}
    for e in raw_events:
        if e['killer_side'] == 1:
            run_s1 += e.get('pts', 0)
        else:
            run_s2 += e.get('pts', 0)
        ev_clean = {
            't': e['t'],
            'killer_pid': e['killer_pid'],
            'killer': e['killer'],
            'killer_lvl': e['killer_lvl'],
            'killer_job': e['killer_job'],
            'killer_side': e['killer_side'],
            'victim_pid': e['victim_pid'],
            'victim': e['victim'],
            'victim_lvl': e['victim_lvl'],
            'victim_job': e['victim_job'],
            'skill': e['skill'],
            'pts': e.get('pts', 0),
            'x': e['x'],
            'y': e['y'],
            'wx': e['wx'],
            'wy': e['wy'],
            's1': run_s1,
            's2': run_s2
        }
        events.append(ev_clean)
        ev_by_step[e['step']] = (run_s1, run_s2)

    frames = []
    cur_s1, cur_s2 = 0, 0
    for step, rf in enumerate(raw_frames):
        if step in ev_by_step:
            cur_s1, cur_s2 = ev_by_step[step]
        if step == len(raw_frames) - 1:
            cur_s1, cur_s2 = target_s1, target_s2
        frames.append({
            't': rf['t'],
            's1': cur_s1,
            's2': cur_s2,
            'u': rf['u']
        })

    replay_obj = {
        'ok': True,
        'version': REPLAY_FORMAT_VERSION,
        'war_id': war_id,
        'reconstructed': True,
        'empire': emp,
        'map_index': map_idx,
        'arena_center': [cx, cy],
        'guild1': {'id': g1_info['id'], 'name': g1_info['name']},
        'guild2': {'id': g2_info['id'], 'name': g2_info['name']},
        'result1': target_s1,
        'result2': target_s2,
        'roster': roster,
        'events': events,
        'frames': frames
    }
    tmp_path = out_path + '.tmp'
    with gzip.open(tmp_path, 'wt', encoding='utf-8') as gz:
        json.dump(replay_obj, gz, ensure_ascii=False)
    os.replace(tmp_path, out_path)
    _VERIFIED_REPLAYS.add(vkey)
    del replay_obj, frames, raw_frames
    gc.collect()

def battle_recorder_loop():
    """Polls playerbot_guild_status.tsv; sleeps 10s when idle (0% CPU), polls 2s only during active war."""
    while True:
        try:
            live_tsv = read_live_guild_tsv()
            active_pairs = {}
            by_name = {g['name']: g for g in live_tsv.values() if g.get('name')}
            for gid, g in live_tsv.items():
                ww = g.get('war_with', '')
                if ww and ww in by_name:
                    other = by_name[ww]
                    g1, g2 = (g, other) if g['guild_id'] < other['guild_id'] else (other, g)
                    key = f"{g1['guild_id']}:{g2['guild_id']}"
                    active_pairs[key] = (g1, g2)

            if not active_pairs and not _ACTIVE_RECORDINGS:
                time.sleep(10)
                continue

            time.sleep(2)

            if active_pairs:
                bot_pos = read_all_bot_positions()
                for key, (g1, g2) in active_pairs.items():
                    with _REC_LOCK:
                        rec = _ACTIVE_RECORDINGS.get(key)
                    if rec is None:
                        conn = pymysql.connect(
                            host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS,
                            database='player', charset='utf8mb4', autocommit=True,
                            cursorclass=pymysql.cursors.DictCursor
                        )
                        try:
                            with conn.cursor() as cur:
                                cur.execute("""
                                    SELECT m.guild_id, m.pid, p.name, p.level, p.job,
                                           p.part_main AS armor, p.part_hair AS hair, p.hp AS max_hp,
                                           i.vnum AS weapon, g.master AS leader_pid
                                    FROM player.guild_member m
                                    JOIN player.player p ON p.id = m.pid
                                    JOIN player.guild g ON g.id = m.guild_id
                                    LEFT JOIN player.item i ON i.owner_id = p.id AND i.window = 2 AND i.pos = 4
                                    WHERE m.guild_id IN (%s, %s)
                                """, (g1['guild_id'], g2['guild_id']))
                                mrows = cur.fetchall()
                        finally:
                            conn.close()

                        roster = {}
                        for r in mrows:
                            lvl = int(r['level'])
                            job = int(r['job'] or 0)
                            roster[str(r['pid'])] = {
                                'name': r['name'],
                                'level': lvl,
                                'side': 1 if r['guild_id'] == g1['guild_id'] else 2,
                                'leader': (r['pid'] == r['leader_pid']),
                                'job': job,
                                'cls': job % 4,
                                'armor': int(r['armor'] or 0) or default_armor_for(job, lvl),
                                'weapon': int(r['weapon'] or 0) or default_weapon_for(job, lvl),
                                'hair': int(r['hair'] or 0),
                                'max_hp': max(1500, int(r['max_hp'] or (1200 + lvl * 85))),
                                'kills': 0,
                                'deaths': 0,
                                'dmg': 0
                            }
                        emp = int(g1.get('empire', 1) or 1)
                        m_idx = EMPIRE_GUILD_MAP.get(emp, 4)
                        rec = {
                            'key': key,
                            'started_at': time.time(),
                            'last_seen': time.time(),
                            'empire': emp,
                            'map_index': m_idx,
                            'arena_center': list(GUILD_MAP_ARENA_CENTER.get(m_idx, (57.0, 41.4))),
                            'guild1': {'id': g1['guild_id'], 'name': g1['name']},
                            'guild2': {'id': g2['guild_id'], 'name': g2['name']},
                            'roster': roster,
                            'prev_hp': {},
                            'prev_pos': {},
                            'events': [],
                            'frames': []
                        }
                        with _REC_LOCK:
                            _ACTIVE_RECORDINGS[key] = rec

                    with _REC_LOCK:
                        rec['last_seen'] = time.time()
                        t_sec = int(rec['last_seen'] - rec['started_at'])
                        s1 = int(g1.get('war_score', 0))
                        s2 = int(g1.get('war_enemy_score', 0))
                        frame_u = []
                        active_fighters = []

                        for pid_str, info in rec['roster'].items():
                            pid = int(pid_str)
                            b = bot_pos.get(pid)
                            if not b:
                                continue
                            if b['map'] in (4, 24, 44) or 'Wojna' in b.get('status', '') or 'wojna' in b.get('status', ''):
                                if b['map'] in (4, 24, 44):
                                    rec['map_index'] = b['map']
                                px, py, lx, ly = world_to_pct_and_local(rec['map_index'], b['x'], b['y'])
                                hp_pct = max(0, min(100, round(b['hp'] * 100 / max(1, b['max_hp']))))
                                active_fighters.append([pid, info, px, py, hp_pct, lx, ly, b['action']])

                        for af in active_fighters:
                            pid, info, px, py, hp_pct, lx, ly, raw_act = af
                            ppos = rec['prev_pos'].get(pid, (lx, ly, 90.0 if info['side'] == 1 else 270.0))
                            dx_cm, dy_cm = lx - ppos[0], ly - ppos[1]
                            enemies = [x for x in active_fighters if x[1]['side'] != info['side'] and x[4] > 0]
                            target_pid = 0
                            rot = ppos[2]
                            if enemies:
                                nearest = min(enemies, key=lambda e: (e[5] - lx) ** 2 + (e[6] - ly) ** 2)
                                target_pid = nearest[0]
                                edx, edy = nearest[5] - lx, nearest[6] - ly
                                edist = math.hypot(edx, edy)
                                if edist <= 360.0 or raw_act == 2:
                                    rot = math.degrees(math.atan2(edx, edy)) % 360.0
                                elif math.hypot(dx_cm, dy_cm) > 25.0:
                                    rot = math.degrees(math.atan2(dx_cm, dy_cm)) % 360.0
                            elif math.hypot(dx_cm, dy_cm) > 25.0:
                                rot = math.degrees(math.atan2(dx_cm, dy_cm)) % 360.0
                            rec['prev_pos'][pid] = (lx, ly, rot)
                            prev_hp = rec['prev_hp'].get(pid, hp_pct)
                            dmg_taken = max(0, int(round(((prev_hp - hp_pct) / 100.0) * info['max_hp']))) if hp_pct < prev_hp else 0
                            act = 4 if hp_pct <= 0 else (2 if raw_act == 2 else (1 if math.hypot(dx_cm, dy_cm) > 35.0 else 0))
                            frame_u.append([pid, px, py, hp_pct, act, int(round(rot)) % 360, dmg_taken, target_pid, lx, ly])

                        for pid, info, px, py, hp_pct, lx, ly, raw_act in active_fighters:
                            prev = rec['prev_hp'].get(pid, 100)
                            if prev > 15 and hp_pct <= 5:
                                enemies = [x for x in active_fighters if x[1]['side'] != info['side'] and x[4] > 0]
                                if enemies:
                                    nearest = min(enemies, key=lambda e: (e[5] - lx) ** 2 + (e[6] - ly) ** 2)
                                    nearest[1]['kills'] = nearest[1].get('kills', 0) + 1
                                    info['deaths'] = info.get('deaths', 0) + 1
                                    rec['events'].append({
                                        't': t_sec,
                                        'killer_pid': nearest[0],
                                        'killer': nearest[1]['name'],
                                        'killer_lvl': nearest[1]['level'],
                                        'killer_job': nearest[1]['job'],
                                        'killer_side': nearest[1]['side'],
                                        'victim_pid': pid,
                                        'victim': info['name'],
                                        'victim_lvl': info['level'],
                                        'victim_job': info['job'],
                                        'skill': False,
                                        'pts': max(20, info['level'] * 2),
                                        'x': px,
                                        'y': py,
                                        'wx': lx,
                                        'wy': ly,
                                        's1': s1,
                                        's2': s2
                                    })
                            rec['prev_hp'][pid] = hp_pct

                        if frame_u and len(rec['frames']) < 900:
                            rec['frames'].append({'t': t_sec, 's1': s1, 's2': s2, 'u': frame_u})

            finished_keys = []
            with _REC_LOCK:
                for key, rec in list(_ACTIVE_RECORDINGS.items()):
                    if key not in active_pairs and (time.time() - rec['last_seen'] > 15):
                        finished_keys.append((key, rec))
                        del _ACTIVE_RECORDINGS[key]

            if finished_keys:
                conn = pymysql.connect(
                    host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS,
                    database='player', charset='utf8mb4', autocommit=True,
                    cursorclass=pymysql.cursors.DictCursor
                )
                try:
                    with conn.cursor() as cur:
                        for key, rec in finished_keys:
                            if len(rec['frames']) < 10:
                                continue
                            cur.execute("""
                                SELECT id, result1, result2, winner
                                FROM player.guild_war_reservation
                                WHERE ((guild1=%s AND guild2=%s) OR (guild1=%s AND guild2=%s))
                                  AND started=1 AND (result1 > 0 OR result2 > 0)
                                ORDER BY id DESC LIMIT 1
                            """, (rec['guild1']['id'], rec['guild2']['id'], rec['guild2']['id'], rec['guild1']['id']))
                            wrow = cur.fetchone()
                            if wrow:
                                war_id = int(wrow['id'])
                                out_path = os.path.join(REPLAY_DIR, f'war_{war_id}.json.gz')
                                replay_obj = {
                                    'ok': True,
                                    'version': REPLAY_FORMAT_VERSION,
                                    'war_id': war_id,
                                    'reconstructed': False,
                                    'empire': rec['empire'],
                                    'map_index': rec['map_index'],
                                    'arena_center': rec['arena_center'],
                                    'guild1': rec['guild1'],
                                    'guild2': rec['guild2'],
                                    'result1': int(wrow['result1']),
                                    'result2': int(wrow['result2']),
                                    'roster': rec['roster'],
                                    'events': rec['events'],
                                    'frames': rec['frames']
                                }
                                tmp_path = out_path + '.tmp'
                                with gzip.open(tmp_path, 'wt', encoding='utf-8') as gz:
                                    json.dump(replay_obj, gz, ensure_ascii=False)
                                os.replace(tmp_path, out_path)
                                del replay_obj
                finally:
                    conn.close()
                del finished_keys
                gc.collect()
        except Exception:
            time.sleep(5)

def build_war_story(war_num, g1, g2, r1, r2, winner_id, time_str):
    emp_names = {1: 'Shinsoo (Czerwoni)', 2: 'Chunjo (Żółci)', 3: 'Jinno (Niebiescy)'}
    emp = emp_names.get(g1['empire'], 'Shinsoo')
    win_g = g1 if winner_id == g1['id'] else g2
    los_g = g2 if winner_id == g1['id'] else g1
    win_pts = r1 if winner_id == g1['id'] else r2
    los_pts = r2 if winner_id == g1['id'] else r1
    diff = abs(r1 - r2)

    top1 = g1['champions'][0] if g1['champions'] else {'name': g1['leader_name'], 'level': g1['leader_lvl']}
    top2 = g2['champions'][0] if g2['champions'] else {'name': g2['leader_name'], 'level': g2['leader_lvl']}

    p1 = (
        f"W królestwie <strong>{escape(emp)}</strong> doszło do starcia #{war_num} pomiędzy klanem "
        f"<strong>{escape(g1['name'])}</strong> (Poz. {g1['level']}, dowodzonym przez <strong>{escape(g1['leader_name'])} {g1['leader_lvl']} lvl</strong>) "
        f"a gildią <strong>{escape(g2['name'])}</strong> (Poz. {g2['level']}, na czele której stanął <strong>{escape(g2['leader_name'])} {g2['leader_lvl']} lvl</strong>)."
    )

    if abs(g1['level'] - g2['level']) >= 3 or abs(top1['level'] - top2['level']) >= 8:
        p2 = (
            f"Było to zderzenie dwóch różnych światów: po stronie <strong>{escape(g1['name'])}</strong> wyszła zaprawiona w bojach elita "
            f"z czempionem <strong>{escape(top1['name'])} ({top1['level']} lvl)</strong> na czele ({g1['members']} członków w szeregach), "
            f"natomiast <strong>{escape(g2['name'])}</strong> przeciwstawiło im armię {g2['members']} wojowników prowadzoną przez "
            f"<strong>{escape(top2['name'])} ({top2['level']} lvl)</strong>."
        )
    else:
        p2 = (
            f"Obie strony wystawiły niezwykle wyrównane szeregi: filarem <strong>{escape(g1['name'])}</strong> był "
            f"<strong>{escape(top1['name'])} ({top1['level']} lvl)</strong>, a odpowiedzią <strong>{escape(g2['name'])}</strong> "
            f"był <strong>{escape(top2['name'])} ({top2['level']} lvl)</strong>."
        )

    if diff <= 900 and los_pts >= 1500:
        p3 = (
            f"Bitwa okazała się zaskakująco zacięta! Mimo twardego oporu ze strony <strong>{escape(los_g['name'])}</strong>, "
            f"którzy zdołali wydrzeć aż <strong>{los_pts} punktów</strong>, w decydującej fazie pojedynków przeważyła siła ognia "
            f"<strong>{escape(win_g['name'])}</strong> — kończąc wojnę zwycięstwem <strong>{win_pts} : {los_pts}</strong>!"
        )
    else:
        p3 = (
            f"Na polu bitwy dominacja <strong>{escape(win_g['name'])}</strong> nie podlegała dyskusji — ich czołowi wojownicy "
            f"zbudowali bezpieczną przewagę i zamknęli starcie pewnym triumfem <strong>{win_pts} : {los_pts}</strong>."
        )

    return [p1, p2, p3]

_CACHE = {'ts': 0, 'data': None}
_ROSTER_DB_CACHE = {'ts': 0, 'members': []}
_CACHE_LOCK = threading.Lock()

def get_guild_wars_payload(force=False):
    now = time.time()
    with _CACHE_LOCK:
        if not force and _CACHE['data'] and (now - _CACHE['ts'] < 10):
            return _CACHE['data']

    live_tsv = read_live_guild_tsv()
    conn = pymysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS,
        database='player', charset='utf8mb4', autocommit=True,
        cursorclass=pymysql.cursors.DictCursor
    )
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT g.id, g.name, g.level, g.exp, g.win, g.draw, g.loss, g.ladder_point,
                       g.master AS leader_pid, COALESCE(p.name, 'Nieznany') AS leader_name,
                       COALESCE(p.level, 1) AS leader_lvl,
                       COALESCE(pg.empire, 1) AS empire, COALESCE(pg.tier, 3) AS tier,
                       pg.founded_at, COALESCE(pg.last_war_at, 0) AS last_war_at
                FROM player.guild g
                LEFT JOIN player.player p ON p.id = g.master
                LEFT JOIN player.playerbot_guild pg ON pg.guild_id = g.id
                ORDER BY g.ladder_point DESC, g.win DESC, g.level DESC, g.id ASC
            """)
            guild_rows = cur.fetchall()

            if force or not _ROSTER_DB_CACHE['members'] or (now - _ROSTER_DB_CACHE['ts'] > 60):
                cur.execute("""
                    SELECT m.guild_id, m.pid, p.name, p.level, p.job,
                           p.part_main AS armor, p.part_hair AS hair, p.hp AS max_hp,
                           MAX(i.vnum) AS weapon,
                           m.grade, COALESCE(r.online, 0) AS online
                    FROM player.guild_member m
                    JOIN player.player p ON p.id = m.pid
                    LEFT JOIN player.item i ON i.owner_id = p.id AND i.window = 2 AND i.pos = 4
                    LEFT JOIN common.playerbot_rotation r ON r.pid = m.pid
                    GROUP BY m.guild_id, m.pid
                    ORDER BY m.guild_id ASC, p.level DESC, r.online DESC
                """)
                _ROSTER_DB_CACHE['members'] = cur.fetchall()
                _ROSTER_DB_CACHE['ts'] = now
            member_rows = _ROSTER_DB_CACHE['members']

            cur.execute("""
                SELECT w.id, w.guild1, w.guild2, DATE_FORMAT(w.time, '%Y-%m-%d %H:%i:%s') AS time_str,
                       UNIX_TIMESTAMP(w.time) AS war_ts, w.type, w.winner, w.result1, w.result2
                FROM player.guild_war_reservation w
                JOIN player.guild g1 ON g1.id = w.guild1
                JOIN player.guild g2 ON g2.id = w.guild2
                WHERE w.started = 1 AND w.winner >= 0 AND (w.result1 > 0 OR w.result2 > 0)
                ORDER BY w.id ASC
            """)
            war_rows = cur.fetchall()
    finally:
        conn.close()

    members_by_guild = {}
    for m in member_rows:
        members_by_guild.setdefault(m['guild_id'], []).append(m)

    guilds_map = {}
    guilds_list = []
    empire_guilds = {1: [], 2: [], 3: []}
    empire_next_war = {1: -1, 2: -1, 3: -1}
    active_wars = []
    seen_pairs = set()

    for g in guild_rows:
        gid = g['id']
        m_list = members_by_guild.get(gid, [])
        tsv = live_tsv.get(gid, {})
        online_cnt = tsv.get('online', sum(1 for x in m_list if x['online']))
        emp = int(g['empire'] or 1)
        nw = tsv.get('next_war_in_s', -1)
        if nw >= 0 and (empire_next_war.get(emp, -1) < 0 or nw < empire_next_war[emp]):
            empire_next_war[emp] = nw

        war_with = tsv.get('war_with', '')
        if war_with:
            pair_key = tuple(sorted([g['name'], war_with]))
            if pair_key not in seen_pairs:
                seen_pairs.add(pair_key)
                active_wars.append({
                    'empire': emp,
                    'guild1': g['name'],
                    'guild2': war_with,
                    'score1': tsv.get('war_score', 0),
                    'score2': tsv.get('war_enemy_score', 0)
                })

        top_members = [{
            'name': x['name'],
            'level': int(x['level']),
            'job': int(x['job'] or 0),
            'online': int(x['online']),
            'is_leader': (x['pid'] == g['leader_pid'])
        } for x in m_list[:6]]

        champions = [{
            'name': x['name'],
            'level': int(x['level']),
            'job': int(x['job'] or 0)
        } for x in m_list[:8]]

        g_obj = {
            'id': gid,
            'name': g['name'],
            'level': int(g['level']),
            'win': int(g['win']),
            'draw': int(g['draw']),
            'loss': int(g['loss']),
            'ladder_point': int(g['ladder_point']),
            'leader_pid': int(g['leader_pid'] or 0),
            'leader_name': g['leader_name'],
            'leader_lvl': int(g['leader_lvl']),
            'empire': emp,
            'tier': int(g['tier']),
            'members': len(m_list),
            'online': int(online_cnt),
            'avg_strength': tsv.get('avg_strength', 0),
            'next_war_in_s': nw,
            'top_members': top_members,
            'champions': champions
        }
        guilds_map[gid] = g_obj
        guilds_list.append(g_obj)
        empire_guilds.setdefault(emp, []).append(g['name'])

    kingdom_radars = []
    for emp in (1, 2, 3):
        kingdom_radars.append({
            'empire': emp,
            'guilds': empire_guilds.get(emp, []),
            'next_war_in_s': empire_next_war.get(emp, -1)
        })

    war_types = {0: 'Bitwa Polowa', 1: 'Arena Wojenna', 2: 'Wojna o Flagi'}
    wars_formatted = []
    for idx, w in enumerate(war_rows, start=1):
        g1 = guilds_map.get(w['guild1'])
        g2 = guilds_map.get(w['guild2'])
        if not g1 or not g2:
            continue
        r1 = int(w['result1'])
        r2 = int(w['result2'])
        winner = int(w['winner']) if int(w['winner']) > 0 else (g1['id'] if r1 >= r2 else g2['id'])
        story = build_war_story(idx, g1, g2, r1, r2, winner, w['time_str'])

        replay_file = os.path.join(REPLAY_DIR, f"war_{int(w['id'])}.json.gz")
        try:
            generate_reconstructed_replay(
                w, g1, g2,
                members_by_guild.get(g1['id'], []),
                members_by_guild.get(g2['id'], [])
            )
        except Exception:
            pass

        wars_formatted.append({
            'id': int(w['id']),
            'war_number': idx,
            'time_str': w['time_str'],
            'war_ts': int(w['war_ts'] or 0),
            'war_type_label': war_types.get(int(w['type']), 'Arena Wojenna'),
            'empire': g1['empire'],
            'map_index': EMPIRE_GUILD_MAP.get(g1['empire'], 4),
            'guild1': g1,
            'guild2': g2,
            'result1': r1,
            'result2': r2,
            'winner': winner,
            'has_replay': os.path.exists(replay_file),
            'story': story
        })

    wars_formatted.reverse()

    cfg = load_webhook_cfg()
    wh_url = cfg.get('url', '')
    wh_masked = (wh_url[:38] + '...' + wh_url[-6:]) if len(wh_url) > 48 else ''

    res = {
        'ok': True,
        'server_time': int(now),
        'active_wars': active_wars,
        'kingdom_radars': kingdom_radars,
        'guilds': guilds_list,
        'wars': wars_formatted,
        'webhook_masked': wh_masked
    }
    with _CACHE_LOCK:
        _CACHE['ts'] = now
        _CACHE['data'] = res
    return res

def webhook_watcher_loop():
    while True:
        time.sleep(15)
        try:
            cfg = load_webhook_cfg()
            url = cfg.get('url', '').strip()
            if not url:
                continue
            payload = get_guild_wars_payload(force=False)
            changed = False

            soon_map = cfg.setdefault('notified_soon', {})
            for kr in payload.get('kingdom_radars', []):
                emp = str(kr['empire'])
                rem = kr.get('next_war_in_s', -1)
                if 0 < rem <= 300 and len(kr.get('guilds', [])) >= 2:
                    last_alert = soon_map.get(emp, 0)
                    if time.time() - last_alert > 1800:
                        soon_map[emp] = int(time.time())
                        changed = True
                        g_names = ' vs '.join(kr['guilds'][:2])
                        send_discord_webhook(
                            url,
                            f"🔔 Za {max(1, rem // 60)} min wybuchnie Wojna Gildii!",
                            f"W królestwie szykuje się starcie: **{g_names}**!\nWejdź do gry lub oglądaj na żywo w 2D/3D: https://127.0.0.1/wojny.html",
                            color=0xf59e0b
                        )

            live_list = cfg.setdefault('notified_live', [])
            for lw in payload.get('active_wars', []):
                lkey = f"{lw['guild1']}:{lw['guild2']}:{int(time.time() // 1800)}"
                if lkey not in live_list:
                    live_list.append(lkey)
                    changed = True
                    send_discord_webhook(
                        url,
                        f"🔥 TRWA WOJNA GILDII: {lw['guild1']} vs {lw['guild2']}!",
                        f"Bitwa właśnie się rozpoczęła! Aktualny wynik: **{lw['score1']} : {lw['score2']}**.\nOglądaj bitwę na żywo: https://127.0.0.1/wojny.html",
                        color=0xef4444
                    )

            notified_wars = cfg.setdefault('notified_wars', [])
            if not notified_wars and payload.get('wars'):
                for w in payload['wars']:
                    notified_wars.append(w['id'])
                changed = True
            else:
                for w in reversed(payload.get('wars', [])):
                    if w['id'] not in notified_wars:
                        notified_wars.append(w['id'])
                        changed = True
                        win_name = w['guild1']['name'] if w['winner'] == w['guild1']['id'] else w['guild2']['name']
                        send_discord_webhook(
                            url,
                            f"🏆 Wojna Gildii #{w['war_number']} zakończona! Triumf {win_name}!",
                            f"**{w['guild1']['name']}** `{w['result1']}` : `{w['result2']}` **{w['guild2']['name']}**\n\nObejrzyj powtórkę 3D / 2D bitwy: https://127.0.0.1/wojny.html",
                            color=0x22c55e
                        )

            if changed:
                save_webhook_cfg(cfg)
        except Exception:
            pass

class RegHandler(http.server.BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        if path == '/api/guild-wars':
            if 'replay' in qs:
                try:
                    war_id = int(qs['replay'][0])
                    rpath = os.path.join(REPLAY_DIR, f'war_{war_id}.json.gz')
                    get_guild_wars_payload(force=not os.path.exists(rpath))
                    if os.path.exists(rpath):
                        with gzip.open(rpath, 'rt', encoding='utf-8') as gz:
                            return self._send_json(200, json.load(gz))
                    return self._send_json(404, {'ok': False, 'error': 'Brak zapisu powtórki dla tej wojny.'})
                except Exception as e:
                    return self._send_json(500, {'ok': False, 'error': str(e)})

            if 'live' in qs:
                with _REC_LOCK:
                    if not _ACTIVE_RECORDINGS:
                        return self._send_json(200, {'ok': False, 'active': False})
                    rec = next(iter(_ACTIVE_RECORDINGS.values()))
                    return self._send_json(200, {
                        'ok': True,
                        'version': REPLAY_FORMAT_VERSION,
                        'active': True,
                        'reconstructed': False,
                        'empire': rec['empire'],
                        'map_index': rec['map_index'],
                        'arena_center': rec.get('arena_center', [57.0, 41.4]),
                        'guild1': rec['guild1'],
                        'guild2': rec['guild2'],
                        'roster': rec['roster'],
                        'events': rec['events'][-40:],
                        'frames': rec['frames'][-40:]
                    })

            try:
                return self._send_json(200, get_guild_wars_payload())
            except Exception as e:
                return self._send_json(500, {'ok': False, 'error': str(e)})
        return self._send_json(404, {'ok': False, 'error': 'Nieznany adres.'})

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 8192:
                return self._send_json(400, {'ok': False, 'error': 'Nieprawidłowe dane formularza.'})
            data = json.loads(self.rfile.read(length).decode('utf-8'))
        except Exception:
            return self._send_json(400, {'ok': False, 'error': 'Nieprawidłowy format JSON.'})

        if path == '/api/guild-wars':
            action = str(data.get('action', '')).strip()
            url = str(data.get('webhook_url', '')).strip()
            cfg = load_webhook_cfg()
            if action == 'save':
                if url and not (url.startswith('https://discord.com/api/webhooks/') or url.startswith('https://discordapp.com/api/webhooks/')):
                    return self._send_json(400, {'ok': False, 'error': 'Podaj prawidłowy link https://discord.com/api/webhooks/...'})
                cfg['url'] = url
                save_webhook_cfg(cfg)
                return self._send_json(200, {'ok': True, 'message': 'Webhook Discord został zapisany!' if url else 'Webhook został wyczyszczony.'})
            elif action == 'test':
                target_url = url or cfg.get('url', '')
                if not target_url:
                    return self._send_json(400, {'ok': False, 'error': 'Najpierw wklej i zapisz adres Webhooka Discord.'})
                ok, info = send_discord_webhook(
                    target_url,
                    '⚔️ Test Kronikarza Wojen Metin2!',
                    'Powiadomienia o wojnach gildii (5 minut przed startem, w trakcie wybuchu wojny oraz po jej zakończeniu) działają prawidłowo!',
                    color=0xd4ac54
                )
                if ok:
                    return self._send_json(200, {'ok': True, 'message': 'Wysłano testowe powiadomienie na Discorda!'})
                return self._send_json(400, {'ok': False, 'error': f'Nie udało się wysłać na Discorda: {info}'})
            return self._send_json(400, {'ok': False, 'error': 'Nieznana akcja.'})

        if path != '/api/register':
            return self._send_json(404, {'ok': False, 'error': 'Nieznany adres.'})

        login = str(data.get('login', '')).strip()
        pw = str(data.get('password', ''))
        pw2 = str(data.get('password2', pw))
        social = str(data.get('social_id', '')).strip()

        if not re.fullmatch(r'[A-Za-z0-9]{4,16}', login):
            return self._send_json(400, {'ok': False, 'error': 'Login musi mieć od 4 do 16 znaków (tylko litery A-Z i cyfry 0-9).'})
        if not re.fullmatch(r'[\x21-\x7e]{6,16}', pw):
            return self._send_json(400, {'ok': False, 'error': 'Hasło musi mieć od 6 do 16 znaków (bez spacji i polskich znaków).'})
        if pw != pw2:
            return self._send_json(400, {'ok': False, 'error': 'Podane hasła nie są identyczne.'})
        if not re.fullmatch(r'[0-9]{7}', social):
            return self._send_json(400, {'ok': False, 'error': 'Kod usunięcia postaci musi składać się dokładnie z 7 cyfr (np. 1234567).'})

        try:
            conn = pymysql.connect(
                host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS,
                database='account', charset='latin1', autocommit=True
            )
            try:
                with conn.cursor() as cur:
                    cur.execute('SELECT 1 FROM account WHERE login=%s', (login,))
                    if cur.fetchone():
                        return self._send_json(409, {'ok': False, 'error': f'Konto o loginie „{login}” już istnieje.'})
                    cur.execute(
                        "INSERT INTO account (login, password, social_id, status) VALUES (%s, %s, %s, 'OK')",
                        (login, m2_hash(pw), social)
                    )
            finally:
                conn.close()
            return self._send_json(200, {'ok': True, 'login': login, 'message': f'Konto „{login}” zostało utworzone! Możesz się teraz zalogować w grze.'})
        except Exception:
            return self._send_json(500, {'ok': False, 'error': 'Błąd bazy danych podczas tworzenia konta.'})

    def log_message(self, fmt, *args):
        pass

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

if __name__ == '__main__':
    t1 = threading.Thread(target=webhook_watcher_loop, daemon=True)
    t1.start()
    t2 = threading.Thread(target=battle_recorder_loop, daemon=True)
    t2.start()
    srv = ThreadingHTTPServer(('127.0.0.1', 11497), RegHandler)
    srv.serve_forever()
