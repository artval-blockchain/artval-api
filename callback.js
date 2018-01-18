let express = require('express');
let app = express();

let Web3 = require("web3");
let web3 = new Web3(new Web3.providers.HttpProvider("http://112.126.86.80:8545"));

let logger = require('./log').logger('callback');
let request = require('request');

let Constant = require('./Constant');

let redis = require('redis');
let redisClient = redis.createClient({ host: '127.0.0.1', port: 6379 });

const CALLBACK_QUEUE = 'CoinCallbackQueue';

///////////////////////////////////////////////
//
function removeFromQueue(transaction) {
    redisClient.get(CALLBACK_QUEUE, function (error, queue) {
        if (error || !queue) {
            if (error) {
                logger.error('Redis get value failed: ' + error);
            }
            return;
        }

        let queueObj = JSON.parse(queue);
        let index = queueObj.indexOf(transaction);

        if (index !== -1) {
            redisClient.del(transaction);
            queueObj.splice(index, 1);
            redisClient.set(CALLBACK_QUEUE, JSON.stringify(queueObj));
        }
    });
}

function doCallback(transaction) {
    redisClient.get(transaction, function (error, value) {
        if (!error && value) {
            let callObj = JSON.parse(value);
            // 检查区块数量
            let result = web3.eth.getTransaction(transaction);
            if (result) {
                let blocks = web3.eth.blockNumber - result.blockNumber;
                if (blocks >= Constant.CONFIRM_BLOCK_COUNT) {
                    let data = {};
                    if (callObj.type === Constant.TYPE_APPRAISE_INVITATION) { // 鉴定邀请
                        data = { transaction: transaction, artId: callObj.artId, appId: callObj.appId };
                    } else {
                        data = { transaction: transaction, artId: callObj.artId };
                    }

                    request({
                            method: "POST",
                            uri: callObj.url,
                            json: true,
                            body: data },
                        function (error, response, body) {
                            if (!error && response.statusCode == 200) {
                                logger.debug('after callback: ' + body);
                                removeFromQueue(transaction);
                            }
                        });
                }
            } else {
                logger.error('get block number failed.');
            }
        } else {
            logger.error('read from redis failed: ' + error);
        }
    });
}

function worker() {
    redisClient.get(CALLBACK_QUEUE).then(function (queue) {
        let queueObj = JSON.parse(queue);

        queueObj.map(function (item, index) {
            doCallback(item);
        })
    });
}

////////////////////////////////////////////
//
let timer = setInterval(worker, 5000); // 5秒调用一次

process.on('message', function(msg) {
    // 接收主进程发送过来的消息
    console.log('Child process received: ' + msg);
    let obj = JSON.parse(msg);

    if (obj) {
        redisClient.get(CALLBACK_QUEUE, function (error, queue) {
            if (error || !queue) {
                if (error) {
                    logger.error('Redis get value failed: ' + error);
                }
                queue = '[]';
            }

            let queueObj = JSON.parse(queue);
            let index = queueObj.indexOf(obj.transaction);
            if (index === -1) {
                queueObj.push(obj.transaction);
                redisClient.set(CALLBACK_QUEUE, JSON.stringify(queueObj));
                redisClient.set(obj.transactionHash, msg);
            }
        });
    }
});

process.on('SIGHUP', function() {
    clearInterval(timer);
    console.log('Child process SIGUP');
    process.exit();//收到kill信息，进程退出
});

process.on('exit', function() {
    console.log('Child process exit');
    clearInterval(timer);
});

let server = app.listen(3001, function () {
    let host = server.address().address;
    let port = server.address().port;

    console.log('Child server listening at http://%s:%s, process id: %s', host, port, process.pid);
});
