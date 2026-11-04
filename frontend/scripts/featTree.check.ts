// Self-check for the feat rules in src/lib/featTree.ts (no test framework in the frontend).
// Run: npx esbuild scripts/featTree.check.ts --bundle --platform=node --format=esm | node --input-type=module
// The system data (class features named in prerequisites) normally comes from a rule package; here it is made up.
import assert from 'node:assert/strict';
import { assignSlots, featKey, featureReqs, type FeatConfig } from '../src/lib/featTree.ts';

const cfg: FeatConfig = {
  choices: {}, repeatable: new Set(), seeds: [], core: [], ancestries: new Set(),
  featureReqs: {
    'battle cry': ['Battle Cry'],
    'spirit bond (companion)': [['Spirit Bond', 'Companion']],
    familiar: [['Arcane Link', 'Familiar'], ['Bloodline', 'Fey']],
    'star sight': [],
  },
};
const F = (level: number, name: string, ...options: string[]) =>
  ({ level, name, description: '', options: options.map((o) => ({ name: o, description: '' })) });
// Excerpts of GET /rules/features/{class} (names as on the dashboard).
const warrior = [F(4, 'Battle Cry'), F(3, 'Spirit Bond', 'Companion', 'Weapon')];
const mage = [F(1, 'Arcane Link', 'Familiar', 'Bonded Object')];
const sorcerer = [F(1, 'Bloodline', 'Fey', 'Dragon')];

assert.equal(featKey('Cleave, Great'), featKey('Great Cleave'));

// Gained at a level.
assert.deepEqual(featureReqs('battle cry class feature', warrior, 1, {}, cfg).state, 'locked');
assert.match(featureReqs('battle cry class feature', warrior, 1, {}, cfg).why[0], /4/);
assert.equal(featureReqs('battle cry class feature', warrior, 4, {}, cfg).state, 'ok');
// Another class's feature: never; a feature the system doesn't offer at all: never.
assert.equal(featureReqs('battle cry class feature', mage, 20, {}, cfg).state, 'never');
assert.equal(featureReqs('star sight class feature', warrior, 20, {}, cfg).state, 'never');
// Option chosen on the dashboard.
const sb = 'spirit bond (companion) class feature';
assert.equal(featureReqs(sb, warrior, 9, { 'Spirit Bond': 'Weapon' }, cfg).state, 'locked');
assert.equal(featureReqs(sb, warrior, 9, { 'Spirit Bond': 'Companion' }, cfg).state, 'ok');
assert.equal(featureReqs('ability to acquire a new familiar', mage, 3, { 'Arcane Link': 'Familiar' }, cfg).state, 'ok');
assert.equal(featureReqs('ability to acquire a new familiar', mage, 3, { 'Arcane Link': 'Bonded Object' }, cfg).state, 'locked');
assert.equal(featureReqs('ability to acquire a new familiar', sorcerer, 3, { Bloodline: 'Fey' }, cfg).state, 'ok');
// Still loading: locked, not never.
assert.equal(featureReqs('battle cry class feature', undefined, 5, {}, cfg).state, 'locked');

// Slot matching: a restricted slot is filled first, a general feat may not steal it.
const slots = [
  { id: 'general', label: 'General', count: 1, ignorePrereqs: false, types: [], names: [], any: true },
  { id: 'style', label: 'Fighting style', count: 1, ignorePrereqs: true, types: [], names: [featKey('Rapid Shot')], any: false },
];
const feat = (name: string) => ({ id: 0, name, type: 'Combat', prerequisites: '', benefit: '', source: '' });
assert.deepEqual(assignSlots([feat('Rapid Shot'), feat('Dodge')], slots, (f, s) => s.any || s.names.includes(featKey(f.name))), ['style', 'general']);
assert.equal(assignSlots([feat('Dodge'), feat('Toughness')], slots, (f, s) => s.any || s.names.includes(featKey(f.name))), null);

console.log('featTree checks passed');
