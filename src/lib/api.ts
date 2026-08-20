import { NextResponse } from "next/server";
import { z } from "zod";
import { zodMessage } from "./validation";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Parse and validate a JSON request body against a Zod schema, handing back
 * the raw object alongside the typed value.
 *
 * A partial schema still applies its fields' defaults, so the parsed value
 * cannot tell a field the caller omitted from one they sent. `sent` can: it
 * answers from the body as it arrived. A PATCH-style handler needs that to
 * avoid writing defaults over columns nobody asked it to touch.
 */
export async function parseFields<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T; sent: (field: string) => boolean }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw fail("Request body must be valid JSON");
  }
  const result = schema.safeParse(body);
  if (!result.success) throw fail(zodMessage(result.error));
  const keys = new Set(
    body && typeof body === "object" ? Object.keys(body as Record<string, unknown>) : [],
  );
  return { data: result.data, sent: (field) => keys.has(field) };
}

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns the typed value, or throws a Response to short-circuit the handler.
 */
export async function parse<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  return (await parseFields(req, schema)).data;
}

/** Wrap a handler so thrown Responses and unexpected errors become clean JSON. */
export function route<A extends unknown[]>(
  handler: (req: Request, ...args: A) => Promise<Response>,
) {
  return async (req: Request, ...args: A): Promise<Response> => {
    try {
      return await handler(req, ...args);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error(e);
      // Database failures that are really about the *data* deserve words, not
      // "Internal server error" — which tells the person at the desk nothing
      // and sends them back to us.
      const text = e instanceof Error ? e.message : "";
      const message = text.includes("Unique constraint")
        ? "A record with those details already exists"
        : /Record to update not found|Record to delete does not exist|No record was found/i.test(text)
          ? "Something here was changed or removed by someone else. Reload the page and try again."
          : /Foreign key constraint/i.test(text)
            ? "This points at a record that no longer exists. Reload the page and try again."
            : "Internal server error";
      return fail(message, 500);
    }
  };
}
