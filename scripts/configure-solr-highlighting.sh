#!/bin/bash

# Solr Highlighting Verification Script for Smart Search
# Verifies that the smart-search-results core has the required schema fields
# and highlighting configuration, then runs a quick highlighting smoke test.
#
# The project's managed-schema already ships with the display_content field
# (type text_display) used for all server-side highlighting.  This script
# confirms the setup is correct — it does NOT add extra fields.
#
# Prerequisites:
#   - Solr is running (standalone mode)
#   - The smart-search-results core already exists with the project's managed-schema
#   - curl is available
#
# Usage:
#   ./scripts/configure-solr-highlighting.sh
#   SOLR_URL=http://myhost:8983/solr ./scripts/configure-solr-highlighting.sh
#
# See also: SOLR_HIGHLIGHTING_CONFIG.md

set -euo pipefail

SOLR_URL="${SOLR_URL:-http://localhost:8983/solr}"
CORE_NAME="smart-search-results"

echo "====================================================="
echo " Smart Search — Highlighting Verification"
echo "====================================================="
echo "Solr URL: $SOLR_URL"
echo "Core:     $CORE_NAME"
echo ""

# ── Prerequisite: curl ──
if ! command -v curl &>/dev/null; then
    echo "ERROR: curl not found. Please install curl."
    exit 1
fi

# ── Helper: cleanup test document on exit ──
cleanup() {
    curl -s -o /dev/null -X POST "$SOLR_URL/$CORE_NAME/update?commit=true" \
        -H "Content-Type: text/xml" \
        -d '<delete><query>id:hl-verify-1</query></delete>' 2>/dev/null || true
}
trap cleanup EXIT

# ── [1/5] Solr connectivity ──
echo "[1/5] Checking Solr connectivity..."
if ! curl -sf "$SOLR_URL/admin/info/system" >/dev/null 2>&1; then
    echo "FAIL: Cannot connect to Solr at $SOLR_URL"
    echo "Please ensure Solr is running: bin/solr start"
    exit 1
fi
echo "OK"

# ── [2/5] Core exists ──
echo "[2/5] Checking core $CORE_NAME..."
if ! curl -s "$SOLR_URL/$CORE_NAME/admin/ping" 2>/dev/null | grep -q '"status":"OK"'; then
    echo "FAIL: Core '$CORE_NAME' not found."
    echo "Create it first — see solr/README.md for instructions."
    exit 1
fi
echo "OK"

# ── [3/5] display_content field in schema ──
echo "[3/5] Verifying display_content field in schema..."
if ! curl -s "$SOLR_URL/$CORE_NAME/schema/fields/display_content" 2>/dev/null | grep -q '"display_content"'; then
    echo "FAIL: display_content field not found in schema."
    echo "The managed-schema shipped with this project should contain it."
    echo "Re-copy solr/smart-search-results/conf/managed-schema and reload."
    exit 1
fi
echo "OK"

# ── [4/5] Index test document ──
echo "[4/5] Indexing test document..."
index_response=$(curl -s -w "\n%{http_code}" -X POST \
    "$SOLR_URL/$CORE_NAME/update/json/docs?commit=true" \
    -H "Content-Type: application/json" \
    -d '[{
        "id": "hl-verify-1",
        "search_session_id": "hl-verify",
        "original_query": "function",
        "search_timestamp": "2025-01-01T00:00:00Z",
        "workspace_path": "/test",
        "file_path": "/test/app.js",
        "file_name": "app.js",
        "file_extension": "js",
        "line_number": 10,
        "match_text": "function hello() {",
        "match_text_raw": "function hello() {",
        "full_line": "function hello() {",
        "full_line_raw": "function hello() {",
        "display_content": "  const x = 1;\n>>> function hello() { <<<\n  return x;"
    }]')

http_code=$(echo "$index_response" | tail -n1)
if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
    echo "FAIL: Could not index test document (HTTP $http_code)."
    exit 1
fi
echo "OK"

# ── [5/5] Test highlighting on display_content ──
echo "[5/5] Testing highlighting on display_content..."
hl_response=$(curl -s "$SOLR_URL/$CORE_NAME/search?q=function&hl=true&hl.fl=display_content&rows=1")
if ! echo "$hl_response" | grep -q '"highlighting"'; then
    echo "FAIL: Highlighting response missing."
    exit 1
fi
echo "OK"

echo ""
echo "====================================================="
echo " All checks passed!"
echo "====================================================="
echo ""
echo "Highlighting Configuration:"
echo "  Canonical field : display_content (type: text_display)"
echo "  Highlight tags  : <mark class=\"highlight\">...</mark>"
echo "  Request handler : /search (edismax, hl=true by default)"
echo ""
echo "Configuration files:"
echo "  solr/smart-search-results/conf/managed-schema   (schema)"
echo "  solr/smart-search-results/conf/solrconfig.xml   (handlers)"
echo "  SOLR_HIGHLIGHTING_CONFIG.md                     (documentation)"
