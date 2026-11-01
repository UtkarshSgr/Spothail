const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// CORS configuration: origins can be specified via ALLOWED_ORIGINS (comma-separated),
// CLIENT_URL, or defaults to allowing all origins (*) for flexible deployment.
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || process.env.CORS_ORIGIN;
const allowedOrigins = rawAllowedOrigins
  ? rawAllowedOrigins.split(',').map((origin) => origin.trim()).filter(Boolean)
  : ['*'];

const isOriginAllowed = (origin) => {
  // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, health check)
  if (!origin) return true;
  // If wildcard allowed, permit all
  if (allowedOrigins.includes('*')) return true;
  // Check exact match against configured origins
  if (allowedOrigins.includes(origin)) return true;
  // Always permit local development origins
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Socket.io CORS blocked for origin: ${origin}`));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
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
