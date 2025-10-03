import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SearchResult } from '../types';
import { BaseResultsPanel } from './baseResultsPanel';
import { StatisticsItemResultsPanel, FilterCriteria, MultipleFilterCriteria } from './statisticsItemResultsPanel';

export interface StatisticsData {
  totalResults: number;
  totalFiles: number;
  totalMatches: number;
  topFolders: Array<{ folder: string; count: number; percentage: number }>;
  topFileExtensions: Array<{ extension: string; count: number; percentage: number }>;
  topFileNames: Array<{ fileName: string; count: number; percentage: number }>;
  topFilePrefixes: Array<{ prefix: string; count: number; percentage: number }>;
  topFileSuffixes: Array<{ suffix: string; count: number; percentage: number }>;
  recentModifications: Array<{ file: string; modifiedDate: string; count: number }>;
  query: string;
}

export class StatisticsPanel extends BaseResultsPanel {
  public static currentPanel: StatisticsPanel | undefined;
  private originalResults: SearchResult[] = [];
  private originalQuery: string = '';

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'statisticsResults', 'Search Statistics');
    StatisticsPanel.currentPanel = this;
    this.setupMessageHandling();
  }

  public static create(extensionUri: vscode.Uri): StatisticsPanel {
    if (StatisticsPanel.currentPanel) {
      StatisticsPanel.currentPanel.dispose();
    }
    return new StatisticsPanel(extensionUri);
  }

  private setupMessageHandling() {
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'openFile':
            this.openFile(message.file, message.line, message.column);
            break;
          case 'clickStatisticsItem':
            this.handleStatisticsItemClick(message.filterCriteria);
            break;
          case 'searchWithMultipleFilters':
            this.handleMultipleFiltersSearch(message.filterCriteria);
            break;
        }
      },
      undefined,
      this._disposables
    );
  }

  public show(results: SearchResult[], query: string) {
    this.originalResults = results;
    this.originalQuery = query;
    const statistics = this.calculateStatistics(results, query);
    this._panel.webview.html = this.getWebviewContent();
    
    // Send statistics to the webview
    this._panel.webview.postMessage({
      command: 'updateStatistics',
      data: statistics
    });
    
    this.reveal();
  }

  /**
   * Handle click on a statistics item to show filtered results
   */
  private handleStatisticsItemClick(filterCriteria: FilterCriteria) {
    if (this.originalResults.length === 0) {
      vscode.window.showInformationMessage('No original search results available.');
      return;
    }

    // Set the original query for the filter criteria
    const criteria: FilterCriteria = {
      ...filterCriteria,
      originalQuery: this.originalQuery
    };

    // Create or reuse filtered results panel
    let filteredPanel = StatisticsItemResultsPanel.currentPanel;
    if (!filteredPanel) {
      filteredPanel = StatisticsItemResultsPanel.create(this._extensionUri);
    }
    
    filteredPanel.show(this.originalResults, criteria);
  }

  /**
   * Handle search with multiple filters
   */
  private handleMultipleFiltersSearch(filterCriteriaArray: FilterCriteria[]) {
    if (this.originalResults.length === 0) {
      vscode.window.showInformationMessage('No original search results available.');
      return;
    }

    if (filterCriteriaArray.length === 0) {
      vscode.window.showInformationMessage('No filters selected.');
      return;
    }

    // Create multiple filter criteria object
    const multipleFilterCriteria: MultipleFilterCriteria = {
      filters: filterCriteriaArray,
      originalQuery: this.originalQuery
    };

    // Create or reuse filtered results panel
    let filteredPanel = StatisticsItemResultsPanel.currentPanel;
    if (!filteredPanel) {
      filteredPanel = StatisticsItemResultsPanel.create(this._extensionUri);
    }
    
    filteredPanel.showWithMultipleFilters(this.originalResults, multipleFilterCriteria);
  }

  private calculateStatistics(results: SearchResult[], query: string): StatisticsData {
    const folderCounts = new Map<string, number>();
    const extensionCounts = new Map<string, number>();
    const fileNameCounts = new Map<string, number>();
    const prefixCounts = new Map<string, number>();
    const suffixCounts = new Map<string, number>();
    const modificationDates = new Map<string, { date: string; count: number }>();
    
    const uniqueFiles = new Set<string>();
    let totalMatches = 0;

    for (const result of results) {
      const filePath = result.file;
      uniqueFiles.add(filePath);
      totalMatches++;

      // Extract folder (directory) information
      const folder = path.dirname(filePath);
      folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);

      // Extract file extension
      const extension = path.extname(filePath).toLowerCase() || '(no extension)';
      extensionCounts.set(extension, (extensionCounts.get(extension) || 0) + 1);

      // Extract file name
      const fileName = path.basename(filePath);
      fileNameCounts.set(fileName, (fileNameCounts.get(fileName) || 0) + 1);

      // Extract sophisticated file prefixes and suffixes
      const baseName = path.basename(filePath, path.extname(filePath));
      const { prefixes, suffixes } = this.extractFileNamePatterns(baseName);
      
      // Count all meaningful prefixes
      prefixes.forEach(prefix => {
        prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
      });
      
      // Count all meaningful suffixes
      suffixes.forEach(suffix => {
        suffixCounts.set(suffix, (suffixCounts.get(suffix) || 0) + 1);
      });

      // Get file modification date
      try {
        const stats = fs.statSync(filePath);
        const modDate = stats.mtime.toISOString().split('T')[0]; // YYYY-MM-DD format
        if (!modificationDates.has(filePath)) {
          modificationDates.set(filePath, { date: modDate, count: 1 });
        } else {
          const entry = modificationDates.get(filePath)!;
          entry.count++;
        }
      } catch (error) {
        // File might not exist or be accessible, skip modification date
      }
    }

    const totalFiles = uniqueFiles.size;

    // Helper function to create sorted top items
    const createTopItems = (countMap: Map<string, number>, limit = 10) => {
      return Array.from(countMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([item, count]) => ({
          item,
          count,
          percentage: Math.round((count / totalFiles) * 100)
        }));
    };

    // Create recent modifications sorted by date (most recent first)
    const recentModifications = Array.from(modificationDates.entries())
      .sort((a, b) => new Date(b[1].date).getTime() - new Date(a[1].date).getTime())
      .slice(0, 10)
      .map(([file, data]) => ({
        file: path.basename(file),
        modifiedDate: data.date,
        count: data.count
      }));

    return {
      totalResults: results.length,
      totalFiles,
      totalMatches,
      topFolders: createTopItems(folderCounts).map(item => ({ 
        folder: item.item, 
        count: item.count, 
        percentage: item.percentage 
      })),
      topFileExtensions: createTopItems(extensionCounts).map(item => ({ 
        extension: item.item, 
        count: item.count, 
        percentage: item.percentage 
      })),
      topFileNames: createTopItems(fileNameCounts).map(item => ({ 
        fileName: item.item, 
        count: item.count, 
        percentage: item.percentage 
      })),
      topFilePrefixes: createTopItems(prefixCounts).map(item => ({ 
        prefix: item.item, 
        count: item.count, 
        percentage: item.percentage 
      })),
      topFileSuffixes: createTopItems(suffixCounts).map(item => ({ 
        suffix: item.item, 
        count: item.count, 
        percentage: item.percentage 
      })),
      recentModifications,
      query
    };
  }

  public dispose() {
    StatisticsPanel.currentPanel = undefined;
    super.dispose();
  }

  private getWebviewContent(): string {
    try {
      const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'statistics.html');
      return fs.readFileSync(htmlPath.fsPath, 'utf8');
    } catch (error) {
      console.error('Failed to load statistics HTML template:', error);
      return this.getFallbackHtml();
    }
  }

  private getFallbackHtml(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Search Statistics</title>
      </head>
      <body>
        <div>Error loading Statistics template</div>
        <script>
          const vscode = acquireVsCodeApi();
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Extract sophisticated file name patterns for prefixes and suffixes
   * @param baseName - File name without extension
   * @returns Object containing arrays of meaningful prefixes and suffixes
   */
  private extractFileNamePatterns(baseName: string): { prefixes: string[], suffixes: string[] } {
    const prefixes: string[] = [];
    const suffixes: string[] = [];

    // Normalize the base name
    const normalizedName = baseName.toLowerCase();

    // 1. DOT-SEPARATED ANALYSIS
    const dotParts = baseName.split('.');
    if (dotParts.length > 1) {
      // Primary prefix (before first dot)
      const primaryPrefix = dotParts[0];
      if (primaryPrefix.length >= 2) {
        prefixes.push(primaryPrefix);
      }

      // Secondary prefixes (compound prefixes like "user.service" -> ["user", "user.service"])
      for (let i = 1; i < dotParts.length - 1; i++) {
        const compoundPrefix = dotParts.slice(0, i + 1).join('.');
        if (compoundPrefix.length >= 3) {
          prefixes.push(compoundPrefix);
        }
      }

      // Primary suffix (after last dot, excluding extension-like parts)
      const primarySuffix = dotParts[dotParts.length - 1];
      if (primarySuffix.length >= 2 && !this.isLikelyExtension(primarySuffix)) {
        suffixes.push(primarySuffix);
      }

      // Secondary suffixes (compound suffixes)
      for (let i = 1; i < dotParts.length - 1; i++) {
        const compoundSuffix = dotParts.slice(i).join('.');
        if (compoundSuffix.length >= 3 && !this.isLikelyExtension(compoundSuffix)) {
          suffixes.push(compoundSuffix);
        }
      }
    }

    // 2. CAMELCASE / PASCALCASE ANALYSIS
    const camelCaseParts = this.splitCamelCase(baseName);
    if (camelCaseParts.length > 1) {
      // CamelCase prefixes (getUserData -> ["get", "getUser"])
      for (let i = 1; i < camelCaseParts.length; i++) {
        const camelPrefix = camelCaseParts.slice(0, i).join('');
        if (camelPrefix.length >= 2) {
          prefixes.push(camelPrefix);
        }
      }

      // CamelCase suffixes (getUserData -> ["Data", "UserData"])
      for (let i = 1; i < camelCaseParts.length; i++) {
        const camelSuffix = camelCaseParts.slice(i).join('');
        if (camelSuffix.length >= 2) {
          suffixes.push(camelSuffix);
        }
      }
    }

    // 3. UNDERSCORE / KEBAB-CASE ANALYSIS
    const underscoreParts = baseName.split(/[-_]/);
    if (underscoreParts.length > 1) {
      // Underscore/kebab prefixes
      for (let i = 1; i < underscoreParts.length; i++) {
        const underscorePrefix = underscoreParts.slice(0, i).join('_');
        if (underscorePrefix.length >= 2) {
          prefixes.push(underscorePrefix);
        }
      }

      // Underscore/kebab suffixes
      for (let i = 1; i < underscoreParts.length; i++) {
        const underscoreSuffix = underscoreParts.slice(i).join('_');
        if (underscoreSuffix.length >= 2) {
          suffixes.push(underscoreSuffix);
        }
      }
    }

    // 4. COMMON PROGRAMMING PATTERNS
    const commonPatterns = this.extractCommonPatterns(normalizedName);
    prefixes.push(...commonPatterns.prefixes);
    suffixes.push(...commonPatterns.suffixes);

    // 5. NUMERIC PATTERNS
    const numericPatterns = this.extractNumericPatterns(baseName);
    prefixes.push(...numericPatterns.prefixes);
    suffixes.push(...numericPatterns.suffixes);

    // Remove duplicates and filter out very short or common words
    const uniquePrefixes = [...new Set(prefixes)].filter(p => 
      p.length >= 2 && !this.isCommonWord(p.toLowerCase())
    );
    const uniqueSuffixes = [...new Set(suffixes)].filter(s => 
      s.length >= 2 && !this.isCommonWord(s.toLowerCase())
    );

    return { 
      prefixes: uniquePrefixes, 
      suffixes: uniqueSuffixes 
    };
  }

  /**
   * Check if a string is likely a file extension
   */
  private isLikelyExtension(str: string): boolean {
    const commonExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'css', 'html', 'xml', 'json', 'md', 'txt', 'log', 'sql', 'php', 'rb', 'go', 'rs', 'sh', 'bat', 'ps1'];
    return commonExtensions.includes(str.toLowerCase()) || str.length <= 4;
  }

  /**
   * Split camelCase and PascalCase strings into parts
   */
  private splitCamelCase(str: string): string[] {
    // Handle both camelCase and PascalCase
    return str.split(/(?=[A-Z][a-z])|(?<=[a-z])(?=[A-Z])|(?<=[0-9])(?=[A-Z])/);
  }

  /**
   * Extract common programming naming patterns
   */
  private extractCommonPatterns(normalizedName: string): { prefixes: string[], suffixes: string[] } {
    const prefixes: string[] = [];
    const suffixes: string[] = [];

    // Common programming prefixes
    const commonPrefixes = ['get', 'set', 'is', 'has', 'can', 'should', 'will', 'create', 'make', 'build', 'init', 'setup', 'config', 'handle', 'process', 'parse', 'render', 'update', 'delete', 'remove', 'add', 'insert', 'fetch', 'load', 'save', 'export', 'import', 'validate', 'check', 'test', 'mock', 'stub', 'min', 'max', 'temp', 'tmp', 'old', 'new', 'base', 'main', 'core', 'util', 'helper', 'lib', 'api', 'ui', 'db', 'sql', 'http', 'web', 'app', 'admin', 'user', 'auth', 'login', 'logout'];
    
    for (const prefix of commonPrefixes) {
      if (normalizedName.startsWith(prefix) && normalizedName.length > prefix.length) {
        prefixes.push(prefix);
      }
    }

    // Common programming suffixes
    const commonSuffixes = ['controller', 'service', 'model', 'view', 'component', 'widget', 'helper', 'util', 'utils', 'manager', 'handler', 'processor', 'parser', 'builder', 'factory', 'provider', 'adapter', 'wrapper', 'decorator', 'validator', 'formatter', 'converter', 'transformer', 'mapper', 'filter', 'interceptor', 'middleware', 'plugin', 'extension', 'module', 'package', 'library', 'framework', 'engine', 'driver', 'client', 'server', 'api', 'endpoint', 'route', 'router', 'config', 'configuration', 'settings', 'options', 'params', 'parameters', 'args', 'arguments', 'data', 'info', 'details', 'summary', 'report', 'log', 'logger', 'error', 'exception', 'event', 'listener', 'observer', 'subscriber', 'publisher', 'queue', 'cache', 'store', 'repository', 'dao', 'dto', 'entity', 'bean', 'pojo', 'vo', 'bo', 'test', 'tests', 'spec', 'specs', 'mock', 'mocks', 'stub', 'stubs', 'fixture', 'fixtures', 'sample', 'example', 'demo', 'prototype', 'template', 'schema', 'interface', 'abstract', 'base', 'impl', 'implementation', 'proxy', 'facade', 'strategy', 'command', 'query', 'request', 'response', 'result', 'output', 'input', 'form', 'page', 'screen', 'dialog', 'popup', 'modal', 'panel', 'tab', 'menu', 'toolbar', 'statusbar', 'sidebar', 'header', 'footer', 'content', 'body', 'item', 'element', 'node', 'tree', 'list', 'table', 'grid', 'chart', 'graph', 'icon', 'image', 'picture', 'photo', 'avatar', 'thumb', 'thumbnail'];
    
    for (const suffix of commonSuffixes) {
      if (normalizedName.endsWith(suffix) && normalizedName.length > suffix.length) {
        suffixes.push(suffix);
      }
    }

    return { prefixes, suffixes };
  }

  /**
   * Extract numeric patterns (version numbers, indices, etc.)
   */
  private extractNumericPatterns(baseName: string): { prefixes: string[], suffixes: string[] } {
    const prefixes: string[] = [];
    const suffixes: string[] = [];

    // Version patterns (v1, v2.0, ver1, version2, etc.)
    const versionPrefixMatch = baseName.match(/^(v|ver|version)(\d+)/i);
    if (versionPrefixMatch) {
      prefixes.push(versionPrefixMatch[1].toLowerCase());
    }

    const versionSuffixMatch = baseName.match(/(v|ver|version)(\d+)$/i);
    if (versionSuffixMatch) {
      suffixes.push(`${versionSuffixMatch[1].toLowerCase()}${versionSuffixMatch[2]}`);
    }

    // Numeric suffixes (file1, page2, item3, etc.)
    const numericSuffixMatch = baseName.match(/([a-zA-Z]+)(\d+)$/);
    if (numericSuffixMatch) {
      const wordPart = numericSuffixMatch[1];
      if (wordPart.length >= 2) {
        prefixes.push(wordPart);
      }
    }

    // Numeric prefixes (1st, 2nd, 01_file, 02_page, etc.)
    const numericPrefixMatch = baseName.match(/^(\d+)([a-zA-Z_-].*)/);
    if (numericPrefixMatch && numericPrefixMatch[2].length >= 2) {
      const numPart = numericPrefixMatch[1];
      if (numPart.length <= 3) { // Reasonable number length
        prefixes.push(`num_${numPart.length}digit`); // e.g., "num_2digit" for patterns like "01_", "02_"
      }
    }

    return { prefixes, suffixes };
  }

  /**
   * Check if a word is too common to be meaningful
   */
  private isCommonWord(word: string): boolean {
    const commonWords = ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'it', 'be', 'do', 'if', 'my', 'no', 'so', 'up', 'go'];
    return commonWords.includes(word) || word.length <= 1;
  }

  protected generateResultsHtml(results: any[]): string {
    // This method is required by the base class but not used in this implementation
    return '';
  }
}