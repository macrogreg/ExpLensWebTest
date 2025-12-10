//

export class Stopwatch {
    static Run(): Stopwatch {
        const stopwatch = new Stopwatch();
        stopwatch.start();
        return stopwatch;
    }

    #startMSec: number = 0;
    #stopMSec: number | undefined = undefined;
    #hasStarted: boolean = false;
    #hasStopped: boolean = false;

    constructor() {
        this.reset();
    }

    clone = (): Stopwatch => {
        const copy = new Stopwatch();
        copy.#startMSec = this.#startMSec;
        copy.#stopMSec = this.#stopMSec;
        copy.#hasStarted = this.#hasStarted;
        copy.#hasStopped = this.#hasStopped;
        return copy;
    };

    start = (): void => {
        this.#hasStarted = true;
        this.#startMSec = performance.now();
    };

    stop = (): number => {
        this.#stopMSec = performance.now();
        this.#hasStopped = true;
        return this.elapsedMSec();
    };

    reset = (): number => {
        const elapsed = this.elapsedMSec();
        this.#startMSec = 0;
        this.#stopMSec = undefined;
        this.#hasStarted = false;
        this.#hasStopped = false;
        return elapsed;
    };

    hasStarted = (): boolean => this.#hasStarted;

    hasStopped = (): boolean => this.#hasStopped;

    elapsedMSec = (): number => (this.#hasStarted ? this.elapsedSinceMSec(this.#startMSec) : 0);

    elapsedStr = (): string => formatDuration(this.elapsedMSec());

    elapsedSinceMSec = (prevMeasurement: number): number => {
        const endMSec = this.#stopMSec ?? performance.now();
        const elapsedMSec = endMSec - prevMeasurement;
        return elapsedMSec;
    };
}

export function formatDuration(totalMSec: number): string {
    if (!Number.isFinite(totalMSec)) {
        return "infinite";
    }

    if (Number.isNaN(totalMSec)) {
        return "NaN";
    }

    const isNegative: boolean = totalMSec < 0;

    const totalMicrosec100s = Math.abs(Math.round(totalMSec * 10));

    if (totalMicrosec100s === 0) {
        return "0ms";
    }

    const microsec100s = totalMicrosec100s % 10000;
    const mics = microsec100s.toString().padStart(4, "0");
    const totalSec = Math.floor(totalMicrosec100s / 10000);

    if (totalSec === 0) {
        return isNegative ? `-0.${mics}s` : `0.${mics}s`;
    }

    const sec = totalSec % 60;
    const ss = sec.toString().padStart(2, "0");
    const totalMin = Math.floor(totalSec / 60);

    if (totalMin === 0) {
        return isNegative ? `-${ss}.${mics}s` : `${ss}.${mics}s`;
    }

    const min = totalMin % 60;
    const mm = min.toString().padStart(2, "0");
    const totalHrs = Math.floor(totalMin / 60);

    if (totalHrs === 0) {
        return isNegative ? `-${mm}:${ss}.${mics}` : `${mm}:${ss}.${mics}`;
    }

    const hh = sec.toString();

    return isNegative ? `${hh}:${mm}:${ss}.${mics}` : `${hh}:${mm}:${ss}.${mics}`;
}
