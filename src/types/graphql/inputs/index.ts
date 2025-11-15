import { InputType, Field } from "type-graphql";

@InputType()
export class LocationInput {
  @Field()
  latitude: number;

  @Field()
  longitude: number;

  @Field()
  address: string;
}

@InputType()
export class CreateEventInput {
  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => LocationInput)
  location: LocationInput;

  @Field()
  eventDate: Date;

  @Field()
  eventType: string;

  @Field(() => String, { nullable: true })
  imageUrl?: string;
}

@InputType()
export class CreateShuttleInput {
  @Field()
  eventId: string;

  @Field()
  vehicleNumber: string;

  @Field()
  capacity: number;

  @Field()
  departureTime: Date;

  @Field()
  arrivalTime: Date;

  @Field(() => LocationInput)
  pickupLocation: LocationInput;

  @Field(() => LocationInput)
  dropoffLocation: LocationInput;

  @Field(() => String) // Will be converted to Decimal
  basePrice: number | string;

  @Field(() => Boolean, { defaultValue: false })
  isFractionalized: boolean;
}

@InputType()
export class CreateBookingInput {
  @Field()
  shuttleId: string;

  @Field(() => Number, { defaultValue: 1 })
  numberOfSeats: number;
}

@InputType()
export class StakeNFTInput {
  @Field()
  nftMintAddress: string;

  @Field(() => String, { nullable: true })
  shuttleId?: string;
}

@InputType()
export class RegisterInput {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field()
  phoneNumber: string;

  @Field()
  role: string; // DRIVER or OWNER

  @Field({ nullable: true })
  licenseNumber?: string;

  @Field({ nullable: true })
  companyName?: string;
}

@InputType()
export class LoginInput {
  @Field()
  email: string;

  @Field()
  password: string;
}
