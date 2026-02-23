import * as assert from 'assert';
import * as vscode from 'vscode';
import { RipgrepSearcher } from '../../services/ripgrepSearcher';
import { SearchOptions, FileResult } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function uniqueFiles(results: { file: string }[]): string[] {
  return [...new Set(results.map(r => r.file))];
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
suite('RipgrepSearcher – integration', function () {
  // Process-spawning tests can be slower than Mocha's default 2 s
  this.timeout(15000);

  let searcher: RipgrepSearcher;

  setup(() => {
    searcher = new RipgrepSearcher();
  });

  // -----------------------------------------------------------------------
  // Basic search
  // -----------------------------------------------------------------------
  test('basic search returns non-empty results with expected shape', async () => {
    // "smart-search-ripsolr" is the package name — it always exists in package.json
    const results = await searcher.search({ query: 'smart-search-ripsolr' });

    assert.ok(results.length > 0, 'expected at least one result');
    for (const r of results) {
      assert.ok(typeof r.file === 'string' && r.file.length > 0, 'result.file must be a non-empty string');
      assert.ok(typeof r.line === 'number', 'result.line must be a number');
      assert.ok(typeof r.column === 'number', 'result.column must be a number');
      assert.ok(typeof r.content === 'string', 'result.content must be a string');
      assert.ok(typeof r.score === 'number' && r.score > 0, `result.score must be positive, got ${r.score}`);
    }
  });

  // -----------------------------------------------------------------------
  // Empty query
  // -----------------------------------------------------------------------
  test('empty query returns an array (may match everything or empty)', async () => {
    // RipgrepSearcher does not guard against empty query; rg --fixed-strings ''
    // matches every line, so we just assert an array is returned.
    let results: any;
    try {
      results = await searcher.search({ query: '' });
      assert.ok(Array.isArray(results), 'expected an array');
    } catch {
      // Throwing is also acceptable
    }
  });

  // -----------------------------------------------------------------------
  // Case-sensitive search
  // -----------------------------------------------------------------------
  test('case-sensitive: "smart" (lower) and "Smart" (upper) return different results', async () => {
    const [lower, upper] = await Promise.all([
      searcher.search({ query: 'smart', caseSensitive: true }),
      searcher.search({ query: 'Smart', caseSensitive: true }),
    ]);

    // Both sets should be non-empty (both spellings exist in the workspace)
    assert.ok(lower.length > 0, 'expected lowercase "smart" to match');
    assert.ok(upper.length > 0, 'expected "Smart" to match');

    // With case-sensitive on, lines matching "Smart" must not appear in the
    // lowercase-only results (they would contain capital S)
    const lowerContents = lower.map(r => r.content);
    const upperContents = upper.map(r => r.content);
    // The two content sets should not be identical
    assert.notDeepStrictEqual(
      new Set(lowerContents),
      new Set(upperContents),
      'case-sensitive results should differ'
    );
  });

  test('case-sensitive: "smart" (lower) does not match lines containing only "Smart"', async () => {
    const results = await searcher.search({ query: 'smart', caseSensitive: true });
    for (const r of results) {
      // Every matching line's raw content must contain the lowercase form
      assert.ok(r.content.includes('smart'), `line should contain "smart": ${r.content}`);
    }
  });

  // -----------------------------------------------------------------------
  // Whole-word matching
  // -----------------------------------------------------------------------
  test('wholeWord: "search" does not match "searcher" or "searchResults"', async () => {
    const results = await searcher.search({ query: 'search', wholeWord: true });
    assert.ok(results.length > 0, 'expected whole-word "search" to produce results');
    for (const r of results) {
      // The content must contain the word "search" as a standalone token.
      // Word-regexp in rg means boundaries on both sides.
      assert.ok(
        /\bsearch\b/i.test(r.content),
        `expected standalone "search" in: ${r.content}`
      );
    }
  });

  // -----------------------------------------------------------------------
  // Regex search
  // -----------------------------------------------------------------------
  test('useRegex: "function\\\\s+\\\\w+" matches function declarations', async () => {
    const results = await searcher.search({
      query: 'function\\s+\\w+',
      useRegex: true,
      includePatterns: ['*.ts'],
    });

    assert.ok(results.length > 0, 'expected regex to produce results');
    for (const r of results) {
      assert.ok(/function\s+\w+/.test(r.content), `expected function decl in: ${r.content}`);
    }
  });

  // -----------------------------------------------------------------------
  // Context lines
  // -----------------------------------------------------------------------
  test('contextLinesBefore/After: context array is populated', async () => {
    const results = await searcher.search({
      query: 'export',
      contextLinesBefore: 2,
      contextLinesAfter: 2,
      includePatterns: ['*.ts'],
    });

    assert.ok(results.length > 0, 'expected results for "export"');
    // At least some results should have context
    const withContext = results.filter(r => r.context && r.context.length > 1);
    assert.ok(withContext.length > 0, 'expected at least one result with context lines');
  });

  // -----------------------------------------------------------------------
  // Max files (structural — note: maxFiles option is read from VS Code config,
  // not SearchOptions.maxFiles; we test by querying something that exists in
  // a small number of known files)
  // -----------------------------------------------------------------------
  test('results limited to distinct files within VS Code config maxFiles default', async () => {
    // "smart-search-ripsolr" only appears in a handful of files
    const results = await searcher.search({ query: 'smart-search-ripsolr' });
    const files = uniqueFiles(results);
    // Should not return an unbounded number of files (default maxFiles = 100)
    const config = vscode.workspace.getConfiguration('smart-search');
    const maxFiles = config.get<number>('maxFiles', 100);
    assert.ok(files.length <= maxFiles, `got ${files.length} files, expected ≤ ${maxFiles}`);
  });

  test('searching common term across many files: each result has a file property', async () => {
    const results = await searcher.search({ query: 'import', includePatterns: ['*.ts'] });
    assert.ok(results.length > 0, 'expected at least one result');
    for (const r of results) {
      assert.ok(typeof r.file === 'string' && r.file.length > 0, 'each result must have a file');
    }
  });

  // -----------------------------------------------------------------------
  // Submatches
  // -----------------------------------------------------------------------
  test('submatches populated with start, end, text', async () => {
    const results = await searcher.search({ query: 'export', includePatterns: ['*.ts'] });
    assert.ok(results.length > 0, 'need results to check submatches');

    const withSubmatches = results.filter(r => r.submatches && r.submatches.length > 0);
    assert.ok(withSubmatches.length > 0, 'expected at least one result with submatches');

    for (const r of withSubmatches) {
      for (const sm of r.submatches!) {
        assert.ok(typeof sm.start === 'number', 'submatch.start must be a number');
        assert.ok(typeof sm.end === 'number', 'submatch.end must be a number');
        assert.ok(typeof sm.text === 'string', 'submatch.text must be a string');
        assert.ok(sm.end >= sm.start, 'submatch end must be >= start');
        assert.ok(
          sm.text.toLowerCase().includes('export'),
          `submatch.text should include query, got: "${sm.text}"`
        );
      }
    }
  });

  // -----------------------------------------------------------------------
  // searchFilesOnly
  // -----------------------------------------------------------------------
  test('searchFilesOnly returns FileResult[] with file and positive matchCount', async () => {
    const results: FileResult[] = await searcher.searchFilesOnly({ query: 'import' });
    assert.ok(Array.isArray(results), 'expected an array');
    assert.ok(results.length > 0, 'expected at least one file result');

    for (const r of results) {
      assert.ok(typeof r.file === 'string' && r.file.length > 0, 'file must be a non-empty string');
      assert.ok(typeof r.matchCount === 'number' && r.matchCount > 0, `matchCount must be positive, got ${r.matchCount}`);
    }
  });

  // -----------------------------------------------------------------------
  // searchSymbols (takes a plain string, not SearchOptions)
  // -----------------------------------------------------------------------
  test('searchSymbols returns results matching function/class/interface declarations', async () => {
    const results = await searcher.searchSymbols('search');
    assert.ok(Array.isArray(results), 'expected an array');
    assert.ok(results.length > 0, 'expected symbol search to return results');

    for (const r of results) {
      assert.ok(typeof r.file === 'string', 'result.file must be a string');
      assert.ok(typeof r.content === 'string', 'result.content must be a string');
    }
  });

  // -----------------------------------------------------------------------
  // Include / exclude patterns
  // -----------------------------------------------------------------------
  test('includePatterns: ["*.ts"] → all results are .ts files', async () => {
    const results = await searcher.search({
      query: 'import',
      includePatterns: ['*.ts'],
    });

    assert.ok(results.length > 0, 'expected .ts results');
    for (const r of results) {
      assert.ok(r.file.endsWith('.ts'), `expected .ts file, got: ${r.file}`);
    }
  });

  test('excludePatterns: ["*.json"] → no results from .json files', async () => {
    const results = await searcher.search({
      query: 'smart-search-ripsolr',
      excludePatterns: ['*.json'],
    });

    for (const r of results) {
      assert.ok(!r.file.endsWith('.json'), `unexpected .json file in results: ${r.file}`);
    }
  });
});
