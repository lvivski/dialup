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
    server = "stun:" + server;
    var lastEntry = servers[servers.length - 1];
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
    this.onPeers = stream.filter(message => message.type === "peers");
    this.onNew = stream.filter(message => message.type === "new");
    this.onCandidate = stream.filter(message => message.type === "candidate");
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
    const streams = [];
    const peerConnections = {};
    const dataChannels = {};
    const senders = {};
    const controller = Streamlet.control();
    const stream = controller.stream;
    this.onAdd = stream.filter(message => message.type === "add");
    this.onData = stream.filter(message => message.type === "data");
    this.onPeers = channel.onPeers;
    this.onLeave = channel.onLeave;
    this.broadcast = function(message) {
      for (const clientId in dataChannels) {
        this.send(clientId, message);
      }
    };
    this.send = function(clientId, message) {
      const dc = dataChannels[clientId];
      if (dc.readyState === "open") {
        dc.send(message);
      }
    };
    this.getUserStream = function(audio, video) {
      return navigator.mediaDevices.getUserMedia({
        audio: audio,
        video: video ? {
          facingMode: "user"
        } : false
      }).then(function(stream) {
        Overtone.filter(stream);
        streams.push(stream);
        for (const clientId of clientIds) {
          const pc = peerConnections[clientId];
          addTracks(clientId, pc, stream);
        }
        return stream;
      });
    };
    this.getDisplayStream = function() {
      return navigator.mediaDevices.getDisplayMedia().then(function(stream) {
        streams.push(stream);
        for (const clientId of clientIds) {
          const pc = peerConnections[clientId];
          addTracks(clientId, pc, stream);
        }
        return stream;
      });
    };
    this.stopStream = function(stream) {
      stream.getTracks().forEach(function(track) {
        track.stop();
      });
    };
    channel.onPeers.listen(function(message) {
      me = message.you;
      for (const clientId of message.connections) {
        clientIds.push(clientId);
        createPeerConnection(clientId);
      }
    });
    channel.onNew.listen(function(message) {
      const clientId = message.id;
      clientIds.push(clientId);
      const pc = createPeerConnection(clientId);
      createDataChannel(clientId, pc);
      for (const stream of streams) {
        addTracks(clientId, pc, stream);
      }
    });
    channel.onCandidate.listen(function(message) {
      const clientId = message.id;
      peerConnections[clientId].addIceCandidate(message.candidate);
    });
    channel.onLeave.listen(function(message) {
      const clientId = message.id;
      delete peerConnections[clientId];
      delete dataChannels[clientId];
      delete senders[clientId];
      clientIds.splice(clientIds.indexOf(clientId), 1);
    });
    channel.onOffer.listen(function(message) {
      const clientId = message.id;
      const pc = peerConnections[clientId];
      pc.setRemoteDescription(message.description);
      createAnswer(clientId, pc);
    });
    channel.onAnswer.listen(function(message) {
      const clientId = message.id;
      const pc = peerConnections[clientId];
      pc.setRemoteDescription(message.description);
    });
    function addTracks(clientId, pc, stream) {
      if (!senders[clientId]) {
        senders[clientId] = [];
      }
      stream.getTracks().forEach(function(track) {
        senders[clientId].push(pc.addTrack(track, stream));
      });
    }
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
      dataChannels[clientId] = dc;
    }
    function createPeerConnection(clientId) {
      const pc = new RTCPeerConnection(configuration);
      peerConnections[clientId] = pc;
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
      pc.onnegotiationneeded = function(e) {
        createOffer(clientId, pc);
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