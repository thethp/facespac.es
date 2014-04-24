// Module dependencies.
module.exports = function(app, configurations, express) {
  var RedisStore = require('connect-redis')(express);

  var nconf = require('nconf');
  var maxAge = 24 * 60 * 60 * 1000 * 28;
  var csrf = express.csrf();

  nconf.argv().env().file({ file: 'local.json' });

  var nativeClients = require('../clients.json');

  // Configuration
  var checkApiKey = function (req, res, next) {
    if (req.body.apiKey && nativeClients.indexOf(req.body.apiKey) > -1) {
      req.isApiUser = true;
    }
    next();
  };

  var clientBypassCSRF = function (req, res, next) {
    if (req.isApiUser) {
      next();
    } else {
      csrf(req, res, next);
    }
  };

  app.configure(function () {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.set('view options', { layout: false });
    app.use(express.json());
    app.use(express.urlencoded());
    app.use(express.methodOverride());
    if (!process.env.NODE_ENV) {
      app.use(express.logger('dev'));
    }
    app.use(express.static(__dirname + '/public'));
    app.use(express.cookieParser());
    app.use(express.session({
      secret: nconf.get('session_secret'),
      store: new RedisStore({
        db: nconf.get('redis_db'),
        prefix: 'facespaces'
      }),
      cookie: { maxAge: maxAge }
    }));
    app.use(checkApiKey);
    app.use(clientBypassCSRF);
    app.use(function (req, res, next) {
      res.locals.session = req.session;

      if (!req.body.apiKey) {
        res.cookie('XSRF-TOKEN', req.csrfToken());
        res.locals.csrf = req.csrfToken();
      } else {
        res.locals.csrf = false;
      }

      if (!process.env.NODE_ENV) {
        res.locals.debug = true;
      } else {
        res.locals.debug = false;
      }
      res.locals.analytics = nconf.get('analytics');
      res.locals.analyticsHost = nconf.get('analyticsHost');
      next();
    });
    app.enable('trust proxy');
    app.locals.pretty = true;
    app.use(function (req, res, next) {
      // prevent framing by other sites
      res.set('X-Frame-Options', 'SAMEORIGIN');
      next();
    });
    app.use(app.router);
    app.use(function (req, res, next) {
      res.status(404);
      res.render('404', { url: req.url, layout: false });
      return;
    });
    app.use(function (req, res, next) {
      res.status(403);
      res.render('403', { url: req.url });
      return;
    });
    app.use(function (req, res, next) {
      res.status(400);
      res.render('400', { url: req.url, layout: false });
      return;
    });
  });

  app.configure('development, test', function() {
    app.use(express.errorHandler({
      dumpExceptions: true,
      showStack: true
    }));
  });

  app.configure('prod', function() {
    app.use(function(err, req, res, next) {
      res.status(err.status || 500);
      res.render(err.status || 500, { error: err });
    });
    app.use(express.errorHandler());
  });

  return app;
};
