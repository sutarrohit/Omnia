import { request } from "@/utils/request";

export interface CreateUserResponse {
  id: string;
}

export async function createUser(): Promise<CreateUserResponse> {
  return request("/users", { method: "POST" });
}
