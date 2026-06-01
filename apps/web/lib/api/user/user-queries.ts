import { mutationOptions } from "@tanstack/react-query";
import { createUser } from "./user-apis";

export function createUserMutationOptions() {
  return mutationOptions({
    mutationKey: ["user", "create"],
    mutationFn: () => createUser()
  });
}
