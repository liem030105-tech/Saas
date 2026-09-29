import request from 'supertest';

import { testPrisma } from './db';
import { hashPassword } from '../../src/lib/password';
import { loginCredentials, seededUserName } from '../data/auth';
import { paths } from '../data/http';

import type { Express } from 'express';

/** Creates the user of `loginCredentials` (with a real bcrypt hash of its password). */
export async function seedLoginUser() {
  const { email, password } = loginCredentials;
  return testPrisma.user.create({
    data: { email, name: seededUserName, passwordHash: await hashPassword(password) },
  });
}

/** Signs in as the seeded user through POST /auth/login. */
export async function loginAs(app: Express) {
  const { email, password } = loginCredentials;
  const res = await request(app).post(paths.login).send({ email, password }).expect(200);
  return {
    res,
    accessToken: res.body.data.accessToken as string,
    userId: res.body.data.user.id as string,
  };
}
