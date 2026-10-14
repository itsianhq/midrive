import { $api } from "@/lib/api/client"

export const meQuery = () => $api.queryOptions("get", "/me")

/** Current user; only used below the authenticated layout, where it's preloaded. */
export function useMe() {
  const { data } = $api.useQuery("get", "/me")
  return data!
}
