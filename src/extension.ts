import * as vscode from 'vscode';
import { SmartSearchProvider } from './providers/smartSearchProvider';
import { IndexManager } from './services';
import { RipgrepResultsPanel } from './panels/ripgrepResultsPanel';
import { SolrResultsPanel } from './panels/solrResultsPanel';
import { SmartSearchViewProvider } from './views/smartSearchViewProvider';
import { RecentSearchViewProvider } from './views/recentSearchViewProvider';
import { ToolsViewProvider } from './views/toolsViewProvider';
import { ConfigCheckViewProvider } from './views/configCheckViewProvider';
import { createFilter, updateFilter, listAllFilters } from './services';
import { SearchFilterPreset } from './services/filtersConfig';
import { FilterScope } from './services/presetsService';
import { RefinementPanelController } from './views/refinementPanelController';

export function activate(context: vscode.ExtensionContext) {
  console.log('Smart Search extension is now active!');

  const indexManager = new IndexManager();
  const searchProvider = new SmartSearchProvider(indexManager);

  // ── Register Live Tools sidebar view ───────────────────────────────────────
  const liveToolsProvider = new ToolsViewProvider(context.extensionUri, 'live');
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ToolsViewProvider.liveViewType,
      liveToolsProvider
    )
  );

  // ── Register Session Tools sidebar view ────────────────────────────────────
  const sessionToolsProvider = new ToolsViewProvider(context.extensionUri, 'session');
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ToolsViewProvider.sessionViewType,
      sessionToolsProvider
    )
  );

  // ── Register the Recent Searches sidebar view ──────────────────────────────
  const recentSearchViewProvider = new RecentSearchViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      RecentSearchViewProvider.viewType,
      recentSearchViewProvider
    )
  );

  // ── Register the Health Check sidebar view ─────────────────────────────────
  const configCheckViewProvider = new ConfigCheckViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ConfigCheckViewProvider.viewType,
      configCheckViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ── Register the main Search sidebar view ─────────────────────────────────
  const searchViewProvider = new SmartSearchViewProvider(
    context.extensionUri,
    recentSearchViewProvider,
    liveToolsProvider,
    sessionToolsProvider
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SmartSearchViewProvider.viewType,
      searchViewProvider
    )
  );

  // ── Wire up cross-panel callbacks ─────────────────────────────────────────

  // When user clicks a history query → fill it in the main search view
  recentSearchViewProvider.onUseHistoryQuery = (query: string) => {
    searchViewProvider.setQuery(query);
    // Focus the search view
    vscode.commands.executeCommand('smartSearch.searchView.focus');
  };

  // When user selects a session from the recent view → select it in main view
  recentSearchViewProvider.onSelectSession = (sessionId: string) => {
    searchViewProvider.selectSessionFromExternal(sessionId);
    vscode.commands.executeCommand('smartSearch.searchView.focus');
  };

  // When user wants to search in a session from the recent view
  recentSearchViewProvider.onSearchInSession = (sessionId: string) => {
    searchViewProvider.activateSessionMode(sessionId);
    vscode.commands.executeCommand('smartSearch.searchView.focus');
  };

  // Register commands
  const searchCommand = vscode.commands.registerCommand('smart-search.search', async () => {
    const query = await vscode.window.showInputBox({
      prompt: 'Enter search query',
      placeHolder: 'Search for files, symbols, or content...'
    });

    if (query) {
      try {
        const results = await searchProvider.search(query);

        // Create or reuse the ripgrep results panel
        let resultsPanel = RipgrepResultsPanel.currentPanel;
        if (!resultsPanel) {
          resultsPanel = RipgrepResultsPanel.create(context.extensionUri);
        }

        resultsPanel.show(results, query);
      } catch (error) {
        vscode.window.showErrorMessage(`Search failed: ${error}`);
      }
    }
  });

  // Register command to show Solr results
  const showSolrResultsCommand = vscode.commands.registerCommand('smart-search.showSolrResults', async () => {
    const query = await vscode.window.showInputBox({
      prompt: 'Search in stored results',
      placeHolder: 'Search within previously indexed results...'
    });

    if (query) {
      try {
        const searchOptions = { query };
        const storedResults = await indexManager.searchStoredResultsDetailed(searchOptions);

        // Create or reuse the Solr results panel
        let solrPanel = SolrResultsPanel.currentPanel;
        if (!solrPanel) {
          solrPanel = SolrResultsPanel.create(context.extensionUri);
        }

        solrPanel.show(storedResults, query);
      } catch (error) {
        vscode.window.showErrorMessage(`Solr search failed: ${error}`);
      }
    }
  });

  // ── Save Current Search as Filter ────────────────────────────────────────
  const saveCurrentSearchAsFilterCommand = vscode.commands.registerCommand(
    'smart-search.saveCurrentSearchAsFilter',
    async () => {
      const globState = searchViewProvider.currentGlobState;

      // --- Step b: name ---
      let name: string | undefined;
      while (true) {
        name = await vscode.window.showInputBox({
          prompt: 'Filter name',
          value: name ?? 'my-filter',
        });
        if (name === undefined) {
          return; // cancelled
        }
        name = name.trim();
        if (!name) {
          vscode.window.showWarningMessage('Filter name must not be empty.');
          continue;
        }

        // --- Step c: scope ---
        const scopePick = await vscode.window.showQuickPick(['Global', 'Workspace'], {
          placeHolder: 'Save to...',
        });
        if (scopePick === undefined) {
          return; // cancelled
        }
        const scope: FilterScope = scopePick === 'Global' ? 'global' : 'workspace';

        // --- Step d: build preset ---
        const preset: SearchFilterPreset = {
          name,
          includeGlobs:       globState.includeGlobs,
          excludeGlobs:       globState.excludeGlobs,
          customIncludeGlobs: globState.customIncludeGlobs,
          customExcludeGlobs: globState.customExcludeGlobs,
        };

        // --- Step e: save ---
        try {
          await createFilter(scope, preset);
          vscode.window.showInformationMessage(`Filter "${name}" saved.`);
          return;
        } catch {
          // --- Step f: name conflict ---
          const conflictAction = await vscode.window.showQuickPick(
            ['Overwrite existing', 'Choose another name'],
            { placeHolder: `A filter named "${name}" already exists.` },
          );
          if (conflictAction === undefined) {
            return; // cancelled
          }
          if (conflictAction === 'Overwrite existing') {
            await updateFilter(scope, name, preset);
            vscode.window.showInformationMessage(`Filter "${name}" saved.`);
            return;
          }
          // 'Choose another name' → loop back (name variable keeps last value as default)
        }
      }
    }
  );

  // ── Choose Filter for Current Search ──────────────────────────────────
  const chooseFilterCommand = vscode.commands.registerCommand(
    'smart-search.chooseFilterForCurrentSearch',
    async () => {
      const allFilters = await listAllFilters();
      const activeFilter = searchViewProvider.getActiveFilter();

      type PresetItem = vscode.QuickPickItem & {
        _name?: string;
        _scope?: 'global' | 'workspace';
      };

      /** Build a short glob preview string for the description. */
      function buildPreview(preset: { includeGlobs: string[]; excludeGlobs: string[] }): string {
        const inc = preset.includeGlobs.slice(0, 2).map(g => `+${g}`);
        const exc = preset.excludeGlobs.slice(0, 2).map(g => `-${g}`);
        const parts = [...inc, ...exc];
        const hasMore =
          preset.includeGlobs.length > 2 || preset.excludeGlobs.length > 2;
        return parts.join(' ') + (hasMore ? ' …' : '');
      }

      const workspaceItems: PresetItem[] = allFilters
        .filter(s => s.scope === 'workspace')
        .map(({ preset }) => ({
          label: `${preset.name} $(folder)`,
          description: (preset.description ?? buildPreview(preset)) || undefined,
          detail:
            activeFilter.name === preset.name && activeFilter.scope === 'workspace'
              ? '(active)'
              : undefined,
          _name: preset.name,
          _scope: 'workspace' as const,
        }));

      const globalItems: PresetItem[] = allFilters
        .filter(s => s.scope === 'global')
        .map(({ preset }) => ({
          label: `${preset.name} $(globe)`,
          description: (preset.description ?? buildPreview(preset)) || undefined,
          detail:
            activeFilter.name === preset.name && activeFilter.scope === 'global'
              ? '(active)'
              : undefined,
          _name: preset.name,
          _scope: 'global' as const,
        }));

      const noneItem: PresetItem = {
        label: 'None',
        description: 'Clear active filter',
      };

      const items: PresetItem[] = [
        noneItem,
        { label: 'Workspace', kind: vscode.QuickPickItemKind.Separator },
        ...workspaceItems,
        { label: 'Global', kind: vscode.QuickPickItemKind.Separator },
        ...globalItems,
      ];

      const qp = vscode.window.createQuickPick<PresetItem>();
      qp.items = items;
      qp.placeholder = 'Select a filter preset (or None to clear)';
      qp.matchOnDescription = true;

      // Pre-select the currently active item.
      const currentlyActive = items.find(
        item =>
          item._name === activeFilter.name &&
          item._scope === activeFilter.scope,
      );
      if (currentlyActive) {
        qp.activeItems = [currentlyActive];
      }

      qp.onDidAccept(() => {
        const selected = qp.selectedItems[0];
        qp.hide();
        if (!selected) {
          return;
        }
        if (selected === noneItem || !selected._name) {
          searchViewProvider.setActiveFilter(undefined, undefined);
        } else {
          searchViewProvider.setActiveFilter(selected._name, selected._scope);
        }
      });

      qp.show();
    }
  );

  // ── Open Refinement Panel ────────────────────────────────────────────
  const refinementController = new RefinementPanelController(
    context.extensionUri,
    searchViewProvider,
  );
  const openRefinementPanelCommand = vscode.commands.registerCommand(
    'smart-search.openRefinementPanel',
    () => refinementController.show(),
  );

  context.subscriptions.push(
    searchCommand,
    showSolrResultsCommand,
    saveCurrentSearchAsFilterCommand,
    chooseFilterCommand,
    openRefinementPanelCommand,
  );
}

export function deactivate() {
  console.log('Smart Search extension is deactivated');
}
