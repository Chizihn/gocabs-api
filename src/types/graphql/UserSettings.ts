import { ObjectType, Field, InputType } from "type-graphql";

@ObjectType()
export class NotificationSettings {
  @Field(() => Boolean, { defaultValue: true })
  rideUpdates: boolean;

  @Field(() => Boolean, { defaultValue: true })
  promotions: boolean;

  @Field(() => Boolean, { defaultValue: true })
  rewards: boolean;
}

@ObjectType()
export class LocationSettings {
  @Field(() => Boolean, { defaultValue: true })
  shareLocation: boolean;

  @Field(() => String, { defaultValue: "high" })
  locationAccuracy: string;
}

@InputType()
export class UpdateNotificationSettingsInput {
  @Field(() => Boolean, { nullable: true })
  rideUpdates?: boolean;

  @Field(() => Boolean, { nullable: true })
  promotions?: boolean;

  @Field(() => Boolean, { nullable: true })
  rewards?: boolean;
}

@InputType()
export class UpdateLocationSettingsInput {
  @Field(() => Boolean, { nullable: true })
  shareLocation?: boolean;

  @Field(() => String, { nullable: true })
  locationAccuracy?: string;
}

