
const ZERO_VEC = mod.CreateVector(0, 0, 0);
const ONE_VEC = mod.CreateVector(1, 1, 1);
const MAX_RAYCAST_DISTANCE = 120;
const SURFACE_OFFSET = 0.2;
const MAX_TRACKED_PROPS = 64;
const PREVIEW_RAYCAST_EVERY_TICKS = 3;
const PREVIEW_ICON_COLOR = mod.CreateVector(0.2, 1, 0.2);

type RayCastAction = "preview" | "spawn";

const SPAWNABLE_PROPS: mod.RuntimeSpawn_Common[] = [
    mod.RuntimeSpawn_Common.Crate_01_A,
    mod.RuntimeSpawn_Common.SandBags_01_256x60,
    mod.RuntimeSpawn_Common.BarrelOilExplosive_01,
];

const playerPropIndex: Map<number, number> = new Map();
const spawnedProps: mod.Object[] = [];
const playerPreviewIcons: Map<number, mod.WorldIcon> = new Map();
const playerRayCastActionQueue: Map<number, RayCastAction[]> = new Map();
const aimingPlayers: Set<number> = new Set();
const playerPreviewTickCounter: Map<number, number> = new Map();

function ShowMessage(player: mod.Player, message: mod.Message): void {
    mod.DisplayHighlightedWorldLogMessage(message, player);
}

function IsPlayerReferenceValid(player: mod.Player | undefined): boolean {
    if (!player) {
        return false;
    }

    try {
        return mod.GetObjId(player) > -1;
    } catch {
        return false;
    }
}

function SafeGetSoldierStateVector(
    player: mod.Player | undefined,
    state: mod.SoldierStateVector,
): mod.Vector | undefined {
    if (!IsPlayerReferenceValid(player)) {
        return undefined;
    }

    try {
        return mod.GetSoldierState(player as mod.Player, state);
    } catch {
        return undefined;
    }
}

function GetRayCastVectors(player: mod.Player): { start: mod.Vector; end: mod.Vector } | undefined {
    const facingDirectionRaw = SafeGetSoldierStateVector(player, mod.SoldierStateVector.GetFacingDirection);
    const eyePosition = SafeGetSoldierStateVector(player, mod.SoldierStateVector.EyePosition);
    if (!facingDirectionRaw || !eyePosition) {
        return undefined;
    }

    const facingDirection = mod.Normalize(facingDirectionRaw);
    const start = mod.Add(eyePosition, facingDirection);
    const end = mod.Add(start, mod.Multiply(facingDirection, MAX_RAYCAST_DISTANCE));

    return { start, end };
}

function QueueRayCastAction(playerId: number, action: RayCastAction): boolean {
    const queue = playerRayCastActionQueue.get(playerId) ?? [];

    if (action === "preview" && queue[queue.length - 1] === "preview") {
        return false;
    }

    queue.push(action);

    if (queue.length > 8) {
        queue.splice(0, queue.length - 8);
    }

    playerRayCastActionQueue.set(playerId, queue);
    return true;
}

function DequeueRayCastAction(playerId: number): RayCastAction | undefined {
    const queue = playerRayCastActionQueue.get(playerId);
    if (!queue || queue.length === 0) {
        return undefined;
    }

    const action = queue.shift();
    if (queue.length === 0) {
        playerRayCastActionQueue.delete(playerId);
    }

    return action;
}

function RemoveQueuedPreviewActions(playerId: number): void {
    const queue = playerRayCastActionQueue.get(playerId);
    if (!queue || queue.length === 0) {
        return;
    }

    const filteredQueue = queue.filter(action => action === "spawn");
    if (filteredQueue.length === 0) {
        playerRayCastActionQueue.delete(playerId);
        return;
    }

    playerRayCastActionQueue.set(playerId, filteredQueue);
}

function GetOrCreatePreviewIcon(player: mod.Player): mod.WorldIcon | undefined {
    const playerId = mod.GetObjId(player);
    const existingIcon = playerPreviewIcons.get(playerId);
    if (existingIcon) {
        return existingIcon;
    }

    try {
        const spawnedIcon = mod.SpawnObject(mod.RuntimeSpawn_Common.WorldIcon, ZERO_VEC, ZERO_VEC) as mod.WorldIcon;
        mod.SetWorldIconOwner(spawnedIcon, player);
        mod.SetWorldIconImage(spawnedIcon, mod.WorldIconImages.Triangle);
        mod.SetWorldIconColor(spawnedIcon, PREVIEW_ICON_COLOR);
        mod.EnableWorldIconText(spawnedIcon, false);
        mod.EnableWorldIconImage(spawnedIcon, false);
        playerPreviewIcons.set(playerId, spawnedIcon);
        return spawnedIcon;
    } catch {
        return undefined;
    }
}

function HidePreviewIconForPlayerId(playerId: number): void {
    const previewIcon = playerPreviewIcons.get(playerId);
    if (!previewIcon) {
        return;
    }

    try {
        mod.EnableWorldIconImage(previewIcon, false);
        mod.EnableWorldIconText(previewIcon, false);
    } catch {
        // Ignore invalid icon handles during cleanup.
    }
}

function UpdatePreviewForPlayer(player: mod.Player, eventPoint: mod.Vector, eventNormal: mod.Vector): void {
    const previewIcon = GetOrCreatePreviewIcon(player);
    if (!previewIcon) {
        return;
    }

    const previewPosition = mod.Add(eventPoint, mod.Multiply(eventNormal, SURFACE_OFFSET));

    try {
        mod.SetWorldIconPosition(previewIcon, previewPosition);
        mod.EnableWorldIconImage(previewIcon, true);
        mod.EnableWorldIconText(previewIcon, false);
    } catch {
        // Ignore invalid icon handles during update.
    }
}

function CleanupPlayerPreviewState(playerId: number, unspawnPreviewIcon: boolean): void {
    aimingPlayers.delete(playerId);
    playerPreviewTickCounter.delete(playerId);
    playerRayCastActionQueue.delete(playerId);

    const previewIcon = playerPreviewIcons.get(playerId);
    if (!previewIcon) {
        return;
    }

    if (!unspawnPreviewIcon) {
        HidePreviewIconForPlayerId(playerId);
        return;
    }

    try {
        mod.UnspawnObject(previewIcon as mod.Object);
    } catch {
        // Ignore icons that are already gone.
    }

    playerPreviewIcons.delete(playerId);
}

function TryRayCastFromPlayer(player: mod.Player, action: RayCastAction): void {
    if (!IsPlayerReferenceValid(player)) {
        return;
    }

    const rayCastVectors = GetRayCastVectors(player);
    if (!rayCastVectors) {
        return;
    }

    const playerId = mod.GetObjId(player);
    if (!QueueRayCastAction(playerId, action)) {
        return;
    }

    mod.RayCast(player, rayCastVectors.start, rayCastVectors.end);
}

function GetCurrentProp(player: mod.Player): mod.RuntimeSpawn_Common {
    const playerId = mod.GetObjId(player);
    const currentIndex = playerPropIndex.get(playerId) ?? 0;
    return SPAWNABLE_PROPS[currentIndex];
}

function GetPropPreviewMessage(prop: mod.RuntimeSpawn_Common): mod.Message {
    switch (prop) {
        case mod.RuntimeSpawn_Common.Crate_01_A:
            return mod.Message(mod.stringkeys.prop_spawner_preview_crate_01_a);
        case mod.RuntimeSpawn_Common.SandBags_01_256x60:
            return mod.Message(mod.stringkeys.prop_spawner_preview_sandbags_01_256x60);
        case mod.RuntimeSpawn_Common.BarrelOilExplosive_01:
            return mod.Message(mod.stringkeys.prop_spawner_preview_barreloilexplosive_01);
        default:
            return mod.Message(mod.stringkeys.prop_spawner_preview_unknown);
    }
}

function ShowCurrentPropPreviewMessage(player: mod.Player): void {
    const nextProp = GetCurrentProp(player);
    ShowMessage(player, GetPropPreviewMessage(nextProp));
}

function GetNextProp(player: mod.Player): mod.RuntimeSpawn_Common {
    const playerId = mod.GetObjId(player);
    const currentIndex = playerPropIndex.get(playerId) ?? 0;
    const nextIndex = (currentIndex + 1) % SPAWNABLE_PROPS.length;

    playerPropIndex.set(playerId, nextIndex);
    return SPAWNABLE_PROPS[currentIndex];
}

function TrackSpawnedProp(prop: mod.Object): void {
    spawnedProps.push(prop);

    while (spawnedProps.length > MAX_TRACKED_PROPS) {
        const oldestProp = spawnedProps.shift();
        if (!oldestProp) {
            break;
        }

        try {
            mod.UnspawnObject(oldestProp);
        } catch {
            // Ignore objects that are already gone.
        }
    }
}

export function OnPlayerDeployed(player: mod.Player) {
    if (!IsPlayerReferenceValid(player)) {
        return;
    }

    mod.AddEquipment(player, mod.Gadgets.Misc_PortalGadget);
    ShowMessage(player, mod.Message(mod.stringkeys.prop_spawner_ready));
}

export function OnGoingPlayer(player: mod.Player) {
    if (!IsPlayerReferenceValid(player) || !mod.IsPlayerValid(player)) {
        return;
    }

    if (!mod.HasEquipment(player, mod.Gadgets.Misc_PortalGadget)) {
        mod.AddEquipment(player, mod.Gadgets.Misc_PortalGadget);
    }

    const playerId = mod.GetObjId(player);
    if (!aimingPlayers.has(playerId)) {
        return;
    }

    const tickCount = (playerPreviewTickCounter.get(playerId) ?? 0) + 1;
    playerPreviewTickCounter.set(playerId, tickCount);

    if (tickCount % PREVIEW_RAYCAST_EVERY_TICKS !== 0) {
        return;
    }

    TryRayCastFromPlayer(player, "preview");
}

export function OnPortalGadgetAimStart(player: mod.Player) {
    if (!IsPlayerReferenceValid(player)) {
        return;
    }

    const playerId = mod.GetObjId(player);
    aimingPlayers.add(playerId);
    playerPreviewTickCounter.set(playerId, 0);
    ShowCurrentPropPreviewMessage(player);
    TryRayCastFromPlayer(player, "preview");
}

export function OnPortalGadgetAimStop(player: mod.Player): void {
    if (!IsPlayerReferenceValid(player)) {
        return;
    }

    const playerId = mod.GetObjId(player);
    aimingPlayers.delete(playerId);
    playerPreviewTickCounter.delete(playerId);
    RemoveQueuedPreviewActions(playerId);
    HidePreviewIconForPlayerId(playerId);
}

export function OnPortalGadgetFireStart(player: mod.Player) {
    TryRayCastFromPlayer(player, "spawn");
}

export function OnRayCastHit(eventPlayer: mod.Player, eventPoint: mod.Vector, eventNormal: mod.Vector): void {
    if (!IsPlayerReferenceValid(eventPlayer)) {
        return;
    }

    const playerId = mod.GetObjId(eventPlayer);
    const rayCastAction = DequeueRayCastAction(playerId);
    if (!rayCastAction) {
        return;
    }

    if (rayCastAction === "preview") {
        UpdatePreviewForPlayer(eventPlayer, eventPoint, eventNormal);
        return;
    }

    const propToSpawn = GetNextProp(eventPlayer);
    const spawnPosition = mod.Add(eventPoint, mod.Multiply(eventNormal, SURFACE_OFFSET));
    const spawnedProp = mod.SpawnObject(propToSpawn, spawnPosition, ZERO_VEC, ONE_VEC) as mod.Object;

    TrackSpawnedProp(spawnedProp);

    if (aimingPlayers.has(playerId)) {
        UpdatePreviewForPlayer(eventPlayer, eventPoint, eventNormal);
    }

    ShowMessage(eventPlayer, mod.Message(mod.stringkeys.prop_spawner_spawned));
    ShowCurrentPropPreviewMessage(eventPlayer);
}

export function OnRayCastMissed(eventPlayer: mod.Player): void {
    if (!IsPlayerReferenceValid(eventPlayer)) {
        return;
    }

    const playerId = mod.GetObjId(eventPlayer);
    const rayCastAction = DequeueRayCastAction(playerId);
    if (!rayCastAction) {
        return;
    }

    if (rayCastAction === "preview") {
        HidePreviewIconForPlayerId(playerId);
        return;
    }

    ShowMessage(eventPlayer, mod.Message(mod.stringkeys.prop_spawner_no_surface));
}

export function OnPlayerUndeploy(playerObjId: number): void {
    CleanupPlayerPreviewState(playerObjId, false);
}

export function OnPlayerDied(eventPlayer: mod.Player): void {
    if (!IsPlayerReferenceValid(eventPlayer)) {
        return;
    }

    CleanupPlayerPreviewState(mod.GetObjId(eventPlayer), false);
}

export function OnPlayerLeaveGame(eventPlayerID: number): void {
    CleanupPlayerPreviewState(eventPlayerID, true);
    playerPropIndex.delete(eventPlayerID);
}

export function OngoingPlayer(player: mod.Player): void {
    OnGoingPlayer(player);
}