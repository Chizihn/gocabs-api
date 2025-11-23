import { InputType, Field, ObjectType, Int } from "type-graphql";

@InputType()
export class CreateSignedUrlInput {
  @Field()
  filename: string;

  @Field()
  contentType: string;
}

@ObjectType()
export class SignedUrlResponse {
  @Field()
  signedUrl: string;

  @Field()
  publicUrl: string;
}

@InputType()
export class CreateVehicleInput {
  @Field()
  licensePlate: string;

  @Field()
  vehicleNumber: string;

  @Field(() => Int)
  capacity: number;

  @Field({ nullable: true })
  vehicleType?: string;

  @Field({ nullable: true })
  imageUrl?: string;
}

@InputType()
export class CreateEventInput {
  @Field()
  name: string;

  @Field()
  location: string; // Assuming JSON string for now

  @Field()
  eventDate: Date;

  @Field()
  eventType: string; // e.g., "CONCERT", "CONFERENCE"

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  imageUrl?: string;
}
