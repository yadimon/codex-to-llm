export class AsyncQueue {
    items = [];
    waiters = [];
    closed = false;
    failure = null;
    push(item) {
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
    close() {
        this.closed = true;
        while (this.waiters.length > 0) {
            const waiter = this.waiters.shift();
            waiter?.resolve({ value: undefined, done: true });
        }
    }
    fail(error) {
        this.failure = error;
        this.closed = true;
        while (this.waiters.length > 0) {
            const waiter = this.waiters.shift();
            waiter?.reject(error);
        }
    }
    [Symbol.asyncIterator]() {
        return this;
    }
    next() {
        if (this.items.length > 0) {
            return Promise.resolve({
                value: this.items.shift(),
                done: false
            });
        }
        if (this.failure) {
            return Promise.reject(this.failure);
        }
        if (this.closed) {
            return Promise.resolve({
                value: undefined,
                done: true
            });
        }
        return new Promise((resolve, reject) => {
            this.waiters.push({ resolve, reject });
        });
    }
}
//# sourceMappingURL=queue.js.map