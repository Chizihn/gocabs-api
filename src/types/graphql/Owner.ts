import { ObjectType, Field, ID, InputType } from "type-graphql";
import { Decimal } from "@prisma/client/runtime/library";
import { GraphQLDecimal } from "./scalers/Decimal";

@ObjectType()
export class Owner {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  licenseNumber?: string | null;

  @Field(() => Boolean, { nullable: true })
  isVerified?: boolean;

  @Field(() => GraphQLDecimal, { nullable: true })
  totalRevenue?: Decimal;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => Date, { nullable: true })
  updatedAt?: Date;
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
