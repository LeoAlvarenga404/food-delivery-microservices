'use client';

import { useActionState, type ReactNode } from 'react';
import { registerConsumer } from './register-consumer.action.ts';

const fields: readonly (readonly [string, string])[] = [
  ['name', 'Name'],
  ['email', 'Email'],
  ['street', 'Street'],
  ['number', 'Number'],
  ['city', 'City'],
  ['postalCode', 'Postal code'],
];

export function RegistrationForm(): ReactNode {
  const [problem, register, isRegistering] = useActionState(registerConsumer, undefined);
  return (
    <main>
      <h1>Register</h1>
      <form action={register} aria-label="Registration">
        {fields.map(([name, label]) => (
          <p key={name}>
            <label>
              {label} <input name={name} required />
            </label>
          </p>
        ))}
        {problem === undefined ? null : <p role="alert">{problem}</p>}
        <button type="submit" disabled={isRegistering}>
          Register
        </button>
      </form>
    </main>
  );
}
