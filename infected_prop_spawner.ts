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
}

// ---- Config ----------------------------------------------------------------

const MAX_SPAWN_DISTANCE = 10;   // metres; also used as the raycast end distance
const PREVIEW_TICK_INTERVAL = 3;   // fire a preview raycast every N OngoingPlayer ticks
const MIN_FLOOR_NORMAL_Y = 0.5; // reject surfaces whose Y normal is below this (walls/ceilings)

const ZERO_VEC = mod.CreateVector(0, 0, 0);
const ONE_VEC = mod.CreateVector(1, 1, 1);

// Per-prop placement config. Tune forwardOffset / rightOffset to align each prop's
// visual centre with the player's aim point.
const PROP_CONFIGS: PropConfig[] = [
    {
        prop: mod.RuntimeSpawn_Sand.BarrierConcreteWall_01_192x320,
        forwardOffset: 0,
        rightOffset: 1,
    },
    {
        prop: mod.RuntimeSpawn_Sand.BarricadeboardsWood_01_B,
        forwardOffset: 0,
        rightOffset: 1,
    },
    {
        prop: mod.RuntimeSpawn_Sand.CratePallet_01,
        forwardOffset: 0,
        rightOffset: 0,
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
    if (!playerGadgetAiming.has(GetPlayerId(player))) return;
    const icon = GetOrCreatePreviewIcon(player);
    if (!icon) return;
    mod.SetWorldIconText(icon, GetPropPreviewMessage(GetPropConfig(player).prop));
    mod.SetWorldIconColor(icon, mod.CreateVector(0.2, 1, 0.2));
    mod.SetWorldIconPosition(icon, pos);
    mod.EnableWorldIconImage(icon, true);
    mod.EnableWorldIconText(icon, true);
}

function ShowPreviewIconError(player: mod.Player, pos: mod.Vector, message: mod.Message): void {
    if (!playerGadgetAiming.has(GetPlayerId(player))) return;
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
}

function ResetPlayerState(player: mod.Player): void {
    const id = GetPlayerId(player);
    playerPropIndex.delete(id);
    playerRaycastInFlight.delete(id);
    playerRaycastPurpose.delete(id);
    playerPreviewTick.delete(id);
    playerHasSpawned.delete(id);
    playerGadgetAiming.delete(id);
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
}

export function OnPortalGadgetAimStart(player: mod.Player): void {
    playerGadgetAiming.add(GetPlayerId(player));
    // Icon becomes visible on next preview raycast result
}

export function OnPortalGadgetAimStop(player: mod.Player): void {
    playerGadgetAiming.delete(GetPlayerId(player));
    HidePreviewIcon(player);
}

export function OnPortalGadgetFireStop(player: mod.Player): void {
    // If the gadget is not being aimed after firing, ensure icon is hidden
    if (!playerGadgetAiming.has(GetPlayerId(player))) {
        HidePreviewIcon(player);
    }
}

export function OnPortalGadgetFireStart(player: mod.Player): void {
    const id = GetPlayerId(player);
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
    if (!playerGadgetAiming.has(id)) {
        HidePreviewIcon(player);
        return;
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
        const spawnRot = GetFacingPlayerRotation(eventPlayer);
        const prop = mod.SpawnObject(config.prop, spawnPos, spawnRot, ONE_VEC);

        if (prop) {
            // Advance to the next prop in the rotation
            const currentIdx = playerPropIndex.get(id) ?? 0;
            playerPropIndex.set(id, currentIdx + 1);

            HidePreviewIcon(eventPlayer);

            const list = playerSpawnedObjects.get(id) ?? [];
            list.push(prop);
            playerSpawnedObjects.set(id, list);
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
