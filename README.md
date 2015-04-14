# LeanMessage JavaScript SDK

## 该版本实时通信 SDK 为 1.x 版本，目前已经处于维护状态，如果想要使用 LeanCloud JavaScript 实时通信 SDK 请参考我们的文档 —— 「[JavaScript 实时通信开发指南](http://leancloud.cn/docs/js_realtime.html)」

在使用此 SDK 之前需要先熟悉 [实时消息基础概念](https://leancloud.cn/docs/realtime.html)

[查看 Changelog](https://download.avoscloud.com/sdk/jschat/changelog.txt)

目前我们已经开发 [JavaScript Realtime SDK 2.0 版本](http://github.com/leancloud/js-realtime-sdk/)，欢迎试用。

##  方法
*除构造函数外，所有方法都会返回 promise ，因为都是异步执行，通过监听  `.then(successFunc, errorFunc)` 可以处理成功失败。*

### `new AVChatClient(settings)`
实例化一个 消息客户端

```javascript

var chat = new AVChatClient({
  appId: 应用 ID,
  peerId: 当前用户的 PeerID,
  auth: 私聊签名函数(当平台设置启动签名后，需要传递),
  server: (非必须)，'us' 为使用美国节点,
  sp: (非必须)，设置为 true 时可以实现 非 watch 情况下发送信息，需要 auth 签名进行相关设置
  groupAuth: 群组聊天签名函数(当平台设置启动签名后，需要传递),
  watchingPeerIds: (非必须)
})

```
具体签名函数 需要类似下面的示例格式，基于 Promise 的异步操作。
[签名函数示例](https://gist.github.com/sunchanglong/acd42f99d26b05203d6c)

```javascript
function auth(peerId, watchingPeerIds, sp){
  // 参数 sp : Boolean 类型，为超级用户时为 true，即不需要 watch 即可发送信息 。
  /*
  return new Promise(function(resolve,reject){

    // 这里放 AJAX auth code
    resolve({
      watchingPeerIds: AJAX 返回值
    });

  });
  */
  // 这里实现了一个空函数
  return Promise.resolve({
    watchingPeerIds: watchingPeerIds||[]
  });
}
function groupAuth(peerId, groupId, action, groupPeerIds){
  return Promise.resolve({
    groupPeerIds: groupPeerIds || []
  });
}
```


### `open()`

打开链接，需要先执行上面的 new 构造函数,

```javascript
chat.open().then(function(data){
  //打开成功
})
```



### `close()`

关闭链接

### `send(msg, to, transient)`

发送私聊消息

- `msg`：消息内容
- `to`：发送目标 `PeerId`
- `transient`（非必须)：为 `true` 时代表无需离线，默认为支持离线发送

```javascript
chat.send().then(function(data){
  //success full send callback
  },function(err){
  //error callback
})
```

### `watch(peers)`

关注 PeerId，接受对方上下线状态。在开启签名的应用中，需要首先 watch 对方才能发送消息。

- `peers`：单个 `peerId` 或数组

### `unwatch(peers)`

取消关注

- `peers`：单个 `peerId` 或数组

### `getStatus(peers)`

查询 `peer` 在线或离线状态。适应于非 `watch` 情况下，即没有  `watch` 对方也能获取在线状态。

- `peers`：单个 peerId 或数组

### `on(name, func)`

监听事件

- `name`：事件名称
- `func`：事件处理函数

##  事件

### `close`

```javascript
chat.on('close', function() {
  //可以在这里进行重连 自行设置重连策略
});
```

链接关闭

### `online`

上线，当关注的人上线时触发。

```javascript
chat.on('online', function(data) {
  // 上线处理
});
```

### `offline`

下线

当关注的人下线时触发

### `message`

收到消息时触发

```javascript
chat.on('message', function(data) {
  // 消息处理
});
```

## 群组方法

### `joinGroup(groupId)`

创建或加入群组

- `groupId`：群组 ID，创建时无需传递。

### `sendToGroup(msg, groupId, transient)`

发送消息到指定群组

- `msg`：消息内容
- `grouipId`：群组 ID
- `transient`（非必须)：为 `true` 时代表无需离线，默认为支持离线发送

### `inviteToGroup(groupId, groupPeerIds)`

邀请加入群组

- `groupId`：群组 ID,
- `groupPeerIds`：单个或数组群组 ID

### `kickFromGroup(groupId, groupPeerIds)`

踢出群组

- `groupId`：群组 ID
- `groupPeerIds`：单个或数组群组 ID

### `leaveGroup(groupId)`

离开群组

- `groupId`：群组 ID

## 群组事件

### `membersJoined`

有成员加入群

### `membersLeft`

有成员离开群

### `joined`

自己加入了群

### `left`

自己离开了群

## 运行 Demo

直接启动一个 web 服务器 即可运行 demo。

### Demo 使用方法及步骤

1. 您可以使用同一个浏览器的两个 tab 标签来测试，打开一个 tab，运行 demo;
2. 首先输入一个你自定义的 peerId 比如 test123。再输入一个 watchingPeer，同样是自定义的字符串即可，比如 test234；
3. 再点击「new Client」按钮，然后点击「open」按钮来建立服务，显示由「not connect」变为「connected」时，表示连接成功；
4. 「Message to test234」部分，可以给 test234 发送实时消息；
5. 打开另一个 tab，peerId 填入 test234，注意是「test234」，也就是说，这个 tab 扮演 test234 这个终端。watchingPeer 填入 test123，然后按照步骤 3 来操作，即点击「new Client」按钮，然后点击「open」按钮建立连接；
6. 两个 tab 间可以互相收到消息。Watching Peers 下面会列出已经 watch 的 peerId 状态，绿色竖线代表「在线」。

## 浏览器端环境依赖

1. jQuery (非必须)  用于 jsonp 方式请求 (请求 Socket 服务器信息)，主要是针对 IE9 以下浏览器的跨域支持。如果没有 jQuery 会根据 `XMLHttpRequest` 创建 AJAX 跨域请求。
2. es6-promise (非必须) 当需要签名认证的时候需要，是一个 Promise 接口。
3. `./lib/flash/swfobject.js web_socket.js` (非必须) 用于跨浏览器支持 WebSocket。针对不支持 WebSocket 的浏览器。参照 <a href="https://github.com/gimite/web-socket-js">web-socket-js</a>
4. `./lib/es5-shim.js` IE8 以下的浏览器需要依赖这个
5. `./lib/json2.js`  IE7 以及以下浏览器

## 浏览器端 lib 生成

```javascript
browserify chat.js -o  lib/av-chat.js --exclude xmlhttprequest --exclude ws -s AVChatClient
browserify chat.js  --exclude xmlhttprequest --exclude ws -s AVChatClient  | uglifyjs  > lib/av-chat-min.js
```

## node 环境

可以单独作为一个 npm package 使用。如果有服务端需求，比如机器人发消息，这个暂时需要放在自己的服务器上。

```shell
npm install lean-cloud-chat
```


