import { ObjectType, Field } from "type-graphql";

@ObjectType()
class Token {
  @Field()
  tokenMint: string;
}

@ObjectType()
export class NFTVerificationResponse {
  @Field()
  hasAccess: boolean;

  @Field(() => [Token], { nullable: true })
  tokens?: Token[];
}