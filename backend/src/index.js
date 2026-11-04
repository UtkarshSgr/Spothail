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
      if (driverData.isOnline === false || driverData.isPublic === false || driverData.status === 'OFFLINE') {
        activeDrivers.delete(driverData.driverId);
        const offlinePayload = {
          ...driverData,
          driverId: driverData.driverId,
          status: 'OFFLINE',
          isOnline: false,
          isPublic: false,
          campusLocation: driverData.campusLocation || 'Offline',
          timestamp: Date.now(),
        };
        io.emit('DRIVER_STATUS_CHANGE', offlinePayload);
        io.emit('server:nearby_autos', Array.from(activeDrivers.values()));
      } else {
        const record = {
          ...driverData,
          status: 'ONLINE',
          isOnline: true,
          isPublic: true,
          socketId: socket.id,
          lastUpdated: Date.now(),
        };
        activeDrivers.set(driverData.driverId, record);
        io.emit('DRIVER_STATUS_CHANGE', record);
        io.emit('server:nearby_autos', Array.from(activeDrivers.values()));
      }
    }
  });

  // DRIVER_STATUS_CHANGE: Explicit event for toggling Public Route (Online) vs Roaming/Private (Offline)
  socket.on('DRIVER_STATUS_CHANGE', (payload) => {
    console.log(`[DRIVER_STATUS_CHANGE] received from ${socket.id}:`, payload);
    const { driverId, status, campusLocation } = payload || {};
    if (!driverId) return;

    if (status === 'OFFLINE' || payload.isOnline === false || payload.isPublic === false) {
      activeDrivers.delete(driverId);
      const offlinePayload = {
        ...payload,
        driverId,
        status: 'OFFLINE',
        isOnline: false,
        isPublic: false,
        campusLocation: campusLocation || 'Offline',
        timestamp: Date.now(),
      };
      io.emit('DRIVER_STATUS_CHANGE', offlinePayload);
      io.emit('server:nearby_autos', Array.from(activeDrivers.values()));
    } else {
      const onlineRecord = {
        ...payload,
        driverId,
        status: 'ONLINE',
        isOnline: true,
        isPublic: true,
        campusLocation: campusLocation || 'NIT Calicut Main Gate',
        socketId: socket.id,
        lastUpdated: Date.now(),
      };
      activeDrivers.set(driverId, onlineRecord);
      io.emit('DRIVER_STATUS_CHANGE', onlineRecord);
      io.emit('server:nearby_autos', Array.from(activeDrivers.values()));
    }
  });

  // Passenger syncs location
  socket.on('passenger:sync_location', (passengerPos) => {
    socket.emit('server:nearby_autos', Array.from(activeDrivers.values()));
  });

  // Request all active drivers
  socket.on('request:active_drivers', () => {
    socket.emit('server:nearby_autos', Array.from(activeDrivers.values()));
  });

  // PASSENGER_PING: Passenger signals curb pickup with selected pickup location (e.g. MBH Hostel)
  socket.on('PASSENGER_PING', (pingData) => {
    console.log(`[PASSENGER_PING] from ${socket.id}:`, pingData);
    const targetDriverId = pingData?.targetDriverId || pingData?.driverId;
    const broadcastPayload = {
      id: pingData?.id || `PING-${Date.now()}`,
      driverId: targetDriverId,
      targetDriverId: targetDriverId,
      pickupLocation: pingData?.pickupLocation || 'MBH Hostel',
      passengerLat: pingData?.passengerLat ?? pingData?.lat,
      passengerLng: pingData?.passengerLng ?? pingData?.lng,
      lat: pingData?.passengerLat ?? pingData?.lat,
      lng: pingData?.passengerLng ?? pingData?.lng,
      timestamp: pingData?.timestamp || Date.now(),
    };
    io.emit('PASSENGER_PING', broadcastPayload);
    io.emit('driver:ping_received', broadcastPayload);
  });

  // Legacy passenger pings a specific driver
  socket.on('passenger:ping_driver', ({ targetDriverId, driverId, passengerLat, passengerLng, pickupLocation }) => {
    const resolvedTarget = targetDriverId || driverId;
    console.log(`[Ping] Target: ${resolvedTarget} from (${passengerLat}, ${passengerLng}) at ${pickupLocation || 'MBH Hostel'}`);
    const broadcastPayload = {
      id: `PING-${Date.now()}`,
      driverId: resolvedTarget,
      targetDriverId: resolvedTarget,
      pickupLocation: pickupLocation || 'MBH Hostel',
      passengerLat,
      passengerLng,
      lat: passengerLat,
      lng: passengerLng,
      timestamp: Date.now(),
    };
    io.emit('PASSENGER_PING', broadcastPayload);
    io.emit('driver:ping_received', broadcastPayload);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Disconnected: ${socket.id}`);
    for (const [id, driver] of activeDrivers.entries()) {
      if (driver.socketId === socket.id) {
        activeDrivers.delete(id);
        io.emit('DRIVER_STATUS_CHANGE', {
          driverId: id,
          status: 'OFFLINE',
          isOnline: false,
          isPublic: false,
          campusLocation: driver.campusLocation || 'Offline',
          timestamp: Date.now(),
        });
        io.emit('server:nearby_autos', Array.from(activeDrivers.values()));
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 SpotHail Backend Server listening on port ${PORT}`);
});
