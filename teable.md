# Teable App data access

## Named query apps: teable/queries.yaml exists

These rules take precedence over all legacy SQL examples below. YAML is the sole editable query source. Do not import or call `sqlQuery()` from application code in a named-query app.

1. Read teable/queries.schema.json and schema/table-*.json; use real table/field IDs from the resource context for structured definitions.
2. Define stable App-local names such as getTodos and getTodoById under schemaVersion: 1 and queries. Structured entries use definition; complex SQL entries use mode: sql-query and fallback with explicit outputs; mode: auto requires both a structured definition and fallback.
3. Run node teable/query-tool.mjs generate --live after editing YAML, then node teable/query-tool.mjs check --live before saving. Live checks validate structured definitions; skippedLiveValidation lists queries whose SQL fallback admission is deferred to backend save/publish. Treat those entries as unverified SQL until saving succeeds. Never print tokens or record data.
4. Run node teable/query-tool.mjs lint before saving to catch duplicate or unused queries, filter/sort cross-products and size limits. Lint warnings exit 0; add --strict only when you intend to gate on them. Lint never blocks save/publish. Collapse variants with optional filter leaves, declared parameters or a parameterized sort instead of shipping a full cross-product.
5. Import { queries } from '@/lib/queries' in server-only code. Call generated query functions. Do not edit lib/queries.ts or the managed tool/schema. Never import them into client components.
6. Keep writes in server actions using createRecord/updateRecord/deleteRecord from `@/lib/teable` with field IDs. Query errors must remain visible, never become fake empty data.
7. Keep SQL fallback output aliases exact and declare parameters with parameterOrder. The trace records planned and selected query modes, including fallback reason.
8. Pages, YAML and generated files share the App version/commit. Saves and publishing reject invalid manifests or stale generated files. Do not delete the manifest to disable validation; an empty queries catalog is valid.
9. For temporary development inspection only, use `teable query inline --table-id ... --select ... --limit ...`. It writes no App files and is not runtime code.

## Legacy apps: no teable/queries.yaml

Keep existing data access. Do not introduce a manifest unless the user explicitly adopts named queries.

The following SQL reference applies ONLY to legacy apps without teable/queries.yaml. Ignore it completely in named-query apps.

# Teable Integration Guide

## ⚠️ Critical Rules

1. **Server Actions Only**: Wrap all Teable calls in `"use server"` functions
2. **Named-query Apps**: With `teable/queries.yaml`, use `@/lib/queries` for reusable reads. Do not import `sqlQuery()` in application code
3. **Legacy Apps**: Without `teable/queries.yaml`, use `sqlQuery()` with `dbTableName` and `dbFieldName` from schema
4. **Structured query scope**: v1 named queries cover single-table records and aggregates. Complex JOIN, CTE, window, pivot, or custom-expression queries use an explicit legacy fallback or remain legacy-only
5. **Double Quotes**: All SQL identifiers must use double quotes: `"schema"."table"`, `"field"`, aliases like `as "total"`. Link columns keep the case of the name they were created with (usually `"__fk_fldXXX"`); an unquoted identifier is lower-cased by PostgreSQL and fails with `column "__fk_fldxxx" does not exist`
6. **Error resilience**: Query calls throw on failure. Multi-query pages (dashboards) must use `Promise.allSettled` so one failed query doesn't crash the whole page — show error UI for failed sections, not silent empty data
7. **Rate limit (10 req/sec)**: For read-heavy / public pages, prefer Next.js ISR (see "ISR for read-heavy pages") to keep API calls flat under traffic spikes

## Quick Start

```typescript
// Server Action
"use server";
import { sqlQuery, createRecord, signAttachments, safeParseJson } from '@/lib/teable';

// Query (use dbTableName/dbFieldName from schema)
export async function getUsers() {
  const { rows } = await sqlQuery('bseXXX', 
    `SELECT "__id", "fld_name", "fld_status" FROM "bseXXX"."tbl_users" WHERE "fld_status" = 'Active' LIMIT 100`
  );
  return rows;
}

// Aggregation (no LIMIT needed; use COUNT("__id") not COUNT(*); always quote aliases)
export async function getStats() {
  const { rows } = await sqlQuery('bseXXX',
    `SELECT COUNT("__id") as "total", COALESCE(SUM(CAST("fld_amount" AS numeric)), 0) as "sum" FROM "bseXXX"."tbl_orders"`
  );
  return rows[0];
}

// Create (use field IDs)
export async function addUser(name: string) {
  return createRecord('tblXXX', { fldName: name, fldStatus: 'Active' });
}
```

## SQL Reference

| Rule | Example |
|------|---------|
| Table name | `"bseXXX"."tbl_users"` (from `dbTableName`) |
| Field name | `"fld_name"` (from `dbFieldName`) |
| Record ID | `"__id"` |
| String value | `'Active'` (single quotes) |
| Always add | `LIMIT 100` for non-aggregate queries |
| Aggregation | `COUNT("__id")` not `COUNT(*)`, always `COALESCE(SUM(...), 0)` |
| Aliases | Always double-quote: `as "total"`, `as "cnt"` |
| Number arithmetic | `CAST("fld" AS numeric)` for SUM/AVG |

### Field Type → SQL

| Type | SQL Usage |
|------|-----------|
| text | `"fld_name" = 'value'` |
| number | `CAST("fld_amount" AS numeric)` for SUM/AVG |
| checkbox | `"fld_done" = true` |
| singleSelect | `"fld_status" = 'Active'` |
| multipleSelect | `"fld_tags" @> '["tag1"]'` |
| date | `"fld_date" > '2024-01-01'` |
| attachment | Parse JSON, use `signAttachments()` |

### Link Field (Important!)

Single-value links have **two columns**: JSON (`dbFieldName`) and FK (`options.foreignKeyName`). Read the FK name from the field instead of constructing it, and note that only the side owning the foreign key holds the linked record id: there `foreignKeyName` is `__fk_<fieldId>`. On the inverse side of a two-way one-one link `foreignKeyName` is `__id` — that is the row's **own** id, so filtering it by the linked record id returns the wrong rows; read the linked id from the JSON column instead, or query the owning table and join in application code.

| Type | JSON Column | FK Column |
|------|-------------|-----------|
| Single (ManyOne/OneOne) | `{"id":"recXXX","title":"..."}` | `options.foreignKeyName` = `recXXX` when it is `"__fk_fldXXX"`; `"__id"` on the inverse side is the row's own id, not the linked one |
| Multi (OneMany/ManyMany) | `[{"id":".."},{}]` | N/A (use JSON) |

Filter a single-value link through the FK column of the side that owns it, quoted like every other identifier:

```sql
-- ✅ SELECT "__id", "fld_name" FROM "bseXXX"."tbl_tasks" WHERE "__fk_fldProject" = 'recXXX' LIMIT 100
-- ❌ WHERE __fk_fldProject = 'recXXX'   → PostgreSQL lower-cases the written name →
--    error: column "__fk_fldproject" does not exist
```

**Query mode matters:** legacy `sqlQuery()` can use PostgreSQL JOIN/CTE/window expressions when every referenced table passes the base access check and the SQL/function allowlists. Named-query v1 is single-table; use a manifest `mode: sql-query` fallback for complex reports instead of importing `sqlQuery()` from application code.

For a legacy query, this is valid when both tables are accessible:

```sql
SELECT t."__id", p."fld_name" AS "project_name"
FROM "bseXXX"."tbl_tasks" AS t
LEFT JOIN "bseXXX"."tbl_projects" AS p ON p."__id" = t."__fk_fldProject";
```

If a named-query App needs the same result, keep the SQL in the manifest fallback. The generated `@/lib/queries` client records whether it used the structured path or legacy fallback in the request trace. Application code must still use the generated query function.

Use `mode: auto` instead of `mode: sql-query` when this SQL is a temporary fallback for a future structured definition. The generated query records `planned_mode=structured`, `selected_mode=sql-query`, and `fallback_reason=unsupported_definition`.

Example manifest entry:

```yaml
queries:
  projectReport:
    mode: sql-query
    fallback:
      sql: |
        SELECT t."__id", p."fld_name" AS "project_name"
        FROM "bseXXX"."tbl_tasks" AS t
        LEFT JOIN "bseXXX"."tbl_projects" AS p
          ON p."__id" = t."__fk_fldProject"
        WHERE t."fld_status" = $1
      outputs:
        - { alias: __id, wireType: string }
        - { alias: project_name, wireType: string, nullable: true }
      parameters:
        status: { type: string }
      parameterOrder: [status]
```

**Multi-value links (use JSON within the same table):**
```sql
SELECT * FROM "bseXXX"."tbl_projects" WHERE "fld_tasks"::jsonb @> '[{"id":"recXXX"}]';
SELECT "fld_name", jsonb_array_length("fld_tasks"::jsonb) as "cnt" FROM "bseXXX"."tbl_projects";
```

### User Field

User fields: `{ id, title, email? }`. Check `isMultipleCellValue` for single vs multi.

```sql
-- Single user
SELECT "fld_assignee"::jsonb->>'id' as "user_id", "fld_assignee"::jsonb->>'title' as "user_name"
FROM "bseXXX"."tbl_tasks";

-- Multi user: check contains
SELECT * FROM "bseXXX"."tbl_tasks" WHERE "fld_members"::jsonb @> '[{"id":"usrXXX"}]';
```

## Attachments

Batch ALL attachments in ONE request:

```typescript
const { rows } = await sqlQuery(baseId, `SELECT "__id", "fld_files" FROM "bseXXX"."tbl_docs" LIMIT 50`);

// Collect all attachments (use safeParseJson from above)
const all = rows.flatMap(row => {
  const files = safeParseJson(row.fld_files) || [];
  return files.map((f: any) => ({ ...f, rowId: row.__id }));
});

// Sign once
const signed = await signAttachments(baseId, all);
```

## Write Operations

Use field IDs (`fldXXX`), not `dbFieldName`:

```typescript
await createRecord('tblXXX', { fldName: 'Task', fldStatus: 'Pending' });
await updateRecord('tblXXX', 'recXXX', { fldStatus: 'Done' });
await deleteRecord('tblXXX', 'recXXX');
```

| Type | Format |
|------|--------|
| Text | `"value"` |
| Number | `123.45` |
| Checkbox | `true` / `false` |
| Date | `"2024-01-15T00:00:00.000Z"` |
| Select | `"Option"` or `["A", "B"]` |
| User/Link | `["usrXXX"]` / `["recXXX"]` |

## ⚠️ Common Mistakes

### 1. Wrong field name
```sql
-- ❌ SELECT "Access Key" FROM ...     (uses 'name' with spaces)
-- ✅ SELECT "Access_Key" FROM ...     (uses 'dbFieldName')
```

### 2. Missing quotes
```sql
-- ❌ SELECT fld_name FROM bseXXX.users
-- ✅ SELECT "fld_name" FROM "bseXXX"."users"

-- ❌ SELECT "__id" FROM "bseXXX"."tbl_tasks" WHERE __fk_fldXxxYyy = 'recXXX'
--     PostgreSQL lower-cases the unquoted identifier → column "__fk_fldxxxyyy" does not exist
--     (names that only use lower case, like __fk_fldproject, happen to work, so this
--      breaks only the link fields whose field id contains upper-case letters)
-- ✅ SELECT "__id" FROM "bseXXX"."tbl_tasks" WHERE "__fk_fldXxxYyy" = 'recXXX'
```

### 3. Reserved words (must quote)
`"Group"`, `"Order"`, `"User"`, `"Date"`, `"Name"`, `"Status"`, `"Type"`, `"Key"`

### 4. Alias without quotes
```sql
-- ❌ SELECT "Group" as group FROM ...
-- ✅ SELECT "Group" as "group_name" FROM ...
```

### 5. Quote rule
- **Double quotes** `"..."` → identifiers (tables, fields, aliases)
- **Single quotes** `'...'` → string values

### 6. JSON field parsing
JSON fields (User, Link, Attachment) may be string OR already-parsed object. Always use safe parse:

```typescript
import { safeParseJson } from '@/lib/teable';

const user = safeParseJson(row.fld_assignee);
const attachments = safeParseJson(row.fld_files) || [];
```

### 7. COUNT(*) → use COUNT("__id")
```sql
-- ❌ COUNT(*)              (may cause permission issues)
-- ✅ COUNT("__id")         (explicit column reference)
```

### 8. Promise.all with raw sqlQuery
```typescript
// ❌ Promise.all + sqlQuery → one failure crashes all
await Promise.all([sqlQuery(...), sqlQuery(...), sqlQuery(...)]);

// ✅ Promise.allSettled → each query independent, check .status
const results = await Promise.allSettled([sqlQuery(...), sqlQuery(...), sqlQuery(...)]);
```

### 9. Silently swallowing errors
```typescript
// ❌ safeSqlQuery hides errors — user never knows something is broken
async function safeSqlQuery(sql: string) {
  try { return await sqlQuery(BASE_ID, sql); }
  catch { return { rows: [] }; }  // errors invisible!
}

// ✅ Promise.allSettled — errors are captured and shown in UI
const results = await Promise.allSettled([...]);
// results[i].status === "rejected" → show error message in that section
```

## Schema Files

`schema/table-{id}.json` contains:
- `dbTableName`: Use in SQL (e.g., `"bseXXX"."tbl_xxx"`)
- `fields[].dbFieldName`: Column name for SQL
- `fields[].id`: Field ID for write operations
- `fields[].isMultipleCellValue`: true = multi-value (link/user)
- `fields[].options.foreignKeyName`: FK column for single-value link (e.g., `"__fk_fldXXX"`)

## Runtime

Keep `<ErrorReporter />` in `app/layout.tsx`.

## Teable Resources Context

### Current Teable Project

- Project ID: `bseZ0SdYrjg6flmN52n`
- Use this `baseId` for any API that requires a project identifier

### Teable Resources Schema

All Teable table schemas are stored as JSON files under the `schema/` directory of this project.

Available tables (id → name → schema file):

- `tblD1nLq6fUGrzgifsh` → New table → `schema/table-tblD1nLq6fUGrzgifsh.json` (SQL: `"bseZ0SdYrjg6flmN52n"."tblD1nLq6fUGrzgifsh"`)
- `tblXWkuofLI3wrqN57g` → کاربران همیار لیارا → `schema/table-tblXWkuofLI3wrqN57g.json` (SQL: `"bseZ0SdYrjg6flmN52n"."tblXWkuofLI3wrqN57g"`)

