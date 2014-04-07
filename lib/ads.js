'use strict';

exports.getAd = function (nconf, chats) {
  var AD_ARRAY = nconf.get('ads') || [];
  var idx = Math.floor(Math.random() * AD_ARRAY.length);

  chats.push({
    'key': AD_ARRAY[idx].id,
    'value': {
      'ad': true,
      'fingerprint': AD_ARRAY[idx].id,
      'message': AD_ARRAY[idx].title,
      'media': AD_ARRAY[idx].banner,
      'url': AD_ARRAY[idx].url,
      'created': Date.now()
    }
  });

  return chats;
};
