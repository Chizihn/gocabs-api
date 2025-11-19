import 'reflect-metadata';
import { ApolloServer } from '@apollo/server';
import { buildSchema } from 'type-graphql';
import { EventResolver } from '../resolvers/EventResolver';
import { prismaMock } from '../config/__mocks__/database';
import { Event } from '../types/graphql/Event';
import { GraphQLError } from 'graphql';

interface GetEventsResponse {
  events: Event[];
}

let server: ApolloServer;

beforeAll(async () => {
  const schema = await buildSchema({
    resolvers: [EventResolver],
  });
  server = new ApolloServer({
    schema,
  });
});

beforeEach(() => {
  prismaMock.$reset();
});

describe('EventResolver - events query', () => {
  const mockEvents: Event[] = [
    {
      id: 'event1',
      name: 'Concert A',
      description: 'A great concert',
      location: { name: 'Venue A', lat: 10, lng: 10 },
      eventDate: new Date('2025-12-01T10:00:00Z'),
      eventType: 'Music',
      imageUrl: 'http://example.com/img1.jpg',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      shuttles: [],
    },
    {
      id: 'event2',
      name: 'Conference B',
      description: 'Tech conference',
      location: { name: 'Venue B', lat: 20, lng: 20 },
      eventDate: new Date('2025-11-25T09:00:00Z'),
      eventType: 'Tech',
      imageUrl: 'http://example.com/img2.jpg',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      shuttles: [],
    },
    {
      id: 'event3',
      name: 'Workshop C',
      description: 'Coding workshop',
      location: { name: 'Venue A', lat: 10, lng: 10 },
      eventDate: new Date('2026-01-15T14:00:00Z'),
      eventType: 'Tech',
      imageUrl: 'http://example.com/img3.jpg',
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      shuttles: [],
    },
    {
      id: 'event4',
      name: 'Festival D',
      description: 'Summer festival',
      location: { name: 'Park C', lat: 30, lng: 30 },
      eventDate: new Date('2025-12-10T18:00:00Z'),
      eventType: 'Music',
      imageUrl: 'http://example.com/img4.jpg',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      shuttles: [],
    },
  ];

  it('should return all active events by default', async () => {
    prismaMock.event.findMany.mockResolvedValue(mockEvents.filter(e => e.isActive));

    const GET_EVENTS = `
      query {
        events {
          id
          name
          isActive
        }
      }
    `;

    const response = await server.executeOperation({ query: GET_EVENTS });

    if (response.body.kind === 'single') {
      const { data, errors } = response.body.singleResult;
      expect(errors).toBeUndefined();
      expect(data).toBeDefined();
      const typedData = data as any as GetEventsResponse;
      expect(typedData.events).toHaveLength(3);
      expect(typedData.events.every((event: Event) => event.isActive)).toBe(true);
    }
  });

  it('should filter events by isActive status', async () => {
    prismaMock.event.findMany.mockResolvedValue(mockEvents.filter(e => !e.isActive));

    const GET_INACTIVE_EVENTS = `
      query {
        events(isActive: false) {
          id
          name
          isActive
        }
      }
    `;

    const response = await server.executeOperation({ query: GET_INACTIVE_EVENTS });

    if (response.body.kind === 'single') {
      const { data, errors } = response.body.singleResult;
      expect(errors).toBeUndefined();
      expect(data).toBeDefined();
      const typedData = data as any as GetEventsResponse;
      expect(typedData.events).toHaveLength(1);
      const firstEvent = typedData.events[0];
      expect(firstEvent.id).toBe('event3');
      expect(firstEvent.isActive).toBe(false);
    }
  });

  it('should filter events by upcoming status', async () => {
    const now = new Date('2025-12-01T00:00:00Z'); // Set a fixed 'now' for testing upcoming
    jest.spyOn(global, 'Date').mockImplementation(() => now as any);

    prismaMock.event.findMany.mockResolvedValue(mockEvents.filter(e => e.eventDate >= now && e.isActive));

    const GET_UPCOMING_EVENTS = `
      query {
        events(upcoming: true) {
          id
          name
          eventDate
        }
      }
    `;

    const response = await server.executeOperation({ query: GET_UPCOMING_EVENTS });

    if (response.body.kind === 'single') {
      const { data, errors } = response.body.singleResult;
      expect(errors).toBeUndefined();
      expect(data).toBeDefined();
      const typedData = data as any as GetEventsResponse;
      expect(typedData.events).toHaveLength(2); // event1, event4
      expect(typedData.events.some((e: Event) => e.id === 'event1')).toBe(true);
      expect(typedData.events.some((e: Event) => e.id === 'event4')).toBe(true);
      expect(typedData.events.every((e: Event) => new Date(e.eventDate) >= now)).toBe(true);
    }
    jest.restoreAllMocks();
  });

  it('should filter events by eventType', async () => {
    prismaMock.event.findMany.mockResolvedValue(mockEvents.filter(e => e.eventType === 'Music' && e.isActive));

    const GET_MUSIC_EVENTS = `
      query {
        events(eventType: "Music") {
          id
          name
          eventType
        }
      }
    `;

    const response = await server.executeOperation({ query: GET_MUSIC_EVENTS });

    if (response.body.kind === 'single') {
      const { data, errors } = response.body.singleResult;
      expect(errors).toBeUndefined();
      expect(data).toBeDefined();
      const typedData = data as any as GetEventsResponse;
      expect(typedData.events).toHaveLength(2); // event1, event4
      expect(typedData.events.every((event: Event) => event.eventType === 'Music')).toBe(true);
    }
  });

  it('should filter events by startDate', async () => {
    const startDate = new Date('2025-12-05T00:00:00Z');
    prismaMock.event.findMany.mockResolvedValue(mockEvents.filter(e => e.eventDate >= startDate && e.isActive));

    const GET_EVENTS_BY_START_DATE = `
      query {
        events(startDate: "2025-12-05T00:00:00Z") {
          id
          name
          eventDate
        }
      }
    `;

    const response = await server.executeOperation({ query: GET_EVENTS_BY_START_DATE });

    if (response.body.kind === 'single') {
      const { data, errors } = response.body.singleResult;
      expect(errors).toBeUndefined();
      expect(data).toBeDefined();
      const typedData = data as any as GetEventsResponse;
      expect(typedData.events).toHaveLength(1); // event4
      expect(typedData.events).toBeDefined();
      expect(typedData.events![0].id).toBe('event4');
      expect(new Date(typedData.events![0].eventDate) >= startDate).toBe(true);
    }
  });

  it('should filter events by endDate', async () => {
    const endDate = new Date('2025-12-05T00:00:00Z');
    prismaMock.event.findMany.mockResolvedValue(mockEvents.filter(e => e.eventDate <= endDate && e.isActive));

    const GET_EVENTS_BY_END_DATE = `
      query {
        events(endDate: "2025-12-05T00:00:00Z") {
          id
          name
          eventDate
        }
      }
    `;

    const response = await server.executeOperation({ query: GET_EVENTS_BY_END_DATE });

    if (response.body.kind === 'single') {
      const { data, errors } = response.body.singleResult;
      expect(errors).toBeUndefined();
      expect(data).toBeDefined();
      const typedData = data as any as GetEventsResponse;
      expect(typedData.events).toHaveLength(2); // event1, event2
      expect(typedData.events.some((e: Event) => e.id === 'event1')).toBe(true);
      expect(typedData.events.some((e: Event) => e.id === 'event2')).toBe(true);
      expect(typedData.events.every((e: Event) => new Date(e.eventDate) <= endDate)).toBe(true);
    }
  });

  it('should filter events by startDate and endDate', async () => {
    const startDate = new Date('2025-11-20T00:00:00Z');
    const endDate = new Date('2025-12-05T00:00:00Z');
    prismaMock.event.findMany.mockResolvedValue(mockEvents.filter(e => e.eventDate >= startDate && e.eventDate <= endDate && e.isActive));

    const GET_EVENTS_BY_DATE_RANGE = `
      query {
        events(startDate: "2025-11-20T00:00:00Z", endDate: "2025-12-05T00:00:00Z") {
          id
          name
          eventDate
        }
      }
    `;

    const response = await server.executeOperation({ query: GET_EVENTS_BY_DATE_RANGE });

    if (response.body.kind === 'single') {
      const { data, errors } = response.body.singleResult;
      expect(errors).toBeUndefined();
      expect(data).toBeDefined();
      const typedData = data as any as GetEventsResponse;
      expect(typedData.events).toHaveLength(2); // event1, event2
      expect(typedData.events.some((e: Event) => e.id === 'event1')).toBe(true);
      expect(typedData.events.some((e: Event) => e.id === 'event2')).toBe(true);
      expect(typedData.events.every((e: Event) => new Date(e.eventDate) >= startDate && new Date(e.eventDate) <= endDate)).toBe(true);
    }
  });

  it('should filter events by location', async () => {
    prismaMock.event.findMany.mockResolvedValue(mockEvents.filter(e => (e.location as any).name.toLowerCase().includes('venue a') && e.isActive));

    const GET_EVENTS_BY_LOCATION = `
      query {
        events(location: "Venue A") {
          id
          name
          location
        }
      }
    `;

    const response = await server.executeOperation({ query: GET_EVENTS_BY_LOCATION });

    if (response.body.kind === 'single') {
      const { data, errors } = response.body.singleResult;
      expect(errors).toBeUndefined();
      expect(data).toBeDefined();
      const typedData = data as any as GetEventsResponse;
      expect(typedData.events).toHaveLength(1); // event1
      expect(typedData.events).toBeDefined();
      expect(typedData.events![0].id).toBe('event1');
      expect((typedData.events![0].location as any).name).toContain('Venue A');
    }
  });

  it('should combine multiple filters', async () => {
    const now = new Date('2025-12-01T00:00:00Z');
    jest.spyOn(global, 'Date').mockImplementation(() => now as any);

    prismaMock.event.findMany.mockResolvedValue(mockEvents.filter(e => e.eventType === 'Music' && e.eventDate >= now && e.isActive));

    const GET_COMBINED_FILTERS = `
      query {
        events(eventType: "Music", upcoming: true) {
          id
          name
          eventType
          eventDate
        }
      }
    `;

    const response = await server.executeOperation({ query: GET_COMBINED_FILTERS });

    if (response.body.kind === 'single') {
      const { data, errors } = response.body.singleResult;
      expect(errors).toBeUndefined();
      expect(data).toBeDefined();
      const typedData = data as any as GetEventsResponse;
      expect(typedData.events).toHaveLength(2); // event1, event4
      expect(typedData.events.every((e: Event) => e.eventType === 'Music' && new Date(e.eventDate) >= now)).toBe(true);
    }
    jest.restoreAllMocks();
  });
});
