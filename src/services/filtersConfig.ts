import * as vscode from 'vscode';

export interface SearchFilterPreset {
    name: string;
    includeGlobs: string[];
    excludeGlobs: string[];
    customIncludeGlobs?: string[];
    customExcludeGlobs?: string[];
    description?: string;
}

const CONFIG_ROOT = 'smart-search';
const GLOBAL_KEY = 'filters.globalFilters';
const WORKSPACE_KEY = 'filters.workspaceFilters';

/**
 * Validates and normalises a raw array read from VS Code configuration.
 * - Skips entries where "name" is missing, empty, or not a string.
 * - Trims names.
 * - Drops duplicates by name, keeping the first occurrence.
 */
function normalise(raw: unknown[]): SearchFilterPreset[] {
    const seen = new Set<string>();
    const result: SearchFilterPreset[] = [];

    for (const entry of raw) {
        if (typeof entry !== 'object' || entry === null) {
            continue;
        }
        const obj = entry as Record<string, unknown>;

        if (typeof obj['name'] !== 'string') {
            continue;
        }
        const name = (obj['name'] as string).trim();
        if (name === '') {
            continue;
        }
        if (seen.has(name)) {
            continue;
        }
        seen.add(name);

        const includeGlobs = Array.isArray(obj['includeGlobs'])
            ? (obj['includeGlobs'] as unknown[]).filter((g): g is string => typeof g === 'string')
            : [];
        const excludeGlobs = Array.isArray(obj['excludeGlobs'])
            ? (obj['excludeGlobs'] as unknown[]).filter((g): g is string => typeof g === 'string')
            : [];
        const customIncludeGlobs = Array.isArray(obj['customIncludeGlobs'])
            ? (obj['customIncludeGlobs'] as unknown[]).filter((g): g is string => typeof g === 'string')
            : [];
        const customExcludeGlobs = Array.isArray(obj['customExcludeGlobs'])
            ? (obj['customExcludeGlobs'] as unknown[]).filter((g): g is string => typeof g === 'string')
            : [];

        const preset: SearchFilterPreset = {
            name,
            includeGlobs,
            excludeGlobs,
            customIncludeGlobs,
            customExcludeGlobs,
        };

        if (typeof obj['description'] === 'string') {
            preset.description = obj['description'];
        }

        result.push(preset);
    }

    return result;
}

/** Returns the validated global filter presets (ConfigurationTarget.Global). */
export async function getGlobalFilters(): Promise<SearchFilterPreset[]> {
    const config = vscode.workspace.getConfiguration(CONFIG_ROOT);
    const raw = config.get<unknown[]>(GLOBAL_KEY, []);
    return normalise(raw);
}

/** Returns the validated workspace filter presets (ConfigurationTarget.Workspace). */
export async function getWorkspaceFilters(): Promise<SearchFilterPreset[]> {
    const config = vscode.workspace.getConfiguration(CONFIG_ROOT);
    const raw = config.get<unknown[]>(WORKSPACE_KEY, []);
    return normalise(raw);
}

/** Persists presets to global (user) settings. */
export async function saveGlobalFilters(filters: SearchFilterPreset[]): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_ROOT);
    await config.update(GLOBAL_KEY, filters, vscode.ConfigurationTarget.Global);
}

/** Persists presets to workspace settings. */
export async function saveWorkspaceFilters(filters: SearchFilterPreset[]): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_ROOT);
    await config.update(WORKSPACE_KEY, filters, vscode.ConfigurationTarget.Workspace);
}
