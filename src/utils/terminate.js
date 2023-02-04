import logger from "./logger";


const terminate = function(server, options = { coredump: false, timeout: 500 }) {
    return function(code, exceptionStack, exceptionType) {
        // Exit wrapper
        const exit = (exitCode) => {
            logger.info('Done, Exiting Process...');
            options.coredump ? process.abort() : process.exit(exitCode);
        }

        logger.info('got %s, starting shutdown process', code);

        if (!server.listening) exit(0);
        logger.info('Closing HTTP Server...');

        // TODO disconnect from databases, HTTP server, etc..
        // https://nodejs.org/api/http.html#http_server_close_callback
        // https://nodejs.org/api/net.html#net_server_close_callback
        server.close(error => {
            if (error) {
                logger.error(error);
                return exit(1);
            }

            exit(0);
        });

        setTimeout(exit, options.timeout).unref();
    }
};

export {
    terminate,
};
