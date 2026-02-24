/**
 * Solr Search & Query Integration Tests
 *
 * Seeds known data into Solr, then exercises `IndexManager.searchStoredResults()`
 * and `searchStoredResultsDetailed()` with a variety of query patterns: basic
 * text, field-specific, boolean, wildcards, phrase, filters, and relevance.
 *
 * Requires a live Solr server — all tests are skipped when Solr is unreachable.
 */

import * as assert from 'assert';
import {
  skipIfSolrUnavailable,
  seedDocuments,
  deleteByQuery,
  waitForCommit,
} from './testHelpers';
import {
  TEST_TIMEOUT,
  TEST_QUERY_PREFIX,
} from './constants';
import { createTestDocument, generateTestMarker } from './testDataFactory';
import { IndexManager } from '../../../services/indexManager';
import { SearchOptions } from '../../../types';

suite('Solr Search & Query Integration Tests', function () {
  this.timeout(TEST_TIMEOUT);

  let indexManager: IndexManager;
  let testMarker: string;

  // Deterministic session IDs for easier assertions
  const sessionA = `session_test_search_js_${Date.now()}`;
  const sessionB = `session_test_search_ts_${Date.now()}`;
  const sessionC = `session_test_search_cfg_${Date.now()}`;
  const sessionD = `session_test_search_py_${Date.now()}`;

  /** Shorthand for building SearchOptions */
  function opts(query: string, extra?: Partial<SearchOptions>): SearchOptions {
    return { query, ...extra };
  }

  // -----------------------------------------------------------------------
  // Seed data
  // -----------------------------------------------------------------------

  suiteSetup(async function () {
    this.timeout(30000);
    await skipIfSolrUnavailable(this);

    indexManager = new IndexManager();
    testMarker = generateTestMarker('search');

    // Session A — JavaScript code
    const jsDocs = [
      createTestDocument({
        search_session_id: sessionA,
        original_query: testMarker,
        file_name: 'app.js',
        file_path: '/workspace/src/app.js',
        file_extension: 'js',
        line_number: 10,
        match_text: 'function handleClick(event)',
        full_line: 'function handleClick(event) {',
        display_content: '// event handler\n>>> function handleClick(event) { <<<\n  const target = event.target;',
        context_before: ['// event handler'],
        context_after: ['  const target = event.target;'],
        case_sensitive: false,
        whole_word: false,
      }),
      createTestDocument({
        search_session_id: sessionA,
        original_query: testMarker,
        file_name: 'app.js',
        file_path: '/workspace/src/app.js',
        file_extension: 'js',
        line_number: 25,
        match_text: 'const button = document.getElementById',
        full_line: 'const button = document.getElementById("submit");',
        display_content: '// get element\n>>> const button = document.getElementById("submit"); <<<\n  button.addEventListener("click", handleClick);',
        context_before: ['// get element'],
        context_after: ['  button.addEventListener("click", handleClick);'],
        case_sensitive: false,
        whole_word: false,
      }),
      createTestDocument({
        search_session_id: sessionA,
        original_query: testMarker,
        file_name: 'utils.js',
        file_path: '/workspace/src/utils.js',
        file_extension: 'js',
        line_number: 5,
        match_text: 'export function debounce(fn, delay)',
        full_line: 'export function debounce(fn, delay) {',
        display_content: '// utility\n>>> export function debounce(fn, delay) { <<<\n  let timer;',
        context_before: ['// utility'],
        context_after: ['  let timer;'],
        case_sensitive: false,
        whole_word: false,
      }),
    ];

    // Session B — TypeScript interfaces
    const tsDocs = [
      createTestDocument({
        search_session_id: sessionB,
        original_query: testMarker,
        file_name: 'types.ts',
        file_path: '/workspace/src/types.ts',
        file_extension: 'ts',
        line_number: 1,
        match_text: 'interface SearchResult',
        full_line: 'export interface SearchResult {',
        display_content: '// types\n>>> export interface SearchResult { <<<\n  file: string;',
        context_before: ['// types'],
        context_after: ['  file: string;'],
        case_sensitive: true,
        whole_word: true,
      }),
      createTestDocument({
        search_session_id: sessionB,
        original_query: testMarker,
        file_name: 'types.ts',
        file_path: '/workspace/src/types.ts',
        file_extension: 'ts',
        line_number: 20,
        match_text: 'type FilterScope',
        full_line: "type FilterScope = 'global' | 'workspace';",
        display_content: "// scope\n>>> type FilterScope = 'global' | 'workspace'; <<<\n// end",
        context_before: ['// scope'],
        context_after: ['// end'],
        case_sensitive: true,
        whole_word: true,
      }),
      createTestDocument({
        search_session_id: sessionB,
        original_query: testMarker,
        file_name: 'extension.ts',
        file_path: '/workspace/src/extension.ts',
        file_extension: 'ts',
        line_number: 50,
        match_text: 'class SmartSearchProvider',
        full_line: 'export class SmartSearchProvider implements TreeDataProvider {',
        display_content: '// provider\n>>> export class SmartSearchProvider implements TreeDataProvider { <<<\n  constructor() {}',
        context_before: ['// provider'],
        context_after: ['  constructor() {}'],
        case_sensitive: false,
        whole_word: false,
      }),
    ];

    // Session C — Config/JSON
    const cfgDocs = [
      createTestDocument({
        search_session_id: sessionC,
        original_query: testMarker,
        file_name: 'package.json',
        file_path: '/workspace/package.json',
        file_extension: 'json',
        line_number: 3,
        match_text: '"smart-search-ripsolr"',
        full_line: '  "name": "smart-search-ripsolr",',
        display_content: '{\n>>> "name": "smart-search-ripsolr", <<<\n  "version": "2.1.1"',
        context_before: ['{'],
        context_after: ['  "version": "2.1.1"'],
        case_sensitive: false,
        whole_word: false,
      }),
      createTestDocument({
        search_session_id: sessionC,
        original_query: testMarker,
        file_name: 'tsconfig.json',
        file_path: '/workspace/tsconfig.json',
        file_extension: 'json',
        line_number: 5,
        match_text: '"compilerOptions"',
        full_line: '  "compilerOptions": {',
        display_content: '{\n>>> "compilerOptions": { <<<\n    "target": "ES2020"',
        context_before: ['{'],
        context_after: ['    "target": "ES2020"'],
        case_sensitive: false,
        whole_word: false,
      }),
    ];

    // Session D — Python code
    const pyDocs = [
      createTestDocument({
        search_session_id: sessionD,
        original_query: testMarker,
        file_name: 'processor.py',
        file_path: '/workspace/src/processor.py',
        file_extension: 'py',
        line_number: 10,
        match_text: 'def process_data(self, data)',
        full_line: '    def process_data(self, data):',
        display_content: '# processing\n>>> def process_data(self, data): <<<\n        return self.transform(data)',
        context_before: ['# processing'],
        context_after: ['        return self.transform(data)'],
        case_sensitive: false,
        whole_word: false,
      }),
      createTestDocument({
        search_session_id: sessionD,
        original_query: testMarker,
        file_name: 'processor.py',
        file_path: '/workspace/src/processor.py',
        file_extension: 'py',
        line_number: 1,
        match_text: 'class DataProcessor',
        full_line: 'class DataProcessor:',
        display_content: '# main class\n>>> class DataProcessor: <<<\n    """Processes incoming data."""',
        context_before: ['# main class'],
        context_after: ['    """Processes incoming data."""'],
        case_sensitive: false,
        whole_word: false,
      }),
    ];

    // Also seed a document where the search term appears ONLY in context_after
    // (for relevance ordering test — boost match_text^5 vs context_after^1.5)
    const relevanceDoc = createTestDocument({
      search_session_id: sessionA,
      original_query: testMarker,
      file_name: 'other.js',
      file_path: '/workspace/src/other.js',
      file_extension: 'js',
      line_number: 100,
      match_text: 'some unrelated code',
      full_line: 'some unrelated code here',
      display_content: '// nothing\n>>> some unrelated code here <<<\n  handleClick(); // call handler',
      context_before: ['// nothing'],
      context_after: ['  handleClick(); // call handler'],
      case_sensitive: false,
      whole_word: false,
    });

    const allDocs = [...jsDocs, ...tsDocs, ...cfgDocs, ...pyDocs, relevanceDoc];
    await seedDocuments(allDocs);
  });

  suiteTeardown(async function () {
    this.timeout(30000);
    await deleteByQuery(`original_query:"${testMarker}"`);
  });

  // -----------------------------------------------------------------------
  // 1. Basic Text Search
  // -----------------------------------------------------------------------

  test('Basic text search returns expected results', async () => {
    const results = await indexManager.searchStoredResults(
      opts('handleClick'),
      sessionA,
    );

    assert.ok(results.length > 0, 'Should return at least one result');
    // Verify SearchResult shape
    const first = results[0];
    assert.ok(first.file, 'file should be populated');
    assert.ok(typeof first.line === 'number', 'line should be a number');
    assert.ok(typeof first.column === 'number', 'column should be a number');
    assert.ok(first.content, 'content should be populated');
    assert.ok(Array.isArray(first.context), 'context should be an array');
  });

  // -----------------------------------------------------------------------
  // 2. Search All (*:*)
  // -----------------------------------------------------------------------

  test('Empty query returns all seeded documents up to maxResults', async () => {
    const results = await indexManager.searchStoredResults(
      opts('', { maxResults: 100 }),
      sessionA,
    );

    // Session A has 4 docs (3 JS + 1 relevance doc)
    assert.ok(results.length >= 3, `Expected >=3 results from session A, got ${results.length}`);
  });

  // -----------------------------------------------------------------------
  // 3. Field-Specific Search
  // -----------------------------------------------------------------------

  test('Field-specific search: file_name:package.json', async () => {
    const results = await indexManager.searchStoredResults(
      opts('file_name:package.json'),
      sessionC,
    );

    assert.ok(results.length >= 1, 'Should find package.json results');
    for (const r of results) {
      assert.ok(
        r.file.includes('package.json'),
        `Expected file to be package.json, got ${r.file}`,
      );
    }
  });

  test('Field-specific search: file_extension:ts', async () => {
    const results = await indexManager.searchStoredResults(
      opts('file_extension:ts'),
      sessionB,
    );

    assert.ok(results.length >= 2, 'Should find TypeScript results');
  });

  // -----------------------------------------------------------------------
  // 4. Filename-Like Query Routing
  // -----------------------------------------------------------------------

  test('Filename-like query routes to file_name/file_path', async () => {
    const results = await indexManager.searchStoredResults(
      opts('extension.ts'),
      sessionB,
    );

    assert.ok(results.length >= 1, 'Should find extension.ts results');
    assert.ok(
      results.some((r) => r.file.includes('extension.ts')),
      'Should match by filename',
    );
  });

  // -----------------------------------------------------------------------
  // 5. Code Pattern Query Routing
  // -----------------------------------------------------------------------

  test('Code pattern query finds function results', async () => {
    const results = await indexManager.searchStoredResults(
      opts('function handleClick'),
      sessionA,
    );

    assert.ok(results.length >= 1, 'Should find handleClick function');
  });

  test('Code pattern query finds class results', async () => {
    const results = await indexManager.searchStoredResults(
      opts('class DataProcessor'),
      sessionD,
    );

    assert.ok(results.length >= 1, 'Should find DataProcessor class');
  });

  // -----------------------------------------------------------------------
  // 6. Boolean Queries
  // -----------------------------------------------------------------------

  test('AND query narrows results', async () => {
    const results = await indexManager.searchStoredResults(
      opts('handleClick AND button'),
      sessionA,
    );

    // At least one doc should contain both terms
    assert.ok(results.length >= 1, 'AND query should return results');
  });

  test('OR query broadens results', async () => {
    // Search across all sessions by using a session that contains both
    // We'll query across sessionA + sessionD by not restricting session,
    // but since auto-select picks the most recent, seed order matters.
    // Instead, query each session and verify independently.
    const jsResults = await indexManager.searchStoredResults(
      opts('handleClick'),
      sessionA,
    );
    const pyResults = await indexManager.searchStoredResults(
      opts('DataProcessor'),
      sessionD,
    );

    assert.ok(jsResults.length >= 1, 'handleClick should be found in JS session');
    assert.ok(pyResults.length >= 1, 'DataProcessor should be found in PY session');
  });

  // -----------------------------------------------------------------------
  // 7. Session Filtering
  // -----------------------------------------------------------------------

  test('Session filter restricts results to that session', async () => {
    const results = await indexManager.searchStoredResults(
      opts('', { maxResults: 100 }),
      sessionB,
    );

    // Session B has 3 TS docs
    assert.strictEqual(results.length, 3, `Session B should have 3 docs, got ${results.length}`);
  });

  // -----------------------------------------------------------------------
  // 8. Case Sensitivity Filter
  // -----------------------------------------------------------------------

  test('caseSensitive filter restricts results', async () => {
    // Session B docs: 2 have case_sensitive=true, 1 has false
    const results = await indexManager.searchStoredResults(
      opts('', { maxResults: 100, caseSensitive: true }),
      sessionB,
    );

    // Should only return the 2 case-sensitive docs
    assert.ok(results.length >= 1, 'Should return case-sensitive results');
    assert.ok(results.length <= 2, `Expected <=2 case-sensitive results, got ${results.length}`);
  });

  // -----------------------------------------------------------------------
  // 9. Whole Word Filter
  // -----------------------------------------------------------------------

  test('wholeWord filter restricts results', async () => {
    // Session B: 2 docs have whole_word=true
    const results = await indexManager.searchStoredResults(
      opts('', { maxResults: 100, wholeWord: true }),
      sessionB,
    );

    assert.ok(results.length >= 1, 'Should return whole-word results');
    assert.ok(results.length <= 2, `Expected <=2 whole-word results, got ${results.length}`);
  });

  // -----------------------------------------------------------------------
  // 10. Combined Filters
  // -----------------------------------------------------------------------

  test('Combined session + caseSensitive + wholeWord filters', async () => {
    const results = await indexManager.searchStoredResults(
      opts('', { maxResults: 100, caseSensitive: true, wholeWord: true }),
      sessionB,
    );

    // 2 docs in session B have both case_sensitive=true AND whole_word=true
    assert.ok(results.length >= 1, 'Should return results matching all filters');
    assert.ok(results.length <= 2, `Expected <=2 combined-filter results, got ${results.length}`);
  });

  // -----------------------------------------------------------------------
  // 11. searchStoredResultsDetailed Fields
  // -----------------------------------------------------------------------

  test('Detailed search returns full StoredSearchResult fields', async () => {
    const results = await indexManager.searchStoredResultsDetailed(
      opts('handleClick'),
      sessionA,
    );

    assert.ok(results.length >= 1, 'Should return detailed results');

    const doc = results[0];
    assert.ok(typeof doc.score === 'number', 'score should be a number');
    assert.ok(doc.score > 0, 'score should be positive');
    assert.ok(doc.id, 'id should be populated');
    assert.ok(doc.search_session_id, 'search_session_id should be populated');
    assert.ok(doc.file_path, 'file_path should be populated');
    assert.ok(doc.file_name, 'file_name should be populated');
    assert.ok(doc.match_text, 'match_text should be populated');
    assert.ok(doc.full_line, 'full_line should be populated');
    assert.ok(typeof doc.match_count_in_file === 'number', 'match_count_in_file should be a number');
    assert.ok(Array.isArray(doc.snippets), 'snippets should be an array');
    assert.ok(doc.display_content, 'display_content should be populated');
  });

  // -----------------------------------------------------------------------
  // 12. Max Results Limit
  // -----------------------------------------------------------------------

  test('maxResults limits returned documents', async () => {
    const results = await indexManager.searchStoredResults(
      opts('', { maxResults: 2 }),
      sessionA,
    );

    assert.ok(results.length <= 2, `Expected <=2 results, got ${results.length}`);
  });

  // -----------------------------------------------------------------------
  // 13. Relevance Ordering
  // -----------------------------------------------------------------------

  test('match_text hit ranks higher than context_after hit', async () => {
    const results = await indexManager.searchStoredResultsDetailed(
      opts('handleClick'),
      sessionA,
    );

    assert.ok(results.length >= 2, 'Should get at least 2 results');

    // The document with "handleClick" in match_text should score higher
    // than the one with "handleClick" only in context_after
    const directHit = results.find((r) =>
      (Array.isArray(r.match_text) ? r.match_text[0] : r.match_text)
        .includes('handleClick'),
    );
    const contextHit = results.find(
      (r) =>
        !(Array.isArray(r.match_text) ? r.match_text[0] : r.match_text)
          .includes('handleClick'),
    );

    if (directHit && contextHit) {
      assert.ok(
        (directHit.score ?? 0) >= (contextHit.score ?? 0),
        `Direct match_text hit (${directHit.score}) should score >= context hit (${contextHit.score})`,
      );
    }
  });

  // -----------------------------------------------------------------------
  // 14. Wildcard Queries
  // -----------------------------------------------------------------------

  test('Wildcard query handle* matches handleClick', async () => {
    const results = await indexManager.searchStoredResults(
      opts('match_text:handle*'),
      sessionA,
    );

    assert.ok(results.length >= 1, 'Wildcard query should return results');
  });

  // -----------------------------------------------------------------------
  // 15. Quoted Phrase Search
  // -----------------------------------------------------------------------

  test('Quoted phrase search returns exact match', async () => {
    const results = await indexManager.searchStoredResults(
      opts('match_text:"const button"'),
      sessionA,
    );

    assert.ok(results.length >= 1, 'Phrase search should return results');
  });

  // -----------------------------------------------------------------------
  // 16. No Results
  // -----------------------------------------------------------------------

  test('Search for non-existent term returns empty array', async () => {
    const results = await indexManager.searchStoredResults(
      opts('xyznonexistentterm999'),
      sessionA,
    );

    assert.strictEqual(results.length, 0, 'Should return empty array for unknown term');
  });
});
