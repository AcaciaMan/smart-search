# Solr Highlighting Configuration

How the Smart Search extension highlights search results using Solr
server-side highlighting with a client-side fallback.  Solr marks matching
terms inside the `display_content` field and wraps them in
`<mark class="highlight">` tags.  When Solr highlighting is unavailable
(e.g. when searching ripgrep results that haven't been indexed),
`HighlightService.highlightText()` performs the same job client-side.

## How It Works

Highlighting follows a five-step pipeline:

### 1. Indexing — build the `display_content` field

`SolrQueryBuilder.createDisplayContent()` combines context-before lines,
the match line (wrapped with `>>>` / `<<<` markers), and context-after lines
into a single text block:

```
  const x = 1;
>>> function hello() { <<<
  return x;
```

This block is stored in the `display_content` field (type `text_display`).

### 2. Query — request highlighting from Solr

`IndexManager.searchStoredResults()` (and `searchStoredResultsDetailed()`)
calls `HighlightService.buildSolrHighlightParams()` to obtain the full set
of `hl.*` parameters, then merges them into the query params built by
`SolrQueryBuilder.buildSearchParams()`:

```typescript
const queryParams = this.queryBuilder.buildSearchParams(options, sessionId);
const hlParams = this.highlightService.buildSolrHighlightParams(options);
Object.assign(queryParams, hlParams);
```

The merged params include `hl=true`, `hl.fl=display_content`, the
`<mark class="highlight">` tag pair, and tuning knobs like `hl.fragsize`,
`hl.mergeContiguous`, and `hl.usePhraseHighlighter`.

### 3. Solr response — highlighted fragments

Solr returns a `highlighting` object keyed by document ID:

```json
{
  "highlighting": {
    "doc-1": {
      "display_content": [
        "  const x = 1;\n>>> <mark class=\"highlight\">function</mark> hello() { <<<\n  return x;"
      ]
    }
  }
}
```

### 4. Merge — apply highlights to results

`IndexManager` reads `highlighting[docId].display_content[0]` and attaches
it to each result as `highlighted_display`.
`HighlightService.applySolrHighlighting()` can further merge Solr
highlights into `StoredSearchResult` objects, applying client-side fallback
for any field Solr did not highlight.

### 5. Fallback — client-side highlighting

If Solr returns no highlighting data for a document,
`HighlightService.highlightText()` performs regex-based term matching on
the raw text (see [Client-Side Fallback](#client-side-fallback) below).

## Schema Requirements

The `managed-schema` must contain the `text_display` field type and the
`display_content` field.  Both ship with the project's schema — nothing
needs to be added manually.

### Field type: `text_display`

```xml
<fieldType name="text_display" class="solr.TextField" positionIncrementGap="100">
  <analyzer type="index">
    <tokenizer class="solr.StandardTokenizerFactory"/>
    <filter class="solr.LowerCaseFilterFactory"/>
  </analyzer>
  <analyzer type="query">
    <tokenizer class="solr.StandardTokenizerFactory"/>
    <filter class="solr.LowerCaseFilterFactory"/>
  </analyzer>
</fieldType>
```

### Field: `display_content`

```xml
<field name="display_content" type="text_display" indexed="true"
       stored="true" multiValued="false"/>
```

### Design principles

| Principle | Rationale |
|-----------|-----------|
| **No stopwords** | Code search needs words like `if`, `for`, `while`, `function`, `class`. The project's `stopwords.txt` is intentionally empty — see the comments in that file. |
| **No stemming** | Exact token matching is preferred for code. `PorterStemFilterFactory` is **not** used in any field type. |
| **StandardTokenizer** | Splits on whitespace and punctuation, producing tokens that align well with programming-language identifiers. |
| **LowerCaseFilter only** | Case-insensitive matching without any other transformations. |

## solrconfig.xml Settings

Both the `/select` and `/search` request handlers ship with identical
highlighting defaults.  `IndexManager` uses the `/search` handler.  The
query-time params from `HighlightService.buildSolrHighlightParams()`
override these defaults, so the handler config mainly serves as
documentation and a safety net.

```xml
<requestHandler name="/search" class="solr.SearchHandler">
  <lst name="defaults">
    <str name="hl">true</str>
    <str name="hl.fl">display_content</str>
    <str name="hl.simple.pre">&lt;mark class="highlight"&gt;</str>
    <str name="hl.simple.post">&lt;/mark&gt;</str>
    <int name="hl.fragsize">300</int>
    <int name="hl.snippets">1</int>
    <str name="hl.mergeContiguous">true</str>
    <str name="hl.highlightMultiTerm">true</str>
    <str name="hl.usePhraseHighlighter">true</str>
    <int name="hl.maxAnalyzedChars">500000</int>
  </lst>
</requestHandler>
```

## Customization

All highlighting parameters are centralised in
`HighlightService.buildSolrHighlightParams()`.  To change highlighting
behaviour, modify that method or pass a custom `HighlightOptions` object.

| Parameter | Default | Effect |
|-----------|---------|--------|
| `hl.fragsize` | `300` (handler) / `150` (HighlightService `fragmentSize`) | Maximum fragment size in characters. Larger values return more context around each match. |
| `hl.snippets` | `1` (handler) / `3` (HighlightService `maxFragments`) | Number of highlighted fragments to return per field. |
| `hl.simple.pre` / `hl.simple.post` | `<mark class="highlight">` / `</mark>` | The HTML tags wrapped around matched terms. Change in `HighlightService.defaultOptions` to keep client-side and server-side tags in sync. |
| `hl.maxAnalyzedChars` | `500000` | Maximum characters Solr will analyze per field for highlighting. Increase if `display_content` values are very long and highlights are being cut off. |
| `hl.mergeContiguous` | `true` | Merges adjacent highlighted terms into a single `<mark>` tag. |
| `hl.highlightMultiTerm` | `true` | Enables highlighting for wildcard, fuzzy, and range queries. |
| `hl.usePhraseHighlighter` | `true` | Highlights phrase queries as a unit rather than individual terms. |
| `hl.alternateField` | `display_content` | Field to return when no highlights are found (raw field value). |
| `hl.requireFieldMatch` | `false` | When false, allows highlights even if the query matched on a different field. |

> **Keeping tags in sync:** The same `<mark class="highlight">` tag pair is
> used in three places — `HighlightService.defaultOptions`,
> `solrconfig.xml` handler defaults, and
> `HighlightService.highlightText()`.  If you change the tag, update all
> three to avoid inconsistent styling.

## Client-Side Fallback

`HighlightService.highlightText()` provides highlighting when Solr is
unavailable or returns no highlight data.  It is also used by
`applySolrHighlighting()` for any individual field that Solr did not
highlight.

### How it works

1. **HTML-escape** the raw text to prevent XSS injection (`escapeHtml()`
   replaces `&`, `<`, `>`, `"`, and `'` with their HTML entities).
2. **Extract search terms** from the query, stripping Solr operators
   (`AND`, `OR`, `NOT`, `+`, `-`), field prefixes (`content:`), and
   extracting quoted phrases.
3. **Build a case-insensitive regex** for each term (after HTML-escaping the
   term itself, since it is matched against the already-escaped text).
4. **Replace matches** with `<mark class="highlight">$1</mark>`.

Because the text is escaped *before* `<mark>` tags are inserted, the only
HTML in the output is the highlight tags themselves — no user-supplied
content can inject raw HTML into the webview.

### Entry points

| Method | Purpose |
|--------|---------|
| `highlightText(text, query)` | Highlight a single string. Returns HTML-safe output. |
| `applySolrHighlighting(results, highlighting, query)` | Merge Solr highlights into `StoredSearchResult[]`, falling back to `highlightText()` per field. |
| `generateSnippets(result, highlighting, query)` | Build up to 3 highlighted snippets from Solr data or client-side matching. |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No `highlighting` key in response | `hl` is false or missing | Verify `HighlightService.buildSolrHighlightParams()` is being called and merged into query params |
| `display_content` highlights are empty | Field is empty or not stored | Verify the document has a non-empty `display_content` value (`fl=display_content` in a test query) |
| Highlights use wrong tags | Stale `solrconfig.xml` defaults after editing | Reload core: `curl "http://localhost:8983/solr/admin/cores?action=RELOAD&core=smart-search-results"` |
| Highlights cut off in long files | `hl.maxAnalyzedChars` too small | Increase from 500 000 — the value is set in `HighlightService.buildSolrHighlightParams()` |
| Wrong field highlighted | `hl.fl` mismatch | Ensure `hl.fl` is `display_content` in both handler defaults and `HighlightService` |
| Client-side fallback produces no highlights | Query contains only Solr operators | `extractSearchTerms()` strips operators — a query of only `AND OR NOT` yields zero terms |

## Further Reading

- [docs/configuration.md](docs/configuration.md) — Extension settings and Solr connection
- [solr/README.md](solr/README.md) — Core setup, schema overview, maintenance
- [Solr Highlighting Guide](https://solr.apache.org/guide/solr/latest/query-guide/highlighting.html)
