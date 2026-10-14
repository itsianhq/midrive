import { resolver } from "hono-openapi";
import { z } from "zod";

export const ErrorSchema = z.object({ error: z.string() });

export function json<T extends z.ZodType>(schema: T, description = "OK") {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}

const error = (description: string) => json(ErrorSchema, description);

export const errors = {
  400: error("Bad request"),
  401: error("Not signed in"),
  403: error("Forbidden"),
  404: error("Not found"),
} as const;

export const OkSchema = z.object({ ok: z.literal(true) });

export const RedirectResponse = { description: "Redirects to a short-lived S3 URL" };
