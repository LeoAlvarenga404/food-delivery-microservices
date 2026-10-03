import type { z } from 'zod';

export function parseEnvironment<Output>(
  schema: z.ZodType<Output>,
  source: NodeJS.ProcessEnv = process.env,
): Output {
  const parsed = schema.safeParse(source);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`invalid environment: ${problems.join('; ')}`);
}
