import {
    SearchFilterPreset,
    getGlobalFilters,
    getWorkspaceFilters,
    saveGlobalFilters,
    saveWorkspaceFilters,
} from './filtersConfig';

export type FilterScope = 'global' | 'workspace';

export interface ScopedPreset {
    scope: FilterScope;
    preset: SearchFilterPreset;
}

// ---------------------------------------------------------------------------
// In-memory cache
// Populated on first read per scope; invalidated (deleted) on every mutation.
// ---------------------------------------------------------------------------
const cache = new Map<FilterScope, SearchFilterPreset[]>();

async function loadScope(scope: FilterScope): Promise<SearchFilterPreset[]> {
    if (cache.has(scope)) {
        return cache.get(scope)!;
    }
    const presets = scope === 'global'
        ? await getGlobalFilters()
        : await getWorkspaceFilters();
    cache.set(scope, presets);
    return presets;
}

async function persistScope(scope: FilterScope, presets: SearchFilterPreset[]): Promise<void> {
    if (scope === 'global') {
        await saveGlobalFilters(presets);
    } else {
        await saveWorkspaceFilters(presets);
    }
}

function invalidate(scope: FilterScope): void {
    cache.delete(scope);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all presets tagged with their scope.
 * Global entries come first, followed by workspace entries.
 */
export async function listAllFilters(): Promise<ScopedPreset[]> {
    const [globalPresets, workspacePresets] = await Promise.all([
        loadScope('global'),
        loadScope('workspace'),
    ]);

    return [
        ...globalPresets.map(preset => ({ scope: 'global' as FilterScope, preset })),
        ...workspacePresets.map(preset => ({ scope: 'workspace' as FilterScope, preset })),
    ];
}

/**
 * Creates a new filter preset in the given scope.
 * Throws if a preset with the same trimmed name already exists in that scope.
 */
export async function createFilter(
    scope: FilterScope,
    preset: SearchFilterPreset,
): Promise<void> {
    const trimmedName = preset.name.trim();
    if (!trimmedName) {
        throw new Error('Filter name must not be empty.');
    }

    const existing = await loadScope(scope);
    const duplicate = existing.find(p => p.name === trimmedName);
    if (duplicate) {
        throw new Error(
            `A filter named "${trimmedName}" already exists in the ${scope} scope.`,
        );
    }

    const normalised: SearchFilterPreset = { ...preset, name: trimmedName };
    const updated = [...existing, normalised];

    invalidate(scope);
    await persistScope(scope, updated);
}

/**
 * Updates an existing filter preset identified by oldName.
 * The update is merged field-by-field: if a key is present in `update`, that
 * value (including arrays) replaces the existing one; absent keys are kept.
 * Throws if no preset with oldName is found in the given scope.
 */
export async function updateFilter(
    scope: FilterScope,
    oldName: string,
    update: Partial<SearchFilterPreset>,
): Promise<void> {
    const existing = await loadScope(scope);
    const index = existing.findIndex(p => p.name === oldName);
    if (index === -1) {
        throw new Error(
            `No filter named "${oldName}" found in the ${scope} scope.`,
        );
    }

    // If update contains a new name, trim it and verify no collision.
    const mergedName = update.name !== undefined
        ? update.name.trim()
        : existing[index].name;

    if (!mergedName) {
        throw new Error('Filter name must not be empty.');
    }

    if (mergedName !== existing[index].name) {
        const collision = existing.find((p, i) => i !== index && p.name === mergedName);
        if (collision) {
            throw new Error(
                `A filter named "${mergedName}" already exists in the ${scope} scope.`,
            );
        }
    }

    // Spread merge: keys present in `update` win; absent keys keep existing values.
    const merged: SearchFilterPreset = {
        ...existing[index],
        ...update,
        name: mergedName,
    };

    const updated = [...existing];
    updated[index] = merged;

    invalidate(scope);
    await persistScope(scope, updated);
}

/**
 * Removes the preset with the given name from the specified scope.
 * No-op if not found.
 */
export async function deleteFilter(scope: FilterScope, name: string): Promise<void> {
    const existing = await loadScope(scope);
    const filtered = existing.filter(p => p.name !== name);

    // No-op: nothing changed, avoid an unnecessary write and cache invalidation.
    if (filtered.length === existing.length) {
        return;
    }

    invalidate(scope);
    await persistScope(scope, filtered);
}

/**
 * Finds and returns the preset with the given name in the specified scope,
 * or undefined if not found.
 */
export async function findFilter(
    scope: FilterScope,
    name: string,
): Promise<SearchFilterPreset | undefined> {
    const presets = await loadScope(scope);
    return presets.find(p => p.name === name);
}
