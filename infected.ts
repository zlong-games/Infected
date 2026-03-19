import { ParseUI } from "modlib";

const VERSION = "1.02.05";

// resolved at mode start by matching HQ position and resupply interact positions
let CURRENT_MAP: MapNames | undefined;

const DEBUG = false; // turn these off on publish
const FAST_ROUNDS = false;
const FAST_START = false;
const SKIP_SESSION_START = false;
const ENABLE_AI_LADDER_LOGIC = false;
const DEBUG_ALPHA_HUMAN_ONLY = false;
const DEBUG_ALPHA_STATE = false;
const DEBUG_ALPHA_DEBUG_MOVE_INDICATOR = true;
const DEBUG_INFECTED_CHASE_ICONS = false; // world icon per infected bot, color-coded by chase state
const DEBUG_SHOW_ALL_UI_ELEMENTS = false; // force-show all currently-instantiated UI widgets for layout debugging

const LOADOUT_SELECTION_TIME = 40;
const DEBUG_TIME = DEBUG && FAST_ROUNDS ? 7 : 60;
const GAME_COUNTDOWN_TIME = FAST_START ? 5 : LOADOUT_SELECTION_TIME;
const WAIT_FOR_SPAWN_TIMEOUT = 3;

const INFECTED_RESPAWN_TIME = 2;
const INFECTED_RESPAWN_TIME_LAST_MAN = 5;
const PLAYER_REDEPLOY_TIME = 1;
const SURVIVOR_AI_SPAWNERS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const INFECTED_AI_SPAWNERS: number[] = [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

const AI_INFECTED_MELEE_DISTANCE = 1;
const AI_LEASH_RANGE = 5;
const AI_MIN_DEF_RANGE = 3;

// Vehicle-chase anti-stutter constants
const AI_VEHICLE_MELEE_DISTANCE = 4;                // attack radius when target is in a vehicle
const AI_VEHICLE_MOVE_REISSUE_SECONDS = 0.8;        // throttle AIMoveTo when target is in the tracked vehicle
const AI_DEFAULT_MOVE_REISSUE_SECONDS = 0.15;       // throttle for normal (on-foot) targets
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
// const ALPHA_DEBUG_INDICATOR_VFX: mod.RuntimeSpawn_Common = mod.RuntimeSpawn_Common.FX_TracerDart_Projectile_Glow; // blinking red light useful for debugging
const SURVIVOR_TEAM = mod.GetTeam(1);
const INFECTED_TEAM = mod.GetTeam(2);
const POINTS_PER_INFECTED_KILL = 100;
const POINTS_PER_SURVIVOR_INFECTED = 300;
const POINTS_ROUND_SURVIVED = 850;
const HEALTH_RESTORE_ON_INFECTED = 50;
const LMS_RELOAD_POLL_SECONDS = 0.1;
const LMS_RELOAD_SPEED_FACTOR = 0.35;
const CURRENT_MAP_HQ_POSITION_THRESHOLD = 5.0;  // Increased from 1.0 to account for floating-point precision
const CURRENT_MAP_RESUPPLY_POSITION_THRESHOLD = 5.0;  // Increased from 1.0 to account for floating-point precision
const WAIT_FOR_MAP_GATE_TIMEOUT_SECONDS = 55; // Safety timeout to prevent infinite loops

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
        [ResupplyInteractPointId.POINT_301, { x: 34.907, y: 59.282, z: -36.942 }],
        [ResupplyInteractPointId.POINT_302, { x: -6.244, y: 60.423, z: -27.941 }],
    ]),
});

const POSITION_HQ1 = mod.GetObjectPosition(mod.GetHQ(1));
const POSITION_HQ2 = mod.GetObjectPosition(mod.GetHQ(2));
const ZERO_VEC: mod.Vector = mod.CreateVector(0, 0, 0);

const DEBUG_INTERACT_POINT_1_OBJ_ID = 305;
const SAND2_WARP_INTERACT_POINT_TOP = 402;
const SAND2_WARP_INTERACT_POINT_BOTTOM = 403;
// const SAND2_DEBUG_VEHICLE_BOT_SPAWN = 201;
let RESUPPLY_WORLD_ICONS: ResupplyWorldIconId[] = [];
let RESUPPLY_INTERACT_POINTS: ResupplyInteractPointId[] = [];
const RESUPPLY_WORLD_LOCATION: Map<ResupplyInteractPointId, mod.Vector> = new Map<ResupplyInteractPointId, mod.Vector>();

let ROUND_DURATION = 120; // duration of each round in seconds
let GAME_ROUND_LIMIT = 9;

// Tracked vehicle reference -- set in OnVehicleSpawned, used by infected AI logic
let SPAWNED_ACTIVE_VEHICLE: mod.Vehicle | undefined = undefined;

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


class Helpers {

    /**
     * Validates that a player has a valid ObjID (> -1)
     * Game engine returns -1 for players that have left or are invalid
     */
    static HasValidObjId(player: mod.Player | undefined): boolean {
        if (!player) return false;
        return mod.IsPlayerValid(player) && mod.GetObjId(player) > -1;
    }

    static async GetObjIdWithRetry(
        player: mod.Player,
        maxAttempts: number = 10,
        delayMs: number = 0.2
    ): Promise<number> {
        let objId = mod.GetObjId(player);
        let attempt = 0;

        while (objId === -1 && attempt < maxAttempts) {
            await mod.Wait(delayMs);
            objId = mod.GetObjId(player);
            attempt++;
        }

        if (objId === -1) {
            console.log(`GetObjIdWithRetry | Failed to get valid ObjID after ${maxAttempts} attempts`);
        } else if (attempt > 0) {
            console.log(`GetObjIdWithRetry | Got valid ObjID(${objId}) after ${attempt} retry attempt(s)`);
        }

        return objId;
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
const ALL_SPAWNS = SURVIVOR_AI_SPAWNERS.concat(INFECTED_AI_SPAWNERS);
const BOT_NAME_MAP: Map<number, string> = new Map();
Helpers.GenerateBotNameMap();

const INFECTED_LOGIC_TOKENS: Map<number, { cancel: boolean }> = new Map();
const ALPHA_INDICATOR_TOKENS: Map<number, { cancel: boolean }> = new Map();
const ALPHA_DEBUG_INDICATOR_TOKENS: Map<number, { cancel: boolean }> = new Map();
const INFECTED_WORLD_ICON_OBJECTS: Map<number, mod.Any> = new Map();
const LMS_WORLD_ICON_OBJECTS: Map<number, mod.Any> = new Map();

// Debug chase-state world icons -- one per infected bot, keyed by player objId
const DEBUG_CHASE_ICON_MAP: Map<number, mod.WorldIcon> = new Map();
let DEBUG_CHASE_ICON_NEXT_ID = 901; // world icon IDs 901+ reserved for debug

// Color vectors for debug chase icons (R, G, B  0-1)
const DEBUG_COLOR_VEHICLE_MELEE = mod.CreateVector(1.0, 0.0, 1.0);   // magenta -- attacking vehicle
const DEBUG_COLOR_VEHICLE_CHASE = mod.CreateVector(1.0, 0.5, 0.0);   // orange  -- chasing vehicle
const DEBUG_COLOR_ONFOOT_MELEE = mod.CreateVector(0.0, 1.0, 0.0);   // green   -- attacking on-foot
const DEBUG_COLOR_ONFOOT_CHASE = mod.CreateVector(1.0, 1.0, 0.0);   // yellow  -- chasing on-foot
const DEBUG_COLOR_NO_TARGET = mod.CreateVector(1.0, 0.0, 0.0);   // red     -- no target
const PLAYER_ONGOING_TICK_STATE: Map<number, {
    nextIconUpdateAt: number,
    nextBannedCheckAt: number,
    nextLadderCheckAt: number,
    bannedChecksEnabledAt?: number,
    lastLadderAmmo?: number,
    nextSledgeReminderAt?: number,
    // Infected bot tick-driven chase state
    infectedBotInitialized?: boolean,
    infectedBotTarget?: mod.Player,
    nextInfectedBotTickAt?: number,
    infectedBotLadderActive?: boolean,
    // Vehicle-chase anti-stutter state
    infectedBotLastMoveIssuedAt?: number,
    infectedBotLastMovePos?: mod.Vector,
}> = new Map();
const PLAYER_ONGOING_ICON_UPDATE_SECONDS = 0.05;
const PLAYER_ONGOING_BANNED_CHECK_SECONDS = 1;
const PLAYER_ONGOING_LADDER_CHECK_SECONDS = 0.1;
const PLAYER_ONGOING_INFECTED_BOT_TICK_SECONDS = 0.04;
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
        usg90: [
            mod.WeaponAttachments.Ammo_FMJ,
            mod.WeaponAttachments.Muzzle_Flash_Hider,
            mod.WeaponAttachments.Scope_SU_123_150x,
            mod.WeaponAttachments.Barrel_264mm_Fluted,
            mod.WeaponAttachments.Magazine_50rnd_Magazine,
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
        { attachment: mod.WeaponAttachments.Scope_RO_S_125x, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_ro_s_125x", rarity: 15, compatibleNameKeys: ["m87a1", "185ksk", "m1014", "ak205", "m277", "kord6p67", "rpkm", "usg90", "m45a1", "m44", "m357", "es57", "p18", "g22"] },
        { attachment: mod.WeaponAttachments.Scope_Mini_Flex_100x, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_mini_flex_100x", rarity: 15, compatibleNameKeys: ["m45a1", "m44", "m357", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Scope_R_MR_100x, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_rmr_100x", rarity: 15, compatibleNameKeys: ["m45a1", "m44", "m357", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Scope_SU_123_150x, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_su_123_150x", rarity: 25, compatibleNameKeys: ["m87a1", "185ksk", "m1014", "ak205", "m277", "kord6p67", "rpkm", "usg90"] },
        { attachment: mod.WeaponAttachments.Scope_Iron_Sights, slot: AttachmentSlot.Scope, nameKey: "attachment_scope_iron_sights", rarity: 5, compatibleNameKeys: ["m87a1", "185ksk", "m1014", "ak205", "m277", "kord6p67", "rpkm", "usg90", "m45a1", "m44", "m357", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Muzzle_Compensated_Brake, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_compensated_brake", rarity: 15, compatibleNameKeys: ["rpkm", "kord6p67", "ak205", "usg90"] },
        { attachment: mod.WeaponAttachments.Muzzle_Single_port_Brake, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_single_port_brake", rarity: 15, compatibleNameKeys: ["rpkm", "kord6p67", "ak205"] },
        { attachment: mod.WeaponAttachments.Muzzle_Double_port_Brake, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_double_port_brake", rarity: 20, compatibleNameKeys: ["rpkm", "kord6p67", "m277", "ak205", "185ksk"] },
        { attachment: mod.WeaponAttachments.Muzzle_CQB_Suppressor, slot: AttachmentSlot.Muzzle, nameKey: "attachment_muzzle_cqb_suppressor", rarity: 15, compatibleNameKeys: ["db12"] },
        { attachment: mod.WeaponAttachments.Bottom_Ribbed_Stubby, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_ribbed_stubby", rarity: 20, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "m277", "ak205", "rpkm"] },
        { attachment: mod.WeaponAttachments.Bottom_Folding_Vertical, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_folding_vertical", rarity: 15, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "m277", "ak205", "rpkm"] },
        { attachment: mod.WeaponAttachments.Bottom_Slim_Handstop, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_slim_handstop", rarity: 10, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "m277", "ak205", "rpkm"] },
        { attachment: mod.WeaponAttachments.Bottom_Low_Profile_Stubby, slot: AttachmentSlot.Underbarrel, nameKey: "attachment_bottom_low_profile_stubby", rarity: 20, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "kord6p67", "m277", "ak205", "rpkm"] },
        { attachment: mod.WeaponAttachments.Ergonomic_Improved_Mag_Catch, slot: AttachmentSlot.Ergonomic, nameKey: "attachment_ergonomic_mag_catch", rarity: 10, compatibleNameKeys: ["m45a1", "g22", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Ammo_FMJ, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_fmj", rarity: 5, compatibleNameKeys: ["ak205", "m277", "kord6p67", "rpkm", "usg90", "m45a1", "m44", "m357", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Ammo_Hollow_Point, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_hollow_point", rarity: 15, compatibleNameKeys: ["ak205", "m277", "kord6p67", "rpkm", "usg90", "m45a1", "m44", "m357", "es57", "p18"] },
        { attachment: mod.WeaponAttachments.Ammo_Tungsten_Core, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_tungsten_core", rarity: 15, compatibleNameKeys: ["ak205", "m277", "kord6p67", "rpkm", "usg90"] },
        { attachment: mod.WeaponAttachments.Ammo_Synthetic_Tip, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_synthetic_tip", rarity: 30, compatibleNameKeys: ["ak205", "kord6p67", "rpkm"] },
        { attachment: mod.WeaponAttachments.Ammo_Flechette, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_flechette", rarity: 15, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "db12"] },
        { attachment: mod.WeaponAttachments.Ammo_Slugs, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_slug", rarity: 25, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "db12"] },
        { attachment: mod.WeaponAttachments.Ammo_Buckshot, slot: AttachmentSlot.Ammo, nameKey: "attachment_ammo_buckshot", rarity: 5, compatibleNameKeys: ["m87a1", "m1014", "185ksk", "db12"] },
        { attachment: mod.WeaponAttachments.Barrel_20_Factory, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_20_factory", rarity: 5, compatibleNameKeys: ["m87a1"] },
        { attachment: mod.WeaponAttachments.Barrel_675_Factory, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_675_factory", rarity: 5, compatibleNameKeys: ["m44"] },
        { attachment: mod.WeaponAttachments.Barrel_5_Factory, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_5_factory", rarity: 5, compatibleNameKeys: ["m357"] },
        { attachment: mod.WeaponAttachments.Barrel_122mm_Factory, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_122mm_factory", rarity: 5, compatibleNameKeys: ["es57"] },
        { attachment: mod.WeaponAttachments.Barrel_39_Factory, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_39_factory", rarity: 5, compatibleNameKeys: ["p18"] },
        { attachment: mod.WeaponAttachments.Barrel_5_Pencil, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_5_pencil", rarity: 5, compatibleNameKeys: ["m45a1"] },
        { attachment: mod.WeaponAttachments.Barrel_264mm_Fluted, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_264mm_fluted", rarity: 5, compatibleNameKeys: ["ak205", "usg90"] },
        { attachment: mod.WeaponAttachments.Barrel_430mm_Cut, slot: AttachmentSlot.Barrel, nameKey: "attachment_barrel_430mm_cut", rarity: 5, compatibleNameKeys: ["185ksk"] },
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
        { attachment: mod.WeaponAttachments.Magazine_40rnd_Fast_Mag, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_40rnd_fast_mag", rarity: 20, compatibleNameKeys: ["kord6p67", "ak205", "rpkm"] },
        { attachment: mod.WeaponAttachments.Magazine_45rnd_Fast_Mag, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_45rnd_fast_mag", rarity: 30, compatibleNameKeys: ["kord6p67", "ak205", "rpkm"] },
        { attachment: mod.WeaponAttachments.Magazine_75rnd_Drum, slot: AttachmentSlot.Magazine, nameKey: "attachment_magazine_75rnd_drum", rarity: 30, compatibleNameKeys: ["rpkm"] },
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
            case "rpkm":
                return "762";
            case "m87a1":
            case "m1014":
            case "185ksk":
            case "db12":
                return "12g";
            case "m277":
                return "68";
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
                            : caliberGroup === "44" ? "44_magnum_fmj"
                                : caliberGroup === "357" ? "357_fmj"
                                    : caliberGroup === "545" ? "545_fmj"
                                        : caliberGroup === "68" ? "68_fmj"
                                            : caliberGroup === "762" ? "762_fmj"
                                                : undefined;
            case "attachment_ammo_hollow_point":
                return caliberGroup === "fn" ? "fn_hp"
                    : caliberGroup === "9mm" ? "9mm_hp"
                        : caliberGroup === "45" ? "45_acp_hp"
                            : caliberGroup === "44" ? "44_magnum_hp"
                                : caliberGroup === "357" ? "357_hp"
                                    : caliberGroup === "545" ? "545_hp"
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
                                        : caliberGroup === "68" ? "68_tungsten_core"
                                            : caliberGroup === "762" ? "762_tungsten_core"
                                                : undefined;
            case "attachment_ammo_synthetic_tip":
                return caliberGroup === "fn" ? "fn_synthetic_tip"
                    : caliberGroup === "9mm" ? "9mm_synthetic_tip"
                        : caliberGroup === "45" ? "45_acp_synthetic_tip"
                            : caliberGroup === "44" ? "44_magnum_synthetic_tip"
                                : caliberGroup === "357" ? "357_synthetic_tip"
                                    : caliberGroup === "545" ? "545_synthetic_tip"
                                        : caliberGroup === "762" ? "762_synthetic_tip"
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
        { nameKey: "es57", rarity: 50, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_ES_57, packageImage: Weapons.baseWeaponPackages["es57"] },
        { nameKey: "m45a1", rarity: 50, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_M45A1, packageImage: Weapons.baseWeaponPackages["m45a1"] },
        { nameKey: "m357", rarity: 60, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_M357_Trait, packageImage: Weapons.baseWeaponPackages["m357"] },
        { nameKey: "m44", rarity: 80, category: ItemPoolCategory.sidearm, item: mod.Weapons.Sidearm_M44, packageImage: Weapons.baseWeaponPackages["m44"] },
        { nameKey: "m87a1", rarity: 40, category: ItemPoolCategory.primary, item: mod.Weapons.Shotgun_M87A1, packageImage: Weapons.baseWeaponPackages["m87a1"] },
        { nameKey: "m1014", rarity: 40, category: ItemPoolCategory.primary, item: mod.Weapons.Shotgun_M1014, packageImage: Weapons.baseWeaponPackages["m1014"] },
        { nameKey: "185ksk", rarity: 80, category: ItemPoolCategory.primary, item: mod.Weapons.Shotgun__185KS_K, packageImage: Weapons.baseWeaponPackages["185ksk"] },
        { nameKey: "db12", rarity: 60, category: ItemPoolCategory.primary, item: mod.Weapons.Shotgun_DB_12, packageImage: Weapons.baseWeaponPackages["db12"] },
        { nameKey: "usg90", rarity: 40, category: ItemPoolCategory.LMS, item: mod.Weapons.SMG_USG_90, packageImage: Weapons.baseWeaponPackages["usg90"] },
        { nameKey: "m277", rarity: 40, category: ItemPoolCategory.LMS, item: mod.Weapons.Carbine_M277, packageImage: Weapons.baseWeaponPackages["m277"] },
        { nameKey: "rpkm", rarity: 50, category: ItemPoolCategory.LMS, item: mod.Weapons.LMG_RPKM, packageImage: Weapons.baseWeaponPackages["rpkm"] },
        { nameKey: "ak205", rarity: 70, category: ItemPoolCategory.LMS, item: mod.Weapons.Carbine_AK_205, packageImage: Weapons.baseWeaponPackages["ak205"] },
        { nameKey: "kord6p67", rarity: 80, category: ItemPoolCategory.LMS, item: mod.Weapons.AssaultRifle_KORD_6P67, packageImage: Weapons.baseWeaponPackages["kord6p67"] },
    ]

    static weaponAmmoProfiles: Record<string, WeaponAmmoProfile> = {
        // Sidearms
        g22: { baseMagSize: 15, reserveMags: 3, resupplyMags: 3 },
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
        kord6p67: { baseMagSize: 30, reserveMags: 4, resupplyMags: 4 },
        rpkm: { baseMagSize: 30, reserveMags: 4, resupplyMags: 4 },
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
    };

    static maxThrowablesStandard: number = 2;
    static maxThrowablesAlpha: number = 1;

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
        { nameKey: "ap_mine", rarity: 60, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Misc_Anti_Personnel_Mine },
        { nameKey: "supply_bag", rarity: 60, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Class_Supply_Bag },
        { nameKey: "incendiary_shotgun", rarity: 70, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Misc_Incendiary_Round_Shotgun },
        { nameKey: "thermobaric_launcher", rarity: 80, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Launcher_Thermobaric_Grenade },
        { nameKey: "incendiary_airburst", rarity: 80, category: ItemPoolCategory.gadgets, item: mod.Gadgets.Launcher_Incendiary_Airburst },
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
        // Primary Weapon (for Final Five)
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
     * - Fixed gear: Sledgehammer, Assault Ladder, Throwable (Stun/Knife for alpha)
     */
    static GetRoundLoadout(playerProfile: PlayerProfile): Array<EquippedItem> {
        const items: Array<EquippedItem> = [];
        const infected = playerProfile.isInfectedTeam || (mod.GetObjId(mod.GetTeam(playerProfile.player)) === mod.GetObjId(INFECTED_TEAM));
        const alphaInfected = playerProfile.isAlphaInfected;

        // Infected loadout: fixed gear, not using saved loadout
        if (infected) {
            let gadget = mod.Gadgets.Throwable_Stun_Grenade;
            let gadgetText = mod.stringkeys.infected_throwable_stun;

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
                gadget = mod.Gadgets.Throwable_Throwing_Knife;
                gadgetText = mod.stringkeys.infected_throwable_knives;
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
                console.log(`GetRoundLoadout | Player ${playerProfile.playerID} is the last man standing! Assigning LMS weapon`);
                const lmsWeapon = savedLoadout.find(item => item.inventorySlot === InventorySlot.LMS);
                if (lmsWeapon) {
                    // Grant LMS weapon in Primary slot
                    items.push({ ...lmsWeapon, inventorySlot: InventorySlot.Primary });
                }
            } else if (playerProfile.isFinalFive) {
                console.log(`GetRoundLoadout | Player ${playerProfile.playerID} is in the final five! Assigning Primary weapon`);
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
    static blackColor = mod.CreateVector(0, 0, 0);
    static gradientAlpha: number = 0.04;
    static showingAlert: boolean = false;
    // static deadSurvivors: number = 0;
    // static deadInfected: number = 0;
    // static xOffsetInfect = 15;
    // static xOffsetSurv = 15;

    static notificationVerticalGap = 1;
    static areaTriggerNotificationY = 60 + UI.notificationVerticalGap;
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

    static playerInfectionAlertPosition = mod.CreateVector(0, UI.alphaFeedbackY, 0);
    static playerAlertInfectionSize = mod.CreateVector(320, 45, 0);

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
        mod.AddUIText(componentName, this.playerInfectionAlertPosition, this.playerAlertInfectionSize, mod.UIAnchor.TopCenter, MakeMessage(mod.stringkeys.infected_on_death, playerProfile.player), playerProfile.player);
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
        mod.AddUIText(componentName, this.playerInfectionAlertPosition, this.playerAlertInfectionSize, mod.UIAnchor.TopCenter, MakeMessage(mod.stringkeys.infected_on_kill, playerProfile.player), playerProfile.player);
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

    static CreatePlayerAreaNotificationWidget(
        player: mod.Player,
        playerID: number,
        message: mod.Message = mod.Message(mod.stringkeys.survivor_area_warning),
        showIcon: mod.UIImageType = mod.UIImageType.QuestionMark
    ): mod.UIWidget | undefined {
        const containerWidth = 450;
        const containerHeight = 40;

        const xOffset = -(1024 / 2 - containerWidth / 2); // -287: aligns left edge with the scoreboard
        const children: any[] = [
            {
                type: "Text",
                name: `player_area_notification_text_${playerID}`,
                position: [0, 0, 0],
                size: [containerWidth, containerHeight],
                anchor: mod.UIAnchor.Center,
                textAnchor: mod.UIAnchor.Center,
                textSize: 18,
                bgAlpha: 0,
                textColor: UI.battlefieldWhite,
                textLabel: message,
            },
        ];

        if (showIcon) {
            children.push({
                type: "Image",
                name: `player_area_notification_icon_${playerID}`,
                position: [0, 0, 0],
                size: [containerHeight, containerHeight, 0],
                anchor: mod.UIAnchor.CenterLeft,
                imageType: showIcon,
                imageColor: UI.battlefieldYellow,
                imageAlpha: 1,
                bgAlpha: 0,
            });
        }

        return ParseUI({
            type: "Container",
            name: `player_area_notification_${playerID}`,
            position: [xOffset, UI.areaTriggerNotificationY, 0],
            size: [containerWidth, containerHeight],
            anchor: mod.UIAnchor.TopCenter,
            bgFill: mod.UIBgFill.Blur,
            bgColor: UI.battlefieldGrey,
            bgAlpha: 1,
            playerId: player,
            children,
        });

    }

    static UpdateInfectedSpeedBoostAreaNotification(playerProfile: PlayerProfile, isBoostActive: boolean) {
        if (!playerProfile.playerAreaNotificationWidget || !playerProfile.playerAreaNotificationIsSpeedBoost) return;

        const textWidget = mod.FindUIWidgetWithName(`player_area_notification_text_${playerProfile.playerID}`) as mod.UIWidget;
        const imageWidget = mod.FindUIWidgetWithName(`player_area_notification_icon_${playerProfile.playerID}`) as mod.UIWidget;
        let bgColor = UI.battlefieldGrey;
        let boostMessage = MakeMessage(mod.stringkeys.infected_speed_boost_ready);
        let boostImage = mod.UIImageType.SelfHeal;
        if (isBoostActive) {
            boostMessage = MakeMessage(mod.stringkeys.infected_speed_boost_active);
            boostImage = mod.UIImageType.RifleAmmo;
            bgColor = UI.infectedNightGreen;
        }

        if (textWidget) {
            mod.SetUITextLabel(
                textWidget,
                boostMessage
            );
            mod.SetUITextColor(textWidget, UI.battlefieldWhite);
        }
        if (imageWidget) {
            mod.SetUIImageType(imageWidget, boostImage);
        }

        mod.SetUIWidgetBgColor(
            playerProfile.playerAreaNotificationWidget,
            bgColor
        );
        mod.SetUIWidgetBgAlpha(playerProfile.playerAreaNotificationWidget, 1);
        mod.SetUIWidgetDepth(playerProfile.playerAreaNotificationWidget, mod.UIDepth.AboveGameUI);
        mod.SetUIWidgetVisible(playerProfile.playerAreaNotificationWidget, true);
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
    containerWidth = 400;
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
        if (!this.rootWidget) {
            console.log(`SpawnMessage | rootWidget is undefined! Creating new rootWidget`);
            this.rootWidget = this.CreateUI() as mod.UIWidget;
        } else {
            const headerText = mod.FindUIWidgetWithName(`${this.uiID}_current_loadout_${this._PlayerProfile.playerID}`);
            if (GameHandler.gameState === GameState.GameRoundIsRunning) {
                await mod.Wait(0.25); // wait during player spawn
            }
            this.BuildEquipmentIcons();

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
            let n = 1;
            if (DEBUG) console.log(`SpawnMessage | (${this.parentContainers.length})Existing parent container widgets:`);
            this.parentContainers.forEach(widget => {
                const name = mod.GetUIWidgetName(widget);
                console.log(`SpawnMessage | Widget(${n++}/${this.parentContainers.length}) Name:${name}`);
            });
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
        if (!this.loadoutWidgets) return;
        mod.SetUIWidgetVisible(this.rootWidget as mod.UIWidget, false);
    }

}


const gameStateMessageToast = new GameStateNotificationWidget();
const survivorCountNotificationToast = new SurvivorCountNotificationWidget();

//////////////////////////////////////////////////////////////////
///////----------------- SCORES AND STATS -----------------///////
//////////////////////////////////////////////////////////////////

type PlayerStats = {
    score: number;
    kills: number;
    infected: number;
    deaths: number;
    survived: number;
}

const INITIAL_STATS = {
    score: 0,
    kills: 0,
    infected: 0,
    deaths: 0,
    survived: 0
}

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
    isLastManStanding: boolean = false;
    isInitialSpawn: boolean = false;
    isFinalFive: boolean = false;
    lmsReloadLoopActive: boolean = false;
    infectedAreaSpeedBoostActive: boolean = false;
    infectedAreaSprintBoostWasActive: boolean = false;
    youInfectedWidget?: mod.UIWidget;
    infectedByWidget?: mod.UIWidget;
    infectedNightOverlay?: mod.UIWidget;
    playerAreaNotificationWidget?: mod.UIWidget;
    playerAreaNotificationIsSpeedBoost: boolean = false;
    loadoutDisplayBottom?: LoadoutDisplayBottomView;
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

        try {
            mod.RemoveEquipment(player, mod.InventorySlots.PrimaryWeapon);
            mod.RemoveEquipment(player, mod.InventorySlots.SecondaryWeapon);
            mod.RemoveEquipment(player, mod.InventorySlots.GadgetOne);
            mod.RemoveEquipment(player, mod.InventorySlots.GadgetTwo);
            mod.RemoveEquipment(player, mod.InventorySlots.ClassGadget);
            mod.RemoveEquipment(player, mod.InventorySlots.MeleeWeapon);
            mod.AddEquipment(player, mod.Gadgets.Melee_Combat_Knife);
        } catch (e) { }

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
            bannedChecksEnabledAt: now + PLAYER_BANNED_CHECK_SETTLE_SECONDS,
            lastLadderAmmo: existingTickState?.lastLadderAmmo,
            nextSledgeReminderAt: existingTickState?.nextSledgeReminderAt,
        });

        playerProfile.isDead = false;
        InfectedIconDisplay(player);

        // RunDeferredOnPlayerDeployedTasks(player, playerProfile);

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
                ShowAlphaInfectedDebugIndicator(player);
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

    UpdatePlayerAreaNotificationWidget() {
        if (this.isAI) return;
        const isInfected = this.isInfectedTeam || (mod.GetObjId(mod.GetTeam(this.player)) === mod.GetObjId(INFECTED_TEAM));

        if (!isInfected) {
            return;
        }

        if (!this.infectedAreaSpeedBoostActive) {
            if (this.playerAreaNotificationWidget && this.playerAreaNotificationIsSpeedBoost) {
                mod.DeleteUIWidget(this.playerAreaNotificationWidget);
                this.playerAreaNotificationWidget = undefined;
                this.playerAreaNotificationIsSpeedBoost = false;
            }
            return;
        }

        if (!this.playerAreaNotificationWidget || !this.playerAreaNotificationIsSpeedBoost) {
            if (this.playerAreaNotificationWidget) {
                mod.DeleteUIWidget(this.playerAreaNotificationWidget);
                this.playerAreaNotificationWidget = undefined;
            }
            this.playerAreaNotificationWidget = UI.CreatePlayerAreaNotificationWidget(
                this.player,
                this.playerID,
                MakeMessage(mod.stringkeys.infected_speed_boost_ready),

            );
            this.playerAreaNotificationIsSpeedBoost = true;
        }

        if (this.playerAreaNotificationWidget) {
            const isSprinting = mod.GetSoldierState(this.player, mod.SoldierStateBool.IsSprinting);
            UI.UpdateInfectedSpeedBoostAreaNotification(this, isSprinting);
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
            playerProfile.infectedAreaSpeedBoostActive = false;
            playerProfile.infectedAreaSprintBoostWasActive = false;
            playerProfile.playerAreaNotificationIsSpeedBoost = false;
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
                if (this.playerAreaNotificationWidget) {
                    mod.DeleteUIWidget(this.playerAreaNotificationWidget);
                    this.playerAreaNotificationWidget = undefined;
                }
                this.playerAreaNotificationIsSpeedBoost = false;

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
    }

    CreateAlphaInfectedAlert(): mod.UIWidget {
        const widgetName: string = `alpha_infected_${this.playerID}`;
        let yOffset: number = UI.alphaSelectionY;
        mod.AddUIText(
            widgetName,
            mod.CreateVector(0, yOffset, 0),
            mod.CreateVector(550, 40, 0),
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
            mod.CreateVector(200, 40, 0),
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
    ]

    static sandFXProps = [
        { id: mod.RuntimeSpawn_Common.FX_BASE_Fire_L, position: { x: 12.807, y: 33.216, z: -18.708 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_CarFire_FrameCrawl, position: { x: 12.807, y: 33.226, z: -18.708 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_Black_L, position: { x: 12.807, y: 33.216, z: -18.708 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        // wrecked car by trees 
        { id: mod.RuntimeSpawn_Common.FX_CarFire_FrameCrawl, position: { x: -6.337, y: 33.198, z: -6.141 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_Car_Fire_M_GS, position: { x: -5.944, y: 32.896, z: -8.017 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        // supposed to be center-ish, only birds are working
        { id: mod.RuntimeSpawn_Common.FX_BASE_Birds_Black_Circulating, position: { x: -46.727, y: 32.668, z: -29.203 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_Snow_WhiteLeaves_01, position: { x: -46.727, y: 32.668, z: -29.203 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_BASE_Dust_Large_Area, position: { x: -46.727, y: 32.668, z: -23.676 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_BASE_DeployClouds_Var_A, position: { x: -46.727, y: 32.668, z: -25.676 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_BASE_DeployClouds_Var_B, position: { x: -46.727, y: 32.668, z: -27.203 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
    ]

    static sand2FXProps = [
        { id: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Pillar_Black_L, position: { x: 70.423, y: 59.969, z: -81.828 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_Car_Fire_M_GS, position: { x: 70.392, y: 59.086, z: -82.348 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_Snow_BlowingSnow_S_01_inShadow, position: { x: 81.614, y: 63.436, z: 8.468 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_Snow_WhiteLeaves_01, position: { x: 40.096, y: 80.207, z: -13.362 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_BASE_Smoke_Column_XXL, position: { x: 12.329, y: 51.796, z: 79.435 }, rotation: { x: -0.707, y: 0, z: 0, w: 0.707 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
        { id: mod.RuntimeSpawn_Common.FX_Granite_Strike_Smoke_Marker_Red, position: { x: 22.192, y: 75.779, z: -55.832 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1.0, y: 1.0, z: 1.0 } },
    ]

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
     *  -  Used by GameHandler.HandleEoRSpawns to determine next round setup.
     * @todo Mark last man standing as the alpha infected for next round
     */
    static endOfRoundCondition: caseOptions;

    // spawn systems
    static survivorSlotsToBackfill: number = 12;
    static survivorsNextRound: number = 0;
    static infectedNextRound: number = 0;
    static isSpawnCheckRunning: boolean = false;
    static skipAlphaSelection: boolean = false;
    static preserveAlpha: boolean = false;
    static nextRoundFinalFive: boolean = false;
    static shouldShowLoadoutSelection: boolean = true;

    // Recent infected increment events (for detecting accidental double-increments)
    // Each entry: { t: timestamp_ms, source: string, playerID?: number }
    static recentInfectedIncrements: { t: number; source: string; playerID?: number }[] = [];
    static infectedIncrementWarnings: number = 0;
    static lastAlphaPlayerID?: number;
    static nextRoundForcedAlphaPlayerID?: number;

    static WaitForAllDeploys(timeoutSeconds: number): Promise<boolean> {
        console.log(`WaitForAllDeploys | waiting up to ${timeoutSeconds}s for PlayerProfile._deployedPlayers to include all players (Human and AI)`);
        const timeoutMs = timeoutSeconds * 1000;
        const start = Date.now();

        return new Promise<boolean>(async (resolve) => {
            while (true) {
                // timeout
                if (Date.now() - start > timeoutMs) {
                    console.log('WaitForAllDeploys | timeout elapsed');
                    break;
                }

                // If spawn queue is still processing, wait a bit
                if (AISpawnHandler.awaitingSpawnQueue.length > 0 || AISpawnHandler.isProcessingSpawnQueue) {
                    await mod.Wait(0.25);
                    continue;
                }

                // If spawnsInUse is not empty, we're still waiting for bots to spawn and match
                if (AISpawnHandler.spawnsInUse.size > 0) {
                    console.log(`WaitForAllDeploys | Waiting for ${AISpawnHandler.spawnsInUse.size} bot(s) to spawn from spawners: [${Array.from(AISpawnHandler.spawnsInUse.keys()).join(', ')}]`);
                    await mod.Wait(0.25);
                    continue;
                }

                // Build list of required human player IDs
                // Treat a human with ObjID -1 as "still processing"; don't consider them ready yet
                let requiredHumans = PlayerProfile._allPlayerProfiles
                    .filter(pp => !pp.isAI)
                    .map(pp => mod.GetObjId(pp.player));
                const humansWithInvalidObjId = requiredHumans.filter(id => id === -1).length;
                if (humansWithInvalidObjId > 0) {
                    // Wait briefly for engine to finish assigning ObjIDs during PreGame
                    console.log(`WaitForAllDeploys | ${humansWithInvalidObjId} human(s) have ObjID -1; waiting for engine to assign ObjIDs`);
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
        // spawns the Vector vehicle at the specified vehicle spawner set in Godot
        const vehicle = mod.GetVehicleSpawner(202);
        mod.SetVehicleSpawnerVehicleType(vehicle, mod.VehicleList.Vector);
        mod.ForceVehicleSpawnerSpawn(vehicle);
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
        switch (mapSelection) {
            case MapNames.SAND:
                propsToSpawn = this.sandFXProps;
                break;
            case MapNames.SAND2:
                propsToSpawn = this.sand2FXProps;
                break;
            default:
                return;
        }
        propsToSpawn.forEach(fxAsset => {
            const asset = GameHandler.SpawnObjectFromGodot(fxAsset as ObjectTransform);
            this.spawnedFXProps.push(asset);
            mod.EnableVFX(asset, true)
        });
    }

    static SpawnRoundMapContent(mapSelection: MapNames | undefined) {
        const shouldSpawnDefenses = mapSelection === MapNames.SAND;
        const shouldSpawnVehicle = mapSelection === MapNames.SAND2;

        if (shouldSpawnDefenses) {
            this.SpawnDefenses();
        } else {
            this.ClearSpawnedDefenses();
        }

        if (shouldSpawnVehicle) {
            this.SpawnVehicle();
        }

        this.SpawnFX(mapSelection);
    }

    static async SuspendWinChecksFor(seconds: number) {
        GameHandler.suspendWinChecks = true;
        console.log(`SuspendWinChecksFor: suspending win checks for ${seconds}s`);
        await mod.Wait(seconds);
        GameHandler.suspendWinChecks = false;
        console.log(`SuspendWinChecksFor: resumed win checks`);
    }

    static GetAllPlayersOnTeam(team: mod.Team): mod.Player[] {
        const allPlayers = mod.AllPlayers();
        const n = mod.CountOf(allPlayers);
        const teamID = mod.GetObjId(team);
        let teamMembers = [];
        for (let i = 0; i < n; i++) {
            let player = mod.ValueInArray(allPlayers, i) as mod.Player;
            let playerTeamID = mod.GetObjId(mod.GetTeam(player));
            if (playerTeamID === teamID) {
                teamMembers.push(player);
            }
        }
        return teamMembers;
    }

    static GetHumanPlayersOnTeam(team: mod.Team): mod.Player[] {
        const allPlayers = mod.AllPlayers();
        const n = mod.CountOf(allPlayers);
        const teamID = mod.GetObjId(team);
        let teamMembers = [];
        for (let i = 0; i < n; i++) {
            let player = mod.ValueInArray(allPlayers, i) as mod.Player;
            let playerTeamID = mod.GetObjId(mod.GetTeam(player));
            if (playerTeamID === teamID && !mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
                teamMembers.push(player);
            }
        }
        return teamMembers;
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
            if (!mod.IsPlayerValid(p)) continue;
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
        console.log(`RecalculateCounts -> Survivors: ${survivors} | Infected: ${infected} | Total: ${total} | Humans: ${humans}`);
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
                    if (!mod.GetSoldierState(lastManStanding, mod.SoldierStateBool.IsAISoldier)) {
                        StartLastManStandingReloadLoop(lmsProfile);
                    }
                }
                for (let playerProfile of PlayerProfile._allPlayerProfiles) {
                    if (playerProfile.isInfectedTeam) {
                        InfectedIconDisplay(playerProfile.player);
                        continue;
                    }
                }
            } else if (GameHandler.survivorsCount === 5 && GameHandler.gameState === GameState.GameRoundIsRunning) {
                // flags final five survivors, runs loadout initialization
                const finalFiveMessage = MakeMessage(mod.stringkeys.final_five);
                GameHandler.DisplayGameStateNotification(finalFiveMessage);
                Helpers.PlaySoundFX(SFX_FINAL_FIVE, 1);
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
            // GameHandler.StopLastManStandingMusic();
            GameHandler.gameState = GameState.EndOfRound;
            GameHandler.endOfRoundCondition = '0 survivors';
            GameHandler.survivorsNextRound = GameHandler.survivorSlotsToBackfill;
            GameHandler.infectedNextRound = 0;
            GameHandler.skipAlphaSelection = false;
            GameHandler.preserveAlpha = false;
            GameHandler.nextRoundFinalFive = false;
            GameHandler.nextRoundForcedAlphaPlayerID = undefined;
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
                // use the actual alive infected count (humans + AI) to calculate bots needed for next round
                GameHandler.infectedNextRound = this.GetNumberOfBotsToSpawn(INFECTED_TEAM, GameHandler.infectedCount);
                GameHandler.skipAlphaSelection = true;
                GameHandler.preserveAlpha = true;
                GameHandler.nextRoundFinalFive = GameHandler.survivorsCount > 0 && GameHandler.survivorsCount <= 5;
                GameHandler.survivorsRoundsWon++;
                console.log('End of Round Condition: 2+ infected - skipping alpha selection next round.');

            }
            else if (GameHandler.infectedCount === 1) {
                GameHandler.endOfRoundCondition = '1 infected';
                GameHandler.survivorsNextRound = GameHandler.survivorSlotsToBackfill;
                GameHandler.infectedNextRound = 0;
                GameHandler.skipAlphaSelection = false;
                GameHandler.preserveAlpha = false;
                GameHandler.nextRoundFinalFive = false;
                GameHandler.nextRoundForcedAlphaPlayerID = undefined;
                GameHandler.survivorsRoundsWon++;
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
        AISpawnHandler.awaitingSpawnQueue = [];
        AISpawnHandler.spawnsInUse.clear();
        if (AISpawnHandler.infectedSpawnIndex >= INFECTED_AI_SPAWNERS.length) {
            AISpawnHandler.infectedSpawnIndex = 0;
        }
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
            if (mod.IsPlayerValid(pp) && mod.GetSoldierState(pp, mod.SoldierStateBool.IsAlive)) {
                mod.UndeployPlayer(pp);
                mod.SetTeam(pp, mod.GetTeam(1));
                continue;
            } else {
                mod.SetTeam(pp, mod.GetTeam(1));
            }
        }
    }

    /**
     * Loops through all PlayerProfiles in .GetAvailablePlayers() and restricts inputs as specified
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
                try {
                    if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
                        mod.AIEnableTargeting(player, false);
                        mod.AIIdleBehavior(player);
                    }
                } catch { }
                try { mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, true); } catch { }
                if (playerProfile.isInfectedTeam) {
                    try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveForwardBack, true); } catch { }
                    try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveLeftRight, true); } catch { }
                    try { mod.EnableInputRestriction(player, mod.RestrictedInputs.Jump, true); } catch { }
                }
            });
        } else {
            PlayerProfile._allPlayerProfiles.forEach(playerProfile => {
                const player = playerProfile.player;
                try {
                    if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
                        mod.AIEnableTargeting(player, true);
                        mod.AIIdleBehavior(player);
                    }
                } catch { }
                try { mod.EnableInputRestriction(player, mod.RestrictedInputs.FireWeapon, false); } catch { }
                try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveForwardBack, false); } catch { }
                try { mod.EnableInputRestriction(player, mod.RestrictedInputs.MoveLeftRight, false); } catch { }
                try { mod.EnableInputRestriction(player, mod.RestrictedInputs.Jump, false); } catch { }
            });
        }

    }
    /**
     * Undeploys human infected players at the end of the round
     */
    static async UndeployAllHumanPlayers() {
        console.log('Undeploying all human players.');
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
            if (mod.GetSoldierState(player, mod.SoldierStateBool.IsAISoldier)) {
                // mod.UndeployPlayer(player); // this forces bots to respawn. DO NOT USE THIS.
                if (PlayerProfile._deployedPlayers.has(mod.GetObjId(player))) {
                    PlayerProfile.RemoveFromDeployedPlayers(mod.GetObjId(player));
                }
                mod.Kill(player);
            }

        }

        console.log('Verifying cleanup on bots...');
        const survivors = GameHandler.GetAllPlayersOnTeam(SURVIVOR_TEAM).filter(player =>
            PlayerIsAliveAndValid(player));
        const infected = GameHandler.GetAllPlayersOnTeam(INFECTED_TEAM).filter(player =>
            PlayerIsAliveAndValid(player));
        console.log(`Current Alive Teams | Survivors: ${survivors.length} | Infected: ${infected.length}`);
        console.log(`Current GameHandler Counts | Survivors: ${GameHandler.survivorsCount} | Infected: ${GameHandler.infectedCount}`);
    }

    static async HandleEoRSpawns(expr: caseOptions) {

        switch (expr) {
            case '0 survivors':
                AISpawnHandler.InitializeStartingSurvivorSpawns(GameHandler.survivorsNextRound); // value of slotsToBackfill
                AISpawnHandler.InitializeStartingInfectedSpawns(Math.max(0, GameHandler.infectedNextRound)); // clamp infected number
                GameHandler.MoveAllHumanPlayersToSurvivorTeam();
                console.log(`'EoR' | 0 survivors | Initial Round Conditions | Spawning ${GameHandler.survivorsNextRound} Survivors and ${GameHandler.infectedNextRound} Infected next round`);
                break
            case '1 infected':
                AISpawnHandler.InitializeStartingSurvivorSpawns(GameHandler.survivorsNextRound); // reset survivors
                AISpawnHandler.InitializeStartingInfectedSpawns(Math.max(0, GameHandler.infectedNextRound)); // clamp infected number
                GameHandler.MoveAllHumanPlayersToSurvivorTeam();
                console.log(`'EoR' | 1 infected | Resetting Survivors and Infected to Initial Round Conditions | Spawning ${Math.max(0, GameHandler.survivorsNextRound)} Survivors and ${Math.max(0, GameHandler.infectedNextRound)} Infected next round`);
                break
            case '2+ infected':
                AISpawnHandler.InitializeStartingSurvivorSpawns(Math.max(0, GameHandler.survivorsNextRound));
                AISpawnHandler.InitializeStartingInfectedSpawns(Math.max(0, GameHandler.infectedNextRound));
                GameHandler.infectedCount = Math.max(0, GameHandler.infectedNextRound);
                console.log(`'EoR' | 2+ infected | Recycling Team Counts | Spawning ${GameHandler.survivorsNextRound} Survivors and ${GameHandler.infectedNextRound} Infected next round`);
                break
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

        await this.UndeployAllHumanPlayers();
        await this.KillAllBotsEndRound();

        GameHandler.isSpawnCheckRunning = false;
        GameHandler.currentRound++;
        GameHandler.roundTimeRemaining = ROUND_DURATION;

        // If any human survivors remain alive and deployed, refresh their equipment to match the new round
        try {
            const survivorsAlive = GameHandler.GetAllPlayersOnTeam(SURVIVOR_TEAM)
                .filter(p => mod.IsPlayerValid(p) && mod.GetSoldierState(p, mod.SoldierStateBool.IsAlive) && !mod.GetSoldierState(p, mod.SoldierStateBool.IsAISoldier));
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

        return;
    }


    static async PreGameSetup() {

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

        GameHandler.RecalculateCounts();
        ScoreboardUI.GlobalUpdate(TeamNameString.Both);

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
            await mod.Wait(1);
            await GameHandler.PreGameSetup();

            while (GameHandler.gameState !== GameState.GameRoundIsRunning) {
                await mod.Wait(1);
                if (GameHandler.gameState === GameState.GameOver) {
                    break
                }
            }
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

type BotOptions = {
    playerName?: mod.Any;
    moveSpeed?: mod.MoveSpeed;
    speedMultiplier?: number;
    health?: number;
    stance?: mod.Stance;
    spawnerObjID: number;
    player?: mod.Player;
    playerID?: number;
    assignedTeamObj?: mod.Team;
    teamName: string;
    soldierClass?: mod.SoldierClass;
    spawnerObject?: mod.Spawner;
    isInitialSpawn: boolean;
    isInfectedTeam: boolean;
    isAlphaInfected?: boolean;
    playerStats: PlayerStats;
    callbacks?: BotEventCallbacks;
};

type BotEventCallbacks = {
    onSpawnCallback: (player: mod.Player, botProfile: BotProfile) => void | Promise<void>;
    onDeathCallback: (player: mod.Player, botProfile: BotProfile) => void | Promise<void>;
    onHit: (player: mod.Player, botProfile: BotProfile) => void | Promise<void>;
};

class BotProfile {
    playerName: string;
    moveSpeed: mod.MoveSpeed;
    speedMultiplier: number;
    health: number;
    stance: mod.Stance;
    spawnerObject?: mod.Spawner;
    spawnerObjID: number;
    _player?: mod.Player;
    _playerObjID?: number;
    _playerProfile?: PlayerProfile;
    assignedTeamObj: mod.Team;
    soldierClass: mod.SoldierClass;
    teamName: string;
    isInfectedTeam: boolean;
    isAlphaInfected: boolean;
    isInitialSpawn: boolean;
    playerStats: PlayerStats;

    static _allAI: Map<number, BotProfile> = new Map(); // keyed by player ObjID
    static _botInstances: BotProfile[] = []
    static _usedNames: Set<string> = new Set();

    // Resolve a unique infected bot name using BOT_NAME_MAP; do not append to existing player names.
    static ResolveInfectedName(spawnerObjID: number): string {
        const fallbackName = "infected_bot_name";
        // Prefer the mapped name for this spawner
        let candidate = BOT_NAME_MAP.get(spawnerObjID) ?? fallbackName;
        for (const name in BotProfile._usedNames) {
            console.log(`BotProfile ResolveInfectedName | Used Bot Names: ${name}`);
        }
        if (!BotProfile._usedNames.has(candidate)) {
            BotProfile._usedNames.add(candidate);
            return candidate;
        }
        // Try to find the next unused entry in BOT_NAME_MAP
        for (const [id, name] of BOT_NAME_MAP.entries()) {
            if (!BotProfile._usedNames.has(name)) {
                BotProfile._usedNames.add(name);
                return name;
            }
        }
        return `${fallbackName}_${spawnerObjID}`;
    }

    constructor(public botCallbacks: BotEventCallbacks, options: BotOptions, initialStats: PlayerStats = INITIAL_STATS) {
        this.playerName = options.playerName;
        this.moveSpeed = options.moveSpeed ?? mod.MoveSpeed.Run;
        this.speedMultiplier = options.speedMultiplier ?? 1;
        this.health = options.health ?? 50;
        this.stance = options.stance ?? mod.Stance.Stand;
        this.spawnerObjID = options.spawnerObjID;
        this.spawnerObject = options.spawnerObject;
        this.assignedTeamObj = options.assignedTeamObj ?? SURVIVOR_TEAM;
        this.teamName = options.teamName ?? "survivors";
        this.soldierClass = options.soldierClass ?? mod.SoldierClass.Engineer;
        this.isInfectedTeam = options.isInfectedTeam;
        this.isAlphaInfected = options.isAlphaInfected ?? false;
        this.isInitialSpawn = options.isInitialSpawn;
        this.playerStats = options.playerStats ?? { ...initialStats };

        BotProfile._botInstances.push(this);
        if (typeof this.playerName === 'string') {
            BotProfile._usedNames.add(this.playerName);
            for (const name in BotProfile._usedNames) {
                console.log(`BotProfile Constructor | Used Bot Names: ${name}`);
            }
        }
    }

    static GetBySpawner(spawnerObjID: number): BotProfile | undefined {
        // Primary lookup by spawnerObjID to select the correct pending BotProfile
        const botProfile = BotProfile._botInstances.find(bp => bp.spawnerObjID === spawnerObjID);
        return botProfile;
    }

    static GenerateBotParams(options?: any): BotProfile {
        // generate a new BotProfile from a set of properties that are used to assign bots to spawn points in a queue
        // For infected, reuse existing name if provided (respawning bot), otherwise resolve from BOT_NAME_MAP.
        // For survivors, use provided name as-is.
        const resolvedName = (options.teamName === TeamNameString.Infected)
            ? (options.playerName || BotProfile.ResolveInfectedName(options.spawnerObjID))
            : options.playerName;

        let botParams: BotOptions = {
            playerName: resolvedName,
            moveSpeed: (options.teamName === TeamNameString.Infected) ? mod.MoveSpeed.Sprint : mod.MoveSpeed.InvestigateRun,
            speedMultiplier: 1,
            health: options.health,
            stance: mod.Stance.Stand,
            spawnerObjID: options.spawnerObjID,
            spawnerObject: options.spawnerObject,
            assignedTeamObj: (options.teamName === TeamNameString.Infected) ? INFECTED_TEAM : SURVIVOR_TEAM,
            soldierClass: (options.teamName === TeamNameString.Infected) ? mod.SoldierClass.Recon : mod.SoldierClass.Assault,
            teamName: options.teamName,
            isInfectedTeam: options.isInfectedTeam,
            isAlphaInfected: options.isAlphaInfected ?? false,
            isInitialSpawn: options.isInitialSpawn,
            playerStats: options.playerStats ?? { ...INITIAL_STATS }
        };
        const botCallbacks = options.callbacks ?? ((options.teamName === TeamNameString.Infected) ? infectedBotCallbacks : survivorBotCallbacks);
        return new BotProfile(botCallbacks, botParams);
    }

    UpdatePlayerScoreboard(player: mod.Player) {
        return;
    }

    async InitBehavior(player: mod.Player, playerProfile: PlayerProfile) {
        await mod.Wait(0.5);
        this._player = player;
        this._playerProfile = playerProfile;
        mod.AIEnableShooting(player, true);
        mod.SetPlayerMaxHealth(player, playerProfile.isAlphaInfected ? 300 : this.health);
        mod.AISetMoveSpeed(player, this.moveSpeed);
        mod.AISetStance(player, this.stance);
        mod.SetPlayerMovementSpeedMultiplier(player, playerProfile.isAlphaInfected ? 1.3 : this.speedMultiplier);
        await this.botCallbacks.onSpawnCallback(player, this);
    }

    async botWasKilled(player: mod.Player) {
        await this.botCallbacks.onDeathCallback(player, this);
    }

    async onHit(player: mod.Player) {
        console.log('hit');
        await this.botCallbacks.onHit(player, this);
    }

    static async OnAIDied(player: mod.Player, playerProfile: PlayerProfile, botProfile: BotProfile) {
        console.log(`OnAIDied | Player(${mod.GetObjId(player)}) switching sides:${(!playerProfile.isInfectedTeam) ? true : false}`);

        // Remove stale cache entries so the next spawn can't reuse survivor callbacks
        const prevObjId = mod.GetObjId(player);
        BotProfile._allAI.delete(prevObjId);
        const existingIdx = BotProfile._botInstances.indexOf(botProfile);
        if (existingIdx !== -1) {
            BotProfile._botInstances.splice(existingIdx, 1);
            if (typeof botProfile.playerName === 'string') {
                BotProfile._usedNames.delete(botProfile.playerName);
            }
        }

        // When a survivor AI dies (e.g., killed by an infected human), convert to infected and 
        // increment the stable per-round infectedCount once here. 
        // Guard with botProfile flag to avoid double-increments when downstream callbacks run.
        if (!playerProfile.isInfectedTeam) {
            console.log(`DEBUG | OnAIDied BEFORE playerProfile | playerID:${mod.GetObjId(player)} | isInfectedTeam:${playerProfile.isInfectedTeam}`);
            playerProfile.isInfectedTeam = true;
            console.log(`DEBUG | OnAIDied AFTER playerProfile | playerID:${mod.GetObjId(player)} | isInfectedTeam:${playerProfile.isInfectedTeam}`);
        }
        if (!botProfile.isInfectedTeam && (GameHandler.gameState === GameState.GameRoundIsRunning || GameHandler.gameState === GameState.GameStartCountdown)) {
            console.log(`DEBUG | OnAIDied BEFORE botProfile | playerID:${mod.GetObjId(player)} | botIsInfected:${botProfile.isInfectedTeam} | infectedCount:${GameHandler.infectedCount}`);
            botProfile.isInfectedTeam = true; // mark so survivorBotCallbacks.onDeathCallback won't re-increment
            botProfile.isInitialSpawn = false; // this life is ending; next infected spawn will mark fresh
            playerProfile.isInitialSpawn = false;
            playerProfile.isDead = true;
            GameHandler.infectedCount = Math.min(INFECTED_COUNT_LIMIT, (GameHandler.infectedCount ?? 0) + 1);
            console.log(`DEBUG | OnAIDied AFTER botProfile | playerID:${mod.GetObjId(player)} | botIsInfected:${botProfile.isInfectedTeam} | infectedCount:${GameHandler.infectedCount}`);
        }
        botProfile.botWasKilled(playerProfile.player);

        if (!playerProfile._botProfile)
            console.log('OnAIDied "CRITICAL ERROR" | BotProfile was not found on the PlayerProfile');
    }
}

const survivorBotCallbacks: BotEventCallbacks = {
    onSpawnCallback: async (eventPlayer: mod.Player, botProfile: BotProfile) => {
        console.log(`survivorBotCallbacks | OnSpawn | Player(${mod.GetObjId(eventPlayer)}) spawned spawnID:${botProfile.spawnerObjID} initialSpawn:${botProfile.isInitialSpawn} botProfile:${botProfile.playerName} isInfectedTeam:${botProfile.isInfectedTeam} teamName:${botProfile.teamName}`);
        SurvivorBotLogic(eventPlayer);
        AISpawnHandler.AssignAIEquipment(eventPlayer, TeamNameString.Survivors);
        ScoreboardUI.GlobalUpdate(TeamNameString.Survivors);
    },
    onDeathCallback: async (player: mod.Player, existingBotProfile: BotProfile) => {
        const playerObjId = mod.GetObjId(player);
        console.log(`survivorBotCallbacks | onDeathCallback | Bot(${playerObjId}) as Survivor(${existingBotProfile.playerName}) died!`);
        if (GameHandler.gameState === GameState.EndOfRound) {
            console.log('a bot was spawned during cleanup. Returning.');
            return;
        }
        // handle survivor count updates when killed to become alpha, or during the round when infected  
        if (GameHandler.gameState === GameState.GameRoundIsRunning || GameHandler.gameState === GameState.GameStartCountdown) {
            if (GameHandler.gameState === GameState.GameRoundIsRunning && !GameHandler.suspendWinChecks) {
                // only play sounds if win checks are not suspended (e.g., briefly after countdown/alpha selection)
                Helpers.PlaySoundFX(SFX_SURVIVOR_LOST, 1, SURVIVOR_TEAM);
                Helpers.PlaySoundFX(SFX_POSITIVE, 1, INFECTED_TEAM);
            }
            // increment persistent infectedCount only if we haven't already marked this bot as infected
            if (!existingBotProfile.isInfectedTeam) {
                existingBotProfile.isInfectedTeam = true;
                GameHandler.infectedCount = Math.min(INFECTED_COUNT_LIMIT, (GameHandler.infectedCount ?? 0) + 1);
                console.log(`survivorBotCallbacks | survivor converted to infected -> infectedCount: ${GameHandler.infectedCount}`);
                const pp = PlayerProfile.Get(player);
                if (pp) {
                    pp.isInfectedTeam = true;
                }
            }
            GameHandler.RecalculateCounts();
            GameHandler.DisplayUpdatedSurvivorCountNotification();
            if (GameHandler.survivorsCount === 5) {
                GameHandler.DisplayGameStateNotification(MakeMessage(mod.stringkeys.final_five));
            }
            GameHandler.CheckWinCondition();
        }

        let spawnerObjID = AISpawnHandler.GetSequentialInfectedSpawnerID(); // get the next value in a shuffled spawn array for infected
        const fallbackName = "infected_bot_name";
        if (!spawnerObjID)
            return;

        existingBotProfile.playerStats && existingBotProfile.playerStats.deaths++ && existingBotProfile.UpdatePlayerScoreboard(player);
        let botNameStringkey = BOT_NAME_MAP.get(spawnerObjID);
        const spawnerObj = mod.GetSpawner(spawnerObjID);
        let options: BotOptions = {
            playerName: botNameStringkey ? botNameStringkey : fallbackName,
            teamName: "infected",
            health: GameHandler.currentRound >= 6 ? 220 : 110,
            speedMultiplier: 1,
            spawnerObjID: spawnerObjID,
            spawnerObject: spawnerObj,
            isInitialSpawn: true, // becomes true since this is the first time they spawn as infected
            isInfectedTeam: true,
            isAlphaInfected: existingBotProfile.isAlphaInfected,
            playerStats: existingBotProfile.playerStats ?? INITIAL_STATS
        }

        let newBotProfile = BotProfile.GenerateBotParams(options);
        AISpawnHandler.AddToSpawnQueue(newBotProfile);
    },
    onHit: async () => {
    },
};

const infectedBotCallbacks: BotEventCallbacks = {
    onSpawnCallback: async (eventPlayer: mod.Player, botProfile: BotProfile) => {
        LogAlphaState('infectedBotCallbacks.onSpawnCallback | before indicator', eventPlayer, botProfile._playerProfile, botProfile);
        if (botProfile.isInitialSpawn) {
            GameHandler.RecalculateCounts();
            ScoreboardUI.GlobalUpdate(TeamNameString.Both);
            botProfile.isInitialSpawn = false;
        }
        AISpawnHandler.AssignAIEquipment(eventPlayer, TeamNameString.Infected);

        ShowAlphaInfectedIndicator(eventPlayer);
        ShowAlphaInfectedDebugIndicator(eventPlayer);
        InfectedIconDisplay(eventPlayer);
    },
    onDeathCallback: async (player: mod.Player, existingBotProfile: BotProfile) => {
        if (GameHandler.gameState !== GameState.GameRoundIsRunning) {
            return;
        }

        // get the next value in a shuffled spawn array for infected
        let spawnerObjID = AISpawnHandler.GetSequentialInfectedSpawnerID();
        if (!spawnerObjID)
            spawnerObjID = AISpawnHandler.GetRandomSpawnerID(TeamNameString.Infected);
        const spawnerObj = mod.GetSpawner(spawnerObjID);
        if (existingBotProfile.playerStats) {
            existingBotProfile.playerStats.deaths++;
            existingBotProfile.UpdatePlayerScoreboard(player);
        }
        let options: BotOptions = {
            playerName: existingBotProfile.playerName,
            teamName: TeamNameString.Infected,
            spawnerObjID: spawnerObjID,
            spawnerObject: spawnerObj,
            health: GameHandler.currentRound >= 6 ? 200 : 110,
            speedMultiplier: 0.9,
            isInitialSpawn: false,
            isInfectedTeam: true,
            isAlphaInfected: existingBotProfile.isAlphaInfected,
            playerStats: existingBotProfile.playerStats ?? INITIAL_STATS
        }
        let newBotProfile = BotProfile.GenerateBotParams(options);
        AISpawnHandler.AddToSpawnQueue(newBotProfile);
    },
    onHit: async () => { } // unused
};

class AISpawnHandler {
    /**
     * Map tracking BotProfiles awaiting spawn, keyed by spawnerObjID.
     * Used for direct O(1) lookup when OnBotSpawnFromSpawner is called.
     * @type {Map<number, BotProfile>}
     * 
     * @usage
     * - When ProcessBotSpawnQueue spawns a bot: spawnsInUse.set(botProfile.spawnerObjID, botProfile)
     * - When OnBotSpawnFromSpawner matches spawn: const botProfile = spawnsInUse.get(spawnerObjID)
     * - After successful match: spawnsInUse.delete(spawnerObjID)
     * 
     * @remarks
     * This Map provides fast lookups for linking newly spawned AI with their awaiting BotProfiles.
     * Replaces the previous Array<number> approach which required separate BotProfile lookups.
     */
    static spawnsInUse = new Map<number, BotProfile>();
    static awaitingSpawnQueue = new Array<BotProfile>();
    static shuffledInfectedSpawns = new Array<number>();
    static infectedSpawnIndex: number = 0;
    static isProcessingSpawnQueue: boolean = false;
    static startingInfectedChosen: boolean = false;
    static startingSurvivorsChosen: boolean = false;

    /**
     * Initializes the starting survivor spawn profiles and adds them to the spawn queue.
     * 
     * This method generates bot profiles for initial survivor spawns based on predefined spawner locations.
     * It ensures that starting survivors are only initialized once by checking the `startingSurvivorsChosen` flag.
     * Each survivor bot is configured with specific attributes including name, team, health, speed, and spawn location.
     * 
     * @param amountToSpawnOverride - Optional override for the number of survivors to spawn. 
     *                                 If not provided, defaults to `GameHandler.survivorSlotsToBackfill`.
     * 
     * @remarks
     * - This method will return early if starting survivors have already been chosen.
     * - Each bot is assigned a name from `BOT_NAME_MAP` based on their spawner object ID, 
     *   or falls back to "survivor_bot_name" if no mapping exists.
     * - All spawned survivors start with 50 health, 0.8 speed multiplier, and initial stats.
     * - The `startingSurvivorsChosen` flag is set to true after processing to prevent duplicate initialization.
     * 
     * @returns void
     */
    static InitializeStartingSurvivorSpawns(amountToSpawnOverride?: number): void {

        if (AISpawnHandler.startingSurvivorsChosen) {
            return;
        }
        let amountToSpawn = amountToSpawnOverride ? amountToSpawnOverride : GameHandler.survivorSlotsToBackfill;
        const generatedSpawnArray = Helpers.GenerateArray(amountToSpawn, SURVIVOR_AI_SPAWNERS[0]);
        for (let i = 0; i < amountToSpawn; i++) {
            const fallbackName = "survivor_bot_name";
            const spawnerObjID = generatedSpawnArray[i];
            const spawnerObj = mod.GetSpawner(spawnerObjID);
            let botNameStringkey = BOT_NAME_MAP.get(spawnerObjID);
            let botName = botNameStringkey ? botNameStringkey : fallbackName
            let options: BotOptions = {
                playerName: botName,
                teamName: "survivors",
                health: 50,
                speedMultiplier: 0.8,
                spawnerObjID: spawnerObjID,
                spawnerObject: spawnerObj,
                isInfectedTeam: false,
                isInitialSpawn: true,
                playerStats: INITIAL_STATS
            }
            let newBotProfile = BotProfile.GenerateBotParams(options)
            AISpawnHandler.AddToSpawnQueue(newBotProfile);
            AISpawnHandler.startingSurvivorsChosen = true;
        }
    }

    static InitializeStartingInfectedSpawns(amountToSpawn: number) {
        if (AISpawnHandler.startingInfectedChosen) {
            return;
        }
        const generatedSpawnArray = Helpers.GenerateArray(amountToSpawn, INFECTED_AI_SPAWNERS[0]);
        for (let i = 0; i < amountToSpawn; i++) {
            const fallbackName = "infected_bot_name";
            const spawnerObjID = generatedSpawnArray[i];
            const spawnerObj = mod.GetSpawner(spawnerObjID);
            let botNameStringkey = BOT_NAME_MAP.get(spawnerObjID);
            let botName = botNameStringkey ? botNameStringkey : fallbackName
            let options: BotOptions = {
                playerName: botName,
                teamName: TeamNameString.Infected,
                spawnerObjID: spawnerObjID,
                spawnerObject: spawnerObj,
                health: GameHandler.currentRound >= 6 ? 200 : 110,
                speedMultiplier: 0.9,
                isInitialSpawn: true,
                isInfectedTeam: true,
                playerStats: INITIAL_STATS
            }
            let newBotProfile = BotProfile.GenerateBotParams(options)
            AISpawnHandler.AddToSpawnQueue(newBotProfile);
            AISpawnHandler.startingInfectedChosen = true;
        }
    }
    static GetSequentialInfectedSpawnerID() {
        let tempArray: Array<number> = [...AISpawnHandler.shuffledInfectedSpawns];
        let spawnerObjID = tempArray.shift();

        if (!spawnerObjID) {
            let shuffledArray = Helpers.ShuffleArray([...INFECTED_AI_SPAWNERS]);
            AISpawnHandler.shuffledInfectedSpawns = shuffledArray;
            spawnerObjID = shuffledArray.shift();
            AISpawnHandler.shuffledInfectedSpawns = shuffledArray;
            return spawnerObjID;
        }
        AISpawnHandler.shuffledInfectedSpawns = tempArray;

        return spawnerObjID;
    }

    static GetRandomSpawnerID(teamName: string): number {
        const spawnMin = (teamName === TeamNameString.Survivors) ? SURVIVOR_AI_SPAWNERS[0] : INFECTED_AI_SPAWNERS[0];
        const spawnMax = (teamName === TeamNameString.Survivors) ? SURVIVOR_AI_SPAWNERS[SURVIVOR_AI_SPAWNERS.length - 1] : INFECTED_AI_SPAWNERS[INFECTED_AI_SPAWNERS.length - 1];
        let spawnerObjID = Helpers.GetRandomSpawnFromRange(spawnMin, spawnMax);

        return spawnerObjID;
    }

    static SpawnIndividualBot(botProfile: BotProfile) {
        if (!botProfile.spawnerObject || !botProfile.assignedTeamObj || !botProfile.playerName) {
            console.log(`SpawnIndividualBot | "CRITICAL ERROR" | One or more of the required props was missing! botProfile.spawnerObject, botProfile.assignedTeamObj, botProfile.playerName`);
            return;
        }
        const botName = MakeMessage(botProfile.playerName);
        mod.SpawnAIFromAISpawner(botProfile.spawnerObject, botProfile.soldierClass, botName, botProfile.assignedTeamObj);
        mod.SetUnspawnDelayInSeconds(botProfile.spawnerObject, 2);
    }

    static async ProcessBotSpawnQueue() {
        let availableSurvivorSpawns: number[] = [];
        let availableInfectedSpawns: number[] = [];

        if (AISpawnHandler.isProcessingSpawnQueue) {
            return;
        }
        if (!AISpawnHandler.awaitingSpawnQueue.length) {
            if (GameHandler.gameState === GameState.PreGame) {
            }
            return;
        }
        AISpawnHandler.isProcessingSpawnQueue = true;

        // verify spawns are open and separate them by team
        for (let i = 0; i < ALL_SPAWNS.length; i++) {
            if (!AISpawnHandler.spawnsInUse.has(ALL_SPAWNS[i])) {
                (i <= SURVIVOR_AI_SPAWNERS.length) ? availableSurvivorSpawns.push(ALL_SPAWNS[i]) : availableInfectedSpawns.push(ALL_SPAWNS[i]);
            } else {
            }
        }
        while (true) {
            if (
                GameHandler.gameState === GameState.PreGame ||
                GameHandler.gameState === GameState.GameStartCountdown ||
                GameHandler.gameState === GameState.GameRoundIsRunning
            ) {
                break;
            }
            await mod.Wait(2);
        }
        // begin spawning bots
        for (let i = 0; AISpawnHandler.awaitingSpawnQueue.length; i++) {
            const botAtIndex = AISpawnHandler.awaitingSpawnQueue.shift();
            if (botAtIndex && botAtIndex.spawnerObjID) {
                AISpawnHandler.spawnsInUse.set(botAtIndex.spawnerObjID, botAtIndex);
                AISpawnHandler.SpawnIndividualBot(botAtIndex);
            }
        }
        AISpawnHandler.isProcessingSpawnQueue = false;
        return;
    }

    static async OnGoingSpawnerCheck() {
        if (GameHandler.isSpawnCheckRunning) {
            return;
        }
        GameHandler.isSpawnCheckRunning = true;
        while (true) {
            if (GameHandler.gameState !== GameState.GameRoundIsRunning) {
                GameHandler.isSpawnCheckRunning = false;
                return;
            }
            await mod.Wait(GameHandler.survivorsCount === 1 ? INFECTED_RESPAWN_TIME : INFECTED_RESPAWN_TIME_LAST_MAN);
            AISpawnHandler.ProcessBotSpawnQueue();
        }
    }

    static async AssignAIEquipment(player: mod.Player, teamString: string) {
        if (!PlayerIsAliveAndValid(player)) return

        try {
            mod.RemoveEquipment(player, mod.InventorySlots.PrimaryWeapon);
            mod.RemoveEquipment(player, mod.InventorySlots.SecondaryWeapon);
            mod.RemoveEquipment(player, mod.InventorySlots.GadgetOne);
            mod.RemoveEquipment(player, mod.InventorySlots.GadgetTwo);
            mod.RemoveEquipment(player, mod.InventorySlots.Throwable);
            mod.RemoveEquipment(player, mod.InventorySlots.ClassGadget);
        } catch (e) {
            console.log(`AssignAIEquipment | removal error for Player(${mod.GetObjId(player)}): ${e}`);
        }

        const playerProfile = PlayerProfile.Get(player);
        if (playerProfile) {
            playerProfile.isInfectedTeam = teamString === TeamNameString.Infected;
            InitializePlayerEquipment(player, playerProfile);
        }
    }
    /**
     * Handles bot spawn events from a spawner object and matches newly spawned AI with awaiting BotProfiles.
     * 
     * This method is called when an AI soldier spawns from a spawner in the game.
     * It retrieves the corresponding BotProfile from spawnsInUse by spawnerObjID and 
     * establishes the link between the spawned AI (Player) and its BotProfile/PlayerProfile.
     * 
     * @param eventPlayer - The player object representing the spawned bot
     * @param spawnerObjID - The object ID of the spawner that created this bot; used as lookup key in spawnsInUse
     * 
     * @returns A promise that resolves when spawn handling is complete
     * 
     * @flow
     * 1. Get ObjID: Retry logic (15 attempts, 0.15s intervals) to retrieve player ObjID
     * 2. Lookup BotProfile: Direct retrieval from spawnsInUse Map using spawnerObjID as key
     *    - Primary: spawnsInUse.get(spawnerObjID) - O(1) direct lookup
     *    - Fallback: BotProfile.GetBySpawner(spawnerObjID) if not in awaiting queue
     * 3. Retrieve/Create PlayerProfile: PlayerProfile.Get() establishes player record
     * 4. Sync State: Update PlayerProfile from BotProfile (team, initialSpawn, spawnerObjID)
     * 5. Link Profiles: Set bidirectional references between BotProfile and PlayerProfile
     * 6. Initialize: Call botProfile.InitBehavior() with synced profile data
     * 
     * @remarks
     * - Skips processing if the player is not an AI soldier or if round has ended
     * - spawnsInUse is a Map<number, BotProfile> that tracks BotProfiles awaiting spawn
     * - BotProfile is the authoritative source of truth for team, callbacks, and spawn state
     * - Successfully matched bots are removed from spawnsInUse via .delete(spawnerObjID)
     * - Fallback lookup handles unexpected spawns or edge cases where timing issues occur
     * - All profile synchronization flows from BotProfile -> PlayerProfile (one-way)
     * 
     * @see AISpawnHandler.ProcessBotSpawnQueue - Populates spawnsInUse with BotProfiles to spawn
     * @see BotProfile.GetBySpawner - Legacy lookup method used as fallback
     */
    static async OnBotSpawnFromSpawner(eventPlayer: mod.Player, spawnerObjID: number) {

        if (!mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier) ||
            GameHandler.gameState === GameState.EndOfRound) {
            return;
        }

        // Retry logic for game engine timing - ObjID assignment may be delayed
        let playerObjID = await Helpers.GetObjIdWithRetry(eventPlayer, 4, 0.15);
        if (playerObjID === -1) {
            return;
        }

        // === RETRIEVE AUTHORITATIVE BOT PROFILE FROM SPAWNS AWAITING SPAWN ===
        // Look up the BotProfile by spawnerObjID from spawnsInUse to match newly spawned AI
        let botProfile = AISpawnHandler.spawnsInUse.get(spawnerObjID);

        if (botProfile) {
            // Successfully matched BotProfile with spawned AI - remove from spawnsInUse
            AISpawnHandler.spawnsInUse.delete(spawnerObjID);
        } else {
            if (!botProfile) {
                console.log(`OnBotSpawnFromSpawner "CRITICAL ERROR" | BotProfile not found for Player(${playerObjID}) at spawnerObjID(${spawnerObjID})`);
                return;
            }
        }

        // botProfile is now guaranteed to be defined (either from spawnsInUse or fallback lookup)
        const resolvedBotProfile = botProfile;

        // === GET OR CREATE PLAYER PROFILE ===
        const playerProfile = PlayerProfile.Get(eventPlayer, spawnerObjID);

        if (!playerProfile) {
            console.log(`OnBotSpawnFromSpawner "CRITICAL ERROR" | PlayerProfile creation failed for Player(${playerObjID})`);
            return;
        }

        // === SYNC FROM BOT PROFILE (authoritative source of truth) ===

        // 1. Team flag: sync from BotProfile -> PlayerProfile
        if (playerProfile.isInfectedTeam !== resolvedBotProfile.isInfectedTeam) {
            playerProfile.isInfectedTeam = resolvedBotProfile.isInfectedTeam;
        }

        // 2. Initial spawn flag: sync from BotProfile -> PlayerProfile (BotProfile is source of truth for spawn lifecycle)
        if (playerProfile.isInitialSpawn !== resolvedBotProfile.isInitialSpawn) {
            playerProfile.isInitialSpawn = resolvedBotProfile.isInitialSpawn;
        }

        // 3. Ensure spawnerObjID is set on PlayerProfile for reference
        if (playerProfile.spawnerObjID !== spawnerObjID) {
            playerProfile.spawnerObjID = spawnerObjID;
        }

        // 4. Alpha infected flag: sync from BotProfile -> PlayerProfile
        if (playerProfile.isAlphaInfected !== resolvedBotProfile.isAlphaInfected) {
            playerProfile.isAlphaInfected = resolvedBotProfile.isAlphaInfected;
        }
        LogAlphaState('OnBotSpawnFromSpawner | post-sync', eventPlayer, playerProfile, resolvedBotProfile);

        // Update player references in BotProfile
        resolvedBotProfile._playerObjID = playerObjID;
        resolvedBotProfile._player = eventPlayer;
        resolvedBotProfile._playerProfile = playerProfile;

        // Update player references and flags
        playerProfile.playerID = playerObjID;
        playerProfile.player = eventPlayer;
        playerProfile._botProfile = resolvedBotProfile;
        playerProfile.isDead = false;

        // Update PlayerProfile in maps
        PlayerProfile._allPlayers.set(playerObjID, playerProfile);

        // Track deployed PlayerProfile during active gameplay
        PlayerProfile._deployedPlayers.set(playerObjID, playerProfile);


        // Cache the bot in _allAI by playerObjID
        BotProfile._allAI.set(playerObjID, resolvedBotProfile);

        // Initialize behavior using the synced, authoritative bot profile
        resolvedBotProfile.InitBehavior(eventPlayer, playerProfile);
        return;
    }

    static AddToSpawnQueue(botProfile: BotProfile) {
        AISpawnHandler.awaitingSpawnQueue.push(botProfile);
        return;
    }
}
//////////////////////////////////////////////////////////////////
///////------------------- BOT LOGIC  ------------------//////////
//////////////////////////////////////////////////////////////////


function PlayerIsAliveAndValid(eventPlayer: mod.Player): boolean {
    if (!eventPlayer || !mod.IsPlayerValid(eventPlayer)) return false;
    return SafeIsAlive(eventPlayer);
}


async function SurvivorBotLogic(survivorBot: mod.Player) {
    while (GameHandler.gameState !== GameState.GameRoundIsRunning) {
        await mod.Wait(0.5);
        if (GameHandler.gameState === GameState.EndOfRound) {
            return;
        }
    }

    let survivorBotAliveandValid = PlayerIsAliveAndValid(survivorBot);

    const pickRandomResupply = (): mod.Vector | undefined => {
        const randIndex = Math.floor(Math.random() * RESUPPLY_INTERACT_POINTS.length);
        const randSupplyPoint = RESUPPLY_INTERACT_POINTS[randIndex];
        return RESUPPLY_WORLD_LOCATION.get(randSupplyPoint);
    }
    if (survivorBotAliveandValid && survivorBot !== undefined) {
        await mod.Wait(Math.floor(Math.random() * (5 - 2 + 1)) + 2); // wait between 2 and 5 seconds
        survivorBotAliveandValid = PlayerIsAliveAndValid(survivorBot);
        mod.AIDefendPositionBehavior(survivorBot, pickRandomResupply()!, AI_MIN_DEF_RANGE, AI_LEASH_RANGE);
    }
}

/** Check whether a player is riding in the tracked vehicle. */
function IsPlayerInTrackedVehicle(player: mod.Player): boolean {
    if (!SPAWNED_ACTIVE_VEHICLE) return false;
    if (!mod.IsVehicleOccupied(SPAWNED_ACTIVE_VEHICLE)) return false;
    const riders = mod.GetAllPlayersInVehicle(SPAWNED_ACTIVE_VEHICLE);
    const count = mod.CountOf(riders);
    for (let i = 0; i < count; i++) {
        if (mod.GetObjId(mod.ValueInArray(riders, i) as mod.Player) === mod.GetObjId(player)) {
            return true;
        }
    }
    return false;
}

/** Allocate or update a debug world icon that follows an infected bot.
 *  Color is determined by chase state: vehicle vs on-foot, melee vs chasing. */
function UpdateDebugChaseIcon(
    infectedBot: mod.Player,
    targetPos: mod.Vector | undefined,
    targetInVehicle: boolean,
    inMeleeRange: boolean,
) {
    if (!DEBUG_INFECTED_CHASE_ICONS) return;
    const botObjId = mod.GetObjId(infectedBot);
    if (botObjId < 0) return;

    // Lazily create a world icon for this bot
    let icon = DEBUG_CHASE_ICON_MAP.get(botObjId);
    if (!icon) {
        icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, GetIconPosition(infectedBot), ZERO_VEC);
        icon = mod.GetWorldIcon(DEBUG_CHASE_ICON_NEXT_ID++);
        mod.SetWorldIconImage(icon, mod.WorldIconImages.FilledPing);
        // 
        mod.EnableWorldIconImage(icon, true);
        mod.EnableWorldIconText(icon, false);
        DEBUG_CHASE_ICON_MAP.set(botObjId, icon);
    }

    // Position the icon above the bot
    const botPos = mod.GetSoldierState(infectedBot, mod.SoldierStateVector.GetPosition);
    const iconPos = mod.CreateVector(
        mod.XComponentOf(botPos),
        mod.YComponentOf(botPos) + 3,
        mod.ZComponentOf(botPos)
    );
    mod.SetWorldIconPosition(icon, iconPos);

    // Pick color based on chase state
    let color: mod.Vector;
    if (!targetPos) {
        color = DEBUG_COLOR_NO_TARGET;
    } else if (targetInVehicle) {
        color = inMeleeRange ? DEBUG_COLOR_VEHICLE_MELEE : DEBUG_COLOR_VEHICLE_CHASE;
    } else {
        color = inMeleeRange ? DEBUG_COLOR_ONFOOT_MELEE : DEBUG_COLOR_ONFOOT_CHASE;
    }
    mod.SetWorldIconColor(icon, color);
}

/** Remove the debug chase icon for a bot that is no longer alive. */
function CleanupDebugChaseIcon(botObjId: number) {
    if (!DEBUG_INFECTED_CHASE_ICONS) return;
    const icon = DEBUG_CHASE_ICON_MAP.get(botObjId);
    if (icon) {
        // Move the icon far below the map to hide it (no destroy API)
        mod.SetWorldIconPosition(icon, mod.CreateVector(0, -1000, 0));
        mod.EnableWorldIconImage(icon, false);
        DEBUG_CHASE_ICON_MAP.delete(botObjId);
    }
}

function InfectedBotLogicTick(infectedBot: mod.Player, tickState: {
    infectedBotInitialized?: boolean,
    infectedBotTarget?: mod.Player,
    nextInfectedBotTickAt?: number,
    infectedBotLastMoveIssuedAt?: number,
    infectedBotLastMovePos?: mod.Vector,
}) {

    // Gate: only run during active round with a valid, alive bot
    if (GameHandler.gameState !== GameState.GameRoundIsRunning) return;
    if (!PlayerIsAliveAndValid(infectedBot)) return;

    // One-time setup on first tick after spawn
    if (!tickState.infectedBotInitialized) {
        mod.AIEnableTargeting(infectedBot, false);
        mod.RemoveEquipment(infectedBot, mod.InventorySlots.ClassGadget);
        tickState.infectedBotInitialized = true;
        tickState.infectedBotLastMoveIssuedAt = 0;
        tickState.infectedBotLastMovePos = undefined;
    }

    const now = Date.now() / 1000;
    const botPlayerProfile = PlayerProfile.Get(infectedBot);

    const getAssignedSpeedMultiplier = (): number => {
        return botPlayerProfile?._botProfile?.speedMultiplier ?? 1;
    };

    // Pick the closest alive survivor
    const pickClosestAliveSurvivor = (): mod.Player | undefined => {
        const all = mod.AllPlayers();
        const n = mod.CountOf(all);
        let best: mod.Player | undefined = undefined;
        let bestDist = Number.MAX_VALUE;
        const botPos = mod.GetSoldierState(infectedBot, mod.SoldierStateVector.GetPosition);
        for (let i = 0; i < n; i++) {
            const survivorPlayer = mod.ValueInArray(all, i) as mod.Player;
            if (!PlayerIsAliveAndValid(survivorPlayer)) continue;
            if (mod.GetObjId(mod.GetTeam(survivorPlayer)) !== mod.GetObjId(SURVIVOR_TEAM)) continue;
            const survPos = mod.GetSoldierState(survivorPlayer, mod.SoldierStateVector.GetPosition);
            const d = mod.DistanceBetween(botPos, survPos);
            if (d < bestDist) {
                bestDist = d;
                best = survivorPlayer;
            }
        }
        return best;
    };

    // Re-evaluate target: pick closest survivor, or fall back to HQ march.
    // If the current target is in the tracked vehicle, keep them (stickiness)
    // to avoid oscillating when the vehicle moves fast.
    let target = tickState.infectedBotTarget;
    const currentTargetInVehicle = target ? IsPlayerInTrackedVehicle(target) : false;

    if (!target || !PlayerIsAliveAndValid(target)) {
        target = pickClosestAliveSurvivor();
        tickState.infectedBotTarget = target;
    } else if (!currentTargetInVehicle) {
        // Only re-evaluate closest when the current target is NOT in the vehicle
        const closest = pickClosestAliveSurvivor();
        if (closest && mod.GetObjId(closest) !== mod.GetObjId(target)) {
            target = closest;
            tickState.infectedBotTarget = target;
            tickState.infectedBotLastMoveIssuedAt = 0;
            tickState.infectedBotLastMovePos = undefined;
        }
    }

    if (!target) {
        if (botPlayerProfile) {
            botPlayerProfile.currentTarget = undefined;
        }
        if (botPlayerProfile?.infectedAreaSpeedBoostActive && botPlayerProfile._botProfile) {
            botPlayerProfile._botProfile.speedMultiplier = 2;
            mod.SetPlayerMovementSpeedMultiplier(infectedBot, 2);
        }
        // couldn't find target for whatever reason, wander around
        mod.AIBattlefieldBehavior(infectedBot);
        tickState.infectedBotLastMovePos = undefined;
        UpdateDebugChaseIcon(infectedBot, undefined, false, false);
        return;
    }

    if (botPlayerProfile) {
        botPlayerProfile.currentTarget = target;
    }

    mod.AISetTarget(infectedBot, target);

    // Resolve target position: if target is in the tracked vehicle, use the
    // vehicle position from GetVehicleState so the bot chases the vehicle
    // rather than the (possibly jittery) soldier position.
    const targetInVehicle = IsPlayerInTrackedVehicle(target);
    const infectedBotPos = mod.GetSoldierState(infectedBot, mod.SoldierStateVector.GetPosition);
    const targetPos = targetInVehicle && SPAWNED_ACTIVE_VEHICLE
        ? mod.GetVehicleState(SPAWNED_ACTIVE_VEHICLE, mod.VehicleStateVector.VehiclePosition)
        : mod.GetSoldierState(target, mod.SoldierStateVector.GetPosition);
    if (botPlayerProfile?.infectedAreaSpeedBoostActive && botPlayerProfile._botProfile) {
        botPlayerProfile._botProfile.speedMultiplier = targetInVehicle ? 4 : 2;
    }
    const dist = mod.DistanceBetween(infectedBotPos, targetPos);
    mod.SetPlayerMovementSpeedMultiplier(infectedBot, getAssignedSpeedMultiplier());

    // When the target is in the vehicle, focus the bot on the vehicle body
    // so it attacks the vehicle itself rather than pathing to the driver door.
    if (targetInVehicle && SPAWNED_ACTIVE_VEHICLE) {
        mod.AISetFocusPoint(infectedBot, targetPos, true);
    }

    // Use a wider attack radius for vehicle targets so the bot can swing
    // while still sprinting alongside the vehicle instead of decelerating
    // to reach the driver-side door.
    const meleeRange = targetInVehicle ? AI_VEHICLE_MELEE_DISTANCE : AI_INFECTED_MELEE_DISTANCE;

    if (dist <= meleeRange) {
        // In melee range -- attack while continuing to sprint toward vehicle
        mod.AIEnableTargeting(infectedBot, true);
        mod.AIEnableShooting(infectedBot, true);
        mod.AISetMoveSpeed(infectedBot, mod.MoveSpeed.Sprint);
        mod.AIMoveToBehavior(infectedBot, targetPos);
        mod.AIForceFire(infectedBot, 0.5);
        tickState.infectedBotLastMoveIssuedAt = now;
        tickState.infectedBotLastMovePos = targetPos;
    } else {
        // Out of melee range -- sprint toward target with throttled move commands
        // to prevent stutter-stepping when the target is in a fast vehicle.
        mod.AIEnableTargeting(infectedBot, true);
        mod.AISetMoveSpeed(infectedBot, mod.MoveSpeed.Sprint);

        const reissueCooldown = targetInVehicle
            ? AI_VEHICLE_MOVE_REISSUE_SECONDS
            : AI_DEFAULT_MOVE_REISSUE_SECONDS;

        const timeSinceLastMove = now - (tickState.infectedBotLastMoveIssuedAt ?? 0);
        const shouldReissueMove = timeSinceLastMove >= reissueCooldown
            || !tickState.infectedBotLastMovePos;

        if (shouldReissueMove) {
            mod.AIMoveToBehavior(infectedBot, targetPos);
            tickState.infectedBotLastMoveIssuedAt = now;
            tickState.infectedBotLastMovePos = targetPos;
        }
    }

    // Update debug chase-state icon
    UpdateDebugChaseIcon(infectedBot, targetPos, targetInVehicle, dist <= meleeRange);
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

function GetVector3Distance(a: Vector3, b: Vector3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;

    return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function CompareHQPositions(requestedHQPos: Vector3, threshold: number = CURRENT_MAP_HQ_POSITION_THRESHOLD): MapNames | undefined {
    for (const [identifier, hqInfo] of HQPOSITIONS.entries()) {
        if (GetVector3Distance(requestedHQPos, hqInfo.position) <= threshold) {
            return identifier;
        }
    }
    return undefined;
}

function CompareResupplyPositions(mapIdentifier: MapNames, threshold: number = CURRENT_MAP_RESUPPLY_POSITION_THRESHOLD): boolean {
    const mapConfig = RESUPPLY_CONFIG_BY_MAP.get(mapIdentifier);
    if (!mapConfig) {
        return false;
    }

    for (const [interactPointId, expectedPosition] of mapConfig.positionsByInteractPoint.entries()) {
        const interactPoint = mod.GetInteractPoint(interactPointId);
        if (mod.GetObjId(interactPoint) !== interactPointId) {
            return false;
        }

        const polledPosition = Helpers.VectorToVector3(mod.GetObjectPosition(interactPoint));
        if (GetVector3Distance(polledPosition, expectedPosition) > threshold) {
            return false;
        }
    }

    return true;
}

function GetCurrentMap(): MapNames | undefined {
    const hqPosition = mod.GetObjectPosition(mod.GetHQ(1));
    const mapIdentifier = CompareHQPositions(Helpers.VectorToVector3(hqPosition));
    if (!mapIdentifier) {
        return undefined;
    }

    if (!CompareResupplyPositions(mapIdentifier)) {
        return undefined;
    }

    CURRENT_MAP = mapIdentifier;
    ConfigureResupplyForMap(mapIdentifier);

    return mapIdentifier;
}

async function WaitForCurrentMapGate(showStatusToast: boolean): Promise<MapNames> {
    let count = 0;
    const timeoutSeconds = WAIT_FOR_MAP_GATE_TIMEOUT_SECONDS;
    const startTime = Date.now();
    
    while (true) {
        const mapIdentifier = GetCurrentMap();
        if (mapIdentifier) {
            console.log(`WaitForCurrentMapGate | Map verified from HQ and resupply positions: ${mapIdentifier}`);
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
            return mapIdentifier;
        }

        const elapsedSeconds = (Date.now() - startTime) / 1000;
        if (elapsedSeconds > timeoutSeconds) {
            console.log(`WaitForCurrentMapGate | TIMEOUT after ${timeoutSeconds}s. Could not verify map position.`);
            const hqPos = Helpers.VectorToVector3(mod.GetObjectPosition(mod.GetHQ(1)));
            console.log(`WaitForCurrentMapGate | Actual HQ position: x=${hqPos.x}, y=${hqPos.y}, z=${hqPos.z}`);
            console.log(`WaitForCurrentMapGate | Expected positions:\nNEXUS=(${NEXUS_SURVIVOR_HQ.position.x},${NEXUS_SURVIVOR_HQ.position.y},${NEXUS_SURVIVOR_HQ.position.z}),\nSAND=(${SAND_SURVIVOR_HQ.position.x},${SAND_SURVIVOR_HQ.position.y},${SAND_SURVIVOR_HQ.position.z}),\nSAND2=(${SAND2_SURVIVOR_HQ.position.x},${SAND2_SURVIVOR_HQ.position.y},${SAND2_SURVIVOR_HQ.position.z})`);
        }

        if (showStatusToast) {
            const waitMessage = MakeMessage(mod.stringkeys.waiting_hq_position, count);
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
    if (isInfected) {
        mod.SetPlayerMovementSpeedMultiplier(eventPlayer, playerProfile.isAlphaInfected ? 1.2 : 1);
        mod.SetPlayerIncomingDamageFactor(eventPlayer, playerProfile.isAlphaInfected ? 2 : 50);
        mod.SetPlayerMaxHealth(eventPlayer, playerProfile.isAlphaInfected ? 500 : 250);
    } else {
        mod.SetPlayerMovementSpeedMultiplier(eventPlayer, playerProfile.isLastManStanding ? 1.1 : 1);
        mod.SetPlayerIncomingDamageFactor(eventPlayer, playerProfile.isLastManStanding ? 70 : 100);
        mod.SetPlayerMaxHealth(eventPlayer, playerProfile.isLastManStanding ? 240 : 60);
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
    await mod.Wait(ROUND_DURATION * 0.95);
    for (let i = 0; i < RESUPPLY_WORLD_ICONS.length; i++) {
        const worldIcon = mod.GetWorldIcon(RESUPPLY_WORLD_ICONS[i]);
        mod.EnableWorldIconText(worldIcon, false);
        mod.EnableWorldIconImage(worldIcon, false);
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

function InfectedIconDisplay(player: mod.Player) {
    EnsureInfectedWorldIcon(player);
}

async function ShowLastManStandingIcon(player: mod.Player) {
    EnsureLastManStandingWorldIcon(player);
}

function ShowAlphaInfectedIndicator(player: mod.Player) {
    const playerProfile = PlayerProfile.Get(player);
    if (!playerProfile || !playerProfile.isAlphaInfected) {
        LogAlphaState('ShowAlphaInfectedIndicator | skipped: not alpha', player, playerProfile);
        return;
    }
    if (GameHandler.gameState !== GameState.GameRoundIsRunning) {
        LogAlphaState('ShowAlphaInfectedIndicator | skipped: invalid state', player, playerProfile);
        return;
    }
    if (mod.GetObjId(mod.GetTeam(player)) !== mod.GetObjId(INFECTED_TEAM)) {
        LogAlphaState('ShowAlphaInfectedIndicator | skipped: not infected team', player, playerProfile);
        return;
    }
    if (!SafeIsAlive(player)) {
        LogAlphaState('ShowAlphaInfectedIndicator | skipped: not alive', player, playerProfile);
        return;
    }

    const playerObjId = mod.GetObjId(player);
    if (playerObjId < 0) {
        LogAlphaState('ShowAlphaInfectedIndicator | skipped: invalid objId', player, playerProfile);
        return;
    }

    const previousToken = ALPHA_INDICATOR_TOKENS.get(playerObjId);
    if (previousToken) {
        previousToken.cancel = true;
        LogAlphaState('ShowAlphaInfectedIndicator | canceled previous token', player, playerProfile);
    }
    const verticalOffset = 1.4;
    const forwardOffset = 0.3;
    let playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    let facingDir = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);
    let vfxPos = mod.CreateVector(
        mod.XComponentOf(playerPos) + (mod.XComponentOf(facingDir) * forwardOffset),
        mod.YComponentOf(playerPos) + verticalOffset + (mod.YComponentOf(facingDir) * forwardOffset),
        mod.ZComponentOf(playerPos) + (mod.ZComponentOf(facingDir) * forwardOffset)
    );
    let alphaIndicatorVFX = mod.SpawnObject(ALPHA_INDICATOR_FLAME_VFX, vfxPos, ZERO_VEC);
    mod.EnableVFX(alphaIndicatorVFX, true);
    mod.SetVFXScale(alphaIndicatorVFX, 2);
    mod.SetVFXColor(alphaIndicatorVFX, UI.battlefieldBlue);
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
                vfxPos = mod.CreateVector(
                    mod.XComponentOf(playerPos) + (mod.XComponentOf(facingDir) * forwardOffset),
                    mod.YComponentOf(playerPos) + verticalOffset + (mod.YComponentOf(facingDir) * forwardOffset),
                    mod.ZComponentOf(playerPos) + (mod.ZComponentOf(facingDir) * forwardOffset)
                );
                mod.MoveVFX(alphaIndicatorVFX, vfxPos, ZERO_VEC);
                await mod.Wait(0.05);
            }
        } finally {
            const trackedToken = ALPHA_INDICATOR_TOKENS.get(playerObjId);
            if (trackedToken === token) {
                ALPHA_INDICATOR_TOKENS.delete(playerObjId);
            }
            mod.EnableVFX(alphaIndicatorVFX, false);
            mod.UnspawnObject(alphaIndicatorVFX);
            LogAlphaState('ShowAlphaInfectedIndicator | removed indicator', player, PlayerProfile.Get(player));
        }
    }

    updateAlphaIndicatorVFX();
}

function ShowAlphaInfectedDebugMoveIndicator(player: mod.Player) {
    const playerObjId = mod.GetObjId(player);
    if (playerObjId < 0) return;

    const playerProfile = PlayerProfile.Get(player);
    const shouldShow = DEBUG_ALPHA_DEBUG_MOVE_INDICATOR
        && !!playerProfile
        && playerProfile.isAlphaInfected
        && GameHandler.gameState === GameState.GameRoundIsRunning
        && SafeIsAlive(player)
        && mod.GetObjId(mod.GetTeam(player)) === mod.GetObjId(INFECTED_TEAM);

    if (!shouldShow) {
        const previousToken = ALPHA_DEBUG_INDICATOR_TOKENS.get(playerObjId);
        if (previousToken) {
            previousToken.cancel = true;
            ALPHA_DEBUG_INDICATOR_TOKENS.delete(playerObjId);
        }
        return;
    }

    if (ALPHA_DEBUG_INDICATOR_TOKENS.has(playerObjId)) {
        return;
    }

    const verticalOffset = 1.4;
    const forwardOffset = 0.1;
    let playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    let facingDir = mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection);
    let vfxPos = mod.CreateVector(
        mod.XComponentOf(playerPos) + (mod.XComponentOf(facingDir) * forwardOffset),
        mod.YComponentOf(playerPos) + verticalOffset - (mod.YComponentOf(facingDir) * forwardOffset),
        mod.ZComponentOf(playerPos) + (mod.ZComponentOf(facingDir) * forwardOffset)
    );

    const alphaIndicatorMoveVFX = mod.SpawnObject(ALPH_INDICATOR_BLINKING_FIRE_VFX, vfxPos, ZERO_VEC);
    mod.EnableVFX(alphaIndicatorMoveVFX, true);
    LogAlphaState('ShowAlphaInfectedDebugMoveIndicator | spawned debug indicator', player, playerProfile);

    const token = { cancel: false };
    ALPHA_DEBUG_INDICATOR_TOKENS.set(playerObjId, token);

    const updateAlphaDebugMoveVFX = async () => {
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
                vfxPos = mod.CreateVector(
                    mod.XComponentOf(playerPos) + (mod.XComponentOf(facingDir) * forwardOffset),
                    mod.YComponentOf(playerPos) + verticalOffset + (mod.YComponentOf(facingDir) * forwardOffset),
                    mod.ZComponentOf(playerPos) + (mod.ZComponentOf(facingDir) * forwardOffset)
                );
                mod.MoveVFX(alphaIndicatorMoveVFX, vfxPos, ZERO_VEC);
                await mod.Wait(0.05);
            }
        } finally {
            const trackedToken = ALPHA_DEBUG_INDICATOR_TOKENS.get(playerObjId);
            if (trackedToken === token) {
                ALPHA_DEBUG_INDICATOR_TOKENS.delete(playerObjId);
            }
            mod.EnableVFX(alphaIndicatorMoveVFX, false);
            mod.UnspawnObject(alphaIndicatorMoveVFX);
            LogAlphaState('ShowAlphaInfectedDebugMoveIndicator | removed debug indicator', player, PlayerProfile.Get(player));
        }
    }

    updateAlphaDebugMoveVFX();
}

function ShowAlphaInfectedDebugIndicator(player: mod.Player) {
    if (!DEBUG_ALPHA_DEBUG_MOVE_INDICATOR) return;
    ShowAlphaInfectedDebugMoveIndicator(player);
}

function CleanupWorldIcon(iconMap: Map<number, mod.Any>, playerObjId: number, context: string) {
    const existingIcon = iconMap.get(playerObjId);
    if (!existingIcon) return;
    try {
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

function EnsureInfectedWorldIcon(player: mod.Player) {
    const playerObjId = mod.GetObjId(player);
    if (playerObjId < 0) return;

    const shouldShow = DEBUG
        && GameHandler.gameState === GameState.GameRoundIsRunning
        && GameHandler.survivorsCount <= 1
        && SafeIsAlive(player)
        && mod.GetObjId(mod.GetTeam(player)) === mod.GetObjId(INFECTED_TEAM);

    if (!shouldShow) {
        CleanupWorldIcon(INFECTED_WORLD_ICON_OBJECTS, playerObjId, 'EnsureInfectedWorldIcon');
        return;
    }

    if (INFECTED_WORLD_ICON_OBJECTS.has(playerObjId)) return;

    const icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, GetIconPosition(player), ZERO_VEC);
    mod.SetWorldIconOwner(icon, SURVIVOR_TEAM);
    mod.SetWorldIconImage(icon, mod.WorldIconImages.Skull);
    mod.SetWorldIconColor(icon, UI.battlefieldRedBg);
    mod.EnableWorldIconImage(icon, true);
    INFECTED_WORLD_ICON_OBJECTS.set(playerObjId, icon);
}

function EnsureLastManStandingWorldIcon(player: mod.Player) {
    const playerObjId = mod.GetObjId(player);
    if (playerObjId < 0) return;

    const playerProfile = PlayerProfile.Get(player);
    const shouldShow = !!playerProfile
        && playerProfile.isLastManStanding
        && GameHandler.gameState === GameState.GameRoundIsRunning
        && SafeIsAlive(player)
        && mod.GetObjId(mod.GetTeam(player)) === mod.GetObjId(SURVIVOR_TEAM);

    if (!shouldShow) {
        CleanupWorldIcon(LMS_WORLD_ICON_OBJECTS, playerObjId, 'EnsureLastManStandingWorldIcon');
        return;
    }

    if (LMS_WORLD_ICON_OBJECTS.has(playerObjId)) return;

    const icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, GetIconPosition(player), ZERO_VEC);
    mod.SetWorldIconOwner(icon, INFECTED_TEAM);
    mod.SetWorldIconImage(icon, mod.WorldIconImages.Skull);
    mod.SetWorldIconColor(icon, UI.battlefieldWhite);
    mod.EnableWorldIconImage(icon, true);
    LMS_WORLD_ICON_OBJECTS.set(playerObjId, icon);
    console.log(`EnsureLastManStandingWorldIcon | Showing LMS icon for Player(${playerObjId})`);
}

function UpdatePlayerIndicatorsAndIcons(player: mod.Player) {
    const playerObjId = mod.GetObjId(player);
    if (playerObjId < 0) return;

    EnsureInfectedWorldIcon(player);
    EnsureLastManStandingWorldIcon(player);
    ShowAlphaInfectedDebugIndicator(player);

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
    CleanupDebugChaseIcon(playerObjId);
    const moveVfxToken = ALPHA_DEBUG_INDICATOR_TOKENS.get(playerObjId);
    if (moveVfxToken) {
        moveVfxToken.cancel = true;
        ALPHA_DEBUG_INDICATOR_TOKENS.delete(playerObjId);
    }
    PLAYER_ONGOING_TICK_STATE.delete(playerObjId);
}


function CheckForBannedWeapons(player: mod.Player) {
    if (!mod.IsPlayerValid(player) || !PlayerProfile.isValidPlayer(player)) {
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
    if (playerProfile.isInfectedTeam && !GameHandler.suspendWinChecks) {
        const bannedWeaponMessage = MakeMessage(mod.stringkeys.banned_weapon_removed, player);
        Helpers.PlaySoundFX(SFX_ACTION_BLOCKED, 1);
        mod.ForceSwitchInventory(player, mod.InventorySlots.MeleeWeapon);
        for (let player of PlayerProfile._allPlayerProfiles) {
            player.ShowAlphaFeedback(bannedWeaponMessage); // shame message to all players
        }
    }
    return true;
}

//////////////////////////////////////////////////////////////////
///////---------------- GAME FUNCTIONS -----------------//////////
//////////////////////////////////////////////////////////////////

// planned to use custom ladder logic for the AI infected, but never finished it
export async function OnAIMoveToFailed(eventPlayer: mod.Player) {
    if (!mod.IsPlayerValid(eventPlayer) || !ENABLE_AI_LADDER_LOGIC) {
        if (mod.GetObjId(mod.GetTeam(eventPlayer)) === mod.GetObjId(SURVIVOR_TEAM)) {
            console.log(`OnAIMoveToFailed | Survivor Bot(${mod.GetObjId(eventPlayer)}) move to failed - reverting to idle behavior`);
            mod.AIIdleBehavior(eventPlayer);
        }
        return;
    }
    // if (mod.GetObjId(mod.GetTeam(eventPlayer)) === mod.GetObjId(INFECTED_TEAM)) {
    //     const objId = mod.GetObjId(eventPlayer);
    //     console.log(`OnAIMoveToFailed | Infected Bot(${objId}) switching to ladder logic`);
    //     const playerProfile = PlayerProfile.Get(eventPlayer);

    //     // Flag the tick-driven logic to pause while ladder logic owns this bot
    //     const tickState = PLAYER_ONGOING_TICK_STATE.get(objId);
    //     if (tickState) {
    //         tickState.infectedBotLadderActive = true;
    //     }

    //     await AIUseLadderLogic(eventPlayer, playerProfile);

    //     // Resume tick-driven logic after ladder attempt completes
    //     if (tickState) {
    //         tickState.infectedBotLadderActive = false;
    //     }
    //     if (PlayerIsAliveAndValid(eventPlayer) && GameHandler.gameState === GameState.GameRoundIsRunning) {
    //         console.log(`OnAIMoveToFailed | Resuming tick-driven InfectedBotLogicTick for Bot(${objId})`);
    //     }
    // }
}

export async function OnSpawnerSpawned(eventPlayer: mod.Player, eventSpawner: mod.Spawner) {
    mod.AIEnableShooting(eventPlayer, false);
    if (!mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier) ||
        GameHandler.gameState === GameState.EndOfRound) {
        return;
    }
    // await mod.Wait(0.25);
    if (Helpers.HasValidObjId(eventPlayer)) {
        AISpawnHandler.OnBotSpawnFromSpawner(eventPlayer, mod.GetObjId(eventSpawner));
    }
}

export function OnPlayerInteract(eventPlayer: mod.Player, eventObject: mod.Object) {

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
            GameHandler.survivorSlotsToBackfill--; // Each Human player that joins, remove one AI from the spawn pool
            mod.EnablePlayerDeploy(eventPlayer, false);
            if (playerProfile) {
                playerProfile.survived = 0;
                playerProfile.kills = 0;
                playerProfile.deaths = 0;
                playerProfile.infected = 0;
                playerProfile.UpdatePlayerScoreboard();
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
        }

    }
}

export async function OnPlayerLeaveGame(playerObjID: number) {
    const pp = PlayerProfile._allPlayers.get(playerObjID);

    CleanupPlayerOngoingVisuals(playerObjID);
    if (pp) {
        if (!pp.isAI && pp.isInfectedTeam) {
            GameHandler.infectedCount = Math.max(0, GameHandler.infectedCount - 1);
            console.log(`OnPlayerLeaveGame | Human infected left (${playerObjID}) -> infectedCount: ${GameHandler.infectedCount}`);
        }
    }
    GameHandler.RecalculateCounts();
    ScoreboardUI.GlobalUpdate(TeamNameString.Both);

    if (pp) {
        PlayerProfile.RemovePlayerProfile(playerObjID);
    }

}

export async function OnPlayerDeployed(eventPlayer: mod.Player) {
    if (Helpers.HasValidObjId(eventPlayer)) {
        if (GameHandler.gameState === GameState.EndOfRound) {
            console.log(`A player(${mod.GetObjId(eventPlayer)}) was undeployed during EndRoundCleanup`);
            // mod.UndeployPlayer(player); // this forces unwanted bots to spawn. DO NOT USE THIS.
            mod.Kill(eventPlayer);
            return;
        }
        if (mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)) {
            return;
        }
        PlayerProfile.CustomOnPlayerDeployed(eventPlayer);
    } else {
        console.log(`OnPlayerDeployed "CRITICAL" | Player(${mod.GetObjId(eventPlayer)}) deployed without a valid ObjID!`);
    }
}

export function OnPlayerUndeploy(playerObjId: number) {
    CleanupPlayerOngoingVisuals(playerObjId);
    if (PlayerProfile._deployedPlayers.has(playerObjId)) {
        PlayerProfile.RemoveFromDeployedPlayers(playerObjId);
    }
}

export function OnPlayerDied(eventPlayer: mod.Player, eventOtherPlayer: mod.Player) {
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
    if (PlayerProfile._deployedPlayers.has(playerObjId)) {
        PlayerProfile.RemoveFromDeployedPlayers(playerObjId);
    }

    if (Helpers.HasValidObjId(eventPlayer)) {
        const playerObjID = mod.GetObjId(eventPlayer);
        const playerProfile = PlayerProfile.Get(eventPlayer);
        playerProfile?.loadoutDisplayBottom?.Hide();


        // This mess of a bot spawn system is fucked and needs a second look if DICE/Ripple/EA changes bots leaving the game after they die
        if (mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)) {
            let linkedBotProfile = playerProfile?._botProfile;
            const spawnerObjID = playerProfile?.spawnerObjID;
            if (spawnerObjID) {
                let fetchedBotProfile = BotProfile.GetBySpawner(spawnerObjID);
                if (fetchedBotProfile != linkedBotProfile) {
                    linkedBotProfile = fetchedBotProfile;
                }
            }
            console.log(`OnPlayerDied | Player(${playerObjID}) Died! | BotProfile: ${linkedBotProfile?.playerName} | Passing to BotProfile.OnAIDied()`);
            if (playerProfile && linkedBotProfile) {
                BotProfile.OnAIDied(eventPlayer, playerProfile, linkedBotProfile);
                return;
            }
            if (!linkedBotProfile) {
                const error = (playerProfile == undefined) ? "PlayerProfile" : "BotProfile";
                console.log(`OnPlayerDied "CRITICAL ERROR" | Could not get ${error}!`);
            }
            return;
        }

        const otherPlayerObjID = mod.GetObjId(eventOtherPlayer);
        if (playerObjID === otherPlayerObjID && GameHandler.gameState !== GameState.GameRoundIsRunning) {
            return;
        }


        if (playerProfile && GameHandler.gameState === GameState.GameRoundIsRunning) {
            // perform death/team switch logic only during an active round
            playerProfile.OnDeath();

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
        if (mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)) {
            let botProfile = playerProfile._botProfile;
            if (botProfile && botProfile.playerStats) {
                botProfile.playerStats.kills++;
                botProfile.playerStats.score += POINTS_PER_INFECTED_KILL;
                botProfile.UpdatePlayerScoreboard(eventPlayer);
            }
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

function GetInfectedHumanBaseSpeedMultiplier(playerProfile: PlayerProfile): number {
    return playerProfile.isAlphaInfected ? 1.2 : 1;
}

function ApplyInfectedHumanAreaSprintSpeedBoost(player: mod.Player, playerProfile: PlayerProfile) {
    if (playerProfile.isAI || !playerProfile.isInfectedTeam) {
        playerProfile.infectedAreaSprintBoostWasActive = false;
        return;
    }

    const shouldApplyBoost = playerProfile.infectedAreaSpeedBoostActive
        && mod.GetSoldierState(player, mod.SoldierStateBool.IsSprinting);
    if (playerProfile.infectedAreaSpeedBoostActive) {
        UI.UpdateInfectedSpeedBoostAreaNotification(playerProfile, shouldApplyBoost);
    }
    if (shouldApplyBoost && !playerProfile.infectedAreaSprintBoostWasActive) {
        // SFX_Gadgets_AdrenalineShot_Start_OneShot2D might replace with a more soft sound, it's kinda repetitive
        const SFX = mod.SpawnObject(mod.RuntimeSpawn_Common.SFX_Gadgets_AdrenalineShot_Start_OneShot2D, mod.CreateVector(0, 0, 0), mod.CreateVector(0, 0, 0));
        mod.PlaySound(SFX, 1, player);
    }
    playerProfile.infectedAreaSprintBoostWasActive = shouldApplyBoost;
    mod.SetPlayerMovementSpeedMultiplier(
        player,
        shouldApplyBoost ? 3.5 : GetInfectedHumanBaseSpeedMultiplier(playerProfile)
    );
}

export function OnPlayerExitAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger) {
    if (mod.GetObjId(mod.GetTeam(eventPlayer)) !== mod.GetObjId(INFECTED_TEAM)) {
        const survivorProfile = PlayerProfile.Get(eventPlayer);
        if (survivorProfile?.playerAreaNotificationWidget) {
            mod.DeleteUIWidget(survivorProfile.playerAreaNotificationWidget);
            survivorProfile.playerAreaNotificationWidget = undefined;
        }
        if (survivorProfile) {
            survivorProfile.playerAreaNotificationIsSpeedBoost = false;
        }
        return;
    }
    const playerProfile = PlayerProfile.Get(eventPlayer);
    if (playerProfile) {
        playerProfile.infectedAreaSpeedBoostActive = false;
        playerProfile.infectedAreaSprintBoostWasActive = false;
        if (playerProfile.playerAreaNotificationWidget && playerProfile.playerAreaNotificationIsSpeedBoost) {
            mod.DeleteUIWidget(playerProfile.playerAreaNotificationWidget);
            playerProfile.playerAreaNotificationWidget = undefined;
            playerProfile.playerAreaNotificationIsSpeedBoost = false;
        }
    }
    if (playerProfile?._botProfile) {
        playerProfile._botProfile.speedMultiplier = 1;
        mod.SetPlayerMovementSpeedMultiplier(eventPlayer, playerProfile.isAlphaInfected ? 1.3 : 1);
    } else if (playerProfile) {
        ApplyInfectedHumanAreaSprintSpeedBoost(eventPlayer, playerProfile);
    }
    const SFX_AREA_EXIT = mod.SpawnObject(mod.RuntimeSpawn_Common.SFX_Gadgets_EpiPen_ReviveDone_1p_OneShot2D, mod.CreateVector(0, 0, 0), mod.CreateVector(0, 0, 0));
    mod.EnableScreenEffect(eventPlayer, mod.ScreenEffects.Saturated, false);
    playerProfile?.UpdateInfectedNightOverlay(true);
    mod.PlaySound(SFX_AREA_EXIT, 1, eventPlayer);
}


export function OnPlayerEnterAreaTrigger(eventPlayer: mod.Player, eventAreaTrigger: mod.AreaTrigger) {
    if (mod.GetObjId(mod.GetTeam(eventPlayer)) !== mod.GetObjId(INFECTED_TEAM)) {
        const survivorProfile = PlayerProfile.Get(eventPlayer);
        if (survivorProfile && !survivorProfile.isAI) {
            if (survivorProfile.playerAreaNotificationWidget) {
                mod.DeleteUIWidget(survivorProfile.playerAreaNotificationWidget);
                survivorProfile.playerAreaNotificationWidget = undefined;
            }
            survivorProfile.playerAreaNotificationWidget = UI.CreatePlayerAreaNotificationWidget(eventPlayer, survivorProfile.playerID);
            survivorProfile.playerAreaNotificationIsSpeedBoost = false;
            if (survivorProfile.playerAreaNotificationWidget) {
                mod.SetUIWidgetDepth(survivorProfile.playerAreaNotificationWidget, mod.UIDepth.AboveGameUI);
                mod.SetUIWidgetVisible(survivorProfile.playerAreaNotificationWidget, true);
            }
        }
        return;
    }

    const pp = PlayerProfile.Get(eventPlayer);
    if (pp) {
        pp.infectedAreaSpeedBoostActive = true;
    }
    if (pp && !pp.isAI) {
        if (pp.playerAreaNotificationWidget) {
            mod.DeleteUIWidget(pp.playerAreaNotificationWidget);
            pp.playerAreaNotificationWidget = undefined;
        }
        pp.playerAreaNotificationWidget = UI.CreatePlayerAreaNotificationWidget(
            eventPlayer,
            pp.playerID,
            MakeMessage(mod.stringkeys.infected_speed_boost_ready)
        );
        pp.playerAreaNotificationIsSpeedBoost = true;
        UI.UpdateInfectedSpeedBoostAreaNotification(pp, false);
    }
    const botProfile = pp?._botProfile;
    const targetInVehicle = pp?.currentTarget ? IsPlayerInTrackedVehicle(pp.currentTarget) : false;
    const aiSpeedMultiplier = targetInVehicle ? 4 : 2;
    if (botProfile) {
        botProfile.speedMultiplier = aiSpeedMultiplier;
    }
    if (pp?.isAI) {
        mod.SetPlayerMovementSpeedMultiplier(eventPlayer, aiSpeedMultiplier);
    } else if (pp) {
        ApplyInfectedHumanAreaSprintSpeedBoost(eventPlayer, pp);
    }
    const SFX = mod.SpawnObject(mod.RuntimeSpawn_Common.SFX_Gadgets_Defibrillator_Equipped_Charged_OneShot2D, mod.CreateVector(0, 0, 0), mod.CreateVector(0, 0, 0));
    mod.EnableScreenEffect(eventPlayer, mod.ScreenEffects.Saturated, true);
    pp?.UpdateInfectedNightOverlay(false);
    mod.PlaySound(SFX, 1, eventPlayer);

}

export function OnVehicleSpawned(eventVehicle: mod.Vehicle) {
    mod.SetVehicleMaxHealthMultiplier(eventVehicle, 0.1);
    mod.SetVehicleSpawnerTimeUntilAbandon(mod.GetVehicleSpawner(202), 3);
    SPAWNED_ACTIVE_VEHICLE = eventVehicle;
}

export async function OngoingPlayer(eventPlayer: mod.Player) {
    if (!Helpers.HasValidObjId(eventPlayer)) return;

    const playerObjId = mod.GetObjId(eventPlayer);
    if (playerObjId < 0) return;

    let tickState = PLAYER_ONGOING_TICK_STATE.get(playerObjId);
    if (!tickState) {
        tickState = { nextIconUpdateAt: 0, nextBannedCheckAt: 0, nextLadderCheckAt: 0 };
        PLAYER_ONGOING_TICK_STATE.set(playerObjId, tickState);
    }

    const playerProfile = PlayerProfile.Get(eventPlayer);
    if (playerProfile && !playerProfile.isAI) {
        playerProfile.UpdatePlayerAreaNotificationWidget();
        if (DEBUG_SHOW_ALL_UI_ELEMENTS) {
            playerProfile.DebugForceShowAllUIWidgets();
        }
    }

    const now = Date.now() / 1000;

    if (now >= tickState.nextIconUpdateAt) {
        tickState.nextIconUpdateAt = now + PLAYER_ONGOING_ICON_UPDATE_SECONDS;
        if (SafeIsAlive(eventPlayer)) {
            UpdatePlayerIndicatorsAndIcons(eventPlayer);
            if (playerProfile
                && !playerProfile.isAI
                && playerProfile.isInfectedTeam
                && playerProfile.infectedAreaSpeedBoostActive
                && GameHandler.gameState === GameState.GameRoundIsRunning) {
                ApplyInfectedHumanAreaSprintSpeedBoost(eventPlayer, playerProfile);
            }
        } else {
            CleanupPlayerOngoingVisuals(playerObjId);
            return;
        }
    }

    if (now >= tickState.nextBannedCheckAt) {
        tickState.nextBannedCheckAt = now + PLAYER_ONGOING_BANNED_CHECK_SECONDS;
        if (!mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)
            && SafeIsAlive(eventPlayer)
            && GameHandler.gameState === GameState.GameRoundIsRunning
            && now >= (tickState.bannedChecksEnabledAt ?? 0)) {
            CheckForBannedWeapons(eventPlayer);
        }
    }

    // --- tick-driven Infected bot AI ---
    if (now >= (tickState.nextInfectedBotTickAt ?? 0)) {
        tickState.nextInfectedBotTickAt = now + PLAYER_ONGOING_INFECTED_BOT_TICK_SECONDS;
        if (mod.GetSoldierState(eventPlayer, mod.SoldierStateBool.IsAISoldier)
            && SafeIsAlive(eventPlayer)
            && GameHandler.gameState === GameState.GameRoundIsRunning) {
            const playerProfile = PlayerProfile.Get(eventPlayer);
            if (playerProfile?.isInfectedTeam) {
                InfectedBotLogicTick(eventPlayer, tickState);
            }
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

export async function OnGameModeStarted() {
    mod.EnableAllPlayerDeploy(false);
    mod.SetSpawnMode(mod.SpawnModes.AutoSpawn);

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
    GameHandler.InitializeScoreboardTimeAndColumns();
    await GameHandler.PreGameSetup();

    GameHandler.TickUpdate(); // main game loop
}
