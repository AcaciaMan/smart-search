/**
 * Solr Indexing Integration Tests
 *
 * Verifies that `IndexManager.storeSearchResults()` correctly converts
 * `SearchResult[]` to `StoredSearchResult[]`, posts them to Solr, and that
 * the stored documents contain the expected fields and values.
 *
 * Requires a live Solr server — all tests are skipped when Solr is unreachable.
 */

import * as assert from 'assert';
import * as path from 'path';
import {
  skipIfSolrUnavailable,
  querySolr,
  deleteByQuery,
  waitForCommit,
  getDocCount,
} from './testHelpers';
import {
  TEST_TIMEOUT,
  TEST_QUERY_PREFIX,
} from './constants';
import { generateTestMarker } from './testDataFactory';
import { IndexManager } from '../../../services/indexManager';
import { SearchResult, SearchOptions } from '../../../types';

suite('Solr Indexing Integration Tests', function () {
  this.timeout(TEST_TIMEOUT);

  let indexManager: IndexManager;
  let testMarker: string;
  /** Track all session IDs created during the suite for cleanup */
  const createdSessionIds: string[] = [];

  // A real file that exists in the workspace — used for file-metadata tests
  const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const realFilePath = path.join(workspaceRoot, 'package.json');

  /** Helper: build a default SearchOptions with the test marker as query */
  function makeOptions(overrides?: Partial<SearchOptions>): SearchOptions {
    return {
      query: testMarker,
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      ...overrides,
    };
  }

  /** Helper: build a minimal SearchResult */
  function makeResult(overrides?: Partial<SearchResult>): SearchResult {
    return {
      file: overrides?.file ?? realFilePath,
      line: overrides?.line ?? 1,
      column: overrides?.column ?? 0,
      content: overrides?.content ?? 'test match text',
      context: overrides?.context ?? ['// before', 'test match text', '// after'],
      score: overrides?.score ?? 1.0,
    };
  }

  /** Helper: query Solr for docs matching the current test marker */
  async function queryTestDocs(extraParams?: Record<string, any>) {
    return querySolr(
      { q: `original_query:"${testMarker}"`, rows: 200, ...extraParams },
      '/select',
    );
  }

  // -----------------------------------------------------------------------
  // Setup / Teardown
  // -----------------------------------------------------------------------

  suiteSetup(async function () {
    await skipIfSolrUnavailable(this);
    indexManager = new IndexManager();
    testMarker = generateTestMarker('indexing');
  });

  suiteTeardown(async function () {
    this.timeout(60000);
    // Clean up all test data seeded during this suite
    await deleteByQuery(`original_query:${TEST_QUERY_PREFIX}*`);
    for (const sid of createdSessionIds) {
      await deleteByQuery(`search_session_id:"${sid}"`);
    }
  });

  // -----------------------------------------------------------------------
  // 1. Index Single Search Result
  // -----------------------------------------------------------------------

  test('Index a single SearchResult and verify it in Solr', async () => {
    const result = makeResult({ content: 'single result test' });
    const sessionId = await indexManager.storeSearchResults(
      [result],
      testMarker,
      makeOptions(),
    );
    createdSessionIds.push(sessionId);
    await waitForCommit();

    const data = await queryTestDocs({ fq: `search_session_id:"${sessionId}"` });
    const docs = data.response.docs;

    assert.strictEqual(docs.length, 1, 'Should store exactly 1 document');

    const doc = docs[0];
    assert.ok(doc.id, 'id should be populated');
    assert.strictEqual(doc.search_session_id, sessionId);
    // Solr may return multi-valued fields as arrays
    const origQuery = Array.isArray(doc.original_query) ? doc.original_query[0] : doc.original_query;
    assert.strictEqual(origQuery, testMarker);
    assert.ok(doc.file_path, 'file_path should be populated');
    assert.ok(doc.file_name, 'file_name should be populated');
    assert.ok(doc.file_extension, 'file_extension should be populated');
    assert.strictEqual(doc.line_number, 1);
    assert.ok(doc.match_text, 'match_text should be populated');
    assert.ok(doc.full_line, 'full_line should be populated');
  });

  // -----------------------------------------------------------------------
  // 2. Index Multiple Results from Same File
  // -----------------------------------------------------------------------

  test('Multiple results from the same file share session and match count', async () => {
    const results: SearchResult[] = [
      makeResult({ line: 10, content: 'match A' }),
      makeResult({ line: 20, content: 'match B' }),
      makeResult({ line: 30, content: 'match C' }),
    ];

    const sessionId = await indexManager.storeSearchResults(
      results,
      testMarker,
      makeOptions(),
    );
    createdSessionIds.push(sessionId);
    await waitForCommit();

    const data = await queryTestDocs({ fq: `search_session_id:"${sessionId}"` });
    const docs = data.response.docs;

    assert.strictEqual(docs.length, 3, 'Should store 3 documents');

    // All should share the same session
    for (const doc of docs) {
      assert.strictEqual(doc.search_session_id, sessionId);
    }

    // All should have match_count_in_file = 3
    for (const doc of docs) {
      assert.strictEqual(
        doc.match_count_in_file,
        3,
        `match_count_in_file should be 3, got ${doc.match_count_in_file}`,
      );
    }

    // IDs must be unique
    const ids = docs.map((d: any) => d.id);
    assert.strictEqual(new Set(ids).size, 3, 'All IDs should be unique');
  });

  // -----------------------------------------------------------------------
  // 3. Index Results from Multiple Files
  // -----------------------------------------------------------------------

  test('Results from multiple files have correct per-file match counts', async () => {
    const fileA = realFilePath; // package.json
    const fileB = path.join(workspaceRoot, 'tsconfig.json');

    const results: SearchResult[] = [
      makeResult({ file: fileA, line: 1, content: 'fileA line1' }),
      makeResult({ file: fileA, line: 5, content: 'fileA line5' }),
      makeResult({ file: fileB, line: 1, content: 'fileB line1' }),
    ];

    const sessionId = await indexManager.storeSearchResults(
      results,
      testMarker,
      makeOptions(),
    );
    createdSessionIds.push(sessionId);
    await waitForCommit();

    const data = await queryTestDocs({ fq: `search_session_id:"${sessionId}"` });
    const docs = data.response.docs;

    assert.strictEqual(docs.length, 3);

    const fileADocs = docs.filter((d: any) => d.file_path === fileA);
    const fileBDocs = docs.filter((d: any) => d.file_path === fileB);

    assert.strictEqual(fileADocs.length, 2);
    assert.strictEqual(fileBDocs.length, 1);

    for (const d of fileADocs) {
      assert.strictEqual(d.match_count_in_file, 2);
    }
    for (const d of fileBDocs) {
      assert.strictEqual(d.match_count_in_file, 1);
    }

    // Verify file_extension extraction
    assert.strictEqual(fileADocs[0].file_extension, 'json');
    assert.strictEqual(fileBDocs[0].file_extension, 'json');
  });

  // -----------------------------------------------------------------------
  // 4. Context and Display Content
  // -----------------------------------------------------------------------

  test('display_content follows the expected format', async () => {
    const result = makeResult({
      content: 'the match line',
      context: ['line before', 'the match line', 'line after'],
    });

    const sessionId = await indexManager.storeSearchResults(
      [result],
      testMarker,
      makeOptions(),
    );
    createdSessionIds.push(sessionId);
    await waitForCommit();

    const data = await queryTestDocs({ fq: `search_session_id:"${sessionId}"` });
    const doc = data.response.docs[0];

    // display_content is built by SolrQueryBuilder.createDisplayContent()
    // Expected: "line before\n>>> the match line <<<\nline after"
    assert.ok(doc.display_content, 'display_content should be populated');
    assert.ok(
      doc.display_content.includes('>>> the match line <<<'),
      `display_content should contain the marked match line, got: "${doc.display_content}"`,
    );

    // context_before / context_after
    assert.deepStrictEqual(doc.context_before, ['line before']);
    assert.deepStrictEqual(doc.context_after, ['line after']);
  });

  // -----------------------------------------------------------------------
  // 5. File Metadata Enrichment
  // -----------------------------------------------------------------------

  test('File metadata is enriched for existing files', async () => {
    const result = makeResult({ file: realFilePath });

    const sessionId = await indexManager.storeSearchResults(
      [result],
      testMarker,
      makeOptions(),
    );
    createdSessionIds.push(sessionId);
    await waitForCommit();

    const data = await queryTestDocs({ fq: `search_session_id:"${sessionId}"` });
    const doc = data.response.docs[0];

    assert.ok(doc.file_size > 0, `file_size should be positive, got ${doc.file_size}`);
    assert.ok(doc.file_modified, 'file_modified should be populated');
    // file_modified should be a valid ISO date
    assert.ok(
      !isNaN(Date.parse(doc.file_modified)),
      `file_modified should be a valid ISO date, got "${doc.file_modified}"`,
    );
    assert.ok(doc.workspace_path !== undefined, 'workspace_path should be populated');
  });

  // -----------------------------------------------------------------------
  // 6. Session ID Format
  // -----------------------------------------------------------------------

  test('Returned session ID matches expected format', async () => {
    const result = makeResult();
    const sessionId = await indexManager.storeSearchResults(
      [result],
      testMarker,
      makeOptions(),
    );
    createdSessionIds.push(sessionId);

    assert.match(
      sessionId,
      /^session_\d+_[a-z0-9]{1,9}$/,
      `Session ID should match session_<timestamp>_<random>, got "${sessionId}"`,
    );
  });

  // -----------------------------------------------------------------------
  // 7. Search Options Propagation
  // -----------------------------------------------------------------------

  test('caseSensitive and wholeWord propagate to stored documents', async () => {
    const result = makeResult({ content: 'options test' });
    const sessionId = await indexManager.storeSearchResults(
      [result],
      testMarker,
      makeOptions({ caseSensitive: true, wholeWord: true }),
    );
    createdSessionIds.push(sessionId);
    await waitForCommit();

    const data = await queryTestDocs({ fq: `search_session_id:"${sessionId}"` });
    const doc = data.response.docs[0];

    assert.strictEqual(doc.case_sensitive, true, 'case_sensitive should be true');
    assert.strictEqual(doc.whole_word, true, 'whole_word should be true');
  });

  // -----------------------------------------------------------------------
  // 8. Duplicate Indexing (Idempotency)
  // -----------------------------------------------------------------------

  test('Storing the same results twice with different sessions keeps both', async () => {
    const result = makeResult({ content: 'duplicate test' });

    const sid1 = await indexManager.storeSearchResults(
      [result],
      testMarker,
      makeOptions(),
    );
    createdSessionIds.push(sid1);

    const sid2 = await indexManager.storeSearchResults(
      [result],
      testMarker,
      makeOptions(),
    );
    createdSessionIds.push(sid2);
    await waitForCommit();

    const count1 = await getDocCount(`search_session_id:"${sid1}"`);
    const count2 = await getDocCount(`search_session_id:"${sid2}"`);

    assert.strictEqual(count1, 1, 'First session should have 1 doc');
    assert.strictEqual(count2, 1, 'Second session should have 1 doc');
    assert.notStrictEqual(sid1, sid2, 'Session IDs should differ');
  });

  // -----------------------------------------------------------------------
  // 9. Large Batch Indexing
  // -----------------------------------------------------------------------

  test('Index 50+ results in a single batch', async () => {
    const count = 55;
    const results: SearchResult[] = [];
    for (let i = 0; i < count; i++) {
      results.push(
        makeResult({
          line: i + 1,
          content: `batch line ${i + 1}`,
          context: [`// before ${i}`, `batch line ${i + 1}`, `// after ${i}`],
        }),
      );
    }

    const sessionId = await indexManager.storeSearchResults(
      results,
      testMarker,
      makeOptions(),
    );
    createdSessionIds.push(sessionId);
    await waitForCommit();

    const storedCount = await getDocCount(`search_session_id:"${sessionId}"`);
    assert.strictEqual(storedCount, count, `Should store all ${count} documents`);
  });

  // -----------------------------------------------------------------------
  // 10. Error Handling — Missing File
  // -----------------------------------------------------------------------

  test('Missing file is handled gracefully (stored without file stats)', async () => {
    const fakeFile = path.join(workspaceRoot, 'does_not_exist_xyz.ts');
    const result = makeResult({ file: fakeFile, content: 'missing file test' });

    // Should not throw — IndexManager catches fs.statSync errors
    const sessionId = await indexManager.storeSearchResults(
      [result],
      testMarker,
      makeOptions(),
    );
    createdSessionIds.push(sessionId);
    await waitForCommit();

    const data = await queryTestDocs({ fq: `search_session_id:"${sessionId}"` });
    const doc = data.response.docs[0];

    assert.ok(doc, 'Document should still be stored');
    assert.ok(doc.file_path.includes('does_not_exist_xyz'), 'file_path should reference the missing file');
    // file_size defaults to 0 when stat fails
    assert.strictEqual(doc.file_size, 0, 'file_size should default to 0 for missing files');
  });
});
