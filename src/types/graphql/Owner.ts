import { ObjectType, Field, ID, InputType } from "type-graphql";
import { Decimal } from "@prisma/client/runtime/library";
import { GraphQLDecimal } from "./scalers/Decimal";

@ObjectType()
export class Owner {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  licenseNumber?: string | null;

  @Field()
  isVerified!: boolean;

  @Field(() => GraphQLDecimal)
  totalRevenue!: Decimal;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@InputType()
export class UpdateOwnerInput {
  @Field({ nullable: true })
  companyName?: string;

  @Field({ nullable: true })
  licenseNumber?: string;

  @Field({ nullable: true })
  isVerified?: boolean;
}
