"use strict";
//本js作为webrtc的一部分。负责采集视频流，并在收到对方的cmd命令后，把视频发送给对方
//设计思路是本地采集和webrtc RTCPeerConnection分开处理。本地不采集视频，就不初始化RTCPeerConnection

var conn;

//本地登录用户our username
var myUsername = null;
//远程连接用户usermyUsername that connected to usOffer
var connectedUsername = null;
//RTCPeerConnection
var myPeerConnection;
// MediaStream from webcam
var stream;
//当前客户端的RTCPeerConnection是否创建了
var RTCPeerConnectionCreated = false;

const loginPage = document.querySelector("#loginPage");
const loginBtn = document.querySelector("#loginBtn");
const wsBtn = document.querySelector("#wsBtn");
//var servernameInput = document.querySelector('#servernameInput');  //放到上面去了
const usernameInput = document.querySelector("#usernameInput");

const callPage = document.querySelector("#callPage");
const startBtn = document.querySelector("#startBtn");
const closeBtn = document.querySelector("#closeBtn");
const hangUpBtn = document.querySelector("#hangUpBtn");

const localVideo = document.querySelector("#localVideo");

loginPage.style.display = "block";
callPage.style.display = "none";
loginBtn.disabled = true;

wsBtn.addEventListener("click", function () {
  var servernameInput = document.querySelector("#servernameInput");
  var servername = servernameInput.value;
  servername = servername.replace(/(^\s*)|(\s*$)/g, ""); //替换输入内容当中所有的空字符，包括全角空格，半角都替换""
  var serverurl = "wss://" + servername + "/source";
  conn = new WebSocket(serverurl);

  conn.onmessage = function (msg) {
    console.log("Got message", msg.data);
    var data = JSON.parse(msg.data);
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
      //when a remote peer sends an ice candidate to us
      case "candidate":
        handleCandidate(data.candidate);
        break;
      case "leave":
        handleLeave();
        break;
      case "cmd":
        handleCmd(data.sender);
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

  conn.onerror = function (err) {
    console.log("Got error", err);
  };

  //ws eventHandler
  conn.onopen = function () {
    console.log("Connected to the signaling server");
  };

  //set btn valid
  loginBtn.disabled = false;
  wsBtn.disabled = true;
});

//execute main
//打开网页就已经通过ws和服务器连接了.并在服务器创建用户，这个过程只执行一次
//login button handler
loginBtn.addEventListener("click", function () {
  //处理username
  myUsername = usernameInput.value;
  myUsername = myUsername.replace(/(^\s*)|(\s*$)/g, ""); //替换输入内容当中所有的空字符
  if (myUsername.length > 0) {
    sendToServer({
      type: "login",
      name: myUsername,
    });
  }
});

// 发送给服务器，然后服务器再转发给另外一个客户端

function sendToServer(message) {
  if (connectedUsername) {
    message.name = connectedUsername;
  }
  conn.send(JSON.stringify(message));
}

// 当登录进服务器时，服务器会回复给我们，需要根据成功还是失败进行处理

function handleLogin(success) {
  if (success === false) {
    alert("Ooops...maybe the same username in server,try a different username");
  } else {
    //登录成功，显示该显示的界面
    loginPage.style.display = "none";
    callPage.style.display = "block";
  }
}

async function handleOffer(offer, name) {
  //如果没创建RTCPeerConnection,需要重新创建连接对象，否则不需要
  if (RTCPeerConnectionCreated == false) {
    initPeer();
  }
  connectedUsername = name;

  await myPeerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  //create an answer to an offer
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

async function handleAnswer(answer) {
  await myPeerConnection.setRemoteDescription(
    new RTCSessionDescription(answer)
  );
}

function handleCandidate(candidate) {
  myPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}
// 断开连接的处理逻辑

function handleLeave() {
  //attention sequence
  connectedUsername = null;
  //remoteVideo.src = null;

  myPeerConnection.onicecandidate = null;
  myPeerConnection.onaddstream = null;
  myPeerConnection.ontrack = null;
  myPeerConnection.onsignalingstatechange = null;
  myPeerConnection.onicegatheringstatechange = null;
  //myPeerConnection.onnotificationneeded = null;
  myPeerConnection.close();
  myPeerConnection = null;

  RTCPeerConnectionCreated = false;

  hangUpBtn.disabled = true;
}

//打开关闭摄像头的按钮只和音视频采集有关，不涉及ws传输逻辑
//改成打开摄像头
startBtn.addEventListener("click", function () {
  //getting local video stream
  navigator.mediaDevices
    .getUserMedia({
      video: true,
      audio: true,
    })
    .then(streamHandler)
    .catch(errorHandler);

  startBtn.disabled = true;
  closeBtn.disabled = false;
  hangUpBtn.disabled = false;
});
//改成关闭摄像头
closeBtn.addEventListener("click", function () {
  stream.getTracks().forEach((track) => track.stop());
  startBtn.disabled = false;
  closeBtn.disabled = true;
  hangUpBtn.disabled = true;
});

//hang up
hangUpBtn.addEventListener("click", function () {
  //先通知挂断
  sendToServer({
    type: "sendinfo",
    info: "对方已挂断",
    close: false,
  });
  //告诉对方我已经离开
  sendToServer({
    type: "leave",
  });
  handleLeave();
});

function streamHandler(myStream) {
  stream = myStream;

  localVideo.srcObject = stream;
  window.localStream = stream;
}

function errorHandler(error) {
  console.log(error);
}

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
    window.mozRTCPeerConnection ||
    window.webkitRTCPeerConnection;

  try {
    myPeerConnection = new RTCPeerConnection(configuration);

    if ("addTrack" in myPeerConnection) {
      /* use addTrack */
      stream.getTracks().forEach((track) => {
        myPeerConnection.addTrack(track, stream);
      });
    } else {
      myPeerConnection.addStream(stream);
    }

    if ("ontrack" in myPeerConnection) {
      myPeerConnection.ontrack = handleRemoteTrackAdded;
    } else {
      myPeerConnection.onaddstream = handleRemoteStreamAdded;
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
  //remoteVideo.srcObject = e.streams[0];
  //once add remote video success, we set call button disabled
  hangUpBtn.disabled = false;
}

async function handleRemoteStreamAdded(e) {
  //remoteVideo.srcObject = window.URL.createObjectURL(e.stream);
  //remoteVideo.srcObject = e.stream;
  //once add remote video success, we set call button disabled
  hangUpBtn.disabled = false;
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
    case "connected":
      hangUpBtn.disabled = false;
      break;
  }
}

async function handleIceGatheringStateChangeEvent(event) {
  console.log("*** ICE gathering state changed to: " + myPeerConnection.iceGatheringState);
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

//收到另一方发来的命令后，就可以开始着手createOffer了。
function handleCmd(sender) {
  //开始createOffer，并setLocalDescription
  if (sender.length > 0) {
    //connectedUsername是个全局变量，需要设置一下，否则sendToServer的时候不知道给谁发！
    connectedUsername = sender;
    //如果当前页面没有打开媒体流，则告知对方
    if (stream == null || !stream.active) {
      sendToServer({
        type: "sendinfo",
        info: "It seems that the other side have not open the camera",
        close: false,
      });
      return;
    }

    //初始化一切为了webrtc的必要准备
    initPeer();
    // create an offer
    myPeerConnection
      .createOffer()
      .then(function (offer) {
        myPeerConnection.setLocalDescription(offer);
        sendToServer({
          type: "offer",
          offer: offer,
        });
      })
      .catch(function (error) {
        alert("Error when creating an offer");
      });
  }
}
