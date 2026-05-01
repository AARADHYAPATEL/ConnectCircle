export type ConnectionRequestStatus = "pending" | "accepted" | "declined";

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
};

export type ConnectionSummary = {
  incomingRequests: ConnectionRequest[];
  outgoingRequests: ConnectionRequest[];
  friends: Friendship[];
  blockedUsers: BlockedConnection[];
};
