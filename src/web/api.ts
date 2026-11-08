export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body === undefined || isForm ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new ApiError(401, "Log in first.");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `The server said ${res.status}.`);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
  del: <T>(url: string) => request<T>("DELETE", url),
};

export function photoUrl(photo: string | null): string | null {
  return photo ? `/photos/${encodeURIComponent(photo)}` : null;
}
