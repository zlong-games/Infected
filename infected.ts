import { ParseUI, ConvertArray } from "modlib";

const VERSION = "1.09.01";

/*
//
///---------------------///
// NOTES/GENERAL COMMENTS
///------------------///

Survivor Flow:
- all players spawn on survivor team at game start
- an 'Alpha Infected' is chosen to start if conditions are met (i.e. no survivors on previous round)
- fight off infected bots and players
- round ends when ROUND_DURATION expires
Infected Flow:
- if infected, either spawn as infected at round start, after being chosen as 'Alpha Infected', or becoming infected by another infected player
- hunt down and infect survivors to convert them to Infected team
- round ends when all survivors are elminated and converted

- 12 2-minute rounds


* My desired game rules created challenges for consistent numbers across different End of Round(Eor) conditions and player states
* The engine completely removes AI/bots from the server after death. This made consistent teamcounts challenging
* I kept track of them through the BotProfile(BP) and PlayerProfile(PP) classes
* BotProfiles(BP) are used to track the bot's state, properties, and to handle different team callbacks
* PlayerProfiles(PP) are used to track human players' state, properties
* The BPs are still buggy, bot names can be used by multiple bots, but mostly work for this project's needs

/
//
///-----///
// CREDITS
///----///

Battlefield Dad's Domination Template was referenced when creating the simple scoring system 
This was modified to fit the PlayerProfile(PP) class
https://github.com/BattlefieldDad/Battlefield-6-Portal---Domination-Template/

Almost all of the UI classes and methods were cloned and modified from example projects by DICE/EA

Dealing with bots leaving the server and keeping track of persistence was really difficult for me
Some of the infected logic and some UI things were vibe coded >_<

*/

// resolved at mode start by matching HQ position and resupply interact positions
let CURRENT_MAP: MapNames | undefined;

const DEBUG = false; // turn these off on publish
const FAST_START = false;
const SKIP_SESSION_START = false;
const DEBUG_ALPHA_HUMAN_ONLY = false;
const DEBUG_ALPHA_STATE = false;
const DEBUG_SHOW_ALL_UI_ELEMENTS = false; // force-show all currently-instantiated UI widgets for layout debugging
const DEBUG_LEAP_RUNTIME = false; // temporary diagnostics for leap init/tick gating
const DEBUG_BOT_LIFECYCLE = false; // targeted checklist logs for bot spawn->death timing investigations
const DEBUG_GUARANTEE_TURRET_GADGET = false; // force every rolled sidearm bundle's gadget to be the turret, for testing
const DEBUG_FORCE_RORSCH = false; // force every survivor's Primary weapon to the Rorsch Mk.2, bypassing LMS/Final Five gating, for testing RorschRailgun's fire-detection/splash-damage/impulse
const LEAP_TEST_MODE = false; // set true to bypass all game logic and run the leap attack sandbox
const BOT_SURVIVAL_TEST_MODE = false; // set true to disable rounds/timers and soak-test infected bot lifecycle
const BOT_SURVIVAL_TEST_ICONS = false; // show the world icons for bot spawners to visualize spawn locations and test icon performance with many bots

const BOT_SURVIVAL_TEST_SPAWN_INTERVAL_SECONDS = 10;
const BOT_SURVIVAL_TEST_MAX_INFECTED_BOTS = 16;
const BOT_SURVIVAL_TEST_DISABLE_ATTACKS = false;
const INFECTED_AI_HARD_DISABLE_ATTACKS = false; // hard-disable bot melee by stripping melee equipment
const BOT_SURVIVAL_TEST_ALPHA_SLOT_INDEX = 0; // exactly one soak-test bot uses alpha ruleset/logic
let BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS = 0;
const BOT_SURVIVAL_TEST_VEHICLE_RESPAWN_DELAY_SECONDS = 1.0;

const LOADOUT_SELECTION_TIME = 40;
const GAME_COUNTDOWN_TIME = FAST_START ? 5 : LOADOUT_SELECTION_TIME;
const WAIT_FOR_SPAWN_TIMEOUT = 3;

const INFECTED_RESPAWN_TIME = 2;
const INFECTED_RESPAWN_TIME_LAST_MAN = 4;
const INFECTED_PENDING_SPAWN_TIMEOUT_SECONDS = 3;
const PLAYER_REDEPLOY_TIME = 1;
const SURVIVOR_AI_SPAWNERS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const INFECTED_AI_SPAWNERS: number[] = [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
const PARACHUTE_INFECTED_SPAWNERS: number[] = [33, 34, 35, 36, 37, 38];

const AI_INFECTED_MELEE_DISTANCE = 3;
const AI_INFECTED_BASE_SPEED_MULTIPLIER = 1;
const AI_LEASH_RANGE = 5;
const AI_MIN_DEF_RANGE = 3;

// Vehicle-chase anti-stutter constants
const AI_VEHICLE_REAR_MELEE_DISTANCE = 4;          // full-damage attack radius from rear hemisphere
const AI_VEHICLE_GLANCING_MELEE_DISTANCE = 1.9;        // reduced-damage attack radius from side/front-glancing
const AI_VEHICLE_HEAD_ON_CONE_DOT_MIN = 0.92;        // block attacks in a narrower head-on cone
const AI_VEHICLE_REAR_CONE_DOT_MAX = -0.6;           // require a tight rear cone for full damage classification
const AI_VEHICLE_MOVE_REISSUE_SECONDS = 0.5;        // reissue every tick vehicle position changes fast
const AI_VEHICLE_GLANCING_FORCE_FIRE_DAMAGE = 50;    // side/front-glancing vehicle chip damage
const AI_VEHICLE_REAR_FORCE_FIRE_DAMAGE = 200;       // rear hemisphere vehicle chip damage
const INFECTED_MELEE_VEHICLE_IMPULSE_LIGHT = 8000;  // dirt bikes, quads, golf carts -- and the default for any other vehicle
const INFECTED_MELEE_VEHICLE_IMPULSE_HEAVY = 30000;  // Flyer, Vector -- heavier vehicles get a stronger shove
const AI_VEHICLE_ATTACK_WINDOW_SECONDS = 0.35;       // minimum continuous time in valid vehicle melee window before forcefire
const AI_VEHICLE_TARGET_MIN_MOVE_MULTIPLIER = 3;     // minimum movement speed multiplier when target is in a vehicle
const AI_VEHICLE_TARGET_MAX_MOVE_MULTIPLIER = 5;     // cap for velocity-scaled movement boost while chasing vehicles
const AI_VEHICLE_TARGET_SPEED_PER_MULTIPLIER_STEP = 10; // linear velocity units needed for each +1 multiplier above minimum
const AI_DEFAULT_MOVE_REISSUE_SECONDS = 1;          // balanced on-foot chase interval
const AI_MELEE_CLOSE_REISSUE_SECONDS = 0.45;        // frequent close-range updates while trying to maintain melee contact
const AI_MELEE_LOADOUT_DISTANCE = 5;              // keep gadget use (melee) active within this range
const AI_MELEE_FORCE_FIRE_DURATION = 0.05;          // one-off attack pulse duration for AIForceFire
const AI_MELEE_FORCE_FIRE_COOLDOWN_SECONDS = 0.55;  // minimum delay between forced melee swings
const AI_MELEE_FORCE_FIRE_VEHICLE_COOLDOWN_SECONDS = 2; // longer cooldown for vehicles to balance out higher damage and reduce stutter risk
const AI_LEAP_FORCE_FIRE_DURATION = 0.8;            // sustained force-fire pulse after charge to ensure leap trigger
const AI_LEAP_POST_CHARGE_WAIT_SECONDS = 0.15;      // extra settle time after charge completes before force-fire
const AI_LEAP_LAUNCH_TIMEOUT_SECONDS = 1.5;         // max wait for leap launch before giving control back
const AI_LEAP_STATE_POLL_SECONDS = 0.1;             // polling cadence for launch/landing state checks
const AI_SURVIVOR_FRONT_HEMISPHERE_DOT_MIN = 0.05;  // require bot to be in survivor front hemisphere before allowing melee
const AI_BOT_SPAWN_TICK_GRACE_SECONDS = 1.2;        // defer ongoing AI tick briefly to avoid spawn/init race conditions
const AI_MOVE_FAILURE_RECOVERY_SECONDS = 2.0;       // pause chase tick after move-fail recovery behavior
const AI_TO_HUMAN_DAMAGE_MODIFIER_MULTI = 0.8;      // lower values are easier
const AI_TO_HUMAN_DAMAGE_MODIFIER_SOLO = 0.9;
const MAX_PLAYER_COUNT = 12;
const INFECTED_COUNT_LIMIT = 12;

const BLACK_COLOR = [1, 1, 1];

let VOModule = mod.RuntimeSpawn_Common.SFX_VOModule_OneShot2D;
let VOSoundsSurvivor: any;
let VOSoundsInfected: any;

const SFX_NEGATIVE: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_Beacons_SignalLost_OneShot2D;
const SFX_POSITIVE: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_Circuit_TerminalCaptured_OneShot2D;
const SFX_SURVIVOR_LOST: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingThumpEnemy_OneShot2D;
const SFX_MELEE_HIT_FALL_DMG: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_Soldier_Damage_Fall_Low_OneShot2D;
const SFX_MELEE_HIT_ARMR_BRK: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_Soldier_Damage_ArmorBreakSelf_OneShot2D;
const SFX_FINAL_FIVE: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_Rodeo_TanksLockerUnlocking_OneShot2D;
const SFX_ALPHA_SELECTED: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_Standoff_ZoneExit_OneShot2D;
const SFX_ALPHA_LEAP_2D: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_Gadgets_EpiPen_Charge_OneShot2D;
const SFX_ALPHA_LEAP_VEHICLE_WARNING_LOOP_3D: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_GameModes_BR_Mission_Wreckage_BombBeeping_Loop_SimpleLoop3D;
const SFX_ALPHA_LEAP_EXECUTE_WARN_3D: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_Gadgets_EIDOS_Fire_OneShot3D;
// Played (targeted to the alpha player only) when they cross in/out of the leap attack area trigger.
const SFX_ALPHA_LEAP_AREA_ENTER_2D: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CaptureNeutralize_OneShot2D;
const SFX_ALPHA_LEAP_AREA_EXIT_2D: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CaptureStartedByEnemy_OneShot2D;

// The only other AreaTrigger placed in Sand2 besides the vault-kill trigger (9091) -- already
// used to boost infected AI sprint speed while chasing a vehicle target (see
// ApplyInfectedAIAreaMoveSpeedMultiplier). The leap attack is now gated to this same zone.
const LEAP_ATTACK_AREA_TRIGGER_ID = 901;

const SFX_TICKDOWN_START: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Shared_Countdown_Appear_OneShot2D;
const SFX_TICKDOWN: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Shared_Countdown_Tick_OneShot2D;
const SFX_TICKDOWN_FINAL: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Shared_Countdown_Tick_Final_OneShot2D;
const SFX_ROUND_COUNTDOWN: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_EOM_CountdownTick_OneShot2D;

const SFX_AMMO_FULL: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_DataUpload_DataDepositStop_OneShot2D;
const SFX_ACTION_BLOCKED: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Map_MapMovement_ZoomBlocked_OneShot2D;
const SFX_LOADOUT_SELECT: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_MenuNavigation_Loadout_ClickSelectLoadout_OneShot2D;
const SFX_LOADOUT_REROLL: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_MenuNavigation_Challenges_RerollConfirm_OneShot2D;
const SFX_LOADOUT_HOVER: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_MenuNavigation_Home_PlayItemHover_OneShot2D;
const SFX_LOADOUT_CONFIRM: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_MenuNavigation_Loadout_ScreenArrive_OneShot2D;
const SFX_LOADOUT_REVEAL_COMMON: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_EOR_RankUp_Normal_OneShot2D;
const SFX_LOADOUT_REVEAL_RARE: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Notification_Primary_C_2D;
const SFX_LOADOUT_REVEAL_LEGENDARY: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Notification_Primary_G_2D;
const SFX_LOADOUT_REVEAL_COUNTER: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Notification_SectorBonus_NumberChange_OneShot2D;
const SFX_SLEDGE_REMINDER: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_MenuNavigation_Notification_ToasterPopUp_OneShot2D;
const SFX_PROP_PLACED: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Deploy_Screen_ActionSuccess_OneShot2D;
const VFX_PROP_PLACED: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.FX_Impact_SafeImpact_Generic;
const SFX_VL7_TRANSITION_GASP: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_Soldier_Movement_CameraNoise_OneShot2D;
const VL7_TRANSITION_OVERLAY_ALPHA = 0.9;
const VL7_TRANSITION_OVERLAY_FADE_SECONDS = 3;
const VL7_TRANSITION_DISABLE_OVERLAY_FADE_SECONDS = 1;
const VL7_TRANSITION_OVERLAY_FADE_STEP_SECONDS = 0.02;
const VL7_TRANSITION_DISABLE_OVERLAP_SECONDS = 0;
const VL7_TRANSITION_DISTORTION_LEAD_SECONDS = 1;
const VL7_TRANSITION_DISTORTION_TRAIL_SECONDS = 0.1;
const VL7_TRANSITION_DISTORTION_VFX: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.FX_Gadget_RemoteTurret_ScreenEffect_Damage;
const VL7_CLOUD_OBJECT = mod.GetVL7Cloud(1470);
mod.SetVL7CloudEffects(VL7_CLOUD_OBJECT, true, false, false);

const ALPHA_INDICATOR_FLAME_VFX: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.FX_CarFire_FrameCrawl; // has effect on objects too
const ALPH_INDICATOR_BLINKING_FIRE_VFX: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.FX_CIN_MF_Large_Static_Fire;

const SURVIVOR_TEAM = mod.GetTeam(1);
const INFECTED_TEAM = mod.GetTeam(2);
const POINTS_PER_INFECTED_KILL = 100;
const POINTS_PER_SURVIVOR_INFECTED = 300;
const POINTS_ROUND_SURVIVED = 850;
const HEALTH_RESTORE_ON_INFECTED = 50;
const LMS_RELOAD_POLL_SECONDS = 0.05;
const LMS_RELOAD_SPEED_FACTOR = 0.35;
const INFECTED_HINT_ROTATION_SECONDS = 8;
const CURRENT_MAP_HQ_POSITION_THRESHOLD = 5.0;
const WAIT_FOR_MAP_GATE_TIMEOUT_SECONDS = 10; // Useless, just a player-facing message. Game/AI need to run for nearly 2 minutes before things settle.

const INFECTED_HINT_STRING_KEYS = [
    "infected_hint_alpha_leap",
    "infected_hint_assault_ladder",
    "infected_hint_brains",
] as const;

const INFECTED_HINT_STRING_KEYS_NO_LEAP = [
    "infected_hint_assault_ladder",
    "infected_hint_brains",
] as const;

const INFECTED_ALPHA_HINT_STRING_KEYS = [
    "infected_hint_vehicle_leap",
    "infected_hint_leap_mechanic",
] as const;

const INFECTED_ALPHA_HINT_STRING_KEYS_NO_LEAP = [
    "infected_hint_assault_ladder",
    "infected_hint_brains",
] as const;

const LMS_HINT_STRING_KEYS = [
    "lms_hint_you_are_last"
] as const;

const LMS_BUFF_STRING_KEYS = [
    "lms_buff_fast_reload",
    "lms_buff_bonus_health",
] as const;

const ALPHA_BUFF_STRING_KEYS = [
    "alpha_infected_area_notification",
    "alpha_buff_tankier",
    "alpha_buff_leap_attack",
] as const;

const ALPHA_BUFF_STRING_KEYS_NO_LEAP = [
    "alpha_infected_area_notification",
    "alpha_buff_tankier",
] as const;

const VL7_TRANSITION_DISTORTION_BY_PLAYER = new Map<number, mod.VFX>();
const VL7_TRANSITION_DISTORTION_TOKEN_BY_PLAYER = new Map<number, number>();
const VL7_TRANSITION_OVERLAY_BY_PLAYER = new Map<number, mod.UIWidget>();
const VL7_TRANSITION_OVERLAY_TOKEN_BY_PLAYER = new Map<number, number>();
let VL7_TRANSITION_DISTORTION_TOKEN_COUNTER = 0;
let VL7_TRANSITION_OVERLAY_TOKEN_COUNTER = 0;

interface Vector3 {
    x: number;
    y: number;
    z: number;
}

interface Vector4 {
    x: number;
    y: number;
    z: number;
    w: number;
}

interface ObjectTransform {
    id: mod.RuntimeSpawn_Sand | mod.RuntimeSpawn_Common;
    position: Vector3;
    rotation: Vector4;
    scale: Vector3;
}

interface HQInfo {
    position: Vector3;
    team: mod.Team;
    hq: mod.HQ;
}

enum MapNames {
    NEXUS = "NEXUS",
    SAND = "SAND",
    SAND2 = "SAND2",
}

enum ResupplyInteractPointId {
    POINT_301 = 301,
    POINT_302 = 302,
    POINT_303 = 303,
}

enum ResupplyWorldIconId {
    PRIMARY = 801,
    SECONDARY = 802,
    TERTIARY = 803,
}

interface ResupplyConfig {
    worldIcons: ResupplyWorldIconId[];
    positionsByInteractPoint: Map<ResupplyInteractPointId, Vector3>;
}

const NEXUS_SURVIVOR_HQ: HQInfo = { position: { x: -148.586, y: 136.548, z: 350.893 }, team: mod.GetTeam(1), hq: mod.GetHQ(1) };
const SAND_SURVIVOR_HQ: HQInfo = { position: { x: -44.841, y: 32.476, z: -20.154 }, team: mod.GetTeam(1), hq: mod.GetHQ(1) };
const SAND2_SURVIVOR_HQ: HQInfo = { position: { x: 42.526, y: 58.632, z: -36.403 }, team: mod.GetTeam(1), hq: mod.GetHQ(1) };

const HQPOSITIONS: Map<MapNames, HQInfo> = new Map();
HQPOSITIONS.set(MapNames.NEXUS, NEXUS_SURVIVOR_HQ);
HQPOSITIONS.set(MapNames.SAND, SAND_SURVIVOR_HQ);
HQPOSITIONS.set(MapNames.SAND2, SAND2_SURVIVOR_HQ);

const RESUPPLY_CONFIG_BY_MAP: Map<MapNames, ResupplyConfig> = new Map();
RESUPPLY_CONFIG_BY_MAP.set(MapNames.NEXUS, {
    worldIcons: [ResupplyWorldIconId.PRIMARY, ResupplyWorldIconId.SECONDARY, ResupplyWorldIconId.TERTIARY],
    positionsByInteractPoint: new Map<ResupplyInteractPointId, Vector3>([
        [ResupplyInteractPointId.POINT_301, { x: -153.408, y: 136.403, z: 347.421 }],
        [ResupplyInteractPointId.POINT_302, { x: -136.148, y: 142.025, z: 366.611 }],
        [ResupplyInteractPointId.POINT_303, { x: -115.517, y: 136.82, z: 346.318 }],
    ]),
});
RESUPPLY_CONFIG_BY_MAP.set(MapNames.SAND, {
    worldIcons: [ResupplyWorldIconId.PRIMARY, ResupplyWorldIconId.SECONDARY],
    positionsByInteractPoint: new Map<ResupplyInteractPointId, Vector3>([
        [ResupplyInteractPointId.POINT_301, { x: -34.199, y: 35.913, z: -23.397 }],
        [ResupplyInteractPointId.POINT_302, { x: -27.545, y: 37.996, z: -7.459 }],
    ]),
});
RESUPPLY_CONFIG_BY_MAP.set(MapNames.SAND2, {
    worldIcons: [ResupplyWorldIconId.PRIMARY, ResupplyWorldIconId.SECONDARY],
    positionsByInteractPoint: new Map<ResupplyInteractPointId, Vector3>([
        [ResupplyInteractPointId.POINT_301, { x: 37.679, y: 63.894, z: -9.451 }],
        [ResupplyInteractPointId.POINT_302, { x: -6.948, y: 60.076, z: -28.143 }],
    ]),
});

// NOTE: these used to be `const`, resolved once at module-load time via mod.GetHQ(1)/(2).
// That runs before the level's spatial objects (HQs included) are guaranteed to be
// registered with the engine -- see WaitForCurrentMapGate -- so the captured position could
// silently be garbage (e.g. zero vector) depending on load-order timing. Every 2D SFX
// (Helpers.PlaySoundFX) and VO call (SpawnTeamVOSoundsAtHQ) spawns its sound object at this
// fixed anchor, so a bad capture here goes silent for *all* of them, while positional/3D
// sounds -- which compute their own live location at call time -- are unaffected. Now `let`,
// refreshed by RefreshHQPositions() after the map gate resolves in OnGameModeStarted.
let POSITION_HQ1: mod.Vector = mod.GetObjectPosition(mod.GetHQ(1));
let POSITION_HQ2: mod.Vector = mod.GetObjectPosition(mod.GetHQ(2));
const ZERO_VEC: mod.Vector = mod.CreateVector(0, 0, 0);

function RefreshHQPositions(): void {
    POSITION_HQ1 = mod.GetObjectPosition(mod.GetHQ(1));
    POSITION_HQ2 = mod.GetObjectPosition(mod.GetHQ(2));
}

function SpawnTeamVOSoundsAtHQ(): void {
    VOSoundsSurvivor = mod.SpawnObject(VOModule, POSITION_HQ1, ZERO_VEC, ZERO_VEC);
    VOSoundsInfected = mod.SpawnObject(VOModule, POSITION_HQ2, ZERO_VEC, ZERO_VEC);
}

function GetVOSourceForTeam(team: mod.Team | undefined): any {
    if (!team) return VOSoundsSurvivor ?? VOSoundsInfected;
    const teamObjId = mod.GetObjId(team);
    if (teamObjId === mod.GetObjId(SURVIVOR_TEAM)) {
        return VOSoundsSurvivor ?? VOSoundsInfected;
    }
    if (teamObjId === mod.GetObjId(INFECTED_TEAM)) {
        return VOSoundsInfected ?? VOSoundsSurvivor;
    }
    return VOSoundsSurvivor ?? VOSoundsInfected;
}

function PlayVOForTeam(
    eventType: mod.VoiceOverEvents2D,
    voiceFlag: mod.VoiceOverFlags,
    team: mod.Team,
): void {
    const source = GetVOSourceForTeam(team);
    if (!source) return;
    mod.PlayVO(source, eventType, voiceFlag, team);
}

function PlayVOForPlayer(
    eventType: mod.VoiceOverEvents2D,
    voiceFlag: mod.VoiceOverFlags,
    player: mod.Player,
): void {
    const source = GetVOSourceForTeam(mod.GetTeam(player));
    if (!source) return;
    mod.PlayVO(source, eventType, voiceFlag, player);
}

let RESUPPLY_WORLD_ICONS: ResupplyWorldIconId[] = [];
let RESUPPLY_INTERACT_POINTS: ResupplyInteractPointId[] = [];
const RESUPPLY_WORLD_LOCATION: Map<ResupplyInteractPointId, mod.Vector> = new Map<ResupplyInteractPointId, mod.Vector>();

let ROUND_DURATION = 120; // duration of each round in seconds
let GAME_ROUND_LIMIT = 9;

const SANDSTORM_MIN_ROUND_TIME_REMAINING_SECONDS = 30;
const SANDSTORM_WARNING_LEAD_SECONDS = 10;
const SANDSTORM_DURATION_MIN_SECONDS = 45;
const SANDSTORM_DURATION_MAX_SECONDS = 60;
const SANDSTORM_CHANCE_LMS = 0.75;
const SANDSTORM_CHANCE_DEFAULT = 0.9;
// Reserve these IDs in Godot for sandstorm warning/loop sounds.
const SANDSTORM_WARNING_SFX_ID = 2601;
const SANDSTORM_WARNING_SFX_ATTENUATION = 100;
const SANDSTORM_WIND_LOOP_SFX_IDS: number[] = [2620, 2621, 2622];
const SANDSTORM_WIND_LOOP_SFX_ATTENUATION = 90;
const SANDSTORM_FIRE_LOOP_SFX_IDS: number[] = [2603, 2604, 2605, 2606, 2607, 2608, 2609, 2610];
const SANDSTORM_FIRE_LOOP_SFX_ATTENUATION = 100;
const SANDSTORM_LOOP_AUDIO_RAMP_SECONDS = 10;
const SANDSTORM_JETWASH_WARNING_LEAD_SECONDS = 0.25;
const SANDSTORM_LOOP_SFX_FADE_STEP_SECONDS = 0.1;
const SANDSTORM_LOOP_SFX_PLAY_STAGGER_SECONDS = 0.06;
const SANDSTORM_LOOP_SFX_MIN_AMPLITUDE = 0.02;

// Tracked vehicle reference -- set in OnVehicleSpawned, used by infected AI logic
let SPAWNED_ACTIVE_VEHICLE: mod.Vehicle | undefined = undefined;
let BOT_SURVIVAL_TEST_VEHICLE_SPAWN_REQUEST_ID = 0;

const VEHICLE_SPAWNER_IDS: number[] = [202, 203, 204];

// Pool of vehicle types randomly selected each time the final five vehicle spawns
const VEHICLE_TYPES: mod.VehicleList[] = [
    mod.VehicleList.Vector,
    mod.VehicleList.Quadbike,
    mod.VehicleList.GolfCart,
    mod.VehicleList.Flyer60,
    mod.VehicleList.DirtBike
];

// WEAPON RARITY THRESHOLDS -- lower threshold means more common, higher value means more rare
const RARITY_MEDIUM_THRESHOLD = 30;
const RARITY_HIGH_THRESHOLD = 60;
const RARITY_RARE_THRESHOLD = 80;
// Raised from 90 -- legendary is meant to read as a genuinely rare event, not a coinflip on a
// decent attachment roll. Paired with Weapons.buildWeaponOption's tier-bypass clamp: a weapon
// whose own base `rarity` already meets a threshold is never suppressed below it (that's how
// the M357/M44 revolvers and the BattlePickup weapons stay "legendary by itself" with no
// attachments needed), but anything below the threshold still needs pkg.addedRarity >=
// ATTACHMENT_RARITY_LEGENDARY_THRESHOLD to break through on attachments alone. E.g. the DB-12
// (base rarity 85, see Weapons.baseWeapons) tops out at 2 rolled attachments worth at most 45
// combined -- never enough to clear the 48 bar below, so it's hard-capped at
// RARITY_LEGENDARY_THRESHOLD - 1 (94) on every roll. The 185ksk "Saiga" (base rarity 80) tops
// out at 50 (its two best-in-slot attachments landing together), so it clears the bar -- and
// the legendary band -- only on that specific roll.
const RARITY_LEGENDARY_THRESHOLD = 95;
const ATTACHMENT_RARITY_RARE_THRESHOLD = 15;
// Raised from 30 alongside RARITY_LEGENDARY_THRESHOLD -- see comment above.
const ATTACHMENT_RARITY_LEGENDARY_THRESHOLD = 48;
// Gadgets use their own (lower) legendary threshold than weapons -- Weapons.legendarySurvivorGadgets
// is the seed list of gadgets at/above this rarity, rolled into the phase-1 sidearm pool.1
const GADGET_RARITY_LEGENDARY_THRESHOLD = 70;


const ALL_WEAPON_IDS: mod.Weapons[] = Object.keys(mod.Weapons)
    .filter((key) => Number.isNaN(Number(key)))
    .map((key) => mod.Weapons[key as keyof typeof mod.Weapons] as mod.Weapons);
const ALL_GADGET_IDS: mod.Gadgets[] = Object.keys(mod.Gadgets)
    .filter((key) => Number.isNaN(Number(key)))
    .map((key) => mod.Gadgets[key as keyof typeof mod.Gadgets] as mod.Gadgets);

const WEAPON_NAME_BY_VALUE = new Map<mod.Weapons, string>(
    Object.keys(mod.Weapons)
        .filter((key) => Number.isNaN(Number(key)))
        .map((key) => [mod.Weapons[key as keyof typeof mod.Weapons] as mod.Weapons, key])
);
const GADGET_NAME_BY_VALUE = new Map<mod.Gadgets, string>(
    Object.keys(mod.Gadgets)
        .filter((key) => Number.isNaN(Number(key)))
        .map((key) => [mod.Gadgets[key as keyof typeof mod.Gadgets] as mod.Gadgets, key])
);

function WeaponToken(weapon: mod.Weapons): string {
    return `weapon:${WEAPON_NAME_BY_VALUE.get(weapon) ?? String(weapon as unknown as mod.Any)}`;
}

function GadgetToken(gadget: mod.Gadgets): string {
    return `gadget:${GADGET_NAME_BY_VALUE.get(gadget) ?? String(gadget as unknown as mod.Any)}`;
}

function LogAlphaState(context: string, player?: mod.Player, playerProfile?: PlayerProfile, botProfile?: BotProfile) {
    if (!DEBUG_ALPHA_STATE) return;
    const resolvedPlayerProfile = playerProfile ?? (player ? PlayerProfile.Get(player) : undefined);
    const resolvedBotProfile = botProfile ?? resolvedPlayerProfile?._botProfile;
    const playerObjId = player ? mod.GetObjId(player) : -1;
    const teamObjId = player ? mod.GetObjId(mod.GetTeam(player)) : -1;
    const isAlive = player ? SafeIsAlive(player) : false;
    const isAI = player ? SafeIsAISoldier(player) : false;
    console.log(
        `[AlphaDebug] ${context} | player:${playerObjId} team:${teamObjId} alive:${isAlive} ai:${isAI} ` +
        `ppAlpha:${resolvedPlayerProfile?.isAlphaInfected} ppInfected:${resolvedPlayerProfile?.isInfectedTeam} ` +
        `bpAlpha:${resolvedBotProfile?.isAlphaInfected} bpInfected:${resolvedBotProfile?.isInfectedTeam} state:${GameHandler.gameState}`
    );
}

/////////////////////////////////////////////////////////////
///////------------------- HELPERS -------------------///////
/////////////////////////////////////////////////////////////


function MakeMessage(message: string, ...args: any[]) {
    switch (args.length) {
        case 0:
            return mod.Message(message);
        case 1:
            return mod.Message(message, args[0]);
        case 2:
            return mod.Message(message, args[0], args[1]);
        case 3:
            return mod.Message(message, args[0], args[1], args[2]);
        default:
            throw new Error("Invalid number of arguments");
    }
}

function ResolveStringKeyMessage(key: string): mod.Message {
    return MakeMessage((mod.stringkeys as Record<string, string>)[key] ?? key);
}

// Leap is no longer gated by a per-round "unlocked" flag tied to Final Five/vehicle spawn.
// It's available to alpha infected only, only while a round is actually in progress, and
// only while they're standing inside LEAP_ATTACK_AREA_TRIGGER_ID (see OnPlayerEnterAreaTrigger
// / OnPlayerExitAreaTrigger, which maintain PlayerProfile.isInLeapAttackArea).
function IsLeapAttackAvailableNow(player?: mod.Player): boolean {
    if (LEAP_TEST_MODE || BOT_SURVIVAL_TEST_MODE) return true;
    if (CURRENT_MAP !== MapNames.SAND2) return false;
    if (GameHandler.gameState !== GameState.GameRoundIsRunning) return false;
    if (!player) return false;
    const pp = PlayerProfile.Get(player);
    return !!pp?.isAlphaInfected && !!pp?.isInLeapAttackArea;
}

function IsPlayerOnInfectedTeamForLeap(player: mod.Player, playerProfile?: PlayerProfile): boolean {
    if (LEAP_TEST_MODE) return true;
    if (mod.GetObjId(mod.GetTeam(player)) === mod.GetObjId(INFECTED_TEAM)) return true;
    return !!playerProfile?.isInfectedTeam;
}

const LEAP_RUNTIME_LAST_LOG_AT: Map<string, number> = new Map();

function LogLeapRuntime(key: string, message: string, cooldownSeconds: number = 0.75): void {
    if (!DEBUG_LEAP_RUNTIME) return;
    const now = Date.now() / 1000;
    const last = LEAP_RUNTIME_LAST_LOG_AT.get(key) ?? 0;
    if (now - last < cooldownSeconds) return;
    LEAP_RUNTIME_LAST_LOG_AT.set(key, now);
    console.log(`[LeapRuntime] ${message}`);
}

function GetInfectedHintKeysForCurrentRound(player?: mod.Player): readonly string[] {
    return IsLeapAttackAvailableNow(player)
        ? INFECTED_HINT_STRING_KEYS
        : INFECTED_HINT_STRING_KEYS_NO_LEAP;
}

function GetAlphaInfectedHintKeysForCurrentRound(player?: mod.Player): readonly string[] {
    return IsLeapAttackAvailableNow(player)
        ? INFECTED_ALPHA_HINT_STRING_KEYS
        : INFECTED_ALPHA_HINT_STRING_KEYS_NO_LEAP;
}

function GetInfectedHintMessage(index: number, player?: mod.Player): mod.Message {
    const hintKeys = GetInfectedHintKeysForCurrentRound(player);
    const normalizedIndex = ((index % hintKeys.length) + hintKeys.length) % hintKeys.length;
    return ResolveStringKeyMessage(hintKeys[normalizedIndex]);
}

function GetAlphaInfectedHintMessage(index: number, player?: mod.Player): mod.Message {
    const hintKeys = GetAlphaInfectedHintKeysForCurrentRound(player);
    const normalizedIndex = ((index % hintKeys.length) + hintKeys.length) % hintKeys.length;
    return ResolveStringKeyMessage(hintKeys[normalizedIndex]);
}

function GetLastManStandingBuffMessages(): mod.Message[] {
    return LMS_BUFF_STRING_KEYS.map((key) => ResolveStringKeyMessage(key));
}

function GetAlphaInfectedBuffMessages(player?: mod.Player): mod.Message[] {
    const buffKeys = IsLeapAttackAvailableNow(player)
        ? ALPHA_BUFF_STRING_KEYS
        : ALPHA_BUFF_STRING_KEYS_NO_LEAP;
    return buffKeys.map((key) => ResolveStringKeyMessage(key));
}


class Helpers {

    /**
     * Game engine returns -1 for players that have left or are invalid
     */
    static HasValidObjId(player: mod.Player | undefined): boolean {
        if (!player) return false;
        return mod.IsPlayerValid(player) && mod.GetObjId(player) > -1;
    }

    static GetRandomSpawnFromRange(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    static GenerateBotNameMap() {
        for (let i = 0; i < ALL_SPAWNS.length; i++) {
            const index = ALL_SPAWNS[i];
            const stringkey = `_bot_${ALL_SPAWNS[i]}`;
            BOT_NAME_MAP.set(index, stringkey);
        }
    }
    static GetRandomInt(max: number) {
        return Math.floor(Math.random() * max);
    }
    static quaternionToEuler(
        q: { x: number, y: number, z: number, w: number },
        eps = 0.001
    ): { x: number, y: number, z: number } {
        const { x, y, z, w } = q;

        const sinr_cosp = 2 * (w * x + y * z);
        const cosr_cosp = 1 - 2 * (x * x + y * y);
        let roll = Math.atan2(sinr_cosp, cosr_cosp);

        const sinp = 2 * (w * y - z * x);
        let pitch: number;
        let yaw: number;

        if (Math.abs(sinp) > 0.999999) {
            pitch = Math.sign(sinp) * (Math.PI / 2);

            roll = 0;
            yaw = 2 * Math.atan2(z, w) + (sinp > 0 ? eps : -eps);
        } else {
            pitch = Math.asin(sinp);

            const siny_cosp = 2 * (w * z + x * y);
            const cosy_cosp = 1 - 2 * (y * y + z * z);
            yaw = Math.atan2(siny_cosp, cosy_cosp);
        }

        function norm(a: number) {
            while (a > Math.PI) a -= 2 * Math.PI;
            while (a < -Math.PI) a += 2 * Math.PI;
            return a;
        }

        return { x: norm(roll), y: norm(pitch), z: norm(yaw) };
    }
    static PlaySoundFX(sfx: mod.Any, amplitude: number = 1, target?: mod.Team | mod.Player): void {
        const sfxObj = mod.SpawnObject(sfx, POSITION_HQ1, ZERO_VEC);
        if (target) {
            mod.PlaySound(sfxObj, amplitude, target as mod.Any);
            return;
        }
        mod.SetSoundAmplitude(sfxObj, amplitude);
        mod.PlaySound(sfxObj, amplitude);
    }
    static Lerp(a: number, b: number, t: number): number {
        // a(min), b(max), interpolating point(0.0-1.0)
        return a + (b - a) * t;
    }
    static FormatTime(time: number): number[] {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const result: number[] = [];

        result.push(minutes % 10);

        result.push(Math.floor(seconds / 10));
        result.push(seconds % 10);
        return result;
    }
    static GenerateArray(arrayLength: number, start: number): number[] {
        return Array.from({ length: arrayLength }, (x, i) => i + start);
    }
    static ShuffleArray(array: Array<number>): Array<number> {
        let currentIndex = array.length;
        while (currentIndex != 0) {
            let randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [
                array[randomIndex], array[currentIndex]];
        }
        return array
    }
    static GetVector3Distance(a: Vector3, b: Vector3): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;

        return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    }

    static VectorToVector3(position: mod.Vector): Vector3 {
        return {
            x: mod.XComponentOf(position),
            y: mod.YComponentOf(position),
            z: mod.ZComponentOf(position),
        };
    }

    static SubtractVectors(a: mod.Vector, b: mod.Vector): mod.Vector {
        return mod.CreateVector(
            mod.XComponentOf(a) - mod.XComponentOf(b),
            mod.YComponentOf(a) - mod.YComponentOf(b),
            mod.ZComponentOf(a) - mod.ZComponentOf(b)
        );
    }

    static AddVectors(a: mod.Vector, b: mod.Vector): mod.Vector {
        return mod.CreateVector(
            mod.XComponentOf(a) + mod.XComponentOf(b),
            mod.YComponentOf(a) + mod.YComponentOf(b),
            mod.ZComponentOf(a) + mod.ZComponentOf(b)
        );
    }

    static ScaleVector(v: mod.Vector, scalar: number): mod.Vector {
        return mod.CreateVector(
            mod.XComponentOf(v) * scalar,
            mod.YComponentOf(v) * scalar,
            mod.ZComponentOf(v) * scalar
        );
    }

    static NormalizeVector(v: mod.Vector): mod.Vector {
        const x = mod.XComponentOf(v);
        const y = mod.YComponentOf(v);
        const z = mod.ZComponentOf(v);
        const mag = Math.sqrt(x * x + y * y + z * z) || 1;
        return mod.CreateVector(x / mag, y / mag, z / mag);
    }
}

function IsPlayerDeployed(player: mod.Player | undefined): boolean {
    if (!Helpers.HasValidObjId(player)) return false;
    return PlayerProfile._deployedPlayers.has(mod.GetObjId(player as mod.Player));
}

function SafeGetSoldierStateBool(
    player: mod.Player | undefined,
    state: mod.SoldierStateBool,
    fallback: boolean = false,
): boolean {
    if (!Helpers.HasValidObjId(player)) return fallback;
    try {
        return mod.GetSoldierState(player as mod.Player, state);
    } catch {
        return fallback;
    }
}

function SafeIsAISoldier(player: mod.Player | undefined): boolean {
    return SafeGetSoldierStateBool(player, mod.SoldierStateBool.IsAISoldier, false);
}

function SafeIsAlive(player: mod.Player | undefined): boolean {
    if (!IsPlayerDeployed(player)) return false;
    return SafeGetSoldierStateBool(player, mod.SoldierStateBool.IsAlive, false);
}

function GetRandomSledgeReminderDelaySeconds(): number {
    return Helpers.GetRandomSpawnFromRange(PLAYER_SLEDGE_REMINDER_MIN_SECONDS, PLAYER_SLEDGE_REMINDER_MAX_SECONDS);
}

function GetSurvivorCandidates(): PlayerProfile[] {
    return PlayerProfile._allPlayerProfiles.filter(pp => {
        if (!pp || !Helpers.HasValidObjId(pp.player)) return false;
        const objId = mod.GetObjId(pp.player);
        // Only include if ObjID is valid, deployed, and not the last alpha
        return SafeIsAlive(pp.player) && objId !== (GameHandler.lastAlphaPlayerID ?? -1);
    });
}

// for bot name assignment
const ALL_SPAWNS = SURVIVOR_AI_SPAWNERS.concat(INFECTED_AI_SPAWNERS).concat(PARACHUTE_INFECTED_SPAWNERS);
const BOT_NAME_MAP: Map<number, string> = new Map();
Helpers.GenerateBotNameMap();

const ALPHA_INDICATOR_TOKENS: Map<number, { cancel: boolean }> = new Map();
const ALPHA_VFX_INDICATOR_TOKENS: Map<number, { cancel: boolean }> = new Map();
const INFECTED_WORLD_ICON_OBJECTS: Map<number, mod.Any> = new Map();
const LMS_SPOTTED_TARGET_DURATION_SECONDS: Map<number, number> = new Map();
const BOT_TARGET_WORLD_ICON_OBJECTS: Map<number, mod.Any> = new Map();
interface BotSurvivalDebugWidgetSet {
    root: mod.UIWidget;
    lines: mod.UIWidget[];
}
const BOT_SURVIVAL_DEBUG_WIDGETS: Map<number, BotSurvivalDebugWidgetSet> = new Map();

// Human-player-only tick state. AI players never enter the human tick path.
const PLAYER_ONGOING_TICK_STATE: Map<number, {
    nextIconUpdateAt: number,
    nextBannedCheckAt: number,
    nextLadderCheckAt: number,
    nextBotDebugUpdateAt?: number,
    bannedChecksEnabledAt?: number,
    lastLadderAmmo?: number,
    nextSledgeReminderAt?: number,
}> = new Map();
const PLAYER_ONGOING_ICON_UPDATE_SECONDS = 0.05;
const PLAYER_ONGOING_BANNED_CHECK_SECONDS = 1;
const PLAYER_ONGOING_LADDER_CHECK_SECONDS = 1;
const BOT_SURVIVAL_DEBUG_UPDATE_SECONDS = 0.25;
const AI_BOT_TICK_SECONDS = 0.25; // interval between AI logic ticks per infected bot slot
const PLAYER_BANNED_CHECK_SETTLE_SECONDS = 3;
const PLAYER_SLEDGE_REMINDER_MIN_SECONDS = 7;
const PLAYER_SLEDGE_REMINDER_MAX_SECONDS = 10;

// ItemPoolCategory: categorizes weapons/gadgets into pools for random selection
enum ItemPoolCategory {
    primary,
    LMS,
    sidearm,
    gadgets,
    throwables,
}

// PooledItemDef: definition of a selectable weapon/gadget with rarity weighting
interface PooledItemDef {
    nameKey: string;
    rarity: number;
    category: ItemPoolCategory;
    item: mod.Weapons | mod.Gadgets;
    packageImage?: mod.WeaponPackage;
}

interface AttachmentDef {
    attachment: mod.WeaponAttachments;
    slot: AttachmentSlot;
    nameKey: string;
    rarity: number;
    compatibleNameKeys: string[];
}

enum AttachmentSlot {
    Scope,
    Barrel,
    Muzzle,
    Magazine,
    Ammo,
    Underbarrel,
    Top,
    Ergonomic,
    Rail,
}

// InventorySlot: where the item is equipped in the player's inventory
enum InventorySlot {
    Sidearm,
    Primary,
    LMS,
    Gadget,
    GadgetSecondary,
    Throwable,
}

// EquippedItem: an item assigned to a specific inventory slot with display info
interface EquippedItem {
    weapon?: mod.Weapons;
    gadget?: mod.Gadgets;
    inventorySlot: InventorySlot;
    text: mod.Any;
    textShortname?: mod.Any;
    packageImage: mod.WeaponPackage;
    rarity?: number;
    appliedUpgradeKeys?: string[];
    nameKey?: string;
    // Set on sidearm-slot EquippedItems only -- every sidearm card also rolls an independent
    // gadget (see Weapons.buildSidearmBundleOptions). Picking the sidearm grants both.
    bundledGadget?: EquippedItem;
}

// Returns the "legendary" rarity threshold that applies to a given item -- gadgets use the
// lower GADGET_RARITY_LEGENDARY_THRESHOLD, while weapons use the standard
// RARITY_LEGENDARY_THRESHOLD.
function GetLegendaryThresholdForItem(item: { gadget?: mod.Gadgets }): number {
    return item.gadget !== undefined ? GADGET_RARITY_LEGENDARY_THRESHOLD : RARITY_LEGENDARY_THRESHOLD;
}

// SlotLoadoutOptions: three options per weapon slot (sidearm cards each bundle a gadget), plus
// a fixed throwable
interface SlotLoadoutOptions {
    sidearmOptions: Array<EquippedItem>;
    primaryOptions: Array<EquippedItem>;
    lmsOptions: Array<EquippedItem>;
    throwable: EquippedItem;
}

interface WeaponAmmoProfile {
    baseMagSize: number;
    reserveMags: number; // reserve ammo in multiples of mag size
    resupplyMags: number; // resupply amount in multiples of mag size
}

// GadgetAmmoProfile: two distinct ammo models for gadgets.
//   'charge'  -- a flat charge count with no separate chamber/reserve split (mines, deployables).
//               Read/written entirely through GetInventoryAmmo/SetInventoryAmmo.
//   'chamber' -- behaves like a weapon: a chamber/tube/magazine (GetInventoryAmmo/SetInventoryAmmo)
//               plus a separate spare-ammo reserve pool (GetInventoryMagazineAmmo/
//               SetInventoryMagazineAmmo), same split used for primary/sidearm weapons. This is
//               the launcher (single-round tube, 2 in reserve) and incendiary shotgun (5-round
//               mag, 5 in reserve) case -- driving them through SetInventoryAmmo alone can only
//               ever fill the tube/mag, never the reserve, which is why those gadgets looked like
//               SetInventoryAmmo "didn't work" for anything past the first shot.
interface GadgetChargeProfile {
    kind: 'charge';
    maxCharges: number;
    resupplyAmount: number;
}
interface GadgetChamberProfile {
    kind: 'chamber';
    magSize: number; // tube/magazine capacity (e.g. 1 for the single-tube launchers, 5 for the incendiary shotgun)
    reserveMags: number; // spare reserve in multiples of magSize
    resupplyMags: number; // resupply amount in multiples of magSize
}
type GadgetAmmoProfile = GadgetChargeProfile | GadgetChamberProfile;

class Weapons {

    static baseWeaponAttachments: Record<string, mod.WeaponAttachments[]> = {
        m87a1: [
            mod.WeaponAttachments.Ammo_Buckshot,
            mod.WeaponAttachments.Magazine_5_Shell_Tube,
            mod.WeaponAttachments.Barrel_20_Factory,
            mod.WeaponAttachments.Left_Flashlight,
            mod.WeaponAttachments.Scope_Iron_Sights,
        ],
        m1014: [
            mod.WeaponAttachments.Ammo_Buckshot,
            mod.WeaponAttachments.Magazine_7_Shell_Tube,
            mod.WeaponAttachments.Barrel_185_Factory,
            mod.WeaponAttachments.Left_Flashlight,
            mod.WeaponAttachments.Scope_Iron_Sights,
        ],
        "185ksk": [
            mod.WeaponAttachments.Ammo_Buckshot,
            mod.WeaponAttachments.Magazine_8rnd_Magazine,
            mod.WeaponAttachments.Muzzle_Flash_Hider,
            mod.WeaponAttachments.Barrel_430mm_Cut,
            mod.WeaponAttachments.Scope_Osa_7_100x,
        ],
        db12: [
            mod.WeaponAttachments.Ammo_Buckshot,
            mod.WeaponAttachments.Magazine_7_Shell_Dual_Tubes,
            mod.WeaponAttachments.Bottom_Factory_Angled,
            mod.WeaponAttachments.Barrel_189_Factory,
            mod.WeaponAttachments.Muzzle_Flash_Hider
        ],
        kord6p67: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Muzzle_Flash_Hider,
            mod.WeaponAttachments.Magazine_30rnd_Magazine,
            mod.WeaponAttachments.Barrel_415mm_Factory,
            mod.WeaponAttachments.Right_Flashlight,
            mod.WeaponAttachments.Scope_Iron_Sights,
        ],
        m277: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Muzzle_Lightened_Suppressor,
            mod.WeaponAttachments.Scope_Iron_Sights,
            mod.WeaponAttachments.Magazine_20rnd_Magazine,
            mod.WeaponAttachments.Barrel_13_Factory
        ],
        ak205: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Muzzle_Flash_Hider,
            mod.WeaponAttachments.Magazine_30rnd_Magazine,
            mod.WeaponAttachments.Barrel_314mm_Factory,
            mod.WeaponAttachments.Left_Flashlight,
            mod.WeaponAttachments.Scope_SU_123_150x,
        ],
        rpkm: [
            mod.WeaponAttachments.Ammo_Tungsten_Core,
            mod.WeaponAttachments.Muzzle_Flash_Hider,
            mod.WeaponAttachments.Magazine_30rnd_Magazine,
            mod.WeaponAttachments.Barrel_590mm_Factory,
            mod.WeaponAttachments.Scope_Osa_7_100x,
        ],
        m123k: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Muzzle_Flash_Hider,
            mod.WeaponAttachments.Magazine_100rnd_Belt_Pouch,
            mod.WeaponAttachments.Barrel_370mm_Compact,
            mod.WeaponAttachments.Scope_SU_123_150x,
            mod.WeaponAttachments.Bottom_Bipod,
        ],
        usg90: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Muzzle_Flash_Hider,
            mod.WeaponAttachments.Scope_SU_123_150x,
            mod.WeaponAttachments.Barrel_264mm_Fluted,
            mod.WeaponAttachments.Magazine_50rnd_Magazine,
        ],
        sl9: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Barrel_9_Factory,
            mod.WeaponAttachments.Muzzle_Flash_Hider,
            mod.WeaponAttachments.Bottom_Factory_Angled,
            mod.WeaponAttachments.Magazine_30rnd_Magazine,
            mod.WeaponAttachments.Scope_R4T_200x
        ],
        m4a1: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Magazine_30rnd_Magazine,
            mod.WeaponAttachments.Barrel_115_Commando,
            mod.WeaponAttachments.Muzzle_Flash_Hider,
            mod.WeaponAttachments.Scope_SU_123_150x
        ],
        m45a1: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Barrel_5_Pencil,
            mod.WeaponAttachments.Magazine_7rnd_Magazine,
            mod.WeaponAttachments.Bottom_Flashlight,
            mod.WeaponAttachments.Scope_Iron_Sights,
        ],
        m44: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Magazine_6rnd_Speedloader,
            mod.WeaponAttachments.Barrel_675_Factory,
            mod.WeaponAttachments.Scope_Iron_Sights,
        ],
        m357: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Magazine_8rnd_Magazine,
            mod.WeaponAttachments.Barrel_5_Factory,
            mod.WeaponAttachments.Scope_Iron_Sights,
        ],
        es57: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Magazine_20rnd_Magazine,
            mod.WeaponAttachments.Barrel_122mm_Factory,
            mod.WeaponAttachments.Bottom_Flashlight,
            mod.WeaponAttachments.Scope_Iron_Sights,
        ],
        p18: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Magazine_17rnd_Magazine,
            mod.WeaponAttachments.Barrel_39_Factory,
            mod.WeaponAttachments.Bottom_Flashlight,
            mod.WeaponAttachments.Scope_Iron_Sights,
        ],
        g22: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Magazine_15rnd_Magazine,
            mod.WeaponAttachments.Barrel_114mm_Factory,
            mod.WeaponAttachments.Bottom_Flashlight,
            mod.WeaponAttachments.Scope_Iron_Sights,
        ]
        // vz61: [
        //     mod.WeaponAttachments.Ammo_FMJ,
        //     mod.WeaponAttachments.Magazine_10rnd_Magazine,
        // ]
    };

    static BuildWeaponPackageFromAttachments(attachments: mod.WeaponAttachments[]): mod.WeaponPackage {
        const pkg = mod.CreateNewWeaponPackage();
        for (const attachment of attachments) {
            mod.AddAttachmentToWeaponPackage(attachment, pkg);
        }
        return pkg;
    }

    static BuildBaseWeaponPackages(): Record<string, mod.WeaponPackage> {
        const packages: Record<string, mod.WeaponPackage> = {};
        for (const key of Object.keys(Weapons.baseWeaponAttachments)) {
            packages[key] = Weapons.BuildWeaponPackageFromAttachments(Weapons.baseWeaponAttachments[key]);
        }
        return packages;
    }

    static baseWeaponPackages: Record<string, mod.WeaponPackage> = Weapons.BuildBaseWeaponPackages();

    static attachmentPool: AttachmentDef[] = [
        { attachment: mod.WeaponAttachments.Scope_Osa_7_100x, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_osa_7_100x", rarity: 15, compatibleNameKeys: ["m87a1", "185ksk", "m1014", "ak205", "m277", "kord6p67", "rpkm", "usg90"] },
        { attachment: mod.WeaponAttachments.Scope_RO_S_125x, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_ro_s_125x", rarity: 15, compatibleNameKeys: ["m87a1", "185ksk", "m1014", "ak205", "m277", "kord6p67", "rpkm", "m4a1", "usg90", "m45a1", "m44", "m357", "es57", "p18", "g22"] },
        { attachment: mod.WeaponAttachments.Scope_Mini_Flex_100x, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_mini_flex_100x", rarity: 15, compatibleNameKeys: ["m45a1", "m44", "m357", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Scope_R_MR_100x, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_rmr_100x", rarity: 15, compatibleNameKeys: ["m45a1", "m44", "m357", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Scope_SU_123_150x, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_su_123_150x", rarity: 25, compatibleNameKeys: ["m87a1", "185ksk", "m1014", "ak205", "m277", "kord6p67", "rpkm", "usg90"] },
        { attachment: mod.WeaponAttachments.Scope_CCO_200x, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_cco_200x", rarity: 25, compatibleNameKeys: ["m87a1", "185ksk", "m1014", "ak205", "m277", "kord6p67", "rpkm", "usg90"] },
        { attachment: mod.WeaponAttachments.Scope_R4T_200x, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_r4t_200x", rarity: 25, compatibleNameKeys: ["m87a1", "185ksk", "m1014", "ak205", "m277", "kord6p67", "rpkm", "usg90"] },
        { attachment: mod.WeaponAttachments.Scope_Iron_Sights, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_iron_sights", rarity: 5, compatibleNameKeys: ["m87a1", "185ksk", "m1014", "ak205", "m277", "kord6p67", "rpkm", "usg90", "m45a1", "m44", "m357", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Muzzle_Compensated_Brake, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_compensated_brake", rarity: 15, compatibleNameKeys: ["rpkm", "m123k", "m4a1", "kord6p67", "ak205", "usg90", "sl9"] },
        { attachment: mod.WeaponAttachments.Muzzle_Single_port_Brake, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_single_port_brake", rarity: 15, compatibleNameKeys: ["rpkm", "m123k", "m4a1", "kord6p67", "ak205", "usg90", "sl9"] },
        { attachment: mod.WeaponAttachments.Muzzle_Double_port_Brake, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_double_port_brake", rarity: 20, compatibleNameKeys: ["rpkm", "m123k", "m4a1", "kord6p67", "m277", "ak205", "185ksk", "usg90", "sl9"] },
        { attachment: mod.WeaponAttachments.Muzzle_CQB_Suppressor, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_cqb_suppressor", rarity: 15, compatibleNameKeys: ["db12", "m45a1", "es57", "p18", "m1014", "m123k", "m4a1", "m277", "usg90", "sl9"] },
        { attachment: mod.WeaponAttachments.Muzzle_Standard_Suppressor, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_standard_suppressor", rarity: 15, compatibleNameKeys: ["m45a1", "es57", "p18", "m4a1"] },
        { attachment: mod.WeaponAttachments.Bottom_Ribbed_Stubby, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_ribbed_stubby", rarity: 20, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "m277", "ak205", "rpkm", "m4a1"] },
        { attachment: mod.WeaponAttachments.Bottom_Folding_Vertical, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_folding_vertical", rarity: 15, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "m277", "ak205", "rpkm", "m4a1"] },
        { attachment: mod.WeaponAttachments.Bottom_Slim_Handstop, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_slim_handstop", rarity: 10, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "m277", "ak205", "rpkm", "m4a1"] },
        { attachment: mod.WeaponAttachments.Bottom_Low_Profile_Stubby, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_low_profile_stubby", rarity: 20, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "m277", "ak205", "rpkm", "m123k", "m4a1"] },
        { attachment: mod.WeaponAttachments.Bottom_Underslung_Mount, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_underslung_mount", rarity: 5, compatibleNameKeys: ["m4a1", "m277"] },
        { attachment: mod.WeaponAttachments.Ergonomic_Improved_Mag_Catch, slot: AttachmentSlot.Ergonomic, nameKey: "attachment_ergonomic_mag_catch", rarity: 10, compatibleNameKeys: ["m45a1", "g22", "es57", "p18"] },
        // ammo
        { attachment: mod.WeaponAttachments.Ammo_FMJ, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_fmj", rarity: 5, compatibleNameKeys: ["ak205", "m277", "kord6p67", "rpkm", "m123k", "usg90", "sl9", "m45a1", "m44", "m357", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Ammo_Hollow_Point, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_hollow_point", rarity: 15, compatibleNameKeys: ["ak205", "m277", "kord6p67", "rpkm", "m123k", "m4a1", "usg90", "sl9", "m45a1", "m44", "m357", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Ammo_Tungsten_Core, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_tungsten_core", rarity: 15, compatibleNameKeys: ["ak205", "m277", "kord6p67", "rpkm", "m123k", "m4a1", "usg90"] },
        { attachment: mod.WeaponAttachments.Ammo_Synthetic_Tip, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_synthetic_tip", rarity: 30, compatibleNameKeys: ["ak205", "m4a1", "kord6p67", "sl9", "rpkm"] },
        { attachment: mod.WeaponAttachments.Ammo_Flechette, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_flechette", rarity: 15, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "db12"] },
        { attachment: mod.WeaponAttachments.Ammo_Slugs, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_slug", rarity: 25, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "db12"] },
        { attachment: mod.WeaponAttachments.Ammo_Buckshot, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_buckshot", rarity: 5, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "db12"] },
        // barrels (probably redundant)
        { attachment: mod.WeaponAttachments.Barrel_20_Factory, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_20_factory", rarity: 5, compatibleNameKeys: ["m87a1"] },
        { attachment: mod.WeaponAttachments.Barrel_675_Factory, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_675_factory", rarity: 5, compatibleNameKeys: ["m44"] },
        { attachment: mod.WeaponAttachments.Barrel_5_Factory, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_5_factory", rarity: 5, compatibleNameKeys: ["m357"] },
        { attachment: mod.WeaponAttachments.Barrel_122mm_Factory, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_122mm_factory", rarity: 5, compatibleNameKeys: ["es57"] },
        { attachment: mod.WeaponAttachments.Barrel_39_Factory, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_39_factory", rarity: 5, compatibleNameKeys: ["p18"] },
        { attachment: mod.WeaponAttachments.Barrel_5_Pencil, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_5_pencil", rarity: 5, compatibleNameKeys: ["m45a1"] },
        { attachment: mod.WeaponAttachments.Barrel_264mm_Fluted, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_264mm_fluted", rarity: 5, compatibleNameKeys: ["ak205", "usg90"] },
        { attachment: mod.WeaponAttachments.Barrel_430mm_Cut, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_430mm_cut", rarity: 5, compatibleNameKeys: ["185ksk"] },
        // magazines
        { attachment: mod.WeaponAttachments.Magazine_5rnd_Fast_Mag, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_5_fast_mag", rarity: 10, compatibleNameKeys: ["m87a1"] },
        { attachment: mod.WeaponAttachments.Magazine_7_Shell_Tube, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_7_round_tube", rarity: 10, compatibleNameKeys: ["m1014", "m87a1"] },
        { attachment: mod.WeaponAttachments.Magazine_4rnd_Fast_Mag, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_4rnd_fast_mag", rarity: 10, compatibleNameKeys: ["185ksk"] },
        { attachment: mod.WeaponAttachments.Magazine_7rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_7rnd_magazine", rarity: 10, compatibleNameKeys: ["m45a1"] },
        { attachment: mod.WeaponAttachments.Magazine_11rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_11rnd_magazine", rarity: 30, compatibleNameKeys: ["m45a1"] },
        { attachment: mod.WeaponAttachments.Magazine_8rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_8rnd_cylinder", rarity: 5, compatibleNameKeys: ["m357"] },
        { attachment: mod.WeaponAttachments.Magazine_8rnd_Moon_Clip, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_8rnd_moon_clip", rarity: 15, compatibleNameKeys: ["m357"] },
        { attachment: mod.WeaponAttachments.Magazine_8rnd_Fast_Mag, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_8rnd_fast_mag", rarity: 25, compatibleNameKeys: ["185ksk"] },
        { attachment: mod.WeaponAttachments.Magazine_17rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_17rnd_magazine", rarity: 10, compatibleNameKeys: ["p18"] },
        { attachment: mod.WeaponAttachments.Magazine_20rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_20rnd_magazine", rarity: 15, compatibleNameKeys: ["es57", "g22"] },
        { attachment: mod.WeaponAttachments.Magazine_21rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_21rnd_magazine", rarity: 20, compatibleNameKeys: ["p18"] },
        { attachment: mod.WeaponAttachments.Magazine_30rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_30rnd_magazine", rarity: 20, compatibleNameKeys: ["m277"] },
        { attachment: mod.WeaponAttachments.Magazine_40rnd_Fast_Mag, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_40rnd_fast_mag", rarity: 20, compatibleNameKeys: ["kord6p67", "ak205", "rpkm", "m4a1"] },
        { attachment: mod.WeaponAttachments.Magazine_45rnd_Fast_Mag, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_45rnd_fast_mag", rarity: 30, compatibleNameKeys: ["kord6p67", "ak205", "rpkm"] },
        { attachment: mod.WeaponAttachments.Magazine_60rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_60rnd_magazine", rarity: 20, compatibleNameKeys: ["sl9"] },
        { attachment: mod.WeaponAttachments.Magazine_75rnd_Drum, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_75rnd_drum", rarity: 30, compatibleNameKeys: ["rpkm"] },
        { attachment: mod.WeaponAttachments.Magazine_100rnd_Belt_Box, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_100rnd_box", rarity: 20, compatibleNameKeys: [] },
        { attachment: mod.WeaponAttachments.Magazine_100rnd_Belt_Pouch, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_100rnd_pouch", rarity: 1, compatibleNameKeys: ["m123k"] },
        { attachment: mod.WeaponAttachments.Magazine_200rnd_Belt_Box, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_200rnd_box", rarity: 20, compatibleNameKeys: ["m123k"] },
        // Lights and lasers (sidearms)
        { attachment: mod.WeaponAttachments.Bottom_5_mW_Red, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_bottom_5mw_red", rarity: 5, compatibleNameKeys: ["m45a1", "m357", "es57", "p18", "g22"] },
        { attachment: mod.WeaponAttachments.Bottom_5_mW_Green, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_bottom_5mw_green", rarity: 10, compatibleNameKeys: ["m45a1", "m357", "es57", "p18", "g22"] },
        { attachment: mod.WeaponAttachments.Bottom_50_mW_Green, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_bottom_50mw_green", rarity: 20, compatibleNameKeys: ["m45a1", "m357", "es57", "p18", "g22"] },
        { attachment: mod.WeaponAttachments.Bottom_Flashlight, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_bottom_flashlight", rarity: 10, compatibleNameKeys: ["m45a1", "m357", "es57", "p18", "g22"] },
        { attachment: mod.WeaponAttachments.Bottom_Laser_Light_Combo_Green, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_bottom_laserlight_green", rarity: 10, compatibleNameKeys: ["m45a1", "m357", "es57", "p18", "g22"] },
        // Rail attachments (Top / Right / Left) lasers, flashlights, and lights
        // Top lasers (carbines and one shotgun)
        { attachment: mod.WeaponAttachments.Top_50_mW_Green, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_top_50mw_green", rarity: 10, compatibleNameKeys: ["db12", "m277", "m4a1"] },
        { attachment: mod.WeaponAttachments.Top_50_mW_Blue, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_top_50mw_blue", rarity: 10, compatibleNameKeys: ["db12", "m277", "m4a1"] },
        { attachment: mod.WeaponAttachments.Top_120_mW_Blue, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_top_120mw_blue", rarity: 20, compatibleNameKeys: ["db12", "m277", "m4a1"] },
        // Right Lasers and lights
        { attachment: mod.WeaponAttachments.Right_5_mW_Red, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_5mw_red", rarity: 5, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "ak205", "sl9", "rpkm", "m123k",] },
        { attachment: mod.WeaponAttachments.Right_5_mW_Green, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_5mw_green", rarity: 10, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "ak205", "sl9", "rpkm", "m123k",] },
        { attachment: mod.WeaponAttachments.Right_50_mW_Green, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_50mw_green", rarity: 10, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "ak205", "sl9", "rpkm", "m123k",] },
        { attachment: mod.WeaponAttachments.Right_50_mW_Blue, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_50mw_blue", rarity: 15, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "ak205", "sl9", "rpkm", "m123k",] },
        { attachment: mod.WeaponAttachments.Right_120_mW_Blue, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_120mw_blue", rarity: 15, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "ak205", "sl9", "rpkm", "m123k",] },
        { attachment: mod.WeaponAttachments.Right_Flashlight, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_flashlight", rarity: 10, compatibleNameKeys: ["db12", "kord6p67", "m277", "usg90", "sl9", "m4a1",] },
        { attachment: mod.WeaponAttachments.Right_Laser_Light_Combo_Green, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_laser_light_combo_green", rarity: 20, compatibleNameKeys: ["kord6p67", "sl9"] },
        { attachment: mod.WeaponAttachments.Right_Laser_Light_Combo_Red, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_laser_light_combo_red", rarity: 20, compatibleNameKeys: ["sl9"] },
        { attachment: mod.WeaponAttachments.Right_VIS_IR_Light, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_vis_ir_light", rarity: 20, compatibleNameKeys: [] },
        // Left lasers
        { attachment: mod.WeaponAttachments.Left_5_mW_Red, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_left_5mw_red", rarity: 5, compatibleNameKeys: ["usg90"] },
        { attachment: mod.WeaponAttachments.Left_5_mW_Green, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_left_5mw_green", rarity: 10, compatibleNameKeys: ["usg90"] },
        { attachment: mod.WeaponAttachments.Left_50_mW_Green, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_left_50mw_green", rarity: 10, compatibleNameKeys: ["usg90"] },
        { attachment: mod.WeaponAttachments.Left_50_mW_Blue, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_left_50mw_blue", rarity: 15, compatibleNameKeys: ["usg90"] },
        { attachment: mod.WeaponAttachments.Left_120_mW_Blue, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_left_120mw_blue", rarity: 15, compatibleNameKeys: ["usg90"] },
        { attachment: mod.WeaponAttachments.Left_Flashlight, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_left_flashlight", rarity: 10, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "ak205", "rpkm", "m123k",] },
        { attachment: mod.WeaponAttachments.Left_VIS_IR_Light, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_left_vis_ir_light", rarity: 20, compatibleNameKeys: [] },
    ];

    static getAmmoAttachmentKey(item?: EquippedItem): string | undefined {
        const keys = item?.appliedUpgradeKeys;
        if (!keys || keys.length === 0) return undefined;
        for (const key of keys) {
            const def = Weapons.attachmentPool.find(a => a.nameKey === key);
            if (def?.slot === AttachmentSlot.Ammo) {
                return key;
            }
        }
        return undefined;
    }

    static getAmmoCaliberGroup(weaponNameKey?: string): string | undefined {
        if (!weaponNameKey) return undefined;
        switch (weaponNameKey) {
            case "es57":
            case "usg90":
                return "fn";
            case "g22":
            case "p18":
            case "sl9":
                return "9mm";
            case "m45a1":
                return "45";
            case "m44":
                return "44";
            case "m357":
                return "357";
            case "ak205":
            case "kord6p67":
                return "545";
            case "m123k":
            case "m4a1":
                return "556";
            case "rpkm":
                return "762";
            case "m121a2":
                return "762nato";
            case "m87a1":
            case "m1014":
            case "185ksk":
            case "db12":
                return "12g";
            case "m277":
                return "68";
            case "vz61":
                return "32acp";
            default:
                return undefined;
        }
    }

    static getAmmoDisplayKey(weaponNameKey?: string, ammoAttachmentKey?: string): string | undefined {
        if (!ammoAttachmentKey) return undefined;

        if (ammoAttachmentKey === "attachment_ammo_buckshot") return "12g_buckshot";
        if (ammoAttachmentKey === "attachment_ammo_flechette") return "12g_flechette";
        if (ammoAttachmentKey === "attachment_ammo_slug") return "12g_slug";

        const caliberGroup = Weapons.getAmmoCaliberGroup(weaponNameKey);
        if (!caliberGroup) return undefined;

        switch (ammoAttachmentKey) {
            case "attachment_ammo_fmj":
                return caliberGroup === "fn" ? "fn_fmj"
                    : caliberGroup === "9mm" ? "9mm_fmj"
                        : caliberGroup === "45" ? "45_acp_fmj"
                            : caliberGroup === "32acp" ? "32acp_fmj"
                                : caliberGroup === "44" ? "44_magnum_fmj"
                                    : caliberGroup === "357" ? "357_fmj"
                                        : caliberGroup === "545" ? "545_fmj"
                                            : caliberGroup === "556" ? "556_fmj"
                                                : caliberGroup === "68" ? "68_fmj"
                                                    : caliberGroup === "762" ? "762_fmj"
                                                        : caliberGroup === "762nato" ? "762nato_fmj"
                                                            : undefined;
            case "attachment_ammo_hollow_point":
                return caliberGroup === "fn" ? "fn_hp"
                    : caliberGroup === "9mm" ? "9mm_hp"
                        : caliberGroup === "45" ? "45_acp_hp"
                            : caliberGroup === "44" ? "44_magnum_hp"
                                : caliberGroup === "357" ? "357_hp"
                                    : caliberGroup === "545" ? "545_hp"
                                        : caliberGroup === "556" ? "556_hp"
                                            : caliberGroup === "68" ? "68_hp"
                                                : caliberGroup === "762" ? "762_hp"
                                                    : undefined;
            case "attachment_ammo_polymer_case":
                return caliberGroup === "fn" ? "fn_polymer_case"
                    : caliberGroup === "9mm" ? "9mm_polymer_case"
                        : caliberGroup === "45" ? "45_acp_polymer_case"
                            : caliberGroup === "44" ? "44_magnum_polymer_case"
                                : caliberGroup === "357" ? "357_polymer_case"
                                    : caliberGroup === "545" ? "545_polymer_case"
                                        : caliberGroup === "762" ? "762_polymer_case"
                                            : undefined;
            case "attachment_ammo_tungsten_core":
                return caliberGroup === "fn" ? "fn_tungsten_core"
                    : caliberGroup === "9mm" ? "9mm_tungsten_core"
                        : caliberGroup === "45" ? "45_acp_tungsten_core"
                            : caliberGroup === "44" ? "44_magnum_tungsten_core"
                                : caliberGroup === "357" ? "357_tungsten_core"
                                    : caliberGroup === "545" ? "545_tungsten_core"
                                        : caliberGroup === "556" ? "556_tungsten_core"
                                            : caliberGroup === "68" ? "68_tungsten_core"
                                                : caliberGroup === "762" ? "762_tungsten_core"
                                                    : caliberGroup === "762nato" ? "762nato_tungsten_core"
                                                        : undefined;
            case "attachment_ammo_synthetic_tip":
                return caliberGroup === "fn" ? "fn_synthetic_tip"
                    : caliberGroup === "9mm" ? "9mm_synthetic_tip"
                        : caliberGroup === "45" ? "45_acp_synthetic_tip"
                            : caliberGroup === "44" ? "44_magnum_synthetic_tip"
                                : caliberGroup === "357" ? "357_synthetic_tip"
                                    : caliberGroup === "545" ? "545_synthetic_tip"
                                        : caliberGroup === "556" ? "556_synthetic_tip"
                                            : caliberGroup === "762" ? "762_synthetic_tip"
                                                : caliberGroup === "762nato" ? "762nato_synthetic_tip"
                                                    : undefined;
            default:
                return undefined;
        }
    }

    static getAmmoDisplayKeyForItem(item?: EquippedItem): string | undefined {
        if (!item?.weapon) return undefined;
        const ammoKey = Weapons.getAmmoAttachmentKey(item);
        if (!ammoKey) return undefined;
        const weaponNameKey = item.nameKey ?? Weapons.GetWeaponNameKey(item.weapon);
        return Weapons.getAmmoDisplayKey(weaponNameKey, ammoKey);
    }

    static getAttachmentDisplayKey(item: EquippedItem, upgradeKey: string): string {
        const def = Weapons.attachmentPool.find(a => a.nameKey === upgradeKey);
        if (def?.slot !== AttachmentSlot.Ammo) {
            return upgradeKey;
        }

        const displayKey = Weapons.getAmmoDisplayKey(item.nameKey ?? Weapons.GetWeaponNameKey(item.weapon), upgradeKey);
        if (displayKey) {
            return displayKey;
        }

        return upgradeKey;
    }

    static getWeaponAmmoCombinedKey(item?: EquippedItem): string | undefined {
        if (!item?.weapon) return undefined;
        const weaponNameKey = item.nameKey ?? Weapons.GetWeaponNameKey(item.weapon);
        if (!weaponNameKey) return undefined;
        const ammoKey = Weapons.getAmmoAttachmentKey(item);
        if (!ammoKey) return undefined;
        return `weapon_ammo_${weaponNameKey}_${ammoKey}`;
    }

    static baseWeapons: PooledItemDef[] = [
        // Sidearm rarities: the semi-autos (p18/g22/es57/m45a1) now sit just under the "rare" band
        // (RARITY_RARE_THRESHOLD == 80), roughly equal to each other, in the high band that rolls
        // 1-2 attachments (see getAttachmentCountForWeapon). buildWeaponOption's clamp only holds a
        // card below RARITY_RARE_THRESHOLD while pkg.addedRarity stays under
        // ATTACHMENT_RARITY_RARE_THRESHOLD (15) -- so landing even 1-2 higher-rarity attachments is
        // enough for a roll to break through into the rare band on its own, same as any other
        // weapon. The revolvers (m357/m44) are pushed up into the legendary band
        // (>= RARITY_LEGENDARY_THRESHOLD == 95) instead, so they always read as legendary rolls
        // regardless of attachments (buildWeaponOption's tier-bypass clamp never suppresses a
        // weapon whose own base rarity already meets the threshold). Every sidearm card also
        // bundles an independently-rolled gadget (see Weapons.buildSidearmBundleOptions) -- the
        // two are never mutually exclusive.
        { nameKey: "p18", rarity: 70, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_P18, packageImage: Weapons.baseWeaponPackages["p18"] },
        { nameKey: "g22", rarity: 70, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_GGH_22, packageImage: Weapons.baseWeaponPackages["g22"] },
        // { nameKey: "vz61", rarity: 70, category: ItemPoolCategory.sidearm, item: mod.Weapons.Side, packageImage: Weapons.baseWeaponPackages["vz61"] },
        { nameKey: "es57", rarity: 72, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_ES_57, packageImage: Weapons.baseWeaponPackages["es57"] },
        { nameKey: "m45a1", rarity: 72, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_M45A1, packageImage: Weapons.baseWeaponPackages["m45a1"] },
        { nameKey: "m357", rarity: 96, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_M357_Trait, packageImage: Weapons.baseWeaponPackages["m357"] },
        { nameKey: "m44", rarity: 98, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_M44, packageImage: Weapons.baseWeaponPackages["m44"] },
        { nameKey: "m87a1", rarity: 40, category: ItemPoolCategory.primary, item: mod.Weapons.Shotgun_M87A1, packageImage: Weapons.baseWeaponPackages["m87a1"] },
        { nameKey: "m1014", rarity: 40, category: ItemPoolCategory.primary, item: mod.Weapons.Shotgun_M1014, packageImage: Weapons.baseWeaponPackages["m1014"] },
        // db12: pushed up into the rare band (RARITY_RARE_THRESHOLD == 80) by itself -- it's
        // meant to read as a rare shotgun on its own, not just on a lucky attachment roll (see
        // buildWeaponOption's tier-bypass clamp). Its only compatible attachments are Muzzle (max
        // 15), Ammo (max 25, Ammo_Slugs), and Rail (max 20, Top_120_mW_Blue) -- and it never rolls
        // more than 2 of them (rarity 85 sits in the "high" attachment-count bucket, see
        // getAttachmentCountForWeapon), so the best 2 it can ever land is 25+20 = 45. That stays
        // under ATTACHMENT_RARITY_LEGENDARY_THRESHOLD (48), so the legendary clamp always fires:
        // 85 + 45 clamps down to RARITY_LEGENDARY_THRESHOLD - 1 (94) on every roll, never crossing
        // into legendary.
        { nameKey: "db12", rarity: 85, category: ItemPoolCategory.primary, item: mod.Weapons.Shotgun_DB_12, packageImage: Weapons.baseWeaponPackages["db12"] },
        // 185ksk ("Saiga-12 KS-K"): same rare-band base as db12's old spot, but its attachment
        // pool is deeper -- Scope/Ammo/Magazine each cap at 25, and any 2 of those 3 land exactly
        // 50, which clears ATTACHMENT_RARITY_LEGENDARY_THRESHOLD (48). So its best-in-slot roll
        // (80 + 50 = 130) breaks through the legendary clamp entirely; anything less stays capped
        // at 94, same as db12.
        { nameKey: "185ksk", rarity: 80, category: ItemPoolCategory.primary, item: mod.Weapons.Shotgun__185KS_K, packageImage: Weapons.baseWeaponPackages["185ksk"] },
        { nameKey: "m4a1", rarity: 40, category: ItemPoolCategory.LMS, item: mod.Weapons.Carbine_M4A1, packageImage: Weapons.baseWeaponPackages["m4a1"] },
        { nameKey: "sl9", rarity: 40, category: ItemPoolCategory.LMS, item: mod.Weapons.SMG_SL9, packageImage: Weapons.baseWeaponPackages["sl9"] },
        { nameKey: "usg90", rarity: 40, category: ItemPoolCategory.LMS, item: mod.Weapons.SMG_USG_90, packageImage: Weapons.baseWeaponPackages["usg90"] },
        { nameKey: "m277", rarity: 30, category: ItemPoolCategory.LMS, item: mod.Weapons.Carbine_M277, packageImage: Weapons.baseWeaponPackages["m277"] },
        { nameKey: "rpkm", rarity: 70, category: ItemPoolCategory.LMS, item: mod.Weapons.LMG_RPKM, packageImage: Weapons.baseWeaponPackages["rpkm"] },
        { nameKey: "ak205", rarity: 70, category: ItemPoolCategory.LMS, item: mod.Weapons.Carbine_AK_205, packageImage: Weapons.baseWeaponPackages["ak205"] },
        { nameKey: "kord6p67", rarity: 80, category: ItemPoolCategory.LMS, item: mod.Weapons.AssaultRifle_KORD_6P67, packageImage: Weapons.baseWeaponPackages["kord6p67"] },
        { nameKey: "m123k", rarity: 80, category: ItemPoolCategory.LMS, item: mod.Weapons.LMG_M123K, packageImage: Weapons.baseWeaponPackages["m123k"] },
        // {nameKey: "m121a2", rarity: 90, category: ItemPoolCategory.LMS, item: mod.Weapons., packageImage: Weapons.baseWeaponPackages["m121a2"] },
        // BattlePickup weapons -- true endgame LMS rolls. Base rarity sits at/above
        // RARITY_LEGENDARY_THRESHOLD (95), so buildWeaponOption's tier-bypass clamp never
        // suppresses them: they read as legendary on every roll, same as the M357/M44 revolvers.
        // They have no entries in baseWeaponAttachments/attachmentPool -- battle pickups arrive
        // pre-built with no configurable attachments, same as how they'd be found on the map.
        { nameKey: "mprmg", rarity: 95, category: ItemPoolCategory.LMS, item: mod.Weapons.BattlePickup_MP_RMG },
        { nameKey: "rorschmk2", rarity: 97, category: ItemPoolCategory.LMS, item: mod.Weapons.BattlePickup_Rorsch_Mk_2_SMRW },
    ]

    static weaponAmmoProfiles: Record<string, WeaponAmmoProfile> = {
        // Sidearms
        g22: { baseMagSize: 15, reserveMags: 3, resupplyMags: 3 },
        // vz61: { baseMagSize: 10, reserveMags: 3, resupplyMags: 3 },
        p18: { baseMagSize: 17, reserveMags: 3, resupplyMags: 3 },
        es57: { baseMagSize: 20, reserveMags: 3, resupplyMags: 3 },
        m45a1: { baseMagSize: 7, reserveMags: 3, resupplyMags: 3 },
        m44: { baseMagSize: 6, reserveMags: 3, resupplyMags: 3 },
        m357: { baseMagSize: 8, reserveMags: 3, resupplyMags: 3 },

        // Shotguns (Primary)
        m87a1: { baseMagSize: 5, reserveMags: 4, resupplyMags: 4 },
        m1014: { baseMagSize: 7, reserveMags: 4, resupplyMags: 4 },
        "185ksk": { baseMagSize: 8, reserveMags: 4, resupplyMags: 4 },
        db12: { baseMagSize: 16, reserveMags: 3, resupplyMags: 3 },

        // LMS / Primary weapons
        usg90: { baseMagSize: 50, reserveMags: 3, resupplyMags: 3 },
        sl9: { baseMagSize: 30, reserveMags: 4, resupplyMags: 4 },
        m277: { baseMagSize: 20, reserveMags: 4, resupplyMags: 4 },
        ak205: { baseMagSize: 30, reserveMags: 4, resupplyMags: 4 },
        m4a1: { baseMagSize: 30, reserveMags: 4, resupplyMags: 4 },
        kord6p67: { baseMagSize: 30, reserveMags: 4, resupplyMags: 4 },
        rpkm: { baseMagSize: 30, reserveMags: 4, resupplyMags: 4 },
        m123k: { baseMagSize: 100, reserveMags: 3, resupplyMags: 3 },

    };

    static attachmentMagSizeOverrides: Record<string, number> = {
        attachment_magazine_5_shell_tube: 5,
        attachment_magazine_7_shell_tube: 7,
        attachment_magazine_4rnd_fast_mag: 4,
        attachment_magazine_7rnd_magazine: 7,
        attachment_magazine_11rnd_magazine: 11,
        attachment_magazine_6rnd_speedloader: 6,
        attachment_magazine_8rnd_magazine: 8,
        attachment_magazine_8rnd_moon_clip: 8,
        attachment_magazine_17rnd_magazine: 17,
        attachment_magazine_20rnd_magazine: 20,
        attachment_magazine_21rnd_magazine: 21,
        attachment_magazine_15rnd_magazine: 15,
        attachment_magazine_30rnd_magazine: 30,
        attachment_magazine_40rnd_fast_mag: 40,
        attachment_magazine_45rnd_fast_mag: 45,
        attachment_magazine_50rnd_magazine: 50,
        attachment_magazine_60rnd_magazine: 60,
        attachment_magazine_75rnd_drum: 75,
        attachment_magazine_200rnd_box: 200,
    };

    static maxThrowablesStandard: number = 2;
    static maxThrowablesAlpha: number = 1; // game gives you 3 anyway? lol wat

    static GetWeaponNameKey(weapon?: mod.Weapons): string | undefined {
        if (!weapon) return undefined;
        const match = Weapons.baseWeapons.find(w => w.item === weapon);
        return match?.nameKey;
    }

    static GetAmmoForItem(
        item: EquippedItem,
    ): { magSize: number; reserveMax: number; resupplyAmount: number } | undefined {
        if (!item.weapon) return undefined;
        const nameKey = item.nameKey || Weapons.GetWeaponNameKey(item.weapon);
        if (!nameKey) return undefined;
        const profile = Weapons.weaponAmmoProfiles[nameKey];
        if (!profile) return undefined;

        let magSize = profile.baseMagSize;
        if (item.appliedUpgradeKeys && item.appliedUpgradeKeys.length > 0) {
            let overrideMagSize: number | undefined;
            for (const key of item.appliedUpgradeKeys) {
                const override = Weapons.attachmentMagSizeOverrides[key];
                if (override !== undefined) {
                    overrideMagSize = Math.max(overrideMagSize ?? 0, override);
                }
            }
            if (overrideMagSize !== undefined) magSize = overrideMagSize;
        }

        const reserveMax = Math.max(0, magSize * profile.reserveMags);
        const resupplyAmount = Math.max(0, magSize * profile.resupplyMags);
        return { magSize, reserveMax, resupplyAmount };
    }

    static GetAmmoForGadget(item: EquippedItem): GadgetAmmoProfile | undefined {
        if (!item.gadget) return undefined;
        const nameKey = item.nameKey;
        if (!nameKey) return undefined;
        return Weapons.gadgetAmmoProfiles[nameKey];
    }

    static baseSurvivorGadgets: PooledItemDef[] = [
        // incendiary_grenade removed from the roll pool -- it's now a fixed standard item every
        // survivor gets (see GenerateLoadoutOptions' Throwable section).
        { nameKey: "prop_spawner_gadget", rarity: 5, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Misc_PortalGadget },
        { nameKey: "decoy_gadget", rarity: 20, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Misc_PortalGadget },
        { nameKey: "turret_gadget", rarity: 20, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Misc_PortalGadget },
        { nameKey: "ap_mine", rarity: 20, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Misc_Anti_Personnel_Mine },
        { nameKey: "supply_bag", rarity: 40, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Class_Supply_Bag },
        // { nameKey: "demo_charge", rarity: 60, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Misc_Demolition_Charge },
    ]

    // legendarySurvivorGadgets: the "legendary" gadget tier (rarity >= GADGET_RARITY_LEGENDARY_THRESHOLD).
    // Kept as its own list for easy future maintenance of the legendary tier. Folded into the
    // combined bundle pool alongside baseSurvivorGadgets' gadgets-category entries (see
    // GenerateLoadoutOptions/RerollSlotOptions' use of Weapons.buildSidearmBundleOptions) --
    // every sidearm card independently rolls one gadget from that combined pool.
    static legendarySurvivorGadgets: PooledItemDef[] = [
        { nameKey: "thermobaric_launcher", rarity: 70, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Launcher_Thermobaric_Grenade },
        { nameKey: "he_launcher", rarity: 70, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Launcher_High_Explosive },
        { nameKey: "incendiary_airburst", rarity: 70, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Launcher_Incendiary_Airburst },
        { nameKey: "incendiary_shotgun", rarity: 80, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Misc_Incendiary_Round_Shotgun },
    ]

    // gadgetAmmoProfiles: ammo catalog for gadgets with a finite charge count.
    // 'charge' entries fully top up in a single resupply interaction (resupplyAmount ==
    // maxCharges) -- true for every flat-charge gadget below, there's no partial-charge-reload
    // concept for those. 'chamber' entries (single-tube launchers, incendiary shotgun) mirror
    // weaponAmmoProfiles' mag+reserve split -- see GadgetChamberProfile above -- and also fully
    // top up their reserve in one interaction (reserveMags == resupplyMags). Gadgets not listed
    // here (prop spawner, decoy) are left on their existing engine-default initialization/resupply
    // path.
    //
    // ap_mine is capped at 1, not the 2 a real supply bag grants in vanilla: logging confirmed
    // SetInventoryAmmo hard-clamps Misc_Anti_Personnel_Mine's loaded ammo to 1 regardless of what
    // value is requested (Charges Requested:2 Actual:1, then Requested:1 Actual:0 on a second
    // attempt). Uncataloguing it to fall through to the native mod.Resupply(SupplyBag) path was
    // tried as a workaround on the theory that path isn't bound by the same ceiling, but in
    // practice it granted nothing at all -- so that fallback doesn't work for this gadget either
    // (or never did). Back on the explicit 'charge' profile, pinned to the one value confirmed to
    // actually land, so resupply correctly reports "already full" instead of silently failing.
    static gadgetAmmoProfiles: Record<string, GadgetAmmoProfile> = {
        // Single-round tube + 2 in reserve = 3 total, per launcher.
        thermobaric_launcher: { kind: 'chamber', magSize: 1, reserveMags: 2, resupplyMags: 2 },
        he_launcher: { kind: 'chamber', magSize: 1, reserveMags: 2, resupplyMags: 2 },
        incendiary_airburst: { kind: 'chamber', magSize: 1, reserveMags: 2, resupplyMags: 2 },
        // 5-round magazine + 5 in reserve = 10 total; player reloads (mag refill from reserve)
        // after their 5th consecutive shot, same as any other magazine-fed weapon.
        incendiary_shotgun: { kind: 'chamber', magSize: 5, reserveMags: 1, resupplyMags: 1 },
        ap_mine: { kind: 'charge', maxCharges: 1, resupplyAmount: 1 },
        // demo_charge: { kind: 'charge', maxCharges: 3, resupplyAmount: 3 },
    };

    static GetLoadoutFromPlayerProfile(playerProfile: PlayerProfile): Array<EquippedItem> | undefined {
        return playerProfile.chosenLoadoutThisRound;
    }

    // Weighted random pick by rarity, excluding specific attachments and occupied slots.
    static getRandomAttachmentFromRarity(
        attachments: Array<AttachmentDef>,
        exclude: Array<mod.WeaponAttachments> = [],
        usedSlots: Set<AttachmentSlot> = new Set()
    ): AttachmentDef | undefined {
        const filtered = attachments.filter(a =>
            !exclude.includes(a.attachment) && !usedSlots.has(a.slot)
        );
        if (filtered.length === 0) return undefined;

        const maxScale = 100;
        const totalWeight = filtered.reduce((sum, a) => sum + Math.max(1, maxScale - a.rarity + 1), 0);
        let randomValue = Math.random() * totalWeight;
        for (const attachment of filtered) {
            const weight = Math.max(1, maxScale - attachment.rarity + 1);
            randomValue -= weight;
            if (randomValue <= 0) return attachment;
        }
        return filtered[filtered.length - 1];
    }

    static getAttachmentCountForWeapon(weaponRarity: number): number {
        if (weaponRarity >= RARITY_LEGENDARY_THRESHOLD) return 2 + (Math.random() < 0.5 ? 1 : 0);
        if (weaponRarity >= RARITY_HIGH_THRESHOLD) return 1 + (Math.random() < 0.5 ? 1 : 0);
        if (weaponRarity >= RARITY_MEDIUM_THRESHOLD) return Math.random() < 0.5 ? 1 : 0;
        return 0;
    }

    static getAttachmentSlot(attachment: mod.WeaponAttachments): AttachmentSlot | undefined {
        const match = Weapons.attachmentPool.find(a => a.attachment === attachment);
        return match?.slot;
    }

    // Build a weapon package from base attachments plus random compatible upgrades.
    static buildWeaponPackageWithAttachments(weaponDef: PooledItemDef): { packageImage: mod.WeaponPackage; addedRarity: number; appliedUpgradeKeys: string[] } {
        const pkg = mod.CreateNewWeaponPackage();
        const baseAttachments = Weapons.baseWeaponAttachments[weaponDef.nameKey] || [];
        const compatibleAttachments = Weapons.attachmentPool.filter(a => a.compatibleNameKeys.includes(weaponDef.nameKey));

        const attachmentCount = Weapons.getAttachmentCountForWeapon(weaponDef.rarity);
        const chosen: mod.WeaponAttachments[] = [];
        const usedSlots = new Set<AttachmentSlot>();
        let addedRarity = 0;

        for (let i = 0; i < attachmentCount; i++) {
            const next = Weapons.getRandomAttachmentFromRarity(compatibleAttachments, chosen, usedSlots);
            if (!next) break;
            chosen.push(next.attachment);
            usedSlots.add(next.slot);
            addedRarity += next.rarity;
        }

        const chosenSlots = new Set<AttachmentSlot>();
        for (const attachment of chosen) {
            const slot = Weapons.getAttachmentSlot(attachment);
            if (slot !== undefined) chosenSlots.add(slot);
        }
        const baseFiltered = baseAttachments.filter(base => {
            const slot = Weapons.getAttachmentSlot(base);
            return slot === undefined || !chosenSlots.has(slot);
        });
        const attachmentsToApply = [...baseFiltered, ...chosen];
        const appliedUpgradeKeys: string[] = [];
        for (const attachment of attachmentsToApply) {
            const def = Weapons.attachmentPool.find(a => a.attachment === attachment);
            if (def?.nameKey && !appliedUpgradeKeys.includes(def.nameKey)) {
                appliedUpgradeKeys.push(def.nameKey);
            }
        }
        for (const attachment of attachmentsToApply) {
            mod.AddAttachmentToWeaponPackage(attachment, pkg);
        }

        return { packageImage: pkg, addedRarity, appliedUpgradeKeys };
    }

    static buildWeaponOption(weaponDef: PooledItemDef, slot: InventorySlot): EquippedItem {
        const pkg = Weapons.buildWeaponPackageWithAttachments(weaponDef);
        let totalRarity = weaponDef.rarity + pkg.addedRarity;
        // These clamps only ever hold a weapon BACK from a tier it hasn't earned yet -- they
        // never suppress a weapon whose own base `rarity` already qualifies on its own. That's
        // what lets the M357/M44 revolvers and the BattlePickup weapons read as legendary
        // "by itself" with no attachments needed, and the DB-12/185ksk read as rare "by itself"
        // even on a weak attachment roll.
        if (weaponDef.rarity < RARITY_RARE_THRESHOLD && pkg.addedRarity < ATTACHMENT_RARITY_RARE_THRESHOLD) {
            totalRarity = Math.min(totalRarity, RARITY_RARE_THRESHOLD - 1);
        }
        if (weaponDef.rarity < RARITY_LEGENDARY_THRESHOLD && pkg.addedRarity < ATTACHMENT_RARITY_LEGENDARY_THRESHOLD) {
            totalRarity = Math.min(totalRarity, RARITY_LEGENDARY_THRESHOLD - 1);
        }
        return {
            weapon: weaponDef.item as mod.Weapons,
            inventorySlot: slot,
            text: mod.stringkeys[`${weaponDef.nameKey}`] || weaponDef.nameKey,
            packageImage: pkg.packageImage,
            rarity: totalRarity,
            appliedUpgradeKeys: pkg.appliedUpgradeKeys,
            nameKey: weaponDef.nameKey,
        };
    }

    static buildWeaponOptions(weapons: Array<PooledItemDef>, slot: InventorySlot, count: number): EquippedItem[] {
        const options: EquippedItem[] = [];
        const normalizeUpgrades = (keys?: string[]) => (keys || []).slice().sort().join("|");
        for (let i = 0; i < count; i++) {
            const excludeNames = options.map(opt => opt.nameKey).filter((k): k is string => !!k);
            let attempt = 0;
            let chosen: EquippedItem | undefined;
            while (attempt < 5) {
                const next = Weapons.getRandomWeaponFromRarity(weapons, excludeNames);
                if (!next) break;
                // NOTE: this gadget-category special-case is now dead for every current call site
                // (Primary/LMS pools never contain gadget-category defs, and the sidearm slot uses
                // Weapons.buildSidearmBundleOptions instead). Left in place -- harmless, and it's a
                // cheap safety net if a gadget-category def ever ends up in a weapon pool again.
                const candidate = next.category === ItemPoolCategory.gadgets
                    ? Weapons.buildGadgetOption(next, slot)
                    : Weapons.buildWeaponOption(next, slot);
                const candidateKey = normalizeUpgrades(candidate.appliedUpgradeKeys);
                const isDuplicate = options.some(opt =>
                    opt.weapon === candidate.weapon && opt.gadget === candidate.gadget &&
                    normalizeUpgrades(opt.appliedUpgradeKeys) === candidateKey
                );
                if (!isDuplicate) {
                    chosen = candidate;
                    break;
                }
                attempt++;
            }
            if (!chosen) {
                const fallback = Weapons.getRandomWeaponFromRarity(weapons, excludeNames);
                if (!fallback) break;
                chosen = fallback.category === ItemPoolCategory.gadgets
                    ? Weapons.buildGadgetOption(fallback, slot)
                    : Weapons.buildWeaponOption(fallback, slot);
            }
            options.push(chosen);
        }
        return options;
    }

    static buildGadgetOption(gadgetDef: PooledItemDef, slot: InventorySlot): EquippedItem {
        return {
            gadget: gadgetDef.item as mod.Gadgets,
            inventorySlot: slot,
            text: mod.stringkeys[`${gadgetDef.nameKey}`] || gadgetDef.nameKey,
            packageImage: mod.CreateNewWeaponPackage(),
            rarity: gadgetDef.rarity,
            nameKey: gadgetDef.nameKey,
        };
    }

    // buildSidearmBundleOptions: builds `count` sidearm cards, each pairing an independently
    // rolled sidearm (deduped by nameKey+upgrades across the returned cards, same approach as
    // buildWeaponOptions) with an independently rolled gadget from gadgetPool (not deduped --
    // it's fine for two cards to roll the same gadget). The combined card's own .rarity is set
    // to the rounded average of the sidearm's rolled rarity and the bundled gadget's rarity, so
    // picking a card always grants both items together.
    static buildSidearmBundleOptions(sidearmDefs: PooledItemDef[], gadgetPool: PooledItemDef[], count: number): EquippedItem[] {
        const options: EquippedItem[] = [];
        const normalizeUpgrades = (keys?: string[]) => (keys || []).slice().sort().join("|");
        for (let i = 0; i < count; i++) {
            const excludeNames = options.map(opt => opt.nameKey).filter((k): k is string => !!k);
            let attempt = 0;
            let chosenSidearm: EquippedItem | undefined;
            while (attempt < 5) {
                const next = Weapons.getRandomWeaponFromRarity(sidearmDefs, excludeNames);
                if (!next) break;
                const candidate = Weapons.buildWeaponOption(next, InventorySlot.Sidearm);
                const candidateKey = normalizeUpgrades(candidate.appliedUpgradeKeys);
                const isDuplicate = options.some(opt =>
                    opt.weapon === candidate.weapon &&
                    normalizeUpgrades(opt.appliedUpgradeKeys) === candidateKey
                );
                if (!isDuplicate) {
                    chosenSidearm = candidate;
                    break;
                }
                attempt++;
            }
            if (!chosenSidearm) {
                const fallback = Weapons.getRandomWeaponFromRarity(sidearmDefs, excludeNames);
                if (!fallback) break;
                chosenSidearm = Weapons.buildWeaponOption(fallback, InventorySlot.Sidearm);
            }

            // Independently roll the bundled gadget half of this card.
            const gadgetDef = DEBUG_GUARANTEE_TURRET_GADGET
                ? gadgetPool.find(g => g.nameKey === "turret_gadget") ?? Weapons.getRandomWeaponFromRarity(gadgetPool)
                : Weapons.getRandomWeaponFromRarity(gadgetPool);
            const bundledGadget = gadgetDef ? Weapons.buildGadgetOption(gadgetDef, InventorySlot.Gadget) : undefined;

            const sidearmRarity = chosenSidearm.rarity ?? 0;
            const gadgetRarity = bundledGadget?.rarity ?? 0;
            options.push({
                ...chosenSidearm,
                bundledGadget,
                rarity: bundledGadget ? Math.round((sidearmRarity + gadgetRarity) / 2) : sidearmRarity,
            });
        }
        return options;
    }

    static BuildDefaultLoadoutFromOptions(options: SlotLoadoutOptions): Array<EquippedItem> {
        const items: Array<EquippedItem> = [];

        // Every sidearm card bundles an independently-rolled gadget (see
        // Weapons.buildSidearmBundleOptions) -- picking a sidearm always grants both.
        const sidearmSelection = options.sidearmOptions[0];
        if (sidearmSelection) {
            items.push(sidearmSelection);
            if (sidearmSelection.bundledGadget) {
                items.push({ ...sidearmSelection.bundledGadget, inventorySlot: InventorySlot.Gadget });
            }
        }

        if (options.throwable) items.push(options.throwable);
        if (options.primaryOptions[0]) items.push(options.primaryOptions[0]);
        if (options.lmsOptions[0]) items.push(options.lmsOptions[0]);
        return items;
    }

    static GenerateLoadoutOptions(playerProfile: PlayerProfile): SlotLoadoutOptions {
        // Primary Weapon (Shotugns for Final Five)
        const primaryWeapons = Weapons.baseWeapons.filter(w => w.category === ItemPoolCategory.primary);
        console.log(`GenerateLoadoutOptions | Primary weapon pool size: ${primaryWeapons.length}`);
        const primaryOptions = Weapons.buildWeaponOptions(primaryWeapons, InventorySlot.Primary, 3);
        if (primaryOptions.length === 0) {
            console.log(`GenerateLoadoutOptions ERROR | Failed to select primary weapon options`);
        }
        console.log(`GenerateLoadoutOptions | Primary options: ${primaryOptions.map(p => p.text).join(', ')}`);

        // LMS Weapon (for Last Man Standing)
        const lmsWeapons = Weapons.baseWeapons.filter(w => w.category === ItemPoolCategory.LMS);
        console.log(`GenerateLoadoutOptions | LMS weapon pool size: ${lmsWeapons.length}`);
        const lmsOptions = Weapons.buildWeaponOptions(lmsWeapons, InventorySlot.LMS, 3);
        if (lmsOptions.length === 0) {
            console.log(`GenerateLoadoutOptions ERROR | Failed to select LMS weapon options`);
        }
        console.log(`GenerateLoadoutOptions | LMS options: ${lmsOptions.map(p => p.text).join(', ')}`);

        // Sidearm Weapon -- every card also bundles an independently-rolled gadget from the
        // combined gadget pool (baseSurvivorGadgets' gadgets-category entries + all of
        // legendarySurvivorGadgets). See Weapons.buildSidearmBundleOptions.
        const sidearmWeapons = Weapons.baseWeapons.filter(w => w.category === ItemPoolCategory.sidearm);
        const bundleGadgetPool: PooledItemDef[] = [
            ...Weapons.baseSurvivorGadgets.filter(g => g.category === ItemPoolCategory.gadgets),
            ...Weapons.legendarySurvivorGadgets,
        ];
        console.log(`GenerateLoadoutOptions | Sidearm weapon pool size: ${sidearmWeapons.length}, bundle gadget pool size: ${bundleGadgetPool.length}`);
        const sidearmOptions = Weapons.buildSidearmBundleOptions(sidearmWeapons, bundleGadgetPool, 3);
        if (sidearmOptions.length === 0) {
            console.log(`GenerateLoadoutOptions ERROR | Failed to select sidearm weapon options`);
        }
        console.log(`GenerateLoadoutOptions | Sidearm options: ${sidearmOptions.map(p => p.text).join(', ')}`);

        // Throwable -- fixed standard equipment, no longer a roll (incendiary_grenade was
        // removed from baseSurvivorGadgets' throwables pool entirely).
        const throwable: EquippedItem = {
            gadget: mod.Gadgets.Throwable_Incendiary_Grenade,
            inventorySlot: InventorySlot.Throwable,
            text: mod.stringkeys.incendiary_grenade,
            packageImage: mod.CreateNewWeaponPackage(),
            rarity: 1,
            nameKey: "incendiary_grenade",
        };

        console.log(`GenerateLoadoutOptions | Generated slot options for player ${playerProfile.playerID}`);
        return {
            sidearmOptions,
            primaryOptions,
            lmsOptions,
            throwable,
        };
    }

    /**
     * Regenerates the weapon options for a single inventory slot (used by the loadout
     * re-roll button). Only the requested slot's pool is touched - the other
     * previously-generated slot options are left untouched.
     */
    static RerollSlotOptions(slot: InventorySlot, count: number = 3): EquippedItem[] {
        switch (slot) {
            case InventorySlot.Primary: {
                const primaryWeapons = Weapons.baseWeapons.filter(w => w.category === ItemPoolCategory.primary);
                return Weapons.buildWeaponOptions(primaryWeapons, InventorySlot.Primary, count);
            }
            case InventorySlot.LMS: {
                const lmsWeapons = Weapons.baseWeapons.filter(w => w.category === ItemPoolCategory.LMS);
                return Weapons.buildWeaponOptions(lmsWeapons, InventorySlot.LMS, count);
            }
            case InventorySlot.Sidearm: {
                // Rerolling the sidearm card inherently rerolls its bundled gadget too.
                const sidearmWeapons = Weapons.baseWeapons.filter(w => w.category === ItemPoolCategory.sidearm);
                const bundleGadgetPool: PooledItemDef[] = [
                    ...Weapons.baseSurvivorGadgets.filter(g => g.category === ItemPoolCategory.gadgets),
                    ...Weapons.legendarySurvivorGadgets,
                ];
                return Weapons.buildSidearmBundleOptions(sidearmWeapons, bundleGadgetPool, count);
            }
            // No standalone Gadget or Throwable slot exists to reroll -- gadgets always arrive
            // bundled with the sidearm card, and the throwable is fixed standard equipment.
            default:
                return [];
        }
    }

    static getRandomWeaponFromRarity(weapons: Array<PooledItemDef>, excludeNames: Array<string> = []): PooledItemDef | undefined {
        const filteredWeapons = weapons.filter(w => !excludeNames.includes(w.nameKey));

        if (filteredWeapons.length === 0) {
            console.log(`getRandomWeaponFromRarity WARNING | No weapons available after filtering. Original pool size: ${weapons.length}, Excluded: ${excludeNames}`);
            return undefined;
        }

        const maxScale = 100;
        const totalWeight = filteredWeapons.reduce((sum, w) => sum + Math.max(1, maxScale - w.rarity + 1), 0);
        let randomValue = Math.random() * totalWeight;
        for (const weapon of filteredWeapons) {
            const weight = Math.max(1, maxScale - weapon.rarity + 1);
            randomValue -= weight;
            if (randomValue <= 0) {
                return weapon;
            }
        }
        return filteredWeapons[filteredWeapons.length - 1];
    }

    /**
     * Returns equipment to apply based on player's saved loadout and current game stage.
     * This is the single source of truth for what a player should have equipped.
     * 
     * For survivors:
    * - Always: Sidearm, Gadget, Throwable from saved loadout
    * - If isLastManStanding: LMS weapon from saved loadout
    * - Else if isFinalFive: Primary weapon from saved loadout
     * 
     * For infected:
     * - Fixed gear: Sledgehammer, Assault Ladder, Throwable (Stun Grenade for Alpha, Flash Grenade for others)
     */
    static GetRoundLoadout(playerProfile: PlayerProfile): Array<EquippedItem> {
        const items: Array<EquippedItem> = [];
        const infected =
            playerProfile.isInfectedTeam
            || (mod.GetObjId(mod.GetTeam(playerProfile.player)) === mod.GetObjId(INFECTED_TEAM));
        const alphaInfected = playerProfile.isAlphaInfected;

        // Infected loadout: fixed gear, not using saved loadout
        if (infected) {
            items.push({
                gadget: mod.Gadgets.Melee_Sledgehammer,
                inventorySlot: InventorySlot.Gadget,
                text: mod.stringkeys.infected_weapon,
                packageImage: mod.CreateNewWeaponPackage(),
            });
            items.push({
                gadget: mod.Gadgets.Misc_Assault_Ladder,
                inventorySlot: InventorySlot.GadgetSecondary,
                text: mod.stringkeys.infected_gadget,
                packageImage: mod.CreateNewWeaponPackage(),
            });
            items.push({
                gadget: alphaInfected ? mod.Gadgets.Throwable_Stun_Grenade : mod.Gadgets.Throwable_Flash_Grenade,
                inventorySlot: InventorySlot.Throwable,
                text: alphaInfected ? mod.stringkeys.infected_throwable_stun : mod.stringkeys.flash_grenade,
                packageImage: mod.CreateNewWeaponPackage(),
            });
            return items;
        }

        // Survivor loadout: use saved loadout as source of truth
        let savedLoadout = Weapons.GetLoadoutFromPlayerProfile(playerProfile);
        if (!savedLoadout) {
            const options = Weapons.GenerateLoadoutOptions(playerProfile);
            savedLoadout = Weapons.BuildDefaultLoadoutFromOptions(options);
            playerProfile.chosenLoadoutThisRound = savedLoadout;
        }

        // Always equip: Sidearm, Gadget, Throwable
        const sidearm = savedLoadout.find(item => item.inventorySlot === InventorySlot.Sidearm);
        if (sidearm) items.push(sidearm);

        const gadget = savedLoadout.find(item => item.inventorySlot === InventorySlot.Gadget);
        if (gadget) items.push(gadget);

        const throwable = savedLoadout.find(item => item.inventorySlot === InventorySlot.Throwable)
            || savedLoadout.find(item => item.inventorySlot === InventorySlot.GadgetSecondary);
        if (throwable) {
            items.push(throwable.inventorySlot === InventorySlot.GadgetSecondary
                ? { ...throwable, inventorySlot: InventorySlot.Throwable }
                : throwable);
        }

        // Stage-based primary weapon assignment
        const isRoundRunning = GameHandler.gameState === GameState.GameRoundIsRunning;
        if (DEBUG_FORCE_RORSCH) {
            // Bypasses LMS/Final Five gating entirely -- every survivor gets the Rorsch as their
            // Primary the instant they spawn, so RorschRailgun's fire-detection/splash-damage/
            // impulse can be tested without having to actually reach Last Man Standing.
            const rorschDef = Weapons.baseWeapons.find(w => w.nameKey === "rorschmk2");
            if (rorschDef) {
                items.push(Weapons.buildWeaponOption(rorschDef, InventorySlot.Primary));
            }
        } else if (isRoundRunning) {
            if (playerProfile.isLastManStanding) {
                const lmsWeapon = savedLoadout.find(item => item.inventorySlot === InventorySlot.LMS);
                if (lmsWeapon) {
                    // Grant LMS weapon in Primary slot
                    items.push({ ...lmsWeapon, inventorySlot: InventorySlot.Primary });
                }
            } else if (playerProfile.isFinalFive) {
                const primaryWeapon = savedLoadout.find(item => item.inventorySlot === InventorySlot.Primary);
                if (primaryWeapon) items.push(primaryWeapon);
            }
        }
        return items;
    }

}

////////////////////////////////////////////////////////////////
///////-------------- USER INTERFACE --------------------///////
////////////////////////////////////////////////////////////////

class UI {
    static uniqueNameNumber: number = 0;
    static allyBlue = mod.CreateVector(0.259, 0.839, 0.941);
    static enemyOrange = mod.CreateVector(0.996, 0.482, 0.329);
    static battlefieldWhite = mod.CreateVector(0.882, 0.918, 0.941);
    static battlefieldWhiteAlt = mod.CreateVector(0.820, 0.843, 0.847);
    static battlefieldRed = mod.CreateVector(1, 0.513, 0.382);
    static battlefieldRedBg = mod.CreateVector(0.33, 0.106, 0.075);
    static battlefieldBlue = mod.CreateVector(0.369, 0.671, 0.859);
    static battlefieldBlueBg = mod.CreateVector(0.114, 0.353, 0.478);
    static battlefieldGrey = mod.CreateVector(0.616, 0.635, 0.647);
    static battlefieldGreyBg = mod.CreateVector(0.106, 0.137, 0.169);
    static battlefieldYellow = mod.CreateVector(0.961, 0.953, 0.51);
    static battlefieldYellowBg = mod.CreateVector(0.741, 0.729, 0.031);
    static blackColor = mod.CreateVector(0, 0, 0); // pure black
    static darkAmberColor = mod.CreateVector(0.29, 0.157, 0.012);
    static gradientAlpha: number = 0.04;
    static showingAlert: boolean = false;

    static notificationVerticalGap = 1;
    static areaTriggerNotificationY = 60;
    static areaNotificationHeight = 40;
    static survivorNotificationY = UI.areaTriggerNotificationY + UI.areaNotificationHeight + UI.notificationVerticalGap;
    static survivorNotificationHeight = 25;
    static ammoFeedbackY = UI.areaTriggerNotificationY + UI.areaNotificationHeight + UI.notificationVerticalGap;
    static ammoFeedbackHeight = 25;
    static alphaFeedbackY = UI.areaTriggerNotificationY + UI.notificationVerticalGap;
    static alphaFeedbackHeight = 40;
    static alphaSelectionY = UI.areaTriggerNotificationY + UI.notificationVerticalGap;
    static alphaSelectionHeight = 40;
    static gameStateNotificationY = 120 + UI.notificationVerticalGap; // 

    static UpdateUI(widget: mod.UIWidget | undefined, message?: mod.Message, show?: boolean, size?: mod.Vector): void {
        widget && message && mod.SetUITextLabel(widget, message);
        widget && size && mod.SetUIWidgetSize(widget, size);
        widget && show != undefined && mod.SetUIWidgetVisible(widget, show);
    }

    static personalAlertDurationSeconds = 3;
    static personalAlertContainerWidth = 420;
    static personalAlertContainerHeight = 40;
    static personalAlertTokens: Map<string, number> = new Map();

    private static GetPersonalAlertPrefix(alertKind: 'you' | 'infectedBy'): string {
        return alertKind === 'you' ? 'you_infected_alert' : 'infected_by_alert';
    }

    private static GetPersonalAlertTokenKey(playerID: number, alertKind: 'you' | 'infectedBy'): string {
        return `${alertKind}:${playerID}`;
    }

    private static BumpPersonalAlertToken(playerID: number, alertKind: 'you' | 'infectedBy'): number {
        const key = UI.GetPersonalAlertTokenKey(playerID, alertKind);
        const next = (UI.personalAlertTokens.get(key) ?? 0) + 1;
        UI.personalAlertTokens.set(key, next);
        return next;
    }

    private static IsPersonalAlertTokenCurrent(playerID: number, alertKind: 'you' | 'infectedBy', token: number): boolean {
        const key = UI.GetPersonalAlertTokenKey(playerID, alertKind);
        return (UI.personalAlertTokens.get(key) ?? 0) === token;
    }

    private static UpdatePersonalInfectionAlert(
        playerProfile: PlayerProfile,
        infectedSubject: 'you' | 'infectedBy',
        message: mod.Message | undefined,
        show: boolean,
        bgColor: mod.Vector = UI.battlefieldRedBg,
    ): void {
        const widget = infectedSubject === 'you' ? playerProfile.youInfectedWidget : playerProfile.infectedByWidget;
        if (!widget) return;

        const prefix = UI.GetPersonalAlertPrefix(infectedSubject);
        const textWidget = mod.FindUIWidgetWithName(`${prefix}_text_${playerProfile.playerID}`) as mod.UIWidget;
        const backgroundWidget = mod.FindUIWidgetWithName(`${prefix}_bgColor_${playerProfile.playerID}`) as mod.UIWidget;

        if (textWidget && message) {
            mod.SetUITextLabel(textWidget, message);
            mod.SetUITextColor(textWidget, UI.battlefieldWhite);
        }
        if (backgroundWidget) {
            mod.SetUIWidgetBgColor(backgroundWidget, bgColor);
        }

        mod.SetUIWidgetDepth(widget, mod.UIDepth.AboveGameUI);
        mod.SetUIWidgetVisible(widget, show);
    }

    static HidePersonalInfectionAlerts(playerProfile: PlayerProfile, cancelTimers: boolean = true): void {
        if (cancelTimers) {
            UI.BumpPersonalAlertToken(playerProfile.playerID, 'you');
            UI.BumpPersonalAlertToken(playerProfile.playerID, 'infectedBy');
        }
        UI.UpdatePersonalInfectionAlert(playerProfile, 'you', undefined, false);
        UI.UpdatePersonalInfectionAlert(playerProfile, 'infectedBy', undefined, false);
    }

    static async ShowYouInfectedAlert(playerProfile: PlayerProfile, eventOtherPlayer: mod.Player) {
        const message = MakeMessage(mod.stringkeys.infected_on_kill, eventOtherPlayer);
        if (playerProfile.alphaFeedbackBeingShown) {
            UI.HidePersonalInfectionAlerts(playerProfile, true);
            return;
        }

        const token = UI.BumpPersonalAlertToken(playerProfile.playerID, 'you');
        UI.UpdatePersonalInfectionAlert(playerProfile, 'you', message, true, UI.battlefieldRedBg);
        await mod.Wait(UI.personalAlertDurationSeconds);

        if (!UI.IsPersonalAlertTokenCurrent(playerProfile.playerID, 'you', token)) return;
        if (playerProfile.alphaFeedbackBeingShown) return;
        UI.UpdatePersonalInfectionAlert(playerProfile, 'you', undefined, false);
    }

    static async ShowInfectedByAlert(playerProfile: PlayerProfile, eventOtherPlayer: mod.Player) {
        const message = MakeMessage(mod.stringkeys.infected_on_death, eventOtherPlayer);
        if (playerProfile.alphaFeedbackBeingShown) {
            UI.HidePersonalInfectionAlerts(playerProfile, true);
            return;
        }

        const token = UI.BumpPersonalAlertToken(playerProfile.playerID, 'infectedBy');
        UI.UpdatePersonalInfectionAlert(playerProfile, 'infectedBy', message, true, UI.battlefieldRedBg);
        await mod.Wait(UI.personalAlertDurationSeconds);

        if (!UI.IsPersonalAlertTokenCurrent(playerProfile.playerID, 'infectedBy', token)) return;
        if (playerProfile.alphaFeedbackBeingShown) return;
        UI.UpdatePersonalInfectionAlert(playerProfile, 'infectedBy', undefined, false);
    }

    private static CreatePersonalInfectionAlert(
        player: mod.Player,
        playerID: number,
        infectedSubject: 'you' | 'infectedBy',
        message: mod.Message,
        bgColor: mod.Vector = UI.battlefieldRedBg,
    ): mod.UIWidget | undefined {
        const containerWidth = UI.personalAlertContainerWidth;
        const containerHeight = UI.personalAlertContainerHeight;
        const xOffset = (1024 / 2 - containerWidth / 2); // mirror area-notification position on the right side
        const rootName = `${UI.GetPersonalAlertPrefix(infectedSubject)}_${playerID}`;

        return ParseUI({
            type: 'Container',
            name: rootName,
            position: [xOffset, UI.areaTriggerNotificationY, 5],
            size: [containerWidth, containerHeight],
            anchor: mod.UIAnchor.TopCenter,
            bgFill: mod.UIBgFill.Blur,
            bgColor: UI.battlefieldGrey,
            bgAlpha: 1,
            depth: mod.UIDepth.AboveGameUI,
            visible: false,
            playerId: player,
            children: [
                {
                    type: 'Container',
                    name: `${UI.GetPersonalAlertPrefix(infectedSubject)}_bgColor_${playerID}`,
                    position: [0, 0, 0],
                    size: [containerWidth - 1, containerHeight - 1, 0],
                    anchor: mod.UIAnchor.Center,
                    bgFill: mod.UIBgFill.Solid,
                    bgColor,
                    bgAlpha: 0.1,
                },
                {
                    type: 'Text',
                    name: `${UI.GetPersonalAlertPrefix(infectedSubject)}_text_${playerID}`,
                    position: [0, 0, 5],
                    size: [containerWidth, containerHeight],
                    anchor: mod.UIAnchor.Center,
                    textAnchor: mod.UIAnchor.Center,
                    textSize: 18,
                    bgAlpha: 0,
                    textColor: UI.battlefieldWhite,
                    textLabel: message,
                },
            ],
        });
    }

    static CreateInfectedByAlert(playerProfile: PlayerProfile): mod.UIWidget | undefined {
        return UI.CreatePersonalInfectionAlert(
            playerProfile.player,
            playerProfile.playerID,
            'infectedBy',
            MakeMessage(mod.stringkeys.infected_on_death, playerProfile.player),
            UI.battlefieldRedBg,
        );
    }

    static CreateYouInfectedAlert(playerProfile: PlayerProfile): mod.UIWidget | undefined {
        return UI.CreatePersonalInfectionAlert(
            playerProfile.player,
            playerProfile.playerID,
            'you',
            MakeMessage(mod.stringkeys.infected_on_kill, playerProfile.player),
            UI.battlefieldRedBg,
        );
    }

    /* Rotating hints and tips for survivors */
    static CreatePlayerAreaNotificationWidget(
        player: mod.Player,
        playerID: number,
        message: mod.Message = mod.Message(mod.stringkeys.survivor_area_warning),
        showIcon: mod.UIImageType = mod.UIImageType.QuestionMark
    ): mod.UIWidget | undefined {
        const containerWidth = 420;
        const containerHeight = 40;
        const iconSize = 35;

        const xOffset = -(1024 / 2 - containerWidth / 2); // -287: aligns left edge with the scoreboard
        // root widget
        // grey base, background color controlled by the container's child
        return ParseUI({
            type: "Container",
            name: `player_area_notification_${playerID}`,
            position: [xOffset, UI.areaTriggerNotificationY, 5],
            size: [containerWidth, containerHeight],
            anchor: mod.UIAnchor.TopCenter,
            bgFill: mod.UIBgFill.Blur,
            bgColor: UI.battlefieldGrey,
            bgAlpha: 1,
            playerId: player,
            children: [
                {
                    type: "Container",
                    name: `player_area_notification_bgColor_${playerID}`,
                    position: [0, 0, 0],
                    size: [containerWidth - 1, containerHeight - 1, 0],
                    anchor: mod.UIAnchor.Center,
                    bgFill: mod.UIBgFill.Solid,
                    bgColor: UI.battlefieldBlueBg,
                    bgAlpha: 0.1,
                },
                {
                    type: "Text",
                    name: `player_area_notification_text_${playerID}`,
                    position: [0, 0, 5],
                    size: [containerWidth, containerHeight],
                    anchor: mod.UIAnchor.Center,
                    textAnchor: mod.UIAnchor.Center,
                    textSize: 18,
                    bgAlpha: 0,
                    textColor: UI.battlefieldWhite,
                    textLabel: message,
                },
                {
                    type: "Image",
                    name: `player_area_notification_icon_${playerID}`,
                    position: [0, 0, 5],
                    size: [iconSize, iconSize, 0],
                    anchor: mod.UIAnchor.CenterLeft,
                    imageType: showIcon,
                    imageColor: UI.battlefieldYellow,
                    imageAlpha: 1,
                    bgAlpha: 0,
                }
            ]
        });

    }

    static UpdatePlayerAreaNotification(
        playerProfile: PlayerProfile,
        message: mod.Message,
        showIcon: mod.UIImageType = mod.UIImageType.QuestionMark,
        bgColor: mod.Vector = UI.battlefieldBlueBg,
    ) {
        if (!playerProfile.playerAreaNotificationWidget) return;

        const textWidget = mod.FindUIWidgetWithName(`player_area_notification_text_${playerProfile.playerID}`) as mod.UIWidget;
        const imageWidget = mod.FindUIWidgetWithName(`player_area_notification_icon_${playerProfile.playerID}`) as mod.UIWidget;
        const backgroundWidget = mod.FindUIWidgetWithName(`player_area_notification_bgColor_${playerProfile.playerID}`) as mod.UIWidget;

        if (textWidget) {
            mod.SetUITextLabel(textWidget, message);
            mod.SetUITextColor(textWidget, UI.battlefieldWhite);
        }
        if (imageWidget) {
            mod.SetUIImageType(imageWidget, showIcon);
        }

        mod.SetUIWidgetBgColor(backgroundWidget, bgColor);
        mod.SetUIWidgetDepth(playerProfile.playerAreaNotificationWidget, mod.UIDepth.AboveGameUI);
        mod.SetUIWidgetVisible(playerProfile.playerAreaNotificationWidget, true);
    }

    static CreateLastManStandingBuffWidget(
        player: mod.Player,
        playerID: number,
        lineIndex: number,
        message: mod.Message,
    ): mod.UIWidget | undefined {
        const containerWidth = 450;
        const containerHeight = 24;
        const iconSize = 30;
        const textOffset = 30;
        const xOffset = -(1024 / 2 - containerWidth / 2);
        const yOffset = UI.survivorNotificationY + (lineIndex * (containerHeight + UI.notificationVerticalGap));

        return ParseUI({
            type: "Container",
            name: `lms_buff_line_${playerID}_${lineIndex}`,
            position: [xOffset, yOffset, 0],
            size: [containerWidth, containerHeight],
            anchor: mod.UIAnchor.TopCenter,
            bgAlpha: 0,
            depth: mod.UIDepth.AboveGameUI,
            playerId: player,
            children: [
                {
                    type: "Image",
                    name: `lms_buff_line_icon_${playerID}_${lineIndex}`,
                    position: [0, 0, 0],
                    size: [iconSize, iconSize, 0],
                    anchor: mod.UIAnchor.CenterLeft,
                    imageType: mod.UIImageType.SpawnBeacon,
                    imageColor: UI.battlefieldYellow,
                    imageAlpha: 1,
                    bgAlpha: 0,
                },
                {
                    type: "Text",
                    name: `lms_buff_line_text_${playerID}_${lineIndex}`,
                    position: [textOffset, 0, 0],
                    size: [containerWidth - textOffset, containerHeight],
                    anchor: mod.UIAnchor.CenterLeft,
                    textAnchor: mod.UIAnchor.CenterLeft,
                    textSize: 16,
                    bgAlpha: 0,
                    textColor: UI.battlefieldWhite,
                    textLabel: message,
                },
            ],
        });
    }

    static UpdateLastManStandingBuffWidget(playerID: number, lineIndex: number, message: mod.Message): void {
        const widget = mod.FindUIWidgetWithName(`lms_buff_line_text_${playerID}_${lineIndex}`) as mod.UIWidget;
        const container = mod.FindUIWidgetWithName(`lms_buff_line_${playerID}_${lineIndex}`) as mod.UIWidget;
        if (widget) {
            mod.SetUITextLabel(widget, message);
            mod.SetUITextColor(widget, UI.battlefieldWhite);
        }
        if (container) {
            mod.SetUIWidgetBgAlpha(container, 0);
            mod.SetUIWidgetDepth(container, mod.UIDepth.AboveGameUI);
            mod.SetUIWidgetVisible(container, true);
        }
    }

    static CreateAlphaBuffWidget(
        player: mod.Player,
        playerID: number,
        lineIndex: number,
        message: mod.Message,
    ): mod.UIWidget | undefined {
        const containerWidth = 450;
        const containerHeight = 24;
        const iconSize = 30;
        const textOffset = 30;
        const xOffset = -(1024 / 2 - containerWidth / 2);
        const yOffset = UI.ammoFeedbackY + (lineIndex * (containerHeight + UI.notificationVerticalGap));

        return ParseUI({
            type: "Container",
            name: `alpha_buff_line_${playerID}_${lineIndex}`,
            position: [xOffset, yOffset, 0],
            size: [containerWidth, containerHeight],
            anchor: mod.UIAnchor.TopCenter,
            bgAlpha: 0,
            depth: mod.UIDepth.AboveGameUI,
            playerId: player,
            children: [
                {
                    type: "Image",
                    name: `alpha_buff_line_icon_${playerID}_${lineIndex}`,
                    position: [0, 0, 0],
                    size: [iconSize, iconSize, 0],
                    anchor: mod.UIAnchor.CenterLeft,
                    imageType: mod.UIImageType.SpawnBeacon,
                    imageColor: UI.battlefieldRedBg,
                    imageAlpha: 1,
                    bgAlpha: 0,
                },
                {
                    type: "Text",
                    name: `alpha_buff_line_text_${playerID}_${lineIndex}`,
                    position: [textOffset, 0, 0],
                    size: [containerWidth - textOffset, containerHeight],
                    anchor: mod.UIAnchor.CenterLeft,
                    textAnchor: mod.UIAnchor.CenterLeft,
                    textSize: 16,
                    bgAlpha: 0,
                    textColor: UI.battlefieldWhite,
                    textLabel: message,
                },
            ],
        });
    }

    static UpdateAlphaBuffWidget(playerID: number, lineIndex: number, message: mod.Message): void {
        const widget = mod.FindUIWidgetWithName(`alpha_buff_line_text_${playerID}_${lineIndex}`) as mod.UIWidget;
        const container = mod.FindUIWidgetWithName(`alpha_buff_line_${playerID}_${lineIndex}`) as mod.UIWidget;
        if (widget) {
            mod.SetUITextLabel(widget, message);
            mod.SetUITextColor(widget, UI.battlefieldWhite);
        }
        if (container) {
            mod.SetUIWidgetBgAlpha(container, 0);
            mod.SetUIWidgetDepth(container, mod.UIDepth.AboveGameUI);
            mod.SetUIWidgetVisible(container, true);
        }
    }

    // A single stacked resupply-notification bar (see PlayerProfile.ShowStackedResupplyFeedback).
    // Multiple lines are stacked below UI.ammoFeedbackY, one per item that gained ammo, using the
    // same lineIndex-based vertical offset convention as CreateAlphaBuffWidget above.
    static CreateResupplyFeedbackLine(
        player: mod.Player,
        playerID: number,
        lineIndex: number,
        message: mod.Message,
    ): mod.UIWidget | undefined {
        const containerWidth = 300;
        const containerHeight = UI.ammoFeedbackHeight;
        const yOffset = UI.ammoFeedbackY + (lineIndex * (containerHeight + UI.notificationVerticalGap));

        const widget = ParseUI({
            type: "Text",
            name: `resupply_feedback_line_${playerID}_${lineIndex}`,
            position: [0, yOffset, 0],
            size: [containerWidth, containerHeight],
            anchor: mod.UIAnchor.TopCenter,
            textAnchor: mod.UIAnchor.Center,
            textLabel: message,
            textSize: 18,
            textColor: UI.blackColor,
            bgFill: mod.UIBgFill.Solid,
            bgColor: UI.battlefieldWhite,
            bgAlpha: 0.9,
            depth: mod.UIDepth.AboveGameUI,
            playerId: player,
        }) as mod.UIWidget;

        return widget;
    }

}


class ScoreboardUI {

    private rootWidget: mod.UIWidget | undefined;

    static instances: ScoreboardUI[] = [];
    _PlayerProfile: PlayerProfile;

    survivorsCountWidget: mod.UIWidget | undefined;
    infectedCountWidget: mod.UIWidget | undefined;
    playerCountBox: mod.UIWidget | undefined;
    roundTimeWidget: mod.UIWidget | undefined;
    currentRoundWidget: mod.UIWidget | undefined;
    survivors: number = 0;
    infected: number = 0;
    minutes: number = 0;
    sec1: number = 0;
    sec2: number = 0;
    containerWidth = 1024;
    containerHeight = 50;
    clockWidgetWidth = 150;
    iconSize = 100;
    padding = 4;
    countdownTimerSize: number = 26;
    activeTabBgColor = UI.battlefieldGrey;
    blueTeamBgColor = UI.battlefieldBlueBg;
    redTeamBgColor = UI.battlefieldRedBg;
    teamIndicationWidget?: mod.UIWidget[];
    isUIVisible = false;

    constructor(PlayerProfile: PlayerProfile) {
        this._PlayerProfile = PlayerProfile;
        this.rootWidget = this.CreateUI() as mod.UIWidget;
        ScoreboardUI.instances.push(this);
    }

    async Show() {
        if (!this.rootWidget) {
            this.rootWidget = this.CreateUI() as mod.UIWidget;
            console.log(`Building Scoreboard. Marking widget as visible`);
            mod.SetUIWidgetDepth(this.rootWidget, mod.UIDepth.AboveGameUI);
            mod.SetUIWidgetVisible(this.rootWidget, true);
        } else {
            if (this.rootWidget) {
                mod.SetUIWidgetVisible(this.rootWidget, true);
            }
        }
    }

    /**
     * - Updates the Team Counts for all instances of Scoreboard to all players.
     * Should only be used to broadcast global team changes.
     * @param team string representation of the team to target. "survivors", "infected", or "both"
     */
    static GlobalUpdate(team: TeamNameString) {
        for (const instance of ScoreboardUI.instances) {
            instance.UpdateTeamCount(team);
        }
    }

    static GlobalClose() {
        for (const instance of ScoreboardUI.instances) {
            instance.Close();
        }
    }

    static GlobalClock(minutes: number, sec1: number, sec2: number) {
        for (const instance of ScoreboardUI.instances) {
            instance.clock(minutes, sec1, sec2);
        }
    }

    Delete() {
        if (this.rootWidget) {
            mod.DeleteUIWidget(this.rootWidget)
        }

        const i = ScoreboardUI.instances.indexOf(this);
        if (i !== -1) ScoreboardUI.instances.splice(i, 1);
    }

    UpdateTeamCount(teamName: string, remove?: boolean) {
        if (!this.survivorsCountWidget || !this.infectedCountWidget || !this.currentRoundWidget)
            return

        this.Show();
        console.log(`'UPDATING SCOREBOARD' | ScoreboardUI.update() for ${teamName} | Survivors: ${GameHandler.survivorsCount} | Infected: ${GameHandler.infectedCount}`);

        mod.SetUITextLabel(
            this.survivorsCountWidget,
            mod.Message(mod.stringkeys.survivors_remaining, GameHandler.survivorsCount)
        );
        mod.SetUITextLabel(
            this.infectedCountWidget,
            mod.Message(mod.stringkeys.infected_number, GameHandler.infectedCount)
        );
        mod.SetUITextLabel(
            this.currentRoundWidget,
            mod.Message(mod.stringkeys.current_round, GameHandler.currentRound, GAME_ROUND_LIMIT)
        );

    }

    Close() {
        if (this.rootWidget) {
            mod.SetUIWidgetVisible(this.rootWidget, false);
        }
    }


    async clock(minutes: number, sec1: number, sec2: number) {
        this.minutes = minutes;
        this.sec1 = sec1;
        this.sec2 = sec2;

        if (!this.roundTimeWidget) return;
        mod.SetUITextLabel(this.roundTimeWidget,
            mod.Message(mod.stringkeys.gametime, this.minutes, this.sec1, this.sec2)
        );
        // fancy juice to the countdown timer
        if (minutes == 0 && sec1 == 0 && sec2 <= 9) {
            mod.SetUITextSize(this.roundTimeWidget, 34);
            mod.SetUITextColor(this.roundTimeWidget, UI.battlefieldRedBg);
            await mod.Wait(0.1);
            mod.SetUITextColor(this.roundTimeWidget, UI.battlefieldRed);
            mod.SetUITextSize(this.roundTimeWidget, this.countdownTimerSize);
        } else {
            mod.SetUITextColor(this.roundTimeWidget, UI.battlefieldWhiteAlt);
        }
    }

    CreateUI() {
        this.rootWidget = ParseUI({
            type: "Container",
            size: [this.containerWidth, this.containerHeight],
            position: [0, 5],
            anchor: mod.UIAnchor.TopCenter,
            bgFill: mod.UIBgFill.Blur,
            bgColor: this.activeTabBgColor,
            depth: mod.UIDepth.AboveGameUI,
            bgAlpha: 1,
            playerId: this._PlayerProfile.player,
            children: [
                {
                    type: "Container",
                    name: `time_remaining_${this._PlayerProfile.playerID}`,
                    position: [0, 0, 0],
                    size: [100, this.containerHeight],
                    anchor: mod.UIAnchor.Center,
                    bgFill: mod.UIBgFill.Blur,
                    bgColor: this.activeTabBgColor,
                    bgAlpha: 1,
                },
                {
                    type: "Container",
                    name: `red_team_container_${this._PlayerProfile.playerID}`,
                    position: [0, 0, 0],
                    size: [(this.containerWidth / 2) - 50, this.containerHeight - this.padding],
                    anchor: this._PlayerProfile.isInfectedTeam ? mod.UIAnchor.CenterLeft : mod.UIAnchor.CenterRight,
                    bgFill: mod.UIBgFill.Solid,
                    bgColor: this.redTeamBgColor,
                    bgAlpha: 0.1,
                },
                {
                    type: "Container",
                    position: [0, 0, 0],
                    name: `blue_team_container_${this._PlayerProfile.playerID}`,
                    size: [(this.containerWidth / 2) - 50, this.containerHeight - this.padding],
                    anchor: this._PlayerProfile.isInfectedTeam ? mod.UIAnchor.CenterRight : mod.UIAnchor.CenterLeft,
                    bgFill: mod.UIBgFill.Solid,
                    bgColor: this.blueTeamBgColor,
                    bgAlpha: 0.1,
                },
            ]
        });
        if (!this.rootWidget) return;
        this.survivorsCountWidget = ParseUI({
            type: "Text",
            name: `survivors_widget_${this._PlayerProfile.playerID}`,
            parent: mod.FindUIWidgetWithName(`blue_team_container_${this._PlayerProfile.playerID}`),
            textSize: 24,
            position: [0, 0, 0],
            size: [150, this.containerHeight],
            anchor: mod.UIAnchor.Center,
            textAnchor: mod.UIAnchor.Center,
            bgAlpha: 0,
            textLabel: mod.Message(mod.stringkeys.survivors_remaining, this.survivors)
        })
        this.infectedCountWidget = ParseUI({
            type: "Text",
            name: `infected_widget_${this._PlayerProfile.playerID}`,
            parent: mod.FindUIWidgetWithName(`red_team_container_${this._PlayerProfile.playerID}`),
            textSize: 24,
            position: [0, 0, 0],
            size: [150, this.containerHeight],
            anchor: mod.UIAnchor.Center,
            textAnchor: mod.UIAnchor.Center,
            bgAlpha: 0,
            textLabel: mod.Message(mod.stringkeys.infected_number, this.infected)
        })
        this.roundTimeWidget = ParseUI({
            type: "Text",
            parent: mod.FindUIWidgetWithName(`time_remaining_${this._PlayerProfile.playerID}`),
            textSize: 28,
            position: [0, -12, 0],
            size: [150, this.containerHeight],
            anchor: mod.UIAnchor.Center,
            textAnchor: mod.UIAnchor.Center,
            bgAlpha: 0,
            textLabel: mod.Message(mod.stringkeys.gametime, this.minutes, this.sec1, this.sec2)
        })
        this.currentRoundWidget = ParseUI({
            type: "Text",
            parent: mod.FindUIWidgetWithName(`time_remaining_${this._PlayerProfile.playerID}`),
            textSize: 20,
            parentId: undefined,
            position: [0, -5, 0],
            size: [150, this.containerHeight],
            anchor: mod.UIAnchor.BottomCenter,
            textAnchor: mod.UIAnchor.BottomCenter,
            bgAlpha: 0,
            textLabel: mod.Message(mod.stringkeys.current_round, GameHandler.currentRound, GAME_ROUND_LIMIT)
        })

        // this.CreateStatusIconContainers();

        this.teamIndicationWidget = this.CreateTeamIndicationWidget();
        return this.rootWidget;
    }

    RedrawTeamIndicationWidgets() {
        if (!this.teamIndicationWidget)
            return
        for (const widget of this.teamIndicationWidget) {
            mod.DeleteUIWidget(widget);
        }
        this.RedrawPlayerScoreboard(this._PlayerProfile.isInfectedTeam ? "infected" : "survivors");
        this.teamIndicationWidget = this.CreateTeamIndicationWidget();
    }

    RedrawPlayerScoreboard(team: string) {
        if (!this.rootWidget)
            return
        mod.DeleteUIWidget(this.rootWidget)
        this.rootWidget = this.CreateUI() as mod.UIWidget;
        console.log(`Building Scoreboard. Marking widget as visible`);
        if (ScoreboardUI.instances.includes(this)) {
            const index = ScoreboardUI.instances.indexOf(this);
            if (index !== -1) {
                ScoreboardUI.instances.splice(index, 1);
                ScoreboardUI.instances.push(this);
            }
        }
        this.UpdateTeamCount(team);
    }

    // Same underlying bug as GameStateNotificationWidget's dashes (see NotificationBorderDashes'
    // history above it in this file): built with the raw mod.AddUIContainer(name, pos, size,
    // anchor, receiver) overload -- no parent -- then reparented afterward via
    // SetUIWidgetParent, which left the TopLeft/BottomLeft/TopRight/BottomRight corner anchors
    // resolved against the real screen instead of the small team-count box. Unlike the
    // notification dashes, this can't be inlined into a single parent ParseUI() call's `children`
    // array -- it's invoked standalone, after the fact, against an already-existing
    // red/blue_team_container (both on initial CreateUI() and again on every
    // RedrawTeamIndicationWidgets() call) -- so instead each bar is built via its own ParseUI()
    // call with `parent: teamParentContainer` passed at creation time.
    CreateTeamIndicationWidget(): mod.UIWidget[] | undefined {
        if (!this.rootWidget)
            return;
        const widgetGroup: mod.UIWidget[] = [];
        const corners = ["top_left", "bottom_left", "top_right", "bottom_right"];
        const anchors = [mod.UIAnchor.TopLeft, mod.UIAnchor.BottomLeft, mod.UIAnchor.TopRight, mod.UIAnchor.BottomRight];
        const teamRightSide = this._PlayerProfile.isInfectedTeam;
        const playerTeamUIName = "name" + this._PlayerProfile.playerID;
        const yOffset = 3;
        const horizontalSize: [number, number] = [15, 3];
        const verticalSize: [number, number] = [3, 20];
        const teamColor = teamRightSide ? UI.battlefieldRed : UI.battlefieldBlue;
        const teamParentContainer = mod.FindUIWidgetWithName(teamRightSide ? `red_team_container_${this._PlayerProfile.playerID}` : `blue_team_container_${this._PlayerProfile.playerID}`) as mod.UIWidget;
        if (!teamParentContainer) return;

        for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
            const horizontalBorderName = playerTeamUIName + corners[cornerIndex];
            const horizontalBarWidget = ParseUI({
                type: "Container",
                name: horizontalBorderName,
                parent: teamParentContainer,
                position: [0, 0],
                size: horizontalSize,
                anchor: anchors[cornerIndex],
                playerId: this._PlayerProfile.player,
                bgFill: mod.UIBgFill.Solid,
                bgColor: teamColor,
                bgAlpha: 1,
            }) as mod.UIWidget;

            const verticalBorderName = horizontalBorderName + "_vertical";
            const verticalBarWidget = ParseUI({
                type: "Container",
                name: verticalBorderName,
                parent: teamParentContainer,
                position: [0, yOffset], // same offset both sides -- pre-existing "vertical bar overlap" quirk, unrelated to this fix
                size: verticalSize,
                anchor: anchors[cornerIndex],
                playerId: this._PlayerProfile.player,
                bgFill: mod.UIBgFill.Solid,
                bgColor: teamColor,
                bgAlpha: 1,
            }) as mod.UIWidget;

            if (horizontalBarWidget) widgetGroup.push(horizontalBarWidget);
            if (verticalBarWidget) widgetGroup.push(verticalBarWidget);
        }
        return widgetGroup;
    }
}

class GameStateNotificationWidget {
    uiID = "game_state_notification_ui"
    rootWidget: mod.UIWidget | undefined;
    containerWidth = 600;
    containerHeight = 60;
    padding = 1;
    bgBorderColor = UI.battlefieldGrey;
    bgColor = BLACK_COLOR;

    messageText: mod.UIWidget | undefined;

    isUIVisible = false;

    open(message: mod.Message) {
        if (!this.rootWidget)
            this.create(message);
        if (!this.rootWidget || !this.messageText)
            return;
        mod.SetUIWidgetVisible(this.rootWidget, true);
        this.isUIVisible = true;
        mod.SetUITextLabel(this.messageText, message);
    }

    close() {
        if (this.rootWidget) {
            mod.SetUIWidgetVisible(this.rootWidget, false);
            this.isUIVisible = false;
        }
    }

    isOpen() {
        return this.isUIVisible;
    }

    refresh(message: mod.Message) {
        if (!this.messageText)
            return;
        if (!this.rootWidget)
            return;
        this.close();
        this.open(message);
    }

    create(message: mod.Message) {
        // Dash corners are declared inline in this ParseUI call's own `children` array (built up
        // here, then spread into it) instead of being created afterward in a separate
        // NotificationBorderDashes() pass. Passing `parent:` to a standalone, later ParseUI() call
        // still didn't keep the dashes off the real screen edges -- they're nested exactly like
        // every other successfully-corner-anchored element in this file now (e.g. the option
        // cards' rarity badge), which rules out any timing/registration gap between the parent
        // container being created and these children being attached to it. Also renamed away from
        // "game_state_notification_border_*" to "gsn_dash_*" so a stale, still-unparented widget
        // left over from a previous build under the old name can't get silently reused instead of
        // a fresh one being created.
        const corners = ["top_left", "bottom_left", "top_right", "bottom_right"];
        const anchors = [mod.UIAnchor.TopLeft, mod.UIAnchor.BottomLeft, mod.UIAnchor.TopRight, mod.UIAnchor.BottomRight];
        const dashYOffset = 3;
        const horizontalSize: [number, number] = [17, 3];
        const verticalSize: [number, number] = [3, 8];
        const dashChildren: any[] = [];
        for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
            dashChildren.push({
                type: "Container",
                name: `gsn_dash_${corners[cornerIndex]}`,
                position: [0, 0],
                size: horizontalSize,
                anchor: anchors[cornerIndex],
                bgFill: mod.UIBgFill.Solid,
                bgColor: UI.battlefieldWhite,
                bgAlpha: 0.3,
            });
            dashChildren.push({
                type: "Container",
                name: `gsn_dash_${corners[cornerIndex]}_vertical`,
                position: [0, dashYOffset],
                size: verticalSize,
                anchor: anchors[cornerIndex],
                bgFill: mod.UIBgFill.Solid,
                bgColor: UI.battlefieldWhite,
                bgAlpha: 0.3,
            });
        }

        this.rootWidget = ParseUI({
            type: "Container",
            name: "game_state_notification_background",
            size: [this.containerWidth, this.containerHeight],
            position: [0, UI.gameStateNotificationY],
            anchor: mod.UIAnchor.TopCenter,
            bgFill: mod.UIBgFill.Blur,
            bgColor: this.bgColor,
            bgAlpha: 1,
            children: [
                {
                    type: "Container",
                    name: "game_state_notification_border",
                    position: [0, 0],
                    size: [this.containerWidth, this.containerHeight],
                    anchor: mod.UIAnchor.Center,
                    bgFill: mod.UIBgFill.Blur,
                    bgColor: this.bgBorderColor,
                    bgAlpha: 1
                },
                ...dashChildren,
            ]
        });

        this.messageText = ParseUI({
            type: "Text",
            parent: this.rootWidget,
            textSize: 28,
            position: [0, 0, 0],
            size: [this.containerWidth, 50],
            anchor: mod.UIAnchor.Center,
            textAnchor: mod.UIAnchor.Center,
            bgAlpha: 0,
            textLabel: message
        })
    }
}

class SurvivorCountNotificationWidget {
    rootWidget: mod.UIWidget | undefined;
    messageText: mod.UIWidget | undefined;
    containerWidth = 450;
    containerHeight = 40;
    isUIVisible = false;

    open(message: mod.Message) {
        if (!this.rootWidget) {
            this.create(message);
        }
        if (!this.rootWidget || !this.messageText) return;
        mod.SetUITextLabel(this.messageText, message);
        mod.SetUIWidgetDepth(this.rootWidget, mod.UIDepth.AboveGameUI);
        mod.SetUIWidgetVisible(this.rootWidget, true);
        this.isUIVisible = true;
    }

    close() {
        if (!this.rootWidget) return;
        mod.SetUIWidgetVisible(this.rootWidget, false);
        this.isUIVisible = false;
    }

    isOpen() {
        return this.isUIVisible;
    }

    refresh(message: mod.Message) {
        if (!this.rootWidget || !this.messageText) {
            this.open(message);
            return;
        }
        mod.SetUITextLabel(this.messageText, message);
        mod.SetUIWidgetVisible(this.rootWidget, true);
        this.isUIVisible = true;
    }

    create(message: mod.Message) {
        const xOffset = (1024 / 2 - this.containerWidth / 2);
        this.rootWidget = ParseUI({
            type: "Container",
            name: "survivor_count_notification_background",
            position: [xOffset, UI.areaTriggerNotificationY, 0],
            size: [this.containerWidth, this.containerHeight],
            anchor: mod.UIAnchor.TopCenter,
            bgFill: mod.UIBgFill.Blur,
            bgColor: UI.battlefieldGrey,
            bgAlpha: 1,
            depth: mod.UIDepth.AboveGameUI,
            visible: false,
            children: [
                {
                    type: "Text",
                    name: "survivor_count_notification_text",
                    position: [0, 0, 0],
                    size: [this.containerWidth, this.containerHeight],
                    anchor: mod.UIAnchor.Center,
                    textAnchor: mod.UIAnchor.Center,
                    textSize: 18,
                    bgAlpha: 0,
                    textLabel: message,
                },

            ]
        });

        this.messageText = mod.FindUIWidgetWithName("survivor_count_notification_text") as mod.UIWidget;
        if (this.rootWidget) {
            mod.AddUIGadgetImage(
                "survivor_count_notification_icon_gadget",
                mod.CreateVector(0, 0, 0),
                mod.CreateVector(this.containerHeight, this.containerHeight, 0),
                mod.UIAnchor.CenterLeft,
                mod.Gadgets.Throwable_Anti_Vehicle_Grenade,
                this.rootWidget
            );
            mod.SetUIWidgetVisible(this.rootWidget, false);
        }
    }
}

class GameCountdown {

    uiID = "UIGameCountdown"
    static instances: GameCountdown[] = [];
    private rootWidget: mod.UIWidget | undefined;
    countdownTimer: mod.UIWidget | undefined;
    _PlayerProfile: PlayerProfile;

    countdownHeaderText: mod.Any = mod.stringkeys.get_ready;
    countdownSubText: mod.Any = mod.stringkeys.selecting_infected;

    width = 600;
    height = 125;
    headerTextSize = 36;
    subHeaderTextSize = 24;
    countdownTextSize = 30;
    lineBreakHeight = 1;
    padding = 10;
    bgColor = UI.battlefieldBlueBg;
    minutes: number = 0;
    secTens: number = 0;
    secOnes: number = 0;

    constructor(PlayerProfile: PlayerProfile) {
        this._PlayerProfile = PlayerProfile;
        GameCountdown.instances.push(this);
        this.rootWidget = this.CreateUI() as mod.UIWidget
        mod.SetUIWidgetVisible(this.rootWidget, false);
    }

    Show() {
        if (!this.rootWidget) {
            this.rootWidget = this.CreateUI() as mod.UIWidget
        } else {
            if (this.rootWidget) {
                mod.SetUIWidgetVisible(this.rootWidget, true);
                mod.SetUIWidgetDepth(this.rootWidget, mod.UIDepth.AboveGameUI);
            }
        }
    }

    static GlobalClose() {
        for (const instance of GameCountdown.instances)
            instance.Close();
    }

    static GlobalUpdate() {
        for (const instance of GameCountdown.instances)
            instance.Update();
    }

    static GlobalTickDown(minutes: number, secTens: number, secOnes: number) {
        console.log(`${minutes}:${secTens}${secOnes}`);
        for (const instance of GameCountdown.instances)
            instance.Tickdown(minutes, secTens, secOnes);
    }


    Delete() {
        // delete widget and remove from instances array
        if (this.rootWidget) {
            mod.DeleteUIWidget(this.rootWidget);
        }
        const i = GameCountdown.instances.indexOf(this);
        if (i !== -1) GameCountdown.instances.splice(i, 1);
    }

    Close() {
        if (this.rootWidget) {
            this.UpdateHeaderAndContainerColor();
            this.UpdateSubheaderText();
            mod.SetUIWidgetVisible(this.rootWidget, false);
        }
    }

    private ShouldShowCountdownPopup(): boolean {
        if (GameHandler.gameState !== GameState.GameStartCountdown) return false;
        if (this._PlayerProfile.isAlphaInfected) return true;
        return !!this._PlayerProfile.loadoutSelectionUI?.HasSelected();
    }

    private GetReadyCountState(): { readyHumans: number, totalSelectingHumans: number } {
        const survivorCandidates = GetSurvivorCandidates();
        const humanCandidates = survivorCandidates.filter(pp => !pp.isAI);
        const totalSelectingHumans = humanCandidates.filter(pp => !pp.isAlphaInfected).length;
        const readyHumans = humanCandidates.filter(pp => !pp.isAlphaInfected && pp.loadoutSelectionUI?.HasSelected()).length;
        return { readyHumans, totalSelectingHumans };
    }

    private UpdateSubheaderText() {
        if (GameHandler.gameState !== GameState.GameStartCountdown && GameHandler.gameState !== GameState.PreGame) return;
        const subheaderWidget = mod.FindUIWidgetWithName(`${this.uiID}_subheader_${this._PlayerProfile.playerID}`);

        if (!subheaderWidget) return;

        const { readyHumans, totalSelectingHumans } = this.GetReadyCountState();
        if (totalSelectingHumans > 0) {
            mod.SetUITextLabel(subheaderWidget, MakeMessage(mod.stringkeys.awaiting_survivors_loadout, readyHumans, totalSelectingHumans));
            mod.SetUITextColor(subheaderWidget, this._PlayerProfile.isAlphaInfected ? UI.battlefieldRed : UI.battlefieldWhite);
        } else {
            mod.SetUITextLabel(subheaderWidget, MakeMessage(mod.stringkeys.get_ready));
            mod.SetUITextColor(subheaderWidget, UI.battlefieldWhiteAlt);
        }
    }

    private UpdateHeaderAndContainerColor() {
        const headerWidget = mod.FindUIWidgetWithName(`${this.uiID}_header_${this._PlayerProfile.playerID}`);
        const useInfectedTheme = this._PlayerProfile.isInfectedTeam || this._PlayerProfile.isAlphaInfected;
        this.bgColor = useInfectedTheme ? UI.battlefieldRedBg : UI.battlefieldBlueBg;

        const containerBg = mod.FindUIWidgetWithName(`${this.uiID}_container_bg_${this._PlayerProfile.playerID}`);
        containerBg && mod.SetUIWidgetBgColor(containerBg, this.bgColor);

        this.countdownHeaderText = this._PlayerProfile.isAlphaInfected ? mod.stringkeys.you_are_alpha_infected : mod.stringkeys.get_ready;
        headerWidget && mod.SetUITextLabel(headerWidget, MakeMessage(this.countdownHeaderText));
        headerWidget && mod.SetUITextSize(headerWidget, this.headerTextSize);
        headerWidget && mod.SetUITextColor(headerWidget, useInfectedTheme ? UI.battlefieldRed : UI.allyBlue);
    }

    async Update() {
        if (!this.ShouldShowCountdownPopup()) {
            this.Close();
            return;
        }

        this.UpdateHeaderAndContainerColor();
        this.UpdateSubheaderText();
        this.Show();
    }

    CreateUI() {
        const popup = ParseUI({
            // Container border
            type: "Container",
            name: `${this.uiID}_container_${this._PlayerProfile.playerID}`,
            size: [this.width, this.height],
            position: [0, 120],
            anchor: mod.UIAnchor.TopCenter,
            bgFill: mod.UIBgFill.Blur,
            bgColor: UI.battlefieldGreyBg,
            bgAlpha: 1,
            depth: mod.UIDepth.AboveGameUI,
            visible: false,
            children: [{
                type: "Container",
                name: `${this.uiID}_container_bg_${this._PlayerProfile.playerID}`,
                position: [0, 0],
                size: [this.width, this.height - 1],
                anchor: mod.UIAnchor.Center,
                bgFill: mod.UIBgFill.Solid,
                bgColor: this.bgColor,
                bgAlpha: 0.1,
            },
            {
                // Header "Get Ready!"
                type: "Text",
                name: `${this.uiID}_header_${this._PlayerProfile.playerID}`,
                textSize: this.headerTextSize,
                position: [0, 10, 0], // move down 10 from top of container
                size: [this.width, 50],
                anchor: mod.UIAnchor.TopCenter,
                textAnchor: mod.UIAnchor.TopCenter,
                depth: mod.UIDepth.AboveGameUI,
                bgAlpha: 0,
                textLabel: MakeMessage(this.countdownHeaderText),
            },
            {
                // waiting for survivors to choose loadout
                type: "Text",
                name: `${this.uiID}_subheader_${this._PlayerProfile.playerID}`,
                textSize: this.subHeaderTextSize,
                position: [0, 0], // move down 56 units from top
                size: [this.width, 40],
                anchor: mod.UIAnchor.Center,
                textAnchor: mod.UIAnchor.Center,
                depth: mod.UIDepth.AboveGameUI,
                bgAlpha: 0,
                textColor: UI.battlefieldRed,
                textLabel: MakeMessage(mod.stringkeys.selecting_infected),
            },
            {
                // countdown timer 0:09
                type: "Text",
                name: `${this.uiID}_countdown_timer${this._PlayerProfile.playerID}`,
                textSize: this.countdownTextSize,
                position: [0, 10], // move up 20 from center
                size: [this.width, 30],
                anchor: mod.UIAnchor.BottomCenter,
                textAnchor: mod.UIAnchor.Center,
                depth: mod.UIDepth.AboveGameUI,
                bgAlpha: 0,
                textLabel: MakeMessage(mod.stringkeys.infected_countdown, this.minutes, this.secTens, this.secOnes),
            },
            ],
            playerId: this._PlayerProfile.player
        });
        return popup
    }

    Tickdown(minutes: number, secTens: number, secOnes: number) {
        if (!this.ShouldShowCountdownPopup()) {
            this.Close();
            return;
        }

        this.minutes = minutes;
        this.secTens = secTens;
        this.secOnes = secOnes;

        const countdownTimerWidget = mod.FindUIWidgetWithName(`${this.uiID}_countdown_timer${this._PlayerProfile.playerID}`);
        if (!countdownTimerWidget) return;

        this.UpdateHeaderAndContainerColor()
        this.UpdateSubheaderText();
        mod.SetUIWidgetVisible(countdownTimerWidget, true);
        mod.SetUITextLabel(countdownTimerWidget, mod.Message(mod.stringkeys.infected_countdown, this.minutes, this.secTens, this.secOnes));
        mod.SetUITextSize(countdownTimerWidget, this.countdownTextSize);
        mod.SetUITextColor(countdownTimerWidget, UI.battlefieldWhiteAlt);
    }
}

/**
 * LoadoutSelectionMenu: Displays three options per slot during pre-round
 * Players select Sidearm, Primary, then LMS in sequence
 */
class LoadoutSelectionMenu {
    static instances: LoadoutSelectionMenu[] = [];
    private rootWidget: mod.UIWidget | undefined;
    private optionWidgets: mod.UIWidget[] = [];
    private optionButtons: mod.UIWidget[] = [];
    private countdownText: mod.UIWidget | undefined;
    private slotLabelText: mod.UIWidget | undefined;
    private cycleText: mod.UIWidget | undefined;
    private tipText: mod.UIWidget | undefined;
    private hasConfirmedLoadout: boolean = false;
    private isOpen: boolean = false;
    private currentSlotIndex: number = 0;
    private revealToken: number = 0;
    // The looping "counting" sfx object currently playing ahead of a card reveal, if any.
    // Tracked so it can be stopped immediately on interruption instead of looping forever.
    private activeCounterSfx: mod.SFX | undefined;
    private selectedSlots: Map<InventorySlot, EquippedItem> = new Map();
    private rerollsRemaining: number = 1;
    private rerollButton: mod.UIWidget | undefined;
    private rerollButtonText: mod.UIWidget | undefined;
    private rerollStatusText: mod.UIWidget | undefined;
    private readonly slotOrder: InventorySlot[] = [
        InventorySlot.Sidearm,
        InventorySlot.Primary,
        InventorySlot.LMS,
    ];
    _PlayerProfile: PlayerProfile;

    loadoutOptions: SlotLoadoutOptions | undefined;

    width = 1200;
    height = 500; // +20 to make room for the bundled-gadget frame, now shown above the sidearm cards
    rowWidth = this.width * 0.9;
    rowHeight = 170;
    padding = 20;
    headerTextSize = 35;
    itemTextSize = 16;
    iconSize = 180;
    // Option-card button colors. Much darker resting state than the old battlefieldGreyBg so the
    // hover/focus highlight (applied by OnPlayerUIButtonEvent, not native button state colors --
    // see CreateOptionCard) actually reads as a distinct highlight.
    static cardButtonRestColor = mod.CreateVector(0.03, 0.04, 0.05);
    static cardButtonHoverColor = UI.battlefieldWhite;
    static cardButtonHoverAlpha = 0.25;

    constructor(PlayerProfile: PlayerProfile) {
        this._PlayerProfile = PlayerProfile;
        LoadoutSelectionMenu.instances.push(this);
        this.rootWidget = this.CreateBaseUI() as mod.UIWidget;
        if (this.rootWidget) {
            mod.SetUIWidgetVisible(this.rootWidget, false);
        }
    }

    static GlobalClose(forceClose: boolean = true) {
        for (const instance of LoadoutSelectionMenu.instances) {
            if (forceClose) {
                instance.EnsureDefaultSelection();
                instance.Close();
                continue;
            }

            if (instance.HasSelected()) {
                instance.Close();
            }
        }
    }

    Show(options: SlotLoadoutOptions) {
        this.loadoutOptions = options;
        this.hasConfirmedLoadout = false;
        this.currentSlotIndex = 0;
        this.selectedSlots.clear();
        this.rerollsRemaining = 1;

        if (!this.rootWidget) {
            this.rootWidget = this.CreateBaseUI() as mod.UIWidget;
        }

        // Start with auto gadget/throwable assigned, weapon slots unselected
        this._PlayerProfile.chosenLoadoutThisRound = this.BuildCurrentLoadout(false);

        // Build the option cards for the current slot
        this.BuildLoadoutCards();
        this.UpdateRerollUI();

        if (this.tipText) {
            mod.SetUITextLabel(this.tipText, this.GetRandomTipMessage());
        }

        if (this.rootWidget) {
            mod.SetUIWidgetVisible(this.rootWidget, true);
            mod.SetUIWidgetDepth(this.rootWidget, mod.UIDepth.AboveGameUI);
            mod.EnableUIInputMode(true, this._PlayerProfile.player);
            this.isOpen = true;
        }

        if (!this._PlayerProfile.isInfectedTeam) {
            this._PlayerProfile.loadoutDisplayBottom?.Show();
        }
    }

    Close() {
        // Stop any in-flight reveal (queued counter sfx + pending card reveals) so nothing
        // keeps playing after the menu is no longer visible.
        this.InterruptReveal();
        if (this.rootWidget) {
            mod.SetUIWidgetVisible(this.rootWidget, false);
            mod.EnableUIInputMode(false, this._PlayerProfile.player);
            this.isOpen = false;
        }
    }

    Delete() {
        this.InterruptReveal();
        if (this.rootWidget) {
            mod.DeleteUIWidget(this.rootWidget);
            this.rootWidget = undefined;
            this.isOpen = false;
        }
        const i = LoadoutSelectionMenu.instances.indexOf(this);
        if (i !== -1) LoadoutSelectionMenu.instances.splice(i, 1);
    }

    // Cancels any pending card-reveal animation (RevealCardsSequentially) and immediately
    // stops the looping "counting" sfx if one is mid-playback. Called whenever a selection
    // is made before all options finish revealing, and whenever the menu closes, so sounds
    // never double up or keep playing after the fact.
    private InterruptReveal(): void {
        this.revealToken++;
        if (this.activeCounterSfx) {
            try { mod.StopSound(this.activeCounterSfx, this._PlayerProfile.player); } catch { }
            this.activeCounterSfx = undefined;
        }
    }

    SelectOption(index: number) {
        if (!this.loadoutOptions) return;
        const slot = this.slotOrder[this.currentSlotIndex];
        const options = this.GetOptionsForSlot(slot);
        const selected = options[index];
        if (!selected) return;

        // Player chose before all cards finished revealing - stop the pending reveal(s)
        // and any currently-looping counter sfx right away.
        this.InterruptReveal();

        this.selectedSlots.set(slot, selected);
        this._PlayerProfile.chosenLoadoutThisRound = this.BuildCurrentLoadout(false);
        this._PlayerProfile.loadoutDisplayBottom?.Show();

        if (this.currentSlotIndex < this.slotOrder.length - 1) {
            this.currentSlotIndex++;
            this.BuildLoadoutCards();
        } else {
            this.ConfirmSelection();
        }
    }

    UseReroll() {
        if (this.rerollsRemaining <= 0) return;
        if (!this.loadoutOptions) return;

        const slot = this.slotOrder[this.currentSlotIndex];
        const newOptions = Weapons.RerollSlotOptions(slot, 3);
        if (newOptions.length === 0) return;

        switch (slot) {
            case InventorySlot.Primary:
                this.loadoutOptions.primaryOptions = newOptions;
                break;
            case InventorySlot.LMS:
                this.loadoutOptions.lmsOptions = newOptions;
                break;
            case InventorySlot.Sidearm:
                this.loadoutOptions.sidearmOptions = newOptions;
                break;
        }

        // Prior selection for this slot no longer matches the newly rolled options
        this.selectedSlots.delete(slot);
        this._PlayerProfile.chosenLoadoutThisRound = this.BuildCurrentLoadout(false);

        this.rerollsRemaining--;
        this.UpdateRerollUI();

        // Rebuild the cards for the currently presented category; this replays the reveal animation
        this.BuildLoadoutCards();
    }

    private UpdateRerollUI() {
        if (this.rerollStatusText) {
            const message = this.rerollsRemaining > 0
                ? MakeMessage(mod.stringkeys.loadout_reroll_remaining_one)
                : MakeMessage(mod.stringkeys.loadout_reroll_remaining_zero);
            mod.SetUITextLabel(this.rerollStatusText, message);
        }
        if (this.rerollButton) {
            mod.SetUIButtonEnabled(this.rerollButton, this.rerollsRemaining > 0);
        }
    }

    ConfirmSelection() {
        Helpers.PlaySoundFX(SFX_LOADOUT_CONFIRM, 1, this._PlayerProfile.player);
        if (!this.loadoutOptions) return;
        this._PlayerProfile.chosenLoadoutThisRound = this.BuildCurrentLoadout(true);
        this.hasConfirmedLoadout = true;
        if (!this._PlayerProfile.isInfectedTeam && GameHandler.gameState !== GameState.GameRoundIsRunning) {
            this._PlayerProfile.gameCountdownUI?.Show();
        }
        if (Helpers.HasValidObjId(this._PlayerProfile.player) &&
            mod.GetSoldierState(this._PlayerProfile.player, mod.SoldierStateBool.IsAlive)) {
            RefreshHumanEquipment(this._PlayerProfile.player, this._PlayerProfile);
        }
        this.Close();
    }

    HasSelected(): boolean {
        return this.hasConfirmedLoadout;
    }

    IsOpen(): boolean {
        return this.isOpen;
    }

    UpdateCountdown(secondsRemaining: number) {
        if (!this.countdownText) return;
        const timeRemainingText = Helpers.FormatTime(secondsRemaining);
        const message = MakeMessage(
            mod.stringkeys.infected_countdown,
            timeRemainingText[0],
            timeRemainingText[1],
            timeRemainingText[2]
        );
        mod.SetUITextLabel(this.countdownText, message);
    }

    private EnsureDefaultSelection() {
        if (!this.hasConfirmedLoadout) {
            if (!this.loadoutOptions && this._PlayerProfile.pendingLoadoutOptions) {
                // Menu was never shown (player wasn't deployed when options were generated);
                // use pending options directly to produce a full default loadout.
                this._PlayerProfile.chosenLoadoutThisRound = Weapons.BuildDefaultLoadoutFromOptions(this._PlayerProfile.pendingLoadoutOptions);
                this._PlayerProfile.pendingLoadoutOptions = undefined;
                this.hasConfirmedLoadout = true;
                if (Helpers.HasValidObjId(this._PlayerProfile.player) &&
                    mod.GetSoldierState(this._PlayerProfile.player, mod.SoldierStateBool.IsAlive)) {
                    RefreshHumanEquipment(this._PlayerProfile.player, this._PlayerProfile);
                }
                return;
            }
            if (!this.loadoutOptions) return;
            this._PlayerProfile.chosenLoadoutThisRound = this.BuildCurrentLoadout(true);
            this.hasConfirmedLoadout = true;
            if (Helpers.HasValidObjId(this._PlayerProfile.player) &&
                mod.GetSoldierState(this._PlayerProfile.player, mod.SoldierStateBool.IsAlive)) {
                RefreshHumanEquipment(this._PlayerProfile.player, this._PlayerProfile);
            }
        }
    }

    private GetSlotLabelKey(slot: InventorySlot): mod.Any {
        switch (slot) {
            case InventorySlot.Primary:
                return mod.stringkeys.final_five_slot;
            case InventorySlot.LMS:
                return mod.stringkeys.last_stand_slot;
            case InventorySlot.Sidearm:
                return mod.stringkeys.sidearm_slot;
            default:
                return mod.stringkeys.sidearm_slot;
        }
    }

    private GetOptionsForSlot(slot: InventorySlot): Array<EquippedItem> {
        if (!this.loadoutOptions) return [];
        switch (slot) {
            case InventorySlot.Primary:
                return this.loadoutOptions.primaryOptions || [];
            case InventorySlot.LMS:
                return this.loadoutOptions.lmsOptions || [];
            case InventorySlot.Sidearm:
                return this.loadoutOptions.sidearmOptions || [];
            default:
                return [];
        }
    }

    private BuildCurrentLoadout(includeDefaults: boolean): Array<EquippedItem> {
        if (!this.loadoutOptions) return [];
        const items: Array<EquippedItem> = [];

        const sidearm = this.selectedSlots.get(InventorySlot.Sidearm) ?? (includeDefaults ? this.loadoutOptions.sidearmOptions[0] : undefined);
        const primary = this.selectedSlots.get(InventorySlot.Primary) || (includeDefaults ? this.loadoutOptions.primaryOptions[0] : undefined);
        const lms = this.selectedSlots.get(InventorySlot.LMS) || (includeDefaults ? this.loadoutOptions.lmsOptions[0] : undefined);

        // Every sidearm card bundles an independently-rolled gadget (see
        // Weapons.buildSidearmBundleOptions) -- picking a sidearm always grants both.
        if (sidearm) {
            items.push(sidearm);
            if (sidearm.bundledGadget) {
                items.push({ ...sidearm.bundledGadget, inventorySlot: InventorySlot.Gadget });
            }
        }

        if (this.loadoutOptions.throwable) items.push(this.loadoutOptions.throwable);
        if (primary) items.push(primary);
        if (lms) items.push(lms);

        return items;
    }

    private CreateBaseUI() {
        const rootWidget = ParseUI({
            type: "Container",
            name: `loadout_select_root_${this._PlayerProfile.playerID}`,
            size: [this.width, this.height],
            position: [0, 0],
            anchor: mod.UIAnchor.Center,
            bgFill: mod.UIBgFill.OutlineThin,
            bgColor: UI.battlefieldBlueBg,
            bgAlpha: 0.4,
            depth: mod.UIDepth.AboveGameUI,
            playerId: this._PlayerProfile.player,
            children: [
                {
                    type: "Container",
                    name: `loadout_select_border_${this._PlayerProfile.playerID}`,
                    size: [this.width, this.height],
                    position: [0, 0],
                    anchor: mod.UIAnchor.Center,
                    bgFill: mod.UIBgFill.Blur,
                    bgColor: BLACK_COLOR,
                    bgAlpha: 1,
                    depth: mod.UIDepth.AboveGameUI,
                    playerId: this._PlayerProfile.player,
                    children:
                        [{
                            type: "Container",
                            name: `loadout_select_bgcolor_${this._PlayerProfile.playerID}`,
                            size: [this.width - 1, this.height - 1],
                            position: [0, 0],
                            anchor: mod.UIAnchor.Center,
                            bgFill: mod.UIBgFill.Solid,
                            bgColor: UI.battlefieldGreyBg,
                            bgAlpha: 0.8,
                            depth: mod.UIDepth.AboveGameUI,
                            playerId: this._PlayerProfile.player
                        }]
                },
                {
                    type: "Text",
                    name: `loadout_select_header_${this._PlayerProfile.playerID}`,
                    position: [0, 10],
                    size: [this.width, 40],
                    anchor: mod.UIAnchor.TopCenter,
                    textAnchor: mod.UIAnchor.Center,
                    textLabel: MakeMessage(mod.stringkeys.loadout_select_header),
                    textSize: this.headerTextSize,
                    textColor: UI.allyBlue,
                    bgAlpha: 0,
                },
                {
                    type: "Text",
                    name: `loadout_select_timer_${this._PlayerProfile.playerID}`,
                    position: [0, 40],
                    size: [this.width, 30],
                    anchor: mod.UIAnchor.TopCenter,
                    textAnchor: mod.UIAnchor.Center,
                    textLabel: MakeMessage(mod.stringkeys.infected_countdown, 0, 2, 0),
                    textSize: 28,
                    textColor: UI.battlefieldWhiteAlt,
                    bgAlpha: 0,
                },
                {
                    type: "Text",
                    name: `loadout_select_cycle_${this._PlayerProfile.playerID}`,
                    position: [0, 70],
                    size: [this.width, 20],
                    anchor: mod.UIAnchor.TopCenter,
                    textAnchor: mod.UIAnchor.Center,
                    textLabel: MakeMessage(mod.stringkeys.loadout_cycle, 1, 3),
                    textSize: 24,
                    textColor: UI.battlefieldGrey,
                    bgAlpha: 0,
                },
                {
                    type: "Text",
                    name: `loadout_select_slot_${this._PlayerProfile.playerID}`,
                    position: [0, 85],
                    size: [this.width, 30],
                    anchor: mod.UIAnchor.TopCenter,
                    textAnchor: mod.UIAnchor.Center,
                    textLabel: MakeMessage(mod.stringkeys.sidearm_slot),
                    textSize: 26,
                    textColor: UI.battlefieldWhiteAlt,
                    bgAlpha: 0,
                },
                {
                    // Shifted down from 350 -> 382 (+32): the sidearm cards moved down by the same
                    // amount (see CreateOptionCard's cardYOffset, 15 -> 37) to make room for the
                    // bundled-gadget frame now drawn above them, so this button keeps the exact
                    // same 10px gap below the card row it always had.
                    type: "Button",
                    name: `loadout_reroll_btn_${this._PlayerProfile.playerID}`,
                    position: [0, 382],
                    size: [220, 34],
                    anchor: mod.UIAnchor.TopCenter,
                    bgFill: mod.UIBgFill.GradientBottom,
                    bgColor: UI.battlefieldGreyBg,
                    bgAlpha: 0.9,
                    depth: mod.UIDepth.AboveGameUI,
                    playerId: this._PlayerProfile.player,
                },
                {
                    type: "Text",
                    name: `loadout_reroll_btn_text_${this._PlayerProfile.playerID}`,
                    position: [0, 382],
                    size: [220, 34],
                    anchor: mod.UIAnchor.TopCenter,
                    textAnchor: mod.UIAnchor.Center,
                    textLabel: MakeMessage(mod.stringkeys.loadout_reroll_button),
                    textSize: 18,
                    textColor: UI.battlefieldWhiteAlt,
                    bgAlpha: 0,
                },
                {
                    // Shifted down by the same +32 as the reroll button above, preserving the
                    // original 4px gap between them.
                    type: "Text",
                    name: `loadout_reroll_status_${this._PlayerProfile.playerID}`,
                    position: [0, 420],
                    size: [this.width, 20],
                    anchor: mod.UIAnchor.TopCenter,
                    textAnchor: mod.UIAnchor.Center,
                    textLabel: MakeMessage(mod.stringkeys.loadout_reroll_remaining_one),
                    textSize: 16,
                    textColor: UI.battlefieldGrey,
                    bgAlpha: 0,
                },
                {
                    type: "Text",
                    name: `loadout_select_tips_${this._PlayerProfile.playerID}`,
                    position: [0, 20],
                    size: [this.width, 22],
                    anchor: mod.UIAnchor.BottomCenter,
                    textAnchor: mod.UIAnchor.Center,
                    textLabel: MakeMessage(mod.stringkeys.loadout_tip_1),
                    textSize: 18,
                    textColor: UI.battlefieldWhiteAlt,
                    bgAlpha: 0,
                },
            ]
        });

        if (rootWidget) {
            this.countdownText = mod.FindUIWidgetWithName(`loadout_select_timer_${this._PlayerProfile.playerID}`) as mod.UIWidget;
            this.slotLabelText = mod.FindUIWidgetWithName(`loadout_select_slot_${this._PlayerProfile.playerID}`) as mod.UIWidget;
            this.cycleText = mod.FindUIWidgetWithName(`loadout_select_cycle_${this._PlayerProfile.playerID}`) as mod.UIWidget;
            this.tipText = mod.FindUIWidgetWithName(`loadout_select_tips_${this._PlayerProfile.playerID}`) as mod.UIWidget;
            this.rerollButton = mod.FindUIWidgetWithName(`loadout_reroll_btn_${this._PlayerProfile.playerID}`) as mod.UIWidget;
            this.rerollButtonText = mod.FindUIWidgetWithName(`loadout_reroll_btn_text_${this._PlayerProfile.playerID}`) as mod.UIWidget;
            this.rerollStatusText = mod.FindUIWidgetWithName(`loadout_reroll_status_${this._PlayerProfile.playerID}`) as mod.UIWidget;
        }

        return rootWidget;
    }

    private UpdateCycleUI(slot: InventorySlot) {
        if (this.slotLabelText) {
            mod.SetUITextLabel(this.slotLabelText, MakeMessage(this.GetSlotLabelKey(slot)));
        }
        if (this.cycleText) {
            mod.SetUITextLabel(this.cycleText, MakeMessage(mod.stringkeys.loadout_cycle, this.currentSlotIndex + 1, this.slotOrder.length));
        }
    }

    private GetRandomTipMessage(): mod.Message {
        const tips = [
            mod.stringkeys.loadout_tip_1,
            mod.stringkeys.loadout_tip_2,
            mod.stringkeys.loadout_tip_3,
            mod.stringkeys.loadout_tip_4,
            mod.stringkeys.loadout_tip_5,
            mod.stringkeys.loadout_tip_6,
            mod.stringkeys.loadout_tip_7,
            mod.stringkeys.loadout_tip_8,
            mod.stringkeys.loadout_tip_9,
            mod.stringkeys.loadout_tip_10,
            mod.stringkeys.loadout_tip_11,
        ];
        const randomTip = tips[Math.floor(Math.random() * tips.length)];
        return MakeMessage(randomTip);
    }

    private BuildLoadoutCards() {
        if (!this.loadoutOptions || !this.rootWidget) return;

        const slot = this.slotOrder[this.currentSlotIndex];
        const options = this.GetOptionsForSlot(slot);
        this.UpdateCycleUI(slot);

        // Delete old card widgets if they exist
        for (const widget of this.optionWidgets) {
            try { mod.DeleteUIWidget(widget); } catch (e) { }
        }
        for (const widget of this.optionButtons) {
            try { mod.DeleteUIWidget(widget); } catch (e) { }
        }

        this.optionWidgets = [];
        this.optionButtons = [];

        const cardWidth = Math.floor((this.rowWidth - (this.padding * 2)) / 3);
        const startX = -this.rowWidth / 2 + (cardWidth / 2);

        const revealItems: Array<{ frame: mod.UIWidget; content: mod.UIWidget; button: mod.UIWidget; item: EquippedItem; extraContent?: mod.UIWidget[] }> = [];

        for (let i = 0; i < options.length; i++) {
            const item = options[i];
            const xOffset = startX + i * (cardWidth + this.padding);
            const cardHeight = this.rowHeight;
            const card = this.CreateOptionCard(i, item, xOffset, cardWidth, cardHeight);
            if (card?.cardWidget && card?.buttonWidget && card?.contentWidget) {
                mod.SetUIWidgetVisible(card.cardWidget, false);
                mod.SetUIWidgetVisible(card.contentWidget, false);
                mod.SetUIWidgetVisible(card.buttonWidget, false);
                for (const extra of card.extraContent ?? []) {
                    mod.SetUIWidgetVisible(extra, false);
                    this.optionWidgets.push(extra);
                }
                revealItems.push({ frame: card.cardWidget, content: card.contentWidget, button: card.buttonWidget, item, extraContent: card.extraContent });
            }
        }

        this.revealToken++;
        this.RevealCardsSequentially(revealItems, this.revealToken);
    }

    // Pre-roll window: the counter sfx plays once for the whole category, spanning the time
    // the 3 empty card frames take to blink in.
    private static readonly FRAME_COUNTER_WINDOW_SECONDS = 1.2;
    private static readonly FRAME_BLINK_STAGGER_SECONDS = 0.25;
    private static readonly FRAME_BLINK_ON_SECONDS = 0.08;
    private static readonly FRAME_BLINK_OFF_SECONDS = 0.08;
    private static readonly FRAME_BLINK_FLASHES = 2;

    /** Staggered flash-in for one card's empty frame/border, settling visible once done. */
    private async BlinkInFrame(frame: mod.UIWidget, startDelay: number): Promise<void> {
        if (startDelay > 0) await mod.Wait(startDelay);
        for (let i = 0; i < LoadoutSelectionMenu.FRAME_BLINK_FLASHES; i++) {
            mod.SetUIWidgetVisible(frame, true);
            await mod.Wait(LoadoutSelectionMenu.FRAME_BLINK_ON_SECONDS);
            mod.SetUIWidgetVisible(frame, false);
            await mod.Wait(LoadoutSelectionMenu.FRAME_BLINK_OFF_SECONDS);
        }
        mod.SetUIWidgetVisible(frame, true);
    }

    private async RevealCardsSequentially(
        cards: Array<{ frame: mod.UIWidget; content: mod.UIWidget; button: mod.UIWidget; item: EquippedItem; extraContent?: mod.UIWidget[] }>,
        token: number
    ) {
        // Looping "counting" sfx plays once for this whole category, for the duration of the
        // frames blinking in. Tracked on the instance so InterruptReveal() can stop it the
        // moment a selection is made, rather than letting a loop sound run indefinitely.
        const counterSfx = mod.SpawnObject(SFX_LOADOUT_REVEAL_COUNTER, POSITION_HQ1, ZERO_VEC) as mod.SFX;
        if (counterSfx) {
            mod.PlaySound(counterSfx, 1, this._PlayerProfile.player);
            this.activeCounterSfx = counterSfx;
        }

        // Empty card frames flash in one after another, spread across the counter window.
        for (let i = 0; i < cards.length; i++) {
            this.BlinkInFrame(cards[i].frame, i * LoadoutSelectionMenu.FRAME_BLINK_STAGGER_SECONDS);
        }

        await mod.Wait(LoadoutSelectionMenu.FRAME_COUNTER_WINDOW_SECONDS);

        if (token !== this.revealToken) return;

        // Guarantee every frame is settled visible the instant the window ends, regardless of
        // how the staggered blink timing landed.
        for (const card of cards) {
            mod.SetUIWidgetVisible(card.frame, true);
        }

        if (this.activeCounterSfx === counterSfx) {
            try { mod.StopSound(counterSfx, this._PlayerProfile.player); } catch { }
            this.activeCounterSfx = undefined;
        }

        // Cards now reveal their contents one at a time at the existing cadence.
        for (const card of cards) {
            if (token !== this.revealToken) return;
            const rarity = card.item.rarity ?? 0;
            const isLegendary = rarity >= GetLegendaryThresholdForItem(card.item);
            const isRare = !isLegendary && rarity >= RARITY_RARE_THRESHOLD;

            // Roll simulation always runs 0.5s before the rarity reveal sfx plays.
            await mod.Wait(0.5);
            this.PlayRevealSfxForRarity(card.item);

            if (token !== this.revealToken) return;

            mod.SetUIWidgetVisible(card.button, true);

            // Rare/legendary cards hold on the reveal sfx a little longer before the card's
            // contents become visible -- legendary holds longest.
            const extraRevealHold = isLegendary ? 2 : isRare ? 0.75 : 0;
            if (extraRevealHold > 0) {
                await mod.Wait(extraRevealHold);
            }

            mod.SetUIWidgetVisible(card.content, true);
            // Bundled-gadget frame (sidearm cards only) reveals in lockstep with its parent card.
            for (const extra of card.extraContent ?? []) {
                mod.SetUIWidgetVisible(extra, true);
            }

            // Let the card sit before the next reveal starts.
            await mod.Wait(0.25);
        }
    }

    private PlayRevealSfxForRarity(item: EquippedItem) {
        const rarity = item.rarity;
        if (rarity === undefined) return;
        const sfx = rarity >= GetLegendaryThresholdForItem(item) ? SFX_LOADOUT_REVEAL_LEGENDARY : rarity >=
            RARITY_RARE_THRESHOLD
            ? SFX_LOADOUT_REVEAL_RARE
            : SFX_LOADOUT_REVEAL_COMMON;
        Helpers.PlaySoundFX(sfx, 1, this._PlayerProfile.player);
    }

    private CreateOptionCard(
        index: number,
        item: EquippedItem,
        xOffset: number,
        cardWidth: number,
        cardHeight: number
    ) {
        if (!this.rootWidget) return;

        // Vertical offset (relative to the container's own center) applied to card and button
        // widgets. Shifted down from 15 -> 37 to leave room above the card row for the bundled-
        // gadget frame (see below), between it and the slot label text. Combined with height
        // growing 480 -> 500 (container center moving from 240 to 250 from the top), the cards'
        // absolute position moves down by 32px total -- the reroll button/status text in
        // CreateBaseUI are shifted down by that same +32 so their gap to the card row is
        // unchanged.
        const cardYOffset = 37;
        const cardName = `loadout_card_option_${index}_${this._PlayerProfile.playerID}`;
        const buttonPos = mod.CreateVector(xOffset, cardYOffset, 0);
        const buttonSize = mod.CreateVector(cardWidth, cardHeight, 0);

        // IMPORTANT: the extended AddUIButton overload (parent + base/hover/focused/pressed state
        // colors passed at creation, wired up via ParseUI's Button type) crashes the game on click
        // in this engine -- confirmed by testing. Nobody else in this file uses it either, which
        // in hindsight was the tell. Stick to the short overload (proven safe/click-stable) and
        // drive the resting color manually. Hover/focus visual feedback is instead handled by
        // OnPlayerUIButtonEvent swapping the bg color on HoverIn/HoverOut/FocusIn/FocusOut, which
        // doesn't touch the risky constructor path at all.
        mod.AddUIButton(
            `loadout_option_btn_${index}_${this._PlayerProfile.playerID}`,
            buttonPos,
            buttonSize,
            mod.UIAnchor.Center,
            this._PlayerProfile.player
        );
        const cardButton = mod.FindUIWidgetWithName(`loadout_option_btn_${index}_${this._PlayerProfile.playerID}`) as mod.UIWidget;
        if (cardButton) {
            this.optionButtons.push(cardButton);
            mod.SetUIWidgetVisible(cardButton, true);
            mod.SetUIWidgetBgFill(cardButton, mod.UIBgFill.GradientBottom);
            mod.SetUIWidgetBgColor(cardButton, LoadoutSelectionMenu.cardButtonRestColor);
            mod.SetUIWidgetBgAlpha(cardButton, 0.9);
            mod.SetUIWidgetDepth(cardButton, mod.UIDepth.AboveGameUI);
            mod.SetUIWidgetParent(cardButton, this.rootWidget);
        }


        const cardWidget = ParseUI({
            type: "Container",
            name: cardName,
            parent: this.rootWidget,
            position: [xOffset, cardYOffset],
            size: [cardWidth, cardHeight],
            anchor: mod.UIAnchor.Center,
            bgFill: mod.UIBgFill.OutlineThin,
            bgColor: UI.battlefieldWhiteAlt,
            bgAlpha: 0.1,
            depth: mod.UIDepth.AboveGameUI,
            visible: false,
            children: [
                {
                    type: "Container",
                    name: `${cardName}_background`,
                    size: [cardWidth - 1, cardWidth - 1],
                    position: [0, cardYOffset],
                    anchor: mod.UIAnchor.Center,
                    bgFill: mod.UIBgFill.Blur,
                    bgColor: BLACK_COLOR,
                    bgAlpha: 1,
                    depth: mod.UIDepth.AboveGameUI,
                    playerId: this._PlayerProfile.player
                }
            ]
        }) as mod.UIWidget;

        if (!cardWidget) return;
        const itemName = `${cardName}_item`;
        const textWidthPadding = 8;
        const nameTextHeight = 20;
        const nameTextSize = 16;
        const upgradeStartOffsetY = 8;
        const upgradeLineHeight = 13;
        const upgradeTextSize = 12;
        const upgradeTextPadding = 20;
        const rarityHeight = 30;
        const rarityWidthRatio = 0.45;
        const rarityTextWidthRatio = 0.5;
        const iconOffsetY = -5;
        const iconOffsetX = -15;
        const iconPadding = 10;
        // Extra widgets (bundled-gadget frame, sidearm cards only) that must reveal in lockstep
        // with itemContainer but aren't nested inside it -- see the bundle block below.
        const extraContent: mod.UIWidget[] = [];

        // individual item/card container, controls bgColor
        // Starts hidden independently of the frame (cardWidget) -- the frame blinks in first
        // as an empty border during the pre-roll counter window, and this content (icon/name/
        // rarity) only becomes visible once this specific card is revealed.
        const itemContainer = ParseUI({
            type: "Container",
            name: itemName,
            parent: cardWidget,
            position: [0, 0],
            size: [cardWidth, cardHeight],
            anchor: mod.UIAnchor.Center,
            bgFill: mod.UIBgFill.Blur,
            bgColor: BLACK_COLOR,
            bgAlpha: 1,
            visible: false,

        });

        if (itemContainer) {
            const iconSize = Math.max(this.iconSize - iconPadding, Math.min(cardWidth, cardHeight) - iconPadding);
            const iconSizeWep = item.inventorySlot === InventorySlot.Sidearm ? iconSize : iconSize * 1.4;
            const cellWidth = cardWidth;
            const cellHeight = cardHeight;
            const legendaryThreshold = GetLegendaryThresholdForItem(item);
            const rarityKey = item.rarity !== undefined
                ? (item.rarity >= legendaryThreshold ? mod.stringkeys.rarity_legendary : item.rarity >= RARITY_RARE_THRESHOLD ? mod.stringkeys.rarity_rare : undefined)
                : undefined;
            const rarityColor = item.rarity !== undefined && item.rarity >= legendaryThreshold
                ? UI.battlefieldYellow
                : UI.allyBlue;
            const rarityBg = item.rarity !== undefined && item.rarity >= legendaryThreshold
                ? UI.battlefieldYellowBg
                : UI.battlefieldBlueBg;
            if (item.gadget) {
                mod.AddUIGadgetImage(
                    `${itemName}_icon`,
                    mod.CreateVector(iconOffsetX, iconOffsetY, 0),
                    mod.CreateVector(iconSize, iconSize, 0),
                    mod.UIAnchor.Center,
                    item.gadget as mod.Gadgets,
                    itemContainer as mod.UIWidget
                );
            } else if (item.weapon && item.packageImage) {
                mod.AddUIWeaponImage(
                    `${itemName}_icon`,
                    mod.CreateVector(iconOffsetX, iconOffsetY, 0),
                    mod.CreateVector(iconSizeWep, iconSizeWep, 0),
                    mod.UIAnchor.Center,
                    item.weapon as mod.Weapons,
                    itemContainer as mod.UIWidget,
                    item.packageImage as mod.WeaponPackage
                );
            }

            // Item name
            ParseUI({
                type: "Text",
                name: `${itemName}_name`,
                parent: itemContainer,
                position: [0, 0],
                size: [cellWidth - textWidthPadding, nameTextHeight],
                anchor: mod.UIAnchor.BottomLeft,
                textAnchor: mod.UIAnchor.BottomLeft,
                textLabel: typeof item.text === 'string' ? MakeMessage(item.text) : item.text,
                textSize: nameTextSize,
                textColor: UI.battlefieldWhiteAlt,
                bgAlpha: 0,
            });

            const upgrades = item.appliedUpgradeKeys || [];
            const maxDisplayedAttachments = 4;
            const getAttachmentSlotOrder = (slot?: AttachmentSlot): number => {
                if (slot === AttachmentSlot.Ammo) return 0;
                if (slot === AttachmentSlot.Magazine) return 1;
                if (slot === AttachmentSlot.Muzzle) return 2;
                if (slot === AttachmentSlot.Underbarrel) return 3;
                if (slot === AttachmentSlot.Ergonomic) return 4;
                if (slot === AttachmentSlot.Scope) return 5;
                if (slot === AttachmentSlot.Barrel) return 6;
                return Number.MAX_SAFE_INTEGER;
            };

            const preparedUpgrades = upgrades
                .map((upgradeKey, originalIndex) => {
                    const attachmentDef = Weapons.attachmentPool.find(a => a.nameKey === upgradeKey);
                    return {
                        upgradeKey,
                        originalIndex,
                        attachmentDef,
                        rarity: attachmentDef?.rarity ?? 0,
                        orderedSlot: getAttachmentSlotOrder(attachmentDef?.slot),
                    };
                })
                .filter(entry => {
                    if (!entry.upgradeKey) return false;
                    return entry.attachmentDef?.slot !== AttachmentSlot.Barrel;
                });

            const trimmedUpgrades = preparedUpgrades.length > maxDisplayedAttachments
                ? preparedUpgrades
                    .slice()
                    .sort((a, b) => {
                        if (b.rarity !== a.rarity) return b.rarity - a.rarity;
                        if (a.orderedSlot !== b.orderedSlot) return a.orderedSlot - b.orderedSlot;
                        return a.originalIndex - b.originalIndex;
                    })
                    .slice(0, maxDisplayedAttachments)
                : preparedUpgrades;

            const displayUpgrades = trimmedUpgrades
                .slice()
                .sort((a, b) => {
                    if (a.orderedSlot !== b.orderedSlot) return a.orderedSlot - b.orderedSlot;
                    if (b.rarity !== a.rarity) return b.rarity - a.rarity;
                    return a.originalIndex - b.originalIndex;
                });

            // attachments and weapon upgrades
            for (let u = 0; u < displayUpgrades.length; u++) {
                const currentUpgrade = displayUpgrades[u];
                const upgradeKey = currentUpgrade.upgradeKey;
                const attachmentRarity = currentUpgrade.rarity;
                const upgradeColor = attachmentRarity >= ATTACHMENT_RARITY_LEGENDARY_THRESHOLD
                    ? UI.battlefieldYellow
                    : attachmentRarity >= ATTACHMENT_RARITY_RARE_THRESHOLD
                        ? UI.battlefieldBlue
                        : UI.battlefieldWhiteAlt;
                const attachmentLabelKey = Weapons.getAttachmentDisplayKey(item, upgradeKey);
                ParseUI({
                    type: "Text",
                    parent: itemContainer,
                    name: `${itemName}_upgrade_text_${u}`,
                    position: [2, upgradeStartOffsetY + (u * upgradeLineHeight)],
                    size: [(cellWidth / 2) + upgradeTextPadding, upgradeLineHeight],
                    anchor: mod.UIAnchor.BottomRight,
                    textAnchor: mod.UIAnchor.CenterRight,
                    textLabel: MakeMessage(attachmentLabelKey),
                    textSize: upgradeTextSize,
                    textColor: upgradeColor,
                    bgAlpha: 0,
                });
            }

            if (rarityKey) {
                ParseUI({
                    type: "Container",
                    name: `${itemName}_rarity_container`,
                    parent: itemContainer,
                    position: [1, 1],
                    size: [cellWidth * rarityWidthRatio, rarityHeight],
                    anchor: mod.UIAnchor.TopRight,
                    bgFill: mod.UIBgFill.GradientRight,
                    bgColor: rarityBg,
                    bgAlpha: 1,
                    depth: mod.UIDepth.AboveGameUI,
                    children: [
                        {
                            type: "Text",
                            name: `${itemName}_rarity`,
                            position: [0, 0],
                            size: [cellWidth * rarityTextWidthRatio, rarityHeight],
                            anchor: mod.UIAnchor.CenterRight,
                            textAnchor: mod.UIAnchor.CenterRight,
                            textLabel: MakeMessage(rarityKey),
                            textSize: 24,
                            textColor: rarityColor,
                            bgAlpha: 0
                        }
                    ]
                });
            }

            // Bundled-gadget frame -- sidearm cards now always bundle an independently-rolled
            // gadget (see Weapons.buildSidearmBundleOptions). Drawn as a second, shorter frame
            // directly ABOVE the sidearm card (between it and the slot label text -- see the
            // cardYOffset/height adjustments made to make room for this). Every other nested-
            // child example in this menu (cardName_background, itemContainer, rarity_container)
            // stays fully inside its parent's own size -- none extend past it -- so rather than
            // assume this UI system doesn't clip children to their container's bounds, this frame
            // is parented as a sibling directly under this.rootWidget at an absolute position
            // mirroring cardWidget's own [xOffset, cardYOffset] coordinate space (the same
            // approach the stacked ammo/resupply notification lines elsewhere in this file use to
            // lay out widgets that must extend beyond a fixed-size box). Its reveal timing is
            // wired through CreateOptionCard's returned `extraContent` array, toggled by
            // RevealCardsSequentially alongside card.content instead of inheriting a shared
            // parent's visibility automatically.
            if (item.inventorySlot === InventorySlot.Sidearm && item.bundledGadget) {
                const bundledGadget = item.bundledGadget;
                const bundleGap = 8; // small vertical gap, consistent with this menu's spacing (half of this.padding)
                const bundleHeight = Math.round(cardHeight * 0.42); // 42% of cardHeight -> 71 at the current rowHeight of 170
                const bundleIconSize = Math.max(bundleHeight - 20, 30);
                const bundleNameTextHeight = 18;
                const bundleNameTextSize = 14;
                // Mirrored upward (subtracted instead of added) to sit above the card instead of below it.
                const bundlePlusY = cardYOffset - (cardHeight / 2) - (bundleGap / 2);
                const bundleFrameY = cardYOffset - (cardHeight / 2) - bundleGap - (bundleHeight / 2);

                // "+" glyph in the gap, reading the two frames as one bundle rather than two
                // unrelated cards.
                const bundlePlus = ParseUI({
                    type: "Text",
                    name: `${itemName}_bundle_plus`,
                    parent: this.rootWidget,
                    position: [xOffset, bundlePlusY],
                    size: [cardWidth, bundleGap + 10],
                    anchor: mod.UIAnchor.Center,
                    textAnchor: mod.UIAnchor.Center,
                    textLabel: MakeMessage(mod.stringkeys.loadout_bundle_plus),
                    textSize: 30,
                    textColor: UI.battlefieldWhiteAlt,
                    bgAlpha: 0,
                    depth: mod.UIDepth.AboveGameUI,
                    visible: false,
                }) as mod.UIWidget;

                const bundleFrame = ParseUI({
                    type: "Container",
                    name: `${itemName}_bundle_frame`,
                    parent: this.rootWidget,
                    position: [xOffset, bundleFrameY],
                    size: [cardWidth, bundleHeight],
                    anchor: mod.UIAnchor.Center,
                    bgFill: mod.UIBgFill.OutlineThin,
                    bgColor: UI.battlefieldWhiteAlt,
                    bgAlpha: 0.1,
                    depth: mod.UIDepth.AboveGameUI,
                    visible: false,
                    children: [
                        {
                            type: "Container",
                            name: `${itemName}_bundle_frame_background`,
                            size: [cardWidth - 1, bundleHeight - 1],
                            position: [0, 0],
                            anchor: mod.UIAnchor.Center,
                            bgFill: mod.UIBgFill.Blur,
                            bgColor: BLACK_COLOR,
                            bgAlpha: 1,
                            depth: mod.UIDepth.AboveGameUI,
                            playerId: this._PlayerProfile.player
                        }
                    ]
                }) as mod.UIWidget;

                if (bundlePlus) extraContent.push(bundlePlus);
                if (bundleFrame) extraContent.push(bundleFrame);

                if (bundleFrame && bundledGadget.gadget) {
                    mod.AddUIGadgetImage(
                        `${itemName}_bundle_icon`,
                        mod.CreateVector(iconOffsetX, 0, 0),
                        mod.CreateVector(bundleIconSize, bundleIconSize, 0),
                        mod.UIAnchor.Center,
                        bundledGadget.gadget as mod.Gadgets,
                        bundleFrame
                    );

                    ParseUI({
                        type: "Text",
                        name: `${itemName}_bundle_name`,
                        parent: bundleFrame,
                        position: [0, 0],
                        size: [cellWidth - textWidthPadding, bundleNameTextHeight],
                        anchor: mod.UIAnchor.BottomLeft,
                        textAnchor: mod.UIAnchor.BottomLeft,
                        textLabel: typeof bundledGadget.text === 'string' ? MakeMessage(bundledGadget.text) : bundledGadget.text,
                        textSize: bundleNameTextSize,
                        textColor: UI.battlefieldWhiteAlt,
                        bgAlpha: 0,
                    });

                    // Rarity banner for the bundled gadget -- same rare/legendary look as the main
                    // card's rarity_container below, scaled down to the shorter bundle frame. No
                    // separate reveal sfx here: PlayRevealSfxForRarity in RevealCardsSequentially
                    // is only ever called once per card, keyed off the sidearm's own item, and this
                    // banner just reveals in lockstep with it via extraContent.
                    const bundleLegendaryThreshold = GetLegendaryThresholdForItem(bundledGadget);
                    const bundleRarityKey = bundledGadget.rarity !== undefined
                        ? (bundledGadget.rarity >= bundleLegendaryThreshold ? mod.stringkeys.rarity_legendary : bundledGadget.rarity >= RARITY_RARE_THRESHOLD ? mod.stringkeys.rarity_rare : undefined)
                        : undefined;
                    if (bundleRarityKey) {
                        const bundleRarityColor = bundledGadget.rarity !== undefined && bundledGadget.rarity >= bundleLegendaryThreshold
                            ? UI.battlefieldYellow
                            : UI.allyBlue;
                        const bundleRarityBg = bundledGadget.rarity !== undefined && bundledGadget.rarity >= bundleLegendaryThreshold
                            ? UI.battlefieldYellowBg
                            : UI.battlefieldBlueBg;
                        const bundleRarityHeight = Math.round(bundleHeight * 0.4);
                        ParseUI({
                            type: "Container",
                            name: `${itemName}_bundle_rarity_container`,
                            parent: bundleFrame,
                            position: [1, 1],
                            size: [cardWidth * rarityWidthRatio, bundleRarityHeight],
                            anchor: mod.UIAnchor.TopRight,
                            bgFill: mod.UIBgFill.GradientRight,
                            bgColor: bundleRarityBg,
                            bgAlpha: 1,
                            depth: mod.UIDepth.AboveGameUI,
                            children: [
                                {
                                    type: "Text",
                                    name: `${itemName}_bundle_rarity`,
                                    position: [0, 0],
                                    size: [cardWidth * rarityTextWidthRatio, bundleRarityHeight],
                                    anchor: mod.UIAnchor.CenterRight,
                                    textAnchor: mod.UIAnchor.CenterRight,
                                    textLabel: MakeMessage(bundleRarityKey),
                                    textSize: 16,
                                    textColor: bundleRarityColor,
                                    bgAlpha: 0
                                }
                            ]
                        });
                    }
                }
            }
        }

        this.optionWidgets.push(cardWidget);

        return { cardWidget, buttonWidget: cardButton, contentWidget: itemContainer as mod.UIWidget, extraContent };
    }
}

class LoadoutDisplayBottomView {

    static instances: LoadoutDisplayBottomView[] = [];
    private rootWidget: mod.UIWidget | undefined;
    private loadoutWidgets: mod.UIWidget[] = [];
    private parentContainers: mod.UIWidget[] = [];

    _PlayerProfile: PlayerProfile;
    playerLoadout: Array<EquippedItem | undefined> = [];

    uiID = "LoadoutDisplayBottomView"
    width = 1024;
    infectedWidth = 400;
    height = 120;
    headerTextSize = 22;
    weaponTextSize = 14;
    loadoutTextSize = 20;
    iconSize = 100;
    linebreakHeight = 1;
    equipmentCellWidth = 100;
    bgColor = UI.battlefieldGrey;
    padding = 10;
    weaponTextAlpha = 0.3;
    containerBgAlpha = 1;

    constructor(PlayerProfile: PlayerProfile) {
        this._PlayerProfile = PlayerProfile;
        LoadoutDisplayBottomView.instances.push(this);
        this.rootWidget = this.CreateUI() as mod.UIWidget
        mod.SetUIWidgetVisible(this.rootWidget, false);
    }

    Delete() {
        // delete widget and remove from instances array
        if (this.rootWidget) {
            mod.DeleteUIWidget(this.rootWidget);
        }
        const i = LoadoutDisplayBottomView.instances.indexOf(this);
        if (i !== 1) LoadoutDisplayBottomView.instances.splice(i, 1);
    }

    async Show() {
        if (this._PlayerProfile.invehicle) {
            this.Hide();
            return;
        }

        if (!this.rootWidget) {
            console.log(`SpawnMessage | rootWidget is undefined! Creating new rootWidget`);
            this.rootWidget = this.CreateUI() as mod.UIWidget;
        } else {
            const headerText = mod.FindUIWidgetWithName(`${this.uiID}_current_loadout_${this._PlayerProfile.playerID}`);
            if (GameHandler.gameState === GameState.GameRoundIsRunning) {
                await mod.Wait(0.25); // wait during player spawn
            }
            if (this._PlayerProfile.invehicle) {
                this.Hide();
                return;
            }
            this.BuildEquipmentIcons();
            if (this._PlayerProfile.invehicle) {
                this.Hide();
                return;
            }

            mod.SetUIWidgetVisible(this.rootWidget, true);
            mod.SetUIWidgetBgAlpha(this.rootWidget, 1);
            if (headerText) mod.SetUITextAlpha(headerText as mod.UIWidget, 1);
            mod.SetUIWidgetDepth(this.rootWidget, mod.UIDepth.AboveGameUI);
        }
    }

    CreateUI() {
        const rootWidget = ParseUI({
            // Container
            type: "Container",
            name: `${this.uiID}_container_${this._PlayerProfile.playerID}`,
            size: [this.width, this.height],
            position: [0, 5], // Move up 5 from bottom center
            anchor: mod.UIAnchor.BottomCenter,
            bgFill: mod.UIBgFill.Blur,
            bgColor: this.bgColor,
            bgAlpha: this.containerBgAlpha,
            depth: mod.UIDepth.AboveGameUI,
            children: [
                {
                    // Container for equipment cells
                    type: "Container",
                    name: `${this.uiID}_equipment_icons_container_${this._PlayerProfile.playerID}`,
                    position: [0, 0],
                    size: [this.width, this.height],
                    anchor: mod.UIAnchor.Center,
                    depth: mod.UIDepth.AboveGameUI,
                    bgAlpha: 0
                }
            ],
            playerId: this._PlayerProfile.player
        });

        return rootWidget
    }

    private UpdateLayoutForSlots(slotCount: number) {
        const targetWidth = this.width;
        if (this.rootWidget) {
            mod.SetUIWidgetSize(this.rootWidget, mod.CreateVector(targetWidth, this.height, 0));
        }
        const equipmentIconsContainer = mod.FindUIWidgetWithName(`${this.uiID}_equipment_icons_container_${this._PlayerProfile.playerID}`);
        if (equipmentIconsContainer) {
            mod.SetUIWidgetSize(equipmentIconsContainer, mod.CreateVector(targetWidth, this.height, 0));
        }
    }

    private BuildBlankItem(slot: InventorySlot): EquippedItem {
        return {
            inventorySlot: slot,
            text: mod.stringkeys.loadout_blank,
            packageImage: mod.CreateNewWeaponPackage(),
        };
    }

    BuildEquipmentIcons() {
        console.log(`SpawnMessage | Building equipment icons for player ${this._PlayerProfile.playerID}`);
        if (this._PlayerProfile.invehicle) {
            this.Hide();
            return;
        }
        const equipmentIconsContainer = mod.FindUIWidgetWithName(`${this.uiID}_equipment_icons_container_${this._PlayerProfile.playerID}`);
        const isInfected = this._PlayerProfile.isInfectedTeam ||
            (mod.GetObjId(mod.GetTeam(this._PlayerProfile.player)) === mod.GetObjId(INFECTED_TEAM));
        if (isInfected) {
            this.playerLoadout = Weapons.GetRoundLoadout(this._PlayerProfile);
        } else {
            const selectedLoadout = Weapons.GetLoadoutFromPlayerProfile(this._PlayerProfile);
            this.playerLoadout = (selectedLoadout && selectedLoadout.length)
                ? selectedLoadout
                : Weapons.GetRoundLoadout(this._PlayerProfile);
        }
        // start with fresh widgets
        if (this.parentContainers.length > 0) {
            let i = 1;
            for (let widget of this.parentContainers) {
                const name = mod.GetUIWidgetName(widget);
                if (DEBUG) console.log(`SpawnMessage | Deleting ${name}...${i++}/${this.parentContainers.length}`);
                try { mod.DeleteUIWidget(widget); } catch (e) { };
                if (DEBUG) console.log(`SpawnMessage | Done!`);
            }
        }
        this.loadoutWidgets = [];
        if (DEBUG) console.log(`SpawnMessage | Creating fresh loadout widgets`);
        if (equipmentIconsContainer) {
            if (DEBUG) console.log(`SpawnMessage | equipmentIconsContainer found...Creating parent containers and child widgets`);
            const orderedSlots = isInfected
                ? [
                    InventorySlot.Gadget,
                    InventorySlot.GadgetSecondary,
                    InventorySlot.Throwable,
                ]
                : [
                    InventorySlot.Sidearm,
                    InventorySlot.Primary,
                    InventorySlot.LMS,
                    InventorySlot.Gadget,
                    InventorySlot.Throwable,
                ];
            const orderedLoadout = isInfected
                ? orderedSlots
                    .map(slot => this.playerLoadout.find(item => item?.inventorySlot === slot))
                    .filter(Boolean) as Array<EquippedItem>
                : orderedSlots
                    .map(slot => this.playerLoadout.find(item => item?.inventorySlot === slot) || this.BuildBlankItem(slot));

            // Calculate width for each item
            const slotCount = isInfected ? orderedLoadout.length : orderedSlots.length;
            this.UpdateLayoutForSlots(slotCount);
            const cellWidth = slotCount > 0 ? this.width / slotCount : this.width;
            const cellHeight = this.height;
            for (let i = 0; i < orderedLoadout.length; i++) {
                const item = orderedLoadout[i];
                if (!item) continue;
                const name = `${this.uiID}_equipment_item_${i}_${this._PlayerProfile.playerID}`;
                const posX = (cellWidth * i) + (cellWidth / 2) - (this.width / 2);
                let slotNameKey: any;
                switch (item.inventorySlot) {
                    case InventorySlot.Primary:
                        slotNameKey = mod.stringkeys.final_five_slot;
                        break;
                    case InventorySlot.LMS:
                        slotNameKey = mod.stringkeys.last_stand_slot;
                        break;
                    case InventorySlot.Sidearm:
                        slotNameKey = mod.stringkeys.sidearm_slot;
                        break;
                    case InventorySlot.Gadget:
                        slotNameKey = isInfected ? mod.stringkeys.gadget_secondary_slot : mod.stringkeys.gadget_slot;
                        break;
                    case InventorySlot.GadgetSecondary:
                        slotNameKey = mod.stringkeys.gadget_slot;
                        break;
                    case InventorySlot.Throwable:
                        slotNameKey = mod.stringkeys.throwable_slot;
                        break;
                }
                const isSurvivor = !isInfected;
                const showUnavailable = GameHandler.gameState === GameState.GameRoundIsRunning || GameHandler.gameState === GameState.GameStartCountdown;
                const isUnavailable = isSurvivor && showUnavailable && (
                    (item.inventorySlot === InventorySlot.Primary && (!this._PlayerProfile.isFinalFive || this._PlayerProfile.isLastManStanding)) ||
                    (item.inventorySlot === InventorySlot.LMS && !this._PlayerProfile.isLastManStanding)
                );
                // Create a container for each item to align image and text vertically
                const itemContainer = ParseUI({
                    type: "Container",
                    name: `${name}_container`,
                    parent: equipmentIconsContainer,
                    position: [posX, 0],
                    size: [cellWidth, cellHeight],
                    anchor: mod.UIAnchor.TopCenter,
                    depth: mod.UIDepth.AboveGameUI,
                    bgAlpha: 0,
                    children: []
                });
                if (itemContainer && slotNameKey) {
                    ParseUI({
                        type: "Text",
                        name: `${name}_slot`,
                        textSize: 14,
                        position: [0, cellHeight - 20],
                        size: [cellWidth, 20],
                        anchor: mod.UIAnchor.TopCenter,
                        textAnchor: mod.UIAnchor.Center,
                        bgAlpha: 1,
                        bgFill: mod.UIBgFill.Blur,
                        bgColor: BLACK_COLOR,
                        textLabel: MakeMessage(slotNameKey),
                        textColor: UI.battlefieldWhiteAlt,
                        parent: itemContainer as mod.UIWidget
                    });
                }
                // separate handling for gadget vs weapon images is needed
                if (item.gadget) {
                    mod.AddUIGadgetImage(
                        `${name}_img`,
                        mod.CreateVector(0, 0, 0),
                        mod.CreateVector(this.iconSize * 0.6, this.iconSize * 0.6, 0),
                        mod.UIAnchor.Center,
                        item.gadget as mod.Gadgets,
                        itemContainer as mod.UIWidget,
                    );
                } else if (item.weapon && item.packageImage) {
                    mod.AddUIWeaponImage(
                        `${name}_img`,
                        mod.CreateVector(0, 0, 0),
                        mod.CreateVector(this.iconSize, this.iconSize, 0),
                        mod.UIAnchor.Center,
                        item.weapon as mod.Weapons,
                        itemContainer as mod.UIWidget,
                        item.packageImage as mod.WeaponPackage
                    );
                }
                const combinedKey = Weapons.getWeaponAmmoCombinedKey(item);
                const resolvedLabelKey = combinedKey && (mod.stringkeys as Record<string, string>)[combinedKey]
                    ? combinedKey
                    : (item.textShortname ? item.textShortname : item.text);

                ParseUI({
                    type: "Text",
                    name: `${name}_text`,
                    parent: itemContainer as mod.UIWidget,
                    position: [0, 0],
                    size: [cellWidth, 20],
                    textAnchor: mod.UIAnchor.Center, // Should center text to box
                    textSize: this.weaponTextSize,
                    textLabel: MakeMessage(resolvedLabelKey),
                    bgColor: isUnavailable
                        ? UI.battlefieldRedBg : isInfected
                            ? UI.battlefieldRedBg : UI.battlefieldBlueBg,
                    bgAlpha: 0.8,
                    depth: mod.UIDepth.AboveGameUI
                });
                if (itemContainer && isUnavailable) {
                    ParseUI({
                        type: "Container",
                        name: `${name}_locked`,
                        parent: itemContainer as mod.UIWidget,
                        position: [0, 0],
                        size: [cellWidth, cellHeight],
                        anchor: mod.UIAnchor.TopCenter,
                        bgFill: mod.UIBgFill.Solid,
                        bgColor: UI.battlefieldRedBg,
                        bgAlpha: 0.4,
                        depth: mod.UIDepth.AboveGameUI,
                    });
                    ParseUI({
                        type: "Container",
                        name: `${name}_locked_outliine`,
                        parent: itemContainer as mod.UIWidget,
                        position: [0, 0],
                        size: [cellWidth, cellHeight],
                        anchor: mod.UIAnchor.TopCenter,
                        bgFill: mod.UIBgFill.OutlineThin,
                        bgColor: UI.battlefieldRed,
                        bgAlpha: 1,
                        depth: mod.UIDepth.AboveGameUI,
                    });
                    ParseUI({
                        type: "Text",
                        name: `${name}_locked_text`,
                        parent: itemContainer as mod.UIWidget,
                        position: [0, -10],
                        size: [cellWidth, cellHeight],
                        anchor: mod.UIAnchor.Center,
                        textAnchor: mod.UIAnchor.Center,
                        textLabel: MakeMessage(mod.stringkeys.locked),
                        textSize: 16,
                        textColor: UI.battlefieldWhite,
                        bgAlpha: 0,
                        depth: mod.UIDepth.AboveGameUI,
                    });
                }
                this.loadoutWidgets.push(
                    mod.FindUIWidgetWithName(`${name}_img`) ?
                        mod.FindUIWidgetWithName(`${name}_img`) : mod.FindUIWidgetWithName(`${name}_img_fallback`),
                    mod.FindUIWidgetWithName(`${name}_text`),
                )
                this.parentContainers.push(
                    mod.FindUIWidgetWithName(`${name}_container`)
                )
            }
        }
    }
    async LerpFadeOut() {
        let currentLerpvalue: number = 0;
        let lerpIncrement: number = 0;
        const headerText = mod.FindUIWidgetWithName(`${this.uiID}_current_loadout_${this._PlayerProfile.playerID}`);
        while (currentLerpvalue < 1.0) {
            lerpIncrement = lerpIncrement + 0.1;
            currentLerpvalue = Helpers.Lerp(currentLerpvalue, 1, lerpIncrement);
            for (let widget of this.loadoutWidgets) {
                try {
                    mod.SetUITextAlpha(widget, 1 - currentLerpvalue);
                } catch (e) { console.log(e) };
            }
            mod.SetUIWidgetBgAlpha(this.rootWidget as mod.UIWidget, 1 - currentLerpvalue);
            mod.SetUITextAlpha(headerText as mod.UIWidget, 1 - currentLerpvalue);
            await mod.Wait(0.0);
        }
        this.Hide();

    }

    Hide() {
        if (!this.rootWidget) return;
        mod.SetUIWidgetVisible(this.rootWidget as mod.UIWidget, false);
    }

}


const gameStateMessageToast = new GameStateNotificationWidget();
const survivorCountNotificationToast = new SurvivorCountNotificationWidget();

/////////////////////////////////////////////////////////////////
///////------------- BOT AND PLAYER PROFILES -------------///////
/////////////////////////////////////////////////////////////////

class PlayerProfile {

    player: mod.Player;
    playerID: number;
    isAI: boolean = false;
    isDead: boolean;
    isAlphaInfected: boolean = false;
    /** Whether this (infected) player is currently inside LEAP_ATTACK_AREA_TRIGGER_ID.
     *  Tracked for all infected (AI included) but only consumed for alpha infected --
     *  see IsLeapAttackAvailableNow. */
    isInLeapAttackArea: boolean = false;
    isInfectedTeam: boolean = false;
    invehicle: boolean = false;
    isLastManStanding: boolean = false;
    isInitialSpawn: boolean = false;
    isFinalFive: boolean = false;
    lmsReloadLoopActive: boolean = false;
    youInfectedWidget?: mod.UIWidget;
    infectedByWidget?: mod.UIWidget;
    playerAreaNotificationWidget?: mod.UIWidget;
    showSurvivorRoadWarning: boolean = false;
    playerAreaHintIndex: number = 0;
    nextPlayerAreaHintRotationAt: number = 0;
    loadoutDisplayBottom?: LoadoutDisplayBottomView;
    lmsBuffWidgets: mod.UIWidget[] = [];
    alphaBuffWidgets: mod.UIWidget[] = [];
    chosenAsAlphaInfectedWidget: mod.UIWidget[] = [];
    playerAmmoFeedbackWidget: mod.UIWidget[] = [];
    // Transient stacked resupply-notification lines (see ShowStackedResupplyFeedback) -- created
    // on demand per multi-item resupply and torn down again once the notification's shown.
    resupplyFeedbackWidgets: mod.UIWidget[] = [];
    teamIndicationWidget: mod.UIWidget[] = [];
    playerStateWidget: mod.UIWidget | undefined;
    _botProfile?: BotProfile;
    spawnerObjID?: number;
    currentTarget?: mod.Player;
    score: number = 0;
    kills: number = 0;
    infected: number = 0;
    deaths: number = 0;
    survived: number = 0;
    chosenLoadoutThisRound?: Array<EquippedItem>;

    scoreboardUI?: ScoreboardUI;
    gameCountdownUI: GameCountdown;
    loadoutSelectionUI?: LoadoutSelectionMenu;
    pendingLoadoutOptions?: SlotLoadoutOptions;
    alphaInfectedWidgetInstances: mod.UIWidget[] = [];


    static alphaInfected: PlayerProfile[] = [];
    /**
     * Holds all human mod.Player instances
     */
    static _playerInstances: mod.Player[] = [];
    static _allPlayerProfiles: PlayerProfile[] = [];
    static _AIPlayerProfiles: PlayerProfile[] = [];

    static _allPlayers: Map<number, PlayerProfile> = new Map();
    /**
     * Map tracking deployed PlayerProfiles (active in-game), keyed by playerObjID.
     * Stores PlayerProfile objects instead of mod.Player to maintain consistent profile references.
     */
    static _deployedPlayers: Map<number, PlayerProfile> = new Map();

    constructor(player: mod.Player) {
        this.player = player;
        this.playerID = mod.GetObjId(player);
        this.isInfectedTeam = false;
        this.isInitialSpawn = true;
        this.isDead = false;
        this.gameCountdownUI = new GameCountdown(this);

        const isAISoldier = SafeIsAISoldier(player);

        if (!isAISoldier) {
            // player-specific UI are created here, hidden by default, and have their own toggle method
            this.scoreboardUI = new ScoreboardUI(this);
            this.loadoutDisplayBottom = new LoadoutDisplayBottomView(this);
            this.loadoutSelectionUI = new LoadoutSelectionMenu(this);
            this.youInfectedWidget = UI.CreateYouInfectedAlert(this);
            this.infectedByWidget = UI.CreateInfectedByAlert(this);
            this.chosenAsAlphaInfectedWidget = [
                this.CreateAlphaInfectedAlert(),
                this.CreateAlphaInfectedFadeLineUI(true), //right side
                this.CreateAlphaInfectedFadeLineUI(false), //left side
            ]

            this.playerAmmoFeedbackWidget = [
                this.CreateAmmoFeedbackUI(),
                this.CreateAmmoFadeLineUI(true), //right side
                this.CreateAmmoFadeLineUI(false), //left side
            ];
            PlayerProfile._playerInstances.push(this.player);
        }

        if (isAISoldier) {
            this.isAI = true;
            PlayerProfile._AIPlayerProfiles.push(this);
        }
        if (!PlayerProfile._allPlayerProfiles.includes(this)) {
            PlayerProfile._allPlayerProfiles.push(this);
        }
        PlayerProfile._allPlayers.set(this.playerID, this);

    }

    static Get(player: mod.Player, spawnerObjID?: number) {
        if (Helpers.HasValidObjId(player)) {
            let index = mod.GetObjId(player);
            let playerProfile = this._allPlayers.get(index);
            const isAISoldier = SafeIsAISoldier(player);
            // create new PlayerProfile if one doesn't exist
            if (!playerProfile) {
                playerProfile = new PlayerProfile(player);
                // AI specific flags
                if (isAISoldier) {
                    console.log(`PlayerProfile | Creating a new AI PlayerProfile for AI Player(${mod.GetObjId(player)})`);
                    playerProfile.isAI = true;
                    if (!PlayerProfile._AIPlayerProfiles.includes(playerProfile)) {
                        PlayerProfile._AIPlayerProfiles.push(playerProfile)
                    }
                    if (!playerProfile.spawnerObjID) {
                        if (!spawnerObjID) {
                            console.log(`PlayerProfile "ERROR" | PlayerProfile is missing a spawnerObj and one wasn't given!`)
                        }
                        console.log(`PlayerProfile | adding spawnerObjID[${spawnerObjID}] to PlayerProfile(${mod.GetObjId(player)})`);
                        playerProfile.spawnerObjID = spawnerObjID;
                    }
                }
                this._allPlayers.set(index, playerProfile);
            }
            // Verify/update spawnerObjID (if provided) and player is AI
            if (isAISoldier) {
                if (spawnerObjID && playerProfile.spawnerObjID !== spawnerObjID) {
                    console.log(`PlayerProfile | Updating spawnerObjID from ${playerProfile.spawnerObjID} to ${spawnerObjID} for AI Player(${mod.GetObjId(player)})`);
                    playerProfile.spawnerObjID = spawnerObjID;
                } else if (!playerProfile.spawnerObjID && spawnerObjID) {
                    console.log(`PlayerProfile | Adding spawnerObjID[${spawnerObjID}] to AI PlayerProfile(${mod.GetObjId(player)})`);
                    playerProfile.spawnerObjID = spawnerObjID;
                }
            }
            if (!this._allPlayers.get(index)) {
                console.log(`PlayerProfile "ERROR" | Could not create a PlayerProfile for this player! ${mod.GetObjId(player)}`);
            }
            return playerProfile;
        }
        console.log('PlayerProfile "WARNING" | Attempted to retrieve a PlayerProfile with an invalid ObjID!');
    }

    static async CustomOnPlayerDeployed(player: mod.Player) {
        if (!Helpers.HasValidObjId(player)) return;

        if (!BOT_SURVIVAL_TEST_MODE) {
            try {
                mod.RemoveEquipment(player, mod.InventorySlots.PrimaryWeapon);
                mod.RemoveEquipment(player, mod.InventorySlots.SecondaryWeapon);
                mod.RemoveEquipment(player, mod.InventorySlots.GadgetOne);
                mod.RemoveEquipment(player, mod.InventorySlots.GadgetTwo);
                mod.RemoveEquipment(player, mod.InventorySlots.ClassGadget);
                mod.RemoveEquipment(player, mod.InventorySlots.MeleeWeapon);
                mod.AddEquipment(player, mod.Gadgets.Melee_Combat_Knife);
            } catch (e) { }
        }

        const playerProfile = PlayerProfile.Get(player);
        if (!playerProfile) {
            console.log(`OnPlayerDeployed "CRITICAL ERROR" | Could not create PlayerProfile for ${mod.GetObjId(player)}`);
            return;
        }
        const playerObjId = mod.GetObjId(player);
        const now = Date.now() / 1000;
        const existingTickState = PLAYER_ONGOING_TICK_STATE.get(playerObjId);
        PLAYER_ONGOING_TICK_STATE.set(playerObjId, {
            nextIconUpdateAt: existingTickState?.nextIconUpdateAt ?? 0,
            nextBannedCheckAt: now + PLAYER_BANNED_CHECK_SETTLE_SECONDS,
            nextLadderCheckAt: existingTickState?.nextLadderCheckAt ?? 0,
            nextBotDebugUpdateAt: existingTickState?.nextBotDebugUpdateAt ?? 0,
            bannedChecksEnabledAt: now + PLAYER_BANNED_CHECK_SETTLE_SECONDS,
            lastLadderAmmo: existingTickState?.lastLadderAmmo,
            nextSledgeReminderAt: existingTickState?.nextSledgeReminderAt,
        });

        playerProfile.isDead = false;

        if (!playerProfile.isAI && !playerProfile.isInfectedTeam && !playerProfile.isAlphaInfected &&
            playerProfile.pendingLoadoutOptions && GameHandler.shouldShowLoadoutSelection) {
            playerProfile.loadoutSelectionUI?.Show(playerProfile.pendingLoadoutOptions);
            playerProfile.pendingLoadoutOptions = undefined;
        }

        if (GameHandler.gameState === GameState.GameRoundIsRunning) {
            playerProfile.scoreboardUI?.Show();
            playerProfile.loadoutDisplayBottom?.Show();
        } else {
            playerProfile.loadoutDisplayBottom?.Hide();
        }
        if (!playerProfile.isInfectedTeam) {
            mod.EnableScreenEffect(player, mod.ScreenEffects.Stealth, false);
            Sandstorm.SyncSandstormScreenEffectForPlayer(player);
            playerProfile.gameCountdownUI?.Close();
        }

        if (playerProfile.isInfectedTeam) {
            InitializePlayerEquipment(player, playerProfile);
            mod.EnableScreenEffect(player, mod.ScreenEffects.Stealth, true);
            Sandstorm.SyncSandstormScreenEffectForPlayer(player);
            if (playerProfile.isAlphaInfected) {
                ShowAlphaInfectedIndicator(player);
            }
        }

        NightMode.SyncNightEffectForPlayer(player);

        if (GameHandler.gameState !== GameState.EndOfRound) {
            console.log(`CustomOnPlayerDeployed | Adding PlayerProfile(${playerProfile.playerID}) to _deployedPlayers Map`);
            PlayerProfile._deployedPlayers.set(playerProfile.playerID, playerProfile);
            console.log(`CustomOnPlayerDeployed | Added PlayerProfile(${playerProfile.playerID}) to _deployedPlayers | Total: ${PlayerProfile._deployedPlayers.size}`);
            if (GameHandler.gameState !== GameState.GameStartCountdown) {
                try { mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, false); } catch { }
                try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveForwardBack, false); } catch { }
                try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveLeftRight, false); } catch { }
                try { mod.EnableInputRestriction(player, mod.RestrictedInputs.Jump, false); } catch { }
            }
        }


        let teamName: string = (mod.GetObjId(INFECTED_TEAM) === mod.GetObjId(mod.GetTeam(player))) ? TeamNameString.Infected : TeamNameString.Survivors;
        if (!SafeIsAISoldier(player) && playerProfile.isInitialSpawn) {
            if (teamName === TeamNameString.Infected && !playerProfile.isInfectedTeam) {
                playerProfile.isInfectedTeam = true;
                GameHandler.infectedCount = Math.min(INFECTED_COUNT_LIMIT, (GameHandler.infectedCount ?? 0) + 1);
                console.log(`CustomOnPlayerDeployed | Initial infected human -> infectedCount: ${GameHandler.infectedCount}`);
                GameHandler.RebuildPlayerLists();
            }
            ScoreboardUI.GlobalUpdate(TeamNameString.Both);
        }
        mod.SetRedeployTime(player, PLAYER_REDEPLOY_TIME);
        // skipmandown applies to the solider on all future death events
        mod.SkipManDown(player, true);
        playerProfile.isInitialSpawn = false;
        playerProfile.scoreboardUI?.RedrawTeamIndicationWidgets(); // ensure team indication outline for this player is correct on deploy
    }

    /**
     * Single Point of control for moving a human player to the infected team.
     * - Plays sound effects, updates redeploy time, increments infected count.
     * - Updates UI, team flags, and checks win conditions.
     * @param mod.Player 
     */
    async SwitchToInfected(player: mod.Player) {
        this.scoreboardUI?.Close();
        if (!this.isInfectedTeam) {
            console.log(`DEBUG | SwitchTeam BEFORE | playerID:${this.playerID} | isInfectedTeam:${this.isInfectedTeam} | infectedCount:${GameHandler.infectedCount}`);
            this.isInfectedTeam = true;
            this.isInitialSpawn = true;
        }
        if (GameHandler.gameState === GameState.GameRoundIsRunning && !GameHandler.suspendWinChecks) {
            Helpers.PlaySoundFX(SFX_SURVIVOR_LOST, 1, SURVIVOR_TEAM);
            Helpers.PlaySoundFX(SFX_POSITIVE, 1, INFECTED_TEAM);
        }
        if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive)) {
            mod.SetRedeployTime(player, PLAYER_REDEPLOY_TIME);
            mod.UndeployPlayer(player); // make sure they're undeployed before attempting to setTeam?
        }
        //increment persistent infectedCount for the round
        GameHandler.infectedCount = Math.min(INFECTED_COUNT_LIMIT, (GameHandler.infectedCount ?? 0) + 1);
        console.log(`DEBUG | SwitchTeam AFTER | playerID:${this.playerID} | isInfectedTeam:${this.isInfectedTeam} | infectedCount:${GameHandler.infectedCount}`);
        mod.SetTeam(player, INFECTED_TEAM); // scoreboard bugs out on local games >:C

        GameHandler.RecalculateCounts();
        GameHandler.RebuildPlayerLists();
        // must refresh both teams since survivors count also decreases
        ScoreboardUI.GlobalUpdate(TeamNameString.Both);
        this.scoreboardUI?.Show();

        // notify all players of remaining survivors
        GameHandler.DisplayUpdatedSurvivorCountNotification();

        if (!GameHandler.suspendWinChecks) {
            await mod.Wait(0.5);
            GameHandler.CheckWinCondition();
        }

        return;
    }

    DeletePlayerAreaNotificationWidget() {
        if (this.playerAreaNotificationWidget) {
            mod.DeleteUIWidget(this.playerAreaNotificationWidget);
            this.playerAreaNotificationWidget = undefined;
        }
        this.showSurvivorRoadWarning = false;
        this.playerAreaHintIndex = 0;
        this.nextPlayerAreaHintRotationAt = 0;
    }

    DeleteLastManStandingBuffWidgets() {
        if (this.lmsBuffWidgets.length === 0) return;
        this.lmsBuffWidgets.forEach(widget => {
            try { mod.DeleteUIWidget(widget); } catch { }
        });
        this.lmsBuffWidgets = [];
    }

    DeleteAlphaBuffWidgets() {
        if (this.alphaBuffWidgets.length === 0) return;
        this.alphaBuffWidgets.forEach(widget => {
            try { mod.DeleteUIWidget(widget); } catch { }
        });
        this.alphaBuffWidgets = [];
    }

    UpdateAlphaBuffWidgets() {
        if (this.isAI) return;

        const shouldShowBuffs = this.isAlphaInfected
            && SafeIsAlive(this.player)
            && GameHandler.gameState === GameState.GameRoundIsRunning;

        if (!shouldShowBuffs) {
            this.DeleteAlphaBuffWidgets();
            return;
        }

        const buffMessages = GetAlphaInfectedBuffMessages(this.player);
        for (let index = 0; index < buffMessages.length; index++) {
            const message = buffMessages[index];
            if (!this.alphaBuffWidgets[index]) {
                const widget = UI.CreateAlphaBuffWidget(this.player, this.playerID, index, message);
                if (widget) {
                    this.alphaBuffWidgets[index] = widget;
                }
            }
            UI.UpdateAlphaBuffWidget(this.playerID, index, message);
        }

        // If leap is currently gated off, remove any stale extra widgets from previous rounds.
        for (let index = buffMessages.length; index < this.alphaBuffWidgets.length; index++) {
            const staleWidget = this.alphaBuffWidgets[index];
            if (staleWidget) {
                try { mod.DeleteUIWidget(staleWidget); } catch { }
            }
        }
        this.alphaBuffWidgets.length = buffMessages.length;
    }

    UpdatePlayerAreaNotificationWidget() {
        if (this.isAI) return;
        if (this.alphaFeedbackBeingShown) {
            if (this.playerAreaNotificationWidget) {
                mod.SetUIWidgetVisible(this.playerAreaNotificationWidget, false);
            }
            return;
        }
        const isInfected = this.isInfectedTeam || (mod.GetObjId(mod.GetTeam(this.player)) === mod.GetObjId(INFECTED_TEAM));
        const isAlive = SafeIsAlive(this.player);
        const isGameRoundActive = GameHandler.gameState === GameState.GameRoundIsRunning;
        const shouldShowSurvivorWarning = !isInfected
            && this.showSurvivorRoadWarning
            && isAlive
            && isGameRoundActive;
        const shouldShowLMSHint = !isInfected
            && this.isLastManStanding
            && isAlive
            && isGameRoundActive;
        const shouldShowHint = isInfected
            && isAlive
            && isGameRoundActive;

        if (!shouldShowHint && !shouldShowSurvivorWarning && !shouldShowLMSHint) {
            this.DeletePlayerAreaNotificationWidget();
            return;
        }

        if (shouldShowSurvivorWarning) {
            if (!this.playerAreaNotificationWidget) {
                this.playerAreaNotificationWidget = UI.CreatePlayerAreaNotificationWidget(
                    this.player,
                    this.playerID,
                    MakeMessage(mod.stringkeys.survivor_area_warning),
                );
            }
            if (this.playerAreaNotificationWidget) {
                UI.UpdatePlayerAreaNotification(
                    this,
                    MakeMessage(mod.stringkeys.survivor_area_warning),
                    mod.UIImageType.QuestionMark,
                    UI.battlefieldBlueBg
                );
            }
            return;
        }

        if (shouldShowLMSHint) {
            const lmsHintMessage = ResolveStringKeyMessage(LMS_HINT_STRING_KEYS[0]);
            if (!this.playerAreaNotificationWidget) {
                this.playerAreaNotificationWidget = UI.CreatePlayerAreaNotificationWidget(
                    this.player,
                    this.playerID,
                    lmsHintMessage,
                );
            }
            if (this.playerAreaNotificationWidget) {
                UI.UpdatePlayerAreaNotification(
                    this,
                    lmsHintMessage,
                    mod.UIImageType.SpawnBeacon,
                    UI.battlefieldBlueBg
                );
            }
            return;
        }

        const now = Date.now() / 1000;
        const leapAvailable = IsLeapAttackAvailableNow(this.player);

        // Alpha infected: show leap charge status when crouching, rotate alpha tips when idle
        if (this.isAlphaInfected) {
            const leapState = LEAP_STATES.get(mod.GetObjId(this.player));
            if (leapAvailable && leapState && leapState.chargeVfxState !== 'none') {
                if (!this.playerAreaNotificationWidget) {
                    this.playerAreaNotificationWidget = UI.CreatePlayerAreaNotificationWidget(
                        this.player,
                        this.playerID,
                        MakeMessage(mod.stringkeys.leap_status_charging, 0, Math.floor(LEAP_CROUCH_HOLD_SECONDS)),
                    );
                }
                // Reset the tip rotation timer so we get a full window after un-crouching
                this.nextPlayerAreaHintRotationAt = now + INFECTED_HINT_ROTATION_SECONDS;
                if (this.playerAreaNotificationWidget) {
                    if (leapState.chargeVfxState === 'charging') {
                        const crouchHeld = leapState.crouchStartTime > 0 ? now - leapState.crouchStartTime : 0;
                        const chargeWhole = Math.floor(crouchHeld * 10);
                        const chargeTotal = Math.floor(LEAP_CROUCH_HOLD_SECONDS);
                        UI.UpdatePlayerAreaNotification(
                            this,
                            MakeMessage(mod.stringkeys.leap_status_charging, chargeWhole, chargeTotal),
                            mod.UIImageType.CrownOutline,
                            UI.battlefieldYellowBg,
                        );
                    } else {
                        if (leapState.previewIsBlocked) {
                            UI.UpdatePlayerAreaNotification(
                                this,
                                MakeMessage(mod.stringkeys.leap_status_no_room),
                                mod.UIImageType.CrownOutline,
                                UI.enemyOrange,
                            );
                        } else {
                            UI.UpdatePlayerAreaNotification(
                                this,
                                MakeMessage(mod.stringkeys.leap_status_ready),
                                mod.UIImageType.CrownSolid,
                                mod.CreateVector(0.063, 0.36, 0.094), //forest green
                            );
                        }
                    }
                }
                return;
            }

            // Not crouching: rotate alpha-specific tips
            if (!this.playerAreaNotificationWidget) {
                this.playerAreaNotificationWidget = UI.CreatePlayerAreaNotificationWidget(
                    this.player,
                    this.playerID,
                    GetAlphaInfectedHintMessage(this.playerAreaHintIndex, this.player),
                );
                this.nextPlayerAreaHintRotationAt = now + INFECTED_HINT_ROTATION_SECONDS;
            } else if (now >= this.nextPlayerAreaHintRotationAt) {
                this.playerAreaHintIndex = (this.playerAreaHintIndex + 1) % GetAlphaInfectedHintKeysForCurrentRound(this.player).length;
                this.nextPlayerAreaHintRotationAt = now + INFECTED_HINT_ROTATION_SECONDS;
            }
            if (this.playerAreaNotificationWidget) {
                UI.UpdatePlayerAreaNotification(
                    this,
                    GetAlphaInfectedHintMessage(this.playerAreaHintIndex, this.player),
                    mod.UIImageType.QuestionMark,
                    UI.battlefieldRedBg
                );
            }
            return;
        }

        // Non-alpha infected: rotate standard infected tips
        if (!this.playerAreaNotificationWidget) {
            this.playerAreaNotificationWidget = UI.CreatePlayerAreaNotificationWidget(
                this.player,
                this.playerID,
                GetInfectedHintMessage(this.playerAreaHintIndex, this.player),
            );
            this.nextPlayerAreaHintRotationAt = now + INFECTED_HINT_ROTATION_SECONDS;
        } else if (now >= this.nextPlayerAreaHintRotationAt) {
            this.playerAreaHintIndex = (this.playerAreaHintIndex + 1) % GetInfectedHintKeysForCurrentRound(this.player).length;
            this.nextPlayerAreaHintRotationAt = now + INFECTED_HINT_ROTATION_SECONDS;
        }
        if (this.playerAreaNotificationWidget) {
            UI.UpdatePlayerAreaNotification(
                this,
                GetInfectedHintMessage(this.playerAreaHintIndex, this.player),
                mod.UIImageType.QuestionMark,
                UI.battlefieldRedBg
            );
        }
    }

    UpdateLastManStandingBuffWidgets() {
        if (this.isAI) return;

        const isSurvivor = !this.isInfectedTeam && (mod.GetObjId(mod.GetTeam(this.player)) === mod.GetObjId(SURVIVOR_TEAM));
        const shouldShowBuffs = isSurvivor
            && this.isLastManStanding
            && SafeIsAlive(this.player)
            && GameHandler.gameState === GameState.GameRoundIsRunning;

        if (!shouldShowBuffs) {
            this.DeleteLastManStandingBuffWidgets();
            return;
        }

        const buffMessages = GetLastManStandingBuffMessages();
        for (let index = 0; index < buffMessages.length; index++) {
            const message = buffMessages[index];
            if (!this.lmsBuffWidgets[index]) {
                const widget = UI.CreateLastManStandingBuffWidget(this.player, this.playerID, index, message);
                if (widget) {
                    this.lmsBuffWidgets[index] = widget;
                }
            }
            UI.UpdateLastManStandingBuffWidget(this.playerID, index, message);
        }
    }

    DebugForceShowAllUIWidgets() {
        if (this.isAI) return;

        this.scoreboardUI?.Show();
        this.gameCountdownUI?.Show();

        const loadoutRoot = mod.FindUIWidgetWithName(`loadout_select_root_${this.playerID}`) as mod.UIWidget;
        if (loadoutRoot) {
            mod.SetUIWidgetVisible(loadoutRoot, true);
        }

        const spawnMessageRoot = mod.FindUIWidgetWithName(`UISpawnMessage_container_${this.playerID}`) as mod.UIWidget;
        if (spawnMessageRoot) {
            mod.SetUIWidgetVisible(spawnMessageRoot, true);
        }

        const singleWidgets: Array<mod.UIWidget | undefined> = [
            this.youInfectedWidget,
            this.infectedByWidget,
            this.playerAreaNotificationWidget,
            this.playerStateWidget,
        ];

        for (const widget of singleWidgets) {
            if (widget) {
                mod.SetUIWidgetVisible(widget, true);
            }
        }

        const widgetGroups: mod.UIWidget[][] = [
            this.chosenAsAlphaInfectedWidget,
            this.playerAmmoFeedbackWidget,
            this.teamIndicationWidget,
            this.alphaInfectedWidgetInstances,
            this.lmsBuffWidgets,
            this.alphaBuffWidgets,
        ];

        for (const group of widgetGroups) {
            for (const widget of group) {
                if (widget) {
                    mod.SetUIWidgetVisible(widget, true);
                }
            }
        }

        const gameStateWidget = mod.FindUIWidgetWithName("game_state_notification_background") as mod.UIWidget;
        if (gameStateWidget) {
            mod.SetUIWidgetVisible(gameStateWidget, true);
        }

        const survivorCountWidget = mod.FindUIWidgetWithName("survivor_count_notification_background") as mod.UIWidget;
        if (survivorCountWidget) {
            mod.SetUIWidgetVisible(survivorCountWidget, true);
        }
    }

    static async ResetAllPlayerProfileFields() {
        PlayerProfile._allPlayerProfiles.forEach(playerProfile => {
            playerProfile.isInitialSpawn = true;
            playerProfile.isFinalFive = false;
            if (GameHandler.preserveAlpha === false && playerProfile.isAlphaInfected) {
                LogAlphaState('ResetPlayerProfileFields | clearing alpha', playerProfile.player, playerProfile, playerProfile._botProfile);
                playerProfile.isAlphaInfected = false;
                if (playerProfile._botProfile) {
                    playerProfile._botProfile.isAlphaInfected = false;
                }
            }
            playerProfile.isLastManStanding = false;
            playerProfile.lmsReloadLoopActive = false;
            playerProfile.invehicle = false;
            playerProfile.DeletePlayerAreaNotificationWidget();
            playerProfile.DeleteLastManStandingBuffWidgets();
            if (GameHandler.shouldShowLoadoutSelection) {
                playerProfile.chosenLoadoutThisRound = undefined;
            }
            playerProfile.pendingLoadoutOptions = undefined;
        })
    }
    /**
     * Centralized function to convert a human survivor to the infected team.
     * Handles count tracking, team assignment, UI updates, and game state checks.
     * Use this whenever a human player needs to switch teams (death, alpha selection, etc).
     * @param player The player to convert
     * @param source The source/reason for the conversion (e.g. "Death", "Alpha Selection")
     */
    async ConvertHumanSurvivorToInfected(player: mod.Player, source: string = "Unknown") {
        if (this.isAI) {
            return;
        }

        if (this.isInfectedTeam) {
            return;
        }

        this.gameCountdownUI?.Close();

        console.log(`ConvertHumanSurvivorToInfected | Converting Player(${this.playerID}) to infected. Source: ${source}`);
        await this.SwitchToInfected(player);
    }


    static GetAllPlayerProfiles() {
        return Object.values(this._allPlayers);
    }

    static RemovePlayerProfile(playerObjId: number) {
        const profile = this._allPlayers.get(playerObjId);
        if (!profile) return;

        profile.DeleteAllUIElements();

        this.alphaInfected = this.alphaInfected.filter(pp => pp.playerID !== playerObjId);
        this._allPlayerProfiles = this._allPlayerProfiles.filter(pp => pp.playerID !== playerObjId);
        this._AIPlayerProfiles = this._AIPlayerProfiles.filter(pp => pp.playerID !== playerObjId);
        this._playerInstances = this._playerInstances.filter(player => mod.GetObjId(player) !== playerObjId);
        this._deployedPlayers.delete(playerObjId);
        this._allPlayers.delete(playerObjId);

        console.log(`RemovePlayerProfile | Fully removed PlayerProfile(${playerObjId}) and cleaned associated UI/state.`);
    }

    static RemoveFromDeployedPlayers(playerObjId: number) {
        const beforeCount = this._deployedPlayers.size;
        this._deployedPlayers.delete(playerObjId);
        const afterCount = this._deployedPlayers.size;
        const removed = beforeCount - afterCount;
        if (removed > 0) {
            console.log(`RemoveFromDeployedPlayers | Removed PlayerProfile(${playerObjId}) | _deployedPlayers size: ${afterCount}`);
        } else {
            console.log(`RemoveFromDeployedPlayers | PlayerProfile(${playerObjId}) not found in _deployedPlayers | Current size: ${afterCount}`);
        }
    }

    /**
     * Clean up invalid or stale entries in _deployedPlayers Map.
     * - Remove profiles with invalid player references
     * - Remove profiles where player is no longer in _allPlayers
     * - Remove profiles where player ObjID is invalid
     */
    static async CleanupDeployedPlayers() {
        const invalidEntries: number[] = [];
        const staleReferences: number[] = [];
        const toDelete: number[] = [];

        for (const [playerObjId, profile] of this._deployedPlayers.entries()) {
            // Remove invalid ObjIDs
            if (!Helpers.HasValidObjId(profile.player)) {
                invalidEntries.push(playerObjId);
                toDelete.push(playerObjId);
                continue;
            }

            // Remove stale references (profile not in _allPlayers or mismatched ObjID)
            if (!PlayerProfile._allPlayers.has(playerObjId) || PlayerProfile._allPlayers.get(playerObjId) !== profile) {
                staleReferences.push(playerObjId);
                toDelete.push(playerObjId);
                continue;
            }
        }

        // Remove invalid/stale entries
        for (const id of toDelete) {
            this._deployedPlayers.delete(id);
        }

        console.log(`CleanupDeployedPlayers | Removed invalid:${invalidEntries.length} stale:${staleReferences.length}`);
        if (invalidEntries.length) {
            console.log(`\tInvalid entries: ${invalidEntries.join(', ')}`);
        }
        if (staleReferences.length) {
            console.log(`\tStale references: ${staleReferences.join(', ')}`);
        }
        console.log(`CleanupDeployedPlayers | _deployedPlayers size after cleanup: ${this._deployedPlayers.size} | Keys: [${Array.from(this._deployedPlayers.keys()).join(', ')}]`);
    }

    /**
     * 
     * Remove if:
     - Profile is AI
     - PlayerProfile playerID doesn't match the map key (stale entry)
     - Player is invalid (ObjID -1 or not alive)
     - PlayerID matches a removed player (duplicate entry for same player)
    */
    static async RemoveAllInvalidPlayerProfiles() {

        // First pass: identify invalid profiles for logging
        const playersToRemove = PlayerProfile._allPlayerProfiles.filter(pp =>
            !this.isValidPlayer(pp.player)
        );
        console.log(`RemoveInvalidPlayerProfiles | _allPlayerProfiles playersToRemove: ${[...playersToRemove].map(p => mod.GetObjId(p.player)).join(", ")}`);

        // Delete all UI elements for profiles being removed
        playersToRemove.forEach(pp => {
            console.log(`\tDeleting UI elements for Player(${pp.playerID})`);
            pp.DeleteAllUIElements();
        });

        // Track removed player IDs to find duplicates
        const removedPlayerIDs = new Set<number>();
        playersToRemove.forEach(pp => removedPlayerIDs.add(pp.playerID));

        // Remove invalid profiles by filtering array
        PlayerProfile._allPlayerProfiles = PlayerProfile._allPlayerProfiles.filter(pp =>
            this.isValidPlayer(pp.player)
        );

        // Clean up _allPlayers Map: remove entries with invalid ObjIDs or stale references
        const keysToDelete: number[] = [];
        PlayerProfile._allPlayers.forEach((pp, key) => {
            if (key === -1 || pp.playerID !== key || (!this.isValidPlayer(pp.player)) || removedPlayerIDs.has(pp.playerID)) {
                console.log(`\tMarking for removal from PlayerProfile._allPlayers map: key(${key}) playerID(${pp.playerID}) isAI(${pp.isAI}) valid(${this.isValidPlayer(pp.player)}) objId(${mod.GetObjId(pp.player)})${removedPlayerIDs.has(pp.playerID) ? ' [DUPLICATE_ID]' : ''}`);
                keysToDelete.push(key);
            }
        });

        keysToDelete.forEach(key => {
            const pp = PlayerProfile._allPlayers.get(key);
            if (pp && !playersToRemove.includes(pp)) {
                // Delete UI for map entries that weren't already cleaned in the array pass
                console.log(`\tDeleting UI elements for map entry Player(${key})`);
                pp.DeleteAllUIElements();
            }
            console.log(`\tRemoving invalid PlayerProfile for map key: ${key}`);
            PlayerProfile._allPlayers.delete(key);
        });

        console.log(`RemoveInvalidPlayerProfiles | _allPlayerProfiles AFTER removal:`);
        Object.values(PlayerProfile._allPlayerProfiles).forEach(pp => {
            console.log(`\t_allPlayerProfiles Array | pp.playerID: ${pp.playerID} mod.ObjID: ${mod.GetObjId(pp.player)} isAI: ${pp.isAI}`);
        });

        console.log(`RemoveInvalidPlayerProfiles | _allPlayers Map AFTER removal:`);
        PlayerProfile._allPlayers.forEach((pp, key) => {
            console.log(`\t_allPlayers Map | key:${key} mod.ObjID:${mod.GetObjId(pp.player)} pp.playerID:${pp.playerID} isAi:${pp.isAI} isInfectedTeam:${pp.isInfectedTeam} isInitialSpawn:${pp.isInitialSpawn}`);
        });
        GameHandler.RebuildPlayerLists();
        return;
    }

    /**
     * Deletes all UI elements associated with this PlayerProfile
     */
    DeleteAllUIElements() {
        try {
            // Delete ScoreboardUI
            if (this.scoreboardUI) {
                this.scoreboardUI.Delete();
                this.scoreboardUI = undefined;
            }

            // Delete GameCountdownUI
            if (this.gameCountdownUI) {
                this.gameCountdownUI.Delete();
            }

            if (this.loadoutSelectionUI) {
                this.loadoutSelectionUI.Delete();
                this.loadoutSelectionUI = undefined;
            }

            // Delete human player-specific UI widgets
            if (!this.isAI) {
                if (this.youInfectedWidget) {
                    mod.DeleteUIWidget(this.youInfectedWidget);
                    this.youInfectedWidget = undefined;
                }
                if (this.infectedByWidget) {
                    mod.DeleteUIWidget(this.infectedByWidget);
                    this.infectedByWidget = undefined;
                }
                this.DeletePlayerAreaNotificationWidget();
                this.DeleteLastManStandingBuffWidgets();

                // Delete alpha infected widget array
                this.chosenAsAlphaInfectedWidget.forEach(widget => {
                    try { mod.DeleteUIWidget(widget); } catch (e) { }
                });
                this.chosenAsAlphaInfectedWidget = [];

                // Delete ammo feedback widgets
                this.playerAmmoFeedbackWidget.forEach(widget => {
                    try { mod.DeleteUIWidget(widget); } catch (e) { }
                });
                this.playerAmmoFeedbackWidget = [];

                // Delete stacked resupply feedback widgets
                this.resupplyFeedbackWidgets.forEach(widget => {
                    try { mod.DeleteUIWidget(widget); } catch (e) { }
                });
                this.resupplyFeedbackWidgets = [];

                // Delete team indication widgets
                this.teamIndicationWidget.forEach(widget => {
                    try { mod.DeleteUIWidget(widget); } catch (e) { }
                });
                this.teamIndicationWidget = [];

                // Delete alpha infected widget instances
                this.alphaInfectedWidgetInstances.forEach(widget => {
                    try { mod.DeleteUIWidget(widget); } catch (e) { }
                });
                this.alphaInfectedWidgetInstances = [];

                // Delete alpha buff widgets
                this.DeleteAlphaBuffWidgets();

                // Delete spawn message
                if (this.loadoutDisplayBottom) {
                    this.loadoutDisplayBottom.Delete();
                    this.loadoutDisplayBottom = undefined;
                }
            }

            console.log(`DeleteAllUIElements | Cleaned up all UI elements for Player(${this.playerID})`);
        } catch (e) {
            console.log(`DeleteAllUIElements | Error cleaning up UI for Player(${this.playerID}): ${e}`);
        }
    }

    async InterpAlphaInfecFeedback() {
        let currentLerpvalue: number = 0;
        let lerpIncrement: number = 0;
        while (currentLerpvalue < 1.0) {
            if (!this.alphaFeedbackBeingShown) break;
            lerpIncrement = lerpIncrement + 0.1;
            currentLerpvalue = Helpers.Lerp(currentLerpvalue, 1, lerpIncrement);
            mod.SetUIWidgetBgAlpha(
                this.chosenAsAlphaInfectedWidget[0],
                1 - currentLerpvalue
            );
            mod.SetUIWidgetBgAlpha(
                this.chosenAsAlphaInfectedWidget[1],
                1 - currentLerpvalue
            );
            mod.SetUIWidgetBgAlpha(
                this.chosenAsAlphaInfectedWidget[2],
                1 - currentLerpvalue
            );
            mod.SetUITextAlpha(
                this.chosenAsAlphaInfectedWidget[0],
                1 - currentLerpvalue
            );
            await mod.Wait(0.0);
        }
    }

    alphaFeedbackBeingShown: boolean = false;

    async ShowAlphaFeedback(messageOverride?: mod.Message) {
        if (!this.chosenAsAlphaInfectedWidget[0]) return;

        let message;
        if (messageOverride) {
            mod.SetUITextLabel(this.chosenAsAlphaInfectedWidget[0], messageOverride);
        } else if (PlayerProfile.alphaInfected.length) {
            if (this.isAlphaInfected) {
                message = MakeMessage(mod.stringkeys.you_are_alpha_infected);
            } else if (PlayerProfile.alphaInfected.length > 1) {
                message = MakeMessage(mod.stringkeys.multiple_alphas);
            } else {
                message = MakeMessage(mod.stringkeys.became_alpha_infected, PlayerProfile.alphaInfected[0].player);
            }
            mod.SetUITextLabel(this.chosenAsAlphaInfectedWidget[0], message);
        }

        this.alphaFeedbackBeingShown = true;
        UI.HidePersonalInfectionAlerts(this, true);
        if (this.playerAreaNotificationWidget) {
            mod.SetUIWidgetVisible(this.playerAreaNotificationWidget, false);
        }
        mod.SetUIWidgetVisible(this.chosenAsAlphaInfectedWidget[0], true);
        mod.SetUIWidgetVisible(this.chosenAsAlphaInfectedWidget[1], true);
        mod.SetUIWidgetVisible(this.chosenAsAlphaInfectedWidget[2], true);

        mod.SetUIWidgetBgAlpha(this.chosenAsAlphaInfectedWidget[0], 1);
        mod.SetUIWidgetBgAlpha(this.chosenAsAlphaInfectedWidget[1], 1);
        mod.SetUIWidgetBgAlpha(this.chosenAsAlphaInfectedWidget[2], 1);

        mod.SetUITextAlpha(this.chosenAsAlphaInfectedWidget[0], 1);

        await mod.Wait(2.9);
        this.InterpAlphaInfecFeedback();
        await mod.Wait(0.1);

        this.alphaFeedbackBeingShown = false;
        mod.SetUIWidgetVisible(this.chosenAsAlphaInfectedWidget[0], false);
        mod.SetUIWidgetVisible(this.chosenAsAlphaInfectedWidget[1], false);
        mod.SetUIWidgetVisible(this.chosenAsAlphaInfectedWidget[2], false);
        this.UpdatePlayerAreaNotificationWidget();
    }
    // also used for vehicle spawning
    CreateAlphaInfectedAlert(): mod.UIWidget {
        const widgetName: string = `alpha_infected_${this.playerID}`;
        let yOffset: number = UI.alphaSelectionY;
        mod.AddUIText(
            widgetName,
            mod.CreateVector(0, yOffset, 0),
            mod.CreateVector(550, 40, 100), //above other below-scoreboard msgs
            mod.UIAnchor.TopCenter,
            MakeMessage(mod.stringkeys.spawn_message, this.player),
            this.player
        );
        let widget = mod.FindUIWidgetWithName(widgetName) as mod.UIWidget;
        mod.SetUITextColor(widget, mod.CreateVector(0.91, 0.91, 0.91)); //darker grey
        mod.SetUITextSize(widget, 22);
        mod.SetUITextAnchor(widget, mod.UIAnchor.Center);
        mod.SetUIWidgetPadding(widget, -100);
        mod.SetUIWidgetVisible(widget, true);
        mod.SetUIWidgetBgFill(widget, mod.UIBgFill.Solid);
        mod.SetUIWidgetBgColor(widget, UI.battlefieldRedBg);
        mod.SetUIWidgetBgAlpha(widget, 0.9);
        mod.SetUIWidgetDepth(widget, mod.UIDepth.AboveGameUI);
        mod.SetUIWidgetVisible(widget, false);

        return widget;
    }

    CreateAlphaInfectedFadeLineUI(right: boolean): mod.UIWidget {
        const widgetName: string = `alpha_infected_fade_line_${right ? 'right' : 'left'}_${this.playerID}`;
        let horizontalOffset: number = right ? 375 : -375;
        let yOffset: number = UI.alphaSelectionY;
        mod.AddUIContainer(
            widgetName,
            mod.CreateVector(horizontalOffset, yOffset, 0),
            mod.CreateVector(200, 40, 100),
            mod.UIAnchor.TopCenter,
            this.player
        );
        let widget = mod.FindUIWidgetWithName(widgetName) as mod.UIWidget;
        mod.SetUIWidgetPadding(widget, 1);
        right
            ? mod.SetUIWidgetBgFill(widget, mod.UIBgFill.GradientLeft)
            : mod.SetUIWidgetBgFill(widget, mod.UIBgFill.GradientRight);
        mod.SetUIWidgetBgColor(widget, UI.battlefieldRedBg);
        mod.SetUIWidgetBgAlpha(widget, 0.9);
        mod.SetUIWidgetVisible(widget, false);
        mod.SetUIWidgetDepth(widget, mod.UIDepth.AboveGameUI);

        return widget;
    }

    async InterpAmmoFeedback() {
        let currentLerpvalue: number = 0;
        let lerpIncrement: number = 0;
        while (currentLerpvalue < 1.0) {
            if (!this.ammoFeedbackBeingShown) break;
            lerpIncrement = lerpIncrement + 0.1;
            currentLerpvalue = Helpers.Lerp(currentLerpvalue, 1, lerpIncrement);
            mod.SetUIWidgetBgAlpha(
                this.playerAmmoFeedbackWidget[0],
                1 - currentLerpvalue
            );
            mod.SetUIWidgetBgAlpha(
                this.playerAmmoFeedbackWidget[1],
                1 - currentLerpvalue
            );
            mod.SetUIWidgetBgAlpha(
                this.playerAmmoFeedbackWidget[2],
                1 - currentLerpvalue
            );
            mod.SetUITextAlpha(
                this.playerAmmoFeedbackWidget[0],
                1 - currentLerpvalue
            );
            await mod.Wait(0.0);
        }

        // ensure fully hidden at end - move to end of ShowAmmoFeedback()?
        for (let widgetComponent of this.playerAmmoFeedbackWidget) {
            mod.SetUIWidgetVisible(widgetComponent, false);
            mod.SetUIWidgetBgAlpha(widgetComponent, 0);
        }
        mod.SetUITextAlpha(this.playerAmmoFeedbackWidget[0], 0);
    }

    ammoFeedbackBeingShown: boolean = false;
    ammoFeedbackQueued: boolean = false;
    queuedAmmo: number = 0;
    queuedIsPrimary: boolean = false;

    async ShowAmmoFeedback(isPrimary: boolean, roundsToAdd: number, messageOverride?: mod.Message) {
        if (this.ammoFeedbackBeingShown) {
            // store and queue the params for display after the current alert
            this.queuedAmmo = roundsToAdd;
            this.queuedIsPrimary = isPrimary;
            this.ammoFeedbackQueued = true;
            return;
        }

        this.ammoFeedbackBeingShown = true;
        let widgetText = mod.FindUIWidgetWithName(`create_ammo_feedback_${this.playerID}`) as mod.UIWidget;
        if (roundsToAdd === 0 || messageOverride) {
            mod.SetUITextLabel(widgetText, messageOverride ? messageOverride : MakeMessage(mod.stringkeys.ammo_full));
            for (let widgetComponent of this.playerAmmoFeedbackWidget) {
                mod.SetUIWidgetBgColor(widgetComponent, UI.battlefieldYellow);
            }
        } else {
            mod.SetUITextLabel(widgetText, MakeMessage(isPrimary ?
                mod.stringkeys.primary_ammo_up : mod.stringkeys.sidearm_ammo_up, roundsToAdd));
            for (let widgetComponent of this.playerAmmoFeedbackWidget) {
                mod.SetUIWidgetBgColor(widgetComponent, isPrimary ? UI.battlefieldWhiteAlt : UI.battlefieldWhite);
            }
        }

        mod.SetUITextAlpha(this.playerAmmoFeedbackWidget[0], 1);
        for (let widgetComponent of this.playerAmmoFeedbackWidget) {
            mod.SetUIWidgetVisible(widgetComponent, true);
            mod.SetUIWidgetBgAlpha(widgetComponent, 1);
        }

        await mod.Wait(messageOverride ? 2 : 0.9);
        this.InterpAmmoFeedback();
        await mod.Wait(0.1);

        if (this.ammoFeedbackQueued) {
            this.ammoFeedbackBeingShown = false;
            this.ammoFeedbackQueued = false;
            await mod.Wait(0.1);
            this.ShowAmmoFeedback(this.queuedIsPrimary, this.queuedAmmo);
            this.queuedAmmo = 0;
            this.queuedIsPrimary = false;
            return;
        }

        this.ammoFeedbackBeingShown = false;
    }

    // Shows one stacked notification bar per item that actually gained ammo from a single
    // resupply interaction (gadgets/sidearm/primary can all resupply at once now -- see
    // OnPlayerInteract). Only used when more than one item was resupplied at once; the single-item
    // case keeps using ShowAmmoFeedback's existing format instead.
    async ShowStackedResupplyFeedback(messages: Array<mod.Message>) {
        this.DeleteResupplyFeedbackWidgets();
        for (let i = 0; i < messages.length; i++) {
            const widget = UI.CreateResupplyFeedbackLine(this.player, this.playerID, i, messages[i]);
            if (widget) this.resupplyFeedbackWidgets.push(widget);
        }
        await mod.Wait(2);
        this.DeleteResupplyFeedbackWidgets();
    }

    DeleteResupplyFeedbackWidgets() {
        if (this.resupplyFeedbackWidgets.length === 0) return;
        this.resupplyFeedbackWidgets.forEach(widget => {
            try { mod.DeleteUIWidget(widget); } catch { }
        });
        this.resupplyFeedbackWidgets = [];
    }

    CreateAmmoFeedbackUI(): mod.UIWidget {
        const widgetName: string = `create_ammo_feedback_${this.playerID}`;
        mod.AddUIText(
            widgetName,
            mod.CreateVector(0, UI.ammoFeedbackY, 0),
            mod.CreateVector(300, 25, 0),
            mod.UIAnchor.TopCenter,
            MakeMessage(mod.stringkeys.ammo_full),
            this.player
        );
        let widget = mod.FindUIWidgetWithName(widgetName) as mod.UIWidget;
        mod.SetUIWidgetBgColor(widget, UI.battlefieldWhite);
        mod.SetUITextColor(widget, mod.CreateVector(0, 0, 0));
        mod.SetUITextSize(widget, 18);
        mod.SetUITextAnchor(widget, mod.UIAnchor.Center);
        mod.SetUIWidgetPadding(widget, -100);
        mod.SetUIWidgetVisible(widget, true);
        mod.SetUIWidgetBgFill(widget, mod.UIBgFill.Solid);
        mod.SetUIWidgetBgAlpha(widget, 0.9);
        mod.SetUIWidgetVisible(widget, false);

        return widget;
    }

    CreateAmmoFadeLineUI(right: boolean): mod.UIWidget {
        const widgetName: string = `ammo_fade_line_${right ? 'right' : 'left'}_${this.playerID}`;
        // let horizontalOffset: number = right ? 150 : -150;
        let horizontalOffset: number = right ? 175 : -175;
        mod.AddUIContainer(
            widgetName,
            mod.CreateVector(horizontalOffset, UI.ammoFeedbackY, 0),
            // mod.CreateVector(150, 25, 0),
            mod.CreateVector(50, 25, 0),
            mod.UIAnchor.TopCenter,
            this.player
        );
        let widget = mod.FindUIWidgetWithName(widgetName) as mod.UIWidget;
        mod.SetUIWidgetPadding(widget, 1);
        right
            ? mod.SetUIWidgetBgFill(widget, mod.UIBgFill.GradientLeft)
            : mod.SetUIWidgetBgFill(widget, mod.UIBgFill.GradientRight);
        mod.SetUIWidgetBgColor(widget, UI.battlefieldWhite);
        mod.SetUIWidgetBgAlpha(widget, 0.9);
        mod.SetUIWidgetVisible(widget, false);

        return widget;
    }

    UpdatePlayerScoreboard() {
        mod.SetScoreboardPlayerValues(
            this.player,
            this.score,
            this.kills,
            this.infected,
            this.deaths,
            this.survived,
        );
    }

    OnDeath() {
        this.isDead = true;
        this.deaths++;
        this.UpdatePlayerScoreboard();

        // redraw team indication border after death
        if (!this.teamIndicationWidget) return;
        for (let widget of this.teamIndicationWidget) {
            mod.DeleteUIWidget(widget);
        };

    }

    /**
     * Lightweight guard to confirm a player reference is usable in game logic.
     * Returns true only when the player is defined, valid, and has a non -1 ObjID.
     * Use this before invoking mod API calls that require a deployed/identified player.
     */
    static isValidPlayer(player: mod.Player | null | undefined): boolean {
        return Helpers.HasValidObjId(player as mod.Player | undefined);
    }

}

type caseOptions = "1 survivor" | "1 infected" | "2+ infected" | "0 survivors"

enum GameState {
    EndOfRound,
    PreGame,
    GameStartCountdown,
    GameRoundIsRunning,
    GameOver
}

class NightMode {
    static nightModeEnabled: boolean = false;

    static Roll(): void {
        NightMode.nightModeEnabled = Math.random() < 0.60;
        console.log(`NightMode | Roll: nightModeEnabled=${NightMode.nightModeEnabled}`);
    }

    static Reset(): void {
        NightMode.nightModeEnabled = false;
    }

    static SyncNightEffectForPlayer(player: mod.Player): void {
        if (!Helpers.HasValidObjId(player)) return;
        if (SafeIsAISoldier(player)) return;
        mod.EnableScreenEffect(player, mod.ScreenEffects.Night, NightMode.nightModeEnabled);
    }

    static SyncNightEffectForAllDeployedPlayers(): void {
        for (const pp of PlayerProfile._allPlayerProfiles) {
            if (pp.isAI || !Helpers.HasValidObjId(pp.player)) continue;
            NightMode.SyncNightEffectForPlayer(pp.player);
        }
    }
}

class Sandstorm {
    static sandstormRollTimeRemaining: number = -1;
    static sandstormRollResolved: boolean = false;
    static sandstormHasAppearedThisRound: boolean = false;
    static sandstormWarningSecondsRemaining: number = 0;
    static sandstormActive: boolean = false;
    static sandstormActiveSecondsRemaining: number = 0;
    static sandstormWarningSfx?: mod.SFX;
    static sandstormWindLoopSfx: mod.SFX[] = [];
    static sandstormFireLoopSfx: mod.SFX[] = [];
    static sandstormLoopFadeToken: number = 0;
    static sandstormFireLoopFadeInToken: number = 0;
    static sandstormFireLoopPreFadeStarted: boolean = false;
    static sandstormClearing: boolean = false;
    static sandstormTickLoopStarted: boolean = false;
    static sandstormFadeCloud: mod.VL7Cloud | undefined;

    static IsSandstormMapEligible(): boolean {
        return CURRENT_MAP === MapNames.SAND2 && !LEAP_TEST_MODE && !BOT_SURVIVAL_TEST_MODE && !NightMode.nightModeEnabled;
    }

    static IsLmsActiveForSandstormChance(): boolean {
        if (GameHandler.survivorsCount === 1) return true;
        return PlayerProfile._allPlayerProfiles.some(pp =>
            !pp.isAI
            && !pp.isInfectedTeam
            && pp.isLastManStanding
            && Helpers.HasValidObjId(pp.player)
            && SafeIsAlive(pp.player)
        );
    }

    static SyncSandstormScreenEffectForPlayer(
        player: mod.Player,
        useTransitionOnEnable: boolean = false,
        useTransitionOnDisable: boolean = false,
    ): void {
        if (!Helpers.HasValidObjId(player)) return;
        if (SafeIsAISoldier(player)) return;

        if (Sandstorm.sandstormActive) {
            if (useTransitionOnEnable) {
                void applyVL7TransitionEffect(player, true);
            } else {
                mod.EnableScreenEffect(player, mod.ScreenEffects.VL7, true);
            }
            return;
        }

        if (useTransitionOnDisable) {
            void applyVL7TransitionEffect(player, false);
            return;
        }

        mod.EnableScreenEffect(player, mod.ScreenEffects.VL7, false);
    }

    static SyncSandstormScreenEffectForAllPlayers(
        useTransitionOnEnable: boolean = false,
        useTransitionOnDisable: boolean = false,
    ): void {
        for (const pp of PlayerProfile._allPlayerProfiles) {
            if (pp.isAI || !Helpers.HasValidObjId(pp.player)) continue;
            Sandstorm.SyncSandstormScreenEffectForPlayer(pp.player, useTransitionOnEnable, useTransitionOnDisable);
        }
    }

    static SetSandstormWhiteSmokeVfxEnabled(enable: boolean): void {
        if (CURRENT_MAP !== MapNames.SAND2) return;
        for (const vfxEntry of GameHandler.sand2_Vfx) {
            if (vfxEntry.object !== mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L) continue;
            try {
                mod.EnableVFX(mod.GetVFX(vfxEntry.id), enable);
            } catch {
                // Best-effort VFX toggle; IDs may not exist in all map versions.
            }
        }
    }

    static SetSandstormJetwashVfxEnabled(enable: boolean): void {
        if (CURRENT_MAP !== MapNames.SAND2) return;
        for (const vfxEntry of GameHandler.sand2_Vfx) {
            if (vfxEntry.object !== mod.RuntimeSpawn_Common.FX_Airplane_Jetwash_Sand) continue;
            try {
                mod.EnableVFX(mod.GetVFX(vfxEntry.id), enable);
            } catch {
                // Best-effort VFX toggle; IDs may not exist in all map versions.
            }
        }
    }

    static TryPlaySandstormSfxById(sfxId: number, attenuation: number, amplitude: number = 1): mod.SFX | undefined {
        if (sfxId <= 0) return undefined;
        try {
            const sfx = mod.GetSFX(sfxId);
            if (mod.GetObjId(sfx) < 0) return undefined;
            const sfxPos = mod.GetObjectPosition(sfx);
            mod.SetSoundAmplitude(sfx, amplitude);
            mod.PlaySound(sfx, amplitude, sfxPos, attenuation);
            return sfx;
        } catch {
            return undefined;
        }
    }

    static async EnsureSandstormWindLoopSfx(initialAmplitude: number = 1): Promise<void> {
        Sandstorm.sandstormWindLoopSfx = Sandstorm.sandstormWindLoopSfx.filter((windLoopSfx) => {
            try {
                return mod.GetObjId(windLoopSfx) > -1;
            } catch {
                return false;
            }
        });

        if (Sandstorm.sandstormWindLoopSfx.length > 0) return;

        let playedWindLoopCount = 0;
        for (const windLoopSfxId of SANDSTORM_WIND_LOOP_SFX_IDS) {
            if (playedWindLoopCount > 0 && SANDSTORM_LOOP_SFX_PLAY_STAGGER_SECONDS > 0) {
                await mod.Wait(SANDSTORM_LOOP_SFX_PLAY_STAGGER_SECONDS);
            }

            const windLoopSfx = Sandstorm.TryPlaySandstormSfxById(
                windLoopSfxId,
                SANDSTORM_WIND_LOOP_SFX_ATTENUATION,
                initialAmplitude,
            );
            if (!windLoopSfx) continue;
            Sandstorm.sandstormWindLoopSfx.push(windLoopSfx);
            playedWindLoopCount++;
        }
    }

    static async EnsureSandstormFireLoopSfx(initialAmplitude: number = 1): Promise<void> {
        Sandstorm.sandstormFireLoopSfx = Sandstorm.sandstormFireLoopSfx.filter((fireLoopSfx) => {
            try {
                return mod.GetObjId(fireLoopSfx) > -1;
            } catch {
                return false;
            }
        });

        if (Sandstorm.sandstormFireLoopSfx.length > 0) return;

        let playedFireLoopCount = 0;
        for (const fireLoopSfxId of SANDSTORM_FIRE_LOOP_SFX_IDS) {
            if (playedFireLoopCount > 0 && SANDSTORM_LOOP_SFX_PLAY_STAGGER_SECONDS > 0) {
                await mod.Wait(SANDSTORM_LOOP_SFX_PLAY_STAGGER_SECONDS);
            }

            const fireLoopSfx = Sandstorm.TryPlaySandstormSfxById(
                fireLoopSfxId,
                SANDSTORM_FIRE_LOOP_SFX_ATTENUATION,
                initialAmplitude,
            );
            if (!fireLoopSfx) continue;
            Sandstorm.sandstormFireLoopSfx.push(fireLoopSfx);
            playedFireLoopCount++;
        }
    }

    static async EnsureSandstormLoopSfx(initialAmplitude: number = 1): Promise<void> {
        await Sandstorm.EnsureSandstormWindLoopSfx(initialAmplitude);

        if (
            SANDSTORM_LOOP_SFX_PLAY_STAGGER_SECONDS > 0
            && Sandstorm.sandstormWindLoopSfx.length > 0
            && Sandstorm.sandstormFireLoopSfx.length === 0
        ) {
            await mod.Wait(SANDSTORM_LOOP_SFX_PLAY_STAGGER_SECONDS);
        }

        await Sandstorm.EnsureSandstormFireLoopSfx(initialAmplitude);
    }

    static SetSandstormFireLoopAmplitude(amplitude: number): void {
        const clampedAmplitude = Math.max(0, Math.min(1, amplitude));

        for (const windLoopSfx of Sandstorm.sandstormWindLoopSfx) {
            if (!windLoopSfx || mod.GetObjId(windLoopSfx) < 0) continue;
            Sandstorm.SetSandstormLoopSfxAmplitudeForAllListeners(windLoopSfx, clampedAmplitude);
        }

        for (const fireLoopSfx of Sandstorm.sandstormFireLoopSfx) {
            if (!fireLoopSfx || mod.GetObjId(fireLoopSfx) < 0) continue;
            Sandstorm.SetSandstormLoopSfxAmplitudeForAllListeners(fireLoopSfx, clampedAmplitude);
        }
    }

    private static SetSandstormLoopSfxAmplitudeForAllListeners(sfx: mod.SFX, amplitude: number): void {
        try { mod.SetSoundAmplitude(sfx, amplitude); } catch { }
        try { mod.SetSoundAmplitude(sfx, amplitude, SURVIVOR_TEAM); } catch { }
        try { mod.SetSoundAmplitude(sfx, amplitude, INFECTED_TEAM); } catch { }

        for (const pp of PlayerProfile._allPlayerProfiles) {
            if (pp.isAI || !Helpers.HasValidObjId(pp.player)) continue;
            try { mod.SetSoundAmplitude(sfx, amplitude, pp.player); } catch { }
        }
    }

    static async FadeInSandstormFireLoopSfxBeforeVl7(fadeToken: number): Promise<void> {
        await Sandstorm.EnsureSandstormLoopSfx(SANDSTORM_LOOP_SFX_MIN_AMPLITUDE);
        Sandstorm.SetSandstormFireLoopAmplitude(SANDSTORM_LOOP_SFX_MIN_AMPLITUDE);
        if (Sandstorm.GetActiveSandstormLoopSfx().length === 0) return;

        const steps = Math.max(
            1,
            Math.ceil(SANDSTORM_LOOP_AUDIO_RAMP_SECONDS / SANDSTORM_LOOP_SFX_FADE_STEP_SECONDS),
        );

        for (let i = 1; i <= steps; i++) {
            if (fadeToken !== Sandstorm.sandstormFireLoopFadeInToken) return;
            if (Sandstorm.sandstormClearing) return;

            const t = i / steps;
            const amplitude =
                SANDSTORM_LOOP_SFX_MIN_AMPLITUDE
                + ((1 - SANDSTORM_LOOP_SFX_MIN_AMPLITUDE) * t);
            Sandstorm.SetSandstormFireLoopAmplitude(amplitude);
            await mod.Wait(SANDSTORM_LOOP_SFX_FADE_STEP_SECONDS);
        }

        if (fadeToken !== Sandstorm.sandstormFireLoopFadeInToken) return;
        if (Sandstorm.sandstormActive || Sandstorm.sandstormClearing) return;
        if (Sandstorm.sandstormWarningSecondsRemaining <= 0) return;
        Sandstorm.BeginSandstorm();
    }

    static GetActiveSandstormLoopSfx(): mod.SFX[] {
        const loopSfx: mod.SFX[] = [];
        for (const windLoopSfx of Sandstorm.sandstormWindLoopSfx) {
            loopSfx.push(windLoopSfx);
        }
        for (const fireLoopSfx of Sandstorm.sandstormFireLoopSfx) {
            loopSfx.push(fireLoopSfx);
        }
        return loopSfx.filter((sfx) => mod.GetObjId(sfx) > -1);
    }

    static StopSandstormWarningSfx(): void {
        if (!Sandstorm.sandstormWarningSfx) return;
        try { mod.StopSound(Sandstorm.sandstormWarningSfx); } catch { }
        Sandstorm.sandstormWarningSfx = undefined;
    }

    static async FadeOutSandstormLoopSfxAndStop(fadeToken: number): Promise<void> {
        const loopSfx = Sandstorm.GetActiveSandstormLoopSfx();

        if (loopSfx.length === 0) {
            Sandstorm.sandstormWindLoopSfx = [];
            Sandstorm.sandstormFireLoopSfx = [];
            return;
        }

        const steps = Math.max(
            1,
            Math.ceil(SANDSTORM_LOOP_AUDIO_RAMP_SECONDS / SANDSTORM_LOOP_SFX_FADE_STEP_SECONDS),
        );

        for (let i = 1; i <= steps; i++) {
            if (fadeToken !== Sandstorm.sandstormLoopFadeToken) return;

            const amplitude = Math.max(0, 1 - (i / steps));
            Sandstorm.SetSandstormFireLoopAmplitude(amplitude);


            await mod.Wait(SANDSTORM_LOOP_SFX_FADE_STEP_SECONDS);
        }

        if (fadeToken !== Sandstorm.sandstormLoopFadeToken) return;

        for (const sfx of loopSfx) {
            try {
                mod.StopSound(sfx);
            } catch {
                // Best-effort stop.
            }
        }


        Sandstorm.sandstormWindLoopSfx = [];
        Sandstorm.sandstormFireLoopSfx = [];
    }

    static StopSandstormLoopSfx(): void {
        Sandstorm.sandstormLoopFadeToken++;
        Sandstorm.sandstormFireLoopFadeInToken++;
        Sandstorm.sandstormFireLoopPreFadeStarted = false;
        Sandstorm.sandstormClearing = false;
        Sandstorm.StopSandstormWarningSfx();

        for (const windLoopSfx of Sandstorm.sandstormWindLoopSfx) {
            try { mod.StopSound(windLoopSfx); } catch { }
        }
        Sandstorm.sandstormWindLoopSfx = [];

        for (const fireLoopSfx of Sandstorm.sandstormFireLoopSfx) {
            try { mod.StopSound(fireLoopSfx); } catch { }
        }
        Sandstorm.sandstormFireLoopSfx = [];
    }

    static ResetSandstormRoundState(): void {
        Sandstorm.sandstormRollTimeRemaining = -1;
        Sandstorm.sandstormRollResolved = true;
        Sandstorm.sandstormHasAppearedThisRound = false;
        Sandstorm.sandstormWarningSecondsRemaining = 0;
        Sandstorm.sandstormActive = false;
        Sandstorm.sandstormClearing = false;
        Sandstorm.sandstormActiveSecondsRemaining = 0;
        Sandstorm.StopSandstormLoopSfx();
        Sandstorm.SetSandstormWhiteSmokeVfxEnabled(false);
        Sandstorm.SetSandstormJetwashVfxEnabled(false);
        Sandstorm.SyncSandstormScreenEffectForAllPlayers(false);
    }

    static StartSandstormTickLoop(): void {
        if (Sandstorm.sandstormTickLoopStarted) return;
        Sandstorm.sandstormTickLoopStarted = true;

        (async () => {
            while (GameHandler.gameState !== GameState.GameOver) {
                Sandstorm.UpdateSandstormEventTick();
                await mod.Wait(1);
            }
            Sandstorm.sandstormTickLoopStarted = false;
        })();
    }

    static InitializeSandstormEventForRound(): void {
        if (!Sandstorm.IsSandstormMapEligible()) {
            Sandstorm.ResetSandstormRoundState();
            return;
        }

        if (Sandstorm.sandstormWarningSecondsRemaining > 0 || Sandstorm.sandstormActive) {
            Sandstorm.sandstormRollTimeRemaining = -1;
            Sandstorm.sandstormRollResolved = true;
            Sandstorm.sandstormHasAppearedThisRound = true;
            console.log('Sandstorm | Carryover active at round start; skipping new roll this round.');
            return;
        }

        const minRemaining = SANDSTORM_MIN_ROUND_TIME_REMAINING_SECONDS + 1;
        const maxRemaining = Math.max(minRemaining, GameHandler.roundTimeRemaining - 1);
        if (maxRemaining <= minRemaining) {
            Sandstorm.sandstormRollTimeRemaining = -1;
            Sandstorm.sandstormRollResolved = true;
            Sandstorm.sandstormHasAppearedThisRound = false;
            return;
        }

        Sandstorm.sandstormRollResolved = false;
        Sandstorm.sandstormHasAppearedThisRound = false;
        Sandstorm.sandstormRollTimeRemaining = Helpers.GetRandomSpawnFromRange(minRemaining, maxRemaining);
        console.log(`Sandstorm | Roll scheduled at <=${Sandstorm.sandstormRollTimeRemaining}s remaining.`);
    }

    static StartSandstormWarning(): void {
        if (Sandstorm.sandstormHasAppearedThisRound) return;

        Sandstorm.sandstormHasAppearedThisRound = true;
        Sandstorm.sandstormLoopFadeToken++;
        Sandstorm.sandstormFireLoopPreFadeStarted = true;
        Sandstorm.sandstormClearing = false;
        Sandstorm.sandstormWarningSecondsRemaining = SANDSTORM_WARNING_LEAD_SECONDS;
        Sandstorm.SetSandstormWhiteSmokeVfxEnabled(true);
        Sandstorm.SetSandstormJetwashVfxEnabled(false);
        const fadeToken = ++Sandstorm.sandstormFireLoopFadeInToken;
        void Sandstorm.FadeInSandstormFireLoopSfxBeforeVl7(fadeToken);
        Sandstorm.sandstormWarningSfx = Sandstorm.TryPlaySandstormSfxById(
            SANDSTORM_WARNING_SFX_ID,
            SANDSTORM_WARNING_SFX_ATTENUATION,
        );
        void GameHandler.DisplayGameStateNotification(MakeMessage(mod.stringkeys.sandstorm_warning));
        console.log(`Sandstorm | Warning started (${SANDSTORM_WARNING_LEAD_SECONDS}s lead).`);
    }

    static BeginSandstorm(): void {
        if (Sandstorm.sandstormActive && !Sandstorm.sandstormClearing) return;

        Sandstorm.sandstormWarningSecondsRemaining = 0;
        Sandstorm.StopSandstormWarningSfx();
        Sandstorm.sandstormActive = true;
        Sandstorm.sandstormClearing = false;
        Sandstorm.sandstormLoopFadeToken++;
        Sandstorm.sandstormFireLoopFadeInToken++;
        Sandstorm.sandstormFireLoopPreFadeStarted = false;
        Sandstorm.sandstormActiveSecondsRemaining = Helpers.GetRandomSpawnFromRange(
            SANDSTORM_DURATION_MIN_SECONDS,
            SANDSTORM_DURATION_MAX_SECONDS,
        );
        Sandstorm.SetSandstormWhiteSmokeVfxEnabled(true);
        Sandstorm.SetSandstormJetwashVfxEnabled(true);
        void Sandstorm.EnsureSandstormLoopSfx(1);
        Sandstorm.SetSandstormFireLoopAmplitude(1);
        Sandstorm.SyncSandstormScreenEffectForAllPlayers(true);
        if (Sandstorm.sandstormFadeCloud) {
            try { mod.UnspawnObject(Sandstorm.sandstormFadeCloud as unknown as mod.Object); } catch { }
            Sandstorm.sandstormFadeCloud = undefined;
        }
        const fadeCloud = mod.SpawnObject(mod.RuntimeSpawn_Common.VL7Cloud, POSITION_HQ1, ZERO_VEC, mod.CreateVector(20, 20, 20)) as mod.VL7Cloud | undefined;
        if (fadeCloud) {
            mod.SetVL7CloudEffects(fadeCloud, true, false, false);
            Sandstorm.sandstormFadeCloud = fadeCloud;
        }
        console.log(`Sandstorm | Active for ${Sandstorm.sandstormActiveSecondsRemaining}s.`);
    }

    static EndSandstorm(): void {
        if (!Sandstorm.sandstormActive || Sandstorm.sandstormClearing) return;

        Sandstorm.sandstormWarningSecondsRemaining = 0;
        Sandstorm.StopSandstormWarningSfx();
        Sandstorm.sandstormClearing = true;
        Sandstorm.sandstormActiveSecondsRemaining = 0;
        Sandstorm.sandstormFireLoopFadeInToken++;
        Sandstorm.SetSandstormJetwashVfxEnabled(false);
        const fadeToken = ++Sandstorm.sandstormLoopFadeToken;

        void (async () => {
            await Sandstorm.FadeOutSandstormLoopSfxAndStop(fadeToken);
            if (fadeToken !== Sandstorm.sandstormLoopFadeToken) return;

            Sandstorm.sandstormActive = false;
            Sandstorm.sandstormClearing = false;
            Sandstorm.SyncSandstormScreenEffectForAllPlayers(false, true);
            if (Sandstorm.sandstormFadeCloud) {
                try { mod.UnspawnObject(Sandstorm.sandstormFadeCloud as unknown as mod.Object); } catch { }
                Sandstorm.sandstormFadeCloud = undefined;
            }
            Sandstorm.SetSandstormWhiteSmokeVfxEnabled(false);
            console.log('Sandstorm | Cleared.');
        })();

        console.log(`Sandstorm | Clearing audio tail (${SANDSTORM_LOOP_AUDIO_RAMP_SECONDS}s).`);
    }

    static UpdateSandstormEventTick(): void {
        if (!Sandstorm.IsSandstormMapEligible()) return;

        if (Sandstorm.sandstormWarningSecondsRemaining > 0) {
            Sandstorm.sandstormWarningSecondsRemaining--;

            if (Sandstorm.sandstormWarningSecondsRemaining > 0
                && Sandstorm.sandstormWarningSecondsRemaining <= SANDSTORM_JETWASH_WARNING_LEAD_SECONDS) {
                Sandstorm.SetSandstormJetwashVfxEnabled(true);
            }

            if (Sandstorm.sandstormWarningSecondsRemaining <= 0 && !Sandstorm.sandstormActive) {
                Sandstorm.BeginSandstorm();
            }
            return;
        }

        if (Sandstorm.sandstormActive) {
            if (Sandstorm.sandstormClearing) return;

            Sandstorm.sandstormActiveSecondsRemaining--;
            if (Sandstorm.sandstormActiveSecondsRemaining <= 0) {
                Sandstorm.EndSandstorm();
            }
            return;
        }

        if (GameHandler.gameState !== GameState.GameRoundIsRunning) return;

        if (Sandstorm.sandstormRollResolved || Sandstorm.sandstormHasAppearedThisRound) return;
        if (GameHandler.roundTimeRemaining <= SANDSTORM_MIN_ROUND_TIME_REMAINING_SECONDS) {
            Sandstorm.sandstormRollResolved = true;
            console.log('Sandstorm | No roll: round time too low.');
            return;
        }
        if (Sandstorm.sandstormRollTimeRemaining < 0) {
            Sandstorm.sandstormRollResolved = true;
            return;
        }
        if (GameHandler.roundTimeRemaining > Sandstorm.sandstormRollTimeRemaining) return;

        Sandstorm.sandstormRollResolved = true;
        const isLms = Sandstorm.IsLmsActiveForSandstormChance();
        const chance = isLms ? SANDSTORM_CHANCE_LMS : SANDSTORM_CHANCE_DEFAULT;
        const roll = Math.random();
        console.log(`Sandstorm | Roll=${roll.toFixed(3)} chance=${chance.toFixed(2)} lms=${isLms}`);

        if (roll <= chance) {
            Sandstorm.StartSandstormWarning();
        } else {
            console.log('Sandstorm | Not triggered this round.');
        }
    }
}

class GameHandler {
    static lmsMusicLoaded: boolean = false;
    static lmsMusicPlaying: boolean = false;
    static readonly lmsSurvivorMusicEvent: mod.MusicEvents = mod.MusicEvents.Core_Overtime_Loop;
    static readonly lmsInfectedMusicEvent: mod.MusicEvents = mod.MusicEvents.Gauntlet_Urgency_FinalMission;

    static EnsureLmsMusicLoaded() {
        if (this.lmsMusicLoaded) return;
        // mod.LoadMusic(mod.MusicPackages.Core);
        // mod.LoadMusic(mod.MusicPackages.Gauntlet);
        // mod.SetMusicParam(mod.MusicParams.BR_Amplitude, 1.8);
        // mod.SetMusicParam(mod.MusicParams.Core_Amplitude, 1.8);
        this.lmsMusicLoaded = true;
    }

    static StartLastManStandingMusic() {
        if (this.lmsMusicPlaying || this.gameState !== GameState.GameRoundIsRunning) return;
        this.EnsureLmsMusicLoaded();
        // mod.PlayMusic(this.lmsSurvivorMusicEvent, SURVIVOR_TEAM);
        // mod.PlayMusic(this.lmsInfectedMusicEvent, INFECTED_TEAM);
        this.lmsMusicPlaying = true;
    }

    static StopLastManStandingMusic() {
        if (!this.lmsMusicPlaying) return;
        // mod.PlayMusic(mod.MusicEvents.Core_Stop, SURVIVOR_TEAM);
        // mod.PlayMusic(mod.MusicEvents.Gauntlet_Stop, INFECTED_TEAM);
        this.lmsMusicPlaying = false;
    }

    static breakableDefenseProps = [

        { id: mod.RuntimeSpawn_Sand.WoodCratePack_01, position: { x: -30.36, y: 35.407, z: -18.371 }, rotation: { x: 0, y: 0.002, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Sand.WoodCratePack_01, position: { x: -32.203, y: 35.407, z: -18.896 }, rotation: { x: 0, y: -0.707, z: 0, w: 0.707 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Sand.WoodCratePack_01, position: { x: -43.915, y: 32.476, z: -18.62 }, rotation: { x: 0, y: 1, z: 0, w: 0 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },


        { id: mod.RuntimeSpawn_Sand.BarricadeboardsWood_01_A, position: { x: -28.806, y: 32.655, z: -16.179 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Sand.BarricadeboardsWood_01_B, position: { x: -29.342, y: 37.398, z: 1.965 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Sand.BarricadeboardsWood_01_B, position: { x: -28.047, y: 37.398, z: 1.965 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Sand.BarricadeboardsWood_01_B, position: { x: -30.243, y: 32.844, z: -7.651 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.1, z: 1.0 } },
        { id: mod.RuntimeSpawn_Sand.BarricadeboardsWood_01_B, position: { x: -28.975, y: 32.844, z: -7.651 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.1, z: 1.0 } },
        { id: mod.RuntimeSpawn_Sand.ScaffoldingWalkway_01_A_512x160, position: { x: -44.978, y: 37.92, z: -16.91 }, rotation: { x: 0, y: -0.026, z: 0.004, w: 1.0 }, scale: { x: 0.9, y: 1.1, z: 1.0 } },

        // doors are likely causing server crashes
        // [
        //     { id: mod.RuntimeSpawn_Sand.DoorRural_02, position: { x: -26.285, y: 32.654, z: -32.535 }, rotation: { x: 0, y: 0.707, z: 0, w: 0.707 }, scale: { x: 1.0, y: 1.1, z: 1.0 } },
        //     { id: mod.RuntimeSpawn_Sand.DoorRural_02, position: { x: -48.876, y: 32.74, z: -39.699 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.1, z: 1.0 } },
        //     { id: mod.RuntimeSpawn_Sand.DoorRural_02, position: { x: -39.066, y: 32.871, z: -5.294 }, rotation: { x: 0, y: 0.707, z: 0, w: 0.707 }, scale: { x: 1.26, y: 1.1, z: 1.0 } },
        //     { id: mod.RuntimeSpawn_Sand.DoorRural_02, position: { x: -18.863, y: 32.871, z: -1.284 }, rotation: { x: 0, y: -0.707, z: 0, w: 0.707 }, scale: { x: 1.26, y: 1.1, z: 1.0 } },
        // ],

        { id: mod.RuntimeSpawn_Sand.BarrierConcreteWall_01_192x320, position: { x: -27.848, y: 32.24, z: -48.2 }, rotation: { x: 0, y: -0.7, z: 0, w: 0.714 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Sand.BarrierConcreteWall_01_192x320, position: { x: -27.876, y: 32.24, z: -50.113 }, rotation: { x: 0, y: -0.7, z: 0, w: 0.714 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Sand.BarrierConcreteWall_01_Row3, position: { x: -29.392, y: 32.147, z: -56.257 }, rotation: { x: 0, y: 0.7, z: 0, w: 0.714 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Sand.BarrierConcreteWall_01_Row3, position: { x: -28.712, y: 32.147, z: -61.998 }, rotation: { x: 0, y: 0.618, z: 0, w: 0.786 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },

        { id: mod.RuntimeSpawn_Sand.PalletWoodenPile_01_C, position: { x: -30.597, y: 32.497, z: -14.92 }, rotation: { x: 0, y: 0.713, z: 0, w: 0.701 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },

        // exploding things
        { id: mod.RuntimeSpawn_Sand.VanPassenger_01, position: { x: -52.167, y: 32.469, z: -19.503 }, rotation: { x: 0, y: -0.695, z: 0, w: 0.719 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Sand.GasCylinder_01_Large, position: { x: -27.376, y: 32.446, z: -48.213 }, rotation: { x: 0, y: 0, z: -0.009, w: 1.0 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.BarrelOil_01_A, position: { x: -28.55, y: 32.939, z: -55.37 }, rotation: { x: 0, y: -0.727, z: 0, w: 0.687 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.BarrelOil_01_A, position: { x: -38.104, y: 32.947, z: -18.682 }, rotation: { x: 0, y: -0.024, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.BarrelOilExplosive_01, position: { x: -38.432, y: 32.476, z: -18.997 }, rotation: { x: 0, y: 0, z: 0, w: 1.0 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.BarrelOilExplosive_01, position: { x: -28.206, y: 32.474, z: -55.705 }, rotation: { x: 0, y: 0, z: 0, w: 1.0 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.BarrelOilExplosive_01, position: { x: -52.326, y: 32.488, z: -20.793 }, rotation: { x: 0, y: 0, z: 0, w: 1.0 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Sand.PortableDieselEngine_01, position: { x: -31.128, y: 37.322, z: -1.62 }, rotation: { x: 0, y: 1, z: 0, w: -0.011 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Sand.GarbageCluster_02_A, position: { x: -27.747, y: 32.461, z: -47.705 }, rotation: { x: 0, y: 0.269, z: 0, w: 0.963 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },

        // decoration
        { id: mod.RuntimeSpawn_Sand.CardboardTrashPile_01_A, position: { x: -27.105, y: 32.518, z: -49.61 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
    ];

    static sandFXProps = [
        { id: mod.RuntimeSpawn_Common.FX_BASE_Fire_L, position: { x: 12.807, y: 33.216, z: -18.708 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_CarFire_FrameCrawl, position: { x: 12.807, y: 33.226, z: -18.708 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_Black_L, position: { x: 12.807, y: 33.216, z: -18.708 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        // wrecked car by trees 
        { id: mod.RuntimeSpawn_Common.FX_CarFire_FrameCrawl, position: { x: -6.337, y: 33.198, z: -6.141 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_Car_Fire_M_GS, position: { x: -5.944, y: 32.896, z: -8.017 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        // supposed to be center-ish, only birds are working
        { id: mod.RuntimeSpawn_Common.FX_BASE_Birds_Black_Circulating, position: { x: -46.727, y: 32.668, z: -29.203 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_Snow_BlowingSnow_S_01_inShadow, position: { x: -46.727, y: 32.668, z: -29.203 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_BASE_Dust_Large_Area, position: { x: -46.727, y: 32.668, z: -23.676 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_BASE_DeployClouds_Var_A, position: { x: -46.727, y: 32.668, z: -25.676 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_BASE_DeployClouds_Var_B, position: { x: -46.727, y: 32.668, z: -27.203 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
    ];

    // VFX placed as nodes in the Godot scene enabled via mod.GetVFX(id)
    static sand2_Vfx = [
        // { id: 501, object: mod.RuntimeSpawn_Common.FX_Granite_Strike_Smoke_Marker_Red },
        { id: 1501, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Column_XXL },
        { id: 1502, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_Black_L },
        { id: 1503, object: mod.RuntimeSpawn_Common.FX_CarFire_FrameCrawl },
        { id: 1504, object: mod.RuntimeSpawn_Common.FX_Snow_BlowingSnow_S_01_inShadow },
        { id: 1505, object: mod.RuntimeSpawn_Common.FX_BASE_Fire_M },
        { id: 1506, object: mod.RuntimeSpawn_Common.FX_BASE_Fire_M_NoSmoke },
        { id: 1507, object: mod.RuntimeSpawn_Common.FX_BASE_Fire_L },
        { id: 1508, object: mod.RuntimeSpawn_Common.FX_Snow_BlowingSnow_S_01_inShadow },
        { id: 1509, object: mod.RuntimeSpawn_Common.FX_Snow_BlowingSnow_XS_01 },
        { id: 1206, object: mod.RuntimeSpawn_Common.FX_Building_FallingDustSand },
        { id: 1510, object: mod.RuntimeSpawn_Common.FX_BASE_Fire_XL },
        { id: 1511, object: mod.RuntimeSpawn_Common.FX_Snow_BlowingSnow_S_01_inShadow },
        { id: 1512, object: mod.RuntimeSpawn_Common.FX_Car_Fire_M_GS },
        { id: 1513, object: mod.RuntimeSpawn_Common.FX_BASE_DeployClouds_Var_A },
        { id: 1514, object: mod.RuntimeSpawn_Common.FX_BASE_Fire_Oil_Medium },
        { id: 1540, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1541, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1542, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1543, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1544, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1545, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1546, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1547, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        // { id: 1548, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1549, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1550, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1551, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1552, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1553, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1554, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1555, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1556, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        // { id: 1557, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        // { id: 1558, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        // { id: 1559, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1560, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1561, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1562, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1563, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1564, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1565, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1566, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1567, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1568, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1569, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1570, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1571, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1572, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1573, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1574, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1575, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1576, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1577, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1578, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1579, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1580, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1581, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1582, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1583, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1584, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1585, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1586, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1587, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1588, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1589, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1590, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1591, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1592, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L },
        { id: 1601, object: mod.RuntimeSpawn_Common.FX_Airplane_Jetwash_Sand },
        { id: 1602, object: mod.RuntimeSpawn_Common.FX_Airplane_Jetwash_Sand },
        { id: 1603, object: mod.RuntimeSpawn_Common.FX_Airplane_Jetwash_Sand },
        { id: 1604, object: mod.RuntimeSpawn_Common.FX_Airplane_Jetwash_Sand },
        { id: 1605, object: mod.RuntimeSpawn_Common.FX_Airplane_Jetwash_Sand },
        { id: 1606, object: mod.RuntimeSpawn_Common.FX_Airplane_Jetwash_Sand },
        { id: 1607, object: mod.RuntimeSpawn_Common.FX_Airplane_Jetwash_Sand },
        { id: 1608, object: mod.RuntimeSpawn_Common.FX_Airplane_Jetwash_Sand },
        { id: 1609, object: mod.RuntimeSpawn_Common.FX_Airplane_Jetwash_Sand },
        { id: 1610, object: mod.RuntimeSpawn_Common.FX_Airplane_Jetwash_Sand },
    ];

    static sand2_Sfx = [
        { id: 2501, attenuation: 40, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_MP_Outskirts_Spots_Wind_DesertWindGusts_SimpleLoop3D },
        { id: 2503, attenuation: 5, object: mod.RuntimeSpawn_Common.SFX_Destruction_Fuse_Loop_GasFire_SimpleLoop3D },
        { id: 2504, attenuation: 4, object: mod.RuntimeSpawn_Common.SFX_Levels_Brooklyn_Shared_Spots_GarbageFlies_SimpleLoop3D },
        { id: 2505, attenuation: 25, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_MP_Outskirts_Spots_Wind_HowlingWarm_SimpleLoop3D },
        { id: 2506, attenuation: 40, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_SP_NightRaid_Spots_HighwayUnderneath_SimpleLoop3D },
        { id: 2507, attenuation: 40, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_SP_NightRaid_Spots_HighwayUnderneath_SimpleLoop3D },
        { id: 2508, attenuation: 40, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_SP_NightRaid_Spots_HighwayUnderneath_SimpleLoop3D },
        { id: 2509, attenuation: 40, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_MP_Outskirts_Spots_Wind_HeavyGusts_SimpleLoop3D },
        { id: 2510, attenuation: 50, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_MP_Outskirts_Spots_Wind_HeavyGusts_SimpleLoop3D },
        { id: 2511, attenuation: 20, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_MP_Outskirts_Spots_Wind_HowlingHollow_High_SimpleLoop3D },
        { id: 2512, attenuation: 20, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_MP_Outskirts_Spots_Wind_HowlingHollow_High_SimpleLoop3D },
        // { id: 2513, attenuation: 4, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_SP_NightRaid_Spots_Sewers_WaterDrippingLarge_SimpleLoop3D }, //removed
        { id: 2514, attenuation: 4, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_SP_NightRaid_Spots_Sewers_WaterDrippingLarge_SimpleLoop3D },
        { id: 2515, attenuation: 40, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_MP_Shared_Bigworld_Winds_SandMist_SimpleLoop3D },
        { id: 2516, attenuation: 40, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_SP_NightRaid_Spots_Riot_CrowdRumble_SimpleLoop3D },
        { id: 2517, attenuation: 40, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_MP_Outskirts_Spots_PigeonTowerCreak_SimpleLoop3D },
    ];

    // unused, add later for non-AI conditions
    // static breakableDefensePropsNoAI = [
    //     { id: mod.RuntimeSpawn_Sand.CarpetFoldedPile_01, position: { x: -25.706, y: 32.879, z: 0.078 }, rotation: { x: 0, y: 0.706, z: 0, w: 0.708 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
    //     { id: mod.RuntimeSpawn_Sand.WoodCratePack_01, position: { x: -27.677, y: 32.872, z: -1.286 }, rotation: { x: 0, y: 1.0, z: 0, w: 0.013 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
    //     { id: mod.RuntimeSpawn_Sand.WoodCratePack_01, position: { x: -50.886, y: 32.472, z: -21.064 }, rotation: { x: 0, y: 1, z: 0, w: 0 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
    // ]

    static spawnedDefenseProps: any[] = [];
    static spawnedFXProps: any[] = [];
    // game timers
    static roundTimeRemaining: number = ROUND_DURATION;
    static countdownTimeRemaining: number = GAME_COUNTDOWN_TIME;

    // prevent immediate end-of-round checks for a short time after a round starts
    static roundStartGraceMs: number = 1500;
    static suspendWinChecks: boolean = false;
    static survivorAlertVersion: number = 0;
    static gameStateAlertVersion: number = 0;

    // player counts
    static survivorsCount: number = 0;
    static infectedCount: number = 0;

    // number of currently alive infected (used for win checks / UI), separate from infectedCount which is more stable for the round
    static aliveInfectedCount: number = 0;
    static totalPlayers: number = 0;
    static humanPlayers: number = 0;

    // game states
    static gameState = GameState.PreGame
    static currentRound: number = 1;
    static survivorsRoundsWon: number = 0;
    /**
     * Tracks the condition that ended the round, driving round transitions.
     * Possible values:
     *  - "0 survivors": All survivors eliminated, triggers reset to initial round.
     *  - "1 survivor": Only one survivor remains, triggers alpha infected selection (currently disabled)
     *  - "1 infected": Only one infected remains, resets survivors and infected for next round.
     *  - "2+ infected": Multiple infected and survivors remain, recycles team counts for next round.
     *  - TODO: Increase zombie count by 50% until we get either 1 survivor or 0 survivors
     *  -  Used by GameHandler.HandleEoRSpawns to determine next round setup.
     * @todo Mark last man standing as the alpha infected for next round
     */
    static endOfRoundCondition: caseOptions;

    // spawn systems
    /**
     * Number of AI slots available = MAX_PLAYER_COUNT minus current human player count.
     * Automatically reflects joins and leaves via RebuildPlayerLists().
     */
    static get aiSlotsToBackfill(): number {
        return Math.max(0, MAX_PLAYER_COUNT - GameHandler.allHumanPlayers.length);
    }
    static survivorsNextRound: number = 0;
    static infectedNextRound: number = 0;
    static isSpawnCheckRunning: boolean = false;
    static skipAlphaSelection: boolean = false;
    static preserveAlpha: boolean = false;
    static nextRoundFinalFive: boolean = false;
    static vehicleSpawnedThisRound: boolean = false;
    static shouldShowLoadoutSelection: boolean = true;
    /** Accumulates 25 % per round that 2+ survivors remain; resets when LMS or 0-survivors triggers. */
    static infectedSpawnMultiplier: number = 1.0;
    /** True once the parachute spawner pool has been unlocked (first time 2+ survivors survive). */
    static parachuteSpawnersEnabled: boolean = false;

    // Recent infected increment events (for detecting accidental double-increments)
    // Each entry: { t: timestamp_ms, source: string, playerID?: number }
    static recentInfectedIncrements: { t: number; source: string; playerID?: number }[] = [];
    static infectedIncrementWarnings: number = 0;
    static lastAlphaPlayerID?: number;
    static nextRoundForcedAlphaPlayerID?: number;

    // Human arrays are authoritative and updated on every join/leave/team-change event.
    // AI arrays contain only currently-alive slot players; infected bot deaths during the
    // round do NOT trigger a rebuild (the count stays stable until respawn fires).
    static allPlayers: mod.Player[] = [];
    static allHumanPlayers: mod.Player[] = [];
    static humanSurvivors: mod.Player[] = [];
    static humanInfected: mod.Player[] = [];
    static aiSurvivors: mod.Player[] = [];
    static aiInfected: mod.Player[] = [];

    static WaitForAllDeploys(timeoutSeconds: number): Promise<boolean> {
        console.log(`WaitForAllDeploys | waiting up to ${timeoutSeconds}s for PlayerProfile._deployedPlayers to include all players (Human and AI)`);
        const timeoutMs = timeoutSeconds * 1000;
        const start = Date.now();

        return new Promise<boolean>(async (resolve) => {
            while (true) {
                if (Date.now() - start > timeoutMs) {
                    console.log('WaitForAllDeploys | timeout elapsed');
                    break;
                }

                // If bots are still pending spawn from spawners, wait until they resolve
                const pendingSpawns = InfectedBotSlot.pendingBySpawnerID.size + SurvivorBotSlot.pendingBySpawnerID.size;
                if (pendingSpawns > 0) {
                    console.log(`WaitForAllDeploys | Waiting for ${pendingSpawns} bot(s) to spawn from spawners: [${[...InfectedBotSlot.pendingBySpawnerID.keys(), ...SurvivorBotSlot.pendingBySpawnerID.keys()].join(', ')}]`);
                    await mod.Wait(0.25);
                    continue;
                }

                // Build list of required human player IDs
                let requiredHumans = PlayerProfile._allPlayerProfiles
                    .filter(pp => !pp.isAI)
                    .map(pp => mod.GetObjId(pp.player));
                const humansWithInvalidObjId = requiredHumans.filter(id => id === -1).length;
                if (humansWithInvalidObjId > 0) {
                    await mod.Wait(0.25);
                    // Re-evaluate on next loop
                    continue;
                }
                // Only keep humans that have a valid ObjID
                requiredHumans = requiredHumans.filter(id => id > -1);

                // Build set of currently deployed human IDs
                const deployedIds = Array.from(PlayerProfile._deployedPlayers.keys());

                // Check every required human is present in deployed list and alive
                let allReady = true;
                for (const id of requiredHumans) {
                    if (!deployedIds.includes(id)) {
                        allReady = false;
                        break;
                    }
                    // verify alive state
                    const deployedProfile = PlayerProfile._deployedPlayers.get(id);
                    if (!deployedProfile || !mod.GetSoldierState(deployedProfile.player, mod.SoldierStateBool.IsAlive)) {
                        allReady = false;
                        break;
                    }
                }

                if (allReady) {
                    console.log('WaitForAllDeploys | all Human and AI players are deployed and alive');
                    await mod.Wait(0.15); // small settle
                    resolve(true);
                    return;
                }

                await mod.Wait(0.25);
            }
            resolve(false);
        });
    }

    static SpawnDefenses() {
        // removes and respawns a selection of destructible assets each round
        this.spawnedDefenseProps.forEach(propObj => {
            if (propObj !== null && propObj !== undefined) {
                mod.UnspawnObject(propObj)
            }
        });

        this.spawnedDefenseProps = [];

        this.breakableDefenseProps.forEach((prop, propIndex) => {
            const obj = GameHandler.SpawnObjectFromGodot(prop as ObjectTransform);
            this.spawnedDefenseProps.push(obj);
        });
    }

    static ClearSpawnedDefenses() {
        this.spawnedDefenseProps.forEach(propObj => {
            if (propObj !== null && propObj !== undefined) {
                mod.UnspawnObject(propObj)
            }
        });

        this.spawnedDefenseProps = [];
    }

    static SpawnVehicle() {
        // Pick a random spawner location and vehicle type each time final five triggers
        const spawnerID = VEHICLE_SPAWNER_IDS[Math.floor(Math.random() * VEHICLE_SPAWNER_IDS.length)];
        const vehicleType = VEHICLE_TYPES[Math.floor(Math.random() * VEHICLE_TYPES.length)];
        const spawner = mod.GetVehicleSpawner(spawnerID);
        mod.SetVehicleSpawnerVehicleType(spawner, vehicleType);
        mod.ForceVehicleSpawnerSpawn(spawner);
        console.log(`SpawnVehicle | spawnerID=${spawnerID} vehicleType=${mod.VehicleList[vehicleType]}`);
    }

    static SpawnFX(mapSelection: MapNames | undefined) {
        // spawns a selection of map-specifix VFX - Sand and Sand2 supported currently
        this.spawnedFXProps.forEach((fxAsset) => {
            if (fxAsset !== null && fxAsset !== undefined) {
                mod.UnspawnObject(fxAsset)
            }
        })
        this.spawnedFXProps = [];
        let propsToSpawn: any[] = [];
        let vfxToActivate: any[] = [];
        switch (mapSelection) {
            case MapNames.SAND:
                propsToSpawn = this.sandFXProps;
                break;
            case MapNames.SAND2:
                vfxToActivate = this.sand2_Vfx;
                break;
            default:
                return;
        }
        propsToSpawn.forEach(fxAsset => {
            const asset = GameHandler.SpawnObjectFromGodot(fxAsset as ObjectTransform);
            this.spawnedFXProps.push(asset);
        });
        if (vfxToActivate.length > 0) {
            for (const vfxEntry of vfxToActivate) {
                const enableByDefault =
                    vfxEntry.object !== mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_White_L
                    && vfxEntry.object !== mod.RuntimeSpawn_Common.FX_Airplane_Jetwash_Sand;
                mod.EnableVFX(mod.GetVFX(vfxEntry.id), enableByDefault);
            }
        }
    }

    static EnableSFX(mapSelection: MapNames | undefined) {
        let sfxToPlay: any[] = [];
        switch (mapSelection) {
            case MapNames.SAND2:
                sfxToPlay = this.sand2_Sfx;
                break;
            default:
                return;
        }
        sfxToPlay.forEach(sfxID => {
            const sfx = mod.GetSFX(sfxID.id);
            const sfxPos = mod.GetObjectPosition(sfx);
            if (sfxID.object) {
                mod.PlaySound(sfx, 1, sfxPos, sfxID.attenuation);
            }
        });
    }

    static SpawnRoundMapContent(mapSelection: MapNames | undefined) {
        const shouldSpawnDefenses = mapSelection === MapNames.SAND;

        if (shouldSpawnDefenses) {
            this.SpawnDefenses();
        } else {
            this.ClearSpawnedDefenses();
        }

        this.SpawnFX(mapSelection);
        this.EnableSFX(mapSelection);
    }

    static async SuspendWinChecksFor(seconds: number) {
        GameHandler.suspendWinChecks = true;
        console.log(`SuspendWinChecksFor: suspending win checks for ${seconds}s`);
        await mod.Wait(seconds);
        GameHandler.suspendWinChecks = false;
        console.log(`SuspendWinChecksFor: resumed win checks`);
    }

    /**
     * Rebuilds all cached player list arrays from authoritative sources.
     * - Human arrays are built from PlayerProfile._allPlayerProfiles (isAI=false).
     * - AI arrays are built from alive InfectedBotSlot / SurvivorBotSlot entries.
     * Call this after any join, leave, or team-change event for human players, and
     * after AI bot spawns or survivor-bot conversions to infected.
     * Do NOT call on infected-bot death during the round - the slot will respawn and
     * HandleSpawned will trigger the next rebuild.
     */
    static RebuildPlayerLists(): void {
        const allHuman: mod.Player[] = [];
        const humanSurv: mod.Player[] = [];
        const humanInf: mod.Player[] = [];

        for (const pp of PlayerProfile._allPlayerProfiles) {
            if (pp.isAI) continue;
            if (!Helpers.HasValidObjId(pp.player)) continue;
            allHuman.push(pp.player);
            if (pp.isInfectedTeam) humanInf.push(pp.player);
            else humanSurv.push(pp.player);
        }

        GameHandler.allHumanPlayers = allHuman;
        GameHandler.humanSurvivors = humanSurv;
        GameHandler.humanInfected = humanInf;

        // AI arrays: only currently-alive slot players
        const aiSurv: mod.Player[] = [];
        const aiInf: mod.Player[] = [];

        for (const slot of SurvivorBotSlot.slots) {
            if (slot.state === BotSlotState.Alive && slot.player) aiSurv.push(slot.player);
        }
        for (const slot of InfectedBotSlot.slots) {
            if (slot.state === BotSlotState.Alive && slot.player) aiInf.push(slot.player);
        }

        GameHandler.aiSurvivors = aiSurv;
        GameHandler.aiInfected = aiInf;
        GameHandler.allPlayers = [...allHuman, ...aiSurv, ...aiInf];

        console.log(`RebuildPlayerLists | human:${allHuman.length} hSurv:${humanSurv.length} hInf:${humanInf.length} aiSurv:${aiSurv.length} aiInf:${aiInf.length}`);
    }

    static GetAllPlayersOnTeam(team: mod.Team): mod.Player[] {
        if (mod.GetObjId(team) === mod.GetObjId(INFECTED_TEAM)) {
            return [...GameHandler.humanInfected, ...GameHandler.aiInfected];
        }
        return [...GameHandler.humanSurvivors, ...GameHandler.aiSurvivors];
    }

    static GetHumanPlayersOnTeam(team: mod.Team): mod.Player[] {
        if (mod.GetObjId(team) === mod.GetObjId(INFECTED_TEAM)) {
            return GameHandler.humanInfected;
        }
        return GameHandler.humanSurvivors;
    }

    static RecalculateCounts() {
        let survivors = 0;
        let infected = 0;
        let total = 0;
        let humans = 0;
        const allPlayers = mod.AllPlayers();
        const n = mod.CountOf(allPlayers);
        const survivorTeamId = mod.GetObjId(SURVIVOR_TEAM);
        const infectedTeamId = mod.GetObjId(INFECTED_TEAM);

        for (let i = 0; i < n; i++) {
            const p = mod.ValueInArray(allPlayers, i) as mod.Player;
            if (!PlayerIsAliveAndValid(p)) continue;
            // Decoy/turret bots are not real survivors -- exclude them from every count so they
            // never affect the survivor total, round phase transitions (final five/LMS), or EOR
            // checks.
            const pObjId = mod.GetObjId(p);
            if (DecoySpawner.IsActiveDecoyObjId(pObjId) || TurretSpawner.IsActiveTurretObjId(pObjId)) continue;
            total++;
            if (!SafeIsAISoldier(p)) humans++;
            const isAlive = mod.GetSoldierState(p, mod.SoldierStateBool.IsAlive);
            const teamId = mod.GetObjId(mod.GetTeam(p));
            if (isAlive && teamId === survivorTeamId) survivors++;
            else if (isAlive && teamId === infectedTeamId) infected++;
        }

        GameHandler.survivorsCount = survivors;
        GameHandler.aliveInfectedCount = infected;
        GameHandler.totalPlayers = total;
        GameHandler.humanPlayers = humans;
        console.log(`RecalculateCounts -> AliveSurvivors: ${survivors} | AliveInfected: ${infected} | TrackedInfected: ${GameHandler.infectedCount} | Total: ${total} | Humans: ${humans}`);
    }

    static async RoundStartCountdown() {
        Helpers.PlaySoundFX(SFX_TICKDOWN_START, 1);
        try {
            this.gameState = GameState.GameStartCountdown;
            GameCountdown.GlobalUpdate();
            while (this.countdownTimeRemaining > 0) {
                // Break early if game state changes from GameStartCountdown
                if (this.gameState !== GameState.GameStartCountdown) break;

                const humanPlayers = PlayerProfile._allPlayerProfiles.filter(pp => !pp.isAI);
                const humanSurvivors = humanPlayers.filter(pp => !pp.isInfectedTeam);
                const selectingSurvivors = humanSurvivors.filter(pp => !pp.isAlphaInfected);
                const allSelected = selectingSurvivors.length === 0 || selectingSurvivors.every(pp => pp.loadoutSelectionUI?.HasSelected());

                if (allSelected && this.countdownTimeRemaining > 0) {
                    this.countdownTimeRemaining = 0;
                    break;
                }

                // Update loadout menu timer for players still selecting
                for (const pp of selectingSurvivors) {
                    if (pp.loadoutSelectionUI && !pp.loadoutSelectionUI.HasSelected()) {
                        const selectionRemaining = Math.min(LOADOUT_SELECTION_TIME, this.countdownTimeRemaining);
                        pp.loadoutSelectionUI.UpdateCountdown(selectionRemaining);
                    }
                }

                // Update countdown UI for players who have already selected
                const timeRemainingText = Helpers.FormatTime(this.countdownTimeRemaining);
                for (const pp of humanPlayers) {
                    if (pp.isAlphaInfected) {
                        pp.gameCountdownUI.Show();
                    } else if (pp.loadoutSelectionUI?.HasSelected()) {
                        pp.gameCountdownUI.Show();
                    } else {
                        pp.gameCountdownUI.Close();
                    }
                }

                GameCountdown.GlobalTickDown(
                    timeRemainingText[0],
                    timeRemainingText[1],
                    timeRemainingText[2]
                );

                if (this.countdownTimeRemaining <= 5) {
                    Helpers.PlaySoundFX(SFX_ROUND_COUNTDOWN, 1);
                }

                await mod.Wait(1);


                this.countdownTimeRemaining--;
            }
        } finally {
            Helpers.PlaySoundFX(SFX_TICKDOWN_FINAL, 1);
            GameCountdown.GlobalClose();
            PlayVOForTeam(mod.VoiceOverEvents2D.RoundStartGeneric, mod.VoiceOverFlags.Alpha, SURVIVOR_TEAM);
            PlayVOForTeam(mod.VoiceOverEvents2D.RoundStartGeneric, mod.VoiceOverFlags.Bravo, INFECTED_TEAM);
            // mod.PlayMusic(mod.MusicEvents.Core_PhaseBegin, SURVIVOR_TEAM);
            // Don't force-close a still-open loadout menu when the countdown runs out -- let
            // survivors who haven't confirmed yet keep picking (Weapons.GetRoundLoadout already
            // lazily falls back to a generated default loadout if they're equipped/spawned before
            // confirming). Only players who already confirmed get their menu closed here.
            LoadoutSelectionMenu.GlobalClose(false);
            this.RestrictAllInputsAllPlayers(false);
        }
    }

    static CheckWinCondition() {
        if (GameHandler.currentRound >= GAME_ROUND_LIMIT) {
            if (GameHandler.currentRound === GAME_ROUND_LIMIT && GameHandler.roundTimeRemaining === 0) {
                // GameHandler.StopLastManStandingMusic();
                GameHandler.DisplayGameStateNotification(MakeMessage(mod.stringkeys.game_over));
                mod.EndGameMode(SURVIVOR_TEAM);
                GameHandler.gameState = GameState.GameOver;
            } else if (GameHandler.currentRound > GAME_ROUND_LIMIT) {
                // GameHandler.StopLastManStandingMusic();
                GameHandler.DisplayGameStateNotification(MakeMessage(mod.stringkeys.game_over));
                mod.EndGameMode(INFECTED_TEAM);
                GameHandler.gameState = GameState.GameOver;
                return;
            }
        }

        // Always refresh live counts before evaluating round-end conditions.
        GameHandler.RecalculateCounts();

        // Skip win checks immediately after a round starts to avoid race conditions
        if (GameHandler.suspendWinChecks) {
            console.log('CheckWinCondition skipped because suspendWinChecks is active.');
            return;
        }

        const survivorPlayers = GameHandler.GetAllPlayersOnTeam(SURVIVOR_TEAM);
        if (GameHandler.survivorsCount <= 5) {
            if (GameHandler.survivorsCount === 1) {
                const lmsCandidateProfile = PlayerProfile._allPlayerProfiles.find(pp =>
                    !pp.isInfectedTeam &&
                    Helpers.HasValidObjId(pp.player) &&
                    SafeIsAlive(pp.player)
                );
                const lastManStanding = lmsCandidateProfile?.player
                    ?? survivorPlayers.find(p => Helpers.HasValidObjId(p) && SafeIsAlive(p));
                const lmsProfile = lastManStanding ? PlayerProfile.Get(lastManStanding) : undefined;
                if (lmsProfile && lastManStanding) {
                    const isNewLastManStanding = !lmsProfile.isLastManStanding;
                    lmsProfile.isLastManStanding = true;
                    if (isNewLastManStanding) {
                        GameHandler.DisplayGameStateNotification(MakeMessage(mod.stringkeys.final_survivor));
                    }
                    // GameHandler.StartLastManStandingMusic();
                    ShowLastManStandingIcon(lastManStanding);
                    InitializePlayerEquipment(lastManStanding, lmsProfile);
                    lmsProfile.loadoutDisplayBottom?.Show();
                    lmsProfile.UpdateLastManStandingBuffWidgets();
                    if (!SafeIsAISoldier(lastManStanding)) {
                        StartLastManStandingReloadLoop(lmsProfile);
                    }
                }
            } else if (GameHandler.survivorsCount === 5 && GameHandler.gameState === GameState.GameRoundIsRunning) {
                // flags final five survivors, runs loadout initialization
                const finalFiveMessage = MakeMessage(mod.stringkeys.final_five);
                GameHandler.DisplayGameStateNotification(finalFiveMessage);
                Helpers.PlaySoundFX(SFX_FINAL_FIVE, 1);
                PlayVOForTeam(mod.VoiceOverEvents2D.ProgressMidLosing, mod.VoiceOverFlags.Alpha, SURVIVOR_TEAM);
                PlayVOForTeam(mod.VoiceOverEvents2D.PlayerCountEnemyLow, mod.VoiceOverFlags.Alpha, INFECTED_TEAM);
                for (let playerProfile of PlayerProfile._allPlayerProfiles) {
                    // playerProfile.ShowAlphaFeedback(finalFiveMessage); // disabling to reduce notification spam
                    if (playerProfile.isInfectedTeam) continue;
                    // flag survivors
                    playerProfile.isFinalFive = true;
                    InitializePlayerEquipment(playerProfile.player, playerProfile);
                    playerProfile.loadoutDisplayBottom?.Show();
                }
            }
        }

        // infected wiped out all survivors. basically round 1 again
        if (GameHandler.survivorsCount <= 0 || survivorPlayers.length <= 0) {
            if (GameHandler.currentRound >= GAME_ROUND_LIMIT) {
                // GameHandler.StopLastManStandingMusic();
                GameHandler.DisplayGameStateNotification(MakeMessage(mod.stringkeys.game_over));
                mod.EndGameMode(INFECTED_TEAM);
                GameHandler.gameState = GameState.GameOver;
                return;
            }
            // GameHandler.StopLastManStandingMusic();
            GameHandler.gameState = GameState.EndOfRound;
            GameHandler.endOfRoundCondition = '0 survivors';
            GameHandler.survivorsNextRound = GameHandler.aiSlotsToBackfill;
            GameHandler.infectedNextRound = 0;
            GameHandler.skipAlphaSelection = false;
            GameHandler.preserveAlpha = false;
            GameHandler.nextRoundFinalFive = false;
            GameHandler.nextRoundForcedAlphaPlayerID = undefined;
            GameHandler.infectedSpawnMultiplier = 1.0;
            GameHandler.parachuteSpawnersEnabled = false;
            console.log('End of Round Condition: 0 survivors - resetting survivors and infected next round.');
            return;
        }

        // time expired, some infected & survivors left
        if (GameHandler.roundTimeRemaining <= 0) {
            // GameHandler.StopLastManStandingMusic();
            GameHandler.gameState = GameState.EndOfRound;
            GameHandler.preserveAlpha = false;

            // If exactly one survivor is alive at round end, force them into next round's alpha pool.
            if (GameHandler.survivorsCount === 1) {
                const lmsAtRoundEnd = PlayerProfile._allPlayerProfiles.find(pp =>
                    !pp.isInfectedTeam &&
                    Helpers.HasValidObjId(pp.player) &&
                    SafeIsAlive(pp.player)
                );
                if (lmsAtRoundEnd) {
                    GameHandler.nextRoundForcedAlphaPlayerID = mod.GetObjId(lmsAtRoundEnd.player);
                    console.log(`CheckWinCondition | Preserving LMS Player(${lmsAtRoundEnd.playerID}) as forced alpha candidate next round.`);
                } else {
                    GameHandler.nextRoundForcedAlphaPlayerID = undefined;
                }
            } else {
                GameHandler.nextRoundForcedAlphaPlayerID = undefined;
            }

            // enough currently alive infected to skip alpha selection next round
            if (GameHandler.infectedCount >= 2 && GameHandler.survivorsCount >= 2) {
                GameHandler.endOfRoundCondition = '2+ infected';
                GameHandler.survivorsNextRound = this.GetNumberOfBotsToSpawn(SURVIVOR_TEAM, GameHandler.survivorsCount);
                // Stack the infected spawn multiplier (+25%) each round that 2+ survivors survive.
                // Resets only when LMS or 0-survivors condition triggers.
                GameHandler.infectedSpawnMultiplier *= 1.25;
                // Scale the infected count by the accumulated multiplier and derive bot slots needed.
                const baseInfectedCount = Math.max(MAX_PLAYER_COUNT - GameHandler.survivorsCount, GameHandler.infectedCount);
                const scaledInfectedCount = Math.round(baseInfectedCount * GameHandler.infectedSpawnMultiplier);
                GameHandler.infectedNextRound = this.GetNumberOfBotsToSpawn(INFECTED_TEAM, scaledInfectedCount);
                // Enable the parachute spawner pool going into the next round.
                GameHandler.parachuteSpawnersEnabled = true;
                GameHandler.skipAlphaSelection = true;
                GameHandler.preserveAlpha = true;
                GameHandler.nextRoundFinalFive = GameHandler.survivorsCount > 0 && GameHandler.survivorsCount <= 5;
                GameHandler.survivorsRoundsWon++;
                console.log(`End of Round Condition: 2+ infected - multiplier now x${GameHandler.infectedSpawnMultiplier.toFixed(2)}, spawning ${GameHandler.infectedNextRound} infected next round (parachute pool enabled).`);

            }
            else if (GameHandler.infectedCount >= 2 && GameHandler.survivorsCount === 1) {
                // Time expired with 1 survivor (LMS) and 2+ infected. The LMS will be converted
                // to alpha next round so treat this as a full '1 infected' reset, but preserve
                // nextRoundForcedAlphaPlayerID (already set above) so the LMS is the forced alpha.
                GameHandler.endOfRoundCondition = '1 infected';
                GameHandler.survivorsNextRound = GameHandler.aiSlotsToBackfill;
                GameHandler.infectedNextRound = 0;
                GameHandler.skipAlphaSelection = false;
                GameHandler.preserveAlpha = false;
                GameHandler.nextRoundFinalFive = false;
                GameHandler.survivorsRoundsWon++;
                GameHandler.infectedSpawnMultiplier = 1.0;
                GameHandler.parachuteSpawnersEnabled = false;
                console.log('End of Round Condition: 2+ infected + 1 survivor (LMS) - full reset; LMS preserved as forced alpha.');
            }
            else if (GameHandler.infectedCount === 1) {
                GameHandler.endOfRoundCondition = '1 infected';
                GameHandler.survivorsNextRound = GameHandler.aiSlotsToBackfill;
                GameHandler.infectedNextRound = 0;
                GameHandler.skipAlphaSelection = false;
                GameHandler.preserveAlpha = false;
                GameHandler.nextRoundFinalFive = false;
                GameHandler.nextRoundForcedAlphaPlayerID = undefined;
                GameHandler.survivorsRoundsWon++;
                GameHandler.infectedSpawnMultiplier = 1.0;
                GameHandler.parachuteSpawnersEnabled = false;
                console.log('End of Round Condition: 1 infected - resetting survivors and infected next round.');
            }
            return
        }
    }

    static GetNumberOfBotsToSpawn(team: mod.Team, count: number): number {
        // compute desired bots = desired total slots for team (count) minus humans currently on that team.
        const humanOnTeam = GameHandler.GetHumanPlayersOnTeam(team).length;
        // derive count adjustment for infected team based on survivors remaining
        if (mod.GetObjId(team) === mod.GetObjId(INFECTED_TEAM)) {
            count = Math.max(MAX_PLAYER_COUNT - GameHandler.survivorsCount, count);
        }
        const toSpawn = count - humanOnTeam;
        return Math.max(0, toSpawn);
    }

    static async ClearTemporaryArrays() {
        AISpawnHandler.spawnerLock.clear();
        InfectedBotSlot.ResetAll();
        SurvivorBotSlot.ResetAll();
    }

    static async DisplayGameStateNotification(message: mod.Message, durationSeconds: number = 4) {
        if (gameStateMessageToast.isOpen()) {
            gameStateMessageToast.close();
        }

        GameHandler.gameStateAlertVersion++;
        const alertVersion = GameHandler.gameStateAlertVersion;

        gameStateMessageToast.open(message);
        await mod.Wait(durationSeconds);
        if (alertVersion === GameHandler.gameStateAlertVersion) {
            gameStateMessageToast.close();
        }
    }

    static async DisplayUpdatedSurvivorCountNotification(durationSeconds: number = 4) {
        return;
        await mod.Wait(0.15);
        const message = mod.Message(mod.stringkeys.total_survivors, this.survivorsCount);

        if (survivorCountNotificationToast.isOpen()) {
            survivorCountNotificationToast.close();
        }

        GameHandler.survivorAlertVersion++;
        const alertVersion = GameHandler.survivorAlertVersion;

        survivorCountNotificationToast.open(message);
        await mod.Wait(durationSeconds);
        if (alertVersion === GameHandler.survivorAlertVersion) {
            survivorCountNotificationToast.close();
        }
    }

    static async DisplayRemainingSurvivorsAlert(messageOverride?: mod.Message) {
        if (messageOverride) {
            await GameHandler.DisplayGameStateNotification(messageOverride);
            return;
        }
        await GameHandler.DisplayUpdatedSurvivorCountNotification();
    }

    static InitializeScoreboardTimeAndColumns() {
        const timeRemaining = Helpers.FormatTime(this.roundTimeRemaining);
        ScoreboardUI.GlobalClock(timeRemaining[0], timeRemaining[1], timeRemaining[2]);

        mod.SetScoreboardType(mod.ScoreboardType.CustomFFA);
        mod.SetScoreboardColumnNames(
            MakeMessage(mod.stringkeys.scoreboard_score),
            MakeMessage(mod.stringkeys.scoreboard_kills_as_survivors),
            MakeMessage(mod.stringkeys.scoreboard_kills_as_infected),
            MakeMessage(mod.stringkeys.scoreboard_deaths),
            MakeMessage(mod.stringkeys.scoreboard_rounds_survived)
        );
        mod.SetScoreboardColumnWidths(10, 10, 15, 10, 15);
    }

    static MoveAllHumanPlayersToSurvivorTeam() {
        const humanInfected = PlayerProfile._playerInstances.filter(pp =>
            mod.GetObjId(mod.GetTeam(pp)) === mod.GetObjId(INFECTED_TEAM));
        for (const pp of humanInfected) {
            const playerProfile = PlayerProfile.Get(pp);
            playerProfile && (playerProfile.isInfectedTeam = false);
            playerProfile && (playerProfile.isInitialSpawn = false);
            if (PlayerIsAliveAndValid(pp)) {
                mod.UndeployPlayer(pp);
                mod.SetTeam(pp, mod.GetTeam(1));
                continue;
            } else {
                mod.SetTeam(pp, mod.GetTeam(1));
            }
        }
        GameHandler.RebuildPlayerLists();
    }

    /**
     * Loops through all PlayerProfiles in ._allPlayerProfiles and restricts inputs as specified
     * @param enabled 
     */
    static RestrictAllInputsAllPlayers(enabled: boolean) {

        if (GameHandler.gameState === GameState.GameRoundIsRunning) {
            // ensure that inputs are not restricted during the round
            enabled = false;
        }
        if (enabled) {
            PlayerProfile._allPlayerProfiles.forEach(playerProfile => {
                const player = playerProfile.player;
                if (PlayerIsAliveAndValid(player)) {
                    try {
                        if (SafeIsAISoldier(player)) {
                            mod.AIIdleBehavior(player);
                        }
                    } catch { }
                    try { mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, true); } catch { }
                    if (playerProfile.isInfectedTeam) {
                        try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveForwardBack, true); } catch { }
                        try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveLeftRight, true); } catch { }
                        try { mod.EnableInputRestriction(player, mod.RestrictedInputs.Jump, true); } catch { }
                    }
                }
            });
        } else {
            PlayerProfile._allPlayerProfiles.forEach(playerProfile => {
                const player = playerProfile.player;
                if (PlayerIsAliveAndValid(player)) {
                    const keepFireRestricted = playerProfile.isInfectedTeam
                        && SafeIsAISoldier(player);
                    try {
                        if (SafeIsAISoldier(player)) {
                            mod.AIIdleBehavior(player);
                        }
                    } catch { }
                    try { mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, keepFireRestricted ? true : false); } catch { }
                    try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveForwardBack, false); } catch { }
                    try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveLeftRight, false); } catch { }
                    try { mod.EnableInputRestriction(player, mod.RestrictedInputs.Jump, false); } catch { }
                }
            });
        }

    }
    /**
     * Undeploys human infected players at the end of the round
     */
    static async UndeployAllInfectedHumanPlayers() {
        console.log('Undeploying all human infected players.');
        let allPlayers = mod.AllPlayers();
        const pcount = mod.CountOf(allPlayers);
        for (let i = 0; i < pcount; i++) {
            const player = mod.ValueInArray(allPlayers, i) as mod.Player;
            const isBot = SafeIsAISoldier(player);
            if (isBot) continue;

            const isValid = mod.IsPlayerValid(player);
            const isAlive = isValid && mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive);
            const onSurvivorTeam = mod.GetObjId(mod.GetTeam(player)) === mod.GetObjId(SURVIVOR_TEAM);

            if (onSurvivorTeam) continue;

            const playerProfile = PlayerProfile.Get(player);
            if (playerProfile) {
                playerProfile.isInitialSpawn = true;
                playerProfile.isInfectedTeam = true;
            }
            if (isAlive) {
                mod.SetRedeployTime(player, PLAYER_REDEPLOY_TIME);
                mod.UndeployPlayer(player);
            }
        }

        // Ensure UI reflects preserved team assignments immediately after undeploy
        for (const pp of PlayerProfile._allPlayerProfiles) {
            if (!pp.isAI) {
                pp.scoreboardUI?.RedrawTeamIndicationWidgets();
            }
        }
    }

    static async DeployAllBots() {
        let allPlayers = mod.AllPlayers();
        const pcount = mod.CountOf(allPlayers);
        for (let i = 0; i < pcount; i++) {
            const player = mod.ValueInArray(allPlayers, i) as mod.Player;
            if (SafeIsAISoldier(player)) mod.DeployPlayer(player);
        }
    }

    static SpawnObjectFromGodot(object: ObjectTransform) {
        const rotation = Helpers.quaternionToEuler(object.rotation);

        const obj = mod.SpawnObject(object.id as mod.RuntimeSpawn_Sand | mod.RuntimeSpawn_Common,
            mod.CreateVector(object.position.x, object.position.y, object.position.z),
            mod.CreateVector(rotation.x, rotation.y, rotation.z),
            mod.CreateVector(object.scale.x, object.scale.y, object.scale.z)
        )

        return obj
    }

    static async KillAllBotsEndRound() {
        // some hacky attempt to remove bots that aren't supposed to spawn between rounds
        let allPlayers = mod.AllPlayers();
        const pcount = mod.CountOf(allPlayers);
        for (let i = 0; i < pcount; i++) {
            const player = mod.ValueInArray(allPlayers, i) as mod.Player;
            if (PlayerIsAliveAndValid(player) && SafeIsAISoldier(player)) {
                // mod.UndeployPlayer(player); // this forces bots to respawn. NEVER USE THIS.
                if (PlayerProfile._deployedPlayers.has(mod.GetObjId(player))) {
                    PlayerProfile.RemoveFromDeployedPlayers(mod.GetObjId(player));
                }
                mod.Kill(player);
            }

        }
    }

    static async HandleEoRSpawns(expr: caseOptions | undefined) {
        const humanSurvivors = GameHandler.GetHumanPlayersOnTeam(SURVIVOR_TEAM).length;
        const humanInfected = GameHandler.GetHumanPlayersOnTeam(INFECTED_TEAM).length;
        const humanTotal = humanSurvivors + humanInfected;

        let survivorsToSpawn = Math.max(0, GameHandler.survivorsNextRound);
        let infectedToSpawn = Math.max(0, GameHandler.infectedNextRound);

        // First round bootstrap: ensure pregame has survivor bots to select alpha from.
        if (GameHandler.currentRound === 1 && survivorsToSpawn === 0 && infectedToSpawn === 0 && humanTotal < MAX_PLAYER_COUNT) {
            survivorsToSpawn = Math.max(0, GameHandler.aiSlotsToBackfill);
            GameHandler.skipAlphaSelection = false;
            GameHandler.preserveAlpha = false;
            GameHandler.endOfRoundCondition = '0 survivors';
            console.log(`HandleEoRSpawns | Bootstrap recovery applied. Spawning ${survivorsToSpawn} survivors and ${infectedToSpawn} infected.`);
        }

        if (expr === '2+ infected' && survivorsToSpawn === 0 && infectedToSpawn === 0 && humanTotal < MAX_PLAYER_COUNT) {
            survivorsToSpawn = Math.max(0, GameHandler.aiSlotsToBackfill - humanSurvivors);
            GameHandler.skipAlphaSelection = false;
            GameHandler.preserveAlpha = false;
            GameHandler.nextRoundForcedAlphaPlayerID = undefined;
            console.log(`HandleEoRSpawns | Recovered invalid 2+ infected plan (0/0). Fallback survivors=${survivorsToSpawn}, infected=${infectedToSpawn}.`);
        }

        // Never start a round with no survivors unless lobby is fully human and deliberately full.
        if ((humanSurvivors + survivorsToSpawn) <= 0 && humanTotal < MAX_PLAYER_COUNT) {
            survivorsToSpawn = Math.max(1, GameHandler.aiSlotsToBackfill - humanSurvivors);
            GameHandler.skipAlphaSelection = false;
            GameHandler.preserveAlpha = false;
            console.log(`HandleEoRSpawns | Guarded against empty survivor team. survivorsToSpawn=${survivorsToSpawn}`);
        }

        // If no infected are planned, alpha selection must be enabled for round start.
        if (GameHandler.skipAlphaSelection && (humanInfected + infectedToSpawn) <= 0) {
            GameHandler.skipAlphaSelection = false;
            GameHandler.preserveAlpha = false;
            console.log(`HandleEoRSpawns | Disabled skipAlphaSelection because next round has no infected.`);
        }

        GameHandler.survivorsNextRound = survivorsToSpawn;
        GameHandler.infectedNextRound = infectedToSpawn;
        console.log(`HandleEoRSpawns | expr=${expr ?? 'undefined'} | humans(survivor=${humanSurvivors}, infected=${humanInfected}) | plan(survivors=${survivorsToSpawn}, infected=${infectedToSpawn}) | skipAlpha=${GameHandler.skipAlphaSelection}`);

        switch (expr) {
            case '0 survivors':
                AISpawnHandler.InitializeStartingSurvivorSpawns(survivorsToSpawn);
                AISpawnHandler.InitializeStartingInfectedSpawns(infectedToSpawn);
                GameHandler.MoveAllHumanPlayersToSurvivorTeam();
                GameHandler.infectedCount = infectedToSpawn;
                console.log(`'EoR' | 0 survivors | Initial Round Conditions | Spawning ${survivorsToSpawn} Survivors and ${infectedToSpawn} Infected next round`);
                break;
            case '1 infected':
                AISpawnHandler.InitializeStartingSurvivorSpawns(survivorsToSpawn);
                AISpawnHandler.InitializeStartingInfectedSpawns(infectedToSpawn);
                GameHandler.MoveAllHumanPlayersToSurvivorTeam();
                GameHandler.infectedCount = infectedToSpawn;
                console.log(`'EoR' | 1 infected | Resetting Survivors and Infected to Initial Round Conditions | Spawning ${survivorsToSpawn} Survivors and ${infectedToSpawn} Infected next round`);
                break;
            case '2+ infected':
                AISpawnHandler.InitializeStartingSurvivorSpawns(survivorsToSpawn);
                AISpawnHandler.InitializeStartingInfectedSpawns(infectedToSpawn);
                GameHandler.infectedCount = Math.max(0, humanInfected + infectedToSpawn);
                console.log(`'EoR' | 2+ infected | Recycling Team Counts | Spawning ${survivorsToSpawn} Survivors and ${infectedToSpawn} Infected next round`);
                break;
            default:
                AISpawnHandler.InitializeStartingSurvivorSpawns(survivorsToSpawn);
                AISpawnHandler.InitializeStartingInfectedSpawns(infectedToSpawn);
                GameHandler.MoveAllHumanPlayersToSurvivorTeam();
                GameHandler.infectedCount = infectedToSpawn;
                GameHandler.endOfRoundCondition = '0 survivors';
                console.log(`'EoR' | default | Recovery spawn plan | Spawning ${survivorsToSpawn} Survivors and ${infectedToSpawn} Infected next round`);
                break;
        }
    }

    static async EndRoundCleanup() {
        console.log(`"EoR" | Starting End Round Cleanup`);
        PropSpawner.CleanupAllObjects();
        DecoySpawner.CleanupAllDecoys();
        TurretSpawner.CleanupAllTurrets();
        BattlePickupCleanup.CleanupRound();
        // GameHandler.StopLastManStandingMusic();
        if (GameHandler.gameState === GameState.GameOver)
            return;
        ScoreboardUI.GlobalUpdate(TeamNameString.Both);
        GameHandler.RestrictAllInputsAllPlayers(true);

        PlayerProfile._allPlayerProfiles.forEach((pp) => {
            if (mod.IsPlayerValid(pp.player)) {
                if (!pp.isInfectedTeam && !SafeIsAISoldier(pp.player)) {
                    pp.survived++;
                    pp.score += POINTS_ROUND_SURVIVED
                    pp.UpdatePlayerScoreboard();
                }
            }
        });

        GameHandler.gameState = GameState.EndOfRound;

        await GameHandler.DisplayGameStateNotification(MakeMessage(mod.stringkeys.round_over));

        await this.UndeployAllInfectedHumanPlayers();
        await this.KillAllBotsEndRound();

        // Eject any occupants and queue deferred damage to force full vehicle removal
        if (SPAWNED_ACTIVE_VEHICLE) {
            const vehicleRef = SPAWNED_ACTIVE_VEHICLE;
            SPAWNED_ACTIVE_VEHICLE = undefined;
            try { mod.ForcePlayerExitVehicle(vehicleRef); } catch (e) { }
            CleanupVehicleWithDamage(vehicleRef, 5);
        }
        // Correct VL7 state for any survivors still flagged as in-vehicle after round-end ejection.
        // ForcePlayerExitVehicle does not reliably fire OnPlayerExitVehicle, so we fix it manually.
        PlayerProfile._allPlayerProfiles.forEach(pp => {
            if (pp.invehicle && !pp.isInfectedTeam && mod.IsPlayerValid(pp.player)) {
                pp.invehicle = false;
                // mod.EnableScreenEffect(pp.player, mod.ScreenEffects.VL7, true);
            }
        });
        GameHandler.vehicleSpawnedThisRound = false;

        GameHandler.isSpawnCheckRunning = false;
        GameHandler.currentRound++;
        GameHandler.roundTimeRemaining = ROUND_DURATION;

        // If any human survivors remain alive and deployed, refresh their equipment to match the new round
        try {
            const survivorsAlive = GameHandler.GetAllPlayersOnTeam(SURVIVOR_TEAM)
                .filter(p => mod.IsPlayerValid(p)
                    && mod.GetSoldierState(p, mod.SoldierStateBool.IsAlive)
                    && !SafeIsAISoldier(p));
            for (const player of survivorsAlive) {
                const pp = PlayerProfile.Get(player);
                if (pp) {
                    RefreshHumanEquipment(player, pp);
                }
            }
        } catch (e) {
            console.log(`EndRoundCleanup | equipment refresh error: ${e}`);
        }

        // clear temporary spawn arrays now that we've killed bots and undeployed players
        await GameHandler.ClearTemporaryArrays();

        GameHandler.infectedCount = 0;
        GameHandler.aliveInfectedCount = 0;
        GameHandler.RebuildPlayerLists();

        return;
    }


    static async PreGameSetup() {
        if (GameHandler.gameState === GameState.GameOver)
            return;
        this.gameState = GameState.PreGame;
        console.log('PreGame Setup Starting...');

        // Handle round props/vehicle/VFX spawns in one map-driven path.
        GameHandler.SpawnRoundMapContent(CURRENT_MAP);
        GameHandler.DisplayGameStateNotification(MakeMessage(mod.stringkeys.starting_next_round));
        GameCountdown.GlobalClose();
        LoadoutSelectionMenu.GlobalClose();

        GameHandler.shouldShowLoadoutSelection = !GameHandler.skipAlphaSelection;
        await PlayerProfile.ResetAllPlayerProfileFields();
        await PlayerProfile.RemoveAllInvalidPlayerProfiles();

        // queue and spawn required bots for the next round based on EoR condition
        await this.HandleEoRSpawns(GameHandler.endOfRoundCondition);
        await AISpawnHandler.ProcessBotSpawnQueue();

        const allReady = await GameHandler.WaitForAllDeploys(WAIT_FOR_SPAWN_TIMEOUT);
        await PlayerProfile.CleanupDeployedPlayers();

        GameHandler.RecalculateCounts();
        ScoreboardUI.GlobalUpdate(TeamNameString.Both);

        // Select alpha(s) before loadout selection, but defer conversion/alerts until round start
        if (GameHandler.shouldShowLoadoutSelection) {
            await SelectRandomAlphaInfected(true);
        }

        // Generate and assign randomized loadout options for all survivors at round start.
        try {
            for (let playerProfile of PlayerProfile._allPlayerProfiles) {
                if (!playerProfile || !playerProfile.player) continue; // Add player check
                if (playerProfile.isInfectedTeam) continue;
                if (GameHandler.shouldShowLoadoutSelection) {
                    const options = Weapons.GenerateLoadoutOptions(playerProfile);
                    if (!options || options.sidearmOptions.length === 0 || options.primaryOptions.length === 0 || options.lmsOptions.length === 0) {
                        continue;
                    }

                    if (playerProfile.isAI) {
                        playerProfile.chosenLoadoutThisRound = Weapons.BuildDefaultLoadoutFromOptions(options);
                        if (Helpers.HasValidObjId(playerProfile.player) &&
                            mod.GetSoldierState(playerProfile.player, mod.SoldierStateBool.IsAlive)) {
                            InitializePlayerEquipment(playerProfile.player, playerProfile);
                        }
                    } else if (playerProfile.isAlphaInfected) {
                        // Alpha infected do not receive loadout selection
                        playerProfile.loadoutSelectionUI?.Close();
                    } else {
                        playerProfile.pendingLoadoutOptions = options;
                        // Show immediately for players already deployed; others will see it on their next deploy via CustomOnPlayerDeployed
                        if (PlayerProfile._deployedPlayers.has(playerProfile.playerID)) {
                            playerProfile.loadoutSelectionUI?.Show(options);
                            playerProfile.pendingLoadoutOptions = undefined;
                        }
                    }
                } else {
                    // No alpha selection this round: keep previous loadout selections
                    if (!playerProfile.chosenLoadoutThisRound || playerProfile.chosenLoadoutThisRound.length === 0) {
                        const options = Weapons.GenerateLoadoutOptions(playerProfile);
                        playerProfile.chosenLoadoutThisRound = Weapons.BuildDefaultLoadoutFromOptions(options);
                    }
                    if (Helpers.HasValidObjId(playerProfile.player) &&
                        mod.GetSoldierState(playerProfile.player, mod.SoldierStateBool.IsAlive)) {
                        InitializePlayerEquipment(playerProfile.player, playerProfile);
                    }
                }
            }
        } catch (e) {
            console.log(`GenerateLoadoutsAtStartError: ${e}`);
        }

        // Reset countdown for pregame phase
        GameHandler.countdownTimeRemaining = GAME_COUNTDOWN_TIME;

        this.RestrictAllInputsAllPlayers(true);
        await this.RoundStartCountdown();
        console.log('Game is starting. Current Round: ' + GameHandler.currentRound);
        this.gameState = GameState.GameRoundIsRunning;
        Sandstorm.InitializeSandstormEventForRound();

        // Spawn this round's vehicle (random spawn point, random type -- see SpawnVehicle) up
        // front rather than waiting for a Final Five milestone. Cleanup at round end is
        // unchanged (see EndRoundCleanup).
        if (CURRENT_MAP === MapNames.SAND2 && !GameHandler.vehicleSpawnedThisRound) {
            GameHandler.vehicleSpawnedThisRound = true;
            GameHandler.SpawnVehicle();
        }

        for (let playerProfile of PlayerProfile._allPlayerProfiles) {
            if (playerProfile.isAI) continue;
            playerProfile.gameCountdownUI?.Close();
        }

        if (GameHandler.shouldShowLoadoutSelection) {
            await ApplySelectedAlphaInfectedAfterRoundStart();
            for (let playerProfile of PlayerProfile._allPlayerProfiles) {
                if (!playerProfile.isAlphaInfected) {
                    playerProfile.ShowAlphaFeedback();
                }
            }

            Helpers.PlaySoundFX(SFX_ALPHA_SELECTED, 1);
        }

        if (GameHandler.nextRoundFinalFive) {
            const finalFiveMessage = MakeMessage(mod.stringkeys.final_five_upgraded);
            GameHandler.DisplayGameStateNotification(finalFiveMessage);
            Helpers.PlaySoundFX(SFX_FINAL_FIVE, 1);
            for (let playerProfile of PlayerProfile._allPlayerProfiles) {
                playerProfile.ShowAlphaFeedback(finalFiveMessage);
                if (playerProfile.isInfectedTeam) continue;
                playerProfile.isFinalFive = true;
                InitializePlayerEquipment(playerProfile.player, playerProfile);
            }
        }

        for (let playerProfile of PlayerProfile._allPlayerProfiles) {
            if (!playerProfile.isAI) {
                playerProfile.loadoutDisplayBottom?.Show();
            }
        }



        this.FinalCleanup();
        // restart spawnercheck if it's not already running
        AISpawnHandler.OnGoingSpawnerCheck();

        return;
    }

    static async FinalCleanup() {
        AISpawnHandler.startingInfectedChosen = false;
        AISpawnHandler.startingSurvivorsChosen = false;
        PlayerProfile.alphaInfected = [];
        GameHandler.skipAlphaSelection = false;
        GameHandler.survivorsNextRound = 0;
        GameHandler.infectedNextRound = 0;
        GameHandler.nextRoundFinalFive = false;
        GameHandler.countdownTimeRemaining = GAME_COUNTDOWN_TIME;

        DisplayWorldIconResupply();
    }

    static async TickUpdate() {
        // main game cycle and fires cleanup actions and pre-game setup between rounds
        while (true) {
            // Gameclock logic
            while (GameHandler.gameState === GameState.GameRoundIsRunning && GameHandler.roundTimeRemaining > 0) {
                GameHandler.roundTimeRemaining--;
                const timeRemaining = Helpers.FormatTime(GameHandler.roundTimeRemaining);
                console.log(`${timeRemaining[0]}:${timeRemaining[1]}${timeRemaining[2]}`);
                ScoreboardUI.GlobalClock(
                    timeRemaining[0],
                    timeRemaining[1],
                    timeRemaining[2]
                );
                if (GameHandler.roundTimeRemaining === 62) {
                    PlayVOForTeam(mod.VoiceOverEvents2D.Time60Left, mod.VoiceOverFlags.Alpha, SURVIVOR_TEAM);
                }
                if (GameHandler.roundTimeRemaining <= 10) {
                    if (GameHandler.roundTimeRemaining === 10) {
                        Helpers.PlaySoundFX(SFX_TICKDOWN_START, 1);
                    }
                    Helpers.PlaySoundFX(SFX_TICKDOWN, 1);
                }
                await mod.Wait(1);
            }
            GameHandler.CheckWinCondition();
            await GameHandler.EndRoundCleanup();
            if (GameHandler.gameState === GameState.GameOver) {
                console.log('Game Over. Stopping game loop.');
                break;
            }
            await mod.Wait(1);
            await GameHandler.PreGameSetup();
        }
    }
}

//////////////////////////////////////////////////////////////////
///////------- BOT SPAWNING AND BEHAVIOR CLASSES -------//////////
//////////////////////////////////////////////////////////////////

enum TeamNameString {
    Survivors = "survivors",
    Infected = "infected",
    Both = "both"
}

// Lifecycle states for each bot slot.
enum BotSlotState {
    Idle = 'IDLE',
    PendingSpawn = 'PENDING_SPAWN',
    Alive = 'ALIVE',
    DeadAwaitingRespawn = 'DEAD_AWAITING_RESPAWN',
}

// Slim identity stub kept for PlayerProfile._botProfile compatibility (alpha flag, logging).
class BotProfile {
    playerName: string;
    isAlphaInfected: boolean;
    isInfectedTeam?: boolean; // used by LogAlphaState

    constructor(name: string, isAlpha: boolean = false, isInfected?: boolean) {
        this.playerName = name;
        this.isAlphaInfected = isAlpha;
        this.isInfectedTeam = isInfected;
    }
}

/** Per-slot tick state owned by an InfectedBotSlot. Cleared on every respawn. */
interface InfectedBotTickState {
    target?: mod.Player;
    lastMoveIssuedAt: number;
    lastMovePos?: mod.Vector;
    nextTickAt: number;
    behavior?: string;
    lastMoveSpeed?: mod.MoveSpeed;
    trackedVehicle?: mod.Vehicle;
    leapInProgress?: boolean;
    inAreaTrigger?: boolean;
    lastAreaMoveSpeedMultiplier?: number;
    meleeGadgetActive?: boolean;
    meleeTargetObjId?: number;
    nextMeleeForceFireAt?: number;
    vehicleAttackWindowStartedAt?: number;
    vehicleAttackWindowDamageProfile?: number;
    moveFailCount?: number;     // increments on move-fail callbacks; reset on respawn
    moveFailHoldUntil?: number; // suppresses chase tick while failure recovery is active
    lifecycleSpawnedAt?: number;
    lifecycleFirstOngoingTickLogged?: boolean;
    lifecycleFirstMoveIssuedLogged?: boolean;
    lifecycleFirstMoveFailLogged?: boolean;
}

/** One slot per spawner in INFECTED_AI_SPAWNERS (plus PARACHUTE_INFECTED_SPAWNERS when enabled). Persists across deaths. */
class InfectedBotSlot {
    slotIndex: number;
    assignedSpawnerID: number;
    name: string;
    isAlpha: boolean = false;
    /** True when this slot was drawn from PARACHUTE_INFECTED_SPAWNERS; spawns with AIParachuteBehavior on round start. */
    isParachuteSpawner: boolean = false;
    state: BotSlotState = BotSlotState.Idle;
    player?: mod.Player;
    playerObjID?: number;
    pendingSpawnerID?: number;
    pendingSpawnStartedAt?: number;
    respawnDueAt?: number;
    spawnToken: number = 0;
    tick: InfectedBotTickState = { lastMoveIssuedAt: 0, nextTickAt: 0 };

    static slots: InfectedBotSlot[] = [];
    static byObjID: Map<number, InfectedBotSlot> = new Map();
    static pendingBySpawnerID: Map<number, InfectedBotSlot> = new Map();
    /** Tracks dead bots by their last ObjID until the spawner unspawns the body (OnPlayerLeaveGame). */
    static deadByObjID: Map<number, InfectedBotSlot> = new Map();

    constructor(index: number, name: string, assignedSpawnerID: number, isParachuteSpawner: boolean = false) {
        this.slotIndex = index;
        this.name = name;
        this.assignedSpawnerID = assignedSpawnerID;
        this.isParachuteSpawner = isParachuteSpawner;
    }

    static InitSlots(): void {
        InfectedBotSlot.slots = [];
        InfectedBotSlot.byObjID.clear();
        InfectedBotSlot.pendingBySpawnerID.clear();
        InfectedBotSlot.deadByObjID.clear();
        const slotSpawnerPool = BOT_SURVIVAL_TEST_MODE
            ? INFECTED_AI_SPAWNERS.concat(SURVIVOR_AI_SPAWNERS)
            : INFECTED_AI_SPAWNERS;
        for (let i = 0; i < slotSpawnerPool.length; i++) {
            const id = slotSpawnerPool[i];
            const name = BOT_NAME_MAP.get(id) ?? `infected_bot_${id}`;
            InfectedBotSlot.slots.push(new InfectedBotSlot(i, name, id, false));
        }
        if (!BOT_SURVIVAL_TEST_MODE && GameHandler.parachuteSpawnersEnabled) {
            const baseLen = INFECTED_AI_SPAWNERS.length;
            for (let i = 0; i < PARACHUTE_INFECTED_SPAWNERS.length; i++) {
                const id = PARACHUTE_INFECTED_SPAWNERS[i];
                const name = BOT_NAME_MAP.get(id) ?? `infected_bot_${id}`;
                InfectedBotSlot.slots.push(new InfectedBotSlot(baseLen + i, name, id, true));
            }
            console.log(`InfectedBotSlot.InitSlots | Parachute pool enabled: added ${PARACHUTE_INFECTED_SPAWNERS.length} parachute slot(s). Total slots: ${InfectedBotSlot.slots.length}`);
        } else if (BOT_SURVIVAL_TEST_MODE) {
            console.log(`InfectedBotSlot.InitSlots | Bot survival test mode enabled with ${InfectedBotSlot.slots.length} total infected slot(s).`);
        }
    }

    static GetByObjID(objID: number): InfectedBotSlot | undefined {
        return InfectedBotSlot.byObjID.get(objID);
    }

    static GetAliveCount(): number {
        return InfectedBotSlot.slots.filter(s => s.state === BotSlotState.Alive).length;
    }

    static ResetAll(): void {
        InfectedBotSlot.byObjID.clear();
        InfectedBotSlot.pendingBySpawnerID.clear();
        InfectedBotSlot.deadByObjID.clear();
        for (const slot of InfectedBotSlot.slots) {
            CleanupVehicleChaseState(slot);
            slot.state = BotSlotState.Idle;
            slot.player = undefined;
            slot.playerObjID = undefined;
            slot.pendingSpawnerID = undefined;
            slot.pendingSpawnStartedAt = undefined;
            slot.respawnDueAt = undefined;
            slot.spawnToken = 0;
            slot.isAlpha = false;
            slot.resetTick();
        }
    }

    resetTick(): void {
        this.tick = {
            lastMoveIssuedAt: 0,
            nextTickAt: 0,
            behavior: 'idle',
            meleeGadgetActive: false,
            meleeTargetObjId: undefined,
        };
    }

    /** Queues a respawn after INFECTED_RESPAWN_TIME. Called once OnPlayerLeaveGame confirms the body is gone. */
    startRespawnTimer(): void {
        const respawnDelay = GameHandler.survivorsCount <= 1
            ? INFECTED_RESPAWN_TIME_LAST_MAN
            : INFECTED_RESPAWN_TIME;
        this.respawnDueAt = (Date.now() / 1000) + respawnDelay;
        console.log(`InfectedBotSlot[${this.slotIndex}] | Respawn in ${respawnDelay}s`);
        (async () => {
            await mod.Wait(respawnDelay);
            if (GameHandler.gameState !== GameState.GameRoundIsRunning) {
                if (this.state === BotSlotState.DeadAwaitingRespawn) {
                    this.state = BotSlotState.Idle;
                    this.respawnDueAt = undefined;
                }
                return;
            }
            if (this.state !== BotSlotState.DeadAwaitingRespawn) return;
            this.Respawn();
        })();
    }

    HandleSpawned(player: mod.Player, playerObjID: number, spawnerObjID: number): void {
        CleanupVehicleChaseState(this);
        // Detect ObjID reuse: if another slot already claims this ObjID it has been orphaned
        // by the engine recycling the ID for this new bot. Evict it so it can respawn.
        const collidingSlot = InfectedBotSlot.byObjID.get(playerObjID);
        if (collidingSlot && collidingSlot !== this) {
            console.log(`InfectedBotSlot[${this.slotIndex}] | ObjID(${playerObjID}) reuse: evicting orphaned slot[${collidingSlot.slotIndex}]`);
            InfectedBotSlot.byObjID.delete(playerObjID);
            collidingSlot.player = undefined;
            collidingSlot.playerObjID = undefined;
            collidingSlot.resetTick();
            if (GameHandler.gameState === GameState.GameRoundIsRunning) {
                collidingSlot.state = BotSlotState.DeadAwaitingRespawn;
                collidingSlot.startRespawnTimer();
            } else {
                collidingSlot.state = BotSlotState.Idle;
            }
        }

        InfectedBotSlot.pendingBySpawnerID.delete(spawnerObjID);
        AISpawnHandler.spawnerLock.delete(spawnerObjID);
        this.pendingSpawnerID = undefined;
        this.pendingSpawnStartedAt = undefined;
        this.respawnDueAt = undefined;
        this.player = player;
        this.playerObjID = playerObjID;
        this.state = BotSlotState.Alive;
        this.resetTick();
        this.tick.lifecycleSpawnedAt = Date.now() / 1000;
        this.tick.lifecycleFirstOngoingTickLogged = false;
        this.tick.lifecycleFirstMoveIssuedLogged = false;
        this.tick.lifecycleFirstMoveFailLogged = false;
        this.tick.behavior = 'spawned';
        this.tick.nextTickAt = (Date.now() / 1000) + AI_BOT_SPAWN_TICK_GRACE_SECONDS;
        InfectedBotSlot.byObjID.set(playerObjID, this);
        console.log(`InfectedBotSlot[${this.slotIndex}] | Spawned Player(${playerObjID}) on spawner(${spawnerObjID}) state=${this.state} alpha=${this.isAlpha}`);
        LogBotLifecycle(this, 'spawned', `spawner=${spawnerObjID} alpha=${this.isAlpha} nextTickDelay=${AI_BOT_SPAWN_TICK_GRACE_SECONDS.toFixed(2)}s`);

        const pp = PlayerProfile.Get(player, spawnerObjID);
        if (pp) {
            pp.isInfectedTeam = true;
            pp.isAlphaInfected = this.isAlpha;
            pp.isDead = false;
            pp.playerID = playerObjID;
            pp.player = player;
            pp._botProfile = new BotProfile(this.name, this.isAlpha, true);
            PlayerProfile._allPlayers.set(playerObjID, pp);
            PlayerProfile._deployedPlayers.set(playerObjID, pp);
        }

        // Increment the spawn token so any still-pending async block from a prior spawn of
        // this slot detects it is stale and aborts, preventing double-initialization races.
        this.spawnToken++;
        const token = this.spawnToken;

        (async () => {
            if (this.spawnToken !== token || !PlayerIsAliveAndValid(player)) return;
            mod.SetPlayerMaxHealth(player, this.isAlpha ? 300 : 50);
            if (this.isParachuteSpawner) {
                // Parachute drop: let the bot glide in before switching to normal pursuit behavior.
                mod.AIParachuteBehavior(player);
                await mod.Wait(5);
                if (this.spawnToken !== token || !PlayerIsAliveAndValid(player)) return;
            }
            await AISpawnHandler.AssignAIEquipment(player, TeamNameString.Infected);
            if (this.spawnToken !== token || !PlayerIsAliveAndValid(player)) return;
            ApplyInfectedBotManualControl(player);
            ShowAlphaInfectedIndicator(player);
            if (this.isAlpha) {
                InitLeapSystem(player);
            }
        })();
        GameHandler.RebuildPlayerLists();
    }

    HandleDeath(): void {
        const prevObjID = this.playerObjID;
        CleanupVehicleChaseState(this);
        if (this.player) {
            StopInfectedBotMeleeAttack(this, this.player);
        }
        if (prevObjID !== undefined) {
            InfectedBotSlot.byObjID.delete(prevObjID);
            CleanupBotTargetWorldIcon(prevObjID, 'InfectedBotSlot.HandleDeath');
        }
        this.player = undefined;
        this.playerObjID = undefined;
        this.pendingSpawnerID = undefined;
        this.pendingSpawnStartedAt = undefined;
        this.resetTick();

        if (GameHandler.gameState !== GameState.GameRoundIsRunning) {
            this.state = BotSlotState.Idle;
            this.respawnDueAt = undefined;
            return;
        }

        this.state = BotSlotState.DeadAwaitingRespawn;
        if (prevObjID !== undefined) {
            InfectedBotSlot.deadByObjID.set(prevObjID, this);
            // Watchdog fallback: if OnPlayerLeaveGame never fires (engine edge case),
            // CheckStuckInfectedSlots will call Respawn() once this timeout expires.
            this.respawnDueAt = (Date.now() / 1000) + INFECTED_PENDING_SPAWN_TIMEOUT_SECONDS;
            console.log(`InfectedBotSlot[${this.slotIndex}] | Died Player(${prevObjID}) -> awaiting body cleanup (OnPlayerLeaveGame) before respawn`);
        } else {
            // No ObjID tracked: can't wait for LeaveGame. Start timer immediately.
            console.log(`InfectedBotSlot[${this.slotIndex}] | Died (no ObjID) -> starting respawn timer immediately`);
            this.startRespawnTimer();
        }
    }

    Respawn(): void {
        if (this.state === BotSlotState.PendingSpawn) {
            // Another caller (watchdog or async block) already initiated this spawn. Do not double-spawn.
            console.log(`InfectedBotSlot[${this.slotIndex}] | Respawn() skipped slot already PendingSpawn on spawner(${this.pendingSpawnerID ?? this.assignedSpawnerID})`);
            return;
        }
        if (BOT_SURVIVAL_TEST_MODE) {
            // In soak mode, keep exactly one deterministic alpha slot so alpha logic is always exercised.
            this.isAlpha = this.slotIndex === BOT_SURVIVAL_TEST_ALPHA_SLOT_INDEX;
        }
        // Clear any dead-body tracking so OnPlayerLeaveGame won't start a redundant timer
        // after the watchdog or another path already triggered Respawn().
        for (const [id, s] of InfectedBotSlot.deadByObjID) {
            if (s === this) { InfectedBotSlot.deadByObjID.delete(id); break; }
        }
        this.respawnDueAt = undefined;
        const spawnerID = this.assignedSpawnerID;
        if (AISpawnHandler.spawnerLock.has(spawnerID)) {
            // this slot exclusively owns its spawner, soclear and proceed.
            console.log(`InfectedBotSlot[${this.slotIndex}] | Cleared stale lock on assigned spawner(${spawnerID})`);
            AISpawnHandler.spawnerLock.delete(spawnerID);
            if (InfectedBotSlot.pendingBySpawnerID.get(spawnerID) === this) {
                InfectedBotSlot.pendingBySpawnerID.delete(spawnerID);
            }
        }
        const spawnerObj = mod.GetSpawner(spawnerID);
        this.state = BotSlotState.PendingSpawn;
        this.pendingSpawnerID = spawnerID;
        this.pendingSpawnStartedAt = Date.now() / 1000;
        AISpawnHandler.spawnerLock.add(spawnerID);
        InfectedBotSlot.pendingBySpawnerID.set(spawnerID, this);
        console.log(`InfectedBotSlot[${this.slotIndex}] | Respawn requested on spawner(${spawnerID})`);
        const botName = MakeMessage(this.name);
        mod.SpawnAIFromAISpawner(spawnerObj, mod.SoldierClass.Recon, botName, INFECTED_TEAM);
    }
}

/** One slot per spawner in SURVIVOR_AI_SPAWNERS. Spawned once per round; converts to infected on death. */
class SurvivorBotSlot {
    slotIndex: number;
    spawnerID: number;
    name: string;
    state: BotSlotState = BotSlotState.Idle;
    player?: mod.Player;
    playerObjID?: number;

    static slots: SurvivorBotSlot[] = [];
    static byObjID: Map<number, SurvivorBotSlot> = new Map();
    static pendingBySpawnerID: Map<number, SurvivorBotSlot> = new Map();

    constructor(index: number, spawnerID: number, name: string) {
        this.slotIndex = index;
        this.spawnerID = spawnerID;
        this.name = name;
    }

    static InitSlots(): void {
        SurvivorBotSlot.slots = [];
        SurvivorBotSlot.byObjID.clear();
        SurvivorBotSlot.pendingBySpawnerID.clear();
        for (let i = 0; i < SURVIVOR_AI_SPAWNERS.length; i++) {
            const id = SURVIVOR_AI_SPAWNERS[i];
            const name = BOT_NAME_MAP.get(id) ?? `survivor_bot_${id}`;
            SurvivorBotSlot.slots.push(new SurvivorBotSlot(i, id, name));
        }
    }

    static GetByObjID(objID: number): SurvivorBotSlot | undefined {
        return SurvivorBotSlot.byObjID.get(objID);
    }

    static ResetAll(): void {
        SurvivorBotSlot.byObjID.clear();
        SurvivorBotSlot.pendingBySpawnerID.clear();
        for (const slot of SurvivorBotSlot.slots) {
            slot.state = BotSlotState.Idle;
            slot.player = undefined;
            slot.playerObjID = undefined;
        }
    }

    HandleSpawned(player: mod.Player, playerObjID: number, spawnerObjID: number): void {
        SurvivorBotSlot.pendingBySpawnerID.delete(spawnerObjID);
        AISpawnHandler.spawnerLock.delete(spawnerObjID);
        this.player = player;
        this.playerObjID = playerObjID;
        this.state = BotSlotState.Alive;
        SurvivorBotSlot.byObjID.set(playerObjID, this);

        const pp = PlayerProfile.Get(player, spawnerObjID);
        if (pp) {
            pp.isInfectedTeam = false;
            pp.isAlphaInfected = false;
            pp.isDead = false;
            pp.playerID = playerObjID;
            pp.player = player;
            pp._botProfile = new BotProfile(this.name, false, false);
            PlayerProfile._allPlayers.set(playerObjID, pp);
            PlayerProfile._deployedPlayers.set(playerObjID, pp);
        }

        (async () => {
            await mod.Wait(0.5);
            if (!PlayerIsAliveAndValid(player)) return;
            mod.SetPlayerMaxHealth(player, 50);
            mod.AISetMoveSpeed(player, mod.MoveSpeed.InvestigateRun);
            mod.AISetStance(player, mod.Stance.Stand);
            await AISpawnHandler.AssignAIEquipment(player, TeamNameString.Survivors);
            this.RunBehavior(player);
        })();
        GameHandler.RebuildPlayerLists();
    }

    RunBehavior(player: mod.Player): void {
        (async () => {
            while (GameHandler.gameState !== GameState.GameRoundIsRunning) {
                await mod.Wait(0.5);
                if (GameHandler.gameState === GameState.EndOfRound) return;
            }
            if (!PlayerIsAliveAndValid(player)) return;
            mod.AIBattlefieldBehavior(player);
        })();
    }

    HandleDeath(wasConvertedToInfected: boolean = false, isAlpha: boolean = false): void {
        const prevObjID = this.playerObjID;
        if (prevObjID !== undefined) {
            SurvivorBotSlot.byObjID.delete(prevObjID);
        }
        this.state = BotSlotState.Idle;
        this.player = undefined;
        this.playerObjID = undefined;
        GameHandler.RebuildPlayerLists();

        if (!wasConvertedToInfected) return;
        if (GameHandler.gameState !== GameState.GameStartCountdown &&
            GameHandler.gameState !== GameState.GameRoundIsRunning) return;

        // Claim a free infected slot and queue its respawn as infected.
        const freeSlot = InfectedBotSlot.slots.find(s => s.state === BotSlotState.Idle);
        if (!freeSlot) {
            console.log(`SurvivorBotSlot[${this.slotIndex}] | HandleDeath: no free infected slot`);
            return;
        }
        freeSlot.name = this.name;
        freeSlot.isAlpha = isAlpha;
        freeSlot.state = BotSlotState.DeadAwaitingRespawn;

        const respawnDelay = GameHandler.survivorsCount <= 1
            ? INFECTED_RESPAWN_TIME_LAST_MAN
            : INFECTED_RESPAWN_TIME;
        freeSlot.respawnDueAt = (Date.now() / 1000) + respawnDelay;
        console.log(`SurvivorBotSlot[${this.slotIndex}] | Converted -> InfectedBotSlot[${freeSlot.slotIndex}] respawn in ${respawnDelay}s alpha=${isAlpha}`);

        (async () => {
            await mod.Wait(respawnDelay);
            if (freeSlot.state === BotSlotState.DeadAwaitingRespawn &&
                GameHandler.gameState === GameState.GameRoundIsRunning) {
                freeSlot.Respawn();
            } else if (freeSlot.state === BotSlotState.DeadAwaitingRespawn) {
                // Round ended before respawn fired release the slot.
                freeSlot.state = BotSlotState.Idle;
                freeSlot.respawnDueAt = undefined;
            }
        })();
    }

    Spawn(): void {
        if (this.state !== BotSlotState.Idle) return;
        if (AISpawnHandler.spawnerLock.has(this.spawnerID)) {
            console.log(`SurvivorBotSlot[${this.slotIndex}] | Spawn: spawner ${this.spawnerID} is locked, skipping`);
            return;
        }
        const spawnerObj = mod.GetSpawner(this.spawnerID);
        this.state = BotSlotState.PendingSpawn;
        AISpawnHandler.spawnerLock.add(this.spawnerID);
        SurvivorBotSlot.pendingBySpawnerID.set(this.spawnerID, this);
        const botName = MakeMessage(this.name);
        mod.SpawnAIFromAISpawner(spawnerObj, mod.SoldierClass.Assault, botName, SURVIVOR_TEAM);
    }
}

class AISpawnHandler {
    /** Prevents two concurrent spawns from using the same spawner ID. */
    static spawnerLock: Set<number> = new Set();
    static startingInfectedChosen: boolean = false;
    static startingSurvivorsChosen: boolean = false;

    static InitializeStartingSurvivorSpawns(amountToSpawnOverride?: number): void {
        if (AISpawnHandler.startingSurvivorsChosen) return;
        if (SurvivorBotSlot.slots.length === 0) SurvivorBotSlot.InitSlots();
        const amount = amountToSpawnOverride ?? GameHandler.aiSlotsToBackfill;
        let spawned = 0;
        for (const slot of SurvivorBotSlot.slots) {
            if (spawned >= amount) break;
            if (slot.state === BotSlotState.Idle) {
                slot.Spawn();
                spawned++;
            }
        }
        AISpawnHandler.startingSurvivorsChosen = true;
    }

    static InitializeStartingInfectedSpawns(amountToSpawn: number): void {
        if (AISpawnHandler.startingInfectedChosen) return;
        // Always re-init slots each round so parachute pool changes (enabled/disabled) take effect.
        InfectedBotSlot.InitSlots();
        let spawned = 0;
        for (const slot of InfectedBotSlot.slots) {
            if (spawned >= amountToSpawn) break;
            if (slot.state === BotSlotState.Idle) {
                slot.Respawn();
                spawned++;
            }
        }
        AISpawnHandler.startingInfectedChosen = true;
    }

    /** No-op kept for call-site compatibility. Slots self-manage spawning. */
    static async ProcessBotSpawnQueue(): Promise<void> {
        return;
    }

    static async OnGoingSpawnerCheck(): Promise<void> {
        if (GameHandler.isSpawnCheckRunning) return;
        GameHandler.isSpawnCheckRunning = true;
        while (true) {
            if (GameHandler.gameState !== GameState.GameRoundIsRunning) {
                GameHandler.isSpawnCheckRunning = false;
                return;
            }
            await mod.Wait(AI_BOT_TICK_SECONDS * 2);
            AISpawnHandler.CheckStuckInfectedSlots();
            AISpawnHandler.EnsureInfectedPoolIntegrity();
            TurretSpawner.CheckStuckPlacements();
        }
    }

    static CheckStuckInfectedSlots(): void {
        const now = Date.now() / 1000;
        for (const slot of InfectedBotSlot.slots) {
            if (slot.state === BotSlotState.PendingSpawn) {
                const spawnerID = slot.pendingSpawnerID;
                const pendingFor = slot.pendingSpawnStartedAt ? (now - slot.pendingSpawnStartedAt) : 0;
                const hasPendingMapEntry = spawnerID !== undefined && InfectedBotSlot.pendingBySpawnerID.get(spawnerID) === slot;
                if (spawnerID === undefined || !hasPendingMapEntry || pendingFor > INFECTED_PENDING_SPAWN_TIMEOUT_SECONDS) {
                    if (spawnerID !== undefined) {
                        AISpawnHandler.spawnerLock.delete(spawnerID);
                        if (InfectedBotSlot.pendingBySpawnerID.get(spawnerID) === slot) {
                            InfectedBotSlot.pendingBySpawnerID.delete(spawnerID);
                        }
                    }
                    console.log(`CheckStuckInfectedSlots | Recovering slot[${slot.slotIndex}] pending spawn. spawner=${spawnerID ?? -1} pendingFor=${pendingFor.toFixed(2)}s`);
                    slot.state = BotSlotState.DeadAwaitingRespawn;
                    slot.pendingSpawnerID = undefined;
                    slot.pendingSpawnStartedAt = undefined;
                    slot.Respawn();
                    continue;
                }
            }

            if (slot.state === BotSlotState.DeadAwaitingRespawn &&
                slot.respawnDueAt !== undefined &&
                now >= slot.respawnDueAt &&
                !slot.player &&
                slot.playerObjID === undefined) {
                console.log(`CheckStuckInfectedSlots | Forcing overdue respawn for slot[${slot.slotIndex}]`);
                slot.Respawn();
            }
        }
    }

    static EnsureInfectedPoolIntegrity(): void {
        let expectedBotPool: number;
        if (BOT_SURVIVAL_TEST_MODE) {
            expectedBotPool = Math.max(
                0,
                Math.min(InfectedBotSlot.slots.length, BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS)
            );
        } else {
            const humanInfected = GameHandler.GetHumanPlayersOnTeam(INFECTED_TEAM).length;
            expectedBotPool = Math.max(
                0,
                // Use InfectedBotSlot.slots.length so the parachute pool is included in the cap when active.
                Math.min(InfectedBotSlot.slots.length, (GameHandler.infectedCount ?? 0) - humanInfected)
            );
        }
        const activeOrPendingBotSlots = InfectedBotSlot.slots.filter(s => s.state !== BotSlotState.Idle).length;

        if (activeOrPendingBotSlots >= expectedBotPool) {
            return;
        }

        let slotsNeeded = expectedBotPool - activeOrPendingBotSlots;
        for (const slot of InfectedBotSlot.slots) {
            if (slotsNeeded <= 0) break;
            if (slot.state !== BotSlotState.Idle) continue;

            slot.isAlpha = false;
            slot.state = BotSlotState.DeadAwaitingRespawn;
            slot.respawnDueAt = Date.now() / 1000;
            console.log(`EnsureInfectedPoolIntegrity | Added slot[${slot.slotIndex}] back to pool. expected=${expectedBotPool} activeOrPending=${activeOrPendingBotSlots}`);
            slot.Respawn();
            slotsNeeded--;
        }
    }

    static RemoveEquipmentSafe(player: mod.Player, slot: mod.InventorySlots): void {
        try {
            mod.RemoveEquipment(player, slot);
        } catch (e) {
            console.log(`AssignAIEquipment | RemoveEquipment failed for Player(${mod.GetObjId(player)}) slot(${slot}) error: ${e}`);
        }
    }

    static async AssignAIEquipment(player: mod.Player, teamString: string): Promise<void> {
        if (!PlayerIsAliveAndValid(player)) return;
        const playerProfile = PlayerProfile.Get(player);
        AISpawnHandler.RemoveEquipmentSafe(player, mod.InventorySlots.PrimaryWeapon);
        AISpawnHandler.RemoveEquipmentSafe(player, mod.InventorySlots.SecondaryWeapon);
        AISpawnHandler.RemoveEquipmentSafe(player, mod.InventorySlots.GadgetOne);
        AISpawnHandler.RemoveEquipmentSafe(player, mod.InventorySlots.GadgetTwo);
        AISpawnHandler.RemoveEquipmentSafe(player, mod.InventorySlots.ClassGadget);
        AISpawnHandler.RemoveEquipmentSafe(player, mod.InventorySlots.Throwable);
        if (playerProfile) {
            playerProfile.isInfectedTeam = teamString === TeamNameString.Infected;
            await InitializePlayerEquipment(player, playerProfile);
        }
    }

    static async OnBotSpawnFromSpawner(eventPlayer: mod.Player, spawnerObjID: number): Promise<void> {
        if (!PlayerIsAliveAndValid(eventPlayer)) return;
        if (GameHandler.gameState === GameState.EndOfRound)
            return;

        if (DecoySpawner.HasPendingSpawnOn(spawnerObjID)) {
            DecoySpawner.HandleSpawned(eventPlayer, mod.GetObjId(eventPlayer), spawnerObjID);
            return;
        }

        if (TurretSpawner.HasPendingSpawnOn(spawnerObjID)) {
            TurretSpawner.HandleSpawned(eventPlayer, mod.GetObjId(eventPlayer), spawnerObjID);
            return;
        }

        const infectedSlot = InfectedBotSlot.pendingBySpawnerID.get(spawnerObjID);
        const survivorSlot = SurvivorBotSlot.pendingBySpawnerID.get(spawnerObjID);

        const playerObjID = mod.GetObjId(eventPlayer);
        if (playerObjID === -1) {
            // Player is dead/invalid -- release the spawner lock and clean up the slot.
            AISpawnHandler.spawnerLock.delete(spawnerObjID);
            if (infectedSlot) {
                InfectedBotSlot.pendingBySpawnerID.delete(spawnerObjID);
                infectedSlot.state = BotSlotState.DeadAwaitingRespawn;
                infectedSlot.pendingSpawnerID = undefined;
                infectedSlot.pendingSpawnStartedAt = undefined;
                console.log(`OnBotSpawnFromSpawner | ObjID -1 for infected slot [${infectedSlot.name}] on spawner(${spawnerObjID}), requeueing spawn`);
                infectedSlot.Respawn();
                return;
            }
            if (survivorSlot) {
                SurvivorBotSlot.pendingBySpawnerID.delete(spawnerObjID);
                survivorSlot.state = BotSlotState.Idle;
            }
            console.log(`OnBotSpawnFromSpawner | ObjID -1 for spawner(${spawnerObjID}), skipping`);
            return;
        }

        if (infectedSlot) {
            infectedSlot.HandleSpawned(eventPlayer, playerObjID, spawnerObjID);
            return;
        }

        if (survivorSlot) {
            survivorSlot.HandleSpawned(eventPlayer, playerObjID, spawnerObjID);
            return;
        }

        console.log(`OnBotSpawnFromSpawner "CRITICAL ERROR" | No slot found for spawnerObjID(${spawnerObjID}), Player(${playerObjID})`);
    }
}

//////////////////////////////////////////////////////////////////
///////------------------- BOT LOGIC  ------------------//////////
//////////////////////////////////////////////////////////////////


function PlayerIsAliveAndValid(eventPlayer: mod.Player): boolean {
    if (!eventPlayer) return false;
    return SafeGetSoldierStateBool(eventPlayer, mod.SoldierStateBool.IsAlive, false);
}


/** Returns the closest alive survivor to `bot`. If none found, returned player will be invalid*/
function pickClosestAliveSurvivorFor(bot: mod.Player): mod.Player | undefined {
    const botPos = mod.GetSoldierState(bot, mod.SoldierStateVector.GetPosition);
    const closestSurvivor = mod.ClosestPlayerTo(botPos, SURVIVOR_TEAM);
    if (!closestSurvivor) return closestSurvivor;
    // Only redirect if this infected's natural target has an active decoy out -- the decoy
    // takes the owner's place rather than hijacking every infected's targeting globally.
    const decoy = DecoySpawner.GetActiveDecoyForOwner(closestSurvivor);
    return decoy ?? closestSurvivor;
}

function IsVehicleRefValid(vehicle?: mod.Vehicle): boolean {
    if (!vehicle) return false;
    try {
        return mod.GetObjId(vehicle) > -1;
    } catch {
        return false;
    }
}

function CleanupVehicleChaseState(slot: InfectedBotSlot): void {
    slot.tick.trackedVehicle = undefined;
    slot.tick.vehicleAttackWindowStartedAt = undefined;
    slot.tick.vehicleAttackWindowDamageProfile = undefined;
}

function GetVectorMagnitude(vector: mod.Vector): number {
    const x = getVecX(vector);
    const y = getVecY(vector);
    const z = getVecZ(vector);
    return Math.sqrt((x * x) + (y * y) + (z * z));
}

function GetInfectedAIAreaMoveSpeedMultiplierForTarget(target: mod.Player | undefined): number {
    const targetInVehicle = target
        ? SafeGetSoldierStateBool(target, mod.SoldierStateBool.IsInVehicle)
        : false;

    if (!targetInVehicle) {
        return AI_INFECTED_BASE_SPEED_MULTIPLIER;
    }

    const targetVehicle = target ? mod.GetVehicleFromPlayer(target) : undefined;
    if (!targetVehicle || !IsVehicleRefValid(targetVehicle)) {
        return AI_VEHICLE_TARGET_MIN_MOVE_MULTIPLIER;
    }

    const vehicleVelocity = mod.GetVehicleState(targetVehicle, mod.VehicleStateVector.LinearVelocity);
    const vehicleSpeed = GetVectorMagnitude(vehicleVelocity);
    const scaledMultiplier =
        AI_VEHICLE_TARGET_MIN_MOVE_MULTIPLIER +
        (vehicleSpeed / AI_VEHICLE_TARGET_SPEED_PER_MULTIPLIER_STEP);

    return Math.min(
        AI_VEHICLE_TARGET_MAX_MOVE_MULTIPLIER,
        Math.max(AI_VEHICLE_TARGET_MIN_MOVE_MULTIPLIER, scaledMultiplier),
    );
}

function ApplyInfectedAIAreaMoveSpeedMultiplier(
    bot: mod.Player,
    slot: InfectedBotSlot | undefined,
    target: mod.Player | undefined,
): void {
    const desiredMultiplier = GetInfectedAIAreaMoveSpeedMultiplierForTarget(target);
    const cachedMultiplier = slot?.tick.lastAreaMoveSpeedMultiplier;
    if (cachedMultiplier !== undefined && Math.abs(cachedMultiplier - desiredMultiplier) < 0.01) {
        return;
    }

    mod.SetPlayerMovementSpeedMultiplier(bot, desiredMultiplier);
    if (slot) {
        slot.tick.lastAreaMoveSpeedMultiplier = desiredMultiplier;
    }
}

interface VehicleMeleeAttackProfile {
    canAttack: boolean;
    blockedByHeadOnCone: boolean;
    maxAttackDistance: number;
    damageOnForceFire: number;
}

/** Heavier vehicles (Flyer, Vector) get a stronger shove; everything else -- including dirt
 *  bikes, quads, and the golf cart -- uses the light tier. */
function GetInfectedMeleeVehicleImpulseMagnitude(vehicle: mod.Vehicle): number {
    if (
        mod.CompareVehicleName(vehicle, mod.VehicleList.Flyer60) ||
        mod.CompareVehicleName(vehicle, mod.VehicleList.Vector)
    ) {
        return INFECTED_MELEE_VEHICLE_IMPULSE_HEAVY;
    }
    return INFECTED_MELEE_VEHICLE_IMPULSE_LIGHT;
}

/** Shoves `vehicle` away from `attacker` -- called on every infected melee hit that lands on a vehicle. */
function ApplyInfectedMeleeVehicleImpulse(attacker: mod.Player, vehicle: mod.Vehicle): void {
    if (!IsVehicleRefValid(vehicle)) return;
    try {
        const vehiclePos = mod.GetVehicleState(vehicle, mod.VehicleStateVector.VehiclePosition);
        const attackerPos = mod.GetSoldierState(attacker, mod.SoldierStateVector.GetPosition);
        const pushDir = flattenDirection(mod.Subtract(vehiclePos, attackerPos));
        const magnitude = GetInfectedMeleeVehicleImpulseMagnitude(vehicle);
        mod.ApplyImpulse(vehicle, vehiclePos, pushDir, magnitude);
    } catch { }
}

function GetVehicleMeleeAttackProfile(bot: mod.Player, vehicle: mod.Vehicle): VehicleMeleeAttackProfile {
    const vehiclePos = mod.GetVehicleState(vehicle, mod.VehicleStateVector.VehiclePosition);
    const botPos = mod.GetSoldierState(bot, mod.SoldierStateVector.GetPosition);
    const distanceToVehicle = mod.DistanceBetween(botPos, vehiclePos);

    const vehicleToBot = mod.Subtract(botPos, vehiclePos);
    const toBotX = getVecX(vehicleToBot);
    const toBotZ = getVecZ(vehicleToBot);
    const toBotHorizontalLenSq = (toBotX * toBotX) + (toBotZ * toBotZ);

    let facingDot = 0;
    if (toBotHorizontalLenSq > 0.000001) {
        const vehicleFacing = flattenDirection(mod.GetVehicleState(vehicle, mod.VehicleStateVector.FacingDirection));
        const vehicleToBotDir = flattenDirection(vehicleToBot);
        facingDot = mod.DotProduct(vehicleFacing, vehicleToBotDir);
    }

    const blockedByHeadOnCone = facingDot >= AI_VEHICLE_HEAD_ON_CONE_DOT_MIN;
    if (blockedByHeadOnCone) {
        return {
            canAttack: false,
            blockedByHeadOnCone: true,
            maxAttackDistance: AI_VEHICLE_GLANCING_MELEE_DISTANCE,
            damageOnForceFire: 0,
        };
    }

    const isRearHemisphere = facingDot <= AI_VEHICLE_REAR_CONE_DOT_MAX;
    const maxAttackDistance = isRearHemisphere
        ? AI_VEHICLE_REAR_MELEE_DISTANCE
        : AI_VEHICLE_GLANCING_MELEE_DISTANCE;
    const damageOnForceFire = isRearHemisphere
        ? AI_VEHICLE_REAR_FORCE_FIRE_DAMAGE
        : AI_VEHICLE_GLANCING_FORCE_FIRE_DAMAGE;

    return {
        canAttack: distanceToVehicle <= maxAttackDistance,
        blockedByHeadOnCone: false,
        maxAttackDistance,
        damageOnForceFire,
    };
}

function IsInfectedBotWithinTargetFrontHemisphere(bot: mod.Player, targetPlayer: mod.Player): boolean {
    if (!PlayerIsAliveAndValid(targetPlayer)) return false;

    const targetPos = mod.GetSoldierState(targetPlayer, mod.SoldierStateVector.GetPosition);
    const botPos = mod.GetSoldierState(bot, mod.SoldierStateVector.GetPosition);

    const targetFacing = flattenDirection(mod.GetSoldierState(targetPlayer, mod.SoldierStateVector.GetFacingDirection));
    const targetToBot = flattenDirection(mod.Subtract(botPos, targetPos));
    const facingDot = mod.DotProduct(targetFacing, targetToBot);
    return facingDot >= AI_SURVIVOR_FRONT_HEMISPHERE_DOT_MIN;
}

function SetInfectedBotMeleeAttackEnabled(bot: mod.Player, enabled: boolean): void {
    if (enabled) {
        try { mod.AddEquipment(bot, mod.Gadgets.Melee_Sledgehammer); } catch { }
        return;
    }

    // Sledgehammer stays equipped; only clear the AI combat target.
    try { mod.AISetTarget(bot); } catch { }
}

function ApplyInfectedBotManualControl(bot: mod.Player): void {
    SetInfectedBotMeleeAttackEnabled(bot, false);
}

function EnsureInfectedBotSledgehammerActive(bot: mod.Player): void {
    if (!mod.HasEquipment(bot, mod.Gadgets.Melee_Sledgehammer)) {
        try { mod.AddEquipment(bot, mod.Gadgets.Melee_Sledgehammer); } catch { }
    }
    try { mod.ForceSwitchInventory(bot, mod.InventorySlots.MeleeWeapon); } catch { }
}

function StartInfectedBotMeleeAttackAtPlayer(slot: InfectedBotSlot, bot: mod.Player, targetPlayer: mod.Player): void {
    if (INFECTED_AI_HARD_DISABLE_ATTACKS) {
        StopInfectedBotMeleeAttack(slot, bot);
        return;
    }

    const targetObjId = mod.GetObjId(targetPlayer);
    if (targetObjId < 0 || !PlayerIsAliveAndValid(targetPlayer)) {
        StopInfectedBotMeleeAttack(slot, bot);
        return;
    }

    if (!IsInfectedBotWithinTargetFrontHemisphere(bot, targetPlayer)) {
        // Bot is in the target's rear hemisphere - strip weapon to prevent backstabs/takedowns.
        if (mod.HasEquipment(bot, mod.Gadgets.Melee_Sledgehammer)) {
            try { mod.RemoveEquipment(bot, mod.InventorySlots.MeleeWeapon); } catch { }
        }
        StopInfectedBotMeleeAttack(slot, bot);
        return;
    }

    if (slot.tick.meleeGadgetActive && slot.tick.meleeTargetObjId === targetObjId) {
        const nextAllowed = slot.tick.nextMeleeForceFireAt ?? 0;
        if ((Date.now() / 1000) < nextAllowed) {
            return;
        }
    }

    SetInfectedBotMeleeAttackEnabled(bot, true);

    try { mod.AISetTarget(bot, targetPlayer); } catch { }
    const now = Date.now() / 1000;
    const nextAllowed = slot.tick.nextMeleeForceFireAt ?? 0;
    if (now < nextAllowed) {
        return;
    }
    try {
        mod.AIForceFire(bot, AI_MELEE_FORCE_FIRE_DURATION);
        slot.tick.meleeGadgetActive = true;
        slot.tick.meleeTargetObjId = targetObjId;
        slot.tick.nextMeleeForceFireAt = now + AI_MELEE_FORCE_FIRE_COOLDOWN_SECONDS;
    } catch {
        SetInfectedBotMeleeAttackEnabled(bot, false);
        slot.tick.meleeGadgetActive = false;
        slot.tick.meleeTargetObjId = undefined;
        slot.tick.nextMeleeForceFireAt = undefined;
    }
}

function StartInfectedBotMeleeAttackAtPosition(
    slot: InfectedBotSlot,
    bot: mod.Player,
    vehicleTarget?: mod.Vehicle,
    vehicleForceFireDamage: number = AI_VEHICLE_REAR_FORCE_FIRE_DAMAGE,
): void {
    if (INFECTED_AI_HARD_DISABLE_ATTACKS) {
        StopInfectedBotMeleeAttack(slot, bot);
        return;
    }

    if (slot.tick.meleeGadgetActive && slot.tick.meleeTargetObjId === undefined) {
        const nextAllowed = slot.tick.nextMeleeForceFireAt ?? 0;
        if ((Date.now() / 1000) < nextAllowed) {
            return;
        }
    }

    SetInfectedBotMeleeAttackEnabled(bot, true);

    // try { mod.AISetTarget(bot); } catch { }
    const now = Date.now() / 1000;
    const nextAllowed = slot.tick.nextMeleeForceFireAt ?? 0;
    if (now < nextAllowed) {
        return;
    }
    try {
        mod.AIForceFire(bot, AI_MELEE_FORCE_FIRE_DURATION);
        if (vehicleTarget && vehicleForceFireDamage > 0 && IsVehicleRefValid(vehicleTarget)) {
            const liveVehicleMeleeProfile = GetVehicleMeleeAttackProfile(bot, vehicleTarget);
            if (liveVehicleMeleeProfile.canAttack && !liveVehicleMeleeProfile.blockedByHeadOnCone) {
                const intendedRearAttack = vehicleForceFireDamage === AI_VEHICLE_REAR_FORCE_FIRE_DAMAGE;
                const liveRearAttack = liveVehicleMeleeProfile.damageOnForceFire === AI_VEHICLE_REAR_FORCE_FIRE_DAMAGE;

                // Do not allow a rear-attack path to downgrade into an instant glancing hit,
                // because glancing attacks must satisfy their own dwell window.
                if (!intendedRearAttack || liveRearAttack) {
                    const damageToApply = Math.min(vehicleForceFireDamage, liveVehicleMeleeProfile.damageOnForceFire);
                    if (damageToApply > 0) {
                        try { mod.DealDamage(vehicleTarget, damageToApply); } catch { }
                        ApplyInfectedMeleeVehicleImpulse(bot, vehicleTarget);
                    }
                }
            }
        }
        slot.tick.meleeGadgetActive = true;
        slot.tick.meleeTargetObjId = undefined;
        slot.tick.nextMeleeForceFireAt = now + AI_MELEE_FORCE_FIRE_VEHICLE_COOLDOWN_SECONDS;
    } catch {
        SetInfectedBotMeleeAttackEnabled(bot, false);
        slot.tick.meleeGadgetActive = false;
        slot.tick.meleeTargetObjId = undefined;
        slot.tick.nextMeleeForceFireAt = undefined;
    }
}

function StopInfectedBotMeleeAttack(slot: InfectedBotSlot, bot: mod.Player): void {
    SetInfectedBotMeleeAttackEnabled(bot, false);
    slot.tick.meleeGadgetActive = false;
    slot.tick.meleeTargetObjId = undefined;
    slot.tick.nextMeleeForceFireAt = undefined;
}

function LogBotLifecycle(slot: InfectedBotSlot, stage: string, details?: string): void {
    if (!DEBUG_BOT_LIFECYCLE) return;
    const now = Date.now() / 1000;
    const sinceSpawn = slot.tick.lifecycleSpawnedAt !== undefined
        ? `${(now - slot.tick.lifecycleSpawnedAt).toFixed(2)}s`
        : 'n/a';
    const botObjId = slot.playerObjID ?? -1;
    const suffix = details ? ` | ${details}` : '';
    console.log(`[BotLifecycle] slot=${slot.slotIndex} bot=${botObjId} stage=${stage} t+${sinceSpawn}${suffix}`);
}

function EnsureInfectedBotMoveSpeed(slot: InfectedBotSlot, bot: mod.Player, desiredSpeed: mod.MoveSpeed): void {
    try {
        mod.AISetMoveSpeed(bot, desiredSpeed);
        slot.tick.lastMoveSpeed = desiredSpeed;
    } catch {
        // Best-effort move-speed command: avoid breaking chase flow if the runtime rejects a write.
    }
}

function IssueInfectedBotMove(slot: InfectedBotSlot, bot: mod.Player, destination: mod.Vector, reason: string): void {
    // Reassert sprint on each movement command to survive runtime behavior resets.
    EnsureInfectedBotMoveSpeed(slot, bot, mod.MoveSpeed.Sprint);
    mod.AIMoveToBehavior(bot, destination);
    if (!slot.tick.lifecycleFirstMoveIssuedLogged) {
        slot.tick.lifecycleFirstMoveIssuedLogged = true;
        LogBotLifecycle(slot, 'first_move_command', `reason=${reason}`);
    }
}

/** Trigger the charge-leap for an alpha infected bot. Manages its own async flow; the tick is skipped while leaping. */
async function TriggerAIChargeLeap(slot: InfectedBotSlot, bot: mod.Player): Promise<void> {
    if (!IsLeapAttackAvailableNow(bot)) return;
    if (slot.tick.leapInProgress) return;
    slot.tick.leapInProgress = true;
    StopInfectedBotMeleeAttack(slot, bot);
    mod.AIIdleBehavior(bot);
    EnsureInfectedBotSledgehammerActive(bot);

    const extraChargeHoldSeconds = 1.0;
    const crouchLeadSeconds = LEAP_CROUCH_HOLD_SECONDS + extraChargeHoldSeconds;
    const crouchHoldSeconds = crouchLeadSeconds + AI_LEAP_FORCE_FIRE_DURATION + AI_LEAP_POST_CHARGE_WAIT_SECONDS;
    const fireHoldSeconds = AI_LEAP_FORCE_FIRE_DURATION;
    let launched = false;

    try {
        // Hold position and crouch-charge first, then fire once charge has been held long enough.
        mod.AIIdleBehavior(bot);
        EnsureInfectedBotSledgehammerActive(bot);
        mod.SetAiInput(bot, mod.AiInput.Crouch, crouchHoldSeconds);
        await mod.Wait(crouchLeadSeconds);
        if (!PlayerIsAliveAndValid(bot)) return;

        await mod.Wait(0.05);
        if (!PlayerIsAliveAndValid(bot)) return;
        EnsureInfectedBotSledgehammerActive(bot);
        mod.AIForceFire(bot, fireHoldSeconds);
        await mod.Wait(AI_LEAP_POST_CHARGE_WAIT_SECONDS);
        if (!PlayerIsAliveAndValid(bot)) return;

        // Explicit post-charge fire pulse so AI doesn't uncrouch/reloop before leap is triggered.
        try { mod.AIForceFire(bot, AI_LEAP_FORCE_FIRE_DURATION); } catch { }

        const launchTimeoutAt = (Date.now() / 1000) + AI_LEAP_LAUNCH_TIMEOUT_SECONDS;
        while ((Date.now() / 1000) < launchTimeoutAt) {
            if (!PlayerIsAliveAndValid(bot)) return;
            const inAir = mod.GetSoldierState(bot, mod.SoldierStateBool.IsInAir);
            const onGround = mod.GetSoldierState(bot, mod.SoldierStateBool.IsOnGround);
            if (inAir && !onGround) {
                launched = true;
                break;
            }
            await mod.Wait(AI_LEAP_STATE_POLL_SECONDS);
        }

        // If launched, hold leap-in-progress until flight and landing finish.
        if (launched) {
            while (true) {
                if (!PlayerIsAliveAndValid(bot)) return;
                const inAir = mod.GetSoldierState(bot, mod.SoldierStateBool.IsInAir);
                const onGround = mod.GetSoldierState(bot, mod.SoldierStateBool.IsOnGround);
                if (onGround && !inAir) break;
                await mod.Wait(AI_LEAP_STATE_POLL_SECONDS);
            }
        }
    } finally {
        slot.tick.leapInProgress = false;
        if (PlayerIsAliveAndValid(bot)) {
            if (mod.HasEquipment(bot, mod.Gadgets.Melee_Sledgehammer)) {
                try { mod.RemoveEquipment(bot, mod.InventorySlots.MeleeWeapon); } catch { }
            }
            mod.AIIdleBehavior(bot);
        }
    }
}

/**
 * Tick the chase/attack AI for one infected bot slot.
 * When the target is in a vehicle that vehicle is tracked directly as the movement destination
 * and attacking is gated by vehicle angle + distance windows (head-on cone blocked, side/front
 * glancing damage, rear full damage), allowing a full-speed sprint approach.
 * Alpha bots trigger a leap attack when outside the current melee window.
 */
function InfectedBotLogicTick(slot: InfectedBotSlot): void {
    const infectedBot = slot.player!;

    if (GameHandler.gameState !== GameState.GameRoundIsRunning) return;
    if (!PlayerIsAliveAndValid(infectedBot)) return;

    // Hold off the chase tick while move-fail recovery is active.
    const now = Date.now() / 1000;
    if (slot.tick.moveFailHoldUntil && now < slot.tick.moveFailHoldUntil) {
        StopInfectedBotMeleeAttack(slot, infectedBot);
        slot.tick.behavior = 'recovering_move_fail';
        UpdateBotTargetWorldIcon(slot);
        return;
    }

    if (slot.tick.leapInProgress) {
        StopInfectedBotMeleeAttack(slot, infectedBot);
        mod.AIIdleBehavior(infectedBot);
        slot.tick.behavior = 'vehicle_chase_leap';
        UpdateBotTargetWorldIcon(slot);
        return;
    }

    const tick = slot.tick;
    EnsureInfectedBotMoveSpeed(slot, infectedBot, mod.MoveSpeed.Sprint);

    const disableAttacks = INFECTED_AI_HARD_DISABLE_ATTACKS || (BOT_SURVIVAL_TEST_MODE && BOT_SURVIVAL_TEST_DISABLE_ATTACKS);
    if (disableAttacks) {
        SetInfectedBotMeleeAttackEnabled(infectedBot, false);
    }
    // Re-evaluate target each tick
    let target = tick.target;
    if (!target || !PlayerIsAliveAndValid(target)) {
        StopInfectedBotMeleeAttack(slot, infectedBot);
        CleanupVehicleChaseState(slot);
        target = pickClosestAliveSurvivorFor(infectedBot);
        tick.target = target;
        tick.lastMoveIssuedAt = 0;
        tick.lastMovePos = undefined;
        tick.trackedVehicle = undefined;
    } else {
        const closest = pickClosestAliveSurvivorFor(infectedBot);
        if (closest && mod.GetObjId(closest) !== mod.GetObjId(target)) {
            StopInfectedBotMeleeAttack(slot, infectedBot);
            CleanupVehicleChaseState(slot);
            target = closest;
            tick.target = target;
            tick.lastMoveIssuedAt = 0;
            tick.lastMovePos = undefined;
            tick.trackedVehicle = undefined;
        }
    }

    if (!target) {
        if (tick.inAreaTrigger) {
            ApplyInfectedAIAreaMoveSpeedMultiplier(infectedBot, slot, undefined);
        }
        StopInfectedBotMeleeAttack(slot, infectedBot);
        CleanupVehicleChaseState(slot);
        const botProfile = PlayerProfile.Get(infectedBot);
        if (botProfile) {
            botProfile.currentTarget = undefined;
        }
        tick.behavior = 'idle_no_target';
        tick.lastMovePos = undefined;
        tick.trackedVehicle = undefined;
        UpdateBotTargetWorldIcon(slot);
        return;
    }

    const botProfile = PlayerProfile.Get(infectedBot);
    if (botProfile) {
        botProfile.currentTarget = target;
    }

    const isTargetInVehicle = mod.GetSoldierState(target, mod.SoldierStateBool.IsInVehicle);
    // Vehicle-chase speed scaling should apply everywhere, not only inside area triggers.
    if (tick.inAreaTrigger || isTargetInVehicle) {
        ApplyInfectedAIAreaMoveSpeedMultiplier(infectedBot, slot, target);
    } else if (tick.lastAreaMoveSpeedMultiplier !== undefined) {
        // Ensure temporary chase boosts are cleared when not in trigger and target is dismounted.
        mod.SetPlayerMovementSpeedMultiplier(infectedBot, botProfile?.isAlphaInfected ? 1.2 : 1);
        tick.lastAreaMoveSpeedMultiplier = undefined;
    }

    const infectedBotPos = mod.GetSoldierState(infectedBot, mod.SoldierStateVector.GetPosition);

    // --- Vehicle chase path ---
    if (isTargetInVehicle) {
        // Acquire or refresh the tracked vehicle reference from the target occupant.
        const currentTargetVehicle = mod.GetVehicleFromPlayer(target);
        if (currentTargetVehicle) {
            if (!tick.trackedVehicle
                || mod.GetObjId(currentTargetVehicle) !== mod.GetObjId(tick.trackedVehicle)) {
                tick.trackedVehicle = currentTargetVehicle;
            }
        }

        const veh = tick.trackedVehicle;
        if (veh) {
            const vehiclePos = mod.GetVehicleState(veh, mod.VehicleStateVector.VehiclePosition);
            const vehicleMeleeProfile = GetVehicleMeleeAttackProfile(infectedBot, veh);

            const timeSinceLastMove = now - tick.lastMoveIssuedAt;
            if (timeSinceLastMove >= AI_VEHICLE_MOVE_REISSUE_SECONDS || !tick.lastMovePos) {
                IssueInfectedBotMove(slot, infectedBot, vehiclePos, 'vehicle_chase');
                tick.lastMoveIssuedAt = now;
                tick.lastMovePos = vehiclePos;
            }

            if (vehicleMeleeProfile.canAttack) {
                if (!disableAttacks) {
                    const vehicleAttackDamageProfile = vehicleMeleeProfile.damageOnForceFire;
                    if (
                        tick.vehicleAttackWindowStartedAt === undefined
                        || tick.vehicleAttackWindowDamageProfile !== vehicleAttackDamageProfile
                    ) {
                        tick.vehicleAttackWindowStartedAt = now;
                        tick.vehicleAttackWindowDamageProfile = vehicleAttackDamageProfile;
                    }

                    const elapsedInVehicleAttackWindow = now - (tick.vehicleAttackWindowStartedAt ?? now);
                    if (elapsedInVehicleAttackWindow < AI_VEHICLE_ATTACK_WINDOW_SECONDS) {
                        StopInfectedBotMeleeAttack(slot, infectedBot);
                        tick.behavior = 'vehicle_melee_cooldown';
                    } else {
                        mod.AISetFocusPoint(infectedBot, vehiclePos, false);
                        StartInfectedBotMeleeAttackAtPosition(
                            slot,
                            infectedBot,
                            veh,
                            vehicleAttackDamageProfile,
                        );
                        tick.behavior = 'vehicle_melee_attack_window';
                    }
                } else {
                    tick.vehicleAttackWindowStartedAt = undefined;
                    tick.vehicleAttackWindowDamageProfile = undefined;
                    StopInfectedBotMeleeAttack(slot, infectedBot);
                    tick.behavior = 'vehicle_melee_no_attack';
                }
            } else {
                // Outside melee range: keep all attacking disabled, focus on chasing.
                tick.vehicleAttackWindowStartedAt = undefined;
                tick.vehicleAttackWindowDamageProfile = undefined;
                StopInfectedBotMeleeAttack(slot, infectedBot);
                if (vehicleMeleeProfile.blockedByHeadOnCone) {
                    tick.behavior = 'vehicle_melee_no_attack';
                } else if (slot.isAlpha && !disableAttacks && IsLeapAttackAvailableNow(infectedBot)) {
                    TriggerAIChargeLeap(slot, infectedBot);
                    tick.behavior = 'vehicle_chase_leap';
                } else {
                    tick.behavior = 'vehicle_chase';
                }
            }
            UpdateBotTargetWorldIcon(slot);
            return;
        }
        // Vehicle ref lost (destroyed); fall through to on-foot path with cleared ref
        CleanupVehicleChaseState(slot);
        tick.trackedVehicle = undefined;
    } else {
        // Target dismounted; discard stale vehicle reference
        CleanupVehicleChaseState(slot);
        tick.trackedVehicle = undefined;
    }

    // --- Normal (on-foot) path ---
    const targetPos = mod.GetSoldierState(target, mod.SoldierStateVector.GetPosition);
    const dist = mod.DistanceBetween(infectedBotPos, targetPos);

    // Evaluate hemisphere before any distance gate so the weapon is stripped proactively
    // on every tick the bot is behind the player within reach, not just at the moment of swing.
    const targetInFrontHemisphere = IsInfectedBotWithinTargetFrontHemisphere(infectedBot, target);
    if (!targetInFrontHemisphere && dist <= AI_MELEE_LOADOUT_DISTANCE) {
        if (mod.HasEquipment(infectedBot, mod.Gadgets.Melee_Sledgehammer)) {
            try { mod.RemoveEquipment(infectedBot, mod.InventorySlots.MeleeWeapon); } catch { }
        }
    }

    if (dist >= AI_MELEE_LOADOUT_DISTANCE) {
        StopInfectedBotMeleeAttack(slot, infectedBot);
    }

    if (dist <= AI_INFECTED_MELEE_DISTANCE) {
        // Issue move very frequently (AI_MELEE_CLOSE_REISSUE_SECONDS) when in melee range 
        // so the bot tracks updated pos between ticks rather than chasing a stale position.
        const timeSinceLastMove = now - tick.lastMoveIssuedAt;
        if (timeSinceLastMove >= AI_MELEE_CLOSE_REISSUE_SECONDS || !tick.lastMovePos) {
            IssueInfectedBotMove(slot, infectedBot, targetPos, 'melee_track');
            tick.lastMoveIssuedAt = now;
            tick.lastMovePos = targetPos;
        }
        if (!disableAttacks && targetInFrontHemisphere) {
            StartInfectedBotMeleeAttackAtPlayer(slot, infectedBot, target);
            tick.behavior = 'melee_attack_window';
        } else if (!disableAttacks) {
            StopInfectedBotMeleeAttack(slot, infectedBot);
            tick.behavior = 'melee_backstab_blocked';
        } else {
            StopInfectedBotMeleeAttack(slot, infectedBot);
            tick.behavior = 'melee_no_attack';
        }
    } else {
        StopInfectedBotMeleeAttack(slot, infectedBot);
        const timeSinceLastMove = now - tick.lastMoveIssuedAt;
        if (timeSinceLastMove >= AI_DEFAULT_MOVE_REISSUE_SECONDS || !tick.lastMovePos) {
            IssueInfectedBotMove(slot, infectedBot, targetPos, 'chase');
            tick.lastMoveIssuedAt = now;
            tick.lastMovePos = targetPos;
        }
        tick.behavior = 'chase';
    }

    UpdateBotTargetWorldIcon(slot);
}


//////////////////////////////////////////////////////////////////
///////------------------ GAME LOGIC -------------------//////////
//////////////////////////////////////////////////////////////////


function ConfigureResupplyForMap(mapIdentifier: MapNames) {
    RESUPPLY_WORLD_ICONS = [];
    RESUPPLY_INTERACT_POINTS = [];
    RESUPPLY_WORLD_LOCATION.clear();

    const mapConfig = RESUPPLY_CONFIG_BY_MAP.get(mapIdentifier);
    if (!mapConfig) {
        console.log(`ConfigureResupplyForMap | missing config for map ${mapIdentifier}`);
        return;
    }

    RESUPPLY_WORLD_ICONS.push(...mapConfig.worldIcons);
    mapConfig.positionsByInteractPoint.forEach((position, interactPointId) => {
        RESUPPLY_INTERACT_POINTS.push(interactPointId);
        RESUPPLY_WORLD_LOCATION.set(interactPointId, mod.CreateVector(position.x, position.y, position.z));
    });
}

function CompareHQPositions(requestedHQPos: Vector3, threshold: number = CURRENT_MAP_HQ_POSITION_THRESHOLD): MapNames | undefined {
    for (const [identifier, hqInfo] of HQPOSITIONS.entries()) {
        if (Helpers.GetVector3Distance(requestedHQPos, hqInfo.position) <= threshold) {
            return identifier;
        }
    }
    return undefined;
}

function GetCurrentMap(): MapNames | undefined {
    const hqPosition = mod.GetObjectPosition(mod.GetHQ(1));
    const hqVec = Helpers.VectorToVector3(hqPosition);
    const mapIdentifier = CompareHQPositions(hqVec);
    if (!mapIdentifier) {
        console.log(`GetCurrentMap | HQ match failed. Polled HQ pos: x=${hqVec.x}, y=${hqVec.y}, z=${hqVec.z}`);
        return undefined;
    }

    CURRENT_MAP = mapIdentifier;
    ConfigureResupplyForMap(mapIdentifier);

    return mapIdentifier;
}

const MAP_GATE_MATCH_HUD_WIDGETS: Map<number, mod.UIWidget> = new Map();

function ShowMapGateMatchHUD(message: mod.Message) {
    const allPlayers = mod.AllPlayers();
    const pcount = mod.CountOf(allPlayers);
    for (let i = 0; i < pcount; i++) {
        const player = mod.ValueInArray(allPlayers, i) as mod.Player;
        if (!Helpers.HasValidObjId(player)) continue;
        if (SafeIsAISoldier(player)) continue;

        const playerObjId = mod.GetObjId(player);
        const widgetName = `map_gate_match_hud_${playerObjId}`;
        let widget = MAP_GATE_MATCH_HUD_WIDGETS.get(playerObjId);
        if (!widget) {
            mod.AddUIText(
                widgetName,
                mod.CreateVector(200, 0, 0),
                mod.CreateVector(420, 36, 0),
                mod.UIAnchor.Center,
                message,
                player
            );
            widget = mod.FindUIWidgetWithName(widgetName) as mod.UIWidget | undefined;
            if (!widget) continue;
            MAP_GATE_MATCH_HUD_WIDGETS.set(playerObjId, widget);
            mod.SetUITextAnchor(widget, mod.UIAnchor.Center);
            mod.SetUITextSize(widget, 16);
            mod.SetUITextColor(widget, UI.battlefieldBlue);
            mod.SetUIWidgetDepth(widget, mod.UIDepth.AboveGameUI);
        } else {
            mod.SetUITextLabel(widget, message);
        }

        mod.SetUIWidgetVisible(widget, true);
    }
}

async function WaitForCurrentMapGate(showStatusToast: boolean): Promise<MapNames | undefined> {
    let count = 0;

    while (true) {
        const mapIdentifier = GetCurrentMap();
        if (mapIdentifier) {
            console.log(`WaitForCurrentMapGate | Map verified from HQ position: ${mapIdentifier}`);
            let mapIdentifiedStringkey = MakeMessage(mod.stringkeys.map_unknown);
            switch (mapIdentifier) {
                case MapNames.NEXUS:
                    mapIdentifiedStringkey = MakeMessage(mod.stringkeys.current_map_NEXUS);
                    break;
                case MapNames.SAND:
                    mapIdentifiedStringkey = MakeMessage(mod.stringkeys.current_map_SAND);
                    break;
                case MapNames.SAND2:
                    mapIdentifiedStringkey = MakeMessage(mod.stringkeys.current_map_SAND2)
                    break;
            }
            mod.DisplayHighlightedWorldLogMessage(mapIdentifiedStringkey);
            if (DEBUG_SHOW_ALL_UI_ELEMENTS) {
                ShowMapGateMatchHUD(mapIdentifiedStringkey);
            }
            return mapIdentifier;
        }

        if (showStatusToast) {
            const waitMessage = MakeMessage(mod.stringkeys.waiting_for_session_countdown, count);
            if (gameStateMessageToast.isOpen()) {
                gameStateMessageToast.refresh(waitMessage);
            } else {
                gameStateMessageToast.open(waitMessage);
            }
        }

        await mod.Wait(1);
        count++;
    }
}

function GetActiveWeaponSlot(player: mod.Player): mod.InventorySlots | undefined {
    if (mod.IsInventorySlotActive(player, mod.InventorySlots.PrimaryWeapon)) {
        return mod.InventorySlots.PrimaryWeapon;
    }
    if (mod.IsInventorySlotActive(player, mod.InventorySlots.SecondaryWeapon)) {
        return mod.InventorySlots.SecondaryWeapon;
    }
    return undefined;
}

function SupplyFullAmmoForSlot(player: mod.Player, playerProfile: PlayerProfile, slot: mod.InventorySlots) {
    try {
        const loadout = Weapons.GetRoundLoadout(playerProfile);
        const item = (slot === mod.InventorySlots.PrimaryWeapon)
            ? loadout.find(entry => entry?.inventorySlot === InventorySlot.Primary)
            : loadout.find(entry => entry?.inventorySlot === InventorySlot.Sidearm);
        if (!item) return;
        const ammoInfo = Weapons.GetAmmoForItem(item);
        if (!ammoInfo) return;

        if (slot === mod.InventorySlots.PrimaryWeapon) {
            mod.SetInventoryAmmo(player, mod.InventorySlots.PrimaryWeapon, ammoInfo.magSize + 1);
            mod.SetInventoryMagazineAmmo(player, mod.InventorySlots.PrimaryWeapon, ammoInfo.reserveMax);
        } else if (slot === mod.InventorySlots.SecondaryWeapon) {
            mod.SetInventoryAmmo(player, mod.InventorySlots.SecondaryWeapon, ammoInfo.magSize + 1);
            mod.SetInventoryMagazineAmmo(player, mod.InventorySlots.SecondaryWeapon, ammoInfo.reserveMax);
        }
    } catch (e) {
        console.log(`SupplyFullAmmoForSlot | ERROR: ${e}`);
    }
}

async function StartLastManStandingReloadLoop(playerProfile: PlayerProfile) {
    if (!playerProfile || playerProfile.isAI) return;
    if (playerProfile.lmsReloadLoopActive) return;

    const player = playerProfile.player;
    playerProfile.lmsReloadLoopActive = true;
    let wasReloading = false;
    const RELOAD_SFX = mod.SpawnObject(mod.RuntimeSpawn_Common.SFX_UI_MenuNavigation_Loadout_EquipSecondaryWeapon_OneShot2D, ZERO_VEC, ZERO_VEC);
    PlayVOForPlayer(mod.VoiceOverEvents2D.RoundSuddenDeath, mod.VoiceOverFlags.Alpha, player);

    while (
        GameHandler.gameState === GameState.GameRoundIsRunning &&
        playerProfile.isLastManStanding &&
        PlayerIsAliveAndValid(player)
    ) {
        const isReloading = mod.GetSoldierState(player, mod.SoldierStateBool.IsReloading);
        if (isReloading && !wasReloading) {
            const activeSlot = GetActiveWeaponSlot(player);
            if (activeSlot === mod.InventorySlots.PrimaryWeapon || activeSlot === mod.InventorySlots.SecondaryWeapon) {
                const oppositeSlot = activeSlot === mod.InventorySlots.PrimaryWeapon
                    ? mod.InventorySlots.SecondaryWeapon
                    : mod.InventorySlots.PrimaryWeapon;
                await mod.Wait(LMS_RELOAD_SPEED_FACTOR);
                mod.ForceSwitchInventory(player, oppositeSlot);
                await mod.Wait(0.17);
                mod.ForceSwitchInventory(player, activeSlot);
                await mod.Wait(0.05);
                mod.PlaySound(RELOAD_SFX, 1, player);
                SupplyFullAmmoForSlot(player, playerProfile, activeSlot);
            }
        }

        wasReloading = isReloading;
        await mod.Wait(LMS_RELOAD_POLL_SECONDS);
    }

    playerProfile.lmsReloadLoopActive = false;
}

/**
 * Single source of truth: derive loadout, then add equipment and set round-based attributes
 * @param  mod.Player 
 * @param PlayerProfile 
 */
async function InitializePlayerEquipment(eventPlayer: mod.Player, playerProfile: PlayerProfile) {
    const loadout = Weapons.GetRoundLoadout(playerProfile);

    if (!loadout || loadout.length === 0) {
        console.log(`InitializePlayerEquipment ERROR | No loadout returned for Player(${playerProfile.playerID})`);
        return;
    }

    const isInfected = playerProfile.isInfectedTeam || (mod.GetObjId(mod.GetTeam(eventPlayer)) === mod.GetObjId(INFECTED_TEAM));
    const isAI = playerProfile.isAI;

    // Clear any stale PropSpawner tracking from a previous loadout -- this round's roll may
    // no longer include the gadget, and re-equipping it below re-initializes fresh state anyway.
    PropSpawner.CleanupPlayer(eventPlayer);
    // Only reset the decoy *gadget* bookkeeping here (equip/raycast state) -- this runs on every
    // mid-round equipment refresh (LMS, Final Five, etc.), and an already-placed decoy must
    // survive those phase changes. It's only torn down on owner death/undeploy or round end.
    DecoySpawner.CleanupPlayerGadgetState(eventPlayer);
    TurretSpawner.CleanupPlayerGadgetState(eventPlayer);
    // Same idea for the Rorsch's fire-detection polling -- reset here, re-armed below only if
    // this round's Primary slot still holds it.
    RorschRailgun.RemovePlayer(eventPlayer);
    // Same idea for battle-pickup-abandonment tracking -- reset here, re-armed below only if
    // this round's Primary slot still holds one.
    BattlePickupCleanup.RemovePlayer(eventPlayer);

    // apply gear from loadout
    for (const item of loadout) {
        if (!item) {
            console.log(`InitializePlayerEquipment WARNING | Skipping undefined item in loadout for Player(${playerProfile.playerID})`);
            continue;
        }

        if (item.inventorySlot === InventorySlot.Sidearm) {
            if (!item.weapon) {
                console.log(`InitializePlayerEquipment WARNING | Sidearm item missing weapon for Player(${playerProfile.playerID})`);
                continue;
            }
            mod.AddEquipment(eventPlayer, item.weapon as mod.Weapons, item.packageImage as mod.WeaponPackage);
            const ammoInfo = Weapons.GetAmmoForItem(item);
            if (ammoInfo) {
                mod.SetInventoryAmmo(eventPlayer, mod.InventorySlots.SecondaryWeapon, ammoInfo.magSize + 1);
                mod.SetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.SecondaryWeapon, ammoInfo.reserveMax);
            }
        } else if (item.inventorySlot === InventorySlot.Throwable) {
            if (!item.gadget) {
                console.log(`InitializePlayerEquipment WARNING | Throwable item missing gadget for Player(${playerProfile.playerID})`);
                continue;
            }
            mod.AddEquipment(eventPlayer, item.gadget as mod.Gadgets);
            let throwableCount = (item.gadget === mod.Gadgets.Throwable_Throwing_Knife) ? Weapons.maxThrowablesAlpha : Weapons.maxThrowablesStandard;
            mod.SetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.Throwable, throwableCount);
            mod.SetInventoryAmmo(eventPlayer, mod.InventorySlots.Throwable, throwableCount);
        } else if (item.inventorySlot === InventorySlot.Primary) {
            if (!item.weapon) {
                console.log(`InitializePlayerEquipment WARNING | Primary item missing weapon for Player(${playerProfile.playerID})`);
                continue;
            }
            console.log(`InitializePlayerEquipment | Adding Primary Weapon(${item.text || item.weapon}) for Player(${mod.GetObjId(eventPlayer)})`);
            if (!isInfected) {
                mod.AddEquipment(eventPlayer, item.weapon as mod.Weapons, item.packageImage as mod.WeaponPackage);
                const ammoInfo = Weapons.GetAmmoForItem(item);
                if (ammoInfo) {
                    console.log(`InitializePlayerEquipment | Adding ammo for ${item.text || item.weapon} for player(${mod.GetObjId(eventPlayer)})`);
                    mod.SetInventoryAmmo(eventPlayer, mod.InventorySlots.PrimaryWeapon, ammoInfo.magSize + 1);
                    mod.SetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.PrimaryWeapon, ammoInfo.reserveMax);
                }
                if (item.weapon === mod.Weapons.BattlePickup_Rorsch_Mk_2_SMRW) {
                    RorschRailgun.InitPlayer(eventPlayer);
                }
                BattlePickupCleanup.InitPlayer(eventPlayer, item.weapon as mod.Weapons);
            }
        } else if (item.inventorySlot === InventorySlot.Gadget || item.inventorySlot === InventorySlot.GadgetSecondary) {
            // skip ladder for infected bots to avoid them getting stuck trying to use it
            if (!item.gadget || (isAI && item.gadget === mod.Gadgets.Misc_Assault_Ladder)) {
                continue;
            }
            if (item.gadget === mod.Gadgets.Misc_Assault_Ladder)
                await mod.Wait(1); // delay to avoid ladder being selected over sledgehammer
            mod.AddEquipment(eventPlayer, item.gadget as mod.Gadgets);
            // Explicitly set starting charges for gadgets with a catalog entry (thermobaric/HE/
            // incendiary airburst/incendiary shotgun/AP mine/demo charge) instead of relying on
            // engine defaults from AddEquipment. Gadgets not in the catalog (prop spawner, decoy)
            // are left untouched on their existing initialization path.
            const gadgetAmmo = Weapons.GetAmmoForGadget(item);
            if (gadgetAmmo) {
                const gadgetSlotId = item.inventorySlot === InventorySlot.Gadget
                    ? mod.InventorySlots.GadgetOne
                    : mod.InventorySlots.GadgetTwo;
                if (gadgetAmmo.kind === 'chamber') {
                    // Fill the tube/mag and the spare reserve separately -- see GadgetChamberProfile.
                    mod.SetInventoryAmmo(eventPlayer, gadgetSlotId, gadgetAmmo.magSize);
                    mod.SetInventoryMagazineAmmo(eventPlayer, gadgetSlotId, gadgetAmmo.magSize * gadgetAmmo.reserveMags);
                } else {
                    mod.SetInventoryAmmo(eventPlayer, gadgetSlotId, gadgetAmmo.maxCharges);
                }
            }
            // PropSpawner's, DecoySpawner's and TurretSpawner's fire/aim-driven placement flows
            // are human-input only; the portal gadget tool is shared between all three rolls,
            // so route init by nameKey.
            if (item.gadget === mod.Gadgets.Misc_PortalGadget && !isAI) {
                if (item.nameKey === "decoy_gadget") {
                    DecoySpawner.InitPlayer(eventPlayer);
                } else if (item.nameKey === "turret_gadget") {
                    TurretSpawner.InitPlayer(eventPlayer);
                } else {
                    PropSpawner.InitPlayer(eventPlayer);
                }
            }
        }
    }

    // conditional stats for humans
    if (!isAI) {
        if (isInfected) {
            // disabling to troubleshoot high TN/SFT rubberbanding
            // mod.SetPlayerMovementSpeedMultiplier(eventPlayer, playerProfile.isAlphaInfected ? 1.1 : 1);
            mod.SetPlayerIncomingDamageFactor(eventPlayer, playerProfile.isAlphaInfected ? 0.9 : 1);
            mod.SetPlayerMaxHealth(eventPlayer, playerProfile.isAlphaInfected ? 200 : 150);
        }
    }
    if (!isInfected) {
        // mod.SetPlayerMovementSpeedMultiplier(eventPlayer, 1);
        mod.SetPlayerIncomingDamageFactor(eventPlayer, playerProfile.isLastManStanding ? 0.5 : 1);
        mod.SetPlayerMaxHealth(eventPlayer, playerProfile.isLastManStanding ? 300 : 60);
    }
}

// Refresh human player equipment to match the current round rules.
function RefreshHumanEquipment(eventPlayer: mod.Player, playerProfile: PlayerProfile) {
    if (!PlayerIsAliveAndValid(eventPlayer) || SafeIsAISoldier(eventPlayer)) return;

    if (PropSpawner.IsMidPlacement(eventPlayer)) {
        PropSpawner.DeferEquipmentRefresh(eventPlayer, playerProfile);
        return;
    }

    // Clear equipment first to avoid duplicates or stale packages
    try {
        console.log(`RefreshHumanEquipment | Removing existing equipment for Player(${mod.GetObjId(eventPlayer)})`);
        for (const slot of Object.values(mod.InventorySlots)) {
            mod.RemoveEquipment(eventPlayer, slot as mod.InventorySlots);
        }
    } catch (e) {
        console.log(`RefreshHumanEquipment | removal error for Player(${mod.GetObjId(eventPlayer)}): ${e}`);
    }
    InitializePlayerEquipment(eventPlayer, playerProfile);

    const isInfected = playerProfile.isInfectedTeam || (mod.GetObjId(mod.GetTeam(eventPlayer)) === mod.GetObjId(INFECTED_TEAM));
    if (!isInfected) {
        try {
            // Survivors always keep their baseline melee knife as part of the mode kit.
            mod.RemoveEquipment(eventPlayer, mod.InventorySlots.MeleeWeapon);
            mod.AddEquipment(eventPlayer, mod.Gadgets.Melee_Combat_Knife);
        } catch (e) {
            console.log(`RefreshHumanEquipment | melee restore error for Player(${mod.GetObjId(eventPlayer)}): ${e}`);
        }
    }
}

async function SelectRandomAlphaInfected(deferActions: boolean = false) {
    GameHandler.SuspendWinChecksFor(5);

    try {
        await GameHandler.WaitForAllDeploys(WAIT_FOR_SPAWN_TIMEOUT);
    } catch { }

    console.log(`SelectRandomAlphaInfected | DEBUG: ${DEBUG} | lastAlphaPlayerID: ${GameHandler.lastAlphaPlayerID ?? 'none'}`);

    let survivorCandidates: PlayerProfile[] = [];
    console.log('SelectRandomAlphaInfected | Current PlayerProfile._allPlayerProfiles array:');
    if (DEBUG) {
        PlayerProfile._allPlayerProfiles.forEach(pp => {
            const aliveState = SafeIsAlive(pp.player) ? 'isAlive:true' : 'isAlive:false';
            console.log(`\tPlayer(${mod.GetObjId(pp.player)}) HasValidObjId:${Helpers.HasValidObjId(pp.player)} isAI:${pp.isAI} ${aliveState} isInfectedTeam:${pp.isInfectedTeam} wasLastAlpha:${mod.GetObjId(pp.player) === (GameHandler.lastAlphaPlayerID)}`);
        })
    }

    survivorCandidates = GetSurvivorCandidates();

    if (DEBUG_ALPHA_HUMAN_ONLY) {
        let humanOnlyCandidates = survivorCandidates.filter(pp => !pp.isAI);
        if (!humanOnlyCandidates.length) {
            // Fallback: allow last alpha human if they are the only eligible human
            humanOnlyCandidates = PlayerProfile._allPlayerProfiles.filter(pp =>
                !pp.isAI &&
                Helpers.HasValidObjId(pp.player) &&
                SafeIsAlive(pp.player)
            );
        }
        if (!humanOnlyCandidates.length) {
            console.log('SelectRandomAlphaInfected | DEBUG_ALPHA_HUMAN_ONLY enabled but no human candidates found.');
            return undefined;
        }
        survivorCandidates = humanOnlyCandidates;
    }

    console.log(`SelectRandomAlphaInfected | Candidate pool includes humans + bots. Potential ${survivorCandidates.length}/${PlayerProfile._allPlayerProfiles.length} candidate(s).`);
    let alphaInfected: PlayerProfile[] = [];
    const forcedAlphaPlayerID = GameHandler.nextRoundForcedAlphaPlayerID;
    const forcedAlphaCandidate = forcedAlphaPlayerID === undefined
        ? undefined
        : PlayerProfile._allPlayerProfiles.find(pp =>
            mod.GetObjId(pp.player) === forcedAlphaPlayerID &&
            Helpers.HasValidObjId(pp.player) &&
            !pp.isInfectedTeam &&
            SafeIsAlive(pp.player)
        );
    if (forcedAlphaPlayerID !== undefined && !forcedAlphaCandidate) {
        console.log(`SelectRandomAlphaInfected | Forced alpha Player(${forcedAlphaPlayerID}) is unavailable; falling back to normal selection.`);
    }

    if (survivorCandidates.length > 0) {
        const humanCandidates = survivorCandidates.filter(pp => !pp.isAI);

        // If humanCandidates <=2, select two survivors instead of one
        if (humanCandidates.length <= 2) {
            const selectedCandidates: PlayerProfile[] = [];

            // Select first survivor (human-weighted)
            const humanWeight1 = humanCandidates.length === 1 ? 1 : 3;
            const aiWeight1 = 1;

            type WeightedCandidate = {
                pp: PlayerProfile,
                weight: number
            }

            let weightedPool1: WeightedCandidate[] = survivorCandidates.map(pp => ({
                pp,
                weight: pp.isAI ? aiWeight1 : humanWeight1
            })).filter(entry => entry.weight > 0);

            let totalWeight1 = weightedPool1.reduce((sum, entry) => sum + entry.weight, 0);
            let firstSelected: PlayerProfile | undefined;
            if (totalWeight1 > 0) {
                let roll = Math.random() * totalWeight1;
                for (const entry of weightedPool1) {
                    if (roll < entry.weight) {
                        firstSelected = entry.pp;
                        break;
                    }
                    roll -= entry.weight;
                }
            }
            if (!firstSelected) {
                firstSelected = survivorCandidates[Math.floor(Math.random() * survivorCandidates.length)];
            }
            selectedCandidates.push(firstSelected);

            // Select second survivor from remaining pool
            const remainingCandidates = survivorCandidates.filter(pp => mod.GetObjId(pp.player) !== mod.GetObjId(firstSelected.player));
            if (remainingCandidates.length > 0) {
                const humanWeight2 = humanCandidates.length === 1 ? 1 : 3;
                const aiWeight2 = 1;

                let weightedPool2: WeightedCandidate[] = remainingCandidates.map(pp => ({
                    pp,
                    weight: pp.isAI ? aiWeight2 : humanWeight2
                })).filter(entry => entry.weight > 0);

                let totalWeight2 = weightedPool2.reduce((sum, entry) => sum + entry.weight, 0);
                let secondSelected: PlayerProfile | undefined;
                if (totalWeight2 > 0) {
                    let roll = Math.random() * totalWeight2;
                    for (const entry of weightedPool2) {
                        if (roll < entry.weight) {
                            secondSelected = entry.pp;
                            break;
                        }
                        roll -= entry.weight;
                    }
                }
                if (!secondSelected) {
                    secondSelected = remainingCandidates[Math.floor(Math.random() * remainingCandidates.length)];
                }
                selectedCandidates.push(secondSelected);

                console.log(`SelectRandomAlphaInfected | Selected TWO alphas (humanCandidates <= 2) -> Player(${mod.GetObjId(firstSelected.player)}) and Player(${mod.GetObjId(secondSelected.player)})`);
            } else {
                console.log(`SelectRandomAlphaInfected | Selected ONE alpha (low humanCandidates, no remaining) -> Player(${mod.GetObjId(firstSelected.player)})`);
            }
            for (const pp of selectedCandidates) {
                alphaInfected.push(pp);
            }
        } else {
            // Normal selection when humanCandidates > 2
            const humanWeight = humanCandidates.length === 1 ? 1 : 3;
            const aiWeight = 1;

            type WeightedCandidate = {
                pp: PlayerProfile,
                weight: number
            }

            const weightedPool: WeightedCandidate[] = survivorCandidates.map(pp => ({
                pp,
                weight: pp.isAI ? aiWeight : humanWeight
            })).filter(entry => entry.weight > 0);

            let totalWeight = weightedPool.reduce((sum, entry) => sum + entry.weight, 0);
            if (totalWeight > 0) {
                let roll = Math.random() * totalWeight;
                for (const entry of weightedPool) {
                    if (roll < entry.weight) {
                        alphaInfected.push(entry.pp);
                        break;
                    }
                    roll -= entry.weight;
                }
            }

            if (!alphaInfected.length) {
                alphaInfected.push(survivorCandidates[Math.floor(Math.random() * survivorCandidates.length)]);
            }
        }
    } else {
        // Fallback 1: retry without lastAlpha exclusion
        let fallbackCandidates: PlayerProfile[] = [];

        fallbackCandidates = PlayerProfile._allPlayerProfiles.filter(pp => {
            if (!pp || !Helpers.HasValidObjId(pp.player)) return false;
            return mod.GetSoldierState(pp.player, mod.SoldierStateBool.IsAlive);
        });
        if (fallbackCandidates.length > 0) {
            alphaInfected.push(fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)]);
        } else {
            // Fallback 2: any valid player (ignore team/alive state)
            const anyValid = PlayerProfile._allPlayerProfiles.filter(pp => !!pp && Helpers.HasValidObjId(pp.player));
            if (anyValid.length > 0) {
                alphaInfected.push(anyValid[Math.floor(Math.random() * anyValid.length)]);
            }
        }
    }

    if (alphaInfected.length) {
        if (forcedAlphaCandidate) {
            const forcedObjId = mod.GetObjId(forcedAlphaCandidate.player);
            const isAlreadySelected = alphaInfected.some(pp => mod.GetObjId(pp.player) === forcedObjId);
            if (!isAlreadySelected) {
                if (alphaInfected.length > 0) {
                    alphaInfected[0] = forcedAlphaCandidate;
                } else {
                    alphaInfected.push(forcedAlphaCandidate);
                }
                console.log(`SelectRandomAlphaInfected | Forced LMS Player(${forcedObjId}) into alpha selection for this round.`);
            }
        }

        for (const pp of alphaInfected) {
            // record to avoid immediate reselection next round
            pp.isAlphaInfected = true;
            if (pp.isAI && pp._botProfile) {
                pp._botProfile.isAlphaInfected = true;
            }
            LogAlphaState('SelectRandomAlphaInfected | assigned alpha', pp.player, pp, pp._botProfile);
            PlayerProfile.alphaInfected.push(pp);
            GameHandler.lastAlphaPlayerID = mod.GetObjId(pp.player);

            if (deferActions) {
                if (!pp.isAI) {
                    pp.gameCountdownUI?.Show();
                }
                continue;
            }

            // If chosen player is a human survivor, call SwitchTeam to convert them.
            if (mod.GetObjId(mod.GetTeam(pp.player)) === mod.GetObjId(SURVIVOR_TEAM) &&
                !SafeIsAISoldier(pp.player)) {
                await pp.ConvertHumanSurvivorToInfected(pp.player);
                return;
            }
            // otherwise (bot or already infected), just kill to force infected respawn logic
            if (SafeIsAISoldier(pp.player)) {
                if (!pp.isInfectedTeam) {
                    pp.isInfectedTeam = true;
                }
            }
            mod.Kill(pp.player);
        }
    } else if (!alphaInfected) {
        console.log('\"CRITICAL ERROR\" | Could not select a random Alpha Infected - no valid players found!');
        return undefined;
    }

    GameHandler.nextRoundForcedAlphaPlayerID = undefined;
}

async function ApplySelectedAlphaInfectedAfterRoundStart() {
    if (!PlayerProfile.alphaInfected.length) return;

    for (const pp of PlayerProfile.alphaInfected) {
        pp.gameCountdownUI?.Close();

        // If chosen player is a human survivor, convert them now that the round has started
        if (mod.GetObjId(mod.GetTeam(pp.player)) === mod.GetObjId(SURVIVOR_TEAM) &&
            !SafeIsAISoldier(pp.player)) {
            await pp.ConvertHumanSurvivorToInfected(pp.player);
            continue;
        }

        // For AI (or already infected), force respawn as infected
        if (SafeIsAISoldier(pp.player)) {
            if (!pp.isInfectedTeam) {
                pp.isInfectedTeam = true;
            }
            mod.Kill(pp.player);
        }
    }
}

async function DisplayWorldIconResupply() {
    for (let i = 0; i < RESUPPLY_WORLD_ICONS.length; i++) {
        const worldIcon = mod.GetWorldIcon(RESUPPLY_WORLD_ICONS[i]);
        mod.SetWorldIconOwner(worldIcon, mod.GetTeam(1));
        mod.SetWorldIconImage(worldIcon, mod.WorldIconImages.Alert);
        mod.SetWorldIconColor(worldIcon, mod.CreateVector(0.937, 0.906, 1)); // basically white
        mod.EnableWorldIconImage(worldIcon, false); // just showing text for now
        mod.SetWorldIconText(worldIcon, MakeMessage(mod.stringkeys.resupply));
        mod.EnableWorldIconText(worldIcon, true);
    }
}

async function TeleportPlayerOnInteract(eventPlayer: mod.Player, eventInteractPoint?: mod.Object) {
    return; // disabling until map is ready
    // const ladderTop = mod.CreateVector(47.074, 43.4, -14.052);
    // const ladderBottom = mod.CreateVector(46.886, 34.31, -14.052);

    // switch (eventInteractPoint ? mod.GetObjId(eventInteractPoint) : -1) {
    //     case SAND2_WARP_INTERACT_POINT_TOP:
    //         mod.Teleport(eventPlayer, ladderBottom, 0);
    //         break;
    //     case SAND2_WARP_INTERACT_POINT_BOTTOM:
    //         mod.Teleport(eventPlayer, ladderTop, 0);
    //         break;
    //     default:
    //         break;
    // }
}

async function ShowLastManStandingIcon(player: mod.Player) {
    EnsureLastManStandingSpotted(player);
}

function ShowAlphaInfectedIndicator(player: mod.Player) {
    const playerProfile = PlayerProfile.Get(player);
    if (!playerProfile || !playerProfile.isAlphaInfected) {
        return;
    }
    if (GameHandler.gameState !== GameState.GameRoundIsRunning) {
        return;
    }
    if (mod.GetObjId(mod.GetTeam(player)) !== mod.GetObjId(INFECTED_TEAM)) {
        return;
    }
    if (!SafeIsAlive(player)) {
        return;
    }

    const playerObjId = mod.GetObjId(player);
    if (playerObjId < 0) {
        return;
    }

    const previousToken = ALPHA_INDICATOR_TOKENS.get(playerObjId);
    if (previousToken) {
        previousToken.cancel = true;
        LogAlphaState('ShowAlphaInfectedIndicator | canceled previous token', player, playerProfile);
    }
    const verticalOffset = 1.4;
    const illumVerticalOffset = 0.7;
    const forwardOffset = 0.3;
    const illumForwardOffset = -0.4;
    let playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    let facingDir = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);
    let flamePos = mod.CreateVector(
        mod.XComponentOf(playerPos) + (mod.XComponentOf(facingDir) * forwardOffset),
        mod.YComponentOf(playerPos) + verticalOffset + (mod.YComponentOf(facingDir) * forwardOffset),
        mod.ZComponentOf(playerPos) + (mod.ZComponentOf(facingDir) * forwardOffset)
    );
    let illumPos = mod.CreateVector(
        mod.XComponentOf(playerPos),
        mod.YComponentOf(playerPos) + illumVerticalOffset,
        mod.ZComponentOf(playerPos)
    );
    const alphaIndicatorFlameVFX = mod.SpawnObject(ALPHA_INDICATOR_FLAME_VFX, flamePos, ZERO_VEC);
    const alphaIndicatorIllumVFX = mod.SpawnObject(ALPH_INDICATOR_BLINKING_FIRE_VFX, flamePos, ZERO_VEC);
    mod.EnableVFX(alphaIndicatorIllumVFX, true);
    mod.EnableVFX(alphaIndicatorFlameVFX, true);
    // can only modify the custom smoke marker vfx, nothing else will work
    // mod.SetVFXScale(alphaIndicatorFlameVFX, 2);
    LogAlphaState('ShowAlphaInfectedIndicator | spawned indicator', player, playerProfile);

    const token = { cancel: false };
    ALPHA_INDICATOR_TOKENS.set(playerObjId, token);

    const updateAlphaIndicatorVFX = async () => {
        try {
            while (
                !token.cancel
                && GameHandler.gameState === GameState.GameRoundIsRunning
                && SafeIsAlive(player)
                && mod.GetObjId(mod.GetTeam(player)) === mod.GetObjId(INFECTED_TEAM)
                && PlayerProfile.Get(player)?.isAlphaInfected
            ) {
                const isCrouching = mod.GetSoldierState(player, mod.SoldierStateBool.IsCrouching);
                const currentVerticalOffset = isCrouching ? verticalOffset - 1.5 : illumVerticalOffset;
                playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
                facingDir = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);
                flamePos = mod.CreateVector(
                    mod.XComponentOf(playerPos) + (mod.XComponentOf(facingDir) * forwardOffset),
                    mod.YComponentOf(playerPos) + verticalOffset + (mod.YComponentOf(facingDir) * forwardOffset),
                    mod.ZComponentOf(playerPos) + (mod.ZComponentOf(facingDir) * forwardOffset)
                );
                illumPos = mod.CreateVector(
                    mod.XComponentOf(playerPos),
                    mod.YComponentOf(playerPos) + currentVerticalOffset,
                    mod.ZComponentOf(playerPos) + (mod.ZComponentOf(facingDir) * illumForwardOffset)
                )
                mod.MoveVFX(alphaIndicatorFlameVFX, flamePos, ZERO_VEC);
                mod.MoveVFX(alphaIndicatorIllumVFX, illumPos, ZERO_VEC);
                await mod.Wait(0.05);
            }
        } finally {
            const trackedToken = ALPHA_INDICATOR_TOKENS.get(playerObjId);
            if (trackedToken === token) {
                ALPHA_INDICATOR_TOKENS.delete(playerObjId);
            }
            mod.EnableVFX(alphaIndicatorFlameVFX, false);
            mod.EnableVFX(alphaIndicatorIllumVFX, false);
            mod.UnspawnObject(alphaIndicatorFlameVFX);
            mod.UnspawnObject(alphaIndicatorIllumVFX);
            LogAlphaState('ShowAlphaInfectedIndicator | removed both VFX indicators', player, PlayerProfile.Get(player));
        }
    }

    updateAlphaIndicatorVFX();
}

function CleanupWorldIcon(iconMap: Map<number, mod.Any>, playerObjId: number, context: string) {
    const existingIcon = iconMap.get(playerObjId);
    if (!existingIcon) return;
    try {
        mod.EnableWorldIconText(existingIcon, false);
        mod.EnableWorldIconImage(existingIcon, false);
        mod.UnspawnObject(existingIcon);
    } catch { }
    iconMap.delete(playerObjId);
    console.log(`${context} | Removed world icon for Player(${playerObjId})`);
}

function GetIconPosition(player: mod.Player, heightOffset = 2): mod.Vector {
    const playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    return mod.CreateVector(
        mod.XComponentOf(playerPos),
        mod.YComponentOf(playerPos) + heightOffset,
        mod.ZComponentOf(playerPos)
    );
}

function CleanupBotSurvivalDebugWidget(playerObjId: number) {
    const existingWidgetSet = BOT_SURVIVAL_DEBUG_WIDGETS.get(playerObjId);
    if (existingWidgetSet) {
        for (const lineWidget of existingWidgetSet.lines) {
            try { mod.DeleteUIWidget(lineWidget); } catch { }
        }
        try { mod.DeleteUIWidget(existingWidgetSet.root); } catch { }
        BOT_SURVIVAL_DEBUG_WIDGETS.delete(playerObjId);
        return;
    }

    const rootName = `bot_survival_debug_${playerObjId}`;
    const fallbackRoot = mod.FindUIWidgetWithName(rootName) as mod.UIWidget | undefined;
    if (fallbackRoot) {
        try { mod.DeleteUIWidget(fallbackRoot); } catch { }
    }
    for (let i = 0; i < 80; i++) {
        const fallbackLine = mod.FindUIWidgetWithName(`${rootName}_line_${i}`) as mod.UIWidget | undefined;
        if (fallbackLine) {
            try { mod.DeleteUIWidget(fallbackLine); } catch { }
        }
    }
}

function EnsureBotSurvivalDebugWidget(player: mod.Player): BotSurvivalDebugWidgetSet | undefined {
    if (!BOT_SURVIVAL_TEST_MODE) return undefined;
    if (SafeIsAISoldier(player)) return undefined;

    const playerObjId = mod.GetObjId(player);
    if (playerObjId < 0) return undefined;

    const existingWidgetSet = BOT_SURVIVAL_DEBUG_WIDGETS.get(playerObjId);
    if (existingWidgetSet) {
        return existingWidgetSet;
    }

    const rootName = `bot_survival_debug_${playerObjId}`;
    mod.AddUIContainer(
        rootName,
        mod.CreateVector(520, 120, 0),
        mod.CreateVector(415, 900, 0),
        mod.UIAnchor.TopLeft,
        player
    );

    const rootWidget = mod.FindUIWidgetWithName(rootName) as mod.UIWidget | undefined;
    if (!rootWidget) return undefined;

    mod.SetUIWidgetBgFill(rootWidget, mod.UIBgFill.Blur);
    mod.SetUIWidgetBgColor(rootWidget, mod.CreateVector(0.04, 0.04, 0.04));
    mod.SetUIWidgetBgAlpha(rootWidget, 0.72);
    mod.SetUIWidgetPadding(rootWidget, 10);
    mod.SetUIWidgetDepth(rootWidget, mod.UIDepth.AboveGameUI);

    const slotCount = Math.max(1, InfectedBotSlot.slots.length);
    const lineCount = 4 + slotCount * 3;
    const lineWidgets: mod.UIWidget[] = [];
    for (let i = 0; i < lineCount; i++) {
        const lineName = `${rootName}_line_${i}`;
        mod.AddUIText(
            lineName,
            mod.CreateVector(528, 128 + i * 16, 0),
            mod.CreateVector(400, 16, 0),
            mod.UIAnchor.TopLeft,
            MakeMessage(mod.stringkeys.loadout_blank),
            player
        );
        const lineWidget = mod.FindUIWidgetWithName(lineName) as mod.UIWidget | undefined;
        if (!lineWidget) continue;
        mod.SetUITextAnchor(lineWidget, mod.UIAnchor.CenterLeft);
        mod.SetUITextSize(lineWidget, 11);
        mod.SetUITextColor(lineWidget, UI.battlefieldWhite);
        mod.SetUIWidgetDepth(lineWidget, mod.UIDepth.AboveGameUI);
        lineWidgets.push(lineWidget);
    }

    const widgetSet = { root: rootWidget, lines: lineWidgets };
    BOT_SURVIVAL_DEBUG_WIDGETS.set(playerObjId, widgetSet);
    return widgetSet;
}

function GetBotDebugSlotStateLineKey(state: BotSlotState): string {
    switch (state) {
        case BotSlotState.PendingSpawn:
            return 'bot_debug_state_pending_alive';
        case BotSlotState.Alive:
            return 'bot_debug_state_alive_alive';
        case BotSlotState.DeadAwaitingRespawn:
            return 'bot_debug_state_dead_alive';
        case BotSlotState.Idle:
        default:
            return 'bot_debug_state_idle_alive';
    }
}

function GetBotDebugBehaviorLineKey(behavior?: string): string {
    switch (behavior) {
        case 'spawned':
            return 'bot_debug_behavior_spawned_target';
        case 'recovering_move_fail':
            return 'bot_debug_behavior_recovering_move_fail_target';
        case 'idle_no_target':
            return 'bot_debug_behavior_idle_no_target_target';
        case 'vehicle_melee_attack_window':
            return 'bot_debug_behavior_vehicle_melee_attack_window_target';
        case 'vehicle_melee_no_attack':
            return 'bot_debug_behavior_vehicle_melee_no_attack_target';
        case 'vehicle_melee_cooldown':
            return 'bot_debug_behavior_vehicle_melee_cooldown_target';
        case 'vehicle_chase_leap':
            return 'bot_debug_behavior_vehicle_chase_leap_target';
        case 'vehicle_chase':
            return 'bot_debug_behavior_vehicle_chase_target';
        case 'melee_attack_window':
            return 'bot_debug_behavior_melee_attack_window_target';
        case 'melee_no_attack':
            return 'bot_debug_behavior_melee_no_attack_target';
        case 'melee_backstab_blocked':
            return 'bot_debug_behavior_melee_backstab_blocked_target';
        case 'melee_cooldown':
            return 'bot_debug_behavior_melee_cooldown_target';
        case 'chase':
            return 'bot_debug_behavior_chase_target';
        case 'idle':
            return 'bot_debug_behavior_idle_target';
        default:
            return 'bot_debug_behavior_unknown_target';
    }
}

function UpdateBotSurvivalDebugWidget(player: mod.Player) {
    if (!BOT_SURVIVAL_TEST_MODE) return;
    if (!Helpers.HasValidObjId(player)) return;
    if (SafeIsAISoldier(player)) return;

    const widgetSet = EnsureBotSurvivalDebugWidget(player);
    if (!widgetSet) return;

    const viewerObjId = mod.GetObjId(player);
    let botsTargetingViewer = 0;
    const maxSupportedBots = Math.min(BOT_SURVIVAL_TEST_MAX_INFECTED_BOTS, InfectedBotSlot.slots.length);

    const lineMessages: mod.Message[] = [];
    lineMessages.push(MakeMessage(mod.stringkeys.bot_debug_header));
    lineMessages.push(MakeMessage(mod.stringkeys.bot_debug_summary_desired, BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS, maxSupportedBots));
    lineMessages.push(MakeMessage(mod.stringkeys.bot_debug_summary_alive_pending, InfectedBotSlot.GetAliveCount(), InfectedBotSlot.pendingBySpawnerID.size));

    for (const slot of InfectedBotSlot.slots) {
        const targetObjId = slot.tick.target ? mod.GetObjId(slot.tick.target) : -1;
        const slotAlive = slot.state === BotSlotState.Alive
            && !!slot.player
            && PlayerIsAliveAndValid(slot.player);
        if (slotAlive && targetObjId === viewerObjId) {
            botsTargetingViewer++;
        }

        lineMessages.push(MakeMessage(mod.stringkeys.bot_debug_slot_spawner, slot.slotIndex, slot.assignedSpawnerID));

        const stateLineKey = GetBotDebugSlotStateLineKey(slot.state);
        lineMessages.push(MakeMessage((mod.stringkeys as Record<string, string>)[stateLineKey] ?? stateLineKey, slotAlive ? 1 : 0));

        const behaviorLineKey = GetBotDebugBehaviorLineKey(slot.tick.behavior);
        lineMessages.push(MakeMessage((mod.stringkeys as Record<string, string>)[behaviorLineKey] ?? behaviorLineKey, targetObjId));
    }

    lineMessages.splice(3, 0, MakeMessage(mod.stringkeys.bot_debug_summary_targeting_you, botsTargetingViewer));

    for (let i = 0; i < widgetSet.lines.length; i++) {
        const lineWidget = widgetSet.lines[i];
        const message = i < lineMessages.length ? lineMessages[i] : MakeMessage(mod.stringkeys.loadout_blank);
        mod.SetUITextLabel(lineWidget, message);
        mod.SetUIWidgetVisible(lineWidget, i < lineMessages.length);
    }

    mod.SetUIWidgetVisible(widgetSet.root, true);
}

function CleanupBotTargetWorldIcon(botObjId: number, context: string) {
    CleanupWorldIcon(BOT_TARGET_WORLD_ICON_OBJECTS, botObjId, context);
}

function UpdateBotTargetWorldIcon(slot: InfectedBotSlot) {
    if (!BOT_SURVIVAL_TEST_MODE || !BOT_SURVIVAL_TEST_ICONS) return;
    const bot = slot.player;
    const botObjId = slot.playerObjID;
    if (!bot || botObjId === undefined || botObjId < 0 || !PlayerIsAliveAndValid(bot)) {
        if (botObjId !== undefined && botObjId >= 0) {
            CleanupBotTargetWorldIcon(botObjId, 'UpdateBotTargetWorldIcon.invalid_bot');
        }
        return;
    }

    const botPos = GetIconPosition(bot, 1.8);
    let icon = BOT_TARGET_WORLD_ICON_OBJECTS.get(botObjId);
    if (!icon) {
        icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, botPos, ZERO_VEC);
        mod.SetWorldIconOwner(icon, SURVIVOR_TEAM);
        mod.SetWorldIconImage(icon, mod.WorldIconImages.Alert);
        mod.SetWorldIconColor(icon, UI.battlefieldWhite);
        mod.EnableWorldIconImage(icon, true);
        BOT_TARGET_WORLD_ICON_OBJECTS.set(botObjId, icon);
    }
    const statusText = slot.tick.behavior ?? 'unknown';
    mod.SetWorldIconPosition(icon, botPos);
    mod.SetWorldIconText(icon, MakeMessage(statusText));
    mod.EnableWorldIconText(icon, true);
    mod.EnableWorldIconImage(icon, true);
}

function UnspotLastManStandingTargetByObjId(playerObjId: number, _context: string): void {
    if (!LMS_SPOTTED_TARGET_DURATION_SECONDS.has(playerObjId)) return;

    const trackedPlayer = PlayerProfile._allPlayers.get(playerObjId)?.player;
    if (trackedPlayer && Helpers.HasValidObjId(trackedPlayer)) {
        try { mod.SpotTarget(trackedPlayer, mod.SpotStatus.Unspot); } catch { }
    }

    LMS_SPOTTED_TARGET_DURATION_SECONDS.delete(playerObjId);
}

function EnsureLastManStandingSpotted(player: mod.Player) {
    const lmsPlayerObjId = mod.GetObjId(player);
    if (lmsPlayerObjId < 0) return;

    const playerProfile = PlayerProfile.Get(player);
    const shouldSpot = !!playerProfile
        && playerProfile.isLastManStanding
        && GameHandler.gameState === GameState.GameRoundIsRunning
        && SafeIsAlive(player)
        && mod.GetObjId(mod.GetTeam(player)) === mod.GetObjId(SURVIVOR_TEAM);

    if (!shouldSpot) {
        UnspotLastManStandingTargetByObjId(lmsPlayerObjId, 'EnsureLastManStandingSpotted');
        return;
    }

    const remainingRoundSeconds = Math.max(1, Math.ceil(GameHandler.roundTimeRemaining));
    const lastAppliedDuration = LMS_SPOTTED_TARGET_DURATION_SECONDS.get(lmsPlayerObjId);
    if (lastAppliedDuration === remainingRoundSeconds) return;

    try {
        mod.SpotTarget(player, remainingRoundSeconds, mod.SpotStatus.SpotInBoth);
        LMS_SPOTTED_TARGET_DURATION_SECONDS.set(lmsPlayerObjId, remainingRoundSeconds);
    } catch { }
}

function UpdatePlayerIndicatorsAndIcons(player: mod.Player) {
    const playerObjId = mod.GetObjId(player);
    if (playerObjId < 0) return;

    EnsureLastManStandingSpotted(player);
    ShowAlphaInfectedIndicator(player);

    const infectedIcon = INFECTED_WORLD_ICON_OBJECTS.get(playerObjId);
    if (infectedIcon) {
        mod.SetWorldIconPosition(infectedIcon, GetIconPosition(player));
    }

}

function CleanupPlayerOngoingVisuals(playerObjId: number) {
    CleanupWorldIcon(INFECTED_WORLD_ICON_OBJECTS, playerObjId, 'CleanupPlayerOngoingVisuals');
    UnspotLastManStandingTargetByObjId(playerObjId, 'CleanupPlayerOngoingVisuals');
    CleanupBotTargetWorldIcon(playerObjId, 'CleanupPlayerOngoingVisuals');
    CleanupBotSurvivalDebugWidget(playerObjId);
    const playerProfile = PlayerProfile._allPlayers.get(playerObjId);
    playerProfile?.DeletePlayerAreaNotificationWidget();
    playerProfile?.DeleteLastManStandingBuffWidgets();
    const moveVfxToken = ALPHA_VFX_INDICATOR_TOKENS.get(playerObjId);
    if (moveVfxToken) {
        moveVfxToken.cancel = true;
        ALPHA_VFX_INDICATOR_TOKENS.delete(playerObjId);
    }
    PLAYER_ONGOING_TICK_STATE.delete(playerObjId);
}


function CheckForBannedWeapons(player: mod.Player) {
    if (!PlayerIsAliveAndValid(player)) {
        return false;
    }

    const playerProfile = PlayerProfile.Get(player);
    if (!playerProfile) {
        return false;
    }

    if (GameHandler.gameState !== GameState.GameRoundIsRunning || GameHandler.suspendWinChecks) {
        return false;
    }

    const whitelistEntries = Weapons.GetRoundLoadout(playerProfile)
        ?.map(item => {
            if (item.weapon !== undefined) {
                return { kind: 'weapon' as const, value: item.weapon };
            }
            if (item.gadget !== undefined) {
                return { kind: 'gadget' as const, value: item.gadget };
            }
            return undefined;
        })
        .filter((entry): entry is { kind: 'weapon', value: mod.Weapons } | { kind: 'gadget', value: mod.Gadgets } => entry !== undefined) ?? [];

    const whitelistSet = new Set<string>(
        whitelistEntries.map(entry => entry.kind === 'weapon' ? WeaponToken(entry.value) : GadgetToken(entry.value))
    );

    const isInfected = playerProfile.isInfectedTeam || (mod.GetObjId(mod.GetTeam(player)) === mod.GetObjId(INFECTED_TEAM));
    if (!isInfected) {
        // Survivors are granted this melee at spawn; allow it so banned checks do not strip it.
        whitelistSet.add(GadgetToken(mod.Gadgets.Melee_Combat_Knife));
    }

    if (!whitelistSet.size) {
        return false;
    }

    const disallowedWeapons = ALL_WEAPON_IDS
        .filter(weapon => mod.HasEquipment(player, weapon) && !whitelistSet.has(WeaponToken(weapon)));
    const disallowedGadgets = ALL_GADGET_IDS
        .filter(gadget => mod.HasEquipment(player, gadget) && !whitelistSet.has(GadgetToken(gadget)));

    const hasDisallowed = disallowedWeapons.length > 0 || disallowedGadgets.length > 0;

    if (!hasDisallowed) {
        return false;
    }
    RefreshHumanEquipment(player, playerProfile);
    Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, player);
    if (isInfected && !GameHandler.suspendWinChecks) {
        const bannedWeaponMessage = MakeMessage(mod.stringkeys.banned_weapon_removed, player);
        Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1);
        mod.ForceSwitchInventory(player, mod.InventorySlots.MeleeWeapon);
        for (let player of PlayerProfile._allPlayerProfiles) {
            player.ShowAlphaFeedback(bannedWeaponMessage); // shame message to all players
        }
    }
    return true;
}

function ApplyBotSurvivalTestLMSForSurvivor(player: mod.Player): void {
    if (!BOT_SURVIVAL_TEST_MODE) return;
    if (!Helpers.HasValidObjId(player)) return;
    if (SafeIsAISoldier(player)) return;

    const playerProfile = PlayerProfile.Get(player);
    if (!playerProfile) return;

    playerProfile.isInfectedTeam = false;
    playerProfile.isAlphaInfected = false;
    playerProfile.isLastManStanding = true;
    playerProfile.isFinalFive = false;

    if (mod.GetObjId(mod.GetTeam(player)) !== mod.GetObjId(SURVIVOR_TEAM)) {
        mod.SetTeam(player, SURVIVOR_TEAM);
    }

    if (!PlayerIsAliveAndValid(player)) return;

    RefreshHumanEquipment(player, playerProfile);
    playerProfile.loadoutDisplayBottom?.Show();
    playerProfile.UpdateLastManStandingBuffWidgets();
    ShowLastManStandingIcon(player);
    StartLastManStandingReloadLoop(playerProfile);
}

const BotSurvivalTestHarness = {
    rampLoopRunning: false,
    rampLoopGeneration: 0,
    restartInProgress: false,
    restartCooldownUntil: 0,

    forceHumansToSurvivorTeam() {
        const allPlayers = mod.AllPlayers();
        const pcount = mod.CountOf(allPlayers);
        for (let i = 0; i < pcount; i++) {
            const player = mod.ValueInArray(allPlayers, i) as mod.Player;
            if (!Helpers.HasValidObjId(player)) continue;
            if (SafeIsAISoldier(player)) continue;

            ApplyBotSurvivalTestLMSForSurvivor(player);

            try { mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, false); } catch { }
            try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveForwardBack, false); } catch { }
            try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveLeftRight, false); } catch { }
            try { mod.EnableInputRestriction(player, mod.RestrictedInputs.Jump, false); } catch { }
        }
    },

    clearExistingAIBots() {
        const allPlayers = mod.AllPlayers();
        const pcount = mod.CountOf(allPlayers);
        for (let i = 0; i < pcount; i++) {
            const player = mod.ValueInArray(allPlayers, i) as mod.Player;
            if (!Helpers.HasValidObjId(player)) continue;
            if (!SafeIsAISoldier(player)) continue;
            if (!PlayerIsAliveAndValid(player)) continue;
            mod.Kill(player);
        }
    },

    applyDesiredInfectedBotCount() {
        const maxSupportedBots = Math.min(BOT_SURVIVAL_TEST_MAX_INFECTED_BOTS, InfectedBotSlot.slots.length);
        BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS = Math.max(
            0,
            Math.min(BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS, maxSupportedBots)
        );
        GameHandler.infectedCount = BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS;

        const activeOrPending = InfectedBotSlot.slots.filter(slot => slot.state !== BotSlotState.Idle).length;
        if (activeOrPending >= BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS) {
            return;
        }

        let toSpawn = BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS - activeOrPending;
        for (const slot of InfectedBotSlot.slots) {
            if (toSpawn <= 0) break;
            if (slot.state !== BotSlotState.Idle) continue;
            slot.isAlpha = false;
            slot.Respawn();
            toSpawn--;
        }
    },

    async runRampLoop() {
        if (this.rampLoopRunning) return;
        this.rampLoopRunning = true;
        const generation = ++this.rampLoopGeneration;

        const maxSupportedBots = Math.min(BOT_SURVIVAL_TEST_MAX_INFECTED_BOTS, InfectedBotSlot.slots.length);
        if (maxSupportedBots <= 0) {
            console.log('[BotSurvivalTest] No infected bot slots available for test mode.');
            this.rampLoopRunning = false;
            return;
        }
        if (maxSupportedBots < BOT_SURVIVAL_TEST_MAX_INFECTED_BOTS) {
            console.log(`[BotSurvivalTest] Limited to ${maxSupportedBots} infected bot slots by current spawner pool.`);
        }

        if (BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS <= 0) {
            BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS = 1;
            console.log(`[BotSurvivalTest] Desired infected bots -> ${BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS}/${maxSupportedBots}`);
        }
        this.applyDesiredInfectedBotCount();

        while (BOT_SURVIVAL_TEST_MODE && GameHandler.gameState === GameState.GameRoundIsRunning) {
            if (generation !== this.rampLoopGeneration) break;
            await mod.Wait(BOT_SURVIVAL_TEST_SPAWN_INTERVAL_SECONDS);
            if (generation !== this.rampLoopGeneration) break;

            if (BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS < maxSupportedBots) {
                BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS++;
                console.log(`[BotSurvivalTest] Desired infected bots -> ${BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS}/${maxSupportedBots}`);
            }

            this.applyDesiredInfectedBotCount();
        }

        this.rampLoopRunning = false;
    },

    async requestRestart(reason: string) {
        if (!BOT_SURVIVAL_TEST_MODE) return;
        const now = Date.now() / 1000;
        if (this.restartInProgress || now < this.restartCooldownUntil) {
            return;
        }
        this.restartCooldownUntil = now + 0.75;
        this.restartInProgress = true;

        console.log(`[BotSurvivalTest] Restart requested: ${reason}`);

        try {
            this.rampLoopGeneration++;
            this.rampLoopRunning = false;
            BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS = 0;
            GameHandler.infectedCount = 0;

            this.clearExistingAIBots();
            InfectedBotSlot.ResetAll();
            SurvivorBotSlot.ResetAll();
            AISpawnHandler.spawnerLock.clear();

            for (const botObjId of Array.from(BOT_TARGET_WORLD_ICON_OBJECTS.keys())) {
                CleanupBotTargetWorldIcon(botObjId, 'BotSurvivalTestHarness.requestRestart');
            }

            this.applyDesiredInfectedBotCount();
            QueueBotSurvivalTestVehicleSpawn('restart', 0.2);
            await mod.Wait(0.2);
            this.runRampLoop();
        } finally {
            this.restartInProgress = false;
        }
    },

    async start() {
        console.log('[BotSurvivalTest] === BOT SURVIVAL TEST MODE ACTIVE ===');

        this.clearExistingAIBots();
        InfectedBotSlot.InitSlots();
        InfectedBotSlot.ResetAll();
        SurvivorBotSlot.InitSlots();
        SurvivorBotSlot.ResetAll();
        AISpawnHandler.spawnerLock.clear();

        for (const botObjId of Array.from(BOT_TARGET_WORLD_ICON_OBJECTS.keys())) {
            CleanupBotTargetWorldIcon(botObjId, 'BotSurvivalTestHarness.start');
        }

        GameHandler.gameState = GameState.GameRoundIsRunning;
        GameHandler.suspendWinChecks = true;
        GameHandler.currentRound = 1;
        GameHandler.roundTimeRemaining = ROUND_DURATION;
        GameHandler.countdownTimeRemaining = GAME_COUNTDOWN_TIME;
        GameHandler.infectedCount = 0;
        GameHandler.aliveInfectedCount = 0;
        GameHandler.endOfRoundCondition = '0 survivors';
        GameHandler.survivorsNextRound = 0;
        GameHandler.infectedNextRound = 0;
        GameHandler.shouldShowLoadoutSelection = false;
        GameHandler.skipAlphaSelection = true;
        GameHandler.preserveAlpha = true;
        BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS = 0;
        BOT_SURVIVAL_TEST_VEHICLE_SPAWN_REQUEST_ID++;

        try {
            gameStateMessageToast.close();
            survivorCountNotificationToast.close();
            GameCountdown.GlobalClose();
            LoadoutSelectionMenu.GlobalClose(false);
        } catch { }

        this.forceHumansToSurvivorTeam();
        GameHandler.RebuildPlayerLists();
        GameHandler.RecalculateCounts();
        const map = WaitForCurrentMapGate(!SKIP_SESSION_START);
        mod.EnableAllPlayerDeploy(true);
        AISpawnHandler.OnGoingSpawnerCheck();
        QueueBotSurvivalTestVehicleSpawn('start', 0.25);
        this.runRampLoop();
    }
};

// ============================================================
// LEAP TEST HARNESS  (active only when LEAP_TEST_MODE = true)
// ============================================================

/** Spawner IDs used as position anchors inside the test harness. */
const LEAP_TEST_SPAWNER_IDS = [22, 23, 24, 25, 26, 27, 28];
const LEAP_TEST_DEBUG_VEHICLE_SPAWNER_ID = 999;

/** Interact-point IDs reserved for the test harness. */
const LEAP_TEST_INTERACT_SPAWN = 997;   // "Spawn Scenario"
const LEAP_TEST_CHANGE_TEAM = 1115; // "Fixed Camera"
const LEAP_TEST_INTERACT_CLEANUP = 402; // "Cleanup"

/** WorldIcon IDs placed in the level adjacent to each debug interact point. */
const LEAP_TEST_WORLDICON_SPAWN = 901;
const LEAP_TEST_WORLDICON_CAMERA = 902;
const LEAP_TEST_WORLDICON_CLEANUP = 903;

/** Seconds to pause between a scenario's cleanup and the next automated respawn. */
const LEAP_TEST_LOOP_RESPAWN_DELAY = 2.0;

/** Safety watchdog: force cleanup/respawn if a scenario runs longer than this (bot stuck, etc). */
const LEAP_TEST_LOOP_MAX_DURATION = 30.0;

/** Poll interval while waiting for the current scenario to resolve. */
const LEAP_TEST_LOOP_POLL_DELAY = 0.5;

/** Vertical offset (meters) used when teleporting the survivor bot to the vehicle, so it
 *  lands clear of the vehicle's collision mesh instead of clipping into it. */
const LEAP_TEST_SURVIVOR_TELEPORT_HEIGHT = 2.5;

/** Max time to wait for the infected AI to actually come up (spawn is async) before
 *  treating the attempt as failed and retrying, rather than tearing down mid-spawn. */
const LEAP_TEST_LOOP_SETTLE_TIMEOUT = 5.0;

function ShouldTrackVehicleDistanceWorldIcon(): boolean {
    return LEAP_TEST_MODE || (BOT_SURVIVAL_TEST_MODE && BOT_SURVIVAL_TEST_ICONS);
}

const LeapTestHarness = {
    /** Positions resolved from the infected spawner grid. */
    gridPositions: [] as mod.Vector[],
    /** Currently spawned test vehicle. */
    activeVehicle: undefined as mod.Vehicle | undefined,
    /** Survivor AI sitting in the vehicle. */
    survivorBot: undefined as mod.Player | undefined,
    /** Infected AI used for automated leap testing. */
    infectedBot: undefined as mod.Player | undefined,
    /** Spawner handles for reuse. */
    survivorSpawner: undefined as mod.Spawner | undefined,
    infectedSpawner: undefined as mod.Spawner | undefined,
    /** Track which grid slot to use next for the vehicle. */
    nextGridIndex: 0,
    /** Token used to cancel stale async vehicle-distance update loops. */
    distanceLoopToken: 0,
    /** ObjID for the human currently tracked by the distance loop. */
    trackedHumanObjId: -1,
    /** Player-owned world icon showing nearest vehicle distance. */
    vehicleDistanceIcon: undefined as mod.WorldIcon | undefined,
    /** Token used to cancel/restart the self-driving scenario loop. */
    loopToken: 0,

    /** Resolve spawner positions once at startup. */
    resolveGrid() {
        this.gridPositions = [];
        for (const id of LEAP_TEST_SPAWNER_IDS) {
            const spawner = mod.GetSpawner(id);
            this.gridPositions.push(mod.GetObjectPosition(spawner));
        }
        console.log(`[LeapTest] Resolved ${this.gridPositions.length} grid positions from spawners ${LEAP_TEST_SPAWNER_IDS.join(',')}`);
    },

    clearVehicleDistanceIcon() {
        if (!this.vehicleDistanceIcon) return;
        try { mod.UnspawnObject(this.vehicleDistanceIcon); } catch { }
        this.vehicleDistanceIcon = undefined;
    },

    stopVehicleDistanceTracking() {
        this.distanceLoopToken++;
        this.trackedHumanObjId = -1;
        this.clearVehicleDistanceIcon();
    },

    startVehicleDistanceTracking(player: mod.Player) {
        if (!ShouldTrackVehicleDistanceWorldIcon()) return;

        const playerObjId = mod.GetObjId(player);
        if (playerObjId < 0) return;

        this.stopVehicleDistanceTracking();
        this.trackedHumanObjId = playerObjId;
        const loopToken = ++this.distanceLoopToken;

        (async () => {
            while (ShouldTrackVehicleDistanceWorldIcon() && loopToken === this.distanceLoopToken) {
                if (!Helpers.HasValidObjId(player)
                    || mod.GetObjId(player) !== this.trackedHumanObjId
                    || !IsPlayerDeployed(player)) {
                    break;
                }

                const playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
                const vehicles = ConvertArray(mod.AllVehicles()) as mod.Vehicle[];

                let nearestPos: mod.Vector | undefined;
                let nearestDistance = Number.MAX_VALUE;
                for (const vehicle of vehicles) {
                    const vehiclePos = mod.GetVehicleState(vehicle, mod.VehicleStateVector.VehiclePosition);
                    const distance = mod.DistanceBetween(playerPos, vehiclePos);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestPos = vehiclePos;
                    }
                }

                if (nearestPos) {
                    if (!this.vehicleDistanceIcon) {
                        const iconObj = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, nearestPos, ZERO_VEC);
                        const icon = iconObj as mod.WorldIcon;
                        mod.SetWorldIconOwner(icon, player);
                        mod.SetWorldIconImage(icon, mod.WorldIconImages.Alert);
                        mod.SetWorldIconColor(icon, mod.CreateVector(0.7, 1.0, 0.9));
                        mod.EnableWorldIconImage(icon, true);
                        mod.EnableWorldIconText(icon, true);
                        this.vehicleDistanceIcon = icon;
                    } else {
                        mod.SetWorldIconPosition(this.vehicleDistanceIcon, nearestPos);
                    }

                    const centiMeters = Math.max(0, Math.round(nearestDistance * 100));
                    const wholeMeters = Math.floor(centiMeters / 100);
                    const fractionalTens = Math.floor((centiMeters % 100) / 10);
                    const fractionalOnes = centiMeters % 10;
                    mod.SetWorldIconText(
                        this.vehicleDistanceIcon,
                        MakeMessage(
                            mod.stringkeys.leap_test_vehicle_distance,
                            wholeMeters,
                            fractionalTens,
                            fractionalOnes
                        )
                    );
                } else {
                    this.clearVehicleDistanceIcon();
                }

                await mod.Wait(LEAP_PREVIEW_TRACK_REST_DELAY);
            }

            if (loopToken === this.distanceLoopToken) {
                this.stopVehicleDistanceTracking();
            }
        })();
    },

    onHumanUndeployed(playerObjId: number) {
        if (this.trackedHumanObjId !== playerObjId) return;
        this.stopVehicleDistanceTracking();
    },

    /** Clean up any previously spawned test objects. */
    cleanup() {
        this.stopVehicleDistanceTracking();
        if (this.survivorBot) {
            try { mod.Kill(this.survivorBot); } catch { }
            this.survivorBot = undefined;
        }
        if (this.infectedBot) {
            try { mod.Kill(this.infectedBot); } catch { }
            this.infectedBot = undefined;
        }
        // Vehicle is engine-managed via the spawner; destroying the AI inside is enough.
        this.activeVehicle = undefined;
        SPAWNED_ACTIVE_VEHICLE = undefined;
        console.log('[LeapTest] Cleanup complete');
    },

    /** Spawn a vehicle + survivor-in-vehicle + infected attacker scenario. */
    async spawnScenario() {
        this.cleanup();

        // Pick a grid position for the vehicle spawner (cycles through the row).
        const gridPos = this.gridPositions[this.nextGridIndex % this.gridPositions.length];
        this.nextGridIndex++;

        // --- Vehicle at debug vehicle spawner ---
        const vehicleSpawner = mod.GetVehicleSpawner(LEAP_TEST_DEBUG_VEHICLE_SPAWNER_ID);
        mod.SetVehicleSpawnerVehicleType(vehicleSpawner, mod.VehicleList.Vector);
        mod.ForceVehicleSpawnerSpawn(vehicleSpawner);
        console.log(`[LeapTest] Force-spawn requested on spawner ${LEAP_TEST_DEBUG_VEHICLE_SPAWNER_ID}`);

        // OnVehicleSpawned will set SPAWNED_ACTIVE_VEHICLE; poll for it rather than a single
        // fixed wait so a slightly slow spawn doesn't get misreported as a failure.
        const VEHICLE_SPAWN_POLL_DELAY = 0.5;
        const VEHICLE_SPAWN_TIMEOUT = 3.0;
        let waited = 0;
        while (!SPAWNED_ACTIVE_VEHICLE && waited < VEHICLE_SPAWN_TIMEOUT) {
            await mod.Wait(VEHICLE_SPAWN_POLL_DELAY);
            waited += VEHICLE_SPAWN_POLL_DELAY;
        }
        this.activeVehicle = SPAWNED_ACTIVE_VEHICLE;
        if (this.activeVehicle) {
            console.log(`[LeapTest] Vehicle spawned after ${waited.toFixed(1)}s | objId=${mod.GetObjId(this.activeVehicle)}`);
        } else {
            console.log(`[LeapTest] WARNING: No OnVehicleSpawned callback within ${VEHICLE_SPAWN_TIMEOUT}s -- verify spawner ${LEAP_TEST_DEBUG_VEHICLE_SPAWNER_ID} is wired up and reachable in the level`);
        }

        // --- Survivor bot (will ride the vehicle) ---
        // Use the first survivor spawner closest to the vehicle position.
        const survSpawnerID = SURVIVOR_AI_SPAWNERS[0];
        this.survivorSpawner = mod.GetSpawner(survSpawnerID);
        mod.SpawnAIFromAISpawner(
            this.survivorSpawner,
            mod.SoldierClass.Assault,
            MakeMessage(mod.stringkeys.leap_status_idle), // dummy name
            SURVIVOR_TEAM
        );
        console.log('[LeapTest] Survivor bot spawn requested');

        // --- Infected bot (attacker) ---
        // Use the first infected spawner.
        const infSpawnerID = INFECTED_AI_SPAWNERS[0];
        this.infectedSpawner = mod.GetSpawner(infSpawnerID);
        mod.SpawnAIFromAISpawner(
            this.infectedSpawner,
            mod.SoldierClass.Recon,
            MakeMessage(mod.stringkeys.leap_status_charging), // dummy name
            INFECTED_TEAM
        );
        console.log('[LeapTest] Infected bot spawn requested');
    },

    /** Self-driving scenario cycle: spawn -> wait for resolution -> cleanup -> repeat.
     *  Runs forever with no human interaction required; restartLoop() bumps the token to
     *  cancel any in-flight wait and start a fresh cycle immediately (e.g. manual interact). */
    async runLoop() {
        const token = ++this.loopToken;
        while (token === this.loopToken) {
            console.log('[LeapTest] Loop: spawning new scenario');
            await this.spawnScenario();
            if (token !== this.loopToken) break;

            // spawnScenario only *requests* the bots -- they arrive asynchronously via
            // OnSpawnerSpawned -> onBotSpawned (itself gated behind a 0.5s delay), so
            // this.infectedBot isn't populated yet the instant spawnScenario returns.
            // Give it a settle window before we start watching for "resolved" below --
            // otherwise the very first liveness check sees no infected bot yet, reads
            // that as "scenario over", and tears everything down (killing the survivor
            // bot / clearing activeVehicle) while onBotSpawned is still mid-seat-attempt.
            let settleElapsed = 0;
            while (token === this.loopToken
                && settleElapsed < LEAP_TEST_LOOP_SETTLE_TIMEOUT
                && !(this.infectedBot && PlayerIsAliveAndValid(this.infectedBot))) {
                await mod.Wait(LEAP_TEST_LOOP_POLL_DELAY);
                settleElapsed += LEAP_TEST_LOOP_POLL_DELAY;
            }
            if (token !== this.loopToken) break;
            if (!(this.infectedBot && PlayerIsAliveAndValid(this.infectedBot))) {
                console.log('[LeapTest] Loop: infected bot never came up, cleaning up and retrying');
                this.cleanup();
                await mod.Wait(LEAP_TEST_LOOP_RESPAWN_DELAY);
                continue;
            }

            // Wait for the scenario to resolve. The infected AI kills itself once its chase
            // loop ends (driver dead, vehicle gone, or the bot itself died) -- see
            // InitLeapSystem's AI branch -- so tracking its liveness plus the vehicle's
            // validity covers every natural end state. A watchdog forces cleanup if the
            // bot ever gets stuck and neither condition trips.
            let elapsed = 0;
            while (token === this.loopToken) {
                const infectedAlive = !!this.infectedBot && PlayerIsAliveAndValid(this.infectedBot);
                const vehicleAlive = IsVehicleRefValid(this.activeVehicle);
                if (!infectedAlive || !vehicleAlive) break;
                if (elapsed >= LEAP_TEST_LOOP_MAX_DURATION) {
                    console.log('[LeapTest] Loop: watchdog timeout, forcing cleanup');
                    break;
                }
                await mod.Wait(LEAP_TEST_LOOP_POLL_DELAY);
                elapsed += LEAP_TEST_LOOP_POLL_DELAY;
            }
            if (token !== this.loopToken) break;

            console.log('[LeapTest] Loop: scenario resolved, cleaning up');
            this.cleanup();
            await mod.Wait(LEAP_TEST_LOOP_RESPAWN_DELAY);
        }
    },

    /** Cancels any running/waiting loop cycle and starts a fresh one immediately. */
    restartLoop() {
        this.cleanup();
        this.runLoop();
    },

    /** Called from OnSpawnerSpawned when LEAP_TEST_MODE is active. */
    async onBotSpawned(player: mod.Player, spawnerObjId: number) {
        await mod.Wait(0.5);

        const isSurvivorSpawner = SURVIVOR_AI_SPAWNERS.includes(spawnerObjId);

        if (isSurvivorSpawner) {
            this.survivorBot = player;
            mod.SetPlayerMaxHealth(player, 50);
            mod.AIIdleBehavior(player);
            if (this.activeVehicle) {
                const vehiclePos = mod.GetVehicleState(this.activeVehicle, mod.VehicleStateVector.VehiclePosition);
                const teleportPos = mod.Add(vehiclePos, mod.CreateVector(0, LEAP_TEST_SURVIVOR_TELEPORT_HEIGHT, 0));
                mod.Teleport(player, teleportPos, 0);
                await mod.Wait(0.2);

                let seated = false;
                for (let attempt = 0; attempt < 8; attempt++) {
                    mod.ForcePlayerToSeat(player, this.activeVehicle, 0);
                    await mod.Wait(0.15);
                    if (mod.GetSoldierState(player, mod.SoldierStateBool.IsInVehicle)) {
                        seated = true;
                        break;
                    }
                }

                if (seated) {
                    console.log('[LeapTest] Survivor bot teleported to and seated in vehicle');
                } else {
                    console.log('[LeapTest] WARNING: Teleport-seat failed, falling back to move order');
                    mod.AIMoveToBehavior(player, vehiclePos);
                    await mod.Wait(0.75);

                    for (let attempt = 0; attempt < 8; attempt++) {
                        mod.ForcePlayerToSeat(player, this.activeVehicle, 0);
                        await mod.Wait(0.15);
                        if (mod.GetSoldierState(player, mod.SoldierStateBool.IsInVehicle)) {
                            seated = true;
                            break;
                        }
                    }

                    if (seated) {
                        console.log('[LeapTest] Survivor bot moved to and seated in vehicle (fallback)');
                    } else {
                        console.log('[LeapTest] WARNING: Survivor bot could not be seated in vehicle');
                    }
                }
            } else {
                console.log('[LeapTest] WARNING: No active vehicle to seat survivor bot');
            }
        } else {
            this.infectedBot = player;
            mod.SetPlayerMaxHealth(player, 300);
            mod.AIIdleBehavior(player);
            mod.ForceSwitchInventory(player, mod.InventorySlots.MeleeWeapon);

            // Init the leap system on this bot so it can leap
            InitLeapSystem(player, this.activeVehicle);
            console.log('[LeapTest] Infected bot ready with leap system');
        }
    },

    /** Handle interact events for the test harness. */
    onInteract(eventPlayer: mod.Player, eventObject: mod.Object) {
        const objId = mod.GetObjId(eventObject);
        if (objId === LEAP_TEST_INTERACT_SPAWN) {
            console.log('[LeapTest] Interact: Force respawn scenario (manual override -- loop resumes automatically)');
            this.restartLoop();
        } else if (objId === LEAP_TEST_CHANGE_TEAM) {
            let teamToSwitchTo: mod.Team;
            if (mod.GetObjId(mod.GetTeam(eventPlayer)) === mod.GetObjId(SURVIVOR_TEAM)) {
                teamToSwitchTo = INFECTED_TEAM;
            } else {
                teamToSwitchTo = SURVIVOR_TEAM;
            }
            // mod.Kill(eventPlayer);
            mod.SetTeam(eventPlayer, teamToSwitchTo);
        } else if (objId === LEAP_TEST_INTERACT_CLEANUP) {
            console.log('[LeapTest] Interact: Cleanup (loop will respawn automatically)');
            this.restartLoop();
        }
    },

    /** Main entry -- replaces OnGameModeStarted flow when LEAP_TEST_MODE. */
    async start(eventPlayer?: mod.Player) {
        console.log('[LeapTest] === LEAP TEST MODE ACTIVE ===');

        // OnGameModeStarted can fire before the level's spatial objects (spawners, HQs)
        // are actually registered with the engine -- BOT_SURVIVAL_TEST_MODE waits on this
        // same gate before touching vehicle spawners for that reason. Without it, the very
        // first ForceVehicleSpawnerSpawn call can silently no-op (no OnVehicleSpawned ever
        // fires) because the spawner reference isn't live yet.
        await WaitForCurrentMapGate(false);

        this.resolveGrid();

        // Enable interact points for spawn/cleanup controls.
        try {
            mod.EnableInteractPoint(mod.GetInteractPoint(LEAP_TEST_INTERACT_SPAWN), true);
            mod.EnableInteractPoint(mod.GetInteractPoint(LEAP_TEST_CHANGE_TEAM), true);
            mod.EnableInteractPoint(mod.GetInteractPoint(LEAP_TEST_INTERACT_CLEANUP), true);
        } catch {
            console.log('[LeapTest] WARNING: Could not enable test interact points -- verify IDs 997, 1115 & 402 exist in the level');
        }

        // Attach world-icon labels to each debug interact point.
        try {
            const wiSpawn = mod.GetWorldIcon(LEAP_TEST_WORLDICON_SPAWN);
            mod.SetWorldIconOwner(wiSpawn, INFECTED_TEAM);
            mod.SetWorldIconImage(wiSpawn, mod.WorldIconImages.Alert);
            mod.EnableWorldIconImage(wiSpawn, true);
            mod.SetWorldIconText(wiSpawn, MakeMessage(mod.stringkeys.dbg_spawn_scenario));
            mod.EnableWorldIconText(wiSpawn, true);

            const wiCamera = mod.GetWorldIcon(LEAP_TEST_WORLDICON_CAMERA);
            mod.SetWorldIconOwner(wiCamera, INFECTED_TEAM);
            mod.SetWorldIconImage(wiCamera, mod.WorldIconImages.Alert);
            mod.EnableWorldIconImage(wiCamera, true);
            mod.SetWorldIconText(wiCamera, MakeMessage(mod.stringkeys.dbg_camera_fixed));
            mod.EnableWorldIconText(wiCamera, true);

            const wiCleanup = mod.GetWorldIcon(LEAP_TEST_WORLDICON_CLEANUP);
            mod.SetWorldIconOwner(wiCleanup, INFECTED_TEAM);
            mod.SetWorldIconImage(wiCleanup, mod.WorldIconImages.Alert);
            mod.EnableWorldIconImage(wiCleanup, true);
            mod.SetWorldIconText(wiCleanup, MakeMessage(mod.stringkeys.dbg_cleanup));
            mod.EnableWorldIconText(wiCleanup, true);
        } catch {
            console.log('[LeapTest] WARNING: Could not configure test world icons -- verify IDs 901, 902 & 903 exist in the level');
        }

        // No human interaction required: the scenario loop self-drives (spawn -> resolve ->
        // cleanup -> respawn) as soon as the game mode loads. Fire-and-forget so we don't
        // block OnGameModeStarted -- the interact points above remain as manual overrides.
        console.log('[LeapTest] Starting automated scenario loop...');
        this.runLoop();
    },

    /** Called when the human deploys in test mode. */
    onHumanDeployed(player: mod.Player) {
        // Put the human on the infected team and init leap
        const playerObjId = mod.GetObjId(player);
        LogLeapRuntime(`test_deploy_begin_${playerObjId}`, `LeapTest onHumanDeployed begin | player=${playerObjId}`, 0.1);
        try {
            mod.SetTeam(player, INFECTED_TEAM);
            LogLeapRuntime(`test_deploy_team_${playerObjId}`, `LeapTest SetTeam using INFECTED_TEAM succeeded | player=${playerObjId}`, 0.1);
        } catch (e) {
            LogLeapRuntime(`test_deploy_team_fail_${playerObjId}`, `LeapTest SetTeam(INFECTED_TEAM) failed | player=${playerObjId} err=${e}`, 0.1);
            try {
                mod.SetTeam(player, mod.GetTeam(2));
                LogLeapRuntime(`test_deploy_team_fallback_${playerObjId}`, `LeapTest SetTeam(GetTeam(2)) fallback succeeded | player=${playerObjId}`, 0.1);
            } catch (e2) {
                LogLeapRuntime(`test_deploy_team_fallback_fail_${playerObjId}`, `LeapTest SetTeam(GetTeam(2)) fallback failed | player=${playerObjId} err=${e2}`, 0.1);
            }
        }
        const playerProfile = PlayerProfile.Get(player);
        if (playerProfile) {
            playerProfile.isInfectedTeam = true;
            playerProfile.isAlphaInfected = true;
            LogLeapRuntime(`test_deploy_profile_${playerObjId}`, `LeapTest profile flags set | player=${playerObjId} infected=${playerProfile.isInfectedTeam} alpha=${playerProfile.isAlphaInfected}`, 0.1);
        }
        try { mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, false); } catch { }
        try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveForwardBack, false); } catch { }
        try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveLeftRight, false); } catch { }
        try { mod.EnableInputRestriction(player, mod.RestrictedInputs.Jump, false); } catch { }
        mod.ForceSwitchInventory(player, mod.InventorySlots.MeleeWeapon);
        mod.SetCameraTypeForPlayer(player, mod.Cameras.FirstPerson);
        InitLeapSystem(player);
        LogLeapRuntime(`test_deploy_init_${playerObjId}`, `LeapTest InitLeapSystem called | player=${playerObjId}`, 0.1);
        this.startVehicleDistanceTracking(player);
        console.log(`[LeapTest] Human player(${mod.GetObjId(player)}) deployed -- leap system initialized`);
    },
};

// ============================================================
// LEAP ATTACK SYSTEM
// ============================================================

// ============================================================
// LEAP TUNABLE CONSTANTS -- adjust these values during testing
// ============================================================

/** Total leap distance in meters along facing direction */
let LEAP_DISTANCE = 30;

/** Damage dealt to occupied vehicles on collision */
let LEAP_DAMAGE = 150;

/** Collision radius for hitting vehicles during the leap path.
 * The Vector/Flyer60 have a nearly 3m radius on the longer sections
*/
let LEAP_HIT_RADIUS = 4.0;

/** Meters of leap distance covered per teleport step (fewer = smoother, scales with distance) */
let LEAP_METERS_PER_STEP = 1.5;

/** Minimum number of steps regardless of distance */
let LEAP_STEP_MIN = 4;

/** Seconds between each teleport step */
let LEAP_STEP_DELAY = 0.02;

/** Peak height of the parabolic arc at midpoint in meters */
let LEAP_HEIGHT_ARC = 1.5;

/** Minimum effective distance required to execute a leap */
let LEAP_MIN_DISTANCE = 7;

/** Meters to backstep from a collision point along the arc */
let LEAP_COLLISION_BACKSTEP = 0.1;

/** Seconds between each marker step in the preview trail animation.
 *  Lower = faster looping animation. */
let LEAP_PREVIEW_STEP_DELAY = 0.02;

/** Shared rest delay between preview path passes. Test-mode vehicle distance display
 *  uses the same cadence so debug text updates at the same rate as path calculations. */
const LEAP_PREVIEW_TRACK_REST_DELAY = 0.12;

/** Extra time (seconds) added on top of each step's travel time when predicting where a
 *  moving vehicle will be during the leap. Acts as a safety margin so vehicles entering
 *  the path just after the snaphot are still caught. */
let LEAP_VEHICLE_PREDICT_MARGIN = 0.1;

/** Impulse magnitude applied to vehicles hit by leap collision logic via mod.ApplyImpulse. */
let LEAP_VEHICLE_IMPULSE_MAGNITUDE = 2.0;

/** Seconds to hold third-person camera + VFX after landing before switching back */
let LEAP_LANDING_LINGER = 1.0;

/** Seconds the player must hold crouch before leap can activate */
let LEAP_CROUCH_HOLD_SECONDS = 1.0;

/** Seconds of initial crouch hold before we engage the leap system (slide protection) */
let LEAP_CHARGE_BUFFER_SECONDS = 0.3;

// ============================================================
// PER-PLAYER LEAP STATE
// ============================================================

interface LeapState {
    isLeaping: boolean;
    /** Monotonic per-player token used to scope delayed VFX cleanup to one leap */
    activeLeapSequence: number;
    /** Active landing VFX, unspawned after the post-landing linger period */
    leapLandingVfx: mod.Object | undefined;
    /** 3D projectile flyby SFX that plays once the player engages their leap attack */
    leapStartSfx: mod.Object | undefined;
    /** OneShot 2D SFX that plays when charging leap attack */
    chargingSfx: mod.Object | undefined;
    /** One-shot SFX played when charge reaches ready state */
    chargeReadySfx: mod.Object | undefined;
    /** 3D warning loop heard by current spawned-vehicle occupants while charging/ready */
    chargeWarningLoopSfx: mod.Object | undefined;
    /** Vehicle occupant ObjIDs currently subscribed to the warning loop */
    chargeWarningTargets: Map<number, mod.Player>;
    /** Most recent RayCast collision point (set by OnRayCastHit for any leap ray) */
    rayHitPoint: mod.Vector | undefined;
    /** Distance to the most recent RayCast hit point */
    rayHitDist: number;
    /** VFX spawned at the collision target to indicate damage */
    hitVfx: mod.Object | undefined;
    /** Timestamp (seconds) when the player started holding crouch, 0 if not crouching */
    crouchStartTime: number;
    /** Container widget for the leap status HUD element */
    statusContainerWidget: mod.UIWidget | undefined;
    /** Text widget inside the status container */
    statusWidget: mod.UIWidget | undefined;
    /** VFX showing the predicted landing point once charge is complete */
    previewVfx: mod.Object | undefined;
    /** The predicted safe landing position from the latest path calculation */
    previewLandingPos: mod.Vector | undefined;
    /** Whether an async preview/path calculation is currently running */
    previewScanActive: boolean;
    /** Incremented to invalidate stale preview scans */
    previewScanId: number;
    /** VFX shown at the player while charging/ready */
    chargeVfx: mod.VFX | undefined;
    /** Tracks which charge VFX is active: 'none' | 'charging' | 'ready' */
    chargeVfxState: 'none' | 'charging' | 'ready';
    /** Full untruncated arc step positions calculated during the charge window */
    cachedStepPositions: mod.Vector[] | undefined;
    /** Step index at which geometry collision was detected (-1 = none) */
    cachedGeometryCollisionStep: number;
    /** Backstep position from geometry collision, if any */
    cachedGeometryCollisionPos: mod.Vector | undefined;
    /** Single VFX that moves along the preview arc in a loop */
    previewTrailVfx: mod.VFX | undefined;
    /** Last camera mode set via setLeapCamera - guards against redundant engine calls */
    currentCamera: mod.Cameras | undefined;
    /** True while the preview scan detects that the approach is too short to leap */
    previewIsBlocked: boolean;
    /** WorldIcon spawned at the blocked location instead of the normal arc, visible only to the owning player */
    blockedWarnIcon: mod.WorldIcon | undefined;
    /** Red alert WorldIcon shown over the player while leap is in charging (not ready) state */
    chargeAlertIcon: mod.WorldIcon | undefined;
}

const LEAP_STATES = new Map<number, LeapState>();

function getLeapWarningTargetsFromSpawnedVehicle(): mod.Player[] {
    if (!SPAWNED_ACTIVE_VEHICLE || !IsVehicleRefValid(SPAWNED_ACTIVE_VEHICLE)) return [];
    try {
        const occupants = ConvertArray(mod.GetAllPlayersInVehicle(SPAWNED_ACTIVE_VEHICLE)) as mod.Player[];
        return occupants.filter((vehiclePlayer) => Helpers.HasValidObjId(vehiclePlayer) && IsPlayerDeployed(vehiclePlayer));
    } catch {
        return [];
    }
}

function stopLeapVehicleWarningLoop(state: LeapState): void {
    if (state.chargeWarningLoopSfx) {
        for (const [, targetPlayer] of state.chargeWarningTargets) {
            if (!Helpers.HasValidObjId(targetPlayer)) continue;
            try {
                mod.StopSound(state.chargeWarningLoopSfx as mod.SFX, targetPlayer);
            } catch { }
        }
        try {
            mod.UnspawnObject(state.chargeWarningLoopSfx);
        } catch { }
        state.chargeWarningLoopSfx = undefined;
    }
    state.chargeWarningTargets.clear();
}

function syncLeapVehicleWarningLoop(playerPos: mod.Vector, state: LeapState): void {
    const vehicleTargets = getLeapWarningTargetsFromSpawnedVehicle();
    if (vehicleTargets.length === 0) {
        stopLeapVehicleWarningLoop(state);
        return;
    }

    if (!state.chargeWarningLoopSfx) {
        state.chargeWarningLoopSfx = mod.SpawnObject(
            SFX_ALPHA_LEAP_VEHICLE_WARNING_LOOP_3D,
            playerPos,
            ZERO_VEC
        );
        state.chargeWarningTargets.clear();
    } else {
        try {
            mod.SetObjectTransform(state.chargeWarningLoopSfx as mod.SFX, mod.CreateTransform(playerPos, ZERO_VEC));
        } catch {
            try { mod.UnspawnObject(state.chargeWarningLoopSfx); } catch { }
            state.chargeWarningLoopSfx = mod.SpawnObject(
                SFX_ALPHA_LEAP_VEHICLE_WARNING_LOOP_3D,
                playerPos,
                ZERO_VEC
            );
            state.chargeWarningTargets.clear();
        }
    }

    const activeObjIds = new Set<number>();
    for (const targetPlayer of vehicleTargets) {
        const targetObjId = mod.GetObjId(targetPlayer);
        if (targetObjId < 0) continue;
        activeObjIds.add(targetObjId);
        if (!state.chargeWarningTargets.has(targetObjId)) {
            mod.PlaySound(state.chargeWarningLoopSfx as mod.SFX, 1, playerPos, 60, targetPlayer);
            state.chargeWarningTargets.set(targetObjId, targetPlayer);
        }
    }

    for (const [trackedObjId, trackedPlayer] of state.chargeWarningTargets) {
        if (activeObjIds.has(trackedObjId)) continue;
        if (state.chargeWarningLoopSfx && Helpers.HasValidObjId(trackedPlayer)) {
            try {
                mod.StopSound(state.chargeWarningLoopSfx as mod.SFX, trackedPlayer);
            } catch { }
        }
        state.chargeWarningTargets.delete(trackedObjId);
    }
}

function playLeapLaunchWarning3DForTargets(launchPos: mod.Vector, targetPlayers: mod.Player[]): void {
    if (targetPlayers.length === 0) return;

    const launchSfx = mod.SpawnObject(
        SFX_ALPHA_LEAP_EXECUTE_WARN_3D,
        launchPos,
        ZERO_VEC
    );
    for (const targetPlayer of targetPlayers) {
        if (!Helpers.HasValidObjId(targetPlayer)) continue;
        mod.PlaySound(launchSfx as mod.SFX, 1, launchPos, 60, targetPlayer);
    }
}

// ============================================================
// LEAP VECTOR HELPERS
// ============================================================

function getVecX(v: mod.Vector): number {
    return mod.DotProduct(v, mod.RightVector());
}
function getVecY(v: mod.Vector): number {
    return mod.DotProduct(v, mod.UpVector());
}
function getVecZ(v: mod.Vector): number {
    return mod.DotProduct(v, mod.BackwardVector());
}

function flattenDirection(dir: mod.Vector): mod.Vector {
    const x = getVecX(dir);
    const z = getVecZ(dir);
    const horizontalLenSq = (x * x) + (z * z);

    // Looking perfectly vertical can produce an almost-zero horizontal facing.
    // Fall back to forward so leap direction remains valid and deterministic.
    if (horizontalLenSq <= 0.000001) {
        return mod.ForwardVector();
    }

    return mod.Normalize(mod.Add(
        mod.Multiply(mod.RightVector(), x),
        mod.Multiply(mod.BackwardVector(), z)
    ));
}

function directionToYaw(dir: mod.Vector): number {
    return Math.atan2(getVecX(dir), getVecZ(dir));
}

function arcHeight(t: number, peakHeight: number): number {
    return 4 * peakHeight * t * (1 - t);
}

function computeLeapStepPositions(
    startPos: mod.Vector,
    leapDir: mod.Vector,
    effectiveDistance: number,
    peakHeight: number = LEAP_HEIGHT_ARC
): mod.Vector[] {
    // Scale step count with distance; minimum ensures short leaps still animate
    const stepCount = Math.max(LEAP_STEP_MIN, Math.round(effectiveDistance / LEAP_METERS_PER_STEP));
    const positions: mod.Vector[] = [];
    for (let step = 1; step <= stepCount; step++) {
        // Ease-in: concentrate steps near launch so early movement feels snappy
        const t = Math.pow(step / stepCount, 1.5);
        let stepPos = mod.Add(startPos, mod.Multiply(leapDir, effectiveDistance * t));
        const heightBoost = arcHeight(t, peakHeight);
        stepPos = mod.Add(stepPos, mod.Multiply(mod.UpVector(), heightBoost));
        positions.push(stepPos);
    }
    return positions;
}

/** Shared computation for both preview and execution: builds the leap arc
 *  from a player's current position and yaw-facing direction. Pitch is intentionally
 *  ignored so preview path, travel path, and max distance remain consistent. */
function computeLeapTrack(player: mod.Player) {
    const startPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    const facingDir = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);
    const leapDir = flattenDirection(facingDir);
    const effectiveDistance = LEAP_DISTANCE;
    const scaledPeakHeight = LEAP_HEIGHT_ARC;

    const steps = computeLeapStepPositions(startPos, leapDir, effectiveDistance, scaledPeakHeight);
    const NUM_MARKERS = 6;
    const markerSpacing = Math.max(1, Math.floor(steps.length / NUM_MARKERS));
    const trackPoints: mod.Vector[] = [];
    for (let i = 0; i < steps.length; i += markerSpacing) {
        trackPoints.push(steps[i]);
    }
    trackPoints.push(steps[steps.length - 1]);
    return { startPos, facingDir, leapDir, steps, trackPoints, effectiveDistance, scaledPeakHeight };
}

// ============================================================
// LEAP UI CREATION
// ============================================================

function createLeapUI(player: mod.Player, playerObjId: number) {
    if (!IsPlayerOnInfectedTeamForLeap(player)) {
        return { statusContainerWidget: undefined, statusWidget: undefined };
    }
    const statusContainerWidget = ParseUI({
        type: "Container",
        name: `leap_status_ctr_${playerObjId}`,
        position: [100, 100, 0],
        size: [180, 36],
        anchor: mod.UIAnchor.Center,
        bgColor: [0.06, 0.06, 0.06],
        bgAlpha: 0.8,
        bgFill: mod.UIBgFill.Blur,
        visible: false,
        playerId: player,
        children: [{
            type: "Text",
            name: `leap_status_txt_${playerObjId}`,
            position: [0, 0, 0],
            size: [170, 32],
            anchor: mod.UIAnchor.Center,
            textLabel: mod.Message(mod.stringkeys.leap_status_ready),
            textColor: [0.2, 1, 0.3],
            textAlpha: 1,
            textSize: 14,
            textAnchor: mod.UIAnchor.Center,
        }],
    });

    const statusWidget = mod.FindUIWidgetWithName(
        `leap_status_txt_${playerObjId}`, statusContainerWidget!
    ) as mod.UIWidget | undefined;

    return { statusContainerWidget, statusWidget };
}

// ============================================================
// TRAJECTORY PREVIEW (while crouching + ready)
// ============================================================

/** Cancel an active trajectory preview scan and hide the VFX. */
function cancelTrajectoryPreview(state: LeapState): void {
    state.previewScanActive = false;
    state.previewScanId++;
    if (state.previewVfx) {
        mod.UnspawnObject(state.previewVfx);
        state.previewVfx = undefined;
    }
    if (state.previewTrailVfx) {
        mod.UnspawnObject(state.previewTrailVfx);
        state.previewTrailVfx = undefined;
    }
    if (state.blockedWarnIcon) {
        mod.UnspawnObject(state.blockedWarnIcon);
        state.blockedWarnIcon = undefined;
    }
    if (state.chargeAlertIcon) {
        mod.EnableWorldIconImage(state.chargeAlertIcon, false);
        mod.EnableWorldIconText(state.chargeAlertIcon, false);
        mod.UnspawnObject(state.chargeAlertIcon);
        state.chargeAlertIcon = undefined;
    }
    state.previewIsBlocked = false;
    state.previewLandingPos = undefined;
}

/**
 * Runs a one-time collision scan (3 raycasts + vehicle check), then enters
 * an animation loop that recomputes the arc from the player's live position
 * and facing each pass. The trail VFX naturally tracks where the player is
 * aiming without requiring external deviation restarts.
 */
async function startTrajectoryPreview(player: mod.Player, state: LeapState): Promise<void> {
    state.previewScanActive = true;
    const scanId = ++state.previewScanId;

    function isValid(): boolean {
        return state.previewScanActive && state.previewScanId === scanId && LEAP_STATES.has(mod.GetObjId(player));
    }

    state.cachedStepPositions = undefined;
    state.cachedGeometryCollisionStep = -1;
    state.cachedGeometryCollisionPos = undefined;

    // Compute initial arc so VFXes can be spawned at a sensible starting position
    const initialTrack = computeLeapTrack(player);

    // Spawn trail VFX once - repositioned via MoveVFX each iteration
    // dot color changes based on charge state and set below before iteration
    let trailVfx = mod.SpawnObject(
        mod.RuntimeSpawn_Common.FX_EODBot_Active_Enemy,
        initialTrack.steps[0], ZERO_VEC
    ) as mod.VFX;
    mod.EnableVFX(trailVfx, true);
    state.previewTrailVfx = trailVfx;

    // Spawn destination indicator once - repositioned via MoveVFX each iteration.
    const destVfx = mod.SpawnObject(
        mod.RuntimeSpawn_Common.FX_Gadget_AT4_Projectile_Trail,
        initialTrack.steps[initialTrack.steps.length - 1], ZERO_VEC
    ) as mod.VFX;
    mod.EnableVFX(destVfx, false); // hidden until charge is ready
    state.previewVfx = destVfx;

    // Passes before the blocked-warning SFX may fire again.
    // Each pass takes ~0.17s (0.05s raycast + 0.12s rest), so 6 passes ~= 1s.
    const BLOCKED_WARN_PASSES = 6;
    let blockedSfxCooldown = 0; // start at 0 so the first blocked detection fires immediately
    let currentTrailIsReady = false;
    let chargeAlertVisible = true;
    const CHARGE_ALERT_ICON_HEIGHT = 1.2;

    // --- Animation loop: each pass recomputes the arc and fires ONE fresh geometry probe ---
    // Doing the collision check per-iteration (instead of once at startup) ensures the
    // indicator and trail truncation are always consistent with the player's current position
    while (isValid()) {
        // Recompute arc from the player's live position and facing direction
        const liveTrack = computeLeapTrack(player);
        const liveTrackPoints = liveTrack.trackPoints;
        state.cachedStepPositions = liveTrack.steps;
        const arcEndpoint = liveTrack.steps[liveTrack.steps.length - 1];

        // Charge-phase world alert (charging + ready): tracked at preview cadence.
        const hasChargeState = state.chargeVfxState === 'charging' || state.chargeVfxState === 'ready';
        if (hasChargeState && !state.isLeaping) {
            const chargeIconPos = mod.Add(
                liveTrack.startPos,
                mod.Multiply(mod.UpVector(), CHARGE_ALERT_ICON_HEIGHT)
            );
            if (!state.chargeAlertIcon) {
                const iconObj = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, chargeIconPos, ZERO_VEC);
                const icon = iconObj as mod.WorldIcon;
                mod.SetWorldIconImage(icon, mod.WorldIconImages.Alert);
                mod.SetWorldIconColor(icon, UI.enemyOrange);
                // consider only displaying this to the vehicle driver?
                mod.EnableWorldIconText(icon, false);
                mod.EnableWorldIconImage(icon, true);
                state.chargeAlertIcon = icon;
                chargeAlertVisible = true;
            } else {
                mod.SetWorldIconPosition(state.chargeAlertIcon, chargeIconPos);
                chargeAlertVisible = !chargeAlertVisible;
                mod.EnableWorldIconImage(state.chargeAlertIcon, chargeAlertVisible);
            }
        } else if (state.chargeAlertIcon) {
            mod.EnableWorldIconImage(state.chargeAlertIcon, false);
            mod.EnableWorldIconText(state.chargeAlertIcon, false);
            mod.UnspawnObject(state.chargeAlertIcon);
            state.chargeAlertIcon = undefined;
            chargeAlertVisible = true;
        }

        // Single-ray geometry probe along the chord from eye level to the arc endpoint.
        // One ray covers most common obstacle cases and resolves within ~50ms.
        state.rayHitPoint = undefined;
        state.rayHitDist = 0;
        const scanAbove = mod.Add(liveTrack.startPos, mod.Multiply(mod.UpVector(), 1.5));
        mod.RayCast(player, scanAbove, arcEndpoint);
        await mod.Wait(0.05);
        if (!isValid()) break;

        // Resolve the destination from the fresh raycast result
        let destPos = arcEndpoint;
        if (state.rayHitPoint && state.rayHitDist > 1.5) {
            const backDir = mod.Normalize(mod.Subtract(scanAbove, state.rayHitPoint));
            destPos = mod.Add(state.rayHitPoint, mod.Multiply(backDir, LEAP_COLLISION_BACKSTEP));
        }
        state.previewLandingPos = destPos;
        // Keep cached state in sync so executeLeap can read a recent estimate
        const hasCollision = destPos !== arcEndpoint;
        state.cachedGeometryCollisionPos = hasCollision ? destPos : undefined;
        state.cachedGeometryCollisionStep = hasCollision ? 0 : -1;

        // Blocked check: geometry collides too close for a valid leap
        const travelDist = mod.DistanceBetween(liveTrack.startPos, destPos);
        const isBlocked = travelDist < LEAP_MIN_DISTANCE;
        state.previewIsBlocked = isBlocked;

        if (isBlocked) {
            // Spawn the warning WorldIcon once; reposition it each pass with SetWorldIconPosition.
            // Owner is set to the individual player so it is only visible to them.
            if (!state.blockedWarnIcon) {
                const iconObj = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, destPos, ZERO_VEC);
                const icon = iconObj as mod.WorldIcon;
                mod.SetWorldIconOwner(icon, player);
                mod.SetWorldIconImage(icon, mod.WorldIconImages.Cross);
                mod.SetWorldIconColor(icon, mod.CreateVector(1, 0.2, 0.2));
                mod.SetWorldIconText(icon, MakeMessage(mod.stringkeys.leap_status_blocked));
                mod.EnableWorldIconImage(icon, true);
                mod.EnableWorldIconText(icon, true);
                state.blockedWarnIcon = icon;
            } else {
                mod.SetWorldIconPosition(state.blockedWarnIcon, destPos);
            }
            // Hide normal preview VFXes while blocked
            mod.EnableVFX(trailVfx, false);
            mod.EnableVFX(destVfx, false);
            // Throttled SFX + oscillation - at most once per ~1 second
            blockedSfxCooldown--;
            if (blockedSfxCooldown <= 0) {
                Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, player);
                if (!isValid()) break;
                mod.SetWorldIconPosition(state.blockedWarnIcon, destPos);
                blockedSfxCooldown = BLOCKED_WARN_PASSES;
            }
            await mod.Wait(LEAP_PREVIEW_TRACK_REST_DELAY);
            continue;
        }

        // Swap trail VFX only when charge state transitions (charging <-> ready)
        const trailReady = state.chargeVfxState === 'ready';
        if (trailReady !== currentTrailIsReady) {
            mod.UnspawnObject(trailVfx);
            trailVfx = mod.SpawnObject(
                trailReady
                    ? mod.RuntimeSpawn_Common.FX_ProjectileTrail_M320_NonLethal
                    : mod.RuntimeSpawn_Common.FX_EODBot_Active_Enemy,
                liveTrackPoints[0], ZERO_VEC, mod.CreateVector(1, 1, 1)
            ) as mod.VFX;
            mod.EnableVFX(trailVfx, true);
            state.previewTrailVfx = trailVfx;
            currentTrailIsReady = trailReady;
        }

        // Recovering from blocked: remove the WorldIcon and restore normal display
        if (state.blockedWarnIcon) {
            mod.UnspawnObject(state.blockedWarnIcon);
            state.blockedWarnIcon = undefined;
            mod.EnableVFX(trailVfx, true);
            // Only restore the dest indicator if the charge is already complete
            if (state.chargeVfxState === 'ready') {
                mod.EnableVFX(destVfx, true);
            }
        }

        // Sync dest indicator visibility to charge-ready state each iteration
        const destVfxShouldShow = state.chargeVfxState === 'ready';
        mod.EnableVFX(destVfx, destVfxShouldShow);

        // Immediately reposition indicator to the freshly resolved destination.
        // set an aggressive negative vertical offset to sink the mortar VFX circle into ground
        // reverted - used this with the mortar vfx, trying other vfx
        mod.MoveVFX(destVfx, destPos, ZERO_VEC);

        // Truncate the trail animation to stop at the collision point when geometry
        // was detected, so the trail doesn't visually sweep through the obstacle.
        let animPoints = liveTrackPoints;
        if (hasCollision) {
            const collisionDist = mod.DistanceBetween(liveTrack.startPos, destPos);
            const fraction = Math.min(1, collisionDist / Math.max(liveTrack.effectiveDistance, 0.01));
            const cutoff = Math.max(1, Math.ceil(liveTrackPoints.length * fraction));
            animPoints = liveTrackPoints.slice(0, cutoff);
        }

        // Animate the trail through the arc markers
        for (let i = 0; i < animPoints.length; i++) {
            if (!isValid()) break;
            mod.MoveVFX(trailVfx, animPoints[i], ZERO_VEC);
            await mod.Wait(LEAP_PREVIEW_STEP_DELAY);
        }
        if (!isValid()) break;
        await mod.Wait(LEAP_PREVIEW_TRACK_REST_DELAY);
    }

    state.previewScanActive = false;
}

// ============================================================
// LEAP EXECUTION
// ============================================================

/**
 * Guards against back-to-back camera switches that can cause a black-screen flash.
 * Only calls the engine API when the requested mode differs from the last known mode.
 */
function setLeapCamera(player: mod.Player, state: LeapState, camera: mod.Cameras): void {
    if (state.currentCamera === camera) return;
    state.currentCamera = camera;
    mod.SetCameraTypeForPlayer(player, camera);
}

async function executeLeap(player: mod.Player, state: LeapState): Promise<void> {
    const leapSequence = state.activeLeapSequence + 1;
    state.activeLeapSequence = leapSequence;
    state.isLeaping = true;
    let leapHitVfx: mod.VFX | undefined;

    // Hide preview VFX and stop any pending scan
    cancelTrajectoryPreview(state);

    // Transfer from charge warning loop to launch warning for current vehicle occupants.
    const launchWarningPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    const launchWarningTargets = getLeapWarningTargetsFromSpawnedVehicle();
    stopLeapVehicleWarningLoop(state);
    playLeapLaunchWarning3DForTargets(launchWarningPos, launchWarningTargets);

    // Clear state
    state.cachedStepPositions = undefined;
    state.cachedGeometryCollisionStep = -1;
    state.cachedGeometryCollisionPos = undefined;

    // Compute a fresh path from the player's current position and facing
    const { startPos, leapDir, steps: stepPositions, effectiveDistance, scaledPeakHeight } = computeLeapTrack(player);
    const yaw = directionToYaw(leapDir);

    // Min-distance check
    const effectiveLandingPos = stepPositions[stepPositions.length - 1];
    if (mod.DistanceBetween(startPos, effectiveLandingPos) < LEAP_MIN_DISTANCE) {
        Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, player);
        setLeapCamera(player, state, mod.Cameras.FirstPerson);
        state.isLeaping = false;
        state.crouchStartTime = 0;
        return;
    }


    setLeapCamera(player, state, mod.Cameras.ThirdPerson);

    // --- Inline geometry collision check (3 raycasts) ---
    const startAbove = mod.Add(startPos, mod.Multiply(mod.UpVector(), 1.2));
    const peakIdx = Math.floor(stepPositions.length / 2);
    const chordEnd = stepPositions[stepPositions.length - 1];
    let geoCollisionStep = -1;
    let geoCollisionPos: mod.Vector | undefined;

    // Ray 1: Immediate direction
    state.rayHitPoint = undefined;
    state.rayHitDist = 0;
    mod.RayCast(player, startAbove, chordEnd);
    await mod.Wait(0.05);
    if (state.rayHitPoint && state.rayHitDist > 1.5) {
        const backDir = mod.Normalize(mod.Subtract(startAbove, state.rayHitPoint));
        geoCollisionPos = mod.Add(state.rayHitPoint, mod.Multiply(backDir, LEAP_COLLISION_BACKSTEP));
        geoCollisionStep = 0;
    }

    // Ray 2: Rise (startAbove --> arc peak)
    if (!geoCollisionPos) {
        state.rayHitPoint = undefined;
        state.rayHitDist = 0;
        mod.RayCast(player, startAbove, stepPositions[peakIdx]);
        await mod.Wait(0.05);
        if (state.rayHitPoint && state.rayHitDist > 1.5) {
            const backDir = mod.Normalize(mod.Subtract(startAbove, state.rayHitPoint));
            geoCollisionPos = mod.Add(state.rayHitPoint, mod.Multiply(backDir, LEAP_COLLISION_BACKSTEP));
            geoCollisionStep = peakIdx;
        }
    }

    // Ray 3: Descent (arc peak --> landing)
    if (!geoCollisionPos) {
        state.rayHitPoint = undefined;
        state.rayHitDist = 0;
        mod.RayCast(player, stepPositions[peakIdx], stepPositions[stepPositions.length - 1]);
        await mod.Wait(0.05);
        if (state.rayHitPoint && state.rayHitDist > 1.5) {
            const backDir = mod.Normalize(mod.Subtract(stepPositions[peakIdx], state.rayHitPoint));
            geoCollisionPos = mod.Add(state.rayHitPoint, mod.Multiply(backDir, LEAP_COLLISION_BACKSTEP));
            geoCollisionStep = stepPositions.length - 1;
        }
    }

    // --- Vehicle detection: one arc-chord raycast + proximity fallback ---
    // The raycast fires from start to arc-end along the chord and quickly detects
    // any vehicle in the direct line of sight. The per-step proximity scan handles
    // vehicles that sit on the curved portion of the arc the chord ray would miss.
    // Damage is NOT applied here -- the arc truncates before the vehicle so the
    // entity stays alive until the player has stopped short.
    let vehicleHitRef: mod.Vehicle | undefined;
    let vehicleHitPos: mod.Vector | undefined;

    state.rayHitPoint = undefined;
    state.rayHitDist = 0;
    mod.RayCast(player, startAbove, stepPositions[stepPositions.length - 1]);
    await mod.Wait(0.05);

    if (state.rayHitPoint && state.rayHitDist > 1.5) {
        // Cross-reference the hit point with all vehicle positions to confirm a vehicle was hit
        const allVehiclesA = ConvertArray(mod.AllVehicles()) as mod.Vehicle[];
        for (const vehicle of allVehiclesA) {
            const vPos = mod.GetVehicleState(vehicle, mod.VehicleStateVector.VehiclePosition);
            if (mod.DistanceBetween(state.rayHitPoint, vPos) <= LEAP_HIT_RADIUS) {
                vehicleHitRef = vehicle;
                vehicleHitPos = vPos;
                break;
            }
        }
    }

    // Proximity fallback: step through the arc to catch any vehicle the chord ray missed
    if (!vehicleHitRef) {
        const allVehiclesB = ConvertArray(mod.AllVehicles()) as mod.Vehicle[];
        for (let i = 0; i < stepPositions.length && !vehicleHitRef; i++) {
            for (const vehicle of allVehiclesB) {
                const vPos = mod.GetVehicleState(vehicle, mod.VehicleStateVector.VehiclePosition);
                if (mod.DistanceBetween(stepPositions[i], vPos) <= LEAP_HIT_RADIUS) {
                    vehicleHitRef = vehicle;
                    vehicleHitPos = vPos;
                }
            }
        }
    }

    // Motion-prediction pass: covers vehicles that are moving and will enter the teleport
    // path between the snapshot and the actual step execution. For each step we estimate
    // where the vehicle will be at that moment in time using its current linear velocity.
    // A small extra margin (LEAP_VEHICLE_PREDICT_MARGIN) ensures vehicles arriving just
    // after the snapshot window are still caught.
    if (!vehicleHitRef) {
        const allVehiclesC = ConvertArray(mod.AllVehicles()) as mod.Vehicle[];
        for (let i = 0; i < stepPositions.length && !vehicleHitRef; i++) {
            const t = i * LEAP_STEP_DELAY + LEAP_VEHICLE_PREDICT_MARGIN;
            for (const vehicle of allVehiclesC) {
                const vPos = mod.GetVehicleState(vehicle, mod.VehicleStateVector.VehiclePosition);
                const vVel = mod.GetVehicleState(vehicle, mod.VehicleStateVector.LinearVelocity);
                // Predicted position = current + velocity * elapsed time at this step
                const predictedPos = mod.Add(vPos, mod.Multiply(vVel, t));
                if (mod.DistanceBetween(stepPositions[i], predictedPos) <= LEAP_HIT_RADIUS) {
                    vehicleHitRef = vehicle;
                    // Use the predicted position for the backstep so the player stops
                    // short of where the vehicle will actually be, not where it is now.
                    vehicleHitPos = predictedPos;
                }
            }
        }
    }

    // Compute stop position: back up from the vehicle centre so the player lands
    // just outside the hit radius and never teleports into the vehicle body.
    let vehicleStopPos: mod.Vector | undefined;
    if (vehicleHitPos) {
        const backDir = mod.Normalize(mod.Subtract(startPos, vehicleHitPos));
        vehicleStopPos = mod.Add(vehicleHitPos, mod.Multiply(backDir, LEAP_HIT_RADIUS + LEAP_COLLISION_BACKSTEP));
    }

    // Final destination: vehicle stop takes priority over geometry collision
    let finalLandingOverride: mod.Vector | undefined;
    if (vehicleStopPos) {
        finalLandingOverride = vehicleStopPos;
    } else if (geoCollisionPos) {
        finalLandingOverride = geoCollisionPos;
    }

    // Recompute the arc steps scaled to the actual travel distance so that
    // short-distance leaps (e.g. wall collision) get the same step density as long ones.
    // scaledPeakHeight is threaded through so height-clamped arcs keep a proportional peak.
    const finalDest = finalLandingOverride ?? stepPositions[stepPositions.length - 1];
    const actualDist = mod.DistanceBetween(startPos, finalDest);
    const travelPeakHeight = scaledPeakHeight * Math.min(1, actualDist / Math.max(effectiveDistance, 0.01));
    const travelSteps = computeLeapStepPositions(startPos, leapDir, Math.max(actualDist, 0.01), travelPeakHeight);
    const vehicleImpulseStepIndex = (vehicleHitRef && travelSteps.length >= 3)
        ? (travelSteps.length - 3)
        : -1;
    let vehicleImpulseApplied = false;

    const applyVehicleImpulse = () => {
        if (vehicleImpulseApplied || !vehicleHitRef) return;
        vehicleImpulseApplied = true;
        try {
            const vehiclePosNow = mod.GetVehicleState(vehicleHitRef, mod.VehicleStateVector.VehiclePosition);
            mod.ApplyImpulse(vehicleHitRef, vehiclePosNow, leapDir, LEAP_VEHICLE_IMPULSE_MAGNITUDE);
        } catch { }
    };

    const trailBreadcrumbs: mod.VFX[] = [];

    const trailVfx = mod.SpawnObject(
        mod.RuntimeSpawn_Common.FX_Grenade_Incendiary_Trail,
        travelSteps[0], ZERO_VEC, mod.CreateVector(1, 1, 1)
    ) as mod.VFX;
    // Ready the launch sound and switch to third-person
    const leapSfx = mod.SpawnObject(
        mod.RuntimeSpawn_Common.SFX_Projectiles_Flybys_Large_Cannon_Shell_120mm_FlyBy_Close_OneShot3D,
        stepPositions[peakIdx], ZERO_VEC
    );
    // enable trail vfx and play projectile flyby sound at peak step in path
    mod.PlaySound(leapSfx as mod.SFX, 1, stepPositions[peakIdx], 60);
    // play localized charging SFX for player
    Helpers.PlaySoundFX(SFX_ALPHA_LEAP_2D, 1, player);
    mod.EnableVFX(trailVfx, true);
    // move VFX along with the player steps, gives trail effect under their feet
    for (let i = 0; i < travelSteps.length - 1; i++) {
        // Apply vehicle impulse 2 step positions before knockback when possible.
        if (i === vehicleImpulseStepIndex) {
            applyVehicleImpulse();
        }
        mod.Teleport(player, travelSteps[i], yaw);
        mod.MoveVFX(trailVfx, travelSteps[i], ZERO_VEC);
        await mod.Wait(LEAP_STEP_DELAY);
    }
    // Fallback: if we couldn't apply 2 steps early, apply at collision/final-teleport moment.
    applyVehicleImpulse();
    // mod.MoveObject(leapSfx, finalDest);
    mod.EnableVFX(trailVfx, false);
    // Final teleport: exact collision backstep if applicable, otherwise last arc step
    mod.Teleport(player, finalLandingOverride ?? travelSteps[travelSteps.length - 1], yaw);

    // Knockback: only when the player hit a real vertical obstacle (wall or vehicle).
    // A geometry collision that is at or below the player's start height is just the
    // arc naturally truncating against the ground, not a wall impact -- skip knockback there.
    const isVehicleCollision = !!vehicleHitRef;
    const isWallCollision = !!geoCollisionPos
        && (getVecY(geoCollisionPos) - getVecY(startPos)) > 0.5;
    if (finalLandingOverride && (isVehicleCollision || isWallCollision)) {
        // Apply vehicle damage now that the arc is complete. The player stopped short of
        // the vehicle (never teleported into it), so the entity is still alive and valid.
        // Applies whether or not the vehicle currently has anyone in it -- the impulse and
        // hit reaction are a property of hitting the vehicle itself, not its occupants.
        if (vehicleHitRef && vehicleHitPos) {
            const playerHealth = mod.GetSoldierState(player, mod.SoldierStateNumber.CurrentHealth);
            const damageToDeal = Math.min(LEAP_DAMAGE * 0.75, playerHealth * 0.50); // soft cap to prevent leap suicides
            mod.DealDamage(vehicleHitRef, LEAP_DAMAGE);
            mod.DealDamage(player, damageToDeal, player); // self-damage for balance and feedback
            if (state.hitVfx) {
                mod.UnspawnObject(state.hitVfx);
                state.hitVfx = undefined;
            }
            const hitVfx = mod.SpawnObject(
                mod.RuntimeSpawn_Common.FX_Missile_MBTLAW_Hit_Glancing,
                vehicleHitPos,
                mod.CreateVector(0, 0, 0),
                mod.CreateVector(1, 1, 1)
            ) as mod.VFX;
            mod.EnableVFX(hitVfx, true);
            state.hitVfx = hitVfx;
            leapHitVfx = hitVfx;
        }

        // Concussion ringing plays only for the leaping player (2D - no world position needed)
        // SFX_Soldier_Damage_Explosion_Ring_SimpleLoop2D
        const ragdollOrigin = travelSteps[travelSteps.length - 1];
        const soldierImpactSfx = mod.SpawnObject(
            mod.RuntimeSpawn_Common.SFX_Soldier_Damage_Fall_Low_OneShot2D,
            ragdollOrigin, ZERO_VEC, mod.CreateVector(1, 1, 1)
        );
        const soldierReactSfx = mod.SpawnObject(
            mod.RuntimeSpawn_Common.SFX_Soldier_Revive_Effort_MaleHurt_OneShot3D,
            ragdollOrigin, ZERO_VEC, mod.CreateVector(1, 1, 1)
        );
        // Body-impact ragdoll SFX plays in world space so nearby players also hear it (3D).
        // Spawn at the step closest to the obstacle so the sound origin feels correct.
        const ragdollSfxObj = mod.SpawnObject(
            mod.RuntimeSpawn_Common.SFX_Soldier_Ragdoll_OnDeath_OneShot3D,
            ragdollOrigin, ZERO_VEC, mod.CreateVector(1, 1, 1)
        );
        mod.PlaySound(soldierImpactSfx, 1, player);
        mod.PlaySound(ragdollSfxObj, 1);
        // Brief pause so the player "feels" the wall before being thrown back
        await mod.Wait(0.05);
        mod.PlaySound(soldierReactSfx, 1);

        // Repel in two steps directly opposite the leap direction so there's a
        // clear visual difference between hitting the wall and rebounding from it.
        const backDir = mod.Normalize(mod.Multiply(leapDir, -1));
        const lift = mod.Multiply(mod.UpVector(), 0.5);

        const repelStep1 = mod.Add(mod.Add(finalLandingOverride, mod.Multiply(backDir, 2)), lift);
        mod.Teleport(player, repelStep1, yaw);
        await mod.Wait(0.12);

        const repelStep2 = mod.Add(mod.Add(finalLandingOverride, mod.Multiply(backDir, 4)), lift);
        mod.Teleport(player, repelStep2, yaw);
        await mod.Wait(0.12);
        mod.StopSound(soldierImpactSfx, player);
    }

    // Wait until the player is on the ground before impact
    const maxGroundWait = 20;
    for (let i = 0; i < maxGroundWait; i++) {
        const onGround = mod.GetSoldierState(player, mod.SoldierStateBool.IsOnGround);
        const jumping = mod.GetSoldierState(player, mod.SoldierStateBool.IsJumping);
        if (onGround && !jumping) break;
        await mod.Wait(0.05);
    }

    // Spawn impact VFX at landing position
    const landingPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    const landingVfx = mod.SpawnObject(
        mod.RuntimeSpawn_Common.FX_Impact_SafeImpact_Sand,
        landingPos,
        mod.CreateVector(0, 0, 0),
        mod.CreateVector(1, 1, 1)
    ) as mod.VFX;
    state.leapLandingVfx = landingVfx;
    mod.EnableVFX(landingVfx, true);

    // Brief linger in third person so the player sees the impact
    await mod.Wait(LEAP_LANDING_LINGER);

    // Switch back to first person and clean up leap movement SFX
    setLeapCamera(player, state, mod.Cameras.FirstPerson);
    if (state.leapStartSfx) {
        mod.UnspawnObject(state.leapStartSfx);
        state.leapStartSfx = undefined;
    }

    state.isLeaping = false;
    // Reset crouch hold so the player must re-charge before next leap
    state.crouchStartTime = 0;

    // Clean up VFX after a brief display period
    await mod.Wait(3.0);
    if (state.leapLandingVfx === landingVfx) {
        try { mod.UnspawnObject(state.leapLandingVfx); } catch { }
        state.leapLandingVfx = undefined;
    } else if (state.activeLeapSequence !== leapSequence) {
        // A newer leap started while this older leap was in delayed cleanup.
        try { mod.UnspawnObject(landingVfx); } catch { }
    }
    if (leapHitVfx && state.hitVfx === leapHitVfx) {
        try { mod.UnspawnObject(state.hitVfx); } catch { }
        state.hitVfx = undefined;
    }
    for (const tv of trailBreadcrumbs) {
        mod.UnspawnObject(tv);
    }
}


// ============================================================
// LEAP SYSTEM LIFECYCLE
// ============================================================

async function InitLeapSystem(player: mod.Player, activeVehicle?: mod.Vehicle): Promise<void> {
    const objId = mod.GetObjId(player);
    const profile = PlayerProfile.Get(player);
    const teamObjId = mod.GetObjId(mod.GetTeam(player));
    LogLeapRuntime(
        `init_enter_${objId}`,
        `InitLeapSystem enter | player=${objId} map=${CURRENT_MAP ?? 'undefined'} test=${LEAP_TEST_MODE} inArea=${profile?.isInLeapAttackArea} teamObjId=${teamObjId} ppInfected=${profile?.isInfectedTeam} ppAlpha=${profile?.isAlphaInfected}`,
        0.2
    );
    if (objId < 0) {
        LogLeapRuntime(`init_skip_obj_${objId}`, `InitLeapSystem skip invalid ObjID | player=${objId}`, 0.2);
        return;
    }
    if (!LEAP_TEST_MODE && !BOT_SURVIVAL_TEST_MODE && CURRENT_MAP !== MapNames.SAND2) {
        LogLeapRuntime(`init_skip_map_${objId}`, `InitLeapSystem skip map gate | player=${objId} map=${CURRENT_MAP ?? 'undefined'}`, 0.2);
        return;
    }

    CleanupLeapSystem(player);

    const ui = createLeapUI(player, objId);

    LEAP_STATES.set(objId, {
        isLeaping: false,
        activeLeapSequence: 0,
        leapLandingVfx: undefined,
        hitVfx: undefined,
        leapStartSfx: undefined,
        chargingSfx: undefined,
        chargeReadySfx: undefined,
        chargeWarningLoopSfx: undefined,
        chargeWarningTargets: new Map<number, mod.Player>(),
        rayHitPoint: undefined,
        rayHitDist: 0,
        crouchStartTime: 0,
        statusContainerWidget: ui.statusContainerWidget,
        statusWidget: ui.statusWidget,
        previewVfx: undefined,
        previewLandingPos: undefined,
        previewScanActive: false,
        previewScanId: 0,
        chargeVfx: undefined,
        chargeVfxState: 'none',
        cachedStepPositions: undefined,
        cachedGeometryCollisionStep: -1,
        cachedGeometryCollisionPos: undefined,
        previewTrailVfx: undefined,
        currentCamera: mod.Cameras.FirstPerson,
        previewIsBlocked: false,
        blockedWarnIcon: undefined,
        chargeAlertIcon: undefined,
    });
    LogLeapRuntime(`init_success_${objId}`, `InitLeapSystem success | player=${objId} hasState=${LEAP_STATES.has(objId)}`, 0.2);

    // basic AI leap test
    if (SafeIsAISoldier(player) && LEAP_TEST_MODE) {
        // Wait for the survivor bot to settle into the vehicle seat.
        await mod.Wait(4);

        // Resolve the target vehicle. When the test harness spawns via the interact point
        // it passes activeVehicle directly; fall back to scanning all vehicles otherwise.
        let targetVehicle: mod.Vehicle | undefined = activeVehicle;

        // Keep leap test behavior independent from runtime targeting toggle changes.

        // Chase and charge-leap the vehicle driver until the seat is vacated or the AI dies.
        while (targetVehicle) {
            if (!PlayerIsAliveAndValid(player)) break;
            const MIN_LEAP_DIST = 4;
            const driver = mod.GetPlayerFromVehicleSeat(targetVehicle, 0);
            if (!PlayerIsAliveAndValid(driver)) break;

            // Explicitly set the engagement target and move toward the vehicle so
            // the bot actually closes distance (without AIMoveToBehavior it just stands still).
            const vehiclePos = mod.GetVehicleState(targetVehicle, mod.VehicleStateVector.VehiclePosition);
            if (mod.DistanceBetween(mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition), vehiclePos) > MIN_LEAP_DIST) {
                mod.AISetTarget(player, driver);
                // mod.AIMoveToBehavior(player, vehiclePos);
                // Hold crouch and fire via AI input commands so leap charge is fully input-driven.
                mod.SetAiInput(player, mod.AiInput.Crouch, LEAP_CROUCH_HOLD_SECONDS + 0.6);
                mod.SetAiInput(player, mod.AiInput.FireWeapon, LEAP_CROUCH_HOLD_SECONDS + 1.5);
                await mod.Wait(0.5);
                mod.AIIdleBehavior(player);
            }
            mod.SetAiInput(player, mod.AiInput.Crouch, 0.2);
            await mod.Wait(0.25);
        }
        mod.Kill(player);
    }
    return;
}

function CleanupLeapSystem(player: mod.Player): void {
    const objId = mod.GetObjId(player);
    const state = LEAP_STATES.get(objId);
    if (!state) return;

    if (state.statusContainerWidget) mod.DeleteUIWidget(state.statusContainerWidget);
    if (state.chargeVfx) {
        mod.UnspawnObject(state.chargeVfx);
        state.chargeVfx = undefined;
        state.chargeVfxState = 'none';
    }
    if (state.chargingSfx) {
        mod.UnspawnObject(state.chargingSfx);
        state.chargingSfx = undefined;
    }
    if (state.chargeReadySfx) {
        mod.UnspawnObject(state.chargeReadySfx);
        state.chargeReadySfx = undefined;
    }
    stopLeapVehicleWarningLoop(state);
    if (state.leapLandingVfx) {
        mod.UnspawnObject(state.leapLandingVfx);
        state.leapLandingVfx = undefined;
    }
    if (state.hitVfx) {
        mod.UnspawnObject(state.hitVfx);
        state.hitVfx = undefined;
    }
    if (state.leapStartSfx) {
        mod.UnspawnObject(state.leapStartSfx);
        state.leapStartSfx = undefined;
    }
    if (state.previewVfx) {
        mod.UnspawnObject(state.previewVfx);
        state.previewVfx = undefined;
    }
    if (state.previewTrailVfx) {
        mod.UnspawnObject(state.previewTrailVfx);
        state.previewTrailVfx = undefined;
    }
    if (state.blockedWarnIcon) {
        mod.UnspawnObject(state.blockedWarnIcon);
        state.blockedWarnIcon = undefined;
    }
    if (state.chargeAlertIcon) {
        mod.EnableWorldIconImage(state.chargeAlertIcon, false);
        mod.EnableWorldIconText(state.chargeAlertIcon, false);
        mod.UnspawnObject(state.chargeAlertIcon);
        state.chargeAlertIcon = undefined;
    }
    state.previewScanActive = false;
    state.previewScanId++;
    setLeapCamera(player, state, mod.Cameras.FirstPerson);

    LEAP_STATES.delete(objId);
}

/** Cleanup variant that works with just an objId (for OnPlayerUndeploy) */
function CleanupLeapStateByObjId(objId: number): void {
    const state = LEAP_STATES.get(objId);
    if (!state) return;

    if (state.statusContainerWidget) mod.DeleteUIWidget(state.statusContainerWidget);
    if (state.chargeVfx) {
        mod.UnspawnObject(state.chargeVfx);
        state.chargeVfx = undefined;
        state.chargeVfxState = 'none';
    }
    if (state.chargingSfx) {
        mod.UnspawnObject(state.chargingSfx);
        state.chargingSfx = undefined;
    }
    if (state.chargeReadySfx) {
        mod.UnspawnObject(state.chargeReadySfx);
        state.chargeReadySfx = undefined;
    }
    stopLeapVehicleWarningLoop(state);
    if (state.leapLandingVfx) {
        mod.UnspawnObject(state.leapLandingVfx);
        state.leapLandingVfx = undefined;
    }
    if (state.hitVfx) {
        mod.UnspawnObject(state.hitVfx);
        state.hitVfx = undefined;
    }
    if (state.leapStartSfx) {
        mod.UnspawnObject(state.leapStartSfx);
        state.leapStartSfx = undefined;
    }
    if (state.previewVfx) {
        mod.UnspawnObject(state.previewVfx);
        state.previewVfx = undefined;
    }
    if (state.previewTrailVfx) {
        mod.UnspawnObject(state.previewTrailVfx);
        state.previewTrailVfx = undefined;
    }
    if (state.blockedWarnIcon) {
        mod.UnspawnObject(state.blockedWarnIcon);
        state.blockedWarnIcon = undefined;
    }
    if (state.chargeAlertIcon) {
        mod.EnableWorldIconImage(state.chargeAlertIcon, false);
        mod.EnableWorldIconText(state.chargeAlertIcon, false);
        mod.UnspawnObject(state.chargeAlertIcon);
        state.chargeAlertIcon = undefined;
    }
    state.previewScanActive = false;
    state.previewScanId++;

    LEAP_STATES.delete(objId);
}

function resetLeapChargeState(state: LeapState, preserveCrouchHold: boolean = false): void {
    if (state.chargeVfx) {
        mod.UnspawnObject(state.chargeVfx);
        state.chargeVfx = undefined;
    }
    if (state.chargingSfx) {
        mod.UnspawnObject(state.chargingSfx);
        state.chargingSfx = undefined;
    }
    if (state.chargeReadySfx) {
        mod.UnspawnObject(state.chargeReadySfx);
        state.chargeReadySfx = undefined;
    }
    stopLeapVehicleWarningLoop(state);
    state.chargeVfxState = 'none';
    if (!preserveCrouchHold) {
        state.crouchStartTime = 0;
    }

    // Cancel trajectory scan and clear all cached path data.
    if (state.previewScanActive || state.previewVfx || state.previewTrailVfx || state.blockedWarnIcon || state.chargeAlertIcon) {
        cancelTrajectoryPreview(state);
    }
    state.cachedStepPositions = undefined;
    state.cachedGeometryCollisionStep = -1;
    state.cachedGeometryCollisionPos = undefined;
}

function TickLeap(player: mod.Player): void {
    const objId = mod.GetObjId(player);
    const state = LEAP_STATES.get(objId);
    if (!state) {
        LogLeapRuntime(`tick_no_state_${objId}`, `TickLeap skip no state | player=${objId}`);
        return;
    }

    if (!IsLeapAttackAvailableNow(player)) {
        LogLeapRuntime(
            `tick_gate_unavailable_${objId}`,
            `TickLeap skip unavailable | player=${objId} map=${CURRENT_MAP ?? 'undefined'} test=${LEAP_TEST_MODE}`
        );
        resetLeapChargeState(state);
        return;
    }

    if (!mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive)) {
        LogLeapRuntime(`tick_not_alive_${objId}`, `TickLeap skip not alive | player=${objId}`);
        return;
    }
    if (mod.GetSoldierState(player, mod.SoldierStateBool.IsInVehicle)) {
        LogLeapRuntime(`tick_in_vehicle_${objId}`, `TickLeap skip in vehicle | player=${objId}`);
        return;
    }
    const playerProfile = PlayerProfile.Get(player);
    if (!IsPlayerOnInfectedTeamForLeap(player, playerProfile)) {
        const teamObjId = mod.GetObjId(mod.GetTeam(player));
        LogLeapRuntime(
            `tick_team_gate_${objId}`,
            `TickLeap skip team gate | player=${objId} teamObjId=${teamObjId} infectedTeamObjId=${mod.GetObjId(INFECTED_TEAM)} ppInfected=${playerProfile?.isInfectedTeam} test=${LEAP_TEST_MODE}`
        );
        return;
    }
    const isFiring = mod.GetSoldierState(player, mod.SoldierStateBool.IsFiring);
    const isCrouching = mod.GetSoldierState(player, mod.SoldierStateBool.IsCrouching);
    const now = Date.now() / 1000;

    // Track crouch hold time
    if (isCrouching) {
        if (state.crouchStartTime === 0) {
            state.crouchStartTime = now;
        }
    } else {
        state.crouchStartTime = 0;
    }

    // Compute crouch charge progress
    const crouchHeld = state.crouchStartTime > 0 ? now - state.crouchStartTime : 0;
    // Buffer window: ignore first LEAP_CHARGE_BUFFER_SECONDS to allow slide mechanic to fire uninterrupted
    const isEngaged = crouchHeld >= LEAP_CHARGE_BUFFER_SECONDS;
    const crouchReady = crouchHeld >= LEAP_CROUCH_HOLD_SECONDS;
    LogLeapRuntime(
        `tick_status_${objId}`,
        `TickLeap status | player=${objId} crouch=${isCrouching} fire=${isFiring} held=${crouchHeld.toFixed(2)} engaged=${isEngaged} ready=${crouchReady} chargeState=${state.chargeVfxState} blocked=${state.previewIsBlocked}`,
        0.5
    );

    // Charge VFX at player location
    const playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    const chargeVfxPos = mod.Add(playerPos, mod.Multiply(mod.UpVector(), 0.5));
    if (isCrouching && !state.isLeaping) {
        if (isEngaged) {
            if (crouchReady && state.chargeVfxState !== 'ready') {
                // Transition to ready: stop charging SFX, play ready SFX, swap VFX
                if (state.chargingSfx) {
                    mod.UnspawnObject(state.chargingSfx);
                    state.chargingSfx = undefined;
                }
                const readySfx = mod.SpawnObject(
                    mod.RuntimeSpawn_Common.SFX_GameModes_Gauntlet_Mission_Wreckage_ActiveBombNearby_OneShot3D,
                    playerPos, ZERO_VEC
                );
                mod.PlaySound(readySfx, 1);
                state.chargeReadySfx = readySfx;
                if (state.chargeVfx) {
                    mod.UnspawnObject(state.chargeVfx);
                    state.chargeVfx = undefined;
                }
                const readyVfx = mod.SpawnObject(
                    mod.RuntimeSpawn_Common.FX_RepairTool_Sparks_Damage,
                    chargeVfxPos, ZERO_VEC, mod.CreateVector(1, 1, 1)
                ) as mod.VFX;
                mod.EnableVFX(readyVfx, true);
                state.chargeVfx = readyVfx;
                state.chargeVfxState = 'ready';
            } else if (!crouchReady && state.chargeVfxState !== 'charging') {
                // Just entered charging state: blinking MPAPS indicator, kick off the timed preview trail
                if (state.chargeVfx) {
                    mod.UnspawnObject(state.chargeVfx);
                    state.chargeVfx = undefined;
                }
                const chargeVfx = mod.SpawnObject(
                    mod.RuntimeSpawn_Common.FX_Gadget_MPAPS_Lights_Active,
                    playerPos, ZERO_VEC, mod.CreateVector(1, 1, 1)
                ) as mod.VFX;
                mod.EnableVFX(chargeVfx, true);
                state.chargeVfx = chargeVfx;
                state.chargeVfxState = 'charging';
                startTrajectoryPreview(player, state);
                // Start a charging SFX at the player
                const chargingSfx2D = mod.RuntimeSpawn_Common.SFX_UI_Notification_SectorBonus_ProgressBarFillingUp_OneShot2D;
                if (!state.chargingSfx) {
                    const chargeSfxObj = mod.SpawnObject(
                        chargingSfx2D,
                        playerPos, ZERO_VEC
                    );
                    mod.PlaySound(chargeSfxObj, 1, player);
                    state.chargingSfx = chargeSfxObj;
                }
            }
            // Move existing charge VFX to follow the player
            if (state.chargeVfx) {
                mod.MoveVFX(
                    state.chargeVfx,
                    !crouchReady && state.chargeVfxState === 'charging' ? playerPos : chargeVfxPos,
                    ZERO_VEC
                );
            }
        } else {
            // During the slide-protection buffer, clear charge VFX/SFX but keep hold timing alive.
            resetLeapChargeState(state, true);
        }
    } else {
        // Not crouching or currently leaping -- full reset
        resetLeapChargeState(state);
    }

    const shouldBroadcastVehicleLeapWarning =
        !state.isLeaping && (state.chargeVfxState === 'charging' || state.chargeVfxState === 'ready');
    if (shouldBroadcastVehicleLeapWarning) {
        syncLeapVehicleWarningLoop(playerPos, state);
    } else {
        stopLeapVehicleWarningLoop(state);
    }

    // Leap activation: crouch held long enough + fire
    if (state.isLeaping) {
        LogLeapRuntime(`tick_already_leaping_${objId}`, `TickLeap activation blocked already leaping | player=${objId}`);
        return;
    }
    if (!crouchReady || !isFiring) {
        LogLeapRuntime(
            `tick_activation_not_ready_${objId}`,
            `TickLeap activation waiting | player=${objId} crouchReady=${crouchReady} firing=${isFiring}`,
            0.5
        );
        return;
    }
    if (state.previewIsBlocked) {
        LogLeapRuntime(`tick_activation_blocked_${objId}`, `TickLeap activation blocked by preview collision | player=${objId}`);
        return;
    }

    LogLeapRuntime(`tick_execute_${objId}`, `TickLeap executeLeap fired | player=${objId}`, 0.2);

    executeLeap(player, state);
}

// ============================================================
// LEAP RAYCAST EVENT HANDLERS
// ============================================================

function HandleLeapRayCastHit(
    eventPlayer: mod.Player,
    eventPoint: mod.Vector,
    eventNormal: mod.Vector
): void {
    const objId = mod.GetObjId(eventPlayer);
    const state = LEAP_STATES.get(objId);

    const playerPos = mod.GetSoldierState(eventPlayer, mod.SoldierStateVector.GetPosition);
    const hitDist = mod.DistanceBetween(playerPos, eventPoint);

    // Ignore self-hits (widened to handle crouching + moving player capsule)
    if (hitDist < 1.5) return;

    if (state) {
        state.rayHitPoint = eventPoint;
        state.rayHitDist = hitDist;
    }
}

function HandleLeapRayCastMissed(eventPlayer: mod.Player): void {
    const state = LEAP_STATES.get(mod.GetObjId(eventPlayer));

    if (state) {
        state.rayHitPoint = undefined;
        state.rayHitDist = 0;
    }
}

// ============================================================
// END LEAP ATTACK SYSTEM
// ============================================================

//////////////////////////////////////////////////////////////////
///////---------------- GAME FUNCTIONS -----------------//////////
//////////////////////////////////////////////////////////////////

export async function OnAIMoveToFailed(eventPlayer: mod.Player) {
    if (!PlayerIsAliveAndValid(eventPlayer)) return;
    const teamObjId = mod.GetObjId(mod.GetTeam(eventPlayer));
    if (teamObjId === mod.GetObjId(SURVIVOR_TEAM)) {
        console.log(`OnAIMoveToFailed | Survivor Bot(${mod.GetObjId(eventPlayer)}) move to failed - reverting to idle behavior`);
        mod.AIIdleBehavior(eventPlayer);
    } else {
        const slot = InfectedBotSlot.GetByObjID(mod.GetObjId(eventPlayer));
        if (!slot) {
            // when can this happen? never?
            console.log(`OnAIMoveToFailed | Infected Bot(${mod.GetObjId(eventPlayer)}) missing slot - reverting to idle behavior`);
            mod.AIIdleBehavior(eventPlayer);
            return;
        }

        EnsureInfectedBotMoveSpeed(slot, eventPlayer, mod.MoveSpeed.Sprint);

        const moveFailCount = (slot.tick.moveFailCount ?? 0) + 1;
        LogBotLifecycle(slot, 'OnAIMoveToFailed Called', `count=${moveFailCount}`);
        StopInfectedBotMeleeAttack(slot, eventPlayer);

        slot.tick.moveFailCount = moveFailCount;
        if (!slot.tick.lifecycleFirstMoveFailLogged) {
            slot.tick.lifecycleFirstMoveFailLogged = true;
            LogBotLifecycle(slot, 'first_move_fail_callback', `count=${moveFailCount} behavior=${slot.tick.behavior ?? 'unknown'}`);
        }

        if (moveFailCount === 1) {
            console.log(`OnAIMoveToFailed | Infected Bot(${mod.GetObjId(eventPlayer)}) failure #1 - battlefield behavior for ${AI_MOVE_FAILURE_RECOVERY_SECONDS}s before normal tick resumes`);
            slot.tick.moveFailHoldUntil = Date.now() / 1000 + AI_MOVE_FAILURE_RECOVERY_SECONDS;
            return;
        }

        if (moveFailCount >= 3) {
            console.log(`OnAIMoveToFailed | Infected Bot(${mod.GetObjId(eventPlayer)}) failure #${moveFailCount} - repeating battlefield behavior for ${AI_MOVE_FAILURE_RECOVERY_SECONDS}s before normal tick resumes`);
            mod.AIBattlefieldBehavior(eventPlayer);
            EnsureInfectedBotMoveSpeed(slot, eventPlayer, mod.MoveSpeed.Sprint);
            slot.tick.moveFailHoldUntil = Date.now() / 1000 + AI_MOVE_FAILURE_RECOVERY_SECONDS * slot.tick.moveFailCount;
            return;
        }
    }
}

export async function OnSpawnerSpawned(eventPlayer: mod.Player, eventSpawner: mod.Spawner) {
    // Need a delay here to allow the engine to completely spawn the bot. 
    // Too long, and an Infected bot will immediately fire its sniper rifle.
    await mod.Wait(0.25);
    if (!Helpers.HasValidObjId(eventPlayer)) return;
    mod.AISetMoveSpeed(eventPlayer, mod.MoveSpeed.Sprint);
    const isAISoldier = SafeIsAISoldier(eventPlayer);
    if (!isAISoldier ||
        GameHandler.gameState === GameState.EndOfRound) {
        if (!LEAP_TEST_MODE) return;
    }

    if (LEAP_TEST_MODE) {
        LeapTestHarness.onBotSpawned(eventPlayer, mod.GetObjId(eventSpawner));
        return;
    }
    AISpawnHandler.OnBotSpawnFromSpawner(eventPlayer, mod.GetObjId(eventSpawner));
    mod.SetUnspawnDelayInSeconds(eventSpawner, 1.5);
}

export function OnPlayerInteract(eventPlayer: mod.Player, eventObject: mod.Object) {

    if (LEAP_TEST_MODE) {
        LeapTestHarness.onInteract(eventPlayer, eventObject);
        return;
    }

    const playerProfile = PlayerProfile.Get(eventPlayer);
    if (RESUPPLY_INTERACT_POINTS.includes(mod.GetObjId(eventObject)) && GameHandler.gameState == GameState.GameRoundIsRunning) {
        try {
            // Resupply points no longer care which weapon is actively held -- every primary,
            // sidearm and gadget the player currently has in their round loadout is topped up in
            // one interaction. One notification is queued per item that actually gained ammo;
            // items that were already full are silently skipped.
            type ResupplyGrant = { kind: 'primary' | 'sidearm' | 'gadget'; rounds: number; message: mod.Message };
            const grants: Array<ResupplyGrant> = [];
            const loadout = playerProfile ? Weapons.GetRoundLoadout(playerProfile) : [];

            const primaryItem = loadout.find(item => item?.inventorySlot === InventorySlot.Primary);
            const primaryAmmoInfo = primaryItem ? Weapons.GetAmmoForItem(primaryItem) : undefined;
            if (primaryAmmoInfo) {
                const currentPrimaryAmmo = mod.GetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.PrimaryWeapon);
                if (currentPrimaryAmmo < primaryAmmoInfo.reserveMax) {
                    // clamp the resupply number to avoid oversupplying
                    const roundsToSupply = Math.min(primaryAmmoInfo.resupplyAmount, Math.max(0, primaryAmmoInfo.reserveMax - currentPrimaryAmmo));
                    if (roundsToSupply > 0) {
                        mod.SetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.PrimaryWeapon, roundsToSupply + currentPrimaryAmmo);
                        grants.push({ kind: 'primary', rounds: roundsToSupply, message: MakeMessage(mod.stringkeys.primary_ammo_up, roundsToSupply) });
                        console.log(`Resupply interacted: Primary ammo | Rounds Supplied:${roundsToSupply}`);
                    }
                }
            }

            const sidearmItem = loadout.find(item => item?.inventorySlot === InventorySlot.Sidearm);
            const sidearmAmmoInfo = sidearmItem ? Weapons.GetAmmoForItem(sidearmItem) : undefined;
            if (sidearmAmmoInfo) {
                const currentSidearmAmmo = mod.GetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.SecondaryWeapon);
                if (currentSidearmAmmo < sidearmAmmoInfo.reserveMax) {
                    // clamp the resupply number to avoid oversupplying
                    const roundsToSupply = Math.min(sidearmAmmoInfo.resupplyAmount, Math.max(0, sidearmAmmoInfo.reserveMax - currentSidearmAmmo));
                    if (roundsToSupply > 0) {
                        mod.SetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.SecondaryWeapon, roundsToSupply + currentSidearmAmmo);
                        grants.push({ kind: 'sidearm', rounds: roundsToSupply, message: MakeMessage(mod.stringkeys.sidearm_ammo_up, roundsToSupply) });
                        console.log(`Resupply interacted: Secondary ammo | Rounds Supplied:${roundsToSupply}`);
                    }
                }
            }

            // Gadget slots are evaluated independently so a notification only appears for
            // whichever slot(s) actually needed and received a top-up. Gadgets with a catalog
            // entry (Weapons.gadgetAmmoProfiles) resupply explicitly using the same clamp-to-max
            // pattern as the primary/sidearm blocks above. Gadgets with no catalog entry (prop
            // spawner, decoy) fall back to the native resupply call + before/after diff, same as
            // before.
            const gadgetItem = loadout.find(item => item?.inventorySlot === InventorySlot.Gadget);
            const gadgetSecondaryItem = loadout.find(item => item?.inventorySlot === InventorySlot.GadgetSecondary);

            if (gadgetItem) {
                const gadgetProfile = Weapons.GetAmmoForGadget(gadgetItem);
                if (gadgetProfile?.kind === 'chamber') {
                    // Chamber/tube gadgets only top up the reserve here, same as primary/sidearm
                    // resupply above -- the tube/mag itself is left alone (matches how weapon
                    // resupply never touches what's currently chambered/loaded).
                    const reserveMax = gadgetProfile.magSize * gadgetProfile.reserveMags;
                    const resupplyAmount = gadgetProfile.magSize * gadgetProfile.resupplyMags;
                    const currentReserve = mod.GetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.GadgetOne);
                    if (currentReserve < reserveMax) {
                        const roundsToSupply = Math.min(resupplyAmount, Math.max(0, reserveMax - currentReserve));
                        if (roundsToSupply > 0) {
                            mod.SetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.GadgetOne, roundsToSupply + currentReserve);
                            // Verify what actually landed instead of trusting the requested delta --
                            // if the engine clamps the set call (as it does for gadgets whose real
                            // cap is lower than our catalog assumes), the notification must reflect
                            // that, not the number we asked for.
                            const actualReserve = mod.GetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.GadgetOne);
                            const actualGained = actualReserve - currentReserve;
                            if (actualGained > 0) {
                                grants.push({ kind: 'gadget', rounds: actualGained, message: MakeMessage(mod.stringkeys.gadget_ammo_up, actualGained) });
                            }
                            console.log(`Resupply interacted: Gadget reserve ammo | Rounds Requested:${roundsToSupply} Actual:${actualGained}`);
                        }
                    }
                } else if (gadgetProfile) {
                    const currentGadgetOne = mod.GetInventoryAmmo(eventPlayer, mod.InventorySlots.GadgetOne);
                    const roundsToSupply = Math.min(gadgetProfile.resupplyAmount, Math.max(0, gadgetProfile.maxCharges - currentGadgetOne));
                    if (roundsToSupply > 0) {
                        mod.SetInventoryAmmo(eventPlayer, mod.InventorySlots.GadgetOne, currentGadgetOne + roundsToSupply);
                        // Same verification as above -- don't trust the requested delta.
                        const actualGadgetOne = mod.GetInventoryAmmo(eventPlayer, mod.InventorySlots.GadgetOne);
                        const actualGained = actualGadgetOne - currentGadgetOne;
                        if (actualGained > 0) {
                            grants.push({ kind: 'gadget', rounds: actualGained, message: MakeMessage(mod.stringkeys.gadget_ammo_up, actualGained) });
                        }
                        console.log(`Resupply interacted: Gadget ammo | Charges Requested:${roundsToSupply} Actual:${actualGained}`);
                    }
                } else {
                    const beforeGadgetOne = mod.GetInventoryAmmo(eventPlayer, mod.InventorySlots.GadgetOne);
                    mod.Resupply(eventPlayer, mod.ResupplyTypes.SupplyBag);
                    const gainedGadgetOne = mod.GetInventoryAmmo(eventPlayer, mod.InventorySlots.GadgetOne) - beforeGadgetOne;
                    if (gainedGadgetOne > 0) {
                        grants.push({ kind: 'gadget', rounds: gainedGadgetOne, message: MakeMessage(mod.stringkeys.gadget_ammo_up, gainedGadgetOne) });
                        console.log(`Resupply interacted: Gadget ammo | Charges Supplied:${gainedGadgetOne}`);
                    }
                }
            }

            if (gadgetSecondaryItem) {
                const gadgetSecondaryProfile = Weapons.GetAmmoForGadget(gadgetSecondaryItem);
                if (gadgetSecondaryProfile?.kind === 'chamber') {
                    const reserveMax = gadgetSecondaryProfile.magSize * gadgetSecondaryProfile.reserveMags;
                    const resupplyAmount = gadgetSecondaryProfile.magSize * gadgetSecondaryProfile.resupplyMags;
                    const currentReserve = mod.GetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.GadgetTwo);
                    if (currentReserve < reserveMax) {
                        const roundsToSupply = Math.min(resupplyAmount, Math.max(0, reserveMax - currentReserve));
                        if (roundsToSupply > 0) {
                            mod.SetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.GadgetTwo, roundsToSupply + currentReserve);
                            const actualReserve = mod.GetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.GadgetTwo);
                            const actualGained = actualReserve - currentReserve;
                            if (actualGained > 0) {
                                grants.push({ kind: 'gadget', rounds: actualGained, message: MakeMessage(mod.stringkeys.gadget_ammo_up, actualGained) });
                            }
                            console.log(`Resupply interacted: Gadget reserve ammo | Rounds Requested:${roundsToSupply} Actual:${actualGained}`);
                        }
                    }
                } else if (gadgetSecondaryProfile) {
                    const currentGadgetTwo = mod.GetInventoryAmmo(eventPlayer, mod.InventorySlots.GadgetTwo);
                    const roundsToSupply = Math.min(gadgetSecondaryProfile.resupplyAmount, Math.max(0, gadgetSecondaryProfile.maxCharges - currentGadgetTwo));
                    if (roundsToSupply > 0) {
                        mod.SetInventoryAmmo(eventPlayer, mod.InventorySlots.GadgetTwo, currentGadgetTwo + roundsToSupply);
                        const actualGadgetTwo = mod.GetInventoryAmmo(eventPlayer, mod.InventorySlots.GadgetTwo);
                        const actualGained = actualGadgetTwo - currentGadgetTwo;
                        if (actualGained > 0) {
                            grants.push({ kind: 'gadget', rounds: actualGained, message: MakeMessage(mod.stringkeys.gadget_ammo_up, actualGained) });
                        }
                        console.log(`Resupply interacted: Gadget ammo | Charges Requested:${roundsToSupply} Actual:${actualGained}`);
                    }
                } else {
                    const beforeGadgetTwo = mod.GetInventoryAmmo(eventPlayer, mod.InventorySlots.GadgetTwo);
                    mod.Resupply(eventPlayer, mod.ResupplyTypes.SupplyBag);
                    const gainedGadgetTwo = mod.GetInventoryAmmo(eventPlayer, mod.InventorySlots.GadgetTwo) - beforeGadgetTwo;
                    if (gainedGadgetTwo > 0) {
                        grants.push({ kind: 'gadget', rounds: gainedGadgetTwo, message: MakeMessage(mod.stringkeys.gadget_ammo_up, gainedGadgetTwo) });
                        console.log(`Resupply interacted: Gadget ammo | Charges Supplied:${gainedGadgetTwo}`);
                    }
                }
            }

            if (grants.length === 0) {
                if (mod.IsInventorySlotActive(eventPlayer, mod.InventorySlots.MeleeWeapon)) {
                    // Melee-only loadouts (e.g. infected) have nothing a resupply point can grant.
                    Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, eventPlayer);
                    playerProfile?.ShowAmmoFeedback(false, 0, MakeMessage(mod.stringkeys.infected_resupply_attempt));
                } else {
                    // Everything the player has is already full.
                    Helpers.PlaySoundFX(SFX_AMMO_FULL, 1, eventPlayer);
                    playerProfile?.ShowAmmoFeedback(false, 0);
                }
            } else if (grants.length === 1) {
                // Single-item case keeps the existing single-notification behavior/format.
                const grant = grants[0];
                if (grant.kind === 'primary') {
                    playerProfile?.ShowAmmoFeedback(true, grant.rounds);
                } else if (grant.kind === 'sidearm') {
                    playerProfile?.ShowAmmoFeedback(false, grant.rounds);
                } else {
                    playerProfile?.ShowAmmoFeedback(false, 0, grant.message);
                }
            } else {
                playerProfile?.ShowStackedResupplyFeedback(grants.map(g => g.message));
            }
        } catch { }
    }
    if (playerProfile?.isInfectedTeam) {
        TeleportPlayerOnInteract(eventPlayer, eventObject);
    }
}

export async function OnPlayerJoinGame(eventPlayer: mod.Player) {
    await mod.Wait(0.25);
    if (Helpers.HasValidObjId(eventPlayer)) {
        if (SafeIsAISoldier(eventPlayer)) {
            // bots get their own logic in OnSpawnerSpawned
            return;
        }

        if (PlayerProfile.isValidPlayer(eventPlayer)) {
            console.log(`Human Player(${mod.GetObjId(eventPlayer)}) joined the game!`);
            const playerProfile = PlayerProfile.Get(eventPlayer);
            mod.EnablePlayerDeploy(eventPlayer, false);
            if (playerProfile) {
                playerProfile.survived = 0;
                playerProfile.kills = 0;
                playerProfile.deaths = 0;
                playerProfile.infected = 0;
                playerProfile.UpdatePlayerScoreboard();
            }

            if (BOT_SURVIVAL_TEST_MODE) {
                mod.EnablePlayerDeploy(eventPlayer, true);
                ApplyBotSurvivalTestLMSForSurvivor(eventPlayer);
                GameHandler.RecalculateCounts();
                GameHandler.RebuildPlayerLists();
                return;
            }

            if (GameHandler.gameState === GameState.PreGame
                || GameHandler.gameState === GameState.GameStartCountdown
                || GameHandler.gameState === GameState.EndOfRound) {
                await mod.Wait(2);
                if (Helpers.HasValidObjId(eventPlayer)
                    && SafeGetSoldierStateBool(eventPlayer, mod.SoldierStateBool.IsAlive)) {
                    mod.SetRedeployTime(eventPlayer, PLAYER_REDEPLOY_TIME);
                    mod.UndeployPlayer(eventPlayer);
                }
                if (mod.GetObjId(mod.GetTeam(eventPlayer)) !== mod.GetObjId(mod.GetTeam(1))) {
                    mod.SetTeam(eventPlayer, mod.GetTeam(1));
                    if (playerProfile) {
                        // Ensure profile is marked as survivor when assigning between rounds
                        playerProfile.isInfectedTeam = false;
                    }
                }

            }
            if (GameHandler.gameState == GameState.GameRoundIsRunning) {
                console.log(`Round is in progress. Setting join-in-progress player to infected team.`);
                await mod.Wait(2);
                playerProfile?.ConvertHumanSurvivorToInfected(eventPlayer);
                console.log(`OnPlayerJoinGame | Mid-round join assigned to infected -> infectedCount: ${GameHandler.infectedCount}`);
            }

            GameHandler.RecalculateCounts();
            GameHandler.RebuildPlayerLists();
        }

    }
}

export async function OnPlayerLeaveGame(playerObjID: number) {
    if (ShouldTrackVehicleDistanceWorldIcon()) {
        LeapTestHarness.onHumanUndeployed(playerObjID);
    }

    CleanupVL7TransitionState(playerObjID);

    // Check if this is a dead infected bot's body being cleaned up by the spawner unspawn timer.
    // HandleDeath registers the ObjID here so we start the respawn only after the spawner is free.
    const deadInfectedSlot = InfectedBotSlot.deadByObjID.get(playerObjID);
    if (deadInfectedSlot) {
        InfectedBotSlot.deadByObjID.delete(playerObjID);
        CleanupBotTargetWorldIcon(playerObjID, 'OnPlayerLeaveGame');
        console.log(`OnPlayerLeaveGame | Infected body cleaned up Player(${playerObjID}) [${deadInfectedSlot.name}] -> starting respawn timer`);
        if (deadInfectedSlot.state === BotSlotState.DeadAwaitingRespawn &&
            GameHandler.gameState === GameState.GameRoundIsRunning) {
            deadInfectedSlot.startRespawnTimer();
        } else if (deadInfectedSlot.state === BotSlotState.DeadAwaitingRespawn) {
            // Round ended before body cleanup; release the slot.
            deadInfectedSlot.state = BotSlotState.Idle;
            deadInfectedSlot.respawnDueAt = undefined;
        }
        return;
    }

    const pp = PlayerProfile._allPlayers.get(playerObjID);

    const activeInfectedSlot = InfectedBotSlot.GetByObjID(playerObjID);
    if (activeInfectedSlot && activeInfectedSlot.state === BotSlotState.Alive) {
        // Only suppress if the bot is genuinely still alive. If it isn't, OnPlayerDied
        // failed to fire (engine edge case) and this leave event is the death notification.
        if (activeInfectedSlot.player && PlayerIsAliveAndValid(activeInfectedSlot.player)) {
            console.log(`OnPlayerLeaveGame | Ignoring stale leave event for active infected slot Player(${playerObjID}) [${activeInfectedSlot.name}]`);
            return;
        }
        console.log(`OnPlayerLeaveGame | Bot Player(${playerObjID}) [${activeInfectedSlot.name}] dead on leave; calling HandleDeath as fallback.`);
        activeInfectedSlot.HandleDeath();
        return;
    }
    const activeSurvivorSlot = SurvivorBotSlot.GetByObjID(playerObjID);
    if (activeSurvivorSlot && activeSurvivorSlot.state === BotSlotState.Alive) {
        if (activeSurvivorSlot.player && PlayerIsAliveAndValid(activeSurvivorSlot.player)) {
            console.log(`OnPlayerLeaveGame | Ignoring stale leave event for active survivor slot Player(${playerObjID}) [${activeSurvivorSlot.name}]`);
            return;
        }
        console.log(`OnPlayerLeaveGame | Survivor bot Player(${playerObjID}) [${activeSurvivorSlot.name}] dead on leave; calling HandleDeath as fallback.`);
        activeSurvivorSlot.HandleDeath(false);
        return;
    }

    CleanupPlayerOngoingVisuals(playerObjID);
    let shouldRefreshTeamCounts = false;
    if (pp) {
        if (!pp.isAI) {
            shouldRefreshTeamCounts = true;
            if (pp.isInfectedTeam) {
                GameHandler.infectedCount = Math.max(0, GameHandler.infectedCount - 1);
                console.log(`OnPlayerLeaveGame | Human infected left (${playerObjID}) -> infectedCount: ${GameHandler.infectedCount}`);
            }
        }
    }
    if (shouldRefreshTeamCounts) {
        GameHandler.RecalculateCounts();
        ScoreboardUI.GlobalUpdate(TeamNameString.Both);
    }

    if (pp) {
        PlayerProfile.RemovePlayerProfile(playerObjID);
    }
    GameHandler.RebuildPlayerLists();

}

export async function OnPlayerDeployed(eventPlayer: mod.Player) {
    if (Helpers.HasValidObjId(eventPlayer)) {
        const isAISoldier = SafeIsAISoldier(eventPlayer);
        if (BOT_SURVIVAL_TEST_MODE) {
            if (isAISoldier) {
                return;
            }
            const playerProfile = PlayerProfile.Get(eventPlayer);
            const wasInitialSpawn = playerProfile?.isInitialSpawn ?? true;
            if (playerProfile) {
                playerProfile.isInfectedTeam = false;
                playerProfile.isAlphaInfected = false;
                playerProfile.isLastManStanding = true;
            }
            if (mod.GetObjId(mod.GetTeam(eventPlayer)) !== mod.GetObjId(SURVIVOR_TEAM)) {
                mod.SetTeam(eventPlayer, SURVIVOR_TEAM);
            }
            await PlayerProfile.CustomOnPlayerDeployed(eventPlayer);
            ApplyBotSurvivalTestLMSForSurvivor(eventPlayer);
            if (BOT_SURVIVAL_TEST_ICONS) {
                LeapTestHarness.startVehicleDistanceTracking(eventPlayer);
            }
            if (!wasInitialSpawn) {
                BotSurvivalTestHarness.requestRestart(`Player(${mod.GetObjId(eventPlayer)}) redeployed`);
            }
            return;
        }
        if (LEAP_TEST_MODE) {
            if (!isAISoldier) {
                await PlayerProfile.CustomOnPlayerDeployed(eventPlayer);
                LeapTestHarness.onHumanDeployed(eventPlayer);
            }
            return;
        }
        if (GameHandler.gameState === GameState.EndOfRound) {
            // mod.UndeployPlayer(player); // this forces unwanted bots to spawn. DO NOT USE THIS.
            mod.Kill(eventPlayer);
            return;
        }
        if (isAISoldier) {
            return;
        }
        PlayerProfile.CustomOnPlayerDeployed(eventPlayer);
        if (mod.GetObjId(mod.GetTeam(eventPlayer)) === mod.GetObjId(INFECTED_TEAM)) {
            const pp = PlayerProfile.Get(eventPlayer);
            if (pp?.isAlphaInfected) {
                InitLeapSystem(eventPlayer);
            }
        }
    } else {
        console.log(`OnPlayerDeployed "CRITICAL" | Player(${mod.GetObjId(eventPlayer)}) deployed without a valid ObjID!`);
    }
}

export function OnPlayerUndeploy(playerObjId: number) {
    if (ShouldTrackVehicleDistanceWorldIcon()) {
        LeapTestHarness.onHumanUndeployed(playerObjId);
    }

    CleanupVL7TransitionState(playerObjId);

    const undeployedProfile = PlayerProfile._allPlayers.get(playerObjId);
    if (BOT_SURVIVAL_TEST_MODE && undeployedProfile && !undeployedProfile.isAI) {
        BotSurvivalTestHarness.requestRestart(`Player(${playerObjId}) undeployed`);
    }

    CleanupPlayerOngoingVisuals(playerObjId);
    CleanupLeapStateByObjId(playerObjId);
    const undeployedPlayer = PlayerProfile._allPlayers.get(playerObjId)?.player;
    if (undeployedPlayer) {
        PropSpawner.CleanupPlayer(undeployedPlayer);
        DecoySpawner.CleanupPlayer(undeployedPlayer);
        TurretSpawner.CleanupPlayer(undeployedPlayer);
    }
    if (PlayerProfile._deployedPlayers.has(playerObjId)) {
        PlayerProfile.RemoveFromDeployedPlayers(playerObjId);
    }
}

export function OnPlayerDied(eventPlayer: mod.Player, eventOtherPlayer: mod.Player, eventDeathType: mod.DeathType) {
    const playerObjId = mod.GetObjId(eventPlayer);
    if (playerObjId > -1) {
        CleanupVL7TransitionState(playerObjId);
    }

    if (GameHandler.gameState === GameState.EndOfRound) {
        // ignore GH events and automatic team assignments
        console.log('Player was killed by GameHandler. Ignoring...');
        return;
    }

    // _deployedPlayers are *supposed to* only get added outside of EndOfRound
    if (playerObjId > -1) {
        CleanupPlayerOngoingVisuals(playerObjId);
    }
    CleanupLeapSystem(eventPlayer);
    PropSpawner.CleanupPlayer(eventPlayer);
    DecoySpawner.CleanupPlayer(eventPlayer);
    TurretSpawner.CleanupPlayer(eventPlayer);
    BattlePickupCleanup.HandleDeath(eventPlayer);
    if (PlayerProfile._deployedPlayers.has(playerObjId)) {
        PlayerProfile.RemoveFromDeployedPlayers(playerObjId);
    }

    if (Helpers.HasValidObjId(eventPlayer)) {
        const playerObjID = mod.GetObjId(eventPlayer);
        const playerProfile = PlayerProfile.Get(eventPlayer);
        playerProfile?.loadoutDisplayBottom?.Hide();

        // Slot-based bot death handling
        if (SafeIsAISoldier(eventPlayer)) {
            const infectedSlot = InfectedBotSlot.GetByObjID(playerObjID);
            if (infectedSlot) {
                infectedSlot.HandleDeath();
                return;
            }
            const survivorSlot = SurvivorBotSlot.GetByObjID(playerObjID);
            if (survivorSlot) {
                console.log(`OnPlayerDied | Survivor Bot(${playerObjID}) [${survivorSlot.name}] died`);
                if (GameHandler.gameState === GameState.GameRoundIsRunning || GameHandler.gameState === GameState.GameStartCountdown) {
                    if (GameHandler.gameState === GameState.GameRoundIsRunning && !GameHandler.suspendWinChecks) {
                        Helpers.PlaySoundFX(SFX_SURVIVOR_LOST, 1, SURVIVOR_TEAM);
                        Helpers.PlaySoundFX(SFX_POSITIVE, 1, INFECTED_TEAM);
                    }
                    GameHandler.infectedCount = Math.min(INFECTED_COUNT_LIMIT, (GameHandler.infectedCount ?? 0) + 1);
                    if (playerProfile) {
                        playerProfile.isInfectedTeam = true;
                    }
                    const isAlpha = playerProfile?.isAlphaInfected ?? false;
                    survivorSlot.HandleDeath(true, isAlpha);
                    GameHandler.RecalculateCounts();
                    ScoreboardUI.GlobalUpdate(TeamNameString.Both);
                    GameHandler.DisplayUpdatedSurvivorCountNotification();
                    if (GameHandler.survivorsCount === 5) {
                        GameHandler.DisplayGameStateNotification(MakeMessage(mod.stringkeys.final_five));
                    }
                    GameHandler.CheckWinCondition();
                } else {
                    survivorSlot.HandleDeath(false);
                }
                return;
            }
            if (DecoySpawner.HandleDeath(eventPlayer, playerObjID)) {
                // Decoy bot's health reached 0 -- owner is now free to place another.
                return;
            }
            if (TurretSpawner.HandleDeath(eventPlayer, playerObjID)) {
                // Turret bot's health reached 0 -- owner is now on cooldown to place another.
                return;
            }
            console.log(`OnPlayerDied "CRITICAL ERROR" | AI Player(${playerObjID}) died but no slot found!`);
            return;
        }

        const otherPlayerObjID = mod.GetObjId(eventOtherPlayer);
        if (playerObjID === otherPlayerObjID && GameHandler.gameState !== GameState.GameRoundIsRunning) {
            return;
        }


        if (playerProfile && GameHandler.gameState === GameState.GameRoundIsRunning) {
            // perform death/team switch logic only during an active round
            playerProfile.OnDeath();

            if (BOT_SURVIVAL_TEST_MODE) {
                BotSurvivalTestHarness.requestRestart(`Player(${playerObjID}) died`);
                return;
            }

            // playerProfile.UpdateWidgetIcon(true); <- disabled until player status icons are reworked
            if (mod.GetObjId(mod.GetTeam(eventPlayer)) == mod.GetObjId(SURVIVOR_TEAM)) {
                playerProfile.ConvertHumanSurvivorToInfected(eventPlayer, "Death");
                if (mod.GetObjId(eventPlayer) != mod.GetObjId(eventOtherPlayer)) {
                    UI.ShowInfectedByAlert(playerProfile, eventOtherPlayer);
                }
            }
        }
    } else {
        console.log(`OnPlayerDied "WARNING" | Player(${mod.GetObjId(eventPlayer)}) died! | This player did not have a valid ObjID!`);
    }
}

export function OnPlayerDamaged(eventPlayer: mod.Player, eventOtherPlayer: mod.Player, eventDamageType: mod.DamageType,) {
    TurretSpawner.HandleDamaged(eventPlayer); // no-op unless eventPlayer is a tracked turret bot

    const damageDealer = eventOtherPlayer;
    const damageDealerObjId = mod.GetObjId(damageDealer);
    if (SafeIsAISoldier(damageDealer)) return;
    if (InfectedBotSlot.GetByObjID(damageDealerObjId)) return;

    if (mod.GetObjId(mod.GetTeam(damageDealer)) === mod.GetObjId(INFECTED_TEAM)) {
        if (mod.EventDamageTypeCompare(eventDamageType, mod.PlayerDamageTypes.Melee)) {
            const hitSFX = mod.SpawnObject(SFX_MELEE_HIT_FALL_DMG, POSITION_HQ2, ZERO_VEC);
            mod.PlaySound(hitSFX, 1, damageDealer);

            // If the melee target is in a vehicle, deal 100 damage to it and shove it
            if (mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsInVehicle)) {
                const targetVehicle = mod.GetVehicleFromPlayer(eventPlayer);
                mod.DealDamage(targetVehicle, 100);
                ApplyInfectedMeleeVehicleImpulse(damageDealer, targetVehicle);
            }
        }
    } else {
        if (mod.EventDamageTypeCompare(eventDamageType, mod.PlayerDamageTypes.Fire)) {
            mod.DealDamage(eventPlayer, 40, damageDealer);
        } else if (mod.EventDamageTypeCompare(eventDamageType, mod.PlayerDamageTypes.Explosion)) {
            mod.DealDamage(eventPlayer, 500, damageDealer);
        }
    }

}

export function OnPlayerUIButtonEvent(
    eventPlayer: mod.Player,
    eventUIWidget: mod.UIWidget,
    eventUIButtonEvent: mod.UIButtonEvent
) {
    const playerProfile = PlayerProfile.Get(eventPlayer);
    const widgetName = mod.GetUIWidgetName(eventUIWidget);

    // Check if this is a loadout selection button
    if (eventUIButtonEvent === mod.UIButtonEvent.HoverIn || eventUIButtonEvent === mod.UIButtonEvent.FocusIn) {
        Helpers.PlaySoundFX(SFX_LOADOUT_HOVER, 1, eventPlayer);
    }

    // Option-card hover/focus highlight, driven by these events directly rather than the native
    // per-state button colors (mod.AddUIButton's extended overload) -- that overload crashes on
    // click in this engine, confirmed by testing, so CreateOptionCard sticks to the plain
    // short-form button and this handler swaps its bg color/alpha manually instead.
    if (widgetName.includes('loadout_option_btn_')) {
        if (eventUIButtonEvent === mod.UIButtonEvent.HoverIn || eventUIButtonEvent === mod.UIButtonEvent.FocusIn) {
            mod.SetUIWidgetBgColor(eventUIWidget, LoadoutSelectionMenu.cardButtonHoverColor);
            mod.SetUIWidgetBgAlpha(eventUIWidget, LoadoutSelectionMenu.cardButtonHoverAlpha);
        } else if (eventUIButtonEvent === mod.UIButtonEvent.HoverOut || eventUIButtonEvent === mod.UIButtonEvent.FocusOut) {
            mod.SetUIWidgetBgColor(eventUIWidget, LoadoutSelectionMenu.cardButtonRestColor);
            mod.SetUIWidgetBgAlpha(eventUIWidget, 0.9);
        }
    }

    if (widgetName.includes('loadout_option_btn_')) {
        const match = widgetName.match(/loadout_option_btn_(\d+)_/);
        if (match && match[1]) {
            const index = parseInt(match[1], 10);
            if (!isNaN(index)) {
                playerProfile?.loadoutSelectionUI?.SelectOption(index);
                Helpers.PlaySoundFX(SFX_LOADOUT_SELECT, 1, eventPlayer);
            }
        }
    } else if (widgetName.includes('loadout_reroll_btn_')) {
        playerProfile?.loadoutSelectionUI?.UseReroll();
        Helpers.PlaySoundFX(SFX_LOADOUT_REROLL, 1, eventPlayer);
    }
}

export async function OnPlayerEarnedKill(eventPlayer: mod.Player, eventOtherPlayer: mod.Player, eventDeathType: mod.DeathType) {
    const playerProfile = PlayerProfile.Get(eventPlayer);
    const playerObjID = mod.GetObjId(eventPlayer);
    const otherPlayerObjID = mod.GetObjId(eventOtherPlayer);

    if (GameHandler.gameState === GameState.EndOfRound || playerObjID === otherPlayerObjID) {
        return;
    }
    if (playerProfile && GameHandler.gameState === GameState.GameRoundIsRunning) {
        if (mod.GetObjId(mod.GetTeam(eventPlayer)) === mod.GetObjId(INFECTED_TEAM)) {
            if (mod.EventDeathTypeCompare(eventDeathType, mod.PlayerDeathTypes.Melee)) {
                const killRewardSFX = mod.SpawnObject(SFX_MELEE_HIT_ARMR_BRK, POSITION_HQ2, ZERO_VEC);
                const currentHealth = mod.GetSoldierState(eventPlayer, mod.SoldierStateNumber.CurrentHealth);
                const maxHealth = mod.GetSoldierState(eventPlayer, mod.SoldierStateNumber.MaxHealth);
                mod.PlaySound(killRewardSFX, 1, eventPlayer);
                const currThrowableAmmo = mod.GetInventoryAmmo(eventPlayer, mod.InventorySlots.Throwable);
                if (currThrowableAmmo < Weapons.maxThrowablesStandard) {
                    mod.SetInventoryAmmo(eventPlayer, mod.InventorySlots.Throwable, currThrowableAmmo + 1);
                }
                if (currentHealth < maxHealth) {
                    const healthReward = Math.min(maxHealth - currentHealth, HEALTH_RESTORE_ON_INFECTED);
                    mod.Heal(eventPlayer, healthReward);
                }
            }
        }
        // AI bots don't track kill stats
        if (SafeIsAISoldier(eventPlayer)) {
            return;
        }

        if (playerProfile.isInfectedTeam) {
            playerProfile.infected++
            UI.ShowYouInfectedAlert(playerProfile, eventOtherPlayer)
            playerProfile.score += POINTS_PER_SURVIVOR_INFECTED;
        } else {
            playerProfile.kills++;
            playerProfile.score += POINTS_PER_INFECTED_KILL;
            // give LMS max ammo on kill
            if (playerProfile.isLastManStanding) {
                const loadout = Weapons.GetRoundLoadout(playerProfile);
                const primaryItem = loadout.find(item => item?.inventorySlot === InventorySlot.Primary);
                const sidearmItem = loadout.find(item => item?.inventorySlot === InventorySlot.Sidearm);
                const primaryAmmo = primaryItem ? Weapons.GetAmmoForItem(primaryItem) : undefined;
                const sidearmAmmo = sidearmItem ? Weapons.GetAmmoForItem(sidearmItem) : undefined;
                if (primaryAmmo) {
                    mod.SetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.PrimaryWeapon, primaryAmmo.reserveMax);
                }
                if (sidearmAmmo) {
                    mod.SetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.SecondaryWeapon, sidearmAmmo.reserveMax);
                }
            }
        }
        playerProfile.UpdatePlayerScoreboard();
    }
}

export function OnPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger) {
    const areaTriggerObjId = mod.GetObjId(eventAreaTrigger);
    if (mod.GetObjId(mod.GetTeam(eventPlayer)) !== mod.GetObjId(INFECTED_TEAM)) {
        const survivorProfile = PlayerProfile.Get(eventPlayer);
        if (survivorProfile && !survivorProfile.isAI) {
            survivorProfile.showSurvivorRoadWarning = false;
            survivorProfile.DeletePlayerAreaNotificationWidget();
        }
        return;
    }
    const playerProfile = PlayerProfile.Get(eventPlayer);
    if (playerProfile?.isAI) {
        mod.SetPlayerMovementSpeedMultiplier(eventPlayer, playerProfile.isAlphaInfected ? 1.2 : 1);
        const slot = InfectedBotSlot.GetByObjID(mod.GetObjId(eventPlayer));
        if (slot) {
            slot.tick.inAreaTrigger = false;
            slot.tick.lastAreaMoveSpeedMultiplier = undefined;
        }
    }

    if (areaTriggerObjId === LEAP_ATTACK_AREA_TRIGGER_ID && playerProfile) {
        playerProfile.isInLeapAttackArea = false;
        if (playerProfile.isAlphaInfected && !playerProfile.isAI) {
            Helpers.PlaySoundFX(SFX_ALPHA_LEAP_AREA_EXIT_2D, 1, eventPlayer);
        }
    }
}

export async function OnPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger) {
    const areaTriggerObjId = mod.GetObjId(eventAreaTrigger);
    await mod.Wait(0.15);
    if (!Helpers.HasValidObjId(eventPlayer)) return;
    const pp = PlayerProfile.Get(eventPlayer);
    if (areaTriggerObjId === 9091) {
        console.log(`OnPlayerEnterAreaTrigger | Player(${mod.GetObjId(eventPlayer)}) entered vault trigger and is vaulting - "killing player"`);
        pp?.ShowAlphaFeedback(MakeMessage(mod.stringkeys.vault_kill));
        mod.Kill(eventPlayer);
    }
    if (mod.GetObjId(mod.GetTeam(eventPlayer)) !== mod.GetObjId(INFECTED_TEAM)) {
        const survivorProfile = PlayerProfile.Get(eventPlayer);
        if (survivorProfile && !survivorProfile.isAI) {
            survivorProfile.showSurvivorRoadWarning = true;
            survivorProfile.UpdatePlayerAreaNotificationWidget();
        }
        return;
    }


    if (pp?.isAI) {
        const slot = InfectedBotSlot.GetByObjID(mod.GetObjId(eventPlayer));
        if (slot) slot.tick.inAreaTrigger = true;
        ApplyInfectedAIAreaMoveSpeedMultiplier(eventPlayer, slot, pp.currentTarget);
    }

    if (areaTriggerObjId === LEAP_ATTACK_AREA_TRIGGER_ID && pp) {
        pp.isInLeapAttackArea = true;
        if (pp.isAlphaInfected && !pp.isAI) {
            pp.ShowAlphaFeedback(ResolveStringKeyMessage("alpha_leap_available"));
            Helpers.PlaySoundFX(SFX_ALPHA_LEAP_AREA_ENTER_2D, 1, eventPlayer);
        }
    }
}

function EnsureVL7TransitionOverlay(player: mod.Player): mod.UIWidget | undefined {
    if (!Helpers.HasValidObjId(player)) return undefined;
    const playerObjId = mod.GetObjId(player);
    const existingOverlay = VL7_TRANSITION_OVERLAY_BY_PLAYER.get(playerObjId);
    if (existingOverlay) {
        return existingOverlay;
    }

    const componentName = `vl7_transition_overlay_${playerObjId}`;
    mod.AddUIContainer(
        componentName,
        mod.CreateVector(0, 0, 0),
        mod.CreateVector(3840, 1080, 0),
        mod.UIAnchor.Center,
        player,
    );

    const overlay = mod.FindUIWidgetWithName(componentName) as mod.UIWidget | undefined;
    if (!overlay) return undefined;

    mod.SetUIWidgetBgFill(overlay, mod.UIBgFill.Solid);
    mod.SetUIWidgetBgColor(overlay, UI.blackColor);
    mod.SetUIWidgetBgAlpha(overlay, 0);
    mod.SetUIWidgetDepth(overlay, mod.UIDepth.AboveGameUI);
    mod.SetUIWidgetVisible(overlay, false);
    VL7_TRANSITION_OVERLAY_BY_PLAYER.set(playerObjId, overlay);
    return overlay;
}

async function FadeVL7TransitionOverlay(
    player: mod.Player,
    disableScreenEffectAtSeconds?: number,
    overlayColor: mod.Vector = UI.blackColor,
    fadeDurationSeconds: number = VL7_TRANSITION_OVERLAY_FADE_SECONDS,
): Promise<void> {
    if (!Helpers.HasValidObjId(player)) return;
    const playerObjId = mod.GetObjId(player);
    const overlay = EnsureVL7TransitionOverlay(player);
    if (!overlay) return;
    const hasDisableTiming = disableScreenEffectAtSeconds !== undefined;
    let hasAppliedDelayedDisable = !hasDisableTiming;

    const overlayToken = ++VL7_TRANSITION_OVERLAY_TOKEN_COUNTER;
    VL7_TRANSITION_OVERLAY_TOKEN_BY_PLAYER.set(playerObjId, overlayToken);

    mod.SetUIWidgetBgFill(overlay, mod.UIBgFill.Solid);
    mod.SetUIWidgetBgColor(overlay, overlayColor);
    mod.SetUIWidgetBgAlpha(overlay, VL7_TRANSITION_OVERLAY_ALPHA);
    mod.SetUIWidgetDepth(overlay, mod.UIDepth.AboveGameUI);
    mod.SetUIWidgetVisible(overlay, true);

    const steps = Math.max(
        1,
        Math.ceil(fadeDurationSeconds / VL7_TRANSITION_OVERLAY_FADE_STEP_SECONDS),
    );

    for (let i = 1; i <= steps; i++) {
        if (VL7_TRANSITION_OVERLAY_TOKEN_BY_PLAYER.get(playerObjId) !== overlayToken) {
            return;
        }

        if (!hasAppliedDelayedDisable) {
            const elapsedSeconds = (i / steps) * fadeDurationSeconds;
            if (elapsedSeconds >= (disableScreenEffectAtSeconds as number)) {
                mod.EnableScreenEffect(player, mod.ScreenEffects.VL7, false);
                hasAppliedDelayedDisable = true;
            }
        }

        const alpha = VL7_TRANSITION_OVERLAY_ALPHA * (1 - (i / steps));
        mod.SetUIWidgetBgAlpha(overlay, alpha);
        await mod.Wait(VL7_TRANSITION_OVERLAY_FADE_STEP_SECONDS);
    }

    if (VL7_TRANSITION_OVERLAY_TOKEN_BY_PLAYER.get(playerObjId) === overlayToken) {
        if (!hasAppliedDelayedDisable) {
            mod.EnableScreenEffect(player, mod.ScreenEffects.VL7, false);
        }
        mod.SetUIWidgetBgAlpha(overlay, 0);
        mod.SetUIWidgetVisible(overlay, false);
    }
}

function ReleaseVL7TransitionDistortionForPlayer(playerObjId: number): void {
    const distortionVfx = VL7_TRANSITION_DISTORTION_BY_PLAYER.get(playerObjId);
    if (!distortionVfx) return;

    VL7_TRANSITION_DISTORTION_BY_PLAYER.delete(playerObjId);

    try {
        mod.EnableVFX(distortionVfx, false);
    } catch {
        // Best-effort VFX disable.
    }

    try {
        mod.UnspawnObject(distortionVfx);
    } catch {
        // Best-effort object cleanup.
    }
}

async function BeginVL7TransitionDistortionLead(player: mod.Player): Promise<{ playerObjId: number; token: number } | undefined> {
    if (!Helpers.HasValidObjId(player)) return undefined;

    const playerObjId = mod.GetObjId(player);
    const token = ++VL7_TRANSITION_DISTORTION_TOKEN_COUNTER;
    VL7_TRANSITION_DISTORTION_TOKEN_BY_PLAYER.set(playerObjId, token);
    ReleaseVL7TransitionDistortionForPlayer(playerObjId);

    let spawnPosition: mod.Vector;
    try {
        spawnPosition = mod.GetSoldierState(player, mod.SoldierStateVector.EyePosition) as mod.Vector;
    } catch {
        spawnPosition = mod.GetObjectPosition(player);
    }

    const distortionVfx = mod.SpawnObject(
        VL7_TRANSITION_DISTORTION_VFX,
        spawnPosition,
        ZERO_VEC,
        mod.CreateVector(1, 1, 1),
    ) as mod.VFX;

    if (mod.GetObjId(distortionVfx) > -1) {
        VL7_TRANSITION_DISTORTION_BY_PLAYER.set(playerObjId, distortionVfx);
        try {
            mod.EnableVFX(distortionVfx, true);
        } catch {
            // Best-effort VFX enable.
        }
    }

    await mod.Wait(VL7_TRANSITION_DISTORTION_LEAD_SECONDS);
    if (VL7_TRANSITION_DISTORTION_TOKEN_BY_PLAYER.get(playerObjId) !== token) {
        return undefined;
    }

    return { playerObjId, token };
}

function ScheduleVL7TransitionDistortionRelease(playerObjId: number, token: number, delaySeconds: number): void {
    void (async () => {
        await mod.Wait(delaySeconds);
        if (VL7_TRANSITION_DISTORTION_TOKEN_BY_PLAYER.get(playerObjId) !== token) {
            return;
        }
        VL7_TRANSITION_DISTORTION_TOKEN_BY_PLAYER.delete(playerObjId);
        ReleaseVL7TransitionDistortionForPlayer(playerObjId);
    })();
}

function CleanupVL7TransitionState(playerObjId: number): void {
    VL7_TRANSITION_DISTORTION_TOKEN_BY_PLAYER.delete(playerObjId);
    ReleaseVL7TransitionDistortionForPlayer(playerObjId);
    VL7_TRANSITION_OVERLAY_TOKEN_BY_PLAYER.delete(playerObjId);

    const overlay = VL7_TRANSITION_OVERLAY_BY_PLAYER.get(playerObjId);
    if (overlay) {
        VL7_TRANSITION_OVERLAY_BY_PLAYER.delete(playerObjId);
        try {
            mod.DeleteUIWidget(overlay);
        } catch {
            // Best-effort widget cleanup.
        }
    }
}

/**
 * Lean AI tick: called from OngoingPlayer for AI soldiers only.
 * Only infected bots run InfectedBotLogicTick; survivor bots run self-managing AIBattlefieldBehavior.
 */
function OngoingAI(player: mod.Player, playerObjId: number): void {
    const slot = InfectedBotSlot.GetByObjID(playerObjId);
    if (!slot || slot.state !== BotSlotState.Alive) return;

    const now = Date.now() / 1000;
    if (slot.tick.nextTickAt <= 0) {
        slot.tick.nextTickAt = now + AI_BOT_SPAWN_TICK_GRACE_SECONDS;
        return;
    }
    if (now < slot.tick.nextTickAt) return;
    if (!slot.tick.lifecycleFirstOngoingTickLogged) {
        slot.tick.lifecycleFirstOngoingTickLogged = true;
        LogBotLifecycle(slot, 'first_ongoing_ai_tick', `behavior=${slot.tick.behavior ?? 'unknown'}`);
    }
    slot.tick.nextTickAt = now + AI_BOT_TICK_SECONDS;

    InfectedBotLogicTick(slot);
}


/**
 * Plays the gasp SFX and performs a quick overlay fade while toggling survivor VL7 effect.
 */
async function applyVL7TransitionEffect(player: mod.Player, enableVL7: boolean): Promise<void> {
    if (!Helpers.HasValidObjId(player)) return;
    Helpers.PlaySoundFX(SFX_VL7_TRANSITION_GASP, 1, player);

    const distortionPulse = await BeginVL7TransitionDistortionLead(player);
    if (!Helpers.HasValidObjId(player)) return;

    if (enableVL7) {
        mod.EnableScreenEffect(player, mod.ScreenEffects.VL7, true);
        if (distortionPulse) {
            ScheduleVL7TransitionDistortionRelease(
                distortionPulse.playerObjId,
                distortionPulse.token,
                VL7_TRANSITION_DISTORTION_TRAIL_SECONDS,
            );
        }
        await FadeVL7TransitionOverlay(player);
        return;
    }

    if (distortionPulse) {
        ScheduleVL7TransitionDistortionRelease(
            distortionPulse.playerObjId,
            distortionPulse.token,
            VL7_TRANSITION_DISABLE_OVERLAP_SECONDS + VL7_TRANSITION_DISTORTION_TRAIL_SECONDS,
        );
    }

    await FadeVL7TransitionOverlay(
        player,
        VL7_TRANSITION_DISABLE_OVERLAP_SECONDS,
        UI.darkAmberColor,
        VL7_TRANSITION_DISABLE_OVERLAY_FADE_SECONDS,
    );
}

export function OnPlayerEnterVehicle(eventPlayer: mod.Player, eventVehicle: mod.Vehicle) {
    const playersInVehicle = ConvertArray(mod.GetAllPlayersInVehicle(eventVehicle)) as mod.Player[];
    console.log(`OnPlayerEnterVehicle | Player(${mod.GetObjId(eventPlayer)}) attempted to enter a Vehicle(${mod.GetObjId(eventVehicle)})`);
    const playerProfile = PlayerProfile.Get(eventPlayer);
    if (playerProfile) {
        playerProfile.invehicle = true;
    }
    playerProfile?.loadoutDisplayBottom?.Hide();
    if (playerProfile && !playerProfile.isAI) {
        Sandstorm.SyncSandstormScreenEffectForPlayer(eventPlayer);
    }
    // attempting to use the mod APIs to fetch players
    for (const player of playersInVehicle) {
        if ((mod.GetObjId(mod.GetTeam(player)) === mod.GetObjId(INFECTED_TEAM))) {
            console.log(`OnPlayerEnterVehicle | Vehicle(${mod.GetObjId(eventVehicle)}) has an infected player inside. Forcing Player(${mod.GetObjId(eventPlayer)}) to exit.`);
            mod.ForcePlayerExitVehicle(player, eventVehicle);
            Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, player);
            playerProfile?.ShowAlphaFeedback(MakeMessage(mod.stringkeys.you_have_a_license_for_that));
        }
    }
}

export function OnPlayerExitVehicle(eventPlayer: mod.Player, eventVehicle: mod.Vehicle) {
    const playerProfile = PlayerProfile.Get(eventPlayer);
    if (playerProfile) {
        playerProfile.invehicle = false;
    }
    playerProfile?.loadoutDisplayBottom?.Show();
    if (playerProfile && !playerProfile.isAI) {
        Sandstorm.SyncSandstormScreenEffectForPlayer(eventPlayer);
    }
}

async function CleanupVehicleWithDamage(vehicle: mod.Vehicle, delaySeconds: number) {
    await mod.Wait(delaySeconds);
    try {
        mod.DealDamage(vehicle, 1000);
    } catch {
        try { mod.UnspawnObject(vehicle); } catch { }
    }
}

async function CleanupVehicleUnspawn(vehicle: mod.Vehicle, delaySeconds: number) {
    await mod.Wait(delaySeconds);
    try {
        try { mod.UnspawnObject(vehicle); } catch { }
    } catch {
        mod.DealDamage(vehicle, 1000);
    }
}

function QueueBotSurvivalTestVehicleSpawn(
    reason: string,
    delaySeconds: number = BOT_SURVIVAL_TEST_VEHICLE_RESPAWN_DELAY_SECONDS,
) {
    if (!BOT_SURVIVAL_TEST_MODE) return;

    const requestId = ++BOT_SURVIVAL_TEST_VEHICLE_SPAWN_REQUEST_ID;
    (async () => {
        if (delaySeconds > 0) {
            await mod.Wait(delaySeconds);
        }

        if (requestId !== BOT_SURVIVAL_TEST_VEHICLE_SPAWN_REQUEST_ID) return;
        if (!BOT_SURVIVAL_TEST_MODE) return;
        if (GameHandler.gameState !== GameState.GameRoundIsRunning) return;
        if (SPAWNED_ACTIVE_VEHICLE && IsVehicleRefValid(SPAWNED_ACTIVE_VEHICLE)) return;

        GameHandler.SpawnVehicle();
        console.log(`[BotSurvivalTest] Vehicle spawn requested (${reason}).`);
    })();
}

export function OnVehicleSpawned(eventVehicle: mod.Vehicle) {
    if (LEAP_TEST_MODE) {
        console.log(`[LeapTest] OnVehicleSpawned fired | objId=${mod.GetObjId(eventVehicle)}`);
    }
    mod.SetVehicleMaxHealthMultiplier(eventVehicle, 1);
    for (const id of VEHICLE_SPAWNER_IDS) {
        mod.SetVehicleSpawnerTimeUntilAbandon(mod.GetVehicleSpawner(id), 3);
    }
    SPAWNED_ACTIVE_VEHICLE = eventVehicle;

    // No leap-unlock or notification/VO fanfare here anymore -- the vehicle now spawns
    // automatically at round start (see PreGameSetup) rather than as a Final Five milestone,
    // and leap availability is driven entirely by LEAP_ATTACK_AREA_TRIGGER_ID enter/exit
    // (see OnPlayerEnterAreaTrigger / OnPlayerExitAreaTrigger).
}

export function OnVehicleDestroyed(eventVehicle: mod.Vehicle) {
    const trackedVehicleObjId = SPAWNED_ACTIVE_VEHICLE ? mod.GetObjId(SPAWNED_ACTIVE_VEHICLE) : -1;
    const destroyedVehicleObjId = mod.GetObjId(eventVehicle);
    const wasTrackedVehicle = trackedVehicleObjId > -1 && trackedVehicleObjId === destroyedVehicleObjId;

    SPAWNED_ACTIVE_VEHICLE = undefined;
    CleanupVehicleWithDamage(eventVehicle, 3);

    if (BOT_SURVIVAL_TEST_MODE && wasTrackedVehicle) {
        QueueBotSurvivalTestVehicleSpawn('destroyed');
    }
}

export async function OngoingPlayer(eventPlayer: mod.Player) {
    const playerObjId = mod.GetObjId(eventPlayer);
    if (!Helpers.HasValidObjId(eventPlayer) || playerObjId < 0) return;

    const isAISoldier = SafeIsAISoldier(eventPlayer);
    const playerProfile = isAISoldier ? undefined : PlayerProfile.Get(eventPlayer);

    if (!IsPlayerDeployed(eventPlayer)) return;

    // PropSpawner preview tick for human survivors who currently have the gadget equipped.
    if (!isAISoldier && PropSpawner._propIndex.has(playerObjId)) {
        PropSpawner.OngoingTick(eventPlayer);
    }

    // DecoySpawner banner-hint tick for human survivors who currently have the gadget equipped.
    if (!isAISoldier && DecoySpawner.IsEquipped(eventPlayer)) {
        DecoySpawner.OngoingTick(eventPlayer);
    }

    if (!isAISoldier) {
        // Safety net: if leap is unlocked and this deployed alpha is missing state,
        // initialize leap here so crouch charge detection can start immediately.
        if (playerProfile
            && playerProfile.isAlphaInfected
            && IsPlayerOnInfectedTeamForLeap(eventPlayer, playerProfile)
            && IsLeapAttackAvailableNow(eventPlayer)
            && !LEAP_STATES.has(playerObjId)) {
            LogLeapRuntime(`ongoing_safety_init_${playerObjId}`, `OngoingPlayer safety init triggered | player=${playerObjId} alpha=${playerProfile.isAlphaInfected} infected=${playerProfile.isInfectedTeam}`, 0.3);
            InitLeapSystem(eventPlayer);
        }

        TickLeap(eventPlayer);
    }

    // In test mode, skip all normal ongoing logic (icons, banned weapons, bot AI, etc.)
    if (LEAP_TEST_MODE) return;

    // AI bots skip all human-specific logic and run a lean AI tick instead.
    if (isAISoldier) {
        OngoingAI(eventPlayer, playerObjId);
        return;
    }

    let tickState = PLAYER_ONGOING_TICK_STATE.get(playerObjId);
    if (!tickState) {
        tickState = { nextIconUpdateAt: 0, nextBannedCheckAt: 0, nextLadderCheckAt: 0, nextBotDebugUpdateAt: 0 };
        PLAYER_ONGOING_TICK_STATE.set(playerObjId, tickState);
    }
    if (playerProfile && !playerProfile.isAI) {
        const isInVehicle = mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsInVehicle);
        if (playerProfile.invehicle !== isInVehicle) {
            playerProfile.invehicle = isInVehicle;
            if (isInVehicle) {
                playerProfile.loadoutDisplayBottom?.Hide();
            } else if (GameHandler.gameState !== GameState.EndOfRound) {
                playerProfile.loadoutDisplayBottom?.Show();
            }
        }
        playerProfile.UpdatePlayerAreaNotificationWidget();
        playerProfile.UpdateLastManStandingBuffWidgets();
        playerProfile.UpdateAlphaBuffWidgets();
        if (DEBUG_SHOW_ALL_UI_ELEMENTS) {
            playerProfile.DebugForceShowAllUIWidgets();
        }
    }

    const now = Date.now() / 1000;

    if (BOT_SURVIVAL_TEST_MODE && now >= (tickState.nextBotDebugUpdateAt ?? 0)) {
        tickState.nextBotDebugUpdateAt = now + BOT_SURVIVAL_DEBUG_UPDATE_SECONDS;
        UpdateBotSurvivalDebugWidget(eventPlayer);
    }

    if (now >= tickState.nextIconUpdateAt) {
        tickState.nextIconUpdateAt = now + PLAYER_ONGOING_ICON_UPDATE_SECONDS;
        if (SafeIsAlive(eventPlayer)) {
            UpdatePlayerIndicatorsAndIcons(eventPlayer);
            // Speed boost zone mechanic removed
        } else {
            CleanupPlayerOngoingVisuals(playerObjId);
            return;
        }
    }

    if (now >= tickState.nextBannedCheckAt) {
        tickState.nextBannedCheckAt = now + PLAYER_ONGOING_BANNED_CHECK_SECONDS;
        if (SafeIsAlive(eventPlayer)
            && !BOT_SURVIVAL_TEST_MODE
            && GameHandler.gameState === GameState.GameRoundIsRunning
            && now >= (tickState.bannedChecksEnabledAt ?? 0)) {
            CheckForBannedWeapons(eventPlayer);
        }
    }

    if (now >= tickState.nextLadderCheckAt) {
        tickState.nextLadderCheckAt = now + PLAYER_ONGOING_LADDER_CHECK_SECONDS;

        const playerProfile = PlayerProfile.Get(eventPlayer);
        const canAutoSwitchLadder = !!playerProfile
            && !playerProfile.isAI
            && playerProfile.isInfectedTeam
            && SafeIsAlive(eventPlayer)
            && GameHandler.gameState === GameState.GameRoundIsRunning
            && !mod.IsInventorySlotActive(eventPlayer, mod.InventorySlots.MeleeWeapon);

        if (!canAutoSwitchLadder) {
            tickState.lastLadderAmmo = undefined;
            tickState.nextSledgeReminderAt = undefined;
            return;
        }

        if (!tickState.nextSledgeReminderAt) {
            tickState.nextSledgeReminderAt = now + GetRandomSledgeReminderDelaySeconds();
        }

        if (tickState.nextSledgeReminderAt && now >= tickState.nextSledgeReminderAt) {
            try {
                playerProfile.ShowAmmoFeedback(false, 0, MakeMessage(mod.stringkeys.switch_to_sledgehammer));
                Helpers.PlaySoundFX(SFX_SLEDGE_REMINDER, 1, eventPlayer);
            } catch { }
            tickState.nextSledgeReminderAt = undefined;
        }

        const currentLadderAmmo = mod.GetSoldierState(eventPlayer, mod.SoldierStateNumber.CurrentWeaponAmmo);
        const previousLadderAmmo = tickState.lastLadderAmmo;

        if (previousLadderAmmo !== undefined && (currentLadderAmmo < previousLadderAmmo || currentLadderAmmo <= 0)) {
            try {
                await mod.Wait(0.55);
                mod.ForceSwitchInventory(eventPlayer, mod.InventorySlots.MeleeWeapon);
                console.log(`OngoingPlayer | Auto-switched infected Player(${playerObjId}) back to melee after ladder deployment.`);
            } catch { }
        }

        tickState.lastLadderAmmo = currentLadderAmmo;
    }
}

// ============================================================
// PropSpawner -- pre-round survivor fortification
// ============================================================

const PROP_SPAWNER_MAX_DISTANCE = 10;
const PROP_SPAWNER_PREVIEW_TICK_INTERVAL = 3;
const PROP_SPAWNER_MIN_FLOOR_NORMAL_Y = 0.5;
const PROP_SPAWNER_ZERO_VEC = mod.CreateVector(0, 0, 0);
const PROP_SPAWNER_ONE_VEC = mod.CreateVector(1, 1, 1);
const PROP_SPAWNER_LINE_CURSOR_MAX_DIST = 10;
// Seconds a player must wait after finishing a placement before they can start another.
const PROP_SPAWNER_COOLDOWN_SECONDS = 10;
const PROP_SPAWNER_VFX_ANCHOR_LAUNCH = mod.RuntimeSpawn_Common.FX_Impact_LootCrate_Dirt;
const PROP_SPAWNER_VFX_PROP_LAND = mod.RuntimeSpawn_Common.FX_Gadget_PTKM_Submunition_Detonation;
const PROP_SPAWNER_VFX_SLOT_CONFIRM = mod.RuntimeSpawn_Common.FX_RepairTool_FullyHealed;
const PROP_SPAWNER_VFX_SLOT_PREVIEW = mod.RuntimeSpawn_Common.FX_TracerDart_Projectile_Glow;
const PROP_SPAWNER_SFX_CHILD_PREVIEW = mod.RuntimeSpawn_Common.SFX_Gadgets_C4_Activate_OneShot3D;
const PROP_SPAWNER_SFX_RATCHET = mod.RuntimeSpawn_Common.SFX_Gadgets_Defibrillator_Equipped_ChargeRub_OneShot3D;
// ---- Ratchet tuning
const PROP_SPAWNER_LINE_RATCHET_DEG = 3;
const PROP_SPAWNER_RATCHET_BASE_AMP = 0.2;
const PROP_SPAWNER_RATCHET_AMP_STEP = 0.05;
const PROP_SPAWNER_RATCHET_MAX_AMP = 0.85;
const PROP_SPAWNER_RATCHET_ATTEN = 30;

interface PropSpawnerConfig {
    prop: mod.RuntimeSpawn_Common | mod.RuntimeSpawn_Sand;
    forwardOffset: number;
    rightOffset: number;
    width: number;
    depth: number;
    // Minimum horizontal distance from anchor before line drag engages.
    lineDragMinDist: number;
    // Minimum dot-product (player facing vs direction-to-anchor) for hint VFX keyhole visibility.
    keyholeMinDot: number;
    // Max props placeable in a single row (anchor + extensions) for this prop type.
    maxLineProps: number;
}

const PROP_SPAWNER_POOL: PropSpawnerConfig[] = [
    // Barricade (concrete wall)
    { prop: mod.RuntimeSpawn_Sand.BarrierConcreteWall_01_192x320, forwardOffset: 0, rightOffset: 0.96, width: 1.92, depth: 0.3, lineDragMinDist: 2.0, keyholeMinDot: 0.80, maxLineProps: 3 },
    // Wooden barriers
    { prop: mod.RuntimeSpawn_Sand.BarricadeboardsWood_01_B, forwardOffset: 0, rightOffset: 0.5, width: 1.0, depth: 0.2, lineDragMinDist: 1.0, keyholeMinDot: 0.65, maxLineProps: 5 },
    // Ammo crate
    { prop: mod.RuntimeSpawn_Common.CrateAmmo_01_StackB, forwardOffset: 0, rightOffset: 0, width: 2.0, depth: 1.0, lineDragMinDist: 2.0, keyholeMinDot: 0.80, maxLineProps: 3 },
];

class PropSpawner {
    static readonly _propIndex: Map<number, number> = new Map();
    static readonly _raycastInFlight: Set<number> = new Set();
    static readonly _raycastPurpose: Map<number, "preview" | "spawn" | "line_cursor"> = new Map();
    static readonly _previewTick: Map<number, number> = new Map();
    static readonly _cooldownUntil: Map<number, number> = new Map();
    // An equipment refresh requested while the player was mid-placement (anchor already
    // committed, still editing the row) -- applied once they finalize or cancel instead of
    // yanking their held gadget out from under them. See RefreshHumanEquipment.
    static readonly _pendingEquipmentRefresh: Map<number, PlayerProfile> = new Map();
    static readonly _previewIcons: Map<number, mod.WorldIcon> = new Map();
    static readonly _allPlacedObjects: mod.Object[] = [];
    static readonly _playerSpawnedObjects: Map<number, mod.Object[]> = new Map();
    static readonly _lineMode: Set<number> = new Set();
    static readonly _lineAnchorPos: Map<number, mod.Vector> = new Map();
    static readonly _lineAnchorRot: Map<number, mod.Vector> = new Map();
    // Only the first and last queued slot get a world icon (not one per slot).
    static readonly _lineStartIcon: Map<number, mod.WorldIcon> = new Map();
    static readonly _lineEndIcon: Map<number, mod.WorldIcon> = new Map();
    static readonly _lineCount: Map<number, number> = new Map();
    static readonly _lineDir: Map<number, mod.Vector> = new Map();
    static readonly _lineCursorPos: Map<number, mod.Vector> = new Map();
    static readonly _ratchetAngle: Map<number, number> = new Map();
    static readonly _ratchetNotch: Map<number, number> = new Map();
    static readonly _lineCursorState: Map<number, "valid" | "invalid_surface" | "out_of_range"> = new Map();
    static readonly _statusIcons: Map<number, mod.WorldIcon> = new Map();

    // Players in line mode whose updates are frozen (ADS activates extension).
    static readonly _lineFrozen: Set<number> = new Set();
    // Persistent hint VFX at the anchor; visible only when keyholed (frozen mode).
    static readonly _lineHintVfx: Map<number, mod.VFX> = new Map();
    // Per-slot camera-light VFX spawned when a slot is queued. index 0 = slot 2, index 1 = slot 3.
    static readonly _lineSlotConfirmVfx: Map<number, mod.VFX[]> = new Map();
    // Torch preview VFX on the immediately-next unqueued slot while direction is committed.
    static readonly _lineSlotTorchVfx: Map<number, mod.VFX[]> = new Map();
    // Two torch VFX on either side of the anchor shown as soon as the player enters ADS.
    static readonly _lineSideTorchVfx: Map<number, mod.VFX[]> = new Map();
    // 0-based index into _lineSlotConfirmVfx currently being live-updated while the player
    // actively drags (unfrozen line/cursor mode). Only this one slot's confirm VFX is
    // spawned/moved per aim tick -- see _UpdateLastLineSlotLive / _RevealAllLineSlots.
    static readonly _lineLiveSlotIdx: Map<number, number> = new Map();

    static HasRaycastInFlight(id: number): boolean {
        return PropSpawner._raycastInFlight.has(id);
    }

    /** Called from InitializePlayerEquipment when a survivor's loadout rolls this gadget.
     *  Picks their starting prop and readies the preview icon -- no phase/countdown involved,
     *  the gadget is now a normal continuously-usable loadout item (see OnFireStart cooldown). */
    static InitPlayer(player: mod.Player): void {
        const id = mod.GetObjId(player);
        PropSpawner._propIndex.set(id, Math.floor(Math.random() * PROP_SPAWNER_POOL.length));
        PropSpawner._cooldownUntil.delete(id);
        PropSpawner._SpawnPreviewIcon(player);
    }

    /** True while the player has an anchor already committed and is still editing the row
     *  (dragging/ratcheting length before confirming). Interrupting this is the jarring case --
     *  merely holding the gadget out without having fired yet is fine to refresh through. */
    static IsMidPlacement(player: mod.Player): boolean {
        return PropSpawner._lineMode.has(mod.GetObjId(player));
    }

    /** Queue an equipment refresh to run once the player finishes their current placement,
     *  instead of interrupting it now. Flushed from _FinalizeLinePlacement/_CancelLinePlacement
     *  and opportunistically from OngoingTick as a safety net. */
    static DeferEquipmentRefresh(player: mod.Player, playerProfile: PlayerProfile): void {
        PropSpawner._pendingEquipmentRefresh.set(mod.GetObjId(player), playerProfile);
    }

    private static _FlushDeferredEquipmentRefresh(player: mod.Player): void {
        const id = mod.GetObjId(player);
        const pending = PropSpawner._pendingEquipmentRefresh.get(id);
        if (!pending) return;
        PropSpawner._pendingEquipmentRefresh.delete(id);
        RefreshHumanEquipment(player, pending);
    }

    /** Seconds remaining before `id` can place again; 0 if ready now. */
    static GetCooldownRemaining(id: number): number {
        const until = PropSpawner._cooldownUntil.get(id);
        if (!until) return 0;
        return Math.max(0, until - (Date.now() / 1000));
    }

    static CleanupAllObjects(): void {
        for (const obj of PropSpawner._allPlacedObjects) {
            try { mod.UnspawnObject(obj); } catch { }
        }
        PropSpawner._allPlacedObjects.length = 0;
    }

    static CleanupPlayer(player: mod.Player): void {
        const id = mod.GetObjId(player);
        // Cancel any active line placement (unspawn in-progress anchor prop)
        if (PropSpawner._lineMode.has(id)) {
            const objects = PropSpawner._playerSpawnedObjects.get(id);
            if (objects) {
                for (const obj of objects) {
                    try { mod.UnspawnObject(obj); } catch { }
                }
                PropSpawner._playerSpawnedObjects.delete(id);
            }
        }
        // Clean up line start/end preview icons
        const lineStartIcon = PropSpawner._lineStartIcon.get(id);
        if (lineStartIcon) {
            try { mod.UnspawnObject(lineStartIcon as unknown as mod.Object); } catch { }
            PropSpawner._lineStartIcon.delete(id);
        }
        const lineEndIcon = PropSpawner._lineEndIcon.get(id);
        if (lineEndIcon) {
            try { mod.UnspawnObject(lineEndIcon as unknown as mod.Object); } catch { }
            PropSpawner._lineEndIcon.delete(id);
        }
        // Clean up status icon
        const statusIcon = PropSpawner._statusIcons.get(id);
        if (statusIcon) {
            try { mod.UnspawnObject(statusIcon as unknown as mod.Object); } catch { }
            PropSpawner._statusIcons.delete(id);
        }
        // Clean up hint VFX
        const hintVfxClean = PropSpawner._lineHintVfx.get(id);
        if (hintVfxClean) {
            mod.EnableVFX(hintVfxClean, false);
            try { mod.UnspawnObject(hintVfxClean as unknown as mod.Object); } catch { }
            PropSpawner._lineHintVfx.delete(id);
        }
        // Clean up slot confirm VFX
        const slotConfirmClean = PropSpawner._lineSlotConfirmVfx.get(id);
        if (slotConfirmClean) {
            for (const sv of slotConfirmClean) if (sv) { mod.EnableVFX(sv, false); try { mod.UnspawnObject(sv as unknown as mod.Object); } catch { } }
            PropSpawner._lineSlotConfirmVfx.delete(id);
        }
        PropSpawner._UnspawnSideTorches(id);
        PropSpawner._UnspawnSlotTorches(id);
        PropSpawner._HidePreviewIcon(id);
        PropSpawner._CleanupPreviewIcon(id);
        PropSpawner._CleanupPlayerState(id);
    }

    private static _SpawnPreviewIcon(player: mod.Player): void {
        const id = mod.GetObjId(player);
        if (PropSpawner._previewIcons.has(id)) return;
        const pos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
        const icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, pos, PROP_SPAWNER_ZERO_VEC) as mod.WorldIcon;
        if (!icon) return;
        mod.SetWorldIconImage(icon, mod.WorldIconImages.Alert);
        mod.SetWorldIconOwner(icon, player);
        mod.EnableWorldIconImage(icon, false);
        mod.EnableWorldIconText(icon, false);
        PropSpawner._previewIcons.set(id, icon);
    }

    private static _CleanupPlayerState(id: number): void {
        PropSpawner._raycastInFlight.delete(id);
        PropSpawner._raycastPurpose.delete(id);
        PropSpawner._previewTick.delete(id);
        PropSpawner._propIndex.delete(id);
        PropSpawner._lineMode.delete(id);
        PropSpawner._lineAnchorPos.delete(id);
        PropSpawner._lineAnchorRot.delete(id);
        PropSpawner._lineDir.delete(id);
        PropSpawner._lineCursorPos.delete(id);
        PropSpawner._lineCount.delete(id);
        PropSpawner._ratchetAngle.delete(id);
        PropSpawner._ratchetNotch.delete(id);
        PropSpawner._cooldownUntil.delete(id);
        PropSpawner._pendingEquipmentRefresh.delete(id);
        PropSpawner._lineCursorState.delete(id);
        PropSpawner._lineFrozen.delete(id);
        PropSpawner._lineHintVfx.delete(id);        // object already unspawned by CleanupPlayer
        PropSpawner._lineSlotConfirmVfx.delete(id); // objects already unspawned by CleanupPlayer
        PropSpawner._lineSlotTorchVfx.delete(id);   // objects already unspawned by CleanupPlayer
        PropSpawner._lineSideTorchVfx.delete(id);   // objects already unspawned by CleanupPlayer
        PropSpawner._lineLiveSlotIdx.delete(id);
    }

    private static _HidePreviewIcon(id: number): void {
        const icon = PropSpawner._previewIcons.get(id);
        if (icon) {
            mod.EnableWorldIconImage(icon, false);
            mod.EnableWorldIconText(icon, false);
        }
    }

    private static _CleanupPreviewIcon(id: number): void {
        const icon = PropSpawner._previewIcons.get(id);
        if (icon) {
            try { mod.UnspawnObject(icon as unknown as mod.Object); } catch { }
            PropSpawner._previewIcons.delete(id);
        }
    }

    private static _GetPropPreviewMessage(config: PropSpawnerConfig): mod.Message {
        switch (config.prop) {
            case mod.RuntimeSpawn_Sand.BarrierConcreteWall_01_192x320:
                return mod.Message(mod.stringkeys.prop_spawner_preview_barrierconcretewall_01_192x320);
            case mod.RuntimeSpawn_Sand.BarricadeboardsWood_01_B:
                return mod.Message(mod.stringkeys.prop_spawner_preview_barricadeboardswood_01_B);
            case mod.RuntimeSpawn_Common.CrateAmmo_01_StackB:
                return mod.Message(mod.stringkeys.prop_spawner_preview_crateammo_01_stackb);
            default:
                return mod.Message(mod.stringkeys.prop_spawner_preview_unknown);
        }
    }

    private static _GetFireToPlaceMessage(config: PropSpawnerConfig): mod.Message {
        switch (config.prop) {
            case mod.RuntimeSpawn_Sand.BarrierConcreteWall_01_192x320:
                return mod.Message(mod.stringkeys.prop_spawner_fire_to_place_concrete_wall);
            case mod.RuntimeSpawn_Sand.BarricadeboardsWood_01_B:
                return mod.Message(mod.stringkeys.prop_spawner_fire_to_place_barricade);
            case mod.RuntimeSpawn_Common.CrateAmmo_01_StackB:
                return mod.Message(mod.stringkeys.prop_spawner_fire_to_place_ammo_crate);
            default:
                return mod.Message(mod.stringkeys.prop_spawner_fire_to_place_unknown);
        }
    }

    private static _GetSideTorchPositions(anchorPos: mod.Vector, facingYaw: number, config: PropSpawnerConfig): [mod.Vector, mod.Vector] {
        const step = config.width;
        const rx = Math.cos(facingYaw);
        const rz = -Math.sin(facingYaw);
        const right = mod.CreateVector(
            mod.XComponentOf(anchorPos) + rx * step,
            mod.YComponentOf(anchorPos),
            mod.ZComponentOf(anchorPos) + rz * step
        );
        const left = mod.CreateVector(
            mod.XComponentOf(anchorPos) - rx * step,
            mod.YComponentOf(anchorPos),
            mod.ZComponentOf(anchorPos) - rz * step
        );
        return [left, right];
    }

    private static _UnspawnVfxList(list: mod.VFX[]): void {
        for (const vfx of list) {
            if (vfx) {
                mod.EnableVFX(vfx, false);
                try { mod.UnspawnObject(vfx as unknown as mod.Object); } catch { }
            }
        }
    }

    private static _UnspawnSideTorches(id: number): void {
        const list = PropSpawner._lineSideTorchVfx.get(id);
        if (list) { PropSpawner._UnspawnVfxList(list); PropSpawner._lineSideTorchVfx.delete(id); }
    }

    private static _UnspawnSlotTorches(id: number): void {
        const list = PropSpawner._lineSlotTorchVfx.get(id);
        if (list) { PropSpawner._UnspawnVfxList(list); PropSpawner._lineSlotTorchVfx.delete(id); }
    }

    private static _SpawnOrMoveSideTorches(player: mod.Player, anchorPos: mod.Vector): void {
        const id = mod.GetObjId(player);
        const config = PropSpawner._GetPropConfig(id);
        const facingYaw = mod.YComponentOf(PropSpawner._lineAnchorRot.get(id) ?? PROP_SPAWNER_ZERO_VEC);
        const [leftPos, rightPos] = PropSpawner._GetSideTorchPositions(anchorPos, facingYaw, config);
        let list = PropSpawner._lineSideTorchVfx.get(id);
        if (!list) { list = []; PropSpawner._lineSideTorchVfx.set(id, list); }
        for (let i = 0; i < 2; i++) {
            const pos = i === 0 ? leftPos : rightPos;
            if (list[i]) {
                mod.MoveVFX(list[i], pos, PROP_SPAWNER_ZERO_VEC);
            } else {
                const vfx = mod.SpawnObject(PROP_SPAWNER_VFX_SLOT_PREVIEW, pos, PROP_SPAWNER_ZERO_VEC) as mod.VFX;
                if (vfx) mod.EnableVFX(vfx, true);
                list[i] = vfx;
            }
        }
    }

    private static _ShowPreviewIconValid(player: mod.Player, pos: mod.Vector): void {
        const id = mod.GetObjId(player);
        const icon = PropSpawner._previewIcons.get(id);
        if (!icon) return;
        const config = PropSpawner._GetPropConfig(id);
        const cooldownRemaining = PropSpawner.GetCooldownRemaining(id);
        const onCooldown = cooldownRemaining > 0 && !PropSpawner._lineMode.has(id);
        const msg = onCooldown
            ? MakeMessage((mod.stringkeys as Record<string, string>).prop_spawner_on_cooldown ?? "prop_spawner_on_cooldown", Math.ceil(cooldownRemaining))
            : PropSpawner._GetFireToPlaceMessage(config);
        mod.EnableWorldIconText(icon, false);
        mod.SetWorldIconText(icon, msg);
        mod.SetWorldIconColor(icon, onCooldown ? mod.CreateVector(1, 0.6, 0.2) : mod.CreateVector(0.2, 1, 0.2));
        mod.SetWorldIconPosition(icon, pos);
        mod.SetWorldIconOwner(icon, player);
        mod.EnableWorldIconImage(icon, true);
        mod.EnableWorldIconText(icon, true);
    }

    private static _ShowPreviewIconError(player: mod.Player, pos: mod.Vector, message: mod.Message): void {
        const id = mod.GetObjId(player);
        const icon = PropSpawner._previewIcons.get(id);
        if (!icon) return;
        mod.EnableWorldIconText(icon, false);
        mod.SetWorldIconText(icon, message);
        mod.SetWorldIconColor(icon, mod.CreateVector(1, 0.35, 0));
        mod.SetWorldIconPosition(icon, pos);
        mod.SetWorldIconOwner(icon, player);
        mod.EnableWorldIconImage(icon, true);
        mod.EnableWorldIconText(icon, true);
    }

    private static _GetRaycastVectors(player: mod.Player): { start: mod.Vector; end: mod.Vector } {
        const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
        const eyePos = mod.GetSoldierState(player, mod.SoldierStateVector.EyePosition);
        const start = mod.Add(eyePos, facing);
        const end = mod.Add(start, mod.Multiply(facing, PROP_SPAWNER_MAX_DISTANCE));
        return { start, end };
    }

    private static _ComputeObjectPosFromPivot(pivot: mod.Vector, yaw: number, config: PropSpawnerConfig): mod.Vector {
        if (config.rightOffset === 0 && config.forwardOffset === 0) return pivot;
        let result = pivot;
        if (config.rightOffset !== 0) {
            const prx = Math.cos(yaw);
            const prz = -Math.sin(yaw);
            result = mod.Add(result, mod.CreateVector(-config.rightOffset * prx, 0, -config.rightOffset * prz));
        }
        if (config.forwardOffset !== 0) {
            const pfx = Math.sin(yaw);
            const pfz = Math.cos(yaw);
            result = mod.Add(result, mod.CreateVector(-config.forwardOffset * pfx, 0, -config.forwardOffset * pfz));
        }
        return result;
    }

    private static _GetFacingPlayerRotation(player: mod.Player): mod.Vector {
        const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
        const yaw = Math.atan2(-mod.XComponentOf(facing), -mod.ZComponentOf(facing));
        return mod.CreateVector(0, yaw, 0);
    }

    static OnAimStart(player: mod.Player): void {
        const id = mod.GetObjId(player);
        if (!PropSpawner._lineMode.has(id)) return;
        if (PropSpawner._lineFrozen.has(id)) {
            PropSpawner._lineFrozen.delete(id);
            // Hide keyhole hint — side torches take over as positional guidance in ADS.
            const hintVfx = PropSpawner._lineHintVfx.get(id);
            if (hintVfx) mod.EnableVFX(hintVfx, false);
            const anchorPos = PropSpawner._lineAnchorPos.get(id);
            if (anchorPos) PropSpawner._SpawnOrMoveSideTorches(player, anchorPos);
        }
    }

    static OnAimStop(player: mod.Player): void {
        const id = mod.GetObjId(player);
        if (!PropSpawner._lineMode.has(id)) return;
        if (!PropSpawner._lineFrozen.has(id)) {
            PropSpawner._lineFrozen.add(id);
            PropSpawner._UnspawnSideTorches(id);
            PropSpawner._UnspawnSlotTorches(id);

            // Leaving active line/cursor mode: fully reconcile every in-between queued slot's
            // VFX now that per-tick updates are paused (see _UpdateLastLineSlotLive).
            const anchorPos = PropSpawner._lineAnchorPos.get(id);
            const lineDir = PropSpawner._lineDir.get(id);
            const count = PropSpawner._lineCount.get(id) ?? 1;
            if (anchorPos && lineDir && count > 1) {
                const anchorRot = PropSpawner._lineAnchorRot.get(id);
                const facingYaw = anchorRot !== undefined ? mod.YComponentOf(anchorRot) : 0;
                const config = PropSpawner._GetPropConfig(id);
                const effectiveStep = PropSpawner._ComputeEffectiveStep(lineDir, facingYaw, config);
                PropSpawner._RevealAllLineSlots(player, anchorPos, lineDir, count, effectiveStep);
            }
        }
    }

    static OnFireStart(player: mod.Player): void {
        const id = mod.GetObjId(player);
        if (!PropSpawner._propIndex.has(id)) return; // doesn't have this gadget equipped
        if (PropSpawner._lineMode.has(id)) {
            // Confirming an in-progress placement is always allowed -- cooldown only
            // gates *starting* a new one.
            PropSpawner._FinalizeLinePlacement(player);
            return;
        }
        if (PropSpawner.GetCooldownRemaining(id) > 0) return;
        if (PropSpawner._raycastInFlight.has(id)) {
            PropSpawner._raycastPurpose.set(id, "spawn");
        } else {
            const { start, end } = PropSpawner._GetRaycastVectors(player);
            PropSpawner._raycastInFlight.add(id);
            PropSpawner._raycastPurpose.set(id, "spawn");
            mod.RayCast(player, start, end);
        }
    }

    static OnFireStop(player: mod.Player): void {
        // No-op: icon stays visible until next raycast result updates it
    }

    static OngoingTick(player: mod.Player): void {
        if (!mod.IsPlayerValid(player)) return;
        const id = mod.GetObjId(player);
        if (!PropSpawner._propIndex.has(id)) return;

        // Safety net: normally flushed directly from finalize/cancel, but catch any case where
        // line mode ended some other way without going through either.
        if (!PropSpawner._lineMode.has(id)) {
            PropSpawner._FlushDeferredEquipmentRefresh(player);
        }

        // Only actively preview/raycast while the gadget is the player's held weapon.
        // Owning the gadget in loadout no longer implies a mandatory placement phase, so
        // without this check every survivor who ever rolled it would raycast in the
        // background for the entire round regardless of what weapon they're actually using.
        if (!PropSpawner._lineMode.has(id) && !mod.IsInventorySlotActive(player, mod.InventorySlots.GadgetOne)) {
            PropSpawner._HidePreviewIcon(id);
            return;
        }

        if (PropSpawner._lineMode.has(id)) {
            const anchorPos = PropSpawner._lineAnchorPos.get(id);
            if (anchorPos) {
                if (PropSpawner._lineFrozen.has(id)) {
                    // Extension inactive: still track aim to keep status icon current.
                    if (!PropSpawner._raycastInFlight.has(id)) {
                        const tick = (PropSpawner._previewTick.get(id) ?? 0) + 1;
                        PropSpawner._previewTick.set(id, tick);
                        if (tick % PROP_SPAWNER_PREVIEW_TICK_INTERVAL === 0) {
                            const { start, end } = PropSpawner._GetRaycastVectors(player);
                            PropSpawner._raycastInFlight.add(id);
                            PropSpawner._raycastPurpose.set(id, "line_cursor");
                            mod.RayCast(player, start, end);
                        }
                    }
                    const cachedCursor = PropSpawner._lineCursorPos.get(id);
                    const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
                    const eyePos = mod.GetSoldierState(player, mod.SoldierStateVector.EyePosition);
                    const aimPoint = cachedCursor ?? mod.Add(eyePos, mod.Multiply(facing, PROP_SPAWNER_LINE_CURSOR_MAX_DIST));
                    // Rotate anchor prop to face the player while frozen (root prop only).
                    const frozenLineCount = PropSpawner._lineCount.get(id) ?? 1;
                    const frozenObjects = PropSpawner._playerSpawnedObjects.get(id);
                    if (frozenLineCount <= 1 && frozenObjects && frozenObjects.length > 0) {
                        const anchor = frozenObjects[frozenObjects.length - 1];
                        const playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
                        const toPx = mod.XComponentOf(playerPos) - mod.XComponentOf(anchorPos);
                        const toPz = mod.ZComponentOf(playerPos) - mod.ZComponentOf(anchorPos);
                        const yaw = Math.atan2(toPx, toPz);
                        const rot = mod.CreateVector(0, yaw, 0);
                        PropSpawner._lineAnchorRot.set(id, rot);
                        const objectPos = PropSpawner._ComputeObjectPosFromPivot(anchorPos, yaw, PropSpawner._GetPropConfig(id));
                        try { mod.SetObjectTransform(anchor as mod.SpatialObject, mod.CreateTransform(objectPos, rot)); } catch { }
                    }
                    // Keyhole hint VFX: show at anchor when player looks toward it.
                    const frozenHintVfx = PropSpawner._lineHintVfx.get(id);
                    if (frozenHintVfx) {
                        const hFx = mod.XComponentOf(facing);
                        const hFz = mod.ZComponentOf(facing);
                        const hFLen = Math.sqrt(hFx * hFx + hFz * hFz);
                        if (hFLen > 0.001) {
                            const dax = mod.XComponentOf(anchorPos) - mod.XComponentOf(eyePos);
                            const day = mod.YComponentOf(anchorPos) - mod.YComponentOf(eyePos);
                            const daz = mod.ZComponentOf(anchorPos) - mod.ZComponentOf(eyePos);
                            const daLen = Math.sqrt(dax * dax + day * day + daz * daz);
                            const dotToAnchor = daLen > 0.001
                                ? (mod.XComponentOf(facing) * dax + mod.YComponentOf(facing) * day + mod.ZComponentOf(facing) * daz) / daLen
                                : 0;
                            if (dotToAnchor >= PropSpawner._GetPropConfig(id).keyholeMinDot) {
                                mod.EnableVFX(frozenHintVfx, true);
                            } else {
                                mod.EnableVFX(frozenHintVfx, false);
                            }
                        } else {
                            mod.EnableVFX(frozenHintVfx, false);
                        }
                    }
                    PropSpawner._ShowStatusIcon(player, aimPoint,
                        mod.Message(mod.stringkeys.prop_spawner_hold_ads_extend),
                        mod.CreateVector(0.8, 0.8, 1.0));
                    return;
                }

                if (!PropSpawner._raycastInFlight.has(id)) {
                    const tick = (PropSpawner._previewTick.get(id) ?? 0) + 1;
                    PropSpawner._previewTick.set(id, tick);
                    if (tick % PROP_SPAWNER_PREVIEW_TICK_INTERVAL === 0) {
                        const { start, end } = PropSpawner._GetRaycastVectors(player);
                        PropSpawner._raycastInFlight.add(id);
                        PropSpawner._raycastPurpose.set(id, "line_cursor");
                        mod.RayCast(player, start, end);
                    }
                }
                const cachedCursor = PropSpawner._lineCursorPos.get(id);
                const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
                const eyePos = mod.GetSoldierState(player, mod.SoldierStateVector.EyePosition);
                const cursorPos = cachedCursor ?? mod.Add(eyePos, mod.Multiply(facing, PROP_SPAWNER_LINE_CURSOR_MAX_DIST));
                const dist = PropSpawner._HorizontalDistance(anchorPos, cursorPos);
                if (dist < PropSpawner._GetPropConfig(id).lineDragMinDist) {
                    const objects = PropSpawner._playerSpawnedObjects.get(id);
                    if (objects && objects.length > 0) {
                        const anchor = objects[objects.length - 1];
                        const playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
                        const toPx = mod.XComponentOf(playerPos) - mod.XComponentOf(anchorPos);
                        const toPz = mod.ZComponentOf(playerPos) - mod.ZComponentOf(anchorPos);
                        const yaw = Math.atan2(toPx, toPz);
                        const rot = mod.CreateVector(0, yaw, 0);
                        PropSpawner._lineAnchorRot.set(id, rot);
                        const objectPos = PropSpawner._ComputeObjectPosFromPivot(anchorPos, yaw, PropSpawner._GetPropConfig(id));
                        try { mod.SetObjectTransform(anchor as mod.SpatialObject, mod.CreateTransform(objectPos, rot)); } catch { }
                    }
                    PropSpawner._HideLinePreviews(player);
                    PropSpawner._SpawnOrMoveSideTorches(player, anchorPos);
                    PropSpawner._HideStatusIcon(id);
                } else {
                    const lineDir = PropSpawner._ComputeLineDirection(anchorPos, cursorPos);
                    if (lineDir) {
                        const config = PropSpawner._GetPropConfig(id);
                        const cursorState = PropSpawner._lineCursorState.get(id);
                        const statusPos = cursorPos;

                        if (cursorState === "invalid_surface" || cursorState === "out_of_range") {
                            PropSpawner._HideLinePreviews(player);
                            const errorMsg = cursorState === "invalid_surface"
                                ? mod.Message(mod.stringkeys.prop_spawner_invalid_surface)
                                : mod.Message(mod.stringkeys.prop_spawner_out_of_range);
                            PropSpawner._ShowStatusIcon(player, statusPos, errorMsg, mod.CreateVector(1, 0.35, 0));
                        } else {
                            PropSpawner._RotateAnchorProp(player, lineDir);
                            const facingYaw = mod.YComponentOf(PropSpawner._lineAnchorRot.get(id) ?? PROP_SPAWNER_ZERO_VEC);
                            const effectiveStep = PropSpawner._ComputeEffectiveStep(lineDir, facingYaw, config);
                            const count = PropSpawner._ComputeLineCount(anchorPos, cursorPos, effectiveStep, config.maxLineProps);
                            const prevRatchetCount = PropSpawner._lineCount.get(id) ?? 1;
                            PropSpawner._UpdateLastLineSlotLive(player, anchorPos, lineDir, count, effectiveStep);

                            if (count === 1) {
                                PropSpawner._HideStatusIcon(id);
                            } else {
                                const altPhase = Math.floor(Date.now() / 2000) % 2 === 0;
                                PropSpawner._ShowStatusIcon(player, statusPos,
                                    altPhase
                                        ? mod.Message(mod.stringkeys.prop_spawner_fire_to_confirm, count)
                                        : mod.Message(mod.stringkeys.prop_spawner_undo),
                                    mod.CreateVector(0.2, 1, 0.2));
                            }

                            const lineYaw = Math.atan2(mod.XComponentOf(lineDir), mod.ZComponentOf(lineDir));
                            if (count !== prevRatchetCount) {
                                PropSpawner._ratchetAngle.set(id, lineYaw);
                                PropSpawner._ratchetNotch.set(id, 0);
                            } else {
                                const lastRatchetAngle = PropSpawner._ratchetAngle.get(id);
                                if (lastRatchetAngle === undefined) {
                                    PropSpawner._ratchetAngle.set(id, lineYaw);
                                    PropSpawner._ratchetNotch.set(id, 0);
                                } else {
                                    const delta = PropSpawner._SmallestAngleDelta(lastRatchetAngle, lineYaw);
                                    if (delta >= PROP_SPAWNER_LINE_RATCHET_DEG * (Math.PI / 180)) {
                                        PropSpawner._ratchetAngle.set(id, lineYaw);
                                        const notch = (PropSpawner._ratchetNotch.get(id) ?? 0) + 1;
                                        PropSpawner._ratchetNotch.set(id, notch);
                                        const amp = Math.min(PROP_SPAWNER_RATCHET_BASE_AMP + notch * PROP_SPAWNER_RATCHET_AMP_STEP, PROP_SPAWNER_RATCHET_MAX_AMP);
                                        const ratchetSlot = count - 1;
                                        const ratchetPos = ratchetSlot > 0
                                            ? mod.CreateVector(
                                                mod.XComponentOf(anchorPos) + mod.XComponentOf(lineDir) * ratchetSlot * effectiveStep,
                                                mod.YComponentOf(anchorPos),
                                                mod.ZComponentOf(anchorPos) + mod.ZComponentOf(lineDir) * ratchetSlot * effectiveStep
                                            )
                                            : cursorPos;
                                        PropSpawner._PlaySFX3DAtPos(PROP_SPAWNER_SFX_RATCHET, amp, ratchetPos);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            return;
        }

        if (PropSpawner._raycastInFlight.has(id)) return;
        const tick = (PropSpawner._previewTick.get(id) ?? 0) + 1;
        PropSpawner._previewTick.set(id, tick);
        if (tick % PROP_SPAWNER_PREVIEW_TICK_INTERVAL !== 0) return;
        const { start, end } = PropSpawner._GetRaycastVectors(player);
        PropSpawner._raycastInFlight.add(id);
        PropSpawner._raycastPurpose.set(id, "preview");
        mod.RayCast(player, start, end);
    }

    static OnRayCastHit(player: mod.Player, point: mod.Vector, normal: mod.Vector): void {
        const id = mod.GetObjId(player);
        const purpose = PropSpawner._raycastPurpose.get(id);
        PropSpawner._raycastInFlight.delete(id);
        PropSpawner._raycastPurpose.delete(id);

        const isFloor = mod.YComponentOf(normal) >= PROP_SPAWNER_MIN_FLOOR_NORMAL_Y;

        if (purpose === "spawn") {
            if (!isFloor) {
                PropSpawner._ShowPreviewIconError(player, point, mod.Message(mod.stringkeys.prop_spawner_invalid_surface));
                return;
            }
            const config = PropSpawner._GetPropConfig(id);
            const pivotPos = point; // raw hit = visual centre (pivot)
            const spawnRot = PropSpawner._GetFacingPlayerRotation(player);
            const spawnYaw = mod.YComponentOf(spawnRot);
            const spawnPos = PropSpawner._ComputeObjectPosFromPivot(pivotPos, spawnYaw, config);
            const prop = mod.SpawnObject(config.prop, spawnPos, spawnRot, PROP_SPAWNER_ONE_VEC);
            if (prop) {
                PropSpawner._lineMode.add(id);
                PropSpawner._lineAnchorPos.set(id, pivotPos);
                PropSpawner._lineAnchorRot.set(id, spawnRot);
                PropSpawner._lineCount.set(id, 1);
                PropSpawner._lineFrozen.add(id); // start frozen; laser toggle activates extension
                const list = PropSpawner._playerSpawnedObjects.get(id) ?? [];
                list.push(prop);
                PropSpawner._playerSpawnedObjects.set(id, list);
                const anchorVfx = mod.SpawnObject(PROP_SPAWNER_VFX_ANCHOR_LAUNCH, pivotPos, PROP_SPAWNER_ZERO_VEC) as mod.VFX;
                if (anchorVfx) mod.EnableVFX(anchorVfx, true);
                PropSpawner._ratchetAngle.delete(id);
                PropSpawner._ratchetNotch.set(id, 0);
                PropSpawner._HidePreviewIcon(id);
            }
        } else if (purpose === "line_cursor") {
            const anchorPos = PropSpawner._lineAnchorPos.get(id);
            if (isFloor && anchorPos && PropSpawner._HorizontalDistance(anchorPos, point) <= PROP_SPAWNER_LINE_CURSOR_MAX_DIST) {
                PropSpawner._lineCursorPos.set(id, point);
                PropSpawner._lineCursorState.set(id, "valid");
            } else {
                PropSpawner._lineCursorPos.delete(id);
                PropSpawner._lineCursorState.set(id, isFloor ? "out_of_range" : "invalid_surface");
            }
        } else {
            if (isFloor) {
                PropSpawner._ShowPreviewIconValid(player, point);
            } else {
                PropSpawner._ShowPreviewIconError(player, point, mod.Message(mod.stringkeys.prop_spawner_invalid_surface));
            }
        }
    }

    static OnRayCastMissed(player: mod.Player): void {
        const id = mod.GetObjId(player);
        const purpose = PropSpawner._raycastPurpose.get(id);
        PropSpawner._raycastInFlight.delete(id);
        PropSpawner._raycastPurpose.delete(id);
        if (purpose === "line_cursor") {
            PropSpawner._lineCursorPos.delete(id);
            PropSpawner._lineCursorState.set(id, "out_of_range");
        } else {
            const { end } = PropSpawner._GetRaycastVectors(player);
            PropSpawner._ShowPreviewIconError(player, end, mod.Message(mod.stringkeys.prop_spawner_out_of_range));
        }
    }

    static OnLaserToggle(player: mod.Player, _eventBoolean: boolean): void {
        const id = mod.GetObjId(player);
        if (!PropSpawner._propIndex.has(id)) return;
        if (!PropSpawner._lineMode.has(id)) return;
        // Laser toggle is undo: cancel the in-progress anchor placement.
        PropSpawner._CancelLinePlacement(player);
    }

    private static _GetPropConfig(id: number): PropSpawnerConfig {
        const idx = PropSpawner._propIndex.get(id) ?? 0;
        return PROP_SPAWNER_POOL[idx % PROP_SPAWNER_POOL.length];
    }

    private static _ComputeLineDirection(anchorPos: mod.Vector, cursorPos: mod.Vector): mod.Vector | undefined {
        const dx = mod.XComponentOf(cursorPos) - mod.XComponentOf(anchorPos);
        const dz = mod.ZComponentOf(cursorPos) - mod.ZComponentOf(anchorPos);
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) return undefined;
        return mod.CreateVector(dx / len, 0, dz / len);
    }

    private static _HorizontalDistance(a: mod.Vector, b: mod.Vector): number {
        const dx = mod.XComponentOf(b) - mod.XComponentOf(a);
        const dz = mod.ZComponentOf(b) - mod.ZComponentOf(a);
        return Math.sqrt(dx * dx + dz * dz);
    }

    private static _ComputeEffectiveStep(lineDir: mod.Vector, facingYaw: number, config: PropSpawnerConfig): number {
        const lineYaw = Math.atan2(mod.XComponentOf(lineDir), mod.ZComponentOf(lineDir));
        const angle = facingYaw - lineYaw;
        return config.width * Math.abs(Math.sin(angle)) + config.depth * Math.abs(Math.cos(angle));
    }

    private static _ComputeLineCount(anchorPos: mod.Vector, cursorPos: mod.Vector, effectiveStep: number, maxLineProps: number): number {
        const dist = PropSpawner._HorizontalDistance(anchorPos, cursorPos);
        const additional = Math.min(Math.floor(dist / effectiveStep), maxLineProps - 1);
        return 1 + additional;
    }

    private static _SmallestAngleDelta(a: number, b: number): number {
        let d = b - a;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return Math.abs(d);
    }

    private static _PlaySFX2DForPlayer(sfx: mod.RuntimeSpawn_Common, amplitude: number, player: mod.Player, pos: mod.Vector): void {
        const sfxObj = mod.SpawnObject(sfx, pos, PROP_SPAWNER_ZERO_VEC) as mod.SFX;
        if (sfxObj) mod.PlaySound(sfxObj, amplitude, player);
    }

    private static _PlaySFX3DAtPos(sfx: mod.RuntimeSpawn_Common, amplitude: number, pos: mod.Vector): void {
        const sfxObj = mod.SpawnObject(sfx, pos, PROP_SPAWNER_ZERO_VEC) as mod.SFX;
        if (sfxObj) mod.PlaySound(sfxObj, amplitude, pos, PROP_SPAWNER_RATCHET_ATTEN);
    }

    private static _LineSlotPosition(anchorPos: mod.Vector, lineDir: mod.Vector, slotIndex: number, effectiveStep: number): mod.Vector {
        const offset = slotIndex * effectiveStep;
        return mod.CreateVector(
            mod.XComponentOf(anchorPos) + mod.XComponentOf(lineDir) * offset,
            mod.YComponentOf(anchorPos),
            mod.ZComponentOf(anchorPos) + mod.ZComponentOf(lineDir) * offset
        );
    }

    /** Per-tick preview update while the player is actively dragging (unfrozen line/cursor
     *  mode). Only the most-recently-queued ("last") slot's confirm VFX and the start/end
     *  world icons are spawned/moved here -- re-issuing MoveVFX/SpawnObject for every queued
     *  slot on every single aim tick was the per-tick cost that made things feel laggy once
     *  2+ props were queued. Earlier queued ("in-between") slots are left exactly where they
     *  are while dragging, and are fully reconciled in one pass by _RevealAllLineSlots() once
     *  the player leaves line/cursor mode (see OnAimStop). The aim-tracking hint/status icon
     *  is handled separately by _ShowStatusIcon and always tracks the player's current aim. */
    private static _UpdateLastLineSlotLive(player: mod.Player, anchorPos: mod.Vector, lineDir: mod.Vector, count: number, effectiveStep: number): void {
        const id = mod.GetObjId(player);
        const config = PropSpawner._GetPropConfig(id);

        // Direction is now committed — unspawn side torches and any leftover next-slot torch
        // preview; that hint is no longer spawned/moved live (see class doc above).
        PropSpawner._UnspawnSideTorches(id);
        PropSpawner._UnspawnSlotTorches(id);

        let slotConfirmList = PropSpawner._lineSlotConfirmVfx.get(id);
        if (!slotConfirmList) { slotConfirmList = []; PropSpawner._lineSlotConfirmVfx.set(id, slotConfirmList); }

        const lastIdx = count - 2; // 0-based index of the most recently queued slot; -1 while only the anchor is queued
        const prevLiveIdx = PropSpawner._lineLiveSlotIdx.get(id);
        if (prevLiveIdx !== undefined && prevLiveIdx !== lastIdx) {
            // Cheap visibility toggle for the slot that was live a moment ago -- no spawn/move.
            const prevVfx = slotConfirmList[prevLiveIdx] as mod.VFX | undefined;
            if (prevVfx) mod.EnableVFX(prevVfx, false);
        }

        if (lastIdx >= 0) {
            const pos = PropSpawner._LineSlotPosition(anchorPos, lineDir, lastIdx + 1, effectiveStep);
            const prevConfirm = slotConfirmList[lastIdx] as mod.VFX | undefined;
            if (!prevConfirm) {
                const cv = mod.SpawnObject(PROP_SPAWNER_VFX_SLOT_CONFIRM, pos, PROP_SPAWNER_ZERO_VEC) as mod.VFX;
                if (cv) mod.EnableVFX(cv, true);
                slotConfirmList[lastIdx] = cv;
            } else {
                mod.MoveVFX(prevConfirm, pos, PROP_SPAWNER_ZERO_VEC);
                mod.EnableVFX(prevConfirm, true);
            }
        }
        PropSpawner._lineLiveSlotIdx.set(id, lastIdx);

        PropSpawner._UpdateLineEndpointIcons(player, config, anchorPos, lineDir, count, effectiveStep);

        const prevCount = PropSpawner._lineCount.get(id) ?? 1;
        if (count > prevCount) {
            const newSlotPos = PropSpawner._LineSlotPosition(anchorPos, lineDir, count - 1, effectiveStep);
            PropSpawner._PlaySFX2DForPlayer(PROP_SPAWNER_SFX_CHILD_PREVIEW, 0.7, player, newSlotPos);
        }
        PropSpawner._lineCount.set(id, count);
    }

    /** Fully reconciles every queued in-between line slot's confirm VFX in one pass. Called
     *  when the player leaves line/cursor mode (releases ADS) so the whole row is shown
     *  accurately, without paying that per-slot cost on every aim tick while still dragging
     *  (see _UpdateLastLineSlotLive). */
    private static _RevealAllLineSlots(player: mod.Player, anchorPos: mod.Vector, lineDir: mod.Vector, count: number, effectiveStep: number): void {
        const id = mod.GetObjId(player);
        const config = PropSpawner._GetPropConfig(id);

        let slotConfirmList = PropSpawner._lineSlotConfirmVfx.get(id);
        if (!slotConfirmList) { slotConfirmList = []; PropSpawner._lineSlotConfirmVfx.set(id, slotConfirmList); }

        const maxSlots = config.maxLineProps - 1;
        for (let i = 0; i < maxSlots; i++) {
            const slotIndex = i + 1;
            const prevConfirm = slotConfirmList[i] as mod.VFX | undefined;
            if (slotIndex < count) {
                const pos = PropSpawner._LineSlotPosition(anchorPos, lineDir, slotIndex, effectiveStep);
                if (!prevConfirm) {
                    const cv = mod.SpawnObject(PROP_SPAWNER_VFX_SLOT_CONFIRM, pos, PROP_SPAWNER_ZERO_VEC) as mod.VFX;
                    if (cv) mod.EnableVFX(cv, true);
                    slotConfirmList[i] = cv;
                } else {
                    mod.MoveVFX(prevConfirm, pos, PROP_SPAWNER_ZERO_VEC);
                    mod.EnableVFX(prevConfirm, true);
                }
            } else if (prevConfirm) {
                mod.EnableVFX(prevConfirm, false);
                try { mod.UnspawnObject(prevConfirm as unknown as mod.Object); } catch { }
                slotConfirmList[i] = undefined as unknown as mod.VFX;
            }
        }

        PropSpawner._lineLiveSlotIdx.delete(id);
    }

    /** Only the first queued slot ("start") and the last queued slot ("end") get a world icon --
     *  everything in between is left to the confirm/torch VFX above. When exactly one slot is
     *  queued, start and end are the same position, so only the start icon is shown. */
    private static _UpdateLineEndpointIcons(
        player: mod.Player,
        config: PropSpawnerConfig,
        anchorPos: mod.Vector,
        lineDir: mod.Vector,
        count: number,
        effectiveStep: number,
    ): void {
        const id = mod.GetObjId(player);

        if (count < 2) {
            PropSpawner._HideLineEndpointIcons(id);
            return;
        }

        const startSlot = 1;
        const endSlot = count - 1;
        const previewMsg = PropSpawner._GetPropPreviewMessage(config);

        const showEndpointIcon = (
            getter: Map<number, mod.WorldIcon>,
            slotIndex: number,
        ): void => {
            const pos = PropSpawner._LineSlotPosition(anchorPos, lineDir, slotIndex, effectiveStep);
            let icon = getter.get(id);
            if (!icon) {
                icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, pos, PROP_SPAWNER_ZERO_VEC) as mod.WorldIcon;
                if (!icon) return;
                mod.SetWorldIconImage(icon, mod.WorldIconImages.Alert);
                mod.SetWorldIconOwner(icon, player);
                getter.set(id, icon);
            }
            mod.EnableWorldIconText(icon, false);
            mod.SetWorldIconText(icon, previewMsg);
            mod.SetWorldIconColor(icon, mod.CreateVector(0.2, 1, 0.2));
            mod.SetWorldIconPosition(icon, pos);
            mod.SetWorldIconOwner(icon, player);
            mod.EnableWorldIconImage(icon, true);
            mod.EnableWorldIconText(icon, true);
        };

        showEndpointIcon(PropSpawner._lineStartIcon, startSlot);

        if (endSlot === startSlot) {
            PropSpawner._HideLineEndIcon(id);
        } else {
            showEndpointIcon(PropSpawner._lineEndIcon, endSlot);
        }
    }

    private static _HideLineEndIcon(id: number): void {
        const endIcon = PropSpawner._lineEndIcon.get(id);
        if (endIcon) {
            mod.EnableWorldIconImage(endIcon, false);
            mod.EnableWorldIconText(endIcon, false);
        }
    }

    private static _HideLineEndpointIcons(id: number): void {
        const startIcon = PropSpawner._lineStartIcon.get(id);
        if (startIcon) {
            mod.EnableWorldIconImage(startIcon, false);
            mod.EnableWorldIconText(startIcon, false);
        }
        PropSpawner._HideLineEndIcon(id);
    }

    private static _HideLinePreviews(player: mod.Player): void {
        const id = mod.GetObjId(player);
        PropSpawner._HideLineEndpointIcons(id);
        const slotConfirmList = PropSpawner._lineSlotConfirmVfx.get(id);
        if (slotConfirmList) {
            for (const sv of slotConfirmList) if (sv) mod.EnableVFX(sv, false);
        }
        PropSpawner._UnspawnSlotTorches(id);
        PropSpawner._lineLiveSlotIdx.delete(id);
        PropSpawner._lineCount.set(id, 1);
    }

    private static _GetLineModeStatusPos(anchorPos: mod.Vector): mod.Vector {
        return mod.CreateVector(
            mod.XComponentOf(anchorPos),
            mod.YComponentOf(anchorPos) + 1.5,
            mod.ZComponentOf(anchorPos)
        );
    }

    private static _ShowStatusIcon(player: mod.Player, pos: mod.Vector, message: mod.Message, color: mod.Vector): void {
        const id = mod.GetObjId(player);
        let icon = PropSpawner._statusIcons.get(id);
        if (!icon) {
            icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, pos, PROP_SPAWNER_ZERO_VEC) as mod.WorldIcon;
            if (!icon) return;
            mod.SetWorldIconImage(icon, mod.WorldIconImages.Alert);
            PropSpawner._statusIcons.set(id, icon);
        }
        mod.EnableWorldIconText(icon, false);
        mod.SetWorldIconText(icon, message);
        mod.SetWorldIconColor(icon, color);
        mod.SetWorldIconPosition(icon, pos);
        mod.SetWorldIconOwner(icon, player);
        mod.EnableWorldIconImage(icon, true);
        mod.EnableWorldIconText(icon, true);
    }

    private static _HideStatusIcon(id: number): void {
        const icon = PropSpawner._statusIcons.get(id);
        if (!icon) return;
        mod.EnableWorldIconImage(icon, false);
        mod.EnableWorldIconText(icon, false);
    }

    private static _RotateAnchorProp(player: mod.Player, lineDir: mod.Vector): void {
        const id = mod.GetObjId(player);
        const objects = PropSpawner._playerSpawnedObjects.get(id);
        if (!objects || objects.length === 0) return;
        const anchor = objects[objects.length - 1];
        PropSpawner._lineDir.set(id, lineDir);
        const ldx = mod.XComponentOf(lineDir);
        const ldz = mod.ZComponentOf(lineDir);
        const perp1x = -ldz;
        const perp1z = ldx;
        const anchorPos = PropSpawner._lineAnchorPos.get(id) ?? PROP_SPAWNER_ZERO_VEC;
        const playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
        const toPx = mod.XComponentOf(playerPos) - mod.XComponentOf(anchorPos);
        const toPz = mod.ZComponentOf(playerPos) - mod.ZComponentOf(anchorPos);
        const dot = perp1x * toPx + perp1z * toPz;
        const facingX = dot >= 0 ? perp1x : -perp1x;
        const facingZ = dot >= 0 ? perp1z : -perp1z;
        const yaw = Math.atan2(facingX, facingZ);
        const rot = mod.CreateVector(0, yaw, 0);
        PropSpawner._lineAnchorRot.set(id, rot);
        const objectPos = PropSpawner._ComputeObjectPosFromPivot(anchorPos, yaw, PropSpawner._GetPropConfig(id));
        try { mod.SetObjectTransform(anchor as mod.SpatialObject, mod.CreateTransform(objectPos, rot)); } catch { }
    }

    private static _FinalizeLinePlacement(player: mod.Player): void {
        const id = mod.GetObjId(player);
        const anchorPos = PropSpawner._lineAnchorPos.get(id);
        const anchorRot = PropSpawner._lineAnchorRot.get(id);
        const count = PropSpawner._lineCount.get(id) ?? 1;
        const config = PropSpawner._GetPropConfig(id);
        const lineDir = PropSpawner._lineDir.get(id);
        const facingYaw = anchorRot !== undefined ? mod.YComponentOf(anchorRot) : 0;
        const effectiveStep = lineDir ? PropSpawner._ComputeEffectiveStep(lineDir, facingYaw, config) : config.width;

        // Move the in-progress anchor to the permanent placed objects list
        const inProgressList = PropSpawner._playerSpawnedObjects.get(id);
        if (inProgressList) {
            for (const obj of inProgressList) {
                PropSpawner._allPlacedObjects.push(obj);
            }
            PropSpawner._playerSpawnedObjects.delete(id);
        }

        // Spawn child props along the line
        if (anchorPos && lineDir && count > 1) {
            const childYaw = anchorRot !== undefined ? mod.YComponentOf(anchorRot) : 0;
            for (let i = 1; i < count; i++) {
                const offset = i * effectiveStep;
                const childPivot = mod.CreateVector(
                    mod.XComponentOf(anchorPos) + mod.XComponentOf(lineDir) * offset,
                    mod.YComponentOf(anchorPos),
                    mod.ZComponentOf(anchorPos) + mod.ZComponentOf(lineDir) * offset
                );
                const childObjectPos = PropSpawner._ComputeObjectPosFromPivot(childPivot, childYaw, config);
                const prop = mod.SpawnObject(config.prop as mod.RuntimeSpawn_Sand, childObjectPos, anchorRot!, PROP_SPAWNER_ONE_VEC);
                if (prop) PropSpawner._allPlacedObjects.push(prop);
            }
        }

        // Stagger VFX at each placed prop position (fire-and-forget)
        if (anchorPos) {
            const fxAnchorPos = anchorPos;
            const fxLineDir = lineDir;
            const fxStep = effectiveStep;
            const fxCount = count;
            (async () => {
                const anchorLandVfx = mod.SpawnObject(PROP_SPAWNER_VFX_PROP_LAND, fxAnchorPos, PROP_SPAWNER_ZERO_VEC) as mod.VFX;
                if (anchorLandVfx) mod.EnableVFX(anchorLandVfx, true);
                for (let i = 1; i < fxCount; i++) {
                    await mod.Wait(0.05);
                    if (!fxLineDir) break;
                    const pos = mod.CreateVector(
                        mod.XComponentOf(fxAnchorPos) + mod.XComponentOf(fxLineDir) * i * fxStep,
                        mod.YComponentOf(fxAnchorPos),
                        mod.ZComponentOf(fxAnchorPos) + mod.ZComponentOf(fxLineDir) * i * fxStep
                    );
                    const childLandVfx = mod.SpawnObject(PROP_SPAWNER_VFX_PROP_LAND, pos, PROP_SPAWNER_ZERO_VEC) as mod.VFX;
                    if (childLandVfx) mod.EnableVFX(childLandVfx, true);
                }
            })();
        }

        // Start the cooldown before this player can place again.
        PropSpawner._cooldownUntil.set(id, (Date.now() / 1000) + PROP_SPAWNER_COOLDOWN_SECONDS);

        // Advance prop cycle index so next row uses the next prop
        const currentIdx = PropSpawner._propIndex.get(id) ?? 0;
        PropSpawner._propIndex.set(id, currentIdx + 1);

        // Exit line mode
        PropSpawner._lineMode.delete(id);
        PropSpawner._lineAnchorPos.delete(id);
        PropSpawner._lineAnchorRot.delete(id);
        PropSpawner._lineDir.delete(id);
        PropSpawner._lineCursorPos.delete(id);
        PropSpawner._ratchetAngle.delete(id);
        PropSpawner._ratchetNotch.delete(id);
        PropSpawner._lineFrozen.delete(id);
        const finalizeHintVfx = PropSpawner._lineHintVfx.get(id);
        if (finalizeHintVfx) {
            mod.EnableVFX(finalizeHintVfx, false);
            try { mod.UnspawnObject(finalizeHintVfx as unknown as mod.Object); } catch { }
            PropSpawner._lineHintVfx.delete(id);
        }
        const finalizeSlotConfirm = PropSpawner._lineSlotConfirmVfx.get(id);
        if (finalizeSlotConfirm) {
            for (const sv of finalizeSlotConfirm) if (sv) { mod.EnableVFX(sv, false); try { mod.UnspawnObject(sv as unknown as mod.Object); } catch { } }
            PropSpawner._lineSlotConfirmVfx.delete(id);
        }
        PropSpawner._UnspawnSideTorches(id);
        PropSpawner._UnspawnSlotTorches(id);
        PropSpawner._HideLinePreviews(player);
        PropSpawner._HideStatusIcon(id);
        PropSpawner._HidePreviewIcon(id);

        // Placement is done -- apply any equipment refresh that was held back while it was in progress.
        PropSpawner._FlushDeferredEquipmentRefresh(player);
    }

    private static _CancelLinePlacement(player: mod.Player): void {
        const id = mod.GetObjId(player);
        // Remove the in-progress anchor prop
        const objects = PropSpawner._playerSpawnedObjects.get(id);
        if (objects && objects.length > 0) {
            const anchor = objects.pop()!;
            try { mod.UnspawnObject(anchor); } catch { }
            if (objects.length === 0) PropSpawner._playerSpawnedObjects.delete(id);
        }
        PropSpawner._lineMode.delete(id);
        PropSpawner._lineAnchorPos.delete(id);
        PropSpawner._lineAnchorRot.delete(id);
        PropSpawner._lineDir.delete(id);
        PropSpawner._lineCursorPos.delete(id);
        PropSpawner._ratchetAngle.delete(id);
        PropSpawner._ratchetNotch.delete(id);
        PropSpawner._lineFrozen.delete(id);
        const cancelHintVfx = PropSpawner._lineHintVfx.get(id);
        if (cancelHintVfx) {
            mod.EnableVFX(cancelHintVfx, false);
            try { mod.UnspawnObject(cancelHintVfx as unknown as mod.Object); } catch { }
            PropSpawner._lineHintVfx.delete(id);
        }
        const cancelSlotConfirm = PropSpawner._lineSlotConfirmVfx.get(id);
        if (cancelSlotConfirm) {
            for (const sv of cancelSlotConfirm) if (sv) { mod.EnableVFX(sv, false); try { mod.UnspawnObject(sv as unknown as mod.Object); } catch { } }
            PropSpawner._lineSlotConfirmVfx.delete(id);
        }
        PropSpawner._UnspawnSideTorches(id);
        PropSpawner._UnspawnSlotTorches(id);
        PropSpawner._HideLinePreviews(player);
        PropSpawner._HideStatusIcon(id);
        PropSpawner._HidePreviewIcon(id);

        // Placement is done -- apply any equipment refresh that was held back while it was in progress.
        PropSpawner._FlushDeferredEquipmentRefresh(player);
    }
}

// ============================================================
// DecoySpawner -- survivor decoy bot (Misc_PortalGadget tool, "decoy_gadget" roll)
// ============================================================

const DECOY_HEALTH = 800;
const DECOY_LIFETIME_SECONDS = 45;
const DECOY_STANCES: mod.Stance[] = [mod.Stance.Stand, mod.Stance.Crouch];
const DECOY_VFX_LAUNCH: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.FX_Gadget_PTKM_Mine_Launch;
const DECOY_VFX_DESTRUCTION: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.FX_Gadget_Generic_Destruction_Electronic;
// Vertical offset so the life-timer countdown icon floats near the decoy's torso instead of
// sitting at its feet.
const DECOY_TIMER_ICON_HEIGHT_OFFSET = 1.2;
// Countdown icon color thresholds -- starts green, ambers up as time runs out.
const DECOY_TIMER_COLOR_NORMAL = mod.CreateVector(0.2, 1, 0.2);
const DECOY_TIMER_COLOR_WARN = mod.CreateVector(1, 0.85, 0.1);
const DECOY_TIMER_COLOR_CRITICAL = mod.CreateVector(1, 0.45, 0.1);
const DECOY_TIMER_WARN_SECONDS = 10;
const DECOY_TIMER_CRITICAL_SECONDS = 5;

// Fired at the player's point of aim when a placement attempt is blocked (already-placed decoy
// or an invalid surface) -- spawned once, held briefly, then removed. No live repositioning.
const DECOY_BLOCKED_ICON_DURATION_SECONDS = 2;
const DECOY_BLOCKED_ICON_COLOR = mod.CreateVector(1, 0.2, 0.2);

interface DecoyBotEntry {
    ownerPlayer: mod.Player;
    botPlayer?: mod.Player;
    botObjId: number;
    spawnerID: number;
    spawnPos?: mod.Vector;
    worldIcon?: mod.WorldIcon;
    // Bumped whenever the decoy is removed by any path -- the life-timer loop below checks
    // this each second and bails out the instant it no longer matches its own token.
    lifeToken: number;
}

interface DecoyPendingSpawn {
    ownerObjId: number;
    ownerPlayer: mod.Player;
    pos: mod.Vector;
    rot: mod.Vector;
}

class DecoySpawner {
    // Player ids currently holding the decoy roll of the portal gadget tool this round.
    static readonly _equipped: Set<number> = new Set();
    static readonly _raycastInFlight: Set<number> = new Set();
    // Player ids for whom the decoy gadget is currently their actively-held item -- tracked
    // purely to detect the rising edge that fires the ShowAlphaFeedback hint banner once.
    static readonly _gadgetHeld: Set<number> = new Set();
    // Owner objId -> their decoy (pending or already spawned). Only one entry per owner --
    // its presence is what blocks placing a second decoy.
    static readonly _ownerToBot: Map<number, DecoyBotEntry> = new Map();
    // Reverse lookup once the bot has actually spawned, for death/cleanup routing.
    static readonly _botOwnerByObjId: Map<number, number> = new Map();
    static readonly _activeBotObjIds: Set<number> = new Set();
    // Spawner requests in flight, keyed by the AI spawner's objId (matches OnSpawnerSpawned).
    static readonly _pendingBySpawnerID: Map<number, DecoyPendingSpawn> = new Map();
    private static _lifeTokenSeq: number = 0;

    static IsEquipped(player: mod.Player): boolean {
        return DecoySpawner._equipped.has(mod.GetObjId(player));
    }

    /** Called from InitializePlayerEquipment when a survivor's loadout rolls this gadget. */
    static InitPlayer(player: mod.Player): void {
        DecoySpawner._equipped.add(mod.GetObjId(player));
    }

    static HasRaycastInFlight(id: number): boolean {
        return DecoySpawner._raycastInFlight.has(id);
    }

    private static _GetRaycastVectors(player: mod.Player): { start: mod.Vector; end: mod.Vector } {
        const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
        const eyePos = mod.GetSoldierState(player, mod.SoldierStateVector.EyePosition);
        const start = mod.Add(eyePos, facing);
        const end = mod.Add(start, mod.Multiply(facing, PROP_SPAWNER_MAX_DISTANCE));
        return { start, end };
    }

    private static _GetFacingPlayerRotation(player: mod.Player): mod.Vector {
        const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
        const yaw = Math.atan2(-mod.XComponentOf(facing), -mod.ZComponentOf(facing));
        return mod.CreateVector(0, yaw, 0);
    }

    /** Finds a survivor AI spawner not currently locked by AISpawnHandler/InfectedBotSlot/SurvivorBotSlot. */
    private static _PickFreeSpawnerID(): number | undefined {
        for (const id of SURVIVOR_AI_SPAWNERS) {
            if (!AISpawnHandler.spawnerLock.has(id)) return id;
        }
        return undefined;
    }

    static OnFireStart(player: mod.Player): void {
        const id = mod.GetObjId(player);
        if (!DecoySpawner._equipped.has(id)) return; // doesn't have this gadget equipped
        if (DecoySpawner._ownerToBot.has(id)) {
            // Only one decoy active/pending at a time -- block and give feedback at the
            // player's point of aim instead of silently eating the fire input.
            Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, player);
            const { end } = DecoySpawner._GetRaycastVectors(player);
            DecoySpawner._ShowBlockedIcon(player, end, MakeMessage(mod.stringkeys.decoy_hint_already_placed));
            return;
        }
        if (DecoySpawner._raycastInFlight.has(id)) return;
        const { start, end } = DecoySpawner._GetRaycastVectors(player);
        DecoySpawner._raycastInFlight.add(id);
        mod.RayCast(player, start, end);
    }

    static OnFireStop(_player: mod.Player): void {
        // No-op: single fire-and-forget placement, nothing to release.
    }

    static OnAimStart(_player: mod.Player): void { }
    static OnAimStop(_player: mod.Player): void { }
    static OnLaserToggle(_player: mod.Player, _eventBoolean: boolean): void { }

    /**
     * Banner hint tick. Reuses the same one-shot feedback banner alpha infected see on
     * LEAP_ATTACK_AREA_TRIGGER_ID enter (PlayerProfile.ShowAlphaFeedback) rather than a
     * separate notification slot -- fires once on the rising edge of the decoy gadget
     * becoming the player's actively held item, not continuously every tick.
     */
    static OngoingTick(player: mod.Player): void {
        if (!mod.IsPlayerValid(player)) return;
        const id = mod.GetObjId(player);
        if (!DecoySpawner._equipped.has(id)) return;

        const isHeldNow = mod.IsInventorySlotActive(player, mod.InventorySlots.GadgetOne);
        const wasHeld = DecoySpawner._gadgetHeld.has(id);
        if (isHeldNow && !wasHeld) {
            const playerProfile = PlayerProfile.Get(player);
            const message = DecoySpawner._ownerToBot.has(id)
                ? ResolveStringKeyMessage("decoy_hint_already_placed")
                : ResolveStringKeyMessage("decoy_hint_fire_to_place");
            playerProfile?.ShowAlphaFeedback(message);
        }

        if (isHeldNow) {
            DecoySpawner._gadgetHeld.add(id);
        } else {
            DecoySpawner._gadgetHeld.delete(id);
        }
    }

    /** One-shot warning icon at `pos` -- no live repositioning, just shown then removed. */
    private static async _ShowBlockedIcon(player: mod.Player, pos: mod.Vector, message: mod.Message): Promise<void> {
        const icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, pos, ZERO_VEC) as mod.WorldIcon;
        if (!icon) return;
        mod.SetWorldIconOwner(icon, player);
        mod.SetWorldIconImage(icon, mod.WorldIconImages.Cross);
        mod.SetWorldIconColor(icon, DECOY_BLOCKED_ICON_COLOR);
        mod.SetWorldIconText(icon, message);
        mod.EnableWorldIconImage(icon, true);
        mod.EnableWorldIconText(icon, true);
        await mod.Wait(DECOY_BLOCKED_ICON_DURATION_SECONDS);
        try {
            mod.EnableWorldIconImage(icon, false);
            mod.EnableWorldIconText(icon, false);
            mod.UnspawnObject(icon as unknown as mod.Object);
        } catch { }
    }

    static OnRayCastHit(player: mod.Player, point: mod.Vector, normal: mod.Vector): void {
        const id = mod.GetObjId(player);
        DecoySpawner._raycastInFlight.delete(id);
        // Same floor/surface validity check as PropSpawner: normal must be pointing mostly up.
        const isFloor = mod.YComponentOf(normal) >= PROP_SPAWNER_MIN_FLOOR_NORMAL_Y;
        if (!isFloor) {
            Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, player);
            DecoySpawner._ShowBlockedIcon(player, point, MakeMessage(mod.stringkeys.decoy_invalid_surface));
            return;
        }
        DecoySpawner._RequestSpawn(player, point);
    }

    static OnRayCastMissed(player: mod.Player): void {
        DecoySpawner._raycastInFlight.delete(mod.GetObjId(player));
        Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, player);
        const { end } = DecoySpawner._GetRaycastVectors(player);
        DecoySpawner._ShowBlockedIcon(player, end, MakeMessage(mod.stringkeys.decoy_out_of_range));
    }

    private static _SpawnAndEnableVfx(vfx: mod.RuntimeSpawn_Common, pos: mod.Vector): void {
        const fx = mod.SpawnObject(vfx, pos, ZERO_VEC) as mod.VFX;
        if (fx) mod.EnableVFX(fx, true);
    }

    private static _RequestSpawn(owner: mod.Player, pos: mod.Vector): void {
        const ownerID = mod.GetObjId(owner);
        if (DecoySpawner._ownerToBot.has(ownerID)) return; // race guard
        const spawnerID = DecoySpawner._PickFreeSpawnerID();
        if (spawnerID === undefined) {
            console.log(`DecoySpawner | No free AI spawner available for Player(${ownerID})`);
            Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, owner);
            return;
        }
        const spawnerObj = mod.GetSpawner(spawnerID);
        const rot = DecoySpawner._GetFacingPlayerRotation(owner);
        AISpawnHandler.spawnerLock.add(spawnerID);
        DecoySpawner._pendingBySpawnerID.set(spawnerID, { ownerObjId: ownerID, ownerPlayer: owner, pos, rot });
        // Reserve immediately so a second fire before the bot arrives can't queue another spawn.
        DecoySpawner._ownerToBot.set(ownerID, { ownerPlayer: owner, botObjId: -1, spawnerID, lifeToken: 0 });
        console.log(`DecoySpawner | Requesting decoy spawn for Player(${ownerID}) on spawner(${spawnerID})`);
        // Fires the moment the player places the decoy, ahead of the AI actually arriving.
        DecoySpawner._SpawnAndEnableVfx(DECOY_VFX_LAUNCH, pos);
        mod.SpawnAIFromAISpawner(spawnerObj, mod.SoldierClass.Assault, MakeMessage(mod.stringkeys.decoy_bot_name), SURVIVOR_TEAM);
    }

    /** Called from OnSpawnerSpawned once a requested decoy bot actually arrives. */
    static HandleSpawned(player: mod.Player, playerObjID: number, spawnerObjID: number): boolean {
        const pending = DecoySpawner._pendingBySpawnerID.get(spawnerObjID);
        if (!pending) return false;
        DecoySpawner._pendingBySpawnerID.delete(spawnerObjID);
        AISpawnHandler.spawnerLock.delete(spawnerObjID);

        const ownerID = pending.ownerObjId;
        const reservation = DecoySpawner._ownerToBot.get(ownerID);
        if (!DecoySpawner._equipped.has(ownerID) || !reservation || reservation.spawnerID !== spawnerObjID) {
            // Owner cancelled (died/undeployed/re-rolled) while the spawn was in flight.
            DecoySpawner._ownerToBot.delete(ownerID);
            try { mod.Kill(player); } catch { }
            return true;
        }

        mod.Teleport(player, pending.pos, mod.YComponentOf(pending.rot));

        mod.SetPlayerMaxHealth(player, DECOY_HEALTH);
        mod.Heal(player, DECOY_HEALTH);

        // Randomized pistol.
        const pistolPool = Weapons.baseWeapons.filter(w => w.category === ItemPoolCategory.sidearm);
        const pistolDef = Weapons.getRandomWeaponFromRarity(pistolPool);
        try { mod.RemoveEquipment(player, mod.InventorySlots.PrimaryWeapon); } catch { }
        try { mod.RemoveEquipment(player, mod.InventorySlots.SecondaryWeapon); } catch { }
        try { mod.RemoveEquipment(player, mod.InventorySlots.GadgetOne); } catch { }
        try { mod.RemoveEquipment(player, mod.InventorySlots.GadgetTwo); } catch { }
        try { mod.RemoveEquipment(player, mod.InventorySlots.Throwable); } catch { }
        try { mod.RemoveEquipment(player, mod.InventorySlots.ClassGadget); } catch { }
        if (pistolDef) {
            mod.AddEquipment(player, pistolDef.item as mod.Weapons, pistolDef.packageImage as mod.WeaponPackage);
        }

        // No movement, no targeting, no firing -- it just stands/crouches/prones there as bait.
        mod.AIIdleBehavior(player);
        try { mod.AIEnableTargeting(player, false); } catch { }
        try { mod.AIEnableShooting(player, false); } catch { }
        try { mod.AISetTarget(player); } catch { }
        mod.AISetStance(player, DECOY_STANCES[Math.floor(Math.random() * DECOY_STANCES.length)]);

        const botObjId = mod.GetObjId(player);
        const entry: DecoyBotEntry = {
            ownerPlayer: pending.ownerPlayer,
            botPlayer: player,
            botObjId,
            spawnerID: spawnerObjID,
            spawnPos: pending.pos,
            lifeToken: 0,
        };
        DecoySpawner._ownerToBot.set(ownerID, entry);
        DecoySpawner._botOwnerByObjId.set(botObjId, ownerID);
        DecoySpawner._activeBotObjIds.add(botObjId);
        console.log(`DecoySpawner | Spawned decoy Player(${botObjId}) for owner Player(${ownerID})`);
        DecoySpawner._RunLifeTimer(entry);
        return true;
    }

    /** Ticks the world-icon countdown (owner-only) and kills the decoy once its lifetime runs out. */
    private static async _RunLifeTimer(entry: DecoyBotEntry): Promise<void> {
        const token = ++DecoySpawner._lifeTokenSeq;
        entry.lifeToken = token;

        // Float the icon up near the decoy's torso instead of at its feet.
        const basePos = entry.spawnPos ?? ZERO_VEC;
        const iconPos = mod.CreateVector(
            mod.XComponentOf(basePos),
            mod.YComponentOf(basePos) + DECOY_TIMER_ICON_HEIGHT_OFFSET,
            mod.ZComponentOf(basePos)
        );
        const icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, iconPos, ZERO_VEC) as mod.WorldIcon;
        if (icon) {
            mod.SetWorldIconOwner(icon, entry.ownerPlayer); // visible only to the player who placed it
            mod.SetWorldIconColor(icon, DECOY_TIMER_COLOR_NORMAL);
            entry.worldIcon = icon;
        }

        let remaining = DECOY_LIFETIME_SECONDS;
        while (remaining > 0) {
            if (entry.lifeToken !== token) return; // superseded -- decoy already removed elsewhere
            if (icon) {
                mod.SetWorldIconText(icon, MakeMessage(mod.stringkeys.decoy_timer_remaining, Math.ceil(remaining)));
                mod.EnableWorldIconText(icon, true);
                const color = remaining <= DECOY_TIMER_CRITICAL_SECONDS
                    ? DECOY_TIMER_COLOR_CRITICAL
                    : remaining <= DECOY_TIMER_WARN_SECONDS
                        ? DECOY_TIMER_COLOR_WARN
                        : DECOY_TIMER_COLOR_NORMAL;
                mod.SetWorldIconColor(icon, color);
            }
            await mod.Wait(1);
            remaining -= 1;
        }

        if (entry.lifeToken !== token) return;

        console.log(`DecoySpawner | Decoy lifetime expired for owner Player(${mod.GetObjId(entry.ownerPlayer)})`);
        if (entry.botPlayer && PlayerIsAliveAndValid(entry.botPlayer)) {
            // Actual teardown (icon/timer cleanup, destruction VFX, freeing the owner's slot)
            // happens in HandleDeath once this kill resolves through OnPlayerDied.
            try { mod.Kill(entry.botPlayer); } catch { }
        }
    }

    /** Stops a decoy's life-timer loop and removes its world icon. Safe to call more than once. */
    private static _StopLifeTimerAndIcon(entry: DecoyBotEntry): void {
        entry.lifeToken++;
        if (entry.worldIcon) {
            try {
                mod.EnableWorldIconText(entry.worldIcon, false);
                mod.UnspawnObject(entry.worldIcon as unknown as mod.Object);
            } catch { }
            entry.worldIcon = undefined;
        }
    }

    /** Returns true if `spawnerObjID` was a decoy request (whether or not a bot resulted). */
    static HasPendingSpawnOn(spawnerObjID: number): boolean {
        return DecoySpawner._pendingBySpawnerID.has(spawnerObjID);
    }

    /**
     * Called from OnPlayerDied when an AI soldier with no bot-slot dies -- covers both a
     * natural health-zero death and the life-timer's expiry kill. Returns true if it was a
     * decoy. Plays the destruction VFX at its last known position and frees the owner's slot.
     */
    static HandleDeath(bot: mod.Player, botObjId: number): boolean {
        const ownerID = DecoySpawner._botOwnerByObjId.get(botObjId);
        if (ownerID === undefined) return false;
        DecoySpawner._botOwnerByObjId.delete(botObjId);
        DecoySpawner._activeBotObjIds.delete(botObjId);

        const entry = DecoySpawner._ownerToBot.get(ownerID);
        let deathPos = entry?.spawnPos;
        try {
            deathPos = mod.GetSoldierState(bot, mod.SoldierStateVector.GetPosition) ?? deathPos;
        } catch { }

        if (entry) {
            DecoySpawner._StopLifeTimerAndIcon(entry);
            if (entry.botObjId === botObjId) {
                // Frees the owner up to place another decoy.
                DecoySpawner._ownerToBot.delete(ownerID);
            }
        }

        if (deathPos) {
            DecoySpawner._SpawnAndEnableVfx(DECOY_VFX_DESTRUCTION, deathPos);
        }

        console.log(`DecoySpawner | Decoy Player(${botObjId}) died -- owner Player(${ownerID}) can place another`);
        return true;
    }

    /**
     * Called from InitializePlayerEquipment on every mid-round equipment refresh (LMS, Final
     * Five, etc.). Only resets the gadget-tool bookkeeping (equipped/raycast-in-flight/banner) --
     * an already-placed decoy is left alone so it survives round-phase changes. Full teardown
     * (killing the decoy itself) only happens via CleanupPlayer.
     */
    static CleanupPlayerGadgetState(player: mod.Player): void {
        const id = mod.GetObjId(player);
        DecoySpawner._equipped.delete(id);
        DecoySpawner._raycastInFlight.delete(id);
        DecoySpawner._gadgetHeld.delete(id);
    }

    /** Called on owner death/undeploy and round end: kills/unspawns their decoy (pending or alive). */
    static CleanupPlayer(player: mod.Player): void {
        const id = mod.GetObjId(player);
        DecoySpawner.CleanupPlayerGadgetState(player);

        const entry = DecoySpawner._ownerToBot.get(id);
        if (entry) {
            DecoySpawner._ownerToBot.delete(id);
            DecoySpawner._StopLifeTimerAndIcon(entry);
            if (entry.botPlayer && PlayerIsAliveAndValid(entry.botPlayer)) {
                try { mod.Kill(entry.botPlayer); } catch { }
            }
            if (entry.botObjId >= 0) {
                DecoySpawner._botOwnerByObjId.delete(entry.botObjId);
                DecoySpawner._activeBotObjIds.delete(entry.botObjId);
            }
        }
        // Spawn still in flight (bot hasn't arrived yet) -- release the spawner so it isn't stuck locked.
        for (const [spawnerID, pending] of DecoySpawner._pendingBySpawnerID) {
            if (pending.ownerObjId === id) {
                DecoySpawner._pendingBySpawnerID.delete(spawnerID);
                AISpawnHandler.spawnerLock.delete(spawnerID);
            }
        }
    }

    /** Round-end sweep: decoys are never persistent between rounds. */
    static CleanupAllDecoys(): void {
        for (const entry of DecoySpawner._ownerToBot.values()) {
            DecoySpawner._StopLifeTimerAndIcon(entry);
            if (entry.botPlayer && PlayerIsAliveAndValid(entry.botPlayer)) {
                try { mod.Kill(entry.botPlayer); } catch { }
            }
        }
        for (const spawnerID of DecoySpawner._pendingBySpawnerID.keys()) {
            AISpawnHandler.spawnerLock.delete(spawnerID);
        }
        DecoySpawner._ownerToBot.clear();
        DecoySpawner._pendingBySpawnerID.clear();
        DecoySpawner._botOwnerByObjId.clear();
        DecoySpawner._activeBotObjIds.clear();
        DecoySpawner._equipped.clear();
        DecoySpawner._raycastInFlight.clear();
        DecoySpawner._gadgetHeld.clear();
    }

    static IsActiveDecoyObjId(objId: number): boolean {
        return DecoySpawner._activeBotObjIds.has(objId);
    }

    /**
     * Returns `owner`'s active decoy, if any. Used to redirect infected AI targeting: only an
     * infected whose natural target *is* this owner gets swapped onto the decoy -- it stands in
     * for its owner rather than pulling aggro off unrelated survivors.
     */
    static GetActiveDecoyForOwner(owner: mod.Player): mod.Player | undefined {
        const entry = DecoySpawner._ownerToBot.get(mod.GetObjId(owner));
        if (entry?.botPlayer && PlayerIsAliveAndValid(entry.botPlayer)) {
            return entry.botPlayer;
        }
        return undefined;
    }
}

// ============================================================
// TurretSpawner -- survivor sentry turret (Misc_PortalGadget tool, "turret_gadget" roll)
// A real AI Player (spawned via an AI spawner, same approach as DecoySpawner) rather than a
// plain prop -- that's what gives it genuine hit detection via OnPlayerDamaged/OnPlayerDied.
// Unarmed, always crouched, immobile; its own targeting/shooting are disabled and every attack
// is scripted (see _FireAtTarget). The AI body is spun to face its target via AISetFocusPoint
// (a Player can't be turned with MoveObject the way a prop can).
//
// Four states (TurretState):
//  - standby:  idle, yaw-sweeping its 60 deg cone (visualized with a claymore tripwire VFX),
//              quiet idle loop.
//  - warning:  a target entered range/FOV (or is behind it, within rear-engage range) with
//              confirmed LOS -- see _BeginLosCheck. A couple of alarm blips play once, then
//              TURRET_TARGET_LOCK_GRACE_SECONDS of silence before it opens fire. A rear target
//              gets an extra turn-to-face first (the "rotating" sub-phase).
//  - engaging: continuous scripted fire (_FireAtTarget) until the target dies, fails the
//              range/FOV check, or an occasional LOS upkeep raycast catches it behind cover.
//  - returning: target lost -- one-shot stand-down cue, standby visuals resume immediately,
//              turret yaws back to rest. A fresh target can interrupt this before it finishes.
// ============================================================

const TURRET_HEALTH = 800;
// How far ahead of the eye the placement raycast's origin is pushed -- see _GetRaycastVectors.
const TURRET_PLACEMENT_RAYCAST_ORIGIN_OFFSET_METERS = 0.5;
// If a requested AI spawn hasn't resolved (HandleSpawned never ran) within this long, the
// reservation is treated as stale/failed -- see _IsReservationStillValid/_ReclaimStaleReservation.
// A silently-rejected spawn (e.g. the placement point turned out to be invalid once the AI
// spawner actually tried to use it) would otherwise leave _ownerToTurret permanently reserved,
// blocking the owner from ever placing again.
const TURRET_PENDING_SPAWN_TIMEOUT_SECONDS = 3;
const TURRET_RANGE_METERS = 25;
const TURRET_FOV_DEGREES = 60;
const TURRET_HALF_FOV_DEGREES = TURRET_FOV_DEGREES / 2;
const TURRET_FIRE_RPM = 200;
const TURRET_FIRE_INTERVAL_SECONDS = 60 / TURRET_FIRE_RPM;
const TURRET_DAMAGE_MIN = 5;
const TURRET_DAMAGE_MAX = 10;
const TURRET_TARGET_LOCK_GRACE_SECONDS = 0.75; // Warning-state reaction window before firing
const TURRET_COOLDOWN_AFTER_DESTROYED_SECONDS = 5;
const TURRET_TICK_SECONDS = 0.1; // 10Hz state-machine tick -- see TurretSpawner._RunLoop
const TURRET_DAMAGE_VFX_LIGHT_THRESHOLD = 0.5;
const TURRET_DAMAGE_VFX_HEAVY_THRESHOLD = 0.2;

// Warning-state alarm: TURRET_ALARM_BLIP_COUNT short blips, spaced apart, played once on
// entering Warning -- the rest of the grace period is deliberately silent.
const TURRET_ALARM_BLIP_SECONDS = 0.05;
const TURRET_ALARM_BLIP_COUNT = 2;
const TURRET_ALARM_BLIP_GAP_SECONDS = 0.1;

const TURRET_IDLE_SWEEP_LEG_SECONDS = 3.0; // time to sweep from one edge of the cone to the other
const TURRET_FOCUS_POINT_DISTANCE = 10; // how far ahead the AISetFocusPoint target sits

// A target behind the turret's normal cone can still be engaged if it's this close and the
// turret has line-of-sight to it. Same duration reused for the Returning turn-back animation.
const TURRET_REAR_ENGAGE_RANGE_METERS = 15;
const TURRET_REAR_ROTATE_SECONDS = 1.0;
// Target-acquisition scan cadence (standby/returning only) -- gates both the front- and
// rear-candidate LOS raycast in _RunLoop.
const TURRET_LOS_CHECK_INTERVAL_SECONDS = 0.3;
// Slower cadence for the upkeep LOS recheck run while Engaging (catches a target ducking
// behind cover mid-fight).
const TURRET_ENGAGE_LOS_CHECK_INTERVAL_SECONDS = 0.5;
// The raycast's endpoint is the candidate's own EyePosition, so a "hit" landing at/near that
// point just means it reached what it was aimed at, not a real obstruction -- only a hit
// landing more than this many meters short of it counts as genuinely blocked.
const TURRET_LOS_HIT_TOLERANCE_METERS = 1.5;

const TURRET_VFX_LAUNCH = mod.RuntimeSpawn_Common.FX_Gadget_PTKM_Mine_Launch;
// Same blinking-lights family used by TickLeap's crouch-charge indicator (see the 'charging'
// chargeVfxState branch) -- swapped in for the previous EIDOS standby/active pair so the
// turret reads with the same "something's spooling up" language as the leap attack.
const TURRET_VFX_STANDBY = mod.RuntimeSpawn_Common.FX_Gadget_MPAPS_Lights_Standby;
const TURRET_VFX_ACTIVE = mod.RuntimeSpawn_Common.FX_Gadget_MPAPS_Lights_Active;
const TURRET_VFX_FIRE = mod.RuntimeSpawn_Common.FX_Gadget_EIDOS_Projectile_Launch;
const TURRET_VFX_DESTRUCTION = mod.RuntimeSpawn_Common.FX_Gadget_EIDOS_Destruction;
// Simple targeting-laser read for the Engaging state, spawned alongside TURRET_VFX_ACTIVE at
// entry.pos (ground level) -- directly below the raised claymore FOV cone VFX, see
// TURRET_VFX_FOV_CONE_HEIGHT_OFFSET_METERS.
const TURRET_VFX_ENGAGE_TRACER = mod.RuntimeSpawn_Common.FX_TracerDart_Projectile_Glow;
const TURRET_SFX_FIRE = mod.RuntimeSpawn_Common.SFX_Gadgets_EIDOS_Fire_OneShot3D;
const TURRET_SFX_STANDBY_LOOP = mod.RuntimeSpawn_Common.SFX_Gadgets_EIDOS_Idle_SimpleLoop3D;
const TURRET_SFX_ALARM_BLIP = mod.RuntimeSpawn_Common.SFX_GameModes_Rush_Alarm_SimpleLoop3D;
const TURRET_SFX_RETURNING = mod.RuntimeSpawn_Common.SFX_GameModes_Rush_Defused_OneShot3D;
// Turret's own destruction cue -- distinct from TURRET_SFX_RETURNING ("lost this target" vs
// "the turret itself just died").
const TURRET_SFX_DESTROYED_POWERDOWN = mod.RuntimeSpawn_Common.SFX_Gadgets_EIDOS_Disabled_OneShot3D;
const TURRET_SPOT_DURATION_SECONDS = 10;
const TURRET_VFX_DAMAGE_LIGHT = mod.RuntimeSpawn_Common.FX_Gadget_RemoteTurret_Damage_Light;
const TURRET_VFX_DAMAGE_HEAVY = mod.RuntimeSpawn_Common.FX_Gadget_RemoteTurret_Box_Damage;
// Claymore's laser tripwire, repurposed as a rough visual for the turret's detection cone.
const TURRET_VFX_FOV_CONE = mod.RuntimeSpawn_Common.FX_Mine_M18_Claymore_Laser_Tripwire;
// entry.pos is the raycast-hit floor point the turret was placed on (see OnRayCastHit), so the
// claymore VFX spawns at ground level by default. Offset it up toward eye height for the bot's
// crouched stance (see HandleSpawned's AISetStance(Crouch)) so the tripwire actually reads as
// coming from the turret's "eyes" instead of lying flat on the floor. Standing eye height would
// be ~1.2, but that floats visibly above a crouched bot's head -- halved to sit at crouched eye
// height instead.
const TURRET_VFX_FOV_CONE_HEIGHT_OFFSET_METERS = 0.6;
// Our yaw convention (atan2(-x,-z), matching PropSpawner/DecoySpawner's placement rotation
// math) doesn't line up with SpawnObject's rotation-vector convention -- every VFX spawned
// facing a turret yaw needs this correction; see TurretSpawner._YawToRotationVector.
const TURRET_VFX_YAW_OFFSET_RAD = Math.PI;

// World icon shown above the turret's head, visible only to whichever player it's currently
// locked onto.
const TARGET_ALERT_ICON_HEIGHT_OFFSET = 1.5;
const TARGET_ALERT_ICON_COLOR = mod.CreateVector(1, 0.4, 0);
const TURRET_BLOCKED_ICON_COLOR = mod.CreateVector(1, 0.2, 0.2);
const TURRET_BLOCKED_ICON_DURATION_SECONDS = 2;

// "rotating" is an internal sub-phase of Warning (the rear pre-turn), not a fifth player-facing
// state.
type TurretState = "standby" | "rotating" | "warning" | "engaging" | "returning";
type EngagementKind = "front" | "rear";

interface TurretEntry {
    ownerPlayer: mod.Player;
    ownerObjId: number;
    pos: mod.Vector;
    // Fixed at placement -- center of the turret's normal cone and its rest/return facing.
    restYawRad: number;
    restFacingDir: mod.Vector;

    // The turret's actual hitbox -- an unarmed, immobile, crouched AI soldier. botObjId is -1
    // until the AI spawner request resolves (see HandleSpawned).
    botPlayer?: mod.Player;
    botObjId: number;
    fovConeVfx?: mod.VFX;
    // Set once, at reservation time -- lets _IsReservationStillValid tell a spawn that's still
    // legitimately in flight apart from one that silently failed and never arrived.
    pendingSince: number;

    // Bumped on every teardown path; _RunLoop bails the instant it no longer matches its own
    // captured token.
    runToken: number;
    state: TurretState;
    targetObjId?: number;
    engagementKind?: EngagementKind;
    targetAlertIcon?: mod.WorldIcon;

    // Current yaw the turret is facing (radians) -- drives the FOV cone VFX and, via
    // AISetFocusPoint, the AI body. Owned fully by this entry, never read back from the engine.
    currentYawRad: number;
    anim?: { fromYawRad: number; toYawRad: number; startedAt: number; duration: number };
    sweepDir: 1 | -1;
    rotateReadyAt: number;

    lockElapsed: number;
    sinceLastShot: number;

    alarmBlipToken: number;
    alarmBlipSfx?: mod.SFX;

    // Line-of-sight raycasting (one in flight per turret, keyed off the BOT's own player
    // context in _losOwners -- so the engine's self-exclusion actually excludes the turret's
    // own body). Used both for the rear-candidate acquisition gate and, while Engaging, a
    // periodic upkeep check against the live target -- losIsUpkeep tells _HandleLosResult which.
    losInFlight: boolean;
    losIsUpkeep: boolean;
    losCandidateObjId?: number;
    losCandidateKind?: EngagementKind;
    losCheckStart?: mod.Vector;
    losCheckEnd?: mod.Vector;
    nextLosScanAt: number;
    engageLosNextCheckAt: number;

    standbyVfx?: mod.VFX;
    activeVfx?: mod.VFX;
    // Simple tracer-dart read for the Engaging state -- see TURRET_VFX_ENGAGE_TRACER.
    engageTracerVfx?: mod.VFX;
    standbyLoopSfx?: mod.SFX;
    damageLightVfx?: mod.VFX;
    damageHeavyVfx?: mod.VFX;
}

interface TurretPendingSpawn {
    ownerObjId: number;
    ownerPlayer: mod.Player;
    pos: mod.Vector;
    restYawRad: number;
}

class TurretSpawner {
    // Player ids currently holding the turret roll of the portal gadget tool.
    static readonly _equipped: Set<number> = new Set();
    static readonly _raycastInFlight: Set<number> = new Set();
    // Owner objId -> their turret (pending or spawned). Only one entry per owner -- its
    // presence blocks placing a second.
    static readonly _ownerToTurret: Map<number, TurretEntry> = new Map();
    static readonly _cooldownUntil: Map<number, number> = new Map();
    // Turret BOT objIds (not owner objIds) with a LOS raycast in flight -- see
    // TurretEntry.losInFlight for why this is keyed off the bot.
    static readonly _losOwners: Set<number> = new Set();
    static readonly _pendingBySpawnerID: Map<number, TurretPendingSpawn> = new Map();
    static readonly _botOwnerByObjId: Map<number, number> = new Map();
    // Live turret bot objIds -- excluded from RecalculateCounts' survivor tally (see
    // IsActiveTurretObjId) so a standing turret never blocks round-end/final-five/LMS checks.
    static readonly _activeBotObjIds: Set<number> = new Set();
    private static _runTokenSeq: number = 0;

    private static _Now(): number {
        return Date.now() / 1000;
    }

    static IsEquipped(player: mod.Player): boolean {
        return TurretSpawner._equipped.has(mod.GetObjId(player));
    }

    /** Called from InitializePlayerEquipment when a survivor's loadout rolls this gadget. */
    static InitPlayer(player: mod.Player): void {
        TurretSpawner._equipped.add(mod.GetObjId(player));
    }

    static HasRaycastInFlight(id: number): boolean {
        return TurretSpawner._raycastInFlight.has(id);
    }

    static HasLosRaycastInFlight(id: number): boolean {
        return TurretSpawner._losOwners.has(id);
    }

    static GetCooldownRemaining(id: number): number {
        const until = TurretSpawner._cooldownUntil.get(id);
        if (!until) return 0;
        return Math.max(0, until - TurretSpawner._Now());
    }

    private static _GetRaycastVectors(player: mod.Player): { start: mod.Vector; end: mod.Vector } {
        const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
        const eyePos = mod.GetSoldierState(player, mod.SoldierStateVector.EyePosition);
        // Push the origin ahead of the eye along the full (pitch-inclusive) facing vector so the
        // ray doesn't immediately self-intersect the player's own collision -- same trick as
        // PropSpawner/DecoySpawner. This used to push a full meter both horizontally and
        // vertically, which was aggressive enough to occasionally land the origin right past a
        // valid floor's edge (a wall lip, a ledge) and report an invalid-surface hit even though
        // the player was clearly aiming at solid ground -- see turret_invalid_surface. Halved.
        const start = mod.Add(eyePos, mod.Multiply(facing, TURRET_PLACEMENT_RAYCAST_ORIGIN_OFFSET_METERS));
        const end = mod.Add(start, mod.Multiply(facing, PROP_SPAWNER_MAX_DISTANCE));
        return { start, end };
    }

    private static _PickFreeSpawnerID(): number | undefined {
        for (const id of SURVIVOR_AI_SPAWNERS) {
            if (!AISpawnHandler.spawnerLock.has(id)) return id;
        }
        return undefined;
    }

    /** True if `entry` still represents a real placement -- either a bot that's actually alive,
     *  or a spawn request still within its normal resolution window (see
     *  TURRET_PENDING_SPAWN_TIMEOUT_SECONDS). False means the AI spawner silently rejected the
     *  placement (e.g. a hair-slim shift landed it on geometry it couldn't actually spawn into)
     *  and HandleSpawned is never coming -- see _ReclaimStaleReservation. */
    private static _IsReservationStillValid(entry: TurretEntry): boolean {
        if (entry.botObjId !== -1) {
            return !!entry.botPlayer && PlayerIsAliveAndValid(entry.botPlayer);
        }
        return TurretSpawner._Now() - entry.pendingSince < TURRET_PENDING_SPAWN_TIMEOUT_SECONDS;
    }

    /** Clears a reservation that _IsReservationStillValid has determined is stale -- releases
     *  every bit of bookkeeping HandleSpawned/_DestroyTurret would otherwise own, but skips the
     *  destruction VFX/SFX and cooldown since nothing was ever genuinely placed. */
    private static _ReclaimStaleReservation(entry: TurretEntry): void {
        console.log(`TurretSpawner | Reclaiming stale placement reservation for Player(${entry.ownerObjId}) -- turret bot never became valid`);
        TurretSpawner._TeardownTurret(entry, false);
        TurretSpawner._ownerToTurret.delete(entry.ownerObjId);
        for (const [spawnerID, pending] of TurretSpawner._pendingBySpawnerID) {
            if (pending.ownerObjId === entry.ownerObjId) {
                TurretSpawner._pendingBySpawnerID.delete(spawnerID);
                AISpawnHandler.spawnerLock.delete(spawnerID);
                break;
            }
        }
    }

    /** Periodic background sweep (see AISpawnHandler.OnGoingSpawnerCheck, mirroring its
     *  CheckStuckInfectedSlots) so a stale reservation self-heals even if its owner never fires
     *  again to trigger the OnFireStart check. */
    static CheckStuckPlacements(): void {
        for (const entry of TurretSpawner._ownerToTurret.values()) {
            if (TurretSpawner._IsReservationStillValid(entry)) continue;
            TurretSpawner._ReclaimStaleReservation(entry);
        }
    }

    static OnFireStart(player: mod.Player): void {
        const id = mod.GetObjId(player);
        if (!TurretSpawner._equipped.has(id)) return;
        const existing = TurretSpawner._ownerToTurret.get(id);
        if (existing) {
            if (TurretSpawner._IsReservationStillValid(existing)) {
                Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, player);
                const { end } = TurretSpawner._GetRaycastVectors(player);
                TurretSpawner._ShowBlockedIcon(player, end, MakeMessage(mod.stringkeys.turret_hint_already_placed));
                return;
            }
            // Bot never arrived, or died without the normal OnPlayerDied teardown reaching us --
            // don't let a desynced reservation permanently block the player from placing another.
            TurretSpawner._ReclaimStaleReservation(existing);
        }
        const cooldownRemaining = TurretSpawner.GetCooldownRemaining(id);
        if (cooldownRemaining > 0) {
            Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, player);
            const { end } = TurretSpawner._GetRaycastVectors(player);
            TurretSpawner._ShowBlockedIcon(player, end, MakeMessage(mod.stringkeys.turret_on_cooldown, Math.ceil(cooldownRemaining)));
            return;
        }
        if (TurretSpawner._raycastInFlight.has(id)) return;
        const { start, end } = TurretSpawner._GetRaycastVectors(player);
        TurretSpawner._raycastInFlight.add(id);
        mod.RayCast(player, start, end);
    }

    static OnFireStop(_player: mod.Player): void { /* single fire-and-forget placement */ }
    static OnAimStart(_player: mod.Player): void { }
    static OnAimStop(_player: mod.Player): void { }
    static OnLaserToggle(_player: mod.Player, _eventBoolean: boolean): void { }

    static OnRayCastHit(player: mod.Player, point: mod.Vector, normal: mod.Vector): void {
        const id = mod.GetObjId(player);
        TurretSpawner._raycastInFlight.delete(id);
        const isFloor = mod.YComponentOf(normal) >= PROP_SPAWNER_MIN_FLOOR_NORMAL_Y;
        if (!isFloor) {
            Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, player);
            TurretSpawner._ShowBlockedIcon(player, point, MakeMessage(mod.stringkeys.turret_invalid_surface));
            return;
        }
        TurretSpawner._RequestPlacement(player, point);
    }

    static OnRayCastMissed(player: mod.Player): void {
        TurretSpawner._raycastInFlight.delete(mod.GetObjId(player));
        Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, player);
        const { end } = TurretSpawner._GetRaycastVectors(player);
        TurretSpawner._ShowBlockedIcon(player, end, MakeMessage(mod.stringkeys.turret_out_of_range));
    }

    /** LOS raycast for `player` (the turret's own bot) hit something before its stop point.
     *  For an acquisition check (rear-candidate) that just means the candidate isn't engageable
     *  right now. For an upkeep check (Engaging) it means the live target ducked behind cover --
     *  drop it via _LoseTarget. A hit landing at/near the candidate's own EyePosition (the
     *  endpoint) isn't a real obstruction -- see TURRET_LOS_HIT_TOLERANCE_METERS. */
    static OnLosRayCastHit(player: mod.Player, point: mod.Vector, _normal: mod.Vector): void {
        const botID = mod.GetObjId(player);
        TurretSpawner._losOwners.delete(botID);
        const ownerID = TurretSpawner._botOwnerByObjId.get(botID);
        const entry = ownerID !== undefined ? TurretSpawner._ownerToTurret.get(ownerID) : undefined;
        if (!entry || entry.botObjId !== botID) return;

        let clear = false;
        if (entry.losCheckStart && entry.losCheckEnd) {
            const hitDist = mod.DistanceBetween(entry.losCheckStart, point);
            const fullDist = mod.DistanceBetween(entry.losCheckStart, entry.losCheckEnd);
            clear = hitDist >= fullDist - TURRET_LOS_HIT_TOLERANCE_METERS;
        }
        TurretSpawner._HandleLosResult(entry, clear);
    }

    static OnLosRayCastMissed(player: mod.Player): void {
        const botID = mod.GetObjId(player);
        TurretSpawner._losOwners.delete(botID);
        const ownerID = TurretSpawner._botOwnerByObjId.get(botID);
        const entry = ownerID !== undefined ? TurretSpawner._ownerToTurret.get(ownerID) : undefined;
        if (!entry || entry.botObjId !== botID) return;
        TurretSpawner._HandleLosResult(entry, true);
    }

    /** Called from InitializePlayerEquipment on every mid-round refresh -- only resets the
     *  gadget-tool bookkeeping. An already-placed turret survives round-phase changes; full
     *  teardown only happens via CleanupPlayer/CleanupAllTurrets. */
    static CleanupPlayerGadgetState(player: mod.Player): void {
        const id = mod.GetObjId(player);
        TurretSpawner._equipped.delete(id);
        TurretSpawner._raycastInFlight.delete(id);
    }

    /** Owner death/undeploy: the turret is an independent emplacement, intentionally left
     *  running -- only gadget-tool bookkeeping is torn down here. */
    static CleanupPlayer(player: mod.Player): void {
        TurretSpawner.CleanupPlayerGadgetState(player);
    }

    /** Round-end sweep: turrets don't persist between rounds. */
    static CleanupAllTurrets(): void {
        for (const entry of TurretSpawner._ownerToTurret.values()) {
            TurretSpawner._TeardownTurret(entry, false);
        }
        TurretSpawner._ownerToTurret.clear();
        TurretSpawner._cooldownUntil.clear();
        TurretSpawner._equipped.clear();
        TurretSpawner._raycastInFlight.clear();
        TurretSpawner._losOwners.clear();
        for (const spawnerID of TurretSpawner._pendingBySpawnerID.keys()) {
            AISpawnHandler.spawnerLock.delete(spawnerID);
        }
        TurretSpawner._pendingBySpawnerID.clear();
        TurretSpawner._botOwnerByObjId.clear();
        TurretSpawner._activeBotObjIds.clear();
    }

    static IsActiveTurretObjId(objId: number): boolean {
        return TurretSpawner._activeBotObjIds.has(objId);
    }

    private static async _ShowBlockedIcon(player: mod.Player, pos: mod.Vector, message: mod.Message): Promise<void> {
        const icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, pos, ZERO_VEC) as mod.WorldIcon;
        if (!icon) return;
        mod.SetWorldIconOwner(icon, player);
        mod.SetWorldIconImage(icon, mod.WorldIconImages.Cross);
        mod.SetWorldIconColor(icon, TURRET_BLOCKED_ICON_COLOR);
        mod.SetWorldIconText(icon, message);
        mod.EnableWorldIconImage(icon, true);
        mod.EnableWorldIconText(icon, true);
        await mod.Wait(TURRET_BLOCKED_ICON_DURATION_SECONDS);
        try {
            mod.EnableWorldIconImage(icon, false);
            mod.EnableWorldIconText(icon, false);
            mod.UnspawnObject(icon as unknown as mod.Object);
        } catch { }
    }

    /** Alert icon above the turret's head, visible only to whichever player it's locked onto. */
    private static _ShowTargetAlertIcon(entry: TurretEntry, target: mod.Player): void {
        TurretSpawner._HideTargetAlertIcon(entry);
        const headPos = mod.CreateVector(
            mod.XComponentOf(entry.pos),
            mod.YComponentOf(entry.pos) + TARGET_ALERT_ICON_HEIGHT_OFFSET,
            mod.ZComponentOf(entry.pos)
        );
        const icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, headPos, ZERO_VEC) as mod.WorldIcon;
        if (!icon) return;
        mod.SetWorldIconOwner(icon, target);
        mod.SetWorldIconImage(icon, mod.WorldIconImages.Alert);
        mod.SetWorldIconColor(icon, TARGET_ALERT_ICON_COLOR);
        mod.EnableWorldIconImage(icon, true);
        entry.targetAlertIcon = icon;
    }

    private static _HideTargetAlertIcon(entry: TurretEntry): void {
        if (!entry.targetAlertIcon) return;
        try {
            mod.EnableWorldIconImage(entry.targetAlertIcon, false);
            mod.UnspawnObject(entry.targetAlertIcon as unknown as mod.Object);
        } catch { }
        entry.targetAlertIcon = undefined;
    }

    private static _SpawnAndEnableVfx(vfx: mod.RuntimeSpawn_Common, pos: mod.Vector, rot: mod.Vector = ZERO_VEC): mod.VFX | undefined {
        const fx = mod.SpawnObject(vfx, pos, rot) as mod.VFX;
        if (fx) mod.EnableVFX(fx, true);
        return fx;
    }

    private static _UnspawnVfx(vfx?: mod.VFX): void {
        if (!vfx) return;
        try {
            mod.EnableVFX(vfx, false);
            mod.UnspawnObject(vfx as unknown as mod.Object);
        } catch { }
    }

    private static _PlaySFX3DAtPos(sfx: mod.RuntimeSpawn_Common, pos: mod.Vector, attenuation: number = 25, amplitude: number = 1): void {
        try {
            const sfxObj = mod.SpawnObject(sfx, pos, ZERO_VEC) as mod.SFX;
            mod.PlaySound(sfxObj, amplitude, pos, attenuation);
        } catch { }
    }

    private static _StartLoopSFX3D(sfx: mod.RuntimeSpawn_Common, pos: mod.Vector, attenuation: number = 15, amplitude: number = 1): mod.SFX | undefined {
        try {
            const sfxObj = mod.SpawnObject(sfx, pos, ZERO_VEC) as mod.SFX;
            mod.PlaySound(sfxObj, amplitude, pos, attenuation);
            return sfxObj;
        } catch {
            return undefined;
        }
    }

    private static _StopLoopSFX3D(sfx?: mod.SFX): void {
        if (!sfx) return;
        try {
            mod.StopSound(sfx);
            mod.UnspawnObject(sfx as unknown as mod.Object);
        } catch { }
    }

    /** Every currently-alive infected (human + AI). Polled, never raycast against. */
    private static _GetAliveInfected(): mod.Player[] {
        const result: mod.Player[] = [];
        const all = mod.AllPlayers();
        const n = mod.CountOf(all);
        const infectedTeamId = mod.GetObjId(INFECTED_TEAM);
        for (let i = 0; i < n; i++) {
            const p = mod.ValueInArray(all, i) as mod.Player;
            if (!PlayerIsAliveAndValid(p)) continue;
            try {
                if (mod.GetObjId(mod.GetTeam(p)) !== infectedTeamId) continue;
            } catch { continue; }
            result.push(p);
        }
        return result;
    }

    private static _DirToYawRad(dir: mod.Vector): number {
        return Math.atan2(-mod.XComponentOf(dir), -mod.ZComponentOf(dir));
    }

    private static _YawRadToDir(yawRad: number): mod.Vector {
        return mod.CreateVector(-Math.sin(yawRad), 0, -Math.cos(yawRad));
    }

    /** Rotation vector for any VFX that needs to face `yawRad` -- applies the shared
     *  TURRET_VFX_YAW_OFFSET_RAD correction. Always go through this rather than building a
     *  rotation vector by hand, or the correction silently doesn't apply. */
    private static _YawToRotationVector(yawRad: number): mod.Vector {
        return mod.CreateVector(0, yawRad + TURRET_VFX_YAW_OFFSET_RAD, 0);
    }

    /** entry.pos raised to roughly the crouched bot's eye height -- see
     *  TURRET_VFX_FOV_CONE_HEIGHT_OFFSET_METERS. Used only for the claymore FOV cone VFX; every
     *  other VFX/SFX in this class still spawns at entry.pos (ground level) unchanged. */
    private static _FovConeVfxPos(pos: mod.Vector): mod.Vector {
        return mod.CreateVector(
            mod.XComponentOf(pos),
            mod.YComponentOf(pos) + TURRET_VFX_FOV_CONE_HEIGHT_OFFSET_METERS,
            mod.ZComponentOf(pos)
        );
    }

    private static _GetFacingYaw(player: mod.Player): number {
        const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
        return TurretSpawner._DirToYawRad(facing);
    }

    private static _StartRotationAnim(entry: TurretEntry, toYawRad: number, duration: number): void {
        entry.anim = { fromYawRad: entry.currentYawRad, toYawRad, startedAt: TurretSpawner._Now(), duration: Math.max(0.0001, duration) };
    }

    private static _TickRotationAnim(entry: TurretEntry): void {
        if (!entry.anim) return;
        const { fromYawRad, toYawRad, startedAt, duration } = entry.anim;
        const t = Math.min(1, (TurretSpawner._Now() - startedAt) / duration);
        const fromDeg = mod.RadiansToDegrees(fromYawRad);
        const toDeg = mod.RadiansToDegrees(toYawRad);
        const stepDeg = fromDeg + mod.AngleDifference(fromDeg, toDeg) * t;
        TurretSpawner._ApplyYaw(entry, mod.DegreesToRadians(stepDeg));
        if (t >= 1) entry.anim = undefined;
    }

    /** Turns the turret to face `newYawRad`: the AI body via AISetFocusPoint, and the FOV cone
     *  VFX by re-spawning it at the new rotation (MoveVFX's rotation arg doesn't visually
     *  re-orient this particular effect). */
    private static _ApplyYaw(entry: TurretEntry, newYawRad: number): void {
        if (entry.botPlayer) {
            const focusPoint = mod.Add(entry.pos, mod.Multiply(TurretSpawner._YawRadToDir(newYawRad), TURRET_FOCUS_POINT_DISTANCE));
            try { mod.AISetFocusPoint(entry.botPlayer, focusPoint, false); } catch { }
        }
        if (entry.fovConeVfx) {
            TurretSpawner._UnspawnVfx(entry.fovConeVfx);
            entry.fovConeVfx = TurretSpawner._SpawnAndEnableVfx(TURRET_VFX_FOV_CONE, TurretSpawner._FovConeVfxPos(entry.pos), TurretSpawner._YawToRotationVector(newYawRad));
        }
        entry.currentYawRad = newYawRad;
    }

    private static _RequestPlacement(owner: mod.Player, pos: mod.Vector): void {
        const ownerID = mod.GetObjId(owner);
        if (TurretSpawner._ownerToTurret.has(ownerID)) return; // race guard

        const spawnerID = TurretSpawner._PickFreeSpawnerID();
        if (spawnerID === undefined) {
            console.log(`TurretSpawner | No free AI spawner available for Player(${ownerID})`);
            Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, owner);
            return;
        }
        const spawnerObj = mod.GetSpawner(spawnerID);

        const restYawRad = TurretSpawner._GetFacingYaw(owner);
        const restFacingDir = TurretSpawner._YawRadToDir(restYawRad);

        // Fires the moment the player places the turret, ahead of the AI actually arriving --
        // same convention as the decoy gadget.
        TurretSpawner._SpawnAndEnableVfx(TURRET_VFX_LAUNCH, pos);

        const entry: TurretEntry = {
            ownerPlayer: owner,
            ownerObjId: ownerID,
            pos,
            restYawRad,
            restFacingDir,
            botObjId: -1,
            pendingSince: TurretSpawner._Now(),
            runToken: ++TurretSpawner._runTokenSeq,
            state: "standby",
            currentYawRad: restYawRad,
            sweepDir: 1,
            rotateReadyAt: 0,
            lockElapsed: 0,
            sinceLastShot: 0,
            alarmBlipToken: 0,
            losInFlight: false,
            losIsUpkeep: false,
            nextLosScanAt: 0,
            engageLosNextCheckAt: 0,
        };
        // Reserve immediately so a second fire before the bot arrives can't queue another spawn.
        TurretSpawner._ownerToTurret.set(ownerID, entry);

        AISpawnHandler.spawnerLock.add(spawnerID);
        TurretSpawner._pendingBySpawnerID.set(spawnerID, { ownerObjId: ownerID, ownerPlayer: owner, pos, restYawRad });
        mod.SpawnAIFromAISpawner(spawnerObj, mod.SoldierClass.Assault, MakeMessage(mod.stringkeys.turret_bot_name), SURVIVOR_TEAM);
        console.log(`TurretSpawner | Requested turret AI spawn for Player(${ownerID}) on spawner(${spawnerID})`);
    }

    static HasPendingSpawnOn(spawnerObjID: number): boolean {
        return TurretSpawner._pendingBySpawnerID.has(spawnerObjID);
    }

    /** Called from AISpawnHandler.OnBotSpawnFromSpawner once a requested turret AI arrives.
     *  Runs synchronously back-to-back (Teleport -> health -> equipment strip ->
     *  AIIdleBehavior -> disable targeting/shooting -> stance), mirroring
     *  DecoySpawner.HandleSpawned -- an await between Teleport and locking the AI's behavior
     *  down leaves it free to wander off in the meantime. */
    static HandleSpawned(botPlayer: mod.Player, botObjId: number, spawnerObjID: number): boolean {
        const pending = TurretSpawner._pendingBySpawnerID.get(spawnerObjID);
        if (!pending) return false;
        TurretSpawner._pendingBySpawnerID.delete(spawnerObjID);
        AISpawnHandler.spawnerLock.delete(spawnerObjID);

        const entry = TurretSpawner._ownerToTurret.get(pending.ownerObjId);
        if (!entry || entry.botObjId !== -1) {
            // Reservation vanished (owner cancelled/disconnected) or already resolved.
            try { mod.Kill(botPlayer); } catch { }
            return true;
        }

        mod.Teleport(botPlayer, pending.pos, pending.restYawRad);
        mod.SetPlayerMaxHealth(botPlayer, TURRET_HEALTH);
        mod.Heal(botPlayer, TURRET_HEALTH);

        // Completely unarmed -- every point of damage comes from scripted _FireAtTarget calls.
        try { mod.RemoveEquipment(botPlayer, mod.InventorySlots.PrimaryWeapon); } catch { }
        try { mod.RemoveEquipment(botPlayer, mod.InventorySlots.SecondaryWeapon); } catch { }
        try { mod.RemoveEquipment(botPlayer, mod.InventorySlots.GadgetOne); } catch { }
        try { mod.RemoveEquipment(botPlayer, mod.InventorySlots.GadgetTwo); } catch { }
        try { mod.RemoveEquipment(botPlayer, mod.InventorySlots.Throwable); } catch { }
        try { mod.RemoveEquipment(botPlayer, mod.InventorySlots.ClassGadget); } catch { }

        mod.AIIdleBehavior(botPlayer);
        try { mod.AIEnableTargeting(botPlayer, false); } catch { }
        try { mod.AIEnableShooting(botPlayer, false); } catch { }
        try { mod.AISetTarget(botPlayer); } catch { }
        // Always crouched -- reads as mounted hardware, visually distinct from the decoy.
        mod.AISetStance(botPlayer, mod.Stance.Crouch);

        const rot = mod.CreateVector(0, entry.restYawRad, 0);
        entry.standbyVfx = TurretSpawner._SpawnAndEnableVfx(TURRET_VFX_STANDBY, entry.pos, rot);
        entry.fovConeVfx = TurretSpawner._SpawnAndEnableVfx(TURRET_VFX_FOV_CONE, TurretSpawner._FovConeVfxPos(entry.pos), TurretSpawner._YawToRotationVector(entry.restYawRad));
        entry.standbyLoopSfx = TurretSpawner._StartLoopSFX3D(TURRET_SFX_STANDBY_LOOP, entry.pos);

        entry.botPlayer = botPlayer;
        entry.botObjId = botObjId;
        TurretSpawner._botOwnerByObjId.set(botObjId, entry.ownerObjId);
        TurretSpawner._activeBotObjIds.add(botObjId);

        console.log(`TurretSpawner | Turret AI Player(${botObjId}) spawned for owner Player(${entry.ownerObjId})`);
        TurretSpawner._RunLoop(entry);
        return true;
    }

    // ---- Run loop: 10Hz tick driving idle-scan animation, target acquisition (incl. rear
    // engagement), and firing. Raycasts fire only for the rear-candidate acquisition gate and
    // the Engaging-state upkeep recheck (both via _BeginLosCheck) -- everything else (range/
    // FOV, alive) is polled math. Incoming damage/death are handled natively via
    // OnPlayerDamaged/OnPlayerDied, not polled here. ----
    private static async _RunLoop(entry: TurretEntry): Promise<void> {
        const token = entry.runToken;

        while (true) {
            await mod.Wait(TURRET_TICK_SECONDS);
            if (entry.runToken !== token) return; // torn down elsewhere

            const infected = TurretSpawner._GetAliveInfected();

            // Idle scan / rotate-to-rear / return-to-rest -- skipped during warning/engaging,
            // where continuous target tracking below owns the yaw exclusively.
            if (entry.state !== "warning" && entry.state !== "engaging") {
                TurretSpawner._TickRotationAnim(entry);
            }
            if (entry.state === "standby" && !entry.anim) {
                entry.sweepDir = (entry.sweepDir === 1 ? -1 : 1);
                const legYawRad = entry.restYawRad + entry.sweepDir * mod.DegreesToRadians(TURRET_HALF_FOV_DEGREES);
                TurretSpawner._StartRotationAnim(entry, legYawRad, TURRET_IDLE_SWEEP_LEG_SECONDS);
            }

            // Target validity: alive/range/FOV (or rear-range), independent of LOS.
            let target: mod.Player | undefined;
            if (entry.targetObjId !== undefined) {
                target = infected.find(p => mod.GetObjId(p) === entry.targetObjId);
                if (!target || !TurretSpawner._IsGeometricallyValid(entry, target)) {
                    target = undefined;
                    TurretSpawner._LoseTarget(entry, false);
                }
            }

            // Acquire a new target while idle or returning (a fresh target interrupts the
            // return and gets engaged immediately once LOS is confirmed). Front and rear
            // candidates are both gated on a confirmed raycast before engaging -- range/FOV
            // alone doesn't account for geometry (a wall inside the cone), and engaging on that
            // alone would open fire on an occluded target for one full TURRET_TARGET_LOCK_GRACE_
            // SECONDS window before the Engaging-state upkeep check ever got a chance to catch it.
            if ((entry.state === "standby" || entry.state === "returning") && !target &&
                TurretSpawner._Now() >= entry.nextLosScanAt && !entry.losInFlight) {
                const frontCandidate = TurretSpawner._PickFrontTarget(entry, infected);
                if (frontCandidate) {
                    TurretSpawner._BeginLosCheck(entry, frontCandidate, "front");
                } else {
                    const rearCandidate = TurretSpawner._PickRearTarget(entry, infected);
                    if (rearCandidate) {
                        TurretSpawner._BeginLosCheck(entry, rearCandidate, "rear");
                    } else {
                        entry.nextLosScanAt = TurretSpawner._Now() + TURRET_LOS_CHECK_INTERVAL_SECONDS;
                    }
                }
            }

            if (entry.runToken !== token) return;

            // Rotating -> Warning handoff (rear engagement's pre-turn finished).
            if (entry.state === "rotating" && TurretSpawner._Now() >= entry.rotateReadyAt) {
                entry.state = "warning";
                entry.lockElapsed = 0;
            }

            // Continuous target tracking while locked on.
            if (target && (entry.state === "warning" || entry.state === "engaging")) {
                const targetPos = mod.GetSoldierState(target, mod.SoldierStateVector.GetPosition);
                TurretSpawner._ApplyYaw(entry, TurretSpawner._DirToYawRad(TurretSpawner._HorizontalDirectionTowards(entry.pos, targetPos)));
            }

            // Warning -> Engaging handoff.
            if (target && entry.state === "warning") {
                entry.lockElapsed += TURRET_TICK_SECONDS;
                if (entry.lockElapsed >= TURRET_TARGET_LOCK_GRACE_SECONDS) {
                    entry.state = "engaging";
                    entry.sinceLastShot = TURRET_FIRE_INTERVAL_SECONDS; // fire immediately next tick
                    entry.engageLosNextCheckAt = TurretSpawner._Now() + TURRET_ENGAGE_LOS_CHECK_INTERVAL_SECONDS;
                    console.log(`TurretSpawner | Player(${entry.ownerObjId}) turret opening fire on Player(${entry.targetObjId})`);
                }
            }

            // Engaging LOS upkeep -- fire-and-forget; a blocked result drops the target via
            // OnLosRayCastHit, a clean result is a no-op and firing continues below.
            if (target && entry.state === "engaging" && !entry.losInFlight && TurretSpawner._Now() >= entry.engageLosNextCheckAt) {
                entry.engageLosNextCheckAt = TurretSpawner._Now() + TURRET_ENGAGE_LOS_CHECK_INTERVAL_SECONDS;
                TurretSpawner._BeginLosCheck(entry, target, entry.engagementKind ?? "front", true);
            }

            // Firing -- continuous, no pauses, until the target fails the range/FOV check
            // above, dies, or an upkeep LOS check catches it out of sight.
            if (target && entry.state === "engaging") {
                entry.sinceLastShot += TURRET_TICK_SECONDS;
                if (entry.sinceLastShot >= TURRET_FIRE_INTERVAL_SECONDS) {
                    entry.sinceLastShot = 0;
                    TurretSpawner._FireAtTarget(entry, target);
                }
            }

            // Returning -> Standby handoff.
            if (entry.state === "returning" && TurretSpawner._Now() >= entry.rotateReadyAt) {
                entry.state = "standby";
            }
        }
    }

    private static _HorizontalDirectionTowards(from: mod.Vector, to: mod.Vector): mod.Vector {
        const flatFrom = mod.CreateVector(mod.XComponentOf(from), 0, mod.ZComponentOf(from));
        const flatTo = mod.CreateVector(mod.XComponentOf(to), 0, mod.ZComponentOf(to));
        return mod.DirectionTowards(flatFrom, flatTo);
    }

    /** Alive + range + (FOV if front, rear-range if rear) -- everything except line-of-sight. */
    private static _IsGeometricallyValid(entry: TurretEntry, target: mod.Player): boolean {
        if (!PlayerIsAliveAndValid(target)) return false;
        const targetPos = mod.GetSoldierState(target, mod.SoldierStateVector.GetPosition);
        const dist = mod.DistanceBetween(entry.pos, targetPos);
        if (entry.engagementKind === "rear") {
            return dist <= TURRET_REAR_ENGAGE_RANGE_METERS;
        }
        if (dist > TURRET_RANGE_METERS) return false;
        const toTarget = TurretSpawner._HorizontalDirectionTowards(entry.pos, targetPos);
        const angleDeg = mod.AngleBetweenVectors(entry.restFacingDir, toTarget);
        return angleDeg <= TURRET_HALF_FOV_DEGREES;
    }

    private static _IsInFrontCone(entry: TurretEntry, target: mod.Player): boolean {
        if (!PlayerIsAliveAndValid(target)) return false;
        const targetPos = mod.GetSoldierState(target, mod.SoldierStateVector.GetPosition);
        if (mod.DistanceBetween(entry.pos, targetPos) > TURRET_RANGE_METERS) return false;
        const toTarget = TurretSpawner._HorizontalDirectionTowards(entry.pos, targetPos);
        return mod.AngleBetweenVectors(entry.restFacingDir, toTarget) <= TURRET_HALF_FOV_DEGREES;
    }

    /** Closest infected inside the turret's normal cone. */
    private static _PickFrontTarget(entry: TurretEntry, infected: mod.Player[]): mod.Player | undefined {
        let best: mod.Player | undefined;
        let bestDist = Infinity;
        for (const inf of infected) {
            if (!TurretSpawner._IsInFrontCone(entry, inf)) continue;
            const dist = mod.DistanceBetween(entry.pos, mod.GetSoldierState(inf, mod.SoldierStateVector.GetPosition));
            if (dist < bestDist) { bestDist = dist; best = inf; }
        }
        return best;
    }

    /** Closest infected within rear-engagement range that isn't already in the front cone.
     *  LOS is verified separately before engaging. */
    private static _PickRearTarget(entry: TurretEntry, infected: mod.Player[]): mod.Player | undefined {
        let best: mod.Player | undefined;
        let bestDist = Infinity;
        for (const inf of infected) {
            if (!PlayerIsAliveAndValid(inf)) continue;
            if (TurretSpawner._IsInFrontCone(entry, inf)) continue;
            const dist = mod.DistanceBetween(entry.pos, mod.GetSoldierState(inf, mod.SoldierStateVector.GetPosition));
            if (dist > TURRET_REAR_ENGAGE_RANGE_METERS) continue;
            if (dist < bestDist) { bestDist = dist; best = inf; }
        }
        return best;
    }

    /** Fires a single LOS raycast using the turret's own bot as context (so the engine's
     *  self-exclusion actually excludes its own body), from its EyePosition to the candidate's.
     *  `isUpkeep` distinguishes an Engaging-state recheck of the live target from a new-
     *  candidate acquisition gate -- see _HandleLosResult. */
    private static _BeginLosCheck(entry: TurretEntry, candidate: mod.Player, kind: EngagementKind, isUpkeep: boolean = false): void {
        if (!entry.botPlayer) return;
        entry.losInFlight = true;
        entry.losIsUpkeep = isUpkeep;
        entry.losCandidateObjId = mod.GetObjId(candidate);
        entry.losCandidateKind = kind;
        entry.nextLosScanAt = TurretSpawner._Now() + TURRET_LOS_CHECK_INTERVAL_SECONDS;
        TurretSpawner._losOwners.add(entry.botObjId);

        const eyePos = mod.GetSoldierState(entry.botPlayer, mod.SoldierStateVector.EyePosition);
        const start = mod.Add(eyePos, TurretSpawner._YawRadToDir(entry.currentYawRad));
        const end = mod.GetSoldierState(candidate, mod.SoldierStateVector.EyePosition);
        entry.losCheckStart = start;
        entry.losCheckEnd = end;
        try {
            mod.RayCast(entry.botPlayer, start, end);
        } catch {
            entry.losInFlight = false;
            entry.losIsUpkeep = false;
            entry.losCheckStart = undefined;
            entry.losCheckEnd = undefined;
            TurretSpawner._losOwners.delete(entry.botObjId);
        }
    }

    /** Common resolution for acquisition and upkeep LOS raycasts. Acquisition: clear engages
     *  the candidate; blocked just drops it for a later scan. Upkeep: blocked drops the live
     *  target (cover break); clear is a no-op, firing continues uninterrupted. */
    private static _HandleLosResult(entry: TurretEntry, clear: boolean): void {
        entry.losInFlight = false;
        const wasUpkeep = entry.losIsUpkeep;
        const candidateObjId = entry.losCandidateObjId;
        const kind = entry.losCandidateKind;
        entry.losIsUpkeep = false;
        entry.losCandidateObjId = undefined;
        entry.losCandidateKind = undefined;
        entry.losCheckStart = undefined;
        entry.losCheckEnd = undefined;

        if (wasUpkeep) {
            if (!clear && entry.state === "engaging" && entry.targetObjId === candidateObjId) {
                TurretSpawner._LoseTarget(entry, false);
            }
            return;
        }
        if (clear) TurretSpawner._HandleLosConfirmed(entry, candidateObjId, kind);
    }

    private static _HandleLosConfirmed(entry: TurretEntry, candidateObjId: number | undefined, kind: EngagementKind | undefined): void {
        if (candidateObjId === undefined || !kind) return;
        if (entry.state !== "standby" && entry.state !== "returning") {
            // Something else got engaged while this scan was in flight.
            return;
        }
        const infected = TurretSpawner._GetAliveInfected();
        const candidate = infected.find(p => mod.GetObjId(p) === candidateObjId);
        if (!candidate || !PlayerIsAliveAndValid(candidate)) return;
        TurretSpawner._EnterEngagement(entry, candidate, kind);
    }

    /** Spots the target for just the turret's owner. */
    private static _SpotEngagedTarget(entry: TurretEntry, target: mod.Player): void {
        try {
            mod.SpotTarget(target, entry.ownerPlayer, TURRET_SPOT_DURATION_SECONDS, mod.SpotStatus.SpotInBoth);
        } catch {
            try { mod.SpotTarget(target, TURRET_SPOT_DURATION_SECONDS, mod.SpotStatus.SpotInBoth); } catch { }
        }
    }

    private static async _RunAlarmBlips(entry: TurretEntry, token: number): Promise<void> {
        for (let i = 0; i < TURRET_ALARM_BLIP_COUNT; i++) {
            if (entry.alarmBlipToken !== token) return;
            entry.alarmBlipSfx = TurretSpawner._StartLoopSFX3D(TURRET_SFX_ALARM_BLIP, entry.pos, 15);
            await mod.Wait(TURRET_ALARM_BLIP_SECONDS);
            if (entry.alarmBlipToken !== token) return;
            TurretSpawner._StopLoopSFX3D(entry.alarmBlipSfx);
            entry.alarmBlipSfx = undefined;
            if (i < TURRET_ALARM_BLIP_COUNT - 1) {
                await mod.Wait(TURRET_ALARM_BLIP_GAP_SECONDS);
                if (entry.alarmBlipToken !== token) return;
            }
        }
    }

    private static _BeginAlarmBlips(entry: TurretEntry): void {
        entry.alarmBlipToken++;
        TurretSpawner._RunAlarmBlips(entry, entry.alarmBlipToken);
    }

    private static _StopAlarmBlips(entry: TurretEntry): void {
        entry.alarmBlipToken++; // invalidates _RunAlarmBlips's next check
        TurretSpawner._StopLoopSFX3D(entry.alarmBlipSfx);
        entry.alarmBlipSfx = undefined;
    }

    private static _EnterEngagement(entry: TurretEntry, target: mod.Player, kind: EngagementKind): void {
        console.log(`TurretSpawner | Player(${entry.ownerObjId}) turret engaging ${kind} target Player(${mod.GetObjId(target)})`);
        entry.targetObjId = mod.GetObjId(target);
        entry.engagementKind = kind;
        entry.lockElapsed = 0;
        entry.anim = undefined; // drop any leftover idle-sweep/return tween
        TurretSpawner._UnspawnVfx(entry.standbyVfx);
        entry.standbyVfx = undefined;
        TurretSpawner._StopLoopSFX3D(entry.standbyLoopSfx);
        entry.standbyLoopSfx = undefined;
        entry.activeVfx = TurretSpawner._SpawnAndEnableVfx(TURRET_VFX_ACTIVE, entry.pos);
        entry.engageTracerVfx = TurretSpawner._SpawnAndEnableVfx(TURRET_VFX_ENGAGE_TRACER, entry.pos);
        TurretSpawner._SpotEngagedTarget(entry, target);
        TurretSpawner._ShowTargetAlertIcon(entry, target);
        TurretSpawner._BeginAlarmBlips(entry);

        if (kind === "front") {
            entry.state = "warning";
            return;
        }

        // Rear engagement: physically turn to face the target before the lock-on grace starts.
        const targetPos = mod.GetSoldierState(target, mod.SoldierStateVector.GetPosition);
        const targetYawRad = TurretSpawner._DirToYawRad(mod.DirectionTowards(entry.pos, targetPos));
        TurretSpawner._StartRotationAnim(entry, targetYawRad, TURRET_REAR_ROTATE_SECONDS);
        entry.state = "rotating";
        entry.rotateReadyAt = TurretSpawner._Now() + TURRET_REAR_ROTATE_SECONDS;
    }

    /** Drops the current target and enters Returning. A fresh target can interrupt this and get
     *  engaged before the turn-back finishes. */
    private static _LoseTarget(entry: TurretEntry, silent: boolean): void {
        const wasEngaged = entry.state === "rotating" || entry.state === "warning" || entry.state === "engaging";
        if (wasEngaged) {
            console.log(`TurretSpawner | Player(${entry.ownerObjId}) turret lost its target (was ${entry.state}/${entry.engagementKind})`);
        }
        entry.targetObjId = undefined;
        entry.losCandidateObjId = undefined;
        entry.losCandidateKind = undefined;
        entry.lockElapsed = 0;
        entry.sinceLastShot = 0;
        entry.engagementKind = undefined;
        TurretSpawner._HideTargetAlertIcon(entry);
        TurretSpawner._StopAlarmBlips(entry);

        if (wasEngaged) {
            TurretSpawner._UnspawnVfx(entry.activeVfx);
            entry.activeVfx = undefined;
            TurretSpawner._UnspawnVfx(entry.engageTracerVfx);
            entry.engageTracerVfx = undefined;
            if (!silent) TurretSpawner._PlaySFX3DAtPos(TURRET_SFX_RETURNING, entry.pos, 15);
        }

        TurretSpawner._StartRotationAnim(entry, entry.restYawRad, TURRET_REAR_ROTATE_SECONDS);
        entry.state = "returning";
        entry.rotateReadyAt = TurretSpawner._Now() + TURRET_REAR_ROTATE_SECONDS;

        if (!entry.standbyVfx) entry.standbyVfx = TurretSpawner._SpawnAndEnableVfx(TURRET_VFX_STANDBY, entry.pos);
        if (!entry.standbyLoopSfx) entry.standbyLoopSfx = TurretSpawner._StartLoopSFX3D(TURRET_SFX_STANDBY_LOOP, entry.pos);
    }

    private static _FireAtTarget(entry: TurretEntry, target: mod.Player): void {
        if (!PlayerIsAliveAndValid(target)) return;
        const damage = TURRET_DAMAGE_MIN + Math.random() * (TURRET_DAMAGE_MAX - TURRET_DAMAGE_MIN);
        try { mod.DealDamage(target, damage, entry.ownerPlayer); } catch { }
        TurretSpawner._SpawnAndEnableVfx(TURRET_VFX_FIRE, entry.pos, TurretSpawner._YawToRotationVector(entry.currentYawRad));
        TurretSpawner._PlaySFX3DAtPos(TURRET_SFX_FIRE, entry.pos, 20);
    }

    /** `frac` is the turret bot's current NormalizedHealth (0..1). */
    private static _UpdateDamageVfx(entry: TurretEntry, frac: number): void {
        if (frac <= TURRET_DAMAGE_VFX_HEAVY_THRESHOLD && !entry.damageHeavyVfx) {
            entry.damageHeavyVfx = TurretSpawner._SpawnAndEnableVfx(TURRET_VFX_DAMAGE_HEAVY, entry.pos);
        }
        if (frac <= TURRET_DAMAGE_VFX_LIGHT_THRESHOLD && !entry.damageLightVfx) {
            entry.damageLightVfx = TurretSpawner._SpawnAndEnableVfx(TURRET_VFX_DAMAGE_LIGHT, entry.pos);
        }
    }

    /** Common teardown of everything a turret spawned, including killing the bot if it's
     *  somehow still alive (round-end sweep path). `playDestructionFx` is false for a round-end
     *  sweep. */
    private static _TeardownTurret(entry: TurretEntry, playDestructionFx: boolean): void {
        entry.runToken = ++TurretSpawner._runTokenSeq; // bumps the loop's token so it exits next wake
        if (entry.botObjId >= 0) {
            TurretSpawner._losOwners.delete(entry.botObjId);
            TurretSpawner._botOwnerByObjId.delete(entry.botObjId);
            TurretSpawner._activeBotObjIds.delete(entry.botObjId);
        }
        TurretSpawner._HideTargetAlertIcon(entry);
        TurretSpawner._StopAlarmBlips(entry);
        TurretSpawner._UnspawnVfx(entry.standbyVfx);
        TurretSpawner._UnspawnVfx(entry.activeVfx);
        TurretSpawner._UnspawnVfx(entry.engageTracerVfx);
        TurretSpawner._UnspawnVfx(entry.damageLightVfx);
        TurretSpawner._UnspawnVfx(entry.damageHeavyVfx);
        TurretSpawner._UnspawnVfx(entry.fovConeVfx);
        TurretSpawner._StopLoopSFX3D(entry.standbyLoopSfx);
        if (entry.botPlayer && PlayerIsAliveAndValid(entry.botPlayer)) {
            try { mod.Kill(entry.botPlayer); } catch { }
        }
        if (playDestructionFx) {
            TurretSpawner._SpawnAndEnableVfx(TURRET_VFX_DESTRUCTION, entry.pos);
            TurretSpawner._PlaySFX3DAtPos(TURRET_SFX_DESTROYED_POWERDOWN, entry.pos, 20);
        }
    }

    private static _DestroyTurret(entry: TurretEntry): void {
        TurretSpawner._TeardownTurret(entry, true);
        TurretSpawner._ownerToTurret.delete(entry.ownerObjId);
        TurretSpawner._cooldownUntil.set(entry.ownerObjId, TurretSpawner._Now() + TURRET_COOLDOWN_AFTER_DESTROYED_SECONDS);
        console.log(`TurretSpawner | Turret destroyed for owner Player(${entry.ownerObjId}) -- ${TURRET_COOLDOWN_AFTER_DESTROYED_SECONDS}s cooldown started`);
    }

    /** Called from OnPlayerDied when the dead AI is a turret bot. Returns true if it was. */
    static HandleDeath(botPlayer: mod.Player, botObjId: number): boolean {
        const ownerID = TurretSpawner._botOwnerByObjId.get(botObjId);
        if (ownerID === undefined) return false;
        TurretSpawner._botOwnerByObjId.delete(botObjId);
        const entry = TurretSpawner._ownerToTurret.get(ownerID);
        if (!entry || entry.botObjId !== botObjId) return true; // stale entry, already handled
        TurretSpawner._DestroyTurret(entry);
        return true;
    }

    /** Called from OnPlayerDamaged when the damaged player is a turret bot. No-op otherwise. */
    static HandleDamaged(botPlayer: mod.Player): void {
        const botObjId = mod.GetObjId(botPlayer);
        const ownerID = TurretSpawner._botOwnerByObjId.get(botObjId);
        if (ownerID === undefined) return;
        const entry = TurretSpawner._ownerToTurret.get(ownerID);
        if (!entry || entry.botObjId !== botObjId || !entry.botPlayer) return;
        let frac = 1;
        try { frac = mod.GetSoldierState(entry.botPlayer, mod.SoldierStateNumber.NormalizedHealth); } catch { }
        TurretSpawner._UpdateDamageVfx(entry, frac);
    }
}

// ============================================================
// RorschRailgun -- scripted splash-damage/impulse overlay for the BattlePickup_Rorsch_Mk_2_SMRW
// "railgun" LMS pickup. The base weapon's own direct-hit damage/penetration (charge-up-then-
// discharge, breach-loaded single shot) is entirely native -- this layer only adds a small-radius
// AoE around wherever the shot actually lands: damage to nearby infected, a high knockback
// impulse (no damage) to nearby vehicles, and an impact VFX.
//
// Detection: the mod SDK has no discrete "weapon fired" event for a real weapon -- only the
// Portal Gadget tool gets OnPortalGadgetFireStart/Stop (see PropSpawner/DecoySpawner/
// TurretSpawner above), and SoldierStateBool.IsFiring/IsZooming would conflate the whole
// charge-up hold with the actual discharge. So this polls SoldierStateBool.IsReloading for
// every player currently holding the Rorsch as their active Primary weapon, and treats the
// false->true rising edge as "a shot just went off": the weapon is breach-loaded and forced
// into reload after every shot, so that edge is a reliable one-shot-one-edge signal. At that
// instant it raycasts along the shooter's current facing to find where the shot landed, then
// applies the AoE there -- the same "detect fire -> raycast for the landing point" approach
// PropSpawner/TurretSpawner already use for their own placement raycasts above, just gated on
// reload instead of a fire-button event.
// ============================================================

const RORSCH_POLL_INTERVAL_SECONDS = 0.1;
const RORSCH_RAYCAST_MAX_DISTANCE_METERS = 400;
const RORSCH_AOE_RADIUS_METERS = 8;
// Linear falloff from the exact impact point (400) out to the edge of the radius (250)
const RORSCH_AOE_DAMAGE_MAX = 400;
const RORSCH_AOE_DAMAGE_MIN = 250;
// Newton-seconds (see GodotProject/mods/PhysicsImpulse_Gym/README_PhysicsImpulse.ts) -- large
// enough to visibly launch/flip the mod's light vehicle roster (quad bike, golf cart, dirt bike,
// etc.), no distance falloff needed on top of that.
const RORSCH_VEHICLE_IMPULSE_MAGNITUDE = 22000;
// Electromagnetic discharge flash -- reused purely for its look (same "borrow an unrelated
// asset for its VFX" approach as TURRET_VFX_FOV_CONE reusing the claymore tripwire above).
const RORSCH_IMPACT_VFX = mod.RuntimeSpawn_Common.FX_Gadget_ReconDrone_EMP_Hit;

class RorschRailgun {
    // Player objIds currently holding BattlePickup_Rorsch_Mk_2_SMRW as their active Primary
    // weapon -- owned entirely by InitPlayer/RemovePlayer (called from
    // InitializePlayerEquipment); the poll loop below only ever reads it.
    private static readonly _equipped: Set<number> = new Set();
    // Last-seen IsReloading per tracked player, for rising-edge detection.
    private static readonly _wasReloading: Map<number, boolean> = new Map();
    private static readonly _raycastInFlight: Set<number> = new Set();
    private static _pollRunning = false;

    /** Called from InitializePlayerEquipment when a survivor's loadout equips the Rorsch. */
    static InitPlayer(player: mod.Player): void {
        const id = mod.GetObjId(player);
        RorschRailgun._equipped.add(id);
        RorschRailgun._wasReloading.set(id, false);
        RorschRailgun._EnsurePollLoop();
    }

    /** Called from InitializePlayerEquipment on every equipment refresh, before re-applying the
     *  new loadout -- stops tracking if this round's roll no longer holds the Rorsch. */
    static RemovePlayer(player: mod.Player): void {
        const id = mod.GetObjId(player);
        RorschRailgun._equipped.delete(id);
        RorschRailgun._wasReloading.delete(id);
    }

    static HasRaycastInFlight(id: number): boolean {
        return RorschRailgun._raycastInFlight.has(id);
    }

    // Single shared loop over every tracked holder rather than one loop per player -- starts
    // lazily on the first InitPlayer and lets itself wind down once _equipped drains back to
    // empty (a fresh InitPlayer later just restarts it).
    private static async _EnsurePollLoop(): Promise<void> {
        if (RorschRailgun._pollRunning) return;
        RorschRailgun._pollRunning = true;
        try {
            while (RorschRailgun._equipped.size > 0) {
                await mod.Wait(RORSCH_POLL_INTERVAL_SECONDS);
                for (const id of Array.from(RorschRailgun._equipped)) {
                    RorschRailgun._TickPlayer(id);
                }
            }
        } finally {
            RorschRailgun._pollRunning = false;
        }
    }

    private static _TickPlayer(id: number): void {
        let player: mod.Player | undefined;
        try { player = mod.GetPlayer(id); } catch { player = undefined; }
        if (!player || !SafeIsAlive(player)) return;

        const isReloading = SafeGetSoldierStateBool(player, mod.SoldierStateBool.IsReloading, false);
        const wasReloading = RorschRailgun._wasReloading.get(id) ?? false;
        RorschRailgun._wasReloading.set(id, isReloading);

        if (isReloading && !wasReloading && !RorschRailgun._raycastInFlight.has(id)) {
            RorschRailgun._FireImpactRaycast(player, id);
        }
    }

    // Same eye-position + facing-direction raycast setup as TurretSpawner._GetRaycastVectors
    // above -- start 1m ahead of the eye so the ray doesn't immediately self-intersect.
    private static _FireImpactRaycast(player: mod.Player, id: number): void {
        const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
        const eyePos = mod.GetSoldierState(player, mod.SoldierStateVector.EyePosition);
        const start = mod.Add(eyePos, facing);
        const end = mod.Add(start, mod.Multiply(facing, RORSCH_RAYCAST_MAX_DISTANCE_METERS));
        RorschRailgun._raycastInFlight.add(id);
        mod.RayCast(player, start, end);
    }

    static OnRayCastHit(shooter: mod.Player, point: mod.Vector, _normal: mod.Vector): void {
        RorschRailgun._raycastInFlight.delete(mod.GetObjId(shooter));
        RorschRailgun._TriggerImpact(shooter, point);
    }

    static OnRayCastMissed(shooter: mod.Player): void {
        RorschRailgun._raycastInFlight.delete(mod.GetObjId(shooter));
        // Shot flew past RORSCH_RAYCAST_MAX_DISTANCE_METERS without hitting anything -- no
        // impact point to splash.
    }

    private static _TriggerImpact(shooter: mod.Player, point: mod.Vector): void {
        const fx = mod.SpawnObject(RORSCH_IMPACT_VFX, point, ZERO_VEC) as mod.VFX;
        if (fx) mod.EnableVFX(fx, true);

        // Infected within radius take 150-200 damage, falling off linearly from the exact
        // impact point (200) to the edge of the radius (150).
        const infectedTeamId = mod.GetObjId(INFECTED_TEAM);
        const allPlayers = ConvertArray(mod.AllPlayers()) as mod.Player[];
        for (const target of allPlayers) {
            if (!Helpers.HasValidObjId(target) || !SafeIsAlive(target)) continue;
            let onInfectedTeam = false;
            try { onInfectedTeam = mod.GetObjId(mod.GetTeam(target)) === infectedTeamId; } catch { continue; }
            if (!onInfectedTeam) continue;

            const targetPos = mod.GetSoldierState(target, mod.SoldierStateVector.GetPosition);
            const dist = mod.DistanceBetween(point, targetPos);
            if (dist > RORSCH_AOE_RADIUS_METERS) continue;

            const t = dist / RORSCH_AOE_RADIUS_METERS; // 0 at the impact point, 1 at the edge
            const damage = Math.round(RORSCH_AOE_DAMAGE_MAX - (RORSCH_AOE_DAMAGE_MAX - RORSCH_AOE_DAMAGE_MIN) * t);
            try { mod.DealDamage(target, damage, shooter); } catch { }
        }

        // Vehicles within radius get shoved hard, radially outward from the impact point, but
        // take no direct damage from the splash.
        const vehicles = ConvertArray(mod.AllVehicles()) as mod.Vehicle[];
        for (const vehicle of vehicles) {
            if (!IsVehicleRefValid(vehicle)) continue;
            const vehiclePos = mod.GetVehicleState(vehicle, mod.VehicleStateVector.VehiclePosition);
            const dist = mod.DistanceBetween(point, vehiclePos);
            if (dist > RORSCH_AOE_RADIUS_METERS) continue;

            const direction = Helpers.NormalizeVector(mod.Subtract(vehiclePos, point));
            try { mod.ApplyImpulse(vehicle, point, direction, RORSCH_VEHICLE_IMPULSE_MAGNITUDE); } catch { }
        }
    }
}

// ============================================================
// BattlePickupCleanup -- sweeps up BattlePickup_* weapons (MP RMG, Rorsch Mk 2) left behind in
// the world with no owner left to reclaim them.
//
// Unlike Primary/Secondary, a BattlePickup can't be stored in a loadout slot when its holder
// swaps to something else -- the engine just drops it as a live world pickup, same as picking
// one up off the map normally would let you do in reverse. That's normal, wanted behavior while
// the round is running: the player (or anyone else) can walk back and grab it, so a mid-round
// drop is deliberately left alone here -- there's no OnWeaponDropped-style event to react to one
// anyway. This only sweeps at the two points an abandoned pickup has no legitimate owner left:
// the holder's death (see HandleDeath, called from OnPlayerDied) and end of round (see
// GameHandler.EndRoundCleanup).
//
// mod.UnspawnAllLoot() is the only lever the SDK exposes for this -- there's no per-object query
// to target just the one pickup a given death or round left behind, so both triggers sweep every
// loose loot item on the map, not just the relevant one.
// ============================================================

const BATTLE_PICKUP_WEAPONS: ReadonlySet<mod.Weapons> = new Set([
    mod.Weapons.BattlePickup_MP_RMG,
    mod.Weapons.BattlePickup_Rorsch_Mk_2_SMRW,
]);

class BattlePickupCleanup {
    // Player objIds whose current life's Primary roll is a BattlePickup_* weapon -- owned
    // entirely by InitPlayer/RemovePlayer (called from InitializePlayerEquipment); HandleDeath
    // only ever reads it.
    private static readonly _holders: Set<number> = new Set();

    /** Called from InitializePlayerEquipment's Primary-weapon branch. */
    static InitPlayer(player: mod.Player, weapon: mod.Weapons): void {
        if (BATTLE_PICKUP_WEAPONS.has(weapon)) {
            BattlePickupCleanup._holders.add(mod.GetObjId(player));
        }
    }

    /** Called from InitializePlayerEquipment on every mid-round refresh, before re-applying the
     *  new loadout -- stops tracking if this round's roll no longer holds a battle pickup. */
    static RemovePlayer(player: mod.Player): void {
        BattlePickupCleanup._holders.delete(mod.GetObjId(player));
    }

    /** Called from OnPlayerDied. If the dying player's current life was tracked as a battle
     *  pickup holder, their weapon (whether still in hand or already accidentally dropped
     *  earlier this life) has no owner left to walk back for it -- sweep it up. */
    static HandleDeath(player: mod.Player): void {
        const id = mod.GetObjId(player);
        if (!BattlePickupCleanup._holders.has(id)) return;
        BattlePickupCleanup._holders.delete(id);
        console.log(`BattlePickupCleanup | Player(${id}) died holding/having held a battle pickup this life -- sweeping loot`);
        try { mod.UnspawnAllLoot(); } catch { }
    }

    /** Round-end sweep -- see GameHandler.EndRoundCleanup. */
    static CleanupRound(): void {
        BattlePickupCleanup._holders.clear();
        try { mod.UnspawnAllLoot(); } catch { }
    }
}

export function OnRayCastHit(eventPlayer: mod.Player, eventPoint: mod.Vector, eventNormal: mod.Vector) {
    const id = mod.GetObjId(eventPlayer);
    if (DecoySpawner.HasRaycastInFlight(id)) {
        DecoySpawner.OnRayCastHit(eventPlayer, eventPoint, eventNormal);
    } else if (PropSpawner.HasRaycastInFlight(id)) {
        PropSpawner.OnRayCastHit(eventPlayer, eventPoint, eventNormal);
    } else if (TurretSpawner.HasRaycastInFlight(id)) {
        TurretSpawner.OnRayCastHit(eventPlayer, eventPoint, eventNormal);
    } else if (TurretSpawner.HasLosRaycastInFlight(id)) {
        TurretSpawner.OnLosRayCastHit(eventPlayer, eventPoint, eventNormal);
    } else if (RorschRailgun.HasRaycastInFlight(id)) {
        RorschRailgun.OnRayCastHit(eventPlayer, eventPoint, eventNormal);
    } else {
        HandleLeapRayCastHit(eventPlayer, eventPoint, eventNormal);
    }
}

export function OnRayCastMissed(eventPlayer: mod.Player) {
    const id = mod.GetObjId(eventPlayer);
    if (DecoySpawner.HasRaycastInFlight(id)) {
        DecoySpawner.OnRayCastMissed(eventPlayer);
    } else if (PropSpawner.HasRaycastInFlight(id)) {
        PropSpawner.OnRayCastMissed(eventPlayer);
    } else if (TurretSpawner.HasRaycastInFlight(id)) {
        TurretSpawner.OnRayCastMissed(eventPlayer);
    } else if (TurretSpawner.HasLosRaycastInFlight(id)) {
        TurretSpawner.OnLosRayCastMissed(eventPlayer);
    } else if (RorschRailgun.HasRaycastInFlight(id)) {
        RorschRailgun.OnRayCastMissed(eventPlayer);
    } else {
        HandleLeapRayCastMissed(eventPlayer);
    }
}

export function OnPortalGadgetAimStart(player: mod.Player): void {
    if (DecoySpawner.IsEquipped(player)) { DecoySpawner.OnAimStart(player); return; }
    if (TurretSpawner.IsEquipped(player)) { TurretSpawner.OnAimStart(player); return; }
    PropSpawner.OnAimStart(player);
}

export function OnPortalGadgetAimStop(player: mod.Player): void {
    if (DecoySpawner.IsEquipped(player)) { DecoySpawner.OnAimStop(player); return; }
    if (TurretSpawner.IsEquipped(player)) { TurretSpawner.OnAimStop(player); return; }
    PropSpawner.OnAimStop(player);
}

export function OnPortalGadgetLaserToggle(player: mod.Player, eventBoolean: boolean): void {
    if (DecoySpawner.IsEquipped(player)) { DecoySpawner.OnLaserToggle(player, eventBoolean); return; }
    if (TurretSpawner.IsEquipped(player)) { TurretSpawner.OnLaserToggle(player, eventBoolean); return; }
    PropSpawner.OnLaserToggle(player, eventBoolean);
}

export function OnPortalGadgetFireStart(player: mod.Player): void {
    if (DecoySpawner.IsEquipped(player)) { DecoySpawner.OnFireStart(player); return; }
    if (TurretSpawner.IsEquipped(player)) { TurretSpawner.OnFireStart(player); return; }
    PropSpawner.OnFireStart(player);
}

export function OnPortalGadgetFireStop(player: mod.Player): void {
    if (DecoySpawner.IsEquipped(player)) { DecoySpawner.OnFireStop(player); return; }
    if (TurretSpawner.IsEquipped(player)) { TurretSpawner.OnFireStop(player); return; }
    PropSpawner.OnFireStop(player);
}

export async function OnGameModeStarted() {
    mod.SetSpawnMode(mod.SpawnModes.AutoSpawn);
    mod.EnableAllPlayerDeploy(true);

    // ---- BOT SURVIVAL TEST MODE: no rounds/timers, ramp infected bot population ----
    if (BOT_SURVIVAL_TEST_MODE) {
        await BotSurvivalTestHarness.start();
        return;
    }

    // ---- LEAP TEST MODE: bypass all normal game logic ----
    if (LEAP_TEST_MODE) {
        mod.EnableAllPlayerDeploy(true);
        await LeapTestHarness.start();
        return;
    }

    // Sweep any vehicles left in the world from a previous session and remove them after a delay.
    (async () => {
        const existingVehicles = mod.AllVehicles();
        const count = mod.CountOf(existingVehicles);
        if (count > 0) {
            console.log(`OnGameModeStarted | Found ${count} pre-existing vehicle(s); scheduling removal in 2.`);
            await mod.Wait(2);
            for (let i = 0; i < count; i++) {
                const v = mod.ValueInArray(existingVehicles, i) as mod.Vehicle;
                CleanupVehicleWithDamage(v, 0);
            }
        }
    })();

    // Gate mode initialization until HQ position resolves to a known map identifier.
    const map = await WaitForCurrentMapGate(!SKIP_SESSION_START);
    if (map === MapNames.SAND2) {
        ROUND_DURATION = 180;
        GAME_ROUND_LIMIT = 6;
    }
    NightMode.Reset();
    NightMode.Roll();
    Sandstorm.StartSandstormTickLoop();
    // Re-resolve HQ positions now that the map gate confirms the level is loaded --
    // POSITION_HQ1/2 anchor every 2D SFX and VO spawn (see RefreshHQPositions comment).
    RefreshHQPositions();
    SpawnTeamVOSoundsAtHQ();

    gameStateMessageToast.close();
    survivorCountNotificationToast.close();

    GameHandler.roundTimeRemaining = ROUND_DURATION;
    // GameHandler.EnsureLmsMusicLoaded();

    GameHandler.gameState = GameState.PreGame;
    mod.SetAIToHumanDamageModifier(GameHandler.humanPlayers >= 2 ? AI_TO_HUMAN_DAMAGE_MODIFIER_MULTI : AI_TO_HUMAN_DAMAGE_MODIFIER_SOLO);
    GameHandler.endOfRoundCondition = '0 survivors';
    GameHandler.survivorsNextRound = GameHandler.aiSlotsToBackfill;
    GameHandler.infectedNextRound = 0;
    GameHandler.skipAlphaSelection = false;
    GameHandler.preserveAlpha = false;
    GameHandler.InitializeScoreboardTimeAndColumns();
    await GameHandler.PreGameSetup();

    GameHandler.TickUpdate(); // main game loop
}

