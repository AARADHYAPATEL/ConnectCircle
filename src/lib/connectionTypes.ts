export type ConnectionRequestStatus = "pending" | "accepted" | "declined";
export type ConnectionRelationship =
  | "blocked"
  | "connected"
  | "incoming_request"
  | "none"
  | "outgoing_request";

export type ConnectionRequest = {
  id: string;
  fromUsername: string;
  toUsername: string;
  status: ConnectionRequestStatus;
  createdAt: string;
  respondedAt?: string;
};

export type Friendship = {
  id: string;
  usernames: [string, string];
  createdAt: string;
  requestId: string;
};

export type BlockedConnection = {
  id: string;
  blockerUsername: string;
  blockedUsername: string;
  createdAt: string;
  removedFromListAt?: string;
};

export type ConnectionSummary = {
  incomingRequests: ConnectionRequest[];
  outgoingRequests: ConnectionRequest[];
  friends: Friendship[];
  blockedUsers: BlockedConnection[];
};

export type ConnectionRelationshipSummary = {
  friendship: Friendship | null;
  relationship: ConnectionRelationship;
};
