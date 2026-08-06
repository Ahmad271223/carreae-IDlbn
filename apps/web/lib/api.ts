/**
 * Browser API client. Session auth rides in the httpOnly cookie
 * (credentials: include + server-side CORS with credentials). All copy shown
 * to users comes from @careerid/i18n — this layer surfaces machine codes.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: unknown,
  ) {
    super(code);
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers:
      options.body !== undefined ? { "content-type": "application/json" } : {},
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof data.code === "string" ? data.code : `HTTP_${response.status}`,
      data,
    );
  }
  return data as T;
}
