// Generated from teable/queries.yaml. Do not edit.
import 'server-only';
import { getConfig, request } from './request';

export type QueryId = never;
export type QueryDate = {
  mode: "today" | "tomorrow" | "yesterday" | "currentWeek" | "currentMonth" | "currentYear" | "lastWeek" | "lastMonth" | "lastYear" | "nextWeekPeriod" | "nextMonthPeriod" | "nextYearPeriod" | "oneWeekAgo" | "oneWeekFromNow" | "oneMonthAgo" | "oneMonthFromNow" | "daysAgo" | "daysFromNow" | "exactDate" | "dateRange" | "exactDateTime" | "exactFormatDate" | "pastWeek" | "pastMonth" | "pastYear" | "nextWeek" | "nextMonth" | "nextYear" | "pastNumberOfDays" | "nextNumberOfDays";
  timeZone: string;
  numberOfDays?: number;
  exactDate?: string;
  exactDateEnd?: string;
};
export type QueryParameters = {

};
export type QueryRows = {

};
const definitions = {};
const fallbacks = {};

export class QueryError extends Error {
  constructor(public readonly code: string, public readonly queryId: QueryId) {
    super(`Query ${queryId} failed (${code})`);
    this.name = 'QueryError';
  }
}
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const canFallback = (code: string): boolean => code.startsWith('data_query.unsupported_');

type SqlParameter = {
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'number[]' | 'boolean[]' | 'date';
  nullable?: boolean;
  default?: unknown;
};
const isParameterMap = (value: unknown): value is Record<string, unknown> =>
  isObject(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isPlainParameterData = (value: unknown, ancestors = new WeakSet<object>()): boolean => {
  if (value === null || typeof value !== 'object') return typeof value !== 'function' && typeof value !== 'symbol';
  if (ancestors.has(value) || (!Array.isArray(value) && !isParameterMap(value))) return false;
  ancestors.add(value);
  const valid = Reflect.ownKeys(value).every((key) => {
    if (Array.isArray(value) && key === 'length') return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    return typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key) &&
      descriptor.enumerable === true && 'value' in descriptor && isPlainParameterData(descriptor.value, ancestors);
  });
  ancestors.delete(value);
  return valid;
};

const isSqlParameterValue = (type: SqlParameter['type'], value: unknown): boolean => {
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string' || type === 'boolean') return typeof value === type;
  if (type === 'date') return false;
  if (!Array.isArray(value) || value.length === 0) return false;
  const itemType = type.slice(0, -2) as 'string' | 'number' | 'boolean';
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index) || !isSqlParameterValue(itemType, value[index])) return false;
  }
  return true;
};
function bindSqlParameters(queryId: QueryId, definitions: Record<string, SqlParameter>, parameters: unknown): Map<string, unknown> {
  if (!isParameterMap(parameters) || !isPlainParameterData(parameters)) throw new QueryError('data_query.parameter_map', queryId);
  if (Object.keys(parameters).some((name) => !Object.hasOwn(definitions, name))) throw new QueryError('data_query.unknown_parameter', queryId);
  const values = new Map<string, unknown>();
  for (const [name, definition] of Object.entries(definitions)) {
    if (!Object.hasOwn(parameters, name) && !Object.hasOwn(definition, 'default')) throw new QueryError('data_query.missing_parameter', queryId);
    const value = Object.hasOwn(parameters, name) ? parameters[name] : definition.default;
    if (value === null ? !definition.nullable : !isSqlParameterValue(definition.type, value)) throw new QueryError('data_query.parameter_type', queryId);
    values.set(name, value);
  }
  return values;
}

async function executeLegacy<K extends QueryId, One extends boolean>(
  queryId: K,
  parameters: QueryParameters[K],
  one: One,
  reason: string
): Promise<One extends true ? QueryRows[K] | null : Array<QueryRows[K]>> {
  const fallback = fallbacks[queryId] as {
    sql: string;
    outputs: Array<{ alias: string; wireType: 'string' | 'numberOrString' | 'boolean' | 'unknown'; nullable: boolean }>;
    parameterOrder: string[];
    parameters: Record<string, SqlParameter>;
    plannedMode: 'structured' | 'sql-query';
    isFallback: boolean;
  } | null;
  if (!fallback) throw new QueryError('data_query.fallback_unconfigured', queryId);
  const boundParameters = bindSqlParameters(queryId, fallback.parameters, parameters);
  const values = fallback.parameterOrder.map((name) => boundParameters.get(name));
  let response: unknown;
  try {
    const { baseId } = getConfig();
    if (!baseId) throw new Error('TEABLE_BASE_ID is not configured');
    response = await request<unknown>(`/base/${encodeURIComponent(baseId)}/sql-query`, {
      method: 'POST',
      acceptErrorResponse: true,
      headers: {
        'x-teable-query-id': queryId,
        'x-teable-query-planned-mode': fallback.plannedMode,
        'x-teable-query-selected-mode': 'sql-query',
        'x-teable-query-fallback': fallback.isFallback ? 'true' : 'false',
        'x-teable-query-fallback-reason': fallback.isFallback ? reason : 'sql_query_by_design',
      },
      body: { sql: fallback.sql, ...(values.length ? { parameters: values } : {}) },
    });
  } catch {
    throw new QueryError('data_query.sql_query_transport_failed', queryId);
  }
  if (!isObject(response) || !Array.isArray(response.rows) || !response.rows.every(isObject)) {
    throw new QueryError('data_query.sql_query_invalid_response', queryId);
  }
  const rows = response.rows;
  const invalidOutput = fallback.outputs.find((output) =>
    rows.some((row) => {
      if (!Object.hasOwn(row, output.alias)) return true;
      const value = row[output.alias];
      if (value == null) return !output.nullable;
      if (output.wireType === 'string') return typeof value !== 'string';
      if (output.wireType === 'numberOrString') return typeof value !== 'number' && typeof value !== 'string';
      if (output.wireType === 'boolean') return typeof value !== 'boolean';
      return false;
    })
  );
  if (invalidOutput) throw new QueryError('data_query.sql_query_output_mismatch', queryId);
  const projectedRows = rows.map((row) =>
    Object.fromEntries(fallback.outputs.map((output) => [output.alias, row[output.alias]]))
  );
  if (one && projectedRows.length > 1) throw new QueryError('data_query.cardinality', queryId);
  return (one ? projectedRows[0] ?? null : projectedRows) as One extends true ? QueryRows[K] | null : Array<QueryRows[K]>;
}

async function execute<K extends QueryId, One extends boolean>(
  queryId: K, parameters: QueryParameters[K], one: One
): Promise<One extends true ? QueryRows[K] | null : Array<QueryRows[K]>> {
  const queryFallback = fallbacks[queryId] as { isFallback: boolean } | null;
  if (definitions[queryId] === null)
    return executeLegacy(
      queryId,
      parameters,
      one,
      queryFallback?.isFallback ? 'unsupported_definition' : 'sql_query_by_design'
    );
  let response: unknown;
  try {
    response = await request<unknown>('/v2/queries/execute', {
      method: 'POST', acceptErrorResponse: true,
      body: { queryId, definition: definitions[queryId], parameters },
    });
  } catch {
    throw new QueryError('data_query.transport_failed', queryId);
  }
  if (!isObject(response)) throw new QueryError('data_query.invalid_response', queryId);
  if (response.ok === false && isObject(response.error) && typeof response.error.code === 'string') {
    if (canFallback(response.error.code) && queryFallback)
      return executeLegacy(queryId, parameters, one, response.error.code);
    throw new QueryError(response.error.code, queryId);
  }
  if (response.ok !== true || !isObject(response.data) || !Array.isArray(response.data.rows) || !response.data.rows.every(isObject)) {
    throw new QueryError('data_query.invalid_response', queryId);
  }
  const rows = response.data.rows;
  if (one && rows.length > 1) throw new QueryError('data_query.cardinality', queryId);
  return (one ? rows[0] ?? null : rows) as One extends true ? QueryRows[K] | null : Array<QueryRows[K]>;
}

export const queries = {

};
