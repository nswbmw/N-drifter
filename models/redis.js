var redis = require('redis');
var uuid = require('node-uuid');
var poolModule = require('generic-pool');
var pool = poolModule.Pool({
  name     : 'redisPool',
  create   : function(callback) {
    var client = redis.createClient();
    callback(null, client);
  },
  destroy  : function(client) {
    client.quit();
  },
  max      : 100,
  min      : 5,
  idleTimeoutMillis : 30000,
  log      : true
});

// 检查用户是否超过扔瓶次数限制
function checkThrowTimes(owner, callback) {
  pool.acquire(function (err, client) {
    if (err) {
      return callback({code: 0, msg: err});
    }
    // 到 2 号数据库检查用户是否超过扔瓶次数限制
    client.SELECT(2, function() {
      // 获取该用户扔瓶次数
      client.GET(owner, function (err, result) {
        if (err) {
          return callback({code: 0, msg: err});
        }
        if (result >= 10) {
          return callback({code: 0, msg: "今天扔瓶子的机会已经用完啦~"});
        }
        // 扔瓶次数加 1
        client.INCR(owner, function() {
          // 检查是否是当天第一次扔瓶子
          // 若是，则设置记录该用户扔瓶次数键的生存期为 1 天
          // 若不是，生存期保持不变
          client.TTL(owner, function (err, ttl) {
            if (ttl === -1) {
              client.EXPIRE(owner, 86400, function () {
                // 释放连接
                pool.release(client);
              });
            } else {
              // 释放连接
              pool.release(client);
            }
            callback({code: 1, msg: ttl});
          });
        });
      });
    });
  });
}

// 检查用户是否超过捡瓶次数限制
function checkPickTimes(owner, callback) {
  pool.acquire(function (err, client) {
    if (err) {
      return callback({code: 0, msg: err});
    }
    // 到 3 号数据库检查用户是否超过捡瓶次数限制
    client.SELECT(3, function() {
      // 获取该用户捡瓶次数
      client.GET(owner, function (err, result) {
        if (result >= 10) {
          return callback({code: 0, msg: "今天捡瓶子的机会已经用完啦~"});
        }
        // 捡瓶次数加 1
        client.INCR(owner, function() {
          // 检查是否是当天第一次捡瓶子
          // 若是，则设置记录该用户捡瓶次数键的生存期为 1 天
          // 若不是，生存期保持不变
          client.TTL(owner, function (err, ttl) {
            if (ttl === -1) {
              client.EXPIRE(owner, 86400, function () {
                // 释放连接
                pool.release(client);
              });
            } else {
              // 释放连接
              pool.release(client);
            }
            callback({code: 1, msg: ttl});
          });
        });
      });
    });
  });
}

// 扔一个瓶子
function throwOneBottle(bottle, callback) {
  bottle.time = bottle.time || Date.now();
  // 为每个漂流瓶随机生成一个 id
  var bottleId = uuid.v4();
  var type = {male: 0, female: 1};
  pool.acquire(function (err, client) {
    if (err) {
      return callback({code: 0, msg: err});
    }
    client.SELECT(type[bottle.type], function() {
      // 以 hash 类型保存漂流瓶对象
      client.HMSET(bottleId, bottle, function (err, result) {
        if (err) {
          return callback({code: 0, msg: "过会儿再试试吧！"});
        }
        // 设置漂流瓶生存期
        client.PEXPIRE(bottleId, 86400000 + bottle.time - Date.now(), function () {
          // 释放连接
          pool.release(client);
        });
        // 返回结果，成功时返回 OK
        callback({code: 1, msg: result});
      });
    });
  });
}

// 捡一个瓶子
function pickOneBottle(info, callback) {
  var type = {all: Math.round(Math.random()), male: 0, female: 1};
  info.type = info.type || 'all';
  pool.acquire(function (err, client) {
    if (err) {
      return callback({code: 0, msg: err});
    }
    // 根据请求的瓶子类型到不同的数据库中取
    client.SELECT(type[info.type], function() {
      // 随机返回一个漂流瓶 id
      client.RANDOMKEY(function (err, bottleId) {
        if (err) {
          return callback({code: 0, msg: err});
        }
        // redis 为空，返回海星
        if (!bottleId) {
          return callback({code: 1, msg: "海星"});
        }
        // 根据漂流瓶 id 取到漂流瓶完整信息
        client.HGETALL(bottleId, function (err, bottle) {
          if (err) {
            return callback({code: 0, msg: "漂流瓶破损了..."});
          }
          // 从 Redis 中删除该漂流瓶
          client.DEL(bottleId, function () {
            // 释放连接
            pool.release(client);
          });
          // 返回结果，成功时包含捡到的漂流瓶信息
          callback({code: 1, msg: bottle});
        });
      });
    });
  });
}

exports.throw = function(bottle, callback) {
  checkThrowTimes(bottle.owner, function (result) {
    if (result.code === 0) {
      return callback(result);
    }
    throwOneBottle(bottle, function (result) {
      callback(result);
    });
  });
}

exports.pick = function(info, callback) {
  checkPickTimes(info.user, function (result) {
    if (result.code === 0) {
      return callback(result);
    }
    // 20% 概率捡到海星
    if (Math.random() <= 0.2) {
      return callback({code: 1, msg: "海星"});
    }
    pickOneBottle(info, function (result) {
      callback(result);
    });
  });
}