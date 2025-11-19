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
    if (typeof value === "string") {
      return new Decimal(value);
    }
    if (typeof value === "number") {
      return new Decimal(value.toString());
    }
    throw new Error(`Value is not a string or number: ${value}`);
  },

  parseLiteral(ast: ValueNode): Decimal {
    if (ast.kind === Kind.STRING) {
      return new Decimal(ast.value);
    }
    if (ast.kind === Kind.INT || ast.kind === Kind.FLOAT) {
      return new Decimal(ast.value);
    }
    throw new Error(
      `Can only parse strings, ints, or floats to Decimal but got a: ${ast.kind}`
    );
  },
});
