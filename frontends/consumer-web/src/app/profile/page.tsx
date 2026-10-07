import type { ReactNode } from 'react';
import { createConsumerApi } from '../../consumer-api/consumer-api.adapter.ts';
import { RegistrationForm } from '../../profile/registration-form.component.tsx';
import { redirectToSignIn, requireAccessToken } from '../../session/session-cookie.adapter.ts';

export default async function ProfilePage(): Promise<ReactNode> {
  const accessToken = await requireAccessToken('/profile');
  const { data: consumer, response } = await createConsumerApi(accessToken).GET('/v1/consumers/me');
  if (response.status === 401) redirectToSignIn('/profile');
  if (response.status === 404) return <RegistrationForm />;
  if (consumer === undefined)
    throw new Error(`reading the profile answered ${String(response.status)}`);
  return (
    <main>
      <h1>Your profile</h1>
      <dl>
        <dt>Name</dt>
        <dd>{consumer.name}</dd>
        <dt>Email</dt>
        <dd>{consumer.email}</dd>
        <dt>Status</dt>
        <dd>{consumer.status}</dd>
      </dl>
    </main>
  );
}
