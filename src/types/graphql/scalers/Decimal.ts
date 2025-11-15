import { GraphQLScalarType, Kind, ValueNode } from "graphql";
import { Decimal } from "@prisma/client/runtime/library";

export const GraphQLDecimal = new GraphQLScalarType({
  name: "Decimal",
  description:
    "The `Decimal` scalar type to represent decimal values with high precision",

  serialize(value: unknown): string {
    if (value instanceof Decimal) {
      return value.toString();
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return value.toString();
    }
    throw new Error(`Value cannot be serialized as Decimal: ${value}`);
  },

  parseValue(value: unknown): Decimal {
    if (typeof value !== "string") {
      throw new Error(`Value is not a string: ${value}`);
    }
    return new Decimal(value);
  },

  parseLiteral(ast: ValueNode): Decimal {
    if (ast.kind !== Kind.STRING) {
      throw new Error(
        `Can only parse strings to Decimal but got a: ${ast.kind}`
      );
    }
    return new Decimal(ast.value);
  },
});
