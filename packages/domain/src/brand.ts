declare const brandMarker: unique symbol;

export type Brand<Primitive, BrandName extends string> = Primitive & {
  readonly [brandMarker]: BrandName;
};
