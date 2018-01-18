let express = require('express');
let app = express();
let childProcess = require('child_process');

let logger = require('./log');
logger.configure();
app.use(logger.useLog());

let auth = require('./auth');
app.use(auth); // 所有api都会调用

let bodyParser = require('body-parser');
app.use(bodyParser.json());

let apiv1 = require('./api-v1');
app.use('/v1', apiv1);

let server = app.listen(3000, function () {
    let host = server.address().address;
    let port = server.address().port;

    console.log('Server listening at http://%s:%s, process id: %s', host, port, process.pid);

//    let child = childProcess.spawn('node', ['callback.js']);
    let child = childProcess.fork("callback.js");
    process.callbackProcess = child;

    child.on('close', function (code) {
        console.log('子进程已退出1，退出码 '+code);
    });
    child.on('exit', function (code) {
        console.log('子进程已退出2，退出码 '+code);
    });

    process.on('SIGINT', function() {
        console.log('Server on Ctrl+C');
        process.exit();// 进程退出
    });

    process.on('exit', function() {
        child.kill();

        console.log('Server closing');
    });
});
