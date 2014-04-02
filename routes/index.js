'use strict';

module.exports = function (app, nconf, io) {
  var crypto = require('crypto');
  var Diphenhydramine = require('diphenhydramine');
  var level = require('level');
  var uuid = require('uuid');

  var nativeClients = require('../clients.json');

  var diphenhydramine = new Diphenhydramine({
    db: './db/c',
    limit: 24
  });

  var getSortedChats = function (channel, done) {
    diphenhydramine.getChats(channel, true, function (err, c) {
      if (err) {
        done(err);
      } else {
        if (c.chats && c.chats.length > 0) {
          c.chats.reverse();
        }
        done(null, c);
      }
    });
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
          channel: channel,
          chats: c.chats
        });
      }
    });
  });

  app.get('/ip', function (req, res) {
    res.json({
      ip: req.ip
    });
  });

  var addChat = function (channel, message, picture, fingerprint, userId, ip, next) {
    if (picture.indexOf('data:image/jpeg') !== 0) {
      next(new Error('Invalid image type: must be a jpeg'));
      return;
    }

    diphenhydramine.addChat(message.slice(0, 100), channel, {
      ttl: 600000,
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
    var ip = req.ip;
    var userId = getUserId(req.body.fingerprint, ip);
    var channel = cleanChannelTitle(req.params.channel);
    var message = req.body.message.slice(0, 100);

    if (req.body.picture) {
      if ((userId === req.body.userid) || req.isApiUser) {
        addChat(channel, message, req.body.picture, req.body.fingerprint, userId, ip, function (err, status) {
          if (err) {
            res.status(400);
            res.json({ error: err.toString() });
          } else {
            res.json({ status: status });
          }
        });
      } else {
        res.status(403);
        res.json({ error: 'invalid fingerprint' });
      }
    } else {
      res.status(400);
      res.json({ error: 'you need webrtc' });
    }
  });

  var isInChannel = function(socket, channel) {
    return io.sockets.manager.roomClients[socket.id]['/' + channel];
  };

  io.sockets.on('connection', function (socket) {
    var ip = socket.handshake.address.address;
    if (socket.handshake.headers['x-forwarded-for']) {
      ip = socket.handshake.headers['x-forwarded-for'].split(/ *, */)[0];
    }

    socket.on('join', function (data) {
      if (!data.channel || isInChannel(socket, data.channel)) {
        return;
      }

      socket.join(data.channel);

      // Fire out an initial burst of images to the connected client, assuming there are any available
      getSortedChats(data.channel, function (err, results) {
        if (err) {
          console.log('error retrieving chats: ' + err);
          return;
        }

        if (results.chats && results.chats.length > 0) {
          try {
            results.chats.forEach(function (chat) {
              socket.emit('message', { chat: chat });
            });
          } catch (e) {
            if (typeof results.chats.forEach !== 'function') {
              console.log('chats is type of ', typeof results.chats, ' and somehow has length ', results.chats.length);

              if (typeof results.chats === 'string') {
                console.log('results.chats appears to be a string');
              }
            }
          }
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
