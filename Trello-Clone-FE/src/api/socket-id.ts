// The id of this tab's realtime connection while it is connected (lib/socket.ts sets it). REST
// requests send it as `X-Socket-Id`, so the server leaves this tab out of the events its own
// change causes (docs/architecture/realtime.md → Own changes); the user's other tabs still hear
// them.
let socketId: string | null = null;

export const getSocketId = () => socketId;

export const setSocketId = (id: string | null) => {
  socketId = id;
};
