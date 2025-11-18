import {
  ObjectType,
  Field,
  ID,
  InputType,
  registerEnumType,
} from "type-graphql";
import { NotificationType } from "@prisma/client";
import { GraphQLJSONObject } from "graphql-scalars";

registerEnumType(NotificationType, {
  name: "NotificationType",
});

@ObjectType()
export class Notification {
  @Field(() => ID)
  id!: string;

  @Field()
  userId!: string;

  @Field()
  title!: string;

  @Field()
  body!: string;

  @Field(() => NotificationType)
  type!: NotificationType;

  @Field(() => GraphQLJSONObject, { nullable: true })
  data?: Record<string, unknown>;

  @Field()
  isRead!: boolean;

  @Field({ nullable: true })
  readAt?: Date;

  @Field()
  createdAt!: Date;
}

@InputType()
export class MarkNotificationReadInput {
  @Field()
  notificationId!: string;
}
