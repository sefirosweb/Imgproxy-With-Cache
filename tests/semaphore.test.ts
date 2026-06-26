import Semaphore from "../src/semaphore";

const deferred = <T>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe("Semaphore", () => {
    it("resolves with the wrapped function's value", async () => {
        const sem = new Semaphore(1);
        await expect(sem.callFunction(() => Promise.resolve(42))).resolves.toBe(42);
    });

    it("propagates rejection from the wrapped function", async () => {
        const sem = new Semaphore(1);
        await expect(sem.callFunction(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    });

    it("never exceeds maxConcurrentRequests in flight", async () => {
        const sem = new Semaphore(2);
        let running = 0;
        let maxRunning = 0;
        const gates = [deferred<void>(), deferred<void>(), deferred<void>(), deferred<void>()];

        const tasks = gates.map((gate) =>
            sem.callFunction(() => {
                running++;
                maxRunning = Math.max(maxRunning, running);
                return gate.promise.then(() => {
                    running--;
                });
            })
        );

        // Let the microtask queue settle: only 2 should have started.
        await Promise.resolve();
        await Promise.resolve();
        expect(maxRunning).toBe(2);

        // Release all gates and let everything drain.
        gates.forEach((g) => g.resolve());
        await Promise.all(tasks);

        expect(maxRunning).toBe(2);
        expect(running).toBe(0);
    });

    it("queues work beyond the limit and runs it as slots free up", async () => {
        const sem = new Semaphore(1);
        const order: number[] = [];
        const g1 = deferred<void>();

        const t1 = sem.callFunction(() => {
            order.push(1);
            return g1.promise;
        });
        const t2 = sem.callFunction(() => {
            order.push(2);
            return Promise.resolve();
        });

        await Promise.resolve();
        expect(order).toEqual([1]); // task 2 is still queued behind task 1

        g1.resolve();
        await Promise.all([t1, t2]);
        expect(order).toEqual([1, 2]);
    });
});
