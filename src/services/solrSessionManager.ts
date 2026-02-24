import axios from 'axios';

/**
 * Handles Solr session management, suggestions, and query history
 */
export class SolrSessionManager {
  private solrUrl: string;

  constructor(solrUrl: string) {
    this.solrUrl = solrUrl;
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
        
        // Only include sessions with proper session ID format and positive result count
        if (resultCount > 0 && sessionId.startsWith('session_')) {
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
              query: doc.original_query || 'Unknown Query',
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
   * Get the most recent session ID
   */
  async getMostRecentSessionId(): Promise<string | null> {
    try {
      const sessions = await this.getSearchSessions();
      return sessions.length > 0 ? sessions[0].sessionId : null;
    } catch (error) {
      console.error('Failed to get most recent session:', error);
      return null;
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

  /**
   * Get auto-suggestions based on search mode.
   * - 'live' mode: suggests from ALL indexed documents across all sessions (cross-session)
   * - 'session' mode: suggests only from the specified session's documents
   */
  async getSuggestions(partialQuery: string, sessionId?: string, limit: number = 10, mode: string = 'live'): Promise<string[]> {
    if (!partialQuery || partialQuery.length < 2) {
      return [];
    }

    console.log(`Getting suggestions for query: "${partialQuery}", mode: ${mode}, sessionId: ${sessionId || 'none'}`);

    if (mode === 'session') {
      return this.getSessionSuggestions(partialQuery, sessionId, limit);
    } else {
      return this.getLiveSuggestions(partialQuery, limit);
    }
  }

  /**
   * Live search suggestions: query ALL indexed documents across all sessions.
   * Extracts rich suggestions (words, phrases, file names, paths, original queries)
   * from the entire Solr collection without any session filter.
   */
  private async getLiveSuggestions(partialQuery: string, limit: number): Promise<string[]> {
    try {
      const suggestions = new Set<string>();

      // PRIORITY 1: Rich extraction from cross-session documents
      try {
        const escapedQuery = partialQuery.replace(/[+\-&|!(){}\[\]^"~*?:\\\/]/g, '\\$&');
        console.log(`[Live] Querying all indexed documents for: "${partialQuery}"`);

        const response = await axios.get(`${this.solrUrl}/smart-search-results/select`, {
          params: {
            'q': `match_text:${escapedQuery.toLowerCase()}* OR file_name:*${escapedQuery.toLowerCase()}* OR original_query:*${escapedQuery.toLowerCase()}*`,
            'fl': 'match_text,file_name,file_path,original_query',
            'rows': 200,
            'sort': 'search_timestamp desc',
            'wt': 'json'
          }
        });

        console.log(`[Live] Cross-session query returned ${response.data?.response?.docs?.length || 0} documents`);

        if (response.data?.response?.docs) {
          this.extractSuggestionsFromDocs(response.data.response.docs, partialQuery, suggestions);
        }
      } catch (crossSessionError) {
        console.error('[Live] Cross-session query failed:', crossSessionError);
      }

      // PRIORITY 2: Terms component for additional word-level suggestions
      const remainingLimit = Math.max(0, limit - suggestions.size);
      if (remainingLimit > 0) {
        try {
          const escapedQuery = partialQuery.replace(/[+\-&|!(){}\[\]^"~*?:\\\/]/g, '\\$&');
          const termsResponse = await axios.get(`${this.solrUrl}/smart-search-results/terms`, {
            params: {
              'terms.fl': 'match_text',
              'terms.prefix': escapedQuery.toLowerCase(),
              'terms.limit': remainingLimit * 2,
              'terms.raw': 'true',
              'wt': 'json'
            }
          });

          if (termsResponse.data?.terms?.match_text) {
            const terms = termsResponse.data.terms.match_text;
            for (let i = 0; i < terms.length; i += 2) {
              const term = terms[i];
              if (term && typeof term === 'string' && term.toLowerCase().startsWith(partialQuery.toLowerCase()) && !suggestions.has(term)) {
                suggestions.add(term);
              }
            }
          }
        } catch (termsError) {
          console.error('[Live] Terms handler failed:', termsError);
        }
      }

      // PRIORITY 3: Field-specific suggestions (e.g. file_extension:ts)
      if (partialQuery.includes(':')) {
        try {
          const [field, value] = partialQuery.split(':', 2);
          if (value && value.length > 1) {
            const fieldSuggestions = await this.getFieldSuggestions(field.trim(), value.trim(), Math.max(0, limit - suggestions.size));
            fieldSuggestions.forEach(s => suggestions.add(`${field}:${s}`));
          }
        } catch (fieldError) {
          console.error('[Live] Error getting field suggestions:', fieldError);
        }
      }

      return this.sortAndLimit(Array.from(suggestions), partialQuery, limit);

    } catch (error) {
      console.error('[Live] Error getting suggestions:', error);
      this.logAxiosError(error);
      return [];
    }
  }

  /**
   * Session search suggestions: query only the specified session's documents.
   * Extracts rich suggestions (words, phrases, file names, paths) scoped to that session.
   */
  private async getSessionSuggestions(partialQuery: string, sessionId?: string, limit: number = 10): Promise<string[]> {
    // If no sessionId provided, use the most recent session
    if (!sessionId) {
      const mostRecentSessionId = await this.getMostRecentSessionId();
      if (mostRecentSessionId) {
        sessionId = mostRecentSessionId;
        console.log(`[Session] No sessionId provided, using most recent: ${sessionId}`);
      } else {
        console.log('[Session] No session available for suggestions');
        return [];
      }
    }

    try {
      const suggestions = new Set<string>();

      try {
        console.log(`[Session] Querying session data for sessionId: ${sessionId}`);
        const response = await axios.get(`${this.solrUrl}/smart-search-results/select`, {
          params: {
            'q': `search_session_id:"${sessionId}"`,
            'fl': 'match_text,file_name,file_path,original_query',
            'rows': 200,
            'wt': 'json'
          }
        });

        console.log(`[Session] Query returned ${response.data?.response?.docs?.length || 0} documents`);

        if (response.data?.response?.docs) {
          this.extractSuggestionsFromDocs(response.data.response.docs, partialQuery, suggestions);
        }
      } catch (sessionError) {
        console.error('[Session] Error querying session data:', sessionError);
        this.logAxiosError(sessionError);
      }

      // Field-specific suggestions scoped to session
      if (partialQuery.includes(':')) {
        try {
          const [field, value] = partialQuery.split(':', 2);
          if (value && value.length > 1) {
            const fieldSuggestions = await this.getFieldSuggestions(field.trim(), value.trim(), Math.max(0, limit - suggestions.size));
            fieldSuggestions.forEach(s => suggestions.add(`${field}:${s}`));
          }
        } catch (fieldError) {
          console.error('[Session] Error getting field suggestions:', fieldError);
        }
      }

      return this.sortAndLimit(Array.from(suggestions), partialQuery, limit);

    } catch (error) {
      console.error('[Session] Error getting suggestions:', error);
      this.logAxiosError(error);
      return [];
    }
  }

  /**
   * Extract rich suggestions from Solr documents (shared logic for both modes).
   * Extracts words, multi-word phrases, file names, path components, and original queries.
   */
  private extractSuggestionsFromDocs(docs: any[], partialQuery: string, suggestions: Set<string>): void {
    const lowerQuery = partialQuery.toLowerCase();

    docs.forEach((doc: any) => {
      // Extract words from match_text
      if (doc.match_text && typeof doc.match_text === 'string') {
        const words = doc.match_text.match(/\b[\w"']+/g) || [];
        words.forEach((word: string) => {
          const cleanWord = word.replace(/^["']|["']$/g, '');
          if (cleanWord.toLowerCase().startsWith(lowerQuery) && cleanWord.length > partialQuery.length) {
            suggestions.add(cleanWord);
          }
          // Suggest with quotes for exact matches
          if (partialQuery.startsWith('"') && cleanWord.toLowerCase().includes(partialQuery.slice(1).toLowerCase())) {
            suggestions.add(`"${cleanWord}"`);
          }
        });

        // Multi-word phrase matches
        try {
          const escapedForRegex = lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const phraseMatches = doc.match_text.match(new RegExp(`\\b\\w*${escapedForRegex}\\w*\\b`, 'gi')) || [];
          phraseMatches.forEach((phrase: string) => {
            if (phrase.length > partialQuery.length) {
              suggestions.add(phrase);
            }
          });
        } catch {
          // Skip if regex construction fails for unusual input
        }
      }

      // File names
      if (doc.file_name && typeof doc.file_name === 'string' && doc.file_name.toLowerCase().includes(lowerQuery)) {
        suggestions.add(doc.file_name);
      }

      // Path components
      if (doc.file_path && typeof doc.file_path === 'string') {
        const pathParts = doc.file_path.split(/[/\\]/).filter((part: string) =>
          part && typeof part === 'string' && part.toLowerCase().includes(lowerQuery) && part.length > partialQuery.length
        );
        pathParts.forEach((part: string) => suggestions.add(part));
      }

      // Original queries
      if (doc.original_query && typeof doc.original_query === 'string' && doc.original_query.toLowerCase().includes(lowerQuery)) {
        suggestions.add(doc.original_query);
      }
    });
  }

  /**
   * Sort suggestions: exact prefix matches first, then by length (shorter first).
   */
  private sortAndLimit(suggestions: string[], partialQuery: string, limit: number): string[] {
    const lowerQuery = partialQuery.toLowerCase();
    return suggestions
      .sort((a, b) => {
        const aExact = a.toLowerCase().startsWith(lowerQuery);
        const bExact = b.toLowerCase().startsWith(lowerQuery);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return a.length - b.length;
      })
      .slice(0, limit);
  }

  /**
   * Log Axios error details for debugging.
   */
  private logAxiosError(error: unknown): void {
    if (axios.isAxiosError(error)) {
      console.error('Axios error details:');
      console.error('- Status:', error.response?.status);
      console.error('- Status text:', error.response?.statusText);
      console.error('- Response data:', error.response?.data);
      console.error('- Request URL:', error.config?.url);
      console.error('- Request params:', error.config?.params);
    }
  }

  /**
   * Get suggestions for specific fields
   */
  private async getFieldSuggestions(field: string, partialValue: string, limit: number): Promise<string[]> {
    try {
      const suggestions = new Set<string>();
      
      // Use faceting to get field values
      const facetResponse = await axios.get(`${this.solrUrl}/smart-search-results/select`, {
        params: {
          'q': `${field}:${partialValue}*`,
          'rows': 0,
          'facet': 'true',
          'facet.field': field,
          'facet.limit': limit,
          'facet.mincount': 1,
          'wt': 'json'
        }
      });

      if (facetResponse.data?.facet_counts?.facet_fields?.[field]) {
        const facets = facetResponse.data.facet_counts.facet_fields[field];
        // Facets come as [value1, count1, value2, count2, ...]
        for (let i = 0; i < facets.length; i += 2) {
          const value = facets[i];
          if (value && typeof value === 'string') {
            suggestions.add(value);
          }
        }
      }

      return Array.from(suggestions);
    } catch (error) {
      console.error(`Error getting field suggestions for ${field}:`, error);
      return [];
    }
  }
}