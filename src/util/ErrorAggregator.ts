/**
 * A neat utility to collect errors from several operations, and then to throw them together.
 *
 * The `throwIfHasErrors`-function is smart:
 *  - If this aggregator contains no errors: It will do nothing.
 *  - If this aggregator contains exactly 1 error: It will throw exactly that error instance.
 *  - If this aggregator contains more than 1 error: It will throw an `AggregateError` containing all
 *    contained error instances. An optional aggregate error message can be specified, otherwise a useful
 *    default is used.
 * Usage:
 * ```
 * function doStuff() {
 *
 *     const errors = new ErrorAggregator();
 *     for (let i = 0; i < 10; i++) {
 *         try {
 *             // ...
 *         } catch(err) {
 *             errors.add(err);
 *         }
 *     }
 *
 *     errors.throwIfHasErrors();
 * }
 * ```
 */

export class ErrorAggregator {
    #errors: unknown[] = [];

    count = () => this.#errors.length;
    isEmpty = () => this.#errors.length === 0;
    errors = (): ReadonlyArray<unknown> => this.#errors;

    add = (error: unknown): void => {
        this.#errors.push(error);
    };

    throwIfHasErrors = (
        messageForAggregateError?: string | ((errors: ReadonlyArray<unknown>) => string)
    ): void | never => {
        const count = this.count();

        if (count === 0) {
            return;
        }

        if (count === 1) {
            throw this.#errors[0];
        }

        let aggregateMsg = undefined;
        if (messageForAggregateError !== undefined && messageForAggregateError !== null) {
            if (typeof messageForAggregateError === "string") {
                aggregateMsg = messageForAggregateError;
            } else if (typeof messageForAggregateError === "function") {
                aggregateMsg = messageForAggregateError(this.errors());
            }
        }

        if (aggregateMsg === undefined) {
            aggregateMsg = `${this.count()} errors were observed. Rethrowing as aggregate.`;
        }

        throw new AggregateError(this.#errors, aggregateMsg);
    };
}
