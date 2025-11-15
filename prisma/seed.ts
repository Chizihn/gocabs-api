import { PrismaClient } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

const OWNER_EMAILS = [
  'owner1@gocab.com',
  'owner2@gocab.com',
  'owner3@gocab.com',
  'owner4@gocab.com',
  'owner5@gocab.com'
];

const DRIVER_EMAILS = [
  'driver1@gocab.com',
  'driver2@gocab.com',
  'driver3@gocab.com',
  'driver4@gocab.com',
  'driver5@gocab.com'
];

const VEHICLE_TYPES = ['Sedan', 'SUV', 'Minivan', 'Bus', 'Luxury Van'];
const EVENT_TYPES = ['Concert', 'Sports', 'Conference', 'Gala', 'Expo'];

const CITIES = [
  { name: 'New York', lat: 40.7128, lng: -74.0060 },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  { name: 'Chicago', lat: 41.8781, lng: -87.6298 },
  { name: 'Miami', lat: 25.7617, lng: -80.1918 },
  { name: 'Las Vegas', lat: 36.1699, lng: -115.1398 }
];

const EVENTS = [
  {
    name: 'Tech Summit 2023',
    description: 'Annual technology conference with industry leaders',
    eventType: 'Conference',
    city: 'San Francisco',
    date: '2023-12-15T09:00:00.000Z',
    imageUrl: 'https://eventslabpro.com/wp-content/uploads/2023/11/special-dinner.png'
  },
  {
    name: 'Music Festival',
    description: 'Weekend music festival featuring top artists',
    eventType: 'Concert',
    city: 'Austin',
    date: '2024-01-20T12:00:00.000Z',
    imageUrl: 'https://eventslabpro.com/wp-content/uploads/2023/11/special-dinner.png'
  },
  {
    name: 'Startup Expo',
    description: 'Showcasing innovative startups and technologies',
    eventType: 'Expo',
    city: 'Boston',
    date: '2024-02-10T10:00:00.000Z',
    imageUrl: 'https://eventslabpro.com/wp-content/uploads/2023/11/special-dinner.png'
  },
  {
    name: 'Sports Championship',
    description: 'Annual sports championship event',
    eventType: 'Sports',
    city: 'Chicago',
    date: '2024-03-05T15:00:00.000Z',
    imageUrl: 'https://eventslabpro.com/wp-content/uploads/2023/11/special-dinner.png'
  },
  {
    name: 'Charity Gala',
    description: 'Black-tie fundraising event for charity',
    eventType: 'Gala',
    city: 'New York',
    date: '2024-04-18T19:00:00.000Z',
    imageUrl: 'https://eventslabpro.com/wp-content/uploads/2023/11/special-dinner.png'
  }
];

const VEHICLES = [
  { type: 'SUV', capacity: 6, license: 'ABC123' },
  { type: 'Luxury Van', capacity: 8, license: 'XYZ789' },
  { type: 'Minivan', capacity: 7, license: 'DEF456' },
  { type: 'Bus', capacity: 30, license: 'GHI789' },
  { type: 'Sedan', capacity: 4, license: 'JKL012' }
];

const DRIVERS = [
  { name: 'John Doe', license: 'DRV-12345', rating: 4.8 },
  { name: 'Jane Smith', license: 'DRV-23456', rating: 4.9 },
  { name: 'Mike Johnson', license: 'DRV-34567', rating: 4.7 },
  { name: 'Sarah Williams', license: 'DRV-45678', rating: 4.9 },
  { name: 'David Brown', license: 'DRV-56789', rating: 4.8 }
];

// Get coordinates for a city
function getCityCoordinates(cityName: string) {
  const city = CITIES.find(c => c.name === cityName) || CITIES[0];
  return { lat: city.lat, lng: city.lng };
}

// Add hours to a date
function addHours(date: Date, hours: number) {
  const newDate = new Date(date);
  newDate.setHours(newDate.getHours() + hours);
  return newDate;
}

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create owners
  console.log('👔 Creating owners...');
  const owners = [];
  const companyNames = [
    'Elite Transport',
    'City Rides',
    'Premier Fleet',
    'Metro Trans',
    'Luxury Rides'
  ];

  for (let i = 0; i < 5; i++) {
    try {
      const owner = await prisma.user.create({
        data: {
          email: OWNER_EMAILS[i],
          password: '$2a$10$8X5zFJQ3Jk9vXQH5X8X5XeX5XeX5XeX5XeX5XeX5XeX5XeX5XeX5Xe', // 'password123' hashed
          role: "OWNER",
          isNFTHolder: i % 2 === 0, // Every other owner has NFT
          nftTokens: i % 2 === 0 ? ['0x' + Math.random().toString(16).substr(2, 40)] : [],
          ownerProfile: {
            create: {
              companyName: companyNames[i],
              licenseNumber: `OWN-${1000 + i}`,
              isVerified: true,
            },
          },
        },
        include: { ownerProfile: true },
      });
      owners.push(owner);
      console.log(`   Created owner: ${owner.ownerProfile?.companyName}`);
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        console.log(`   Owner ${OWNER_EMAILS[i]} already exists, skipping...`);
      } else {
        console.error('Error creating owner:', error);
      }
    }
  }

  // Create drivers
  console.log('🚗 Creating drivers...');
  const drivers = [];
  
  for (let i = 0; i < 5; i++) {
    try {
      const owner = owners[i % owners.length]; // Distribute drivers among owners
      const driverData = DRIVERS[i];
      
      const driver = await prisma.user.create({
        data: {
          email: DRIVER_EMAILS[i],
          password: '$2a$10$8X5zFJQ3Jk9vXQH5X8X5XeX5XeX5XeX5XeX5XeX5XeX5XeX5XeX5Xe',
          role: "DRIVER",
          isNFTHolder: i % 3 === 0, // Every 3rd driver has NFT
          nftTokens: i % 3 === 0 ? ['0x' + Math.random().toString(16).substr(2, 40)] : [],
          driverProfile: {
            create: {
              licenseNumber: driverData.license,
              vehicleType: VEHICLES[i % VEHICLES.length].type,
              rating: driverData.rating,
              totalRides: 50 + (i * 10),
              isOnline: true,
              isVerified: true,
              ownerId: owner.ownerProfile?.id,
            },
          },
        },
        include: { driverProfile: true },
      });
      drivers.push(driver);
      console.log(`   Created driver: ${driverData.name} (${driverData.license})`);
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        console.log(`   Driver ${DRIVER_EMAILS[i]} already exists, skipping...`);
      } else {
        console.error('Error creating driver:', error);
      }
    }
  }

  // Create vehicles for each owner
  console.log('🚘 Creating vehicles...');
  const vehicles = [];
  
  for (let i = 0; i < VEHICLES.length; i++) {
    const vehicleData = VEHICLES[i];
    const owner = owners[i % owners.length]; // Distribute vehicles among owners
    
    try {
      const vehicle = await prisma.vehicle.create({
        data: {
          ownerId: owner.ownerProfile!.id,
          vehicleNumber: `VH-${1000 + i}`,
          vehicleType: vehicleData.type,
          capacity: vehicleData.capacity,
          licensePlate: vehicleData.license,
          isActive: true,
          mileage: 10000 + (i * 5000),
          lastMaintenance: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          nextMaintenance: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
        },
      });
      vehicles.push(vehicle);
      console.log(`   Created vehicle: ${vehicle.licensePlate} (${vehicle.vehicleType})`);
    } catch (error) {
      console.error('Error creating vehicle:', error);
    }
  }

  // Create events
  console.log('🎉 Creating events...');
  const events = [];
  
  for (const eventData of EVENTS) {
    const city = CITIES.find(c => c.name === eventData.city) || CITIES[0];
    const location = getCityCoordinates(eventData.city);
    
    try {
      const event = await prisma.event.create({
        data: {
          name: eventData.name,
          description: eventData.description,
          location: {
            lat: location.lat,
            lng: location.lng,
            address: `123 ${eventData.eventType} St, ${eventData.city}`,
            city: eventData.city,
          },
          eventDate: new Date(eventData.date),
          eventType: eventData.eventType,
          imageUrl: eventData.imageUrl,
          isActive: true,
        },
      });
      events.push(event);
      console.log(`   Created event: ${event.name} (${event.eventType})`);
    } catch (error) {
      console.error('Error creating event:', error);
    }
  }

  // Create shuttles for each event
  console.log('🚌 Creating shuttles...');
  const shuttles = [];
  const pickupLocations = [
    'Downtown Transit Center',
    'Central Station',
    'City Hall',
    'Main Square',
    'Convention Center'
  ];
  
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const shuttleCount = 2; // 2 shuttles per event
    
    for (let j = 0; j < shuttleCount; j++) {
      try {
        const departureTime = new Date(event.eventDate);
        departureTime.setHours(departureTime.getHours() - 1 - j); // Stagger departure times
        
        const arrivalTime = new Date(departureTime);
        arrivalTime.setHours(arrivalTime.getHours() + 2); // 2 hours after departure
        
        const driver = drivers[(i + j) % drivers.length];
        const vehicle = vehicles[(i + j) % vehicles.length];
        
        // Create pickup and dropoff locations
        const pickupLocation = {
          lat: event.location.lat + (Math.random() * 0.1 - 0.05),
          lng: event.location.lng + (Math.random() * 0.1 - 0.05),
          address: `${pickupLocations[j % pickupLocations.length]}, ${event.location.city}`
        };
        
        const dropoffLocation = {
          lat: event.location.lat + (Math.random() * 0.02 - 0.01),
          lng: event.location.lng + (Math.random() * 0.02 - 0.01),
          address: event.name
        };
        
        const shuttle = await prisma.shuttle.create({
          data: {
            eventId: event.id,
            vehicleNumber: vehicle.vehicleNumber,
            capacity: vehicle.capacity,
            departureTime: departureTime,
            arrivalTime: arrivalTime,
            pickupLocation: {
              lat: pickupLocation.lat,
              lng: pickupLocation.lng,
              address: pickupLocation.address,
            },
            dropoffLocation: {
              lat: dropoffLocation.lat,
              lng: dropoffLocation.lng,
              address: dropoffLocation.address,
            },
            basePrice: 25.0 + (j * 5), // $25 for first shuttle, $30 for second, etc.
            currency: 'USDC',
            status: "SCHEDULED",
            isFractionalized: j % 2 === 0, // Every other shuttle is fractionalized
            driverId: driver.driverProfile?.id,
          },
        });
        
        shuttles.push(shuttle);
        console.log(`   Created shuttle from ${pickupLocation.address} to ${event.name}`);
      } catch (error) {
        console.error('Error creating shuttle:', error);
      }
    }
  }

  console.log('✅ Database seeded successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Error seeding database:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
