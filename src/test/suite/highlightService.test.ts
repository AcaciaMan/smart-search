import * as assert from 'assert';
import { HighlightService } from '../../services/highlightService';
import { StoredSearchResult, SearchOptions } from '../../types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeResult(overrides: Partial<StoredSearchResult> = {}): StoredSearchResult {
  return {
    id: 'doc-1',
    search_session_id: 'sess-1',
    original_query: 'test',
    search_timestamp: new Date().toISOString(),
    workspace_path: '/workspace',
    file_path: '/workspace/test.ts',
    file_name: 'test.ts',
    file_extension: 'ts',
    line_number: 1,
    column_number: 0,
    match_text: 'const x = 1;',
    match_text_raw: 'const x = 1;',
    context_before: [],
    context_after: [],
    context_lines_before: 0,
    context_lines_after: 0,
    full_line: 'const x = 1;',
    full_line_raw: 'const x = 1;',
    match_type: 'literal',
    case_sensitive: false,
    whole_word: false,
    relevance_score: 1.0,
    match_count_in_file: 1,
    ...overrides
  };
}

const basicOptions: SearchOptions = { query: 'test' };

suite('HighlightService', () => {
  let svc: HighlightService;

  setup(() => {
    svc = new HighlightService();
  });

  // -------------------------------------------------------------------------
  // highlightText
  // -------------------------------------------------------------------------
  suite('highlightText', () => {
    test('basic match wrapped in default mark tag', () => {
      const result = svc.highlightText('hello world', 'hello');
      assert.ok(result.includes('<mark class="highlight">hello</mark>'), `got: ${result}`);
    });

    test('case insensitive match', () => {
      const result = svc.highlightText('Hello World', 'hello');
      assert.ok(result.includes('<mark class="highlight">Hello</mark>'), `got: ${result}`);
    });

    test('multiple terms both highlighted', () => {
      const result = svc.highlightText('foo bar baz', 'foo baz');
      assert.ok(result.includes('<mark class="highlight">foo</mark>'), `foo not highlighted in: ${result}`);
      assert.ok(result.includes('<mark class="highlight">baz</mark>'), `baz not highlighted in: ${result}`);
    });

    test('no match → no mark tags, text is HTML-escaped', () => {
      const result = svc.highlightText('hello', 'xyz');
      assert.ok(!result.includes('<mark'), `unexpected mark in: ${result}`);
      assert.strictEqual(result, 'hello');
    });

    test('empty query → returns original text unchanged', () => {
      assert.strictEqual(svc.highlightText('hello', ''), 'hello');
    });

    test('empty text → returns empty string', () => {
      assert.strictEqual(svc.highlightText('', 'hello'), '');
    });

    test('custom className used in mark tag', () => {
      const result = svc.highlightText('hello', 'hello', 'custom');
      assert.ok(result.includes('<mark class="custom">hello</mark>'), `got: ${result}`);
    });

    test('XSS safety: angle brackets in text are escaped, term still highlighted', () => {
      const result = svc.highlightText('<script>alert("xss")</script>', 'script');
      // Raw < and > must not appear outside mark tags
      assert.ok(!/<script>/i.test(result), `raw <script> tag found in: ${result}`);
      assert.ok(result.includes('&lt;'), `expected &lt; in: ${result}`);
      assert.ok(result.includes('&gt;'), `expected &gt; in: ${result}`);
      // The word 'script' should still be highlighted
      assert.ok(result.includes('<mark class="highlight">'), `expected highlight in: ${result}`);
    });

    test('XSS with angle brackets in search term: text is escaped, inner word highlighted', () => {
      // extractSearchTerms strips non-alphanumeric → '<div>' becomes 'div'
      const result = svc.highlightText('use <div> tag', '<div>');
      assert.ok(!/<div>/i.test(result), `raw <div> found in: ${result}`);
      assert.ok(result.includes('&lt;'), `expected &lt; in: ${result}`);
      // 'div' appears inside the escaped &lt;div&gt; and should be highlighted
      assert.ok(result.includes('<mark class="highlight">div</mark>'), `expected div highlighted in: ${result}`);
    });

    test('boolean operators stripped: AND not highlighted, terms are', () => {
      const result = svc.highlightText('error found', 'error AND found');
      assert.ok(!result.includes('>AND<'), `AND should not be highlighted in: ${result}`);
      assert.ok(result.includes('<mark class="highlight">error</mark>'), `error not highlighted in: ${result}`);
      assert.ok(result.includes('<mark class="highlight">found</mark>'), `found not highlighted in: ${result}`);
    });

    test('field spec stripped: field: prefix removed, value is highlighted', () => {
      const result = svc.highlightText('content here', 'field:content');
      assert.ok(result.includes('<mark class="highlight">content</mark>'), `got: ${result}`);
      assert.ok(!result.includes('field:'), `field: should be stripped, got: ${result}`);
    });

    test('quoted phrase highlighted as one unit', () => {
      const result = svc.highlightText('exact phrase here', '"exact phrase"');
      assert.ok(result.includes('<mark class="highlight">exact phrase</mark>'), `got: ${result}`);
    });
  });

  // -------------------------------------------------------------------------
  // parseHighlightedText
  // -------------------------------------------------------------------------
  suite('parseHighlightedText', () => {
    test('single highlight → 3 segments', () => {
      const segs = svc.parseHighlightedText('before <mark class="hl">match</mark> after');
      assert.strictEqual(segs.length, 3);
      assert.deepStrictEqual(segs[0], { text: 'before ', highlighted: false });
      assert.deepStrictEqual(segs[1], { text: 'match', highlighted: true });
      assert.deepStrictEqual(segs[2], { text: ' after', highlighted: false });
    });

    test('no highlights → 1 unhighlighted segment', () => {
      const segs = svc.parseHighlightedText('plain text');
      assert.strictEqual(segs.length, 1);
      assert.deepStrictEqual(segs[0], { text: 'plain text', highlighted: false });
    });

    test('multiple highlights → 5 segments with correct flags', () => {
      const segs = svc.parseHighlightedText('a <mark>b</mark> c <mark>d</mark> e');
      assert.strictEqual(segs.length, 5);
      assert.strictEqual(segs[0].highlighted, false); // 'a '
      assert.strictEqual(segs[1].highlighted, true);  // 'b'
      assert.strictEqual(segs[2].highlighted, false); // ' c '
      assert.strictEqual(segs[3].highlighted, true);  // 'd'
      assert.strictEqual(segs[4].highlighted, false); // ' e'
      assert.strictEqual(segs[1].text, 'b');
      assert.strictEqual(segs[3].text, 'd');
    });

    test('consecutive highlights → 2 highlighted segments, no gap', () => {
      const segs = svc.parseHighlightedText('<mark>a</mark><mark>b</mark>');
      assert.strictEqual(segs.length, 2);
      assert.deepStrictEqual(segs[0], { text: 'a', highlighted: true });
      assert.deepStrictEqual(segs[1], { text: 'b', highlighted: true });
    });

    test('empty input → empty array', () => {
      assert.deepStrictEqual(svc.parseHighlightedText(''), []);
    });
  });

  // -------------------------------------------------------------------------
  // stripHighlighting
  // -------------------------------------------------------------------------
  suite('stripHighlighting', () => {
    test('removes single mark tag', () => {
      assert.strictEqual(
        svc.stripHighlighting('<mark class="highlight">test</mark>'),
        'test'
      );
    });

    test('removes multiple mark tags', () => {
      assert.strictEqual(
        svc.stripHighlighting('a <mark>b</mark> c <mark>d</mark>'),
        'a b c d'
      );
    });

    test('no mark tags → returns string unchanged', () => {
      assert.strictEqual(svc.stripHighlighting('plain text'), 'plain text');
    });
  });

  // -------------------------------------------------------------------------
  // getHighlightStats
  // -------------------------------------------------------------------------
  suite('getHighlightStats', () => {
    test('single highlight → correct counts', () => {
      const stats = svc.getHighlightStats('<mark class="highlight">test</mark>');
      assert.strictEqual(stats.totalHighlights, 1);
      assert.strictEqual(stats.highlightedLength, 4); // 'test' = 4 chars
      assert.strictEqual(stats.totalLength, 4);
    });

    test('no highlights → totalHighlights is 0', () => {
      const stats = svc.getHighlightStats('plain text');
      assert.strictEqual(stats.totalHighlights, 0);
      assert.strictEqual(stats.highlightedLength, 0);
      assert.strictEqual(stats.totalLength, 10);
    });

    test('multiple highlights → accumulated highlightedLength', () => {
      // 'ab' (2) + ' and ' (5) + 'cde' (3) = totalLength 10
      const stats = svc.getHighlightStats('<mark>ab</mark> and <mark>cde</mark>');
      assert.strictEqual(stats.totalHighlights, 2);
      assert.strictEqual(stats.highlightedLength, 5); // 2 + 3
      assert.strictEqual(stats.totalLength, 10);
    });
  });

  // -------------------------------------------------------------------------
  // buildSolrHighlightParams
  // -------------------------------------------------------------------------
  suite('buildSolrHighlightParams', () => {
    test('returns object with hl: "true"', () => {
      const params = svc.buildSolrHighlightParams(basicOptions);
      assert.strictEqual(params['hl'], 'true');
    });

    test('has hl.fl, hl.simple.pre, hl.simple.post', () => {
      const params = svc.buildSolrHighlightParams(basicOptions);
      assert.ok('hl.fl' in params, 'missing hl.fl');
      assert.ok('hl.simple.pre' in params, 'missing hl.simple.pre');
      assert.ok('hl.simple.post' in params, 'missing hl.simple.post');
    });

    test('hl.fl is the canonical display_content field', () => {
      const params = svc.buildSolrHighlightParams(basicOptions);
      assert.strictEqual(params['hl.fl'], 'display_content');
    });

    test('default pre/post tags are mark tags', () => {
      const params = svc.buildSolrHighlightParams(basicOptions);
      assert.strictEqual(params['hl.simple.pre'], '<mark class="highlight">');
      assert.strictEqual(params['hl.simple.post'], '</mark>');
    });

    test('custom preTag and postTag override defaults', () => {
      const params = svc.buildSolrHighlightParams(basicOptions, {
        preTag: '<b>',
        postTag: '</b>'
      });
      assert.strictEqual(params['hl.simple.pre'], '<b>');
      assert.strictEqual(params['hl.simple.post'], '</b>');
    });

    test('custom fragmentSize overrides default', () => {
      const params = svc.buildSolrHighlightParams(basicOptions, { fragmentSize: 99 });
      assert.strictEqual(params['hl.fragsize'], 99);
    });

    test('has hl.maxAnalyzedChars, hl.highlightMultiTerm, hl.mergeContiguous', () => {
      const params = svc.buildSolrHighlightParams(basicOptions);
      assert.ok('hl.maxAnalyzedChars' in params, 'missing hl.maxAnalyzedChars');
      assert.ok('hl.highlightMultiTerm' in params, 'missing hl.highlightMultiTerm');
      assert.ok('hl.mergeContiguous' in params, 'missing hl.mergeContiguous');
    });
  });

  // -------------------------------------------------------------------------
  // applySolrHighlighting
  // -------------------------------------------------------------------------
  suite('applySolrHighlighting', () => {
    test('with Solr match_text highlight → match_text replaced', () => {
      const result = makeResult({ id: 'doc-1', match_text: 'const x = 1;' });
      const highlighting = {
        'doc-1': { match_text: ['const <mark>x</mark> = 1;'] }
      };
      const [out] = svc.applySolrHighlighting([result], highlighting, 'x');
      assert.strictEqual(out.match_text, 'const <mark>x</mark> = 1;');
    });

    test('with empty highlighting → falls back to client-side highlightText on match_text', () => {
      const result = makeResult({ id: 'doc-1', match_text: 'const x = 1;' });
      const [out] = svc.applySolrHighlighting([result], {}, 'const');
      assert.ok(
        out.match_text.includes('<mark class="highlight">const</mark>'),
        `expected client-side highlight in: ${out.match_text}`
      );
    });

    test('context highlighting → context_before_highlighted populated', () => {
      const result = makeResult({
        id: 'doc-1',
        context_before: ['import fs from "fs";']
      });
      const [out] = svc.applySolrHighlighting([result], {}, 'import');
      assert.ok(Array.isArray(out.context_before_highlighted), 'context_before_highlighted not an array');
      assert.ok(out.context_before_highlighted!.length > 0, 'context_before_highlighted is empty');
    });

    test('context highlighting with Solr data → uses Solr context_before', () => {
      const result = makeResult({
        id: 'doc-1',
        context_before: ['plain before']
      });
      const highlighting = {
        'doc-1': { context_before: ['<mark>solr</mark> before'] }
      };
      const [out] = svc.applySolrHighlighting([result], highlighting, 'solr');
      assert.deepStrictEqual(out.context_before_highlighted, ['<mark>solr</mark> before']);
    });

    test('snippets array is always populated on output', () => {
      const result = makeResult({ id: 'doc-1', match_text: 'hello world' });
      const [out] = svc.applySolrHighlighting([result], {}, 'hello');
      assert.ok(Array.isArray(out.snippets), 'snippets should be an array');
    });
  });

  // -------------------------------------------------------------------------
  // generateSnippets
  // -------------------------------------------------------------------------
  suite('generateSnippets', () => {
    test('with Solr content_all → those snippets returned', () => {
      const result = makeResult();
      const highlighting = { content_all: ['snippet <mark>one</mark>', 'snippet two'] };
      const snippets = svc.generateSnippets(result, highlighting, 'one');
      assert.deepStrictEqual(snippets, ['snippet <mark>one</mark>', 'snippet two']);
    });

    test('with Solr code_all (no content_all) → code_all snippets returned', () => {
      const result = makeResult();
      const highlighting = { code_all: ['code <mark>snippet</mark>'] };
      const snippets = svc.generateSnippets(result, highlighting, 'snippet');
      assert.deepStrictEqual(snippets, ['code <mark>snippet</mark>']);
    });

    test('without Solr highlighting → generates client-side snippet from full_line', () => {
      const result = makeResult({ full_line: 'const getData = () => {}' });
      const snippets = svc.generateSnippets(result, {}, 'getData');
      assert.ok(snippets.length > 0, 'expected at least one snippet');
      assert.ok(
        snippets[0].includes('<mark class="highlight">getData</mark>'),
        `expected highlighted snippet, got: ${snippets[0]}`
      );
    });

    test('respects maxSnippets limit', () => {
      const result = makeResult();
      const highlighting = { content_all: ['a', 'b', 'c', 'd', 'e'] };
      const snippets = svc.generateSnippets(result, highlighting, 'x', 2);
      assert.strictEqual(snippets.length, 2);
    });

    test('includes context lines containing search terms', () => {
      const result = makeResult({
        full_line: 'const x = 1;',
        context_before: [],
        context_after: ['// returns getData value']
      });
      const snippets = svc.generateSnippets(result, {}, 'getData');
      // fallback: full_line doesn't match, context_after line does
      const combined = snippets.join('\n');
      assert.ok(combined.includes('getData'), `expected getData in snippets: ${combined}`);
    });
  });
});
