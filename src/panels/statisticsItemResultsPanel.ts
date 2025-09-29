import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SearchResult } from '../types';
import { BaseResultsPanel } from './baseResultsPanel';

export interface FilterCriteria {
  type: 'folder' | 'extension' | 'fileName' | 'prefix' | 'suffix' | 'recentFile';
  value: string;
  originalQuery: string;
}

export class StatisticsItemResultsPanel extends BaseResultsPanel {
  public static currentPanel: StatisticsItemResultsPanel | undefined;

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'statisticsItemResults', 'Filtered Search Results');
    StatisticsItemResultsPanel.currentPanel = this;
    this.setupMessageHandling();
  }

  public static create(extensionUri: vscode.Uri): StatisticsItemResultsPanel {
    if (StatisticsItemResultsPanel.currentPanel) {
      StatisticsItemResultsPanel.currentPanel.dispose();
    }
    return new StatisticsItemResultsPanel(extensionUri);
  }

  private setupMessageHandling() {
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'openFile':
            this.openFile(message.file, message.line, message.column);
            break;
        }
      },
      undefined,
      this._disposables
    );
  }

  public show(allResults: SearchResult[], filterCriteria: FilterCriteria) {
    const filteredResults = this.filterResults(allResults, filterCriteria);
    const title = this.generateTitle(filterCriteria, filteredResults.length);
    
    this._panel.title = title;
    this._panel.webview.html = this.getWebviewContent();
    
    // Send data to the webview
    this._panel.webview.postMessage({
      command: 'updateResults',
      data: { 
        results: filteredResults, 
        filterCriteria,
        title,
        originalQuery: filterCriteria.originalQuery
      }
    });
    
    this.reveal();
  }

  private filterResults(allResults: SearchResult[], criteria: FilterCriteria): SearchResult[] {
    switch (criteria.type) {
      case 'folder':
        return allResults.filter(result => {
          const folder = path.dirname(result.file);
          return folder === criteria.value || folder.endsWith(criteria.value);
        });
      
      case 'extension':
        return allResults.filter(result => {
          const extension = path.extname(result.file).toLowerCase();
          return extension === criteria.value || extension === `.${criteria.value}`;
        });
      
      case 'fileName':
        return allResults.filter(result => {
          const fileName = path.basename(result.file);
          return fileName === criteria.value;
        });
      
      case 'prefix':
        return allResults.filter(result => {
          const baseName = path.basename(result.file, path.extname(result.file));
          const patterns = this.extractFileNamePatterns(baseName);
          return patterns.prefixes.includes(criteria.value);
        });
      
      case 'suffix':
        return allResults.filter(result => {
          const baseName = path.basename(result.file, path.extname(result.file));
          const patterns = this.extractFileNamePatterns(baseName);
          return patterns.suffixes.includes(criteria.value);
        });
      
      case 'recentFile':
        return allResults.filter(result => {
          const fileName = path.basename(result.file);
          return fileName === criteria.value;
        });
      
      default:
        return allResults;
    }
  }

  // Reuse the same pattern extraction logic from StatisticsPanel
  private extractFileNamePatterns(baseName: string): { prefixes: string[], suffixes: string[] } {
    const prefixes: string[] = [];
    const suffixes: string[] = [];

    // Simplified version - you could import the full logic from StatisticsPanel
    const dotParts = baseName.split('.');
    if (dotParts.length > 1) {
      prefixes.push(dotParts[0]);
      if (dotParts[dotParts.length - 1].length >= 2) {
        suffixes.push(dotParts[dotParts.length - 1]);
      }
    }

    // CamelCase analysis
    const camelCaseParts = baseName.split(/(?=[A-Z][a-z])|(?<=[a-z])(?=[A-Z])/);
    if (camelCaseParts.length > 1) {
      for (let i = 1; i < camelCaseParts.length; i++) {
        const camelPrefix = camelCaseParts.slice(0, i).join('');
        if (camelPrefix.length >= 2) prefixes.push(camelPrefix);
        
        const camelSuffix = camelCaseParts.slice(i).join('');
        if (camelSuffix.length >= 2) suffixes.push(camelSuffix);
      }
    }

    // Underscore/kebab analysis
    const underscoreParts = baseName.split(/[-_]/);
    if (underscoreParts.length > 1) {
      for (let i = 1; i < underscoreParts.length; i++) {
        const underscorePrefix = underscoreParts.slice(0, i).join('_');
        if (underscorePrefix.length >= 2) prefixes.push(underscorePrefix);
        
        const underscoreSuffix = underscoreParts.slice(i).join('_');
        if (underscoreSuffix.length >= 2) suffixes.push(underscoreSuffix);
      }
    }

    return { prefixes: [...new Set(prefixes)], suffixes: [...new Set(suffixes)] };
  }

  private generateTitle(criteria: FilterCriteria, resultCount: number): string {
    const typeLabels = {
      folder: 'Folder',
      extension: 'Extension',
      fileName: 'File Name', 
      prefix: 'Prefix',
      suffix: 'Suffix',
      recentFile: 'Recent File'
    };
    
    return `${typeLabels[criteria.type]}: "${criteria.value}" (${resultCount} matches)`;
  }

  public dispose() {
    StatisticsItemResultsPanel.currentPanel = undefined;
    super.dispose();
  }

  private getWebviewContent(): string {
    try {
      const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'statisticsItemResults.html');
      return fs.readFileSync(htmlPath.fsPath, 'utf8');
    } catch (error) {
      console.error('Failed to load statistics item results HTML template:', error);
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
        <title>Filtered Search Results</title>
      </head>
      <body>
        <div>Error loading Filtered Results template</div>
        <script>
          const vscode = acquireVsCodeApi();
        </script>
      </body>
      </html>
    `;
  }

  protected generateResultsHtml(results: any[]): string {
    // This method is required by the base class but not used in this implementation
    return '';
  }
}