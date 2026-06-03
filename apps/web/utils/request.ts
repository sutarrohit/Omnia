import { handleResponse } from "./handleResponse";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    // Send the better-auth session cookie so the API can resolve the user/org.
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options
  });

  return handleResponse(res);
}