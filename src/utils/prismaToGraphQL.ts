// utils/prismaToGraphQL.ts
import { Decimal } from "@prisma/client/runtime/library";

// Safely convert Prisma Decimal → number
export const decimalToNumber = (decimal: Decimal | null | undefined): number => {
  return decimal ? Number(decimal.toString()) : 0;
};

// Safely convert JsonValue → object (for location, settings, etc.)
export const jsonToObject = <T>(json: any): T => {
  return (json ?? {}) as T;
};