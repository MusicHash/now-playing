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
        const pool = await mysql.createPool({
            uri: this._MySQL_URI,
            waitForConnections: true,
            connectionLimit: 100,
            maxIdle: 100, // max idle connections, the default value is the same as `connectionLimit`
            idleTimeout: 5 * 60 * 1000, // 5 minutes idle connections timeout, in milliseconds, the default value 60000
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 3 * 1000, // 3 seconds,
        });

        this.logger.info('MySQL Initialized');

        this._MySQLInstance = pool;

        return this._MySQLInstance;
    }


    _isEnabled() {
        return Boolean(this._MySQL_URI);
    }


    /**
     * Selects rows from the specified table based on the provided parameters.
     *
     * @param {string} table - The name of the table to select rows from.
     * @param {Object} where - An object containing the column names and their respective values for the WHERE clause.
     * @param {number} [limit] - An optional limit on the number of rows to return.
     * @returns {Promise<Array>} The selected rows.
     * @throws {Error} If the SQL execution fails.
     *
     * @example
     * const where = { LICENCE: 'FREE', public: 1 };
     * const result = await select('SONGS_LIST', where, 10);
     */
    async select(table, where = {}, limit) {
        const whereClause = Object.keys(where)
            .map(key => `\`${key}\` = ?`)
            .join(' AND ');
        const whereValues = Object.values(where);

        let SQL = `SELECT * FROM \`${table}\` WHERE ${whereClause}`;

        if (limit !== undefined) {
            SQL += ` LIMIT ${limit}`;
        }

        const [rows] = await this._execute(SQL, whereValues);

        return rows;
    }


    /**
     * Inserts a new row into the specified table.
     *
     * @param {string} table - The name of the table to insert the row into.
     * @param {Object} params - An object containing the column names and their respective values to insert.
     * @returns {Promise<Object>} The result of the insert operation.
     * @throws {Error} If the SQL execution fails.
     *
     * @example
     * const params = { public: 1, LICENCE: 'FREE' };
     * const result = await insert('SONGS_LIST', params);
     */
    async insert(table, params = {}) {
        const columns = Object.keys(params).join(', ');
        const placeholders = Object.keys(params).map(() => '?').join(', ');
        const values = Object.values(params);

        const SQL = `INSERT INTO \`${table}\` (${columns}) VALUES (${placeholders})`;

        const [result] = await this._execute(SQL, values);

        return result.insertId;
    }


    /**
     * Updates existing rows in the specified table.
     *
     * @param {string} table - The name of the table to update the row(s) in.
     * @param {Object} params - An object containing the column names and their respective values to update.
     * @param {Object} where - An object containing the column names and their respective values for the WHERE clause.
     * @returns {Promise<Object>} The result of the update operation.
     * @throws {Error} If the SQL execution fails.
     *
     * @example
     * const params = { LICENCE: 'PAID' };
     * const where = { public: 1 };
     * const result = await update('SONGS_LIST', params, where);
     */
    async update(table, params = {}, where = {}) {
        const setClause = Object.keys(params)
            .map(key => `\`${key}\` = ?`)
            .join(', ');
        
        const setValues = Object.values(params);

        const whereClause = Object.keys(where)
            .map(key => `\`${key}\` = ?`)
            .join(' AND ');

        const whereValues = Object.values(where);

        const SQL = `UPDATE \`${table}\` SET ${setClause} WHERE ${whereClause}`;

        const [result] = await this._execute(SQL, [...setValues, ...whereValues]);

        return result;
    }


    /**
     * Checks if a row exists in the specified table based on the provided parameters.
     * If the row does not exist, it inserts a new row with the provided parameters.
     *
     * @param {string} table - The name of the table to check and insert the row.
     * @param {Object} checkParams - An object containing the column names and their respective values to check for existence.
     * @param {Object} insertParams - An object containing the column names and their respective values to insert if the row does not exist.
     * @returns {Promise<Object>} The result of the insert operation if the row does not exist, otherwise null.
     * @throws {Error} If the SQL execution fails.
     *
     * @example
     * const checkParams = { LICENCE: 'FREE', public: 1 };
     * const insertParams = { LICENCE: 'FREE', public: 1, title: 'New Song' };
     * const result = await checkAndInsert('SONGS_LIST', checkParams, insertParams);
     */
    async checkAndInsert(table, primeryKey, checkParams = {}, insertParams = {}) {
        const existingRows = await this.select(table, checkParams, 1);
        let entryID = null;

        if (0 === existingRows.length) {
            entryID = await this.insert(table, insertParams);
            return entryID;
        }
        
        // extract an the key
        entryID = existingRows[0][primeryKey];

        return entryID;
    }


    async query(query, params = []) {
        return await this._execute(query, params, 'query');
    }


    async _getConnection() {
        return await this._MySQLInstance.getConnection();
    }


    async _execute(query, params = [], command = 'execute') {
        await this.connect();

        let connection;
        let results;

        try {
            connection = await this._getConnection();
            results = await connection[command](
                query,
                params,
            );
        } catch(error) {
            this.logger.error(`ERROR: ${error}`);
        } finally {
            if (connection) connection.release();
        }

        return results;
    }
}


export default new MySQLWrapper();
