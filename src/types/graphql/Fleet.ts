import {
  ObjectType,
  Field,
  GraphQLISODateTime,
  ID,
} from "type-graphql";


@ObjectType()
export class FleetOverview {
  @Field(() => Number)
  totalVehicles: number;

  @Field()
  activeVehicles: number;

  @Field()
  totalDrivers: number;

  @Field()
  activeDrivers: number;

  @Field()
  totalRevenue: number;

  @Field()
  monthRevenue: number;
}

@ObjectType()
export class VehicleDetails {
  @Field(() => ID)
  id: string;

  @Field()
  vehicleNumber: string;

  @Field()
  vehicleType: string;

  @Field()
  capacity: number;

  @Field()
  licensePlate: string;

  @Field()
  isActive: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastMaintenance: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  nextMaintenance: Date | null;

  @Field()
  mileage: number;
}

