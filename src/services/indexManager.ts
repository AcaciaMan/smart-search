import * as vscode from 'vscode';
import axios from 'axios';
import { SearchResult, SearchOptions, IndexEntry } from '../types';

export class IndexManager {
  private solrUrl: string;

  constructor() {
    this.solrUrl = vscode.workspace.getConfiguration('smart-search').get('solrUrl', 'http://localhost:8983/solr');
  }

  async indexWorkspace(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder found');
    }

    for (const folder of workspaceFolders) {
      await this.indexFolder(folder);
    }
  }

  private async indexFolder(folder: vscode.WorkspaceFolder): Promise<void> {
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, '**/*'),
      new vscode.RelativePattern(folder, '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**}')
    );

    const entries: IndexEntry[] = [];
    
    for (const file of files) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const symbols = await this.extractSymbols(document);
        
        const entry: IndexEntry = {
          id: file.fsPath,
          file: file.fsPath,
          content: document.getText(),
          symbols,
          lastModified: new Date()
        };
        
        entries.push(entry);
      } catch (error) {
        console.warn(`Failed to index file ${file.fsPath}:`, error);
      }
    }

    await this.sendToSolr(entries);
  }

  private async extractSymbols(document: vscode.TextDocument) {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri
    );

    return symbols?.map(symbol => ({
      name: symbol.name,
      kind: vscode.SymbolKind[symbol.kind],
      line: symbol.range.start.line,
      column: symbol.range.start.character,
      scope: symbol.detail || ''
    })) || [];
  }

  private async sendToSolr(entries: IndexEntry[]): Promise<void> {
    try {
      const response = await axios.post(`${this.solrUrl}/smart-search/update/json/docs`, entries, {
        headers: {
          'Content-Type': 'application/json'
        },
        params: {
          commit: true
        }
      });

      if (response.status !== 200) {
        throw new Error(`Solr indexing failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send data to Solr:', error);
      throw error;
    }
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    try {
      const response = await axios.get(`${this.solrUrl}/smart-search/select`, {
        params: {
          q: options.query,
          rows: options.maxResults || 100,
          wt: 'json',
          hl: 'true',
          'hl.fl': 'content',
          'hl.simple.pre': '<mark>',
          'hl.simple.post': '</mark>'
        }
      });

      const docs = response.data.response.docs;
      const highlighting = response.data.highlighting || {};

      return docs.map((doc: any): SearchResult => ({
        file: doc.file,
        line: 0, // Solr doesn't provide line numbers by default
        column: 0,
        content: doc.content,
        context: highlighting[doc.id]?.content || [],
        score: doc.score || 0
      }));
    } catch (error) {
      console.error('Solr search failed:', error);
      throw error;
    }
  }

  async searchSymbols(query: string): Promise<SearchResult[]> {
    try {
      const response = await axios.get(`${this.solrUrl}/smart-search/select`, {
        params: {
          q: `symbols.name:*${query}*`,
          rows: 50,
          wt: 'json'
        }
      });

      const docs = response.data.response.docs;

      return docs.flatMap((doc: any) => 
        doc.symbols
          .filter((symbol: any) => symbol.name.toLowerCase().includes(query.toLowerCase()))
          .map((symbol: any): SearchResult => ({
            file: doc.file,
            line: symbol.line,
            column: symbol.column,
            content: `${symbol.kind}: ${symbol.name}`,
            context: [symbol.scope],
            score: doc.score || 0
          }))
      );
    } catch (error) {
      console.error('Symbol search failed:', error);
      throw error;
    }
  }
}
