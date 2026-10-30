const API_BASE = (
  import.meta.env.VITE_SUPABASE_URL ||
  "/api"
).replace(/\/+$/, "");

const STORAGE_KEY = "sac-digitale-local-session";

type AnyObject = Record<string, any>;

let currentSession: AnyObject | null = null;

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (
      parsed?.expires_at &&
      parsed.expires_at * 1000 > Date.now()
    ) {
      currentSession = parsed;
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
} catch {}

const authListeners = new Set<
  (event: string, session: AnyObject | null) => void
>();

function setSession(
  session: AnyObject | null,
  event = "SIGNED_IN",
) {
  currentSession = session;

  if (session) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(session),
    );
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }

  authListeners.forEach((callback) => {
    try {
      callback(event, session);
    } catch {}
  });
}

async function request(
  url: string,
  options: RequestInit = {},
) {
  const headers = new Headers(options.headers || {});

  if (currentSession?.access_token) {
    headers.set(
      "Authorization",
      `Bearer ${currentSession.access_token}`,
    );
  }

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(
    `${API_BASE}${url}`,
    {
      ...options,
      headers,
    },
  );

  let data: any = null;

  const type =
    response.headers.get("content-type") || "";

  if (type.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error ||
      data?.message ||
      `HTTP ${response.status}`;

    throw new Error(message);
  }

  return data;
}

class LocalQuery {
  private table: string;
  private operation = "select";
  private selectFields: string | null = "*";
  private values: any = null;
  private filters: AnyObject[] = [];
  private orderBy: AnyObject | null = null;
  private rowLimit: number | null = null;
  private singleMode: "single" | "maybeSingle" | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = "*") {
    this.selectFields = columns;
    return this;
  }

  insert(values: any) {
    this.operation = "insert";
    this.values = values;
    this.selectFields = null;
    return this;
  }

  update(values: any) {
    this.operation = "update";
    this.values = values;
    this.selectFields = null;
    return this;
  }

  delete() {
    this.operation = "delete";
    this.selectFields = null;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({
      op: "eq",
      column,
      value,
    });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({
      op: "neq",
      column,
      value,
    });
    return this;
  }

  is(column: string, value: any) {
    this.filters.push({
      op: "is",
      column,
      value,
    });
    return this;
  }

  not(
    column: string,
    operator: string,
    value: any,
  ) {
    this.filters.push({
      op: "not",
      column,
      operator,
      value,
    });
    return this;
  }

  in(column: string, value: any[]) {
    this.filters.push({
      op: "in",
      column,
      value,
    });
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push({
      op: "gte",
      column,
      value,
    });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push({
      op: "lte",
      column,
      value,
    });
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push({
      op: "gt",
      column,
      value,
    });
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push({
      op: "lt",
      column,
      value,
    });
    return this;
  }

  like(column: string, value: any) {
    this.filters.push({
      op: "like",
      column,
      value,
    });
    return this;
  }

  ilike(column: string, value: any) {
    this.filters.push({
      op: "ilike",
      column,
      value,
    });
    return this;
  }

  order(
    column: string,
    options: { ascending?: boolean } = {},
  ) {
    this.orderBy = {
      column,
      ascending:
        options.ascending !== false,
    };

    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  async single() {
    this.singleMode = "single";
    return this.execute();
  }

  async maybeSingle() {
    this.singleMode = "maybeSingle";
    return this.execute();
  }

  private async execute() {
    try {
      const result = await request(
        `/db/${encodeURIComponent(this.table)}/query`,
        {
          method: "POST",
          body: JSON.stringify({
            operation:
              this.operation,

            select:
              this.selectFields,

            values:
              this.values,

            filters:
              this.filters,

            order:
              this.orderBy,

            limit:
              this.rowLimit,
          }),
        },
      );

      let data = result.data ?? null;

      if (
        this.singleMode === "single"
        ||
        this.singleMode === "maybeSingle"
      ) {
        if (Array.isArray(data)) {
          data = data[0] ?? null;
        }
      }

      if (
        this.singleMode === "single" &&
        !data
      ) {
        return {
          data: null,
          error: new Error("Registro não encontrado"),
        };
      }

      return {
        data,
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error
            ? error
            : new Error(String(error)),
      };
    }
  }

  then(
    resolve: (value: any) => any,
    reject?: (reason: any) => any,
  ) {
    return this.execute().then(
      resolve,
      reject,
    );
  }
}

function storageFrom(bucket: string) {
  return {
    async upload(
      objectPath: string,
      file: File,
      _options?: AnyObject,
    ) {
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("path", objectPath);

        const result = await request(
          `/storage/${encodeURIComponent(bucket)}/upload`,
          {
            method: "POST",
            body: form,
          },
        );

        return {
          data: result.data,
          error: null,
        };
      } catch (error) {
        return {
          data: null,
          error:
            error instanceof Error
              ? error
              : new Error(String(error)),
        };
      }
    },

    getPublicUrl(objectPath: string) {
      return {
        data: {
          publicUrl:
            `${window.location.origin}${API_BASE}/storage/${encodeURIComponent(bucket)}/download?path=${encodeURIComponent(objectPath)}`,
        },
      };
    },

    async createSignedUrl(
      objectPath: string,
      _expiresIn: number,
    ) {
      return {
        data: {
          signedUrl:
            `${window.location.origin}${API_BASE}/storage/${encodeURIComponent(bucket)}/download?path=${encodeURIComponent(objectPath)}`,
        },

        error: null,
      };
    },

    async download(objectPath: string) {
      try {
        const headers = new Headers();

        if (currentSession?.access_token) {
          headers.set(
            "Authorization",
            `Bearer ${currentSession.access_token}`,
          );
        }

        const response = await fetch(
          `${API_BASE}/storage/${encodeURIComponent(bucket)}/download?path=${encodeURIComponent(objectPath)}`,
          {
            headers,
          },
        );

        if (!response.ok) {
          throw new Error(
            `Erro ao baixar arquivo (${response.status})`,
          );
        }

        return {
          data: await response.blob(),
          error: null,
        };
      } catch (error) {
        return {
          data: null,
          error:
            error instanceof Error
              ? error
              : new Error(String(error)),
        };
      }
    },

    async remove(paths: string[]) {
      try {
        const result = await request(
          `/storage/${encodeURIComponent(bucket)}/remove`,
          {
            method: "POST",
            body: JSON.stringify({
              paths,
            }),
          },
        );

        return {
          data: result.data,
          error: null,
        };
      } catch (error) {
        return {
          data: null,
          error:
            error instanceof Error
              ? error
              : new Error(String(error)),
        };
      }
    },
  };
}

export const supabase: any = {
  from(table: string) {
    return new LocalQuery(table);
  },

  auth: {
    async signInWithPassword({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) {
      try {
        const result = await request(
          "/auth/signin",
          {
            method: "POST",
            body: JSON.stringify({
              email,
              password,
            }),
          },
        );

        setSession(
          result.session,
          "SIGNED_IN",
        );

        return {
          data: {
            session:
              result.session,

            user:
              result.session?.user ?? null,
          },

          error:
            null,
        };
      } catch (error) {
        return {
          data: {
            session:
              null,

            user:
              null,
          },

          error:
            error instanceof Error
              ? error
              : new Error(String(error)),
        };
      }
    },

    async signUp({
      email,
      password,
    }: {
      email: string;
      password: string;
      options?: AnyObject;
    }) {
      try {
        const result = await request(
          "/auth/signup",
          {
            method: "POST",
            body: JSON.stringify({
              email,
              password,
            }),
          },
        );

        return {
          data:
            result,

          error:
            null,
        };
      } catch (error) {
        return {
          data:
            null,

          error:
            error instanceof Error
              ? error
              : new Error(String(error)),
        };
      }
    },

    async signOut() {
      try {
        await request(
          "/auth/signout",
          {
            method: "POST",
          },
        );
      } catch {}

      setSession(
        null,
        "SIGNED_OUT",
      );

      return {
        error:
          null,
      };
    },

    async getSession() {
      if (
        currentSession?.expires_at &&
        currentSession.expires_at * 1000 <= Date.now()
      ) {
        setSession(
          null,
          "SIGNED_OUT",
        );
      }

      return {
        data: {
          session:
            currentSession,
        },
        error:
          null,
      };
    },

    async refreshSession() {
      if (!currentSession) {
        return {
          data: {
            session: null,
          },

          error:
            new Error(
              "Sessão inexistente",
            ),
        };
      }

      try {
        const result = await request(
          "/auth/refresh",
          {
            method: "POST",
          },
        );

        setSession(
          result.session,
          "TOKEN_REFRESHED",
        );

        return {
          data: {
            session:
              result.session,
          },

          error:
            null,
        };
      } catch (error) {
        setSession(
          null,
          "SIGNED_OUT",
        );

        return {
          data: {
            session: null,
          },

          error:
            error instanceof Error
              ? error
              : new Error(String(error)),
        };
      }
    },

    onAuthStateChange(
      callback: (
        event: string,
        session: AnyObject | null,
      ) => void,
    ) {
      authListeners.add(callback);

      return {
        data: {
          subscription: {
            unsubscribe() {
              authListeners.delete(
                callback,
              );
            },
          },
        },
      };
    },
  },

  storage: {
    from:
      storageFrom,
  },

  functions: {
    async invoke(
      name: string,
      options: AnyObject = {},
    ) {
      try {
        const data = await request(
          `/functions/v1/${encodeURIComponent(name)}`,
          {
            method: "POST",
            body: JSON.stringify(
              options.body || {},
            ),
          },
        );

        return {
          data,
          error:
            null,
        };
      } catch (error) {
        return {
          data:
            null,

          error:
            error instanceof Error
              ? error
              : new Error(String(error)),
        };
      }
    },
  },

  channel(_name: string) {
    const callbacks: (() => void)[] = [];
    let timer: number | undefined;

    const channel: any = {
      on(
        _event: string,
        _filter: AnyObject,
        callback: () => void,
      ) {
        if (
          typeof callback
          ===
          "function"
        ) {
          callbacks.push(callback);
        }

        return channel;
      },

      subscribe() {
        timer = window.setInterval(
          () => {
            callbacks.forEach(
              callback => {
                try {
                  callback();
                } catch {}
              },
            );
          },
          10000,
        );

        channel.__timer = timer;

        return channel;
      },
    };

    return channel;
  },

  removeChannel(channel: any) {
    if (channel?.__timer) {
      window.clearInterval(
        channel.__timer,
      );
    }

    return Promise.resolve({
      data: null,
      error: null,
    });
  },
};
