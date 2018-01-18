let level = require('level');
let db = level('./coin.db');
let Q = require('q');

let database = {
    put: function (key, value) {
        let defer = Q.defer();
        if (key && value) {
            db.put(key, value, function (error) {
                if (error) {
                    defer.reject(error);
                } else {
                    defer.resolve('success');
                }
            })
        } else {
            defer.reject('no key or value');
        }

        return defer.promise;
    },

    get: function (key) {
        let defer = Q.defer();
        if (key) {
            db.get(key, function (error, value) {
                if (error) {
                    defer.reject(error);
                } else {
                    defer.resolve(value);
                }
            })
        } else {
            defer.reject('key is invalid');
        }

        return defer.promise;
    },

    del: function (key) {
        let defer = Q.defer();
        if (key) {
            db.del(key, function (error) {
                if (error) {
                    defer.reject(error);
                } else {
                    defer.resolve();
                }
            })
        } else {
            defer.reject('key is invalid');
        }

        return defer.promise;
    }
};

module.exports = database;
