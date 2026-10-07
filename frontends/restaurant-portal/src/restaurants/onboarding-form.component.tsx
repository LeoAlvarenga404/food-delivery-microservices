import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import {
  onboardRestaurant,
  problemOf,
  type Onboarding,
  type RestaurantApi,
} from '../restaurant-api/restaurant-api.adapter.ts';
import { Alert } from './alert.component.tsx';
import {
  daysOfWeek,
  emptyOnboardingForm,
  onboardingFormSchema,
  type OnboardingFormValues,
} from './onboarding-form.message-mapper.ts';

type OnboardingFormMethods = UseFormReturn<OnboardingFormValues, unknown, Onboarding>;

type TextField = Exclude<keyof OnboardingFormValues, 'openingDays'>;

const textFields: readonly (readonly [TextField, string])[] = [
  ['name', 'Name'],
  ['category', 'Category'],
  ['street', 'Street'],
  ['number', 'Number'],
  ['city', 'City'],
  ['postalCode', 'Postal code'],
  ['latitude', 'Latitude'],
  ['longitude', 'Longitude'],
  ['timeZone', 'Time zone'],
  ['minimumOrder', 'Minimum order'],
];

function toDayLabel(dayOfWeek: string): string {
  return `${dayOfWeek.charAt(0)}${dayOfWeek.slice(1).toLowerCase()}`;
}

function TextFields({ form }: { readonly form: OnboardingFormMethods }): ReactNode {
  return textFields.map(([field, label]) => (
    <p key={field}>
      <label>
        {label} <input {...form.register(field)} />
      </label>{' '}
      <Alert message={form.formState.errors[field]?.message} />
    </p>
  ));
}

function OpeningDays({ form }: { readonly form: OnboardingFormMethods }): ReactNode {
  return (
    <fieldset>
      <legend>Opening hours (leave a day empty when the restaurant is closed)</legend>
      {daysOfWeek.map((dayOfWeek, index) => (
        <p key={dayOfWeek}>
          <label>
            {toDayLabel(dayOfWeek)} opens at{' '}
            <input type="time" {...form.register(`openingDays.${index}.opensAt`)} />
          </label>{' '}
          <label>
            {toDayLabel(dayOfWeek)} closes at{' '}
            <input type="time" {...form.register(`openingDays.${index}.closesAt`)} />
          </label>
        </p>
      ))}
    </fieldset>
  );
}

function useOnboarding(api: RestaurantApi) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (onboarding: Onboarding) => onboardRestaurant(api, onboarding),
    onSuccess: async (onboarded) => {
      if ('problem' in onboarded) return;
      await queryClient.invalidateQueries({ queryKey: ['memberships'] });
      const { restaurantId } = onboarded;
      await navigate({ to: '/restaurants/$restaurantId', params: { restaurantId } });
    },
  });
}

export function OnboardingForm({ api }: { readonly api: RestaurantApi }): ReactNode {
  const form = useForm({
    resolver: zodResolver(onboardingFormSchema),
    defaultValues: emptyOnboardingForm,
  });
  const onboarding = useOnboarding(api);
  const submit = form.handleSubmit((onboardingBody) => {
    onboarding.mutate(onboardingBody);
  });
  return (
    <main>
      <h1>Onboard a restaurant</h1>
      <form onSubmit={(event) => void submit(event)}>
        <TextFields form={form} />
        <OpeningDays form={form} />
        <button type="submit" disabled={onboarding.isPending}>
          Onboard the restaurant
        </button>{' '}
        <Alert message={problemOf(onboarding.data)} />
      </form>
    </main>
  );
}
