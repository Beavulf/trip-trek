interface ActivationTripUpdater {
  trip: {
    updateMany(args: {
      where: {
        id: string;
        creationSource: "blank";
        firstUserPlaceAddedAt: null;
      };
      data: { firstUserPlaceAddedAt: Date };
    }): Promise<{ count: number }>;
  };
}

export async function claimFirstUserPlaceAdded(
  tx: ActivationTripUpdater,
  tripId: string,
  createdAt = new Date(),
): Promise<boolean> {
  const result = await tx.trip.updateMany({
    where: {
      id: tripId,
      creationSource: "blank",
      firstUserPlaceAddedAt: null,
    },
    data: { firstUserPlaceAddedAt: createdAt },
  });
  return result.count === 1;
}
