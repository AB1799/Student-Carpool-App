import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoreMatch,rankMatches,DEFAULT_MATCH_SETTINGS} from '../src/lib/matching.js';
test('perfect proximity and time yields score 100',()=>{
  assert.equal(scoreMatch({pickupDistanceMeters:0,destinationDistanceMeters:0,timeDifferenceMinutes:0}),100);
});
test('boundary of accepted proximity and time yields zero',()=>{
  assert.equal(scoreMatch({pickupDistanceMeters:5000,destinationDistanceMeters:6000,timeDifferenceMinutes:60}),0);
});
test('score is nonnegative even for data outside configured window',()=>{
  assert.equal(scoreMatch({pickupDistanceMeters:99e3,destinationDistanceMeters:99e3,timeDifferenceMinutes:99e3}),0);
});
test('closer pickup ranks higher when other factors equal',()=>{
  const rows=[
    {id:'far',pickup_distance_meters:4000,destination_distance_meters:1000,time_difference_minutes:10},
    {id:'near',pickup_distance_meters:400,destination_distance_meters:1000,time_difference_minutes:10},
  ];
  assert.equal(rankMatches(rows)[0].id,'near');
});
test('ranking uses search-specific radius settings',()=>{
  const tuned={...DEFAULT_MATCH_SETTINGS,pickupRadiusMeters:1000};
  const score=scoreMatch({pickupDistanceMeters:500,destinationDistanceMeters:0,timeDifferenceMinutes:0},tuned);
  assert.equal(score,75);
});
