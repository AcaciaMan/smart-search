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
   * Get auto-suggestions based on indexed terms, always prioritizing the last session data
   */
  async getSuggestions(partialQuery: string, sessionId?: string, limit: number = 10): Promise<string[]> {
    if (!partialQuery || partialQuery.length < 2) {
      return [];
    }

    // If no sessionId provided, use the most recent session
    if (!sessionId) {
      const mostRecentSessionId = await this.getMostRecentSessionId();
      if (mostRecentSessionId) {
        sessionId = mostRecentSessionId;
        console.log(`No sessionId provided for suggestions, using most recent session: ${sessionId}`);
      }
    }

    console.log(`Getting suggestions for query: "${partialQuery}", sessionId: ${sessionId || 'none'}`);

    try {
      const sessionSuggestions = new Set<string>();
      const globalSuggestions = new Set<string>();

      // PRIORITY 1: Always check session data first if available
      if (sessionId) {
        try {
          console.log(`Querying session data for sessionId: ${sessionId}`);
          const sessionParams = {
            'q': `search_session_id:"${sessionId}"`, // Quote the session ID to handle special characters
            'fl': 'match_text,file_name,file_path,original_query',
            'rows': 200,
            'wt': 'json'
          };
          console.log('Session query params:', sessionParams);
          
          const sessionResponse = await axios.get(`${this.solrUrl}/smart-search-results/select`, {
            params: sessionParams
          });

          console.log(`Session query returned ${sessionResponse.data?.response?.docs?.length || 0} documents`);

          if (sessionResponse.data?.response?.docs) {
            sessionResponse.data.response.docs.forEach((doc: any) => {
              // Extract words from match_text that match the partial query
              if (doc.match_text) {
                const words = doc.match_text.match(/\b[\w"']+/g) || []; // Include quoted phrases
                words.forEach((word: string) => {
                  const cleanWord = word.replace(/^["']|["']$/g, ''); // Remove surrounding quotes
                  if (cleanWord.toLowerCase().startsWith(partialQuery.toLowerCase()) && cleanWord.length > partialQuery.length) {
                    sessionSuggestions.add(cleanWord);
                  }
                  // Also suggest with quotes for exact matches
                  if (partialQuery.startsWith('"') && cleanWord.toLowerCase().includes(partialQuery.slice(1).toLowerCase())) {
                    sessionSuggestions.add(`"${cleanWord}"`);
                  }
                });

                // Look for multi-word phrases in match_text
                const phraseMatches = doc.match_text.match(new RegExp(`\\b\\w*${partialQuery.toLowerCase()}\\w*\\b`, 'gi')) || [];
                phraseMatches.forEach((phrase: string) => {
                  if (phrase.length > partialQuery.length) {
                    sessionSuggestions.add(phrase);
                  }
                });
              }
              
              // Prioritize file names and paths from session
              if (doc.file_name && doc.file_name.toLowerCase().includes(partialQuery.toLowerCase())) {
                sessionSuggestions.add(doc.file_name);
              }
              
              // Include path components
              if (doc.file_path) {
                const pathParts = doc.file_path.split(/[/\\]/).filter((part: string) => 
                  part.toLowerCase().includes(partialQuery.toLowerCase()) && part.length > partialQuery.length
                );
                pathParts.forEach((part: string) => sessionSuggestions.add(part));
              }

              // Include the original query if it matches
              if (doc.original_query && doc.original_query.toLowerCase().includes(partialQuery.toLowerCase())) {
                sessionSuggestions.add(doc.original_query);
              }
            });
          }
        } catch (sessionError) {
          console.error('Error querying session data:', sessionError);
          if (axios.isAxiosError(sessionError)) {
            console.error('Session query error details:');
            console.error('- Status:', sessionError.response?.status);
            console.error('- Status text:', sessionError.response?.statusText);
            console.error('- Response data:', sessionError.response?.data);
            console.error('- Request URL:', sessionError.config?.url);
            console.error('- Request params:', sessionError.config?.params);
          }
          // Continue with other suggestion sources
        }
      }

      // PRIORITY 2: Get global suggestions from terms component (only if we need more)
      const remainingLimit = Math.max(0, limit - sessionSuggestions.size);
      if (remainingLimit > 0) {
        try {
          console.log(`Querying terms for: "${partialQuery}"`);
          // Escape special characters in the partial query for Solr
          const escapedQuery = partialQuery.replace(/[+\-&|!(){}\[\]^"~*?:\\\/]/g, '\\$&');
          const termsParams = {
            'terms.fl': 'match_text',
            'terms.prefix': escapedQuery.toLowerCase(),
            'terms.limit': remainingLimit * 2,
            'terms.raw': 'true',
            'wt': 'json'
          };
          console.log('Terms query params:', termsParams);
          
          // Try terms handler first, fall back to regular search if it fails
          const termsResponse = await axios.get(`${this.solrUrl}/smart-search-results/terms`, {
            params: termsParams
          });

          if (termsResponse.data?.terms?.match_text) {
            const terms = termsResponse.data.terms.match_text;
            console.log(`Terms query returned ${terms.length / 2} terms`);
            // Terms come as [term1, count1, term2, count2, ...]
            for (let i = 0; i < terms.length; i += 2) {
              const term = terms[i];
              if (term && typeof term === 'string' && term.toLowerCase().startsWith(partialQuery.toLowerCase())) {
                // Only add if not already in session suggestions
                if (!sessionSuggestions.has(term)) {
                  globalSuggestions.add(term);
                }
              }
            }
          }
        } catch (termsError) {
          console.error('Terms handler failed, trying fallback search:', termsError);
          // Fallback to regular wildcard search if terms handler not available
          try {
            const fallbackResponse = await axios.get(`${this.solrUrl}/smart-search-results/select`, {
              params: {
                'q': `match_text:${partialQuery.toLowerCase()}*`,
                'rows': remainingLimit,
                'fl': 'match_text',
                'wt': 'json'
              }
            });
            
            if (fallbackResponse.data?.response?.docs) {
              fallbackResponse.data.response.docs.forEach((doc: any) => {
                if (doc.match_text && !sessionSuggestions.has(doc.match_text)) {
                  globalSuggestions.add(doc.match_text);
                }
              });
            }
          } catch (fallbackError) {
            console.error('Fallback search also failed:', fallbackError);
          }
        }
      }

      // PRIORITY 3: Field-specific suggestions (lower priority)
      if (partialQuery.includes(':')) {
        try {
          const [field, value] = partialQuery.split(':', 2);
          if (value && value.length > 1) {
            console.log(`Getting field suggestions for field: ${field}, value: ${value}`);
            const fieldSuggestions = await this.getFieldSuggestions(field.trim(), value.trim(), Math.max(0, limit - sessionSuggestions.size - globalSuggestions.size));
            fieldSuggestions.forEach(suggestion => {
              const fullSuggestion = `${field}:${suggestion}`;
              if (!sessionSuggestions.has(fullSuggestion)) {
                globalSuggestions.add(fullSuggestion);
              }
            });
          }
        } catch (fieldError) {
          console.error('Error getting field suggestions:', fieldError);
        }
      }

      // Combine suggestions with session data first (highest priority)
      const finalSuggestions = [
        ...Array.from(sessionSuggestions),
        ...Array.from(globalSuggestions)
      ];

      return finalSuggestions
        .sort((a, b) => {
          // Prioritize exact prefix matches
          const aExact = a.toLowerCase().startsWith(partialQuery.toLowerCase());
          const bExact = b.toLowerCase().startsWith(partialQuery.toLowerCase());
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          
          // Then sort by length (shorter matches first)
          return a.length - b.length;
        })
        .slice(0, limit);

    } catch (error) {
      console.error('Error getting suggestions:', error);
      if (axios.isAxiosError(error)) {
        console.error('Axios error details:');
        console.error('- Status:', error.response?.status);
        console.error('- Status text:', error.response?.statusText);
        console.error('- Response data:', error.response?.data);
        console.error('- Request URL:', error.config?.url);
        console.error('- Request params:', error.config?.params);
      }
      return [];
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