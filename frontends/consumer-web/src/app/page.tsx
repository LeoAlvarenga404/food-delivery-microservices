import type { ReactNode } from 'react';
import { SearchResults } from '../search/search-results.component.tsx';

export default async function SearchPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly text?: string | string[] }>;
}): Promise<ReactNode> {
  const { text } = await searchParams;
  const searchText = typeof text === 'string' ? text.trim() : '';
  return (
    <main>
      <h1>Find a restaurant</h1>
      <form action="/" method="get">
        <label>
          Restaurant or dish <input name="text" defaultValue={searchText} />
        </label>{' '}
        <button type="submit">Search</button>
      </form>
      {searchText === '' ? null : <SearchResults text={searchText} />}
    </main>
  );
}
