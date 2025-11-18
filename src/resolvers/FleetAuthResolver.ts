import { Resolver, Mutation, Arg, ObjectType, Field, InputType } from "type-graphql";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database";
import { generateToken } from "../middleware/auth";
import { logger } from "../utils/logger";
import { User } from "../types/graphql/User";
import { UserRole } from "@prisma/client";

@ObjectType()
class FleetAuthResponse {
  @Field()
  token: string;

  @Field(() => User)
  user: User;

  @Field(() => String, { nullable: true })
  driverId?: string | null;

  @Field(() => String, { nullable: true })
  ownerId?: string | null;
}

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

@Resolver()
export class FleetAuthResolver {
  @Mutation(() => FleetAuthResponse)
  async registerFleetUser(@Arg("input") input: RegisterInput): Promise<FleetAuthResponse> {
    try {
      // Validate role
      if (input.role !== UserRole.DRIVER && input.role !== UserRole.OWNER) {
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

      // Create user with proper type assertion
      const user = await prisma.user.create({
        data: {
          email: input.email,
          // @ts-ignore - Password field exists in the database but not in the Prisma type
          password: hashedPassword,
          phoneNumber: input.phoneNumber,
          role: input.role,
          // Initialize with default values
          notificationSettings: {},
          locationSettings: {}
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
            // Removed vehicleType as it's not in the schema
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
        username: user.username,
        phoneNumber: user.phoneNumber,
        fcmToken: user.fcmToken,
        role: user.role as UserRole,
        notificationSettings: user.notificationSettings as any,
        locationSettings: user.locationSettings as any,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        // Initialize arrays for relations
        bookings: [],
        rewards: [],
        stakedNFTs: [],
        notifications: [],
        // Initialize driver/owner as null, they'll be loaded if needed
        driver: null,
        owner: null
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

  @Mutation(() => FleetAuthResponse)
  async loginFleetUser(@Arg("input") input: LoginInput): Promise<FleetAuthResponse> {
    try {
      logger.info(`Fleet user login attempt: ${input.email}`);
      
      // Find user with their role-specific profile using Prisma's type-safe query
      const users = await prisma.$queryRaw<Array<{
        id: string;
        email: string | null;
        password: string;
        walletAddress: string | null;
        username: string | null;
        phoneNumber: string | null;
        fcmToken: string | null;
        role: UserRole;
        notificationSettings: any;
        locationSettings: any;
        driverId: string | null;
        ownerId: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>>`
        SELECT 
          u.*,
          d.id as "driverId",
          o.id as "ownerId"
        FROM "User" u
        LEFT JOIN "Driver" d ON d."userId" = u.id
        LEFT JOIN "Owner" o ON o."userId" = u.id
        WHERE u.email = ${input.email} 
        AND u.role IN ('DRIVER', 'OWNER')
        LIMIT 1
      `;

      const user = users[0];

      // Verify user exists and has a password
      if (!user || !user.password) {
        logger.warn(`Login failed: User not found or invalid credentials for ${input.email}`);
        throw new Error("Invalid email or password");
      }

      // Verify password
      const validPassword = await bcrypt.compare(input.password, user.password);
      if (!validPassword) {
        logger.warn(`Login failed: Invalid password for ${input.email}`);
        throw new Error("Invalid email or password");
      }

      // Generate JWT token
      const token = generateToken(user.id, user.email || '');

      logger.info(`Fleet user logged in successfully: ${user.email}`);

      // Map the user to match the GraphQL User type
      const userResponse: User = {
        id: user.id,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        walletAddress: user.walletAddress,
        email: user.email,
        username: user.username,
        phoneNumber: user.phoneNumber,
        fcmToken: user.fcmToken,
        role: user.role as UserRole,
        notificationSettings: user.notificationSettings as any,
        locationSettings: user.locationSettings as any
      };

      // Prepare response
      const response: FleetAuthResponse = {
        token,
        user: userResponse,
        driverId: user.driverId || null,
        ownerId: user.ownerId || null,
      };

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      logger.error(`Login failed: ${errorMessage}`, { error });
      
      // Return a more specific error message for known cases
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('timeout')) {
        throw new Error('Unable to connect to the authentication service. Please try again later.');
      }
      
      // For security reasons, don't expose internal error details
      throw new Error('Authentication failed. Please check your credentials and try again.');
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
      // await prisma.resetToken.create({
      //   data: {
      //     userId: user.id,
      //     token: resetToken,
      //     expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
      //   },
      // });

      return true;
    } catch (error) {
      logger.error("Password reset request failed:", error);
      return false;
    }
  }
}
