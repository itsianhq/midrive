import { HTTPException } from "hono/http-exception";
import { validator as baseValidator } from "hono-openapi";

type Issue = { message: string; path?: readonly (PropertyKey | { key: PropertyKey })[] };

function describe(issues: readonly Issue[]) {
  return issues
    .map((i) => {
      const path = i.path?.map((p) => (typeof p === "object" ? String(p.key) : String(p))).join(".");
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join("; ");
}

/** hono-openapi's validator, but failures use the API's `{ error: string }` shape. */
export const validator = ((target, schema, hook, options) =>
  baseValidator(
    target,
    schema,
    hook ??
      ((result) => {
        if (!result.success) {
          throw new HTTPException(400, { message: describe(result.error as readonly Issue[]) });
        }
      }),
    options,
  )) as typeof baseValidator;
