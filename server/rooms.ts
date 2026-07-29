// Trip rooms management — tracks which sockets are in which trip rooms
// Map<tripId, Set<socketId>>

export class TripRooms {
  private rooms = new Map<string, Set<string>>();

  join(tripId: string, socketId: string): void {
    if (!this.rooms.has(tripId)) this.rooms.set(tripId, new Set());
    this.rooms.get(tripId)?.add(socketId);
  }

  leave(tripId: string, socketId: string): void {
    this.rooms.get(tripId)?.delete(socketId);
    if (this.rooms.get(tripId)?.size === 0) this.rooms.delete(tripId);
  }

  // Remove socket from all rooms (on disconnect)
  removeSocket(socketId: string): void {
    this.rooms.forEach((members, tripId) => {
      members.delete(socketId);
      if (members.size === 0) this.rooms.delete(tripId);
    });
  }

  getRoomSize(tripId: string): number {
    return this.rooms.get(tripId)?.size || 0;
  }

  has(tripId: string): boolean {
    return this.rooms.has(tripId);
  }
}
