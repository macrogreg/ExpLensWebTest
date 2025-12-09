export class IndexedMap<TKey, TValue> {
    readonly #orderedData: TValue[] = [];
    readonly #indexedData = new Map<TKey, TValue>();

    get length(): number {
        return this.#orderedData.length;
    }

    tryAdd = (key: TKey, value: TValue) => {
        if (this.#indexedData.has(key)) {
            return false;
        }

        this.#orderedData.push(value);
        this.#indexedData.set(key, value);
        return true;
    };

    has = (key: TKey) => {
        return this.#indexedData.has(key);
    };

    getByIndex = (i: number) => {
        return this.#orderedData[i];
    };

    getByKey = (key: TKey) => {
        return this.#indexedData.get(key);
    };

    [Symbol.iterator]() {
        return this.#orderedData[Symbol.iterator]();
    }

    map = <TTarget>(callbackFn: (val: TValue, index: number) => TTarget): TTarget[] => {
        return this.#orderedData.map(callbackFn);
    };
}
