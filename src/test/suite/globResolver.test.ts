import * as assert from 'assert';
import { resolveActiveFilterGlobs } from '../../services/globResolver';
import { createFilter, deleteFilter } from '../../services/presetsService';
import { CurrentSearchGlobs } from '../../types';

// ---------------------------------------------------------------------------
// Helper to build a minimal CurrentSearchGlobs object
// ---------------------------------------------------------------------------
function makeCfg(overrides: Partial<CurrentSearchGlobs> = {}): CurrentSearchGlobs {
  return {
    includeGlobs: [],
    excludeGlobs: [],
    customIncludeGlobs: [],
    customExcludeGlobs: [],
    ...overrides,
  };
}

suite('GlobResolver – resolveActiveFilterGlobs', () => {

  // -------------------------------------------------------------------------
  // No active preset
  // -------------------------------------------------------------------------
  suite('no active preset (activeFilterName undefined)', () => {
    test('merges includeGlobs + customIncludeGlobs', async () => {
      const cfg = makeCfg({
        includeGlobs: ['**/*.ts'],
        customIncludeGlobs: ['**/*.js'],
      });
      const result = await resolveActiveFilterGlobs(cfg);
      assert.deepStrictEqual(result.includeGlobs, ['**/*.ts', '**/*.js']);
    });

    test('merges excludeGlobs + customExcludeGlobs', async () => {
      const cfg = makeCfg({
        excludeGlobs: ['**/node_modules/**'],
        customExcludeGlobs: ['**/dist/**'],
      });
      const result = await resolveActiveFilterGlobs(cfg);
      assert.deepStrictEqual(result.excludeGlobs, ['**/node_modules/**', '**/dist/**']);
    });

    test('deduplicates: duplicate in customIncludeGlobs dropped', async () => {
      const cfg = makeCfg({
        includeGlobs: ['**/*.ts', '**/*.js'],
        customIncludeGlobs: ['**/*.ts'],
      });
      const result = await resolveActiveFilterGlobs(cfg);
      assert.deepStrictEqual(result.includeGlobs, ['**/*.ts', '**/*.js']);
    });

    test('deduplicates: duplicate in customExcludeGlobs dropped', async () => {
      const cfg = makeCfg({
        excludeGlobs: ['**/node_modules/**'],
        customExcludeGlobs: ['**/node_modules/**', '**/dist/**'],
      });
      const result = await resolveActiveFilterGlobs(cfg);
      assert.deepStrictEqual(result.excludeGlobs, ['**/node_modules/**', '**/dist/**']);
    });

    test('empty arrays → returns empty includes and excludes', async () => {
      const cfg = makeCfg();
      const result = await resolveActiveFilterGlobs(cfg);
      assert.deepStrictEqual(result, { includeGlobs: [], excludeGlobs: [] });
    });

    test('deduplication preserves first-occurrence order', async () => {
      const cfg = makeCfg({
        includeGlobs: ['a', 'b'],
        customIncludeGlobs: ['b', 'c'],
      });
      const result = await resolveActiveFilterGlobs(cfg);
      assert.deepStrictEqual(result.includeGlobs, ['a', 'b', 'c']);
    });
  });

  // -------------------------------------------------------------------------
  // Preset name provided but not found
  // -------------------------------------------------------------------------
  suite('activeFilterName provided but preset not found', () => {
    test('falls through and merges cfg globs with deduplication', async () => {
      const cfg = makeCfg({
        includeGlobs: ['**/*.ts'],
        customIncludeGlobs: ['**/*.js'],
        activeFilterName: 'nonexistent-preset-xyz',
        activeFilterScope: 'global',
      });
      const result = await resolveActiveFilterGlobs(cfg);
      assert.deepStrictEqual(result.includeGlobs, ['**/*.ts', '**/*.js']);
      assert.deepStrictEqual(result.excludeGlobs, []);
    });

    test('workspace scope also falls through when not found', async () => {
      const cfg = makeCfg({
        includeGlobs: ['**/*.py'],
        activeFilterName: 'nonexistent-preset-xyz',
        activeFilterScope: 'workspace',
      });
      const result = await resolveActiveFilterGlobs(cfg);
      assert.deepStrictEqual(result.includeGlobs, ['**/*.py']);
    });
  });

  // -------------------------------------------------------------------------
  // Active preset found
  // -------------------------------------------------------------------------
  suite('active preset found', () => {
    const PRESET_NAME = '__test-glob-resolver-preset__';

    suiteSetup(async () => {
      // Clean up any stale copy from a previous failed run, then create fresh.
      await deleteFilter('global', PRESET_NAME);
      await createFilter('global', {
        name: PRESET_NAME,
        includeGlobs: ['**/*.py'],
        excludeGlobs: ['**/venv/**'],
        customIncludeGlobs: [],
        customExcludeGlobs: [],
      });
    });

    suiteTeardown(async () => {
      await deleteFilter('global', PRESET_NAME);
    });

    test('preset includeGlobs come before cfg includeGlobs', async () => {
      const cfg = makeCfg({
        includeGlobs: ['**/*.ts'],
        activeFilterName: PRESET_NAME,
        activeFilterScope: 'global',
      });
      const result = await resolveActiveFilterGlobs(cfg);
      assert.ok(result.includeGlobs.indexOf('**/*.py') < result.includeGlobs.indexOf('**/*.ts'),
        `expected preset glob before cfg glob, got: ${JSON.stringify(result.includeGlobs)}`);
    });

    test('preset excludeGlobs come before cfg excludeGlobs', async () => {
      const cfg = makeCfg({
        excludeGlobs: ['**/dist/**'],
        activeFilterName: PRESET_NAME,
        activeFilterScope: 'global',
      });
      const result = await resolveActiveFilterGlobs(cfg);
      assert.ok(result.excludeGlobs.indexOf('**/venv/**') < result.excludeGlobs.indexOf('**/dist/**'),
        `expected preset exclude before cfg exclude, got: ${JSON.stringify(result.excludeGlobs)}`);
    });

    test('result contains all unique globs from preset and cfg', async () => {
      const cfg = makeCfg({
        includeGlobs: ['**/*.ts'],
        customIncludeGlobs: ['**/*.js'],
        activeFilterName: PRESET_NAME,
        activeFilterScope: 'global',
      });
      const result = await resolveActiveFilterGlobs(cfg);
      assert.ok(result.includeGlobs.includes('**/*.py'), 'missing preset glob');
      assert.ok(result.includeGlobs.includes('**/*.ts'), 'missing cfg includeGlob');
      assert.ok(result.includeGlobs.includes('**/*.js'), 'missing cfg customIncludeGlob');
    });

    test('preset globs deduplicated against cfg globs', async () => {
      const cfg = makeCfg({
        // '**/*.py' is also in the preset — should appear only once
        includeGlobs: ['**/*.py', '**/*.ts'],
        activeFilterName: PRESET_NAME,
        activeFilterScope: 'global',
      });
      const result = await resolveActiveFilterGlobs(cfg);
      const pyCount = result.includeGlobs.filter(g => g === '**/*.py').length;
      assert.strictEqual(pyCount, 1, `**/*.py duplicated: ${JSON.stringify(result.includeGlobs)}`);
    });
  });
});
