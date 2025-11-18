import {
  ObjectType,
  Field,
  ID,
  registerEnumType,
  Int,
  Float,
  GraphQLISODateTime,
} from "type-graphql";
import { ShuttleStatus } from "@prisma/client";
import { Location } from "./Location";

registerEnumType(ShuttleStatus, {
  name: "FleetShuttleStatus",
});

@ObjectType()
export class FleetOverview {
  @Field(() => Int)
  totalVehicles!: number;

  @Field(() => Int)
  activeVehicles!: number;

  @Field(() => Float)
  totalRevenue!: number;

  @Field(() => Float)
  monthRevenue!: number;
}

@ObjectType()
export class VehicleDetails {
  @Field(() => ID)
  id!: string;

  @Field()
  licensePlate!: string;

  @Field()
  vehicleType!: string;

  @Field(() => Int)
  capacity!: number;

  @Field(() => Int)
  availableSeats!: number;

  @Field(() => ID, { nullable: true })
  driverId?: string | null;

  @Field()
  departureTime!: Date;

  @Field()
  arrivalTime!: Date;

  @Field(() => Location)
  pickupLocation!: Location;

  @Field(() => Location)
  dropoffLocation!: Location;

  @Field(() => Float)
  basePriceUsdc!: number;

  @Field(() => ShuttleStatus)
  status!: ShuttleStatus;

  @Field()
  isFractionalized!: boolean;

  @Field(() => String, { nullable: true })
  currentLat?: number | null;

  @Field(() => Int, { nullable: true })
  currentLng?: number | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastLocationUpdate?: Date | null;
}
