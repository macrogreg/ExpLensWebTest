# ExpLens Excel Add-in - AI Coding Guide

## Project Overview

ExpLens is an **Office.js Excel Add-in** built with **Quasar (Vue 3)** and **TypeScript**. It syncs financial transaction data from the Lunch Money API into Excel workbooks for advanced analysis. The add-in runs as a task pane inside Excel.

## Architecture & Key Components

### Office.js Integration Pattern

- All Excel interactions use `Excel.RequestContext` with the `Excel.run()` pattern
- Files interacting with Office.js must include `/// <reference types="office-js" />` at the top
- **Critical**: Batch Office.js API calls and call `await context.sync()` only when necessary for performance
    - Sync is expensive - batch operations that don't depend on each other before syncing
    - See `src/business/excel-util.ts` for `syncBlock` pattern and batching examples
- Office.js nullifies `window.history.pushState/replaceState`, so `src/router/index.ts` implements a workaround by deleting these functions to force Vue Router fallback behavior

### Business Logic (`src/business/`)

Core sync orchestration is in `sync-driver.ts`:

- `downloadData()` manages the complete sync workflow
- Creates a `SyncContext` object that bundles Excel context, sheets, tags, categories, and progress tracking
- Downloads and writes data in sequence: Tags → Categories → Transactions
- Uses singleton pattern with `isSyncInProgress` flag to prevent concurrent syncs

Key data structures:

- `IndexedMap<TKey, TValue>` (in `IndexedMap.ts`): Custom collection providing both ordered array access and keyed map access
- API types in `lunchmoney-types.ts`: `User`, `Tag`, `Category`, `Transaction`
- `transaction-tools.ts`: Metadata about transactions table structure, column specs, and APIs to work with that data
- `transactions.ts`: Implementation that uses transaction-tools metadata to participate in sync workflow and generate Excel table

### Settings & Storage (`src/composables/settings.ts`)

- Settings stored in Office document using `Office.context.document.settings` API
- API token stored separately with key `${AddInId}.v1ApiToken`
- Uses `PromiseCompletionSource` pattern to wrap Office async callbacks into promises
- Settings are initialized asynchronously but accessed synchronously via composable

### Operations Tracking System (`src/status-tracker/`)

Sophisticated logging/monitoring system structured as an **encapsulated subsystem** (future separate library):

- `OperationsTracker` creates hierarchical tracked operations with unique IDs
- `TrackedOperation` objects track start/end times, success/failure, nested operations
- Console output is captured and redirected to tracker via `ConsoleRedirect` and composables
- Used throughout for debugging, progress reporting, and error aggregation
- Access via `useStatusLog().tracker.startOperation(name, ...info)`
- **Important**: Maintain clean boundaries - avoid tight coupling with app-specific code

## File Structure & Organization

When adding new functionality:

- **Business logic**: `src/business/` - Excel interactions, data processing, sync orchestration
- **UI components**: `src/components/` - Vue components for tabs and reusable UI elements
- **Composables**: `src/composables/` - Shared reactive state and Vue composition utilities
- **Utilities**: `src/util/` - Pure helper functions (must be standalone, no app dependencies)
- **Status tracking**: `src/status-tracker/` - Logging subsystem (maintain encapsulation)
- **Router**: `src/router/` - Vue Router configuration with Office.js workarounds
- **Types**: Define API types in `src/business/lunchmoney-types.ts`, add Office.js reference at file top when needed

## Development Workflow

### Build & Run

```bash
# Development with hot reload
npm run dev
# or
quasar dev

# Production build
npm run build
# or
quasar build

# Office-specific commands
npm run office-start      # Start debugging in Excel
npm run office-stop       # Stop debugging session
npm run office-validate   # Validate manifest.xml
```

### Environment & Configuration

- Quasar config in `quasar.config.ts` with custom build env vars from `package.json` (version, name, etc.)
- Dev server runs on `http://localhost:9000` (referenced in `manifest.xml`)
- Vue Router uses **hash mode** to avoid Office.js history issues
- TypeScript with strict mode enabled

## Coding Conventions

### Code Style & Formatting

- **Indentation**: 4 spaces (no tabs)
- **Max line length**: 120 characters (Prettier configured in `.prettierrc.json`; VS Code ruler at 115 as visual guide)
- **Formatting**: Prettier with double quotes, semicolons, ES5 trailing commas, CRLF line endings
- **Linting**: ESLint with flat config (`eslint.config.js`) using Vue, TypeScript, and Quasar plugins
- Run `npm run format` to auto-format code
- Run `npm run lint` to check for linting issues

### Naming & Organization

- Sheet/table names prefixed with "EL." (e.g., `SheetNameTransactions = "EL.Transactions"`)
- Composables use `use*` prefix (`useSettings`, `useOffice`, `useStatusLog`)
- Utility modules (`src/util/`) organized by category: `format_util`, `string_util`, `id_util`
    - **Important**: Structure as reusable, standalone utilities (future separate library)
    - Avoid app-specific dependencies in utility code

### Error Handling

- `ErrorAggregator` (in `src/util/ErrorAggregator.ts`) collects multiple errors before throwing
- Operations tracker captures errors with context: `operation.setFailure(message, details)`
- Office.js operations wrapped with try-catch and sync error aggregation (see `syncBlock` in `excel-util.ts`)

### Vue Component Structure

- Main UI in `IndexPage.vue` with tab-based navigation (Sync, Analyze, Settings)
- Components organized: `AnalyzeTab.vue`, `SyncTab.vue`, `SettingsTab.vue`
- Uses Quasar components (`q-tabs`, `q-page`, `q-tab-panel`, etc.)

### Async Patterns

- `PromiseCompletionSource` utility for converting callbacks to promises
- `DelayPromise` for throttling/delays
- Office.js callbacks wrapped: `Office.context.document.settings.saveAsync((result) => {...})`

## Common Pitfalls

- **Missing Office.js reference**: Files using Excel API must include `/// <reference types="office-js" />` at the top
- **Over-syncing**: Calling `context.sync()` after every operation kills performance - batch operations first
- **Forgetting to load properties**: Office.js proxies require `.load()` before accessing properties after sync
- **Null object checks**: Use `.getItemOrNullObject()` and check `.isNullObject` instead of catching errors
- **Settings not initialized**: `useSettings()` returns a promise - await it before accessing settings
- **Breaking encapsulation**: Don't add app-specific code to `src/util/` or `src/status-tracker/` (future libraries)
- **Router history issues**: Don't try to fix Vue Router history - the workaround in `src/router/index.ts` handles it
- **Modifying EL sheets**: Users should only edit designated editable areas in auto-generated sheets

## External Dependencies

- **Lunch Money API**: Financial data source at `lunchmoney.app` (types in `lunchmoney-types.ts`)
- **Office.js**: Excel API accessed via `Excel.*` namespace
- **Quasar Framework**: UI components and build tooling (`@quasar/app-vite`)

## Data Flow

Typical sync operation follows this sequence:

1. **User initiates sync** from `SyncTab.vue` with date range
2. **Sync orchestration** in `sync-driver.ts`:
    - Creates `SyncContext` bundling Excel context, sheets, tags, categories, and progress tracking
    - Validates API token from settings
    - Ensures sheets exist in order: Transactions → Tags → Categories
3. **Sequential downloads and caching** via `fetch-tools.ts`:
    - Tags downloaded and written to "EL.Tags" sheet (`tags.ts`)
        - Tag data cached in `SyncContext.tags` for later reference
        - Sheet location metadata stored in context (for Excel formula generation)
    - Categories downloaded and written to "EL.Categories" sheet (`categories.ts`)
        - Category data cached in `SyncContext.cats` with list formula location
        - Sheet location metadata stored in context
    - Transactions downloaded and written to "EL.Transactions" sheet (`transactions.ts`)
        - Accesses previously cached tags from context when processing transaction tags
        - Uses stored sheet metadata to generate Excel cell references
4. **Excel operations** batched within `Excel.run()` contexts:
    - Create/update tables and ranges
    - Apply formatting and validation
    - Sync only when necessary for performance
5. **Progress percentage** tracked separately via `syncOperationProgressPercentage` ref (not via operations tracker)
6. **Operations tracking** logs events for debugging, but is separate from progress tracking
7. **Settings updated** with last sync timestamp and version

## Testing & Validation

- No automated tests currently, but **new code should include unit tests where appropriate**
- Manual testing via `npm run office-start` to sideload in Excel
- Office manifest validation: `npm run office-validate`
- ESLint: `npm run lint` (flat config with Vue/TypeScript plugins)
- Test command placeholder: `npm test` (returns exit 0)

## Important Notes

- Dual licensing: MIT for generic libraries, PolyForm Shield 1.0.0 for main codebase (see LICENSE.md)
- Permissions: `ReadWriteDocument` required in manifest
- Supported hosts: Workbook only (Excel)
- Do not modify auto-generated sheets with "EL." prefix outside designated editable areas
- **Meta**: When making changes that affect patterns/architecture described in this document, update this file accordingly
