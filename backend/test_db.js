const mysql = require('mysql2/promise');

async function testDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '12345678',
      database: 'oodbs'
    });

    console.log('🔍 TESTING DATABASE STRUCTURE AND DATA...\n');

    // Check if tables exist
    const [tables] = await connection.query("SHOW TABLES");
    console.log('📋 Available tables:');
    tables.forEach(table => {
      console.log('  -', Object.values(table)[0]);
    });

    // Check bus_services structure and data
    console.log('\n🚌 BUS_SERVICES table structure:');
    const [busServicesStructure] = await connection.query("DESCRIBE bus_services");
    console.log(busServicesStructure);

    console.log('\n🚌 Sample bus_services data:');
    const [busServicesData] = await connection.query("SELECT * FROM bus_services LIMIT 5");
    console.log(busServicesData);

    // Check buses
    console.log('\n🚍 Sample bus data:');
    const [busData] = await connection.query("SELECT * FROM bus LIMIT 5");
    console.log(busData);

    // Check pickup locations
    console.log('\n📍 Sample pickup locations:');
    const [pickupData] = await connection.query("SELECT * FROM pickup_location LIMIT 5");
    console.log(pickupData);

    // Check organization locations  
    console.log('\n🏢 Sample organization locations:');
    const [orgData] = await connection.query("SELECT * FROM organization_locations LIMIT 5");
    console.log(orgData);

    // Check passenger_requests structure
    console.log('\n👥 PASSENGER_REQUESTS table structure:');
    const [passengerStructure] = await connection.query("DESCRIBE passenger_requests");
    console.log(passengerStructure);

    // Check schedule structure
    console.log('\n📅 SCHEDULE table structure:');
    const [scheduleStructure] = await connection.query("DESCRIBE schedule");
    console.log(scheduleStructure);

    // Check routes structure
    console.log('\n🛣️ ROUTES table structure:');
    const [routesStructure] = await connection.query("DESCRIBE routes");
    console.log(routesStructure);

    await connection.end();
    console.log('\n✅ Database test completed');

  } catch (error) {
    console.error('❌ Database test failed:', error);
  }
}

testDatabase();