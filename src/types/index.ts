export interface FileResult {
  file: string;
  matchCount: number;
}

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  content: string;
  context: string[];
  score: number;
  summary?: string;
  highlighted_display?: string; // Highlighted content for display purposes
  submatches?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export interface CurrentSearchGlobs {
  includeGlobs: string[];
  excludeGlobs: string[];
  customIncludeGlobs: string[];
  customExcludeGlobs: string[];
  activeFilterName?: string;
  activeFilterScope?: 'global' | 'workspace';
}

export interface SearchOptions {
  query: string;
  maxFiles?: number; // Maximum number of files to return results from (ripgrep)
  maxResults?: number; // Maximum number of results for Solr API compatibility
  includePatterns?: string[];
  excludePatterns?: string[];
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  searchInResults?: boolean; // Search within previously stored ripgrep results
  contextLines?: number; // Number of context lines to show around matches (for backward compatibility)
  contextLinesBefore?: number; // Number of context lines to show before matches
  contextLinesAfter?: number; // Number of context lines to show after matches
  currentGlobs?: CurrentSearchGlobs;
}

export interface StoredSearchResult {
  id: string;
  search_session_id: string;
  original_query: string;
  search_timestamp: string; // ISO 8601 format for Solr
  workspace_path: string;
  file_path: string;
  file_name: string;
  file_extension: string;
  file_size?: number;
  file_modified?: string;
  line_number: number;
  column_number: number;
  match_text: string;
  match_text_raw: string;
  context_before: string[];
  context_after: string[];
  context_lines_before: number;
  context_lines_after: number;
  full_line: string;
  full_line_raw: string;
  match_type: 'literal' | 'regex' | 'glob';
  case_sensitive: boolean;
  whole_word: boolean;
  relevance_score: number;
  score?: number; // Solr's native search score (0.0-1.0 range)
  match_count_in_file: number;
  ai_summary?: string;
  ai_tags?: string[];
  // Simplified highlighting field
  display_content?: string; // Formatted content ready for highlighting display
  // Enhanced highlighting fields (legacy)
  context_before_highlighted?: string[];
  context_after_highlighted?: string[];
  snippets?: string[];
}