import { z } from 'zod';
import type { Onboarding } from '../restaurant-api/restaurant-api.adapter.ts';
import {
  amountTextPattern,
  toAmountInCents,
} from '../restaurant-api/restaurant-api-view.message-mapper.ts';

type DayOfWeek = Onboarding['openingHours'][number]['dayOfWeek'];

export const daysOfWeek: readonly DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

const coordinatePattern = /^-?\d{1,3}(?:\.\d{1,8})?$/;

const coordinateTextSchema = z
  .string()
  .trim()
  .regex(coordinatePattern, 'Write a number such as -23.5614.')
  .transform(Number);

const openingDaySchema = z.object({
  dayOfWeek: z.enum(daysOfWeek),
  opensAt: z.string(),
  closesAt: z.string(),
});

export const onboardingFormSchema = z
  .object({
    name: z.string(),
    category: z.string(),
    street: z.string(),
    number: z.string(),
    city: z.string(),
    postalCode: z.string(),
    latitude: coordinateTextSchema,
    longitude: coordinateTextSchema,
    timeZone: z.string(),
    openingDays: z.array(openingDaySchema),
    minimumOrder: z.string().trim().regex(amountTextPattern, 'Write an amount such as 20.00.'),
  })
  .transform((form): Onboarding => ({
    name: form.name,
    category: form.category,
    address: {
      street: form.street,
      number: form.number,
      city: form.city,
      postalCode: form.postalCode,
      location: { latitude: form.latitude, longitude: form.longitude },
    },
    timeZone: form.timeZone,
    openingHours: form.openingDays.filter(
      ({ opensAt, closesAt }) => opensAt !== '' || closesAt !== '',
    ),
    minimumOrderInCents: toAmountInCents(form.minimumOrder),
  }));

export type OnboardingForm = z.input<typeof onboardingFormSchema>;

export const emptyOnboardingForm: OnboardingForm = {
  name: '',
  category: '',
  street: '',
  number: '',
  city: '',
  postalCode: '',
  latitude: '',
  longitude: '',
  timeZone: 'America/Sao_Paulo',
  openingDays: daysOfWeek.map((dayOfWeek) => ({ dayOfWeek, opensAt: '', closesAt: '' })),
  minimumOrder: '',
};
