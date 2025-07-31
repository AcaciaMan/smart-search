import * as vscode from 'vscode';
import axios from 'axios';
import { SearchResult, SearchOptions, StoredSearchResult } from '../types';

export class IndexManager {
  private solrUrl: string;

  constructor() {
    this.solrUrl = vscode.workspace.getConfiguration('smart-search').get('solrUrl', 'http://localhost:8983/solr');
  }

  /**
   * Store ripgrep search results in Solr for future secondary searches
   */
  async storeSearchResults(results: SearchResult[], originalQuery: string): Promise<void> {
    const timestamp = new Date();
    const storedResults: StoredSearchResult[] = results.map((result, index) => ({
      id: `${originalQuery}-${timestamp.getTime()}-${index}`,
      originalQuery,
      timestamp,
      file: result.file,
      line: result.line,
      column: result.column,
      content: result.content,
      context: result.context,
      score: result.score,
      summary: result.summary
    }));

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
    } catch (error) {
      console.error('Failed to store search results in Solr:', error);
      throw error;
    }
  }

  /**
   * Search within previously stored ripgrep results
   */
  async searchStoredResults(options: SearchOptions): Promise<SearchResult[]> {
    try {
      const response = await axios.get(`${this.solrUrl}/smart-search-results/select`, {
        params: {
          q: `content:*${options.query}* OR context:*${options.query}*`,
          rows: options.maxResults || 100,
          wt: 'json',
          hl: 'true',
          'hl.fl': 'content,context',
          'hl.simple.pre': '<mark>',
          'hl.simple.post': '</mark>',
          sort: 'score desc,timestamp desc'
        }
      });

      const docs = response.data.response.docs;
      const highlighting = response.data.highlighting || {};

      return docs.map((doc: any): SearchResult => ({
        file: doc.file,
        line: doc.line,
        column: doc.column,
        content: doc.content,
        context: doc.context || [],
        score: doc.score || 0,
        summary: doc.summary
      }));
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
          'facet.field': 'originalQuery',
          'facet.limit': 50
        }
      });

      const facetFields = response.data.facet_counts?.facet_fields?.originalQuery || [];
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
}
