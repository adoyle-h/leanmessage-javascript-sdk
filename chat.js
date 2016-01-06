'use strict';

/* eslint-disable one-var, no-use-before-define, guard-for-in */

var XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
var WebSocket = require('ws');
var Promise = require('bluebird');
var EventEmitter = require('events').EventEmitter;

var cmdMap = {
    direct: 'ack',
    sessionopen: 'sessionopened',
    sessionadd: 'sessionadded',
    sessionquery: 'sessionquery-result',
    roomjoin: 'roomjoined',
    roominvite: 'roominvited',
    roomleave: 'roomleft',
    roomkick: 'roomkicked',
};

var keepAliveTimeout = 60000;

function get(url) {
    // Return a new promise.
    return new Promise(function(resolve, reject) {
        // Do the usual XHR stuff
        var req = new XMLHttpRequest();
        req.open('GET', url);
        // req.withCredentials = false;
        req.onload = function() {
            // This is called even on 404 etc
            // so check the status
            if (req.status === 200) {
                // Resolve the promise with the response text
                resolve(JSON.parse(req.responseText));
            } else {
                // Otherwise reject with the status text
                // which will hopefully be a meaningful error
                reject(new Error(req.statusText));
            }
        };
        // Handle network errors
        req.onerror = function() {
            reject(new Error('Network Error'));
        };

        // Make the request
        req.send();
    });
}

function auth(peerId, watchingPeerIds) {
    return Promise.resolve({
        watchingPeerIds: watchingPeerIds || [],
    });
}

function groupAuth(peerId, groupId, action, groupPeerIds) {
    return Promise.resolve({
        groupPeerIds: groupPeerIds || [],
    });
}

function AVChatClient(settings) {
    var self = this;

    if (self instanceof AVChatClient === false) {
        return new AVChatClient(settings);
    }

    if (!settings) throw new Error('settings');
    if (!settings.appId) throw new Error('settings.appId');
    if (!settings.peerId) throw new Error('settings.peerId');
    if (settings.auth && typeof settings.auth !== 'function') {
        throw new Error('sesstings.auth');
    }
    if (settings.groupAuth && typeof settings.groupAuth !== 'function') {
        throw new Error('sesstings.groupAuth');
    }

    self._emitter = new EventEmitter();
    self._waitCommands = [];
    self.timers = [];
    var _settings = self._settings = settings || {};

    _settings.auth = settings.auth || auth;
    _settings.groupAuth = settings.groupAuth || groupAuth;
    _settings.watchingPeerIds = settings.watchingPeerIds || [];
    _settings.sp = settings.sp;
    _settings.server = settings.server;
}

AVChatClient.prototype._getServerInfo = function(appId, secure) {
    var self = this;
    var protocol = 'http://';
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:') {
        protocol = 'https://';
    }
    var url = protocol + 'router-g0-push.avoscloud.com/v1/route?appId=' + appId;
    if (self._settings.server && self._settings.server === 'us') {
        url = protocol + 'router-a0-push.avoscloud.com/v1/route?appId=' + appId;
    }
    if (secure) {
        url += '&secure=1';
    }
    return get(url);
};

AVChatClient.prototype._connect = function() {
    var self = this;
    var _settings = self._settings;
    var timers = self.timers;
    var server = self.server;
    var _waitCommands = self._waitCommands;
    var _emitter = self._emitter;

    if (server && new Date() < server.expires) {
        return new Promise(function(resolve, reject) {
            var ws;

            if (_settings.ws) {
                ws = self.ws = _settings.ws;
                resolve(server);
            } else {
                ws = self.ws = new WebSocket(server.server);
                self._timeout('connectopen', function() {
                    reject();
                });
                ws.onopen = function() {
                    if (timers.length > 0) {
                        clearTimeout(timers.shift()[1]);
                    }
                    resolve(server);
                };
            }

            ws.onclose = function(e) {
                self.doClose();
                _emitter.emit('close', e);
            };
            ws.onmessage = function(message) {
                var data = JSON.parse(message.data);

                var cmd = data.op ? data.cmd + data.op : data.cmd;
                if (!cmd) {
                    cmd = '{}';
                }
                if (_waitCommands.length > 0 && _waitCommands[0][0] === cmd) {
                    _waitCommands.shift()[1](data);
                }
                if (timers.length > 0 && timers[0][0] === cmd) {
                    clearTimeout(timers.shift()[1]);
                }

                if (data.cmd === 'session') {
                    if (data.op === 'opened' || data.op === 'added') {
                        _emitter.emit('online', data.onlineSessionPeerIds);
                    }
                } else if (data.cmd === 'presence') {
                    if (data.status === 'on') {
                        _emitter.emit('online', data.sessionPeerIds);
                    } else if (data.status === 'off') {
                        _emitter.emit('offline', data.sessionPeerIds);
                    }
                } else if (data.cmd === 'direct') {
                    _emitter.emit('message', data);
                    var msg = {
                        cmd: 'ack',
                        peerId: _settings.peerId,
                        appId: _settings.appId,
                        ids: [].concat(data.id),
                    };
                    var s = JSON.stringify(msg);
                    ws.send(s);
                } else if (data.cmd === 'room') {
                    if (data.op === 'members-joined') {
                        _emitter.emit('membersJoined', data);
                    } else if (data.op === 'members-left') {
                        _emitter.emit('membersLeft', data);
                    } else if (data.op === 'joined') {
                        _emitter.emit('joined', data);
                    } else if (data.op === 'left') {
                        _emitter.emit('left', data);
                    }
                }
            };
        });
    } else {
        return self._getServerInfo(_settings.appId, _settings.secure).then(function(result) {
            var server = self.server = result;
            server.expires = Date.now() + server.ttl * 1000;
            return self._connect();
        });
    }
};

AVChatClient.prototype._openSession = function() {
    var self = this;
    var _settings = self._settings;
    return _settings.auth(_settings.peerId, _settings.watchingPeerIds, _settings.sp)
        .then(function(data) {
            _settings.watchingPeerIds = data.watchingPeerIds;
            return self.doCommand('session', 'open', {
                sessionPeerIds: data.watchingPeerIds,
                s: data.s,
                t: data.t,
                n: data.n,
                sp: data.sp,
            });
        });
};

AVChatClient.prototype.doClose = function() {
    var self = this;
    var ws = self.ws;

    ws.close();
    clearTimeout(self._keepAliveHandle);
    self.timers.forEach(function(v) {
        clearTimeout(v[1]);
    });
    self._waitCommands.forEach(function(v) {
        v[2]();
    });
    self.timers = [];
    self._waitCommands = [];
};

AVChatClient.prototype._timeout = function(name, reject) {
    var self = this;
    self.timers.push([name, setTimeout(function() {
        if (reject) {
            reject(name + 'timeout');
        }
        self.doClose();
    }, 10000)]);
};

AVChatClient.prototype._keepAlive = function() {
    var self = this;
    var ws = self.ws;

    var _keepAliveHandle = self._keepAliveHandle;
    clearTimeout(_keepAliveHandle);
    self._keepAliveHandle = setTimeout(function() {
        if (ws.readyState === 1) {
            ws.send('{}');
            self._timeout('{}');
            self._keepAlive();
        }
    }, keepAliveTimeout);
};

AVChatClient.prototype.doCommand = function(cmd, op, props) {
    var self = this;
    var _settings = self._settings;
    var ws = self.ws;

    self._keepAlive();
    var msg = {
        cmd: cmd,
        peerId: _settings.peerId,
        appId: _settings.appId,
    };
    if (op) {
        msg.op = op;
    }
    if (props) {
        for (var k in props) {
            msg[k] = props[k];
        }
    }
    if (!ws) {
        return Promise.reject();
    }
    if (ws.readyState !== 1) {
        return Promise.reject(ws.readyState);
    }
    ws.send(JSON.stringify(msg));
    //wait
    var c = typeof op === 'undefined' ? cmd : cmd + op;
    if ((cmd === 'direct' && props.transient === true) ||
        ['sessionremove', 'sessionclose'].indexOf(c) > -1) {
        return Promise.resolve();
    } else {
        return new Promise(function(resolve, reject) {
            self._waitCommands.push([cmdMap[c] || c, resolve, reject]);
            self._timeout(cmdMap[c] || c, reject);
        });
    }
};

AVChatClient.prototype.open = function() {
    var self = this;
    var ws = self.ws;

    if (ws && ws.readyState === 0) {
        return Promise.reject(0);
    }
    if (ws && ws.readyState === 1) {
        return Promise.resolve();
    }
    self.timers.forEach(function(v) {
        clearTimeout(v[1]);
    });
    self.timers = [];
    return self._connect().then(function() {
        return self._openSession();
    });
};
AVChatClient.prototype.close = function() {
    this.doCommand('session', 'close');
    this.doClose();
    return Promise.resolve();
};
AVChatClient.prototype.send = function(msg, to, transient) {
    var obj = {
        msg: msg,
        toPeerIds: [].concat(to),
    };
    if (typeof transient !== 'undefined' && transient === true) {
        obj.transient = transient;
    }
    return this.doCommand('direct', undefined, obj);
};

AVChatClient.prototype.on = function(name, func) {
    this._emitter.on(name, func);
};

AVChatClient.prototype.watch = function(peers) {
    var self = this;
    var _settings = self._settings;

    return _settings.auth(_settings.peerId, [].concat(peers)).then(function(data) {
        var watch = [].concat(data.watchingPeerIds);
        watch.forEach(function(v) {
            if (_settings.watchingPeerIds.indexOf(v) === -1) {
                _settings.watchingPeerIds.push(v);
            }
        });
        return self.doCommand('session', 'add', {
            sessionPeerIds: [].concat(data.watchingPeerIds),
            s: data.s,
            t: data.t,
            n: data.n,
        });
    });
};

AVChatClient.prototype.unwatch = function(peers) {
    var self = this;
    var _settings = self._settings;
    peers.forEach(function(v) {
        if (_settings.watchingPeerIds.indexOf(v) > -1) {
            _settings.watchingPeerIds.splice(_settings.watchingPeerIds.indexOf(v), 1);
        }
    });
    return self.doCommand('session', 'remove', {
        sessionPeerIds: [].concat(peers),
    });
};

AVChatClient.prototype.getStatus = function(peers) {
    return this.doCommand('session', 'query', {
        sessionPeerIds: [].concat(peers),
    });
};

AVChatClient.prototype.joinGroup = function(groupId) {
    var self = this;
    var _settings = self._settings;
    return _settings.groupAuth(_settings.peerId, groupId, 'join', []).then(function(data) {
        return self.doCommand('room', 'join', {
            roomId: groupId,
            s: data.s,
            t: data.t,
            n: data.n,
        });
    });
};

AVChatClient.prototype.sendToGroup = function(msg, groupId, transient) {
    var obj = {
        msg: msg,
        roomId: groupId,
    };
    if (typeof transient !== 'undefined' && transient === true) {
        obj.transient = transient;
    }
    return this.doCommand('direct', undefined, obj);
};

AVChatClient.prototype.inviteToGroup = function(groupId, groupPeerIds) {
    var self = this;
    var _settings = self._settings;
    return _settings.groupAuth(_settings.peerId, groupId, 'invite', [].concat(groupPeerIds))
        .then(function(data) {
            return self.doCommand('room', 'invite', {
                roomId: groupId,
                roomPeerIds: [].concat(data.groupPeerIds),
                s: data.s,
                t: data.t,
                n: data.n,
            });
        });
};

AVChatClient.prototype.kickFromGroup = function(groupId, groupPeerIds) {
    var self = this;
    var _settings = self._settings;
    return _settings.groupAuth(_settings.peerId, groupId, 'kick', [].concat(groupPeerIds))
        .then(function(data) {
            return self.doCommand('room', 'kick', {
                roomId: groupId,
                roomPeerIds: [].concat(groupPeerIds),
                s: data.s,
                t: data.t,
                n: data.n,
            });
        });
};

AVChatClient.prototype.leaveGroup = function(groupId) {
    return this.doCommand('room', 'leave', {
        roomId: groupId,
    });
};

module.exports = AVChatClient;
