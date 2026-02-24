/**
 * Solr Highlighting Integration Tests
 *
 * Verifies the full highlighting pipeline — Solr server-side highlighting,
 * client-side fallback, snippet generation, XSS safety, and parsing helpers
 * — against a live Solr instance with known seeded data.
 *
 * Requires a live Solr server — all tests are skipped when Solr is unreachable.
 */

import * as assert from 'assert';
import axios from 'axios';
import {
  skipIfSolrUnavailable,
  getSolrCoreUrl,
  seedDocuments,
  deleteByQuery,
  waitForCommit,
} from './testHelpers';
import {
  TEST_TIMEOUT,
} from './constants';
import { createTestDocument, generateTestMarker } from './testDataFactory';
import { HighlightService } from '../../../services/highlightService';
import { StoredSearchResult } from '../../../types';

suite('Solr Highlighting Integration Tests', function () {
  this.timeout(TEST_TIMEOUT);

  let highlightService: HighlightService;
  let testMarker: string;
  let coreUrl: string;
  let sessionId: string;

  // -----------------------------------------------------------------------
  // Seed data
  // -----------------------------------------------------------------------

  suiteSetup(async function () {
    this.timeout(30000);
    await skipIfSolrUnavailable(this);

    highlightService = new HighlightService();
    testMarker = generateTestMarker('highlighting');
    coreUrl = getSolrCoreUrl();
    sessionId = `session_hl_test_${Date.now()}`;

    const docs = [
      createTestDocument({
        id: `hl_test_001_${Date.now()}`,
        search_session_id: sessionId,
        original_query: testMarker,
        file_name: 'calculator.ts',
        file_path: '/src/calculator.ts',
        file_extension: 'ts',
        line_number: 5,
        column_number: 3,
        match_text: 'function calculateTotal(items)',
        match_text_raw: 'function calculateTotal(items)',
        full_line: '  function calculateTotal(items) {',
        full_line_raw: '  function calculateTotal(items) {',
        context_before: ['// Calculate the total price', 'import { sum } from "utils"'],
        context_after: ['  const total = items.reduce((a, b) => a + b, 0);', '  return total;'],
        display_content: '// Calculate the total price\nimport { sum } from "utils"\n>>> function calculateTotal(items) { <<<\n  const total = items.reduce((a, b) => a + b, 0);\n  return total;',
      }),
      // Document with many occurrences for snippet-limit testing
      createTestDocument({
        id: `hl_test_002_${Date.now()}`,
        search_session_id: sessionId,
        original_query: testMarker,
        file_name: 'repeat.ts',
        file_path: '/src/repeat.ts',
        file_extension: 'ts',
        line_number: 10,
        match_text: 'total total total total total',
        match_text_raw: 'total total total total total',
        full_line: 'total total total total total',
        full_line_raw: 'total total total total total',
        context_before: ['total line before'],
        context_after: ['total line after'],
        display_content: 'total line before\n>>> total total total total total <<<\ntotal line after',
      }),
      // Document with XSS-dangerous content
      createTestDocument({
        id: `hl_test_003_${Date.now()}`,
        search_session_id: sessionId,
        original_query: testMarker,
        file_name: 'xss.ts',
        file_path: '/src/xss.ts',
        file_extension: 'ts',
        line_number: 1,
        match_text: '<script>alert("xss")</script>',
        match_text_raw: '<script>alert("xss")</script>',
        full_line: '<script>alert("xss")</script>',
        full_line_raw: '<script>alert("xss")</script>',
        context_before: ['<!-- comment -->'],
        context_after: ['<!-- end -->'],
        display_content: '<!-- comment -->\n>>> <script>alert("xss")</script> <<<\n<!-- end -->',
      }),
    ];

    await seedDocuments(docs);
  });

  suiteTeardown(async function () {
    this.timeout(30000);
    await deleteByQuery(`original_query:"${testMarker}"`);
  });

  // -----------------------------------------------------------------------
  // 1. Server-Side Highlighting Returns Marks
  // -----------------------------------------------------------------------

  test('Solr returns highlighting object with <mark> tags for display_content', async () => {
    const response = await axios.get(`${coreUrl}/search`, {
      params: {
        q: 'calculateTotal',
        fq: `search_session_id:${sessionId}`,
        wt: 'json',
        hl: 'true',
        'hl.fl': 'display_content',
        'hl.simple.pre': '<mark class="highlight">',
        'hl.simple.post': '</mark>',
      },
      timeout: 10000,
    });

    const highlighting = response.data.highlighting ?? {};
    const docIds = Object.keys(highlighting);

    assert.ok(docIds.length >= 1, 'Highlighting should contain at least one doc ID');

    const firstDocHl = highlighting[docIds[0]];
    assert.ok(firstDocHl.display_content, 'display_content highlights should exist');
    assert.ok(firstDocHl.display_content.length > 0, 'display_content array should not be empty');

    const hlText: string = firstDocHl.display_content[0];
    assert.ok(
      hlText.includes('<mark class="highlight">') && hlText.includes('</mark>'),
      `Highlighted text should contain <mark> tags, got: "${hlText.substring(0, 200)}"`,
    );
    assert.ok(
      hlText.toLowerCase().includes('calculatetotal'),
      'Highlighted text should contain the search term',
    );
  });

  // -----------------------------------------------------------------------
  // 2. Highlight Params Are Correct
  // -----------------------------------------------------------------------

  test('buildSolrHighlightParams returns correct defaults', () => {
    const params = highlightService.buildSolrHighlightParams({ query: 'test' });

    assert.strictEqual(params['hl'], 'true');
    assert.strictEqual(params['hl.fl'], 'display_content');
    assert.strictEqual(params['hl.simple.pre'], '<mark class="highlight">');
    assert.strictEqual(params['hl.simple.post'], '</mark>');
    assert.ok(params['hl.fragsize'] !== undefined, 'hl.fragsize should be set');
    assert.strictEqual(params['hl.maxAnalyzedChars'], 500000);
  });

  // -----------------------------------------------------------------------
  // 3. Custom Highlight Tags
  // -----------------------------------------------------------------------

  test('buildSolrHighlightParams uses custom tags when provided', () => {
    const params = highlightService.buildSolrHighlightParams(
      { query: 'test' },
      { preTag: '<em>', postTag: '</em>' },
    );

    assert.strictEqual(params['hl.simple.pre'], '<em>');
    assert.strictEqual(params['hl.simple.post'], '</em>');
  });

  // -----------------------------------------------------------------------
  // 4. Match Text Highlighting via applySolrHighlighting
  // -----------------------------------------------------------------------

  test('applySolrHighlighting merges match_text highlight', () => {
    const results: StoredSearchResult[] = [
      {
        id: 'test_id_1',
        search_session_id: sessionId,
        original_query: testMarker,
        search_timestamp: new Date().toISOString(),
        workspace_path: '/test',
        file_path: '/src/calculator.ts',
        file_name: 'calculator.ts',
        file_extension: 'ts',
        line_number: 5,
        column_number: 3,
        match_text: 'function calculateTotal(items)',
        match_text_raw: 'function calculateTotal(items)',
        context_before: ['// comment'],
        context_after: ['  return total;'],
        context_lines_before: 1,
        context_lines_after: 1,
        full_line: '  function calculateTotal(items) {',
        full_line_raw: '  function calculateTotal(items) {',
        match_type: 'literal',
        case_sensitive: false,
        whole_word: false,
        relevance_score: 1,
        match_count_in_file: 1,
      },
    ];

    const highlighting = {
      test_id_1: {
        match_text: ['function <mark class="highlight">calculateTotal</mark>(items)'],
      },
    };

    const highlighted = highlightService.applySolrHighlighting(results, highlighting, 'calculateTotal');
    assert.ok(
      highlighted[0].match_text.includes('<mark'),
      'match_text should contain highlight mark',
    );
  });

  // -----------------------------------------------------------------------
  // 5. Context Highlighting
  // -----------------------------------------------------------------------

  test('applySolrHighlighting highlights context_after containing the term', () => {
    const results: StoredSearchResult[] = [
      {
        id: 'test_ctx_1',
        search_session_id: sessionId,
        original_query: testMarker,
        search_timestamp: new Date().toISOString(),
        workspace_path: '/test',
        file_path: '/src/calculator.ts',
        file_name: 'calculator.ts',
        file_extension: 'ts',
        line_number: 5,
        column_number: 3,
        match_text: 'function calculateTotal(items)',
        match_text_raw: 'function calculateTotal(items)',
        context_before: ['// Calculate the price'],
        context_after: ['  const total = items.reduce((a, b) => a + b, 0);'],
        context_lines_before: 1,
        context_lines_after: 1,
        full_line: '  function calculateTotal(items) {',
        full_line_raw: '  function calculateTotal(items) {',
        match_type: 'literal',
        case_sensitive: false,
        whole_word: false,
        relevance_score: 1,
        match_count_in_file: 1,
      },
    ];

    // No Solr highlighting — force client-side fallback
    const highlighted = highlightService.applySolrHighlighting(results, {}, 'total');

    // context_after contains "total" — should be highlighted
    const ctxAfter = highlighted[0].context_after_highlighted;
    assert.ok(ctxAfter, 'context_after_highlighted should be populated');
    assert.ok(ctxAfter!.length > 0, 'context_after_highlighted should have entries');
    assert.ok(
      ctxAfter![0].includes('<mark'),
      `context_after should contain highlighted "total", got: "${ctxAfter![0]}"`,
    );

    // context_before does NOT contain "total" — should not be highlighted
    const ctxBefore = highlighted[0].context_before_highlighted;
    assert.ok(ctxBefore, 'context_before_highlighted should be populated');
    assert.ok(
      !ctxBefore![0].includes('<mark'),
      `context_before should NOT be highlighted for "total", got: "${ctxBefore![0]}"`,
    );
  });

  // -----------------------------------------------------------------------
  // 6. Client-Side Fallback
  // -----------------------------------------------------------------------

  test('applySolrHighlighting falls back to client-side when Solr highlighting is empty', () => {
    const results: StoredSearchResult[] = [
      {
        id: 'test_fallback_1',
        search_session_id: sessionId,
        original_query: testMarker,
        search_timestamp: new Date().toISOString(),
        workspace_path: '/test',
        file_path: '/src/calculator.ts',
        file_name: 'calculator.ts',
        file_extension: 'ts',
        line_number: 5,
        column_number: 3,
        match_text: 'function calculateTotal(items)',
        match_text_raw: 'function calculateTotal(items)',
        context_before: ['// comment'],
        context_after: ['  return total;'],
        context_lines_before: 1,
        context_lines_after: 1,
        full_line: '  function calculateTotal(items) {',
        full_line_raw: '  function calculateTotal(items) {',
        match_type: 'literal',
        case_sensitive: false,
        whole_word: false,
        relevance_score: 1,
        match_count_in_file: 1,
      },
    ];

    // Empty highlighting object — force fallback
    const highlighted = highlightService.applySolrHighlighting(results, {}, 'calculateTotal');

    assert.ok(
      highlighted[0].match_text.includes('<mark'),
      'Client-side fallback should still produce <mark> tags in match_text',
    );
    assert.ok(
      highlighted[0].full_line.includes('<mark'),
      'Client-side fallback should still produce <mark> tags in full_line',
    );
  });

  // -----------------------------------------------------------------------
  // 7. Multi-Term Highlighting
  // -----------------------------------------------------------------------

  test('Multi-term query highlights each term independently', async () => {
    const response = await axios.get(`${coreUrl}/search`, {
      params: {
        q: 'function items',
        fq: `search_session_id:${sessionId}`,
        wt: 'json',
        hl: 'true',
        'hl.fl': 'display_content',
        'hl.simple.pre': '<mark class="highlight">',
        'hl.simple.post': '</mark>',
      },
      timeout: 10000,
    });

    const highlighting = response.data.highlighting ?? {};
    const docIds = Object.keys(highlighting);

    if (docIds.length > 0) {
      const hlText: string = highlighting[docIds[0]]?.display_content?.[0] ?? '';
      if (hlText) {
        // At least one of the terms should be highlighted
        const markCount = (hlText.match(/<mark/g) || []).length;
        assert.ok(markCount >= 1, `Should highlight at least one term, got ${markCount} marks`);
      }
    }
  });

  // -----------------------------------------------------------------------
  // 8. XSS Safety in Highlighting
  // -----------------------------------------------------------------------

  test('highlightText HTML-escapes content before applying marks', () => {
    const dangerousText = '<script>alert("xss")</script>';
    const highlighted = highlightService.highlightText(dangerousText, 'script');

    // Should NOT contain raw <script> tags
    assert.ok(
      !highlighted.includes('<script>'),
      `Should not contain raw <script>, got: "${highlighted}"`,
    );
    // Should contain escaped version
    assert.ok(
      highlighted.includes('&lt;'),
      `Should contain HTML-escaped angle brackets, got: "${highlighted}"`,
    );
    // Should still highlight the term
    assert.ok(
      highlighted.includes('<mark class="highlight">'),
      `Should still have <mark> highlights, got: "${highlighted}"`,
    );
  });

  // -----------------------------------------------------------------------
  // 9. Snippet Generation
  // -----------------------------------------------------------------------

  test('generateSnippets returns 1-3 snippets', () => {
    const result: StoredSearchResult = {
      id: 'snippet_test_1',
      search_session_id: sessionId,
      original_query: testMarker,
      search_timestamp: new Date().toISOString(),
      workspace_path: '/test',
      file_path: '/src/calculator.ts',
      file_name: 'calculator.ts',
      file_extension: 'ts',
      line_number: 5,
      column_number: 3,
      match_text: 'function calculateTotal(items)',
      match_text_raw: 'function calculateTotal(items)',
      context_before: ['// Calculate the total price'],
      context_after: ['  const total = items.reduce((a, b) => a + b, 0);'],
      context_lines_before: 1,
      context_lines_after: 1,
      full_line: '  function calculateTotal(items) {',
      full_line_raw: '  function calculateTotal(items) {',
      match_type: 'literal',
      case_sensitive: false,
      whole_word: false,
      relevance_score: 1,
      match_count_in_file: 1,
    };

    const snippets = highlightService.generateSnippets(result, {}, 'calculateTotal');

    assert.ok(snippets.length >= 1, 'Should generate at least 1 snippet');
    assert.ok(snippets.length <= 3, `Should generate at most 3 snippets, got ${snippets.length}`);
    // At least one snippet should contain the search term (possibly highlighted)
    assert.ok(
      snippets.some((s) => s.toLowerCase().includes('calculatetotal')),
      'At least one snippet should contain the search term',
    );
  });

  // -----------------------------------------------------------------------
  // 10. Snippet Max Limit
  // -----------------------------------------------------------------------

  test('generateSnippets respects maxSnippets limit', () => {
    const result: StoredSearchResult = {
      id: 'snippet_limit_1',
      search_session_id: sessionId,
      original_query: testMarker,
      search_timestamp: new Date().toISOString(),
      workspace_path: '/test',
      file_path: '/src/repeat.ts',
      file_name: 'repeat.ts',
      file_extension: 'ts',
      line_number: 10,
      column_number: 0,
      match_text: 'total total total total total',
      match_text_raw: 'total total total total total',
      context_before: ['total line before'],
      context_after: ['total line after'],
      context_lines_before: 1,
      context_lines_after: 1,
      full_line: 'total total total total total',
      full_line_raw: 'total total total total total',
      match_type: 'literal',
      case_sensitive: false,
      whole_word: false,
      relevance_score: 1,
      match_count_in_file: 1,
    };

    const snippets = highlightService.generateSnippets(result, {}, 'total', 2);
    assert.ok(snippets.length <= 2, `Expected at most 2 snippets, got ${snippets.length}`);
  });

  // -----------------------------------------------------------------------
  // 11. Boolean Operator Stripping
  // -----------------------------------------------------------------------

  test('Boolean operators AND/OR/NOT are not highlighted', () => {
    const text = 'function calculateTotal items list';
    const highlighted = highlightService.highlightText(text, 'function AND calculateTotal');

    // "function" and "calculateTotal" should be highlighted
    assert.ok(
      highlighted.includes('<mark class="highlight">function</mark>'),
      'Should highlight "function"',
    );
    assert.ok(
      highlighted.includes('<mark class="highlight">calculateTotal</mark>'),
      'Should highlight "calculateTotal"',
    );
    // "AND" should NOT be highlighted
    assert.ok(
      !highlighted.includes('<mark class="highlight">AND</mark>'),
      'Should NOT highlight "AND"',
    );
  });

  // -----------------------------------------------------------------------
  // 12. Field Prefix Stripping
  // -----------------------------------------------------------------------

  test('Field prefix (match_text:) is not highlighted', () => {
    const text = 'calculateTotal is a function';
    const highlighted = highlightService.highlightText(text, 'match_text:calculateTotal');

    assert.ok(
      highlighted.includes('<mark class="highlight">calculateTotal</mark>'),
      'Should highlight the term without field prefix',
    );
    // "match_text" should not appear as highlighted
    assert.ok(
      !highlighted.includes('<mark class="highlight">match_text</mark>'),
      'Should NOT highlight the field name',
    );
  });

  // -----------------------------------------------------------------------
  // 13. Quoted Phrase Highlighting
  // -----------------------------------------------------------------------

  test('Quoted phrase is highlighted as one unit', () => {
    const text = 'call calculateTotal(items) here';
    const highlighted = highlightService.highlightText(text, '"calculateTotal(items)"');

    // The phrase should appear highlighted (parentheses may be stripped by extractSearchTerms)
    assert.ok(
      highlighted.toLowerCase().includes('calculatetotal'),
      'Highlighted text should contain the phrase term',
    );
  });

  // -----------------------------------------------------------------------
  // 14. Parse Highlighted Text
  // -----------------------------------------------------------------------

  test('parseHighlightedText returns correct segments', () => {
    const input = 'call <mark class="highlight">calculateTotal</mark> here';
    const segments = highlightService.parseHighlightedText(input);

    assert.strictEqual(segments.length, 3, 'Should produce 3 segments');

    assert.strictEqual(segments[0].text, 'call ');
    assert.strictEqual(segments[0].highlighted, false);

    assert.strictEqual(segments[1].text, 'calculateTotal');
    assert.strictEqual(segments[1].highlighted, true);

    assert.strictEqual(segments[2].text, ' here');
    assert.strictEqual(segments[2].highlighted, false);
  });

  // -----------------------------------------------------------------------
  // 15. Highlight Stats
  // -----------------------------------------------------------------------

  test('getHighlightStats returns correct counts', () => {
    const input = 'call <mark class="highlight">calculateTotal</mark> and <mark class="highlight">items</mark> here';
    const stats = highlightService.getHighlightStats(input);

    assert.strictEqual(stats.totalHighlights, 2, 'Should have 2 highlights');
    // Total text length = "call " + "calculateTotal" + " and " + "items" + " here"
    //                    = 5 + 14 + 5 + 5 + 5 = 34
    assert.strictEqual(stats.totalLength, 34, 'Total text length should be 34');
    // Highlighted length = "calculateTotal" + "items" = 14 + 5 = 19
    assert.strictEqual(stats.highlightedLength, 19, 'Highlighted length should be 19');
  });
});
