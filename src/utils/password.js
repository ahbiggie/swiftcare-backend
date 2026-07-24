// Contract: hashing and verification both go through here. No model calls
// bcrypt directly.

import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export const hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);

export const comparePassword = (candidate, hash) => bcrypt.compare(candidate, hash);
