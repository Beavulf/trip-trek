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

interface DayActivationTripUpdater {
  trip: {
    updateMany(args: {
      where: {
        id: string;
        creationSource: "blank";
        firstDayAddedAt: null;
      };
      data: { firstDayAddedAt: Date };
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

// То же для «первого дня»: цель first_day_added (спека acquisition-funnel) —
// один раз на поездку, только для созданных с нуля поездок
export async function claimFirstDayAdded(
  tx: DayActivationTripUpdater,
  tripId: string,
  createdAt = new Date(),
): Promise<boolean> {
  const result = await tx.trip.updateMany({
    where: {
      id: tripId,
      creationSource: "blank",
      firstDayAddedAt: null,
    },
    data: { firstDayAddedAt: createdAt },
  });
  return result.count === 1;
}
