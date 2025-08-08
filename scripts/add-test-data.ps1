# Add test data to Solr for highlighting testing
$solrUrl = "http://localhost:8983/solr/smart-search-results"
$sessionId = "test_session_" + (Get-Date -Format "yyyyMMdd_HHmmss")
$timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

$testData = @(
    @{
        id = "$sessionId" + "_example1_line10_0"
        search_session_id = $sessionId
        original_query = "function search"
        search_timestamp = $timestamp
        workspace_path = "c:\work\GitHub\smart-search"
        file_path = "c:\work\GitHub\smart-search\src\services\ripgrepSearcher.ts"
        file_name = "ripgrepSearcher.ts"
        file_extension = "ts"
        file_size = 5000
        file_modified = $timestamp
        line_number = 10
        column_number = 8
        match_text = "function searchInFolder(folderPath: string, options: SearchOptions)"
        match_text_raw = "function searchInFolder(folderPath: string, options: SearchOptions)"
        context_before = @(
            "import { SearchResult } from '../types';",
            "",
            "// Main search functionality"
        )
        context_after = @(
            "  return new Promise((resolve, reject) => {",
            "    // Implementation...",
            "  });"
        )
        context_lines_before = 3
        context_lines_after = 3
        full_line = "function searchInFolder(folderPath: string, options: SearchOptions): Promise<SearchResult[]> {"
        full_line_raw = "function searchInFolder(folderPath: string, options: SearchOptions): Promise<SearchResult[]> {"
        match_type = "literal"
        case_sensitive = $false
        whole_word = $false
        relevance_score = 95
        match_count_in_file = 2
        ai_summary = "TypeScript function for searching files in a folder using ripgrep"
        ai_tags = @("typescript", "function", "search")
        # Combined fields for search
        content_all = "function searchInFolder folderPath string options SearchOptions Promise SearchResult ripgrep import types Main search functionality return new Promise resolve reject Implementation"
        code_all = "function searchInFolder(folderPath: string, options: SearchOptions): Promise<SearchResult[]> { import SearchResult types Main search functionality return new Promise((resolve, reject) => { Implementation })"
        content_highlight = "function searchInFolder(folderPath: string, options: SearchOptions): Promise<SearchResult[]> { Main search functionality for ripgrep implementation"
        code_highlight = "function searchInFolder(folderPath: string, options: SearchOptions): Promise<SearchResult[]> {"
    },
    @{
        id = "$sessionId" + "_example2_line25_1"
        search_session_id = $sessionId
        original_query = "function search"
        search_timestamp = $timestamp
        workspace_path = "c:\work\GitHub\smart-search"
        file_path = "c:\work\GitHub\smart-search\src\providers\smartSearchProvider.ts"
        file_name = "smartSearchProvider.ts" 
        file_extension = "ts"
        file_size = 3500
        file_modified = $timestamp
        line_number = 25
        column_number = 12
        match_text = "async search(query: string, options?: SearchOptions)"
        match_text_raw = "async search(query: string, options?: SearchOptions)"
        context_before = @(
            "export class SmartSearchProvider {",
            "  private ripgrepSearcher: RipgrepSearcher;",
            ""
        )
        context_after = @(
            "    const searchOptions: SearchOptions = {",
            "      query,",
            "      maxResults: options?.maxResults || 100"
        )
        context_lines_before = 3
        context_lines_after = 3
        full_line = "  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {"
        full_line_raw = "  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {"
        match_type = "literal"
        case_sensitive = $false
        whole_word = $false
        relevance_score = 88
        match_count_in_file = 1
        ai_summary = "Main search method in SmartSearchProvider class"
        ai_tags = @("typescript", "async", "search", "provider")
        # Combined fields for search
        content_all = "async search query string options SearchOptions Promise SearchResult class SmartSearchProvider ripgrepSearcher searchOptions maxResults"
        code_all = "async search(query: string, options?: SearchOptions): Promise<SearchResult[]> { export class SmartSearchProvider private ripgrepSearcher RipgrepSearcher searchOptions query maxResults"
        content_highlight = "async search(query: string, options?: SearchOptions): Promise<SearchResult[]> { Main search method in SmartSearchProvider class"
        code_highlight = "async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {"
    }
)

# Convert to JSON and send to Solr
$jsonData = $testData | ConvertTo-Json -Depth 10
Write-Host "Adding test data to Solr..."
Write-Host "Session ID: $sessionId"

try {
    $response = Invoke-RestMethod -Uri "$solrUrl/update/json/docs?commit=true" -Method Post -Body $jsonData -ContentType "application/json"
    Write-Host "✅ Test data added successfully!"
    Write-Host "Response: $($response | ConvertTo-Json -Compress)"
    
    # Verify the data
    $verifyResponse = Invoke-RestMethod -Uri "$solrUrl/select?q=*:*&rows=0" -Method Get
    Write-Host "📊 Total documents in index: $($verifyResponse.response.numFound)"
    
    Write-Host ""
    Write-Host "🎯 Now you can test highlighting:"
    Write-Host "1. In your VS Code extension, check 'Search in Results'"
    Write-Host "2. Search for: function"
    Write-Host "3. Search for: search"
    Write-Host "4. Search for: async"
    Write-Host ""
    Write-Host "Session available: $sessionId"
    
} catch {
    Write-Host "❌ Error adding test data: $($_.Exception.Message)"
    Write-Host "Full error: $_"
}
