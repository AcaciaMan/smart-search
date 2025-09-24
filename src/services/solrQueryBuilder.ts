import * as vscode from 'vscode';
import { SearchResult, SearchOptions } from '../types';

/**
 * Handles Solr query building, sanitization, and parameter construction
 */
export class SolrQueryBuilder {
  /**
   * Build comprehensive search parameters for Solr queries
   */
  buildSearchParams(options: SearchOptions, sessionId?: string): Record<string, any> {
    const queryParams: any = {
      q: this.buildSolrQuery(options.query),
      rows: 1000, // Large default limit - filtering happens at file level
      wt: 'json',
      hl: 'true',
      'hl.fl': 'display_content',
      'hl.simple.pre': '<mark class="highlight">',
      'hl.simple.post': '</mark>',
      'hl.fragsize': 300,
      'hl.snippets': 1,
      sort: 'score desc, search_timestamp desc',
      fl: '*,score'
    };

    // Add session filter if provided
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

    return queryParams;
  }

  /**
   * Sanitize query string for Solr to prevent 400 errors
   */
  sanitizeQuery(query: string): string {
    if (!query || typeof query !== 'string') {
      return '*';
    }
    
    // Escape special Solr characters that could cause 400 errors
    // Solr special characters: + - && || ! ( ) { } [ ] ^ " ~ * ? : \ /
    const escapedQuery = query
      .replace(/[+\-&|!(){}\[\]^"~*?:\\\/]/g, '\\$&')
      .trim();
    
    // If query becomes empty after escaping, use wildcard
    return escapedQuery || '*';
  }

  /**
   * Build Solr query - supports both default field search and custom field queries
   * 
   * This method provides flexible query building:
   * 1. Simple queries (e.g., "function") are automatically expanded to search configured default fields
   * 2. Field-specific queries (e.g., "file_name:*.js") are passed through with sanitization
   * 
   * Examples:
   * - Simple: "test" → "content_all:(test) OR code_all:(test)"
   * - Field-specific: "file_name:*.js" → "file_name:*.js"  
   * - Complex: "match_text:function AND file_extension:js" → "match_text:function AND file_extension:js"
   * - Range: "relevance_score:[50 TO *]" → "relevance_score:[50 TO *]"
   * - Boolean: "error AND NOT deprecated" → "content_all:(error AND NOT deprecated) OR code_all:(error AND NOT deprecated)"
   * 
   * Configuration:
   * - Default fields are controlled by 'smart-search.defaultSolrFields' setting
   * - Default: "content_all,code_all" 
   * - Can be customized to any combination of indexed fields
   * 
   * Available Fields:
   * - Content: content_all, code_all, match_text, full_line, ai_summary, display_content
   * - Files: file_name, file_path, file_extension  
   * - Metadata: line_number, column_number, relevance_score, file_size, match_count_in_file
   * - Session: search_session_id, original_query, search_timestamp, file_modified, workspace_path
   * - Boolean: case_sensitive, whole_word
   * - Tags: ai_tags, match_type
   * 
   * Query Detection:
   * - Detects field specifications using regex: /\w+:/
   * - Ignores quoted strings that start with quotes
   * - Sanitizes special characters to prevent Solr errors
   * 
   * @param query - User's search query (simple text or field-specific syntax)
   * @returns Formatted Solr query string ready for execution
   */
  buildSolrQuery(query: string): string {
    if (!query || typeof query !== 'string') {
      return '*:*';
    }

    const trimmedQuery = query.trim();
    
    // Check if query already contains field specifications (contains colon not in quotes)
    const hasFieldSpec = /\w+:/.test(trimmedQuery) && !trimmedQuery.startsWith('"');
    
    if (hasFieldSpec) {
      // User specified custom fields - use query as-is but still sanitize individual terms
      return this.sanitizeFieldQuery(trimmedQuery);
    } else {
      // Default behavior - use smart field selection
      const fields = this.getOptimalFields(trimmedQuery);
      const sanitizedQuery = this.sanitizeQuery(trimmedQuery);
      
      if (fields.length === 0) {
        // Fallback with boost weighting - prioritize code_all for programming content
        return `content_all:(${sanitizedQuery})^1.0 OR code_all:(${sanitizedQuery})^1.5`;
      } else if (fields.length === 1) {
        // Single field
        return `${fields[0]}:(${sanitizedQuery})`;
      } else {
        // Multiple fields with OR and smart boosting
        const fieldQueries = fields.map(field => {
          // Boost code_all higher for programming-specific searches
          const boost = field === 'code_all' ? '^1.5' : field === 'content_all' ? '^1.0' : '';
          return `${field}:(${sanitizedQuery})${boost}`;
        });
        return fieldQueries.join(' OR ');
      }
    }
  }

  /**
   * Determine optimal fields based on query characteristics
   */
  private getOptimalFields(query: string): string[] {
    const config = vscode.workspace.getConfiguration('smart-search');
    const defaultFields = config.get('defaultSolrFields', 'content_all,code_all');
    
    // Check if query looks like code (contains programming patterns)
    const codePatterns = /[(){}\[\]<>;=+\-*\/\\|&^%$#@!~`]|function|class|const|let|var|if|else|for|while|return|import|export/i;
    const hasCodePattern = codePatterns.test(query);
    
    // Check if query is filename-related
    const filenamePatterns = /\.(js|ts|py|java|cpp|c|h|css|html|xml|json|yml|yaml|md|txt)$/i;
    const isFilenameQuery = filenamePatterns.test(query);
    
    if (isFilenameQuery) {
      return ['file_name', 'file_path'];
    } else if (hasCodePattern) {
      // Prioritize code field for programming queries
      return ['code_all', 'content_all'];
    } else {
      // Standard content search
      return defaultFields.split(',').map(f => f.trim()).filter(f => f);
    }
  }

  /**
   * Sanitize field-specific queries while preserving field specifications
   */
  private sanitizeFieldQuery(query: string): string {
    // Split on spaces but preserve quoted strings and field specifications
    const parts = query.match(/[^\s"']+:"[^"]*"|[^\s"']+:'[^']*'|[^\s]+/g) || [];
    
    return parts.map(part => {
      if (part.includes(':')) {
        // This is a field:value pair
        const [field, ...valueParts] = part.split(':');
        const value = valueParts.join(':');
        
        // Don't sanitize wildcard queries or quoted strings
        if (value.startsWith('"') && value.endsWith('"')) {
          return part; // Quoted string - leave as-is
        } else if (value.includes('*') || value.includes('?')) {
          return part; // Wildcard query - leave as-is
        } else {
          // Sanitize the value part
          const sanitizedValue = this.sanitizeQuery(value);
          return `${field}:${sanitizedValue}`;
        }
      } else {
        // Regular term without field specification
        return this.sanitizeQuery(part);
      }
    }).join(' ');
  }

  /**
   * Create formatted display content for highlighting
   * This combines all relevant content into a single field optimized for highlighting
   */
  createDisplayContent(result: SearchResult, contextBefore: string[], contextAfter: string[]): string {
    const parts: string[] = [];
    
    // Add context before (without line numbers for cleaner highlighting)
    contextBefore.forEach((line) => {
      parts.push(line);
    });
    
    // Add the main match line (marked prominently without line number)
    parts.push(`>>> ${result.content} <<<`);
    
    // Add context after (without line numbers for cleaner highlighting)
    contextAfter.forEach((line) => {
      parts.push(line);
    });
    
    return parts.join('\n');
  }
}