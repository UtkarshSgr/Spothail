# SpotHail 🛺

[![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io/)

**SpotHail** is a real-time, WebSocket-powered radar platform conceptualized and built as an Innovation & Entrepreneurship (I&E) course project. It is designed to map the unorganized shared auto and e-rickshaw sector.

Over 60 million daily commuters in India rely on informal shared transit, yet this massive fleet remains digitally invisible. SpotHail was developed to solve the "blind curb wait" by providing commuters with live map visibility and real-time seat tracking, while demonstrating a zero-typing, low-bandwidth digital HUD for drivers. 

---

## ✨ Key Features

###  For Drivers (The Supply Side)
*   **Zero-Typing HUD:** Designed for chaotic driving environments with tactile `[+]` and `[-]` seat capacity buttons.
*   **Acoustic Feedback:** Integrated Web Audio API chimes confirm updates without requiring the driver to look at the screen.
*   **Ultra-Low Bandwidth:** Sends lightweight 100–200 byte telemetry packets.
*   **Background GPS Wake-Lock:** Maintains consistent location polling even when the screen is locked.
*   **Automated Stale-Auto Purge:** Vehicles are automatically removed from the active map if no movement or update is detected for 90 seconds.

###  For Commuters (The Demand Side)
*   **Real-Time Corridor Radar:** View exactly where shared autos are on specific transit routes.
*   **Live Seat Capacity:** Know exactly how many seats are empty before the auto pulls up to the curb.
*   **Frictionless Experience:** No ride booking, no OTPs, and no surge pricing. 

---

## 🏗️ System Architecture & Tech Stack

SpotHail was engineered as a lightweight, highly concurrent proof-of-concept to minimize cloud overhead.

*   **Frontend:** `Next.js` (React), optimized for fast mobile-web rendering.
*   **Real-Time Telemetry:** `Node.js` with `Socket.io` handling high-frequency, bidirectional WebSocket connections for sub-200ms state updates.
*   **Mapping Engine:** `Leaflet` utilizing completely free and open-source OpenStreetMap (OSM) tiles for performant, cost-free geospatial rendering.
*   **Infrastructure:** Containerized via `Docker` for deployment on cost-efficient cloud providers (DigitalOcean/Render).

---

## 🚀 Local Development Setup

Follow these steps to run the SpotHail project locally for development and testing.

### Prerequisites
*   Node.js (v18.x or higher)
*   npm or yarn

### Installation

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/UtkarshSgr/SpotHail.git](https://github.com/UtkarshSgr/SpotHail.git)
    cd SpotHail
    ```

2.  **Install dependencies**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Configure Environment Variables**
    Create a `.env.local` file in the root directory and add the following keys:
    ```env
    NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
    PORT=3000
    ```

4.  **Run the real-time WebSocket server**
    ```bash
    npm run server:dev
    ```

5.  **Run the Next.js client**
    ```bash
    npm run dev
    ```

6.  **Access the application**
    Open `http://localhost:3000` in your browser. 

---

## 📡 WebSocket Event Reference

SpotHail utilizes specific event triggers to maintain map liquidity and data integrity:

| Event Name | Direction | Payload Example | Description |
| :--- | :--- | :--- | :--- |
| `driver_connect` | Client → Server | `{ driverId: "123", route: "corridor-A" }` | Initializes driver session in a specific route room. |
| `update_location` | Client → Server | `{ lat: 11.258, lng: 75.780, speed: 15 }` | Fires on GPS coordinate change. |
| `update_seats` | Client → Server | `{ seatsAvailable: 2 }` | Triggered via the tactile `[+]`/`[-]` HUD buttons. |
| `map_sync` | Server → Client | `[{ driverId, lat, lng, seats... }]` | Broadcasts active corridor state to commuters. |
| `stale_purge` | Server-side | `driverId` | Internal trigger executing after 90 seconds of inactivity. |

---
