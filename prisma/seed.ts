// prisma/seed.ts

import { PrismaClient, UserRole, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// City coordinates & EVENTS stay exactly the same (omitted for brevity)
const CITIES = [
  { name: 'Tbilisi', lat: 41.7151, lng: 44.8271 },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { name: 'Barcelona', lat: 41.3851, lng: 2.1734 },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708 },
  { name: 'London', lat: 51.5074, lng: -0.1278 },
];

const EVENTS = [
  { name: "Degamefi 2025", city: "Tbilisi", date: "2025-09-19T09:00:00.000Z", eventType: "Conference", description: "...", imageUrl: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&h=400&fit=crop" },
  { name: "TOKEN2049 Singapore", city: "Singapore", date: "2025-10-01T09:00:00.000Z", eventType: "Conference", description: "...", imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&h=400&fit=crop" },
  { name: "European Blockchain Convention", city: "Barcelona", date: "2025-10-15T09:00:00.000Z", eventType: "Conference", description: "...", imageUrl: "https://images.unsplash.com/photo-1550528913-5a1be7b6cfad?w=800&h=400&fit=crop" },
  { name: "Blockchain Life 2025", city: "Dubai", date: "2025-10-28T10:00:00.000Z", eventType: "Forum", description: "...", imageUrl: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&h=400&fit=crop" },
  { name: "London Blockchain Conference", city: "London", date: "2025-10-22T09:30:00.000Z", eventType: "Conference", description: "...", imageUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=400&fit=crop" },
];

function getCityCoordinates(cityName: string) {
  return CITIES.find(c => c.name === cityName) || CITIES[0];
}

function getLocationData(location: Prisma.JsonValue): { lat: number; lng: number; address: string } {
  if (typeof location !== 'object' || location === null) return { lat: 0, lng: 0, address: 'Unknown' };
  const loc = location as any;
  return { lat: loc.lat ?? 0, lng: loc.lng ?? 0, address: loc.address ?? 'Unknown' };
}

async function main() {
  console.log('Starting full database seeding...\n');

  await prisma.$transaction([
    prisma.booking.deleteMany(),
    prisma.shuttle.deleteMany(),
    prisma.vehicle.deleteMany(),
    prisma.driver.deleteMany(),
    prisma.owner.deleteMany(),
    prisma.user.deleteMany(),
    prisma.event.deleteMany(),
  ]);

  // 1. Events
  for (const ev of EVENTS) {
    const coords = getCityCoordinates(ev.city);
    await prisma.event.create({
      data: {
        name: ev.name,
        description: ev.description,
        location: { lat: coords.lat, lng: coords.lng, address: `Convention Center, ${ev.city}` } as Prisma.JsonObject,
        eventDate: new Date(ev.date),
        eventType: ev.eventType,
        imageUrl: ev.imageUrl,
        isActive: true,
      },
    });
  }

  // 2. Seeker — WALLET ONLY
  await prisma.user.create({
    data: {
      walletAddress: "5GdRtZ3YJ3QWjrdwMCGGpzqjUgkAm6fywYa19T45DbBX",
      email: "seeker@demo.com",
      username: "CryptoSeeker",
      phoneNumber: "+995555123456",
      role: UserRole.SEEKER,
    },
  });

  // 3. Owners — EMAIL + PASSWORD
  const ownerAccounts = [
    { email: "owner.tbilisi@fleet.ge", password: "owner123", company: "Tbilisi Shuttle Co" },
    { email: "owner.dubai@fleet.ae",   password: "owner123", company: "Dubai Crypto Rides" },
  ];

  for (const acc of ownerAccounts) {
    const user = await prisma.user.create({
      data: {
        email: acc.email,
        username: acc.company,
        password: await bcrypt.hash(acc.password, 10),
        role: UserRole.OWNER,
      },
    });
    const owner = await prisma.owner.create({
      data: {
        userId: user.id,
        companyName: acc.company,
        licenseNumber: acc.company.includes("Dubai") ? "DXB-777" : "GEO-001",
        isVerified: true,
      },
    });
    for (let i = 1; i <= 2; i++) {
      await prisma.vehicle.create({
        data: {
          ownerId: owner.id,
          vehicleNumber: `${acc.company.split(' ')[0].slice(0,3).toUpperCase()}${i}`,
          licensePlate: `${acc.company.includes("Dubai") ? "DXB" : "TB"}-${i}`,
          vehicleType: acc.company.includes("Dubai") ? "luxury_bus" : "minibus",
          capacity: acc.company.includes("Dubai") ? 30 : 18,
        },
      });
    }
  }

  // 4. Drivers — EMAIL + PASSWORD
  const driverAccounts = [
    { name: "Giorgi", email: "giorgi@fleet.ge", password: "driver123", license: "DRV-GEO-101" },
    { name: "Ahmed",  email: "ahmed@fleet.ae",  password: "driver123", license: "DRV-DXB-999" },
  ];

  const createdDrivers: any[] = [];
  for (const d of driverAccounts) {
    const user = await prisma.user.create({
      data: {
        email: d.email,
        username: d.name,
        password: await bcrypt.hash(d.password, 10),
        phoneNumber: d.name === "Giorgi" ? "+995599887766" : "+971551234567",
        role: UserRole.DRIVER,
      },
    });
    const driver = await prisma.driver.create({
      data: {
        userId: user.id,
        licenseNumber: d.license,
        isVerified: true,
        rating: 4.9,
        totalRides: 142,
        earnings: 3120,
      },
    });
    createdDrivers.push(driver);
  }

  // 5. Shuttles — only one per driver
  const vehicles = await prisma.vehicle.findMany();
  const events = await prisma.event.findMany({ select: { id: true, eventDate: true, location: true } });

  let vIndex = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const vehicle = vehicles[vIndex++ % vehicles.length];
    const loc = getLocationData(event.location);

    await prisma.shuttle.create({
      data: {
        eventId: event.id,
        vehicleId: vehicle.id,
        driverId: i < createdDrivers.length ? createdDrivers[i].id : null,
        departureTime: event.eventDate,
        arrivalTime: new Date(event.eventDate.getTime() + 2.5 * 3600000),
        pickupLocation: { lat: loc.lat, lng: loc.lng, address: loc.address } as Prisma.JsonObject,
        dropoffLocation: { lat: loc.lat + 0.08, lng: loc.lng + 0.08, address: "Airport Drop-off" } as Prisma.JsonObject,
        basePriceUsdc: i < 3 ? 25 : 45,
        status: "SCHEDULED",
        isFractionalized: i % 2 === 0,
      },
    });
  }

  // FINAL LOGIN INFO
  console.log('\nSEEDING COMPLETED!');
  console.log('LOGIN CREDENTIALS:');
  console.log('─────────────────────────────');
  console.log('Seeker (Wallet):');
  console.log('   Wallet: 5GdRtZ3YJ3QWjrdwMCGGpzqjUgkAm6fywYa19T45DbBX');
  console.log('\nOwners (Email/Password):');
  console.log('   owner.tbilisi@fleet.ge  →  owner123');
  console.log('   owner.dubai@fleet.ae    →  owner123');
  console.log('\nDrivers (Email/Password):');
  console.log('   giorgi@fleet.ge   →  driver123');
  console.log('   ahmed@fleet.ae    →  driver123');
  console.log('─────────────────────────────\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => await prisma.$disconnect());