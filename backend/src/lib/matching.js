// Sorting/ranking happens AFTER PostGIS excludes non-nearby rides.
// SRS specifies location + time ranking but not weights. These are provisional team-adjustable weights.
export const DEFAULT_MATCH_SETTINGS = Object.freeze({pickupRadiusMeters:5000,destinationRadiusMeters:6000,timeWindowMinutes:60});
export function scoreMatch({pickupDistanceMeters,destinationDistanceMeters,timeDifferenceMinutes},settings=DEFAULT_MATCH_SETTINGS) {
  const p=Math.max(0,1-pickupDistanceMeters/settings.pickupRadiusMeters);
  const d=Math.max(0,1-destinationDistanceMeters/settings.destinationRadiusMeters);
  const t=Math.max(0,1-timeDifferenceMinutes/settings.timeWindowMinutes);
  return Math.round((0.50*p+0.25*d+0.25*t)*1000)/10;
}
export function rankMatches(rows, settings=DEFAULT_MATCH_SETTINGS) {
  return rows.map(row => {
    const pickupDistanceMeters=Number(row.pickup_distance_meters);
    const destinationDistanceMeters=Number(row.destination_distance_meters);
    const timeDifferenceMinutes=Number(row.time_difference_minutes);
    return {
      ...row,
      pickupDistanceMeters:Math.round(pickupDistanceMeters),
      destinationDistanceMeters:Math.round(destinationDistanceMeters),
      timeDifferenceMinutes:Math.round(timeDifferenceMinutes),
      matchScore:scoreMatch({pickupDistanceMeters,destinationDistanceMeters,timeDifferenceMinutes},settings)
    };
  }).sort((a,b) => b.matchScore-a.matchScore || a.pickupDistanceMeters-b.pickupDistanceMeters);
}
