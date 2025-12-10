export function createRandomLetters(length: number, casing: "lower" | "upper" = "upper"): string {
    if (length < 0) {
        throw new RangeError(`'length' must be non-negative, but it is '${length}'.`);
    }

    if (length === 0) {
        return "";
    }

    const startCode = casing === "lower" ? 97 : 65;
    const countChars = 26;

    const codes: number[] = [];
    for (let i = 0; i < length; i++) {
        codes.push(startCode + Math.floor(Math.random() * countChars));
    }

    const chars = String.fromCharCode(...codes);
    return chars;
}

export function countDigits(n: number): number {
    if (!Number.isInteger(n)) {
        throw new RangeError(`Expecting 'n' to be an integer, but it is '${n}'.`);
    }

    if (n === 0) {
        return 1;
    }

    return Math.floor(Math.log10(Math.abs(n))) + 1;
}

export class RotatingIdGenerator {
    readonly #startId: number = 0;
    readonly #maxId: number;
    #minFormatDigitCount: number;

    #nextId: number;

    constructor(maxId: number, startId: number = 0) {
        if (!Number.isInteger(maxId) || !Number.isInteger(startId)) {
            throw new RangeError(
                `'maxId' and 'startId' must be integers,` + ` but values are '${maxId}' and '${startId}' respectively.`
            );
        }

        if (startId < 0) {
            throw new RangeError(`'startId' must be non-negative, but it is '${startId}'`);
        }

        if (maxId <= startId) {
            throw new RangeError(
                `Expecting 'maxId <= startId' but values are '${maxId}' and '${startId}' respectively.`
            );
        }

        this.#startId = startId;
        this.#maxId = maxId;
        this.#minFormatDigitCount = countDigits(this.#maxId);

        this.#nextId = this.#startId;
    }

    startId = () => this.#startId;
    maxId = () => this.#maxId;
    minFormatDigitCount = () => this.#minFormatDigitCount;

    setMinFormatDigitCount = (maxDigCount: number): RotatingIdGenerator => {
        if (!Number.isInteger(maxDigCount)) {
            throw new RangeError(`'maxDigCount' must be integer, but value is '${maxDigCount}'.`);
        }

        if (maxDigCount < 0) {
            this.#minFormatDigitCount = countDigits(this.#maxId);
        } else {
            this.#minFormatDigitCount = maxDigCount;
        }

        return this;
    };

    createNextId = (): number => {
        const nextId = this.#nextId;

        if (this.#nextId === this.#maxId) {
            this.#nextId = this.#startId;
        } else {
            this.#nextId++;
        }

        return nextId;
    };

    formatId = (id: number): string => {
        if (!Number.isInteger(id)) {
            throw new RangeError(`Expecting 'id' to be an integer, but it is '${id}'.`);
        }

        if (id < this.#startId || this.#maxId < id) {
            throw new RangeError(
                `Specified 'id' is '${id}', but it was expected to be in range [${this.#startId}, ${this.#maxId}].`
            );
        }

        const idStr = this.#nextId.toString().padStart(this.#minFormatDigitCount, "0");
        return idStr;
    };

    createAndFormatNextId = (): { idNum: number; idStr: string } => {
        const id = this.createNextId();
        return {
            idNum: id,
            idStr: this.formatId(id),
        };
    };
}
