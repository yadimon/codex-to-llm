export class AsyncQueue<T> implements AsyncIterableIterator<T> {
  private items: T[] = [];
  private waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private closed = false;
  private failure: unknown = null;

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

  next(): Promise<IteratorResult<T>> {
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
