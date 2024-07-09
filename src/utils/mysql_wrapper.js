import mysql from 'mysql2/promise';

/**
 * Redis
 */
class MySQLWrapper {
    _MySQLInstance = null;
    _MySQL_URI = null;

    logger = null;

    init(Logger, MySQL_URI = null) {
        this.logger = Logger;
        this._MySQL_URI = MySQL_URI;

        return this;
    }

    async connect() {
        if (!this._isEnabled()) {
            this.logger.info('MySQL is not enabled');
            return Promise.resolve();
        }

        if (null !== this._MySQLInstance) {
            return this._MySQLInstance;
        }

        // Create the connection to database
        const connection = await mysql.createConnection({
            uri: this._MySQL_URI,
            waitForConnections: true,
            connectionLimit: 10,
            maxIdle: 10, // max idle connections, the default value is the same as `connectionLimit`
            idleTimeout: 60000, // idle connections timeout, in milliseconds, the default value 60000
            queueLimit: 0,
            enableKeepAlive: true,
            multipleStatements: false,
            keepAliveInitialDelay: 0,
        });

        this.logger.info('MySQL Initialized');

        this._MySQLInstance = connection;

        return this._MySQLInstance;
    }


    _isEnabled() {
        return Boolean(this._MySQL_URI);
    }


    /**
     * Example SQL: SELECT * FROM SONGS_LIST WHERE LICENCE = ? AND public = 1
     * Example Params: params = ['FREE']
     */
    async select(SQL = '', params = []) {
        const [rows] = await this._query(SQL, [...params]);

        return rows;
    }


    async _query(query, options = {}) {
        await this.connect();

        return await this._MySQLInstance.query({
            query,
            ...options
        });
    }
}

export default new MySQLWrapper();
