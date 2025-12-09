var mysql = require('mysql');
const logger = require('./logger');

var pool = mysql.createPool({
    connectionLimit: 10,
    host: 'localhost',
    user: 'root',
    password: '',
    database: process.env.DBNAME
});

function query(sql, params = [], callback, req = '') {
    const start = Date.now();

    const context = req ? `${req.method} ${req.originalUrl}` : 'NO CONTEXT'
    const txt = req.method == 'GET' ? 'sent' : 'affected'

    pool.query(sql, params, (error, results) => {
        if (process.env.DEBUG == 1) {
            const duration = Date.now() - start;
            if (error) {
                logger.error(`[DB Error] ${error.message}`)
            } else {
                const count = Array.isArray(results) ? results.length : results.affectedRows;
                logger.info(`${context} - ${count} record(s) ${txt}. | ${duration} ms`);
            }
        }

        if (callback) callback(error, results)
    });
}

module.exports = { query };