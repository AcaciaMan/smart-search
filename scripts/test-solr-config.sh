#!/bin/bash

# Test script to verify Solr configuration
# Creates the smart-search-results core using the project's custom schema,
# indexes a test document, and verifies queries and highlighting.
#
# Prerequisites:
#   - Solr 9.x is running in standalone mode
#   - curl is available
#   - Run from the project root directory
#   - SOLR_HOME is set (or auto-detected)
#
# Usage:
#   ./scripts/test-solr-config.sh
#   SOLR_URL=http://myhost:8983/solr ./scripts/test-solr-config.sh
#
# Cleanup:
#   bin/solr delete -c smart-search-results

set -euo pipefail

SOLR_URL="${SOLR_URL:-http://localhost:8983/solr}"
CORE_NAME="smart-search-results"

echo "Testing Solr Configuration..."
echo "Solr URL:  $SOLR_URL"
echo "Core Name: $CORE_NAME"
echo ""

# ── Prerequisite checks ──

if ! command -v curl &>/dev/null; then
    echo "ERROR: curl not found. Please install curl."
    exit 1
fi

# Check if Solr is running
check_solr() {
    echo "Checking if Solr is running..."
    if curl -s "$SOLR_URL/admin/info/system" >/dev/null 2>&1; then
        echo "OK - Solr is running"
        return 0
    else
        echo "ERROR: Solr is not running at $SOLR_URL"
        echo "Please start Solr: bin/solr start"
        return 1
    fi
}

# Delete existing core (for clean testing)
delete_core() {
    echo "Deleting existing core (if present)..."
    curl -s "$SOLR_URL/admin/cores?action=UNLOAD&core=$CORE_NAME&deleteIndex=true&deleteDataDir=true&deleteInstanceDir=true" >/dev/null 2>&1 || true
    echo "Done (errors are normal if core did not exist)"
}

# Copy config and create core using the project's schema
create_core() {
    local config_dir="$(pwd)/solr/$CORE_NAME"

    if [ ! -d "$config_dir/conf" ]; then
        echo "ERROR: Configuration directory not found: $config_dir/conf"
        echo "Please ensure you are running this from the smart-search project root."
        return 1
    fi

    # Determine SOLR_HOME
    if [ -z "${SOLR_HOME:-}" ]; then
        # Try common locations
        for candidate in /opt/solr /usr/local/solr "$HOME/solr"; do
            if [ -d "$candidate/server/solr" ]; then
                SOLR_HOME="$candidate"
                break
            fi
        done
        if [ -z "${SOLR_HOME:-}" ]; then
            echo "ERROR: SOLR_HOME not set and could not be auto-detected."
            echo "Set SOLR_HOME to your Solr installation directory and re-run."
            echo "Example: SOLR_HOME=/opt/solr-9.4.0 ./scripts/test-solr-config.sh"
            return 1
        fi
    fi
    echo "Using SOLR_HOME: $SOLR_HOME"

    # Copy project config to Solr's core directory
    echo "Copying project configuration to Solr..."
    rm -rf "$SOLR_HOME/server/solr/$CORE_NAME"
    cp -r "$config_dir" "$SOLR_HOME/server/solr/$CORE_NAME"
    echo "OK - Configuration files copied"

    # Create core using the project's instance directory
    echo "Creating core with project's managed-schema..."
    response=$(curl -s -w "\n%{http_code}" "$SOLR_URL/admin/cores?action=CREATE&name=$CORE_NAME&instanceDir=$CORE_NAME")
    http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" -eq 200 ]; then
        echo "OK - Core created successfully"
        return 0
    else
        echo "ERROR: Failed to create core (HTTP $http_code)"
        echo "Response: $(echo "$response" | head -n -1)"
        echo "Common issues:"
        echo "  - XML syntax errors in managed-schema"
        echo "  - Missing field types or fields"
        echo "  - Solr version mismatch (requires 9.x)"
        return 1
    fi
}

# Index a test document and verify queries
test_core() {
    echo "Testing core functionality..."

    # Test basic query
    response=$(curl -s "$SOLR_URL/$CORE_NAME/select?q=*:*&rows=0")
    if echo "$response" | grep -q '"numFound"'; then
        echo "OK - Core is responding to queries"
    else
        echo "WARN: Core query test failed"
        return 1
    fi

    # Index a test document with all required fields
    echo "Indexing test document..."
    index_response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        "$SOLR_URL/$CORE_NAME/update/json/docs?commit=true" \
        -d '[{
            "id": "test_config_1",
            "search_session_id": "session_test",
            "original_query": "test",
            "search_timestamp": "2026-01-15T10:00:00Z",
            "workspace_path": "/tmp/test",
            "file_path": "/tmp/test/hello.ts",
            "file_name": "hello.ts",
            "file_extension": "ts",
            "line_number": 1,
            "column_number": 0,
            "match_text": "hello world function",
            "match_text_raw": "hello world function",
            "full_line": "export function hello() { return '\''world'\''; }",
            "full_line_raw": "export function hello() { return '\''world'\''; }",
            "context_before": [],
            "context_after": [],
            "context_lines_before": 0,
            "context_lines_after": 0,
            "match_type": "literal",
            "case_sensitive": false,
            "whole_word": false,
            "relevance_score": 80,
            "match_count_in_file": 1,
            "display_content": ">>> export function hello() { return '\''world'\''; } <<<"
        }]')

    index_code=$(echo "$index_response" | tail -n1)
    if [ "$index_code" -eq 200 ]; then
        echo "OK - Test document indexed"
    else
        echo "WARN: Failed to index test document (HTTP $index_code)"
        return 1
    fi

    # Verify the document was stored
    echo "Verifying document retrieval..."
    verify_response=$(curl -s "$SOLR_URL/$CORE_NAME/select?q=id:test_config_1&wt=json")
    if echo "$verify_response" | grep -q '"numFound":1'; then
        echo "OK - Document retrieved successfully"
    else
        echo "WARN: Document not found after indexing"
        return 1
    fi

    # Test highlighting on display_content
    echo "Testing highlighting..."
    hl_response=$(curl -s "$SOLR_URL/$CORE_NAME/select?q=function&hl=true&hl.fl=display_content&rows=1")
    if echo "$hl_response" | grep -q '"highlighting"'; then
        echo "OK - Highlighting is working"
    else
        echo "WARN: Highlighting test failed"
        return 1
    fi

    # Test the /search handler (edismax)
    echo "Testing /search handler (edismax)..."
    search_response=$(curl -s "$SOLR_URL/$CORE_NAME/search?q=hello")
    if echo "$search_response" | grep -q '"numFound"'; then
        echo "OK - /search handler works"
    else
        echo "WARN: /search handler test failed"
        return 1
    fi

    # Test ping
    echo "Testing /admin/ping..."
    ping_response=$(curl -s "$SOLR_URL/$CORE_NAME/admin/ping")
    if echo "$ping_response" | grep -q '"status":"OK"'; then
        echo "OK - Ping successful"
    else
        echo "WARN: Ping failed"
        return 1
    fi

    return 0
}

# ── Main ──
main() {
    if ! check_solr; then
        exit 1
    fi

    delete_core

    if create_core; then
        echo ""
        if test_core; then
            echo ""
            echo "All tests passed! Solr configuration is working correctly."
            echo ""
            echo "Next steps:"
            echo "  1. Start using the extension — ripgrep results will be stored in this core"
            echo "  2. Run: ./scripts/configure-solr-highlighting.sh (verify highlighting)"
            echo ""
            echo "To remove the test core:"
            echo "  bin/solr delete -c $CORE_NAME"
        else
            echo ""
            echo "Some tests failed. Check the output above."
            echo "To remove the test core: bin/solr delete -c $CORE_NAME"
            exit 1
        fi
    else
        echo ""
        echo "Failed to create core. Check the error message above."
        echo "To remove a broken core: bin/solr delete -c $CORE_NAME"
        exit 1
    fi
}

main "$@"
