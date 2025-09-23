import * as vscode from 'vscode';
import axios from 'axios';
import { SearchResult, SearchOptions, StoredSearchResult } from '../types';
import { HighlightService } from './highlightService';
import { SolrQueryBuilder } from './solrQueryBuilder';
import { SolrSessionManager } from './solrSessionManager';
import * as path from 'path';
import * as fs from 'fs';

export class IndexManager {
  private solrUrl: string;
  private highlightService: HighlightService;
  private queryBuilder: SolrQueryBuilder;
  private sessionManager: SolrSessionManager;

  constructor() {
    this.solrUrl = vscode.workspace.getConfiguration('smart-search').get('solrUrl', 'http://localhost:8983/solr');
    this.highlightService = new HighlightService();
    this.queryBuilder = new SolrQueryBuilder();
    this.sessionManager = new SolrSessionManager(this.solrUrl);
  }

  /**
   * Store ripgrep search results in Solr for future secondary searches
   */
  async storeSearchResults(results: SearchResult[], originalQuery: string, searchOptions: SearchOptions): Promise<string> {
    const timestamp = new Date().toISOString();
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    const storedResults: StoredSearchResult[] = results.map((result, index) => {
      const filePath = result.file;
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(fileName).toLowerCase().replace('.', '');
      
      // Get file stats if possible
      let fileSize: number | undefined;
      let fileModified: string | undefined;
      try {
        const stats = fs.statSync(filePath);
        fileSize = stats.size;
        fileModified = stats.mtime.toISOString();
      } catch (error) {
        // File may not exist or not accessible
      }

      // Extract context lines properly from ripgrep result
      const contextBefore: string[] = [];
      const contextAfter: string[] = [];
      
      if (result.context && result.context.length > 1) {
        // Find the match line in the context array
        const matchIndex = result.context.findIndex(line => line === result.content);
        
        if (matchIndex !== -1) {
          // Split context around the actual match line
          contextBefore.push(...result.context.slice(0, matchIndex));
          contextAfter.push(...result.context.slice(matchIndex + 1));
        } else {
          // If we can't find the exact match line, assume it's the last line
          // (since ripgrep searcher adds match line at the end)
          contextBefore.push(...result.context.slice(0, -1));
          // No after context in this case
        }
      }

      const storedResult = {
        id: `${sessionId}_${fileName}_line${result.line}_${index}`,
        search_session_id: sessionId,
        original_query: originalQuery,
        search_timestamp: timestamp,
        workspace_path: workspacePath,
        file_path: filePath,
        file_name: fileName,
        file_extension: fileExtension || 'txt', // Default to txt if no extension
        file_size: fileSize || 0, // Default to 0 if size unavailable
        file_modified: fileModified || timestamp, // Default to search timestamp
        line_number: result.line,
        column_number: result.column || 1, // Default to column 1 if not available
        match_text: result.content,
        match_text_raw: result.content,
        context_before: contextBefore,
        context_after: contextAfter,
        context_lines_before: contextBefore.length,
        context_lines_after: contextAfter.length,
        full_line: result.content, // This should be the full line, but ripgrep gives us the match
        full_line_raw: result.content,
        match_type: (searchOptions.useRegex ? 'regex' : 'literal') as 'regex' | 'literal' | 'glob',
        case_sensitive: searchOptions.caseSensitive || false,
        whole_word: searchOptions.wholeWord || false,
        relevance_score: Math.round(result.score * 100), // Convert to integer score
        match_count_in_file: 1, // We'll need to calculate this in the future
        ai_summary: result.summary || '', // Empty string instead of undefined
        ai_tags: result.summary ? [result.summary.split(' ').slice(0, 3).join(' ')] : [], // Empty array instead of undefined
        // Single display field for highlighting - combines all content for easy highlighting
        display_content: this.queryBuilder.createDisplayContent(result, contextBefore, contextAfter)
      };

      // Remove undefined/null values to avoid Solr issues
      Object.keys(storedResult).forEach(key => {
        const value = (storedResult as any)[key];
        if (value === undefined || value === null) {
          delete (storedResult as any)[key];
        }
      });

      return storedResult;
    });

    try {
      console.log(`Storing ${storedResults.length} search results in Solr...`);
      console.log('Sample document:', JSON.stringify(storedResults[0], null, 2));
      
      const response = await axios.post(`${this.solrUrl}/smart-search-results/update/json/docs`, storedResults, {
        headers: {
          'Content-Type': 'application/json'
        },
        params: {
          commit: true
        }
      });

      if (response.status !== 200) {
        throw new Error(`Failed to store search results in Solr: ${response.statusText}`);
      }

      console.log(`✅ Successfully stored ${storedResults.length} documents in session: ${sessionId}`);
      return sessionId;
    } catch (error) {
      console.error('Failed to store search results in Solr:', error);
      if (axios.isAxiosError(error)) {
        console.error('Request config:', error.config);
        console.error('Response status:', error.response?.status);
        console.error('Response data:', error.response?.data);
        console.error('Response headers:', error.response?.headers);
      }
      throw error;
    }
  }

  /**
   * Search within previously stored ripgrep results
   */
  async searchStoredResults(options: SearchOptions, sessionId?: string): Promise<SearchResult[]> {
    try {
      // If no sessionId provided, use the most recent session
      if (!sessionId) {
        const mostRecentSessionId = await this.sessionManager.getMostRecentSessionId();
        if (mostRecentSessionId) {
          sessionId = mostRecentSessionId;
          console.log(`No sessionId provided, using most recent session: ${sessionId}`);
        } else {
          console.log('No sessions available to search');
          return [];
        }
      }

      const queryParams = this.queryBuilder.buildSearchParams(options, sessionId);
      const response = await axios.get(`${this.solrUrl}/smart-search-results/search`, {
        params: queryParams
      });

      const docs = response.data.response.docs;
      const highlighting = response.data.highlighting || {};

      return docs.map((doc: any): SearchResult => {
        // Get simplified highlighted content from display field
        const docHighlighting = highlighting[doc.id] || {};
        const highlightedDisplayContent = docHighlighting.display_content?.[0] || doc.display_content || '';
        
        // Use original match_text for the content field (for compatibility)
        const originalContent = doc.match_text;

        // Reconstruct context from before and after arrays
        const context: string[] = [
          ...(doc.context_before || []),
          doc.full_line,
          ...(doc.context_after || [])
        ];

        return {
          file: doc.file_path,
          line: doc.line_number,
          column: doc.column_number,
          content: originalContent,
          context: context,
          score: doc.score || (doc.relevance_score / 100), // Use Solr's native score or fallback to stored relevance_score
          summary: doc.ai_summary,
          // Add the highlighted display content for the UI
          highlighted_display: highlightedDisplayContent
        };
      });
    } catch (error) {
      console.error('Error searching stored results:', error);
      throw error;
    }
  }

  /**
   * Search within previously stored ripgrep results and return detailed StoredSearchResult objects
   */
  async searchStoredResultsDetailed(options: SearchOptions, sessionId?: string): Promise<StoredSearchResult[]> {
    console.log(`Searching stored results for query: "${options.query}" in session: ${sessionId || 'auto-detect'}`);
    
    // If no sessionId provided, use the most recent session
    if (!sessionId) {
      const mostRecentSessionId = await this.sessionManager.getMostRecentSessionId();
      if (mostRecentSessionId) {
        sessionId = mostRecentSessionId;
        console.log(`No sessionId provided, using most recent session: ${sessionId}`);
      } else {
        console.log('No sessions available to search');
        return [];
      }
    }
    
    // Sanitize the query to prevent 400 errors from special characters
    const sanitizedQuery = this.queryBuilder.sanitizeQuery(options.query);
    console.log(`Original query: "${options.query}", Sanitized query: "${sanitizedQuery}"`);

    try {
      const queryParams = this.queryBuilder.buildSearchParams(options, sessionId);
      console.log(`Solr query parameters:`, queryParams);

      const response = await axios.get(`${this.solrUrl}/smart-search-results/search`, {
        params: queryParams
      });

      const docs = response.data.response.docs;
      const highlighting = response.data.highlighting || {};

      console.log(`Found ${docs.length} stored results in Solr`);
      console.log(`Highlighting data available for ${Object.keys(highlighting).length} documents`);

      // Convert docs to StoredSearchResult objects
      const storedResults: StoredSearchResult[] = docs.map((doc: any): StoredSearchResult => {
        // Get simplified highlighted content
        const docHighlighting = highlighting[doc.id] || {};
        const highlightedDisplayContent = docHighlighting.display_content?.[0] || '';
        
        return {
          id: doc.id,
          search_session_id: doc.search_session_id,
          original_query: doc.original_query,
          search_timestamp: doc.search_timestamp,
          workspace_path: doc.workspace_path,
          file_path: doc.file_path,
          file_name: doc.file_name,
          file_extension: doc.file_extension,
          file_size: doc.file_size,
          file_modified: doc.file_modified,
          line_number: doc.line_number,
          column_number: doc.column_number,
          match_text: doc.match_text,
          match_text_raw: doc.match_text_raw,
          context_before: doc.context_before || [],
          context_after: doc.context_after || [],
          context_lines_before: doc.context_lines_before,
          context_lines_after: doc.context_lines_after,
          full_line: doc.full_line,
          full_line_raw: doc.full_line_raw,
          match_type: doc.match_type || 'literal',
          case_sensitive: doc.case_sensitive || false,
          whole_word: doc.whole_word || false,
          relevance_score: doc.relevance_score || 0,
          match_count_in_file: doc.match_count_in_file || 1,
          ai_summary: doc.ai_summary,
          ai_tags: doc.ai_tags || [],
          // Add simplified highlighting content
          display_content: doc.display_content || '',
          // Add Solr's native score (fallback to stored relevance_score)
          score: doc.score || (doc.relevance_score / 100),
          // Add highlighted snippets for easy display
          snippets: highlightedDisplayContent ? [highlightedDisplayContent] : []
        };
      });

      return storedResults;
    } catch (error) {
      console.error('Error searching stored results:', error);
      
      // Enhanced error logging for debugging
      if (axios.isAxiosError(error)) {
        console.error('Axios error details:');
        console.error('- Status:', error.response?.status);
        console.error('- Status text:', error.response?.statusText);
        console.error('- Response data:', error.response?.data);
        console.error('- Request URL:', error.config?.url);
        console.error('- Request params:', error.config?.params);
        console.error('- Request method:', error.config?.method);
        
        if (error.response?.status === 400) {
          console.error('400 Bad Request - Query parameters that caused the error:');
          console.error('- Query params object:', JSON.stringify(error.config?.params, null, 2));
        }
      }
      
      if (error instanceof Error && (error as any).code === 'ECONNREFUSED') {
        throw new Error('Solr server is not running. Please start Solr and try again.');
      }
      throw error;
    }
  }

  // Delegate session management methods to SolrSessionManager
  async getStoredQueries(): Promise<string[]> {
    return this.sessionManager.getStoredQueries();
  }

  async getSearchSessions(): Promise<{ sessionId: string; query: string; timestamp: string; resultCount: number }[]> {
    return this.sessionManager.getSearchSessions();
  }

  async cleanupOldSessions(daysOld: number = 30): Promise<void> {
    return this.sessionManager.cleanupOldSessions(daysOld);
  }

  async getSuggestions(partialQuery: string, sessionId?: string, limit: number = 10): Promise<string[]> {
    return this.sessionManager.getSuggestions(partialQuery, sessionId, limit);
  }
}
