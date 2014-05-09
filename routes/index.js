'use strict';

module.exports = function (app, nconf, io) {
  var crypto = require('crypto');
  var Diphenhydramine = require('diphenhydramine');
  var level = require('level');
  var uuid = require('uuid');

  var ads = require('../lib/ads');
  var nativeClients = require('../clients.json');

  var diphenhydramine = new Diphenhydramine({
    db: './db/c',
    limit: 35
  });

  var getSortedChats = function (channel, done) {
    diphenhydramine.getChats(channel, false, done);
  };

  var emitChat = function (socket, channel, chat) {
    io.sockets.in(channel).emit('message', { chat: chat });
  };

  var cleanChannelTitle = function (channel) {
    return channel.toString().slice(0, 32).replace(/[^\w+]/gi, '').toLowerCase();
  };

  app.get('/', function (req, res) {
    res.render('index');
  });

  app.post('/channel', function (req, res, next) {
    var channel = cleanChannelTitle(req.body.channel);

    diphenhydramine.getChats(channel, true, function (err, c) {
      if (err) {
        res.status(400);
        res.render('400');
      } else {
        res.redirect('/c/' + channel);
      }
    });
  });

  app.get('/c/:channel', function (req, res, next) {
    var channel = cleanChannelTitle(req.params.channel);

    diphenhydramine.getChats(channel, true, function (err, c) {
      if (err) {
        res.status(400);
        res.render('400');
      } else {
        res.render('channel', {
          channel: channel
        });
      }
    });
  });

  // This method is deprecated! New clients should receive their IP when socket.io connects.
  // TODO(tec27): Remove this method when we can be sure no clients are using it
  app.get('/ip', function (req, res) {
    res.json({
      ip: req.ip
    });
  });

  var addChat = function (channel, message, picture, userId, ip, next) {
    if (picture.indexOf('data:image/jpeg') !== 0) {
      next(new Error('Invalid image type: must be a jpeg'));
      return;
    }

    diphenhydramine.addChat(message.slice(0, 100), channel, {
      media: picture,
      fingerprint: userId
    }, function (err, c) {
      if (err) {
        next(err);
      } else {
        try {
          emitChat(io.sockets, channel, { key: c.key, value: c });
          next(null, 'sent!');
        } catch (err) {
          next(new Error('Could not emit message'));
        }
      }
    });
  };

  var getUserId = function(fingerprint, ip) {
    return crypto.createHash('md5').update(fingerprint + ip).digest('hex');
  };

  app.post('/c/:channel/chat', function (req, res, next) {
    if (!req.isApiUser &&
        (typeof req.body.fingerprint === 'undefined' || req.body.fingerprint.length > 10)) {
      // client is either not sending a fingerprint or sending one longer than we would ever receive
      // from fingerprintjs, which means they're likely trying to generate MD5 collisions with other
      // clients
      res.status(403);
      return res.json({ error: 'invalid fingerprint' });
    }

    if (!req.body.picture) {
      res.status(400);
      return res.json({ error: 'you need webrtc' });
    }

    var ip = req.ip;
    var userId = getUserId(req.body.fingerprint, ip);
    if (userId !== req.body.userid && !req.isApiUser) {
      res.status(403);
      return res.json({ error: 'invalid fingerprint' });
    }

    var channel = cleanChannelTitle(req.params.channel);
    var message = req.body.message.slice(0, 100);

    addChat(channel, message, req.body.picture, userId, ip, function (err, status) {
      if (err) {
        res.status(400);
        res.json({ error: err.toString() });
      } else {
        res.json({ status: status });
      }
    });
  });

  var emitChannelCount = function (channel) {
    var count = io.sockets.clients(channel).length;
    io.sockets.in(channel).emit('count', {
      channel: channel,
      count: count
    });
  };

  var isInChannel = function (socket, channel) {
    return io.sockets.manager.roomClients[socket.id]['/' + channel];
  };

  io.sockets.on('connection', function (socket) {
    var ip = socket.handshake.address.address;
    if (socket.handshake.headers['x-forwarded-for']) {
      ip = socket.handshake.headers['x-forwarded-for'].split(/ *, */)[0];
    }
    socket.emit('ip', ip);

    var disconnectHandlers = Object.create(null);
    socket.on('disconnect', function () {
      disconnectHandlers = null;
    });

    socket.on('join', function (data) {
      if (!data.channel || isInChannel(socket, data.channel)) {
        return;
      }

      // if the user is already in a different channel, leave that channel first
      Object.keys(io.sockets.manager.roomClients[socket.id]).forEach(function(channel) {
        if (channel) { // if its not the main channel (which is '')
          socket.leave(channel.substring(1)); // have to strip off leading '/'
        }
      });

      console.dir(Object.keys(io.sockets.manager.roomClients[socket.id]));

      socket.join(data.channel);
      emitChannelCount(data.channel);
      if (!disconnectHandlers[data.channel]) {
        disconnectHandlers[data.channel] = function () {
          process.nextTick(function () {
            emitChannelCount(data.channel);
          });
        };
        socket.on('disconnect', disconnectHandlers[data.channel]);
      }

      // Fire out an initial burst of images to the connected client, assuming there are any available
      getSortedChats(data.channel, function (err, results) {
        if (err) {
          console.log('error retrieving chats: ' + err);
          return;
        }

        if (results.chats && results.chats.length > 0) {
          results.chats = ads.getAd(nconf, results.chats);

          results.chats.forEach(function (chat) {
            socket.emit('message', { chat: chat });
          });
        }
      });
    });

    socket.on('message', function (data) {
      if (nativeClients.indexOf(data.apiKey) > -1) {
        var userId = getUserId(data.fingerprint, ip);

        addChat(data.channel, data.message, data.picture, data.fingerprint, userId, ip, function (err) {
          if (err) {
            console.log('error posting ', err.toString());
          }
        });
      } else {
        console.log('Invalid apiKey');
      }
    });
  });
};
