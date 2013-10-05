(function(global) {
  "use strict";
  var nextTick = function(next, buffer, length, tick) {
    buffer = new Array(1e4);
    length = 0;
    function enqueue(fn) {
      if (length === buffer.length) {
        length = buffer.push(fn);
      } else {
        buffer[length++] = fn;
      }
      if (!tick) {
        return tick = true;
      }
    }
    function execute() {
      var i = 0;
      while (i < length) {
        buffer[i]();
        buffer[i++] = undefined;
      }
      length = 0;
      tick = false;
    }
    if (typeof setImmediate === "function") {
      next = function(fn) {
        enqueue(fn) && setImmediate(execute);
      };
    } else if (typeof process === "object" && process.nextTick) {
      next = function(fn) {
        enqueue(fn) && process.nextTick(execute);
      };
    } else if (global.postMessage) {
      var message = "__subsequent", onMessage = function(e) {
        if (e.data === message) {
          e.stopPropagation && e.stopPropagation();
          execute();
        }
      };
      if (global.addEventListener) {
        global.addEventListener("message", onMessage, true);
      } else {
        global.attachEvent("onmessage", onMessage);
      }
      next = function(fn) {
        enqueue(fn) && global.postMessage(message, "*");
      };
    } else {
      next = function(fn) {
        enqueue(fn) && setTimeout(execute, 0);
      };
    }
    return next;
  }();
  if (typeof define === "function" && define.amd) {
    define(nextTick);
  } else if (typeof module === "object" && module.exports) {
    module.exports = nextTick;
  } else {
    global.subsequent = global.nextTick = nextTick;
  }
})(this);

(function(global) {
  "use strict";
  if (typeof define === "function" && define.amd) {
    define(Promise);
  } else if (typeof module === "object" && module.exports) {
    module.exports = Promise;
    var nextTick = require("subsequent");
  } else {
    global.Davy = global.Promise = Promise;
    var nextTick = global.nextTick;
  }
  function Promise(value) {
    this.value = value;
    this.deferreds = [];
  }
  Promise.prototype.isFulfilled = false;
  Promise.prototype.isRejected = false;
  Promise.prototype.then = function(onFulfill, onReject) {
    var promise = new Promise(), deferred = defer(promise, onFulfill, onReject);
    if (this.isFulfilled || this.isRejected) {
      resolve(deferred, this.isFulfilled ? Promise.SUCCESS : Promise.FAILURE, this.value);
    } else {
      this.deferreds.push(deferred);
    }
    return promise;
  };
  Promise.prototype.fulfill = function(value) {
    if (this.isFulfilled || this.isRejected) return;
    var isResolved = false;
    try {
      if (value === this) throw new TypeError("Can't resolve a promise with itself.");
      if (isObject(value) || isFunction(value)) {
        var then = value.then, self = this;
        if (isFunction(then)) {
          then.call(value, function(val) {
            if (!isResolved) {
              isResolved = true;
              self.fulfill(val);
            }
          }, function(err) {
            if (!isResolved) {
              isResolved = true;
              self.reject(err);
            }
          });
          return;
        }
      }
      this.isFulfilled = true;
      this.complete(value);
    } catch (e) {
      if (!isResolved) {
        this.reject(e);
      }
    }
  };
  Promise.prototype.reject = function(error) {
    if (this.isFulfilled || this.isRejected) return;
    this.isRejected = true;
    this.complete(error);
  };
  Promise.prototype.complete = function(value) {
    this.value = value;
    var type = this.isFulfilled ? Promise.SUCCESS : Promise.FAILURE;
    for (var i = 0; i < this.deferreds.length; ++i) {
      resolve(this.deferreds[i], type, value);
    }
    this.deferreds = undefined;
  };
  Promise.SUCCESS = "fulfill";
  Promise.FAILURE = "reject";
  Promise.all = function() {
    var args = [].slice.call(arguments.length === 1 && Array.isArray(arguments[0]) ? arguments[0] : arguments), promise = new Promise(), remaining = args.length;
    for (var i = 0; i < args.length; ++i) {
      resolve(i, args[i]);
    }
    return promise;
    function reject(err) {
      promise.reject(err);
    }
    function fulfill(val) {
      resolve(i, val);
    }
    function resolve(i, value) {
      if (isObject(value) && isFunction(value.then)) {
        value.then(fulfill, reject);
        return;
      }
      args[i] = value;
      if (--remaining === 0) {
        promise.fulfill(args);
      }
    }
  };
  function resolve(deferred, type, value) {
    var fn = deferred[type], promise = deferred.promise;
    if (isFunction(fn)) {
      nextTick(function() {
        try {
          value = fn(value);
          promise.fulfill(value);
        } catch (e) {
          promise.reject(e);
        }
      });
    } else {
      promise[type](value);
    }
  }
  function defer(promise, fulfill, reject) {
    return {
      promise: promise,
      fulfill: fulfill,
      reject: reject
    };
  }
  function isObject(obj) {
    return obj && typeof obj === "object";
  }
  function isFunction(fn) {
    return fn && typeof fn === "function";
  }
})(this);

(function(global) {
  "use strict";
  if (typeof define === "function" && define.amd) {
    define(Stream);
  } else if (typeof module === "object" && module.exports) {
    module.exports = Stream;
    var nextTick = require("subsequent");
  } else {
    global.Stream = Stream;
    var nextTick = global.nextTick;
  }
  function Stream() {
    this.listeners = [];
  }
  function handle(listener, data) {
    nextTick(function() {
      listener(data);
    });
  }
  Stream.prototype.add = function(data) {
    for (var i = 0; i < this.listeners.length; ++i) {
      handle(this.listeners[i], data);
    }
  };
  Stream.prototype.listen = function(listener) {
    this.listeners.push(listener);
  };
  function StreamTransformer(source) {
    Stream.call(this);
    source.listen(this.add.bind(this));
  }
  Stream.prototype.map = function(convert) {
    return new MapStream(this, convert);
  };
  function MapStream(source, convert) {
    StreamTransformer.call(this, source);
    this.convert = convert;
  }
  MapStream.prototype = Object.create(Stream.prototype);
  MapStream.prototype.add = function(data) {
    data = this.convert(data);
    Stream.prototype.add.call(this, data);
  };
  Stream.prototype.filter = function(test) {
    return new FilterStream(this, test);
  };
  function FilterStream(source, test) {
    StreamTransformer.call(this, source);
    this.test = test;
  }
  FilterStream.prototype = Object.create(Stream.prototype);
  FilterStream.prototype.add = function(data) {
    if (this.test(data)) Stream.prototype.add.call(this, data);
  };
  Stream.prototype.expand = function(expand) {
    return new ExpandStream(this, expand);
  };
  function ExpandStream(source, expand) {
    StreamTransformer.call(this, source);
    this.expand = expand;
  }
  ExpandStream.prototype = Object.create(Stream.prototype);
  ExpandStream.prototype.add = function(data) {
    data = this.expand(data);
    for (var i in data) {
      Stream.prototype.add.call(this, data[i]);
    }
  };
  Stream.prototype.take = function(count) {
    return new TakeStream(this, count);
  };
  function TakeStream(source, count) {
    StreamTransformer.call(this, source);
    this.count = count;
  }
  TakeStream.prototype = Object.create(Stream.prototype);
  TakeStream.prototype.add = function(data) {
    if (this.count-- > 0) {
      Stream.prototype.add.call(this, data);
    }
  };
  Stream.prototype.skip = function(count) {
    return new SkipStream(this, count);
  };
  function SkipStream(source, count) {
    StreamTransformer.call(this, source);
    this.count = count;
  }
  SkipStream.prototype = Object.create(Stream.prototype);
  SkipStream.prototype.add = function(data) {
    if (this.count-- > 0) return;
    Stream.prototype.add.call(this, data);
  };
  function EventStream(element, event) {
    var stream = new Stream();
    element.addEventListener(event, stream.add.bind(stream), false);
    return stream;
  }
  if (typeof window !== "undefined") {
    window.on = Node.prototype.on = function(event) {
      return new EventStream(this, event);
    };
  }
})(this);

(function(global) {
  "use strict";
  var navigator = global.navigator, RTCPeerConnection = global.PeerConnection || global.webkitPeerConnection00 || global.webkitRTCPeerConnection || global.mozRTCPeerConnection, getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || noop).bind(navigator), RTCIceCandidate = global.mozRTCIceCandidate || global.RTCIceCandidate, RTCSessionDescription = global.mozRTCSessionDescription || global.RTCSessionDescription;
  global.URL = global.URL || global.webkitURL || global.msURL;
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
      me = parseInt(message.you, 10);
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
      delete sockets[id];
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
          id: parseInt(socket),
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
  if (typeof define === "function" && define.amd) {
    define(Dialup);
  } else if (typeof module === "object" && module.exports) {
    module.exports = Dialup;
  } else {
    global.Dialup = Dialup;
  }
})(this);