export type NotificationTone =
  | "circle"
  | "connection"
  | "message"
  | "mood"
  | "support";

export type AppNotification = {
  id: string;
  tone: NotificationTone;
  title: string;
  body: string;
  href: string;
  createdAt: string;
};

export type NotificationSummary = {
  lastSeenAt: string | null;
  notifications: AppNotification[];
  unreadCount: number;
};
