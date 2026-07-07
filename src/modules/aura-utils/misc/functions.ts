export const noop: AnyToVoidFnSignature = () => undefined;

export const identity = <T>(arg: T): T => arg;

export type NoopFnSignature = () => void;

export type MaybeArgFn<T> = (() => void) | ((arg: T) => void);

export type AnyToVoidFnSignature = (...args: any[]) => void;

export type AnyToAnyFnSignature = (...args: any[]) => any;

export type MethodTypedDecorator<T> = (target: any, property: string, descriptor: TypedPropertyDescriptor<T>) => TypedPropertyDescriptor<T> | void;

export type Predicate<T> = (el: T) => boolean;
