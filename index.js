const express = require('express');
const app = express();
const WebSocketServer = require('ws').Server;
const fs = require('fs');

let sslOptions = {
    key: fs.readFileSync("C:/privkey.key"), //里面的文件替换成你生成的私钥
    cert: fs.readFileSync("C:/cacert.pem"), //里面的文件替换成你生成的证书
  };

const https = require("https").createServer(sslOptions, app);
https.listen(443, () => {
    console.log("https listen on");
  });

const wss = new WebSocketServer({server: https});

app.use(express.static('monitor'));
app.use(express.static('mediasource'));
app.get('/monitor',function(req,res){
    res.sendFile(__dirname + '/monitor/monitor.html');
});
app.get('/source',(req,res)=>{
    res.sendFile(__dirname + '/mediasource/source.html');
})


//存储所有连接服务器的用户
let users = {};

//当用户连接到服务器时
wss.on('connection', (connection) => {
    //connection表示当前连接的from
    //users[data.name]表示当前连接的to
    console.log("One user connected");
    //getOwnPropertyNames(obj)返回对象的所有属性组成的数组
    if(Object.getOwnPropertyNames(users).length >= 2){
        //给连接的客户端返回信息，并关闭这个客户端本身
        sendToClient(connection, {
            type: "sendinfo",
            info: "超过最大连接数<br>（设计为点对点，只允许两个用户连接websocket）",
            close: true

        });
        //return;
    }

    //当服务器接收到用户发的信息
    connection.on('message', (message) => {
        let data;
        //只接受JSON类型的数据
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.log("Invalid JSON");
            data = {};
        }
        //判断用户信息的类型
        switch (data.type) {
            //当用户尝试登录
            case "login":
                console.log("User logged", data.name);
                //不允许重复用户名登进服务器
                if(users[data.name]) {
                    sendToClient(connection, {
                        type: "login",
                        success: false
                    });
                } else {
                    //save user connection on the server
                    users[data.name] = connection;
                    connection.name = data.name;
                    sendToClient(connection, {
                        type: "login",
                        success: true
                    });
                }
                break;
            case "offer":
                //for ex. UserA wants to call UserB
                console.log("Sending offer to: ", data.name);
                //if UserB exists then send him offer details
                var conn = users[data.name];
                //判断要连接的用户在用户连接列表里面是否存在已经和服务器创建了连接，如果不存在则返回。
                if(conn != null) {
                    //setting that UserA connected with UserB
                    connection.otherName = data.name;
                    sendToClient(conn, {
                        type: "offer",
                        offer: data.offer,
                        name: connection.name
                    });
                }else{
                    //要连接的用户不存在！！！
                    //否则直接给发送方返回要连接的用户不存在的消息
                    sendToClient(connection, {
                        type: "sendinfo",
                        info: "user not exist",
                        close: false
                    });

                }
                break;
            case "answer":
                console.log("Sending answer to: ", data.name);
                //for ex. UserB answers UserA
                var conn = users[data.name];
                if(conn != null) {
                    connection.otherName = data.name;
                    sendToClient(conn, {
                        type: "answer",
                        answer: data.answer
                    });
                }
                break;
            case "candidate":
                console.log("Sending candidate to:",data.name);
                var conn = users[data.name];
                if(conn != null) {
                    sendToClient(conn, {
                        type: "candidate",
                        candidate: data.candidate
                    });
                }
                break;
            case "leave":
                console.log("Disconnecting from", data.name);
                var conn = users[data.name];
                conn.otherName = null;
                //notify the other user so he can disconnect his peer connection
                if(conn != null) {
                    sendToClient(conn, {
                        type: "leave"
                    });
                }
                break;
            case "cmd":
                console.log('I want to cmd User:', data.name);
                var conn = users[data.name];
                if(conn != null) {
                    console.log('Server sended');
                    sendToClient(conn, {
                        type: "cmd",
                        sender: connection.name
                    });
                }
                break;
            case "sendinfo":
                var conn = users[data.name];
                if(conn != null) {
                    sendToClient(conn, {
                        type: "sendinfo",
                        info: data.info,
                        close: data.close
                    });
                }
                break;
            default:
                sendToClient(connection, {
                    type: "error",
                    message: "Command not found: " + data.type
                });
                break;
        }
    });
    //when user exits, for example closes a browser window
    //this may help if we are still in "offer","answer" or "candidate" state
    connection.on("close", () => {
        console.log("One user disconnected");
        if(connection.name) {
            delete users[connection.name];
            if(connection.otherName) {
                console.log("Disconnecting from ", connection.otherName);
                var conn = users[connection.otherName];
                //conn.otherName = null;//delete from here
                if(conn != null) {
                    conn.otherName = null;//put here
                    sendToClient(conn, {
                        type: "leave"
                    });
                }
            }
        }
    });
    connection.send(JSON.stringify("I am server,you connect to me now!"));
});

function sendToClient(connection, message) {
    connection.send(JSON.stringify(message));
}