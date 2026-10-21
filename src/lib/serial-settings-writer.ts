export function serialSettingsWriter<T>(write: (value: T) => Promise<void>) {
  let tail = Promise.resolve();
  return (value: T): Promise<void> => {
    const next = tail.then(() => write(value));
    tail = next.catch(() => undefined);
    return next;
  };
}