import type { ReactNode } from 'react';
import { createConsumerApi, searchRestaurants } from '../consumer-api/consumer-api.adapter.ts';
import { toHighlightSegments } from './search-highlight.message-mapper.ts';

function Highlight({ highlight }: { readonly highlight: string }): ReactNode {
  return (
    <p>
      {toHighlightSegments(highlight).map((segment, index) =>
        segment.isEmphasized ? <mark key={index}>{segment.text}</mark> : segment.text,
      )}
    </p>
  );
}

function Suggestion({ suggestion }: { readonly suggestion: string | undefined }): ReactNode {
  if (suggestion === undefined) return null;
  const href = `/?${new URLSearchParams([['text', suggestion]]).toString()}`;
  return (
    <p>
      Did you mean <a href={href}>{suggestion}</a>?
    </p>
  );
}

export async function SearchResults({ text }: { readonly text: string }): Promise<ReactNode> {
  const results = await searchRestaurants(createConsumerApi(), text);
  if ('problem' in results) return <p role="alert">{results.problem}</p>;
  return (
    <section aria-label="Search results">
      <Suggestion suggestion={results.suggestion} />
      {results.restaurants.length === 0 ? <p>No restaurant found.</p> : null}
      <ul>
        {results.restaurants.map((restaurant) => (
          <li key={restaurant.restaurantId}>
            <a href={`/restaurants/${restaurant.restaurantId}`}>{restaurant.name}</a> (
            {restaurant.category}, {restaurant.isOpenNow ? 'open now' : 'closed'})
            {restaurant.highlights.map((highlight) => (
              <Highlight key={highlight} highlight={highlight} />
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
