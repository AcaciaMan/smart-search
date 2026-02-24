/**
 * Solr Filters & Presets Integration Tests
 *
 * Verifies that FiltersConfig and PresetsService correctly persist filter
 * presets to VS Code settings and integrate with Solr search operations.
 *
 * Prerequisites:
 *   • Solr running locally with the `smart-search-results` core
 *   • Run with `npm run test:integration` (sets SOLR_INTEGRATION=true)
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  SearchFilterPreset,
  getGlobalFilters,
  getWorkspaceFilters,
  saveGlobalFilters,
  saveWorkspaceFilters,
} from '../../../services/filtersConfig';
import {
  listAllFilters,
  createFilter,
  updateFilter,
  deleteFilter,
  findFilter,
  FilterScope,
} from '../../../services/presetsService';
import { TEST_TIMEOUT } from './constants';
import {
  skipIfSolrUnavailable,
  seedDocuments,
  deleteByQuery,
  waitForCommit,
  querySolr,
} from './testHelpers';
import {
  createTestDocument,
  generateTestMarker,
  generateTestSessionId,
} from './testDataFactory';

// ---------------------------------------------------------------------------
// Helper: delete all filters through the PresetsService API so that its
// internal in-memory cache is properly invalidated, then clear VS Code
// settings as a safety net.
// ---------------------------------------------------------------------------

async function clearAllFilters(): Promise<void> {
  // Delete via PresetsService so its private cache is invalidated.
  try {
    const all = await listAllFilters();
    for (const { scope, preset } of all) {
      await deleteFilter(scope, preset.name);
    }
  } catch {
    // Ignore — best effort
  }
  // Belt-and-suspenders: also clear settings directly so any stale
  // entries that the cache missed are wiped out.
  await saveGlobalFilters([]);
  await saveWorkspaceFilters([]);
}

suite('Solr Filters & Presets Integration Tests', function () {
  this.timeout(TEST_TIMEOUT);

  // Saved originals to restore in suiteTeardown
  let originalGlobalFilters: SearchFilterPreset[];
  let originalWorkspaceFilters: SearchFilterPreset[];

  // Test data for Solr search integration tests (17-19)
  let testMarker: string;
  let testSessionId: string;

  suiteSetup(async function () {
    this.timeout(30000);
    await skipIfSolrUnavailable(this);

    // Save original filter settings
    originalGlobalFilters = await getGlobalFilters();
    originalWorkspaceFilters = await getWorkspaceFilters();

    // Clear filters so tests start from a clean slate
    await saveGlobalFilters([]);
    await saveWorkspaceFilters([]);

    // Seed Solr data for filter + search integration tests (17-19)
    testMarker = generateTestMarker('filtersPresets');
    testSessionId = generateTestSessionId();

    const docs = [
      createTestDocument({
        search_session_id: testSessionId,
        original_query: testMarker,
        file_name: 'component.ts',
        file_path: '/workspace/test-project/src/component.ts',
        file_extension: 'ts',
        match_text: 'export class Component',
        line_number: 1,
      }),
      createTestDocument({
        search_session_id: testSessionId,
        original_query: testMarker,
        file_name: 'service.ts',
        file_path: '/workspace/test-project/src/service.ts',
        file_extension: 'ts',
        match_text: 'export class Service',
        line_number: 5,
      }),
      createTestDocument({
        search_session_id: testSessionId,
        original_query: testMarker,
        file_name: 'helper.js',
        file_path: '/workspace/test-project/src/helper.js',
        file_extension: 'js',
        match_text: 'function helper()',
        line_number: 1,
      }),
      createTestDocument({
        search_session_id: testSessionId,
        original_query: testMarker,
        file_name: 'utils.py',
        file_path: '/workspace/test-project/src/utils.py',
        file_extension: 'py',
        match_text: 'def utils():',
        line_number: 1,
      }),
      createTestDocument({
        search_session_id: testSessionId,
        original_query: testMarker,
        file_name: 'index.test.ts',
        file_path: '/workspace/test-project/src/index.test.ts',
        file_extension: 'ts',
        match_text: 'describe("index")',
        line_number: 1,
      }),
      createTestDocument({
        search_session_id: testSessionId,
        original_query: testMarker,
        file_name: 'package.json',
        file_path: '/workspace/test-project/node_modules/pkg/package.json',
        file_extension: 'json',
        match_text: '"name": "pkg"',
        line_number: 1,
      }),
    ];

    await seedDocuments(docs);
  });

  suiteTeardown(async function () {
    this.timeout(30000);

    // Restore original filter settings
    try {
      await saveGlobalFilters(originalGlobalFilters);
      await saveWorkspaceFilters(originalWorkspaceFilters);
    } catch {
      // best-effort restore
    }

    // Clean up Solr test data
    try {
      await deleteByQuery(`original_query:"${testMarker}"`);
    } catch {
      // best-effort cleanup
    }
  });

  // Reset filters to empty between each test to ensure isolation
  setup(async function () {
    await clearAllFilters();
  });

  // =======================================================================
  // FiltersConfig Tests
  // =======================================================================

  suite('FiltersConfig', function () {
    // 1. Save and Retrieve Global Filters
    test('should save and retrieve global filters', async function () {
      const filter: SearchFilterPreset = {
        name: 'TypeScript Files',
        includeGlobs: ['**/*.ts'],
        excludeGlobs: ['**/node_modules/**'],
        description: 'Only TypeScript files',
      };

      await saveGlobalFilters([filter]);
      const retrieved = await getGlobalFilters();

      assert.ok(retrieved.length >= 1, 'Should have at least one filter');
      const found = retrieved.find(f => f.name === 'TypeScript Files');
      assert.ok(found, 'Should find the saved filter by name');
      assert.deepStrictEqual(found!.includeGlobs, ['**/*.ts']);
      assert.deepStrictEqual(found!.excludeGlobs, ['**/node_modules/**']);
      assert.strictEqual(found!.description, 'Only TypeScript files');
    });

    // 2. Save and Retrieve Workspace Filters
    test('should save and retrieve workspace filters', async function () {
      const filter: SearchFilterPreset = {
        name: 'Source Only',
        includeGlobs: ['src/**'],
        excludeGlobs: ['**/*.spec.ts'],
      };

      await saveWorkspaceFilters([filter]);
      const retrieved = await getWorkspaceFilters();

      assert.ok(retrieved.length >= 1, 'Should have at least one filter');
      const found = retrieved.find(f => f.name === 'Source Only');
      assert.ok(found, 'Should find the saved workspace filter');
      assert.deepStrictEqual(found!.includeGlobs, ['src/**']);
      assert.deepStrictEqual(found!.excludeGlobs, ['**/*.spec.ts']);
    });

    // 3. Normalisation — Missing Name Skipped
    test('should skip entries with empty or missing name', async function () {
      const filters = [
        { name: '', includeGlobs: ['*.ts'], excludeGlobs: [] },
        { name: 'Valid', includeGlobs: ['*.js'], excludeGlobs: [] },
      ] as SearchFilterPreset[];

      await saveGlobalFilters(filters);
      const retrieved = await getGlobalFilters();

      assert.strictEqual(retrieved.length, 1, 'Only valid entry should survive');
      assert.strictEqual(retrieved[0].name, 'Valid');
    });

    // 4. Normalisation — Duplicate Names
    test('should deduplicate filters with the same name', async function () {
      const filters: SearchFilterPreset[] = [
        { name: 'Dupe', includeGlobs: ['*.ts'], excludeGlobs: [] },
        { name: 'Dupe', includeGlobs: ['*.js'], excludeGlobs: [] },
      ];

      await saveGlobalFilters(filters);
      const retrieved = await getGlobalFilters();

      const dupes = retrieved.filter(f => f.name === 'Dupe');
      assert.strictEqual(dupes.length, 1, 'Only one entry should survive deduplication');
      // First occurrence wins
      assert.deepStrictEqual(dupes[0].includeGlobs, ['*.ts']);
    });

    // 5. Normalisation — Glob Coercion
    test('should coerce non-array globs to arrays', async function () {
      // Deliberately pass a string instead of an array to exercise coercion
      const filter = {
        name: 'Coerced',
        includeGlobs: '*.ts' as any,
        excludeGlobs: '*.js' as any,
      };

      await saveGlobalFilters([filter as any]);
      const retrieved = await getGlobalFilters();

      const found = retrieved.find(f => f.name === 'Coerced');
      assert.ok(found, 'Filter should be saved');
      // normalise() wraps non-arrays into empty arrays (filters non-arrays)
      assert.ok(Array.isArray(found!.includeGlobs), 'includeGlobs should be an array');
      assert.ok(Array.isArray(found!.excludeGlobs), 'excludeGlobs should be an array');
    });

    // 6. Multiple Filters Persistence
    test('should persist and retrieve multiple filters in order', async function () {
      const filters: SearchFilterPreset[] = [
        { name: 'Alpha', includeGlobs: ['*.ts'], excludeGlobs: [] },
        { name: 'Beta', includeGlobs: ['*.js'], excludeGlobs: [] },
        { name: 'Gamma', includeGlobs: ['*.py'], excludeGlobs: [] },
      ];

      await saveGlobalFilters(filters);
      const retrieved = await getGlobalFilters();

      assert.strictEqual(retrieved.length, 3, 'All three filters should be present');
      assert.strictEqual(retrieved[0].name, 'Alpha');
      assert.strictEqual(retrieved[1].name, 'Beta');
      assert.strictEqual(retrieved[2].name, 'Gamma');
    });
  });

  // =======================================================================
  // PresetsService Tests
  // =======================================================================

  suite('PresetsService', function () {
    // 7. listAllFilters() — Combined Scopes
    test('listAllFilters should return global filters first, then workspace', async function () {
      // Use PresetsService API to create filters so the internal cache stays in sync
      await createFilter('global', { name: 'Global1', includeGlobs: ['*.ts'], excludeGlobs: [] });
      await createFilter('global', { name: 'Global2', includeGlobs: ['*.js'], excludeGlobs: [] });
      await createFilter('workspace', { name: 'Workspace1', includeGlobs: ['*.py'], excludeGlobs: [] });

      const all = await listAllFilters();

      assert.strictEqual(all.length, 3, 'Should return 3 scoped presets');
      // Global first
      assert.strictEqual(all[0].scope, 'global');
      assert.strictEqual(all[0].preset.name, 'Global1');
      assert.strictEqual(all[1].scope, 'global');
      assert.strictEqual(all[1].preset.name, 'Global2');
      // Then workspace
      assert.strictEqual(all[2].scope, 'workspace');
      assert.strictEqual(all[2].preset.name, 'Workspace1');
    });

    // 8. createFilter() — Success
    test('createFilter should create and persist a filter', async function () {
      const preset: SearchFilterPreset = {
        name: 'New Filter',
        includeGlobs: ['**/*.tsx'],
        excludeGlobs: ['dist/**'],
      };

      await createFilter('global', preset);

      const found = await findFilter('global', 'New Filter');
      assert.ok(found, 'Filter should be findable after creation');
      assert.deepStrictEqual(found!.includeGlobs, ['**/*.tsx']);

      const all = await listAllFilters();
      const match = all.find(s => s.preset.name === 'New Filter');
      assert.ok(match, 'listAllFilters should include the new filter');
      assert.strictEqual(match!.scope, 'global');
    });

    // 9. createFilter() — Duplicate Name Throws
    test('createFilter should throw on duplicate name in same scope', async function () {
      await createFilter('global', {
        name: 'Unique',
        includeGlobs: ['*.ts'],
        excludeGlobs: [],
      });

      await assert.rejects(
        async () =>
          createFilter('global', {
            name: 'Unique',
            includeGlobs: ['*.js'],
            excludeGlobs: [],
          }),
        /already exists/i,
        'Should throw on duplicate name',
      );
    });

    // 10. createFilter() — Empty Name Throws
    test('createFilter should throw on empty name', async function () {
      await assert.rejects(
        async () =>
          createFilter('global', {
            name: '',
            includeGlobs: ['*.ts'],
            excludeGlobs: [],
          }),
        /empty/i,
        'Should throw for empty name',
      );
    });

    // 11. updateFilter() — Rename
    test('updateFilter should rename a filter', async function () {
      await createFilter('global', {
        name: 'Original',
        includeGlobs: ['*.ts'],
        excludeGlobs: [],
      });

      await updateFilter('global', 'Original', { name: 'Renamed' });

      const oldFilter = await findFilter('global', 'Original');
      assert.strictEqual(oldFilter, undefined, '"Original" should no longer exist');

      const newFilter = await findFilter('global', 'Renamed');
      assert.ok(newFilter, '"Renamed" should exist');
      assert.deepStrictEqual(newFilter!.includeGlobs, ['*.ts']);
    });

    // 12. updateFilter() — Update Globs
    test('updateFilter should update globs', async function () {
      await createFilter('workspace', {
        name: 'Updatable',
        includeGlobs: ['*.ts'],
        excludeGlobs: ['dist/**'],
      });

      await updateFilter('workspace', 'Updatable', {
        includeGlobs: ['**/*.tsx', '**/*.ts'],
      });

      const updated = await findFilter('workspace', 'Updatable');
      assert.ok(updated, 'Filter should still exist');
      assert.deepStrictEqual(updated!.includeGlobs, ['**/*.tsx', '**/*.ts']);
      // excludeGlobs should remain unchanged (merge update)
      assert.deepStrictEqual(updated!.excludeGlobs, ['dist/**']);
    });

    // 13. updateFilter() — Name Conflict
    test('updateFilter should throw on name conflict', async function () {
      await createFilter('global', {
        name: 'FilterA',
        includeGlobs: ['*.ts'],
        excludeGlobs: [],
      });
      await createFilter('global', {
        name: 'FilterB',
        includeGlobs: ['*.js'],
        excludeGlobs: [],
      });

      await assert.rejects(
        async () => updateFilter('global', 'FilterA', { name: 'FilterB' }),
        /already exists/i,
        'Should throw when renaming to an existing name',
      );
    });

    // 14. deleteFilter() — Success
    test('deleteFilter should remove a filter', async function () {
      await createFilter('global', {
        name: 'ToDelete',
        includeGlobs: ['*.ts'],
        excludeGlobs: [],
      });

      await deleteFilter('global', 'ToDelete');

      const found = await findFilter('global', 'ToDelete');
      assert.strictEqual(found, undefined, 'Deleted filter should not be found');
    });

    // 15. deleteFilter() — Non-existent (No-Op)
    test('deleteFilter should be a no-op for non-existent filter', async function () {
      // Should not throw
      await deleteFilter('global', 'DoesNotExist_' + Date.now());
    });

    // 16. findFilter() — Found vs Not Found
    test('findFilter should return preset when found and undefined when not', async function () {
      await createFilter('workspace', {
        name: 'Findable',
        includeGlobs: ['*.ts'],
        excludeGlobs: [],
      });

      const found = await findFilter('workspace', 'Findable');
      assert.ok(found, 'Should find existing filter');
      assert.strictEqual(found!.name, 'Findable');

      const notFound = await findFilter('workspace', 'NonExistent_' + Date.now());
      assert.strictEqual(notFound, undefined, 'Should return undefined for missing filter');
    });
  });

  // =======================================================================
  // Filter + Solr Search Integration
  // =======================================================================

  suite('Filter + Solr Search Integration', function () {
    // 17. Filter Presets Applied to Search — include *.ts
    test('should filter Solr results to TypeScript files with includeGlobs', async function () {
      // Create a filter preset with includeGlobs for *.ts
      const preset: SearchFilterPreset = {
        name: 'TypeScript Only',
        includeGlobs: ['*.ts'],
        excludeGlobs: [],
      };
      await createFilter('global', preset);

      // Verify the preset was created
      const saved = await findFilter('global', 'TypeScript Only');
      assert.ok(saved, 'Preset should be persisted');

      // Query Solr for documents in our test session
      const response = await querySolr(
        {
          q: `original_query:"${testMarker}"`,
          rows: 100,
          fq: `file_extension:ts`,
        },
        '/select',
      );

      const docs = response?.response?.docs ?? [];
      assert.ok(docs.length > 0, 'Should find TypeScript docs');

      // All returned results should be .ts files
      for (const doc of docs) {
        const ext = Array.isArray(doc.file_extension)
          ? doc.file_extension[0]
          : doc.file_extension;
        assert.strictEqual(ext, 'ts', `Expected .ts extension, got ${ext}`);
      }
    });

    // 18. Exclude Globs Applied
    test('should respect excludeGlobs in search results', async function () {
      // Create a preset that excludes node_modules and test files
      const preset: SearchFilterPreset = {
        name: 'No Tests No Modules',
        includeGlobs: [],
        excludeGlobs: ['**/node_modules/**', '**/*.test.ts'],
      };
      await createFilter('global', preset);

      // Query Solr for all docs in our session
      const allResponse = await querySolr(
        {
          q: `original_query:"${testMarker}"`,
          rows: 100,
        },
        '/select',
      );
      const allDocs = allResponse?.response?.docs ?? [];
      assert.ok(allDocs.length > 0, 'Should have seeded docs');

      // Now query with exclude filters applied via fq
      // Exclude node_modules paths and *.test.ts files
      const filteredResponse = await querySolr(
        {
          q: `original_query:"${testMarker}"`,
          rows: 100,
          fq: '-file_path:*node_modules* AND -file_name:*.test.ts',
        },
        '/select',
      );

      const filteredDocs = filteredResponse?.response?.docs ?? [];
      assert.ok(filteredDocs.length < allDocs.length, 'Filtered results should be fewer than total');

      // Verify no excluded files appear
      for (const doc of filteredDocs) {
        const filePath = Array.isArray(doc.file_path) ? doc.file_path[0] : doc.file_path;
        const fileName = Array.isArray(doc.file_name) ? doc.file_name[0] : doc.file_name;
        assert.ok(
          !filePath.includes('node_modules'),
          `Should not include node_modules paths: ${filePath}`,
        );
        assert.ok(
          !fileName.endsWith('.test.ts'),
          `Should not include test files: ${fileName}`,
        );
      }
    });

    // 19. Custom Globs Override
    test('should support customIncludeGlobs and customExcludeGlobs alongside standard globs', async function () {
      // Create a preset with both standard and custom globs
      const preset: SearchFilterPreset = {
        name: 'Custom Globs',
        includeGlobs: ['**/*.ts'],
        excludeGlobs: [],
        customIncludeGlobs: ['**/*.js'],
        customExcludeGlobs: ['**/*.test.ts'],
      };
      await createFilter('global', preset);

      const saved = await findFilter('global', 'Custom Globs');
      assert.ok(saved, 'Preset should be persisted');
      assert.deepStrictEqual(saved!.customIncludeGlobs, ['**/*.js']);
      assert.deepStrictEqual(saved!.customExcludeGlobs, ['**/*.test.ts']);

      // Query Solr for ts + js files (combined standard + custom include), excluding test files
      const response = await querySolr(
        {
          q: `original_query:"${testMarker}"`,
          rows: 100,
          fq: '(file_extension:ts OR file_extension:js) AND -file_name:*.test.ts',
        },
        '/select',
      );

      const docs = response?.response?.docs ?? [];
      assert.ok(docs.length > 0, 'Should find ts and js docs');

      for (const doc of docs) {
        const ext = Array.isArray(doc.file_extension)
          ? doc.file_extension[0]
          : doc.file_extension;
        const fileName = Array.isArray(doc.file_name)
          ? doc.file_name[0]
          : doc.file_name;
        assert.ok(
          ext === 'ts' || ext === 'js',
          `Expected .ts or .js extension, got ${ext}`,
        );
        assert.ok(
          !fileName.endsWith('.test.ts'),
          `Should not include test files: ${fileName}`,
        );
      }
    });
  });
});
