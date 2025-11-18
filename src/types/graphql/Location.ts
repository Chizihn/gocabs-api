import { ObjectType, Field, InputType } from "type-graphql";

@InputType()
export class CoordinatesInput {
  @Field()
  latitude!: number;

  @Field()
  longitude!: number;
}

@ObjectType()
export class Coordinates {
  @Field()
  latitude!: number;

  @Field()
  longitude!: number;
}

@ObjectType()
export class LocationUpdate {
  @Field()
  shuttleId!: string;

  @Field(() => Coordinates)
  coordinates!: Coordinates;

  @Field()
  timestamp!: Date;
}

@ObjectType()
export class Location {
  @Field()
  lat!: number;

  @Field()
  lng!: number;

  @Field()
  name!: string;
}

@InputType()
export class LocationInput {
  @Field()
  lat!: number;

  @Field()
  lng!: number;

  @Field()
  name!: string;
}