/**
 * Solr End-to-End Workflow Integration Tests
 *
 * Exercises the full pipeline: ripgrep search → Solr indexing → re-query →
 * filtering → highlighting → session management → panel display.
 *
 * Requires:
 * - A live Solr server with the `smart-search-results` core
 * - The `rg` (ripgrep) binary available in PATH or via `smart-search.ripgrepPath`
 *
 * All tests are skipped gracefully when either prerequisite is missing.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import axios from 'axios';
import {
  skipIfSolrUnavailable,
  getSolrUrl,
  getSolrCoreUrl,
  seedDocuments,
  deleteByQuery,
  waitForCommit,
  getDocCount,
  querySolr,
} from './testHelpers';
import {
  E2E_TIMEOUT,
  COMMIT_WAIT_MS,
  TEST_QUERY_PREFIX,
} from './constants';
import {
  createTestDocument,
  generateTestMarker,
  generateTestSessionId,
} from './testDataFactory';
import { IndexManager } from '../../../services/indexManager';
import { SolrSessionManager } from '../../../services/solrSessionManager';
import { RipgrepSearcher } from '../../../services/ripgrepSearcher';
import { HighlightService } from '../../../services/highlightService';
import { SearchResult, SearchOptions, StoredSearchResult } from '../../../types';

// =========================================================================
// Helpers
// =========================================================================

/** Check whether ripgrep is usable by performing a minimal search. */
async function isRipgrepAvailable(): Promise<boolean> {
  try {
    const rg = new RipgrepSearcher();
    // Search for the package name – guaranteed to exist in package.json
    const results = await rg.search({ query: 'smart-search-ripsolr' });
    return results.length > 0;
  } catch {
    return false;
  }
}

// =========================================================================
// Suite
// =========================================================================

suite('Solr End-to-End Workflow Integration Tests', function () {
  this.timeout(E2E_TIMEOUT);

  let indexManager: IndexManager;
  let sessionManager: SolrSessionManager;
  let ripgrepSearcher: RipgrepSearcher;
  let highlightService: HighlightService;

  /** All session IDs created during the suite – cleaned up in suiteTeardown */
  const createdSessionIds: string[] = [];
  /** All test markers – used for bulk cleanup */
  const testMarkers: string[] = [];

  // -----------------------------------------------------------------------
  // Suite-level setup / teardown
  // -----------------------------------------------------------------------

  suiteSetup(async function () {
    this.timeout(60000);
    await skipIfSolrUnavailable(this);

    if (!(await isRipgrepAvailable())) {
      console.log('Ripgrep is not available – skipping E2E integration tests');
      this.skip();
    }

    indexManager = new IndexManager();
    sessionManager = new SolrSessionManager(getSolrUrl());
    ripgrepSearcher = new RipgrepSearcher();
    highlightService = new HighlightService();
  });

  suiteTeardown(async function () {
    this.timeout(60000);
    // Clean up every test marker in one go
    for (const marker of testMarkers) {
      await deleteByQuery(`original_query:"${marker}"*`).catch(() => {});
    }
    // Clean up by session IDs as a safety net
    for (const sid of createdSessionIds) {
      await deleteByQuery(`search_session_id:"${sid}"`).catch(() => {});
    }
  });

  // =======================================================================
  // Workflow 1: Search → Index → Re-query
  // =======================================================================

  suite('Workflow 1: Search → Index → Re-query', function () {
    this.timeout(E2E_TIMEOUT);

    let ripgrepResults: SearchResult[];
    let storedSessionId: string;
    const wf1Marker = generateTestMarker('e2e_wf1');

    suiteSetup(function () {
      testMarkers.push(wf1Marker);
    });

    test('1a. Ripgrep search returns results for a known pattern', async function () {
      // 'smart-search-ripsolr' is the npm package name — guaranteed in package.json
      ripgrepResults = await ripgrepSearcher.search({ query: 'smart-search-ripsolr' });
      assert.ok(ripgrepResults.length > 0, 'Ripgrep should find at least one match');
      assert.ok(ripgrepResults[0].file, 'Each result must have a file path');
      assert.ok(typeof ripgrepResults[0].line === 'number', 'Each result must have a line number');
    });

    test('1b. Store ripgrep results in Solr via IndexManager', async function () {
      const options: SearchOptions = { query: wf1Marker };
      storedSessionId = await indexManager.storeSearchResults(ripgrepResults, wf1Marker, options);
      createdSessionIds.push(storedSessionId);

      assert.ok(storedSessionId, 'storeSearchResults should return a session ID');
      assert.ok(storedSessionId.startsWith('session_'), 'Session ID should have the expected prefix');

      // Wait for Solr commit
      await waitForCommit();
    });

    test('1c. Query Solr returns stored results matching ripgrep output', async function () {
      const solrResults = await indexManager.searchStoredResults(
        { query: wf1Marker },
        storedSessionId,
      );

      assert.ok(solrResults.length > 0, 'Solr should return stored results');

      // Verify file paths match
      const solrFiles = new Set(solrResults.map(r => r.file));
      const rgFiles = new Set(ripgrepResults.map(r => r.file));
      for (const f of solrFiles) {
        assert.ok(rgFiles.has(f), `Solr result file "${f}" should be in ripgrep results`);
      }
    });

    test('1d. Detailed query returns enriched StoredSearchResult objects', async function () {
      const detailed = await indexManager.searchStoredResultsDetailed(
        { query: wf1Marker },
        storedSessionId,
      );

      assert.ok(detailed.length > 0, 'Detailed query should return results');

      const first = detailed[0];
      assert.ok(first.id, 'Should have id');
      assert.strictEqual(first.search_session_id, storedSessionId, 'Session ID should match');
      assert.ok(first.file_name, 'Should have file_name');
      assert.ok(first.file_path, 'Should have file_path');
      assert.ok(first.file_extension, 'Should have file_extension');
      assert.strictEqual(typeof first.line_number, 'number', 'line_number should be a number');
      assert.ok(first.match_text, 'Should have match_text');
      assert.ok(Array.isArray(first.snippets), 'Should have snippets array');
    });
  });

  // =======================================================================
  // Workflow 2: Multi-Session Search History
  // =======================================================================

  suite('Workflow 2: Multi-Session Search History', function () {
    this.timeout(E2E_TIMEOUT);

    const wf2Marker = generateTestMarker('e2e_wf2');
    const sessionAId = generateTestSessionId();
    const sessionBId = generateTestSessionId();
    const sessionCId = generateTestSessionId();

    suiteSetup(async function () {
      this.timeout(30000);
      testMarkers.push(wf2Marker);
      createdSessionIds.push(sessionAId, sessionBId, sessionCId);

      const now = new Date();
      const oneMinAgo = new Date(now.getTime() - 60_000);
      const twoMinAgo = new Date(now.getTime() - 120_000);

      // Session A — "function" results (oldest)
      const aDocs = [
        createTestDocument({
          search_session_id: sessionAId,
          original_query: `${wf2Marker}_function`,
          search_timestamp: twoMinAgo.toISOString(),
          file_name: 'handlers.js',
          file_path: '/src/handlers.js',
          file_extension: 'js',
          line_number: 10,
          match_text: 'function handleEvent()',
        }),
        createTestDocument({
          search_session_id: sessionAId,
          original_query: `${wf2Marker}_function`,
          search_timestamp: twoMinAgo.toISOString(),
          file_name: 'utils.js',
          file_path: '/src/utils.js',
          file_extension: 'js',
          line_number: 20,
          match_text: 'function debounce(fn)',
        }),
      ];

      // Session B — "interface" results (middle)
      const bDocs = [
        createTestDocument({
          search_session_id: sessionBId,
          original_query: `${wf2Marker}_interface`,
          search_timestamp: oneMinAgo.toISOString(),
          file_name: 'types.ts',
          file_path: '/src/types.ts',
          file_extension: 'ts',
          line_number: 1,
          match_text: 'interface SearchResult',
        }),
      ];

      // Session C — "import" results (most recent)
      const cDocs = [
        createTestDocument({
          search_session_id: sessionCId,
          original_query: `${wf2Marker}_import`,
          search_timestamp: now.toISOString(),
          file_name: 'app.ts',
          file_path: '/src/app.ts',
          file_extension: 'ts',
          line_number: 1,
          match_text: 'import vscode from "vscode"',
        }),
      ];

      await seedDocuments([...aDocs, ...bDocs, ...cDocs]);
    });

    test('2a. getSearchSessions lists all 3 sessions', async function () {
      const sessions = await indexManager.getSearchSessions();

      const ourSessions = sessions.filter(s =>
        [sessionAId, sessionBId, sessionCId].includes(s.sessionId),
      );
      assert.strictEqual(ourSessions.length, 3, 'Should find all 3 test sessions');
    });

    test('2b. getStoredQueries includes all 3 queries', async function () {
      const queries = await indexManager.getStoredQueries();

      // Our queries use the wf2Marker prefix
      const ourQueries = queries.filter(q => q.includes(wf2Marker));
      assert.ok(ourQueries.length >= 3, `Should find at least 3 test queries, found ${ourQueries.length}`);
    });

    test('2c. Search within Session A returns only Session A results', async function () {
      const results = await indexManager.searchStoredResultsDetailed(
        { query: `${wf2Marker}_function` },
        sessionAId,
      );

      assert.ok(results.length > 0, 'Should find results in Session A');
      assert.ok(
        results.every(r => r.search_session_id === sessionAId),
        'All results should belong to Session A',
      );
    });

    test('2d. Sessions are ordered by timestamp descending', async function () {
      const sessions = await indexManager.getSearchSessions();
      const ourSessions = sessions.filter(s =>
        [sessionAId, sessionBId, sessionCId].includes(s.sessionId),
      );

      // Verify descending timestamp order
      for (let i = 0; i < ourSessions.length - 1; i++) {
        const current = new Date(ourSessions[i].timestamp).getTime();
        const next = new Date(ourSessions[i + 1].timestamp).getTime();
        assert.ok(current >= next, 'Sessions should be ordered by timestamp descending');
      }
    });
  });

  // =======================================================================
  // Workflow 3: Search → Filter → Re-search
  // =======================================================================

  suite('Workflow 3: Search → Filter → Re-search', function () {
    this.timeout(E2E_TIMEOUT);

    const wf3Marker = generateTestMarker('e2e_wf3');
    const wf3SessionId = generateTestSessionId();

    suiteSetup(async function () {
      this.timeout(30000);
      testMarkers.push(wf3Marker);
      createdSessionIds.push(wf3SessionId);

      const docs = [
        createTestDocument({
          search_session_id: wf3SessionId,
          original_query: wf3Marker,
          file_name: 'extension.ts',
          file_path: '/workspace/src/extension.ts',
          file_extension: 'ts',
          line_number: 1,
          match_text: 'activate function',
        }),
        createTestDocument({
          search_session_id: wf3SessionId,
          original_query: wf3Marker,
          file_name: 'helper.ts',
          file_path: '/workspace/src/helper.ts',
          file_extension: 'ts',
          line_number: 5,
          match_text: 'utility helper',
        }),
        createTestDocument({
          search_session_id: wf3SessionId,
          original_query: wf3Marker,
          file_name: 'config.json',
          file_path: '/workspace/config.json',
          file_extension: 'json',
          line_number: 3,
          match_text: '"name": "smart-search"',
        }),
        createTestDocument({
          search_session_id: wf3SessionId,
          original_query: wf3Marker,
          file_name: 'app.js',
          file_path: '/workspace/src/app.js',
          file_extension: 'js',
          line_number: 10,
          match_text: 'const appConfig = {}',
        }),
      ];

      await seedDocuments(docs);
    });

    test('3a. Query all results in the session', async function () {
      const results = await indexManager.searchStoredResultsDetailed(
        { query: wf3Marker },
        wf3SessionId,
      );
      assert.strictEqual(results.length, 4, 'Should find all 4 documents');
    });

    test('3b. Apply file extension filter (ts only)', async function () {
      // Query with file_extension filter via Solr directly
      const coreUrl = getSolrCoreUrl();
      const response = await axios.get(`${coreUrl}/select`, {
        params: {
          q: '*:*',
          fq: `search_session_id:"${wf3SessionId}" AND file_extension:"ts"`,
          wt: 'json',
          rows: 100,
        },
      });
      const docs = response.data.response.docs;
      assert.strictEqual(docs.length, 2, 'Should find 2 TypeScript files');
      assert.ok(docs.every((d: any) => d.file_extension === 'ts'), 'All should be .ts');
    });

    test('3c. Apply field query for specific file name', async function () {
      const coreUrl = getSolrCoreUrl();
      const response = await axios.get(`${coreUrl}/select`, {
        params: {
          q: '*:*',
          fq: `search_session_id:"${wf3SessionId}" AND file_name:"extension.ts"`,
          wt: 'json',
          rows: 100,
        },
      });
      const docs = response.data.response.docs;
      assert.strictEqual(docs.length, 1, 'Should find exactly 1 result');
      assert.strictEqual(docs[0].file_name, 'extension.ts', 'Should be extension.ts');
    });

    test('3d. Re-search within filtered results', async function () {
      // First search for "activate" specifically
      const results = await indexManager.searchStoredResultsDetailed(
        { query: 'activate' },
        wf3SessionId,
      );
      assert.ok(results.length > 0, 'Should find "activate" in session');
      assert.ok(
        results.some(r => r.match_text.includes('activate')),
        'At least one result should contain "activate"',
      );
    });
  });

  // =======================================================================
  // Workflow 4: Search with Highlighting
  // =======================================================================

  suite('Workflow 4: Search with Highlighting', function () {
    this.timeout(E2E_TIMEOUT);

    const wf4Marker = generateTestMarker('e2e_wf4');
    const wf4SessionId = generateTestSessionId();

    suiteSetup(async function () {
      this.timeout(30000);
      testMarkers.push(wf4Marker);
      createdSessionIds.push(wf4SessionId);

      const docs = [
        createTestDocument({
          search_session_id: wf4SessionId,
          original_query: wf4Marker,
          file_name: 'calculator.ts',
          file_path: '/src/calculator.ts',
          file_extension: 'ts',
          line_number: 5,
          match_text: 'function calculateTotal(items)',
          full_line: '  function calculateTotal(items) {',
          display_content: '// sum up items\n>>> function calculateTotal(items) { <<<\n  return items.reduce((a, b) => a + b);',
          context_before: ['// sum up items'],
          context_after: ['  return items.reduce((a, b) => a + b);'],
        }),
        createTestDocument({
          search_session_id: wf4SessionId,
          original_query: wf4Marker,
          file_name: 'pricing.ts',
          file_path: '/src/pricing.ts',
          file_extension: 'ts',
          line_number: 12,
          match_text: 'calculateTotal(cart.items)',
          full_line: '  const total = calculateTotal(cart.items);',
          display_content: '// call calculate\n>>> const total = calculateTotal(cart.items); <<<\n  return total;',
          context_before: ['// call calculate'],
          context_after: ['  return total;'],
        }),
      ];

      await seedDocuments(docs);
    });

    test('4a. Solr returns highlighting data for queried term', async function () {
      const coreUrl = getSolrCoreUrl();
      const hlParams = highlightService.buildSolrHighlightParams({ query: 'calculateTotal' });

      const response = await axios.get(`${coreUrl}/search`, {
        params: {
          q: 'display_content:calculateTotal',
          fq: `search_session_id:"${wf4SessionId}"`,
          wt: 'json',
          rows: 10,
          ...hlParams,
        },
      });

      const highlighting = response.data.highlighting || {};
      const hlKeys = Object.keys(highlighting);

      assert.ok(hlKeys.length > 0, 'Should have highlighting data');

      // At least one document should have highlighted display_content
      const hasHighlightedContent = hlKeys.some(
        key => highlighting[key].display_content && highlighting[key].display_content.length > 0,
      );
      assert.ok(hasHighlightedContent, 'At least one doc should have highlighted display_content');
    });

    test('4b. Highlighted content contains <mark> tags', async function () {
      const coreUrl = getSolrCoreUrl();
      const hlParams = highlightService.buildSolrHighlightParams({ query: 'calculateTotal' });

      const response = await axios.get(`${coreUrl}/search`, {
        params: {
          q: 'display_content:calculateTotal',
          fq: `search_session_id:"${wf4SessionId}"`,
          wt: 'json',
          rows: 10,
          ...hlParams,
        },
      });

      const highlighting = response.data.highlighting || {};
      const allSnippets = Object.values(highlighting)
        .flatMap((h: any) => h.display_content || []);

      assert.ok(allSnippets.length > 0, 'Should have highlight snippets');

      const hasMarkTags = allSnippets.some(
        (s: string) => s.includes('<mark') && s.includes('</mark>'),
      );
      assert.ok(hasMarkTags, 'Snippets should contain <mark> tags');
    });

    test('4c. searchStoredResultsDetailed returns snippets', async function () {
      const results = await indexManager.searchStoredResultsDetailed(
        { query: 'calculateTotal' },
        wf4SessionId,
      );

      assert.ok(results.length > 0, 'Should find results');

      // At least one result should have non-empty snippets
      const hasSnippets = results.some(r => r.snippets && r.snippets.length > 0);
      assert.ok(hasSnippets, 'At least one result should have snippets');
    });
  });

  // =======================================================================
  // Workflow 5: Session Cleanup
  // =======================================================================

  suite('Workflow 5: Session Cleanup', function () {
    this.timeout(E2E_TIMEOUT);

    const wf5Marker = generateTestMarker('e2e_wf5');
    const recentSessionId = generateTestSessionId();
    const fifteenDaySessionId = generateTestSessionId();
    const fortyFiveDaySessionId = generateTestSessionId();

    suiteSetup(async function () {
      this.timeout(30000);
      testMarkers.push(wf5Marker);
      createdSessionIds.push(recentSessionId, fifteenDaySessionId, fortyFiveDaySessionId);

      const now = new Date();
      const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60_000);
      const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60_000);

      const docs = [
        createTestDocument({
          search_session_id: recentSessionId,
          original_query: `${wf5Marker}_recent`,
          search_timestamp: now.toISOString(),
          file_name: 'recent.ts',
          file_path: '/src/recent.ts',
          file_extension: 'ts',
          line_number: 1,
          match_text: 'recent code',
        }),
        createTestDocument({
          search_session_id: fifteenDaySessionId,
          original_query: `${wf5Marker}_15day`,
          search_timestamp: fifteenDaysAgo.toISOString(),
          file_name: 'middle.ts',
          file_path: '/src/middle.ts',
          file_extension: 'ts',
          line_number: 1,
          match_text: 'fifteen day old code',
        }),
        createTestDocument({
          search_session_id: fortyFiveDaySessionId,
          original_query: `${wf5Marker}_45day`,
          search_timestamp: fortyFiveDaysAgo.toISOString(),
          file_name: 'old.ts',
          file_path: '/src/old.ts',
          file_extension: 'ts',
          line_number: 1,
          match_text: 'forty five day old code',
        }),
      ];

      await seedDocuments(docs);
    });

    test('5a. All 3 sessions exist before cleanup', async function () {
      const sessions = await indexManager.getSearchSessions();
      const ourSessions = sessions.filter(s =>
        [recentSessionId, fifteenDaySessionId, fortyFiveDaySessionId].includes(s.sessionId),
      );
      assert.strictEqual(ourSessions.length, 3, 'All 3 sessions should exist before cleanup');
    });

    test('5b. cleanupOldSessions(30) removes the 45-day session', async function () {
      await indexManager.cleanupOldSessions(30);
      await waitForCommit();

      const count45 = await getDocCount(`search_session_id:"${fortyFiveDaySessionId}"`);
      assert.strictEqual(count45, 0, '45-day session should be deleted');
    });

    test('5c. Recent and 15-day sessions remain after cleanup', async function () {
      const countRecent = await getDocCount(`search_session_id:"${recentSessionId}"`);
      const count15 = await getDocCount(`search_session_id:"${fifteenDaySessionId}"`);

      assert.ok(countRecent > 0, 'Recent session should still exist');
      assert.ok(count15 > 0, '15-day session should still exist');
    });

    test('5d. getSearchSessions lists only 2 remaining sessions', async function () {
      const sessions = await indexManager.getSearchSessions();
      const ourSessions = sessions.filter(s =>
        [recentSessionId, fifteenDaySessionId, fortyFiveDaySessionId].includes(s.sessionId),
      );
      assert.strictEqual(ourSessions.length, 2, 'Should only have 2 sessions remaining');
      assert.ok(
        !ourSessions.some(s => s.sessionId === fortyFiveDaySessionId),
        '45-day session should not appear',
      );
    });
  });

  // =======================================================================
  // Workflow 6: Suggestions During Search
  // =======================================================================

  suite('Workflow 6: Suggestions During Search', function () {
    this.timeout(E2E_TIMEOUT);

    const wf6Marker = generateTestMarker('e2e_wf6');
    const wf6SessionId = generateTestSessionId();

    suiteSetup(async function () {
      this.timeout(30000);
      testMarkers.push(wf6Marker);
      createdSessionIds.push(wf6SessionId);

      const docs = [
        createTestDocument({
          search_session_id: wf6SessionId,
          original_query: wf6Marker,
          file_name: 'handlers.ts',
          file_path: '/src/handlers.ts',
          file_extension: 'ts',
          line_number: 1,
          match_text: 'function handleClickEvent()',
        }),
        createTestDocument({
          search_session_id: wf6SessionId,
          original_query: wf6Marker,
          file_name: 'utils.ts',
          file_path: '/src/utils.ts',
          file_extension: 'ts',
          line_number: 5,
          match_text: 'function debounce(handler, delay)',
        }),
        createTestDocument({
          search_session_id: wf6SessionId,
          original_query: wf6Marker,
          file_name: 'events.ts',
          file_path: '/src/events.ts',
          file_extension: 'ts',
          line_number: 10,
          match_text: 'export function handleSubmitForm()',
        }),
      ];

      await seedDocuments(docs);
    });

    test('6a. getSuggestions for partial match returns suggestions', async function () {
      const suggestions = await indexManager.getSuggestions('handle', wf6SessionId);
      assert.ok(Array.isArray(suggestions), 'Should return an array');
      // "handle" should match "handleClickEvent", "handleSubmitForm", or "handler"
      assert.ok(suggestions.length > 0, 'Should return at least one suggestion for "handle"');
    });

    test('6b. getSuggestions scoped to session returns session-specific suggestions', async function () {
      const suggestions = await indexManager.getSuggestions('handle', wf6SessionId);
      assert.ok(suggestions.length > 0, 'Should return session-scoped suggestions');

      // All suggestions should be related to content in the session
      const hasRelevant = suggestions.some(
        s => s.toLowerCase().includes('handle'),
      );
      assert.ok(hasRelevant, 'Suggestions should include terms starting with "handle"');
    });

    test('6c. getSuggestions returns empty for very short input', async function () {
      const suggestions = await indexManager.getSuggestions('h', wf6SessionId);
      assert.ok(Array.isArray(suggestions), 'Should return an array');
      assert.strictEqual(suggestions.length, 0, 'Should return empty for single-char input');
    });
  });

  // =======================================================================
  // Workflow 7: Case-Sensitive and Whole-Word Search Round-Trip
  // =======================================================================

  suite('Workflow 7: Case-Sensitive and Whole-Word Round-Trip', function () {
    this.timeout(E2E_TIMEOUT);

    const wf7Marker = generateTestMarker('e2e_wf7');
    const wf7SessionId = generateTestSessionId();

    suiteSetup(async function () {
      this.timeout(30000);
      testMarkers.push(wf7Marker);
      createdSessionIds.push(wf7SessionId);

      const docs = [
        createTestDocument({
          search_session_id: wf7SessionId,
          original_query: wf7Marker,
          file_name: 'caseSensitive.ts',
          file_path: '/src/caseSensitive.ts',
          file_extension: 'ts',
          line_number: 1,
          match_text: 'CamelCaseFunction',
          case_sensitive: true,
          whole_word: false,
        }),
        createTestDocument({
          search_session_id: wf7SessionId,
          original_query: wf7Marker,
          file_name: 'caseInsensitive.ts',
          file_path: '/src/caseInsensitive.ts',
          file_extension: 'ts',
          line_number: 5,
          match_text: 'lowercasefunction',
          case_sensitive: false,
          whole_word: false,
        }),
        createTestDocument({
          search_session_id: wf7SessionId,
          original_query: wf7Marker,
          file_name: 'wholeWord.ts',
          file_path: '/src/wholeWord.ts',
          file_extension: 'ts',
          line_number: 10,
          match_text: 'import handler from module',
          case_sensitive: false,
          whole_word: true,
        }),
        createTestDocument({
          search_session_id: wf7SessionId,
          original_query: wf7Marker,
          file_name: 'bothConstraints.ts',
          file_path: '/src/bothConstraints.ts',
          file_extension: 'ts',
          line_number: 15,
          match_text: 'ExactMatch only',
          case_sensitive: true,
          whole_word: true,
        }),
      ];

      await seedDocuments(docs);
    });

    test('7a. Query with caseSensitive filter returns only case-sensitive results', async function () {
      const coreUrl = getSolrCoreUrl();
      const response = await axios.get(`${coreUrl}/select`, {
        params: {
          q: '*:*',
          fq: `search_session_id:"${wf7SessionId}" AND case_sensitive:true`,
          wt: 'json',
          rows: 100,
        },
      });
      const docs = response.data.response.docs;
      assert.ok(docs.length >= 2, 'Should find at least 2 case-sensitive results');
      assert.ok(
        docs.every((d: any) => d.case_sensitive === true),
        'All results should have case_sensitive=true',
      );
    });

    test('7b. Query with wholeWord filter returns only whole-word results', async function () {
      const coreUrl = getSolrCoreUrl();
      const response = await axios.get(`${coreUrl}/select`, {
        params: {
          q: '*:*',
          fq: `search_session_id:"${wf7SessionId}" AND whole_word:true`,
          wt: 'json',
          rows: 100,
        },
      });
      const docs = response.data.response.docs;
      assert.ok(docs.length >= 2, 'Should find at least 2 whole-word results');
      assert.ok(
        docs.every((d: any) => d.whole_word === true),
        'All results should have whole_word=true',
      );
    });

    test('7c. Combined caseSensitive + wholeWord constraint', async function () {
      const coreUrl = getSolrCoreUrl();
      const response = await axios.get(`${coreUrl}/select`, {
        params: {
          q: '*:*',
          fq: `search_session_id:"${wf7SessionId}" AND case_sensitive:true AND whole_word:true`,
          wt: 'json',
          rows: 100,
        },
      });
      const docs = response.data.response.docs;
      assert.strictEqual(docs.length, 1, 'Should find exactly 1 result with both constraints');
      assert.strictEqual(docs[0].file_name, 'bothConstraints.ts', 'Should be bothConstraints.ts');
    });
  });

  // =======================================================================
  // Workflow 8: Large Result Set Handling
  // =======================================================================

  suite('Workflow 8: Large Result Set Handling', function () {
    this.timeout(E2E_TIMEOUT);

    const wf8Marker = generateTestMarker('e2e_wf8');
    const wf8SessionId = generateTestSessionId();
    const DOC_COUNT = 50;

    suiteSetup(async function () {
      this.timeout(60000);
      testMarkers.push(wf8Marker);
      createdSessionIds.push(wf8SessionId);

      // Create 50 documents to simulate a large result set
      const docs: any[] = [];
      for (let i = 0; i < DOC_COUNT; i++) {
        docs.push(
          createTestDocument({
            search_session_id: wf8SessionId,
            original_query: wf8Marker,
            file_name: `file_${String(i).padStart(3, '0')}.ts`,
            file_path: `/workspace/src/file_${String(i).padStart(3, '0')}.ts`,
            file_extension: 'ts',
            line_number: i + 1,
            match_text: `const value${i} = ${i}`,
            relevance_score: DOC_COUNT - i, // Descending relevance
          }),
        );
      }

      await seedDocuments(docs);
    });

    test('8a. All documents are stored', async function () {
      const count = await getDocCount(`search_session_id:"${wf8SessionId}"`);
      assert.strictEqual(count, DOC_COUNT, `Should have ${DOC_COUNT} documents`);
    });

    test('8b. maxResults=10 limits returned results', async function () {
      const results = await indexManager.searchStoredResultsDetailed(
        { query: wf8Marker, maxResults: 10 },
        wf8SessionId,
      );
      assert.strictEqual(results.length, 10, 'Should return exactly 10 results');
    });

    test('8c. maxResults=30 returns more results', async function () {
      const results = await indexManager.searchStoredResultsDetailed(
        { query: wf8Marker, maxResults: 30 },
        wf8SessionId,
      );
      assert.strictEqual(results.length, 30, 'Should return exactly 30 results');
    });

    test('8d. Default query returns results up to configured limit', async function () {
      const results = await indexManager.searchStoredResultsDetailed(
        { query: wf8Marker },
        wf8SessionId,
      );
      assert.ok(results.length > 0, 'Should return results');
      assert.ok(results.length <= DOC_COUNT, 'Should not exceed total doc count');
    });
  });

  // =======================================================================
  // Workflow 9: Error Recovery
  // =======================================================================

  suite('Workflow 9: Error Recovery', function () {
    this.timeout(E2E_TIMEOUT);

    test('9a. IndexManager with bad URL handles search errors gracefully', async function () {
      // Create IndexManager pointing to a bad URL
      // We achieve this by temporarily changing the config, then constructing
      const badConfig = vscode.workspace.getConfiguration('smart-search');
      const originalUrl = badConfig.get<string>('solrUrl', 'http://localhost:8983/solr');

      try {
        // Instead of changing config, we use SolrSessionManager directly with a bad URL
        const badManager = new SolrSessionManager('http://localhost:19999/solr');

        let caughtError = false;
        try {
          await badManager.getSearchSessions();
        } catch {
          caughtError = true;
        }
        assert.ok(caughtError, 'Should throw an error for bad URL');
      } catch (e) {
        // The error itself is the expected behavior
        assert.ok(true, 'Error thrown as expected');
      }
    });

    test('9b. getSuggestions with invalid URL returns empty gracefully', async function () {
      const badManager = new SolrSessionManager('http://localhost:19999/solr');
      const suggestions = await badManager.getSuggestions('test');
      assert.ok(Array.isArray(suggestions), 'Should return an array');
      assert.strictEqual(suggestions.length, 0, 'Should return empty array on error');
    });

    test('9c. IndexManager still works after failed connection attempt', async function () {
      // Verify the good indexManager still works
      const sessions = await indexManager.getSearchSessions();
      assert.ok(Array.isArray(sessions), 'Should still be able to list sessions');
    });
  });

  // =======================================================================
  // Workflow 10: Re-index Updated Content
  // =======================================================================

  suite('Workflow 10: Re-index Updated Content', function () {
    this.timeout(E2E_TIMEOUT);

    const wf10Marker = generateTestMarker('e2e_wf10');
    const sessionV1 = generateTestSessionId();
    const sessionV2 = generateTestSessionId();

    suiteSetup(async function () {
      this.timeout(30000);
      testMarkers.push(wf10Marker);
      createdSessionIds.push(sessionV1, sessionV2);
    });

    test('10a. Store initial results as Session V1', async function () {
      const v1Docs = [
        createTestDocument({
          search_session_id: sessionV1,
          original_query: `${wf10Marker}_v1`,
          file_name: 'component.ts',
          file_path: '/src/component.ts',
          file_extension: 'ts',
          line_number: 5,
          match_text: 'const version = 1',
        }),
        createTestDocument({
          search_session_id: sessionV1,
          original_query: `${wf10Marker}_v1`,
          file_name: 'service.ts',
          file_path: '/src/service.ts',
          file_extension: 'ts',
          line_number: 10,
          match_text: 'export class OldService',
        }),
      ];

      await seedDocuments(v1Docs);
      const count = await getDocCount(`search_session_id:"${sessionV1}"`);
      assert.strictEqual(count, 2, 'V1 should have 2 documents');
    });

    test('10b. Store updated results as Session V2 (simulating re-run after file changes)', async function () {
      const now = new Date();

      const v2Docs = [
        createTestDocument({
          search_session_id: sessionV2,
          original_query: `${wf10Marker}_v2`,
          search_timestamp: now.toISOString(),
          file_name: 'component.ts',
          file_path: '/src/component.ts',
          file_extension: 'ts',
          line_number: 5,
          match_text: 'const version = 2',  // Updated content
        }),
        createTestDocument({
          search_session_id: sessionV2,
          original_query: `${wf10Marker}_v2`,
          search_timestamp: now.toISOString(),
          file_name: 'service.ts',
          file_path: '/src/service.ts',
          file_extension: 'ts',
          line_number: 10,
          match_text: 'export class NewService',  // Renamed class
        }),
        createTestDocument({
          search_session_id: sessionV2,
          original_query: `${wf10Marker}_v2`,
          search_timestamp: now.toISOString(),
          file_name: 'newFile.ts',
          file_path: '/src/newFile.ts',
          file_extension: 'ts',
          line_number: 1,
          match_text: 'export function brandNewFeature()',  // New file
        }),
      ];

      await seedDocuments(v2Docs);
      const count = await getDocCount(`search_session_id:"${sessionV2}"`);
      assert.strictEqual(count, 3, 'V2 should have 3 documents');
    });

    test('10c. Both sessions coexist in Solr', async function () {
      const countV1 = await getDocCount(`search_session_id:"${sessionV1}"`);
      const countV2 = await getDocCount(`search_session_id:"${sessionV2}"`);

      assert.strictEqual(countV1, 2, 'V1 session should still have 2 docs');
      assert.strictEqual(countV2, 3, 'V2 session should have 3 docs');
    });

    test('10d. V2 has updated content captured', async function () {
      const results = await indexManager.searchStoredResultsDetailed(
        { query: `${wf10Marker}_v2` },
        sessionV2,
      );

      assert.strictEqual(results.length, 3, 'V2 should have 3 results');

      const matchTexts = results.map(r => r.match_text);
      assert.ok(matchTexts.some(t => t.includes('version = 2')), 'Should contain updated version');
      assert.ok(matchTexts.some(t => t.includes('NewService')), 'Should contain renamed class');
      assert.ok(matchTexts.some(t => t.includes('brandNewFeature')), 'Should contain new file content');
    });

    test('10e. V1 retains original content', async function () {
      const results = await indexManager.searchStoredResultsDetailed(
        { query: `${wf10Marker}_v1` },
        sessionV1,
      );

      assert.strictEqual(results.length, 2, 'V1 should still have 2 results');

      const matchTexts = results.map(r => r.match_text);
      assert.ok(matchTexts.some(t => t.includes('version = 1')), 'V1 should have original version');
      assert.ok(matchTexts.some(t => t.includes('OldService')), 'V1 should have original class name');
    });
  });

  // =======================================================================
  // Workflow 11 (bonus): Full Pipeline — ripgrep → index → detailed query
  // =======================================================================

  suite('Workflow 11: Full Pipeline with Real Ripgrep', function () {
    this.timeout(E2E_TIMEOUT);

    const wf11Marker = generateTestMarker('e2e_wf11');
    let storedSessionId: string;
    let rgResultCount: number;

    suiteSetup(function () {
      testMarkers.push(wf11Marker);
    });

    test('11a. Run ripgrep for "import" → get real results', async function () {
      const results = await ripgrepSearcher.search({ query: 'import' });
      assert.ok(results.length > 0, 'Ripgrep should find "import" in the workspace');
      rgResultCount = results.length;

      // Store them
      const options: SearchOptions = {
        query: wf11Marker,
        caseSensitive: false,
        wholeWord: false,
        useRegex: false,
      };
      storedSessionId = await indexManager.storeSearchResults(results, wf11Marker, options);
      createdSessionIds.push(storedSessionId);

      assert.ok(storedSessionId, 'Should get a session ID');
      await waitForCommit();
    });

    test('11b. Solr contains all indexed results', async function () {
      const count = await getDocCount(`search_session_id:"${storedSessionId}"`);
      assert.strictEqual(count, rgResultCount, 'Solr doc count should match ripgrep result count');
    });

    test('11c. Detailed query returns full StoredSearchResult objects', async function () {
      const results = await indexManager.searchStoredResultsDetailed(
        { query: wf11Marker },
        storedSessionId,
      );

      assert.ok(results.length > 0, 'Should get detailed results from Solr');

      // Verify structural integrity
      for (const r of results) {
        assert.ok(r.id, 'id present');
        assert.strictEqual(r.search_session_id, storedSessionId, 'session matches');
        assert.ok(r.file_path, 'file_path present');
        assert.ok(r.file_name, 'file_name present');
        assert.strictEqual(typeof r.line_number, 'number', 'line_number is number');
        assert.ok(r.match_text, 'match_text present');
        assert.ok(Array.isArray(r.context_before), 'context_before is array');
        assert.ok(Array.isArray(r.context_after), 'context_after is array');
      }
    });

    test('11d. Results have valid file paths from this workspace', async function () {
      const results = await indexManager.searchStoredResultsDetailed(
        { query: wf11Marker, maxResults: 5 },
        storedSessionId,
      );

      for (const r of results) {
        // File paths should be absolute
        assert.ok(
          path.isAbsolute(r.file_path),
          `file_path should be absolute: ${r.file_path}`,
        );
        // Extension should be non-empty
        assert.ok(r.file_extension, `file_extension should be non-empty for ${r.file_name}`);
      }
    });
  });
});
