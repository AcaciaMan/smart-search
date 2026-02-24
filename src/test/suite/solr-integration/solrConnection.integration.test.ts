/**
 * Solr Connection & Health Integration Tests
 *
 * Verifies that the VS Code extension can connect to a running Solr instance
 * and that the `smart-search-results` core is properly configured (schema,
 * field types, copy fields, request handlers, highlighting).
 *
 * Requires a live Solr server — all tests are skipped when Solr is unreachable.
 */

import * as assert from 'assert';
import axios from 'axios';
import {
  getSolrUrl,
  getSolrCoreUrl,
  skipIfSolrUnavailable,
} from './testHelpers';
import {
  TEST_TIMEOUT,
  REQUIRED_FIELDS,
  REQUIRED_FIELD_TYPES,
  SEARCH_HANDLER_BOOSTS,
} from './constants';

suite('Solr Connection & Health Integration Tests', function () {
  this.timeout(TEST_TIMEOUT);

  let solrUrl: string;
  let coreUrl: string;

  suiteSetup(async function () {
    await skipIfSolrUnavailable(this);
    solrUrl = getSolrUrl();
    coreUrl = getSolrCoreUrl();
  });

  // -----------------------------------------------------------------------
  // 1. Solr Ping
  // -----------------------------------------------------------------------

  test('Solr ping returns OK', async () => {
    const response = await axios.get(`${coreUrl}/admin/ping`, {
      timeout: 5000,
    });

    assert.strictEqual(response.status, 200, 'Ping should return HTTP 200');
    assert.strictEqual(
      response.data?.status,
      'OK',
      'Ping response should contain status "OK"',
    );
  });

  // -----------------------------------------------------------------------
  // 2. Core Status
  // -----------------------------------------------------------------------

  test('Core smart-search-results is loaded', async () => {
    const response = await axios.get(`${solrUrl}/admin/cores`, {
      params: { action: 'STATUS', core: 'smart-search-results' },
      timeout: 5000,
    });

    assert.strictEqual(response.status, 200);

    const coreStatus = response.data?.status?.['smart-search-results'];
    assert.ok(coreStatus, 'Core status block should exist');
    assert.strictEqual(
      coreStatus.name,
      'smart-search-results',
      'Core name should match',
    );
  });

  // -----------------------------------------------------------------------
  // 3. Schema Validation — required fields
  // -----------------------------------------------------------------------

  test('Schema contains all required fields', async () => {
    const response = await axios.get(`${coreUrl}/schema/fields`, {
      timeout: 5000,
    });

    assert.strictEqual(response.status, 200);

    const fieldNames: string[] = (response.data?.fields ?? []).map(
      (f: any) => f.name,
    );

    // Extended list from the prompt (superset of REQUIRED_FIELDS constant)
    const allRequired = [
      ...REQUIRED_FIELDS,
      'match_text_raw',
      'case_sensitive',
      'whole_word',
      'relevance_score',
      'match_count_in_file',
      'file_size',
      'file_modified',
      'workspace_path',
      'match_type',
    ];

    // De-duplicate in case REQUIRED_FIELDS already contains some of these
    const uniqueRequired = [...new Set(allRequired)];

    const missing = uniqueRequired.filter((f) => !fieldNames.includes(f));
    assert.deepStrictEqual(
      missing,
      [],
      `Missing schema fields: ${missing.join(', ')}`,
    );
  });

  // -----------------------------------------------------------------------
  // 4. Field Type Verification
  // -----------------------------------------------------------------------

  test('Required field types exist', async () => {
    const response = await axios.get(`${coreUrl}/schema/fieldtypes`, {
      timeout: 5000,
    });

    assert.strictEqual(response.status, 200);

    const typeNames: string[] = (response.data?.fieldTypes ?? []).map(
      (t: any) => t.name,
    );

    for (const required of REQUIRED_FIELD_TYPES) {
      assert.ok(
        typeNames.includes(required),
        `Field type "${required}" should exist`,
      );
    }
  });

  test('text_general uses StandardTokenizer and LowerCaseFilter', async () => {
    const response = await axios.get(`${coreUrl}/schema/fieldtypes`, {
      timeout: 5000,
    });

    const textGeneral = (response.data?.fieldTypes ?? []).find(
      (t: any) => t.name === 'text_general',
    );
    assert.ok(textGeneral, 'text_general type should exist');

    const analyzer =
      textGeneral.analyzer ?? textGeneral.indexAnalyzer ?? textGeneral.queryAnalyzer;
    assert.ok(analyzer, 'text_general should have an analyzer');

    const tokenizerClass: string = analyzer.tokenizer?.class ?? '';
    assert.ok(
      tokenizerClass.includes('Standard'),
      `text_general tokenizer should be StandardTokenizer, got "${tokenizerClass}"`,
    );

    const filterClasses: string[] = (analyzer.filters ?? []).map(
      (f: any) => f.class as string,
    );
    assert.ok(
      filterClasses.some((c) => c.includes('LowerCase')),
      'text_general should include LowerCaseFilter',
    );
  });

  test('text_code uses WhitespaceTokenizer and WordDelimiterGraphFilter', async () => {
    const response = await axios.get(`${coreUrl}/schema/fieldtypes`, {
      timeout: 5000,
    });

    const textCode = (response.data?.fieldTypes ?? []).find(
      (t: any) => t.name === 'text_code',
    );
    assert.ok(textCode, 'text_code type should exist');

    const analyzer =
      textCode.analyzer ?? textCode.indexAnalyzer ?? textCode.queryAnalyzer;
    assert.ok(analyzer, 'text_code should have an analyzer');

    const tokenizerClass: string = analyzer.tokenizer?.class ?? '';
    assert.ok(
      tokenizerClass.includes('Whitespace'),
      `text_code tokenizer should be WhitespaceTokenizer, got "${tokenizerClass}"`,
    );

    const filterClasses: string[] = (analyzer.filters ?? []).map(
      (f: any) => f.class as string,
    );
    assert.ok(
      filterClasses.some((c) => c.includes('WordDelimiterGraph')),
      'text_code should include WordDelimiterGraphFilter',
    );
    assert.ok(
      filterClasses.some((c) => c.includes('LowerCase')),
      'text_code should include LowerCaseFilter',
    );
  });

  test('text_display field type exists', async () => {
    const response = await axios.get(`${coreUrl}/schema/fieldtypes`, {
      timeout: 5000,
    });

    const textDisplay = (response.data?.fieldTypes ?? []).find(
      (t: any) => t.name === 'text_display',
    );
    assert.ok(textDisplay, 'text_display type should exist');
  });

  // -----------------------------------------------------------------------
  // 5. Copy Field Verification
  // -----------------------------------------------------------------------

  test('Copy fields to content_all are configured', async () => {
    const response = await axios.get(`${coreUrl}/schema/copyfields`, {
      timeout: 5000,
    });

    assert.strictEqual(response.status, 200);

    const copyFields: { source: string; dest: string }[] =
      response.data?.copyFields ?? [];

    const contentAllSources = copyFields
      .filter((cf) => cf.dest === 'content_all')
      .map((cf) => cf.source);

    const expectedSources = [
      'match_text',
      'full_line',
      'context_before',
      'context_after',
      'file_name',
      'file_path',
      'ai_summary',
    ];

    for (const src of expectedSources) {
      assert.ok(
        contentAllSources.includes(src),
        `content_all should have copy field from "${src}"`,
      );
    }
  });

  test('Copy fields to code_all are configured', async () => {
    const response = await axios.get(`${coreUrl}/schema/copyfields`, {
      timeout: 5000,
    });

    const copyFields: { source: string; dest: string }[] =
      response.data?.copyFields ?? [];

    const codeAllSources = copyFields
      .filter((cf) => cf.dest === 'code_all')
      .map((cf) => cf.source);

    const expectedSources = [
      'match_text',
      'full_line',
      'context_before',
      'context_after',
    ];

    for (const src of expectedSources) {
      assert.ok(
        codeAllSources.includes(src),
        `code_all should have copy field from "${src}"`,
      );
    }
  });

  // -----------------------------------------------------------------------
  // 6. Request Handler Verification
  // -----------------------------------------------------------------------

  test('/search handler exists with edismax and correct boosts', async () => {
    const response = await axios.get(`${coreUrl}/config/requestHandler`, {
      timeout: 5000,
    });

    assert.strictEqual(response.status, 200);

    const handlers = response.data?.config?.requestHandler ?? {};
    const searchHandler = handlers['/search'];
    assert.ok(searchHandler, '/search handler should exist');

    const defaults = searchHandler.defaults ?? {};
    assert.strictEqual(
      defaults.defType,
      'edismax',
      '/search should use edismax',
    );

    // Verify qf boost string contains expected field^weight pairs
    const qf: string = defaults.qf ?? '';
    for (const [field, boost] of Object.entries(SEARCH_HANDLER_BOOSTS)) {
      const token = `${field}^${boost}`;
      assert.ok(
        qf.includes(token),
        `qf should contain "${token}", got "${qf}"`,
      );
    }
  });

  test('/search-session handler exists', async () => {
    const response = await axios.get(`${coreUrl}/config/requestHandler`, {
      timeout: 5000,
    });

    const handlers = response.data?.config?.requestHandler ?? {};
    assert.ok(
      handlers['/search-session'],
      '/search-session handler should exist',
    );
  });

  test('/terms handler exists', async () => {
    const response = await axios.get(`${coreUrl}/config/requestHandler`, {
      timeout: 5000,
    });

    const handlers = response.data?.config?.requestHandler ?? {};
    assert.ok(handlers['/terms'], '/terms handler should exist');
  });

  // -----------------------------------------------------------------------
  // 7. Highlighting Configuration
  // -----------------------------------------------------------------------

  test('/search handler has highlighting enabled', async () => {
    const response = await axios.get(`${coreUrl}/config/requestHandler`, {
      timeout: 5000,
    });

    const handlers = response.data?.config?.requestHandler ?? {};
    const searchHandler = handlers['/search'];
    assert.ok(searchHandler, '/search handler should exist');

    const defaults = searchHandler.defaults ?? {};
    assert.strictEqual(
      defaults['hl'],
      'true',
      'Highlighting should be enabled (hl=true)',
    );
  });

  test('Highlight field list includes display_content', async () => {
    const response = await axios.get(`${coreUrl}/config/requestHandler`, {
      timeout: 5000,
    });

    const defaults =
      response.data?.config?.requestHandler?.['/search']?.defaults ?? {};
    const hlFl: string = defaults['hl.fl'] ?? '';
    assert.ok(
      hlFl.includes('display_content'),
      `hl.fl should include "display_content", got "${hlFl}"`,
    );
  });

  test('Highlight tags use <mark class="highlight">', async () => {
    const response = await axios.get(`${coreUrl}/config/requestHandler`, {
      timeout: 5000,
    });

    const defaults =
      response.data?.config?.requestHandler?.['/search']?.defaults ?? {};

    const pre: string = defaults['hl.tag.pre'] ?? defaults['hl.simple.pre'] ?? '';
    const post: string = defaults['hl.tag.post'] ?? defaults['hl.simple.post'] ?? '';

    assert.ok(
      pre.includes('<mark') && pre.includes('highlight'),
      `Highlight pre tag should be <mark class="highlight">, got "${pre}"`,
    );
    assert.strictEqual(
      post,
      '</mark>',
      `Highlight post tag should be </mark>, got "${post}"`,
    );
  });
});
