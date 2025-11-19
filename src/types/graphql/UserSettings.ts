import { ObjectType, Field, InputType } from "type-graphql";

@ObjectType()
export class NotificationSettings {
  @Field({ nullable: true, defaultValue: true })
  rideUpdates!: boolean;

  @Field({ nullable: true, defaultValue: true })
  promotions!: boolean;

  @Field({ nullable: true, defaultValue: true })
  rewards!: boolean;

  @Field({ nullable: true, defaultValue: true })
  staking?: boolean;
}

@InputType()
export class UpdateNotificationSettingsInput {
  @Field({ nullable: true })
  rideUpdates?: boolean;

  @Field({ nullable: true })
  promotions?: boolean;

  @Field({ nullable: true })
  rewards?: boolean;

  @Field({ nullable: true })
  staking?: boolean;
}

@ObjectType()
export class LocationSettings {
  @Field({ nullable: true, defaultValue: true })
  shareLocation!: boolean;

  @Field({ nullable: true, defaultValue: "high" })
  accuracy!: string;

  @Field({ nullable: true })
  backgroundUpdates?: boolean;
}

@InputType()
export class UpdateLocationSettingsInput {
  @Field({ nullable: true })
  shareLocation?: boolean;

  @Field({ nullable: true })
  accuracy?: string;

  @Field({ nullable: true })
  backgroundUpdates?: boolean;
}
