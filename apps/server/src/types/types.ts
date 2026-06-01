import { z } from "@hono/zod-openapi";

// Shape returned to clients for a single demo record.
export const DemoSchema = z.object({
  id: z.string(),
  name: z.string(),
  message: z.string().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()])
});

export const CreateDemoSchema = z.object({
  name: z.string().min(1),
  message: z.string().optional()
});

export const UpdateDemoSchema = CreateDemoSchema.partial();

export const DemoFiltersSchema = z.object({
  name: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10)
});

export type Demo = z.infer<typeof DemoSchema>;
export type CreateDemo = z.infer<typeof CreateDemoSchema>;
export type UpdateDemo = z.infer<typeof UpdateDemoSchema>;
export type DemoFilters = z.infer<typeof DemoFiltersSchema>;

// Generic envelope for paginated list endpoints.
export type PaginatedResult<T> = {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
