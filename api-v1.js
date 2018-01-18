let BigNumber = require('bignumber.js');

let Web3 = require("web3");
let web3 = new Web3(new Web3.providers.HttpProvider("http://112.126.86.80:8545"));

let express = require('express');
let router = express.Router();

let Constant = require('./Constant');
let utils = require('./utils');
let logger = require('./log').logger('api-v1');

let fs = require('fs');

// let redis = require('redis');
// let redisClient = redis.createClient({ host: '127.0.0.1', port: 6379 });
let db = require('./db');

let coinInst = null;
let artHolderInst = null;
let repositoryInst = null;
let appraisersInst = null;

const MIN_COIN_BALANCE = BigNumber('1500000000000000000000');

// db.put('0x130ef80f9ae222d9814857112db42d94bfb8a69b21ff57011f5154b276ed113f', '{"id": "0x1234", "type": "ApplyAppraise", "status": 0}')
//     .then(function (result) {
//         console.log('success');
//     }, function (error) {
//         console.log(error);
//     });
//
//
// db.put('0x845dff44d7e11eb250dfd5a2fcb786772bf114bb521dfd5bd1d6899ac5e5c020', '{"id": "0x975dbe63c1931ad7c219beac8d31dc9700907af1", "type": "RegisterAppraiser", "status": 0}')
//     .then(function (result) {
//         console.log('success');
//     }, function (error) {
//         console.log(error);
//     });

// 一些函数
function getCoin() {
    if (coinInst == null) {
        let coinAbi = JSON.parse(fs.readFileSync("./abi/CoinAbi.json"));
        coinInst = web3.eth.contract(coinAbi).at(Constant.CONTRACT_TOKEN_ADDRESS);
    }

    return coinInst;
}

function getArtHolder() {
    if (artHolderInst == null) {
        let abi = JSON.parse(fs.readFileSync("./abi/ArtholderAbi.json"));
        artHolderInst = web3.eth.contract(abi).at(Constant.CONTRACT_ART_HOLDER_ADDRESS);
    }

    return artHolderInst;
}

function getAppraisers() {
    if (appraisersInst == null) {
        let abi = JSON.parse(fs.readFileSync('./abi/AppraisersAbi.json'));
        appraisersInst = web3.eth.contract(abi).at(Constant.CONTRACT_APPRAISER_ADDRESS);
    }

    return appraisersInst;
}

function getRepository() {
    if (repositoryInst == null) {
        let abi = JSON.parse(fs.readFileSync('./abi/RepositoryAbi.json'));
        repositoryInst = web3.eth.contract(abi).at(Constant.CONTRACT_REPOSITORY_ADDRESS);
    }

    return repositoryInst;
}

function reportError(req, res, error, msg) {
    let params = '{ ';
    for (let k in req.body) {
        params += k + ': ' + req.body[k] + ', ';
    }
    params += ' }';

    logger.error(req.url + ": " + msg + "; prameters: " + params);
    res.json(utils.makeResult(false, error, msg));
}

function unlockAccount(url, account, pwd) {
    try {
        return web3.personal.unlockAccount(account, pwd);
    } catch (e) {
        logger.error(url + ": unlock account failed: " + e);
        return false;
    }
}

function checkETHBalance(account) {
    let balance = BigNumber(web3.eth.getBalance(account));
    return !balance.lessThan(BigNumber(10).pow(18).mul(Constant.APPRAISER_ACCOUNT_MIN_ETH));
}

// 全局事件监控：鉴宝人接收到鉴定邀请事件、仓储收到持宝人入库申请
(function init() {
    let inst = getAppraisers();
    // 接收到邀请的事件监听
    inst.InviteToAppraise(function (error, result) {
        logger.debug('Appraiser received invitation event.');
        if (error) {
            logger.error('Invitation event: event error -- ' + error);
        } else {
            logger.debug('Invitation event: ' + JSON.stringify(result));

            let artId = result.args.item;
            let appId = result.args.appraiser;

            // 存数据库
            let savedData = {
                transaction: result.transactionHash,
                artId: artId,
                appId: appId,
                status: Constant.TRANSACTION_STATUS_INIT,
                type: Constant.TYPE_APPRAISE_INVITATION
            };
            db.put(result.transactionHash, JSON.stringify(savedData))
                .then(function () {
                    logger.debug('Invitation event: save transaction successfully');
                }, function (error) {
                    logger.error('Invitation event: save initial transaction failed with error: ' + error);
                });

            db.get(Constant.DB_KEY_INVITATION_CALLBACK)
                .then(function (callbackUrl) {
                    if (!callbackUrl) {
                        callbackUrl = '';
                    }
                    savedData.url = callbackUrl;
                    process.callbackProcess.send(JSON.stringify(savedData));
                });
        }
    });

    let repo = getRepository();
    repo.NewItem(function (error, result) {
        logger.debug('Art holder accept the appraise result.');
        if (error) {
            logger.error('Repository NewItem event: event error -- ' + error);
        } else {
            logger.debug('Invitation NewItem event: ' + JSON.stringify(result));

            let artId = result.args.item;
            let savedData = {
                transaction: result.transactionHash,
                artId: artId,
                status: Constant.TRANSACTION_STATUS_INIT,
                type: Constant.TYPE_ACCEPT_APPRAISE_RESULT
            };
            db.put(result.transactionHash, JSON.stringify(savedData))
                .then(function () {
                    logger.debug('Accept result event: save transaction successfully');
                }, function (error) {
                    logger.error('Accept result event: save initial transaction failed with error: ' + error);
                });

            db.get(Constant.DB_KEY_ACCEPT_PRICE_CALLBACK)
                .then(function (callbackUrl) {
                    if (!callbackUrl) {
                        callbackUrl = '';
                    }
                    savedData.url = callbackUrl;
                    process.callbackProcess.send(JSON.stringify(savedData));
                });
        }
    });
})();

// V1 版本的全局函数
router.use(function (req, res, next) {
    next();
});

(function test() {
// web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));
    let version = web3.version;
    console.log("version: " + version.api); // "0.2.0"

    let coinbase = web3.eth.coinbase;// "0x2bb662101b06bf3d63c79d39a57603dbeeb17f1a";
    console.log(coinbase);

    let balance = web3.eth.getBalance(coinbase);
    console.log("主账号余额：" + balance);

    balance = BigNumber(web3.eth.getBalance(coinbase));
    console.log("另外形式：" + balance);

    console.log("当前块数：" + web3.eth.blockNumber);
    // myHello.hello.call();
    // console.log(myHello.hello.call());
})();

router.get('/about', function (req, res) {
//    res.send('I am api version one');
//    let obj = { success: true, error: 0, msg: 'I am API version 1' };
    let obj = utils.makeResult(true, 0, "API version 1.0");
    res.json(obj);
});

/**
 * 创建以太坊账号
 */
router.post('/createAccount', function (req, res) {
    if (!req.body.password) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, "请提供账号密码!");
    } else {
        let password = req.body.password;
        let address = web3.personal.newAccount(password).toString();
        if (address) {
            res.json(utils.makeResult(true, Constant.ERR_SUCCESS, "success", address));
        } else {
            logger.error(req.url + ": Create account failed through web3 api.");
            res.json(utils.makeResult(false, Constant.ERR_NOT_FOUND, "创建账号失败!"));
        }
    }
});

/**
 * 获取以太坊账号ETH余额
 */
router.post('/getBalance', function (req, res) {
    if (!req.body.address) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, "请指定账户地址!");
    } else {
        let balance = web3.eth.getBalance(req.body.address);
        res.json(utils.makeResult(true, Constant.ERR_SUCCESS, "success", balance));
    }
});

/**
 * 获取以太坊账号的Token余额
 */
router.post('/getCoinBalance', function (req, res) {
    if (!req.body.address) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, "请指定账户地址!");
    } else {
        let inst = getCoin();
        let balance = inst.balanceOf(req.body.address);
        res.json(utils.makeResult(true, Constant.ERR_SUCCESS, "success", balance));
    }
});

/**
 * 获取艺术品状态
 */
router.post('/getArtStatus', function (req, res) {
    if (!req.body.artId) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, "请指定艺术品地址!");
    } else {
        let inst = getArtHolder();
        let ret = inst.artItems(req.body.artId);
        logger.debug(req.url + ": contract returned: " + JSON.stringify(ret));

        if (ret[0] === Constant.INVALID_ADDRESS) {
            res.json(utils.makeResult(false, Constant.ERR_NOT_FOUND, "未找到指定艺术品!"));
        } else {
            let obj = {
                'id': ret[0],
                'owner': ret[1],
                'store': ret[2],
                'state': ret[3],
                'title': ret[4],
                'hash': ret[5],
                'description': ret[6],
                'url': ret[7],
                'appraiseFinalTime': ret[8],
                'category': ret[9],
                'price': ret[10]
            };
            res.json(utils.makeResult(true, Constant.ERR_SUCCESS, "success", obj));
        }
    }
});

/**
 * 评估提交鉴定申请所需要消耗的gas值
 */
router.post('/appraiseEstimate', function (req, res) {
    if (!req.body.account || req.body.account.length !== 42 || !req.body.name || !req.body.hash || !req.body.category || !req.body.days) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
    } else {
        // 检查余额
        // 检查余额
        let account = req.body.account;
        let balance = BigNumber(web3.eth.getBalance(account));

        if (balance.lessThan(BigNumber(10).pow(18).mul(Constant.APPRAISER_ACCOUNT_MIN_ETH))) {
            reportError(req, res, Constant.ERR_BALANCE_INSUFFICIENT, "ETH余额不足，无法完成评估!");
            return;
        }

        let desc = req.body.desc || '';
        let url = req.body.url || '';

        let artHolder = getArtHolder();
        try {
            let callData = artHolder.newItemWithApprsaise.getData(req.body.name, req.body.hash, 1, 2, desc, url, req.body.category, req.body.days);
            let gasValue = web3.eth.estimateGas({from: req.body.account, to: Constant.CONTRACT_ART_HOLDER_ADDRESS, data: callData});
            res.json(utils.makeResult(true, 0, 'success', gasValue));
        } catch (e) {
            logger.error(req.url + " Exception occurred: " + e);
            reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '调用以太坊API失败!');
        }
    }
});

/**
 * 提交艺术品鉴定申请
 */
router.post('/appraise', function (req, res) {
    if (!req.body.account || req.body.account.length !== 42 || !req.body.password || !req.body.name || !req.body.hash || !req.body.category || !req.body.days) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
    } else {
        let desc = req.body.desc || '';
        let url = req.body.url || '';

        let category = parseInt(req.body.category);
        let days = parseInt(req.body.days);

        if (isNaN(category) || isNaN(days)) {
            reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
            return;
        }

        // 检查余额
        let account = req.body.account;
        if (!checkETHBalance(account)) {
            reportError(req, res, Constant.ERR_BALANCE_INSUFFICIENT, "ETH余额不足!");
            return;
        }

        if (unlockAccount(req.url, req.body.account, req.body.password)) {

            try {
                let inst = getArtHolder();

                let OnApplyAppraise = getArtHolder().ApplyAppraise();
                OnApplyAppraise.watch(function(error, result) {
                    console.log('New appraise event entered.');
                    if (error) {
                        logger.error(req.url + ': event error -- ' + error);
                    } else {
                        let artId = result.args.item;
//                        redisClient.set(result.transactionHash, JSON.stringify({ id: artId, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_APPRAISE }));
                        db.put(result.transactionHash, JSON.stringify({ id: artId, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_APPRAISE }))
                            .then(function () {
                                logger.debug(req.url + ': save transaction successfully');
                            }, function (error) {
                                logger.error(req.url + ': save initial transaction failed with error: ' + error);
                            });
                    }

                    OnApplyAppraise.stopWatching();
                });

                inst.newItemWithApprsaise(req.body.name, req.body.hash, 1, 2, desc, url, req.body.category, req.body.days,
                    {from: req.body.account, gas: 1000000}, function (err, transaction) {
                        if (err) {
                            reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '申请鉴宝失败!');
                        } else {
                            logger.debug(req.url + ': transaction: ' + transaction);
                            db.put(transaction, JSON.stringify({ id: Constant.INVALID_ADDRESS, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_APPRAISE }))
                                .then(function () {
                                }, function (error) {
                                    logger.error(req.url + ': db error -- ' + error);
//                                    res.json(utils.makeResult(false, 0, '保存到数据库失败: ' + error));
                                });
                            res.json(utils.makeResult(true, 0, 'success', transaction));
                        }
                    });
            } catch (e) {
                logger.error(req.url + ': submit transaction failed: ' + e);
                reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '合约API失败!');
            }

        } else {
            reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '区块链账户错误!');
        }
    }
});

// 鉴定申请transaction：0x130ef80f9ae222d9814857112db42d94bfb8a69b21ff57011f5154b276ed113f

/**
 * 评估注册鉴宝人所需要消耗的gas值
 */
router.post('/registerAppraiserEstimate', function (req, res) {

    if (!req.body.account || req.body.account.length !== 42 || !req.body.categories || !utils.isArray(req.body.categories)) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
    } else {
        // 检查余额
        let account = req.body.account;
        let balance = BigNumber(web3.eth.getBalance(account));

        if (balance.lessThan(BigNumber(10).pow(18).mul(Constant.APPRAISER_ACCOUNT_MIN_ETH))) {
            reportError(req, res, Constant.ERR_BALANCE_INSUFFICIENT, "ETH余额不足，无法完成评估!");
            return;
        }

        let appraisers = getAppraisers();
        try {
            let callData = appraisers.newAppraiserWithCategory.getData(req.body.categories);
            let gasValue = web3.eth.estimateGas({from: req.body.account, to: Constant.CONTRACT_APPRAISER_ADDRESS, data: callData});
            res.json(utils.makeResult(true, 0, 'success', gasValue));
        } catch (e) {
            logger.error(req.url + " Exception occurred: " + e);
            reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '合约API失败!');
        }
    }
});

/**
 * 注册成为鉴宝人
 */
router.post('/registerAppraiser', function (req, res) {
    if (!req.body.account || req.body.account.length !== 42 || !req.body.password || !req.body.categories || !utils.isArray(req.body.categories)) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
    } else {
        // 检查余额
        let account = req.body.account;
        if (!checkETHBalance(account)) {
            reportError(req, res, Constant.ERR_BALANCE_INSUFFICIENT, "ETH余额不足!");
            return;
        }

        if (unlockAccount(req.url, req.body.account, req.body.password)) {
            try {
                let inst = getAppraisers();
                let OnNewAppraiser = inst.NewAppraiser();
                OnNewAppraiser.watch(function (error, result) {
                    console.log('Register appraiser event entered.');
                    if (error) {
                        logger.error(req.url + ': event error -- ' + error);
                    } else {
                        let appId = result.args.appraiser;
//                        redisClient.set(result.transactionHash, JSON.stringify({ id: appId, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_REGISTER_APPRAISER }));
                        db.put(result.transactionHash, JSON.stringify({ id: appId, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_REGISTER_APPRAISER }))
                            .then(function (result) {
                                logger.debug(req.url + ': save transaction successfully');
                            }, function (error) {
                                logger.error(req.url + ': save initial transaction failed with error: ' + error);
                            });
                    }

                    OnNewAppraiser.stopWatching();
                });

                inst.newAppraiserWithCategory(req.body.categories, {from: account, gas: 1000000}, function (err, transaction) {
                    if (err) {
                        reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '注册鉴宝人失败!');
                    } else {
                        logger.debug(req.url + ': transaction: ' + transaction);
                        db.put(transaction, JSON.stringify({ id: Constant.INVALID_ADDRESS, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_REGISTER_APPRAISER }))
                            .then(function () {
                            }, function (error) {
                                logger.error(req.url + ': save initial transaction failed with error: ' + error);
                            });
                        res.json(utils.makeResult(true, 0, 'success', transaction));
                    }
                });
            } catch (e) {
                logger.error(req.url + " Exception occurred: " + e);
                reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '合约API失败!');
            }
        } else {
            reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '区块链账户错误!');
        }
    }
});

/**
 * 评估注册仓储所需要消耗的gas值
 */
router.post('/registerRepositoryEstimate', function (req, res) {
    if (!req.body.account || req.body.account.length !== 42) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
    } else {
        // 检查余额
        let account = req.body.account;
        let balance = BigNumber(web3.eth.getBalance(account));

        if (balance.lessThan(BigNumber(10).pow(18).mul(Constant.APPRAISER_ACCOUNT_MIN_ETH))) {
            reportError(req, res, Constant.ERR_BALANCE_INSUFFICIENT, "ETH余额不足，无法完成评估!");
            return;
        }

        let token = getCoin();
        if (BigNumber(token.balanceOf(req.body.account)).lessThan(MIN_COIN_BALANCE)) {
            reportError(req, res, Constant.ERR_BALANCE_INSUFFICIENT, token.name() + "余额不足，无法完成评估!");
            return;
        }

        let repository = getRepository();
        try {
            let callData = repository.newWarehouse.getData();
            let gasValue = web3.eth.estimateGas({from: account, to: Constant.CONTRACT_REPOSITORY_ADDRESS, data: callData});
            res.json(utils.makeResult(true, 0, 'success', gasValue));
        } catch (e) {
            logger.error(req.url + " Exception occurred: " + e);
            reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '合约API失败!');
        }
    }
});

/**
 * 注册成为仓储
 */
router.post('/registerRepository', function (req, res) {
    if (!req.body.account || req.body.account.length !== 42 || !req.body.password) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
    } else {
        // 检查余额
        let account = req.body.account;
        if (!checkETHBalance(account)) {
            reportError(req, res, Constant.ERR_BALANCE_INSUFFICIENT, "ETH余额不足!");
            return;
        }
        let token = getCoin();
        if (BigNumber(token.balanceOf(account)).lessThan(MIN_COIN_BALANCE)) {
            reportError(req, res, Constant.ERR_BALANCE_INSUFFICIENT, "Coin余额不足");
            return;
        }

        if (unlockAccount(req.url, account, req.body.password)) {
            try {
                let inst = getRepository();
                let OnNewWarehouse = inst.NewWarehouse();
                OnNewWarehouse.watch(function (error, result) {
                    console.log('Register appraiser event entered.');
                    if (error) {
                        logger.error(req.url + ': event error -- ' + error);
                    } else {
                        let appId = result.args.warehouse;
                        db.put(result.transactionHash, JSON.stringify({ id: appId, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_REGISTER_REPOSITORY }))
                            .then(function () {
                                logger.debug(req.url + ': save transaction successfully');
                            }, function (error) {
                                logger.error(req.url + ': save initial transaction failed with error: ' + error);
                            });
                    }

                    OnNewWarehouse.stopWatching();
                });

                inst.newWarehouse({from: account, gas: 1000000}, function (err, transaction) {
                    if (err) {
                        reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '注册鉴宝人失败!');
                    } else {
                        logger.debug(req.url + ': transaction: ' + transaction);
                        db.put(transaction, JSON.stringify({ id: Constant.INVALID_ADDRESS, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_REGISTER_REPOSITORY }))
                            .then(function () {
                            }, function (error) {
                                logger.error(req.url + ': save initial transaction failed with error: ' + error);
                            });

                        res.json(utils.makeResult(true, 0, 'success', transaction));
                    }
                });
            } catch (e) {
                logger.error(req.url + " Exception occurred: " + e);
                reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '合约API失败!');
            }
        } else {
            reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '区块链账户错误!');
        }
    }
});

router.post('/checkTransaction', function (req, res) {
    if (!req.body.transaction || req.body.transaction.length !== 66) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
    } else {
        let transactionHash = req.body.transaction;
        // redisClient.get(transactionHash, function (err, value) {
        //     if (err || !value) {
        //         reportError(req, res, Constant.ERR_NOT_FOUND, '查无此交易!');
        //         return;
        //     }
        //
        //     let content = JSON.parse(value);
        //     let result = web3.eth.getTransaction(transactionHash);
        //     if (result) {
        //         let blocks = web3.eth.blockNumber - result.blockNumber;
        //         if (blocks >= Constant.CONFIRM_BLOCK_COUNT) {
        //             logger.debug('Transaction: ' + transactionHash + ' has been confirmed with ' + blocks + ' blocks: id -- ' + content.id + ', type -- ' + content.type);
        //             redisClient.del(transactionHash);
        //             res.json(utils.makeResult(true, Constant.ERR_SUCCESS, 'success', { id: content.id, status: Constant.TRANSACTION_STATUS_CONFIRMED, type: content.type }));
        //         } else {
        //             res.json(utils.makeResult(true, Constant.ERR_SUCCESS, 'success', { id: content.id, status: Constant.TRANSACTION_STATUS_INIT, type: content.type }));
        //         }
        //     } else {
        //         reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '获取transaction信息失败!');
        //     }
        // });
        db.get(transactionHash)
            .then(function (value) {
                if (!value) {
                    reportError(req, res, Constant.ERR_NOT_FOUND, '查无此交易!');
                    return;
                }
                let content = JSON.parse(value);
                if (content.status === Constant.TRANSACTION_STATUS_CONFIRMED) {
                    res.json(utils.makeResult(true, Constant.ERR_SUCCESS, 'success', { id: content.id, status: Constant.TRANSACTION_STATUS_CONFIRMED, type: content.type }));
                } else {
                    let result = web3.eth.getTransaction(transactionHash);
                    if (result) {
                        let blocks = web3.eth.blockNumber - result.blockNumber;
                        if (blocks >= Constant.CONFIRM_BLOCK_COUNT) {
                            logger.debug('Transaction: ' + transactionHash + ' has been confirmed with ' + blocks + ' blocks: id -- ' + content.id + ', type -- ' + content.type);

                            content.status = Constant.TRANSACTION_STATUS_CONFIRMED;
                            db.put(transactionHash, JSON.stringify(content));

                            res.json(utils.makeResult(true, Constant.ERR_SUCCESS, 'success', { id: content.id, status: Constant.TRANSACTION_STATUS_CONFIRMED, type: content.type }));
                        } else {
                            res.json(utils.makeResult(true, Constant.ERR_SUCCESS, 'success', { id: content.id, status: Constant.TRANSACTION_STATUS_INIT, type: content.type }));
                        }
                    } else {
                        reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '获取transaction信息失败!');
                    }
                }
            }, function (error) {
                reportError(req, res, Constant.ERR_NOT_FOUND, '查询数据库失败: ' + error);
            })
    }
});

/**
 * 获取鉴宝人信息
 */
router.post('/getAppraiserInfo', function (req, res) {
    if (!req.body.id) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
    } else {
        let inst = getAppraisers();
        let result = inst.appraisers(req.body.id);
        if (result[0] === Constant.INVALID_ADDRESS) {
            reportError(req, res, Constant.ERR_PARAMETER_ERROR, '查无此鉴宝人!');
            return;
        }
        res.json(utils.makeResult(true, Constant.ERR_SUCCESS, 'success', { id: result[0], numAppraise: result[1], numSelection: result[1], numBadPrice: result[2] } ));
    }
});

/**
 * 获取鉴定状态
 */
router.post('/getAppraiseStatus', function (req, res) {
    if (!req.body.id || req.body.id.length !== 42) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
    } else {
        let inst = getAppraisers();
        let result = inst.artPrices(req.body.id);
        if (result[0] === Constant.INVALID_ADDRESS) {
            reportError(req, res, Constant.ERR_NOT_FOUND, '未找到指定艺术品的状态信息!');
            return;
        }
        let holder = getArtHolder();
        let artItem = holder.artItems(req.body.id);

        let info = { id: result[0], numAppraiser: result[1], numAppraised: result[2], finalTime: result[3], state: artItem[3], price: artItem[10] };
        res.json(utils.makeResult(true, Constant.ERR_SUCCESS, 'success', info ));
    }
});

/**
 * 设置鉴宝人收到邀请时的callback
 */
router.post('/setInvitationCallback', function (req, res) {

    if (req.body.url) {

        db.put(Constant.DB_KEY_INVITATION_CALLBACK, req.body.url)
            .then(function () {
                res.json(utils.makeResult(true, Constant.ERR_SUCCESS, 'success'));
            }, function (error) {
                logger.error(req.url + ': ' + error);
                reportError(req, res, Constant.ERR_DB_ERROR, '保存失败: 数据库错误!');
            });

    } else {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
    }

});

/**
 * 鉴宝人对艺术品发起价格评估
 */
router.post('/ballot', function (req, res) {
    if (!req.body.artId || req.body.artId.length !== 42 || !req.body.account || req.body.account.length !== 42 || !req.body.password || !req.body.price) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
        return;
    }

    let price = parseInt(req.body.price);
    if (isNaN(price)) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
        return;
    }

    // 检查余额
    let account = req.body.account;
    if (!checkETHBalance(account)) {
        reportError(req, res, Constant.ERR_BALANCE_INSUFFICIENT, "ETH余额不足!");
        return;
    }

    // 检查是否鉴宝人
    let inst = getAppraisers();
    let result = inst.appraisers(account);
    if (result[0] === Constant.INVALID_ADDRESS) {
        reportError(req, res, Constant.ERR_NOT_FOUND, "查无此鉴宝人!");
        return;
    }

    if (unlockAccount(req.url, account, req.body.password)) {
        let OnAppraiseItem = inst.AppraiseItem();
        OnAppraiseItem.watch(function (error, result) {
            console.log('Register appraiser event entered.');
            if (error) {
                logger.error(req.url + ': event error -- ' + error);
            } else {
                let artId = result.args.item;
                let appraiser = result.args.appraiser;
                let price = result.args.price;
                db.put(result.transactionHash, JSON.stringify({ artId: artId, appId: appraiser, price: price, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_BALLOT_PRICE }))
                    .then(function () {
                        logger.debug(req.url + ': save transaction successfully');
                    }, function (error) {
                        logger.error(req.url + ': save initial transaction failed with error: ' + error);
                    });
            }

            OnAppraiseItem.stopWatching();
        });

        inst.priceItem(req.body.artId, req.body.price, {from: account, gas: 1000000}, function (err, transaction) {
            if (err) {
                logger.error(req.url + ': error : ' + err);
                reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '表决艺术品价格失败!');
            } else {
                logger.debug(req.url + ': transaction: ' + transaction);
                db.put(transaction, JSON.stringify({ artId: req.body.artId, appId: account, price: req.body.price, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_BALLOT_PRICE }))
                    .then(function () {
                    }, function (error) {
                        logger.error(req.url + ': save initial transaction failed with error: ' + error);
                    });
                res.json(utils.makeResult(true, 0, 'success', transaction));
            }
        });

    } else {
        reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '区块链账户错误!');
    }
});

/**
 * 设置仓储收到持宝人接受价格的callback
 */
router.post('/setAcceptPriceCallback', function (req, res) {

    if (req.body.url) {
        db.put(Constant.DB_KEY_ACCEPT_PRICE_CALLBACK, req.body.url)
            .then(function () {
                res.json(utils.makeResult(true, Constant.ERR_SUCCESS, 'success'));
            }, function (error) {
                logger.error(req.url + ': ' + error);
                reportError(req, res, Constant.ERR_DB_ERROR, '保存失败: 数据库错误!');
            });

    } else {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
    }

});

/**
 * 日期超过后，需要终结鉴定结果，并更新艺术品的价格
 */
router.post('/finalizeAppraise', function (req, res) {
    // ArticleItems::getAppraiseResult
    if (!req.body.artId || req.body.artId.length !== 42 || !req.body.account || req.body.account.length !== 42 || !req.body.password) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
    } else {
        let inst = getArtHolder();
        let result = inst.artItems(req.body.artId);
        if (result[0] === Constant.INVALID_ADDRESS) {
            reportError(req, res, Constant.ERR_NOT_FOUND, '未找到指定艺术品!');
            return;
        }
        let curState = parseInt(result[3]);
        if (curState < 2) {
            reportError(req, res, Constant.ERR_APPRAISE_NOT_IN_APPRAISE, '艺术品还未开始鉴定!');
            return;
        }
        if (curState > 2) {
            reportError(req, res, Constant.ERR_APPRAISE_ALREADY_FINISHED, '艺术品鉴定已完成!');
            return;
        }

        let account = req.body.account;
        if (result[1] !== account) {
            reportError(req, res, Constant.ERR_NOT_FOUND, '艺术品不属于此持宝人!');
            return;
        }

        // 检查余额
        if (!checkETHBalance(account)) {
            reportError(req, res, Constant.ERR_BALANCE_INSUFFICIENT, "ETH余额不足!");
            return;
        }

        if (unlockAccount(req.url, account, req.body.password)) {
            inst.getAppraiseResult(req.body.artId, {from: account, gas: 1000000}, function (err, transaction) {
                if (err) {
                    logger.error(req.url + ': error : ' + err);
                    reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '终结艺术品鉴定失败!');
                } else {
                    logger.debug(req.url + ': transaction: ' + transaction);
                    db.put(transaction, JSON.stringify({ artId: req.body.artId, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_FINAL_APPRAISE }))
                        .then(function () {
                        }, function (error) {
                            logger.error(req.url + ': save initial transaction failed with error: ' + error);
                        });
                    res.json(utils.makeResult(true, 0, 'success', transaction));
                }
            });
        } else {
            reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '区块链账户错误!');
        }
    }
});

/**
 * 持宝人接受鉴定结果
 */
router.post('/acceptAppraiseResult', function (req, res) {
    // ArticleItems::acceptAppraiseResult
    if (!req.body.artId || req.body.artId.length !== 42 || !req.body.account || req.body.account.length !== 42 || !req.body.password) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
        return;
    }

    let account = req.body.account;
    if (!checkETHBalance(account)) {
        reportError(req, res, Constant.ERR_BALANCE_INSUFFICIENT, "ETH余额不足!");
        return;
    }

    // artItems
    let inst = getArtHolder();
    let result = inst.artItems(req.body.artId);
    if (result[0] === Constant.INVALID_ADDRESS) {
        reportError(req, res, Constant.ERR_NOT_FOUND, '查无此艺术品!');
        return;
    }

    if (result[1] !== account) {
        reportError(req, res, Constant.ERR_NOT_FOUND, '艺术品不属于此持宝人!');
        return;
    }

    if (unlockAccount(req.url, account, req.body.password)) {
        inst.acceptAppraiseResult(req.body.artId, {from: account, gas: 1000000}, function (err, transaction) {
            if (err) {
                logger.error(req.url + ': error : ' + err);
                reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '接受鉴定结果失败!');
            } else {
                logger.debug(req.url + ': transaction: ' + transaction);
                db.put(transaction, JSON.stringify({ artId: req.body.artId, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_ACCEPT_APPRAISE_RESULT }))
                    .then(function () {
                    }, function (error) {
                        logger.error(req.url + ': save initial transaction failed with error: ' + error);
                    });
                res.json(utils.makeResult(true, 0, 'success', transaction));
            }
        });

    } else {
        reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '区块链账户错误!');
    }
});

/**
 * 仓储抢单
 */
router.post('/takeOrder', function (req, res) {
    // Repository::digItem
    if (!req.body.artId || req.body.artId.length !== 42 || !req.body.account || req.body.account.length !== 42 || !req.body.password) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
        return;
    }

    let account = req.body.account;
    if (!checkETHBalance(account)) {
        reportError(req, res, Constant.ERR_BALANCE_INSUFFICIENT, "ETH余额不足!");
        return;
    }

    // artItems
    let inst = getArtHolder();
    let result = inst.artItems(req.body.artId);
    if (result[0] === Constant.INVALID_ADDRESS) {
        reportError(req, res, Constant.ERR_NOT_FOUND, '查无此艺术品!');
        return;
    }
    if (result[2] !== Constant.INVALID_ADDRESS) {
        reportError(req, res, Constant.ERR_ART_STATE_ERROR, '艺术品已有仓储收藏!');
        return;
    }
    let curState = parseInt(result[3]);
    if (curState !== 5) {
        reportError(req, res, Constant.ERR_ART_STATE_ERROR, '艺术品状态错误!');
        return;
    }

    let repo = getRepository();
    if (unlockAccount(req.url, account, req.body.password)) {
        repo.digItem(req.body.artId, {from: account, gas: 1000000}, function (err, transaction) {
            if (err) {
                logger.error(req.url + ': error : ' + err);
                reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '仓储抢单失败!');
            } else {
                logger.debug(req.url + ': transaction: ' + transaction);
                db.put(transaction, JSON.stringify({ artId: req.body.artId, repository: account, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_TAKE_ORDER }))
                    .then(function () {
                    }, function (error) {
                        logger.error(req.url + ': save initial transaction failed with error: ' + error);
                    });
                res.json(utils.makeResult(true, 0, 'success', transaction));
            }
        });

    } else {
        reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '区块链账户错误!');
    }
});

/**
 * 仓储去确认收到艺术品
 */
router.post('/confirmReceivedArt', function (req, res) {
    // Repository::storeItem
    if (!req.body.artId || req.body.artId.length !== 42 || !req.body.account || req.body.account.length !== 42 || !req.body.password) {
        reportError(req, res, Constant.ERR_PARAMETER_ERROR, '参数错误!');
        return;
    }

    let account = req.body.account;
    if (!checkETHBalance(account)) {
        reportError(req, res, Constant.ERR_BALANCE_INSUFFICIENT, "ETH余额不足!");
        return;
    }

    // artItems
    let inst = getArtHolder();
    let result = inst.artItems(req.body.artId);
    if (result[0] === Constant.INVALID_ADDRESS) {
        reportError(req, res, Constant.ERR_NOT_FOUND, '查无此艺术品!');
        return;
    }
    if (result[2] !== account) {
        reportError(req, res, Constant.ERR_ART_STATE_ERROR, '仓储并未抢单!');
        return;
    }
    let curState = parseInt(result[3]);
    if (curState !== 6) {
        reportError(req, res, Constant.ERR_ART_STATE_ERROR, '艺术品状态错误!');
        return;
    }

    let repo = getRepository();
    if (unlockAccount(req.url, account, req.body.password)) {
        repo.storeItem(req.body.artId, {from: account, gas: 1000000}, function (err, transaction) {
            if (err) {
                logger.error(req.url + ': error : ' + err);
                reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '仓储确认收到艺术品失败!');
            } else {
                logger.debug(req.url + ': transaction: ' + transaction);
                db.put(transaction, JSON.stringify({ artId: req.body.artId, repository: account, status: Constant.TRANSACTION_STATUS_INIT, type: Constant.TYPE_CONFIRM_RECEIVE_ART }))
                    .then(function () {
                    }, function (error) {
                        logger.error(req.url + ': save initial transaction failed with error: ' + error);
                    });
                res.json(utils.makeResult(true, 0, 'success', transaction));
            }
        });

    } else {
        reportError(req, res, Constant.ERR_CONTRACT_API_ERROR, '区块链账户错误!');
    }
});

module.exports = router;
