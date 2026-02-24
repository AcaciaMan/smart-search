/**
 * Test data factory for Solr integration tests.
 *
 * Generates valid {@link StoredSearchResult}-shaped documents (plain objects)
 * that satisfy the Solr schema, as well as {@link SearchResult} objects for
 * use with `IndexManager.storeSearchResults()`.
 */

import { SearchResult, StoredSearchResult } from '../../../types';
import { TEST_QUERY_PREFIX, TEST_SESSION_PREFIX } from './constants';

// ---------------------------------------------------------------------------
// Unique ID helpers
// ---------------------------------------------------------------------------

let _counter = 0;

/**
 * Generate a unique test session ID.
 *
 * @param prefix Optional prefix (defaults to {@link TEST_SESSION_PREFIX}).
 */
export function generateTestSessionId(prefix: string = TEST_SESSION_PREFIX): string {
  return `${prefix}${Date.now()}_${(++_counter).toString().padStart(4, '0')}`;
}

/**
 * Generate a unique test marker string for `original_query` so that seeded
 * documents can be cleaned up reliably.
 */
export function generateTestMarker(testName: string): string {
  return `${TEST_QUERY_PREFIX}${testName}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Document factories
// ---------------------------------------------------------------------------

/**
 * Create a minimal, valid Solr document (plain object matching the
 * {@link StoredSearchResult} schema) with sensible defaults.
 *
 * Any field can be overridden via `overrides`.
 */
export function createTestDocument(overrides?: Partial<StoredSearchResult>): any {
  const sessionId = overrides?.search_session_id ?? generateTestSessionId();
  const fileName = overrides?.file_name ?? 'testFile.ts';
  const lineNumber = overrides?.line_number ?? 1;
  const index = ++_counter;
  const id = overrides?.id ?? `${sessionId}_${fileName}_line${lineNumber}_${index}`;

  const doc: Record<string, any> = {
    id,
    search_session_id: sessionId,
    original_query: overrides?.original_query ?? `${TEST_QUERY_PREFIX}default`,
    search_timestamp: overrides?.search_timestamp ?? new Date().toISOString(),
    workspace_path: overrides?.workspace_path ?? '/workspace/test-project',
    file_path: overrides?.file_path ?? `/workspace/test-project/src/${fileName}`,
    file_name: fileName,
    file_extension: overrides?.file_extension ?? 'ts',
    line_number: lineNumber,
    column_number: overrides?.column_number ?? 0,
    match_text: overrides?.match_text ?? 'test match text',
    match_text_raw: overrides?.match_text_raw ?? overrides?.match_text ?? 'test match text',
    full_line: overrides?.full_line ?? 'const test = "test match text";',
    full_line_raw: overrides?.full_line_raw ?? overrides?.full_line ?? 'const test = "test match text";',
    context_before: overrides?.context_before ?? ['// context before'],
    context_after: overrides?.context_after ?? ['// context after'],
    context_lines_before: overrides?.context_lines_before ?? 1,
    context_lines_after: overrides?.context_lines_after ?? 1,
    match_type: overrides?.match_type ?? 'literal',
    case_sensitive: overrides?.case_sensitive ?? false,
    whole_word: overrides?.whole_word ?? false,
    relevance_score: overrides?.relevance_score ?? 1.0,
    match_count_in_file: overrides?.match_count_in_file ?? 1,
    display_content: overrides?.display_content ?? 'const test = "test match text";',
    // Catch-all copy fields populated by Solr – supply placeholder values so
    // the document is valid even when copy-field directives are absent.
    content_all: 'test match text const test = "test match text";',
    code_all: 'const test = "test match text";',
  };

  // Merge any extra overrides that are not part of the default set
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) {
        doc[key] = value;
      }
    }
  }

  return doc;
}

/**
 * Create a minimal {@link SearchResult} suitable for passing to
 * `IndexManager.storeSearchResults()`.
 */
export function createSearchResult(overrides?: Partial<SearchResult>): SearchResult {
  return {
    file: overrides?.file ?? '/workspace/test-project/src/testFile.ts',
    line: overrides?.line ?? 1,
    column: overrides?.column ?? 0,
    content: overrides?.content ?? 'test match text',
    context: overrides?.context ?? ['// context before', 'test match text', '// context after'],
    score: overrides?.score ?? 1.0,
    ...(overrides?.highlighted_display !== undefined && {
      highlighted_display: overrides.highlighted_display,
    }),
    ...(overrides?.submatches !== undefined && {
      submatches: overrides.submatches,
    }),
  };
}

// ---------------------------------------------------------------------------
// Batch / session factories
// ---------------------------------------------------------------------------

/**
 * Create a batch of test documents that share a session and query.
 */
export function createTestSession(options: {
  sessionId: string;
  query: string;
  count: number;
  filePrefix?: string;
  extension?: string;
  ageInDays?: number;
}): any[] {
  const {
    sessionId,
    query,
    count,
    filePrefix = 'file',
    extension = 'ts',
    ageInDays = 0,
  } = options;

  const timestamp = new Date();
  if (ageInDays > 0) {
    timestamp.setDate(timestamp.getDate() - ageInDays);
  }

  const docs: any[] = [];

  for (let i = 0; i < count; i++) {
    docs.push(
      createTestDocument({
        search_session_id: sessionId,
        original_query: query,
        search_timestamp: timestamp.toISOString(),
        file_name: `${filePrefix}${i + 1}.${extension}`,
        file_path: `/workspace/test-project/src/${filePrefix}${i + 1}.${extension}`,
        file_extension: extension,
        line_number: (i + 1) * 10,
        match_text: `match in ${filePrefix}${i + 1}`,
        full_line: `const ${filePrefix}${i + 1} = "match in ${filePrefix}${i + 1}";`,
        display_content: `const ${filePrefix}${i + 1} = "match in ${filePrefix}${i + 1}";`,
      }),
    );
  }

  return docs;
}

/**
 * Create a diverse set of test data spanning multiple languages and sessions.
 *
 * Useful for tests that need rich, varied data (statistics, filters, etc.).
 */
export function createDiverseTestData(testMarker: string): {
  allDocs: any[];
  jsDocs: any[];
  tsDocs: any[];
  pyDocs: any[];
  jsonDocs: any[];
  sessions: { id: string; query: string; docs: any[] }[];
} {
  const session1Id = generateTestSessionId();
  const session2Id = generateTestSessionId();
  const session3Id = generateTestSessionId();

  const jsDocs = createTestSession({
    sessionId: session1Id,
    query: `${testMarker}_js_search`,
    count: 5,
    filePrefix: 'component',
    extension: 'js',
  });

  const tsDocs = createTestSession({
    sessionId: session1Id,
    query: `${testMarker}_ts_search`,
    count: 4,
    filePrefix: 'service',
    extension: 'ts',
  });

  const pyDocs = createTestSession({
    sessionId: session2Id,
    query: `${testMarker}_py_search`,
    count: 3,
    filePrefix: 'utils',
    extension: 'py',
  });

  const jsonDocs = createTestSession({
    sessionId: session3Id,
    query: `${testMarker}_json_search`,
    count: 2,
    filePrefix: 'config',
    extension: 'json',
  });

  const allDocs = [...jsDocs, ...tsDocs, ...pyDocs, ...jsonDocs];

  const sessions = [
    { id: session1Id, query: `${testMarker}_js_search`, docs: [...jsDocs, ...tsDocs] },
    { id: session2Id, query: `${testMarker}_py_search`, docs: pyDocs },
    { id: session3Id, query: `${testMarker}_json_search`, docs: jsonDocs },
  ];

  return { allDocs, jsDocs, tsDocs, pyDocs, jsonDocs, sessions };
}
