import type { ReactNode } from 'react';

export function Alert({ message }: { readonly message: string | undefined }): ReactNode {
  return message === undefined ? null : <span role="alert">{message}</span>;
}
