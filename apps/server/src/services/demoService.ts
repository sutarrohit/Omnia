import { ApiError } from "@/src/lib/api-error.js";
import { prisma } from "@/src/lib/prisma.js";
import type { Prisma } from "@/prisma/generated/client.js";
import type { CreateDemo, DemoFilters, PaginatedResult, UpdateDemo } from "@/src/types/types.js";
import { NOT_FOUND } from "stoker/http-status-codes";
import { NOT_FOUND as NOT_FOUND_PHRASE } from "stoker/http-status-phrases";

// Creates a new demo record, defaulting the message when none is supplied.
export async function createDemo(data: CreateDemo) {
  return await prisma.demo.create({
    data: {
      ...data,
      message: data.message ?? `Hello, ${data.name}`
    }
  });
}

// Fetches a single demo by id and throws when no record exists.
export async function getDemoById(id: string) {
  const demo = await prisma.demo.findUnique({ where: { id } });
  if (!demo) throw new ApiError(NOT_FOUND, NOT_FOUND_PHRASE, "Demo not found");
  return demo;
}

// Lists demos with optional name filtering and pagination metadata.
export async function getDemos(filters: DemoFilters): Promise<PaginatedResult<Prisma.DemoModel>> {
  const { name, page, pageSize } = filters;

  const where: Prisma.DemoWhereInput = {
    ...(name ? { name: { contains: name, mode: "insensitive" } } : {})
  };

  const [data, total] = await Promise.all([
    prisma.demo.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" }
    }),
    prisma.demo.count({ where })
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  };
}

// Updates an existing demo after confirming it exists.
export async function updateDemo(id: string, data: UpdateDemo) {
  await getDemoById(id);
  return await prisma.demo.update({ where: { id }, data });
}

// Deletes a demo after confirming it exists.
export async function deleteDemo(id: string) {
  await getDemoById(id);
  await prisma.demo.delete({ where: { id } });
}
