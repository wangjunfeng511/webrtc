//本文件是视频请求方逻辑，但是不是真正的请求。
//它通过向另一方发送命令，让连接的另一方返回来请求我们自己

//创建webSocket对象，其中location对象的hostname属性返回当前url的主机名
const ip = location.hostname;
const url = "wss://" + ip + "/monitor";
const conn = new WebSocket(url);

//本地登录用户our username
let myUsername = null;
//远程连接用户usermyUsername that connected to us
let connectedUsername = null;
//RTCPeerConnection
let myPeerConnection;
// MediaStream from webcam
let stream;
//当前客户端的RTCPeerConnection是否创建了
let RTCPeerConnectionCreated = false;

const loginPage = document.querySelector("#loginPage");
const usernameInput = document.querySelector("#usernameInput");
const loginBtn = document.querySelector("#loginBtn");

const callPage = document.querySelector("#callPage");
const callToUsernameInput = document.querySelector("#callToUsernameInput");
const callBtn = document.querySelector("#callBtn");

const hangUpBtn = document.querySelector("#hangUpBtn");

const remoteVideo = document.querySelector("#remoteVideo");

loginPage.style.display = "block";
callPage.style.display = "none";

conn.onopen = function () {
  console.log("Connected to the signaling server");
};

//客户端接收到来自服务器的消息
conn.onmessage = function (msg) {
  console.log("Got message", msg.data);
  let data = JSON.parse(msg.data);
  switch (data.type) {
    case "login":
      handleLogin(data.success);
      break;

    case "offer":
      handleOffer(data.offer, data.name);
      break;
    case "answer":
      handleAnswer(data.answer);
      break;

    case "candidate":
      handleCandidate(data.candidate);
      break;
    case "leave":
      handleLeave();
      break;
    case "sendinfo":
      alert(data.info);
      if (data.close == true) {
        //关闭页面在各大浏览器下不兼容，选择折衷的about:blank法
        window.location.href = "about:blank";
      }
      break;
    default:
      break;
  }
};

conn.onerror = (err) => {
  console.log("Got error", err);
};

//发送给服务器，然后服务器再转发给另外一个客户端
function sendToServer(message) {
  //将另一个对等用户名附加到我们的消息中
  if (connectedUsername) {
    message.name = connectedUsername;
  }
  //JSON.stringify() 方法将一个 JavaScript 对象或值转换为 JSON 字符串
  conn.send(JSON.stringify(message));
}

loginBtn.addEventListener("click", function (event) {
  myUsername = usernameInput.value;
  if (myUsername.length > 0) {
    sendToServer({
      type: "login",
      name: myUsername,
    });
  }
});

//当登录进服务器时，服务器会回复给我们，需要根据成功还是失败进行处理
function handleLogin(success) {
  if (success === false) {
    alert("Ooops...try a different username");
  } else {
    loginPage.style.display = "none";
    callPage.style.display = "block";
    /*
        //getting local video stream
        navigator.mediaDevices.getUserMedia({
            video: true, audio: true
        }).then(streamHandler).catch(errorHandler);
*/
  }
}

//当有用户向我们发送请求
//offer 表示offer
//name 表示发送offer给我的人（另一方）

async function handleOffer(offer, name) {
  //如果没创建RTCPeerConnection,需要重新创建连接对象，否则不需要
  if (RTCPeerConnectionCreated == false) {
    initPeer();
  }
  connectedUsername = name;

  await myPeerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  //创建回答
  myPeerConnection
    .createAnswer()
    .then(function (answer) {
      myPeerConnection.setLocalDescription(answer);
      sendToServer({
        type: "answer",
        answer: answer,
      });
    })
    .catch(function (error) {
      alert("Error when creating an answer");
    });
}

//当我们得到远程用户的答复时
//answer 对方发过来的answer
async function handleAnswer(answer) {
  await myPeerConnection.setRemoteDescription(
    new RTCSessionDescription(answer)
  );
}

//当我们从远程用户那得到ice候选时
//candidate 对方法发过来的candidate
function handleCandidate(candidate) {
  myPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

/**
 * 断开连接的处理逻辑
 */
function handleLeave() {
  //attention sequence
  connectedUsername = null;
  remoteVideo.src = null;

  myPeerConnection.onicecandidate = null;
  myPeerConnection.onaddstream = null;
  myPeerConnection.ontrack = null;
  myPeerConnection.onsignalingstatechange = null;
  myPeerConnection.onicegatheringstatechange = null;
  //myPeerConnection.onnotificationneeded = null;
  myPeerConnection.close();
  myPeerConnection = null;
  RTCPeerConnectionCreated = false;
  //按钮相应的要变化
  hangUpBtn.disabled = true;
  callBtn.disabled = false;
}

//发起调用，调用前必须创建和设置PeerConnection
callBtn.addEventListener("click", function () {
  //调用者必须初始化 RTCPeerConnection
  initPeer();
  //发送命令逻辑
  let callToUsername = callToUsernameInput.value;
  //不能呼叫自己，myUserName就是userNameInput.value
  if (callToUsername === myUsername) {
    alert("can't let you talk to yourself. That would be weird.");
    return;
  }

  if (callToUsername.length > 0) {
    connectedUsername = callToUsername;
    //通过浏览器的观察方不再发起请求，而是发起让对方发起createOffer的请求的命令。
    //原因是因为如果发起请求方没有摄像头，则请求会失败
    //但是如果应答方没有摄像头是没有关系的！

    sendToServer({
      type: "cmd",
    });

    /*      create an offer 弃用
        let offer =  myPeerConnection.createOffer();
        myPeerConnection.setLocalDescription(offer);
        sendToServer({
            type: "offer",
            offer: offer
        });
*/
  }
});

hangUpBtn.addEventListener("click", function () {
  //先通知挂断（如果是放在handleLeave里面是实现不了的，因为已经先挂断了）
  //另外放到stateChange事件去触发也不是个好办法，同上
  //按了按钮才会给对方发送挂断信息，直接关闭浏览器，对方是不会知道你已经挂断的
  sendToServer({
    type: "sendinfo",
    info: "对方已挂断",
    close: false,
  });

  sendToServer({
    type: "leave",
  });
  handleLeave();
});

//stun服务器选择很重要，之前用谷歌的公共stun服务器，结果在两台主机间通信时ice无法连接
const configuration = {
  iceServers: [
    { urls: ["stun:ss-turn1.xirsys.com"] },
    {
      username:
        "CEqIDkX5f51sbm7-pXxJVXePoMk_WB7w2J5eu0Bd00YpiONHlLHrwSb7hRMDDrqGAAAAAF_OT9V0dWR1d2Vi",
      credential: "446118be-38a4-11eb-9ece-0242ac140004",
      urls: [
        "turn:ss-turn1.xirsys.com:80?transport=udp",
        "turn:ss-turn1.xirsys.com:3478?transport=udp",
      ],
    },
  ],
};

function initPeer() {
  let PeerConnection =
    window.RTCPeerConnection ||
    window.webkitRTCPeerConnection ||
    window.mozRTCPeerConnection;

  try {
    myPeerConnection = new PeerConnection(configuration);
    if ("ontrack" in myPeerConnection) {
      console.log("use ontrack");
      myPeerConnection.ontrack = handleRemoteTrackAdded;
    } else {
      console.log("use onaddstream");
      myPeerConnection.onaddstream = handleRemoteStreamAdded;
      /*
            myPeerConnection.onremovestream = function (e) {
                console.log('Remote stream removed. Event: ', e);
            }*/
    }

    myPeerConnection.onicecandidate = handleIceCandidate;
    myPeerConnection.oniceconnectionstatechange =handleIceConnectionStateChangeEvent;
    myPeerConnection.onicegatheringstatechange =handleIceGatheringStateChangeEvent;
    myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
    //myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;

    RTCPeerConnectionCreated = true;
  } catch (e) {
    console.log("Failed to create PeerConnection, exception: " + e.message);
    alert("Cannot create RTCPeerConnection object.");
    RTCPeerConnectionCreated = false;
    return;
  }
}

async function handleIceCandidate(event) {
  if (event.candidate) {
    sendToServer({
      type: "candidate",
      candidate: event.candidate,
    });
  }
}

async function handleRemoteTrackAdded(e) {
  //remoteVideo.srcObject = window.URL.createObjectURL(e.stream);
  remoteVideo.srcObject = e.streams[0];
  hangUpBtn.disabled = false; //放这里可能并不太好
  callBtn.disabled = true;
}

async function handleRemoteStreamAdded(e) {
  //remoteVideo.srcObject = window.URL.createObjectURL(e.stream);
  remoteVideo.srcObject = e.stream;
  hangUpBtn.disabled = false;
  callBtn.disabled = true;
}

async function handleIceConnectionStateChangeEvent(event) {
  console.log(
    "*** ICE connection state changed to " + myPeerConnection.iceConnectionState
  );

  switch (myPeerConnection.iceConnectionState) {
    case "closed":
    case "failed":
    case "disconnected":
      handleLeave();
      break;
  }
}

async function handleIceGatheringStateChangeEvent(event) {
  console.log(
    "*** ICE gathering state changed to: " + myPeerConnection.iceGatheringState
  );
}

async function handleSignalingStateChangeEvent(event) {
  if (myPeerConnection == null) {
    return;
  }
  console.log(
    "*** WebRTC signaling state changed to: " + myPeerConnection.signalingState
  );
  switch (myPeerConnection.signalingState) {
    case "closed":
      handleLeave();
      break;
  }
}
