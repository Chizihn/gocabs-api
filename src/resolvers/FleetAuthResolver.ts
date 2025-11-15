import { Resolver, Query, Mutation, Arg, Ctx, InputType, Field, ObjectType, UseMiddleware } from "type-graphql";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database";
import { generateToken } from "../middleware/auth";
import { logger } from "../utils/logger";
import { User } from "../types/graphql/User";
import { authRateLimiter } from "../middleware/graphqlRateLimits";
import { UserRole } from "@prisma/client";
import { Prisma } from "@prisma/client";

@InputType()
class RegisterInput {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field()
  phoneNumber: string;

  @Field(() => UserRole)
  role: UserRole;

  @Field({ nullable: true })
  licenseNumber?: string;

  @Field({ nullable: true })
  companyName?: string;
}

@InputType()
class LoginInput {
  @Field()
  email: string;

  @Field()
  password: string;
}

@ObjectType()
class FleetAuthResponse {
  @Field()
  token: string;

  @Field(() => User)
  user: User;

  @Field(() => String, { nullable: true })
  driverId: string | null = null;

  @Field(() => String, { nullable: true })
  ownerId: string | null = null;
}

@Resolver()
export class FleetAuthResolver {
  @UseMiddleware(authRateLimiter)
  @Mutation(() => FleetAuthResponse)
  async registerFleetUser(@Arg("input") input: RegisterInput): Promise<FleetAuthResponse> {
    try {
      // Validate role
      if (input.role !== "DRIVER" && input.role !== "OWNER") {
        throw new Error("Invalid role. Must be DRIVER or OWNER");
      }

      // Check if email exists
      const existingUser = await prisma.user.findUnique({
        where: { email: input.email },
      });

      if (existingUser) {
        throw new Error("Email already registered");
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, 10);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: input.email,
          password: hashedPassword,
          phoneNumber: input.phoneNumber,
          role: input.role,
        },
      });

      // Create role-specific profile
      let driverId: string | undefined;
      let ownerId: string | undefined;

      if (input.role === "DRIVER") {
        if (!input.licenseNumber) {
          throw new Error("License number required for drivers");
        }

        const driver = await prisma.driver.create({
          data: {
            userId: user.id,
            licenseNumber: input.licenseNumber,
            vehicleType: "Shuttle", // Default
          },
        });
        driverId = driver.id;
      } else if (input.role === "OWNER") {
        if (!input.companyName || !input.licenseNumber) {
          throw new Error(
            "Company name and license number required for owners"
          );
        }

        const owner = await prisma.owner.create({
          data: {
            userId: user.id,
            companyName: input.companyName,
            licenseNumber: input.licenseNumber,
          },
        });
        ownerId = owner.id;
      }

      const token = generateToken(user.id, user.email!);

      logger.info(`Fleet user registered: ${user.email} (${input.role})`);

      // Map the user to match the GraphQL User type
      const userResponse: User = {
        id: user.id,
        walletAddress: user.walletAddress,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        isNFTHolder: user.isNFTHolder,
        nftTokens: user.nftTokens || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        // Explicitly set password to null as it's not part of the GraphQL type
        password: null,
      };

      return {
        token,
        user: userResponse,
        driverId: driverId || null,
        ownerId: ownerId || null,
      };
    } catch (error) {
      logger.error("Fleet registration failed:", error);
      throw error;
    }
  }

  @UseMiddleware(authRateLimiter)
  @Mutation(() => FleetAuthResponse)
  async loginFleetUser(@Arg("input") input: LoginInput): Promise<FleetAuthResponse> {
    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email: input.email },
        include: {
          driverProfile: true,
          ownerProfile: true,
        },
      });

      if (!user || !user.password) {
        throw new Error("Invalid credentials");
      }

      // Check if user is driver or owner
      if (user.role !== "DRIVER" && user.role !== "OWNER") {
        throw new Error("Invalid account type");
      }

      // Verify password
      const validPassword = await bcrypt.compare(input.password, user.password);
      if (!validPassword) {
        throw new Error("Invalid credentials");
      }

      const token = generateToken(user.id, user.email!);

      logger.info(`Fleet user logged in: ${user.email}`);

      // Map the user to match the GraphQL User type
      const userResponse: User = {
        id: user.id,
        walletAddress: user.walletAddress,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        isNFTHolder: user.isNFTHolder,
        nftTokens: user.nftTokens || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        // Explicitly set password to null as it's not part of the GraphQL type
        password: null,
      };

      return {
        token,
        user: userResponse,
        driverId: user.driverProfile?.id || null,
        ownerId: user.ownerProfile?.id || null,
      };
    } catch (error) {
      logger.error("Fleet login failed:", error);
      throw error;
    }
  }

  @Mutation(() => Boolean)
  async requestPasswordReset(@Arg("email") email: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Don't reveal if email exists
        return true;
      }

      // TODO: Generate reset token and send email
      // For MVP, implement basic token generation
      const resetToken = Math.random().toString(36).substring(7);

      logger.info(`Password reset requested for: ${email}`);

      // Store reset token (add ResetToken model in production)

      return true;
    } catch (error) {
      logger.error("Password reset request failed:", error);
      return false;
    }
  }
}
