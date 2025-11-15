import { ObjectType, Field, ID, InputType } from "type-graphql";
import { LocationInput } from "./inputs";

@ObjectType()
export class Location {
  @Field()
  latitude: number;

  @Field()
  longitude: number;

  @Field()
  address: string;
}

@ObjectType()
export class Event {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => Location)
  location: Location;

  @Field()
  eventDate: Date;

  @Field()
  eventType: string;

  @Field(() => String, { nullable: true })
  imageUrl: string | null;

  @Field()
  isActive: boolean;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}



@InputType()
export class CreateEventInput {
  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => LocationInput)
  location: LocationInput;

  @Field()
  eventDate: Date;

  @Field()
  eventType: string;

  @Field(() => String, { nullable: true })
  imageUrl: string | null;
}
