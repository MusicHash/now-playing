import newrelic from 'newrelic';
import pino from 'pino';

import { isPlainObject, sanitizeLogValue } from './log_sanitize.js';
import { getRequestContextStore } from './request_context.js';

/**
 * Logger
 */
class Logger {
    _loggerInstance;

    /**
     * Mapper function converts the desired log string to the proper constant provided by the js-logger lib.
     *
     * @param {String} level - for the log level, in text.
     * @return {String} Referance for the log level by js-logger.
     */
    static LOG_LEVEL(level = 'DEBUG') {
        switch (level.toString().toUpperCase()) {
            case 'DEBUG':
                return pino.levels.values.debug;

            case 'INFO':
                return pino.levels.values.info;

            case 'WARN':
                return pino.levels.values.warn;

            case 'ERROR':
                return pino.levels.values.error;

            case 'FATAL':
                return pino.levels.values.fatal;

            default:
                return pino.levels.values.trace;
        }
    }


    /**
     * Creates an instance of the logger, with a specific name and log level.
     *
     * @param {String} level of the log that is expected to report.
     */
    constructor() {
        const level = process.env.PINO_LOG_LEVEL || 'info';
        const usePrettyTransport =
            process.env.NODE_ENV !== 'production' &&
            process.env.PINO_PRETTY !== '0' &&
            process.env.PINO_PRETTY !== 'false';

        const opts = { level };
        if (usePrettyTransport) {
            opts.transport = {
                target: 'pino-pretty',
            };
        }

        this._loggerInstance = pino(opts);
    }


    /**
     * Fatal errors. Mission critical - application can not run properly when present.
     *
     * @param {*} log description.
     * @return {Logger} this.
     */
    error(...log) {
        return this._log('error', log);
    }


    /**
     * Warning only. Should be fixed but application been able to recover.
     *
     * @param {*} log description.
     * @return {Logger} this.
     */
    warn(...log) {
        return this._log('warn', log);
    }


    /**
     * Information only. General info printed.
     *
     * @param {*} log description.
     * @return {Logger} this.
     */
    info(...log) {
        return this._log('info', log);
    }


    /**
     * Debug mode. Print as much as possible to allow quick and easy debugging when needed.
     *
     * @param {*} log description.
     * @return {Logger} this.
     */
    debug(...log) {
        return this._log('debug', log);
    }


    /**
     * ULTRA Debug mode, almost silly to use. Print as much as possible to allow quick and easy debugging when needed.
     * But very useful debugging, should contain ALOT of prints via this method.
     *
     * @param {*} log description.
     * @return {Logger} this.
     */
    silly(...log) {
        return this._log('silly', log);
    }


    /**
     * Private method, provides single point of access to the "console.log" API.
     * Prevents mess around the code and a clean way to prevent the output of the log or the severity level.
     *
     * @param {String} severity log level
     * @param {*} log description.
     * @return {Logger} this.
     */
    _log(severity, logArgs) {
        if (!this.isConsoleEnabled(severity)) {
            return;
        }

        const processed = logArgs.map((arg) => {
            if (arg !== null && typeof arg === 'object' && !(arg instanceof Error)) {
                if (Array.isArray(arg)) {
                    return sanitizeLogValue(arg);
                }
                if (isPlainObject(arg)) {
                    const sanitized = sanitizeLogValue(arg);
                    sanitized.severity = severity.toUpperCase();
                    return sanitized;
                }
            }
            return arg;
        });

        this._mergeRequestContextIntoProcessed(processed);

        const pinoArgs = this._pinoArgsFromProcessed(processed);
        this._loggerInstance[severity](...pinoArgs);
        this._forwardLogToNewRelic(severity, pinoArgs);

        return this;
    }

    /**
     * Pino needs a string `msg` when only a plain object is passed; otherwise
     * `msg` is missing and decorators / pretty-print look wrong.
     *
     * @param {unknown[]} processed
     * @returns {unknown[]}
     */
    _pinoArgsFromProcessed(processed) {
        if (processed.length !== 1) {
            return processed;
        }

        const sole = processed[0];

        if (sole instanceof Error) {
            return processed;
        }

        if (sole !== null && typeof sole === 'object' && !Array.isArray(sole) && isPlainObject(sole)) {
            const fromMessage = typeof sole.message === 'string' ? sole.message.trim() : '';
            const fromMethod = typeof sole.method === 'string' ? sole.method.trim() : '';
            const msg = fromMessage || fromMethod || 'event';
            const bindings = { ...sole };
            if (fromMessage) {
                delete bindings.message;
            }
            return [bindings, msg];
        }

        return processed;
    }

    /**
     * Adds `requestID` from HTTP AsyncLocalStorage to every emitted log line when inside a request.
     *
     * @param {unknown[]} processed
     */
    _mergeRequestContextIntoProcessed(processed) {
        const rid = getRequestContextStore()?.requestID;
        if (!rid || typeof rid !== 'string') {
            return;
        }

        const attachToPlainObject = (obj) => {
            if (!isPlainObject(obj) || ('requestID' in obj && obj.requestID !== undefined)) {
                return;
            }
            obj.requestID = rid;
        };

        const sole = processed[0];

        if (processed.length === 1) {
            if (typeof sole === 'string' || sole instanceof Error) {
                processed.unshift({ requestID: rid });
                return;
            }
            attachToPlainObject(sole);
            return;
        }

        if (processed.length >= 2) {
            const first = processed[0];
            const firstIsBindings =
                first !== null &&
                typeof first === 'object' &&
                !(first instanceof Error) &&
                isPlainObject(first);
            if (firstIsBindings) {
                attachToPlainObject(first);
            } else {
                processed.unshift({ requestID: rid });
            }
        }
    }

    _nrPrimitiveAttributes(obj) {
        const out = {};
        if (!isPlainObject(obj)) {
            return out;
        }
        for (const [k, v] of Object.entries(obj)) {
            if (k === 'severity' || k === 'msg' || k === 'message') {
                continue;
            }
            if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                out[k] = v;
            }
        }
        return out;
    }

    _forwardLogToNewRelic(severity, pinoArgs) {
        if (process.env.NEW_RELIC_ENABLED === 'false' || !process.env.NEW_RELIC_LICENSE_KEY) {
            return;
        }

        try {
            const level = severity.toUpperCase();
            const payload = this._newRelicLogPayload(pinoArgs, level);
            if (payload && payload.message !== undefined && payload.message !== '') {
                newrelic.recordLogEvent(payload);
            }
        } catch {
            // NR unavailable in tests or during bootstrap edge cases
        }
    }

    /**
     * @param {unknown[]} pinoArgs
     * @param {string} level
     * @returns {Record<string, unknown>|null}
     */
    _newRelicLogPayload(pinoArgs, level) {
        if (pinoArgs.length >= 2 && typeof pinoArgs[1] === 'string' && isPlainObject(pinoArgs[0])) {
            return {
                message: pinoArgs[1],
                level,
                ...this._nrPrimitiveAttributes(pinoArgs[0]),
            };
        }

        if (pinoArgs.length === 1 && typeof pinoArgs[0] === 'string') {
            return { message: pinoArgs[0], level };
        }

        if (pinoArgs.length === 1 && pinoArgs[0] instanceof Error) {
            const err = pinoArgs[0];
            return { message: err.message, level, error: err };
        }

        if (pinoArgs.length > 1) {
            const message = pinoArgs
                .map((a) => {
                    if (a instanceof Error) {
                        return a.message;
                    }
                    if (typeof a === 'string') {
                        return a;
                    }
                    if (a && typeof a === 'object') {
                        try {
                            return JSON.stringify(a);
                        } catch {
                            return String(a);
                        }
                    }
                    return String(a);
                })
                .join(' ');
            return { message, level };
        }

        return { message: 'event', level };
    }


    /**
     * Checks that console is globally defined and able to use it to print out log data to it.
     *
     * @param {String} severity
     * @return {Boolean} Enabled if console exists on window.
     */
    isConsoleEnabled(severity) {
        return 'undefined' !== typeof console && 'undefined' !== typeof console[severity]; // eslint-disable-line no-console
    }
}


export default new Logger();
