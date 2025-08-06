export interface SearchResult {
  file: string;
  line: number;
  column: number;
  content: string;
  context: string[];
  score: number;
  summary?: string;
  submatches?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export interface SearchOptions {
  query: string;
  maxResults?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  searchInResults?: boolean; // Search within previously stored ripgrep results
  contextLines?: number; // Number of context lines to show around matches (for backward compatibility)
  contextLinesBefore?: number; // Number of context lines to show before matches
  contextLinesAfter?: number; // Number of context lines to show after matches
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
  match_count_in_file: number;
  ai_summary?: string;
  ai_tags?: string[];
}