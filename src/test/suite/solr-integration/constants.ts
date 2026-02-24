/**
 * Constants for Solr integration tests.
 */

/** Default timeout for individual integration tests (ms) */
export const TEST_TIMEOUT = 15000;

/** Timeout for end-to-end integration tests (ms) */
export const E2E_TIMEOUT = 30000;

/** Time to wait for Solr soft-commit (ms) */
export const COMMIT_WAIT_MS = 2500;

/** Prefix used for test query markers to enable cleanup */
export const TEST_QUERY_PREFIX = '__integration_test__';

/** Prefix used for test session IDs */
export const TEST_SESSION_PREFIX = 'session_integration_test_';

/** All required Solr schema fields for validation */
export const REQUIRED_FIELDS = [
  'id',
  'search_session_id',
  'original_query',
  'search_timestamp',
  'file_path',
  'file_name',
  'file_extension',
  'line_number',
  'column_number',
  'match_text',
  'full_line',
  'context_before',
  'context_after',
  'display_content',
  'content_all',
  'code_all',
];

/** Required Solr field types for schema validation */
export const REQUIRED_FIELD_TYPES = ['text_general', 'text_code', 'text_display'];

/** Boost values configured on the /search request handler */
export const SEARCH_HANDLER_BOOSTS: Record<string, number> = {
  match_text: 5,
  full_line: 3,
  context_before: 1.5,
  context_after: 1.5,
  file_name: 2,
  ai_summary: 2,
};
