import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileResult } from '../types';
import { BaseResultsPanel } from './baseResultsPanel';
import { FileListPanel } from './fileListPanel';

export interface FileStatisticsData {
  totalFiles: number;
  totalMatches: number;
  allFiles: FileResult[];
  topFolders: Array<{ folder: string; count: number; percentage: number }>;
  topFileExtensions: Array<{ extension: string; count: number; percentage: number }>;
  topFileNames: Array<{ fileName: string; count: number; percentage: number }>;
  topFilePrefixes: Array<{ prefix: string; count: number; percentage: number }>;
  topFileSuffixes: Array<{ suffix: string; count: number; percentage: number }>;
  recentModifications: Array<{ file: string; modifiedDate: string; count: number }>;
  query: string;
}

export class FileStatisticsPanel extends BaseResultsPanel {
  public static currentPanel: FileStatisticsPanel | undefined;
  private _rawResults: FileResult[] = [];
  private _query: string = '';

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'fileStatisticsResults', 'File Search Statistics');
    FileStatisticsPanel.currentPanel = this;
    this.setupMessageHandling();
  }

  public static create(extensionUri: vscode.Uri): FileStatisticsPanel {
    if (FileStatisticsPanel.currentPanel) {
      FileStatisticsPanel.currentPanel.dispose();
    }
    return new FileStatisticsPanel(extensionUri);
  }

  public show(results: FileResult[], query: string) {
    this._rawResults = results;
    this._query = query;
    const statistics = this.calculateStatistics(results, query);
    this._panel.webview.html = this.getWebviewContent();

    // Give the webview a moment to initialise, then push data
    setTimeout(() => {
      this._panel.webview.postMessage({
        command: 'updateFileStatistics',
        data: statistics
      });
    }, 100);

    this.reveal();
  }

  // ── Message handling ─────────────────────────────────────────────────

  private setupMessageHandling() {
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'openFile':
            this.openFile(message.file, message.line ?? 0, message.column ?? 0);
            break;
          case 'openFileList': {
            const selected: FileResult[] = message.files || [];
            if (selected.length === 0) { return; }
            let listPanel = FileListPanel.currentPanel;
            if (!listPanel) {
              listPanel = FileListPanel.create(this._extensionUri);
            }
            listPanel.show(selected, this._query);
            break;
          }
        }
      },
      undefined,
      this._disposables
    );
  }

  public dispose() {
    FileStatisticsPanel.currentPanel = undefined;
    super.dispose();
  }

  // ── Statistics calculation ────────────────────────────────────────────────

  private calculateStatistics(results: FileResult[], query: string): FileStatisticsData {
    const folderCounts     = new Map<string, number>();
    const extensionCounts  = new Map<string, number>();
    const fileNameCounts   = new Map<string, number>();
    const prefixCounts     = new Map<string, number>();
    const suffixCounts     = new Map<string, number>();
    const modificationDates = new Map<string, { date: string; count: number }>();

    let totalMatches = 0;

    for (const result of results) {
      const filePath = result.file;
      const matchCount = result.matchCount;
      totalMatches += matchCount;

      // Folder
      const folder = path.dirname(filePath);
      folderCounts.set(folder, (folderCounts.get(folder) || 0) + matchCount);

      // Extension
      const extension = path.extname(filePath).toLowerCase() || '(no extension)';
      extensionCounts.set(extension, (extensionCounts.get(extension) || 0) + matchCount);

      // File name
      const fileName = path.basename(filePath);
      fileNameCounts.set(fileName, (fileNameCounts.get(fileName) || 0) + matchCount);

      // Prefixes & suffixes
      const baseName = path.basename(filePath, path.extname(filePath));
      const { prefixes, suffixes } = this.extractFileNamePatterns(baseName);
      prefixes.forEach(p => prefixCounts.set(p, (prefixCounts.get(p) || 0) + matchCount));
      suffixes.forEach(s => suffixCounts.set(s, (suffixCounts.get(s) || 0) + matchCount));

      // Modification date
      try {
        const stats = fs.statSync(filePath);
        const modDate = stats.mtime.toISOString().split('T')[0];
        if (!modificationDates.has(filePath)) {
          modificationDates.set(filePath, { date: modDate, count: matchCount });
        }
      } catch {
        // file inaccessible – skip
      }
    }

    const totalFiles = results.length;

    const toTopItems = (map: Map<string, number>, limit = 10) =>
      Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([item, count]) => ({
          item,
          count,
          percentage: totalFiles > 0 ? Math.round((count / totalMatches) * 100) : 0
        }));

    const recentModifications = Array.from(modificationDates.entries())
      .sort((a, b) => new Date(b[1].date).getTime() - new Date(a[1].date).getTime())
      .slice(0, 15)
      .map(([file, data]) => ({
        file: path.basename(file),
        modifiedDate: data.date,
        count: data.count
      }));

    return {
      totalFiles,
      totalMatches,
      allFiles: results.slice().sort((a, b) => b.matchCount - a.matchCount),
      topFolders: toTopItems(folderCounts).map(i => ({ folder: i.item, count: i.count, percentage: i.percentage })),
      topFileExtensions: toTopItems(extensionCounts).map(i => ({ extension: i.item, count: i.count, percentage: i.percentage })),
      topFileNames: toTopItems(fileNameCounts).map(i => ({ fileName: i.item, count: i.count, percentage: i.percentage })),
      topFilePrefixes: toTopItems(prefixCounts).map(i => ({ prefix: i.item, count: i.count, percentage: i.percentage })),
      topFileSuffixes: toTopItems(suffixCounts).map(i => ({ suffix: i.item, count: i.count, percentage: i.percentage })),
      recentModifications,
      query
    };
  }

  // ── File name pattern extraction (mirrors StatisticsPanel logic) ──────────

  private extractFileNamePatterns(baseName: string): { prefixes: string[]; suffixes: string[] } {
    const prefixes: string[] = [];
    const suffixes: string[] = [];
    const normalized = baseName.toLowerCase();

    // --- Dot-separated ---
    const dotParts = baseName.split('.');
    if (dotParts.length > 1) {
      const primary = dotParts[0];
      if (primary.length >= 2) { prefixes.push(primary); }

      for (let i = 1; i < dotParts.length - 1; i++) {
        const compound = dotParts.slice(0, i + 1).join('.');
        if (compound.length >= 3) { prefixes.push(compound); }
      }

      const primarySuffix = dotParts[dotParts.length - 1];
      if (primarySuffix.length >= 2 && !this.isLikelyExtension(primarySuffix)) {
        suffixes.push(primarySuffix);
      }

      for (let i = 1; i < dotParts.length - 1; i++) {
        const compoundSuffix = dotParts.slice(i).join('.');
        if (compoundSuffix.length >= 3 && !this.isLikelyExtension(compoundSuffix)) {
          suffixes.push(compoundSuffix);
        }
      }
    }

    // --- CamelCase ---
    const camelParts = baseName.split(/(?=[A-Z][a-z])|(?<=[a-z])(?=[A-Z])|(?<=[0-9])(?=[A-Z])/);
    if (camelParts.length > 1) {
      for (let i = 1; i < camelParts.length; i++) {
        const cpfx = camelParts.slice(0, i).join('');
        if (cpfx.length >= 2) { prefixes.push(cpfx); }
        const csfx = camelParts.slice(i).join('');
        if (csfx.length >= 2) { suffixes.push(csfx); }
      }
    }

    // --- Underscore / kebab ---
    const sepParts = baseName.split(/[-_]/);
    if (sepParts.length > 1) {
      for (let i = 1; i < sepParts.length; i++) {
        const sp = sepParts.slice(0, i).join('_');
        if (sp.length >= 2) { prefixes.push(sp); }
        const ss = sepParts.slice(i).join('_');
        if (ss.length >= 2) { suffixes.push(ss); }
      }
    }

    // --- Common programming patterns ---
    const common = this.extractCommonPatterns(normalized);
    prefixes.push(...common.prefixes);
    suffixes.push(...common.suffixes);

    return {
      prefixes: [...new Set(prefixes)].filter(p => p.length >= 2 && !this.isCommonWord(p.toLowerCase())),
      suffixes: [...new Set(suffixes)].filter(s => s.length >= 2 && !this.isCommonWord(s.toLowerCase()))
    };
  }

  private isLikelyExtension(str: string): boolean {
    const exts = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'css', 'html', 'xml', 'json', 'md', 'txt', 'log', 'sql', 'php', 'rb', 'go', 'rs', 'sh', 'bat', 'ps1'];
    return exts.includes(str.toLowerCase()) || str.length <= 4;
  }

  private extractCommonPatterns(n: string): { prefixes: string[]; suffixes: string[] } {
    const pfxKeywords = ['get', 'set', 'is', 'has', 'can', 'create', 'make', 'build', 'init', 'setup', 'config', 'handle', 'process', 'parse', 'render', 'update', 'delete', 'fetch', 'load', 'save', 'export', 'import', 'validate', 'test', 'base', 'main', 'core', 'util', 'helper', 'lib', 'api', 'app', 'admin', 'user', 'auth'];
    const sfxKeywords = ['controller', 'service', 'model', 'view', 'component', 'helper', 'util', 'utils', 'manager', 'handler', 'processor', 'parser', 'builder', 'factory', 'provider', 'adapter', 'wrapper', 'validator', 'module', 'config', 'settings', 'data', 'info', 'store', 'repository', 'test', 'tests', 'spec', 'specs', 'mock', 'panel', 'dialog', 'page', 'screen', 'form', 'item', 'node', 'list', 'table', 'grid'];
    const prefixes = pfxKeywords.filter(k => n.startsWith(k) && n.length > k.length);
    const sfxs    = sfxKeywords.filter(k => n.endsWith(k)   && n.length > k.length);
    return { prefixes, suffixes: sfxs };
  }

  private isCommonWord(word: string): boolean {
    const common = ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'it', 'be', 'do', 'if', 'my', 'no', 'so', 'up', 'go'];
    return common.includes(word) || word.length <= 1;
  }

  // ── BaseResultsPanel required abstract method ─────────────────────────────

  protected generateResultsHtml(_results: any[]): string {
    return this.getWebviewContent();
  }

  // ── Webview content ───────────────────────────────────────────────────────

  private getWebviewContent(): string {
    try {
      const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'fileStatistics.html');
      return fs.readFileSync(htmlPath.fsPath, 'utf8');
    } catch (error) {
      console.error('Failed to load fileStatistics.html:', error);
      return `<!DOCTYPE html><html><body><p>Error loading file statistics template.</p></body></html>`;
    }
  }
}
