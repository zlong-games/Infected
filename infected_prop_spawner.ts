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
}

// ---- Config ----------------------------------------------------------------

const MAX_SPAWN_DISTANCE = 10;   // metres; also used as the raycast end distance
const PREVIEW_TICK_INTERVAL = 3;   // fire a preview raycast every N OngoingPlayer ticks
const MIN_FLOOR_NORMAL_Y = 0.5; // reject surfaces whose Y normal is below this (walls/ceilings)
const MAX_LINE_PROPS = 3;        // maximum number of props that can be placed in a single line row

const ZERO_VEC = mod.CreateVector(0, 0, 0);
const ONE_VEC = mod.CreateVector(1, 1, 1);

// Per-prop placement config. Tune forwardOffset / rightOffset to align each prop's
// visual centre with the player's aim point.
const PROP_CONFIGS: PropConfig[] = [
    {
        prop: mod.RuntimeSpawn_Sand.BarrierConcreteWall_01_192x320,
        forwardOffset: 0,
        rightOffset: 1,
        width: 1.92, // 192 cm face width
        depth: 0.3,  // concrete wall thickness
    },
    {
        prop: mod.RuntimeSpawn_Sand.BarricadeboardsWood_01_B,
        forwardOffset: 0,
        rightOffset: 1,
        width: 1,
        depth: 0.2,
    },
    {
        prop: mod.RuntimeSpawn_Sand.CratePallet_01,
        forwardOffset: 0,
        rightOffset: 0,
        width: 2,
        depth: 1.0,
    },
];

// ---- Per-player state ------------------------------------------------------

// Index into PROP_CONFIGS for the next prop to spawn (cycles after each use)
const playerPropIndex: Map<number, number> = new Map();

// Whether a raycast is currently in flight for this player
const playerRaycastInFlight: Set<number> = new Set();

// What the in-flight raycast was fired for
const playerRaycastPurpose: Map<number, "preview" | "spawn"> = new Map();

// Tick counter used to throttle preview raycasts
const playerPreviewTick: Map<number, number> = new Map();

// Players who have already used their one spawn this round
const playerHasSpawned: Set<number> = new Set();

// Players currently aiming with the portal gadget (enables preview raycasts)
const playerGadgetAiming: Set<number> = new Set();

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
        case mod.RuntimeSpawn_Sand.CratePallet_01:
            return mod.Message(mod.stringkeys.prop_spawner_preview_cratepallet_01);
        default:
            return mod.Message(mod.stringkeys.prop_spawner_preview_unknown);
    }
}

function GetOrCreatePreviewIcon(player: mod.Player): mod.WorldIcon | undefined {
    return playerPreviewIcons.get(GetPlayerId(player));
}

function ShowPreviewIconValid(player: mod.Player, pos: mod.Vector): void {
    const icon = GetOrCreatePreviewIcon(player);
    if (!icon) return;
    mod.SetWorldIconText(icon, GetPropPreviewMessage(GetPropConfig(player).prop));
    mod.SetWorldIconColor(icon, mod.CreateVector(0.2, 1, 0.2));
    mod.SetWorldIconPosition(icon, pos);
    mod.EnableWorldIconImage(icon, true);
    mod.EnableWorldIconText(icon, true);
}

function ShowPreviewIconError(player: mod.Player, pos: mod.Vector, message: mod.Message): void {
    const icon = GetOrCreatePreviewIcon(player);
    if (!icon) return;
    mod.SetWorldIconText(icon, message);
    mod.SetWorldIconColor(icon, mod.CreateVector(1, 0.35, 0));
    mod.SetWorldIconPosition(icon, pos);
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

// Apply per-prop horizontal offsets to align the spawn position with the aim point.
function ApplyHorizontalOffset(position: mod.Vector, player: mod.Player, config: PropConfig): mod.Vector {
    if (config.forwardOffset === 0 && config.rightOffset === 0) return position;

    const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
    // Flatten facing to the horizontal plane so vertical aim angle does not skew offsets
    const facingH = mod.Normalize(mod.CreateVector(
        mod.XComponentOf(facing),
        0,
        mod.ZComponentOf(facing)
    ));
    // Right vector = 90 deg CW rotation of facingH around the Y axis
    const right = mod.CreateVector(mod.ZComponentOf(facingH), 0, -mod.XComponentOf(facingH));

    let result = position;
    if (config.forwardOffset !== 0) {
        result = mod.Add(result, mod.Multiply(facingH, config.forwardOffset));
    }
    if (config.rightOffset !== 0) {
        result = mod.Add(result, mod.Multiply(right, config.rightOffset));
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

// Spawn or ensure existence of line preview icons for slots 2..MAX_LINE_PROPS.
// Icons beyond the current count are hidden; visible ones are positioned.
function UpdateLinePreviews(player: mod.Player, anchorPos: mod.Vector, lineDir: mod.Vector, count: number, effectiveStep: number): void {
    const id = GetPlayerId(player);
    const config = GetPropConfig(player);
    let icons = playerLinePreviewIcons.get(id);
    if (!icons) {
        icons = [];
        playerLinePreviewIcons.set(id, icons);
    }

    // Ensure we have enough icon objects (spawn lazily at anchor so position is valid)
    while (icons.length < MAX_LINE_PROPS - 1) {
        const icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, anchorPos, ZERO_VEC) as mod.WorldIcon;
        if (!icon) break;
        mod.SetWorldIconImage(icon, mod.WorldIconImages.Alert);
        mod.SetWorldIconOwner(icon, player);
        mod.EnableWorldIconImage(icon, false);
        mod.EnableWorldIconText(icon, false);
        icons.push(icon);
    }

    // Slot index 0 = second prop, 1 = third prop, etc.
    for (let i = 0; i < icons.length; i++) {
        const slotIndex = i + 1; // 1-based offset from anchor
        const icon = icons[i];
        if (slotIndex < count) {
            // Position along the line using effective step that accounts for prop facing angle
            const offset = slotIndex * effectiveStep;
            const pos = mod.CreateVector(
                mod.XComponentOf(anchorPos) + mod.XComponentOf(lineDir) * offset,
                mod.YComponentOf(anchorPos),
                mod.ZComponentOf(anchorPos) + mod.ZComponentOf(lineDir) * offset
            );
            mod.SetWorldIconText(icon, GetPropPreviewMessage(config.prop));
            mod.SetWorldIconColor(icon, mod.CreateVector(0.2, 1, 0.2));
            mod.SetWorldIconPosition(icon, pos);
            mod.EnableWorldIconImage(icon, true);
            mod.EnableWorldIconText(icon, true);
        } else {
            mod.EnableWorldIconImage(icon, false);
            mod.EnableWorldIconText(icon, false);
        }
    }

    playerLineCount.set(id, count);
}

function HideLinePreviews(player: mod.Player): void {
    const id = GetPlayerId(player);
    const icons = playerLinePreviewIcons.get(id);
    if (!icons) return;
    for (const icon of icons) {
        mod.EnableWorldIconImage(icon, false);
        mod.EnableWorldIconText(icon, false);
    }
    playerLineCount.set(id, 1);
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
    const perp1z =  ldx;

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
    try { mod.SetObjectTransform(anchor, mod.CreateTransform(anchorPos, rot)); } catch { }
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
        for (let i = 1; i < count; i++) {
            const offset = i * effectiveStep;
            const pos = mod.CreateVector(
                mod.XComponentOf(anchorPos) + mod.XComponentOf(lineDir) * offset,
                mod.YComponentOf(anchorPos),
                mod.ZComponentOf(anchorPos) + mod.ZComponentOf(lineDir) * offset
            );
            const prop = mod.SpawnObject(config.prop as mod.RuntimeSpawn_Sand, pos, anchorRot!, ONE_VEC);
            if (prop) list.push(prop);
        }
        playerSpawnedObjects.set(id, list);
    }

    // Exit line mode
    playerLineMode.delete(id);
    playerLineAnchorPos.delete(id);
    playerLineAnchorRot.delete(id);
    playerLineDir.delete(id);
    HideLinePreviews(player);

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
    HideLinePreviews(player);
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
}

function ResetPlayerState(player: mod.Player): void {
    const id = GetPlayerId(player);
    playerPropIndex.delete(id);
    playerRaycastInFlight.delete(id);
    playerRaycastPurpose.delete(id);
    playerPreviewTick.delete(id);
    playerHasSpawned.delete(id);
    playerGadgetAiming.delete(id);
    playerLineMode.delete(id);
    playerLineAnchorPos.delete(id);
    playerLineAnchorRot.delete(id);
    playerLineDir.delete(id);
    playerLineCount.delete(id);
}

// ---- Event handlers --------------------------------------------------------

export function OnGameModeStarted(): void {
    // New round: clear spawn usage so everyone gets a fresh spawn.
    // Spawned objects are cleaned up per-player in OnPlayerDied / OnPlayerUndeploy.
    playerHasSpawned.clear();
}

export function OnPlayerDeployed(player: mod.Player): void {
    mod.AddEquipment(player, mod.Gadgets.Misc_PortalGadget);

    // Pre-spawn the preview icon at the player's position so SpawnObject
    // receives a valid world position
    const spawnPos = mod.GetSoldierState(player, mod.SoldierStateVector.GetPosition);
    const id = GetPlayerId(player);
    const icon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, spawnPos, ZERO_VEC) as mod.WorldIcon;
    if (icon) {
        mod.SetWorldIconImage(icon, mod.WorldIconImages.Alert);
        mod.SetWorldIconOwner(icon, player);
        mod.EnableWorldIconImage(icon, false);
        mod.EnableWorldIconText(icon, false);
        playerPreviewIcons.set(id, icon);
    }
    // Line preview icons are spawned lazily in UpdateLinePreviews on first use.
}

export function OnPortalGadgetAimStart(player: mod.Player): void {
    const id = GetPlayerId(player);
    if (playerLineMode.has(id)) {
        // Right-click during line mode cancels the anchor and restarts placement.
        CancelLinePlacement(player);
        return;
    }
    playerGadgetAiming.add(id);
    // Icon becomes visible on next preview raycast result
}

export function OnPortalGadgetAimStop(player: mod.Player): void {
    playerGadgetAiming.delete(GetPlayerId(player));
    HidePreviewIcon(player);
    // Keep line previews visible if in line mode; they will update on next aim tick.
    if (!playerLineMode.has(GetPlayerId(player))) {
        HideLinePreviews(player);
    }
}

export function OnPortalGadgetFireStop(player: mod.Player): void {
    // If the gadget is not being aimed after firing, ensure icon is hidden
    if (!playerGadgetAiming.has(GetPlayerId(player))) {
        HidePreviewIcon(player);
    }
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
    const id = GetPlayerId(player);

    if (playerLineMode.has(id)) {
        // In line mode: use the current aim direction to update the line preview
        // without needing a raycast - the Y is taken from the stored anchor position.
        const anchorPos = playerLineAnchorPos.get(id);
        if (anchorPos) {
            const facing = mod.Normalize(mod.GetSoldierState(player, mod.SoldierStateVector.GetFacingDirection));
            const facingH = mod.Normalize(mod.CreateVector(
                mod.XComponentOf(facing), 0, mod.ZComponentOf(facing)
            ));
            // Project ahead to approximate where the player is aiming on the ground
            const eyePos = mod.GetSoldierState(player, mod.SoldierStateVector.EyePosition);
            const projDist = MAX_SPAWN_DISTANCE;
            const cursorPos = mod.Add(eyePos, mod.Multiply(facing, projDist));

            const lineDir = ComputeLineDirection(anchorPos, cursorPos);
            if (lineDir) {
                const config = GetPropConfig(player);
                // RotateAnchorProp must run first so playerLineAnchorRot is set before ComputeEffectiveStep reads it.
                RotateAnchorProp(player, lineDir);
                const facingYaw = mod.YComponentOf(playerLineAnchorRot.get(id) ?? ZERO_VEC);
                const effectiveStep = ComputeEffectiveStep(lineDir, facingYaw, config);
                const count = ComputeLineCount(anchorPos, cursorPos, effectiveStep);
                UpdateLinePreviews(player, anchorPos, lineDir, count, effectiveStep);
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
        const spawnPos = ApplyHorizontalOffset(eventPoint, eventPlayer, config);
        // Initial rotation faces toward the player; will be adjusted as the player drags.
        const spawnRot = GetFacingPlayerRotation(eventPlayer);
        const prop = mod.SpawnObject(config.prop, spawnPos, spawnRot, ONE_VEC);

        if (prop) {
            // Enter line mode: anchor recorded, prop cycle NOT advanced yet (happens at finalize).
            playerLineMode.add(id);
            playerLineAnchorPos.set(id, spawnPos);
            playerLineAnchorRot.set(id, spawnRot);
            playerLineCount.set(id, 1);

            const list = playerSpawnedObjects.get(id) ?? [];
            list.push(prop);
            playerSpawnedObjects.set(id, list);

            // Keep the cursor preview icon hidden during line-drag
            HidePreviewIcon(eventPlayer);
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
    } else {
        // Preview: show error icon at the raycast end point
        const { end } = GetRaycastVectors(eventPlayer);
        ShowPreviewIconError(eventPlayer, end, mod.Message(mod.stringkeys.prop_spawner_out_of_range));
    }
}

export function OnPlayerDied(
    eventPlayer: mod.Player,
    eventOtherPlayer: mod.Player,
    eventDeathType: mod.DeathType,
    eventWeaponUnlock: mod.WeaponUnlock
): void {
    CleanupPlayerObjects(eventPlayer);
    ResetPlayerState(eventPlayer);
}

export function OnPlayerUndeploy(eventPlayer: mod.Player): void {
    CleanupPlayerObjects(eventPlayer);
    ResetPlayerState(eventPlayer);
}
