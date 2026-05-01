import type { Circle } from "@/lib/circleTypes";

function formatCircleNameList(circleNames: string[]) {
  if (circleNames.length === 1) {
    return circleNames[0];
  }

  if (circleNames.length === 2) {
    return `${circleNames[0]} and ${circleNames[1]}`;
  }

  return `${circleNames[0]}, ${circleNames[1]}, and ${circleNames[2]}`;
}

export function getCircleSharingTargetText(
  circleIds: string[],
  circles: Circle[],
) {
  if (circleIds.length > 3) {
    return `${circleIds.length} circles`;
  }

  const circleNamesById = new Map(
    circles.map((circle) => [circle.id, circle.name]),
  );
  const circleNames = circleIds
    .map((circleId) => circleNamesById.get(circleId))
    .filter((circleName): circleName is string => Boolean(circleName));

  if (circleNames.length === circleIds.length && circleNames.length > 0) {
    return formatCircleNameList(circleNames);
  }

  return `${circleIds.length} ${circleIds.length === 1 ? "circle" : "circles"}`;
}
