import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PortalLayout } from './portal-layout.component.tsx';
import {
  createRestaurantApi,
  type RestaurantApi,
} from './restaurant-api/restaurant-api.adapter.ts';
import { readRestaurantPortalConfiguration } from './restaurant-portal.config.ts';
import { MenuPage } from './restaurants/menu-editor.component.tsx';
import { OnboardingForm } from './restaurants/onboarding-form.component.tsx';
import { RestaurantSelector } from './restaurants/restaurant-selector.component.tsx';
import {
  buildSignOutUrl,
  completeSignIn,
  startSignIn,
  type SignInSettings,
  type SignedIn,
} from './session/keycloak-login.adapter.ts';

function createPortalRouter(
  api: RestaurantApi,
  signOutUrl: string,
): ReturnType<typeof createRouter> {
  const rootRoute = createRootRoute({ component: () => <PortalLayout signOutUrl={signOutUrl} /> });
  const getParentRoute = (): typeof rootRoute => rootRoute;
  return createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute, path: '/', component: () => <RestaurantSelector api={api} /> }),
      createRoute({
        getParentRoute,
        path: '/restaurants/new',
        component: () => <OnboardingForm api={api} />,
      }),
      createRoute({
        getParentRoute,
        path: '/restaurants/$restaurantId',
        component: () => <MenuPage api={api} />,
      }),
    ]),
  });
}

function renderPortal(settings: SignInSettings, signedIn: SignedIn): void {
  const api = createRestaurantApi(window.location.origin, signedIn.accessToken);
  const signOutUrl = buildSignOutUrl(settings, signedIn.idToken).href;
  const root = document.getElementById('root');
  if (root === null) throw new Error('index.html has no #root element');
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={createPortalRouter(api, signOutUrl)} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

const settings: SignInSettings = {
  keycloakIssuerUrl: readRestaurantPortalConfiguration(import.meta.env).keycloakIssuerUrl,
  redirectUrl: new URL('/', window.location.origin).href,
  storage: window.sessionStorage,
};
const signedIn = await completeSignIn(settings, new URL(window.location.href));
if (signedIn === undefined) {
  const returnPath = `${window.location.pathname}${window.location.search}`;
  window.location.assign(await startSignIn(settings, returnPath));
} else {
  window.history.replaceState(null, '', signedIn.returnPath);
  renderPortal(settings, signedIn);
}
