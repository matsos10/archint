import { resetAndMigrate } from '../packages/db/src/testing';

export default async function setup() {
  await resetAndMigrate();
}
