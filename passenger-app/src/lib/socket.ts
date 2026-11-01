import { io, Socket } from 'socket.io-client';

const getSocketServerUrl = (): string => {
  let envUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_SOCKET_SERVER_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL;
  if (envUrl) {
    envUrl = envUrl.trim().replace(/\/$/, '');
    if (!envUrl.startsWith('http://') && !envUrl.startsWith('https://')) {
      envUrl = `https://${envUrl}`;
    }
    if (!envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl;
    }
  }
  if (
    typeof window !== 'undefined' &&
    window.location.hostname &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${window.location.hostname}:4000`;
  }
  return envUrl || 'http://localhost:4000';
};

/**
 * Singleton service for managing the Socket.io client connection.
 * Prevents multiple connections during Next.js client renders or hot reloads.
 */
class SocketService {
  private static instance: SocketService;
  private socket: Socket | null = null;

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  /**
   * Returns existing socket instance or initializes a new one.
   */
  public getSocket(): Socket {
    if (!this.socket) {
      const serverUrl = getSocketServerUrl();
      this.socket = io(serverUrl, {
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ['websocket', 'polling'],
      });
    }
    return this.socket;
  }

  /**
   * Connects the socket to the backend server.
   */
  public connect(): Socket {
    const socket = this.getSocket();
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  /**
   * Disconnects and cleans up socket connection.
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Returns true if currently connected.
   */
  public isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketService = SocketService.getInstance();
export const getSocket = (): Socket => socketService.getSocket();
export const connectSocket = (): Socket => socketService.connect();
export const disconnectSocket = (): void => socketService.disconnect();

export default socketService;
