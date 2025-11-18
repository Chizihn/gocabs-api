import { ObjectType, Field, ID } from "type-graphql";
import { GraphQLDecimal } from "./scalers/Decimal";
import { Decimal } from "@prisma/client/runtime/library";

@ObjectType()
export class Payout {
  @Field(() => ID)
  id: string;

  @Field()
  stakedNFTId: string;

  @Field(() => GraphQLDecimal)
  amountUsdc: Decimal;

  @Field()
  type: string; // "REVENUE_SHARE" | "FRACTIONAL_OWNERSHIP"

  @Field({ nullable: true })
  txSignature?: string;

  @Field()
  status: string; // "PENDING" | "COMPLETED" | "FAILED"

  @Field()
  payoutDate: Date;
}
