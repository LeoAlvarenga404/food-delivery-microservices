import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import {
  problemOf,
  readRestaurant,
  reviseMenu,
  type MenuItem,
  type RestaurantApi,
  type RestaurantView,
} from '../restaurant-api/restaurant-api.adapter.ts';
import { Alert } from './alert.component.tsx';
import {
  describeRevision,
  menuFormSchema,
  newMenuRow,
  toMenuForm,
  type MenuForm as MenuFormValues,
} from './menu-form.message-mapper.ts';

type MenuFormMethods = UseFormReturn<MenuFormValues, unknown, readonly MenuItem[]>;

interface MenuRowFieldsProps {
  readonly form: MenuFormMethods;
  readonly index: number;
  readonly onRemove: (index: number) => void;
}

interface MenuFormProps {
  readonly restaurant: RestaurantView;
  readonly isSaving: boolean;
  readonly onSave: (menuItems: readonly MenuItem[]) => void;
}

interface MenuEditorProps {
  readonly api: RestaurantApi;
  readonly restaurantId: string;
}

const restaurantParametersSchema = z.object({ restaurantId: z.uuid() });

function MenuRowFields({ form, index, onRemove }: MenuRowFieldsProps): ReactNode {
  const position = String(index + 1);
  return (
    <li>
      <label>
        Name of item {position} <input {...form.register(`menuRows.${index}.name`)} />
      </label>{' '}
      <label>
        Price of item {position} <input {...form.register(`menuRows.${index}.price`)} />
      </label>{' '}
      <label>
        <input type="checkbox" {...form.register(`menuRows.${index}.isAvailable`)} /> Item{' '}
        {position} is available
      </label>{' '}
      <button
        type="button"
        onClick={() => {
          onRemove(index);
        }}
      >
        Remove item {position}
      </button>{' '}
      <Alert message={form.formState.errors.menuRows?.[index]?.price?.message} />
    </li>
  );
}

function MenuForm({ restaurant, isSaving, onSave }: MenuFormProps): ReactNode {
  const form = useForm({
    resolver: zodResolver(menuFormSchema),
    defaultValues: toMenuForm(restaurant),
  });
  const menuRows = useFieldArray({ control: form.control, name: 'menuRows' });
  const addMenuRow = (): void => {
    menuRows.append(newMenuRow(crypto.randomUUID()));
  };
  return (
    <form onSubmit={(event) => void form.handleSubmit(onSave)(event)}>
      <ol aria-label="Menu">
        {menuRows.fields.map((field, index) => (
          <MenuRowFields key={field.id} form={form} index={index} onRemove={menuRows.remove} />
        ))}
      </ol>
      <button type="button" onClick={addMenuRow}>
        Add an item
      </button>{' '}
      <button type="submit" disabled={isSaving}>
        Save the menu
      </button>
    </form>
  );
}

function MenuEditor({ api, restaurantId }: MenuEditorProps): ReactNode {
  const queryClient = useQueryClient();
  const queryKey = ['restaurant', restaurantId];
  const restaurant = useQuery({ queryKey, queryFn: () => readRestaurant(api, restaurantId) });
  const revision = useMutation({
    mutationFn: (menuItems: readonly MenuItem[]) => reviseMenu(api, restaurantId, menuItems),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  if (restaurant.data === undefined) return <p>Loading the restaurant…</p>;
  if ('problem' in restaurant.data) return <Alert message={problemOf(restaurant.data)} />;
  const save = (menuItems: readonly MenuItem[]): void => {
    revision.mutate(menuItems);
  };
  return (
    <main>
      <h1>{restaurant.data.name}</h1>
      <MenuForm
        key={restaurant.data.version}
        restaurant={restaurant.data}
        isSaving={revision.isPending}
        onSave={save}
      />
      <p role="status">{describeRevision(revision.data)}</p>
    </main>
  );
}

export function MenuPage({ api }: { readonly api: RestaurantApi }): ReactNode {
  const parameters = restaurantParametersSchema.safeParse(useParams({ strict: false }));
  if (!parameters.success) return <Alert message="This restaurant does not exist." />;
  return <MenuEditor api={api} restaurantId={parameters.data.restaurantId} />;
}
