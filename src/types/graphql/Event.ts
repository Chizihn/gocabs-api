import { GraphQLJSONObject } from "graphql-scalars";
import {
  ObjectType,
  Field,
  ID,
  InputType,
  GraphQLISODateTime,
} from "type-graphql";
import { Shuttle } from "./Shuttle";

@ObjectType()
export class Event {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => GraphQLJSONObject)
  location!: Record<string, unknown>;

  @Field()
  eventDate!: Date;

  @Field()
  eventType!: string;

  @Field(() => String, { nullable: true })
  imageUrl?: string | null;

  @Field()
  isActive!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field(() => [Shuttle], { nullable: true })
  shuttles?: Shuttle[];
}

@InputType()
export class CreateEventInput {
  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => GraphQLJSONObject)
  location!: Record<string, unknown>;

  @Field()
  eventDate!: Date;

  @Field()
  eventType!: string;

  @Field(() => String, { nullable: true })
  imageUrl?: string;
}

@InputType()
export class UpdateEventInput {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  location?: Record<string, unknown>;

  @Field(() => GraphQLISODateTime, { nullable: true })
  eventDate?: Date;

  @Field(() => String, { nullable: true })
  eventType?: string;

  @Field(() => String, { nullable: true })
  imageUrl?: string;

  @Field(() => Boolean, { nullable: true })
  isActive?: boolean;
}
