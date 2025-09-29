# Advanced File Name Pattern Analysis

The Statistics Panel uses sophisticated algorithms to extract meaningful prefixes and suffixes from file names, going far beyond simple string splitting.

## Pattern Analysis Methods

### 1. **Dot-Separated Analysis**
Analyzes files with dot notation (common in many frameworks):

**Examples:**
- `user.service.ts` → Prefixes: `["user"]`, Suffixes: `["service"]`
- `auth.guard.spec.ts` → Prefixes: `["auth", "auth.guard"]`, Suffixes: `["spec", "guard.spec"]`
- `app.config.prod.js` → Prefixes: `["app", "app.config"]`, Suffixes: `["prod", "config.prod"]`

### 2. **CamelCase/PascalCase Analysis**
Splits camelCase and PascalCase identifiers:

**Examples:**
- `getUserData.js` → Prefixes: `["get", "getUser"]`, Suffixes: `["Data", "UserData"]`
- `CustomerController.cs` → Prefixes: `["Customer"]`, Suffixes: `["Controller"]`
- `handleApiResponse.ts` → Prefixes: `["handle", "handleApi"]`, Suffixes: `["Response", "ApiResponse"]`

### 3. **Underscore/Kebab-Case Analysis**
Handles underscore and hyphen-separated naming:

**Examples:**
- `user_controller.py` → Prefixes: `["user"]`, Suffixes: `["controller"]`
- `api-response-handler.js` → Prefixes: `["api", "api-response"]`, Suffixes: `["handler", "response-handler"]`
- `db_connection_pool.java` → Prefixes: `["db", "db_connection"]`, Suffixes: `["pool", "connection_pool"]`

### 4. **Common Programming Patterns**
Recognizes standard programming naming conventions:

**Prefix Patterns:**
- Action verbs: `get`, `set`, `create`, `update`, `delete`, `handle`, `process`, `validate`
- Status checkers: `is`, `has`, `can`, `should`, `will`
- Builders: `make`, `build`, `init`, `setup`, `config`
- I/O operations: `fetch`, `load`, `save`, `export`, `import`, `parse`, `render`
- Testing: `test`, `mock`, `stub`, `check`
- Common prefixes: `min`, `max`, `temp`, `old`, `new`, `base`, `main`, `core`
- Technology prefixes: `api`, `ui`, `db`, `web`, `http`, `auth`

**Suffix Patterns:**
- Architecture: `controller`, `service`, `model`, `view`, `component`, `widget`
- Utilities: `helper`, `util`, `manager`, `handler`, `processor`, `parser`
- Patterns: `builder`, `factory`, `provider`, `adapter`, `wrapper`, `decorator`
- Validation: `validator`, `formatter`, `converter`, `transformer`, `mapper`
- Middleware: `filter`, `interceptor`, `middleware`, `plugin`, `extension`
- Data: `repository`, `dao`, `dto`, `entity`, `bean`, `pojo`
- Testing: `test`, `spec`, `mock`, `stub`, `fixture`, `sample`
- Implementation: `impl`, `proxy`, `facade`, `strategy`, `command`
- UI Components: `page`, `screen`, `dialog`, `modal`, `panel`, `menu`

### 5. **Numeric Pattern Analysis**
Identifies version numbers, sequences, and numeric patterns:

**Examples:**
- `v1.2.service.js` → Prefixes: `["v"]`, Suffixes: `["v1.2"]`
- `page2.html` → Prefixes: `["page"]`
- `01_initialization.sql` → Prefixes: `["num_2digit"]`
- `userController_v3.ts` → Suffixes: `["v3"]`

## Intelligence Features

### **Filtering Logic**
- **Minimum Length**: Filters out patterns shorter than 2 characters
- **Extension Detection**: Excludes common file extensions from suffix analysis
- **Common Word Filter**: Removes overly common English words
- **Duplicate Removal**: Ensures each pattern is counted only once per file

### **Pattern Recognition**
- **Compound Patterns**: Recognizes multi-part patterns like `user.service` or `api-response-handler`
- **Case Sensitivity**: Maintains original casing while normalizing for pattern matching
- **Context Awareness**: Understands programming conventions vs. natural language

### **Statistical Relevance**
- **Frequency Analysis**: Shows patterns by occurrence count
- **Percentage Calculation**: Displays relative frequency within result set
- **Meaningful Grouping**: Groups related patterns for better insights

## Use Cases

### **Code Architecture Analysis**
- Identify naming conventions across your codebase
- Spot inconsistent naming patterns
- Understand architectural patterns (MVC, service-oriented, etc.)

### **Framework Detection**
- Recognize framework-specific naming conventions
- Identify common patterns in different technologies
- Understand project structure and organization

### **Refactoring Insights**
- Find opportunities for consistent naming
- Identify legacy patterns vs. modern conventions
- Spot areas for standardization

### **Project Understanding**
- Quickly grasp project structure from search results
- Understand team naming conventions
- Identify different functional areas of the codebase

This sophisticated analysis provides much deeper insights than simple string splitting, helping developers understand their codebase organization and naming patterns at a glance.