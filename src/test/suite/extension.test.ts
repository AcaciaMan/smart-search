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

  test('SmartSearchProvider accepts SearchOptions', () => {
    const indexManager = new IndexManager();
    const provider = new SmartSearchProvider(indexManager);
    assert.ok(typeof provider.search === 'function');
  });
});
