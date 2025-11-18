import { Field, ObjectType } from "type-graphql";

@ObjectType()
export class BaseResponse {
  @Field()
  success: boolean;

  @Field({ nullable: true })
  message?: string;
}

@ObjectType()
export class PaginationInfo {
  @Field()
  total: number;

  @Field()
  page: number;

  @Field()
  pageSize: number;

  @Field()
  totalPages: number;
}

@ObjectType()
export class PaginatedResponse<T> extends BaseResponse {
  @Field(() => PaginationInfo)
  pagination: PaginationInfo;

  @Field(() => [Object])
  items: T[];
}
