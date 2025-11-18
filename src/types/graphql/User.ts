import {
  ObjectType,
  Field,
  ID,
  InputType,
  registerEnumType,
} from "type-graphql";
import { UserRole } from "@prisma/client";
import { Booking } from "./Booking";
import { Reward } from "./Reward";
import { StakedNFT } from "./Staking";
import { Driver } from "./Driver";
import { Owner } from "./Owner";
import { Notification } from "./Notification";
import { LocationSettings, NotificationSettings } from "./UserSettings";

registerEnumType(UserRole, {
  name: "UserRole",
});

@ObjectType()
export class User {
  @Field(() => ID)
  id!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  walletAddress?: string | null;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => String, { nullable: true })
  username?: string | null;

  @Field(() => String, { nullable: true })
  phoneNumber?: string | null;

  @Field(() => String, { nullable: true })
  fcmToken?: string | null;

  @Field(() => UserRole)
  role!: UserRole;

  @Field(() => NotificationSettings)
  notificationSettings!: NotificationSettings;

  @Field(() => LocationSettings)
  locationSettings!: LocationSettings;

  @Field(() => [Booking], { nullable: true })
  bookings?: Booking[];

  @Field(() => [Reward], { nullable: true })
  rewards?: Reward[];

  @Field(() => [StakedNFT], { nullable: true })
  stakedNFTs?: StakedNFT[];

  @Field(() => Driver, { nullable: true })
  driver?: Driver | null;

  @Field(() => Owner, { nullable: true })
  owner?: Owner | null;

  @Field(() => [Notification], { nullable: true })
  notifications?: Notification[];
}

@InputType()
export class ConnectWalletInput {
  @Field()
  walletAddress!: string;

  @Field(() => UserRole, { nullable: true })
  role?: UserRole;
}

@InputType()
export class UpdateUserProfileInput {
  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  username?: string;

  @Field({ nullable: true })
  phoneNumber?: string;
}

@ObjectType()
export class AuthResponse {
  @Field()
  token!: string;

  @Field(() => User)
  user!: User;

  @Field()
  hasNFTAccess!: boolean;
}

export { NFTVerificationResponse } from "./NFT";
