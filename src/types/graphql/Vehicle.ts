import {
  ObjectType,
  Field,
  ID,
  InputType,
  Int,
  registerEnumType,
} from "type-graphql";
import { Owner } from "./Owner";
import { Shuttle } from "./Shuttle";
import { BaseResponse } from "./responses";

// ====================== VEHICLE OBJECT TYPE ======================
@ObjectType()
export class Vehicle {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  ownerId!: string;

  // Relation to Owner (important for queries)
  @Field(() => Owner)
  owner?: Owner;

  @Field()
  vehicleNumber!: string;

  @Field()
  licensePlate!: string;

  @Field({ defaultValue: "minibus" })
  vehicleType!: string;

  @Field(() => Int)
  capacity!: number;

  @Field(() => Int)
  mileage!: number;

  @Field(() => Date, { nullable: true })
  lastMaintenance?: Date | null;

  @Field(() => Date, { nullable: true })
  nextMaintenance?: Date | null;

  // Optional: expose shuttles using this vehicle
  @Field(() => [Shuttle], { nullable: true })
  shuttles?: Shuttle[];

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

// ====================== CREATE VEHICLE INPUT ======================
@InputType()
export class CreateVehicleInput {
  @Field()
  vehicleNumber!: string;

  @Field()
  licensePlate!: string;

  @Field({ defaultValue: "minibus" })
  vehicleType?: string;

  @Field(() => Int)
  capacity!: number;

  // Note: ownerId comes from authenticated Owner user (not passed manually)
  // So we don't include it here for security
}

// ====================== UPDATE VEHICLE INPUT ======================
@InputType()
export class UpdateVehicleInput {
  @Field({ nullable: true })
  vehicleNumber?: string;

  @Field({ nullable:true })
  licensePlate?: string;

  @Field({ nullable: true })
  vehicleType?: string;

  @Field(() => Int, { nullable: true })
  capacity?: number;

  @Field(() => Int, { nullable: true })
  mileage?: number;

  @Field(() => Date, { nullable: true })
  lastMaintenance?: Date | null;

  @Field(() => Date, { nullable: true })
  nextMaintenance?: Date | null;
}

// ====================== RESPONSE TYPES ======================
@ObjectType()
export class VehicleResponse extends BaseResponse {
  @Field(() => Vehicle, { nullable: true })
  vehicle?: Vehicle;
}

@ObjectType()
export class VehiclesResponse extends BaseResponse {
  @Field(() => [Vehicle], { defaultValue: [] })
  vehicles?: Vehicle[];

  @Field(() => Int, { nullable: true })
  total?: number;
}