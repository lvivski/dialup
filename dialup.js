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
  var serversList = [ "stun.l.google.com:19302" ];
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
    this.getUserStream = async function(audio, video) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audio,
        video: video ? {
          facingMode: "user"
        } : false
      });
      streams.push(stream);
      Overtone.filter(stream);
      for (const clientId of clientIds) {
        addTracks(clientId, stream);
      }
      return stream;
    };
    this.getDisplayStream = async function() {
      const stream = await navigator.mediaDevices.getDisplayMedia();
      streams.push(stream);
      for (const clientId of clientIds) {
        addTracks(clientId, stream);
      }
      return stream;
    };
    this.stopStream = function(stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      streams.splice(streams.indexOf(stream), 1);
    };
    channel.onPeers.listen(function(message) {
      me = message.you;
      for (const clientId of message.connections) {
        clientIds.push(clientId);
        createPeerConnection(clientId);
        createDataChannel(clientId);
      }
    });
    channel.onNew.listen(function(message) {
      const clientId = message.id;
      clientIds.push(clientId);
      createPeerConnection(clientId);
    });
    channel.onCandidate.listen(function(message) {
      const clientId = message.id;
      const pc = peerConnections[clientId];
      pc.addIceCandidate(message.candidate);
    });
    channel.onLeave.listen(function(message) {
      const clientId = message.id;
      delete peerConnections[clientId];
      delete dataChannels[clientId];
      clientIds.splice(clientIds.indexOf(clientId), 1);
    });
    channel.onOffer.listen(async function(message) {
      const clientId = message.id;
      const pc = peerConnections[clientId];
      await pc.setRemoteDescription(message.description);
      if (pc.iceConnectionState === "new") {
        for (const stream of streams) {
          addTracks(clientId, stream);
        }
      }
      await createAnswer(clientId);
    });
    channel.onAnswer.listen(async function(message) {
      const clientId = message.id;
      const pc = peerConnections[clientId];
      await pc.setRemoteDescription(message.description);
    });
    function addTracks(clientId, stream) {
      const pc = peerConnections[clientId];
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
    }
    async function createOffer(clientId) {
      const pc = peerConnections[clientId];
      await pc.setLocalDescription(await pc.createOffer());
      channel.send("offer", {
        id: clientId,
        description: pc.localDescription
      });
    }
    async function createAnswer(clientId) {
      const pc = peerConnections[clientId];
      await pc.setLocalDescription(await pc.createAnswer());
      channel.send("answer", {
        id: clientId,
        description: pc.localDescription
      });
    }
    function createDataChannel(clientId, label) {
      label || (label = "dataChannel");
      const pc = peerConnections[clientId];
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
          break;

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
      pc.onnegotiationneeded = function() {
        createOffer(clientId);
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