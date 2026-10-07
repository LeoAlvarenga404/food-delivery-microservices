'use server';

import { redirect } from 'next/navigation';
import {
  createConsumerApi,
  sendConsumerRegistration,
  type ConsumerRegistration,
} from '../consumer-api/consumer-api.adapter.ts';
import { redirectToSignIn, requireAccessToken } from '../session/session-cookie.adapter.ts';

function readField(form: FormData, name: string): string {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry : '';
}

function toRegistration(form: FormData): ConsumerRegistration {
  return {
    name: readField(form, 'name'),
    email: readField(form, 'email'),
    addresses: [
      {
        street: readField(form, 'street'),
        number: readField(form, 'number'),
        city: readField(form, 'city'),
        postalCode: readField(form, 'postalCode'),
      },
    ],
  };
}

export async function registerConsumer(
  previousProblem: string | undefined,
  form: FormData,
): Promise<string | undefined> {
  const accessToken = await requireAccessToken('/profile');
  const result = await sendConsumerRegistration(
    createConsumerApi(accessToken),
    toRegistration(form),
  );
  if ('consumerId' in result) redirect('/profile');
  if ('isSignInRequired' in result) redirectToSignIn('/profile');
  return result.problem;
}
