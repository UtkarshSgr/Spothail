const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 4000;

// In-memory telemetry cache
const activeDrivers = new Map();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'spothail-backend', uptime: process.uptime() });
});

io.on('connection', (socket) => {
  console.log(`[Socket.io] Connected: ${socket.id}`);

  // Driver broadcasts status
  socket.on('driver:sync_status', (driverData) => {
    if (driverData?.driverId) {
      activeDrivers.set(driverData.driverId, {
        ...driverData,
        socketId: socket.id,
        lastUpdated: Date.now(),
      });
      // Broadcast live autos to all connected passengers
      io.emit('server:nearby_autos', Array.from(activeDrivers.values()));
    }
  });

  // Passenger syncs location
  socket.on('passenger:sync_location', (passengerPos) => {
    socket.emit('server:nearby_autos', Array.from(activeDrivers.values()));
  });

  // Passenger pings a specific driver
  socket.on('passenger:ping_driver', ({ targetDriverId, passengerLat, passengerLng }) => {
    console.log(`[Ping] Target: ${targetDriverId} from (${passengerLat}, ${passengerLng})`);
    io.emit('driver:ping_received', {
      id: `PING-${Date.now()}`,
      targetDriverId,
      lat: passengerLat,
      lng: passengerLng,
      timestamp: Date.now(),
    });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Disconnected: ${socket.id}`);
    for (const [id, driver] of activeDrivers.entries()) {
      if (driver.socketId === socket.id) {
        activeDrivers.delete(id);
        io.emit('server:nearby_autos', Array.from(activeDrivers.values()));
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 SpotHail Backend Server listening on port ${PORT}`);
});
