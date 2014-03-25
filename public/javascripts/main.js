define(['jquery', 'gumhelper', './base/transform', './base/videoShooter', 'fingerprint', 'md5', 'moment', 'favico'],
  function ($, gumhelper, transform, VideoShooter, Fingerprint, md5, moment, Favico) {
  'use strict';

  var videoShooter;

  var CHAT_LIMIT = 48;
  var CHAR_LIMIT = 100;

  var auth = {
    userid: null,
    fingerprint: new Fingerprint({ canvas: true }).get()
  };
  var chat = {
    container: $('#chat-container'),
    list: $('#chat-list')
  };
  var composer = {
    blocker: $('#composer-blocker'),
    form: $('#composer-form'),
    message: $('#composer-message'),
    inputs: $('#composer-form input').toArray()
  };
  var menu = {
    button: $('#menu-button'),
    list: $('#menu-list')
  };
  var html = $('html');
  var body = $('body');
  var counter = $('#counter');
  var footer = $('#footer');
  var videoWrapper = $('#videoWrapper');
  var channel = false;
  var isPosting = false;
  var canSend = true;
  var muteText = body.data('mute');
  var mutes = JSON.parse(localStorage.getItem('muted')) || [];
  var favicon = new Favico({
    animation: 'none',
    position: 'up left'
  });
  var socket = io.connect(
    location.protocol + '//' + location.hostname +
    (location.port ? ':' + location.port : '')
  );
  var unreadMessages = 0;
  var pageHidden = 'hidden';
  var pageVisibilityChange = 'visibilitychange';

  if (typeof document.hidden === 'undefined') {
    ['webkit', 'moz', 'ms'].some(function (prefix) {
      var prop = prefix + 'Hidden';
      if (typeof document[prop] !== 'undefined') {
        pageHidden = prop;
        pageVisibilityChange = prefix + 'visibilitychange';
        return true;
      }
    });
  }

  var handleVisibilityChange = function () {
    if (!document[pageHidden]) {
      unreadMessages = 0;
      favicon.badge(0);
    }
  };

  var updateNotificationCount = function () {
    if (document[pageHidden]) {
      unreadMessages += 1;
      favicon.badge(unreadMessages);
    }
  };

  var isMuted = function (fingerprint) {
    return mutes.indexOf(fingerprint) !== -1;
  };

  var render = function (incoming) {
    var fingerprint = incoming.value.fingerprint;

    // Don't want duplicates and don't want muted messages
    if (!isMuted(fingerprint) &&
        body.find('li[data-key="' + incoming.key + '"]').length === 0) {
      var img = new Image();
      var onComplete = function () {
        if (window.ga) {
          window.ga('send', 'event', 'message', 'receive');
        }

        var li = document.createElement('li');
        li.dataset.key = incoming.key;
        li.dataset.fingerprint = fingerprint;
        li.appendChild(img);

        // This is likely your own fingerprint so you don't mute yourself. Unless you're weird.
        if (auth.userid !== fingerprint) {
          updateNotificationCount();

          var button = document.createElement('button');
          button.textContent = muteText;
          button.className = 'mute';
          li.appendChild(button);
        }

        var message = document.createElement('p');
        message.textContent = incoming.value.message;
        message.innerHTML = transform(message.innerHTML);
        li.appendChild(message);

        var created = moment(new Date(incoming.value.created));
        var time = document.createElement('time');
        time.setAttribute('datetime', created.toISOString());
        time.textContent = created.format('LT');
        time.className = 'timestamp';
        li.appendChild(time);

        chat.list.prepend(li);

        var children = chat.list.children();

        if (children.length > CHAT_LIMIT) {
          chat.list.find('li').last().remove();
        }
      };

      img.onload = img.onerror = onComplete;
      img.src = incoming.value.media;
      img.title = fingerprint;
    }
  };

  var disableVideoMode = function () {
    composer.form.hide();
    footer.hide();
    chat.container.addClass('lean');
  };

  $.get('/ip?t=' + Date.now(), function (data) {
    auth.userid = md5(auth.fingerprint + data.ip);
  });

  body.on('click', '#unmute', function (ev) {
    if (ev.target.id === 'unmute') {
      localStorage.removeItem('muted');
      mutes = [];
    }
  }).on('keydown', function (ev) {
    if (!hasModifiersPressed(ev) && ev.target !== composer.message[0]) {
      composer.message.focus();
    }
  });

  chat.list.on('click', '.mute', function (ev) {
    var fingerprint = $(this).parent('[data-fingerprint]').data('fingerprint');
    var messages;

    if (!isMuted(fingerprint)) {
      mutes.push(fingerprint);
      localStorage.setItem('muted', JSON.stringify(mutes));
      messages = chat.list.children().filter(function() {
        // using filter because we have no guarantee of fingerprint
        // formatting, and therefore cannot trust a string attribute selector.
        return this.dataset.fingerprint === fingerprint;
      });
      messages.remove();
    }
  });

  composer.form.on('keydown', function (ev) {
    if (ev.keyCode === 13) {
      ev.preventDefault();
      composer.form.submit();
    }
  }).on('keyup', function (ev) {
    counter.text(CHAR_LIMIT - composer.message.val().length);
  }).on('submit', function (ev) {
    ev.preventDefault();

    composer.message.prop('readonly', true);

    if (!isPosting) {
      if (!canSend) {
        alert('please wait a wee bit...');
        composer.message.prop('readonly', false);
      }

      if (canSend) {
        canSend = false;
        composer.blocker.removeClass('hidden');
        isPosting = true;

        setTimeout(function () {
          canSend = true;
        }, 2000);

        var picture = videoShooter.getShot();
        var submission = composer.inputs.reduce(function(data, input) {
          return (data[input.name] = input.value, data);
        }, { picture: picture });

        $.post('/c/' + auth.channel + '/chat', $.extend(submission, auth), function () {
          if (window.ga) {
            window.ga('send', 'event', 'message', 'send');
          }
        }).error(function (data) {
          alert(data.responseJSON.error);
        }).always(function (data) {
          composer.message.prop('readonly', false);
          composer.message.val('');
          composer.blocker.addClass('hidden');
          counter.text(CHAR_LIMIT);
          isPosting = false;
        });
      }
    }
  });

  menu.button.on('click', function (ev) {
    menu.list.toggle();
  });

  socket.on('message', function (data) {
    render(data.chat);
  });

  auth.channel = body.find('#channel').data('channel');

  if (typeof auth.channel !== 'undefined') {
    // this code should always run on the same event loop turn that the socket is told to connect,
    // so it will always fire at least once on page load
    socket.on('connect', function() {
      socket.emit('join', {
        channel: '' + auth.channel
      });
    });
  }

  if (typeof auth.channel !== 'undefined' && navigator.getMedia) {
    var startStreaming = function() {
      gumhelper.startVideoStreaming(function (err, stream, videoElement, videoWidth, videoHeight) {
        if (err) {
          disableVideoMode();
        } else {
          var outWidth = 300;
          var outHeight = 300;
          var cropDimens = VideoShooter.getCropDimensions(
            videoWidth, videoHeight, outWidth, outHeight);
          var previewWidth = 101;
          var previewHeight = 101;
          var previewCrop = VideoShooter.getCropDimensions(
            videoWidth, videoHeight, previewWidth, previewHeight);

          $(videoElement).css({
            position: 'absolute',
            width: previewWidth + previewCrop.width + 'px',
            height: previewHeight + previewCrop.height + 'px',
            left: -Math.floor(previewCrop.width / 2) + 'px',
            top: -Math.floor(previewCrop.height / 2) + 'px'
          });

          videoWrapper.prepend(videoElement);
          videoElement.play();

          videoShooter = new VideoShooter(videoElement, outWidth, outHeight,
            videoWidth, videoHeight, cropDimens);
          composer.form.click();
        }
      });
    };

    startStreaming();

    $(window).on('orientationchange', function() {
      gumhelper.stopVideoStreaming();
      videoWrapper.empty();
      startStreaming();
    });
  } else {
    disableVideoMode();
  }

  $(document).on(pageVisibilityChange, handleVisibilityChange);

  function hasModifiersPressed(ev) {
    // modifiers exclude shift since it's often used in normal typing
    return ev.altKey || ev.ctrlKey || ev.metaKey;
  }
});
