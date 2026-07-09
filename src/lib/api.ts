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
 * Parse and validate a JSON request body against a Zod schema.
 * Returns the typed value, or throws a Response to short-circuit the handler.
 */
export async function parse<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw fail("Request body must be valid JSON");
  }
  const result = schema.safeParse(body);
  if (!result.success) throw fail(zodMessage(result.error));
  return result.data;
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
      const message =
        e instanceof Error && e.message.includes("Unique constraint")
          ? "A record with those details already exists"
          : "Internal server error";
      return fail(message, 500);
    }
  };
}
