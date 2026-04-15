export declare class AsyncQueue<T> implements AsyncIterableIterator<T> {
    private items;
    private waiters;
    private closed;
    private failure;
    push(item: T): void;
    close(): void;
    fail(error: unknown): void;
    [Symbol.asyncIterator](): AsyncIterableIterator<T>;
    next(): Promise<IteratorResult<T>>;
}
//# sourceMappingURL=queue.d.ts.map