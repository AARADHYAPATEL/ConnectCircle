const userStorageConfigurationText =
  "ConnectCircle user storage is not configured.";

export const userStorageUnavailableMessage =
  "ConnectCircle's production database is not connected yet. Add DATABASE_URL or POSTGRES_URL in Vercel, then redeploy.";

export function isUserStorageConfigurationError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes(userStorageConfigurationText)
  );
}
