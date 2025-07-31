import * as vscode from 'vscode';
import { SearchResult, SearchOptions } from '../types';
import { IndexManager } from '../services/indexManager';
import { RipgrepSearcher } from '../services/ripgrepSearcher';
import { AISummaryService } from '../services/aiSummaryService';

export class SmartSearchProvider {
  private ripgrepSearcher: RipgrepSearcher;
  private aiSummaryService: AISummaryService;

  constructor(private indexManager: IndexManager) {
    this.ripgrepSearcher = new RipgrepSearcher();
    this.aiSummaryService = new AISummaryService();
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const searchOptions: SearchOptions = {
      query,
      maxResults: options?.maxResults || vscode.workspace.getConfiguration('smart-search').get('maxResults', 100),
      ...options
    };

    // First, try Solr-based search if available
    let results: SearchResult[] = [];
    
    try {
      results = await this.indexManager.search(searchOptions);
    } catch (error) {
      console.warn('Solr search failed, falling back to ripgrep:', error);
      results = await this.ripgrepSearcher.search(searchOptions);
    }

    // Add AI summaries if enabled
    const enableAISummaries = vscode.workspace.getConfiguration('smart-search').get('enableAISummaries', true);
    if (enableAISummaries && results.length > 0) {
      results = await this.aiSummaryService.addSummaries(results);
    }

    return results;
  }

  async searchSymbols(query: string): Promise<SearchResult[]> {
    return this.indexManager.searchSymbols(query);
  }
}
