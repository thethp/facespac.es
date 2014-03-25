define([], function () {
  'use strict';

  function VideoShooter (videoElem, outWidth, outHeight, videoWidth, videoHeight, crop) {
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    context.scale(-1, 1); // mirror flip preview back to the normal direction

    canvas.width = outWidth;
    canvas.height = outHeight;

    var sourceX = Math.floor(crop.scaledWidth / 2);
    var sourceWidth = videoWidth - crop.scaledWidth;
    var sourceY = Math.floor(crop.scaledHeight / 2);
    var sourceHeight = videoHeight - crop.scaledHeight;

    this.getShot = function () {
      context.drawImage(videoElem,
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.75);
    };
  }

  VideoShooter.getCropDimensions = function (width, height, outWidth, outHeight) {
    var result = { width: 0, height: 0, scaledWidth: 0, scaledHeight: 0 };
    if (width > height) {
      result.width = Math.round(width * (outHeight / height)) - outWidth;
      result.scaledWidth = Math.round(result.width * (height / outHeight));
    } else {
      result.height = Math.round(height * (outWidth / width)) - outHeight;
      result.scaledHeight = Math.round(result.height * (width / outWidth));
    }

    return result;
  };

  return VideoShooter;
});
