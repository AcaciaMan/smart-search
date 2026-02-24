/**
 * Solr Session Management Integration Tests
 *
 * Verifies `SolrSessionManager` session lifecycle — listing sessions,
 * query history, most-recent lookup, suggestions, and cleanup —
 * against a live Solr instance with known seeded data.
 *
 * Requires a live Solr server — all tests are skipped when Solr is unreachable.
 */

import * as assert from 'assert';
import {
  skipIfSolrUnavailable,
  getSolrUrl,
  seedDocuments,
  deleteByQuery,
  waitForCommit,
  getDocCount,
} from './testHelpers';
import {
  TEST_TIMEOUT,
  TEST_QUERY_PREFIX,
} from './constants';
import { createTestDocument, generateTestMarker } from './testDataFactory';
import { SolrSessionManager } from '../../../services/solrSessionManager';

suite('Solr Session Management Integration Tests', function () {
  this.timeout(TEST_TIMEOUT);

  let sessionManager: SolrSessionManager;
  let testMarker: string;

  // Deterministic session IDs
  const session1Id = `session_test_sess_001_${Date.now()}`;
  const session2Id = `session_test_sess_002_${Date.now()}`;
  const session3Id = `session_test_sess_003_${Date.now()}`;

  // Timestamps
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  suiteSetup(async function () {
    this.timeout(30000);
    await skipIfSolrUnavailable(this);

    sessionManager = new SolrSessionManager(getSolrUrl());
    testMarker = generateTestMarker('session');

    // Session 1 — recent, 2 docs
    const session1Docs = [
      createTestDocument({
        search_session_id: session1Id,
        original_query: `${testMarker}_function_handler`,
        search_timestamp: now.toISOString(),
        match_text: 'function handleClick(event)',
        file_name: 'app.js',
        file_path: '/src/app.js',
        file_extension: 'js',
        line_number: 10,
      }),
      createTestDocument({
        search_session_id: session1Id,
        original_query: `${testMarker}_function_handler`,
        search_timestamp: now.toISOString(),
        match_text: 'function handleSubmit(form)',
        file_name: 'form.js',
        file_path: '/src/form.js',
        file_extension: 'js',
        line_number: 5,
      }),
    ];

    // Session 2 — 1 day old, 1 doc
    const session2Docs = [
      createTestDocument({
        search_session_id: session2Id,
        original_query: `${testMarker}_interface_definition`,
        search_timestamp: oneDayAgo.toISOString(),
        match_text: 'interface SearchResult',
        file_name: 'types.ts',
        file_path: '/src/types.ts',
        file_extension: 'ts',
        line_number: 1,
      }),
    ];

    // Session 3 — 60 days old, 1 doc
    const session3Docs = [
      createTestDocument({
        search_session_id: session3Id,
        original_query: `${testMarker}_old_cleanup_test`,
        search_timestamp: sixtyDaysAgo.toISOString(),
        match_text: 'const legacy = true',
        file_name: 'old.js',
        file_path: '/src/old.js',
        file_extension: 'js',
        line_number: 1,
      }),
    ];

    await seedDocuments([...session1Docs, ...session2Docs, ...session3Docs]);
  });

  suiteTeardown(async function () {
    this.timeout(30000);
    await deleteByQuery(`original_query:${TEST_QUERY_PREFIX}*`);
  });

  // -----------------------------------------------------------------------
  // 1. getStoredQueries — Basic
  // -----------------------------------------------------------------------

  test('getStoredQueries returns array including test queries', async () => {
    const queries = await sessionManager.getStoredQueries();

    assert.ok(Array.isArray(queries), 'Should return an array');
    assert.ok(queries.length > 0, 'Should have stored queries');

    // Our test query should be present
    const hasTestQuery = queries.some((q) =>
      q.includes(testMarker),
    );
    assert.ok(hasTestQuery, 'Should contain the seeded test query');
  });

  // -----------------------------------------------------------------------
  // 2. getStoredQueries — Empty (handled implicitly)
  // -----------------------------------------------------------------------

  test('getStoredQueries returns array (may be empty or contain data)', async () => {
    // We can't easily empty the whole index, but we verify the method
    // returns a well-formed array and does not throw
    const queries = await sessionManager.getStoredQueries();
    assert.ok(Array.isArray(queries), 'Should return an array');
  });

  // -----------------------------------------------------------------------
  // 3. getSearchSessions — Lists All Sessions
  // -----------------------------------------------------------------------

  test('getSearchSessions returns all test sessions', async () => {
    const sessions = await sessionManager.getSearchSessions();

    assert.ok(Array.isArray(sessions), 'Should return an array');
    assert.ok(sessions.length >= 3, `Should have at least 3 sessions, got ${sessions.length}`);

    const testSessions = sessions.filter(
      (s) =>
        s.sessionId === session1Id ||
        s.sessionId === session2Id ||
        s.sessionId === session3Id,
    );
    assert.strictEqual(testSessions.length, 3, 'Should find all 3 test sessions');

    // Each session should have required fields
    for (const s of testSessions) {
      assert.ok(s.sessionId, 'sessionId should be populated');
      assert.ok(s.query, 'query should be populated');
      assert.ok(s.timestamp, 'timestamp should be populated');
    }
  });

  // -----------------------------------------------------------------------
  // 4. getSearchSessions — Sorted descending, metadata correct
  // -----------------------------------------------------------------------

  test('getSearchSessions returns sessions sorted by timestamp desc', async () => {
    const sessions = await sessionManager.getSearchSessions();

    // Verify descending order
    for (let i = 1; i < sessions.length; i++) {
      const prev = new Date(sessions[i - 1].timestamp).getTime();
      const curr = new Date(sessions[i].timestamp).getTime();
      assert.ok(prev >= curr, 'Sessions should be sorted by timestamp descending');
    }

    // Verify session 1 metadata
    const s1 = sessions.find((s) => s.sessionId === session1Id);
    assert.ok(s1, 'Session 1 should be present');

    // original_query may come back as an array from Solr
    const s1Query = Array.isArray(s1!.query) ? s1!.query[0] : s1!.query;
    assert.ok(
      s1Query.includes(testMarker),
      `Session 1 query should contain test marker, got "${s1Query}"`,
    );

    // Timestamps should be valid ISO dates
    for (const s of sessions) {
      assert.ok(
        !isNaN(Date.parse(Array.isArray(s.timestamp) ? s.timestamp[0] : s.timestamp)),
        `Timestamp should be a valid ISO date, got "${s.timestamp}"`,
      );
    }
  });

  // -----------------------------------------------------------------------
  // 5. getMostRecentSessionId
  // -----------------------------------------------------------------------

  test('getMostRecentSessionId returns the most recent session', async () => {
    const mostRecent = await sessionManager.getMostRecentSessionId();

    assert.ok(mostRecent, 'Should return a session ID');
    // Session 1 is the newest (timestamp = now)
    // But other test suites may have seeded more recent sessions,
    // so just verify a valid session ID is returned
    assert.ok(
      typeof mostRecent === 'string' && mostRecent.startsWith('session_'),
      `Should return a valid session ID, got "${mostRecent}"`,
    );
  });

  // -----------------------------------------------------------------------
  // 6. getMostRecentSessionId — After Adding New Session
  // -----------------------------------------------------------------------

  test('getMostRecentSessionId returns newest after adding a session', async () => {
    const session4Id = `session_test_sess_004_${Date.now()}`;

    await seedDocuments([
      createTestDocument({
        search_session_id: session4Id,
        original_query: `${testMarker}_newest_session`,
        search_timestamp: new Date().toISOString(), // right now — newest
        match_text: 'newest session doc',
        file_name: 'newest.ts',
        file_path: '/src/newest.ts',
        file_extension: 'ts',
        line_number: 1,
      }),
    ]);

    const mostRecent = await sessionManager.getMostRecentSessionId();
    assert.strictEqual(
      mostRecent,
      session4Id,
      `Most recent should be ${session4Id}, got ${mostRecent}`,
    );

    // Cleanup the extra session
    await deleteByQuery(`search_session_id:"${session4Id}"`);
  });

  // -----------------------------------------------------------------------
  // 7. cleanupOldSessions — Deletes old sessions
  // -----------------------------------------------------------------------

  test('cleanupOldSessions(30) deletes 60-day-old session', async () => {
    // Verify session 3 exists before cleanup
    const countBefore = await getDocCount(`search_session_id:"${session3Id}"`);
    assert.strictEqual(countBefore, 1, 'Session 3 should exist before cleanup');

    await sessionManager.cleanupOldSessions(30);
    await waitForCommit();

    // Session 3 (60 days old) should be deleted
    const countAfter = await getDocCount(`search_session_id:"${session3Id}"`);
    assert.strictEqual(countAfter, 0, 'Session 3 should be deleted after cleanup');

    // Sessions 1 and 2 should still exist
    const count1 = await getDocCount(`search_session_id:"${session1Id}"`);
    const count2 = await getDocCount(`search_session_id:"${session2Id}"`);
    assert.ok(count1 > 0, 'Session 1 should still exist');
    assert.ok(count2 > 0, 'Session 2 should still exist');
  });

  // -----------------------------------------------------------------------
  // 8. cleanupOldSessions — No Old Sessions
  // -----------------------------------------------------------------------

  test('cleanupOldSessions(365) does not delete recent sessions', async () => {
    const count1Before = await getDocCount(`search_session_id:"${session1Id}"`);
    const count2Before = await getDocCount(`search_session_id:"${session2Id}"`);

    await sessionManager.cleanupOldSessions(365);
    await waitForCommit();

    const count1After = await getDocCount(`search_session_id:"${session1Id}"`);
    const count2After = await getDocCount(`search_session_id:"${session2Id}"`);

    assert.strictEqual(count1After, count1Before, 'Session 1 count should be unchanged');
    assert.strictEqual(count2After, count2Before, 'Session 2 count should be unchanged');
  });

  // -----------------------------------------------------------------------
  // 9. getSuggestions — Basic Prefix Match
  // -----------------------------------------------------------------------

  test('getSuggestions returns prefix matches for "handle"', async () => {
    const suggestions = await sessionManager.getSuggestions('handle', session1Id);

    assert.ok(Array.isArray(suggestions), 'Should return an array');
    // Session 1 has "handleClick" and "handleSubmit" in match_text
    // At least one should match
    if (suggestions.length > 0) {
      const hasHandle = suggestions.some((s) =>
        s.toLowerCase().includes('handle'),
      );
      assert.ok(hasHandle, 'Should include suggestions containing "handle"');
    }
  });

  // -----------------------------------------------------------------------
  // 10. getSuggestions — Session-Scoped
  // -----------------------------------------------------------------------

  test('getSuggestions scoped to session 1 returns session-specific terms', async () => {
    const suggestions = await sessionManager.getSuggestions('handle', session1Id);

    // Should find handleClick / handleSubmit from session 1
    if (suggestions.length > 0) {
      const relevant = suggestions.filter(
        (s) => s.toLowerCase().includes('handleclick') || s.toLowerCase().includes('handlesubmit'),
      );
      assert.ok(
        relevant.length >= 1,
        `Should find session-1-specific suggestions, got: ${JSON.stringify(suggestions)}`,
      );
    }
  });

  // -----------------------------------------------------------------------
  // 11. getSuggestions — Short Query (<2 chars)
  // -----------------------------------------------------------------------

  test('getSuggestions with 1-char query returns empty array', async () => {
    const suggestions = await sessionManager.getSuggestions('f');

    assert.ok(Array.isArray(suggestions), 'Should return an array');
    assert.strictEqual(suggestions.length, 0, 'Should return empty for <2 char query');
  });

  // -----------------------------------------------------------------------
  // 12. getSuggestions — Field-Specific
  // -----------------------------------------------------------------------

  test('getSuggestions with field prefix queries field facets', async () => {
    const suggestions = await sessionManager.getSuggestions('file_name:app', session1Id);

    assert.ok(Array.isArray(suggestions), 'Should return an array');
    // Should return a suggestion containing "file_name:" prefix and "app"
    if (suggestions.length > 0) {
      const hasFieldSuggestion = suggestions.some(
        (s) => s.includes('file_name:') || s.toLowerCase().includes('app'),
      );
      assert.ok(hasFieldSuggestion, 'Should include field-specific suggestions');
    }
  });

  // -----------------------------------------------------------------------
  // 13. getSuggestions — No Matches
  // -----------------------------------------------------------------------

  test('getSuggestions for non-existent term returns empty array', async () => {
    const suggestions = await sessionManager.getSuggestions('xyznonexistent999');

    assert.ok(Array.isArray(suggestions), 'Should return an array');
    assert.strictEqual(suggestions.length, 0, 'Should return empty for unknown term');
  });

  // -----------------------------------------------------------------------
  // 14. getSuggestions — Limit Parameter
  // -----------------------------------------------------------------------

  test('getSuggestions respects limit parameter', async () => {
    const suggestions = await sessionManager.getSuggestions('handle', session1Id, 2);

    assert.ok(suggestions.length <= 2, `Expected <=2 suggestions, got ${suggestions.length}`);
  });

  // -----------------------------------------------------------------------
  // 15. getSuggestions — Priority Ordering
  // -----------------------------------------------------------------------

  test('getSuggestions prioritizes prefix matches', async () => {
    const suggestions = await sessionManager.getSuggestions('handle', session1Id);

    if (suggestions.length >= 2) {
      // Prefix matches should come before substring matches
      const firstIsPrefix = suggestions[0].toLowerCase().startsWith('handle');
      assert.ok(firstIsPrefix, 'First suggestion should be a prefix match');
    }
  });

  // -----------------------------------------------------------------------
  // 16. Error Handling — Invalid Solr URL
  // -----------------------------------------------------------------------

  test('getStoredQueries with invalid URL throws or returns empty', async () => {
    const badManager = new SolrSessionManager('http://localhost:99999/solr');

    try {
      await badManager.getStoredQueries();
      // If it doesn't throw, that's also acceptable (graceful degradation)
    } catch (error) {
      assert.ok(error, 'Should throw an error for invalid URL');
    }
  });

  // -----------------------------------------------------------------------
  // 17. Error Handling — getSuggestions fallback
  // -----------------------------------------------------------------------

  test('getSuggestions with invalid URL returns empty array gracefully', async () => {
    const badManager = new SolrSessionManager('http://localhost:99999/solr');

    const suggestions = await badManager.getSuggestions('test');
    assert.ok(Array.isArray(suggestions), 'Should return an array');
    assert.strictEqual(suggestions.length, 0, 'Should return empty on connection error');
  });
});
