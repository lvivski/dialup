(function(global) {
  "use strict";
  if (typeof global !== "Window") {
    global = window;
  }
  var Streamlet, Overtone;
  if (typeof define === "function" && define.amd) {
    define([ "streamlet", "overtone" ], function(streamlet, overtone) {
      Streamlet = streamlet;
      Overtone = overtone;
      return Dialup;
    });
  } else if (typeof module === "object" && module.exports) {
    module.exports = Dialup;
    Streamlet = require("streamlet");
    Overtone = require("overtone");
  } else {
    global.Dialup = Dialup;
    Streamlet = global.Streamlet;
    Overtone = global.Overtone;
  }
  var serversList = [ "stun.l.google.com:19302", "stun1.l.google.com:19302", "stun2.l.google.com:19302", "stun3.l.google.com:19302", "stun4.l.google.com:19302", "stun.ekiga.net", "stun.ideasip.com", "stun.rixtelecom.se", "stun.schlund.de", "stun.stunprotocol.org:3478", "stun.voiparound.com", "stun.voipbuster.com", "stun.voipstunt.com", "stun.voxgratia.org" ];
  var iceServers = serversList.reduce(function(servers, server) {
    var lastEntry = servers[servers.length - 1];
    server = "stun:" + server;
    if (lastEntry) {
      var lastServer = lastEntry.urls[0];
      if (trimIce(lastServer) === trimIce(server)) {
        lastEntry.urls.push(server);
      } else {
        servers.push({
          urls: [ server ]
        });
      }
    } else {
      servers.push({
        urls: [ server ]
      });
    }
    return servers;
  }, []);
  function trimIce(server) {
    return server.replace(/^stun:stun\d*\./, "").replace(/:\d+$/, "");
  }
  function Channel(url, room) {
    const controller = Streamlet.control();
    const stream = controller.stream;
    const ws = new WebSocket(url);
    ws.onopen = function() {
      send("join", {
        room: room || ""
      });
    };
    ws.onerror = function() {};
    ws.onmessage = function(e) {
      controller.add(JSON.parse(e.data));
    };
    function send(message, data) {
      data.type = message;
      ws.send(JSON.stringify(data));
    }
    this.send = send;
    this.onJoin = stream.filter(message => message.type === "join");
    this.onOffer = stream.filter(message => message.type === "offer");
    this.onAnswer = stream.filter(message => message.type === "answer");
    this.onCandidate = stream.filter(message => message.type === "candidate");
    this.onNew = stream.filter(message => message.type === "new");
    this.onPeers = stream.filter(message => message.type === "peers");
    this.onLeave = stream.filter(message => message.type === "leave");
  }
  const constraints = {
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
  };
  const configuration = {
    iceServers: iceServers
  };
  function Dialup(url, room) {
    let me = null;
    const channel = new Channel(url, room);
    const clientIds = [];
    const connections = {};
    const data = {};
    const streams = [];
    const controller = Streamlet.control();
    const stream = controller.stream;
    this.onAdd = stream.filter(message => message.type === "add");
    this.onData = stream.filter(message => message.type === "data");
    this.onPeers = channel.onPeers;
    this.onLeave = channel.onLeave;
    this.broadcast = function(message) {
      for (const clientId in data) {
        this.send(clientId, message);
      }
    };
    this.send = function(clientId, message) {
      const dc = data[clientId];
      if (dc.readyState === "open") {
        dc.send(message);
      }
    };
    this.createStream = function(audio, video) {
      return navigator.mediaDevices.getUserMedia({
        audio: audio,
        video: video
      }).then(function(stream) {
        Overtone.filter(stream);
        streams.push(stream);
        for (const id of clientIds) {
          const connection = connections[id] = createPeerConnection(id);
          for (const stream of streams) {
            stream.getTracks().forEach(function(track) {
              connection.addTrack(track, stream);
            });
          }
          createDataChannel(id, connection);
          createOffer(id, connection);
        }
        return stream;
      });
    };
    channel.onPeers.listen(function(message) {
      me = message.you;
      for (const id of message.connections) {
        clientIds.push(id);
      }
    });
    channel.onCandidate.listen(function(message) {
      const clientId = message.id;
      connections[clientId].addIceCandidate(message.candidate);
    });
    channel.onNew.listen(function(message) {
      const clientId = message.id;
      const pc = createPeerConnection(clientId);
      clientIds.push(clientId);
      connections[clientId] = pc;
      streams.forEach(function(stream) {
        stream.getTracks().forEach(function(track) {
          pc.addTrack(track, stream);
        });
      });
    });
    channel.onLeave.listen(function(message) {
      const clientId = message.id;
      delete connections[clientId];
      delete data[clientId];
      clientIds.splice(clientIds.indexOf(clientId), 1);
    });
    channel.onOffer.listen(function(message) {
      const clientId = message.id;
      const pc = connections[clientId];
      pc.setRemoteDescription(message.description);
      createAnswer(clientId, pc);
    });
    channel.onAnswer.listen(function(message) {
      const clientId = message.id;
      const pc = connections[clientId];
      pc.setRemoteDescription(message.description);
    });
    function createOffer(clientId, pc) {
      pc.createOffer(constraints).then(offer => pc.setLocalDescription(offer)).then(() => channel.send("offer", {
        id: clientId,
        description: pc.localDescription
      }), function() {});
    }
    function createAnswer(clientId, pc) {
      pc.createAnswer().then(answer => pc.setLocalDescription(answer)).then(() => channel.send("answer", {
        id: clientId,
        description: pc.localDescription
      }), function() {});
    }
    function createDataChannel(clientId, pc, label) {
      label || (label = "dataChannel");
      const dc = pc.createDataChannel(label);
      addDataChannel(clientId, dc);
    }
    function addDataChannel(clientId, dc) {
      dc.onopen = function() {};
      dc.onmessage = function(e) {
        controller.add({
          id: clientId,
          type: "data",
          data: e.data
        });
      };
      dc.onclose = function() {};
      data[clientId] = dc;
    }
    function createPeerConnection(clientId) {
      const pc = new RTCPeerConnection(configuration);
      pc.onicecandidate = function(e) {
        if (e.candidate && e.candidate.candidate) {
          channel.send("candidate", {
            id: clientId,
            candidate: e.candidate
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
      pc.onicecandidateerror = function(e) {
        console.log(e);
      };
      pc.ontrack = function(e) {
        controller.add({
          id: clientId,
          type: "add",
          stream: e.streams[0]
        });
      };
      pc.ondatachannel = function(e) {
        addDataChannel(clientId, e.channel);
      };
      return pc;
    }
  }
})(this);