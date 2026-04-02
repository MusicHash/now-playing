import { EventEmitter } from 'events';

/**
 *
 */
class EventEmitterWrapper {
    _EventEmitterInstance = null;
    logger = null;

    init(Logger) {
        this.logger = Logger;

        return this;
    }

    async create() {
        if (null !== this._EventEmitterInstance) {
            return this._EventEmitterInstance;
        }

        this.logger.info('EventWrapper Initialized');

        this._EventEmitterInstance = new EventEmitter();

        return this._EventEmitterInstance;
    }

    on(event, listener) {
        this.create();

        this._EventEmitterInstance.on(event, listener);

        return this;
    }

    async emit(event, ...args) {
        await this.create();
        const listeners = this._EventEmitterInstance.listeners(event);

        for (const listener of listeners) {
            try {
                await listener(...args);
            } catch (error) {
                this.logger.error({
                    method: 'emit',
                    message: `Error in event listener for event: ${event}`,
                    error,
                    metadata: {
                        event,
                        args,
                    },
                });
                // Don't re-throw to prevent cascading failures
            }
        }

        return this;
    }

    off(event, listener) {
        this.create();

        this._EventEmitterInstance.off(event, listener);

        return this;
    }
}

export default new EventEmitterWrapper();
