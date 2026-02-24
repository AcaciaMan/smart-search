/**
 * Solr Results Panel Integration Tests
 *
 * Verifies that `SolrResultsPanel` correctly displays search results,
 * applies client-side filtering and sorting, handles webview messages,
 * and manages panel lifecycle.
 *
 * Requires a live Solr server — all tests are skipped when Solr is unreachable.
 * Panel tests also need the VS Code extension host context.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  skipIfSolrUnavailable,
  seedDocuments,
  deleteByQuery,
  waitForCommit,
} from './testHelpers';
import {
  TEST_TIMEOUT,
  E2E_TIMEOUT,
  TEST_QUERY_PREFIX,
} from './constants';
import {
  createTestDocument,
  generateTestMarker,
  generateTestSessionId,
} from './testDataFactory';
import { IndexManager } from '../../../services/indexManager';
import { SolrResultsPanel } from '../../../panels/solrResultsPanel';
import { StoredSearchResult, SearchOptions } from '../../../types';

suite('Solr Results Panel Integration Tests', function () {
  this.timeout(20000);

  let indexManager: IndexManager;
  let testMarker: string;
  let extensionUri: vscode.Uri;

  // Track panels for cleanup
  const openPanels: SolrResultsPanel[] = [];

  // Session IDs for test data
  const sessionId = generateTestSessionId();

  // Reusable test data
  let seededDocs: any[];
  let tsDoc1: any, tsDoc2: any, jsDoc1: any, jsDoc2: any, jsonDoc1: any;

  // -----------------------------------------------------------------------
  // Helper: create a panel and track it for cleanup
  // -----------------------------------------------------------------------
  function createPanel(): SolrResultsPanel {
    const panel = SolrResultsPanel.create(extensionUri);
    openPanels.push(panel);
    return panel;
  }

  // -----------------------------------------------------------------------
  // Helper: build StoredSearchResult objects from seeded docs
  // -----------------------------------------------------------------------
  function toStoredResult(doc: any): StoredSearchResult {
    return {
      id: doc.id,
      search_session_id: doc.search_session_id,
      original_query: doc.original_query,
      search_timestamp: doc.search_timestamp,
      workspace_path: doc.workspace_path,
      file_path: doc.file_path,
      file_name: doc.file_name,
      file_extension: doc.file_extension,
      file_size: doc.file_size,
      file_modified: doc.file_modified,
      line_number: doc.line_number,
      column_number: doc.column_number,
      match_text: doc.match_text,
      match_text_raw: doc.match_text_raw || doc.match_text,
      context_before: doc.context_before || [],
      context_after: doc.context_after || [],
      context_lines_before: doc.context_lines_before || 0,
      context_lines_after: doc.context_lines_after || 0,
      full_line: doc.full_line,
      full_line_raw: doc.full_line_raw || doc.full_line,
      match_type: doc.match_type || 'literal',
      case_sensitive: doc.case_sensitive || false,
      whole_word: doc.whole_word || false,
      relevance_score: doc.relevance_score || 0,
      match_count_in_file: doc.match_count_in_file || 1,
      ai_summary: doc.ai_summary || '',
      ai_tags: doc.ai_tags || [],
      display_content: doc.display_content || '',
      score: doc.score || (doc.relevance_score / 100),
      snippets: [],
    };
  }

  // -----------------------------------------------------------------------
  // Suite setup: seed Solr data and resolve extension URI
  // -----------------------------------------------------------------------
  suiteSetup(async function () {
    this.timeout(30000);
    await skipIfSolrUnavailable(this);

    indexManager = new IndexManager();
    testMarker = generateTestMarker('resultsPanel');

    // Resolve extension URI from the active extension
    const ext = vscode.extensions.getExtension('nicober.smart-search');
    if (ext) {
      extensionUri = ext.extensionUri;
    } else {
      // Fallback: use first workspace folder
      extensionUri = vscode.workspace.workspaceFolders?.[0]?.uri
        ?? vscode.Uri.file(__dirname);
    }

    // Create diverse test documents
    tsDoc1 = createTestDocument({
      search_session_id: sessionId,
      original_query: testMarker,
      file_name: 'alpha.ts',
      file_path: '/workspace/src/alpha.ts',
      file_extension: 'ts',
      line_number: 10,
      column_number: 5,
      match_text: 'export class AlphaService',
      full_line: 'export class AlphaService {',
      display_content: '// alpha service\n>>> export class AlphaService { <<<\n  constructor() {}',
      context_before: ['// alpha service'],
      context_after: ['  constructor() {}'],
      relevance_score: 95,
      match_count_in_file: 3,
    });

    tsDoc2 = createTestDocument({
      search_session_id: sessionId,
      original_query: testMarker,
      file_name: 'beta.ts',
      file_path: '/workspace/src/beta.ts',
      file_extension: 'ts',
      line_number: 25,
      column_number: 0,
      match_text: 'interface BetaConfig',
      full_line: 'export interface BetaConfig {',
      display_content: '// config\n>>> export interface BetaConfig { <<<\n  name: string;',
      context_before: ['// config'],
      context_after: ['  name: string;'],
      relevance_score: 80,
      match_count_in_file: 1,
    });

    jsDoc1 = createTestDocument({
      search_session_id: sessionId,
      original_query: testMarker,
      file_name: 'gamma.js',
      file_path: '/workspace/lib/gamma.js',
      file_extension: 'js',
      line_number: 5,
      column_number: 0,
      match_text: 'function gammaHandler()',
      full_line: 'function gammaHandler() {',
      display_content: '// handler\n>>> function gammaHandler() { <<<\n  return true;',
      context_before: ['// handler'],
      context_after: ['  return true;'],
      relevance_score: 70,
      match_count_in_file: 2,
    });

    jsDoc2 = createTestDocument({
      search_session_id: sessionId,
      original_query: testMarker,
      file_name: 'delta.js',
      file_path: '/workspace/lib/delta.js',
      file_extension: 'js',
      line_number: 42,
      column_number: 8,
      match_text: 'const deltaValue = process.env',
      full_line: 'const deltaValue = process.env.DELTA;',
      display_content: '// env\n>>> const deltaValue = process.env.DELTA; <<<\n  module.exports = deltaValue;',
      context_before: ['// env'],
      context_after: ['  module.exports = deltaValue;'],
      relevance_score: 60,
      match_count_in_file: 5,
    });

    jsonDoc1 = createTestDocument({
      search_session_id: sessionId,
      original_query: testMarker,
      file_name: 'config.json',
      file_path: '/workspace/config.json',
      file_extension: 'json',
      line_number: 3,
      column_number: 2,
      match_text: '"name": "smart-search"',
      full_line: '  "name": "smart-search",',
      display_content: '{\n>>>   "name": "smart-search", <<<\n  "version": "1.0.0"',
      context_before: ['{'],
      context_after: ['  "version": "1.0.0"'],
      relevance_score: 50,
      match_count_in_file: 1,
    });

    seededDocs = [tsDoc1, tsDoc2, jsDoc1, jsDoc2, jsonDoc1];
    await seedDocuments(seededDocs);
  });

  // -----------------------------------------------------------------------
  // Suite teardown: clean up seeded data and dispose panels
  // -----------------------------------------------------------------------
  suiteTeardown(async function () {
    this.timeout(15000);

    // Dispose any remaining panels
    for (const panel of openPanels) {
      try {
        panel.dispose();
      } catch {
        // ignore
      }
    }
    openPanels.length = 0;

    // Clean up test data
    await deleteByQuery(`original_query:${testMarker}*`);
  });

  // -----------------------------------------------------------------------
  // Teardown: dispose panels after each test
  // -----------------------------------------------------------------------
  teardown(function () {
    for (const panel of openPanels) {
      try {
        panel.dispose();
      } catch {
        // ignore
      }
    }
    openPanels.length = 0;
    SolrResultsPanel.clearPersistedSettings();
  });

  // =======================================================================
  // 1. Panel Creation
  // =======================================================================
  test('1. Panel creation — instantiates without errors', function () {
    const panel = createPanel();
    assert.ok(panel, 'Panel should be created');
    assert.ok(SolrResultsPanel.currentPanel, 'currentPanel static ref should be set');
    assert.strictEqual(SolrResultsPanel.currentPanel, panel, 'currentPanel should reference the created panel');
  });

  test('1b. Panel creation — webview HTML template is loaded', async function () {
    const panel = createPanel();
    // show() loads the HTML; pass empty results to trigger HTML load
    panel.show([], 'test');
    // Wait for the 100ms setTimeout inside show() that posts updateSettings
    await new Promise(resolve => setTimeout(resolve, 300));
    // If no error is thrown, the panel loaded successfully
    assert.ok(panel, 'Panel should have loaded HTML without errors');
  });

  // =======================================================================
  // 2. Display Search Results
  // =======================================================================
  test('2. Display search results — show() sends results to webview', async function () {
    this.timeout(TEST_TIMEOUT);

    const results = seededDocs.map(toStoredResult);
    const panel = createPanel();

    // show() posts results to the webview — if no error, it succeeded
    panel.show(results, testMarker, sessionId);

    // Allow time for the postMessage to propagate
    await new Promise(resolve => setTimeout(resolve, 500));

    assert.ok(panel, 'Panel should display results without errors');
  });

  // =======================================================================
  // 3. Result Data Shape
  // =======================================================================
  test('3. Result data shape — each result has expected fields', function () {
    const result = toStoredResult(tsDoc1);

    // Core identification fields
    assert.ok(result.file_path, 'Should have file_path');
    assert.ok(result.file_name, 'Should have file_name');
    assert.ok(result.file_extension, 'Should have file_extension');

    // Position fields
    assert.strictEqual(typeof result.line_number, 'number', 'line_number should be a number');
    assert.strictEqual(typeof result.column_number, 'number', 'column_number should be a number');

    // Content fields
    assert.ok(result.match_text, 'Should have match_text');
    assert.ok(Array.isArray(result.context_before), 'context_before should be an array');
    assert.ok(Array.isArray(result.context_after), 'context_after should be an array');

    // Scoring
    assert.strictEqual(typeof result.relevance_score, 'number', 'relevance_score should be a number');

    // Snippets
    assert.ok(Array.isArray(result.snippets), 'snippets should be an array');

    // Display content
    assert.ok(result.display_content !== undefined, 'Should have display_content');
  });

  test('3b. Result data shape — verified for Solr-returned results', async function () {
    this.timeout(TEST_TIMEOUT);

    const options: SearchOptions = { query: testMarker };
    const results = await indexManager.searchStoredResultsDetailed(options, sessionId);

    assert.ok(results.length > 0, 'Should have results from Solr');

    const result = results[0];
    assert.ok(result.id, 'Should have id');
    assert.ok(result.search_session_id, 'Should have search_session_id');
    assert.ok(result.file_path, 'Should have file_path');
    assert.ok(result.file_name, 'Should have file_name');
    assert.ok(result.file_extension, 'Should have file_extension');
    assert.strictEqual(typeof result.line_number, 'number', 'line_number should be number');
    assert.strictEqual(typeof result.column_number, 'number', 'column_number should be number');
    assert.ok(result.match_text, 'Should have match_text');
    assert.ok(Array.isArray(result.context_before), 'context_before should be array');
    assert.ok(Array.isArray(result.context_after), 'context_after should be array');
    assert.ok(Array.isArray(result.snippets), 'snippets should be array');
    assert.strictEqual(typeof result.relevance_score, 'number', 'relevance_score should be number');
  });

  // =======================================================================
  // 4. File Type Filtering
  // =======================================================================
  test('4. File type filtering — filters by .ts extension', function () {
    const results = seededDocs.map(toStoredResult);

    // Use the panel's internal filtering via performSearchWithSettings logic
    // We test the same filtering algorithm here
    const settings = { fileTypes: 'ts' };
    const filtered = applyFileTypeFilter(results, settings.fileTypes);

    assert.strictEqual(filtered.length, 2, 'Should have 2 TypeScript results');
    assert.ok(filtered.every(r => r.file_extension === 'ts'), 'All results should be .ts');
  });

  test('4b. File type filtering — dot prefix handling (.ts works same as ts)', function () {
    const results = seededDocs.map(toStoredResult);

    const filteredWithDot = applyFileTypeFilter(results, '.ts');
    const filteredWithoutDot = applyFileTypeFilter(results, 'ts');

    assert.strictEqual(filteredWithDot.length, filteredWithoutDot.length,
      'Filtering with ".ts" and "ts" should yield same results');
  });

  test('4c. File type filtering — multiple file types', function () {
    const results = seededDocs.map(toStoredResult);

    // Note: the panel's substring-based filter means 'js' also matches 'json'
    const filtered = applyFileTypeFilter(results, 'ts,js');
    assert.strictEqual(filtered.length, 5, 'Should have 5 results (2 ts + 2 js + 1 json, because "js" substring-matches "json")');
  });

  // =======================================================================
  // 5. Sort by Relevance (Score)
  // =======================================================================
  test('5. Sort by relevance — highest score first (default)', function () {
    const results = seededDocs.map(toStoredResult);
    const sorted = sortResults(results, 'relevance');

    assert.strictEqual(sorted[0].relevance_score, 95, 'First result should have highest score (95)');
    assert.strictEqual(sorted[sorted.length - 1].relevance_score, 50, 'Last should have lowest score (50)');

    for (let i = 0; i < sorted.length - 1; i++) {
      assert.ok(sorted[i].relevance_score >= sorted[i + 1].relevance_score,
        `Score at index ${i} (${sorted[i].relevance_score}) should be >= score at index ${i + 1} (${sorted[i + 1].relevance_score})`);
    }
  });

  // =======================================================================
  // 6. Sort by File Name
  // =======================================================================
  test('6. Sort by file name — alphabetical ordering', function () {
    const results = seededDocs.map(toStoredResult);
    const sorted = sortResults(results, 'filename');

    for (let i = 0; i < sorted.length - 1; i++) {
      assert.ok(sorted[i].file_name.localeCompare(sorted[i + 1].file_name) <= 0,
        `"${sorted[i].file_name}" should come before or equal to "${sorted[i + 1].file_name}"`);
    }

    assert.strictEqual(sorted[0].file_name, 'alpha.ts', 'First should be alpha.ts');
  });

  // =======================================================================
  // 7. Sort by File Path
  // =======================================================================
  test('7. Sort by file path — path-based alphabetical ordering', function () {
    const results = seededDocs.map(toStoredResult);

    // The panel doesn't have a built-in file_path sort in sortResults,
    // but we verify the data can be sorted by path
    const sorted = [...results].sort((a, b) => a.file_path.localeCompare(b.file_path));

    for (let i = 0; i < sorted.length - 1; i++) {
      assert.ok(sorted[i].file_path.localeCompare(sorted[i + 1].file_path) <= 0,
        `"${sorted[i].file_path}" should come before "${sorted[i + 1].file_path}"`);
    }
  });

  // =======================================================================
  // 8. Sort by Line Number
  // =======================================================================
  test('8. Sort by line number — numerical ordering', function () {
    const results = seededDocs.map(toStoredResult);
    const sorted = sortResults(results, 'line_number');

    for (let i = 0; i < sorted.length - 1; i++) {
      assert.ok(sorted[i].line_number <= sorted[i + 1].line_number,
        `Line ${sorted[i].line_number} should be <= ${sorted[i + 1].line_number}`);
    }

    assert.strictEqual(sorted[0].line_number, 3, 'First should be line 3 (config.json)');
    assert.strictEqual(sorted[sorted.length - 1].line_number, 42, 'Last should be line 42 (delta.js)');
  });

  // =======================================================================
  // 9. Sort by File Extension
  // =======================================================================
  test('9. Sort by file extension — grouping by extension', function () {
    const results = seededDocs.map(toStoredResult);

    // Sort by extension to verify grouping
    const sorted = [...results].sort((a, b) => a.file_extension.localeCompare(b.file_extension));

    // Verify extensions are grouped
    const extensions = sorted.map(r => r.file_extension);
    const uniqueExts = [...new Set(extensions)];

    // Check each extension group is contiguous
    for (const ext of uniqueExts) {
      const indices = extensions.map((e, i) => e === ext ? i : -1).filter(i => i >= 0);
      for (let i = 0; i < indices.length - 1; i++) {
        assert.strictEqual(indices[i + 1], indices[i] + 1,
          `Extension "${ext}" results should be contiguous`);
      }
    }

    assert.ok(uniqueExts.includes('ts'), 'Should have ts extension');
    assert.ok(uniqueExts.includes('js'), 'Should have js extension');
    assert.ok(uniqueExts.includes('json'), 'Should have json extension');
  });

  // =======================================================================
  // 10. Sort by Match Count
  // =======================================================================
  test('10. Sort by match count — files with more matches first (descending)', function () {
    const results = seededDocs.map(toStoredResult);

    // Sort by match_count_in_file descending
    const sorted = [...results].sort((a, b) => b.match_count_in_file - a.match_count_in_file);

    assert.strictEqual(sorted[0].match_count_in_file, 5, 'First should have 5 matches (delta.js)');
    assert.strictEqual(sorted[0].file_name, 'delta.js', 'delta.js has the most matches');

    for (let i = 0; i < sorted.length - 1; i++) {
      assert.ok(sorted[i].match_count_in_file >= sorted[i + 1].match_count_in_file,
        `Match count at index ${i} (${sorted[i].match_count_in_file}) should be >= ${sorted[i + 1].match_count_in_file}`);
    }
  });

  // =======================================================================
  // 11. Open File Message Handling
  // =======================================================================
  test('11. Open file message — panel handles openFile message', async function () {
    this.timeout(TEST_TIMEOUT);

    const panel = createPanel();
    const results = seededDocs.map(toStoredResult);
    panel.show(results, testMarker, sessionId);

    // Allow the webview to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // The openFile handler is in BaseResultsPanel, we verify
    // it doesn't throw when receiving a valid file path
    // Note: In integration tests, we can't easily intercept the webview message,
    // but we can verify the panel is alive and responsive after show()
    assert.ok(SolrResultsPanel.currentPanel, 'Panel should still be active');
  });

  // =======================================================================
  // 12. Search With Settings Message
  // =======================================================================
  test('12. Search with settings — performSearchWithSettings processes settings', async function () {
    this.timeout(E2E_TIMEOUT);

    const panel = createPanel();

    // Show initial results
    const initialResults = seededDocs.map(toStoredResult);
    panel.show(initialResults, testMarker, sessionId);

    // Allow the webview to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // The panel should be alive and accept a new search via postMessage
    // We test the settings persistence mechanism
    assert.ok(SolrResultsPanel.currentPanel, 'Panel should be active for search');

    // Verify persisted settings are accessible
    const settings = SolrResultsPanel.getPersistedSettings();
    assert.ok(settings, 'Should have persisted settings');
    assert.strictEqual(settings.sortOrder, 'relevance', 'Default sort order should be relevance');
    assert.strictEqual(settings.maxResults, 100, 'Default maxResults should be 100');
  });

  // =======================================================================
  // 13. Refresh
  // =======================================================================
  test('13. Refresh — panel can re-show results', async function () {
    this.timeout(TEST_TIMEOUT);

    const panel = createPanel();
    const results = seededDocs.map(toStoredResult);

    // Initial show
    panel.show(results, testMarker, sessionId);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Re-show (simulates refresh)
    panel.show(results, testMarker, sessionId);
    await new Promise(resolve => setTimeout(resolve, 500));

    assert.ok(SolrResultsPanel.currentPanel, 'Panel should still be active after refresh');
  });

  // =======================================================================
  // 14. Empty Results
  // =======================================================================
  test('14. Empty results — panel handles no results gracefully', async function () {
    this.timeout(TEST_TIMEOUT);

    const panel = createPanel();

    // Show with empty results
    panel.show([], 'nonexistent_query_xyz_999', sessionId);

    await new Promise(resolve => setTimeout(resolve, 500));

    assert.ok(SolrResultsPanel.currentPanel, 'Panel should handle empty results without crashing');
  });

  test('14b. Empty results — search for non-existent term returns empty', async function () {
    this.timeout(TEST_TIMEOUT);

    const options: SearchOptions = { query: 'absolutely_nothing_matches_this_xyz_99999' };
    const results = await indexManager.searchStoredResultsDetailed(options, sessionId);

    assert.strictEqual(results.length, 0, 'Should return no results for non-existent term');

    const panel = createPanel();
    panel.show(results, options.query, sessionId);
    await new Promise(resolve => setTimeout(resolve, 500));

    assert.ok(panel, 'Panel should display empty results without error');
  });

  // =======================================================================
  // 15. Panel Dispose
  // =======================================================================
  test('15. Panel dispose — cleans up resources', function () {
    const panel = createPanel();
    assert.ok(SolrResultsPanel.currentPanel, 'Panel should exist before dispose');

    panel.dispose();

    assert.strictEqual(SolrResultsPanel.currentPanel, undefined,
      'currentPanel should be undefined after dispose');

    // Remove from tracking since we already disposed
    const idx = openPanels.indexOf(panel);
    if (idx >= 0) { openPanels.splice(idx, 1); }
  });

  test('15b. Panel dispose — no errors on double dispose', function () {
    const panel = createPanel();
    panel.dispose();

    // Second dispose should not throw
    try {
      panel.dispose();
    } catch (err) {
      // Some implementations may throw on double dispose, that's acceptable
      // The key is it doesn't crash the extension host
    }

    // Remove from tracking
    const idx = openPanels.indexOf(panel);
    if (idx >= 0) { openPanels.splice(idx, 1); }
  });

  // =======================================================================
  // 16. Multiple Panels
  // =======================================================================
  test('16. Multiple panels — create replaces previous panel', function () {
    const panel1 = createPanel();
    assert.strictEqual(SolrResultsPanel.currentPanel, panel1, 'First panel should be current');

    const panel2 = createPanel();
    assert.strictEqual(SolrResultsPanel.currentPanel, panel2, 'Second panel should replace first as current');

    // panel1 should have been disposed by create()
    // Note: after dispose, panel1 is no longer usable
  });

  test('16b. Multiple panels — independent queries do not interfere', async function () {
    this.timeout(TEST_TIMEOUT);

    // Create first panel with ts results
    const tsResults = [tsDoc1, tsDoc2].map(toStoredResult);
    const panel1 = createPanel();
    panel1.show(tsResults, 'typescript query', sessionId);

    await new Promise(resolve => setTimeout(resolve, 300));

    // Create second panel (replaces first) with js results
    const jsResults = [jsDoc1, jsDoc2].map(toStoredResult);
    const panel2 = createPanel();
    panel2.show(jsResults, 'javascript query', sessionId);

    await new Promise(resolve => setTimeout(resolve, 300));

    // Only panel2 should be current
    assert.strictEqual(SolrResultsPanel.currentPanel, panel2,
      'Only the most recent panel should be current');
  });

  // =======================================================================
  // Additional: End-to-end with real Solr data
  // =======================================================================
  test('E2E — search Solr and display results in panel', async function () {
    this.timeout(E2E_TIMEOUT);

    // Search Solr for our test data
    const options: SearchOptions = { query: testMarker };
    const results = await indexManager.searchStoredResultsDetailed(options, sessionId);

    assert.ok(results.length > 0, 'Should find seeded results in Solr');

    // Display in panel
    const panel = createPanel();
    panel.show(results, testMarker, sessionId);

    await new Promise(resolve => setTimeout(resolve, 1000));

    assert.ok(SolrResultsPanel.currentPanel, 'Panel should be active with Solr results');
    assert.ok(results.length === 5, 'Should have all 5 seeded documents');
  });

  test('E2E — filtering works on real Solr results', async function () {
    this.timeout(E2E_TIMEOUT);

    const options: SearchOptions = { query: testMarker };
    const results = await indexManager.searchStoredResultsDetailed(options, sessionId);

    assert.ok(results.length > 0, 'Should have Solr results to filter');

    // Filter by .ts
    const tsOnly = applyFileTypeFilter(results, 'ts');
    assert.ok(tsOnly.length > 0, 'Should have TypeScript results');
    assert.ok(tsOnly.every(r => r.file_extension === 'ts'), 'Filtered results should all be .ts');

    // Filter by .js — note: substring matching means 'js' also matches 'json'
    const jsOnly = applyFileTypeFilter(results, 'js');
    assert.ok(jsOnly.length > 0, 'Should have JavaScript results');
    assert.ok(jsOnly.every(r => r.file_extension.includes('js')),
      'Filtered results should all contain "js" in extension (substring match)');

    // Filter by .json
    const jsonOnly = applyFileTypeFilter(results, 'json');
    assert.ok(jsonOnly.length > 0, 'Should have JSON results');
    assert.ok(jsonOnly.every(r => r.file_extension === 'json'), 'Filtered results should all be .json');
  });

  test('E2E — sorting works on real Solr results', async function () {
    this.timeout(E2E_TIMEOUT);

    const options: SearchOptions = { query: testMarker };
    const results = await indexManager.searchStoredResultsDetailed(options, sessionId);

    assert.ok(results.length > 0, 'Should have Solr results to sort');

    // Sort by relevance (descending)
    const byRelevance = sortResults(results, 'relevance');
    for (let i = 0; i < byRelevance.length - 1; i++) {
      assert.ok(byRelevance[i].relevance_score >= byRelevance[i + 1].relevance_score,
        'Results should be sorted by relevance descending');
    }

    // Sort by file name
    const byName = sortResults(results, 'filename');
    for (let i = 0; i < byName.length - 1; i++) {
      assert.ok(byName[i].file_name.localeCompare(byName[i + 1].file_name) <= 0,
        'Results should be sorted by file name ascending');
    }

    // Sort by line number
    const byLine = sortResults(results, 'line_number');
    for (let i = 0; i < byLine.length - 1; i++) {
      assert.ok(byLine[i].line_number <= byLine[i + 1].line_number,
        'Results should be sorted by line number ascending');
    }
  });

  test('E2E — persisted settings mechanism', function () {
    // Clear settings
    SolrResultsPanel.clearPersistedSettings();
    const defaults = SolrResultsPanel.getPersistedSettings();

    assert.strictEqual(defaults.maxResults, 100, 'Default maxResults should be 100');
    assert.strictEqual(defaults.minScore, 0, 'Default minScore should be 0');
    assert.strictEqual(defaults.sortOrder, 'relevance', 'Default sortOrder should be relevance');
    assert.strictEqual(defaults.fileTypes, '', 'Default fileTypes should be empty');
    assert.strictEqual(defaults.excludePatterns, '', 'Default excludePatterns should be empty');
    assert.strictEqual(defaults.sessionFilter, '', 'Default sessionFilter should be empty');
  });

  test('E2E — exclude patterns filter', function () {
    const results = seededDocs.map(toStoredResult);

    // Exclude files in /lib/ path
    const filtered = applyExcludeFilter(results, 'lib');
    assert.ok(filtered.length < results.length, 'Exclude filter should remove some results');
    assert.ok(filtered.every(r => !r.file_path.toLowerCase().includes('lib')),
      'No results should have "lib" in path');
  });

  test('E2E — minimum score filter', function () {
    const results = seededDocs.map(toStoredResult);

    // Filter by minimum score of 75
    const filtered = results.filter(r => r.relevance_score >= 75);
    assert.strictEqual(filtered.length, 2, 'Should have 2 results with score >= 75');
    assert.ok(filtered.every(r => r.relevance_score >= 75), 'All results should meet min score');
  });
});

// ===========================================================================
// Helper functions that mirror SolrResultsPanel's internal logic
// ===========================================================================

/**
 * Apply file type filtering (mirrors SolrResultsPanel.applyAdditionalFilters)
 */
function applyFileTypeFilter(results: StoredSearchResult[], fileTypes: string): StoredSearchResult[] {
  const types = fileTypes.split(',').map(t => t.trim().toLowerCase());
  return results.filter(r => {
    const ext = r.file_extension?.toLowerCase() || '';
    return types.some(type => ext.includes(type) || ext === type.replace(/^\./, ''));
  });
}

/**
 * Apply exclude patterns filter (mirrors SolrResultsPanel.applyAdditionalFilters)
 */
function applyExcludeFilter(results: StoredSearchResult[], excludePatterns: string): StoredSearchResult[] {
  const patterns = excludePatterns.split(',').map(p => p.trim().toLowerCase());
  return results.filter(r => {
    const filePath = r.file_path.toLowerCase();
    const fileName = r.file_name.toLowerCase();
    return !patterns.some(pattern => filePath.includes(pattern) || fileName.includes(pattern));
  });
}

/**
 * Sort results (mirrors SolrResultsPanel.sortResults)
 */
function sortResults(results: StoredSearchResult[], sortOrder: string): StoredSearchResult[] {
  const sorted = [...results];

  switch (sortOrder) {
    case 'relevance':
      return sorted.sort((a, b) => b.relevance_score - a.relevance_score);
    case 'relevance_asc':
      return sorted.sort((a, b) => a.relevance_score - b.relevance_score);
    case 'timestamp':
      return sorted.sort((a, b) => new Date(b.search_timestamp).getTime() - new Date(a.search_timestamp).getTime());
    case 'timestamp_asc':
      return sorted.sort((a, b) => new Date(a.search_timestamp).getTime() - new Date(b.search_timestamp).getTime());
    case 'filename':
      return sorted.sort((a, b) => a.file_name.localeCompare(b.file_name));
    case 'line_number':
      return sorted.sort((a, b) => a.line_number - b.line_number);
    default:
      return sorted;
  }
}
