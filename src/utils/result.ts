/**
 * Result type for safe error handling without exceptions
 * Inspired by Rust's Result<T, E>
 *
 * @example
 * ```typescript
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return err('Division by zero');
 *   }
 *   return ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 * if (result.ok) {
 *   console.log('Result:', result.value);
 * } else {
 *   console.error('Error:', result.error);
 * }
 * ```
 */

/**
 * Result type representing either success (Ok) or failure (Err)
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Create a successful result
 */
export const ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
});

/**
 * Create an error result
 */
export const err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

/**
 * Unwrap result or throw error
 * @throws {Error} The error if result is Err
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw result.error;
}

/**
 * Unwrap result or return default value
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/**
 * Unwrap result or compute default value from error
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  return result.ok ? result.value : fn(result.error);
}

/**
 * Map result value if ok
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Map error value if error
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/**
 * Chain results together (flatMap/bind)
 * Useful for composing multiple operations that may fail
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/**
 * Return first error or combine successes
 */
export function combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];

  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }

  return ok(values);
}

/**
 * Check if result is Ok
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/**
 * Check if result is Err
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/**
 * Async version of Result
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Wrap async function to return Result
 * Catches any thrown errors and converts them to Err
 *
 * @example
 * ```typescript
 * const result = await wrapAsync(async () => {
 *   const response = await fetch('https://api.example.com/data');
 *   return response.json();
 * });
 *
 * if (result.ok) {
 *   console.log('Data:', result.value);
 * } else {
 *   console.error('Failed to fetch:', result.error);
 * }
 * ```
 */
export async function wrapAsync<T, E = Error>(fn: () => Promise<T>): AsyncResult<T, E> {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    return err(error as E);
  }
}

/**
 * Wrap sync function to return Result
 * Catches any thrown errors and converts them to Err
 */
export function wrap<T, E = Error>(fn: () => T): Result<T, E> {
  try {
    const value = fn();
    return ok(value);
  } catch (error) {
    return err(error as E);
  }
}

/**
 * Convert Result to Promise (useful for compatibility with async/await)
 * Resolves if Ok, rejects if Err
 */
export function toPromise<T, E>(result: Result<T, E>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
  return result.ok ? Promise.resolve(result.value) : Promise.reject(result.error);
}

/**
 * Convert Promise to Result
 * Never rejects - always returns a Result
 */
export async function fromPromise<T, E = Error>(promise: Promise<T>): AsyncResult<T, E> {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    return err(error as E);
  }
}

/**
 * Match pattern for Result (similar to Rust's match)
 * Provides exhaustive pattern matching on Result
 *
 * @example
 * ```typescript
 * const message = match(result, {
 *   ok: (value) => `Success: ${value}`,
 *   err: (error) => `Error: ${error.message}`,
 * });
 * ```
 */
export function match<T, E, R>(
  result: Result<T, E>,
  patterns: {
    ok: (value: T) => R;
    err: (error: E) => R;
  },
): R {
  return result.ok ? patterns.ok(result.value) : patterns.err(result.error);
}

/**
 * Execute side effects based on Result
 * Returns the original result for chaining
 */
export function tap<T, E>(
  result: Result<T, E>,
  patterns: {
    ok?: (value: T) => void;
    err?: (error: E) => void;
  },
): Result<T, E> {
  if (result.ok && patterns.ok) {
    patterns.ok(result.value);
  } else if (!result.ok && patterns.err) {
    patterns.err(result.error);
  }
  return result;
}
