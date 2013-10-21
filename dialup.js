(function(global) {
  "use strict";
  var navigator = global.navigator, RTCPeerConnection = global.PeerConnection || global.webkitPeerConnection00 || global.webkitRTCPeerConnection || global.mozRTCPeerConnection, getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || noop).bind(navigator), RTCIceCandidate = global.mozRTCIceCandidate || global.RTCIceCandidate, RTCSessionDescription = global.mozRTCSessionDescription || global.RTCSessionDescription;
  global.URL = global.URL || global.webkitURL || global.msURL;
  var Stream, Promise;
  if (typeof define === "function" && define.amd) {
    define([ "streamlet", "davy" ], function(Streamlet, Davy) {
      Stream = Streamlet;
      Promise = Davy;
      return Dialup;
    });
  } else if (typeof module === "object" && module.exports) {
    module.exports = Dialup;
    Stream = require("streamlet");
    Promise = require("davy");
  } else {
    global.Dialup = Dialup;
    Stream = global.Stream;
    Promise = global.Promise;
  }
  function Dialup(url, room) {
    var me = null, sockets = [], connections = {}, data = {}, streams = [], stream = new Stream(), socket = new WebSocket(url);
    socket.onopen = function() {
      send("join", {
        room: room || ""
      });
    };
    socket.onerror = function() {};
    socket.onmessage = function(e) {
      stream.add(JSON.parse(e.data));
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
    this.send = function(message) {
      for (var k in data) {
        var d = data[k];
        d.send(message);
      }
    };
    this.createStream = function(audio, video) {
      var promise = new Promise();
      getUserMedia({
        audio: audio,
        video: video
      }, function(stream) {
        streams.push(stream);
        for (var i = 0; i < sockets.length; ++i) {
          var socket = sockets[i];
          connections[socket] = createPeerConnection(socket);
        }
        for (i = 0; i < streams.length; ++i) {
          var stream = streams[i];
          for (var socket in connections) {
            var connection = connections[socket];
            connection.addStream(stream);
          }
        }
        for (socket in connections) {
          connection = connections[socket];
          createDataChannel(socket, connection);
          createOffer(socket, connection);
        }
        promise.fulfill(stream);
      }, function() {});
      return promise;
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
      }, function() {});
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
      var channel = pc.createDataChannel(label || "fileTransfer", {
        reliable: false
      });
      addDataChannel(id, channel);
    }
    function addDataChannel(id, channel) {
      channel.onopen = function() {};
      channel.onmessage = function(e) {
        stream.add({
          type: "data",
          id: id,
          data: e.data
        });
      };
      channel.onclose = function() {};
      data[id] = channel;
    }
    function createPeerConnection(id) {
      var pc = new RTCPeerConnection({
        iceServers: [ {
          url: "stun:stun.l.google.com:19302"
        } ]
      }, {
        optional: [ {
          RtpDataChannels: true
        }, {
          DtlsSrtpKeyAgreement: true
        } ]
      });
      pc.onicecandidate = function(e) {
        if (e.candidate != null) {
          send("candidate", {
            label: e.candidate.sdpMLineIndex,
            id: id,
            candidate: e.candidate.candidate
          });
        }
      };
      pc.onaddstream = function(e) {
        stream.add({
          type: "add",
          id: id,
          stream: e.stream
        });
      };
      pc.onremovestream = function(e) {
        stream.add({
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