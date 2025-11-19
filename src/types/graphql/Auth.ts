import { Field, ObjectType, InputType } from "type-graphql";

@ObjectType()
export class LoginResponse {
  @Field()
  accessToken: string;
}

@InputType()
export class AdminLoginInput {
  @Field()
  email: string;

  @Field()
  password: string;
}
