
class Utils {
    makeResult(success, errCode, msg, data) {
        return { success: success || false, error: errCode || 0, msg: msg || "", data: data || {}};
    }

    isArray(obj) {
        return Object.prototype.toString.call(obj) === '[object Array]';
    }
}

module.exports = new Utils();
