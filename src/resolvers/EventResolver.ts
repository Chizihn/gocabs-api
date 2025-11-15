import { Resolver, Query, Mutation, Arg, Ctx, Authorized, UseMiddleware } from "type-graphql";
import { prisma } from "../config/database";
import { Event, CreateEventInput } from "../types/graphql/Event";
import { Context } from "../types/Context";
import { logger } from "../utils/logger";   
import { mutationRateLimiter } from "../middleware/graphqlRateLimits";
import { Prisma } from "@prisma/client";

@Resolver()
export class EventResolver {
  @Query(() => [Event])
  async events(
    @Arg("isActive", { nullable: true }) isActive?: boolean,
    @Arg("upcoming", { nullable: true }) upcoming?: boolean
  ): Promise<Event[]> {
    const where: Prisma.EventWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (upcoming) {
      where.eventDate = { gte: new Date() };
    }

    const events = await prisma.event.findMany({
      where,
      orderBy: { eventDate: "asc" },
    });

    return events.map((event) => ({
      ...event,
      location: event.location as any, // Location is properly typed in the GraphQL type
      // No need to convert null to undefined as the Event type now accepts null
    }));
  }

  @Query(() => Event, { nullable: true })
  async event(@Arg("id") id: string): Promise<Event | null> {
    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) return null;

    return {
      ...event,
      location: event.location as any,
      // No need to convert null to undefined as the Event type now accepts null
    };
  }

  @UseMiddleware(mutationRateLimiter)
  @Authorized("ADMIN")
  @Mutation(() => Event)
  async createEvent(
    @Arg("input") input: CreateEventInput,
    @Ctx() ctx: Context
  ): Promise<Event> {
    const eventData: Prisma.EventCreateInput = {
      name: input.name,
      description: input.description || null, // Prisma expects null for optional fields
      location: input.location as any,
      eventDate: input.eventDate,
      eventType: input.eventType,
      imageUrl: input.imageUrl || null, // Prisma expects null for optional fields
      isActive: true,
    };

    const event = await prisma.event.create({
      data: eventData,
    });

    logger.info(`Event created: ${event.name} (${event.id})`);

    // Return the event data as is, with null values preserved
    return {
      ...event,
      location: event.location as any,
    };
  }
}
