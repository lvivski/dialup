(function(global) {
  "use strict";
  if (typeof global !== "Window") {
    global = window;
  }
  var navigator = global.navigator, RTCPeerConnection = global.mozRTCPeerConnection || global.webkitRTCPeerConnection || global.PeerConnection, getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia).bind(navigator), RTCIceCandidate = global.mozRTCIceCandidate || global.RTCIceCandidate, RTCSessionDescription = global.mozRTCSessionDescription || global.RTCSessionDescription;
  global.URL = global.URL || global.webkitURL || global.msURL;
  var Observable, Promise, Audio;
  if (typeof define === "function" && define.amd) {
    define([ "streamlet", "davy", "overtone" ], function(streamlet, davy, overtone) {
      Observable = streamlet;
      Promise = davy;
      Audio = overtone;
      return Dialup;
    });
  } else if (typeof module === "object" && module.exports) {
    module.exports = Dialup;
    Observable = require("streamlet");
    Promise = require("davy");
    Audio = require("overtone");
  } else {
    global.Dialup = Dialup;
    Observable = global.Streamlet;
    Promise = global.Davy;
    Audio = global.Overtone;
  }
  function Dialup(url, room) {
    var me = null, sockets = [], connections = {}, data = {}, streams = [], controller = Observable.control(), stream = controller.stream, socket = new WebSocket(url);
    var constraints = {
      optional: [],
      mandatory: {
        OfferToReceiveAudio: true,
        OfferToReceiveVideo: true
      }
    }, constraintsScreen = {
      video: {
        mandatory: {
          chromeMediaSource: "screen"
        }
      }
    }, servers = {
      iceServers: [ {
        url: "stun:stun.l.google.com:19302"
      } ]
    }, config = {
      optional: [ {
        DtlsSrtpKeyAgreement: true
      } ]
    };
    socket.onopen = function() {
      send("join", {
        room: room || ""
      });
    };
    socket.onerror = function() {};
    socket.onmessage = function(e) {
      controller.add(JSON.parse(e.data));
    };
    this.onOffer = stream.filter(function(message) {
      return message.type === "offer";
    });
    this.onAnswer = stream.filter(function(message) {
      return message.type === "answer";
    });
    this.onCandidate = stream.filter(function(message) {
      return message.type === "candidate";
    });
    this.onNew = stream.filter(function(message) {
      return message.type === "new";
    });
    this.onPeers = stream.filter(function(message) {
      return message.type === "peers";
    });
    this.onLeave = stream.filter(function(message) {
      return message.type === "leave";
    });
    this.onAdd = stream.filter(function(message) {
      return message.type === "add";
    });
    this.onRemove = stream.filter(function(message) {
      return message.type === "remove";
    });
    this.onData = stream.filter(function(message) {
      return message.type === "data";
    });
    this.broadcast = function(message) {
      for (var k in data) {
        this.send(k, message);
      }
    };
    this.send = function(id, message) {
      var d = data[id];
      if (d.readyState === "open") d.send(message);
    };
    this.createStream = function(audio, video) {
      var defer = Promise.defer();
      getUserMedia({
        audio: audio,
        video: video
      }, function(stream) {
        Audio.filter(stream);
        streams.push(stream);
        for (var i = 0; i < sockets.length; ++i) {
          var socket = sockets[i];
          connections[socket] = createPeerConnection(socket);
        }
        for (i = 0; i < streams.length; ++i) {
          stream = streams[i];
          for (socket in connections) {
            var connection = connections[socket];
            connection.addStream(stream);
          }
        }
        for (socket in connections) {
          connection = connections[socket];
          createDataChannel(socket, connection);
          createOffer(socket, connection);
        }
        defer.fulfill(stream);
      }, function() {}, constraints);
      return defer.promise;
    };
    this.onPeers.listen(function(message) {
      me = message.you;
      for (var i in message.connections) {
        var connection = message.connections[i];
        sockets.push(connection);
      }
    });
    this.onCandidate.listen(function(message) {
      var candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
      });
      connections[message.id].addIceCandidate(candidate);
    });
    this.onNew.listen(function(message) {
      var id = message.id, pc = createPeerConnection(id);
      sockets.push(id);
      connections[id] = pc;
      streams.forEach(function(stream) {
        pc.addStream(stream);
      });
    });
    this.onLeave.listen(function(message) {
      var id = message.id;
      delete connections[id];
      delete data[id];
      sockets.splice(sockets.indexOf(id), 1);
    });
    this.onOffer.listen(function(message) {
      var pc = connections[message.id];
      pc.setRemoteDescription(new RTCSessionDescription(message.description));
      createAnswer(message.id, pc);
    });
    this.onAnswer.listen(function(message) {
      var pc = connections[message.id];
      pc.setRemoteDescription(new RTCSessionDescription(message.description));
    });
    function createOffer(socket, pc) {
      pc.createOffer(function(session) {
        pc.setLocalDescription(session);
        send("offer", {
          id: socket,
          description: {
            sdp: session.sdp,
            type: session.type
          }
        });
      }, function() {}, constraints);
    }
    function createAnswer(socket, pc) {
      pc.createAnswer(function(session) {
        pc.setLocalDescription(session);
        send("answer", {
          id: socket,
          description: {
            sdp: session.sdp,
            type: session.type
          }
        });
      }, function() {});
    }
    function createDataChannel(id, pc, label) {
      label || (label = "dataChannel");
      var channel = pc.createDataChannel(label, {
        reliable: true
      });
      addDataChannel(id, channel);
    }
    function addDataChannel(id, channel) {
      channel.onopen = function() {};
      channel.onmessage = function(e) {
        controller.add({
          type: "data",
          id: id,
          data: e.data
        });
      };
      channel.onclose = function() {};
      data[id] = channel;
    }
    function createPeerConnection(id) {
      var pc = new RTCPeerConnection(servers, config);
      pc.onicecandidate = function(e) {
        if (e.candidate != null) {
          send("candidate", {
            label: e.candidate.sdpMLineIndex,
            id: id,
            candidate: e.candidate.candidate
          });
        }
      };
      pc.oniceconnectionstatechange = function() {
        switch (pc.iceConnectionState) {
         case "disconnected":
         case "failed":
          pc.close();
          break;

         case "completed":
          pc.onicecandidate = function() {};
          break;
        }
      };
      pc.onaddstream = function(e) {
        controller.add({
          type: "add",
          id: id,
          stream: e.stream
        });
      };
      pc.onremovestream = function(e) {
        controller.add({
          type: "remove",
          id: id,
          stream: e.stream
        });
      };
      pc.ondatachannel = function(e) {
        addDataChannel(id, e.channel);
      };
      return pc;
    }
    function send(event, data) {
      data.type = event;
      socket.send(JSON.stringify(data));
    }
  }
})(this);