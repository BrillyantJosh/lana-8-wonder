export function getDomainKey(): string | null {
  if (typeof window === 'undefined') return null;
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  // e.g., "uk.lana8wonder.com" -> "uk", "localhost" -> null
  if (parts.length >= 3) {
    return parts[0];
  }
  return null;
}

type FilterEntry =
  | { type: "eq"; column: string; value: unknown }
  | { type: "is"; column: string; value: unknown }
  | { type: "not"; column: string; operator: string; value: unknown }
  | { type: "in"; column: string; values: unknown[] }
  | { type: "gte"; column: string; value: unknown };

interface OrderEntry {
  column: string;
  ascending: boolean;
}

interface SelectOptions {
  count?: "exact";
  head?: boolean;
}

interface UpsertOptions {
  onConflict?: string;
}

interface SupabaseResponse<T = unknown> {
  data: T | null;
  error: { message: string; [key: string]: unknown } | null;
  count?: number;
}

class QueryBuilder<T = unknown> implements PromiseLike<SupabaseResponse<T>> {
  private _table: string;
  private _operation: "select" | "insert" | "update" | "upsert" | "delete" =
    "select";
  private _filters: FilterEntry[] = [];
  private _body: unknown = null;
  private _selectColumns: string = "*";
  private _selectOptions: SelectOptions = {};
  private _orderEntries: OrderEntry[] = [];
  private _single: boolean = false;
  private _maybeSingle: boolean = false;
  private _limit: number | null = null;
  private _upsertOptions: UpsertOptions = {};

  constructor(table: string) {
    this._table = table;
  }

  select(columns: string = "*", options?: SelectOptions): this {
    // Only set operation to "select" if no other operation (insert/update/upsert/delete) is already set.
    // When chained after .insert()/.update()/.upsert(), .select() just specifies which columns to return.
    if (this._operation === "select") {
      this._operation = "select";
    }
    this._selectColumns = columns;
    if (options) {
      this._selectOptions = options;
    }
    return this;
  }

  insert(body: Record<string, unknown> | Record<string, unknown>[]): this {
    this._operation = "insert";
    this._body = body;
    return this;
  }

  update(body: Record<string, unknown>): this {
    this._operation = "update";
    this._body = body;
    return this;
  }

  upsert(
    body: Record<string, unknown> | Record<string, unknown>[],
    options?: UpsertOptions
  ): this {
    this._operation = "upsert";
    this._body = body;
    if (options) {
      this._upsertOptions = options;
    }
    return this;
  }

  delete(): this {
    this._operation = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this._filters.push({ type: "eq", column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this._filters.push({ type: "is", column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    this._filters.push({ type: "not", column, operator, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this._filters.push({ type: "in", column, values });
    return this;
  }

  gte(column: string, value: unknown): this {
    this._filters.push({ type: "gte", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this._orderEntries.push({
      column,
      ascending: options?.ascending ?? true,
    });
    return this;
  }

  single(): this {
    this._single = true;
    return this;
  }

  maybeSingle(): this {
    this._maybeSingle = true;
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  private _buildQueryParams(): URLSearchParams {
    const params = new URLSearchParams();

    // Select columns
    if (this._selectColumns && this._selectColumns !== "*") {
      params.set("select", this._selectColumns);
    }

    // Select options
    if (this._selectOptions.count) {
      params.set("count", this._selectOptions.count);
    }
    if (this._selectOptions.head) {
      params.set("head", "true");
    }

    // Filters
    for (const filter of this._filters) {
      switch (filter.type) {
        case "eq":
          params.set(`eq_${filter.column}`, String(filter.value));
          break;
        case "is":
          params.set(`is_${filter.column}`, String(filter.value));
          break;
        case "not": {
          const f = filter as Extract<FilterEntry, { type: "not" }>;
          params.set(
            `not_${f.column}_${f.operator}_${String(f.value)}`,
            "true"
          );
          break;
        }
        case "in": {
          const f = filter as Extract<FilterEntry, { type: "in" }>;
          params.set(`in_${f.column}`, f.values.map(String).join(","));
          break;
        }
        case "gte":
          params.set(`gte_${filter.column}`, String(filter.value));
          break;
      }
    }

    // Order
    for (const entry of this._orderEntries) {
      const direction = entry.ascending ? "asc" : "desc";
      params.set("order", `${entry.column}.${direction}`);
    }

    // Single / maybeSingle
    if (this._single) {
      params.set("single", "true");
    }
    if (this._maybeSingle) {
      params.set("maybeSingle", "true");
    }

    // Limit
    if (this._limit !== null) {
      params.set("limit", String(this._limit));
    }

    // Upsert options
    if (
      this._operation === "upsert" &&
      this._upsertOptions.onConflict
    ) {
      params.set("onConflict", this._upsertOptions.onConflict);
    }

    return params;
  }

  private async _execute(): Promise<SupabaseResponse<T>> {
    const params = this._buildQueryParams();
    const queryString = params.toString();
    const url = `/api/db/${this._table}${queryString ? `?${queryString}` : ""}`;

    let method: string;
    switch (this._operation) {
      case "select":
        method = "GET";
        break;
      case "insert":
        method = "POST";
        break;
      case "update":
        method = "PUT";
        break;
      case "upsert":
        method = "PATCH";
        break;
      case "delete":
        method = "DELETE";
        break;
      default:
        method = "GET";
    }

    const domainKey = getDomainKey();
    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(domainKey ? { "X-Domain-Key": domainKey } : {}),
      },
    };

    if (
      this._body !== null &&
      (this._operation === "insert" ||
        this._operation === "update" ||
        this._operation === "upsert")
    ) {
      fetchOptions.body = JSON.stringify(this._body);
    }

    try {
      const res = await fetch(url, fetchOptions);
      const json = await res.json();

      if (!res.ok) {
        return {
          data: null,
          error: typeof json === "object" && json !== null
            ? json
            : { message: String(json) },
          ...(json?.count !== undefined ? { count: json.count } : {}),
        };
      }

      return {
        data: json.data ?? null,
        error: json.error ?? null,
        ...(json.count !== undefined ? { count: json.count } : {}),
      };
    } catch (err) {
      return {
        data: null,
        error: {
          message:
            err instanceof Error ? err.message : "Unknown fetch error",
        },
      };
    }
  }

  then<TResult1 = SupabaseResponse<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: SupabaseResponse<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
  ): Promise<TResult1 | TResult2> {
    return this._execute().then(onfulfilled, onrejected);
  }
}

function from<T = unknown>(table: string): QueryBuilder<T> {
  return new QueryBuilder<T>(table);
}

const functions = {
  async invoke<T = unknown>(
    name: string,
    options?: { body?: Record<string, unknown> }
  ): Promise<{ data: T | null; error: { message: string; [key: string]: unknown } | null }> {
    try {
      const domainKey = getDomainKey();
      const res = await fetch(`/api/${name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(domainKey ? { "X-Domain-Key": domainKey } : {}),
        },
        body: JSON.stringify(options?.body ?? {}),
      });

      const json = await res.json();

      if (!res.ok) {
        return {
          data: null,
          error: typeof json === "object" && json !== null
            ? json
            : { message: String(json) },
        };
      }

      return { data: json as T, error: null };
    } catch (err) {
      return {
        data: null,
        error: {
          message:
            err instanceof Error ? err.message : "Unknown fetch error",
        },
      };
    }
  },
};

export const api = { from, functions };
