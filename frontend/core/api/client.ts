import type { HttpClient } from "./types";

const BASE_URL = "";

class FetchHttpClient implements HttpClient {
  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${BASE_URL}${url}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return undefined as T;

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || `HTTP ${res.status}`);
    }
    return data as T;
  }

  get<T>(url: string): Promise<T> {
    return this.request<T>("GET", url);
  }

  post<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", url, body);
  }

  put<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", url, body);
  }

  del(url: string): Promise<void> {
    return this.request<void>("DELETE", url);
  }
}

export const api = new FetchHttpClient();
