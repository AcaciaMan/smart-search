/**
 * Shared test helpers for Solr integration tests.
 *
 * Provides connectivity checks, seeding / cleanup utilities, and query helpers
 * so that individual test suites stay concise.
 */

import * as vscode from 'vscode';
import axios from 'axios';
import { COMMIT_WAIT_MS } from './constants';

// ---------------------------------------------------------------------------
// Solr URL helpers
// ---------------------------------------------------------------------------

/**
 * Get the Solr base URL from VS Code settings or the `SOLR_URL` env var.
 * Falls back to `http://localhost:8983/solr`.
 */
export function getSolrUrl(): string {
  const envUrl = process.env['SOLR_URL'];
  if (envUrl) {
    return envUrl;
  }
  return vscode.workspace
    .getConfiguration('smart-search')
    .get<string>('solrUrl', 'http://localhost:8983/solr');
}

/**
 * Full URL for the `smart-search-results` core.
 */
export function getSolrCoreUrl(): string {
  return `${getSolrUrl()}/smart-search-results`;
}

// ---------------------------------------------------------------------------
// Availability & skip helpers
// ---------------------------------------------------------------------------

/**
 * Check whether Solr is reachable by pinging the core.
 * Returns `true` if the ping succeeds, `false` otherwise.
 */
export async function isSolrAvailable(): Promise<boolean> {
  try {
    const response = await axios.get(`${getSolrCoreUrl()}/admin/ping`, {
      timeout: 5000,
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Skip the entire Mocha suite when Solr is not available.
 *
 * Usage inside `suiteSetup`:
 * ```ts
 * suiteSetup(async function () {
 *   await skipIfSolrUnavailable(this);
 * });
 * ```
 */
export async function skipIfSolrUnavailable(context: Mocha.Context): Promise<void> {
  if (!(await isSolrAvailable())) {
    console.log('Solr is not available – skipping integration tests');
    context.skip();
  }
}

// ---------------------------------------------------------------------------
// Seeding & cleanup
// ---------------------------------------------------------------------------

/**
 * Seed test documents into Solr.
 *
 * Posts to `/update/json/docs?commit=true` and waits for the soft-commit
 * window so subsequent queries see the data.
 */
export async function seedDocuments(docs: any[]): Promise<void> {
  const coreUrl = getSolrCoreUrl();

  // Solr /update/json/docs accepts an array of objects
  await axios.post(`${coreUrl}/update/json/docs?commit=true`, docs, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  await waitForCommit();
}

/**
 * Delete documents matching an arbitrary Solr query.
 *
 * Example: `deleteByQuery('original_query:__integration_test__*')`
 */
export async function deleteByQuery(query: string): Promise<void> {
  const coreUrl = getSolrCoreUrl();

  try {
    await axios.post(
      `${coreUrl}/update?commit=true`,
      { delete: { query } },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      },
    );
    await waitForCommit();
  } catch {
    // Gracefully ignore – there may be nothing to delete
  }
}

/**
 * Delete all documents belonging to a specific test session.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await deleteByQuery(`search_session_id:"${sessionId}"`);
}

// ---------------------------------------------------------------------------
// Commit / wait helpers
// ---------------------------------------------------------------------------

/**
 * Wait for Solr to finish a soft-commit cycle.
 *
 * @param ms Milliseconds to wait (default {@link COMMIT_WAIT_MS}).
 */
export async function waitForCommit(ms: number = COMMIT_WAIT_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Execute a Solr query and return the parsed JSON response.
 *
 * @param params  Key/value query parameters (e.g. `{ q: '*:*', rows: 10 }`).
 * @param handler Request handler path (default `/search`).
 */
export async function querySolr(
  params: Record<string, any>,
  handler: string = '/search',
): Promise<any> {
  const coreUrl = getSolrCoreUrl();
  const response = await axios.get(`${coreUrl}${handler}`, {
    params: { wt: 'json', ...params },
    timeout: 10000,
  });
  return response.data;
}

/**
 * Return the number of documents matching a query.
 */
export async function getDocCount(query: string): Promise<number> {
  const data = await querySolr({ q: query, rows: 0 }, '/select');
  return data?.response?.numFound ?? 0;
}
