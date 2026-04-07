import { ParseUI, ConvertArray } from "modlib";

const VERSION = "1.04.10";

// resolved at mode start by matching HQ position and resupply interact positions
let CURRENT_MAP: MapNames | undefined;

const DEBUG = false; // turn these off on publish
const FAST_START = false;
const SKIP_SESSION_START = false;
const DEBUG_ALPHA_HUMAN_ONLY = false;
const DEBUG_ALPHA_STATE = false;
const DEBUG_SHOW_ALL_UI_ELEMENTS = false; // force-show all currently-instantiated UI widgets for layout debugging
const DEBUG_LEAP_RUNTIME = false; // temporary diagnostics for leap init/tick gating
const LEAP_TEST_MODE = false; // set true to bypass all game logic and run the leap attack sandbox
const BOT_SURVIVAL_TEST_MODE = false; // set true to disable rounds/timers and soak-test infected bot lifecycle

const BOT_SURVIVAL_TEST_SPAWN_INTERVAL_SECONDS = 10;
const BOT_SURVIVAL_TEST_MAX_INFECTED_BOTS = 11;
const BOT_SURVIVAL_TEST_DISABLE_ATTACKS = false;
let BOT_SURVIVAL_TEST_DESIRED_INFECTED_BOTS = 0;

const LOADOUT_SELECTION_TIME = 40;
const GAME_COUNTDOWN_TIME = FAST_START ? 5 : LOADOUT_SELECTION_TIME;
const WAIT_FOR_SPAWN_TIMEOUT = 3;

const INFECTED_RESPAWN_TIME = 2;
const INFECTED_RESPAWN_TIME_LAST_MAN = 4;
const INFECTED_PENDING_SPAWN_TIMEOUT_SECONDS = 3;
const PLAYER_REDEPLOY_TIME = 1;
const SURVIVOR_AI_SPAWNERS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const INFECTED_AI_SPAWNERS: number[] = [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
// TODO: replace with actual map spawner IDs configured in the level editor.
const PARACHUTE_INFECTED_SPAWNERS: number[] = [33, 34, 35, 36, 37, 38];

const AI_INFECTED_MELEE_DISTANCE = 2;
// DotProduct(survivorFacing, normalizedDirSurvivorToBot) < this value means the bot is in the
// survivor's rear hemisphere. Shooting is suppressed there to prevent engine-forced takedown kills.
const AI_MELEE_BACKSTAB_DOT_THRESHOLD = 0.0;
const AI_LEASH_RANGE = 5;
const AI_MIN_DEF_RANGE = 3;

// Vehicle-chase anti-stutter constants
const AI_VEHICLE_MELEE_DISTANCE = 6;                // attack radius when target is in a vehicle
const AI_VEHICLE_MOVE_REISSUE_SECONDS = 0.5;        // reissue every tick vehicle position changes fast
const AI_DEFAULT_MOVE_REISSUE_SECONDS = 0.3;        // throttle for normal (on-foot) targets
const AI_MELEE_CLOSE_REISSUE_SECONDS = 0.3;         // reissue very frequently when within melee range
const AI_MELEE_SWING_COOLDOWN_SECONDS = 2.0;        // minimum gap between explicit melee ForceFire calls
const AI_MOVE_FAILURE_RECOVERY_SECONDS = 2.0;       // pause chase tick after move-fail recovery behavior
const AI_TO_HUMAN_DAMAGE_MODIFIER_MULTI = 0.3; // lower values are easier
const AI_TO_HUMAN_DAMAGE_MODIFIER_SOLO = 0.5;
const MAX_PLAYER_COUNT = 12;
const INFECTED_COUNT_LIMIT = 12;

const BLACK_COLOR = [1, 1, 1];

let VOModule = mod.RuntimeSpawn_Common.SFX_VOModule_OneShot2D;
let VOSounds: any;

const SFX_NEGATIVE: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_Beacons_SignalLost_OneShot2D;
const SFX_POSITIVE: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_Circuit_TerminalCaptured_OneShot2D;
const SFX_SURVIVOR_LOST: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gamemode_Shared_CaptureObjectives_CapturingThumpEnemy_OneShot2D;
const SFX_MELEE_HIT_FALL_DMG: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_Soldier_Damage_Fall_Low_OneShot2D;
const SFX_MELEE_HIT_ARMR_BRK: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_Soldier_Damage_ArmorBreakSelf_OneShot2D;
const SFX_FINAL_FIVE: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_Rodeo_TanksLockerUnlocking_OneShot2D;
const SFX_ALPHA_SELECTED: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_Standoff_ZoneExit_OneShot2D;
const SFX_ALPHA_LEAP_2D: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_Gadgets_Decoy_WeaponFireVar01_OneShot3D; //now 3d cause couldn't find a good one

const SFX_TICKDOWN_START: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Shared_Countdown_Appear_OneShot2D;
const SFX_TICKDOWN: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Shared_Countdown_Tick_OneShot2D;
const SFX_TICKDOWN_FINAL: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Shared_Countdown_Tick_Final_OneShot2D;
const SFX_ROUND_COUNTDOWN: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_EOM_CountdownTick_OneShot2D;

const SFX_AMMO_FULL: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_DataUpload_DataDepositStop_OneShot2D;
const SFX_ACTION_BLOCKED: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Map_MapMovement_ZoomBlocked_OneShot2D;
const SFX_LOADOUT_SELECT: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_MenuNavigation_Loadout_ClickSelectLoadout_OneShot2D;
const SFX_LOADOUT_HOVER: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_MenuNavigation_Home_PlayItemHover_OneShot2D;
const SFX_LOADOUT_CONFIRM: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_MenuNavigation_Loadout_ScreenArrive_OneShot2D;
const SFX_LOADOUT_REVEAL_COMMON: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_EOR_XP_OneShot2D;
const SFX_LOADOUT_REVEAL_RARE: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Gauntlet_EOM_ReinforcementCardReveal_OneShot2D;
const SFX_LOADOUT_REVEAL_LEGENDARY: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_Notification_FieldUpgrade_Main_OneShot2D;
const SFX_SLEDGE_REMINDER: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.SFX_UI_MenuNavigation_Notification_ToasterPopUp_OneShot2D;

const ALPHA_INDICATOR_FLAME_VFX: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.FX_CarFire_FrameCrawl; // has effect on objects too
const ALPH_INDICATOR_BLINKING_FIRE_VFX: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.FX_CIN_MF_Large_Static_Fire;

const SURVIVOR_TEAM = mod.GetTeam(1);
const INFECTED_TEAM = mod.GetTeam(2);
const POINTS_PER_INFECTED_KILL = 100;
const POINTS_PER_SURVIVOR_INFECTED = 300;
const POINTS_ROUND_SURVIVED = 850;
const HEALTH_RESTORE_ON_INFECTED = 50;
const LMS_RELOAD_POLL_SECONDS = 0.1;
const LMS_RELOAD_SPEED_FACTOR = 0.35;
const INFECTED_HINT_ROTATION_SECONDS = 8;
const CURRENT_MAP_HQ_POSITION_THRESHOLD = 5.0;  // Increased from 1.0 to account for floating-point precision
const CURRENT_MAP_RESUPPLY_POSITION_THRESHOLD = 5.0;  // Increased from 1.0 to account for floating-point precision
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
    "infected_hint_assault_ladder",
    "infected_hint_brains",
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
    "lms_buff_damage_resist",
    "lms_buff_ammo_on_kill",
] as const;

const ALPHA_BUFF_STRING_KEYS = [
    "alpha_infected_area_notification",
    "alpha_buff_tankier",
    "alpha_buff_leap_attack",
    "alpha_buff_speed",
] as const;

const ALPHA_BUFF_STRING_KEYS_NO_LEAP = [
    "alpha_infected_area_notification",
    "alpha_buff_tankier",
    "alpha_buff_speed",
] as const;

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
const SAND2_SURVIVOR_HQ: HQInfo = { position: { x: 5.217, y: 58.102, z: -19.788 }, team: mod.GetTeam(1), hq: mod.GetHQ(1) };

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

const POSITION_HQ1 = mod.GetObjectPosition(mod.GetHQ(1));
const POSITION_HQ2 = mod.GetObjectPosition(mod.GetHQ(2));
const ZERO_VEC: mod.Vector = mod.CreateVector(0, 0, 0);

let RESUPPLY_WORLD_ICONS: ResupplyWorldIconId[] = [];
let RESUPPLY_INTERACT_POINTS: ResupplyInteractPointId[] = [];
const RESUPPLY_WORLD_LOCATION: Map<ResupplyInteractPointId, mod.Vector> = new Map<ResupplyInteractPointId, mod.Vector>();

let ROUND_DURATION = 120; // duration of each round in seconds
let GAME_ROUND_LIMIT = 9;

// Tracked vehicle reference -- set in OnVehicleSpawned, used by infected AI logic
let SPAWNED_ACTIVE_VEHICLE: mod.Vehicle | undefined = undefined;
let LEAP_ATTACK_UNLOCKED_THIS_ROUND = false;

// Vehicle spawner IDs to randomly pick from when final five triggers
const VEHICLE_SPAWNER_IDS: number[] = [202, 203];

// Pool of vehicle types randomly selected each time the final five vehicle spawns
const VEHICLE_TYPES: mod.VehicleList[] = [
    mod.VehicleList.Vector,
    mod.VehicleList.Quadbike,
    mod.VehicleList.GolfCart,
    mod.VehicleList.Flyer60,
    // eventually dirtbike goes here too
];

// WEAPON RARITY THRESHOLDS -- lower threshold means more common, higher value means more rare
const RARITY_MEDIUM_THRESHOLD = 30;
const RARITY_HIGH_THRESHOLD = 60;
const RARITY_RARE_THRESHOLD = 80;
const RARITY_LEGENDARY_THRESHOLD = 100;
const ATTACHMENT_RARITY_RARE_THRESHOLD = 15;
const ATTACHMENT_RARITY_LEGENDARY_THRESHOLD = 30;


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
    const isAI = player ? mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier) : false;
    console.log(
        `[AlphaDebug] ${context} | player:${playerObjId} team:${teamObjId} alive:${isAlive} ai:${isAI} ` +
        `ppAlpha:${resolvedPlayerProfile?.isAlphaInfected} ppInfected:${resolvedPlayerProfile?.isInfectedTeam} ` +
        `bpAlpha:${resolvedBotProfile?.isAlphaInfected} bpInfected:${resolvedBotProfile?.isInfectedTeam} state:${GameHandler.gameState}`
    );
}

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

function IsLeapAttackAvailableNow(): boolean {
    if (LEAP_TEST_MODE) return true;
    return CURRENT_MAP === MapNames.SAND2
        && LEAP_ATTACK_UNLOCKED_THIS_ROUND;
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

function GetInfectedHintKeysForCurrentRound(): readonly string[] {
    return IsLeapAttackAvailableNow()
        ? INFECTED_HINT_STRING_KEYS
        : INFECTED_HINT_STRING_KEYS_NO_LEAP;
}

function GetAlphaInfectedHintKeysForCurrentRound(): readonly string[] {
    return IsLeapAttackAvailableNow()
        ? INFECTED_ALPHA_HINT_STRING_KEYS
        : INFECTED_ALPHA_HINT_STRING_KEYS_NO_LEAP;
}

function GetInfectedHintMessage(index: number): mod.Message {
    const hintKeys = GetInfectedHintKeysForCurrentRound();
    const normalizedIndex = ((index % hintKeys.length) + hintKeys.length) % hintKeys.length;
    return ResolveStringKeyMessage(hintKeys[normalizedIndex]);
}

function GetAlphaInfectedHintMessage(index: number): mod.Message {
    const hintKeys = GetAlphaInfectedHintKeysForCurrentRound();
    const normalizedIndex = ((index % hintKeys.length) + hintKeys.length) % hintKeys.length;
    return ResolveStringKeyMessage(hintKeys[normalizedIndex]);
}

function GetLastManStandingBuffMessages(): mod.Message[] {
    return LMS_BUFF_STRING_KEYS.map((key) => ResolveStringKeyMessage(key));
}

function GetAlphaInfectedBuffMessages(): mod.Message[] {
    const buffKeys = IsLeapAttackAvailableNow()
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

function SafeIsAlive(player: mod.Player | undefined): boolean {
    if (!IsPlayerDeployed(player)) return false;
    return mod.GetSoldierState(player as mod.Player, mod.SoldierStateBool.IsAlive);
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
const LMS_WORLD_ICON_OBJECTS: Map<number, mod.Any> = new Map();
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
const PLAYER_ONGOING_LADDER_CHECK_SECONDS = 0.1;
const BOT_SURVIVAL_DEBUG_UPDATE_SECONDS = 0.25;
const AI_BOT_TICK_SECONDS = 0.15; // interval between AI logic ticks per infected bot slot
const PLAYER_BANNED_CHECK_SETTLE_SECONDS = 3;
const PLAYER_SLEDGE_REMINDER_MIN_SECONDS = 5;
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
}

// SlotLoadoutOptions: three options per weapon slot, plus auto gadget/throwable
interface SlotLoadoutOptions {
    sidearmOptions: Array<EquippedItem>;
    primaryOptions: Array<EquippedItem>;
    lmsOptions: Array<EquippedItem>;
    gadget: EquippedItem;
    throwable: EquippedItem;
}

interface WeaponAmmoProfile {
    baseMagSize: number;
    reserveMags: number; // reserve ammo in multiples of mag size
    resupplyMags: number; // resupply amount in multiples of mag size
}

class Weapons {

    static baseWeaponAttachments: Record<string, mod.WeaponAttachments[]> = {
        m87a1: [
            mod.WeaponAttachments.Ammo_Buckshot,
            mod.WeaponAttachments.Magazine_5_Shell_Tube,
            mod.WeaponAttachments.Barrel_20_Factory,
            mod.WeaponAttachments.Scope_Iron_Sights,
        ],
        m1014: [
            mod.WeaponAttachments.Ammo_Buckshot,
            mod.WeaponAttachments.Magazine_7_Shell_Tube,
            mod.WeaponAttachments.Barrel_185_Factory,
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
            mod.WeaponAttachments.Scope_Iron_Sights,
        ],
        p18: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Magazine_17rnd_Magazine,
            mod.WeaponAttachments.Barrel_39_Factory,
            mod.WeaponAttachments.Scope_Iron_Sights,
        ],
        g22: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Magazine_15rnd_Magazine,
            mod.WeaponAttachments.Barrel_114mm_Factory,
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
        { attachment: mod.WeaponAttachments.Scope_Iron_Sights, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_iron_sights", rarity: 5, compatibleNameKeys: ["m87a1", "185ksk", "m1014", "ak205", "m277", "kord6p67", "rpkm", "usg90", "m45a1", "m44", "m357", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Muzzle_Compensated_Brake, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_compensated_brake", rarity: 15, compatibleNameKeys: ["rpkm", "m123k", "m4a1", "kord6p67", "ak205", "usg90"] },
        { attachment: mod.WeaponAttachments.Muzzle_Single_port_Brake, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_single_port_brake", rarity: 15, compatibleNameKeys: ["rpkm", "m123k", "m4a1", "kord6p67", "ak205"] },
        { attachment: mod.WeaponAttachments.Muzzle_Double_port_Brake, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_double_port_brake", rarity: 20, compatibleNameKeys: ["rpkm", "m123k", "m4a1", "kord6p67", "m277", "ak205", "185ksk"] },
        { attachment: mod.WeaponAttachments.Muzzle_CQB_Suppressor, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_cqb_suppressor", rarity: 15, compatibleNameKeys: ["db12", "m45a1", "es57", "p18", "m1014", "m123k", "m4a1", "m277"] },
        { attachment: mod.WeaponAttachments.Muzzle_Standard_Suppressor, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_standard_suppressor", rarity: 15, compatibleNameKeys: ["m45a1", "es57", "p18", "m4a1"] },
        { attachment: mod.WeaponAttachments.Bottom_Ribbed_Stubby, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_ribbed_stubby", rarity: 20, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "m277", "ak205", "rpkm", "m4a1"] },
        { attachment: mod.WeaponAttachments.Bottom_Folding_Vertical, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_folding_vertical", rarity: 15, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "m277", "ak205", "rpkm", "m4a1"] },
        { attachment: mod.WeaponAttachments.Bottom_Slim_Handstop, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_slim_handstop", rarity: 10, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "m277", "ak205", "rpkm", "m4a1"] },
        { attachment: mod.WeaponAttachments.Bottom_Low_Profile_Stubby, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_low_profile_stubby", rarity: 20, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "m277", "ak205", "rpkm", "m123k", "m4a1"] },
        { attachment: mod.WeaponAttachments.Bottom_Underslung_Mount, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_underslung_mount", rarity: 5, compatibleNameKeys: ["m4a1", "m277"] },
        { attachment: mod.WeaponAttachments.Ergonomic_Improved_Mag_Catch, slot: AttachmentSlot.Ergonomic, nameKey: "attachment_ergonomic_mag_catch", rarity: 10, compatibleNameKeys: ["m45a1", "g22", "es57", "p18"] },
        // ammo
        { attachment: mod.WeaponAttachments.Ammo_FMJ, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_fmj", rarity: 5, compatibleNameKeys: ["ak205", "m277", "kord6p67", "rpkm", "m123k", "usg90", "m45a1", "m44", "m357", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Ammo_Hollow_Point, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_hollow_point", rarity: 15, compatibleNameKeys: ["ak205", "m277", "kord6p67", "rpkm", "m123k", "m4a1", "usg90", "m45a1", "m44", "m357", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Ammo_Tungsten_Core, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_tungsten_core", rarity: 15, compatibleNameKeys: ["ak205", "m277", "kord6p67", "rpkm", "m123k", "m4a1", "usg90"] },
        { attachment: mod.WeaponAttachments.Ammo_Synthetic_Tip, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_synthetic_tip", rarity: 30, compatibleNameKeys: ["ak205", "m4a1", "kord6p67", "rpkm"] },
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
        { attachment: mod.WeaponAttachments.Magazine_5_Shell_Tube, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_5_shell_tube", rarity: 10, compatibleNameKeys: ["m87a1"] },
        { attachment: mod.WeaponAttachments.Magazine_7_Shell_Tube, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_7_shell_tube", rarity: 10, compatibleNameKeys: ["m1014", "m87a1"] },
        { attachment: mod.WeaponAttachments.Magazine_4rnd_Fast_Mag, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_4rnd_fast_mag", rarity: 10, compatibleNameKeys: ["185ksk"] },
        { attachment: mod.WeaponAttachments.Magazine_7rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_7rnd_magazine", rarity: 10, compatibleNameKeys: ["m45a1"] },
        { attachment: mod.WeaponAttachments.Magazine_11rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_11rnd_magazine", rarity: 30, compatibleNameKeys: ["m45a1"] },
        { attachment: mod.WeaponAttachments.Magazine_8rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_8rnd_cylinder", rarity: 5, compatibleNameKeys: ["m357"] },
        { attachment: mod.WeaponAttachments.Magazine_8rnd_Moon_Clip, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_8rnd_moon_clip", rarity: 15, compatibleNameKeys: ["m357"] },
        { attachment: mod.WeaponAttachments.Magazine_8rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_8rnd_magazine", rarity: 25, compatibleNameKeys: ["185ksk"] },
        { attachment: mod.WeaponAttachments.Magazine_17rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_17rnd_magazine", rarity: 10, compatibleNameKeys: ["p18"] },
        { attachment: mod.WeaponAttachments.Magazine_20rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_20rnd_magazine", rarity: 15, compatibleNameKeys: ["es57", "g22"] },
        { attachment: mod.WeaponAttachments.Magazine_21rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_21rnd_magazine", rarity: 20, compatibleNameKeys: ["p18"] },
        { attachment: mod.WeaponAttachments.Magazine_30rnd_Magazine, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_30rnd_magazine", rarity: 20, compatibleNameKeys: ["m277"] },
        { attachment: mod.WeaponAttachments.Magazine_40rnd_Fast_Mag, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_40rnd_fast_mag", rarity: 20, compatibleNameKeys: ["kord6p67", "ak205", "rpkm", "m4a1"] },
        { attachment: mod.WeaponAttachments.Magazine_45rnd_Fast_Mag, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_45rnd_fast_mag", rarity: 30, compatibleNameKeys: ["kord6p67", "ak205", "rpkm"] },
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
        { attachment: mod.WeaponAttachments.Right_5_mW_Red, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_5mw_red", rarity: 5, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "ak205", "rpkm", "m123k",] },
        { attachment: mod.WeaponAttachments.Right_5_mW_Green, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_5mw_green", rarity: 10, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "ak205", "rpkm", "m123k",] },
        { attachment: mod.WeaponAttachments.Right_50_mW_Green, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_50mw_green", rarity: 10, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "ak205", "rpkm", "m123k",] },
        { attachment: mod.WeaponAttachments.Right_50_mW_Blue, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_50mw_blue", rarity: 15, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "ak205", "rpkm", "m123k",] },
        { attachment: mod.WeaponAttachments.Right_120_mW_Blue, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_120mw_blue", rarity: 15, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "ak205", "rpkm", "m123k",] },
        { attachment: mod.WeaponAttachments.Right_Flashlight, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_flashlight", rarity: 10, compatibleNameKeys: ["db12", "kord6p67", "m277", "usg90", "m4a1",] },
        { attachment: mod.WeaponAttachments.Right_Laser_Light_Combo_Green, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_laser_light_combo_green", rarity: 20, compatibleNameKeys: ["kord6p67",] },
        { attachment: mod.WeaponAttachments.Right_Laser_Light_Combo_Red, slot: AttachmentSlot.Rail, nameKey: "attachment_rail_right_laser_light_combo_red", rarity: 20, compatibleNameKeys: [] },
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
        { nameKey: "p18", rarity: 50, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_P18, packageImage: Weapons.baseWeaponPackages["p18"] },
        { nameKey: "g22", rarity: 50, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_GGH_22, packageImage: Weapons.baseWeaponPackages["g22"] },
        // { nameKey: "vz61", rarity: 50, category: ItemPoolCategory.sidearm, item: mod.Weapons.Side, packageImage: Weapons.baseWeaponPackages["vz61"] },
        { nameKey: "es57", rarity: 50, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_ES_57, packageImage: Weapons.baseWeaponPackages["es57"] },
        { nameKey: "m45a1", rarity: 50, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_M45A1, packageImage: Weapons.baseWeaponPackages["m45a1"] },
        { nameKey: "m357", rarity: 60, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_M357_Trait, packageImage: Weapons.baseWeaponPackages["m357"] },
        { nameKey: "m44", rarity: 80, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_M44, packageImage: Weapons.baseWeaponPackages["m44"] },
        { nameKey: "m87a1", rarity: 40, category: ItemPoolCategory.primary, item: mod.Weapons.Shotgun_M87A1, packageImage: Weapons.baseWeaponPackages["m87a1"] },
        { nameKey: "m1014", rarity: 40, category: ItemPoolCategory.primary, item: mod.Weapons.Shotgun_M1014, packageImage: Weapons.baseWeaponPackages["m1014"] },
        { nameKey: "db12", rarity: 60, category: ItemPoolCategory.primary, item: mod.Weapons.Shotgun_DB_12, packageImage: Weapons.baseWeaponPackages["db12"] },
        { nameKey: "185ksk", rarity: 80, category: ItemPoolCategory.primary, item: mod.Weapons.Shotgun__185KS_K, packageImage: Weapons.baseWeaponPackages["185ksk"] },
        { nameKey: "m4a1", rarity: 40, category: ItemPoolCategory.LMS, item: mod.Weapons.Carbine_M4A1, packageImage: Weapons.baseWeaponPackages["m4a1"] },
        { nameKey: "usg90", rarity: 40, category: ItemPoolCategory.LMS, item: mod.Weapons.SMG_USG_90, packageImage: Weapons.baseWeaponPackages["usg90"] },
        { nameKey: "m277", rarity: 40, category: ItemPoolCategory.LMS, item: mod.Weapons.Carbine_M277, packageImage: Weapons.baseWeaponPackages["m277"] },
        { nameKey: "rpkm", rarity: 50, category: ItemPoolCategory.LMS, item: mod.Weapons.LMG_RPKM, packageImage: Weapons.baseWeaponPackages["rpkm"] },
        { nameKey: "ak205", rarity: 70, category: ItemPoolCategory.LMS, item: mod.Weapons.Carbine_AK_205, packageImage: Weapons.baseWeaponPackages["ak205"] },
        { nameKey: "kord6p67", rarity: 80, category: ItemPoolCategory.LMS, item: mod.Weapons.AssaultRifle_KORD_6P67, packageImage: Weapons.baseWeaponPackages["kord6p67"] },
        { nameKey: "m123k", rarity: 80, category: ItemPoolCategory.LMS, item: mod.Weapons.LMG_M123K, packageImage: Weapons.baseWeaponPackages["m123k"] },
        // {nameKey: "m121a2", rarity: 90, category: ItemPoolCategory.LMS, item: mod.Weapons., packageImage: Weapons.baseWeaponPackages["m121a2"] },
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

    static baseSurvivorGadgets: PooledItemDef[] = [
        { nameKey: "flash_grenade", rarity: 5, category: ItemPoolCategory.throwables, item: mod.Gadgets.Throwable_Flash_Grenade },
        { nameKey: "frag_grenade_mini", rarity: 5, category: ItemPoolCategory.throwables, item: mod.Gadgets.Throwable_Mini_Frag_Grenade },
        { nameKey: "incendiary_grenade", rarity: 10, category: ItemPoolCategory.throwables, item: mod.Gadgets.Throwable_Incendiary_Grenade },
        { nameKey: "deployable_cover", rarity: 10, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Deployable_Cover },
        { nameKey: "supply_pouch", rarity: 10, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Misc_Supply_Pouch },
        { nameKey: "ap_mine", rarity: 20, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Misc_Anti_Personnel_Mine },
        { nameKey: "c4_remote", rarity: 60, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Misc_Demolition_Charge },
        { nameKey: "supply_bag", rarity: 60, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Class_Supply_Bag },
        { nameKey: "incendiary_shotgun", rarity: 80, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Misc_Incendiary_Round_Shotgun },
        { nameKey: "thermobaric_launcher", rarity: 70, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Launcher_Thermobaric_Grenade },
        { nameKey: "he_launcher", rarity: 70, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Launcher_High_Explosive },
        { nameKey: "incendiary_airburst", rarity: 70, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Launcher_Incendiary_Airburst },
    ]

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
        if (pkg.addedRarity < ATTACHMENT_RARITY_RARE_THRESHOLD) {
            totalRarity = Math.min(totalRarity, RARITY_RARE_THRESHOLD - 1);
        }
        if (pkg.addedRarity < ATTACHMENT_RARITY_LEGENDARY_THRESHOLD) {
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
                const candidate = Weapons.buildWeaponOption(next, slot);
                const candidateKey = normalizeUpgrades(candidate.appliedUpgradeKeys);
                const isDuplicate = options.some(opt =>
                    opt.weapon === candidate.weapon && normalizeUpgrades(opt.appliedUpgradeKeys) === candidateKey
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
                chosen = Weapons.buildWeaponOption(fallback, slot);
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

    static BuildDefaultLoadoutFromOptions(options: SlotLoadoutOptions): Array<EquippedItem> {
        const items: Array<EquippedItem> = [];
        if (options.sidearmOptions[0]) items.push(options.sidearmOptions[0]);
        if (options.gadget) items.push(options.gadget);
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

        // Sidearm Weapon
        const sidearmWeapons = Weapons.baseWeapons.filter(w => w.category === ItemPoolCategory.sidearm);
        console.log(`GenerateLoadoutOptions | Sidearm weapon pool size: ${sidearmWeapons.length}`);
        const sidearmOptions = Weapons.buildWeaponOptions(sidearmWeapons, InventorySlot.Sidearm, 3);
        if (sidearmOptions.length === 0) {
            console.log(`GenerateLoadoutOptions ERROR | Failed to select sidearm weapon options`);
        }
        console.log(`GenerateLoadoutOptions | Sidearm options: ${sidearmOptions.map(p => p.text).join(', ')}`);

        // Gadget (primary)
        const gadgetChoices = Weapons.baseSurvivorGadgets.filter(g => g.category === ItemPoolCategory.gadgets);
        console.log(`GenerateLoadoutOptions | Gadget pool size: ${gadgetChoices.length}`);
        const gadgetDef = Weapons.getRandomWeaponFromRarity(gadgetChoices);
        if (!gadgetDef) {
            console.log(`GenerateLoadoutOptions ERROR | Failed to select gadget`);
        }
        const gadget = gadgetDef ? Weapons.buildGadgetOption(gadgetDef, InventorySlot.Gadget) : {
            gadget: mod.Gadgets.Deployable_Cover,
            inventorySlot: InventorySlot.Gadget,
            text: mod.stringkeys.deployable_cover,
            packageImage: mod.CreateNewWeaponPackage(),
            rarity: 1,
        };

        // Throwable
        const throwableChoices = Weapons.baseSurvivorGadgets.filter(g => g.category === ItemPoolCategory.throwables);
        console.log(`GenerateLoadoutOptions | Throwable pool size: ${throwableChoices.length}`);
        const throwableDef = Weapons.getRandomWeaponFromRarity(throwableChoices);
        if (!throwableDef) {
            console.log(`GenerateLoadoutOptions ERROR | Failed to select throwable`);
        }
        const throwable = throwableDef ? Weapons.buildGadgetOption(throwableDef, InventorySlot.Throwable) : {
            gadget: mod.Gadgets.Throwable_Incendiary_Grenade,
            inventorySlot: InventorySlot.Throwable,
            text: mod.stringkeys.incendiary_grenade,
            packageImage: mod.CreateNewWeaponPackage(),
            rarity: 1,
        };

        console.log(`GenerateLoadoutOptions | Generated slot options for player ${playerProfile.playerID}`);
        return {
            sidearmOptions,
            primaryOptions,
            lmsOptions,
            gadget,
            throwable,
        };
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
     * - Fixed gear: Sledgehammer, Assault Ladder, Throwable (Flash or Stun for alpha)
     */
    static GetRoundLoadout(playerProfile: PlayerProfile): Array<EquippedItem> {
        const items: Array<EquippedItem> = [];
        const infected = playerProfile.isInfectedTeam || (mod.GetObjId(mod.GetTeam(playerProfile.player)) === mod.GetObjId(INFECTED_TEAM));
        const alphaInfected = playerProfile.isAlphaInfected;

        // Infected loadout: fixed gear, not using saved loadout
        if (infected) {
            let gadget = mod.Gadgets.Throwable_Flash_Grenade;
            let gadgetText = mod.stringkeys.infected_throwable_knives;

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
            if (alphaInfected) {
                gadget = mod.Gadgets.Throwable_Stun_Grenade;
                gadgetText = mod.stringkeys.infected_throwable_stun;
            }
            items.push({
                gadget: gadget,
                inventorySlot: InventorySlot.Throwable,
                text: gadgetText,
                packageImage: mod.CreateNewWeaponPackage(),
            });
            return items;
        }

        // Survivor loadout: use saved loadout as source of truth
        let savedLoadout = Weapons.GetLoadoutFromPlayerProfile(playerProfile);
        if (!savedLoadout) {
            console.log(`GetRoundLoadout | No saved loadout for player ${playerProfile.playerID}, generating new one`);
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
        if (isRoundRunning) {
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
    static infectedNightGreen = mod.CreateVector(0.01, 0.02, 0.01);
    static blackColor = mod.CreateVector(0, 0, 0); // pure black
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

    static playerInfectionAlertPosition = mod.CreateVector(0, 20 + this.gameStateNotificationY, 0);
    static playerInfectionAlertSize = mod.CreateVector(320, 45, 0);

    static UpdateUI(widget: mod.UIWidget | undefined, message?: mod.Message, show?: boolean, size?: mod.Vector): void {
        widget && message && mod.SetUITextLabel(widget, message);
        widget && size && mod.SetUIWidgetSize(widget, size);
        widget && show != undefined && mod.SetUIWidgetVisible(widget, show);
    }

    static async UpdateUIForWidgetType(
        widgetGetter: (pp: PlayerProfile) => mod.UIWidget | mod.UIWidget[] | undefined,
        arrayOfPlayers: mod.Player[],
        show: boolean,
        message?: mod.Message,
        size?: mod.Vector,
    ): Promise<void> {
        if (!size) {
            size = mod.CreateVector(120, 45, 0);
        }

        arrayOfPlayers.forEach(player => {
            const playerProfile = PlayerProfile.Get(player);
            if (playerProfile) {
                const widget = widgetGetter(playerProfile);
                if (widget) {
                    if (Array.isArray(widget)) {
                        // Handle array of widgets
                        widget.forEach(w => {
                            if (message && widget.indexOf(w) === 0) {
                                this.UpdateUI(w, message, show);
                            } else {
                                mod.SetUIWidgetVisible(w, show);
                            }
                        });
                    } else {
                        // Handle single widget
                        if (message) {
                            UI.UpdateUI(widget, message, show, size);
                        } else {
                            mod.SetUIWidgetVisible(widget, show);
                        }
                    }
                }
            }
        });
    }

    static showingPersonalAlert: boolean = false;

    static async ShowYouInfectedAlert(playerProfile: PlayerProfile, eventOtherPlayer: mod.Player) {
        const message = MakeMessage(mod.stringkeys.infected_on_kill, eventOtherPlayer);
        this.showingPersonalAlert = true;
        UI.UpdateUI(playerProfile.youInfectedWidget, message, true, mod.CreateVector(320, 48, 0));
        await mod.Wait(3);
        UI.UpdateUI(playerProfile.youInfectedWidget, message, false)
        this.showingPersonalAlert = false;
    }

    static async ShowInfectedByAlert(playerProfile: PlayerProfile, eventOtherPlayer: mod.Player) {
        const message = MakeMessage(mod.stringkeys.infected_on_death, eventOtherPlayer)
        this.showingPersonalAlert = true;
        UI.UpdateUI(playerProfile.infectedByWidget, message, true, mod.CreateVector(320, 48, 0));
        await mod.Wait(3);
        UI.UpdateUI(playerProfile.infectedByWidget, message, false);
        this.showingPersonalAlert = false;
    }

    static CreateNewInfectedAlert(playerProfile: PlayerProfile): mod.UIWidget {
        const componentName = "new_infected_" + playerProfile.playerID;
        mod.AddUIText(componentName, mod.CreateVector(0, UI.alphaFeedbackY, 0), mod.CreateVector(320, 45, 0), mod.UIAnchor.TopCenter, MakeMessage(mod.stringkeys.new_infected), playerProfile.player);
        let widget = mod.FindUIWidgetWithName(componentName) as mod.UIWidget;
        mod.SetUITextColor(widget, UI.battlefieldWhite);
        mod.SetUITextSize(widget, 22);
        mod.SetUITextAnchor(widget, mod.UIAnchor.Center);
        mod.SetUIWidgetPadding(widget, 5);
        mod.SetUIWidgetVisible(widget, false);
        mod.SetUIWidgetBgFill(widget, mod.UIBgFill.Blur);
        mod.SetUIWidgetBgColor(widget, UI.battlefieldBlueBg);
        mod.SetUIWidgetBgAlpha(widget, 1);
        mod.SetUIWidgetDepth(widget, mod.UIDepth.AboveGameUI);

        return widget;
    }

    static CreateInfectedByAlert(playerProfile: PlayerProfile): mod.UIWidget {
        const componentName = "infected_by_alert_" + playerProfile.playerID;
        mod.AddUIText(componentName, this.playerInfectionAlertPosition, this.playerInfectionAlertSize, mod.UIAnchor.TopCenter, MakeMessage(mod.stringkeys.infected_on_death, playerProfile.player), playerProfile.player);
        let widget = mod.FindUIWidgetWithName(componentName) as mod.UIWidget;
        mod.SetUITextColor(widget, UI.battlefieldWhite);
        mod.SetUITextSize(widget, 22);
        mod.SetUITextAnchor(widget, mod.UIAnchor.Center);
        mod.SetUIWidgetPadding(widget, 5);
        mod.SetUIWidgetVisible(widget, false);
        mod.SetUIWidgetBgFill(widget, mod.UIBgFill.Blur);
        mod.SetUIWidgetBgColor(widget, UI.battlefieldRedBg);
        mod.SetUIWidgetBgAlpha(widget, 1);
        mod.SetUIWidgetDepth(widget, mod.UIDepth.AboveGameUI);

        return widget;
    }

    static CreateYouInfectedAlert(playerProfile: PlayerProfile): mod.UIWidget {
        const componentName = "you_infected_alert_" + playerProfile.playerID;
        mod.AddUIText(componentName, this.playerInfectionAlertPosition, this.playerInfectionAlertSize, mod.UIAnchor.TopCenter, MakeMessage(mod.stringkeys.infected_on_kill, playerProfile.player), playerProfile.player);
        let widget = mod.FindUIWidgetWithName(componentName) as mod.UIWidget;
        mod.SetUITextColor(widget, UI.battlefieldWhite);
        mod.SetUITextSize(widget, 22);
        mod.SetUITextAnchor(widget, mod.UIAnchor.Center);
        mod.SetUIWidgetPadding(widget, 5);
        mod.SetUIWidgetVisible(widget, false);
        mod.SetUIWidgetBgFill(widget, mod.UIBgFill.Blur);
        mod.SetUIWidgetBgColor(widget, UI.battlefieldRedBg);
        mod.SetUIWidgetBgAlpha(widget, 1);
        mod.SetUIWidgetDepth(widget, mod.UIDepth.AboveGameUI);

        return widget;
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

    static CreateInfectedNightOverlay(playerProfile: PlayerProfile): mod.UIWidget {
        const componentName = `infected_night_overlay_${playerProfile.playerID}`;
        mod.AddUIContainer(
            componentName,
            mod.CreateVector(0, 0, 0),
            mod.CreateVector(3840, 1080, 0),
            mod.UIAnchor.Center,
            playerProfile.player
        );
        const widget = mod.FindUIWidgetWithName(componentName) as mod.UIWidget;
        mod.SetUIWidgetBgFill(widget, mod.UIBgFill.Solid);
        mod.SetUIWidgetBgColor(widget, UI.infectedNightGreen);
        mod.SetUIWidgetBgAlpha(widget, 0.5);
        mod.SetUIWidgetDepth(widget, mod.UIDepth.BelowGameUI);
        mod.SetUIWidgetVisible(widget, false);
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

    CreateTeamIndicationWidget(): mod.UIWidget[] | undefined {
        if (!this.rootWidget)
            return;
        let widgetGroup: mod.UIWidget[] = [];
        const corners = ["top_left", "bottom_left", "top_right", "bottom_right"];
        const anchors = [mod.UIAnchor.TopLeft, mod.UIAnchor.BottomLeft, mod.UIAnchor.TopRight, mod.UIAnchor.BottomRight];
        let teamRightSide: boolean = false;
        if (this._PlayerProfile.isInfectedTeam) {
            teamRightSide = true;
        }
        const playerTeamUIName = "name" + this._PlayerProfile.playerID;
        let yOffset = 3;
        const horizontalPosition = mod.CreateVector(0, 0, 0);
        const verticalPositionLeft = mod.CreateVector(0, yOffset, 0); //annoying bug with vertical bar overlap.
        const verticalPositionRight = mod.CreateVector(0, yOffset, 0); //annoying bug with vertical bar overlap.
        const horizontalSize = mod.CreateVector(15, 3, 0); // width, height, unused;
        const verticalSize = mod.CreateVector(3, 20, 0);    // width, height, unused;
        for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
            let horizontalBorderName = playerTeamUIName + corners[cornerIndex];
            mod.AddUIContainer(
                horizontalBorderName,
                horizontalPosition,
                horizontalSize,
                anchors[cornerIndex],
                this._PlayerProfile.player
            )
            let horizontalBarWidget = mod.FindUIWidgetWithName(horizontalBorderName) as mod.UIWidget;
            let teamParentContainer = mod.FindUIWidgetWithName(teamRightSide ? `red_team_container_${this._PlayerProfile.playerID}` : `blue_team_container_${this._PlayerProfile.playerID}`);
            mod.SetUIWidgetVisible(horizontalBarWidget, true);
            mod.SetUIWidgetParent(horizontalBarWidget, teamParentContainer);
            mod.SetUIWidgetBgFill(horizontalBarWidget, mod.UIBgFill.Solid);
            mod.SetUIWidgetBgColor(horizontalBarWidget, teamRightSide ? UI.battlefieldRed : UI.battlefieldBlue);
            mod.SetUIWidgetBgAlpha(horizontalBarWidget, 1);

            let verticalBorderName = horizontalBorderName + "_vertical";
            mod.AddUIContainer(
                verticalBorderName,
                (cornerIndex < 2) ? verticalPositionLeft : verticalPositionRight,
                verticalSize,
                anchors[cornerIndex],
                this._PlayerProfile.player
            )
            let verticalBarWidget = mod.FindUIWidgetWithName(verticalBorderName) as mod.UIWidget;
            mod.SetUIWidgetVisible(verticalBarWidget, true);
            mod.SetUIWidgetParent(verticalBarWidget, teamParentContainer);
            mod.SetUIWidgetBgFill(verticalBarWidget, mod.UIBgFill.Solid);
            mod.SetUIWidgetBgColor(verticalBarWidget, teamRightSide ? UI.battlefieldRed : UI.battlefieldBlue);
            mod.SetUIWidgetBgAlpha(verticalBarWidget, 1);

            widgetGroup.push(horizontalBarWidget, verticalBarWidget);
        }
        return widgetGroup;
    }
}

class GameStateNotificationWidget {
    uiID = "game_state_notification_ui"
    rootWidget: mod.UIWidget | undefined;
    notificationBorderWidget: mod.UIWidget[] | undefined;
    containerWidth = 600;
    containerHeight = 60;
    borderNo = 0;
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
        this.notificationBorderWidget = this.NotificationBorderDashes();
    }

    NotificationBorderDashes(): mod.UIWidget[] | undefined {
        if (!this.rootWidget)
            return;
        let widgetGroup: mod.UIWidget[] = [];
        const corners = ["top_left", "bottom_left", "top_right", "bottom_right"];
        const anchors = [mod.UIAnchor.TopLeft, mod.UIAnchor.BottomLeft, mod.UIAnchor.TopRight, mod.UIAnchor.BottomRight];
        const widgetBorderName = `game_state_notification_border_${this.borderNo++}_`;
        let yOffset = 3;
        const horizontalPosition = mod.CreateVector(0, 0, 0);
        const verticalPositionLeft = mod.CreateVector(0, yOffset, 0);
        const verticalPositionRight = mod.CreateVector(0, yOffset, 0);
        const horizontalSize = mod.CreateVector(17, 3, 0);
        const verticalSize = mod.CreateVector(3, 8, 0);
        let notificationParent = mod.FindUIWidgetWithName("game_state_notification_background");
        if (!notificationParent) return;

        for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
            let horizontalBorderName = widgetBorderName + corners[cornerIndex];
            mod.AddUIContainer(
                horizontalBorderName,
                horizontalPosition,
                horizontalSize,
                anchors[cornerIndex],
            )
            let horizontalBarWidget = mod.FindUIWidgetWithName(horizontalBorderName) as mod.UIWidget;
            mod.SetUIWidgetVisible(horizontalBarWidget, true);
            mod.SetUIWidgetParent(horizontalBarWidget, notificationParent);
            mod.SetUIWidgetBgFill(horizontalBarWidget, mod.UIBgFill.Solid);
            mod.SetUIWidgetBgColor(horizontalBarWidget, UI.battlefieldWhite);
            mod.SetUIWidgetBgAlpha(horizontalBarWidget, 0.3);

            let verticalBorderName = horizontalBorderName + "_vertical";
            mod.AddUIContainer(
                verticalBorderName,
                (cornerIndex < 2) ? verticalPositionLeft : verticalPositionRight,
                verticalSize,
                anchors[cornerIndex],
            )
            let verticalBarWidget = mod.FindUIWidgetWithName(verticalBorderName) as mod.UIWidget;
            mod.SetUIWidgetVisible(verticalBarWidget, true);
            mod.SetUIWidgetParent(verticalBarWidget, notificationParent);
            mod.SetUIWidgetBgFill(verticalBarWidget, mod.UIBgFill.Solid);
            mod.SetUIWidgetBgColor(verticalBarWidget, UI.battlefieldWhite);
            mod.SetUIWidgetBgAlpha(verticalBarWidget, 0.3);

            widgetGroup.push(horizontalBarWidget, verticalBarWidget);
        }
        return widgetGroup;
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
    private selectedSlots: Map<InventorySlot, EquippedItem> = new Map();
    private readonly slotOrder: InventorySlot[] = [
        InventorySlot.Sidearm,
        InventorySlot.Primary,
        InventorySlot.LMS,
    ];
    _PlayerProfile: PlayerProfile;

    loadoutOptions: SlotLoadoutOptions | undefined;

    width = 1200;
    height = 420;
    rowWidth = this.width * 0.9;
    rowHeight = 170;
    padding = 20;
    headerTextSize = 35;
    itemTextSize = 16;
    iconSize = 180;

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

        if (!this.rootWidget) {
            this.rootWidget = this.CreateBaseUI() as mod.UIWidget;
        }

        // Start with auto gadget/throwable assigned, weapon slots unselected
        this._PlayerProfile.chosenLoadoutThisRound = this.BuildCurrentLoadout(false);

        // Build the option cards for the current slot
        this.BuildLoadoutCards();

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
        if (this.rootWidget) {
            mod.SetUIWidgetVisible(this.rootWidget, false);
            mod.EnableUIInputMode(false, this._PlayerProfile.player);
            this.isOpen = false;
        }
    }

    Delete() {
        if (this.rootWidget) {
            mod.DeleteUIWidget(this.rootWidget);
            this.rootWidget = undefined;
            this.isOpen = false;
        }
        const i = LoadoutSelectionMenu.instances.indexOf(this);
        if (i !== -1) LoadoutSelectionMenu.instances.splice(i, 1);
    }

    SelectOption(index: number) {
        if (!this.loadoutOptions) return;
        const slot = this.slotOrder[this.currentSlotIndex];
        const options = this.GetOptionsForSlot(slot);
        const selected = options[index];
        if (!selected) return;

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
        if (!this.loadoutOptions) return;
        if (!this.hasConfirmedLoadout) {
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

        const sidearm = this.selectedSlots.get(InventorySlot.Sidearm) || (includeDefaults ? this.loadoutOptions.sidearmOptions[0] : undefined);
        const primary = this.selectedSlots.get(InventorySlot.Primary) || (includeDefaults ? this.loadoutOptions.primaryOptions[0] : undefined);
        const lms = this.selectedSlots.get(InventorySlot.LMS) || (includeDefaults ? this.loadoutOptions.lmsOptions[0] : undefined);

        if (sidearm) items.push(sidearm);
        if (this.loadoutOptions.gadget) items.push(this.loadoutOptions.gadget);
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

        const revealItems: Array<{ widget: mod.UIWidget; button: mod.UIWidget; item: EquippedItem }> = [];

        for (let i = 0; i < options.length; i++) {
            const item = options[i];
            const xOffset = startX + i * (cardWidth + this.padding);
            const cardHeight = this.rowHeight;
            const card = this.CreateOptionCard(i, item, xOffset, cardWidth, cardHeight);
            if (card?.cardWidget && card?.buttonWidget) {
                mod.SetUIWidgetVisible(card.cardWidget, false);
                mod.SetUIWidgetVisible(card.buttonWidget, false);
                revealItems.push({ widget: card.cardWidget, button: card.buttonWidget, item });
            }
        }

        this.revealToken++;
        this.RevealCardsSequentially(revealItems, this.revealToken);
    }

    private async RevealCardsSequentially(
        cards: Array<{ widget: mod.UIWidget; button: mod.UIWidget; item: EquippedItem }>,
        token: number
    ) {
        for (const card of cards) {
            if (token !== this.revealToken) return;
            const isLegendary = (card.item.rarity ?? 0) >= 90;
            const revealDelay = isLegendary ? 1.3 : 0.9;
            await mod.Wait(revealDelay);
            this.PlayRevealSfxForRarity(card.item.rarity);
            mod.SetUIWidgetVisible(card.widget, true);
            mod.SetUIWidgetVisible(card.button, true);
        }
    }

    private PlayRevealSfxForRarity(rarity?: number) {
        if (rarity === undefined) return;
        const sfx = rarity >= RARITY_LEGENDARY_THRESHOLD ? SFX_LOADOUT_REVEAL_LEGENDARY : rarity >=
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

        const cardYOffset = 15; // vertical offset applied to card and button widgets
        const cardName = `loadout_card_option_${index}_${this._PlayerProfile.playerID}`;
        const buttonPos = mod.CreateVector(xOffset, cardYOffset, 0);
        const buttonSize = mod.CreateVector(cardWidth, cardHeight, 0);

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
            mod.SetUIWidgetBgColor(cardButton, UI.battlefieldGreyBg);
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

        // individual item/card container, controls bgColor
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

        });

        if (itemContainer) {
            const iconSize = Math.max(this.iconSize - iconPadding, Math.min(cardWidth, cardHeight) - iconPadding);
            const iconSizeWep = item.inventorySlot === InventorySlot.Sidearm ? iconSize : iconSize * 1.4;
            const cellWidth = cardWidth;
            const cellHeight = cardHeight;
            const rarityKey = item.rarity !== undefined
                ? (item.rarity >= RARITY_LEGENDARY_THRESHOLD ? mod.stringkeys.rarity_legendary : item.rarity >= RARITY_RARE_THRESHOLD ? mod.stringkeys.rarity_rare : undefined)
                : undefined;
            const rarityColor = item.rarity !== undefined && item.rarity >= RARITY_LEGENDARY_THRESHOLD
                ? UI.battlefieldYellow
                : UI.allyBlue;
            const rarityBg = item.rarity !== undefined && item.rarity >= RARITY_LEGENDARY_THRESHOLD
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
        }

        this.optionWidgets.push(cardWidget);

        return { cardWidget, buttonWidget: cardButton };
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
    isInfectedTeam: boolean = false;
    invehicle: boolean = false;
    isLastManStanding: boolean = false;
    isInitialSpawn: boolean = false;
    isFinalFive: boolean = false;
    lmsReloadLoopActive: boolean = false;
    youInfectedWidget?: mod.UIWidget;
    infectedByWidget?: mod.UIWidget;
    infectedNightOverlay?: mod.UIWidget;
    playerAreaNotificationWidget?: mod.UIWidget;
    showSurvivorRoadWarning: boolean = false;
    playerAreaHintIndex: number = 0;
    nextPlayerAreaHintRotationAt: number = 0;
    loadoutDisplayBottom?: LoadoutDisplayBottomView;
    lmsBuffWidgets: mod.UIWidget[] = [];
    alphaBuffWidgets: mod.UIWidget[] = [];
    chosenAsAlphaInfectedWidget: mod.UIWidget[] = [];
    playerAmmoFeedbackWidget: mod.UIWidget[] = [];
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

        if (!mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
            // player-specific UI are created here, hidden by default, and have their own toggle method
            this.scoreboardUI = new ScoreboardUI(this);
            this.loadoutDisplayBottom = new LoadoutDisplayBottomView(this);
            this.loadoutSelectionUI = new LoadoutSelectionMenu(this);
            this.youInfectedWidget = UI.CreateYouInfectedAlert(this);
            this.infectedByWidget = UI.CreateInfectedByAlert(this);
            this.infectedNightOverlay = UI.CreateInfectedNightOverlay(this);
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

        if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
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
            // create new PlayerProfile if one doesn't exist
            if (!playerProfile) {
                playerProfile = new PlayerProfile(player);
                // AI specific flags
                if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
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
            if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
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

        if (GameHandler.gameState === GameState.GameRoundIsRunning) {
            playerProfile.scoreboardUI?.Show();
            playerProfile.loadoutDisplayBottom?.Show();
        } else {
            playerProfile.loadoutDisplayBottom?.Hide();
        }
        if (!playerProfile.isInfectedTeam) {
            mod.EnableScreenEffect(player, mod.ScreenEffects.Stealth, false);
            playerProfile.gameCountdownUI?.Close();
        }

        if (playerProfile.isInfectedTeam) {
            InitializePlayerEquipment(player, playerProfile);
            mod.EnableScreenEffect(player, mod.ScreenEffects.Stealth, true);
            if (playerProfile.isAlphaInfected) {
                ShowAlphaInfectedIndicator(player);
            }
        }

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
        if (!mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier) && playerProfile.isInitialSpawn) {
            if (teamName === TeamNameString.Infected && !playerProfile.isInfectedTeam) {
                playerProfile.isInfectedTeam = true;
                GameHandler.infectedCount = Math.min(INFECTED_COUNT_LIMIT, (GameHandler.infectedCount ?? 0) + 1);
                console.log(`CustomOnPlayerDeployed | Initial infected human -> infectedCount: ${GameHandler.infectedCount}`);
                GameHandler.RebuildPlayerLists();
            }
            ScoreboardUI.GlobalUpdate(TeamNameString.Both);
        }
        playerProfile.UpdateInfectedNightOverlay();
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
            this.UpdateInfectedNightOverlay(true);
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

    UpdateInfectedNightOverlay(forceShow?: boolean) {
        if (!this.infectedNightOverlay || this.isAI) return;
        const shouldShow = forceShow !== undefined ? forceShow : this.isInfectedTeam;
        mod.EnableScreenEffect(this.player, mod.ScreenEffects.Stealth, shouldShow);
        mod.SetUIWidgetVisible(this.infectedNightOverlay, shouldShow);
        mod.SetUIWidgetDepth(this.infectedNightOverlay, mod.UIDepth.AboveGameUI);
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

        const buffMessages = GetAlphaInfectedBuffMessages();
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
        const leapAvailable = IsLeapAttackAvailableNow();

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
                    GetAlphaInfectedHintMessage(this.playerAreaHintIndex),
                );
                this.nextPlayerAreaHintRotationAt = now + INFECTED_HINT_ROTATION_SECONDS;
            } else if (now >= this.nextPlayerAreaHintRotationAt) {
                this.playerAreaHintIndex = (this.playerAreaHintIndex + 1) % GetAlphaInfectedHintKeysForCurrentRound().length;
                this.nextPlayerAreaHintRotationAt = now + INFECTED_HINT_ROTATION_SECONDS;
            }
            if (this.playerAreaNotificationWidget) {
                UI.UpdatePlayerAreaNotification(
                    this,
                    GetAlphaInfectedHintMessage(this.playerAreaHintIndex),
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
                GetInfectedHintMessage(this.playerAreaHintIndex),
            );
            this.nextPlayerAreaHintRotationAt = now + INFECTED_HINT_ROTATION_SECONDS;
        } else if (now >= this.nextPlayerAreaHintRotationAt) {
            this.playerAreaHintIndex = (this.playerAreaHintIndex + 1) % GetInfectedHintKeysForCurrentRound().length;
            this.nextPlayerAreaHintRotationAt = now + INFECTED_HINT_ROTATION_SECONDS;
        }
        if (this.playerAreaNotificationWidget) {
            UI.UpdatePlayerAreaNotification(
                this,
                GetInfectedHintMessage(this.playerAreaHintIndex),
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
            this.infectedNightOverlay,
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
                if (this.infectedNightOverlay) {
                    mod.DeleteUIWidget(this.infectedNightOverlay);
                    this.infectedNightOverlay = undefined;
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
        { id: 501, object: mod.RuntimeSpawn_Common.FX_Granite_Strike_Smoke_Marker_Red },
        { id: 1502, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_Black_L },
        { id: 1503, object: mod.RuntimeSpawn_Common.FX_CivCar_Tire_fire_S_GS },
        { id: 1501, object: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Column_XXL },
        { id: 1206, object: mod.RuntimeSpawn_Common.FX_Building_FallingDustSand },
        { id: 1504, object: mod.RuntimeSpawn_Common.FX_Snow_BlowingSnow_S_01_inShadow },
    ];

    static sand2_Sfx = [
        { id: 2501, attenuation: 40, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_MP_Abbasid_Spots_Birds_Palace_SimpleLoop3D },
        { id: 2503, attenuation: 5, object: mod.RuntimeSpawn_Common.SFX_Destruction_Fuse_Loop_GasFire_SimpleLoop3D },
        { id: 2504, attenuation: 4, object: mod.RuntimeSpawn_Common.SFX_Levels_Brooklyn_Shared_Spots_GarbageFlies_SimpleLoop3D },
        { id: 2505, attenuation: 25, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_MP_Outskirts_Spots_Wind_HowlingWarm_SimpleLoop3D },
        { id: 2506, attenuation: 40, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_SP_NightRaid_Spots_HighwayUnderneath_SimpleLoop3D },
        { id: 2507, attenuation: 40, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_SP_NightRaid_Spots_HighwayUnderneath_SimpleLoop3D },
        { id: 2508, attenuation: 40, object: mod.RuntimeSpawn_Common.SFX_Levels_Cairo_SP_NightRaid_Spots_HighwayUnderneath_SimpleLoop3D },
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
                mod.EnableVFX(mod.GetVFX(vfxEntry.id), true);
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
            total++;
            if (!mod.GetSoldierState(p, mod.SoldierStateBool.IsAISoldier)) humans++;
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

                if (allSelected && this.countdownTimeRemaining > 5) {
                    this.countdownTimeRemaining = 5;
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
            mod.PlayVO(VOSounds, mod.VoiceOverEvents2D.RoundStartGeneric, mod.VoiceOverFlags.Alpha, SURVIVOR_TEAM);
            mod.PlayVO(VOSounds, mod.VoiceOverEvents2D.RoundStartGeneric, mod.VoiceOverFlags.Bravo, INFECTED_TEAM);
            // mod.PlayMusic(mod.MusicEvents.Core_PhaseBegin, SURVIVOR_TEAM);
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
                mod.EndGameMode(SURVIVOR_TEAM);
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
                    if (!mod.GetSoldierState(lastManStanding, mod.SoldierStateBool.IsAISoldier)) {
                        StartLastManStandingReloadLoop(lmsProfile);
                    }
                }
            } else if (GameHandler.survivorsCount === 5 && GameHandler.gameState === GameState.GameRoundIsRunning) {
                // flags final five survivors, runs loadout initialization
                const finalFiveMessage = MakeMessage(mod.stringkeys.final_five);
                GameHandler.DisplayGameStateNotification(finalFiveMessage);
                Helpers.PlaySoundFX(SFX_FINAL_FIVE, 1);
                if (CURRENT_MAP === MapNames.SAND2 && !GameHandler.vehicleSpawnedThisRound) {
                    GameHandler.vehicleSpawnedThisRound = true;
                    GameHandler.SpawnVehicle();
                }
                mod.PlayVO(VOSounds, mod.VoiceOverEvents2D.ProgressMidLosing, mod.VoiceOverFlags.Alpha, SURVIVOR_TEAM);
                mod.PlayVO(VOSounds, mod.VoiceOverEvents2D.PlayerCountEnemyLow, mod.VoiceOverFlags.Echo, INFECTED_TEAM);
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
                mod.EndGameMode(SURVIVOR_TEAM);
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
            playerProfile && playerProfile.UpdateInfectedNightOverlay(false);
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
                        if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
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
                    try {
                        if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
                            mod.AIIdleBehavior(player);
                        }
                    } catch { }
                    try { mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, false); } catch { }
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
            const isBot = mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier);
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
            if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) mod.DeployPlayer(player);
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
            if (PlayerIsAliveAndValid(player) && mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
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
        // GameHandler.StopLastManStandingMusic();

        ScoreboardUI.GlobalUpdate(TeamNameString.Both);
        GameHandler.RestrictAllInputsAllPlayers(true);

        PlayerProfile._allPlayerProfiles.forEach((pp) => {
            if (mod.IsPlayerValid(pp.player)) {
                if (!pp.isInfectedTeam && !mod.GetSoldierState(pp.player, mod.SoldierStateBool.IsAISoldier)) {
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
        GameHandler.vehicleSpawnedThisRound = false;
        LEAP_ATTACK_UNLOCKED_THIS_ROUND = false;

        GameHandler.isSpawnCheckRunning = false;
        GameHandler.currentRound++;
        GameHandler.roundTimeRemaining = ROUND_DURATION;

        // If any human survivors remain alive and deployed, refresh their equipment to match the new round
        try {
            const survivorsAlive = GameHandler.GetAllPlayersOnTeam(SURVIVOR_TEAM)
                .filter(p => mod.IsPlayerValid(p)
                    && mod.GetSoldierState(p, mod.SoldierStateBool.IsAlive)
                    && !mod.GetSoldierState(p, mod.SoldierStateBool.IsAISoldier));
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
                    } else if (playerProfile.loadoutSelectionUI) {
                        playerProfile.loadoutSelectionUI.Show(options);
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
            if (CURRENT_MAP === MapNames.SAND2) {
                GameHandler.vehicleSpawnedThisRound = true;
                GameHandler.SpawnVehicle();
            }
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
                if (GameHandler.roundTimeRemaining === 60) {
                    mod.PlayVO(VOSounds, mod.VoiceOverEvents2D.Time60Left, mod.VoiceOverFlags.Alpha, SURVIVOR_TEAM);
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
    lastSwingAt?: number;       // timestamp of last explicit melee ForceFire
    moveFailCount?: number;     // increments on move-fail callbacks; reset on respawn
    moveFailHoldUntil?: number; // suppresses chase tick while failure recovery is active
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
        this.tick = { lastMoveIssuedAt: 0, nextTickAt: 0, behavior: 'idle' };
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
        this.tick.behavior = 'spawned';
        this.tick.nextTickAt = (Date.now() / 1000) + AI_BOT_TICK_SECONDS * 2;
        InfectedBotSlot.byObjID.set(playerObjID, this);
        console.log(`InfectedBotSlot[${this.slotIndex}] | Spawned Player(${playerObjID}) on spawner(${spawnerObjID}) state=${this.state} alpha=${this.isAlpha}`);

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

        mod.AIIdleBehavior(player);
        // Keep combat toggles centralized at spawn-time init only.
        try { mod.AIEnableShooting(player, false); } catch { }
        try { mod.AIEnableTargeting(player, false); } catch { }
        try { mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, true); } catch { }
1
        // Increment the spawn token so any still-pending async block from a prior spawn of
        // this slot detects it is stale and aborts, preventing double-initialization races.
        this.spawnToken++;
        const token = this.spawnToken;

        (async () => {
            await mod.Wait(0.5);
            // stripping all the extra AI flags here and just using per-tick logic. 
            // might be causing problems sending too many commands at once
            if (this.spawnToken !== token || !PlayerIsAliveAndValid(player)) return;
            mod.SetPlayerMaxHealth(player, this.isAlpha ? 300 : 50);
            if (this.isParachuteSpawner) {
                // Parachute drop: let the bot glide in before switching to normal pursuit behavior.
                mod.AIParachuteBehavior(player);
                await mod.Wait(5);
                if (this.spawnToken !== token || !PlayerIsAliveAndValid(player)) return;
            }
            // mod.AISetMoveSpeed(player, this.isAlpha ? mod.MoveSpeed.Sprint : mod.MoveSpeed.Run);
            await AISpawnHandler.AssignAIEquipment(player, TeamNameString.Infected);
            if (this.spawnToken !== token || !PlayerIsAliveAndValid(player)) return;
            ShowAlphaInfectedIndicator(player);
            if (this.isAlpha) {
                InitLeapSystem(player);
            }
        })();
        GameHandler.RebuildPlayerLists();
    }

    HandleDeath(): void {
        const prevObjID = this.playerObjID;
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
        // could setting this on the spawnerobj every time a bot spawns, be the cause of bot decay issues?
        // mod.SetUnspawnDelayInSeconds(spawnerObj, 2);
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
            // const errorText = String(e);
            // if (errorText.includes('NoWeaponOnSlot')) {
            //     return;
            // }
            console.log(`AssignAIEquipment | RemoveEquipment failed for Player(${mod.GetObjId(player)}) slot(${slot}) error: ${e}`);
        }
    }

    static async AssignAIEquipment(player: mod.Player, teamString: string): Promise<void> {
        if (!PlayerIsAliveAndValid(player)) return;
        AISpawnHandler.RemoveEquipmentSafe(player, mod.InventorySlots.PrimaryWeapon);
        AISpawnHandler.RemoveEquipmentSafe(player, mod.InventorySlots.SecondaryWeapon);
        AISpawnHandler.RemoveEquipmentSafe(player, mod.InventorySlots.GadgetOne);
        AISpawnHandler.RemoveEquipmentSafe(player, mod.InventorySlots.GadgetTwo);
        AISpawnHandler.RemoveEquipmentSafe(player, mod.InventorySlots.ClassGadget);
        AISpawnHandler.RemoveEquipmentSafe(player, mod.InventorySlots.Throwable);
        const playerProfile = PlayerProfile.Get(player);
        if (playerProfile) {
            playerProfile.isInfectedTeam = teamString === TeamNameString.Infected;
            await InitializePlayerEquipment(player, playerProfile);
            if (playerProfile.isInfectedTeam && PlayerIsAliveAndValid(player)) {
                if (BOT_SURVIVAL_TEST_MODE && BOT_SURVIVAL_TEST_DISABLE_ATTACKS) {
                    try { mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, true); } catch { }
                    return;
                }
                try {
                    mod.ForceSwitchInventory(player, mod.InventorySlots.MeleeWeapon);
                } catch { }
            }
        }
    }

    static async OnBotSpawnFromSpawner(eventPlayer: mod.Player, spawnerObjID: number): Promise<void> {
        if (!PlayerIsAliveAndValid(eventPlayer)) return;
        if (!mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier) ||
            GameHandler.gameState === GameState.EndOfRound) {
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
    if (!eventPlayer || !mod.IsPlayerValid(eventPlayer)) return false;
    return mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAlive);
}


/** Returns the closest alive survivor to `bot`. If none found, returned player will be invalid*/
function pickClosestAliveSurvivorFor(bot: mod.Player): mod.Player | undefined {
    const botPos = mod.GetSoldierState(bot, mod.SoldierStateVector.GetPosition);
    const closestSurvivor = mod.ClosestPlayerTo(botPos, SURVIVOR_TEAM);
    return closestSurvivor;
}

/** Trigger the charge-leap for an alpha infected bot. Manages its own async flow; the tick is skipped while leaping. */
async function TriggerAIChargeLeap(slot: InfectedBotSlot, bot: mod.Player): Promise<void> {
    if (!IsLeapAttackAvailableNow()) return;
    if (slot.tick.leapInProgress) return;
    slot.tick.leapInProgress = true;
    try {
        mod.AISetStance(bot, mod.Stance.Crouch);
        await mod.Wait(LEAP_CROUCH_HOLD_SECONDS + 0.15);
        if (!PlayerIsAliveAndValid(bot)) return;
        mod.AIForceFire(bot, 1.5);
        await mod.Wait(2.5); // allow leap flight and landing to complete
    } finally {
        slot.tick.leapInProgress = false;
        if (PlayerIsAliveAndValid(bot)) {
            mod.AISetStance(bot, mod.Stance.Stand);
        }
    }
}

/**
 * Tick the chase/attack AI for one infected bot slot.
 * When the target is in a vehicle that vehicle is tracked directly as the movement destination
 * and attacking is disabled until the bot is within AI_VEHICLE_MELEE_DISTANCE, allowing a
 * full-speed sprint approach. Alpha bots trigger a leap attack when outside melee range.
 */
function InfectedBotLogicTick(slot: InfectedBotSlot): void {
    const infectedBot = slot.player!;

    if (GameHandler.gameState !== GameState.GameRoundIsRunning) return;
    if (!PlayerIsAliveAndValid(infectedBot)) return;

    // Hold off the chase tick while move-fail recovery is active.
    const now = Date.now() / 1000;
    if (slot.tick.moveFailHoldUntil && now < slot.tick.moveFailHoldUntil) {
        slot.tick.behavior = 'recovering_move_fail';
        UpdateBotTargetWorldIcon(slot);
        return;
    }

    const tick = slot.tick;
    const disableAttacks = BOT_SURVIVAL_TEST_MODE && BOT_SURVIVAL_TEST_DISABLE_ATTACKS;
    mod.EnableInputRestriction(infectedBot, mod.RestrictedInputs.FireWeapon, true);
    // Re-evaluate target each tick
    let target = tick.target;
    if (!target || !PlayerIsAliveAndValid(target)) {
        target = pickClosestAliveSurvivorFor(infectedBot);
        tick.target = target;
        tick.lastMoveIssuedAt = 0;
        tick.lastMovePos = undefined;
        tick.trackedVehicle = undefined;
    } else {
        const closest = pickClosestAliveSurvivorFor(infectedBot);
        if (closest && mod.GetObjId(closest) !== mod.GetObjId(target)) {
            target = closest;
            tick.target = target;
            tick.lastMoveIssuedAt = 0;
            tick.lastMovePos = undefined;
            tick.trackedVehicle = undefined;
        }
    }

    if (!target) {
        const botProfile = PlayerProfile.Get(infectedBot);
        if (botProfile) {
            botProfile.currentTarget = undefined;
        }
        mod.AIIdleBehavior(infectedBot);
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

    const targetInVehicle = mod.GetSoldierState(target, mod.SoldierStateBool.IsInVehicle);
    const infectedBotPos = mod.GetSoldierState(infectedBot, mod.SoldierStateVector.GetPosition);

    // Always sprint never slow down. Slowing for a melee swing causes the bot to
    // fall behind a moving target, and it may then attempt to attack out of weapon range.
    mod.AISetMoveSpeed(infectedBot, mod.MoveSpeed.Sprint);

    // --- Vehicle chase path ---
    if (targetInVehicle) {
        // Acquire or re-use the tracked vehicle reference
        if (!tick.trackedVehicle) {
            const v = mod.GetVehicleFromPlayer(target);
            if (v) tick.trackedVehicle = v;
        }

        const veh = tick.trackedVehicle;
        if (veh) {
            const vehiclePos = mod.GetVehicleState(veh, mod.VehicleStateVector.VehiclePosition);
            const dist = mod.DistanceBetween(infectedBotPos, vehiclePos);

            // Reissue move every tick the vehicle's position changes every frame and
            // a stale destination causes the bot to run to where the vehicle was.
            const timeSinceLastMove = now - tick.lastMoveIssuedAt;
            if (timeSinceLastMove >= AI_VEHICLE_MOVE_REISSUE_SECONDS || !tick.lastMovePos) {
                mod.AIMoveToBehavior(infectedBot, vehiclePos);
                tick.lastMoveIssuedAt = now;
                tick.lastMovePos = vehiclePos;
            }

            if (dist <= AI_VEHICLE_MELEE_DISTANCE) {
                // Use explicit ForceFire with a cooldown instead of always-on targeting.
                // Auto-targeting in melee range triggers animations that lock the bot in place;
                // if the vehicle then accelerates away the engine kills the bot mid-animation.
                const timeSinceSwing = now - (tick.lastSwingAt ?? 0);
                if (!disableAttacks && timeSinceSwing >= AI_MELEE_SWING_COOLDOWN_SECONDS) {
                    mod.AIForceFire(infectedBot, 0.1);
                    tick.lastSwingAt = now;
                    tick.behavior = 'vehicle_melee_attack_window';
                } else {
                    tick.behavior = disableAttacks ? 'vehicle_melee_no_attack' : 'vehicle_melee_cooldown';
                }
            } else {
                // Outside melee range: keep all attacking disabled, focus on chasing.
                if (slot.isAlpha && !disableAttacks && IsLeapAttackAvailableNow()) {
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
        tick.trackedVehicle = undefined;
    } else {
        // Target dismounted; discard stale vehicle reference
        tick.trackedVehicle = undefined;
    }

    // --- Normal (on-foot) path ---
    const targetPos = mod.GetSoldierState(target, mod.SoldierStateVector.GetPosition);
    const dist = mod.DistanceBetween(infectedBotPos, targetPos);

    if (dist <= AI_INFECTED_MELEE_DISTANCE) {
        // Issue move very frequently when in melee range so the bot tracks
        // target movement between ticks rather than chasing a stale position.
        const timeSinceLastMove = now - tick.lastMoveIssuedAt;
        if (timeSinceLastMove >= AI_MELEE_CLOSE_REISSUE_SECONDS || !tick.lastMovePos) {
            mod.AILOSMoveToBehavior(infectedBot, targetPos);
            tick.lastMoveIssuedAt = now;
            tick.lastMovePos = targetPos;
        }
        // Use explicit ForceFire with cooldown instead of always-on targeting.
        // Always-on targeting in melee range can trigger a Takedown animation that locks
        // the bot; if the target then moves the engine kills the bot mid-animation.
        // The backstab check still guards the rear hemisphere.
        const targetFacing = mod.GetSoldierState(target, mod.SoldierStateVector.GetFacingDirection);
        const dirToBot = mod.Normalize(mod.Subtract(infectedBotPos, targetPos));
        const behindDot = mod.DotProduct(targetFacing, dirToBot);
        const allowAttacking = behindDot >= AI_MELEE_BACKSTAB_DOT_THRESHOLD;
        const timeSinceSwing = now - (tick.lastSwingAt ?? 0);
        if (!disableAttacks && allowAttacking && timeSinceSwing >= AI_MELEE_SWING_COOLDOWN_SECONDS) {
            // mod.AIForceFire(infectedBot, 0.1);
            mod.EnableInputRestriction(infectedBot, mod.RestrictedInputs.FireWeapon, false);
            tick.lastSwingAt = now;
            tick.behavior = 'melee_attack_window';
        } else {
            if (disableAttacks) {
                tick.behavior = 'melee_no_attack';
            } else if (!allowAttacking) {
                tick.behavior = 'melee_backstab_blocked';
            } else {
                tick.behavior = 'melee_cooldown';
            }
        }
    } else {
        // Outside melee range: sprint with attacking fully disabled.
        // Keeping attacks off during the approach prevents mid-sprint melee animations
        // that interrupt momentum and expose the bot to a stale-target kill.
        const timeSinceLastMove = now - tick.lastMoveIssuedAt;
        if (timeSinceLastMove >= AI_DEFAULT_MOVE_REISSUE_SECONDS || !tick.lastMovePos) {
            mod.AIMoveToBehavior(infectedBot, targetPos);
            mod.EnableInputRestriction(infectedBot, mod.RestrictedInputs.FireWeapon, true);
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
        if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) continue;

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
            if (DEBUG_SHOW_ALL_UI_ELEMENTS){
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
    mod.PlayVO(VOSounds, mod.VoiceOverEvents2D.RoundSuddenDeath, mod.VoiceOverFlags.Alpha, player);

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
            }
        } else if (item.inventorySlot === InventorySlot.Gadget || item.inventorySlot === InventorySlot.GadgetSecondary) {
            // skip ladder for infected bots to avoid them getting stuck trying to use it
            if (!item.gadget || (isAI && item.gadget === mod.Gadgets.Misc_Assault_Ladder)) {
                continue;
            }
            if (item.gadget === mod.Gadgets.Misc_Assault_Ladder)
                await mod.Wait(1); // delay to avoid ladder being selected over sledgehammer
            mod.AddEquipment(eventPlayer, item.gadget as mod.Gadgets);
        }
    }

    // conditional stats for humans
    if (!isAI) {
        if (isInfected) {
            mod.SetPlayerMovementSpeedMultiplier(eventPlayer, playerProfile.isAlphaInfected ? 1.1 : 1);
            mod.SetPlayerIncomingDamageFactor(eventPlayer, playerProfile.isAlphaInfected ? 0.7 : 0.9);
            mod.SetPlayerMaxHealth(eventPlayer, playerProfile.isAlphaInfected ? 300 : 150);
        } else {
            mod.SetPlayerMovementSpeedMultiplier(eventPlayer, 1);
            mod.SetPlayerIncomingDamageFactor(eventPlayer, playerProfile.isLastManStanding ? 0.5 : 1);
            mod.SetPlayerMaxHealth(eventPlayer, playerProfile.isLastManStanding ? 200 : 60);
        }
    }
}

// Refresh human player equipment to match the current round rules.
function RefreshHumanEquipment(eventPlayer: mod.Player, playerProfile: PlayerProfile) {
    if (!PlayerIsAliveAndValid(eventPlayer) || mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)) return;
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
                !mod.GetSoldierState(pp.player, mod.SoldierStateBool.IsAISoldier)) {
                await pp.ConvertHumanSurvivorToInfected(pp.player);
                return;
            }
            // otherwise (bot or already infected), just kill to force infected respawn logic
            if (mod.GetSoldierState(pp.player, mod.SoldierStateBool.IsAISoldier)) {
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
            !mod.GetSoldierState(pp.player, mod.SoldierStateBool.IsAISoldier)) {
            await pp.ConvertHumanSurvivorToInfected(pp.player);
            continue;
        }

        // For AI (or already infected), force respawn as infected
        if (mod.GetSoldierState(pp.player, mod.SoldierStateBool.IsAISoldier)) {
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
    EnsureLastManStandingWorldIcon(player);
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
    const illumVerticalOffset = 1;
    const forwardOffset = -0.3;
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
    // const alphaIndicatorIllumVFX = mod.SpawnObject(ALPH_INDICATOR_BLINKING_FIRE_VFX, flamePos, ZERO_VEC);
    // mod.EnableVFX(alphaIndicatorIllumVFX, true);
    mod.EnableVFX(alphaIndicatorFlameVFX, true);
    // can only modify the custom smoke marker vfx, nothing else will work
    // mod.SetVFXScale(alphaIndicatorFlameVFX, 2);
    // mod.SetVFXColor(alphaIndicatorFlameVFX, UI.battlefieldBlue); // meh? 
    // mod.SetVFXColor(alphaIndicatorIllumVFX, UI.battlefieldBlue); // nah these don't work >:c
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
                playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
                facingDir = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);
                flamePos = mod.CreateVector(
                    mod.XComponentOf(playerPos) + (mod.XComponentOf(facingDir) * forwardOffset),
                    mod.YComponentOf(playerPos) + verticalOffset + (mod.YComponentOf(facingDir) * forwardOffset),
                    mod.ZComponentOf(playerPos) + (mod.ZComponentOf(facingDir) * forwardOffset)
                );
                // illumPos = mod.CreateVector(
                //     mod.XComponentOf(playerPos),
                //     mod.YComponentOf(playerPos) + illumVerticalOffset,
                //     mod.ZComponentOf(playerPos)
                // )
                mod.MoveVFX(alphaIndicatorFlameVFX, flamePos, ZERO_VEC);
                // mod.MoveVFX(alphaIndicatorIllumVFX, illumPos, ZERO_VEC);
                await mod.Wait(0.05);
            }
        } finally {
            const trackedToken = ALPHA_INDICATOR_TOKENS.get(playerObjId);
            if (trackedToken === token) {
                ALPHA_INDICATOR_TOKENS.delete(playerObjId);
            }
            mod.EnableVFX(alphaIndicatorFlameVFX, false);
            // mod.EnableVFX(alphaIndicatorIllumVFX, false);
            mod.UnspawnObject(alphaIndicatorFlameVFX);
            // mod.UnspawnObject(alphaIndicatorIllumVFX);
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
    if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) return undefined;

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
    if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) return;

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

function IsBotActivelyMovingToTarget(behavior?: string): boolean {
    switch (behavior) {
        case 'vehicle_chase_leap':
        case 'vehicle_chase':
        case 'vehicle_melee_attack_window':
        case 'vehicle_melee_no_attack':
        case 'vehicle_melee_cooldown':
        case 'melee_attack_window':
        case 'melee_no_attack':
        case 'melee_backstab_blocked':
        case 'melee_cooldown':
        case 'chase':
            return true;
        default:
            return false;
    }
}

function UpdateBotTargetWorldIcon(slot: InfectedBotSlot) {
    if (!BOT_SURVIVAL_TEST_MODE) return;
    const bot = slot.player;
    const botObjId = slot.playerObjID;
    if (!bot || botObjId === undefined || botObjId < 0 || !PlayerIsAliveAndValid(bot)) {
        if (botObjId !== undefined && botObjId >= 0) {
            CleanupBotTargetWorldIcon(botObjId, 'UpdateBotTargetWorldIcon.invalid_bot');
        }
        return;
    }

    if (IsBotActivelyMovingToTarget(slot.tick.behavior)) {
        CleanupBotTargetWorldIcon(botObjId, 'UpdateBotTargetWorldIcon.active_chase');
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

    mod.SetWorldIconPosition(icon, botPos);
    mod.SetWorldIconText(icon, MakeMessage(slot.name));
    mod.EnableWorldIconText(icon, true);
    mod.EnableWorldIconImage(icon, true);
}

function EnsureLastManStandingWorldIcon(player: mod.Player) {
    const lmsPlayerObjId = mod.GetObjId(player);
    if (lmsPlayerObjId < 0) return;

    const playerProfile = PlayerProfile.Get(player);
    const shouldShow = !!playerProfile
        && playerProfile.isLastManStanding
        && GameHandler.gameState === GameState.GameRoundIsRunning
        && SafeIsAlive(player)
        && mod.GetObjId(mod.GetTeam(player)) === mod.GetObjId(SURVIVOR_TEAM);

    if (!shouldShow) {
        CleanupWorldIcon(LMS_WORLD_ICON_OBJECTS, lmsPlayerObjId, 'EnsureLastManStandingWorldIcon');
        return;
    }

    if (LMS_WORLD_ICON_OBJECTS.has(lmsPlayerObjId)) return;

    const icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, GetIconPosition(player), ZERO_VEC);
    mod.SetWorldIconOwner(icon, INFECTED_TEAM);
    mod.SetWorldIconImage(icon, mod.WorldIconImages.Skull);
    mod.SetWorldIconColor(icon, UI.battlefieldWhite);
    mod.EnableWorldIconImage(icon, true);
    LMS_WORLD_ICON_OBJECTS.set(lmsPlayerObjId, icon);
    console.log(`EnsureLastManStandingWorldIcon | Showing LMS icon for Player(${lmsPlayerObjId})`);
}

function UpdatePlayerIndicatorsAndIcons(player: mod.Player) {
    const playerObjId = mod.GetObjId(player);
    if (playerObjId < 0) return;

    EnsureLastManStandingWorldIcon(player);
    ShowAlphaInfectedIndicator(player);

    const infectedIcon = INFECTED_WORLD_ICON_OBJECTS.get(playerObjId);
    if (infectedIcon) {
        mod.SetWorldIconPosition(infectedIcon, GetIconPosition(player));
    }

    const lmsIcon = LMS_WORLD_ICON_OBJECTS.get(playerObjId);
    if (lmsIcon) {
        mod.SetWorldIconPosition(lmsIcon, GetIconPosition(player));
    }

}

function CleanupPlayerOngoingVisuals(playerObjId: number) {
    CleanupWorldIcon(INFECTED_WORLD_ICON_OBJECTS, playerObjId, 'CleanupPlayerOngoingVisuals');
    CleanupWorldIcon(LMS_WORLD_ICON_OBJECTS, playerObjId, 'CleanupPlayerOngoingVisuals');
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
            if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) continue;

            const playerProfile = PlayerProfile.Get(player);
            if (playerProfile) {
                playerProfile.isInfectedTeam = false;
                playerProfile.isAlphaInfected = false;
                playerProfile.isLastManStanding = false;
                playerProfile.UpdateInfectedNightOverlay(false);
            }

            if (mod.GetObjId(mod.GetTeam(player)) !== mod.GetObjId(SURVIVOR_TEAM)) {
                mod.SetTeam(player, SURVIVOR_TEAM);
            }

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
            if (!mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) continue;
            if (!mod.GetSoldierState(player, mod.SoldierStateBool.IsAlive)) continue;
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
        const playerObjId = mod.GetObjId(player);
        if (playerObjId < 0) return;

        this.stopVehicleDistanceTracking();
        this.trackedHumanObjId = playerObjId;
        const loopToken = ++this.distanceLoopToken;

        (async () => {
            while (LEAP_TEST_MODE && loopToken === this.distanceLoopToken) {
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
        // OnVehicleSpawned will set SPAWNED_ACTIVE_VEHICLE; wait for it.
        await mod.Wait(1.0);
        this.activeVehicle = SPAWNED_ACTIVE_VEHICLE;
        console.log(`[LeapTest] Vehicle spawned. SPAWNED_ACTIVE_VEHICLE set: ${!!this.activeVehicle}`);

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

    /** Called from OnSpawnerSpawned when LEAP_TEST_MODE is active. */
    async onBotSpawned(player: mod.Player, spawnerObjId: number) {
        await mod.Wait(0.5);

        const isSurvivorSpawner = SURVIVOR_AI_SPAWNERS.includes(spawnerObjId);

        if (isSurvivorSpawner) {
            this.survivorBot = player;
            mod.SetPlayerMaxHealth(player, 50);
            mod.AIIdleBehavior(player);

            // Wait for vehicle, move toward it, then force seat entry.
            if (this.activeVehicle) {
                const vehiclePos = mod.GetVehicleState(this.activeVehicle, mod.VehicleStateVector.VehiclePosition);
                mod.AIMoveToBehavior(player, vehiclePos);
                await mod.Wait(0.75);

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
                    console.log('[LeapTest] Survivor bot moved to and seated in vehicle');
                } else {
                    console.log('[LeapTest] WARNING: Survivor bot could not be seated in vehicle');
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
            console.log('[LeapTest] Interact: Spawn Scenario');
            this.spawnScenario();
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
            console.log('[LeapTest] Interact: Cleanup');
            this.cleanup();
        }
    },

    /** Main entry -- replaces OnGameModeStarted flow when LEAP_TEST_MODE. */
    async start(eventPlayer?: mod.Player) {
        console.log('[LeapTest] === LEAP TEST MODE ACTIVE ===');
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

        console.log('[LeapTest] Waiting for human player deploy...');
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

/** Fake impulse distance (meters) applied to vehicles hit by leap collision logic. */
let LEAP_VEHICLE_FAKE_IMPULSE_DISTANCE = 2.0;

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
        mod.RuntimeSpawn_Common.FX_TracerDart_Projectile_Glow,
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

        // Charging-only world alert: tracked at the same cadence as preview path recalculation.
        if (state.chargeVfxState === 'charging' && !state.isLeaping) {
            const chargeIconPos = mod.Add(
                liveTrack.startPos,
                mod.Multiply(mod.UpVector(), CHARGE_ALERT_ICON_HEIGHT)
            );
            if (!state.chargeAlertIcon) {
                const iconObj = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, chargeIconPos, ZERO_VEC);
                const icon = iconObj as mod.WorldIcon;
                mod.SetWorldIconImage(icon, mod.WorldIconImages.Alert);
                mod.SetWorldIconColor(icon, mod.CreateVector(1, 0, 0));
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
                    ? mod.RuntimeSpawn_Common.FX_ThrowingKnife_Trail_Friendly
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

    const applyVehicleFakeImpulse = () => {
        if (vehicleImpulseApplied || !vehicleHitRef) return;
        vehicleImpulseApplied = true;
        try {
            const vehiclePosNow = mod.GetVehicleState(vehicleHitRef, mod.VehicleStateVector.VehiclePosition);
            const vehicleFacingDir = mod.GetVehicleState(vehicleHitRef, mod.VehicleStateVector.FacingDirection);
            const vehicleYaw = directionToYaw(vehicleFacingDir);
            const impulseDestination = mod.Add(
                vehiclePosNow,
                mod.Multiply(leapDir, LEAP_VEHICLE_FAKE_IMPULSE_DISTANCE)
            );
            mod.Teleport(vehicleHitRef, impulseDestination, vehicleYaw);
            vehicleHitPos = impulseDestination;
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
    mod.PlaySound(leapSfx, 1);
    // play localized charging SFX for player
    Helpers.PlaySoundFX(SFX_ALPHA_LEAP_2D, 1, player);
    mod.EnableVFX(trailVfx, true);
    // move VFX along with the player steps, gives trail effect under their feet
    for (let i = 0; i < travelSteps.length - 1; i++) {
        // Apply fake vehicle impulse 2 step positions before knockback when possible.
        if (i === vehicleImpulseStepIndex) {
            applyVehicleFakeImpulse();
        }
        mod.Teleport(player, travelSteps[i], yaw);
        mod.MoveVFX(trailVfx, travelSteps[i], ZERO_VEC);
        await mod.Wait(LEAP_STEP_DELAY);
    }
    // Fallback: if we couldn't apply 2 steps early, apply at collision/final-teleport moment.
    applyVehicleFakeImpulse();
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
                mod.RuntimeSpawn_Common.FX_Autocannon_30mm_AP_Hit_Metal_GS,
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
        `InitLeapSystem enter | player=${objId} map=${CURRENT_MAP ?? 'undefined'} test=${LEAP_TEST_MODE} unlocked=${LEAP_ATTACK_UNLOCKED_THIS_ROUND} teamObjId=${teamObjId} ppInfected=${profile?.isInfectedTeam} ppAlpha=${profile?.isAlphaInfected}`,
        0.2
    );
    if (objId < 0) {
        LogLeapRuntime(`init_skip_obj_${objId}`, `InitLeapSystem skip invalid ObjID | player=${objId}`, 0.2);
        return;
    }
    if (!LEAP_TEST_MODE && CURRENT_MAP !== MapNames.SAND2) {
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
    if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier) && LEAP_TEST_MODE) {
        // Wait for the survivor bot to settle into the vehicle seat.
        await mod.Wait(4);

        // Resolve the target vehicle. When the test harness spawns via the interact point
        // it passes activeVehicle directly; fall back to scanning all vehicles otherwise.
        let targetVehicle: mod.Vehicle | undefined = activeVehicle;

        // Keep leap test behavior independent from runtime targeting toggle changes.
        // mod.AISetMoveSpeed(player, mod.MoveSpeed.Walk);

        // Chase and charge-leap the vehicle driver until the seat is vacated or the AI dies.
        while (targetVehicle) {
            let MIN_LEAP_DIST = 4;
            const driver = mod.GetPlayerFromVehicleSeat(targetVehicle, 0);
            if (!driver || !mod.GetSoldierState(driver, mod.SoldierStateBool.IsAlive)) break;

            // Explicitly set the engagement target and move toward the vehicle so
            // the bot actually closes distance (without AIMoveToBehavior it just stands still).
            const vehiclePos = mod.GetVehicleState(targetVehicle, mod.VehicleStateVector.VehiclePosition);
            if (mod.DistanceBetween(mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition), vehiclePos) > MIN_LEAP_DIST) {
                mod.AISetTarget(player, driver);
                // mod.AIMoveToBehavior(player, vehiclePos);
                // Hold crouch so TickLeap accumulates charge time, then fire to trigger the leap.
                mod.AISetStance(player, mod.Stance.Crouch);
                await mod.Wait(2);
                mod.AIForceFire(player, 2);
                mod.AIIdleBehavior(player);
            }
            mod.AISetStance(player, mod.Stance.Crouch);
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

    if (!IsLeapAttackAvailableNow()) {
        LogLeapRuntime(
            `tick_gate_unavailable_${objId}`,
            `TickLeap skip unavailable | player=${objId} map=${CURRENT_MAP ?? 'undefined'} unlocked=${LEAP_ATTACK_UNLOCKED_THIS_ROUND} test=${LEAP_TEST_MODE}`
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
                const proxChargeSfx = mod.RuntimeSpawn_Common.SFX_UI_Notification_SectorBonus_ProgressBarFillingUp_OneShot2D;
                if (!state.chargingSfx) {
                    const chargeSfxObj = mod.SpawnObject(
                        proxChargeSfx,
                        playerPos, ZERO_VEC
                    );
                    mod.PlaySound(chargeSfxObj, 1, player);
                    state.chargingSfx = chargeSfxObj;
                }
            }
            // Move existing charge VFX to follow the player
            if (state.chargeVfx) {
                mod.MoveVFX(state.chargeVfx, chargeVfxPos, ZERO_VEC);
            }
        } else {
            // During the slide-protection buffer, clear charge VFX/SFX but keep hold timing alive.
            resetLeapChargeState(state, true);
        }
    } else {
        // Not crouching or currently leaping -- full reset
        resetLeapChargeState(state);
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

// building out a fallback when bots' pathing fails. Which WILL happen. Fuck.
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

        const moveFailCount = (slot.tick.moveFailCount ?? 0) + 1;
        slot.tick.moveFailCount = moveFailCount;

        if (moveFailCount === 1) {
            console.log(`OnAIMoveToFailed | Infected Bot(${mod.GetObjId(eventPlayer)}) failure #1 - battlefield behavior for ${AI_MOVE_FAILURE_RECOVERY_SECONDS}s before normal tick resumes`);
            mod.AIBattlefieldBehavior(eventPlayer);
            slot.tick.moveFailHoldUntil = Date.now() / 1000 + AI_MOVE_FAILURE_RECOVERY_SECONDS;
            return;
        }

        if (moveFailCount >= 2) {
            console.log(`OnAIMoveToFailed | Infected Bot(${mod.GetObjId(eventPlayer)}) failure #2 - repeating battlefield behavior for ${AI_MOVE_FAILURE_RECOVERY_SECONDS}s before normal tick resumes`);
            mod.AIBattlefieldBehavior(eventPlayer);
            slot.tick.moveFailHoldUntil = Date.now() / 1000 + AI_MOVE_FAILURE_RECOVERY_SECONDS;
            return;
        }
         if (moveFailCount >= 15) {
             console.log(`OnAIMoveToFailed | Infected Bot(${mod.GetObjId(eventPlayer)}) failure #${moveFailCount} - killing bot`);
             slot.tick.moveFailHoldUntil = undefined;
             mod.Kill(eventPlayer);
         }
    }
}

export async function OnSpawnerSpawned(eventPlayer: mod.Player, eventSpawner: mod.Spawner) {
    await mod.Wait(0.2);
    if (!mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier) ||
        GameHandler.gameState === GameState.EndOfRound) {
        if (!LEAP_TEST_MODE) return;
    }

    if (LEAP_TEST_MODE) {
        if (Helpers.HasValidObjId(eventPlayer)) {
            LeapTestHarness.onBotSpawned(eventPlayer, mod.GetObjId(eventSpawner));
        }
        return;
    }
    mod.SetUnspawnDelayInSeconds(eventSpawner, 1.5);
    mod.EnableInputRestriction(eventPlayer, mod.RestrictedInputs.FireWeapon, true);
    AISpawnHandler.OnBotSpawnFromSpawner(eventPlayer, mod.GetObjId(eventSpawner));
}

export function OnPlayerInteract(eventPlayer: mod.Player, eventObject: mod.Object) {

    if (LEAP_TEST_MODE) {
        LeapTestHarness.onInteract(eventPlayer, eventObject);
        return;
    }

    const playerProfile = PlayerProfile.Get(eventPlayer);
    if (RESUPPLY_INTERACT_POINTS.includes(mod.GetObjId(eventObject)) && GameHandler.gameState == GameState.GameRoundIsRunning) {

        let roundsToSupply: number = 0;
        try {
            if (mod.IsInventorySlotActive(eventPlayer, mod.InventorySlots.PrimaryWeapon)) {
                const loadout = playerProfile ? Weapons.GetRoundLoadout(playerProfile) : [];
                const primaryItem = loadout.find(item => item?.inventorySlot === InventorySlot.Primary);
                const ammoInfo = primaryItem ? Weapons.GetAmmoForItem(primaryItem) : undefined;
                if (ammoInfo) {
                    const currentPrimaryAmmo = mod.GetSoldierState(eventPlayer, mod.SoldierStateNumber.CurrentWeaponMagazineAmmo);
                    if (currentPrimaryAmmo < ammoInfo.reserveMax) {
                        // clamp the resupply number to avoid oversupplying
                        roundsToSupply = Math.min(ammoInfo.resupplyAmount, Math.max(0, ammoInfo.reserveMax - currentPrimaryAmmo));
                        mod.SetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.PrimaryWeapon, roundsToSupply + currentPrimaryAmmo);
                    } else {
                        Helpers.PlaySoundFX(SFX_AMMO_FULL, 1, eventPlayer);
                    }
                    if (playerProfile) {
                        playerProfile.ShowAmmoFeedback(true, roundsToSupply);
                    }
                    console.log(`Resupply interacted: Primary ammo | Rounds Supplied:${roundsToSupply}`);
                }
            } else if (mod.IsInventorySlotActive(eventPlayer, mod.InventorySlots.SecondaryWeapon)) {
                const currentSecondaryAmmo: number =
                    mod.GetSoldierState(eventPlayer, mod.SoldierStateNumber.CurrentWeaponMagazineAmmo);
                const loadout = playerProfile ? Weapons.GetRoundLoadout(playerProfile) : [];
                const sidearmItem = loadout.find(item => item?.inventorySlot === InventorySlot.Sidearm);
                const ammoInfo = sidearmItem ? Weapons.GetAmmoForItem(sidearmItem) : undefined;
                if (ammoInfo) {
                    if (currentSecondaryAmmo < ammoInfo.reserveMax) {
                        // clamp the resupply number to avoid oversupplying
                        roundsToSupply = Math.min(ammoInfo.resupplyAmount, Math.max(0, ammoInfo.reserveMax - currentSecondaryAmmo));
                        mod.SetInventoryMagazineAmmo(eventPlayer, mod.InventorySlots.SecondaryWeapon, roundsToSupply + currentSecondaryAmmo);
                    } else {
                        Helpers.PlaySoundFX(SFX_AMMO_FULL, 1, eventPlayer);
                    }
                    if (playerProfile) {
                        playerProfile.ShowAmmoFeedback(false, roundsToSupply);
                    }
                    console.log(`Resupply interacted: Secondary ammo | Rounds Supplied:${roundsToSupply}`);
                }
            } else {
                Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, eventPlayer);
                playerProfile?.ShowAmmoFeedback(false, 0, mod.IsInventorySlotActive(eventPlayer, mod.InventorySlots.MeleeWeapon) ? MakeMessage(mod.stringkeys.infected_resupply_attempt) : MakeMessage(mod.stringkeys.resupply_invalid));
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
        if (mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)) {
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
                if (mod.GetObjId(mod.GetTeam(eventPlayer)) !== mod.GetObjId(SURVIVOR_TEAM)) {
                    mod.SetTeam(eventPlayer, SURVIVOR_TEAM);
                }
                if (playerProfile) {
                    playerProfile.isInfectedTeam = false;
                    playerProfile.isAlphaInfected = false;
                    playerProfile.isLastManStanding = false;
                }
                GameHandler.RecalculateCounts();
                GameHandler.RebuildPlayerLists();
                return;
            }

            if (GameHandler.gameState === GameState.PreGame
                || GameHandler.gameState === GameState.GameStartCountdown
                || GameHandler.gameState === GameState.EndOfRound) {
                await mod.Wait(2);
                if (mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAlive)) {
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
    if (LEAP_TEST_MODE) {
        LeapTestHarness.onHumanUndeployed(playerObjID);
    }

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
        if (BOT_SURVIVAL_TEST_MODE) {
            if (mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)) {
                return;
            }
            const playerProfile = PlayerProfile.Get(eventPlayer);
            const wasInitialSpawn = playerProfile?.isInitialSpawn ?? true;
            if (playerProfile) {
                playerProfile.isInfectedTeam = false;
                playerProfile.isAlphaInfected = false;
                playerProfile.isLastManStanding = false;
            }
            if (mod.GetObjId(mod.GetTeam(eventPlayer)) !== mod.GetObjId(SURVIVOR_TEAM)) {
                mod.SetTeam(eventPlayer, SURVIVOR_TEAM);
            }
            await PlayerProfile.CustomOnPlayerDeployed(eventPlayer);
            if (!wasInitialSpawn) {
                BotSurvivalTestHarness.requestRestart(`Player(${mod.GetObjId(eventPlayer)}) redeployed`);
            }
            return;
        }
        if (LEAP_TEST_MODE) {
            if (!mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)) {
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
        if (mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)) {
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
    if (LEAP_TEST_MODE) {
        LeapTestHarness.onHumanUndeployed(playerObjId);
    }

    const undeployedProfile = PlayerProfile._allPlayers.get(playerObjId);
    if (BOT_SURVIVAL_TEST_MODE && undeployedProfile && !undeployedProfile.isAI) {
        BotSurvivalTestHarness.requestRestart(`Player(${playerObjId}) undeployed`);
    }

    CleanupPlayerOngoingVisuals(playerObjId);
    CleanupLeapStateByObjId(playerObjId);
    if (PlayerProfile._deployedPlayers.has(playerObjId)) {
        PlayerProfile.RemoveFromDeployedPlayers(playerObjId);
    }
}

export function OnPlayerDied(eventPlayer: mod.Player, eventOtherPlayer: mod.Player, eventDeathType: mod.DeathType) {
    if (GameHandler.gameState === GameState.EndOfRound) {
        // ignore GH events and automatic team assignments
        console.log('Player was killed by GameHandler. Ignoring...');
        return;
    }

    // _deployedPlayers are *supposed to* only get added outside of EndOfRound
    const playerObjId = mod.GetObjId(eventPlayer);
    if (playerObjId > -1) {
        CleanupPlayerOngoingVisuals(playerObjId);
    }
    CleanupLeapSystem(eventPlayer);
    if (PlayerProfile._deployedPlayers.has(playerObjId)) {
        PlayerProfile.RemoveFromDeployedPlayers(playerObjId);
    }

    if (Helpers.HasValidObjId(eventPlayer)) {
        const playerObjID = mod.GetObjId(eventPlayer);
        const playerProfile = PlayerProfile.Get(eventPlayer);
        playerProfile?.loadoutDisplayBottom?.Hide();

        // Slot-based bot death handling
        if (mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)) {
            const infectedSlot = InfectedBotSlot.GetByObjID(playerObjID);
            const deathType = mod.EventDeathTypeCompare(eventDeathType, mod.PlayerDeathTypes.Deserting) ? "Deserting" :
                mod.EventDeathTypeCompare(eventDeathType, mod.PlayerDeathTypes.Fall) ? "Fall" :
                    mod.EventDeathTypeCompare(eventDeathType, mod.PlayerDeathTypes.Redeploy) ? "Redeploy" :
                        mod.EventDeathTypeCompare(eventDeathType, mod.PlayerDeathTypes.Melee) ? "Melee" :
                            mod.EventDeathTypeCompare(eventDeathType, mod.PlayerDeathTypes.Weapon) ? "Weapon" :
                                "Other";
            if (infectedSlot) {
                console.log(`OnPlayerDied | Infected Bot(${playerObjID}) [${infectedSlot.name}] died\nCause of Death: ${deathType}`);
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
    const damageDealer = eventOtherPlayer;
    if (mod.GetSoldierState(damageDealer, mod.SoldierStateBool.IsAISoldier)) return;

    if (mod.GetObjId(mod.GetTeam(damageDealer)) === mod.GetObjId(INFECTED_TEAM)) {
        if (mod.EventDamageTypeCompare(eventDamageType, mod.PlayerDamageTypes.Melee)) {
            const hitSFX = mod.SpawnObject(SFX_MELEE_HIT_FALL_DMG, POSITION_HQ2, ZERO_VEC);
            mod.PlaySound(hitSFX, 1, damageDealer);

            // If the melee target is in a vehicle, deal 200 damage to it
            if (mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsInVehicle)) {
                const targetVehicle = mod.GetVehicleFromPlayer(eventPlayer);
                mod.DealDamage(targetVehicle, 200);
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
    if (widgetName.includes('loadout_option_btn_')) {
        const match = widgetName.match(/loadout_option_btn_(\d+)_/);
        if (match && match[1]) {
            const index = parseInt(match[1], 10);
            if (!isNaN(index)) {
                playerProfile?.loadoutSelectionUI?.SelectOption(index);
                Helpers.PlaySoundFX(SFX_LOADOUT_SELECT, 1, eventPlayer);
            }
        }
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
        if (mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)) {
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
        mod.SetPlayerMovementSpeedMultiplier(eventPlayer, playerProfile.isAlphaInfected ? 1.3 : 1);
        const slot = InfectedBotSlot.GetByObjID(mod.GetObjId(eventPlayer));
        if (slot) slot.tick.inAreaTrigger = false;
    }
}

export function OnPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger) {
    if (mod.GetObjId(mod.GetTeam(eventPlayer)) !== mod.GetObjId(INFECTED_TEAM)) {
        const survivorProfile = PlayerProfile.Get(eventPlayer);
        if (survivorProfile && !survivorProfile.isAI) {
            survivorProfile.showSurvivorRoadWarning = true;
            survivorProfile.UpdatePlayerAreaNotificationWidget();
        }
        return;
    }

    const pp = PlayerProfile.Get(eventPlayer);
    if (pp?.isAI) {
        const targetInVehicle = pp?.currentTarget
            ? mod.GetSoldierState(pp.currentTarget, mod.SoldierStateBool.IsInVehicle)
            : false;
        const aiSpeedMultiplier = targetInVehicle ? 6 : 2;
        mod.SetPlayerMovementSpeedMultiplier(eventPlayer, aiSpeedMultiplier);
        const slot = InfectedBotSlot.GetByObjID(mod.GetObjId(eventPlayer));
        if (slot) slot.tick.inAreaTrigger = true;
    }
}

export function OnPlayerEnterVehicle(eventPlayer: mod.Player, eventVehicle: mod.Vehicle) {
    const playersInVehicle = mod.GetAllPlayersInVehicle(eventVehicle);
    console.log(`OnPlayerEnterVehicle | Player(${mod.GetObjId(eventPlayer)}) attempted to enter a Vehicle(${mod.GetObjId(eventVehicle)})`);
    const playerProfile = PlayerProfile.Get(eventPlayer);
    if (playerProfile) {
        playerProfile.invehicle = true;
    }
    playerProfile?.loadoutDisplayBottom?.Hide();
    // attempting to use the mod APIs to fetch players
    for (let i = 0; i < mod.CountOf(playersInVehicle); i++) {
        const playerInSeat = mod.ValueInArray(playersInVehicle, i);
        if ((mod.GetObjId(mod.GetTeam(playerInSeat)) === mod.GetObjId(INFECTED_TEAM))) {
            console.log(`OnPlayerEnterVehicle | Vehicle(${mod.GetObjId(eventVehicle)}) has an infected player inside. Forcing Player(${mod.GetObjId(eventPlayer)}) to exit.`);
            mod.ForcePlayerExitVehicle(playerInSeat, eventVehicle);
            Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1, playerInSeat);
        }
    }
}

export function OnPlayerExitVehicle(eventPlayer: mod.Player, eventVehicle: mod.Vehicle) {
    const playerProfile = PlayerProfile.Get(eventPlayer);
    if (playerProfile) {
        playerProfile.invehicle = false;
    }
    playerProfile?.loadoutDisplayBottom?.Show();
}

async function CleanupVehicleWithDamage(vehicle: mod.Vehicle, delaySeconds: number) {
    await mod.Wait(delaySeconds);
    try {
        mod.DealDamage(vehicle, 99999);
    } catch {
        try { mod.UnspawnObject(vehicle); } catch { }
    }
}

export function OnVehicleSpawned(eventVehicle: mod.Vehicle) {
    mod.SetVehicleMaxHealthMultiplier(eventVehicle, 0.5);
    for (const id of VEHICLE_SPAWNER_IDS) {
        mod.SetVehicleSpawnerTimeUntilAbandon(mod.GetVehicleSpawner(id), 3);
    }
    SPAWNED_ACTIVE_VEHICLE = eventVehicle;

    // Mark leap unlock only when the round had already requested a final-five spawn.
    if (CURRENT_MAP === MapNames.SAND2) {
        if (GameHandler.vehicleSpawnedThisRound) {
            LEAP_ATTACK_UNLOCKED_THIS_ROUND = true;
        }
    }

    // Notify all players via the alpha feedback banner and attempt a VO on both teams.
    const vehicleSpawnedMessage = ResolveStringKeyMessage("vehicle_spawned");
    const alphaLeapReadyMessage = ResolveStringKeyMessage("alpha_leap_available");
    const leapIsNowAvailable = IsLeapAttackAvailableNow();

    // If leap just unlocked, grant leap state to currently deployed alpha infected players now.
    if (leapIsNowAvailable) {
        for (const playerProfile of PlayerProfile._allPlayerProfiles) {
            if (!playerProfile.isAlphaInfected) continue;
            if (!Helpers.HasValidObjId(playerProfile.player)) continue;
            if (!mod.GetSoldierState(playerProfile.player, mod.SoldierStateBool.IsAlive)) continue;
            InitLeapSystem(playerProfile.player);
        }
    }

    for (const playerProfile of PlayerProfile._allPlayerProfiles) {
        const notifyAlphaLeapReady = leapIsNowAvailable
            && playerProfile.isInfectedTeam
            && playerProfile.isAlphaInfected;
        playerProfile.ShowAlphaFeedback(notifyAlphaLeapReady ? alphaLeapReadyMessage : vehicleSpawnedMessage);
    }
    if (VOSounds){
        mod.PlayVO(VOSounds, mod.VoiceOverEvents2D.VehicleArmoredSpawn, mod.VoiceOverFlags.Alpha, SURVIVOR_TEAM);
        mod.PlayVO(VOSounds, mod.VoiceOverEvents2D.VehicleArmoredSpawn, mod.VoiceOverFlags.Alpha, INFECTED_TEAM);
    }
}

export function OnVehicleDestroyed(eventVehicle: mod.Vehicle) {
    SPAWNED_ACTIVE_VEHICLE = undefined;
    CleanupVehicleWithDamage(eventVehicle, 5);
}

export async function OngoingPlayer(eventPlayer: mod.Player) {
    const playerObjId = mod.GetObjId(eventPlayer);
    if (!Helpers.HasValidObjId(eventPlayer) || playerObjId < 0) return;

    const playerProfile = PlayerProfile.Get(eventPlayer);

    // Safety net: if leap is unlocked and this deployed alpha is missing state,
    // initialize leap here so crouch charge detection can start immediately.
    if (playerProfile
        && !playerProfile.isAI
        && playerProfile.isAlphaInfected
        && IsPlayerOnInfectedTeamForLeap(eventPlayer, playerProfile)
        && IsLeapAttackAvailableNow()
        && !LEAP_STATES.has(playerObjId)) {
        LogLeapRuntime(`ongoing_safety_init_${playerObjId}`, `OngoingPlayer safety init triggered | player=${playerObjId} alpha=${playerProfile.isAlphaInfected} infected=${playerProfile.isInfectedTeam}`, 0.3);
        InitLeapSystem(eventPlayer);
    }

    TickLeap(eventPlayer);

    if (!IsPlayerDeployed(eventPlayer)) return;

    // In test mode, skip all normal ongoing logic (icons, banned weapons, bot AI, etc.)
    if (LEAP_TEST_MODE) return;

    // AI bots skip all human-specific logic and run a lean AI tick instead.
    if (playerObjId > -1 && mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)) {
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

/**
 * Lean AI tick: called from OngoingPlayer for AI soldiers only.
 * Only infected bots run InfectedBotLogicTick; survivor bots run self-managing AIBattlefieldBehavior.
 */
function OngoingAI(player: mod.Player, playerObjId: number): void {
    const slot = InfectedBotSlot.GetByObjID(playerObjId);
    if (!slot || slot.state !== BotSlotState.Alive) return;

    const now = Date.now() / 1000;
    if (now < slot.tick.nextTickAt) return;
    slot.tick.nextTickAt = now + AI_BOT_TICK_SECONDS;

    InfectedBotLogicTick(slot);
}

export async function OnGameModeStarted() {
    mod.EnableAllPlayerDeploy(false);
    mod.SetSpawnMode(mod.SpawnModes.AutoSpawn);

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
            console.log(`OnGameModeStarted | Found ${count} pre-existing vehicle(s); scheduling removal in 3.`);
            await mod.Wait(3);
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
    VOSounds = mod.SpawnObject(VOModule, mod.CreateVector(0, 0, 0), mod.CreateVector(0, 0, 0), mod.CreateVector(0, 0, 0));
    mod.LoadMusic(mod.MusicPackages.Core);
    mod.SetMusicParam(mod.MusicParams.Core_Amplitude, 1.8);

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

export function OnRayCastHit(
    eventPlayer: mod.Player,
    eventPoint: mod.Vector,
    eventNormal: mod.Vector
): void {
    HandleLeapRayCastHit(eventPlayer, eventPoint, eventNormal);
}

export function OnRayCastMissed(eventPlayer: mod.Player): void {
    HandleLeapRayCastMissed(eventPlayer);
}
