import type { RequestHandler } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { ValidationError } from '../../domain/errors.js';

type Source = 'body' | 'query' | 'params';

/**
 * Parses one part of the request against a Zod schema and stores the typed,
 * normalised result on `res.locals[source]`. Failures become 400s with a
 * field-level breakdown the UI can show next to inputs.
 */
export function validate<T extends ZodTypeAny>(source: Source, schema: T): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      next(new ValidationError(`Invalid request ${source}`, fields));
      return;
    }
    res.locals[source] = result.data as z.infer<T>;
    next();
  };
}

export function validated<T>(res: { locals: Record<string, unknown> }, source: Source): T {
  return res.locals[source] as T;
}
