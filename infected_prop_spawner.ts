// ============================================================
// infected_prop_spawner.ts standalone prop spawner test
// Will be merged into infected.ts after testing.
// ============================================================

mod.SetSpawnMode(mod.SpawnModes.AutoSpawn);

// ---- Types -----------------------------------------------------------------

type SpawnableProp = mod.RuntimeSpawn_Common | mod.RuntimeSpawn_Sand;

interface PropConfig {
    prop: SpawnableProp;
    // Horizontal offsets applied in world-space relative to the player's facing direction.
    // Positive forwardOffset shifts the spawn position forward along the player's facing.
    // Positive rightOffset shifts the spawn position to the right of the player's facing.
    forwardOffset: number;
    rightOffset: number;
    // Width of the prop (metres) along its local right axis (perpendicular to its facing).
    width: number;
    // Depth of the prop (metres) along its local forward axis (along its facing direction).
    depth: number;
    // Minimum horizontal distance from anchor before line drag engages (metres).
    lineDragMinDist: number;
    // Minimum dot-product for keyhole VFX to be visible (cos of max angle).
    keyholeMinDot: number;
}

// ---- Config ----------------------------------------------------------------

const MAX_SPAWN_DISTANCE = 10;   // metres; also used as the raycast end distance
const PREVIEW_TICK_INTERVAL = 1;   // fire a preview raycast every N OngoingPlayer ticks
const MIN_FLOOR_NORMAL_Y = 0.5; // reject surfaces whose Y normal is below this (walls/ceilings)
const MAX_LINE_PROPS = 3;        // maximum number of props that can be placed in a single line row
const LINE_CURSOR_MAX_DIST = 10; // max metres from anchor for a floor raycast to count as line cursor
// ---- SFX / VFX identifiers -------------------------------------------------
const VFX_ANCHOR_LAUNCH = mod.RuntimeSpawn_Common.FX_Impact_LootCrate_Dirt;
const VFX_PROP_LAND = mod.RuntimeSpawn_Common.FX_Gadget_PTKM_Submunition_Detonation; // aggressive VFX for clear feedback
const VFX_SLOT_CONFIRM = mod.RuntimeSpawn_Common.FX_RepairTool_FullyHealed;
const VFX_SLOT_PREVIEW = mod.RuntimeSpawn_Common.FX_TracerDart_Projectile_Glow;
const SFX_CHILD_PREVIEW = mod.RuntimeSpawn_Common.SFX_Gadgets_C4_Activate_OneShot3D;
const SFX_RATCHET = mod.RuntimeSpawn_Common.SFX_Gadgets_Defibrillator_Equipped_ChargeRub_OneShot3D;

// ---- Ratchet tuning --------------------------------------------------------
const LINE_RATCHET_DEG = 3;    // degrees of aim sweep per ratchet notch
const RATCHET_BASE_AMP = 0.2;  // amplitude of the first notch in a bracket
const RATCHET_AMP_STEP = 0.05; // amplitude added per successive notch
const RATCHET_MAX_AMP = 0.85; // amplitude ceiling
const RATCHET_ATTEN = 30;   // 3D attenuation range for ratchet SFX
const ZERO_VEC = mod.CreateVector(0, 0, 0);
const ONE_VEC = mod.CreateVector(1, 1, 1);

// ---- Bot test harness config -----------------------------------------------
// Set to false to disable the looping bot entirely.
const BOT_TEST_ENABLED = false;
// Numeric spawner ID to use for the test bot (must exist on the current map).
const BOT_TEST_SPAWNER_ID = 1;
// Seconds after spawn before the bot aims and fires.
const BOT_TEST_FIRE_DELAY = 1.5;
// Seconds after fire before checking whether a prop appeared.
const BOT_TEST_CONFIRM_DELAY = 3.0;
// Seconds after the bot is killed before the next spawn request.
const BOT_TEST_RESTART_DELAY = 2.0;
// World-space floor position the bot aims at.  Adjust to a flat surface
// near the spawner for whatever test level is loaded.
const BOT_TEST_AIM_POS = mod.GetObjectPosition(mod.GetHQ(1)) as mod.Vector;

// Per-prop placement config.
const PROP_CONFIGS: PropConfig[] = [
    { prop: mod.RuntimeSpawn_Sand.BarrierConcreteWall_01_192x320, forwardOffset: 0, rightOffset: 0.96, width: 1.92, depth: 0.3, lineDragMinDist: 2.0, keyholeMinDot: 0.80 },
    { prop: mod.RuntimeSpawn_Sand.BarricadeboardsWood_01_B, forwardOffset: 0, rightOffset: 0.5, width: 1.0, depth: 0.2, lineDragMinDist: 1.0, keyholeMinDot: 0.65 },
    { prop: mod.RuntimeSpawn_Common.CrateAmmo_01_StackB, forwardOffset: 0, rightOffset: 0, width: 2.0, depth: 1.0, lineDragMinDist: 2.0, keyholeMinDot: 0.80 },
];

// ---- Per-player state ------------------------------------------------------

// Index into PROP_CONFIGS for the next prop to spawn (cycles after each use)
const playerPropIndex: Map<number, number> = new Map();

// Whether a raycast is currently in flight for this player
const playerRaycastInFlight: Set<number> = new Set();

// What the in-flight raycast was fired for
const playerRaycastPurpose: Map<number, "preview" | "spawn" | "line_cursor"> = new Map();

// Tick counter used to throttle preview raycasts
const playerPreviewTick: Map<number, number> = new Map();

// Players who have already used their one spawn this round
const playerHasSpawned: Set<number> = new Set();

// Per-player world icon for the placement preview
const playerPreviewIcons: Map<number, mod.WorldIcon> = new Map();

// Objects spawned by each player, kept for cleanup
const playerSpawnedObjects: Map<number, mod.Object[]> = new Map();

// ---- Line-mode state -------------------------------------------------------

// When true, the player has placed the anchor prop and is dragging out additional props.
const playerLineMode: Set<number> = new Set();

// World position of the first (anchor) prop placed in line mode.
const playerLineAnchorPos: Map<number, mod.Vector> = new Map();

// Rotation applied to the anchor prop (and carried forward to all line props).
const playerLineAnchorRot: Map<number, mod.Vector> = new Map();

// Extra world icons used to preview line slots 2 and 3 (index 0 = slot 2, index 1 = slot 3).
const playerLinePreviewIcons: Map<number, mod.WorldIcon[]> = new Map();

// Most recent computed count of line props (1..MAX_LINE_PROPS) during line preview.
const playerLineCount: Map<number, number> = new Map();

// Current line direction vector (from anchor toward cursor) updated each aim tick.
const playerLineDir: Map<number, mod.Vector> = new Map();

// Last valid floor raycast hit within LINE_CURSOR_MAX_DIST used as line cursor.
// Cleared when raycast misses, hits a wall, or exceeds the distance threshold.
const playerLineCursorPos: Map<number, mod.Vector> = new Map();

// Ratchet sound state: angle (radians) at the last notch fire, and escalating notch index.
const playerRatchetAngle: Map<number, number> = new Map();
const playerRatchetNotch: Map<number, number> = new Map();

// State of the most recent line cursor raycast result.
const playerLineCursorState: Map<number, "valid" | "invalid_surface" | "out_of_range"> = new Map();

// Per-player status/instruction world icon shown during line-drag mode.
const playerStatusIcons: Map<number, mod.WorldIcon> = new Map();

// Players in line mode whose aim updates are frozen (stopped aiming after placing anchor).
const playerLineFrozen: Set<number> = new Set();

// Persistent hint VFX spawned at the first-extension-slot position while in frozen line mode.
// Enabled only when the player is "keyholed" (looking toward the anchor).
const playerLineHintVfx: Map<number, mod.VFX> = new Map();

// Per-slot camera-light VFX spawned when a slot is queued. index 0 = slot 2, index 1 = slot 3.
const playerLineSlotConfirmVfx: Map<number, mod.VFX[]> = new Map();

// Torch preview VFX on the immediately-next unqueued slot while direction is committed.
const playerLineSlotTorchVfx: Map<number, mod.VFX[]> = new Map();

// Two torch VFX on either side of the anchor shown as soon as the player enters ADS.
const playerLineSideTorchVfx: Map<number, mod.VFX[]> = new Map();

// ---- Bot test harness state ------------------------------------------------
let _botTestBot: mod.Player | undefined;


// ---- Helpers ---------------------------------------------------------------

function GetPlayerId(player: mod.Player): number {
    return mod.GetObjId(player);
}

function GetPropConfig(player: mod.Player): PropConfig {
    const id = GetPlayerId(player);
    const idx = playerPropIndex.get(id) ?? 0;
    return PROP_CONFIGS[idx % PROP_CONFIGS.length];
}

function GetRaycastVectors(player: mod.Player): { start: mod.Vector; end: mod.Vector } {
    const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
    const eyePos = mod.GetSoldierState(player, mod.SoldierStateVector.EyePosition);
    // Offset the start 1 unit forward to avoid self-collision with the player geometry
    const start = mod.Add(eyePos, facing);
    const end = mod.Add(start, mod.Multiply(facing, MAX_SPAWN_DISTANCE));
    return { start, end };
}

function GetPropPreviewMessage(prop: SpawnableProp): mod.Message {
    switch (prop) {
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

function GetFireToPlaceMessage(prop: SpawnableProp): mod.Message {
    switch (prop) {
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

function GetOrCreatePreviewIcon(player: mod.Player, pos: mod.Vector): mod.WorldIcon | undefined {
    const id = GetPlayerId(player);
    let icon = playerPreviewIcons.get(id);
    if (!icon) {
        icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, pos, ZERO_VEC) as mod.WorldIcon;
        if (!icon) return undefined;
        mod.SetWorldIconImage(icon, mod.WorldIconImages.Alert);
        mod.SetWorldIconOwner(icon, player);
        mod.EnableWorldIconImage(icon, false);
        mod.EnableWorldIconText(icon, false);
        playerPreviewIcons.set(id, icon);
    }
    return icon;
}

function ShowPreviewIconValid(player: mod.Player, pos: mod.Vector): void {
    const icon = GetOrCreatePreviewIcon(player, pos);
    if (!icon) return;
    const id = GetPlayerId(player);
    const hasPlaced = (playerSpawnedObjects.get(id)?.length ?? 0) > 0;
    const altPhase = hasPlaced && Math.floor(Date.now() / 2000) % 2 === 0;
    const msg = altPhase
        ? mod.Message(mod.stringkeys.prop_spawner_undo)
        : GetFireToPlaceMessage(GetPropConfig(player).prop);
    mod.EnableWorldIconText(icon, false);
    mod.SetWorldIconText(icon, msg);
    mod.SetWorldIconColor(icon, mod.CreateVector(0.2, 1, 0.2));
    mod.SetWorldIconPosition(icon, pos);
    mod.SetWorldIconOwner(icon, player);
    mod.EnableWorldIconImage(icon, true);
    mod.EnableWorldIconText(icon, true);
}

function ShowPreviewIconError(player: mod.Player, pos: mod.Vector, message: mod.Message): void {
    const icon = GetOrCreatePreviewIcon(player, pos);
    if (!icon) return;
    mod.EnableWorldIconText(icon, false);
    mod.SetWorldIconText(icon, message);
    mod.SetWorldIconColor(icon, mod.CreateVector(1, 0.35, 0));
    mod.SetWorldIconPosition(icon, pos);
    mod.SetWorldIconOwner(icon, player);
    mod.EnableWorldIconImage(icon, true);
    mod.EnableWorldIconText(icon, true);
}

function HidePreviewIcon(player: mod.Player): void {
    const icon = playerPreviewIcons.get(GetPlayerId(player));
    if (icon) {
        mod.EnableWorldIconImage(icon, false);
        mod.EnableWorldIconText(icon, false);
    }
}

// Compute the object origin from a pivot point (raw raycast hit / visual centre).
// Offsets along the prop's own right/forward axes derived from yaw so rotation stays centred.
function ComputeObjectPosFromPivot(pivot: mod.Vector, yaw: number, config: PropConfig): mod.Vector {
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

// Returns a rotation vector (radians) that makes the prop face back toward the player.
function GetFacingPlayerRotation(player: mod.Player): mod.Vector {
    const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
    const fx = mod.XComponentOf(facing);
    const fz = mod.ZComponentOf(facing);
    // Negate to point the prop's front face back at the player
    const yaw = Math.atan2(-fx, -fz);
    return mod.CreateVector(0, yaw, 0);
}

// ---- Line-mode helpers ----------------------------------------------------

// Compute the horizontal direction vector from anchorPos toward cursorPos,
// flattened to the XZ plane. Returns undefined if the two points are coincident.
function ComputeLineDirection(anchorPos: mod.Vector, cursorPos: mod.Vector): mod.Vector | undefined {
    const dx = mod.XComponentOf(cursorPos) - mod.XComponentOf(anchorPos);
    const dz = mod.ZComponentOf(cursorPos) - mod.ZComponentOf(anchorPos);
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) return undefined;
    return mod.CreateVector(dx / len, 0, dz / len);
}

// Compute the horizontal distance between two world positions (ignores Y).
function HorizontalDistance(a: mod.Vector, b: mod.Vector): number {
    const dx = mod.XComponentOf(b) - mod.XComponentOf(a);
    const dz = mod.ZComponentOf(b) - mod.ZComponentOf(a);
    return Math.sqrt(dx * dx + dz * dz);
}

// Compute the effective step size (metres) between prop centres along the line direction,
// accounting for both width and depth of the prop at its current facing angle.
// Uses the shadow/projection formula: step = W * |sin(A-B)| + D * |cos(A-B)|
// where A = prop facing yaw, B = line direction yaw.
function ComputeEffectiveStep(lineDir: mod.Vector, facingYaw: number, config: PropConfig): number {
    const lineYaw = Math.atan2(mod.XComponentOf(lineDir), mod.ZComponentOf(lineDir));
    const angle = facingYaw - lineYaw;
    return config.width * Math.abs(Math.sin(angle)) + config.depth * Math.abs(Math.cos(angle));
}

// Snap the count of additional props in the line based on how far the cursor
// has moved from the anchor. Returns 1 (only anchor) up to MAX_LINE_PROPS.
function ComputeLineCount(anchorPos: mod.Vector, cursorPos: mod.Vector, effectiveStep: number): number {
    const dist = HorizontalDistance(anchorPos, cursorPos);
    // The nth additional prop starts at (n * effectiveStep) from the anchor centre.
    // We require the cursor to reach that distance before showing the next prop.
    const additional = Math.min(Math.floor(dist / effectiveStep), MAX_LINE_PROPS - 1);
    return 1 + additional;
}

// Manage line preview icons, confirm VFX (camera light), and torch VFX per slot.
// Called only when direction is committed (dist >= lineDragMinDist).
function UpdateLinePreviews(player: mod.Player, anchorPos: mod.Vector, lineDir: mod.Vector, count: number, effectiveStep: number): void {
    const id = GetPlayerId(player);
    const config = GetPropConfig(player);

    // First call with direction committed: unspawn side torches (torch-per-side is replaced
    // by per-slot torch/confirm management once the direction is known).
    UnspawnSideTorches(id);

    // Lazily create icon list.
    let icons = playerLinePreviewIcons.get(id);
    if (!icons) {
        icons = [];
        playerLinePreviewIcons.set(id, icons);
    }
    while (icons.length < MAX_LINE_PROPS - 1) {
        const icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, anchorPos, ZERO_VEC) as mod.WorldIcon;
        if (!icon) break;
        mod.SetWorldIconImage(icon, mod.WorldIconImages.Alert);
        mod.SetWorldIconOwner(icon, player);
        mod.EnableWorldIconImage(icon, false);
        mod.EnableWorldIconText(icon, false);
        icons.push(icon);
    }

    // Lazily create confirm and torch lists.
    let slotConfirmList = playerLineSlotConfirmVfx.get(id);
    if (!slotConfirmList) { slotConfirmList = []; playerLineSlotConfirmVfx.set(id, slotConfirmList); }
    let slotTorchList = playerLineSlotTorchVfx.get(id);
    if (!slotTorchList) { slotTorchList = []; playerLineSlotTorchVfx.set(id, slotTorchList); }

    // Slot index 0 = second prop, 1 = third prop, etc.
    for (let i = 0; i < icons.length; i++) {
        const slotIndex = i + 1; // 1-based offset from anchor
        const icon = icons[i];
        const offset = slotIndex * effectiveStep;
        const pos = mod.CreateVector(
            mod.XComponentOf(anchorPos) + mod.XComponentOf(lineDir) * offset,
            mod.YComponentOf(anchorPos),
            mod.ZComponentOf(anchorPos) + mod.ZComponentOf(lineDir) * offset
        );

        const prevConfirm = slotConfirmList[i] as mod.VFX | undefined;
        const prevTorch   = slotTorchList[i]   as mod.VFX | undefined;

        if (slotIndex < count) {
            // Slot is queued: show icon + confirm VFX, remove torch.
            mod.SetWorldIconText(icon, GetPropPreviewMessage(config.prop));
            mod.SetWorldIconColor(icon, mod.CreateVector(0.2, 1, 0.2));
            mod.SetWorldIconPosition(icon, pos);
            mod.SetWorldIconOwner(icon, player);
            mod.EnableWorldIconImage(icon, true);
            mod.EnableWorldIconText(icon, true);
            if (!prevConfirm) {
                const cv = mod.SpawnObject(VFX_SLOT_CONFIRM, pos, ZERO_VEC) as mod.VFX;
                if (cv) mod.EnableVFX(cv, true);
                slotConfirmList[i] = cv;
            } else {
                mod.MoveVFX(prevConfirm, pos, ZERO_VEC);
                mod.EnableVFX(prevConfirm, true);
            }
            if (prevTorch) {
                mod.EnableVFX(prevTorch, false);
                try { mod.UnspawnObject(prevTorch as unknown as mod.Object); } catch { }
                slotTorchList[i] = undefined as unknown as mod.VFX;
            }
        } else {
            // Slot is not queued: hide icon + confirm, show torch only for the immediately next slot.
            mod.EnableWorldIconImage(icon, false);
            mod.EnableWorldIconText(icon, false);
            if (prevConfirm) {
                mod.EnableVFX(prevConfirm, false);
                try { mod.UnspawnObject(prevConfirm as unknown as mod.Object); } catch { }
                slotConfirmList[i] = undefined as unknown as mod.VFX;
            }
            if (slotIndex === count) {
                // This is the next-to-queue slot: show/move torch here.
                if (!prevTorch) {
                    const tv = mod.SpawnObject(VFX_SLOT_PREVIEW, pos, ZERO_VEC) as mod.VFX;
                    if (tv) mod.EnableVFX(tv, true);
                    slotTorchList[i] = tv;
                } else {
                    mod.MoveVFX(prevTorch, pos, ZERO_VEC);
                }
            } else {
                // Beyond the next slot — unspawn torch if present.
                if (prevTorch) {
                    mod.EnableVFX(prevTorch, false);
                    try { mod.UnspawnObject(prevTorch as unknown as mod.Object); } catch { }
                    slotTorchList[i] = undefined as unknown as mod.VFX;
                }
            }
        }
    }

    // Play a 2D sound for this player when a new child icon first becomes visible.
    const prevCount = playerLineCount.get(id) ?? 1;
    if (count > prevCount) {
        const newSlotOffset = (count - 1) * effectiveStep;
        const newSlotPos = mod.CreateVector(
            mod.XComponentOf(anchorPos) + mod.XComponentOf(lineDir) * newSlotOffset,
            mod.YComponentOf(anchorPos),
            mod.ZComponentOf(anchorPos) + mod.ZComponentOf(lineDir) * newSlotOffset
        );
        PlaySFX3DForPlayer(SFX_CHILD_PREVIEW, 0.7, player, newSlotPos);
    }

    playerLineCount.set(id, count);
}

// ---- Audio / VFX helpers -------------------------------------------------

// Smallest absolute angle delta between two yaw values (radians), wrapping at 2pi.
function SmallestAngleDelta(a: number, b: number): number {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
}

// Play a sound heard only by a specific player.
function PlaySFX3DForPlayer(sfx: mod.RuntimeSpawn_Common, amplitude: number, player: mod.Player, pos: mod.Vector): void {
    const sfxObj = mod.SpawnObject(sfx, pos, ZERO_VEC) as mod.SFX;
    if (sfxObj) mod.PlaySound(sfxObj, amplitude, player);
}

// Compute the left and right torch positions on either side of the anchor prop.
// The line extends along the prop's right axis (perpendicular to facing), so one step in
// either direction is exactly config.width (effective step when line is fully sideways).
function GetSideTorchPositions(anchorPos: mod.Vector, facingYaw: number, config: PropConfig): [mod.Vector, mod.Vector] {
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

function UnspawnVfxList(list: mod.VFX[]): void {
    for (const vfx of list) {
        if (vfx) {
            mod.EnableVFX(vfx, false);
            try { mod.UnspawnObject(vfx as unknown as mod.Object); } catch { }
        }
    }
}

function UnspawnSideTorches(id: number): void {
    const list = playerLineSideTorchVfx.get(id);
    if (list) { UnspawnVfxList(list); playerLineSideTorchVfx.delete(id); }
}

function UnspawnSlotTorches(id: number): void {
    const list = playerLineSlotTorchVfx.get(id);
    if (list) { UnspawnVfxList(list); playerLineSlotTorchVfx.delete(id); }
}

function SpawnOrMoveSideTorches(player: mod.Player, anchorPos: mod.Vector): void {
    const id = GetPlayerId(player);
    const config = GetPropConfig(player);
    const facingYaw = mod.YComponentOf(playerLineAnchorRot.get(id) ?? ZERO_VEC);
    const [leftPos, rightPos] = GetSideTorchPositions(anchorPos, facingYaw, config);
    let list = playerLineSideTorchVfx.get(id);
    if (!list) {
        list = [];
        playerLineSideTorchVfx.set(id, list);
    }
    for (let i = 0; i < 2; i++) {
        const pos = i === 0 ? leftPos : rightPos;
        if (list[i]) {
            mod.MoveVFX(list[i], pos, ZERO_VEC);
        } else {
            const vfx = mod.SpawnObject(VFX_SLOT_PREVIEW, pos, ZERO_VEC) as mod.VFX;
            if (vfx) mod.EnableVFX(vfx, true);
            list[i] = vfx;
        }
    }
}

// Play a spatialised 3D sound audible to all players within RATCHET_ATTEN metres.
function PlaySFX3DAtPos(sfx: mod.RuntimeSpawn_Common, amplitude: number, pos: mod.Vector): void {
    const sfxObj = mod.SpawnObject(sfx, pos, ZERO_VEC) as mod.SFX;
    if (sfxObj) mod.PlaySound(sfxObj, amplitude, pos, RATCHET_ATTEN);
}

function HideLinePreviews(player: mod.Player): void {
    const id = GetPlayerId(player);
    const icons = playerLinePreviewIcons.get(id);
    if (icons) {
        for (const icon of icons) {
            mod.EnableWorldIconImage(icon, false);
            mod.EnableWorldIconText(icon, false);
        }
    }
    const slotConfirmList = playerLineSlotConfirmVfx.get(id);
    if (slotConfirmList) {
        for (const sv of slotConfirmList) if (sv) mod.EnableVFX(sv, false);
    }
    UnspawnSlotTorches(id);
    playerLineCount.set(id, 1);
}

// ---- Line-mode status icon ------------------------------------------------

function GetLineModeStatusPos(anchorPos: mod.Vector): mod.Vector {
    return mod.CreateVector(
        mod.XComponentOf(anchorPos),
        mod.YComponentOf(anchorPos) + 1.5,
        mod.ZComponentOf(anchorPos)
    );
}

function ShowStatusIcon(player: mod.Player, pos: mod.Vector, message: mod.Message, color: mod.Vector): void {
    const id = GetPlayerId(player);
    let icon = playerStatusIcons.get(id);
    if (!icon) {
        icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, pos, ZERO_VEC) as mod.WorldIcon;
        if (!icon) return;
        mod.SetWorldIconImage(icon, mod.WorldIconImages.Alert);
        playerStatusIcons.set(id, icon);
    }
    mod.EnableWorldIconText(icon, false);
    mod.SetWorldIconText(icon, message);
    mod.SetWorldIconColor(icon, color);
    mod.SetWorldIconPosition(icon, pos);
    mod.SetWorldIconOwner(icon, player);
    mod.EnableWorldIconImage(icon, true);
    mod.EnableWorldIconText(icon, true);
}

function HideStatusIcon(player: mod.Player): void {
    const icon = playerStatusIcons.get(GetPlayerId(player));
    if (!icon) return;
    mod.EnableWorldIconImage(icon, false);
    mod.EnableWorldIconText(icon, false);
}

// Rotate the anchor prop so it is perpendicular to the line direction,
// choosing the perpendicular that faces toward the player.
// The line direction is stored separately in playerLineDir for use at finalize.
function RotateAnchorProp(player: mod.Player, lineDir: mod.Vector): void {
    const id = GetPlayerId(player);
    const objects = playerSpawnedObjects.get(id);
    if (!objects || objects.length === 0) return;
    const anchor = objects[objects.length - 1];

    // Store the line direction for finalize to use for prop placement offsets.
    playerLineDir.set(id, lineDir);

    // Two candidate perpendiculars to the line (90-deg CW and CCW in XZ plane).
    const ldx = mod.XComponentOf(lineDir);
    const ldz = mod.ZComponentOf(lineDir);
    const perp1x = -ldz;
    const perp1z = ldx;

    // Pick the perpendicular whose dot product with (anchor -> player) is positive,
    // so all props in the row face toward the player.
    const anchorPos = playerLineAnchorPos.get(id) ?? ZERO_VEC;
    const playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    const toPx = mod.XComponentOf(playerPos) - mod.XComponentOf(anchorPos);
    const toPz = mod.ZComponentOf(playerPos) - mod.ZComponentOf(anchorPos);
    const dot = perp1x * toPx + perp1z * toPz;
    const facingX = dot >= 0 ? perp1x : -perp1x;
    const facingZ = dot >= 0 ? perp1z : -perp1z;

    const yaw = Math.atan2(facingX, facingZ);
    const rot = mod.CreateVector(0, yaw, 0);
    playerLineAnchorRot.set(id, rot);
    const objectPos = ComputeObjectPosFromPivot(anchorPos, yaw, GetPropConfig(player));
    try { mod.SetObjectTransform(anchor, mod.CreateTransform(objectPos, rot)); } catch { }
}

// Finalize line-mode: spawn props at slots 2..count along the stored line direction.
function FinalizeLinePlacement(player: mod.Player): void {
    const id = GetPlayerId(player);
    const anchorPos = playerLineAnchorPos.get(id);
    const anchorRot = playerLineAnchorRot.get(id);
    const count = playerLineCount.get(id) ?? 1;
    const config = GetPropConfig(player);
    // Use the independently stored line direction rather than deriving from anchorRot,
    // since anchorRot now stores the toward-player facing.
    const lineDir = playerLineDir.get(id);

    const facingYaw = anchorRot !== undefined ? mod.YComponentOf(anchorRot) : 0;
    const effectiveStep = lineDir ? ComputeEffectiveStep(lineDir, facingYaw, config) : config.width;

    if (anchorPos && lineDir && count > 1) {
        const list = playerSpawnedObjects.get(id) ?? [];
        const childYaw = anchorRot !== undefined ? mod.YComponentOf(anchorRot) : 0;
        for (let i = 1; i < count; i++) {
            const offset = i * effectiveStep;
            const childPivot = mod.CreateVector(
                mod.XComponentOf(anchorPos) + mod.XComponentOf(lineDir) * offset,
                mod.YComponentOf(anchorPos),
                mod.ZComponentOf(anchorPos) + mod.ZComponentOf(lineDir) * offset
            );
            const childObjectPos = ComputeObjectPosFromPivot(childPivot, childYaw, config);
            const prop = mod.SpawnObject(config.prop as mod.RuntimeSpawn_Sand, childObjectPos, anchorRot!, ONE_VEC);
            if (prop) list.push(prop);
        }
        playerSpawnedObjects.set(id, list);
    }

    // Stagger VFX at each placed prop position (fire-and-forget async).
    if (anchorPos) {
        const fxAnchorPos = anchorPos;
        const fxLineDir = lineDir;
        const fxStep = effectiveStep;
        const fxCount = count;
        (async () => {
            const anchorLandVfx = mod.SpawnObject(VFX_PROP_LAND, fxAnchorPos, ZERO_VEC) as mod.VFX;
            if (anchorLandVfx) mod.EnableVFX(anchorLandVfx, true);
            for (let i = 1; i < fxCount; i++) {
                await mod.Wait(0.05);
                if (!fxLineDir) break;
                const pos = mod.CreateVector(
                    mod.XComponentOf(fxAnchorPos) + mod.XComponentOf(fxLineDir) * i * fxStep,
                    mod.YComponentOf(fxAnchorPos),
                    mod.ZComponentOf(fxAnchorPos) + mod.ZComponentOf(fxLineDir) * i * fxStep
                );
                const childLandVfx = mod.SpawnObject(VFX_PROP_LAND, pos, ZERO_VEC) as mod.VFX;
                if (childLandVfx) mod.EnableVFX(childLandVfx, true);
            }
        })();
    }

    // Exit line mode
    playerLineMode.delete(id);
    playerLineAnchorPos.delete(id);
    playerLineAnchorRot.delete(id);
    playerLineDir.delete(id);
    playerLineCursorPos.delete(id);
    playerRatchetAngle.delete(id);
    playerRatchetNotch.delete(id);
    playerLineFrozen.delete(id);
    const finalizeHintVfx = playerLineHintVfx.get(id);
    if (finalizeHintVfx) {
        mod.EnableVFX(finalizeHintVfx, false);
        try { mod.UnspawnObject(finalizeHintVfx as unknown as mod.Object); } catch { }
        playerLineHintVfx.delete(id);
    }
    UnspawnSideTorches(id);
    UnspawnSlotTorches(id);
    const finalizeSlotConfirm = playerLineSlotConfirmVfx.get(id);
    if (finalizeSlotConfirm) {
        for (const sv of finalizeSlotConfirm) if (sv) { mod.EnableVFX(sv, false); try { mod.UnspawnObject(sv as unknown as mod.Object); } catch { } }
        playerLineSlotConfirmVfx.delete(id);
    }
    HideLinePreviews(player);
    HideStatusIcon(player);

    // Advance prop rotation cycle once for the whole row
    const currentIdx = playerPropIndex.get(id) ?? 0;
    playerPropIndex.set(id, currentIdx + 1);

    HidePreviewIcon(player);
}

// Cancel line mode: unspawn the anchor prop and reset all line state.
// Called when the player right-clicks while in line mode.
function CancelLinePlacement(player: mod.Player): void {
    const id = GetPlayerId(player);

    // Remove the anchor prop (the last object pushed during the first click).
    const objects = playerSpawnedObjects.get(id);
    if (objects && objects.length > 0) {
        const anchor = objects.pop()!;
        try { mod.UnspawnObject(anchor); } catch { }
        if (objects.length === 0) playerSpawnedObjects.delete(id);
    }

    playerLineMode.delete(id);
    playerLineAnchorPos.delete(id);
    playerLineAnchorRot.delete(id);
    playerLineDir.delete(id);
    playerLineCursorPos.delete(id);
    playerRatchetAngle.delete(id);
    playerRatchetNotch.delete(id);
    playerLineFrozen.delete(id);
    const cancelHintVfx = playerLineHintVfx.get(id);
    if (cancelHintVfx) {
        mod.EnableVFX(cancelHintVfx, false);
        try { mod.UnspawnObject(cancelHintVfx as unknown as mod.Object); } catch { }
        playerLineHintVfx.delete(id);
    }
    UnspawnSideTorches(id);
    UnspawnSlotTorches(id);
    const cancelSlotConfirm = playerLineSlotConfirmVfx.get(id);
    if (cancelSlotConfirm) {
        for (const sv of cancelSlotConfirm) if (sv) { mod.EnableVFX(sv, false); try { mod.UnspawnObject(sv as unknown as mod.Object); } catch { } }
        playerLineSlotConfirmVfx.delete(id);
    }
    HideLinePreviews(player);
    HideStatusIcon(player);
    HidePreviewIcon(player);
}

function CleanupPlayerObjects(player: mod.Player): void {
    const id = GetPlayerId(player);

    const objects = playerSpawnedObjects.get(id);
    if (objects) {
        for (const obj of objects) {
            try { mod.UnspawnObject(obj); } catch { }
        }
        playerSpawnedObjects.delete(id);
    }

    const icon = playerPreviewIcons.get(id);
    if (icon) {
        try { mod.UnspawnObject(icon as unknown as mod.Object); } catch { }
        playerPreviewIcons.delete(id);
    }

    const lineIcons = playerLinePreviewIcons.get(id);
    if (lineIcons) {
        for (const li of lineIcons) {
            try { mod.UnspawnObject(li as unknown as mod.Object); } catch { }
        }
        playerLinePreviewIcons.delete(id);
    }

    const statusIcon = playerStatusIcons.get(id);
    if (statusIcon) {
        try { mod.UnspawnObject(statusIcon as unknown as mod.Object); } catch { }
        playerStatusIcons.delete(id);
    }

    const hintVfxCleanup = playerLineHintVfx.get(id);
    if (hintVfxCleanup) {
        mod.EnableVFX(hintVfxCleanup, false);
        try { mod.UnspawnObject(hintVfxCleanup as unknown as mod.Object); } catch { }
        playerLineHintVfx.delete(id);
    }

    const slotConfirmCleanup = playerLineSlotConfirmVfx.get(id);
    if (slotConfirmCleanup) {
        for (const sv of slotConfirmCleanup) if (sv) { mod.EnableVFX(sv, false); try { mod.UnspawnObject(sv as unknown as mod.Object); } catch { } }
        playerLineSlotConfirmVfx.delete(id);
    }
    UnspawnSideTorches(id);
    UnspawnSlotTorches(id);
}

function ResetPlayerState(player: mod.Player): void {
    const id = GetPlayerId(player);
    playerPropIndex.delete(id);
    playerRaycastInFlight.delete(id);
    playerRaycastPurpose.delete(id);
    playerPreviewTick.delete(id);
    playerHasSpawned.delete(id);
    playerLineMode.delete(id);
    playerLineAnchorPos.delete(id);
    playerLineAnchorRot.delete(id);
    playerLineDir.delete(id);
    playerLineCursorPos.delete(id);
    playerRatchetAngle.delete(id);
    playerRatchetNotch.delete(id);
    playerLineCount.delete(id);
    playerLineCursorState.delete(id);
    playerLineFrozen.delete(id);
    playerLineHintVfx.delete(id);        // object already unspawned by CleanupPlayerObjects
    playerLineSlotConfirmVfx.delete(id); // objects already unspawned by CleanupPlayerObjects
    playerLineSlotTorchVfx.delete(id);   // objects already unspawned by CleanupPlayerObjects
    playerLineSideTorchVfx.delete(id);   // objects already unspawned by CleanupPlayerObjects
}

// ---- Bot test harness helpers ---------------------------------------------

async function _BotTestSpawnBot(): Promise<void> {
    await mod.Wait(10);
    if (!BOT_TEST_ENABLED) return;
    const spawner = mod.GetSpawner(BOT_TEST_SPAWNER_ID);
    mod.AISetUnspawnOnDead(spawner, true);
    mod.SpawnAIFromAISpawner(spawner);
}

async function _BotTestRunCycle(bot: mod.Player): Promise<void> {
    // Let the engine finish placing the bot before touching it.
    await mod.Wait(0.25);
    if (!mod.IsPlayerValid(bot)) return;

    _botTestBot = bot;
    const id = GetPlayerId(bot);

    // Keep the bot stationary; suppress all AI gadget-usage criteria.
    mod.AIIdleBehavior(bot);
    mod.AIGadgetSettings(bot, false, false, false);
    try { mod.AddEquipment(bot, mod.Gadgets.Misc_PortalGadget); } catch { }
    try { mod.ForceSwitchInventory(bot, mod.InventorySlots.GadgetOne); } catch { }

    // Aim at the target floor surface and wait for the aim to settle.
    mod.AISetFocusPoint(bot, BOT_TEST_AIM_POS, false);
    await mod.Wait(BOT_TEST_FIRE_DELAY);
    if (!mod.IsPlayerValid(bot)) return;

    // Re-confirm aim then pull the trigger.
    mod.AISetFocusPoint(bot, BOT_TEST_AIM_POS, false);
    mod.AIForceFire(bot, 0.3);

    // Wait long enough for the spawn raycast callback to arrive.
    await mod.Wait(BOT_TEST_CONFIRM_DELAY);
    if (!mod.IsPlayerValid(bot)) return;

    // A prop will be in playerSpawnedObjects once the anchor is placed
    // (even while still in line-mode before the second click).
    const objs = playerSpawnedObjects.get(id);
    if (objs && objs.length > 0) {
        console.log(`[PropBotTest] PASS - bot(${id}) placed ${objs.length} prop(s)`);
    } else {
        console.log(`[PropBotTest] FAIL - bot(${id}) placed no props`);
    }

    // Kill the bot.  OnPlayerDied handles cleanup and schedules the next spawn.
    try { mod.Kill(bot); } catch { }
}

// ---- Event handlers --------------------------------------------------------

export function OnGameModeStarted(): void {
    // New round: clear spawn usage so everyone gets a fresh spawn.
    // Spawned objects are cleaned up per-player in OnPlayerDied / OnPlayerUndeploy.
    playerHasSpawned.clear();
    if (BOT_TEST_ENABLED) _BotTestSpawnBot();
}

export function OnPlayerDeployed(player: mod.Player): void {
    mod.AddEquipment(player, mod.Gadgets.Misc_PortalGadget);
    // Assign a random starting prop so each player gets a different prop on spawn.
    const id = GetPlayerId(player);
    playerPropIndex.set(id, Math.floor(Math.random() * PROP_CONFIGS.length));
    // Preview icon is spawned lazily on first raycast hit (GetOrCreatePreviewIcon).
    // Line preview icons are spawned lazily in UpdateLinePreviews on first use.
}

// Aim button pressed: activate line-mode extension (unfreeze line drag).
export function OnPortalGadgetAimStart(player: mod.Player): void {
    const id = GetPlayerId(player);
    if (!playerLineMode.has(id)) return;
    if (playerLineFrozen.has(id)) {
        playerLineFrozen.delete(id);
        // Hide keyhole hint — side torches take over as positional guidance in ADS.
        const hintVfx = playerLineHintVfx.get(id);
        if (hintVfx) mod.EnableVFX(hintVfx, false);
        // Spawn the two side torches at ±1 step from the anchor.
        const anchorPos = playerLineAnchorPos.get(id);
        if (anchorPos) SpawnOrMoveSideTorches(player, anchorPos);
    }
}

// Aim button released: deactivate line-mode extension (re-freeze line drag).
export function OnPortalGadgetAimStop(player: mod.Player): void {
    const id = GetPlayerId(player);
    if (!playerLineMode.has(id)) return;
    if (!playerLineFrozen.has(id)) {
        playerLineFrozen.add(id);
        UnspawnSideTorches(id);
        UnspawnSlotTorches(id);
    }
}

// Tactical Device button: undo the placed anchor prop (or all placed props if finalized),
// reverting to pre-placement state so the player can try again with the same prop.
export function OnPortalGadgetLaserToggle(player: mod.Player, _eventBoolean: boolean): void {
    const id = GetPlayerId(player);
    const savedPropIndex = playerPropIndex.get(id);
    if (playerLineMode.has(id)) {
        CancelLinePlacement(player);
    } else {
        CleanupPlayerObjects(player);
        ResetPlayerState(player);
    }
    // Restore prop index so undo doesn't roll a new random prop
    if (savedPropIndex !== undefined) {
        playerPropIndex.set(id, savedPropIndex);
    }
}

export function OnPortalGadgetFireStop(_player: mod.Player): void {
    // Intentionally empty: preview icon visibility is managed by the raycast
    // preview loop (OngoingPlayer) and line-mode transitions (HidePreviewIcon
    // is called on line-mode entry/exit and cleanup).  Hiding here caused the
    // icon to be cleared every time FireStop fired, preventing it from ever
    // appearing during normal aiming.
}

export function OnPortalGadgetFireStart(player: mod.Player): void {
    const id = GetPlayerId(player);

    if (playerLineMode.has(id)) {
        // Second click: finalize the line and exit line mode.
        FinalizeLinePlacement(player);
        return;
    }

    if (playerRaycastInFlight.has(id)) {
        // A preview raycast is already in flight -- upgrade it to a spawn so its
        // OnRayCastHit result is used for placement instead of discarded.
        playerRaycastPurpose.set(id, "spawn");
    } else {
        const { start, end } = GetRaycastVectors(player);
        playerRaycastInFlight.add(id);
        playerRaycastPurpose.set(id, "spawn");
        mod.RayCast(player, start, end);
    }
}

export function OngoingPlayer(player: mod.Player): void {
    if (!mod.IsPlayerValid(player)) return;
    const id = GetPlayerId(player);

    if (playerLineMode.has(id)) {
        // In line mode: fire throttled line_cursor raycasts to track ground hits.
        const anchorPos = playerLineAnchorPos.get(id);
        if (anchorPos) {
            if (playerLineFrozen.has(id)) {
                // Extension inactive: still track aim to keep status icon current.
                if (!playerRaycastInFlight.has(id)) {
                    const tick = (playerPreviewTick.get(id) ?? 0) + 1;
                    playerPreviewTick.set(id, tick);
                    if (tick % PREVIEW_TICK_INTERVAL === 0) {
                        const { start, end } = GetRaycastVectors(player);
                        playerRaycastInFlight.add(id);
                        playerRaycastPurpose.set(id, "line_cursor");
                        mod.RayCast(player, start, end);
                    }
                }
                const cachedCursor = playerLineCursorPos.get(id);
                const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
                const eyePos = mod.GetSoldierState(player, mod.SoldierStateVector.EyePosition);
                const aimPoint = cachedCursor ?? mod.Add(eyePos, mod.Multiply(facing, LINE_CURSOR_MAX_DIST));

                // Rotate anchor prop to face toward the player while frozen,
                // but only when there is just the root prop (no line queued yet).
                const frozenLineCount = playerLineCount.get(id) ?? 1;
                const frozenObjects = playerSpawnedObjects.get(id);
                if (frozenLineCount <= 1 && frozenObjects && frozenObjects.length > 0) {
                    const anchor = frozenObjects[frozenObjects.length - 1];
                    const playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
                    const toPx = mod.XComponentOf(playerPos) - mod.XComponentOf(anchorPos);
                    const toPz = mod.ZComponentOf(playerPos) - mod.ZComponentOf(anchorPos);
                    const yaw = Math.atan2(toPx, toPz);
                    const rot = mod.CreateVector(0, yaw, 0);
                    playerLineAnchorRot.set(id, rot);
                    const objectPos = ComputeObjectPosFromPivot(anchorPos, yaw, GetPropConfig(player));
                    try { mod.SetObjectTransform(anchor, mod.CreateTransform(objectPos, rot)); } catch { }
                }

                // Keyhole hint VFX: show first-extension-slot when player looks at anchor.
                const frozenHintVfx = playerLineHintVfx.get(id);
                if (frozenHintVfx) {
                    const hFx = mod.XComponentOf(facing);
                    const hFz = mod.ZComponentOf(facing);
                    const hFLen = Math.sqrt(hFx * hFx + hFz * hFz);
                    if (hFLen > 0.001) {
                        // Keyholed: player facing aligns with direction toward anchor
                        const dax = mod.XComponentOf(anchorPos) - mod.XComponentOf(eyePos);
                        const day = mod.YComponentOf(anchorPos) - mod.YComponentOf(eyePos);
                        const daz = mod.ZComponentOf(anchorPos) - mod.ZComponentOf(eyePos);
                        const daLen = Math.sqrt(dax * dax + day * day + daz * daz);
                        const dotToAnchor = daLen > 0.001
                            ? (mod.XComponentOf(facing) * dax + mod.YComponentOf(facing) * day + mod.ZComponentOf(facing) * daz) / daLen
                            : 0;
                        if (dotToAnchor >= GetPropConfig(player).keyholeMinDot) {
                            mod.EnableVFX(frozenHintVfx, true);
                        } else {
                            mod.EnableVFX(frozenHintVfx, false);
                        }
                    } else {
                        mod.EnableVFX(frozenHintVfx, false);
                    }
                }

                ShowStatusIcon(player, aimPoint,
                    mod.Message(mod.stringkeys.prop_spawner_hold_ads_extend),
                    mod.CreateVector(0.8, 0.8, 1.0));
                return;
            }

            // Fire a throttled raycast to get a precise ground cursor.
            if (!playerRaycastInFlight.has(id)) {
                const tick = (playerPreviewTick.get(id) ?? 0) + 1;
                playerPreviewTick.set(id, tick);
                if (tick % PREVIEW_TICK_INTERVAL === 0) {
                    const { start, end } = GetRaycastVectors(player);
                    playerRaycastInFlight.add(id);
                    playerRaycastPurpose.set(id, "line_cursor");
                    mod.RayCast(player, start, end);
                }
            }

            // Use the cached floor hit if available; otherwise fall back to aim projection.
            // Use LINE_CURSOR_MAX_DIST for the fallback to reduce rotational sensitivity.
            const cachedCursor = playerLineCursorPos.get(id);
            const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
            const eyePos = mod.GetSoldierState(player, mod.SoldierStateVector.EyePosition);
            const cursorPos = cachedCursor ?? mod.Add(eyePos, mod.Multiply(facing, LINE_CURSOR_MAX_DIST));

            const dist = HorizontalDistance(anchorPos, cursorPos);

            if (dist < GetPropConfig(player).lineDragMinDist) {
                // Cursor is close to anchor - prop tracks toward the player, no line shown.
                const objects = playerSpawnedObjects.get(id);
                if (objects && objects.length > 0) {
                    const anchor = objects[objects.length - 1];
                    const playerPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
                    const toPx = mod.XComponentOf(playerPos) - mod.XComponentOf(anchorPos);
                    const toPz = mod.ZComponentOf(playerPos) - mod.ZComponentOf(anchorPos);
                    const yaw = Math.atan2(toPx, toPz);
                    const rot = mod.CreateVector(0, yaw, 0);
                    playerLineAnchorRot.set(id, rot);
                    const objectPos = ComputeObjectPosFromPivot(anchorPos, yaw, GetPropConfig(player));
                    try { mod.SetObjectTransform(anchor, mod.CreateTransform(objectPos, rot)); } catch { }
                }
                HideLinePreviews(player); // also unspawns slot torches
                // Keep side torches updated as the anchor rotates.
                SpawnOrMoveSideTorches(player, anchorPos);
                HideStatusIcon(player);
            } else {
                // Cursor is far enough - engage line drag.
                const lineDir = ComputeLineDirection(anchorPos, cursorPos);
                if (lineDir) {
                    const config = GetPropConfig(player);
                    const cursorState = playerLineCursorState.get(id);
                    const statusPos = cursorPos;

                    if (cursorState === "invalid_surface" || cursorState === "out_of_range") {
                        // Freeze rotation - keep last valid facing, hide child previews.
                        HideLinePreviews(player);
                        const errorMsg = cursorState === "invalid_surface"
                            ? mod.Message(mod.stringkeys.prop_spawner_invalid_surface)
                            : mod.Message(mod.stringkeys.prop_spawner_out_of_range);
                        ShowStatusIcon(player, statusPos, errorMsg, mod.CreateVector(1, 0.35, 0));
                    } else {
                        RotateAnchorProp(player, lineDir);
                        const facingYaw = mod.YComponentOf(playerLineAnchorRot.get(id) ?? ZERO_VEC);
                        const effectiveStep = ComputeEffectiveStep(lineDir, facingYaw, config);
                        const count = ComputeLineCount(anchorPos, cursorPos, effectiveStep);
                        const prevRatchetCount = playerLineCount.get(id) ?? 1;
                        UpdateLinePreviews(player, anchorPos, lineDir, count, effectiveStep);

                        if (count === 1) {
                            HideStatusIcon(player);
                        } else {
                            const altPhase = Math.floor(Date.now() / 2000) % 2 === 0;
                            ShowStatusIcon(player, statusPos,
                                altPhase
                                    ? mod.Message(mod.stringkeys.prop_spawner_fire_to_confirm, count)
                                    : mod.Message(mod.stringkeys.prop_spawner_undo),
                                mod.CreateVector(0.2, 1, 0.2));
                        }

                        // Ratchet: ticking SFX every LINE_RATCHET_DEG of aim sweep.
                        // Volume escalates within each prop count bracket, resets on bracket change.
                        const lineYaw = Math.atan2(mod.XComponentOf(lineDir), mod.ZComponentOf(lineDir));
                        if (count !== prevRatchetCount) {
                            // Bracket changed - anchor to current angle and reset notch volume
                            playerRatchetAngle.set(id, lineYaw);
                            playerRatchetNotch.set(id, 0);
                        } else {
                            const lastRatchetAngle = playerRatchetAngle.get(id);
                            if (lastRatchetAngle === undefined) {
                                playerRatchetAngle.set(id, lineYaw);
                                playerRatchetNotch.set(id, 0);
                            } else {
                                const delta = SmallestAngleDelta(lastRatchetAngle, lineYaw);
                                if (delta >= LINE_RATCHET_DEG * (Math.PI / 180)) {
                                    playerRatchetAngle.set(id, lineYaw);
                                    const notch = (playerRatchetNotch.get(id) ?? 0) + 1;
                                    playerRatchetNotch.set(id, notch);
                                    const amp = Math.min(RATCHET_BASE_AMP + notch * RATCHET_AMP_STEP, RATCHET_MAX_AMP);
                                    // Sound at the last visible preview icon position, or cursor if none
                                    const ratchetSlot = count - 1;
                                    const ratchetPos = ratchetSlot > 0
                                        ? mod.CreateVector(
                                            mod.XComponentOf(anchorPos) + mod.XComponentOf(lineDir) * ratchetSlot * effectiveStep,
                                            mod.YComponentOf(anchorPos),
                                            mod.ZComponentOf(anchorPos) + mod.ZComponentOf(lineDir) * ratchetSlot * effectiveStep
                                        )
                                        : cursorPos;
                                    PlaySFX3DAtPos(SFX_RATCHET, amp, ratchetPos);
                                }
                            }
                        }
                    }
                }
            }
        }
        return; // don't fire preview raycasts while in line mode
    }

    if (playerRaycastInFlight.has(id)) return; // never stack raycasts

    const tick = (playerPreviewTick.get(id) ?? 0) + 1;
    playerPreviewTick.set(id, tick);
    if (tick % PREVIEW_TICK_INTERVAL !== 0) return;

    const { start, end } = GetRaycastVectors(player);
    playerRaycastInFlight.add(id);
    playerRaycastPurpose.set(id, "preview");
    mod.RayCast(player, start, end);
}

// Engine may emit either casing; route both to the same handler.
export function OnGoingPlayer(player: mod.Player): void {
    OngoingPlayer(player);
}

export function OnRayCastHit(eventPlayer: mod.Player, eventPoint: mod.Vector, eventNormal: mod.Vector): void {
    const id = GetPlayerId(eventPlayer);
    const purpose = playerRaycastPurpose.get(id);
    playerRaycastInFlight.delete(id);
    playerRaycastPurpose.delete(id);

    const isFloor = mod.YComponentOf(eventNormal) >= MIN_FLOOR_NORMAL_Y;

    if (purpose === "spawn") {
        if (!isFloor) {
            // Placement rejected: surface is a wall or ceiling
            ShowPreviewIconError(eventPlayer, eventPoint, mod.Message(mod.stringkeys.prop_spawner_invalid_surface));
            return;
        }

        const config = GetPropConfig(eventPlayer);
        const pivotPos = eventPoint; // raw hit = visual centre (pivot)
        const spawnRot = GetFacingPlayerRotation(eventPlayer);
        const spawnYaw = mod.YComponentOf(spawnRot);
        const spawnPos = ComputeObjectPosFromPivot(pivotPos, spawnYaw, config);
        const prop = mod.SpawnObject(config.prop, spawnPos, spawnRot, ONE_VEC);

        if (prop) {
            // Enter line mode: anchor recorded, prop cycle NOT advanced yet (happens at finalize).
            playerLineMode.add(id);
            playerLineAnchorPos.set(id, pivotPos);
            playerLineAnchorRot.set(id, spawnRot);
            playerLineCount.set(id, 1);
            playerLineFrozen.add(id); // start frozen; laser toggle activates extension

            const list = playerSpawnedObjects.get(id) ?? [];
            list.push(prop);
            playerSpawnedObjects.set(id, list);

            // VFX at the anchor + initialise ratchet state
            const anchorVfx = mod.SpawnObject(VFX_ANCHOR_LAUNCH, spawnPos, ZERO_VEC) as mod.VFX;
            if (anchorVfx) mod.EnableVFX(anchorVfx, true);
            playerRatchetAngle.delete(id);
            playerRatchetNotch.set(id, 0);

            // Keep the cursor preview icon hidden during line-drag
            HidePreviewIcon(eventPlayer);
        }
    } else if (purpose === "line_cursor") {
        // Update the cached line cursor if the hit is a floor within threshold distance of anchor.
        const anchorPos = playerLineAnchorPos.get(id);
        if (isFloor && anchorPos && HorizontalDistance(anchorPos, eventPoint) <= LINE_CURSOR_MAX_DIST) {
            playerLineCursorPos.set(id, eventPoint);
            playerLineCursorState.set(id, "valid");
        } else {
            playerLineCursorPos.delete(id);
            playerLineCursorState.set(id, isFloor ? "out_of_range" : "invalid_surface");
        }
    } else {
        // Preview: update icon position and validity
        if (isFloor) {
            ShowPreviewIconValid(eventPlayer, eventPoint);
        } else {
            ShowPreviewIconError(eventPlayer, eventPoint, mod.Message(mod.stringkeys.prop_spawner_invalid_surface));
        }
    }
}

export function OnRayCastMissed(eventPlayer: mod.Player): void {
    const id = GetPlayerId(eventPlayer);
    const purpose = playerRaycastPurpose.get(id);
    playerRaycastInFlight.delete(id);
    playerRaycastPurpose.delete(id);

    if (purpose === "spawn") {
        // Out of range or no surface within MAX_SPAWN_DISTANCE
        const { end } = GetRaycastVectors(eventPlayer);
        ShowPreviewIconError(eventPlayer, end, mod.Message(mod.stringkeys.prop_spawner_out_of_range));
    } else if (purpose === "line_cursor") {
        // Missed: clear cached cursor and record out-of-range state.
        playerLineCursorPos.delete(id);
        playerLineCursorState.set(id, "out_of_range");
    } else {
        // Preview: show error icon at the raycast end point
        const { end } = GetRaycastVectors(eventPlayer);
        ShowPreviewIconError(eventPlayer, end, mod.Message(mod.stringkeys.prop_spawner_out_of_range));
    }
}

export function OnSpawnerSpawned(eventPlayer: mod.Player, eventSpawner: mod.Spawner): void {
    if (!BOT_TEST_ENABLED) return;
    if (mod.GetObjId(eventSpawner) !== BOT_TEST_SPAWNER_ID) return;
    if (!mod.IsPlayerValid(eventPlayer)) return;
    _BotTestRunCycle(eventPlayer);
}

export function OnPlayerDied(
    eventPlayer: mod.Player,
    eventOtherPlayer: mod.Player,
    eventDeathType: mod.DeathType,
    eventWeaponUnlock: mod.WeaponUnlock
): void {
    CleanupPlayerObjects(eventPlayer);
    ResetPlayerState(eventPlayer);

    // If the test bot died (expected kill or accidental), restart the loop.
    if (BOT_TEST_ENABLED && _botTestBot &&
        GetPlayerId(eventPlayer) === GetPlayerId(_botTestBot)) {
        _botTestBot = undefined;
        (async () => {
            await mod.Wait(BOT_TEST_RESTART_DELAY);
            _BotTestSpawnBot();
        })();
    }
}

export function OnPlayerUndeploy(eventPlayer: mod.Player): void {
    CleanupPlayerObjects(eventPlayer);
    ResetPlayerState(eventPlayer);
}
