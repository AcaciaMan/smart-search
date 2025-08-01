import * as vscode from 'vscode';
import axios from 'axios';
import { SearchResult, SearchOptions, StoredSearchResult } from '../types';
import * as path from 'path';
import * as fs from 'fs';

export class IndexManager {
  private solrUrl: string;

  constructor() {
    this.solrUrl = vscode.workspace.getConfiguration('smart-search').get('solrUrl', 'http://localhost:8983/solr');
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

      // Split context into before and after
      const contextBefore: string[] = [];
      const contextAfter: string[] = [];
      if (result.context && result.context.length > 0) {
        const contextMiddle = Math.floor(result.context.length / 2);
        contextBefore.push(...result.context.slice(0, contextMiddle));
        contextAfter.push(...result.context.slice(contextMiddle + 1));
      }

      return {
        id: `${sessionId}_${fileName}_line${result.line}_${index}`,
        search_session_id: sessionId,
        original_query: originalQuery,
        search_timestamp: timestamp,
        workspace_path: workspacePath,
        file_path: filePath,
        file_name: fileName,
        file_extension: fileExtension,
        file_size: fileSize,
        file_modified: fileModified,
        line_number: result.line,
        column_number: result.column,
        match_text: result.content,
        match_text_raw: result.content,
        context_before: contextBefore,
        context_after: contextAfter,
        context_lines_before: contextBefore.length,
        context_lines_after: contextAfter.length,
        full_line: result.content, // This should be the full line, but ripgrep gives us the match
        full_line_raw: result.content,
        match_type: searchOptions.useRegex ? 'regex' : 'literal',
        case_sensitive: searchOptions.caseSensitive || false,
        whole_word: searchOptions.wholeWord || false,
        relevance_score: Math.round(result.score * 100), // Convert to integer score
        match_count_in_file: 1, // We'll need to calculate this in the future
        ai_summary: result.summary,
        ai_tags: result.summary ? [result.summary.split(' ').slice(0, 3).join(' ')] : undefined
      };
    });

    try {
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

      return sessionId;
    } catch (error) {
      console.error('Failed to store search results in Solr:', error);
      throw error;
    }
  }

  /**
   * Search within previously stored ripgrep results
   */
  async searchStoredResults(options: SearchOptions, sessionId?: string): Promise<SearchResult[]> {
    try {
      const queryParams: any = {
        q: `content_all:(${options.query}) OR code_all:(${options.query})`,
        rows: options.maxResults || 100,
        wt: 'json',
        hl: 'true',
        'hl.fl': 'match_text,full_line,context_before,context_after',
        'hl.simple.pre': '<mark>',
        'hl.simple.post': '</mark>',
        sort: 'relevance_score desc, search_timestamp desc',
        fl: '*,score'
      };

      // Filter by session if provided
      if (sessionId) {
        queryParams.fq = `search_session_id:${sessionId}`;
      }

      // Apply search options as filters
      if (options.caseSensitive !== undefined) {
        queryParams.fq = (queryParams.fq ? queryParams.fq + ' AND ' : '') + `case_sensitive:${options.caseSensitive}`;
      }

      if (options.wholeWord !== undefined) {
        queryParams.fq = (queryParams.fq ? queryParams.fq + ' AND ' : '') + `whole_word:${options.wholeWord}`;
      }

      const response = await axios.get(`${this.solrUrl}/smart-search-results/search`, {
        params: queryParams
      });

      const docs = response.data.response.docs;
      const highlighting = response.data.highlighting || {};

      return docs.map((doc: any): SearchResult => {
        // Get highlighted content if available
        const docHighlighting = highlighting[doc.id] || {};
        const highlightedContent = docHighlighting.match_text?.[0] || 
                                 docHighlighting.full_line?.[0] || 
                                 doc.match_text;

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
          content: highlightedContent,
          context: context,
          score: doc.relevance_score / 100, // Convert back to decimal
          summary: doc.ai_summary
        };
      });
    } catch (error) {
      console.error('Search in stored results failed:', error);
      throw error;
    }
  }

  /**
   * Get list of stored search queries
   */
  async getStoredQueries(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.solrUrl}/smart-search-results/select`, {
        params: {
          q: '*:*',
          rows: 0,
          wt: 'json',
          facet: 'true',
          'facet.field': 'original_query',
          'facet.limit': 50
        }
      });

      const facetFields = response.data.facet_counts?.facet_fields?.original_query || [];
      const queries: string[] = [];
      
      // Solr returns facets as [value, count, value, count, ...]
      for (let i = 0; i < facetFields.length; i += 2) {
        if (facetFields[i + 1] > 0) { // Only include queries with results
          queries.push(facetFields[i]);
        }
      }

      return queries;
    } catch (error) {
      console.error('Failed to get stored queries:', error);
      throw error;
    }
  }

  /**
   * Get list of search sessions
   */
  async getSearchSessions(): Promise<{ sessionId: string; query: string; timestamp: string; resultCount: number }[]> {
    try {
      const response = await axios.get(`${this.solrUrl}/smart-search-results/select`, {
        params: {
          q: '*:*',
          rows: 0,
          wt: 'json',
          facet: 'true',
          'facet.field': 'search_session_id',
          'facet.limit': 100
        }
      });

      const facetFields = response.data.facet_counts?.facet_fields?.search_session_id || [];
      const sessions: { sessionId: string; query: string; timestamp: string; resultCount: number }[] = [];
      
      // Get details for each session
      for (let i = 0; i < facetFields.length; i += 2) {
        const sessionId = facetFields[i];
        const resultCount = facetFields[i + 1];
        
        if (resultCount > 0) {
          // Get first document from this session to get query and timestamp
          const sessionResponse = await axios.get(`${this.solrUrl}/smart-search-results/select`, {
            params: {
              q: `search_session_id:${sessionId}`,
              rows: 1,
              wt: 'json',
              fl: 'original_query,search_timestamp',
              sort: 'search_timestamp desc'
            }
          });

          const doc = sessionResponse.data.response.docs[0];
          if (doc) {
            sessions.push({
              sessionId,
              query: doc.original_query,
              timestamp: doc.search_timestamp,
              resultCount
            });
          }
        }
      }

      return sessions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error('Failed to get search sessions:', error);
      throw error;
    }
  }

  /**
   * Delete old search sessions (cleanup)
   */
  async cleanupOldSessions(daysOld: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      const cutoffDateStr = cutoffDate.toISOString();

      await axios.post(`${this.solrUrl}/smart-search-results/update`, {
        delete: {
          query: `search_timestamp:[* TO ${cutoffDateStr}]`
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        params: {
          commit: true
        }
      });
    } catch (error) {
      console.error('Failed to cleanup old sessions:', error);
      throw error;
    }
  }
}
