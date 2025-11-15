import { ObjectType, Field, ID, GraphQLISODateTime } from "type-graphql";
import { UserRole } from "@prisma/client";

@ObjectType()
export class User {
  @Field(() => ID)
  id: string;

  @Field(() => String, { nullable: true })
  walletAddress: string | null;

  @Field(() => String, { nullable: true })
  email: string | null;

  @Field(() => String, { nullable: true })
  phoneNumber: string | null;

  @Field(() => String, { nullable: true })
  password: string | null;

  @Field(() => UserRole)
  role: UserRole;

  @Field(() => Boolean)
  isNFTHolder: boolean;

  @Field(() => [String])
  nftTokens: string[];

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class AuthResponse {
  @Field(() => String)
  token: string;

  @Field(() => User)
  user: User;

  @Field(() => Boolean)
  isNFTHolder: boolean;
}
