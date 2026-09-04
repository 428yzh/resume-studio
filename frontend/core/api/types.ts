/** HTTP 客户端接口 — 可替换适配器（fetch/axios） */
export interface HttpClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, body?: unknown): Promise<T>;
  put<T>(url: string, body?: unknown): Promise<T>;
  del(url: string): Promise<void>;
}
