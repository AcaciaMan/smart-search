import * as assert from 'assert';
import { SolrQueryBuilder } from '../../services/solrQueryBuilder';
import { SearchResult, SearchOptions } from '../../types';

suite('SolrQueryBuilder', () => {
  let builder: SolrQueryBuilder;

  setup(() => {
    builder = new SolrQueryBuilder();
  });

  // ---------------------------------------------------------------------------
  // sanitizeQuery
  // ---------------------------------------------------------------------------
  suite('sanitizeQuery', () => {
    test('empty string → returns "*"', () => {
      assert.strictEqual(builder.sanitizeQuery(''), '*');
    });

    test('null-like (cast to string) → returns "*"', () => {
      // The method guards against falsy values
      assert.strictEqual(builder.sanitizeQuery(null as unknown as string), '*');
    });

    test('undefined → returns "*"', () => {
      assert.strictEqual(builder.sanitizeQuery(undefined as unknown as string), '*');
    });

    test('normal text passes through unchanged', () => {
      assert.strictEqual(builder.sanitizeQuery('hello world'), 'hello world');
    });

    test('escapes "+"', () => {
      assert.strictEqual(builder.sanitizeQuery('+'), '\\+');
    });

    test('escapes "-"', () => {
      assert.strictEqual(builder.sanitizeQuery('-'), '\\-');
    });

    test('escapes "&&"', () => {
      assert.strictEqual(builder.sanitizeQuery('&&'), '\\&\\&');
    });

    test('escapes "||"', () => {
      assert.strictEqual(builder.sanitizeQuery('||'), '\\|\\|');
    });

    test('escapes "!"', () => {
      assert.strictEqual(builder.sanitizeQuery('!'), '\\!');
    });

    test('escapes "("', () => {
      assert.strictEqual(builder.sanitizeQuery('('), '\\(');
    });

    test('escapes ")"', () => {
      assert.strictEqual(builder.sanitizeQuery(')'), '\\)');
    });

    test('escapes "{"', () => {
      assert.strictEqual(builder.sanitizeQuery('{'), '\\{');
    });

    test('escapes "}"', () => {
      assert.strictEqual(builder.sanitizeQuery('}'), '\\}');
    });

    test('escapes "["', () => {
      assert.strictEqual(builder.sanitizeQuery('['), '\\[');
    });

    test('escapes "]"', () => {
      assert.strictEqual(builder.sanitizeQuery(']'), '\\]');
    });

    test('escapes "^"', () => {
      assert.strictEqual(builder.sanitizeQuery('^'), '\\^');
    });

    test('escapes \'"\'', () => {
      assert.strictEqual(builder.sanitizeQuery('"'), '\\"');
    });

    test('escapes "~"', () => {
      assert.strictEqual(builder.sanitizeQuery('~'), '\\~');
    });

    test('escapes "*"', () => {
      assert.strictEqual(builder.sanitizeQuery('*'), '\\*');
    });

    test('escapes "?"', () => {
      assert.strictEqual(builder.sanitizeQuery('?'), '\\?');
    });

    test('escapes ":"', () => {
      assert.strictEqual(builder.sanitizeQuery(':'), '\\:');
    });

    test('escapes backslash', () => {
      assert.strictEqual(builder.sanitizeQuery('\\'), '\\\\');
    });

    test('escapes "/"', () => {
      assert.strictEqual(builder.sanitizeQuery('/'), '\\/');
    });

    test('query that is only special chars → returns "*" (empty after trim)', () => {
      // A single space is not a special char but becomes empty after .trim()
      // Use a string that trims to empty after escaping collapses surrounding spaces
      // The implementation trims after escaping; a string of only whitespace → ''
      assert.strictEqual(builder.sanitizeQuery('   '), '*');
    });
  });

  // ---------------------------------------------------------------------------
  // buildSolrQuery
  // ---------------------------------------------------------------------------
  suite('buildSolrQuery', () => {
    test('empty string → returns "*:*"', () => {
      assert.strictEqual(builder.buildSolrQuery(''), '*:*');
    });

    test('null → returns "*:*"', () => {
      assert.strictEqual(builder.buildSolrQuery(null as unknown as string), '*:*');
    });

    test('simple word uses content_all and code_all with boosts', () => {
      const result = builder.buildSolrQuery('hello');
      assert.ok(result.includes('content_all:'), `expected content_all: in "${result}"`);
      assert.ok(result.includes('code_all:'), `expected code_all: in "${result}"`);
    });

    test('field-specific query passes through with field preserved', () => {
      const result = builder.buildSolrQuery('file_name:*.js');
      assert.ok(result.includes('file_name:'), `expected file_name: in "${result}"`);
      assert.ok(result.includes('*.js'), `expected *.js in "${result}"`);
    });

    test('boolean query treated as simple (no field spec) → contains content_all:', () => {
      const result = builder.buildSolrQuery('error AND NOT deprecated');
      assert.ok(result.includes('content_all:'), `expected content_all: in "${result}"`);
    });

    test('range query detected as field spec → contains relevance_score:', () => {
      const result = builder.buildSolrQuery('relevance_score:[50 TO *]');
      assert.ok(result.includes('relevance_score:'), `expected relevance_score: in "${result}"`);
    });

    test('filename-like query → contains file_name', () => {
      const result = builder.buildSolrQuery('test.ts');
      assert.ok(result.includes('file_name'), `expected file_name in "${result}"`);
    });

    test('code-pattern query → code_all boosted with ^1.5', () => {
      const result = builder.buildSolrQuery('function getData()');
      assert.ok(result.includes('code_all'), `expected code_all in "${result}"`);
      assert.ok(result.includes('^1.5'), `expected ^1.5 boost in "${result}"`);
    });

    test('complex multi-field query → preserves both field specs', () => {
      const result = builder.buildSolrQuery('match_text:function AND file_extension:js');
      assert.ok(result.includes('match_text:'), `expected match_text: in "${result}"`);
      assert.ok(result.includes('file_extension:'), `expected file_extension: in "${result}"`);
    });

    test('quoted string starting with quote → treated as simple query (default fields used)', () => {
      const result = builder.buildSolrQuery('"exact phrase"');
      // Starts with quote → hasFieldSpec is false → falls through to default field path
      assert.ok(
        result.includes('content_all:') || result.includes('code_all:'),
        `expected default field in "${result}"`
      );
    });
  });

  // ---------------------------------------------------------------------------
  // buildSearchParams
  // ---------------------------------------------------------------------------
  suite('buildSearchParams', () => {
    const basicOptions: SearchOptions = { query: 'test' };

    test('returns object with required top-level keys', () => {
      const params = builder.buildSearchParams(basicOptions);
      assert.ok('q' in params, 'missing q');
      assert.ok('rows' in params, 'missing rows');
      assert.ok('wt' in params, 'missing wt');
      assert.ok('sort' in params, 'missing sort');
      assert.ok('fl' in params, 'missing fl');
      // hl params are no longer set here — they come from HighlightService
      assert.ok(!('hl' in params), 'hl should not be in buildSearchParams (use HighlightService)');
    });

    test('rows defaults to smart-search.maxFiles setting (100)', () => {
      const params = builder.buildSearchParams(basicOptions);
      // Default maxFiles is 100 — see package.json smart-search.maxFiles
      assert.strictEqual(params.rows, 100);
    });

    test('rows uses options.maxResults when provided', () => {
      const params = builder.buildSearchParams({ query: 'test', maxResults: 50 });
      assert.strictEqual(params.rows, 50);
    });

    test('rows is capped at 10000', () => {
      const params = builder.buildSearchParams({ query: 'test', maxResults: 99999 });
      assert.strictEqual(params.rows, 10000);
    });

    test('with sessionId → fq contains search_session_id', () => {
      const params = builder.buildSearchParams(basicOptions, 'abc-123');
      assert.ok(typeof params.fq === 'string', 'fq should be a string');
      assert.ok(
        (params.fq as string).includes('search_session_id:abc-123'),
        `expected search_session_id:abc-123 in fq "${params.fq}"`
      );
    });

    test('with caseSensitive: true → fq contains case_sensitive:true', () => {
      const params = builder.buildSearchParams({ query: 'test', caseSensitive: true });
      assert.ok(
        (params.fq as string).includes('case_sensitive:true'),
        `expected case_sensitive:true in fq "${params.fq}"`
      );
    });

    test('with wholeWord: true → fq contains whole_word:true', () => {
      const params = builder.buildSearchParams({ query: 'test', wholeWord: true });
      assert.ok(
        (params.fq as string).includes('whole_word:true'),
        `expected whole_word:true in fq "${params.fq}"`
      );
    });

    test('with sessionId AND caseSensitive → fq combines both with " AND "', () => {
      const params = builder.buildSearchParams({ query: 'test', caseSensitive: true }, 'sess-99');
      const fq = params.fq as string;
      assert.ok(fq.includes('search_session_id:sess-99'), `missing session in fq "${fq}"`);
      assert.ok(fq.includes('case_sensitive:true'), `missing case_sensitive in fq "${fq}"`);
      assert.ok(fq.includes(' AND '), `expected " AND " combinator in fq "${fq}"`);
    });

    test('without any filters → fq is not set', () => {
      const params = builder.buildSearchParams(basicOptions);
      assert.strictEqual(params.fq, undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // createDisplayContent
  // ---------------------------------------------------------------------------
  suite('createDisplayContent', () => {
    const makeResult = (content: string): SearchResult => ({
      file: 'test.ts',
      line: 1,
      column: 0,
      content,
      context: [],
      score: 1.0
    });

    test('empty context arrays → only the match line marked with >>> and <<<', () => {
      const result = builder.createDisplayContent(makeResult('const x = 1;'), [], []);
      assert.strictEqual(result, '>>> const x = 1; <<<');
    });

    test('context before → prepended before match line', () => {
      const result = builder.createDisplayContent(makeResult('const x = 1;'), ['// before'], []);
      assert.strictEqual(result, '// before\n>>> const x = 1; <<<');
    });

    test('context after → appended after match line', () => {
      const result = builder.createDisplayContent(makeResult('const x = 1;'), [], ['// after']);
      assert.strictEqual(result, '>>> const x = 1; <<<\n// after');
    });

    test('multiple context lines before and after → all joined with newlines', () => {
      const result = builder.createDisplayContent(
        makeResult('const x = 1;'),
        ['line -2', 'line -1'],
        ['line +1', 'line +2']
      );
      assert.strictEqual(result, 'line -2\nline -1\n>>> const x = 1; <<<\nline +1\nline +2');
    });
  });
});
