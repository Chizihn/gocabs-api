import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Authorized,
  UseMiddleware,
  Int,
  ArgsType,
  Field,
  Args,
  FieldResolver,
  Root,
} from "type-graphql";
import { prisma } from "../config/database";
import {
  Event,
  CreateEventInput,
  UpdateEventInput,
} from "../types/graphql/Event";
import { Shuttle } from "../types/graphql/Shuttle";
import { logger } from "../utils/logger";
import { mutationRateLimiter } from "../middleware/graphqlRateLimits";
import { Prisma, ShuttleStatus } from "@prisma/client";
import { GraphQLError } from 'graphql';

@ArgsType()
class GetEventsArgs {
  @Field({ nullable: true })
  isActive?: boolean;

  @Field({ nullable: true })
  upcoming?: boolean;

  @Field({ nullable: true })
  eventType?: string;

  @Field({ nullable: true })
  startDate?: Date;

  @Field({ nullable: true })
  endDate?: Date;

  @Field({ nullable: true })
  location?: string;

  @Field(() => Int, { defaultValue: 10 })
  take: number = 10;

  @Field(() => Int, { defaultValue: 0 })
  skip: number = 0;
}

@Resolver(() => Event)
export class EventResolver {
  @Query(() => [Event])
  async events(
    @Args() { isActive, upcoming, eventType, startDate, endDate, location, take, skip }: GetEventsArgs
  ): Promise<Event[]> {
    const where: Prisma.EventWhereInput = { isActive: isActive ?? true };

    if (upcoming) {
      where.eventDate = { gte: new Date() };
    }

    if (startDate && endDate) {
      where.eventDate = { gte: startDate, lte: endDate };
    } else if (startDate) {
      where.eventDate = { gte: startDate };
    } else if (endDate) {
      where.eventDate = { lte: endDate };
    }

    if (eventType) {
      where.eventType = { equals: eventType, mode: 'insensitive' };
    }

    if (location) {
      where.location = {
        path: ['name'], // Assuming location has a 'name' field
        string_contains: location,
        mode: 'insensitive',
      };
    }

    try {
      const events = await prisma.event.findMany({
        where,
        orderBy: { eventDate: 'asc' },
        take,
        skip,
        include: {
          shuttles: {
            where: { status: { not: ShuttleStatus.CANCELLED } },
            orderBy: { departureTime: 'asc' },
            take: 1, // Only get the first shuttle for the list view
          },
        },
      });

      return events as unknown as Event[];
    } catch (error) {
      logger.error('Error fetching events:', error);
      throw new GraphQLError('Failed to fetch events');
    }
  }

  @Query(() => Event, { nullable: true })
  async event(@Arg("id") id: string): Promise<Event | null> {
    try {
      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          shuttles: {
            where: { status: { not: ShuttleStatus.CANCELLED } },
            orderBy: { departureTime: 'asc' },
            include: {
              driver: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      phoneNumber: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!event) {
        throw new GraphQLError('Event not found');
      }

      return event as unknown as Event;
    } catch (error) {
      logger.error(`Error fetching event ${id}:`, error);
      if (error instanceof GraphQLError) throw error;
      throw new GraphQLError('Failed to fetch event');
    }
  }

  @UseMiddleware(mutationRateLimiter)
  @Authorized("ADMIN")
  @Mutation(() => Event)
  async createEvent(
    @Arg("input") input: CreateEventInput
  ): Promise<Event> {
    try {
      // Validate event date is in the future
      if (new Date(input.eventDate) < new Date()) {
        throw new GraphQLError('Event date must be in the future');
      }

      const event = await prisma.event.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          location: input.location as Prisma.JsonObject,
          eventDate: input.eventDate,
          eventType: input.eventType,
          imageUrl: input.imageUrl ?? null,
          isActive: true,
        },
      });

      logger.info(`Event created: ${event.id}`);
      return event as unknown as Event;
    } catch (error) {
      logger.error('Error creating event:', error);
      if (error instanceof GraphQLError) throw error;
      throw new GraphQLError('Failed to create event');
    }
  }

  @Authorized("ADMIN")
  @Mutation(() => Event)
  async updateEvent(
    @Arg("id") id: string,
    @Arg("input") input: UpdateEventInput
  ): Promise<Event> {
    try {
      // Check if event exists
      const existingEvent = await prisma.event.findUnique({ where: { id } });
      if (!existingEvent) {
        throw new GraphQLError('Event not found');
      }

      // Prevent updating past events
      if (existingEvent.eventDate < new Date() && input.isActive === false) {
        throw new GraphQLError('Cannot deactivate past events');
      }

      const updateData: any = {
        ...input,
        updatedAt: new Date(),
      };
      
      if (input.location) {
        updateData.location = input.location;
      }

      const event = await prisma.event.update({
        where: { id },
        data: updateData,
      });

      logger.info(`Event updated: ${id}`);
      return event as unknown as Event;
    } catch (error) {
      logger.error(`Error updating event ${id}:`, error);
      if (error instanceof GraphQLError) throw error;
      throw new GraphQLError('Failed to update event');
    }
  }

  @Authorized("ADMIN")
  @Mutation(() => Boolean)
  async deleteEvent(@Arg("id") id: string): Promise<boolean> {
    try {
      // Check if event has any shuttles
      const shuttles = await prisma.shuttle.count({
        where: { eventId: id, status: { not: ShuttleStatus.CANCELLED } },
      });

      if (shuttles > 0) {
        throw new GraphQLError('Cannot delete event with active shuttles');
      }

      // Use update with isActive: false instead of delete for soft delete
      await prisma.event.update({
        where: { id },
        data: { isActive: false },
      });

      logger.info(`Event marked as inactive: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting event ${id}:`, error);
      if (error instanceof GraphQLError) throw error;
      throw new GraphQLError('Failed to delete event');
    }
  }

  @FieldResolver(() => [Shuttle])
  async shuttles(
    @Root() event: Event,
    @Arg("status", () => ShuttleStatus, { nullable: true }) status?: ShuttleStatus
  ) {
    try {
      const shuttles = await prisma.shuttle.findMany({
        where: { 
          eventId: (event as any).id,
          ...(status ? { status } : { status: { not: ShuttleStatus.CANCELLED } }),
        },
        orderBy: { departureTime: 'asc' },
        include: {
          driver: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  phoneNumber: true,
                },
              },
            },
          },
          _count: {
            select: { bookings: true },
          },
        },
      });

      return shuttles.map(shuttle => ({
        ...shuttle,
        bookedSeats: shuttle._count?.bookings || 0,
      }));
    } catch (error) {
      logger.error(`Error fetching shuttles for event ${(event as any).id}:`, error);
      return [];
    }
  }
}
