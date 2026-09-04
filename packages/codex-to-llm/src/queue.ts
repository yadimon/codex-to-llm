export class AsyncQueue<T> implements AsyncIterableIterator<T> {
  private items: T[] = [];
  private waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private closed = false;
  private failure: unknown = null;
  private returned = false;
  private disposal: Promise<void> | undefined;
  private onDispose: (() => void | Promise<void>) | undefined;

  /**
   * `onDispose` runs when a consumer abandons iteration (an early `break`,
   * `return`, or a throw inside a `for await` body). Without it the producer
   * keeps running after the consumer has walked away — leaking the child
   * process, its timeout, and the ephemeral directories holding auth material.
   */
  constructor(onDispose?: () => void | Promise<void>) {
    this.onDispose = onDispose;
  }

  push(item: T): void {
    if (this.closed) {
      return;
    }

    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.resolve({ value: item, done: false });
      return;
    }

    this.items.push(item);
  }

  close(): void {
    this.closed = true;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.resolve({ value: undefined as T, done: true });
    }
  }

  fail(error: unknown): void {
    this.failure = error;
    this.closed = true;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.reject(error);
    }
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }

  async return(): Promise<IteratorResult<T>> {
    // The consumer has abandoned iteration: buffered events are no longer
    // wanted, and holding them would keep delivering after `return()`.
    this.returned = true;
    this.items = [];

    if (!this.disposal) {
      const dispose = this.onDispose;
      this.onDispose = undefined;
      this.close();
      // One shared promise, so a second `return()` waits for the same
      // disposal instead of reporting completion while cleanup is still
      // running.
      this.disposal = Promise.resolve(dispose?.()).then(() => undefined);
    }

    await this.disposal;
    return { value: undefined as T, done: true };
  }

  next(): Promise<IteratorResult<T>> {
    // Once the consumer has returned, the iterator is finished. The disposer
    // reports the abandonment through `fail()`, but that must not turn a
    // completed iterator into a rejecting one.
    if (this.returned) {
      return Promise.resolve({
        value: undefined as T,
        done: true
      });
    }

    if (this.items.length > 0) {
      return Promise.resolve({
        value: this.items.shift() as T,
        done: false
      });
    }

    if (this.failure) {
      return Promise.reject(this.failure);
    }

    if (this.closed) {
      return Promise.resolve({
        value: undefined as T,
        done: true
      });
    }

    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }
}
