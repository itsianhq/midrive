import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { toast } from "sonner"

import "./index.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { errorMessage } from "@/lib/api/client"
import { setOnUploaded } from "@/lib/upload/manager"
import { routeTree } from "./routeTree.gen"

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: false, refetchOnWindowFocus: true },
  },
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return
      toast.error(errorMessage(error))
    },
    // Every write can change listings, counts and storage usage.
    onSuccess: () => queryClient.invalidateQueries(),
  }),
})

setOnUploaded(() => void queryClient.invalidateQueries())

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { silent?: boolean }
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster position="bottom-left" richColors={false} />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
)
