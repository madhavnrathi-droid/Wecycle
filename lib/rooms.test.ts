import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOMS, MAHE_ROOM, NMIMS_MUMBAI, NMIMS_BENGALURU, CAMPUS_ROOMS, ROOM_LABELS,
  roomById, roomByKey, isNmimsEmail, isPrivateRoom, roomReadRole,
  getActiveRoom, setActiveRoom, onRoomChange,
} from './rooms';
import { emailGateProblem } from './emailDomain';

test('NMIMS addresses: the two roots and their subdomains, nothing that merely contains them', () => {
  assert.ok(isNmimsEmail('riya.shah@nmims.in'));
  assert.ok(isNmimsEmail('Prof.Rao@NMIMS.EDU'));
  assert.ok(isNmimsEmail('a@sbm.nmims.edu'));
  assert.ok(!isNmimsEmail('a@nmims.in.attacker.net'));
  assert.ok(!isNmimsEmail('a@notnmims.in'));
  assert.ok(!isNmimsEmail('a@nmims.ac.in'));
  assert.ok(!isNmimsEmail('nmims@gmail.com'));
  assert.ok(!isNmimsEmail(''));
  assert.ok(!isNmimsEmail('a@.nmims.in'));
});

test('the sign-up gate lets NMIMS in, keeps Manipal, and still refuses the rest', () => {
  assert.equal(emailGateProblem('riya.shah@nmims.in', 'signup'), null);
  assert.equal(emailGateProblem('prof.rao@nmims.edu', 'signup'), null);
  assert.equal(emailGateProblem('x.smiblr2024@learner.manipal.edu', 'signup'), null);
  assert.equal(emailGateProblem('riya@nmims.com', 'signup'), 'Did you mean @nmims.in?');
  assert.equal(emailGateProblem('riya@nmims.ed', 'signup'), 'Did you mean @nmims.edu?');
  const gmail = emailGateProblem('someone@gmail.com', 'signup') ?? '';
  assert.match(gmail, /NMIMS/);
  assert.match(gmail, /Manipal/);
});

test('rooms: ids unique, labels valid Appwrite labels, Manipal is the only public room', () => {
  assert.equal(new Set(ROOMS.map(r => r.id)).size, ROOMS.length);
  for (const l of ROOM_LABELS) assert.match(l, /^[a-zA-Z0-9]{1,36}$/);
  assert.deepEqual(ROOMS.filter(r => !isPrivateRoom(r)), [MAHE_ROOM]);
  assert.deepEqual(CAMPUS_ROOMS.NMIMS.map(r => r.campus), ['Mumbai', 'Bengaluru']);
});

test('an unknown or missing room is Manipal — never a private room by accident', () => {
  assert.equal(roomById(null), MAHE_ROOM);
  assert.equal(roomById(undefined), MAHE_ROOM);
  assert.equal(roomById('not-a-room'), MAHE_ROOM);
  assert.equal(roomById(NMIMS_BENGALURU.id), NMIMS_BENGALURU);
  assert.equal(roomByKey('nmims-mumbai'), NMIMS_MUMBAI);
  assert.equal(roomByKey('bogus'), null);
});

test('rows written in a room are readable by that room only', () => {
  assert.equal(roomReadRole(MAHE_ROOM), 'any');
  assert.equal(roomReadRole(NMIMS_MUMBAI), 'label:nmimsmumbai');
  assert.equal(roomReadRole(NMIMS_BENGALURU), 'label:nmimsbengaluru');
});

test('switching rooms notifies once, and only on a real change', () => {
  const seen: string[] = [];
  const off = onRoomChange(r => seen.push(r.key));
  setActiveRoom(MAHE_ROOM.id);
  assert.equal(getActiveRoom(), MAHE_ROOM);
  assert.equal(setActiveRoom(NMIMS_MUMBAI.id), true);
  assert.equal(setActiveRoom(NMIMS_MUMBAI.id), false);
  assert.equal(getActiveRoom(), NMIMS_MUMBAI);
  setActiveRoom(null);
  off();
  assert.deepEqual(seen, ['nmims-mumbai', 'mahe']);
});

test('the query builder scopes posts and lists of people to the room on screen', async () => {
  const { roomFilterFor } = await import('./appwrite/roomScope');
  setActiveRoom(NMIMS_BENGALURU.id);
  for (const t of ['listings', 'requests', 'events', 'lost_found_reports']) {
    const f = roomFilterFor(t, false) ?? '';
    assert.match(f, /community_id/);
    assert.ok(f.includes(NMIMS_BENGALURU.id), t);
  }
  /* a search or list of people is scoped; fetching named people is not */
  assert.ok(roomFilterFor('profiles', false));
  assert.equal(roomFilterFor('profiles', true), null);
  /* tables that are not a room's posts are left alone */
  assert.equal(roomFilterFor('saves', false), null);
  assert.equal(roomFilterFor('messages', false), null);
  setActiveRoom(MAHE_ROOM.id);
  assert.ok((roomFilterFor('listings', false) ?? '').includes(MAHE_ROOM.id));
});
