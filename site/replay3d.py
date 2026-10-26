import io
import os
import json
import math
import time
import app
import chr
import chrmgr
import grp
import net
import player
import background
import wndMgr
import textTail
import effect
import systemSetting
import ui
import colorInfo
import localeInfo
import playerSettingModule
import clientloading

CAM_VID = 999999

MAP_BASE_COORDS = {
	4: (128000, 0, 29200, 21200),   # metin2_map_guild_01 (Shinsoo Jungrang)
	24: (179200, 0, 12400, 29200),  # metin2_map_guild_02 (Chunjo Waryong)
	44: (230400, 0, 12400, 13200),  # metin2_map_guild_03 (Jinno Imha)
}

MAP_NAMES = {
	4: "metin2_map_guild_01",
	24: "metin2_map_guild_02",
	44: "metin2_map_guild_03",
}

_ACTIVE_REPLAY_WIN = None


def _WriteStatus(step, error=""):
	try:
		f = io.open("/m2w_replay_status.json", "w", encoding="utf-8")
		f.write(json.dumps({
			"state": "error" if error else "ok",
			"step": str(step),
			"msg": str(error or step),
			"error": str(error or ""),
		}))
		f.close()
	except Exception:
		pass
	if error:
		try:
			ef = io.open("/syserr.txt", "a", encoding="utf-8")
			ef.write("\n[REPLAY3D_ERR] step=" + str(step) + " err=" + str(error) + "\n")
			ef.close()
		except Exception:
			pass


class Replay3DWindow(ui.Window):
	def __init__(self, stream=None):
		ui.Window.__init__(self, "UI")
		self.stream = stream
		self.SetWindowName("Replay3DWindow")
		self.SetSize(wndMgr.GetScreenWidth(), wndMgr.GetScreenHeight())
		self.SetPosition(0, 0)

		self.replay = None
		self.roster = {}
		self.frames = []
		self.events = []
		self.map_index = 4
		self.base_x = 128000
		self.base_y = 0
		self.center_x = 29200.0
		self.center_y = 21200.0

		self.load_step = 0
		self.ready = False
		self.playing = True
		self.speed = 1.0
		self.cursor = 0.0
		self.last_clock = time.perf_counter()
		self.frame_tick = 0

		self.cam_mode = "director"  # director | follow | free
		self.follow_pid = 0
		self.cam_x = 29200.0
		self.cam_y = 21200.0
		self.cam_dist = 2050.0
		self.cam_pitch = 26.0
		self.cam_rot = 25.0

		self.spawned_vids = []
		self.unit_motion = {}
		self.unit_dead = {}
		self.unit_last_atk = {}
		self.unit_pos = {}

	def ShowMapName(self, mapName, x, y):
		pass

	def RefreshStatus(self):
		pass

	def _GetWeaponMotionMode(self, weapon):
		weapon = int(weapon or 0)
		if weapon <= 0:
			return chr.MOTION_MODE_GENERAL
		if 3000 <= weapon < 4000:
			return chr.MOTION_MODE_TWOHAND_SWORD
		if 1000 <= weapon < 2000:
			return chr.MOTION_MODE_DUALHAND_SWORD
		if 2000 <= weapon < 3000:
			return chr.MOTION_MODE_BOW
		if 5000 <= weapon < 6000:
			return chr.MOTION_MODE_BELL
		if 7000 <= weapon < 8000:
			return chr.MOTION_MODE_FAN
		return chr.MOTION_MODE_ONEHAND_SWORD

	def LoadReplayData(self, path="/m2w_replay_init.json"):
		if not os.path.exists(path):
			if os.path.exists("/replay_data.json"):
				path = "/replay_data.json"
			else:
				return False
		try:
			f = io.open(path, "r", encoding="utf-8", errors="replace")
			data = json.loads(f.read())
			f.close()
		except Exception:
			__import__("traceback").print_exc()
			return False

		self.replay = data
		self.roster = data.get("roster", {})
		self.frames = data.get("frames", [])
		self.events = data.get("events", [])
		self.map_index = int(data.get("map_index", 4) or 4)
		bx, by, cx, cy = MAP_BASE_COORDS.get(self.map_index, MAP_BASE_COORDS[4])
		self.base_x = bx
		self.base_y = by
		ac = data.get("arena_center")
		if ac and len(ac) == 2:
			self.center_x = float(ac[0]) * 512.0
			self.center_y = float(ac[1]) * 512.0
		else:
			self.center_x = float(cx)
			self.center_y = float(cy)
		self.cam_x = self.center_x
		self.cam_y = self.center_y
		self.cursor = 0.0
		self.playing = True
		return True

	def Open(self):
		app.SetFrameSkip(1)
		self.SetSize(wndMgr.GetScreenWidth(), wndMgr.GetScreenHeight())
		self.Show()
		self.SetTop()
		app.ShowCursor()
		self.load_step = 0
		self.ready = False
		self.last_clock = time.perf_counter()
		self._WriteState("loading", 8, stage="Inicjalizacja silnika 3D Metin2...")

	def Close(self):
		self.Hide()
		for vid in list(self.spawned_vids):
			try:
				chr.DeleteInstance(vid)
			except Exception:
				pass
		self.spawned_vids = []
		try:
			chr.DeleteInstance(CAM_VID)
		except Exception:
			pass

	def _RegisterColors(self):
		try:
			NAME_COLOR_DICT = {
				chrmgr.NAMECOLOR_PC: colorInfo.CHR_NAME_RGB_PC,
				chrmgr.NAMECOLOR_NPC: colorInfo.CHR_NAME_RGB_NPC,
				chrmgr.NAMECOLOR_MOB: colorInfo.CHR_NAME_RGB_MOB,
				chrmgr.NAMECOLOR_PVP: colorInfo.CHR_NAME_RGB_PVP,
				chrmgr.NAMECOLOR_PK: colorInfo.CHR_NAME_RGB_PK,
				chrmgr.NAMECOLOR_PARTY: colorInfo.CHR_NAME_RGB_PARTY,
				chrmgr.NAMECOLOR_WARP: colorInfo.CHR_NAME_RGB_WARP,
				chrmgr.NAMECOLOR_WAYPOINT: colorInfo.CHR_NAME_RGB_WAYPOINT,
				chrmgr.NAMECOLOR_EMPIRE_MOB: colorInfo.CHR_NAME_RGB_EMPIRE_MOB,
				chrmgr.NAMECOLOR_EMPIRE_NPC: colorInfo.CHR_NAME_RGB_EMPIRE_NPC,
				chrmgr.NAMECOLOR_EMPIRE_PC + 1: colorInfo.CHR_NAME_RGB_EMPIRE_PC_A,
				chrmgr.NAMECOLOR_EMPIRE_PC + 2: colorInfo.CHR_NAME_RGB_EMPIRE_PC_B,
				chrmgr.NAMECOLOR_EMPIRE_PC + 3: colorInfo.CHR_NAME_RGB_EMPIRE_PC_C,
			}
			for k, rgb in list(NAME_COLOR_DICT.items()):
				chrmgr.RegisterNameColor(k, rgb[0], rgb[1], rgb[2])
		except Exception:
			pass

	def _StepLoading(self):
		try:
			if self.load_step == 0:
				_WriteStatus("step0_init")
				try:
					localeInfo.LoadLocaleData()
				except Exception:
					pass
				try:
					background.RegisterDungeonMapName("metin2_map_spiderdungeon")
					background.RegisterDungeonMapName("metin2_map_monkeydungeon")
					background.RegisterDungeonMapName("metin2_map_monkeydungeon_02")
					background.RegisterDungeonMapName("metin2_map_monkeydungeon_03")
					background.RegisterDungeonMapName("metin2_map_deviltower1")
				except Exception:
					pass
				try:
					playerSettingModule.RegisterSkill(0, 1, 1)
				except Exception:
					pass
				try:
					for i in range(len(localeInfo.TITLE_NAME_LIST)):
						chrmgr.RegisterTitleName(i, localeInfo.TITLE_NAME_LIST[i])
				except Exception:
					pass
				self._RegisterColors()
				try:
					import emotion
					emotion.RegisterEmotionIcons()
				except Exception:
					pass
				playerSettingModule.LoadGameData("INIT")
				self._WriteState("loading", 18, stage="Wczytywanie mapy 3D (Jungrang)...")
			elif self.load_step == 1:
				_WriteStatus("step1_load_map")
				gx = int(self.base_x + self.center_x)
				gy = int(self.base_y + self.center_y)
				# Exact sequence from introLoading.py (__LoadMap + __StartGame):
				# Never call background.Initialize() here (app.Create already created m_pkMap!).
				# net.Warp(gx, gy) calls CPythonBackground::Destroy() + Create() + Warp(gx, gy) offline.
				net.Warp(gx, gy)
				try:
					background.SetViewDistanceSet(background.DISTANCE0, 25600)
					background.SelectViewDistanceNum(background.DISTANCE0)
				except Exception:
					pass
				try:
					background.SetShadowLevel(background.SHADOW_NONE)
					systemSetting.SetShadowLevel(0)
				except Exception:
					pass
				app.SetGlobalCenterPosition(gx, gy)
				try:
					cz0 = background.GetHeight(float(self.center_x), float(self.center_y))
					background.Update(float(self.center_x), float(self.center_y), float(cz0))
				except Exception:
					pass
				try:
					app.SetCamera(float(self.cam_dist), float(self.cam_pitch), float(self.cam_rot), 110.0)
				except Exception:
					pass
				self._WriteState("loading", 36, stage="Wczytywanie efektow mieczy i aury...")
			elif self.load_step == 2:
				_WriteStatus("step2_effect")
				playerSettingModule.LoadGameData("EFFECT")
				self._WriteState("loading", 50, stage="Wczytywanie modeli 3D: Wojownik (.gr2)...")
			elif self.load_step == 3:
				_WriteStatus("step3_warrior")
				playerSettingModule.LoadGameData("WARRIOR")
				self._WriteState("loading", 64, stage="Wczytywanie modeli 3D: Ninja (.gr2)...")
			elif self.load_step == 4:
				_WriteStatus("step4_assassin")
				playerSettingModule.LoadGameData("ASSASSIN")
				self._WriteState("loading", 76, stage="Wczytywanie modeli 3D: Sura (.gr2)...")
			elif self.load_step == 5:
				_WriteStatus("step5_sura")
				playerSettingModule.LoadGameData("SURA")
				self._WriteState("loading", 86, stage="Wczytywanie modeli 3D: Szaman (.gr2)...")
			elif self.load_step == 6:
				_WriteStatus("step6_shaman")
				playerSettingModule.LoadGameData("SHAMAN")
				self._WriteState("loading", 94, stage="Rozmieszczanie 40 wojownikow na arenie...")
			elif self.load_step == 7:
				_WriteStatus("step7_spawn")
				playerSettingModule.LoadGameData("SKILL")
				try:
					playerSettingModule.LoadGuildBuildingList(localeInfo.GUILD_BUILDING_LIST_TXT)
				except Exception:
					pass
				self._SpawnActors()
				try:
					app.UpdateGame()
					app.SetCamera(float(self.cam_dist), float(self.cam_pitch), float(self.cam_rot), 110.0)
				except Exception:
					pass
				self.ready = True
				self.last_clock = time.perf_counter()
				_WriteStatus("ready")
				self._WriteState("playing", 100, stage="Gotowe")
			self.load_step += 1
		except Exception as e:
			__import__("traceback").print_exc()
			_WriteStatus("step_" + str(self.load_step), str(e))
			self.load_step += 1

	def _SpawnActors(self):
		for vid in list(self.spawned_vids):
			try:
				chr.DeleteInstance(vid)
			except Exception:
				pass
		self.spawned_vids = []
		self.unit_motion = {}
		self.unit_dead = {}
		self.unit_last_atk = {}
		self.unit_pos = {}

		# Ensure terrain heightmap is active at center before setting pixel positions
		try:
			cz0 = background.GetHeight(float(self.center_x), float(self.center_y))
			background.Update(float(self.center_x), float(self.center_y), float(cz0))
		except Exception:
			pass

		# Hidden observer anchor so CPythonApplication::UpdateGame centers terrain & camera on surface Z
		try:
			if chr.HasInstance(CAM_VID):
				chr.DeleteInstance(CAM_VID)
			chr.CreateInstance(CAM_VID)
			chr.SelectInstance(CAM_VID)
			chr.SetVirtualID(CAM_VID)
			chr.SetInstanceType(chr.INSTANCE_TYPE_PLAYER)
			chr.SetRace(0)
			chr.SetArmor(0)
			chr.Refresh()
			chr.SetMotionMode(chr.MOTION_MODE_GENERAL)
			chr.SetLoopMotion(chr.MOTION_WAIT)
			chr.SetPixelPosition(int(self.center_x), int(self.center_y))
			chr.Hide()
			player.SetMainCharacterIndex(CAM_VID)
		except Exception:
			__import__("traceback").print_exc()

		first_u = {}
		if self.frames:
			for u in self.frames[0].get("u", []):
				first_u[int(u[0])] = u

		for pid_str, info in list(self.roster.items()):
			try:
				vid = int(pid_str)
				u0 = first_u.get(vid)
				raw_wx = float(u0[8]) if (u0 and len(u0) > 8 and u0[8] > 1000) else (float(u0[1]) * 512.0 if u0 else self.center_x)
				raw_wy = float(u0[9]) if (u0 and len(u0) > 9 and u0[9] > 1000) else (float(u0[2]) * 512.0 if u0 else self.center_y)
				wx = int(max(2000.0, min(49200.0, raw_wx)))
				wy = int(max(2000.0, min(49200.0, raw_wy)))
				ang = float(u0[5]) if (u0 and len(u0) > 5) else (0.0 if info.get("side") == 1 else 180.0)

				if chr.HasInstance(vid):
					chr.DeleteInstance(vid)
				chr.CreateInstance(vid)
				chr.SelectInstance(vid)
				chr.SetVirtualID(vid)
				chr.SetInstanceType(chr.INSTANCE_TYPE_PLAYER)
				chr.SetNameString(str(info.get("name", "Wojownik")))
				race = int(info.get("job", 0) or 0)
				armor = int(info.get("armor", 11229) or 11229)
				weapon = int(info.get("weapon", 109) or 109)
				hair = int(info.get("hair", 0) or 0)
				chr.SetRace(race)
				chr.SetArmor(armor)
				if hair > 0:
					chr.SetHair(hair)
				if weapon > 0:
					chr.SetWeapon(weapon)
				chr.Refresh()
				chr.SetMotionMode(self._GetWeaponMotionMode(weapon))
				chr.SetLoopMotion(chr.MOTION_WAIT)
				chr.SetPixelPosition(wx, wy)
				m_rot = (90.0 - ang) % 360.0
				chr.SetRotation(m_rot)
				chr.Show()

				self.spawned_vids.append(vid)
				self.unit_motion[vid] = "wait"
				self.unit_dead[vid] = False
				self.unit_pos[vid] = (float(wx), float(wy), m_rot)
			except Exception:
				__import__("traceback").print_exc()

	def _PollControlFile(self):
		if os.path.exists("/m2w_cmd.py"):
			try:
				_jf = io.open("/m2w_cmd.py", "r", encoding="utf-8", errors="replace")
				_jsrc = _jf.read()
				_jf.close()
				os.remove("/m2w_cmd.py")
				exec(_jsrc, dict(globals(), self=self))
			except Exception:
				__import__("traceback").print_exc()

		if not os.path.exists("/m2w_replay_ctrl.json"):
			return
		try:
			f = io.open("/m2w_replay_ctrl.json", "r", encoding="utf-8", errors="replace")
			raw = f.read()
			f.close()
			os.remove("/m2w_replay_ctrl.json")
			ctrl = json.loads(raw)
		except Exception:
			return

		if "playing" in ctrl:
			self.playing = bool(ctrl["playing"])
		if "speed" in ctrl:
			self.speed = max(0.25, min(16.0, float(ctrl["speed"])))
		if "seek" in ctrl and ctrl["seek"] is not None and self.frames:
			self.cursor = max(0.0, min(float(len(self.frames) - 1), float(ctrl["seek"])))
		if "cam_mode" in ctrl and ctrl["cam_mode"]:
			self.cam_mode = str(ctrl["cam_mode"])
		if "follow_pid" in ctrl:
			self.follow_pid = int(ctrl["follow_pid"] or 0)
			if self.follow_pid > 0:
				self.cam_mode = "follow"
		if "cam_dist" in ctrl:
			self.cam_dist = max(600.0, min(5200.0, float(ctrl["cam_dist"])))
		if "cam_pitch" in ctrl:
			self.cam_pitch = max(8.0, min(78.0, float(ctrl["cam_pitch"])))
		if "cam_rot" in ctrl:
			self.cam_rot = float(ctrl["cam_rot"]) % 360.0
		if "cam_pan_x" in ctrl and "cam_pan_y" in ctrl:
			self.cam_mode = "free"
			self.cam_x = max(2000.0, min(49200.0, float(ctrl["cam_pan_x"])))
			self.cam_y = max(2000.0, min(49200.0, float(ctrl["cam_pan_y"])))
		if "cam_delta_x" in ctrl or "cam_delta_y" in ctrl:
			self.cam_mode = "free"
			dx = float(ctrl.get("cam_delta_x", 0.0))
			dy = float(ctrl.get("cam_delta_y", 0.0))
			rad = math.radians(self.cam_rot)
			rx = dx * math.cos(rad) - dy * math.sin(rad)
			ry = dx * math.sin(rad) + dy * math.cos(rad)
			self.cam_x = max(2000.0, min(49200.0, self.cam_x + rx))
			self.cam_y = max(2000.0, min(49200.0, self.cam_y + ry))
		if "reload_replay" in ctrl and ctrl["reload_replay"]:
			if self.LoadReplayData("/m2w_replay_init.json"):
				self.Open()

	def OnUpdate(self):
		self.frame_tick += 1
		if not self.ready:
			self._StepLoading()
			return

		self._PollControlFile()

		now = time.perf_counter()
		dt = min(0.1, max(0.001, now - self.last_clock))
		self.last_clock = now

		if not self.frames:
			return

		max_idx = len(self.frames) - 1
		if self.playing:
			self.cursor += (dt * self.speed) / 2.0
			if self.cursor >= max_idx:
				self.cursor = float(max_idx)
				self.playing = False

		idx0 = max(0, min(max_idx, int(self.cursor)))
		idx1 = min(max_idx, idx0 + 1)
		alpha = self.cursor - idx0

		f0 = self.frames[idx0]
		f1 = self.frames[idx1]
		u1_map = {}
		for u in f1.get("u", []):
			u1_map[int(u[0])] = u

		hot_sum_x = 0.0
		hot_sum_y = 0.0
		hot_weight = 0.0
		clash_intensity = 0
		follow_pos = None

		for u0 in f0.get("u", []):
			vid = int(u0[0])
			u1 = u1_map.get(vid, u0)

			wx0 = float(u0[8]) if (len(u0) > 8 and u0[8] > 1000) else float(u0[1]) * 512.0
			wy0 = float(u0[9]) if (len(u0) > 9 and u0[9] > 1000) else float(u0[2]) * 512.0
			wx1 = float(u1[8]) if (len(u1) > 8 and u1[8] > 1000) else float(u1[1]) * 512.0
			wy1 = float(u1[9]) if (len(u1) > 9 and u1[9] > 1000) else float(u1[2]) * 512.0

			wx = max(2000.0, min(49200.0, wx0 + (wx1 - wx0) * alpha))
			wy = max(2000.0, min(49200.0, wy0 + (wy1 - wy0) * alpha))
			hp = float(u0[3]) + (float(u1[3]) - float(u0[3])) * alpha
			act = int(u0[4]) if len(u0) > 4 else 0
			ang = float(u0[5]) if len(u0) > 5 else 0.0
			dmg = int(u0[6]) if len(u0) > 6 else 0

			mv_dx = wx1 - wx0
			mv_dy = wy1 - wy0
			mv_dist = math.hypot(mv_dx, mv_dy)
			if mv_dist > 15.0:
				ang = math.degrees(math.atan2(mv_dy, mv_dx)) % 360.0
			m_rot = (90.0 - ang) % 360.0

			if not chr.HasInstance(vid):
				continue

			chr.SelectInstance(vid)
			chr.SetPixelPosition(int(wx), int(wy))
			chr.SetRotation(m_rot)
			self.unit_pos[vid] = (wx, wy, m_rot)

			if vid == self.follow_pid:
				follow_pos = (wx, wy)

			if hp <= 0.5 or act == 4:
				if not self.unit_dead.get(vid, False):
					self.unit_dead[vid] = True
					self.unit_motion[vid] = "dead"
					try:
						chr.Die()
					except Exception:
						pass
			else:
				if self.unit_dead.get(vid, False):
					self.unit_dead[vid] = False
					try:
						chr.Revive()
						chr.SetLoopMotion(chr.MOTION_WAIT)
					except Exception:
						pass
					self.unit_motion[vid] = "wait"

				if act in (2, 3):
					clash_intensity += 1
					last_atk = self.unit_last_atk.get(vid, 0.0)
					if now - last_atk >= (0.68 / max(0.5, min(2.5, self.speed))):
						self.unit_last_atk[vid] = now
						try:
							if act == 3:
								chr.PushOnceMotion(chr.MOTION_COMBO_ATTACK_3)
							else:
								m_choice = (chr.MOTION_COMBO_ATTACK_1, chr.MOTION_COMBO_ATTACK_2, chr.MOTION_NORMAL_ATTACK)[(idx0 + vid) % 3]
								chr.PushOnceMotion(m_choice)
						except Exception:
							pass
					self.unit_motion[vid] = "atk"
				elif mv_dist > 28.0 or act == 1:
					if self.unit_motion.get(vid) != "run":
						self.unit_motion[vid] = "run"
						try:
							chr.SetLoopMotion(chr.MOTION_RUN)
						except Exception:
							pass
				else:
					if self.unit_motion.get(vid) != "wait":
						self.unit_motion[vid] = "wait"
						try:
							chr.SetLoopMotion(chr.MOTION_WAIT)
						except Exception:
							pass

				w = 1.0
				if act in (2, 3):
					w += 5.0
				if dmg > 0:
					w += 6.0
				if self.roster.get(str(vid), {}).get("leader"):
					w += 1.5
				hot_sum_x += wx * w
				hot_sum_y += wy * w
				hot_weight += w

		cur_t = f0.get("t", 0) + (f1.get("t", 0) - f0.get("t", 0)) * alpha
		for ev in self.events:
			dt_ev = cur_t - float(ev.get("t", -999))
			if 0.0 <= dt_ev <= 3.0 and "wx" in ev and "wy" in ev:
				ev_wx = float(ev["wx"])
				ev_wy = float(ev["wy"])
				if ev_wx <= 100.0 and ev_wy <= 100.0:
					ev_wx *= 512.0
					ev_wy *= 512.0
				if 2000.0 <= ev_wx <= 49200.0 and 2000.0 <= ev_wy <= 49200.0:
					kw = (3.0 - dt_ev) * 4.5
					hot_sum_x += ev_wx * kw
					hot_sum_y += ev_wy * kw
					hot_weight += kw

		if self.cam_mode == "follow" and follow_pos is not None:
			self.cam_x += (follow_pos[0] - self.cam_x) * 0.25
			self.cam_y += (follow_pos[1] - self.cam_y) * 0.25
		elif self.cam_mode == "director":
			if hot_weight > 0:
				tx = hot_sum_x / hot_weight
				ty = hot_sum_y / hot_weight
			else:
				tx = self.center_x
				ty = self.center_y
			self.cam_x += (tx - self.cam_x) * 0.06
			self.cam_y += (ty - self.cam_y) * 0.06
			target_dist = 1750.0 if clash_intensity >= 6 else 2150.0
			self.cam_dist += (target_dist - self.cam_dist) * 0.03
			self.cam_rot = (self.cam_rot + dt * 3.2) % 360.0

		self.cam_x = max(2000.0, min(49200.0, float(self.cam_x)))
		self.cam_y = max(2000.0, min(49200.0, float(self.cam_y)))

		try:
			if hasattr(clientloading, "PumpFramePreload"):
				clientloading.PumpFramePreload()
		except Exception:
			pass

		# Move the main anchor character (CAM_VID) to (cam_x, cam_y);
		# chr.SetPixelPosition automatically sets z = GetTerrainHeight(cam_x, cam_y).
		# Then app.UpdateGame() updates background terrain around CAM_VID and sets
		# m_v3CenterPosition = (+cam_x, -cam_y, +cz) without double-negating Y!
		try:
			chr.SelectInstance(CAM_VID)
			chr.SetPixelPosition(int(self.cam_x), int(self.cam_y))
		except Exception:
			pass

		app.UpdateGame()
		app.SetCamera(float(self.cam_dist), float(self.cam_pitch), float(self.cam_rot), 110.0)

		if self.frame_tick % 2 == 0:
			self._WriteState("playing" if self.playing else "paused", 100, idx0, alpha)

	def _WriteState(self, status, progress, idx0=0, alpha=0.0, stage=""):
		try:
			proj = []
			cz = 0.0
			if self.ready:
				try:
					cz = background.GetHeight(float(self.cam_x), float(self.cam_y))
				except Exception:
					cz = 0.0
				sw = wndMgr.GetScreenWidth()
				sh = wndMgr.GetScreenHeight()
				for vid in self.spawned_vids:
					try:
						px, py = chr.GetProjectPosition(vid, 195)
						if -120 <= px <= sw + 120 and -120 <= py <= sh + 120:
							proj.append([vid, int(px), int(py)])
					except Exception:
						pass
			st = {
				"status": status,
				"progress": progress,
				"stage": stage,
				"cursor": round(self.cursor, 3),
				"playing": self.playing,
				"speed": self.speed,
				"cam_mode": self.cam_mode,
				"follow_pid": self.follow_pid,
				"cam_x": round(self.cam_x, 1),
				"cam_y": round(self.cam_y, 1),
				"cam_z": round(cz, 1),
				"cam_dist": round(self.cam_dist, 1),
				"cam_pitch": round(self.cam_pitch, 1),
				"cam_rot": round(self.cam_rot, 1),
				"proj": proj,
			}
			f = io.open("/m2w_replay_state.json", "w", encoding="utf-8")
			f.write(json.dumps(st))
			f.close()
		except Exception:
			pass

	def OnRender(self):
		if not self.ready:
			return
		try:
			app.RenderGame()
		except Exception:
			try:
				chr.Deform()
				background.Render()
				chr.Render()
				effect.Render()
			except Exception:
				pass
		try:
			grp.PopState()
			grp.SetInterfaceRenderState()
		except Exception:
			pass


def StartReplay3D(stream=None, path="/m2w_replay_init.json"):
	global _ACTIVE_REPLAY_WIN
	_WriteStatus("StartReplay3D_entry")
	try:
		if _ACTIVE_REPLAY_WIN is not None:
			_ACTIVE_REPLAY_WIN.Close()
	except Exception:
		pass
	win = Replay3DWindow(stream)
	if not win.LoadReplayData(path):
		_WriteStatus("LoadReplayData", "Nie udalo sie wczytac pliku: " + str(path))
		return False
	_ACTIVE_REPLAY_WIN = win
	net.SetPhaseWindow(net.PHASE_WINDOW_GAME, win)
	if stream is not None:
		try:
			stream.SetPhaseWindow(win, False)
			return True
		except Exception as e:
			_WriteStatus("SetPhaseWindow", str(e))
			try:
				if getattr(stream, "curPhaseWindow", None):
					stream.curPhaseWindow.Hide()
			except Exception:
				pass
	win.Open()
	return True


def start(stream=None, path="/m2w_replay_init.json"):
	return StartReplay3D(stream, path)
