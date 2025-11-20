import { Field, ObjectType, Int, InputType, ClassType } from "type-graphql";

@ObjectType()
export class BaseResponse {
  @Field()
  success: boolean;

  @Field({ nullable: true })
  message?: string;
}

@ObjectType()
export class PaginationMeta {
  @Field(() => Int)
  totalItems!: number;

  @Field(() => Int)
  page!: number;

  @Field(() => Int)
  limit!: number;

  @Field(() => Int)
  totalPages!: number;

  @Field()
  hasNextPage: boolean;

  @Field()
  hasPreviousPage: boolean;
}

export function PaginatedResponse<TItem extends object>(
  TItemClass: ClassType<TItem>
) {
  @ObjectType()
  abstract class PaginatedResponseClass {
    @Field(() => [TItemClass])
    items: TItem[];

    @Field(() => PaginationMeta)
    pagination: PaginationMeta;
  }
  return PaginatedResponseClass;
}

@InputType()
export class SortInput {
  @Field({ defaultValue: "createdAt" })
  field: string;

  @Field(() => String, { defaultValue: "desc" })
  order: "asc" | "desc";
}

@InputType()
export class PaginationInput {
  @Field(() => Int, {
    defaultValue: 1,
    description: "Page number, starting from 1",
  })
  page: number;

  @Field(() => Int, {
    defaultValue: 10,
    description: "Number of items per page",
  })
  limit: number;
}
