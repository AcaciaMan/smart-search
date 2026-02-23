import { findFilter } from './presetsService';
import { CurrentSearchGlobs } from '../types';

/** Removes later exact-string duplicates while preserving first-occurrence order. */
function dedupe(arr: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of arr) {
        if (!seen.has(item)) {
            seen.add(item);
            result.push(item);
        }
    }
    return result;
}

/**
 * Resolves the effective include/exclude glob lists for a search, incorporating
 * a named filter preset when one is active.
 *
 * - No active preset: merges cfg.includeGlobs + cfg.customIncludeGlobs (and the
 *   exclude equivalents), deduplicating each list.
 * - Active preset found: preset globs come first, then cfg globs, deduped.
 * - Active preset not found in config: falls back to the no-preset path.
 */
export async function resolveActiveFilterGlobs(
    cfg: CurrentSearchGlobs,
): Promise<{ includeGlobs: string[]; excludeGlobs: string[] }> {
    if (cfg.activeFilterName && cfg.activeFilterScope) {
        const preset = await findFilter(cfg.activeFilterScope, cfg.activeFilterName);

        if (preset) {
            const includeGlobs = dedupe([
                ...preset.includeGlobs,
                ...(preset.customIncludeGlobs ?? []),
                ...cfg.includeGlobs,
                ...cfg.customIncludeGlobs,
            ]);
            const excludeGlobs = dedupe([
                ...preset.excludeGlobs,
                ...(preset.customExcludeGlobs ?? []),
                ...cfg.excludeGlobs,
                ...cfg.customExcludeGlobs,
            ]);
            return { includeGlobs, excludeGlobs };
        }
        // Preset name provided but not found — fall through to no-preset path.
    }

    // No active preset (or preset not found): use cfg globs only.
    return {
        includeGlobs: dedupe([...cfg.includeGlobs, ...cfg.customIncludeGlobs]),
        excludeGlobs: dedupe([...cfg.excludeGlobs, ...cfg.customExcludeGlobs]),
    };
}
