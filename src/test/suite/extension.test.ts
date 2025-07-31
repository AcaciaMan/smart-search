import * as assert from 'assert';
import * as vscode from 'vscode';
import { SmartSearchProvider } from '../../providers/smartSearchProvider';
import { IndexManager } from '../../services/indexManager';

suite('Smart Search Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('SmartSearchProvider initialization', () => {
    const indexManager = new IndexManager();
    const provider = new SmartSearchProvider(indexManager);
    assert.ok(provider);
  });

  test('Search with empty query', async () => {
    const indexManager = new IndexManager();
    const provider = new SmartSearchProvider(indexManager);
    
    try {
      const results = await provider.search('');
      assert.ok(Array.isArray(results));
    } catch (error) {
      // Expected to fail with empty query
      assert.ok(error);
    }
  });
});
