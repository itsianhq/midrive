import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: Outlet,
    notFoundComponent: () => (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <Button nativeButton={false} render={<Link to="/drive" />}>
          Go to My Drive
        </Button>
      </div>
    ),
  }
)
