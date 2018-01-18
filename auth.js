
let auth = require('basic-auth');

let apiUsers = {
    'user01': { password: '123456' },
    'user02': { password: '123456' }
};

module.exports = function (req, res, next) {
    let user = auth(req);
    if (!user || !apiUsers[user.name] || apiUsers[user.name].password !== user.pass) {
        res.set('WWW-Authenticate', 'Basic realm="example"');
        return res.status(401).send();
    }
    next();
};
