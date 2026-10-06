import { describe, expect, it } from 'vitest';
import {
  emptyOnboardingForm,
  onboardingFormSchema,
  type OnboardingForm,
} from './onboarding-form.message-mapper.ts';

const filledForm: OnboardingForm = {
  ...emptyOnboardingForm,
  name: 'Cantina Nonna',
  category: 'Italian',
  street: 'Rua Augusta',
  number: '1500',
  city: 'Sao Paulo',
  postalCode: '01304-001',
  latitude: '-23.5614',
  longitude: ' -46.6559 ',
  openingDays: emptyOnboardingForm.openingDays.map((openingDay) =>
    openingDay.dayOfWeek === 'FRIDAY' || openingDay.dayOfWeek === 'SATURDAY'
      ? { ...openingDay, opensAt: '18:00', closesAt: '02:00' }
      : openingDay,
  ),
  minimumOrder: '20.5',
};

function issueMessages(form: OnboardingForm): readonly string[] {
  const parsed = onboardingFormSchema.safeParse(form);
  return parsed.success
    ? []
    : parsed.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`);
}

describe('the onboarding form', () => {
  it('becomes the onboarding the restaurant API takes', () => {
    expect(onboardingFormSchema.parse(filledForm)).toEqual({
      name: 'Cantina Nonna',
      category: 'Italian',
      address: {
        street: 'Rua Augusta',
        number: '1500',
        city: 'Sao Paulo',
        postalCode: '01304-001',
        location: { latitude: -23.5614, longitude: -46.6559 },
      },
      timeZone: 'America/Sao_Paulo',
      openingHours: [
        { dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '02:00' },
        { dayOfWeek: 'SATURDAY', opensAt: '18:00', closesAt: '02:00' },
      ],
      minimumOrderInCents: '2050',
    });
  });

  it('starts with every day of the week closed and the time zone of Sao Paulo', () => {
    expect(emptyOnboardingForm.openingDays.map(({ dayOfWeek }) => dayOfWeek)).toEqual([
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
      'SUNDAY',
    ]);
    expect(emptyOnboardingForm.timeZone).toBe('America/Sao_Paulo');
  });

  it('keeps a day with only one of its times, so the restaurant API names the opening hours', () => {
    const openingDays = filledForm.openingDays.map((openingDay) =>
      openingDay.dayOfWeek === 'MONDAY' ? { ...openingDay, opensAt: '11:00' } : openingDay,
    );

    expect(onboardingFormSchema.parse({ ...filledForm, openingDays }).openingHours).toEqual([
      { dayOfWeek: 'MONDAY', opensAt: '11:00', closesAt: '' },
      { dayOfWeek: 'FRIDAY', opensAt: '18:00', closesAt: '02:00' },
      { dayOfWeek: 'SATURDAY', opensAt: '18:00', closesAt: '02:00' },
    ]);
  });

  it.each([
    [{ minimumOrder: '20,50' }, 'minimumOrder: Write an amount such as 20.00.'],
    [{ latitude: '' }, 'latitude: Write a number such as -23.5614.'],
    [{ longitude: 'west' }, 'longitude: Write a number such as -23.5614.'],
  ])('refuses %j before sending it', (change, expected) => {
    expect(issueMessages({ ...filledForm, ...change })).toEqual([expected]);
  });
});
