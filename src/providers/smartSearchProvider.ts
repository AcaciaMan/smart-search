import * as vscode from 'vscode';
import { SearchResult, SearchOptions } from '../types';
import { IndexManager, RipgrepSearcher, AISummaryService } from '../services';

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
      maxFiles: options?.maxFiles || vscode.workspace.getConfiguration('smart-search').get('maxFiles', 100),
      ...options
    };

    // Check if this should be a search within previous results (Solr search)
    const searchInResults = options?.searchInResults || false;
    
    let results: SearchResult[] = [];
    
    if (searchInResults) {
      // Search within previously stored ripgrep results in Solr
      try {
        results = await this.indexManager.searchStoredResults(searchOptions);
      } catch (error) {
        console.warn('Solr search in stored results failed:', error);
        vscode.window.showWarningMessage('Failed to search in stored results. Please try a new ripgrep search.');
        return [];
      }
    } else {
      // Perform fresh ripgrep search
      try {
        results = await this.ripgrepSearcher.search(searchOptions);
        
        // Store ripgrep results in Solr for future secondary searches
        if (results.length > 0) {
          await this.storeResultsInSolr(results, query, searchOptions);
        }
      } catch (error) {
        console.error('Ripgrep search failed:', error);
        vscode.window.showErrorMessage(`Search failed: ${error}`);
        return [];
      }
    }

    // Add AI summaries if enabled and we have results
    const enableAISummaries = vscode.workspace.getConfiguration('smart-search').get('enableAISummaries', true);
    if (enableAISummaries && results.length > 0) {
      results = await this.aiSummaryService.addSummaries(results);
    }

    return results;
  }

  /**
   * Store ripgrep search results in Solr for future secondary searches
   */
  private async storeResultsInSolr(results: SearchResult[], originalQuery: string, searchOptions: SearchOptions): Promise<string | undefined> {
    try {
      const sessionId = await this.indexManager.storeSearchResults(results, originalQuery, searchOptions);
      console.log(`Stored ${results.length} search results in Solr for query: "${originalQuery}" (Session: ${sessionId})`);
      return sessionId;
    } catch (error) {
      console.warn('Failed to store search results in Solr:', error);
      // Don't throw - this is not critical for the primary search functionality
      return undefined;
    }
  }

  /**
   * Search within previously stored search results
   */
  async searchWithinResults(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const searchOptions: SearchOptions = {
      query,
      ...options,
      searchInResults: true
    };
    return this.search(query, searchOptions);
  }

  /**
   * Get available search sessions (stored queries) from Solr
   */
  async getSearchSessions(): Promise<{ sessionId: string; query: string; timestamp: string; resultCount: number }[]> {
    try {
      return await this.indexManager.getSearchSessions();
    } catch (error) {
      console.warn('Failed to get search sessions:', error);
      return [];
    }
  }

  /**
   * Get stored queries (for backward compatibility)
   */
  async getStoredQueries(): Promise<string[]> {
    try {
      return await this.indexManager.getStoredQueries();
    } catch (error) {
      console.warn('Failed to get stored queries:', error);
      return [];
    }
  }

  /**
   * Search within a specific session
   */
  async searchInSession(sessionId: string, query: string, options?: SearchOptions): Promise<SearchResult[]> {
    try {
      const searchOptions: SearchOptions = {
        query,
        ...options
      };
      return await this.indexManager.searchStoredResults(searchOptions, sessionId);
    } catch (error) {
      console.warn('Failed to search in session:', error);
      return [];
    }
  }

  /**
   * Legacy method - kept for backward compatibility but not used in new workflow
   */
  async searchSymbols(query: string): Promise<SearchResult[]> {
    // This could be implemented as a specialized ripgrep search for symbols
    return this.ripgrepSearcher.searchSymbols(query);
  }
}
