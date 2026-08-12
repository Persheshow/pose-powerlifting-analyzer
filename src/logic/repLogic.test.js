import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, processDeadlift, processOverheadPress, processSquat } from './repLogic.js';

function landmark(x, y, visibility = 1) {
  return { x, y, z: 0, visibility };
}

function leftSidePose() {
  const pose = Array.from({ length: 33 }, () => landmark(0.5, 0.5));
  pose[11] = landmark(0.4, 0.2);
  pose[23] = landmark(0.4, 0.45);
  pose[25] = landmark(0.4, 0.7);
  pose[27] = landmark(0.4, 0.95);
  return pose;
}

test('deadlift freezes when the ankle used by the knee angle is hidden', () => {
  const pose = leftSidePose();
  pose[27].visibility = 0;
  const result = processDeadlift(createInitialState(0), pose, 'LEFT', 1500);
  assert.equal(result.event, null);
  assert.equal(result.primaryAngle, null);
  assert.equal(result.secondaryAngle, null);
  assert.equal(result.isTarget, false);
});

test('a new movement phase refreshes the inactivity timeout', () => {
  const state = createInitialState(0);
  state.movementState = 'DESCENDING';
  const result = processSquat(state, leftSidePose(), 'LEFT', 6000);
  assert.equal(result.state.movementState, 'DESCENDING');
  assert.equal(result.state.lastActiveTime, 6000);
  assert.equal(result.state.lastObservedMovementState, 'DESCENDING');
});

test('an unchanged phase is reset after the inactivity timeout', () => {
  const state = createInitialState(0);
  state.movementState = 'DESCENDING';
  state.lastObservedMovementState = 'DESCENDING';
  const result = processSquat(state, leftSidePose(), 'LEFT', 6000);
  assert.equal(result.state.movementState, 'STANDING');
});

test('a deep squat is counted without a separate ankle-trajectory filter', () => {
  const state = createInitialState(0);
  state.movementState = 'ASCENDING';
  state.smoothedPrimary = 170;
  state.metrics.deepEnough = true;
  state.metrics.lowestKneeAngle = 80;

  const result = processSquat(state, leftSidePose(), 'LEFT', 1500);
  assert.equal(result.event?.type, 'VALID_REP');
  assert.equal(result.state.movementState, 'STANDING');
});

test('overhead press counts full elbow extension without a wrist-trajectory filter', () => {
  const pose = leftSidePose();
  pose[11] = landmark(0.4, 0.4);
  pose[13] = landmark(0.4, 0.3);
  pose[15] = landmark(0.4, 0.2);

  const state = createInitialState(0);
  state.movementState = 'ASCENDING';
  state.smoothedPrimary = 150;
  state.metrics.lowestElbowAngle = 90;

  const result = processOverheadPress(state, pose, 'LEFT', 1500);
  assert.equal(result.event?.type, 'VALID_REP');
  assert.equal(result.state.movementState, 'STANDING');
});
